# Bài 2: MyISAM, InnoDB và các B-Tree Engines

## MyISAM - Engine Cổ Điển (Không Transactional)

**MyISAM** = My Indexed Sequential Access Method

### Đặc điểm kỹ thuật

```
Cấu trúc:
  - B-Tree structure
  - Index TRỎ TRỰC TIẾP đến row (offset trên disk)
  - KHÔNG phân biệt primary vs secondary index
  - Mọi index đều trỏ trực tiếp đến vị trí row

Ví dụ:
  Index trên email:
    "alice@gmail.com" → disk offset 4096
    "bob@gmail.com"   → disk offset 8192
  
  → Lookup email: Tìm trong B-Tree → Jump đến offset → Đọc row
  → Rất nhanh!
```

### Vấn đề với UPDATE/DELETE

```
Khi INSERT:
  → Thêm row vào cuối file
  → Cập nhật index với offset mới
  → Nhanh!

Khi DELETE hoặc UPDATE (đổi kích thước):
  → Xóa/thay thế row giữa file
  → Tất cả offsets SAU row đó bị thay đổi
  → Phải cập nhật TẤT CẢ indexes liên quan
  → Chậm! Và dễ corrupt nếu crash giữa chừng!

Ví dụ với 100 indexes:
  DELETE 1 row → 100 index updates!
```

### Nhược điểm chính

```
❌ Không hỗ trợ ACID transactions
   → BEGIN/COMMIT không có tác dụng thực sự
   → INSERT ngay lập tức visible cho mọi connection

❌ Table-level locking (không có row-level)
   → UPDATE 1 row → Lock toàn bộ bảng
   → Concurrent writes: Mọi người chờ nhau

❌ Dễ corrupt khi crash
   → Index trỏ trực tiếp → Crash giữa update index = corrupt
   → Phải dùng REPAIR TABLE

❌ Oracle owned → Ít được maintain
```

### Khi nào vẫn dùng MyISAM?

```
✅ Read-only hoặc read-heavy (ít update/delete)
✅ Không cần transactions
✅ Full-text search (myisam có FULLTEXT index tốt)
✅ Bulk insert performance (nhanh hơn InnoDB đôi khi)
```

---

## InnoDB - Default MySQL Engine

**InnoDB** là storage engine chính của MySQL/MariaDB, hỗ trợ đầy đủ ACID.

### Sự khác biệt quan trọng: Clustered Index

```
InnoDB vs MyISAM - Cách lưu data:

MyISAM:
  Heap file (data):  [row1] [row2] [row3] [row4] ...
  Index file:        B-Tree → offsets
  
  → Data và index ở 2 file riêng
  → Index trỏ đến physical offset

InnoDB:
  Primary key index: B+Tree với DATA trong leaf nodes!
  [PK=1: row1 data] ↔ [PK=2: row2 data] ↔ [PK=3: row3 data]
  
  → Data được SORT theo primary key
  → Leaf nodes CỦA PRIMARY KEY CHỨA TOÀN BỘ ROW
  → Gọi là "Clustered Index" hoặc "Index Organized Table"
```

### Secondary Indexes trong InnoDB

```
InnoDB secondary index đặc biệt:
  Leaf nodes KHÔNG trỏ đến physical offset
  Leaf nodes trỏ đến PRIMARY KEY value!

Ví dụ:
  Table orders với PK=id, Index trên customer_id
  
  Secondary index (customer_id):
    customer_id=1001 → PK=5678    ← Trỏ đến PK, không phải offset!
    customer_id=1002 → PK=9012
  
  Khi query: WHERE customer_id = 1001:
    1. B+Tree traversal trên secondary index → PK=5678
    2. B+Tree traversal trên PRIMARY KEY → Full row data
    
  → 2 lookups (double lookup)
  → Nhưng không bị corrupt khi data di chuyển!
```

### Tại sao InnoDB an toàn hơn?

```
InnoDB sử dụng WAL (Write-Ahead Log):
  1. Client gửi INSERT
  2. Ghi vào WAL file trước (sequential write = nhanh)
  3. Response "Success" cho client
  4. Áp dụng thực sự vào B+Tree (background)

Nếu crash:
  → WAL vẫn còn
  → Restart → Replay WAL → Không mất data!

MyISAM:
  → Không có WAL
  → Crash giữa index update = corrupt!
```

### ACID trong InnoDB

```sql
-- Transactions thực sự hoạt động
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;

-- Nếu crash hoặc ROLLBACK:
-- → Cả 2 UPDATEs đều bị revert

-- MyISAM: BEGIN/COMMIT không có tác dụng!
-- InnoDB: BEGIN/COMMIT = real ACID transaction
```

### Row-level Locking

```
InnoDB: Row-level locking
  SELECT ... FOR UPDATE (lock 1 row)
  → Chỉ lock row cụ thể
  → Các rows khác vẫn accessible
  → Concurrency tốt hơn

MyISAM: Table-level locking  
  Bất kỳ write nào = Lock cả bảng
  → Chỉ 1 write tại một thời điểm
  → Concurrency kém
```

---

## XtraDB - Fork của InnoDB

**XtraDB** do Percona tạo ra (company của Vadim Tkachenko, Monty Widenius).

```
Lịch sử:
  2010: Percona fork InnoDB → XtraDB
  Lý do: Oracle owned InnoDB → Muốn kiểm soát features
  
  Thêm features:
    - Tốt hơn cho SSD
    - Cải thiện I/O performance
    - Better instrumentation/monitoring

  2016: MariaDB 10.2 switch BACK to InnoDB
  Lý do: InnoDB cập nhật nhanh hơn Percona maintain được
  
  Hiện tại: XtraDB ít được dùng, InnoDB đã "catch up"
```

---

## Aria - Fork của MyISAM (MariaDB)

**Aria** do Monty Widenius tạo ra (creator của MySQL) khi fork MariaDB.

```
Bối cảnh:
  - Monty tạo MySQL (MySQL = tên con gái của ông)
  - Oracle mua Sun (sở hữu MySQL)
  - Monty fork MySQL → MariaDB
    (Maria = tên con gái khác của ông)
  
  - MariaDB không thể dùng MyISAM (Oracle owned)
  - Monty tạo Aria: Clone của MyISAM nhưng:
    ✅ Crash-safe (tự repair sau crash)
    ✅ Không do Oracle sở hữu
    ✅ Thiết kế riêng cho MariaDB
  
  Dùng cho: System tables trong MariaDB
             (thay vì MyISAM)
```

---

## SQLite - Embedded Database

**SQLite** = Whole database trong 1 file, không cần server.

```
Tác giả: D. Richard Hipp (năm 2000)
Mục tiêu: "Tôi muốn lưu data locally, không muốn cài database server"

Đặc điểm:
  - 1 file .db = toàn bộ database
  - KHÔNG có client-server architecture
  - Import như 1 library vào code
  - Hỗ trợ đầy đủ ACID
  - B-Tree structure
  - Concurrent reads ✅
  - Concurrent writes ✅ (OS-level locking)
  - Table-level locking (không có row-level)
```

```python
# Python example - SQLite không cần server
import sqlite3

conn = sqlite3.connect('myapp.db')  # Tạo/mở file database
cursor = conn.cursor()

cursor.execute('''
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        name TEXT
    )
''')

cursor.execute("INSERT INTO users (name) VALUES (?)", ("Alice",))
conn.commit()

results = cursor.execute("SELECT * FROM users").fetchall()
print(results)  # [(1, 'Alice')]

conn.close()
```

### SQLite ở khắp nơi

```
Được dùng trong:
  - Mọi smartphone (iOS, Android)
  - Browsers (IndexedDB, Web SQL)
  - Windows OS (built-in)
  - Firefox (bookmarks, history)
  - Desktop apps (VS Code, Slack - offline storage)
  - Embedded systems

Câu nói nổi tiếng:
"SQLite is the most deployed database in the world"
→ Hàng tỷ instances đang chạy!
```

### SQLite không phù hợp khi nào?

```
❌ Multi-user concurrent writes (table lock = slow)
❌ Network access (không có client-server)
❌ Large datasets (hàng tỷ rows)
❌ Complex replication setups
```

---

## BerkeleyDB - Grandfather của Key-Value Stores

```
Năm tạo: 1994 (Sleepycat Software → Oracle)
Loại: Embedded key-value store + B-Tree
ACID: Có
Hiện tại: Thuộc Oracle, ít phổ biến

Từng được dùng trong:
  - Bitcoin Core (ban đầu)
  - Memcache DB
  - Một số ứng dụng cũ

Sự suy giảm: LevelDB và RocksDB thay thế cho use cases mới
```

---

## Chọn Engine nào?

```
Default (mọi trường hợp):
  → InnoDB (MySQL/MariaDB) hoặc PostgreSQL built-in

Embedded/Local:
  → SQLite (điện thoại, desktop app)

Write-heavy, log data, IoT:
  → RocksDB (hoặc Cassandra/HBase)

Legacy support, read-only:
  → MyISAM (nhưng hãy cân nhắc kỹ)

Kết luận: Không có engine "tốt nhất" tuyệt đối.
Phụ thuộc vào workload: read vs write ratio,
ACID requirements, concurrent users.
```

---

**Tiếp theo:** 03-leveldb-rocksdb-va-demo.md →
