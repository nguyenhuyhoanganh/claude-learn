# Bài 2: Message Builder + key serialization

Phase 3 đã nói: Kafka message có key (quan trọng cho partition + ordering). Đến giờ producer ta chỉ gửi value `"message-1"` — **không có key**.

Bài này: dùng `MessageBuilder` để gửi message với **key + headers**, fix serialization exception ban đầu, và đọc message structure ở consumer side.

## Kafka message attributes

Mỗi Kafka record có:

| Attribute | Purpose | Required? |
|---|---|---|
| **Key** | Determine partition + ordering | Optional (null OK) |
| **Value** | Payload (event data) | Required |
| **Headers** | Custom key-value metadata | Optional |
| **Timestamp** | Event time (producer) hoặc log append time (broker) | Auto set |
| **Topic** | Where stored | Required |
| **Partition** | Which partition | Auto (or manual) |
| **Offset** | Position in partition | Auto by broker |

Producer set: key, value, headers, timestamp. Broker set: partition (via hash), offset.

## Spring's `Message<T>` + `MessageBuilder`

Spring framework có abstraction `org.springframework.messaging.Message<T>` chứa **payload + headers**. SCS dùng nó.

### Build message với key

```java
import org.springframework.messaging.Message;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.kafka.support.KafkaHeaders;

Message<String> msg = MessageBuilder
    .withPayload("message-1")                       // value
    .setHeader(KafkaHeaders.KEY, "key-1")           // partition key
    .setHeader("traceId", "req-abc-123")            // custom header
    .setHeader("source", "web")                     // custom header
    .build();
```

`MessageBuilder` fluent API. Trả về `Message<String>` (payload type `String`).

`KafkaHeaders.KEY` = string constant `"kafka_messageKey"`. Spring map to Kafka record's key.

### Producer supplier returns Message<T>

Update:

```java
@Bean
public Supplier<Message<String>> messageProducer() {
    return () -> buildMessage(counter.incrementAndGet());
}

private Message<String> buildMessage(int counter) {
    return MessageBuilder
        .withPayload("message-" + counter)
        .setHeader(KafkaHeaders.KEY, "key-" + counter)
        .setHeader("traceId", UUID.randomUUID().toString())
        .build();
}
```

Output type `Message<String>` thay vì `String`. SCS detect → extract payload + headers → send với key.

### YAML

```yaml
# section03/04-message-producer.yaml
spring:
  cloud:
    function:
      definition: messageProducer
    stream:
      kafka:
        binder:
          brokers: localhost:9092
      bindings:
        messageProducer-out-0:
          destination: demo-topic
      poller:
        fixed-delay: 1000
```

Same structure như supplier basic. SCS handle Message<T> automatically.

## Run + observe — and get an EXCEPTION

Run producer. Expect... **exception**:

```text
org.apache.kafka.common.errors.SerializationException: 
  Can't convert key of class java.lang.String to class [B configured 
  in key.serializer
```

Hmm. Vì sao?

## Vấn đề: key serialization

Phase 3 bài 4 đã đề cập: **Kafka stores + transports bytes only**. App phải serialize.

### Spring auto-handle value

```java
Message<String> msg = ... // payload = String
```

Spring biết payload là `String` → use `StringSerializer` → bytes. OK.

### Spring KHÔNG auto-handle key

Key là **gì**?
- `"key-1"` looks like String?
- But có thể là Integer? Long? UUID? Custom type?

Spring không guess. Mỗi type → different byte representation → khác partition → có thể break ordering.

→ **Phải explicit** key serializer.

### Fix: config key.serializer

```yaml
spring:
  cloud:
    stream:
      kafka:
        bindings:
          messageProducer-out-0:
            producer:
              configuration:
                key.serializer: org.apache.kafka.common.serialization.StringSerializer
        binder:
          brokers: localhost:9092
      bindings:
        messageProducer-out-0:
          destination: demo-topic
      poller:
        fixed-delay: 1000
```

Add `key.serializer` raw Kafka property under SCS Kafka binder section.

Available serializers (built-in Kafka):

| Type | Serializer |
|---|---|
| String | `org.apache.kafka.common.serialization.StringSerializer` |
| Integer | `IntegerSerializer` |
| Long | `LongSerializer` |
| UUID | `UUIDSerializer` |
| Bytes | `ByteArraySerializer` (default, raw bytes) |
| Double | `DoubleSerializer` |

Complex types → JSON / Avro serializer (custom config).

### Run again

```text
[Producer ...] key.serializer = StringSerializer
Sending message-1 with key key-1...
Sending message-2 with key key-2...
```

✅ No exception. Messages flow.

## Consumer side — receive `Message<T>` to access metadata

Default consumer:
```java
@Bean
public Consumer<String> consumer() {
    return msg -> log.info("received: {}", msg);  // only payload
}
```

Missing key + headers info.

### Upgrade: receive Message<T>

```java
@Bean
public Consumer<Message<String>> messageConsumer() {
    return msg -> handleMessage(msg);
}

private void handleMessage(Message<String> msg) {
    log.info("full message: {}", msg);
    
    // Access individual attributes
    Object key = msg.getHeaders().get(KafkaHeaders.RECEIVED_KEY);  // ← NOTE
    Object payload = msg.getPayload();
    Object traceId = msg.getHeaders().get("traceId");
    Object topic = msg.getHeaders().get(KafkaHeaders.RECEIVED_TOPIC);
    Object partition = msg.getHeaders().get(KafkaHeaders.RECEIVED_PARTITION);
    Object offset = msg.getHeaders().get(KafkaHeaders.OFFSET);
    
    log.info("key={} payload={} traceId={} topic={} partition={} offset={}",
        key, payload, traceId, topic, partition, offset);
}
```

### Consumer-side YAML

```yaml
# section03/03-message-consumer.yaml
spring:
  cloud:
    function:
      definition: messageConsumer
    stream:
      kafka:
        binder:
          brokers: localhost:9092
        bindings:
          messageConsumer-in-0:
            consumer:
              configuration:
                key.deserializer: org.apache.kafka.common.serialization.StringDeserializer
                auto.offset.reset: earliest
      bindings:
        messageConsumer-in-0:
          destination: demo-topic
          group: demo-group
```

`key.deserializer` mirror producer side: `StringDeserializer`.

## ⚠️ `KafkaHeaders.KEY` vs `KafkaHeaders.RECEIVED_KEY` — quirk quan trọng cần nhớ

Producer set header với hằng số `KafkaHeaders.KEY`:
```java
.setHeader(KafkaHeaders.KEY, "key-1")   // tên thực tế: "kafka_messageKey"
```

Consumer đọc với hằng số **khác**:
```java
msg.getHeaders().get(KafkaHeaders.RECEIVED_KEY)   // tên thực tế: "kafka_receivedMessageKey"
```

→ Producer và consumer dùng **2 tên header khác nhau** cho cùng 1 khái niệm "key"!

Vì sao? Spring **cố ý rename header khi vào inbound**.

### Lý do — trường hợp processor

Processor consume từ 1 topic và emit ra topic khác:

```java
@Bean
public Function<Message<OrderEvent>, Message<PaymentEvent>> paymentProcessor() {
    return inMsg -> {
        PaymentEvent paymentEvent = compute(inMsg.getPayload());
        
        // Giữ lại các header cho trace context
        return MessageBuilder
            .withPayload(paymentEvent)
            .copyHeaders(inMsg.getHeaders())     // ← copy TẤT CẢ header
            .build();
    };
}
```

`copyHeaders` copy `traceId`, `source`, ... — rất hữu ích cho observability (theo dõi flow request qua nhiều service).

**Vấn đề**: nếu inbound key và outbound key dùng **CÙNG header name** = `KafkaHeaders.KEY`:
- Input message: `KafkaHeaders.KEY = "order-123"` (key từ OrderEvent topic).
- Processor gọi `copyHeaders` → output Message cũng có `KafkaHeaders.KEY = "order-123"`.
- Output message gửi sang PaymentEvent topic với key `"order-123"` — nhưng **có thể là vô tình**! PaymentEvent có thể cần dùng key khác (vd `paymentId`).

Giải pháp của Spring: **rename inbound key thành `RECEIVED_KEY`**. Khi đó:
- `copyHeaders` chỉ copy header thường (traceId, source), KHÔNG copy key.
- Muốn outbound message có key → phải **explicit** set `KafkaHeaders.KEY`.

```java
Message<PaymentEvent> outMsg = MessageBuilder
    .withPayload(paymentEvent)
    .copyHeaders(inMsg.getHeaders())              // traceId, source — safe, không bị set key
    .setHeader(KafkaHeaders.KEY, paymentEvent.id) // explicit set key mới
    .build();
```

Đây là **defensive design** — tránh side effect không mong muốn.

Pattern này áp dụng cho cả:
- `KafkaHeaders.KEY` (outbound) ↔ `KafkaHeaders.RECEIVED_KEY` (inbound).
- `KafkaHeaders.TOPIC` (outbound) ↔ `KafkaHeaders.RECEIVED_TOPIC` (inbound).
- `KafkaHeaders.PARTITION` (outbound) ↔ `KafkaHeaders.RECEIVED_PARTITION` (inbound).

## Chạy demo + quan sát output consumer

```text
full message: GenericMessage [payload=message-32, headers={
  kafka_receivedMessageKey=key-32,
  traceId=req-abc-123,
  kafka_receivedTopic=demo-topic,
  kafka_offset=45,
  kafka_receivedPartitionId=1,
  kafka_receivedTimestamp=1717153425123,
  ...
}]

key=key-32 payload=message-32 traceId=req-abc-123 topic=demo-topic partition=1 offset=45
```

✅ Truy cập đầy đủ metadata của message.

### 2 partition → distribution theo hash key

Tạo topic 2 partition:
```bash
./kafka-topics.sh ... --delete --topic demo-topic
./kafka-topics.sh ... --create --topic demo-topic --partitions 2
```

Producer gửi với key `key-1`, `key-2`, `key-3`, ...

Log consumer:
```text
key=key-1   partition=0   offset=0
key=key-2   partition=1   offset=0
key=key-3   partition=0   offset=1
key=key-4   partition=1   offset=1
...
```

Cùng key → cùng partition (hash deterministic). Đã xác nhận trong demo Phase 3 bài 6.

## Consumer linh hoạt — nhận payload hoặc Message

Nếu consumer không cần key/header, có thể chỉ nhận payload:

```java
@Bean
public Consumer<String> consumer() {
    return payload -> log.info("payload: {}", payload);
}
```

Spring chỉ extract payload, bỏ qua header. **Producer vẫn có thể gửi với key + header** — consumer chỉ ignore phần đó.

→ Pattern khuyến nghị: **producer luôn dùng `Message<T>`** để set key + header. **Consumer chọn `Message<T>` hoặc `T`** tuỳ nhu cầu.

## Processor — pattern tương tự

```java
@Bean
public Function<Message<OrderEvent>, Message<PaymentEvent>> paymentProcessor() {
    return inMsg -> {
        OrderEvent order = inMsg.getPayload();
        PaymentEvent payment = chargeCard(order);
        
        return MessageBuilder
            .withPayload(payment)
            .copyHeaders(inMsg.getHeaders())        // giữ traceId
            .setHeader(KafkaHeaders.KEY, payment.id) // key mới cho payment topic
            .build();
    };
}
```

Signature: `Function<Message<A>, Message<B>>`. Cả input và output đều dạng Message — pattern uniform.

## Best practices

| Best practice | Lý do |
|---|---|
| Producer luôn gửi qua `Message<T>` | Sau này muốn thêm key + header thì dễ |
| Chọn key có ý nghĩa (entity ID) | Ordering + phân bố partition đều |
| Set explicit `key.serializer` / `key.deserializer` | Spring KHÔNG tự đoán. Tránh `SerializationException` runtime |
| Dùng `copyHeaders` ở processor | Giữ trace context (traceId, source) qua nhiều service |
| Đọc inbound key qua `KafkaHeaders.RECEIVED_KEY`, set outbound qua `KafkaHeaders.KEY` | Tránh accidental copy key trong processor |
| Custom header cho metadata (traceId, source, userId) | Debug + audit |

## Anti-pattern

| Anti-pattern | Vấn đề | Sửa |
|---|---|---|
| Producer gửi `String` khi cần key | Mất ordering theo partition | Dùng `Message<String>` + `KafkaHeaders.KEY` |
| Quên config `key.serializer` | Runtime báo `SerializationException` | Thêm vào YAML |
| Dùng key random (UUID) "để phân bố đều" | Mất ý nghĩa ordering | Chọn entity ID làm key |
| Đọc inbound key qua `KafkaHeaders.KEY` | Sai tên header → trả về null | Dùng `RECEIVED_KEY` ở consumer/processor input |
| Hardcode header names as strings | Typo prone | Use `KafkaHeaders.*` constants |
| Heavy logic in producer supplier | Blocks poller | Compute outside, supplier returns ready |

## Tóm tắt bài 2

- Kafka record: **key + value + headers + timestamp + topic + partition + offset**.
- Spring's `Message<T>` = abstraction over payload + headers.
- `MessageBuilder.withPayload(...).setHeader(KafkaHeaders.KEY, ...).build()` → fluent build.
- Spring **không** auto serialize key — types are ambiguous.
- Must config `key.serializer` (producer) + `key.deserializer` (consumer) explicitly.
- Built-in: `StringSerializer`, `IntegerSerializer`, `LongSerializer`, etc.
- Consumer: receive `Message<T>` để access key + headers. Use `KafkaHeaders.RECEIVED_KEY`.
- Spring **renames inbound headers** (`KEY` → `RECEIVED_KEY`) để tránh accidental copy in processor.
- Consumer flexible: `T` payload-only hoặc `Message<T>` full metadata.

**Bài kế tiếp** → [Bài 3: StreamBridge — dynamic message production](03-streambridge.md)
