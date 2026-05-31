# Bài 1: Database per Microservice — nguyên tắc bất di bất dịch

Trong mọi nguyên tắc của microservices, **"1 database per microservice"** là cái **vi phạm thường xuyên nhất** và **gây hại nhất** khi vi phạm. Bài này giải thích vì sao, đánh đổi gì khi tuân thủ, và cách xử lý các pain point.

## Setup case study — Insurance company

Công ty bảo hiểm migrate monolith → microservices:

```text
Trước:
+──────────────+        +──────────────+
│  Monolith    │ ◄────► │  Single DB   │
│ (everything) │   SQL  │ - policies   │
│              │        │ - claims     │
│              │        │ - customers  │
│              │        │ - reports    │
+──────────────+        +──────────────+

Sau migration (sai cách — vẫn share DB):
+──────────+ +──────────+ +──────────+ +──────────+
│ Policy   │ │ Claims   │ │ Customer │ │ Reporting│
│ service  │ │ service  │ │ service  │ │ service  │
+──────────+ +──────────+ +──────────+ +──────────+
       │            │            │            │
       └────────────┴────────────┴────────────┘
                          │
                          ▼
                  Shared Database
```

Nhìn ngon. Mọi service truy cập data nó cần, performance tốt vì SQL direct, không HTTP overhead.

**Vấn đề bắt đầu sau 3 tháng.**

## 3 kịch bản pain point

### Kịch bản 1: Tech freedom — Policy team đổi DB

Policy team thấy traffic cao, muốn migrate Postgres → MongoDB (read-optimized):

- Reporting service đang query thẳng table `policies` bằng SQL.
- Đổi sang Mongo → Reporting **code đầy SQL queries** sẽ vỡ.
- → Policy + Reporting **phải release simultaneously**.

→ Mất **tech autonomy** của Policy team.

### Kịch bản 2: Schema evolution — Claims team đổi schema

Claims team muốn:
- Rename column `claim_dt` → `claim_date`.
- Drop column `legacy_id` đã 5 năm không dùng.
- Add column `region_code`.

- Reporting query `SELECT claim_dt FROM claims` → sẽ vỡ.
- → 2 team họp, agree schema, release đồng thời, coordinate test.

→ Mất **schema autonomy**.

### Kịch bản 3: Security policy — Customer team thêm row-level security

Customer team thêm fine-grained access control: chỉ user role nhất định xem `customers.ssn`.

- Reporting service đang đọc thẳng table → bypass security.
- Customer team phải explain security model cho Reporting team.
- → Implementation details leak across boundary.

→ Coupling tăng thay vì giảm.

## Kết luận: Shared DB = distributed monolith

3 kịch bản trên xảy ra **mọi tuần** trong thực tế. Sau 6 tháng, bạn có:
- 4 service nhưng coordinate như monolith.
- Schema change require all-hands meeting.
- Tech freedom = ảo tưởng.
- Deploy schedule khớp nhau như binary.

= **distributed monolith với extra latency**. Tệ hơn monolith gốc.

## Nguyên tắc: DB per service, expose qua API only

```text
+──────────+        +──────────+        +──────────+
│ Policy   │        │ Claims   │        │ Customer │
│ service  │        │ service  │        │ service  │
│   │      │        │   │      │        │   │      │
│   ▼      │        │   ▼      │        │   ▼      │
│ PolicyDB │        │ ClaimsDB │        │ CustDB   │
└──────────+        └──────────+        └──────────+
     ▲                  ▲                    ▲
     │ HTTP API         │ HTTP API           │ HTTP API
     │                  │                    │
     │ ┌────────────────┘                    │
     │ │ ┌──────────────────────────────────┘
     │ │ │
+──────────+
│ Reporting│
│ service  │
│   │      │
│   ▼      │
│ ReportDB │
└──────────+
```

Quy tắc:
- Mỗi service own 1 DB.
- DB không bao giờ exposed ra ngoài.
- Tất cả truy cập data phải qua **API của service owner**.
- DB technology + schema là implementation detail.

## Vì sao API mới quan trọng?

Khi data exposed qua API thay vì SQL trực tiếp:

| Aspect | SQL direct | API only |
|---|---|---|
| Schema evolution | Phá consumer | Owner change schema không phá API → consumer không biết |
| DB technology change | Phá consumer | Transparent — API contract stable |
| Security | Bypass | Service enforce trước khi return |
| Cache | Khó | API level easy |
| Versioning | Không có | API v1/v2 cùng tồn tại |
| Rate limit | Không có | API gateway control |

API = **abstraction layer**. Cho phép owner thay đổi internal thoải mái.

## Trade-off chấp nhận

DB per service không miễn phí. Đánh đổi:

### Trade-off 1: Latency cao hơn

```text
Trước: SELECT JOIN trong 1 DB             ~1ms
Sau:   API call → service → DB → return  ~10-50ms
```

10-50x slower trên mỗi cross-service access.

Mitigation:
- **Cache** data của service khác ở local.
- **Event-driven replication** (phase 4) — không gọi API mỗi lần.
- Cho phép **eventual consistency** ở chỗ tolerable.

### Trade-off 2: Mất khả năng JOIN

```sql
-- Trước: 1 query
SELECT o.id, u.email, p.name
FROM orders o JOIN users u ON o.user_id = u.id
              JOIN products p ON o.product_id = p.id;
```

Sau: 3 API call + JOIN ở application.

Pattern handle (bài 4 phase 2 đã touch):
- **API composition**: fetch parallel + merge.
- **Local cache**: store snapshot of User/Product trong OrderDB.
- **CQRS read model**: dedicated read store (phase 5).

### Trade-off 3: Mất ACID cross-service

```sql
-- Trước: 1 transaction
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;
-- Atomic guaranteed
```

Sau: 2 service → 2 DB → distributed transaction.

Solution: **Saga pattern** (phase 5).

### Trade-off 4: Operational complexity

- 1 DB → 10 DB.
- Backup × 10.
- Monitor × 10.
- Patching × 10.
- Cert × 10.

Mitigation: managed DB (RDS, Cloud SQL) reduce ops burden.

## Data duplication — chấp nhận có điều kiện

Pattern hay dùng: **store cache** của data thuộc service khác.

Vd: ProductService cache latest 5 reviews + average rating trong ProductDB:

```sql
-- ProductDB.products table
CREATE TABLE products (
  id UUID PRIMARY KEY,
  name TEXT,
  price NUMERIC,
  -- Cached from ReviewService:
  avg_rating NUMERIC,        -- Eventually consistent
  recent_reviews_json JSONB  -- Top 5 reviews
);
```

Cập nhật qua event listener:

```java
@KafkaListener(topics = "review.created")
public void onReviewCreated(ReviewCreatedEvent event) {
    productRepo.recalculateRating(event.productId);
}
```

Lúc user xem product page → load product + rating + reviews từ 1 DB call → fast.

**Quy tắc** khi duplicate:
- **Source of truth duy nhất** — ReviewService own reviews. ProductService chỉ có copy read-only.
- **Read-only ở consumer** — ProductService không UPDATE rating directly.
- **Eventual consistency là OK** — vài giây sau publish event, ProductDB cập nhật.
- **Strict consistency cần thiết** → KHÔNG duplicate, gọi API.

## Khi nào CẦN strict consistency, đừng duplicate

- **Account balance**: vừa rút 100$, không thể đọc thấy số dư cũ → nguy hiểm.
- **Inventory cuối**: 2 user mua món last → over-sell.
- **Booking reservation**: 2 user book cùng giờ → conflict.

Cho các case này:
- KHÔNG duplicate.
- Call API mỗi lần (chấp nhận latency).
- Hoặc dùng **distributed lock** / **optimistic concurrency**.

## Pattern check khi review architecture

| Câu hỏi | OK | Anti-pattern |
|---|---|---|
| Service A query thẳng DB của B không? | Không bao giờ | Yes = shared DB |
| 2 service connect cùng DB instance? | Không | Yes = shared DB |
| Schema change DB A có break test của B? | Không | Yes = leak schema |
| Service B có DB credential của DB A? | Không | Yes = nguy hiểm |
| Cache data của service khác có owner rõ? | Yes | No = ai update? |

## Anti-pattern: Database as integration

```text
Service A ──► write to TableX ──► Service B reads TableX
```

Đây là **database integration**. Nhiều team gọi nó "sync via DB". Không. **Đây là shared DB trá hình**.

Lý do tránh:
- A và B coupling implicit qua schema.
- B không biết khi nào A update.
- Polling DB → slow + inefficient.

Đúng: A publish event → B subscribe event. Phase 4 EDA deep-dive.

## Trade-off cuối: DB technology choice

Lợi cực lớn của DB per service: **mỗi service chọn DB tốt nhất cho workload**.

| Service | Workload | Best DB |
|---|---|---|
| User profile | Read-heavy, simple | Postgres (RDBMS) |
| Search | Full-text, faceted | Elasticsearch |
| Catalog | Document hierarchy | MongoDB |
| Cart | High throughput, ephemeral | Redis |
| Analytics | OLAP, columnar | ClickHouse, BigQuery |
| Time-series metrics | Append-only | InfluxDB, TimescaleDB |
| Graph relationships | Multi-hop traversal | Neo4j |
| Audit log | Append-only, immutable | Kafka + S3 |

Monolith bị stuck với 1 DB (thường Postgres) cho mọi workload — không optimal.

Microservices: **polyglot persistence** — đúng tool cho đúng job.

## Migration step để đạt DB per service

Đã touch ở phase 2 bài 4:

```text
1. Identify ownership: table X thuộc service nào?
2. Tách table X sang DB riêng (vẫn cùng host)
3. Update service code dùng DB riêng
4. Drop FK cross-DB
5. App-level enforce constraint
6. Move DB sang host riêng (separate infrastructure)
7. Set up monitoring + backup riêng
```

Mỗi bước reversible. Test giữa các bước.

## Tóm tắt bài 1

- **1 service = 1 database**: nguyên tắc bất di bất dịch, không có ngoại lệ stable production.
- Shared DB = distributed monolith với extra latency = TỆ HƠN monolith gốc.
- Mọi truy cập data phải qua **API owner** — DB là implementation detail private.
- Trade-off chấp nhận: latency cao hơn, mất JOIN, mất ACID cross-service, ops complexity.
- **Data duplication có điều kiện** OK với source of truth + read-only + eventual consistency.
- **Strict consistency case** (balance, inventory) → KHÔNG duplicate, gọi API.
- **Polyglot persistence** = quyền chọn DB tốt nhất cho từng workload.

**Bài kế tiếp** → [Bài 2: DRY trap — shared library trong microservices](02-dry-shared-library.md)
