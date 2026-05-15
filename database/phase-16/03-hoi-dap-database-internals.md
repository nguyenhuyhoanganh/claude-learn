# Bài 3: Hỏi Đáp - Database Internals và Best Practices

## Giới thiệu

Các câu hỏi về cách database hoạt động bên trong - từ page reads, update propagation, đến NULL values và write amplification.

---

## Câu hỏi 1: Tại sao Database Đọc Pages thay vì Rows?

**Câu hỏi:** Database biết row ở đâu (qua index). Tại sao không đọc đúng row đó thôi?

### Giới hạn của Hardware

```
RAM: Byte-addressable
  - Có thể đọc/ghi bất kỳ byte nào
  - CPU instruction: MOV [0x1234567], AX  (đọc 2 bytes tại địa chỉ 0x1234567)

Disk (HDD/SSD): KHÔNG byte-addressable!
  - Đơn vị nhỏ nhất: Sector (512 bytes hoặc 4KB)
  - HDD: Đọc tối thiểu 1 sector
  - SSD: Đọc tối thiểu 1 page (4KB, 8KB, 16KB tùy NVMe)
  - Không có lệnh "đọc 3 bytes tại offset 7456"

→ Khi DB muốn đọc 1 row = phải đọc toàn bộ page chứa row đó!
```

### Kích thước Page trong các Database

```
PostgreSQL: 8KB (configurable khi compile)
MySQL InnoDB: 16KB (default)
MongoDB WiredTiger: 4KB
SQL Server: 8KB
Oracle: 8KB (default, tunable)
```

### Variable-length Rows

```
Rows có kích thước KHÔNG CỐ ĐỊNH:

Ví dụ:
  CREATE TABLE users (
    id      BIGINT,         -- 8 bytes
    name    TEXT,           -- variable!
    bio     TEXT,           -- variable! có thể NULL
    email   TEXT,           -- variable!
    settings JSONB          -- variable!
  );
  
Row của "Alice" (bio=NULL, short email):
  id=8B, name=5B, bio=0B, email=15B, settings=50B → ~78B
  
Row của "Very Long Name Bob" (long bio):
  id=8B, name=20B, bio=500B, email=25B, settings=200B → ~753B
  
→ Không thể biết offset của row thứ N!
→ Phải đọc page và scan từ đầu page để tìm row
```

### Future: Byte-addressable Persistent Memory

```
Công nghệ đang phát triển:
  - Intel Optane DC Persistent Memory
  - Byte-addressable storage với persistence
  - Nhanh hơn SSD, slower hơn DRAM
  
Nếu database dùng Persistent Memory:
  - Đọc đúng byte cần thiết
  - Không cần page-based I/O
  - Row-level granularity!
  
Hiện tại (2024): Optane bị Intel discontinue, nhưng technology vẫn phát triển
```

---

## Câu hỏi 2: Tại sao UPDATE trong Postgres ảnh hưởng ALL indexes?

**Câu hỏi:** Tôi UPDATE chỉ 1 cột. Tại sao tất cả indexes đều bị ảnh hưởng?

### MVCC: Postgres không UPDATE in-place

```
MySQL InnoDB: UPDATE in-place
  Row cũ bị ghi đè bởi row mới
  Chỉ indexes của cột thay đổi cần update

PostgreSQL: UPDATE = DELETE + INSERT
  Không sửa row cũ
  Tạo NEW ROW với giá trị mới
  Đánh dấu OLD ROW là "deleted" (xmax = current txid)
  
  Vì sao?
    MVCC cần giữ nhiều phiên bản cùng lúc:
    Transaction 1 (snapshot t=5) cần thấy row cũ
    Transaction 2 (snapshot t=10) cần thấy row mới
    → Cả hai phải tồn tại!
```

### Hệ quả: Mọi Index Bị Ảnh Hưởng

```sql
CREATE TABLE users (
    id BIGINT,
    name TEXT,
    email TEXT,
    salary INT
);
CREATE INDEX idx_name ON users(name);
CREATE INDEX idx_email ON users(email);
CREATE INDEX idx_salary ON users(salary);

-- UPDATE chỉ salary:
UPDATE users SET salary = 75000 WHERE id = 42;
```

```
PostgreSQL phải:
1. Đánh dấu row cũ là deleted (xmax)
2. Tạo row mới với salary mới
3. Thêm row mới vào TẤT CẢ indexes:
   - idx_name: row mới với (name, new_tid)
   - idx_email: row mới với (email, new_tid)
   - idx_salary: row mới với (new_salary, new_tid)
   
→ 3 index writes dù chỉ thay đổi 1 cột!
→ 10 indexes = 10 index writes!

MySQL InnoDB:
  Chỉ update idx_salary (cột thay đổi)
  Không update idx_name, idx_email (cột không đổi)
```

### Heap Only Tuple (HOT) Optimization

```
PostgreSQL có optimization: HOT updates

Conditions cho HOT update:
1. Không có indexed column nào thay đổi
2. Có free space trong CÙNG page với row cũ

Nếu HOT áp dụng:
  - Không update bất kỳ index nào!
  - Row mới được link từ row cũ trong cùng page
  - Index vẫn trỏ vào row cũ, row cũ trỏ vào row mới (chain)

Kiểm tra HOT:
SELECT n_tup_hot_upd, n_tup_upd 
FROM pg_stat_user_tables 
WHERE relname = 'users';
-- n_tup_hot_upd: số HOT updates
-- Tỷ lệ HOT cao = good performance!
```

---

## Câu hỏi 3: Bitmap Index Scan là gì?

**Câu hỏi:** EXPLAIN cho thấy "Bitmap Index Scan" + "Bitmap Heap Scan". Khác gì với Index Scan?

### 3 loại Index Scan trong PostgreSQL

```
1. Index Scan (simple):
   - Đọc 1 index entry → Jump to heap → Lấy row → Next entry
   - Pattern: index → heap → index → heap → ...
   - Tốt cho: Ít rows kết quả, trong clustered order
   - Random I/O pattern!

2. Index Only Scan:
   - Đọc từ index, KHÔNG cần đến heap
   - Chỉ hoạt động khi: Visibility Map clean + columns in index
   - Tốt nhất cho SELECT với ít columns

3. Bitmap Index Scan + Bitmap Heap Scan:
   - Phase 1 (Bitmap Index Scan): Scan index, tạo bitmap của pages
   - Phase 2 (Bitmap Heap Scan): Đọc heap pages theo bitmap order
```

### Bitmap Scan hoạt động như thế nào

```
Step 1: Bitmap Index Scan
  Scan toàn bộ index matching WHERE condition
  Tạo bitmap: [page_0: 0, page_1: 1, page_7: 1, page_12: 1, ...]
  "Page 1 có rows cần đọc, page 7 có rows cần đọc, ..."
  KHÔNG đọc heap, chỉ note down pages cần đọc

Step 2: Sort bitmap by page number
  [page_1, page_7, page_12, ...] (sorted!)
  → Sequential order → Minimize random I/O!

Step 3: Bitmap Heap Scan
  Đọc heap pages theo order trong bitmap
  page_1: lấy tất cả rows match
  page_7: lấy tất cả rows match
  page_12: lấy tất cả rows match
  → Sequential disk reads = Fast!
```

### Khi nào Database chọn Bitmap Scan?

```
PostgreSQL chọn:
  - Index Scan: Kết quả ít (< ~2% of rows), rows clustered
  - Bitmap Scan: Kết quả nhiều hơn, rows scattered across pages
  - Sequential Scan: Kết quả rất nhiều (> ~10% of rows), or tiny table

Ưu điểm Bitmap Scan:
  ✅ Convert random I/O → Sequential I/O (much faster on HDD)
  ✅ Có thể combine nhiều indexes (AND/OR bitmaps)
  
  -- Combine 2 indexes:
  WHERE salary > 50000 AND department = 'Engineering'
  → Bitmap(salary_idx) AND Bitmap(dept_idx) → Bitmap Heap Scan
  → Intersection của 2 bitmaps!
```

---

## Câu hỏi 4: NULL có giúp cải thiện Query Performance không?

**Câu hỏi:** Nghe nói NULL có thể cải thiện performance. Đúng không?

### NULL và Index Storage

```
PostgreSQL B-tree index behavior với NULL:
  - NULLs được index (trái với một số databases khác)
  - NULL < tất cả non-NULL values (trong sort order)
  - NULLS FIRST / NULLS LAST options khi ORDER BY

So sánh với MySQL:
  - MySQL cũng index NULL values
  - IS NULL query có thể dùng index

Oracle:
  - B-tree index KHÔNG index NULL (trừ composite index)
  - IS NULL query = full table scan trong Oracle!
```

### Khi nào NULL tiết kiệm space?

```sql
-- Postgres: NULL columns không chiếm space trong row
CREATE TABLE events (
    id BIGINT,
    event_type TEXT NOT NULL,
    user_id BIGINT,           -- Thường NULL (anonymous events)
    session_data JSONB,       -- Thường NULL
    processed_at TIMESTAMP    -- NULL cho đến khi processed
);

-- Row có nhiều NULLs nhỏ hơn row với default values:
-- 5 NULL columns ≈ 1 null bitmap byte
-- 5 columns với default values = actual storage for each
```

### NULL trong WHERE clause và Index

```sql
-- Index skip NULL (Postgres: NULL IS indexed)
CREATE INDEX idx_user ON events(user_id);

-- Tìm unprocessed events (processed_at IS NULL)
-- Partial Index thường tốt hơn:
CREATE INDEX idx_unprocessed ON events(id) WHERE processed_at IS NULL;

-- Query:
SELECT * FROM events WHERE processed_at IS NULL ORDER BY id;
-- → Dùng idx_unprocessed (only indexes NULL rows = very selective!)
-- → Rất nhanh so với full index scan!
```

---

## Câu hỏi 5: Write Amplification là gì và ảnh hưởng như thế nào?

**Write Amplification** = Số bytes thực tế được ghi lên disk / Số bytes data gốc.

### Write Amplification trong B-Tree

```
INSERT 1 row (100 bytes):
  1. Write WAL entry: ~200 bytes
  2. Update table page: Ghi 8KB page (dù chỉ thêm 100 bytes)
  3. Update primary key index: Ghi ~8KB index page
  4. Update each secondary index: 8KB × N indexes

Ví dụ: 1 row, 3 indexes:
  Data: 100 bytes
  WAL: 200 bytes
  Table page: 8,192 bytes
  PK index: 8,192 bytes
  Index 1: 8,192 bytes
  Index 2: 8,192 bytes
  
  Total disk write: ~32,968 bytes
  Write amplification: 32,968 / 100 ≈ 330x!
```

### Write Amplification trong LSM-tree (RocksDB)

```
INSERT 1 row:
  Level 0 (MemTable): ~200 bytes (in-memory, fast)
  WAL: ~200 bytes
  
  Sau đó (background compaction):
  L0 → L1: Rewrite ~10MB
  L1 → L2: Rewrite ~100MB
  L2 → L3: Rewrite ~1GB
  
  Write amplification: ~10-30x (so với 330x của B-Tree for inserts)
  
→ LSM tốt hơn cho writes, B-Tree tốt hơn cho reads
```

### Write Amplification trong Application Layer

```python
# Write amplification từ code:

class User(Model):
    id = PrimaryKey()
    name = CharField()
    email = CharField()
    updated_at = DateTimeField(auto_now=True)

# Chỉ đổi name, nhưng Django cũng update updated_at:
user.name = "New Name"
user.save()
# UPDATE users SET name='New Name', updated_at=NOW() WHERE id=42
# → 2 field updates instead of 1

# Tệ hơn: save() update ALL fields nếu không dùng update_fields
user.save(update_fields=['name'])  # Tốt hơn! Chỉ update name
```

---

**Tiếp theo:** Phase 17 - Database Discussions →
