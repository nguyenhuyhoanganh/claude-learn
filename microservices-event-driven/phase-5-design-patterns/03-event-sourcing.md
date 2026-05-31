# Bài 3: Event Sourcing — events là source of truth

Bạn login vào bank app, thấy balance $1,234. Câu hỏi: balance này tới từ đâu?

Traditional CRUD: lưu `balance = 1234`. Lịch sử = gone (trừ khi có backup). Auditor hỏi "tại sao 1234?" → nhìn vào DB cũng không trả lời được.

**Event Sourcing** đảo lộn cách lưu data: KHÔNG lưu state, chỉ lưu **events**. Balance derive bằng cách replay events từ ngày 1.

## Khác biệt căn bản: state-based vs event-based

### Traditional (state-based) — CRUD

```text
products table:
+──+──────+────────+──────+
│id│ name │ price  │ stock│
+──+──────+────────+──────+
│1 │ iPhone│ 999.0 │ 200  │   ← chỉ "now"
+──+──────+────────+──────+

UPDATE products SET stock = 100 WHERE id = 1;
→ Cũ state overwrite. Lịch sử: gone.
```

Use Case: catalog hiển thị giá hiện tại. Giá cũ? Không ai care.

### Event Sourcing — events là source of truth

```text
events log (append-only):
+──+──────────────────+──────────┬─────────────────────┐
│id│ event_type       │ entity_id│ payload             │
+──+──────────────────+──────────┼─────────────────────+
│1 │ ProductCreated   │ p-1      │ {name:iPhone, stock:0}│
│2 │ StockReceived    │ p-1      │ {qty: 500}          │
│3 │ ProductSold      │ p-1      │ {qty: 300}          │
│4 │ ProductReturned  │ p-1      │ {qty: 50}           │
│5 │ ProductSold      │ p-1      │ {qty: 150}          │
│6 │ StockReceived    │ p-1      │ {qty: 100}          │
+──+──────────────────+──────────┴─────────────────────+

State derived: stock = 0 + 500 - 300 + 50 - 150 + 100 = 200
```

Mỗi sự kiện = **immutable fact**. Không UPDATE, không DELETE. Chỉ APPEND.

## Khi nào CẦN event sourcing

### Case 1: Bank account / financial

Question: "User balance = $1234?" → cần explain:
- Khi nào deposit? Bao nhiêu?
- Withdraw lần nào? ATM nào?
- Có fee nào không?
- Có transaction nào suspicious không?

CRUD bank:
```text
accounts.balance = 1234
→ "1234 là bao nhiêu deposit, bao nhiêu withdraw?"
→ "Idk, check separate transactions table..."
→ ... khả năng inconsistent với balance!
```

Event-sourced bank:
```text
events:
  AccountOpened(initialBalance: 0)
  Deposited(amount: 1500, source: salary)
  Withdrawn(amount: 100, atm: XYZ)
  Withdrawn(amount: 50, online_payment)
  Fee(amount: 16, type: maintenance)
  Deposited(amount: -100, type: ATM_refund) — reverse of earlier ATM error

→ Balance = 0 + 1500 - 100 - 50 - 16 - 100 = 1234. With FULL audit trail.
```

Auditor hỏi → query events table → 100% explainable.

### Case 2: Inventory

Sáng: 200 items. Chiều: 100 items.

CRUD: chỉ biết "−100". Was that:
- 100 sales? (good)
- 200 sales + 100 returns? (bad — high return rate)
- 1 bulk corporate purchase + 99 retail? (need separate tracking)

Event-sourced:
```text
StockReceived(qty: 200)
Sold(qty: 50, customer_type: retail)
Sold(qty: 30, customer_type: retail)
Returned(qty: 5)
Sold(qty: 100, customer_type: corporate, deal_id: D-42)
Sold(qty: 25, customer_type: retail)
```

Insight rõ ràng. Analytics derive từ event stream.

### Case 3: Order workflow

Order lifecycle: created → paid → packed → shipped → delivered → reviewed → returned.

CRUD: `orders.status = 'returned'`. Khi nào shipped? Bao lâu từ pack đến ship? Không biết.

Event-sourced:
```text
OrderPlaced(t=T0)
PaymentReceived(t=T0+30s)
WarehousePicked(t=T0+2h)
Packed(t=T0+4h)
Shipped(t=T0+1d)
Delivered(t=T0+3d)
ReviewSubmitted(t=T0+5d, rating: 5)
```

Audit + analytics + customer support: tất cả từ 1 stream.

## Storage options

### Option 1: Database (event store as table)

```sql
CREATE TABLE events (
    event_id BIGSERIAL PRIMARY KEY,
    aggregate_type VARCHAR NOT NULL,    -- e.g., "Order", "Account"
    aggregate_id VARCHAR NOT NULL,      -- e.g., order ID
    event_type VARCHAR NOT NULL,        -- e.g., "OrderPlaced"
    payload JSONB NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    sequence_number BIGINT NOT NULL,
    
    UNIQUE (aggregate_id, sequence_number)
);

CREATE INDEX idx_aggregate ON events (aggregate_id, sequence_number);
```

Read state:
```sql
SELECT * FROM events
WHERE aggregate_id = 'order-42'
ORDER BY sequence_number;
-- Replay in code to derive state.
```

Pros:
- SQL queries cho analytics.
- Familiar tooling.
- Easy aggregation queries.

Cons:
- DB không tối ưu cho append-only workload + replay.
- Cross-aggregate queries OK; single-aggregate replay OK.

### Option 2: Message broker (Kafka as event store)

```text
Kafka topic "orders-events":
  - Partition key = aggregate_id (orders for same order in same partition).
  - Retention = forever (log compaction or infinite retention).
  - Replay from offset 0 to get full history.
```

Pros:
- Designed cho high-throughput append.
- Natural ordering per partition.
- Multiple consumers replay.
- Native sync to query DB (CQRS combo).

Cons:
- Complex queries khó.
- Schema evolution (Avro/Protobuf with registry).

### Option 3: Dedicated event store

| Tool | Note |
|---|---|
| **EventStoreDB** | Purpose-built event store DB |
| **Axon Server** | Java/Axon framework ecosystem |
| **MartenDB** | Postgres-based event store (Node/Postgres) |
| **AWS DynamoDB streams** | Event-style on Dynamo |

## Replay optimization: snapshots

Problem: 5 năm account = 50k events. Replay every time = slow.

Snapshot pattern:
```text
events_log:
  E1, E2, E3, ... E1000, [SNAPSHOT_AT_1000: balance=$2000], E1001, E1002, ... E1500

To read current state:
  1. Load latest snapshot → balance = $2000.
  2. Replay E1001 → E1500 → balance = $1234.
  
→ Only replay 500 events, not 1500.
```

Snapshot strategy:
- **Time-based**: every N days, snapshot.
- **Event-count**: every N events, snapshot.
- **Periodic background job**: rebuild snapshots offline.

Snapshot là **optimization, không source of truth**. Source of truth vẫn là events. Snapshot wrong? Discard, rebuild from events.

## Combine với CQRS — best of both worlds

Event sourcing alone:
- ✓ Full audit, time-travel, replay.
- ✗ Read state expensive (replay).

CQRS alone:
- ✓ Optimized read query.
- ✗ No inherent audit trail.

Combo:

```text
Write side (Event sourced):
  Command → validate → append events to event store.
  Event store = source of truth.

Read side (CQRS projection):
  Subscribe event stream → update read DB (denormalized current state).
  Read queries hit read DB → fast.
```

```text
+──────────+   commands   +───────────────+   events    +─────────────────+
│  User    │ ───────────► │ Command/Write │ ─────────►  │  Event Store    │
│          │              │ Service       │             │  (Kafka /       │
+──────────+              +───────────────+             │  EventStoreDB)  │
                                                        +─────────────────+
                                                                │
                                                                │ subscribe
                                                                ▼
+──────────+   queries    +───────────────+   read     +─────────────────+
│  User    │ ───────────► │ Query Service │ ◄─────────►│  Read DB        │
│          │              │               │            │  (denormalized) │
+──────────+              +───────────────+            +─────────────────+
```

Benefits:
- **Audit**: full event history.
- **Performance**: fast write (append only), fast read (denormalized).
- **Replay**: rebuild read DB anytime (e.g., new view schema).
- **Time-travel**: query state at any past point by replaying up to time T.

Trade-off: **eventual consistency** between write commit và read DB update.

## Performance: write contention disappears

CRUD high-traffic:
```sql
UPDATE inventory SET stock = stock - 1 WHERE product_id = 'p-1';
-- Row lock on p-1.
-- 100 concurrent purchase → all wait same row → contention.
```

Event sourcing:
```sql
INSERT INTO events (aggregate_id, event_type, payload, sequence_number, ...)
VALUES ('p-1', 'Sold', '{qty:1}', nextval('seq'), ...);
-- Pure append. No row lock.
-- 100 concurrent → all parallel append.
```

Append-only > update-in-place cho write throughput.

(Concurrency control vẫn cần — optimistic concurrency on sequence_number để detect concurrent modifications.)

## Trade-offs / pitfalls

### Pitfall 1: Schema evolution

Event published 5 năm trước với schema cũ. Hôm nay code đọc event → field mới expected, missing.

Solutions:
- **Versioned events**: `OrderPlacedV1`, `OrderPlacedV2`.
- **Upcaster**: code transform V1 → V2 lúc replay.
- **Schema registry**: Avro/Protobuf with compatibility rules.

Plan schema evolution day 1.

### Pitfall 2: Event store grows infinitely

5 năm app = TB of events. Replay slow, storage cost cao.

Mitigation:
- Snapshots aggressive.
- Archive old events to cold storage (S3 Glacier).
- Log compaction for state-derivable events.

### Pitfall 3: Queries cross-aggregate khó

"Top 10 customers by lifetime spend" = aggregate across many event streams.

→ Cần **read model** (CQRS) hoặc dedicated analytics OLAP. Event store alone không tốt cho analytics.

### Pitfall 4: Eventual consistency confusing

User submit transaction → balance không update ngay → user confused.

Mitigation:
- Optimistic UI.
- Show "pending" state.
- Read-your-writes guarantee (route user's own queries to read DB after wait).

### Pitfall 5: Compensation, không correction

"Lỡ enter wrong $10000 deposit. Fix?" → **KHÔNG delete event** (immutable). Insert correction event:
```text
Deposit(amount: 10000)        ← original
DepositReversed(reason: 'wrong amount', original_event_id: 42)  ← compensation
```

Audit trail preserved. State derives correctly.

## Anti-pattern: Event Sourcing cho everything

Don't ES catalog products, user profile, blog posts. State-based CRUD is fine.

ES adds complexity:
- Replay logic.
- Snapshots.
- Schema evolution discipline.
- Eventual consistency UX.

Justify ES only when:
- Need audit trail (finance, healthcare, compliance).
- High-write contention.
- Replay/time-travel needed.
- Insights from event sequence valuable.

For 90% domain entities, CRUD suffices.

## Real-world examples

- **Banking**: literally every transaction is event-sourced (regulation requirement).
- **GitHub**: commits = events on repository state.
- **Event Sourcing + CQRS at scale**: Walmart, ING Bank, Maersk.
- **Axon Framework** (Java): popular ES + CQRS framework.

## Tóm tắt bài 3

- **Event Sourcing** = lưu events thay vì state; state derive bằng replay.
- Events **immutable**, **append-only**. Correction = thêm compensating event.
- Khi cần: **audit trail**, **time-travel**, **fraud detection**, **high write contention**, **business insights from sequence**.
- Storage: DB table, Kafka, dedicated event store (EventStoreDB, Axon).
- **Snapshot** optimization: avoid replay từ event 1 mỗi lần.
- Combo với **CQRS** = best of both: audit + fast write + fast read.
- Pitfalls: schema evolution, growing storage, cross-aggregate queries, eventual consistency UX.
- Anti-pattern: ES cho mọi entity → over-complex. Use selectively.

**Bài kế tiếp** → [Phase 6 — Bài 1: Testing pyramid trong microservices và EDA](../phase-6-testing/01-testing-pyramid.md)
