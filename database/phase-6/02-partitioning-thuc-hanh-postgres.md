# Bài 2: Partitioning Thực hành với PostgreSQL

## Demo: Partition bảng 10 triệu rows

### Bước 1: Setup và tạo bảng gốc

```bash
# Khởi động PostgreSQL
docker run --name pg-part \
  -e POSTGRES_PASSWORD=postgres \
  --shm-size=256m \
  -d postgres:13

docker exec -it pg-part psql -U postgres
```

```sql
-- Tạo bảng grades KHÔNG có partitioning (để so sánh)
CREATE TABLE grades_original (
    id SERIAL NOT NULL,
    g  INTEGER NOT NULL
);

-- Insert 10 triệu rows
INSERT INTO grades_original(g)
SELECT floor(random() * 100)::INTEGER
FROM generate_series(1, 10000000);
-- Có thể mất vài phút

-- Tạo index
CREATE INDEX grades_original_idx ON grades_original(g);

-- Verify
SELECT COUNT(*) FROM grades_original;  -- 10,000,000
```

### Bước 2: Tạo partitioned table

```sql
-- Bảng chính với partition definition
CREATE TABLE grades_parts (
    id SERIAL NOT NULL,
    g  INTEGER NOT NULL
) PARTITION BY RANGE(g);

-- Tạo 4 partitions
CREATE TABLE grades_0_35 (LIKE grades_parts INCLUDING ALL);
CREATE TABLE grades_35_60 (LIKE grades_parts INCLUDING ALL);
CREATE TABLE grades_60_80 (LIKE grades_parts INCLUDING ALL);
CREATE TABLE grades_80_100 (LIKE grades_parts INCLUDING ALL);

-- Attach partitions vào bảng chính
ALTER TABLE grades_parts 
    ATTACH PARTITION grades_0_35 FOR VALUES FROM (0) TO (35);

ALTER TABLE grades_parts 
    ATTACH PARTITION grades_35_60 FOR VALUES FROM (35) TO (60);

ALTER TABLE grades_parts 
    ATTACH PARTITION grades_60_80 FOR VALUES FROM (60) TO (80);

ALTER TABLE grades_parts 
    ATTACH PARTITION grades_80_100 FOR VALUES FROM (80) TO (100);
```

### Bước 3: Populate partitions

```sql
-- Insert data vào partitioned table
INSERT INTO grades_parts(g)
SELECT floor(random() * 100)::INTEGER
FROM generate_series(1, 10000000);

-- Tạo indexes trên partition table (áp dụng cho tất cả partitions!)
CREATE INDEX grades_parts_idx ON grades_parts(g);

-- Verify mỗi partition
SELECT COUNT(*) FROM grades_0_35;    -- ~3,500,000
SELECT COUNT(*) FROM grades_35_60;   -- ~2,500,000
SELECT COUNT(*) FROM grades_60_80;   -- ~2,000,000
SELECT COUNT(*) FROM grades_80_100;  -- ~2,000,000
```

### Bước 4: Kiểm tra Partition Pruning

```sql
-- Query chỉ vào partition phù hợp
EXPLAIN SELECT COUNT(*) FROM grades_parts WHERE g < 35;
```

```
Aggregate
  → Seq Scan on grades_0_35       ← Chỉ scan partition này!
      Filter: (g < 35)
  
(grades_35_60, grades_60_80, grades_80_100 không được đề cập)
```

```sql
-- So sánh với bảng không partition
EXPLAIN SELECT COUNT(*) FROM grades_original WHERE g < 35;
```

```
Aggregate
  → Bitmap Heap Scan on grades_original   ← Scan toàn bộ bảng
      Recheck Cond: (g < 35)
  → Bitmap Index Scan on grades_original_idx
```

### Bước 5: Kiểm tra kích thước partitions

```sql
-- Kích thước từng partition
SELECT 
    pg_class.relname AS partition_name,
    pg_size_pretty(pg_relation_size(pg_class.oid)) AS size
FROM pg_class
WHERE relname LIKE 'grades%'
ORDER BY pg_relation_size(pg_class.oid) DESC;

-- Ví dụ output:
-- grades_original   | 431 MB
-- grades_parts      | 0 bytes (parent table không có data)
-- grades_0_35       | 151 MB
-- grades_35_60      | 107 MB
-- grades_60_80      | 86 MB
-- grades_80_100     | 86 MB
```

---

## Partition Pruning - Database biết query partition nào

**Partition pruning** là khả năng database bỏ qua các partitions không liên quan:

```sql
-- Database CHỈ scan partition liên quan
SELECT * FROM grades_parts WHERE g BETWEEN 70 AND 90;
-- → Scan grades_60_80 và grades_80_100
-- → Skip grades_0_35 và grades_35_60!

-- Kiểm tra với EXPLAIN
EXPLAIN SELECT * FROM grades_parts WHERE g BETWEEN 70 AND 90;
```

```
Append
  → Seq Scan on grades_60_80      ← Partition liên quan 1
      Filter: ((g >= 70) AND (g <= 90))
  → Seq Scan on grades_80_100     ← Partition liên quan 2
      Filter: ((g >= 70) AND (g <= 90))
  
-- grades_0_35 và grades_35_60: KHÔNG xuất hiện!
```

**Quan trọng:** Partition pruning CHỈ hoạt động khi WHERE clause sử dụng partition key!

```sql
-- ✅ Partition pruning hoạt động
SELECT * FROM grades_parts WHERE g = 75;
SELECT * FROM grades_parts WHERE g BETWEEN 60 AND 80;
SELECT * FROM grades_parts WHERE g > 80;

-- ❌ Không có partition pruning - scan tất cả!
SELECT * FROM grades_parts WHERE id = 12345;  -- id không phải partition key
SELECT * FROM grades_parts;  -- Không có WHERE clause
```

---

## Automating Partitioning

### Vấn đề: Tạo partitions thủ công

Với partitioning theo thời gian, bạn cần tạo partition mới mỗi tháng/năm. Làm thủ công rất tốn công.

### Giải pháp: pg_partman extension

```sql
-- Cài pg_partman (PostgreSQL 12+)
CREATE EXTENSION pg_partman;

-- Tạo partitioned table theo tháng
SELECT partman.create_parent(
    p_parent_table := 'public.sensor_data',
    p_control := 'created_at',
    p_type := 'range',
    p_interval := '1 month',
    p_start_partition := '2024-01-01'::TEXT
);

-- pg_partman sẽ tự động:
-- - Tạo partitions mỗi tháng
-- - Archive/drop partitions cũ
-- - Maintain partition metadata
```

### Giải pháp đơn giản: Script tự động

```sql
-- Function tạo partition theo tháng
CREATE OR REPLACE FUNCTION create_monthly_partition(table_name TEXT, year_month DATE)
RETURNS VOID AS $$
DECLARE
    partition_name TEXT;
    start_date TEXT;
    end_date TEXT;
BEGIN
    partition_name := table_name || '_' || to_char(year_month, 'YYYY_MM');
    start_date := to_char(year_month, 'YYYY-MM-01');
    end_date := to_char(year_month + INTERVAL '1 month', 'YYYY-MM-01');
    
    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF %I 
         FOR VALUES FROM (%L) TO (%L)',
        partition_name, table_name, start_date, end_date
    );
END;
$$ LANGUAGE plpgsql;

-- Tạo partitions cho 12 tháng
SELECT create_monthly_partition('logs', 
    DATE_TRUNC('month', NOW() + (n || ' months')::interval)::DATE)
FROM generate_series(0, 11) n;
```

---

## Pros và Cons của Partitioning

### Ưu điểm ✅

```
1. Query performance:
   → Partition pruning giảm data phải scan
   → Index nhỏ hơn → Fit memory tốt hơn
   → Parallel scan trên nhiều partitions

2. Bulk loading:
   → Tạo bảng mới → Attach làm partition
   → Không cần INSERT từng row (nhanh hơn nhiều)
   
3. Archiving (lưu trữ):
   → Partition cũ → Move sang storage rẻ/chậm
   → DETACH partition cũ → ATTACH vào archive table
   → Không xóa data, chỉ "hide" nó
   
4. Maintenance:
   → VACUUM, REINDEX chỉ trên 1 partition (không block toàn bộ)
   → DROP partition (nhanh hơn DELETE nhiều rows)
```

### Nhược điểm ❌

```
1. UPDATE cross-partition (chậm):
   UPDATE grades SET g = 90 WHERE g = 25;
   → Row này phải di chuyển từ grades_0_35 → grades_80_100
   → Thực chất là DELETE + INSERT = chậm!

2. Queries không dùng partition key (nguy hiểm):
   SELECT * FROM grades_parts WHERE id = 100;
   → Scan TẤT CẢ partitions (chậm hơn bảng thường!)
   
3. Schema changes phức tạp:
   → ALTER TABLE trên parent có thể không propagate đúng
   → Phải kiểm tra từng partition
   
4. Overhead management:
   → Nhiều tables, nhiều objects trong database
   → Backup/restore phức tạp hơn
   
5. Query planner overhead:
   → Planner phải kiểm tra nhiều partitions
   → Với hàng trăm partitions, planning time tăng
```

---

## Khi nào nên dùng Partitioning?

```
✅ Phù hợp khi:
  - Bảng > 100M rows và đang có performance issues
  - Data có natural partition key (ngày, region, category)
  - Queries thường xuyên filter theo partition key
  - Cần archive/purge data theo thời gian
  - Maintenance (vacuum, backup) quá lâu

❌ Không nên dùng khi:
  - Bảng nhỏ (< 10M rows) → overhead không đáng
  - Queries không filter theo partition key
  - Nhiều cross-partition queries
  - Updates thường xuyên thay đổi partition key value
```

---

**Tiếp theo:** Phase 7 - Database Sharding →
