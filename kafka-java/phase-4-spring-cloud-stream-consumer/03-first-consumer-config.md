# Bài 3: First Functional Consumer + auto-offset-reset + group name

Đến lúc viết consumer Java thật. Bài này: code **3 dòng** cho consumer đầu tiên, run + observe, rồi config 2 properties quan trọng nhất: **auto-offset-reset** (= `--from-beginning` CLI) và **group name**.

## Code consumer #1

### Package layout

```text
src/main/java/com/calmvinsguru/playground/section01_consumer/
├── Section01Runner.java
└── consumer/
    └── ConsumerConfig.java
```

Convention: tách `consumer/`, `producer/`, `processor/`, `dto/` subpackages cho clean.

### ConsumerConfig.java

```java
package com.calmvinsguru.playground.section01_consumer.consumer;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import java.util.function.Consumer;

@Configuration
public class ConsumerConfig {

    private static final Logger log = LoggerFactory.getLogger(ConsumerConfig.class);

    @Bean
    public Consumer<String> consumer() {
        return message -> log.info("received: {}", message);
    }
}
```

3 lines core. Đó là **toàn bộ consumer application**.

Breakdown:
- `@Configuration` → Spring config class.
- `@Bean public Consumer<String> consumer()` → expose Java `Consumer<String>` bean.
- Bean name **mặc định = method name** = `"consumer"`.
- Lambda `message -> log.info(...)` = body.

SCS:
- Scan beans `Consumer<T>` → "đây là consumer."
- Wire bean tới Kafka topic theo binding config.
- Khi message arrive → deserialize → call `accept(message)`.

KHÔNG có `KafkaConsumer`, không poll loop, không offset management. SCS handle hết.

## Config YAML #1 — simple consumer

```yaml
# src/main/resources/section01/01-simple-consumer.yaml
spring:
  cloud:
    function:
      definition: consumer
    stream:
      bindings:
        consumer-in-0:
          destination: demo-topic
```

3 settings:
- `function.definition: consumer` → bean name `consumer`.
- `bindings.consumer-in-0.destination: demo-topic` → Kafka topic.
- Bootstrap server default `localhost:9092` (SCS Kafka binder default).

## Run + observe

### Step 1: Fresh Kafka

```bash
docker compose down && docker compose up -d
docker exec -it kafka bash
cd /opt/kafka/bin
./kafka-topics.sh --bootstrap-server localhost:9092 --list
# (empty)
```

### Step 2: Run Section01Runner

IDE run config:
```text
Program arguments: --section=section01 --config=01-simple-consumer.yaml
```

Console output:

```text
Started Section01Runner in 3.2 seconds
[Consumer clientId=consumer-anonymous.xxx, groupId=anonymous.xxx] 
  Successfully joined group with generation Generation{...}
[Consumer ...] Adding newly assigned partitions: demo-topic-0
[Consumer ...] Setting offset for partition demo-topic-0 to the committed offset FetchPosition{...}
```

Observations:
1. ✅ Topic `demo-topic` **auto-created** (default behavior of Kafka in dev mode).
2. ✅ Consumer assigned to partition 0 of `demo-topic`.
3. ⚠️ Group name: `anonymous.xxx` (random UUID). Same as no `--group` ở CLI.

### Step 3: Verify topic created

```bash
./kafka-topics.sh --bootstrap-server localhost:9092 --list
# __consumer_offsets
# demo-topic
```

Topic xuất hiện. SCS triggered Kafka auto-create.

> **Production note**: `auto.create.topics.enable` thường set `false` ở production (vd typo gửi sai topic name → tạo topic ma). Dev/Docker default `true`.

### Step 4: Produce messages

Terminal mới:
```bash
docker exec -it kafka bash
cd /opt/kafka/bin
./kafka-console-producer.sh --bootstrap-server localhost:9092 --topic demo-topic
> 1
> 2
> 3
> 4
> 5
```

Spring app log:

```text
received: 1
received: 2
received: 3
received: 4
received: 5
```

Consumer working. Done.

## Problem: restart app → not see old messages

Stop Section01Runner. Restart.

Producer history: 5 messages (1-5).

App log:
```text
[Consumer ...] Setting offset to the latest offset
(no "received: 1" ... etc)
```

Why? Bài Phase 3:
- Anonymous group → **mỗi restart = new group**.
- New group + no `--from-beginning` (default behavior) → start from latest LEO → skip old messages.

Sửa: config `auto-offset-reset` + `group`.

## Property 1: auto-offset-reset

SCS Kafka binder dùng raw Kafka consumer property `auto.offset.reset`.

```yaml
# section01/02-from-beginning.yaml
spring:
  cloud:
    function:
      definition: consumer
    stream:
      kafka:
        binder:
          brokers: localhost:9092          # explicit (best practice)
        bindings:
          consumer-in-0:
            consumer:
              configuration:
                auto.offset.reset: earliest    # ← KEY
      bindings:
        consumer-in-0:
          destination: demo-topic
```

Values:
- `earliest` = bắt đầu từ offset 0 (= CLI `--from-beginning`).
- `latest` (default) = bắt đầu từ LEO.
- `none` = throw exception if no offset committed for group.

Re-run với config này:
```text
--section=section01 --config=02-from-beginning.yaml
```

Output:
```text
[Consumer ...] auto.offset.reset = earliest
received: 1
received: 2
received: 3
received: 4
received: 5
```

✅ Đọc lại từ đầu mỗi restart (vì anonymous group reset mỗi lần).

### ⚠️ `auto.offset.reset` chỉ effective LẦN ĐẦU group join

Recap từ Phase 3 bài 8: **ledger là source of truth**.

```text
Lần 1: new group joins.
  - Ledger empty → check auto.offset.reset.
  - earliest → start at 0.
  - latest → start at LEO.
  - Then write to ledger.

Lần 2+: same group rejoins.
  - Ledger has entry → resume from committed offset.
  - auto.offset.reset IGNORED.
```

→ Trong demo trên, anonymous group **mỗi lần = NEW group** → `earliest` activate mỗi restart → đọc lại.

Nếu group fixed name → chỉ lần đầu earliest, sau đó committed offset wins.

## Property 2: Consumer group name

```yaml
# section01/03-consumer-group.yaml
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
          group: demo-group              # ← KEY
```

Run:
```text
--section=section01 --config=03-consumer-group.yaml
```

App log:
```text
[Consumer clientId=..., groupId=demo-group]  ← group fixed!
Successfully joined group with generation Generation{generationId=1}
Adding newly assigned partitions: demo-topic-0
Setting offset for partition demo-topic-0 to FetchPosition{offset=0, ...}
received: 1
received: 2
received: 3
received: 4
received: 5
```

### Test: restart app

Stop. Restart.

```text
[Consumer ...] groupId=demo-group
Adding newly assigned partitions: demo-topic-0
Setting offset for partition demo-topic-0 to FetchPosition{offset=5, ...}   ← Resume!
```

KHÔNG `received` cũ. Vì sao? Ledger entry tồn tại cho `demo-group`. Resume từ offset 5 (next unconsumed).

Producer thêm:
```text
> 6
> 7
> 8
```

App log:
```text
received: 6
received: 7
received: 8
```

✅ Pick up new messages from offset 5.

### Verify ledger via CLI

```bash
./kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group demo-group

# Output:
# GROUP        TOPIC        PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG
# demo-group   demo-topic   0          8               8               0
```

Current = 8 = LEO. Lag 0. Caught up.

### Restart and produce → only get NEW messages

Stop app. Producer:
```text
> 9
> 10
```

Restart app:
```text
Setting offset for partition demo-topic-0 to FetchPosition{offset=8, ...}
received: 9
received: 10
```

✅ Resume from where left off. NOT replay 1-8.

## Tổng kết flow

```text
Scenario A: anonymous group, latest (default)
  Producer: 1 2 3 4 5
  Start consumer → group anonymous-aaa → start at LEO=5 → no received
  Stop. Producer: 6
  Restart → group anonymous-bbb → start at LEO=6 → no received
  Producer: 7
  → received: 7

Scenario B: anonymous group + earliest
  Producer: 1 2 3 4 5
  Start consumer → group anonymous-ccc → earliest → received: 1 2 3 4 5
  Stop.
  Restart → group anonymous-ddd → earliest → received: 1 2 3 4 5 (re-process!)

Scenario C: fixed group + earliest
  Producer: 1 2 3 4 5
  Start consumer → group demo-group → first join → earliest → received: 1-5
  Ledger: demo-group offset 5
  Stop.
  Restart → group demo-group → resume offset 5 → no replay
  Producer: 6
  → received: 6
```

**Scenario C** = production pattern. Anonymous = chỉ debug.

## Bean naming gotcha

Method name = bean name = part of binding name.

```java
@Bean
public Consumer<String> consumer() { ... }     // bean name "consumer"
                                                  // binding "consumer-in-0"

@Bean
public Consumer<String> paymentEventHandler() { ... }   // bean name "paymentEventHandler"
                                                          // binding "paymentEventHandler-in-0"
```

Đổi method name → đổi binding name. Cẩn thận khi rename.

Override bean name:

```java
@Bean("customName")
public Consumer<String> someMethod() { ... }    // bean name "customName"
                                                   // binding "customName-in-0"
```

## Best practices từ bài này

| Practice | Why |
|---|---|
| Always explicit `group:` | Avoid anonymous, ensure resume across restart |
| `auto.offset.reset: latest` default in prod | New consumers don't unexpectedly replay history |
| `earliest` chỉ cho new feature backfill / dev | Replay expensive in production |
| Explicit `brokers:` config | Visibility (vs implicit localhost) |
| Method names = bean names → choose meaningful | `paymentEventConsumer` not `consumer` |
| Naming convention `service-env` cho group | `payment-service-prod`, `payment-service-staging` |

## Tóm tắt bài 3

- **First consumer**: 3 lines code with `@Bean public Consumer<String>`.
- SCS auto-wire bean tới Kafka topic via binding name `{bean}-in-0`.
- App start → topic auto-created (`auto.create.topics.enable=true` default in dev).
- **No group name** → anonymous group per app instance → reset offset mỗi restart.
- **`auto.offset.reset`**: `earliest` (start 0), `latest` (default, start LEO), `none` (error if no offset).
- Effective **only when no committed offset for group** (first join). Sau đó committed offset wins.
- **`group:`** explicit → fixed consumer group → resume from committed offset across restart.
- **Production pattern**: fixed group + `latest` auto-offset-reset (or earliest only for backfill).
- Bean name = method name (default). Override via `@Bean("name")`.

**Bài kế tiếp** → [Bài 4: Consuming from multiple topics + best practices](04-multi-topic-consumption.md)
