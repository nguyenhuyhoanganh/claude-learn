# Bài 1: Framework Concurrency — multi-thread consumer trong 1 JVM

Scenario: processor xử lý 1 order mất **200ms** (DB call, microservice call simulated). Producer phát **10 orders/sec**.

Default consumer = **single thread** → max 5 orders/sec → fall behind 50% mỗi giây.

Solution 1: **Spring Cloud Stream framework concurrency** = multiple consumer threads trong cùng JVM. Bài này: how it works, demo, limits, khi nào không đủ.

## Default: single consumer thread

```java
@Bean
public Function<OrderEvent, Message<?>> deliveryProcessor(...) {
    return order -> dispatch(order);
}
```

Internally (pseudocode):

```text
SCS framework:
  handler = your function
  kafkaConsumer = new KafkaConsumer(...)
  kafkaConsumer.subscribe("order-events")
  
  while (running) {
      records = kafkaConsumer.poll(1000ms)
      for (record in records) {
          result = handler.apply(record)   // ← single thread
          if (result.hasOutput) send(result)
      }
  }
```

**1 thread polls + processes**. Even if topic has 3 partitions, 1 thread reads all 3 partitions sequentially.

With 200ms/message: 1 thread → max 5 msg/sec.

## SCS concurrency property

```yaml
spring:
  cloud:
    stream:
      bindings:
        deliveryProcessor-in-0:
          destination: order-events
          group: delivery-service
          consumer:
            concurrency: 3                # ← KEY
```

`concurrency: 3` = SCS create **3 consumer threads** instead of 1.

### Internally (pseudocode)

```text
SCS framework:
  handler = your function
  executor = newFixedThreadPool(3)
  
  for (i in 0..3) {
      executor.submit(() -> {
          kafkaConsumer = new KafkaConsumer(...)
          kafkaConsumer.subscribe("order-events")
          while (running) {
              records = kafkaConsumer.poll(1000ms)
              for (record in records) {
                  result = handler.apply(record)
                  if (result.hasOutput) send(result)
              }
          }
      })
  }
```

3 threads. Each creates **own KafkaConsumer**, joins **same group**, gets assigned partition(s).

### Kafka view

```text
3 consumer threads (T1, T2, T3) join group "delivery-service".
Kafka: "3 consumers, doesn't know they're in same JVM."
Topic has 3 partitions:
  Partition 0 → T1
  Partition 1 → T2
  Partition 2 → T3
```

Kafka treat threads as separate consumers. Standard partition rebalance.

**3 threads × 5 msg/sec = 15 msg/sec total**. Now can keep up.

### Limit: concurrency ≤ partition count

```text
Topic 3 partitions + concurrency 5:
  T1, T2, T3 → 1 partition each
  T4, T5 → IDLE (no partition)
```

Same Phase 3 rule: max parallel consumers in group = partition count.

→ Set concurrency = partition count (or less if CPU/memory limited).

## Project setup (reuse Phase 8 routing)

`DeliveryService` with simulated slow processing:

```java
@Service
public class DeliveryService {

    public Object buildDelivery(OrderEvent order) {
        simulateNetworkCall();  // 200ms
        if (order.productType() == ProductType.DIGITAL) {
            return new DigitalDelivery(order.orderId(), "user-" + order.customerId() + "@x.com");
        }
        return new PhysicalDelivery(order.orderId(), order.orderId() + "th Street");
    }

    private void simulateNetworkCall() {
        try { Thread.sleep(200); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
    }
}
```

Processor:

```java
@Bean
public Function<OrderEvent, Message<?>> deliveryProcessor(DeliveryService service) {
    return order -> {
        Object delivery = service.buildDelivery(order);
        String destination = delivery instanceof DigitalDelivery ? DIGITAL_OUT : PHYSICAL_OUT;
        return MessageBuilder
            .withPayload(delivery)
            .setHeader(SEND_TO, destination)
            .build();
    };
}
```

Producer with **integer key** (so messages distribute across partitions):

```java
@Bean
public Supplier<Message<OrderEvent>> producer() {
    return () -> {
        int id = counter.incrementAndGet();
        OrderEvent order = new OrderEvent(id, id, random.nextInt(1, 1000),
            id % 2 == 0 ? ProductType.PHYSICAL : ProductType.DIGITAL);
        return MessageBuilder
            .withPayload(order)
            .setHeader(KafkaHeaders.KEY, id)
            .build();
    };
}
```

YAMLs:

```yaml
# section13/03-processor.yaml
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
                auto.offset.reset: earliest
      bindings:
        deliveryProcessor-in-0:
          destination: order-events
          group: delivery-service
          consumer:
            concurrency: 3                       # KEY
        digital-delivery-out:
          destination: digital-delivery-events
        physical-delivery-out:
          destination: physical-delivery-events
```

```yaml
# section13/04-producer.yaml
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
        fixed-delay: 100                          # 10 orders/sec
```

## Demo 1: thread-to-partition assignment

Start processor only (no producer). Watch log:

```text
Concurrency = 3:
  thread "container-0-C-1" assigned: order-events-0
  thread "container-0-C-2" assigned: order-events-1
  thread "container-0-C-3" assigned: order-events-2

Concurrency = 2:
  thread "container-0-C-1" assigned: order-events-0, order-events-1
  thread "container-0-C-2" assigned: order-events-2

Concurrency = 1:
  thread "container-0-C-1" assigned: order-events-0, order-events-1, order-events-2
```

Threads named `container-0-C-N`. Kafka assigns partitions evenly.

## Demo 2: concurrency=1 fails to keep up

Producer: 10 orders/sec.
Processor: concurrency=1, 200ms/message → 5 orders/sec.

Result after 60 sec:
- Producer: sent 600 orders, ID ~600.
- Processor: processed 300, ID ~300.

Lag growing 5 orders/sec. Backlog forever.

## Demo 3: concurrency=3 catches up

Recreate topic. Set concurrency=3.

Producer: 10 orders/sec.
Processor: 3 threads × 5 orders/sec = 15 orders/sec.

Result after 60 sec:
- Producer: sent 600, ID ~600.
- Processor: processed 600, ID ~600.

✅ Keeping up.

## Demo 4: increase producer rate beyond concurrency

Change producer to `poller.fixed-delay: 10` = 100 orders/sec.

Processor concurrency=3 → 15 orders/sec.

Result:
- Producer: 1500 at T=15.
- Processor: 200 at T=15.

Cannot keep up. **Framework concurrency capped at partition count = 3**. Cần thêm partition hoặc app-level concurrency.

## Limits of framework concurrency

| Limit | Why |
|---|---|
| concurrency ≤ partition count | Kafka rule: 1 partition / consumer |
| Total throughput = concurrency × per-thread rate | Per-thread limited by per-message latency |
| Memory: N threads × N Kafka consumers | Each consumer = own buffers, network |
| CPU: thread context switches | Diminishing returns past CPU core count |

Scaling beyond partition count:
- Add more partitions (Phase 3 caveat: rebalance ordering).
- Add more JVM instances.
- App-level concurrency (next lessons).

## When framework concurrency enough

✅ Processing time per message moderate (10-100ms).
✅ Partition count >= concurrency needed.
✅ CPU-bound or simple I/O.
✅ Ordering per partition required.

## When framework concurrency NOT enough

❌ Heavy I/O per message (500ms+, multiple network calls).
❌ Need processing faster than 1 thread/partition can handle.
❌ Partition count constrained.
❌ Multi-tenant: 1 service handles many topics with varying loads.

→ App-level concurrency (offload to executor pool inside handler).

## Concurrency vs Batch (Phase 10)

Both improve throughput, **different mechanisms**:

| Aspect | Framework concurrency | Batch processing |
|---|---|---|
| Mechanism | Multiple consumer threads | Single thread, batch records |
| Improvement | Parallel partition processing | Bulk operations (DB, network) |
| Ordering | Per partition | Per batch (interleaved per record) |
| Best for | CPU/IO per-message bound | DB bulk insert, large throughput |
| Combined? | YES — concurrency × batch | Multiplicative gains |

Can combine: 3 threads × batch processing → throughput × scale.

## Tóm tắt bài 1

- Default SCS consumer: **single thread**.
- `consumer.concurrency: N` = N consumer threads in 1 JVM.
- Each thread = own `KafkaConsumer`, joins same group, takes partition(s).
- Kafka view: N consumers (doesn't know same JVM).
- **Cap: concurrency ≤ partition count**.
- Demo: 200ms/msg + 10 msg/sec producer → concurrency=1 fails, concurrency=3 OK.
- Framework concurrency = parallelize across partitions. Cannot exceed partition limit.
- Heavy per-message processing → app-level concurrency (next bài).

**Bài kế tiếp** → [Bài 2: App-level concurrency — Unordered Parallel](02-unordered-concurrency.md)
