# Bài 4: Bloom Filters và UUID Performance

## Phần 1: Bloom Filters

### Vấn đề cần giải quyết

Bạn xây dựng tính năng kiểm tra username có tồn tại chưa. Mỗi khi user gõ username, app gửi request đến server để check.

**Cách thông thường:**
```
Client: "Có username 'john123' không?"
Server: SELECT * FROM users WHERE username = 'john123';
→ Đọc từ disk mỗi lần
→ Chậm khi có hàng triệu request
```

**Cải thiện với Redis cache:**
```
Client → Redis → Cache hit? Trả về ngay
              → Cache miss? Đọc database → Lưu vào cache
→ Tốt hơn, nhưng phải dùng RAM cho tất cả usernames
→ Tốn memory gấp đôi (database + cache)
```

**Giải pháp tốt hơn: Bloom Filter**

---

### Bloom Filter là gì?

Bloom Filter là một cấu trúc dữ liệu **probabilistic** (xác suất):
- Chiếm rất ít memory (64 bits, 1KB, tùy cấu hình)
- Có thể trả lời: "**Chắc chắn không tồn tại**" hoặc "**Có thể tồn tại**"
- Không bao giờ **false negative** (nếu nó nói không tồn tại → thật sự không tồn tại)
- Có thể có **false positive** (nếu nó nói có thể tồn tại → có thể sai)

### Cách hoạt động

```
Bloom Filter = 1 mảng bit (ví dụ 64 bit):
[0,0,0,1,0,0,0,0,0,0,0,0,...,0,0,0,1]
 ↑                  ↑                ↑
bit 0             bit 3           bit 63

Thêm username "jack":
  hash("jack") % 64 = 63  → set bit[63] = 1

Thêm username "paul":
  hash("paul") % 64 = 3   → set bit[3] = 1

Thêm username "ali":
  hash("ali") % 64 = 4    → set bit[4] = 1
```

**Kiểm tra username "paul" tồn tại không?**
```
hash("paul") % 64 = 3
bit[3] = 1 → "Có thể tồn tại" → Đi kiểm tra database

hash("john") % 64 = 7
bit[7] = 0 → "Chắc chắn không tồn tại" → Không cần hỏi database!
```

### False Positive: Khi nào xảy ra?

```
Ví dụ: "tim" và "jack" cùng hash ra bit 63
  hash("jack") % 64 = 63
  hash("tim")  % 64 = 63  ← collision!
  
  Bây giờ bit[63] = 1 (vì jack đã set)
  
  Kiểm tra "tim": bit[63] = 1 → "Có thể tồn tại"
  → Nhưng "tim" thực ra CHƯA được thêm vào!
  → False positive!
```

**Tác hại của false positive:**
- Database sẽ được query không cần thiết
- Nhưng không sai kết quả cuối cùng (database sẽ confirm không tồn tại)

### Implementation thực tế

```python
import hashlib

class BloomFilter:
    def __init__(self, size=64):
        self.size = size
        self.bits = 0  # 64-bit integer
    
    def _hash(self, item):
        h = int(hashlib.md5(item.encode()).hexdigest(), 16)
        return h % self.size
    
    def add(self, item):
        bit_pos = self._hash(item)
        self.bits |= (1 << bit_pos)
    
    def might_contain(self, item):
        bit_pos = self._hash(item)
        return bool(self.bits & (1 << bit_pos))

# Sử dụng
bf = BloomFilter(64)
bf.add("jack")
bf.add("paul")
bf.add("ali")

print(bf.might_contain("jack"))   # True → query database
print(bf.might_contain("john"))   # False → skip database!
print(bf.might_contain("tim"))    # True (false positive) → query database (harmless)
```

### Bloom Filter trong Production

**Cassandra** dùng Bloom Filter để giảm disk I/O:
```
Cassandra architecture:
  SSTable 1, SSTable 2, SSTable 3, ...
  
  Khi query key K:
    Bloom Filter check: "K có trong SSTable 1?"
    → "Chắc chắn không" → Skip SSTable 1
    → "Có thể có" → Đọc SSTable 2
    
  Tiết kiệm 80-90% disk reads không cần thiết
```

**PostgreSQL** có extension `pg_trgm` dùng Bloom Filter cho text search.

---

## Phần 2: UUID và Hiệu năng B+Tree Index

### UUID v4 là gì?

UUID v4 là unique identifier **hoàn toàn random**:
```
"a1b2c3d4-e5f6-7890-abcd-ef1234567890"
"9f8e7d6c-5b4a-3210-fedc-ba9876543210"

Không có thứ tự → Mỗi UUID insert vào một vị trí random trong index
```

### Tại sao UUID v4 gây vấn đề với Index?

**B+Tree Index yêu cầu dữ liệu được sắp xếp có thứ tự:**

```
Leaf pages của B+Tree phải ordered:
[10, 20] → [30, 40] → [50, 60] → [70, 80]
  page 0       page 1      page 2      page 3

Insert sequential: 10, 20, 30 → Luôn thêm vào cuối → NHANH
Insert random: 55, 10, 80, 25, 70 → Phải chen vào giữa → PAGE SPLIT!
```

**Page Split là gì và tại sao tệ?**

```
Trước khi insert UUID "35":
[10, 80] ← page 0 đầy rồi

Insert "35":
  35 cần nằm giữa 10 và 80
  Page 0 đầy → PAGE SPLIT!
  
  Page 0: [10, 35]
  Page 1: [80]
  
  Phải:
  1. Đọc page 0 từ disk
  2. Tạo page mới (page 1)
  3. Di chuyển 80 sang page 1
  4. Update references trong B-Tree
  5. Ghi cả hai pages xuống disk
  
  → 2 I/O reads + 2 I/O writes + tree rebalancing!
```

**Với 1 triệu random UUID inserts:**
```
~500,000 page splits
→ Hàng triệu I/O operations không cần thiết
→ Index bị fragmented
→ B-Tree buffer pool bị thrashing (liên tục load/unload pages)
```

### Sequential vs Random Insert - Demo

```
Sequential inserts (1, 2, 3, 4, 5, 6, 7, 8):
   [1,2] → [3,4] → [5,6] → [7,8]
    p0        p1      p2      p3
   
   Mỗi insert: append vào cuối → ZERO page splits!
   Buffer pool: chỉ cần giữ tail pages trong memory

Random inserts (10, 90, 80, 45, 70, 60):
   [10,90]    insert 80→    [10,80] [90]    insert 45→    [10,45] [80,90]
   Split!                   Split again!                  Keep splitting...
   
   Phải load nhiều pages khác nhau vào memory
   → Memory thrashing, disk I/O tăng vọt
```

### Giải pháp: Dùng Ordered ID thay UUID v4

**Option 1: SERIAL / BIGSERIAL (Sequential Integer)**
```sql
CREATE TABLE orders (
    id BIGSERIAL PRIMARY KEY,  -- 1, 2, 3, 4, ... (sequential)
    customer_id INTEGER,
    ...
);
```

**Option 2: ULID (Universally Unique Lexicographically Sortable Identifier)**
```
ULID = Time prefix + Random suffix
01ARZ3NDEKTSV4RRFFQ69G5FAV

Các ULIDs tạo cùng giây:
01ARZ3NDEKTSV4RRFFQ69G5FAV
01ARZ3NDEKTSV4RRFFQ69G5FAW
01ARZ3NDEKTSV4RRFFQ69G5FAX

→ Lexicographically sortable → giảm page splits!
```

**Option 3: UUID v7 (Time-ordered)**
```
UUID v7 = Timestamp + Random
018be0d5-2e43-7c4f-8b6d-5e1234567890
         ↑ timestamp embedded

→ Roughly sequential → ít page splits hơn UUID v4
```

### Case Study: Shopify

Shopify từng dùng UUID v4 cho purchase orders:
- Mỗi purchase = 1 UUID v4 random
- Hàng nghìn purchases mỗi phút → hàng nghìn random inserts vào index

**Vấn đề:** Purchases xảy ra cùng lúc (time-clustered), nhưng UUID random → Buffer pool thrashing

**Giải pháp:** Chuyển sang ULID
- Purchases cùng phút → ULIDs similar → Pages liền kề nhau
- Writes cải thiện đáng kể
- Reads cũng cải thiện (locality of reference)

---

## Khi nào UUID v4 KHÔNG vấn đề?

```
1. Bảng không có index trên UUID column:
   → Không có B-Tree → Không page split
   
2. PostgreSQL với UUID column không phải PK:
   → Postgres heap không có clustering
   → Không ảnh hưởng table structure
   → CHỈ ảnh hưởng nếu bạn tạo index trên UUID column

3. Bảng ít writes, nhiều reads với random access:
   → UUID không tệ hơn sequential cho random reads

4. UUID dùng làm distributed system identifier
   (không phải primary index key):
   → OK nếu index chính là sequential
```

---

## Tổng kết

| | Bloom Filter | UUID v4 trong Index |
|---|---|---|
| **Vấn đề giải quyết** | Tránh unnecessary DB queries | - |
| **Vấn đề gây ra** | False positives (minor) | Page splits, I/O thrashing |
| **Use case** | Check existence at scale | - |
| **Thay thế** | - | ULID, UUID v7, BIGSERIAL |

---

**Tiếp theo:** 05-create-index-concurrently-va-best-practices.md →
