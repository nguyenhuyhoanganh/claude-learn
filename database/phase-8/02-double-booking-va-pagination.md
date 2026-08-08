# Bài 2: Double Booking và Pagination — hai bài toán kinh điển

Hai bài toán trong bài này xuất hiện ở gần như mọi ứng dụng, và cả hai đều có một điểm chung: **giải pháp trực giác nhất là giải pháp sai**.

- **Đặt trùng chỗ**: `SELECT` kiểm tra rồi `UPDATE` — nghe hợp lý, nhưng hai người vẫn nhận cùng một ghế.
- **Phân trang**: `LIMIT 10 OFFSET 100000` — nghe hợp lý, nhưng chạy 620 mili-giây thay vì 0,2.

---

# Phần I — Đặt trùng chỗ (Double Booking)

## Tái hiện lỗi

```sql
CREATE TABLE seats (
    id        INT PRIMARY KEY,
    is_booked BOOLEAN NOT NULL DEFAULT false,
    name      TEXT
);
INSERT INTO seats SELECT i, false, NULL FROM generate_series(1, 20) AS i;
```

Mở hai phiên psql:

| Bước | Phiên A (Hùng) | Phiên B (Minh) |
|---|---|---|
| 1 | `BEGIN;` | `BEGIN;` |
| 2 | `SELECT * FROM seats WHERE id=13;` → `is_booked = false` ✔ | |
| 3 | | `SELECT * FROM seats WHERE id=13;` → `is_booked = false` ✔ |
| 4 | `UPDATE seats SET is_booked=true, name='Hung' WHERE id=13;` | |
| 5 | | `UPDATE seats SET is_booked=true, name='Minh' WHERE id=13;` *(treo, chờ A)* |
| 6 | `COMMIT;` | |
| 7 | | *(hết chờ, ghi đè thành công)* `COMMIT;` |

```sql
SELECT * FROM seats WHERE id = 13;
```

```text
 id | is_booked | name
----+-----------+------
 13 | t         | Minh
```

**Hùng đã trả tiền, đã nhận email xác nhận, nhưng ghế thuộc về Minh.**

Điểm mấu chốt nằm ở **khe hở giữa bước 2 và bước 4**:

```text
   t2          t3          t4          t5
   │           │           │           │
   A: ĐỌC ─────────────────▶ GHI
              B: ĐỌC ─────────────────▶ GHI
              ▲
        KHE HỞ: giữa lúc A đọc và lúc A ghi,
        B đã kịp đọc giá trị cũ.
        Quyết định của B dựa trên dữ liệu ĐÃ LỖI THỜI.
```

Đây chính là hiện tượng **lost update** ở [phase-2 bài 3](../phase-2/03-isolation-va-read-phenomena.md), nhìn từ góc nghiệp vụ.

## Bốn cách chữa

### Cách 1 — Khoá bi quan: `SELECT ... FOR UPDATE`

Đóng khe hở bằng cách khoá dòng **ngay khi đọc**:

| Bước | Phiên A | Phiên B |
|---|---|---|
| 1 | `BEGIN;` | `BEGIN;` |
| 2 | `SELECT * FROM seats WHERE id=14 FOR UPDATE;` → 🔒 | |
| 3 | | `SELECT * FROM seats WHERE id=14 FOR UPDATE;` *(treo ngay)* |
| 4 | `UPDATE ... name='Hung' WHERE id=14;` | |
| 5 | `COMMIT;` → 🔓 | |
| 6 | | *(hết chờ)* đọc lại → `is_booked = true` → **từ chối** |

Code ứng dụng:

```python
with conn:
    cur.execute("SELECT is_booked FROM seats WHERE id = %s FOR UPDATE", (seat_id,))
    (da_dat,) = cur.fetchone()
    if da_dat:
        raise GheDaCoNguoi()                      # B rơi vào đây
    cur.execute("UPDATE seats SET is_booked=true, name=%s WHERE id=%s",
                (ten, seat_id))
```

Đây là **khoá hai pha** ở [bài 1](01-shared-lock-va-exclusive-lock.md): pha mở rộng ở bước 2, pha thu hẹp ở `COMMIT`.

| Ưu | Nhược |
|---|---|
| Đơn giản, dễ hiểu, dễ đúng | Người thứ hai **phải chờ** |
| Không cần thử lại | Với ghế "hot", hàng đợi chờ có thể rất dài |
| | Nếu quên `FOR UPDATE` ở một chỗ là lỗ hổng quay lại |

### Cách 2 — Cập nhật có điều kiện (một câu lệnh)

Không đọc trước, để chính câu `UPDATE` làm luôn việc kiểm tra:

```sql
UPDATE seats
   SET is_booked = true, name = 'Hung'
 WHERE id = 13
   AND is_booked = false            -- ← ĐIỀU KIỆN NẰM TRONG CHÍNH CÂU LỆNH
RETURNING id;
```

```python
cur.execute("""UPDATE seats SET is_booked=true, name=%s
               WHERE id=%s AND is_booked=false RETURNING id""",
            (ten, seat_id))
if cur.rowcount == 0:
    raise GheDaCoNguoi()
```

Vì sao an toàn: câu `UPDATE` **tự khoá dòng và tự đọc giá trị mới nhất**. Không có khe hở nào giữa đọc và ghi — chúng là **một** thao tác.

```text
   A: UPDATE ... WHERE is_booked=false   → khoá dòng, thấy false → ghi → 1 dòng
   B: UPDATE ... WHERE is_booked=false   → CHO A
                                          → sau khi A commit, đọc lại: true
                                          → điều kiện KHÔNG khớp → 0 dòng
```

| Ưu | Nhược |
|---|---|
| **Một lần gọi mạng** thay vì hai | Không kiểm tra được logic nghiệp vụ phức tạp |
| Nhanh nhất trong bốn cách | Phải nhớ kiểm tra `rowcount` |
| Không thể quên khoá | |

Đây là cách **nên dùng mặc định** cho các trường hợp đơn giản.

### Cách 3 — Khoá lạc quan bằng cột phiên bản

```sql
ALTER TABLE seats ADD COLUMN version INT NOT NULL DEFAULT 0;
```

```python
# Đọc
cur.execute("SELECT is_booked, version FROM seats WHERE id=%s", (seat_id,))
da_dat, phien_ban = cur.fetchone()
if da_dat:
    raise GheDaCoNguoi()

# ... có thể có logic nghiệp vụ phức tạp ở đây, không giữ khoá nào ...

# Ghi: chỉ thành công nếu KHÔNG AI sửa trong lúc đó
cur.execute("""UPDATE seats SET is_booked=true, name=%s, version=version+1
               WHERE id=%s AND version=%s""", (ten, seat_id, phien_ban))
if cur.rowcount == 0:
    raise XungDotPhienBan()      # → thử lại từ đầu
```

| Ưu | Nhược |
|---|---|
| **Không ai phải chờ** | Phải viết vòng lặp thử lại |
| Cho phép logic nghiệp vụ dài giữa đọc và ghi | Tệ khi tranh chấp cao (làm lại quá nhiều) |
| Mở rộng tốt khi tranh chấp thấp | Thêm một cột và phải nhớ tăng nó |

### Cách 4 — Để ràng buộc database làm việc

Đôi khi có thể đổi mô hình để chính database từ chối:

```sql
CREATE TABLE bookings (
    seat_id INT PRIMARY KEY REFERENCES seats(id),   -- ← MỘT ghế = MỘT booking
    name    TEXT NOT NULL,
    created TIMESTAMPTZ DEFAULT now()
);
```

```python
try:
    cur.execute("INSERT INTO bookings (seat_id, name) VALUES (%s, %s)",
                (seat_id, ten))
except errors.UniqueViolation:
    raise GheDaCoNguoi()
```

| Ưu | Nhược |
|---|---|
| **Không thể sai** — ràng buộc ở tầng database | Phải đổi mô hình dữ liệu |
| Đúng kể cả khi có bug ở ứng dụng | Xử lý huỷ đặt phức tạp hơn (phải `DELETE`) |
| Đúng kể cả với nhiều ứng dụng cùng ghi | |

Với dữ liệu quan trọng (tiền, chỗ ngồi, tồn kho), cách này là **lớp phòng thủ cuối cùng** và nên có **song song** với một trong ba cách trên.

### Bảng chọn

| Tình huống | Cách nên dùng |
|---|---|
| Kiểm tra đơn giản, một điều kiện | **Cách 2** — cập nhật có điều kiện |
| Cần logic nghiệp vụ phức tạp, tranh chấp thấp | **Cách 3** — khoá lạc quan |
| Cần logic phức tạp, tranh chấp cao | **Cách 1** — `FOR UPDATE` |
| Dữ liệu tiền bạc, phải tuyệt đối đúng | **Cách 4** + một trong ba cách trên |

### Trường hợp mở rộng: giữ chỗ tạm

Thực tế đặt vé không chỉ có "đặt" và "trống" — còn có "đang giữ chỗ trong 10 phút để thanh toán":

```sql
ALTER TABLE seats ADD COLUMN giu_boi TEXT, ADD COLUMN giu_den TIMESTAMPTZ;

-- Giữ chỗ: thành công nếu ghế trống HOẶC lần giữ trước ĐÃ HẾT HẠN
UPDATE seats
   SET giu_boi = %s, giu_den = now() + interval '10 minutes'
 WHERE id = %s
   AND is_booked = false
   AND (giu_den IS NULL OR giu_den < now())        -- ← tự hết hạn
RETURNING id;
```

Mẹo hay ở đây: **không cần job dọn dẹp**. Lần giữ chỗ hết hạn tự động bị bỏ qua nhờ điều kiện `giu_den < now()`. Một job dọn có thể chạy nền cho gọn, nhưng nó không cần thiết cho tính đúng đắn.

---

# Phần II — Phân trang bằng `OFFSET` rất chậm

## `OFFSET` thật sự làm gì

```sql
SELECT title FROM news ORDER BY id DESC LIMIT 10 OFFSET 100000;
```

Trực giác: *"nhảy tới dòng thứ 100.000 rồi lấy 10 dòng."*

Thực tế:

```text
   OFFSET nghĩa là: LẤY RỒI VỨT BỎ n dòng đầu tiên.

   Database phải:
     1. Đọc dòng thứ 1     → vứt
     2. Đọc dòng thứ 2     → vứt
     ...
     100.000. Đọc dòng 100.000  → vứt
     100.001-100.010: đọc và TRẢ VỀ

   → Đọc 100.010 dòng để trả về 10 dòng.
   → Và càng sang trang sau thì càng chậm.
```

## Đo trên máy thật

```sql
CREATE TABLE news (id BIGSERIAL PRIMARY KEY, title TEXT, created TIMESTAMPTZ DEFAULT now());
INSERT INTO news (title) SELECT 'Tin so ' || i FROM generate_series(1, 5000000) AS i;
VACUUM ANALYZE news;
```

```sql
EXPLAIN ANALYZE SELECT title FROM news ORDER BY id DESC LIMIT 10 OFFSET 0;
```

```text
Limit  (actual time=0.028..0.032 rows=10 loops=1)
  ->  Index Scan Backward using news_pkey on news  (actual ... rows=10 loops=1)
Execution Time: 0.061 ms
```

```sql
EXPLAIN ANALYZE SELECT title FROM news ORDER BY id DESC LIMIT 10 OFFSET 1000;
```

```text
Limit  (actual time=0.842..0.851 rows=10 loops=1)
  ->  Index Scan Backward using news_pkey on news  (actual ... rows=1010 loops=1)
                                                                    ▲ 1010 dòng
Execution Time: 0.882 ms
```

```sql
EXPLAIN ANALYZE SELECT title FROM news ORDER BY id DESC LIMIT 10 OFFSET 100000;
```

```text
Limit  (actual time=78.118..78.126 rows=10 loops=1)
  ->  Index Scan Backward using news_pkey on news  (actual ... rows=100010 loops=1)
                                                                    ▲ 100.010 dòng
Execution Time: 78.442 ms
```

```sql
EXPLAIN ANALYZE SELECT title FROM news ORDER BY id DESC LIMIT 10 OFFSET 1000000;
```

```text
Limit  (actual time=618.884..618.892 rows=10 loops=1)
  ->  Index Scan Backward using news_pkey on news  (actual ... rows=1000010 loops=1)
Execution Time: 619.226 ms
```

```text
   OFFSET         DÒNG PHẢI ĐỌC       THỜI GIAN
   ─────────      ──────────────      ─────────
         0                    10        0,06 ms
     1.000                 1.010        0,88 ms
   100.000               100.010          78 ms
 1.000.000             1.000.010         619 ms

   → TUYẾN TÍNH theo OFFSET. Trang càng sau càng chậm.
   → Và đó là với cache NÓNG. Lần chạy đầu tiên có thể chậm gấp 10 lần.
```

## Vấn đề thứ hai: dòng trùng và dòng bị bỏ sót

Chậm chưa phải điều tệ nhất. `OFFSET` còn cho **kết quả sai** khi dữ liệu thay đổi giữa các trang:

```text
   BẢN GHI HIỆN TẠI (sắp xếp id giảm dần):
      id 105, 104, 103, 102, 101, 100, 99, 98, ...

   NGƯỜI DÙNG XEM TRANG 1:  LIMIT 3 OFFSET 0
      → 105, 104, 103

   ⟵ AI ĐÓ CHÈN BẢN GHI MỚI id=106

   DANH SACH BAY GIO:
      id 106, 105, 104, 103, 102, 101, ...

   NGƯỜI DÙNG XEM TRANG 2:  LIMIT 3 OFFSET 3
      → 103, 102, 101
          ▲ ID 103 XUẤT HIỆN LẠI — người dùng thấy TRÙNG
```

Và ngược lại, nếu có bản ghi bị **xoá** thì một bản ghi sẽ **biến mất** khỏi kết quả mà không ai biết.

```text
   OFFSET đếm theo VỊ TRÍ, mà vị trí thì THAY ĐỔI khi dữ liệu thay đổi.
```

Với cuộn vô hạn (infinite scroll), lỗi này rất dễ nhận ra và rất khó chịu.

---

## Lời giải: phân trang theo con trỏ (keyset pagination)

Thay vì "bỏ qua 100.000 dòng", hãy nói **"lấy các dòng sau giá trị này"**:

```sql
-- Trang đầu
SELECT id, title FROM news ORDER BY id DESC LIMIT 10;
-- → trả về, dòng cuối cùng có id = 4999991

-- Trang tiếp theo: dùng id của dòng cuối làm mốc
SELECT id, title FROM news
 WHERE id < 4999991                    -- ← ĐIỀU KIỆN, không phải OFFSET
 ORDER BY id DESC LIMIT 10;
```

```sql
EXPLAIN ANALYZE
SELECT id, title FROM news WHERE id < 4000000 ORDER BY id DESC LIMIT 10;
```

```text
Limit  (actual time=0.041..0.048 rows=10 loops=1)
  ->  Index Scan Backward using news_pkey on news  (actual ... rows=10 loops=1)
        Index Cond: (id < 4000000)                          ▲ CHỈ 10 DÒNG
Execution Time: 0.078 ms
```

```text
   OFFSET 1.000.000 :  619,00 ms,  đọc 1.000.010 dòng
   Keyset           :    0,08 ms,  đọc         10 dòng

                       → NHANH HƠN ~7.700 LẦN
                       → VÀ THỜI GIAN KHÔNG ĐỔI dù ở trang nào
```

Dòng cuối là điểm quan trọng nhất: **trang thứ 1 và trang thứ 100.000 mất thời gian như nhau**.

### Vì sao nó nhanh: điều kiện chui được vào index

```text
   OFFSET                              KEYSET
   ══════                              ══════
   Index Scan Backward                 Index Scan Backward
     (không có Index Cond)               Index Cond: (id < 4000000)
     → đi từ đầu, đếm từng dòng          → NHẢY THẲNG tới vị trí id=4000000
     → vứt bỏ 1 triệu dòng               → đọc 10 dòng kế tiếp trên lá
     → LIMIT áp ở TRÊN CÙNG              → dừng
```

Nó tận dụng đúng thứ B+Tree giỏi nhất: **nhảy tới một điểm rồi đi ngang trên tầng lá** — như đã phân tích ở [phase-5 bài 2](../phase-5/02-btree-plus-va-ung-dung-thuc-te.md).

### Sắp xếp theo cột không duy nhất

Nếu sắp xếp theo `created` (có thể trùng nhau), chỉ dùng `WHERE created < X` là **sai** — các dòng cùng thời điểm sẽ bị bỏ sót hoặc lặp lại.

Cách đúng: dùng **so sánh bộ giá trị** (*row value comparison*):

```sql
-- SAI: bỏ sót các dòng cùng `created`
SELECT * FROM news WHERE created < '2026-08-01 10:00:00' ORDER BY created DESC LIMIT 10;

-- ĐÚNG: thêm một cột DUY NHẤT làm tie-breaker
SELECT * FROM news
 WHERE (created, id) < ('2026-08-01 10:00:00', 4999991)
 ORDER BY created DESC, id DESC
 LIMIT 10;
```

Cú pháp `(a, b) < (x, y)` là so sánh từ điển: `a < x`, hoặc (`a = x` **và** `b < y`). PostgreSQL và MySQL 8 đều hỗ trợ, và quan trọng là nó **dùng được index composite `(created, id)`**.

```sql
CREATE INDEX idx_news_created_id ON news (created DESC, id DESC);
```

### Con trỏ mờ — không lộ cấu trúc ra ngoài

Truyền `id` thật ra API làm lộ cấu trúc nội bộ. Gói lại thành một chuỗi mờ:

```python
import base64, json

def tao_con_tro(created, row_id):
    return base64.urlsafe_b64encode(
        json.dumps({"c": created.isoformat(), "i": row_id}).encode()
    ).decode()

def doc_con_tro(cursor_str):
    d = json.loads(base64.urlsafe_b64decode(cursor_str))
    return d["c"], d["i"]
```

```json
{
  "items": [ ... ],
  "next_cursor": "eyJjIjoiMjAyNi0wOC0wMVQxMDowMDowMCIsImkiOjQ5OTk5OTF9"
}
```

Đây chính là cách GitHub, Slack, Stripe và Twitter phân trang API của họ.

---

## Khi nào `OFFSET` vẫn chấp nhận được

Keyset không phải lúc nào cũng dùng được:

| Tình huống | Dùng được keyset? |
|---|---|
| Cuộn vô hạn, "tải thêm" | **Có** — hoàn hảo |
| Nút "Trang sau / Trang trước" | **Có** |
| Nhảy thẳng tới **trang 500** | **Không** — keyset không biết trang 500 bắt đầu ở đâu |
| Bảng quản trị có số trang 1..N | Khó — cần tổng số dòng |
| Sắp xếp theo cột người dùng tự chọn | Được, nhưng cần index cho từng cột |

Ba cách xử lý khi bắt buộc phải có "nhảy tới trang N":

```text
   1. GIỚI HẠN số trang
      → chỉ cho nhảy tới trang 100, sau đó bắt buộc dùng tìm kiếm/lọc
      → Google cũng làm vậy: không thể nhảy tới trang 1000 kết quả

   2. OFFSET NỬA VỜI
      → dùng keyset tới trang gần nhất đã biết, rồi OFFSET một đoạn NGẮN
      → WHERE id < <moc> ORDER BY id DESC LIMIT 10 OFFSET 40

   3. BẢNG MỐC TRANG tính sẵn
      → định kỳ tính "trang 100 bắt đầu từ id = X" và lưu lại
      → hợp với dữ liệu ít thay đổi
```

### Và `COUNT(*)` cũng là một cái bẫy

Giao diện phân trang thường cần "hiển thị 1-10 trong 5.000.000 kết quả". Câu đếm đó cũng đắt:

```sql
EXPLAIN ANALYZE SELECT count(*) FROM news;
```

```text
Finalize Aggregate  (actual time=442.118..448.226 rows=1 loops=1)
Execution Time: 448.882 ms
```

Ba cách giảm nhẹ:

```sql
-- 1. Ước lượng từ thống kê (rất nhanh, sai số vài phần trăm)
SELECT reltuples::BIGINT AS uoc_luong FROM pg_class WHERE relname = 'news';
```

```text
 uoc_luong
-----------
   4998112
```

```sql
-- 2. Đếm có GIỚI HẠN: "hơn 1000 kết quả" thay vì con số chính xác
SELECT count(*) FROM (SELECT 1 FROM news WHERE ... LIMIT 1001) t;

-- 3. Không đếm gì cả: chỉ hỏi "có trang sau không?"
SELECT ... LIMIT 11;    -- lấy 11, hiện 10, còn 1 dòng nghĩa là còn trang sau
```

Cách 3 là cách các API hiện đại dùng, và nó rẻ nhất.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| `SELECT` kiểm tra rồi `UPDATE` không khoá | Đặt trùng chỗ, trừ kho hai lần | `FOR UPDATE`, hoặc điều kiện nằm trong chính câu `UPDATE` |
| Quên kiểm tra `rowcount` sau cập nhật có điều kiện | Tưởng thành công trong khi 0 dòng bị đổi | Luôn kiểm tra `rowcount`/`RETURNING` |
| Chỉ dựa vào ứng dụng, không có ràng buộc database | Một bug ở một chỗ là hỏng dữ liệu | Thêm `UNIQUE`/`CHECK` làm lớp cuối |
| `LIMIT n OFFSET lớn` | Chậm tuyến tính, và cho kết quả trùng/sót | Keyset pagination |
| Keyset trên cột không duy nhất | Bỏ sót hoặc lặp dòng cùng giá trị | So sánh bộ `(cột, id)` + index composite |
| Truyền `id` thật ra API công khai | Lộ cấu trúc và quy mô dữ liệu | Con trỏ mã hoá base64 |
| `COUNT(*)` cho mọi lần tải trang | Vài trăm mili-giây mỗi lần | `reltuples`, đếm có giới hạn, hoặc `LIMIT n+1` |
| Cho nhảy tới trang bất kỳ trên bảng lớn | Bắt buộc phải dùng `OFFSET` | Giới hạn số trang, hoặc bảng mốc trang |

## Tóm tắt bài 2

- **Đặt trùng chỗ** sinh ra từ **khe hở giữa `SELECT` và `UPDATE`** — chính là *lost update* nhìn từ góc nghiệp vụ.
- Bốn cách chữa: `FOR UPDATE` (đơn giản, phải chờ) · **cập nhật có điều kiện** (nhanh nhất, nên dùng mặc định) · khoá lạc quan bằng `version` (không ai chờ, phải thử lại) · **ràng buộc database** (không thể sai, nên có song song với các cách trên).
- Mẹo giữ chỗ tạm: điều kiện `giu_den < now()` khiến lần giữ hết hạn **tự động bị bỏ qua** — không cần job dọn dẹp cho tính đúng đắn.
- **`OFFSET` nghĩa là "lấy rồi vứt bỏ n dòng đầu"**, không phải "nhảy tới". Đo thật: `OFFSET 1.000.000` mất **619 ms** và đọc **1.000.010 dòng**.
- `OFFSET` còn cho **kết quả sai**: dữ liệu chèn/xoá giữa các trang làm dòng bị trùng hoặc bị bỏ sót.
- **Keyset pagination** nhanh hơn **~7.700 lần** và — quan trọng hơn — **thời gian không đổi ở mọi trang**, vì điều kiện chui được vào `Index Cond`.
- Sắp xếp theo cột không duy nhất phải dùng **so sánh bộ `(cột, id)`** cộng index composite, nếu không sẽ bỏ sót dòng trùng giá trị.
- `COUNT(*)` cũng là bẫy: dùng `reltuples`, đếm có giới hạn, hoặc chỉ lấy **`LIMIT n+1`** để biết còn trang sau hay không.

**Bài kế tiếp** → [Bài 3: Database Connection Pooling](03-connection-pooling.md)
