# Event-Driven Microservices: CQRS, Saga & Event Sourcing

Tài liệu học tập về các design patterns nâng cao trong kiến trúc microservices event-driven.

## Lộ trình học

### Phase 1 — Database-per-Service Pattern (Nền tảng)
> **Tại sao cần học tất cả những gì ở đây?**

| File | Nội dung |
|---|---|
| `01-database-per-service-pattern.md` | Pattern cốt lõi, lợi ích, thách thức |
| `02-cross-service-queries-va-api-composition.md` | Cross-service query problem, API Composition Pattern |
| `03-data-consistency-transactions-duplication.md` | Distributed transactions, data duplication |

---

### Phase 2 — Lý thuyết CQRS & Event Sourcing
> **Hiểu rõ pattern trước khi code**

| File | Nội dung |
|---|---|
| `01-cqrs-pattern.md` | CQRS là gì, kiến trúc, eventual consistency |
| `02-event-sourcing-pattern.md` | Event Store, Aggregate, Projection, lợi ích |

---

### Phase 3 — Implementation với Axon Framework
> **Hands-on: xây dựng CQRS + Event Sourcing thực tế**

| File | Nội dung |
|---|---|
| `01-gioi-thieu-axon-framework.md` | Axon Framework, Axon Server, setup Docker |
| `02-commands-events-queries.md` | Building blocks: Command, Event, Query classes |
| `03-aggregate-write-side.md` | Aggregate — Write Side của CQRS |
| `04-projection-read-side.md` | Projection — Read Side, Event Processors, Replay |

---

### Phase 4 — Materialized View Pattern
> **Đọc data từ nhiều services hiệu quả**

| File | Nội dung |
|---|---|
| `01-materialized-view-pattern.md` | Pattern theory, implementation, Transactional Outbox |

---

### Phase 5 — Choreography Saga Pattern
> **Distributed transactions: mỗi service tự điều phối**

| File | Nội dung |
|---|---|
| `01-saga-pattern-introduction.md` | Saga overview, hai loại, lợi ích/nhược điểm |
| `02-choreography-saga.md` | Choreography implementation với Axon, compensation |

---

### Phase 6 — Orchestration Saga Pattern
> **Distributed transactions: central orchestrator điều phối**

| File | Nội dung |
|---|---|
| `01-orchestration-saga.md` | Saga Manager, @StartSaga/@EndSaga, Subscription Queries |

---

### Phase 7 — Snapshots trong Event Sourcing
> **Tối ưu performance khi event store lớn**

| File | Nội dung |
|---|---|
| `01-snapshots-event-sourcing.md` | Snapshot theory, implementation, production best practices |

---

## Bức tranh toàn cảnh

```
Database-per-Service Pattern
         │
         ├── Cross-Service Queries ──────► API Composition (Phase 1)
         │                          └────► CQRS + Materialized View (Phase 2,3,4)
         │
         ├── Distributed Transactions ───► Choreography Saga (Phase 5)
         │                          └────► Orchestration Saga (Phase 6)
         │
         └── Data Duplication ───────────► Event-Driven Architecture
```

## Tech Stack (trong khóa học)

- **Language:** Java 17+
- **Framework:** Spring Boot 3.x
- **CQRS/ES Engine:** Axon Framework 4.x
- **Event Store:** Axon Server (Community Edition)
- **Message Broker:** RabbitMQ (Choreography Saga), Axon Server (Orchestration)
- **Database:** H2 (demo), MySQL/PostgreSQL (production)
- **API Gateway:** Spring Cloud Gateway
- **Service Discovery:** Eureka Server

## Prerequisite

- Hiểu biết về microservices cơ bản
- Spring Boot và Spring Data JPA
- Event-driven architecture với Kafka/RabbitMQ
- Docker cơ bản
