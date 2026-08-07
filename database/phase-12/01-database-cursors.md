# Bài 1: Database Cursors — xử lý 100 triệu dòng mà không nổ RAM

Bạn viết một job xuất dữ liệu:

```python
cur.execute("SELECT * FROM events")      # bang co 100 trieu dong
for row in cur:
    ghi_ra_file(row)
```

Ứng dụng chết trước khi ghi được dòng nào:

```text
   MemoryError: Unable to allocate 42.7 GiB for an array
```

Vòng lặp `for row in cur` trông như đang xử lý từng dòng. Thực tế **toàn bộ 100 triệu dòng đã được tải vào RAM** trước khi vòng lặp bắt đầu.

Bài này giải thích vì sao, và cho bạn công cụ để xử lý dữ liệu lớn hơn RAM: **con trỏ** (*cursor*).

## Cursor là gì

**Cursor** là một **con trỏ giữ vị trí** trong tập kết quả, cho phép lấy dữ liệu **từng phần** thay vì tất cả một lúc.

```text
   KHÔNG CÓ CURSOR                      CÓ CURSOR
   ═══════════════                      ═════════
   ┌──────────────────────┐             ┌──────────────────────┐
   │  100 triệu dòng      │             │  100 triệu dòng      │
   │  ↓ TẤT CẢ            │             │  ↓ 1.000 dòng        │
   │  RAM ứng dụng: 42 GB │             │  RAM ứng dụng: 4 MB  │
   └──────────────────────┘             │  ↑ con trỏ ở dòng    │
                                        │    2.001.000          │
                                        └──────────────────────┘
```

Ẩn dụ: đọc một quyển sách 10.000 trang. Không ai xé cả quyển ra bày lên bàn — bạn dùng **một cái kẹp sách** đánh dấu đang đọc tới đâu, và chỉ mở vài trang một lúc.

---

## Hai loại cursor

Đây là phân biệt quan trọng nhất, và cũng là chỗ hay bị hiểu sai.

```text
   CLIENT-SIDE CURSOR (mac dinh o hau het thu vien)
   ════════════════════════════════════════════════
   ┌──────────┐                        ┌──────────┐
   │  CLIENT  │◀─── TAT CA DU LIEU ────│ DATABASE │
   │          │                        │          │
   │ 42 GB RAM│  cursor chi la con tro │ 0 trang thai
   │          │  chay tren MANG DU LIEU│  luu lai │
   └──────────┘  DA NAM O CLIENT       └──────────┘

   → "Cursor" o day chi la vong lap tren mot mang trong bo nho.
   → Database da lam xong viec va quen ban roi.


   SERVER-SIDE CURSOR
   ══════════════════
   ┌──────────┐                        ┌──────────┐
   │  CLIENT  │──── FETCH 1000 ───────▶│ DATABASE │
   │          │◀─── 1000 dong ─────────│          │
   │  4 MB RAM│                        │ GIU vi tri│
   │          │──── FETCH 1000 ───────▶│ va SNAPSHOT
   │          │◀─── 1000 dong ─────────│          │
   └──────────┘                        └──────────┘

   → Database GIU TRANG THAI: vi tri hien tai + anh chup du lieu
   → Client chi giu 1000 dong tai mot thoi diem
```

| | Client-side | Server-side |
|---|---|---|
| RAM ở client | **Toàn bộ kết quả** | Chỉ một lô |
| Trạng thái ở server | Không | **Có** — vị trí + ảnh chụp |
| Vòng mạng | 1 | **Nhiều** (mỗi lô một lần) |
| Thấy dòng đầu tiên khi nào | Sau khi tải hết | **Gần như ngay** |
| Huỷ giữa chừng | Đã tốn công tải hết rồi | Rẻ — chỉ cần đóng cursor |
| Giữ transaction mở | Không | **Có** ← đây là cái giá |
| Hợp với | Kết quả nhỏ (< vài nghìn dòng) | Kết quả rất lớn |

---

## Đo bằng mắt

```sql
CREATE TABLE events (
    id      BIGSERIAL PRIMARY KEY,
    user_id BIGINT,
    payload TEXT
);
INSERT INTO events (user_id, payload)
SELECT (random()*100000)::BIGINT, repeat('x', 200)
FROM generate_series(1, 10000000);
```

### Client-side — cách mặc định

```python
import psycopg2, os, time

def do_ram_mb():
    with open('/proc/self/status') as f:
        for line in f:
            if line.startswith('VmRSS'):
                return int(line.split()[1]) / 1024

conn = psycopg2.connect("dbname=lab")

print(f"Truoc:  {do_ram_mb():.0f} MB")
bat_dau = time.time()

cur = conn.cursor()                       # CURSOR PHIA CLIENT
cur.execute("SELECT * FROM events")
print(f"Sau execute: {do_ram_mb():.0f} MB, {time.time()-bat_dau:.1f}s")

dem = 0
for row in cur:
    dem += 1
print(f"Sau vong lap: {do_ram_mb():.0f} MB, {dem} dong")
```

```text
Truoc:  28 MB
Sau execute: 4218 MB, 18.4s        ← DA TAI HET TRUOC KHI VAO VONG LAP
Sau vong lap: 4218 MB, 10000000 dong
```

Hai điều đáng chú ý:

```text
   1. RAM nhay len 4,2 GB NGAY SAU `execute`, truoc khi vong lap chay.
   2. Mat 18,4 GIAY moi thay duoc dong DAU TIEN.
```

Với bảng 100 triệu dòng thì con số đó thành 42 GB và 3 phút — và ứng dụng chết.

### Server-side — cursor có tên

```python
conn = psycopg2.connect("dbname=lab")
cur = conn.cursor(name='cur_events')      # CO TEN → SERVER-SIDE
cur.itersize = 2000                       # so dong moi lan FETCH

print(f"Truoc:  {do_ram_mb():.0f} MB")
bat_dau = time.time()
cur.execute("SELECT * FROM events")
print(f"Sau execute: {do_ram_mb():.0f} MB, {time.time()-bat_dau:.2f}s")

dem = 0
for row in cur:
    dem += 1
    if dem == 1:
        print(f"Dong dau tien sau: {time.time()-bat_dau:.2f}s")
print(f"Sau vong lap: {do_ram_mb():.0f} MB, {dem} dong")
cur.close()
```

```text
Truoc:  28 MB
Sau execute: 29 MB, 0.01s
Dong dau tien sau: 0.04s           ← NGAY LAP TUC
Sau vong lap: 34 MB, 10000000 dong
```

```text
   RAM       : 4.218 MB  →  34 MB      ÍT HƠN 124 LẦN
   Dòng đầu  :   18,4 s  →  0,04 s     NHANH HƠN 460 LẦN
```

Trong psycopg2, khác biệt giữa hai thế giới chỉ là **một tham số `name`**. Đó là chi tiết dễ bỏ sót nhất và cũng đắt giá nhất.

---

## Cursor thuần SQL

Cursor không phải khái niệm của thư viện — nó là lệnh SQL:

```sql
BEGIN;                                    -- BAT BUOC: cursor song trong transaction

DECLARE cur_events CURSOR FOR
    SELECT id, user_id, payload FROM events WHERE user_id < 1000;

FETCH 5 FROM cur_events;
```

```text
 id | user_id |            payload
----+---------+--------------------------------
  7 |     412 | xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 19 |     883 | xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 24 |     117 | xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 31 |     902 | xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 44 |     556 | xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

```sql
FETCH 5 FROM cur_events;      -- 5 dong TIEP THEO
MOVE 1000 IN cur_events;      -- nhay qua 1000 dong, khong tra ve
FETCH 3 FROM cur_events;

CLOSE cur_events;
COMMIT;
```

Xem cursor đang mở:

```sql
SELECT name, statement, is_holdable, creation_time FROM pg_cursors;
```

```text
    name     |               statement                | is_holdable
-------------+----------------------------------------+-------------
 cur_events  | SELECT id, user_id, payload FROM ...    | f
```

### `WITH HOLD` — sống qua `COMMIT`

```sql
BEGIN;
DECLARE cur_hold CURSOR WITH HOLD FOR SELECT * FROM events;
COMMIT;                    -- cursor VAN SONG

FETCH 10 FROM cur_hold;    -- van chay duoc
CLOSE cur_hold;
```

Nghe tiện, nhưng phải biết cái giá:

```text
   Khi COMMIT, PostgreSQL phai VAT CHAT HOA toan bo ket qua con lai
   vao mot file tam tren dia (vi anh chup transaction sap bien mat).

   → COMMIT co the mat rat lau
   → Ton dia cho file tam
   → Mat het loi ich "chi lay tung phan"
```

`WITH HOLD` chỉ đáng dùng khi kết quả **nhỏ** nhưng cần đọc dần trong thời gian dài.

---

## Cái giá thật của server-side cursor

Đây là phần quan trọng nhất, và là lý do cursor không phải lời giải cho mọi thứ.

### Nó giữ một transaction mở

```text
   Cursor (khong WITH HOLD) BAT BUOC nam trong transaction.
   Doc 100 trieu dong mat 2 gio → TRANSACTION MO 2 GIO.

   HAU QUA (nhac lai tu [phase-2] va [phase-3]):
     • Anh chup cua transaction do chan VACUUM don rac
       TREN TOAN BO DATABASE
     • Bang bi UPDATE nhieu phinh len khong ngung
     • Neu doc tu replica: replica TUT LAI hoac truy van bi HUY
     • idle_in_transaction_session_timeout se GIET no
```

Kiểm tra hậu quả:

```sql
-- Transaction lau nhat dang mo — no chan VACUUM
SELECT pid, now() - xact_start AS mo_bao_lau, state, left(query, 50)
FROM pg_stat_activity
WHERE xact_start IS NOT NULL
ORDER BY xact_start LIMIT 5;
```

### Nó tốn nhiều vòng mạng

```text
   10 trieu dong, itersize = 100
     → 100.000 lan FETCH
     → 100.000 vong mang × 0,5 ms = 50 GIAY chi de di lai

   itersize = 10.000
     → 1.000 lan FETCH
     → 0,5 GIAY

   → itersize QUA NHO lam cham gap 100 lan
```

Chọn `itersize`:

```text
   Qua nho (< 100)     → qua nhieu vong mang
   Qua lon (> 100.000) → mat loi ich tiet kiem RAM
   KHUYEN NGHI: 1.000 - 10.000 dong, tuy kich thuoc dong
```

### Kế hoạch truy vấn có thể tệ hơn

```sql
SET cursor_tuple_fraction = 0.1;    -- mac dinh
```

Tham số này nói với planner: *"người dùng có thể chỉ lấy 10% kết quả rồi bỏ"*. Vì thế planner ưu tiên kế hoạch **trả về dòng đầu tiên nhanh** (`Index Scan`) thay vì kế hoạch **tổng thời gian ngắn nhất** (`Seq Scan` + `Hash Join`).

Nếu bạn chắc chắn sẽ đọc hết:

```sql
SET cursor_tuple_fraction = 1.0;    -- toi uu cho TONG thoi gian
```

Đây là một trong những chỉnh sửa ít người biết nhưng có thể tăng tốc job xuất dữ liệu vài lần.

---

## Bốn cách xử lý dữ liệu lớn — so sánh

| Cách | RAM | Giữ transaction | Tốc độ | Dùng khi |
|---|---|---|---|---|
| **Tải hết vào RAM** | Rất cao | Không | Nhanh nếu vừa RAM | Kết quả nhỏ |
| **Server-side cursor** | Thấp | **Có** ⚠ | Vừa | Đọc một lần, xuyên suốt |
| **Phân trang keyset** | Thấp | **Không** ✔ | Vừa | Job dài, có thể dừng và tiếp |
| **`COPY TO`** | Rất thấp | Ngắn | **Nhanh nhất** | Xuất toàn bộ ra file |

### Keyset — thường tốt hơn cursor cho job dài

```python
moc = 0
while True:
    cur.execute("""SELECT id, user_id, payload FROM events
                    WHERE id > %s ORDER BY id LIMIT 10000""", (moc,))
    rows = cur.fetchall()
    if not rows:
        break
    for r in rows:
        xu_ly(r)
    moc = rows[-1][0]
    conn.commit()          # ← MOI LO MOT TRANSACTION NGAN
```

```text
   ƯU so voi cursor:
     ✔ KHONG giu transaction mo → khong chan VACUUM
     ✔ DUNG duoc giua chung roi CHAY TIEP tu `moc` da luu
     ✔ Chay song song duoc (chia khoang id cho nhieu worker)
     ✔ An toan khi ket noi bi dut

   NHUOC:
     ✘ Moi lo la mot truy van moi → thay du lieu MOI THEM VAO
       (khong co anh chup nhat quan)
     ✘ Can mot cot co index de lam moc
```

Dòng nhược điểm đầu tiên chính là điểm đánh đổi: **cursor cho ảnh chụp nhất quán, keyset thì không**. Nếu bạn cần "trạng thái tại một thời điểm" thì phải dùng cursor.

### `COPY` — nhanh nhất để xuất

```sql
COPY (SELECT * FROM events WHERE user_id < 1000) TO STDOUT WITH CSV;
```

```python
with open('/tmp/out.csv', 'w') as f:
    cur.copy_expert("COPY (SELECT * FROM events) TO STDOUT WITH CSV", f)
```

```text
   10 trieu dong:
     Cursor + ghi tung dong :  118 s
     COPY TO STDOUT         :   14 s      → NHANH HON 8 LAN
```

`COPY` nhanh hơn vì nó bỏ qua toàn bộ tầng giao thức dòng-theo-dòng và ghi thẳng luồng byte. Nếu mục tiêu chỉ là **xuất dữ liệu ra file**, đây gần như luôn là lựa chọn đúng.

---

## Cursor trong các hệ khác

### MySQL — luồng dữ liệu

```java
// JDBC: mac dinh tai HET vao RAM
PreparedStatement st = conn.prepareStatement("SELECT * FROM events");

// Bat che do luong — CAN CA HAI dong nay
st.setFetchSize(Integer.MIN_VALUE);          // ← bat buoc voi MySQL
ResultSet rs = st.executeQuery();
while (rs.next()) { ... }
```

MySQL Connector/J có một đặc thù kỳ lạ: `setFetchSize(1000)` **không** bật chế độ luồng; phải dùng đúng `Integer.MIN_VALUE`. Đây là chi tiết gây rất nhiều sự cố hết RAM.

Và cảnh báo quan trọng: khi ở chế độ luồng, **kết nối đó bị chiếm hoàn toàn** — không chạy được truy vấn nào khác trên cùng kết nối cho tới khi đọc hết.

### PostgreSQL JDBC

```java
conn.setAutoCommit(false);                    // ← BAT BUOC, neu khong se khong co tac dung
PreparedStatement st = conn.prepareStatement("SELECT * FROM events");
st.setFetchSize(1000);                        // → dung server-side cursor
ResultSet rs = st.executeQuery();
```

Dòng `setAutoCommit(false)` là điều kiện bắt buộc mà tài liệu ít nhấn mạnh: ở chế độ autocommit, `setFetchSize` **bị bỏ qua hoàn toàn**.

### Bảng đối chiếu driver

| Ngôn ngữ / driver | Mặc định | Bật server-side cursor |
|---|---|---|
| Python psycopg2 | Client-side | `conn.cursor(name='x')` |
| Python psycopg3 | Client-side | `conn.cursor(name='x')` hoặc `client_side_binding` |
| Java JDBC (PG) | Client-side | `setAutoCommit(false)` + `setFetchSize(n)` |
| Java JDBC (MySQL) | Client-side | `setFetchSize(Integer.MIN_VALUE)` |
| Node `pg` | Client-side | gói `pg-cursor` hoặc `pg-query-stream` |
| Go `pgx` | **Luồng sẵn** | Mặc định đã đúng |
| Ruby `pg` | Client-side | `conn.send_query` + `get_result` |

Cột giữa cho thấy một sự thật: **gần như mọi driver mặc định tải hết vào RAM**. Đó là lựa chọn hợp lý cho 99% truy vấn, và là bẫy cho 1% còn lại.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Tưởng `for row in cur` là xử lý từng dòng | Đã tải hết vào RAM trước khi vòng lặp chạy | Dùng cursor có tên / `setFetchSize` |
| Quên `conn.setAutoCommit(false)` với PG JDBC | `setFetchSize` bị bỏ qua hoàn toàn | Luôn tắt autocommit trước |
| Dùng `setFetchSize(1000)` với MySQL | Không bật chế độ luồng | Phải là `Integer.MIN_VALUE` |
| Mở cursor rồi xử lý mỗi dòng mất 100 ms | Transaction mở nhiều giờ → chặn `VACUUM` toàn database | Keyset pagination với commit từng lô |
| `itersize` quá nhỏ | Hàng chục nghìn vòng mạng, chậm gấp trăm lần | 1.000-10.000 dòng |
| Dùng `WITH HOLD` cho kết quả lớn | `COMMIT` vật chất hoá cả kết quả ra file tạm | Chỉ dùng cho kết quả nhỏ |
| Dùng cursor để xuất file | Chậm hơn `COPY` khoảng 8 lần | `COPY TO STDOUT` |
| Chạy truy vấn khác trên cùng kết nối đang luồng (MySQL) | Lỗi hoặc treo | Dùng kết nối riêng |

## Tóm tắt bài 1

- **Gần như mọi driver mặc định tải toàn bộ kết quả vào RAM.** Vòng lặp `for row in cur` chỉ là duyệt một mảng đã nằm sẵn trong bộ nhớ.
- Đo thật trên 10 triệu dòng: client-side **4.218 MB / 18,4 giây** để thấy dòng đầu; server-side **34 MB / 0,04 giây** — ít RAM hơn **124 lần**, thấy dòng đầu nhanh hơn **460 lần**.
- Trong psycopg2, khác biệt chỉ là **một tham số `name`**. Trong JDBC PostgreSQL là **`setAutoCommit(false)` + `setFetchSize`**. Trong MySQL là **`setFetchSize(Integer.MIN_VALUE)`**.
- Cái giá thật của server-side cursor: **nó giữ một transaction mở** — chặn `VACUUM` trên toàn database, làm phình bảng, và làm replica tụt lại.
- `itersize` quá nhỏ gây hàng chục nghìn vòng mạng; khuyến nghị **1.000-10.000 dòng**.
- **`cursor_tuple_fraction`** mặc định 0.1 khiến planner tối ưu cho "dòng đầu tiên nhanh". Đặt `1.0` nếu chắc chắn đọc hết.
- Với **job chạy dài**, **keyset pagination thường tốt hơn cursor**: không giữ transaction, dừng và tiếp được, chạy song song được — đổi lại mất ảnh chụp nhất quán.
- Nếu mục tiêu chỉ là **xuất ra file**, **`COPY TO STDOUT` nhanh hơn cursor khoảng 8 lần**.

**Bài kế tiếp** → [Bài 2: Cursor nâng cao — Patterns và thực chiến](02-cursor-nang-cao-va-use-cases.md)
