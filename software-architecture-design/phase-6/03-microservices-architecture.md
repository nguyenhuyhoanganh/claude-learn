# Bài 3: Microservices Architecture

## Từ Monolith đến Microservices

**Khi nào monolith stop working:**
- Codebase quá lớn → load IDE mất nhiều giây
- Build và test toàn bộ app mỗi khi thay đổi nhỏ
- Merge conflicts liên tục khi nhiều developers
- Không thể release feature A mà không deploy cả app
- Một component chậm → toàn bộ app bị ảnh hưởng

## Microservices là gì?

> **Microservices Architecture** = Tổ chức business logic thành collection of **loosely coupled, independently deployed services**. Mỗi service được sở hữu bởi một team nhỏ và có **narrow scope of responsibility**.

```
Monolith:
┌─────────────────────────────────────┐
│            Application              │
│  [Users] [Products] [Orders]        │
│  [Billing] [Search] [Notifications] │
└─────────────────────────────────────┘
             (tất cả trong 1 codebase)

Microservices:
[User Service] [Product Service] [Order Service]
[Billing Svc]  [Search Service]  [Notification Svc]
(mỗi cái: riêng codebase, riêng database, riêng deployment)
```

## Lợi ích

### 1. Development Speed

- Codebase nhỏ hơn → IDE load nhanh, build nhanh
- Test chỉ service của mình
- New developer ramp up nhanh hơn

### 2. Performance & Scalability

- Mỗi instance nhỏ hơn → ít memory, ít CPU
- Scale từng service riêng theo nhu cầu:
  ```
  Search Service: 50 instances (high read traffic)
  Billing Service: 5 instances (low volume, critical)
  Notification Svc: 10 instances (async workers)
  ```

### 3. Organizational Scalability (Team Autonomy)

```
Team A owns User Service:
├── Chọn tech stack riêng (Go, Java, Python...)
├── Deploy schedule riêng (5x/ngày nếu muốn)
└── Database riêng (PostgreSQL, MongoDB...)

Team B owns Order Service:
├── Không cần coordinate với Team A
└── Không bị blocked bởi Team A's release
```

### 4. Fault Isolation

Một service crash → chỉ ảnh hưởng đến service đó:
```
Product Service down:
→ Search service degraded
→ Checkout, User, Billing: vẫn hoạt động bình thường
```

### 5. Technology Freedom

Mỗi team chọn best tool cho use case của họ:
- Service xử lý nhiều I/O → Node.js
- Service cần concurrency cao → Go
- Service cần ML → Python
- Service financial → Java (mature, safe)

## Best Practices quan trọng

### 1. Single Responsibility Principle

Mỗi service: **1 business domain/capability**.

```
❌ Sai:
UserAndOrderAndBillingService

✅ Đúng:
User Service    → User profiles, authentication
Order Service   → Order creation, fulfillment
Billing Service → Payments, invoices
```

**Ví dụ: Online Dating App**
```
User Profile Service   → Manage profiles
Image Service          → Store/resize/serve images
Matching Service       → Match users (depends on Profile Svc)
Billing Service        → Charge users for features
```

**Ví dụ: E-Commerce**
```
Action-based:
  Product Search Service  → Search queries
  Checkout Service        → Cart, checkout flow
  Tax Calculator          → Tax computation

Entity-based:
  Product Inventory Svc   → Product data, stock
  Billing Service         → Payments
  Shipping Service        → Delivery tracking
```

### 2. Database per Service

```
❌ Shared database:
[User Svc] ─┐
[Order Svc] ─┼─> [Shared DB]  ← Schema change = tất cả bị ảnh hưởng!
[Billing Svc]─┘

✅ Database per service:
[User Svc] → [Users DB (PostgreSQL)]
[Order Svc] → [Orders DB (MySQL)]
[Billing Svc] → [Billing DB (PostgreSQL)]

→ Schema là implementation detail của mỗi service
→ Có thể thay DB technology mà không ảnh hưởng ai
```

**Trade-off:** Data duplication là acceptable và expected.

## Thách thức của Microservices

### 1. Distributed Systems Complexity

- Network failures giữa services
- Latency cao hơn (network hop thay vì function call)
- Distributed tracing khó hơn

### 2. Service Discovery

Làm sao Service A tìm thấy Service B?
- Kubernetes Service Registry
- AWS Service Discovery
- Consul

### 3. Inter-service Communication

```
Synchronous (REST/gRPC):
→ Direct coupling, but immediate response

Asynchronous (Message Broker):
→ Loose coupling, but eventual consistency
→ Better for fault tolerance
```

### 4. Data Consistency

Không có global ACID transactions → cần Saga pattern, eventual consistency.

## Khi nào migrate sang Microservices?

```
✅ Nên migrate khi:
├── Team > 20-30 engineers
├── Codebase phức tạp, khó maintain
├── Release cycles dài (do coordination overhead)
└── Different components cần scale differently

❌ Đừng migrate quá sớm:
├── Small team (overhead > benefit)
├── Sản phẩm còn đang thay đổi nhiều (domain boundaries chưa rõ)
└── Chưa hiểu rõ domain → Service boundaries sẽ sai
```

**Best approach:** Start monolith → migrate khi cần!

## Ví dụ: API Gateway với Microservices

```
Client → API Gateway → User Service
                     → Product Service
                     → Order Service
                     → Billing Service

API Gateway:
├── Route requests đến đúng service
├── Handle auth (không cần mỗi service tự auth)
└── Aggregate responses (reduce client round trips)
```

Tách API Gateway thành nhiều Gateway services theo client type:
```
Mobile Gateway     → Tối ưu cho mobile (compressed, less data)
Desktop Gateway    → Full data, high-res
Partner API GW     → External B2B APIs
```

## Tóm tắt

```
Microservices:
├── Collection of loosely coupled services
├── Each: small team, narrow scope, independent deploy
└── Separate database per service

Benefits:
├── Development speed (small codebase)
├── Independent scaling
├── Team autonomy & tech freedom
└── Fault isolation

Challenges:
├── Distributed system complexity
├── Network latency
├── Data consistency (no global ACID)
└── Service discovery

When to use: Large teams, complex domain, mature product
Start with monolith first!
```

---
**Tiếp theo:** Bài 4 - Event-Driven Architecture →
