# Bài 36: Outbox Scheduler — polling pattern + cleanup

> Outbox đã có message STARTED. Scheduler là **cánh tay** đọc message, publish lên Kafka, mark COMPLETED. Bài này code 2 scheduler: **publisher scheduler** (publish pending) + **cleaner scheduler** (xoá COMPLETED quá hạn).

## Interface chuẩn `OutboxScheduler`

```java
package com.food.ordering.system.outbox.scheduler;

public interface OutboxScheduler {
    void processOutboxMessage();
}
```

Marker — buộc class scheduler có method `processOutboxMessage()`.

## `PaymentOutboxScheduler` — publish pending message

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class PaymentOutboxScheduler implements OutboxScheduler {

    private final PaymentOutboxHelper paymentOutboxHelper;
    private final OrderCreatedPaymentRequestMessagePublisher publisher;

    @Override
    @Transactional
    @Scheduled(fixedRateString = "${order-service.outbox-scheduler-fixed-rate}",
               initialDelayString = "${order-service.outbox-scheduler-initial-delay}")
    public void processOutboxMessage() {
        Optional<List<OrderPaymentOutboxMessage>> outboxMessagesResponse =
            paymentOutboxHelper.getPaymentOutboxMessageByOutboxStatusAndSagaStatus(
                OutboxStatus.STARTED,
                SagaStatus.STARTED, SagaStatus.COMPENSATING);

        if (outboxMessagesResponse.isPresent() && !outboxMessagesResponse.get().isEmpty()) {
            List<OrderPaymentOutboxMessage> outboxMessages = outboxMessagesResponse.get();
            log.info("Received {} OrderPaymentOutboxMessage with ids: {}, sending to message bus!",
                outboxMessages.size(),
                outboxMessages.stream().map(om -> om.getId().toString())
                    .collect(Collectors.joining(",")));
            outboxMessages.forEach(outboxMessage ->
                publisher.publish(outboxMessage, this::updateOutboxStatus));
            log.info("{} OrderPaymentOutboxMessage sent to message bus!", outboxMessages.size());
        }
    }

    private void updateOutboxStatus(OrderPaymentOutboxMessage outboxMessage,
                                    OutboxStatus outboxStatus) {
        outboxMessage.setOutboxStatus(outboxStatus);
        paymentOutboxHelper.save(outboxMessage);
        log.info("OrderPaymentOutboxMessage is updated with outbox status: {}", outboxStatus);
    }
}
```

3 điểm:

1. **`@Scheduled` + `fixedRateString`** — Spring chạy method mỗi N ms từ config YAML.

```yaml
order-service:
  outbox-scheduler-fixed-rate: 5000           # 5 giây
  outbox-scheduler-initial-delay: 30000        # 30 giây sau startup
```

2. **`SagaStatus.STARTED, COMPENSATING`** — chỉ pick message ở 2 status này. Vì sao 2? Vì:
   - `STARTED` — message đầu tiên (Order created → publish payment request).
   - `COMPENSATING` — message rollback (Order cancelling → publish cancel payment).
   - 2 status khác — không publish (SUCCEEDED, COMPENSATED là terminal).

3. **Callback `updateOutboxStatus`** — sau khi publisher xong (success hoặc fail), gọi callback để update status. Pattern này tránh scheduler block chờ.

## Refactor `OrderCreatedPaymentRequestMessagePublisher` interface

Trước:
```java
public interface OrderCreatedPaymentRequestMessagePublisher extends DomainEventPublisher<OrderCreatedEvent> {}
```

Sau — không còn extend `DomainEventPublisher`:
```java
public interface PaymentRequestMessagePublisher {
    void publish(OrderPaymentOutboxMessage outboxMessage,
                 BiConsumer<OrderPaymentOutboxMessage, OutboxStatus> outboxCallback);
}
```

Implementation gọn:

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class PaymentRequestKafkaMessagePublisher implements PaymentRequestMessagePublisher {

    private final OrderServiceConfigData configData;
    private final KafkaProducer<String, PaymentRequestAvroModel> kafkaProducer;
    private final OrderKafkaMessageHelper kafkaMessageHelper;
    private final OrderMessagingDataMapper mapper;

    @Override
    public void publish(OrderPaymentOutboxMessage outboxMessage,
                        BiConsumer<OrderPaymentOutboxMessage, OutboxStatus> outboxCallback) {
        OrderPaymentEventPayload payload = kafkaMessageHelper.getOrderEventPayload(
            outboxMessage.getPayload(), OrderPaymentEventPayload.class);
        String sagaId = outboxMessage.getSagaId().toString();

        log.info("Received OrderPaymentOutboxMessage for order id: {} and saga id: {}",
            payload.getOrderId(), sagaId);

        try {
            PaymentRequestAvroModel avroModel = mapper.orderPaymentEventToPaymentRequestAvroModel(
                sagaId, payload);
            kafkaProducer.send(
                configData.getPaymentRequestTopicName(),
                sagaId,
                avroModel,
                kafkaMessageHelper.getKafkaCallback(
                    configData.getPaymentResponseTopicName(),
                    avroModel, outboxMessage, outboxCallback, payload.getOrderId(),
                    "PaymentRequestAvroModel"));
        } catch (Exception e) {
            log.error("Error sending PaymentRequestAvroModel for order id: {} saga id: {}",
                payload.getOrderId(), sagaId, e);
        }
    }
}
```

Callback của Kafka producer **gọi** `outboxCallback` truyền vào:

```java
public <T> ListenableFutureCallback<SendResult<String, T>> getKafkaCallback(
        String responseTopicName, T avroModel,
        OrderPaymentOutboxMessage outboxMessage,
        BiConsumer<OrderPaymentOutboxMessage, OutboxStatus> outboxCallback,
        String orderId, String avroModelName) {
    return new ListenableFutureCallback<>() {
        @Override
        public void onFailure(Throwable ex) {
            log.error("Error while sending {} message to topic {}", avroModelName, responseTopicName, ex);
            outboxCallback.accept(outboxMessage, OutboxStatus.FAILED);
        }

        @Override
        public void onSuccess(SendResult<String, T> result) {
            RecordMetadata metadata = result.getRecordMetadata();
            log.info("Successfully sent {} for order id: {} to topic {} at offset {}",
                avroModelName, orderId, metadata.topic(), metadata.offset());
            outboxCallback.accept(outboxMessage, OutboxStatus.COMPLETED);
        }
    };
}
```

- Kafka ack success → `outboxCallback(outbox, COMPLETED)` → update DB.
- Kafka ack fail → `outboxCallback(outbox, FAILED)` → update DB. Scheduler không pick lại (vì `WHERE status=STARTED`). Cần manual intervention hoặc nâng cấp logic retry.

## Cleaner Scheduler — xoá COMPLETED định kỳ

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class PaymentOutboxCleanerScheduler implements OutboxScheduler {

    private final PaymentOutboxHelper paymentOutboxHelper;

    @Override
    @Transactional
    @Scheduled(cron = "@midnight")
    public void processOutboxMessage() {
        Optional<List<OrderPaymentOutboxMessage>> outboxMessagesResponse =
            paymentOutboxHelper.getPaymentOutboxMessageByOutboxStatusAndSagaStatus(
                OutboxStatus.COMPLETED,
                SagaStatus.SUCCEEDED, SagaStatus.FAILED, SagaStatus.COMPENSATED);

        if (outboxMessagesResponse.isPresent() && !outboxMessagesResponse.get().isEmpty()) {
            List<OrderPaymentOutboxMessage> outboxMessages = outboxMessagesResponse.get();
            log.info("Received {} OrderPaymentOutboxMessage for clean-up. The payloads: {}",
                outboxMessages.size(),
                outboxMessages.stream().map(OrderPaymentOutboxMessage::getPayload)
                    .collect(Collectors.joining("\n")));

            paymentOutboxHelper.deletePaymentOutboxMessageByOutboxStatusAndSagaStatus(
                OutboxStatus.COMPLETED,
                SagaStatus.SUCCEEDED, SagaStatus.FAILED, SagaStatus.COMPENSATED);
            log.info("{} OrderPaymentOutboxMessage deleted!", outboxMessages.size());
        }
    }
}
```

Chạy mỗi ngày lúc nửa đêm. Xoá outbox row có:
- `outbox_status = COMPLETED` (đã publish thành công).
- `saga_status IN (SUCCEEDED, COMPENSATED, FAILED)` (SAGA terminal).

Đảm bảo bảng outbox không phình lớn vô hạn.

## Enable Scheduling

`OrderServiceApplication`:

```java
@EnableScheduling
@SpringBootApplication(scanBasePackages = "com.food.ordering.system")
public class OrderServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(OrderServiceApplication.class, args);
    }
}
```

`@EnableScheduling` mới activate `@Scheduled` annotations.

## Số scheduler trong toàn dự án

Mỗi outbox table cần 1 publisher scheduler + 1 cleaner scheduler. Order có 2 outbox table → 4 scheduler.

| Service | Outbox tables | Scheduler |
|---|---|---|
| Order | payment_outbox, restaurant_approval_outbox | 4 (2 publisher + 2 cleaner) |
| Payment | order_outbox (response back) | 2 |
| Restaurant | order_outbox (response back) | 2 |

Tổng: 8 scheduler trong dự án. Mỗi cái <100 dòng code, follow cùng pattern.

## Concurrency của scheduler

Mặc định Spring `@Scheduled` chạy **single-threaded**. Nếu method chạy lâu hơn `fixedRate` → tick kế tiếp đợi.

Multi-instance Order service (scale K8s):
- Mỗi instance có scheduler riêng.
- Cùng query outbox → cùng pick same row → race condition.

Giải bằng:
1. **Optimistic locking** (`@Version` ở entity) — UPDATE check version, mismatch → fail → retry.
2. **`@Lock(PESSIMISTIC_WRITE)`** trên query SELECT — lock row đến cuối transaction.
3. **Application-level lock** (Redis distributed lock).

Khoá học dùng optimistic locking (`@Version`). Khi 2 instance race, 1 thành công 1 fail, fail retry sau 5s.

## Test scheduler

POST 1 order → outbox INSERT STARTED.

Đợi 5 giây → log:
```text
INFO Received 1 OrderPaymentOutboxMessage with ids: xyz-456, sending to message bus!
INFO Successfully sent PaymentRequestAvroModel for order id: abc-123 to topic payment-request at offset 12
INFO OrderPaymentOutboxMessage is updated with outbox status: COMPLETED
```

DB check:
```text
$ psql -c "SELECT id, outbox_status, processed_at FROM \"order\".payment_outbox WHERE id='xyz-456';"
   id      | outbox_status | processed_at
   --------+----------------+---------------
   xyz-456 | COMPLETED      | 2026-06-04 ...
```

## Bẫy thường gặp

| Bẫy | Tránh bằng cách |
|---|---|
| Quên `@EnableScheduling` | Method `@Scheduled` không chạy. Add ở main class. |
| `fixedRate` quá nhỏ → chồng method | Tăng lên hoặc dùng `@Async`. |
| Multi-instance không dùng `@Version` | Race condition, message publish 2 lần. |
| Cleaner xoá nhầm row chưa terminal | Filter chính xác: `outbox_status=COMPLETED AND saga_status IN (SUCCEEDED, COMPENSATED, FAILED)`. |
| Scheduler block transaction quá lâu (publish chậm) | Tách publish ra `@Async`. Hoặc dùng Kafka producer batching. |
| Logger spam mỗi 5s "Received 0 messages" | Chỉ log khi `!isEmpty()`. |
| Scheduler chạy ngay từ giây 0 sau startup | `initialDelay` 30s để Spring khởi xong. |

## Tóm tắt bài 36

- `PaymentOutboxScheduler` chạy mỗi 5s qua `@Scheduled`, query message STARTED, publish, callback update COMPLETED/FAILED.
- `PaymentOutboxCleanerScheduler` chạy mỗi ngày, xoá message COMPLETED + saga terminal.
- Publisher interface mới: nhận `OrderPaymentOutboxMessage` + `outboxCallback` thay vì domain event.
- Kafka producer callback gọi `outboxCallback(message, COMPLETED|FAILED)` async.
- Multi-instance scale: dùng `@Version` optimistic locking để chống race.
- 8 scheduler tổng cho 3 service — pattern lặp lại nhưng đảm bảo độc lập từng outbox table.

**Bài kế tiếp** → [Bài 37: Refactor OrderPaymentSaga + OrderApprovalSaga cho Outbox](05-refactor-saga-outbox.md)
