# Bài 1: Scaling Consumer Groups — demo rebalancing thực tế

Phase 3 đã dạy lý thuyết rebalancing với console consumer. Bây giờ với Spring Cloud Stream app + counter tracking, ta có thể **chứng minh count đúng** sau khi scale up/down: producer gửi N → tất cả consumers consume tổng N (không miss, không double).

Section ngắn (4 lessons). Goal: observe Kafka behavior, không phải app reliability (Phase 13 sẽ deal app errors).

## Setup demo

```text
Topic: order-events (3 partitions)
Producer: emit 1 message every 1ms = 1000 msg/sec
Consumer group "demo-group": start with 1 consumer, scale to 3, then scale down to 1.

Each consumer increments AtomicInteger counter.
On shutdown (@PreDestroy), print total processed.

Sum of all consumers' counters == producer's emit count?
```

Setup verifies Kafka's promise: **no message lost, no duplicate** during rebalance.

## Code: shared message counter

`MessageCounter.java`:

```java
package com.calmvinsguru.playground.section06.consumer;

import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import java.util.concurrent.atomic.AtomicInteger;

@Component
public class MessageCounter {

    private static final Logger log = LoggerFactory.getLogger(MessageCounter.class);
    private final AtomicInteger counter = new AtomicInteger();

    public void increment() {
        counter.incrementAndGet();
    }

    @PreDestroy
    public void printTotal() {
        log.info("Total messages consumed: {}", counter.get());
    }
}
```

`@PreDestroy` hook prints total khi app shutdown gracefully.

### ConsumerConfig.java

```java
@Configuration
public class ConsumerConfig {

    private final MessageCounter counter;

    public ConsumerConfig(MessageCounter counter) {
        this.counter = counter;
    }

    @Bean
    public Consumer<String> consumer() {
        return msg -> {
            counter.increment();
            log.info("received: {}", msg);
        };
    }
}
```

Consumer = increment + log. Body minimal để focus vào rebalancing behavior.

### ProducerConfig.java

```java
@Configuration
public class ProducerConfig {

    private final AtomicInteger counter = new AtomicInteger();

    @Bean
    public Supplier<String> producer() {
        return () -> "msg-" + counter.incrementAndGet();
    }
}
```

### YAML

```yaml
# section06/01-consumer.yaml
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
          destination: order-events
          group: demo-group         # ← all consumers share this!
```

```yaml
# section06/02-producer.yaml
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
        fixed-delay: 1               # 1 message / millisecond
```

### Section06Runner — multiple consumer instances

```java
public class Section06Runner {

    @SpringBootApplication
    @ComponentScan("com.calmvinsguru.playground.section06.consumer")
    public static class ConsumerRunner1 {
        public static void main(String[] args) {
            SpringApplication.run(ConsumerRunner1.class, args);
        }
    }

    @SpringBootApplication
    @ComponentScan("com.calmvinsguru.playground.section06.consumer")
    public static class ConsumerRunner2 {
        public static void main(String[] args) {
            SpringApplication.run(ConsumerRunner2.class, args);
        }
    }

    @SpringBootApplication
    @ComponentScan("com.calmvinsguru.playground.section06.consumer")
    public static class ConsumerRunner3 {
        public static void main(String[] args) {
            SpringApplication.run(ConsumerRunner3.class, args);
        }
    }

    @SpringBootApplication
    @ComponentScan("com.calmvinsguru.playground.section06.producer")
    public static class ProducerRunner {
        public static void main(String[] args) {
            SpringApplication.run(ProducerRunner.class, args);
        }
    }
}
```

4 inner classes. Mỗi run independent JVM. **Same code, same group → cluster of consumers**.

## Demo: scale out

### Step 1: Create topic with 3 partitions

```bash
docker exec -it kafka bash
cd /opt/kafka/bin

./kafka-topics.sh --bootstrap-server localhost:9092 --delete --topic order-events
./kafka-topics.sh --bootstrap-server localhost:9092 --create --topic order-events --partitions 3
```

### Step 2: Start ConsumerRunner1

Args: `--section=section06 --config=01-consumer.yaml`.

Log:
```text
[Consumer ...] groupId=demo-group
Adding newly assigned partitions: order-events-0, order-events-1, order-events-2
```

✅ 1 consumer → owns **all 3 partitions**.

### Step 3: Start ConsumerRunner2

Log từ Consumer 1:
```text
Revoking previously assigned partitions: order-events-0, order-events-1, order-events-2
Adding newly assigned partitions: order-events-0, order-events-1
```

Log từ Consumer 2:
```text
Adding newly assigned partitions: order-events-2
```

✅ Rebalance done. Consumer 1: P0+P1. Consumer 2: P2.

### Step 4: Start ConsumerRunner3

Log Consumer 1:
```text
Revoking previously assigned partitions: order-events-0, order-events-1
Adding newly assigned partitions: order-events-0
```

Log Consumer 2:
```text
Revoking previously assigned partitions: order-events-2
Adding newly assigned partitions: order-events-1
```

Log Consumer 3:
```text
Adding newly assigned partitions: order-events-2
```

✅ Final assignment: each consumer 1 partition. Perfect 1-1.

## Demo: scale down (consumer leaves)

### Step 5: Kill Consumer 1 (Ctrl-C)

Pre-destroy log:
```text
Total messages consumed: 0      (we haven't started producer yet)
```

Consumer 2 + 3 log:
```text
Revoking previously assigned partitions: ...
Adding newly assigned partitions: ...
```

After rebalance: Consumer 2 + 3 split 3 partitions (vd 2+1).

### Step 6: Kill Consumer 2

Consumer 3 log:
```text
Adding newly assigned partitions: order-events-0, order-events-1, order-events-2
```

✅ Consumer 3 ôm tất cả 3 partition.

## Demo: full flow with producer + counter verification

### Step 7: Stop tất cả consumers. Start producer.

```text
Producer: msg-1, msg-2, msg-3, msg-4, ...
```

Super fast, 1000/sec. Messages accumulate in 3 partitions.

### Step 8: Start Consumer 1 (drain)

```text
received: msg-1
received: msg-2
...
```

1 consumer handle all 3 partitions, processes fast.

### Step 9: Scale up to 3 consumers (mid-flight)

Start Consumer 2 → rebalance → split. Start Consumer 3 → rebalance → 1-1.

Mỗi consumer xử lý ~33% load.

### Step 10: Scale down

Kill Consumer 1 → pre-destroy prints:
```text
Total messages consumed: 27851
```

Kill Consumer 2 → pre-destroy prints:
```text
Total messages consumed: 31204
```

### Step 11: Stop producer

Producer log final:
```text
... msg-83343 sent
```

Total produced = **83343**.

### Step 12: Stop Consumer 3

Pre-destroy:
```text
Total messages consumed: 24288
```

### Step 13: Verify

```text
Consumer 1: 27851
Consumer 2: 31204
Consumer 3: 24288
SUM:        83343    ✅
Producer:   83343
```

🎉 **Sum matches**. Không message nào bị mất, không message nào duplicate giữa các consumers, dù rebalance xảy ra nhiều lần.

## Clarification — demo này về Kafka, không phải app reliability

Bạn có thể hỏi: "Demo này không có DB call, không có failure simulation, không phải production-like."

**Đúng**. Nhưng:
- **Goal section này**: demo **Kafka's partition distribution + rebalancing behavior**.
- Kafka guarantee: messages assigned to consumers correctly. Sum matches.
- KHÔNG về app reliability (DB transaction, retry on failure).

App-level concerns ở các Phase sau:
- **Phase 12**: Acknowledgement modes — when is message "consumed"?
- **Phase 13**: Error handling — what if consumer process throws exception?
- **Phase 14**: Transactions — atomic processing across topics.

Phase 6 cho mental model: **Kafka không lose message do rebalancing**. App layer dưới đó là chuyện khác.

## Production observations

### Rebalance time

Default rebalance: stop-the-world. Consumers pause ~5-10 giây.

During pause:
- Producer tiếp tục emit → broker accumulate messages.
- Consumers không process.
- Pause xong → resume.

→ Latency spike khi rebalance. Production: minimize via:
- **Cooperative rebalance** (Phase 11).
- **Static membership** (`group.instance.id`).
- Avoid frequent restart (rolling deploy → rebalance storm).

### Effective max consumers = partitions

```text
3 partitions + 5 consumers → 3 active, 2 idle.
```

Scale up beyond partition count → wasted compute. Plan partitions theo max expected scale (Phase 3 bài 7 covered).

### Consumer offset persistence

When consumer 1 dies, broker remembers consumer 1's last committed offset. Consumer 2 (rebalanced to take that partition) **continues from there**.

→ Stateless app code OK. Offset state persisted server-side.

## Common pitfalls in real apps

(Preview của upcoming phases)

| Pitfall | Phase |
|---|---|
| Consumer processes message + crash before commit → re-process | Phase 12 |
| Consumer processes + commit + crash before persist DB → message "lost" from app perspective | Phase 13 |
| Long processing kicks consumer from group | Phase 11 |
| Rebalance storm during rolling deploy | Phase 11 |
| Consumer config mismatch in group → some idle | Operational |
| Network blip → fake leave → unnecessary rebalance | Tuning session.timeout.ms |

## Tóm tắt bài 1 + Phase 6

- Phase 6 = practical demo Kafka rebalancing.
- Setup: 3-partition topic + producer (1ms/msg) + 3 consumer instances.
- Observed: scale up → rebalance to 1 partition per consumer. Scale down → remaining ones absorb partitions.
- Counter verification: Sum(consumed) = Total(produced). **Kafka guarantee** holds.
- Demo focus = Kafka behavior, NOT app reliability (DB call, error handle). Later phases.
- Production: minimize rebalance disruption via cooperative protocol + static membership (Phase 11).
- Effective max consumers = number of partitions. Plan partition count ahead.

**Bài kế tiếp** → [Phase 7 - SCS Processor pattern](../phase-7-spring-cloud-stream-processor/01-processor-pattern.md)
