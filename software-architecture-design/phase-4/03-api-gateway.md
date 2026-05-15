# Bài 3: API Gateway

## Vấn đề khi chuyển sang Microservices

Trước: 1 monolithic service → 1 API
Sau: N microservices → N APIs

**Hệ quả:**
- Client code phải biết internal architecture
- Mỗi request cần gọi nhiều services
- Mỗi service phải tự implement authentication/security
- Code duplicated across services

```
Client (browser/mobile)
    ├── GET /frontend → Frontend Service
    ├── GET /video/123 → Video Service
    └── GET /comments/123 → Comments Service
```

→ Client tightly coupled với internal implementation.

## API Gateway là gì?

> **API Gateway** = Service management service nằm giữa client và collection of backend services, compose các APIs vào một single API.

```
Client ──────────> API Gateway ──────────> Frontend Service
                       │         ──────────> Video Service
                       │         ──────────> Comments Service
                       │         ──────────> User Service
```

Pattern này gọi là **API Composition**: compose nhiều internal APIs thành một external API.

## Lợi ích của API Gateway

### 1. Abstraction - Decoupling Client từ Backend

Internal changes hoàn toàn transparent với client:

```
TRƯỚC:                    SAU (sau khi refactor):
Frontend Service     →    Frontend Mobile Service
                          Frontend Desktop Service
Video Service        →    Video HD Service (desktop)
                          Video SD Service (mobile)

Client code: KHÔNG CẦN THAY ĐỔI (chỉ cần thay đổi API Gateway routing)
```

### 2. Security Centralized

```
Client request → API Gateway:
    ├── SSL termination (decrypt HTTPS)
    ├── Authentication (verify JWT/token)
    ├── Authorization (check permissions)
    ├── Rate limiting (block DDoS)
    └── Forward decrypted request to services
```

Không cần implement auth ở mỗi service riêng lẻ.

### 3. Performance - Request Aggregation

```
KHÔNG CÓ API GATEWAY:              CÓ API GATEWAY:
Client → Frontend Service          Client → API Gateway
Client → Video Service                         │
Client → Comments Service          API Gateway ──> Frontend + Video + Comments
3 round trips                      1 round trip, aggregate responses
```

### 4. Caching

Một số responses có thể cache tại API Gateway:
```
GET /movies/popular → Cached for 5 minutes
→ Không cần request đến backend mỗi lần
```

### 5. Monitoring & Observability

Tất cả traffic qua một điểm → dễ monitor:
- Traffic patterns
- Error rates
- Latency distribution
- Alert khi traffic spike/drop

### 6. Protocol Translation

```
External (REST/JSON) → API Gateway → Internal (gRPC/Protobuf)
                                   → Legacy (HTTP1/XML)
                                   → Partner (SOAP)
```

## Anti-Patterns cần tránh

### 1. Business Logic trong API Gateway

❌ API Gateway làm business decisions → lại trở thành monolith
✅ API Gateway chỉ routing, auth, caching — không chứa business logic

### 2. Single Point of Failure

❌ Chỉ deploy 1 API Gateway instance
✅ Deploy multiple instances + Load Balancer

```
Client → Load Balancer → [API GW 1]
                       → [API GW 2]  → Backend Services
                       → [API GW 3]
```

### 3. Bypass API Gateway

❌ Cho phép external clients gọi trực tiếp vào individual services
✅ Tất cả external traffic phải qua API Gateway

Vì sao? Nếu service team thay đổi API:
- **Có API GW**: Chỉ update routing trong API GW
- **Không có API GW**: Phải update tất cả external clients → slow, risky

## API Gateway trong Production

```
Internet
    ↓
Load Balancer
    ↓
API Gateway Cluster (x3 instances)
    ├── Auth: JWT validation
    ├── Rate limiting: 1000 req/min per user
    ├── Routing: /users → User Service
    │           /products → Product Service
    │           /orders → Order Service
    └── Monitoring: Prometheus metrics

Backend Services (internal)
```

## Popular API Gateways

| Solution | Type |
|----------|------|
| **Kong** | Open source, self-hosted |
| **AWS API Gateway** | Managed cloud service |
| **nginx** | Also used as API GW |
| **Traefik** | Cloud-native, Kubernetes |
| **Apigee** | Enterprise (Google) |

## Tóm tắt

```
API Gateway = Front door của hệ thống

Chức năng chính:
├── API Composition: compose N APIs → 1 API
├── Security: auth, SSL termination, rate limiting
├── Performance: caching, request aggregation
├── Monitoring: traffic visibility
└── Protocol translation

Anti-patterns:
├── ❌ Business logic trong GW → monolith
├── ❌ Single instance → SPOF
└── ❌ Bypass GW → tight coupling
```

---
**Tiếp theo:** Bài 4 - CDN (Content Delivery Network) →
