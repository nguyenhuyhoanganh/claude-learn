# Bài 4: Consume từ multiple topics — feature vs best practice

Real scenario: OrderService cần consume `web-orders` + `mobile-orders`. 2 cách:
1. **1 binding, multiple destinations** (SCS feature — works, nhưng ko khuyến nghị).
2. **N bindings, N beans** (best practice).

Bài này: demo cả 2, vì sao option 2 thắng.

## Approach 1: 1 binding, multiple destinations

### Code: same consumer bean

```java
@Configuration
public class ConsumerConfig {
    
    private static final Logger log = LoggerFactory.getLogger(ConsumerConfig.class);

    @Bean
    public Consumer<String> consumer() {
        return message -> log.info("received: {}", message);
    }
}
```

Không đổi.

### Config YAML

```yaml
# section01/04-multiple-topics.yaml
spring:
  cloud:
    function:
      definition: consumer
    stream:
      kafka:
        binder:
          brokers: localhost:9092
        bindings:
          consumer-in-0:
            consumer:
              configuration:
                auto.offset.reset: earliest
      bindings:
        consumer-in-0:
          destination: demo-topic-1,demo-topic-2      # ← comma-separated
          group: demo-group
```

`destination` accepts **comma-separated list of topics**.

### Run + observe

App log:

```text
[Consumer ...] Adding newly assigned partitions: demo-topic-1-0, demo-topic-2-0
```

→ Consumer subscribe **both topics**. Partitions của cả 2 topic assigned.

### Test: produce to both

Terminal 1:
```bash
./kafka-console-producer.sh --bootstrap-server localhost:9092 --topic demo-topic-1
> A1
> A2
> A3
```

Terminal 2:
```bash
./kafka-console-producer.sh --bootstrap-server localhost:9092 --topic demo-topic-2
> B1
> B2
> B3
```

App log:
```text
received: A1
received: A2
received: A3
received: B1
received: B2
received: B3
```

✅ Both topics' messages flow through single consumer bean.

## Trade-off — vì sao multiple destination **rare**

### Problem 1: Không thể per-topic config override

```yaml
spring:
  cloud:
    stream:
      kafka:
        bindings:
          consumer-in-0:                  # binding-level
            consumer:
              configuration:
                max.poll.records: 50      # applies to BOTH topics
```

Muốn:
- `demo-topic-1`: `max.poll.records = 10` (process slow).
- `demo-topic-2`: `max.poll.records = 500` (process fast batch).

→ **KHÔNG thể** với 1 binding. Override chỉ ở binding-level, không topic-level.

### Problem 2: Lost destination context

```java
@Bean
public Consumer<String> consumer() {
    return message -> {
        log.info("received: {}", message);
        // Đây là order từ web hay mobile?
        // → Không biết. Chỉ có message body.
    };
}
```

Bean không biết message từ topic nào. Có thể inject `Message<String>` với headers để lấy `kafka_receivedTopic` header — nhưng phải làm extra:

```java
@Bean
public Consumer<Message<String>> consumer() {
    return msg -> {
        String topic = (String) msg.getHeaders().get("kafka_receivedTopic");
        String body = msg.getPayload();
        log.info("from topic={} message={}", topic, body);
    };
}
```

Workable but messy. Conditional logic dựa trên topic name → bean thành router.

### Problem 3: Same processing logic vs different

Đôi khi `web-orders` cần validate khác `mobile-orders` (vd mobile schema khác). Same bean → conditional branches → ugly.

## Approach 2: N bindings, N beans (recommended)

### Code: 2 beans, **shared service**

```java
@Configuration
public class ConsumerConfig {

    private final OrderService orderService;

    public ConsumerConfig(OrderService orderService) {
        this.orderService = orderService;
    }

    @Bean
    public Consumer<String> webOrderConsumer() {
        return message -> orderService.processOrder(message, "web");
    }

    @Bean
    public Consumer<String> mobileOrderConsumer() {
        return message -> orderService.processOrder(message, "mobile");
    }
}
```

Mỗi bean = 1 binding = 1 topic. Body call `OrderService.processOrder(...)` — **shared business logic**, no duplication.

### Service class

```java
@Service
public class OrderService {

    private static final Logger log = LoggerFactory.getLogger(OrderService.class);

    public void processOrder(String message, String source) {
        log.info("processing order from {}: {}", source, message);
        // validation, persist, publish event, etc.
    }
}
```

Business logic ở 1 chỗ. Bean = thin entry points.

### Config YAML

```yaml
# section01/05-multi-binding.yaml
spring:
  cloud:
    function:
      definition: webOrderConsumer;mobileOrderConsumer    # 2 beans
    stream:
      kafka:
        binder:
          brokers: localhost:9092
        bindings:
          webOrderConsumer-in-0:
            consumer:
              configuration:
                auto.offset.reset: earliest
                max.poll.records: 10            # ← topic-specific!
          mobileOrderConsumer-in-0:
            consumer:
              configuration:
                auto.offset.reset: earliest
                max.poll.records: 500           # ← different!
      bindings:
        webOrderConsumer-in-0:
          destination: web-orders
          group: order-service
        mobileOrderConsumer-in-0:
          destination: mobile-orders
          group: order-service
```

3 wins:
1. ✅ **Per-topic override**: `max.poll.records` khác nhau.
2. ✅ **Topic context implicit**: bean name encodes nguồn.
3. ✅ **Code path tách**: easy add web-specific logic vào `webOrderConsumer` without touching mobile.

## Bảng so sánh

| Aspect | 1 binding, multi-dest | N bindings |
|---|---|---|
| Code lines | Less (1 bean) | More (N beans) |
| Per-topic override | ✗ Cannot | ✓ Yes |
| Topic context in handler | ✗ Need header inspection | ✓ Implicit by bean |
| Different processing per topic | ✗ Branching needed | ✓ Separate methods |
| Resilience tuning per topic | ✗ Cannot | ✓ Per binding |
| Reusable business logic | ✓ Possible | ✓ Possible (via service) |
| When useful | Testing, demo | **Production** |

## Edge case: same handler, multiple topic = OK

Đôi khi processing **thực sự identical**:

```text
Topic "errors-from-service-a" + "errors-from-service-b"
→ Both → send to monitoring dashboard.
```

Multi-destination OK. Nhưng vẫn nên xét:
- Có cần per-source rate limit? → split.
- Có need future divergence? → split proactively.

Default vẫn: split.

## "Won't I duplicate code?"

Common concern: "2 beans với cùng body = duplicate."

Reality:
```java
@Bean
public Consumer<String> webOrderConsumer() {
    return msg -> orderService.processOrder(msg, "web");    // 1 line
}

@Bean
public Consumer<String> mobileOrderConsumer() {
    return msg -> orderService.processOrder(msg, "mobile");  // 1 line
}
```

Duplication = 1 line per bean. Business logic = ở `OrderService` (shared).

Net cost: 1 extra line per topic. Net benefit: per-topic config, future flexibility, clean separation.

Trade-off favor split.

## Anti-pattern: Multi-destination + heavy branching

```java
@Bean
public Consumer<Message<String>> consumer() {
    return msg -> {
        String topic = (String) msg.getHeaders().get("kafka_receivedTopic");
        switch (topic) {
            case "web-orders":
                webHandler(msg.getPayload());
                break;
            case "mobile-orders":
                mobileHandler(msg.getPayload());
                break;
            default:
                throw new IllegalStateException("unknown topic");
        }
    };
}
```

→ Hardcode topic names in code. Adding 3rd topic = code change. Configuration nhưng lại không decoupled.

Fix: split beans.

## Production pattern recap

```text
SERVICE: order-service
  Consumes from: web-orders, mobile-orders, partner-orders
  
SCS layout:
  consumer/
    OrderConsumerConfig.java
      @Bean webOrderConsumer()      → "web-orders" topic
      @Bean mobileOrderConsumer()   → "mobile-orders" topic
      @Bean partnerOrderConsumer()  → "partner-orders" topic
  service/
    OrderService.java
      processOrder(msg, source)     ← shared business logic
  event/
    OrderEvent.java                  ← shared DTO
```

Per-topic config override khi cần. Business logic 1 chỗ.

## Visualization

```text
Approach 1 (NOT recommended):
                    +─────────────────────+
   web-orders ──────►│                     │
                    │   consumer bean     │ ──► OrderService
   mobile-orders ──►│                     │
                    +─────────────────────+
   ↑
   destination: web-orders, mobile-orders
   
   - 1 set of consumer properties for both topics
   - No way to differentiate without header inspection


Approach 2 (recommended):
                    +─────────────────────+
   web-orders ──────►│ webOrderConsumer    │ ─┐
                    +─────────────────────+  │
                                              ├──► OrderService.processOrder(...)
                    +─────────────────────+  │
   mobile-orders ──►│ mobileOrderConsumer │ ─┘
                    +─────────────────────+
   
   - Independent properties per binding
   - Bean name carries source context
   - Easy add 3rd topic + per-binding tuning
```

## Tóm tắt bài 4

- SCS support multi-destination: `destination: topic1,topic2,...` trong 1 binding.
- Works nhưng:
  - **Không** per-topic override (max.poll.records, auto.offset.reset, etc.).
  - Lost topic context trong handler (cần inspect header).
  - Conditional logic per topic = ugly.
- **Best practice**: **1 binding per topic + N beans**.
- N beans = N thin entry points, **all call shared service class**.
- Trade-off: 1 extra line per bean → much better config flexibility + maintainability.
- Anti-pattern: multi-destination + switch-case trên topic name.

**Bài kế tiếp** → [Bài 5: Optional — Reactive consumers + Multi-input functions](05-reactive-multi-input.md)
