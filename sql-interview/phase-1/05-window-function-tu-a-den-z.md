# Bài 5: Window function từ A đến Z

Đây là trùm cuối — ranh giới giữa ứng viên trung bình và ứng viên được nhận. Bài toán kinh điển nhất mọi thời đại: **tìm nhân viên có lương cao thứ hai trong từng phòng ban**. `GROUP BY` bó tay hoàn toàn với bài này, SQL thường thì rối rắm, còn window function giải quyết trong một nốt nhạc.

Nhưng người phỏng vấn hiếm khi dừng ở câu lệnh. Câu hỏi thật sự nằm ở phần sau: *"`RANK`, `DENSE_RANK`, `ROW_NUMBER` khác nhau thế nào?"* và *"vì sao không lọc được `WHERE rank = 2` trực tiếp?"*. Bài này giải quyết cả ba tầng.

## Vì sao GROUP BY bó tay

Thử tìm lương cao nhất mỗi phòng bằng `GROUP BY`:

```sql
SELECT dept_id, MAX(salary) FROM employees GROUP BY dept_id;
```

Ra được **mức lương**, nhưng không biết **của ai** — vì `GROUP BY` đã nghiền 4 dòng của phòng Engineering thành 1 dòng, tên nhân viên biến mất cùng lúc. Muốn có tên, phải join ngược lại bảng gốc, và query bắt đầu rối. Còn "cao thứ hai" thì `GROUP BY` không có công cụ nào để diễn đạt.

Đây chính là khoảng trống mà window function lấp:

```text
GROUP BY                          WINDOW FUNCTION
────────────────                  ─────────────────────────────
4 dòng ──▶ 1 dòng                 4 dòng ──▶ 4 dòng
(dữ liệu bị NGHIỀN)               (dữ liệu GIỮ NGUYÊN, thêm cột tính toán)

emp1 60tr ┐                        emp1 60tr | max_phong = 60tr | hang = 1
emp2 45tr ├──▶ MAX = 60tr          emp2 45tr | max_phong = 60tr | hang = 2
emp3 45tr │                        emp3 45tr | max_phong = 60tr | hang = 2
emp4 38tr ┘                        emp4 38tr | max_phong = 60tr | hang = 3
```

**Điểm ăn tiền khi trả lời phỏng vấn**: *"Window function tính toán trên một nhóm dòng nhưng **không gộp** chúng lại. Mỗi dòng gốc vẫn còn nguyên, chỉ được gắn thêm thông tin về nhóm mà nó thuộc về."*

## Giải phẫu mệnh đề OVER

```text
    DENSE_RANK() OVER (PARTITION BY dept_id ORDER BY salary DESC)
    └────┬─────┘       └───────┬────────┘  └────────┬──────────┘
         │                     │                    │
   hàm cửa sổ            chia thành phòng      xếp thứ tự trong phòng
   (tính gì)             (chia nhóm thế nào)   (theo tiêu chí nào)


    SUM(amount) OVER (PARTITION BY cust ORDER BY ngay
                      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
                                    └──────────────┬──────────────────┘
                                        khung (frame): lấy bao nhiêu dòng
                                        quanh dòng hiện tại để tính
```

Trước khi đi tiếp, gỡ ba từ dễ gây rối:

**"Window" (cửa sổ) là gì?** Là **tập dòng mà hàm được phép nhìn thấy** khi tính cho dòng hiện tại. Hình dung bạn cầm một khung cửa sổ đặt lên bảng dữ liệu: chỉ những dòng lọt trong khung mới được tính. Khung đó trượt dọc theo bảng, mỗi dòng một lần.

```text
Đang tính cho dòng này ──┐
                         ▼
  dòng 1  ┐
  dòng 2  ├── cửa sổ cho dòng 3 (những dòng hàm được nhìn)
  dòng 3  ┘
  dòng 4      ← không nằm trong cửa sổ, không được tính
  dòng 5
```

**`PARTITION BY` là gì?** Là cách **chia bảng thành các nhóm độc lập**, mỗi nhóm tính riêng, không ảnh hưởng lẫn nhau. Chia theo `dept_id` nghĩa là thứ hạng của người phòng Sales không liên quan gì tới người phòng Engineering.

> **Cảnh báo trùng tên rất hay gây nhầm**: `PARTITION BY` ở đây **hoàn toàn không liên quan** tới *table partitioning* (chia nhỏ bảng thành nhiều bảng con trên đĩa, xem [phase-3 bài 4](../phase-3/04-phan-trang-va-xu-ly-bang-lon.md)). Hai khái niệm khác nhau hẳn nhưng dùng chung một từ. `PARTITION BY` chỉ là cách nhóm dữ liệu **trong lúc tính toán**, không đụng gì tới cách lưu trữ.

**`PARTITION BY` khác `GROUP BY` chỗ nào?** Cả hai đều "chia nhóm", nhưng làm hai việc khác nhau với nhóm đó:

```text
GROUP BY dept_id          →  4 dòng của phòng Engineering  NGHIỀN thành 1 dòng
PARTITION BY dept_id      →  4 dòng vẫn là 4 dòng, mỗi dòng được GẮN THÊM thông tin
```

Bốn mảnh ghép, một công thức:

| Thành phần | Vai trò | Bỏ được không |
|---|---|---|
| Hàm cửa sổ | Tính gì: `RANK`, `SUM`, `LAG`... | Không |
| `PARTITION BY` | Chia dữ liệu thành các "căn phòng" độc lập | Được — bỏ thì cả bảng là một phòng |
| `ORDER BY` | Thứ tự trong mỗi phòng | Tuỳ hàm — hàm xếp hạng thì bắt buộc |
| Frame (`ROWS`/`RANGE`) | Lấy bao nhiêu dòng quanh dòng hiện tại | Được — có mặc định, và **mặc định hay gây bẫy** |

Hình dung `PARTITION BY` như chia dữ liệu thành từng căn phòng riêng, mỗi phòng ban một phòng. `ORDER BY` xếp mọi người trong phòng theo lương từ cao xuống thấp. Hàm cửa sổ gán số thứ hạng lên đầu từng người. Người ở phòng này không ảnh hưởng gì tới thứ hạng của người phòng khác.

## Ba hàm xếp hạng: câu hỏi vặn kinh điển

Chạy cả ba cùng lúc trên dữ liệu mẫu để thấy khác biệt:

```sql
SELECT d.dept_name,
       e.full_name,
       e.salary,
       ROW_NUMBER() OVER (PARTITION BY e.dept_id ORDER BY e.salary DESC) AS row_num,
       RANK()       OVER (PARTITION BY e.dept_id ORDER BY e.salary DESC) AS rank,
       DENSE_RANK() OVER (PARTITION BY e.dept_id ORDER BY e.salary DESC) AS dense_rank
FROM employees   AS e
JOIN departments AS d ON d.dept_id = e.dept_id
ORDER BY d.dept_name, e.salary DESC;
```

```text
  dept_name  | full_name  |  salary  | row_num | rank | dense_rank
-------------+------------+----------+---------+------+------------
 Engineering | Nguyen An  | 60000000 |       1 |    1 |          1
 Engineering | Tran Binh  | 45000000 |       2 |    2 |          2   ┐ lương
 Engineering | Le Cuong   | 45000000 |       3 |    2 |          2   ┘ BẰNG NHAU
 Engineering | Pham Dung  | 38000000 |       4 |    4 |          3
                                              ▲      ▲          ▲
                                       đánh số  nhảy cóc  đi đều
                                       tuần tự  (bỏ hạng 3)
 Sales       | Hoang Em   | 52000000 |       1 |    1 |          1
 Sales       | Vo Phuong  | 41000000 |       2 |    2 |          2
 Marketing   | Dang Giang | 35000000 |       1 |    1 |          1
```

Tưởng tượng hai người lương bằng nhau, cùng đứng ở vị trí thứ hai:

```text
Lương:  60tr    45tr    45tr    38tr
        ────    ────    ────    ────
ROW_NUMBER:  1      2       3       4    ← mặc kệ hoà, cứ đánh số tuần tự
RANK:        1      2       2       4    ← hoà cùng hạng, rồi NHẢY CÓC (không có hạng 3)
DENSE_RANK:  1      2       2       3    ← hoà cùng hạng, ĐI ĐỀU (không bỏ hạng nào)
```

| Hàm | Hoà thì sao | Có bỏ số không | Dùng khi nào |
|---|---|---|---|
| `ROW_NUMBER()` | Đánh số khác nhau (thứ tự **tuỳ ý** giữa các dòng hoà) | Không | Phân trang, khử trùng lặp, chọn đúng 1 dòng/nhóm |
| `RANK()` | Cùng hạng | **Có** — sau hai hạng 2 là hạng 4 | Xếp hạng thi đấu ("đồng hạng nhì, không có hạng ba") |
| `DENSE_RANK()` | Cùng hạng | Không | "Mức lương cao thứ N", "top N giá trị phân biệt" |

**Cảnh báo về `ROW_NUMBER` khi hoà**: giữa Binh và Cuong (cùng 45tr), ai được số 2 là **không xác định** — có thể đổi giữa hai lần chạy. Nếu cần kết quả ổn định, phải thêm tiêu chí phá hoà: `ORDER BY salary DESC, emp_id ASC`. Chi tiết nhỏ này là dấu hiệu ứng viên đã từng debug báo cáo "chạy lại ra khác".

## Bài toán trùm cuối: lương cao thứ hai mỗi phòng

```sql
WITH xep_hang AS (
    SELECT e.emp_id,
           e.full_name,
           e.salary,
           d.dept_name,
           DENSE_RANK() OVER (PARTITION BY e.dept_id ORDER BY e.salary DESC) AS hang
    FROM employees   AS e
    JOIN departments AS d ON d.dept_id = e.dept_id
)
SELECT dept_name, full_name, salary
FROM xep_hang
WHERE hang = 2;
```

```text
  dept_name  | full_name |  salary
-------------+-----------+----------
 Engineering | Tran Binh | 45000000
 Engineering | Le Cuong  | 45000000     ← cả hai, vì cùng mức lương cao thứ nhì
 Sales       | Vo Phuong | 41000000
```

Marketing không xuất hiện vì chỉ có một người — không tồn tại "cao thứ hai". Đây là hành vi đúng, và người phỏng vấn hay hỏi vặn *"phòng chỉ có 1 người thì sao?"* để xem bạn có nghĩ tới edge case không.

Muốn lương cao thứ ba, đổi số 2 thành 3. Muốn top 5, đổi thành `WHERE hang <= 5`. **Một công thức giải cả họ bài toán top N.**

### Chọn hàm nào cho "cao thứ hai"?

Đây là câu hỏi vặn tiếp theo, và câu trả lời phụ thuộc vào định nghĩa nghiệp vụ:

| Nếu đề nói | Dùng | Kết quả ở Engineering |
|---|---|---|
| "**mức lương** cao thứ hai" (giá trị phân biệt) | `DENSE_RANK` | Binh **và** Cuong (45tr) |
| "người xếp thứ hai theo thứ tự thi đấu" | `RANK` | Binh và Cuong (cùng hạng 2) |
| "đúng **một** người ở vị trí thứ hai" | `ROW_NUMBER` + tiêu chí phá hoà | Binh (theo `emp_id`) |

Trả lời hay nhất là hỏi ngược lại: *"Nếu hai người cùng mức lương thì anh muốn hiện cả hai hay chỉ một?"* — rồi chọn hàm tương ứng. Đó là cách một người đã đi làm trả lời.

### Vì sao phải bọc CTE, không lọc thẳng ở WHERE?

```sql
-- SAI — lỗi ngay
SELECT full_name, DENSE_RANK() OVER (PARTITION BY dept_id ORDER BY salary DESC) AS hang
FROM employees
WHERE hang = 2;
```

```text
ERROR:  window functions are not allowed in WHERE
```

Quay lại thứ tự xử lý logic ở [Bài 1](01-vi-sao-8-tren-10-ung-vien-truot-vong-sql.md):

```text
FROM → WHERE → GROUP BY → HAVING → SELECT ⟵ window function tính Ở ĐÂY → ORDER BY
         ▲                                    │
         └────── quá sớm, hang chưa tồn tại ──┘
```

Window function được tính ở bước `SELECT`, tức là **sau** `WHERE` và **sau** `GROUP BY`. Nên muốn lọc theo kết quả của nó, bắt buộc phải đẩy nó xuống một tầng con: CTE (`WITH`) hoặc subquery. `ORDER BY` thì dùng trực tiếp được vì chạy sau `SELECT`.

Hệ quả thực dụng nữa: window function **luôn nhìn thấy dữ liệu đã qua `WHERE`**. Nếu bạn thêm `WHERE dept_id = 1`, thứ hạng được tính lại chỉ trong phạm vi đó — đây là nguồn nhầm lẫn phổ biến khi thêm bộ lọc vào báo cáo đã có sẵn.

## Frame: phần ít người biết nhưng gây bug nhiều nhất

Frame quyết định **dòng nào được đưa vào phép tính** cho mỗi dòng hiện tại.

```text
PARTITION (đã sắp theo ORDER BY)
 dòng 1  ┐
 dòng 2  │  UNBOUNDED PRECEDING  ─┐
 dòng 3  │                        ├─ frame mặc định khi CÓ ORDER BY:
 dòng 4  ◀── CURRENT ROW ─────────┘   RANGE BETWEEN UNBOUNDED PRECEDING
 dòng 5  │                                  AND CURRENT ROW
 dòng 6  ┘  UNBOUNDED FOLLOWING
```

**Quy tắc mặc định** cần thuộc lòng:

| Trường hợp | Frame mặc định | Ý nghĩa |
|---|---|---|
| `OVER (PARTITION BY x)` — không `ORDER BY` | Toàn bộ partition | `SUM` ra tổng của cả nhóm |
| `OVER (PARTITION BY x ORDER BY y)` | `RANGE UNBOUNDED PRECEDING → CURRENT ROW` | `SUM` ra **tổng luỹ kế** |

Đây là lý do cùng một `SUM(...) OVER (...)` cho hai kết quả hoàn toàn khác nhau chỉ vì có hay không `ORDER BY`:

```sql
SELECT o.order_id,
       o.total_amount,
       SUM(o.total_amount) OVER (PARTITION BY o.customer_id)                      AS tong_ca_khach,
       SUM(o.total_amount) OVER (PARTITION BY o.customer_id ORDER BY o.ordered_at) AS luy_ke
FROM orders o
ORDER BY o.customer_id, o.ordered_at;
```

```text
 order_id | total_amount | tong_ca_khach | luy_ke
----------+--------------+---------------+---------
        1 |      1850000 |       7250000 | 1850000     ← luỹ kế đến đơn 1
        2 |      5400000 |       7250000 | 7250000     ← luỹ kế đến đơn 2
        3 |      3200000 |       5300000 | 3200000
        4 |      2100000 |       5300000 | 5300000
```

Cột `tong_ca_khach` cho phép tính **tỉ trọng** mà không cần join lại:

```sql
SELECT o.order_id,
       ROUND(100.0 * o.total_amount
             / SUM(o.total_amount) OVER (PARTITION BY o.customer_id), 1) AS pct_cua_khach
FROM orders o;
```

### ROWS và RANGE — bẫy khi có giá trị trùng

```text
ROWS  — đếm theo SỐ DÒNG vật lý:  "3 dòng ngay trước tôi"
RANGE — đếm theo GIÁ TRỊ:         "mọi dòng có ORDER BY value bằng tôi cũng được tính chung"
```

Với `RANGE` (mặc định), các dòng có cùng giá trị `ORDER BY` — gọi là *peer* — được xử lý như **một cụm**. Nếu hai đơn cùng ngày, luỹ kế của cả hai sẽ **bằng nhau** và đã bao gồm cả hai:

```text
ngay        amount   RANGE (mặc định)   ROWS
2024-01-01   100         100             100
2024-01-02   200         500  ◀─┐        300   ← RANGE gộp cả hai dòng
2024-01-02   200         500  ◀─┘        500      cùng ngày 01-02
2024-01-03   300         800             800
```

Muốn luỹ kế "từng dòng một" đúng nghĩa, phải viết frame tường minh:

```sql
SUM(amount) OVER (ORDER BY ngay ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
```

Đây là bug rất khó phát hiện vì với dữ liệu không trùng thì hai cách cho kết quả giống hệt nhau — nó chỉ nổ khi dữ liệu thật có ngày trùng.

### Bẫy LAST_VALUE

```sql
-- SAI: luôn trả về chính dòng hiện tại
SELECT full_name, salary,
       LAST_VALUE(salary) OVER (PARTITION BY dept_id ORDER BY salary DESC) AS luong_thap_nhat
FROM employees;
```

Vì frame mặc định kết thúc ở `CURRENT ROW`, `LAST_VALUE` chỉ nhìn thấy tới chính nó. Phải mở rộng frame:

```sql
LAST_VALUE(salary) OVER (PARTITION BY dept_id ORDER BY salary DESC
                         ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)
```

`FIRST_VALUE` thì không dính bẫy này (frame mặc định luôn bắt đầu từ đầu partition). Biết được sự bất đối xứng đó là chi tiết ăn điểm.

## LAG và LEAD: so sánh với dòng trước / dòng sau

Đây là cặp hàm được dùng nhiều nhất trong công việc thật — mọi báo cáo tăng trưởng đều cần nó.

```sql
WITH doanh_thu_thang AS (
    SELECT date_trunc('month', ordered_at)::date AS thang,
           SUM(total_amount)                     AS doanh_thu
    FROM orders
    WHERE status <> 'cancelled'
    GROUP BY 1
)
SELECT thang,
       doanh_thu,
       LAG(doanh_thu) OVER (ORDER BY thang)                       AS thang_truoc,
       doanh_thu - LAG(doanh_thu) OVER (ORDER BY thang)           AS chenh_lech,
       ROUND(100.0 * (doanh_thu - LAG(doanh_thu) OVER (ORDER BY thang))
             / NULLIF(LAG(doanh_thu) OVER (ORDER BY thang), 0), 1) AS tang_truong_pct
FROM doanh_thu_thang
ORDER BY thang;
```

```text
   thang    | doanh_thu | thang_truoc | chenh_lech | tang_truong_pct
------------+-----------+-------------+------------+-----------------
 2024-04-01 |   1850000 |      [NULL] |     [NULL] |          [NULL]
 2024-05-01 |   5400000 |     1850000 |    3550000 |           191.9
 2024-06-01 |   2750000 |     5400000 |   -2650000 |           -49.1
```

Ba chi tiết ăn điểm ở query này:

1. **`NULLIF(..., 0)`** chống lỗi chia cho 0 khi tháng trước bằng 0 — người phỏng vấn hay hỏi *"nếu tháng trước doanh thu 0 thì sao?"*.
2. **Dòng đầu là NULL** là đúng, không phải bug. Muốn hiện 0 thì `LAG(doanh_thu, 1, 0)` — tham số thứ ba là giá trị mặc định.
3. `LAG(x, 12)` cho so sánh **cùng kỳ năm trước** (year-over-year) — biến thể hay được hỏi tiếp.

`LEAD` là chiều ngược lại, hay dùng để tính khoảng cách giữa hai sự kiện:

```sql
-- Khoảng cách giữa hai lần mua liên tiếp của mỗi khách
SELECT customer_id,
       ordered_at,
       LEAD(ordered_at) OVER (PARTITION BY customer_id ORDER BY ordered_at) AS lan_mua_ke,
       LEAD(ordered_at) OVER (PARTITION BY customer_id ORDER BY ordered_at)
           - ordered_at                                                     AS khoang_cach
FROM orders;
```

Bài toán này (*"thời gian trung bình giữa hai lần mua"*) là câu hỏi thực chiến rất hay gặp ở vị trí data analyst.

## Bảng tra nhanh các hàm cửa sổ

| Nhóm | Hàm | Công dụng |
|---|---|---|
| Xếp hạng | `ROW_NUMBER`, `RANK`, `DENSE_RANK` | Top N, khử trùng, xếp hạng |
| Phân phối | `NTILE(n)`, `PERCENT_RANK`, `CUME_DIST` | Chia tứ phân vị, phân khúc khách hàng |
| Điều hướng | `LAG`, `LEAD` | So với kỳ trước, khoảng cách sự kiện |
| Biên | `FIRST_VALUE`, `LAST_VALUE`, `NTH_VALUE` | Giá trị đầu/cuối của nhóm |
| Aggregate | `SUM`, `AVG`, `COUNT`, `MAX`, `MIN` + `OVER` | Luỹ kế, trung bình trượt, tỉ trọng |

Hai ứng dụng hay được hỏi thêm:

```sql
-- Phân khúc khách theo chi tiêu: chia thành 4 nhóm đều nhau
SELECT customer_id,
       SUM(total_amount) AS chi_tieu,
       NTILE(4) OVER (ORDER BY SUM(total_amount) DESC) AS nhom_tu_phan_vi
FROM orders
WHERE status <> 'cancelled'
GROUP BY customer_id;

-- Trung bình trượt 7 ngày (làm mượt biểu đồ) — frame ROWS tường minh
SELECT ngay,
       doanh_thu,
       AVG(doanh_thu) OVER (ORDER BY ngay ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS ma7
FROM doanh_thu_ngay;
```

Lưu ý ở query đầu: window function chạy **sau** `GROUP BY`, nên `SUM(total_amount)` bên trong `OVER (ORDER BY ...)` là hợp lệ. Kết hợp aggregate với window trong cùng một `SELECT` là kỹ thuật hay bị nghĩ là không làm được.

## Performance: cái giá của window function

```text
Mỗi mệnh đề OVER khác nhau  →  database cần một lần SORT riêng

SELECT RANK() OVER (PARTITION BY dept_id ORDER BY salary),
       RANK() OVER (PARTITION BY dept_id ORDER BY hired_at)   ← lần sort THỨ HAI
FROM employees;
```

Ba điều nên nói khi được hỏi về performance:

1. **Gộp các `OVER` giống nhau.** Nhiều hàm dùng chung một mệnh đề `OVER` chỉ tốn một lần sort. Đặt tên cửa sổ cho gọn và chắc chắn gộp được:
   ```sql
   SELECT RANK() OVER w, DENSE_RANK() OVER w, LAG(salary) OVER w
   FROM employees
   WINDOW w AS (PARTITION BY dept_id ORDER BY salary DESC);
   ```
2. **Index có thể loại bỏ bước sort.** Index trên `(dept_id, salary DESC)` khớp đúng với `PARTITION BY dept_id ORDER BY salary DESC`, cho phép Postgres đọc theo thứ tự sẵn có.
3. **Lọc trước khi xếp hạng.** Window chạy trên toàn bộ dữ liệu đã qua `WHERE`; thu hẹp bằng `WHERE` sớm luôn rẻ hơn xếp hạng cả bảng rồi mới lọc ở tầng ngoài.

Khi phải sort tập lớn hơn `work_mem`, Postgres đổ ra đĩa (`external merge Disk: ...` trong `EXPLAIN ANALYZE`) và chậm hẳn — đó là dấu hiệu cần tăng `work_mem` hoặc thu hẹp dữ liệu.

## Bẫy thường gặp với window function

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| `WHERE rank = 2` trực tiếp | Lỗi cú pháp | Bọc CTE/subquery rồi lọc ở tầng ngoài |
| Dùng `ROW_NUMBER` cho "lương cao thứ N" | Bỏ sót người cùng mức lương | `DENSE_RANK` |
| `ROW_NUMBER` không có tiêu chí phá hoà | Kết quả đổi giữa các lần chạy | Thêm cột phụ vào `ORDER BY` |
| `LAST_VALUE` với frame mặc định | Luôn trả về dòng hiện tại | Mở frame tới `UNBOUNDED FOLLOWING` |
| Luỹ kế bằng `RANGE` mặc định khi có ngày trùng | Các dòng trùng ra cùng một số | Ghi rõ `ROWS BETWEEN ...` |
| Quên `PARTITION BY` | Xếp hạng trên toàn bảng thay vì trong nhóm | Kiểm tra lại "phòng" là gì |
| Chia cho `LAG` mà không `NULLIF` | Lỗi division by zero | `NULLIF(mau, 0)` |
| Nhiều `OVER` khác nhau không cần thiết | Nhiều lần sort, query chậm | Gộp bằng mệnh đề `WINDOW` |
| Nghĩ window function lọc bớt dòng | Số dòng kết quả không đổi | Nó **thêm cột**, không bớt dòng |

## Câu hỏi phỏng vấn hay gặp

**"Window function và GROUP BY, khi nào dùng cái nào?"**
Cần **một dòng cho mỗi nhóm** → `GROUP BY`. Cần **giữ nguyên mọi dòng** nhưng gắn thêm thông tin của nhóm (thứ hạng, luỹ kế, tỉ trọng, so với kỳ trước) → window function. Nếu cần cả hai, dùng `GROUP BY` trước rồi window function trên kết quả đó.

**"Tìm top 3 sản phẩm bán chạy nhất mỗi danh mục?"**
```sql
WITH ban_chay AS (
    SELECT p.category, p.name,
           SUM(oi.quantity) AS so_luong,
           DENSE_RANK() OVER (PARTITION BY p.category ORDER BY SUM(oi.quantity) DESC) AS hang
    FROM order_items oi
    JOIN products p ON p.product_id = oi.product_id
    GROUP BY p.category, p.name
)
SELECT * FROM ban_chay WHERE hang <= 3;
```
Đây là khuôn **top N per group** — dạng bài phổ biến nhất trong phỏng vấn thực tế.

**"Có cách nào tìm lương cao thứ hai mà không dùng window function không?"**
Có, và người phỏng vấn hỏi để xem bạn linh hoạt tới đâu:
```sql
-- Cách 1: subquery tương quan
SELECT DISTINCT salary FROM employees e1
WHERE 1 = (SELECT COUNT(DISTINCT salary) FROM employees e2 WHERE e2.salary > e1.salary);

-- Cách 2: LIMIT/OFFSET trên tập giá trị phân biệt (chỉ hợp cho toàn bảng, không theo nhóm)
SELECT DISTINCT salary FROM employees ORDER BY salary DESC LIMIT 1 OFFSET 1;
```
Nhưng nên nói thêm: cả hai đều **không mở rộng được sang "mỗi phòng ban"** một cách gọn gàng, và cách 1 có độ phức tạp bậc hai. Đó chính là lý do window function tồn tại.

**"Query nào chạy nhanh hơn: `DENSE_RANK` hay tự join?"**
Window function thường thắng vì chỉ cần một lần quét + một lần sort, trong khi self join tương quan phải quét lặp. Nhưng luôn chốt bằng: *"em sẽ `EXPLAIN ANALYZE` cả hai trên dữ liệu thật để chắc chắn."*

## Tóm tắt bài 5

- Window function tính trên nhóm nhưng **không gộp dòng** — đó là điểm khác biệt cốt lõi với `GROUP BY`.
- Công thức bốn mảnh: `hàm() OVER (PARTITION BY ... ORDER BY ... frame)`.
- `ROW_NUMBER` đánh số tuần tự, `RANK` nhảy cóc khi hoà, `DENSE_RANK` đi đều — chọn theo định nghĩa nghiệp vụ.
- Không lọc được window function trong `WHERE`; phải bọc CTE hoặc subquery.
- Frame mặc định là `RANGE ... CURRENT ROW` — nguồn của bẫy `LAST_VALUE` và bẫy luỹ kế khi có giá trị trùng.
- `LAG`/`LEAD` là công cụ chính cho mọi báo cáo tăng trưởng; nhớ `NULLIF` khi chia.

**Bài kế tiếp** → [Phase 2 - Bài 1: Subquery toàn tập](../phase-2/01-subquery-toan-tap.md)
