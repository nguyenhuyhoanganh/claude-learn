# Bài 2: CQRS — tách read model và write model

DB per service tốt. Nhưng yêu cầu read và write **trái ngược nhau**:
- Write: cần ACID, validation strict, normalized schema.
- Read: cần speed, denormalized, search-friendly index.

1 DB thoả mãn cả 2 = compromise. **CQRS** giải bằng cách tách hẳn 2 model.

## CQRS là gì

> **CQRS** = **Command Query Responsibility Segregation** — tách rõ 2 loại operation:
> - **Command**: thay đổi state (insert/update/delete).
> - **Query**: chỉ đọc, không đổi state.

Sang bước nữa: tách 2 **service** + 2 **database** riêng.

```text
                     ┌──► Command Service ──► Command DB (write-optimized)
                     │                              │
                     │                              │ publish event
User write request ──┘                              ▼
                                              [Message Broker]
                                                    │
                                                    ▼
User read request ──┐                        Query Service ──► Query DB (read-optimized)
                    └─────────────────────────────►│
                                                   ▼
                                              returns read view
```

Event broker sync 2 sides: command DB là source of truth, query DB là projection.

## So sánh với traditional CRUD

| Aspect | CRUD (1 DB) | CQRS |
|---|---|---|
| Code | 1 service handles read + write | 2 services |
| DB | 1 DB | 2 DB (or more) |
| Sync | N/A | Event-driven, eventually consistent |
| Optimization | Compromise both | Optimize each independently |
| Complexity | Low | High |
| Scalability | Read + write scale together | Independent scale |

CQRS không phải mọi case. Chỉ dùng khi read/write profile khác xa nhau.

## Use case 1: Separation of concerns + performance

### Vấn đề khi 1 service handle cả 2

```text
ReviewService:
  - POST /reviews: validate, auth, spam check, sentiment analysis, persist.
  - GET /reviews?productId=X&sort=helpful: fast lookup, paginate, filter.
  
  Code mess: business rules cho write + query optimization cho read.
  DB: normalized cho ACID writes → slow JOIN cho query.
  Scale: 100 write/sec, 10k read/sec → DB phải scale to cover read.
```

### CQRS split

**Command side**:
```text
ReviewCommandService:
  - POST /reviews
  - Heavy validation, spam detection, idempotency.
  - Write to ReviewCommandDB (Postgres, normalized).
  - Publish event "ReviewCreated".
```

**Query side**:
```text
ReviewQueryService:
  - GET /reviews?productId=X
  - Subscribe "ReviewCreated" events.
  - Update ReviewQueryDB (Elasticsearch, denormalized, indexed).
  - Pure read, no validation logic.
```

### Lợi ích

**Tech choice optimal**:
| DB | Workload | Why |
|---|---|---|
| Postgres command | ACID writes, business rules | Strong consistency, relations |
| Elasticsearch query | Full-text search, aggregation | Optimized read, scoring |

**Independent scale**:
- 100 write/sec → 2 ReviewCommandService instances.
- 10k read/sec → 20 ReviewQueryService instances + Elasticsearch cluster.
- Không waste write resources cho read load.

**Independent evolution**:
- Add new query? Change Query side only, không đụng Command.
- Validation rule mới? Command only.

**Test isolation**:
- Command tests focus business logic.
- Query tests focus search relevance.

## Use case 2: Cross-service JOIN view

### Vấn đề: không JOIN cross DB

```text
BusinessService — own business info DB.
ReviewService — own reviews DB.

Use case: search "sushi restaurants" → list with rating, sorted.
  → Need: business name + avg rating + review count.
  → Data scattered across 2 services.
```

Naive approach:
```text
1. Call BusinessService.search("sushi") → return 100 businesses.
2. For each business → call ReviewService.getReviews(businessId) → 100 calls.
3. Calculate avg rating client-side, sort.
→ 101 API calls + heavy compute. 5-10s latency. Unacceptable.
```

### CQRS solution: dedicated query service with joined view

```text
BusinessSearchService (CQRS query side):
  Own BusinessSearchDB (Elasticsearch).
  
  Schema (denormalized):
    business_id, name, description, address, lat, lng,
    avg_rating, review_count, popular_tags, last_review_at
  
  Subscriptions:
    - "business-events" → update business meta.
    - "review-events" → recalculate avg_rating, review_count.
```

Code:

```java
@KafkaListener(topics = "business-events")
public void onBusinessEvent(BusinessEvent event) {
    switch (event.type) {
        case CREATED:
        case UPDATED:
            searchIndex.upsert(toBusinessDoc(event));
            break;
        case DELETED:
            searchIndex.delete(event.businessId);
            break;
    }
}

@KafkaListener(topics = "review-events")
public void onReviewEvent(ReviewEvent event) {
    var doc = searchIndex.get(event.businessId);
    doc.recalculateRating(event);  // running avg
    doc.reviewCount += event.type == CREATED ? 1 : -1;
    doc.lastReviewAt = event.createdAt;
    searchIndex.upsert(doc);
}
```

Query:
```java
@GetMapping("/search")
public List<BusinessSearchResult> search(@RequestParam String q) {
    // ALL data ready in single index, single query
    return searchIndex.query(q);  // 50-100ms total
}
```

→ 1 API call, 1 DB hit, 100ms. **30-100× faster** than naive cross-service join.

## Trade-off cốt lõi: eventual consistency

```text
Time T0: user posts review.
  Command service writes → publishes event.

Time T0 + 10ms: User refreshes page.
  Query service NOT YET updated event.
  → User sees old data (no new review).

Time T0 + 100ms: event processed.
  Query DB updated.
  → User refreshes → sees new review.
```

Gap = milliseconds to seconds. Usually OK.

Mitigation cho UX:
- **Optimistic UI**: show review locally trong client right after POST.
- **Read-your-writes**: bypass cache cho user's own posts (first 5 sec).
- **Polling / WebSocket**: notify client khi query DB updated.

**Critical caveat**: KHÔNG dùng CQRS cho data cần strict consistency (account balance after withdrawal). Bank app post withdraw → user must NOT see old balance.

## Implementation patterns

### Pattern 1: Single command DB → multiple query views

```text
                       ┌──► ProductSearchView (ES, full-text)
                       │
Product writes ──► CommandDB ──► event ──┼──► ProductCacheView (Redis, hot products)
                                         │
                                         └──► AnalyticsView (BigQuery, OLAP)
```

Same data, different projections cho different access patterns.

### Pattern 2: Materialized View via event stream

```text
OrderCreated event → ETL → OrderAnalyticsDB (joined with User, Product)
                         → DailySalesReport
                         → CustomerLTV table
```

Stream processing (Kafka Streams, Flink) build materialized views continuously.

### Pattern 3: Backfill query DB from command DB

Initial CQRS setup: query DB empty.

```text
1. Read all command DB records.
2. Replay as events.
3. Query DB builds index.
4. Switch reads to query DB.
5. Going forward, only new events update query DB.
```

Or for schema change in query DB: drop, rebuild from event log.

## CQRS pitfalls

### Pitfall 1: Over-engineering

CRUD app simple, low traffic → CQRS adds 5× complexity, 0 benefit.

Rule: only CQRS when:
- Read/write ratio very imbalanced (10:1 or extreme).
- Read needs complex queries that hurt write DB.
- Cross-service join needed.
- Independent scale critical.

For 95% of apps, regular DB + read replica enough.

### Pitfall 2: Sync delay too long

Query DB lag 5+ minutes → users complain "I posted but don't see".

Monitor:
- Event lag (broker → consumer): alert if > 5s.
- Reconciliation job: nightly compare command vs query for divergence.

### Pitfall 3: Mất event = corrupt view forever

Query DB derives state from event stream. Lose 1 event → state wrong.

Mitigation:
- Use **at-least-once + idempotent consumer**.
- **Outbox pattern** on command side.
- **Replay capability** — rebuild query DB from event log.

### Pitfall 4: Schema drift between command and query

Command adds field, forgets to update query schema → query missing data.

Mitigation:
- Shared event schema (Avro registry, Protobuf).
- Versioned events.
- Schema validation at publish + consume.

## Case study — Yelp-like business review platform

```text
Services:
- BusinessCommandService: CRUD business info (verified owners).
- ReviewCommandService: write reviews (auth, validation, spam check).
- BusinessSearchService (CQRS query): all read of "search businesses".

Traffic:
- 10k writes/day (reviews + business updates).
- 5M reads/day (searches + browse).

Without CQRS:
  1 service handles both → DB scale for 5M read.
  Search "vegan bakery in district 1" → 30s (slow JOIN + text search).

With CQRS:
  Command: 2 services, ACID Postgres, small instance.
  Query: BusinessSearch with Elasticsearch cluster, 5 instances.
  Search: 100ms (single ES query, denormalized doc).
```

Pattern: write services optimize correctness; query services optimize speed.

## Khi nào CHƠI CQRS, khi nào tránh?

### Chơi khi

| Signal | Reason |
|---|---|
| Read >> Write (100:1+) | Scale independently |
| Complex queries hurt write DB | Different schema |
| Cross-service join recurring | Materialized view |
| Different DB tech optimal | Postgres + ES + Redis |
| Different teams own read vs write | Decouple |
| Event sourcing already in use | Natural fit (bài tiếp) |

### Tránh khi

| Signal | Reason |
|---|---|
| Simple CRUD app | Over-engineering |
| Strict consistency required | Eventual consistency unsuitable |
| Team chưa quen event-driven | Operational complexity |
| Low traffic | Benefit < cost |

## Tóm tắt bài 2

- **CQRS** = tách Command (write) và Query (read) thành services + DB riêng.
- Sync giữa 2 sides qua event broker (eventual consistency).
- 2 use case chính: **separation of concerns + perf optimization** và **cross-service joined view**.
- Lợi: pick optimal DB cho mỗi side, independent scale, evolve riêng, fast queries.
- Trade-off chính: **eventual consistency** — gap ms-giây giữa write và query visibility.
- Patterns: multi-view, materialized view, backfill from command.
- Pitfalls: over-engineering, sync lag, lost events corrupt view, schema drift.
- Don't use cho strict consistency case (account balance, inventory).

**Bài kế tiếp** → [Bài 3: Event Sourcing — event là source of truth](03-event-sourcing.md)
