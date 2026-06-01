# Bài 7: System Design Practice — Quy trình và Ví dụ thực hành

Bài cuối của Phase 6 (và của toàn bộ course Software Architecture Design). Bài này tổng hợp tất cả kiến thức từ Phase 1 → Phase 6 thành **quy trình thiết kế hệ thống thực tế** — kỹ năng mà bạn sẽ dùng trong system design interview và trong công việc hằng ngày.

## Quy trình System Design — 4 bước

Bất kể bạn được giao thiết kế hệ thống gì (Twitter, Uber, Netflix, hay một internal tool), luôn follow quy trình 4 bước này:

```text
Bước 1: Thu thập Requirements (yêu cầu)
    ├── Functional Requirements (use case & user flow)
    ├── Non-functional Requirements (quality attributes)
    └── System Constraints (ràng buộc)

Bước 2: Định nghĩa API
    ├── Xác định các entity
    ├── Map entity → URI
    ├── Chọn representation (thường là JSON)
    └── Gán HTTP method (POST, GET, PUT, DELETE)

Bước 3: Functional Architecture (kiến trúc chức năng)
    └── Vẽ diagram đáp ứng functional requirement
        (chưa cần quan tâm scale / performance)

Bước 4: Non-functional Refinement (tinh chỉnh phi chức năng)
    └── Tinh chỉnh diagram để đạt quality attributes
        (scalability, availability, performance)
```

**Lý do của thứ tự này**: Nếu bạn nhảy thẳng vào "tôi dùng Redis + Cassandra + Kafka" mà chưa hiểu requirements → bạn đang **over-engineer** hoặc **giải sai bài toán**. Hỏi requirements trước, kiến trúc sau.

---

## Ví dụ 1: Highly Scalable Discussion Forum (giống Reddit / Hacker News)

### Bước 1: Requirements

**Functional Requirements (chức năng):**

- User signup / login.
- Tạo post (title, tags, body với text/image).
- Comment trên post (flat chronological list — danh sách phẳng theo thời gian).
- Upvote / downvote post và comment (mỗi user chỉ vote 1 lần / 1 đối tượng).
- Xoá post / comment của chính mình.
- Homepage: Top 20 post phổ biến nhất (theo vote trong 24h).

**Non-functional Requirements (chất lượng):**

- **Scalability**: Từ traffic thấp ban đầu → hàng triệu user, chịu được spike traffic.
- **Performance**: Response < vài trăm ms.
- **Availability**: 3 nines (99.9%).
- **Consistency vs Availability**: **Ưu tiên availability** (eventual consistency chấp nhận được cho post / vote).
- **Durability**: Data không bao giờ mất (trừ khi user chủ động xoá).

### Bước 2: API Design (REST)

**Các entity chính:** Users, Posts, Images, Comments, Votes.

**URI structure:**

```text
/users                            ← Collection độc lập
/posts                            ← Collection độc lập
/posts/{id}/images                ← Sub-resource
/posts/{id}/comments              ← Sub-resource
/posts/{id}/votes                 ← Sub-resource
/posts/{id}/comments/{cid}/votes  ← Nested
```

**HTTP Methods:**

```text
POST   /users                            → Signup
POST   /sessions                         → Login (tạo auth token)

POST   /posts                            → Tạo post mới
GET    /posts                            → List post (paginated)
GET    /posts/{id}                       → Lấy 1 post cụ thể
DELETE /posts/{id}                       → Xoá post của chính mình

POST   /posts/{id}/images                → Upload image
GET    /posts/{id}/images/{img_id}       → Lấy image

POST   /posts/{id}/comments              → Thêm comment
GET    /posts/{id}/comments              → Lấy danh sách comment (paginated)
DELETE /posts/{id}/comments/{cid}        → Xoá comment

POST   /posts/{id}/votes                 → Upvote / downvote post
POST   /posts/{id}/comments/{cid}/votes  → Vote comment
```

**Các cân nhắc về API:**

- **Pagination**: Home page top post → `limit=20`, dùng offset-based hoặc cursor-based.
- **Infinite scrolling**: Comment load theo page, frontend ẩn pagination phía sau infinite scroll.
- **Idempotency** cho vote: Vote 2 lần phải có cùng kết quả (không cộng dồn).

### Bước 3: Functional Architecture

```text
Browser / Client
    │
    ▼
API Gateway (auth, routing, rate limit)
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  Web App Service        (serve static frontend)      │
│  User Service           ←→ [Users DB (SQL)]          │
│  Post & Comment Service ←→ [Posts/Comments DB]       │
│                         ←→ [Object Store (image)]    │
│  Voting Service         ←→ [Votes DB]                │
│  Ranking Service        ←→ [Ranking DB (read-opt)]   │
└─────────────────────────────────────────────────────┘
```

**Các quyết định thiết kế chính:**

**Post + Comment trong 1 service (không tách):**
- Comment có cấu trúc tương tự post nhưng đơn giản hơn.
- Combine → dễ load post kèm comment cùng 1 DB call.

**Voting Service riêng:**
- Cần track ai vote cái gì (không chỉ counter — vì cần ngăn vote nhiều lần).
- Cần timestamp để tính vote trong window 24h cho homepage.
- Schema: `{user_id, post_id, vote (+1/-1), timestamp}`.

**Ranking Service với Batch Processing:**

```text
Ranking Service chạy mỗi 10-30 phút:
1. Query Voting Service: tất cả vote trong 24h gần nhất
2. Tính (upvote - downvote) cho mỗi post
3. Sort theo độ phổ biến
4. Pull post content từ Post Service
5. Lưu sorted list vào Ranking DB

Khi user vào home page:
→ Đọc trực tiếp từ Ranking DB → trả về top 20 post ngay
```

**CQRS Pattern cho Ranking** (đã học ở Phase 6 Bài 4):

```text
Post Service ──events──► [Broker] ──► Ranking Service
Voting Service ──events──► [Broker] ──┘

Ranking Service maintain:
- Materialized view = sorted post với vote count
- Read-optimized DB (vd: Redis sorted set)
- Home page query cực nhanh
```

**Image trong Object Store:**
- Upload: Client → Post Service → Object Store (S3).
- View: Browser → Object Store trực tiếp (public URL, qua CDN).

### Bước 4: Non-functional Refinement

**Scalability:**

```text
Tất cả service → Load Balancer → nhiều instance
Database     → Replication + Sharding (Phase 5 Bài 3)
Object Store → đã scalable sẵn (S3)
CDN          → cache image, static asset (Phase 4 Bài 4)
```

**Availability (3 nines = 8.76 giờ downtime/năm):**

```text
Replication cho mọi database (active-passive cho SQL, active-active cho NoSQL)
Active-Active cho service tier (multi-instance sau LB)
Monitoring + health check + auto-restart
```

**Performance:**

```text
CDN → phục vụ image / static asset nhanh
Ranking Service → pre-computed → home page load instant
Pagination → giảm data transfer
Post/Comment DB → index trên (post_id, timestamp) cho query nhanh
Cache (Redis) cho hot post được xem nhiều
```

**Eventual Consistency được chấp nhận:**

```text
Vote count: không cần real-time chính xác tuyệt đối
Popular post ranking: cập nhật mỗi 10-30 phút → OK
→ Đánh đổi consistency lấy availability + performance
```

---

## Ví dụ 2: E-Commerce Marketplace Platform (giống Amazon / Shopify)

### Tóm tắt Requirements

**Actor chính:**
- **Merchant** (người bán): tạo và quản lý sản phẩm.
- **Buyer** (người mua): mua sản phẩm.
- **Admin**: quản lý hệ thống.

**Functional Requirements:**

- **Merchant**: Signup, create / manage product, manage inventory, xem order.
- **Buyer**: Search product, xem chi tiết, manage cart, checkout, track order.
- **System**: Xử lý payment (qua bên thứ ba — Stripe, PayPal), shipping (3rd party), notification.

**Non-functional Requirements:**

- **Scalability**: Hàng triệu user, chịu được spike traffic (flash sale, Black Friday).
- **Performance**: Search result < 500ms.
- **Availability**: Cao (e-commerce = revenue trực tiếp, downtime = mất tiền).
- **Data Durability**: Order **không được mất** (consequences nghiêm trọng).

### Key Architecture Decisions

**Chia microservice theo domain (Domain-Driven Design):**

```text
Merchant Domain:
  - Merchant Service     (account, profile)
  - Product Service      (catalog, description)
  - Inventory Service    (stock count)

Buyer Domain:
  - User Service             (account user)
  - Product Search Service   (search / browse)
  - Cart Service             (giỏ hàng)
  - Order Service            (đơn hàng)

Infrastructure (cross-cutting):
  - API Gateway
  - Notification Service     (email, push, SMS)
  - Payment Service          (tích hợp 3rd party như Stripe)
  - Shipping Service         (tích hợp FedEx, UPS, Grab Express)
```

**Event-Driven cho Checkout Flow** (Phase 6 Bài 4):

```text
User checkout → Order Service publish event "order_placed"
                                    │
                                    ▼
                          Payment Service xử lý
                          → publish "payment_completed"
                                    │
                                    ▼
                          Subscriber song song:
                          ├── Inventory Service     (giảm stock)
                          ├── Shipping Service      (đặt lịch ship)
                          └── Notification Service  (gửi email confirm)

User nhận confirmation NGAY LẬP TỨC (không cần chờ shipping schedule)
Billing / shipping xảy ra ASYNC bên trong
```

**CQRS cho Product Search:**

```text
Product Service   ──update event──► [Broker] ──► Product Search Service
Inventory Service ──update event──► [Broker] ──┘

Product Search Service maintain:
Materialized view = {product_id, name, price, availability, avg_rating, thumbnail_url}

→ Search query chỉ cần 1 service, 1 DB, cực nhanh
→ Không cần JOIN qua nhiều service
```

**Flash Sale (xử lý spike traffic):**

```text
Flash Sale: 10,000 user cùng mua 100 sản phẩm trong 1 phút

Inventory Service dùng:
- Redis (Key-Value): cực nhanh cho atomic counter
- Atomic decrement: inventory_count--
- Nếu count < 0 → reject order ngay

Order:
- Message Broker buffer order (Phase 4 Bài 2)
- Xử lý sau khi sale qua đỉnh
→ Không cần over-provision server tốn kém
→ Buffer hấp thụ spike thay vì crash
```

**Global Scale (đa region):**

```text
GSLB (Phase 4 Bài 1) → Route user về datacenter gần nhất

Multi-region deployment:
  US-East   (primary)
  EU-West   (replica + serve EU traffic)
  APAC      (replica + serve APAC traffic)

CDN:
  Product thumbnail, image, static asset
  → Serve từ edge server → fast trên toàn cầu
```

---

## System Design Interview Tips

Khi đi phỏng vấn system design (Google, Meta, Amazon, ...), follow các nguyên tắc sau:

### 1. Clarify trước khi design (cực kỳ quan trọng)

Đừng nhảy thẳng vào vẽ box. Hỏi rõ requirements trước:

```text
"Trước khi bắt đầu, tôi muốn clarify một số điểm:
 - Scale target: bao nhiêu user? DAU (Daily Active User)? Peak QPS?
 - Read/write ratio?
 - Consistency requirements: real-time hay eventual consistency OK?
 - Budget / team constraint?
 - Mục tiêu tối ưu: latency, throughput, hay cost?"
```

Điều này cho thấy bạn **suy nghĩ như một kiến trúc sư thực thụ** — không over-engineer, không under-engineer.

### 2. Bắt đầu với Functional Architecture

```text
Bước 1: Identify service nào cần có (chưa cần scale)
Bước 2: Define data flow giữa các service
Bước 3: Define data model / schema chính
```

Vẽ diagram cao-level trước. Đừng nghĩ về Redis, Kafka, replica từ đầu — đó là Bước 4.

### 3. Thể hiện rõ Trade-offs (kỹ năng quan trọng nhất)

Interviewer muốn thấy bạn **nhận thức được trade-off**, không chỉ chọn pattern lung tung:

```text
"Tôi sẽ chọn availability over consistency ở đây vì...
 Trade-off là user có thể thấy stale data trong X phút,
 nhưng điều đó chấp nhận được vì..."

"Tôi dùng NoSQL ở đây vì cần flexible schema,
 nhưng trade-off là không có ACID transaction —
 nên cho phần X (transactional), tôi vẫn dùng PostgreSQL"
```

### 4. Bottleneck Identification (xác định nút thắt)

```text
Identify bottleneck (thường gặp):
- Database với read traffic cao  → Read replica + cache
- Service tốn compute            → Horizontal scale + LB
- External API call              → Async qua Message Broker
- Global latency                 → CDN + Multi-region
- Hot key trong cache            → Cache sharding / replica
```

### 5. Tham chiếu các pattern đã học

Đừng "phát minh" pattern mới giữa interview. Dùng pattern phổ biến và nói tên nó:

```text
"Tôi sẽ áp dụng CQRS pattern ở đây..."
"Đây là Event-Driven Architecture với pub-sub..."
"Database này dùng Active-Passive replication..."
"Cache strategy là pull (lazy loading)..."
```

### 6. Vẽ diagram rõ ràng

- Service = box vuông.
- Database = hình trụ.
- Message broker = hình thoi.
- Mũi tên có **label** (REST, gRPC, event).
- Đánh dấu sync vs async khác nhau.

## Tóm tắt quy trình System Design

```text
4 Bước System Design:

1. Requirements (yêu cầu)
   ├── Functional: use case, user flow, API
   ├── Non-functional: quality attribute (perf, scale, availability)
   └── Constraint: tech, business, legal

2. API Design (REST hoặc gRPC)
   ├── Entities → URIs
   ├── Representation (JSON)
   └── HTTP Methods

3. Functional Architecture
   ├── Identify service
   ├── Define data store per service
   └── Map API call to service

4. Non-functional Refinement
   ├── Load Balancer
   ├── DB Replication + Sharding
   ├── Caching (Redis, CDN)
   ├── Message Broker (async, spike buffer)
   └── CQRS / Event-Driven pattern
```

## Lời kết của course

Bạn đã đi qua **6 Phase** của software architecture design:

- **Phase 1**: Architectural Drivers — Requirements + Constraints.
- **Phase 2**: Quality Attributes — Performance, Scalability, Availability, Fault Tolerance, SLA/SLO/SLI.
- **Phase 3**: API Design — REST, RPC, IDL, HATEOAS.
- **Phase 4**: Architectural Building Blocks — Load Balancer, Message Broker, API Gateway, CDN.
- **Phase 5**: Data Storage — SQL, NoSQL, Indexing/Replication/Sharding, CAP, Unstructured Storage.
- **Phase 6**: Architectural Patterns — Multi-tier, Microservices, Event-Driven, Stream Processing, Big Data / Lambda.

Bạn đã có toolkit đầy đủ để **thiết kế hệ thống ở quy mô bất kỳ**. Bước tiếp theo: thực hành — chọn 1 sản phẩm bạn dùng hằng ngày (Twitter, Uber, Netflix, Tinder, ...) và thử thiết kế lại nó theo quy trình 4 bước trên. Hoặc đi xa hơn: implement một phần nhỏ và đo lường thực tế.

Chúc bạn thành công trên con đường trở thành Software Architect!

---
**Hoàn thành Software Architecture Design Course** 🎓

**Phase tiếp theo (nếu có)**: Áp dụng vào project thực tế — không có "bài kế tiếp" trong course này.
