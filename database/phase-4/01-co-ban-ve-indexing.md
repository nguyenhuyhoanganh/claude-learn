# Bài 1: Cơ bản về Database Indexing

## Index là gì?

**Index** là một cấu trúc dữ liệu riêng biệt được xây dựng trên một hoặc nhiều cột của bảng, giúp database **tìm kiếm dữ liệu nhanh hơn** mà không cần quét toàn bộ bảng.

**Ví dụ trực quan:** Giống như mục lục ở cuối sách — thay vì đọc từng trang để tìm chủ đề, bạn tra mục lục và biết ngay trang nào.

---

## Tại sao cần Index?

### Không có Index: Full Table Scan

```sql
-- Bảng employees với 11 triệu rows
SELECT * FROM employees WHERE name = 'John Smith';

-- Không có index → Database phải:
-- Đọc page 0 → kiểm tra tất cả rows → không thấy
-- Đọc page 1 → kiểm tra tất cả rows → không thấy
-- ...
-- Đọc page 275,000 → Tìm thấy!
-- Thời gian: ~3 giây cho 11M rows
```

```
QUERY PLAN:
Parallel Seq Scan on employees
  (cost=0.00..289147.00 rows=11000000 width=31)
  Filter: (name = 'John Smith')
  Workers Planned: 2
  
Execution time: 3.2 seconds
```

### Có Index: B-Tree Scan

```sql
-- Sau khi tạo index
CREATE INDEX idx_employees_name ON employees(name);

SELECT * FROM employees WHERE name = 'John Smith';

-- Với index → Database:
-- Duyệt B-Tree (log(N) steps)
-- Tìm thấy entry → có pointer đến heap location
-- Đọc đúng page cần thiết
-- Thời gian: ~47 milliseconds (68x nhanh hơn!)
```

---

## Tạo bảng và index thực hành

### Tạo bảng với 1 triệu rows trong PostgreSQL

```sql
-- Kết nối PostgreSQL via Docker
docker run --name pg-test -e POSTGRES_PASSWORD=postgres -d postgres:13
docker exec -it pg-test psql -U postgres

-- Tạo bảng temperatures
CREATE TABLE temp (t INTEGER);

-- Insert 1 triệu rows (trick với generate_series)
INSERT INTO temp(t)
SELECT (random() * 100)::INTEGER
FROM generate_series(1, 1000000);

-- Xác nhận
SELECT COUNT(*) FROM temp;
-- → 1000000

-- Xem vài rows
SELECT t FROM temp LIMIT 10;
```

### Các loại Index phổ biến

```sql
-- Index cơ bản trên 1 column
CREATE INDEX idx_name ON employees(name);

-- Composite index (nhiều columns)
CREATE INDEX idx_name_dept ON employees(name, department);

-- Unique index
CREATE UNIQUE INDEX idx_email ON users(email);

-- Xóa index
DROP INDEX idx_name;
```

---

## EXPLAIN ANALYZE - Công cụ phân tích query

`EXPLAIN ANALYZE` là lệnh quan trọng nhất để hiểu database đang làm gì:

```sql
EXPLAIN ANALYZE SELECT id FROM employees WHERE id = 2000;
```

**Output và cách đọc:**

```
Index Scan using employees_pkey on employees
  (cost=0.57..8.59 rows=1 width=4) (actual time=0.082..0.092 rows=1 loops=1)
  Index Cond: (id = 2000)
  Heap Fetches: 1
Planning Time: 0.3 ms
Execution Time: 0.1 ms
```

| Thành phần | Ý nghĩa |
|---|---|
| `cost=0.57..8.59` | 0.57 = chi phí lấy row đầu tiên; 8.59 = tổng chi phí ước tính |
| `rows=1` | Ước tính số rows trả về |
| `width=4` | Số bytes của kết quả (4 bytes = INTEGER) |
| `actual time=0.082..0.092` | Thời gian thực tế (ms) |
| `Heap Fetches: 1` | Số lần phải đọc thêm từ heap |

### Các loại scan trong EXPLAIN output

| Loại | Ý nghĩa | Tốc độ |
|---|---|---|
| `Seq Scan` | Full table scan | Chậm nhất |
| `Index Scan` | Dùng index, nhưng phải đọc thêm heap | Nhanh |
| `Index Only Scan` | Chỉ đọc index, không cần heap | Nhanh nhất |
| `Bitmap Index Scan` | Xây bitmap từ index, sau đó đọc heap | Tốt cho range queries |

---

## Ba loại Scan chi tiết

### 1. Seq Scan (Sequential / Full Table Scan)

```sql
EXPLAIN ANALYZE SELECT * FROM employees;

-- Output:
-- Seq Scan on employees
-- (Đọc toàn bộ bảng, từng page một)
```

**Khi nào xảy ra:**
- Không có index phù hợp
- Query trả về quá nhiều rows (database quyết định full scan nhanh hơn)
- Bảng quá nhỏ (không đáng dùng index)

---

### 2. Index Scan

```sql
-- Có index trên name
EXPLAIN ANALYZE SELECT name FROM employees WHERE id = 5000;
-- → Index Scan using employees_pkey (dùng index PK)
-- → Heap Fetches: 1 (phải đọc heap để lấy "name")
```

**Luồng xử lý:**
```
Query → B-Tree index → Tìm id=5000 → Lấy ctid/row pointer
     → Đọc heap page → Lấy "name" column
```

**Khi nào xảy ra:**
- Có index phù hợp
- Kết quả trả về ít rows (< ~10% bảng)
- Cần lấy columns không có trong index

---

### 3. Index Only Scan

```sql
EXPLAIN ANALYZE SELECT id FROM employees WHERE id = 5000;
-- → Index Only Scan using employees_pkey
-- → Heap Fetches: 0 (không cần đọc heap!)
```

**Luồng xử lý:**
```
Query → B-Tree index → Tìm id=5000 → id nằm ngay trong index
     → Trả về kết quả ngay (KHÔNG đọc heap)
```

**Khi nào xảy ra:**
- Tất cả columns cần lấy đều có trong index
- Đây là loại query hiệu quả nhất!

---

### 4. Bitmap Index Scan (PostgreSQL)

```sql
EXPLAIN ANALYZE SELECT name FROM employees WHERE grade > 95;
-- → Bitmap Index Scan on idx_grade
-- → Bitmap Heap Scan on employees
--     Recheck Cond: (grade > 95)
```

**Cách hoạt động:**
```
Bước 1: Scan index, xây bitmap
        bit[page_0] = 0 (không có row grade>95)
        bit[page_7] = 1 (có row grade>95)
        bit[page_9] = 1 (có row grade>95)
        ...

Bước 2: Dùng bitmap, đọc các pages có bit=1 từ heap
        Page 7, Page 9, ... → Lấy rows

Bước 3: Recheck condition (lọc lại rows trong page)
```

**Ưu điểm:** Batch I/O — đọc nhiều pages trong 1 lần thay vì nhảy qua nhảy lại

---

## Khi nào Index KHÔNG giúp ích?

### 1. LIKE với wildcard ở đầu

```sql
-- Index KHÔNG được dùng!
SELECT * FROM employees WHERE name LIKE '%Smith%';
-- → Seq Scan (phải quét toàn bảng)

-- Index ĐƯỢC dùng:
SELECT * FROM employees WHERE name LIKE 'Smith%';
-- → Index Scan (vì có prefix cụ thể)
```

### 2. Query trả về quá nhiều rows

```sql
-- Bảng có 11M rows
SELECT * FROM employees WHERE id > 100;
-- → id > 100 trả về ~10.999.900 rows = gần toàn bảng
-- → Postgres quyết định dùng Seq Scan thay vì Index Scan!
-- (Vì index scan + heap jump cho 11M rows chậm hơn full scan)
```

### 3. Query trên expression (không phải literal value)

```sql
-- Index trên "name" KHÔNG được dùng với expression!
SELECT * FROM employees WHERE UPPER(name) = 'JOHN';
-- → Seq Scan

-- Giải pháp: Tạo function-based index
CREATE INDEX idx_name_upper ON employees(UPPER(name));
```

---

## Setup thực hành

```bash
# Tạo PostgreSQL với 11M rows cho thực hành
docker run --name pg-test \
  -e POSTGRES_PASSWORD=postgres \
  --shm-size=256m \
  -d postgres:13

docker exec -it pg-test psql -U postgres

# Tạo bảng employees (xem các bài tiếp theo)
```

---

**Tiếp theo:** 02-index-scan-va-covering-index.md →
