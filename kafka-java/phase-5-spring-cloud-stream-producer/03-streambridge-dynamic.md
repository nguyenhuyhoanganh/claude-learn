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

StreamBridge nhận tham số payload kiểu `Object`. Nếu là `Message<T>` → tự extract payload + header. Pattern y hệt Supplier.

## Khi nào dùng Supplier vs StreamBridge?

| Tình huống | Cách dùng |
|---|---|
| Event periodic (heartbeat, metric) | **Supplier** |
| Business event theo user action | **StreamBridge** |
| HTTP request đến → emit event | StreamBridge |
| Scheduled batch trigger | Supplier với cron poller |
| Reactive pipeline emit | `Supplier<Flux<T>>` |
| Routing có điều kiện / destination động | StreamBridge |
| Integration test ad-hoc emit message | StreamBridge với dynamic binding |

Default cho production: **StreamBridge** chiếm 90% code. Supplier chỉ dùng cho case kiểu heartbeat.

## Pattern + best practice

### Pattern 1: Service emit qua StreamBridge

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
        
        // Publish event SAU KHI save DB
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

Service tự own business logic + event publishing. Controller mỏng (chỉ delegate sang service).

### Pattern 2: Conditional emit (chỉ emit khi đạt điều kiện)

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

Supplier không làm được kiểu này (vì supplier chạy theo timer, không theo điều kiện). StreamBridge OK — gọi khi cần.

### Anti-pattern

| Anti-pattern | Vấn đề | Sửa |
|---|---|---|
| Emit StreamBridge TRƯỚC khi commit DB | Event đã được gửi nhưng DB rollback → inconsistency | Emit SAU khi commit, hoặc dùng Outbox pattern |
| Throw exception ở consumer ảnh hưởng producer | Vi phạm decoupling | EDA là fire-and-forget, dùng retry mechanism |
| Hard-code binding name ở 50 chỗ trong code | Đau khi refactor | Đặt constant `public static final String BINDING_NAME = "order-events-out"` |
| Dùng dynamic binding (auto-create topic) ở production | Mất visibility config | Định nghĩa binding explicit trong YAML |
| Dùng StreamBridge trong `@Component` mà không inject | NPE khi gọi | Constructor injection |
| App crash giữa lúc save DB và send event | State inconsistent | **Outbox pattern** (Phase 13) |

## Preview Outbox pattern (chi tiết ở Phase 13)

Đây là pattern **critical cho reliability**:

```java
@Transactional
public Order placeOrder(OrderRequest req) {
    Order order = repo.save(new Order(req));
    
    // Save event vào bảng outbox (CÙNG transaction với business data)
    outboxRepo.save(new OutboxEvent("OrderPlaced", order.toJson()));
    
    return order;  // commit → cả 2 row được persist atomic
}

// Worker chạy riêng, định kỳ poll outbox và emit
@Scheduled(fixedRate = 100)
public void publishOutbox() {
    List<OutboxEvent> unpublished = outboxRepo.findUnpublished();
    for (OutboxEvent e : unpublished) {
        streamBridge.send(e.getTopic(), e.toMessage());
        e.markSent();
    }
}
```

Lợi ích: **atomic** giữa "save business data" và "queue event". Nếu app crash giữa 2 bước → event vẫn còn trong outbox table, worker sẽ retry emit sau. Phase 13 sẽ học sâu.

## Tóm tắt bài 3

- `Supplier<T>` cho event periodic. Business event on-demand → dùng **`StreamBridge`**.
- Cú pháp: `streamBridge.send(bindingName, payload)` — gọi được từ bất kỳ đâu (`@Service`, `@RestController`, `@EventListener`...).
- Binding name **tự đặt** (không auto-derive như Supplier). Phải define trong YAML qua `spring.cloud.stream.bindings.{name}.destination`.
- **Dynamic binding**: nếu name truyền vào không có trong YAML → SCS coi đó là topic name. Tiện cho test, **tránh dùng ở production** (mất visibility config).
- Support `Message<T>` cho key + header qua `MessageBuilder` — same pattern với Supplier.
- 90% production code dùng StreamBridge. Supplier chỉ dùng cho heartbeat/metric.
- Best practice: emit **SAU KHI** commit DB. Pattern reliable: **Outbox** (Phase 13).
- Anti-pattern chính: emit trước commit, dynamic binding ở production, hard-code binding name.

**Bài kế tiếp** → [Bài 4: Reactive producer + Phase 5 summary](04-reactive-producer-summary.md)
