# Bài 5: Data Consistency, Complex Transactions và Data Duplication

Bài 2-4 đã giải quyết thách thức đầu tiên (cross-service queries). Còn ba thách thức còn lại của Database-per-Service: dữ liệu rơi vào trạng thái nửa vời khi một bước ghi thất bại (**data consistency**), giao dịch trải qua nhiều DB (**complex transactions**), và dữ liệu bị nhân bản ở nhiều service (**data duplication**). Bài này mổ xẻ cả ba — và hé lộ vì sao Saga + Event-Driven Architecture ra đời.

## Thách thức 2 & 3: nhất quán dữ liệu và giao dịch phân tán

Hai thách thức này luôn đi cùng nhau, nên xét chung. Lấy e-commerce với 3 service:

```text
Người dùng đặt hàng → luồng qua 3 service:

Step 1: Order Service     → tạo đơn hàng     → Order DB     ✅
Step 2: Order Service     → gọi Payment Service
Step 3: Payment Service   → trừ tiền ví      → Payment DB   ✅
Step 4: Payment Service   → gọi Inventory Service
Step 5: Inventory Service → trừ tồn kho      → Inventory DB ✅
```

Khi mọi thứ trơn tru — không vấn đề. Nhưng hãy xét hai kịch bản xấu.

### Kịch bản A: thanh toán thất bại ở giữa

```text
Step 1: Order Service    → tạo đơn hàng → Order DB ✅ (ĐÃ lưu, status = CREATED)
Step 2: Order Service    → gọi Payment Service
Step 3: Payment Service  → THẤT BẠI ❌
        → không trừ tiền, không chạm tới Inventory
```

Kết quả: Order DB **đã** có đơn hàng, nhưng **không** có payment và **không** trừ kho. Dữ liệu nằm ở trạng thái **nửa vời (inconsistent)**.

### Kịch bản B: lỗi ở bước cuối

```text
Step 1: Order Service     → tạo đơn hàng     ✅
Step 3: Payment Service   → trừ tiền         ✅ (tiền đã mất)
Step 5: Inventory Service → Runtime Exception ❌ (kho không trừ)
```

Kết quả: tiền đã trừ, đơn đã tạo, nhưng tồn kho **sai** → mọi khách hàng sau thấy số lượng tồn không đúng.

### Ví dụ thứ hai: trả bill thẻ tín dụng

Ngân hàng với 2 service: Accounts và Cards. Khách trả bill thẻ:

```text
Step 1-2: trừ $100 từ Accounts DB    ✅
Step 3-4: cập nhật outstanding ở Cards DB
          → nếu lỗi ở đây: $100 đã rời tài khoản nhưng KHÔNG về Cards
```

$100 "bốc hơi" — đây lại là một ca data inconsistency, đồng thời là một **complex transaction** (nhiều service, nhiều DB).

### Complex Transaction là gì?

> **Complex Transaction** (giao dịch phức tạp / phân tán) = bất kỳ giao dịch nào trải qua **nhiều hơn một** microservice. Một request chỉ chạy gọn trong một service (một DB) thì **không** phức tạp.

```text
Simple Transaction:   1 request → 1 service → 1 DB → commit/rollback dễ
Complex Transaction:  1 request → N service → N DB → ??? (đây là vấn đề)
```

## Vì sao monolith không gặp vấn đề này?

Trong monolith, mọi bảng nằm trong **một** DB, mọi logic chạy trong **một** codebase → ta gói cả luồng vào **một database transaction**:

```java
@Transactional
public void payCreditCardBill(String accountId, String cardId, int amount) {
    accountRepository.debit(accountId, amount);   // bảng accounts
    cardRepository.adjustOutstanding(cardId, amount); // bảng cards
    // Nếu dòng dưới ném exception → TỰ ĐỘNG rollback dòng trên.
    // Commit chỉ xảy ra khi cả method chạy xong sạch sẽ.
}
```

`@Transactional` của Spring hoạt động vì cả hai thao tác đi trên **cùng một database connection**. Commit bị hoãn đến khi method kết thúc; lỗi giữa chừng → rollback toàn bộ. Đẹp và dễ.

### Trong microservices, `@Transactional` bất lực

```text
Accounts Service (JVM 1, Server A, DB 1)
       ↕ network call
Cards Service    (JVM 2, Server B, DB 2)
```

- Hai JVM khác nhau, hai server khác nhau (có thể hai data center), hai DB connection khác nhau.
- **Không tồn tại** cách tạo một database transaction trải qua hai DB tách rời như vậy.

Đây chính là bản chất của **distributed transaction** (giao dịch phân tán). `@Transactional` chỉ quản được một DB — vô dụng khi giao dịch nhảy qua ranh giới service.

| | Monolith | Microservices |
|---|---|---|
| Số DB trong một giao dịch | 1 | N |
| Cơ chế | `@Transactional` (local) | Không có sẵn — cần Saga |
| Rollback | Tự động, một câu | Phải tự bù trừ (compensating) từng bước |

> **Giải pháp**: **Saga Pattern** — đảm bảo "hoặc tất cả thành công, hoặc nếu một bước hỏng thì rollback (bù trừ) ở mọi service đã ghi trước đó". Saga có hai biến thể (Choreography, Orchestration) — Phase 5 và Phase 6 dành hẳn vài giờ cho nó.

## Thách thức 4: Data Duplication

### Vấn đề

Ngân hàng 4 service. Customer Service sở hữu toàn bộ thông tin cá nhân: `mobileNumber`, `email`, `address`. Nhưng các service khác cũng **cần** vài mảnh thông tin đó để làm việc:

| Service | Cần gì của customer | Để làm gì |
|---|---|---|
| Accounts | mobileNumber, email | Gửi SMS/email báo giao dịch |
| Cards | address | Gửi thẻ mới đến nhà |
| Loans | email, mobileNumber | Liên hệ về khoản vay |

**Cách 1 — gọi API Customer Service mỗi lần cần:**

```text
Accounts Service → GET /customers/{id} → Customer Service → Customer DB
(10 triệu giao dịch/tháng = 10 triệu lời gọi API!)
```

Thảm họa về performance: latency tăng, hạ tầng lãng phí, hóa đơn cloud phình to. Không khả thi.

**Cách 2 — nhân bản (duplicate) vài field cần thiết vào DB của mỗi service:**

```text
Customer DB:  mobileNumber=123, email=..., address=...   (bản gốc, đầy đủ)
Accounts DB:  mobileNumber=123, email=...                ← copy phần cần
Cards DB:     mobileNumber=123, address=...              ← copy phần cần
Loans DB:     mobileNumber=123, email=...                ← copy phần cần
```

Đọc từ DB nội bộ → cực nhanh, không gọi chéo. Nhưng nảy sinh **vấn đề đồng bộ**.

### Vấn đề đồng bộ: khi khách đổi số điện thoại

Khách đổi `mobileNumber` từ `123` → `456`. Customer Service update bản gốc, nhưng các bản copy thì sao?

```text
Customer DB:  mobileNumber=456  ← updated
Accounts DB:  mobileNumber=123  ← stale (cũ)!
Cards DB:     mobileNumber=123  ← stale!
Loans DB:     mobileNumber=123  ← stale!
```

Accounts gửi SMS đến `123` → đến số cũ → sai. Bản copy phải được cập nhật, nếu không data duplication trở thành data **corruption**.

### Giải pháp: Event-Driven Architecture

Customer Service **publish một event** khi mobileNumber đổi; các service khác **subscribe** và tự cập nhật bản copy:

```text
Customer Service
    │  publish: CustomerMobileNumberUpdated { id, newMobile: "456" }
    ▼
┌──────────── Kafka / RabbitMQ (event bus) ────────────┐
└──────────────────────┬───────────────────────────────┘
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
   Accounts Svc    Cards Svc      Loans Svc
   update local    update local   update local
   → 456           → 456          → 456
```

> **Eventual Consistency** (nhất quán cuối cùng): data **không** đồng bộ tức thì — mất vài mili-giây đến vài giây để mọi bản copy hội tụ về `456`. Đổi lại, hệ thống không bị nghẽn.

### Vì sao không dùng synchronous API để đồng bộ?

```text
// Đồng bộ (synchronous) — TỆ:
customerService.update(mobile=456)
    → accountService.updateCustomer(456)   // user phải chờ
    → cardService.updateCustomer(456)      // user phải chờ
    → loanService.updateCustomer(456)      // user phải chờ
    → mới trả response cho user (sau 3 network call nối đuôi!)
```

Người dùng bị bắt chờ 3 lời gọi tuần tự xong mới nhận phản hồi → trải nghiệm tệ, lại còn dễ fail nếu một service down.

```text
// Event-driven (asynchronous) — TỐT:
customerService.update(mobile=456)
    → publish event (không chờ)
    → trả response cho user NGAY ✅
    (các service khác cập nhật trong background)
```

> **Giải pháp thay thế — caching**: vài công ty đặt customer data vào một cache dùng chung (Redis), mọi service đọc từ đó. Nhưng cache cũng phải được giữ tươi mỗi khi customer đổi → vẫn cần event-driven để invalidate/update cache. Dù lưu ở DB nội bộ hay cache, **event-driven vẫn là cách chuẩn** để giải data duplication.

## Bức tranh toàn cảnh — bốn thách thức và lời giải

```text
                    Database-per-Service
                            │
     ┌──────────────┬───────┴───────┬──────────────────┐
     ▼              ▼               ▼                  ▼
Cross-Service   Data            Complex            Data
Queries         Consistency     Transactions       Duplication
     │              │               │                  │
     ▼              ▼               ▼                  ▼
API Composition  Saga          Saga             Event-Driven
/ CQRS           Pattern       Pattern          Architecture
```

| Pattern | Giải quyết | Phase |
|---|---|---|
| API Composition | Cross-service queries (nhỏ) | Phase 1 |
| **CQRS** | Cross-service queries (enterprise) | Phase 2-3 |
| **Event Sourcing** | Audit trail, replay lịch sử | Phase 2-3 |
| **Materialized View** | Đọc xuyên service hiệu quả | Phase 4 |
| **Transactional Outbox** | Publish event đáng tin cậy | Phase 4 |
| **Choreography Saga** | Distributed transactions | Phase 5 |
| **Orchestration Saga** | Distributed transactions (phức tạp) | Phase 6 |

> **Lưu ý quan trọng**: tất cả các pattern này nên triển khai theo **event-driven architecture** (Kafka/RabbitMQ, async). Cố ép chúng vào REST API + lời gọi đồng bộ là đi ngược thiết kế và sẽ gặp đủ vấn đề. CQRS + Event Sourcing là "bộ đôi sát thủ" mà phần lớn enterprise dùng để trị distributed transactions.

## Tóm tắt bài 5

- **Data consistency + complex transactions**: ghi vào nhiều DB, một bước hỏng → dữ liệu nửa vời; đây là **distributed transaction**.
- Monolith trị bằng `@Transactional` (một DB, một connection); microservices **không** có cơ chế tương đương → cần **Saga** (Phase 5-6).
- **Data duplication**: copy vài field customer vào mỗi service để tránh gọi API chéo; phải đồng bộ khi gốc đổi → dùng **Event-Driven Architecture** (eventual consistency), không dùng sync API.
- Bốn thách thức của Database-per-Service → bốn nhóm pattern (API Composition/CQRS, Saga, Saga, Event-Driven) — chính là toàn bộ lộ trình còn lại.

**Bài kế tiếp** → [Phase 2 — Bài 1: CQRS Pattern là gì](../phase-2/01-cqrs-pattern.md)
