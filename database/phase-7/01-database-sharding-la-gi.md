# Bài 1: Database Sharding là gì?

## Vấn đề: Một server không đủ

Khi partitioning không còn đủ:
- Bảng đã được partition nhưng vẫn quá tải
- CPU, RAM, I/O của server duy nhất bị bottleneck
- Không thể scale up thêm (đã dùng server mạnh nhất)

**Giải pháp:** Phân tán dữ liệu ra **nhiều database servers** — đó là **Sharding**.

---

## Sharding là gì?

**Database Sharding** là kỹ thuật chia dữ liệu của một bảng ra **nhiều database servers riêng biệt** (mỗi server gọi là một shard).

```
Bảng USERS (100 triệu rows) - Trước khi sharding:
┌────────────────────────────┐
│      Database Server 1      │
│  USERS: 100 triệu rows      │
│  → Server quá tải!          │
└────────────────────────────┘

↓ Sharding theo user_id ↓

┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│    Shard 1       │  │    Shard 2       │  │    Shard 3       │
│  Server A        │  │  Server B        │  │  Server C        │
│  users 1→33M     │  │  users 33M→66M   │  │  users 66M→100M  │
│  33 triệu rows   │  │  33 triệu rows   │  │  33 triệu rows   │
└──────────────────┘  └──────────────────┘  └──────────────────┘

→ Mỗi server chỉ chịu 1/3 tải!
```

---

## Partitioning vs Sharding: Sự khác biệt cốt lõi

```
Partitioning (Phase 6):              Sharding:
┌─────────────────────┐              ┌────────────┐  ┌────────────┐
│   Database Server 1  │              │  Server A  │  │  Server B  │
│                      │              │            │  │            │
│  Partition A         │              │  Shard A   │  │  Shard B   │
│  Partition B         │              │ (id<500K)  │  │(id>=500K)  │
│  Partition C         │              │            │  │            │
│  Partition D         │              └────────────┘  └────────────┘
└─────────────────────┘
                                      Client PHẢI biết shard nào!
Client KHÔNG biết gì cả!
```

| | Partitioning | Sharding |
|---|---|---|
| **Servers** | 1 database server | Nhiều database servers |
| **Client awareness** | Transparent (DB quản lý) | Client phải route đúng shard |
| **Complexity** | Thấp | Cao (application logic) |
| **Scale** | Vertical (1 server mạnh hơn) | Horizontal (nhiều servers) |
| **Transactions** | ACID đầy đủ | Cross-shard transactions rất khó |
| **Joins** | Bình thường | Cross-shard joins gần như impossible |

---

## Shard Key - Chìa khóa của Sharding

**Shard key** là column (hoặc tập columns) dùng để quyết định row nào vào shard nào.

```
Ví dụ: Shard key = customer_id

INSERT INTO orders (customer_id=1001, ...)
→ hash(1001) → Shard 2

INSERT INTO orders (customer_id=2537, ...)
→ hash(2537) → Shard 1

INSERT INTO orders (customer_id=9876, ...)
→ hash(9876) → Shard 3
```

### Chọn Shard Key quan trọng như thế nào?

```
Shard key tốt:
  ✅ Phân phối data đều (tránh hotspot)
  ✅ Queries thường dùng field đó trong WHERE
  ✅ Ít thay đổi sau khi insert

Shard key xấu:
  ❌ Timestamp → Mọi writes đến shard mới nhất (hotspot!)
  ❌ Status (active/inactive) → Không đều
  ❌ Country (nếu 90% user từ US) → Shard 1 bị quá tải
```

---

## Consistent Hashing - Thuật toán phân phối

### Vấn đề với Simple Hash

```
Nếu dùng: shard = hash(id) % number_of_shards

  3 shards: hash(id) % 3 → {0, 1, 2}
  
  Thêm 1 shard (4 shards):
    hash(id) % 4 → {0, 1, 2, 3}
    
  Kết quả: ~75% rows phải di chuyển sang shard mới!
  → Resharding cực kỳ tốn kém!
```

### Consistent Hashing giải quyết vấn đề này

**Ý tưởng:** Sắp xếp các shards trên một vòng tròn (hash ring).

```
Hash Ring (0 → 2^32 - 1):

                0 (= 2^32)
                │
        Shard 3 │ Shard 1
                │
   ─────────────┼─────────────
                │
        Shard 2 │ Shard 1
                │
              2^31

Khi có request với key K:
  1. Tính hash(K) → một điểm trên vòng tròn
  2. Đi theo chiều kim đồng hồ, gặp shard nào trước → đó là shard cần query
```

### Ưu điểm của Consistent Hashing

```
Thêm 1 shard mới:
  Simple hash:       75% data phải move
  Consistent hash:   Chỉ ~1/N data phải move (N = số shards)
  
Xóa 1 shard:
  Simple hash:       Toàn bộ data phải redistriubte
  Consistent hash:   Chỉ data của shard bị xóa phải move sang shard kế tiếp
```

---

## Client-Aware Routing

Khác với partitioning, trong sharding **application phải biết shard nào để query**:

```
Kiến trúc:
                    ┌────────────────────┐
Client ──────────→  │  Application Layer  │
                    │  (có sharding logic)│
                    └────────┬───────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
         Shard 1         Shard 2        Shard 3
       (Postgres)      (Postgres)     (Postgres)
      port 5432       port 5433      port 5434
```

```javascript
// Ví dụ routing logic trong application
function getShard(key) {
    const hash = hashFunction(key);    // Tính hash
    return hashRing.getNode(hash);     // Tìm shard trên hash ring
}

// Write
const shard = getShard(customerId);
await db[shard].query('INSERT INTO orders ...');

// Read
const shard = getShard(customerId);
const result = await db[shard].query('SELECT * FROM orders WHERE customer_id = $1', [customerId]);
```

---

## Ưu điểm của Sharding

```
1. Horizontal Scalability:
   → Thêm server = thêm capacity
   → Không bị giới hạn bởi 1 máy vật lý
   → Lý thuyết: scale vô hạn

2. Performance:
   → Mỗi shard có index nhỏ hơn → Fit memory
   → Parallel reads/writes trên nhiều servers
   → Giảm lock contention

3. Geographic Distribution:
   → Shard US ở data center US
   → Shard EU ở data center EU
   → Giảm latency cho user theo khu vực

4. Fault Isolation:
   → Shard 1 down → Chỉ 1/N user bị ảnh hưởng
   → Không down toàn bộ hệ thống

5. Security (Compliance):
   → Dữ liệu EU ở server EU (GDPR compliance)
   → Dữ liệu nhạy cảm có thể isolate ở shard riêng
```

---

## Nhược điểm của Sharding

```
1. Complexity (lớn nhất):
   → Application phải biết shard nào
   → Routing logic phức tạp
   → Resharding (thêm/xóa shard) cực kỳ khó

2. Cross-Shard Transactions:
   → BEGIN/COMMIT trên 1 shard: OK
   → Nhưng giao dịch spanning 2 shards: KHÔNG có ACID!
   → Phải implement distributed transactions (rất phức tạp)
   
   Ví dụ:
   Transfer $100 từ user 1001 (Shard 1) đến user 2537 (Shard 2):
   → Debit Shard 1 và Credit Shard 2 không thể atomic!

3. Cross-Shard Joins:
   SELECT u.name, o.total
   FROM users u JOIN orders o ON u.id = o.user_id
   WHERE u.country = 'VN';
   → users ở Shard A, orders ở Shard B → Không join được trực tiếp!
   → Phải pull data từ cả hai shards vào application rồi join

4. Schema Changes:
   → ALTER TABLE phải apply cho TẤT CẢ shards
   → Với 100 shards: 100 migration scripts
   → Nếu 1 shard fail → Data inconsistency

5. Operational Overhead:
   → Monitoring N databases thay vì 1
   → Backup/restore N databases
   → Debugging query performance khó hơn
```

---

## Thứ tự Scale: Đừng vội Shard!

```
Level 1: Optimize Queries
          → EXPLAIN ANALYZE, fix bad queries
          → Chỉ làm 1 lần, không có hậu quả

Level 2: Add Indexes
          → Giảm query time từ O(N) → O(log N)
          → Đơn giản, reversible

Level 3: Partitioning
          → Chia bảng lớn thành phần nhỏ trong 1 DB
          → Partition pruning giảm data scan
          → Moderate complexity

Level 4: Replication (Read Replicas)
          → Master nhận writes
          → Replicas phục vụ reads
          → 80% workload là reads → Hiệu quả cao
          → Moderate complexity

Level 5: Sharding
          → Chỉ khi 4 levels trên KHÔNG đủ
          → Very high complexity
          → Khó quay lại sau khi đã shard

Nguyên tắc: "Shard as late as possible"
```

---

## Công cụ hỗ trợ Sharding

### Vitess (YouTube, Slack sử dụng)

```
Vitess là middleware layer cho MySQL:
  Application → Vitess → Multiple MySQL shards

Vitess xử lý:
  ✅ Routing đến đúng shard
  ✅ Cross-shard queries (một phần)
  ✅ Schema migrations across shards
  ✅ Resharding

→ Application không cần biết chi tiết sharding!
```

### Citus (PostgreSQL Extension)

```
Citus biến PostgreSQL thành distributed database:
  ✅ Shard theo citus_distribute_table()
  ✅ Parallel queries across shards
  ✅ Colocation (related tables trên cùng shard)
  ✅ Standard PostgreSQL syntax
```

---

**Tiếp theo:** 02-sharding-thuc-hanh-nodejs-postgres.md →
