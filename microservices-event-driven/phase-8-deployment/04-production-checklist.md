# Bài 4: Production checklist — đưa microservices lên prod an toàn

Bạn đã học 8 phase: từ "microservices là gì" đến Kubernetes. Bài cuối: **checklist** thực dụng để ship microservices vào production. Mỗi mục đã được dạy chi tiết trong các phase trước — bài này là **map tổng** + quy tắc verify cuối.

## 8 phase đã đi qua

```text
Phase 1: Microservices intro (định nghĩa, monolith vs microservices, fallacies)
Phase 2: Migration (boundaries, decomposition, Strangler, data migration)
Phase 3: Principles (DB per service, DRY trap, structured autonomy, MF, API Gateway)
Phase 4: Event-Driven Architecture (EDA basics, use cases, delivery semantics)
Phase 5: Design Patterns (Saga, CQRS, Event Sourcing)
Phase 6: Testing (pyramid, contract testing, test in prod)
Phase 7: Observability (logs, metrics, traces)
Phase 8: Deployment (VM/dedicated/serverless, containers, Kubernetes)
```

Mỗi phase = 1 dimension. Production-grade = tất cả dimensions kèm nhau.

## Pre-launch checklist — 9 dimensions

### Dimension 1: Boundaries & ownership

- [ ] Mỗi service có **clear ownership**: 1 team own end-to-end.
- [ ] Boundaries chia theo **business capability** hoặc **DDD sub-domain**, không theo tech layer.
- [ ] Service có **single responsibility** không vague ("OrderService" rõ, "BusinessService" mờ).
- [ ] Service không quá nhỏ (nano-service) — chứa đủ business logic để standalone.
- [ ] Không có **2 service cùng own data** của 1 entity (vi phạm DB per service ngầm).

### Dimension 2: Data architecture

- [ ] **Database per service** strict — không service nào query thẳng DB của service khác.
- [ ] DB tech chọn theo workload (polyglot OK).
- [ ] Cross-service data access **chỉ qua API** hoặc **events**.
- [ ] Data duplication có **source of truth duy nhất** + read-only ở consumer.
- [ ] Strict consistency case (balance, inventory): **không duplicate**, gọi API trực tiếp.
- [ ] **Outbox pattern** cho atomic "save DB + publish event".

### Dimension 3: Communication

- [ ] Internal sync: REST/gRPC qua **service discovery** (DNS / k8s Service).
- [ ] Internal async: **message broker** (Kafka, RabbitMQ, SQS).
- [ ] External: **API Gateway** (Kong, NGINX, AWS API Gateway).
- [ ] **TLS** giữa services (mTLS preferred).
- [ ] **Timeout + retry + circuit breaker** cho mọi cross-service call.
- [ ] **Idempotency** cho mọi POST/PUT có thể retry.

### Dimension 4: Resilience

- [ ] **Bulkhead**: thread pool isolation per downstream.
- [ ] **Circuit breaker** (Resilience4j, Polly) cho external dependencies.
- [ ] **Retry với exponential backoff** + jitter.
- [ ] **Fallback** behavior khi downstream fail (cached response, default value, queue for later).
- [ ] **Graceful degradation**: non-critical feature fail không kill core flow.
- [ ] **Saga + compensation** cho distributed transactions.
- [ ] **Dead Letter Queue** cho events fail processing.

### Dimension 5: Testing

- [ ] **Unit tests** coverage ≥ 70% (business logic chính).
- [ ] **Service integration tests** với real DB + broker (testcontainers).
- [ ] **Contract tests** (Pact) cho mỗi cross-service API.
- [ ] **Schema registry** (Avro/Protobuf) cho events, compat rules enforced.
- [ ] **Smoke tests** (5-10) cho critical user journeys.
- [ ] **Load tests** baseline + threshold.
- [ ] **Chaos engineering** (Chaos Monkey, Gremlin) cho mature systems.

### Dimension 6: Observability

- [ ] **Centralized logging** (ELK, Loki, Datadog). Structured JSON.
- [ ] **Correlation ID / trace ID** propagated cross-service.
- [ ] **Metrics** với 5 signal types (traffic, errors, latency, saturation, utilization).
- [ ] **Distributed tracing** (OpenTelemetry + Jaeger/Tempo).
- [ ] **Alerts on symptoms** (user pain), không trên causes (CPU 80%).
- [ ] **Dashboards** per service: traffic, errors, latency p99, resource.
- [ ] **SLO định nghĩa** + error budget tracking.
- [ ] **No PII / secrets in logs**.
- [ ] **Sampling strategy** cho traces (tail-based: keep errors + slow).

### Dimension 7: Deployment

- [ ] **CI/CD pipeline** mỗi service. Commit → test → build → deploy.
- [ ] **Container image** immutable, versioned (no `latest` tag).
- [ ] **Image scanning** (Trivy, Snyk) cho CVE.
- [ ] **Run as non-root** trong container.
- [ ] **Resource requests + limits** set trên mọi pod.
- [ ] **Readiness + liveness probes** configured correctly.
- [ ] **Rolling update** với `maxUnavailable: 0`.
- [ ] **Blue-green hoặc canary** cho critical services.
- [ ] **Feature flags** cho controlled rollout.
- [ ] **Rollback strategy** documented + tested.
- [ ] **GitOps** workflow (ArgoCD/FluxCD) — không kubectl-to-prod.

### Dimension 8: Security

- [ ] **Authentication** at API Gateway (JWT, OAuth2).
- [ ] **Authorization** clear per endpoint.
- [ ] **mTLS** between internal services (service mesh).
- [ ] **Secrets management** (Vault, AWS Secrets Manager, K8s Sealed Secrets) — không hard-code.
- [ ] **Least privilege** IAM roles per service.
- [ ] **Network policies** (k8s NetworkPolicy) — không "allow all".
- [ ] **Rate limiting** at gateway + per-service.
- [ ] **Input validation** ở mọi external boundary.
- [ ] **Audit logging** cho sensitive operations.

### Dimension 9: Operations

- [ ] **Runbook** cho top 5 alerts per service.
- [ ] **On-call rotation** với escalation policy.
- [ ] **Incident response process** (PagerDuty, OpsGenie).
- [ ] **Post-mortem culture** (blameless).
- [ ] **Capacity planning** quarterly.
- [ ] **Backup + restore tested** (DR drill ≥ 2× / năm).
- [ ] **Cost monitoring** + budget alerts.
- [ ] **Documentation**: API docs, architecture decision records (ADR), service catalog.

## Maturity model — đo độ trưởng thành

| Level | Description | Indicators |
|---|---|---|
| **L1: Crawling** | Few services, manual deploys | Single env, no monitoring, no tests |
| **L2: Walking** | CI/CD basic, some monitoring | Pyramid testing, dashboards |
| **L3: Running** | Containers + orchestration + observability | K8s, Prometheus, distributed tracing |
| **L4: Scaling** | Multi-region, service mesh, GitOps | Istio/Linkerd, ArgoCD, chaos engineering |
| **L5: Optimizing** | Self-service platform, paved roads | Internal developer platform (Backstage), golden path templates |

Most companies stuck L2-L3. L4+ requires platform team investment.

## Common pitfalls — recap từ 8 phase

### Pitfall 1: Distributed monolith

Symptom: services tightly coupled (shared DB, sync chain, deploy together).
Fix: Phase 3 — DB per service, async EDA where possible.

### Pitfall 2: Nano-services

Symptom: 50 services, mỗi cái 200 LoC, requests bounce 10 services.
Fix: Phase 2 — service boundary theo business capability, không theo function.

### Pitfall 3: Saga without compensation idempotent

Symptom: rollback fails, manual ops chronic.
Fix: Phase 5 — compensation phải idempotent + retry-able infinite.

### Pitfall 4: Eventual consistency UX disaster

Symptom: user posts, refresh, không thấy. Frustration.
Fix: optimistic UI, pending state, read-your-writes hack.

### Pitfall 5: No correlation ID

Symptom: incident takes 4 hours to debug.
Fix: Phase 7 — propagate trace ID at gateway, log everywhere.

### Pitfall 6: 100% E2E test attempt

Symptom: pipeline 6 hours, 30% flaky, devs ignore.
Fix: Phase 6 — contract tests + smoke + production testing.

### Pitfall 7: Alert fatigue

Symptom: 100 alerts/day, ignored, real incident missed.
Fix: Phase 7 — page on user-facing symptoms only.

### Pitfall 8: K8s for tiny team

Symptom: 80% time on infra, 20% on product.
Fix: Phase 8 — ECS Fargate, Cloud Run, even VMs for < 10 services.

### Pitfall 9: Shared library tight coupling

Symptom: 1 lib bug = 20 services patched.
Fix: Phase 3 — sidecar, code generation, hoặc duplicate code.

### Pitfall 10: Skipping Strangler

Symptom: big-bang rewrite, 18 tháng, fail.
Fix: Phase 2 — incremental Strangler Fig, dual-write, gradual cutover.

## Service maturity scorecard (mẫu)

Mỗi service tự đánh giá:

| Dimension | Score (1-5) | Notes |
|---|---|---|
| Tests pyramid | 4 | Unit + integration + contract + smoke |
| Logging | 5 | Structured JSON, correlation ID, no PII |
| Metrics | 4 | RED + USE, SLO defined |
| Tracing | 3 | OTel instrumented but sampling 100% (cost issue) |
| Resilience | 4 | Circuit breaker + retry + bulkhead |
| Deployment | 5 | GitOps, rolling, blue-green for critical |
| Security | 3 | mTLS missing, working on it |
| Documentation | 2 | README + API spec, no runbook |
| **Total** | **30/40** | Above average |

Goal: score ≥ 32/40 for production-grade. Below → don't ship.

## Org-level checklist

Beyond per-service:

- [ ] **Platform team** owns shared infra (k8s, observability, CI).
- [ ] **Paved Road** templates published (Spring Boot starter, Node template).
- [ ] **Service Catalog** (Backstage) — discoverable list of services + owners.
- [ ] **ADR (Architecture Decision Records)** — decisions documented + version-controlled.
- [ ] **Inner Source**: teams contribute improvements to shared platform.
- [ ] **Postmortem library** searchable.
- [ ] **Capacity planning + cost** review monthly.
- [ ] **Tech radar**: tracked + deprecation timeline for outdated tech.

## Khi nào NÊN dừng adding microservice?

3 questions:
1. Đã có **clear business capability boundary** chưa? Hay đang cắt arbitrary?
2. Team có capacity own end-to-end (dev + ops + on-call)?
3. Có **independence value** (deploy độc lập có lợi nào không)?

Nếu 1 trong 3 = no → đừng tạo service mới. Extend existing or modular monolith.

## Real-world case studies recap

- **Amazon API mandate** (2002): forced services-only communication, foundation cho AWS.
- **Netflix migration** (2008-2016): từ DC monolith → AWS microservices sau Christmas outage.
- **Spotify** Squad/Tribe/Chapter model.
- **Uber Domain Oriented Microservices Architecture** (DOMA): 2200 services, simplification effort.
- **Monzo** (UK bank): 1500+ services trên k8s, full async EDA.

Patterns chung của successful adopters:
- **Strong platform team**.
- **Cultural readiness** (DevOps, blameless postmortem).
- **Incremental migration**, không big-bang.
- **Observability first**, không afterthought.
- **EDA for resilience**, không everywhere.

## Cuối cùng — when NOT microservices

Ironic mục cuối: microservices không phải đáp án cho mọi team.

| Stay monolith if | Reason |
|---|---|
| Team < 10 dev | Microservices overhead > benefit |
| Product still finding fit | Refactor fast in monolith, lock-in less |
| No platform team | Can't operate distributed system safely |
| Workload simple CRUD | No scaling pain to solve |
| No clear domain boundaries | Premature decomposition = wrong cuts |

**Modular monolith** (well-bounded modules trong 1 deployable) thường là right answer cho 60% systems.

Microservices = tool. Pick when problem matches.

## Tóm tắt phase 8 + toàn course

- Bạn đã đi qua **8 phase**: từ định nghĩa đến deployment K8s.
- Production checklist **9 dimensions**: boundaries, data, communication, resilience, testing, observability, deployment, security, operations.
- Microservices = trade-off. Lợi: independent scale, autonomy, polyglot. Hại: distributed complexity, eventual consistency, ops cost.
- EDA = match made in heaven với microservices vì shared principle (**loose coupling**).
- Patterns thực dụng: **Strangler Fig** (migration), **DB per service** (data), **Outbox** (atomic publish), **Saga** (distributed tx), **CQRS** (read/write split), **Event Sourcing** (audit), **Contract test** (decouple test), **3 pillars observability** (debug), **Container + K8s** (deployment).
- Anti-patterns lặp đi lặp lại: distributed monolith, nano-services, shared lib coupling, big-bang migration, alert fatigue.
- **Modular monolith** > microservices cho team nhỏ. Pick wisely.
- Maturity journey: L1 (crawl) → L5 (optimize). Most companies ở L2-L3. L4+ = platform team investment.

🎓 Course end. Chúc deploy success.
