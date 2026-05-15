# Bài 2: Row-Based vs Column-Based Databases

## Hai cách tổ chức dữ liệu trên disk

Cùng một bảng dữ liệu, nhưng cách lưu trữ trên disk có thể hoàn toàn khác nhau. Sự lựa chọn này ảnh hưởng sâu sắc đến hiệu năng của các loại query khác nhau.

### Bảng ví dụ

```
EMPLOYEES table:
┌────────┬────┬──────────┬───────────┬────────┬────────────┬──────────┐
│ row_id │ id │ first_nm │ last_name │  SSN   │   salary   │   dob    │
├────────┼────┼──────────┼───────────┼────────┼────────────┼──────────┤
│  1001  │  1 │ John     │ Smith     │ 111    │ 100,000    │ 1990-... │
│  1002  │  2 │ Jane     │ Doe       │ 222    │ 120,000    │ 1985-... │
│  1003  │  3 │ Hussein  │ Nasser    │ 333    │  90,000    │ 1988-... │
│  1004  │  4 │ Alice    │ Jones     │ 444    │ 110,000    │ 1992-... │
└────────┴────┴──────────┴───────────┴────────┴────────────┴──────────┘
```

---

## Row-Based Storage (Lưu trữ theo hàng)

### Cách tổ chức trên disk

Tất cả columns của mỗi row được lưu liền kề nhau:

```
Disk layout (mỗi [ ] = 1 block/page):

[1001, 1, John, Smith, 111, 100K, 1990 | 1002, 2, Jane, Doe, 222, 120K, 1985]
[1003, 3, Hussein, Nasser, 333, 90K, 1988 | 1004, 4, Alice, Jones, 444, 110K, 1992]
```

### Query 1: Tìm theo SSN (không có index)

```sql
SELECT first_name FROM employees WHERE SSN = 666;
```

```
Đọc block 1: [row 1, 2] → SSN = 111, 222 → Không thấy 666
Đọc block 2: [row 3, 4] → SSN = 333, 444 → Không thấy 666  
Đọc block N: → Tìm thấy! SSN = 666

→ Phải đọc N blocks
→ Nhưng vì FIRST_NAME cũng nằm cùng row, lấy ngay → KHÔNG cần I/O thêm
   (Chi phí: N reads để tìm, 0 extra read để lấy first_name)
```

### Query 2: SELECT *

```sql
SELECT * FROM employees WHERE id = 1;
```

```
Đọc block 1: Tìm id=1 → Tìm thấy!
             Lấy toàn bộ row → Tất cả columns đã sẵn trong block này

→ Rất hiệu quả! (chỉ đọc 1 block, lấy được toàn bộ columns)
```

### Query 3: Aggregate trên 1 column

```sql
SELECT SUM(salary) FROM employees;
```

```
Đọc block 1: [row 1, 2] → Lấy salary từ row 1, 2 (nhưng kéo cả first_name, SSN, dob...)
Đọc block 2: [row 3, 4] → Lấy salary từ row 3, 4 (lại kéo thừa thông tin)
...Đọc tất cả N blocks...

→ Đọc TOÀN BỘ bảng dù chỉ cần column salary
→ KÉO THỪA rất nhiều data không cần thiết
```

---

## Column-Based Storage (Lưu trữ theo cột)

### Cách tổ chức trên disk

Tất cả values của mỗi column được lưu liền kề nhau:

```
Disk layout:

[IDs]:         [1, 2, 3, 4]
[first_name]:  [John, Jane, Hussein, Alice]
[last_name]:   [Smith, Doe, Nasser, Jones]
[SSN]:         [111, 222, 333, 444]
[salary]:      [100K, 120K, 90K, 110K]
[dob]:         [1990, 1985, 1988, 1992]

Mỗi column lưu kèm row_id để biết row nào:
[salary]: [row1001=100K, row1002=120K, row1003=90K, row1004=110K]
```

### Query 1: Tìm theo SSN

```sql
SELECT first_name FROM employees WHERE SSN = 666;
```

```
→ Chỉ đọc SSN column: [111, 222, 333, ..., 666] → Tìm thấy row_id=1006
→ Biết row_id=1006, nhảy đến FIRST_NAME column, page chứa row 1006
→ Đọc thêm 1 block nữa

→ Hiệu quả hơn row-based nếu SSN column nhỏ hơn full table
   nhưng cần thêm 1 I/O để lấy first_name
```

### Query 2: SELECT *

```sql
SELECT * FROM employees WHERE id = 1;
```

```
→ Tìm trong ID column → Tìm thấy row_id=1001
→ Cần lấy ALL columns: Nhảy đến first_name column → read
   Nhảy đến last_name column → read
   Nhảy đến SSN column → read
   Nhảy đến salary column → read
   Nhảy đến dob column → read

→ THẢM HỌA! Mỗi column = 1 I/O riêng = rất nhiều I/O
→ Column-based: SELECT * là kẻ thù số một
```

### Query 3: Aggregate trên 1 column

```sql
SELECT SUM(salary) FROM employees;
```

```
→ Chỉ cần đọc SALARY column thôi!
→ Đọc [100K, 120K, 90K, 110K, ...] → SUM ngay

→ TUYỆT VỜI! Không cần kéo bất kỳ column nào khác
→ Nếu bảng 1 triệu rows: chỉ đọc salary data, tiết kiệm 80%+ I/O
```

---

## Tính năng đặc biệt: Compression trong Column Store

Column store có lợi thế lớn về **compression**:

```
Row store - khó compress:
  Row 1: [1, "John", "Smith", 111, 100000, "1990-01-01", "Engineer"]
  Row 2: [2, "Jane", "Doe",   222, 100000, "1985-05-15", "Manager"]
  → Các giá trị liền kề nhau rất khác nhau → compression kém

Column store - compress rất tốt:
  Salary: [100000, 100000, 90000, 100000, 110000, 100000, ...]
          → Nhiều giá trị giống nhau liên tiếp
  Title:  ["Engineer", "Engineer", "Engineer", "Manager", "Engineer", ...]
          → Run-Length Encoding: ("Engineer", 3), ("Manager", 1), ("Engineer", 1)
  
→ Column store có thể giảm storage 5-10x với compression tốt
```

---

## So sánh tổng quan

| Tiêu chí | Row Store | Column Store |
|---|---|---|
| **OLTP (Insert/Update/Delete)** | ✅ Rất tốt | ❌ Chậm (cập nhật nhiều column structures) |
| **SELECT * hoặc nhiều columns** | ✅ Tốt | ❌ Rất chậm |
| **Aggregate trên ít columns** | ❌ Phải đọc toàn bộ row | ✅ Xuất sắc |
| **Analytics/Reporting** | ❌ Chậm | ✅ Rất nhanh |
| **Compression** | Trung bình | ✅ Xuất sắc |
| **Transactions** | ✅ Đơn giản | ❌ Phức tạp |
| **Joins phức tạp** | ✅ Tốt | ❌ Kém |

---

## Use Cases thực tế

### Row Store phù hợp (OLTP):
- E-commerce: Xử lý đơn hàng, cập nhật inventory
- Banking: Giao dịch, chuyển tiền
- Social media: Insert posts, update profiles
- Mọi ứng dụng cần nhiều INSERT/UPDATE/DELETE

**Databases:** PostgreSQL, MySQL, Oracle, SQL Server (mặc định)

### Column Store phù hợp (OLAP):
- Data Warehouse: Phân tích doanh thu theo region, thời gian
- BI/Reporting: Aggregate hàng tỷ records
- Log analysis: Tổng hợp metrics
- Machine Learning: Feature engineering

**Databases:** ClickHouse, Apache Parquet, Amazon Redshift, Snowflake, Apache Cassandra (hybrid)

---

## Hybrid: Cả hai trong một database

Một số database hiện đại hỗ trợ **cả hai loại storage** cho các bảng khác nhau:

```sql
-- PostgreSQL (với extension hoặc Citus)
CREATE TABLE sales_facts (
    sale_id BIGINT,
    product_id INT,
    customer_id INT,
    amount DECIMAL(10,2),
    sale_date DATE
) USING columnar;  -- hoặc USING heap (mặc định row-based)

-- MySQL
CREATE TABLE sales_analytics (...)
ENGINE = COLUMNAR;  -- MySQL HeatWave
```

**Chiến lược:** 
- Bảng transactional → Row store
- Bảng analytics/reporting → Column store
- Không nên JOIN giữa hai loại (sẽ cực kỳ chậm)

---

**Tiếp theo:** 03-primary-key-vs-secondary-key.md →
