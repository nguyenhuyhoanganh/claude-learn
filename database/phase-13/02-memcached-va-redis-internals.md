# Bài 2: Memcached và Redis - Kiến Trúc In-Memory Database

## Giới thiệu

Hai database in-memory phổ biến nhất: Memcached (đơn giản, nhanh, distributed) và Redis (phong phú tính năng, persistent, đa dụng). Bài này so sánh kiến trúc nội bộ của cả hai.

---

## 1. Memcached - Đơn Giản Đến Mức Tối Thượng

### Lịch sử và triết lý

**Memcached** được tạo ra năm 2003 (bởi Brad Fitzpatrick tại LiveJournal), ban đầu viết bằng Perl, sau đó rewrite sang C. Mục tiêu: **giảm tải cho database bằng caching**.

```
Vấn đề web 2003:
  Browser → Web server → Database (chậm, đắt)
  Mỗi request đọc DB = tốn tiền, chậm

Giải pháp Memcached:
  Browser → Web server → Memcached (cache miss?) → Database
                     ↑
                  Cache hit: nhanh, rẻ!
```

Triết lý: **Đơn giản tuyệt đối**. Không có persistence, không có replication, không có rich data types, không có pub/sub. Chỉ có: set, get, delete.

### Kiến trúc Memory Management

Memcached không dùng `malloc/free` thông thường - lý do: **memory fragmentation**.

```
Vấn đề malloc/free:
  malloc(100) → trả về block 100 bytes
  malloc(50)  → trả về block 50 bytes
  free(100)   → block trả lại
  malloc(60)  → KHÔNG VÀO ĐƯỢC block cũ! (60 > 50, hole 100 quá lớn)
  → Memory fragmented!

Sau nhiều giờ chạy:
  Physical memory: nhiều
  Available memory: ít (fragmented holes)
```

**Slab Allocator** - Giải pháp của Memcached:

```
Slab Classes (pre-allocated memory blocks):
  Class 1:  items  ≤   96 bytes
  Class 2:  items  ≤  120 bytes
  Class 3:  items  ≤  152 bytes
  Class 4:  items  ≤  192 bytes
  ...
  Class 42: items  ≤ 1MB

Mỗi Slab Class có nhiều "slabs" (pages 1MB mỗi page):
  Class 1: [slab1: 10922 items][slab2: 10922 items]...
  Class 2: [slab1: 8738 items][slab2: 8738 items]...

Khi lưu item:
  1. Xác định size → Chọn Slab Class phù hợp nhỏ nhất
  2. Lấy slot trống trong slab → Lưu
  3. Khi xóa: slot trở lại "free" list của slab class đó
```

```
Ưu điểm Slab Allocator:
  ✅ Zero fragmentation (mỗi class chỉ chứa items cùng size range)
  ✅ O(1) allocation và deallocation
  ✅ Predictable memory usage

Nhược điểm:
  ❌ Internal fragmentation: item 100 bytes vào Class 1 (96 bytes)
     → Phải dùng Class 2 (120 bytes) → Lãng phí 20 bytes
  ❌ Nếu set slab sizes không phù hợp với data thực tế
     → Một số classes full, một số classes empty
```

### LRU (Least Recently Used) Eviction

Memcached có giới hạn memory. Khi full → phải evict (đuổi) items ra.

```
LRU List mỗi Slab Class:
  [Most Recently Used] ←──── ────→ [Least Recently Used]
  item_new ← item_B ← item_A ← item_old ← item_EVICT

  Khi thêm item mới:
    1. Thêm vào đầu (MRU end)
    2. Nếu memory đầy: Xóa item cuối (LRU end)
    3. Update links khi item được access

Complexity:
  O(1) access: doubly-linked list
  O(1) insert/delete từ bất kỳ vị trí
```

### Distributed Memcached

```
Memcached cluster - KHÔNG có built-in distribution!
Sharding được thực hiện BỞI CLIENT:

Client library (Python, Java, PHP):
  key = "user:123"
  server = hash(key) % num_servers
  → Gửi đến server đúng

3 Memcached servers:
  Server 1: user:1, user:4, user:7 ...
  Server 2: user:2, user:5, user:8 ...
  Server 3: user:3, user:6, user:9 ...

Consistent hashing (tránh re-distribute khi thêm/bớt server):
  Virtual ring → mỗi server "sở hữu" một arc
  key → hash → tìm server trên ring
```

---

## 2. Redis - The Swiss Army Knife

### Redis ra đời như thế nào

**Salvatore Sanfilippo** tạo Redis năm 2009 để giải quyết vấn đề real-time analytics cho startup của mình. Ông cần lưu nhiều loại data structure khác nhau với tốc độ cao.

### Data Structures trong Redis

```
Redis không chỉ là key-value store.
Mỗi value có thể là:

String:       SET user:1:name "Alice"
              GET user:1:name  → "Alice"

Hash:         HSET user:1 name Alice age 30 email alice@x.com
              HGET user:1 name  → "Alice"
              HGETALL user:1    → {name, age, email}

List:         LPUSH queue "task1"  (push left)
              RPUSH queue "task2"  (push right)
              LPOP queue           → "task1"  (pop left)
              → Dùng như queue (FIFO: LPUSH + RPOP)
              → Dùng như stack (LIFO: LPUSH + LPOP)

Set:          SADD online_users "alice" "bob" "carol"
              SISMEMBER online_users "alice"  → 1 (true)
              SUNION set1 set2                → Union của hai sets

Sorted Set:   ZADD leaderboard 1000 "alice"
              ZADD leaderboard 850  "bob"
              ZRANGE leaderboard 0 -1 WITHSCORES
              → [alice:1000, bob:850] (sorted by score)
              → Dùng cho: leaderboard, rate limiting

Bitmap:       SETBIT user:123:active:2024 185 1  (ngày 185 active)
              BITCOUNT user:123:active:2024       → số ngày active

HyperLogLog:  PFADD visitors "user1" "user2" "user1"
              PFCOUNT visitors  → 2 (unique count, approximate)
              → Đếm unique visitors với O(1) memory!

Streams:      XADD events * action "login" userId 123
              XREAD COUNT 10 STREAMS events 0
              → Giống Kafka nhẹ
```

### Kiến trúc Persistence

Redis là in-memory nhưng có persistence options:

```
Option 1: RDB (Redis Database) Snapshots
  - Tại intervals (ví dụ: mỗi 5 phút)
  - Dump toàn bộ dataset vào file .rdb
  - Fast restart: load file .rdb
  - Nhược: Có thể mất data giữa 2 snapshots

  redis.conf:
    save 900 1    # Save sau 900s nếu có ≥1 change
    save 300 10   # Save sau 300s nếu có ≥10 changes
    save 60 10000 # Save sau 60s nếu có ≥10000 changes

Option 2: AOF (Append-Only File)
  - Ghi từng lệnh write vào file log
  - Crash recovery: replay toàn bộ log
  - More durable, nhưng file lớn hơn
  - AOF rewrite: compact log định kỳ

  redis.conf:
    appendonly yes
    appendfsync everysec  # Sync mỗi giây (trade-off: performance vs durability)
    # appendfsync always  # Sync mỗi lệnh (chậm nhất, an toàn nhất)
    # appendfsync no      # Không sync (OS quyết định, nhanh nhất)

Option 3: Không persistence (pure cache)
  - Fastest option
  - Tất cả data mất khi restart
  - Phù hợp: cache layer, session store
```

### Redis Architecture vs Memcached Architecture

```
┌──────────────────┬──────────────────┬──────────────────────┐
│ Tính năng        │ Memcached        │ Redis                │
├──────────────────┼──────────────────┼──────────────────────┤
│ Data types       │ String only      │ 8+ types             │
│ Persistence      │ Không            │ RDB, AOF             │
│ Replication      │ Không native     │ Master-replica       │
│ Cluster          │ Client-side hash │ Redis Cluster        │
│ Pub/Sub          │ Không            │ Có                   │
│ Lua scripting    │ Không            │ Có                   │
│ Transactions     │ Không            │ MULTI/EXEC           │
│ Memory           │ Slab allocator   │ zmalloc (custom)     │
│ Threading        │ Multi-threaded   │ Single-threaded (*)  │
│ Protocol         │ Binary, Text     │ RESP protocol        │
│ Use cases        │ Simple cache     │ Cache, queue, more   │
└──────────────────┴──────────────────┴──────────────────────┘

(*) Redis 6+ có multi-threaded I/O nhưng command execution vẫn single-threaded
```

### Tại sao Redis Single-threaded nhanh?

```
Một thread nhưng cực nhanh vì:

1. Everything in-memory:
   - Không có disk I/O (ngoại trừ persistence)
   - RAM access: ~100ns vs disk ~10ms (100,000x faster)

2. Multiplexed I/O (epoll/kqueue):
   - 1 thread xử lý nhiều connections với event loop
   - Không waste CPU trên thread context switching

3. Simple data structures:
   - Không cần lock/mutex (single-threaded)
   - Lock-free = overhead thấp hơn nhiều

4. Protocol đơn giản (RESP):
   - Dễ parse
   - Compact

Benchmark:
  Redis 6: ~1,000,000 ops/second trên 1 server
  Phần lớn latency là network, không phải processing
```

### Redis Use Cases Thực Tế

```
1. Session Storage:
   SET session:abc123 '{"userId":1,"cart":[...]}' EX 3600
   GET session:abc123
   → Faster than database, auto-expire

2. Rate Limiting:
   INCR ratelimit:user:123:2024-01-15-14:30
   EXPIRE ratelimit:user:123:2024-01-15-14:30 60
   → Max 100 requests/minute

3. Leaderboard:
   ZADD game:leaderboard 9500 "player1"
   ZADD game:leaderboard 8200 "player2"
   ZREVRANGE game:leaderboard 0 9 WITHSCORES
   → Top 10 players

4. Pub/Sub:
   SUBSCRIBE news:sports
   PUBLISH news:sports "Team X won!"
   → Real-time notifications

5. Job Queue (Redis Streams):
   XADD jobs * type email to alice@x.com subject "Hello"
   XREADGROUP GROUP workers consumer1 COUNT 1 STREAMS jobs >
   → Distributed job processing

6. Caching với TTL:
   SET product:123 '{"name":"...", "price":99.99}' EX 300
   → Cache 5 phút, auto expire
```

---

## 3. Khi Nào Dùng Memcached vs Redis?

```
Dùng Memcached khi:
  ✅ Chỉ cần simple key-value cache
  ✅ Cần multi-threaded (CPU-bound caching)
  ✅ Memory usage quan trọng (slab allocator ít overhead hơn)
  ✅ Team đã quen với Memcached

Dùng Redis khi:
  ✅ Cần nhiều data types (sorted sets, lists, etc.)
  ✅ Cần persistence (RDB/AOF)
  ✅ Cần pub/sub, streams
  ✅ Cần Lua scripting
  ✅ Replication và failover built-in
  ✅ Hầu hết production use cases hiện đại

Thực tế: Redis gần như thay thế hoàn toàn Memcached
trong các hệ thống mới.
```

---

**Tiếp theo:** 03-cap-theorem.md →
