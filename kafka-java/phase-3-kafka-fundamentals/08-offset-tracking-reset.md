# Bài 8: Offset Tracking + Resetting Offsets — ledger nội bộ Kafka

Consumer crash, restart, join lại group. Kafka phải nhớ "consumer này đã đọc tới đâu" — không thể deliver lại từ offset 0.

Bài này: **offset tracking ledger** — cách Kafka nhớ vị trí của mỗi consumer group, demo qua `kafka-consumer-groups.sh --describe`, và cách **reset offset** khi cần replay.

## Offset tracking — Kafka's internal ledger

> Kafka maintain 1 **internal ledger** ghi nhận: **(consumer group, partition) → current offset**.

Ví dụ ledger:

```text
For topic "order-events" (3 partitions):

Consumer Group "payment-service":
  Partition 0: current offset = 47
  Partition 1: current offset = 102
  Partition 2: current offset = 89

Consumer Group "inventory-service":
  Partition 0: current offset = 12   ← khác group, khác progress
  Partition 1: current offset = 30
  Partition 2: current offset = 20

Consumer Group "fraud-detector":
  Partition 0: current offset = 47
  Partition 1: current offset = 102
  Partition 2: current offset = 89
```

Mỗi consumer group có progress **độc lập**. Khi consumer pull, broker dùng ledger biết: "group X cho partition 0 đã đọc tới 47 → đưa offset 48 tiếp."

### Lưu ở đâu?

Internal topic: `__consumer_offsets` (có 2 dấu `_` đầu). Tự động tạo. Compacted (giữ latest value per key).

```bash
./kafka-topics.sh --bootstrap-server localhost:9092 --list
# __consumer_offsets    ← internal
# order-events
# ...
```

Kafka tự quản. App không cần đụng.

### Vì sao tracking quan trọng?

Microservices = consumers crash chuyện thường:
- OOM → process kill → K8s restart.
- Deploy → rolling restart.
- Network blip → kicked from group.

Sau restart, consumer rejoin → broker check ledger → **resume từ đúng vị trí**. Không xử lý lại event cũ, không miss event mới.

→ **Reliability foundation** của Kafka consumer.

## Demo offset tracking

Setup:

```bash
docker compose down && docker compose up -d
docker exec -it kafka bash
cd /opt/kafka/bin

./kafka-topics.sh --bootstrap-server localhost:9092 \
  --create --topic offset-tracking-topic --partitions 2
```

### Step 1: Produce 5 messages TRƯỚC khi có consumer

```bash
./kafka-console-producer.sh \
  --bootstrap-server localhost:9092 \
  --topic offset-tracking-topic \
  --property parse.key=true --property key.separator=:
> 1:A
> 2:A
> 3:A
> 4:A
> 5:A
```

5 messages distributed lên 2 partition theo `hash(key) % 2`. Vd: 2 msg lên Partition 0, 3 msg lên Partition 1.

### Step 2: Start 2 consumers (KHÔNG `--from-beginning`)

```bash
# T1
./kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic offset-tracking-topic \
  --group CG

# T2 (same group)
./kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic offset-tracking-topic \
  --group CG
```

Consumer output: **nothing**. 5 message cũ không deliver vì `--from-beginning` không có.

### Step 3: Describe consumer group

T3:

```bash
./kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 \
  --describe \
  --group CG
```

Output (tabular):

```text
GROUP  TOPIC                  PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG
CG     offset-tracking-topic  0          2               2               0
CG     offset-tracking-topic  1          3               3               0
```

Đọc:
- **LOG-END-OFFSET** (LEO) = next offset Kafka sẽ ghi vào partition. Vd `2` = đã có 2 messages (offset 0, 1).
- **CURRENT-OFFSET** = nơi consumer group đang ở. `2` cho partition 0 nghĩa là consumer "đã xem qua đến offset 2".
- **LAG** = LEO - current offset. `0` = consumer đã catch up.

Lúc subscribe lần đầu, consumer **không** `--from-beginning` → Kafka assume "anh không quan tâm history" → set current offset = LEO ngay từ đầu. Đó là lý do lag = 0 dù 5 message còn nguyên trong topic.

### Step 4: Producer gửi thêm 5 messages

```bash
> 1:B
> 2:B
> 3:B
> 4:B
> 5:B
```

Vì consumer đang active → Kafka deliver ngay → consumer xử lý. Sau đó describe:

```text
GROUP  TOPIC                  PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG
CG     offset-tracking-topic  0          4               4               0
CG     offset-tracking-topic  1          6               6               0
```

LEO advance (đã ghi thêm). Current offset cũng advance (đã consume). Lag vẫn 0.

### Step 5: Stop consumers, producer tiếp tục gửi 5

Ctrl-C T1 + T2. Producer:
```text
> 1:C
> 2:C
> 3:C
> 4:C
> 5:C
```

Describe:

```text
Consumer group 'CG' has no active members.

GROUP  TOPIC                  PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG
CG     offset-tracking-topic  0          4               6               2
CG     offset-tracking-topic  1          6               9               3
```

LEO tăng (4→6, 6→9) vì messages mới. **Current offset không đổi** (consumer offline). Lag = 2, 3.

Group note `no active members` — vẫn tồn tại trong ledger, chờ consumer rejoin.

### Step 6: Restart 1 consumer

```bash
./kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic offset-tracking-topic \
  --group CG
```

Kafka detect consumer back → assign **cả 2 partitions** (chỉ có 1 consumer) → deliver toàn bộ 5 message backlog (1:C → 5:C).

Describe:
```text
CG  offset-tracking-topic  0  6  6  0
CG  offset-tracking-topic  1  9  9  0
```

Lag back to 0.

## `--from-beginning` ONLY first-time

Quan trọng: `--from-beginning` flag chỉ có hiệu lực **lần đầu** consumer group subscribe topic.

```text
Lần 1: Consumer group "CG" subscribe with --from-beginning
  → Kafka chưa có ledger entry cho CG
  → Read all messages từ offset 0 → current offset advance theo
  
Lần 2 (sau khi đã subscribe): Consumer rejoin with --from-beginning
  → Kafka đã có ledger: CG @ offset 100
  → IGNORE --from-beginning, resume từ offset 100.
```

Lý do: ledger là **source of truth**. Flag chỉ định "initial position" khi chưa có ledger.

Muốn replay từ đầu sau đó? → **reset offset** (next section).

### Tương đương config: `auto.offset.reset`

Spring/Java app dùng property:

```yaml
spring.kafka.consumer.auto-offset-reset: latest    # ↔ KHÔNG --from-beginning
# hoặc
spring.kafka.consumer.auto-offset-reset: earliest  # ↔ --from-beginning
```

Effect:
- `latest` = consumer **mới** (chưa có entry trong ledger) bắt đầu từ LEO.
- `earliest` = consumer **mới** bắt đầu từ offset 0.
- Áp dụng **chỉ khi không có offset trong ledger**. Có ledger → resume từ đó.

## Resetting Consumer Offsets

Use cases:
1. **Bug trong consumer**: process sai, cần replay & process lại đúng.
2. **Add new feature**: consumer cần build state từ historical data.
3. **Skip poison messages**: jump qua offset gây crash.
4. **Disaster recovery**: roll back về timestamp trước incident.

CLI: `kafka-consumer-groups.sh --reset-offsets`.

> Prerequisite: **stop all consumers in group**. Kafka không reset khi members đang active.

### Reset options

| Option | Effect |
|---|---|
| `--shift-by N` | Cộng N vào current offset (negative = lùi) |
| `--to-offset N` | Set absolute offset |
| `--to-earliest` | Reset về offset 0 (replay all) |
| `--to-latest` | Reset về LEO (skip all backlog) |
| `--by-duration PT5M` | Reset về 5 phút trước (ISO 8601 duration) |
| `--to-datetime <ISO>` | Reset về timestamp specific |
| `--to-current` | Stay at current (no-op, useful for verify) |

Modifiers:
- `--dry-run`: show what would happen, không apply.
- `--execute`: apply for real.

### Demo: shift-by -3

Tiếp tục từ demo trước. CG hiện tại current offset = `6`, `9`. Backlog lag = 0.

Stop consumer trước.

#### Dry-run

```bash
./kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 \
  --group CG \
  --topic offset-tracking-topic \
  --reset-offsets \
  --shift-by -3 \
  --dry-run

# Output:
# GROUP  TOPIC                  PARTITION  NEW-OFFSET
# CG     offset-tracking-topic  0          3
# CG     offset-tracking-topic  1          6
```

Partition 0: 6 - 3 = 3. Partition 1: 9 - 3 = 6. Reset áp dụng **cho mọi partition** (không chọn riêng).

#### Execute

```bash
./kafka-consumer-groups.sh \
  ... \
  --reset-offsets --shift-by -3 --execute
```

Describe sau:
```text
CG  ...  Partition 0  current 3  LEO 6  lag 3
CG  ...  Partition 1  current 6  LEO 9  lag 3
```

Restart consumer → nhận lại 3 + 3 = 6 messages (last 3 messages của mỗi partition).

### Reset to earliest

```bash
./kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 \
  --group CG \
  --topic offset-tracking-topic \
  --reset-offsets --to-earliest --execute
```

Replay từ đầu. Use case: build state cho new feature.

### Reset by duration (re-process last hour)

```bash
./kafka-consumer-groups.sh \
  ... \
  --reset-offsets --by-duration PT1H --execute
```

`PT1H` = 1 hour. ISO 8601 duration format:
- `PT5M` = 5 minutes
- `PT1H30M` = 1.5 hours
- `P1D` = 1 day

Kafka find offset gần nhất với "now - 1H" theo timestamp → reset.

### Reset to datetime

```bash
./kafka-consumer-groups.sh \
  ... \
  --reset-offsets --to-datetime 2026-05-30T10:00:00.000 --execute
```

Disaster recovery: "roll back to before incident at 10am".

## Per-topic vs all topics

```bash
# Reset specific topic
--topic offset-tracking-topic

# Reset all topics group subscribed to
--all-topics

# Reset specific partition only
--topic offset-tracking-topic:0   ← only partition 0
```

## Production cautions

| Caution | Why |
|---|---|
| Stop all consumers before reset | Kafka rejects if active members |
| Test in staging trước | Reset = irreversible (history processed lại) |
| Avoid reset trong peak hours | Spike of reprocessing |
| Communicate với downstream | Reprocessed events emit downstream events → cascade |
| Idempotent consumers required | Processing message 2 lần phải safe (no double charge) |

Idempotency = critical. Phase 13-14 (Error Handling, Transactions) deep-dive.

## Programmatic offset commit (Java/Spring)

Reset CLI cho ops. App code có 2 mode commit offset:

```yaml
spring.kafka.consumer.enable-auto-commit: true   # default, auto every 5s
# hoặc
spring.kafka.consumer.enable-auto-commit: false  # manual
```

Manual commit:
```java
@KafkaListener(topics = "order-events")
public void handle(ConsumerRecord<String, String> record, Acknowledgment ack) {
    try {
        process(record);
        ack.acknowledge();   // commit offset SAU khi process xong
    } catch (Exception e) {
        // DON'T ack → Kafka redeliver
    }
}
```

Reliability mode quan trọng → Phase 12 (Reliability + Acknowledgement).

## Tóm tắt bài 8

- Kafka maintain **ledger nội bộ**: (consumer group, partition) → current offset. Lưu trong topic `__consumer_offsets`.
- Mỗi consumer group có progress độc lập, không ảnh hưởng nhau.
- `kafka-consumer-groups.sh --describe --group X` show: CURRENT-OFFSET, LOG-END-OFFSET, LAG.
- LAG = LEO - current offset. 0 = caught up. >0 = backlog.
- Group `no active members` vẫn tồn tại trong ledger sau khi consumer disconnect (chờ rejoin). Auto cleanup sau 7 ngày inactive.
- `--from-beginning` (CLI) hoặc `auto.offset.reset` (app) chỉ effect **lần đầu** subscribe. Sau đó ledger là source of truth.
- **Reset offset** qua `--reset-offsets`: `--shift-by`, `--to-earliest`, `--to-latest`, `--to-offset`, `--by-duration`, `--to-datetime`.
- `--dry-run` để preview, `--execute` để apply. Stop consumers trước.
- Production caution: idempotent consumers required, communicate downstream cascade.
- Reset cho ops. App-level offset commit qua manual ack (Phase 12).

**Bài kế tiếp** → [Bài 9: Section Summary + Key takeaways](09-section-summary.md)
