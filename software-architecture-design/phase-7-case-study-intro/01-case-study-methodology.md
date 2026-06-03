# Bài 1: Methodology — Cách tiếp cận mọi system design problem

Phase 1-6 đã dạy lý thuyết: requirements, quality attributes, API design, infrastructure (DNS, LB, CDN, message broker), database, architecture pattern. **Phase 7-13 áp dụng tất cả** vào các real-world systems: Instagram-like image sharing, Netflix-like VOD, WhatsApp-like messaging, Google typeahead, Uber-like ride sharing. Nhưng trước khi nhảy vào case studies, bài này **lock 3 mindset + 5-step process** mà bạn sẽ dùng cho **mọi** design problem suốt phần còn lại.

## 3 mindsets của software architect

### Mindset 1: Abstraction

Khi nấu ăn, bạn nghĩ nguyên liệu + tỉ lệ, không phải cấu trúc phân tử của muối. Khi lái xe, bạn dùng vô lăng, không cần hiểu engine combustion mỗi giây. Software architecture cũng vậy.

```text
[Sai — quá deep]
"Tôi sẽ thiết kế Instagram bằng chọn protocol TCP vs UDP cho upload,
optimize từng byte trong HTTP/2 frame, tune kernel parameters..."
→ Mất tuần đầu trong rabbit hole, không bao giờ tới được API design.

[Đúng — appropriate abstraction]
"User upload image → API gateway → Storage service → S3 → CDN.
Latency target P99 < 500ms. Throughput 10K upload/sec."
→ Big picture rõ. Detail có thể đào sâu KHI cần.
```

**Quy luật**: stay at system level. Chỉ đi xuống level chi tiết khi bottleneck cụ thể đòi.

### Mindset 2: Every system is unique

```text
[Anti-pattern]
"Instagram dùng <stack X>, vậy tôi cũng dùng <stack X> cho mọi photo app."

[Reality]
- Instagram: 2B users, viral content, hashtag-driven discovery
- Pinterest: 500M users, board-based curation
- Unsplash: 5M creators, license-focused, search-heavy
- Behance: 30M users, portfolio-grade quality, slower

→ 4 image platforms — 4 architecture rất khác.
   Requirement nhỏ thay đổi → architecture thay đổi lớn.
```

**Quy luật**: không có "the right stack". Stack phụ thuộc requirements.

Patterns thì reusable (REST, message broker, CDN, sharding). Solutions thì không.

### Mindset 3: No single correct answer

```text
[Programming]
- Có unit test verify đúng/sai
- Algorithm có proof complexity tối ưu

[System design]
- Bad solution: SPOF khắp nơi, latency cao, không scale
- Good solution: handle requirements, không over-engineered
- Better solution: handle requirements + một future scenario
- Multiple equally good: trade-off khác nhau

→ Không có "the optimal". Chỉ có "the best given THIS context".
```

**Quy luật**: trade-offs are everything. Show 2-3 alternatives khi present.

## 5-step design process

```text
┌──────────────────────────────────────┐
│ Bước 1: Functional requirements      │ ← WHAT (features)
│         (clarify scope, ask Q)       │
└──────────────────────────────────────┘
                  ↓
┌──────────────────────────────────────┐
│ Bước 2: Non-functional requirements  │ ← HOW WELL (quality)
│         (scale, latency, availability)│
└──────────────────────────────────────┘
                  ↓
┌──────────────────────────────────────┐
│ Bước 3: API + sequence diagram       │ ← INTERFACE (black box)
│         (define interactions)         │
└──────────────────────────────────────┘
                  ↓
┌──────────────────────────────────────┐
│ Bước 4: High-level architecture      │ ← STRUCTURE (white box)
│         (address functional)          │
└──────────────────────────────────────┘
                  ↓
┌──────────────────────────────────────┐
│ Bước 5: Optimize for NFRs            │ ← REFINEMENT (production)
│         (scale, HA, perf)            │
└──────────────────────────────────────┘
```

3 bước đầu = define **bên ngoài** (black box). 2 bước cuối = fill **bên trong** (white box).

## Step 1: Functional requirements (FR)

Vấn đề: requirements ban đầu **luôn mơ hồ**.

```text
[Client]: "Design Instagram"

[You — junior]: [start coding]

[You — senior]: "Cho tôi hỏi:
- Chỉ photo hay cả video?
- Public hay private only?
- Chỉ posting hay cũng có Stories/Reels?
- Search có cần? Hashtag?
- Direct messaging?
- Notifications?
- Web + mobile hay chỉ mobile?
- Đã có auth service chưa hay phải thiết kế?"
```

**Output bước 1**: list features ngắn gọn, scoped.

Ví dụ Instagram:
- ✅ User upload image với caption
- ✅ Feed hiển thị posts từ users đã follow
- ✅ Like + comment
- ❌ (out of scope) Stories
- ❌ (out of scope) Direct messages
- ❌ (out of scope) Search by hashtag (initial release)

Critical: **xác định out-of-scope** rõ ràng. Tránh scope creep.

## Step 2: Non-functional requirements (NFR)

Phase 1 đã dạy quality attributes. Đây là lúc **apply**.

```text
[Câu hỏi cần answer]
- Bao nhiêu user? (10K / 1M / 1B)
- Geographic distribution?
- Read/write ratio? (Instagram: 100:1)
- Peak QPS?
- Latency target? (P50, P99)
- Data size growth/year?
- Availability SLA? (99.9% / 99.99%)
- Eventually consistent OK hay strong required?
```

Ví dụ Instagram NFR:
- 500M DAU, 50% từ Asia
- Read:Write = 200:1 (feed scroll vs upload)
- Peak: 50K image upload/sec, 10M feed request/sec
- Latency: feed load P99 < 300ms; upload P99 < 2s
- Storage growth: 100TB/day
- Availability: 99.95% (~4 hours downtime/year)
- Eventually consistent feed OK (5-min lag acceptable)

→ Numbers drive everything: sharding strategy, cache size, CDN choice, DB tech.

## Step 3: API + Sequence diagram

Sau khi biết WHAT (features) + HOW WELL (scale), define INTERFACE.

```text
[Sequence diagram cho "upload image"]

User       Mobile App      API Gateway     Upload Svc    S3        Feed Svc
 │              │                │              │           │            │
 │── tap ─────→ │                │              │           │            │
 │              │── POST /upload→│              │           │            │
 │              │  (image bytes) │              │           │            │
 │              │                │── validate ─→│           │            │
 │              │                │              │── PUT ───→│            │
 │              │                │              │← url ─────│            │
 │              │                │              │── publish "post.created" ───→
 │              │                │              │           │            │
 │              │                │← 201 + url ──│           │            │
 │              │← 201 ──────────│              │           │            │
 │← show preview │                │              │           │            │
```

Mỗi arrow → 1 method trong API:
- `POST /api/v1/posts` body image + caption → 201 Created with post_id
- `GET /api/v1/feed?cursor=X&limit=20` → list of posts

Sequence diagram **buộc bạn nghĩ end-to-end**: từ tap → bytes → DB → CDN → display.

## Step 4: High-level architecture (HLA)

Match diagram boxes với features.

```text
[Instagram HLA — version 1]
                ┌──────────┐
[Mobile App] ──→│ API GW   │──→ ┌──────────┐
                │ (REST)   │    │ Upload   │──→ S3
                └──────────┘    │ Service  │
                       ↓        └──────────┘
                ┌──────────┐         ↓
                │ Feed     │←── Kafka topic "post.created"
                │ Service  │
                └──────────┘
                       ↑
                ┌──────────┐
                │ Postgres │ (users, posts metadata)
                └──────────┘
```

Focus: **functionality first**. Not yet worry về scale.

## Step 5: Optimize for NFRs

Apply phase 2-5 knowledge:
- 500M DAU → shard Postgres by `user_id`
- Hot users problem → consistent hashing
- 100TB/day → S3 + CloudFront CDN (cache hot images)
- Feed read 10M QPS → Redis cache per user (hot feed pre-computed)
- Single point of failure → multi-region active-active
- Trending photos overwhelm DB → write-back cache

→ Architecture evolves. Some components split, others added.

## Tại sao process này hoạt động

```text
[Without process]
- Jump straight to "use Cassandra"
- Forget HA → SPOF discovered late
- Forget scale → DB explodes at launch
- Forget edge cases → bugs in production

[With process]
- Each step builds on prev
- NFRs drive optimization decisions
- API documented before code
- Trade-offs explicit
```

Đây là process **bigger tech companies dùng** cho design reviews. Đây cũng là process FAANG **system design interview** đánh giá.

## Cách dùng phase 7-13

Mỗi case study (image sharing, VOD, messaging, typeahead, ride sharing) sẽ chia 3-5 bài, **mỗi bài 1-2 step của process**:

```text
[Pattern Phase 8 - Image Sharing]
- Bài 1: Step 1+2 (FR + NFR)
- Bài 2: Step 3+4 (API + HLA)
- Bài 3: Step 5 (Optimize)

[Pattern Phase 9 - VOD]
- Bài 1: Step 1+2
- Bài 2: Step 3+4
- Bài 3: Step 5
```

→ Bạn sẽ **practice 5-step process 5 lần** với 5 problem khác nhau. Sau Phase 13, process này thành reflex.

## Trade-offs explicit

Mỗi case study sẽ raise:

```text
[Sample trade-off questions]
- Strong consistency vs eventual?
  → Instagram likes: eventual OK
  → Bank balance: strong required

- SQL vs NoSQL?
  → User profile: SQL (joins, transactions)
  → Feed timeline: NoSQL (denormalized, scale)

- Push vs pull feed?
  → Twitter celebrity (1M followers): pull
  → Friend feed (200 friends): push

- Latency vs availability?
  → Video streaming: prefer availability
  → Stock trading: prefer latency
```

Senior engineer **biết** trade-offs này. Junior **chọn** mặc định không biết hậu quả.

## Tips trước khi bắt đầu

```text
✓ Đọc kỹ requirements, không assume
✓ Hỏi clarifying questions (5-10 questions OK ở step 1)
✓ Write numbers down (back-of-envelope calc)
✓ Multi-step diagram trước code logic
✓ State assumptions rõ ràng
✓ Discuss trade-offs khi pick technology

✗ Đừng skip step 1+2 nhảy thẳng tech stack
✗ Đừng vẽ architecture trước khi có FR
✗ Đừng dùng "I'll use Kafka" without justify why
✗ Đừng over-engineer cho 100 user
✗ Đừng under-engineer cho 1B user
```

## Tóm tắt bài 1

- **3 mindsets**: abstraction (stay at right level), uniqueness (no copy-paste), no single correct answer (trade-offs).
- **5-step process**: FR → NFR → API+sequence → HLA → Optimize.
- 3 steps đầu define **bên ngoài** (black box). 2 steps cuối fill **bên trong**.
- FR step: clarifying questions, scope, in/out features.
- NFR step: numbers (DAU, QPS, latency, storage, availability).
- API step: sequence diagram → method signatures.
- HLA step: components match features, functionality first.
- Optimize step: address NFRs (scale, HA, perf).
- Phase 7-13 = practice process 5 lần với 5 case studies khác nhau.
- Trade-offs always explicit.

**Bài kế tiếp** → [Phase 8 - Bài 1: Image Sharing — Functional + Non-functional requirements](../phase-8-image-sharing/01-requirements.md)
