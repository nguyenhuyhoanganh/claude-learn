# Bài 3: Manual ack trong batch mode + Tóm tắt Phase 12

Bài 2 đã dạy manual ack cho từng message. Khi consumer chạy **batch mode** (Phase 10), bean nhận `Message<List<T>>`. Acknowledgement object trong header sẽ trông thế nào?

## Acknowledgement trong batch mode — 1 object cho cả batch

Suy nghĩ đầu tiên: "header `kafka_receivedMessageKey` chứa List<key>, vậy header acknowledgement chắc cũng chứa List<Acknowledgement>?"

**SAI**. Chỉ có **1 Acknowledgement object** cho cả batch.

### Vì sao?

Recap bài 1: `Acknowledgement` là **abstraction của Spring**, không phải data từ Kafka. Kafka chỉ biết: "ack offset N." Spring thêm object Acknowledgement vào header để code app dễ dùng.

Trong batch mode, Spring chỉ cần **1 ack duy nhất** để commit offset cuối batch. Không cần 500 ack riêng cho 500 message.

### Pattern code

```java
@Configuration
public class BatchConsumerConfig {

    @Bean
    public Consumer<Message<List<String>>> consumer() {
        return msg -> {
            List<String> payloads = msg.getPayload();
            Acknowledgment ack = msg.getHeaders().get(
                KafkaHeaders.ACKNOWLEDGMENT,
                Acknowledgment.class
            );
            
            try {
                // Process tất cả message trong batch
                for (String payload : payloads) {
                    processMessage(payload);
                }
                
                // Acknowledge cả batch (1 lần duy nhất)
                ack.acknowledge();
                
            } catch (Exception e) {
                log.error("Batch processing failed", e);
                ack.nack(Duration.ofSeconds(5));
                // → Spring redeliver TOÀN BỘ batch
            }
        };
    }
}
```

YAML:

```yaml
spring:
  cloud:
    stream:
      kafka:
        bindings:
          consumer-in-0:
            consumer:
              ack-mode: MANUAL              # bật manual ack
              configuration:
                max.poll.records: 500
      bindings:
        consumer-in-0:
          destination: demo-topic
          group: demo-group
          consumer:
            batch-mode: true                # bật batch mode
```

## Vấn đề lớn của batch + manual ack: phần tử fail giữa batch

Scenario:

```text
Batch nhận 500 message.
Code xử lý:
  msg 1 ✓ (DB insert)
  msg 2 ✓
  ...
  msg 498 ✓
  msg 499 ✗ (throw exception — DB timeout)
  → catch block → nack(5s)

Sau 5 giây:
  Spring redeliver TOÀN BỘ batch (500 message lại).
  Code xử lý:
    msg 1 ← XỬ LÝ LẦN 2 (đã insert lần trước!)
    msg 2 ← XỬ LÝ LẦN 2
    ...
    msg 498 ← XỬ LÝ LẦN 2
    msg 499 ← lần này thành công?
```

**Vấn đề**:
- 498 message đầu đã insert DB thành công lần 1.
- Retry → insert lại lần 2 → **duplicate processing**.
- Có thể cause unique key violation, hoặc tệ hơn: gửi email 2 lần, charge card 2 lần.

### Đây cũng là design problem của application

Giống bài 1: Kafka đúng (deliver lại vì chưa ack), app phải **idempotent**.

Cách giải:

| Approach | Mô tả |
|---|---|
| **Idempotency key per message** | Mỗi message có UUID, lưu trong DB. Retry → check exist → skip nếu đã có. |
| **Atomic batch + outbox** | Lưu toàn bộ batch trong 1 DB transaction. Lỗi giữa chừng → rollback toàn bộ. |
| **Smaller batch size** | Giảm `max.poll.records` (vd 50) → blast radius nhỏ hơn khi fail. |
| **Per-message error tracking** | Phase 13 sẽ học: tách message lỗi sang DLQ, ack phần thành công. |

Trade-off:
- Batch mode + manual ack: throughput cao **nếu app idempotent**.
- Nếu không idempotent: dùng record-mode (Phase 10) hoặc smaller batch.

Phase 13 sẽ dạy patterns chi tiết.

## Khi nào dùng manual ack? Khi nào auto?

**Default: dùng auto-ack**. SCS handle tốt cho 95% case. Code clean, không lo ack/nack.

Manual ack **chỉ khi có lý do cụ thể**:

### Manual ack có ích khi

- Cần retry với delay tùy chỉnh (NACK + Duration).
- Cần ack có điều kiện (vd: chỉ ack khi DB insert thành công).
- Cần skip message lỗi (ack để "bỏ qua") không retry.
- Cần kiểm soát chính xác commit timing cho audit/compliance.

### Auto ack tốt hơn khi

- Logic xử lý đơn giản, không có lỗi phức tạp.
- Idempotent processing.
- Không cần custom retry logic (dùng Phase 13 error handler).
- Đa số production scenario.

→ Bắt đầu với **auto**. Nếu requirements yêu cầu kiểm soát → switch sang manual.

## Phase 12 — bức tranh tổng thể

### Concept

| Khái niệm | Ý nghĩa |
|---|---|
| **CURRENT-OFFSET** | Vị trí "consumer đang đứng" trong partition |
| **LEO** (Log End Offset) | Offset cuối cùng trong partition |
| **LAG** | LEO - CURRENT-OFFSET. Backlog chưa xử lý. |
| **Acknowledgement** | Consumer báo Kafka: "đã xử lý xong đến offset N" |
| **Offset Commit** | Operation Kafka update CURRENT-OFFSET |
| **Auto-ack** | SCS tự ack sau mỗi batch xử lý thành công |
| **Manual ack** | Code app tự gọi `ack.acknowledge()` |
| **NACK** | Báo Spring "retry sau X giây", offset không commit |

### Acknowledgement scope

- Ack offset N → mọi offset ≤ N coi như ack ngầm.
- Trong batch mode: 1 ack cho cả batch (500 message → 1 ack).
- Không ack → restart redeliver từ offset chưa commit.

### Reliability semantic

- Kafka default = **at-least-once** delivery: message có thể duplicate, nhưng không bao giờ mất.
- Để tránh duplicate processing → app phải **idempotent**.
- **Exactly-once semantic** (EOS) là khả thi với Kafka transactions (Phase 14).

## Best practices Phase 12

| Practice | Lý do |
|---|---|
| Dùng auto-ack mặc định | Đơn giản, đủ tốt cho 95% case |
| Manual ack khi cần custom retry | NACK với duration, hoặc skip có điều kiện |
| Bean `Message<T>` cho manual mode | Để access acknowledgement object trong header |
| Null-check `Acknowledgement` | Tránh NPE nếu binding không enable manual mode |
| Trong batch mode: code idempotent | Retry batch sẽ reprocess toàn bộ |
| `MANUAL` thay vì `MANUAL_IMMEDIATE` | Trừ khi cần reliability tối đa |
| Set `max.poll.records` phù hợp batch processing | Quá lớn → blast radius khi fail |
| Monitor consumer lag | Lag > threshold = consumer chậm hoặc fail |

## Anti-patterns

| Anti-pattern | Vấn đề | Sửa |
|---|---|---|
| Throw exception trong handler ở auto-ack mode → mong Spring tự retry | SCS default sẽ ack rồi log error, không retry | Dùng manual mode + nack |
| NACK vô hạn cho lỗi vĩnh viễn (vd schema mismatch) | Infinite retry loop, consumer bị stuck | Phân biệt temporary vs permanent error, permanent → DLQ |
| Ack ngay khi nhận message (chưa xử lý) | Mất message khi crash giữa xử lý | Ack SAU KHI xử lý xong |
| Forget enable `ack-mode: MANUAL` | Acknowledgement = null trong header | Config YAML |
| Mix manual ack + auto ack trong cùng app | Confused state | Stick 1 mode per binding |
| Sync DB write per message trong batch handler | Throughput thấp | Bulk insert (`saveAll`) ở cuối batch |

## Roadmap đến Phase 14

Phase 12 đã đặt nền tảng reliability. 2 phase tiếp:

### Phase 13: Error Handling & Fault Tolerance

- **Retry topic pattern**: tự động retry message lỗi vào topic riêng.
- **Dead Letter Queue (DLQ)**: message fail sau N retry → đẩy sang DLQ.
- **Error classifier**: phân biệt temporary vs permanent error.
- **Backoff strategies**: linear, exponential.
- Spring `DefaultErrorHandler`, `DeadLetterPublishingRecoverer`.

### Phase 14: Data Integrity — Kafka Transactions

- **Producer transactions**: gửi nhiều message atomic (all-or-nothing).
- **Exactly-once semantic (EOS)**: kết hợp producer transactions + consumer isolation level.
- **Consume-process-produce pattern**: atomic chain consumer → processor → producer.
- `min.insync.replicas`, `acks=all`.

## Tóm tắt bài 3 + Phase 12

- Batch mode + manual ack: **1 Acknowledgement object cho cả batch**, không phải list.
- Nack trong batch → redeliver TOÀN BỘ batch → cần app idempotent.
- Manual ack chỉ dùng khi cần kiểm soát đặc biệt. **Default vẫn là auto-ack**.
- Kafka semantic mặc định: **at-least-once** (có thể duplicate, không mất).
- Application phải **idempotent** để xử lý duplicate an toàn.
- Exactly-once semantic khả thi với Kafka transactions (Phase 14).
- Phase 13 sẽ học error handling, DLQ, retry strategies — bổ sung cho ack mechanism này.

**Bài kế tiếp** → [Phase 13 - Error Handling & Fault Tolerance](../phase-13-error-handling/01-error-handling-basics.md)
