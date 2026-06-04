# Bài 41: CQRS Pattern — vì sao tách read và write

> Phase-1 đến 9, Customer = schema + materialized view + trigger SQL. Hoạt động OK ở quy mô nhỏ. Bài này tự hỏi: khi Customer có 100 triệu user, materialized view có scale không? Có nên giữ DB chung cho Customer + Order? Câu trả lời dẫn ta đến CQRS — Command Query Responsibility Segregation.

## CQRS — định nghĩa

**CQRS** (Greg Young, 2010) tách hệ thống thành 2 mặt:
- **Command side** — nhận lệnh ghi (POST/PUT/DELETE), thay đổi state, ghi DB write.
- **Query side** — trả data về client (GET), đọc từ DB read, không thay đổi state.

```text
         WRITE                                    READ
   ┌────────────────┐                       ┌────────────────┐
   │   Client        │                       │   Client        │
   └───────┬────────┘                       └────────┬───────┘
           │ POST /create                            │ GET /list
           ▼                                          ▼
   ┌────────────────┐                       ┌────────────────┐
   │ Command         │                       │ Query           │
   │ Service          │                       │ Service          │
   │ - validate       │                       │ - load           │
   │ - persist        │                       │ - transform      │
   │ - publish event  │                       │ - return         │
   └───────┬────────┘                       └────────┬───────┘
           │ event                                    │
           ▼                                          │
   ┌────────────────┐                       ┌────────┴───────┐
   │ Write DB        │ ─── sync via event ──►│ Read DB         │
   │ (Postgres OLTP) │                       │ (Elasticsearch,│
   │                 │                       │  read replica, │
   │                 │                       │  materialized) │
   └────────────────┘                       └────────────────┘
```

Hai mặt có thể:
- Dùng **DB khác nhau** (Postgres write + Elasticsearch read).
- Dùng **schema khác** trong cùng DB (write normalized, read denormalized).
- Dùng cùng DB nhưng **stored procedure khác** cho write/read.
- Đơn giản: dùng repository khác cho read/write trên cùng DB.

## Vấn đề trước CQRS

### Vấn đề #1: Read vs Write có scale pattern khác nhau

Ví dụ Facebook:
- 1 user post 1 status → 1 write.
- 1000 friend xem status đó → 1000 read.

Tỉ lệ read:write ≈ 1000:1. Nếu dùng cùng DB:
- DB write phải đủ mạnh handle 1000 read.
- Cấp dư thừa cho write, lãng phí.

CQRS: tách. Write DB scale theo write throughput. Read DB scale theo read throughput. Mỗi cái tối ưu cho nhu cầu riêng.

### Vấn đề #2: Read query phức tạp khó tối ưu

Order service có nhu cầu query phức tạp:
- "Top 10 order theo total amount tháng này".
- "Đơn nào đang stuck CANCELLING > 1 giờ".
- "Customer X đã đặt bao nhiêu đơn restaurant Y".

Trên DB write (normalized 3NF), mỗi query JOIN nhiều bảng → chậm.

CQRS: read DB denormalize (1 row có sẵn tất cả) → query đơn giản, nhanh.

### Vấn đề #3: Cùng entity, nhiều shape

Order trong UI dashboard cần:
- Mobile app: chỉ id, status, tracking.
- Admin: full detail + payment + restaurant info.
- Analytics: chỉ price + createdAt.

Cùng API trả full object → lãng phí bandwidth + render chậm. CQRS: nhiều read view, mỗi cái optimized.

## CQRS levels — từ đơn giản đến phức tạp

### Level 0 — Same model, same DB
Spring `OrderService` có method `save()` + `findAll()`. KHÔNG phải CQRS — same object.

### Level 1 — Different repository per concern
```java
public class OrderCommandRepository { save(), update(), delete() }
public class OrderQueryRepository { findById(), findByCustomer(), search() }
```
Cùng DB. Tách code level. Đơn giản.

### Level 2 — Different DTO write vs read
Command: `CreateOrderCommand`. Query: `OrderListItemDto`, `OrderDetailDto`. Nhiều shape.

### Level 3 — Different DB write vs read
Write: Postgres OLTP. Read: Elasticsearch / read replica / materialized view in another DB.

Phase-10 khoá học làm Level 3.

### Level 4 — Event Sourcing kết hợp
Write side chỉ append event vào event store. Không có "current state" trong write DB. Read side build state từ event log.

Khoá học **không** dạy Event Sourcing. Nó là extension của CQRS, phức tạp riêng.

## Áp dụng CQRS cho Customer trong khoá học

### Hiện trạng phase 1-9
```text
[Customer schema in Postgres]
   "customer".customers           (write thật, trigger event refresh view)
        │ trigger SQL
        ▼
   "order".order_customer_m_view  (materialized view, refresh full)
        │ read direct
        ▼
   Order service đọc qua JPA
```

Vấn đề:
- Customer + Order **cùng DB** (chỉ khác schema). Không thật sự decoupled.
- Materialized view refresh **full** mỗi update → chậm dần khi data lớn.
- Customer service hiện tại không tồn tại như microservice riêng → không scale độc lập.

### Phase-10 CQRS
```text
[Customer service]
   schema "customer" trong Postgres riêng     (write side)
   ├── INSERT customers
   └── INSERT customer_outbox                 (publish event qua Kafka)
        │
        ▼
   Customer service scheduler publish CustomerCreatedEvent → Kafka topic "customer"
                                                                       │
                                                                       ▼
[Order service]
   Listener consume customer topic
        │
        ▼
   INSERT "order".customers (local read replica)
        │
        ▼
   OrderService query local table (không qua materialized view nữa)
```

Customer service trở thành microservice **độc lập** với DB riêng (phase này khoá học vẫn dùng chung Postgres instance để gọn, nhưng schema riêng). Customer event publish → Order consume + write local copy.

## CQRS và Eventual Consistency

CQRS tách read khỏi write → **read luôn trễ hơn write**. Trong khoảng thời gian giữa:

```text
T+0:    Customer.update(name="Alice") on Write DB
T+0.1s: Event publish → Kafka
T+0.5s: Order consume → update read replica
T+1s:   Order service query → trả name="Alice"
```

Trong khoảng T+0 đến T+1s, read trả `name="Bob"` (cũ). Đây là **eventual consistency**.

UX design phải chấp nhận:
- Sau khi POST update, redirect đến page khác (không quay lại list ngay).
- Hoặc cache update lạc quan: client tự update UI, server confirm sau.
- Hoặc thông báo: "Your changes will appear in a few seconds".

CQRS đáng giá khi user **chấp nhận** lag vài giây cho phần đọc.

## CQRS + Outbox = perfect match

Customer service phải:
1. INSERT customer.
2. Publish event Kafka.

Đây chính là dual-write — **dùng Outbox vá** (phase-9).

```text
Customer service                          Kafka                Order service
   │                                                              │
   │ POST /customers (write)                                       │
   │   @Transactional                                              │
   │   ├── INSERT customers                                        │
   │   └── INSERT customer_outbox STARTED                          │
   │   commit                                                       │
   │                                                              │
   │ Scheduler 5s                                                   │
   │   └── publish customer-topic ────────────►                     │
   │                                                                │
   │                                          ◄─ consume customer ─│
   │                                                                │ INSERT customers (read replica)
   │                                                                │ trong DB Order
```

CQRS qua Kafka phù hợp với Outbox: đảm bảo atomic write + event.

## Khi nào KHÔNG dùng CQRS

CQRS không free. Cost:
- 2 model (write/read) phải sync.
- 2 DB (hoặc 2 schema) phải maintain.
- Logic sync (Kafka + Outbox + consumer) phức tạp.
- Eventual consistency làm khó UX.

**KHÔNG dùng** khi:
- Read và write throughput tương đương.
- Read query đơn giản (CRUD), không phức tạp.
- Strong consistency yêu cầu.
- Hệ thống nhỏ, team nhỏ.

**DÙNG** khi:
- Read >> write (10:1 trở lên).
- Read query phức tạp, cần denormalize.
- Cần scale read/write độc lập.
- Multi-data-source (Elasticsearch cho search, Redis cho cache, Postgres cho persistent).
- Event-driven architecture sẵn có (Kafka + Outbox).

## So sánh với pattern khác

| Pattern | Mục đích | CQRS có/không cần |
|---|---|---|
| **Read replica** | Scale read | Có thể dùng kèm CQRS |
| **Materialized view** | Tối ưu query 1 read | Có, là 1 implementation |
| **Cache** | Tăng tốc read | Có thể, nhưng khác CQRS (cache cùng schema) |
| **Event Sourcing** | Audit + replay | Optional với CQRS |
| **Saga** | Distributed transaction | Khác topic, có thể dùng kèm |

## Roadmap 4 bài phase 10

```text
Bài 41 (đang đọc):   CQRS intro — vì sao tách read/write
Bài 42:               Setup Customer Kafka topic + service module
Bài 43:               Customer Service — Domain + Outbox + Publish
Bài 44:               Order Service — Consume Customer event + CQRS query
```

## Tóm tắt bài 41

- CQRS = Command Query Responsibility Segregation — tách read và write thành 2 model + có thể 2 DB.
- 4 level CQRS từ đơn giản (cùng DB, repository khác) đến đầy đủ (DB khác, event sync).
- Phase-10 khoá học làm level 3 — Customer service publish event qua Kafka, Order ghi local read replica.
- CQRS + Outbox = perfect match cho atomic + decoupled.
- Eventual consistency là cost — UX phải design accept lag.
- KHÔNG dùng CQRS cho hệ thống nhỏ / read:write balanced / strong consistency mandatory.

**Bài kế tiếp** → [Bài 42: Setup Customer Kafka topic + Customer service module](02-customer-setup.md)
