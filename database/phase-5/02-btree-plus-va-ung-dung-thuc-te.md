# Bài 2: B+Tree và Ứng dụng trong Database Systems

## B+Tree là gì?

**B+Tree** là phiên bản cải tiến của B-Tree với một thay đổi quan trọng:
- **Internal nodes** (bao gồm root): Chỉ lưu **keys** (không lưu values)
- **Leaf nodes**: Lưu cả **keys và values** (data pointers)
- **Leaf nodes** được **liên kết với nhau** (doubly linked list)

---

## Cấu trúc B+Tree

```
B+Tree (degree 3, ví dụ nhỏ):

Internal nodes (chỉ lưu keys):
              [5]
             /   \
          [3]    [7, 9]

Leaf nodes (lưu keys + values, được liên kết):
[1,val1] ↔ [2,val2] ↔ [3,val3] ↔ [4,val4] ↔ [5,val5] ↔ [6,val6] ↔ ...

Lưu ý: Leaf nodes tạo thành một linked list có thứ tự!
```

### Ví dụ thực tế hơn

```
Index trên column "grade" (0-100):

Internal Node (root):
  [50]                    ← Chỉ key, không có value

Internal Nodes (level 2):
  [25]  [75]              ← Chỉ keys

Leaf Nodes (lưu key + pointer to heap row):
[1→p1] [2→p2] ... [25→p25] ↔ [26→p26] ... [50→p50] ↔ [51→p51] ... [100→p100]
   ↑                               ↑                          ↑
   Linked!                         Linked!                    Linked!
```

---

## Tại sao B+Tree tốt hơn?

### 1. Internal Nodes nhỏ gọn hơn → Fit trong memory

```
B-Tree node (lưu key + value):
  [key=50, value=ptr_64bit] = 4+8 = 12 bytes per element
  Elements per page = 8192 / 12 = 682 elements

B+Tree internal node (chỉ lưu key):
  [key=50] = 4 bytes per element
  Elements per page = 8192 / 4 = 2048 elements!

→ B+Tree internal nodes chứa nhiều keys hơn gấp 3 lần
→ Tree ít sâu hơn → Cần ít I/O hơn
→ Dễ fit internal nodes vào memory hơn
```

### 2. Range Queries siêu nhanh

```
B-Tree range query (id BETWEEN 4 AND 9):
  Tìm 4: Root → Node A → 4 ✓ (lấy value)
  Tìm 5: Root → Node B → 5 ✓ (lấy value)
  Tìm 6: Root → Node B → 6 ✓ (lấy value)
  Tìm 7: Root → Node C → 7 ✓ ...
  → Phải traverse từ root cho MỖI key!

B+Tree range query (id BETWEEN 4 AND 9):
  Tìm 4: Root → Internal → Leaf[4] ✓
  Sau đó: Đi theo linked list!
  Leaf[4] → Leaf[5] → Leaf[6] → Leaf[7] → Leaf[8] → Leaf[9]
  → Chỉ cần traverse từ root MỘT LẦN, còn lại follow linked list!
```

### 3. Ví dụ cụ thể: Tìm rows với id BETWEEN 4 và 9

```
B+Tree (degree 3, ví dụ):

            [5]
           /   \
        [3, 4]  [7, 9]

Leaf layer (linked):
[1→p1] ↔ [2→p2] ↔ [3→p3] ↔ [4→p4] ↔ [5→p5] ↔ [6→p6] ↔ [7→p7] ↔ [8→p8] ↔ [9→p9]

Query: WHERE id BETWEEN 4 AND 9

Step 1: Traverse từ root, tìm id=4
        Root[5]: 4<5 → đi trái → Node[3,4] → 4≥4 → đi phải → Leaf chứa 4
Step 2: Tìm thấy id=4 trong leaf, lấy value (pointer đến heap)
Step 3: Theo linked list sang phải: id=5, 6, 7, 8, 9
Step 4: Khi gặp id=10 > 9, dừng lại

Tất cả id 4-9 nằm liền kề trong leaf layer → 
Có thể đọc trong 1-2 I/O operations!
```

---

## B+Tree trong Production Databases

### PostgreSQL

```
PostgreSQL sử dụng B+Tree cho tất cả indexes (trừ GIST, GIN, Hash):

Đặc điểm PostgreSQL B+Tree:
  - Secondary indexes trỏ đến ctid (tuple id = page + offset)
  - Leaf nodes chứa: key + ctid
  - KHÔNG có clustered index (heap không được sort)
  - Tất cả indexes đều là "secondary" trong PostgreSQL
  
Kết quả:
  - UPDATE 1 row → Tất cả indexes phải cập nhật ctid mới
  - Ít overhead hơn khi traverse (vì không phải maintain order của heap)
```

### MySQL (InnoDB)

```
InnoDB sử dụng B+Tree với Clustered Index:

Primary Key Index (Clustered):
  - Leaf nodes chứa: PK key + TOÀN BỘ ROW DATA
  - Table được sort theo PK
  - Index organized table (IOT)

Secondary Key Index:
  - Leaf nodes chứa: secondary_key + PRIMARY KEY value
  - KHÔNG phải ctid, mà là PK value
  - Để lấy full row: secondary index → PK → primary index (2 hops!)
  
Kết quả:
  - PK lookup: siêu nhanh (data ở leaf của primary index)
  - Secondary index: cần 2 traversals
  - Nếu PK là UUID: tất cả secondary indexes chứa 16-byte UUID → Bloat!
```

### MongoDB (WiredTiger)

```
WiredTiger engine dùng B+Tree:
  - Đặc biệt: KHÔNG có leaf pointer (linked list giữa leaf nodes)
  - Thiết kế này vì MongoDB ít dùng range queries trên _id
  - Tiết kiệm space và overhead của maintaining linked list
```

---

## So sánh: PostgreSQL vs MySQL cho Secondary Index

```
Ví dụ: Bảng orders với PK là UUID, index trên email

PostgreSQL secondary index (email):
  Leaf node: [email="john@..." → ctid=(page=123, row=4)]
  ctid = 6 bytes → nhỏ, hiệu quả

MySQL (InnoDB) secondary index (email):
  Leaf node: [email="john@..." → PK="a1b2c3d4-e5f6-7890-abcd-ef12"]
  PK = 16 bytes (UUID) → lớn, bloat!
  
Với 10 secondary indexes trên bảng orders:
  PostgreSQL: Mỗi secondary index leaf = email + 6 bytes
  MySQL:      Mỗi secondary index leaf = email + 16 bytes (UUID)
  
→ MySQL secondary indexes lớn gấp 2-3x
→ Không fit memory → Nhiều disk I/O hơn
```

**Đây là một trong những lý do Uber chuyển từ PostgreSQL sang MySQL** (counter-intuitive, nhưng Uber có workload đặc biệt).

---

## Tác động của Key Type lên B+Tree Performance

### Leaf Node kích thước

```
Index trên INTEGER (4 bytes):
  Leaf element = 4 + 6 = 10 bytes
  Elements per leaf page = 8192 / 10 ≈ 819 elements per page

Index trên UUID (16 bytes):
  Leaf element = 16 + 6 = 22 bytes
  Elements per leaf page = 8192 / 22 ≈ 372 elements per page
  
→ UUID index cần nhiều pages hơn gấp 2.2x
→ Tree sâu hơn → Nhiều I/O hơn → Chậm hơn
```

### Internal Node kích thước (B+Tree vs B-Tree)

```
B-Tree internal node với UUID key:
  Element = 16 (key) + 8 (value) = 24 bytes
  Elements per internal page = 8192 / 24 = 341

B+Tree internal node với UUID key:
  Element = 16 (key only) = 16 bytes  
  Elements per internal page = 8192 / 16 = 512
  
→ B+Tree vẫn tốt hơn 50% ngay cả với UUID keys
→ Nhưng INTEGER vẫn là tốt nhất: 8192/4 = 2048 elements per page!
```

---

## Best Practices dựa trên B+Tree

### 1. Chọn key type phù hợp

```
Priority:
  BEST: BIGINT SERIAL (8 bytes, sequential) → ~1024 keys/page
  GOOD: INT SERIAL (4 bytes, sequential)    → ~2048 keys/page
  BAD:  UUID v4 (16 bytes, random)          → ~512 keys/page + page splits
  OK:   ULID/UUID v7 (16 bytes, ordered)    → ~512 keys/page, ít splits
```

### 2. MySQL: Đặc biệt cẩn thận với PK

```sql
-- ❌ Tệ cho MySQL InnoDB
CREATE TABLE orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ...
);
-- → UUID bloat ảnh hưởng TẤT CẢ secondary indexes!

-- ✅ Tốt cho MySQL InnoDB
CREATE TABLE orders (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    uuid CHAR(36) UNIQUE,  -- UUID cho external API
    ...
);
-- → PK là INT → Secondary indexes nhỏ gọn
```

### 3. Hiểu range queries

```sql
-- B+Tree rất giỏi range queries:
SELECT * FROM orders WHERE created_at BETWEEN '2024-01-01' AND '2024-12-31';
-- → Traverse đến leaf chứa 2024-01-01, follow linked list đến 2024-12-31

-- Không hiệu quả nếu function trên key:
SELECT * FROM orders WHERE YEAR(created_at) = 2024;
-- → YEAR() function → không dùng được B+Tree index!
-- → Full table scan

-- Fix:
SELECT * FROM orders WHERE created_at >= '2024-01-01' AND created_at < '2025-01-01';
-- → Range query → B+Tree hiệu quả
```

---

## Tóm tắt B-Tree vs B+Tree

```
┌─────────────────┬────────────────┬──────────────────┐
│ Đặc điểm        │ B-Tree         │ B+Tree           │
├─────────────────┼────────────────┼──────────────────┤
│ Internal nodes  │ Keys + Values  │ Keys only        │
│ Leaf nodes      │ Keys + Values  │ Keys + Values    │
│ Leaf links      │ Không          │ Có (linked list) │
│ Range queries   │ Chậm           │ Rất nhanh        │
│ Internal node   │ Lớn (keys+val) │ Nhỏ (keys only)  │
│ size            │                │                  │
│ Fit memory      │ Khó hơn        │ Dễ hơn           │
│ Dùng trong DB   │ Hiếm           │ Hầu hết DBMS     │
└─────────────────┴────────────────┴──────────────────┘

Tất cả database hiện đại (PostgreSQL, MySQL, SQL Server, Oracle, MongoDB/WiredTiger)
đều dùng B+Tree (hoặc biến thể của nó).
```

---

**Tiếp theo:** Phase 6 - Database Partitioning →
