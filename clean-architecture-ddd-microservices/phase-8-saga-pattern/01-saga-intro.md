# Bài 30: SAGA Pattern — distributed transaction xuyên service

> Phase 5-7 đã chạy được SAGA "không tên" — listener tự chuyển state. Phase 8 **formal hoá** thành SAGA Pattern: định nghĩa SagaStep, process method và rollback method, đưa compensation thành **first-class citizen** trong code. Bài này dạy lý thuyết SAGA + cách triển khai choreography trong khoá.

## Bài toán: distributed transaction trong microservices

Trong monolith, 1 transaction ACID bao trọn nhiều bảng. Trong microservices, mỗi service có DB riêng — không thể `BEGIN TRANSACTION` xuyên DB.

```text
Monolith:
   BEGIN
     UPDATE orders SET status='PAID'
     UPDATE credits SET balance = balance - 50
     INSERT credit_history VALUES (...)
   COMMIT
   → tất cả hoặc không gì.

Microservices:
   Order service          Payment service       Restaurant service
   ↓ update Order         ↓ deduct credit       ↓ approve order
   ✓ DB của tôi           ✓ DB của tôi          ✗ FAIL
                                                  ❓ rollback Order? Payment?
                                                     không có 1 transaction bao trùm.
```

3 cách giải đã thử trong industry:

| Cách | Mô tả | Khi nào dùng |
|---|---|---|
| **2-Phase Commit (2PC)** | Coordinator gửi `prepare` cho mọi service, nếu OK gửi `commit`. | Heritage RDBMS distributed (XA). Nay ít dùng vì block + complex. |
| **TCC (Try-Confirm-Cancel)** | 3-step protocol: try (reserve), confirm hoặc cancel. | Hệ thống cần consistency mạnh. Vẫn block. |
| **SAGA** | Chuỗi local transaction + compensation khi fail. | Microservices event-driven. **Khoá học dùng.** |

## SAGA — lịch sử và ý tưởng cốt lõi

SAGA xuất hiện năm 1987 (Garcia-Molina, Salem) trong context **long-lived transaction** cho RDBMS. Ý tưởng: thay vì giữ lock cả tiếng, chia thành nhiều **local transaction** ngắn. Mỗi local transaction có **compensating action** để "undo" khi cần.

Áp vào microservices 2010s+ — mỗi local transaction nằm trong 1 service riêng.

```text
Transaction T = T1 + T2 + T3 + ... + Tn

Trong SAGA, mỗi Ti có:
- Process method:        thực hiện local transaction
- Compensation method:    đảo ngược local transaction (semantic, không byte-for-byte)
```

**Compensation ≠ rollback**. Rollback là DB undo byte-for-byte. Compensation là **business undo** — refund tiền, gửi email "đơn hủy", revoke credit.

Ví dụ chuỗi book vé:

```text
SAGA Book Trip:
  T1: Book flight     → C1: Cancel flight ticket
  T2: Book hotel      → C2: Cancel hotel booking
  T3: Charge card     → C3: Refund card

Nếu T3 fail:
  C2 (cancel hotel) + C1 (cancel flight)
```

Note: compensation chạy theo **chiều ngược**.

## 2 cách triển khai SAGA

### Choreography
Không có "đầu não". Mỗi service nghe event, phản ứng, publish event tiếp theo.

```text
  Order ──┐
          ▼
       Kafka topic 1
          │
          ▼
       Payment ──┐
                  ▼
              Kafka topic 2
                  │
                  ▼
              Order ──┐
                       ▼
                   Kafka topic 3
                       │
                       ▼
                   Restaurant
                       │
                       ▼
                   Kafka topic 4
                       │
                       ▼
                   Order
```

| Pros | Cons |
|---|---|
| Loose coupling — không có SPOF | Khó trace flow xuyên service |
| Service tự chủ — thêm service mới dễ | Logic SAGA phân tán nhiều service |
| Không cần framework | Compensation logic khó override |

### Orchestration
Có 1 **Orchestrator** điều phối: gọi service A, chờ response, gọi service B, ...

```text
       ┌────────────────┐
       │  Orchestrator   │
       │  (Camunda /    │
       │   Temporal /   │
       │   Axon /        │
       │   custom)       │
       └──────┬──────────┘
              │
   ┌──────────┼──────────┐
   ▼          ▼          ▼
 Order    Payment    Restaurant
```

| Pros | Cons |
|---|---|
| Flow rõ ràng, debug dễ | SPOF (Orchestrator down → mọi SAGA stuck) |
| Compensation tập trung | Tight coupling với Orchestrator |
| Có nhiều framework hỗ trợ (Camunda, Temporal, Eventuate) | Học framework đó |

**Khoá học chọn Choreography** — không cần framework, code thuần Kafka. Order vẫn đóng vai "coordinator soft" (initiate + finalize), nhưng vẫn dùng event để chuyển control.

## SagaStep — interface chuẩn cho mỗi step

```java
package com.food.ordering.system.saga;

public interface SagaStep<T> {
    SagaStep<T> process(T data);
    SagaStep<T> rollback(T data);
}
```

Generic `T` = DTO message (PaymentResponse, RestaurantApprovalResponse...).

Mỗi step implement 2 method:
- `process(T)` — luồng thuận: nhận event, làm việc của step.
- `rollback(T)` — compensation: nhận event báo cần rollback, thực hiện undo.

Phase-8 sẽ có:

| SagaStep | Process | Rollback |
|---|---|---|
| `OrderPaymentSaga` | Nhận PaymentResponse COMPLETED → set Order PAID + gửi restaurant approval request | Nhận PaymentResponse CANCELLED/FAILED → set Order CANCELLED |
| `OrderApprovalSaga` | Nhận RestaurantApprovalResponse APPROVED → set Order APPROVED | Nhận RestaurantApprovalResponse REJECTED → set Order CANCELLING + publish cancel payment request |

## Vai trò của Order trong choreography

Tuy là choreography (không có orchestrator), Order vẫn là **coordinator soft**:

```text
            Order service
            ┌────────────┐
            │             │
   client ─►│ initiate    │
            │             │
            │ → publish OrderCreated → Payment service
            │             │
            │ ← consume PaymentResponse (qua OrderPaymentSaga.process)
            │ → set PAID + publish OrderPaid → Restaurant service
            │             │
            │ ← consume RestaurantApprovalResponse (qua OrderApprovalSaga.process)
            │ → set APPROVED (terminal)
            │             │
            │  (failure)
            │ ← consume RestaurantApprovalResponse REJECTED
            │ → set CANCELLING + publish CancelPayment → Payment service
            │             │
            │ ← consume PaymentResponse CANCELLED (rollback path)
            │ → set CANCELLED (terminal)
            └────────────┘
```

Order:
1. **Initiate** SAGA (REST POST tạo Order, publish event).
2. **Track state** SAGA (Order status reflect SAGA progress).
3. **Coordinate compensation** (khi 1 step fail, publish event compensation).
4. **Finalize** (terminal state APPROVED hoặc CANCELLED).

Đây không phải orchestrator (Order không "ra lệnh") — chỉ là "có 1 service giữ state authoritative".

## Compensation flow chi tiết

Khi Restaurant reject (bước 11 SAGA):

```text
Trước reject:
  Order      [PAID]
  Payment    [COMPLETED]
  Restaurant [pending validation]

Restaurant reject:
  publish RestaurantApprovalResponse(REJECTED, failureMessages)
              ↓
Order consume:
  OrderApprovalSaga.rollback(response)
   ├── OrderDomainService.cancelOrderPayment(order, failureMessages)
   │     └── order.initCancel(failureMessages)   → status CANCELLING
   ├── orderRepository.save(order)
   └── publish OrderCancelledEvent → payment-request topic (type=CANCELLED)

Payment consume:
  PaymentRequestMessageListener.cancelPayment(...)
   ├── PaymentDomainService.validateAndCancelPayment
   │     └── creditEntry.addCreditAmount(price)   → hoàn tiền
   │     └── payment.updateStatus(CANCELLED)
   ├── creditEntryRepository.save
   ├── creditHistoryRepository.save (TransactionType.CREDIT)
   └── publish PaymentCancelledEvent → payment-response topic (status=CANCELLED)

Order consume:
  OrderPaymentSaga.rollback(response)
   ├── OrderDomainService.cancelOrder(order, [])
   │     └── order.cancel([])   → status CANCELLED (terminal)
   └── orderRepository.save(order)
```

**Quan sát**: compensation đi qua đúng các step ngược chiều forward. Code SAGA Step gói gọn logic này — `process` và `rollback` ở cùng class → đọc 1 chỗ thấy cả flow.

## SAGA properties

SAGA chỉ đảm bảo **ACD** chứ không phải ACID:

| Property | Có | Không |
|---|---|---|
| **A**tomicity | ✓ ở semantic level (compensation đảm bảo all-or-nothing eventually) | ✗ không atomic ở technical (intermediate states visible) |
| **C**onsistency | ✓ eventual | ✗ strong consistency |
| **I**solation | ✗ không. Other reads thấy intermediate state | (Cần đọc thêm: Semantic locking, Commutative updates) |
| **D**urability | ✓ mỗi local transaction durable | |

Hệ quả: **isolation thiếu** — nếu user đọc Order khi đang ở `PAID` rồi sau cancel → user thấy `PAID` rồi `CANCELLED`. Phải design UX chấp nhận.

## Bẫy thường gặp SAGA

| Bẫy | Giải |
|---|---|
| Compensation không idempotent | Cancel 2 lần → refund 2 lần → âm tiền. Code check status trước (đã CANCELLED → skip). |
| SAGA forever stuck | Nếu service compensation crash, không ai retry. Phase-9 (Outbox) + scheduler retry. |
| Compensation phải success 100% | Phải thiết kế "always cancellable". Nếu compensation tự fail, alert + manual intervention. |
| Order set PAID rồi cancel ngược về PENDING | SAGA không phải state machine reset. Phải có trạng thái CANCELLING + CANCELLED riêng. |
| Compensation không log/trace | Khó debug. Log đủ orderId, sagaId, step name. |
| Publish event compensation trước khi commit DB | Dual-write. Phase-9 sẽ vá. |
| Multiple SAGA cùng lúc cho 1 entity | Lock optimistic hoặc serialize. Phase-9 dùng `@Version`. |

## So sánh với 2 framework SAGA mainstream

| | Khoá học (custom) | Eventuate Tram | Temporal |
|---|---|---|---|
| Style | Choreography | Cả 2 | Orchestration |
| Persistence của SAGA state | DB của Order (phase-9 thêm Outbox) | DB của Orchestrator | Temporal cluster |
| Compensation | Code tay trong SagaStep.rollback | Annotation `@SagaCommandHandler` | Workflow code |
| Retry, timeout | Code tay | Có | Tích hợp, declarative |
| Visibility | Log + DB | Eventuate UI | Temporal UI |
| Setup phức tạp | Đơn giản | Trung bình | Khá phức tạp |

Khoá học code thuần để bạn **hiểu cơ chế**. Production lớn nên xem xét framework.

## Tóm tắt bài 30

- SAGA = chuỗi local transaction + compensation action, dùng cho distributed transaction trong microservices.
- 2 cách triển khai: Choreography (event-driven, no orchestrator) vs Orchestration (1 trung tâm điều phối).
- Khoá học dùng Choreography qua Kafka; Order là "coordinator soft" giữ state authoritative.
- Mỗi step implement `SagaStep<T>` với 2 method `process` + `rollback`.
- Compensation đi qua đúng chuỗi ngược, mỗi step tự cleanup phía mình.
- SAGA chỉ đảm bảo Atomicity semantic + Consistency eventual — Isolation phải design UX để chấp nhận.

**Bài kế tiếp** → [Bài 31: Code OrderPaymentSaga + OrderApprovalSaga](02-implement-sagas.md)
