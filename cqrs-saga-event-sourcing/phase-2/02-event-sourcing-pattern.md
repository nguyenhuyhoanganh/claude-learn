# Bài 2: Event Sourcing Pattern

## Khái niệm cốt lõi

**Event Sourcing:** Thay vì lưu trạng thái hiện tại của dữ liệu, bạn lưu **toàn bộ lịch sử thay đổi** dưới dạng một chuỗi events được append vào Event Store.

### So sánh: Traditional vs Event Sourcing

**Traditional (lưu state hiện tại):**

```
Customer table:
┌────┬──────────────┬───────────┬────────────┐
│ id │ name         │ email     │ balance    │
├────┼──────────────┼───────────┼────────────┤
│ 1  │ Nguyen Van A │ a@mail.com│ 2,150      │  ← Chỉ thấy hiện tại
└────┴──────────────┴───────────┴────────────┘
```

**Event Sourcing (lưu toàn bộ lịch sử):**

```
Event Store:
┌────┬───────────────────────┬─────────────────────────┬──────────────────────┐
│ id │ event_type            │ payload                 │ timestamp            │
├────┼───────────────────────┼─────────────────────────┼──────────────────────┤
│ 1  │ AccountCreated        │ {balance: 0}            │ 2024-01-01 10:00:00  │
│ 2  │ MoneyDeposited        │ {amount: 2000}          │ 2024-01-05 09:15:00  │
│ 3  │ MoneyWithdrawn        │ {amount: 120}           │ 2024-01-10 14:30:00  │
│ 4  │ MoneyDeposited        │ {amount: 500}           │ 2024-01-15 11:00:00  │
│ 5  │ MoneyWithdrawn        │ {amount: 80}            │ 2024-01-20 16:45:00  │
│ 6  │ MoneyDeposited        │ {amount: 450}           │ 2024-01-25 08:20:00  │
└────┴───────────────────────┴─────────────────────────┴──────────────────────┘

Current balance = 0 + 2000 - 120 + 500 - 80 + 450 = 2,750
```

---

## Các khái niệm quan trọng

### 1. Command
**Intent** — ý định thực hiện một hành động. Dùng **thì hiện tại**.

```
DebitMoney     { accountId, amount }
CreditMoney    { accountId, amount }
CreateCustomer { name, email }
UpdateAddress  { customerId, newAddress }
```

Command không phải là sự kiện đã xảy ra — nó là yêu cầu "hãy làm điều này". Command có thể bị từ chối (validation fail).

### 2. Event
**Fact** — điều đã xảy ra, không thể thay đổi. Dùng **thì quá khứ**.

```
MoneyDebited     { accountId, amount, timestamp }
MoneyCredited    { accountId, amount, timestamp }
CustomerCreated  { customerId, name, email, timestamp }
AddressUpdated   { customerId, oldAddress, newAddress, timestamp }
```

Events là **immutable** — một khi đã lưu, không bao giờ xóa hay sửa.

```
Command → xử lý → Event (nếu thành công)
              → Exception (nếu validation fail)
```

### 3. Event Store
Database đặc biệt chỉ dành để **append** events. Không update, không delete.

Đặc điểm:
- **Append-only**: chỉ thêm vào, không sửa/xóa
- **Ordered**: events có thứ tự (sequence number)
- **Immutable**: events không thể thay đổi sau khi lưu
- **Replayable**: có thể replay tất cả events để tái tạo state

### 4. Aggregate
Object chứa **state và business logic** của một domain entity. Aggregate:
- Nhận và xử lý Commands
- Validate business rules
- Apply Events để thay đổi state
- Publish Events ra ngoài

```java
// Ví dụ conceptual
class BankAccountAggregate {
    String accountId;
    BigDecimal balance;

    // Xử lý command
    void handle(DebitMoneyCommand cmd) {
        if (balance < cmd.amount) throw new InsufficientFundsException();
        apply(new MoneyDebitedEvent(accountId, cmd.amount));
    }

    // Apply event để thay đổi state
    @EventSourcingHandler
    void on(MoneyDebitedEvent event) {
        this.balance = this.balance.subtract(event.amount);
    }
}
```

**Aggregate = Write Side / Command Side của CQRS**

### 5. Projection
**Read-only view** được build từ chuỗi events. Projection lắng nghe events và cập nhật Read Database để phục vụ queries.

```
Events → Projection → Read Database (current state)
```

**Projection = Read Side / Query Side của CQRS**

---

## Event Sourcing + CQRS = Best of Both Worlds

Kết hợp hai pattern:

```
         WRITE SIDE                              READ SIDE
┌──────────────────────────┐          ┌──────────────────────────┐
│  Command Handler         │          │  Projection              │
│         │                │          │         │                │
│         ▼                │          │         ▼                │
│     Aggregate            │          │   Read Database          │
│    (validates &          │  Events  │  (current state,         │
│     produces events)     ├──────────►   optimized for          │
│         │                │          │   specific queries)      │
│         ▼                │          └──────────────────────────┘
│     Event Store          │
│  (all history)           │
└──────────────────────────┘
```

**Write Side:** Lưu MỌI thay đổi → audit trail hoàn chỉnh
**Read Side:** Lưu state hiện tại → query nhanh

---

## Ưu điểm của Event Sourcing

### 1. Auditability (Kiểm toán)
Mọi thay đổi đều có dấu vết. Không ai có thể "xóa" lịch sử:

```
Bank: "Tại sao số dư của tôi giảm $500 hôm qua?"
→ Replay events → MoneyWithdrawn {amount: 500, merchant: "Amazon"} at 15:30
```

### 2. Replayability (Tái phát)
**Time machine cho developers:**

```
Production bug: Projection tính sai balance
→ Fix logic
→ Replay tất cả events từ đầu
→ Projection được rebuild với logic đúng
→ Không mất data!
```

```
Event 1 → Event 2 → Event 3 → ... → Event N
  ↓
Replay với business logic mới → State mới chính xác
```

### 3. Scalability
Write side và Read side scale độc lập (giống CQRS).

### 4. Flexibility
**Tạo projection mới bất kỳ lúc nào** từ events có sẵn:

```
Hôm nay: Projection "current_balance"
6 tháng sau: Product team cần "spending_by_category_last_90_days"
→ Tạo Projection mới, replay events → Done!
→ Không cần thay đổi Event Store!
```

Đây đặc biệt hữu ích cho:
- E-commerce analytics
- Bank statement reports
- User behavior analysis
- Fraud detection

---

## Nhược điểm và thách thức

### 1. Query complexity
Để đọc current state, phải replay tất cả events → chậm với nhiều events.

**Giải pháp:** Snapshot (học ở Phase 7) — lưu state tại một thời điểm, chỉ replay events từ snapshot đó trở đi.

### 2. Schema evolution
Event schema thay đổi → các events cũ vẫn phải readable.

```
EventV1: { amount: 100 }
EventV2: { amount: 100, currency: "USD" }  ← thêm field
```

Cần versioning strategy cẩn thận.

### 3. Learning curve
Cách nghĩ khác hoàn toàn so với CRUD truyền thống.

---

## Ví dụ thực tế: E-Commerce Order

```
Command: PlaceOrder {items: [...], userId: "u1"}
    ↓
Aggregate validate:
  - Inventory có đủ không? ✅
  - User có hợp lệ không? ✅
    ↓
Events:
  Event 1: OrderPlaced       {orderId, items, userId}
  Event 2: PaymentProcessed  {orderId, amount, paymentId}
  Event 3: OrderShipped      {orderId, trackingNumber}
  Event 4: OrderDelivered    {orderId, deliveredAt}
    ↓
Projections:
  order_status_view: {orderId, status: "DELIVERED"}
  user_order_history: [{orderId, date, amount}, ...]
  shipping_dashboard: {trackingNumber, status, location}
```

---

## Tóm tắt

| Aspect | Traditional CRUD | Event Sourcing |
|---|---|---|
| Lưu gì | Current state | All events |
| Lịch sử | Không có | Đầy đủ |
| Storage | Ít hơn | Nhiều hơn |
| Query | Đơn giản | Cần Projection |
| Audit | Khó/không thể | Đơn giản |
| Replayability | Không | Có |
| Complexity | Thấp | Cao |

> **Khi nào dùng Event Sourcing?**
> - Cần audit trail (banking, healthcare, legal)
> - Cần lịch sử thay đổi (e-commerce order history)
> - Cần debugging với time travel
> - Cần analytics từ historical data
> - Hệ thống phức tạp, high-traffic

**Tiếp theo (Phase 3):** Implement CQRS + Event Sourcing với Axon Framework →
