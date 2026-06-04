# Bài 25: Payment Service — Domain Core

> Payment service áp **cùng cấu trúc** Hexagonal + DDD như Order. Bài này build domain core: `Payment` aggregate, `CreditEntry` + `CreditHistory` entities, value objects, domain events, domain service. Vì cấu trúc lặp lại, bài giải thích **điểm khác biệt** so với Order.

## Bài toán Payment service

Khi nhận `PaymentRequest` từ Order:
1. **Process payment**: trừ tiền từ `CreditEntry` của customer, ghi `Payment` row, ghi `CreditHistory` row (DEBIT). Publish `PaymentCompletedEvent`.
2. **Cancel payment** (compensation): hoàn tiền vào `CreditEntry`, mark `Payment` CANCELLED, ghi `CreditHistory` row (CREDIT). Publish `PaymentCancelledEvent`.
3. **Validation business rules**:
   - Customer phải có `CreditEntry` (đã đăng ký).
   - `CreditEntry.totalCreditAmount` phải >= `payment.price`.
   - Tính nhất quán: `totalCreditAmount = sum(CREDIT history) - sum(DEBIT history)`.

## Modules

```text
payment-service/
├── payment-domain/
│   ├── payment-domain-core/             ← bài này
│   └── payment-application-service/
├── payment-dataaccess/
├── payment-messaging/
└── payment-container/
```

Y hệt Order, chỉ đổi tên `order-*` → `payment-*`.

## Entities + VO

### `Payment` — Aggregate Root

```java
public class Payment extends AggregateRoot<PaymentId> {
    private final CustomerId customerId;
    private final OrderId orderId;
    private final Money price;
    private PaymentStatus paymentStatus;
    private ZonedDateTime createdAt;

    public void initializePayment() {
        setId(new PaymentId(UUID.randomUUID()));
        createdAt = ZonedDateTime.now(ZoneId.of("UTC"));
    }

    public void validatePayment(List<String> failureMessages) {
        if (price == null || !price.isGreaterThanZero()) {
            failureMessages.add("Total price must be greater than zero!");
        }
    }

    public void updateStatus(PaymentStatus status) {
        this.paymentStatus = status;
    }
}
```

Khác Order:
- Payment **không có entity con** (không như Order có `OrderItem`).
- State đơn giản: `COMPLETED` hoặc `FAILED` hoặc `CANCELLED` — 1 method `updateStatus` thay vì 4 state-changing.
- `validatePayment` đẩy lỗi vào `failureMessages` (list), không throw exception ngay. Vì sao? — Domain Service có thể tổng hợp nhiều validation và trả về cùng lúc.

### `CreditEntry` — Aggregate Root

```java
public class CreditEntry extends AggregateRoot<CreditEntryId> {
    private final CustomerId customerId;
    private Money totalCreditAmount;

    public void addCreditAmount(Money amount) {
        totalCreditAmount = totalCreditAmount.add(amount);
    }

    public void subtractCreditAmount(Money amount) {
        totalCreditAmount = totalCreditAmount.subtract(amount);
    }
}
```

`CreditEntry` track tổng credit còn lại của customer. **Aggregate Root riêng** vì:
- Tự nó là invariant boundary — tổng tiền không được âm.
- Cập nhật độc lập (không cần `Payment` thay đổi).

### `CreditHistory` — Entity

```java
public class CreditHistory extends BaseEntity<CreditHistoryId> {
    private final CustomerId customerId;
    private final Money amount;
    private final TransactionType transactionType;   // DEBIT, CREDIT
}

public enum TransactionType { DEBIT, CREDIT }
```

`CreditHistory` là entity, không Root. Mỗi giao dịch tạo 1 row. Domain Service sẽ enforce: tổng `CREDIT` - tổng `DEBIT` = `CreditEntry.totalCreditAmount`.

## Domain Events

```java
public abstract class PaymentEvent implements DomainEvent<Payment> {
    private final Payment payment;
    private final ZonedDateTime createdAt;
    private final List<String> failureMessages;
    
    protected PaymentEvent(Payment payment, ZonedDateTime createdAt, List<String> failureMessages) {
        this.payment = payment;
        this.createdAt = createdAt;
        this.failureMessages = failureMessages;
    }
    // getter
}

public class PaymentCompletedEvent extends PaymentEvent {
    public PaymentCompletedEvent(Payment payment, ZonedDateTime createdAt) {
        super(payment, createdAt, Collections.emptyList());
    }
}

public class PaymentCancelledEvent extends PaymentEvent {
    public PaymentCancelledEvent(Payment payment, ZonedDateTime createdAt) {
        super(payment, createdAt, Collections.emptyList());
    }
}

public class PaymentFailedEvent extends PaymentEvent {
    public PaymentFailedEvent(Payment payment, ZonedDateTime createdAt, List<String> failureMessages) {
        super(payment, createdAt, failureMessages);
    }
}
```

3 event, mỗi cái có vai trò:
- `PaymentCompletedEvent` — thanh toán thành công → publish lên `payment-response-topic`, Order set PAID.
- `PaymentCancelledEvent` — đã hoàn tiền sau khi Restaurant reject → publish, Order set CANCELLED.
- `PaymentFailedEvent` — thanh toán fail (insufficient credit) → publish, Order set CANCELLED.

`PaymentEvent` abstract gốc — common pattern, tránh repeat code.

## Domain Service

```java
public interface PaymentDomainService {
    PaymentEvent validateAndInitiatePayment(Payment payment,
                                            CreditEntry creditEntry,
                                            List<CreditHistory> creditHistories,
                                            List<String> failureMessages);

    PaymentEvent validateAndCancelPayment(Payment payment,
                                          CreditEntry creditEntry,
                                          List<CreditHistory> creditHistories,
                                          List<String> failureMessages);
}
```

```java
@Slf4j
public class PaymentDomainServiceImpl implements PaymentDomainService {

    @Override
    public PaymentEvent validateAndInitiatePayment(Payment payment,
                                                   CreditEntry creditEntry,
                                                   List<CreditHistory> creditHistories,
                                                   List<String> failureMessages) {
        payment.validatePayment(failureMessages);
        payment.initializePayment();
        validateCreditEntry(payment, creditEntry, failureMessages);
        subtractCreditEntry(payment, creditEntry);
        updateCreditHistory(payment, creditHistories, TransactionType.DEBIT);
        validateCreditHistory(creditEntry, creditHistories, failureMessages);

        if (failureMessages.isEmpty()) {
            log.info("Payment is initiated for order id: {}", payment.getOrderId().getValue());
            payment.updateStatus(PaymentStatus.COMPLETED);
            return new PaymentCompletedEvent(payment,
                ZonedDateTime.now(ZoneId.of("UTC")));
        } else {
            log.info("Payment initiation is failed for order id: {}", payment.getOrderId().getValue());
            payment.updateStatus(PaymentStatus.FAILED);
            return new PaymentFailedEvent(payment,
                ZonedDateTime.now(ZoneId.of("UTC")), failureMessages);
        }
    }

    @Override
    public PaymentEvent validateAndCancelPayment(Payment payment,
                                                 CreditEntry creditEntry,
                                                 List<CreditHistory> creditHistories,
                                                 List<String> failureMessages) {
        payment.validatePayment(failureMessages);
        addCreditEntry(payment, creditEntry);
        updateCreditHistory(payment, creditHistories, TransactionType.CREDIT);

        if (failureMessages.isEmpty()) {
            log.info("Payment is cancelled for order id: {}", payment.getOrderId().getValue());
            payment.updateStatus(PaymentStatus.CANCELLED);
            return new PaymentCancelledEvent(payment, ZonedDateTime.now(ZoneId.of("UTC")));
        } else {
            log.info("Payment cancellation is failed for order id: {}", payment.getOrderId().getValue());
            payment.updateStatus(PaymentStatus.FAILED);
            return new PaymentFailedEvent(payment,
                ZonedDateTime.now(ZoneId.of("UTC")), failureMessages);
        }
    }

    private void validateCreditEntry(Payment payment, CreditEntry creditEntry, List<String> failureMessages) {
        if (payment.getPrice().isGreaterThan(creditEntry.getTotalCreditAmount())) {
            log.error("Customer with id: {} doesn't have enough credit for payment!",
                payment.getCustomerId().getValue());
            failureMessages.add("Customer with id=" + payment.getCustomerId().getValue() 
                + " doesn't have enough credit for payment!");
        }
    }

    private void subtractCreditEntry(Payment payment, CreditEntry creditEntry) {
        creditEntry.subtractCreditAmount(payment.getPrice());
    }

    private void addCreditEntry(Payment payment, CreditEntry creditEntry) {
        creditEntry.addCreditAmount(payment.getPrice());
    }

    private void updateCreditHistory(Payment payment, List<CreditHistory> creditHistories,
                                     TransactionType transactionType) {
        creditHistories.add(CreditHistory.builder()
            .creditHistoryId(new CreditHistoryId(UUID.randomUUID()))
            .customerId(payment.getCustomerId())
            .amount(payment.getPrice())
            .transactionType(transactionType)
            .build());
    }

    private void validateCreditHistory(CreditEntry creditEntry,
                                       List<CreditHistory> creditHistories,
                                       List<String> failureMessages) {
        Money totalCreditHistory = getTotalHistoryAmount(creditHistories, TransactionType.CREDIT);
        Money totalDebitHistory  = getTotalHistoryAmount(creditHistories, TransactionType.DEBIT);

        if (totalDebitHistory.isGreaterThan(totalCreditHistory)) {
            log.error("Customer with id: {} doesn't have enough credit according to credit history!",
                creditEntry.getCustomerId().getValue());
            failureMessages.add("Customer with id=" + creditEntry.getCustomerId().getValue() 
                + " doesn't have enough credit according to credit history!");
        }

        if (!creditEntry.getTotalCreditAmount().equals(totalCreditHistory.subtract(totalDebitHistory))) {
            log.error("Credit history total is not equal to current credit for customer id: {}!",
                creditEntry.getCustomerId().getValue());
            failureMessages.add("Credit history total is not equal to current credit for customer id="
                + creditEntry.getCustomerId().getValue() + "!");
        }
    }

    private Money getTotalHistoryAmount(List<CreditHistory> histories, TransactionType type) {
        return histories.stream()
            .filter(h -> type == h.getTransactionType())
            .map(CreditHistory::getAmount)
            .reduce(Money.ZERO, Money::add);
    }
}
```

### Điểm khác biệt so với Order Domain Service

| | Order | Payment |
|---|---|---|
| Failure handling | Throw `OrderDomainException` ngay | Tích lũy vào `failureMessages` list, quyết định event cuối |
| Event success/fail | Single event type, status field trong Order | Khác **event class** (`Completed` vs `Failed`) |
| Multiple aggregates | 1 aggregate (Order) | 3 (Payment + CreditEntry + CreditHistory list) → orchestrate phức tạp hơn |
| Validation cross-aggregate | Order validate self | Cross-check credit entry với credit history |

**Why tích lũy failureMessages thay vì throw**: Order chỉ throw 1 lỗi cuối cùng. Payment có thể có **nhiều lỗi cùng lúc** (price 0 + insufficient credit) → tích lũy, trả về Event với list lỗi cho service consumer (Order) hiểu được gốc rễ.

## Bẫy thường gặp

| Bẫy | Tránh bằng cách |
|---|---|
| Đặt `creditEntry` và `creditHistories` trong cùng `Payment` aggregate | Sai. Là 2 aggregate riêng — credit entry tồn tại trước payment, sau payment. |
| Validation throw exception ngay khi gặp lỗi đầu | Tích lũy `failureMessages` để báo đầy đủ. |
| Update credit entry không update credit history | Mất audit trail. Luôn cập nhật cả 2 trong cùng method. |
| Domain service gọi `creditEntryRepository.save()` | KHÔNG. Save là việc Application Service. Domain Service chỉ logic. |
| Tính `totalCreditHistory` mỗi request | OK cho khoá học. Production cache hoặc trigger DB. |

## Tóm tắt bài 25

- Payment domain core: 2 Aggregate Root (`Payment`, `CreditEntry`) + 1 Entity (`CreditHistory`).
- 3 Domain Event: `PaymentCompletedEvent`, `PaymentCancelledEvent`, `PaymentFailedEvent` — extend abstract `PaymentEvent`.
- Domain Service tích lũy `failureMessages` list, trả về Event success/fail tương ứng.
- Cross-aggregate validation: tổng `CREDIT` - `DEBIT` history = `totalCreditAmount`.
- Logic giống Order về cấu trúc nhưng khác về handling failure (multiple events vs throw exception).

**Bài kế tiếp** → [Bài 26: Payment Application Service + ports + Data Access](02-payment-application-data.md)
