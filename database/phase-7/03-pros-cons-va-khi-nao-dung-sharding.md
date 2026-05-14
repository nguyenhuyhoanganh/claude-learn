# Bài 3: Ưu Nhược Điểm và Khi Nào Dùng Sharding

## Ưu điểm của Sharding

### 1. Horizontal Scalability - Scale tuyến tính

```
Không Sharding (Vertical Scaling):
  Server 16 cores, 128GB RAM → Giới hạn vật lý
  
  Upgrade: 32 cores, 256GB RAM → Giới hạn cao hơn
  Upgrade: 64 cores, 512GB RAM → Đắt gấp đôi!
  
  → Chi phí tăng phi tuyến tính
  → Có giới hạn cứng về phần cứng

Sharding (Horizontal Scaling):
  3 servers → 6 servers → 12 servers
  
  → Chi phí tăng tuyến tính (mỗi server thêm = 33% thêm capacity)
  → Không có giới hạn lý thuyết
  → Có thể dùng commodity hardware (rẻ hơn nhiều)
```

### 2. Smaller Index Size - Fit Memory Tốt Hơn

```
Bảng 300 triệu rows, B+Tree index trên user_id:
  1 server:    Index size = 30GB
  → Không fit memory (server có 16GB RAM)
  → Mỗi query phải đọc từ disk
  → Latency cao

3 shards (100M rows mỗi shard):
  Mỗi shard: Index size = 10GB
  → Fit trong memory!
  → Queries đọc từ RAM
  → Latency thấp hơn 10-100x
```

### 3. Performance - Parallel Processing

```
Query trên 300 triệu rows (không sharding):
  → 1 server xử lý toàn bộ
  → Sequential I/O trên 1 disk
  
Query trên 3 shards (có sharding):
  → 3 servers xử lý song song
  → 3 disks I/O đồng thời
  → Throughput tối đa gấp 3 lần
```

### 4. Geographic Distribution

```
Ví dụ: Ứng dụng toàn cầu
  Shard US:  Data center Virginia
  Shard EU:  Data center Frankfurt
  Shard APAC: Data center Singapore
  
User ở EU:
  → Query Shard EU: ~5ms (same region)
  → Query Shard US: ~100ms (cross-Atlantic)
  
→ Latency giảm đáng kể nhờ data locality!
→ GDPR compliance: EU data ở EU servers
```

### 5. Fault Isolation

```
Không Sharding:
  Server down → 100% users bị ảnh hưởng
  MTTR = 2 giờ → 2 giờ downtime toàn bộ

3 Shards:
  Shard 1 down → 33% users bị ảnh hưởng
  Shard 2 và 3 vẫn hoạt động bình thường
  
→ Blast radius nhỏ hơn nhiều
```

---

## Nhược điểm của Sharding

### 1. Complexity (Lớn Nhất)

```
Không Sharding:
  SELECT * FROM users WHERE id = 1234;
  → Đơn giản, 1 database

Có Sharding:
  1. Tính hash(1234) → shard key
  2. hashRing.get(shard_key) → shard ID
  3. clients[shard_id].query(...)
  4. Handle connection errors cho từng shard
  5. Retry logic nếu shard down
  6. Timeout handling
  
→ Application phức tạp hơn đáng kể
→ Nhiều bug surface hơn
→ Khó debug khi có vấn đề
```

### 2. Cross-Shard Transactions: Không Có ACID

```
Vấn đề: Transfer tiền giữa 2 users trên 2 shards khác nhau

-- User 1001 ở Shard A
-- User 2537 ở Shard B

-- Muốn: Atomic transfer $100

BEGIN;  -- Trên shard nào?

-- Debit Shard A
UPDATE accounts SET balance = balance - 100 WHERE user_id = 1001;

-- Credit Shard B
UPDATE accounts SET balance = balance + 100 WHERE user_id = 2537;

COMMIT;  -- Nếu Shard B down sau khi Shard A committed?

→ Shard A: -$100 ✓
→ Shard B: Chưa +$100 ✗
→ $100 biến mất!
```

**Giải pháp phức tạp:**
```
Distributed Transactions:
  - 2-Phase Commit (2PC): Đảm bảo atomic nhưng rất chậm
  - Saga Pattern: Eventual consistency, rollback logic
  - Compensating transactions: "Undo" nếu step nào đó fail
  
→ Tất cả đều phức tạp hơn nhiều so với single-DB transactions
```

### 3. Cross-Shard Joins: Gần Như Impossible

```sql
-- Query đơn giản không sharding:
SELECT u.name, COUNT(o.id) as order_count
FROM users u
JOIN orders o ON u.id = o.user_id
WHERE u.country = 'VN'
GROUP BY u.name;
```

```
Với Sharding (users và orders trên cùng shard key = user_id):
  → Có thể được nếu join key = shard key!
  → Nhưng nếu users ở Shard A và orders ở Shard B?

Phải làm:
  1. Query tất cả shards cho users WHERE country='VN'
  2. Collect tất cả user_ids
  3. Query tất cả shards cho orders WHERE user_id IN (...)
  4. Join trong application code
  
→ Chậm, tốn memory, phức tạp
→ Đây là "scatter-gather" pattern - antipattern cần tránh
```

### 4. Schema Changes Phức tạp

```bash
# Không sharding: 1 migration script
psql -d mydb -f migration_add_column.sql

# Có sharding: Phải apply cho TẤT CẢ shards
for shard in shard1 shard2 shard3; do
    psql -h $shard -d mydb -f migration_add_column.sql
done

# Nếu 1 shard fail:
  → Shard 1: ALTER TABLE ✓
  → Shard 2: ALTER TABLE ✓
  → Shard 3: ALTER TABLE ✗ (connection timeout)
  
  → Shards có schema khác nhau!
  → Queries có thể fail trên Shard 3
  → Phải xử lý compatibility giữa old/new schema
```

### 5. Resharding - Cơn Ác Mộng

```
Khi cần thêm shard:
  
  Ban đầu: 3 shards
  hashRing.get('abc12') → Shard 2
  
  Thêm Shard 4:
  hashRing.get('abc12') → Shard 1 (có thể thay đổi!)
  
  Phải migrate:
  1. Xác định data nào cần move (scan toàn bộ)
  2. Copy data từ old shard sang new shard
  3. Verify consistency
  4. Update routing (zero-downtime cần careful planning)
  5. Cleanup old data
  
  → Với hàng tỷ rows: Migration có thể mất nhiều ngày!
  → Zero-downtime resharding là engineering challenge cực kỳ khó
```

---

## Khi Nào Nên Dùng Sharding?

### Checklist trước khi Shard

```
Câu hỏi bắt buộc phải trả lời YES:

□ Đã thực sự cần chưa?
  → Bảng > 500M rows? CPU/RAM/Disk consistently > 80%?
  → Không thể upgrade hardware thêm?

□ Đã thử tất cả alternatives chưa?
  → Index optimization: DONE
  → Query optimization: DONE
  → Partitioning: DONE
  → Read replicas: DONE
  → Caching layer (Redis): DONE
  
□ Có shard key rõ ràng không?
  → Data có natural partition key (user_id, tenant_id)?
  → Shard key đủ high cardinality?
  → Queries thường filter theo shard key?

□ Cross-shard operations có chấp nhận được không?
  → Không có cross-shard transactions critical?
  → Cross-shard joins có thể avoid?

□ Team có expertise không?
  → Senior DBA / Backend engineer với distributed systems?
  → Không phải lúc "học trên production"?
```

### Khi Sharding Phù hợp

```
✅ Use cases tốt cho Sharding:

1. Multi-tenant SaaS (tenant_id là shard key):
   → Mỗi tenant isolate trên 1-2 shards
   → Tenant lớn → Dedicated shard
   → Cross-tenant queries hiếm

2. Social Media (user_id là shard key):
   → Queries thường là "data của user X"
   → user_id consistent trong WHERE clause
   → Posts, likes, follows đều liên kết với user_id

3. IoT / Time-series (device_id hoặc time là shard key):
   → Massive write throughput
   → Queries thường filter theo device và time range
   → Archive old shards dễ dàng

4. E-commerce (customer_id là shard key):
   → Queries: "orders của customer X"
   → Cart, wishlist, reviews đều theo customer
   → Cross-customer operations hiếm
```

### Khi Sharding Không Phù Hợp

```
❌ Tránh Sharding khi:

1. Data quan hệ chặt chẽ (nhiều JOINs):
   → Reporting queries span toàn bộ data
   → ERP / CRM với nhiều relational queries
   
2. Transactions cross-entity nhiều:
   → Ngân hàng: Transfer giữa accounts random
   → Inventory: Update stock affects nhiều products
   
3. Team nhỏ không có distributed systems expertise:
   → Sharding có thể tạo ra nhiều vấn đề hơn giải quyết
   
4. Bảng chưa đủ lớn:
   → < 100M rows → Partitioning đủ rồi
   → Index optimization có thể giải quyết vấn đề
```

---

## Alternatives Trước Khi Shard

### Read Replicas (Thường Đủ Hiệu Quả)

```
Master-Replica Setup:
  ┌──────────────┐
  │    Master    │  ← Nhận toàn bộ Writes
  └──────┬───────┘
         │ Replication
    ┌────┴────┐
    │         │
    ▼         ▼
┌──────────┐ ┌──────────┐
│ Replica 1│ │ Replica 2│  ← Phục vụ Reads
└──────────┘ └──────────┘

80% workload là reads → Replicas giảm tải đáng kể!
→ Không cần shard, không mất ACID transactions
```

### Caching Layer

```
Application → Redis Cache → Database

Cache hit rate 90%:
  → Chỉ 10% queries đến database
  → Database load giảm 10x!
  → Không cần shard

Use cases tốt cho caching:
  - Session data
  - User profile (ít thay đổi)
  - Product catalog
  - Aggregated counts/statistics
```

---

## Tóm tắt: Decision Framework

```
Start Here:
          │
          ▼
  Performance issue?
          │ YES
          ▼
  Optimize queries & indexes
          │ Still slow?
          ▼
  Add Partitioning
          │ Still slow?
          ▼
  Add Read Replicas + Caching
          │ Still slow?
          ▼
  Vertical Scale (better hardware)
          │ At hardware limit?
          ▼
  Consider Sharding
  (with expert review)

Ở mỗi bước: Measure → Optimize → Measure lại
Đừng sharding premature!
```

---

## Công ty đã dùng Sharding thành công

```
YouTube → Vitess (MySQL sharding middleware)
  - Vẫn viết SQL bình thường
  - Vitess xử lý routing

Slack → Vitess (sau khi grow đến hàng tỷ messages)
  - channel_id là shard key
  
Pinterest → MySQL với custom sharding
  - user_id là shard key
  
Shopify → Pods architecture
  - Merchant là unit of sharding
  
Tất cả đều bắt đầu KHÔNG shard, chỉ shard khi thực sự cần!
```

---

**Tiếp theo:** Phase 8 - Concurrency Control →
