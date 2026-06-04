# Bài 3: Image Sharing — Step 5 (Optimize for NFRs)

Phase 8 bài 2 đã có architecture đầy đủ functional. Nhưng chạy 1 instance mỗi service → fail ngay ở 1000 users. Bài này áp dụng phase 2-5 knowledge (scalability, HA, CDN, sharding) để biến design thành **production-grade Instagram-scale system**. Đây là phần biến senior architect khác junior: biết **WHERE** add complexity, không phải add khắp nơi.

## NFR recap

```text
Target:
- 500M DAU
- 250 TB/day storage
- 200K read QPS, 6K write QPS
- 99.99% availability
- P99 < 1000ms feed
```

3 quality attributes cần address:
1. **Scalability**
2. **Availability + Fault Tolerance**
3. **Performance**

## Optimization 1: Service horizontal scaling

```text
[Before — single instance per service]
User Service (1 box) → MongoDB (1 box)

[After — horizontal scaling]
                Load Balancer
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
   User Svc[1]  User Svc[2]  User Svc[N]
        │            │            │
        └────────────┼────────────┘
                     ▼
              MongoDB cluster (sharded)
```

Áp dụng cho **mỗi service**: Web App, User, Post, Search, Timeline.

Auto-scaling rule:
- CPU > 70% → spawn new instance
- CPU < 30% → kill instance (with grace period)
- Min instances per service per region: 3 (HA + capacity buffer)

## Optimization 2: Database sharding

### MongoDB (users) — hash sharding

```text
Shard key: user_id (hash function applied)
Why hash: uniform distribution, no hotspot

[Distribution]
- 5B users / 100 shards = 50M users/shard
- Each shard: 1 primary + 2 replicas

Why uniform UUID for user_id:
- Random uniform → balanced shards
- Sequential ID → all new users hit one shard → hotspot
```

### Postgres (posts) — range or hash sharding

```text
Option A: Hash by post_id
- Pro: uniform write distribution
- Con: query "user's posts" hits all shards (slow)

Option B: Hash by user_id
- Pro: "user's posts" → single shard
- Con: hot users overload one shard

→ Choose B with hot-user detection (push famous users posts to separate shard pool).
```

### Redis (timelines) — hash by user_id

```text
Shard key: hash(user_id)
- timeline:user_B always on same shard
- Read = single shard hop
- Easy to add shards via consistent hashing
```

### Followers collection

```text
Each row: (follower_id, target_id, follow_at)

Sharded by follower_id (hash):
- "Get all users B follows" → 1 shard, fast
- "Get all followers of A" → query all shards
  Alternative: maintain inverted index (separate followers-by-target collection)
```

## Optimization 3: Image compression pipeline

```text
[Without compression]
500M uploads/day × 5MB raw = 2.5 PB/day = $50K/day S3 cost

[With compression pipeline]

User uploads raw 5MB image
         ↓
Upload Service stores raw temporarily
         ↓
Publishes "image.uploaded" event to Kafka
         ↓
Compression Worker (async) consumes:
  - Convert HEIC → JPEG
  - Quality 85% (visually identical)
  - Resize: max 1080px width (mobile-optimal)
  - Generate thumbnails (200px, 400px, 800px)
         ↓
Stores compressed versions to S3
         ↓
Updates post record with thumbnail URLs
         ↓
Deletes original raw image (or move to cold storage)

[Result]
5MB → ~500KB compressed
Storage: 250 TB/day instead of 2.5 PB/day
10x reduction = 10x cost savings
```

→ Image quality acceptable for mobile screens (which is 95% of traffic).

## Optimization 4: API Gateway

```text
[Without API Gateway]
Mobile app code:
  POST https://users.example.com/register
  GET  https://search.example.com/users?q=alice
  GET  https://feed.example.com/timeline

[Problems]
- Client knows internal service topology
- Adding new service requires client app update
- Auth + rate limiting duplicated in each service
- CORS headache

[With API Gateway]
Mobile app:
  POST https://api.example.com/v1/users
  GET  https://api.example.com/v1/users/search?q=alice
  GET  https://api.example.com/v1/feed

API Gateway:
- Routes /users → User Service
- Routes /search → Search Service
- Routes /feed → Timeline Service
- Centralized: auth, rate limit, request logging, CORS, request transformation

[Benefits]
- Split a service? Client unaware
- Add new service? Just update routing config
- Auth check once at edge
```

## Optimization 5: High availability

### Database replication

```text
Each MongoDB shard:
  Primary (writes)
       │ replicates async
       ▼
  Secondary 1 (reads + failover)
  Secondary 2 (reads + failover)

Failover scenarios:
- Primary crashes → election → secondary promotes → ~30s downtime
- Data center crash → other region takes over
```

Each Postgres shard:
```text
Streaming replication:
  Primary
     │
     ├─→ Sync replica (same DC, immediate failover, no data loss)
     └─→ Async replica (different DC, ~1s lag, DR)
```

### Multi-region active-active

```text
[Architecture]
        Global Load Balancer (GeoDNS)
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
    [US-East]   [EU-West]   [Asia-NE]
   (full stack) (full stack) (full stack)
        │           │           │
        └───────────┴───────────┘
                    │
            Async global replication
            (eventual consistency)

User in Vietnam → routed to Asia-NE
US user → routed to US-East
Both can write, conflict resolution last-write-wins or CRDT

[Failover]
US-East outage → GLB routes US traffic to EU-West
- Increased latency (300ms vs 20ms)
- Still functional
```

### Health checks + circuit breakers

```text
[Load Balancer health check]
- GET /health on each instance every 5s
- 3 consecutive fails → remove from pool
- 3 consecutive passes → add back

[Circuit breaker between services]
- Post Service → Timeline Service
- If Timeline Service responds slow/errors:
  - Open circuit after 50% error rate
  - Fail fast (don't pile up requests)
  - Half-open after 30s to test recovery
```

## Optimization 6: CDN

```text
[Without CDN]
User in Vietnam → request image → S3 in us-east-1
Latency: 300ms (cross-Pacific)
Bandwidth cost: $0.09/GB egress

[With CDN (CloudFront)]
User in Vietnam → CloudFront edge in HCMC
                ↓ cache miss
              S3 us-east-1
                ↓ cached
              all future requests served from HCMC

Latency: 20ms (local edge)
Bandwidth cost: $0.02/GB (much cheaper edge egress)

[At our scale]
Without CDN: $3.1M/day bandwidth
With CDN (90% hit rate): $310K/day → 90% savings
```

Cache config:
```text
Images: Cache-Control: public, max-age=2592000 (30 days)
       Versioned URLs (image_url includes hash) → cache forever
HTML: max-age=300 (5 min)
API responses: not cached (dynamic)
```

## Optimization 7: Celebrity / influencer problem

```text
[Problem]
Justin Bieber has 100M followers.
Posts a photo.
Timeline Service tries: write to 100M Redis keys.
Time: hours. Locks queue. Other posts delayed.

[Solution: Hybrid push-pull]

[Step 1: Mark celebrity]
- Threshold: 1M followers = "celebrity"
- User schema add: is_celebrity boolean
- Cron job updates daily

[Step 2: Don't fanout celebrity posts]
When Timeline Service sees post.created event:
- Query User Service: is this author celebrity?
- If yes: SKIP fanout. Store in celebrity_posts:{user_id} sorted set.
- If no: regular fanout to followers' timelines.

[Step 3: At read time, merge]
GET /feed for user B:
1. Read timeline:user_B (recent posts from non-celeb users B follows)
2. Read User Svc: which celebrities does B follow? (returns small list, ~10)
3. For each celeb: read celebrity_posts:{celeb_id} (their recent posts)
4. Merge sorted lists by timestamp (k-way merge)
5. Return top 20

[Result]
- 100M follower celeb → 1 write (their celeb_posts list), not 100M writes
- User B's feed read: 1 timeline read + ~10 celeb reads = still fast
```

→ Trade-off: read becomes slightly more complex, but eliminates write hotspot.

## Optimization 8: Search optimization

```text
[Already partially solved]
Search Service has dedicated Elasticsearch cluster.

[Additional]
- Type-ahead: trie-based autocomplete (cache top queries)
- Personalized ranking: boost users you follow
- Geographic boost: boost users near you
- Fuzzy matching: "ailce" → "alice"

[ES cluster sizing]
- 5B users × ~2KB indexed = 10TB index
- ES recommends shards ~50GB each → 200 shards
- 3x replication for HA → 600 shard replicas
- Distributed across 30+ nodes
```

## Final architecture

```text
                    [Global DNS / Geo LB]
                            │
            ┌───────────────┼───────────────┐
            ▼               ▼               ▼
        [US-East]       [EU-West]       [Asia-NE]
            │               │               │
            ▼               ▼               ▼
       [Regional LB]   [Regional LB]   [Regional LB]
            │               │               │
            ▼               ▼               ▼
       [API Gateway]   [API Gateway]   [API Gateway]
            │
   ┌────────┼────────┬────────┬────────┐
   ▼        ▼        ▼        ▼        ▼
 [Web   [User    [Post    [Search [Timeline
  App]   Svc]     Svc]     Svc]    Svc]
            │        │        │        │
            ▼        ▼        ▼        ▼
       [Mongo    [Postgres [Elastic [Redis
       sharded   sharded  cluster]  sharded]
       3x repl]  3x repl]
            │        │
            ▼        ▼
       [Kafka cluster]    ←── post.created, user.updated events
            │
            ▼
       [Compression workers]
            │
            ▼
       [S3 + CloudFront CDN]   ← images globally cached
```

## NFR target review

| Requirement | Solution | Status |
|---|---|---|
| 500M DAU | Horizontal scale + sharding | ✓ |
| 250 TB/day | S3 + compression | ✓ |
| 200K read QPS | Redis cache + CDN | ✓ |
| 99.99% availability | Multi-region + replication | ✓ |
| P99 < 1000ms feed | Pre-computed timeline + CDN | ✓ |
| Bandwidth cost | CDN 90% hit rate | ✓ |
| Celebrity fanout | Hybrid push-pull | ✓ |

## Trade-offs final

```text
[Complexity]
- 10+ components, 4+ databases, multi-region
- Reality: small team can't operate this
- Solution: managed services (RDS, ElastiCache, MSK Kafka, CloudFront)

[Cost at scale]
- ~$5M/month infrastructure (rough estimate)
- ~$10M/month engineering team
- Justified by ad revenue at 500M DAU

[When NOT to build this]
- < 1M users: way over-engineered. Single Postgres + S3 + CDN enough.
- < 100K users: 1 server fine.

→ Match complexity to scale. Don't pre-optimize.
```

## Bẫy thường gặp khi optimize

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Shard everything from day 1 | Over-engineered MVP | Start single, shard when bottleneck |
| Same sharding strategy mọi DB | Wrong access pattern | Shard per access pattern |
| Push fanout cho celebrities | Write hotspot | Hybrid push-pull |
| No CDN | Bandwidth bankrupts | CDN day 1 for media |
| Sync replication everywhere | Latency cao | Async for cross-region |
| Forget circuit breaker | Cascade failure | Add to every external call |
| Auto-scale aggressive | Cost spike | Gradual + cooldown |
| Multi-region without CDC | Cross-region calls slow | Replicate data, not call |

## Tóm tắt bài 3

- **Service horizontal scaling**: each service behind LB, auto-scale by CPU.
- **Database sharding**: hash by user_id for users + timelines, by user_id for posts.
- **Image compression pipeline**: async Kafka worker, 10x storage savings.
- **API Gateway**: client decouples from internal topology, centralizes auth + rate limit.
- **Multi-region active-active**: failover via geo DNS, async replication, eventual consistency.
- **CDN**: 90% cost savings on bandwidth + 15x latency reduction.
- **Celebrity hybrid push-pull**: avoid 100M write fanout, merge at read time.
- Total architecture: 10+ components, multi-region, managed services for ops.
- Match complexity to scale — small startups don't need this.

🎉 **Phase 8 complete** — Instagram-scale image sharing platform. Phase 9 vào VOD streaming với Netflix-like challenges (storage massive, bandwidth massive, content delivery).

**Bài kế tiếp** → [Phase 9 - Bài 1: VOD Streaming — Requirements](../phase-9-vod-streaming/01-requirements.md)
