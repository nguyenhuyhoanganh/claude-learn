# Bài 5: Create Index Concurrently và Best Practices

## Vấn đề: Index Creation Block Writes

Tạo index trên bảng lớn trong production là thao tác nguy hiểm nếu không làm đúng cách:

```sql
-- Cách nguy hiểm trong production:
CREATE INDEX idx_orders_customer ON orders(customer_id);
-- → Postgres lock bảng orders
-- → Mọi INSERT/UPDATE/DELETE phải CHỜ
-- → Với bảng 100M rows, có thể mất 10-30 phút!
-- → Downtime hoặc degraded performance nghiêm trọng
```

---

## Giải pháp: CREATE INDEX CONCURRENTLY

```sql
-- Cách an toàn cho production:
CREATE INDEX CONCURRENTLY idx_orders_customer ON orders(customer_id);
```

### Cách hoạt động

```
CREATE INDEX (thông thường):
  1. Lock toàn bộ bảng (block writes)
  2. Scan bảng 1 lần
  3. Build index
  4. Release lock

CREATE INDEX CONCURRENTLY:
  1. Không lock (writes vẫn hoạt động bình thường)
  2. Scan bảng lần 1 (build index draft)
  3. Chờ active write transactions kết thúc
  4. Scan bảng lần 2 (catch up changes trong lúc đợi)
  5. Chờ transactions lần 2 kết thúc
  6. Mark index as valid
```

### Demo

```sql
-- Terminal 1: Tạo index concurrently
CREATE INDEX CONCURRENTLY idx_grades_g ON grades(g);
-- → Đang chạy (mất nhiều thời gian hơn)

-- Terminal 2: Trong khi đang tạo index, vẫn có thể:
INSERT INTO grades (name, g) VALUES ('New Student', 85);  -- ✅
UPDATE grades SET g = 90 WHERE id = 1;                    -- ✅
SELECT * FROM grades WHERE g > 80;                        -- ✅
-- Không bị block!
```

### Nhược điểm

```
1. Chậm hơn ~2-3x so với CREATE INDEX thông thường
   (phải scan bảng 2 lần)
   
2. Tốn CPU và I/O nhiều hơn
   (có thể ảnh hưởng performance của production queries)
   
3. Có thể thất bại:
   - Nếu có unique constraint violation trong lúc tạo
   - Index sẽ tồn tại nhưng ở trạng thái INVALID
   
4. Không thể tạo CONCURRENTLY trong transaction:
   BEGIN;
   CREATE INDEX CONCURRENTLY ...; -- ERROR!
   COMMIT;
```

### Xử lý Index INVALID

```sql
-- Kiểm tra trạng thái indexes
SELECT indexname, indisvalid 
FROM pg_indexes 
JOIN pg_index ON indexrelid = (SELECT oid FROM pg_class WHERE relname = indexname)
WHERE tablename = 'orders';

-- Nếu index bị INVALID, phải drop và tạo lại
DROP INDEX CONCURRENTLY idx_orders_customer;
CREATE INDEX CONCURRENTLY idx_orders_customer ON orders(customer_id);
```

---

## Best Practices: Tổng hợp

### 1. Chỉ index những gì cần thiết

```sql
-- ❌ KHÔNG nên index mọi column
CREATE INDEX idx_name   ON users(name);
CREATE INDEX idx_email  ON users(email);
CREATE INDEX idx_phone  ON users(phone);
CREATE INDEX idx_address ON users(address);
CREATE INDEX idx_bio    ON users(bio);

-- ✅ Chỉ index columns được dùng trong WHERE/JOIN/ORDER BY thường xuyên
CREATE INDEX idx_email  ON users(email);    -- login/lookup thường xuyên
CREATE INDEX idx_phone  ON users(phone);    -- lookup thường xuyên
-- name, address, bio: ít query → không cần index
```

### 2. Dùng Composite Index đúng cách

```sql
-- Query pattern của bạn:
SELECT * FROM orders 
WHERE customer_id = ? AND status = ? 
ORDER BY created_at DESC;

-- ❌ Index riêng lẻ (kém hơn)
CREATE INDEX idx_customer ON orders(customer_id);
CREATE INDEX idx_status   ON orders(status);

-- ✅ Composite index (đúng thứ tự!)
CREATE INDEX idx_customer_status_date 
ON orders(customer_id, status, created_at DESC);
-- customer_id đứng đầu → WHERE customer_id = ? work
-- + status → WHERE customer_id = ? AND status = ? work
-- + created_at → ORDER BY tận dụng được index order
```

### 3. Tránh Index trên Low-Cardinality Columns

```sql
-- ❌ Column chỉ có 2-3 giá trị → index vô dụng
CREATE INDEX idx_status ON orders(status);
-- status = {pending, completed, cancelled}
-- → Index trả về 33% bảng → Optimizer sẽ dùng Seq Scan thay vì index

-- ✅ Nếu cần, kết hợp với column khác (high cardinality)
CREATE INDEX idx_customer_status ON orders(customer_id, status);
-- customer_id rất selective → index có ích
```

### 4. Dùng Partial Index cho subset dữ liệu

```sql
-- Chỉ index các orders đang pending (thường được query nhất)
CREATE INDEX idx_pending_orders 
ON orders(customer_id)
WHERE status = 'pending';

-- Index nhỏ hơn nhiều → Fit vào memory tốt hơn
-- Query pending orders nhanh hơn
```

### 5. Cẩn thận với Text Search

```sql
-- ❌ LIKE với % ở đầu không dùng được index
SELECT * FROM users WHERE name LIKE '%john%';  -- Seq Scan

-- ✅ Prefix search thì OK
SELECT * FROM users WHERE name LIKE 'john%';   -- Index Scan

-- ✅ Full text search: dùng GIN index + tsvector
CREATE INDEX idx_name_fts ON users 
USING gin(to_tsvector('english', name));

SELECT * FROM users 
WHERE to_tsvector('english', name) @@ to_tsquery('john');
```

### 6. Monitor Index Usage

```sql
-- Tìm indexes không được sử dụng
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan,     -- Số lần index được quét
    idx_tup_read  -- Số rows được đọc qua index
FROM pg_stat_user_indexes
WHERE idx_scan = 0;  -- Chưa bao giờ được dùng!
-- → Cân nhắc DROP những indexes này
```

### 7. Monitor Index Bloat

```sql
-- Kiểm tra fragmentation của index
SELECT 
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
ORDER BY pg_relation_size(indexrelid) DESC;

-- Rebuild index để giảm fragmentation
REINDEX INDEX idx_orders_customer;
-- Hoặc không block:
REINDEX INDEX CONCURRENTLY idx_orders_customer;  -- PostgreSQL 12+
```

---

## Quyết định thiết kế Index: Checklist

```
Trước khi tạo index, hỏi:

□ Query này chạy bao nhiêu lần/ngày? (frequent → justify index)
□ Bảng có bao nhiêu rows? (> 10K rows → index bắt đầu có ích)
□ Column có cardinality cao không? (nhiều distinct values = good)
□ Query WHERE clause dùng = hay LIKE hay range?
□ Bạn cần SELECT thêm columns nào? (INCLUDE để covering index?)
□ Hiện tại có bao nhiêu indexes rồi? (mỗi index = chi phí write)
□ Index sẽ được tạo trên production không? (dùng CONCURRENTLY)

Sau khi tạo index:
□ Chạy EXPLAIN ANALYZE để confirm index được dùng
□ Monitor pg_stat_user_indexes để track usage
□ Review sau 1 tuần: index có được dùng không?
```

---

## Chiến lược làm việc với Bảng Tỷ Rows

Khi bảng lớn đến mức index không đủ:

```
Tăng dần độ phức tạp:

Level 1: Chưa có gì → Brute force / MapReduce
Level 2: Thêm Index → Tìm kiếm log(N) thay vì N
Level 3: Partitioning → Chia bảng thành các phần nhỏ hơn
Level 4: Sharding → Phân tán ra nhiều servers
Level 5: Redesign → Có thể tránh bảng billion-row không?

Nguyên tắc: Dùng cách đơn giản nhất đáp ứng được yêu cầu
```

---

**Tiếp theo:** Phase 5 - B-Tree vs B+Tree →
