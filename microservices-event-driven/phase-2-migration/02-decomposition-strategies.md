# Bài 2: Decomposition — cắt monolith bằng Business Capability và DDD Sub-domain

Bài trước nói "đừng cắt sai". Bài này dạy **cách cắt đúng** với 2 chiến lược chính ngành: **Business Capability** (góc nhìn business) và **DDD Sub-domain** (góc nhìn engineer).

## Method 1: Decompose by Business Capability

### Định nghĩa

> **Business capability** = khả năng tạo ra **giá trị** cho business hoặc customer. Trả lời câu hỏi: "Business này **làm được gì**?"

KHÔNG phải technical thing (vd "user authentication", "database access"). PHẢI là business value:
- "Bán sản phẩm" ✓
- "Vận chuyển hàng" ✓
- "Hỗ trợ khách hàng" ✓
- "Authenticate user" ✗ (đây là enabler, không phải business value)

### Heuristic — Mô tả cho non-technical person

Bài tập tư duy: giải thích system cho mẹ bạn (không phải dev). Mỗi câu bạn dùng từ "có thể" → 1 business capability.

Vd e-commerce:
- "Khách **có thể** browse sản phẩm." → **Product Browsing**
- "Khách **có thể** search và xem chi tiết sản phẩm." → **Search & Detail**
- "Khách **có thể** đọc review của khách trước." → **Reviews**
- "Khách **có thể** add to cart." → **Cart**
- "Khách **có thể** đặt hàng và thanh toán." → **Order**
- "Khách **có thể** theo dõi giao hàng." → **Shipping**
- "Merchant **có thể** quản lý kho." → **Inventory**

→ 7 capability → 7 candidate service.

### Architecture map

```text
+──────────────────────────────────────────────────+
│             E-commerce System                     │
+──────────────────────────────────────────────────+

  +─────────+  +─────────+  +─────────+  +─────────+
  │ Web UI  │  │ Product │  │ Search  │  │ Review  │
  │ service │  │ service │  │ service │  │ service │
  +─────────+  +─────────+  +─────────+  +─────────+

  +─────────+  +─────────+  +─────────+  +─────────+
  │ Cart    │  │ Order   │  │ Inventory│  │ Shipping│
  │ service │  │ service │  │ service │  │ service │
  +─────────+  +─────────+  +─────────+  +─────────+
```

Mỗi service:
- Own 1 capability.
- Có team riêng.
- Có database riêng.
- Deploy độc lập.

### Kiểm 3 nguyên tắc

| Nguyên tắc | Verify |
|---|---|
| **Cohesion** | "Thêm thuộc tính product?" → chỉ Product service đổi. "Đổi review policy?" → chỉ Review service đổi. ✓ |
| **SRP** | Tên service đã cho biết trách nhiệm. ✓ |
| **Loose coupling** | User flow "place order" → web → order → payment → shipping. Mỗi service 1 trách nhiệm rõ. ✓ |

3 nguyên tắc PASS → architecture lành mạnh.

### Ưu điểm Business Capability

- **Stable**: business capability hiếm đổi (e-commerce 10 năm vẫn cần Order, Product).
- **Cohesive** tự nhiên.
- **Clear ownership** cho PM, support engineer.

### Nhược điểm

- **Coarse-grained**: service to (vd Order service 50k LoC) — vì cover entire capability.
- Cần **deep business understanding** — engineer không hiểu business sẽ vẽ sai.

## Method 2: Decompose by Sub-domain (DDD)

### Domain-Driven Design — recap nhanh

**DDD** (Eric Evans, 2003) = phương pháp design lấy **domain** làm trung tâm.

Khái niệm:
- **Domain**: lĩnh vực business (vd "online retail").
- **Sub-domain**: phần con của domain.
- **Bounded Context**: phạm vi mà 1 thuật ngữ có nghĩa nhất quán.

### 3 loại sub-domain

| Loại | Định nghĩa | Đầu tư | Vd e-commerce |
|---|---|---|---|
| **Core** | Khác biệt cạnh tranh — không thể outsource | Tốt nhất, top engineer | Product catalog, Recommendation |
| **Supporting** | Quan trọng nhưng không khác biệt | Đầu tư hợp lý | Order, Inventory, Shipping |
| **Generic** | Có thể mua off-the-shelf | Buy > build | Payment, Search, Auth, Image processing |

Phân loại này quyết định **chiến lược đầu tư**:
- **Core**: viết riêng, sáng tạo, đầu tư heavy. **Không bao giờ outsource**.
- **Supporting**: viết riêng nếu cần custom, mua nếu OK.
- **Generic**: dùng SaaS hoặc OSS sẵn (vd Stripe cho payment, Algolia cho search).

### Sub-domain map e-commerce

```text
Core:
  +─────────────────+   +─────────────────+
  │ Product catalog │   │ Recommendation  │
  │ (differentiate) │   │ (personalized)  │
  +─────────────────+   +─────────────────+

Supporting:
  +─────────+  +─────────+  +─────────+
  │ Order   │  │Inventory│  │Shipping │
  +─────────+  +─────────+  +─────────+

Generic (consider buy/SaaS):
  +─────────+  +─────────+  +─────────+
  │Payment  │  │ Search  │  │ Auth    │
  │(Stripe) │  │(Algolia)│  │(Auth0)  │
  +─────────+  +─────────+  +─────────+
  +─────────+  +─────────+
  │ Image   │  │ Web UI  │
  │compress │  │ shell   │
  +─────────+  +─────────+
```

### Group khi cần

Sub-domain quá nhỏ → group thành 1 service:

```text
Initially:
  +─────────+  +─────────────+
  │ Image   │  │ Image       │
  │ storage │  │ compression │
  +─────────+  +─────────────+

Realize: chúng tightly coupled (mọi upload → compress).
Group thành 1 service:
  +─────────────────────+
  │ Image Processing    │
  │ - storage           │
  │ - compression       │
  +─────────────────────+
```

Hoặc Payment + Order ban đầu coupling cao → 1 service. Sau khi grow lên thì split.

→ Architecture **tiến hoá**, không cố định.

### Ưu điểm Sub-domain

- **Intuitive cho engineer** (góc nhìn dev).
- **Fine-grained**: service nhỏ, dễ rewrite.
- **Investment priority**: rõ core vs generic.

### Nhược điểm

- **Less stable**: engineer perspective thay đổi nhanh hơn business.
- Cần hiểu DDD — entry barrier cao hơn.

## So sánh side-by-side

| Tiêu chí | Business Capability | Sub-domain (DDD) |
|---|---|---|
| Góc nhìn | Business (PM-like) | Engineer (developer-like) |
| Granularity | Coarse-grained (service lớn) | Fine-grained (service nhỏ) |
| Stability | Cao (business stable) | Trung bình (tech evolve) |
| Cohesion | Rất cao | Cao |
| Coupling | Thấp | Thấp-Medium |
| Yêu cầu | Hiểu business sâu | Hiểu DDD + domain |
| Use case | Greenfield + new domain | Mature codebase với boundary đã có |

Trong thực tế: **kết hợp cả hai**. Bắt đầu business capability để có service map. Refine bằng DDD để xác định core/supporting/generic + investment strategy.

## Approach 3 (advanced): Event Storming

Trước khi vẽ boundary, run **Event Storming workshop**:

1. PM, BA, dev cùng phòng.
2. Liệt kê mọi **domain event** (vd `OrderPlaced`, `PaymentReceived`, `ItemShipped`).
3. Group event theo aggregate (entity tự xử lý event).
4. Aggregate → bounded context → microservice.

Workshop 1 ngày → discovery boundary chính xác hơn ngồi nghĩ 1 tháng.

Reference: "Event Storming" — Alberto Brandolini (2013).

## Code example — service contract reflect boundary

Product service API (sub-domain Core):

```yaml
paths:
  /products:
    get: { responses: { 200: { $ref: 'Products' } } }
    post: { requestBody: { $ref: 'CreateProduct' } }
  /products/{id}:
    get: ...
    put: ...
    delete: ...
  /products/{id}/recommendations:
    get: { responses: { 200: { $ref: 'RecommendedProducts' } } }
```

API rõ ràng — chỉ thao tác Product. Không có `orderId`, `userId`, `paymentMethod`.

Order service:

```yaml
paths:
  /orders:
    post:
      requestBody:
        # Reference productId (không embed full Product)
        properties:
          userId: {type: string}
          items:
            type: array
            items:
              properties:
                productId: {type: string}
                quantity: {type: integer}
```

Order chỉ giữ **reference** (productId) — không duplicate Product data. Resolve qua API call hoặc events.

## Khi 2 method cho kết quả khác nhau

Vd: "Payment" — business capability hay generic sub-domain?

- Business capability: "Process payment" là việc rõ ràng → Payment service.
- DDD sub-domain: "Payment processing" là **generic** → có thể outsource Stripe.

Cả 2 cho ra Payment service. Khác nhau: DDD bảo "đừng viết Payment service từ đầu, dùng Stripe wrapper".

**Pragmatism wins**: làm theo cái cho ROI cao nhất. Đa số case = Business Capability cho discovery + DDD cho buy-vs-build decision.

## Anti-pattern khi decompose

| Anti-pattern | Triệu chứng | Fix |
|---|---|---|
| "Too coarse" | Service 200k LoC vẫn là mini-monolith | Split tiếp theo sub-domain |
| "Too fine" | 50 service cho domain nhỏ | Group sub-domain coupling cao |
| Ignore generic | Build từ đầu Search engine (lãng phí) | Mua Algolia/Elasticsearch |
| Treat core as generic | Outsource Recommendation → mất cạnh tranh | Build in-house, top engineer |
| Boundary frozen | Architecture không tiến hoá | Quarterly review, refactor boundary |

## Câu hỏi gợi ý

- 7 business capability của Netflix là gì?
- "Authentication" là business capability hay generic sub-domain?
- Khi nào group 2 sub-domain thành 1 service?
- Vẽ sub-domain map cho domain của bạn (15 phút).

## Tóm tắt bài 2

- 2 chiến lược decompose chính ngành: **Business Capability** + **Sub-domain DDD**.
- Business Capability = "business **làm được gì**?" → service coarse-grained, stable.
- Sub-domain DDD = phân loại **Core / Supporting / Generic** → quyết định buy-vs-build.
- **Group khi quá nhỏ**, **split khi quá to** — architecture tiến hoá.
- **Event Storming workshop** = discovery boundary nhanh hơn.
- API contract phản ánh boundary — không leak domain khác.

**Bài kế tiếp** → [Bài 3: Strangler Fig pattern — migrate incremental, không big-bang](03-strangler-fig-pattern.md)
