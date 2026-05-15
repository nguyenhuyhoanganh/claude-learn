# Bài 3: Techniques to Improve Database Performance, Availability & Scalability

## Ba kỹ thuật chính

```
Database Techniques
├── 1. Indexing      → Improve PERFORMANCE (faster reads)
├── 2. Replication   → Improve AVAILABILITY (fault tolerance)
└── 3. Partitioning  → Improve SCALABILITY (store more data)
```

---

## 1. Indexing

**Vấn đề:** Tìm kiếm trong table lớn = linear scan = chậm.

```sql
-- Full table scan O(n):
SELECT * FROM users WHERE city = 'Hanoi';
```

### Index là gì?

> **Database Index** = Helper data structure ánh xạ column value → record location.

**Cấu trúc phổ biến:**

| Structure | Best for | Complexity |
|-----------|----------|------------|
| **Hash Map** | Exact match lookups (`WHERE city = 'Hanoi'`) | O(1) |
| **B-Tree** | Range queries, sorting (`WHERE age BETWEEN 20 AND 30`) | O(log n) |

**Ví dụ:**
```
Index on column "city" (B-Tree):
  'Berlin' → [row 45, row 892, row 1203]
  'Hanoi'  → [row 12, row 456, row 789]
  'Paris'  → [row 34, row 567]

SELECT * FROM users WHERE city = 'Hanoi'
→ Lookup 'Hanoi' in index → rows [12, 456, 789] → fetch instantly ✅
```

### Composite Index

```sql
-- Tìm users vừa ở Hanoi vừa tên Nguyen:
CREATE INDEX idx_city_lastname ON users (city, last_name);

SELECT * FROM users WHERE city = 'Hanoi' AND last_name = 'Nguyen';
→ Lookup ('Hanoi', 'Nguyen') → result ngay lập tức ✅
```

### Trade-offs của Indexing

```
Reads:  Nhanh hơn (O(log n) thay vì O(n))
Writes: Chậm hơn (phải update cả index khi insert/update)
Space:  Tốn thêm dung lượng cho index tables
```

**Rule of thumb:** Tạo index cho columns thường xuyên query, không phải tất cả columns.

---

## 2. Database Replication

**Vấn đề:** Database là Single Point of Failure.

### Replication là gì?

> Chạy nhiều **copies (replicas)** của database trên nhiều máy khác nhau.

**Lợi ích:**
- **High Availability**: Replica chết → traffic chuyển sang replica khác
- **Throughput**: Nhiều machines → nhiều concurrent queries
- **Read scaling**: Phân phối read queries across replicas

### Active-Active vs Active-Passive

```
Active-Active:
[Replica 1] ←──sync──→ [Replica 2] ←──sync──→ [Replica 3]
    ↑                        ↑                        ↑
Reads/Writes            Reads/Writes             Reads/Writes

Active-Passive:
[Primary (R/W)] ──snapshot/stream──> [Passive 1]
                                   > [Passive 2]
    ↑                                   ↑
Reads/Writes                    Read-only (or standby)
```

| | Active-Active | Active-Passive |
|--|--------------|----------------|
| **Throughput** | Cao (spread load) | Moderate |
| **Availability** | Instant failover | Promote passive |
| **Consistency** | Harder | Easier (single leader) |
| **Complexity** | Cao | Thấp |

### Trade-offs

```
+ Higher availability
+ Higher read throughput
- Complexity increases (sync, conflict resolution)
- Write overhead (update all replicas)
```

---

## 3. Database Partitioning (Sharding)

**Vấn đề:** Data quá lớn để lưu trên 1 machine, hoặc quá nhiều concurrent queries.

### Partitioning là gì?

> **Sharding** = Chia data ra nhiều database instances (shards) chạy trên các máy khác nhau.

```
Total: 100M users

Shard 1: user_id 1 - 25M   [Machine A]
Shard 2: user_id 25M - 50M [Machine B]
Shard 3: user_id 50M - 75M [Machine C]
Shard 4: user_id 75M - 100M [Machine D]
```

**Lợi ích:**
- **Scalability**: Không giới hạn về data volume
- **Parallel processing**: Queries trên different shards chạy song song
- **Performance**: Mỗi shard nhỏ hơn → queries nhanh hơn

### Sharding Strategies

| Strategy | Cách làm | Ưu điểm | Nhược điểm |
|----------|----------|----------|-----------|
| **Range-based** | user_id 1-1M → Shard 1 | Simple | Uneven distribution |
| **Hash-based** | hash(user_id) % N | Even distribution | Hard to add shards |
| **Directory-based** | Lookup table | Flexible | Lookup overhead |

### Trade-offs của Sharding

```
+ Extreme horizontal scalability
+ Parallel query execution
- Complexity (routing queries đến đúng shard)
- Cross-shard queries rất khó (no JOIN across shards)
- Rebalancing khi thêm shards
```

---

## Ba kỹ thuật là Orthogonal

Có thể và nên dùng tất cả cùng nhau:

```
Database Architecture trong Production:

Shard 1 [Primary + Replica 1 + Replica 2] + Index
Shard 2 [Primary + Replica 1 + Replica 2] + Index
Shard 3 [Primary + Replica 1 + Replica 2] + Index
    ↑         ↑              ↑
Partitioning  Replication   Indexing
(Scalability) (Availability) (Performance)
```

## Khi nào áp dụng từng kỹ thuật?

| Vấn đề | Giải pháp |
|--------|----------|
| Query chậm dù database nhỏ | Index |
| Database là SPOF | Replication |
| Data quá lớn cho 1 machine | Sharding |
| Read traffic cao | Replication (read replicas) |
| Write traffic cao | Sharding |

## NoSQL vs SQL trong context này

- **NoSQL**: Replication và Sharding là **first-class features** (built-in)
- **SQL**: Replication/Sharding support varies by implementation (PostgreSQL, MySQL → supported; có thể phức tạp hơn)

## Tóm tắt

```
3 Database Techniques (Orthogonal):

1. Indexing → Performance
   HashMap: O(1) exact match
   B-Tree: O(log n) range queries, sorting

2. Replication → Availability + Read Throughput
   Active-Active: tất cả nhận traffic
   Active-Passive: primary + standby

3. Sharding → Scalability
   Chia data → nhiều machines
   Range / Hash / Directory based
```

---
**Tiếp theo:** Bài 4 - CAP Theorem →
