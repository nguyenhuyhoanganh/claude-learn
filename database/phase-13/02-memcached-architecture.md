# Bài 2: Kiến trúc Memcached

## Memcached là gì?

**Memcached** = In-memory key-value store, viết bằng C, ra đời năm 2003 bởi Brad Fitzpatrick (cho LiveJournal).

```
Thiết kế triết lý:
  "Simple. Fast. Do one thing well."
  
  - Key: String, tối đa 250 ký tự
  - Value: Bất kỳ loại dữ liệu, tối đa 1 MB
  - TTL: Có hỗ trợ, nhưng không đảm bảo 100%
  - Persistence: Không có (in-memory only)
  - Security: Không có mặc định (thêm SASL/TLS nếu cần)

Dùng bởi: Facebook, Netflix, Wikipedia
```

---

## Memory Management: Slab Allocator

### Vấn đề: Memory Fragmentation

```
Cách naïve: malloc()/free() trực tiếp

  Insert "hello" → Allocated tại 0x100
  Insert "world" → Allocated tại 0x110
  Delete "hello" → Free space tại 0x100
  Insert "a very long string" → Không vừa vào gap!

         [   gap   ][world][        empty         ]
  
  → Memory fragmentation!
  → Có free space nhưng không dùng được
```

### Giải pháp: Slab Allocator

```
Memcached dùng slab allocator:

1. Pages:
   - Unit cơ bản = 1 MB (một lần)
   - Khi cần memory, allocate cả page 1 MB

2. Slab Classes:
   - Mỗi slab class có chunk size cố định
   - Slab Class 1: Chunk size = 72 bytes
   - Slab Class 2: Chunk size = 90 bytes
   - Slab Class 3: Chunk size = 112 bytes
   - ...
   - Slab Class 42: Chunk size = 1 MB

3. Chunks:
   - Mỗi page chia thành chunks bằng nhau
   - 1 MB page, 72 byte chunks → 14,563 chunks per page

Ví dụ:
  Slab Class 1 (72 bytes/chunk):
  ┌──┬──┬──┬──┬──┬──┬──┬──┬──┬──┐
  │C1│C2│C3│C4│C5│C6│C7│C8│C9│..│  ← 14,563 chunks/page
  └──┴──┴──┴──┴──┴──┴──┴──┴──┴──┘
  
  Slab Class 42 (1 MB/chunk):
  ┌────────────────────────────────┐
  │           1 Chunk = 1 MB      │  ← 1 chunk per page
  └────────────────────────────────┘
```

### Lưu item vào chunk

```
Item 40 bytes → Slab Class 1 (72 bytes):
  ┌──────────────────────┐
  │ item (40B) | waste   │  ← 32 bytes bị lãng phí
  └──────────────────────┘
  
  Giá phải trả: Internal fragmentation (lãng phí trong chunk)
  Lợi ích: Không có external fragmentation!

Item 900 KB → Slab Class 42 (1 MB):
  ┌────────────────────────────────┐
  │ item (900KB) | 124KB waste    │
  └────────────────────────────────┘
```

---

## LRU - Least Recently Used

### Tại sao cần LRU?

```
Memory của memcached là giới hạn.
Khi memory đầy → Cần xóa bỏ items ít dùng nhất.

→ Đây là lý do memcached là "transient cache":
  "Không bao giờ rely vào key sẽ luôn tồn tại"
  
Dù bạn set TTL = 1 giờ, nếu memory đầy, key có thể bị xóa!
```

### Cấu trúc LRU

```
LRU dùng Doubly Linked List:

HEAD ←→ [item D] ←→ [item C] ←→ [item B] ←→ [item A] ←→ TAIL
(most recently used)                        (least recently used)

Quy tắc:
  - Access một item → Pop khỏi vị trí hiện tại → Đặt lên HEAD
  - Memory đầy → Xóa item ở TAIL
  - Mỗi slab class có LRU riêng
```

```
Ví dụ:
  Initial: HEAD ←→ D ←→ C ←→ B ←→ A ←→ TAIL
  
  Access B:
  HEAD ←→ B ←→ D ←→ C ←→ A ←→ TAIL
  (B moved to head)
  
  Memory full, insert new item E:
  HEAD ←→ E ←→ B ←→ D ←→ C ←→ TAIL
  (A evicted from tail)
```

### Chi phí của LRU

```
Vấn đề với Multi-threaded + LRU:

  Thread 1 reads key "foo" → Cần update LRU → Phải lock!
  Thread 2 reads key "bar" → Cần update LRU → Phải lock!
  
  Cả 2 threads SERIALIZE vì phải update cùng LRU linked list!

Cải tiến:
  Cũ: 1 global lock → Toàn bộ bị serialize
  Mới: Per-item lock + per-slab-class LRU lock
      → Threads chỉ conflict nếu access cùng slab class
```

---

## Threading Model

```
Memcached architecture:

  ┌─────────────────────────────────────────────┐
  │              Listener Thread                 │
  │  Listens on TCP port 11211                   │
  │  Accepts incoming connections                 │
  │  Dispatches each connection to a worker      │
  └─────────────────────────────────────────────┘
            │
  ┌─────────┼─────────────────────┐
  │         │                     │
  ▼         ▼                     ▼
Worker T1  Worker T2  ...   Worker Tn
  │         │                     │
 Conn1    Conn2               ConnN

  - Mỗi connection được assign cho 1 worker thread
  - Worker thread handles tất cả requests từ connection đó
  - Shared memory: Hash table + LRU → Cần locks
```

---

## Hash Table - Tìm kiếm item

```
Cách tìm item theo key:

  hash("foo") % N → Index 247 trong hash table
                         │
                         ▼
                  [pointer to chunk]
                         │
                         ▼
              [Slab Class X, Page Y, Chunk Z]
              {key: "foo", value: "bar"}

→ O(1) lookup (+ hash computation)
```

### Collision trong Hash Table

```
hash("foo") % N = 247
hash("nanny") % N = 247  ← Collision!

Giải pháp: Chaining (linked list trong bucket)

  Index 247: → [foo → "bar"] → [nanny → "val"] → NULL

Tìm "nanny":
  1. hash("nanny") → 247
  2. Go to bucket 247
  3. Check first item: key = "foo"? No
  4. Check next: key = "nanny"? Yes! Return value
  
→ Worst case O(n) nếu nhiều collisions
→ Khi load factor cao → Resize hash table (expensive!)
```

---

## Distributed Cache: Phân tán ở Client

```
Đặc điểm quan trọng: Memcached servers KHÔNG biết về nhau!

  Server M1 (port 11211) ─ ─ ─ ─  Chúng không
  Server M2 (port 11212) ─ ─ ─ ─  communicate
  Server M3 (port 11213) ─ ─ ─ ─  với nhau!

Client chịu trách nhiệm phân tán:
  - Client biết tất cả servers
  - Dùng consistent hashing để quyết định key → server
  - "key foo" → hash → server M2
  - "key bar" → hash → server M3
```

```javascript
// Node.js với memcached client (consistent hashing built-in)
const Memcached = require('memcached');

// Client tự quản lý phân tán!
const client = new Memcached([
    'localhost:11211',
    'localhost:11212',
    'localhost:11213'
]);

// Set: client tự quyết định key đi đến server nào
client.set('foo', 'bar', 3600, (err) => {});

// Get: client hash key → tìm đúng server → fetch
client.get('foo', (err, data) => {
    console.log(data);  // 'bar'
});
```

### Demo: Keys phân tán

```
Sau khi set 10 keys (foo0...foo9) với 3 servers:

Telnet đến server M1 (11211):
  get foo1 → "bar1"   ← Có ở đây
  get foo2 → NOT FOUND
  
Telnet đến server M2 (11212):
  get foo5 → "bar5"   ← Có ở đây
  
Telnet đến server M3 (11213):
  get foo2 → "bar2"   ← Có ở đây

→ Keys được phân tán bởi client, không phải server!
```

---

## Giao tiếp với Memcached: Telnet Protocol

```bash
# Kết nối
telnet localhost 11211

# Set key
set foo 0 3600 3
bar
# → STORED

# Get key
get foo
# → VALUE foo 0 3
# → bar
# → END

# Delete key
delete foo
# → DELETED

# Stats
stats
# → STAT version 1.6.x
# → STAT curr_connections 5
# → STAT cmd_get 10
# → STAT cmd_set 5
# → STAT evictions 0
# → ...

# Stats về slabs
stats slabs
# → STAT 1:chunk_size 96
# → STAT 1:chunks_per_page 10922
# → STAT 1:total_pages 1
# → STAT 1:used_chunks 1
# → ...
```

---

## So sánh Memcached vs Redis

```
┌──────────────────┬──────────────────────┬──────────────────────┐
│ Đặc điểm         │ Memcached            │ Redis                │
├──────────────────┼──────────────────────┼──────────────────────┤
│ Data types       │ String only          │ String, List, Set,   │
│                  │                      │ Hash, ZSet, etc.     │
│ Value max size   │ 1 MB                 │ 512 MB               │
│ Key max size     │ 250 chars            │ 512 MB               │
│ Persistence      │ Không               │ Có (RDB/AOF)         │
│ Pub/Sub          │ Không               │ Có                   │
│ Transactions     │ Không               │ Có (MULTI/EXEC)      │
│ Lua scripting    │ Không               │ Có                   │
│ Clustering       │ Client-side         │ Redis Cluster        │
│ Replication      │ Không               │ Master-Replica       │
│ Threading        │ Multi-threaded      │ Single-threaded      │
│ Memory model     │ Slab allocator      │ jemalloc             │
│ LRU eviction     │ Có (per slab)       │ Có (global)          │
└──────────────────┴──────────────────────┴──────────────────────┘

Kết luận:
  Memcached: Simple, fast, mature, "just a cache"
  Redis:     Feature-rich, cache + DB + message broker
  
  → Redis thường được ưu tiên cho projects mới
  → Memcached vẫn có ở các hệ thống legacy và cần simplicity
```

---

## Khi nào dùng Memcached?

```
✅ Phù hợp:
  - Pure caching use case (không cần persistence)
  - Simple key-value, không cần rich data types
  - Multi-threaded serving quan trọng
  - Đã có sẵn memcached trong stack, không muốn thay đổi
  - Cần giới hạn memory usage chặt chẽ

❌ Không phù hợp:
  - Cần persistence (dùng Redis)
  - Cần pub/sub (dùng Redis)
  - Cần complex data structures (dùng Redis)
  - Cần replication (dùng Redis)
  - Không muốn keys bị evict bất ngờ
```

---

**Tiếp theo:** 03-redis-va-cap-theorem.md →
