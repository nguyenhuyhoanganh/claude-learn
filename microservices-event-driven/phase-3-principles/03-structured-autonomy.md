# Bài 3: Structured Autonomy — cân bằng tự do và chuẩn cho team

Microservices marketing thường nói: "mỗi team chọn tech stack riêng, tự do hoàn toàn". Sai. Tự do 100% = chaos. Bài này dạy **structured autonomy** — pattern thực tế của Netflix, Uber, Spotify để vẫn nhanh nhưng không loạn.

## Cám dỗ: "mỗi team tự do hoàn toàn"

Lý thuyết:
- Frontend team chọn React, backend Node.js.
- Search team chọn Rust + Elasticsearch.
- ML team chọn Python + Postgres + Ray.
- Order team chọn Java Spring + MySQL.
- Newer team chọn Bun + Postgres 16 + Drizzle ORM (hottest stack).

Mỗi team happy với stack mình thích. Free will = max productivity?

**Sự thật**: max chaos.

## 4 vấn đề khi tự do 100%

### 1. Infrastructure cost cấp số nhân

Setup infrastructure cho 1 service không trivial:
- CI/CD pipeline.
- Build tool (Maven/Gradle/npm/cargo).
- Test framework + harness.
- Monitoring agent.
- Logging format + aggregation.
- Tracing instrumentation.
- Container image base.
- K8s deployment template.
- Secret management.
- Database backup script.

= **vài tuần work** + maintenance ongoing.

Bây giờ × 50 service với 10 stack khác nhau. DevOps/SRE team ngập trong "jungle of technologies".

### 2. Learning curve không scale

Dev mới join Order team. Tutorial Java + Spring + MySQL. OK.

Tuần sau cần fix bug ở Inventory service (Go + MongoDB). Tutorial lại.

Tuần sau nữa cần touch Notification service (Python + Postgres + Celery). Tutorial lại.

→ Mỗi dev phải biết 5 stack để effective. **Onboarding 6 tháng → 2 năm**.

Test cross-service cũng vậy: viết E2E test cho Order flow → 5 service, 5 cách run local.

### 3. Non-uniform API

Mỗi team thiết kế API theo style mình thích:

```text
Service A (Java team):
  GET  /users?id=123
  POST /users (body: JSON snake_case)
  Error response: { "errorCode": "USER_NOT_FOUND" }

Service B (Node team):
  GET  /api/v2/users/123
  POST /api/v2/user (body: JSON camelCase, singular)
  Error response: { "error": { "code": "404" } }

Service C (Go team):
  GET  /v1/users/{id}
  POST /v1/users (body: JSON camelCase)
  Error response: { "status": "error", "message": "..." }
```

Frontend dev integrate 5 service → 5 style → mess.

Cross-service integration: dev phải đọc doc 4 service khác để add 1 API call. Productivity giảm.

### 4. Security + compliance fragmentation

1 service nhận unsafe input → hack → cả company breach.
1 service violate GDPR → toàn org bị fine.

External party (regulator, customer) không care service nào fail — họ thấy company fail.

→ Security + compliance không thể team-by-team.

## Structured Autonomy — 3 tier framework

Pattern thành công: chia decisions thành **3 tier**:

```text
Tier 1: STANDARDIZED (company-wide, no team choice)
        ▲
        │
Tier 2: BOUNDED FREEDOM (chọn từ approved list)
        ▲
        │
Tier 3: FULL AUTONOMY (team quyết)
```

### Tier 1 — Standardized

Areas mọi team phải dùng chung. **Không có ngoại lệ**.

| Area | Standard |
|---|---|
| **Monitoring + alerting** | Prometheus + Grafana + PagerDuty |
| **Logging** | JSON structured + correlation ID + Loki/Splunk |
| **Tracing** | OpenTelemetry + Jaeger/Tempo |
| **CI/CD pipeline** | GitHub Actions / Jenkins (1 chuẩn) |
| **API style** | REST + OpenAPI + JSON snake_case (hoặc REST + gRPC mix theo guideline) |
| **API versioning** | URL path `/v1/`, semver |
| **Error format** | RFC 7807 Problem Details |
| **Auth** | OAuth2 + JWT, central IdP |
| **Security policies** | OWASP Top 10 checklist, SAST/DAST scan |
| **Data compliance** | GDPR retention + audit log |
| **Container base image** | Distroless or scoped Alpine |
| **K8s deployment template** | Helm chart hoặc Kustomize base |
| **Secret management** | Vault hoặc cloud KMS |

Investment ở Tier 1 amortize across 100s service. **ROI khổng lồ**.

Platform team build + maintain Tier 1. Service team chỉ "đứng trên platform".

### Tier 2 — Bounded Freedom

Choice within approved list:

| Area | Approved list |
|---|---|
| **Programming language** | Java, Go, Python (3 ngôn ngữ chính, không 10) |
| **Database (RDBMS)** | Postgres (default), MySQL (legacy) |
| **Database (NoSQL)** | MongoDB, DynamoDB, Redis |
| **Message broker** | Kafka (default), SQS+SNS |
| **Web framework** | Spring Boot (Java), Gin (Go), FastAPI (Python) |
| **ORM** | Hibernate, Drizzle, SQLAlchemy |
| **Test framework** | JUnit, Go testing, pytest |

Team chọn tool **trong list** cho project mình. Mỗi tool có:
- Doc internal.
- Sample template.
- DevOps support.

Tool ngoài list = phải go through **review + approval** (vài tuần). Cost cao đủ để team không random pick.

Lý do approval cao: nuôi tool mới = chi phí ops thực sự. Mỗi tool công ty support tốn ~2 FTE.

### Tier 3 — Full Autonomy

Team quyết hoàn toàn:

| Area | Team chọn |
|---|---|
| Release schedule | Khi naofeel ready |
| Release frequency | 10x/ngày hay 1x/tuần |
| Internal architecture | Hexagonal, DDD, MVC, ... |
| Local dev tooling | IDE, hot reload, mock server |
| Test strategy | TDD, BDD, ATDD |
| On-call rotation | Pattern team thoải mái |
| Sprint length | 1 tuần, 2 tuần, kanban |
| Code style | Within team's convention |

Đây là **true autonomy**. Mỗi team optimize cho mình.

## Factors influence boundary của 3 tier

Boundary không cố định — depend on:

### 1. DevOps/SRE team size + maturity

```text
Strong platform team (50+ engineers):
   Wide Tier 1 → Many things standardized
   Vd: K8s, service mesh, all observability tooling

Weak/small platform team:
   Narrow Tier 1
   Service teams have more responsibility (and pain)
```

Mạnh platform = service team productive hơn.

### 2. Engineer seniority

Senior team: muốn freedom → push Tier 1 hẹp.
Junior team: cần structure → benefit from wide Tier 1.

Mix → balanced.

### 3. Company culture

Some companies:
- **Single-language culture** (Google: heavy Java/Go/Python; Stripe: mostly Ruby/Go) — extreme Tier 1, narrow Tier 2.
- **Polyglot culture** (Netflix, Uber) — wide Tier 2.

Trade-off: single-language = easier hire + move people. Polyglot = right tool for job.

### 4. Scale

```text
< 50 dev: standardize everything (Tier 1 huge)
50-200 dev: structured autonomy practical
> 200 dev: must allow some Tier 2 freedom
```

Một số decision tree:

```text
Hỏi: Tool/decision này...
├── Có affect outside team (security, compliance, monitoring)?
│   └── YES → Tier 1
├── Có ops cost cao (DB engine, runtime)?
│   └── YES → Tier 2 (approved list)
└── Internal to team productivity?
    └── Tier 3
```

## Case study — Netflix's "Paved Road"

Netflix coined term **"Paved Road"**:

- **Paved**: Java + Spring Boot + Spinnaker (CD) + Atlas (metrics) + tracing standard.
- **Off-road**: Team có thể chọn khác (Go, Python, Node, ...).

Trade-off:
- **Paved road**: full platform support, easier hire, faster onboard.
- **Off-road**: team tự lo CI/CD, monitoring, scaling. DevOps không support.

→ Team rationally chọn Paved Road ~80% project. Off-road chỉ cho special need (ML inference Python, edge with Rust).

Đây là **economic pressure** thay vì hard rule. Team có quyền, nhưng pay cost.

## Anti-pattern: Heavy-handed standardization

Cảnh báo ngược chiều: standardize **quá tay** = team không có autonomy → not microservices, just monolith chia file.

Ví dụ tệ:
- "Mọi service phải dùng cùng version Spring Boot."
- "Mọi service phải release cùng schedule với platform release."
- "Mọi service code review phải qua architect committee."

= bottleneck centralization. Mất velocity → kill purpose microservices.

Cân bằng: standardize **what doesn't differentiate**, give freedom **on what does**.

## Anti-pattern: Tier 1 silent over-expansion

Platform team có xu hướng "tự nhiên" expand Tier 1: thêm "thoughtful default", "approved pattern".

Sau 2 năm, Tier 1 cover 90% decision → service team feels strangled.

Fix:
- Quarterly review: cái nào trong Tier 1 nên move xuống Tier 2/3?
- Encourage service team **opt-out** với justification.
- "Standardize less, support more" — make standard ngon đủ để team voluntarily adopt.

## Implementation — concrete artifacts

Để Structured Autonomy work, cần **artifacts cụ thể**:

### 1. Service Catalog

Wiki/Backstage có:
- List service + owner.
- Tech stack mỗi service.
- API contracts.
- Runbook.

```text
Service: order-service
Owner: @orders-team
Language: Java 17
Framework: Spring Boot 3.x
DB: Postgres 15
API: REST, OpenAPI at /docs
Repo: github.com/acme/order-service
On-call: PagerDuty rotation
SLO: 99.95%
```

### 2. Golden Path Template

Generator cho service mới:

```bash
acme-cli new-service order-service \
    --language java \
    --owner orders-team
```

Auto-generate:
- Repo with CI/CD template.
- Dockerfile + K8s manifest.
- Monitoring + logging config pre-wired.
- OpenAPI scaffold.
- Test framework setup.

→ Service team focus business logic, không reinvent infra.

### 3. ADR (Architecture Decision Record)

Mỗi major decision document:

```markdown
# ADR-042: Choose Kafka as default message broker

Status: Accepted (2024-03-15)

Context:
- Need event streaming + log
- 3 candidates: Kafka, Pulsar, RabbitMQ

Decision: Kafka

Consequences:
- Tier 2: approved for use
- Platform team provide managed Kafka cluster
- RabbitMQ deprecated for new project

Reviewers: @platform-team, @architecture-council
```

ADR public + searchable → new dev hiểu "why".

### 4. Inner Source

Standard tooling open inside company. Service team contribute back:
- Found bug in CI template → submit PR.
- Need feature in logging lib → PR.

Platform team không thành bottleneck.

## Real example — Spotify's "Squad / Tribe / Chapter"

Spotify framework:
- **Squad**: small autonomous team (5-9 people) own 1 service.
- **Tribe**: ~100 people working on related squads.
- **Chapter**: cross-squad guild (vd "Java Chapter") share best practice.

Chapter sharing → bottom-up standardization. Squad autonomy preserved.

Đây là implement của structured autonomy in org structure.

## Conway's Law revisit

> "Any organization that designs a system will produce a design whose structure is a copy of the organization's communication structure." — Melvin Conway, 1968.

Microservices boundary phản ánh team boundary. Team boundary phải reflect business + tech reality.

Structured autonomy = **shape team boundaries thoughtfully** để get microservices benefit.

## Tóm tắt bài 3

- Tự do 100% cho mỗi team = chaos: infra cost cấp số nhân, learning curve impossible, non-uniform API, security fragmentation.
- **Structured Autonomy** 3 tier: **Standardized** (mọi team), **Bounded Freedom** (chọn từ approved list), **Full Autonomy** (team quyết).
- Tier 1 áp dụng cho: observability, security, CI/CD, API style — invest 1 lần, amortize 100 service.
- Tier 2: language (3 chính), database (3-5 choice), broker (1-2 choice).
- Tier 3: release schedule, internal arch, dev workflow.
- **Paved Road** pattern (Netflix): platform support tốt → team voluntarily adopt standard.
- Artifacts cần: **service catalog**, **golden path template**, **ADR**, **inner source**.
- Cảnh báo cả 2 chiều: tự do quá → chaos; standardize quá → mất autonomy.

**Bài kế tiếp** → [Bài 4: Micro-frontends — chia frontend như chia backend](04-micro-frontends.md)
