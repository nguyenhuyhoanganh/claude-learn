# Bài 2: Manual Acknowledgement + Negative Acknowledgement (NACK)

Bài trước: SCS framework tự ack mỗi batch. Đây là cách dùng cho 95% case production — giống như Spring Data JPA tự commit DB transaction, ta không can thiệp.

Đôi khi cần **kiểm soát chi tiết** việc ack: "tôi muốn quyết định khi nào ack." Spring cung cấp **Manual Acknowledgement mode**.

Bài này: setup manual ack, demo các scenario, và **NACK** — negative acknowledgement để retry.

## So sánh: Manual ack giống commit transaction trong JPA

```text
Spring Data JPA mặc định:
  repository.save(entity);
  // → framework auto-commit transaction (qua @Transactional)
  // → developer không gọi commit() thủ công

Manual JPA transaction:
  @Autowired TransactionTemplate txTemplate;
  txTemplate.execute(status -> {
      repository.save(entity);
      // → developer kiểm soát commit/rollback
  });
```

SCS acknowledgement tương tự:
- **Auto-ack mode** (default): SCS tự commit offset sau mỗi batch xử lý xong.
- **Manual ack mode**: code app tự gọi `acknowledgement.acknowledge()`.

## Cách kích hoạt manual mode

3 thay đổi cần làm:

### 1. Bean signature: nhận `Message<T>` thay vì `T`

Vì `Acknowledgement` object được Spring gắn vào **header của Message**. Nếu bean nhận `T` trực tiếp → không có cách access acknowledgement.

```java
// AUTO mode (mặc định)
@Bean
public Consumer<OrderEvent> consumer() {
    return order -> processOrder(order);
}

// MANUAL mode — phải đổi sang Message<T>
@Bean
public Consumer<Message<OrderEvent>> consumer() {
    return msg -> handleMessage(msg);
}
```

### 2. Lấy `Acknowledgement` object từ header

```java
private void handleMessage(Message<OrderEvent> msg) {
    Acknowledgment ack = msg.getHeaders().get(
        KafkaHeaders.ACKNOWLEDGMENT, 
        Acknowledgment.class
    );
    
    if (ack == null) {
        throw new IllegalStateException("Acknowledgement header not present — chưa enable manual mode?");
    }
    
    // process + ack hoặc nack
}
```

**Lưu ý**: `Acknowledgement` chỉ có trong header khi binding được config manual mode. Nếu vẫn ở auto mode → ack object = null. Vì vậy phải null-check.

### 3. YAML: enable manual mode

```yaml
spring:
  cloud:
    stream:
      kafka:
        bindings:
          consumer-in-0:
            consumer:
              ack-mode: MANUAL           # ← KEY
      bindings:
        consumer-in-0:
          destination: demo-topic
          group: demo-group
```

> **Lưu ý**: `ack-mode` KHÔNG phải Kafka consumer property. Đây là **feature của SCS Kafka binder ở level binding**. Phải đặt dưới `spring.cloud.stream.kafka.bindings.{name}.consumer.ack-mode`.

## 2 manual mode: MANUAL vs MANUAL_IMMEDIATE

```yaml
ack-mode: MANUAL              # ack được Spring tích luỹ + commit theo batch
ack-mode: MANUAL_IMMEDIATE     # ack được commit về Kafka NGAY LẬP TỨC
```

### MANUAL — efficient, default cho manual mode

```text
Consumer xử lý batch 100 message:
  msg-1 → ack
  msg-2 → ack
  msg-3 → ack
  ...
  msg-100 → ack

Spring track 100 ack đó, không gọi Kafka từng cái.
Cuối batch → 1 network call commit offset 100.
```

Lý do: commit offset = network call. 100 commit = tốn. SCS tối ưu bằng cách gom.

### MANUAL_IMMEDIATE — mỗi ack = 1 network call ngay

```text
Consumer xử lý batch 100 message:
  msg-1 → ack → COMMIT NGAY về Kafka (network call)
  msg-2 → ack → COMMIT NGAY (network call)
  ...
  msg-100 → ack → COMMIT NGAY (network call)
  
→ 100 network call.
```

Trade-off:
- ✓ Reliability tốt nhất (nếu crash giữa batch → ít rủi ro mất ack đã commit).
- ✗ Throughput thấp (100× network call).

Use case: cực kỳ critical (financial), accept performance overhead.

Default cho hầu hết case: `MANUAL` (đủ tốt + hiệu quả).

## Code đầy đủ cho consumer manual mode

```java
@Configuration
public class ConsumerConfig {

    private static final Logger log = LoggerFactory.getLogger(ConsumerConfig.class);

    @Bean
    public Consumer<Message<String>> consumer() {
        return this::handleMessage;
    }

    private void handleMessage(Message<String> msg) {
        log.info("Received: {}", msg);
        
        Acknowledgment ack = msg.getHeaders().get(
            KafkaHeaders.ACKNOWLEDGMENT, 
            Acknowledgment.class
        );
        
        if (ack == null) {
            throw new IllegalStateException("Acknowledgement is null");
        }
        
        String payload = msg.getPayload();
        
        // Demo: logic xử lý + ack/nack theo payload
        switch (payload) {
            case "1":
            case "2":
            case "3":
                // success case → ack
                processSuccessfully(payload);
                ack.acknowledge();
                log.info("Acknowledged: {}", payload);
                break;
            
            case "4":
            case "5":
            case "6":
                // intentionally KHÔNG ack
                // → broker không advance offset → restart sẽ redeliver
                log.warn("Intentionally NOT acknowledging: {}", payload);
                break;
            
            case "7":
                // simulate temporary failure → NACK với retry 5s
                int random = ThreadLocalRandom.current().nextInt(1, 11);  // 1-10
                if (random > 8) {
                    log.info("Random {} > 8 → success", random);
                    ack.acknowledge();
                } else {
                    log.warn("Random {} → temporary failure, retry after 5s", random);
                    ack.nack(Duration.ofSeconds(5));
                }
                break;
            
            default:
                ack.acknowledge();
        }
    }

    private void processSuccessfully(String payload) {
        // business logic
    }
}
```

YAML:

```yaml
# section15/01-consumer.yaml
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
              ack-mode: MANUAL
              configuration:
                auto.offset.reset: earliest
      bindings:
        consumer-in-0:
          destination: demo-topic
          group: demo-group
```

## NACK — Negative Acknowledgement

`ack.nack(Duration)` — báo cho Spring: "message này tôi xử lý KHÔNG được, retry sau X giây."

```java
try {
    processPayment(order);
    ack.acknowledge();
} catch (TemporaryException e) {
    log.warn("Temporary failure, will retry", e);
    ack.nack(Duration.ofSeconds(5));
} catch (PermanentException e) {
    log.error("Permanent failure, skip", e);
    ack.acknowledge();   // ack để skip (move on)
    // Hoặc gửi sang DLQ (Phase 13)
}
```

### NACK behavior

- Khi NACK → Spring **không commit offset** cho message này.
- Sau khoảng `Duration` chỉ định → Spring **gọi lại handler** với cùng message.
- Cứ lặp lại cho đến khi `acknowledge()` (success) hoặc retry limit (config khác).

> **Lưu ý**: NACK **không phải Kafka concept**. Đây là **feature của Spring framework**. Kafka không có "negative acknowledgement" — chỉ có "no acknowledgement = redeliver."
> 
> Spring implement NACK bằng cách: tạm dừng partition, đợi delay, rồi resume + redeliver từ offset chưa ack.

### Use case của NACK

| Scenario | Dùng NACK? |
|---|---|
| Network timeout gọi service ngoài (DB, HTTP) | ✓ NACK + retry sau X giây |
| Rate limit từ 3rd party API | ✓ NACK + retry sau khi cooldown |
| Resource tạm hết (DB connection pool exhausted) | ✓ NACK |
| Message format sai (schema mismatch) | ✗ ACK + log + skip (retry vô ích) |
| Business logic exception (vd: validation fail) | ✗ ACK + skip hoặc gửi DLQ |
| Bug trong code | ✗ ACK + log + alert (Phase 13 sẽ học DLQ) |

Rule: NACK chỉ cho lỗi **tạm thời** có thể recover. Lỗi vĩnh viễn → ACK + skip (tránh infinite retry loop).

Phase 13 sẽ học error handling toàn diện (Dead Letter Queue, retry topic, classifier).

## Demo

### Setup

```bash
docker compose down && docker compose up -d
docker exec -it kafka bash
cd /opt/kafka/bin
```

Mở 2 terminal:
- **T1**: producer console.
- **T2**: chạy lệnh describe consumer group liên tục.

Khởi chạy app SCS (section 15 config).

### Test 1: send 1, 2, 3 — sẽ ack

```bash
# T1 (producer)
./kafka-console-producer.sh --bootstrap-server localhost:9092 --topic demo-topic
> 1
> 2
> 3
```

Log app:
```text
Received: 1
Acknowledged: 1
Received: 2
Acknowledged: 2
Received: 3
Acknowledged: 3
```

T2 describe:
```text
GROUP  TOPIC        PARTITION  CURRENT  LEO  LAG
demo   demo-topic   0          3        3    0
```

✅ Offset advance, lag = 0.

### Test 2: send 4, 5, 6 — KHÔNG ack

```bash
# T1
> 4
> 5
> 6
```

Log app:
```text
Received: 4
Intentionally NOT acknowledging: 4
Received: 5
Intentionally NOT acknowledging: 5
Received: 6
Intentionally NOT acknowledging: 6
```

T2 describe:
```text
GROUP  TOPIC        PARTITION  CURRENT  LEO  LAG
demo   demo-topic   0          3        6    3   ← lag = 3!
```

⚠️ Message đã delivered nhưng offset KHÔNG advance. Lag = 3.

### Test 3: restart app → 4, 5, 6 được redeliver

Stop + start app.

Log:
```text
Received: 4   ← redeliver!
Intentionally NOT acknowledging: 4
Received: 5
Intentionally NOT acknowledging: 5
Received: 6
Intentionally NOT acknowledging: 6
```

✅ Kafka redeliver vì offset chưa advance.

### Test 4: send 1 lần nữa → ack offset 7

```bash
# T1
> 1
```

Log:
```text
Received: 1
Acknowledged: 1
```

T2 describe:
```text
GROUP  TOPIC        PARTITION  CURRENT  LEO  LAG
demo   demo-topic   0          7        7    0   ← lag = 0!
```

⚠️ Ack 1 message **mới** (offset 6, payload "1") → Kafka assume **mọi offset trước đó (4, 5, 6) cũng đã xử lý**. Lag = 0.

→ Khẳng định lại quy tắc bài 1: **ack offset N = đã xử lý đến và bao gồm offset N**.

Trong production: scenario này nghĩa là 4, 5, 6 bị **skip silently**. Vì vậy phải cẩn thận khi quyết định không ack — phải có kế hoạch retry hoặc DLQ rõ ràng.

### Test 5: NACK demo với payload "7"

```bash
# T1
> 7
```

Log (random 1-10, > 8 → ack, else → NACK + retry 5s):

```text
Received: 7
Random 6 → temporary failure, retry after 5s
(đợi 5 giây)
Received: 7   ← retry!
Random 4 → temporary failure, retry after 5s
(đợi 5 giây)
Received: 7   ← retry!
Random 9 → success
Acknowledged: 7
```

✅ NACK retry hoạt động. Mỗi 5 giây Spring redeliver cho đến khi ack thành công.

T2 describe trong lúc NACK loop:
```text
GROUP  TOPIC  PARTITION  CURRENT  LEO  LAG
demo   ...    0          7        8    1     ← lag = 1 (msg-7 chưa ack)
```

Sau khi ack thành công → lag về 0.

## Tóm tắt bài 2

- **Manual ack mode** = code app tự quyết định khi nào commit offset, thay vì SCS auto.
- 3 bước kích hoạt: (a) bean nhận `Message<T>`, (b) lấy `Acknowledgment` từ header, (c) YAML set `ack-mode: MANUAL`.
- 2 mode:
  - `MANUAL`: Spring gom ack + commit theo batch (efficient).
  - `MANUAL_IMMEDIATE`: mỗi ack = 1 network call ngay (reliable, slow).
- `ack-mode` là feature của **SCS Kafka binder**, không phải Kafka consumer property. Đặt dưới `spring.cloud.stream.kafka.bindings.{name}.consumer.ack-mode`.
- **NACK** (`ack.nack(Duration)`): báo "xử lý fail tạm thời, retry sau X giây". KHÔNG phải Kafka concept — Spring implement nó.
- NACK chỉ cho **lỗi tạm thời** có thể recover. Lỗi vĩnh viễn → ack + skip hoặc DLQ.
- Quy tắc nhớ: **ack offset N = đã xử lý đến và bao gồm offset N** (mọi offset nhỏ hơn coi như ack ngầm).
- Không ack → offset không advance → restart sẽ redeliver. Có thể dẫn tới **duplicate processing**.

**Bài kế tiếp** → [Bài 3: Manual acknowledgement trong batch mode + Phase 12 summary](03-batch-ack-summary.md)
