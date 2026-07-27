# Bài 4: Bộ câu hỏi phỏng vấn SQL kèm đáp án

Bài này là kho ôn tập. Các câu được xếp theo cấp độ, mỗi câu có **đáp án mẫu ngắn gọn** — độ dài đúng bằng những gì bạn nên nói ra miệng trong phòng phỏng vấn, cộng một liên kết tới bài đã đào sâu khi cần ôn lại.

Cách dùng hiệu quả nhất: che phần đáp án, tự trả lời thành tiếng, rồi mới so. Trả lời trong đầu luôn trôi chảy hơn trả lời thành lời — và người phỏng vấn nghe cái thứ hai.

## Nhóm A — Intern / Fresher

**1. `WHERE` và `HAVING` khác nhau thế nào?**
`WHERE` lọc từng dòng **trước** khi gom nhóm nên không dùng được hàm aggregate. `HAVING` lọc từng nhóm **sau** khi gom nên dùng được `COUNT`, `SUM`. Lọc được ở `WHERE` thì đừng đẩy xuống `HAVING` vì lọc sớm rẻ hơn. → [phase-1 bài 4](../phase-1/04-group-by-having-va-nghe-thuat-aggregate.md)

**2. `INNER JOIN` và `LEFT JOIN` khác nhau thế nào?**
`INNER JOIN` chỉ giữ dòng match được ở cả hai bảng. `LEFT JOIN` giữ toàn bộ bảng trái, dòng nào không match thì mọi cột bảng phải nhận `NULL`. → [phase-1 bài 2](../phase-1/02-join-inner-vs-left-va-bai-toan-khach-chua-mua.md)

**3. `COUNT(*)`, `COUNT(cột)`, `COUNT(DISTINCT cột)` khác nhau ra sao?**
`COUNT(*)` đếm dòng kể cả dòng toàn NULL. `COUNT(cột)` chỉ đếm giá trị khác NULL. `COUNT(DISTINCT cột)` đếm giá trị phân biệt khác NULL.

**4. `DISTINCT` làm gì?**
Khử dòng trùng lặp trong kết quả. Lưu ý nó áp cho **toàn bộ danh sách cột** được chọn, không riêng cột đầu.

**5. `UNION` và `UNION ALL`?**
`UNION` khử trùng lặp (tốn thêm bước sort/hash), `UNION ALL` giữ nguyên và nhanh hơn. Mặc định nên dùng `UNION ALL`.

**6. `NULL` là gì?**
Là "không biết", không phải 0 cũng không phải chuỗi rỗng. Mọi so sánh với nó cho `UNKNOWN`, nên phải dùng `IS NULL` chứ không phải `= NULL`.

**7. Khoá chính và khoá ngoại khác nhau thế nào?**
Khoá chính định danh duy nhất một dòng trong bảng (`NOT NULL` + `UNIQUE`). Khoá ngoại trỏ tới khoá chính của bảng khác để đảm bảo toàn vẹn tham chiếu.

**8. `PRIMARY KEY` và `UNIQUE` khác gì?**
Mỗi bảng chỉ có một `PRIMARY KEY` và nó không cho phép NULL. `UNIQUE` có thể có nhiều và **cho phép nhiều dòng NULL**.

**9. `DELETE`, `TRUNCATE`, `DROP` khác nhau thế nào?**
`DELETE` xoá theo điều kiện, ghi log từng dòng, có thể rollback. `TRUNCATE` xoá sạch bảng rất nhanh, không đi qua trigger từng dòng. `DROP` xoá luôn cấu trúc bảng.

**10. `CHAR` và `VARCHAR`?**
`CHAR(n)` cố định độ dài, đệm khoảng trắng. `VARCHAR(n)` độ dài thay đổi. Trong PostgreSQL, `TEXT` và `VARCHAR` gần như tương đương về hiệu năng.

**11. `ORDER BY` mặc định tăng hay giảm?**
Tăng dần (`ASC`). Vị trí NULL thì tuỳ hệ: PostgreSQL để NULL cuối khi `ASC`, MySQL để NULL đầu.

**12. `LIMIT` và `OFFSET`?**
`LIMIT` giới hạn số dòng trả về, `OFFSET` bỏ qua N dòng đầu. `OFFSET` lớn rất chậm vì phải đọc rồi vứt bỏ. → [phase-3 bài 4](../phase-3/04-phan-trang-va-xu-ly-bang-lon.md)

**13. Viết query lấy 10 khách chi nhiều nhất.**
```sql
SELECT c.customer_id, c.full_name, SUM(o.total_amount) AS chi_tieu
FROM customers c JOIN orders o ON o.customer_id = c.customer_id
WHERE o.status <> 'cancelled'
GROUP BY c.customer_id, c.full_name
ORDER BY chi_tieu DESC
LIMIT 10;
```

**14. `LIKE` hoạt động thế nào?**
`%` khớp không hoặc nhiều ký tự, `_` khớp đúng một ký tự. `ILIKE` của PostgreSQL không phân biệt hoa thường.

**15. `BETWEEN` có bao gồm hai đầu không?**
Có, `BETWEEN a AND b` tương đương `>= a AND <= b`. Với kiểu thời gian nên tránh dùng — `BETWEEN '2024-01-01' AND '2024-01-31'` bỏ sót các bản ghi trong ngày 31 sau 00:00:00. Dùng `>= '2024-01-01' AND < '2024-02-01'`.

## Nhóm B — Junior

**16. Tìm khách chưa từng đặt hàng.**
`LEFT JOIN orders` rồi `WHERE o.order_id IS NULL`, hoặc `NOT EXISTS`. Ưu tiên `NOT EXISTS` vì miễn nhiễm NULL. → [phase-1 bài 2](../phase-1/02-join-inner-vs-left-va-bai-toan-khach-chua-mua.md)

**17. Vì sao `NOT IN` với subquery có thể trả về rỗng?**
Nếu tập con chứa `NULL`, mọi phép so sánh cho `UNKNOWN` và `WHERE` loại hết. Dùng `NOT EXISTS`.

**18. `LEFT JOIN` rồi đặt điều kiện ở `WHERE`, chuyện gì xảy ra?**
Nó biến thành `INNER JOIN`, vì dòng bù NULL không thoả điều kiện nên bị loại. Điều kiện về bảng phải phải đặt trong `ON`. → [phase-1 bài 3](../phase-1/03-join-nang-cao-fanout-on-vs-where-va-thuat-toan-join.md)

**19. Vì sao `SUM` sau khi join ra số lớn hơn thực tế?**
Join 1-N làm nhân dòng, giá trị bảng "1" bị lặp theo số dòng bảng "N". Sửa bằng cách gom bảng con về một dòng trước rồi mới join.

**20. Vì sao không dùng được alias của `SELECT` trong `WHERE`?**
Vì `WHERE` chạy trước `SELECT` trong thứ tự xử lý logic. `ORDER BY` thì dùng được vì chạy sau. → [phase-1 bài 1](../phase-1/01-vi-sao-8-tren-10-ung-vien-truot-vong-sql.md)

**21. `EXISTS` và `IN`, nên dùng cái nào?**
Trên engine hiện đại thường cùng plan. Chọn `EXISTS` khi chỉ cần kiểm tra tồn tại (an toàn với NULL), `IN` cho danh sách giá trị cố định ngắn, `JOIN` khi cần lấy cột từ bảng phải.

**22. Correlated subquery là gì?**
Subquery tham chiếu bảng ngoài, nên về mặt logic chạy lại cho mỗi dòng ngoài. Nhận biết bằng cách xem bên trong có nhắc alias bảng ngoài không. → [phase-2 bài 1](../phase-2/01-subquery-toan-tap.md)

**23. `GROUP BY` xử lý NULL thế nào?**
Mọi giá trị NULL được gom vào **một nhóm chung**, dù `NULL = NULL` bình thường cho `UNKNOWN`.

**24. `AVG` có tính dòng NULL không?**
Không — NULL bị loại khỏi cả tử và mẫu. Nếu NULL mang nghĩa 0 thì phải `AVG(COALESCE(col, 0))`.

**25. `COALESCE` và `NULLIF` làm gì?**
`COALESCE(a, b, c)` trả về giá trị khác NULL đầu tiên. `NULLIF(a, b)` trả về NULL nếu `a = b` — dùng nhiều nhất để chống chia cho 0.

**26. Tìm bản ghi trùng theo email.**
```sql
SELECT email, COUNT(*) FROM customers GROUP BY email HAVING COUNT(*) > 1;
```

**27. Viết query đếm số đơn của mọi khách, khách chưa mua hiện 0.**
`LEFT JOIN` + `COUNT(o.order_id)` (không phải `COUNT(*)`) + `GROUP BY`.

**28. `HAVING` không có `GROUP BY` thì sao?**
Hợp lệ — cả bảng được coi là một nhóm duy nhất.

**29. `CASE WHEN` dùng làm gì?**
Rẽ nhánh trong biểu thức. Kết hợp với `SUM`/`COUNT` cho phép pivot dữ liệu trong một lần quét bảng.

**30. Chuẩn hoá (normalization) là gì, 3NF là gì?**
Tách dữ liệu để loại bỏ trùng lặp và bất thường khi cập nhật. 1NF: mỗi ô một giá trị nguyên tử. 2NF: mọi cột không khoá phụ thuộc **toàn bộ** khoá chính. 3NF: không có cột không khoá phụ thuộc bắc cầu vào cột không khoá khác.

**31. Khi nào nên denormalize?**
Khi việc join trở thành nút thắt đọc và dữ liệu ít thay đổi — ví dụ lưu sẵn `total_amount` trên `orders` thay vì tính lại từ `order_items` mỗi lần. Đánh đổi: phải giữ hai chỗ đồng bộ.

## Nhóm C — Mid

**32. Window function khác `GROUP BY` chỗ nào?**
`GROUP BY` gộp nhiều dòng thành một. Window function tính trên nhóm nhưng **giữ nguyên mọi dòng**, chỉ thêm cột. → [phase-1 bài 5](../phase-1/05-window-function-tu-a-den-z.md)

**33. `RANK`, `DENSE_RANK`, `ROW_NUMBER` khác nhau?**
Với hai giá trị hoà ở vị trí 2: `ROW_NUMBER` cho 1,2,3,4; `RANK` cho 1,2,2,4 (nhảy cóc); `DENSE_RANK` cho 1,2,2,3 (đi đều).

**34. Tìm nhân viên lương cao thứ hai mỗi phòng ban.**
```sql
WITH t AS (
    SELECT full_name, dept_id, salary,
           DENSE_RANK() OVER (PARTITION BY dept_id ORDER BY salary DESC) AS hang
    FROM employees
)
SELECT * FROM t WHERE hang = 2;
```
Nói thêm: dùng `DENSE_RANK` nếu "mức lương cao thứ hai", dùng `ROW_NUMBER` + tiêu chí phá hoà nếu cần đúng một người.

**35. Vì sao không lọc window function trong `WHERE`?**
Window function tính ở bước `SELECT`, sau `WHERE`. Phải bọc CTE hoặc subquery rồi lọc ở tầng ngoài.

**36. Tính tăng trưởng so với tháng trước.**
`LAG(doanh_thu) OVER (ORDER BY thang)`, nhớ `NULLIF(mau, 0)` khi chia.

**37. Frame mặc định của window function là gì?**
Có `ORDER BY` thì mặc định là `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`. Đây là lý do `LAST_VALUE` luôn trả về dòng hiện tại nếu không mở rộng frame.

**38. `ROWS` và `RANGE` khác nhau?**
`ROWS` đếm theo số dòng vật lý; `RANGE` gộp mọi dòng có cùng giá trị `ORDER BY` thành một cụm. Luỹ kế trên dữ liệu có ngày trùng phải dùng `ROWS`.

**39. CTE có làm query nhanh hơn không?**
Không. Nó là công cụ tổ chức code. Trên PostgreSQL ≤ 11 nó còn là hàng rào tối ưu hoá làm query **chậm** hơn; từ 12 trở đi CTE tham chiếu một lần được inline. → [phase-2 bài 2](../phase-2/02-cte-va-recursive-cte.md)

**40. Recursive CTE dùng khi nào?**
Cây tổ chức, danh mục nhiều cấp, phân rã BOM, sinh chuỗi ngày, duyệt đồ thị. Cấu trúc: anchor + `UNION ALL` + recursive term, dừng khi không sinh dòng mới. Nhớ chống vòng lặp vô hạn.

**41. Index hoạt động thế nào?**
B+Tree cân bằng, độ sâu 3-4 tầng, lá được sắp thứ tự và nối đôi — nên phục vụ được cả tra chính xác, quét khoảng và `ORDER BY`. → [phase-3 bài 1](../phase-3/01-index-hoat-dong-the-nao-va-viet-query-dung-index.md)

**42. Quy tắc tiền tố trái là gì?**
Composite index `(a, b, c)` chỉ dùng được khi query cung cấp điều kiện từ trái sang liên tục: `(a)`, `(a,b)`, `(a,b,c)`. Chỉ lọc theo `b` thì index gần như vô dụng.

**43. Vì sao có index mà query vẫn quét toàn bảng?**
Bốn nguyên nhân chính: cột bị bọc trong hàm, ép kiểu ngầm, độ chọn lọc quá thấp (lấy phần lớn dòng), hoặc thống kê lỗi thời.

**44. Điều kiện SARGable nghĩa là gì?**
Điều kiện cho phép dùng index: cột đứng trần một vế, hằng số ở vế kia. `WHERE YEAR(d) = 2024` không SARGable; `WHERE d >= '2024-01-01' AND d < '2025-01-01'` thì có.

**45. Covering index là gì?**
Index chứa đủ mọi cột query cần, cho phép index-only scan mà không phải quay về bảng đọc dữ liệu. PostgreSQL có `INCLUDE` cho cột chỉ để chở theo.

**46. Đọc `EXPLAIN ANALYZE` thế nào?**
Đọc từ trong ra ngoài. So `rows` ước lượng với `actual rows` để phát hiện thống kê sai. Chú ý `loops`, `Rows Removed by Filter`, và các node đổ đĩa. → [phase-3 bài 2](../phase-3/02-doc-hieu-execution-plan.md)

**47. Ba thuật toán join là gì?**
Nested loop (bảng ngoài nhỏ + index bảng trong), hash join (bảng lớn, điều kiện bằng, cần RAM), merge join (dữ liệu đã sắp theo cột join).

**48. Query chậm, bạn làm gì đầu tiên?**
Chạy `EXPLAIN (ANALYZE, BUFFERS)` — đo trước, sửa sau. Không đoán.

**49. `OFFSET` sâu chậm, thay bằng gì?**
Keyset pagination: nhớ giá trị dòng cuối trang trước, dùng `WHERE (cot, id) < (:cot, :id)`. Thời gian trở thành hằng số.

**50. `COUNT(*)` trên bảng 50 triệu dòng chậm, xử lý sao?**
Dùng ước lượng từ `pg_class.reltuples`, hoặc đếm có chặn (`LIMIT 1001` rồi hiển thị "1000+"), hoặc bảng đếm riêng nếu bắt buộc chính xác. Trước hết nên hỏi nghiệp vụ có cần con số chính xác không.

## Nhóm D — Senior

**51. Thiết kế index cho một bảng cụ thể, bạn dựa vào gì?**
Dựa vào các query thực tế (lấy từ `pg_stat_statements`), không dựa vào cấu trúc bảng. Xếp cột `=` trước, cột khoảng sau. Cân nhắc covering index cho query nóng, partial index khi bộ lọc cố định. Xoá index chưa từng được dùng.

**52. Khi nào phân vùng bảng?**
Khi bảng đủ lớn để bảo trì thành vấn đề, **và** query lọc tự nhiên theo khoá phân vùng, **và** dữ liệu cũ bị xoá theo lô. Thiếu điều kiện thứ hai thì phân vùng chỉ làm chậm thêm.

**53. Thêm cột `NOT NULL` vào bảng 200 triệu dòng?**
Thêm cột nullable → deploy code ghi giá trị mới → backfill theo lô → `CHECK ... NOT VALID` → `VALIDATE CONSTRAINT`. Nguyên tắc: tách thao tác giữ khoá nặng khỏi thao tác quét lâu. → [phase-3 bài 4](../phase-3/04-phan-trang-va-xu-ly-bang-lon.md)

**54. Bốn mức isolation và mặc định của các hệ?**
`READ UNCOMMITTED`, `READ COMMITTED` (mặc định PostgreSQL/Oracle/SQL Server), `REPEATABLE READ` (mặc định MySQL), `SERIALIZABLE`. PostgreSQL chặn luôn phantom ở mức `REPEATABLE READ`. → [phase-4 bài 3](03-transaction-isolation-va-khoa-trong-phong-van.md)

**55. Lost update là gì, chống thế nào?**
Hai transaction cùng đọc rồi cùng ghi, một bản cập nhật biến mất. Ba cách: ghi nguyên tử (`SET x = x - 1`), khoá bi quan (`FOR UPDATE`), khoá lạc quan (cột version + retry).

**56. Hai người cùng đặt chỗ cuối cùng?**
Ràng buộc `UNIQUE` là biện pháp chắc chắn nhất; `FOR UPDATE` nếu cần tính toán trước khi ghi; `EXCLUDE` constraint cho bài toán chồng lấn khoảng thời gian. "Kiểm tra rồi chèn" ở tầng ứng dụng luôn có đua tranh.

**57. Deadlock xảy ra thế nào và phòng ra sao?**
Chờ vòng tròn giữa các transaction. Phòng bằng thứ tự khoá nhất quán, transaction ngắn, retry có backoff, `lock_timeout`.

**58. MVCC là gì và hệ quả?**
Mỗi `UPDATE` tạo phiên bản mới thay vì sửa tại chỗ. Đọc không chặn ghi. Đổi lại có dòng chết cần `VACUUM`; transaction dài chặn `VACUUM` gây phình bảng; `COUNT(*)` phải quét thật.

**59. Đảm bảo webhook không xử lý hai lần?**
Khoá idempotency do client sinh + unique index + `INSERT ... ON CONFLICT DO NOTHING` + trả về kết quả lần xử lý đầu khi phát hiện trùng. → [phase-4 bài 2](02-case-du-lieu-trung-lap-dedup-va-upsert.md)

**60. Nhiều worker cùng lấy việc từ một bảng, tránh giẫm chân?**
`SELECT ... FOR UPDATE SKIP LOCKED LIMIT n` trong CTE, rồi `UPDATE` trạng thái và `RETURNING`. Đây là cách dựng hàng đợi ngay trong database.

**61. Bạn theo dõi sức khoẻ database bằng gì?**
`pg_stat_statements` (query tốn tổng thời gian nhiều nhất), `pg_stat_user_tables` (dòng chết, lần autovacuum gần nhất), `pg_stat_activity` (transaction treo, `idle in transaction`), tỉ lệ cache hit, độ trễ replica, và cảnh báo cho query vượt ngưỡng.

**62. Khi nào chọn NoSQL thay SQL?**
Khi lược đồ thay đổi liên tục và không cần join, khi cần mở rộng ngang tuyến tính vượt xa khả năng một node, hoặc khi mô hình truy cập luôn theo một khoá duy nhất. Ngược lại, cần giao dịch nhiều bảng, truy vấn linh hoạt và toàn vẹn tham chiếu thì SQL vẫn thắng.

**63. Tối ưu ưu tiên theo tiêu chí nào?**
Theo **tổng thời gian tiêu tốn**, không theo thời gian trung bình. Query 5ms chạy 2 triệu lần/ngày đáng sửa hơn query 8 giây chạy một lần/ngày.

## Nhóm E — Bài tập viết query

**64. Nhân viên lương cao hơn quản lý trực tiếp.**
```sql
SELECT e.full_name, e.salary, m.full_name AS quan_ly, m.salary AS luong_ql
FROM employees e
JOIN employees m ON m.emp_id = e.manager_id
WHERE e.salary > m.salary;
```
Dùng `INNER JOIN` là đúng: người không có quản lý thì không so sánh được.

**65. Top 3 sản phẩm bán chạy mỗi danh mục.**
```sql
WITH t AS (
    SELECT p.category, p.name, SUM(oi.quantity) AS sl,
           DENSE_RANK() OVER (PARTITION BY p.category ORDER BY SUM(oi.quantity) DESC) AS hang
    FROM order_items oi JOIN products p ON p.product_id = oi.product_id
    GROUP BY p.category, p.name
)
SELECT * FROM t WHERE hang <= 3;
```

**66. Xoá bản ghi trùng, giữ bản mới nhất.**
```sql
WITH d AS (
    SELECT customer_id,
           ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(email))
                              ORDER BY created_at DESC, customer_id DESC) AS n
    FROM customers WHERE email IS NOT NULL
)
DELETE FROM customers c USING d WHERE c.customer_id = d.customer_id AND d.n > 1;
```
Nói thêm: chạy `SELECT` kiểm tra trước, bọc transaction, rồi thêm ràng buộc unique để không tái diễn.

**67. Doanh thu theo tháng kèm luỹ kế và tăng trưởng.**
```sql
WITH m AS (
    SELECT date_trunc('month', ordered_at)::date AS thang, SUM(total_amount) AS dt
    FROM orders WHERE status <> 'cancelled' GROUP BY 1
)
SELECT thang, dt,
       SUM(dt) OVER (ORDER BY thang ROWS UNBOUNDED PRECEDING) AS luy_ke,
       ROUND(100.0*(dt - LAG(dt) OVER (ORDER BY thang))
             / NULLIF(LAG(dt) OVER (ORDER BY thang),0), 1)     AS tang_truong_pct
FROM m ORDER BY thang;
```

**68. Chuỗi ngày mua hàng liên tiếp dài nhất mỗi khách.**
```sql
WITH ngay AS (
    SELECT DISTINCT customer_id, ordered_at::date AS d
    FROM orders WHERE status <> 'cancelled'
),
dao AS (
    SELECT customer_id, d,
           d - (ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY d))::int AS g
    FROM ngay
)
SELECT customer_id, MIN(d) AS bat_dau, MAX(d) AS ket_thuc, COUNT(*) AS so_ngay
FROM dao GROUP BY customer_id, g ORDER BY so_ngay DESC;
```
Mẹo gaps and islands: `ngày - số thứ tự` là hằng số trong mỗi chuỗi liên tiếp.

**69. Toàn bộ cấp dưới của một quản lý (mọi tầng).**
```sql
WITH RECURSIVE t AS (
    SELECT emp_id, full_name, manager_id, 1 AS cap FROM employees WHERE emp_id = 1
    UNION ALL
    SELECT e.emp_id, e.full_name, e.manager_id, t.cap + 1
    FROM employees e JOIN t ON t.emp_id = e.manager_id
)
SELECT * FROM t WHERE emp_id <> 1;
```

**70. Tỉ trọng doanh thu từng danh mục trên tổng.**
```sql
SELECT p.category,
       SUM(oi.quantity * oi.unit_price) AS dt,
       ROUND(100.0 * SUM(oi.quantity * oi.unit_price)
             / SUM(SUM(oi.quantity * oi.unit_price)) OVER (), 1) AS pct
FROM order_items oi JOIN products p ON p.product_id = oi.product_id
GROUP BY p.category;
```
Điểm đáng chú ý: `SUM(SUM(...)) OVER ()` — window function chạy **sau** `GROUP BY` nên lồng aggregate như vậy là hợp lệ.

**71. Khách mua tháng này nhưng không mua tháng trước.**
```sql
SELECT DISTINCT o.customer_id
FROM orders o
WHERE o.ordered_at >= date_trunc('month', CURRENT_DATE)
  AND NOT EXISTS (
      SELECT 1 FROM orders p
      WHERE p.customer_id = o.customer_id
        AND p.ordered_at >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month'
        AND p.ordered_at <  date_trunc('month', CURRENT_DATE)
  );
```

**72. Đơn hàng chưa có thanh toán (đối soát hằng ngày).**
```sql
SELECT o.order_id, o.total_amount, o.ordered_at
FROM orders o
WHERE o.status <> 'cancelled'
  AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.order_id);
```

**73. Trung vị lương toàn công ty.**
```sql
SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY salary) AS trung_vi FROM employees;
```
Nói thêm: dùng trung vị khi phân phối lệch, vì trung bình bị giá trị cực đoan kéo.

## Ba câu hỏi ngược nên hỏi người phỏng vấn

Cuối buổi thường có phần "bạn có câu hỏi gì không". Ba câu sau vừa hữu ích cho bạn, vừa cho thấy bạn tư duy như người đã đi làm:

- *"Dữ liệu của team hiện ở quy mô nào, và nút thắt lớn nhất hiện tại là gì?"*
- *"Team review query như thế nào trước khi lên production? Có quy trình cho migration không?"*
- *"Chỉ số nào team đang theo dõi mà mọi người thấy khó tin cậy nhất?"*

## Tóm tắt bài 4

- Nhóm A-B kiểm tra cú pháp và ngữ nghĩa; đây là nơi 80% ứng viên bị loại, chủ yếu vì NULL và JOIN.
- Nhóm C kiểm tra window function, CTE và khả năng đọc plan — ranh giới junior/mid.
- Nhóm D kiểm tra thiết kế, đồng thời và vận hành ở quy mô lớn — ranh giới mid/senior.
- Với mọi câu, cấu trúc trả lời tốt là: **định nghĩa ngắn → ví dụ cụ thể → đánh đổi**.
- Luyện bằng cách nói thành tiếng, không phải trả lời trong đầu.

**Bài kế tiếp** → [Bài 5: Checklist ôn tập trước buổi phỏng vấn](05-checklist-on-tap-truoc-buoi-phong-van.md)
