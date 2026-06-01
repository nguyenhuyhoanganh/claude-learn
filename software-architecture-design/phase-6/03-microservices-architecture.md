# Bài 3: Microservices Architecture (Kiến trúc microservices)

## Từ Monolith đến Microservices

Bài 2 kết thúc bằng các giới hạn của monolith. Khi nào thực sự đến lúc tách ra microservices?

**Triệu chứng cho thấy monolith không còn đủ:**

- Codebase quá lớn → IDE load mất vài chục giây, autocomplete chậm.
- Build và test toàn bộ ứng dụng mỗi khi thay đổi 1 dòng — 30 phút mỗi lần chạy CI.
- Merge conflict xảy ra liên tục khi nhiều developer làm song song.
- Không thể release tính năng A mà không phải deploy cả ứng dụng.
- Một component bị chậm (memory leak, slow query) → toàn bộ ứng dụng bị ảnh hưởng.
- Onboarding engineer mới mất nhiều tháng để hiểu codebase.

→ Đến lúc nghĩ về Microservices.

## Microservices là gì?

> **Microservices Architecture** = Tổ chức business logic thành một tập hợp các **service nhỏ, loosely coupled (gắn lỏng), được deploy độc lập**. Mỗi service được sở hữu bởi một team nhỏ và có **phạm vi trách nhiệm hẹp** (narrow scope of responsibility).

```text
Monolith — tất cả tính năng trong 1 codebase:
┌─────────────────────────────────────┐
│            Application              │
│  [Users] [Products] [Orders]        │
│  [Billing] [Search] [Notifications] │
└─────────────────────────────────────┘

Microservices — mỗi tính năng là 1 service riêng:
[User Service] [Product Service] [Order Service]
[Billing Svc]  [Search Service]  [Notification Svc]
(mỗi service: riêng codebase, riêng database, riêng deployment, riêng team)
```

## Lợi ích của Microservices

### 1. Tốc độ phát triển (Development Speed)

- Codebase mỗi service nhỏ → IDE load nhanh, build nhanh (vài giây thay vì vài chục phút).
- Chỉ cần test service của mình, không phải test cả ứng dụng.
- Engineer mới chỉ cần học 1 service để contribute → onboarding nhanh.

### 2. Performance & Scalability

- Mỗi instance nhỏ hơn → ít memory, ít CPU, GC nhanh hơn.
- **Scale từng service riêng theo nhu cầu cụ thể**:

```text
Search Service:        50 instances (read traffic cao)
Billing Service:        5 instances (volume thấp nhưng critical)
Notification Service:  10 instances (async worker)
Recommendation Service: 20 GPU instances (cần ML compute)
```

→ Không phải nhân toàn bộ ứng dụng lên — chỉ nhân phần cần nhân.

### 3. Organizational Scalability (Team Autonomy — đội nhóm độc lập)

Đây là lợi ích **lớn nhất** ở quy mô lớn:

```text
Team A sở hữu User Service:
├── Tự chọn tech stack (Go, Java, Python, ...)
├── Tự deploy theo lịch riêng (5 lần/ngày nếu muốn)
└── Tự chọn database (PostgreSQL, MongoDB, ...)

Team B sở hữu Order Service:
├── Không cần phối hợp lịch deploy với Team A
└── Không bị block bởi release của Team A
```

Đây là lý do Amazon, Netflix có thể có hàng nghìn engineer cùng phát triển — mỗi team độc lập như startup nhỏ.

### 4. Fault Isolation (Cô lập lỗi)

Một service crash → chỉ tính năng đó bị ảnh hưởng:

```text
Product Service down:
→ Search service bị degraded (kết quả không đầy đủ)
→ Checkout, User, Billing: vẫn hoạt động bình thường
→ Toàn bộ website vẫn online
```

So với monolith: 1 chỗ lỗi → toàn bộ ứng dụng crash.

### 5. Technology Freedom (Tự do về công nghệ)

Mỗi team chọn công cụ tốt nhất cho use case của họ:

- Service xử lý nhiều I/O → Node.js (event loop).
- Service cần concurrency cao → Go (goroutines).
- Service cần ML → Python (TensorFlow, PyTorch).
- Service financial / banking → Java (mature, type-safe).
- Service realtime → Rust / Elixir.

Trong monolith: cả team buộc dùng 1 ngôn ngữ.

## Best Practices quan trọng cho Microservices

### 1. Single Responsibility Principle (Trách nhiệm đơn lẻ)

Mỗi service đảm nhiệm **1 business domain / capability** rõ ràng.

```text
❌ Sai (Service ôm đồm nhiều domain):
UserAndOrderAndBillingService

✅ Đúng (Mỗi service tập trung 1 domain):
User Service    → quản lý profile, authentication
Order Service   → tạo đơn, fulfillment
Billing Service → payment, invoice
```

**Ví dụ: Ứng dụng Online Dating**

```text
User Profile Service   → quản lý profile (tên, ảnh, sở thích)
Image Service          → upload, resize, serve hình ảnh
Matching Service       → match user (phụ thuộc Profile Service)
Billing Service        → tính phí cho premium feature
```

**Ví dụ: E-Commerce — có thể chia theo 2 hướng:**

```text
Theo Action (hành động):
  Product Search Service  → xử lý query tìm kiếm
  Checkout Service        → cart, flow thanh toán
  Tax Calculator          → tính thuế

Theo Entity (đối tượng):
  Product Inventory Svc   → data sản phẩm, tồn kho
  Billing Service         → payment
  Shipping Service        → vận chuyển, tracking
```

Cách chia phụ thuộc vào domain — không có công thức cứng. Domain-Driven Design (DDD) là phương pháp luận giúp tìm ranh giới đúng.

### 2. Database per Service (Mỗi service có database riêng)

Đây là **quy tắc vàng** — vi phạm là tự huỷ microservices:

```text
❌ Shared database (cấm!):
[User Svc]   ─┐
[Order Svc]  ─┼─> [Shared DB]
[Billing Svc]─┘
                  Schema change → tất cả service bị ảnh hưởng!
                  Mỗi team phải coordinate với mọi team khác.
                  → không còn microservices nữa, chỉ là distributed monolith.

✅ Database per service:
[User Svc]    → [Users DB    (PostgreSQL)]
[Order Svc]   → [Orders DB   (MySQL)]
[Billing Svc] → [Billing DB  (PostgreSQL)]

→ Schema là implementation detail của mỗi service
→ Có thể thay đổi DB technology mà không ảnh hưởng service khác
→ Mỗi team độc lập về data
```

**Trade-off**: Data sẽ có duplication — vd: cả User Service và Order Service đều lưu user_id, có thể cả user_name. Điều này là **chấp nhận được và cần thiết**.

## Thách thức của Microservices

Microservices không phải miễn phí — nó mang theo độ phức tạp mới:

### 1. Distributed Systems Complexity (Phức tạp hệ thống phân tán)

- **Network failure** giữa các service xảy ra thường xuyên.
- **Latency cao hơn**: gọi network thay vì function call trong cùng process (microseconds → milliseconds).
- **Distributed tracing** khó hơn nhiều — 1 request đi qua 10 service, debug như thế nào?

→ Cần đầu tư công cụ: Jaeger, Zipkin, OpenTelemetry.

### 2. Service Discovery (Khám phá service)

Service A làm sao biết Service B đang chạy ở đâu (IP, port nào)? Đặc biệt khi instance liên tục được tạo/xoá.

Giải pháp:
- **Kubernetes Service Registry** (DNS + service mesh).
- **AWS Service Discovery**, **Consul**, **etcd**.

### 3. Inter-service Communication (Giao tiếp giữa service)

```text
Synchronous (REST / gRPC):
→ Coupling chặt hơn (caller chờ callee respond)
→ Response ngay lập tức
→ Tốt cho query data

Asynchronous (Message Broker — Kafka, RabbitMQ):
→ Loose coupling (caller publish event, callee tự xử lý)
→ Eventual consistency
→ Tốt cho fault tolerance, async workflow
```

### 4. Data Consistency (Tính nhất quán dữ liệu)

Không còn ACID global transaction (vì DB riêng biệt). Khi 1 business workflow đụng nhiều service:

- **Saga pattern**: chuỗi local transaction + compensation (rollback từng bước).
- **Event sourcing**: lưu mọi thay đổi dưới dạng event.
- **Eventual consistency**: chấp nhận data tạm thời không đồng bộ.

→ Cần thay đổi tư duy: không còn "ACID hoàn hảo", mà là "đảm bảo cuối cùng đúng".

### 5. Operational Overhead (Chi phí vận hành)

- Cần monitoring + alerting cho từng service.
- Cần CI/CD pipeline cho từng service.
- Cần on-call team xử lý service phụ trách.
- DevOps infrastructure cực kỳ phức tạp (Kubernetes, service mesh, ...).

## Khi nào migrate sang Microservices?

```text
✅ Nên migrate khi:
├── Team > 20-30 engineer (cần autonomy)
├── Codebase phức tạp, khó maintain (build cả tiếng)
├── Release cycles dài (do overhead phối hợp)
└── Các component cần scale khác nhau (vd: ML vs CRUD)

❌ Đừng migrate quá sớm:
├── Team nhỏ (overhead lớn hơn lợi ích)
├── Sản phẩm còn thay đổi nhanh (domain boundary chưa rõ)
├── Chưa hiểu rõ domain → service boundary sẽ chia sai
└── Chưa có DevOps team mạnh → vận hành quá tải
```

**Best approach (cách tiếp cận tốt nhất): Bắt đầu monolith → migrate khi đủ tín hiệu!**

Đây là cách Amazon, Netflix, Uber đều làm — không ai bắt đầu microservices từ ngày đầu.

## API Gateway và Microservices — kết hợp thường thấy

```text
Client (Browser / Mobile / Partner)
    │
    ▼
API Gateway (Phase 4 - Bài 3)
    │
    ├──► User Service
    ├──► Product Service
    ├──► Order Service
    └──► Billing Service

API Gateway xử lý:
├── Route request đến đúng service
├── Authentication (mỗi service không cần tự auth)
└── Aggregate response (giảm round trip cho client)
```

**Pattern Backend-for-Frontend (BFF)** — tách API Gateway theo loại client:

```text
Mobile Gateway     → Tối ưu cho mobile (response nén, ít data)
Desktop Gateway    → Full data, ảnh độ phân giải cao
Partner API GW     → External B2B API với rate limit + auth khác
```

## Anti-pattern: Distributed Monolith

Nguy hiểm nhất: **chia ra nhiều service nhưng tất cả vẫn tightly coupled** — gọi là "Distributed Monolith":

- Mọi service phải release đồng thời (vì phụ thuộc vào nhau).
- Service A đổi API → 10 service phải đổi theo.
- Database vẫn shared giữa các service.
- Coupling tăng vọt vì giờ phải gọi qua network thay vì function call.

→ **Tệ hơn cả monolith** — có hết complexity của distributed system mà không có lợi ích autonomy.

## Tóm tắt bài 3

```text
Microservices Architecture:
├── Collection of loosely coupled services
├── Mỗi service: team nhỏ, scope hẹp, deploy độc lập
└── Database per service (quy tắc bắt buộc)

Lợi ích:
├── Tốc độ phát triển (codebase nhỏ)
├── Scale từng service độc lập
├── Team autonomy + tự do tech stack
└── Fault isolation

Thách thức:
├── Distributed system complexity
├── Network latency, failure
├── Data consistency (không có global ACID)
├── Service discovery
└── Operational overhead lớn

Khi nào dùng: team lớn, domain phức tạp, product đã trưởng thành
Nguyên tắc: bắt đầu monolith → tách dần khi cần
Anti-pattern phải tránh: Distributed Monolith
```

---
**Bài kế tiếp**: [Bài 4 - Event-Driven Architecture (Kiến trúc hướng sự kiện)](04-event-driven-architecture.md) →
