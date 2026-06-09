# Event-Driven Microservices: CQRS, Saga & Event Sourcing

Tài liệu học tiếng Việt về các design pattern nâng cao trong kiến trúc microservices event-driven, bám sát và đào sâu khóa học gốc (8 section, 74 bài). Mỗi bài viết lại theo kiểu giáo trình: khái niệm kèm thuật ngữ Anh-Việt, sơ đồ ASCII, code production, trade-off, và bẫy thường gặp.

## Bức tranh toàn cảnh

```
Database-per-Service Pattern (gốc rễ mọi thách thức)
         │
         ├── Cross-Service Queries ──────► API Composition (Phase 1)
         │                          └────► CQRS + Materialized View (Phase 2,3,4)
         │
         ├── Data Consistency / ──────────► Saga: Choreography (Phase 5)
         │   Distributed Transactions └────► Saga: Orchestration (Phase 6)
         │
         ├── Reliable Event Publishing ───► Transactional Outbox (Phase 4)
         │
         └── Lịch sử & Audit ─────────────► Event Sourcing (Phase 2,3) + Snapshot (Phase 7)
```

## Lộ trình học

### Phase 1 — Database-per-Service Pattern (nền tảng)
> Pattern "thủ phạm" sinh ra mọi pattern còn lại + giải pháp đọc đầu tiên.

| File | Nội dung |
|---|---|
| `01-database-per-service-pattern.md` | Pattern cốt lõi, 6 lợi ích, 4 thách thức |
| `02-cross-service-queries-va-api-composition.md` | Cross-service query, API Composition, Gateway Aggregator |
| `03-setup-microservices-bom-common.md` | Dựng 4 microservice + Eureka + Gateway, BOM, common module, H2 |
| `04-implement-api-composition-spring-cloud-gateway.md` | Code thật: WebClient, HTTP Interface, `Mono.zip`, functional router |
| `05-data-consistency-transactions-duplication.md` | Data consistency, distributed transaction, data duplication |

### Phase 2 — Lý thuyết CQRS & Event Sourcing
> Hiểu chắc lý thuyết trước khi code.

| File | Nội dung |
|---|---|
| `01-cqrs-pattern.md` | CQRS, hai database, eventual consistency, projection |
| `02-event-sourcing-pattern.md` | 5 khái niệm (Command/Event/Store/Aggregate/Projection), lợi ích, trade-off |

### Phase 3 — Hiện thực CQRS + Event Sourcing với Axon
> Hands-on đầy đủ 24 bài: từ setup tới event processor và rollback.

| File | Nội dung |
|---|---|
| `01-gioi-thieu-axon-framework.md` | Axon (Server/Framework/Console), analogy nhà hàng |
| `02-setup-axon-server-docker.md` | Dựng Axon Server bằng Docker, dashboard |
| `03-them-axon-dependencies-cau-hinh.md` | BOM Axon, starter, `axon.axonserver.servers` |
| `04-command-event-query-classes.md` | Command/Event/Query class, quy ước đặt tên, annotation |
| `05-command-api-commandgateway.md` | Command API, `CommandGateway` (sendAndWait vs send) |
| `06-technical-flow-cqrs-es.md` | Bản đồ tổng technical flow + bảng annotation |
| `07-aggregate-event-sourcing-handler.md` | Aggregate, `@CommandHandler`, `@EventSourcingHandler` |
| `08-projection-query-api.md` | Projection, QueryGateway, QueryHandler, idempotency |
| `09-demo-interceptor-eventstore-plugin.md` | Demo dashboard, MessageDispatchInterceptor, đọc EventStore, plugin |
| `10-event-processors-rollback.md` | Subscribing vs streaming, processing group, rollback |
| `11-replicate-flavors-cdc.md` | Nhân bản service, 6 flavor CQRS, CDC/Debezium |

### Phase 4 — Materialized View + Transactional Outbox
> Đọc đa nguồn hiệu quả + phát event đáng tin cậy.

| File | Nội dung |
|---|---|
| `01-vi-sao-can-materialized-view.md` | Nhược điểm API Composition ở tải lớn |
| `02-materialized-view-pattern.md` | Lý thuyết, denormalized view, thiết kế profile table |
| `03-implement-profile-microservice.md` | Profile service, publish event (3 cách), XStream config |
| `04-transactional-outbox-pattern.md` | Dual-write problem, outbox table, polling/CDC, vs Materialized View |

### Phase 5 — Choreography Saga
> Distributed transaction phi tập trung (không cần CQRS).

| File | Nội dung |
|---|---|
| `01-saga-pattern-introduction.md` | Bài toán, Saga, compensation, 2 flavor |
| `02-choreography-thiet-ke-va-tradeoffs.md` | Lợi ích/nhược điểm, thiết kế đổi mobileNumber |
| `03-choreography-implement-happy-path.md` | Spring Cloud Stream/Function, StreamBridge, consumer group |
| `04-choreography-compensation-transactions.md` | Compensation, `setRollbackOnly()`, chuỗi rollback ngược |

### Phase 6 — Orchestration Saga (với CQRS/Axon)
> Distributed transaction tập trung qua Saga Manager.

| File | Nội dung |
|---|---|
| `01-orchestration-saga-introduction.md` | Saga Manager, analogy nhạc trưởng, 2 DB |
| `02-orchestration-commands-events-setup.md` | Command/event update + rollback, XStream |
| `03-orchestration-saga-manager-happy-path.md` | `@Saga`, `@StartSaga`, association property |
| `04-orchestration-compensation-va-demo.md` | Compensation qua callback, swap số cũ, demo |
| `05-subscription-queries-overall-status.md` | 4 loại query, subscription query, QueryUpdateEmitter |

### Phase 7 — Snapshots trong Event Sourcing
> Tối ưu hiệu năng khi event store lớn.

| File | Nội dung |
|---|---|
| `01-event-replay-co-che.md` | Cơ chế replay, performance problem |
| `02-snapshots-theory.md` | Snapshot, cấu hình ngưỡng, trade-off |
| `03-snapshots-implement-axon.md` | `SnapshotTriggerDefinition`, demo, kết khóa |

## Tech Stack (trong khóa học)

- **Language/Framework:** Java 17+, Spring Boot 3.x
- **CQRS/ES/Saga engine:** Axon Framework 4.x + Axon Server (event store)
- **Choreography Saga:** Spring Cloud Stream + Function + RabbitMQ
- **Database:** H2 (demo), MySQL/PostgreSQL/MongoDB (production)
- **API Gateway / Discovery:** Spring Cloud Gateway, Eureka Server

## Prerequisite

- Microservices cơ bản, Spring Boot + Spring Data JPA
- Event-driven architecture (Kafka/RabbitMQ), Docker cơ bản
