# Bài 3: Delivery semantics — at-most-once, at-least-once, exactly-once

Network không reliable. Server crash. Acknowledgement lost. Trong distributed system, "message delivered" không trivial.

Bài này phân tích **3 delivery semantics** — và quan trọng: **exactly-once** thực sự nghĩa là gì (rất nhiều người hiểu sai).

## Setup vấn đề — request-response cũng đã khó

```text
Service A ──request──► Service B
            ◄────────  (response không bao giờ tới)

A's perspective: "B didn't process? Or B processed but ack lost?"
                 → Không cách nào phân biệt.
```

Choice:
- **Retry**: nếu B đã process → duplicate.
- **Không retry**: nếu B chưa process → mất data.

Vấn đề cơ bản của distributed system.

## EDA mở rộng vấn đề — 3 entities, 6 fail points

```text
Producer ──1──► Broker ──3──► Consumer
         ◄─2──         ◄──4──
         ack            ack

Fail points:
1. Producer → Broker request lost.
2. Broker stored, ack to Producer lost.
3. Broker → Consumer delivery lost.
4. Consumer processed, ack to Broker lost.
+ Consumer crash mid-processing.
+ Broker crash before persist.
```

Producer + Broker + Consumer phải **agree** trên semantics trước khi design.

> ⚠️ **Concept universal, config cụ thể khác giữa Kafka/RabbitMQ/SQS**. Đọc doc kỹ.

## Semantic 1: At-most-once

> Mất data OK, **không** được duplicate. Lowest latency, lowest overhead.

### Producer side

```text
Producer: send event → if no ack within timeout → KHÔNG retry.
```

Case:
- ✓ Broker received + stored + ack came: OK.
- ✓ Broker received + stored + ack lost: producer thinks lost, **không retry** → broker has 1 copy → OK.
- ✗ Broker NEVER received: producer doesn't retry → **event lost**.

### Consumer side

```text
Consumer: receive event → ack first → THEN process.
```

Case:
- ✓ Receive + ack + process + crash after: event đã processed → restart not deliver → OK.
- ✗ Receive + ack + crash BEFORE process: broker thinks processed → never redeliver → **event lost**.

### Use case

```text
Ride-sharing — driver location every 4 seconds.

Driver sends: (lat=10.1, lng=20.2, ts=1234)
             (lat=10.2, lng=20.3, ts=1238)
             ...

Lose 1 location ping → extrapolate from neighbors. NO big deal.
Process duplicate location → wasted CPU + storage.
→ At-most-once optimal.
```

Logs, metrics, telemetry from 100k servers → at-most-once is cost-effective.

### Latency / overhead

- No retry → no resend latency.
- No dedup logic → minimal CPU.
- Best throughput, lowest cost.

## Semantic 2: At-least-once

> **Không bao giờ mất** event, có thể duplicate. Default semantic của Kafka, SQS.

### Producer side

```text
Producer: send event → if no ack within timeout → RETRY.
```

Case:
- ✓ Send + ack came: OK.
- ✗ Send + broker stored + ack lost + producer retry → **broker has 2 copies** (duplicate).
- ✓ Send + broker never received + retry until success: OK, event saved.

### Consumer side

```text
Consumer: receive → PROCESS first → ack last.
```

Case:
- ✓ Receive + process + ack + crash: OK, processed once.
- ✗ Receive + process + crash before ack → broker redeliver → consumer **process again** → duplicate processing.
- ✗ Receive + process + ack lost + broker redeliver → duplicate processing.

### Use case

```text
Push notification "Your order shipped":
- Send 2 notifications to user → mildly annoying, NOT critical.
- Don't send any → user angry, support ticket.
→ At-least-once OK.
```

```text
User review for product:
- App logic: 1 user can leave only 1 review per product.
- Process same review event twice → second insert ignored (unique key) or overrides identically.
- Don't process → review lost.
→ At-least-once OK (idempotency natural).
```

### Latency / overhead

- Retry timeout = millisecond → seconds. Latency tăng.
- Broker phải wait ack from consumer trước khi mark delivered → latency.
- Throughput thấp hơn at-most-once.

NOT good for real-time, high-throughput stream.

## Semantic 3: Exactly-once

> Mỗi event delivered + processed **đúng 1 lần**. Highest overhead, complex.

> ⚠️ **Misconception lớn**: "Broker hỗ trợ exactly-once = mọi nơi exactly-once". KHÔNG.

Phân biệt:
- **Producer → Broker**: có thể exactly-once (broker dedup based on idempotency ID).
- **Broker → Consumer + DB write**: broker chỉ guarantee at-least-once. **Consumer phải idempotent**.

### Producer side — exactly-once

```text
1. Producer get unique idempotency ID:
   - Broker provides (Kafka transactional producer + sequence number).
   - Or external service (UUID generator).

2. Producer send event + ID.
3. If no ack → retry với same ID.
4. Broker check: ID đã có trong log? → ignore.
                  Chưa? → store.

Result: log có exactly 1 copy of event.
```

Kafka implementation:
```text
producer.send(record) →
  - Broker assigns producer ID + sequence number.
  - Broker dedup based on (producer_id, sequence).
  - Enable idempotence: producer config `enable.idempotence=true`.
```

### Consumer side — gotcha

```text
Consumer receive event from broker → process → write to DB.

Broker can confirm: "event delivered" (at-least-once max).
But DB write is OUTSIDE broker control.

Crash points:
- Process + write DB + crash before ack → broker redeliver → process again → 
  duplicate DB write.
- Process + write DB + ack lost → broker redeliver → duplicate.
```

→ Broker **cannot** guarantee exactly-once cross-system.

### Consumer side — bạn phải implement idempotency

Pattern:

```java
@KafkaListener(topics = "orders")
@Transactional
public void onOrderEvent(OrderEvent event, Acknowledgment ack) {
    // 1. Check if already processed
    if (processedEventRepo.existsById(event.idempotencyId)) {
        ack.acknowledge();  // Skip — already handled
        return;
    }
    
    // 2. Process business logic
    orderRepo.save(buildOrder(event));
    
    // 3. Mark event as processed (SAME transaction as business write)
    processedEventRepo.save(new ProcessedEvent(event.idempotencyId, Instant.now()));
    
    // 4. Both writes commit atomic. THEN ack to broker.
    ack.acknowledge();
}
```

Schema:
```sql
CREATE TABLE processed_events (
    idempotency_id VARCHAR PRIMARY KEY,
    processed_at TIMESTAMP NOT NULL
);

CREATE TABLE orders (
    id UUID PRIMARY KEY,
    -- order fields
);
```

Key: `processed_events.idempotency_id` = source of truth "đã handled chưa". Re-delivery → check exists → no-op.

→ **Application-level idempotency** + broker dedup = end-to-end exactly-once.

### Kafka exactly-once example

```java
Producer config:
- enable.idempotence=true
- transactional.id=my-tx-id

Code:
producer.initTransactions();
producer.beginTransaction();
try {
    producer.send(new ProducerRecord<>("topic", event));
    // ... other operations
    producer.commitTransaction();
} catch (Exception e) {
    producer.abortTransaction();
}

Consumer:
- isolation.level=read_committed → only consume committed messages.
```

Kafka Streams API hỗ trợ exactly-once **within Kafka** (read-process-write all in Kafka). Cross-system (Kafka → external DB) still need manual idempotency.

### Latency / overhead

- ID generation overhead.
- Producer dedup check.
- Consumer idempotency check (DB lookup).
- Transactional commit.

Cost: 2-10× latency vs at-most-once. Use only when justified (money, orders).

## Bảng so sánh

| Aspect | At-most-once | At-least-once | Exactly-once |
|---|---|---|---|
| Data loss risk | Có | Không | Không |
| Duplication risk | Không | Có | Không |
| Latency | Lowest | Medium | Highest |
| Throughput | Highest | Medium | Lowest |
| Producer retry | No | Yes | Yes + ID |
| Consumer ack | Before process | After process | After process + idempotent |
| Implementation complexity | Trivial | Easy | Hard (need app-level idempotency) |
| Best for | Logs, metrics, telemetry | Notifications, reviews | Payments, orders, money transfer |

## Decision matrix

| Data type | Recommendation |
|---|---|
| Metrics/logs (high volume, individual not critical) | At-most-once |
| Notifications (push, email) | At-least-once |
| Analytics events | At-least-once + dedup downstream |
| User actions (review, like) | At-least-once + idempotent handler |
| Order placement | Exactly-once (or at-least-once + idempotent) |
| Financial transactions | Exactly-once strictly |
| Money transfers | Exactly-once strictly |

## Pattern: Outbox + idempotency = exactly-once thực dụng

Production-grade exactly-once = combo:

```text
Producer side:
  Outbox table (atomic with business data) →
  Worker poll → publish event with idempotencyId →
  Kafka dedup at-least-once → 
  Consumer side checks processed_events → idempotent.
```

```java
// PRODUCER
@Transactional
public void placeOrder(Order order) {
    orderRepo.save(order);
    outboxRepo.save(new OutboxEvent(
        idempotencyId = UUID.randomUUID(),  // unique
        topic = "orders",
        payload = order.toJson()
    ));
    // Atomic commit
}

// WORKER (separate)
@Scheduled(fixedRate = 100)
public void publishOutbox() {
    var unpublished = outboxRepo.findUnpublished(100);
    for (var e : unpublished) {
        kafkaProducer.send(e.topic, e.idempotencyId, e.payload);
        // Mark sent
        e.markSent();
        outboxRepo.save(e);
    }
}

// CONSUMER
@KafkaListener("orders")
@Transactional
public void onOrder(OrderEvent event, String idempotencyKey) {
    if (processedRepo.existsById(idempotencyKey)) return;  // dedup
    processOrder(event);
    processedRepo.save(new ProcessedEvent(idempotencyKey));
}
```

End-to-end exactly-once semantics, practical.

## Anti-pattern: "Broker says exactly-once, I don't worry"

Common: dev đọc Kafka docs "exactly-once delivery", relax, write naive consumer:

```java
@KafkaListener
public void onPayment(PaymentEvent e) {
    paymentRepo.save(e);  // Just save, trust broker
    // No idempotency check
}
```

Kafka transaction guarantee within Kafka. **Database write is external** → at-least-once at DB level → duplicate.

Result: duplicate payments. User charged twice. Refund war.

Fix: Always implement consumer-side idempotency for any cross-system effect.

## Tóm tắt bài 3

- 3 fail-points trong EDA delivery: producer→broker, broker→consumer, consumer ack.
- **At-most-once**: lose OK, no dup, lowest latency. Use cho logs/metrics.
- **At-least-once**: no lose, dup possible, default cho hầu hết broker. Use cho notifications, reviews.
- **Exactly-once**: hardest, highest cost. **Broker chỉ guarantee within itself** — consumer + DB write phải tự implement idempotency.
- Pattern thực dụng: **Outbox** (producer atomic) + **idempotency ID** + **at-least-once Kafka** + **consumer dedup table**.
- Anti-pattern: trust "exactly-once" label, skip consumer-side idempotency → duplicate critical data (payments).
- Choose semantic theo data criticality, không theo "latest cool tech".

**Bài kế tiếp** → [Phase 5 — Bài 1: Saga pattern — quản lý distributed transaction](../phase-5-design-patterns/01-saga-pattern.md)
