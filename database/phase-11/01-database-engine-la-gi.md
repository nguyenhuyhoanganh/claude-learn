# Bài 1: Database Engine là gì?

## Khái niệm

**Database Engine** (còn gọi là Storage Engine) là thư viện phần mềm chịu trách nhiệm:
- Lưu trữ dữ liệu xuống disk (SSD hoặc HDD)
- Thực hiện các thao tác CRUD (Create, Read, Update, Delete)
- Tùy engine: Có hoặc không có ACID transaction support

```
Database Management System (DBMS):
┌─────────────────────────────────────────────┐
│          MySQL / MariaDB / PostgreSQL         │
│                                               │
│  ┌────────────────────────────────────────┐  │
│  │         Database Engine Layer           │  │
│  │                                        │  │
│  │   B+Tree Engine  |  LSM-tree Engine    │  │
│  │   (InnoDB, MyISAM)  (RocksDB, LevelDB) │  │
│  └────────────────────────────────────────┘  │
│                                               │
│  Client-server, replication, stored procs    │
│  Foreign keys, transactions, etc.            │
└─────────────────────────────────────────────┘
```

---

## Tại sao tách Database Engine khỏi DBMS?

**Nguyên tắc Separation of Concerns:**

```
Database Engine:
  → Chuyên môn: Lưu trữ data xuống disk, đọc lên từ disk
  → Không quan tâm: Networking, authentication, replication

DBMS (phần trên engine):
  → Client-server connectivity (TCP, wire protocol)
  → Authentication & authorization
  → Replication (master-replica setup)
  → Stored procedures, triggers
  → Foreign key constraints
  → Query parser và optimizer
```

**Lợi ích của sự tách biệt:**

```
1. Có thể swap engine mà không đổi DBMS
   MySQL: Dùng MyISAM cho table A, InnoDB cho table B

2. Dễ dàng tạo database mới
   "Lấy RocksDB engine + xây custom DBMS trên đó"
   → Đã có: MyRocks (RocksDB + MySQL)

3. Optimize cho từng use case
   - Heavy writes? → RocksDB (LSM-tree)
   - Heavy reads? → InnoDB (B+Tree)
   - Embedded? → SQLite
```

---

## B+Tree Engines vs LSM-tree Engines

### B+Tree Engines (phổ biến nhất)

```
Cách hoạt động:
  - Data được sắp xếp trong B+Tree balanced structure
  - Internal nodes: Chỉ chứa keys
  - Leaf nodes: Chứa key + data (hoặc pointer đến heap)
  - Reads: Rất nhanh (O(log N))
  - Writes: Nhanh, nhưng chậm dần khi tree lớn (rebalancing)

Phù hợp với:
  ✅ Read-heavy workloads
  ✅ Mixed read/write (general purpose)
  ✅ ACID transactions
  ✅ Range queries

Databases dùng B+Tree:
  PostgreSQL, MySQL (InnoDB), Oracle, SQL Server, IBM DB2
```

### LSM-tree Engines (Log-Structured Merge-tree)

```
Cách hoạt động:
  - Writes KHÔNG bao giờ overwrite existing data
  - Writes luôn là append (thêm vào cuối)
  - Periodically "compact/merge" để cleanup
  
  Mem table (RAM)
      │ Flush khi đầy
      ▼
  Level 0 (SST files trên disk, nhỏ)
      │ Compact khi đầy
      ▼
  Level 1 (SST files, lớn hơn)
      │ Compact khi đầy
      ▼
  Level N (SST files, lớn nhất)

"SST" = Sorted String Table

Phù hợp với:
  ✅ Write-heavy workloads (logs, IoT data)
  ✅ SSD (không overwrite = bảo vệ SSD lifespan)
  ❌ Reads chậm hơn B+Tree một chút

Databases dùng LSM-tree:
  Cassandra, HBase, RocksDB, LevelDB, InfluxDB
```

---

## Tại sao SSD ghét B+Tree Writes?

```
SSD đặc điểm:
  - Đọc: Rất nhanh và không gây wear
  - Ghi mới: Nhanh
  - Ghi chồng lên (overwrite): Chậm + Gây wear!
    → Bit trên SSD có giới hạn write cycles
    → Overwrite = waste write cycles
    → SSD lifespan giảm

B+Tree khi INSERT:
  → Có thể cần rebalance tree
  → Rebalancing = update existing nodes
  → Update existing = OVERWRITE on SSD!
  → Bad for SSD lifespan

LSM-tree khi INSERT:
  → Luôn append, không bao giờ overwrite
  → "Old data" được cleanup sau trong compact phase
  → SSD-friendly!
```

---

## Tổng quan các Database Engines

```
┌────────────────┬──────────────┬────────────┬───────────────────────────┐
│ Engine         │ Structure    │ ACID       │ Đặc điểm                  │
├────────────────┼──────────────┼────────────┼───────────────────────────┤
│ MyISAM         │ B-Tree       │ ❌ Không    │ Cũ, chỉ table-level lock  │
│ InnoDB         │ B+Tree       │ ✅ Có       │ Default MySQL, row-level  │
│ XtraDB         │ B+Tree       │ ✅ Có       │ Fork InnoDB, Percona      │
│ Aria           │ B-Tree       │ ❌ Không    │ Fork MyISAM, Crash-safe   │
│ SQLite         │ B-Tree       │ ✅ Có       │ Embedded, lightweight     │
│ BerkeleyDB     │ B-Tree       │ ✅ Có       │ Key-value, cũ nhưng solid │
│ LevelDB        │ LSM-tree     │ ❌ Không    │ Google, fast writes       │
│ RocksDB        │ LSM-tree     │ ✅ Có       │ Facebook, fast writes+ACID│
└────────────────┴──────────────┴────────────┴───────────────────────────┘
```

---

**Tiếp theo:** 02-myisam-va-innodb.md →
