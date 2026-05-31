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

Đơn giản, nhanh, không downtime.

**NHƯNG**: vấn đề lớn → **phá vỡ ordering tạm thời** cho một số key.

#### Vấn đề ordering khi tăng partition

```text
TRƯỚC (3 partition):
  hash(key=4) % 3 = 1 → Partition 1
  
Producer đã publish:
  Event "4:OrderCreated"    → Partition 1, offset 0
  Event "4:PaymentReceived" → Partition 1, offset 1 (sau OrderCreated)
  
SAU khi alter lên 4 partition:
  hash(key=4) % 4 = 0 → Partition 0  (KHÁC!)

Producer publish event tiếp:
  Event "4:Shipped" → Partition 0, offset 0
  
Consumer assignment:
  Partition 0 → Consumer A
  Partition 1 → Consumer B
  
Race condition:
  - A nhận "4:Shipped" trước (Partition 0 drain nhanh, ít message).
  - B vẫn còn đang xử lý "4:PaymentReceived" (chậm).
  → A xử lý Shipped trước khi B xử lý Payment.
  → THỨ TỰ BỊ PHÁ cho key=4 (Shipped trước Payment — sai logic!).
```

Cùng key trước và sau khi alter có thể land vào **partition khác** → ordering cross-partition bị phá vỡ.

**Khi nào chấp nhận được Approach A**:
- Event không quan trọng (product view, analytics) — thứ tự không bắt buộc.
- Chỉ có 1 window ngắn ordering bị phá, sau đó về steady state.

**Khi nào TUYỆT ĐỐI KHÔNG dùng**:
- Bank transaction (deposit/withdraw).
- Order lifecycle (created → paid → shipped).
- Bất kỳ scenario nào sai thứ tự = data corruption.

### Approach B: Plan ahead — chọn đúng số partition từ đầu (best practice)

Tránh alter. Plan số partition từ ngày đầu deploy.

```text
Estimate tăng trưởng 3-5 năm:
  Năm 1: 100 events/giây → 1 consumer
  Năm 3: 1000 events/giây → 5 consumer
  Năm 5: 5000 events/giây → 10 consumer

→ Tạo topic với 10 partition ngay từ đầu.
```

Ban đầu 1 consumer ôm cả 10 partition. Lượng nhỏ nên OK. Khi traffic tăng, scale up dần lên 10 consumer — **không cần alter**, **không phá ordering**.

Đây là **pattern được khuyến nghị nhất**.

### Approach C: Downtime + drain (zero data loss, zero broken order)

Khi cần strict ordering, không thể tolerate broken state:

```text
Bước 1: Stop producer (hoặc route producer sang temp staging).
Bước 2: Đợi consumer drain hết backlog hiện tại.
Bước 3: Verify mọi partition đều empty.
Bước 4: Chạy kafka-topics --alter để thêm partition.
Bước 5: Restart producer.

Kết quả:
  - Zero broken ordering (không có message in-flight bị split giữa alter).
  - Trade-off: producer downtime trong khoảng thời gian drain.
```

Chỉ dùng khi maintenance window được approve.

### Approach D: Tạo topic mới + swap (production-grade)

Topic là **config**, không bind vào code. Tạo topic mới với số partition đúng:

```bash
# Tạo v2 với số partition mong muốn
./kafka-topics.sh --bootstrap-server localhost:9092 \
  --create --topic order-events-v2 --partitions 8
```

Quy trình migration:
1. Stop producer.
2. Update config producer: topic = `order-events-v2`.
3. Restart producer → bắt đầu write vào v2.
4. Consumer vẫn đọc v1, drain hết backlog cũ.
5. Update config consumer: topic = `order-events-v2`.
6. Restart consumer.
7. Xoá topic `order-events` cũ.

Hoặc dùng pattern **Strangler-fig**: producer write vào **cả** v1 lẫn v2 trong giai đoạn transition, đợi consumer drain v1, rồi tắt write v1.

Đặt tên topic có version (`v1`, `v2`) là best practice trong production EDA.

## So sánh 4 approach

| Approach | Downtime | Tính toàn vẹn ordering | Effort | Khi nào dùng |
|---|---|---|---|---|
| A: alter | Không | Phá tạm thời | Thấp nhất | Event không quan trọng |
| B: Plan ahead | Không | Hoàn hảo | Thấp nhất (nếu lường trước được) | Luôn nên dùng (recommended) |
| C: stop + drain + alter | Producer downtime | Hoàn hảo | Trung bình | Cần strict ordering, có window maintenance |
| D: tạo topic mới | Không (swap dần) | Hoàn hảo | Cao nhất | Production large scale, quản lý được config |

## Có thể giảm số partition không?

**Kafka KHÔNG cho phép giảm số partition.**

Lý do: data đã ghi vào N partition không thể merge xuống ít partition hơn mà vẫn giữ được mapping key→partition (vì hash function dùng `% N`, đổi N → mapping khác).

Cần giảm? → tạo topic mới với ít partition hơn + migrate sang theo Approach D.

## Pitfall của rebalance

### Pitfall 1: Stop-the-world rebalance

Rebalance classic (Kafka trước version 2.4): **TẤT CẢ consumer** đều pause consuming, đợi reassignment xong rồi mới resume.

→ Throughput drop xuống 0 trong vài giây. UX latency spike.

Fix: **Cooperative rebalance** (Kafka 2.4+):
```yaml
spring.kafka.consumer.properties.partition.assignment.strategy: 
  org.apache.kafka.clients.consumer.CooperativeStickyAssignor
```

Chỉ partition affected mới pause. Các partition khác vẫn tiếp tục consume.

### Pitfall 2: Rebalance storm khi rolling deploy

Rolling deploy 10 consumer = 10 lần rebalance liên tiếp.

```text
Deploy consumer 1 → rebalance.
Deploy consumer 2 → rebalance.
...
Deploy consumer 10 → rebalance.
```

Mỗi rebalance pause vài giây. 10 lần rebalance = đoạn disruption đáng kể (cả phút).

Fix:
- **Static membership** (`group.instance.id`) — Kafka 2.3+ — instance restart KHÔNG trigger rebalance nếu rejoin trong session timeout (vì Kafka biết "consumer này đang restart, không phải leave").
- Tăng `session.timeout.ms` dài hơn (default 45s) — Kafka chờ lâu hơn trước khi coi là consumer leave.
- Cooperative assignor.

### Pitfall 3: Consumer xử lý dài bị kick khỏi group

Consumer xử lý 1 message mất 5 phút. Default `max.poll.interval.ms = 5 phút` → broker coi consumer "stuck" → kick khỏi group → rebalance.

Fix: tăng `max.poll.interval.ms` lên (vd 10 phút), hoặc giảm `max.poll.records` để batch nhỏ hơn (xử lý xong nhanh hơn, gọi poll() thường xuyên hơn).

## Tóm tắt bài 7

- **Rebalancing** = Kafka tự động phân phối lại partition khi consumer join/leave group.
- Demo: 1 consumer ôm tất cả → consumer thứ 2 join → split partition → consumer thứ 2 crash → consumer 1 ôm lại tất cả.
- **Quy tắc scaling**: số consumer chạy song song trong group **tối đa = số partition**. Quá nhiều consumer → một số bị **idle** (không có partition để assign).
- **Thay đổi số partition** có 4 approach:
  - **A `--alter`**: tăng được, không giảm. **Phá ordering tạm thời** cho các key cũ.
  - **B Plan ahead**: tạo topic với số partition đủ cho 3-5 năm. **Best practice**.
  - **C Stop + drain + alter**: zero data loss, có producer downtime.
  - **D Tạo topic mới + swap**: production-grade, dùng versioned topic name.
- Kafka **không support** giảm số partition.
- 3 pitfall rebalance:
  - Stop-the-world → fix: cooperative rebalance.
  - Rebalance storm khi rolling deploy → fix: static membership + tăng session timeout.
  - Long processing bị kick → fix: tăng `max.poll.interval.ms`.

**Bài kế tiếp** → [Bài 8: Offset tracking + Resetting offsets](08-offset-tracking.md)
