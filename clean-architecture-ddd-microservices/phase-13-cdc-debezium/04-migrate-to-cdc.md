# Bài 56: Migrate Order service từ polling sang CDC

> Debezium chạy + connector publish event. Bây giờ ta tắt scheduler trong app, refactor consumer cho topic mới của Debezium. Bài này diff cụ thể: code nào xoá, code nào sửa, behavior thay đổi gì.

## Strategy migration

Có 2 cách:

### Big bang
Tắt scheduler + đổi topic name listener cùng lúc → cutover ngay. Risk: lệch trong khoảnh khắc switch.

### Dual-publish (an toàn)
1. Bật Debezium → publish vào topic `OrderProcessingSaga_request`.
2. Listener Payment service consume **cả 2** topic (cũ `payment-request` + mới `OrderProcessingSaga_request`).
3. Sau khi verify Debezium ổn → tắt scheduler.
4. Cập nhật listener Payment chỉ consume mới.
5. Xoá topic cũ.

Khoá học chọn dual-publish dạng đơn giản: refactor consumer trước, sau khi pass test mới tắt scheduler.

## Refactor consumer Payment service

Trước (polling):

```yaml
payment-service:
  payment-request-topic-name: payment-request

@KafkaListener(topics = "${payment-service.payment-request-topic-name}")
```

Sau (CDC):

```yaml
payment-service:
  payment-request-topic-name: OrderProcessingSaga_request
```

**Listener code không đổi**. Chỉ topic name khác.

Tương tự cho:
- Restaurant: `payment-response` → `OrderPaymentResponse_request`.
- Order consume `payment-response` → topic name thay tương ứng.

## Message format adapt

Polling publish Avro `PaymentRequestAvroModel`. CDC publish **JSON** từ payload column.

2 lựa chọn:

### Lựa chọn A: Đổi consumer sang JSON

Change deserializer:
```yaml
kafka-consumer-config:
  value-deserializer: org.springframework.kafka.support.serializer.JsonDeserializer
  json-deserializer-spring-json-trusted-packages: com.food.ordering.system.*
```

Update listener:
```java
@KafkaListener(...)
public void receive(@Payload List<PaymentRequestModel> messages, ...) {
    // PaymentRequestModel = plain POJO JSON
}
```

### Lựa chọn B: Giữ Avro, CDC publish Avro

Outbox payload column = Avro binary thay vì JSON.

Debezium SMT có Avro converter — nhưng phức tạp setup. Khoá học chọn A (JSON).

## Refactor scheduler

Tắt scheduler. Khoá học giữ class scheduler nhưng comment `@Scheduled`:

```java
@Component
@RequiredArgsConstructor
public class PaymentOutboxScheduler implements OutboxScheduler {
    // ...
    
    @Override
    // @Scheduled(fixedRateString = "...")     // commented: replaced by Debezium CDC
    @Transactional
    public void processOutboxMessage() {
        // legacy method, kept for fallback
    }
}
```

Hoặc xoá hoàn toàn — khoá học giữ vì comparison test bài 57.

## Cleaner scheduler — vẫn cần

Debezium publish event sau khi outbox INSERT. Nhưng outbox status không update (Debezium không write). Outbox table phình.

Cleaner scheduler vẫn chạy, xoá row cũ định kỳ:

```java
@Override
@Scheduled(cron = "@midnight")
public void processOutboxMessage() {
    paymentOutboxHelper.deletePaymentOutboxMessageByCreatedAtBefore(
        ZonedDateTime.now().minusDays(7));      // xoá row cũ hơn 7 ngày
}
```

Thay vì query theo `outbox_status=COMPLETED`, query theo `created_at < N days ago`. Vì Debezium không update status, status mãi STARTED.

## Idempotency với CDC

Polling có idempotency check qua outbox status. CDC không.

Vẫn cần idempotency ở consumer:
- DB UNIQUE constraint.
- Idempotent design business logic.

Payment listener (giữ nguyên từ phase-9):
```java
try {
    paymentRequestMessageListener.completePayment(...);
} catch (DataIntegrityViolationException e) {
    if (isUniqueViolation(e)) {
        log.error("Caught unique constraint exception for order id: {}", ...);
        // skip
    }
}
```

UNIQUE constraint payment table catch duplicate. Hoặc check outbox table phía Payment cho idempotent.

## Schema history topic

Debezium dùng `schema-changes.<connector>` topic để track schema evolution. Auto tạo. Không cần care cho dev.

```text
$ docker exec -it kafka-broker-1 kafka-topics \
    --bootstrap-server localhost:9092 --list | grep schema-changes

schema-changes.order
schema-changes.payment
schema-changes.restaurant
schema-changes.customer
```

## Application code change

Chi tiết file đổi:

### `application.yml`
```diff
- payment-request-topic-name: payment-request
+ payment-request-topic-name: OrderProcessingSaga_request
```

### `kafka-consumer-config`
```diff
- value-deserializer: io.confluent.kafka.serializers.KafkaAvroDeserializer
+ value-deserializer: org.springframework.kafka.support.serializer.JsonDeserializer
+ properties:
+   spring.json.trusted.packages: com.food.ordering.system.*
```

### Listener
```java
// Before
public void receive(@Payload List<PaymentRequestAvroModel> messages, ...) {

// After
public void receive(@Payload List<OrderPaymentEventPayload> messages, ...) {
```

`OrderPaymentEventPayload` chính là class payload đã định nghĩa ở phase-9 cho outbox.

### Mapper
```java
// Before
public PaymentRequest paymentRequestAvroModelToPaymentRequest(PaymentRequestAvroModel avroModel) {
    return PaymentRequest.builder()
        .orderId(avroModel.getOrderId().toString())
        ...
}

// After
public PaymentRequest paymentEventPayloadToPaymentRequest(OrderPaymentEventPayload payload) {
    return PaymentRequest.builder()
        .orderId(payload.getOrderId())
        ...
}
```

Field name primitives now — không Avro `CharSequence.toString()` lằng nhằng.

### Bỏ Avro dependency consumer (optional)

Order service vẫn dùng Avro cho phía publish (payload column JSON, nhưng Avro model còn dùng nội bộ). Có thể giữ Avro deps để consistent.

## Producer phía Order — vẫn dùng outbox

Order vẫn INSERT outbox như cũ. Application code phía Order **không đổi**:
- Command handler vẫn `paymentOutboxHelper.savePaymentOutboxMessage(...)`.
- Scheduler publisher có thể tắt — Debezium làm thay.

Lợi: code application Order giữ nguyên, chỉ thay infrastructure (Debezium thay scheduler).

## Test end-to-end với CDC

1. Khởi Postgres + Kafka + Schema Registry + Kafka Connect.
2. Submit 5 Debezium connector.
3. Khởi 4 service (scheduler tắt, listener đã đổi topic name).
4. POST order.

Log Order:
```text
[Order] Order created with id: abc-123
[Order] OrderPaymentOutboxMessage saved with outbox id: xyz-456
```

Không có log scheduler. Sau ~100ms:

Log Debezium:
```text
[Kafka Connect] Sending 1 records to Kafka
```

Log Payment (vài ms sau):
```text
[Payment] Processing payment for order id: ord-1
[Payment] Payment is initiated for order id: ord-1
```

SAGA hoàn thành ~3-5 giây (vs 15-25 giây polling). Latency giảm 4-5 lần.

## DB state

Outbox table tích luỹ row STARTED (Debezium không update):
```text
$ psql -c 'SELECT outbox_status, count(*) FROM "order".payment_outbox GROUP BY outbox_status;'
   outbox_status | count
   ---------------+-------
   STARTED        | 50
```

Cleaner scheduler hàng ngày xoá row cũ > 7 ngày → bảng không phình mãi.

## Lưu ý: outbox status không còn ý nghĩa

Với CDC, không có khái niệm "STARTED → COMPLETED". Outbox chỉ là **trigger** cho CDC, không phải state machine.

Bạn có thể **bỏ field outbox_status** hoàn toàn nếu chắc CDC. Khoá học giữ vì fallback dùng được scheduler nếu Debezium down.

## Bẫy thường gặp khi migrate

| Bẫy | Sửa |
|---|---|
| Đổi listener trước Debezium publish | Listener stuck wait topic không tồn tại. Submit connector trước. |
| Forget DROP replication slot cũ | Disk fill. Drop manual. |
| Schema Registry trustpackage không có | JsonDeserializer fail. Set `spring.json.trusted.packages=*`. |
| Outbox row stuck STARTED → consumer panic | Outbox chỉ trigger, status không ý nghĩa với CDC. Bỏ idempotent check theo status. |
| Consumer cũ vẫn chạy → 2 message duplicate (Kafka + Debezium) | Tắt scheduler hoàn toàn trước cutover. |
| Topic name trong `route.topic.replacement` không match listener | Match prefix/suffix. |
| Debezium crash → SAGA stuck | Restart connector. Slot vẫn track offset → resume từ điểm crash. |
| Postgres restart → slot có thể mất | Set `wal_keep_size` để giữ WAL đủ lâu. |

## Tóm tắt bài 56

- Migrate gồm 2 phần: refactor topic name trong consumer + tắt scheduler producer.
- Listener code đổi từ Avro sang JSON payload, mapper update field name.
- Outbox status không còn nghĩa với CDC — bỏ idempotent check theo status.
- Cleaner scheduler vẫn chạy, query theo `created_at` thay `outbox_status`.
- Test: SAGA hoàn thành 3-5 giây thay 15-25 giây — 4-5 lần nhanh hơn.
- Producer code Order không đổi — Debezium plug thay scheduler.

**Bài kế tiếp** → [Bài 57: Benchmark polling vs CDC + lessons learned](05-benchmark-comparison.md)
