# Bài 2: Index Scan vs Index Only Scan và Covering Index

## Sự khác biệt quan trọng

Khi bạn tạo một index và chạy query, database có thể thực hiện:
- **Index Scan**: Dùng index để tìm vị trí, rồi **quay lại heap** để lấy data
- **Index Only Scan**: Dùng index và **không cần đọc heap** — mọi data đã có trong index

Hiểu điều này giúp bạn thiết kế indexes tối ưu hơn.

---

## Index Scan vs Index Only Scan - Demo thực tế

### Setup

```sql
CREATE TABLE grades (
    id    SERIAL PRIMARY KEY,
    name  TEXT,
    grade INTEGER
);

-- Insert dữ liệu test
INSERT INTO grades (name, grade)
SELECT 
    'Student_' || generate_series,
    (random() * 100)::INTEGER
FROM generate_series(1, 10000000);

-- Index trên id (từ PRIMARY KEY)
-- Không có index nào khác
```

### Demo: Index Scan (phải đọc heap)

```sql
-- Tìm tên của student có id = 7
EXPLAIN ANALYZE SELECT name FROM grades WHERE id = 7;
```

```
Index Scan using grades_pkey on grades
  (cost=0.43..8.45 rows=1 width=15) (actual time=0.250..0.270 rows=1 loops=1)
  Index Cond: (id = 7)
  Heap Fetches: 1
Planning Time: 0.2 ms
Execution Time: 0.3 ms
```

**Điều gì xảy ra:**
```
B-Tree Index (id):      Heap:
[id=7] → ctid=(0,7) ──►  Page 0, Row 7
                          [id=7, name="Hussein", grade=81]
                                    ↑
                          Phải đọc heap để lấy "name"
```

### Demo: Index Only Scan (không cần heap)

```sql
-- Chỉ lấy id (đã có trong index)
EXPLAIN ANALYZE SELECT id FROM grades WHERE id = 7;
```

```
Index Only Scan using grades_pkey on grades
  (cost=0.43..4.45 rows=1 width=4) (actual time=0.100..0.110 rows=1 loops=1)
  Index Cond: (id = 7)
  Heap Fetches: 0     ← Không đọc heap!
Planning Time: 0.1 ms
Execution Time: 0.1 ms
```

**Điều gì xảy ra:**
```
B-Tree Index (id):      Heap:
[id=7]                  (không cần đọc!)
  ↓
  id = 7 → Trả về ngay
```

---

## Covering Index - Đưa thêm data vào Index

### Vấn đề

Bạn thường xuyên query theo `grade` và cần lấy `id`:

```sql
-- Query phổ biến:
SELECT id, grade
FROM students 
WHERE grade BETWEEN 80 AND 95
ORDER BY grade DESC;
```

Nếu chỉ có index trên `grade`:
1. Tìm trong index → lấy được grade và row pointer
2. Quay về heap → lấy id (thêm I/O!)

### Giải pháp: Non-key Column (INCLUDE clause)

```sql
-- Index thường
CREATE INDEX idx_grade ON students(grade);

-- Covering index - bao gồm cả id trong index
CREATE INDEX idx_grade_inc_id ON students(grade) INCLUDE (id);
```

**Kết quả:**

```sql
EXPLAIN ANALYZE
SELECT id, grade
FROM students
WHERE grade BETWEEN 80 AND 95
ORDER BY grade DESC
LIMIT 1000;
```

```
-- Với index thường (idx_grade):
Index Scan Backward on students
  Heap Fetches: 847    ← Phải đọc heap 847 lần để lấy id

-- Với covering index (idx_grade_inc_id):
Index Only Scan Backward on students
  Heap Fetches: 0      ← Không đọc heap!
  
Thực tế: ~16 giây → ~4 giây (cải thiện 4x)
```

---

## Key Column vs Non-Key Column

```
CREATE INDEX idx_grade_inc_id ON students(grade) INCLUDE (id);
                                           ↑              ↑
                                     KEY column     NON-KEY column
                                  (dùng để search)  (chỉ lưu trong index,
                                                     không dùng để search)
```

### Khác biệt quan trọng:

| | Key Column | Non-Key Column (INCLUDE) |
|---|---|---|
| **Dùng trong WHERE** | ✅ Có | ❌ Không |
| **Dùng trong ORDER BY** | ✅ Có | ❌ Không |
| **Lưu trong index** | ✅ Có | ✅ Có |
| **Tăng kích thước index** | Có | Có |

### Khi nào dùng INCLUDE?

```sql
-- Pattern: Search theo X, lấy thêm Y và Z

-- Query của bạn:
SELECT user_id, email, name FROM orders WHERE customer_id = 42;

-- Index tốt:
CREATE INDEX idx_orders_customer 
ON orders(customer_id)     -- KEY: dùng để search
INCLUDE (user_id, email);  -- NON-KEY: fetch không cần vào heap
```

---

## Demo đầy đủ: So sánh 3 loại Index

```sql
-- Setup: 50 triệu rows
CREATE TABLE students (
    id       SERIAL PRIMARY KEY,
    name     TEXT,
    grade    INTEGER,
    dob      DATE,
    address  TEXT,
    phone    TEXT
);

-- Trường hợp 1: Không có index nào (ngoài PK)
SELECT id, grade 
FROM students 
WHERE grade BETWEEN 80 AND 95 
ORDER BY grade DESC;
-- → Parallel Seq Scan: ~21 giây
-- → Phải đọc 14M "wasted rows"

-- Trường hợp 2: Index trên grade
CREATE INDEX idx_grade ON students(grade);
-- → Index Scan: ~16 giây
-- → Tốt hơn nhưng vẫn phải nhảy vào heap để lấy id

-- Trường hợp 3: Covering index
CREATE INDEX idx_grade_inc_id ON students(grade) INCLUDE (id);
-- → Index Only Scan: ~4 giây
-- → Heap Fetches = 0!
```

### Caveat quan trọng: Visibility Map

```sql
-- Sau khi insert/update nhiều data, cần chạy VACUUM
-- để Index Only Scan hoạt động hiệu quả:
VACUUM VERBOSE students;

-- Nếu không vacuum, database vẫn phải check heap
-- để verify row visibility (MVCC)
-- → Heap Fetches > 0 dù là Index Only Scan
```

---

## Thực hành: Tìm hiểu với EXPLAIN BUFFERS

```sql
-- Thêm BUFFERS để xem shared hits (cache)
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, grade 
FROM students 
WHERE grade BETWEEN 80 AND 90;
```

```
Index Only Scan Backward using idx_grade_inc_id on students
  Index Cond: ((grade >= 80) AND (grade <= 90))
  Heap Fetches: 0
  Buffers: shared hit=20 read=602
           ↑            ↑
           Từ cache     Từ disk

shared hit = 20   → 20 pages từ buffer cache (nhanh)
read = 602        → 602 pages phải đọc từ disk (chậm)
```

Khi thấy `shared hit` cao → data được cache → query nhanh hơn lần sau.

---

## Best Practices

```
1. Bắt đầu với EXPLAIN ANALYZE để hiểu query
   → Xem loại scan đang dùng (Seq, Index, Index Only)

2. Index Only Scan > Index Scan > Seq Scan (về tốc độ)

3. Thêm INCLUDE columns khi:
   - Bạn thường xuyên SELECT thêm columns cùng với search key
   - Những columns đó tương đối nhỏ (text ngắn, integers)
   - Query pattern ổn định

4. Tránh INCLUDE khi:
   - Columns quá lớn (TEXT dài, BLOB) → Index quá nặng
   - Index đã quá lớn → Không fit vào memory

5. Chạy VACUUM thường xuyên để duy trì Index Only Scan hiệu quả
```

---

**Tiếp theo:** 03-composite-index-va-optimizer.md →
