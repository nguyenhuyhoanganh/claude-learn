# Bài 3: Bẫy ON vs WHERE, nhân dòng và thuật toán join

Bài trước bạn đã nắm INNER và LEFT JOIN. Bài này là phần mà người phỏng vấn dùng để tách ứng viên "học thuộc" khỏi ứng viên "đã từng bị dữ liệu cắn": hai bẫy khiến báo cáo sai số **mà không hề báo lỗi**, cộng với phần đào sâu về cách database thật sự thực hiện phép join.

Hai bẫy này — đặt điều kiện sai chỗ, và nhân dòng khi join — là nguyên nhân của phần lớn các bug "doanh thu trên dashboard không khớp với sổ kế toán" mà bạn sẽ gặp khi đi làm.

## Bẫy 1: `ON` và `WHERE` không thay thế được cho nhau

Với `INNER JOIN`, đặt điều kiện ở `ON` hay `WHERE` cho **cùng một kết quả**. Điều đó khiến rất nhiều người tưởng hai chỗ là như nhau. Với `LEFT JOIN` thì hoàn toàn khác — và khác theo cách âm thầm.

Nhớ lại thứ tự xử lý logic ở [Bài 1](01-vi-sao-8-tren-10-ung-vien-truot-vong-sql.md):

```text
  bước 2: JOIN ... ON   ← điều kiện ở đây quyết định "cặp nào được coi là match"
                          rồi MỚI bù NULL cho dòng trái mồ côi
  bước 3: WHERE         ← điều kiện ở đây lọc kết quả ĐÃ bù NULL xong
```

Điều kiện ở `ON` chạy **trước** khi bù NULL. Điều kiện ở `WHERE` chạy **sau**. Và dòng đã bù NULL thì gần như không bao giờ thoả nổi một điều kiện `WHERE` trên cột bảng phải.

### Đặt ở WHERE — LEFT JOIN bị "giáng cấp" thành INNER JOIN

```sql
SELECT c.customer_id, c.full_name, o.order_id, o.status
FROM customers AS c
LEFT JOIN orders AS o ON o.customer_id = c.customer_id
WHERE o.status = 'paid';                     -- điều kiện đặt ở WHERE
```

```text
 customer_id | full_name | order_id | status
-------------+-----------+----------+--------
           1 | Khach A   |        1 | paid
           1 | Khach A   |        2 | paid
(2 dòng)
```

Từ 5 khách còn đúng **1 khách**. Khách D, E bị bù NULL ở bước 2, sang bước 3 gặp `WHERE o.status = 'paid'` → `NULL = 'paid'` cho `UNKNOWN` → bị loại. Khách B, C có đơn nhưng không đơn nào `paid` → cũng bị loại. Chữ `LEFT` bạn viết ra trở nên **vô nghĩa**.

### Đặt ở ON — LEFT JOIN giữ đúng bản chất

```sql
SELECT c.customer_id, c.full_name, o.order_id, o.status
FROM customers AS c
LEFT JOIN orders AS o
       ON o.customer_id = c.customer_id
      AND o.status = 'paid';                 -- điều kiện đặt ở ON
```

```text
 customer_id | full_name | order_id | status
-------------+-----------+----------+--------
           1 | Khach A   |        1 | paid
           1 | Khach A   |        2 | paid
           2 | Khach B   |   [NULL] | [NULL]   ← có đơn, nhưng không đơn nào paid
           3 | Khach C   |   [NULL] | [NULL]
           4 | Khach D   |   [NULL] | [NULL]   ← chưa có đơn nào
           5 | Khach E   |   [NULL] | [NULL]
(5 dòng)
```

Đủ 5 khách. Điều kiện `status = 'paid'` được hiểu là *"chỉ coi đơn đã thanh toán là match hợp lệ"*, chứ không phải *"vứt bỏ mọi dòng không paid"*.

### Quy tắc ghi nhớ

```text
┌─────────────────────────────────────────────────────────────────┐
│  Điều kiện về BẢNG PHẢI trong LEFT JOIN  →  đặt ở ON            │
│  Điều kiện về BẢNG TRÁI                  →  đặt ở WHERE         │
│  INNER JOIN                              →  đặt đâu cũng như nhau│
└─────────────────────────────────────────────────────────────────┘
```

Câu hỏi tự kiểm khi review code: *"Nếu bảng phải không có dòng nào match, tôi còn muốn thấy dòng bảng trái không?"* Còn muốn → điều kiện phải nằm trong `ON`.

**Ngoại lệ quan trọng**: `WHERE o.order_id IS NULL` (anti-join ở bài trước) **cố tình** đặt ở `WHERE`. Đó chính là mục đích: lọc trên kết quả sau khi đã bù NULL. Cùng một cơ chế, hai mục đích ngược nhau.

| Bạn muốn | Viết thế nào |
|---|---|
| Mọi khách, kèm đơn `paid` nếu có | `LEFT JOIN ... ON ... AND o.status='paid'` |
| Chỉ khách có đơn `paid` | `INNER JOIN ... ON ... WHERE o.status='paid'` |
| Chỉ khách **không** có đơn `paid` nào | `LEFT JOIN ... ON ... AND o.status='paid'` **rồi** `WHERE o.order_id IS NULL` |

Dòng thứ ba là bài tập yêu thích của người phỏng vấn: nó buộc bạn dùng cả `ON` lẫn `WHERE` **cùng lúc, cho hai mục đích khác nhau**. Nếu bạn đẩy `status='paid'` xuống `WHERE`, kết quả sẽ sai hoàn toàn.

## Bẫy 2: Nhân dòng (fanout) làm sai tổng tiền

Đây là bug tốn tiền thật nhiều nhất trong danh sách này, vì nó tạo ra những con số **trông có vẻ hợp lý** nhưng lớn hơn thực tế.

`JOIN` không đảm bảo số dòng giữ nguyên. Nếu một dòng bảng trái match với N dòng bảng phải, nó bị **nhân lên N lần**:

```text
orders (1 dòng)                    order_items (2 dòng của order 1)
┌────┬──────┬──────────┐          ┌────┬──────┬─────┐
│ id │ cust │  total   │          │ oid│ prod │ qty │
│  1 │   1  │ 1,850,000│          │  1 │   1  │  1  │
└────┴──────┴──────────┘          │  1 │   2  │  1  │
                                   └────┴──────┴─────┘
                    JOIN ON oi.order_id = o.order_id
                                  ↓
┌────┬──────┬──────────┬──────┬─────┐
│  1 │   1  │ 1,850,000│   1  │  1  │  ← total_amount bị LẶP LẠI
│  1 │   1  │ 1,850,000│   2  │  1  │  ← lần thứ hai!
└────┴──────┴──────────┴──────┴─────┘
                SUM(total_amount) = 3,700,000  ✗  (thực tế 1,850,000)
```

Query sai — và trông hoàn toàn bình thường khi review:

```sql
SELECT c.customer_id,
       c.full_name,
       SUM(o.total_amount) AS doanh_thu,        -- SAI: bị nhân theo số sản phẩm
       COUNT(oi.order_item_id) AS so_san_pham
FROM customers  AS c
JOIN orders     AS o  ON o.customer_id = c.customer_id
JOIN order_items AS oi ON oi.order_id  = o.order_id
GROUP BY c.customer_id, c.full_name;
```

```text
 customer_id | full_name | doanh_thu | so_san_pham
-------------+-----------+-----------+-------------
           1 | Khach A   |   9100000 |           3   ← phải là 7,250,000
           2 | Khach B   |   5300000 |           2
           3 | Khach C   |    650000 |           1
```

Khách A: đơn 1 có 2 sản phẩm nên `1,850,000` bị cộng hai lần → `1.85tr × 2 + 5.4tr = 9.1tr` thay vì `7.25tr`. Sai **25%**, và không có bất kỳ cảnh báo nào.

### Ba cách sửa đúng

**Cách 1 — Gom trước, join sau (tốt nhất, rõ ràng nhất)**

```sql
WITH item_stats AS (                       -- gom về đúng 1 dòng / order
    SELECT oi.order_id,
           COUNT(*)                    AS so_san_pham,
           SUM(oi.quantity)            AS tong_so_luong
    FROM order_items AS oi
    GROUP BY oi.order_id
)
SELECT c.customer_id,
       c.full_name,
       SUM(o.total_amount)             AS doanh_thu,     -- giờ mỗi order chỉ 1 dòng
       SUM(item_stats.so_san_pham)     AS so_san_pham
FROM customers  AS c
JOIN orders     AS o  ON o.customer_id = c.customer_id
LEFT JOIN item_stats  ON item_stats.order_id = o.order_id
GROUP BY c.customer_id, c.full_name;
```

Nguyên tắc vàng: **gom bảng "nhiều" về mức chi tiết (grain) của bảng "một" trước khi join**. Đây là câu trả lời mà người phỏng vấn muốn nghe.

**Cách 2 — Dùng `COUNT(DISTINCT ...)` và tính lại tổng từ dòng chi tiết**

```sql
SELECT c.customer_id,
       COUNT(DISTINCT o.order_id)        AS so_don,
       SUM(oi.quantity * oi.unit_price)  AS doanh_thu   -- tính từ dòng chi tiết, không lặp
FROM customers   AS c
JOIN orders      AS o  ON o.customer_id = c.customer_id
JOIN order_items AS oi ON oi.order_id  = o.order_id
GROUP BY c.customer_id;
```

`SUM(oi.quantity * oi.unit_price)` an toàn vì mỗi dòng `order_items` chỉ xuất hiện đúng một lần. Nhưng `COUNT(DISTINCT ...)` đắt trên bảng lớn (phải sort/hash toàn bộ giá trị) — nêu được điểm này là điểm cộng.

**Cách 3 — Không join, dùng subquery vô hướng**

```sql
SELECT c.customer_id,
       (SELECT COALESCE(SUM(o.total_amount), 0)
        FROM orders o WHERE o.customer_id = c.customer_id) AS doanh_thu
FROM customers AS c;
```

Dễ đọc nhưng dễ thành N+1 nếu optimizer không viết lại được. Chỉ nên dùng khi bảng ngoài nhỏ.

### Dấu hiệu nhận biết bạn đang bị fanout

| Dấu hiệu | Ý nghĩa |
|---|---|
| Phải thêm `DISTINCT` để "kết quả trông đúng" | `DISTINCT` đang che fanout, không sửa nó |
| Số tổng lớn hơn số bạn nhẩm tay | Kinh điển |
| `COUNT(*)` sau join lớn hơn số dòng bảng gốc | Chắc chắn có nhân dòng |
| Nhiều `LEFT JOIN` tới nhiều bảng con | Fanout **nhân chồng lên nhau** |

Trường hợp cuối là tệ nhất. Nếu một đơn có 3 `order_items` và 2 `payments`, join cả hai cùng lúc cho `3 × 2 = 6` dòng, và mọi phép `SUM` đều sai theo hai hướng khác nhau:

```sql
-- SAI NẶNG: fanout nhân chồng
SELECT o.order_id, SUM(oi.quantity), SUM(pm.amount)
FROM orders o
JOIN order_items oi ON oi.order_id = o.order_id
JOIN payments    pm ON pm.order_id = o.order_id
GROUP BY o.order_id;
-- SUM(quantity) bị nhân theo số payment, SUM(amount) bị nhân theo số item
```

Cách sửa duy nhất đúng: gom **từng bảng con riêng** thành một dòng/đơn rồi mới join, hoặc dùng hai query riêng.

**Mẹo phòng thủ khi đi làm**: trước mỗi `JOIN`, tự hỏi *"quan hệ này là 1-1 hay 1-N?"*. Nếu là 1-N mà bạn định `SUM` cột của bảng "1" → dừng lại, gom trước.

## Self join: bảng tự nối với chính nó

Bảng `employees` tự tham chiếu qua `manager_id`. Muốn hiện tên sếp, phải join bảng với chính nó — dùng alias để phân biệt hai "bản sao":

```sql
SELECT e.full_name           AS nhan_vien,
       e.salary              AS luong_nv,
       m.full_name           AS quan_ly,
       m.salary              AS luong_ql
FROM employees AS e
LEFT JOIN employees AS m ON m.emp_id = e.manager_id   -- LEFT để giữ sếp lớn (manager_id NULL)
ORDER BY e.emp_id;
```

```text
  nhan_vien  | luong_nv  |  quan_ly  | luong_ql
-------------+-----------+-----------+----------
 Nguyen An   |  60000000 | [NULL]    |  [NULL]    ← sếp lớn, không có quản lý
 Tran Binh   |  45000000 | Nguyen An |  60000000
 Le Cuong    |  45000000 | Nguyen An |  60000000
 ...
```

Dùng `INNER JOIN` ở đây sẽ **mất sếp lớn** — bẫy nhỏ nhưng hay bị hỏi.

Biến thể kinh điển: *"tìm nhân viên lương cao hơn quản lý của mình"*:

```sql
SELECT e.full_name, e.salary, m.full_name AS quan_ly, m.salary
FROM employees AS e
JOIN employees AS m ON m.emp_id = e.manager_id
WHERE e.salary > m.salary;
```

Ở đây dùng `INNER JOIN` là **đúng**, vì người không có quản lý thì không thể "cao hơn quản lý". Chọn đúng loại join theo ngữ nghĩa bài toán chính là thứ được chấm.

Một biến thể khác — *"tìm các cặp nhân viên cùng phòng có lương bằng nhau"*:

```sql
SELECT a.full_name AS nv_1, b.full_name AS nv_2, a.salary
FROM employees AS a
JOIN employees AS b
      ON b.dept_id = a.dept_id
     AND b.salary  = a.salary
     AND b.emp_id  > a.emp_id       -- tránh tự ghép với chính mình VÀ tránh cặp lặp (A,B)+(B,A)
ORDER BY a.salary DESC;
-- → Tran Binh & Le Cuong, cùng 45,000,000
```

Điều kiện `b.emp_id > a.emp_id` là chi tiết ăn điểm. Không có nó, mỗi cặp xuất hiện hai lần cộng thêm các cặp tự ghép.

## Non-equi join: join không dùng dấu bằng

`ON` không bắt buộc phải là `=`. Đây là mảng ứng viên ít luyện nhưng gặp thường xuyên khi đi làm.

**Ghép theo khoảng giá trị** (bảng bậc thuế, bậc chiết khấu, khung điểm):

```sql
CREATE TABLE discount_tiers (
    tier_name  TEXT,
    min_amount NUMERIC,
    max_amount NUMERIC
);
INSERT INTO discount_tiers VALUES
    ('bronze',        0,  1000000),
    ('silver',  1000000,  5000000),
    ('gold',    5000000, 99999999);

SELECT o.order_id, o.total_amount, t.tier_name
FROM orders AS o
JOIN discount_tiers AS t
      ON o.total_amount >= t.min_amount
     AND o.total_amount <  t.max_amount;      -- không có dấu = giữa hai bảng
```

**Ghép theo khoảng thời gian hiệu lực** (bảng giá đổi theo thời gian — cực kỳ phổ biến trong thương mại điện tử):

```sql
SELECT oi.order_item_id, ph.price AS gia_tai_thoi_diem_mua
FROM order_items AS oi
JOIN orders      AS o  ON o.order_id = oi.order_id
JOIN price_history AS ph
      ON ph.product_id = oi.product_id
     AND o.ordered_at >= ph.valid_from
     AND o.ordered_at <  ph.valid_to;
```

> **Cảnh báo performance**: non-equi join không dùng được hash join (hash chỉ so sánh bằng). Database phải dùng nested loop hoặc merge join, chi phí tăng nhanh theo kích thước bảng. Trên bảng lớn, đây là một trong những nguyên nhân query chạy hàng phút. Nêu được cảnh báo này khi phỏng vấn = điểm cộng lớn ở tầng performance.

## Database thật sự join thế nào: ba thuật toán

Câu hỏi *"database thực hiện JOIN ra sao?"* thuộc tầng senior. Có ba thuật toán chính:

```text
1. NESTED LOOP JOIN
   for mỗi dòng ở bảng ngoài:
       tìm dòng khớp ở bảng trong (lý tưởng: qua index)
   Chi phí: O(N × chi_phí_tìm_kiếm)
   Tốt khi: bảng ngoài NHỎ và bảng trong CÓ INDEX trên cột join

2. HASH JOIN
   Pha build : đọc bảng nhỏ hơn, dựng hash table trên cột join (trong RAM)
   Pha probe : quét bảng lớn, tra hash table cho từng dòng
   Chi phí: O(N + M)
   Tốt khi: bảng lớn, không index, điều kiện là dấu BẰNG
   Điểm yếu: cần RAM (work_mem); tràn RAM → ghi tạm ra đĩa, chậm hẳn

3. MERGE JOIN (sort-merge)
   Sắp xếp cả hai bảng theo cột join, rồi chạy hai con trỏ song song
   Chi phí: O(N log N + M log M), giảm còn O(N + M) nếu đã sẵn thứ tự
   Tốt khi: dữ liệu đã sắp sẵn (đi theo index B-Tree), hoặc cả hai bảng đều rất lớn
```

| Thuật toán | Điều kiện `=`? | Cần index? | Cần RAM? | Tình huống điển hình |
|---|---|---|---|---|
| Nested Loop | Không bắt buộc | Rất nên có | Ít | Join theo khoá chính, bảng ngoài vài chục dòng |
| Hash Join | **Bắt buộc** | Không | Nhiều | Join hai bảng lớn không index, ETL/analytics |
| Merge Join | Bằng hoặc bất đẳng thức | Có thì tốt | Trung bình | Cả hai bảng đã sắp theo cột join |

Hai câu hỏi vặn hay đi kèm:

**"Vì sao query của tôi bỗng chậm gấp 50 lần sau khi dữ liệu tăng?"**
Thường là plan đổi từ hash join sang nested loop (hoặc ngược lại) do thống kê (statistics) lỗi thời. Chạy `ANALYZE` để cập nhật, rồi `EXPLAIN ANALYZE` để so estimate với thực tế.

**"Anti-join được thực hiện thế nào?"**
PostgreSQL có node riêng: `Hash Anti Join`. Nó dựng hash table từ bảng phải, rồi trả về những dòng bảng trái **không** tìm thấy match — nên `NOT EXISTS` và `LEFT JOIN ... IS NULL` thường ra cùng plan, đúng như đã nói ở bài trước.

## Bẫy tổng hợp về JOIN nâng cao

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Điều kiện bảng phải đặt ở `WHERE` trong LEFT JOIN | LEFT thành INNER, mất dòng | Đưa vào `ON` |
| `SUM` cột bảng "1" sau khi join bảng "N" | Số bị thổi phồng | Gom trước rồi join |
| Nhiều LEFT JOIN tới nhiều bảng con | Fanout nhân chồng | Gom từng bảng con riêng |
| `DISTINCT` để "chữa" kết quả sai | Che bug, chậm thêm | Tìm và sửa nguồn fanout |
| Self join quên điều kiện `a.id < b.id` | Cặp trùng, cặp tự ghép | Thêm điều kiện bất đẳng thức |
| Self join dùng INNER khi cần giữ gốc cây | Mất node gốc | Dùng `LEFT JOIN` |
| Non-equi join trên bảng lớn | Nested loop, query treo | Thu hẹp trước bằng filter, cân nhắc index range |
| Join qua cột khác kiểu (`VARCHAR` vs `INT`) | Ép kiểu ngầm, mất index | Ép kiểu tường minh, thống nhất kiểu ở schema |

## Câu hỏi phỏng vấn hay gặp

**"Vì sao báo cáo doanh thu của bạn cao hơn số kế toán?"** — Câu hỏi tình huống. Câu trả lời mong đợi: có thể do fanout khi join xuống bảng chi tiết, hoặc do quên loại đơn `cancelled`/`refunded`. Cách kiểm tra: so `COUNT(*)` trước và sau join; nếu tăng thì có nhân dòng.

**"`WHERE a.x = b.x` với `JOIN ... ON a.x = b.x`, khác gì nhau?"** — Với `INNER JOIN` là tương đương (dạng cũ `FROM a, b WHERE ...`). Với `OUTER JOIN` thì không tương đương như đã phân tích. Ngoài ra cú pháp `ON` tách bạch "điều kiện ghép" và "điều kiện lọc", nên dễ đọc và dễ review hơn.

**"`USING (customer_id)` khác `ON a.customer_id = b.customer_id` chỗ nào?"** — `USING` yêu cầu hai bảng đặt tên cột giống nhau và **gộp hai cột thành một** trong kết quả (không còn `a.customer_id` và `b.customer_id` riêng). Ngắn hơn nhưng làm mất khả năng phân biệt cột — với anti-join `IS NULL` thì bất tiện.

**"`NATURAL JOIN` có nên dùng không?"** — Không. Nó tự động join trên **mọi cột trùng tên**, nên chỉ cần ai đó thêm một cột `created_at` vào cả hai bảng là query âm thầm đổi ngữ nghĩa. Đây là câu trả lời "không" duy nhất được đánh giá cao.

## Tóm tắt bài 3

- Trong `LEFT JOIN`, điều kiện về bảng phải đặt ở `ON`; đặt ở `WHERE` sẽ biến nó thành `INNER JOIN`.
- Ngoại lệ có chủ đích: `WHERE <khoá bảng phải> IS NULL` chính là cách viết anti-join.
- Join 1-N làm **nhân dòng**; mọi `SUM`/`COUNT` sau đó đều sai. Sửa bằng cách **gom trước, join sau**.
- Cần `DISTINCT` để kết quả "trông đúng" là dấu hiệu đang che fanout chứ không phải sửa nó.
- Self join cần alias rõ ràng và điều kiện `a.id < b.id` khi tìm cặp.
- Ba thuật toán join: nested loop (bảng ngoài nhỏ + index), hash join (bảng lớn, điều kiện bằng), merge join (dữ liệu đã sắp).

**Bài kế tiếp** → [Bài 4: GROUP BY, HAVING và nghệ thuật aggregate](04-group-by-having-va-nghe-thuat-aggregate.md)
