# Bài 1: Subquery toàn tập

Subquery là thứ ai cũng dùng nhưng ít người dùng đúng. Nó xuất hiện ở ba vị trí khác nhau trong câu lệnh, mỗi vị trí có luật riêng, và chọn sai vị trí là nguyên nhân của cả hai loại tai nạn: query trả về sai kết quả, và query chạy chậm gấp trăm lần mà không hiểu vì sao.

Người phỏng vấn thích subquery vì nó cho phép hỏi nhiều tầng chỉ từ một đề bài: *"Viết bằng subquery"* → *"Giờ viết lại bằng JOIN"* → *"Cái nào nhanh hơn, vì sao?"* → *"Nếu cột có NULL thì sao?"*. Bài này chuẩn bị cho toàn bộ chuỗi đó.

## Ba vị trí đặt subquery

```text
SELECT  col,
        (SELECT ...)          ← ① vị trí SELECT: phải trả về ĐÚNG 1 giá trị (scalar)
FROM   (SELECT ...) AS t      ← ② vị trí FROM  : derived table, BẮT BUỘC có alias
WHERE   col IN (SELECT ...)   ← ③ vị trí WHERE : trả về 1 cột, nhiều dòng
```

| Vị trí | Tên gọi | Trả về gì | Dùng khi |
|---|---|---|---|
| `SELECT` | Scalar subquery | Đúng 1 dòng, 1 cột | Lấy một giá trị lẻ kèm theo mỗi dòng |
| `FROM` | Derived table / inline view | Bảng đầy đủ | Cần tính trung gian rồi lọc/join tiếp |
| `WHERE` / `HAVING` | Predicate subquery | 1 cột nhiều dòng, hoặc boolean | Lọc theo tập hợp giá trị |
| `JOIN ... ON` | Derived table | Bảng | Như `FROM`, ghép bên trong join |

### ① Subquery trong SELECT (scalar)

```sql
SELECT c.full_name,
       (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.customer_id)          AS so_don,
       (SELECT MAX(o.ordered_at) FROM orders o WHERE o.customer_id = c.customer_id) AS lan_mua_cuoi
FROM customers AS c;
```

```text
 full_name | so_don |     lan_mua_cuoi
-----------+--------+---------------------
 Khach A   |      2 | 2024-05-18 14:03:00
 Khach B   |      2 | 2024-06-07 16:40:00
 Khach C   |      1 | 2024-06-21 08:22:00
 Khach D   |      0 |              [NULL]
 Khach E   |      0 |              [NULL]
```

Ưu điểm: rất dễ đọc, và **tự động ra 0/NULL** cho khách chưa mua — không cần `LEFT JOIN` rồi `COALESCE`.

Nhược điểm nghiêm trọng: **nó chạy một lần cho mỗi dòng của bảng ngoài**. Với 2 subquery và 1 triệu khách, về mặt logic là 2 triệu lần thực thi — chính là vấn đề N+1 mà bạn hay nghe ở tầng ORM, nhưng nằm ngay trong SQL. Optimizer hiện đại đôi khi viết lại được thành join, đôi khi không.

Hai luật cứng của scalar subquery:

```sql
-- Trả về nhiều hơn 1 dòng → LỖI RUNTIME (không phải lỗi cú pháp!)
SELECT c.full_name, (SELECT o.order_id FROM orders o WHERE o.customer_id = c.customer_id)
FROM customers c;
-- ERROR: more than one row returned by a subquery used as an expression
```

Query này chạy đúng khi mỗi khách có ≤1 đơn, và **nổ khi có khách đặt đơn thứ hai**. Đây là dạng bug xuất hiện ở production lúc 2 giờ sáng chứ không lộ ra khi test.

```sql
-- Trả về 0 dòng → cho NULL, KHÔNG lỗi
SELECT (SELECT order_id FROM orders WHERE customer_id = 999);  -- → NULL
```

Cách viết lại an toàn hơn khi cần nhiều giá trị từ cùng một bảng con — gom một lần rồi `LEFT JOIN`:

```sql
SELECT c.full_name,
       COALESCE(s.so_don, 0) AS so_don,
       s.lan_mua_cuoi
FROM customers AS c
LEFT JOIN (
    SELECT customer_id, COUNT(*) AS so_don, MAX(ordered_at) AS lan_mua_cuoi
    FROM orders
    GROUP BY customer_id
) AS s ON s.customer_id = c.customer_id;
```

Một lần quét bảng `orders` thay vì hai lần cho mỗi khách. Nêu được cách viết lại này khi phỏng vấn là điểm cộng ở tầng performance.

### ② Subquery trong FROM (derived table)

```sql
SELECT t.customer_id, t.doanh_thu
FROM (
    SELECT customer_id, SUM(total_amount) AS doanh_thu
    FROM orders
    WHERE status <> 'cancelled'
    GROUP BY customer_id
) AS t                                   -- alias BẮT BUỘC, thiếu là lỗi cú pháp
WHERE t.doanh_thu > 2000000;
```

Derived table giải một vấn đề cụ thể: **lọc theo kết quả của một phép tính không dùng được ở `WHERE`**. Ở đây `doanh_thu` là `SUM`, nên không thể viết `WHERE SUM(...) > ...` ở tầng ngoài cùng (viết được thì phải dùng `HAVING`, nhưng khi cần lọc theo window function thì `HAVING` cũng bó tay — bắt buộc phải xuống tầng).

> MySQL yêu cầu alias tương tự. Postgres báo `subquery in FROM must have an alias` — lỗi này rất hay gặp lần đầu.

Từ Postgres 8.4 / MySQL 8.0 trở đi, hầu như luôn nên viết lại derived table thành **CTE** cho dễ đọc — chủ đề của [bài kế tiếp](02-cte-va-recursive-cte.md).

### ③ Subquery trong WHERE

```sql
-- Khách ở Hà Nội đã từng đặt đơn
SELECT full_name FROM customers
WHERE city = 'Ha Noi'
  AND customer_id IN (SELECT customer_id FROM orders);

-- Khách chi tiêu trên mức trung bình (subquery trả về 1 giá trị)
SELECT customer_id, SUM(total_amount) AS chi_tieu
FROM orders
WHERE status <> 'cancelled'
GROUP BY customer_id
HAVING SUM(total_amount) > (
    SELECT AVG(tong) FROM (
        SELECT SUM(total_amount) AS tong FROM orders
        WHERE status <> 'cancelled' GROUP BY customer_id
    ) AS x
);
```

```text
 customer_id | chi_tieu
-------------+----------
           1 |  7250000     -- trung bình mỗi khách là 3,333,333
```

Subquery ở `HAVING` là dạng ít gặp nhưng rất hay bị hỏi — nó cho phép so sánh mỗi nhóm với một mốc tính từ toàn bộ dữ liệu.

## Correlated và uncorrelated: khác biệt quyết định performance

Đây là phân loại quan trọng nhất, và là câu hỏi phỏng vấn gần như chắc chắn có.

```text
UNCORRELATED (độc lập)                CORRELATED (tương quan)
────────────────────────              ───────────────────────────────────
SELECT * FROM customers               SELECT * FROM customers c
WHERE customer_id IN (                WHERE EXISTS (
    SELECT customer_id                    SELECT 1 FROM orders o
    FROM orders                           WHERE o.customer_id = c.customer_id
);                                    );                    ▲
                                                            └─ tham chiếu bảng NGOÀI
Không nhắc tới bảng ngoài             Có nhắc tới bảng ngoài
→ chạy MỘT LẦN, cache kết quả         → về logic chạy LẠI cho từng dòng ngoài
```

Cách nhận biết nhanh: **nhìn xem bên trong subquery có nhắc tên alias của bảng ngoài không**. Có → correlated.

| | Uncorrelated | Correlated |
|---|---|---|
| Số lần thực thi (logic) | 1 | N (theo số dòng bảng ngoài) |
| Chạy độc lập được không | Có — copy ra chạy riêng vẫn được | Không — thiếu tham chiếu, sẽ lỗi |
| Rủi ro performance | Thấp | **Cao** nếu optimizer không viết lại được |
| Điển hình | `IN (SELECT ...)` | `EXISTS`, scalar subquery trong `SELECT` |

**Điểm quan trọng cần nói khi phỏng vấn**: "chạy N lần" là mô hình **logic**, không phải điều thực sự xảy ra. PostgreSQL thường *decorrelate* — viết lại subquery tương quan thành một phép semi-join/anti-join dùng hash. Cách kiểm chứng: `EXPLAIN` mà thấy `Hash Semi Join` nghĩa là đã được viết lại; thấy `SubPlan` kèm `loops=N` lớn trong `EXPLAIN ANALYZE` nghĩa là **không** viết lại được, và đó là lúc bạn phải tự tay sửa.

## IN, EXISTS hay JOIN: chọn cái nào

Ba cách viết cho cùng một ý "khách đã từng đặt hàng":

```sql
-- (a) IN
SELECT * FROM customers c WHERE c.customer_id IN (SELECT o.customer_id FROM orders o);

-- (b) EXISTS
SELECT * FROM customers c WHERE EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.customer_id);

-- (c) JOIN + DISTINCT
SELECT DISTINCT c.* FROM customers c JOIN orders o ON o.customer_id = c.customer_id;
```

| Tiêu chí | `IN` | `EXISTS` | `JOIN` |
|---|---|---|---|
| An toàn với NULL | Có (nhưng `NOT IN` thì **không**) | **Có** | Có |
| Nguy cơ nhân dòng | Không | Không | **Có** — phải `DISTINCT` |
| Lấy được cột bảng phải | Không | Không | **Có** |
| Ngắt sớm khi tìm thấy | Tuỳ plan | **Có** | Không |
| Plan Postgres thường gặp | `Hash Semi Join` | `Hash Semi Join` | `Hash Join` + `HashAggregate` |

Quy tắc chọn thực dụng:

```text
Chỉ cần KIỂM TRA tồn tại, không cần dữ liệu bảng phải  →  EXISTS  (an toàn nhất)
Cần LẤY cột từ bảng phải                                →  JOIN
Danh sách giá trị cố định, ngắn                         →  IN ('a','b','c')
Kiểm tra KHÔNG tồn tại                                  →  NOT EXISTS (tuyệt đối tránh NOT IN)
```

Huyền thoại cần dẹp: *"`EXISTS` luôn nhanh hơn `IN`"*. Trên PostgreSQL và MySQL 8, hai cách thường cho **cùng một plan** khi không có NULL. Lời khuyên này đúng với MySQL 5.6 trở về trước (nơi `IN` với subquery bị thực thi lại cho mỗi dòng) và vẫn còn được nhắc lại như tín điều. Trả lời "chúng thường tương đương trên engine hiện đại, khác biệt thật nằm ở ngữ nghĩa NULL" cho thấy bạn cập nhật.

## Bẫy NULL: NOT IN, ANY, ALL

`NOT IN` với subquery chứa NULL trả về **rỗng**, đã phân tích ở [phase-1 bài 2](../phase-1/02-join-inner-vs-left-va-bai-toan-khach-chua-mua.md). Ở đây ta xem một biến thể thực tế hay gặp hơn:

```sql
-- Phòng ban KHÔNG có nhân viên nào
SELECT dept_name FROM departments
WHERE dept_id NOT IN (SELECT dept_id FROM employees);   -- → 0 dòng!
```

Trả về rỗng, **dù phòng Legal rõ ràng không có ai**. Vì `Bui Hoa` có `dept_id` NULL, tập con chứa NULL, và `NOT IN` sụp đổ.

Ba cách sửa, xếp theo thứ tự khuyến nghị:

```sql
-- 1. NOT EXISTS (tốt nhất — không cần biết cột có NULL hay không)
SELECT dept_name FROM departments d
WHERE NOT EXISTS (SELECT 1 FROM employees e WHERE e.dept_id = d.dept_id);

-- 2. Lọc NULL trong subquery (phải nhớ, dễ quên khi refactor)
SELECT dept_name FROM departments
WHERE dept_id NOT IN (SELECT dept_id FROM employees WHERE dept_id IS NOT NULL);

-- 3. LEFT JOIN + IS NULL
SELECT d.dept_name FROM departments d
LEFT JOIN employees e ON e.dept_id = d.dept_id
WHERE e.emp_id IS NULL;
```

### ANY và ALL

Hai toán tử ít dùng nhưng hay xuất hiện trong đề phỏng vấn để kiểm tra độ chắc lý thuyết:

```sql
-- ANY / SOME: đúng nếu thoả với ÍT NHẤT MỘT giá trị
SELECT * FROM products WHERE price > ANY (SELECT price FROM products WHERE category = 'accessory');
-- ⇔ price > MIN(price của accessory)

-- ALL: đúng nếu thoả với TẤT CẢ giá trị
SELECT * FROM products WHERE price > ALL (SELECT price FROM products WHERE category = 'accessory');
-- ⇔ price > MAX(price của accessory)   → chỉ còn monitor 5.4tr và audio 3.2tr
```

| Viết bằng ANY/ALL | Tương đương |
|---|---|
| `x = ANY (tập)` | `x IN (tập)` |
| `x <> ALL (tập)` | `x NOT IN (tập)` — **kể cả cái bẫy NULL** |
| `x > ANY (tập)` | `x > MIN(tập)` |
| `x > ALL (tập)` | `x > MAX(tập)` |

Bẫy: `> ALL` trên **tập rỗng** trả về `TRUE` (mọi mệnh đề phổ quát trên tập rỗng đều đúng), còn `> ANY` trên tập rỗng trả về `FALSE`. Chi tiết này gây bug khi bộ lọc trong subquery không khớp dòng nào.

## LATERAL: subquery được nhìn thấy bảng bên trái

Bình thường, subquery ở `FROM` **không** tham chiếu được các bảng đứng trước nó. `LATERAL` gỡ bỏ hạn chế đó — nó biến derived table thành thứ chạy lại cho từng dòng của bảng trái, như một vòng lặp.

```sql
-- Với MỖI khách, lấy 2 đơn gần nhất
SELECT c.full_name, o.order_id, o.ordered_at, o.total_amount
FROM customers AS c
LEFT JOIN LATERAL (
    SELECT o.order_id, o.ordered_at, o.total_amount
    FROM orders AS o
    WHERE o.customer_id = c.customer_id       -- ← nhìn thấy c, chỉ nhờ LATERAL
    ORDER BY o.ordered_at DESC
    LIMIT 2
) AS o ON TRUE                                 -- ON TRUE vì điều kiện đã nằm bên trong
ORDER BY c.customer_id, o.ordered_at DESC;
```

`LEFT JOIN LATERAL ... ON TRUE` giữ cả khách chưa có đơn (D, E). Đổi thành `CROSS JOIN LATERAL` thì các khách đó biến mất.

**Vì sao đáng học?** Đây là cách giải bài "top N per group" **hiệu quả hơn window function** khi N nhỏ và bảng con có index phù hợp: thay vì xếp hạng toàn bộ 10 triệu đơn rồi lọc `hang <= 2`, Postgres chỉ cần nhảy vào index `orders(customer_id, ordered_at DESC)` và lấy 2 dòng đầu cho mỗi khách.

```text
Window function : quét + sort TOÀN BỘ orders, rồi lọc hang <= 2
LATERAL + LIMIT : với mỗi khách, index scan lấy đúng 2 dòng rồi dừng
                  → thắng lớn khi số khách nhỏ và orders rất lớn
```

Biết cả hai cách và nói được khi nào chọn cái nào là câu trả lời cấp senior. SQL Server gọi cấu trúc này là `CROSS APPLY` / `OUTER APPLY`; MySQL 8.0.14+ hỗ trợ `LATERAL` với cú pháp giống Postgres.

## Subquery trong UPDATE và DELETE

Mảng này ít được luyện nhưng gặp thường xuyên khi đi làm — và sai thì mất dữ liệu thật.

```sql
-- Cập nhật tổng tiền đơn từ dòng chi tiết
UPDATE orders o
SET total_amount = (
    SELECT COALESCE(SUM(oi.quantity * oi.unit_price), 0)
    FROM order_items oi
    WHERE oi.order_id = o.order_id
)
WHERE EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.order_id);
--    ▲ mệnh đề WHERE này BẮT BUỘC: thiếu nó, đơn không có item sẽ bị set 0 (hoặc NULL)

-- Postgres: dạng UPDATE ... FROM thường nhanh hơn và dễ đọc hơn
UPDATE orders o
SET total_amount = s.tong
FROM (
    SELECT order_id, SUM(quantity * unit_price) AS tong
    FROM order_items GROUP BY order_id
) AS s
WHERE s.order_id = o.order_id;

-- Xoá đơn của khách đã bị vô hiệu hoá
DELETE FROM orders o
WHERE EXISTS (SELECT 1 FROM customers c WHERE c.customer_id = o.customer_id AND c.email IS NULL);
```

**Quy tắc sống còn khi chạy trên production**: luôn viết `SELECT` trước với **đúng mệnh đề `WHERE` đó**, xem số dòng trả về, rồi mới đổi thành `UPDATE`/`DELETE`, và bọc trong transaction:

```sql
BEGIN;
SELECT COUNT(*) FROM orders o WHERE EXISTS (...);   -- kiểm tra: đúng số dòng mong đợi?
DELETE FROM orders o WHERE EXISTS (...);
-- ROLLBACK;  ← nếu số dòng bị ảnh hưởng khác dự kiến
COMMIT;
```

Kể được thói quen này trong phỏng vấn là tín hiệu mạnh rằng bạn đã làm việc với dữ liệu thật.

> Bẫy MySQL: không cho phép `UPDATE`/`DELETE` trên một bảng mà subquery lại `SELECT` từ chính bảng đó (`You can't specify target table for update in FROM clause`). Cách vòng: bọc thêm một tầng derived table `(SELECT * FROM (SELECT ...) AS tmp)`. PostgreSQL không có hạn chế này.

## Bẫy thường gặp với subquery

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| `NOT IN` với tập chứa NULL | Kết quả rỗng, không báo lỗi | `NOT EXISTS` |
| Scalar subquery trả nhiều dòng | Lỗi runtime, thường ở production | Thêm `LIMIT 1` + `ORDER BY`, hoặc dùng aggregate |
| Nhiều scalar subquery trên cùng bảng | Quét lặp, N+1 | Gom một lần rồi `LEFT JOIN` |
| Derived table thiếu alias | Lỗi cú pháp | Luôn đặt alias |
| `IN` với danh sách hàng nghìn phần tử | Plan xấu, parse chậm | Đưa vào bảng tạm rồi `JOIN` |
| `JOIN` thay `EXISTS` mà quên `DISTINCT` | Nhân dòng | Dùng `EXISTS` khi chỉ cần kiểm tra |
| `DELETE`/`UPDATE` không chạy thử `SELECT` | Mất dữ liệu thật | `BEGIN` → `SELECT` → thực thi → `COMMIT` |
| Subquery lồng 4-5 tầng | Không ai review nổi | Viết lại thành chuỗi CTE |
| `> ALL (tập rỗng)` | Trả `TRUE` ngoài dự kiến | Kiểm tra tập con có dòng không |

## Câu hỏi phỏng vấn hay gặp

**"Subquery và JOIN, cái nào nhanh hơn?"**
Không có câu trả lời chung. Optimizer thường viết lại subquery thành join, nên plan giống nhau. Khác biệt xuất hiện khi: (1) `NOT IN` với NULL — subquery buộc phải kiểm tra thêm, chậm và sai; (2) scalar subquery tương quan không decorrelate được — chậm hơn hẳn; (3) `JOIN` gây nhân dòng phải `DISTINCT` — chậm hơn `EXISTS`. Kết luận nên nói: *"em chọn theo ngữ nghĩa cho rõ ý, rồi kiểm chứng bằng `EXPLAIN ANALYZE` nếu chậm."*

**"Correlated subquery là gì, khi nào nên tránh?"**
Là subquery tham chiếu bảng ngoài, nên về logic chạy lại cho từng dòng. Nên tránh khi bảng ngoài lớn và điều kiện tương quan không có index — đó là công thức của query chạy hàng phút. Cách sửa: gom bảng con một lần rồi join, hoặc dùng window function.

**"Viết query tìm nhân viên có lương cao hơn lương trung bình phòng mình."**
```sql
-- Cách 1: correlated subquery (dễ hiểu, chậm nếu không index)
SELECT e.full_name, e.salary
FROM employees e
WHERE e.salary > (SELECT AVG(e2.salary) FROM employees e2 WHERE e2.dept_id = e.dept_id);

-- Cách 2: window function (một lần quét — nên nói cách này để ghi điểm)
SELECT full_name, salary
FROM (
    SELECT full_name, salary, AVG(salary) OVER (PARTITION BY dept_id) AS tb_phong
    FROM employees
) AS t
WHERE salary > tb_phong;
```
Đưa cả hai và giải thích cách 2 chỉ quét bảng một lần thay vì một lần cho mỗi nhân viên — đó là câu trả lời đầy đủ.

**"`EXISTS` nên viết `SELECT 1` hay `SELECT *`?"**
Như nhau. Optimizer bỏ qua hoàn toàn danh sách cột trong `EXISTS`. Đây là câu mẹo để xem bạn có nhắc lại tín điều cũ mà không kiểm chứng hay không.

## Tóm tắt bài 1

- Subquery đặt được ở `SELECT` (scalar), `FROM` (derived table) và `WHERE`/`HAVING` (predicate); mỗi vị trí một luật.
- **Correlated** (tham chiếu bảng ngoài) là dạng cần cảnh giác về performance; kiểm bằng `EXPLAIN` xem có `SubPlan` với `loops` lớn không.
- `EXISTS` là lựa chọn mặc định cho kiểm tra tồn tại; `NOT IN` với tập có NULL luôn sai.
- Scalar subquery trả nhiều hơn một dòng gây lỗi **runtime** — bom hẹn giờ đến khi dữ liệu tăng.
- `LATERAL` cho phép subquery nhìn thấy bảng trái, giải bài "top N mỗi nhóm" rất hiệu quả khi có index.
- Với `UPDATE`/`DELETE` kèm subquery: luôn `SELECT` thử trước, luôn bọc transaction.

**Bài kế tiếp** → [Bài 2: CTE và recursive CTE](02-cte-va-recursive-cte.md)
