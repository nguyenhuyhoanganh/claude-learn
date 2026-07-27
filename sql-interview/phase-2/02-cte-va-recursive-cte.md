# Bài 2: CTE và recursive CTE

Có một câu hỏi phỏng vấn nghe rất vô hại: *"Bạn dùng CTE khi nào?"*. Trả lời "để query dễ đọc hơn" là đúng nhưng chỉ được nửa điểm. Nửa điểm còn lại nằm ở chỗ CTE **không phải luôn miễn phí** — trên một số phiên bản database nó dựng ra một hàng rào tối ưu hoá khiến query chậm đi hàng chục lần, và biết chuyện đó là dấu hiệu bạn từng tối ưu query thật.

Phần thứ hai của bài — **recursive CTE** — là thứ ít ứng viên biết dùng thành thạo, nên nó gần như luôn tạo ấn tượng: cây tổ chức, chuỗi ngày lấp lỗ hổng báo cáo, duyệt đồ thị, phân rã BOM sản phẩm. Tất cả đều là một khuôn duy nhất.

## CTE là gì: đặt tên cho một bước tính

CTE (Common Table Expression — biểu thức bảng dùng chung) là một tập kết quả tạm được đặt tên, chỉ tồn tại trong phạm vi câu lệnh đó.

```sql
WITH ten_cte AS (
    SELECT ...
)
SELECT * FROM ten_cte;
```

So sánh trực tiếp với derived table ở bài trước:

```sql
-- Derived table: đọc từ TRONG RA NGOÀI, tầng lồng tầng
SELECT t2.thang, t2.doanh_thu
FROM (
    SELECT thang, doanh_thu, AVG(doanh_thu) OVER () AS tb
    FROM (
        SELECT date_trunc('month', ordered_at)::date AS thang, SUM(total_amount) AS doanh_thu
        FROM orders WHERE status <> 'cancelled' GROUP BY 1
    ) AS t1
) AS t2
WHERE t2.doanh_thu > t2.tb;

-- CTE: đọc từ TRÊN XUỐNG, mỗi bước một cái tên
WITH doanh_thu_thang AS (
    SELECT date_trunc('month', ordered_at)::date AS thang,
           SUM(total_amount)                     AS doanh_thu
    FROM orders
    WHERE status <> 'cancelled'
    GROUP BY 1
),
co_trung_binh AS (
    SELECT thang, doanh_thu, AVG(doanh_thu) OVER () AS tb
    FROM doanh_thu_thang
)
SELECT thang, doanh_thu
FROM co_trung_binh
WHERE doanh_thu > tb;
```

```text
   thang    | doanh_thu
------------+-----------
 2024-05-01 |   5400000
```

Cùng kết quả, cùng plan (trên Postgres 12+), nhưng bản CTE đọc như một quy trình gồm ba bước có tên. Khi query dài 150 dòng và bạn phải sửa nó sau sáu tháng, khác biệt này là tất cả.

**CTE tham chiếu được CTE đứng trước nó** — đó là điều tạo nên "đường ống" (pipeline):

```text
WITH  buoc_1 AS (...)          ← chỉ đọc bảng gốc
    , buoc_2 AS (... FROM buoc_1 ...)   ← dùng kết quả bước 1
    , buoc_3 AS (... FROM buoc_2 ...)   ← dùng kết quả bước 2
SELECT ... FROM buoc_3;
```

Chiều ngược lại thì không: `buoc_1` không nhìn thấy `buoc_2`. Ngoại lệ duy nhất là CTE đệ quy tự tham chiếu chính nó.

## CTE, subquery, temp table hay view: chọn cái nào

Đây là câu hỏi phỏng vấn ở tầng thiết kế, và bảng dưới là câu trả lời gọn:

| Tiêu chí | CTE | Derived table | Temp table | View |
|---|---|---|---|---|
| Phạm vi tồn tại | Một câu lệnh | Một câu lệnh | Cả session | Vĩnh viễn |
| Dễ đọc khi nhiều bước | **Tốt nhất** | Kém khi lồng sâu | Tốt | Tốt |
| Tái sử dụng trong cùng query | Có | Không | Có | Có |
| Đánh index được | Không | Không | **Có** | Không (trừ materialized view) |
| Có thống kê (statistics) | Không | Không | **Có** (sau `ANALYZE`) | Theo bảng gốc |
| Đệ quy | **Có** | Không | Không | Không |
| Dùng khi | Query nhiều bước, đọc một lần | Bước tính đơn giản | Kết quả trung gian lớn, dùng nhiều lần | Logic dùng chung nhiều query |

Quy tắc thực dụng: **mặc định dùng CTE**. Chuyển sang temp table khi kết quả trung gian lớn (hàng triệu dòng) và bị dùng lại nhiều lần trong cùng phiên — vì chỉ temp table mới đánh index và thu thập thống kê được.

## Bẫy quan trọng: CTE có phải hàng rào tối ưu hoá không

Đây là phần tách ứng viên biết dùng CTE khỏi ứng viên hiểu CTE.

```text
PostgreSQL ≤ 11 : CTE LUÔN được materialize (tính xong, lưu vào bộ nhớ tạm)
                  → optimizer KHÔNG đẩy được điều kiện WHERE từ ngoài vào trong
                  → gọi là "optimization fence"

PostgreSQL 12+  : CTE được INLINE (nhúng thẳng như subquery) nếu:
                    - chỉ được tham chiếu ĐÚNG MỘT LẦN, và
                    - không có side effect (không INSERT/UPDATE/DELETE), và
                    - không đệ quy
                  → hành vi giống derived table, tối ưu tốt hơn
                  → ép thủ công bằng MATERIALIZED / NOT MATERIALIZED
```

Vì sao đáng quan tâm? Ví dụ minh hoạ hậu quả trên Postgres 11:

```sql
WITH tat_ca_don AS (
    SELECT * FROM orders          -- giả sử bảng có 50 triệu dòng
)
SELECT * FROM tat_ca_don WHERE order_id = 12345;
```

Trên Postgres ≤ 11: quét **toàn bộ 50 triệu dòng** vào bộ nhớ tạm rồi mới lọc ra 1 dòng — vì `WHERE order_id = 12345` không chui vào trong CTE được. Trên Postgres 12+: CTE được inline, điều kiện được đẩy xuống, index scan lấy đúng 1 dòng.

Điều khiển thủ công khi cần:

```sql
-- Ép tính một lần rồi tái dùng: hữu ích khi CTE đắt và được tham chiếu nhiều lần
WITH thong_ke AS MATERIALIZED (
    SELECT customer_id, SUM(total_amount) AS tong FROM orders GROUP BY customer_id
)
SELECT * FROM thong_ke a JOIN thong_ke b ON b.tong > a.tong;

-- Ép nhúng thẳng để optimizer đẩy được filter xuống
WITH don_gan_day AS NOT MATERIALIZED (
    SELECT * FROM orders
)
SELECT * FROM don_gan_day WHERE ordered_at >= '2024-06-01';
```

Các hệ khác:

| Hệ | Hành vi |
|---|---|
| PostgreSQL ≤ 11 | Luôn materialize |
| PostgreSQL 12+ | Inline nếu tham chiếu 1 lần; có `MATERIALIZED` / `NOT MATERIALIZED` |
| MySQL 8 | Optimizer tự chọn merge hoặc materialize |
| SQL Server | Luôn inline (không có hàng rào) |
| Oracle | Tự chọn; có hint `/*+ MATERIALIZE */` |

Nêu được "trên Postgres 12 trở lên thì CTE được inline nên không còn là fence như trước" là một trong những câu trả lời gây ấn tượng mạnh nhất về SQL.

## Recursive CTE: giải bài toán cây và đồ thị

Cấu trúc luôn gồm ba phần:

```text
WITH RECURSIVE ten AS (
    -- ① ANCHOR: điểm xuất phát, chạy MỘT LẦN
    SELECT ... FROM bang WHERE <điều kiện gốc>

    UNION ALL          -- ② UNION ALL (dùng UNION nếu cần tự khử trùng — chậm hơn)

    -- ③ RECURSIVE TERM: tham chiếu CHÍNH NÓ, chạy lặp tới khi không sinh dòng mới
    SELECT ... FROM bang JOIN ten ON ...
)
SELECT * FROM ten;
```

Cơ chế thực thi:

```text
Vòng 0: chạy anchor            → tập kết quả R0
Vòng 1: chạy recursive term với đầu vào R0  → R1
Vòng 2: chạy recursive term với đầu vào R1  → R2
...
Dừng khi một vòng sinh ra 0 dòng.
Kết quả cuối = R0 ∪ R1 ∪ R2 ∪ ...
```

Điểm hay bị hiểu nhầm: recursive term **chỉ nhìn thấy dòng mới sinh ra ở vòng trước**, không phải toàn bộ kết quả tích luỹ.

### Ứng dụng 1: cây tổ chức (câu hỏi kinh điển nhất)

```sql
WITH RECURSIVE cay_to_chuc AS (
    SELECT emp_id,
           full_name,
           manager_id,
           1                        AS cap,
           full_name::text          AS duong_dan
    FROM employees
    WHERE manager_id IS NULL                       -- ① gốc: người không có sếp

    UNION ALL

    SELECT e.emp_id,
           e.full_name,
           e.manager_id,
           c.cap + 1,
           c.duong_dan || ' > ' || e.full_name     -- nối đường dẫn từ gốc
    FROM employees   AS e
    JOIN cay_to_chuc AS c ON c.emp_id = e.manager_id   -- ③ nối con vào cha
)
SELECT cap, repeat('    ', cap - 1) || full_name AS so_do, duong_dan
FROM cay_to_chuc
ORDER BY duong_dan;
```

```text
 cap |        so_do        |          duong_dan
-----+---------------------+------------------------------
   1 | Nguyen An           | Nguyen An
   2 |     Bui Hoa         | Nguyen An > Bui Hoa
   3 |         Vo Phuong   | Nguyen An > Hoang Em > Vo Phuong
   2 |     Dang Giang      | Nguyen An > Dang Giang
   2 |     Hoang Em        | Nguyen An > Hoang Em
   2 |     Le Cuong        | Nguyen An > Le Cuong
   2 |     Pham Dung       | Nguyen An > Pham Dung
   2 |     Tran Binh       | Nguyen An > Tran Binh
```

Từ khuôn này ra được cả loạt biến thể hay bị hỏi tiếp:

```sql
-- Toàn bộ CẤP DƯỚI (trực tiếp và gián tiếp) của một người
WITH RECURSIVE cap_duoi AS (
    SELECT emp_id, full_name, manager_id FROM employees WHERE emp_id = 5   -- Hoang Em
    UNION ALL
    SELECT e.emp_id, e.full_name, e.manager_id
    FROM employees e JOIN cap_duoi c ON c.emp_id = e.manager_id
)
SELECT * FROM cap_duoi WHERE emp_id <> 5;

-- Chuỗi QUẢN LÝ đi lên từ một nhân viên (đảo chiều điều kiện JOIN)
WITH RECURSIVE chuoi_ql AS (
    SELECT emp_id, full_name, manager_id FROM employees WHERE emp_id = 6   -- Vo Phuong
    UNION ALL
    SELECT m.emp_id, m.full_name, m.manager_id
    FROM employees m JOIN chuoi_ql c ON m.emp_id = c.manager_id
)
SELECT * FROM chuoi_ql;
-- → Vo Phuong → Hoang Em → Nguyen An
```

Chỉ đảo vế của điều kiện `JOIN` là đổi hướng duyệt cây — chi tiết nhỏ nhưng rất hay được hỏi.

### Ứng dụng 2: sinh chuỗi ngày để lấp lỗ hổng báo cáo

Vấn đề kinh điển: báo cáo doanh thu theo ngày **thiếu hẳn những ngày không có đơn**, làm biểu đồ bị gãy và phép tính "trung bình 7 ngày" sai.

```sql
WITH RECURSIVE chuoi_ngay AS (
    SELECT DATE '2024-04-01' AS ngay
    UNION ALL
    SELECT ngay + 1 FROM chuoi_ngay WHERE ngay < DATE '2024-06-30'
)
SELECT d.ngay,
       COALESCE(SUM(o.total_amount), 0) AS doanh_thu
FROM chuoi_ngay AS d
LEFT JOIN orders AS o
       ON o.ordered_at::date = d.ngay
      AND o.status <> 'cancelled'          -- điều kiện bảng phải → đặt ở ON
GROUP BY d.ngay
ORDER BY d.ngay;
```

Mọi ngày đều có dòng, ngày không bán được gì hiện `0` thay vì biến mất. Lưu ý `o.status <> 'cancelled'` nằm trong `ON` chứ không phải `WHERE` — đúng bài học ở [phase-1 bài 3](../phase-1/03-join-nang-cao-fanout-on-vs-where-va-thuat-toan-join.md).

> Trên PostgreSQL có cách ngắn hơn hẳn: `generate_series('2024-04-01'::date, '2024-06-30', '1 day')`. Nhưng MySQL **không có** hàm này, nên recursive CTE là cách chuẩn di động giữa các hệ. Biết cả hai và nói rõ vì sao chọn cái nào là câu trả lời tốt.

### Ứng dụng 3: duyệt đồ thị và chống vòng lặp vô hạn

Với cây thì an toàn, nhưng dữ liệu thật hay có vòng (A quản lý B, B quản lý A do nhập sai) — và recursive CTE sẽ **chạy mãi không dừng**, chiếm CPU tới khi bị kill.

Cách phòng thủ chuẩn là mang theo đường đi đã qua:

```sql
WITH RECURSIVE duyet AS (
    SELECT emp_id, full_name, ARRAY[emp_id] AS da_qua, FALSE AS co_vong
    FROM employees WHERE manager_id IS NULL

    UNION ALL

    SELECT e.emp_id,
           e.full_name,
           d.da_qua || e.emp_id,
           e.emp_id = ANY(d.da_qua)         -- đã gặp node này rồi?
    FROM employees e
    JOIN duyet d ON d.emp_id = e.manager_id
    WHERE NOT d.co_vong                      -- gặp vòng thì dừng nhánh đó
      AND array_length(d.da_qua, 1) < 50     -- chốt chặn độ sâu tối đa
)
SELECT * FROM duyet;
```

PostgreSQL 14+ có cú pháp gọn hơn cho đúng việc này:

```sql
WITH RECURSIVE duyet AS (...)
    CYCLE emp_id SET co_vong USING duong_di
SELECT * FROM duyet;
```

Nhắc tới chống vòng lặp **trước khi người phỏng vấn hỏi** là điểm cộng lớn — nó cho thấy bạn nghĩ tới dữ liệu bẩn, không chỉ dữ liệu đẹp.

### Ứng dụng 4: các bài toán khác cùng khuôn

| Bài toán thực tế | Anchor | Recursive term |
|---|---|---|
| Cây danh mục sản phẩm nhiều cấp | Danh mục gốc | Danh mục con của tầng trước |
| Phân rã BOM (một sản phẩm gồm những linh kiện nào) | Sản phẩm cần tra | Linh kiện của linh kiện |
| Chuỗi giới thiệu (referral) nhiều tầng | Người được tra | Người do tầng trước giới thiệu |
| Luồng phê duyệt nhiều cấp | Bước đầu | Bước tiếp theo của bước trước |
| Tách chuỗi thành nhiều dòng | Chuỗi ban đầu | Phần còn lại sau khi cắt token đầu |
| Tính lãi kép theo kỳ | Số dư ban đầu | Số dư kỳ trước × (1 + lãi suất) |

## CTE ghi dữ liệu (chỉ PostgreSQL)

Một tính năng mạnh mà ít người biết: CTE có thể chứa `INSERT`/`UPDATE`/`DELETE` kèm `RETURNING`.

```sql
-- Chuyển đơn cũ sang bảng lưu trữ: xoá và chèn trong MỘT câu lệnh nguyên tử
WITH da_xoa AS (
    DELETE FROM orders
    WHERE ordered_at < '2024-01-01'
    RETURNING *
)
INSERT INTO orders_archive
SELECT * FROM da_xoa;

-- Cập nhật rồi ghi log ngay trong cùng câu lệnh
WITH cap_nhat AS (
    UPDATE products SET price = price * 1.1
    WHERE category = 'accessory'
    RETURNING product_id, price
)
INSERT INTO price_change_log (product_id, new_price, changed_at)
SELECT product_id, price, now() FROM cap_nhat;
```

Cả câu lệnh chạy trong **một transaction ngầm** — không có khoảnh khắc nào dữ liệu ở trạng thái nửa vời. Đây là kỹ thuật rất đáng nhắc khi được hỏi về di trú dữ liệu (data migration).

Một điểm cần biết: mọi nhánh của CTE ghi dữ liệu đều nhìn thấy **cùng một ảnh chụp** (snapshot) của dữ liệu tại thời điểm bắt đầu câu lệnh; chúng không thấy thay đổi của nhau. Chi tiết này quan trọng khi hai nhánh cùng đụng một bảng.

## Bẫy thường gặp với CTE

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Tưởng CTE luôn được tính một lần | Trên PG 12+, CTE tham chiếu 1 lần bị inline, tính lại nếu dùng nhiều nơi | `MATERIALIZED` khi cần tính đúng một lần |
| Dùng CTE trên PG ≤ 11 với bảng lớn | Optimization fence, quét toàn bảng | Nâng cấp, hoặc viết thành derived table |
| Recursive CTE trên đồ thị có vòng | Chạy vô hạn, chiếm CPU | Mảng `da_qua` hoặc `CYCLE`, giới hạn độ sâu |
| Quên từ khoá `RECURSIVE` | Lỗi "relation does not exist" | Bắt buộc `WITH RECURSIVE` khi tự tham chiếu |
| Dùng `UNION` thay `UNION ALL` trong đệ quy | Khử trùng mỗi vòng, chậm hơn nhiều | `UNION ALL`, trừ khi thật sự cần khử trùng |
| CTE lồng 8-10 tầng | Optimizer chọn plan kém, khó debug | Cắt thành nhiều query, hoặc dùng temp table |
| Tưởng CTE có index | Không có index, join lớn thành hash join tốn RAM | Temp table + `CREATE INDEX` nếu cần |
| Recursive term tham chiếu CTE hai lần | Lỗi — chỉ được tham chiếu đúng một lần | Viết lại logic |

## Câu hỏi phỏng vấn hay gặp

**"CTE có làm query nhanh hơn không?"**
Không. CTE là công cụ **tổ chức code**, không phải công cụ tối ưu. Trên Postgres 12+ nó thường được inline nên plan y hệt subquery. Trên Postgres ≤ 11 nó còn có thể làm **chậm hơn** vì chặn optimizer đẩy filter xuống. Trả lời đúng câu này là dấu hiệu nhận biết rõ nhất.

**"Khi nào dùng temp table thay CTE?"**
Khi kết quả trung gian lớn và bị dùng lại nhiều lần, khi cần đánh index lên nó, hoặc khi cần `ANALYZE` để optimizer có thống kê chính xác cho các bước sau. CTE không có index cũng không có statistics riêng.

**"Viết query in ra cây tổ chức có thụt lề theo cấp."**
Chính là ví dụ ở trên: recursive CTE mang theo `cap`, rồi `repeat('    ', cap - 1) || full_name`. Nhớ `ORDER BY duong_dan` để thứ tự hiển thị đúng thứ bậc — sắp theo `cap` sẽ ra thứ tự sai về mặt cây.

**"Recursive CTE dừng khi nào?"**
Khi một vòng lặp sinh ra **0 dòng mới**. Nếu dữ liệu có vòng thì không bao giờ dừng — phải tự chống bằng mảng đường đi hoặc giới hạn độ sâu.

**"MySQL có CTE không?"**
Có từ MySQL 8.0 (cả `WITH` lẫn `WITH RECURSIVE`). MySQL 5.7 thì không — phải dùng derived table, và bài toán cây phải giải bằng vòng lặp ở tầng ứng dụng hoặc kỹ thuật nested set. Đây là câu hỏi thăm dò xem bạn có làm với hệ cũ chưa.

## Tóm tắt bài 2

- CTE đặt tên cho từng bước tính, biến query lồng nhau thành đường ống đọc từ trên xuống.
- CTE **không** làm query nhanh hơn; trên Postgres ≤ 11 nó còn là hàng rào tối ưu hoá.
- Postgres 12+ inline CTE tham chiếu một lần; dùng `MATERIALIZED`/`NOT MATERIALIZED` khi cần điều khiển.
- Recursive CTE = anchor + `UNION ALL` + recursive term, dừng khi không sinh dòng mới.
- Khuôn đệ quy giải được: cây tổ chức, chuỗi ngày, phân rã BOM, duyệt đồ thị, tách chuỗi.
- Luôn chống vòng lặp bằng mảng đường đi hoặc giới hạn độ sâu khi dữ liệu có thể có chu trình.

**Bài kế tiếp** → [Bài 3: UNION, INTERSECT, EXCEPT và logic ba trị của NULL](03-union-intersect-except-va-logic-3-tri.md)
