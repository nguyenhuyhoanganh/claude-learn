# Bài 7: Partition Rebalancing + Scaling scenarios + Modifying partitions

Bài 6 đã dạy partition + key → scale + order. Thực tế production luôn động: consumer instances join/leave (autoscaling, crash), traffic tăng cần thêm partition. Bài này: cơ chế **rebalancing**, các **scaling scenarios** chuẩn, và 3 cách **modify partition count** với trade-off.

## Partition Rebalancing — Kafka tự reassign

> **Rebalancing** = Kafka re-distribute partitions giữa consumers trong group khi membership thay đổi.

Trigger:
- Consumer join group (autoscaling lên).
- Consumer leave group (crash, deploy, scale down).
- Topic add partitions.

### Demo step-by-step

Setup: `order-events` topic 2 partitions, group `payment-service`.

```bash
./kafka-topics.sh --bootstrap-server localhost:9092 \
  --create --topic order-events --partitions 2
```

#### Step 1: 1 consumer trong group

```text
Topic: order-events
  Partition 0: [...]
  Partition 1: [...]

Group "payment-service":
  Consumer A

Assignment:
  Partition 0 → Consumer A
  Partition 1 → Consumer A
  (A xử lý cả 2 partition)
```

Producer gửi:
```text
> 1:A
> 2:B
> 3:C
```

Consumer A nhận tất cả. Offsets: `Partition 0 offset 0: 1, A`, `Partition 1 offset 0: 2, B`, etc.

#### Step 2: Consumer B join

```bash
# Mở terminal mới, start consumer B cùng group
./kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic order-events \
  --group payment-service \
  --property print.key=true
```

Kafka detect new member → **rebalancing**:

```text
Assignment sau rebalance:
  Partition 0 → Consumer A
  Partition 1 → Consumer B
```

Producer tiếp:
```text
> 1:D    → goes to Partition 0 → Consumer A
> 2:E    → goes to Partition 1 → Consumer B
> 3:F    → Partition 1 → B
> 4:G    → Partition 0 → A
```

✓ Cả 2 cùng working. Parallel.

#### Step 3: Consumer B crash (Ctrl-C)

Kafka detect mất B → rebalance lại:

```text
Assignment:
  Partition 0 → Consumer A
  Partition 1 → Consumer A
  (back to single owner)
```

Messages tiếp tục flow vào A.

### Rebalance không free

- Pause: trong khoảng vài giây, **consumers tạm ngừng** consume để re-coordinate.
- Latency spike trong khoảng rebalance.
- Frequent rebalance (rolling deploy) → throughput hit.

→ Production tune: heartbeat, session timeout, **incremental cooperative rebalancing** (Kafka 2.4+) giảm impact. Detail Phase 11.

## Scaling Scenarios

Topic `order-events` với **3 partitions**, group `payment-service`. Scenarios theo số consumer:

### Scenario 1: 1 consumer

```text
Partitions: 0, 1, 2
Consumer A: owns 0, 1, 2 (all)
```

A nhận mọi message. Bottleneck nếu traffic cao.

### Scenario 2: 2 consumers

```text
Partition 0, 1 → Consumer A
Partition 2    → Consumer B
```

(Hoặc 0 → A, 1, 2 → B — distribution không strict 50/50 vì 3 không chia hết 2.)

Parallel hơn. Vẫn 1 consumer ôm 2 partition.

### Scenario 3: 3 consumers — sweet spot

```text
Partition 0 → A
Partition 1 → B
Partition 2 → C
```

Perfect 1-1. Max parallelism.

### Scenario 4: 4 consumers — DƯ

```text
Partition 0 → A
Partition 1 → B
Partition 2 → C
Consumer D → IDLE (no partition assigned)
```

**Rule**: 1 partition → max 1 consumer trong group. Vì sao? **Ordering guarantee** (bài 6). Partition không thể split giữa 2 consumer.

→ Consumer thừa = wasted compute.

```text
Maximum effective consumers in group ≤ Number of partitions in topic.
```

### Decision: chọn số partition ra sao?

```text
Cur load: 1 consumer đủ
Future 3 năm: dự kiến 5 instances

→ Tạo topic với 5+ partitions ngay từ đầu.
```

Có thừa partition lúc đầu cũng OK:
- 1 consumer ôm 5 partition → vẫn work.
- Sau scale 5 consumer → assign 1-1 perfect.

KHÔNG nên over-provision (10000 partitions "for the future") — overhead broker, slow rebalance, file descriptor limit. Best practices section sẽ cover.

## Modify partition count — 3 cách

Production: cần tăng partition để scale. 3 approach.

### Approach A: `--alter` (the official way)

Kafka CLI cho phép **TĂNG** partition. **KHÔNG** thể giảm.

```bash
./kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --alter \
  --topic order-events \
  --partitions 4

./kafka-topics.sh --bootstrap-server localhost:9092 --describe --topic order-events
# PartitionCount: 4
```

Đơn giản, nhanh, no downtime.

**NHƯNG**: vấn đề lớn → **mất ordering tạm thời** cho 1 số key.

#### Vấn đề ordering khi tăng partition

```text
BEFORE (3 partitions):
  hash(key=4) % 3 = 1 → Partition 1
  
Producer history: 
  Event "4:OrderCreated"   → Partition 1, offset 0
  Event "4:PaymentReceived" → Partition 1, offset 1 (after OrderCreated)
  
AFTER alter to 4 partitions:
  hash(key=4) % 4 = 0 → Partition 0  (DIFFERENT!)

Producer mới:
  Event "4:Shipped" → Partition 0, offset 0
  
Consumer assignment:
  Partition 0 → Consumer A
  Partition 1 → Consumer B
  
Race condition:
  - A receive "4:Shipped" first (Partition 0 quick to drain).
  - B may still processing "4:PaymentReceived" (slow).
  → A processes Shipped before B processes Payment.
  → ORDER BROKEN cho key=4.
```

Same key trước/sau alter có thể land **partition khác** → cross-partition ordering broken.

**Khi nào chấp nhận**:
- Non-critical events (product view, analytics) — order không quan trọng tuyệt đối.
- Short window of broken ordering, then steady state.

**Khi nào KHÔNG dùng**:
- Bank transaction.
- Order lifecycle (created → paid → shipped).
- Anything where wrong order = data corruption.

### Approach B: Plan ahead (best practice)

Avoid alter. Plan partition count from day 1.

```text
Estimate growth 3-5 years:
  Year 1: 100 events/sec → 1 consumer
  Year 3: 1000 events/sec → 5 consumers
  Year 5: 5000 events/sec → 10 consumers

→ Create topic với 10 partitions from start.
```

Lúc đầu 1 consumer ôm 10 partition. Lượng nhỏ, OK. Khi cần, scale up dần lên 10 consumers — không cần alter, không mất ordering.

Đây là **recommended pattern**.

### Approach C: Downtime + drain (zero-data-loss)

Strict ordering required, không thể tolerate broken state?

```text
Step 1: Stop producer (hoặc route producer to temp staging).
Step 2: Wait for consumers drain backlog.
Step 3: Verify all partitions empty.
Step 4: kafka-topics --alter to add partitions.
Step 5: Restart producer.

Result:
  - Zero broken ordering (no in-flight messages straddle alter).
  - Trade-off: downtime in producer publishing.
```

Chỉ dùng khi maintenance window được approve.

### Approach D: New topic, swap (production-grade)

Topic là **configuration**, không bound vào code. Tạo topic mới với # partition đúng:

```bash
# Create v2 with desired partitions
./kafka-topics.sh --bootstrap-server localhost:9092 \
  --create --topic order-events-v2 --partitions 8
```

Migration:
1. Stop producer.
2. Update producer config: topic = `order-events-v2`.
3. Restart producer → writes to v2.
4. Consumer vẫn read v1. Drain backlog.
5. Update consumer config: topic = `order-events-v2`.
6. Restart consumer.
7. Delete `order-events` (old).

Or với Strangler-fig pattern: producer write to **both** v1 + v2 temporarily, drain consumers, switch off v1.

Versioned topic names (`v1`, `v2`) là best practice trong production EDA.

## Comparison

| Approach | Downtime | Ordering integrity | Effort | Use when |
|---|---|---|---|---|
| A: alter | None | Broken temporarily | Lowest | Non-critical events |
| B: plan ahead | None | Perfect | Lowest (if foresee) | Always (recommended) |
| C: stop + drain + alter | Producer downtime | Perfect | Medium | Strict ordering, maintenance window OK |
| D: new topic | None (gradual swap) | Perfect | Highest | Production large scale, can manage config |

## Decreasing partition count?

**Kafka KHÔNG cho phép giảm partition count.**

Lý do: data trong partitions không thể merge sang ít partition hơn mà giữ key→partition deterministic.

Cần giảm? → tạo topic mới với ít partitions hơn + migrate (Approach D).

## Partition rebalance pitfalls

### Pitfall 1: Stop-the-world rebalance

Classic rebalance (pre-Kafka 2.4): **mọi consumer** pause consuming, full reassignment, resume.

→ Throughput drop. UX latency spike.

Fix: **Cooperative rebalance** (Kafka 2.4+):
```yaml
spring.kafka.consumer.properties.partition.assignment.strategy: 
  org.apache.kafka.clients.consumer.CooperativeStickyAssignor
```

Chỉ partition affected mới pause. Others continue.

### Pitfall 2: Rebalance storm

Rolling deploy 10 consumer = 10 rebalance liên tiếp.

```text
Deploy consumer 1 → rebalance.
Deploy consumer 2 → rebalance.
...
```

Mỗi rebalance pause. 10 rebalance = significant disruption.

Fix:
- Static membership (`group.instance.id`) — Kafka 2.3+ — instance restart không trigger rebalance nếu rejoin trong session timeout.
- Tune `session.timeout.ms` longer (default 45s).
- Cooperative assignor.

### Pitfall 3: Long-running consumer kicked

Consumer process 1 message takes 5 min. Default `max.poll.interval.ms = 5 min` → kicked → rebalance.

Fix: tăng `max.poll.interval.ms` hoặc batch ít records hơn (`max.poll.records`).

## Tóm tắt bài 7

- **Rebalancing** = Kafka re-distribute partitions khi consumer join/leave group.
- Demo: 1 consumer ôm tất cả → join consumer thứ 2 → split → consumer thứ 2 crash → 1 ôm lại.
- **Scaling rule**: max parallel consumer trong group = số partition.
- Quá nhiều consumer → một số **idle** (không partition để assign).
- **Modify partition** count:
  - **A `--alter`**: tăng được, không giảm. **Broken ordering tạm thời** cho key cũ.
  - **B Plan ahead**: tạo topic với # partition tương lai 3-5 năm. Best practice.
  - **C Stop + drain + alter**: zero data loss, có producer downtime.
  - **D New topic + swap**: production-grade, versioned topic names.
- Kafka **không support giảm** partition count.
- Rebalance pitfalls: stop-the-world (fix: cooperative rebalance), rebalance storm (fix: static membership), long processing kicked (fix: tăng `max.poll.interval.ms`).

**Bài kế tiếp** → [Bài 8: Offset tracking + Resetting offsets](08-offset-tracking.md)
