# Bài 1: Processor pattern — 1-to-1 mapping, filter, splitting

Processor = Consumer + Producer. Consume từ input topic, emit ra output topic. Bài này: 3 sub-patterns thiết yếu — **1-to-1 mapping**, **filter**, **1-to-many splitting**.

Tương đương Java Stream API:
- `map` = 1-to-1.
- `filter` = 0-or-1.
- `flatMap` = 1-to-many.

## Setup project

```text
Section 07:
  producer/   → emit OrderEvent (random product type)
  processor/
    PaymentProcessor       (1-to-1)
    ShipmentProcessor      (filter)
    NotificationProcessor  (1-to-many)
  consumer/   → log payment-events, shipment-events, notification-events
  dto/        → OrderEvent, PaymentEvent, ShipmentEvent, NotificationEvent
```

Producer emit `OrderEvent` every 1s. Mỗi run: enable **1 processor type** + 1 consumer chứa multiple bean để xem output.

### DTOs

```java
public enum ProductType {
    DIGITAL, PHYSICAL
}

public record OrderEvent(
    int orderId,
    int customerId,
    int amount,
    ProductType productType
) {}

public record PaymentEvent(int orderId, int amount) {}

public record ShipmentEvent(int orderId, String address) {}

public record NotificationEvent(int orderId, String channel, String destination) {}
```

Java records → clean, immutable, auto-generate equals/hashCode/toString. Perfect cho DTO.

### Producer

```java
@Configuration
public class ProducerConfig {

    private final AtomicInteger counter = new AtomicInteger();
    private final Random random = new Random();

    @Bean
    public Supplier<OrderEvent> producer() {
        return () -> {
            int id = counter.incrementAndGet();
            ProductType type = (id % 2 == 0) ? ProductType.PHYSICAL : ProductType.DIGITAL;
            return new OrderEvent(id, id, random.nextInt(1, 1000), type);
        };
    }
}
```

ID even → PHYSICAL, odd → DIGITAL. Random amount.

### Consumer (multiple beans)

```java
@Configuration
public class ConsumerConfig {

    private static final Logger log = LoggerFactory.getLogger(ConsumerConfig.class);

    @Bean
    public Consumer<PaymentEvent> paymentConsumer() {
        return e -> log.info("payment: {}", e);
    }

    @Bean
    public Consumer<ShipmentEvent> shipmentConsumer() {
        return e -> log.info("shipment: {}", e);
    }

    @Bean
    public Consumer<NotificationEvent> notificationConsumer() {
        return e -> log.info("notification: {}", e);
    }
}
```

3 separate beans (different DTOs) — Phase 4 bài 4 best practice.

### Consumer YAML (activate all 3)

```yaml
# section07/01-consumer.yaml
spring:
  cloud:
    function:
      definition: paymentConsumer;shipmentConsumer;notificationConsumer
    stream:
      kafka:
        binder:
          brokers: localhost:9092
      bindings:
        paymentConsumer-in-0:
          destination: payment-events
          group: demo-group
        shipmentConsumer-in-0:
          destination: shipment-events
          group: demo-group
        notificationConsumer-in-0:
          destination: notification-events
          group: demo-group
```

### Producer YAML

```yaml
# section07/02-producer.yaml
spring:
  cloud:
    function:
      definition: producer
    stream:
      kafka:
        binder:
          brokers: localhost:9092
      bindings:
        producer-out-0:
          destination: order-events
      poller:
        fixed-delay: 1000
```

## Pattern 1: 1-to-1 Mapping (PaymentProcessor)

> Mỗi input event → **đúng 1** output event.

```java
@Configuration
public class ProcessorConfig {

    @Bean
    public Function<OrderEvent, PaymentEvent> paymentProcessor() {
        return order -> new PaymentEvent(order.orderId(), order.amount());
    }
}
```

`Function<Input, Output>`. SCS hiểu:
- Subscribe `paymentProcessor-in-0` → receive OrderEvent.
- Publish `paymentProcessor-out-0` → send PaymentEvent.

### YAML

```yaml
# section07/03-payment-processor.yaml
spring:
  cloud:
    function:
      definition: paymentProcessor
    stream:
      kafka:
        binder:
          brokers: localhost:9092
      bindings:
        paymentProcessor-in-0:
          destination: order-events
          group: payment-service       # consumer group
        paymentProcessor-out-0:
          destination: payment-events
```

Notice cả 2 binding cho cùng bean — `in-0` + `out-0`.

### Run

1. Consumer (subscribes 3 output topics).
2. Processor (subscribes `order-events`, publishes `payment-events`).
3. Producer (publishes `order-events`).

Consumer log:
```text
payment: PaymentEvent[orderId=1, amount=523]
payment: PaymentEvent[orderId=2, amount=812]
payment: PaymentEvent[orderId=3, amount=147]
payment: PaymentEvent[orderId=4, amount=689]
```

✅ Mỗi OrderEvent → 1 PaymentEvent. 1-to-1.

### Production reality

Real processor:

```java
@Bean
public Function<OrderEvent, PaymentEvent> paymentProcessor(PaymentService service) {
    return order -> service.processPayment(order);   // call business logic
}
```

`PaymentService` handle: validate, call Stripe, save DB, return `PaymentEvent`. Bean thin.

## Pattern 2: Filter — conditional emit (ShipmentProcessor)

> Mỗi input event → **0 hoặc 1** output event.

Use case: ShipmentEvent chỉ cho PHYSICAL products. DIGITAL skip.

```java
@Bean
public Function<OrderEvent, ShipmentEvent> shipmentProcessor() {
    return order -> {
        if (order.productType() == ProductType.PHYSICAL) {
            return new ShipmentEvent(order.orderId(), "123 Main St");
        }
        return null;       // ← null = skip emit
    };
}
```

Return `null` → SCS hiểu "không emit". Skip silently.

### YAML

```yaml
# section07/04-shipment-processor.yaml
spring:
  cloud:
    function:
      definition: shipmentProcessor
    stream:
      kafka:
        binder:
          brokers: localhost:9092
      bindings:
        shipmentProcessor-in-0:
          destination: order-events
          group: shipping-service
        shipmentProcessor-out-0:
          destination: shipment-events
```

### Run

Producer emit OrderEvents IDs 1, 2, 3, 4, 5, ... (odd=DIGITAL, even=PHYSICAL).

Consumer log:
```text
shipment: ShipmentEvent[orderId=2, address=...]
shipment: ShipmentEvent[orderId=4, address=...]
shipment: ShipmentEvent[orderId=6, address=...]
shipment: ShipmentEvent[orderId=8, address=...]
```

✅ Chỉ even IDs (PHYSICAL). DIGITAL skipped.

### Alternative: Java's Predicate-based filter

SCS có integration với `Function<T, Mono<T>>` reactive filter, hoặc Spring Integration filter components. Cho most case, `null` return đủ và đơn giản.

## Pattern 3: 1-to-many Splitting (NotificationProcessor)

> Mỗi input event → **N** output events.

Use case: 1 OrderEvent → 2 NotificationEvent (SMS + Email).

### Cách viết SAI (naive)

```java
@Bean
public Function<OrderEvent, List<NotificationEvent>> notificationProcessor() {
    return order -> List.of(
        new NotificationEvent(order.orderId(), "SMS", "+1234567890"),
        new NotificationEvent(order.orderId(), "EMAIL", "user@example.com")
    );
}
```

Chuyện gì xảy ra?

SCS hiểu: "function trả về **1 giá trị** kiểu `List<NotificationEvent>`" → **emit 1 message** với payload là **toàn bộ List**.

Consumer nhận được 1 message duy nhất, payload là array `[NotificationEvent, NotificationEvent]`.

→ KHÔNG phải 2 message riêng biệt như mình muốn!

### Cách viết ĐÚNG: trả về `List<Message<T>>`

```java
@Bean
public Function<OrderEvent, List<Message<NotificationEvent>>> notificationProcessor() {
    return order -> List.of(
        MessageBuilder
            .withPayload(new NotificationEvent(order.orderId(), "SMS", "+1234567890"))
            .build(),
        MessageBuilder
            .withPayload(new NotificationEvent(order.orderId(), "EMAIL", "user@example.com"))
            .build()
    );
}
```

Điểm khác: return type `List<Message<T>>` thay vì `List<T>`.

SCS detect: "đây là List of **Message<T>**" → coi mỗi element là **1 event riêng biệt** → emit N message.

### YAML

```yaml
# section07/05-notification-processor.yaml
spring:
  cloud:
    function:
      definition: notificationProcessor
    stream:
      kafka:
        binder:
          brokers: localhost:9092
      bindings:
        notificationProcessor-in-0:
          destination: order-events
          group: notification-service
        notificationProcessor-out-0:
          destination: notification-events
```

### Run

Consumer log:
```text
notification: NotificationEvent[orderId=1, channel=SMS, destination=+1234567890]
notification: NotificationEvent[orderId=1, channel=EMAIL, destination=user@example.com]
notification: NotificationEvent[orderId=2, channel=SMS, destination=+1234567890]
notification: NotificationEvent[orderId=2, channel=EMAIL, destination=user@example.com]
notification: NotificationEvent[orderId=3, channel=SMS, ...]
notification: NotificationEvent[orderId=3, channel=EMAIL, ...]
```

✅ Mỗi OrderEvent → 2 NotificationEvents. 1-to-many.

## Vì sao phải `List<Message<T>>` thay vì `List<T>`?

SCS framework cần **tín hiệu rõ ràng** từ code để biết "mỗi element là 1 message riêng". Nếu không có Message wrapper, framework không biết phân biệt:
- `List<T>` có thể là "1 message có payload kiểu list" (hợp lệ — có những use case như batch report).
- `List<Message<T>>` rõ ràng nghĩa là "nhiều message với metadata riêng".

Spring Cloud Stream chọn convention: nếu wrap bằng `Message<T>` → mỗi element thành 1 message độc lập.

Trade-off:
- ✓ Rõ ràng intent của code.
- ✗ Hơi verbose (phải dùng MessageBuilder).

Pattern này cũng dùng cùng key/header per-message:

```java
return List.of(
    MessageBuilder
        .withPayload(smsNotif)
        .setHeader(KafkaHeaders.KEY, order.customerId())     // mỗi message có key riêng
        .build(),
    MessageBuilder
        .withPayload(emailNotif)
        .setHeader(KafkaHeaders.KEY, order.customerId())
        .build()
);
```

## Bảng so sánh 3 pattern

| Pattern | Tương tự Java Stream | Signature SCS Function | Hành vi output |
|---|---|---|---|
| 1-to-1 mapping | `map` | `Function<A, B>` | Luôn emit |
| Filter | `filter` | `Function<A, B>` return `null` để skip | Skip khi null |
| 1-to-many split | `flatMap` | `Function<A, List<Message<B>>>` | Emit nhiều message |
| Async / reactive | reactive equivalent | `Function<Flux<A>, Flux<B>>` | Stream output |

## Cả 3 processor cùng 1 app được không?

Hoàn toàn được. Activate qua `function.definition` với dấu chấm phẩy:

```yaml
spring:
  cloud:
    function:
      definition: paymentProcessor;shipmentProcessor;notificationProcessor
    stream:
      bindings:
        paymentProcessor-in-0:
          destination: order-events
          group: payment-service
        paymentProcessor-out-0:
          destination: payment-events
        shipmentProcessor-in-0:
          destination: order-events
          group: shipping-service
        shipmentProcessor-out-0:
          destination: shipment-events
        notificationProcessor-in-0:
          destination: order-events
          group: notification-service
        notificationProcessor-out-0:
          destination: notification-events
```

3 processor trong cùng app, 3 consumer group **khác nhau** cùng consume topic `order-events`. Mỗi processor độc lập emit ra topic riêng.

→ Đây là pattern **fan-out**: 1 source event trigger nhiều downstream processing độc lập.

Trong production: thường mỗi processor = 1 service riêng (PaymentService, ShippingService) → **tách thành app riêng**, không nhồi vào 1 app. Demo gộp 3 processor chỉ để minh hoạ concept.

## Anti-pattern

| Anti-pattern | Vấn đề | Sửa |
|---|---|---|
| Return `List<T>` cho 1-to-many | Emit 1 message chứa list, không phải N message | Dùng `List<Message<T>>` |
| Filter logic ở consumer thay vì processor | Duplicate logic trên nhiều consumer | Filter ngay tại processor |
| Business logic phức tạp nhồi vào lambda | Khó test, khó maintain | Delegate sang `@Service` class |
| Cùng processor route ra nhiều topic khác nhau theo type | Nên tách thành 2 processor riêng | Split processor |
| 1-to-many không set key cho từng Message<T> | Mất ordering ở topic downstream | Set key trên từng Message<T> |

## Tóm tắt bài 1

- **Processor = Consumer + Producer = `Function<I, O>`** trong SCS.
- 3 sub-pattern chính:
  - **1-to-1**: `Function<A, B>` chuẩn, luôn emit 1 output cho mỗi input.
  - **Filter**: `Function<A, B>` return `null` để skip không emit.
  - **1-to-many split**: `Function<A, List<Message<B>>>` — chú ý wrap `Message<T>`.
- Mental model giống Java Stream API: `map`, `filter`, `flatMap`.
- Binding tự derive: `processorBean-in-0` (input) + `processorBean-out-0` (output).
- Cả 3 processor có thể chạy chung 1 app — config khác consumer group, khác output topic.
- Production: extract business logic vào `@Service` class. Processor lambda **mỏng** (chỉ orchestrate, không chứa logic).

**Bài kế tiếp** → [Bài 2: Reactive processor + Phase 7 summary](02-reactive-processor-summary.md)
