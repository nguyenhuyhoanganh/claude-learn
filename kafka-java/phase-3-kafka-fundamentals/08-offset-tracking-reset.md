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

## Reset Consumer Offset

Use case khi cần reset:
1. **Bug trong consumer**: code xử lý sai, cần replay và xử lý lại đúng.
2. **Thêm feature mới**: consumer cần build state từ data lịch sử.
3. **Skip poison message**: nhảy qua offset gây crash consumer.
4. **Disaster recovery**: roll back về thời điểm trước incident.

CLI: `kafka-consumer-groups.sh --reset-offsets`.

> **Điều kiện tiên quyết**: phải **stop tất cả consumer trong group** trước. Kafka từ chối reset khi consumer đang active.

### Các option reset

| Option | Hành vi |
|---|---|
| `--shift-by N` | Cộng N vào current offset (N âm = lùi lại N message) |
| `--to-offset N` | Set offset tuyệt đối = N |
| `--to-earliest` | Reset về offset 0 (replay từ đầu) |
| `--to-latest` | Reset về LEO (bỏ qua mọi backlog) |
| `--by-duration PT5M` | Reset về 5 phút trước (định dạng ISO 8601 duration) |
| `--to-datetime <ISO>` | Reset về 1 timestamp cụ thể |
| `--to-current` | Giữ nguyên (no-op, dùng để verify) |

2 modifier:
- `--dry-run`: chỉ in ra "sẽ làm gì", **không apply** thật. Dùng để check trước.
- `--execute`: apply thật.

### Demo: shift-by -3 (lùi lại 3 message)

Tiếp tục từ demo trước. Consumer group `CG` hiện tại current offset = `6` (partition 0), `9` (partition 1). Backlog lag = 0.

Stop consumer trước.

#### Bước 1: Dry-run để xem sẽ ra gì

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

Tính: Partition 0: 6 - 3 = 3. Partition 1: 9 - 3 = 6. Reset áp dụng **cho mọi partition** trong topic (không chọn riêng).

#### Bước 2: Execute thật

```bash
./kafka-consumer-groups.sh \
  ... \
  --reset-offsets --shift-by -3 --execute
```

Describe sau khi execute:
```text
CG  ...  Partition 0  current 3  LEO 6  lag 3
CG  ...  Partition 1  current 6  LEO 9  lag 3
```

Restart consumer → nhận lại **3 + 3 = 6 message** (3 message cuối của mỗi partition).

### Reset về earliest — replay từ đầu

```bash
./kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 \
  --group CG \
  --topic offset-tracking-topic \
  --reset-offsets --to-earliest --execute
```

Use case: build state cho feature mới (vd thêm consumer "AnalyticsService" cần đọc lại toàn bộ event history để tính số liệu).

### Reset theo duration — re-process X giờ gần nhất

```bash
./kafka-consumer-groups.sh \
  ... \
  --reset-offsets --by-duration PT1H --execute
```

`PT1H` = 1 giờ. Định dạng ISO 8601 duration:
- `PT5M` = 5 phút
- `PT1H30M` = 1.5 giờ
- `P1D` = 1 ngày

Kafka tìm offset gần nhất theo timestamp "now - 1H" → reset đến đó.

### Reset về 1 thời điểm cụ thể

```bash
./kafka-consumer-groups.sh \
  ... \
  --reset-offsets --to-datetime 2026-05-30T10:00:00.000 --execute
```

Use case disaster recovery: "roll back về trước incident lúc 10 giờ sáng."

## Reset cho 1 topic, nhiều topic, hay 1 partition cụ thể

```bash
# Reset 1 topic cụ thể
--topic offset-tracking-topic

# Reset tất cả topic mà group subscribe
--all-topics

# Reset chỉ 1 partition cụ thể trong topic
--topic offset-tracking-topic:0   ← chỉ partition 0
```

## Lưu ý quan trọng cho production

| Lưu ý | Lý do |
|---|---|
| Stop tất cả consumer trước khi reset | Kafka từ chối reset nếu vẫn còn member active |
| Test ở staging trước | Reset = không thể undo (history sẽ bị process lại) |
| Tránh reset trong peak hours | Reprocess gây spike tải hệ thống |
| Communicate với downstream service | Event reprocess có thể tạo event downstream → cascade effect |
| Consumer phải **idempotent** | Xử lý cùng 1 message 2 lần phải an toàn (không double charge customer) |

**Idempotency** (tính chất xử lý lặp an toàn) cực kỳ quan trọng. Phase 13-14 (Error Handling, Transactions) sẽ đi sâu.

## Programmatic offset commit (Java/Spring)

Reset CLI là công cụ cho ops. Trong code app, có 2 mode commit offset:

```yaml
spring.kafka.consumer.enable-auto-commit: true   # default, auto commit mỗi 5 giây
# hoặc
spring.kafka.consumer.enable-auto-commit: false  # manual — code tự commit
```

Manual commit (production preferred):
```java
@KafkaListener(topics = "order-events")
public void handle(ConsumerRecord<String, String> record, Acknowledgment ack) {
    try {
        process(record);              // xử lý xong xuôi (DB write, etc.)
        ack.acknowledge();            // commit offset SAU KHI process xong
    } catch (Exception e) {
        // KHÔNG gọi ack → Kafka sẽ redeliver message này
        log.error("Process failed, will retry", e);
    }
}
```

Mode acknowledgement rất quan trọng cho reliability → Phase 12 sẽ học chi tiết.

## Tóm tắt bài 8

- Kafka maintain **ledger nội bộ** ánh xạ: `(consumer group, partition) → current offset`. Ledger này lưu trong internal topic `__consumer_offsets`.
- Mỗi consumer group có progress **độc lập**, không ảnh hưởng nhau.
- `kafka-consumer-groups.sh --describe --group X` hiện 3 thông tin chính: **CURRENT-OFFSET**, **LOG-END-OFFSET (LEO)**, **LAG**.
- **LAG = LEO - current offset**. 0 = consumer đã catch up. > 0 = còn backlog.
- Group có status `no active members` vẫn tồn tại trong ledger sau khi consumer disconnect (chờ rejoin). Auto cleanup sau 7 ngày inactive.
- `--from-beginning` (CLI) hoặc `auto.offset.reset` (app) chỉ có hiệu lực **lần đầu** group subscribe. Sau đó ledger là source of truth, các flag này bị ignore.
- **Reset offset** qua `--reset-offsets` với các option: `--shift-by`, `--to-earliest`, `--to-latest`, `--to-offset`, `--by-duration`, `--to-datetime`.
- Workflow: `--dry-run` preview trước, rồi `--execute` apply thật. Phải **stop consumer** trước khi reset.
- Lưu ý production: yêu cầu consumer **idempotent**, communicate cascade impact với downstream.
- Reset là tool cho ops. Trong app code, dùng manual ack mode để control offset commit (Phase 12).

**Bài kế tiếp** → [Bài 9: Section Summary + Key takeaways](09-section-summary.md)
