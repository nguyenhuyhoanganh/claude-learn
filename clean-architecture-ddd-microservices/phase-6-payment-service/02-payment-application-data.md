# Bài 26: Payment Application Service + Data Access

> Giống Order, Payment Application Service: input port (message listener) + output port (repository + publisher) + Command Handler. Bài này nhấn mạnh điểm khác biệt: Payment **không** có REST endpoint — input chỉ qua Kafka.

## Module `payment-application-service`

```text
payment-application-service/src/main/java/com/food/ordering/system/payment/service/domain/
├── PaymentRequestMessageListenerImpl.java
├── PaymentRequestHelper.java                ← @Transactional persist
├── dto/
│   ├── PaymentRequest.java                  (input)
│   └── PaymentResponse.java                 (not used here — Order's)
├── mapper/
│   └── PaymentDataMapper.java
├── ports/
│   ├── input/message/listener/
│   │   └── PaymentRequestMessageListener.java
│   └── output/
│       ├── repository/
│       │   ├── PaymentRepository.java
│       │   ├── CreditEntryRepository.java
│       │   └── CreditHistoryRepository.java
│       └── message/publisher/
│           ├── PaymentCompletedMessagePublisher.java
│           ├── PaymentCancelledMessagePublisher.java
│           └── PaymentFailedMessagePublisher.java
└── outbox/                                  (phase-9 thêm sau)
```

## Input Port — Message Listener

```java
public interface PaymentRequestMessageListener {
    void completePayment(PaymentRequest paymentRequest);
    void cancelPayment(PaymentRequest paymentRequest);
}
```

```java
public record PaymentRequest(
    String id,
    String sagaId,
    String customerId,
    String orderId,
    BigDecimal price,
    Instant createdAt,
    PaymentOrderStatus paymentOrderStatus
) {}
```

PaymentRequest enum:

```java
public enum PaymentOrderStatus { PENDING, CANCELLED }
```

- `PENDING`: lần đầu Order gửi qua → process payment.
- `CANCELLED`: compensation, hoàn tiền.

## Output ports

```java
public interface PaymentRepository {
    Payment save(Payment payment);
    Optional<Payment> findByOrderId(UUID orderId);
}

public interface CreditEntryRepository {
    CreditEntry save(CreditEntry creditEntry);
    Optional<CreditEntry> findByCustomerId(CustomerId customerId);
}

public interface CreditHistoryRepository {
    CreditHistory save(CreditHistory creditHistory);
    Optional<List<CreditHistory>> findByCustomerId(CustomerId customerId);
}

public interface PaymentCompletedMessagePublisher 
    extends DomainEventPublisher<PaymentCompletedEvent> {}

public interface PaymentCancelledMessagePublisher 
    extends DomainEventPublisher<PaymentCancelledEvent> {}

public interface PaymentFailedMessagePublisher 
    extends DomainEventPublisher<PaymentFailedEvent> {}
```

## `PaymentRequestHelper`

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class PaymentRequestHelper {

    private final PaymentDomainService paymentDomainService;
    private final PaymentDataMapper paymentDataMapper;
    private final PaymentRepository paymentRepository;
    private final CreditEntryRepository creditEntryRepository;
    private final CreditHistoryRepository creditHistoryRepository;
    private final PaymentCompletedMessagePublisher completedPublisher;
    private final PaymentCancelledMessagePublisher cancelledPublisher;
    private final PaymentFailedMessagePublisher failedPublisher;

    @Transactional
    public PaymentEvent persistPayment(PaymentRequest paymentRequest) {
        log.info("Received payment complete event for order id: {}", paymentRequest.orderId());

        Payment payment = paymentDataMapper.paymentRequestModelToPayment(paymentRequest);
        CreditEntry creditEntry = getCreditEntry(payment.getCustomerId());
        List<CreditHistory> creditHistories = getCreditHistory(payment.getCustomerId());
        List<String> failureMessages = new ArrayList<>();

        PaymentEvent paymentEvent = paymentDomainService.validateAndInitiatePayment(
            payment, creditEntry, creditHistories, failureMessages);
        persistDbObjects(payment, creditEntry, creditHistories, failureMessages);
        return paymentEvent;
    }

    @Transactional
    public PaymentEvent persistCancelPayment(PaymentRequest paymentRequest) {
        log.info("Received payment rollback event for order id: {}", paymentRequest.orderId());

        Optional<Payment> optional = paymentRepository.findByOrderId(
            UUID.fromString(paymentRequest.orderId()));
        if (optional.isEmpty()) {
            log.error("Payment with order id: {} could not be found!", paymentRequest.orderId());
            throw new PaymentApplicationServiceException(
                "Payment with order id: " + paymentRequest.orderId() + " could not be found!");
        }
        Payment payment = optional.get();
        CreditEntry creditEntry = getCreditEntry(payment.getCustomerId());
        List<CreditHistory> creditHistories = getCreditHistory(payment.getCustomerId());
        List<String> failureMessages = new ArrayList<>();

        PaymentEvent paymentEvent = paymentDomainService.validateAndCancelPayment(
            payment, creditEntry, creditHistories, failureMessages);
        persistDbObjects(payment, creditEntry, creditHistories, failureMessages);
        return paymentEvent;
    }

    private CreditEntry getCreditEntry(CustomerId customerId) {
        Optional<CreditEntry> optional = creditEntryRepository.findByCustomerId(customerId);
        if (optional.isEmpty()) {
            log.error("Could not find credit entry for customer: {}", customerId.getValue());
            throw new PaymentApplicationServiceException(
                "Could not find credit entry for customer: " + customerId.getValue());
        }
        return optional.get();
    }

    private List<CreditHistory> getCreditHistory(CustomerId customerId) {
        Optional<List<CreditHistory>> optional = creditHistoryRepository.findByCustomerId(customerId);
        if (optional.isEmpty()) {
            log.error("Could not find credit history for customer: {}", customerId.getValue());
            throw new PaymentApplicationServiceException(
                "Could not find credit history for customer: " + customerId.getValue());
        }
        return optional.get();
    }

    private void persistDbObjects(Payment payment, CreditEntry creditEntry,
                                  List<CreditHistory> creditHistories, List<String> failureMessages) {
        paymentRepository.save(payment);
        if (failureMessages.isEmpty()) {
            creditEntryRepository.save(creditEntry);
            creditHistoryRepository.save(creditHistories.get(creditHistories.size() - 1));
        }
    }
}
```

Hai method với `@Transactional` riêng: `persistPayment` (process) và `persistCancelPayment` (rollback). Mỗi method load/update DB atomic.

> Lưu ý quan trọng: `persistDbObjects` chỉ save `creditEntry` và history mới nếu **failure messages empty**. Nếu fail, chỉ save Payment với status FAILED — không trừ tiền.

## `PaymentRequestMessageListenerImpl`

```java
@Slf4j
@Service
@Validated
@RequiredArgsConstructor
public class PaymentRequestMessageListenerImpl implements PaymentRequestMessageListener {

    private final PaymentRequestHelper paymentRequestHelper;
    private final PaymentCompletedMessagePublisher completedPublisher;
    private final PaymentCancelledMessagePublisher cancelledPublisher;
    private final PaymentFailedMessagePublisher failedPublisher;

    @Override
    public void completePayment(PaymentRequest paymentRequest) {
        PaymentEvent event = paymentRequestHelper.persistPayment(paymentRequest);
        fireEvent(event);
    }

    @Override
    public void cancelPayment(PaymentRequest paymentRequest) {
        PaymentEvent event = paymentRequestHelper.persistCancelPayment(paymentRequest);
        fireEvent(event);
    }

    private void fireEvent(PaymentEvent event) {
        log.info("Publishing payment event with payment id: {} and order id: {}",
            event.getPayment().getId().getValue(), event.getPayment().getOrderId().getValue());
        if (event instanceof PaymentCompletedEvent completed) {
            completedPublisher.publish(completed);
        } else if (event instanceof PaymentCancelledEvent cancelled) {
            cancelledPublisher.publish(cancelled);
        } else if (event instanceof PaymentFailedEvent failed) {
            failedPublisher.publish(failed);
        }
    }
}
```

**Tinh tế** ở `fireEvent`: pattern matching switch (Java 17). Code tự gọi đúng publisher theo event type.

## Refactor — gộp Publisher

Bài 50 (lesson 050) khoá gốc tách publisher per-event để code rõ. Nhưng nếu thấy `if-else` xấu, có thể refactor — Spring có pattern `Map<Class<?>, Publisher>`:

```java
@Component
public class PaymentEventPublisherFactory {
    private final Map<Class<? extends PaymentEvent>, DomainEventPublisher<? extends PaymentEvent>> publishers;

    public PaymentEventPublisherFactory(/* inject all publishers */) {
        publishers = Map.of(
            PaymentCompletedEvent.class, completedPublisher,
            PaymentCancelledEvent.class, cancelledPublisher,
            PaymentFailedEvent.class, failedPublisher);
    }

    public void publish(PaymentEvent event) {
        publishers.get(event.getClass()).publish(event);
    }
}
```

Trade-off: gọn hơn, mất type safety. Khoá học chọn `if-else` cho rõ ràng.

## Data Access — `payment-dataaccess`

JPA entities:

```java
@Entity
@Table(name = "payments", schema = "payment")
public class PaymentEntity {
    @Id private UUID id;
    private UUID customerId;
    private UUID orderId;
    private BigDecimal price;
    private ZonedDateTime createdAt;
    @Enumerated(EnumType.STRING)
    private PaymentStatus status;
}

@Entity
@Table(name = "credit_entry", schema = "payment")
public class CreditEntryEntity {
    @Id private UUID id;
    @Column(unique = true) private UUID customerId;
    private BigDecimal totalCreditAmount;
}

@Entity
@Table(name = "credit_history", schema = "payment")
public class CreditHistoryEntity {
    @Id private UUID id;
    private UUID customerId;
    private BigDecimal amount;
    @Enumerated(EnumType.STRING)
    private TransactionType type;
}
```

Spring Data repository + Adapter — tương tự Order.

## Messaging — `payment-messaging`

Listener consume từ `payment-request-topic`:

```java
@KafkaListener(id = "${kafka-consumer-config.payment-consumer-group-id}",
               topics = "${payment-service.payment-request-topic-name}")
public void receive(@Payload List<PaymentRequestAvroModel> messages, ...) {
    messages.forEach(message -> {
        if (PaymentOrderStatus.PENDING == message.getPaymentOrderStatus()) {
            paymentRequestMessageListener.completePayment(
                paymentMessagingDataMapper.paymentRequestAvroModelToPaymentRequest(message));
        } else if (PaymentOrderStatus.CANCELLED == message.getPaymentOrderStatus()) {
            paymentRequestMessageListener.cancelPayment(
                paymentMessagingDataMapper.paymentRequestAvroModelToPaymentRequest(message));
        }
    });
    acknowledgment.acknowledge();
}
```

3 publisher gửi event lên `payment-response-topic`:
- `PaymentCompletedKafkaMessagePublisher` — status `COMPLETED`.
- `PaymentCancelledKafkaMessagePublisher` — status `CANCELLED`.
- `PaymentFailedKafkaMessagePublisher` — status `FAILED` + failureMessages.

Cả 3 dùng cùng topic `payment-response-topic` — Order side switch theo `PaymentStatus`.

## Container

```java
@SpringBootApplication(scanBasePackages = "com.food.ordering.system")
public class PaymentServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(PaymentServiceApplication.class, args);
    }
}

@Configuration
public class BeanConfiguration {
    @Bean
    public PaymentDomainService paymentDomainService() {
        return new PaymentDomainServiceImpl();
    }
}
```

`application.yml`:

```yaml
server:
  port: 8282    # khác Order

spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/postgres?currentSchema=payment&...

payment-service:
  payment-request-topic-name: payment-request
  payment-response-topic-name: payment-response

kafka-consumer-config:
  payment-consumer-group-id: payment-topic-consumer
```

## Bẫy thường gặp

| Bẫy | Tránh bằng cách |
|---|---|
| Payment listener không idempotent → duplicate payment | Check `Payment.findByOrderId(...)` trước. Nếu đã tồn tại → skip. Phase-9 sẽ làm thật chặt với Outbox + dedupe. |
| `@Transactional` bao luôn publish | Tách Helper @Transactional, publish ngoài. |
| Save `CreditHistory` mà bug list null | `creditHistories.get(creditHistories.size()-1)` — đảm bảo list không rỗng. |
| Race condition: 2 message PENDING cùng customer → trừ 2 lần | Phase-9 dùng optimistic locking (`@Version`) trên `CreditEntry`. |

## Tóm tắt bài 26

- Payment có cấu trúc giống Order: Application Service + ports + Command Handler + Data Access + Messaging + Container.
- Khác Order: **không REST endpoint**, chỉ Kafka in/out. Input port là `PaymentRequestMessageListener` (gọi từ Kafka listener).
- `PaymentRequestHelper` xử lý 2 case: `persistPayment` (process) + `persistCancelPayment` (rollback compensation).
- Pattern matching switch để chọn đúng publisher theo event type.
- Idempotent là issue chưa giải triệt để — sẽ vá ở phase-9 với optimistic locking + outbox.

**Bài kế tiếp** → [Bài 27: Payment messaging + container + chạy](03-payment-messaging-container.md)
