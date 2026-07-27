# Bài 2: Case dữ liệu trùng lặp, dedup và upsert

Dữ liệu trùng lặp là vấn đề mà **mọi** hệ thống đều gặp: người dùng bấm nút hai lần, job ETL chạy lại sau khi lỗi, webhook được gửi lại vì bên gửi không nhận được phản hồi, hai request đồng thời cùng tạo một bản ghi. Vì phổ biến như vậy, nó gần như luôn có mặt trong đề phỏng vấn — thường dưới dạng *"tìm và xoá bản ghi trùng, giữ lại bản mới nhất"*.

Nhưng câu hỏi hay hơn nằm ở phía sau: *"làm sao để nó không trùng ngay từ đầu?"*. Ứng viên chỉ trả lời được vế xoá thì dừng ở mức junior; trả lời được cả vế phòng ngừa (ràng buộc, upsert, khoá idempotency) mới là mid trở lên.

## Tìm bản ghi trùng

```sql
-- Cách 1: nhóm rồi lọc — trả về GIÁ TRỊ nào bị trùng
SELECT email, COUNT(*) AS so_lan
FROM customers
GROUP BY email
HAVING COUNT(*) > 1
ORDER BY so_lan DESC;

-- Cách 2: window function — trả về CHÍNH các dòng bị trùng (đầy đủ thông tin)
SELECT *
FROM (
    SELECT c.*,
           COUNT(*)     OVER (PARTITION BY c.email) AS so_ban_ghi,
           ROW_NUMBER() OVER (PARTITION BY c.email ORDER BY c.created_at DESC) AS thu_tu
    FROM customers AS c
) AS t
WHERE so_ban_ghi > 1
ORDER BY email, thu_tu;
```

Cách 2 mạnh hơn hẳn vì nó vừa chỉ ra dòng trùng, vừa đánh số sẵn để biết dòng nào nên giữ (`thu_tu = 1`).

Trùng lặp thường không "sạch" như ví dụ — cùng một người nhưng email viết hoa khác nhau hoặc có khoảng trắng thừa:

```sql
-- Trùng theo khoá đã chuẩn hoá — sát thực tế hơn nhiều
SELECT LOWER(TRIM(email)) AS email_chuan, COUNT(*), ARRAY_AGG(customer_id)
FROM customers
WHERE email IS NOT NULL
GROUP BY LOWER(TRIM(email))
HAVING COUNT(*) > 1;
```

`ARRAY_AGG(customer_id)` liệt kê luôn các id liên quan — rất tiện khi phải gộp dữ liệu thủ công sau đó.

## Xoá bản ghi trùng, giữ lại một

Đây là phần đề bài yêu cầu cụ thể nhất, và cũng là nơi dễ xoá nhầm nhất.

### Cách chuẩn: `ROW_NUMBER` + `DELETE USING`

```sql
-- BƯỚC 1: LUÔN chạy SELECT trước để xem sẽ xoá cái gì
WITH danh_so AS (
    SELECT customer_id,
           ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(email))
                              ORDER BY created_at DESC, customer_id DESC) AS thu_tu
    FROM customers
    WHERE email IS NOT NULL
)
SELECT * FROM customers
WHERE customer_id IN (SELECT customer_id FROM danh_so WHERE thu_tu > 1);

-- BƯỚC 2: đổi thành DELETE, bọc trong transaction
BEGIN;
WITH danh_so AS (
    SELECT customer_id,
           ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(email))
                              ORDER BY created_at DESC, customer_id DESC) AS thu_tu
    FROM customers
    WHERE email IS NOT NULL
)
DELETE FROM customers c
USING danh_so d
WHERE c.customer_id = d.customer_id
  AND d.thu_tu > 1;
-- kiểm tra số dòng bị xoá, rồi COMMIT hoặc ROLLBACK
COMMIT;
```

Chi tiết then chốt: `ORDER BY created_at DESC, customer_id DESC` quyết định **dòng nào được giữ**. Thiếu tiêu chí phá hoà (`customer_id`), hai dòng cùng `created_at` sẽ được chọn tuỳ ý — chạy lại có thể ra kết quả khác. Đây chính xác là chỗ người phỏng vấn hỏi vặn.

### Các biến thể theo hệ quản trị

```sql
-- PostgreSQL: mẹo dùng ctid khi bảng KHÔNG có khoá chính
DELETE FROM ban_ghi_log a
USING ban_ghi_log b
WHERE a.ctid > b.ctid          -- ctid là định danh vật lý của dòng
  AND a.email = b.email;

-- MySQL 8: self join, giữ id nhỏ nhất
DELETE c1 FROM customers c1
JOIN customers c2
  ON c1.email = c2.email
 AND c1.customer_id > c2.customer_id;

-- Cách di động, an toàn nhất với bảng RẤT lớn: tạo bảng mới rồi đổi tên
CREATE TABLE customers_sach AS
SELECT DISTINCT ON (LOWER(TRIM(email))) *      -- DISTINCT ON là cú pháp riêng của Postgres
FROM customers
ORDER BY LOWER(TRIM(email)), created_at DESC;

BEGIN;
ALTER TABLE customers        RENAME TO customers_cu;
ALTER TABLE customers_sach   RENAME TO customers;
COMMIT;
```

Cách cuối phù hợp khi số dòng trùng rất lớn: `DELETE` hàng chục triệu dòng tạo ra khối lượng dòng chết khổng lồ cần `VACUUM`, trong khi tạo bảng mới thì rẻ hơn nhiều. Đổi lại phải xử lý khoá ngoại, index và trigger — nêu được trade-off này là câu trả lời đầy đủ.

> **Quy tắc bất di bất dịch trước khi xoá dữ liệu thật**: sao lưu bảng (`CREATE TABLE ... AS SELECT * FROM ...`), chạy `SELECT` kiểm tra đúng bằng mệnh đề `WHERE` sẽ dùng, bọc transaction, và xoá theo lô nếu số lượng lớn.

## Phòng ngừa: ràng buộc ở tầng database

Xoá trùng là chữa cháy. Chặn từ gốc mới là giải pháp.

```sql
-- Ràng buộc unique cơ bản
ALTER TABLE customers ADD CONSTRAINT uq_customers_email UNIQUE (email);

-- Unique trên giá trị đã chuẩn hoá — chặn được cả "A@Shop.vn" lẫn " a@shop.vn "
CREATE UNIQUE INDEX uq_customers_email_chuan ON customers (LOWER(TRIM(email)));

-- Unique có điều kiện: chỉ áp cho bản ghi chưa xoá mềm
CREATE UNIQUE INDEX uq_customers_email_active
    ON customers (email) WHERE deleted_at IS NULL;

-- Mỗi khách chỉ được có MỘT đơn nháp tại một thời điểm
CREATE UNIQUE INDEX uq_orders_draft
    ON orders (customer_id) WHERE status = 'draft';
```

Hai điểm cần nhớ, đều là câu hỏi phỏng vấn:

**`UNIQUE` cho phép nhiều dòng NULL**, vì `NULL <> NULL` (xem [phase-2 bài 3](../phase-2/03-union-intersect-except-va-logic-3-tri.md)). Nếu nghiệp vụ yêu cầu "chỉ một dòng được để trống", cần partial unique index riêng.

**Thêm ràng buộc lên bảng đang có dữ liệu trùng sẽ thất bại.** Quy trình đúng trên bảng lớn đang chạy:

```sql
-- 1. Dọn trùng (theo cách ở trên)
-- 2. Tạo index unique KHÔNG khoá ghi
CREATE UNIQUE INDEX CONCURRENTLY uq_customers_email ON customers (email);
-- 3. Gắn index đã có thành ràng buộc (thao tác metadata, rất nhanh)
ALTER TABLE customers ADD CONSTRAINT uq_customers_email UNIQUE USING INDEX uq_customers_email;
```

## UPSERT: chèn hoặc cập nhật

### Cách sai kinh điển

```python
# ĐUA TRANH (race condition): hai request đồng thời cùng đi qua nhánh else
row = db.query("SELECT * FROM customers WHERE email = %s", email)
if row:
    db.execute("UPDATE customers SET city = %s WHERE email = %s", (city, email))
else:
    db.execute("INSERT INTO customers (email, city) VALUES (%s, %s)", (email, city))
```

```text
Thời điểm  Request A                    Request B
─────────  ──────────────────────────   ──────────────────────────
   t1      SELECT → không thấy
   t2                                   SELECT → không thấy
   t3      INSERT → thành công
   t4                                   INSERT → LỖI trùng khoá (hoặc tạo bản ghi trùng)
```

Khoảng trống giữa "kiểm tra" và "hành động" là nơi bug sinh ra. Không có mức isolation nào ở tầng mặc định đóng được khoảng trống này — phải để database xử lý nguyên tử.

> **"Race condition" và "nguyên tử" nghĩa là gì?**
>
> **Race condition** (đua tranh) là tình huống mà **kết quả phụ thuộc vào việc hai tiến trình chạy nhanh chậm ra sao**. Tên gọi đến từ hình ảnh hai người cùng chạy đua tới một đích: ai tới trước thay đổi hoàn toàn kết quả. Đặc điểm khó chịu nhất của loại bug này: nó **không tái hiện được** khi bạn thử tay, vì lúc đó chỉ có một mình bạn chạy. Nó chỉ xuất hiện khi có tải thật, và thường là vào giờ cao điểm.
>
> **Nguyên tử** (*atomic*) nghĩa là thao tác **không thể bị chen ngang giữa chừng**. Nó hoặc chưa xảy ra, hoặc đã xong hoàn toàn — không có trạng thái nửa vời cho tiến trình khác nhìn thấy.
>
> ```text
> KHÔNG nguyên tử (2 bước rời)        NGUYÊN TỬ (1 bước)
> ─────────────────────────────       ──────────────────────────────
> ① SELECT xem đã có chưa             ① INSERT ... ON CONFLICT ...
>    ← KHE HỞ ở đây: tiến trình
>      khác chen vào được                 Không có khe hở nào để chen.
> ② INSERT                                Database tự đảm bảo.
> ```
>
> Nguyên tắc chung rút ra được, áp dụng cho mọi bài toán đồng thời: **đừng tách "kiểm tra" và "hành động" thành hai câu lệnh**. Hãy gộp chúng thành một câu lệnh duy nhất và để database lo phần còn lại.

### Cách đúng: `ON CONFLICT` (PostgreSQL)

```sql
INSERT INTO customers (email, full_name, city)
VALUES ('a@shop.vn', 'Khach A', 'Ha Noi')
ON CONFLICT (email)
DO UPDATE SET full_name = EXCLUDED.full_name,      -- EXCLUDED = dòng ĐỊNH chèn
              city      = EXCLUDED.city,
              updated_at = now()
RETURNING customer_id, (xmax = 0) AS la_ban_ghi_moi;
```

`EXCLUDED` là bảng ảo chứa giá trị bạn định chèn. Mẹo `xmax = 0` cho biết dòng vừa được chèn mới hay được cập nhật — rất tiện khi cần đếm thống kê nhập liệu.

```sql
-- Bỏ qua nếu đã tồn tại (không cập nhật gì)
INSERT INTO customers (email, full_name) VALUES ('a@shop.vn', 'Khach A')
ON CONFLICT (email) DO NOTHING;

-- Chỉ cập nhật khi dữ liệu mới hơn — chống ghi đè bằng dữ liệu cũ đến muộn
INSERT INTO customers (email, city, updated_at) VALUES ('a@shop.vn', 'Da Nang', now())
ON CONFLICT (email) DO UPDATE
SET city = EXCLUDED.city, updated_at = EXCLUDED.updated_at
WHERE customers.updated_at < EXCLUDED.updated_at;   -- điều kiện bảo vệ
```

Mệnh đề `WHERE` cuối cùng đáng giá: trong hệ thống có nhiều consumer xử lý message không theo thứ tự, nó ngăn một message cũ ghi đè lên trạng thái mới. Đây là kỹ thuật rất đáng nhắc khi phỏng vấn vị trí backend.

### Cú pháp các hệ khác

```sql
-- MySQL 8
INSERT INTO customers (email, full_name) VALUES ('a@shop.vn', 'Khach A')
AS moi
ON DUPLICATE KEY UPDATE full_name = moi.full_name;
-- (cú pháp cũ dùng VALUES(full_name), đã bị đánh dấu lỗi thời từ 8.0.20)

-- Chuẩn SQL: MERGE — có trên PostgreSQL 15+, SQL Server, Oracle
MERGE INTO customers AS t
USING (VALUES ('a@shop.vn', 'Khach A')) AS s(email, full_name)
ON t.email = s.email
WHEN MATCHED     THEN UPDATE SET full_name = s.full_name
WHEN NOT MATCHED THEN INSERT (email, full_name) VALUES (s.email, s.full_name);
```

| Cú pháp | Hệ | Ưu điểm | Hạn chế |
|---|---|---|---|
| `ON CONFLICT` | PostgreSQL 9.5+ | Nguyên tử, có `RETURNING`, hỗ trợ điều kiện | Cần một ràng buộc unique để "va chạm" |
| `ON DUPLICATE KEY UPDATE` | MySQL | Gọn | Kích hoạt bởi **mọi** khoá unique, khó kiểm soát |
| `MERGE` | Chuẩn SQL | Diễn đạt được nhiều nhánh, cả `DELETE` | Dài dòng; từng có vấn đề đua tranh trên vài hệ |

**Điểm quan trọng nhất về `ON CONFLICT`**: nó cần một ràng buộc unique để phát hiện xung đột. Không có `UNIQUE(email)` thì không có upsert — điều đó nối thẳng về phần ràng buộc ở trên.

## Idempotency: chống trùng ở tầng nghiệp vụ

Ràng buộc unique xử lý trùng theo **khoá dữ liệu**. Nhưng có loại trùng mà dữ liệu hoàn toàn hợp lệ: người dùng bấm "Thanh toán" hai lần, mỗi lần tạo một giao dịch khác nhau nhưng ý định chỉ có một. Đây là bài toán idempotency.

```sql
ALTER TABLE payments ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX uq_payments_idem ON payments (idempotency_key)
    WHERE idempotency_key IS NOT NULL;
```

```python
# Client sinh khoá một lần cho mỗi ý định thanh toán và gửi kèm mọi lần thử lại
def thanh_toan(order_id, so_tien, idem_key):
    row = db.execute("""
        INSERT INTO payments (order_id, amount, idempotency_key, paid_at)
        VALUES (%s, %s, %s, now())
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING payment_id
    """, (order_id, so_tien, idem_key)).fetchone()

    if row is None:
        # Đã xử lý trước đó → trả về kết quả cũ, KHÔNG tính tiền lần nữa
        return db.query("SELECT * FROM payments WHERE idempotency_key = %s", idem_key)
    return row
```

Mẫu này là câu trả lời chuẩn cho câu hỏi *"làm sao đảm bảo webhook / thanh toán không bị xử lý hai lần?"* — một câu rất hay gặp ở phỏng vấn backend. Ba yếu tố cần nêu đủ: khoá do **client** sinh (không phải server), ràng buộc unique ở database, và nhánh xử lý trả về kết quả cũ khi phát hiện trùng.

Áp dụng tương tự cho ETL:

```sql
-- Khoá tự nhiên từ nguồn, đảm bảo chạy lại job không nhân đôi dữ liệu
CREATE UNIQUE INDEX ON su_kien_nhap (nguon, id_ben_nguon);

INSERT INTO su_kien_nhap (nguon, id_ben_nguon, payload, nhap_luc)
SELECT 'kafka', s.id, s.payload, now()
FROM staging s
ON CONFLICT (nguon, id_ben_nguon) DO NOTHING;
```

## Lịch sử thay đổi: SCD Type 2

Khi cần lưu lại **lịch sử** thay vì ghi đè — ví dụ giá sản phẩm theo thời gian, hoặc địa chỉ khách hàng qua các lần thay đổi:

```sql
CREATE TABLE customer_history (
    history_id  BIGSERIAL PRIMARY KEY,
    customer_id INT         NOT NULL,
    city        TEXT,
    valid_from  TIMESTAMPTZ NOT NULL,
    valid_to    TIMESTAMPTZ,                  -- NULL = phiên bản đang hiệu lực
    la_hien_tai BOOLEAN     NOT NULL DEFAULT TRUE
);

-- Chỉ được có MỘT phiên bản hiện tại cho mỗi khách
CREATE UNIQUE INDEX ON customer_history (customer_id) WHERE la_hien_tai;
```

```sql
-- Ghi nhận thay đổi: đóng phiên bản cũ và mở phiên bản mới trong MỘT transaction
BEGIN;
UPDATE customer_history
SET valid_to = now(), la_hien_tai = FALSE
WHERE customer_id = 1 AND la_hien_tai
  AND city IS DISTINCT FROM 'Da Nang';        -- không tạo phiên bản mới nếu không đổi

INSERT INTO customer_history (customer_id, city, valid_from)
SELECT 1, 'Da Nang', now()
WHERE NOT EXISTS (
    SELECT 1 FROM customer_history WHERE customer_id = 1 AND la_hien_tai
);
COMMIT;
```

`IS DISTINCT FROM` ở đây là bắt buộc — dùng `<>` sẽ bỏ sót trường hợp giá trị chuyển từ `NULL` sang có giá trị và ngược lại, tạo ra lịch sử thiếu. Đúng bài học ở [phase-2 bài 3](../phase-2/03-union-intersect-except-va-logic-3-tri.md).

Truy vấn trạng thái tại một thời điểm bất kỳ trong quá khứ:

```sql
SELECT * FROM customer_history
WHERE customer_id = 1
  AND valid_from <= '2024-05-01'
  AND (valid_to > '2024-05-01' OR valid_to IS NULL);
```

## Bộ kiểm tra chất lượng dữ liệu

Nên chạy định kỳ (hoặc trong CI của pipeline dữ liệu) — và là câu trả lời tốt cho *"bạn đảm bảo chất lượng dữ liệu thế nào?"*:

```sql
-- 1. Trùng khoá nghiệp vụ
SELECT 'email trung' AS loi, LOWER(TRIM(email)) AS gia_tri, COUNT(*)
FROM customers WHERE email IS NOT NULL
GROUP BY 2 HAVING COUNT(*) > 1

UNION ALL

-- 2. Khoá ngoại mồ côi (khi ràng buộc FK chưa được áp)
SELECT 'don khong co khach', o.order_id::text, 1
FROM orders o
WHERE NOT EXISTS (SELECT 1 FROM customers c WHERE c.customer_id = o.customer_id)

UNION ALL

-- 3. Sai lệch số học giữa bảng tổng và bảng chi tiết
SELECT 'tong tien lech', o.order_id::text, 1
FROM orders o
JOIN (SELECT order_id, SUM(quantity * unit_price) AS tong
      FROM order_items GROUP BY order_id) i ON i.order_id = o.order_id
WHERE ABS(o.total_amount - i.tong) > 1;
```

Kiểm tra số 3 chính là thứ phát hiện được các bug fanout đã học ở [phase-1 bài 3](../phase-1/03-join-nang-cao-fanout-on-vs-where-va-thuat-toan-join.md) — trước khi kế toán phát hiện.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| `DELETE` trùng không có tiêu chí phá hoà | Xoá tuỳ ý, chạy lại ra khác | `ORDER BY ..., khoá_chính` |
| Xoá trùng mà không sao lưu trước | Mất dữ liệu vĩnh viễn | `CREATE TABLE ... AS SELECT` trước |
| Dedup không chuẩn hoá khoá | Bỏ sót `"A@Shop.vn"` và `" a@shop.vn "` | `LOWER(TRIM(...))` |
| Mẫu "kiểm tra rồi chèn" ở tầng ứng dụng | Đua tranh, vẫn trùng | `ON CONFLICT` |
| Tin `UNIQUE` chặn được NULL trùng | Nhiều dòng NULL cùng tồn tại | Partial unique index |
| `ON CONFLICT` không có ràng buộc unique | Lỗi lúc chạy | Tạo ràng buộc trước |
| `CREATE UNIQUE INDEX` không `CONCURRENTLY` | Khoá ghi cả bảng | Luôn `CONCURRENTLY` trên production |
| So sánh cột nullable bằng `<>` trong SCD | Bỏ sót thay đổi, lịch sử thiếu | `IS DISTINCT FROM` |
| Khoá idempotency do server sinh | Vô nghĩa — mỗi lần thử lại một khoá mới | Client sinh, gửi kèm mọi lần thử |

## Câu hỏi phỏng vấn hay gặp

**"Tìm và xoá bản ghi trùng, giữ lại bản mới nhất."**
Trình bày ba phần: (1) `ROW_NUMBER() OVER (PARTITION BY khoá ORDER BY thời_gian DESC, id DESC)`, xoá `thu_tu > 1`; (2) nhấn mạnh chạy `SELECT` trước và bọc transaction; (3) thêm ràng buộc unique để không tái diễn. Vế (3) là thứ phân biệt ứng viên tốt.

**"Làm sao đảm bảo API không tạo bản ghi trùng khi client gửi lại request?"**
Khoá idempotency do client sinh + unique index + `ON CONFLICT DO NOTHING` + trả về kết quả lần xử lý đầu. Giải thích rõ vì sao mẫu "kiểm tra rồi chèn" ở tầng ứng dụng không đủ.

**"`ON CONFLICT DO NOTHING` và `DO UPDATE` khác nhau khi nào?"**
`DO NOTHING` bỏ qua dòng xung đột, không trả về gì trong `RETURNING` — nên phải xử lý trường hợp kết quả rỗng. `DO UPDATE` cập nhật dòng đã có và trả về nó. Chọn `DO NOTHING` cho nhập dữ liệu chỉ-thêm (append-only), chọn `DO UPDATE` khi cần đồng bộ trạng thái mới nhất.

**"Bảng 100 triệu dòng có 5 triệu bản trùng, xoá thế nào?"**
Không `DELETE` một phát: tạo bảng sạch bằng `DISTINCT ON` rồi đổi tên, hoặc xoá theo lô như [phase-3 bài 4](../phase-3/04-phan-trang-va-xu-ly-bang-lon.md). Nhắc tới khoá ngoại, index và trigger cần dựng lại nếu chọn cách đổi bảng.

**"Vì sao vẫn có bản ghi trùng dù đã có ràng buộc unique?"**
Vài nguyên nhân thực tế: ràng buộc đặt trên cột chưa chuẩn hoá (hoa/thường, khoảng trắng), cột chứa NULL nên unique không áp, ràng buộc mới được thêm sau khi dữ liệu bẩn đã tồn tại, hoặc dữ liệu vào qua một đường khác (bảng staging, replica ghi).

## Tóm tắt bài 2

- Tìm trùng bằng `GROUP BY ... HAVING COUNT(*) > 1`, hoặc window function để lấy đủ thông tin dòng.
- Xoá trùng bằng `ROW_NUMBER` + `DELETE USING`; **bắt buộc** có tiêu chí phá hoà trong `ORDER BY`.
- Luôn sao lưu, chạy `SELECT` kiểm tra, và bọc transaction trước khi xoá dữ liệu thật.
- Chặn từ gốc bằng ràng buộc unique — kể cả unique trên giá trị đã chuẩn hoá và unique có điều kiện.
- Mẫu "kiểm tra rồi chèn" ở tầng ứng dụng luôn có đua tranh; dùng `ON CONFLICT` để database xử lý nguyên tử.
- Idempotency key do **client** sinh là cách chuẩn chống xử lý trùng cho thanh toán và webhook.
- Trong SCD Type 2, dùng `IS DISTINCT FROM` để không bỏ sót thay đổi liên quan tới NULL.

**Bài kế tiếp** → [Bài 3: Transaction, isolation và khoá trong phỏng vấn](03-transaction-isolation-va-khoa-trong-phong-van.md)
