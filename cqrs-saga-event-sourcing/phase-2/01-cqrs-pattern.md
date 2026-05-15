# Bài 1: CQRS Pattern — Command Query Responsibility Segregation

## CQRS là gì?

**CQRS = Command Query Responsibility Segregation** — Tách biệt trách nhiệm giữa lệnh (write) và truy vấn (read).

Mọi thao tác với dữ liệu đều rơi vào một trong hai loại:
- **Command**: Thay đổi dữ liệu — Create, Update, Delete
- **Query**: Đọc dữ liệu — SELECT, không thay đổi gì

CQRS đề xuất: **tách hai loại này thành hai component riêng biệt với hai database riêng biệt**.

---

## Kiến trúc CQRS

```
                    ┌─────────────────────┐
Client              │   Write Side        │
 │                  │   (Command)         │
 ├─ Write request ──►                     │
 │                  │  Command Handler    │
 │                  │       │             │
 │                  │       ▼             │
 │                  │   Write Database    │
 │                  │   (Event Store)     │
 │                  └──────────┬──────────┘
 │                             │
 │                    Publish Event
 │                             │
 │                             ▼
 │                    ┌──────────────────┐
 │                    │   Event Bus      │
 │                    │ (Kafka/RabbitMQ) │
 │                    └──────────┬───────┘
 │                               │
 │                    Consume Event
 │                               │
 │                    ┌──────────▼──────────┐
 │                    │   Read Side         │
 │                    │   (Query)           │
 └─ Read request ─────►                     │
                      │  Query Handler      │
                      │       │             │
                      │       ▼             │
                      │   Read Database     │
                      │   (Optimized)       │
                      └─────────────────────┘
```

### Luồng hoạt động

1. **Client gửi Write request** → Command Handler xử lý → lưu vào Write Database
2. **Command Component publish event** lên Event Bus (Kafka/RabbitMQ)
3. **Read Component consume event** → cập nhật Read Database
4. **Client gửi Read request** → Query Handler đọc từ Read Database → trả về

---

## Tại sao cần 2 database riêng?

### Write Database: Tối ưu cho ghi

- Có thể là NoSQL, document store (MongoDB, EventStore)
- Tối ưu cho ACID transactions, data consistency
- Thường lưu dưới dạng Events (Event Sourcing)

### Read Database: Tối ưu cho đọc

- Có thể là relational (PostgreSQL), cache (Redis), Elasticsearch
- Schema được thiết kế cho từng use case query cụ thể
- Không cần ACID, cần fast read

**Ví dụ thực tế:**

```
Write side: MongoDB lưu Customer events dạng JSON documents
Read side:  PostgreSQL với bảng customer_summary được JOIN sẵn
            → UI đọc 1 query đơn giản, không cần JOIN runtime
```

---

## Giải quyết Cross-Service Query với CQRS

Nhớ lại bài toán Profile Page từ Phase 1? 4 services, 4 databases, muốn hiển thị tổng hợp.

**Với API Composition:**
```
API Gateway → Customer Service → Account Service → Loan Service → Card Service
             (4 network calls, latency cao, error handling phức tạp)
```

**Với CQRS:**

```
                Write Side (4 services)
Customer Service ──┐
Accounts Service ──┤ Publish events
Loans Service    ──┤──────────────► Event Bus
Cards Service    ──┘

                Read Side (1 component)
Event Bus ──────────────► Query Component
                          (consume all events)
                               │
                               ▼
                          Read Database
                          ┌──────────────────────────┐
                          │ customer_summary table    │
                          │ (tất cả data được pre-join│
                          │  và optimize sẵn)         │
                          └──────────────────────────┘
                               │
                               ▼
                          Client (1 query, không cần gọi 4 services!)
```

**Lợi thế:** Zero network calls tại runtime cho read operations. Data đã được pre-computed và lưu sẵn trong Read Database.

---

## Eventual Consistency trong CQRS

Sync giữa Write Database và Read Database **không phải ngay lập tức**. Có độ trễ (thường vài milliseconds đến vài seconds).

```
Write Database ──event──► Kafka ──consume──► Read Database
    T=0                  T=0+ε             T=0+ε+δ
```

Đây gọi là **Eventual Consistency** — dữ liệu sẽ nhất quán, nhưng không phải ngay lập tức.

**Khi nào Eventual Consistency là chấp nhận được?**
- Dashboard analytics
- Product listings
- User profile views
- Notification history

**Khi nào KHÔNG chấp nhận được?**
- "Bạn còn đủ tiền không?" trước khi thanh toán
- Số ghế còn lại khi đặt vé
- Số lượng hàng tồn kho cuối cùng trước khi order

→ Những trường hợp này cần synchronous calls, không dùng CQRS.

---

## CQRS kết hợp với Event Sourcing

CQRS thường đi cùng Event Sourcing — đây là combo mạnh nhất:

```
Write Side:  Lưu TOÀN BỘ LỊCH SỬ THAY ĐỔI dưới dạng events (Event Sourcing)
Read Side:   Lưu TRẠNG THÁI HIỆN TẠI được compute từ events (Projection)
```

**Ví dụ Bank Account:**
```
Write Side (Event Store):
  Event 1: AccountCreated {balance: 0}
  Event 2: MoneyDeposited {amount: 2000}
  Event 3: MoneyWithdrawn {amount: 120}
  Event 4: MoneyDeposited {amount: 500}

Read Side (Projection):
  current_balance: 2380  ← computed từ all events
```

→ Sẽ học chi tiết ở bài tiếp theo.

---

## Tóm tắt lợi ích CQRS

| Lợi ích | Giải thích |
|---|---|
| **Scalability** | Scale Write side và Read side độc lập |
| **Optimized Data Model** | Mỗi side dùng database phù hợp nhất |
| **Flexible Queries** | Tạo bao nhiêu projections tùy ý mà không ảnh hưởng Write side |
| **Cross-service Queries** | Giải quyết hiệu quả hơn API Composition |
| **Event Sourcing** | Audit trail đầy đủ, replayability |

## Nhược điểm cần biết

| Nhược điểm | Giải thích |
|---|---|
| **Tăng độ phức tạp** | Hai database, hai component, phải sync |
| **Eventual Consistency** | Không phù hợp mọi use case |
| **Learning curve** | Cần thời gian học framework (Axon) |
| **Development overhead** | Viết nhiều code hơn |

> **Khi nào dùng CQRS?** Enterprise applications, high-traffic (triệu+ transactions/ngày). Với small apps, CQRS là over-engineering.

**Tiếp theo:** Event Sourcing Pattern →
