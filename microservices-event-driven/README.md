# Microservices Event Driven

> Kiến trúc hướng sự kiện — và cái giá của nó.

28 bài về microservice giao tiếp bằng sự kiện: mô hình giao tiếp, event sourcing, nhất quán cuối cùng, saga, idempotency, schema evolution, quan sát hệ thống phân tán (logging tập trung, metrics, distributed tracing) và triển khai.

**28 bài** trong 8 phần.

## Mục lục

### Phase 1 — microservices intro

| Bài | Nội dung |
|---|---|
| [01](phase-1-microservices-intro/01-microservices-la-gi.md) | Bài 1: Microservices là gì? Vấn đề thực sự nó giải quyết |
| [02](phase-1-microservices-intro/02-loi-ich-thach-thuc.md) | Bài 2: Benefits và Challenges chi tiết — vì sao "distributed monolith" là cơn ác mộng |
| [03](phase-1-microservices-intro/03-roadmap-khoa-hoc.md) | Bài 3: Roadmap khoá học và glossary cần thuộc |

### Phase 2 — migration

| Bài | Nội dung |
|---|---|
| [01](phase-2-migration/01-service-boundaries.md) | Bài 1: Service boundaries — 3 nguyên tắc cốt lõi |
| [02](phase-2-migration/02-decomposition-strategies.md) | Bài 2: Decomposition — cắt monolith bằng Business Capability và DDD Sub-domain |
| [03](phase-2-migration/03-strangler-fig-pattern.md) | Bài 3: Strangler Fig pattern — migrate incremental, không big-bang |
| [04](phase-2-migration/04-data-migration.md) | Bài 4: Data migration — chia database khi migrate (phần khó nhất) |

### Phase 3 — principles

| Bài | Nội dung |
|---|---|
| [01](phase-3-principles/01-database-per-service.md) | Bài 1: Database per Microservice — nguyên tắc bất di bất dịch |
| [02](phase-3-principles/02-dry-shared-library.md) | Bài 2: DRY trap — vì sao shared library là kẻ thù trong microservices |
| [03](phase-3-principles/03-structured-autonomy.md) | Bài 3: Structured Autonomy — cân bằng tự do và chuẩn cho team |
| [04](phase-3-principles/04-micro-frontends.md) | Bài 4: Micro-frontends — chia frontend như chia backend |
| [05](phase-3-principles/05-api-gateway-management.md) | Bài 5: API Gateway — cổng vào duy nhất cho microservices |

### Phase 4 — event driven

| Bài | Nội dung |
|---|---|
| [01](phase-4-event-driven/01-eda-la-gi.md) | Bài 1: Event-Driven Architecture — vì sao microservices và EDA "sinh ra cho nhau" |
| [02](phase-4-event-driven/02-use-cases-patterns.md) | Bài 2: Use cases và 2 patterns delivery của EDA |
| [03](phase-4-event-driven/03-delivery-semantics.md) | Bài 3: Delivery semantics — at-most-once, at-least-once, exactly-once |

### Phase 5 — design patterns

| Bài | Nội dung |
|---|---|
| [01](phase-5-design-patterns/01-saga-pattern.md) | Bài 1: Saga Pattern — distributed transaction trong microservices |
| [02](phase-5-design-patterns/02-cqrs-pattern.md) | Bài 2: CQRS — tách read model và write model |
| [03](phase-5-design-patterns/03-event-sourcing.md) | Bài 3: Event Sourcing — events là source of truth |

### Phase 6 — testing

| Bài | Nội dung |
|---|---|
| [01](phase-6-testing/01-testing-pyramid.md) | Bài 1: Testing pyramid trong microservices — vì sao approach monolith không scale |
| [02](phase-6-testing/02-contract-production-testing.md) | Bài 2: Contract testing + Production testing — escape E2E hell |

### Phase 7 — observability

| Bài | Nội dung |
|---|---|
| [01](phase-7-observability/01-3-pillars.md) | Bài 1: 3 trụ cột Observability — vì sao monitoring không đủ |
| [02](phase-7-observability/02-distributed-logging.md) | Bài 2: Distributed Logging — best practices cho 1000 microservice instances |
| [03](phase-7-observability/03-metrics.md) | Bài 3: Metrics — 5 signal types thực sự cần đo |
| [04](phase-7-observability/04-distributed-tracing.md) | Bài 4: Distributed Tracing — vẽ path của 1 request qua N services |

### Phase 8 — deployment

| Bài | Nội dung |
|---|---|
| [01](phase-8-deployment/01-vm-dedicated-serverless.md) | Bài 1: Lựa chọn infrastructure — VM, Dedicated Hosts, Serverless |
| [02](phase-8-deployment/02-containers.md) | Bài 2: Containers — package microservice một lần, chạy mọi nơi |
| [03](phase-8-deployment/03-kubernetes-orchestration.md) | Bài 3: Container Orchestration với Kubernetes — OS cho microservices |
| [04](phase-8-deployment/04-production-checklist.md) | Bài 4: Production checklist — đưa microservices lên prod an toàn |

## Nên bắt đầu từ đâu

| Bạn đang ở tình huống | Đọc từ |
|---|---|
| Đang cân nhắc chuyển sang event-driven | phase đầu — phần đánh đổi |
| Đã có hệ thống, khó debug | phase-7 observability và distributed tracing |

---

*Mục lục này sinh từ cấu trúc thư mục và tiêu đề thật của từng bài. Thêm bài mới thì cập nhật lại bảng tương ứng.*
