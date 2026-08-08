# Bài 1: Database Cursors — xử lý 100 triệu dòng mà không nổ RAM

Bạn viết một job xuất dữ liệu:

```python
cur.execute("SELECT * FROM events")      # bảng có 100 triệu dòng
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
   CLIENT-SIDE CURSOR (mặc định ở hầu hết thư viện)
   ════════════════════════════════════════════════
   ┌──────────┐                        ┌──────────┐
   │  CLIENT  │◀─── TẤT CẢ DỮ LIỆU ────│ DATABASE │
   │          │                        │          │
   │ 42 GB RAM│  cursor chỉ là con trỏ │ 0 trạng thái
   │          │  chạy trên MẢNG DỮ LIỆU│  lưu lại │
   └──────────┘  ĐÃ NẰM Ở CLIENT       └──────────┘

   → "Cursor" ở đây chỉ là vòng lặp trên một mảng trong bộ nhớ.
   → Database đã làm xong việc và quên bạn rồi.


   SERVER-SIDE CURSOR
   ══════════════════
   ┌──────────┐                        ┌──────────┐
   │  CLIENT  │──── FETCH 1000 ───────▶│ DATABASE │
   │          │◀─── 1000 dòng ─────────│          │
   │  4 MB RAM│                        │ GIỮ vị trí│
   │          │──── FETCH 1000 ───────▶│ và SNAPSHOT
   │          │◀─── 1000 dòng ─────────│          │
   └──────────┘                        └──────────┘

   → Database GIỮ TRẠNG THÁI: vị trí hiện tại + ảnh chụp dữ liệu
   → Client chỉ giữ 1000 dòng tại một thời điểm
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
print(f"Sau vòng lặp: {do_ram_mb():.0f} MB, {dem} dòng")
```

```text
Trước:  28 MB
Sau execute: 4218 MB, 18.4s        ← ĐÃ TẢI HẾT TRƯỚC KHI VÀO VÒNG LẶP
Sau vòng lặp: 4218 MB, 10000000 dòng
```

Hai điều đáng chú ý:

```text
   1. RAM nhảy lên 4,2 GB NGAY SAU `execute`, trước khi vòng lặp chạy.
   2. Mất 18,4 GIÂY mới thấy được dòng ĐẦU TIÊN.
```

Với bảng 100 triệu dòng thì con số đó thành 42 GB và 3 phút — và ứng dụng chết.

### Server-side — cursor có tên

```python
conn = psycopg2.connect("dbname=lab")
cur = conn.cursor(name='cur_events')      # CO TEN → SERVER-SIDE
cur.itersize = 2000                       # số dòng mỗi lần FETCH

print(f"Truoc:  {do_ram_mb():.0f} MB")
bat_dau = time.time()
cur.execute("SELECT * FROM events")
print(f"Sau execute: {do_ram_mb():.0f} MB, {time.time()-bat_dau:.2f}s")

dem = 0
for row in cur:
    dem += 1
    if dem == 1:
        print(f"Dòng đầu tiên sau: {time.time()-bat_dau:.2f}s")
print(f"Sau vòng lặp: {do_ram_mb():.0f} MB, {dem} dòng")
cur.close()
```

```text
Trước:  28 MB
Sau execute: 29 MB, 0.01s
Dòng đầu tiên sau: 0.04s           ← NGAY LẬP TỨC
Sau vòng lặp: 34 MB, 10000000 dòng
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
BEGIN;                                    -- BẮT BUỘC: cursor sống trong transaction

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
FETCH 5 FROM cur_events;      -- 5 dòng TIẾP THEO
MOVE 1000 IN cur_events;      -- nhảy qua 1000 dòng, không trả về
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
COMMIT;                    -- cursor VẪN SỐNG

FETCH 10 FROM cur_hold;    -- vẫn chạy được
CLOSE cur_hold;
```

Nghe tiện, nhưng phải biết cái giá:

```text
   Khi COMMIT, PostgreSQL phải VẬT CHẤT HOÁ toàn bộ kết quả còn lại
   vào một file tạm trên đĩa (vì ảnh chụp transaction sắp biến mất).

   → COMMIT có thể mất rất lâu
   → Tốn đĩa cho file tạm
   → Mất hết lợi ích "chỉ lấy từng phần"
```

`WITH HOLD` chỉ đáng dùng khi kết quả **nhỏ** nhưng cần đọc dần trong thời gian dài.

---

## Cái giá thật của server-side cursor

Đây là phần quan trọng nhất, và là lý do cursor không phải lời giải cho mọi thứ.

### Nó giữ một transaction mở

```text
   Cursor (không WITH HOLD) BẮT BUỘC nằm trong transaction.
   Đọc 100 triệu dòng mất 2 giờ → TRANSACTION MỞ 2 GIỜ.

   HẬU QUẢ (nhắc lại từ [phase-2] và [phase-3]):
     • Ảnh chụp của transaction đó chặn VACUUM dọn rác
       TRÊN TOÀN BỘ DATABASE
     • Bảng bị UPDATE nhiều phình lên không ngừng
     • Nếu đọc từ replica: replica TỤT LẠI hoặc truy vấn bị HUỶ
     • idle_in_transaction_session_timeout sẽ GIẾT nó
```

Kiểm tra hậu quả:

```sql
-- Transaction lâu nhất đang mở — nó chặn VACUUM
SELECT pid, now() - xact_start AS mo_bao_lau, state, left(query, 50)
FROM pg_stat_activity
WHERE xact_start IS NOT NULL
ORDER BY xact_start LIMIT 5;
```

### Nó có thể bị rò rỉ — và rò rỉ cursor làm sập database

Đây là rủi ro nghiêm trọng nhất của server-side cursor, và nó ít được nhắc tới vì nó chỉ lộ ra khi có tải thật.

```text
   Client-side cursor: dữ liệu nằm ở CLIENT.
     → client chết → bộ nhớ được thu hồi → SERVER không biết gì
     → không rò rỉ được

   Server-side cursor: SERVER giữ trạng thái.
     → client chết giữa chừng, hoặc code quên `cur.close()`
     → cursor VẪN SỐNG trên server cho tới khi kết nối đứt
     → mỗi cursor giữ: một ảnh chụp + bộ nhớ + có thể cả file tạm
```

```python
# RÒ RỈ: có ngoại lệ thì `close()` KHÔNG BAO GIỜ chạy
cur = conn.cursor(name='cur_export')
cur.execute("SELECT * FROM events")
for row in cur:
    xu_ly(row)              # ← ném ngoại lệ ở đây
cur.close()                 # ← không bao giờ tới được

# ĐÚNG: context manager đảm bảo đóng trong MỌI trường hợp
with conn.cursor(name='cur_export') as cur:
    cur.execute("SELECT * FROM events")
    for row in cur:
        xu_ly(row)
```

Vì sao nó nguy hiểm ở quy mô lớn:

```text
   1.000 client, mỗi client mở một server-side cursor và rò rỉ
     → 1.000 ảnh chụp đóng băng trên server
     → 1.000 transaction mở
     → `VACUUM` KHÔNG dọn được gì TRÊN TOÀN BỘ DATABASE
     → bảng phình không ngừng, độ dài XID tăng
     → cuối cùng: hệ thống dừng để tránh XID wraparound
```

Săn cursor bị rò rỉ:

```sql
-- Cursor đang mở trong PHIÊN hiện tại
SELECT name, statement, is_holdable, creation_time FROM pg_cursors;

-- Kết nối đang giữ transaction mở mà không làm gì — dấu hiệu rò rỉ
SELECT pid,
       now() - xact_start   AS transaction_mo,
       now() - state_change AS im_lang_bao_lau,
       state,
       left(query, 60)      AS cau_lenh_cuoi
FROM pg_stat_activity
WHERE state = 'idle in transaction'
  AND now() - state_change > interval '1 minute'
ORDER BY xact_start;
```

Phòng thủ bắt buộc khi dùng server-side cursor trong sản phẩm thật:

```sql
-- Database tự cắt kết nối bỏ quên
ALTER SYSTEM SET idle_in_transaction_session_timeout = '5min';

-- Và giới hạn thời gian một câu lệnh
ALTER SYSTEM SET statement_timeout = '30min';   -- đặt theo VAI TRÒ, xem [phase-14 bài 2]
SELECT pg_reload_conf();
```

> **Quy tắc:** server-side cursor chỉ nên dùng cho **job nền có kiểm soát**, không bao giờ cho **đường xử lý request của người dùng**. Người dùng đóng trình duyệt giữa chừng là chuyện xảy ra hàng nghìn lần mỗi ngày — và mỗi lần như vậy để lại một cursor treo.

### Nó tốn nhiều vòng mạng

```text
   10 triệu dòng, itersize = 100
     → 100.000 lần FETCH
     → 100.000 vòng mạng × 0,5 ms = 50 GIÂY chỉ để đi lại

   itersize = 10.000
     → 1.000 lần FETCH
     → 0,5 GIAY

   → itersize QUÁ NHỎ làm chậm gấp 100 lần
```

Chọn `itersize`:

```text
   Quá nhỏ (< 100)     → quá nhiều vòng mạng
   Quá lớn (> 100.000) → mất lợi ích tiết kiệm RAM
   KHUYẾN NGHỊ: 1.000 - 10.000 dòng, tuỳ kích thước dòng
```

### Kế hoạch truy vấn có thể tệ hơn

```sql
SET cursor_tuple_fraction = 0.1;    -- mặc định
```

Tham số này nói với planner: *"người dùng có thể chỉ lấy 10% kết quả rồi bỏ"*. Vì thế planner ưu tiên kế hoạch **trả về dòng đầu tiên nhanh** (`Index Scan`) thay vì kế hoạch **tổng thời gian ngắn nhất** (`Seq Scan` + `Hash Join`).

Nếu bạn chắc chắn sẽ đọc hết:

```sql
SET cursor_tuple_fraction = 1.0;    -- tối ưu cho TỔNG thời gian
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
    conn.commit()          # ← MỖI LÔ MỘT TRANSACTION NGẮN
```

```text
   ƯU so voi cursor:
     ✔ KHÔNG giữ transaction mở → không chặn VACUUM
     ✔ DỪNG được giữa chừng rồi CHẠY TIẾP từ `moc` đã lưu
     ✔ Chạy song song được (chia khoảng id cho nhiều worker)
     ✔ An toàn khi kết nối bị đứt

   NHUOC:
     ✘ Mỗi lô là một truy vấn mới → thấy dữ liệu MỚI THÊM VÀO
       (không có ảnh chụp nhất quán)
     ✘ Cần một cột có index để làm mốc
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
   10 triệu dòng:
     Cursor + ghi từng dòng :  118 s
     COPY TO STDOUT         :   14 s      → NHANH HƠN 8 LẦN
```

`COPY` nhanh hơn vì nó bỏ qua toàn bộ tầng giao thức dòng-theo-dòng và ghi thẳng luồng byte. Nếu mục tiêu chỉ là **xuất dữ liệu ra file**, đây gần như luôn là lựa chọn đúng.

---

## Cursor trong các hệ khác

### MySQL — luồng dữ liệu

```java
// JDBC: mặc định tải HẾT vào RAM
PreparedStatement st = conn.prepareStatement("SELECT * FROM events");

// Bật chế độ luồng — CẦN CẢ HAI dòng này
st.setFetchSize(Integer.MIN_VALUE);          // ← bắt buộc với MySQL
ResultSet rs = st.executeQuery();
while (rs.next()) { ... }
```

MySQL Connector/J có một đặc thù kỳ lạ: `setFetchSize(1000)` **không** bật chế độ luồng; phải dùng đúng `Integer.MIN_VALUE`. Đây là chi tiết gây rất nhiều sự cố hết RAM.

Và cảnh báo quan trọng: khi ở chế độ luồng, **kết nối đó bị chiếm hoàn toàn** — không chạy được truy vấn nào khác trên cùng kết nối cho tới khi đọc hết.

### PostgreSQL JDBC

```java
conn.setAutoCommit(false);                    // ← BẮT BUỘC, nếu không sẽ không có tác dụng
PreparedStatement st = conn.prepareStatement("SELECT * FROM events");
st.setFetchSize(1000);                        // → dùng server-side cursor
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
- Và nó **rò rỉ được**: client chết giữa chừng hoặc quên `close()` thì cursor vẫn sống trên server. Hàng nghìn cursor rò rỉ làm `VACUUM` tê liệt trên toàn database. **Chỉ dùng server-side cursor cho job nền có kiểm soát, không bao giờ cho đường xử lý request của người dùng.**
- `itersize` quá nhỏ gây hàng chục nghìn vòng mạng; khuyến nghị **1.000-10.000 dòng**.
- **`cursor_tuple_fraction`** mặc định 0.1 khiến planner tối ưu cho "dòng đầu tiên nhanh". Đặt `1.0` nếu chắc chắn đọc hết.
- Với **job chạy dài**, **keyset pagination thường tốt hơn cursor**: không giữ transaction, dừng và tiếp được, chạy song song được — đổi lại mất ảnh chụp nhất quán.
- Nếu mục tiêu chỉ là **xuất ra file**, **`COPY TO STDOUT` nhanh hơn cursor khoảng 8 lần**.

**Bài kế tiếp** → [Bài 2: Cursor nâng cao — Patterns và thực chiến](02-cursor-nang-cao-va-use-cases.md)
