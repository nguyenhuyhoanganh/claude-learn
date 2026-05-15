# Bài 3: Data Consistency, Complex Transactions và Data Duplication

## Thách thức 2: Data Consistency & Complex Transactions

### Ví dụ thực tế: E-Commerce

```
Người dùng tạo đơn hàng → Flow qua 3 services:

Step 1: Order Service    → Tạo đơn hàng → Order DB ✅
Step 2: Order Service    → Gọi Payment Service
Step 3: Payment Service  → Xử lý thanh toán → Payment DB ✅
Step 4: Payment Service  → Gọi Inventory Service
Step 5: Inventory Service→ Cập nhật tồn kho → Inventory DB ✅
```

Flow trên khi mọi thứ bình thường — không có vấn đề gì.

### Kịch bản xấu: Thanh toán thất bại

```
Step 1: Order Service    → Tạo đơn hàng → Order DB ✅ (đã lưu)
Step 2: Order Service    → Gọi Payment Service
Step 3: Payment Service  → THẤT BẠI ❌
Step 4: ???              → Inventory chưa được cập nhật
```

**Kết quả:** Order DB có đơn hàng đã tạo, nhưng không có payment. **Data inconsistent!**

### Kịch bản xấu hơn: Lỗi ở bước cuối

```
Step 1: Order Service    → Tạo đơn hàng ✅
Step 3: Payment Service  → Thanh toán thành công ✅
Step 5: Inventory Service→ Runtime Exception ❌
```

**Kết quả:** Tiền đã bị trừ, đơn hàng đã tạo, nhưng tồn kho không được cập nhật. Hàng tồn kho hiển thị sai với tất cả khách hàng.

---

## Tại sao monolith không có vấn đề này?

```java
// Trong monolith - Spring @Transactional
@Transactional
public void processOrder(OrderRequest request) {
    // Tất cả trên CÙNG 1 database
    orderRepository.save(order);       // Table orders
    paymentRepository.save(payment);   // Table payments  
    inventoryRepository.update(item);  // Table inventory
    // Nếu bất kỳ bước nào lỗi → AUTO ROLLBACK toàn bộ
}
```

`@Transactional` trong Spring hoạt động bởi vì tất cả operations trên **cùng một database connection**. Commit chỉ xảy ra khi method hoàn thành thành công.

### Trong microservices — @Transactional KHÔNG hoạt động

```
Order Service (JVM 1, Server A, Database 1)
    ↕ Network call
Payment Service (JVM 2, Server B, Database 2)
    ↕ Network call
Inventory Service (JVM 3, Server C, Database 3)
```

- Ba JVM khác nhau
- Ba server khác nhau (có thể ở 3 data center khác nhau)
- Ba database connections khác nhau

**Không có cách nào tạo một database transaction span qua 3 database khác nhau.** Đây là bản chất của **Distributed Transactions**.

---

## Complex Transaction là gì?

**Định nghĩa:** Bất kỳ transaction nào liên quan đến nhiều hơn 1 microservice.

```
Simple Transaction:   1 request → 1 service → 1 database → commit/rollback
Complex Transaction:  1 request → N services → N databases → ???
```

Trong monolith: Transaction = đơn giản.
Trong microservices: Transaction = phức tạp (distributed transaction).

**Giải pháp:** **Saga Pattern** — sẽ học ở Phase 5 và Phase 6.

---

## Thách thức 3: Data Duplication

### Vấn đề

Bank application: Customer Service lưu thông tin cá nhân của khách hàng.

Accounts Service cần gửi SMS thông báo giao dịch → cần `mobileNumber` của customer.
Cards Service cần gửi thẻ mới đến nhà → cần `address` của customer.
Loans Service cần liên hệ → cần `email` của customer.

**Option 1: Gọi API Customer Service mỗi khi cần**

```
Accounts Service → GET /customers/{id} → Customer Service → Customer DB
(10 triệu giao dịch/tháng = 10 triệu API calls!)
```

❌ Performance catastrophe. Chi phí infrastructure tăng gấp đôi. Latency tăng.

**Option 2: Duplicate data vào local database**

```
Customer DB:   mobileNumber=123, email=user@mail.com, address=HN
Accounts DB:   mobileNumber=123, email=user@mail.com, address=HN  ← copy
Cards DB:      mobileNumber=123, email=user@mail.com, address=HN  ← copy
Loans DB:      mobileNumber=123, email=user@mail.com, address=HN  ← copy
```

✅ Performance tốt — đọc từ local database.
⚠️ **Nhưng data phải được đồng bộ khi customer update!**

### Vấn đề đồng bộ data duplicate

Customer update số điện thoại từ `123` → `456`:

```
Customer DB:   mobileNumber=456  ← updated
Accounts DB:   mobileNumber=123  ← stale!
Cards DB:      mobileNumber=123  ← stale!
Loans DB:      mobileNumber=123  ← stale!
```

Nếu Accounts Service gửi SMS đến `123` → SMS đến số cũ → sai!

### Giải pháp: Event-Driven Architecture

```
Customer Service
    │
    │ Publish event: CustomerMobileNumberUpdated {id, newMobile: "456"}
    ▼
Kafka / RabbitMQ (Event Bus)
    │
    ├── Accounts Service  → nhận event → update local DB → mobileNumber=456
    ├── Cards Service     → nhận event → update local DB → mobileNumber=456
    └── Loans Service     → nhận event → update local DB → mobileNumber=456
```

**Eventual Consistency:** Data không update tức thì, nhưng trong vài milliseconds/seconds tất cả sẽ đồng nhất.

**Tại sao không dùng synchronous API calls để sync?**

```
// Synchronous approach - BAD
customerService.update(mobile=456)
    → accountService.updateCustomer(mobile=456)  // User phải chờ
    → cardService.updateCustomer(mobile=456)     // User phải chờ  
    → loanService.updateCustomer(mobile=456)     // User phải chờ
    → response to user (sau 3 network calls!)
```

User phải chờ 3 API calls tuần tự hoàn thành mới nhận được response. Trải nghiệm người dùng kém.

**Với Event-Driven:**
```
customerService.update(mobile=456)
    → publish event (async, không chờ)
    → response to user ngay lập tức! ✅
    (Services khác update trong background)
```

---

## Tổng kết: Bức tranh toàn cảnh

```
Database-per-Service Pattern
         │
         ├── Cross-Service Queries  → API Composition hoặc CQRS
         ├── Data Consistency       → Saga Pattern
         ├── Complex Transactions   → Saga Pattern  
         └── Data Duplication       → Event-Driven Architecture
```

| Pattern | Giải quyết | Section |
|---|---|---|
| API Composition | Cross-service queries (nhỏ) | Phase 1 |
| CQRS | Cross-service queries (enterprise) | Phase 2, 3 |
| Event Sourcing | Audit trail, replayability | Phase 2, 3 |
| Materialized View | Efficient cross-service reads | Phase 4 |
| Transactional Outbox | Reliable event publishing | Phase 4 |
| Choreography Saga | Distributed transactions | Phase 5 |
| Orchestration Saga | Distributed transactions (complex) | Phase 6 |

---

> **Key insight:** Tất cả các pattern phức tạp này ra đời chỉ vì một quyết định kiến trúc: **Database-per-Service**. Đây là trade-off cơ bản nhất của microservices — đổi lấy scalability và independence, bạn phải đối mặt với distributed systems complexity.

**Tiếp theo (Phase 2):** CQRS và Event Sourcing — lý thuyết →
