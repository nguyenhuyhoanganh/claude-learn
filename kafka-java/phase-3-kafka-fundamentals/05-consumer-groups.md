# Bài 5: Multiple consumers + Consumer Groups

Scenario thực tế: PaymentService cần đọc `order-events`. Để scale, bạn chạy **3 instances PaymentService**. Cả 3 instances đều nhận **cùng message** = process 1 order 3 lần = **redundant processing** = bug.

Kafka giải bằng **Consumer Group**. Bài này: demo problem, định nghĩa consumer group, cách Kafka phân phối message giữa group members, và **anonymous group**.

## Setup demo — 1 producer + 2 consumers

```bash
# Reset state
docker compose down && docker compose up -d
docker exec -it kafka bash
cd /opt/kafka/bin
./kafka-topics.sh --bootstrap-server localhost:9092 --create --topic demo-topic
```

3 terminal:
- T1: producer.
- T2: consumer #1.
- T3: consumer #2.

```bash
# T2 (consumer 1)
./kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic demo-topic

# T3 (consumer 2)
./kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic demo-topic

# T1 (producer)
./kafka-console-producer.sh --bootstrap-server localhost:9092 --topic demo-topic
> 1
> 2
> 3
```

Observation:

```text
Producer: 1, 2, 3
Consumer 1: 1, 2, 3    ← BOTH consumers nhận hết
Consumer 2: 1, 2, 3
```

**Cả 2 consumer nhận đầy đủ messages**.

## Khi nào behavior này ĐÚNG, khi nào SAI?

```text
SCENARIO A — 2 different services interested in order-events:

  OrderService → "order-events" topic
                       │
                       ├──► PaymentService (charge card)
                       └──► InventoryService (decrement stock)

  → Cả 2 service đều CẦN nhận mọi message. ĐÚNG.

SCENARIO B — 2 instances of SAME service:

  OrderService → "order-events" topic
                       │
                       ├──► PaymentService instance 1
                       └──► PaymentService instance 2
                       
  → Nếu cả 2 nhận order #123 → charge card 2 lần. SAI.
```

Default behavior thắng A, thua B.

## Consumer Group — solution cho scenario B

> **Consumer Group** = nhóm consumers cùng `group.id`. Kafka xem chúng là **1 logical consumer**.

```text
Kafka view:
  Consumer Group "payment-service"
  ├── Instance 1
  ├── Instance 2
  └── Instance 3
  
  → Kafka deliver mỗi message tới CHỈ 1 instance trong group.
```

Khi consumer join broker, nó **tự khai báo** `group.id`:

```bash
./kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic demo-topic \
  --group payment-service       # ← group name
```

Broker thấy `payment-service` → đánh giá: "consumer này thuộc group X". Mọi consumer cùng group.id → broker treat như 1 đơn vị.

### Rule:
- **Same group** → mỗi message tới **1 consumer trong group**.
- **Different groups** → mỗi group nhận **đầy đủ** message stream (như scenario A).

## Demo: 2 consumer groups

3 terminal:
- T1: producer.
- T2: consumer trong group `payment-service`.
- T3: consumer trong group `inventory-service`.

```bash
# T2
./kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic demo-topic \
  --group payment-service

# T3
./kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic demo-topic \
  --group inventory-service

# T1
./kafka-console-producer.sh --bootstrap-server localhost:9092 --topic demo-topic
> 1
> 2
> 3
> 4
```

Output:

```text
T2 (payment-service):    1, 2, 3, 4   ← group này nhận đủ
T3 (inventory-service):  1, 2, 3, 4   ← group này cũng nhận đủ
```

✓ Đúng — 2 service khác nhau, mỗi cái 1 group, mỗi cái nhận đủ.

## Demo: 2 consumers TRONG SAME group

Thêm T4: consumer thứ 2 trong group `payment-service`.

```bash
# T4 (cùng group với T2)
./kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic demo-topic \
  --group payment-service
```

Producer:
```text
> 5
> 6
> 7
> 8
> 9
```

Output **bất ngờ**:

```text
T2 (payment-service consumer #1):  5, 6, 7, 8, 9   ← chỉ 1 consumer nhận
T3 (inventory-service):             5, 6, 7, 8, 9   ← group khác → nhận đủ
T4 (payment-service consumer #2):                   ← KHÔNG nhận gì
```

3 quan sát:

1. ✓ Group `payment-service` nhận mỗi message **chỉ 1 lần** (T2). Không redundant. Tốt.
2. ✓ Group `inventory-service` (T3) độc lập, nhận đầy đủ. Tốt.
3. ⚠ Nhưng trong group `payment-service`, **T4 ngồi không**. T2 ôm hết.

Mong đợi: T2 nhận `5, 7, 9`; T4 nhận `6, 8`. Nhưng không — Kafka không phân phối round-robin trong group.

Vì sao? Kafka **không phân phối random**. Distribution dựa trên **partition** — concept mới ta sẽ học bài kế tiếp.

> **Spoiler**: 1 partition → chỉ assign cho 1 consumer trong group. Topic `demo-topic` tạo bằng `--create` không có argument → default 1 partition. Vì thế T2 = sole owner.

> Để T4 nhận message → topic cần nhiều partition hơn. Bài kế tiếp.

## Listing consumer groups

```bash
./kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 \
  --list

# Output:
# payment-service
# inventory-service
# console-consumer-91555      ← cái này từ đâu?
# console-consumer-22381
```

Có thêm 2 group `console-consumer-XXXXX`. Đây là **anonymous groups**.

## Anonymous Consumer Groups

Quy tắc cốt lõi Kafka: **mọi consumer phải thuộc 1 group**.

Demo trên cùng:

```bash
./kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic demo-topic
# KHÔNG --group → group.id = null → ???
```

Kafka xử lý: **assign random group name** dạng `console-consumer-XXXXX` (X = random digits).

→ Mỗi console consumer không có `--group` = 1 group riêng → nhận đầy đủ messages (giống scenario A).

Đó là lý do **demo đầu bài** (2 consumer không group) cả 2 nhận hết — Kafka assigned 2 anonymous groups khác nhau.

### Tích lũy anonymous groups?

Nếu mỗi console session = 1 group mới → cluster sau 1 tuần test sẽ có 1000 anonymous groups?

Kafka **auto-cleanup**:
```text
offsets.retention.minutes = 10080  (default = 7 days)
```

Sau 7 ngày inactive, group expire + delete.

Production app **luôn explicit `group.id`** — không bao giờ rely on anonymous.

## Tổng kết: Consumer Group rules

```text
Topic "demo-topic"
       │
       │ message delivered to:
       │
       ├──► Group "payment-service" → 1 instance only (load balanced)
       │
       ├──► Group "inventory-service" → 1 instance only
       │
       ├──► Group "analytics" → 1 instance only
       │
       └──► Group "console-consumer-XYZ" (anonymous) → that 1 console
```

Mỗi message delivered:
- **N times** = N groups subscribe topic.
- **Within each group**: only 1 consumer get it.

## Visual summary

```text
Producer → topic
              │
   ╔══════════╪══════════════════════════╗
   ║          │                          ║
   ║  Group A: payment-service           ║
   ║  ┌────────┐  ┌────────┐  ┌────────┐ ║
   ║  │Instance│  │Instance│  │Instance│ ║
   ║  │  1     │  │  2     │  │  3     │ ║
   ║  └────────┘  └────────┘  └────────┘ ║
   ║    ↑ ONE of them gets each message  ║
   ╚═════════════════════════════════════╝
              │
   ╔══════════╪══════════════════════════╗
   ║          │                          ║
   ║  Group B: inventory-service         ║
   ║  ┌────────┐  ┌────────┐             ║
   ║  │Instance│  │Instance│             ║
   ║  │  1     │  │  2     │             ║
   ║  └────────┘  └────────┘             ║
   ║    ↑ ONE of them gets each message  ║
   ╚═════════════════════════════════════╝
```

## Production naming conventions

```text
group.id = "${service-name}-${env}"

Examples:
  payment-service-prod
  inventory-service-staging
  analytics-batch-job-prod
  fraud-detector-prod
```

Strong naming → easy monitor, debug, cleanup.

## Tóm tắt bài 5

- 2 console consumers KHÔNG cùng group → cả 2 nhận đủ message (anonymous groups).
- ĐÚNG cho: 2 service khác nhau cùng cần data (PaymentService + InventoryService).
- SAI cho: 2 instances cùng service (redundant processing).
- **Consumer Group** = consumers cùng `group.id` → broker treat như 1 logical consumer → mỗi message tới 1 instance trong group.
- **Same group → distributed**. **Different groups → broadcast**.
- 2 instances cùng group **chưa đủ** để distribute — cần multi-partition topic (bài kế tiếp).
- Mọi consumer PHẢI thuộc group. Không specify → Kafka assign anonymous (`console-consumer-XYZ`).
- Anonymous group expire sau 7 ngày inactive (`offsets.retention.minutes`).
- Production: luôn explicit `group.id`, naming convention `service-env`.

**Bài kế tiếp** → [Bài 6: Partitions + Message Keys — scale + ordering](06-partitions-keys.md)
