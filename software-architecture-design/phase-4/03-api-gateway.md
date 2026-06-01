# Bài 3: API Gateway (Cổng API)

## Vấn đề khi chuyển sang Microservices

Khi chuyển từ kiến trúc monolithic sang microservices, ta có:

- **Trước**: 1 ứng dụng duy nhất → 1 API.
- **Sau**: N microservice → N API riêng biệt.

**Hệ quả phát sinh:**

- Code client phải biết về **cấu trúc bên trong** (internal architecture) — biết có service nào, ở đâu.
- Mỗi user action có thể cần client gọi **nhiều service** khác nhau.
- Mỗi service phải **tự cài đặt authentication / security** (xác thực, bảo mật).
- Code bị **trùng lặp (duplicated)** giữa các service (mỗi service đều có auth logic, logging, rate limiting riêng).

Ví dụ minh hoạ tình huống xấu:

```text
Client (browser/mobile)
    ├── GET /frontend → trực tiếp Frontend Service
    ├── GET /video/123 → trực tiếp Video Service
    └── GET /comments/123 → trực tiếp Comments Service
```

→ Client **gắn chặt (tightly coupled)** với cấu trúc bên trong. Nếu backend đổi (vd tách thêm 1 service), client phải update theo. Vi phạm nguyên tắc encapsulation đã học ở Phase 3.

## API Gateway là gì?

> **API Gateway** = Dịch vụ quản lý đứng **giữa client và tập hợp các backend service**, có nhiệm vụ **gộp (compose) nhiều API** thành **một API duy nhất** đối diện với client.

```text
Client  ──────────►  API Gateway  ──────────►  Frontend Service
                          │       ──────────►  Video Service
                          │       ──────────►  Comments Service
                          │       ──────────►  User Service
                          │       ──────────►  Payment Service
```

Pattern này được gọi là **API Composition**: ghép nhiều internal API thành **một external API duy nhất** mà client thấy.

Có thể hình dung API Gateway như **cánh cửa duy nhất** vào toà nhà — mọi khách phải đi qua đó để vào.

## 6 lợi ích của API Gateway

### Lợi ích 1: Abstraction — Decouple Client khỏi Backend

Mọi thay đổi nội bộ trở nên **hoàn toàn trong suốt (transparent)** với client:

```text
TRƯỚC khi refactor:        SAU khi refactor backend:
Frontend Service     →     Frontend Mobile Service (cho mobile)
                           Frontend Desktop Service (cho desktop)

Video Service        →     Video HD Service (desktop chất lượng cao)
                           Video SD Service (mobile chất lượng thấp)

Client code: KHÔNG CẦN THAY ĐỔI GÌ
   (chỉ cần update routing rules trong API Gateway)
```

→ Backend tự do tách, gộp, refactor mà không phải báo cho client. Đây là nguyên tắc encapsulation **ở tầm hệ thống**.

### Lợi ích 2: Security tập trung (Centralized Security)

Mọi vấn đề bảo mật được xử lý ở **một chỗ duy nhất** — API Gateway:

```text
Client request → API Gateway:
    ├── SSL termination (giải mã HTTPS)
    ├── Authentication (xác thực JWT/token)
    ├── Authorization (kiểm tra quyền)
    ├── Rate limiting (giới hạn tốc độ — chặn DDoS)
    ├── IP filtering (chặn IP đen)
    └── Forward request đã decrypt sang các service nội bộ (qua HTTP thường)
```

→ KHÔNG cần implement auth ở **từng service** riêng lẻ. Lợi ích kép:
- Đỡ tốn công sức (DRY).
- An toàn hơn — chỉ 1 chỗ chứa logic auth → ít nguy cơ implementation sai.
- Service nội bộ có thể giả định "ai gọi đến cũng đã được auth" → đơn giản hơn.

### Lợi ích 3: Performance — Request Aggregation (Gộp request)

```text
KHÔNG CÓ API GATEWAY:                   CÓ API GATEWAY:

Client → Frontend Service (round trip 1)    Client → API Gateway
Client → Video Service (round trip 2)               │
Client → Comments Service (round trip 3)            ↓
                                              API Gateway gọi song song:
                                                 → Frontend Service
                                                 → Video Service
                                                 → Comments Service
                                                 ↓ aggregate response
                                              Trả về Client (1 round trip)
```

→ Từ **3 round trip** xuống còn **1 round trip** từ phía client → tiết kiệm thời gian network (đặc biệt quan trọng cho mobile với 4G).

### Lợi ích 4: Caching (Bộ nhớ đệm)

Một số response có thể cache ngay tại API Gateway:

```text
GET /movies/popular  → API Gateway cache 5 phút
                     → Lần sau: trả thẳng từ cache, KHÔNG gọi backend
```

→ Giảm tải backend, tăng tốc độ phản hồi cho user.

### Lợi ích 5: Monitoring & Observability (Giám sát và quan sát)

Vì **mọi traffic** đều đi qua API Gateway, ta có 1 điểm tập trung để theo dõi:

- Traffic patterns (mẫu lưu lượng theo thời gian).
- Error rate per endpoint (tỷ lệ lỗi từng endpoint).
- Latency distribution (phân bố độ trễ).
- Alert khi traffic spike / drop bất thường.

→ Không cần đi gom log từ N service rời rạc — chỉ cần log của API Gateway.

### Lợi ích 6: Protocol Translation (Chuyển đổi giao thức)

API Gateway có thể "dịch" giữa các protocol khác nhau:

```text
External (REST/JSON) ──► API Gateway ──► Internal Service (gRPC/Protobuf)
                                      ──► Legacy Service (HTTP1/XML)
                                      ──► Partner Service (SOAP)
```

→ Client chỉ cần biết 1 protocol (REST). Backend tự do dùng protocol tối ưu cho từng service.

## 3 Anti-Patterns cần tránh

### Anti-pattern 1: Đặt Business Logic vào API Gateway

❌ **Sai**: API Gateway làm các quyết định nghiệp vụ (vd: "Nếu user là VIP thì giảm giá") → API Gateway dần trở thành... một monolith mới!

✅ **Đúng**: API Gateway **chỉ** làm routing, auth, caching, monitoring — KHÔNG chứa business logic.

Mọi quyết định nghiệp vụ phải nằm trong service tương ứng.

### Anti-pattern 2: Single Point of Failure

❌ **Sai**: Chỉ deploy 1 instance API Gateway → khi nó chết, toàn bộ hệ thống chết.

✅ **Đúng**: Deploy **nhiều instance** + đặt Load Balancer trước API Gateway:

```text
Client → Load Balancer → [API GW 1]
                       → [API GW 2]  → Backend Services
                       → [API GW 3]
```

API Gateway phải có dự phòng giống mọi component khác.

### Anti-pattern 3: Bypass API Gateway (cho phép đi vòng)

❌ **Sai**: Cho phép external client gọi **trực tiếp** vào service backend (vd: mobile app gọi thẳng User Service).

✅ **Đúng**: **Mọi external traffic phải đi qua API Gateway**, không có ngoại lệ.

Vì sao? Khi team Backend đổi API của 1 service:
- **Có API Gateway**: Chỉ cần update routing rule trong API Gateway → external client không bị ảnh hưởng.
- **Bypass API Gateway**: Phải update **tất cả external client** → chậm, rủi ro (có client cũ không update được).

Quy tắc: tất cả vào nhà bằng cửa chính.

## API Gateway trong Production điển hình

```text
Internet (Public)
    ↓
Load Balancer (cho chính API Gateway)
    ↓
API Gateway Cluster (3 instances cho HA)
    ├── Auth: validate JWT token
    ├── Rate limiting: 1000 req/phút per user
    ├── Routing rules:
    │      /users      → User Service
    │      /products   → Product Service  
    │      /orders     → Order Service
    │      /payments   → Payment Service
    └── Monitoring: gửi metric sang Prometheus

Backend Services (internal — không expose ra ngoài)
    ├── User Service
    ├── Product Service
    ├── Order Service
    └── Payment Service
```

## Các API Gateway phổ biến

| Solution | Loại |
|---|---|
| **Kong** | Open source, self-hosted, nhiều plugin |
| **AWS API Gateway** | Managed cloud service của AWS |
| **nginx** | Web server, có thể dùng như API Gateway |
| **Traefik** | Cloud-native, tích hợp tốt với Kubernetes |
| **Apigee** | Enterprise (do Google sở hữu) |
| **Azure API Management** | Managed service của Microsoft Azure |
| **Spring Cloud Gateway** | Java-based, phổ biến trong Spring ecosystem |

## Tóm tắt bài 3

```text
API Gateway = "Front door (cửa trước)" của hệ thống

Chức năng chính (6):
├── API Composition       — Gộp N internal API thành 1 external API
├── Security              — Auth, SSL termination, rate limiting
├── Performance           — Caching, request aggregation
├── Monitoring            — Traffic visibility tập trung
├── Protocol translation  — REST ↔ gRPC ↔ SOAP
└── Abstraction           — Decouple client khỏi backend changes

Anti-patterns cần tránh:
├── ❌ Business logic trong API Gateway → trở thành monolith
├── ❌ Single instance → SPOF
└── ❌ Cho bypass API Gateway → tight coupling với client
```

Bài tiếp theo về **CDN (Content Delivery Network)** — cách phân phối nội dung tĩnh đến user toàn cầu một cách hiệu quả.

---
**Bài kế tiếp**: [Bài 4 - CDN (Content Delivery Network)](04-cdn.md) →
