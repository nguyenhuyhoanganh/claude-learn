# Bài 4: Tóm tắt Phase 13 — Error Handling toàn diện

Phase 13 đã đi qua 4 chủ đề lớn của error handling:
1. Retry strategies (fixed delay, exponential backoff).
2. Exception classification (retryable vs non-retryable).
3. Dead Letter Queue (DLQ).
4. Pause/Resume consumer.

Bài này tổng kết để bạn nắm full picture + decision tree khi nào dùng cái nào.

## Developer expectations recap

Khi viết consumer, đây là behavior mong muốn cho từng tình huống:

| Tình huống | Hành vi mong muốn |
|---|---|
| Message xử lý thành công | Commit offset, tiếp tục message kế |
| Lỗi tạm thời (retryable) | Retry với delay strategy hợp lý |
| Lỗi vĩnh viễn (non-retryable) | Skip ngay, không retry vô ích |
| Lỗi retryable nhưng exhausted attempts | Send DLQ + commit + move on |
| Lỗi deserialize message | Send DLQ với exception detail |
| Dependent service down toàn bộ | Pause consumer cho đến khi service recover |

Toàn bộ behavior này SCS support **qua config**, không cần viết code.

## Cấu hình tổng hợp

### YAML full

```yaml
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
              enable-dlq: true                        # DLQ
              dlq-name: order-events-dlq
              ack-mode: BATCH                          # default
              configuration:
                auto.offset.reset: earliest
      bindings:
        consumer-in-0:
          destination: order-events
          group: order-service
          consumer:
            # Retry strategy
            max-attempts: 3
            back-off-initial-interval: 2000             # 2 giây
            back-off-multiplier: 2.0                     # exponential
            back-off-max-interval: 10000                 # cap 10s
            
            # Exception classification
            default-retryable: true
            retryable-exceptions:
              com.acme.exceptions.InputValidationException: false
              com.acme.exceptions.ServiceUnavailableException: true
              com.acme.exceptions.AuthenticationException: false
              org.springframework.dao.DataAccessException: true
```

### Code consumer

```java
@Configuration
public class ConsumerConfig {

    private final OrderService orderService;

    @Bean
    public Consumer<Integer> consumer() {
        return orderId -> {
            if (orderId < 1) {
                throw new InputValidationException("Invalid order ID: " + orderId);
                // → non-retryable → DLQ ngay
            }
            orderService.saveOrder(orderId);
            // → có thể throw ServiceUnavailableException → retry 3 lần → DLQ nếu exhausted
        };
    }
}
```

3 dòng code core. SCS handle hết error logic qua config.

## Decision tree khi gặp exception

```text
Exception thrown:
    │
    ▼
[1] Check exception classification:
    │
    ├── default-retryable: true + không có trong mapping
    │   → RETRY
    │
    ├── retryable-exceptions: ExceptionX = true
    │   → RETRY (override default)
    │
    ├── default-retryable: false + không có trong mapping
    │   → SKIP (go to step 3)
    │
    └── retryable-exceptions: ExceptionX = false
        → SKIP (go to step 3)
        
[2] RETRY path:
    │
    ▼
    Calculate next delay:
      delay = initial × multiplier^(attempt-1)
      delay = min(delay, max-interval)
    │
    ▼
    Wait delay seconds → retry
    │
    ├── Success → commit offset, done
    └── Fail again → check attempt count
        ├── attempt < max-attempts → loop back
        └── attempt >= max-attempts → exhausted, go to step 3

[3] SKIP path (non-retryable OR exhausted):
    │
    ├── enable-dlq: true
    │   → publish message + exception detail vào DLQ topic
    │   → commit offset original topic
    │
    └── enable-dlq: false
        → silently drop message
        → commit offset (lost data!)

[4] Move on next message
```

## Khi nào dùng cái gì — bảng quyết định

### Chọn retry strategy

| Tình huống | Strategy |
|---|---|
| Lỗi rất ngắn hạn (network blip < 1s), throughput cao | Fixed delay 500ms × 3 |
| Lỗi DB timeout, cần connection pool reset | Exponential 1s → 2s → 4s, max 10s |
| Throttling từ 3rd party API | Exponential 5s → 30s → 5 phút, max 5 phút (giving up) |
| Lỗi rare race condition | Fixed 100ms × 5 (small + fast) |
| Lỗi không rõ | Exponential 2s → 8s × 3 (safe default) |

### Chọn exception handling

| Loại lỗi | Retryable? | Action |
|---|---|---|
| `IOException`, `TimeoutException` | Yes | Retry với backoff |
| `DataAccessException` (DB) | Yes (transient) | Retry |
| `OptimisticLockingException` | Yes | Retry ngay (concurrent edit) |
| `ConstraintViolationException` (data đã tồn tại) | No | Skip, có thể đã xử lý trước |
| `IllegalArgumentException` (input invalid) | No | Skip + DLQ |
| `SerializationException` | No | Skip + DLQ (data format sai) |
| `AuthenticationException` | No | Skip + DLQ (cần intervention) |
| `OutOfMemoryError` | No | Crash app (let it die) |
| Custom domain exception | Depends | Phân loại rõ trong code |

### Khi nào dùng pause/resume thay vì retry?

| Tình huống | Approach |
|---|---|
| Lỗi 1 message cụ thể | Retry per-message |
| 1 vài message liên tiếp fail | Retry (bug hoặc data lỗi) |
| 50%+ message fail liên tục | Có thể dependent service down → pause |
| Toàn bộ DB down | Pause toàn binding |
| 3rd party API rate limit | Pause + sleep + resume |
| Deploy mới → cache cold | Có thể pause vài giây cho cache warm |

Rule: **per-message error → retry/DLQ**. **System-wide issue → pause/resume**.

## Production checklist Phase 13

- [ ] `max-attempts` set hợp lý (3-5, không quá cao).
- [ ] Chọn fixed hay exponential dựa vào nature of failure.
- [ ] `back-off-max-interval` cap để tránh delay dài vô hạn.
- [ ] `default-retryable: false` + whitelist explicit (strict mode) — hoặc `true` + blacklist non-retryable (permissive).
- [ ] `enable-dlq: true` cho mọi critical consumer.
- [ ] DLQ topic có retention dài (90 ngày+).
- [ ] Setup alert cho DLQ topic size/lag.
- [ ] Document team workflow review/reprocess DLQ.
- [ ] Pause/Resume cho consumer với dependent service quan trọng.
- [ ] HealthCheckManager có log rõ + alert nếu paused > threshold.
- [ ] Schema Registry nếu có nhiều producer khác team.
- [ ] Test scenario: kill DB, observe pause activate. Restart DB, observe resume.

## Anti-patterns tổng hợp

| Anti-pattern | Vấn đề chính | Sửa |
|---|---|---|
| Retry mọi exception (default behavior) | Lãng phí thời gian cho lỗi vĩnh viễn | Phân loại với `retryable-exceptions` |
| Max attempts quá cao (50+) | Consumer stuck quá lâu | Giới hạn 3-5 |
| Không enable DLQ | Mất data khi exhausted | Luôn DLQ cho critical |
| DLQ không có owner | Lỗi tích luỹ silent | Setup alert + workflow review |
| Pause forever do bug check | Consumer treo | Timeout + auto resume + alert |
| Retry không có backoff | Hammer downstream | Min initial 500-1000ms |
| Mix manual ack với retry config | Logic confused | Pick 1 approach |
| Không monitor lag | Không biết khi nào consumer fall behind | Dashboard + alert |

## Phase 13 vs Phase 12

Phase 12 (Reliability + Acknowledgement):
- **Foundation**: ack mechanism, offset commit.
- **What**: khi nào offset được advance, basic NACK/retry.
- Granularity: per-message.

Phase 13 (Error Handling):
- **Production patterns**: retry strategies, DLQ, pause/resume.
- **How**: cấu hình declarative cho complex error scenarios.
- Granularity: per-binding + per-exception type.

→ Phase 13 build on top of Phase 12. Acknowledgement là foundation, error handling là layer trên.

## Phase 14 preview — Transactions

Phase 12-13 đã đảm bảo:
- Message không mất (at-least-once delivery).
- Lỗi được handle gracefully (retry, DLQ).

Phase 14 sẽ đi xa hơn:
- **Producer transaction**: gửi nhiều message **atomic** (all-or-nothing).
- **Consume-process-produce pattern**: read từ topic A → process → write topic B → commit offset A. **Tất cả atomic**.
- **Exactly-once semantic (EOS)**: không duplicate, không mất.
- Properties: `acks=all`, `min.insync.replicas`, `enable.idempotence`, `isolation.level=read_committed`.

Đây là level reliability cao nhất Kafka cung cấp — dùng cho financial transactions, billing, etc.

## Tóm tắt bài 4 + Phase 13

Phase 13 đã trang bị bộ công cụ error handling production-grade:

| Layer | Tool |
|---|---|
| Retry strategy | `max-attempts` + `back-off-*` |
| Exception classification | `retryable-exceptions` map |
| Catch exhausted/permanent fail | DLQ (`enable-dlq` + `dlq-name`) |
| System-wide service down | `BindingsLifecycleController` pause/resume |
| Deserialization failure | DLQ catch + Schema Registry (advanced) |

Tất cả qua **config**, không cần code logic phức tạp. Code consumer vẫn thin, business-focused.

Đây là level production-ready cho hầu hết EDA system. Phase 14 sẽ thêm exactly-once cho critical financial use case.

**Bài kế tiếp** → [Phase 14 - Kafka Transactions + Exactly-Once](../phase-14-transactions/01-transactions-intro.md)
