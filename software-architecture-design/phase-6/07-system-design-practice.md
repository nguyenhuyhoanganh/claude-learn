# Bài 7: System Design Practice - Quy trình và Ví dụ

## Quy trình System Design

Dù cho bất kỳ hệ thống nào, luôn follow quy trình 4 bước:

```
Bước 1: Thu thập Requirements
    ├── Functional Requirements (Use Cases & User Flows)
    ├── Non-functional Requirements (Quality Attributes)
    └── System Constraints

Bước 2: Định nghĩa API
    ├── Xác định entities
    ├── Map entities → URIs
    ├── Chọn representation (JSON)
    └── Assign HTTP methods

Bước 3: Functional Architecture
    └── Thiết kế diagram đáp ứng functional requirements
        (chưa quan tâm đến scale/perf)

Bước 4: Non-functional Refinement
    └── Refine diagram để đạt quality attributes
        (scalability, availability, performance)
```

---

## Ví dụ 1: Highly Scalable Discussion Forum (như Reddit/HackerNews)

### Bước 1: Requirements

**Functional Requirements:**
- User signup/login
- Create post (title, tags, body with text/images)
- Comment on posts (flat chronological list)
- Upvote/downvote posts và comments (mỗi user chỉ vote một lần)
- Delete own posts/comments
- Homepage: Top 20 most popular posts (by votes trong 24h)

**Non-functional Requirements:**
- **Scalability**: Từ low traffic → millions of users, handle spikes
- **Performance**: Response < vài trăm ms
- **Availability**: 3 nines (99.9%)
- **Consistency vs Availability**: Prioritize availability (eventual consistency OK cho posts/votes)
- **Durability**: Data không bao giờ mất (trừ khi explicitly deleted)

### Bước 2: API Design (REST)

**Entities:** Users, Posts, Images, Comments, Votes

**URIs:**
```
/users                    ← Independent collection
/posts                    ← Independent collection
/posts/{id}/images        ← Sub-resource
/posts/{id}/comments      ← Sub-resource
/posts/{id}/votes         ← Sub-resource
/posts/{id}/comments/{cid}/votes  ← Nested
```

**HTTP Methods:**
```
POST /users              → Sign up
POST /sessions           → Login (tạo auth token)

POST /posts              → Create post
GET  /posts              → List posts (paginated)
GET  /posts/{id}         → Get post
DELETE /posts/{id}       → Delete own post

POST /posts/{id}/images  → Upload image
GET  /posts/{id}/images/{img_id} → Get image

POST /posts/{id}/comments → Add comment
GET  /posts/{id}/comments → Get comments (paginated)
DELETE /posts/{id}/comments/{cid} → Delete comment

POST /posts/{id}/votes   → Upvote/downvote
POST /posts/{id}/comments/{cid}/votes → Vote comment
```

**API Considerations:**
- **Pagination**: Home page top posts → limit=20, offset-based
- **Infinite scrolling**: Comments load theo page, frontend ẩn pagination

### Bước 3: Functional Architecture

```
Browser/Client
    ↓
API Gateway (auth, routing)
    ↓
┌─────────────────────────────────────────────────────┐
│  Web App Service (serve static frontend)            │
│  User Service ←→ [Users DB (SQL)]                  │
│  Post & Comment Service ←→ [Posts/Comments DB]     │
│                           ←→ [Object Store (images)]│
│  Voting Service ←→ [Votes DB]                      │
│  Ranking Service ←→ [Ranking DB (read-optimized)]  │
└─────────────────────────────────────────────────────┘
```

**Key design decisions:**

**Posts + Comments trong 1 service:**
- Comments có structure tương tự post nhưng đơn giản hơn
- Combine → dễ load post với comments (same DB)

**Voting Service riêng biệt:**
- Cần track who voted on what (not just a counter)
- Cần timestamp để tính votes trong 24h window
- Schema: `{user_id, post_id, vote (+1/-1), timestamp}`

**Ranking Service với Batch Processing:**
```
Ranking Service runs every 10-30 minutes:
1. Query Voting Service: all votes trong 24h
2. Sum upvotes - downvotes per post
3. Sort by popularity
4. Pull post content từ Post Service
5. Store sorted list → Ranking DB

User request home page:
→ Ranking DB → Return top 20 posts instantly
```

**CQRS Pattern cho Ranking:**
```
Post Service ──events──> [Broker] ──> Ranking Service
Voting Service ──events──> [Broker] ──┘

Ranking Service:
- Materialized view = sorted posts với vote counts
- Read-optimized DB (fast for home page queries)
```

**Images trong Object Store:**
- Upload: Client → Post Service → Object Store
- View: Browser → Object Store (direct, public URLs)

### Bước 4: Non-functional Refinement

**Scalability:**
```
Tất cả services → Load Balancer → Multiple instances
Database → Replication + Sharding
Object Store → Already scalable (S3)
CDN → Cache images, static assets
```

**Availability (3 nines):**
```
Replication cho tất cả databases
Active-Active cho services
Monitoring + auto-restart
```

**Performance:**
```
CDN → Serve images/static assets nhanh
Ranking Service → Pre-computed → Home page load instant
Pagination → Giảm data transfer
Post/Comments DB → Index on post_id, timestamp
```

**Eventual Consistency (chấp nhận được):**
```
Votes → không cần perfect real-time count
Popular posts ranking → update mỗi 10-30 phút → OK
```

---

## Ví dụ 2: E-Commerce Marketplace Platform (như Amazon/Shopify)

### Requirements Summary

**Actors:** Merchants (sell products), Buyers (purchase products), Admins

**Functional Requirements:**
- Merchant: signup, create/manage products, manage inventory, view orders
- Buyer: search products, view details, manage cart, checkout, track orders
- System: handle payments (3rd party), shipping (3rd party), notifications

**Non-functional Requirements:**
- **Scalability**: Hàng triệu users, traffic spikes (flash sales)
- **Performance**: Search results < 500ms
- **Availability**: High (thương mại điện tử = revenue)
- **Data Durability**: Orders không được mất

### Key Architecture Decisions

**Microservices theo domain:**
```
Merchant Domain:
  - Merchant Service (accounts, profiles)
  - Product Service (catalog, descriptions)
  - Inventory Service (stock counts)

Buyer Domain:
  - User Service (accounts)
  - Product Search Service (search/browse)
  - Cart Service
  - Order Service

Infrastructure:
  - API Gateway
  - Notification Service
  - Payment Service (3rd party integration)
  - Shipping Service (3rd party integration)
```

**Event-Driven cho Checkout Flow:**
```
User checkout → Order Service → [order_placed event]
                                        ↓
                              Payment Service ──────> [payment_completed event]
                                                               ↓
                                                    Inventory Service (decrement stock)
                                                    Shipping Service (schedule delivery)
                                                    Notification Service (email/push)

User nhận confirmation ngay lập tức!
Billing/shipping xảy ra asynchronously.
```

**CQRS cho Product Search:**
```
Product Service ──update──> [Broker] ──> Product Search Service
Inventory Service ──update──> [Broker] ──┘

Product Search Service:
Materialized view = {product_id, name, price, availability, avg_rating, thumbnail_url}
→ Search query chỉ cần 1 service, 1 DB, fast!
```

**Flash Sale (Traffic Spike):**
```
Flash Sale: 10,000 users mua 100 sản phẩm trong 1 phút

Inventory Service:
- Key-Value Store (Redis): Rất fast for counter operations
- Atomic decrement: inventory_count--
- Nếu count < 0 → reject order

Orders:
- Message Broker buffer orders
- Process sau khi sale xong
→ Không cần over-provision servers
```

**Global Scale:**
```
GSLB → Route user đến datacenter gần nhất
Multi-region deployment:
  US-East (primary) + EU-West + APAC
CDN:
  Product thumbnails, images, static assets
  → Serve từ edge servers → Fast globally
```

---

## System Design Interview Tips

### 1. Clarify trước khi design

```
"Trước khi bắt đầu, tôi muốn clarify một số điểm:
- Scale target: bao nhiêu users? DAU?
- Consistency requirements: real-time hay eventual ok?
- Read/write ratio?
- Budget/team constraints?"
```

### 2. Start with Functional Architecture

```
Step 1: Identify services (không cần scale yet)
Step 2: Define data flows giữa services
Step 3: Define data models/schemas
```

### 3. Explicit Trade-offs

```
"Tôi sẽ chọn availability over consistency ở đây vì...
 Trade-off là user có thể thấy stale data trong X phút"

"Tôi dùng NoSQL ở đây vì flexible schema cần thiết,
 nhưng trade-off là không có ACID transactions"
```

### 4. Bottleneck Identification

```
Identify bottlenecks:
- Database với high read traffic → Read replicas + Cache
- Service với high compute → Horizontal scale + LB
- External API calls → Async với Message Broker
- Global latency → CDN + Multi-region
```

## Tóm tắt quy trình

```
System Design Process:

1. Requirements
   ├── Functional: Use cases, user flows, API
   ├── Non-functional: Quality attributes (perf, scale, availability)
   └── Constraints: Tech, business, legal

2. API Design (REST)
   ├── Entities → URIs
   ├── Representations (JSON)
   └── HTTP Methods

3. Functional Architecture
   ├── Identify services
   ├── Define data stores per service
   └── Map API calls to services

4. Non-functional Refinement
   ├── Load Balancers
   ├── DB Replication + Sharding
   ├── Caching (Redis, CDN)
   ├── Message Brokers (async, spike buffering)
   └── CQRS/Event-Driven patterns
```
