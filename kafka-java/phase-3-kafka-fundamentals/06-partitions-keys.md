# Bài 6: Partitions + Message Keys — scale + ordering

Bài trước có quan sát kỳ lạ: 2 consumer trong **cùng group** chỉ 1 cái nhận message, cái kia ngồi không. Vì sao Kafka **không phân chia round-robin**?

Trả lời: vì **message ordering** quan trọng hơn. Bài này: vì sao ordering quan trọng, giải pháp **partition + key** giải cả 2 vấn đề (scale + order), và demo trực quan.

## Vì sao ordering quan trọng?

Scenario: banking app.

```text
Customer activity:
  T=0:  Deposit $1000 to account A1
  T=1:  Withdraw $50 from account A1

Application publishes:
  Event 1: { type: deposit, account: A1, amount: 1000 }
  Event 2: { type: withdraw, account: A1, amount: 50 }
```

2 instances của `TransactionService` consume. Naive distribution:

```text
Instance 1: receive deposit event. Processing (10 seconds)...
Instance 2: idle.

Kafka thinks: "Instance 2 đang rảnh, đưa next event cho nó!"

Instance 2 receive withdraw event. Try withdraw $50 from A1.
But Instance 1 chưa commit deposit → A1 balance = $0.
Instance 2: "Insufficient funds!" → reject.

→ User pissed off. Bug nghiêm trọng.
```

Vấn đề: events of **same account** xử lý **out-of-order**. Withdraw chạy trước deposit.

Solution: **mọi event của 1 account phải xử lý sequential bởi 1 consumer**.

→ Vì thế Kafka **default không round-robin** trong group. Đảm bảo order.

Nhưng nếu chỉ 1 consumer ôm hết → **không scale**. Cần cơ chế khác.

## Partition — physical storage units

> **Topic = logical abstraction**. Bên trong topic = **N partitions**, mỗi partition = physical storage thực.

```text
Topic "order-events":
  +─────────────────────────────────+
  │  Partition 0 (append-only log)  │
  │  +─+─+─+─+─+─+─+─+─+            │
  │  │0│1│2│3│4│5│6│7│8│ ← offsets  │
  │  +─+─+─+─+─+─+─+─+─+            │
  +─────────────────────────────────+
  
  +─────────────────────────────────+
  │  Partition 1 (append-only log)  │
  │  +─+─+─+─+─+─+                  │
  │  │0│1│2│3│4│5│ ← offsets        │
  │  +─+─+─+─+─+─+                  │
  +─────────────────────────────────+
```

Khi tạo topic, ta declare số partition:

```bash
./kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --create \
  --topic order-events \
  --partitions 2
```

Không specify → default 1 partition.

### Offset thuộc partition, không thuộc topic

Cả 2 partition đều có offset `0, 1, 2, ...` riêng:
- `(partition 0, offset 5)` ≠ `(partition 1, offset 5)`.
- Trong **1 partition** = strict sequential ordering.
- Across partition = **không** có global order.

Đây là điểm key: **ordering guaranteed within partition, không globally**.

## Message key — quyết định partition nào

Mỗi message có thể có 1 **key** (optional, có thể null).

```text
message = { key: "A1", value: { type: deposit, amount: 1000 } }
```

Pseudocode Kafka client (hash + modulo):

```java
int partition = Math.abs(hash(key)) % numPartitions;
```

→ **Cùng key luôn đi cùng partition**.

```text
Topic order-events có 2 partitions.

Events:
  { key: A1, ... } → hash("A1") % 2 = 0 → Partition 0
  { key: A1, ... } → hash("A1") % 2 = 0 → Partition 0 (same!)
  { key: A2, ... } → hash("A2") % 2 = 1 → Partition 1
  { key: A1, ... } → hash("A1") % 2 = 0 → Partition 0
  { key: A7, ... } → hash("A7") % 2 = 1 → Partition 1
```

Effect:
- All events của account A1 → Partition 0 → **sequential**.
- All events của account A2, A7 → Partition 1.
- Within Partition 0: deposit A1 → withdraw A1, đúng order.

## Partition assignment trong consumer group

Kafka rule: **mỗi partition assigned tới max 1 consumer trong group**.

```text
Topic order-events (2 partitions)
Consumer Group "payment-service" (2 consumers)

Assignment (typical):
  Partition 0 ──► Consumer 1
  Partition 1 ──► Consumer 2
```

Mỗi consumer xử lý partition của mình sequential. Cross-consumer = parallel.

→ **Scale** (parallel) + **order** (within partition) cùng lúc.

### Scale formula

```text
Max parallel consumers in a group = number of partitions.

Topic với 2 partition → tối đa 2 consumer active trong group.
Consumer thứ 3 trong cùng group → idle (no partition assigned).

Topic với 10 partition → tối đa 10 consumer parallel.
```

Tăng throughput → tăng partition. Trade-off ở bài kế.

## Demo: 2 partition + 2 consumer + key

Setup:

```bash
docker compose down && docker compose up -d
docker exec -it kafka bash
cd /opt/kafka/bin

./kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --create \
  --topic order-events \
  --partitions 2

./kafka-topics.sh --bootstrap-server localhost:9092 --describe --topic order-events
# Topic: order-events  PartitionCount: 2  ReplicationFactor: 1
#   Topic: order-events  Partition: 0  Leader: 1  Replicas: 1  Isr: 1
#   Topic: order-events  Partition: 1  Leader: 1  Replicas: 1  Isr: 1
```

> Lưu ý: `Leader: 1` = node ID 1 (default cho docker container, xem `config/server.properties` field `node.id`). Trong cluster, mỗi partition có thể có leader ở node khác nhau.

3 terminal:

```bash
# T1 (consumer 1, group payment-service)
./kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic order-events \
  --group payment-service \
  --property print.key=true \
  --property print.offset=true

# T2 (consumer 2, group payment-service — same!)
./kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic order-events \
  --group payment-service \
  --property print.key=true \
  --property print.offset=true

# T3 (producer with key)
./kafka-console-producer.sh \
  --bootstrap-server localhost:9092 \
  --topic order-events \
  --property parse.key=true \
  --property key.separator=:
```

Producer accept `key:value` format. Send:

```text
> 1:A
> 2:B
> 3:C
> 1:D
> 1:E
> 2:F
> 3:G
```

Output:

```text
T1 (consumer 1, assigned Partition 0):
  Offset:0  1  A
  Offset:1  1  D
  Offset:2  1  E
  (key=1 always lands here)

T2 (consumer 2, assigned Partition 1):
  Offset:0  2  B
  Offset:1  3  C
  Offset:2  2  F
  Offset:3  3  G
  (keys 2 + 3 land here)
```

Observations:
1. ✓ Cùng key `1` → cùng partition → cùng consumer T1, **sequential order** (A → D → E).
2. ✓ Different keys phân phối 2 partition → parallel processing T1 + T2.
3. ✓ Offsets độc lập per partition.

**Vấn đề cũ giải xong**: scale + order.

## Choosing key đúng cách

Key chọn sai → distribution skewed → 1 partition ôm hết, các partition khác idle.

### Bad keys

```text
key = current_date ("2026-05-31"):
  Hôm nay 10M messages, all hash to 1 partition.
  → 1 partition overload, others idle.

key = random:
  Distribution OK nhưng lost ordering semantic (key chỉ để hash).

key = null cho everything (no key):
  Round-robin by chunks (xem demo dưới).
```

### Good keys

```text
account_id    → events of 1 account ordered, parallel across accounts.
user_id       → events of 1 user ordered, parallel.
order_id      → events of 1 order ordered (created → paid → shipped).
device_id     → IoT telemetry per device ordered.
session_id    → user session events ordered.
```

Rule: key = **entity bạn cần ordered xử lý**.

## Partition assignment = client library work

Hash + modulo logic chạy ở **producer client library**, không phải broker.

```text
Producer App
  ↓ KafkaProducer.send(record)
[Client library]
  - calculate partition: hash(key) % numPartitions
  - tag record with partition number
  ↓ TCP
[Broker]
  - receive: "this record goes to partition N"
  - append to partition N's log
```

Broker không tự tính lại — tin tưởng vào client.

### Manual partition override — ép gửi tới partition cụ thể

Client có thể bỏ qua hash function, ép message vào partition cụ thể:

```java
ProducerRecord<String, String> record = new ProducerRecord<>(
    "order-events",
    0,           // partition (explicit — ép vào partition 0)
    "key",
    "value"
);
```

Use case hiếm gặp (debug, routing đặc biệt). Production hầu như luôn dùng default key-based partitioning.

## Null key — behavior khác hoàn toàn

Demo: topic 2 partition, producer gửi message **KHÔNG có key**.

```bash
./kafka-topics.sh --bootstrap-server localhost:9092 --create --topic null-key-topic --partitions 2

# T1, T2: 2 consumer trong group "null-key-group"
# T3: producer (không key)
```

Script bash gửi message liên tục:
```bash
for i in $(seq 1 100); do
  echo "message-$i" | ./kafka-console-producer.sh \
    --bootstrap-server localhost:9092 \
    --topic null-key-topic
  sleep 0.05
done
```

Quan sát kết quả:
- Consumer T1 nhận một loạt message liên tiếp (vd `1-30`).
- Sau đó Consumer T2 nhận loạt tiếp theo (`31-60`).
- Lặp lại pattern này.

→ **KHÔNG phải round-robin từng message**.

**Sticky partitioner** — feature từ Kafka 2.4+:
- Null key → producer **dính** (stick) vào 1 partition trong 1 khoảng thời gian / 1 batch.
- Hết batch → chuyển sang partition tiếp theo.
- Mục đích: tận dụng `batch.size` (gửi 1 batch lớn vào 1 partition rồi mới đổi → throughput cao hơn).

Trade-off:
- ✓ Throughput tốt hơn (batch lớn).
- ✗ Không round-robin per-message — phân phối không đều trong window ngắn.

Về long-run (chạy lâu), phân phối gần đều giữa các partition.

## Anti-pattern — những lỗi thường gặp

| Anti-pattern | Lý do tệ | Cách fix |
|---|---|---|
| Tất cả message dùng cùng 1 key | Hash → tất cả về 1 partition → không scale được | Đa dạng key theo entity ID |
| Topic chỉ 1 partition + cần scale | Tối đa 1 consumer xử lý | Tạo lại topic với nhiều partition hơn |
| Quá nhiều partition (1000+) | Overhead broker, rebalance chậm | Thường 10-50 partition/topic là đủ |
| Đổi key sau khi production đã live | Phá vỡ ordering qua transition | Tránh — chọn đúng key từ đầu |
| Cần giảm số partition | KHÔNG được support trực tiếp | Chỉ tăng được, không giảm. Tạo topic mới + migrate |

## Visual tổng kết

```text
                            Topic "order-events"
                            (3 partition)
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        ▼                         ▼                         ▼
   Partition 0              Partition 1              Partition 2
   [key: A1, A4, ...]       [key: A2, A7, ...]       [key: A3, A5, ...]
        ▲                         ▲                         ▲
        │ assigned to             │ assigned to             │ assigned to
        │                         │                         │
   Consumer 1               Consumer 2               Consumer 3
   (group "payments")       (group "payments")       (group "payments")
```

- **Trong 1 partition**: tuần tự (giữ thứ tự message).
- **Giữa các partition**: song song (parallel).

## Tóm tắt bài 6

- Kafka KHÔNG round-robin trong consumer group vì **giữ thứ tự message rất quan trọng** (vd bank: deposit phải trước withdraw).
- **Topic = abstraction logic**. **Partition = đơn vị lưu trữ vật lý**.
- Tạo topic với `--partitions N`. Default = 1 partition.
- **Offset thuộc về partition**, không thuộc topic. Thứ tự message chỉ được đảm bảo trong 1 partition.
- **Message key** + công thức `hash(key) % numPartitions` → quyết định partition. Cùng key → cùng partition → giữ thứ tự.
- Consumer group: mỗi partition được assign cho **tối đa 1 consumer** trong group → scale tối đa = số partition.
- Demo: 2 partition + 2 consumer + key `account_id` → mỗi consumer ôm 1 partition, ordering được đảm bảo.
- **Chọn key cực kỳ quan trọng**: account_id, user_id, order_id. KHÔNG dùng date, KHÔNG random.
- Null key: **sticky partitioner** (Kafka 2.4+) — gom batch theo partition, đổi theo chunk. Throughput tốt, phân phối không đều trong window ngắn.
- Partition assignment được tính ở **client library**, không phải broker.

**Bài kế tiếp** → [Bài 7: Rebalancing + Scaling scenarios + Modify partitions](07-rebalancing-scaling.md)
