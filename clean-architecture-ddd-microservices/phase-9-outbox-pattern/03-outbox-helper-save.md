# Bài 35: Outbox helper — INSERT outbox cùng transaction với Order

> Outbox table đã có. Bây giờ ta cần code refactor `OrderCreateCommandHandler` để **INSERT Order + INSERT payment_outbox trong cùng `@Transactional`**. Đây là chìa khoá đảm bảo atomic. Bài này code helper class chuyên cho việc đó.

## Refactor `OrderCreateCommandHandler`

Trước (phase-8):
```java
public CreateOrderResponse createOrder(CreateOrderCommand command) {
    OrderCreatedEvent event = orderCreateHelper.persistOrder(command);   // @Transactional
    orderCreatedPaymentRequestMessagePublisher.publish(event);            // NGOÀI transaction → dual-write
    return orderDataMapper.orderToCreateOrderResponse(event.getOrder(), "Order created successfully");
}
```

Sau (phase-9):
```java
@Slf4j
@Component
@RequiredArgsConstructor
public class OrderCreateCommandHandler {

    private final OrderCreateHelper orderCreateHelper;
    private final OrderDataMapper orderDataMapper;
    private final OrderSagaHelper orderSagaHelper;
    private final PaymentOutboxHelper paymentOutboxHelper;
    private final OrderCreatedPaymentRequestMessagePublisher orderCreatedPaymentRequestMessagePublisher;

    public CreateOrderResponse createOrder(CreateOrderCommand createOrderCommand) {
        OrderCreatedEvent orderCreatedEvent = orderCreateHelper.persistOrder(createOrderCommand);
        CreateOrderResponse createOrderResponse = orderDataMapper.orderToCreateOrderResponse(
            orderCreatedEvent.getOrder(), "Order created successfully");

        paymentOutboxHelper.savePaymentOutboxMessage(
            orderDataMapper.orderCreatedEventToOrderPaymentEventPayload(orderCreatedEvent),
            orderCreatedEvent.getOrder().getOrderStatus(),
            SagaStatus.STARTED,
            OutboxStatus.STARTED,
            UUID.randomUUID());                    // sagaId mới

        log.info("Returning CreateOrderResponse with order id: {}", orderCreatedEvent.getOrder().getId().getValue());
        return createOrderResponse;
    }
}
```

Quan sát: publisher đã bị xoá. Thay vào đó là `paymentOutboxHelper.savePaymentOutboxMessage(...)`.

> **Quan trọng**: `persistOrder` và `savePaymentOutboxMessage` cần nằm cùng transaction. Khoá học giải bằng cách đặt `@Transactional` ở cả 2 helper method — Spring propagate transaction (REQUIRED là mặc định) → 2 helper chia sẻ transaction nếu gọi từ method gốc đã có `@Transactional`.

Tuy nhiên `OrderCreateCommandHandler.createOrder()` **không** có `@Transactional` → 2 helper chạy 2 transaction độc lập. Cách an toàn hơn:

```java
@Transactional
public CreateOrderResponse createOrder(CreateOrderCommand command) { ... }
```

Hoặc tạo helper bao trùm:

```java
@Transactional
public OrderCreatedEvent persistOrderAndSaveOutbox(...) {
    OrderCreatedEvent event = ...persist Order...;
    savePaymentOutboxMessage(...);
    return event;
}
```

## `PaymentOutboxHelper`

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class PaymentOutboxHelper {

    private final PaymentOutboxRepository paymentOutboxRepository;
    private final ObjectMapper objectMapper;

    @Transactional(readOnly = true)
    public Optional<List<OrderPaymentOutboxMessage>> getPaymentOutboxMessageByOutboxStatusAndSagaStatus(
            OutboxStatus outboxStatus, SagaStatus... sagaStatus) {
        return paymentOutboxRepository.findByTypeAndOutboxStatusAndSagaStatus(
            ORDER_SAGA_NAME, outboxStatus, sagaStatus);
    }

    @Transactional(readOnly = true)
    public Optional<OrderPaymentOutboxMessage> getPaymentOutboxMessageBySagaIdAndSagaStatus(
            UUID sagaId, SagaStatus... sagaStatus) {
        return paymentOutboxRepository.findByTypeAndSagaIdAndSagaStatus(
            ORDER_SAGA_NAME, sagaId, sagaStatus);
    }

    @Transactional
    public void save(OrderPaymentOutboxMessage outboxMessage) {
        OrderPaymentOutboxMessage saved = paymentOutboxRepository.save(outboxMessage);
        if (saved == null) {
            log.error("Could not save OrderPaymentOutboxMessage with id: {}", outboxMessage.getId());
            throw new OrderDomainException(
                "Could not save OrderPaymentOutboxMessage with id: " + outboxMessage.getId());
        }
        log.info("OrderPaymentOutboxMessage saved with outbox id: {}", outboxMessage.getId());
    }

    @Transactional
    public void savePaymentOutboxMessage(OrderPaymentEventPayload paymentEventPayload,
                                         OrderStatus orderStatus,
                                         SagaStatus sagaStatus,
                                         OutboxStatus outboxStatus,
                                         UUID sagaId) {
        save(OrderPaymentOutboxMessage.builder()
            .id(UUID.randomUUID())
            .sagaId(sagaId)
            .createdAt(paymentEventPayload.getCreatedAt() == null
                ? ZonedDateTime.now(ZoneId.of("UTC"))
                : ZonedDateTime.parse(paymentEventPayload.getCreatedAt()))
            .type(ORDER_SAGA_NAME)
            .payload(createPayload(paymentEventPayload))
            .orderStatus(orderStatus)
            .sagaStatus(sagaStatus)
            .outboxStatus(outboxStatus)
            .build());
    }

    @Transactional
    public void deletePaymentOutboxMessageByOutboxStatusAndSagaStatus(
            OutboxStatus outboxStatus, SagaStatus... sagaStatus) {
        paymentOutboxRepository.deleteByTypeAndOutboxStatusAndSagaStatus(
            ORDER_SAGA_NAME, outboxStatus, sagaStatus);
    }

    private String createPayload(OrderPaymentEventPayload paymentEventPayload) {
        try {
            return objectMapper.writeValueAsString(paymentEventPayload);
        } catch (JsonProcessingException e) {
            log.error("Could not create OrderPaymentEventPayload object for order id: {}",
                paymentEventPayload.getOrderId(), e);
            throw new OrderDomainException(
                "Could not create OrderPaymentEventPayload object for order id: "
                + paymentEventPayload.getOrderId(), e);
        }
    }
}
```

Helper gói gọn 4 việc:
1. **Find** — scheduler load message pending.
2. **Save** — INSERT/UPDATE outbox.
3. **Save with full params** — convenient builder method cho command handler.
4. **Delete** — cleaner scheduler xoá COMPLETED.

`ObjectMapper` inject từ Spring (Jackson) — serialize payload sang JSON.

## Mapper bổ sung trong `OrderDataMapper`

Thêm method convert event sang payload:

```java
public OrderPaymentEventPayload orderCreatedEventToOrderPaymentEventPayload(OrderCreatedEvent event) {
    return OrderPaymentEventPayload.builder()
        .customerId(event.getOrder().getCustomerId().getValue().toString())
        .orderId(event.getOrder().getId().getValue().toString())
        .price(event.getOrder().getPrice().getAmount())
        .createdAt(event.getCreatedAt().toString())
        .paymentOrderStatus(PaymentOrderStatus.PENDING.name())
        .build();
}

public OrderPaymentEventPayload orderCancelledEventToOrderPaymentEventPayload(OrderCancelledEvent event) {
    return OrderPaymentEventPayload.builder()
        .customerId(event.getOrder().getCustomerId().getValue().toString())
        .orderId(event.getOrder().getId().getValue().toString())
        .price(event.getOrder().getPrice().getAmount())
        .createdAt(event.getCreatedAt().toString())
        .paymentOrderStatus(PaymentOrderStatus.CANCELLED.name())
        .build();
}

public OrderApprovalEventPayload orderPaidEventToOrderApprovalEventPayload(OrderPaidEvent event) {
    return OrderApprovalEventPayload.builder()
        .orderId(event.getOrder().getId().getValue().toString())
        .restaurantId(event.getOrder().getRestaurantId().getValue().toString())
        .restaurantOrderStatus(RestaurantOrderStatus.PAID.name())
        .products(event.getOrder().getItems().stream().map(orderItem ->
            OrderApprovalEventProduct.builder()
                .id(orderItem.getProduct().getId().getValue().toString())
                .quantity(orderItem.getQuantity())
                .build()).collect(Collectors.toList()))
        .price(event.getOrder().getPrice().getAmount())
        .createdAt(event.getCreatedAt().toString())
        .build();
}
```

## ObjectMapper config

Cần `@Bean ObjectMapper` cấu hình JavaTime (cho `ZonedDateTime`):

```java
// order-container/.../BeanConfiguration.java
@Bean
public ObjectMapper objectMapper() {
    return new ObjectMapper()
        .registerModule(new JavaTimeModule())
        .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
}
```

Hoặc dùng `Jackson2ObjectMapperBuilder` để pick up Spring config tự động.

## Flow sau refactor — POST /orders

```text
POST /orders
   │
   ▼
OrderApplicationServiceImpl.createOrder(command)
   │
   ▼
OrderCreateCommandHandler.createOrder(command)
   │
   ├── orderCreateHelper.persistOrder(command)
   │     │      [@Transactional]
   │     ├── checkCustomer
   │     ├── checkRestaurant
   │     ├── validateAndInitiateOrder
   │     └── orderRepository.save(order)
   │     [end transaction — Order committed]
   │
   └── paymentOutboxHelper.savePaymentOutboxMessage(...)
         │   [@Transactional — RIÊNG]
         └── INSERT payment_outbox(sagaId, payload, STARTED, STARTED)
         [end transaction — outbox committed]
```

**Vấn đề**: 2 helper, 2 transaction. Vẫn không atomic! Nếu Order commit OK rồi crash trước khi save outbox → outbox không có → SAGA stuck.

Cách giải: gộp 2 vào **1 transaction** bằng cách:

```java
// OrderCreateCommandHandler
@Transactional
public CreateOrderResponse createOrder(CreateOrderCommand command) {
    OrderCreatedEvent event = orderCreateHelper.persistOrder(command);
    paymentOutboxHelper.savePaymentOutboxMessage(...);
    return ...;
}
```

Hoặc tạo super-helper bao trùm cả 2. Khoá học gốc đặt `@Transactional` ở command handler level — propagation REQUIRED → 1 transaction xuyên 2 helper. **An toàn**.

## DB query sau khi POST

```text
$ psql -c 'SELECT id, order_status FROM "order".orders;'
   id      | order_status
   --------+--------------
   abc-123 | PENDING

$ psql -c 'SELECT id, saga_id, type, outbox_status, saga_status FROM "order".payment_outbox;'
   id      | saga_id | type                | outbox_status | saga_status
   --------+---------+---------------------+---------------+------------
   xyz-456 | sga-789 | OrderProcessingSaga | STARTED       | STARTED

$ psql -c "SELECT payload FROM \"order\".payment_outbox WHERE id='xyz-456';"
   {
     "orderId": "abc-123",
     "customerId": "d215...",
     "price": 50.00,
     "createdAt": "2026-06-04T...",
     "paymentOrderStatus": "PENDING"
   }
```

Order + outbox đã sẵn sàng. Chưa có ai publish — đợi scheduler ở bài kế.

## Bẫy thường gặp

| Bẫy | Tránh bằng cách |
|---|---|
| Save Order ở 1 helper, save outbox ở helper khác, không cùng transaction | Đặt `@Transactional` ở command handler để propagate. |
| `objectMapper` không config JavaTime → fail serialize ZonedDateTime | Đăng ký `JavaTimeModule`. |
| Payload có field `Order` full → JSON quá to | Chỉ field cần thôi. |
| Quên sagaId UUID → random mỗi lần — không track được | Tạo sagaId 1 lần ở command handler, dùng xuyên SAGA. |
| Save outbox với `OutboxStatus.COMPLETED` ngay | Scheduler sẽ không pick. Phải STARTED. |
| Mapper không có `@Component` → Spring không inject | Thêm annotation. |

## Tóm tắt bài 35

- `PaymentOutboxHelper` gói gọn save/find/delete outbox, dùng `ObjectMapper` serialize payload JSON.
- `OrderCreateCommandHandler` refactor: thay `publisher.publish()` bằng `paymentOutboxHelper.savePaymentOutboxMessage()`.
- 2 helper cần nằm trong cùng `@Transactional` — đặt ở command handler level (`@Transactional` propagation REQUIRED).
- Sau POST: Order + outbox cùng commit hoặc cùng rollback → atomic dual-write giải quyết.
- Chưa có scheduler publish — message chỉ nằm trong outbox. Bài 36 thêm scheduler.

**Bài kế tiếp** → [Bài 36: Outbox Scheduler — polling pattern + cleanup](04-outbox-scheduler.md)
