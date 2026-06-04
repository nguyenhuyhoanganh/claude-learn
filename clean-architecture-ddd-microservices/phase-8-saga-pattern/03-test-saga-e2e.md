# Bài 32: Test end-to-end SAGA — happy path và failure scenarios

> Code đã xong. Bài này test thực sự — chạy 3 service + Kafka + Postgres, gửi request từ Postman, theo dõi log/DB qua từng bước, deliberately inject failure để xem compensation chạy đúng.

## Setup môi trường test

```text
Terminal 1: Kafka stack
  cd infrastructure/docker-compose
  ./start-kafka.sh

Terminal 2: Postgres + schema
  docker compose -f postgres.yml up -d
  psql -h localhost -U postgres -d postgres -f init-schema.sql
  # seed customers, restaurants, products, credit_entry

Terminal 3: Order service
  cd order-service/order-container && java -jar target/order-container.jar

Terminal 4: Payment service
  cd payment-service/payment-container && java -jar target/payment-container.jar

Terminal 5: Restaurant service
  cd restaurant-service/restaurant-container && java -jar target/restaurant-container.jar
```

5 terminal mở song song. Kafka UI ở `localhost:9000` để inspect topic.

## Scenario 1 — Happy path APPROVED

```text
POST http://localhost:8181/orders
Body: {
  "customerId": "d215b5f8-0249-4dc5-89a3-51fd148cfb41",
  "restaurantId": "d215b5f8-0249-4dc5-89a3-51fd148cfb45",
  "address": { "street": "1 Le Duan", "postalCode": "100000", "city": "Hanoi" },
  "price": 50.00,
  "items": [
    {"productId": "d215b5f8-0249-4dc5-89a3-51fd148cfb48",
     "quantity": 1, "price": 50.00, "subTotal": 50.00}
  ]
}
```

### Log tuần tự

```text
[Order]  Order is created with id: abc-123
[Order]  Sending message to payment-request topic
[Payment] Received payment request for order id: abc-123
[Payment] Payment is initiated for order id: abc-123
[Payment] Publishing payment event with payment id: pay-456
[Payment] Sent to payment-response (COMPLETED)
[Order]  Processing successful payment for order id: abc-123
[Order]  Order with id: abc-123 is paid
[Order]  Publishing OrderPaidEvent → restaurant-approval-request
[Restaurant] Received restaurant approval request for order: abc-123
[Restaurant] Order is approved for order id: abc-123
[Restaurant] Sent to restaurant-approval-response (APPROVED)
[Order]  Processing approved restaurant response for order id: abc-123
[Order]  Order with id: abc-123 is approved
```

### DB check

```text
$ psql -c 'SELECT id, order_status, failure_messages FROM "order".orders;'
   id      | order_status | failure_messages
   --------+-------------+------------------
   abc-123 | APPROVED    | (empty)

$ psql -c 'SELECT order_id, status FROM "payment".payments;'
   order_id | status
   ---------+-----------
   abc-123  | COMPLETED

$ psql -c 'SELECT customer_id, total_credit_amount FROM "payment".credit_entry;'
   customer_id | total_credit_amount
   ------------+--------------------
   d215...     | 950.00

$ psql -c 'SELECT order_id, status FROM "restaurant".order_approval;'
   order_id | status
   ---------+----------
   abc-123  | APPROVED
```

State nhất quán xuyên 3 schema. SAGA hoàn thành đúng.

## Scenario 2 — Payment FAILED (insufficient credit)

Update credit về 0:
```sql
UPDATE "payment".credit_entry SET total_credit_amount = 0 WHERE customer_id = 'd215...';
```

POST order → response PENDING.

### Log

```text
[Order]  Order is created with id: def-789
[Order]  Sending to payment-request
[Payment] Received payment request for order id: def-789
[Payment] Customer with id: d215... doesn't have enough credit for payment!
[Payment] Payment initiation is failed for order id: def-789
[Payment] Sent to payment-response (FAILED) with failureMessages
[Order]  Processing unsuccessful payment for order id: def-789
[Order]  Cancelling order with id: def-789
[Order]  Order with id: def-789 is cancelled
```

GET `/orders/{trackingId}`:
```json
{
  "orderTrackingId": "def-789",
  "orderStatus": "CANCELLED",
  "failureMessages": [
    "Customer with id=d215... doesn't have enough credit for payment!"
  ]
}
```

### DB check
```text
$ psql -c 'SELECT id, order_status, failure_messages FROM "order".orders WHERE id=...;'
   id      | order_status | failure_messages
   --------+--------------+--------------------------
   def-789 | CANCELLED    | Customer ... doesn't ...

$ psql -c 'SELECT order_id, status FROM "payment".payments WHERE order_id=...;'
   order_id | status
   ---------+--------
   def-789  | FAILED       (payment row vẫn được lưu để audit)

$ psql -c 'SELECT customer_id, total_credit_amount FROM "payment".credit_entry;'
   customer_id | total_credit_amount
   ------------+--------------------
   d215...     | 0.00                (không thay đổi — fail trước khi trừ)
```

## Scenario 3 — Restaurant REJECT (compensation full)

Set product unavailable:
```sql
UPDATE "restaurant".products SET available = false 
  WHERE id = 'd215b5f8-0249-4dc5-89a3-51fd148cfb48';
REFRESH MATERIALIZED VIEW "order".order_restaurant_m_view;
```

Update credit về 1000 (đủ):
```sql
UPDATE "payment".credit_entry SET total_credit_amount = 1000.00;
```

POST order với product unavailable → response PENDING.

### Log

```text
[Order]  Order is created with id: ghi-001
[Order]  Sending to payment-request
[Payment] Payment is initiated for order id: ghi-001 (price 50, credit 1000 → OK)
[Payment] Sent to payment-response (COMPLETED)
[Order]  Order with id: ghi-001 is paid
[Order]  Publishing OrderPaidEvent → restaurant-approval-request

[Restaurant] Received approval request for order id: ghi-001
[Restaurant] Product with id: d215b5f8-...-cb48 is not available
[Restaurant] Order is rejected for order id: ghi-001
[Restaurant] Sent to restaurant-approval-response (REJECTED) with failureMessages

[Order]  Processing rejected restaurant response for order id: ghi-001
[Order]  Cancelling order payment for order id: ghi-001
[Order]  Order status: CANCELLING
[Order]  Publishing OrderCancelledEvent → payment-request (type=CANCELLED)

[Payment] Received payment rollback event for order id: ghi-001
[Payment] Payment is cancelled for order id: ghi-001
[Payment] Sent to payment-response (CANCELLED)

[Order]  Processing cancelled payment for order id: ghi-001
[Order]  Cancelling order with id: ghi-001
[Order]  Order with id: ghi-001 is cancelled
```

10 dòng log → đúng theo flow compensation đã thiết kế ở bài 31.

### DB check
```text
$ psql -c 'SELECT id, order_status, failure_messages FROM "order".orders WHERE id=...;'
   id      | order_status | failure_messages
   --------+--------------+----------------------------
   ghi-001 | CANCELLED    | Product with id: ... is not available

$ psql -c 'SELECT order_id, status FROM "payment".payments WHERE order_id=...;'
   order_id | status
   ---------+-----------
   ghi-001  | CANCELLED

$ psql -c 'SELECT customer_id, total_credit_amount FROM "payment".credit_entry;'
   customer_id | total_credit_amount
   ------------+--------------------
   d215...     | 1000.00                 ← refund đầy đủ (trừ 50 rồi cộng lại 50)

$ psql -c 'SELECT customer_id, amount, type FROM "payment".credit_history;'
   customer_id | amount | type
   ------------+--------+--------
   d215...     | 50.00  | DEBIT
   d215...     | 50.00  | CREDIT     ← row mới — refund

$ psql -c 'SELECT order_id, status FROM "restaurant".order_approval;'
   order_id | status
   ---------+----------
   ghi-001  | REJECTED
```

Tất cả state nhất quán + audit trail credit_history đầy đủ.

## Scenario 4 — Kafka broker tạm chết (resilience test)

Stop 1 broker giữa luồng:
```text
docker stop kafka-broker-1
```

Kafka topic có replication factor 3 → broker 2/3 vẫn serve. SAGA tiếp tục.

Stop tất cả broker → producer pending, consumer stop. Tất cả service log:
```text
[Order] Error sending PaymentRequestAvroModel ... Producer: NetworkException
```

Restart broker → resume tự nhiên. Message pending được flush.

**Kết luận**: Kafka cluster down toàn phần = SAGA stuck. Phase-9 Outbox sẽ giải — message vẫn nằm trong DB, sẽ publish khi Kafka up trở lại.

## Scenario 5 — Service Order crash giữa flow

Phase-8 chưa có Outbox → nếu Order crash giữa lúc "đã commit Order PAID" và "publish OrderPaidEvent → restaurant", **message mất**. Restaurant không bao giờ nhận. SAGA stuck.

```text
[Order]  Order is paid
        ↓ DB commit OK
[Order]  Publishing OrderPaidEvent ← CRASH HERE
        ↓ message KHÔNG đi.

Restart Order:
   không có cơ chế re-publish — Order vẫn ở PAID forever.
```

Đây chính là **dual-write problem** → phase-9 Outbox vá triệt để.

## Monitoring và debug

### Inspect Kafka topic
```text
# Kafka UI: http://localhost:9000 → Topics → payment-request → Messages
# CLI:
docker exec -it kafka-broker-1 kafka-console-consumer \
  --bootstrap-server kafka-broker-1:9092 \
  --topic payment-request \
  --from-beginning \
  --max-messages 10
```

### Inspect consumer group offset
```text
docker exec -it kafka-broker-1 kafka-consumer-groups \
  --bootstrap-server kafka-broker-1:9092 \
  --describe --group payment-topic-consumer

GROUP                  TOPIC            PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG
payment-topic-consumer payment-response 0          12              12              0
                                         1          8               8               0
                                         2          15              15              0
```

LAG = 0 → consumer caught up.

### Trace SAGA bằng orderId

Mọi log đều có `orderId`. Grep:
```text
$ kubectl logs order-service | grep "abc-123"   # K8s sau phase-11
hoặc
$ grep "abc-123" order-service.log
```

Phase-9 thêm `sagaId` để trace cross-service tốt hơn.

## Bài học rút ra

1. **SAGA chạy được không nghĩa là production ready**. Chưa có:
   - Idempotent đầy đủ (chỉ có UNIQUE constraint mức DB).
   - Atomicity giữa save + publish (dual-write).
   - Retry mechanism khi Kafka down.
   - Distributed tracing.
2. **Compensation phức tạp hơn ta nghĩ** — bài 32 mới 1 nhánh reject. Production thường có 5-10 nhánh failure phải handle.
3. **Visibility quan trọng** — không có log/trace, debug SAGA stuck là cơn ác mộng.

Phase-9 sẽ giải vấn đề #1 và #2 bằng Outbox + Saga state machine.

## Tóm tắt bài 32

- 3 scenario chính: APPROVED (happy), payment FAILED, restaurant REJECT (compensation full).
- Compensation full: Restaurant reject → Order CANCELLING → publish payment cancel → Payment refund → Order CANCELLED.
- DB state nhất quán xuyên 3 schema sau mỗi scenario.
- Kafka cluster mất 1 broker — SAGA vẫn chạy nhờ replication factor 3.
- Service Order crash giữa flow = dual-write problem → SAGA stuck, sẽ giải ở phase-9.
- Monitoring: log per orderId + Kafka UI + consumer group offset.

**Bài kế tiếp** → [Bài 33 (phase-9): Outbox Pattern — vá lỗ hổng dual-write](../phase-9-outbox-pattern/01-outbox-intro.md)
