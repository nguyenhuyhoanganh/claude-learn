# Bài 1: Spring Cloud Stream — abstraction qua Binder + Binding

Phase 3 bạn dùng CLI để produce/consume. Phase 4: chuyển sang Java app **production-grade**.

Câu hỏi: dùng `KafkaProducer` / `KafkaConsumer` raw từ Kafka client library? Hay có **abstraction layer**?

Answer: **Spring Cloud Stream (SCS)** — abstraction giúp app logic không lock-in vào Kafka. Mai chuyển sang RabbitMQ → đổi driver, không đổi code.

Bài này: SCS là gì, 3 loại app trong EDA (Producer/Consumer/Processor), 2 concept cốt lõi **Binder** + **Binding**.

## Spring Cloud Stream là gì?

> SCS = Spring module cho **message-driven / event-driven microservices**. Cho messaging giống Spring Data JPA cho relational DB.

### Analogy: Spring Data JPA

```text
RDBMS app:
  Service class
       │
       │ JpaRepository<Order>
       ▼
  Entity Order  →  table "orders"
       │
       │ driver: MySQL / Postgres / H2 (chọn qua dependency)
       ▼
  Actual DB

Service class KHÔNG biết DB nào.
Đổi từ MySQL sang Postgres = thay driver dependency + đổi `spring.datasource.url`.
Code business KHÔNG đụng.
```

SCS làm tương tự cho messaging:

```text
EDA app:
  Service class (business logic)
       │
       │ Java 8 functional interface (Consumer / Supplier / Function)
       ▼
  POJO event (OrderEvent)
       │
       │ Binder: Kafka / RabbitMQ / Pulsar / Kinesis / PubSub
       ▼
  Actual messaging system

Service class KHÔNG biết Kafka.
Đổi sang RabbitMQ = thay binder dependency + đổi few properties.
```

### Binders supported

- **Apache Kafka** (khoá này focus).
- **Apache Pulsar**.
- **RabbitMQ**.
- **AWS Kinesis**.
- **Google Cloud Pub/Sub**.
- Few more.

→ Khoá học chỉ Kafka, nhưng pattern applicable mọi binder.

### Khác biệt với Spring Data JPA

Không có "Repository" interface. SCS dùng **Java 8 functional interfaces**: `Supplier`, `Consumer`, `Function`.

## 3 loại app trong Event-Driven Architecture

```text
+──────────────+   events    +──────────────+   events    +──────────────+
│  Producer    │ ───────────►│ Messaging    │ ───────────►│  Consumer    │
│              │             │ system       │             │              │
│ OrderService │             │ (Kafka)      │             │ Notification │
│ emits        │             │              │             │ Service      │
│ OrderPlaced  │             │              │             │ sends email  │
+──────────────+             +──────────────+             +──────────────+

            +──────────────+
            │  Processor   │  = Consumer + Producer
            │              │
            │ Recommendation│
            │ Service:     │
            │ - consume    │
            │   "Watched"  │
            │ - emit       │
            │   "Recom..." │
            +──────────────+
```

### Producer
- Publishes events.
- KHÔNG biết ai consume.
- Vd: OrderService emit `OrderPlaced` khi user place order.

### Consumer
- Consumes events.
- Side effect (DB write, email, etc.).
- Vd: NotificationService consume `OrderPlaced` → send confirmation email.

### Processor
- Consume + emit.
- Vd: RecommendationService consume `MovieWatched` → recommend next movie → emit `Recommendation`.

## SCS interfaces — 1-to-1 mapping

| App type | Java 8 interface | Method signature |
|---|---|---|
| Producer | `Supplier<T>` | `T get()` |
| Consumer | `Consumer<T>` | `void accept(T t)` |
| Processor | `Function<T, R>` | `R apply(T t)` |

### Code skeletons

```java
// PRODUCER
@Bean
public Supplier<OrderEvent> orderEventProducer() {
    return () -> new OrderEvent(...);  // SCS calls this periodically
}

// CONSUMER
@Bean
public Consumer<PaymentEvent> paymentEventConsumer() {
    return event -> {
        // process event
        emailService.send(event.userId, "Payment confirmed");
    };
}

// PROCESSOR
@Bean
public Function<OrderEvent, PaymentEvent> paymentProcessor() {
    return orderEvent -> {
        // logic
        return new PaymentEvent(...);
    };
}
```

`@Bean` để Spring registers. SCS scan beans of these types → auto-wire.

Đơn giản. Không boilerplate Kafka client setup.

## Binder + Binding — 2 concepts

### Binder = driver

> **Binder** = library "binds" your application to a messaging system. Tương tự DB driver.

```text
Application JAR:
  - business code
  - SCS framework
  - Kafka binder (spring-cloud-stream-binder-kafka)
       └─ Kafka client library (org.apache.kafka:kafka-clients)
       └─ binder-specific logic
```

Thêm dependency:

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-stream-binder-kafka</artifactId>
</dependency>
```

SCS detect → routes events through Kafka. Đổi sang RabbitMQ = thay `spring-cloud-stream-binder-kafka` → `spring-cloud-stream-binder-rabbit`. Same code work.

### Binding = mapping bean ↔ topic

> **Binding** = mapping declaration giữa `bean` (Java) và `topic` (messaging system).

```text
Bean "paymentEventConsumer"  ←  binding  →  Kafka topic "payment-events"
Bean "orderEventProducer"     ─  binding  →  Kafka topic "order-events"
```

Declarations ở `application.yml`. SCS đọc → wire bean với topic.

### Naming convention — confusing nhưng phải nhớ

Format binding name: `{beanName}-{out|in}-{index}`

| Part | Meaning |
|---|---|
| `beanName` | Tên Java bean (`paymentEventConsumer`, `orderEventProducer`, `paymentProcessor`) |
| `out` hoặc `in` | `out` = bean produces (Supplier/Function output). `in` = bean consumes (Consumer/Function input) |
| `index` | Position. **Hầu như luôn `0`**. Multi-input case ở bài sau. |

Examples:
- `orderEventProducer-out-0` → producer bean, output #0.
- `paymentEventConsumer-in-0` → consumer bean, input #0.
- `paymentProcessor-in-0` + `paymentProcessor-out-0` → processor, both directions.

> Index `0` khá thừa cho 95% case. Spring team đã có lý do (multi-input function), bài Optional sau giải thích.

## Configuration trong application.yml

### Producer config

```yaml
spring:
  cloud:
    function:
      definition: orderEventProducer        # ← required: list bean names
    stream:
      bindings:
        orderEventProducer-out-0:           # ← binding name
          destination: order-events         # ← Kafka topic name
```

`spring.cloud.function.definition` = SCS underlying dùng **Spring Cloud Function**. Phải list bean names, semicolon-separated nếu multiple.

### Consumer config

```yaml
spring:
  cloud:
    function:
      definition: paymentEventConsumer
    stream:
      bindings:
        paymentEventConsumer-in-0:
          destination: payment-events
          group: notification-service        # ← consumer group name
```

`group` = consumer group ID (bài 5 Phase 3). Convention: service name.

### Processor config

```yaml
spring:
  cloud:
    function:
      definition: paymentProcessor
    stream:
      bindings:
        paymentProcessor-in-0:
          destination: order-events          # input topic
          group: payment-service
        paymentProcessor-out-0:
          destination: payment-events        # output topic
```

Cùng bean có **2 bindings** — `in-0` (consume) + `out-0` (produce).

### Multi-consumer service

InventoryService consume **cả** `order-events` **và** `payment-events`:

```java
@Bean
public Consumer<OrderEvent> orderEventConsumer() { ... }

@Bean
public Consumer<PaymentEvent> paymentEventConsumer() { ... }
```

```yaml
spring:
  cloud:
    function:
      definition: orderEventConsumer;paymentEventConsumer    # 2 beans
    stream:
      bindings:
        orderEventConsumer-in-0:
          destination: order-events
          group: inventory-service
        paymentEventConsumer-in-0:
          destination: payment-events
          group: inventory-service
```

Cùng `group: inventory-service` — 2 bean nằm trong cùng consumer group (per topic).

## Kafka-specific properties

Property như `linger.ms` chỉ Kafka. RabbitMQ không có. SCS cho phép set qua **binder-specific section**:

```yaml
spring:
  cloud:
    stream:
      kafka:                                  # ← Kafka-specific
        binder:
          brokers: localhost:9092             # bootstrap servers
        bindings:
          orderEventProducer-out-0:
            producer:
              configuration:
                linger.ms: 100                # Kafka producer config
                batch.size: 5000
          orderEventConsumer-in-0:
            consumer:
              configuration:
                max.poll.records: 10          # Kafka consumer config
```

Hierarchy 4 levels:

```text
1. spring.cloud.stream.bindings.X       → generic (any binder)
2. spring.cloud.stream.kafka.bindings.X → Kafka-specific cho binding cụ thể
3. spring.cloud.stream.kafka.binder     → Kafka cluster-wide default
4. spring.kafka.*                       → raw Kafka client (escape hatch)
```

Specific override generic. Per-binding override binder-wide.

### Per-binding override example

```yaml
spring:
  cloud:
    stream:
      kafka:
        binder:
          consumer-properties:
            max.poll.records: 50              # default 50 for all consumers
        bindings:
          highPriorityConsumer-in-0:
            consumer:
              configuration:
                max.poll.records: 10          # override → 10 only for this
          batchConsumer-in-0:
            consumer:
              configuration:
                max.poll.records: 500         # override → 500 only for this
```

3 consumers in same app, 3 different `max.poll.records` settings.

## Generic vs binder-specific

| Property | Where | Why |
|---|---|---|
| `destination` (topic name) | Generic (`spring.cloud.stream.bindings`) | Concept exists in all messaging |
| `group` | Generic | Concept exists (consumer group) |
| `linger.ms`, `batch.size` | Binder-specific (`kafka.bindings.X.producer.configuration`) | Kafka only |
| `max.poll.records` | Binder-specific | Kafka only |
| Acknowledgement mode | Mixed (depends) | — |

Generic properties = portable. Binder-specific = lose portability nhưng cần thiết for fine-tune.

## Recap visualization

```text
+──────────────────────────────────────────────────────────────+
│                  Spring Boot Application                      │
│                                                               │
│  +──────────────────────────────────────────────────────+   │
│  │                Business logic                          │   │
│  │                                                        │   │
│  │   @Bean                                                │   │
│  │   public Consumer<PaymentEvent> paymentEventConsumer() │   │
│  │   { return event -> { ... }; }                          │   │
│  │                                                        │   │
│  +──────────────────────────────────────────────────────+   │
│              ▲                                                │
│              │ wired by SCS                                   │
│              │                                                │
│  +──────────────────────────────────────────────────────+   │
│  │ Binding: paymentEventConsumer-in-0 → payment-events   │   │
│  │ (config in application.yml)                            │   │
│  +──────────────────────────────────────────────────────+   │
│              ▲                                                │
│              │ implements                                     │
│              │                                                │
│  +──────────────────────────────────────────────────────+   │
│  │           Kafka Binder                                  │   │
│  │   (spring-cloud-stream-binder-kafka)                    │   │
│  │   - manages KafkaConsumer                               │   │
│  │   - polls + deserializes + calls bean                   │   │
│  │   - commits offsets                                     │   │
│  +──────────────────────────────────────────────────────+   │
│              ▲                                                │
│              │ Kafka protocol                                 │
+──────────────│────────────────────────────────────────────────+
               │
               ▼
        Kafka broker
        Topic "payment-events"
```

## Anti-patterns

| Anti-pattern | Reason | Fix |
|---|---|---|
| Quên `spring.cloud.function.definition` | SCS không discover bean → silent no-op | Always list bean names |
| Sai naming `{bean}-in-0` (vd `_in_0`) | SCS không match binding | Đúng format kebab-case-dash |
| Hardcode topic trong code | Mất config flexibility | Always via `destination:` |
| Mix raw `KafkaProducer` + SCS in 1 app | Double management, confused offsets | Pick one approach |
| Skip `group:` cho consumer | Anonymous group, lost across restart | Always explicit |

## Tóm tắt bài 1

- SCS = Spring abstraction cho EDA, như Spring Data JPA cho RDBMS.
- 3 app types: **Producer** (`Supplier<T>`), **Consumer** (`Consumer<T>`), **Processor** (`Function<T,R>`).
- 2 concepts:
  - **Binder** = driver (Kafka / RabbitMQ / ...). Thêm qua Maven dependency.
  - **Binding** = mapping bean ↔ topic, format `{beanName}-{out|in}-{index}`.
- Index hầu như `0` (multi-input case rare).
- Configuration via `application.yml`:
  - `spring.cloud.function.definition`: list bean names.
  - `spring.cloud.stream.bindings.{binding}.destination`: topic.
  - `spring.cloud.stream.bindings.{binding}.group`: consumer group.
- 4-level property hierarchy: generic → Kafka binder global → per-binding override → raw `spring.kafka.*`.
- Generic config portable. Kafka-specific (linger.ms, max.poll.records) under `spring.cloud.stream.kafka.*`.

**Bài kế tiếp** → [Bài 2: Setup Playground Project](02-playground-setup.md)
