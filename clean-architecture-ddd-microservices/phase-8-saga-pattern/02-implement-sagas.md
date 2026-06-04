# Bài 31: Code OrderPaymentSaga + OrderApprovalSaga

> Bài 30 đã nói lý thuyết. Bài này code 2 SagaStep cụ thể, refactor Order Application Service để dùng chúng. Mục tiêu: logic SAGA tách khỏi Listener, gói gọn trong class chuyên biệt — đọc 1 class thấy cả luồng forward và rollback.

## Interface `SagaStep` ở `common-domain`

```java
package com.food.ordering.system.saga;

public interface SagaStep<T> {
    SagaStep<T> process(T data);
    SagaStep<T> rollback(T data);
}
```

Trả về `SagaStep<T>` để chain (fluent), không bắt buộc dùng.

## `OrderPaymentSaga` — xử lý payment response

```java
package com.food.ordering.system.order.service.domain;

@Slf4j
@Component
@RequiredArgsConstructor
public class OrderPaymentSaga implements SagaStep<PaymentResponse> {

    private final OrderDomainService orderDomainService;
    private final OrderRepository orderRepository;
    private final OrderPaidRestaurantRequestMessagePublisher orderPaidRestaurantRequestMessagePublisher;
    private final OrderDataMapper orderDataMapper;

    @Override
    @Transactional
    public OrderPaymentSaga process(PaymentResponse paymentResponse) {
        log.info("Completing payment for order with id: {}", paymentResponse.getOrderId());
        Order order = findOrder(paymentResponse.getOrderId());

        OrderPaidEvent domainEvent = orderDomainService.payOrder(order);
        orderRepository.save(order);

        // Publish ngoài transaction (helper chỉ là @Transactional)
        orderPaidRestaurantRequestMessagePublisher.publish(domainEvent);
        log.info("Order with id: {} is paid", order.getId().getValue());
        return this;
    }

    @Override
    @Transactional
    public OrderPaymentSaga rollback(PaymentResponse paymentResponse) {
        log.info("Cancelling order with id: {}", paymentResponse.getOrderId());
        Order order = findOrder(paymentResponse.getOrderId());

        orderDomainService.cancelOrder(order, paymentResponse.getFailureMessages());
        orderRepository.save(order);
        log.info("Order with id: {} is cancelled", order.getId().getValue());
        return this;
    }

    private Order findOrder(String orderId) {
        Optional<Order> orderResponse = orderRepository.findById(new OrderId(UUID.fromString(orderId)));
        if (orderResponse.isEmpty()) {
            log.error("Order with id: {} could not be found!", orderId);
            throw new OrderNotFoundException("Order with id: " + orderId + " could not be found!");
        }
        return orderResponse.get();
    }
}
```

### Đọc code

- **`process(paymentResponse)`** — chạy khi PaymentResponse là COMPLETED:
  1. Load Order.
  2. Gọi `orderDomainService.payOrder()` → trả `OrderPaidEvent`.
  3. Save Order (status PAID).
  4. Publish event sang restaurant-approval-request topic.

- **`rollback(paymentResponse)`** — chạy khi PaymentResponse là CANCELLED/FAILED:
  1. Load Order.
  2. Gọi `orderDomainService.cancelOrder()` → status CANCELLED.
  3. Save Order với failureMessages.
  4. Không publish event (đây là terminal — không cần thông báo ai khác).

Cả 2 method có `@Transactional` riêng — mỗi method 1 unit-of-work.

## `OrderApprovalSaga` — xử lý restaurant approval response

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class OrderApprovalSaga implements SagaStep<RestaurantApprovalResponse> {

    private final OrderDomainService orderDomainService;
    private final OrderRepository orderRepository;
    private final OrderCancelledPaymentRequestMessagePublisher orderCancelledPaymentRequestMessagePublisher;
    private final OrderDataMapper orderDataMapper;

    @Override
    @Transactional
    public OrderApprovalSaga process(RestaurantApprovalResponse response) {
        log.info("Approving order with id: {}", response.getOrderId());
        Order order = findOrder(response.getOrderId());

        orderDomainService.approveOrder(order);
        orderRepository.save(order);
        log.info("Order with id: {} is approved", order.getId().getValue());
        return this;
    }

    @Override
    @Transactional
    public OrderApprovalSaga rollback(RestaurantApprovalResponse response) {
        log.info("Cancelling order with id: {}", response.getOrderId());
        Order order = findOrder(response.getOrderId());

        OrderCancelledEvent domainEvent =
            orderDomainService.cancelOrderPayment(order, response.getFailureMessages());
        orderRepository.save(order);

        orderCancelledPaymentRequestMessagePublisher.publish(domainEvent);
        log.info("Order with id: {} payment cancellation initiated", order.getId().getValue());
        return this;
    }

    private Order findOrder(String orderId) { ... }
}
```

Lưu ý quan trọng:

| Method | Trạng thái sau khi gọi | Publish event? |
|---|---|---|
| `process` (approved) | `APPROVED` (terminal) | Không |
| `rollback` (rejected) | `CANCELLING` (intermediate!) | **Có** — publish cancel payment request |

Vì sao `rollback` ở đây chưa set `CANCELLED`? Vì còn cần Payment refund. Khi Payment refund xong publish `PaymentCancelledEvent`, Order consume qua `OrderPaymentSaga.rollback` → mới set `CANCELLED`.

```text
Restaurant REJECT
    ↓
OrderApprovalSaga.rollback → status CANCELLING + publish CancelPaymentRequest
    ↓
Payment receive, refund credit, publish PaymentCancelledResponse
    ↓
OrderPaymentSaga.rollback → status CANCELLED (terminal)
```

Compensation đi qua **2 service** liên tiếp.

## Refactor Listener Implementation

Trước refactor:
```java
@Service
public class PaymentResponseMessageListenerImpl implements PaymentResponseMessageListener {
    @Override
    public void paymentCompleted(PaymentResponse response) {
        // logic phức tạp
    }
}
```

Sau refactor — gọn còn 2 dòng:
```java
@Slf4j
@Service
@Validated
@RequiredArgsConstructor
public class PaymentResponseMessageListenerImpl implements PaymentResponseMessageListener {

    private final OrderPaymentSaga orderPaymentSaga;

    @Override
    public void paymentCompleted(PaymentResponse paymentResponse) {
        orderPaymentSaga.process(paymentResponse);
    }

    @Override
    public void paymentCancelled(PaymentResponse paymentResponse) {
        orderPaymentSaga.rollback(paymentResponse);
    }
}
```

Tương tự `RestaurantApprovalResponseMessageListenerImpl`:

```java
@Service
@RequiredArgsConstructor
public class RestaurantApprovalResponseMessageListenerImpl 
        implements RestaurantApprovalResponseMessageListener {

    private final OrderApprovalSaga orderApprovalSaga;

    @Override
    public void orderApproved(RestaurantApprovalResponse response) {
        orderApprovalSaga.process(response);
    }

    @Override
    public void orderRejected(RestaurantApprovalResponse response) {
        orderApprovalSaga.rollback(response);
    }
}
```

Listener mỏng → SagaStep gánh logic. Đây là **single responsibility** — listener chỉ chuyển event vào SAGA, SAGA biết cách xử lý.

## OrderRepository thêm method

```java
public interface OrderRepository {
    Order save(Order order);
    Optional<Order> findByTrackingId(TrackingId trackingId);
    Optional<Order> findById(OrderId orderId);     // mới
}
```

Cần load Order bằng `OrderId` (UUID internal) — SagaStep nhận message với `orderId` chứ không `trackingId`.

## Output port mới

```java
public interface OrderPaidRestaurantRequestMessagePublisher 
    extends DomainEventPublisher<OrderPaidEvent> {}

public interface OrderCancelledPaymentRequestMessagePublisher 
    extends DomainEventPublisher<OrderCancelledEvent> {}
```

2 publisher mới — implementation Kafka tương tự `CreateOrderKafkaMessagePublisher` ở phase-3, chỉ khác topic và Avro model.

## Bài kiểm tra: chạy end-to-end SAGA

### Happy path
```text
POST /orders → PENDING
Order → payment-request → Payment → payment-response COMPLETED
OrderPaymentSaga.process → PAID + publish restaurant-approval-request
Restaurant → restaurant-approval-response APPROVED
OrderApprovalSaga.process → APPROVED (terminal)
GET /orders/{trackingId} → APPROVED
```

### Restaurant reject (compensation full)
```text
POST /orders → PENDING
... → PAID
Restaurant → restaurant-approval-response REJECTED
OrderApprovalSaga.rollback → CANCELLING + publish payment-request CANCEL
Payment refund → payment-response CANCELLED
OrderPaymentSaga.rollback → CANCELLED (terminal) + failureMessages từ restaurant
GET /orders/{trackingId} → CANCELLED + failureMessages
```

### Payment fail (compensation đơn giản)
```text
POST /orders → PENDING
Payment fail (insufficient credit) → payment-response FAILED
OrderPaymentSaga.rollback → CANCELLED (terminal) + failureMessages từ payment
GET /orders/{trackingId} → CANCELLED + failureMessages
```

## Cấu trúc folder Order Application Service sau refactor

```text
order-application-service/src/main/java/.../domain/
├── OrderApplicationServiceImpl.java
├── OrderCreateCommandHandler.java
├── OrderCreateHelper.java
├── OrderTrackCommandHandler.java
├── PaymentResponseMessageListenerImpl.java         ← refactored
├── RestaurantApprovalResponseMessageListenerImpl.java  ← refactored
├── OrderPaymentSaga.java                            ← MỚI (phase-8)
├── OrderApprovalSaga.java                           ← MỚI (phase-8)
├── dto/
├── mapper/
└── ports/
    ├── input/
    └── output/
        └── message/publisher/
            ├── payment/
            │   ├── OrderCreatedPaymentRequestMessagePublisher.java
            │   └── OrderCancelledPaymentRequestMessagePublisher.java  ← MỚI
            └── restaurantapproval/
                └── OrderPaidRestaurantRequestMessagePublisher.java     ← MỚI
```

## Bẫy thường gặp với SagaStep

| Bẫy | Sửa |
|---|---|
| Saga method không `@Transactional` | DB save không atomic với business logic. Thêm. |
| Publish event trong `@Transactional` của Saga | Quay lại vấn đề dual-write. Tách publisher gọi sau commit (giống Helper ở Order Create) — nhưng phase-8 chưa giải triệt để. |
| Saga rollback gọi process | Lẫn lộn flow. Đọc lại transitions. |
| Saga load Order rồi trả về cho caller | Saga là void-like return `this` để chain. Caller không cần Order. |
| Saga gọi repository khác (Payment, Restaurant) | KHÔNG. Saga của Order chỉ chạm Order DB. Cross-service qua event. |
| Đặt `@Service` trên SagaStep | OK. Spring scan, inject vào Listener. |
| Saga state tản mác | Phase-9 sẽ thêm `OrderStatus` + `SagaStatus` + `OutboxStatus` track đầy đủ. |

## Tóm tắt bài 31

- 2 SagaStep: `OrderPaymentSaga` + `OrderApprovalSaga` — mỗi cái implement `process` + `rollback`.
- Listener refactor gọn còn 2 dòng — delegate vào SagaStep.
- `OrderApprovalSaga.rollback` set status `CANCELLING` + publish cancel payment request → chuyển control sang Payment service để refund.
- `OrderPaymentSaga.rollback` set status `CANCELLED` (terminal) sau khi Payment đã refund.
- Code SAGA gọn, đọc 1 file thấy cả forward + compensation.

**Bài kế tiếp** → [Bài 32: Test end-to-end SAGA với happy path và 2 failure scenarios](03-test-saga-e2e.md)
