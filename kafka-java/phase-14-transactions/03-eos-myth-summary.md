# Bài 3: Exactly-Once — myth vs reality + Tóm tắt Phase 14

Kafka team thường quảng cáo **"Exactly-Once Processing"** trên slide, conference, marketing. Technically đúng — nhưng dễ gây hiểu nhầm nguy hiểm. Bài này: clear up myth, hiểu rõ scope của EOS, và tóm tắt Phase 14.

## Exactly-Once thực sự nghĩa là gì?

Kafka EOS guarantee: **trong scope của Kafka**:
- Consume input message (Kafka topic A).
- Produce output messages (Kafka topic B, C, ...).
- Commit consumer offset (topic A).

**Cả 3 happen atomically**. Không duplicate, không mất.

**Outside scope của Kafka**: DB writes, HTTP calls, file IO, 3rd party services. Kafka **không có quyền control** những thứ này.

## Vấn đề thực tế trong microservices

```text
PaymentProcessor app:
  
  consume from "transfer-request" topic
       │
       ▼
  validate request
       │
       ▼
  INSERT vào PostgreSQL DB (audit log)        ← OUTSIDE Kafka
       │
       ▼
  call PartnerBankAPI.transfer()              ← OUTSIDE Kafka
       │
       ▼
  produce "credit-event" + "debit-event"      ← Inside Kafka
       │
       ▼
  commit offset of consumed message            ← Inside Kafka
```

Kafka transaction covers chỉ **2 step cuối** (produce + commit offset). 3 step đầu **không** thuộc transaction.

### Scenario crash giữa chừng

```text
Attempt 1:
  Consume message ✓
  Validate ✓
  INSERT DB row "audit-1" ✓                  ← DB đã ghi
  Call PartnerBankAPI.transfer() ✓           ← Đã transfer thật ngoài đời
  Produce credit + debit events ✗            ← Crash trước khi xong tx
  
→ Kafka tx abort, không có credit + debit events trong topic.
→ Consumer offset KHÔNG advance.

Spring retry attempt 2:
  Consume message ✓ (lại)
  Validate ✓
  INSERT DB row "audit-2" ✓                  ← DB ghi LẦN 2 (DUPLICATE!)
  Call PartnerBankAPI.transfer() ✓           ← Transfer LẦN 2 (DUPLICATE!)
  Produce credit + debit events ✓
  Commit tx ✓
  
→ DB có 2 audit rows. Customer bị charge 2 lần.
```

→ EOS của Kafka **không cứu** ta khỏi duplicate **bên ngoài Kafka**.

## Quote chính xác từ Confluent

> "Kafka's exactly-once semantic guarantee applies to **the entire processing pipeline only when the side effects are entirely contained within Kafka**."

Side effect = anything outside Kafka (DB write, HTTP call, file output).

Nếu pipeline của bạn:
- **Pure Kafka-to-Kafka** (consume topic A → produce topic B): EOS works perfectly.
- **Có side effect ngoài Kafka**: cần idempotency ở mỗi side effect.

## Pattern handle side effect — vẫn cần idempotent

### Pattern 1: Idempotency key trong DB

```java
@Bean
public Consumer<Message<TransferRequest>> processor() {
    return msg -> {
        String messageId = (String) msg.getHeaders().get(KafkaHeaders.RECEIVED_KEY);
        TransferRequest req = msg.getPayload();
        
        // Check idempotency
        if (auditRepo.existsByMessageId(messageId)) {
            log.warn("Already processed message {}, skipping", messageId);
            return;
        }
        
        auditRepo.insert(new AuditRecord(messageId, req));
        partnerBank.transfer(req);
        
        streamBridge.send("credit-event-out", buildCredit(req));
        streamBridge.send("debit-event-out", buildDebit(req));
    };
}
```

Mỗi message có UUID (key Kafka). Insert audit chỉ khi chưa có. Retry → skip silently.

Trade-off: thêm 1 DB query mỗi message. Performance hit nhỏ.

### Pattern 2: Database unique constraint

```sql
CREATE TABLE audit_log (
    message_id VARCHAR PRIMARY KEY,    -- unique constraint
    ...
);
```

```java
try {
    auditRepo.insert(new AuditRecord(messageId, req));
} catch (DataIntegrityViolationException e) {
    log.warn("Duplicate detected, skipping");
    return;
}
```

DB tự reject INSERT lần 2. Đơn giản hơn, không cần check trước.

### Pattern 3: Idempotent business logic

Thiết kế operation **idempotent by nature**:
```text
"Set balance to $X"        ← idempotent (gọi 100 lần vẫn cùng kết quả)
"Add X to balance"         ← NOT idempotent (gọi 100 lần khác kết quả)
```

Refactor business logic để mọi operation idempotent → retry safe.

### Pattern 4: Outbox pattern (Phase 13 đã preview)

```java
@Transactional   // DB transaction
public void processTransfer(TransferRequest req) {
    auditRepo.insert(...);                           // DB write
    outboxRepo.insert(new OutboxEvent("credit", ...));  // event ghi vào outbox table CÙNG transaction
    outboxRepo.insert(new OutboxEvent("debit", ...));
    // commit DB transaction → 3 rows atomic
}

// Separate worker đọc outbox, publish vào Kafka
@Scheduled(fixedRate = 100)
public void publishOutbox() {
    List<OutboxEvent> unpublished = outboxRepo.findUnpublished();
    for (OutboxEvent e : unpublished) {
        streamBridge.send(e.topic(), e.payload());
        outboxRepo.markSent(e.id());
    }
}
```

Atomic giữa "DB write + queue event". Retry-safe (DB transaction handles).

Pattern này là **production-grade** cho microservices Kafka. Phổ biến hơn dùng Kafka transaction trong nhiều case.

## So sánh các approach

| Approach | EOS in Kafka | DB side effect safe | HTTP call safe | Complexity |
|---|---|---|---|---|
| At-least-once (Phase 12) | ✗ (duplicate possible) | Cần idempotent code | Cần idempotent | Low |
| Kafka transaction (Phase 14) | ✓ | Vẫn cần idempotent | Vẫn cần idempotent | Medium |
| Outbox pattern | ✓ (qua broker) | ✓ (atomic with DB) | Vẫn cần idempotent | Medium-High |
| Idempotent everywhere | ✓ tương đương | ✓ | ✓ | Design effort |

→ **Không có silver bullet**. Phải design idempotency end-to-end.

## Khi nào nên dùng Kafka transaction?

### Phù hợp khi

- **Kafka-to-Kafka pure pipeline**: consume A → process → produce B. Không có DB write hay HTTP call ngoài.
- **Stream processing**: Kafka Streams aggregation, join, windowing.
- **Idempotency Kafka-side critical**: muốn read_committed consumer không bao giờ thấy duplicate.

### Có thể dùng nhưng không thay thế idempotency

- Microservice có DB write + Kafka publish: combo Kafka tx + idempotent DB.
- Side effects ngoài: Kafka tx + idempotency key.

### Không nên dùng khi

- App đơn giản, throughput cao, không cần strict EOS.
- Kafka-only producer (không phải processor consume-produce): plain `acks=all` + idempotent producer (`enable.idempotence=true`) đủ.
- Lo về latency: transaction tăng latency ~20-50%.

## Trade-off của Kafka transaction

| Pro | Con |
|---|---|
| EOS trong Kafka scope | Latency cao hơn |
| Atomic consume-process-produce | Throughput thấp hơn (~20-50%) |
| No duplicate ở read_committed | Complexity setup (3 properties phải đúng) |
| Spring abstracts hết | Memory overhead consumer buffer |
| | Storage overhead (markers + state topic) |

## Tổng kết Phase 14

### Concepts

| Khái niệm | Ý nghĩa |
|---|---|
| **Transactional.id** | Unique identifier cho mỗi producer instance |
| **Transaction Coordinator** | Component Kafka track tx state |
| **Commit marker** | Special message báo tx complete |
| **Abort marker** | Special message báo tx fail, consumer skip |
| **Isolation level** | `read_committed` filter abort messages |
| **acks=all** | Require all in-sync replicas ack |
| **EOS in Kafka scope** | Atomic consume + produce + commit offset (only inside Kafka) |
| **Side effects** | DB write, HTTP call ngoài Kafka — không trong scope |

### Phải set 3 properties cùng lúc

```yaml
# Bật transaction
spring.cloud.stream.kafka.binder.transaction.transaction-id-prefix: tx-

# Producer reliable
spring.cloud.stream.kafka.binder.transaction.producer.configuration.acks: all

# Consumer filter aborted
spring.cloud.stream.kafka.bindings.{name}.consumer.configuration.isolation.level: read_committed
```

Thiếu 1 trong 3 → guarantee không hoạt động đầy đủ.

### Key takeaways

- Kafka **EOS** = guarantee chỉ trong Kafka. Outside (DB, HTTP) phải tự lo idempotency.
- Transaction abort **không xoá** message — chỉ ghi marker, consumer filter.
- Producer crash → coordinator auto abort sau 60s default.
- Consumer dùng `read_committed` để filter abort messages.
- Mỗi producer instance phải có unique `transactional.id`.
- Trade-off: latency cao hơn 20-50%, throughput giảm. Dùng cho critical use case.
- **Outbox pattern** thường là pragmatic alternative cho microservices với DB.

## Phase 12-14 — bức tranh reliability tổng thể

| Phase | Layer | Provides |
|---|---|---|
| **12 — Acknowledgement** | Foundation | Offset commit mechanism, manual ack, NACK |
| **13 — Error Handling** | Pattern | Retry strategies, exception classification, DLQ, pause/resume |
| **14 — Transactions** | Strict guarantee | Exactly-once in Kafka scope, atomic consume-process-produce |

Combine 3 phase:
- 95% use case: Phase 12 + 13 đủ (at-least-once + retry/DLQ + idempotent).
- 5% critical: Phase 14 + idempotent everywhere = EOS end-to-end.

## Tóm tắt bài 3 + Phase 14

- **EOS myth**: Kafka EOS chỉ trong scope Kafka, KHÔNG cover side effects ngoài (DB, HTTP).
- Side effects cần idempotency riêng: idempotency key, DB unique constraint, idempotent logic, hoặc outbox pattern.
- Kafka transaction phù hợp Kafka-to-Kafka pure pipeline. Với microservice có DB → combo tx + idempotent.
- 3 property phải set đồng loạt: `transaction-id-prefix`, `acks: all`, `isolation.level: read_committed`.
- Trade-off: latency + throughput giảm 20-50%.
- Phase 12-14 build full reliability stack: ack foundation → error handling patterns → strict EOS guarantee.
- Production rule: bắt đầu at-least-once + idempotent. Upgrade to transactional nếu requirement đòi.

**Bài kế tiếp** → [Phase 15 - Integration Testing Strategies](../phase-15-testing/01-testing-strategies.md)
