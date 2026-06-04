# Bài 1: Resilience expectations + Retry strategies (fixed delay, exponential backoff)

Phase 12 đã dạy: nếu consumer handler throw exception → SCS không ack → broker redeliver. Đó là protection cơ bản.

Nhưng còn nhiều tình huống cần xử lý:
- Lỗi tạm thời (DB timeout, network glitch) → nên **retry** với delay.
- Lỗi vĩnh viễn (invalid data, schema mismatch) → KHÔNG retry, **skip**.
- Retry mãi không thành công → đẩy sang **Dead Letter Queue (DLQ)**, move on.

Bài này: define expectations chuẩn, demo fixed delay retry + exponential backoff.

## Expectations chuẩn — không phải về Spring, mà về behavior

Trước khi nói về Spring config, ta nên rõ **hệ thống nên behave như thế nào** khi gặp lỗi:

| Tình huống | Kafka offset | Action |
|---|---|---|
| Message xử lý thành công | Commit | Tiếp tục message kế |
| Throw exception | KHÔNG commit | Cần quyết định: retry hay không? |
| Exception retryable (DB timeout, network) | KHÔNG commit | Retry với delay (fixed hoặc exponential) |
| Exception non-retryable (invalid data) | Commit (skip) | Skip + log/alert |
| Retryable nhưng exhausted attempts | Commit (force skip) | Gửi sang DLQ + move on |

> **Câu hỏi**: tại sao 2 case cuối lại **commit offset** dù message chưa xử lý "thành công"?
> 
> **Lý do**: Kafka **không có cơ chế "skip 1 message ở giữa"**. Consumer phải xử lý theo thứ tự offset. Nếu message 4 fail vĩnh viễn mà không commit → consumer **stuck forever** ở offset 4, message 5, 6, 7, ... không bao giờ được xử lý.
> 
> Vì vậy commit offset ở case này KHÔNG có nghĩa "đã xử lý thành công" — mà có nghĩa "sẵn sàng chuyển sang message kế". Để không mất data, ta đẩy message lỗi sang **DLQ topic** riêng để xử lý sau.

## Project setup

```text
Section 16:
  consumer/
    ConsumerConfig.java       — bean nhận Integer (orderId)
    OrderService.java         — service xử lý order
  exceptions/
    InputValidationException
    ServiceUnavailableException
```

### Order rule cho demo

```java
@Bean
public Consumer<Integer> consumer() {
    return this::handleMessage;
}

private void handleMessage(Integer orderId) {
    log.info("Received order: {}", orderId);
    
    if (orderId < 1) {
        throw new InputValidationException("Invalid order ID: " + orderId);
        // ↑ non-retryable: data sai luôn, retry vô ích
    }
    
    orderService.saveOrder(orderId);
    // ↑ có thể throw ServiceUnavailableException ngẫu nhiên nếu orderId > 5
}
```

```java
@Service
public class OrderService {
    
    public void saveOrder(int orderId) {
        if (orderId > 5) {
            // simulate intermittent failure (50% chance)
            if (Math.random() < 0.5) {
                throw new ServiceUnavailableException("DB connection lost");
            }
        }
        log.info("Order saved: {}", orderId);
    }
}
```

Test cases:
- Send `1, 2, 3, 4, 5` → all success.
- Send `0` (hoặc số âm) → `InputValidationException` (non-retryable).
- Send `6, 7, 8, ...` → 50% chance `ServiceUnavailableException` (retryable).

## Strategy 1: Fixed delay retry

Mọi retry đều đợi **cùng 1 khoảng thời gian** giữa các lần.

### YAML config

```yaml
# section16/01-retry-fixed-delay.yaml
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
          destination: order-events
          group: order-service
          consumer:
            max-attempts: 3                # tổng số attempt (1 ban đầu + 2 retry — xem note dưới)
            back-off-initial-interval: 5000   # đợi 5 giây trước retry đầu
            back-off-multiplier: 1.0       # 1.0 = fixed delay
```

3 property quan trọng:

| Property | Ý nghĩa |
|---|---|
| `max-attempts` | Số lần attempt tổng cộng |
| `back-off-initial-interval` | Thời gian (ms) đợi trước retry đầu tiên |
| `back-off-multiplier` | Hệ số nhân cho delay giữa các retry. `1.0` = fixed. `> 1` = exponential |

### ⚠️ Quirk của `max-attempts`

Documentation Spring nói `max-attempts: 3` = 1 initial attempt + 2 retry = 3 tổng.

Thực tế (test ở thời điểm khoá học recording): `max-attempts: 3` = 1 initial + **3 retry** = 4 tổng cộng.

→ Behavior thực tế **khác với documentation**. Có thể là bug hoặc doc lỗi. Khi tune `max-attempts` → test demo trước để xác nhận behavior thực.

### Demo flow

Setup:
- Fresh Kafka.
- 2 terminal: T1 = console producer, T2 = describe consumer group định kỳ.
- Chạy section 16 app với config `01-retry-fixed-delay.yaml`.

#### Test 1: Send orderId hợp lệ

```bash
# T1
> 1
> 2
> 3
> 4
```

Log app:
```text
Received: 1, delivery_attempt=1 → saved
Received: 2, delivery_attempt=1 → saved
Received: 3, delivery_attempt=1 → saved
Received: 4, delivery_attempt=1 → saved
```

Header `kafka_deliveryAttempt = 1` → attempt đầu tiên (chưa retry).

T2 describe: lag = 0.

#### Test 2: Send orderId = 0 (non-retryable error)

```bash
# T1
> 0
```

Log app (spread theo thời gian):
```text
T+0s:  Received: 0, delivery_attempt=1 → InputValidationException → retry
T+5s:  Received: 0, delivery_attempt=2 → InputValidationException → retry
T+10s: Received: 0, delivery_attempt=3 → InputValidationException → retry
T+15s: Received: 0, delivery_attempt=4 → InputValidationException → exhausted
       → throw lên framework → commit offset (force skip)
       → ready cho message kế
```

T2 describe trong lúc retry: lag = 1 (offset chưa advance).
Sau exhaust: lag = 0 (offset advance, message bị skip).

⚠️ Vấn đề: `InputValidationException` là **non-retryable** mà vẫn bị retry. Vì sao? Vì YAML hiện tại **không phân loại** exception nào retryable. Default: retry **mọi** exception.

→ Tốn 15 giây + 4 log error stack trace cho 1 message data sai. Lãng phí. Bài 2 sẽ học cách phân loại.

#### Test 3: Send orderId = 6 (intermittent error 50%)

```bash
# T1
> 6
```

Có 3 case:
- Lucky: attempt đầu thành công → log "saved", lag = 0.
- Fail 1 lần: attempt 1 fail → đợi 5s → attempt 2 thành công.
- Fail nhiều lần: retry vài lần → eventually success hoặc exhausted.

Đây là **use case đúng cho retry**: lỗi tạm thời, có khả năng thành công khi thử lại.

## Strategy 2: Exponential backoff retry

Delay tăng gấp đôi (hoặc gấp N lần) sau mỗi attempt.

### Tại sao exponential?

Fixed delay 5 giây × 3 retry = 15 giây total. Nếu downstream service đang overload → cứ 5 giây lại gọi → vẫn overload.

Exponential: 2s → 4s → 8s → 16s → ... Tổng thời gian dài hơn nhưng cho downstream "thở", có thời gian recover.

Pattern này dùng phổ biến ở:
- API call ra ngoài (cloud provider rate limit).
- Database reconnect.
- Circuit breaker recovery.

### YAML config

```yaml
# section16/02-retry-exponential.yaml
spring:
  cloud:
    stream:
      bindings:
        consumer-in-0:
          consumer:
            max-attempts: 3
            back-off-initial-interval: 2000   # 2s
            back-off-multiplier: 2.0          # nhân 2 mỗi lần
            back-off-max-interval: 10000      # cap upper bound 10s
```

Thêm 1 property:

| Property | Ý nghĩa |
|---|---|
| `back-off-max-interval` | Upper bound — không retry quá khoảng này dù multiplier tính ra lớn hơn |

### Tính toán delay

```text
Initial = 2s, multiplier = 2.0, max = 10s

Attempt 1: ngay lập tức (initial attempt)
Attempt 2: đợi 2s        (= initial)
Attempt 3: đợi 4s        (= 2 × 2)
Attempt 4: đợi 8s        (= 4 × 2)
Attempt 5: đợi 10s (cap) (= 8 × 2 = 16, cap at 10)
Attempt 6: đợi 10s (cap)
...
```

Tổng thời gian dài hơn fixed delay, nhưng downstream service có cơ hội recover thực sự.

### Demo

Producer:
```bash
> 0
```

Log app:
```text
T+0s:  Received: 0, delivery_attempt=1 → exception
T+2s:  Received: 0, delivery_attempt=2 → exception
T+6s:  Received: 0, delivery_attempt=3 → exception
T+14s: Received: 0, delivery_attempt=4 → exhausted → commit + skip
```

Quan sát timestamp giữa các attempt: 2s, 4s, 8s — exponential.

## Khi nào dùng fixed vs exponential?

| Tình huống | Strategy |
|---|---|
| Lỗi rất ngắn hạn (network blip < 1s) | Fixed delay nhỏ (500ms-1s) |
| Lỗi tạm thời nhưng cần thời gian recover (DB restart) | Exponential backoff |
| Throttling từ external API | Exponential backoff (tránh hammer API) |
| Bug rare race condition | Fixed delay nhỏ + few retries |
| Lỗi downstream service overload | Exponential + jitter (Phase later) |

Default cho production: **exponential** với cap. Fixed chỉ cho case rất specific.

## Jitter — improvement cho exponential

Nếu 1000 consumer instances cùng fail message vào cùng thời điểm → tất cả retry sau cùng 2s, 4s, 8s → **thundering herd**.

Solution: **jitter** = thêm random offset vào delay.

```text
Without jitter:
  Attempt 2: tất cả 1000 instance đợi 2.000s
  → 1000 request hit downstream cùng lúc
  
With jitter (random 0-50%):
  Attempt 2: instances đợi 2.0-3.0s (random spread)
  → request hit downstream phân tán đều
```

Spring Cloud Stream default chưa có jitter built-in cho retry. Có thể implement qua `RetryTemplate` custom (advanced). Production-grade error handling library (Resilience4j) hỗ trợ jitter sẵn.

## Pitfall thường gặp

| Pitfall | Vấn đề | Sửa |
|---|---|---|
| `max-attempts` quá lớn (vd 100) | Consumer stuck quá lâu trên 1 message lỗi vĩnh viễn | Giới hạn 3-5 attempts, dùng DLQ |
| `back-off-initial-interval` quá ngắn (0ms) | Hammer downstream, không giúp recover | Tối thiểu 500-1000ms |
| Fixed delay cho lỗi cần backoff | Không cho downstream recover | Exponential |
| Không cap exponential | Delay dài vô hạn, consumer treo | Set `back-off-max-interval` |
| Retry mọi exception (default) | Lãng phí cho non-retryable errors | Phân loại exception (bài 2) |
| Không có DLQ | Message lỗi exhausted attempts → vẫn skip nhưng mất | Setup DLQ (bài 3) |

## Tóm tắt bài 1

- 4 case error handling cần handle: success (commit), retryable (retry), non-retryable (skip), exhausted (DLQ).
- Commit offset ≠ "xử lý thành công" — có thể nghĩa "sẵn sàng skip sang message kế".
- 3 property cốt lõi: `max-attempts`, `back-off-initial-interval`, `back-off-multiplier`.
- **Fixed delay**: `multiplier = 1.0`. Đơn giản, tốt cho lỗi rất ngắn hạn.
- **Exponential backoff**: `multiplier > 1.0` + `back-off-max-interval` cap. Tốt cho lỗi cần downstream recover.
- ⚠️ Quirk: `max-attempts: 3` có thể là 1 + 3 retry = 4 attempts (khác với doc). Test trước khi production.
- Default Spring retry **mọi exception**. Bài 2 sẽ phân loại retryable vs non-retryable.
- Bài 3: Dead Letter Queue cho exhausted retry case.

**Bài kế tiếp** → [Bài 2: Phân loại retryable vs non-retryable exception](02-retryable-vs-nonretryable.md)
