# Bài 4: Microservices — kiến trúc cho scale lớn

Container thuần technical. **Microservices** = architecture pattern thường đi kèm. Bài này giải thích "why" trước khi build.

## Monolith — kiến trúc kinh điển

Một app duy nhất chứa **mọi feature**:

```text
+──────────────────────────+
│  Single Application      │
│  - Login                 │
│  - User profile          │
│  - Cart                  │
│  - Checkout              │
│  - Email                 │
│  - Notification          │
│  - Analytics             │
│  - Admin                 │
+──────────────────────────+
│  Single Database         │
+──────────────────────────+
```

vProfile (phase 8) = monolith — 1 .war chứa hết.

### Pros monolith

- Đơn giản — 1 codebase, 1 deploy.
- Transaction ACID dễ.
- Performance tốt — function call thay network call.
- Debug dễ — stack trace cùng process.

### Cons monolith ở scale lớn

- **Codebase phình** → khó maintain (1M dòng code).
- **Deploy chậm** — đổi 1 dòng cũng phải build + deploy toàn app.
- **Coupling tight** — đổi module A ảnh hưởng module B.
- **Scale không độc lập** — Cart busy phải scale cả app.
- **Tech stack đơn** — không thể mix Java + Python + Go cho từng phần.
- **Team conflict** — 100 dev đẩy chung 1 main branch.

## Microservices — chia nhỏ

```text
+────────+ +─────────+ +─────────+ +───────────+ +──────────+
│ Login  │ │ Profile │ │ Cart    │ │ Checkout  │ │ Email    │
│ svc    │ │ svc     │ │ svc     │ │ svc       │ │ svc      │
+────────+ +─────────+ +─────────+ +───────────+ +──────────+
    │          │          │            │              │
    ▼          ▼          ▼            ▼              ▼
   DB1        DB2        DB3          DB4           Queue
```

Mỗi service:
- Codebase riêng (repo riêng).
- DB riêng (không share DB).
- Deploy riêng.
- Scale riêng.
- Team riêng (Conway's law).
- Tech stack riêng.

Giao tiếp qua **API HTTP/gRPC** hoặc **message queue**.

## Vì sao đi với container?

Container = đơn vị deploy tốt nhất cho microservice:
- Mỗi service = 1 image.
- Mỗi instance = 1 container.
- Kubernetes scale + manage hàng nghìn container.

Không có container, deploy 100 microservice trên VM → vận hành kinh hoàng.

## So sánh

| | Monolith | Microservices |
|---|---|---|
| Codebase | 1 | Nhiều (10-100) |
| Database | 1 share | Mỗi service 1 DB |
| Deploy | All-or-nothing | Independent |
| Scale | Toàn app | Per service |
| Tech stack | Đồng nhất | Đa dạng |
| Team | Tighten | Autonomous |
| Network call | In-process | HTTP/gRPC (overhead) |
| Transaction | ACID dễ | Eventual consistency |
| Debug | Stack trace 1 process | Distributed trace cần |
| Initial setup | Đơn giản | Phức tạp |
| Operational complexity | Thấp | **Cao** |

## Khi nào dùng microservices?

✓ **Nên** khi:
- Team > 30 dev.
- Codebase > 500K LOC.
- Workload heterogeneous (vd analytics khác chat).
- Cần scale per-feature.
- Multiple tech stacks cần thiết.

✗ **Không nên** khi:
- Team < 10 dev — overhead vượt lợi ích.
- App đơn giản, traffic thấp.
- Chưa có CI/CD, observability mạnh.
- "Tiêu chuẩn ngành" không nên là lý do.

> "Don't start with microservices. **Start with monolith, extract services when monolith pain points appear**." — Martin Fowler.

vProfile project trong khoá này = monolith. Section sau ta sẽ refactor 1 phần thành service riêng (account service) để thấy practice.

## Patterns microservices

### 1. API Gateway

Single entry point, route đến service backend:

```text
Client → API Gateway → /users → User service
                     → /cart → Cart service
                     → /pay → Payment service
```

Tools: Kong, AWS API Gateway, Apigee.

### 2. Service Discovery

Service A cần biết "service B đang ở IP nào, port nào". Static config khó scale.

Tools: Consul, etcd, K8s built-in DNS.

### 3. Circuit Breaker

Service B down → service A đừng gọi nữa, fail fast:

```text
A → B   (B down → A fail liên tục)

Với circuit breaker:
A → B   → 5 lỗi liên tiếp → A "open circuit" → trả lỗi ngay 30s
                          → sau 30s thử lại
```

Tools: Hystrix (Netflix, deprecated), Resilience4j, Istio.

### 4. Saga pattern

Transaction phân tán không có ACID — chain compensating action:

```text
Order created → Payment charged → Stock reserved → Ship
                                                  ↓ fail
Compensating: Unship → Unreserve stock → Refund payment → Cancel order
```

### 5. CQRS + Event sourcing

Tách Command (write) vs Query (read). Event làm source of truth.

### 6. Sidecar pattern

Mỗi service kèm 1 container phụ (logger, proxy, security):

```text
Pod (K8s):
  ├── App container (logic)
  └── Sidecar (Envoy proxy / Fluentd logger)
```

Istio service mesh dùng pattern này.

## Communication

### Synchronous — REST/gRPC

```text
A → HTTP/2 → B → Response → A
```

Pros: simple, request-response như local call.
Cons: A đợi B → coupling, slow.

### Asynchronous — message queue

```text
A → publish event → Queue (RabbitMQ/Kafka)
                          ↓
                          B consume event
```

Pros: A và B không cần online cùng lúc, retry tự động.
Cons: eventual consistency, debug phức tạp.

## Distributed system challenges

Microservices = distributed system. **8 fallacies of distributed computing**:

1. The network is reliable. (Không)
2. Latency is zero. (Không)
3. Bandwidth is infinite. (Không)
4. The network is secure. (Không)
5. Topology doesn't change. (Có thay đổi)
6. There is one administrator. (Nhiều)
7. Transport cost is zero. (Có)
8. The network is homogeneous. (Không)

→ Mỗi microservice phải handle: timeout, retry, circuit break, idempotency, distributed trace, log correlation, ...

## Observability — 3 trụ cột

Monolith log 1 file dễ. Microservices log 50 file → khó. Cần:

| Trụ cột | Tool |
|---|---|
| **Metrics** | Prometheus + Grafana |
| **Logs** | ELK (Elasticsearch + Logstash + Kibana), Loki |
| **Traces** | Jaeger, Tempo, Zipkin |

Section 23 sẽ deep-dive.

## Khi monolith vs microservice trong startup

**Tuần 1 startup**: monolith trên 1 EC2.

**Tháng 6, 1k user**: vẫn monolith.

**Năm 2, 1M user**:
- Bottleneck cụ thể → extract service.
- Search slow → tách `search-service`.
- Payment cần PCI compliance → tách `payment-service` isolation.

→ **Strangler pattern**: từ từ extract service từ monolith, không rewrite all-at-once.

## Anti-patterns

| Anti-pattern | Mô tả |
|---|---|
| Distributed monolith | Microservices nhưng deploy cùng nhau, share DB → vô nghĩa |
| Nano services | Quá nhỏ (mỗi function 1 service) → overhead khủng |
| Shared database | 2 service viết cùng table → coupling ngầm |
| Synchronous chain | A → B → C → D → E (E chậm = cả chain chậm) |
| No versioning | Đổi API B → 5 service caller broken |
| Missing observability | Đoán mò khi prod fail |

## Real-world examples

| Company | Service count | Note |
|---|---|---|
| Netflix | 1000+ | Pioneer, từ AWS migration |
| Uber | 2000+ | Đã chuyển 1 phần về macroservice (vừa) |
| Amazon | 1000+ | "Two-pizza team" rule |
| Spotify | 100s | Squad model |
| Shopify | Modular monolith | Vẫn monolith với module isolated |

Note: Shopify chứng minh **monolith không lỗi thời** — dùng modular monolith với code boundary rõ + tooling tốt.

## vProfile → microservices roadmap (hypothetical)

```text
Hiện tại (phase 8): Monolith
+──────────────────+
│ vProfile .war    │
│  - Login         │
│  - Profile       │
│  - Account       │
└──────────────────┘
       │
       ▼ DB

Refactor 1: Extract Account service
+──────────+   +──────────+
│ vProfile │   │ Account  │
│  - Login │←→│  service │
│  - Prof  │   +──────────+
└──────────┘        │
     │              ▼
     ▼          accountDB
   userDB

Refactor 2: Extract Login → Identity service
+──────────────+
│ Identity svc │ JWT issue
+──────────────+
       ▲
       │
+──────────┐   +──────────+
│ vProfile │   │ Account  │
│ (UI)     │   │ svc      │
+──────────+   +──────────+
```

Trong khoá này skip refactor — vProfile giữ nguyên monolith cho đơn giản.

## Tổng kết phase 10

4 bài đã cover:
1. Container là gì, khác VM.
2. Docker architecture, lệnh cơ bản.
3. Hands-on lab (10 lab progressive).
4. Microservices — pattern, trade-off.

Sẵn sàng cho phase 27-28 (Docker deep), 29-30 (Kubernetes).

## Bẫy thường gặp với microservices

| Bẫy | Hậu quả | Giải pháp |
|---|---|---|
| Microservice "vì xu hướng" | Overhead khủng, dev khóc | Bắt đầu monolith, extract khi cần |
| Share DB | Coupling ngầm | Mỗi service DB riêng |
| No service contract | Đổi API = 10 caller broken | OpenAPI spec, versioning |
| Sync chain dài | Latency tăng N lần | Async queue cho non-critical |
| Quên distributed trace | Debug = tra tay | Jaeger từ ngày 1 |
| Mỗi team chọn tech lạ | Vận hành chaos | Standard set tech, exception phải approve |

## Tóm tắt bài 4

- **Microservices** = tách monolith thành nhiều service nhỏ, deploy/scale độc lập.
- Trade-off: linh hoạt + scale ↔ complexity vận hành cao.
- **Không nên** start microservice — bắt đầu monolith, extract khi pain point.
- Cần **CI/CD + observability + service mesh** mature trước khi đi sâu.
- Container + Kubernetes là enabler chính.
- 8 fallacies of distributed computing → phải handle ở app level.
- 3 trụ cột observability: metrics, logs, traces.

**Phase kế tiếp** → [Phase 11 — Bài 1: Bash scripting introduction](../phase-11-bash-scripting/01-bash-intro.md)
