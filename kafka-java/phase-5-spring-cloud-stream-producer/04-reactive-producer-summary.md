# Bài 4: Reactive Producer + Phase 5 summary

2 mảng cuối Phase 5:
1. **Reactive producer** — `Supplier<Flux<T>>` không cần poller. Sink pattern thay StreamBridge.
2. Phase 5 summary + tổng kết.

## Reactive producer

Reactive `Supplier<Flux<T>>` elegant hơn poll-based:

```java
@Bean
public Supplier<Flux<String>> reactiveProducer() {
    return () -> Flux.interval(Duration.ofSeconds(1))
        .map(i -> "message-" + i)
        .doOnNext(msg -> log.info("emitting: {}", msg));
}
```

`Flux.interval(Duration)` emit value mỗi N giây. Map to string. SCS subscribe → forward to Kafka.

### Vì sao không cần poller?

```text
Traditional Supplier<T>:
  SCS poll loop: while (running) {
      msg = supplier.get();   ← active call, periodic
      send(msg);
  }

Reactive Supplier<Flux<T>>:
  SCS subscribes once:
      Flux<T> stream = supplier.get();
      stream.subscribe(msg -> send(msg));    ← passive observer
  
  Flux pushes data whenever it wants. SCS just receives.
```

Reactive flux = self-paced stream. Producer controls timing.

### YAML

```yaml
# section05/02-reactive-producer.yaml
spring:
  cloud:
    function:
      definition: reactiveProducer
    stream:
      kafka:
        binder:
          brokers: localhost:9092
      bindings:
        reactiveProducer-out-0:
          destination: demo-topic
      # NO poller config needed!
```

`poller.fixed-delay` không relevant — flux self-paced.

### Reactive producer with key

```java
@Bean
public Supplier<Flux<Message<OrderEvent>>> orderEventProducer() {
    return () -> generateOrderStream()
        .map(order -> MessageBuilder
            .withPayload(order)
            .setHeader(KafkaHeaders.KEY, order.getCustomerId())
            .build()
        );
}
```

`Flux<Message<T>>`. Same pattern.

### Dynamic emit qua Sinks (reactive equivalent of StreamBridge)

Reactive không cần `StreamBridge`. Dùng `Sinks` pattern:

```java
@Configuration
public class OrderEventConfig {

    @Bean
    public Sinks.Many<OrderEvent> orderEventSink() {
        return Sinks.many().multicast().onBackpressureBuffer();
    }

    @Bean
    public Supplier<Flux<OrderEvent>> orderEventProducer(Sinks.Many<OrderEvent> sink) {
        return () -> sink.asFlux();
    }
}
```

`Sinks.Many<T>` = mutable flux source. `asFlux()` exposes immutable view.

Service emit:

```java
@Service
public class OrderService {

    private final Sinks.Many<OrderEvent> orderEventSink;

    public OrderService(Sinks.Many<OrderEvent> orderEventSink) {
        this.orderEventSink = orderEventSink;
    }

    public Order placeOrder(OrderRequest req) {
        Order order = repo.save(new Order(req));
        
        orderEventSink.tryEmitNext(new OrderEventFromOrder(order));
        
        return order;
    }
}
```

`tryEmitNext` push event vào sink. Sink → Flux → SCS subscribe → Kafka.

**Tương đương StreamBridge nhưng reactive-native**.

### `Sinks.Many` flavors

| Method | Behavior |
|---|---|
| `unicast()` | 1 subscriber only (SCS) |
| `multicast()` | Multiple subscribers |
| `replay().latest()` | New subscriber gets last value |
| `.onBackpressureBuffer()` | Buffer if subscriber slow |
| `.onBackpressureError()` | Error if subscriber slow |

For SCS use case: `multicast().onBackpressureBuffer()` thường safe.

### StreamBridge vẫn dùng được trong reactive code

StreamBridge **không reactive nhưng non-blocking** (internal async). Reactive app vẫn có thể dùng:

```java
@Service
public class OrderService {

    private final StreamBridge streamBridge;

    public Order placeOrder(OrderRequest req) {
        Order order = repo.save(new Order(req));
        streamBridge.send("order-events-out", order);
        return order;
    }
}
```

Vẫn work. Personal taste: dùng Sinks cho reactive uniformity, hoặc StreamBridge cho simplicity.

## Phase 5 — toàn bộ summary

### Producer types covered

| Approach | When | Code pattern |
|---|---|---|
| `Supplier<T>` + poller | Periodic events (heartbeat, metrics) | `@Bean Supplier<T> bean() { return () -> ...; }` + poller config |
| `Supplier<Message<T>>` + poller | Periodic events with key/headers | `MessageBuilder.withPayload(...).setHeader(...).build()` |
| `StreamBridge` | On-demand business events | `streamBridge.send(bindingName, payload)` |
| `Supplier<Flux<T>>` (reactive) | Self-paced periodic streams | `Flux.interval(...).map(...)` |
| `Sinks.Many<T>` + reactive Supplier | On-demand events in reactive app | `sink.tryEmitNext(event)` |

### Configuration recap

Producer YAML core:
```yaml
spring:
  cloud:
    function:
      definition: producerBean              # if using Supplier
    stream:
      kafka:
        binder:
          brokers: localhost:9092
        bindings:
          producerBean-out-0:
            producer:
              configuration:
                key.serializer: ...StringSerializer     # if key set
                linger.ms: 5
                batch.size: 32768
                # other Kafka producer properties
      bindings:
        producerBean-out-0:
          destination: target-topic
      poller:                               # only for Supplier (non-reactive)
        fixed-delay: 1000
```

For StreamBridge: skip `function.definition` + `poller`, just bindings.

### Key takeaways

1. **`Supplier<T>` + poller** = period batch produce. Real-world use rare.
2. **`Message<T>` + `MessageBuilder`** = standard way to attach key + headers.
3. **`key.serializer` config mandatory** when sending key. Spring không guess.
4. **`KafkaHeaders.KEY`** outbound, **`KafkaHeaders.RECEIVED_KEY`** inbound (avoid accidental copy in processor).
5. **`StreamBridge`** = on-demand emit from any code. Default for business events.
6. **Reactive Supplier<Flux<T>>** + Sinks = elegant reactive equivalent.
7. **Don't emit before DB commit** — possible inconsistency. Use Outbox pattern for guarantees (Phase 13).

### Common production setup

OrderService example:

```java
@Service
public class OrderService {

    private final StreamBridge streamBridge;
    private final OrderRepository repo;

    @Transactional
    public Order placeOrder(OrderRequest req) {
        Order order = repo.save(new Order(req));
        
        Message<OrderPlacedEvent> msg = MessageBuilder
            .withPayload(new OrderPlacedEvent(order))
            .setHeader(KafkaHeaders.KEY, order.getCustomerId())
            .setHeader("traceId", MDC.get("traceId"))
            .build();
        
        streamBridge.send("order-events-out", msg);
        return order;
    }
}
```

YAML:
```yaml
spring:
  cloud:
    stream:
      kafka:
        binder:
          brokers: ${KAFKA_BROKERS:localhost:9092}
        bindings:
          order-events-out:
            producer:
              configuration:
                key.serializer: org.apache.kafka.common.serialization.StringSerializer
                acks: all                   # Phase 12
                enable.idempotence: true    # Phase 14
                compression.type: snappy
      bindings:
        order-events-out:
          destination: order-events
```

`acks: all`, idempotence — production reliability (Phase 12-14 detail).

## Common mistakes Phase 5

| Mistake | Why bad | Fix |
|---|---|---|
| Use Supplier for business event | Wrong abstraction — polls when no event | StreamBridge |
| Forget `key.serializer` config | `SerializationException` | Always config when key set |
| Hardcoded counter not thread-safe | Race condition in poller | `AtomicInteger/Long` |
| Random UUID as key | Lose ordering semantic | Entity ID |
| `streamBridge.send` to undefined binding | Implicit auto-config, lose visibility | Define binding explicitly |
| Send event before DB commit | Inconsistent state if crash | Outbox pattern |
| Reactive Supplier + manual subscribe | Errors not propagate | Return Flux, let framework subscribe |
| Skip `MessageBuilder`, send raw payload | No way to set key | Always Message<T> when key needed |

## Phase 4 + 5 toàn diện — bạn đã build được gì?

After Phase 4 + 5:
- ✅ Consumer that subscribes to Kafka topic, deserializes messages, processes.
- ✅ Producer that sends periodic (Supplier) or on-demand (StreamBridge) events.
- ✅ Send + read message keys for partition / ordering.
- ✅ Send + read custom headers (traceId, source) for observability.
- ✅ Reactive variants if stack reactive.
- ✅ Per-binding config override.
- ✅ Group name + auto-offset-reset for consumer reliability.

Next phases will add:
- **Phase 6**: Consumer Group scaling deep-dive.
- **Phase 7**: Processor pattern (consume + emit).
- **Phase 8**: Event routing (conditional, multi-destination).
- **Phase 9**: Kafka cluster architecture (replication, ISR).
- **Phase 10-11**: Performance (batch, concurrency).
- **Phase 12-14**: Reliability (acks, retry, transactions, idempotence).
- **Phase 15-16**: Testing + security.
- **Phase 17-18**: Final project + best practices.

## Tóm tắt bài 4 + Phase 5

- **Reactive Supplier<Flux<T>>** — không cần poller, framework subscribe Flux.
- `Flux.interval(...)` cho periodic. Sinks (`tryEmitNext`) cho on-demand.
- `Sinks.Many<T>` = reactive equivalent của StreamBridge.
- StreamBridge cũng work trong reactive code (non-blocking internal).
- Phase 5 covered 5 producer approaches. Default StreamBridge cho 90% production.
- Critical configs: `key.serializer`, `MessageBuilder`, `KafkaHeaders.KEY`.
- Outbox pattern preview cho atomic "save + emit" (Phase 13 deep-dive).

**Bài kế tiếp** → [Phase 6 - Consumer Groups scaling](../phase-6-consumer-groups/01-scaling-deep-dive.md)
