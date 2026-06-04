# Bài 2: Image Sharing — Step 3+4 (API + High-Level Architecture)

Bài 1 đã lock scope + numbers. Giờ chúng ta thiết kế **API** (Step 3) và **high-level architecture** (Step 4). Đây là phần engineering thật sự bắt đầu: từ "feature list" thành "boxes + arrows + endpoints" mà developer có thể implement. Key insight bài này: **sequence diagram → API tự nhiên**, và **materialized view pattern** giải quyết feed nhanh ở scale.

## Step 3: Sequence diagram + API

Sequence diagram ép bạn nghĩ end-to-end. Mỗi arrow giữa actor → 1 method API.

### Actors

```text
- User A — người post content
- User B — người follow A và xem feed
- System — boxes ta sắp thiết kế
```

### Flow 1: Register

```text
User A → System: GET /web/register     (load registration page)
System → User A: HTML registration form

User A → System: POST /api/v1/users
                 body: {first_name, last_name, email, username, password, profile_image_bytes}
System → System: validate username unique, hash password, upload image
System → User A: 201 Created
                 body: {user_id, auth_token}
```

### Flow 2: Login

```text
User B → System: POST /api/v1/auth/login
                 body: {username, password}
System → System: lookup user, verify password
System → User B: 200 OK
                 body: {user_id, auth_token}
```

### Flow 3: Post image

```text
User A → System: POST /api/v1/posts
                 headers: Authorization: Bearer <token>
                 body: multipart {image_bytes, caption?}
System → System: validate, upload image, create post record
System → User A: 201 Created
                 body: {post_id, image_url, created_at}
```

### Flow 4: Search user

```text
User B → System: GET /api/v1/users/search?q=alice&cursor=X&limit=20
System → User B: 200 OK
                 body: {results: [...], next_cursor: Y}
```

### Flow 5: Follow

```text
User B → System: POST /api/v1/follows
                 body: {target_user_id: A_id}
System → User B: 201 Created
```

### Flow 6: Get user profile

```text
User B → System: GET /api/v1/users/{user_id}/profile
System → User B: 200 OK
                 body: {user_id, username, name, bio, profile_url}

User B → System: GET /api/v1/users/{user_id}/posts?cursor=X&limit=20
System → User B: 200 OK
                 body: {posts: [{post_id, image_url, created_at}, ...], next_cursor}
```

### Flow 7: Get personalized feed

```text
User B → System: GET /api/v1/feed?cursor=X&limit=20
System → User B: 200 OK
                 body: {posts: [{post_id, image_url, author_id, created_at}, ...], next_cursor}
```

### API design notes

```text
✓ Versioning: /api/v1/  → can break v2 without breaking clients
✓ Pagination: cursor-based (not offset) — handles inserts during paging
✓ Auth: Bearer token in header (not query string — security)
✓ Resource naming: plural noun (/posts not /post)
✓ HTTP verbs match action: GET read, POST create, DELETE remove
✓ Limit param: cap server-side (max=100) to prevent abuse
✓ Image URL returned: client fetches directly (not proxied through API)
```

→ REST conventions phase 3 đã dạy. Áp dụng đây.

## Step 4: High-level architecture (HLA)

Thiết kế **functionality first**, NFR phase 5 mới optimize.

### Component 1: Web Application Service

```text
Role:
- Serve initial HTML (registration, login pages)
- Static assets (CSS, JS, fonts)

Why separate from API:
- Static can go through CDN
- Different scaling profile
```

### Component 2: User Service

```text
Role: manage all user-related operations
- Register
- Login
- Update profile
- Follow / unfollow

Database: NoSQL document store (MongoDB / DynamoDB)
- Why: schema fluid (optional fields growing)
- Each user = 1 document with all fields

Schema:
{
  user_id: UUID,
  username: string (indexed unique),
  first_name, last_name: string,
  email: string (indexed unique),
  password_hash: string,
  profile_image_url: string (point to object store),
  bio?, age?, location?, interests?: optional
}
```

### Component 3: Object Store

```text
Role: store binary image data
Tech: AWS S3, GCS, Azure Blob

Why NOT in database:
- DB không optimize cho binary
- DB size limits cho BLOBs (Postgres TOAST limit 1GB but slow)
- S3 designed for this: 99.999999999% durability, infinite scale

Storage layout:
- bucket/profile-images/{user_id}.jpg
- bucket/post-images/{post_id}.jpg

Returned URL: https://cdn.example.com/post-images/abc-123.jpg
```

### Component 4: Post Service

```text
Role: manage posts
- Create post
- Get user's posts (paginated)

Database: SQL (Postgres)
- Why: schema well-defined, fits relational
- Need: query by user_id + sort by timestamp (common pattern)

Schema:
posts:
  post_id        UUID PK
  user_id        UUID FK indexed
  image_url      string
  caption        text
  post_type      enum ('image', future: 'video', 'text')
  created_at     timestamptz indexed

Indexes:
- (user_id, created_at DESC) for "get user's posts sorted"
```

→ Post_type field allows extending future without schema migration.

### Component 5: Search Service

```text
Role: text search across users

Why separate from User Service:
- Search algorithms different from CRUD
- Want elasticsearch / OpenSearch / Algolia
- Different scaling profile (search heavy on certain queries)

Tech: Elasticsearch (NoSQL inverted index)

Schema (denormalized):
{
  user_id, username, first_name, last_name,
  bio, location, profile_image_url
}

How synced from User Service:
→ CDC (Change Data Capture) pattern
→ User Service publishes "user.created" / "user.updated" events to message broker
→ Search Service consumes, updates ES index
```

### Component 6: Timeline Service (KEY INNOVATION)

```text
Role: serve pre-computed feeds (materialized view pattern)

Why separate from Post Service:
- Feed = expensive query (filter posts by followed users, sort by time)
- At 200K QPS, real-time query impossible
- Pre-compute = serve in O(1)

Database: Redis (in-memory KV store)
- Why: super-fast (μs lookup), perfect for feed reads
- Why not memcached: Redis sorted sets fit timeline data model

Data model:
KEY: timeline:{user_id}
VALUE: sorted set of {post_id, score=timestamp}
       capped at last 1000 posts

Example:
timeline:user_B = [
  (post_999, ts=1717500000),
  (post_998, ts=1717499500),
  ...
]
```

### Component 7: Message Broker

```text
Role: connect Post Service ↔ Timeline Service async

Tech: Kafka

Topic: post.created
Producer: Post Service (after insert into DB)
Consumer: Timeline Service

Event:
{
  event_id, post_id, user_id (author),
  image_url, created_at
}
```

## How "Get Feed" works now

```text
[Write path — when user posts]
1. User → POST /api/v1/posts → Post Service
2. Post Service → insert row → Postgres
3. Post Service → publish event → Kafka "post.created"
4. Post Service → 201 to user (instant)

[Async path — fanout to followers]
5. Timeline Service → consume Kafka event
6. Timeline Service → query User Service: "who follows user_A?"
7. User Service → returns list of follower IDs [B, C, D, ...]
8. Timeline Service → for each follower, push post into their Redis sorted set
   - timeline:user_B += {post_id, ts}
   - timeline:user_C += {post_id, ts}
   - timeline:user_D += {post_id, ts}
9. Trim each set to max 1000 entries

[Read path — when user opens app]
10. User B → GET /api/v1/feed → Timeline Service
11. Timeline Service → ZREVRANGE timeline:user_B 0 19 → 20 post_ids
12. Timeline Service → fetch post metadata from Post Service
13. Return JSON → User B
14. User B's app fetches images from CDN
```

→ Read path = 1 Redis call. Sub-millisecond.

### Why not real-time query?

```text
[Alternative — naive]
GET /feed:
  SELECT * FROM posts p
  WHERE p.user_id IN (
    SELECT target_user_id FROM follows WHERE follower_user_id = $user_B
  )
  ORDER BY p.created_at DESC
  LIMIT 20

[Problem at scale]
- User B follows 200 users
- Each user has 1000s posts
- Query scans massive joins
- At 200K QPS → DB melts in seconds
- Latency: 5-10s (vs SLA 1000ms)

[Materialized view]
- Pre-compute on write (rare, ~6K/sec)
- Serve on read (frequent, 200K/sec)
- Trade write complexity for read speed
```

## High-level architecture diagram

```text
                              [CDN]   ← static + post images
                                ↑
[Client]──→[Load Balancer]──→ [API Gateway]
                                  │
        ┌─────────────────┬──────┴────┬─────────────────┐
        ▼                 ▼            ▼                 ▼
   [Web App Svc]    [User Svc]    [Post Svc]      [Search Svc]
                         │             │                 │
                    [MongoDB        [Postgres      [Elasticsearch]
                     users]          posts]              ▲
                         │             │                 │
                         │             └─→ [Kafka] ──────┘
                         │                  │
                         │                  ▼
                         │            [Timeline Svc]
                         │                  │
                         │             [Redis timelines]
                         │
                    [S3 object store]   ← profile + post images
```

## Trade-offs in HLA

### Push vs Pull feed

```text
[Push — what we chose (fanout on write)]
- Write: heavy (write to N followers' timelines)
- Read: light (single Redis lookup)
- Best when: read >> write (our case 20:1)

[Pull — alternative (fanout on read)]
- Write: light (just insert post)
- Read: heavy (query all followed users)
- Best when: write >> read (rare)

[Hybrid — advanced (used by Twitter)]
- Push for normal users
- Pull for celebrities (avoid fanout to 100M followers)
- Phase 8 bài 3 addresses this
```

### Sync vs async fanout

```text
[Sync — bad]
POST /posts → write to DB → write to 200 followers' timelines → return 201
Latency: 5-30 seconds. Timeout.

[Async — good (our choice)]
POST /posts → write to DB → publish event → return 201 (50ms)
Timeline fanout happens in background.

Trade-off: user sees own post in own timeline with 1-5 sec lag.
Mitigation: client-side optimistic update (show post immediately on author's screen).
```

## What we have after Step 4

```text
✓ 6 services with clear boundaries
✓ Each service has dedicated database (database-per-service pattern)
✓ Event-driven sync via Kafka (loose coupling)
✓ Materialized view in Timeline for read speed
✓ Object store for images (not in DB)
✓ Search separate from CRUD (right tool for job)
✓ All API endpoints defined
```

→ Functionality works. Single-node version of this could run for a small startup.

**Chưa giải quyết**:
- 5B users (single MongoDB can't hold)
- 200K QPS (single Postgres dies)
- 99.99% availability (no HA yet)
- $3.1M/day bandwidth (no CDN yet)
- Celebrity fanout (1 post → 100M timelines)

→ Phase 8 bài 3 (Step 5) addresses tất cả.

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Skip sequence diagram | Miss API endpoints | Diagram first, API derives |
| One mega-service | Hard to scale parts | Database-per-service |
| Store images in DB | DB explodes | Object store + URL |
| SQL for everything | Wrong tool | Match data shape |
| Sync feed fanout | Timeout | Async via message broker |
| Real-time feed query | Won't scale | Materialized view |
| Push to all followers always | Celebrity problem | Hybrid push/pull (bài 3) |
| Forget pagination | Huge payloads | Cursor-based |

## Tóm tắt bài 2

- **Step 3** sequence diagram ép nghĩ end-to-end → API tự xuất hiện.
- API design: versioned, cursor pagination, Bearer auth, resource-noun.
- **Step 4** HLA: 6 services + object store + Kafka.
- Database-per-service pattern: User (Mongo), Post (Postgres), Search (Elasticsearch), Timeline (Redis).
- **Materialized view pattern** cho feed: pre-compute on write, serve O(1) on read.
- **Event-driven sync** giữa User ↔ Search và Post ↔ Timeline.
- Push fanout chosen vì read:write 20:1.
- Async fanout (Kafka) → upload latency 50ms thay vì 30s.
- Chưa scale: 5B users, 200K QPS, HA, CDN, celebrity — bài 3.

**Bài kế tiếp** → [Bài 3: Optimization for NFRs (Step 5)](03-optimization.md)
