# Bài 3: 15 anti-pattern làm chậm query

Bài này là danh mục tra cứu. Mỗi mục có ba phần: **query sai**, **vì sao chậm**, **cách sửa**. Đây cũng là kho câu trả lời cho dạng câu hỏi phỏng vấn phổ biến nhất ở tầng performance: *"Kể vài lỗi khiến query chậm mà bạn từng gặp."*

Điều làm những anti-pattern này nguy hiểm là chúng đều **chạy đúng**. Không có lỗi cú pháp, kết quả không sai. Chúng chỉ âm thầm chậm — và chỉ lộ ra khi dữ liệu đã lớn, thường là vào lúc bạn không muốn nhất.

## Bảng tra nhanh

| # | Anti-pattern | Mức độ | Cách sửa một dòng |
|---|---|---|---|
| 1 | `SELECT *` | Trung bình | Liệt kê đúng cột cần |
| 2 | Bọc hàm quanh cột được index | **Cao** | Viết lại SARGable / index biểu thức |
| 3 | Ép kiểu ngầm | **Cao** | Thống nhất kiểu dữ liệu |
| 4 | `LIKE '%x%'` | **Cao** | Trigram / full-text index |
| 5 | N+1 query | **Cao** | Một query với `JOIN` hoặc `IN` |
| 6 | `OFFSET` sâu | **Cao** | Keyset pagination |
| 7 | `DISTINCT` để che fanout | **Cao** | Gom trước rồi join |
| 8 | `UNION` khi không cần khử trùng | Trung bình | `UNION ALL` |
| 9 | `COUNT(*)` toàn bảng mỗi lần phân trang | Trung bình | Ước lượng hoặc đếm có chặn |
| 10 | Scalar subquery tương quan trong `SELECT` | **Cao** | Gom một lần rồi `LEFT JOIN` |
| 11 | `OR` giữa các cột khác nhau | Trung bình | `UNION` hai nhánh |
| 12 | `NOT IN` với tập có NULL | **Cao** (còn sai kết quả) | `NOT EXISTS` |
| 13 | Index tràn lan | Trung bình | Xoá index chưa từng dùng |
| 14 | Lọc ở tầng ứng dụng thay vì trong SQL | **Cao** | Đẩy điều kiện xuống database |
| 15 | Transaction mở quá lâu | **Cao** | Rút ngắn phạm vi transaction |

## 1. `SELECT *`

```sql
SELECT * FROM orders WHERE customer_id = 1;                    -- xấu
SELECT order_id, total_amount FROM orders WHERE customer_id = 1; -- tốt
```

**Vì sao chậm**: kéo cả cột `TEXT`/`JSONB` lớn không dùng đến, tốn băng thông và bộ nhớ; và quan trọng hơn — **phá vỡ khả năng index-only scan**, vì index không thể chứa mọi cột.

**Hệ luỵ thêm**: khi ai đó thêm cột mới, query âm thầm nặng lên; code phía ứng dụng ánh xạ theo vị trí cột sẽ vỡ.

**Ngoại lệ hợp lệ**: `SELECT *` trong `EXISTS` (optimizer bỏ qua danh sách cột) và khi khám phá dữ liệu thủ công.

## 2. Bọc hàm quanh cột được index

```sql
WHERE DATE(ordered_at) = '2024-04-02'          -- Seq Scan
WHERE ordered_at >= '2024-04-02'
  AND ordered_at <  '2024-04-03'               -- Index Scan
```

**Vì sao chậm**: index lưu giá trị **gốc** của cột. Một khi cột bị bọc trong hàm, database không còn cách nào ánh xạ điều kiện vào cây index, buộc phải tính hàm cho từng dòng.

Bộ chuyển đổi hay dùng:

| Thay vì | Viết |
|---|---|
| `YEAR(d) = 2024` | `d >= '2024-01-01' AND d < '2025-01-01'` |
| `DATE(ts) = '2024-04-02'` | `ts >= '2024-04-02' AND ts < '2024-04-03'` |
| `UPPER(name) = 'ABC'` | `name ILIKE 'abc'`, hoặc index trên `UPPER(name)` |
| `amount / 100 > 5` | `amount > 500` |
| `EXTRACT(MONTH FROM d) = 4` | Cột sinh `thang` + index, nếu query lặp lại thường xuyên |

## 3. Ép kiểu ngầm

```sql
-- Cột phone VARCHAR
WHERE phone = 0987654321      -- MySQL ép CỘT sang số → index chết + sai dữ liệu
WHERE phone = '0987654321'    -- đúng

-- Join giữa hai cột khác kiểu
JOIN b ON b.user_id = a.user_id_text   -- INT với VARCHAR → index bị bỏ qua
```

**Vì sao nguy hiểm**: hoàn toàn im lặng. Không lỗi, không cảnh báo. Chỉ thấy `Seq Scan` trong plan mà không hiểu vì sao.

**Cách phát hiện**: trong `EXPLAIN` của Postgres, tìm dấu ép kiểu `::text` hay `(col)::numeric` trong dòng `Filter`.

**Phòng ngừa từ gốc**: thống nhất kiểu ngay ở schema. Số điện thoại nên là `VARCHAR` (giữ số 0 đầu), khoá ngoại phải cùng kiểu với khoá chính nó tham chiếu.

## 4. `LIKE '%x%'`

```sql
WHERE name LIKE '%phim%'    -- không dùng được B-Tree
WHERE name LIKE 'phim%'     -- dùng được (tiền tố cố định)
```

**Vì sao**: B-Tree sắp theo thứ tự từ **đầu chuỗi**. Không biết đầu chuỗi thì không định vị được trong cây.

**Cách sửa theo nhu cầu**:

```sql
-- Tìm chuỗi con bất kỳ → trigram
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX ON products USING GIN (name gin_trgm_ops);

-- Tìm kiếm theo từ → full-text
CREATE INDEX ON products USING GIN (to_tsvector('simple', name));
SELECT * FROM products WHERE to_tsvector('simple', name) @@ plainto_tsquery('phim');

-- Tìm hậu tố → index trên chuỗi đảo ngược
CREATE INDEX ON customers (reverse(email));
WHERE reverse(email) LIKE reverse('%@shop.vn');
```

## 5. N+1 query

```python
# 1 query lấy danh sách + N query lấy chi tiết = 1 + 1000 lần đi mạng
don_hang = db.query("SELECT order_id, customer_id FROM orders LIMIT 1000")
for d in don_hang:
    d.khach = db.query("SELECT * FROM customers WHERE customer_id = %s", d.customer_id)
```

**Vì sao chậm**: mỗi query tốn một vòng đi-về mạng. 1000 query × 1ms = 1 giây chỉ riêng độ trễ mạng, dù mỗi query chỉ mất 0.05ms để thực thi.

```python
# Sửa cách 1: JOIN
db.query("""SELECT o.order_id, c.full_name
            FROM orders o JOIN customers c ON c.customer_id = o.customer_id
            LIMIT 1000""")

# Sửa cách 2: gom id rồi một query IN (khi không tiện join)
ids = [d.customer_id for d in don_hang]
db.query("SELECT * FROM customers WHERE customer_id = ANY(%s)", (ids,))
```

**Cảnh giác với ORM**: đây là hành vi **mặc định** của lazy loading. Django cần `select_related` / `prefetch_related`, SQLAlchemy cần `joinedload` / `selectinload`, Hibernate cần `JOIN FETCH`. Nêu được tên cụ thể theo framework mình dùng là dấu hiệu kinh nghiệm thật.

Phiên bản N+1 nằm ngay trong SQL là anti-pattern số 10 bên dưới.

## 6. `OFFSET` sâu

```sql
SELECT * FROM orders ORDER BY order_id LIMIT 20 OFFSET 100000;
```

**Vì sao chậm**: database phải đọc và **vứt bỏ** 100,000 dòng đầu trước khi trả về 20 dòng. Trang càng sâu càng chậm tuyến tính — trang 1 mất 2ms, trang 5000 mất 800ms.

```sql
-- Keyset pagination (seek method): nhớ giá trị cuối của trang trước
SELECT * FROM orders
WHERE order_id > 100000        -- nhảy thẳng vào index, bỏ qua hẳn phần trước
ORDER BY order_id
LIMIT 20;
```

Thời gian trở thành hằng số bất kể trang thứ mấy. Chi tiết đầy đủ, gồm cả trường hợp sắp theo nhiều cột, ở [bài kế tiếp](04-phan-trang-va-xu-ly-bang-lon.md).

## 7. `DISTINCT` để che fanout

```sql
-- Xấu: DISTINCT chỉ để dọn hậu quả của join nhân dòng
SELECT DISTINCT c.customer_id, c.full_name
FROM customers c
JOIN orders o ON o.customer_id = c.customer_id;

-- Tốt: nói đúng ý "khách có ít nhất một đơn"
SELECT c.customer_id, c.full_name
FROM customers c
WHERE EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.customer_id);
```

**Vì sao chậm**: bản xấu tạo ra mọi dòng ghép (khách 100 đơn → 100 dòng) rồi mới khử trùng bằng sort/hash. Bản tốt dừng ngay khi tìm thấy đơn đầu tiên của mỗi khách.

**Quy tắc kiểm tra khi review code**: thấy `DISTINCT` thì hỏi *"nó đang sửa dữ liệu trùng thật, hay đang che một phép join nhân dòng?"*. Vế thứ hai xảy ra thường xuyên hơn nhiều — và nguy hiểm vì nếu bạn còn `SUM` cột nào đó, `DISTINCT` **không** cứu được con số sai (xem [phase-1 bài 3](../phase-1/03-join-nang-cao-fanout-on-vs-where-va-thuat-toan-join.md)).

## 8. `UNION` khi không cần khử trùng

```sql
SELECT ... WHERE status = 'paid'
UNION                         -- tốn một bước sort/hash toàn bộ
SELECT ... WHERE status = 'cancelled';
```

Hai nhánh loại trừ nhau về logic, không thể có dòng trùng. `UNION ALL` cho cùng kết quả, rẻ hơn nhiều.

**Mặc định luôn là `UNION ALL`**; chỉ nâng lên `UNION` khi chứng minh được có khả năng trùng và bạn thật sự cần khử.

## 9. `COUNT(*)` toàn bảng mỗi lần phân trang

```sql
SELECT COUNT(*) FROM orders;   -- Postgres: quét toàn bảng vì MVCC
```

**Vì sao chậm**: PostgreSQL không lưu sẵn số dòng (mỗi transaction nhìn thấy tập dòng khác nhau do MVCC), nên phải quét thật. Trên bảng 50 triệu dòng là vài giây — chạy cho **mỗi lần tải trang** thì không chấp nhận được.

```sql
-- Ước lượng đủ dùng cho "khoảng N kết quả" (gần như tức thời)
SELECT reltuples::bigint FROM pg_class WHERE relname = 'orders';

-- Đếm có chặn: "1000+" thay vì con số chính xác
SELECT COUNT(*) FROM (SELECT 1 FROM orders WHERE ... LIMIT 1001) t;

-- Cần chính xác và thường xuyên → bảng đếm cập nhật bằng trigger
```

Hỏi lại nghiệp vụ *"người dùng có thật sự cần con số chính xác không?"* là câu trả lời tốt nhất — thường là không.

> MySQL với InnoDB cũng phải quét, dù `SHOW TABLE STATUS` có sẵn số ước lượng. MyISAM thì lưu sẵn số dòng chính xác — đó là lý do `COUNT(*)` trên MyISAM tức thời, một chi tiết hay được hỏi để so sánh hai storage engine.

## 10. Scalar subquery tương quan trong `SELECT`

```sql
-- Xấu: 3 lần quét orders cho MỖI khách
SELECT c.full_name,
       (SELECT COUNT(*)          FROM orders o WHERE o.customer_id = c.customer_id) AS so_don,
       (SELECT SUM(total_amount) FROM orders o WHERE o.customer_id = c.customer_id) AS tong_tien,
       (SELECT MAX(ordered_at)   FROM orders o WHERE o.customer_id = c.customer_id) AS lan_cuoi
FROM customers c;

-- Tốt: một lần gom, một lần join
SELECT c.full_name,
       COALESCE(s.so_don, 0)    AS so_don,
       COALESCE(s.tong_tien, 0) AS tong_tien,
       s.lan_cuoi
FROM customers c
LEFT JOIN (
    SELECT customer_id, COUNT(*) AS so_don, SUM(total_amount) AS tong_tien,
           MAX(ordered_at) AS lan_cuoi
    FROM orders GROUP BY customer_id
) s ON s.customer_id = c.customer_id;
```

**Dấu hiệu trong plan**: `SubPlan` kèm `loops` bằng số dòng bảng ngoài.

## 11. `OR` giữa các cột khác nhau

```sql
WHERE email = 'a@shop.vn' OR city = 'Ha Noi';        -- thường thành Seq Scan

-- Sửa: tách thành hai nhánh, mỗi nhánh dùng index riêng
SELECT * FROM customers WHERE email = 'a@shop.vn'
UNION
SELECT * FROM customers WHERE city  = 'Ha Noi';
```

`OR` **trên cùng một cột** thì không sao — `WHERE status = 'paid' OR status = 'shipped'` được viết lại thành `IN` và dùng index bình thường.

## 12. `NOT IN` với tập có NULL

Đã phân tích kỹ ở [phase-1 bài 2](../phase-1/02-join-inner-vs-left-va-bai-toan-khach-chua-mua.md). Nhắc lại vì đây là anti-pattern duy nhất trong danh sách vừa chậm **vừa cho kết quả sai**:

```sql
WHERE customer_id NOT IN (SELECT customer_id FROM orders)      -- rỗng nếu có NULL
WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.customer_id)  -- đúng
```

## 13. Index tràn lan

```sql
-- Ba index chồng lấn nhau
CREATE INDEX ON orders (customer_id);
CREATE INDEX ON orders (customer_id, status);
CREATE INDEX ON orders (customer_id, status, ordered_at);   -- chỉ cần cái này
```

Index thứ ba phục vụ được mọi tiền tố trái, nên hai cái đầu là **thừa hoàn toàn** — nhưng vẫn phải cập nhật ở mỗi lần ghi và vẫn chiếm dung lượng.

```sql
-- Tìm index chưa từng dùng
SELECT relname, indexrelname, idx_scan,
       pg_size_pretty(pg_relation_size(indexrelid)) AS kich_thuoc
FROM pg_stat_user_indexes WHERE idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;
```

Lưu ý trước khi xoá: `idx_scan = 0` chỉ tính từ lần reset thống kê gần nhất, và index phục vụ ràng buộc `UNIQUE`/`PRIMARY KEY` thì không được xoá dù không có lần quét nào.

## 14. Lọc ở tầng ứng dụng thay vì trong SQL

```python
# Xấu: kéo 5 triệu dòng về rồi lọc bằng Python
don = db.query("SELECT * FROM orders")
gan_day = [d for d in don if d.ordered_at > cutoff]

# Tốt: để database lọc — nó có index, còn Python thì không
gan_day = db.query("SELECT * FROM orders WHERE ordered_at > %s", (cutoff,))
```

Cùng họ với anti-pattern này: sắp xếp, gom nhóm, đếm và phân trang ở tầng ứng dụng. Nguyên tắc chung: **đẩy phép tính xuống nơi có dữ liệu**, chỉ mang về đúng thứ cần hiển thị.

Ngoại lệ hợp lý: logic nghiệp vụ phức tạp mà SQL diễn đạt vụng về, hoặc khi database đang là nút thắt CPU của toàn hệ thống còn tầng ứng dụng thì mở rộng ngang được dễ dàng.

## 15. Transaction mở quá lâu

```python
# Xấu: giữ transaction trong lúc gọi API bên ngoài
with db.transaction():
    don = db.query("SELECT * FROM orders WHERE status='pending' FOR UPDATE")
    ket_qua = goi_api_thanh_toan(don)      # mất 3 giây, giữ khoá suốt thời gian đó
    db.execute("UPDATE orders SET status='paid' WHERE ...")
```

**Hậu quả trên PostgreSQL**: khoá bị giữ, các transaction khác xếp hàng; nghiêm trọng hơn, transaction dài **chặn `VACUUM`** dọn dẹp dòng chết, gây phình bảng (table bloat) toàn hệ thống. Một transaction để quên có thể làm chậm cả database.

```python
# Tốt: gọi API ngoài transaction, chỉ khoá đúng lúc ghi
don = db.query("SELECT * FROM orders WHERE status='pending'")
ket_qua = goi_api_thanh_toan(don)
with db.transaction():
    db.execute("UPDATE orders SET status='paid' WHERE order_id = %s AND status='pending'",
               (don.id,))          # kiểm tra lại status để tránh ghi đè thay đổi khác
```

Điều kiện `AND status='pending'` trong `UPDATE` là chi tiết ăn điểm — nó chống lost update mà không cần giữ khoá lâu (optimistic locking). Chủ đề này được đào sâu ở [phase-4 bài 3](../phase-4/03-transaction-isolation-va-khoa-trong-phong-van.md).

Cách phát hiện transaction treo trên Postgres:

```sql
SELECT pid, now() - xact_start AS thoi_gian_chay, state, LEFT(query, 80)
FROM pg_stat_activity
WHERE state <> 'idle' AND xact_start < now() - INTERVAL '1 minute'
ORDER BY xact_start;
```

Trạng thái `idle in transaction` kéo dài là dấu hiệu ứng dụng quên `COMMIT` — nguyên nhân sự cố production rất phổ biến.

## Quy trình tối ưu một query chậm

Khi được hỏi *"bạn tối ưu query thế nào?"*, trả lời bằng quy trình luôn được chấm cao hơn liệt kê mẹo:

```text
1. ĐO       — EXPLAIN (ANALYZE, BUFFERS). Không đoán.
2. ĐỊNH VỊ  — node nào tốn thời gian nhất? ước lượng có sát thực tế không?
3. PHÂN LOẠI nguyên nhân:
      thiếu index │ điều kiện không SARGable │ thống kê cũ
      fanout      │ N+1                      │ thiếu RAM (đổ đĩa)
4. SỬA MỘT THỨ một lần, đo lại sau mỗi thay đổi.
5. XÁC MINH trên dữ liệu cỡ thật, không phải bảng 100 dòng ở máy dev.
6. THEO DÕI — pg_stat_statements để biết query nào tốn nhiều thời gian nhất toàn hệ thống.
```

```sql
-- Top 10 query tốn tổng thời gian nhiều nhất — nơi nên bắt đầu tối ưu
SELECT LEFT(query, 100) AS query,
       calls,
       ROUND(total_exec_time::numeric, 1)  AS tong_ms,
       ROUND(mean_exec_time::numeric, 2)   AS tb_ms
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;
```

Điểm quan trọng khi trình bày: **tối ưu theo tổng thời gian, không theo thời gian trung bình**. Một query 5ms chạy 2 triệu lần/ngày đáng sửa hơn một query 8 giây chạy mỗi ngày một lần.

## Câu hỏi phỏng vấn hay gặp

**"Kể một lần bạn tối ưu query."**
Kể theo cấu trúc: bối cảnh (query nào, chậm bao nhiêu, ảnh hưởng gì) → cách chẩn đoán (`EXPLAIN` thấy gì) → nguyên nhân gốc → cách sửa → kết quả đo được. Có con số cụ thể (từ 8s xuống 40ms) là điểm cộng lớn.

**"`SELECT *` có thật sự chậm không?"**
Với bảng vài cột nhỏ thì gần như không đáng kể. Nó thành vấn đề khi bảng có cột lớn, khi mạng là nút thắt, và đặc biệt khi nó phá vỡ index-only scan. Trả lời có sắc thái (chứ không phán "luôn chậm") cho thấy bạn hiểu bản chất chứ không thuộc quy tắc.

**"Query chậm hơn sau khi thêm index, sao lại thế?"**
Ba khả năng: (1) index làm `INSERT`/`UPDATE` chậm, mà nút thắt thật là ghi chứ không phải đọc; (2) optimizer chọn index mới nhưng đó là plan tệ hơn do thống kê sai; (3) index mới đẩy dữ liệu nóng ra khỏi bộ nhớ đệm. Cách xử lý: đo lại bằng `EXPLAIN ANALYZE`, và cân nhắc xoá index nếu không cải thiện.

## Tóm tắt bài 3

- Anti-pattern nguy hiểm nhất là loại **chạy đúng nhưng chậm** — chúng chỉ lộ ra khi dữ liệu đã lớn.
- Ba lỗi giết index thường gặp nhất: bọc hàm quanh cột, ép kiểu ngầm, và `LIKE '%x%'`.
- `DISTINCT` thường là triệu chứng của fanout, không phải giải pháp.
- N+1 tồn tại ở cả tầng ứng dụng (ORM lazy loading) lẫn trong SQL (scalar subquery tương quan).
- `OFFSET` sâu và `COUNT(*)` toàn bảng là hai sát thủ của trang danh sách.
- Transaction mở lâu không chỉ chặn khoá mà còn chặn `VACUUM`, gây phình bảng toàn hệ thống.
- Luôn **đo trước, sửa sau**, và ưu tiên theo tổng thời gian tiêu tốn chứ không theo thời gian trung bình.

**Bài kế tiếp** → [Bài 4: Phân trang và xử lý bảng lớn](04-phan-trang-va-xu-ly-bang-lon.md)
