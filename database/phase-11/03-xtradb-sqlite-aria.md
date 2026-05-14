# Bài 3: XtraDB, SQLite và Aria - Các Storage Engine Thay Thế

## Giới thiệu

Sau khi Oracle mua lại Sun Microsystems (và qua đó kiểm soát MySQL), cộng đồng open-source đã phản ứng bằng cách tạo ra các engine thay thế. Bài này khám phá XtraDB, SQLite và Aria - ba storage engine quan trọng với những câu chuyện thú vị đằng sau.

---

## 1. XtraDB - Fork của InnoDB

### Nguồn gốc

XtraDB được tạo ra bởi **Percona** (công ty của Michael "Monty" Widenius và cộng sự) như một fork của InnoDB. Động lực đơn giản: Oracle sở hữu InnoDB, và cộng đồng muốn một phiên bản độc lập.

```
InnoDB (Oracle) ──fork──> XtraDB (Percona)
     │                         │
     │  same foundation         │  thêm features mới
     │                         │
  closed control            open development
```

### Đặc điểm kỹ thuật

XtraDB kế thừa toàn bộ tính năng của InnoDB:
- **B-Tree** cho cấu trúc index
- **ACID transactions** đầy đủ
- **Row-level locking**
- **Foreign key** support
- **MVCC** (Multi-Version Concurrency Control)

Percona bổ sung thêm:
- Cải thiện hiệu năng I/O
- Thêm metrics và monitoring
- Cải thiện XtraBackup tool

### Số phận của XtraDB

Câu chuyện của XtraDB là bài học thực tế về nguồn lực:

```
Vấn đề:
- Oracle (đội lớn, nhiều engineer) liên tục cập nhật InnoDB
- Percona (nhóm nhỏ hơn) không theo kịp tốc độ
- XtraDB bắt đầu tụt hậu về features

Kết quả:
- MariaDB 10.2 (2017): Chuyển từ XtraDB về InnoDB
- Lý do: không thể duy trì feature parity
```

**Bài học:** Forking một dự án lớn nghe có vẻ đơn giản, nhưng duy trì nó theo thời gian là thách thức khổng lồ.

### Tại sao System Tables dùng engine không có transactions?

Một điều thú vị: cả MySQL lẫn MariaDB đều dùng storage engine **không hỗ trợ transactions** (MyISAM/Aria) cho system tables nội bộ. Tại sao?

**Lý do có thể:**
1. **Bootstrap problem**: Database cần đọc system tables để khởi động - nếu system tables cũng cần transaction engine, sẽ có circular dependency
2. **Hiệu năng**: System tables được đọc rất thường xuyên, overhead của transactions không cần thiết
3. **Tính đơn giản**: Engine đơn giản ít bug hơn, quan trọng với infrastructure cốt lõi
4. **Legacy**: Quyết định thiết kế ban đầu và backward compatibility

---

## 2. SQLite - Database Nhỏ Gọn Nhất Thế Giới

### Người tạo ra SQLite

**D. Richard Hipp** tạo ra SQLite năm 2000. Vấn đề ông muốn giải quyết rất thực tế:

> "Khi tôi viết dữ liệu cục bộ xuống đĩa, tôi phải dùng file I/O thô sơ. Tại sao tôi không thể có một database ngay trên máy tính của mình?"

### Đặc điểm độc đáo

SQLite khác biệt hoàn toàn với MySQL hay PostgreSQL:

| Tiêu chí | SQLite | MySQL/PostgreSQL |
|----------|--------|------------------|
| Kiến trúc | Embedded (nhúng vào app) | Client-Server |
| Process | Chạy trong process của app | Process riêng biệt |
| Network | Không có | TCP/IP |
| File | 1 file duy nhất | Nhiều file hệ thống |
| Multi-user | Không phù hợp | Có thể |
| Cài đặt | Không cần | Cần install, configure |

### Sử dụng SQLite ở đâu?

SQLite có lẽ là database được deploy nhiều nhất thế giới:

```
Trình duyệt web:
  - Chrome: lưu history, bookmarks, extensions
  - Firefox: profile data, certificates
  - Safari: cookies, session data

Hệ điều hành:
  - Windows: nhiều subsystem nội bộ
  - macOS/iOS: Core Data framework
  - Android: mặc định cho app data storage

Ứng dụng:
  - Skype: lưu chat history
  - iTunes/Apple Music
  - Minecraft Pocket Edition
  - Nhiều IDE và text editor

Thiết bị nhúng:
  - Set-top box, smart TV
  - Router firmware
  - IoT devices
```

### Kiến trúc kỹ thuật

**Storage engine:** B-Tree (mặc định)

```
SQLite File Structure:
┌─────────────────────────────────┐
│           .db file              │
├─────────────────────────────────┤
│  Page 1: Database header        │
│  Page 2: Root page of table 1   │
│  Page 3: Leaf page of table 1   │
│  Page 4: Root page of table 2   │
│  ...                            │
└─────────────────────────────────┘
```

Richard Hipp cũng thử nghiệm LSM (Log-Structured Merge Tree) như extension, nhưng không đạt hiệu năng mong đợi vì:

- Kiến trúc core của SQLite được thiết kế chặt chẽ cho B-Tree
- Không thể "hoán đổi" engine như MySQL
- Đây chính là điểm yếu của kiến trúc monolithic so với kiến trúc pluggable engine của MySQL

**Ví dụ sử dụng SQLite với Python:**

```python
import sqlite3

# SQLite không cần server - chỉ cần tên file
conn = sqlite3.connect('myapp.db')
cursor = conn.cursor()

# Tạo bảng
cursor.execute('''
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE
    )
''')

# Insert với transaction (SQLite hỗ trợ ACID đầy đủ)
try:
    cursor.execute("INSERT INTO users (name, email) VALUES (?, ?)",
                   ("Alice", "alice@example.com"))
    conn.commit()
    print("Thành công!")
except sqlite3.IntegrityError as e:
    conn.rollback()
    print(f"Lỗi: {e}")

conn.close()
```

### Web SQL trong trình duyệt

Trình duyệt từng expose SQLite qua **Web SQL API**:

```javascript
// Chạy trong browser console (Chrome/Safari cũ)
var db = openDatabase('mydb', '1.0', 'My DB', 2 * 1024 * 1024);

db.transaction(function(tx) {
    tx.executeSql('CREATE TABLE IF NOT EXISTS users (id, name)');
    tx.executeSql('INSERT INTO users (id, name) VALUES (1, "Alice")');
});
```

**Lưu ý:** Web SQL đã bị deprecated và thay thế bằng IndexedDB trong các trình duyệt hiện đại.

### Khi nào dùng SQLite?

**Phù hợp:**
- App desktop hoặc mobile (1 user)
- Development và testing (thay thế database thật)
- Ứng dụng nhúng, IoT
- Cache cục bộ
- Config storage
- Prototype nhanh

**Không phù hợp:**
- Web application nhiều user đồng thời
- High write concurrency (SQLite dùng file-level locking cho writes)
- Database > vài GB
- Cần network access

### Về Concurrent Reads và Writes

SQLite hỗ trợ **concurrent reads** nhưng **writes là serialized**:

```
Thread 1: SELECT ...  ──> OK (concurrent)
Thread 2: SELECT ...  ──> OK (concurrent)
Thread 3: INSERT ...  ──> Chờ, blocking other writes
Thread 4: INSERT ...  ──> Chờ thread 3 xong
```

WAL (Write-Ahead Logging) mode cải thiện điều này:

```sql
-- Bật WAL mode
PRAGMA journal_mode=WAL;
-- Kết quả: Reads không bị block bởi writes
```

---

## 3. Aria - MyISAM Được Cải Tiến

### Nguồn gốc: Câu chuyện của Monty

**Michael "Monty" Widenius** - cha đẻ của MySQL - đã đặt tên cả MySQL và MariaDB theo tên các con gái ông:

```
MySQL  ──── "My" (con gái đầu)
MariaDB ─── "Maria" (con gái thứ hai)
Aria ────── Engine cho MariaDB (tên dự kiến cũng là "Maria" nhưng gây nhầm lẫn)
```

Khi Oracle mua Sun Microsystems (và qua đó kiểm soát MySQL):
1. Monty fork MySQL → tạo **MariaDB**
2. Không muốn dùng MyISAM (Oracle owned) → tạo **Aria**

### So sánh MyISAM vs Aria

| Tính năng | MyISAM | Aria |
|-----------|--------|------|
| Transactions | Không | Không |
| Row-level locking | Không | Không |
| Full-text search | Có | Có |
| Crash recovery | Thủ công (`myisamchk`) | **Tự động** |
| Index repair | Thủ công | **Tự động** |
| Owner | Oracle | MariaDB Project |
| Dùng trong | MySQL system tables | MariaDB system tables |

**Điểm cải tiến quan trọng nhất:** Aria tự động phục hồi sau crash mà không cần chạy công cụ repair thủ công.

### Tại sao System Tables Dùng Aria Thay Vì InnoDB?

Đây là câu hỏi thú vị. Trong MariaDB:
- **User tables** mặc định: InnoDB (có transactions)
- **System tables** (`mysql.*`, `information_schema`): Aria (không có transactions)

Lý giải:
```
System tables:
  - Đọc nhiều, ghi ít
  - Không cần isolation phức tạp
  - Cần tốc độ, không cần durability cao
  - Non-transactional = overhead thấp hơn
  - Aria đảm bảo crash-safe mà không cần transaction overhead
```

---

## Tổng kết So Sánh

```
┌────────────┬──────────────┬──────────┬──────────────────┐
│  Engine    │  Transactions│  Locking │  Use Case        │
├────────────┼──────────────┼──────────┼──────────────────┤
│  XtraDB    │  Có (ACID)   │  Row     │  Fork InnoDB     │
│  SQLite    │  Có (ACID)   │  File    │  Embedded/Local  │
│  Aria      │  Không       │  Table   │  MyISAM mới hơn  │
└────────────┴──────────────┴──────────┴──────────────────┘
```

---

**Tiếp theo:** 04-leveldb-rocksdb-lsm.md →
