# Bài 5: Technical Flow đầy đủ và các Approaches CQRS

## Technical Flow của CQRS + Event Sourcing (Axon)

Đây là luồng đầy đủ từ khi client gửi request đến khi data được cập nhật trong cả hai databases:

```
CLIENT
  │
  │ POST /api/customers
  │ Body: {name, email, mobileNumber}
  ▼
CONTROLLER
  │ commandGateway.sendAndWait(CreateCustomerCommand)
  ▼
AXON SERVER (command routing)
  │ Route đến đúng CustomerAggregate instance
  ▼
CUSTOMER AGGREGATE (Write Side)
  │ @CommandHandler constructor được gọi
  │ Validate: tên không rỗng, email hợp lệ, v.v.
  │
  │ apply(CustomerCreatedEvent)
  │
  ├─► @EventSourcingHandler on(CustomerCreatedEvent)
  │       this.customerId = event.getCustomerId()
  │       this.name = event.getName()
  │       this.email = event.getEmail()
  │       (State được cập nhật trong memory)
  │
  ▼
AXON SERVER
  │ Lưu CustomerCreatedEvent vào Event Store
  │ (Persistent storage)
  │
  │ Publish CustomerCreatedEvent lên Event Bus
  ▼
CUSTOMER PROJECTION (Read Side)
  │ @EventHandler on(CustomerCreatedEvent)
  │ Tạo Customer entity
  │ customerRepository.save(customer)
  ▼
READ DATABASE
  │ INSERT INTO customers (...) VALUES (...)
  │
  ▼
QUERY CONTROLLER
  │ queryGateway.query(FindCustomerQuery, ...)
  ▼
CUSTOMER PROJECTION
  │ @QueryHandler handle(FindCustomerQuery)
  │ customerRepository.findById(...)
  ▼
READ DATABASE → Response → CLIENT
```

---

## Luồng khi có lỗi trong CommandHandler

```
CLIENT
  │ POST /api/customers
  ▼
CONTROLLER
  │ commandGateway.sendAndWait(CreateCustomerCommand)
  ▼
CUSTOMER AGGREGATE
  │ @CommandHandler - validate...
  │ VALIDATION FAIL! Throw IllegalArgumentException
  │
  │ (Event KHÔNG được apply)
  │ (Event KHÔNG được lưu vào Event Store)
  ▼
AXON SERVER
  │ Propagate exception back to controller
  ▼
CONTROLLER
  │ Catch exception
  │ Return 400 Bad Request
  ▼
CLIENT (nhận error response)
```

**Quan trọng:** Nếu validation fail trong CommandHandler → KHÔNG có event nào được tạo → Event Store không thay đổi → Read Database không thay đổi.

---

## Luồng khi replay events (sau bug fix hoặc thêm Projection mới)

```
Admin trigger replay cho "customer" processor

TRACKING EVENT PROCESSOR
  │ Reset token về position 0
  │
  ├─► Event 1: CustomerCreatedEvent
  │     Projection.on(CustomerCreatedEvent) → INSERT
  │
  ├─► Event 2: CustomerUpdatedEvent
  │     Projection.on(CustomerUpdatedEvent) → UPDATE
  │
  ├─► Event 3: CustomerDeletedEvent
  │     Projection.on(CustomerDeletedEvent) → SOFT DELETE
  │
  └─► ... (tất cả events từ đầu)

READ DATABASE được rebuild hoàn toàn từ events!
```

---

## 5 Approaches để implement CQRS

Transcript mô tả 5 flavors khác nhau:

### Approach 1: CQRS với Single Read/Write Model, Single Database
```
Client → CommandAPI ─────► Database ◄───── QueryAPI ← Client
         (update)                           (read)
```
- **Ưu điểm:** Đơn giản, consistent
- **Nhược điểm:** Không scale độc lập, không tận dụng được lợi thế
- **Khi dùng:** Apps nhỏ, team mới với CQRS concept

### Approach 2: CQRS với Separate Read/Write Models, Single Database
```
Client → CommandAPI → WriteModel ─► Database ◄─ ReadModel ← QueryAPI ← Client
```
- **Ưu điểm:** Code tách biệt, có thể dùng ORM phức tạp cho Write, đơn giản cho Read
- **Nhược điểm:** Vẫn single database, không scale
- **Khi dùng:** Muốn bắt đầu CQRS mà không thêm infrastructure

### Approach 3: CQRS với Separate Databases (không Event Sourcing)
```
Client → CommandAPI → WriteModel ─► Write DB
                            │ Event
                            ▼
                        Event Bus (Kafka)
                            │
                            ▼
                       Read DB ◄─ ReadModel ← QueryAPI ← Client
```
- **Ưu điểm:** Scale độc lập, technology freedom
- **Nhược điểm:** Không có history, event ordering issues, eventual consistency
- **Khi dùng:** Khi muốn CQRS nhưng chưa sẵn sàng Event Sourcing

### Approach 4: CQRS + Event Sourcing (cách học trong khóa này)
```
Client → CommandAPI → Aggregate ─► Event Store (Write DB)
                                        │ Events
                                        ▼
                                    Projection ─► Read DB ← QueryAPI ← Client
```
- **Ưu điểm:** Đầy đủ: audit trail, replayability, scale tốt
- **Nhược điểm:** Phức tạp, learning curve cao
- **Khi dùng:** Enterprise, high-traffic, cần audit

### Approach 5: CQRS + Event Sourcing, Single Database
```
Write side (events table) ─► Database ◄─ Read side (view table)
                               (same DB, different schemas)
```
- **Ưu điểm:** Strong consistency (same DB), ít infrastructure
- **Nhược điểm:** Không scale độc lập
- **Khi dùng:** Khi muốn event sourcing nhưng không muốn 2 database

### Bonus: CQRS với CDC (Change Data Capture)
```
Write DB ─► Transaction Log ─► Debezium (CDC Tool) ─► Kafka ─► Read DB
```
- **Ưu điểm:** Developers viết ít code nhất, không cần publish events thủ công
- **Nhược điểm:** Phụ thuộc infrastructure, khó debug
- **Khi dùng:** Team mạnh về infrastructure, ít developers

**CDC Products:** Debezium (open source, phổ biến nhất), Oracle GoldenGate, AWS DMS

---

## Khi nào dùng approach nào?

```
Team size & expertise
        │
        ├─ Nhỏ, mới học CQRS ──────────► Approach 1 hoặc 2
        │
        ├─ Vừa, muốn scale ────────────► Approach 3
        │
        ├─ Lớn, enterprise ────────────► Approach 4 (Axon Framework)
        │
        └─ Infrastructure-heavy team ──► CDC approach
```

**Lời khuyên thực tế:**
- Không nên over-engineer. Approach 1/2 hoạt động tốt với 80% ứng dụng.
- Approach 4 (Axon) là lựa chọn tốt nhất khi team đã quen với concepts.
- CDC chỉ phù hợp khi team có expertise về Kafka và database internals.

---

## Tóm tắt Phase 3

Bạn đã học:

1. **Axon Framework** — tool để implement CQRS + ES
2. **Commands, Events, Queries** — 3 loại messages
3. **Aggregate** — Write Side: nhận commands, apply events, cập nhật state
4. **Projection** — Read Side: handle events, update Read DB, serve queries
5. **Event Processors** — Subscribing vs Tracking, replay capability
6. **Technical Flow** — đầy đủ từ request đến response
7. **5 CQRS Approaches** — chọn phù hợp với context

**Tiếp theo (Phase 4):** Materialized View Pattern — aggregate data từ nhiều services →
