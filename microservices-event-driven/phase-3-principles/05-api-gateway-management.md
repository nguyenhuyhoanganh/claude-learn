# Bài 5: API Gateway — cổng vào duy nhất cho microservices

100 microservice = 100 endpoint khác nhau? Client nào tracking nổi? Auth + rate limit + TLS — implement 100 lần?

**API Gateway** là pattern bắt buộc cho production microservices. Bài này phân tích sâu vấn đề nó giải, các tính năng thiết yếu, và phân biệt rõ với load balancer (confusion phổ biến).

## Setup case study — Health & Fitness company

Acme Health cung cấp digital service:

```text
Clients (external):
- Smartwatches (Apple Watch, Fitbit, Garmin)
- Mobile apps (iOS, Android, React Native)
- Wearable accessories
- Web browsers (clinic portal)
- Partner servers (hospital, gym chains)
- Developers (3rd-party API users)

Microservices (internal):
~150 services
- WorkoutTracking
- HealthMetrics
- UserProfile
- ActivityFeed
- Subscription
- DoctorPortal
- ... (140 khác)
```

Phiên bản naive: client gọi thẳng từng microservice.

```text
Mobile app code:
const workouts = await fetch("https://workout.acme.com/v2/list");
const metrics = await fetch("https://metrics.acme.com/today");
const profile = await fetch("https://profile.acme.com/me");
const feed = await fetch("https://feed.acme.com/activity");
// ... 10+ calls cho 1 dashboard
```

Trông OK. Cho đến khi...

## 5 vấn đề của naive approach

### Vấn đề 1: Tight coupling client ↔ internal architecture

Hard-code endpoint trong:
- iOS app (cần resubmit App Store).
- Android app (cần resubmit Play Store).
- 50 partner clinic SDK.

Internal refactor: tách `Workout` thành `WorkoutTracking` + `WorkoutAnalytics`:

```text
Trước:
  https://workout.acme.com/v2/list           → WorkoutService

Sau:
  https://workout-tracking.acme.com/v2/list  → WorkoutTracking
  https://workout-analytics.acme.com/v2/insights → WorkoutAnalytics
```

→ **Mọi client phải update + redistribute**. Mất quyền refactor.

### Vấn đề 2: API differences cho từng loại customer

Cùng 1 service (Subscription) phải expose:

| Customer type | API style | Format |
|---|---|---|
| Free tier mobile | REST limited | JSON minimal |
| Premium mobile | REST full | JSON detailed |
| Partner old-fashion clinic | SOAP (yes still) | XML |
| Partner modern hospital | gRPC | Protobuf |
| 3rd-party developer | GraphQL | JSON |

Implement 5 endpoint trong cùng service code → spaghetti.

### Vấn đề 3: Monitoring + tracking khó

Dashboard mobile làm 10 API call song song. User report "dashboard chậm".

- Không biết call nào chậm.
- Không biết user nào gọi nhiều.
- Không có centralized log of incoming traffic.

→ Debug ngày như đêm.

### Vấn đề 4: Boilerplate code lặp lại

Mỗi microservice phải tự implement:
- **Authentication**: parse JWT, validate signature.
- **Authorization**: check user role/permission.
- **Rate limiting**: throttle abuse.
- **TLS termination**: cert handling.
- **CORS**: header config.
- **Request logging**.

× 150 service = 150 lần implement. Bug fix 1 chỗ → 150 chỗ chưa fix.

### Vấn đề 5: Client phải biết toàn bộ topology

Mobile dev cần biết: "Workout data ở `workout.acme.com`, profile ở `profile.acme.com`, subscription ở `billing.acme.com`...". 

Internal topology leak ra client = **anti-pattern nghiêm trọng**.

## Solution: API Gateway pattern

> **API Gateway** = component đặt ở **entry point** của hệ thống, chịu trách nhiệm **toàn bộ API management** giữa external clients và internal microservices.

```text
External clients                       Internal microservices
+──────────────+
│ Mobile app   │ ─┐
+──────────────+  │
+──────────────+  │     +────────────+      ┌──► WorkoutService
│ Smart watch  │ ─┼──►  │ API Gateway│ ─────┼──► MetricsService
+──────────────+  │     │            │      ├──► ProfileService
+──────────────+  │     +────────────+      ├──► FeedService
│ Partner srv  │ ─┘                         └──► (140 service khác)
+──────────────+
```

**Single entry point** cho mọi client. Internal services không exposed ra ngoài.

## Tính năng API Gateway

### 1. Request routing

```text
GET /api/v1/workouts/list      → WorkoutTracking service
GET /api/v1/workouts/insights  → WorkoutAnalytics service
GET /api/v1/profile/me         → UserProfile service
POST /api/v1/subscription/upgrade → Subscription service
```

Client thấy 1 URL `api.acme.com`. Gateway routing internal.

Internal refactor (chia 1 service thành 2) = **chỉ update routing rule ở gateway**. Client không biết, không phải đụng.

```yaml
# Example: Kong / Envoy routing config
routes:
  - path: /api/v1/workouts/list
    backend: workout-tracking-svc:8080
  - path: /api/v1/workouts/insights
    backend: workout-analytics-svc:8080
```

### 2. Protocol + format translation

Client gọi REST/JSON. Internal service prefer gRPC/Protobuf:

```text
Client request: GET /api/v1/profile/me  (REST JSON)
                ↓
            API Gateway
                ↓ translate
            gRPC call: ProfileService.GetMe()  (Protobuf)
                ↓
            ProfileService
                ↓ Protobuf response
            API Gateway
                ↓ translate to JSON
Client response: {"id": 1, "name": "..."}
```

Mỗi microservice dùng **1 canonical protocol nội bộ** (gRPC). Gateway adapt cho client.

→ Service code **clean** — không phải implement 5 protocol.

### 3. Authentication + authorization (centralized)

```text
Client: POST /api/v1/workouts
Headers: Authorization: Bearer eyJhbGc...

API Gateway:
  1. Verify JWT signature.
  2. Check token expiry.
  3. Extract user_id + roles.
  4. Check if user has permission "workout:write".
  
  If pass → inject header X-User-Id: 123 → forward to WorkoutService.
  If fail → return 401/403 immediately.

WorkoutService:
  Trust X-User-Id header (gateway đã validate). No JWT logic needed.
```

Auth code = **1 chỗ duy nhất**. Service downstream chỉ làm business logic.

### 4. Rate limiting + throttling

```yaml
# Per-client throttle
clients:
  - api_key: free_tier_*
    rate_limit: 100 req/hour
  - api_key: premium_*
    rate_limit: 10000 req/hour
  - api_key: partner_hospital_*
    rate_limit: 1000 req/min
```

Partner abuse → gateway throttle trước khi tới microservice. Downstream được bảo vệ.

### 5. TLS termination

```text
Client ──HTTPS──► API Gateway ──HTTP (or mTLS)──► Microservice
                  (cert + TLS handshake)        (internal network)
```

TLS cert quản ở gateway only. Service downstream:
- Không phải store cert.
- Không phải lo TLS handshake CPU cost.
- Không phải renew cert.

Renew cert (3 tháng/lần Let's Encrypt) = update 1 chỗ.

### 6. Request fan-out + response aggregation

Pattern xịn nhất:

```text
Client: GET /api/v1/dashboard
              ↓
        API Gateway: fan-out
        ├──► WorkoutService.list() (parallel)
        ├──► MetricsService.today() (parallel)
        ├──► ProfileService.me() (parallel)
        └──► FeedService.recent() (parallel)
              ↓
        Aggregate response:
        {
          "workouts": [...],
          "metrics": {...},
          "profile": {...},
          "feed": [...]
        }
              ↓
        Single response to client
```

Lợi:
- **Client làm 1 request thay 4** → mobile battery + latency tốt.
- **Internal refactor transparent** — gateway hide structure.
- **Parallel internal calls** — total latency = max(t1,t2,t3,t4) thay vì sum.

Pattern này còn gọi là **Backend-For-Frontend (BFF)** khi gateway riêng cho từng loại client (mobile BFF, web BFF, partner BFF).

### 7. Monitoring + observability

Tất cả traffic qua gateway → centralized:

- **Metrics**: req/sec, latency p50/p95/p99 per endpoint.
- **Logs**: structured access log với client ID, user ID, path, status.
- **Tracing**: gateway generate trace ID → propagate downstream → distributed trace.
- **Alerting**: 5xx rate vượt threshold → page oncall.

### 8. API versioning

```text
/api/v1/workouts → WorkoutService v1 (legacy clients)
/api/v2/workouts → WorkoutService v2 (modern clients)

Gateway route theo prefix → 2 version cùng tồn tại.
```

Migrate version dần → kill v1 khi clients đã upgrade.

## Implementation choices

| Tool | Loại | Strength |
|---|---|---|
| **Kong** | Open source + enterprise | Plugin ecosystem mạnh, Lua extensible |
| **AWS API Gateway** | Managed | Native AWS integration, serverless friendly |
| **Azure API Management** | Managed | Microsoft ecosystem |
| **Google Cloud API Gateway** | Managed | GCP integration |
| **Apigee** | Managed (Google) | Enterprise grade, mature |
| **NGINX / NGINX Plus** | Reverse proxy + plugins | Battle-tested, simple |
| **Envoy** | Proxy + extensions | Used by Istio service mesh, modern |
| **Spring Cloud Gateway** | JVM library | Java-native, good Spring fit |
| **KrakenD** | Go-based | High perf, declarative config |
| **Tyk** | Open source | GraphQL gateway features |

Chọn theo: cloud you're on, language stack, throughput needed.

## API Gateway vs Load Balancer — confusion phổ biến

| Aspect | Load Balancer | API Gateway |
|---|---|---|
| **Purpose** | Distribute traffic across **identical instances** | Route requests to **different services** |
| **Layer** | L4 (TCP) or L7 (HTTP) | L7 (HTTP/gRPC) |
| **Routing decision** | Pick healthy instance of **same** service | Pick **which** service handles request |
| **Algorithms** | Round-robin, least conn, IP hash | Path/header-based routing rules |
| **TLS termination** | Optional | Almost always |
| **Auth handling** | No | Yes — first-class concern |
| **Throttling** | Basic | Advanced (per client, tier, endpoint) |
| **Protocol transform** | No | Yes (REST ↔ gRPC, JSON ↔ XML) |
| **Performance overhead** | Minimal (designed for) | Higher (more features) |
| **Health check backends** | Yes | Optional |
| **Public-facing** | Maybe | Yes |

Cả 2 dùng **chung trong microservices**:

```text
Internet ──► API Gateway ──► Service-A LB ──► instance-1
                            │                ├──► instance-2
                            │                └──► instance-3
                            ├──► Service-B LB ──► ...
                            └──► Service-C LB ──► ...
```

Gateway routes to which service. LB picks which instance of that service.

Trong **Kubernetes**, LB là `Service` resource (kube-proxy), gateway là `Ingress` hoặc dedicated tool (Istio, Kong).

## Backend-For-Frontend (BFF) — variation

Pattern mở rộng: **1 gateway riêng cho mỗi loại client**.

```text
Mobile clients ──► Mobile BFF ──┐
                                ├──► Internal microservices
Web clients ──► Web BFF ────────┤
                                │
Partner APIs ──► Partner BFF ───┘
```

Lý do tách:
- **Mobile BFF**: aggregate aggressive (giảm round-trips), compact payload, push notification handling.
- **Web BFF**: cookie session, CSRF protection, server-side render.
- **Partner BFF**: SOAP/XML support, contract API, rate limit theo billing.

Mỗi BFF tune cho 1 client type → UX tốt hơn 1 generic gateway.

Spotify, Netflix, SoundCloud dùng BFF heavily.

## Anti-pattern: Gateway thành "smart endpoint"

API Gateway **routing + cross-cutting concern**, KHÔNG **business logic**.

❌ Sai:
```text
Gateway code:
  if (request.path == "/order"):
    if (user.balance < order.total):
      return "insufficient funds"
    // ... business validation
```

Business logic ở gateway = mini-monolith. Mọi team đụng vào gateway → contention.

✓ Đúng:
```text
Gateway: route, auth, rate-limit, transform.
OrderService: validate, persist, publish event.
```

Mantra: **"Smart endpoints, dumb pipes"** (Martin Fowler).

## Anti-pattern: Single global gateway

Tất cả company traffic qua 1 gateway = SPOF.

Fix:
- **Geo-distributed gateway** (AWS API Gateway Edge, CloudFront).
- **Multiple gateway tiers** (BFF approach).
- **High availability** (multi-AZ, multi-region).

## Performance considerations

Gateway thêm hop = latency overhead. Đo lường:

| Setup | Latency added |
|---|---|
| Direct client → service | 0 ms |
| Through reverse proxy (NGINX) | ~0.5-2 ms |
| Through full API gateway (Kong) | ~2-5 ms |
| Cross-region gateway | + 30-100 ms |

Caching ở gateway giúp:

```yaml
cache:
  - path: /api/v1/products/*
    ttl: 60s
```

Cache hit = không tới microservice → latency giảm, throughput tăng.

## Tóm tắt bài 5

- **API Gateway** = entry point duy nhất cho external clients vào microservice system.
- Giải 5 vấn đề: **tight coupling client-internal**, **API diversity**, **monitoring khó**, **boilerplate code lặp**, **topology leak**.
- 8 tính năng chính: **routing**, **protocol/format translation**, **auth**, **rate limiting**, **TLS termination**, **fan-out + aggregation**, **monitoring**, **versioning**.
- **Backend-For-Frontend** = 1 gateway / client type khi BFF cần optimization riêng.
- **Gateway ≠ Load Balancer**: gateway chọn service, LB chọn instance — 2 tool dùng chung.
- Anti-pattern: nhồi business logic vào gateway → "smart endpoint" = mini-monolith.
- Tools: **Kong**, **AWS API Gateway**, **Envoy**, **Apigee**, **NGINX**, **Spring Cloud Gateway**, etc.

**Bài kế tiếp** → [Phase 4 — Bài 1: Event-Driven Architecture là gì](../phase-4-event-driven/01-eda-la-gi.md)
