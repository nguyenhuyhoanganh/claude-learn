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

### Common poller config

```yaml
poller:
  fixed-delay: 1000          # default
  # OR
  cron: "*/5 * * * * *"      # cron expression alternative
  initial-delay: 0
  max-messages-per-poll: 1   # how many to get per poll cycle
```

## Limitation: Supplier-based producer

Suppliers polling = **periodic generation**. Use case rare ngoài demo:

- Heartbeat events (1 msg/min, "system alive").
- Periodic metrics emit (CPU, memory every 30s).
- Scheduled batch trigger.

Real business events thường KHÔNG periodic:
- User places order → event.
- Payment received → event.
- Click happens → event.

→ Trigger = **external action**, không phải timer.

Polling supplier không fit. Cần **on-demand producer** = **StreamBridge** (bài sau).

> Sneak peek: `StreamBridge` cho phép gọi `streamBridge.send("topic", payload)` từ **anywhere** (controller, service, listener) — no poller.

## Real-world: cron-style supplier

Use case good cho supplier:

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
        fixed-delay: 30000          # every 30 seconds
```

Monitoring service consume → know all services alive.

## Best practices

| Practice | Why |
|---|---|
| Don't use Supplier for business events | Doesn't fit periodic pattern → StreamBridge |
| Counter for demo, not production | Real producer gets data from external source |
| `AtomicInteger` cho counter | Thread-safe (poller may multi-thread) |
| Explicit `poller.fixed-delay` | Visibility, even at default 1000ms |
| Bean name encodes purpose | `orderEventProducer`, `heartbeatProducer` |

## Anti-patterns

| Anti-pattern | Problem | Fix |
|---|---|---|
| Supplier với complex business state | Hard to manage state in lambda | Use StreamBridge from service |
| Long-running operation trong supplier | Blocks poller thread, miss events | Async via separate thread / queue |
| Counter overflow rủi ro (`int`) | Eventual restart needed | Use `AtomicLong` |
| Forget `initial-delay` causing startup spam | Producer floods before consumer ready | `initial-delay: 5000` |

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

- Producer SCS = `Supplier<T>` bean → SCS **periodic poll** via poller thread.
- Pseudocode internal: `while (running) { msg = supplier.get(); send(msg); sleep(delay); }`.
- Default poll interval: `1000ms`. Tune via `poller.fixed-delay`.
- Code skeleton: 1 `@Configuration` + 1 `@Bean Supplier<T>` + counter (in-memory).
- YAML: `function.definition` + `bindings.producer-out-0.destination` + `poller.fixed-delay`.
- 2 runners trong 1 project: separate `@SpringBootApplication` + `@ComponentScan` to scope.
- Supplier hợp cho **periodic events** (heartbeat, metrics, batch trigger). Không hợp business events on-demand.
- Business events → **StreamBridge** (bài sau).

**Bài kế tiếp** → [Bài 2: Message attributes + key serialization](02-message-attributes-keys.md)
