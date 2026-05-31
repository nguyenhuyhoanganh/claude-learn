# Bài 2: App-Level Unordered Concurrency — virtual threads cho heavy I/O

Framework concurrency capped at partition count. Producer 100 msg/sec + 200ms/msg processing + 3 partitions max → cần **15 msg/sec** trở lên. Solution: app-level concurrency với **virtual threads** + Java 24 stream gatherers.

Bài này: scenario unordered (message order không quan trọng). Bài sau: ordered.

## Khi nào ordering không quan trọng?

| Use case | Ordering needed? |
|---|---|
| Banking transactions per account | YES (deposit must precede withdrawal) |
| User actions per session | YES (login → action → logout) |
| Product views (analytics) | NO (just count) |
| Notification dispatch | NO (each independent) |
| Image processing batch | NO (each photo independent) |
| Log shipping | NO |
| Email send queue | NO (different recipients) |

For NO-ordering case: process N messages **parallel**, output order can be **interleaved**.

## Approach: batch + virtual threads concurrent

```text
1. Enable batch mode → consumer receives List<Order>.
2. Process list with virtual threads (one thread per order).
3. All process concurrently. Wait for all done.
4. Return List<Message<Delivery>> for SCS to emit.
```

Order of output in list may differ from input. OK — we said unordered.

## Why virtual threads?

Each delivery build = **200ms blocking call** (DB / HTTP).

Platform threads (default Java):
- Pool size limited (~CPU cores).
- 1 thread blocks during 200ms wait → other tasks queue.
- 100 messages × 200ms / 4 threads = 50,000ms total. Too slow.

Virtual threads (JEP 425, Java 21+):
- Cheap (no 1-1 mapping to OS thread).
- Park during blocking I/O → schedule another task on carrier thread.
- 100 virtual threads doing 200ms blocking = 200ms total (all parked simultaneously).
- Designed exactly for **blocking I/O at high concurrency**.

→ Virtual threads = perfect fit for "many concurrent network calls."

## Wrong: `Stream.parallel()`

```java
@Bean
public Function<List<Order>, List<Message<Delivery>>> deliveryProcessor() {
    return orders -> orders.stream()
        .parallel()                              // ← WRONG for I/O
        .map(o -> deliveryService.build(o))
        .map(this::toMessage)
        .toList();
}
```

`Stream.parallel()` uses **ForkJoinPool.commonPool**:
- Default = ~CPU cores threads.
- Designed for **CPU-bound** parallelism.
- I/O blocking → blocks platform threads → starves entire JVM.

DON'T USE for blocking I/O.

## Right: `Gatherers.mapConcurrent` with virtual threads

Java 24 introduces **Stream Gatherers** (JEP 485). `Gatherers.mapConcurrent` runs a function concurrently with bounded concurrency.

```java
import java.util.stream.Gatherers;

@Bean
@ConditionalOnProperty(name = "processing.mode", havingValue = "unordered")
public Function<List<OrderEvent>, List<Message<?>>> deliveryProcessor(DeliveryService service) {
    return orders -> orders.stream()
        .gather(Gatherers.mapConcurrent(500, service::buildDelivery))  // ← KEY
        .map(this::toMessage)
        .toList();
}

private Message<?> toMessage(Object delivery) {
    String destination = delivery instanceof DigitalDelivery 
        ? DIGITAL_OUT : PHYSICAL_OUT;
    return MessageBuilder
        .withPayload(delivery)
        .setHeader(SEND_TO, destination)
        .build();
}
```

Breakdown:
- `Gatherers.mapConcurrent(500, fn)`:
  - Run `fn` on each element.
  - Max **500 concurrent** invocations.
  - Uses **virtual threads** under the hood.
  - Pulls more items as virtual threads finish.
- 500 concurrency: matches `max.poll.records` default. If batch is 500, all 500 start concurrent.

### Why 500?

Batch size = max-poll-records = 500 default. 500 virtual threads handle all parallel.

If batch only 100 → 100 virtual threads start, 400 unused. OK.

Could set higher (1000, 2000) for safety.

## `@ConditionalOnProperty` for switching demos

```java
@Bean
@ConditionalOnProperty(name = "processing.mode", havingValue = "unordered")
public Function<List<OrderEvent>, List<Message<?>>> unorderedProcessor(...) { ... }

@Bean
@ConditionalOnProperty(name = "processing.mode", havingValue = "ordered")
public Function<List<OrderEvent>, List<Message<?>>> orderedProcessor(...) { ... }
```

Activate via YAML:
```yaml
processing:
  mode: unordered    # or "ordered"
```

Only 1 bean active at a time. Demo flexibility.

## YAML config

```yaml
# section14/03-processor.yaml
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
            consumer:
              configuration:
                key.deserializer: org.apache.kafka.common.serialization.IntegerDeserializer
                max.poll.records: 500
                auto.offset.reset: earliest
      bindings:
        deliveryProcessor-in-0:
          destination: order-events
          group: delivery-service
          consumer:
            batch-mode: true              # batch consumption
            # NO concurrency — we do it ourselves
        digital-delivery-out:
          destination: digital-delivery-events
        physical-delivery-out:
          destination: physical-delivery-events

processing:
  mode: unordered
```

NOT `concurrency: 3`. Framework concurrency 1 (default). App concurrency 500 (virtual threads).

## Producer YAML for high-rate test

```yaml
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
            producer:
              configuration:
                key.serializer: org.apache.kafka.common.serialization.IntegerSerializer
      bindings:
        producer-out-0:
          destination: order-events
      poller:
        fixed-delay: 10           # 100 orders/sec
```

## Demo

Fresh Kafka. Create topic (1 partition is enough; we're not using framework concurrency):

```bash
./kafka-topics.sh ... --create --topic order-events --partitions 1
```

Start:
1. DigitalConsumer.
2. PhysicalConsumer.
3. Processor (with `processing.mode=unordered`).
4. Producer (100 orders/sec).

Processor log:
```text
[Consumer] Adding newly assigned partitions: order-events-0   ← only 1 thread
batch received: 500 messages
batch received: 500 messages
batch received: 100 messages
...
```

DigitalConsumer log (rapid stream):
```text
digital delivery: ...orderId=1
digital delivery: ...orderId=3
digital delivery: ...orderId=7      ← out of order!
digital delivery: ...orderId=5
digital delivery: ...orderId=11
...
```

PhysicalConsumer similar.

✅ Processor keeps up with 100 orders/sec.
⚠️ Output not ordered (orderIds interleaved).

For unordered use case — acceptable.

## Throughput math

```text
Without virtual threads:
  500 records × 200ms = 100,000ms = 100 sec per batch.
  
With Gatherers.mapConcurrent(500):
  All 500 concurrent in virtual threads.
  All park during 200ms blocking call simultaneously.
  Wall clock: ~200ms per batch.
  
500× improvement.
```

Plus batch overhead reduction. Plus possible producer-side gains. Total can hit 100k+ msg/sec.

## Trade-offs

| Pro | Con |
|---|---|
| Massive throughput for I/O-heavy | Output unordered |
| Cheap virtual threads | Java 21+ required |
| Bounded concurrency (mapConcurrent) | Need batch mode + change function signature |
| Reuses delivery service unchanged | Errors handle per-message (Phase 13) |
| Single JVM, no extra deploys | App-level state tricky (concurrent mutation) |

## Common pitfalls

| Pitfall | Problem | Fix |
|---|---|---|
| `Stream.parallel()` for I/O | Blocks common ForkJoinPool | Use virtual threads / Gatherers |
| No bounded concurrency | 10000 virtual threads → DB overload | `mapConcurrent(500, ...)` |
| Mutable state in handler | Race condition | Stateless handler |
| Forget batch-mode YAML | Receive single message, batch ignored | `batch-mode: true` |
| Forget `processing.mode` property | No bean active | YAML config |
| Ordering matters but use unordered | Bug | Next lesson: ordered concurrency |

## Tóm tắt bài 2

- App-level concurrency bypasses framework partition limit.
- Approach: **batch mode + virtual threads** via `Gatherers.mapConcurrent`.
- Virtual threads (Java 21+) ideal cho blocking I/O at high concurrency.
- `Stream.parallel()` is WRONG for I/O (uses platform threads).
- Throughput improvement 500× possible per batch.
- Output **unordered** — OK cho many use cases (analytics, notifications).
- `@ConditionalOnProperty` switches demo modes.
- Single partition can handle 100s of msg/sec when concurrency is app-level.

**Bài kế tiếp** → [Bài 3: Ordered concurrency — preserve key-based ordering](03-ordered-concurrency.md)
