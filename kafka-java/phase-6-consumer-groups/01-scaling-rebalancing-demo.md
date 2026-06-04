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

## Demo: scale down (consumer leave group)

### Bước 5: Kill Consumer 1 (Ctrl-C)

Pre-destroy log:
```text
Total messages consumed: 0      (chưa start producer)
```

Log Consumer 2 + 3:
```text
Revoking previously assigned partitions: ...
Adding newly assigned partitions: ...
```

Sau rebalance: Consumer 2 + 3 chia nhau 3 partition (vd 2+1).

### Bước 6: Kill Consumer 2

Log Consumer 3:
```text
Adding newly assigned partitions: order-events-0, order-events-1, order-events-2
```

✅ Consumer 3 còn lại ôm cả 3 partition.

## Demo full flow — kèm counter verification

### Bước 7: Stop tất cả consumer. Start producer.

```text
Producer: msg-1, msg-2, msg-3, msg-4, ...
```

Producer chạy cực nhanh, 1000 msg/giây. Message tích luỹ trong 3 partition.

### Bước 8: Start Consumer 1 để drain backlog

```text
received: msg-1
received: msg-2
...
```

1 consumer ôm cả 3 partition, xử lý nhanh.

### Bước 9: Scale up lên 3 consumer (giữa lúc producer vẫn chạy)

Start Consumer 2 → rebalance → split. Start Consumer 3 → rebalance → 1-1.

Mỗi consumer xử lý ~33% load.

### Bước 10: Scale down

Kill Consumer 1 → log pre-destroy in ra:
```text
Total messages consumed: 27851
```

Kill Consumer 2 → log pre-destroy in ra:
```text
Total messages consumed: 31204
```

### Bước 11: Stop producer

Log producer cuối cùng:
```text
... msg-83343 sent
```

Tổng số đã produce = **83343**.

### Bước 12: Stop Consumer 3

Pre-destroy:
```text
Total messages consumed: 24288
```

### Bước 13: Verify — tổng count phải bằng tổng produce

```text
Consumer 1: 27851
Consumer 2: 31204
Consumer 3: 24288
TỔNG:       83343    ✅
Producer:   83343
```

🎉 **Tổng khớp**. **KHÔNG có message nào bị mất, KHÔNG có message nào duplicate** giữa các consumer — dù rebalance đã xảy ra nhiều lần trong quá trình demo.

## Lưu ý — demo này về Kafka behavior, KHÔNG phải app reliability

Bạn có thể thắc mắc: "Demo này không có DB call, không simulate failure, không giống production thực sự."

**Đúng**. Nhưng:
- **Mục tiêu của Section này**: demo **cách Kafka phân phối partition + rebalance**.
- Kafka đảm bảo: message được assign cho consumer **chính xác**. Tổng count khớp.
- KHÔNG về app reliability (DB transaction, retry on failure).

Những vấn đề về app reliability sẽ học ở các Phase sau:
- **Phase 12**: Acknowledgement mode — khi nào 1 message được coi là "đã consume"?
- **Phase 13**: Error handling — nếu consumer throw exception thì sao?
- **Phase 14**: Transactions — xử lý atomic across nhiều topic.

Phase 6 cho mental model: **Kafka KHÔNG mất message khi rebalance**. App layer phía trên là chuyện khác.

## Quan sát production thực tế

### Thời gian rebalance

Rebalance default theo kiểu "stop-the-world": consumer **dừng consume** trong khoảng 5-10 giây.

Trong khoảng dừng đó:
- Producer vẫn publish bình thường → broker tích luỹ message.
- Consumer KHÔNG process.
- Hết rebalance → resume.

→ **Latency spike** khi rebalance. Production minimize bằng:
- **Cooperative rebalance** (Phase 11 sẽ học).
- **Static membership** (`group.instance.id`) — instance restart không trigger rebalance.
- Tránh restart thường xuyên (rolling deploy gây rebalance storm).

### Số consumer hiệu quả = số partition

```text
3 partition + 5 consumer → 3 active, 2 idle.
```

Scale up vượt số partition = lãng phí compute (consumer thừa ngồi không). Plan số partition theo scale tối đa dự kiến (đã học ở Phase 3 bài 7).

### Offset persist server-side

Khi Consumer 1 chết, broker vẫn nhớ **last committed offset** của Consumer 1. Consumer 2 (rebalance lên take partition đó) sẽ **resume từ chính offset đó**.

→ App code có thể stateless. Offset state được Kafka lưu server-side trong `__consumer_offsets` topic.

## Các pitfall trong app thực tế (preview các phase sau)

| Pitfall | Phase học sâu |
|---|---|
| Consumer xử lý message → crash trước commit → message bị process lại | Phase 12 |
| Consumer commit → crash trước khi save DB → message "mất" từ góc nhìn app | Phase 13 |
| Consumer xử lý dài → bị kick khỏi group → rebalance | Phase 11 |
| Rolling deploy gây rebalance storm | Phase 11 |
| Consumer config mismatch trong group → một số bị idle | Vấn đề vận hành |
| Network blip → broker tưởng consumer leave → rebalance không cần thiết | Tune `session.timeout.ms` |

## Tóm tắt bài 1 + Phase 6

- Phase 6 là demo thực tế của **rebalancing trong Kafka**.
- Setup: topic 3 partition + producer (1 msg/ms = 1000 msg/giây) + 3 instance consumer.
- Quan sát:
  - Scale up → rebalance → mỗi consumer ôm 1 partition.
  - Scale down → consumer còn lại absorb partition của consumer đã leave.
- Verify bằng counter: **Tổng(consumed) = Tổng(produced)**. Kafka guarantee hoạt động đúng.
- Demo focus = **Kafka behavior**, KHÔNG phải app reliability (DB call, error handle) — học ở phase sau.
- Production: giảm disruption khi rebalance bằng cooperative protocol + static membership (Phase 11).
- Số consumer hiệu quả tối đa = số partition. Cần plan số partition trước khi tạo topic.

**Bài kế tiếp** → [Phase 7 - SCS Processor pattern](../phase-7-spring-cloud-stream-processor/01-processor-pattern.md)
