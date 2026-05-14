# Bài 1: SQL vs NoSQL và Kiến Trúc Nội Bộ MongoDB

## Giới thiệu

Câu hỏi "SQL hay NoSQL?" thường được trả lời nông cạn. Bài này đi sâu vào **tại sao NoSQL xuất hiện**, kiến trúc thực sự của MongoDB qua các phiên bản, và khi nào nên dùng cái gì.

---

## 1. Hai Thành Phần Của Mọi Database

Bất kỳ database nào cũng có 2 phần tách biệt:

```
┌──────────────────────────────────────────┐
│           DATABASE SYSTEM                │
├──────────────────────────────────────────┤
│  FRONT-END (API Layer)                   │
│  - Ngôn ngữ query: SQL, MongoDB Wire     │
│    Protocol, Redis RESP                  │
│  - Data format cho user: rows/columns,   │
│    JSON documents, key-value             │
│  - Query parser, optimizer               │
├──────────────────────────────────────────┤
│  STORAGE ENGINE (Backend)                │
│  - Cách lưu bytes lên disk               │
│  - Index structures (B-Tree, LSM)        │
│  - Page management, compression          │
│  - Transaction management, WAL           │
│  - Buffer pool, caching                  │
└──────────────────────────────────────────┘

Storage engine KHÔNG BIẾT bạn lưu gì.
Nó chỉ biết: "Đây là bytes, lưu vào page X"
```

---

## 2. Sự Khác Biệt Thực Sự Giữa SQL và NoSQL

Nhiều người nghĩ NoSQL = "không có SQL, khác hoàn toàn". Thực ra:

```
SQL Database:
  Front-end: SQL language + Table/row/column format
  Storage: B-Tree pages, rows stored next to each other

NoSQL Databases:
  Front-end: Custom API + Different data formats
              ├─ Document DB: JSON documents (MongoDB)
              ├─ Key-Value: get/set (Redis, Memcached)
              ├─ Graph DB: nodes/edges (Neo4j)
              └─ Wide-column: column families (Cassandra)
  Storage: Vẫn là bytes trong pages! (B-Tree, LSM...)

→ Sự khác biệt chính là FRONT-END (API + data format)
→ Storage engine thường tương tự nhau
```

**Tại sao NoSQL ra đời?**

```
Web 2.0 era (2000s):
  - JSON trở nên phổ biến với REST APIs
  - Developer muốn: "Tôi có object JSON, chỉ cần lưu nó"
  - Không muốn: schema cứng, ALTER TABLE, JOIN
  - Scale requirement: horizontal sharding đơn giản hơn

Phong trào "No SQL":
  - "No More SQL" → Không còn relational model
  - Sau đó đổi ý: "Not Only SQL" (vẫn có SQL variant)
  
MongoDB ra đời (2009):
  - Lưu BSON (Binary JSON) trực tiếp
  - Schemaless: document có thể có fields khác nhau
  - Horizontal scaling built-in (sharding)
  - Không cần schema migration!
```

---

## 3. Kiến Trúc MongoDB: Lịch Sử Qua Các Phiên Bản

### V1: MMAP Engine (Trước MongoDB 3.0)

```
Kiến trúc:
  - Data files chứa documents nối tiếp nhau
  - Index: B-Tree → Disk Location (file + offset)

Disk Location = [32-bit file number] + [32-bit offset]
→ 64-bit total → Biết chính xác document ở đâu trên disk

Ví dụ tìm document:
  1. Traverse B-Tree bằng _id
  2. Tìm disk location: file=2, offset=4096
  3. OS: "Đọc file #2 từ byte 4096"
  4. Trả về document

Ưu điểm:
  ✅ Đơn giản, 1 lookup

Nhược điểm:
  ❌ Update document dài hơn → offset tất cả documents sau đó bị sai
  ❌ Locking: Global lock → Collection lock (còn chậm)
  ❌ Không có compression
```

### V2: WiredTiger Engine (MongoDB 3.0+, 2015)

MongoDB mua lại WiredTiger storage engine - một quyết định mang tính game-changing.

```
Kiến trúc WiredTiger:
  - Hidden B+Tree index (key = RecordID 64-bit)
  - Document lưu tại leaf pages của Hidden index
  - _id index → RecordID → Hidden index → Document

Tìm document bằng _id:
  1. Traverse _id B+Tree → Tìm RecordID
  2. Traverse Hidden B+Tree bằng RecordID → Document
  → Hai B-tree traversals! (double lookup)

Cải tiến so với MMAP:
  ✅ Document-level locking (thay vì collection-level)
  ✅ Compression (JSON → BSON → compressed)
  ✅ MVCC (Multi-Version Concurrency Control)
  ✅ ACID transactions (từ MongoDB 4.0)

Chi phí:
  ❌ Double B-tree lookup cho mọi _id search
  ❌ Secondary indexes → RecordID (8 bytes) + extra indirection
```

```
WiredTiger Architecture:
                    _id Index (B+Tree)
                   ┌────────────────────┐
                   │ Key: "abc123"       │
                   │ Value: RecordID=42  │  ←── First lookup
                   └────────────────────┘
                              ↓
                   Hidden Index (B+Tree)
                   ┌────────────────────┐
                   │ Key: RecordID=42   │
                   │ Value: {name:...}  │  ←── Second lookup
                   └────────────────────┘
```

### V3: Clustered Collections (MongoDB 5.3+, 2022)

```
Mục tiêu: Loại bỏ double lookup cho _id queries

Kiến trúc mới:
  - Hidden index BIẾN MẤT
  - _id index TRỞ THÀNH clustered index
  - Document lưu trực tiếp tại leaf pages của _id index

Tìm document bằng _id:
  1. Traverse _id B+Tree → Document ngay tại leaf!
  → Chỉ một B-tree traversal!

                _id Clustered Index (B+Tree)
               ┌───────────────────────────────┐
               │ Key: "abc123"                  │
               │ Value: {name: "Alice", ...}    │  ←── Document ngay đây!
               └───────────────────────────────┘
```

**Tương đồng với MySQL InnoDB:**

```
MySQL InnoDB (mọi version):
  Primary key = Clustered index
  Data sống trong leaf pages của primary key

MongoDB Clustered Collections:
  _id = Clustered index
  Data sống trong leaf pages của _id
  → Giống nhau!
```

---

## 4. Clustered Collections - Chi Tiết

### Lợi ích

```
1. Single B-tree traversal cho _id lookup
   → Từ O(2 log N) → O(log N)

2. Range queries trên _id hiệu quả hơn
   ObjectId có timestamp trong 4 bytes đầu
   → _id tự động sorted by time
   → "Tìm documents từ ngày X đến ngày Y" = range scan trên index!

3. Fewer I/O pages:
   Documents cùng _id range được lưu gần nhau (co-located)
   → 1 page read có thể trả về nhiều documents liên quan

4. Storage nhỏ hơn:
   Không còn hidden index riêng biệt
   → Giảm overhead
```

### Tạo Clustered Collection

```javascript
// JavaScript/MongoDB Shell
db.createCollection("orders", {
    clusteredIndex: {
        key: { _id: 1 },
        unique: true,
        name: "orders_clustered"
    }
});

// Insert documents
db.orders.insertMany([
    { _id: new ObjectId(), customerId: 1, total: 100 },
    { _id: new ObjectId(), customerId: 2, total: 250 }
]);

// Range query trên _id (= range query trên time!)
const yesterday = new ObjectId(Math.floor(Date.now() / 1000 - 86400).toString(16) + "0000000000000000");
db.orders.find({ _id: { $gte: yesterday } }); // Tất cả orders từ hôm qua
```

### Hạn chế của Clustered Collections

```
1. Chỉ một clustered index per collection
   → Không thể cluster theo field khác

2. Phải chỉ định khi CREATE COLLECTION
   → Không thể convert sau khi tạo

3. Secondary indexes to lớn hơn:
   - Non-clustered: secondary → RecordID (8 bytes)
   - Clustered: secondary → _id key (12 bytes default ObjectId)
   → +4 bytes mỗi entry trong secondary index

4. Nếu dùng UUID làm _id:
   UUID as string = 36 bytes (vs 8 bytes RecordID)
   → Secondary indexes bloat đáng kể!
```

---

## 5. Compression trong WiredTiger

```
Tại sao compression quan trọng với MongoDB?

Document JSON có nhiều field names lặp lại:
  {"name": "Alice", "age": 30, "email": "alice@example.com"}
  {"name": "Bob",   "age": 25, "email": "bob@example.com"}
  {"name": "Carol", "age": 35, "email": "carol@example.com"}
  
  "name", "age", "email" lặp lại trong mọi document!

WiredTiger nén document → Page chứa được nhiều documents hơn
→ 1 I/O lấy được nhiều documents hơn
→ Cache hiệu quả hơn
→ Tổng I/O giảm đáng kể
```

```javascript
// Cấu hình compression trong WiredTiger
db.createCollection("logs", {
    storageEngine: {
        wiredTiger: {
            configString: "block_compressor=snappy"
            // Options: snappy (nhanh), zlib (nén tốt hơn), zstd (cân bằng)
        }
    }
});
```

---

## 6. Khi nào dùng MongoDB vs PostgreSQL?

```
Dùng MongoDB khi:
  ✅ Document structure flexible, schema thay đổi thường xuyên
  ✅ Documents có nested arrays/objects phức tạp
  ✅ Cần scale out ngang (sharding) từ đầu
  ✅ Developer productivity quan trọng hơn query power
  ✅ Use case chính: Tìm documents theo ID hoặc simple queries

Dùng PostgreSQL khi:
  ✅ Data có structure rõ ràng
  ✅ Cần JOIN phức tạp giữa nhiều tables
  ✅ ACID transactions cross-document quan trọng
  ✅ Analytics và aggregations phức tạp
  ✅ Đã familiar với SQL
  ✅ Cần full-text search (PostgreSQL có tích hợp sẵn)

Lưu ý: PostgreSQL có JSONB column type
  → Lưu JSON + Query với operators như MongoDB
  → Best of both worlds trong nhiều trường hợp
```

---

**Tiếp theo:** 02-memcached-va-redis-internals.md →
