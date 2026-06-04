# Bài 2: Topic, Partition, Replication Factor — quyết định bao nhiêu

3 câu hỏi phổ biến nhất khi setup Kafka:
1. **Bao nhiêu topic** cho 1 entity?
2. **Bao nhiêu partition** cho 1 topic?
3. **Replication factor** = bao nhiêu?

Đáp án ngắn: "**depends on application**". Bài này cho khung tư duy để quyết định đúng.

## Câu hỏi 1: How many topics?

### Scenario: e-commerce order events

Order có 3 lifecycle event: created, updated, cancelled.

**Option A**: 3 topic riêng
```text
order-created-events
order-updated-events
order-cancelled-events
```

**Option B**: 1 topic chung
```text
order-events            (with eventType field trong payload)
```

### Phân tích — analog với RDBMS

Bạn có tạo 3 table `created_orders`, `updated_orders`, `cancelled_orders` cho order không? **KHÔNG**.

`Order` là **entity**. Insert/update/delete đều cùng table `orders`, distinguish bằng status field.

Kafka cũng vậy. Events thuộc cùng entity → cùng topic.

### Vấn đề CRITICAL: message ordering

```text
Option A (3 topic riêng):
  Producer publish:
    order-created (key=order-123)    → order-created topic, partition 0
    order-updated (key=order-123)    → order-updated topic, partition 0
    order-cancelled (key=order-123)  → order-cancelled topic, partition 0
  
  Consumer xử lý:
    - Subscribe cả 3 topic.
    - Kafka guarantee ordering PER partition, KHÔNG cross-topic.
    - Có thể consume order-updated trước order-created!
    - Bug: update order chưa được create → throw error.
```

Option A **phá vỡ ordering**.

```text
Option B (1 topic chung):
  Producer publish (cùng key = order-123):
    order-created → cùng partition 0
    order-updated → cùng partition 0
    order-cancelled → cùng partition 0
  
  Consumer xử lý:
    - Kafka guarantee strict ordering trong partition.
    - Created → Updated → Cancelled, đúng thứ tự.
```

**Option B đúng** cho event lifecycle của cùng entity.

### Khi nào dùng nhiều topic riêng?

Khi events **không liên quan ordering**:
- `user-registrations` vs `payment-events` → khác entity, không cần share ordering.
- `email-send-events` vs `sms-send-events` → independent.
- High-volume vs low-volume mix → tách để tune retention/partition riêng.

→ Rule: **same entity, ordered events → 1 topic**. **Different entities → separate topics**.

## Câu hỏi 2: How many partitions?

### Cách tính dựa trên throughput

Công thức:
```text
Số partition ≈ Expected_throughput / Consumer_throughput_per_partition
```

#### Scenario A: Slow consumer

```text
Expected: 1000 events/giây
Consumer: 100 events/giây / instance

Partitions cần = 1000 / 100 = 10
+ buffer 20% safety = 12 partitions
```

Setup topic với 12 partitions → có thể scale lên 12 consumer instances → handle 1200 events/giây.

#### Scenario B: Fast consumer

```text
Expected: 300,000 events/giây
Consumer: 10,000,000 events/giây / instance (super fast)

Partitions cần = 300,000 / 10,000,000 = 0.03
→ 1 partition is enough!
```

Nhưng có **vấn đề producer side**:

```text
1 partition → 1 leader broker.
Producer publish 300k events/sec → 1 broker handle alone.
Có thể bị broker-side bottleneck.
```

Solution: tăng partitions lên **3** mặc dù consumer không cần. Phân tán load producer-broker communication.

→ Quyết định partition phụ thuộc cả **consumer throughput** + **broker capacity** + **producer rate**.

### Đừng over-allocate partitions

```text
"I'll create 10,000 partitions to be safe!"
```

Vấn đề:
- Kafka phải elect leader/follower cho mỗi partition → overhead controller.
- File descriptor mỗi partition → OS limit.
- Rebalance time tăng tuyến tính với số partition.
- Replication overhead.

Production rule of thumb:
- < 100 partitions / topic: bình thường.
- 100-1000: cẩn thận, có lý do rõ ràng.
- > 1000: rare, scale-out architecture (vd Confluent recommend đến 200k partitions/cluster total).

### Có thể alter partition count sau

Phase 3 đã học: `kafka-topics.sh --alter --partitions N` để tăng (chỉ tăng, không giảm).

→ Khởi tạo conservative, alter khi cần.

⚠️ Caveat: tăng partition **phá ordering** cho keys cũ (vì hash(key) % N thay đổi). Plan ahead.

## Câu hỏi 3: Replication Factor?

### Concept tách biệt

| Aspect | Provided by |
|---|---|
| **Scalability** | Partitions |
| **Availability** | Replication factor |
| **Durability** | min.insync.replicas |

### Cách tính

```text
Replication factor = N + minInSyncReplicas
```

Trong đó:
- **N** = số broker bạn expect down đồng thời.
- **minInSyncReplicas** = tối thiểu replicas phải sync để accept write.

#### Scenario A: 100-node cluster, tolerate 5 broker down đồng thời

```text
N = 5 (expected concurrent failures)
minInSyncReplicas = 2 (production standard)

Replication factor = 5 + 2 = 7
```

Khi 5 broker chết → ISR còn 2 → đủ min → vẫn accept write.

#### Scenario B: Small 3-node cluster

```text
N = 1 (tolerate 1 broker down)
minInSyncReplicas = 2

Replication factor = 1 + 2 = 3
```

Khi 1 broker chết → ISR còn 2 → vẫn write.

#### Scenario C: Dev / staging

```text
Replication factor = 1
```

Single replica → no HA → broker chết = data unavailable.

Chỉ acceptable cho dev/staging, NEVER production.

### Production matrix

| Cluster size | Replication factor | min.insync.replicas | Tolerate concurrent down |
|---|---|---|---|
| 1 (dev only) | 1 | 1 | 0 |
| 3 (small prod) | 3 | 2 | 1 |
| 5 (medium prod) | 3 | 2 | 1 (or 5/3 for 2) |
| 7+ (large prod) | 5 | 3 | 2 |

→ **Replication factor 3, min.insync.replicas 2** là sweet spot cho hầu hết production.

### Vì sao không higher replication factor?

Tradeoff:
- **Storage cost** × N (replication factor 5 = 5× disk).
- **Network bandwidth** cho replication.
- **Write latency** tăng (chờ thêm followers ack).

Higher không phải lúc nào cũng tốt. Trade off based on:
- Cost: storage + network.
- Reliability requirement.
- Cluster size.

## Decision checklist

Khi setup topic mới:

```text
1. Topic name (theo entity, ordering boundary):
   ✓ order-events
   ✗ order-created + order-updated + order-cancelled

2. Partition count:
   - Calculate: expected throughput / consumer throughput
   - Add 20-50% buffer
   - Don't over-allocate (< 100 typical)
   - Plan keys cho future growth (hash-stable)

3. Replication factor:
   - Production: 3 (small) or 5 (large cluster)
   - Dev: 1

4. min.insync.replicas:
   - Production: 2 (or 3 for very critical)
   - Always combo với acks=all

5. Retention:
   - Time-based: log.retention.hours
   - Size-based: log.retention.bytes
   - Default 7 days; tune theo business

6. Compaction (Phase 3 bài 4):
   - cleanup.policy=compact cho "current state" topic
   - cleanup.policy=delete (default) cho event stream

7. Compression:
   - Producer config snappy/lz4/gzip
   - Test với workload thật
```

## Anti-patterns

| Anti-pattern | Vấn đề | Sửa |
|---|---|---|
| Tách topic theo eventType cùng entity | Phá ordering | 1 topic chung |
| 10,000 partition "to be safe" | Overhead controller, rebalance slow | Conservative, alter sau |
| Replication factor 1 ở prod | Single broker down = data unavailable | Min 3 |
| `acks=all` mà không set `min.insync.replicas` | Khi ISR = 1, hiệu quả như acks=1 | Always combo |
| Compression mà không benchmark | Có thể slower nếu CPU bottleneck | Test trước |
| Key choice không thinking | Skewed partition, hot key, broken ordering | Plan entity ID làm key |

## Tóm tắt bài 2

- **Topic strategy**: same entity với ordered events → 1 topic. Different entities → separate topics.
- **Partition count** = expected throughput / consumer throughput per partition + buffer.
- Đừng over-allocate (rebalance overhead). Conservative + alter sau khi cần.
- **Replication factor** = expected concurrent failures + min.insync.replicas.
- Production sweet spot: **replication 3 + min.insync.replicas 2 + acks=all**.
- Topic config decision checklist 7 items: name, partition, replication, isr, retention, compaction, compression.
- Test compression với workload thật, không follow blindly.

**Bài kế tiếp** → [Bài 3: Phase 18 + 19 summary + Roadmap to next topics](03-summary-whats-next.md)
