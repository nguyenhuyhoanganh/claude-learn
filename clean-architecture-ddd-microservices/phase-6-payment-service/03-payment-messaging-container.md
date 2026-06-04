# Bài 27: Payment Messaging + Container + chạy thử

> Bài cuối Payment service: code Kafka producer/consumer cụ thể, cấu hình container, chạy thử cùng Order Service để xác nhận **luồng SAGA bước 1-7** đã hoạt động end-to-end.

## Messaging mapper

```java
@Component
public class PaymentMessagingDataMapper {

    public PaymentRequest paymentRequestAvroModelToPaymentRequest(PaymentRequestAvroModel avroModel) {
        return PaymentRequest.builder()
            .id(avroModel.getId().toString())
            .sagaId(avroModel.getSagaId().toString())
            .customerId(avroModel.getCustomerId().toString())
            .orderId(avroModel.getOrderId().toString())
            .price(avroModel.getPrice())
            .createdAt(avroModel.getCreatedAt())
            .paymentOrderStatus(PaymentOrderStatus.valueOf(avroModel.getPaymentOrderStatus().name()))
            .build();
    }

    public PaymentResponseAvroModel paymentCompletedEventToPaymentResponseAvroModel(
            PaymentCompletedEvent event) {
        Payment payment = event.getPayment();
        return PaymentResponseAvroModel.newBuilder()
            .setId(UUID.randomUUID())
            .setSagaId(UUID.fromString(payment.getOrderId().getValue().toString()))   // tạm
            .setPaymentId(payment.getId().getValue())
            .setCustomerId(payment.getCustomerId().getValue())
            .setOrderId(payment.getOrderId().getValue())
            .setPrice(payment.getPrice().getAmount())
            .setCreatedAt(event.getCreatedAt().toInstant())
            .setPaymentStatus(PaymentStatus.COMPLETED)
            .setFailureMessages(Collections.emptyList())
            .build();
    }

    public PaymentResponseAvroModel paymentCancelledEventToPaymentResponseAvroModel(
            PaymentCancelledEvent event) {
        // tương tự — setPaymentStatus(PaymentStatus.CANCELLED)
    }

    public PaymentResponseAvroModel paymentFailedEventToPaymentResponseAvroModel(
            PaymentFailedEvent event) {
        // tương tự — setPaymentStatus(PaymentStatus.FAILED), setFailureMessages(event.getFailureMessages())
    }
}
```

## Publisher implementation

3 publisher giống pattern:

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class PaymentCompletedKafkaMessagePublisher implements PaymentCompletedMessagePublisher {

    private final PaymentMessagingDataMapper mapper;
    private final PaymentServiceConfigData configData;
    private final KafkaProducer<String, PaymentResponseAvroModel> kafkaProducer;
    private final PaymentKafkaMessageHelper kafkaMessageHelper;

    @Override
    public void publish(PaymentCompletedEvent event) {
        String orderId = event.getPayment().getOrderId().getValue().toString();
        log.info("Received PaymentCompletedEvent for order id: {}", orderId);
        try {
            PaymentResponseAvroModel avroModel = mapper.paymentCompletedEventToPaymentResponseAvroModel(event);
            kafkaProducer.send(
                configData.getPaymentResponseTopicName(),
                orderId,
                avroModel,
                kafkaMessageHelper.getKafkaCallback(
                    configData.getPaymentResponseTopicName(),
                    avroModel, orderId, "PaymentResponseAvroModel"));
        } catch (Exception e) {
            log.error("Error sending PaymentResponseAvroModel: {}", e.getMessage());
        }
    }
}
```

3 publisher khác na ná, chỉ đổi mapper.

## Listener — `PaymentRequestKafkaListener`

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class PaymentRequestKafkaListener implements KafkaConsumer<PaymentRequestAvroModel> {

    private final PaymentRequestMessageListener paymentRequestMessageListener;
    private final PaymentMessagingDataMapper mapper;

    @Override
    @KafkaListener(id = "${kafka-consumer-config.payment-consumer-group-id}",
                   topics = "${payment-service.payment-request-topic-name}")
    public void receive(@Payload List<PaymentRequestAvroModel> messages,
                        @Header(KafkaHeaders.RECEIVED_KEY) List<String> keys,
                        @Header(KafkaHeaders.RECEIVED_PARTITION) List<Integer> partitions,
                        @Header(KafkaHeaders.OFFSET) List<Long> offsets,
                        Acknowledgment acknowledgment) {
        log.info("{} number of payment requests received with keys: {}, partitions: {} and offsets: {}",
            messages.size(), keys, partitions, offsets);

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
                SQLException sqlException = (SQLException) e.getRootCause();
                if (sqlException != null && sqlException.getSQLState() != null &&
                    PSQLState.UNIQUE_VIOLATION.getState().equals(sqlException.getSQLState())) {
                    log.error("Caught unique constraint exception with sql state: {} " +
                        "in PaymentRequestKafkaListener for order id: {}",
                        sqlException.getSQLState(), avroModel.getOrderId());
                    // Idempotent: message duplicated, swallow
                } else {
                    throw new PaymentApplicationServiceException("Throwing DataAccessException: " 
                        + e.getMessage(), e);
                }
            }
        });
        acknowledgment.acknowledge();
    }
}
```

### Idempotency via UNIQUE constraint

Bảng `payment.payments` thêm `UNIQUE(order_id)` — mỗi order chỉ 1 payment row. Nếu Kafka duplicate message → consume lần 2 → insert fail với `UNIQUE_VIOLATION` → catch + skip.

Đây là **idempotency cấp DB**. Phase-9 (Outbox) sẽ làm chặt hơn với optimistic locking.

## Container

```java
@SpringBootApplication(scanBasePackages = "com.food.ordering.system")
public class PaymentServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(PaymentServiceApplication.class, args);
    }
}
```

```yaml
server.port: 8282

spring:
  jpa.open-in-view: false
  jpa.show-sql: true
  jpa.hibernate.ddl-auto: none
  datasource:
    url: jdbc:postgresql://localhost:5432/postgres?currentSchema=payment&...
    username: postgres
    password: admin

payment-service:
  payment-request-topic-name: payment-request
  payment-response-topic-name: payment-response

# kafka-config, producer, consumer: giống Order (cùng cluster, khác consumer group)
kafka-consumer-config:
  payment-consumer-group-id: payment-topic-consumer
  ...
```

## Chạy end-to-end — Order + Payment cùng lúc

1. Khởi Kafka stack: `./start-kafka.sh`.
2. Khởi Postgres + seed schema 4 schema.
3. Khởi Order: `java -jar order-container.jar` (port 8181).
4. Khởi Payment: `java -jar payment-container.jar` (port 8282).
5. Postman POST `/orders` → response `PENDING`.
6. Đợi 1-2s.
7. Postman GET `/orders/{trackingId}` → response `PAID`.

Log Order:
```text
INFO Order created with id: ab12...
INFO Sending message=... to topic=payment-request
INFO Received successful response from Kafka
INFO Payment completed received for order id: ab12...
INFO Order with id: ab12... is paid
INFO Sending message=... to topic=restaurant-approval-request
```

Log Payment:
```text
INFO Processing payment for order id: ab12...
INFO Received payment complete event for order id: ab12...
INFO Payment is initiated for order id: ab12...
INFO Publishing payment event with payment id: ...
```

DB check:
```text
$ psql -c 'SELECT order_id, status FROM "payment".payments;'
   order_id     | status
   --------------+-----------
   ab12...      | COMPLETED

$ psql -c 'SELECT customer_id, total_credit_amount FROM "payment".credit_entry;'
   customer_id  | total_credit_amount
   --------------+--------------------
   d215...      | 950.00              (-50 từ 1000)
```

## Test failure scenario — insufficient credit

Update credit về 0:
```sql
UPDATE "payment".credit_entry SET total_credit_amount = 0 WHERE customer_id = 'd215...';
```

Order POST → Payment process → fail → publish `PaymentFailedEvent` → Order set `CANCELLED`.

Log Payment:
```text
ERROR Customer with id: d215... doesn't have enough credit for payment!
INFO Payment initiation is failed for order id: ab12...
INFO Publishing payment event...
```

Log Order:
```text
INFO Processing unsuccessful payment for order id: ab12...
INFO Order with id: ab12... is cancelled
```

GET `/orders/{trackingId}` → status `CANCELLED` + `failureMessages: ["Customer with id=d215... doesn't have enough credit for payment!"]`.

## Bẫy thường gặp khi chạy

| Triệu chứng | Nguyên nhân |
|---|---|
| Payment service không nhận message | Group ID trùng với Order — chia tải. Đặt khác nhau. |
| Order vẫn `PENDING` sau 30s | Payment crash hoặc Kafka topic không có. Check log Payment + topic exist. |
| `UNIQUE_VIOLATION` nhưng không phải duplicate | Constraint thiết kế sai. Check schema. |
| Payment 2 lần nhận → 2 row payment (constraint chưa có) | Phải thêm `UNIQUE(order_id)` ngay. |
| `CreditHistory` tổng không khớp `CreditEntry` | Race condition. Phase-9 dùng optimistic locking. |
| Avro deserialize fail | Schema Registry không có schema. Producer chưa publish lần nào. |

## Tóm tắt bài 27

- 3 Kafka Publisher (Completed, Cancelled, Failed) cùng topic `payment-response`.
- Listener `PaymentRequestKafkaListener` catch `UNIQUE_VIOLATION` cho idempotent cấp DB.
- Chạy Order + Payment cùng lúc → SAGA bước 1-7 thông suốt.
- Failure scenario insufficient credit → `PaymentFailedEvent` → Order `CANCELLED`.

**Bài kế tiếp** → [Bài 28 (phase-7): Restaurant Service — Domain Core](../phase-7-restaurant-service/01-restaurant-domain.md)
