# Bài 22: Messaging module — Kafka publisher + listener implementation

> Output port `OrderCreatedPaymentRequestMessagePublisher` cần implementation Kafka. Input port `PaymentResponseMessageListener` cần Kafka listener. Bài này code module `order-messaging` — mapping Domain Event ↔ Avro, publish, consume.

## Cấu trúc

```text
order-messaging/src/main/java/com/food/ordering/system/order/service/messaging/
├── mapper/
│   └── OrderMessagingDataMapper.java         ← Domain ↔ Avro
├── publisher/
│   └── kafka/
│       ├── CreateOrderKafkaMessagePublisher.java
│       └── CancelOrderKafkaMessagePublisher.java
└── listener/
    └── kafka/
        ├── PaymentResponseKafkaListener.java
        └── RestaurantApprovalResponseKafkaListener.java
```

## Dependency `pom.xml`

```xml
<dependencies>
    <dependency>
        <groupId>com.food.ordering.system</groupId>
        <artifactId>order-application-service</artifactId>
    </dependency>
    <dependency>
        <groupId>com.food.ordering.system</groupId>
        <artifactId>kafka-producer</artifactId>
    </dependency>
    <dependency>
        <groupId>com.food.ordering.system</groupId>
        <artifactId>kafka-consumer</artifactId>
    </dependency>
    <dependency>
        <groupId>com.food.ordering.system</groupId>
        <artifactId>kafka-model</artifactId>
    </dependency>
</dependencies>
```

## Mapper `OrderMessagingDataMapper`

```java
@Component
public class OrderMessagingDataMapper {

    public PaymentRequestAvroModel orderCreatedEventToPaymentRequestAvroModel(
            OrderCreatedEvent orderCreatedEvent) {
        Order order = orderCreatedEvent.getOrder();
        return PaymentRequestAvroModel.newBuilder()
            .setId(UUID.randomUUID())                          // message id (chống dedupe)
            .setSagaId(UUID.randomUUID())                      // saga id (phase-8)
            .setCustomerId(order.getCustomerId().getValue())
            .setOrderId(order.getId().getValue())
            .setPrice(order.getPrice().getAmount())
            .setCreatedAt(orderCreatedEvent.getCreatedAt().toInstant())
            .setPaymentOrderStatus(PaymentOrderStatus.PENDING)
            .build();
    }

    public PaymentRequestAvroModel orderCancelledEventToPaymentRequestAvroModel(
            OrderCancelledEvent orderCancelledEvent) {
        Order order = orderCancelledEvent.getOrder();
        return PaymentRequestAvroModel.newBuilder()
            .setId(UUID.randomUUID())
            .setSagaId(UUID.randomUUID())
            .setCustomerId(order.getCustomerId().getValue())
            .setOrderId(order.getId().getValue())
            .setPrice(order.getPrice().getAmount())
            .setCreatedAt(orderCancelledEvent.getCreatedAt().toInstant())
            .setPaymentOrderStatus(PaymentOrderStatus.CANCELLED)
            .build();
    }

    public RestaurantApprovalRequestAvroModel orderPaidEventToRestaurantApprovalRequestAvroModel(
            OrderPaidEvent orderPaidEvent) {
        Order order = orderPaidEvent.getOrder();
        return RestaurantApprovalRequestAvroModel.newBuilder()
            .setId(UUID.randomUUID())
            .setSagaId(UUID.randomUUID())
            .setOrderId(order.getId().getValue())
            .setRestaurantId(order.getRestaurantId().getValue())
            .setRestaurantOrderStatus(RestaurantOrderStatus.PAID)
            .setProducts(order.getItems().stream()
                .map(item -> Product.newBuilder()
                    .setId(item.getProduct().getId().getValue().toString())
                    .setQuantity(item.getQuantity()).build())
                .collect(Collectors.toList()))
            .setPrice(order.getPrice().getAmount())
            .setCreatedAt(orderPaidEvent.getCreatedAt().toInstant())
            .build();
    }

    public PaymentResponse paymentResponseAvroModelToPaymentResponse(
            PaymentResponseAvroModel paymentResponseAvroModel) {
        return PaymentResponse.builder()
            .id(paymentResponseAvroModel.getId().toString())
            .sagaId(paymentResponseAvroModel.getSagaId().toString())
            .paymentId(paymentResponseAvroModel.getPaymentId().toString())
            .customerId(paymentResponseAvroModel.getCustomerId().toString())
            .orderId(paymentResponseAvroModel.getOrderId().toString())
            .price(paymentResponseAvroModel.getPrice())
            .createdAt(paymentResponseAvroModel.getCreatedAt())
            .paymentStatus(PaymentStatus.valueOf(
                paymentResponseAvroModel.getPaymentStatus().name()))
            .failureMessages(paymentResponseAvroModel.getFailureMessages())
            .build();
    }
}
```

Mapper là **biên giới** giữa Domain Event (Java pure) và Avro (transport format). Outside không thấy Avro.

## Publisher implementation

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class CreateOrderKafkaMessagePublisher implements OrderCreatedPaymentRequestMessagePublisher {

    private final OrderMessagingDataMapper orderMessagingDataMapper;
    private final OrderServiceConfigData orderServiceConfigData;
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
                orderKafkaMessageHelper.getKafkaCallback(
                    orderServiceConfigData.getPaymentResponseTopicName(),
                    paymentRequestAvroModel,
                    orderId,
                    "PaymentRequestAvroModel"));

            log.info("PaymentRequestAvroModel sent to Kafka for order id: {}", orderId);
        } catch (Exception e) {
            log.error("Error while sending PaymentRequestAvroModel message to Kafka with order id: {}, error: {}",
                orderId, e.getMessage());
        }
    }
}
```

`CancelOrderKafkaMessagePublisher` tương tự cho event hủy.

## Listener implementation

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class PaymentResponseKafkaListener implements KafkaConsumer<PaymentResponseAvroModel> {

    private final PaymentResponseMessageListener paymentResponseMessageListener;
    private final OrderMessagingDataMapper orderMessagingDataMapper;

    @Override
    @KafkaListener(id = "${kafka-consumer-config.payment-consumer-group-id}",
                   topics = "${order-service.payment-response-topic-name}")
    public void receive(@Payload List<PaymentResponseAvroModel> messages,
                        @Header(KafkaHeaders.RECEIVED_KEY) List<String> keys,
                        @Header(KafkaHeaders.RECEIVED_PARTITION) List<Integer> partitions,
                        @Header(KafkaHeaders.OFFSET) List<Long> offsets,
                        Acknowledgment acknowledgment) {
        log.info("{} number of payment responses received with keys: {}, partitions: {} and offsets: {}",
            messages.size(), keys, partitions, offsets);

        messages.forEach(paymentResponseAvroModel -> {
            try {
                if (PaymentStatus.COMPLETED == paymentResponseAvroModel.getPaymentStatus()) {
                    log.info("Processing successful payment for order id: {}",
                        paymentResponseAvroModel.getOrderId());
                    paymentResponseMessageListener.paymentCompleted(
                        orderMessagingDataMapper.paymentResponseAvroModelToPaymentResponse(
                            paymentResponseAvroModel));
                } else if (PaymentStatus.CANCELLED == paymentResponseAvroModel.getPaymentStatus()
                        || PaymentStatus.FAILED == paymentResponseAvroModel.getPaymentStatus()) {
                    log.info("Processing unsuccessful payment for order id: {}",
                        paymentResponseAvroModel.getOrderId());
                    paymentResponseMessageListener.paymentCancelled(
                        orderMessagingDataMapper.paymentResponseAvroModelToPaymentResponse(
                            paymentResponseAvroModel));
                }
            } catch (OptimisticLockingFailureException e) {
                log.error("Caught optimistic locking exception in PaymentResponseKafkaListener for order id: {}",
                    paymentResponseAvroModel.getOrderId());
            } catch (OrderNotFoundException e) {
                log.error("No order found for order id: {}", paymentResponseAvroModel.getOrderId());
            }
        });
        acknowledgment.acknowledge();
    }
}
```

`RestaurantApprovalResponseKafkaListener` tương tự, switch theo `RestaurantOrderStatus.APPROVED` vs `REJECTED`.

## Implementation `PaymentResponseMessageListenerImpl` (ở Application Service)

```java
@Slf4j
@Service
@RequiredArgsConstructor
public class PaymentResponseMessageListenerImpl implements PaymentResponseMessageListener {

    private final OrderPaymentSaga orderPaymentSaga;   // phase-8

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

Phase-3 đến phase-7 chưa có SAGA — listener gọi trực tiếp `OrderDomainService.payOrder()` rồi publish event tiếp. Phase-8 sẽ tạo `OrderPaymentSaga` để gói gọn flow.

## Sequence end-to-end nhìn lại

```text
HTTP POST /orders
  │
  ▼
OrderController                                  [order-application]
  │
  ▼
OrderApplicationService                          [order-application-service]
  │
  ▼
OrderCreateCommandHandler.createOrder()
  ├── OrderCreateHelper.persistOrder()           [@Transactional]
  │     ├── customerRepository.findCustomer()    [order-dataaccess]
  │     ├── restaurantRepository.findInfo()      [order-dataaccess]
  │     ├── OrderDomainService.validateAndInit() [order-domain-core]
  │     └── orderRepository.save()               [order-dataaccess]
  └── OrderCreatedPaymentRequestMessagePublisher.publish()  
        │                                         [order-messaging]
        ▼
      CreateOrderKafkaMessagePublisher (impl)
        ▼
      Avro: PaymentRequestAvroModel
        ▼
      Kafka topic: payment-request

      ─────── [other service: Payment] ──────

  ◄─────────  Kafka topic: payment-response  ─────
PaymentResponseKafkaListener                     [order-messaging]
  ▼
PaymentResponseMessageListenerImpl               [order-application-service]
  ▼
OrderPaymentSaga (phase-8) | OrderDomainService.payOrder()
  ▼
orderRepository.save() (status=PAID)             [order-dataaccess]
```

Mỗi mũi tên trỏ đúng layer. Sửa Kafka — chỉ chạm `order-messaging`. Sửa REST — chỉ chạm `order-application`. Sửa business — chỉ chạm `order-domain-core`.

## Bẫy thường gặp

| Bẫy | Tránh bằng cách |
|---|---|
| Mapper chứa logic business (vd validate price) | Mapper chỉ map. Business ở domain. |
| Listener không catch exception → kill consumer | Catch loại exception cụ thể; ack vẫn fire. |
| Publish trong `@Transactional` | Đã tách helper riêng ở bài 12. Publish ngoài transaction. |
| Avro `CharSequence` so sánh trực tiếp với `String` | Equals fail. Dùng `.toString()` hoặc `String.valueOf()`. |
| Listener không có `@KafkaListener` annotation | Spring không tự register → consumer không chạy. |
| Group ID listener trùng nhau giữa các topic | OK trong cùng service; SAI nếu cùng group đọc 2 topic khác nhau. |
| Mapper trả `null` thay vì throw | Caller check null sẽ rối. Throw sớm. |
| Listener catch `Throwable` | Bao gồm OOM — nguy hiểm. Catch `Exception` thôi. |

## Tóm tắt bài 22

- `order-messaging` chứa Mapper Domain ↔ Avro, publisher Kafka, listener Kafka.
- Publisher implement output port (interface domain), wrap `KafkaProducer<String, AvroModel>`.
- Listener implement `KafkaConsumer<AvroModel>` + `@KafkaListener` annotation, gọi vào input port.
- Mỗi service có Mapper riêng — không share giữa Order/Payment/Restaurant.
- Catch exception cụ thể, ack offset sau xử lý.

**Bài kế tiếp** → [Bài 23: Container module — Spring Boot main, @Bean, config](04-container-module.md)
