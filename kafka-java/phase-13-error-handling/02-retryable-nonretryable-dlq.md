# Bài 2: Phân loại retryable vs non-retryable + Dead Letter Queue

Bài 1: Spring default retry **mọi exception**. Tốn thời gian cho lỗi vĩnh viễn.

Bài này: dạy cách **phân loại** exception nào nên retry, exception nào không. Sau đó setup **Dead Letter Queue (DLQ)** để xử lý message vĩnh viễn fail.

## Property kiểm soát exception classification

```yaml
spring:
  cloud:
    stream:
      bindings:
        consumer-in-0:
          consumer:
            max-attempts: 3
            back-off-initial-interval: 2000
            back-off-multiplier: 1.0
            default-retryable: true                # default behavior
            retryable-exceptions:                   # explicit mapping
              com.acme.InputValidationException: false
              com.acme.ServiceUnavailableException: true
```

### `default-retryable`

Hành vi mặc định khi exception **không có trong mapping**.

- `true` (default): retry mọi exception không liệt kê → an toàn (không miss case).
- `false`: chỉ retry exception explicitly mapped là `true` → strict (deny by default).

### `retryable-exceptions` — explicit mapping

Override behavior cho exception cụ thể bằng full class name:

```yaml
retryable-exceptions:
  com.acme.InputValidationException: false     # KHÔNG retry
  com.acme.ServiceUnavailableException: true   # retry
  com.acme.AuthorizationException: false
  org.springframework.dao.DataAccessException: true
```

Lưu ý:
- Class name phải **fully qualified** (có package).
- Spring kiểm tra qua `instanceof` → match cả subclass.

## Demo

YAML đầy đủ:

```yaml
# section16/03-retryable-exceptions.yaml
spring:
  cloud:
    stream:
      kafka:
        binder:
          brokers: localhost:9092
      bindings:
        consumer-in-0:
          destination: order-events
          group: order-service
          consumer:
            max-attempts: 3
            back-off-initial-interval: 2000
            back-off-multiplier: 1.0
            default-retryable: true
            retryable-exceptions:
              com.acme.exceptions.InputValidationException: false
              com.acme.exceptions.ServiceUnavailableException: true
```

### Test: send 0 (InputValidationException — không retry)

```bash
> 0
```

Log:
```text
T+0s: Received: 0 → InputValidationException
      → check classification: InputValidationException = false → SKIP RETRY
      → throw lên framework → commit offset (move on)
```

**1 attempt duy nhất, KHÔNG retry**. Trước đây bài 1 mất 15s × 4 attempts cho lỗi này. Giờ instant.

### Test: send 7 (50% chance ServiceUnavailableException — retry)

```bash
> 7
```

Log (case fail rồi success):
```text
T+0s: Received: 7 → ServiceUnavailableException
      → check: true → retry sau 2s
T+2s: Received: 7 → success (random luck)
      → ack
```

Hoặc case exhaust:
```text
T+0s: attempt 1 → fail
T+2s: attempt 2 → fail
T+4s: attempt 3 → fail
T+6s: attempt 4 → exhausted → commit + skip
```

## Vấn đề: exhausted attempt → message bị silent skip

Khi retry exhausted, message **bị skip vĩnh viễn**. Không có gì track lại message đó. **Mất data**.

Trong thực tế production, cần **lưu lại** message lỗi để:
- Manual review bởi dev/ops.
- Reprocess sau khi fix bug.
- Audit + compliance.

→ Solution: **Dead Letter Queue (DLQ)** topic riêng.

## Dead Letter Queue (DLQ)

> **DLQ** = topic Kafka riêng, nhận các message **không xử lý được** sau khi exhausted retry hoặc bị classify là non-retryable.

```text
Workflow:
  msg-100 vào order-events topic
     │
     ▼
  Consumer process → exception → retry 3 lần đều fail
     │
     ▼
  Spring auto: publish msg-100 + error details vào "order-events-dlq" topic
     │
     ▼
  Consumer commit offset của order-events → move on next message
     │
     ▼
  Sau đó: dev/ops inspect order-events-dlq để xử lý
```

### YAML enable DLQ

```yaml
# section16/04-dlq.yaml
spring:
  cloud:
    stream:
      kafka:
        bindings:
          consumer-in-0:
            consumer:
              enable-dlq: true                   # ← KEY
              dlq-name: order-events-dlq         # ← tên DLQ topic
      bindings:
        consumer-in-0:
          destination: order-events
          group: order-service
          consumer:
            max-attempts: 3
            back-off-initial-interval: 2000
            default-retryable: true
            retryable-exceptions:
              com.acme.exceptions.InputValidationException: false
              com.acme.exceptions.ServiceUnavailableException: true
```

2 property mới:
- `enable-dlq: true` — bật DLQ.
- `dlq-name: order-events-dlq` — tên topic DLQ. Convention: `{original-topic}-dlq`.

**Lưu ý**: 2 property này thuộc Kafka binder section (`spring.cloud.stream.kafka.bindings`), không phải generic SCS section.

### Behavior

```text
Khi consumer throw exception:
  1. Retry theo config (max-attempts, back-off, retryable-exceptions).
  2. Sau khi exhausted (hoặc non-retryable) → Spring tự động:
     a. Publish original message vào dlq-name topic.
     b. Add header chứa exception detail (class, message, stack trace).
     c. Commit offset original topic.
     d. Consumer move on next message.
```

**KHÔNG cần code thêm**. SCS handle hết qua config.

## Demo DLQ

Setup:
- T1: console producer cho `order-events`.
- T2: **console consumer cho `order-events-dlq`** để xem message lỗi:

```bash
./kafka-console-consumer.sh --bootstrap-server localhost:9092 \
  --topic order-events-dlq \
  --from-beginning \
  --property print.headers=true \
  --property print.key=true \
  --property print.value=true
```

`print.headers=true` để xem exception details Spring inject vào headers.

### Test: send -100 (InputValidationException, non-retryable)

```bash
# T1
> -100
```

App log:
```text
Received: -100 → InputValidationException
→ KHÔNG retry (config)
→ publish vào order-events-dlq
→ commit offset
```

T2 (DLQ consumer) sẽ thấy:
```text
key=null
value=-100

Headers:
  x-exception-fqcn: com.acme.exceptions.InputValidationException
  x-exception-message: Invalid order ID: -100
  x-exception-stacktrace: com.acme.exceptions.InputValidationException: ...
                          at com.acme.OrderService.saveOrder(OrderService.java:23)
                          at ...
  x-original-topic: order-events
  x-original-partition: 0
  x-original-offset: 47
  x-original-timestamp: 1717228800000
```

✅ Original message + full exception context được preserve.

### Test: send 7 nhiều lần để có case exhausted

```bash
> 7  → có thể fail liên tục (50% chance × 3 retry)
> 7
> 7
```

Nếu lucky: success ngay → không vào DLQ.
Nếu unlucky: 3 retry đều fail → vào DLQ.

T2 sẽ thấy thêm entry với exception là `ServiceUnavailableException`.

## Quan sát message structure trong DLQ

Headers Spring add tự động cho mỗi DLQ message:

| Header | Ý nghĩa |
|---|---|
| `x-exception-fqcn` | Full class name của exception |
| `x-exception-message` | Exception's `getMessage()` |
| `x-exception-stacktrace` | Full stack trace |
| `x-original-topic` | Topic gốc của message |
| `x-original-partition` | Partition gốc |
| `x-original-offset` | Offset trong partition gốc |
| `x-original-timestamp` | Timestamp gốc của message |

→ Đủ context để debug + reprocess.

## Workflow xử lý DLQ trong production

```text
Step 1: Operations team monitor DLQ topic (alerting nếu > threshold).
Step 2: Manual review message trong DLQ:
        - Là bug code? → fix code, deploy.
        - Là data corruption? → fix data manually trong DB nếu cần.
        - Là external service issue? → đợi service recover.
Step 3: Sau khi fix root cause → reprocess DLQ:
        - Option A: viết app riêng đọc DLQ topic, retry process lại.
        - Option B: dùng tool như Confluent Replicator hoặc Kafka MirrorMaker để re-publish vào topic gốc.
        - Option C: nếu data sai → discard (delete topic hoặc set retention thấp).
```

DLQ KHÔNG phải garbage bin. Phải có người chịu trách nhiệm review.

## Pattern: Tiered DLQ

Lớn hơn: tách DLQ thành nhiều tier theo loại lỗi:

```text
order-events
   │
   ├── retry x3 fail (transient error) → retry-topic (retry sau 5 phút)
   │       │
   │       └── lại fail → dlq-transient (manual review, có thể auto-replay)
   │
   └── non-retryable error (data sai) → dlq-permanent (cần fix data/code)
```

Spring native: cơ bản 1 DLQ. Tiered DLQ implement bằng custom code hoặc tool Strimzi.

## Pitfall thường gặp với DLQ

| Pitfall | Vấn đề | Sửa |
|---|---|---|
| DLQ không có ai monitor | Lỗi tích luỹ silent | Setup alert (Datadog, Prometheus) trên DLQ topic size/lag |
| DLQ retention quá ngắn | Mất message debug | Set retention dài (90 ngày+) |
| DLQ chia chung cho nhiều consumer group | Khó distinguish lỗi của ai | 1 DLQ riêng per consumer group |
| Reprocess DLQ tự động không check root cause | Loop tương tự loop retry | Fix root cause trước khi replay |
| Schema DLQ giống topic gốc | Khó parse nếu deserialization fail | DLQ chấp nhận raw bytes |
| Quên config `enable-dlq` | Exhausted retry = silent skip | LUÔN setup DLQ cho critical topic |

## Tóm tắt bài 2

- **`default-retryable`**: hành vi default cho exception không trong mapping. Default `true` (retry mọi exception).
- **`retryable-exceptions`**: map specific exception → retry hay không. Dùng FQCN.
- Phân loại đúng → tránh tốn thời gian retry vô ích cho lỗi vĩnh viễn.
- **Dead Letter Queue (DLQ)** = topic riêng nhận message lỗi không xử lý được.
- Enable: `enable-dlq: true` + `dlq-name: {topic}-dlq` (dưới `spring.cloud.stream.kafka.bindings`).
- DLQ messages có headers exception detail + original topic/partition/offset metadata.
- KHÔNG cần code thêm — SCS auto publish khi exhaust hoặc non-retryable.
- Production: monitor DLQ, plan review process, set retention dài, alert khi tích luỹ.
- DLQ KHÔNG phải dump rác — phải có owner xử lý.

**Bài kế tiếp** → [Bài 3: Deserialization failures + Pause/Resume consumer](03-deserialization-pause-resume.md)
