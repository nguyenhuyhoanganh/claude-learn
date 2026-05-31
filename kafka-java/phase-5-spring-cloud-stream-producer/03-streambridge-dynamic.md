# Bài 3: StreamBridge — produce events on-demand

`Supplier<T>` chỉ gửi message theo poller schedule (1s/lần default). Nhưng business events thực tế xảy ra theo **trigger external**: user click, order placed, inventory drop. Không periodic.

Bài này: **`StreamBridge`** — utility cho phép gửi event từ **anywhere trong code**, on-demand, không cần Supplier.

## Vấn đề: Supplier không fit on-demand events

Recap bài 1:

```java
@Bean
public Supplier<String> producer() {
    return () -> generateMessage();
}
```

SCS poll mỗi 1 giây → emit 1 msg.

Use cases KHÔNG fit:
- User views product → emit `ProductViewed` event.
- User places order → emit `OrderPlaced`.
- Inventory threshold breached → emit `LowStockAlert`.
- HTTP request → emit `RequestReceived`.

Trigger = **event external** (HTTP, DB change, etc.). Không có "cứ 1 giây emit 1 lần".

### Reactive workaround: `Supplier<Flux<T>>`

```java
@Bean
public Supplier<Flux<OrderEvent>> orderEventProducer() {
    return () -> orderEventSink.asFlux();
}
```

Đẩy event vào sink khi business action xảy ra. SCS subscribe flux → forward to Kafka.

Works nhưng:
- Yêu cầu reactive (Project Reactor).
- Phức tạp với sink lifecycle.
- Không tự nhiên cho traditional MVC code.

## Solution: StreamBridge

> **StreamBridge** = Spring component cho gửi message **on-demand** từ bất cứ đâu trong app.

Sample:

```java
@RestController
public class ProductController {

    private final StreamBridge streamBridge;

    public ProductController(StreamBridge streamBridge) {
        this.streamBridge = streamBridge;
    }

    @GetMapping("/products/{id}")
    public Product view(@PathVariable String id) {
        Product product = productService.findById(id);
        
        streamBridge.send("product-view-out", 
            new ProductViewedEvent(id, Instant.now()));
        
        return product;
    }

    @PostMapping("/orders")
    public Order place(@RequestBody OrderRequest request) {
        Order order = orderService.create(request);
        
        streamBridge.send("order-events-out", 
            new OrderPlacedEvent(order.getId(), order.getAmount()));
        
        return order;
    }
}
```

`StreamBridge.send(bindingName, payload)` →  emit ngay lập tức. Không poller. Không Supplier bean.

## Binding configuration

Supplier auto-derive binding name từ method name. StreamBridge **không** — phải define manually:

```yaml
# section04/02-producer.yaml
spring:
  cloud:
    stream:
      kafka:
        binder:
          brokers: localhost:9092
      bindings:
        product-view-out:                 # ← name freely chosen
          destination: product-events
        order-events-out:                 # ← name freely chosen
          destination: order-events
```

`product-view-out` = first arg to `streamBridge.send(...)`. Map đến topic `product-events`.

Khác Supplier:
- Không cần `spring.cloud.function.definition`.
- Binding name **tự đặt**, không derive từ bean name.

## Quirk: dynamic binding khi không define

```java
streamBridge.send("some-topic-name", event);
```

Nếu `"some-topic-name"` **không** có trong `spring.cloud.stream.bindings`:
- StreamBridge assume `"some-topic-name"` = **topic name** directly.
- Send to that Kafka topic.
- Auto-create binding internally.

```text
streamBridge.send("orders-v2", event)
→ if "orders-v2" not in bindings → treat as topic name "orders-v2".
```

Pros: dynamic destinations possible (vd routing based on event type).

Cons:
- Loses config flexibility (no per-binding override).
- Hides intent — code reader không biết đó là topic name hay binding name.
- Production: avoid.

> Use case OK: **integration tests** (dynamic topic per test scenario).

## Demo: ping output → Kafka

Realistic demo (better than `message-1`, `message-2`):

```text
$ ping -c 10 google.com
PING google.com (...): 56 data bytes
64 bytes from ...: icmp_seq=0 ttl=117 time=23.4 ms
64 bytes from ...: icmp_seq=1 ttl=117 time=24.1 ms
...
```

Mỗi line ping output → emit to Kafka.

### Code

```java
@Component
public class PingProducer implements CommandLineRunner {

    private final StreamBridge streamBridge;

    public PingProducer(StreamBridge streamBridge) {
        this.streamBridge = streamBridge;
    }

    @Override
    public void run(String... args) throws Exception {
        Process process = new ProcessBuilder("ping", "-c", "10", "google.com")
            .redirectErrorStream(true)
            .start();
        
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(process.getInputStream()))) {
            reader.lines().forEach(line -> 
                streamBridge.send("ping-out", line)
            );
        }
        
        process.waitFor();
    }
}
```

`CommandLineRunner` = Spring bean, runs `.run()` after app start. Process `ping`, stream stdout line-by-line → each line `streamBridge.send`.

> Windows: `ping -n 10 google.com` (not `-c`).

### YAML

```yaml
# section04/02-producer.yaml
spring:
  cloud:
    stream:
      kafka:
        binder:
          brokers: localhost:9092
      bindings:
        ping-out:
          destination: demo-topic
```

`ping-out` binding → topic `demo-topic`.

Consumer YAML (Section 04 reuse from Phase 4):

```yaml
# section04/01-consumer.yaml
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
          destination: demo-topic
          group: demo-group
```

### Run

Consumer first, producer second.

Consumer log:
```text
received: PING google.com (216.58.194.142): 56 data bytes
received: 64 bytes from 216.58.194.142: icmp_seq=0 ttl=117 time=23.421 ms
received: 64 bytes from 216.58.194.142: icmp_seq=1 ttl=117 time=24.135 ms
...
received: 10 packets transmitted, 10 packets received, 0.0% packet loss
received: round-trip min/avg/max/stddev = 23.213/24.012/25.114/0.498 ms
```

Producer log: process exits sau 10 pings → app keeps running (Spring still up).

## StreamBridge + key + headers

Same `MessageBuilder` pattern:

```java
Message<OrderEvent> msg = MessageBuilder
    .withPayload(orderEvent)
    .setHeader(KafkaHeaders.KEY, orderEvent.getCustomerId())
    .setHeader("traceId", traceId)
    .build();

streamBridge.send("order-events-out", msg);
```

StreamBridge accept `Object` payload. If `Message<T>` → extract payload + headers. Same as Supplier.

## When to use Supplier vs StreamBridge

| Use case | Approach |
|---|---|
| Periodic events (heartbeat, metrics) | **Supplier** |
| Business events on action | **StreamBridge** |
| HTTP request → event | StreamBridge |
| Scheduled batch trigger | Supplier with cron poller |
| Reactive pipeline emitting | `Supplier<Flux<T>>` |
| Conditional / dynamic destination | StreamBridge |
| Integration test ad-hoc emit | StreamBridge dynamic binding |

Default: **StreamBridge** cho 90% production code. Supplier rare (heartbeat-like).

## Patterns + best practices

### Pattern: Service emits via StreamBridge

```java
@Service
public class OrderService {

    private final StreamBridge streamBridge;
    private final OrderRepository repo;

    public OrderService(StreamBridge streamBridge, OrderRepository repo) {
        this.streamBridge = streamBridge;
        this.repo = repo;
    }

    @Transactional
    public Order placeOrder(OrderRequest req) {
        Order order = repo.save(new Order(req));
        
        // Publish event AFTER DB save
        streamBridge.send("order-events-out",
            MessageBuilder
                .withPayload(new OrderPlacedEvent(order))
                .setHeader(KafkaHeaders.KEY, order.getCustomerId())
                .build()
        );
        
        return order;
    }
}
```

Service own business + event publishing. Controller stays thin.

### Pattern: Conditional emit

```java
public void updateInventory(String sku, int delta) {
    Inventory inv = repo.find(sku);
    inv.adjust(delta);
    repo.save(inv);
    
    if (inv.getStock() < LOW_STOCK_THRESHOLD) {
        streamBridge.send("low-stock-alerts-out", 
            new LowStockAlert(sku, inv.getStock()));
    }
}
```

Supplier không làm được (gửi conditional). StreamBridge OK.

### Anti-patterns

| Anti-pattern | Problem | Fix |
|---|---|---|
| Emit StreamBridge BEFORE DB commit | Event sent for failed transaction | Emit after commit, or use Outbox pattern |
| Synchronous error throw at consumer side affects producer | Coupling | EDA = fire-and-forget; rely on retry |
| Hardcode binding name in 50 places | Refactor pain | Constant `public static final String BINDING_NAME = "order-events-out"` |
| Use dynamic binding (auto topic) in production | Loses config visibility | Define binding explicitly |
| StreamBridge from @Component without DI | NPE | Use constructor injection |
| Lose event if app crashes between DB save + send | Inconsistent | Outbox pattern (Phase 13) |

## Outbox preview (Phase 13 detail)

Critical pattern cho reliability:

```java
@Transactional
public Order placeOrder(OrderRequest req) {
    Order order = repo.save(new Order(req));
    
    // Save event to outbox table (SAME transaction)
    outboxRepo.save(new OutboxEvent("OrderPlaced", order.toJson()));
    
    return order;  // commit → both rows persisted atomically
}

// Separate worker
@Scheduled(fixedRate = 100)
public void publishOutbox() {
    List<OutboxEvent> unpublished = outboxRepo.findUnpublished();
    for (OutboxEvent e : unpublished) {
        streamBridge.send(e.getTopic(), e.toMessage());
        e.markSent();
    }
}
```

Atomic "save business data + queue event" — handle crash between save and send. Phase 13 deep-dive.

## Tóm tắt bài 3

- `Supplier<T>` periodic. Business events on-demand → **StreamBridge**.
- `streamBridge.send(bindingName, payload)` từ bất kỳ đâu (@Service, @RestController).
- Binding name **tự đặt** (không derive). Define `spring.cloud.stream.bindings.{name}.destination`.
- Dynamic binding: nếu name không trong YAML → assume topic name. Avoid in production.
- Support `Message<T>` cho key + headers via `MessageBuilder`.
- 90% production use StreamBridge. Supplier cho heartbeat/metrics.
- Best practice: emit AFTER DB commit. Reliable: Outbox pattern (Phase 13).
- Anti-patterns: pre-commit emit, dynamic binding production, hardcoded names.

**Bài kế tiếp** → [Bài 4: Reactive producer + Phase 5 summary](04-reactive-producer-summary.md)
