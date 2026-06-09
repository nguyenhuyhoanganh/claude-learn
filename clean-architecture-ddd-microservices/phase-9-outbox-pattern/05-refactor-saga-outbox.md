# Bài 37: Refactor OrderPaymentSaga + OrderApprovalSaga cho Outbox

> 2 SagaStep ở phase-8 publish event trực tiếp. Bài này refactor: thay vì publish, **save outbox** (chuyển control sang scheduler). Đồng thời **idempotent check** bằng outbox table — chống duplicate Kafka delivery.

## Refactor `OrderPaymentSaga.process` — happy path

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class OrderPaymentSaga implements SagaStep<PaymentResponse> {

    private final OrderDomainService orderDomainService;
    private final OrderSagaHelper orderSagaHelper;
    private final PaymentOutboxHelper paymentOutboxHelper;
    private final ApprovalOutboxHelper approvalOutboxHelper;
    private final OrderDataMapper orderDataMapper;

    @Override
    @Transactional
    public void process(PaymentResponse paymentResponse) {
        Optional<OrderPaymentOutboxMessage> outboxMessage =
            paymentOutboxHelper.getPaymentOutboxMessageBySagaIdAndSagaStatus(
                UUID.fromString(paymentResponse.getSagaId()), SagaStatus.STARTED);

        if (outboxMessage.isEmpty()) {
            log.info("Outbox message with saga id: {} is already processed!", paymentResponse.getSagaId());
            return;     // IDEMPOTENT — duplicate delivery, skip
        }

        OrderPaidEvent domainEvent = completePaymentForOrder(paymentResponse);

        SagaStatus sagaStatus = orderSagaHelper.orderStatusToSagaStatus(
            domainEvent.getOrder().getOrderStatus());

        paymentOutboxHelper.save(getUpdatedPaymentOutboxMessage(
            outboxMessage.get(), domainEvent.getOrder().getOrderStatus(), sagaStatus));

        approvalOutboxHelper.saveApprovalOutboxMessage(
            orderDataMapper.orderPaidEventToOrderApprovalEventPayload(domainEvent),
            domainEvent.getOrder().getOrderStatus(),
            sagaStatus,
            OutboxStatus.STARTED,
            UUID.fromString(paymentResponse.getSagaId()));

        log.info("Order with id: {} is paid", domainEvent.getOrder().getId().getValue());
    }

    private OrderPaidEvent completePaymentForOrder(PaymentResponse paymentResponse) {
        log.info("Completing payment for order with id: {}", paymentResponse.getOrderId());
        Order order = orderSagaHelper.findOrder(paymentResponse.getOrderId());
        OrderPaidEvent domainEvent = orderDomainService.payOrder(order);
        orderSagaHelper.saveOrder(order);
        return domainEvent;
    }

    private OrderPaymentOutboxMessage getUpdatedPaymentOutboxMessage(
            OrderPaymentOutboxMessage msg, OrderStatus orderStatus, SagaStatus sagaStatus) {
        msg.setProcessedAt(ZonedDateTime.now(ZoneId.of("UTC")));
        msg.setOrderStatus(orderStatus);
        msg.setSagaStatus(sagaStatus);
        return msg;
    }
}
```

### Flow `process()`

```text
1. Load payment outbox by sagaId + saga_status=STARTED
   ├── Empty → đã xử lý → skip (idempotent)
   └── Present → tiếp tục

2. Load Order, gọi domain service payOrder() → status PAID

3. Update payment_outbox: saga_status=PROCESSING (đã xử lý xong payment step)

4. INSERT approval_outbox: saga_status=PROCESSING, outbox_status=STARTED
   (message mới cho restaurant approval, scheduler sẽ publish)
```

3 thay đổi quan trọng:

- **Idempotent check**: query outbox by sagaId. Đã xử lý → skip.
- **Update outbox cũ**: payment_outbox row chuyển sang `PROCESSING` (không xoá).
- **Insert outbox mới**: approval_outbox row STARTED → trigger scheduler publish.

Tất cả trong 1 `@Transactional` → atomic.

## Refactor `OrderPaymentSaga.rollback`

```java
@Override
@Transactional
public void rollback(PaymentResponse paymentResponse) {
    Optional<OrderPaymentOutboxMessage> outboxMessage =
        paymentOutboxHelper.getPaymentOutboxMessageBySagaIdAndSagaStatus(
            UUID.fromString(paymentResponse.getSagaId()),
            getCurrentSagaStatus(paymentResponse.getPaymentStatus()));

    if (outboxMessage.isEmpty()) {
        log.info("Outbox message is already roll backed with saga id: {}", paymentResponse.getSagaId());
        return;
    }

    Order order = rollbackPaymentForOrder(paymentResponse);

    SagaStatus sagaStatus = orderSagaHelper.orderStatusToSagaStatus(order.getOrderStatus());

    paymentOutboxHelper.save(getUpdatedPaymentOutboxMessage(
        outboxMessage.get(), order.getOrderStatus(), sagaStatus));

    if (paymentResponse.getPaymentStatus() == PaymentStatus.CANCELLED) {
        approvalOutboxHelper.save(
            getUpdatedApprovalOutboxMessage(paymentResponse.getSagaId(),
                order.getOrderStatus(), sagaStatus));
    }

    log.info("Order with id: {} is cancelled", order.getId().getValue());
}

private Order rollbackPaymentForOrder(PaymentResponse paymentResponse) {
    log.info("Cancelling order with id: {}", paymentResponse.getOrderId());
    Order order = orderSagaHelper.findOrder(paymentResponse.getOrderId());
    orderDomainService.cancelOrder(order, paymentResponse.getFailureMessages());
    orderSagaHelper.saveOrder(order);
    return order;
}

private SagaStatus[] getCurrentSagaStatus(PaymentStatus status) {
    return switch (status) {
        case COMPLETED -> new SagaStatus[]{SagaStatus.STARTED};
        case CANCELLED -> new SagaStatus[]{SagaStatus.PROCESSING};
        case FAILED    -> new SagaStatus[]{SagaStatus.STARTED, SagaStatus.PROCESSING};
    };
}
```

Logic mới: query outbox với saga_status đúng theo PaymentStatus:
- **COMPLETED (forward)**: payment outbox đang STARTED → process step.
- **CANCELLED (rollback)**: payment outbox đang PROCESSING (đã forward, giờ rollback) — xảy ra khi restaurant reject sau khi payment OK.
- **FAILED (forward fail)**: payment outbox có thể STARTED hoặc PROCESSING tuỳ thời điểm fail.

## `OrderSagaHelper` — utility chung

```java
@Component
@RequiredArgsConstructor
public class OrderSagaHelper {

    private final OrderRepository orderRepository;

    Order findOrder(String orderId) {
        Optional<Order> orderResponse = orderRepository.findById(new OrderId(UUID.fromString(orderId)));
        if (orderResponse.isEmpty()) {
            log.error("Order with id: {} could not be found!", orderId);
            throw new OrderNotFoundException("Order with id: " + orderId + " could not be found!");
        }
        return orderResponse.get();
    }

    void saveOrder(Order order) {
        orderRepository.save(order);
    }

    SagaStatus orderStatusToSagaStatus(OrderStatus orderStatus) {
        return switch (orderStatus) {
            case PAID       -> SagaStatus.PROCESSING;
            case APPROVED   -> SagaStatus.SUCCEEDED;
            case CANCELLING -> SagaStatus.COMPENSATING;
            case CANCELLED  -> SagaStatus.COMPENSATED;
            default         -> SagaStatus.STARTED;
        };
    }
}
```

Mapping `OrderStatus` → `SagaStatus`:

| OrderStatus | SagaStatus |
|---|---|
| PENDING | STARTED |
| PAID | PROCESSING |
| APPROVED | SUCCEEDED (terminal happy) |
| CANCELLING | COMPENSATING |
| CANCELLED | COMPENSATED (terminal cancel) |

## Refactor `OrderApprovalSaga.process`

```java
@Override
@Transactional
public void process(RestaurantApprovalResponse response) {
    Optional<OrderApprovalOutboxMessage> outboxMessage =
        approvalOutboxHelper.getApprovalOutboxMessageBySagaIdAndSagaStatus(
            UUID.fromString(response.getSagaId()), SagaStatus.PROCESSING);

    if (outboxMessage.isEmpty()) {
        log.info("Outbox message is already processed for saga id: {}", response.getSagaId());
        return;
    }

    Order order = approveOrder(response);
    SagaStatus sagaStatus = orderSagaHelper.orderStatusToSagaStatus(order.getOrderStatus());

    approvalOutboxHelper.save(getUpdatedApprovalOutboxMessage(
        outboxMessage.get(), order.getOrderStatus(), sagaStatus));

    paymentOutboxHelper.save(getUpdatedPaymentOutboxMessage(
        response.getSagaId(), order.getOrderStatus(), sagaStatus));

    log.info("Order with id: {} is approved", order.getId().getValue());
}
```

`process` (Order APPROVED) cập nhật **cả 2 outbox** sang `SUCCEEDED`. Lý do: cleaner scheduler dùng saga_status để xoá. Cả 2 cần đồng bộ.

## Refactor `OrderApprovalSaga.rollback` — phức tạp nhất

```java
@Override
@Transactional
public void rollback(RestaurantApprovalResponse response) {
    Optional<OrderApprovalOutboxMessage> outboxMessage =
        approvalOutboxHelper.getApprovalOutboxMessageBySagaIdAndSagaStatus(
            UUID.fromString(response.getSagaId()), SagaStatus.PROCESSING);

    if (outboxMessage.isEmpty()) {
        log.info("Outbox message is already roll backed for saga id: {}", response.getSagaId());
        return;
    }

    OrderCancelledEvent domainEvent = rollbackOrder(response);
    SagaStatus sagaStatus = orderSagaHelper.orderStatusToSagaStatus(
        domainEvent.getOrder().getOrderStatus());

    approvalOutboxHelper.save(getUpdatedApprovalOutboxMessage(
        outboxMessage.get(), domainEvent.getOrder().getOrderStatus(), sagaStatus));

    paymentOutboxHelper.savePaymentOutboxMessage(
        orderDataMapper.orderCancelledEventToOrderPaymentEventPayload(domainEvent),
        domainEvent.getOrder().getOrderStatus(),
        sagaStatus,
        OutboxStatus.STARTED,
        UUID.fromString(response.getSagaId()));

    log.info("Order with id: {} payment cancellation initiated", domainEvent.getOrder().getId().getValue());
}

private OrderCancelledEvent rollbackOrder(RestaurantApprovalResponse response) {
    Order order = orderSagaHelper.findOrder(response.getOrderId());
    OrderCancelledEvent domainEvent =
        orderDomainService.cancelOrderPayment(order, response.getFailureMessages());
    orderSagaHelper.saveOrder(order);
    return domainEvent;
}
```

Flow:
1. Idempotent check.
2. Order set CANCELLING.
3. Update approval_outbox → saga_status=COMPENSATING.
4. **INSERT mới** payment_outbox với payload cancel-request, outbox_status=STARTED, saga_status=COMPENSATING.

Scheduler tiếp tục pick row STARTED → publish payment-request topic với CANCELLED type → Payment refund → publish response → flow tiếp.

## Toàn cảnh outbox flow qua 3 bước compensation

```text
1. Order created
   payment_outbox: STARTED + STARTED → scheduler publish
                   STARTED + STARTED → published, COMPLETED + STARTED (after Kafka ack)

2. Payment COMPLETED received
   OrderPaymentSaga.process:
      payment_outbox: COMPLETED + STARTED → COMPLETED + PROCESSING (đã forward xong)
      INSERT approval_outbox: STARTED + PROCESSING → scheduler publish
                              STARTED + PROCESSING → COMPLETED + PROCESSING (after ack)

3. Restaurant REJECTED received
   OrderApprovalSaga.rollback:
      approval_outbox: COMPLETED + PROCESSING → COMPLETED + COMPENSATING
      INSERT payment_outbox: STARTED + COMPENSATING → scheduler publish
                             STARTED + COMPENSATING → COMPLETED + COMPENSATING (after ack)

4. Payment CANCELLED received (rollback)
   OrderPaymentSaga.rollback:
      payment_outbox (rollback): COMPLETED + COMPENSATING → COMPLETED + COMPENSATED
      approval_outbox (đồng bộ): COMPLETED + COMPENSATING → COMPLETED + COMPENSATED
   Order final: CANCELLED + failureMessages
```

Cleaner sau đó xoá cả 4 row COMPLETED + COMPENSATED.

## Bẫy thường gặp

| Bẫy | Tránh bằng cách |
|---|---|
| Quên idempotent check ở đầu process/rollback | Kafka duplicate → SAGA chạy 2 lần → DB lệch. Luôn check outbox. |
| Update outbox không update saga_status | Scheduler/cleaner query nhầm → stuck. |
| INSERT outbox mới với UUID random sagaId | Mất khả năng trace SAGA. Dùng cùng sagaId xuyên flow. |
| `getCurrentSagaStatus` thiếu case | NPE switch không exhaustive. Dùng `switch expression` của Java 17 → compiler check. |
| Quên update payment_outbox khi approval rollback | 2 outbox lệch trạng thái → cleaner không xoá hết. |
| `@Transactional` chỉ cover save Order, không cover outbox | Refactor để bao trùm cả 2. |

## Tóm tắt bài 37

- 2 SagaStep refactor: thay `publisher.publish` bằng `outboxHelper.save` → control chuyển sang scheduler.
- Idempotent check đầu mỗi method: query outbox by sagaId + saga_status, đã xử lý → skip.
- `process` update outbox cũ + INSERT outbox mới cho step kế tiếp (cùng transaction).
- `rollback` cùng logic, ngược chiều, thường set `COMPENSATING` rồi đợi response trả về.
- 1 SAGA hoàn chỉnh sinh 4 outbox row qua 4 step (process payment, process approval, rollback approval, rollback payment).
- 8 scheduler từ bài 36 đảm bảo mọi outbox STARTED đều được publish.

**Bài kế tiếp** → [Bài 38: Outbox cho Payment + Restaurant service](06-outbox-payment-restaurant.md)
