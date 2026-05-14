# Bài 5: BerkeleyDB, Tổng Quan Engines Phổ Biến và Chuyển Đổi Engine

## 1. BerkeleyDB - Ông Tổ của Key-Value Store

### Lịch sử

**BerkeleyDB** là một trong những database engine lâu đời nhất còn được nhắc đến. Được phát triển tại Đại học California, Berkeley từ năm 1994, BerkeleyDB hiện thuộc sở hữu của Oracle (thêm một item nữa trong danh sách Oracle "thu gom" database).

```
1994: BerkeleyDB ra đời tại UC Berkeley
      ↓
      Sleepycat Software mua lại và thương mại hóa
      ↓
2006: Oracle mua lại Sleepycat
      ↓
      Hiện tại: Oracle Berkeley DB (vẫn tồn tại nhưng ít phổ biến hơn)
```

### Đặc điểm kỹ thuật

BerkeleyDB là **embedded key-value store** - không phải client-server mà nhúng trực tiếp vào ứng dụng:

| Tính năng | BerkeleyDB |
|-----------|------------|
| Mô hình | Key-Value embedded |
| ACID | Có (transactions, locks) |
| Kiến trúc | Embedded (như SQLite) |
| Locking | B-tree locks |
| Client-Server | Không |
| Network | Không |

### Ứng dụng lịch sử

```
Bitcoin Core (ban đầu):
  - Bitcoin blockchain từng dùng BerkeleyDB để lưu UTXO set
  - Sau đó chuyển sang LevelDB (nhanh hơn cho write-heavy workload)
  - Dự đoán: có thể sẽ chuyển sang RocksDB trong tương lai

MemcacheDB (khác với Memcached):
  - Memcache + BerkeleyDB = MemcacheDB
  - Persistent key-value store với Memcache protocol
  - Ít phổ biến hiện nay
```

### Tại sao BerkeleyDB không còn phổ biến?

```
LevelDB (2011) và RocksDB (2012) xuất hiện:
  - LSM-tree: write throughput cao hơn nhiều
  - Tối ưu cho SSD (append-only, ít overwrite)
  - Open source, cộng đồng lớn hơn
  - Không bị Oracle kiểm soát

BerkeleyDB bị bỏ lại phía sau vì:
  1. B-tree không tối ưu cho write-heavy workload
  2. Oracle ownership = ít innovation
  3. Cộng đồng nhỏ hơn
  4. LevelDB/RocksDB làm tốt hơn với ít giới hạn hơn
```

---

## 2. Phân Loại Engines theo Cấu Trúc Dữ Liệu

Khi nhìn toàn bộ landscape, các database engine chia thành 2 trường phái lớn:

### Trường phái B-Tree (đọc nhanh)

```
┌────────────────────────────────────────────┐
│              B-Tree / B+Tree               │
│                                            │
│  Oracle, SQL Server, IBM DB2               │
│  PostgreSQL, MySQL/InnoDB                  │
│  CouchDB, MariaDB                          │
│                                            │
│  Đặc điểm:                                 │
│  ✅ Read performance xuất sắc              │
│  ✅ Range queries hiệu quả                 │
│  ✅ Random reads tốt                        │
│  ❌ Write amplification (rebalancing)      │
│  ❌ Kém tối ưu hơn trên SSD               │
└────────────────────────────────────────────┘
```

### Trường phái LSM-Tree (ghi nhanh)

```
┌────────────────────────────────────────────┐
│         LSM (Log-Structured Merge Tree)    │
│                                            │
│  Cassandra, HBase                          │
│  MongoDB (WiredTiger option)               │
│  InfluxDB, Elasticsearch                  │
│  Google Cloud Bigtable                     │
│  RocksDB, LevelDB                          │
│                                            │
│  Đặc điểm:                                 │
│  ✅ Write throughput xuất sắc              │
│  ✅ SSD-friendly (append-only)             │
│  ✅ Compression tốt                        │
│  ❌ Read amplification (nhiều levels)      │
│  ❌ Compaction overhead                    │
└────────────────────────────────────────────┘
```

### Sơ đồ tổng quan

```
                    DATABASE ENGINES
                         │
           ┌─────────────┼─────────────┐
           │             │             │
       B-Tree          LSM          Hybrid/Other
           │             │             │
    ┌──────┴──┐    ┌─────┴──┐    ┌────┴──────┐
    │ InnoDB  │    │RocksDB │    │  SQLite   │
    │ MyISAM  │    │LevelDB │    │  Memory   │
    │Postgres │    │Cassandra│   │   CSV     │
    │  Aria   │    │ HBase  │    │  Archive  │
    └─────────┘    └────────┘    └───────────┘
```

---

## 3. Tổng Quan Databases Nổi Bật

### Nhóm B-Tree (RDBMS truyền thống)

**PostgreSQL**
```
Engine: Custom B+Tree
Transactions: ACID đầy đủ
Locking: Row-level MVCC
Điểm mạnh: Compliance, extensions, JSON support
Dùng khi: Web app, analytics, phức tạp về queries
```

**MySQL/MariaDB**
```
Engine: Pluggable (InnoDB default, MyRocks optional)
Transactions: ACID (với InnoDB)
Locking: Row-level
Điểm mạnh: Phổ biến, ecosystem rộng, có thể đổi engine
Dùng khi: Web app, LAMP stack
```

**CouchDB**
```
Engine: B-Tree
Protocol: HTTP (REST API native!)
Điểm mạnh: HTTP native, offline sync, conflict resolution
Dùng khi: Mobile apps cần sync, distributed without coordinator
```

### Nhóm LSM (NoSQL scale-out)

**Cassandra**
```
Engine: LSM-tree
CAP: AP (Availability + Partition tolerance)
Locking: None (eventual consistency)
Điểm mạnh: Write throughput, horizontal scale
Dùng khi: IoT, time-series, write-heavy apps
```

**HBase**
```
Engine: LSM (Apache HBase on HDFS)
Dựa trên: Google Bigtable paper
Điểm mạnh: Integrate với Hadoop ecosystem
Dùng khi: Big data analytics
```

**InfluxDB**
```
Engine: Custom LSM variant
Chuyên dụng: Time-series data
Điểm mạnh: Optimized cho time-series queries
Dùng khi: Metrics, monitoring, IoT sensors
```

**Elasticsearch**
```
Engine: Lucene (inverted index)
Chuyên dụng: Full-text search
Điểm mạnh: Search, aggregations, real-time analytics
Dùng khi: Log analysis, search engines
```

**CouchBase**
```
Engine: B-Tree + caching layer
Điểm mạnh: Auto-sharding, built-in caching
Dùng khi: High-concurrency apps cần caching
```

---

## 4. Demo: Chuyển Đổi Engine trong MySQL

MySQL cho phép bạn có nhiều tables với engines khác nhau trong cùng một database - đây là feature rất powerful.

### Setup

```bash
# Spin up MySQL với Docker
docker run \
  --name mysql-demo \
  -e MYSQL_ROOT_PASSWORD=password \
  -p 3306:3306 \
  -d mysql:8

# Vào container
docker exec -it mysql-demo mysql -uroot -ppassword
```

### Kiểm tra engines được hỗ trợ

```sql
SHOW ENGINES;
```

```
Engine             | Support | Comment
───────────────────┼─────────┼─────────────────────────────────
InnoDB             | DEFAULT | Transactions, row-level locking
MyISAM             | YES     | Fast reads, no transactions
MEMORY             | YES     | Hash based, stored in memory
CSV                | YES     | Stores tables as CSV files
BLACKHOLE          | YES     | /dev/null: accepts writes, returns nothing
ARCHIVE            | YES     | Compressed, append-only
PERFORMANCE_SCHEMA | YES     | Performance metrics
```

### Tạo tables với engines khác nhau

```sql
CREATE DATABASE demo;
USE demo;

-- InnoDB: có transactions, row-level locking
CREATE TABLE employees_innodb (
    id   INT AUTO_INCREMENT PRIMARY KEY,
    name TEXT,
    dept TEXT
) ENGINE = InnoDB;

-- MyISAM: không có transactions, chỉ table-level locking
CREATE TABLE employees_myisam (
    id   INT AUTO_INCREMENT PRIMARY KEY,
    name TEXT,
    dept TEXT
) ENGINE = MyISAM;
```

### Demo: Transaction behavior

```sql
-- === Terminal 1: Test MyISAM ===
BEGIN;
INSERT INTO employees_myisam (name, dept) VALUES ('Alice', 'Engineering');
-- CHƯA COMMIT!

-- === Terminal 2 (cùng lúc): ===
SELECT * FROM employees_myisam;
-- Kết quả: 1 row! (Alice đã visible!)
-- → MyISAM không có transaction isolation!

-- Terminal 1:
ROLLBACK;
-- Kết quả: Alice VẪN CÒN! Rollback không hoạt động!

-- === Test InnoDB ===
-- Terminal 1:
BEGIN;
INSERT INTO employees_innodb (name, dept) VALUES ('Bob', 'Sales');
-- CHƯA COMMIT!

-- Terminal 2:
SELECT * FROM employees_innodb;
-- Kết quả: 0 rows (Bob chưa visible - đúng behavior!)

-- Terminal 1:
COMMIT;

-- Terminal 2:
SELECT * FROM employees_innodb;
-- Kết quả: 1 row (Bob visible sau commit)
```

### Thay đổi engine của table đang tồn tại

```sql
-- Xem engine hiện tại
SELECT table_name, engine
FROM information_schema.tables
WHERE table_schema = 'demo';

-- Chuyển MyISAM → InnoDB
ALTER TABLE employees_myisam ENGINE = InnoDB;
-- ⚠️ Lệnh này lock table trong quá trình chuyển đổi
-- ⚠️ Trên bảng lớn (hàng triệu rows) có thể mất vài phút!

-- Kiểm tra lại
SELECT table_name, engine
FROM information_schema.tables
WHERE table_schema = 'demo';
-- employees_myisam: InnoDB (đã đổi thành công!)
```

### Thiết lập default engine

```sql
-- Xem default engine hiện tại
SHOW VARIABLES LIKE 'default_storage_engine';

-- Đổi default engine cho session hiện tại
SET default_storage_engine = MyISAM;

-- Đổi permanent (cần edit my.cnf)
-- [mysqld]
-- default-storage-engine = InnoDB
```

---

## 5. Use Case Scenarios - Chọn Engine Nào?

```
Câu hỏi để chọn engine phù hợp:

1. Cần transactions không?
   Có → InnoDB, PostgreSQL, RocksDB
   Không → MyISAM (nhưng hãy dùng InnoDB, transactions gratis)

2. Write-heavy hay Read-heavy?
   Write-heavy → RocksDB/MyRocks, Cassandra, LSM engines
   Read-heavy → B-Tree engines (InnoDB, PostgreSQL)

3. Kiến trúc ứng dụng?
   Web app (multi-user) → InnoDB, PostgreSQL
   Mobile/Desktop (single user) → SQLite
   Cache layer → Redis, Memcached
   Analytics → Columnar stores (BigQuery, ClickHouse)

4. Có cần full-text search không?
   Có → Elasticsearch, PostgreSQL (ts_vector), MySQL FTS
   Không cần → Standard B-Tree engine đủ rồi

5. Scale như thế nào?
   Vertical scale (1 máy mạnh) → InnoDB, PostgreSQL
   Horizontal scale (nhiều máy) → Cassandra, MongoDB, HBase
```

---

## 6. Bài Học Kiến Trúc từ MySQL Pluggable Engine

Thiết kế pluggable engine của MySQL là một trong những quyết định kiến trúc tốt nhất:

```
Abstraction Layer Architecture:
┌─────────────────────────────────────────┐
│           Application / ORM             │
├─────────────────────────────────────────┤
│         MySQL Query Parser/Optimizer    │
├─────────────────────────────────────────┤
│          Storage Engine Interface       │ ← Abstract layer
├───────────┬────────────┬────────────────┤
│  InnoDB   │   MyISAM  │   MyRocks      │ ← Pluggable engines
│ (default) │ (legacy)  │  (RocksDB)     │
└───────────┴────────────┴────────────────┘

Ưu điểm:
  - Swap engine mà không thay đổi code ứng dụng
  - Thử nghiệm engine mới với production schema
  - Different tables → different engines (nếu cần)
  - Community có thể build engine mới (CSV, Blackhole, MyRocks)
```

**Blackhole Engine** - use case thú vị:
```sql
CREATE TABLE events_blackhole (
    id   INT,
    data TEXT
) ENGINE = BLACKHOLE;

-- Blackhole nhận data nhưng không lưu gì cả
-- Dùng để: Testing, benchmarking write path
--           Relay server trong MySQL Replication
-- INSERT vào Blackhole → trigger binlog → slave nhận → slave lưu
-- Master không lưu gì, chỉ forward binlog!
```

**Memory Engine** - useful cho temporary data:
```sql
CREATE TABLE session_cache (
    session_id  VARCHAR(64) PRIMARY KEY,
    user_id     INT,
    data        TEXT,
    expires_at  TIMESTAMP
) ENGINE = MEMORY;

-- Lưu trong RAM: read/write cực nhanh
-- Mất tất cả khi MySQL restart
-- Không bao giờ dùng cho persistent data!
-- Phù hợp: session cache, temp calculations
```

---

## Tổng Kết Section 11 - Database Engines

```
┌─────────────┬────────────┬─────────────┬────────────────────────┐
│ Engine      │ Cấu trúc   │ Transactions│ Best Use Case          │
├─────────────┼────────────┼─────────────┼────────────────────────┤
│ InnoDB      │ B+Tree     │ Có (ACID)   │ MySQL default, OLTP    │
│ MyISAM      │ B+Tree     │ Không       │ Legacy, read-only      │
│ XtraDB      │ B+Tree     │ Có (ACID)   │ InnoDB fork (deprecated)│
│ Aria        │ B+Tree     │ Không       │ MariaDB system tables  │
│ SQLite      │ B+Tree     │ Có (ACID)   │ Embedded, mobile       │
│ BerkeleyDB  │ B+Tree     │ Có          │ Legacy, Bitcoin (cũ)   │
│ LevelDB     │ LSM        │ Không       │ Embedded, write-heavy  │
│ RocksDB     │ LSM        │ Có (ACID)   │ Facebook-scale writes  │
│ MyRocks     │ LSM        │ Có (ACID)   │ MySQL + RocksDB        │
│ Memory      │ Hash       │ Không       │ Cache, temp data       │
│ Blackhole   │ N/A        │ Không       │ Testing, replication   │
│ CSV         │ File       │ Không       │ Export/import          │
└─────────────┴────────────┴─────────────┴────────────────────────┘
```

---

**Tiếp theo:** Phase 12 - Database Cursors →
