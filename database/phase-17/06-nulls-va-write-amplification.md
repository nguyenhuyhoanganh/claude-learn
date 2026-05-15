# Bài 6: NULLs trong Database và Write Amplification

## Phần 1: NULLs - Hiểu đúng để dùng đúng

### NULL là gì?

```
NULL = "Không có giá trị" (absence of value)
     ≠ 0
     ≠ "" (empty string)
     ≠ false

SQL Standard: NULL bukan VALUE - là trạng thái "missing"

Ví dụ ý nghĩa:
  birthday = NULL     → User chưa cung cấp ngày sinh
  nickname = NULL     → User không có nickname
  deleted_at = NULL   → Record chưa bị xóa
  score = NULL        → Chưa được chấm điểm (khác với score = 0!)
```

### Cách Postgres lưu NULL

```
Postgres page structure (8KB):
  ┌─────────────────────────────────────────┐
  │ Page Header (24 bytes)                   │
  ├─────────────────────────────────────────┤
  │ Row Header + NULL BITMAP                 │
  │  null_bitmap[0]: 0 1 0 0 1 0 0 0        │
  │  ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓                       │
  │  col1 col2 col3 col4 col5...             │
  │  (1 = NULL, 0 = has value)              │
  ├─────────────────────────────────────────┤
  │ Column 1 value (32-bit int)             │
  │ Column 3 value (32-bit int)             │
  │ Column 6 value (VARCHAR...)             │
  │  [col2, col5 không có data - là NULL!]  │
  └─────────────────────────────────────────┘

NULL bitmap overhead:
  ≤ 8 columns:  1 byte overhead
  9-16 columns: 2 bytes overhead
  17-24:        3 bytes overhead
  ... (tăng 1 byte mỗi 8 columns)

1024 columns: 128 bytes = 0.13% overhead - RẤT NHỎ!
```

### NULL tiết kiệm không gian

```
Bài toán: Table 500 columns, hầu hết NULL

Lưu với DEFAULT VALUE (0 hoặc -1):
  500 columns × 4 bytes (int) = 2000 bytes/row
  
Lưu với NULL:
  NULL bitmap: 500/8 = 63 bytes overhead
  Chỉ lưu columns CÓ GIÁ TRỊ, ví dụ 20 columns:
  20 × 4 bytes + 63 = 143 bytes/row

Tiết kiệm: 2000 - 143 = 1857 bytes/row = 93% ít hơn!

Ảnh hưởng thực tế:
  Row size nhỏ → FIT nhiều rows vào 1 page (8KB)
  → Ít I/O khi đọc
  → Buffer pool hiệu quả hơn
  → PERFORMANCE cải thiện đáng kể!
```

### Những "bẫy" khi dùng NULL

```
Bẫy 1: COUNT(*) vs COUNT(column)

  Bảng có 5 rows, cột "score" có 2 NULLs:
    id=1, score=90
    id=2, score=NULL
    id=3, score=85
    id=4, score=NULL
    id=5, score=95

  SELECT COUNT(*) FROM grades;        → 5 (đếm tất cả rows)
  SELECT COUNT(score) FROM grades;    → 3 (bỏ qua NULLs!)
  SELECT COUNT(1) FROM grades;        → 5 (giống COUNT(*))

  Cùng 1 table, khác result → dễ bug!
```

```
Bẫy 2: NULL không thể so sánh bằng =

  WHERE score = NULL    → KHÔNG BAO GIỜ trả kết quả!
  WHERE score IS NULL   → Đúng!
  WHERE score IS NOT NULL → Đúng!

  Tại sao? NULL = NULL → UNKNOWN (không phải TRUE)
  SQL: chỉ trả rows khi condition = TRUE
```

```
Bẫy 3: NOT IN với NULL

  SELECT * FROM employees 
  WHERE dept_id NOT IN (1, 2, NULL);
  → Trả về NOTHING! 

  Lý do: NOT IN → WHERE id != 1 AND id != 2 AND id != NULL
         id != NULL → UNKNOWN → cả expression = UNKNOWN → bị lọc

  Fix: Đảm bảo subquery không return NULL
       Hoặc dùng NOT EXISTS
```

```
Bẫy 4: NULL trong aggregate

  SELECT AVG(score) FROM grades;  → 90 (không phải 54!)
  Tự động bỏ qua NULLs!
  (90 + 85 + 95) / 3 = 90  ← chia cho 3 (rows có value), không phải 5

  Nếu muốn tính NULL = 0:
  SELECT AVG(COALESCE(score, 0)) FROM grades;
  → (90 + 0 + 85 + 0 + 95) / 5 = 54
```

### NULL và Index

```
Postgres (từ version 8.3):
  ✅ Index LƯU NULL values
  → WHERE column IS NULL có thể dùng index

Oracle (mặc định):
  ❌ Index KHÔNG lưu NULL
  → WHERE column IS NULL → Full Table Scan!
  → Workaround: WHERE COALESCE(column, 'X') = 'X'

Partial Index (Postgres) - Best Practice:
  CREATE INDEX idx_active ON users(email) 
    WHERE deleted_at IS NULL;
  
  → Index CHỈ chứa active users (không có NULL deleted_at)
  → Index nhỏ hơn nhiều
  → Queries WHERE deleted_at IS NULL cực nhanh
  
  Admin query (ít dùng): không cần optimize
  User query (thường xuyên): tận dụng partial index
```

---

## Phần 2: Write Amplification

### Write Amplification là gì?

```
Định nghĩa: 1 logical write → nhiều physical writes

Ví dụ: User click "Done" trên Todo app
  Dev nghĩ: 1 UPDATE statement
  Thực tế có thể: 5-10 physical writes

Tại sao quan trọng?
  → Tốn I/O
  → Làm hỏng SSD nhanh hơn
  → Giảm throughput
  → Tăng latency
```

### Tầng 1: Application Write Amplification

```
API: PATCH /todos/123 { "done": true }
Front-end dev nghĩ: "Simple update!"

Backend thực tế:
  1. UPDATE todos SET done=true WHERE id=123
  2. INSERT todo_history (todo_id=123, action='done', user_id=...)
  3. UPDATE user_stats SET completed_count = completed_count + 1
  4. INSERT notifications (user_id=..., type='achievement')
  5. (nếu có) UPDATE search_index SET ...

1 API call = 5 database writes!

Với Normalized schema:
  Đây là THIẾT KẾ ĐÚNG - consistency > performance
  
Cần cân nhắc:
  - Có thực sự cần history?
  - Có thể async không? (push vào queue)
  - Có thể batch không?
```

### Tầng 2: Database Write Amplification (Postgres Example)

```
Bảng employees: 6 columns, 5 có index

UPDATE employees SET name = 'Alice2' WHERE id = 1;

PostgreSQL thực hiện:
  1. Tạo NEW tuple (row) TID(0,4): [id=1, name='Alice2', ...]
  2. Mark OLD tuple TID(0,1) là DEAD
  3. Update index on (id):    TID(0,1) → TID(0,4)
  4. Update index on (name):  'Alice' → TID(0,1) bị xóa
                              'Alice2' → TID(0,4) thêm vào
  5. Update index on (age):   TID(0,1) → TID(0,4)
  6. Update index on (dept):  TID(0,1) → TID(0,4)
  7. Update index on (email): TID(0,1) → TID(0,4)
  8. Ghi WAL (Write Ahead Log) cho tất cả thay đổi

Kết quả: 1 UPDATE → 8+ writes!
(+ WAL doubles mọi thứ)

HOT (Heap Only Tuple) - Postgres optimization:
  Nếu update column KHÔNG có index VÀ same page có space:
    → Không cần update bất kỳ index nào!
    → Old tuple point → new tuple
    → Giảm write amplification đáng kể
```

### Tầng 3: SSD Write Amplification

```
SSD Architecture:
  Cell → Row of cells → Page (thường 4-8KB)
  Pages grouped → Block (thường 256KB-1MB)

SSD Rule:
  ✅ Write: Chỉ viết vào PAGE TRỐNG
  ❌ Overwrite: KHÔNG THỂ ghi đè trực tiếp!
     → Phải ERASE cả BLOCK trước khi write

Update process:
  Old data (valid): [A] [B] [C] [D]  ← Block 1
  
  Update [B] → [B']:
    1. Write [B'] vào page mới → Block 2: [B'][_][_][_]
    2. Mark [B] trong Block 1 là STALE
    
  Block 1 now: [A] [STALE-B] [C] [D]

  Block 1 bây giờ có stale data → waste!
```

```
Garbage Collection (GC) trong SSD:
  1. GC scan blocks tìm stale pages
  2. Copy valid pages từ Block 1 sang Block mới
     Block 1: [A][stale-B][C][D] → Move [A][C][D] sang Block 3
  3. ERASE toàn bộ Block 1
  4. Block 1 ready để dùng lại

  1 UPDATE = write mới + GC activity = nhiều physical writes!

Wear Leveling:
  SSD có giới hạn write cycles (~2500-100000 per cell)
  → SSD controller phân phối đều writes qua tất cả cells
  → Kéo dài tuổi thọ SSD
  → Thêm write amplification!

Thực tế: 1 logical write → 3-10x physical writes trên SSD
```

### B-Tree và SSD Write Amplification

```
Database dùng B+Tree cho indexes
B+Tree updates → In-place modifications → SSD ghét!

Ví dụ: INSERT row mới

  B+Tree leaf page đầy → PAGE SPLIT:
    Leaf [1,3,5,7] → thêm 6 → [1,3,5] + [6,7]
    Parent cần thêm pointer → có thể split tiếp!
    
  Page split:
    1. Write 2 new pages (SSD: mark old pages stale)
    2. Write parent page
    3. Có thể split parent → ghi thêm
    4. GC phải dọn stale pages sau

LSM-Tree (Log-Structured Merge) - Giải pháp:
  Chỉ APPEND (không update in-place)
  → SSD: toàn bộ pages mới, không có stale pages
  → GC ít phải chạy
  → SSD tuổi thọ cao hơn
  
  Dùng trong: RocksDB, Cassandra, LevelDB, HBase
```

### Cộng dồn Write Amplification

```
User click "Done" → Todo app:

App level (x5):
  1 API → 5 DB writes

DB level (x3 per write, giả sử 3 indexes):
  5 writes × 3 index updates = 15 DB physical ops

WAL doubling (x2):
  15 × 2 = 30 WAL writes

SSD level (x5 GC amplification):
  30 × 5 = 150 SSD physical writes!

1 user click → 150 physical SSD writes!

Không phải luôn tệ đến vậy, nhưng cần nhận thức được:
  → Chọn columns cẩn thận khi thêm index
  → Schema denormalization có thể giảm amplification
  → LSM-tree cho write-heavy workloads
  → SSD chịu đựng được - nhưng wear leveling sẽ ảnh hưởng
```

### Giảm thiểu Write Amplification

```
Application level:
  ✅ Async writes (push to queue, process later)
  ✅ Batch updates thay vì từng row
  ✅ Xem xét kỹ trước khi thêm history/audit tables

Database level:
  ✅ Chỉ index columns thực sự cần
  ✅ Dùng HOT-friendly fill factor (70-80%)
  ✅ VACUUM regular để dọn dead tuples
  ✅ Chọn LSM-tree (Cassandra) cho write-heavy

SSD level:
  ✅ Dùng Enterprise SSD (higher write endurance)
  ✅ Over-provisioning (để GC hoạt động hiệu quả)
  ✅ Tránh update hot spots (phân tán writes)

Query design:
  ✅ UPDATE chỉ columns cần thiết (không SELECT *)
  ✅ Không update PRIMARY KEY
  ✅ Tránh UPDATE millions rows trong 1 transaction
```
