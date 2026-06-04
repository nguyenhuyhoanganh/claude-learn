# Bài 38: Outbox cho Payment + Restaurant service

> Order đã có Outbox. Để cả SAGA atomic, Payment và Restaurant cũng cần Outbox khi publish response. Bài này áp dụng cùng pattern cho 2 service còn lại, kèm idempotency check chặt hơn.

## Payment service — outbox setup

### Schema

```sql
DROP TABLE IF EXISTS "payment".order_outbox CASCADE;

CREATE TABLE "payment".order_outbox
(
    id              uuid NOT NULL,
    saga_id         uuid NOT NULL,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL,
    processed_at    TIMESTAMP WITH TIME ZONE,
    type            character varying NOT NULL,
    payload         jsonb NOT NULL,
    outbox_status   character varying NOT NULL,
    saga_status     character varying NOT NULL,
    payment_status  character varying NOT NULL,
    version         integer NOT NULL,
    CONSTRAINT order_outbox_pkey PRIMARY KEY (id)
);

CREATE INDEX "order_outbox_saga_status"
    ON "payment".order_outbox (type, outbox_status, saga_status);

CREATE UNIQUE INDEX "order_outbox_saga_id_payment_status"
    ON "payment".order_outbox (type, saga_id, payment_status, saga_status);
```

Khác Order outbox: thêm field `payment_status` (COMPLETED/CANCELLED/FAILED) và UNIQUE bao gồm field này.

Vì sao? — 1 saga_id có thể có 2 outbox row khác `payment_status`:
- COMPLETED (forward — payment xong).
- CANCELLED (rollback — refund xong).

Cùng saga_id, khác payment_status → 2 row hợp lệ.

### Domain model + helper

```java
@Data @Builder @AllArgsConstructor
public class OrderOutboxMessage {
    private UUID id;
    private UUID sagaId;
    private ZonedDateTime createdAt;
    private ZonedDateTime processedAt;
    private String type;
    private String payload;
    private PaymentStatus paymentStatus;
    private SagaStatus sagaStatus;
    private OutboxStatus outboxStatus;
    private int version;
}

@Data @Builder @AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class OrderEventPayload {
    @JsonProperty private String paymentId;
    @JsonProperty private String customerId;
    @JsonProperty private String orderId;
    @JsonProperty private BigDecimal price;
    @JsonProperty private String createdAt;
    @JsonProperty private String paymentStatus;
    @JsonProperty private List<String> failureMessages;
}
```

Helper `OrderOutboxHelper` tương tự `PaymentOutboxHelper` của Order, find/save/delete với type `PaymentSagaSubsection`.

## Refactor `PaymentRequestKafkaListener` — kiểm tra outbox + idempotency

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class PaymentRequestKafkaListener implements KafkaConsumer<PaymentRequestAvroModel> {

    private final PaymentRequestMessageListener paymentRequestMessageListener;
    private final PaymentMessagingDataMapper mapper;

    @Override
    @KafkaListener(...)
    public void receive(@Payload List<PaymentRequestAvroModel> messages, ...) {
        messages.forEach(avroModel -> {
            try {
                if (PaymentOrderStatus.PENDING == avroModel.getPaymentOrderStatus()) {
                    log.info("Processing payment for order id: {}", avroModel.getOrderId());
                    paymentRequestMessageListener.completePayment(
                        mapper.paymentRequestAvroModelToPaymentRequest(avroModel));
                } else if (PaymentOrderStatus.CANCELLED == avroModel.getPaymentOrderStatus()) {
                    log.info("Cancelling payment for order id: {}", avroModel.getOrderId());
                    paymentRequestMessageListener.cancelPayment(
                        mapper.paymentRequestAvroModelToPaymentRequest(avroModel));
                }
            } catch (DataAccessException e) {
                if (isUniqueViolation(e)) {
                    log.error("Caught unique constraint exception for order id: {}", avroModel.getOrderId());
                    // Duplicate — đã xử lý, skip silently
                } else {
                    throw new PaymentApplicationServiceException(...);
                }
            }
        });
        acknowledgment.acknowledge();
    }
}
```

UNIQUE violation = idempotent skip.

## Refactor `PaymentRequestMessageListenerImpl` — INSERT outbox

```java
@Slf4j
@Service
@Validated
@RequiredArgsConstructor
public class PaymentRequestMessageListenerImpl implements PaymentRequestMessageListener {

    private final PaymentRequestHelper paymentRequestHelper;
    private final OrderOutboxHelper orderOutboxHelper;
    private final PaymentResponseMessagePublisher paymentResponseMessagePublisher;

    @Override
    public void completePayment(PaymentRequest paymentRequest) {
        // 1. Idempotent: check outbox đã có chưa
        if (publishIfOutboxMessageProcessedForPayment(paymentRequest, PaymentStatus.COMPLETED)) {
            log.info("An outbox message with saga id: {} is already saved", paymentRequest.sagaId());
            return;
        }

        log.info("Received PaymentRequest with sagaId: {}", paymentRequest.sagaId());
        PaymentEvent event = paymentRequestHelper.persistPayment(paymentRequest);
        // 2. INSERT outbox response (cùng transaction với DB save trong persistPayment)
        orderOutboxHelper.saveOrderOutboxMessage(
            paymentMessagingDataMapper.paymentEventToOrderEventPayload(event),
            event.getPayment().getPaymentStatus(),
            getSagaStatus(event.getPayment().getPaymentStatus()),
            OutboxStatus.STARTED,
            UUID.fromString(paymentRequest.sagaId()));
    }

    @Override
    public void cancelPayment(PaymentRequest paymentRequest) {
        if (publishIfOutboxMessageProcessedForPayment(paymentRequest, PaymentStatus.CANCELLED)) {
            log.info("An outbox message with saga id: {} is already saved", paymentRequest.sagaId());
            return;
        }
        PaymentEvent event = paymentRequestHelper.persistCancelPayment(paymentRequest);
        orderOutboxHelper.saveOrderOutboxMessage(
            paymentMessagingDataMapper.paymentEventToOrderEventPayload(event),
            event.getPayment().getPaymentStatus(),
            getSagaStatus(event.getPayment().getPaymentStatus()),
            OutboxStatus.STARTED,
            UUID.fromString(paymentRequest.sagaId()));
    }

    private boolean publishIfOutboxMessageProcessedForPayment(PaymentRequest paymentRequest,
                                                              PaymentStatus paymentStatus) {
        Optional<OrderOutboxMessage> orderOutboxMessage =
            orderOutboxHelper.getCompletedOrderOutboxMessageBySagaIdAndPaymentStatus(
                UUID.fromString(paymentRequest.sagaId()), paymentStatus);
        if (orderOutboxMessage.isPresent()) {
            paymentResponseMessagePublisher.publish(orderOutboxMessage.get(),
                orderOutboxHelper::updateOutboxStatus);
            return true;
        }
        return false;
    }

    private SagaStatus getSagaStatus(PaymentStatus paymentStatus) {
        return switch (paymentStatus) {
            case COMPLETED -> SagaStatus.SUCCEEDED;
            case CANCELLED -> SagaStatus.COMPENSATED;
            case FAILED    -> SagaStatus.FAILED;
        };
    }
}
```

`publishIfOutboxMessageProcessedForPayment` là **idempotent + re-publish** mechanism:
- Nếu outbox đã có row COMPLETED (đã publish trước đó) → re-publish lần nữa (Kafka có thể không nhận lần trước) → return true (skip processing).
- Nếu chưa có outbox → return false → tiếp tục process bình thường.

## `PaymentResponseMessagePublisher` (phía Payment)

Tương tự `PaymentRequestMessagePublisher` của Order — nhận `OrderOutboxMessage` + callback:

```java
public interface PaymentResponseMessagePublisher {
    void publish(OrderOutboxMessage orderOutboxMessage,
                 BiConsumer<OrderOutboxMessage, OutboxStatus> outboxCallback);
}
```

Implementation Kafka publish lên `payment-response-topic`.

## Payment outbox scheduler

```java
@Component
@RequiredArgsConstructor
public class PaymentOutboxScheduler implements OutboxScheduler {

    private final OrderOutboxHelper orderOutboxHelper;
    private final PaymentResponseMessagePublisher publisher;

    @Override
    @Transactional
    @Scheduled(fixedRateString = "${payment-service.outbox-scheduler-fixed-rate}",
               initialDelayString = "${payment-service.outbox-scheduler-initial-delay}")
    public void processOutboxMessage() {
        Optional<List<OrderOutboxMessage>> outboxMessagesResponse =
            orderOutboxHelper.getOrderOutboxMessageByOutboxStatus(OutboxStatus.STARTED);

        if (outboxMessagesResponse.isPresent() && !outboxMessagesResponse.get().isEmpty()) {
            List<OrderOutboxMessage> outboxMessages = outboxMessagesResponse.get();
            log.info("Received {} OrderOutboxMessage", outboxMessages.size());
            outboxMessages.forEach(om -> publisher.publish(om, orderOutboxHelper::updateOutboxStatus));
        }
    }
}
```

Đơn giản hơn Order scheduler vì Payment outbox chỉ 1 type.

## Restaurant service — pattern tương tự

Schema `restaurant.order_outbox`, model `OrderOutboxMessage`, helper, listener refactor, scheduler. Cấu trúc giống Payment.

Khác Payment ở `Order_status` instead of `payment_status`:

```sql
CREATE UNIQUE INDEX "order_outbox_saga_id_approval_status"
    ON "restaurant".order_outbox (type, saga_id, approval_status, saga_status);
```

`approval_status` = APPROVED/REJECTED.

## Listener phía Order — phải đọc sagaId từ message

Kafka response message giờ có sagaId. Order listener phải pass đúng cho SAGA step:

```java
@KafkaListener(...)
public void receive(@Payload List<PaymentResponseAvroModel> messages, ...) {
    messages.forEach(avroModel -> {
        try {
            if (PaymentStatus.COMPLETED == avroModel.getPaymentStatus()) {
                paymentResponseMessageListener.paymentCompleted(
                    mapper.paymentResponseAvroModelToPaymentResponse(avroModel));
            } else if (PaymentStatus.CANCELLED == avroModel.getPaymentStatus()
                    || PaymentStatus.FAILED == avroModel.getPaymentStatus()) {
                paymentResponseMessageListener.paymentCancelled(
                    mapper.paymentResponseAvroModelToPaymentResponse(avroModel));
            }
        } catch (OptimisticLockingFailureException e) {
            log.error("Caught optimistic locking exception in PaymentResponseKafkaListener for order id: {}",
                avroModel.getOrderId());
            // Race condition với scheduler khác — skip, scheduler sẽ retry
        } catch (OrderNotFoundException e) {
            log.error("No order found for order id: {}", avroModel.getOrderId());
        }
    });
    acknowledgment.acknowledge();
}
```

`OptimisticLockingFailureException` xảy ra khi 2 thread cùng update Order — listener và scheduler chẳng hạn. Skip silently → 1 thread thắng, 1 thread retry.

## Tổng kết kiến trúc Outbox sau phase-9

```text
                    ┌──── Order service ─────┐
                    │ orders + outbox tables  │
                    │   payment_outbox        │
                    │   approval_outbox       │
                    │                          │
   REST ───POST──►  │  Helper save Order +    │
                    │  INSERT outbox          │
                    │  (1 transaction)         │
                    │       │                  │
                    │       ▼                  │
                    │  Scheduler poll 5s      │ ──Kafka──►  Payment Service
                    │  publish → Kafka          │             │
                    │  callback update         │             │  Helper save Payment +
                    │  COMPLETED                │             │  INSERT order_outbox
                    │                          │             │  (1 transaction)
                    │ ◄── consume response ────┼─Kafka──     │       │
                    │  Saga.process            │             │       ▼
                    │  update outbox           │             │  Scheduler publish
                    │  INSERT next outbox      │             │  → Kafka response
                    └────────────────────────┘             └────────────────────┘
                                                                     │
                                                                     ▼
                                                              Restaurant Service
                                                                  (tương tự)
```

Tất cả mũi tên DB ↔ outbox đều **trong 1 transaction**. Mũi tên Kafka là eventual (qua scheduler).

## Bẫy thường gặp

| Bẫy | Tránh bằng cách |
|---|---|
| Listener không idempotent check outbox | Duplicate → DB lệch |
| UNIQUE constraint outbox không bao gồm payment_status / approval_status | Forward + rollback cùng saga sẽ conflict |
| Scheduler outbox chạy quá tần suất | Quá tải DB |
| Outbox không clean → bảng phình | Cleaner scheduler chạy hàng ngày |
| 2 service cùng update Order/Payment qua optimistic lock | Hợp lệ — 1 thắng, 1 retry. Đừng panic. |

## Tóm tắt bài 38

- Payment + Restaurant cùng pattern: schema outbox, model, helper, listener refactor, scheduler.
- Payment outbox UNIQUE bao gồm `payment_status` để cho phép forward + rollback cùng sagaId.
- `publishIfOutboxMessageProcessedForPayment` idempotent + re-publish nếu Kafka trước đó miss.
- `OptimisticLockingFailureException` ở listener Order là OK — race với scheduler, retry tự nhiên.
- Sau phase-9: 4 outbox table, 8 scheduler (4 publisher + 4 cleaner), tất cả flow atomic.

**Bài kế tiếp** → [Bài 39: Test end-to-end Outbox — chứng minh chống dual-write](07-test-outbox-e2e.md)
