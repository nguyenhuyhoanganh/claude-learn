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
        raise GheDaCoNguoi()                      # B roi vao day
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
   AND is_booked = false            -- ← DIEU KIEN NAM TRONG CHINH CAU LENH
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
   A: UPDATE ... WHERE is_booked=false   → khoa dong, thay false → ghi → 1 dong
   B: UPDATE ... WHERE is_booked=false   → CHO A
                                          → sau khi A commit, doc lai: true
                                          → dieu kien KHONG khop → 0 dong
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
# Doc
cur.execute("SELECT is_booked, version FROM seats WHERE id=%s", (seat_id,))
da_dat, phien_ban = cur.fetchone()
if da_dat:
    raise GheDaCoNguoi()

# ... co the co logic nghiep vu phuc tap o day, khong giu khoa nao ...

# Ghi: chi thanh cong neu KHONG AI sua trong luc do
cur.execute("""UPDATE seats SET is_booked=true, name=%s, version=version+1
               WHERE id=%s AND version=%s""", (ten, seat_id, phien_ban))
if cur.rowcount == 0:
    raise XungDotPhienBan()      # → thu lai tu dau
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
    seat_id INT PRIMARY KEY REFERENCES seats(id),   -- ← MOT ghe = MOT booking
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

-- Giu cho: thanh cong neu ghe trong HOAC lan giu truoc DA HET HAN
UPDATE seats
   SET giu_boi = %s, giu_den = now() + interval '10 minutes'
 WHERE id = %s
   AND is_booked = false
   AND (giu_den IS NULL OR giu_den < now())        -- ← tu het han
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
   OFFSET nghia la: LAY ROI VUT BO n dong dau tien.

   Database phai:
     1. Doc dong thu 1     → vut
     2. Doc dong thu 2     → vut
     ...
     100.000. Doc dong 100.000  → vut
     100.001-100.010: doc va TRA VE

   → Doc 100.010 dong de tra ve 10 dong.
   → Va cang sang trang sau thi cang cham.
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
                                                                    ▲ 1010 dong
Execution Time: 0.882 ms
```

```sql
EXPLAIN ANALYZE SELECT title FROM news ORDER BY id DESC LIMIT 10 OFFSET 100000;
```

```text
Limit  (actual time=78.118..78.126 rows=10 loops=1)
  ->  Index Scan Backward using news_pkey on news  (actual ... rows=100010 loops=1)
                                                                    ▲ 100.010 dong
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
   OFFSET         DONG PHAI DOC       THOI GIAN
   ─────────      ──────────────      ─────────
         0                    10        0,06 ms
     1.000                 1.010        0,88 ms
   100.000               100.010          78 ms
 1.000.000             1.000.010         619 ms

   → TUYEN TINH theo OFFSET. Trang cang sau cang cham.
   → Va do la voi cache NONG. Lan chay dau tien co the cham gap 10 lan.
```

## Vấn đề thứ hai: dòng trùng và dòng bị bỏ sót

Chậm chưa phải điều tệ nhất. `OFFSET` còn cho **kết quả sai** khi dữ liệu thay đổi giữa các trang:

```text
   BAN GHI HIEN TAI (sap xep id giam dan):
      id 105, 104, 103, 102, 101, 100, 99, 98, ...

   NGUOI DUNG XEM TRANG 1:  LIMIT 3 OFFSET 0
      → 105, 104, 103

   ⟵ AI DO CHEN BAN GHI MOI id=106

   DANH SACH BAY GIO:
      id 106, 105, 104, 103, 102, 101, ...

   NGUOI DUNG XEM TRANG 2:  LIMIT 3 OFFSET 3
      → 103, 102, 101
          ▲ ID 103 XUAT HIEN LAI — nguoi dung thay TRUNG
```

Và ngược lại, nếu có bản ghi bị **xoá** thì một bản ghi sẽ **biến mất** khỏi kết quả mà không ai biết.

```text
   OFFSET dem theo VI TRI, ma vi tri thi THAY DOI khi du lieu thay doi.
```

Với cuộn vô hạn (infinite scroll), lỗi này rất dễ nhận ra và rất khó chịu.

---

## Lời giải: phân trang theo con trỏ (keyset pagination)

Thay vì "bỏ qua 100.000 dòng", hãy nói **"lấy các dòng sau giá trị này"**:

```sql
-- Trang dau
SELECT id, title FROM news ORDER BY id DESC LIMIT 10;
-- → tra ve, dong cuoi cung co id = 4999991

-- Trang tiep theo: dung id cua dong cuoi lam moc
SELECT id, title FROM news
 WHERE id < 4999991                    -- ← DIEU KIEN, khong phai OFFSET
 ORDER BY id DESC LIMIT 10;
```

```sql
EXPLAIN ANALYZE
SELECT id, title FROM news WHERE id < 4000000 ORDER BY id DESC LIMIT 10;
```

```text
Limit  (actual time=0.041..0.048 rows=10 loops=1)
  ->  Index Scan Backward using news_pkey on news  (actual ... rows=10 loops=1)
        Index Cond: (id < 4000000)                          ▲ CHI 10 DONG
Execution Time: 0.078 ms
```

```text
   OFFSET 1.000.000 :  619,00 ms,  doc 1.000.010 dong
   Keyset           :    0,08 ms,  doc         10 dong

                       → NHANH HON ~7.700 LAN
                       → VA THOI GIAN KHONG DOI du o trang nao
```

Dòng cuối là điểm quan trọng nhất: **trang thứ 1 và trang thứ 100.000 mất thời gian như nhau**.

### Vì sao nó nhanh: điều kiện chui được vào index

```text
   OFFSET                              KEYSET
   ══════                              ══════
   Index Scan Backward                 Index Scan Backward
     (khong co Index Cond)               Index Cond: (id < 4000000)
     → di tu dau, dem tung dong          → NHAY THANG toi vi tri id=4000000
     → vut bo 1 trieu dong               → doc 10 dong ke tiep tren la
     → LIMIT ap o TREN CUNG              → dung
```

Nó tận dụng đúng thứ B+Tree giỏi nhất: **nhảy tới một điểm rồi đi ngang trên tầng lá** — như đã phân tích ở [phase-5 bài 2](../phase-5/02-btree-plus-va-ung-dung-thuc-te.md).

### Sắp xếp theo cột không duy nhất

Nếu sắp xếp theo `created` (có thể trùng nhau), chỉ dùng `WHERE created < X` là **sai** — các dòng cùng thời điểm sẽ bị bỏ sót hoặc lặp lại.

Cách đúng: dùng **so sánh bộ giá trị** (*row value comparison*):

```sql
-- SAI: bo sot cac dong cung `created`
SELECT * FROM news WHERE created < '2026-08-01 10:00:00' ORDER BY created DESC LIMIT 10;

-- DUNG: them mot cot DUY NHAT lam tie-breaker
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
   1. GIOI HAN so trang
      → chi cho nhay toi trang 100, sau do bat buoc dung tim kiem/loc
      → Google cung lam vay: khong the nhay toi trang 1000 ket qua

   2. OFFSET NUA VOI
      → dung keyset toi trang gan nhat da biet, roi OFFSET mot doan NGAN
      → WHERE id < <moc> ORDER BY id DESC LIMIT 10 OFFSET 40

   3. BANG MOC TRANG tinh san
      → dinh ky tinh "trang 100 bat dau tu id = X" va luu lai
      → hop voi du lieu it thay doi
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
-- 1. Uoc luong tu thong ke (rat nhanh, sai so vai phan tram)
SELECT reltuples::BIGINT AS uoc_luong FROM pg_class WHERE relname = 'news';
```

```text
 uoc_luong
-----------
   4998112
```

```sql
-- 2. Dem co GIOI HAN: "hon 1000 ket qua" thay vi con so chinh xac
SELECT count(*) FROM (SELECT 1 FROM news WHERE ... LIMIT 1001) t;

-- 3. Khong dem gi ca: chi hoi "co trang sau khong?"
SELECT ... LIMIT 11;    -- lay 11, hien 10, con 1 dong nghia la con trang sau
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
