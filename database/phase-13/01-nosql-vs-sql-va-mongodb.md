# Bài 1: NoSQL vs SQL và Kiến trúc MongoDB

## NoSQL là gì?

**NoSQL** = Not Only SQL - không phải là "chống lại SQL", mà là một cách tiếp cận khác:

```
SQL (Relational):
  - Schema cố định: Phải định nghĩa bảng, cột, kiểu dữ liệu trước
  - Truy vấn bằng ngôn ngữ SQL
  - Dữ liệu: Rows trong tables
  - ACID mặc định

NoSQL:
  - Schema linh hoạt: Không cần định nghĩa trước
  - Truy vấn bằng API (document API, key-value API...)
  - Dữ liệu: Documents (JSON), key-value pairs, graphs...
  - ACID tùy loại

Điểm khác biệt cốt lõi:
  1. API khác nhau (SQL language vs document API)
  2. Định dạng dữ liệu khác nhau (tables+rows vs JSON/BSON)
```

### Tại sao NoSQL ra đời?

```
Vấn đề với SQL khi web bùng nổ:
  - Thêm field mới → ALTER TABLE → Downtime!
  - Schema cứng nhắc → Không linh hoạt cho startup
  - "Tôi chỉ cần key-value, không cần toàn bộ SQL"

NoSQL giải quyết:
  - Không cần schema trước
  - Document store: {id: 1, name: "Alice", age: 30, extra: "anything"}
  - Thêm field mới → Không cần migration!
  - Linh hoạt cho rapid development
```

---

## MongoDB: Lịch sử kiến trúc

### Giai đoạn 1: MMAP Engine (MongoDB v1-v3)

```
MMAP = Memory-Mapped File I/O

Cách hoạt động:
  - Documents được lưu trong heap file
  - Index trỏ trực tiếp đến offset (vị trí) trong file
  - OS quản lý memory-mapping

Vấn đề nghiêm trọng:
  ❌ Global lock → Một write lock toàn bộ database
  ❌ Sau đó: Collection-level lock → Tốt hơn nhưng vẫn chậm
  ❌ Không có compression
  ❌ ACID yếu

  Thread 1: Ghi document A
  Thread 2: Ghi document B (chờ Thread 1!)
  → Mọi writes phải xếp hàng
```

### Giai đoạn 2: WiredTiger Engine (MongoDB v3.2+)

MongoDB mua lại công ty WiredTiger năm 2014, tích hợp vào v3.2.

```
WiredTiger cải tiến:
  ✅ Document-level locking (không còn collection lock)
  ✅ MVCC (Multi-Version Concurrency Control)
  ✅ Compression (snappy, zlib)
  ✅ B+Tree structure với clustered hidden index
  ✅ WAL (Write-Ahead Log) cho durability
```

### Cấu trúc lưu trữ của WiredTiger

```
WiredTiger dùng 2 index cho mỗi collection:

1. Hidden Index (Record ID Index):
   ┌─────────────────────────────────┐
   │ Record ID (64-bit) → Document  │  ← Clustered index thực sự
   │ recId=1 → {BSON document 1}    │
   │ recId=2 → {BSON document 2}    │
   └─────────────────────────────────┘
   Record ID là số nguyên 64-bit (8 bytes)
   Đây là "physical address" của document

2. _id Index (visible to user):
   ┌─────────────────────────────────┐
   │ ObjectId → Record ID           │  ← Secondary index!
   │ "507f..." → recId=1            │
   │ "507g..." → recId=2            │
   └─────────────────────────────────┘
   _id (ObjectId) = 12 bytes
   Leaf node chứa Record ID (không phải document)
```

### Vấn đề: Double Lookup

```
Khi query db.users.findOne({_id: ObjectId("507f...")})

Bước 1: Traverse _id Index
  Root → Intermediate → Leaf node
  Tìm được: ObjectId → Record ID = 12345

Bước 2: Traverse Hidden Index
  Root → Intermediate → Leaf node
  Tìm được: Record ID 12345 → BSON Document

→ 2 B+Tree traversals = 2 lần random I/O!
→ Gọi là "Double B-Tree Seek"
```

```
Tại sao không phải chỉ "2 reads"?
  Mỗi B+Tree traversal:
    Root page → 1 I/O
    Intermediate page(s) → 1-2 I/Os
    Leaf page → 1 I/O
  = Tổng 3-5 I/Os mỗi traversal
  
  Double traversal = 6-10 I/Os per document lookup!
```

---

## ObjectId - Khóa mặc định của MongoDB

```
ObjectId = 12 bytes:
  ┌──────────┬──────────┬──────────┬──────────┐
  │ 4 bytes  │ 5 bytes  │ 3 bytes  │          │
  │Timestamp │ Random   │ Counter  │          │
  │(seconds) │          │(per pid) │          │
  └──────────┴──────────┴──────────┴──────────┘

Ví dụ: 507f1f77bcf86cd799439011
  - 4 bytes đầu = Unix timestamp → Documents có timestamp built-in!
  - 5 bytes random = machine ID + process ID
  - 3 bytes counter = monotonic counter per process

Lợi ích:
  ✅ Globally unique (không cần central coordinator)
  ✅ Contains creation time (range queries trên thời gian!)
  ✅ Generated client-side (không cần round-trip đến server)
  
Hạn chế (so với int):
  ❌ 12 bytes vs 8 bytes (BIGINT)
  ❌ String representation: 36 chars (dùng UUID) vs compact
```

---

## Giai đoạn 3: Clustered Collections (MongoDB v5.3+)

```
Vấn đề của design cũ:
  - Double B-tree seek cho mọi ID lookup
  - Hidden index tốn storage riêng
  - ID index (12 bytes key) + Hidden index (8 bytes key) = lãng phí

Giải pháp: Clustered Collection
  → Xóa hidden index đi
  → _id index TRỞ THÀNH clustered index (data stored inline!)
  → Một traversal duy nhất để tìm document
```

### So sánh Non-Clustered vs Clustered Collection

```
Non-Clustered (default trước v5.3):
  _id index:          Hidden index:
  ObjectId → RecordID  RecordID → Document
    ↓                    ↓
  2 traversals để tìm document

Clustered Collection (v5.3+):
  _id index (clustered):
  ObjectId → Document (stored inline!)
    ↓
  1 traversal là đủ!
```

### Tạo Clustered Collection

```javascript
// Tạo clustered collection (phải làm khi tạo, không thể thêm sau)
db.createCollection("users", {
    clusteredIndex: {
        key: { _id: 1 },  // Phải là _id
        unique: true,
        name: "users_clustered_idx"
    }
});
```

### Lợi ích của Clustered Collection

```
1. Faster reads:
   → Single B+Tree traversal thay vì double
   → Đặc biệt tốt cho range queries trên _id
   → ObjectId có timestamp → Range = time range queries!

2. Smaller storage:
   → Trước: Hidden index (separate) + _id index (separate)
   → Sau: Chỉ còn 1 structure chứa cả index và data

3. Fewer I/Os:
   → Ít I/Os hơn = ít page reads hơn
   → Better cache utilization

4. Range queries hiệu quả:
   → ObjectId được sort theo timestamp (4 bytes đầu)
   → Query theo thời gian = sequential scan (thay vì random!)
```

### Hạn chế của Clustered Collection

```
1. Chỉ tạo được khi khởi tạo collection:
   → Không thể convert collection đang có
   → Phải copy data sang collection mới

2. Secondary indexes lớn hơn:
   Non-clustered: Secondary index → RecordID (8 bytes)
   Clustered:    Secondary index → _id (12 bytes ObjectId)
   
   → Thêm 4 bytes per record per secondary index
   → Nếu dùng UUID (36 bytes) thay _id: +28 bytes per record!

3. Secondary indexes bị ưu tiên thấp hơn:
   → MongoDB có thể chọn secondary index thay vì clustered index
   → Cần dùng hint() nếu biết clustered index tốt hơn
```

```javascript
// Dùng hint để force dùng clustered index
db.users
  .find({ _id: { $gte: ObjectId("62abc..."), $lte: ObjectId("62def...") } })
  .hint({ _id: 1 });  // Force sử dụng clustered index
```

---

## So sánh: MongoDB vs MySQL (InnoDB) Clustered Index

```
┌──────────────────┬──────────────────────┬──────────────────────┐
│ Đặc điểm         │ MongoDB WiredTiger   │ MySQL InnoDB         │
├──────────────────┼──────────────────────┼──────────────────────┤
│ Default key      │ ObjectId (12 bytes)  │ AUTO_INCREMENT INT   │
│ Clustered by     │ _id (opt-in v5.3+)   │ PRIMARY KEY (always) │
│ Secondary index  │ → RecordID (8 bytes) │ → Primary key        │
│ Double lookup?   │ Yes (default)        │ Yes (secondary)      │
│ Schema           │ Flexible (schemaless)│ Fixed (DDL required) │
│ ACID             │ Yes (WiredTiger)     │ Yes (InnoDB)         │
│ Horizontal scale │ Built-in sharding    │ External (Vitess)    │
└──────────────────┴──────────────────────┴──────────────────────┘
```

---

## Khi nào dùng MongoDB?

```
✅ Dùng MongoDB khi:
  - Schema thay đổi thường xuyên (startup, prototyping)
  - Dữ liệu dạng document (hierarchical, nested)
  - Cần horizontal scaling built-in
  - Write-heavy với flexible schema
  - Geospatial queries

❌ Tránh MongoDB khi:
  - Cần complex JOIN queries (SQL tốt hơn nhiều)
  - Strong ACID transactions (PostgreSQL tốt hơn)
  - Reporting & analytics (column-store tốt hơn)
  - Team quen với SQL
```

---

**Tiếp theo:** 02-memcached-architecture.md →
