# Bài 7: Netflux Final Demo + Tóm tắt Phase 17

Tất cả services đã implement + test. Bài này: chạy demo end-to-end, observe real-time recommendations, và tổng kết bài học.

## Setup environment

### Port assignment

| Service | Port |
|---|---|
| Recommendation Service | 8080 |
| Customer Service | 6060 |
| Movie Service | 7070 |
| Kafka broker | 9092 |

### Cấu trúc UI

Recommendation Service có `src/main/resources/static/index.html` — UI demo (JavaScript thuần).

UI làm gì:
- Show home page với 2 row recommendations (newly added + personalized).
- Subscribe SSE stream → real-time updates.
- Click movie → call Movie Service API để show details.
- Change genre dropdown → call Customer Service PATCH API → trigger personalized recommendations.

### CORS configuration

Microservices chạy trên port khác nhau. Browser block cross-origin requests by default.

```java
@RestController
@CrossOrigin(origins = "http://localhost:8080")    // ← enable for local testing
@RequestMapping("/api/movies")
public class MovieController { ... }
```

Add `@CrossOrigin` lên Customer + Movie controllers (allow request từ UI ở port 8080).

> **Production**: không dùng wildcard. Set domain cụ thể. Or dùng API Gateway pattern.

## Demo workflow

### Step 1: Start Kafka

```bash
cd 01-kafka-setup
docker compose down       # clean state
docker compose up -d
```

### Step 2: Start Customer Service

```bash
cd customer-service
mvn spring-boot:run
```

Log: app start trên port 6060, H2 init với 3 customers (Sam, Mike, John).

### Step 3: Start Movie Service với data initializer

```yaml
# movie-service/src/main/resources/application.yml
app:
  import-movies: true                    # ← BẬT
```

```bash
cd movie-service
mvn spring-boot:run
```

Movie Service start, MovieDataInitializer bắt đầu publish 1 movie / 3 giây (100,000 movies trong file).

Log:
```text
Published: MovieAddedEvent[movieId=1, title=Movie 1, ...]
(3s pause)
Published: MovieAddedEvent[movieId=2, title=Movie 2, ...]
(3s pause)
...
```

### Step 4: Start Recommendation Service

Đợi vài giây cho Movie Service đã publish 50-100 events trước → Recommendation có dữ liệu để show.

```bash
cd recommendation-service
mvn spring-boot:run
```

Log:
```text
[Consumer] Subscribed to movie-events partition 0
[Consumer] Subscribed to customer-events partition 0
Received: MovieAddedEvent[movieId=1, ...]
Received: MovieAddedEvent[movieId=2, ...]
...
```

Recommendation drain backlog từ topics, populate local DB.

### Step 5: Open UI

```text
http://localhost:8080
```

Default `?customer=1` (Sam). Show 2 row:
- **Newly added** — recent movies từ Recommendation's movie table.
- **Personalized** — match Sam's favorite genre (action).

### Demo scenarios

#### Scenario A: Real-time newly added notification

Movie Service tiếp tục publish events (3s / movie).

→ UI tự update **real-time** mỗi 3s: new movie xuất hiện ở row "Newly Added".

✅ End-to-end pipeline: Movie Service → Kafka → Recommendation Consumer → DB → @Async listener → Sink → Flux → SSE → Browser UI.

#### Scenario B: Change genre → personalized refresh

Sam click dropdown, đổi genre từ "action" sang "adventure".

```text
Browser: PATCH http://localhost:6060/api/customers/1/genre  body={"favoriteGenre":"adventure"}
Customer Service: update DB + emit CustomerGenreUpdatedEvent
   ↓
customer-events topic
   ↓
Recommendation Service consume → update customer_genre table → publish Personalized event
   ↓
@Async listener → query 4 adventure movies → emit MovieRecommendations.personalized(1, [...])
   ↓
Filter: customerId == 1 → pass
   ↓
SSE push to browser
   ↓
UI update Personalized row với adventure movies
```

Latency ~200ms end-to-end. Customer thấy update gần như instant.

#### Scenario C: Multi-customer isolation

Open tab khác: `http://localhost:8080?customer=2` (Mike).

Mike change genre → Mike's UI update.

Sam's UI **KHÔNG** thấy Mike's update (filter logic).

✅ Demonstrate per-customer streaming với shared sink.

#### Scenario D: Click movie → details

Click 1 movie → browser send `GET http://localhost:7070/api/movies/<id>` → Movie Service trả full details (IMDB, budget, revenue, overview).

→ Demonstrate "source of truth" pattern: Recommendation chỉ lưu basic info, full detail từ Movie Service.

## Tổng kết Phase 17 — concepts đã practice

Phase 17 là 1 mini production project. Practice mọi concept đã học:

| Phase học trước | Apply trong Netflux |
|---|---|
| Phase 4: Consumer | Recommendation consume movie + customer events |
| Phase 5: Producer + StreamBridge | Movie + Customer services publish events |
| Phase 5: Message + key | Tất cả events gửi với key cho ordering |
| Phase 6: Consumer groups | `recommendation-service` group |
| Phase 7: Processor pattern | Recommendation transform events → DB state |
| Phase 10: Batch | KHÔNG dùng (low throughput, ok per-message) |
| Phase 11: Concurrency | Async @EventListener offload từ Kafka consumer thread |
| Phase 12: Acknowledgement | Default auto-ack |
| Phase 13: Error handling | Default config (production cần DLQ) |
| Phase 14: Transactions | KHÔNG dùng (not needed cho non-financial case) |
| Phase 15: Testing | REST API + Test Binder + Testcontainers cho mọi service |

## Production improvements — chưa có trong demo

Demo focus dạy event-driven pattern. Production-ready cần thêm:

### Reliability
- [ ] **DLQ** cho mỗi consumer (Phase 13). Nếu invalid event → DLQ thay vì retry loop.
- [ ] **Idempotency keys** trên consumer side (Phase 12 + 14). Re-consume event không gây double-insert.
- [ ] **Outbox pattern** trong Movie Service + Customer Service (Phase 13). Atomic giữa DB write + event publish.

### Schema management
- [ ] **Avro/Protobuf + Schema Registry** thay JSON. Catch breaking schema change sớm.
- [ ] Versioning event types (`MovieAddedEvent_v1`, `_v2`).

### Observability
- [ ] **Distributed tracing** (OpenTelemetry, Zipkin). Track 1 user action qua 3 services.
- [ ] Metrics (consumer lag, throughput, error rate).
- [ ] Structured logging với traceId.

### Security
- [ ] **SASL_SSL** Kafka connection (Phase 16).
- [ ] OAuth2 cho REST APIs.
- [ ] ACL Kafka topics.

### Scalability
- [ ] **Topic partitioning** > 1 cho production load. Demo 1 partition đủ.
- [ ] Multiple Recommendation Service instances cho HA + scale.
- [ ] Postgres thay H2.
- [ ] Redis cache cho hot queries.

### Architecture
- [ ] **3 separate Spring Boot projects** thay multi-module.
- [ ] Separate Git repo per service.
- [ ] Separate CI/CD per service.
- [ ] Separate deploy (Kubernetes per service).

### Recommendation logic
- [ ] **ML-based** recommendation thay vì genre matching đơn giản.
- [ ] Watch history events.
- [ ] Collaborative filtering ("Users like you watched...").
- [ ] A/B testing framework.

→ Demo là **scaffold**. Production phải extend đáng kể.

## Design patterns đã apply

### 1. CQRS lite

```text
Command side (writes):
  Movie Service: POST /movies, INSERT movie table
  Customer Service: PATCH /customers, UPDATE customer table

Query side (reads):
  Recommendation Service: GET /recommendations
  Build từ local read model (movie + customer_genre tables)
  Updated qua events
```

Không full CQRS (chưa có Event Sourcing). Nhưng tách read/write boundary rõ.

### 2. Event-Carried State Transfer

Events carry minimal state (movieId, title, genres). Consumer dùng để build local replica.

### 3. Database per Service

Mỗi service own DB của mình. KHÔNG share DB.

### 4. Saga (đơn giản)

Customer change genre → cascade trigger personalized recommendation flow. Mặc dù không transactional, demonstrate event-driven flow chain.

### 5. Application Event Publisher pattern

Tách messaging boilerplate khỏi service class. Service publish Spring event → listener layer publish Kafka.

### 6. Namespace records (`RecommendationEvents.NewMovieAdded`)

Organize related records trong 1 file thay tạo nhiều file lẻ tẻ.

### 7. Async listener for background work

`@Async @EventListener` offload non-critical work khỏi consumer thread.

### 8. Reactive Sinks for streaming

Push real-time updates to N subscribers với filter logic per subscriber.

### 9. Filter-based subscription

Shared Flux + per-subscriber filter logic → privacy + targeted delivery.

### 10. Helper wrapper (`withLogging`)

DRY pattern cho cross-cutting concerns (log, metrics, error).

## Tóm tắt bài 7 + Phase 17

- Demo end-to-end: Kafka broker → Customer Service → Movie Service (auto publish) → Recommendation Service → SSE UI.
- 4 demo scenarios: real-time newly added, genre change → personalized refresh, multi-customer isolation, click movie details.
- Phase 17 practice mọi concept đã học từ Phase 4-15.
- Demo là **scaffold** — production cần thêm reliability (DLQ, idempotency, outbox), schema management (Avro), observability (tracing, metrics), security (SASL_SSL, OAuth), scalability (partitions, instances).
- 10 design patterns demonstrated: CQRS lite, Event-Carried State Transfer, Database per Service, Saga, ApplicationEventPublisher decoupling, namespace records, async listeners, reactive Sinks, filter subscriptions, helper wrappers.

**Bài kế tiếp** → [Phase 18 - Best Practices for Production EDA](../phase-18-best-practices/01-producer-best-practices.md)
