# Bài 39: Test end-to-end Outbox — chứng minh chống dual-write

> Đến đây code Outbox đã đầy đủ. Bài này test 4 scenario: happy path, 2 compensation paths, và **scenario chứng minh outbox đẳng cấp** — kill Kafka giữa flow rồi up lại, SAGA vẫn hoàn thành đúng.

## Scenario 1 — Happy path APPROVED

POST order như bài 32. Theo dõi DB outbox:

```text
T+0s:    Order INSERT, payment_outbox INSERT (STARTED + STARTED)
T+5s:    Scheduler pick → publish Kafka payment-request
         payment_outbox: COMPLETED + STARTED
T+5.1s:  Payment service consume → process → INSERT order_outbox STARTED
T+10s:   Payment scheduler publish payment-response
         payment.order_outbox: COMPLETED + SUCCEEDED
T+10.1s: Order consume payment-response → process → update payment_outbox PROCESSING
                                                  → INSERT approval_outbox STARTED + PROCESSING
T+15s:   Order scheduler publish restaurant-approval-request
         approval_outbox: COMPLETED + PROCESSING
T+15.1s: Restaurant consume → process → INSERT order_outbox STARTED
T+20s:   Restaurant scheduler publish restaurant-approval-response
T+20.1s: Order consume → process → update approval_outbox SUCCEEDED + COMPLETED
                                 → update payment_outbox SUCCEEDED + COMPLETED
                                 → Order status APPROVED
```

Khoảng 20 giây cho SAGA hoàn thành (so với 3-5 giây phase-8). Latency tăng vì scheduler polling 5s. Đánh đổi cho consistency.

Cleaner chạy lúc nửa đêm → xoá row terminal.

### DB snapshot

```text
$ psql -c 'SELECT outbox_status, saga_status, count(*) 
           FROM "order".payment_outbox GROUP BY outbox_status, saga_status;'
   outbox_status | saga_status | count
   --------------+-------------+-------
   COMPLETED     | SUCCEEDED   | 1

$ psql -c 'SELECT outbox_status, saga_status, count(*) 
           FROM "order".restaurant_approval_outbox GROUP BY outbox_status, saga_status;'
   outbox_status | saga_status | count
   --------------+-------------+-------
   COMPLETED     | SUCCEEDED   | 1
```

Cả 2 outbox đều terminal SUCCEEDED + COMPLETED → cleaner đêm xoá hết.

## Scenario 2 — Order service crash giữa save Order và save outbox

Đây là **scenario test pattern thực sự**. Trước phase-9 sẽ dual-write fail.

Inject crash bằng cách:
1. Sửa code `OrderCreateCommandHandler` thêm `throw new RuntimeException("simulated crash")` giữa `persistOrder` và `savePaymentOutboxMessage`.
2. Build lại, POST order.

Kết quả:
```text
[Order] Order created with id: abc-123
[Order] Order is saved with id: abc-123
[Order] RuntimeException: simulated crash
```

DB check:
```text
$ psql -c 'SELECT * FROM "order".orders WHERE id=...;'   → empty
$ psql -c 'SELECT * FROM "order".payment_outbox;'         → empty
```

**Tại sao cả 2 đều empty?** Vì `@Transactional` ở command handler level. Exception → rollback toàn bộ.

So với phase-8: order đã commit, không có outbox, SAGA stuck.

Đây là **bằng chứng atomic** của Outbox Pattern.

## Scenario 3 — Kafka cluster down giữa flow

```text
1. Start tất cả service + Kafka.
2. POST order → Order created, payment_outbox INSERT STARTED.
3. Trước khi scheduler kịp publish (5s), stop tất cả 3 broker:
   docker stop kafka-broker-1 kafka-broker-2 kafka-broker-3
4. Scheduler chạy → try publish → fail → callback set FAILED.
5. Đợi 1 phút.
6. Start lại 3 broker:
   docker start kafka-broker-1 kafka-broker-2 kafka-broker-3
7. Wait 5s — scheduler chạy lại.
```

Vấn đề: scheduler query `WHERE outbox_status='STARTED'`. Sau khi publish fail ở bước 4, status đã thành `FAILED`. Scheduler **không** pick lại.

Fix: thêm retry logic. Hoặc đơn giản hơn — query include `FAILED`:

```java
@Query("SELECT po FROM PaymentOutboxEntity po " +
       "WHERE po.type = ?1 " +
       "AND po.outboxStatus IN (?2) " +
       "AND po.sagaStatus IN ?3")
Optional<List<PaymentOutboxEntity>> findByTypeAndOutboxStatusAndSagaStatus(
    String type, OutboxStatus[] outboxStatuses, SagaStatus... sagaStatus);
```

Khoá học để khá đơn giản (chỉ STARTED). Production nên thêm retry mechanism với:
- Exponential backoff.
- Max retries → đẩy vào dead-letter table.
- Alert ops khi outbox FAILED quá lâu.

## Scenario 4 — Order service restart giữa flow

1. POST order → Order + payment_outbox INSERT STARTED.
2. Trước khi scheduler publish (đợi 3s), kill Order service:
   ```text
   kill -9 <order-pid>
   ```
3. Restart Order:
   ```text
   java -jar order-container.jar
   ```
4. Sau 30s `initialDelay` + 5s `fixedRate` → scheduler chạy → pick STARTED outbox → publish.
5. SAGA tiếp tục bình thường.

**Quan trọng**: Order restart **không mất** message. Outbox table có nó. Đây là **durability** của Outbox.

So với phase-8: crash giữa publish → message mất → SAGA stuck mãi mãi.

## Scenario 5 — Duplicate Kafka delivery

Kafka có thể deliver message 2 lần (at-least-once). Test:

1. POST order → Payment consume → INSERT Payment row + INSERT order_outbox row.
2. Manually retry Kafka message bằng cách reset consumer offset:
   ```text
   docker exec -it kafka-broker-1 kafka-consumer-groups \
     --bootstrap-server kafka-broker-1:9092 \
     --group payment-topic-consumer \
     --reset-offsets --to-offset 0 \
     --topic payment-request --execute
   ```
3. Payment service consume lần 2.

Listener:
```java
try {
    paymentRequestMessageListener.completePayment(...);
} catch (DataAccessException e) {
    if (isUniqueViolation(e)) {
        log.error("Caught unique constraint exception for order id: {}", avroModel.getOrderId());
    }
}
```

UNIQUE violation ở:
- `payment.payments(order_id)`.
- `payment.order_outbox(saga_id, payment_status, saga_status)`.

→ Listener catch, skip silently. **DB không lệch**, không double-charge.

## Scenario 6 — Multi-instance Order race

1. Chạy 2 Order service instance song song:
   ```text
   java -Dserver.port=8181 -jar order-container.jar
   java -Dserver.port=8281 -jar order-container.jar
   ```
2. POST order vào instance 1 → INSERT outbox.
3. Cả 2 scheduler poll → cả 2 thấy row STARTED.
4. Cả 2 publish Kafka → 2 message duplicate trên topic.
5. Cả 2 update outbox → 1 thành công, 1 fail `OptimisticLockingException`.

Payment consume 2 message → 1 thành công, 1 fail UNIQUE constraint.

Kết quả: Payment chỉ xử lý 1 lần. Đảm bảo bởi optimistic locking + UNIQUE constraint.

> Production nên dùng **distributed lock** (Redis Redlock) trước khi scheduler pick → giảm waste publish.

## Monitoring outbox health

Production cần dashboard:

```sql
-- pending outbox quá lâu (alert)
SELECT type, count(*) 
  FROM "order".payment_outbox 
 WHERE outbox_status = 'STARTED' 
   AND created_at < now() - interval '5 minutes'
 GROUP BY type;

-- FAILED outbox (alert)
SELECT * FROM "order".payment_outbox WHERE outbox_status = 'FAILED';

-- saga stuck (alert)
SELECT saga_id, saga_status, created_at FROM "order".payment_outbox 
 WHERE saga_status IN ('STARTED', 'PROCESSING', 'COMPENSATING') 
   AND created_at < now() - interval '1 hour';
```

Grafana + Prometheus query Postgres → alert PagerDuty.

## Performance benchmark phase-8 vs phase-9

| Metric | Phase-8 | Phase-9 |
|---|---|---|
| SAGA latency (happy path) | ~3-5s | ~15-25s (do polling 5s × 4 step) |
| Throughput (1 instance) | ~50 orders/s | ~30 orders/s (DB outbox write overhead) |
| Data loss khi service crash | Có thể | Không bao giờ |
| Duplicate handling | Phụ thuộc UNIQUE constraint mức DB | UNIQUE + idempotent check outbox + optimistic lock |
| Recovery khi Kafka tạm down | Manual reset | Tự retry (cần FAILED handling) |

Trade-off **rõ ràng**: latency + throughput xuống, đổi lấy correctness + recovery automatic.

## Tóm tắt bài 39

- Happy path SAGA hoàn thành ~20s (do polling).
- Crash giữa save Order + save outbox → cả 2 rollback (atomic).
- Kafka cluster tạm down → outbox status FAILED, cần retry logic production.
- Order restart giữa flow → outbox table giữ message, scheduler resume tự nhiên.
- Duplicate Kafka delivery → UNIQUE constraint + idempotent check chống double-process.
- Multi-instance race → optimistic locking đảm bảo 1 thắng, 1 retry.
- Production cần monitor outbox lag + FAILED count → alert ops.

**Bài kế tiếp** → [Bài 40: Outbox checklist + summary phase 9](08-outbox-summary.md)
