# Bài 4: Serialization, retention policies, và offset

3 khái niệm cốt lõi nữa trước khi đi vào consumer group:
1. **Serialization** — Kafka chỉ hiểu bytes, app phải tự chuyển đổi.
2. **Retention** — Kafka giữ data trong bao lâu? Không phải mãi mãi.
3. **Offset** — vị trí của 1 message trong topic, giống như index của array.

## Serialization & Deserialization

Kafka **KHÔNG hiểu cấu trúc message** của bạn. Từ góc nhìn của broker, mọi message chỉ là:
- Stream of bytes (luồng byte) nhận từ producer.
- Lưu xuống disk.
- Gửi bytes cho consumer khi consumer ask.

```text
Phía Producer:
  Java Object (OrderEvent { id, amount, ... })
       │
       │ serializer (đổi object → bytes)
       ▼
  byte[] → gửi đi Kafka broker

Phía Consumer:
  byte[] nhận từ broker
       │
       │ deserializer (đổi bytes → object)
       ▼
  Java Object (OrderEvent { id, amount, ... })
```

Serialization và deserialization là **trách nhiệm của producer + consumer app**, KHÔNG phải của broker.

### Built-in serializer (có sẵn trong Kafka client library)

| Kiểu dữ liệu | Serializer |
|---|---|
| String | `StringSerializer` |
| Integer | `IntegerSerializer` |
| Long | `LongSerializer` |
| ByteArray | `ByteArraySerializer` |
| UUID | `UUIDSerializer` |
| Double | `DoubleSerializer` |

Built-in chỉ cho **primitive type** (kiểu đơn giản).

### Complex object → JSON / Avro / Protobuf

Real app thường gửi object phức tạp như `OrderEvent`:

```java
public class OrderEvent {
    private String orderId;
    private double amount;
    private List<Item> items;
    // ...
}
```

3 lựa chọn phổ biến:

#### Option 1: JSON (đơn giản nhất, phổ biến nhất)

```java
ObjectMapper mapper = new ObjectMapper();   // Jackson
byte[] bytes = mapper.writeValueAsBytes(orderEvent);
```

Spring Cloud Stream auto-config Jackson cho bạn — không phải viết code thủ công. Phase 4 sẽ đi sâu.

Ưu điểm: human-readable (đọc được bằng mắt), schema flexible.
Nhược điểm: verbose (text dài), không có enforced schema, version evolution dễ vỡ (đổi field name → consumer cũ break).

#### Option 2: Avro

Schema-based binary format do Apache phát triển.

```text
File schema (.avsc):
{
  "type": "record",
  "name": "OrderEvent",
  "fields": [
    {"name": "orderId", "type": "string"},
    {"name": "amount", "type": "double"}
  ]
}
```

Ưu điểm: compact (gọn), enforce schema, có rule backward/forward compatibility.
Nhược điểm: cần Schema Registry (Confluent cung cấp) — setup phức tạp.

Đây là **industry standard cho production** ở các công ty lớn.

#### Option 3: Protobuf

Tương tự Avro, do Google phát triển. Cần file `.proto`.

Ưu điểm: cực compact, language-agnostic (sinh code cho Java, Go, Python, C++, ...).
Nhược điểm: cần schema registry tương tự Avro.

### Console producer/consumer = String mặc định

```bash
> hello
```

Bạn không config serializer. Vì sao vẫn chạy được?

Console tool **hard-code** dùng `StringSerializer` + `StringDeserializer`. Mọi input nhận là String, convert sang `byte[]`. Mọi output là String.

Production app **không nên** dựa vào default này — phải explicit khai báo serializer/deserializer trong config.

## Log Retention — Kafka giữ data trong bao lâu?

Kafka **KHÔNG phải database**. Mặc định không giữ data forever.

> **Log retention policy** = quy tắc broker xoá message cũ.

Default: **168 tiếng = 7 ngày**.

### 2 trục kiểm soát retention

#### Theo thời gian: `log.retention.hours`

```text
log.retention.hours = 168  (mặc định)
# hoặc đơn vị nhỏ hơn:
log.retention.minutes
log.retention.ms
```

Message cũ hơn 168 giờ → đủ điều kiện bị xoá.

#### Theo dung lượng: `log.retention.bytes`

```text
log.retention.bytes = -1  (mặc định = không giới hạn)
# hoặc set 10 GB:
log.retention.bytes = 10737418240
```

Topic vượt quá dung lượng này → segment cũ bị xoá.

### Cả 2 rule active — cái nào đến trước thì xoá

Cả 2 quy tắc chạy đồng thời. **Quy tắc nào đạt trước → trigger xoá**.

```text
Scenario A: log.retention.hours=168, log.retention.bytes=10GB
  Topic tăng đến 12GB sau 3 ngày → đạt dung lượng trước
  → xoá segment cũ nhất.

Scenario B: log.retention.hours=168, log.retention.bytes=10GB
  Topic 5GB sau 8 ngày → đạt thời gian trước
  → xoá segment cũ nhất.
```

### Background cleanup — broker tự động xoá định kỳ

Broker scan định kỳ (mặc định 5 phút 1 lần) → xoá những segment đủ điều kiện.

Property: `log.retention.check.interval.ms = 300000` (5 phút).

### Per-topic override — set retention riêng cho từng topic

```bash
./kafka-configs.sh \
  --bootstrap-server localhost:9092 \
  --entity-type topics \
  --entity-name critical-events \
  --alter \
  --add-config retention.ms=2592000000   # 30 ngày, chỉ áp dụng topic này
```

Topic critical (financial events, audit log) → giữ lâu hơn.
Topic trivial (clickstream, log debug) → giữ ngắn để tiết kiệm disk.

### `log.retention.bytes = -1` + retention dài = storage không giới hạn

Một số team coi Kafka như event store vĩnh viễn (pattern **Event Sourcing**):
```text
log.retention.ms = -1   (giữ mãi mãi)
log.retention.bytes = -1 (không giới hạn dung lượng)
```

→ Kafka trở thành event log permanent. Khi đó phải plan disk rất kỹ — dung lượng có thể tăng theo TB sau vài năm.

### Compaction — pattern thay thế retention

Mode khác hoàn toàn: **log compaction**.

```text
Topic "user-profile":
  key = userId, value = thông tin profile hiện tại của user.

Standard retention: xoá theo thời gian/dung lượng — bất kể key.
Compaction: chỉ giữ VALUE MỚI NHẤT cho mỗi key,
            xoá những entry cũ cùng key.

Use case: lưu "current state" trong Kafka.
  user 123 update profile lần 1 → message 1 (offset 5)
  user 123 update profile lần 2 → message 2 (offset 120)
  Compaction: xoá message 1, giữ message 2 (vì cùng key user 123).
```

Set `cleanup.policy=compact`. Chi tiết ở Phase 9.

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
- **Sequential** (tuần tự): 0, 1, 2, ... tăng dần khi có message mới được append.
- **Unique trong topic** (chính xác hơn: unique trong partition — chi tiết bài sau khi học partition).
- **Immutable** (bất biến): message ở offset 5 KHÔNG BAO GIỜ thay đổi sau khi đã ghi.
- **Long type**: giá trị tối đa = `Long.MAX_VALUE`.

### Max offset lớn cỡ nào?

`Long.MAX_VALUE = 9,223,372,036,854,775,807` (9.2 tỷ tỷ).

Tính: producer phát 1 triệu message/giây → cần 9.2 nghìn tỷ giây = **292,000 năm** để hết offset.

→ Thực tế **không bao giờ overflow** trong đời thực.

### Vì sao offset quan trọng?

3 use case chính:
1. **Order preservation** (giữ thứ tự): message delivered cho consumer **theo đúng thứ tự offset** (trong cùng partition).
2. **Consumer position tracking** (theo dõi vị trí consumer): consumer "đang ở offset 100" nghĩa là đã đọc đến đó, lần poll tiếp theo lấy từ offset 101.
3. **Replay** (đọc lại): consumer reset offset về 0 → đọc lại toàn bộ từ đầu (dùng cho debug, build state mới).

Phase sau (bài 8 offset tracking) sẽ đi sâu cách consumer commit offset, reset, etc.

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

### Use case của timestamp

- **Filter theo time range**: "show me messages từ 1 giờ trước".
- **Reset consumer offset theo thời gian**: `--to-datetime 2026-05-31T10:00:00` (bài 8 sẽ học).
- **Audit**: order này đặt vào lúc nào chính xác?
- **Lag calculation** (đo độ trễ): hiện tại - timestamp của message cũ nhất chưa process = lag.

### 2 kiểu timestamp

Kafka lưu 1 timestamp cho mỗi message. Kiểu được kiểm soát bằng property `message.timestamp.type`:

| Type | Ý nghĩa |
|---|---|
| `CreateTime` (default) | Thời điểm producer tạo record |
| `LogAppendTime` | Thời điểm broker nhận và append vào log |

`CreateTime` phản ánh **business time** (lúc event xảy ra thực sự).
`LogAppendTime` phản ánh **broker time** (lúc broker lưu message).

Hầu hết use case nên dùng `CreateTime`. `LogAppendTime` dùng khi không tin tưởng clock của producer (vd producer ở client device có thể bị set sai giờ).

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

- **Kafka chỉ lưu + chuyển bytes**. Serialize/deserialize là **trách nhiệm của app**, không phải broker.
- Built-in serializer cho primitive type (String, Integer, Long, UUID, ...). Complex object → **JSON (Jackson)**, **Avro**, hoặc **Protobuf**.
- Console tool hard-code `StringSerializer/Deserializer` — chỉ dùng cho debug, production app phải config explicit.
- **Retention default 168 giờ (7 ngày)**. Có thể set theo time hoặc size — cái nào đạt trước thì xoá.
- Per-topic override qua `kafka-configs.sh --alter` để giữ riêng cho từng topic.
- **Log compaction** = pattern thay thế retention, chỉ giữ latest value cho mỗi key (lưu state).
- **Offset** = index của message trong partition, sequential, immutable, `Long.MAX_VALUE` không bao giờ overflow trong thực tế (292,000 năm để hết).
- Offset cho 3 use case: order preservation, consumer position tracking, replay.
- Console option khi debug: `print.offset=true`, `print.timestamp=true`.
- Timestamp: `CreateTime` (default, producer time — business time) vs `LogAppendTime` (broker time).

**Bài kế tiếp** → [Bài 5: Multiple consumers + Consumer Groups](05-consumer-groups.md)
