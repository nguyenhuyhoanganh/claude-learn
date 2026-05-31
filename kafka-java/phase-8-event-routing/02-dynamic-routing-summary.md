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

Mock `CarrierAvailabilityService`. Verify decision logic without Kafka.

## Anti-patterns

| Anti-pattern | Problem | Fix |
|---|---|---|
| Hardcode availability check inside lambda | Not testable | Inject service |
| Magic strings for binding names | Typo risk | Constants |
| Forget toggle scheduling thread safety | Race conditions | `AtomicBoolean` / synchronized |
| Long-running availability check in dispatch | Blocks processor | Background check + cached state |
| Missing fallback for "all carriers down" | Event lost / exception | Default route + manual reprocess |
| Use blocking REST call to check availability | Per-message overhead | Cache + circuit breaker |

## Phase 8 — toàn bộ summary

### Routing concepts

| Type | Decision based on | Use case |
|---|---|---|
| **Content-based** | Message content (field values) | Product type, region, amount tier |
| **Dynamic** | Runtime state (external service, time, flag) | Carrier availability, load balancing, A/B test |
| **Mixed** | Both | Production reality |

### 2 implementation strategies

1. **StreamBridge** — bean `Consumer<T>`, manually `streamBridge.send(binding, payload)`.
2. **Send-To header** — bean `Function<T, Message<?>>`, set `spring.cloud.stream.sendTo.destination`.

Both define custom output bindings in YAML.

### Production architecture pattern

```text
order-events  →  RouterProcessor  →  N output topics  →  N consumer microservices
                       │
                       ├── content-based rules
                       ├── dynamic state queries
                       └── fallback destination
```

Router becomes critical service. Test thoroughly, monitor closely.

## Phase 8 takeaways

- Processor không chỉ transform, mà còn **route**.
- 2 routing types: content-based (message content) + dynamic (runtime state).
- 2 SCS strategies: StreamBridge vs Send-To header. Both define custom bindings.
- Real apps **combine** both routing types.
- Extract routing logic to dedicated class for testability.
- Always fallback destination cho unhandled cases.
- Monitor each output topic (drift detection).

## Common mistakes

| Mistake | Why bad | Fix |
|---|---|---|
| Hardcode logic inside lambda | Untestable | Router class |
| Skip fallback route | Events lost | Default destination |
| Sync external check per message | Slow | Cache + async refresh |
| Send-To header with wrong binding name | Silent fail | Constants + integration test |
| Forget @EnableScheduling for dynamic check | Stale state | Add annotation |
| Bind output topics in wrong namespace | Spring confused | Mixed binder configs careful |

## Tóm tắt bài 2 + Phase 8

- **Dynamic routing**: decision tại runtime dựa vào external state (carrier availability, feature flag).
- Service inject vào processor → call in dispatch logic.
- Hybrid mix content-based + dynamic là common pattern.
- Test với mock service. Verify routing rules + fallback.
- Phase 8 complete: bạn build được routing processor production-ready.

**Bài kế tiếp** → [Phase 9 - Kafka Cluster Architecture deep dive](../phase-9-kafka-cluster/01-replication-isr.md)
