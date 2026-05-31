# Bài 1: Service boundaries — 3 nguyên tắc cốt lõi

Câu hỏi #1 khi migrate monolith → microservices: **vẽ đường biên giữa các service ở đâu?** Sai boundary = mỗi feature change phải coordinate 5 team, lương cao nhưng tổng thể chậm hơn monolith.

Bài này dạy 3 nguyên tắc **bất biến** — vi phạm 1 trong 3 = distributed monolith.

## Setup case study — e-commerce store

Để đào sâu 3 nguyên tắc, ta dùng **online store** xuyên suốt:

```text
+──────────────────────────────────────+
│ Monolith (Java/Spring)               │
│  - Browse products                   │
│  - Search & view product detail      │
│  - Read reviews                      │
│  - Add to cart                       │
│  - Place order                       │
│  - Process payment                   │
│  - Manage inventory                  │
│  - Ship order                        │
│  - Send notification                 │
+──────────────────────────────────────+
                  │
                  ▼
              Postgres
```

Codebase 1.2 triệu LoC, 80 dev, build 25 phút, deploy 1 lần/tuần. **Đến lúc migrate**.

## Attempt 1: Cắt theo layer (FAIL)

Approach: cắt theo lớp đã có sẵn — UI layer, business layer, data layer.

```text
+──────────+        +──────────+        +──────────+
│ Storefront│ ◄────► │ Business │ ◄────► │   Data   │
│  service │  REST  │ service  │  REST  │  service │
+──────────+        +──────────+        +──────────+
```

**Vì sao FAIL?**

Mỗi feature mới (vd "add product review with photo") đụng vào **cả 3 service**:
- Storefront: thêm form upload.
- Business: validate + business rule.
- Data: schema table review_photos.

→ Mỗi feature = 3 PR ở 3 repo + coordinate 3 team. **Tệ hơn monolith**.

Đây không phải "microservices", chỉ là "3-tier với network call thêm". Vẫn coupling cao.

## Nguyên tắc 1: COHESION (gắn kết cao)

> **Cohesion**: những thứ **đổi cùng nhau** phải **nằm cùng chỗ**.

Cohesion thấp = đổi 1 feature đụng N service.
Cohesion cao = đổi 1 feature đụng 1 service.

Cách kiểm tra: viết ra 10 feature thường thay đổi. Map mỗi feature đến service. Nếu mỗi feature đụng 1-2 service → cohesion OK. Nếu đụng 4+ service → vẽ sai.

## Attempt 2: Cắt theo technology (FAIL)

Approach: tận dụng tech best-fit cho từng module.

```text
+────────────+   +────────────+   +────────────+
│ Storefront-│   │ Storefront-│   │ Recommend- │
│ Node.js    │   │  Java      │   │ C++ engine │
+────────────+   +────────────+   +────────────+
+────────────+   +────────────+
│ ML-Python  │   │ Payment-Go │
+────────────+   +────────────+
```

**Vì sao FAIL?**

- Product manager hỏi "thêm filter giá" → không biết đó là Storefront-Node hay Storefront-Java.
- Support engineer report bug "payment fail" → không rõ Payment-Go hay business layer còn trong monolith.
- API mỗi service trộn nhiều context: User, Product, Bank Account → naming ambiguous.
- 1 service còn lại trong monolith vẫn quá to → vẫn là monolith.

Tech-driven boundary tốt cho **performance**, tệ cho **organizational clarity**.

## Nguyên tắc 2: SINGLE RESPONSIBILITY (đơn trách nhiệm)

> **Single Responsibility Principle (SRP)**: mỗi service làm **1 việc** và làm cực giỏi.

Heuristic: mô tả service trong 1 câu không cần "và":
- ✓ "Product service quản lý catalog sản phẩm".
- ✗ "Product service quản lý catalog sản phẩm **và** xử lý đơn hàng **và** gửi email."

Khi SRP rõ:
- PM biết hỏi team nào cho feature mới.
- API có terminology nhất quán: `productId`, `productName` chỉ thuộc Product service.
- Code review focused: reviewer hiểu domain mà mình review.

## Attempt 3: Nano-services — càng nhỏ càng tốt (FAIL)

Approach: "micro = small, càng small càng tốt". Cắt mỗi class/package thành 1 service.

200 service cho domain e-commerce nhỏ.

**Vì sao FAIL?**

```text
User click "Buy" → API Gateway
                 → CartService (1)
                 → ProductService (2)
                 → PriceService (3)
                 → DiscountService (4)
                 → TaxService (5)
                 → PaymentService (6)
                 → InventoryService (7)
                 → ShippingService (8)
                 → OrderService (9)
                 → NotificationService (10)

Latency tổng: 200ms × 10 hop = 2s nếu network OK.
Latency tổng: nếu 1 service slow → cả chain slow.
Debug: trace qua 10 service hop để tìm bug.
```

Mỗi service nhỏ = nhiều network call = nhiều failure mode = harder ops.

## Nguyên tắc 3: LOOSE COUPLING (kết nối lỏng)

> **Loose coupling**: service có **ít hoặc không** dependency với service khác. Mỗi request **chỉ chạm vài service**.

Tight coupling pattern (xấu):
- Service A cần data từ B trong mọi response → A luôn gọi B → A fail khi B fail.
- A và B share database → schema change của A break B.
- A và B deploy phải đồng thời.

Loose coupling pattern (tốt):
- A có copy data từ B (replicated qua events) → A không gọi B mỗi request.
- A và B own DB riêng.
- A và B deploy độc lập.

## "Micro" không có nghĩa "nhỏ"

Hiểu lầm phổ biến: microservice phải dưới 1000 LoC.

Sự thật: **size không quan trọng**, miễn là 3 nguyên tắc thoả mãn:

| Service | LoC | Health? |
|---|---|---|
| Auth (1k LoC) | Small | Tốt nếu cohesive + SRP + loose coupling |
| ProductCatalog (30k LoC) | Medium-large | Tốt nếu cohesive + SRP + loose coupling |
| Recommendation (80k LoC) | Large | Tốt nếu cohesive + SRP + loose coupling |
| OrderProcessing (2k LoC) | Small | XẤU nếu coupling cao với 5 service khác |

→ Đừng obsess size. Obsess principle.

## Bảng so sánh 3 attempt

| Attempt | Cohesion | SRP | Coupling | Verdict |
|---|---|---|---|---|
| Layer (UI/Biz/Data) | Thấp | Vague | Cao | FAIL |
| Technology | OK | Mixed | Medium | FAIL |
| Nano-service | OK | Quá nhỏ | Cực cao | FAIL |
| Business capability (bài 2) | **Cao** | **Rõ** | **Thấp** | **PASS** |
| Sub-domain (bài 2) | **Cao** | **Rõ** | **Medium** | **PASS** |

Bài 2 sẽ deep-dive 2 approach đúng.

## Anti-pattern thường gặp

| Anti-pattern | Triệu chứng | Fix |
|---|---|---|
| Layer-based split | Mỗi feature = N PR ở N service | Cắt lại theo business capability |
| Tech-driven split | Naming convention rối | Đặt name theo domain |
| Nano-service | Latency cao, debug khó | Gộp service liên quan |
| Anemic service (chỉ là DB wrapper) | Service không có business logic | Move logic vào service |
| God service | 1 service ôm 70% logic | Split theo SRP |
| Shared DB | Schema change phá nhiều team | DB per service (phase 3 bài 1) |

## Code-level — service contract phản ánh boundary

Boundary đúng → API contract rõ ràng + ổn định.

```yaml
# OpenAPI cho Product service (boundary tốt)
paths:
  /products/{productId}:
    get:
      responses:
        '200':
          schema:
            $ref: '#/components/schemas/Product'

components:
  schemas:
    Product:
      properties:
        id: {type: string}
        name: {type: string}
        description: {type: string}
        price: {$ref: '#/components/schemas/Price'}
        # KHÔNG có: userId, orderId, paymentMethod — không thuộc Product
```

API không leak domain khác → boundary clean.

Khi review API, hỏi: "field này có thuộc domain service không?" Nếu không → boundary leak.

## Khi nào KHÔNG follow nguyên tắc?

Hiếm, nhưng có:

- **Migration intermediate**: trong giai đoạn migrate, có thể có service tạm thời cross-domain. Phải có plan refactor.
- **Spike / POC**: thử nghiệm 1 feature, OK chấp nhận coupling tạm.
- **Constraint kỹ thuật**: vd payment gateway require atomic operation → service hơi to.

Nhưng không bao giờ **stable production** với coupling cao. Đó là technical debt nuôi cấp số nhân.

## Tóm tắt bài 1

- 3 nguyên tắc bất biến cho service boundary: **Cohesion** + **Single Responsibility** + **Loose Coupling**.
- Cắt theo **layer** (UI/Biz/Data) là FAIL — mỗi feature đụng cả 3.
- Cắt theo **technology** là FAIL — naming ambiguous + 1 service vẫn quá to.
- **Nano-services** là FAIL — latency + debug nightmare.
- "Micro" không có nghĩa "nhỏ" — size không quan trọng, principle quan trọng.
- 2 approach đúng: **business capability** + **sub-domain DDD** (bài 2).

**Bài kế tiếp** → [Bài 2: Decomposition — cắt monolith bằng Business Capability và DDD Sub-domain](02-decomposition-strategies.md)
