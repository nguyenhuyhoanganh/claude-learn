# Bài 3: Consumer đầu tiên + auto-offset-reset + group name

Đến lúc viết consumer Java thật. Bài này: viết **3 dòng code** cho consumer đầu tiên, chạy + quan sát, rồi config 2 property quan trọng nhất:

1. **`auto-offset-reset`** (tương đương `--from-beginning` ở CLI).
2. **`group name`** (tên consumer group).

## Code consumer #1

### Cấu trúc package

```text
src/main/java/com/calmvinsguru/playground/section01_consumer/
├── Section01Runner.java
└── consumer/
    └── ConsumerConfig.java
```

Convention: tách subpackage `consumer/`, `producer/`, `processor/`, `dto/` cho clean. Xuyên suốt các section sau, pattern này lặp lại.

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

3 dòng cốt lõi. Đây là **toàn bộ consumer application**.

Phân tích:
- `@Configuration` — class chứa Spring config.
- `@Bean` — expose Java `Consumer<String>` bean.
- Bean name **mặc định = method name** = `"consumer"`.
- Lambda `message -> log.info(...)` = body xử lý mỗi message.

Spring Cloud Stream (SCS) làm gì phía sau:
- Scan thấy bean kiểu `Consumer<T>` → nhận ra "đây là consumer."
- Wire bean với Kafka topic theo binding config trong YAML.
- Khi message đến → deserialize từ bytes → gọi `accept(message)`.

**KHÔNG có `KafkaConsumer`**, không có poll loop, không có offset management trong code. SCS handle hết.

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

3 setting tối thiểu:
- `function.definition: consumer` — list bean names mà SCS phải activate.
- `bindings.consumer-in-0.destination: demo-topic` — map binding name (auto-derived từ bean name) → Kafka topic name.
- Bootstrap server lấy default `localhost:9092` (SCS Kafka binder default).

## Chạy + quan sát

### Bước 1: Fresh Kafka container

```bash
docker compose down && docker compose up -d
docker exec -it kafka bash
cd /opt/kafka/bin
./kafka-topics.sh --bootstrap-server localhost:9092 --list
# (rỗng — chưa có topic nào)
```

### Bước 2: Chạy Section01Runner

IDE run config:
```text
Program arguments: --section=section01 --config=01-simple-consumer.yaml
```

Console output (rút gọn):

```text
Started Section01Runner in 3.2 seconds
[Consumer clientId=consumer-anonymous.xxx, groupId=anonymous.xxx]
  Successfully joined group with generation Generation{...}
[Consumer ...] Adding newly assigned partitions: demo-topic-0
[Consumer ...] Setting offset for partition demo-topic-0 to the committed offset FetchPosition{...}
```

Quan sát 3 điểm:
1. ✅ Topic `demo-topic` **tự được tạo** (default Kafka dev mode).
2. ✅ Consumer được assign partition 0 của `demo-topic`.
3. ⚠️ Group name: `anonymous.xxx` (UUID random). Giống y hệt lúc CLI không chỉ định `--group`.

### Bước 3: Kiểm tra topic đã tạo

```bash
./kafka-topics.sh --bootstrap-server localhost:9092 --list
# __consumer_offsets        ← internal topic của Kafka
# demo-topic                 ← topic vừa được auto-create
```

Topic xuất hiện. SCS đã trigger Kafka tạo topic.

> **Lưu ý production**: property `auto.create.topics.enable` thường set `false` ở production. Lý do: nếu code typo topic name (vd `oder-events` thay vì `order-events`) → broker auto-create topic ma "oder-events", producer publish vào đó mà không ai consume → silent bug. Dev/Docker mặc định `true` cho tiện.

### Bước 4: Produce vài message để test

Mở terminal mới:
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

Log của Spring app:

```text
received: 1
received: 2
received: 3
received: 4
received: 5
```

Consumer chạy đúng. Xong.

## Vấn đề: restart app → không thấy message cũ

Stop Section01Runner. Restart.

Producer đã có history: 5 message (1-5).

App log sau khi restart:
```text
[Consumer ...] Setting offset to the latest offset
(không có dòng "received: 1" ... etc)
```

Vì sao? Quay lại lý thuyết Phase 3:
- **Anonymous group** → mỗi restart = **group hoàn toàn mới** (UUID random khác).
- New group + KHÔNG `--from-beginning` (default behavior của Kafka) → bắt đầu đọc từ **latest LEO** (Log End Offset = offset tiếp theo Kafka sẽ ghi vào) → bỏ qua mọi message cũ.

Sửa: cần config 2 thứ — **`auto-offset-reset`** + **`group` name cố định**.

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
                auto.offset.reset: earliest    # ← QUAN TRỌNG
      bindings:
        consumer-in-0:
          destination: demo-topic
```

3 giá trị có thể set:

| Value | Ý nghĩa |
|---|---|
| `earliest` | Bắt đầu từ offset 0 (tương đương `--from-beginning` CLI) |
| `latest` (default) | Bắt đầu từ LEO (chỉ thấy message mới) |
| `none` | Throw exception nếu không có offset đã commit cho group |

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

✅ Đọc lại từ đầu mỗi lần restart (vì anonymous group bị reset mỗi lần restart, nên Kafka coi như group mới và áp dụng `earliest`).

### ⚠️ `auto.offset.reset` chỉ có hiệu lực LẦN ĐẦU group join

Recap từ Phase 3 bài 8: **ledger nội bộ của Kafka là source of truth** (nguồn sự thật).

```text
Lần 1: group mới join.
  - Ledger trống cho group này → check auto.offset.reset.
  - earliest → bắt đầu offset 0.
  - latest → bắt đầu offset LEO (cuối cùng).
  - Sau đó ghi vào ledger.

Lần 2+: same group rejoins.
  - Ledger đã có entry cho group này → resume từ committed offset.
  - auto.offset.reset BỊ IGNORED hoàn toàn.
```

→ Trong demo trên, anonymous group **mỗi lần = NEW group** (UUID khác) → `earliest` activate mỗi lần restart → đọc lại.

Nếu group có name cố định → chỉ lần đầu earliest activate, sau đó committed offset wins.

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
          group: demo-group              # ← QUAN TRỌNG: tên cố định
```

Chạy:
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

### Test: restart app với group cố định

Stop. Restart.

```text
[Consumer ...] groupId=demo-group
Adding newly assigned partitions: demo-topic-0
Setting offset for partition demo-topic-0 to FetchPosition{offset=5, ...}   ← Resume!
```

**KHÔNG có dòng `received` cũ**. Vì sao? Ledger đã có entry cho `demo-group` (offset 5). Resume từ offset 5 (message tiếp theo chưa consume).

Producer gửi thêm:
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

✅ Pick up message mới từ offset 5 trở đi. Không replay cũ.

### Verify ledger qua CLI

```bash
./kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group demo-group

# Output:
# GROUP        TOPIC        PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG
# demo-group   demo-topic   0          8               8               0
```

Current offset = 8 = LEO. Lag = 0. Consumer đã catch up đến message mới nhất.

### Restart và produce → chỉ nhận message MỚI

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

✅ Resume từ chỗ dừng. **KHÔNG replay** 1-8.

## Tổng kết 3 scenario

```text
SCENARIO A: anonymous group, latest (default Kafka)
  Producer publish: 1 2 3 4 5
  Start consumer → group anonymous-aaa → start at LEO=5 → KHÔNG nhận gì
  Stop. Producer publish: 6
  Restart → group anonymous-bbb (UUID khác) → start at LEO=6 → KHÔNG nhận gì
  Producer publish: 7
  → received: 7 (chỉ message mới sau khi start)

SCENARIO B: anonymous group + earliest
  Producer publish: 1 2 3 4 5
  Start consumer → group anonymous-ccc → earliest → received: 1 2 3 4 5
  Stop.
  Restart → group anonymous-ddd (UUID khác) → earliest → received: 1 2 3 4 5 (re-process!)
  → MỖI LẦN restart replay từ đầu — duplicate processing!

SCENARIO C: fixed group + earliest
  Producer publish: 1 2 3 4 5
  Start consumer → group demo-group → first join → earliest → received: 1-5
  Ledger ghi: demo-group offset 5.
  Stop.
  Restart → group demo-group → ledger có entry → resume offset 5 → KHÔNG replay
  Producer publish: 6
  → received: 6
```

**Scenario C** = production pattern chuẩn. Anonymous group chỉ dùng cho debug nhanh.

## Lưu ý về tên bean

Method name = bean name = một phần của binding name.

```java
@Bean
public Consumer<String> consumer() { ... }
// → bean name = "consumer"
// → binding name = "consumer-in-0"

@Bean
public Consumer<String> paymentEventHandler() { ... }
// → bean name = "paymentEventHandler"
// → binding name = "paymentEventHandler-in-0"
```

Đổi method name → đổi binding name → YAML cũng phải update theo. **Cẩn thận khi rename**.

Override bean name bằng cách truyền vào `@Bean`:

```java
@Bean("customName")
public Consumer<String> someMethod() { ... }
// → bean name = "customName"
// → binding name = "customName-in-0"
```

## Best practices từ bài này

| Best practice | Lý do |
|---|---|
| Luôn set `group:` cố định trong YAML | Tránh anonymous, đảm bảo resume sau restart |
| Production dùng `auto.offset.reset: latest` | Consumer mới deploy không vô tình replay history cũ |
| `earliest` chỉ dùng cho backfill / dev | Replay tốn resource trong production |
| Set `brokers:` explicit thay vì rely default | Visibility — đọc code thấy ngay broker nào |
| Method name = bean name → chọn tên có ý nghĩa | `paymentEventConsumer` thay vì `consumer` |
| Convention naming group: `service-env` | `payment-service-prod`, `payment-service-staging` |

## Anti-patterns

| Anti-pattern | Vấn đề | Sửa |
|---|---|---|
| Anonymous group ở production | Mất offset mỗi restart, duplicate processing | Set `group:` cố định |
| `auto.offset.reset: earliest` ở production | Consumer mới deploy replay toàn bộ history → spike load | `latest` default, chỉ `earliest` cho specific use case |
| Quên `function.definition` | SCS không discover bean, silent no-op | Luôn list bean names |
| Sai naming convention binding (`consumer_in_0`) | SCS không match | Đúng format `consumer-in-0` (kebab-case dash) |
| Hardcode topic name trong code | Mất flexibility config | Luôn qua `destination:` YAML |

## Tóm tắt bài 3

- **Consumer đầu tiên**: 3 dòng code với `@Bean public Consumer<String>`.
- SCS auto-wire bean với Kafka topic qua binding name `{beanName}-in-0`.
- App start → topic được auto-create (`auto.create.topics.enable=true` mặc định ở dev).
- **Không có group name** → anonymous group per restart → reset offset mỗi lần restart.
- **`auto.offset.reset`**:
  - `earliest` (bắt đầu từ offset 0).
  - `latest` (default, bắt đầu từ LEO).
  - `none` (throw error nếu không có offset đã commit).
- Property này chỉ effective **lần đầu group join** (khi ledger trống). Sau đó committed offset trong ledger wins.
- **`group:` cố định** → fixed consumer group → resume từ committed offset qua mỗi lần restart.
- **Production pattern**: fixed group + `latest` auto-offset-reset (hoặc `earliest` chỉ cho backfill).
- Bean name = method name (default). Override qua `@Bean("name")`.

**Bài kế tiếp** → [Bài 4: Consume từ nhiều topic + best practices](04-multi-topic-consumption.md)
