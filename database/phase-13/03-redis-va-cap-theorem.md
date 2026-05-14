# Bài 3: Redis Internals và CAP Theorem

## Redis là gì?

**Redis** = Remote Dictionary Server - In-memory key-value store, đồng thời là cache, database và message broker.

```
Bộ ba tính năng làm Redis nổi bật:

1. In-memory Database:
   → Latency < 1ms (submillisecond)
   → Tốc độ nhanh hơn disk-based DB 100-1000x

2. Optional Persistence:
   → Dữ liệu không mất khi restart
   → RDB snapshots hoặc AOF journaling

3. Pub/Sub Message Broker:
   → Channels, publish/subscribe
   → Thay thế lightweight cho Kafka/RabbitMQ

Redis là #1 database trên AWS (2020): 28% market share!
(MySQL: 23%, PostgreSQL: 20%)
```

---

## Single-Threaded Architecture

```
Redis là single-threaded cho mọi operations chính:

  ┌────────────────────────────────────────────┐
  │              Event Loop (1 thread)          │
  │                                             │
  │  Accept connections → Process commands      │
  │  → Return responses → Accept connections... │
  └────────────────────────────────────────────┘
  
  Background threads:
  - AOF/RDB persistence (1 thread)
  - Key expiry (1 thread)

Tại sao single-threaded vẫn nhanh?
  → Không có lock contention (không cần locks!)
  → Context switching overhead = 0
  → In-memory → CPU thường là bottleneck, không phải I/O
  → 1 beefy core > nhiều shared-state threads
```

---

## Data Types của Redis

```
Redis hỗ trợ nhiều kiểu dữ liệu phong phú:

String:    SET key "value"       → Simple values, counters
List:      LPUSH list item       → Queue, stack
Set:       SADD set member       → Unique values, tags
Hash:      HSET hash field val   → Object-like structure
ZSet:      ZADD zset score mem   → Sorted set, leaderboard
Bitmap:    SETBIT key offset 1   → Efficient boolean arrays
HyperLog:  PFADD hll item        → Cardinality estimation
Stream:    XADD stream * k v     → Event sourcing, log
Geo:       GEOADD geo lng lat m  → Geospatial data
```

---

## Persistence: Durability Options

### 1. AOF - Append Only File

```
Cách hoạt động:
  Mỗi write command → Append vào AOF file trên disk
  
  AOF file:
  *3\r\n$3\r\nSET\r\n$3\r\nfoo\r\n$3\r\nbar\r\n
  *2\r\n$3\r\nDEL\r\n$3\r\nbaz\r\n
  ...

Flush options:
  appendfsync always    → Flush to disk mỗi command (slow, safe)
  appendfsync everysec  → Flush mỗi giây (balance)
  appendfsync no        → OS quyết định (fast, risky)

Recovery: Replay AOF file khi restart

Trade-off:
  ✅ Ít mất data nhất (tối đa 1 giây với everysec)
  ❌ File lớn hơn RDB
  ❌ Restart chậm hơn (phải replay tất cả commands)
```

### 2. RDB - Redis Database Snapshot

```
Cách hoạt động:
  Mỗi N giây (hoặc M writes) → Fork process → Snapshot memory → Write to disk
  
  RDB file = Binary snapshot của toàn bộ dataset
  
  Fork + Copy-on-Write:
    Parent process tiếp tục serve requests
    Child process ghi snapshot vào disk
    Nếu parent modify data → Copy-on-write (không ảnh hưởng snapshot)

Trade-off:
  ✅ File nhỏ gọn (compressed binary)
  ✅ Restart nhanh (load binary file)
  ✅ Tốt cho backups
  ❌ Có thể mất data (nếu crash giữa 2 snapshots)
  
Default config:
  save 900 1   → Snapshot nếu 1 change trong 900s
  save 300 10  → Snapshot nếu 10 changes trong 300s
  save 60 10000 → Snapshot nếu 10000 changes trong 60s
```

---

## Pub/Sub Model

```
Redis pub/sub hoạt động trên raw TCP connections:

  Publisher → [PUBLISH channel "message"] → Redis server
                                                 │
                                                 ▼
  Subscriber 1 ← [message pushed] ─────────────┘
  Subscriber 2 ← [message pushed] ─────────────┘

Khi subscribe, connection chuyển sang "push mode":
  - Client không thể gửi thêm commands (chỉ nhận messages)
  - Redis sẽ push messages đến client (không polling)
  - Connection phải maintained (stateful)
```

```bash
# Terminal 1 - Subscriber
redis-cli SUBSCRIBE new_videos
# → 1) "subscribe"
# → 2) "new_videos"
# → 3) (integer) 1
# → (waiting for messages...)

# Terminal 2 - Publisher
redis-cli PUBLISH new_videos "Redis Crash Course uploaded"
# → (integer) 1  ← Số subscribers nhận được

# Terminal 1 nhận được:
# → 1) "message"
# → 2) "new_videos"
# → 3) "Redis Crash Course uploaded"
```

---

## Replication và Clustering

### Replication

```
Redis replication: Master-Replica model

  Master (Writes + Reads)
     │
     ├─→ Replica 1 (Reads only)
     ├─→ Replica 2 (Reads only)
     └─→ Replica 3 (Reads only)

  - Asynchronous replication (eventual consistency)
  - Replicas pull changes từ master
  - Clients read từ replicas để scale reads
```

### Clustering (Redis Cluster)

```
Redis Cluster = Horizontal sharding + Replication

  Cluster có 16,384 hash slots:
  
  Node A: slots 0-5460
    ├─ Replica A1
    └─ Replica A2
    
  Node B: slots 5461-10922
    ├─ Replica B1
    └─ Replica B2
    
  Node C: slots 10923-16383
    ├─ Replica C1
    └─ Replica C2

  key "foo" → hash → slot 7638 → Node B
  key "bar" → hash → slot 2198 → Node A
```

---

## Demo: Redis với Docker

```bash
# Khởi động Redis container
docker run --name redis-demo -p 6379:6379 -d redis

# Connect bằng Redis CLI
docker exec -it redis-demo redis-cli

# Basic operations
SET name "Hussein"    → OK
GET name              → "Hussein"

# Set với expiry (10 giây)
SET temp_key "value" EX 10  → OK
GET temp_key                 → "value"
# (10 giây sau...)
GET temp_key                 → (nil)

# Check if exists
EXISTS name      → (integer) 1
EXISTS unknown   → (integer) 0

# Delete
DEL name         → (integer) 1
EXISTS name      → (integer) 0

# Append
SET name "Hussein"
APPEND name " Nasser"   → (integer) 14
GET name                 → "Hussein Nasser"
```

```bash
# Pub/Sub demo
# Terminal 1:
SUBSCRIBE my-channel
# → waiting...

# Terminal 2:
PUBLISH my-channel "Hello!"
# → (integer) 1

# Terminal 1 receives:
# → 1) "message"
# → 2) "my-channel"
# → 3) "Hello!"
```

---

## CAP Theorem

### Ba thuộc tính

```
C - Consistency (Tính nhất quán khi đọc):
  "Nếu tôi vừa write, mọi read tiếp theo phải thấy giá trị mới"
  
  Ví dụ nhất quán:
    Write balance = 1000 → Read balance từ bất kỳ node → 1000 ✅
  
  Ví dụ không nhất quán:
    Write balance = 1000 → Read từ replica cũ → 900 ❌

A - Availability (Tính sẵn sàng):
  "Mọi request đều nhận được response (dù kết quả có thể cũ)"
  
  Hệ thống có cache: Luôn trả về kết quả (dù có thể stale) ✅
  Hệ thống fail 503: Không có response ❌

P - Partition Tolerance (Chịu lỗi mạng):
  "Hệ thống tiếp tục hoạt động dù có network failures"
  
  Network partition = Các nodes không communicate được với nhau
  
  Single node: P = N/A (không có network giữa nodes)
  Distributed: P luôn phải được tolerate (mạng luôn có thể lỗi)
```

### Định lý CAP

```
"Với hệ thống distributed (P), bạn chỉ có thể chọn C hoặc A, không thể cả hai"

┌─────────────────────────────────────────────────────┐
│                                                     │
│    C ────── Impossible ──────── A                  │
│    │           zone             │                   │
│    │                            │                   │
│    └──────────── P ─────────────┘                  │
│                                                     │
│  CA: Consistent + Available (single node, no dist) │
│  CP: Consistent + Partition-tolerant               │
│  AP: Available + Partition-tolerant                │
└─────────────────────────────────────────────────────┘
```

### Ví dụ: Master + 2 Replicas

```
Scenario: Write vào master, sau đó replica có thể read

AP System (Asynchronous replication):
  Client → Write to master → Master commits → "Success" → Client
                                   │
                     (Background: propagate to replicas)
  
  Nếu client đọc ngay từ replica:
    → Có thể thấy data cũ (inconsistent)
    → Nhưng read luôn succeed (available)
  
  Nếu network fail:
    → Master vẫn available
    → Replicas vẫn available (serve stale data)
  
  → Chọn: Available, nhưng không Consistent

CP System (Synchronous replication):
  Client → Write to master → Sync replicas → All reply "done" → Commit → "Success"
  
  Nếu replica không reply:
    → Transaction fail (hoặc timeout)
    → Client nhận lỗi (unavailable!)
    → Nhưng data luôn consistent khi succeed
  
  → Chọn: Consistent, nhưng không Available khi có failures
```

### Ví dụ thực tế

```
AP Systems (Available + Partition tolerant):
  - Cassandra (eventual consistency)
  - DynamoDB (default: eventual)
  - CouchDB
  - Memcached (stale cache)
  
  Use cases: Shopping cart, social media feeds, DNS
  "Tôi chấp nhận data có thể cũ, miễn là luôn có response"

CP Systems (Consistent + Partition tolerant):
  - HBase
  - Zookeeper
  - MongoDB (với write concern majority)
  - Redis Cluster (trong một số configurations)
  
  Use cases: Banking, inventory, distributed locks
  "Tôi cần đúng 100%, chấp nhận có lúc không available"

CA Systems (Consistent + Available):
  - PostgreSQL (single node)
  - MySQL (single node)
  - SQLite
  
  Use cases: Bất kỳ nơi nào không cần distributed
  "Single node, không partition tolerance"
```

### Consistency trong CAP vs ACID

```
CẢNH BÁO: Đây là 2 khái niệm khác nhau!

Consistency trong ACID:
  → Dữ liệu luôn hợp lệ theo business rules
  → Ví dụ: Unique constraint, Foreign key, Check constraint
  → "Tôi không có orphan records"
  → "Sum của transactions = account balance"

Consistency trong CAP:
  → Read luôn thấy write mới nhất
  → "Nếu tôi write lúc 12:00:00, mọi read sau đó thấy giá trị mới"
  → Về reads, không phải về data validity

Ví dụ:
  ACID consistent: Account balance = tổng transactions ✅
  CAP consistent: Read từ replica thấy write vừa xong ✅/❌
  
  Một hệ thống có thể ACID consistent nhưng CAP inconsistent
  (write đến master, read từ replica chưa sync)
```

---

## Tóm tắt: Chọn gì cho use case nào?

```
┌─────────────────────┬────────────────────────────────────────┐
│ Use Case            │ Recommendation                         │
├─────────────────────┼────────────────────────────────────────┤
│ Session storage     │ Redis (AP, fast, auto-expiry)          │
│ Rate limiting       │ Redis (atomic INCR, fast)              │
│ Leaderboard         │ Redis ZSet (sorted set)                │
│ Message queue       │ Redis Pub/Sub hoặc Redis Streams       │
│ Cache (simple)      │ Memcached (lighter weight)             │
│ Cache (advanced)    │ Redis (persistence, rich types)        │
│ Distributed lock    │ Redis RedLock (CP)                     │
│ Banking, inventory  │ PostgreSQL/MySQL (ACID + CA)           │
│ Social feed         │ Cassandra/DynamoDB (AP + scale)        │
│ Config/consensus    │ Zookeeper/etcd (CP)                    │
└─────────────────────┴────────────────────────────────────────┘
```

---

**Tiếp theo:** Phase 14 - Database Security →
