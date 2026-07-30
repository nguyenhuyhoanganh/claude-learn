# Bài 1: Vì sao 8/10 ứng viên trượt vòng SQL

Có một nghịch lý trong tuyển dụng data: ứng viên trượt vòng SQL hiếm khi vì **không biết viết SQL**. Họ trượt vì trả lời đúng cú pháp nhưng sai bản chất — nói được `LEFT JOIN` giữ bảng trái, nhưng không giải thích được vì sao đặt điều kiện vào `ON` lại cho kết quả khác đặt vào `WHERE`. Người phỏng vấn không cần bạn thuộc lòng cú pháp (Google có sẵn), họ cần biết bạn có **mô hình tư duy** đúng về cách database xử lý dữ liệu hay không.

Bài này dựng nền tảng cho toàn series: người phỏng vấn thật sự đo cái gì, mô hình tư duy nào giải thích được 80% câu hỏi, và schema mẫu để bạn chạy thử mọi query trong các bài sau.

## Bốn tầng câu hỏi trong một buổi phỏng vấn SQL

Buổi phỏng vấn SQL gần như luôn đi theo bốn tầng, và mỗi tầng lọc bớt một nhóm ứng viên:

```text
Tầng 4 — DATA MODELING & TRADE-OFF      ← senior / lead dừng ở đây
  "Bảng này nên index gì? Denormalize hay không?
   Query chạy 40s trên 200 triệu dòng, sửa sao?"

Tầng 3 — PERFORMANCE                     ← lọc mid → senior
  "Đọc EXPLAIN này giúp tôi. Vì sao không dùng index?
   NOT IN và NOT EXISTS cái nào nhanh hơn, vì sao?"

Tầng 2 — SEMANTICS (ngữ nghĩa)           ← lọc junior → mid ⭐ 80% ứng viên rơi ở đây
  "Vì sao COUNT(*) và COUNT(cột) ra số khác nhau?
   Vì sao LEFT JOIN của tôi biến thành INNER JOIN?"

Tầng 1 — SYNTAX (cú pháp)                ← lọc intern → junior
  "Viết query lấy top 10 khách chi nhiều nhất."
```

**Điểm mấu chốt**: đa số ứng viên luyện tầng 1 (giải bài trên LeetCode/HackerRank) nhưng bị loại ở tầng 2 — nơi câu hỏi không phải "viết query" mà là "giải thích vì sao". Series này tập trung vào tầng 2 và 3, vì đó là chỗ mất điểm nhiều nhất.

| Cấp độ ứng tuyển | Người phỏng vấn kỳ vọng gì |
|---|---|
| Intern / Fresher | JOIN cơ bản, GROUP BY, biết `NULL` khác `0` và khác `''` |
| Junior (0-2 năm) | Thành thạo tầng 1-2, subquery, biết dùng CTE cho dễ đọc |
| Mid (2-5 năm) | Window function, đọc được EXPLAIN, biết vì sao query chậm |
| Senior (5+ năm) | Thiết kế index, chọn chiến lược viết lại query, hiểu isolation level, biết đánh đổi |

## Mô hình tư duy quan trọng nhất: thứ tự xử lý logic

Nếu chỉ được nhớ một thứ trong toàn bộ series này, hãy nhớ cái sau. SQL **không** chạy từ trên xuống dưới theo thứ tự bạn viết. Nó chạy theo **logical processing order** (thứ tự xử lý logic):

```text
Thứ tự BẠN VIẾT                Thứ tự DATABASE XỬ LÝ
─────────────────              ─────────────────────────────────────
SELECT      (1)                 1. FROM        ← lấy bảng nguồn
FROM        (2)                 2. JOIN ... ON ← ghép bảng, điều kiện ghép
JOIN ... ON (3)                 3. WHERE       ← lọc TỪNG DÒNG
WHERE       (4)                 4. GROUP BY    ← gom dòng thành NHÓM
GROUP BY    (5)                 5. HAVING      ← lọc TỪNG NHÓM
HAVING      (6)                 6. SELECT      ← tính biểu thức, alias ra đời ở đây
ORDER BY    (7)                 7. DISTINCT
LIMIT       (8)                 8. ORDER BY    ← sắp xếp
                                9. LIMIT/OFFSET ← cắt trang
```

Mô hình này **một mình nó** giải thích được hàng loạt câu hỏi phỏng vấn:

| Câu hỏi phỏng vấn | Giải thích bằng thứ tự xử lý |
|---|---|
| Vì sao `WHERE COUNT(*) > 5` báo lỗi? | `WHERE` chạy ở bước 3, lúc đó nhóm (bước 4) chưa tồn tại |
| Vì sao không dùng được alias của `SELECT` trong `WHERE`? | Alias sinh ra ở bước 6, `WHERE` chạy trước ở bước 3 |
| Vì sao lại dùng được alias trong `ORDER BY`? | `ORDER BY` (bước 8) chạy **sau** `SELECT` (bước 6) |
| Vì sao không lọc được window function trong `WHERE`? | Window function tính ở bước 6, sau `WHERE` |
| Vì sao điều kiện ở `ON` khác ở `WHERE` với LEFT JOIN? | `ON` chạy bước 2 (trước khi bù NULL), `WHERE` chạy bước 3 (sau khi đã bù NULL) |

> Lưu ý: đây là thứ tự **logic**, không phải thứ tự thực thi vật lý. Query optimizer được phép sắp xếp lại (đẩy filter xuống sớm, đổi thứ tự join...) miễn là **kết quả không đổi**. Khi phỏng vấn, nói được cả hai vế này là điểm cộng lớn.

#### "Query optimizer" là gì và vì sao có hai thứ tự

Đây là khái niệm nền, gặp lại suốt series nên cần hiểu ngay từ đầu.

**Query optimizer** (bộ tối ưu truy vấn, còn gọi là *planner*) là một thành phần bên trong database. Nhiệm vụ của nó: nhận câu SQL bạn viết, rồi **tự quyết định cách thực hiện nhanh nhất**.

```text
Bạn viết:                Optimizer nghĩ:                       Rồi mới chạy:
┌──────────────┐        ┌─────────────────────────────┐      ┌──────────────┐
│ SELECT ...   │        │ "Bảng orders có 5 triệu dòng.│      │ Index Scan   │
│ FROM orders  │  ───▶  │  Có index trên customer_id.  │ ──▶ │ trên index   │
│ JOIN ...     │        │  Nên đọc orders trước hay    │      │ idx_cust,    │
│ WHERE ...    │        │  customers trước? Dùng index │      │ rồi Hash Join│
└──────────────┘        │  hay quét cả bảng?"          │      └──────────────┘
   Ý ĐỊNH của bạn        └─────────────────────────────┘        CÁCH LÀM thật
```

Vì SQL là ngôn ngữ **khai báo** — bạn mô tả *cái gì* muốn lấy, không ra lệnh *làm thế nào* — nên database có toàn quyền chọn cách. Từ đó sinh ra hai thứ tự khác nhau:

| | Thứ tự **logic** | Thứ tự **vật lý** |
|---|---|---|
| Là gì | Quy tắc ngữ nghĩa của SQL | Các bước database thật sự làm |
| Ai quyết định | Chuẩn SQL, cố định | Optimizer, thay đổi theo dữ liệu |
| Dùng để | Hiểu **vì sao ra kết quả này** | Hiểu **vì sao chạy chậm** |
| Xem ở đâu | Học thuộc bảng trên | `EXPLAIN` ([phase-3 bài 2](../phase-3/02-doc-hieu-execution-plan.md)) |

Một ví dụ cụ thể cho thấy chúng khác nhau ra sao:

```sql
SELECT c.full_name
FROM customers c
JOIN orders o ON o.customer_id = c.customer_id
WHERE c.city = 'Ha Noi';
```

```text
Thứ tự LOGIC nói:     ghép TOÀN BỘ customers với orders trước,
                      xong rồi mới lọc city = 'Ha Noi'.

Thứ tự VẬT LÝ làm:    lọc customers còn lại khách Hà Nội TRƯỚC (chỉ 2 dòng),
                      rồi mới ghép với orders.
                      → gọi là "đẩy bộ lọc xuống" (predicate pushdown)

Kết quả cuối: GIỐNG HỆT NHAU. Chỉ khác ở chỗ cách thứ hai nhanh hơn nhiều.
```

Optimizer chỉ được phép sắp xếp lại khi việc đó **không làm đổi kết quả**. Nắm nguyên tắc này giải thích được một câu hỏi phỏng vấn hay gặp: *"vì sao `INNER JOIN` thường nhanh hơn `LEFT JOIN`?"* — vì với `INNER JOIN`, optimizer tự do đổi thứ tự hai bảng; còn `LEFT JOIN` bắt buộc phải bảo toàn trọn vẹn bảng trái nên không gian tối ưu hẹp hơn.

## Ba dấu hiệu khiến người phỏng vấn loại bạn ngay

**1. Trả lời bằng cú pháp thay vì bằng dữ liệu.** Hỏi "LEFT JOIN là gì", trả lời "là lấy hết bảng bên trái" — đúng nhưng nhạt. Trả lời tốt: "giữ toàn bộ dòng bảng trái; dòng nào không tìm được cặp ở bảng phải thì mọi cột bảng phải nhận `NULL`. Chính cái `NULL` đó cho ta viết được anti-join."

**2. Không hỏi lại về dữ liệu.** Bài toán "tìm khách chưa từng mua hàng" có ít nhất ba câu cần hỏi: bảng orders có dòng nào `customer_id` null không? Đơn bị huỷ có tính là "đã mua" không? Có soft delete (`deleted_at`) không? Ứng viên hỏi lại được đánh giá cao hơn hẳn ứng viên viết ngay.

**3. Không nói được cái giá phải trả.** Mọi query đều có trade-off: `DISTINCT` che lỗi nhân dòng, `OFFSET` lớn thì chậm, index làm `SELECT` nhanh nhưng `INSERT` chậm. Nêu được đánh đổi = tư duy engineer, không phải người viết query thuê.

## Schema mẫu cho toàn series

Mọi query từ bài này trở đi đều chạy trên schema dưới. Dựng nó một lần, dùng suốt series.

```sql
-- PostgreSQL 14+
DROP TABLE IF EXISTS payments, order_items, orders, products, customers, employees, departments CASCADE;

CREATE TABLE departments (
    dept_id   SERIAL PRIMARY KEY,
    dept_name TEXT NOT NULL,
    location  TEXT
);

CREATE TABLE employees (
    emp_id     SERIAL PRIMARY KEY,
    full_name  TEXT           NOT NULL,
    dept_id    INT            REFERENCES departments(dept_id),   -- cho phép NULL: nhân viên chưa xếp phòng
    manager_id INT            REFERENCES employees(emp_id),       -- self reference: cây tổ chức
    salary     NUMERIC(12, 2) NOT NULL,
    hired_at   DATE           NOT NULL
);

CREATE TABLE customers (
    customer_id SERIAL PRIMARY KEY,
    full_name   TEXT NOT NULL,
    email       TEXT UNIQUE,
    city        TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
    product_id SERIAL PRIMARY KEY,
    sku        TEXT UNIQUE    NOT NULL,
    name       TEXT           NOT NULL,
    category   TEXT           NOT NULL,
    price      NUMERIC(12, 2) NOT NULL
);

CREATE TABLE orders (
    order_id     SERIAL PRIMARY KEY,
    customer_id  INT            NOT NULL REFERENCES customers(customer_id),
    status       TEXT           NOT NULL,   -- pending | paid | shipped | cancelled
    ordered_at   TIMESTAMPTZ    NOT NULL,
    total_amount NUMERIC(14, 2) NOT NULL
);

CREATE TABLE order_items (
    order_item_id SERIAL PRIMARY KEY,
    order_id      INT            NOT NULL REFERENCES orders(order_id),
    product_id    INT            NOT NULL REFERENCES products(product_id),
    quantity      INT            NOT NULL,
    unit_price    NUMERIC(12, 2) NOT NULL
);

CREATE TABLE payments (
    payment_id SERIAL PRIMARY KEY,
    order_id   INT            NOT NULL REFERENCES orders(order_id),
    method     TEXT           NOT NULL,   -- card | cod | banking
    amount     NUMERIC(14, 2) NOT NULL,
    paid_at    TIMESTAMPTZ    NOT NULL
);
```

### Giải nghĩa từng từ khoá trong đoạn tạo bảng ở trên

Nếu bạn mới học, đoạn `CREATE TABLE` vừa rồi có vài từ chưa gặp. Giải thích đầy đủ:

| Từ khoá | Nghĩa | Vì sao dùng ở đây |
|---|---|---|
| `SERIAL` | Số nguyên **tự tăng**: mỗi lần chèn, database tự cấp số kế tiếp | Không phải tự nghĩ ra id cho từng dòng |
| `PRIMARY KEY` | Khoá chính — định danh duy nhất một dòng | Ngầm định luôn là `NOT NULL` + `UNIQUE` |
| `REFERENCES bang(cot)` | Khoá ngoại — giá trị phải tồn tại ở bảng kia | Chặn việc tạo đơn cho khách không có thật |
| `NOT NULL` | Bắt buộc phải có giá trị | Tên khách thì không thể để trống |
| `UNIQUE` | Không được trùng | Mỗi email chỉ thuộc về một khách |
| `TEXT` | Chuỗi ký tự độ dài tuỳ ý | Trong PostgreSQL, `TEXT` không chậm hơn `VARCHAR(n)` |
| `NUMERIC(12, 2)` | Số thập phân **chính xác**: tối đa 12 chữ số, 2 số sau dấu phẩy | Dùng cho **tiền**. Không dùng `FLOAT`/`REAL` vì chúng có sai số |
| `TIMESTAMPTZ` | Ngày + giờ, **có kèm múi giờ** | Tránh lệch giờ khi hệ thống chạy ở nhiều nơi |
| `DEFAULT now()` | Nếu `INSERT` không truyền cột này thì tự điền thời điểm hiện tại | Đỡ phải truyền tay `created_at` |
| `DROP TABLE IF EXISTS` | Xoá bảng nếu nó đang tồn tại | Cho phép chạy lại script nhiều lần mà không báo lỗi |
| `CASCADE` | Xoá luôn những thứ phụ thuộc vào bảng đó | Cần vì các bảng đang tham chiếu lẫn nhau qua khoá ngoại |

Hai điểm thiết kế **có chủ đích** trong schema này, sẽ dùng để dạy các bài sau:

```text
employees.dept_id  KHÔNG có NOT NULL  → cho phép nhân viên chưa được xếp phòng ban
                                          → tạo ra giá trị NULL để dạy bẫy NOT IN

employees.manager_id REFERENCES employees(emp_id)
                   → bảng TỰ THAM CHIẾU chính nó
                   → mỗi nhân viên trỏ tới nhân viên khác là sếp của mình
                   → đây là cách biểu diễn CÂY TỔ CHỨC bằng bảng phẳng
```

Cách bảng tự tham chiếu hoạt động, cụ thể với dữ liệu mẫu bên dưới:

```text
emp_id │ full_name  │ manager_id
───────┼────────────┼───────────
   1   │ Nguyen An  │   NULL      ← không có sếp = người đứng đầu (gốc của cây)
   2   │ Tran Binh  │     1       ← sếp là emp_id = 1, tức Nguyen An
   6   │ Vo Phuong  │     5       ← sếp là emp_id = 5, tức Hoang Em

Ghép lại thành cây:      Nguyen An (1)
                          ├── Tran Binh (2)
                          ├── Hoang Em (5)
                          │     └── Vo Phuong (6)
                          └── ...
```

Dữ liệu mẫu — cố tình nhỏ để bạn **nhẩm tay kiểm chứng được kết quả**, và cố tình cài sẵn các case gây bẫy (khách không đơn, nhân viên không phòng ban, lương trùng nhau, đơn bị huỷ):

```sql
INSERT INTO departments (dept_name, location) VALUES
    ('Engineering', 'Ha Noi'),
    ('Sales',       'Ho Chi Minh'),
    ('Marketing',   'Da Nang'),
    ('Legal',       'Ha Noi');            -- phòng ban KHÔNG có nhân viên nào

INSERT INTO employees (full_name, dept_id, manager_id, salary, hired_at) VALUES
    ('Nguyen An',   1, NULL, 60000000, '2019-03-01'),   -- emp 1, sếp lớn
    ('Tran Binh',   1, 1,    45000000, '2020-06-15'),   -- emp 2
    ('Le Cuong',    1, 1,    45000000, '2021-01-10'),   -- emp 3, lương TRÙNG emp 2
    ('Pham Dung',   1, 1,    38000000, '2022-08-01'),   -- emp 4
    ('Hoang Em',    2, 1,    52000000, '2020-02-20'),   -- emp 5
    ('Vo Phuong',   2, 5,    41000000, '2021-11-05'),   -- emp 6
    ('Dang Giang',  3, 1,    35000000, '2023-04-12'),   -- emp 7
    ('Bui Hoa',     NULL, 1, 30000000, '2024-01-08');   -- emp 8, CHƯA có phòng ban

INSERT INTO customers (full_name, email, city, created_at) VALUES
    ('Khach A', 'a@shop.vn', 'Ha Noi',      '2024-01-05'),
    ('Khach B', 'b@shop.vn', 'Ho Chi Minh', '2024-01-20'),
    ('Khach C', 'c@shop.vn', 'Ha Noi',      '2024-02-11'),
    ('Khach D', 'd@shop.vn', NULL,          '2024-03-02'),   -- chưa từng đặt đơn
    ('Khach E', NULL,        'Da Nang',     '2024-03-15');   -- chưa từng đặt đơn, email NULL

INSERT INTO products (sku, name, category, price) VALUES
    ('SKU-001', 'Ban phim co',    'accessory', 1200000),
    ('SKU-002', 'Chuot khong day','accessory',  650000),
    ('SKU-003', 'Man hinh 27 inch','monitor',  5400000),
    ('SKU-004', 'Tai nghe chong on','audio',   3200000),
    ('SKU-005', 'Webcam 4K',      'accessory', 2100000);      -- chưa bán được cái nào

INSERT INTO orders (customer_id, status, ordered_at, total_amount) VALUES
    (1, 'paid',      '2024-04-02 09:15', 1850000),   -- order 1
    (1, 'paid',      '2024-05-18 14:03', 5400000),   -- order 2
    (2, 'cancelled', '2024-04-25 10:00', 3200000),   -- order 3, ĐƠN HUỶ
    (2, 'shipped',   '2024-06-07 16:40', 2100000),   -- order 4
    (3, 'pending',   '2024-06-21 08:22',  650000);   -- order 5, chưa thanh toán

INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES
    (1, 1, 1, 1200000),
    (1, 2, 1,  650000),
    (2, 3, 1, 5400000),
    (3, 4, 1, 3200000),
    (4, 5, 1, 2100000),
    (5, 2, 1,  650000);

INSERT INTO payments (order_id, method, amount, paid_at) VALUES
    (1, 'card',    1850000, '2024-04-02 09:16'),
    (2, 'banking', 5400000, '2024-05-18 14:10'),
    (4, 'cod',     2100000, '2024-06-09 11:30');
    -- order 3 (huỷ) và order 5 (pending) KHÔNG có payment
```

Bộ dữ liệu này chứa sẵn bảy cái bẫy sẽ dùng đi dùng lại trong series:

| Bẫy cài sẵn | Dùng để dạy bài nào |
|---|---|
| Khách D, E chưa có đơn nào | LEFT JOIN + IS NULL (anti-join) |
| Phòng `Legal` không nhân viên | LEFT JOIN chiều ngược, `COUNT(*)` vs `COUNT(col)` |
| Nhân viên `Bui Hoa` có `dept_id` NULL | Bẫy `NOT IN` với NULL, JOIN mất dòng |
| Emp 2 và 3 lương bằng nhau | Phân biệt `RANK` / `DENSE_RANK` / `ROW_NUMBER` |
| Đơn `cancelled` | Hỏi lại yêu cầu; `WHERE` vs điều kiện trong `ON` |
| `SKU-005` chưa bán | Anti-join phía sản phẩm |
| Email `NULL` của khách E | Logic ba trị, `COUNT`, `DISTINCT`, `UNIQUE` với NULL |

### MySQL 8: khác biệt khi dựng schema

```sql
-- Thay SERIAL   → INT AUTO_INCREMENT PRIMARY KEY
-- Thay TEXT     → VARCHAR(n)  (TEXT của MySQL không đánh index full được, phải chỉ định prefix)
-- Thay TIMESTAMPTZ → DATETIME (MySQL không có kiểu timestamp kèm timezone)
-- Thay now()    → NOW()
```

## Cách trả lời tạo ấn tượng: quy trình 4 bước

Khi nhận một đề bài SQL, đừng gõ ngay. Nói to quy trình này ra — người phỏng vấn chấm cả cách bạn tư duy, không chỉ query cuối:

```text
Bước 1 — LÀM RÕ (15 giây)
   "Đơn huỷ có tính không? customer_id có thể NULL không? Cần dữ liệu tới thời điểm nào?"

Bước 2 — NÓI HƯỚNG GIẢI trước khi viết
   "Em sẽ LEFT JOIN customers với orders rồi lọc dòng order_id IS NULL.
    Cách thay thế là NOT EXISTS, em sẽ nói về đánh đổi sau."

Bước 3 — VIẾT, đặt alias rõ ràng, format xuống dòng
   Alias có nghĩa (c, o) chứ không phải (t1, t2). Mỗi mệnh đề một dòng.

Bước 4 — TỰ KIỂM & NÊU ĐÁNH ĐỔI
   "Với dữ liệu mẫu kết quả là khách D và E. Nếu bảng orders 50 triệu dòng,
    em sẽ cần index trên orders(customer_id) để anti-join này không phải quét toàn bảng."
```

Bước 4 là bước phân biệt rõ nhất giữa ứng viên "biết SQL" và ứng viên "làm được việc".

## Bẫy thường gặp ngay từ bài đầu

| Bẫy | Vì sao sai | Cách đúng |
|---|---|---|
| Dùng `SELECT *` khi phỏng vấn | Trả cột thừa, che ý định, hại performance | Liệt kê đúng cột cần |
| Alias `t1`, `t2`, `a`, `b` | Người đọc phải nhớ mapping | `c` = customers, `o` = orders |
| Viết tất cả trên một dòng | Không ai review nổi | Mỗi mệnh đề xuống dòng, thụt lề |
| So sánh `= NULL` | Luôn ra `UNKNOWN`, không bao giờ true | `IS NULL` / `IS NOT NULL` |
| Giả định bảng không có NULL | Phá vỡ `NOT IN`, `JOIN`, `COUNT` | Hỏi lại hoặc phòng thủ bằng `COALESCE` |

## Tóm tắt bài 1

- Người phỏng vấn đo bốn tầng: cú pháp → **ngữ nghĩa** → performance → modeling. Đa số ứng viên rớt ở tầng ngữ nghĩa.
- **Thứ tự xử lý logic** (`FROM → JOIN → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT`) một mình nó giải thích phần lớn câu hỏi mẹo.
- Hỏi lại về dữ liệu (NULL, đơn huỷ, soft delete) trước khi viết query là dấu hiệu của người đã đi làm thật.
- Luôn kết thúc câu trả lời bằng một câu về **đánh đổi/performance** — đó là điểm ăn tiền.
- Dựng schema mẫu ở bài này trước khi đi tiếp; toàn bộ series dùng chung nó.

**Bài kế tiếp** → [Bài 2: JOIN toàn tập và bài toán "khách chưa từng đặt hàng"](02-join-inner-vs-left-va-bai-toan-khach-chua-mua.md)
