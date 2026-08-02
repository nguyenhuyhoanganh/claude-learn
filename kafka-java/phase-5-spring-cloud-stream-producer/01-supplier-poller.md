# Bài 1: Producer với Supplier + Poller configuration

Bài này: viết Kafka producer Java đầu tiên qua SCS. Use `Supplier<T>` interface, hiểu cơ chế **poller** invoke supplier theo periodic interval, demo + tune polling rate.

## Vấn đề: producer khác consumer ở đâu

Consumer architecture:

```text
Kafka broker  ──message──►  SCS framework  ──invoke──►  Consumer<T> bean
                                                            │
                                                            │ message arrives → call accept()
                                                            ▼
                                                       business logic
```

SCS receive message từ Kafka → call `consumer.accept(msg)`. Trigger = message arrival. Natural reactive.

Producer architecture với `Supplier<T>`:

```text
SCS framework  ──invoke supplier.get()??──►  Supplier<T> bean
                                                  │
                                                  │ return T
                                                  ▼
                                              SCS sends to Kafka
```

Trigger là gì? Không có "incoming event" để react. SCS phải **chủ động call** `supplier.get()` periodically.

→ Cần **poller config** = "call supplier.get() mỗi N ms."

### Pseudocode internal SCS

Consumer:
```java
// SCS internal loop (pseudocode)
while (running) {
    Message msg = kafkaConsumer.poll(timeout);
    if (msg != null) {
        consumerBean.accept(msg);
    }
}
```

Producer:
```java
// SCS internal loop (pseudocode)
while (running) {
    Object msg = supplierBean.get();
    if (msg != null) {
        kafkaProducer.send(topic, msg);
    }
    Thread.sleep(pollerInterval);    // ← key
}
```

Default `pollerInterval` = **1000 ms** (1 second). 1 message/second to topic.

## Code first producer

### Package layout

```text
src/main/java/com/calmvinsguru/playground/section03/
├── consumer/
│   ├── ConsumerConfig.java       ← from Phase 4
│   └── ...
├── producer/
│   └── ProducerConfig.java        ← NEW
└── Section03Runner.java
```

### ProducerConfig.java

```java
package com.calmvinsguru.playground.section03.producer;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;

@Configuration
public class ProducerConfig {

    private final AtomicInteger counter = new AtomicInteger();

    @Bean
    public Supplier<String> producer() {
        return () -> "message-" + counter.incrementAndGet();
    }
}
```

Counter để track call number. Supplier returns `"message-1"`, `"message-2"`, ...

`AtomicInteger` cho thread-safety (poller có thể chạy multi-threaded).

### YAML cho producer

```yaml
# section03/02-producer.yaml
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
          destination: demo-topic
      poller:
        fixed-delay: 1000              # ← poller interval in ms
        initial-delay: 0
```

`poller.fixed-delay` = wait between calls. `initial-delay` = first wait after app start.

### YAML cho consumer (reuse from Phase 4)

```yaml
# section03/01-consumer.yaml
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

## 2 runners — chạy producer + consumer như 2 app

Producer + consumer = 2 services khác nhau trong real-world. Playground chạy như 2 JVM independent.

### Section03Runner.java

```java
package com.calmvinsguru.playground.section03;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.ComponentScan;

public class Section03Runner {

    @SpringBootApplication
    @ComponentScan("com.calmvinsguru.playground.section03.consumer")
    public static class ConsumerRunner {
        public static void main(String[] args) {
            SpringApplication.run(ConsumerRunner.class, args);
        }
    }

    @SpringBootApplication
    @ComponentScan("com.calmvinsguru.playground.section03.producer")
    public static class ProducerRunner {
        public static void main(String[] args) {
            SpringApplication.run(ProducerRunner.class, args);
        }
    }
}
```

2 inner classes. `@ComponentScan` ép scope cho **một** package.

### Run 2 process

IDE: tạo 2 run configurations.

**Run config 1: Consumer**
```text
Main class: ...Section03Runner$ConsumerRunner
Program arguments: --section=section03 --config=01-consumer.yaml
```

**Run config 2: Producer**
```text
Main class: ...Section03Runner$ProducerRunner
Program arguments: --section=section03 --config=02-producer.yaml
```

Run consumer trước. Đợi `Adding newly assigned partitions: demo-topic-0`.

Run producer.

Consumer log:
```text
received: message-1
received: message-2
received: message-3
...
```

✅ Producer gửi mỗi giây 1 message. Consumer nhận.

## Demo: stop consumer mid-flight

Producer chạy tiếp. Consumer stop tạm.

```text
Producer log: message-13 sent, message-14 sent, ...
Consumer log: received: message-13. (stopped here)
```

Restart consumer. Vì cùng `group: demo-group`, ledger nhớ offset 13.

```text
Consumer log on restart:
  received: message-14
  received: message-15
  ...
```

✅ Resume from where left off.

## Tune polling interval

Đổi:
```yaml
poller:
  fixed-delay: 100        # 10× faster
```

Restart producer. Now 10 messages/sec.

```text
received: message-1
received: message-2
...
received: message-100
```

Fast burst. Counter reset to 1 mỗi restart vì `AtomicInteger` in-memory.

### Các option config poller phổ biến

```yaml
poller:
  fixed-delay: 1000          # mặc định, 1 giây 1 lần
  # HOẶC dùng cron expression:
  cron: "*/5 * * * * *"      # mỗi 5 giây
  initial-delay: 0           # delay lần gọi đầu tiên sau khi app start
  max-messages-per-poll: 1   # mỗi chu kỳ poll lấy bao nhiêu message
```

## Hạn chế của Supplier-based producer

Supplier polling = **sinh event theo chu kỳ**. Use case thực tế không nhiều:

- Heartbeat event (1 msg/phút báo "service đang sống").
- Emit metric định kỳ (CPU, memory mỗi 30 giây).
- Trigger scheduled batch.

Đa số business event **KHÔNG periodic**:
- User đặt hàng → event xảy ra ngẫu nhiên theo user action.
- Payment được nhận → event theo timing thanh toán thực.
- User click → event theo user behavior.

→ Trigger là **action ngoài** (HTTP request, user action), KHÔNG phải timer.

Cho các case này, Supplier không phù hợp. Cần **producer on-demand** = **`StreamBridge`** (sẽ học ở bài 3).

> Spoiler: `StreamBridge` cho phép gọi `streamBridge.send("topic", payload)` từ **bất kỳ đâu** trong code (controller, service, event listener) — không cần poller.

## Use case thực tế hợp với Supplier: cron-style heartbeat

```java
@Bean
public Supplier<HealthHeartbeat> heartbeatProducer() {
    return () -> new HealthHeartbeat(
        Instant.now(),
        serviceName,
        getStatus()
    );
}
```

```yaml
spring:
  cloud:
    function:
      definition: heartbeatProducer
    stream:
      bindings:
        heartbeatProducer-out-0:
          destination: service-heartbeats
      poller:
        fixed-delay: 30000          # 30 giây 1 lần
```

Monitoring service consume topic này → biết được tất cả service nào đang alive.

## Best practices

| Best practice | Lý do |
|---|---|
| KHÔNG dùng Supplier cho business event | Pattern không khớp (periodic vs on-demand) → dùng StreamBridge |
| Counter chỉ dùng cho demo, không cho production | Producer thực phải lấy data từ external source (DB, queue, API) |
| `AtomicInteger` cho counter | Thread-safe (poller có thể chạy multi-thread) |
| Explicit `poller.fixed-delay` trong YAML | Đọc code thấy ngay polling rate, không phải đoán default |
| Đặt tên bean theo purpose | `orderEventProducer`, `heartbeatProducer` (rõ ý nghĩa) |

## Anti-pattern

| Anti-pattern | Vấn đề | Sửa |
|---|---|---|
| Supplier có state phức tạp | Khó quản lý state trong lambda, dễ bug | Dùng StreamBridge gọi từ service |
| Operation tốn thời gian dài trong supplier | Block thread của poller, miss event tiếp theo | Async qua thread riêng hoặc queue |
| Counter dùng `int` thay vì `AtomicLong` | Có thể overflow nếu app chạy lâu | Dùng `AtomicLong` |
| Quên `initial-delay` | Producer flood ngay khi app start, consumer chưa kịp ready | Set `initial-delay: 5000` (5 giây) |

## Visualization

```text
Producer App (JVM 1)
+──────────────────────────────────────+
│ SCS framework                         │
│  poller thread (every 1000ms)         │
│        │                              │
│        ▼                              │
│  Supplier<String> producer()          │
│        │ return "message-1"           │
│        ▼                              │
│  KafkaProducer.send("demo-topic", ...) │
+──────────────────────────────────────+
                 │
                 │ TCP
                 ▼
+──────────────────────────────────────+
│ Kafka broker                          │
│  Topic "demo-topic"                   │
│  +─+─+─+─+─+─+─+                      │
│  │1│2│3│4│5│6│7│ ← messages           │
│  +─+─+─+─+─+─+─+                      │
+──────────────────────────────────────+
                 │
                 │ pull
                 ▼
+──────────────────────────────────────+
│ Consumer App (JVM 2)                  │
│  KafkaConsumer.poll() → batch         │
│        │                              │
│        ▼                              │
│  Consumer<String> consumer()          │
│        │ log "received: message-N"    │
+──────────────────────────────────────+
```

## Tóm tắt bài 1

- Producer SCS dùng bean kiểu **`Supplier<T>`** → SCS chạy **periodic poll** qua poller thread.
- Pseudocode internal: `while (running) { msg = supplier.get(); send(msg); sleep(delay); }`.
- Polling interval mặc định = **1000ms (1 giây)**. Tune qua `poller.fixed-delay`.
- Code skeleton tối thiểu: 1 `@Configuration` + 1 `@Bean Supplier<T>` + counter (in-memory cho demo).
- YAML cần 3 setting: `function.definition` + `bindings.{bean}-out-0.destination` + `poller.fixed-delay`.
- Demo chạy producer + consumer như 2 process riêng: tạo 2 inner class `@SpringBootApplication` + `@ComponentScan` scope vào package riêng.
- Supplier hợp cho **event periodic** (heartbeat, emit metric, trigger batch). KHÔNG hợp cho business event on-demand.
- Business event → dùng **`StreamBridge`** (bài 3 sẽ học).

**Bài kế tiếp** → [Bài 2: Message attributes + key serialization](02-message-builder-keys-serialization.md)
