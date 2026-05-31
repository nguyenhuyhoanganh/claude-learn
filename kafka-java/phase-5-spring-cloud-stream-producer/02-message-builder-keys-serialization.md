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

## ⚠️ `KafkaHeaders.KEY` vs `KafkaHeaders.RECEIVED_KEY` — important quirk

Producer set:
```java
.setHeader(KafkaHeaders.KEY, "key-1")   // "kafka_messageKey"
```

Consumer extract:
```java
msg.getHeaders().get(KafkaHeaders.RECEIVED_KEY)   // "kafka_receivedMessageKey" — DIFFERENT name!
```

Why? Spring **rename header on inbound** intentionally.

### Lý do — processor case

Processor consumes → produces:

```java
@Bean
public Function<Message<OrderEvent>, Message<PaymentEvent>> paymentProcessor() {
    return inMsg -> {
        PaymentEvent paymentEvent = compute(inMsg.getPayload());
        
        // Preserve trace headers
        return MessageBuilder
            .withPayload(paymentEvent)
            .copyHeaders(inMsg.getHeaders())     // ← copy ALL headers
            .build();
    };
}
```

`copyHeaders` copies traceId, source, etc. — useful cho observability.

**Vấn đề**: nếu inbound key header name = outbound key header name = `KafkaHeaders.KEY`:
- Input message: `KafkaHeaders.KEY = "order-123"` (key from OrderEvent topic).
- Processor copyHeaders → output Message also has `KafkaHeaders.KEY = "order-123"`.
- Output sent to PaymentEvent topic with key `"order-123"` — but **maybe accidental**, maybe PaymentEvent should use different key (paymentId).

Spring's solution: rename inbound key to `RECEIVED_KEY`. `copyHeaders` won't accidentally set outbound key. Have to **explicitly** set outbound `KafkaHeaders.KEY` if want it.

```java
Message<PaymentEvent> outMsg = MessageBuilder
    .withPayload(paymentEvent)
    .copyHeaders(inMsg.getHeaders())              // traceId, source - safe
    .setHeader(KafkaHeaders.KEY, paymentEvent.id) // explicit new key
    .build();
```

Defensive design. Avoids surprise.

Pattern apply for:
- `KafkaHeaders.KEY` outbound, `KafkaHeaders.RECEIVED_KEY` inbound.
- `KafkaHeaders.TOPIC` outbound, `KafkaHeaders.RECEIVED_TOPIC` inbound.
- `KafkaHeaders.PARTITION` outbound, `KafkaHeaders.RECEIVED_PARTITION` inbound.

## Run + observe consumer output

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

✅ Full visibility into message metadata.

### 2 partitions → distribution

Tạo topic 2 partitions:
```bash
./kafka-topics.sh ... --delete --topic demo-topic
./kafka-topics.sh ... --create --topic demo-topic --partitions 2
```

Producer sends with keys `key-1`, `key-2`, ...

Consumer log:
```text
key=key-1   partition=0   offset=0
key=key-2   partition=1   offset=0
key=key-3   partition=0   offset=1
key=key-4   partition=1   offset=1
...
```

Same key → same partition (hash deterministic). Demo Phase 3 bài 6 confirmed.

## Consumer flexible — accept payload OR Message

If consumer doesn't care about key/headers:

```java
@Bean
public Consumer<String> consumer() {
    return payload -> log.info("payload: {}", payload);
}
```

Spring extract payload only. **Producer can still send with key + headers** — consumer just ignores.

→ Producer always `Message<T>` to set key. Consumer choose `Message<T>` or `T` based on needs.

## Processor cũng theo pattern

```java
@Bean
public Function<Message<OrderEvent>, Message<PaymentEvent>> paymentProcessor() {
    return inMsg -> {
        OrderEvent order = inMsg.getPayload();
        PaymentEvent payment = chargeCard(order);
        
        return MessageBuilder
            .withPayload(payment)
            .copyHeaders(inMsg.getHeaders())        // preserve traceId etc.
            .setHeader(KafkaHeaders.KEY, payment.id)
            .build();
    };
}
```

Function<Message<A>, Message<B>>. Both sides Message-typed. Pattern uniform.

## Best practices

| Practice | Why |
|---|---|
| Always send producer messages as `Message<T>` | Cho phép thêm key + headers sau |
| Choose meaningful key (entity ID) | Ordering + partition distribution |
| Explicit `key.serializer` / `key.deserializer` | Spring không guess. Avoid runtime SerializationException. |
| Use `copyHeaders` cho processor (trace propagation) | Observability across services |
| `KafkaHeaders.RECEIVED_KEY` to read, `KafkaHeaders.KEY` to write | Avoid accidental key copy in processors |
| Custom headers cho metadata (traceId, source, user-id) | Debug + audit |

## Anti-patterns

| Anti-pattern | Problem | Fix |
|---|---|---|
| Send `String` from producer when key needed | Lost partition ordering | Use `Message<String>` + `KafkaHeaders.KEY` |
| Forget `key.serializer` config | `SerializationException` runtime | Add to YAML |
| Use random key (UUID) "for distribution" | Lose ordering semantic | Choose entity ID |
| Read inbound key via `KafkaHeaders.KEY` | Wrong header name → null | Use `RECEIVED_KEY` |
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
