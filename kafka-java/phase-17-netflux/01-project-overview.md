# Bài 1: Netflux Overview — Real-time recommendation engine

Phase 17 là **final project** của khoá. Tích hợp mọi concept đã học (producer, consumer, processor, ack, error handling, testing, security, transaction) thành **1 hệ thống microservices thực tế**.

Project: **Netflux** — recommendation engine cho dịch vụ streaming phim (giống Netflix mini).

Bài này: high-level architecture, data flow, design decisions cốt lõi.

## 3 microservices

```text
┌────────────────────┐   movie-events     ┌──────────────────────┐
│  Movie Service     │ ──────────────────► │ Recommendation       │
│  - manage movies   │                     │ Service              │
│  - REST API        │                     │ - consume events     │
└────────────────────┘                     │ - build recommend    │
                                            │ - push real-time     │
┌────────────────────┐   customer-events    │ - REST API + SSE     │
│  Customer Service  │ ──────────────────► │                      │
│  - manage customer │                     │                      │
│  - favorite genre  │                     │                      │
│  - REST API        │                     │                      │
└────────────────────┘                     └──────────────────────┘
```

### Movie Service
- Quản lý dữ liệu phim (title, genres, IMDB rating, ...).
- REST API: GET movie by ID, POST add new movie.
- Khi add movie → emit `MovieAddedEvent` vào topic `movie-events`.

### Customer Service
- Quản lý customer (id, name, favorite genre).
- REST API: GET customer by ID, PATCH favorite genre.
- Khi customer update genre → emit `CustomerGenreUpdatedEvent` vào topic `customer-events`.

### Recommendation Service
- **Consume** cả 2 topic events.
- Build personalized recommendations dựa vào:
  - Newly added movies (phù hợp genre customer thích).
  - Customer preference changes.
- 2 endpoint:
  - REST API GET: trả về danh sách recommendations cho customer.
  - **SSE streaming endpoint**: push real-time recommendations khi customer đang online.

## Use case end-to-end

```text
Scenario 1: Customer mở app
  → Hit GET /recommendations/{customerId}
  → Recommendation service trả về home page với suggestions.

Scenario 2: Customer online, admin add new action movie
  → Movie Service: POST /movies (action movie)
  → emit MovieAddedEvent → topic movie-events
  → Recommendation Service consume event
  → Filter: ai thích action → push notification qua SSE
  → Customer (đang stream SSE) thấy "New action movie just added!"

Scenario 3: Customer đổi genre từ "action" sang "horror"
  → Customer Service: PATCH /customers/{id} body={favoriteGenre: horror}
  → emit CustomerGenreUpdatedEvent → topic customer-events
  → Recommendation Service consume event
  → Update internal customer table
  → Rebuild recommendations theo horror genre
  → Push qua SSE nếu customer đang online
```

## Data architecture — duplication intentional

```text
Movie Service DB:                     Recommendation Service DB:
  movies table                          movies table (DUPLICATE)
    - id, title, runtime,                 - id, title, genres
      genres, IMDB, budget,
      revenue, overview                 customers table (DUPLICATE)
                                           - id, favorite_genre
Customer Service DB:
  customers table                       Recommendation Service KHÔNG
    - id, name,                         lưu IMDB, budget, revenue, overview
      favorite_genre                    (chỉ basic info cần cho recommend logic)
```

### Vì sao duplicate?

Nhiều bạn nghĩ: "Recommendation service có table movies + customers giống y hệt? Không phải vi phạm normalization sao?"

**Có** — nhưng **CỐ Ý** trong EDA. Lý do:

#### 1. Service independence

```text
Movie Service down ➜ Recommendation Service vẫn chạy được
                       (vì có local copy của movie data)

Customer Service slow ➜ Recommendation Service không bị block
                        (đọc từ local table, không sync call)
```

Đây là **resilience pattern**. Trade-off: eventual consistency (vài giây sau khi Movie Service emit event, Recommendation mới có data mới).

#### 2. Pattern liên quan

- **CQRS** (Command Query Responsibility Segregation): Movie Service handle command (write), Recommendation Service maintain read model.
- **Event Carried State Transfer**: events mang data → consumer build local view.
- **Database per service**: mỗi service own DB của mình, không share.

#### 3. Source of truth

Mặc dù duplicate, **Movie Service vẫn là source of truth** cho thông tin phim đầy đủ.

- Movie Service emit event chỉ **basic info** (id, title, genres, runtime).
- KHÔNG emit IMDB rating, budget, revenue, overview.
- Recommendation Service muốn full detail → gọi GET API của Movie Service.

→ Event là **slim**, không carry mọi thứ.

## Event payloads

### MovieAddedEvent

```java
public record MovieAddedEvent(
    Long movieId,
    String title,
    Integer runtimeMinutes,
    List<String> genres
) {}
```

Tối thiểu nhất để Recommendation Service làm việc.

### CustomerGenreUpdatedEvent

```java
public record CustomerGenreUpdatedEvent(
    Long customerId,
    String favoriteGenre,
    Instant updatedAt
) {}
```

`updatedAt` để Recommendation Service detect duplicate / out-of-order events.

## Project structure — multi-module Maven

```text
netflux/                                # root pom
├── pom.xml                              # parent pom
├── netflux-events/                      # shared module
│   ├── pom.xml
│   └── src/main/java/.../events/
│       ├── MovieAddedEvent.java
│       └── CustomerGenreUpdatedEvent.java
├── customer-service/
│   ├── pom.xml                          # depends on netflux-events
│   └── src/main/java/...
├── movie-service/
│   ├── pom.xml                          # depends on netflux-events
│   └── src/main/java/...
└── recommendation-service/
    ├── pom.xml                          # depends on netflux-events
    └── src/main/java/...
```

### Vì sao multi-module trong demo?

Production: thường tách thành **3 Spring Boot project hoàn toàn riêng** (3 Git repo, 3 CI pipeline, 3 team).

Demo lý do gộp:
- Đơn giản cho học (1 import, 1 IDE workspace).
- Share `netflux-events` dependency dễ hơn (events module).
- Demo deploy 3 service từ cùng project.

### Shared events module

```text
netflux-events/
  src/main/java/com/calmvinsguru/netflux/events/
    MovieAddedEvent.java
    CustomerGenreUpdatedEvent.java
```

Mỗi service add dependency này:
```xml
<dependency>
    <groupId>com.calmvinsguru.netflux</groupId>
    <artifactId>netflux-events</artifactId>
    <version>1.0.0</version>
</dependency>
```

→ Producer và consumer dùng **cùng Java class** cho event payload → serialization/deserialization compatible.

> **Production tip**: trong real microservices, share module không lý tưởng (coupling). Tốt hơn: Schema Registry (Avro/Protobuf), mỗi service generate code từ schema. Demo chọn shared module vì đơn giản.

## API endpoints summary

### Movie Service

| Method | Endpoint | Body | Effect |
|---|---|---|---|
| GET | `/movies/{id}` | — | Trả về MovieDetails |
| POST | `/movies` | `MovieCreateRequest` | Insert vào DB + emit `MovieAddedEvent` |

### Customer Service

| Method | Endpoint | Body | Effect |
|---|---|---|---|
| GET | `/customers/{id}` | — | Trả về CustomerDetails |
| PATCH | `/customers/{id}` | `GenreUpdateRequest` | Update DB + emit `CustomerGenreUpdatedEvent` |

> Tại sao PATCH thay vì PUT? PUT replace toàn bộ object, PATCH update 1 field cụ thể. RESTful convention.

### Recommendation Service

| Method | Endpoint | Body | Effect |
|---|---|---|---|
| GET | `/recommendations/{customerId}` | — | Trả về danh sách MovieRecommendation hiện tại |
| GET | `/recommendations/{customerId}/stream` | — (SSE) | Server-Sent Events stream, push real-time |

## Setup project starter

GitHub repo có **2 folder**:
- `06-netflux-starter` — boilerplate sẵn (entity, DTO, mapper, controller). Bạn code service + messaging + tests.
- `07-netflux-final` — code hoàn chỉnh (reference).

### Boilerplate đã có sẵn

Mỗi service starter có:
- **Entity classes** (`@Entity` JPA).
- **Repository interfaces** (extends `JpaRepository`).
- **DTOs** (Java records).
- **Mappers** (Entity ↔ DTO conversion).
- **Controllers** (REST endpoints, không implement service call).
- **Exception classes** + `@ControllerAdvice`.
- **`data.sql`** seed data.
- **`application.yml`** Kafka binder + DB config.

### Bạn implement

- **Service layer** (business logic).
- **Messaging layer** (event publish/consume).
- **Integration tests** (Test Binder + Testcontainers).

→ Focus vào EDA, không tốn thời gian viết DTO/mapper boilerplate.

## Setup hands-on

```bash
git clone <course-repo>
cd 06-netflux-starter

# IDE: import root pom.xml (IntelliJ: File → Open → chọn root pom.xml)
# Wait Maven sync project

# Verify build OK
mvn clean compile
# BUILD SUCCESS
```

Sau khi compile thành công → mở từng service và bắt đầu implement.

## Tech stack mỗi service dùng

| Concern | Library |
|---|---|
| Web framework | Spring Boot |
| REST API | Spring MVC |
| Database (H2 in-memory cho demo) | Spring Data JPA |
| Messaging | Spring Cloud Stream + Kafka binder |
| Build tool | Maven |
| Testing | JUnit 5, Spring Boot Test, Testcontainers, Awaitility |

Production thực tế: H2 → PostgreSQL/MySQL. Còn lại stay same.

## Tóm tắt bài 1

- **Netflux** = mini Netflix với 3 microservices: Movie Service, Customer Service, Recommendation Service.
- Communication: **event-driven** qua Kafka (`movie-events`, `customer-events`).
- Recommendation Service consume cả 2 topic → build personalized recommendations → push real-time qua SSE.
- **Data duplication intentional**: mỗi service own copy data → resilience + independence. Trade-off: eventual consistency.
- Event payload **slim** — chỉ basic info. Full detail vẫn từ source-of-truth service.
- Project structure: multi-module Maven với shared `netflux-events` module.
- Starter project có sẵn boilerplate (entity, DTO, mapper, controller). Bạn implement service, messaging, tests.
- Tech stack: Spring Boot + JPA + H2 + Spring Cloud Stream + Kafka + Testcontainers.

**Bài kế tiếp** → [Bài 2: Customer Service — implementation + tests](02-customer-service.md)
