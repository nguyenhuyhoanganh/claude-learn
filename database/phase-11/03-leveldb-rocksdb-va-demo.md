# Bài 3: LevelDB, RocksDB và Demo Đổi Engine MySQL

## LevelDB - Google's Fast Write Engine

**LevelDB** được tạo bởi Jeff Dean và Sanjay Ghemawat (Google) năm 2011.

### Mục tiêu thiết kế

```
Vấn đề với B+Tree trên SSD:
  B+Tree INSERT có thể trigger rebalancing
  Rebalancing = update existing nodes = OVERWRITE on SSD
  SSD ghét overwrite (giảm lifespan)

LevelDB giải pháp:
  "Never overwrite. Only append. Cleanup later."
```

### Cấu trúc LSM-tree (Log-Structured Merge-tree)

```
Level 0 (MemTable - RAM):
  ┌─────────────────────────┐
  │ key1:v1, key3:v2, key2:v3│ ← Ghi vào đây trước (fast!)
  └─────────────────────────┘
          │ Flush khi đầy (hoặc restart)
          ▼
Level 0 (SST files trên disk, nhỏ, có thể overlap):
  [key1:v1, key3:v2]  [key2:v3, key5:v4]
          │ Compact khi đủ số lượng
          ▼
Level 1 (SST files, lớn hơn, sorted, no overlap):
  [key1:v1, key2:v3, key3:v2, key5:v4]
          │ Compact
          ▼
Level 2 (Lớn hơn nữa)
          │ Compact
          ▼
Level N ... (lớn nhất, trên slow storage)
```

```
SST = Sorted String Table
  - File chứa key-value pairs đã được sort
  - Immutable (không bao giờ sửa, chỉ tạo mới hoặc xóa)
  - Tại sao Sorted? → Binary search để tìm key nhanh
```

### Tại sao gọi là "Level" DB?

```
LevelDB có nhiều "levels":
  Level 0: Mới nhất, nhỏ nhất
  Level 1: Compact từ Level 0
  Level 2: Compact từ Level 1
  Level 3-N: ...

Compaction process:
  1. Level 0 đầy → Merge với Level 1 → Tạo Level 1 mới
  2. Level 1 đầy → Merge với Level 2 → Tạo Level 2 mới
  3. ...

Kết quả: Dữ liệu "rơi xuống" theo thời gian,
         Old data ở levels thấp,
         New data ở levels cao
```

### Đặc điểm LevelDB

```
✅ Write performance cực tốt (O(1) ghi vào MemTable)
✅ Tốt cho SSD (append-only, ít overwrite)
✅ Không cần rebalancing tree
❌ Không có transactions (chỉ single key operations)
❌ Embedded only (không có client-server)
❌ Reads hơi chậm hơn B+Tree (nhiều levels để tìm)
❌ Compaction tốn CPU và I/O

Dùng trong: Bitcoin Core, AutoCAD, Minecraft PE
```

---

## RocksDB - Facebook's Enhancement

**RocksDB** (2012) = Facebook fork của LevelDB với nhiều cải tiến.

### Tại sao Facebook tạo RocksDB?

```
LevelDB bị giới hạn:
  - Single-threaded compaction
  - Không có transactions
  - Performance không đủ cho Facebook scale

RocksDB improvements:
  ✅ Multi-threaded compaction
  ✅ ACID Transactions (đây là game changer!)
  ✅ Better compression
  ✅ Merge operators
  ✅ Read-only mode
  ✅ Backup & restore tools
  ✅ Rate limiting
  ✅ Column families
  ✅ WAL (Write-Ahead Log) for durability
  ... hàng trăm features khác
```

### ACID trong RocksDB

```
RocksDB hỗ trợ transactions mặc dù dùng LSM:
  1. Write vào MemTable (in-memory)
  2. Đồng thời ghi vào WAL (on disk)
  3. WAL đảm bảo durability
  4. MemTable đảm bảo visibility trong transaction

Optimistic Transactions:
  - Không lock khi read
  - Check conflicts lúc commit
  - Nếu conflict: Rollback và retry

Pessimistic Transactions:
  - Lock khi read
  - Giống B+Tree locks
```

### MyRocks - RocksDB cho MySQL

```
MyRocks = RocksDB storage engine cho MySQL/MariaDB/Percona

Tạo bởi: Facebook (để dùng cho MySQL của họ)

Lợi ích:
  - Write throughput cao hơn InnoDB ~2x trong nhiều workloads
  - Compression tốt hơn → Ít disk space hơn
  - SSD-friendly

Dùng khi:
  - Write-heavy MySQL workload
  - Log/event data
  - Time-series data
  - Cần tiết kiệm disk space

Cài đặt:
  Percona Server hoặc MariaDB → enable MyRocks plugin
```

---

## So sánh B+Tree vs LSM-tree

```
┌─────────────────┬────────────────────┬────────────────────┐
│ Tiêu chí        │ B+Tree (InnoDB)    │ LSM-tree (RocksDB) │
├─────────────────┼────────────────────┼────────────────────┤
│ Write speed     │ Good               │ Excellent          │
│ Read speed      │ Excellent          │ Good               │
│ Write amplif.   │ Low-Medium         │ High (compaction)  │
│ Read amplif.    │ Low                │ Medium             │
│ Space usage     │ Medium             │ Low (compression)  │
│ SSD friendly    │ Moderate           │ Excellent          │
│ ACID            │ Yes (InnoDB)       │ Yes (RocksDB)      │
│ Range queries   │ Excellent          │ Good               │
│ Point lookups   │ Excellent          │ Good               │
│ Compaction cost │ Low                │ High (background)  │
└─────────────────┴────────────────────┴────────────────────┘

Databases dùng B+Tree: PostgreSQL, MySQL/InnoDB, Oracle, SQL Server
Databases dùng LSM: Cassandra, HBase, LevelDB, RocksDB, InfluxDB, Elasticsearch
```

---

## Demo: Đổi Storage Engine trong MySQL

### Setup Docker MySQL

```bash
docker run \
  --name mysql-engine-demo \
  -e MYSQL_ROOT_PASSWORD=password \
  -p 3306:3306 \
  -d mysql:8

# Kết nối vào container
docker exec -it mysql-engine-demo mysql -uroot -ppassword
```

### Xem các Engines được hỗ trợ

```sql
SHOW ENGINES;
```

```
Output:
  Engine            | Support | Comment
  ──────────────────┼─────────┼──────────────────────────────
  MEMORY            | YES     | Hash based, in memory
  MRG_MYISAM        | YES     | Merge MyISAM
  CSV               | YES     | CSV storage engine  
  BLACKHOLE         | YES     | /dev/null storage engine
  MyISAM            | YES     | NOT NULL indexed columns
  PERFORMANCE_SCHEMA| YES     | Performance schema
  InnoDB            | DEFAULT | Supports transactions, row-lock
  ARCHIVE           | YES     | Archive storage engine
  FEDERATED         | NO      | Federated MySQL storage engine
```

### Tạo Tables với Engine khác nhau

```sql
CREATE DATABASE test;
USE test;

-- Table với MyISAM (không có transactions)
CREATE TABLE employees_myisam (
    id   INT AUTO_INCREMENT PRIMARY KEY,
    name TEXT
) ENGINE = MyISAM;

-- Table với InnoDB (có transactions)
CREATE TABLE employees_innodb (
    id   INT AUTO_INCREMENT PRIMARY KEY,
    name TEXT
) ENGINE = InnoDB;  -- Hoặc không chỉ định (default = InnoDB)
```

### Demo: MyISAM không có Transactions

```sql
-- Connect terminal 1:
BEGIN;
INSERT INTO employees_myisam (name) VALUES ('Hussein');
-- CHƯA COMMIT!

-- Connect terminal 2 (trong khi terminal 1 chưa commit):
SELECT * FROM employees_myisam;
-- → 1 row (Hussein)!
-- → MyISAM không có isolation, mọi thứ ngay lập tức visible!

-- Terminal 1: ROLLBACK
ROLLBACK;

-- Terminal 2:
SELECT * FROM employees_myisam;
-- → VẪN CÓ 1 ROW! ROLLBACK không hoạt động!
-- → MyISAM không hỗ trợ rollback
```

### Demo: InnoDB có Transactions

```sql
-- Terminal 1:
BEGIN;
INSERT INTO employees_innodb (name) VALUES ('Hussein');
-- CHƯA COMMIT!

-- Terminal 2:
SELECT * FROM employees_innodb;
-- → 0 rows! (InnoDB isolation đang hoạt động)

-- Terminal 1:
COMMIT;

-- Terminal 2:
SELECT * FROM employees_innodb;
-- → 1 row! (Hussein) - Chỉ thấy sau khi commit

-- Terminal 1:
BEGIN;
INSERT INTO employees_innodb (name) VALUES ('Alice');
ROLLBACK;  -- Hủy transaction

SELECT * FROM employees_innodb;
-- → Vẫn chỉ có Hussein (Alice bị rollback)
```

### Node.js Demo - Hành vi Transactions

```javascript
const mysql = require('mysql2/promise');

const config = {
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'password',
    database: 'test'
};

// Test MyISAM - Transactions không có tác dụng
async function testMyISAM() {
    const conn = await mysql.createConnection(config);
    
    try {
        await conn.beginTransaction();
        await conn.query("INSERT INTO employees_myisam (name) VALUES ('Test')");
        
        // Kiểm tra từ connection khác - Sẽ THẤY row dù chưa commit!
        const conn2 = await mysql.createConnection(config);
        const [rows] = await conn2.query("SELECT * FROM employees_myisam");
        console.log('MyISAM - Before commit:', rows.length, 'rows'); // > 0!
        
        await conn.rollback(); // Rollback không hoạt động!
        const [afterRollback] = await conn2.query("SELECT * FROM employees_myisam");
        console.log('MyISAM - After rollback:', afterRollback.length, 'rows'); // Vẫn > 0!
    } finally {
        await conn.end();
    }
}

// Test InnoDB - Transactions hoạt động đúng
async function testInnoDB() {
    const conn = await mysql.createConnection(config);
    
    try {
        await conn.beginTransaction();
        await conn.query("INSERT INTO employees_innodb (name) VALUES ('Test')");
        
        // Kiểm tra từ connection khác - KHÔNG thấy (đúng behavior)
        const conn2 = await mysql.createConnection(config);
        const [rows] = await conn2.query("SELECT * FROM employees_innodb");
        console.log('InnoDB - Before commit:', rows.length, 'rows'); // 0!
        
        await conn.rollback(); // Rollback hoạt động!
        const [afterRollback] = await conn2.query("SELECT * FROM employees_innodb");
        console.log('InnoDB - After rollback:', afterRollback.length, 'rows'); // 0!
    } finally {
        await conn.end();
    }
}
```

### Thay đổi Engine của Table đang tồn tại

```sql
-- Xem engine hiện tại
SELECT table_name, engine 
FROM information_schema.tables 
WHERE table_schema = 'test';

-- Đổi từ MyISAM → InnoDB
ALTER TABLE employees_myisam ENGINE = InnoDB;
-- ⚠️ Warning: Trên bảng lớn, lệnh này lock table và mất thời gian!

-- Đổi trở lại
ALTER TABLE employees_myisam ENGINE = MyISAM;
```

---

## Kết luận: Chọn Engine nào?

```
MySQL/MariaDB users:
  Default: InnoDB (transactions, row-level locking, ACID)
  Write-heavy: MyRocks (nếu hiểu LSM-tree trade-offs)
  Legacy/read-only: MyISAM (nhưng hãy migrate sang InnoDB)

PostgreSQL users:
  Không có lựa chọn (built-in B+Tree engine)
  → Nếu cần LSM, dùng PostgreSQL + extension hoặc đổi DB

Embedded/standalone:
  SQLite (iOS, Android, desktop apps, testing)

Pure performance với LSM:
  RocksDB (thường dùng qua framework như MyRocks, MongoRocks)
```

---

**Tiếp theo:** 04-xtradb-sqlite-aria.md →
