# Bài 4: Event-Driven Architecture (Kiến trúc hướng sự kiện)

## Vấn đề với Direct Communication trong Microservices

Trong Microservices truyền thống, các service gọi nhau trực tiếp qua REST / gRPC:

```text
Service A ──call──► Service B
         ──call──► Service C

Vấn đề:
- A phải BIẾT B và C tồn tại (hardcoded URL hoặc service discovery)
- A phải BIẾT API của B và C (endpoint, schema)
- A phải CHỜ B và C respond (synchronous coupling — A blocking)
- B down → A gặp lỗi (cascading failure)
- Thêm Service D mới muốn nhận thông báo từ A → phải sửa code A
```

Đây gọi là **tight coupling** (gắn chặt) — vi phạm triết lý chính của microservices.

## Event-Driven Architecture là gì?

> **Event-Driven Architecture (EDA — kiến trúc hướng sự kiện)** = Các service giao tiếp qua **event** (sự kiện đã xảy ra trong quá khứ, bất biến) thay vì direct API call.

Service không gọi nhau — mà **publish event** vào một message broker và **các service quan tâm tự subscribe** để xử lý.

**Ba thành phần chính:**

- **Event Emitters / Producers** (bộ phát sự kiện): Service sinh ra event khi có chuyện xảy ra ("order_placed", "payment_processed").
- **Event Channel / Message Broker** (kênh truyền sự kiện): Hạ tầng truyền event — Kafka, RabbitMQ, AWS SNS/SQS, Google Pub/Sub.
- **Event Consumers / Subscribers** (bộ nhận và xử lý sự kiện): Service đăng ký lắng nghe event và xử lý.

```text
Trước (direct coupling — Service A biết hết về B và C):
Service A ──call──► Service B
Service A ──call──► Service C

Sau (event-driven — Service A chỉ publish event, không biết ai nhận):
Service A ──emit("order_placed")──► [Broker] ──subscribe──► Service B
                                              ──subscribe──► Service C
                                              ──subscribe──► Service D (new!)
```

**Điểm mấu chốt**: A **không biết** B, C, D là ai. Chỉ biết "đã xảy ra order_placed" — ai quan tâm tự xử lý.

## Ví dụ thực tế: Hệ thống Banking

Hãy theo dõi sự tiến hoá của một hệ thống ngân hàng — minh hoạ sức mạnh thực sự của EDA.

**Setup ban đầu — chỉ có 2 service:**

```text
Frontend → [orders channel] → Account Service
```

**Thêm Mobile Notification (gửi thông báo cho user) — KHÔNG cần sửa Frontend hay Account Service:**

```text
Frontend → [orders channel] → Account Service
                            → Mobile Notification Service (mới!)
```

Mobile Notification chỉ cần **subscribe** kênh "orders" → tự nhận event → gửi notification.

**Thêm Fraud Detection (phát hiện gian lận) — cũng KHÔNG sửa gì:**

```text
Frontend → [orders channel] → Account Service
                            → Notification Service
                            → Fraud Detection Service (mới!)
```

**Thêm tích hợp bên thứ ba — chỉ thêm channel mới:**

```text
Utility Companies (công ty điện nước) ─┐
Payroll Service (trả lương)            ─┼──► [deposits channel] → Account Service
                                                                → Notification Service
```

→ **Mở rộng hệ thống mà KHÔNG cần sửa code các service hiện có!** Đây là sức mạnh của EDA — extensibility (khả năng mở rộng) cực cao.

## Real-time Stream Analysis (Phân tích luồng thời gian thực)

EDA cho phép phân tích event **trong khi chúng đang xảy ra** — không phải chờ batch job hàng đêm:

```text
Luồng giao dịch:
[LA - Restaurant $50] [LA - Gas $60] [TX - Walmart $200] [LA - Coffee $5]
        ↓ event           ↓ event       ↓ event             ↓ event
                          [Broker — Kafka stream]
                                        ↓
                          Fraud Detection Service phân tích:

→ Phát hiện: giao dịch TX trong khi vừa có giao dịch LA
              (cách nhau vài phút, không thể bay từ LA sang TX)
→ Physical impossible!
→ Flag là fraud → freeze account → notify user
```

Loại analysis này không thể làm với batch job — phải xảy ra **ngay tại thời điểm event**.

## Event Sourcing Pattern (Lưu trữ trạng thái dưới dạng event)

> Thay vì lưu **current state** của entity, lưu **toàn bộ các event** đã xảy ra (append-only log — chỉ thêm, không sửa, không xoá).

```text
Cách truyền thống (lưu state hiện tại):
Database row: account_balance = 1500

Event Sourcing (lưu toàn bộ event):
Event 1: deposit(2000)     → balance = 2000
Event 2: withdrawal(300)   → balance = 1700
Event 3: deposit(100)      → balance = 1800
Event 4: withdrawal(300)   → balance = 1500

Current state = replay (chạy lại) tất cả event từ đầu
```

**Lợi ích:**

- **Audit trail hoàn chỉnh**: Biết ai làm gì, khi nào, theo thứ tự nào → cực kỳ quan trọng cho ngân hàng, y tế.
- **Time travel** (du hành thời gian): Có thể tái dựng (reconstruct) state tại **bất kỳ thời điểm nào** trong quá khứ — "balance vào 10h hôm qua là bao nhiêu?".
- **Undo / compensate**: Thêm event đối nghịch (compensating event) thay vì sửa data hiện tại.
- **Không bao giờ mất data**: Event là immutable — không bao giờ bị xoá hay sửa.

**Nhược điểm:**

- State lookup chậm hơn (phải replay event để biết current state).
- Giải pháp: **Snapshot** — định kỳ chụp snapshot current state → khi cần chỉ replay từ snapshot gần nhất, không từ đầu.

Event Sourcing đặc biệt phù hợp với: financial transactions, version control system (Git là một dạng event sourcing!), accounting, audit log.

## CQRS Pattern (Command Query Responsibility Segregation)

CQRS = **Tách bạch trách nhiệm Command và Query** — tức là tách database/service xử lý write khỏi database/service xử lý read.

**Vấn đề 1**: Database có cả read và write → contention (tranh chấp) → chậm. Đặc biệt khi pattern truy cập khác nhau (write ít, read nhiều).

**Vấn đề 2**: Join data từ **nhiều database microservice** khác nhau — không thể JOIN qua mạng.

### Giải pháp CQRS

```text
Write path (Command — thay đổi state):
Client → [Command Service] → Write-optimized DB (vd: relational, ACID)
                          → Emit event → [Broker]

Read path (Query — đọc state):
                          [Broker] → [Query Service] cập nhật Read-optimized DB
Client → [Query Service] → Read-optimized DB (vd: ElasticSearch, Redis, Materialized View)
```

Write DB tối ưu cho consistency và transaction. Read DB tối ưu cho tốc độ query và search.

**Ví dụ thực tế: E-Commerce Product Search**

```text
Product Service:  {product_id, name, price, stock}        ← lưu sản phẩm
Review Service:   {review_id, product_id, rating, text}    ← lưu đánh giá

Vấn đề: User search "iPhone tốt nhất" cần cả product info + reviews
→ 2 DB call (Product DB + Review DB) → slow, complex join
→ Còn phải tính avg_rating từ reviews → chậm thêm

Giải pháp CQRS:
Product Service ──"product_updated"──► [Broker] ──► Product Search Service
Review Service  ──"review_added"────► [Broker] ──┘

Product Search Service có "Materialized View":
{product_id, name, price, stock, avg_rating, review_count}
                                  ↑           ↑
                              Pre-computed từ Review Service events

→ Khi user search: chỉ 1 query nhanh đến Product Search Service ✅
```

**Materialized View** (view đã được tính trước) là một copy của data đã pre-join và pre-aggregate, được duy trì real-time qua event.

**Hai lợi ích chính của CQRS:**

1. **Tách biệt tối ưu read và write**: Mỗi bên tối ưu cho mục đích riêng.
2. **Cross-service join hiệu quả**: Tạo pre-joined materialized view thay vì join qua network.

## Tổng hợp các Event-Driven Patterns

| Pattern | Giải quyết vấn đề gì |
|---------|---------------------|
| **Pub/Sub** | Decoupling — producer không biết consumer |
| **Event Sourcing** | Audit trail, time travel, undo |
| **CQRS** | Tách biệt read/write, cross-service join hiệu quả |
| **Saga** | Distributed transaction không cần 2-phase commit |

## Quality Attributes mà EDA mang lại

| Quality Attribute | Cơ chế |
|---------|--------|
| **Scalability** | Các service không biết nhau → scale độc lập, không bị block |
| **Extensibility** | Thêm subscriber mới mà không cần sửa producer |
| **Fault Tolerance** | Broker buffer event khi consumer down → khi consumer up lại, vẫn xử lý được |
| **Real-time Analytics** | Phân tích stream ngay khi event xảy ra |
| **Auditability** | Event log = source of truth, có thể audit mọi thay đổi |

**Trade-off cần chấp nhận:** Eventual consistency — consumer xử lý async nên có delay nhỏ (millisecond đến giây). Không thể có immediate consistency như SQL transaction.

## Khi nào dùng EDA?

✅ **Phù hợp:**

- Loose coupling giữa các service là priority.
- Cần fanout (1 event → nhiều consumer xử lý song song).
- Async workflow: billing, notification, fulfillment.
- Real-time analytics: fraud detection, metric, monitoring.
- Event sourcing cho domain critical: financial, audit, healthcare.
- Hệ thống cần extensibility cao (thường xuyên thêm tính năng / integration mới).

❌ **Không phù hợp:**

- Cần immediate response (vd: API "tổng số dư hiện tại = ?").
- Ứng dụng CRUD đơn giản, không có async workflow.
- Khi eventual consistency không chấp nhận được (vd: real-time bidding, atomic counter).
- Team chưa quen với distributed system mindset.

## Anti-pattern phổ biến với EDA

1. **Event Soup** (súp event): Quá nhiều loại event lộn xộn không có tổ chức → không ai hiểu event nào là chính.
2. **Synchronous over async**: Dùng EDA nhưng caller vẫn block chờ event response → mất hết lợi ích async.
3. **Schema drift** (schema thay đổi không kiểm soát): Producer đổi schema event → tất cả consumer fail. Cần Schema Registry (vd: Confluent Schema Registry cho Kafka).
4. **Event quá fine-grained** (quá chi tiết): "field_X_updated" thay vì "OrderUpdated" → tốn bandwidth, khó xử lý.

## Tóm tắt bài 4

```text
Event-Driven Architecture:

3 thành phần:
├── Producers: phát event
├── Message Broker: vận chuyển event (Kafka, RabbitMQ)
└── Consumers: subscribe và xử lý event

Patterns chính:
├── Pub/Sub: decoupled fanout
├── Event Sourcing: event log = source of truth (audit, time travel)
└── CQRS: tách read/write + materialized view cho cross-service join

Lợi ích:
├── Loose coupling (service không biết nhau)
├── Extensibility cực cao (thêm consumer không cần sửa producer)
├── Fault tolerance (broker buffer message)
└── Real-time stream processing

Trade-off: eventual consistency (chấp nhận delay nhỏ giữa producer và consumer)
```

Bài kế tiếp sẽ đi sâu vào **Event Stream Processing** — pattern xử lý event ở quy mô khổng lồ.

---
**Bài kế tiếp**: [Bài 5 - Event Stream Processing (Xử lý luồng sự kiện)](05-event-stream-processing.md) →
