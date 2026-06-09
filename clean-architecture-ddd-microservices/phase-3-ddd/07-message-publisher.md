# Bài 13: Message Publisher trong Application Service — refactor "publish event option-1"

> Bài 12 đã tạo `OrderCreateCommandHandler` publish event sau khi persist. Bài này refactor cho **đúng pattern** "Publish Event Option 1" — tách publisher theo từng event, separation of concerns rõ. Đây là bước **chuẩn bị cho phase-9 (Outbox)** — vì Outbox sẽ thay publisher bằng table + scheduler.

## Vì sao gọi là "Publish Event Option 1"?

Có nhiều cách publish domain event từ Application Service:

| Option | Mô tả | Trade-off |
|---|---|---|
| **Option 1**: Publisher injected, publish trực tiếp sau persist | Code thẳng tay, đơn giản | Dual-write problem (vá ở phase-9 Outbox) |
| **Option 2**: Application Event của Spring + `@TransactionalEventListener` | Spring tự gọi publisher sau commit | Vẫn dual-write, ẩn cơ chế hơn |
| **Option 3**: Outbox table polling | Persist event vào outbox table cùng transaction | Robust, cần scheduler — phase-9 |
| **Option 4**: Outbox + CDC (Debezium) | Đọc Postgres WAL log | Robust nhất, phase-13 |

Khoá học khởi đầu Option 1 (đơn giản nhất) ở phase-3, rồi migrate sang Option 3 ở phase-9 và Option 4 ở phase-13. Đó là **dạy theo evolution thực tế** — bạn thấy lý do từng cải tiến.

## Output Port — separation theo event

Mỗi domain event có **publisher interface riêng**:

```java
package com.food.ordering.system.order.service.domain.ports.output.message.publisher.payment;

public interface OrderCreatedPaymentRequestMessagePublisher 
    extends DomainEventPublisher<OrderCreatedEvent> {
    // marker
}

public interface OrderCancelledPaymentRequestMessagePublisher 
    extends DomainEventPublisher<OrderCancelledEvent> {
    // marker
}
```

```java
package com.food.ordering.system.order.service.domain.ports.output.message.publisher.restaurantapproval;

public interface OrderPaidRestaurantRequestMessagePublisher 
    extends DomainEventPublisher<OrderPaidEvent> {
    // marker
}
```

Vì sao tách interface theo event thay vì 1 `EventPublisher` chung?

- **Type safety**: Compiler đảm bảo Handler chỉ publish được event đúng type.
- **Single Responsibility**: 1 publisher = 1 topic Kafka. Implementation gọn.
- **Test mock dễ**: Mock publisher cho 1 event, không lo vô tình test publisher khác.
- **Sau này refactor Outbox** dễ — biết chính xác publisher nào ghi outbox nào.

## Refactor OrderCreateCommandHandler

Bài 12 đã đúng cấu trúc. Mở rộng thêm để xử lý các flow khác.

### Helper class — tách responsibility

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class OrderCreateHelper {
    private final OrderDomainService orderDomainService;
    private final OrderRepository orderRepository;
    private final CustomerRepository customerRepository;
    private final RestaurantRepository restaurantRepository;
    private final OrderDataMapper orderDataMapper;

    @Transactional
    public OrderCreatedEvent persistOrder(CreateOrderCommand createOrderCommand) {
        checkCustomer(createOrderCommand.customerId());
        Restaurant restaurant = checkRestaurant(createOrderCommand);
        Order order = orderDataMapper.createOrderCommandToOrder(createOrderCommand);
        OrderCreatedEvent event = orderDomainService.validateAndInitiateOrder(order, restaurant);
        saveOrder(order);
        return event;
    }
    // ... (giống bài 12)
}
```

Helper chỉ làm **DB transaction**. Publish Kafka ngoài transaction.

### CommandHandler gọi helper + publisher

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class OrderCreateCommandHandler {

    private final OrderCreateHelper orderCreateHelper;
    private final OrderDataMapper orderDataMapper;
    private final OrderCreatedPaymentRequestMessagePublisher orderCreatedPaymentRequestMessagePublisher;

    public CreateOrderResponse createOrder(CreateOrderCommand createOrderCommand) {
        OrderCreatedEvent orderCreatedEvent = orderCreateHelper.persistOrder(createOrderCommand);
        log.info("Order is created with id: {}", orderCreatedEvent.getOrder().getId().getValue());
        orderCreatedPaymentRequestMessagePublisher.publish(orderCreatedEvent);
        return orderDataMapper.orderToCreateOrderResponse(
            orderCreatedEvent.getOrder(), "Order created successfully");
    }
}
```

Vì sao `persistOrder` có `@Transactional` nhưng `createOrder` thì không?

```text
createOrder (no @Transactional)
   ├── persistOrder (Transactional)        ← commit + close transaction
   │    ├── checkCustomer       ← SELECT
   │    ├── checkRestaurant     ← SELECT
   │    ├── saveOrder           ← INSERT
   │    └── domainService...    ← in-memory
   └── publisher.publish(event)             ← Kafka call, OUT of transaction
```

Nếu publish nằm trong transaction:
- Transaction giữ DB connection trong lúc gọi Kafka — chiếm connection lâu.
- Kafka chậm → transaction timeout → DB rollback dù persist thành công.
- Worst: persist commit nhưng publish fail (Kafka down) → DB lệch với event → SAGA hỏng.

Tách giúp transaction ngắn, nhưng vẫn còn nguy cơ dual-write. Phase-9 (Outbox) sẽ giải.

## Implementation của Publisher — `order-messaging` module

Interface ở Application Service. Implementation ở module Kafka (`order-messaging`):

```java
package com.food.ordering.system.order.service.messaging.publisher.kafka;

@Slf4j
@Component
@RequiredArgsConstructor
public class CreateOrderKafkaMessagePublisher implements OrderCreatedPaymentRequestMessagePublisher {

    private final OrderMessagingDataMapper orderMessagingDataMapper;
    private final OrderServiceConfigData orderServiceConfigData;   // chứa topic name
    private final KafkaProducer<String, PaymentRequestAvroModel> kafkaProducer;
    private final OrderKafkaMessageHelper orderKafkaMessageHelper;

    @Override
    public void publish(OrderCreatedEvent domainEvent) {
        String orderId = domainEvent.getOrder().getId().getValue().toString();
        log.info("Received OrderCreatedEvent for order id: {}", orderId);

        try {
            PaymentRequestAvroModel paymentRequestAvroModel =
                orderMessagingDataMapper.orderCreatedEventToPaymentRequestAvroModel(domainEvent);

            kafkaProducer.send(
                orderServiceConfigData.getPaymentRequestTopicName(),
                orderId,
                paymentRequestAvroModel,
                orderKafkaMessageHelper.getKafkaCallback(...));
        } catch (Exception e) {
            log.error("Error sending PaymentRequestAvroModel for order id: {}", orderId, e);
        }
    }
}
```

Implementation **dùng Kafka cụ thể** — Avro model, KafkaProducer, topic name từ config. Domain core không biết gì về Avro hay Kafka.

Phase-4 sẽ học chi tiết Kafka producer/consumer. Bây giờ chỉ cần hiểu **structure**:

```text
Domain Event       Mapper          Avro Model           Kafka Send
─────────────► OrderMessagingDataMapper ──► PaymentRequestAvroModel ──► topic
OrderCreatedEvent                                                      payment-request-topic
```

## Đăng ký Spring bean

`order-container` cần `@ComponentScan` cover toàn bộ package:

```java
// order-container/.../OrderServiceApplication.java
@SpringBootApplication(scanBasePackages = "com.food.ordering.system")
public class OrderServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(OrderServiceApplication.class, args);
    }
}
```

Khi Spring scan thấy `CreateOrderKafkaMessagePublisher` (có `@Component` + implements `OrderCreatedPaymentRequestMessagePublisher`), nó auto wire vào `OrderCreateCommandHandler` qua type interface.

## Sequence end-to-end

```text
HTTP POST /orders
    │
    ▼
OrderController.createOrder()                    [order-application]
    │
    ▼
OrderApplicationServiceImpl.createOrder()        [order-application-service]
    │
    ▼
OrderCreateCommandHandler.createOrder()
    │
    ├── orderCreateHelper.persistOrder(cmd)       @Transactional
    │       ├── checkCustomer
    │       ├── checkRestaurant
    │       ├── createOrderCommandToOrder
    │       ├── orderDomainService.validateAndInitiateOrder   [order-domain-core]
    │       └── orderRepository.save              [order-dataaccess]
    │
    └── orderCreatedPaymentRequestMessagePublisher.publish(event)
            │
            ▼
        CreateOrderKafkaMessagePublisher (impl)   [order-messaging]
            │
            ▼
        Kafka topic: payment-request-topic
```

Đọc kỹ: mỗi module chỉ làm phần của nó. Sửa Kafka không sửa domain. Sửa REST không sửa Kafka. Sửa DB không sửa REST. **Đó là kết quả của Clean Architecture**.

## Branch chiến lược của khoá học

Khoá gốc nói: "**git checkout publish-event-option-1**" — tác giả có branch riêng cho từng option. Bạn nên:

```text
$ git checkout -b publish-event-option-1
# ... code option 1
$ git commit -am "Implement publish event option 1"
$ git checkout main
$ git merge publish-event-option-1
```

Khi vào phase-9:
```text
$ git checkout -b publish-event-outbox
# ... refactor sang outbox
```

Đây là **kỹ thuật học**: giữ trạng thái từng option có thể xem lại để compare. Phase-13 sẽ tạo branch `publish-event-cdc` để so sánh polling vs CDC.

## Bẫy thường gặp với Message Publisher

| Bẫy | Tránh bằng cách |
|---|---|
| Inject `KafkaTemplate` thẳng vào Application Service | KHÔNG. App service chỉ biết interface publisher. KafkaTemplate ở `order-messaging`. |
| Publish nằm trong `@Transactional` cùng persist | Như đã giải thích — connection bị giữ + dual-write. Tách ra. |
| Catch `Exception` rồi log mà không re-throw | Failure âm thầm → SAGA hỏng. Cần handle có chiến lược (retry, dead-letter, hoặc fail nhanh). |
| Implement publisher chứa logic business | KHÔNG. Publisher chỉ map domain event → message → send. Business ở domain. |
| 1 publisher chung cho tất cả event | Mất type safety. Tạo 1 publisher / 1 event type. |
| Reuse Avro model làm Domain Event | Avro là transport — không phải domain. Domain event là pure Java, mapper convert sang Avro lúc publish. |
| Publish trước save | KỊCH BẢN SAI 2 đã nói (bài 1 phase-1). Save trước, publish sau. |
| Hardcode topic name | Đặt vào config (`order-service.payment-request-topic-name`) — flexible. |

## Tóm tắt bài 13

- Mỗi domain event có 1 publisher interface riêng → type safety + tách concern.
- Publisher interface ở `order-application-service/ports/output/message/publisher/`. Implementation ở `order-messaging`.
- CommandHandler **gọi helper** (`@Transactional` cho DB) **rồi publisher** (ngoài transaction).
- Dual-write giữa persist và publish vẫn tồn tại — sẽ vá ở phase-9 (Outbox).
- Đặt mỗi option vào branch riêng (`publish-event-option-1`, `publish-event-outbox`) để học evolution.

**Bài kế tiếp** → [Bài 14: Test toàn bộ domain logic với JUnit + Mockito](08-domain-tests.md)
