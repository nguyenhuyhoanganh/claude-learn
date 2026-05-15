# Bài 5: Indexing - PostgreSQL vs MySQL (InnoDB)

## Kiến trúc Index cơ bản

```
Table (Heap):
  [row1: id=1, name="Alice", age=25]
  [row2: id=2, name="Bob",   age=30]
  [row3: id=3, name="Carol", age=25]

Index là data structure riêng biệt:
  - Lưu key values + pointer đến row
  - Cho phép tìm kiếm nhanh mà không scan toàn bộ table

Ví dụ Index on (age):
  age=25 → [pointer1, pointer3]
  age=30 → [pointer2]
```

---

## PostgreSQL: Mọi Index đều trỏ thẳng vào Heap

### Kiến trúc PostgreSQL Index

```
Table "employees" (HEAP):
  ┌─────────────────────────────────────┐
  │ TID(0,1): id=1, name="Alice", age=25│
  │ TID(0,2): id=2, name="Bob",   age=30│
  │ TID(0,3): id=3, name="Carol", age=25│
  └─────────────────────────────────────┘
         ↑              ↑              ↑
   TID = Tuple ID (vị trí vật lý trong heap)

Index on (id):              Index on (age):
  id=1 → TID(0,1)            age=25 → TID(0,1), TID(0,3)
  id=2 → TID(0,2)            age=30 → TID(0,2)
  id=3 → TID(0,3)

Index on (name):
  name="Alice" → TID(0,1)
  name="Bob"   → TID(0,2)
  name="Carol" → TID(0,3)

Mỗi index → trỏ THẲNG vào HEAP
```

### Tác động khi UPDATE/DELETE

```
UPDATE employees SET age = 26 WHERE id = 1;

PostgreSQL tạo row mới (MVCC):
  ┌─────────────────────────────────────┐
  │ TID(0,1): id=1, name="Alice", age=25│ ← OLD (dead)
  │ TID(0,2): id=2, name="Bob",   age=30│
  │ TID(0,3): id=3, name="Carol", age=25│
  │ TID(0,4): id=1, name="Alice", age=26│ ← NEW
  └─────────────────────────────────────┘

Cần update TẤT CẢ indexes trỏ vào TID(0,1):
  Index on (id):   id=1 → TID(0,1) phải → TID(0,4)
  Index on (name): name="Alice" → TID(0,1) phải → TID(0,4)
  Index on (age):  age=25 xóa TID(0,1), age=26 thêm TID(0,4)

→ N indexes = N lần update!
→ Đây là WRITE AMPLIFICATION của Postgres
```

### HOT Optimization (Heap Only Tuple)

```
Điều kiện HOT: Chỉ update column KHÔNG có index
  UPDATE employees SET nickname = 'Ali' WHERE id = 1;
  (nickname không có index)

HOT trick:
  TID(0,1): id=1, name="Alice", age=25, nickname=NULL
            → "hot" pointer → TID(0,4)
  TID(0,4): id=1, name="Alice", age=25, nickname='Ali'

  Indexes giữ nguyên TID(0,1)!
  → Khi đọc, follow "hot chain": TID(0,1) → TID(0,4)
  
  Điều kiện: phải có không gian trong CÙNG PAGE
  → Fill factor = 70-80% để dành chỗ cho HOT
```

### Read Performance trong Postgres

```
Query: SELECT name FROM employees WHERE id = 1;

  1. Index scan on (id):
     → id=1 → TID(0,1)
  2. Fetch từ HEAP tại TID(0,1)
     → name="Alice"

  Rất nhanh: 1 index lookup + 1 heap fetch

Query: SELECT id FROM employees WHERE id = 1;
  → Index Only Scan (không cần heap!)
  → Chỉ cần VACUUM chạy để update visibility map
```

---

## MySQL InnoDB: Secondary Index → Primary Key → Data

### Kiến trúc MySQL InnoDB (Clustered Index)

```
PRIMARY KEY index = DATA chính (clustered):
  id=1: [name="Alice", age=25, nickname=NULL]  ← data ở đây!
  id=2: [name="Bob",   age=30, nickname=NULL]
  id=3: [name="Carol", age=25, nickname=NULL]

Không có HEAP riêng - data NẰM TRONG primary key index!

Secondary Index on (age):
  age=25 → pk=1, pk=3   ← trỏ vào PRIMARY KEY VALUE
  age=30 → pk=2         ← không trỏ vào row trực tiếp!

Secondary Index on (name):
  name="Alice" → pk=1
  name="Bob"   → pk=2
  name="Carol" → pk=3
```

### Tác động khi UPDATE/DELETE trong MySQL

```
UPDATE employees SET age = 26 WHERE id = 1;

InnoDB update:
  1. Tìm PRIMARY KEY (id=1) → update age: 25 → 26
  2. Update Secondary Index on (age):
     Xóa: age=25 → pk=1
     Thêm: age=26 → pk=1
  3. Index on (name): KHÔNG cần update!
     name="Alice" → pk=1 vẫn đúng (pk không đổi)

→ Ít write amplification hơn Postgres trong nhiều trường hợp!
```

### Khi update PRIMARY KEY - Nguy hiểm!

```
UPDATE employees SET id = 10 WHERE id = 1;

InnoDB phải update:
  1. Primary Key: xóa id=1, thêm id=10 (với toàn bộ data!)
  2. Index on (age): age=26 → pk=1 phải → pk=10
  3. Index on (name): name="Alice" → pk=1 phải → pk=10
  4. TẤT CẢ secondary indexes!

→ Cực kỳ đắt! KHÔNG BAO GIỜ update primary key!
→ UUID làm PK + update UUID = thảm họa performance
```

### Read Performance trong MySQL

```
Query: SELECT name FROM employees WHERE age = 25;

  1. Secondary Index scan on (age):
     age=25 → pk=1, pk=3
  2. Với mỗi pk, tìm trong Primary Key:
     pk=1 → name="Alice"
     pk=3 → name="Carol"

  = 2 lookups! (index + primary key)
  → Thêm 1 hop so với Postgres

Query: SELECT id FROM employees WHERE age = 25;
  1. Secondary Index: age=25 → pk=1, pk=3
  2. pk=1, pk=3 là PRIMARY KEY → không cần extra lookup!
  
  → Index Only Scan tự động khi SELECT primary key!
  → MySQL rất tốt cho queries include primary key
```

---

## So sánh tổng quan

### Cấu trúc

```
┌─────────────────┬──────────────────┬─────────────────────┐
│                 │ PostgreSQL       │ MySQL InnoDB        │
├─────────────────┼──────────────────┼─────────────────────┤
│ Data location   │ HEAP (riêng)     │ Clustered (trong PK)│
│ Index trỏ vào   │ TID (heap addr)  │ Primary Key value   │
│ Secondary index │ → HEAP           │ → PK → Data         │
│ Read hops       │ 1 (index→heap)   │ 2 (index→PK→data)   │
└─────────────────┴──────────────────┴─────────────────────┘
```

### Write Performance

```
UPDATE column có index:
  Postgres: Update row + Update TẤT CẢ indexes
  MySQL:    Update PK data + Update chỉ index đó

DELETE row:
  Postgres: Mark dead + Update ALL indexes trỏ vào đó
  MySQL:    Xóa PK entry + Update secondary indexes

INSERT:
  Postgres: Append to heap + Update tất cả indexes
  MySQL:    Insert vào PK B-tree (ordered!) + secondary indexes
```

### Uber's Case Study

```
Uber chuyển từ Postgres sang MySQL (2016):
  - Bảng drivers có nhiều indexes
  - UPDATE vị trí GPS liên tục (write heavy)
  - Postgres: update 1 row → update N indexes
  - Write amplification gây I/O bottleneck

Nhưng Postgres đã fix nhiều thứ:
  - HOT optimization giảm index updates
  - WAL optimization
  → Trường hợp của Uber có thể xử lý khác

Bài học: Hiểu internals trước khi migrate!
```

### Chọn Primary Key trong MySQL

```
QUAN TRỌNG với InnoDB:
  Secondary indexes chứa PK value
  → PK size ảnh hưởng ALL secondary indexes

  PK = int (4 bytes):
    Secondary index entry: key + 4 bytes PK

  PK = UUID (36 bytes string):
    Secondary index entry: key + 36 bytes PK
    → Tất cả secondary indexes lớn hơn 9x!

  PK = UUID (16 bytes binary):
    Secondary index entry: key + 16 bytes PK
    → Vẫn 4x lớn hơn int

Best practice cho MySQL:
  → Dùng AUTO_INCREMENT INT hoặc BIGINT
  → Nếu phải UUID: dùng UUID_v7 (ordered) + BINARY(16)
  → KHÔNG BAOGIỜ update primary key
```

### Khi nào chọn Postgres vs MySQL

```
Postgres tốt hơn khi:
  ✅ Read heavy workload
  ✅ Complex queries (joins, aggregations)
  ✅ Ít indexes per table
  ✅ Cần advanced features (JSONB, full-text, PostGIS)
  ✅ Update many columns at once (ít phí hơn)

MySQL InnoDB tốt hơn khi:
  ✅ Write heavy + thường query bằng PK
  ✅ Simple CRUD operations
  ✅ Cần tương thích với ecosystem MySQL rộng
  ✅ Bảng có PK được chọn tốt (int/bigint)
  ✅ Ít update primary key
```
