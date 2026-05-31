# Bài 4: Data migration — chia database khi migrate (phần khó nhất)

90% pain của microservices migration đến từ **data layer**, không phải code. Code có thể duplicate, test, rollback. Data chỉ có 1 copy thật, không rollback đơn giản.

Bài này dạy các pattern thực tế để chia 1 database monolith thành N database microservice mà không mất data, không downtime, không "khi nào thì consistent".

## Vì sao data hard?

Monolith:

```text
+──────────────────+
│ Application      │
│ ─────────────── │
│ All business     │ ──► Single Postgres
│ logic            │     50+ tables, FK chằng chịt, ACID
+──────────────────+
```

Microservices target:

```text
+────────+   +────────+   +────────+   +────────+
│ Auth   │   │ Order  │   │Inventory│  │Shipping│
│        │   │        │   │        │   │        │
└─►AuthDB│   └─►OrderDB│   └─►InvDB │   └─►ShipDB
+────────+   +────────+   +────────+   +────────+
```

Vấn đề lớn:
- **Foreign Key** giữa bảng giờ ở 2 DB khác nhau → SQL `JOIN` không work.
- **ACID transaction** chỉ trong 1 DB → atomic update 2 service không trivial.
- **Data ownership** unclear: bảng `orders` có cột `user_id` — Order hay User own?
- **Read consistency**: User vừa cập nhật profile, đọc order ngay → có data mới chưa?

## 5 pattern data migration

### Pattern 1: Database View

Trước khi migrate code, **đứng từ schema**:

```sql
-- Monolith DB
CREATE TABLE orders (...);
CREATE TABLE reviews (...);

-- View dedicated cho mỗi tương lai-service
CREATE VIEW v_orders FOR Order service AS SELECT ...;
CREATE VIEW v_reviews FOR Review service AS SELECT ...;
```

Bước đầu, microservice **read** qua view → simulate "own database" experience.

Trade-off:
- ✓ Không cần data migration thực sự.
- ✓ Discover dependency dễ — view nào dùng table nào.
- ✗ Vẫn chung infrastructure DB → không scale riêng.
- ✗ Coupling ngầm còn (schema change ảnh hưởng view).

Use khi: explore boundary, chưa commit migration. Sau OK thì pattern tiếp.

### Pattern 2: Database per Service từ đầu

Cleanest pattern:

```text
Monolith DB ──► Dump ──► Split into N DB
                          │
                          ├──► AuthDB (users, sessions)
                          ├──► OrderDB (orders, order_items)
                          ├──► InventoryDB (inventory, stock_moves)
                          └──► ShippingDB (shipments, tracking)

Service code đổi connection string → DB mới của mình.
```

Bước:

```sql
-- Bước 1: Tạo DB mới
CREATE DATABASE auth_db;
CREATE DATABASE order_db;
...

-- Bước 2: Copy table relevant
pg_dump --table users --table sessions monolith | psql auth_db

-- Bước 3: Drop FK cross-DB
-- Trước:
--   orders.user_id REFERENCES users(id)
-- Sau:
--   orders.user_id  -- (no FK, app-level enforce)
```

Trade-off:
- ✓ Clean separation, true microservices.
- ✗ Mất referential integrity → app phải enforce.
- ✗ Distributed transaction không miễn phí (cần Saga).

Đây là **target architecture**. Pattern khác là intermediate.

### Pattern 3: Dual-write

Khi cần migrate dần (Strangler), monolith và microservice cùng tồn tại:

```text
                ┌──► Write ──► Monolith DB (existing)
Service code ──┤
                └──► Write ──► New microservice DB

Read: chỉ từ monolith ban đầu, sau cutover chuyển sang new DB.
```

Implementation:

```java
// Application service ghi dual
public void createOrder(Order order) {
    monolithRepo.save(order);          // Old path

    try {
        newMicroserviceClient.save(order);  // New path
    } catch (Exception e) {
        log.warn("Dual-write to new service failed", e);
        // KHÔNG rollback monolith — eventually consistent
    }
}
```

Trade-off:
- ✓ Bridge migration period.
- ✗ Dual-write có thể out of sync (consumer fail).
- ✗ Cần reconciliation job định kỳ check consistency.

### Pattern 4: Change Data Capture (CDC)

Pattern xịn nhất cho zero-downtime migration. **Debezium** + **Kafka**:

```text
Monolith app ──► Monolith DB ──► WAL/binlog
                                    │
                                    ▼ CDC (Debezium reads log)
                                    │
                                    ▼
                              Kafka topic "monolith.orders"
                                    │
                ┌───────────────────┼────────────────────┐
                ▼                   ▼                    ▼
        OrderService        AnalyticsService    AuditService
        (sync own DB)       (data lake)         (compliance)
```

Bước:

```yaml
# debezium-connector-postgres.yml
name: monolith-cdc
config:
  connector.class: io.debezium.connector.postgresql.PostgresConnector
  database.hostname: monolith-db
  database.dbname: monolith
  table.include.list: public.orders,public.order_items
  topic.prefix: monolith
```

Microservice consume Kafka topic → update own DB.

Trade-off:
- ✓ Zero impact on monolith app (chỉ đọc WAL).
- ✓ Eventually consistent across N consumers.
- ✓ Mới + cũ chạy song song dễ.
- ✗ Tools setup phức tạp.
- ✗ Schema change vẫn cần coordinate.

CDC là tool nên có. Phase 4 EDA sẽ deep-dive.

### Pattern 5: Application-Level Replication via Events

Pattern này yêu cầu app code đã follow EDA:

```text
OrderService write:
  1. Save to OrderDB (own)
  2. Publish event OrderCreated to Kafka

AnalyticsService subscribe OrderCreated → update own table.
InventoryService subscribe OrderCreated → decrement stock.
```

Implementation với **Outbox pattern** (đảm bảo atomic):

```java
@Transactional
public void createOrder(Order order) {
    // 1. Save business data
    orderRepo.save(order);

    // 2. Save event vào table outbox (cùng transaction!)
    outboxRepo.save(new OutboxEvent(
        "OrderCreated",
        order.toJson(),
        Instant.now()
    ));

    // Transaction commit atomic
}

// Separate worker poll outbox → publish Kafka → mark sent
@Scheduled(fixedDelay = 1000)
public void publishOutboxEvents() {
    var events = outboxRepo.findUnpublished(100);
    for (var event : events) {
        kafkaTemplate.send(event.topic, event.payload);
        event.markSent();
        outboxRepo.save(event);
    }
}
```

Outbox đảm bảo "ghi DB + publish event" atomic — không lose event nếu app crash giữa chừng.

## Cross-service JOIN — đừng tránh, redesign

Trước migration, có:

```sql
SELECT o.id, u.name, p.title
FROM orders o
JOIN users u ON o.user_id = u.id
JOIN products p ON o.product_id = p.id;
```

Sau migration, 3 service riêng — không JOIN được.

3 approach handle:

### A. API composition (sync)

```java
// In Order service, when returning order detail
public OrderDetailDto getOrder(String orderId) {
    var order = orderRepo.findById(orderId);
    var user = userServiceClient.getUser(order.userId);  // HTTP call
    var product = productServiceClient.getProduct(order.productId);

    return new OrderDetailDto(order, user, product);
}
```

Trade-off:
- ✓ Always fresh data.
- ✗ N HTTP calls per request → latency.
- ✗ User service down → Order detail không work.

### B. Data replication via events (async)

OrderService **local copy** của User + Product:

```java
@KafkaListener(topics = "user-events")
public void onUserUpdate(UserUpdated event) {
    localUserCache.upsert(event.toUser());
}

public OrderDetailDto getOrder(String orderId) {
    var order = orderRepo.findById(orderId);
    var user = localUserCache.get(order.userId);  // Local fetch
    var product = localProductCache.get(order.productId);

    return new OrderDetailDto(order, user, product);
}
```

Trade-off:
- ✓ Fast (no network).
- ✓ Resilient (User service down vẫn serve).
- ✗ Eventually consistent (user update vài giây mới propagate).
- ✗ Storage cost (data duplicate).

### C. CQRS — dedicated read store

Build **OrderReadModel** chuyên cho query phức tạp:

```text
Order service ──► OrderWriteDB (normalized)
                       │ events
                       ▼
OrderReadModel ──► OrderReadDB (denormalized, joined data)
                       ▲
                       │
GraphQL/REST query ──► OrderReadModel (fast)
```

Phase 5 deep-dive CQRS.

## Pitfalls phổ biến

| Pitfall | Hệ quả | Fix |
|---|---|---|
| Foreign key cross-DB | App crash khi insert | Drop FK, app-level enforce |
| Dual-write inconsistency | Data divergence | Reconciliation job + alert |
| No retention policy DB cũ | Disk full | Set TTL hoặc archive |
| Migrate data và code cùng lúc | Rollback gấp đôi rủi ro | Tách phase: data trước, code sau |
| Quên Outbox | Lose events khi crash | Always Outbox cho event publish |
| Hard-code DB schema in app | Migration khó | Use repository pattern |

## Anti-pattern: Shared schema, multiple connections

```text
3 services cùng connect 1 Postgres, mỗi service "own" vài table.

Auth ──┐
Order ─┼──► Monolith Postgres (vẫn share)
Inv ───┘
```

Có cảm giác "tách rồi" nhưng:
- Schema change của Auth → Order rebuild.
- DB performance issue ảnh hưởng cả 3.
- Migration code dễ ra tay hơn migration data → bạn đang ngụy biện.

→ **Database per service** mandatory cho microservices thực sự.

## Migration sequence — đúng thứ tự

```text
1. Identify boundary (Phase 2 bài 2)
2. Tăng test coverage
3. Setup CDC stream từ monolith DB
4. Build microservice + own DB (empty)
5. Consume CDC → populate own DB
6. Verify consistency (microservice DB == monolith data)
7. Strangler facade route reads → microservice
8. Microservice handle reads, writes vẫn monolith
9. Migrate writes — dual-write hoặc cutover
10. Stop write monolith → microservice là source of truth
11. CDC tắt
12. Drop monolith tables
```

12 bước, mỗi bước có rollback plan. Migration 1 capability = 2-4 tháng cho data, 1-2 tháng cho code.

## Tóm tắt bài 4

- Data migration là **phần khó nhất** của microservices migration.
- 5 pattern: **Database view** (explore) → **DB per service** (target) → **Dual-write** (bridge) → **CDC** (xịn nhất, zero downtime) → **Event-based replication** (kết hợp EDA).
- Cross-service JOIN → 3 approach: **API composition** (sync) / **event replication** (async) / **CQRS read model**.
- **Outbox pattern** đảm bảo atomic "save DB + publish event".
- **12 bước migration sequence** — đừng skip.
- Tránh anti-pattern **shared schema**.

**Phase kế tiếp** → [Phase 3 — Bài 1: Database per Microservice — nguyên tắc bất di bất dịch](../phase-3-principles/01-database-per-service.md)
