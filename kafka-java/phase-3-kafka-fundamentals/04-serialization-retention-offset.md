# Bài 4: Serialization, retention policies, và offset

3 khái niệm cốt lõi nữa trước khi đi vào consumer group:
1. **Serialization** — Kafka chỉ hiểu bytes, app phải convert.
2. **Retention** — Kafka giữ data bao lâu? Không phải forever.
3. **Offset** — vị trí của 1 message trong topic, giống array index.

## Serialization & Deserialization

Kafka **không hiểu cấu trúc message của bạn**. Nó chỉ thấy:
- Stream of bytes from producer.
- Store on disk.
- Send bytes to consumer.

```text
Producer side:
  Java Object (OrderEvent { id, amount, ... })
       │
       │ serializer
       ▼
  byte[] → Kafka broker

Consumer side:
  byte[] from broker
       │
       │ deserializer
       ▼
  Java Object (OrderEvent { id, amount, ... })
```

Serialization is **producer + consumer's job**, không phải broker.

### Built-in serializers (Kafka client library)

| Type | Serializer |
|---|---|
| String | `StringSerializer` |
| Integer | `IntegerSerializer` |
| Long | `LongSerializer` |
| ByteArray | `ByteArraySerializer` |
| UUID | `UUIDSerializer` |

Built-in cho primitive types only.

### Complex objects → JSON / Avro / Protobuf

Real app sends `OrderEvent`:

```java
public class OrderEvent {
    private String orderId;
    private double amount;
    private List<Item> items;
    // ...
}
```

3 options:

#### Option 1: JSON (dễ nhất)

```java
ObjectMapper mapper = new ObjectMapper();
byte[] bytes = mapper.writeValueAsBytes(orderEvent);
```

Spring Cloud Stream auto-config Jackson — bạn không phải viết. Phase 4 deep-dive.

Pros: human-readable, schema-flexible.
Cons: verbose (text), no enforced schema, version evolution dễ vỡ.

#### Option 2: Avro

Schema-based binary format.

```text
schema (file .avsc):
{
  "type": "record",
  "name": "OrderEvent",
  "fields": [
    {"name": "orderId", "type": "string"},
    {"name": "amount", "type": "double"}
  ]
}
```

Pros: compact, schema enforcement, backward/forward compat rules.
Cons: cần Schema Registry (Confluent), setup phức tạp.

Industry standard cho production.

#### Option 3: Protobuf

Tương tự Avro, Google-developed. Cần `.proto` file.

Pros: cực compact, language-agnostic.
Cons: schema registry tương tự.

### Console producer/consumer = String default

```bash
> hello
```

Bạn không config serializer. Vì sao work?

Console tool **hard-code StringSerializer + StringDeserializer**. Mọi input lấy là String, convert sang `byte[]`. Mọi output là String.

Production app không dùng default này — phải explicit specify serializer trong config.

## Log Retention — Kafka giữ data bao lâu?

Kafka **không phải database**. Không giữ data forever theo default.

> **Log retention policy** = quy tắc broker delete old messages.

Default: **168 hours = 7 days**.

### 2 trục:

#### Time-based: `log.retention.hours`

```text
log.retention.hours = 168  (default)
# hoặc
log.retention.minutes
log.retention.ms
```

Message sau 168h → eligible for deletion.

#### Size-based: `log.retention.bytes`

```text
log.retention.bytes = -1  (default = unlimited)
# hoặc set 10 GB
log.retention.bytes = 10737418240
```

Topic vượt size → old segments deleted.

### Whichever first

Cả 2 rule active đồng thời. **Whichever met first** → deletion.

```text
Scenario A: log.retention.hours=168, log.retention.bytes=10GB
  Topic grow 12GB sau 3 ngày → size hit trước → delete oldest segments.

Scenario B: log.retention.hours=168, log.retention.bytes=10GB
  Topic 5GB sau 8 ngày → time hit trước → delete oldest.
```

### Background cleanup

Broker periodically scan (default every 5 min) → delete eligible segments.

`log.retention.check.interval.ms = 300000` (5 min).

### Per-topic override

```bash
./kafka-configs.sh \
  --bootstrap-server localhost:9092 \
  --entity-type topics \
  --entity-name critical-events \
  --alter \
  --add-config retention.ms=2592000000   # 30 days for this topic only
```

Critical events giữ lâu hơn. Trivial events giữ ngắn để tiết kiệm disk.

### `log.retention.bytes = -1` + long retention = unlimited storage

Some teams treat Kafka as event store (Event Sourcing pattern):
```text
log.retention.ms = -1   (forever)
log.retention.bytes = -1 (no size limit)
```

→ Kafka thành event log permanent. Cần disk planning kỹ.

### Compaction — alternative cho retention

Mode khác: **log compaction**.

```text
Topic "user-profile" - key = userId, value = latest profile.

Standard retention: delete cũ sau 7 ngày.
Compaction: keep only LATEST value per key, drop older entries with same key.

Use case: store "current state" trong Kafka.
```

Set `cleanup.policy=compact`. Detail ở Phase 9.

## Offset — vị trí trong topic

Topic = **append-only, immutable structure**, giống array.

```text
Topic "demo-topic":
+──+──+──+──+──+──+──+──+──+
│ 0│ 1│ 2│ 3│ 4│ 5│ 6│ 7│ 8│   ← offset (giống array index)
+──+──+──+──+──+──+──+──+──+
│hi│ a│ b│ c│ d│ e│ 1│ 2│ 3│   ← message content
+──+──+──+──+──+──+──+──+──+

  ▲                          ▲
  │                          │
oldest                     newest (next: offset 9)
```

Tính chất:
- **Sequential**: 0, 1, 2, ... tăng dần khi message append.
- **Unique within topic** (within partition — detail bài sau).
- **Immutable**: message ở offset 5 không bao giờ đổi.
- **Long type**: max = `Long.MAX_VALUE`.

### Max offset bao lớn?

`Long.MAX_VALUE = 9,223,372,036,854,775,807`.

Producer 1M msg/sec → 9.2 quintillion / 1M = 9.2 trillion seconds = **292,000 years** để overflow.

→ Thực tế không overflow.

### Vì sao offset quan trọng?

3 use case chính:
1. **Order preservation**: messages delivered to consumer **theo thứ tự offset** (within partition).
2. **Consumer position tracking**: consumer "ở offset 100" = đã đọc đến đó, lần sau pull từ 101.
3. **Replay**: consumer reset offset về 0 → đọc lại từ đầu.

Phase sau (offset tracking) deep-dive cách consumer commit offset, reset, etc.

## Demo: print offset trong console consumer

Reset state cho clean demo:

```bash
docker compose down
docker compose up -d
docker exec -it kafka bash
cd /opt/kafka/bin
./kafka-topics.sh --bootstrap-server localhost:9092 --create --topic demo-topic
```

Terminal 1 — consumer với `print.offset=true`:

```bash
./kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic demo-topic \
  --property print.offset=true
```

Terminal 2 — producer:

```bash
./kafka-console-producer.sh --bootstrap-server localhost:9092 --topic demo-topic
> hi
> hello
> a
> b
```

Consumer output:

```text
Offset:0  hi
Offset:1  hello
Offset:2  a
Offset:3  b
```

Offset increments với mỗi message.

## Demo: print timestamp

Kafka cũng lưu **timestamp** của mỗi message — thời điểm message được produce.

```bash
./kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic demo-topic \
  --from-beginning \
  --property print.offset=true \
  --property print.timestamp=true
```

Output:

```text
CreateTime:1717153425123  Offset:0  hi
CreateTime:1717153428456  Offset:1  hello
CreateTime:1717153432789  Offset:2  a
CreateTime:1717153435012  Offset:3  b
```

`CreateTime` = Unix epoch milliseconds. Convert:
```bash
date -r 1717153425  # macOS
# Fri May 31 10:23:45 +07 2026
```

### Timestamp use case

- **Filter time range**: "show me messages from last hour".
- **Reset consumer offset by time**: `--to-datetime 2026-05-31T10:00:00` (Phase later).
- **Audit**: when was this order placed exactly?
- **Lag calculation**: now - oldest unprocessed timestamp = lag.

### 2 timestamp types

Kafka stores 1 timestamp per message, type controlled by `message.timestamp.type`:

| Type | Meaning |
|---|---|
| `CreateTime` (default) | Time producer created the record |
| `LogAppendTime` | Time broker received and appended |

CreateTime reflects business time. LogAppendTime reflects broker time. Most use CreateTime.

## Recap

```text
Producer App
  │
  │ Java Object
  ▼
[Serializer] → byte[]
  │
  ▼ (over TCP)
+──────────────────────────────────────────+
│ Kafka Broker (stores bytes only)         │
│                                          │
│ Topic: "demo-topic"                      │
│ Offset:  0   1   2   3   4   ...         │
│ Bytes:  [.][.][.][.][.] ...              │
│ Time:   t0  t1  t2  t3  t4               │
│                                          │
│ Retention: delete after 7 days OR 10 GB  │
+──────────────────────────────────────────+
  │
  ▼ (consumer pull)
[Deserializer] → byte[] → Java Object
  │
  ▼
Consumer App
```

## Tóm tắt bài 4

- **Kafka chỉ store + transport bytes**. Serialize/deserialize là **app's responsibility**.
- Built-in serializers cho primitive. Complex objects → **JSON (Jackson)**, **Avro**, or **Protobuf**.
- Console tools hard-code `StringSerializer/Deserializer` — chỉ cho debug.
- **Retention default 168h (7 ngày)**. Có thể by time hoặc size, whichever first.
- Per-topic override qua `kafka-configs.sh --alter`.
- **Log compaction** = alternative giữ chỉ latest value per key (state store pattern).
- **Offset** = index của message trong topic, sequential, immutable, `Long.MAX_VALUE` không bao giờ overflow.
- Offset → order preservation, consumer tracking, replay.
- Console option: `print.offset=true`, `print.timestamp=true` để debug.
- Timestamp: `CreateTime` (default, producer time) vs `LogAppendTime` (broker time).

**Bài kế tiếp** → [Bài 5: Multiple consumers + Consumer Groups](05-consumer-groups.md)
