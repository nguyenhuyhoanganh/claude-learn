# Bài 0: Từ điển từ khoá SQL cho người mới

Nếu bạn mới học SQL, cảm giác đầu tiên khi nhìn một câu lệnh dài thường là hoang mang: một đống chữ in hoa xếp cạnh nhau, không rõ chữ nào là lệnh, chữ nào là tên bảng, chữ nào là do người viết tự đặt. Bài này giải quyết đúng vấn đề đó.

Đây là bài **nền**: giải thích từng từ khoá làm gì, kèm ví dụ nhỏ nhất chạy được và cái bẫy hay gặp của người mới. Sau bài này bạn sẽ **đọc hiểu** được một câu SQL lạ, và đó là điều kiện cần trước khi bước vào các bài phỏng vấn phía sau.

> Nếu bạn đã viết SQL thành thạo, có thể nhảy thẳng sang [Bài 1](01-vi-sao-8-tren-10-ung-vien-truot-vong-sql.md). Nhưng phần "Đọc một câu SQL lạ trong năm bước" ở cuối bài thì đáng đọc dù ở cấp nào.

## SQL là ngôn ngữ khai báo — bạn nói CÁI GÌ, không nói LÀM SAO

Đây là khác biệt lớn nhất so với Python, Java hay JavaScript, và cũng là thứ khiến người mới thấy SQL "kỳ lạ":

```text
NGÔN NGỮ MỆNH LỆNH (Python)          NGÔN NGỮ KHAI BÁO (SQL)
────────────────────────────         ──────────────────────────────
ket_qua = []                          SELECT full_name
for kh in danh_sach_khach:            FROM customers
    if kh.city == 'Ha Noi':           WHERE city = 'Ha Noi';
        ket_qua.append(kh.full_name)
                                      → Bạn MÔ TẢ kết quả mong muốn.
→ Bạn RA LỆNH từng bước.                Database tự quyết định cách lấy:
  Máy làm đúng thứ tự bạn viết.         quét cả bảng? dùng index? song song?
```

Hệ quả cho người mới: **bạn không điều khiển được cách database chạy**, chỉ mô tả kết quả. Đó là lý do hai câu SQL viết khác nhau có thể cho cùng tốc độ, và cũng là lý do phần tối ưu (phase 3) tồn tại — bạn tối ưu bằng cách *gợi ý* cho database, chứ không ra lệnh trực tiếp.

## Năm nhóm câu lệnh SQL

Người phỏng vấn hay hỏi "DDL với DML khác gì nhau" ngay ở vòng đầu. Bảng này trả lời:

| Nhóm | Tên đầy đủ | Làm gì | Từ khoá chính |
|---|---|---|---|
| **DQL** | Data Query Language | **Đọc** dữ liệu | `SELECT` |
| **DML** | Data Manipulation Language | **Thay đổi** dữ liệu trong bảng | `INSERT`, `UPDATE`, `DELETE` |
| **DDL** | Data Definition Language | Thay đổi **cấu trúc** (bảng, cột, index) | `CREATE`, `ALTER`, `DROP`, `TRUNCATE` |
| **DCL** | Data Control Language | Phân quyền | `GRANT`, `REVOKE` |
| **TCL** | Transaction Control Language | Quản lý giao dịch | `BEGIN`, `COMMIT`, `ROLLBACK` |

Điểm dễ nhớ: **DML đụng vào *dòng*, DDL đụng vào *bảng***. `DELETE FROM orders` (DML) xoá các dòng nhưng bảng vẫn còn; `DROP TABLE orders` (DDL) xoá luôn cả bảng.

Một chi tiết hay được hỏi vặn: DDL trong nhiều hệ (MySQL, Oracle) **tự động commit** — nghĩa là chạy rồi thì không rollback được. PostgreSQL thì khác, DDL nằm trong transaction được, nên có thể `ROLLBACK`. Đây là lý do người ta cẩn thận với `ALTER TABLE` trên MySQL hơn nhiều.

## Giải phẫu một câu SELECT

```text
SELECT  c.full_name  AS  ten_khach ,  COUNT(o.order_id)  AS  so_don
  ▲         ▲         ▲      ▲              ▲
  │         │         │      │              └─ HÀM: tính toán trên nhiều dòng
  │         │         │      └─ ALIAS: tên bạn TỰ ĐẶT cho cột kết quả
  │         │         └─ từ khoá AS (có thể bỏ, nhưng nên viết cho rõ)
  │         └─ CỘT, viết dạng <alias_bảng>.<tên_cột>
  └─ từ khoá: chọn những gì sẽ hiện ra

FROM customers AS c
  ▲      ▲         ▲
  │      │         └─ ALIAS BẢNG: viết tắt để câu lệnh gọn
  │      └─ TÊN BẢNG có thật trong database
  └─ từ khoá: lấy dữ liệu từ đâu

LEFT JOIN orders AS o  ON  o.customer_id = c.customer_id
    ▲                  ▲            ▲
    │                  │            └─ ĐIỀU KIỆN GHÉP: dòng nào của o khớp dòng nào của c
    │                  └─ từ khoá ON: mở đầu điều kiện ghép
    └─ ghép thêm bảng thứ hai vào

WHERE c.city = 'Ha Noi'          ← LỌC: chỉ giữ dòng thoả điều kiện
GROUP BY c.customer_id, c.full_name   ← GOM: các dòng giống nhau thành một nhóm
HAVING COUNT(o.order_id) > 1     ← LỌC NHÓM: chỉ giữ nhóm thoả điều kiện
ORDER BY so_don DESC             ← SẮP XẾP kết quả
LIMIT 10;                        ← chỉ lấy 10 dòng đầu   (dấu ; kết thúc câu lệnh)
```

Ba thứ người mới hay nhầm lẫn trong hình trên:

1. **Tên bảng/cột** là thứ có thật trong database — bạn không đặt ra được.
2. **Alias** là tên bạn tự đặt, chỉ tồn tại trong câu lệnh đó. `c`, `o`, `ten_khach` đều là alias.
3. **Từ khoá** (`SELECT`, `FROM`, `WHERE`...) là từ của ngôn ngữ SQL, không thể đổi.

Viết hoa từ khoá không bắt buộc — `select` chạy y hệt `SELECT` — nhưng viết hoa giúp phân biệt ngay đâu là từ của SQL, đâu là tên do người viết đặt. Đây là quy ước gần như mọi nơi đều theo.

## Nhóm 1: Chọn và lọc dữ liệu

### `SELECT` — chọn cột nào sẽ hiện ra

```sql
SELECT full_name, email FROM customers;   -- chỉ hai cột
SELECT * FROM customers;                  -- MỌI cột (tiện khi khám phá, tránh trong code thật)
SELECT 1 + 1;                             -- không cần bảng nào cả → trả về 2
SELECT full_name, salary * 12 AS luong_nam FROM employees;   -- tính toán ngay trong SELECT
```

**Bẫy người mới**: `SELECT *` rất tiện khi bạn đang xem thử dữ liệu, nhưng trong code chạy thật thì nên liệt kê cột — vì khi ai đó thêm cột mới vào bảng, query của bạn âm thầm kéo thêm dữ liệu không cần.

### `AS` — đặt tên cho cột hoặc bảng (alias)

```sql
SELECT full_name AS ten, salary AS luong FROM employees AS e;
SELECT full_name    ten, salary    luong FROM employees    e;   -- bỏ AS cũng được
```

Alias cho **cột** làm kết quả dễ đọc. Alias cho **bảng** làm câu lệnh gọn khi có nhiều bảng. Nếu tên alias có dấu cách hoặc chữ hoa, phải bọc trong nháy kép: `AS "Ten Khach Hang"`.

### `DISTINCT` — bỏ dòng trùng lặp

```sql
SELECT city FROM customers;            -- Ha Noi, Ho Chi Minh, Ha Noi, NULL, Da Nang
SELECT DISTINCT city FROM customers;   -- Ha Noi, Ho Chi Minh, Da Nang, NULL
```

**Bẫy quan trọng**: `DISTINCT` áp cho **toàn bộ danh sách cột**, không riêng cột đầu tiên.

```sql
SELECT DISTINCT city, full_name FROM customers;
-- Đây là "các cặp (city, full_name) khác nhau", KHÔNG phải "mỗi city một dòng".
-- Vì full_name gần như luôn khác nhau, kết quả sẽ ra gần đủ mọi dòng.
```

### `WHERE` — lọc dòng

```sql
SELECT * FROM orders WHERE total_amount > 1000000;
```

Bảng toán tử đầy đủ cho người mới:

| Toán tử | Nghĩa | Ví dụ |
|---|---|---|
| `=` | Bằng | `WHERE city = 'Ha Noi'` |
| `<>` hoặc `!=` | Khác | `WHERE status <> 'cancelled'` |
| `>` `<` `>=` `<=` | So sánh | `WHERE salary >= 40000000` |
| `BETWEEN a AND b` | Trong khoảng, **bao gồm hai đầu** | `WHERE salary BETWEEN 30000000 AND 50000000` |
| `IN (...)` | Thuộc danh sách | `WHERE status IN ('paid', 'shipped')` |
| `NOT IN (...)` | Không thuộc danh sách | `WHERE city NOT IN ('Ha Noi')` |
| `LIKE` | Khớp mẫu chuỗi | `WHERE name LIKE 'Ban%'` |
| `IS NULL` / `IS NOT NULL` | Rỗng / không rỗng | `WHERE email IS NULL` |
| `AND` `OR` `NOT` | Ghép điều kiện | `WHERE city = 'Ha Noi' AND salary > 40000000` |

Chi tiết về `LIKE`:

```sql
WHERE name LIKE 'Ban%'    -- BẮT ĐẦU bằng "Ban"     (% = không hoặc nhiều ký tự)
WHERE name LIKE '%phim'   -- KẾT THÚC bằng "phim"
WHERE name LIKE '%phim%'  -- CHỨA "phim" ở bất kỳ đâu
WHERE name LIKE 'B_n'     -- đúng 3 ký tự: B, một ký tự bất kỳ, n   (_ = đúng 1 ký tự)
WHERE name ILIKE '%PHIM%' -- không phân biệt hoa thường (PostgreSQL)
```

**Ba bẫy `WHERE` mà người mới nào cũng dính ít nhất một lần:**

```sql
-- Bẫy 1: so sánh với NULL bằng dấu =
WHERE email = NULL       -- SAI, không bao giờ đúng, trả về 0 dòng
WHERE email IS NULL      -- ĐÚNG

-- Bẫy 2: quên ngoặc khi trộn AND với OR
WHERE city = 'Ha Noi' OR city = 'Da Nang' AND salary > 40000000
-- AND được ưu tiên hơn OR, nên câu trên được hiểu là:
--   city='Ha Noi' OR (city='Da Nang' AND salary>40000000)
-- Muốn ý khác thì phải tự đặt ngoặc:
WHERE (city = 'Ha Noi' OR city = 'Da Nang') AND salary > 40000000

-- Bẫy 3: nháy đơn và nháy kép không giống nhau
WHERE city = 'Ha Noi'    -- ĐÚNG: nháy ĐƠN cho giá trị chuỗi
WHERE city = "Ha Noi"    -- SAI trên PostgreSQL: nháy KÉP là để chỉ TÊN cột/bảng
                         --   → nó đi tìm một CỘT tên "Ha Noi" và báo lỗi
```

Bẫy 3 gây nhầm lẫn nhiều vì trong MySQL nháy kép cũng dùng được cho chuỗi. Cứ nhớ quy tắc chuẩn: **nháy đơn cho giá trị, nháy kép cho tên**.

### `ORDER BY` — sắp xếp

```sql
SELECT full_name, salary FROM employees ORDER BY salary DESC;         -- giảm dần
SELECT full_name, salary FROM employees ORDER BY salary;              -- tăng dần (mặc định)
SELECT * FROM employees ORDER BY dept_id ASC, salary DESC;            -- nhiều tiêu chí
SELECT full_name, salary AS luong FROM employees ORDER BY luong DESC; -- dùng được ALIAS
```

Sắp xếp nhiều tiêu chí đọc như sau: sắp theo `dept_id` trước; **trong cùng một `dept_id`** thì sắp tiếp theo `salary` giảm dần.

**Bẫy NULL khi sắp xếp**: PostgreSQL đặt NULL ở cuối khi `ASC`, MySQL đặt ở đầu. Muốn chắc chắn thì viết rõ:

```sql
ORDER BY city ASC NULLS LAST;     -- PostgreSQL, Oracle
ORDER BY city IS NULL, city;      -- cách chạy được trên mọi hệ
```

### `LIMIT` và `OFFSET` — cắt bớt kết quả

```sql
SELECT * FROM orders ORDER BY ordered_at DESC LIMIT 10;             -- 10 đơn mới nhất
SELECT * FROM orders ORDER BY ordered_at DESC LIMIT 10 OFFSET 20;   -- bỏ 20 dòng, lấy 10 tiếp
```

**Bẫy nghiêm trọng**: `LIMIT` mà **không có `ORDER BY`** thì kết quả **không xác định**. Database được phép trả về bất kỳ 10 dòng nào, và hai lần chạy có thể ra khác nhau. Luôn đi kèm `ORDER BY` khi dùng `LIMIT`.

> Cú pháp khác nhau giữa các hệ: PostgreSQL và MySQL dùng `LIMIT n OFFSET m`; SQL Server dùng `OFFSET m ROWS FETCH NEXT n ROWS ONLY`; Oracle cũ dùng `ROWNUM`.

## Nhóm 2: Ghép bảng

### `JOIN` và `ON`

```sql
SELECT c.full_name, o.total_amount
FROM customers AS c
JOIN orders AS o ON o.customer_id = c.customer_id;
```

Đọc câu này thành lời: *"Lấy từ bảng khách hàng, ghép thêm bảng đơn hàng, ghép theo quy tắc: `customer_id` của đơn phải bằng `customer_id` của khách."*

`ON` trả lời câu hỏi **"dòng nào của bảng này ứng với dòng nào của bảng kia?"**. Nó khác hoàn toàn với `WHERE` (lọc bỏ dòng) — sự khác biệt đó là chủ đề của cả [Bài 3](03-join-nang-cao-fanout-on-vs-where-va-thuat-toan-join.md).

| Loại JOIN | Giữ lại gì |
|---|---|
| `INNER JOIN` (viết tắt: `JOIN`) | Chỉ dòng match được ở **cả hai** bảng |
| `LEFT JOIN` | **Toàn bộ** bảng trái + phần match |
| `RIGHT JOIN` | Toàn bộ bảng phải + phần match |
| `FULL OUTER JOIN` | Tất cả từ cả hai bên |
| `CROSS JOIN` | Mọi cặp có thể (không có `ON`) |

Đây mới chỉ là bảng tra; cơ chế hoạt động và các bẫy đi kèm được đào sâu ở [Bài 2](02-join-inner-vs-left-va-bai-toan-khach-chua-mua.md).

**Bẫy người mới**: quên `ON`. Nếu viết `FROM customers, orders` mà không có điều kiện ghép, bạn nhận được **mọi cặp có thể** — 5 khách × 5 đơn = 25 dòng vô nghĩa. Với bảng thật hàng triệu dòng thì query sẽ treo.

## Nhóm 3: Gom nhóm và tính toán

### Các hàm aggregate (hàm tổng hợp)

"Aggregate" nghĩa là **gộp nhiều dòng lại thành một giá trị**:

```sql
SELECT COUNT(*)          AS so_don,      -- đếm số dòng
       SUM(total_amount) AS tong_tien,   -- cộng dồn
       AVG(total_amount) AS trung_binh,  -- trung bình
       MAX(total_amount) AS lon_nhat,
       MIN(total_amount) AS nho_nhat
FROM orders;
```

Không có `GROUP BY` thì cả bảng được coi là **một nhóm duy nhất**, và kết quả luôn là đúng một dòng.

**Bẫy NULL với aggregate** (quan trọng, sẽ gặp lại nhiều lần trong series):

```text
Cột điểm có các giá trị: 10, 8, NULL, NULL, 6

COUNT(*)     = 5     ← đếm DÒNG, kể cả dòng NULL
COUNT(diem)  = 3     ← chỉ đếm giá trị KHÁC NULL
SUM(diem)    = 24    ← bỏ qua NULL
AVG(diem)    = 8.0   ← 24 chia cho 3, KHÔNG phải chia 5!
```

### `GROUP BY` — gom dòng thành nhóm

```sql
SELECT dept_id, COUNT(*) AS so_nguoi, AVG(salary) AS luong_tb
FROM employees
GROUP BY dept_id;
```

Đọc thành lời: *"Gom các nhân viên có cùng `dept_id` thành một nhóm, rồi với mỗi nhóm tính số người và lương trung bình."*

**Luật vàng của `GROUP BY`** — luật khiến người mới gặp lỗi nhiều nhất: sau khi gom nhóm, trong `SELECT` bạn chỉ được viết hai loại thứ:

```text
① Cột có mặt trong GROUP BY
② Hàm aggregate: COUNT, SUM, AVG, MAX, MIN
```

```sql
-- SAI: full_name không nằm trong GROUP BY và cũng không phải aggregate
SELECT dept_id, full_name, COUNT(*) FROM employees GROUP BY dept_id;
-- ERROR: column "employees.full_name" must appear in the GROUP BY clause
--        or be used in an aggregate function
```

Vì sao lỗi? Nhóm `dept_id = 1` gồm 4 người khác nhau. Database phải hiện `full_name` **của ai** trong 4 người đó? Không có câu trả lời hợp lý, nên nó báo lỗi thay vì đoán.

### `HAVING` — lọc nhóm

```sql
SELECT dept_id, COUNT(*) AS so_nguoi
FROM employees
GROUP BY dept_id
HAVING COUNT(*) > 2;
```

`WHERE` lọc **dòng**, `HAVING` lọc **nhóm**. Viết `WHERE COUNT(*) > 2` sẽ báo lỗi ngay — lý do đầy đủ nằm ở [Bài 4](04-group-by-having-va-nghe-thuat-aggregate.md).

## Nhóm 4: Các hàm hay dùng

```sql
-- Xử lý NULL
COALESCE(city, 'Chua ro')      -- trả về giá trị KHÁC NULL đầu tiên
NULLIF(so_don, 0)              -- trả về NULL nếu so_don = 0 (chống lỗi chia cho 0)

-- Rẽ nhánh
CASE WHEN salary > 50000000 THEN 'cao'
     WHEN salary > 35000000 THEN 'trung binh'
     ELSE 'thap' END AS muc_luong

-- Chuỗi
UPPER(name), LOWER(email), TRIM(city)          -- hoa, thường, cắt khoảng trắng thừa
LENGTH(name)                                    -- độ dài
CONCAT(first_name, ' ', last_name)              -- nối; PostgreSQL còn dùng được ||
SUBSTRING(email FROM 1 FOR 5)                   -- cắt chuỗi con

-- Số
ROUND(3.14159, 2)   -- 3.14
ABS(-5)             -- 5

-- Thời gian
CURRENT_DATE, NOW()                             -- hôm nay, bây giờ
date_trunc('month', ordered_at)                 -- cắt về đầu tháng (PostgreSQL)
ordered_at + INTERVAL '7 days'                  -- cộng thêm 7 ngày
EXTRACT(YEAR FROM ordered_at)                   -- lấy ra năm

-- Ép kiểu
CAST(total_amount AS INTEGER)
total_amount::INTEGER                           -- cách viết tắt của PostgreSQL
```

**Bẫy `CASE` cho người mới**: có hai dạng viết, và một dạng không xử lý được NULL.

```sql
-- Dạng đơn giản: so sánh bằng
CASE status WHEN 'paid' THEN 'da tra' WHEN 'pending' THEN 'cho' ELSE 'khac' END

-- Dạng đầy đủ: viết hẳn điều kiện — LINH HOẠT hơn và xử lý được NULL
CASE WHEN status = 'paid' THEN 'da tra'
     WHEN city IS NULL    THEN 'chua ro'      ← dạng đơn giản KHÔNG làm được việc này
     ELSE 'khac' END
```

Lý do: dạng đơn giản ngầm so sánh bằng `=`, mà `city = NULL` luôn cho kết quả "không biết" nên **không bao giờ khớp**. Cứ dùng dạng đầy đủ cho an toàn.

## Nhóm 5: Thay đổi dữ liệu

```sql
-- INSERT: thêm dòng mới
INSERT INTO customers (full_name, email, city)
VALUES ('Khach moi', 'moi@shop.vn', 'Ha Noi');

INSERT INTO customers (full_name, email) VALUES     -- thêm nhiều dòng một lần
    ('Khach 1', 'k1@shop.vn'),
    ('Khach 2', 'k2@shop.vn');

-- UPDATE: sửa dòng đã có
UPDATE customers SET city = 'Da Nang' WHERE customer_id = 1;

-- DELETE: xoá dòng
DELETE FROM customers WHERE customer_id = 99;
```

**Bẫy nguy hiểm nhất với người mới — quên `WHERE`:**

```sql
UPDATE customers SET city = 'Da Nang';   -- sửa TOÀN BỘ khách hàng!
DELETE FROM customers;                    -- xoá SẠCH bảng!
```

SQL không hỏi lại "bạn có chắc không". Nó thực hiện ngay. Thói quen bắt buộc phải rèn từ đầu:

```sql
-- BƯỚC 1: viết thành SELECT trước, xem đúng những dòng mình định đụng vào chưa
SELECT * FROM customers WHERE customer_id = 1;

-- BƯỚC 2: nếu đúng, đổi SELECT * thành UPDATE/DELETE, giữ NGUYÊN mệnh đề WHERE
UPDATE customers SET city = 'Da Nang' WHERE customer_id = 1;
```

An toàn hơn nữa là bọc trong transaction — sai thì hoàn tác được:

```sql
BEGIN;                                              -- mở giao dịch
DELETE FROM customers WHERE customer_id = 99;
-- kiểm tra kết quả: đúng số dòng bị ảnh hưởng chưa?
COMMIT;      -- xác nhận, thay đổi trở thành vĩnh viễn
-- ROLLBACK; -- hoặc huỷ, mọi thay đổi biến mất như chưa từng xảy ra
```

## Nhóm 6: Tạo bảng và ràng buộc

```sql
CREATE TABLE khach_hang (
    id         SERIAL PRIMARY KEY,             -- tự tăng + khoá chính
    ho_ten     VARCHAR(100) NOT NULL,          -- bắt buộc có giá trị
    email      VARCHAR(255) UNIQUE,            -- không được trùng
    tuoi       INT CHECK (tuoi >= 18),         -- phải thoả điều kiện
    thanh_pho  VARCHAR(50) DEFAULT 'Ha Noi',   -- giá trị mặc định nếu không truyền
    tao_luc    TIMESTAMP DEFAULT NOW(),
    nhom_id    INT REFERENCES nhom(id)         -- khoá ngoại: phải tồn tại ở bảng nhom
);
```

| Ràng buộc | Đảm bảo điều gì |
|---|---|
| `PRIMARY KEY` | Định danh duy nhất một dòng; ngầm là `NOT NULL` + `UNIQUE`; mỗi bảng chỉ một |
| `FOREIGN KEY` / `REFERENCES` | Giá trị phải tồn tại ở bảng được tham chiếu |
| `UNIQUE` | Không trùng — nhưng **cho phép nhiều dòng NULL** |
| `NOT NULL` | Bắt buộc có giá trị |
| `DEFAULT` | Giá trị dùng khi `INSERT` không truyền cột này |
| `CHECK` | Biểu thức phải đúng — nhưng **NULL vẫn được chấp nhận** |

Hai dòng in đậm là đặc điểm gây bất ngờ nhất và sẽ được giải thích kỹ ở [phase-2 bài 3](../phase-2/03-union-intersect-except-va-logic-3-tri.md).

```sql
-- Sửa cấu trúc bảng đã có
ALTER TABLE khach_hang ADD COLUMN so_dien_thoai VARCHAR(20);
ALTER TABLE khach_hang DROP COLUMN tuoi;
ALTER TABLE khach_hang RENAME COLUMN ho_ten TO ten_day_du;

-- Xoá
DROP TABLE khach_hang;       -- xoá cả cấu trúc lẫn dữ liệu
TRUNCATE TABLE khach_hang;   -- xoá sạch dữ liệu, GIỮ cấu trúc, rất nhanh
DELETE FROM khach_hang;      -- xoá dữ liệu theo từng dòng, chậm hơn, rollback được
```

## Kiểu dữ liệu cơ bản

| Kiểu | Dùng cho | Ghi chú cho người mới |
|---|---|---|
| `INT` / `BIGINT` | Số nguyên | `BIGINT` khi có thể vượt ~2.1 tỉ |
| `NUMERIC(p,s)` / `DECIMAL` | **Tiền** | `NUMERIC(12,2)` = 12 chữ số, 2 số lẻ |
| `REAL` / `DOUBLE` | Số thực khoa học | **Đừng dùng cho tiền** — sai số làm lệch số dư |
| `VARCHAR(n)` / `TEXT` | Chuỗi | PostgreSQL: `TEXT` không chậm hơn `VARCHAR` |
| `BOOLEAN` | Đúng/sai | `TRUE`, `FALSE`, và cả `NULL` |
| `DATE` | Chỉ ngày | `'2024-04-02'` |
| `TIMESTAMP` / `TIMESTAMPTZ` | Ngày + giờ | `TIMESTAMPTZ` có kèm múi giờ — nên dùng cái này |
| `JSON` / `JSONB` | Dữ liệu lồng nhau | `JSONB` đánh index được, `JSON` thì không |

**Vì sao không dùng số thực cho tiền?** Vì `0.1 + 0.2` trong số thực nhị phân cho `0.30000000000000004`. Cộng dồn hàng triệu giao dịch thì sai số tích luỹ đủ để lệch sổ. Dùng `NUMERIC` — nó tính chính xác theo hệ thập phân.

Lưu số điện thoại cũng vậy: dùng `VARCHAR`, không dùng `INT`. Số `0987654321` lưu kiểu số sẽ mất số 0 ở đầu.

## Quy ước viết SQL

```sql
-- Đây là comment một dòng

/* Đây là comment
   nhiều dòng */

SELECT full_name    -- viết HOA từ khoá, thường tên bảng/cột
FROM customers      -- mỗi mệnh đề một dòng cho dễ đọc
WHERE city = 'Ha Noi';   -- dấu ; kết thúc câu lệnh
```

| Vấn đề | Quy tắc |
|---|---|
| Phân biệt hoa thường của **từ khoá** | Không phân biệt: `select` = `SELECT` |
| Phân biệt hoa thường của **dữ liệu** | **Có phân biệt**: `'Ha Noi'` khác `'ha noi'` |
| Nháy đơn `'...'` | Giá trị chuỗi |
| Nháy kép `"..."` | Tên cột/bảng (khi tên có dấu cách hoặc chữ hoa) |
| Dấu `;` | Kết thúc câu lệnh; bắt buộc khi chạy nhiều câu liên tiếp |
| Xuống dòng, thụt lề | Không ảnh hưởng kết quả, nhưng quyết định người khác có đọc nổi không |

## Đọc một câu SQL lạ trong năm bước

Đây là kỹ năng thực dụng nhất của bài này. Khi gặp một câu SQL dài không hiểu gì, đừng đọc từ trên xuống — hãy làm theo thứ tự sau:

```text
Bước 1 — Tìm FROM: dữ liệu đến từ bảng nào?
Bước 2 — Tìm JOIN: có ghép thêm bảng nào không, ghép theo cột gì?
Bước 3 — Tìm WHERE: đang lọc bỏ những dòng nào?
Bước 4 — Tìm GROUP BY: có gom nhóm không, gom theo cột gì?
Bước 5 — Quay lại SELECT: kết quả cuối gồm những cột nào?
```

Thứ tự này không ngẫu nhiên — nó chính là **thứ tự database thực sự xử lý câu lệnh**, và là chủ đề trung tâm của [Bài 1](01-vi-sao-8-tren-10-ung-vien-truot-vong-sql.md).

Thử với một câu lạ:

```sql
SELECT d.dept_name, COUNT(*) AS so_nguoi, ROUND(AVG(e.salary)) AS luong_tb
FROM employees AS e
JOIN departments AS d ON d.dept_id = e.dept_id
WHERE e.hired_at >= '2020-01-01'
GROUP BY d.dept_name
HAVING COUNT(*) >= 2
ORDER BY luong_tb DESC;
```

```text
① FROM employees e        → xuất phát từ bảng nhân viên
② JOIN departments d      → ghép thêm phòng ban, khớp theo dept_id (để lấy TÊN phòng)
③ WHERE hired_at >= ...   → chỉ xét người vào làm từ 2020
④ GROUP BY d.dept_name    → gom nhân viên theo từng phòng ban
   HAVING COUNT(*) >= 2   → chỉ giữ phòng có từ 2 người trở lên
⑤ SELECT ...              → hiện tên phòng, số người, lương trung bình (làm tròn)
   ORDER BY luong_tb DESC → sắp theo lương trung bình giảm dần

Đọc thành một câu: "Trong số nhân viên vào làm từ 2020, các phòng ban có ít nhất
2 người thì hiện tên phòng, số người và lương trung bình, sắp giảm dần theo lương."
```

## Mười lỗi người mới hay gặp

| Lỗi | Thông báo / hậu quả | Cách sửa |
|---|---|---|
| `WHERE email = NULL` | Trả về 0 dòng, không báo lỗi | `IS NULL` |
| `WHERE city = "Ha Noi"` | `column "Ha Noi" does not exist` | Nháy đơn cho chuỗi |
| Quên `WHERE` ở `UPDATE`/`DELETE` | Sửa/xoá toàn bộ bảng | `SELECT` thử trước, bọc transaction |
| `SELECT` cột không có trong `GROUP BY` | `must appear in the GROUP BY clause` | Thêm vào `GROUP BY` hoặc bọc aggregate |
| `WHERE COUNT(*) > 5` | `aggregate functions are not allowed in WHERE` | Dùng `HAVING` |
| Dùng alias của `SELECT` trong `WHERE` | `column ... does not exist` | Lặp lại biểu thức, hoặc bọc subquery |
| `LIMIT` không có `ORDER BY` | Kết quả khác nhau mỗi lần chạy | Luôn kèm `ORDER BY` |
| `JOIN` quên `ON` | Sinh mọi cặp, query treo | Luôn có điều kiện ghép |
| Trộn `AND`/`OR` không đặt ngoặc | Kết quả sai âm thầm | Đặt ngoặc rõ ràng |
| Dùng số thực cho tiền | Sai số tích luỹ, lệch sổ | `NUMERIC(p, s)` |

## Bài tập tự kiểm

Dựng schema mẫu ở [Bài 1](01-vi-sao-8-tren-10-ung-vien-truot-vong-sql.md) rồi tự viết những câu sau. Nếu làm được cả tám, bạn đã đủ nền để vào phần phỏng vấn:

```text
1. Liệt kê tên và email của mọi khách hàng ở Hà Nội.
2. Liệt kê các đơn có tổng tiền trên 1 triệu, sắp giảm dần theo tổng tiền.
3. Đếm xem có bao nhiêu khách hàng chưa điền thành phố.
4. Liệt kê tên nhân viên kèm tên phòng ban của họ.
5. Tính lương trung bình của từng phòng ban.
6. Tìm các phòng ban có từ 2 nhân viên trở lên.
7. Liệt kê 3 sản phẩm đắt nhất.
8. Với mỗi trạng thái đơn hàng, đếm số đơn và tổng tiền.
```

Gợi ý ánh xạ: câu 1-3 dùng `SELECT`/`WHERE`; câu 4 dùng `JOIN`; câu 5-6 dùng `GROUP BY` và `HAVING`; câu 7 dùng `ORDER BY` + `LIMIT`; câu 8 dùng `GROUP BY` với nhiều hàm aggregate.

## Tóm tắt bài 0

- SQL là ngôn ngữ **khai báo**: bạn mô tả kết quả mong muốn, database tự chọn cách thực hiện.
- Năm nhóm lệnh: DQL (`SELECT`), DML (đụng vào dòng), DDL (đụng vào bảng), DCL (quyền), TCL (giao dịch).
- Trong một câu lệnh có ba loại chữ: **từ khoá** của SQL, **tên** có thật trong database, và **alias** do bạn tự đặt.
- Nháy đơn cho giá trị, nháy kép cho tên. `IS NULL` chứ không phải `= NULL`.
- Sau `GROUP BY`, chỉ `SELECT` được cột trong nhóm hoặc hàm aggregate.
- Trước mọi `UPDATE`/`DELETE`: viết `SELECT` thử với đúng mệnh đề `WHERE` đó, rồi mới đổi.
- Đọc câu SQL lạ theo thứ tự `FROM → JOIN → WHERE → GROUP BY → SELECT`, không đọc từ trên xuống.

**Bài kế tiếp** → [Bài 1: Vì sao 8/10 ứng viên trượt vòng SQL](01-vi-sao-8-tren-10-ung-vien-truot-vong-sql.md)
