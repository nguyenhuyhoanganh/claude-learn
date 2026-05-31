# Bài 1: Content-Based Routing — chia event đến đúng topic theo nội dung

Processor (Phase 7) = chuyển đổi data 1-to-1, filter, hay split. Tất cả emit **cùng 1 output topic**.

Bài này: chia event đến **nhiều output topic khác nhau** dựa vào nội dung message.

Vd: Order với `productType = DIGITAL` → routing đến `digital-delivery-events`. `PHYSICAL` → `physical-delivery-events`. Mỗi consumer microservice riêng (DigitalDeliveryService có logic email download link, PhysicalDeliveryService có logic ship qua FedEx).

## Routing là gì

> **Event routing** = direct event đến 1 hoặc nhiều destinations theo **rules / conditions**.

2 loại:

1. **Content-based routing**: route theo nội dung message (productType, country, amount).
2. **Dynamic routing**: route theo external configuration / runtime decision (bài sau).

Bài này focus content-based.

### Use case ví dụ

```text
order-events topic
       │
       │ DeliveryProcessor consume order
       │
       │ Check order.productType
       │
       ├── DIGITAL ──► digital-delivery-events ──► DigitalDeliveryService
       │                                            (send download URL)
       │
       └── PHYSICAL ──► physical-delivery-events ──► PhysicalDeliveryService
                                                     (FedEx integration)
```

1 processor, 2 output topics, 2 downstream services.

## Vấn đề trong SCS

Standard processor:
```java
@Bean
public Function<OrderEvent, DeliveryEvent> processor() {
    return order -> new DeliveryEvent(...);   // ← 1 output binding only
}
```

`Function<I, O>` contract assume **1 output type → 1 destination**. Bindings:
- `processor-in-0` → input topic.
- `processor-out-0` → **single** output topic.

Không nơi chỉ định "this event goes to topic A, that event goes to topic B."

SCS cung cấp 2 strategies giải quyết.

## Strategy 1: StreamBridge

Phase 5 bài 3 đã giới thiệu. Dùng cho on-demand emit.

```java
@Configuration
public class ProcessorConfig {

    private final StreamBridge streamBridge;

    public ProcessorConfig(StreamBridge streamBridge) {
        this.streamBridge = streamBridge;
    }

    @Bean
    public Consumer<OrderEvent> deliveryRouter() {           // ← Consumer, not Function!
        return order -> {
            if (order.productType() == ProductType.DIGITAL) {
                streamBridge.send("digital-delivery-out", buildDigitalDelivery(order));
            } else {
                streamBridge.send("physical-delivery-out", buildPhysicalDelivery(order));
            }
        };
    }
}
```

Bean type **`Consumer<T>`**, không phải `Function<T, R>`. Lý do: chúng ta **không return** event qua SCS standard out. Output via StreamBridge.

### YAML

```yaml
spring:
  cloud:
    function:
      definition: deliveryRouter
    stream:
      bindings:
        deliveryRouter-in-0:
          destination: order-events
          group: delivery-service
        digital-delivery-out:                      # ← custom binding
          destination: digital-delivery-events
        physical-delivery-out:                     # ← custom binding
          destination: physical-delivery-events
```

Bindings:
- `deliveryRouter-in-0` (auto-derived from Consumer bean).
- `digital-delivery-out` + `physical-delivery-out` — **custom names**, defined manually since StreamBridge dùng tên này.

## Strategy 2: Message Header `spring.cloud.stream.sendTo.destination`

Cleaner approach for processor pattern. Vẫn dùng `Function`, return `Message<T>` với header chỉ định destination.

```java
@Configuration
public class ProcessorConfig {

    public static final String SEND_TO_HEADER = "spring.cloud.stream.sendTo.destination";
    public static final String DIGITAL_OUT = "digital-delivery-out";
    public static final String PHYSICAL_OUT = "physical-delivery-out";

    @Bean
    public Function<OrderEvent, Message<?>> deliveryProcessor() {
        return order -> dispatch(order);
    }

    private Message<?> dispatch(OrderEvent order) {
        if (order.productType() == ProductType.DIGITAL) {
            return MessageBuilder
                .withPayload(buildDigitalDelivery(order))
                .setHeader(SEND_TO_HEADER, DIGITAL_OUT)        // ← key magic
                .build();
        }
        return MessageBuilder
            .withPayload(buildPhysicalDelivery(order))
            .setHeader(SEND_TO_HEADER, PHYSICAL_OUT)
            .build();
    }

    private DigitalDelivery buildDigitalDelivery(OrderEvent order) {
        return new DigitalDelivery(order.orderId(), "user-" + order.customerId() + "@example.com");
    }

    private PhysicalDelivery buildPhysicalDelivery(OrderEvent order) {
        return new PhysicalDelivery(order.orderId(), order.orderId() + "th Street");
    }
}
```

SCS scan message header `spring.cloud.stream.sendTo.destination` → route message đến binding name in header value.

### YAML

```yaml
spring:
  cloud:
    function:
      definition: deliveryProcessor
    stream:
      kafka:
        binder:
          brokers: localhost:9092
      bindings:
        deliveryProcessor-in-0:
          destination: order-events
          group: delivery-service
        # NO deliveryProcessor-out-0 — không cần! Routing qua header.
        digital-delivery-out:                      # ← custom binding
          destination: digital-delivery-events
        physical-delivery-out:                     # ← custom binding
          destination: physical-delivery-events
```

`deliveryProcessor-out-0` **không cần** vì output routing qua header.

`digital-delivery-out` + `physical-delivery-out` map binding name → Kafka topic.

## So sánh 2 strategies

| Aspect | StreamBridge | Send-To header |
|---|---|---|
| Bean type | `Consumer<T>` | `Function<T, Message<?>>` |
| Output mechanism | `streamBridge.send(binding, payload)` | Return `Message<?>` + header |
| Binding declaration | Custom bindings under `bindings:` | Custom bindings under `bindings:` |
| Per-message destination | Yes (any binding) | Yes (any binding) |
| Implicit out binding | No `-out-0` | No `-out-0` |
| Test friendly | Less (need StreamBridge mock) | More (return value testable) |
| Common preference | OK | Slightly preferred |

Both work. Pick theo taste. Send-To header slightly Spring-idiomatic.

## Project setup

```text
section08/
├── dto/
│   ├── ProductType.java
│   ├── OrderEvent.java
│   ├── DigitalDelivery.java
│   └── PhysicalDelivery.java
├── producer/
│   └── ProducerConfig.java        ← from Phase 7
├── processor/
│   └── DeliveryProcessor.java     ← THIS lesson
├── consumer/
│   ├── DigitalDeliveryConsumer.java
│   └── PhysicalDeliveryConsumer.java
└── Section08Runner.java
```

### Consumers

```java
@Configuration
public class DigitalDeliveryConsumerConfig {

    private static final Logger log = LoggerFactory.getLogger(DigitalDeliveryConsumerConfig.class);

    @Bean
    public Consumer<DigitalDelivery> digitalConsumer() {
        return d -> log.info("digital delivery: {}", d);
    }
}

@Configuration
public class PhysicalDeliveryConsumerConfig {

    private static final Logger log = LoggerFactory.getLogger(PhysicalDeliveryConsumerConfig.class);

    @Bean
    public Consumer<PhysicalDelivery> physicalConsumer() {
        return d -> log.info("physical delivery: {}", d);
    }
}
```

2 separate microservices (tách package + runner).

### YAML files

```yaml
# section08/01-digital-consumer.yaml
spring:
  cloud:
    function:
      definition: digitalConsumer
    stream:
      kafka:
        binder:
          brokers: localhost:9092
        bindings:
          digitalConsumer-in-0:
            consumer:
              configuration:
                auto.offset.reset: earliest
      bindings:
        digitalConsumer-in-0:
          destination: digital-delivery-events
          group: digital-delivery-service
```

```yaml
# section08/02-physical-consumer.yaml
spring:
  cloud:
    function:
      definition: physicalConsumer
    stream:
      kafka:
        binder:
          brokers: localhost:9092
        bindings:
          physicalConsumer-in-0:
            consumer:
              configuration:
                auto.offset.reset: earliest
      bindings:
        physicalConsumer-in-0:
          destination: physical-delivery-events
          group: physical-delivery-service
```

```yaml
# section08/03-processor.yaml
spring:
  cloud:
    function:
      definition: deliveryProcessor
    stream:
      kafka:
        binder:
          brokers: localhost:9092
      bindings:
        deliveryProcessor-in-0:
          destination: order-events
          group: delivery-service
        digital-delivery-out:
          destination: digital-delivery-events
        physical-delivery-out:
          destination: physical-delivery-events
```

```yaml
# section08/04-producer.yaml
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

### Runners

```java
public class Section08Runner {

    @SpringBootApplication
    @ComponentScan("com.calmvinsguru.playground.section08.consumer.digital")
    public static class DigitalConsumerRunner {
        public static void main(String[] args) {
            SpringApplication.run(DigitalConsumerRunner.class, args);
        }
    }

    @SpringBootApplication
    @ComponentScan("com.calmvinsguru.playground.section08.consumer.physical")
    public static class PhysicalConsumerRunner {
        public static void main(String[] args) {
            SpringApplication.run(PhysicalConsumerRunner.class, args);
        }
    }

    @SpringBootApplication
    @ComponentScan("com.calmvinsguru.playground.section08.processor")
    public static class ProcessorRunner {
        public static void main(String[] args) {
            SpringApplication.run(ProcessorRunner.class, args);
        }
    }

    @SpringBootApplication
    @ComponentScan("com.calmvinsguru.playground.section08.producer")
    public static class ProducerRunner {
        public static void main(String[] args) {
            SpringApplication.run(ProducerRunner.class, args);
        }
    }
}
```

## Demo run

1. Start DigitalConsumerRunner (`--section=section08 --config=01-digital-consumer.yaml`).
2. Start PhysicalConsumerRunner (`02-physical-consumer.yaml`).
3. Start ProcessorRunner (`03-processor.yaml`).
4. Start ProducerRunner (`04-producer.yaml`).

Producer emit OrderEvent IDs 1, 2, 3, 4, ...:
- Odd → DIGITAL.
- Even → PHYSICAL.

Output:

```text
DigitalConsumer log:
  digital delivery: DigitalDelivery[orderId=1, email=user-1@example.com]
  digital delivery: DigitalDelivery[orderId=3, email=user-3@example.com]
  digital delivery: DigitalDelivery[orderId=5, ...]

PhysicalConsumer log:
  physical delivery: PhysicalDelivery[orderId=2, address=2th Street]
  physical delivery: PhysicalDelivery[orderId=4, address=4th Street]
  physical delivery: PhysicalDelivery[orderId=6, ...]
```

✅ Content-based routing: odd→digital, even→physical.

## Patterns + best practices

### Pattern: Map routing rules clearly

```java
public class RoutingRules {
    public static final Map<ProductType, String> DESTINATIONS = Map.of(
        ProductType.DIGITAL, "digital-delivery-out",
        ProductType.PHYSICAL, "physical-delivery-out"
    );
    
    public static String routeFor(OrderEvent order) {
        return DESTINATIONS.get(order.productType());
    }
}
```

Single source of truth cho routing logic. Adding new product type:
```java
DESTINATIONS = Map.of(
    ProductType.DIGITAL, "digital-delivery-out",
    ProductType.PHYSICAL, "physical-delivery-out",
    ProductType.SUBSCRIPTION, "subscription-delivery-out"   // NEW
);
```

+ Add new binding in YAML. Done.

### Pattern: Multi-criteria routing

```java
private String determineDestination(OrderEvent order) {
    if (order.amount() > 10000) return "high-value-orders-out";
    if (order.productType() == ProductType.PHYSICAL) return "physical-delivery-out";
    if (order.productType() == ProductType.DIGITAL) return "digital-delivery-out";
    return "default-out";
}
```

Multiple conditions. Routing logic complex → extract to dedicated **router class**.

### Pattern: Default / fallback destination

```java
private String determineDestination(OrderEvent order) {
    String dest = DESTINATIONS.get(order.productType());
    return dest != null ? dest : "unknown-products-out";       // ← fallback
}
```

Defensive cho future product types không có route → fallback topic processed manually.

## Anti-patterns

| Anti-pattern | Problem | Fix |
|---|---|---|
| Hardcode topic names trong code | Refactor pain | Use binding name constants + YAML |
| Routing logic deep in `dispatch` lambda | Hard test, hard read | Extract `Router` service class |
| Return `Message<?>` without `sendTo` header | Goes to `processor-out-0` (if defined) or silently dropped | Always set header for routing |
| Try mix `Function<T, R>` with manual `streamBridge.send` | Double emit, confused offsets | Pick one strategy per processor |
| Missing fallback for unknown type | Event silently lost | Default route + monitor |

## Tóm tắt bài 1

- **Routing** = direct event to N destinations based on rules.
- **Content-based** = route theo nội dung message (productType, amount, region).
- SCS `Function<T, R>` chỉ có 1 output → cần workaround for routing.
- **2 strategies**:
  - **StreamBridge**: bean type `Consumer<T>`, manual `send(binding, payload)`.
  - **Send-To header**: bean type `Function<T, Message<?>>`, set `spring.cloud.stream.sendTo.destination` header.
- Both define **custom bindings** trong YAML (not auto-derived).
- Both work; Send-To header slightly more idiomatic.
- Best practice: extract routing rules to `Map` or `Router` service. Fallback destination for unknown.

**Bài kế tiếp** → [Bài 2: Dynamic Routing — runtime configuration](02-dynamic-routing.md)
