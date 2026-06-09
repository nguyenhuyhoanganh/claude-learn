# Bài 1: Bản đồ kiến trúc và pattern bạn sẽ học

> Đây là khoá học **xây microservices nghiêm túc** chứ không phải "Hello World có Docker". Bạn sẽ code 4 service Spring Boot giao tiếp qua Kafka, áp dụng Clean/Hexagonal Architecture + DDD, dùng SAGA cho distributed transaction, Outbox + CDC cho consistency, CQRS cho read/write tách biệt, rồi deploy lên Kubernetes local và Google Cloud. Bài này là **tấm bản đồ** — bạn sẽ thấy từng mảnh ghép và biết tại sao chúng tồn tại trước khi đi sâu.

## Vì sao mỗi pattern lại xuất hiện?

Đừng học pattern như danh sách kỹ thuật. Mỗi pattern trong khoá này **giải một vấn đề cụ thể** mà kiến trúc microservices tạo ra:

| Vấn đề khi tách monolith ra microservices | Pattern được dùng |
|---|---|
| Mỗi service muốn dùng tech stack riêng (DB, message broker) — không muốn business logic dính chặt vào framework | **Clean / Hexagonal Architecture** |
| Business logic phức tạp, nhiều rule, nhiều invariant — cần ngôn ngữ chung với product team | **Domain-Driven Design** |
| Service A gọi service B đồng bộ → A chết nếu B chậm/chết → cần loose coupling | **Event-driven + Kafka** |
| Một "đơn hàng" giờ phải chạy qua 3 service, không thể có ACID transaction kéo dài | **SAGA pattern** |
| Phải ghi DB **và** publish event — nếu 1 thành công 1 thất bại thì hệ thống lệch | **Outbox pattern** (+ CDC nâng cấp) |
| Một số bảng cần đọc rất nhiều ở nhiều service khác — query xuyên DB là chống chỉ định | **CQRS** |
| Mỗi service deploy độc lập, scale theo tải — không thể `mvn spring-boot:run` thủ công | **Docker + Kubernetes + GKE** |

Tất cả những vấn đề trên đều **không tồn tại** trong monolith. Microservices không "tốt hơn" — nó đổi class vấn đề này lấy class vấn đề khác. Khoá này dạy class vấn đề mới và cách giải.

## Microservices = gì, đổi lại gì?

**Microservice** là dịch vụ nhỏ (fine-grain), tự đóng gói, expose API mạng (REST / event), deploy độc lập với các service khác. Một hệ thống microservices là **nhiều service** giao tiếp với nhau qua mạng (HTTP, gRPC, message broker).

Lợi ích thường được liệt kê:
1. **Phát triển độc lập** — team A đổi service A không cần block team B.
2. **Deploy độc lập** — fix bug service-payment, không phải build lại cả hệ thống.
3. **Scale ngang dễ** — service-order quá tải thì chỉ scale service-order, không scale phần khác.
4. **Cô lập lỗi tốt hơn** — service-restaurant crash, service-payment vẫn chạy.
5. **Tech stack đa dạng** — service-A dùng Java, service-B dùng Go, service-C dùng Python.

Cái giá phải trả (cost) — khoá này dành phần lớn thời gian giải quyết:
1. **Distributed transaction** — không có `BEGIN TRANSACTION ... COMMIT` xuyên service. Phải dùng SAGA + compensation.
2. **Network = unreliable** — service B có thể chậm, mất gói, lặp request. Phải idempotent + retry.
3. **Eventual consistency** — read trên một service có thể chưa thấy ghi từ service khác. Phải design UX chấp nhận điều này.
4. **Operational complexity** — deploy/log/trace/monitor 10 service khó gấp 10 lần 1 monolith.

Nếu hệ thống của bạn nhỏ và không có nhu cầu scale/deploy độc lập rõ ràng, **đừng** chia microservices. Bài học từ Netflix, Uber, Amazon là kết quả của vấn đề scale ở quy mô lớn — không phải "vì microservices hot".

## Clean Architecture & Hexagonal Architecture — nền móng

**Clean Architecture** (Robert C. Martin, 2012) và **Hexagonal Architecture** (Alistair Cockburn, 2005) cùng một tinh thần: **business logic ở giữa, dependency luôn hướng vào trong**.

```text
                ┌──────────────────────────────────────┐
                │           Outer ring                  │
                │  REST controller, Kafka producer,    │
                │  Postgres adapter, Spring framework   │
                │                                       │
                │   ┌────────────────────────────┐     │
                │   │     Application Service     │     │
                │   │  (use case orchestration)   │     │
                │   │                              │     │
                │   │   ┌──────────────────────┐  │     │
                │   │   │  Domain Core         │  │     │
                │   │   │  Entity, Aggregate,  │  │     │
                │   │   │  Value Object,       │  │     │
                │   │   │  Domain Event,       │  │     │
                │   │   │  Domain Service      │  │     │
                │   │   └──────────────────────┘  │     │
                │   └────────────────────────────┘     │
                └──────────────────────────────────────┘

           Dependencies always point inward →
```

Tầng ngoài có thể thay (Postgres → MongoDB, Kafka → RabbitMQ, Spring → Quarkus) **mà không sửa core**. Đây là tài sản dài hạn của khoá học: code business chạy được 10 năm sau dù framework thời thượng đã đổi.

**Onion Architecture** (Jeffrey Palermo, 2008) là phiên bản gần giống — cùng tư tưởng "core không phụ thuộc outside". Khoá này sẽ dùng `Clean` và `Hexagonal` thay thế nhau, vì sự khác biệt rất nhỏ.

> Đọc kỹ phase-2 — toàn bộ source code phase-3 đến phase-13 đều xếp theo cấu trúc này. Hiểu nhầm phase-2 = lạc đường mọi phase còn lại.

## Domain-Driven Design — ngôn ngữ chung cho business

**DDD** (Eric Evans, 2003) cung cấp **pattern chiến thuật** (tactical) để code business logic gọn gàng:

| Khái niệm DDD | Vai trò | Ví dụ trong food ordering |
|---|---|---|
| **Entity** | Object có **identity**, vòng đời, state thay đổi | `Order`, `Customer`, `Restaurant`, `OrderItem` |
| **Value Object** | Object **không identity**, **immutable**, định danh bằng giá trị | `Money`, `Address`, `OrderId`, `TrackingId` |
| **Aggregate** | Cụm Entity + VO **luôn nhất quán cùng nhau** trong một transaction | `Order` (root) + `OrderItem` list + `OrderStatus` |
| **Aggregate Root** | Entity "cổng vào" của Aggregate — mọi thao tác đi qua root | `Order` class |
| **Domain Service** | Logic không thuộc riêng entity nào, hoặc cần nhiều aggregate | `OrderDomainService.validateAndInitiateOrder()` |
| **Application Service** | Tầng vỏ ngoài domain — orchestrate use case, gọi adapter | `OrderApplicationService.createOrder()` |
| **Domain Event** | Sự kiện đã xảy ra trong domain, để service khác nghe | `OrderCreatedEvent`, `PaymentCompletedEvent` |
| **Bounded Context** | Ranh giới ngôn ngữ + model — mỗi microservice = 1 context | "Order context", "Payment context", "Restaurant context" |

DDD và Clean Architecture không xung đột — chúng **bổ sung nhau**. Clean nói "tầng nào nằm đâu", DDD nói "tầng domain bên trong viết thế nào". Khoá này dùng cả hai song song.

> **Bounded Context** quan trọng nhất khi tách microservice. Mỗi context có ngôn ngữ riêng. Trong `Order context`, "customer" có địa chỉ giao hàng và số đơn cũ. Trong `Payment context`, "customer" có ví, lịch sử thẻ. Đừng cố chia sẻ một class `Customer` cho cả hai — đó là cái bẫy kinh điển.

## Apache Kafka — message bus xuyên suốt

**Kafka** là message broker được dùng làm event backbone. 3 đặc tính then chốt:

1. **Persistent disk store** — message ghi xuống disk, không mất khi consumer chậm hay broker restart.
2. **Partitioning** — mỗi topic chia thành nhiều partition để scale ngang.
3. **Consumer group** — nhiều consumer chia tải đọc cùng topic.

Trong khoá này, Kafka làm 3 việc:

- **SAGA**: chuyển event giữa các step (Order → Payment → Restaurant → Order).
- **Outbox**: scheduler đọc Outbox table và publish vào Kafka.
- **CQRS**: stream customer event từ Customer service sang Order service.

Phase-4 sẽ học Kafka từ đầu (topic, partition, producer, consumer, key-based ordering). Nếu bạn chưa quen Kafka, đừng lo — phase-4 đủ để dùng được trong project.

## SAGA Pattern — transaction xuyên service

**Vấn đề**: tạo đơn hàng cần (1) Order ghi DB, (2) Payment thanh toán, (3) Restaurant xác nhận. Cả 3 phải cùng thành công, hoặc cùng thất bại. **Không có transaction phân tán** trong microservice (2PC quá đắt và mong manh).

**Giải pháp SAGA** (publication 1987 của Garcia-Molina): chia transaction lớn thành **chuỗi local transaction**. Mỗi local transaction commit độc lập. Khi một bước lỗi, dùng **compensating action** (rollback bằng nghiệp vụ) để bù trừ.

```text
[Order created]
       │
       ▼  publish OrderCreatedEvent
[Payment service]  ──── thành công ────► [Order status = PAID]
       │                                          │
       ▼ thất bại                                  ▼ publish OrderPaidEvent
[Order status = CANCELLED]                  [Restaurant service]
                                                   │
                                          thành công│      │thất bại
                                                   ▼      ▼
                                    [Order = APPROVED]  Payment refund → Order = CANCELLED
```

Hai cách triển khai SAGA:
- **Choreography** — không có "đầu não", mỗi service nghe event và phản ứng. Decentralized.
- **Orchestration** — có 1 orchestrator điều phối các step.

Khoá này dùng **choreography** với Kafka làm event bus, **nhưng** Order service vẫn đóng vai "coordinator" mềm (initiate + finalize). Phase-8 đi sâu.

## Outbox Pattern — chống lỗi dual-write

**Vấn đề "dual write"**: trong cùng một bước SAGA, service phải làm **2 việc**:
1. Ghi DB cục bộ (state changed).
2. Publish event lên Kafka (báo service khác).

Không có ACID transaction xuyên DB + Kafka.

```text
KỊCH BẢN SAI 1: Ghi DB trước, publish Kafka sau
   commit DB ✓
   publish event ✗ (Kafka down)
   → State đã thay đổi, nhưng service khác không biết. SAGA chết.

KỊCH BẢN SAI 2: Publish Kafka trước, ghi DB sau
   publish event ✓
   commit DB ✗ (validation fail)
   → Service khác nghĩ thành công, nhưng thực ra DB chưa lưu. Hệ thống lệch.
```

**Outbox pattern** giải bằng cách thêm 1 bảng `outbox` trong **cùng DB** với business state. Mỗi step:
1. Ghi `Order` table + INSERT `outbox` row trong **một ACID transaction**.
2. Một scheduler riêng đọc `outbox`, publish lên Kafka, mark `outbox.status = SENT`.

```text
┌──────────────┐
│ Order Service│
│              │
│ ┌─────────┐  │  ACID transaction
│ │ orders  │  │  ┌──────────────┐
│ │ outbox  │──┼─►│ Scheduler    │──► Kafka topic
│ └─────────┘  │  │ poll outbox  │
│              │  │ + publish    │
└──────────────┘  └──────────────┘
```

Hai cách triển khai Outbox publishing:
- **Polling** — scheduler query Outbox table định kỳ. Đơn giản, dễ hiểu. Khoá học dùng cách này từ phase-9.
- **CDC (Change Data Capture)** — đọc transaction log của DB (Postgres WAL) bằng Debezium, không cần polling. Phase-13 sẽ migrate sang CDC.

## CQRS — tách read và write

**CQRS** (Command Query Responsibility Segregation) chia code và DB thành 2 phía:
- **Command** (write): nhận command, đổi state, ghi DB write.
- **Query** (read): trả data về client, có thể từ DB khác đã được tối ưu cho query.

```text
                    ┌────────────────────┐
                    │   Command side     │
   write request →  │  (Postgres OLTP)   │  
                    └─────────┬──────────┘
                              │ stream event (Kafka)
                              ▼
                    ┌────────────────────┐
                    │   Query side       │
   read request  →  │  (Elasticsearch,   │
                    │   read DB, cache)  │
                    └────────────────────┘
```

Lợi ích:
- Read side dùng DB tối ưu cho query (Elasticsearch full-text, materialized view, denormalized table).
- Read và write scale độc lập (đọc nhiều hơn ghi 100 lần thì scale read mạnh hơn).
- Bảo mật tách bạch (write có thể yêu cầu role cao hơn read).

Cái giá: **eventual consistency** — read side luôn trễ vài giây so với write. Phải design UI/UX chấp nhận.

Trong khoá: phase-10 áp dụng CQRS cho Customer service. Lúc đầu Customer được đọc qua materialized view + trigger (phase-1 đến 9). Sau đó được nâng cấp thành CQRS: Customer service publish event → Order service consume → ghi vào local table riêng → query từ local table.

## Kubernetes & GKE — chạy thật

**Docker** đóng gói service thành image. **Kubernetes** chạy container ở quy mô lớn: tự khởi động lại khi crash, scale lên/xuống, load balance, rolling update.

Plan deploy của khoá:
1. **Local Kubernetes** (Docker Desktop hoặc Minikube): chạy thử cluster ở máy.
2. **CP Helm Chart** cho Kafka: deploy Confluent Kafka vào Kubernetes bằng Helm.
3. **Postgres** trong K8s: deploy theo Docker image hoặc StatefulSet.
4. **GKE** (Google Kubernetes Engine): tạo cluster trên Google Cloud, push image lên Artifact Registry, deploy lên GKE.
5. **Horizontal Pod Autoscaler** (HPA): scale service tự động theo CPU.

Phase-11 và 12 sẽ làm việc này tay từng bước.

## So sánh với những thứ bạn có thể đã nghe

| Pattern khoá học | Có thể bạn từng thấy ở | Khác gì |
|---|---|---|
| **Event-driven + Kafka** | RabbitMQ, NATS, AWS SNS/SQS, Spring Cloud Stream | Kafka có persistent log + replay → quan trọng cho Outbox |
| **SAGA choreography** | Spring State Machine, Camunda, Temporal | Choreography không cần framework điều phối — chính là điểm dạy của khoá |
| **Outbox pattern** | Spring Modulith Outbox, Debezium Outbox SMT | Phase-9 tự code → hiểu cơ chế bên trong |
| **CQRS** | Axon Framework, EventStoreDB | Khoá không dùng framework → CQRS thuần Kafka |
| **DDD** | Vaughn Vernon's IDDD book, jMolecules | Khoá dạy tactical pattern qua code thực, không chỉ lý thuyết |

> Khoá học **cố tình không dùng framework SAGA/CQRS** (Eventuate, Axon) để bạn thấy cơ chế. Sau khi hiểu thuần, bạn có thể chọn framework nếu muốn — nhưng bạn sẽ **biết framework đó đang làm gì** thay vì học vẹt.

## Dòng chảy học của khoá

```text
Phase 1   Tổng quan + setup môi trường
Phase 2   Clean & Hexagonal Architecture (Order service skeleton)
Phase 3   DDD: Entity, Aggregate, Value Object, Domain Service, Application Service
Phase 4   Kafka cơ bản + 4 module sharable (config, model, producer, consumer)
Phase 5   Hoàn thiện Order service: REST API, Postgres adapter, Kafka adapter, container
Phase 6   Payment service từ A-Z theo cùng cấu trúc
Phase 7   Restaurant service từ A-Z
Phase 8   SAGA pattern (choreography qua Kafka)
Phase 9   Outbox pattern (polling) → consistency
Phase 10  CQRS pattern (Customer service)
Phase 11  Kubernetes local (Confluent Kafka + microservices + Postgres)
Phase 12  GKE (Google Cloud) + horizontal scaling
Phase 13  Outbox với CDC (Debezium) → so sánh polling vs CDC
Phase 14  Spring Boot version updates (2.6 → 3.x, Kafka KRaft)
```

Bạn có thể skip phase nếu đã quen — nhưng **không** skip phase-2 và phase-3 (Architecture + DDD). Mọi code sau đều xếp theo cấu trúc đó.

## Tóm tắt bài 1

- Microservices đổi class vấn đề (deploy, scale, fault isolation) lấy class vấn đề mới (distributed transaction, dual-write, eventual consistency).
- 6 nhóm kiến trúc + pattern dạy trong khoá: Clean/Hexagonal + DDD + Kafka + SAGA + Outbox + CQRS, deploy bằng K8s/GKE.
- Mỗi pattern giải đúng 1 vấn đề cụ thể — không học theo danh sách, học theo "vấn đề → giải pháp".
- Khoá cố tình không dùng framework điều phối SAGA/CQRS — bạn sẽ hiểu cơ chế bên trong.
- Bounded Context (DDD) = ranh giới microservice. Đừng share entity class xuyên context.

**Bài kế tiếp** → [Bài 2: Food Ordering System — bài toán bạn sẽ build](02-bai-toan-food-ordering.md)
