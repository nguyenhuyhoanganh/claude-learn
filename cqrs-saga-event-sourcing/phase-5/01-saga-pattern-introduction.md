# Bài 1: Saga Pattern — Giải quyết Distributed Transactions

## Vấn đề cần giải quyết

Nhớ lại Phase 1: **Distributed Transactions** là thách thức lớn nhất của microservices.

```
Ví dụ: Cập nhật số điện thoại phải đồng bộ trên 4 services:
Customer Service → Account Service → Card Service → Loan Service

Nếu Card Service fail sau khi Customer và Account đã update:
  Customer DB: mobileNumber = "456" (updated)
  Account DB:  mobileNumber = "456" (updated)
  Card DB:     mobileNumber = "123" (NOT updated) ← inconsistent!
  Loan DB:     mobileNumber = "123" (NOT updated) ← inconsistent!
```

`@Transactional` của Spring không thể span qua nhiều databases khác nhau.

---

## Saga Pattern là gì?

**Saga Pattern** là chuỗi các local transactions. Mỗi local transaction:
- Thực hiện một bước trong business process
- Publish một event (nếu thành công) để trigger bước tiếp theo
- Thực hiện **compensation transaction** (nếu thất bại) để rollback các bước trước

```
Saga = [Tx1, Tx2, Tx3, ..., TxN]

Nếu TxK thất bại:
  Thực hiện: C(K-1), C(K-2), ..., C(1)  ← Compensation transactions
  (rollback theo thứ tự ngược lại)
```

**Compensation transaction ≠ Database rollback**

Compensation là business operation để **undo** effect của transaction trước đó:

```
Tx:   "Tạo đơn hàng" → Compensation: "Hủy đơn hàng"
Tx:   "Trừ tiền tài khoản" → Compensation: "Hoàn tiền tài khoản"
Tx:   "Cập nhật tồn kho" → Compensation: "Hoàn tồn kho"
```

---

## Hai loại Saga

| | Choreography Saga | Orchestration Saga |
|---|---|---|
| Điều phối | Phân tán (mỗi service tự quyết) | Tập trung (Saga Manager) |
| Giao tiếp | Events | Commands + Events |
| Phức tạp | Thấp hơn | Cao hơn |
| Dễ debug | Khó (flow phân tán) | Dễ (flow tập trung) |
| Single point of failure | Không có | Saga Manager |
| Phù hợp | Flow đơn giản, ít services | Flow phức tạp, nhiều services |

---

## Lợi ích của Saga Pattern

### 1. Giải quyết Distributed Transactions
Không cần Two-Phase Commit (2PC) — phức tạp và có performance issues. Saga dùng eventual consistency với compensation.

### 2. Loose Coupling
Mỗi service chỉ cần biết business của mình. Không cần biết internal của services khác.

### 3. Fault Tolerance
Nếu một step fail → compensation tự động rollback các steps trước.

### 4. Scalability
Không có distributed lock → services có thể scale độc lập.

---

## Nhược điểm cần lưu ý

### 1. Complexity
- Cần thiết kế compensation cho mỗi transaction
- Nhiều edge cases: partial success, duplicate events, timeout

### 2. Eventual Consistency
- Data không consistent ngay lập tức
- Trong thời gian saga chạy, data ở trạng thái trung gian

### 3. Không có Atomicity thực sự
- Nếu compensation cũng fail → cần alerting + manual intervention

### 4. Debugging khó hơn
- Flow trải rộng qua nhiều services
- Cần centralized logging và tracing

---

## Khi nào dùng Saga?

**Nên dùng khi:**
- Business operation span qua 2+ microservices
- Cần đảm bảo data consistency across services
- Chấp nhận eventual consistency

**Không nên dùng khi:**
- Single service operation (dùng `@Transactional` là đủ)
- Cần strong consistency tức thì (không thể dùng microservices architecture)

---

## Saga trong thực tế

### E-commerce Order Saga

```
1. CreateOrder            → OrderCreatedEvent
2. ReserveInventory       → InventoryReservedEvent
3. ProcessPayment         → PaymentProcessedEvent
4. ShipOrder             → OrderShippedEvent ← END (happy path)

Compensations:
  PaymentFailed:     → CancelInventoryReservation → CancelOrder
  ShipmentFailed:    → RefundPayment → CancelInventoryReservation → CancelOrder
```

### Bank Mobile Number Update Saga (ví dụ trong khóa học)

```
1. UpdateCustomerMobileNumber  → CustomerMobileNumberUpdatedEvent
2. UpdateAccountMobileNumber   → AccountMobileNumberUpdatedEvent
3. UpdateCardMobileNumber      → CardMobileNumberUpdatedEvent
4. UpdateLoanMobileNumber      → LoanMobileNumberUpdatedEvent ← END

Compensations (nếu step N fail):
  → RollbackCard → RollbackAccount → RollbackCustomer
```

---

## Choreography vs Orchestration — Chọn cái nào?

```
Choreography phù hợp khi:
  ✅ Ít services (2-3)
  ✅ Đội quen với event-driven
  ✅ Flow đơn giản, ít nhánh điều kiện
  ✅ Cần loose coupling tuyệt đối

Orchestration phù hợp khi:
  ✅ Nhiều services (4+)
  ✅ Flow phức tạp với điều kiện
  ✅ Cần rõ ràng về business flow
  ✅ Dễ debug và monitor
  ✅ Đã dùng Axon Framework
```

**Tiếp theo:** Choreography Saga — Implementation →
