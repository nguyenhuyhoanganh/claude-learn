# Bài 2: Thảo Luận - UUID làm Primary Key và PostgreSQL vs MySQL

## Giới thiệu

Hai chủ đề này liên quan chặt chẽ: Shopify đã chuyển từ UUID sang integer PK, và Uber đã chuyển từ PostgreSQL sang MySQL. Cả hai quyết định đều liên quan sâu đến database internals.

---

## 1. Shopify: Chuyển từ UUID sang Integer Primary Key

### Tại sao Shopify từng dùng UUID?

```
Ban đầu Shopify dùng UUID v4 làm primary key:
  id: "550e8400-e29b-41d4-a716-446655440000" (36 bytes as string)

Lý do chọn UUID:
  ✅ Globally unique (không cần database coordination)
  ✅ Generate client-side (offline, no DB roundtrip)
  ✅ Hard to guess/enumerate (security)
  ✅ Merge databases dễ dàng (no ID conflicts)
  ✅ Microservices friendly
```

### Vấn đề với UUID làm PK trong InnoDB/Clustered Index

```
MySQL InnoDB: Primary Key = Clustered Index
Dữ liệu được lưu THEO THỨ TỰ của Primary Key

UUID v4 là RANDOM:
  Insert order: abc, 7f3, 21b, e9d, 3a1, ...
  Stored order: 21b, 3a1, 7f3, abc, e9d (sorted)

Vấn đề:
1. Page splits: Khi insert UUID mới, nó phải chen vào
   GIỮA các UUIDs đã có. Page đầy → Split!
   → Fragmentation
   → Extra I/O
   → Performance degradation theo thời gian

2. Cache inefficiency:
   Sequential reads sau UUID writes = Cache miss
   Vì phải đọc pages ngẫu nhiên để insert

3. Secondary index size:
   Mỗi secondary index chứa PK value
   UUID string (36 bytes) × N secondary indexes = HUGE!
   
   Ví dụ: 100M rows, 5 secondary indexes, UUID PK:
   5 × 100M × 36 bytes = 18GB extra secondary index storage!
```

### Giải pháp: ULID / Sequential UUIDs

```
ULID (Universally Unique Lexicographically Sortable Identifier):
  01AN4Z07BY79KA1307SR9X4MV3  (26 chars)
  
  Cấu trúc:
    - 48 bits: timestamp (milliseconds)
    - 80 bits: random
  
  Ưu điểm:
    ✅ Sortable theo time → Sequential inserts!
    ✅ Globally unique như UUID
    ✅ Không cần database coordination
    ✅ Shorter string (26 vs 36 chars)

UUID v7 (mới, 2022 RFC):
  018c2a8b-1234-7xxx-yxxx-xxxxxxxxxxxx
  
  Cấu trúc:
    - Timestamp trong 48 bits đầu
    - Random bits còn lại
  
  Ưu điểm:
    ✅ Backward compatible với UUID format
    ✅ Time-sortable như ULID
    ✅ Native UUID type support trong PostgreSQL
```

### Shopify's Final Decision: Snowflake-style IDs

```
Shopify chuyển sang 64-bit integer IDs:

Bit layout (tương tự Twitter Snowflake):
  [41 bits: timestamp ms] [10 bits: machine ID] [12 bits: sequence]
  
  = 63 bits total (dùng BIGINT)
  
Ưu điểm:
  ✅ Sequential → No page splits trong clustered index
  ✅ 8 bytes (vs 36 bytes UUID string) → Nhỏ hơn 4.5x
  ✅ Secondary indexes nhỏ hơn 4.5x
  ✅ Better cache utilization
  ✅ Không cần DB roundtrip (generate offline)
  ✅ Timestamp embedded (biết creation time)
  
Bài học:
  "UUID as PK trông đơn giản nhưng gây performance issues
  ở scale. Hãy suy nghĩ về PK strategy từ đầu."
```

### Quyết định cho Project của Bạn

```
Project nhỏ (< 10M rows):
  → UUID v4 OK, performance impact không đáng kể
  → Hoặc auto-increment BIGINT đơn giản

Project lớn, single database:
  → Auto-increment BIGINT (đơn giản, sequential, nhỏ)
  → Nhưng: Vấn đề khi merge databases, security (guessable)

Project lớn, distributed / microservices:
  → UUID v7 hoặc ULID (sequential + distributed)
  → Snowflake IDs nếu muốn tiny size

PostgreSQL vs MySQL:
  PostgreSQL: Có native UUID type (16 bytes binary, không phải 36-byte string!)
    → UUID in Postgres nhỏ hơn MySQL nhiều
    → UUID v7 trong Postgres là reasonable choice
  
  MySQL InnoDB: Không có native UUID type
    → UUID as CHAR(36) = 36 bytes
    → Dùng BINARY(16) để store UUID binary = 16 bytes (better)
    → Hoặc dùng integer IDs
```

---

## 2. Uber: Chuyển từ PostgreSQL sang MySQL

### Bối cảnh (2016 Uber Engineering Blog Post)

```
Uber's 2016 blog post: "Why Uber Engineering Switched from
Postgres to MySQL"

Gây tranh cãi lớn trong community!

Infrastructure lúc đó:
  Database: PostgreSQL, write-heavy (trips, locations)
  Scale: Hàng chục triệu trips/day
  Problem: Replication lag, high write amplification
```

### Lý do Uber cho là vấn đề với PostgreSQL

#### 1. Write Amplification cao hơn

```
PostgreSQL UPDATE = New row version (HOT optimization không áp dụng khi change indexed columns)

Ví dụ: driver location update (10 updates/second per driver):
  UPDATE drivers SET lat=X, lng=Y WHERE id=42;
  
  Nếu lat, lng được index:
    → Tạo new row version
    → Update ALL indexes (lat_idx, lng_idx, + others)
    → WAL records cho tất cả changes
    → Replication stream = rất lớn!

MySQL InnoDB:
  → Update in-place (modify row directly)
  → Undo log cho MVCC (nhỏ hơn PostgreSQL's approach)
  → Ít replication data hơn
```

#### 2. Replication Buffer Overflows

```
PostgreSQL WAL-based replication (2016):
  Primary WAL → Replica
  
  Nếu replica lag quá nhiều:
    WAL segments trên primary bị giữ lại (không xóa được)
    Primary disk đầy → Database crisis!
    
  Hoặc: WAL segments bị delete trước khi replica nhận được
    → Replica mất sync, phải rebuild từ đầu!

MySQL binlog-based replication:
  Binlog format linh hoạt hơn
  Replica lag không gây disk pressure trên primary
  (Replica tự quản lý retry)
```

#### 3. Replica Index Size

```
Uber's case: Index-heavy workload
  Nhiều secondary indexes
  PostgreSQL: Mỗi secondary index entry chứa xmin/xmax info
  → Index entries lớn hơn
  
  MySQL InnoDB: Secondary index entries nhỏ hơn
  → Fit more indexes in memory
  → Better cache hit rate
```

### Phản Biện từ PostgreSQL Community

```
PostgreSQL team và community đã phản hồi mạnh mẽ:

1. Phiên bản cũ:
   Uber dùng PostgreSQL 9.2 (2016)
   PostgreSQL 10, 12, 14 có nhiều improvements:
   - Logical replication tốt hơn
   - HOT updates cải thiện
   - Faster VACUUM
   - Better replication slots

2. Configuration:
   "Có thể Uber đã không tune PostgreSQL properly"
   - shared_buffers quá nhỏ
   - checkpoint_completion_target
   - WAL configuration

3. Workload đặc biệt:
   "Update lat/lng 10x/second mỗi driver = unusual"
   → Có thể giải quyết bằng:
     - TimescaleDB (time-series extension)
     - Event sourcing pattern
     - Streaming database thay vì OLTP
     
4. Uber đã admit:
   Vấn đề là combination của factors:
   - Workload cực kỳ write-heavy
   - PostgreSQL version cũ
   - Không phải PostgreSQL tệ hơn MySQL nói chung
```

### Bài Học

```
Không có "tốt hơn" tuyệt đối:
  PostgreSQL vs MySQL phụ thuộc vào workload

PostgreSQL mạnh hơn:
  ✅ Complex queries, CTEs, Window functions
  ✅ JSONB queries
  ✅ Extensions (PostGIS, TimescaleDB, pgvector)
  ✅ Compliance (ACID, SQL standards)
  ✅ Full-text search tích hợp
  ✅ Better MVCC cho read-heavy workloads

MySQL/InnoDB mạnh hơn:
  ✅ Write throughput cho simple updates
  ✅ Replication ecosystem (binlog-based)
  ✅ ProxySQL, Vitess tooling
  ✅ Facebook's MyRocks cho write-heavy
  ✅ Khởi đầu dễ hơn (ít configuration)

Uber's case:
  → Đặc thù workload + version cũ = không representative
  → Hầu hết teams không gặp vấn đề này
  → Đừng chuyển database chỉ vì đọc blog post!
```

---

## 3. SELECT COUNT(*) và Backend Performance

### Vấn đề SELECT COUNT(*) trong PostgreSQL

```sql
-- Query có vẻ đơn giản nhưng...
SELECT COUNT(*) FROM orders;
-- → Sequential scan tất cả pages!
-- → Chậm với table lớn!
```

**Tại sao PostgreSQL không track row count?**

```
MySQL: Lưu row count trong table metadata → COUNT(*) nhanh
PostgreSQL: Không lưu row count!

Lý do PostgreSQL:
  MVCC: Mỗi transaction thấy different "count"
  - Transaction A: Đang xóa 100 rows (chưa commit)
  - Transaction B: COUNT(*) nên thấy 1000 hay 900?
  - Phụ thuộc isolation level!
  
  → "True count" phụ thuộc vào snapshot → Không cache được!
```

**Giải pháp cho approximate count:**

```sql
-- Approximate count (nhanh hơn nhiều):
SELECT reltuples::bigint AS approx_count
FROM pg_class
WHERE relname = 'orders';
-- Được update bởi VACUUM ANALYZE
-- Sai số: có thể lệch vài % nhưng đủ cho phần lớn use cases

-- Exact count nhưng fast bằng counter table:
-- Pattern: Maintain separate counter
CREATE TABLE order_counts (
    tenant_id INT PRIMARY KEY,
    count BIGINT DEFAULT 0
);

-- Trigger để update counter:
CREATE OR REPLACE FUNCTION update_order_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO order_counts (tenant_id, count) VALUES (NEW.tenant_id, 1)
        ON CONFLICT (tenant_id) DO UPDATE SET count = order_counts.count + 1;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE order_counts SET count = count - 1 WHERE tenant_id = OLD.tenant_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER order_count_trigger
AFTER INSERT OR DELETE ON orders
FOR EACH ROW EXECUTE FUNCTION update_order_count();
```

---

**Tiếp theo:** 03-thao-luan-indexing-postgres-vs-mysql-va-advanced-locking.md →
