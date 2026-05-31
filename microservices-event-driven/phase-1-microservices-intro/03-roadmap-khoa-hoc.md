# Bài 3: Roadmap khoá học và glossary cần thuộc

Trước khi đào sâu, bài này cho bản đồ tổng thể của khoá học + định nghĩa **20 thuật ngữ cốt lõi** xuất hiện trong mọi phase. Đọc kỹ — nếu confused về 1 thuật ngữ ở phase sau, quay lại đây.

## Roadmap 8 phase

```text
Phase 1: Microservices intro
  └── Hiểu vấn đề + benefits + challenges (bạn đang ở đây)
        │
        ▼
Phase 2: Migration to Microservices
  └── Boundaries, Strangler Fig pattern, decomposition steps
        │
        ▼
Phase 3: Principles & Best Practices
  └── DB per service, DRY trap, team autonomy, micro-frontends, API gateway
        │
        ▼
Phase 4: Event-Driven Architecture
  └── Async messaging, Kafka/RabbitMQ, delivery semantics
        │
        ▼
Phase 5: Design Patterns (Saga, CQRS, Event Sourcing)
  └── Distributed transaction, read/write split, append-only log
        │
        ▼
Phase 6: Testing
  └── Test pyramid, contract testing, production testing
        │
        ▼
Phase 7: Observability
  └── Logging, metrics, distributed tracing — 3 pillars
        │
        ▼
Phase 8: Deployment
  └── VM, serverless, container, Kubernetes orchestration
```

Mỗi phase có **3-5 bài**. Tổng ~32 bài. Đọc tuần tự, không skip.

## Cách dùng khoá này hiệu quả

| Tình huống | Approach |
|---|---|
| Bạn đang ở monolith, cân nhắc migrate | Đọc kỹ Phase 1-2, dừng — quyết định trước khi học tiếp |
| Bạn đã ở microservices, gặp vấn đề | Skip Phase 1-2, deep Phase 3-7 theo pain point |
| Bạn phỏng vấn senior | Đọc cả 8 phase, focus pattern + trade-offs |
| Bạn xây hệ thống mới | Phase 2 (boundaries) + Phase 5 (patterns) trước khi code |

## 20 thuật ngữ cốt lõi

### 1. Monolith / Monolithic Application

App chia logic thành package/module nhưng **deploy 1 binary, chạy 1 process, dùng 1 database**.

### 2. Microservice

Service nhỏ, scope hẹp, deploy độc lập, own 1 business capability, do 1 team sở hữu.

### 3. Service Boundary

Đường biên giữa các service. Vẽ đúng = decoupling thật; vẽ sai = distributed monolith.

### 4. Bounded Context (DDD)

Khái niệm từ Domain-Driven Design: phạm vi mà 1 thuật ngữ có ý nghĩa nhất quán. Vd "User" trong Auth khác "User" trong Billing.

### 5. Domain-Driven Design (DDD)

Phương pháp thiết kế nhấn mạnh **domain (nghiệp vụ)** thay vì technical. Eric Evans giới thiệu 2003. Là cơ sở vẽ service boundary đúng.

### 6. Synchronous Communication

Service A **đợi** service B trả lời (vd HTTP REST, gRPC). Đơn giản nhưng coupling cao.

### 7. Asynchronous Communication

Service A publish message lên broker, không đợi B đọc. B đọc khi rảnh. Loose coupling.

### 8. Message Broker

Phần mềm trung gian routing message giữa publisher và subscriber. Vd: Kafka, RabbitMQ, AWS SQS/SNS, Google Pub/Sub.

### 9. Event-Driven Architecture (EDA)

Kiến trúc nơi service giao tiếp qua **event** (sự kiện đã xảy ra) thay vì command (yêu cầu làm gì). Vd `OrderPlaced` (event) vs `PlaceOrder` (command).

### 10. Topic / Queue

- **Topic** (Kafka, SNS): publisher → topic; **N consumer** subscribe; mỗi consumer nhận **bản sao** event.
- **Queue** (RabbitMQ, SQS): publisher → queue; **N consumer** compete; mỗi event đến **1 consumer**.

### 11. Idempotency

Operation chạy nhiều lần cho cùng kết quả. Vital trong distributed system vì message có thể duplicate. Vd: `setBalance(100)` idempotent; `addBalance(10)` không.

### 12. Saga Pattern

Pattern thực hiện **distributed transaction** bằng chuỗi local transaction + compensating action khi fail. Phase 5 deep-dive.

### 13. CQRS — Command Query Responsibility Segregation

Tách model **ghi** (Command) khỏi model **đọc** (Query). Ghi vào DB tối ưu cho write, sync sang DB tối ưu cho read. Phase 5 deep-dive.

### 14. Event Sourcing

Lưu **mọi event** thay vì state cuối. State derive bằng replay events. Audit log built-in, time-travel possible. Phase 5 deep-dive.

### 15. API Gateway

Single entry point cho client request, route đến đúng service. Cũng handle auth, rate limit, transform. Vd: Kong, AWS API Gateway, Apigee.

### 16. Service Mesh

Layer hạ tầng dưới application code, handle service-to-service communication: mTLS, retry, circuit breaker, observability. Vd: Istio, Linkerd, Cilium.

### 17. Circuit Breaker

Pattern dừng gọi service đang fail để tránh cascade failure. State: closed → open → half-open. Netflix Hystrix (deprecated), Resilience4j thay thế.

### 18. Eventual Consistency

Trạng thái hệ thống **không nhất quán ngay** sau write, nhưng **sẽ nhất quán** sau N seconds. Trade-off của distributed system vs strong consistency.

### 19. Observability vs Monitoring

- **Monitoring**: theo dõi metric biết trước (CPU, memory, RPS).
- **Observability**: hiểu hệ thống đủ để **debug bug chưa biết** từ output (logs + metrics + traces).

### 20. Distributed Tracing

Track 1 request qua nhiều service bằng **trace ID** + **span**. Tool: Jaeger, Zipkin, Tempo, AWS X-Ray, Datadog APM.

## Bonus: 5 thuật ngữ EDA chuyên sâu

### Event vs Message vs Command

- **Event** = "đã xảy ra" (`OrderPlaced`). Past tense.
- **Message** = data unit chung (Event hoặc Command).
- **Command** = "hãy làm" (`PlaceOrder`). Imperative.

EDA prefer **events** vì decoupling cao hơn: producer không biết ai consume.

### At-most-once / At-least-once / Exactly-once

- **At-most-once**: message có thể mất, không bao giờ duplicate. Nhanh, rủi ro mất data.
- **At-least-once**: không mất, có thể duplicate. Phổ biến nhất. Cần idempotent consumer.
- **Exactly-once**: không mất, không duplicate. Khó, đắt. Kafka có hỗ trợ.

### Dead Letter Queue (DLQ)

Queue chứa message **process fail nhiều lần**. Cho dev investigate sau, tránh block flow.

### Consumer Group

Nhóm consumer cùng đọc 1 topic. Kafka đảm bảo mỗi message gửi đến **đúng 1 consumer trong group** → enable horizontal scale.

### Outbox Pattern

Pattern đảm bảo "ghi DB + publish event" atomic: ghi event vào table `outbox` cùng transaction DB, có worker đọc outbox publish broker. Tránh "ghi DB ok nhưng publish fail" → mất event.

## Tech stack tiêu biểu — biết để chọn

| Tier | Lựa chọn phổ biến |
|---|---|
| Language | Java (Spring Boot), Go, Node.js, Python (FastAPI), C# (.NET), Rust |
| Sync API | REST (OpenAPI), gRPC (Protobuf), GraphQL |
| Async messaging | **Kafka** (high throughput), **RabbitMQ** (versatile), AWS SQS+SNS, NATS, Pulsar |
| API Gateway | Kong, Tyk, AWS API Gateway, Apigee, KrakenD |
| Service mesh | Istio, Linkerd, Cilium, Consul |
| Container orchestration | **Kubernetes** (default), AWS ECS, Nomad |
| Tracing | Jaeger, Tempo, Zipkin, Datadog APM, New Relic |
| Metrics | **Prometheus** + Grafana, Datadog, CloudWatch |
| Logs | ELK, Loki, Splunk, Datadog Logs |
| CI/CD | Jenkins, GitHub Actions, GitLab CI, Argo CD, Flux |
| IaC | Terraform, Pulumi, CloudFormation |

Khoá này không bias tool nào — concept áp dụng cho mọi tool.

## Đọc thêm — sách cốt lõi

- **"Building Microservices" — Sam Newman** (2nd ed, 2021): bible của microservices.
- **"Microservices Patterns" — Chris Richardson**: pattern catalog + Saga, CQRS, ...
- **"Domain-Driven Design" — Eric Evans**: DDD bible.
- **"Implementing Domain-Driven Design" — Vaughn Vernon**: DDD áp dụng thực tế.
- **"Release It!" — Michael Nygard**: stability pattern (circuit breaker, bulkhead).
- **"Designing Data-Intensive Applications" — Martin Kleppmann**: distributed system + EDA foundation.

Đọc 1-2 quyển song song với khoá này → tăng depth.

## Tóm tắt bài 3

- 8 phase: intro → migration → principles → EDA → patterns → testing → observability → deployment.
- **20 thuật ngữ cốt lõi** + **5 thuật ngữ EDA chuyên sâu** — thuộc trước khi sang phase tiếp.
- **Modular monolith** là middle ground hợp lý cho < 200 dev.
- Stack lớn: Spring Boot/Go/Node + Kafka/RabbitMQ + Kubernetes + Prometheus + Jaeger.
- Đọc kèm 1-2 sách kinh điển sẽ tăng độ sâu kiến thức.

**Phase kế tiếp** → [Phase 2 — Bài 1: Service boundaries — nguyên tắc cốt lõi](../phase-2-migration/01-service-boundaries.md)
