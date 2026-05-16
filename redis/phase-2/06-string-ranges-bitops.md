# Bài 6: String ranges và Bitmap — sức mạnh ẩn của Redis String

Nhìn qua, `GETRANGE`/`SETRANGE` trông vô dụng. "Đọc/ghi vài ký tự ở giữa một string làm gì?". Nhưng chính những lệnh nhỏ này biến String thành **2 cấu trúc cực mạnh**:

1. **Fixed-layout encoding** — gói nhiều field vào một string ngắn, đọc/ghi từng "ô".
2. **Bitmap** — coi string như chuỗi bit, đếm/lưu hàng triệu trạng thái nhỏ.

## Phần 1 — STRLEN, APPEND, GETRANGE, SETRANGE

### STRLEN — độ dài (theo byte) của string

```text
SET name "Alice"
STRLEN name
(integer) 5

SET name "Việt"
STRLEN name
(integer) 5     # 4 ký tự nhưng "ệ" là 2 byte UTF-8 → 5 byte
```

O(1) — Redis lưu sẵn độ dài.

### APPEND — nối thêm vào cuối

```text
SET msg "Hello"
APPEND msg " World"
(integer) 11        # độ dài mới

GET msg
"Hello World"
```

- Nếu key chưa tồn tại, APPEND tương đương SET.
- O(1) amortized.

**Use case**: gom log nhỏ, prepend không có nhưng append nối thêm event ngắn.

### GETRANGE — đọc một đoạn từ string

```text
GETRANGE key start end
```

- `start`, `end` là **index theo byte**, 0-based, **bao gồm** cả hai đầu.
- Hỗ trợ index âm: `-1` là byte cuối.

```text
SET name "Hello World"
GETRANGE name 0 4      # "Hello"
GETRANGE name 6 10     # "World"
GETRANGE name 6 -1     # "World" (từ byte 6 đến cuối)
GETRANGE name -5 -1    # "World" (5 byte cuối)
```

> Tên cũ là `SUBSTR`, alias còn tồn tại nhưng deprecated. Dùng `GETRANGE`.

### SETRANGE — ghi đè một đoạn

```text
SETRANGE key offset value
```

Ghi `value` lên vị trí `offset` của string đã có. Nếu string ngắn hơn offset, padding bằng `\x00`.

```text
SET model "Toyota"
SETRANGE model 2 "LU"
(integer) 6          # độ dài kết quả

GET model
"ToLUta"             # "yo" bị thay bởi "LU"
```

```text
DEL k
SETRANGE k 5 "Hi"
(integer) 7          # tạo string 7 byte: "\x00\x00\x00\x00\x00Hi"
GETRANGE k 0 -1
"\x00\x00\x00\x00\x00Hi"
```

## Phần 2 — fixed-layout encoding (bài học từ khoá Stephen)

### Bối cảnh

Bạn có 1 triệu sản phẩm trong DB với 3 thuộc tính:

| id | type | color | material |
|---|---|---|---|
| 1 | couch | red | wood |
| 2 | table | green | leather |
| 3 | chair | brown | plastic |
| ... | ... | ... | ... |

Số giá trị khả dĩ rất hạn chế:
- Type: 10 loại
- Color: 10 màu  
- Material: 5 chất liệu

→ Có thể **encode** mỗi thuộc tính bằng 1 ký tự:

```text
type:    a=couch, b=table, c=chair, d=desk, e=shelf, ...
color:   a=red,   b=green, c=blue,  d=yellow, e=brown, ...
material: a=wood, b=plastic, c=metal, d=leather, e=glass
```

Mỗi item ↔ chuỗi 3 ký tự:

```text
item:1  →  "aae"   (couch, red, wood)
item:2  →  "bbd"   (table, green, leather)
item:3  →  "cec"   (chair, brown, metal)
```

### Các thao tác CRUD với fixed-layout

**Đọc toàn bộ properties của 1 item**:
```text
GET item:1
"aae"
```

**Đọc 1 property** (type ở index 0):
```text
GETRANGE item:1 0 0    # "a"
GETRANGE item:1 1 1    # "a"  (color)
GETRANGE item:1 2 2    # "e"  (material)
```

**Update 1 property** (đổi color của item 1 sang blue = "c"):
```text
SETRANGE item:1 1 "c"
GET item:1     # "ace"
```

**Update toàn bộ properties**:
```text
SET item:1 "bdb"
```

**Đọc/tạo nhiều item một lúc**:
```text
MGET item:1 item:2 item:3
MSET item:4 "aaa" item:5 "bbb"
```

### Tại sao đáng quan tâm?

1. **Memory cực gọn**: 3 byte/item × 1 triệu item = 3 MB. So với JSON `{"type":"couch","color":"red","material":"wood"}` ~50 byte = 50 MB.
2. **Thao tác O(1)**: cả 4 use case (đọc/sửa 1 property, đọc/sửa nhiều property, đọc/tạo nhiều item) đều là lệnh atomic, single-RTT.
3. **Atomic update field**: SETRANGE 1 field không ảnh hưởng field khác.

### Hạn chế / khi nào KHÔNG dùng

- Bảng giá trị thay đổi (vd thêm 1 màu mới) → encoding có thể chật, cần dài thêm.
- Khi value variable-length (vd tên user) → fixed-layout không phù hợp.
- Cần "tìm tất cả item có color = blue" → string layout không index → phải scan. Trong trường hợp đó dùng Hash + secondary index hoặc RediSearch.
- Khi data có lược đồ phức tạp → dùng Hash hoặc RedisJSON cho hợp lý.

→ Fixed-layout đắc địa khi: **schema cố định, lookup theo key, cần memory siêu tiết kiệm, throughput cực cao**.

## Phần 3 — Bitmap operations (BITCOUNT, SETBIT, GETBIT, BITOP)

Đây là **một góc sâu hơn** dùng String như chuỗi bit. Một string 1 KB chứa 8192 bit độc lập.

### SETBIT — đặt 1 bit

```text
SETBIT key offset value
```

- `offset`: index bit, 0-based (bit 0 là MSB của byte 0).
- `value`: 0 hoặc 1.

```text
SETBIT visit:2025-01-15 1001 1     # user id 1001 đã ghé ngày 15/01
(integer) 0                         # giá trị bit cũ là 0
```

Nếu string chưa đủ dài, tự nới rộng và pad bằng 0.

### GETBIT — đọc 1 bit

```text
GETBIT visit:2025-01-15 1001
(integer) 1
```

### BITCOUNT — đếm số bit 1

```text
BITCOUNT key [start end [BYTE|BIT]]
```

```text
BITCOUNT visit:2025-01-15
(integer) 12345     # 12,345 user đã ghé hôm nay
```

### Use case 1: Daily active users (DAU)

Mỗi user có một id ổn định 1..N. Mỗi ngày, một bitmap `visit:YYYY-MM-DD`:

```text
# Khi user X login hôm 15/01:
SETBIT visit:2025-01-15 <X> 1

# Số DAU:
BITCOUNT visit:2025-01-15

# User X có hoạt động hôm đó?
GETBIT visit:2025-01-15 <X>
```

**Memory**: 10 triệu user → bitmap ~1.25 MB/ngày. So với set 10 triệu int (mỗi int ~8 byte với hash overhead) sẽ tốn hàng trăm MB.

### Use case 2: Phép giao/hợp các ngày — BITOP

```text
BITOP AND active_3days visit:2025-01-13 visit:2025-01-14 visit:2025-01-15
BITCOUNT active_3days
# → số user ghé CẢ 3 ngày
```

`BITOP` hỗ trợ: AND, OR, XOR, NOT.

**Hợp 7 ngày qua = WAU (weekly active users)**:
```text
BITOP OR wau:2025-W03 visit:2025-01-13 visit:2025-01-14 ... visit:2025-01-19
BITCOUNT wau:2025-W03
```

### Use case 3: Feature flag theo user

User N có feature X bật không?

```text
SETBIT feature:beta:enabled 1001 1
GETBIT feature:beta:enabled 1001    # 1
```

Nếu chỉ 5% user bật beta, vẫn dùng bitmap toàn bộ là gọn nhất.

### Cảnh báo: BITCOUNT trên bitmap dày là O(N)

`BITCOUNT` quét toàn bitmap → có thể chậm với key lớn (vài MB). Với bitmap 100 MB, BITCOUNT có thể chặn 50 ms+. Cách hạn chế:

- Đếm từng đoạn nhỏ: `BITCOUNT key 0 999 BYTE` (đếm byte 0-999).
- Giữ một counter rời `dau_count:2025-01-15` cập nhật mỗi SETBIT mới (kèm `INCR` nếu trước đó là 0).
- Dùng **HyperLogLog** (`PFADD`/`PFCOUNT`) khi cần count xấp xỉ rất nhanh.

## Phần 4 — BITPOS, BITFIELD (nâng cao)

### BITPOS — tìm bit 0/1 đầu tiên

```text
BITPOS key bit [start [end [BYTE|BIT]]]
```

```text
BITPOS visit:2025-01-15 1     # vị trí user đầu tiên đã ghé
```

Use case: tìm slot trống đầu tiên trong một pool.

### BITFIELD — multi-counter trong một string

Đỉnh cao của String. Gói nhiều counter nhỏ (mỗi cái 4/8/16/24 bit) vào một key:

```text
BITFIELD mykey SET u8 #0 100 INCRBY u8 #1 1 GET u8 #2
```

- `u8 #0`: unsigned 8-bit, slot index 0 (byte 0).
- `i16`: signed 16-bit.
- `#N`: index theo size; raw offset cũng được.

Use case: 1 string chứa 1000 counter `u8` → 1 KB cho 1000 mục đếm. Cực gọn cho metric per-user/per-item.

## Khi nào dùng cấu trúc khác thay vì String + bit/range tricks?

| Bạn muốn | Dùng |
|---|---|
| Field rõ ràng có tên (user.name, user.age) | **Hash** |
| Tập không trùng (member của community X) | **Set** |
| Rank theo score | **Sorted Set** |
| Đếm xấp xỉ unique rất nhanh, sai số chấp nhận được | **HyperLogLog** |
| Sự kiện chuỗi thời gian | **Stream** |
| Document JSON với truy vấn nested | **RedisJSON + RediSearch** |
| Schema cố định, value nhỏ, query nhiều | **String fixed-layout + GETRANGE/SETRANGE** |
| Trạng thái boolean trên hàng triệu user/item | **Bitmap** |

## Tóm tắt bài 6

- `APPEND`/`STRLEN`/`GETRANGE`/`SETRANGE` cho phép thao tác từng phần của String — biến String thành mảng byte chỉnh được tại offset.
- **Fixed-layout encoding** cho schema cố định: tiết kiệm memory 10-20 lần so với JSON, atomic per-field.
- **Bitmap** = String dùng theo bit: DAU/WAU/MAU, feature flag, presence — cực kỳ tiết kiệm.
- **BITOP** cho phép intersect/union nhiều bitmap → analytics on the fly.
- BITCOUNT có thể chậm với key lớn; cân nhắc counter rời hoặc HyperLogLog cho count xấp xỉ.

**Bài kế tiếp** → [Bài 7: Làm việc với số — INCR, DECR, INCRBY và concurrency](07-lam-viec-voi-so.md)
