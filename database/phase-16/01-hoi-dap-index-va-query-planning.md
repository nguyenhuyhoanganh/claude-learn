# Bài 1: Hỏi Đáp - Index và Query Planning

## Giới thiệu

Section này tổng hợp các câu hỏi hay nhất từ học viên về indexing và query planning - những chủ đề thường gây nhầm lẫn trong thực tế.

---

## Câu hỏi 1: Tại sao có Index nhưng vẫn Full Table Scan?

**Tình huống:** Tôi tạo index trên cột `id`, nhưng EXPLAIN ANALYZE vẫn dùng Sequential Scan.

### Nguyên nhân: Bảng quá nhỏ

```sql
-- Bảng chỉ có 7 rows
CREATE TABLE test_table (id INT PRIMARY KEY, name TEXT);
INSERT INTO test_table VALUES (1,'a'),(2,'b'),(3,'c'),(4,'d'),(5,'e'),(6,'f'),(7,'g');

EXPLAIN SELECT id FROM test_table WHERE id = 3;
```

```
Query plan:
  Seq Scan on test_table  (cost=0.00..1.09 rows=1)
  Filter: (id = 3)
  
→ PostgreSQL chọn Sequential Scan thay vì Index Scan!
```

**Tại sao?** PostgreSQL so sánh chi phí:

```
Chi phí Sequential Scan (7 rows):
  - 1 page read (tất cả 7 rows vừa trong 1 page)
  - Cost: ~1 I/O

Chi phí Index Scan:
  - Load B-tree index từ disk
  - Traverse B-tree (nhiều node reads)
  - Jump to heap page
  - Cost: ~3-4 I/Os

→ Sequential Scan rẻ hơn cho bảng nhỏ!
```

### Nguyên nhân: Statistics chưa cập nhật

```sql
-- Tình huống nguy hiểm:
INSERT INTO big_table SELECT generate_series(1, 3_000_000);
-- Ngay sau đó:
SELECT * FROM big_table WHERE id = 5;
-- → Có thể vẫn dùng Seq Scan vì stats chưa update!

-- Giải pháp:
VACUUM ANALYZE big_table;  -- Cập nhật statistics
-- Sau đó EXPLAIN sẽ dùng Index Scan đúng
```

### Giải thích: Visibility Map và VACUUM

```
Tại sao stats cũ gây vấn đề?

PostgreSQL dùng pg_statistic để ước tính số rows.
Ngay sau insert hàng loạt:
  pg_statistic: "table có 100 rows" (chưa update)
  Planner: "100 rows → Sequential Scan đủ nhanh"
  Thực tế: 3,000,100 rows → Sequential Scan rất chậm!

Sau VACUUM ANALYZE:
  pg_statistic: "table có 3,000,100 rows"
  Planner: "3M rows → dùng Index Scan"
  → Đúng!

Trong production:
  autovacuum chạy định kỳ
  Nhưng sau bulk insert, nên VACUUM ANALYZE thủ công
```

---

## Câu hỏi 2: Heap Index Scan vs Index Only Scan - Khi nào dùng cái nào?

**Tình huống:** EXPLAIN cho thấy Bitmap Heap Scan thay vì Index Only Scan khi COUNT(*).

### Vấn đề: MVCC Visibility

```sql
-- Scenario:
CREATE TABLE grades (id INT, g INT);
CREATE INDEX ON grades(g);

INSERT INTO grades VALUES (1, 95), (2, 87), (3, 92);

EXPLAIN ANALYZE SELECT COUNT(*) FROM grades WHERE g > 90;
```

```
Output:
  Aggregate
  → Bitmap Heap Scan on grades
    → Bitmap Index Scan on grades_g_idx
  
Câu hỏi: Tại sao không phải Index Only Scan?
```

### Giải thích: xmin và xmax (MVCC columns)

```
PostgreSQL MVCC dùng 2 hidden columns trong mỗi row:
  xmin: Transaction ID tạo row này
  xmax: Transaction ID xóa/update row này

Index chỉ có: (key → row_tid)
Index KHÔNG có: xmin, xmax

Vấn đề:
  Sau INSERT vừa xong, transaction chưa được vacuum
  Index chứa rows, nhưng Postgres không chắc rows có visible không
  → Phải đi vào heap để kiểm tra xmin/xmax!

Giải pháp: VACUUM
  VACUUM grades;
  → Postgres đánh dấu tất cả rows là "all visible"
  → Visibility Map được cập nhật
  → Lần sau: Index Only Scan! (không cần check heap)
```

```sql
-- Sau VACUUM:
VACUUM grades;

EXPLAIN ANALYZE SELECT COUNT(*) FROM grades WHERE g > 90;
-- Output: Index Only Scan (nhanh hơn!)
```

### Rule of thumb

```
Index Only Scan: Database tin tưởng rows visible (sau VACUUM)
Bitmap Heap Scan: Database cần verify visibility (mới insert)

→ Chạy VACUUM sau bulk operations
→ Autovacuum sẽ xử lý trong production, nhưng có lag
```

---

## Câu hỏi 3: Chi phí trong Postgres EXPLAIN là gì?

**Tình huống:** EXPLAIN cho thấy `cost=0.00..4.07`, đơn vị là gì?

### Không phải milliseconds!

```sql
EXPLAIN SELECT * FROM employees ORDER BY salary;
-- Output:
-- Sort  (cost=70.83..73.33 rows=1000 width=...)
-- →   [70.83..73.33] ≠ 70.83ms đến 73.33ms!!!
```

### Đơn vị là gì?

```
cost = Đơn vị tổng hợp của PostgreSQL Planner

Bao gồm:
  - seq_page_cost = 1.0 (đọc 1 page sequentially)
  - random_page_cost = 4.0 (đọc 1 page randomly từ disk)
  - cpu_tuple_cost = 0.01 (xử lý 1 row)
  - cpu_index_tuple_cost = 0.005 (xử lý 1 index entry)
  - cpu_operator_cost = 0.0025 (thực hiện 1 operator)

Ý nghĩa:
  cost=0..10 → Rẻ
  cost=0..1000 → Đắt hơn
  cost=0..1,000,000 → Rất đắt!
  
  Quan trọng: So sánh TƯƠNG ĐỐI, không phải giá trị tuyệt đối
  70 cost < 7000 cost = Kế hoạch đầu tốt hơn
```

### So sánh Plans

```sql
-- Without index:
EXPLAIN SELECT * FROM employees ORDER BY salary;
-- cost=70.83..73.33

-- With index:
EXPLAIN SELECT * FROM employees ORDER BY salary;
-- (Với index trên salary)
-- cost=0.42..3.92

-- → Index plan rẻ hơn ~18x (3.92 vs 73.33)
-- Điều này không nghĩa là 18x nhanh hơn trong thực tế,
-- nhưng là signal tốt
```

---

## Câu hỏi 4: Index trên Cột có Giá Trị Trùng Lặp?

**Tình huống:** Tôi có cột `gender` với 2-3 giá trị phân biệt. Index có hữu ích không?

### Index Selectivity

```
Index selectivity = Tỷ lệ rows bị loại bỏ khi dùng index

High selectivity (tốt cho index):
  email: mỗi value unique → selectivity = 99.9999%
  user_id: gần unique → selectivity = 99.9%
  
Low selectivity (tệ cho index):
  gender: 2-3 values → selectivity = ~0%
  boolean status: 2 values → selectivity = ~0%
  country: 100-200 values → selectivity thấp

Rule: Nếu index chỉ loại bỏ < 20% rows → Database sẽ bỏ qua index!
```

### Khi nào low-selectivity index có ích?

```sql
-- Composite index: gender + other column
CREATE INDEX idx_users_gender_age ON users(gender, age);

-- Query này dùng composite index hiệu quả:
SELECT * FROM users WHERE gender = 'F' AND age > 30;
-- → gender filter ít ích, nhưng age filter combined = selective!

-- Partial index: chỉ index rows thỏa điều kiện
CREATE INDEX idx_pending_orders ON orders(created_at) WHERE status = 'pending';
-- → Chỉ index orders pending (thiểu số) → Very selective!
```

### PostgreSQL B-tree và Duplicate Values (Deduplication)

```
Trước PostgreSQL 13: Duplicate keys stored multiple times
  Index entry: [gender='M', row_tid=1]
               [gender='M', row_tid=2]
               [gender='M', row_tid=3]
               ...millions of times
  → Bloated index!

PostgreSQL 13+: B-tree deduplication
  Index entry: [gender='M', [row_tid=1, row_tid=2, row_tid=3, ...]]
  → Compact! Tiết kiệm space đáng kể với duplicate values
```

---

## Câu hỏi 5: Có Nên Xóa Index Không Dùng Nữa?

### Cách tìm unused indexes trong PostgreSQL

```sql
-- Xem các indexes và số lần được dùng
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan AS times_used,
    pg_size_pretty(pg_relation_size(indexname::regclass)) AS index_size
FROM pg_stat_user_indexes
ORDER BY idx_scan ASC;

-- Indexes với idx_scan = 0 là candidates để drop
```

### Chi phí của unused indexes

```
Mỗi index không dùng vẫn tốn:

1. Disk space:
   - Mỗi index có thể tốn MB đến GB
   - Index trên large table = large index
   
2. Write overhead:
   - INSERT: Phải update tất cả indexes
   - UPDATE: Nếu indexed column thay đổi, phải update index
   - DELETE: Phải remove từ tất cả indexes
   
   Công thức:
   Write cost ≈ base_write × (1 + num_indexes)
   5 indexes → Writes chậm hơn ~6x so với 0 indexes!

3. VACUUM overhead:
   - VACUUM phải process tất cả indexes
   - Nhiều indexes → Vacuum chậm hơn
```

### Quyết định drop index

```
Nên DROP index khi:
  ✅ idx_scan = 0 trong nhiều tuần (production workload)
  ✅ Index size > 10% table size mà không được dùng
  ✅ Write-heavy table với unused indexes
  ✅ Index bị supersede bởi index mới hơn

Không DROP khi:
  ❌ Table chưa có đủ traffic (stats chưa representative)
  ❌ Index dùng cho backup/reporting queries (ít nhưng quan trọng)
  ❌ Index enforce uniqueness (unique constraint)
  ❌ Foreign key index (cần thiết cho FK checks)

Safe workflow:
  1. Monitor pg_stat_user_indexes trong 2-4 tuần
  2. Identify indexes với idx_scan thấp
  3. Đổi thành DISABLED thay vì DROP ngay
  4. Monitor 1-2 tuần nữa
  5. Nếu không có vấn đề → DROP
```

---

## Câu hỏi 6: Tại sao EXPLAIN ANALYZE ảnh hưởng Performance thực tế?

```sql
-- EXPLAIN vs EXPLAIN ANALYZE
EXPLAIN SELECT * FROM orders WHERE user_id = 123;
-- → Chỉ show estimated plan, KHÔNG chạy query

EXPLAIN ANALYZE SELECT * FROM orders WHERE user_id = 123;
-- → Chạy query THẬT và đo thời gian thực tế
-- ⚠️ Query được THỰC SỰ execute!
```

```
EXPLAIN ANALYZE implications:
  - DELETE, UPDATE trong EXPLAIN ANALYZE sẽ THỰC SỰ thay đổi data!
  - Phải dùng trong transaction nếu muốn rollback:

BEGIN;
EXPLAIN ANALYZE DELETE FROM orders WHERE user_id = 123;
ROLLBACK;  -- Không commit delete thật

-- Buffers option cho thêm info:
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM orders WHERE user_id = 123;
-- → Hiện số pages đọc từ cache vs disk
```

---

**Tiếp theo:** 02-hoi-dap-isolation-va-concurrency.md →
