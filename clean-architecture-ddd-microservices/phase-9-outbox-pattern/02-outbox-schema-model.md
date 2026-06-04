# Bài 34: Schema + model cho Outbox table

> Outbox cần 2 thứ ở mỗi service: (1) bảng DB lưu message, (2) domain model + mapper. Bài này code: schema SQL cho Order/Payment/Restaurant outbox, enum status chung, domain class `OrderPaymentOutboxMessage`, `OrderApprovalOutboxMessage`.

## SQL schema cho Order outbox

Order service publish 2 loại event → cần 2 outbox table:
- `payment_outbox` cho event đi sang Payment.
- `restaurant_approval_outbox` cho event đi sang Restaurant.

```sql
-- order/payment_outbox
DROP TABLE IF EXISTS "order".payment_outbox CASCADE;

CREATE TABLE "order".payment_outbox
(
    id              uuid NOT NULL,
    saga_id         uuid NOT NULL,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL,
    type            character varying COLLATE pg_catalog."default" NOT NULL,
    payload         jsonb NOT NULL,
    outbox_status   character varying COLLATE pg_catalog."default" NOT NULL,
    saga_status     character varying COLLATE pg_catalog."default" NOT NULL,
    order_status    character varying COLLATE pg_catalog."default" NOT NULL,
    version         integer NOT NULL,
    CONSTRAINT payment_outbox_pkey PRIMARY KEY (id)
);

CREATE INDEX "payment_outbox_saga_status"
    ON "order".payment_outbox (type, outbox_status, saga_status);

CREATE UNIQUE INDEX "payment_outbox_saga_id"
    ON "order".payment_outbox (type, saga_id, saga_status);
```

```sql
-- order/restaurant_approval_outbox
DROP TABLE IF EXISTS "order".restaurant_approval_outbox CASCADE;

CREATE TABLE "order".restaurant_approval_outbox
(
    id              uuid NOT NULL,
    saga_id         uuid NOT NULL,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL,
    type            character varying COLLATE pg_catalog."default" NOT NULL,
    payload         jsonb NOT NULL,
    outbox_status   character varying COLLATE pg_catalog."default" NOT NULL,
    saga_status     character varying COLLATE pg_catalog."default" NOT NULL,
    order_status    character varying COLLATE pg_catalog."default" NOT NULL,
    version         integer NOT NULL,
    CONSTRAINT restaurant_approval_outbox_pkey PRIMARY KEY (id)
);

CREATE INDEX "restaurant_approval_outbox_saga_status"
    ON "order".restaurant_approval_outbox (type, outbox_status, saga_status);

CREATE UNIQUE INDEX "restaurant_approval_outbox_saga_id"
    ON "order".restaurant_approval_outbox (type, saga_id, saga_status);
```

### Giải thích 2 index

**`(type, outbox_status, saga_status)` — không UNIQUE**:
Scheduler query `WHERE type='OrderPaymentRequest' AND outbox_status='STARTED' AND saga_status IN ('STARTED', 'COMPENSATING')`. Index này tăng tốc query đó.

**`(type, saga_id, saga_status)` — UNIQUE**:
1 saga instance + 1 saga_status chỉ có **1 outbox row**. Chống duplicate khi listener vô tình lặp.

Ví dụ: PaymentResponse COMPLETED cho saga X → listener xử lý → INSERT restaurant_approval_outbox(saga_id=X, saga_status=PROCESSING). Nếu Kafka gửi message duplicate → listener thử insert lần 2 → fail vì UNIQUE → skip silently.

## SAGA Status enum

```java
// common-domain/src/main/java/com/food/ordering/system/saga/SagaStatus.java
package com.food.ordering.system.saga;

public enum SagaStatus {
    STARTED,        // Saga vừa bắt đầu, chưa publish event đầu tiên
    PROCESSING,     // Saga đang ở giữa flow (payment done, đang đợi restaurant)
    SUCCEEDED,      // Saga hoàn thành (Order APPROVED)
    COMPENSATING,   // Đang rollback (Restaurant rejected, đợi payment refund)
    COMPENSATED,    // Rollback xong (Order CANCELLED)
    FAILED          // Compensation fail, manual intervention
}
```

## OutboxStatus enum

```java
// common-domain/src/main/java/com/food/ordering/system/outbox/OutboxStatus.java
package com.food.ordering.system.outbox;

public enum OutboxStatus {
    STARTED,        // Message vừa insert, scheduler chưa pick
    COMPLETED,      // Đã publish lên Kafka thành công
    FAILED          // Publish fail nhiều lần
}
```

## Domain Model — OrderPaymentOutboxMessage

`order-application-service` thêm package `outbox`:

```java
package com.food.ordering.system.order.service.domain.outbox.model.payment;

import com.food.ordering.system.outbox.OutboxStatus;
import com.food.ordering.system.saga.SagaStatus;
import com.food.ordering.system.domain.valueobject.OrderStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.time.ZonedDateTime;
import java.util.UUID;

@Data
@Builder
@AllArgsConstructor
public class OrderPaymentOutboxMessage {
    private UUID id;
    private UUID sagaId;
    private ZonedDateTime createdAt;
    private ZonedDateTime processedAt;       // khi publish xong
    private String type;                      // "OrderPaymentRequest"
    private String payload;                   // JSON of OrderPaymentEventPayload
    private SagaStatus sagaStatus;
    private OrderStatus orderStatus;
    private OutboxStatus outboxStatus;
    private int version;
}
```

`OrderApprovalOutboxMessage` cùng pattern, khác type `OrderApprovalRequest`.

## Payload object

```java
package com.food.ordering.system.order.service.domain.outbox.model.payment;

@Data
@Builder
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class OrderPaymentEventPayload {
    @JsonProperty private String orderId;
    @JsonProperty private String customerId;
    @JsonProperty private BigDecimal price;
    @JsonProperty private String createdAt;
    @JsonProperty private String paymentOrderStatus;    // PENDING / CANCELLED
}
```

Payload nhỏ gọn — chỉ field cần để Payment service xử lý. Serialize JSON, lưu vào outbox.

Tương tự `OrderApprovalEventPayload`:

```java
@Data @Builder @AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class OrderApprovalEventPayload {
    @JsonProperty private String orderId;
    @JsonProperty private String restaurantId;
    @JsonProperty private BigDecimal price;
    @JsonProperty private String createdAt;
    @JsonProperty private String restaurantOrderStatus;
    @JsonProperty private List<OrderApprovalEventProduct> products;
}

@Data @Builder @AllArgsConstructor
public class OrderApprovalEventProduct {
    @JsonProperty private String id;
    @JsonProperty private Integer quantity;
}
```

## JPA Entity — `PaymentOutboxEntity`

```java
package com.food.ordering.system.order.service.dataaccess.outbox.payment.entity;

@Getter @Setter @Builder
@AllArgsConstructor @NoArgsConstructor
@Entity
@Table(name = "payment_outbox", schema = "order")
public class PaymentOutboxEntity {
    @Id private UUID id;
    private UUID sagaId;
    private ZonedDateTime createdAt;
    private ZonedDateTime processedAt;
    private String type;
    private String payload;
    @Enumerated(EnumType.STRING) private SagaStatus sagaStatus;
    @Enumerated(EnumType.STRING) private OrderStatus orderStatus;
    @Enumerated(EnumType.STRING) private OutboxStatus outboxStatus;
    @Version private int version;        // optimistic locking
}
```

`@Version` — Hibernate **optimistic locking**. Mỗi UPDATE check version, mismatch → `OptimisticLockingFailureException`. Chống 2 thread sửa cùng 1 outbox row.

## Repository

```java
public interface PaymentOutboxJpaRepository extends JpaRepository<PaymentOutboxEntity, UUID> {

    @Query("SELECT po FROM PaymentOutboxEntity po " +
           "WHERE po.type = ?1 " +
           "AND po.outboxStatus = ?2 " +
           "AND po.sagaStatus IN ?3")
    Optional<List<PaymentOutboxEntity>> findByTypeAndOutboxStatusAndSagaStatus(
        String type, OutboxStatus outboxStatus, SagaStatus... sagaStatus);

    @Query("SELECT po FROM PaymentOutboxEntity po " +
           "WHERE po.type = ?1 " +
           "AND po.sagaId = ?2 " +
           "AND po.sagaStatus IN ?3")
    Optional<PaymentOutboxEntity> findByTypeAndSagaIdAndSagaStatus(
        String type, UUID sagaId, SagaStatus... sagaStatus);

    @Modifying
    @Query("DELETE FROM PaymentOutboxEntity po " +
           "WHERE po.type = ?1 AND po.outboxStatus = ?2 AND po.sagaStatus IN ?3")
    void deleteByTypeAndOutboxStatusAndSagaStatus(
        String type, OutboxStatus outboxStatus, SagaStatus... sagaStatus);
}
```

3 query:
- Scheduler dùng `findByTypeAndOutboxStatusAndSagaStatus` để lấy pending message.
- Listener dùng `findByTypeAndSagaIdAndSagaStatus` để check duplicate / load outbox cho update.
- Cleaner scheduler dùng `deleteByTypeAndOutboxStatusAndSagaStatus` để cleanup.

## Output port — `PaymentOutboxRepository`

```java
public interface PaymentOutboxRepository {
    OrderPaymentOutboxMessage save(OrderPaymentOutboxMessage outbox);
    Optional<List<OrderPaymentOutboxMessage>> findByTypeAndOutboxStatusAndSagaStatus(
        String type, OutboxStatus outboxStatus, SagaStatus... sagaStatus);
    Optional<OrderPaymentOutboxMessage> findByTypeAndSagaIdAndSagaStatus(
        String type, UUID sagaId, SagaStatus... sagaStatus);
    void deleteByTypeAndOutboxStatusAndSagaStatus(
        String type, OutboxStatus outboxStatus, SagaStatus... sagaStatus);
}
```

Implementation `PaymentOutboxRepositoryImpl` wrap JPA repository + mapper.

## Mapper Outbox

```java
@Component
public class OrderOutboxDataAccessMapper {

    public PaymentOutboxEntity orderPaymentOutboxMessageToOutboxEntity(OrderPaymentOutboxMessage msg) {
        return PaymentOutboxEntity.builder()
            .id(msg.getId()).sagaId(msg.getSagaId())
            .createdAt(msg.getCreatedAt()).processedAt(msg.getProcessedAt())
            .type(msg.getType()).payload(msg.getPayload())
            .sagaStatus(msg.getSagaStatus()).orderStatus(msg.getOrderStatus())
            .outboxStatus(msg.getOutboxStatus()).version(msg.getVersion())
            .build();
    }

    public OrderPaymentOutboxMessage paymentOutboxEntityToOrderPaymentOutboxMessage(PaymentOutboxEntity e) {
        return OrderPaymentOutboxMessage.builder()
            .id(e.getId()).sagaId(e.getSagaId())
            .createdAt(e.getCreatedAt()).processedAt(e.getProcessedAt())
            .type(e.getType()).payload(e.getPayload())
            .sagaStatus(e.getSagaStatus()).orderStatus(e.getOrderStatus())
            .outboxStatus(e.getOutboxStatus()).version(e.getVersion())
            .build();
    }
}
```

Tương tự cho `OrderApprovalOutboxMessage` ↔ `ApprovalOutboxEntity`.

## Topic constants — `SagaConstants`

```java
package com.food.ordering.system.saga;

public class SagaConstants {
    public static final String ORDER_SAGA_NAME = "OrderProcessingSaga";

    private SagaConstants() {}
}
```

Saga có "tên" để track. Sau này thêm `LoyaltyPointSaga`, `DeliverySaga` → mỗi outbox biết thuộc saga nào.

## Bẫy thường gặp

| Bẫy | Tránh bằng cách |
|---|---|
| Quên `@Version` ở Outbox entity | OptimisticLocking không hoạt động, race condition giữa scheduler và listener |
| Index outbox không UNIQUE | Duplicate listener insert được 2 row cùng saga_id → bug |
| Payload không có `@JsonInclude(NON_NULL)` | JSON chứa null field thừa thải |
| Payload chứa nguyên `Order` entity | Object lồng nhau, JSON to. Chỉ field cần thôi. |
| Outbox table không có index | Scheduler query full-scan → chậm cực |
| `OutboxStatus` String thay enum | Mất type safety |
| Schema không phải `jsonb` mà `text` | Mất khả năng query JSON ở Postgres |

## Tóm tắt bài 34

- 2 outbox table cho Order: `payment_outbox` + `restaurant_approval_outbox`.
- 9 column: id, saga_id, created_at, type, payload (jsonb), outbox_status, saga_status, order_status, version.
- 2 index: search index (type, outbox_status, saga_status) + UNIQUE (type, saga_id, saga_status).
- Domain model `OrderPaymentOutboxMessage` + payload class — `@JsonInclude(NON_NULL)`.
- JPA entity với `@Version` cho optimistic locking.
- Repository có 3 method: find pending, find by sagaId, delete completed.

**Bài kế tiếp** → [Bài 35: Outbox helper — INSERT outbox trong cùng transaction với Order](03-outbox-helper-save.md)
