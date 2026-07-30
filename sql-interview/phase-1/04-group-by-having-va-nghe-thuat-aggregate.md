# Bài 4: GROUP BY, HAVING và nghệ thuật aggregate

Câu hỏi *"HAVING khác WHERE chỗ nào?"* là câu người phỏng vấn dùng để phân loại: ai thật sự hiểu SQL, ai chỉ học vẹt. Nó ngắn, nghe đơn giản, nhưng trả lời được đến tận gốc thì phải nắm thứ tự xử lý logic — thứ mà người học vẹt không có.

Bài này đi từ câu hỏi đó, rồi mở rộng sang toàn bộ mảng aggregate: vì sao `COUNT(*)` và `COUNT(cột)` cho số khác nhau, vì sao `AVG` ra kết quả cao bất thường, và kỹ thuật conditional aggregation mà bạn sẽ dùng gần như hằng ngày khi làm báo cáo.

## "Aggregate" nghĩa là gì

Trước hết làm rõ từ sẽ dùng suốt bài. **Aggregate function** (hàm tổng hợp) là hàm **gộp nhiều dòng thành một giá trị duy nhất**.

```text
HÀM THƯỜNG                            HÀM AGGREGATE
──────────────────────────            ──────────────────────────────
UPPER('an')  →  'AN'                  COUNT(...)  →  gộp N dòng thành 1 số
ROUND(3.7)   →  4                     SUM(...)    →  gộp N dòng thành 1 tổng

1 giá trị vào → 1 giá trị ra          NHIỀU DÒNG vào → 1 GIÁ TRỊ ra
```

Sáu hàm aggregate bạn sẽ gặp 95% thời gian:

| Hàm | Làm gì | Trên cột lương (60, 45, 45, 38 triệu) |
|---|---|---|
| `COUNT(*)` | Đếm số dòng | 4 |
| `SUM(salary)` | Cộng dồn | 188,000,000 |
| `AVG(salary)` | Trung bình | 47,000,000 |
| `MAX(salary)` | Lớn nhất | 60,000,000 |
| `MIN(salary)` | Nhỏ nhất | 38,000,000 |
| `COUNT(DISTINCT salary)` | Đếm giá trị **khác nhau** | 3 (vì có hai người cùng 45tr) |

Dùng aggregate mà **không** có `GROUP BY` thì cả bảng được coi là một nhóm duy nhất, và kết quả luôn đúng **một dòng**:

```sql
SELECT COUNT(*), AVG(salary) FROM employees;    -- luôn trả về đúng 1 dòng
```

Còn khi có `GROUP BY`, aggregate được tính **riêng cho từng nhóm**, và kết quả có bao nhiêu nhóm thì bấy nhiêu dòng. Đó là toàn bộ nội dung phần tiếp theo.

## GROUP BY: gom dòng thành nhóm rồi ép về một dòng

`GROUP BY` làm đúng hai việc: chia các dòng thành nhóm theo giá trị bạn chỉ định, rồi **ép mỗi nhóm xuống còn đúng một dòng** kết quả.

```text
DỮ LIỆU GỐC (employees)              GROUP BY dept_id
┌─────┬─────────┬──────────┐
│ emp │ dept_id │  salary  │        ┌── nhóm dept_id = 1 ──┐
│  1  │    1    │ 60,000,000│  ───▶ │ 4 dòng → 1 dòng KQ  │ COUNT=4, AVG=47,000,000
│  2  │    1    │ 45,000,000│       └──────────────────────┘
│  3  │    1    │ 45,000,000│
│  4  │    1    │ 38,000,000│        ┌── nhóm dept_id = 2 ──┐
│  5  │    2    │ 52,000,000│  ───▶ │ 2 dòng → 1 dòng KQ  │ COUNT=2, AVG=46,500,000
│  6  │    2    │ 41,000,000│       └──────────────────────┘
│  7  │    3    │ 35,000,000│        ┌── nhóm dept_id = 3 ──┐ COUNT=1
│  8  │  NULL   │ 30,000,000│  ───▶ │                      │
└─────┴─────────┴──────────┘        ┌── nhóm dept_id NULL ─┐ COUNT=1
                                     └──────────────────────┘
```

**Điểm mấu chốt**: sau `GROUP BY`, những dòng gốc **không còn tồn tại** ở tầng trên nữa. Đó là lý do bạn chỉ được `SELECT` hai loại thứ: (1) cột nằm trong `GROUP BY`, và (2) hàm aggregate. Mọi thứ khác không có nghĩa — nhóm 4 nhân viên thì `full_name` là tên của ai?

> Chi tiết hay bị bỏ sót: **mọi giá trị `NULL` được gom vào cùng một nhóm**. `GROUP BY` coi các NULL là "bằng nhau" ở đây, dù `NULL = NULL` bình thường cho `UNKNOWN`. Nhân viên `Bui Hoa` (`dept_id` NULL) tạo ra một nhóm riêng — nhóm này rất hay bị quên trong báo cáo và làm tổng không khớp.

## WHERE và HAVING: hai chốt kiểm, hai thời điểm

Hình dung một băng chuyền nhà máy:

```text
      dữ liệu thô
           │
           ▼
   ┌───────────────┐
   │  WHERE        │  ← ANH BẢO VỆ CỔNG VÀO
   │  lọc TỪNG DÒNG│    Chạy TRƯỚC khi gom nhóm.
   └───────────────┘    Chưa biết "nhóm" là gì.
           │
           ▼
   ┌───────────────┐
   │  GROUP BY     │  ← gom dòng thành nhóm
   └───────────────┘
           │
           ▼
   ┌───────────────┐
   │  HAVING       │  ← ANH KIỂM ĐỊNH CỔNG RA
   │  lọc TỪNG NHÓM│    Chạy SAU khi gom.
   └───────────────┘    Nhìn được COUNT/SUM/AVG của cả nhóm.
           │
           ▼
        SELECT
```

Vì `WHERE` chạy trước khi nhóm tồn tại, nó **không thể** dùng hàm aggregate. Viết `WHERE COUNT(*) > 5` sẽ lỗi ngay:

```text
ERROR:  aggregate functions are not allowed in WHERE
LINE 4: WHERE COUNT(*) > 5
```

Người phỏng vấn rất thích gài đúng cái bẫy này, vì nó lộ ngay ai hiểu thứ tự xử lý.

### Áp dụng: phòng ban đông người

```sql
SELECT d.dept_name,
       COUNT(*) AS so_nhan_vien
FROM employees   AS e
JOIN departments AS d ON d.dept_id = e.dept_id
GROUP BY d.dept_name
HAVING COUNT(*) > 2;               -- điều kiện trên NHÓM → bắt buộc HAVING
```

```text
  dept_name  | so_nhan_vien
-------------+--------------
 Engineering |            4
```

(Trong dữ liệu mẫu ta dùng ngưỡng `> 2`; đề phỏng vấn kinh điển là `> 5` — cùng một khuôn.)

### Dùng cả hai cùng lúc — trường hợp thực tế nhất

```sql
SELECT d.dept_name,
       COUNT(*)      AS so_nhan_vien,
       AVG(e.salary) AS luong_tb
FROM employees   AS e
JOIN departments AS d ON d.dept_id = e.dept_id
WHERE e.hired_at >= '2020-01-01'     -- lọc DÒNG: chỉ xét người vào từ 2020
GROUP BY d.dept_name
HAVING AVG(e.salary) > 40000000      -- lọc NHÓM: phòng có lương TB > 40tr
ORDER BY luong_tb DESC;
```

Hai điều kiện, hai tầng, không thay thế cho nhau được. `WHERE` chọn *người nào được tính vào*; `HAVING` chọn *phòng nào được hiện ra*.

> Thứ tự này còn ảnh hưởng tới kết quả, không chỉ tới cú pháp: `WHERE` chạy trước nên nó thay đổi luôn giá trị `AVG` mà `HAVING` nhìn thấy. Đổi `WHERE` thành điều kiện khác sẽ ra tập phòng ban khác — dù `HAVING` giữ nguyên.

### Câu kiểm tra nhanh hay bị hỏi

> *"Tính doanh thu theo tháng, chỉ hiện tháng trên 100 triệu — dùng WHERE hay HAVING?"*

`HAVING`, vì 100 triệu là điều kiện đặt lên **tổng của cả nhóm**:

```sql
SELECT date_trunc('month', o.ordered_at)::date AS thang,
       SUM(o.total_amount)                     AS doanh_thu
FROM orders AS o
WHERE o.status <> 'cancelled'                  -- lọc DÒNG: bỏ đơn huỷ
GROUP BY date_trunc('month', o.ordered_at)
HAVING SUM(o.total_amount) > 2000000           -- lọc NHÓM
ORDER BY thang;
```

```text
   thang    | doanh_thu
------------+-----------
 2024-05-01 |   5400000
 2024-06-01 |   2750000
```

Tháng 4 (1,850,000) bị `HAVING` loại. Đơn huỷ 3,200,000 bị `WHERE` loại từ đầu — nếu đưa nhầm điều kiện `status` vào `HAVING` thì không viết được, vì `status` không phải giá trị của nhóm.

**Quy tắc vàng**: điều kiện về **nhóm** dùng `HAVING`, điều kiện về **dòng** dùng `WHERE`. Và khi cả hai đều dùng được, hãy đặt ở `WHERE` — vì lọc sớm thì ít dữ liệu phải gom hơn, nhanh hơn.

## COUNT: ba biến thể, ba kết quả khác nhau

Đây là câu hỏi ngắn nhất trong bài nhưng loại nhiều người nhất.

```sql
SELECT COUNT(*)              AS dem_dong,        -- 5
       COUNT(c.email)        AS dem_email,       -- 4  (Khach E email NULL)
       COUNT(c.city)         AS dem_city,        -- 4  (Khach D city NULL)
       COUNT(DISTINCT c.city) AS dem_city_khac_nhau -- 3 (Ha Noi, HCM, Da Nang)
FROM customers AS c;
```

| Biến thể | Đếm cái gì | Bỏ qua NULL? |
|---|---|---|
| `COUNT(*)` | Số **dòng** | Không — đếm cả dòng toàn NULL |
| `COUNT(cột)` | Số **giá trị khác NULL** của cột | **Có** |
| `COUNT(DISTINCT cột)` | Số **giá trị phân biệt khác NULL** | **Có** |
| `COUNT(1)` | Giống hệt `COUNT(*)` | — |

Hai hiểu lầm cần dẹp:

**"`COUNT(1)` nhanh hơn `COUNT(*)`"** — Sai, đây là huyền thoại còn sót từ database cũ. Trong PostgreSQL, MySQL 8, SQL Server hiện đại, hai cái tạo ra **cùng một plan**. Nói được điều này khi phỏng vấn thì rất ăn điểm vì đa số vẫn tin ngược lại.

**"`COUNT(cột)` và `COUNT(*)` như nhau"** — Chỉ đúng khi cột đó `NOT NULL`. Và như đã thấy ở [Bài 2](02-join-inner-vs-left-va-bai-toan-khach-chua-mua.md), sau `LEFT JOIN` thì khác biệt này quyết định báo cáo đúng hay sai.

Trường hợp kinh điển nhất kết hợp cả hai:

```sql
SELECT d.dept_name,
       COUNT(*)         AS sai_neu_dem_dong,   -- Legal = 1  (SAI)
       COUNT(e.emp_id)  AS dung                -- Legal = 0  (ĐÚNG)
FROM departments AS d
LEFT JOIN employees AS e ON e.dept_id = d.dept_id
GROUP BY d.dept_name;
```

```text
  dept_name  | sai_neu_dem_dong | dung
-------------+------------------+------
 Engineering |                4 |    4
 Sales       |                2 |    2
 Marketing   |                1 |    1
 Legal       |                1 |    0     ← phòng rỗng, nhưng COUNT(*) vẫn ra 1
```

## NULL và các hàm aggregate: cái bẫy làm sai số liệu

**Mọi hàm aggregate (trừ `COUNT(*)`) đều bỏ qua NULL.** Nghe vô hại, nhưng nó tạo ra sai lệch âm thầm:

```text
Cột điểm: 10, 8, NULL, NULL, 6

SUM   = 24        (không phải 24 + 0 + 0)
COUNT = 3         (không đếm NULL)
AVG   = 24 / 3 = 8.0     ← chia cho 3, KHÔNG phải 5!
```

Nếu ý định của bạn là "NULL nghĩa là 0 điểm", thì `AVG` đang cho kết quả **cao hơn thực tế** (8.0 thay vì 4.8). Đây là dạng bug làm sai KPI mà không ai phát hiện trong nhiều tháng.

```sql
-- Nếu NULL nghĩa là "chưa có" → giữ nguyên AVG, đúng ngữ nghĩa
SELECT AVG(diem) FROM bai_thi;

-- Nếu NULL nghĩa là 0 → phải chuẩn hoá trước
SELECT AVG(COALESCE(diem, 0)) FROM bai_thi;
```

Câu trả lời phỏng vấn hoàn chỉnh: *"Tuỳ NULL mang nghĩa gì. 'Chưa thi' thì nên bỏ qua; 'thi nhưng 0 điểm' thì phải `COALESCE` về 0. Em sẽ hỏi lại business trước khi chọn."*

Các trường hợp liên quan cần nhớ:

| Biểu thức | Kết quả | Ghi chú |
|---|---|---|
| `SUM(cột)` khi mọi giá trị NULL | `NULL` | Không phải 0 — nhớ `COALESCE` |
| `COUNT(cột)` khi mọi giá trị NULL | `0` | `COUNT` là hàm duy nhất trả 0 |
| `AVG` với NULL | Bỏ NULL khỏi cả tử và mẫu | Nguồn sai số phổ biến |
| `MAX`/`MIN` với NULL | Bỏ qua NULL | An toàn |
| `SUM` trên tập rỗng | `NULL` | Query không dòng nào cũng trả 1 dòng NULL |

## Conditional aggregation: kỹ thuật dùng hằng ngày khi đi làm

Đây là kỹ thuật đáng giá nhất trong bài, và ứng viên biết nó luôn nổi bật: **xoay dữ liệu từ dọc sang ngang (pivot) chỉ bằng `SUM` + `CASE`**.

Bài toán: một dòng mỗi khách, mỗi trạng thái đơn một cột.

```sql
SELECT c.full_name,
       COUNT(o.order_id)                                          AS tong_don,
       COUNT(*) FILTER (WHERE o.status = 'paid')                  AS don_da_tt,
       COUNT(*) FILTER (WHERE o.status = 'cancelled')             AS don_huy,
       SUM(o.total_amount) FILTER (WHERE o.status <> 'cancelled') AS doanh_thu_thuc
FROM customers AS c
LEFT JOIN orders AS o ON o.customer_id = c.customer_id
GROUP BY c.customer_id, c.full_name
ORDER BY c.customer_id;
```

```text
 full_name | tong_don | don_da_tt | don_huy | doanh_thu_thuc
-----------+----------+-----------+---------+----------------
 Khach A   |        2 |         2 |       0 |        7250000
 Khach B   |        2 |         0 |       1 |        2100000
 Khach C   |        1 |         0 |       0 |         650000
 Khach D   |        0 |         0 |       0 |         [NULL]
 Khach E   |        0 |         0 |       0 |         [NULL]
```

`FILTER (WHERE ...)` là cú pháp chuẩn SQL, có trên PostgreSQL và SQLite. Trên **MySQL / SQL Server / Oracle**, dùng dạng `CASE` tương đương:

```sql
SELECT c.full_name,
       SUM(CASE WHEN o.status = 'paid'      THEN 1 ELSE 0 END)              AS don_da_tt,
       COUNT(CASE WHEN o.status = 'cancelled' THEN 1 END)                   AS don_huy,
       SUM(CASE WHEN o.status <> 'cancelled' THEN o.total_amount ELSE 0 END) AS doanh_thu_thuc
FROM customers AS c
LEFT JOIN orders AS o ON o.customer_id = c.customer_id
GROUP BY c.customer_id, c.full_name;
```

Hai biến thể đều dùng được: `SUM(CASE ... THEN 1 ELSE 0 END)` và `COUNT(CASE WHEN ... THEN 1 END)` (không có `ELSE` → nhánh còn lại là NULL → `COUNT` bỏ qua).

Ứng dụng thực tế của kỹ thuật này khi đi làm:

```sql
-- Bảng doanh thu theo tháng × danh mục (pivot cho dashboard)
SELECT date_trunc('month', o.ordered_at)::date AS thang,
       SUM(oi.quantity * oi.unit_price) FILTER (WHERE p.category = 'accessory') AS accessory,
       SUM(oi.quantity * oi.unit_price) FILTER (WHERE p.category = 'monitor')   AS monitor,
       SUM(oi.quantity * oi.unit_price) FILTER (WHERE p.category = 'audio')     AS audio
FROM orders o
JOIN order_items oi ON oi.order_id = o.order_id
JOIN products    p  ON p.product_id = oi.product_id
WHERE o.status <> 'cancelled'
GROUP BY 1
ORDER BY 1;

-- Tỉ lệ chuyển đổi theo tháng (funnel) — chỉ một lần quét bảng
SELECT date_trunc('month', ordered_at)::date AS thang,
       COUNT(*)                                        AS tong_don,
       COUNT(*) FILTER (WHERE status = 'paid')         AS don_thanh_cong,
       ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'paid') / COUNT(*), 1) AS ti_le_pct
FROM orders
GROUP BY 1;
```

Điểm ăn tiền khi trình bày: *"Cách này chỉ quét bảng **một lần**, thay vì chạy ba query rồi join lại."*

## GROUP BY và cột không nằm trong nhóm

```sql
-- Lỗi trên PostgreSQL và MySQL 8 (mặc định)
SELECT dept_id, full_name, COUNT(*)
FROM employees
GROUP BY dept_id;
```

```text
ERROR:  column "employees.full_name" must appear in the GROUP BY clause
        or be used in an aggregate function
```

Đúng như mô hình ở đầu bài: nhóm `dept_id = 1` gồm 4 người, `full_name` là tên ai?

**Khác biệt giữa các hệ**, một câu hỏi vặn hay gặp:

| Hệ | Hành vi |
|---|---|
| PostgreSQL | Lỗi, **trừ khi** đã `GROUP BY` khoá chính — lúc đó mọi cột cùng bảng được suy ra hợp lệ (functional dependency) |
| MySQL 8 | Mặc định bật `ONLY_FULL_GROUP_BY` → lỗi giống Postgres |
| MySQL 5.7 trở về trước | **Cho phép**, trả về giá trị tuỳ tiện của một dòng bất kỳ → nguồn bug kinh điển |
| SQLite | Cho phép, trả giá trị tuỳ tiện |

Nhờ functional dependency, câu sau **hợp lệ** trên PostgreSQL:

```sql
SELECT c.customer_id, c.full_name, c.email, COUNT(o.order_id)
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.customer_id
GROUP BY c.customer_id;              -- chỉ cần khoá chính, không cần liệt kê full_name, email
```

Nếu bạn từng "bị" MySQL 5.7 cho qua rồi lên 8 mới lỗi, đó chính là chuyện này. Kể được câu chuyện đó trong phỏng vấn cho thấy bạn đã đi làm thật.

## Nhóm nhiều mức: ROLLUP, CUBE, GROUPING SETS

Khi cần vừa chi tiết vừa tổng cộng trong **một** query:

```sql
SELECT COALESCE(p.category, '— TỔNG CỘNG —')  AS danh_muc,
       SUM(oi.quantity * oi.unit_price)        AS doanh_thu
FROM order_items oi
JOIN products p ON p.product_id = oi.product_id
GROUP BY ROLLUP (p.category)
ORDER BY p.category NULLS LAST;
```

```text
   danh_muc     | doanh_thu
----------------+-----------
 accessory      |   4600000
 audio          |   3200000
 monitor        |   5400000
 — TỔNG CỘNG —  |  13200000    ← dòng tổng do ROLLUP sinh ra
```

| Cú pháp | Sinh ra tổ hợp nào |
|---|---|
| `GROUP BY ROLLUP (a, b)` | `(a,b)`, `(a)`, `()` — tổng dần theo thứ bậc |
| `GROUP BY CUBE (a, b)` | `(a,b)`, `(a)`, `(b)`, `()` — mọi tổ hợp |
| `GROUP BY GROUPING SETS ((a),(b))` | Đúng những tổ hợp bạn liệt kê |

Dùng `GROUPING(col)` để phân biệt "dòng tổng" với "giá trị thật là NULL" — chi tiết nhỏ nhưng quan trọng khi cột gốc có NULL thật.

## Vài hàm aggregate hay dùng mà ít người nhớ

```sql
-- Gộp chuỗi: danh sách sản phẩm của từng đơn trên MỘT dòng
SELECT o.order_id,
       STRING_AGG(p.name, ', ' ORDER BY p.name) AS danh_sach_sp,   -- MySQL: GROUP_CONCAT
       ARRAY_AGG(p.product_id ORDER BY p.name)  AS mang_id
FROM orders o
JOIN order_items oi ON oi.order_id  = o.order_id
JOIN products    p  ON p.product_id = oi.product_id
GROUP BY o.order_id;

-- Trung vị và phân vị (ordered-set aggregate) — chống méo bởi giá trị ngoại lai
SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY salary) AS trung_vi,
       PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY salary) AS p90,
       AVG(salary)                                          AS trung_binh
FROM employees;

-- BOOL_OR / BOOL_AND: "có ít nhất một" / "tất cả đều"
SELECT o.customer_id,
       BOOL_OR(o.status = 'cancelled')  AS tung_huy_don,
       BOOL_AND(o.status = 'paid')      AS moi_don_deu_tt
FROM orders o
GROUP BY o.customer_id;
```

`PERCENTILE_CONT` là câu trả lời cho *"vì sao không dùng trung bình mà dùng trung vị?"* — trung bình bị một giá trị cực đoan kéo lệch, trung vị thì không. Rất hay gặp khi phân tích thời gian phản hồi API hoặc phân phối lương.

## Bẫy thường gặp với GROUP BY

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| `WHERE COUNT(*) > 5` | Lỗi cú pháp | Dùng `HAVING` |
| Đặt điều kiện dòng vào `HAVING` | Chạy được nhưng chậm hơn | Lọc sớm bằng `WHERE` |
| `COUNT(*)` sau `LEFT JOIN` | Nhóm rỗng bị đếm thành 1 | `COUNT(cột_bảng_phải)` |
| Quên nhóm `NULL` | Tổng các nhóm không bằng tổng chung | `GROUP BY COALESCE(col, 'khac')` hoặc xử lý riêng |
| `AVG` khi NULL nghĩa là 0 | Trung bình bị thổi cao | `AVG(COALESCE(col, 0))` |
| `SUM` trả NULL thay vì 0 | Ô trống trên báo cáo | `COALESCE(SUM(x), 0)` |
| `GROUP BY` sau khi join 1-N rồi `SUM` cột bảng "1" | Doanh thu bị nhân lên | Gom trước, join sau ([Bài 3](03-join-nang-cao-fanout-on-vs-where-va-thuat-toan-join.md)) |
| Dùng alias của `SELECT` trong `HAVING` | Lỗi trên Postgres (MySQL thì cho) | Lặp lại biểu thức, hoặc bọc CTE |
| `GROUP BY 1, 2` (theo số thứ tự) | Đổi thứ tự `SELECT` là sai âm thầm | Chấp nhận được cho query ad-hoc, tránh trong code production |

## Câu hỏi phỏng vấn hay gặp

**"`GROUP BY` và `DISTINCT` khác gì nhau?"**
Với mục đích khử trùng lặp thuần tuý, `SELECT DISTINCT a, b` và `SELECT a, b ... GROUP BY a, b` cho cùng kết quả và thường cùng plan (`HashAggregate`). Khác biệt là `GROUP BY` cho phép dùng hàm aggregate và `HAVING` — nó mạnh hơn hẳn. Về ý định code: dùng `DISTINCT` khi chỉ muốn khử trùng, dùng `GROUP BY` khi muốn tính toán theo nhóm.

**"`HAVING` không có `GROUP BY` thì sao?"**
Hợp lệ — toàn bộ bảng được coi là **một nhóm duy nhất**. `SELECT COUNT(*) FROM orders HAVING COUNT(*) > 100` trả về một dòng nếu bảng có trên 100 đơn, và **không dòng nào** nếu không đạt. Câu hỏi mẹo hay gặp.

**"`GROUP BY` được tối ưu thế nào?"**
Hai chiến lược: `HashAggregate` (dựng hash table theo khoá nhóm, cần RAM, không cần thứ tự) và `GroupAggregate` (yêu cầu dữ liệu đã sắp theo khoá nhóm, thường tận dụng index B-Tree, ít RAM). Nếu nhóm quá nhiều và tràn `work_mem`, hash agg phải đổ ra đĩa và chậm hẳn. Index trên cột `GROUP BY` có thể cho phép bỏ luôn bước sort.

**"Tìm giá trị xuất hiện nhiều hơn một lần (bản ghi trùng) viết sao?"**
```sql
SELECT email, COUNT(*)
FROM customers
GROUP BY email
HAVING COUNT(*) > 1;
```
Đây là khuôn mẫu dò trùng, sẽ đào sâu ở [phase-4 bài 2](../phase-4/02-case-du-lieu-trung-lap-dedup-va-upsert.md).

**"Muốn lấy cả tên nhân viên lương cao nhất mỗi phòng thì sao?"**
`GROUP BY` bó tay ở đây: `MAX(salary)` cho biết mức lương nhưng không cho biết **của ai**. Đây chính là cửa ngõ dẫn sang window function — bài kế tiếp.

## Tóm tắt bài 4

- `GROUP BY` ép mỗi nhóm về một dòng; sau đó chỉ `SELECT` được cột nhóm hoặc hàm aggregate.
- `WHERE` lọc **dòng trước khi gom**, `HAVING` lọc **nhóm sau khi gom**. Lọc được ở `WHERE` thì đừng đẩy xuống `HAVING`.
- `COUNT(*)` đếm dòng, `COUNT(cột)` bỏ qua NULL — khác biệt này quyết định báo cáo đúng hay sai sau `LEFT JOIN`.
- Mọi aggregate trừ `COUNT(*)` đều bỏ qua NULL; `AVG` vì thế hay bị thổi cao.
- `FILTER (WHERE ...)` / `SUM(CASE WHEN ...)` cho phép pivot trong một lần quét bảng — kỹ thuật dùng hằng ngày.
- Mọi `NULL` gom vào **một nhóm chung**; đừng quên nhóm này khi đối chiếu tổng.

**Bài kế tiếp** → [Bài 5: Window function từ A đến Z](05-window-function-tu-a-den-z.md)
