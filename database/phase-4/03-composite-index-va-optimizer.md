# Bài 3: Composite Index và Database Optimizer

## Composite Index là gì?

**Composite Index** (hay Multi-column Index) là index trên **nhiều columns** cùng lúc:

```sql
-- Single index
CREATE INDEX idx_a ON test(a);

-- Composite index
CREATE INDEX idx_ab ON test(a, b);
```

Lựa chọn giữa single index và composite index ảnh hưởng lớn đến hiệu năng.

---

## Thực nghiệm: Index trên A vs B vs AB

### Setup

```sql
CREATE TABLE test (
    a INTEGER,
    b INTEGER, 
    c INTEGER
);

-- Insert 12 triệu rows
INSERT INTO test(a, b, c)
SELECT 
    (random() * 100)::INTEGER,
    (random() * 100)::INTEGER,
    (random() * 100)::INTEGER
FROM generate_series(1, 12000000);
```

### Cấu hình 1: Hai index riêng biệt (a và b)

```sql
CREATE INDEX idx_a ON test(a);
CREATE INDEX idx_b ON test(b);
```

**Test queries:**

```sql
-- Query 1: WHERE a = 70
EXPLAIN ANALYZE SELECT c FROM test WHERE a = 70;
-- → Bitmap Index Scan using idx_a (253ms)
-- → Phải dùng Bitmap vì có nhiều rows (9000+)

-- Query 2: WHERE b = 100
EXPLAIN ANALYZE SELECT c FROM test WHERE b = 100;
-- → Bitmap Index Scan using idx_b (250ms)

-- Query 3: WHERE a = 70 AND b = 80
EXPLAIN ANALYZE SELECT c FROM test WHERE a = 70 AND b = 80;
-- → Bitmap Index Scan using idx_a
-- → Bitmap Index Scan using idx_b
-- → BitmapAnd (gộp 2 bitmaps)
-- → ~0.5ms (rất nhanh vì chỉ 6 rows!)

-- Query 4: WHERE a = 70 OR b = 80
EXPLAIN ANALYZE SELECT c FROM test WHERE a = 70 OR b = 80;
-- → BitmapOr (union 2 bitmaps)
-- → Chậm hơn AND (nhiều rows hơn)
```

### Cấu hình 2: Composite Index (a, b)

```sql
DROP INDEX idx_a;
DROP INDEX idx_b;
CREATE INDEX idx_ab ON test(a, b);
```

**Test queries:**

```sql
-- Query 1: WHERE a = 70 → Vẫn dùng composite index!
EXPLAIN ANALYZE SELECT c FROM test WHERE a = 70;
-- → Bitmap Index Scan using idx_ab
-- → ✅ Vẫn dùng index vì A ở vị trí LEFT-MOST

-- Query 2: WHERE b = 100 → KHÔNG dùng index!
EXPLAIN ANALYZE SELECT c FROM test WHERE b = 100;
-- → Parallel Seq Scan ← FULL TABLE SCAN!
-- ⚠️ Composite index idx_ab KHÔNG dùng được khi chỉ query trên B

-- Query 3: WHERE a = 70 AND b = 80 → Siêu nhanh!
EXPLAIN ANALYZE SELECT c FROM test WHERE a = 70 AND b = 80;
-- → Index Scan using idx_ab (0.5ms)
-- ✅ Tốt nhất!

-- Query 4: WHERE a = 70 OR b = 80
EXPLAIN ANALYZE SELECT c FROM test WHERE a = 70 OR b = 80;
-- → Seq Scan (không thể dùng composite index với OR)
```

---

## Quy tắc vàng: Left-Most Prefix

**Composite Index (a, b) chỉ hỗ trợ:**

```
✅ WHERE a = ?             (a ở vị trí đầu)
✅ WHERE a = ? AND b = ?   (cả hai, theo thứ tự)
✅ WHERE a BETWEEN ? AND ? (range trên a)

❌ WHERE b = ?             (b không phải left-most)
❌ WHERE b = ? AND a = ?   (thứ tự có thể không giúp ích)
❌ WHERE a = ? OR b = ?    (OR không work với composite)
```

---

## Cấu hình 3: Composite Index + Single Index on B

```sql
CREATE INDEX idx_ab ON test(a, b);   -- composite
CREATE INDEX idx_b  ON test(b);       -- single on B
```

```sql
-- Query 1: WHERE a = 70 → Dùng idx_ab ✅
-- Query 2: WHERE b = 100 → Dùng idx_b ✅
-- Query 3: WHERE a = 70 AND b = 80 → Dùng idx_ab ✅ (tốt nhất)
-- Query 4: WHERE a = 70 OR b = 80 → 
--   BitmapOr: idx_ab (for a=70) + idx_b (for b=80)
--   → Tốt hơn trường hợp không có idx_b!
```

**Tổng kết so sánh:**

| Cấu hình | a=? | b=? | a AND b | a OR b |
|---|---|---|---|---|
| idx_a + idx_b | ✅ | ✅ | ✅ (bitmap AND) | ✅ (bitmap OR) |
| idx_ab | ✅ | ❌ Seq Scan! | ✅ (tốt nhất) | ❌ Seq Scan |
| idx_ab + idx_b | ✅ | ✅ | ✅ (tốt nhất) | ✅ |

---

## Database Optimizer: Ai quyết định dùng Index nào?

Database **không luôn luôn** dùng index dù có sẵn. Query optimizer quyết định dựa trên **statistics**:

### Cách Optimizer quyết định

```
Optimizer nhìn vào:
1. Có index nào phù hợp không?
2. Index đó sẽ trả về bao nhiêu rows? (từ statistics)
3. Dùng index có nhanh hơn full scan không?

Quy tắc:
- Trả về ít rows → Dùng Index Scan
- Trả về nhiều rows → Có thể dùng Bitmap Index Scan
- Trả về quá nhiều rows (>5-10% bảng) → Full Table Scan!
```

### Ví dụ: Khi optimizer bỏ qua index

```sql
-- Bảng 11M rows, index trên id

-- Trả về 1 row → Index Scan ✅
SELECT * FROM employees WHERE id = 5000;

-- Trả về ~11M rows (> 90% bảng) → Seq Scan!
SELECT * FROM employees WHERE id > 100;
-- EXPLAIN: Parallel Seq Scan on employees
-- Lý do: Index scan + 11M heap jumps chậm hơn full scan
```

### Statistics và ANALYZE

```sql
-- Cập nhật statistics (quan trọng sau khi bulk insert!)
ANALYZE employees;

-- Hoặc chi tiết hơn
VACUUM ANALYZE employees;
```

**Vấn đề phổ biến:** Bulk insert xong query ngay → statistics cũ → optimizer chọn sai kế hoạch:

```sql
-- Scenario:
INSERT INTO orders SELECT ... FROM ...; -- 300 triệu rows!
-- Statistics vẫn show "3 rows" (chưa update)

-- Query ngay sau đó:
SELECT * FROM orders WHERE customer_id = 1;
-- → Full Table Scan vì stats nói "bảng chỉ có 3 rows, dùng gì cũng nhanh"

-- Fix:
ANALYZE orders;  -- Cập nhật statistics
-- → Giờ dùng Index Scan đúng cách
```

---

## Database Hints: Override Optimizer

Trong các trường hợp đặc biệt, bạn có thể "ép" optimizer dùng index cụ thể:

```sql
-- PostgreSQL (dùng settings)
SET enable_seqscan = OFF;  -- Tắt seq scan (chỉ cho testing!)
SELECT * FROM employees WHERE name = 'John';

-- MySQL (dùng hint)
SELECT * FROM employees 
USE INDEX (idx_name) 
WHERE name = 'John';

-- Oracle
SELECT /*+ INDEX(e idx_emp_name) */ * 
FROM employees e 
WHERE name = 'John';
```

> **Cảnh báo:** Chỉ dùng hints khi bạn chắc chắn biết hơn optimizer. Thông thường, optimizer đúng.

---

## Quyết định: Nên tạo Index nào?

### Framework đưa ra quyết định

```
1. Xác định queries hot (chạy nhiều nhất)
2. Phân tích điều kiện WHERE trong các queries đó
3. Xem columns nào xuất hiện nhiều trong WHERE/JOIN/ORDER BY
4. Tạo index phù hợp

Ví dụ: Hệ thống e-commerce
Hot queries:
  - SELECT * FROM orders WHERE customer_id = ?
  - SELECT * FROM orders WHERE status = ? AND created_at > ?
  - SELECT * FROM products WHERE category_id = ? ORDER BY price

→ Indexes cần:
  - orders(customer_id)
  - orders(status, created_at)
  - products(category_id, price)
```

### Trade-off: Index không miễn phí!

```
Mỗi index bạn tạo:
  ✅ Tăng tốc SELECT/WHERE
  ❌ Chậm INSERT (phải cập nhật index)
  ❌ Chậm UPDATE (phải cập nhật index)
  ❌ Chậm DELETE (phải cập nhật index)
  ❌ Tốn thêm disk space
  ❌ Index lớn → không fit memory → chậm hơn

Quy tắc: Tạo index cho những queries THỰC SỰ quan trọng,
         không tạo index cho tất cả mọi thứ
```

---

**Tiếp theo:** 04-bloom-filter-va-uuid-performance.md →
