# Bài 2: Dynamic Routing + Phase 8 summary

Content-based routing: decision dựa vào **nội dung message**. Dynamic routing: dựa vào **runtime conditions** ngoài message — service availability, feature flags, load.

## Use case — chọn shipping carrier theo availability

Mở rộng demo trước:
- DIGITAL → `digital-delivery-events` (same).
- PHYSICAL → **EITHER** `fedex-delivery-events` **OR** `usps-delivery-events`, depending on FedEx availability.

```text
order-events
       │
       │ Processor
       │
       ├── DIGITAL ──► digital-delivery-events
       │
       └── PHYSICAL ──► Check carrier availability service
                          │
                          ├── FedEx available ──► fedex-delivery-events
                          └── FedEx down ──────► usps-delivery-events
```

Decision **không hard-code trong message**. Depends on `CarrierAvailabilityService.isFedexAvailable()` returning true/false at runtime.

## CarrierAvailabilityService

Demo simulate:

```java
@Service
public class CarrierAvailabilityService {

    private final AtomicBoolean fedexAvailable = new AtomicBoolean(true);

    @Scheduled(fixedRate = 10000)        // every 10 seconds toggle
    public void toggle() {
        fedexAvailable.set(!fedexAvailable.get());
    }

    public boolean isFedexAvailable() {
        return fedexAvailable.get();
    }
}
```

Production reality:
- Health check ping carrier API.
- Circuit breaker (Resilience4j) state.
- Feature flag config (LaunchDarkly).
- Rate limit current state.
- Time-of-day rules (FedEx Mon-Fri, USPS weekends).

## Processor with dynamic decision

```java
@Configuration
public class ProcessorConfig {

    public static final String SEND_TO = "spring.cloud.stream.sendTo.destination";
    public static final String DIGITAL_OUT = "digital-delivery-out";
    public static final String FEDEX_OUT = "fedex-delivery-out";
    public static final String USPS_OUT = "usps-delivery-out";

    private final CarrierAvailabilityService carrierService;

    public ProcessorConfig(CarrierAvailabilityService carrierService) {
        this.carrierService = carrierService;
    }

    @Bean
    public Function<OrderEvent, Message<?>> deliveryProcessor() {
        return order -> dispatch(order);
    }

    private Message<?> dispatch(OrderEvent order) {
        if (order.productType() == ProductType.DIGITAL) {
            return buildDigitalMessage(order);
        }
        return buildPhysicalMessage(order);
    }

    private Message<?> buildDigitalMessage(OrderEvent order) {
        DigitalDelivery payload = new DigitalDelivery(order.orderId(), 
            "user-" + order.customerId() + "@example.com");
        return MessageBuilder
            .withPayload(payload)
            .setHeader(SEND_TO, DIGITAL_OUT)
            .build();
    }

    private Message<?> buildPhysicalMessage(OrderEvent order) {
        PhysicalDelivery payload = new PhysicalDelivery(order.orderId(),
            order.orderId() + "th Street");
        String destination = carrierService.isFedexAvailable() ? FEDEX_OUT : USPS_OUT;
        return MessageBuilder
            .withPayload(payload)
            .setHeader(SEND_TO, destination)
            .build();
    }
}
```

Key: `String destination = ... ? FEDEX_OUT : USPS_OUT;` — decision tại runtime.

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
        digital-delivery-out:
          destination: digital-delivery-events
        fedex-delivery-out:                       # NEW
          destination: fedex-delivery-events
        usps-delivery-out:                        # NEW
          destination: usps-delivery-events
```

3 output bindings: digital + 2 physical carriers.

### Enable scheduling

Trên `@SpringBootApplication` (or `@Configuration`):

```java
@EnableScheduling
@SpringBootApplication
@ComponentScan("com.calmvinsguru.playground.section08.processor")
public static class ProcessorRunner {
    public static void main(String[] args) {
        SpringApplication.run(ProcessorRunner.class, args);
    }
}
```

`@EnableScheduling` để `@Scheduled` chạy.

### Consumers

3 consumer microservices:
- DigitalConsumer → `digital-delivery-events`.
- FedexConsumer → `fedex-delivery-events`.
- UspsConsumer → `usps-delivery-events`.

```java
@Bean
public Consumer<PhysicalDelivery> fedexConsumer() {
    return d -> log.info("FedEx delivery: {}", d);
}

@Bean
public Consumer<PhysicalDelivery> uspsConsumer() {
    return d -> log.info("USPS delivery: {}", d);
}
```

## Demo run

5 JVMs:
1. DigitalConsumer.
2. FedexConsumer.
3. UspsConsumer.
4. Processor (with scheduling).
5. Producer.

Producer emit OrderEvent IDs 1, 2, 3, 4, 5, ... every 1s.

Output trong 30 giây đầu:

```text
T=0   FedEx available = true
T=1   ProducerSent id=1  (digital)  → DigitalConsumer
T=2   ProducerSent id=2  (physical) → FedexConsumer
T=3   ProducerSent id=3  (digital)  → DigitalConsumer
T=4   ProducerSent id=4  (physical) → FedexConsumer
T=5   ProducerSent id=5  (digital)  → DigitalConsumer
...
T=10  CarrierService toggles → FedEx unavailable
T=11  ProducerSent id=11 (digital) → DigitalConsumer
T=12  ProducerSent id=12 (physical) → UspsConsumer    ← changed!
T=13  ProducerSent id=13 (digital) → DigitalConsumer
T=14  ProducerSent id=14 (physical) → UspsConsumer
...
T=20  CarrierService toggles → FedEx back available
T=22  ProducerSent id=22 (physical) → FedexConsumer    ← switched back
```

✅ Dynamic routing observable: PHYSICAL orders distribute giữa FedEx + USPS theo availability.

## Mix content-based + dynamic — common

Real apps **combine** both:

```text
Order:
  if amount > 10000:                    ← content-based
    if fraud_score_high:                ← dynamic (external API)
      route to "fraud-review-orders"
    else:
      route to "premium-orders"
  else if amount > 1000:                ← content-based
    route to "standard-orders"
  else:
    if low_priority_queue_empty:        ← dynamic (queue state)
      route to "fast-track-orders"
    else:
      route to "batch-orders"
```

Multi-step decision tree mixing message content + runtime state.

## Best practices

| Practice | Why |
|---|---|
| Extract routing decision to dedicated `Router` class | Testable, decoupled from SCS |
| Use binding name constants | Refactor-safe |
| Document routing rules in README | Future devs need context |
| Monitor each output topic separately | Detect drift (vd FedEx always down) |
| Fallback destination cho unhandled cases | Don't lose events |
| Feature flag for safe rollout | Test new route paths gradually |

## Test pattern

Unit test dispatch:

```java
@Test
void physicalOrderRoutesFedExWhenAvailable() {
    when(carrierService.isFedexAvailable()).thenReturn(true);
    
    Message<?> result = processor.dispatch(
        new OrderEvent(1, 1, 100, ProductType.PHYSICAL)
    );
    
    assertThat(result.getHeaders().get(SEND_TO))
        .isEqualTo(FEDEX_OUT);
    assertThat(result.getPayload()).isInstanceOf(PhysicalDelivery.class);
}

@Test
void physicalOrderRoutesUSPSWhenFedExDown() {
    when(carrierService.isFedexAvailable()).thenReturn(false);
    
    Message<?> result = processor.dispatch(
        new OrderEvent(1, 1, 100, ProductType.PHYSICAL)
    );
    
    assertThat(result.getHeaders().get(SEND_TO)).isEqualTo(USPS_OUT);
}
```

Mock `CarrierAvailabilityService` để verify logic quyết định mà không cần Kafka thật.

## Anti-pattern

| Anti-pattern | Vấn đề | Sửa |
|---|---|---|
| Hard-code check availability ngay trong lambda | Không test được | Inject service |
| Magic string cho binding name | Dễ typo | Dùng constant |
| Quên thread safety cho toggle scheduling | Race condition | Dùng `AtomicBoolean` hoặc synchronized |
| Check availability tốn thời gian dài trong dispatch | Block processor | Check ở background + cache state |
| Thiếu fallback khi "tất cả carrier đều down" | Event lost hoặc exception | Default route + reprocess thủ công |
| Dùng blocking REST call để check availability mỗi message | Overhead lớn | Cache + circuit breaker |

## Tổng kết Phase 8

### Khái niệm routing

| Loại | Quyết định dựa vào | Use case |
|---|---|---|
| **Content-based** | Nội dung message (giá trị các field) | Product type, region, amount tier |
| **Dynamic** | Runtime state (service ngoài, thời gian, feature flag) | Carrier availability, load balancing, A/B test |
| **Mixed** | Cả 2 | Thực tế production |

### 2 strategy implement

1. **StreamBridge** — bean `Consumer<T>`, gọi `streamBridge.send(binding, payload)` thủ công.
2. **Send-To header** — bean `Function<T, Message<?>>`, set header `spring.cloud.stream.sendTo.destination` để chỉ destination.

Cả 2 đều cần định nghĩa **custom output binding** trong YAML.

### Pattern kiến trúc production

```text
order-events  →  RouterProcessor  →  N output topic  →  N consumer microservice
                       │
                       ├── content-based rule (dựa vào field)
                       ├── dynamic state query (gọi service ngoài)
                       └── fallback destination
```

Router trở thành **service quan trọng**. Phải test kỹ, monitor sát.

## Take-away của Phase 8

- Processor không chỉ transform data, mà còn có thể **route** đến nhiều destination.
- 2 loại routing: **content-based** (theo nội dung message) + **dynamic** (theo runtime state).
- 2 strategy SCS: **StreamBridge** vs **Send-To header**. Cả 2 đều cần custom binding trong YAML.
- App thực tế thường **kết hợp** cả 2 loại routing.
- Extract routing logic sang class riêng → dễ test, dễ maintain.
- LUÔN có **fallback destination** cho case không match.
- Monitor mỗi output topic riêng → phát hiện drift (vd FedEx topic luôn empty).

## Các lỗi thường gặp

| Lỗi | Vấn đề | Sửa |
|---|---|---|
| Hard-code logic routing trong lambda | Không test được riêng | Tách Router class |
| Quên fallback route | Event mất khi không match rule nào | Default destination |
| Sync check external state mỗi message | Slow, bottleneck | Cache + refresh async |
| Send-To header với binding name sai (typo) | Silent fail | Dùng constant + integration test |
| Quên `@EnableScheduling` cho dynamic check | State bị stale | Thêm annotation vào runner |
| Bind output topic ở binder namespace sai | Spring bị confused | Cẩn thận với mixed binder config |

## Tóm tắt bài 2 + Phase 8

- **Dynamic routing**: decision tại runtime dựa vào external state (carrier availability, feature flag).
- Service inject vào processor → call in dispatch logic.
- Hybrid mix content-based + dynamic là common pattern.
- Test với mock service. Verify routing rules + fallback.
- Phase 8 complete: bạn build được routing processor production-ready.

**Bài kế tiếp** → [Phase 9 - Kafka Cluster Architecture deep dive](../phase-9-kafka-cluster/01-replication-isr.md)
