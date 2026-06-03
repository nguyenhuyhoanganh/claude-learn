# Bài 3: VOD Streaming — Step 5 (Optimize for NFRs)

Phase 9 bài 2 đã có functional architecture. Bài này áp dụng phase 2-5 knowledge để scale lên Netflix-level: signed URL ngăn bandwidth waste, CDN push model cho zero-buffering, multi-region cho 99.99% availability, transcoding parallelism cho hundreds of concurrent uploads. Insight chính: **CDN không phải feature — là core architecture decision** cho VOD.

## NFR recap

| Side | Requirement |
|---|---|
| Creators | 3 nines, processing < few hours, C > A |
| Viewers | 4 nines, P99 search < 500ms, zero buffering, A > C |
| Storage | 18 PB/year growth |
| Bandwidth | 3.4 EB/day egress |
| Concurrent | 150M simultaneous streams |

## Optimization 1: Signed URL (recap from bài 2)

```text
[Without signed URL]
Creator → API GW → Web App → reads 50GB → uploads to S3
Bandwidth: 50GB × 2 (in + out of API GW + Web App)
Memory: 50GB held in app buffers
Cost: enormous

[With signed URL]
Creator → API GW: POST /videos (small JSON)
Web App: generate signed_url (S3 IAM signed token, expires 1hr)
Creator app: PUT 50GB directly to S3 via multipart upload
            (S3 SDK splits into 5MB parts, uploads parallel)

Result:
- API GW bandwidth: ~1KB per upload
- Web App bandwidth: ~1KB per upload
- S3 handles 50GB transfer
- ~10x cost reduction on transfer
```

## Optimization 2: Service horizontal scaling

```text
[Creator-facing services]
- Web App Service: 5-10 instances (low traffic — few hundred uploads/day)
- Video Data Service: 5-10 instances
- Email Notification: 2-3 instances (very low traffic)

[Viewer-facing services]
- Search Service: 50+ instances (200K QPS)
- DRM License Server: 100+ instances (every stream needs license)

Auto-scale by:
- CPU
- Queue depth (for async workers)
- Connection count (DRM)
```

## Optimization 3: Transcoding parallelism

```text
[Problem]
Worst case: 1000 creators all upload 2hr video on same day
Each video transcoding: ~30min on 1 GPU
Sequential: 1000 × 30 = 500 hours queue depth — unacceptable

[Solution: GPU worker pool with auto-scale]
- Kafka topic "video.raw.uploaded" with N partitions
- Worker fleet (GPU instances) consume from partitions
- Auto-scale: scale workers based on consumer lag
  - Lag < 1min: 10 workers
  - Lag > 30min: 50 workers
  - Lag > 2hr: 200 workers (max budget)

[Trade-off]
GPU instances expensive ($3-10/hr each)
Spot instances for non-critical: cheaper but interruptible
Reserved capacity for baseline: predictable cost
```

### Parallelism within video

```text
For very long videos (>2hr), split into chunks:
- Split raw video into 10-min chunks
- Transcode each chunk on separate worker
- Concatenate transcoded chunks at end

[Result]
- 4hr movie: 24 chunks × 30sec each = 12min wall clock (vs 2hr sequential)
- 5-10x faster for long content
```

## Optimization 4: High availability

### Service-level

```text
- All services behind load balancer
- Min 3 instances per service per region (tolerate 1 failure)
- Health checks every 5s
- Graceful drain on shutdown
```

### Database replication

```text
[Video Data Service Postgres]
Primary
   │ synchronous
   ▼
Sync Replica (same region, immediate failover, no data loss)
   │ async
   ▼
Async Replica (other region, DR backup)
```

Why sync replica: C > A for creators means we can't lose writes.

### Multi-region

```text
[Active-active across 3 regions]
us-east-1, eu-west-1, ap-southeast-1

[Creator routing]
- Sticky session: creator's videos all go to home region
- Reduces cross-region writes

[Viewer routing]
- Geo DNS: viewer routed to nearest region
- CDN handles most traffic anyway (origin rarely hit)

[Failover scenarios]
- Region down: GeoDNS routes to next nearest
- Increased latency, but functional
```

## Optimization 5: CDN — The big one

```text
[Without CDN]
500M viewers × 6.75 GB/day = 3.4 EB/day egress
@ $0.05/GB cloud egress = $170M/day = $62B/year

→ Bankrupting. Cannot exist without CDN.
```

### Push CDN model

```text
[Pull CDN — default]
- Viewer requests segment
- CDN edge cache miss → fetches from origin
- Caches → serves cached for subsequent viewers

[Push CDN — chosen for VOD]
- Video Packaging Service publishes "video.packaged"
- CDN Distribution Service consumes
  - Pre-warm top 100 edge locations with new content
  - Especially for top creators / popular categories
- First viewer in region: already cached
- Zero cold start for popular content
```

### CDN cost optimization

```text
[Tiered CDN]
- Top 1000 videos: aggressive push to all 100+ edges
- Mid-tier 100K videos: push to top 10 edges per region
- Long-tail: pull-on-demand only

[Caching headers]
- Manifests: Cache-Control: max-age=300 (5 min)
  - Allows updating quality tiers without invalidation
- Segments: Cache-Control: max-age=31536000 (1 year)
  - Content-addressed by hash, immutable
- Thumbnails: max-age=86400 (1 day)

[Result]
- 99% cache hit rate at edge
- Origin handles only 1% of bandwidth
- Cost: ~$0.005/GB at scale (negotiated with CDN provider)
- Total: ~$2.5M/day → manageable
```

### Multi-CDN for redundancy

```text
[Single CDN — risk]
CDN provider outage = all viewers affected globally
2020 incidents: Akamai, Fastly, Cloudflare all had major outages

[Multi-CDN — Netflix actually does this]
- Push content to Akamai + CloudFront + Limelight
- DNS load balancer picks best CDN per region per minute
- Real-user monitoring informs decision
- Failover < 30 seconds

[Trade-off]
- 3x storage cost on CDN side
- But: avoids hours of outage
- Net positive for paid-tier SLA
```

## Optimization 6: Search service

```text
[Already partially solved with separate Elasticsearch]

[Additional optimizations]
- Type-ahead with trie cache for top queries
- Personalized boosting (videos viewer is likely to enjoy)
- Trending boost (recent popular)
- Demographic filtering

[ES cluster sizing]
- 50M videos × ~5KB indexed each = 250GB index
- 3x replication
- ~30 nodes
- ~100ms P99 query latency
```

## Optimization 7: Database scaling

```text
[Video Data Service Postgres]
Initial: single primary handles writes
At scale (1B videos):
- Sharding by video_id hash
- 100 shards, each ~10M videos
- Cross-shard queries rare (mostly fetch by video_id)
- "List creator's videos": shard by creator_user_id alternative,
  but trades cross-shard for hot-creator shard

→ Phase 5 sharding strategies apply.
```

## Optimization 8: Cold storage for long-tail

```text
[Insight]
Power law: top 1% videos get 80% of views
Bottom 50% of videos get < 1% of views per year

[Storage tiering]
- Top 1%: S3 Standard ($0.023/GB/month) + global CDN push
- Next 9%: S3 Standard + regional CDN
- Mid-tier: S3 IA ($0.0125/GB/month) + lazy CDN
- Long-tail: S3 Glacier Instant ($0.004/GB/month) + on-demand only

[Lifecycle automation]
- Track view count per video
- Quarterly: rebalance into tiers based on recent popularity
- New uploads start at Standard, demote over time
```

## Optimization 9: Adaptive Bitrate Streaming (recap)

```text
[Already in architecture, but emphasize impact]

Player downloads 5-quality-tier manifest:
- 240p / 480p / 720p / 1080p / 4K

Player monitors:
- Last 3 segments download time
- Buffer depth
- Network bandwidth estimate

Player decides per segment:
- If buffer < 5s: drop to lower tier
- If buffer > 20s + bandwidth growing: upgrade tier
- Hysteresis to avoid oscillation

[Result]
- Zero buffering goal achievable
- User on slow 3G: 240p, watchable
- User on fiber: 4K, beautiful
- Same video, same URL, dynamic experience
```

## Optimization 10: Consistency configuration

### Creator side: C > A

```text
[Video Data Service Postgres]
- Synchronous replication primary → sync replica
- Read from primary by default (strong consistency)
- During partition: refuse writes (consistency over availability)
- Creator sees error rather than stale data

[Result]
- Creator updates title → next page load shows new title (always)
- 99.9% uptime acceptable
```

### Viewer side: A > C

```text
[Search Service Elasticsearch]
- Eventually consistent (5-30s lag from video_data)
- During partition: serve stale results
- 99.99% uptime even with stale data

[Trade-off]
- Viewer searches "newly uploaded video" → may not appear for 30s
- Acceptable: tech indistinguishable from "still processing"
- Better than zero search results during partition
```

## Final architecture

```text
                  [Global DNS / Geo LB]
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
    [us-east-1]      [eu-west-1]      [ap-southeast-1]
   ┌──────────┐     ┌──────────┐     ┌──────────┐
   │ Regional │     │ Regional │     │ Regional │
   │ Stack    │     │ Stack    │     │ Stack    │
   └──────────┘     └──────────┘     └──────────┘
        │                 │                 │
        └─────────────────┼─────────────────┘
                          │
        Cross-region async replication


[Regional Stack detail]
              ↓ Creators
    [API Gateway + Web App]
              │
         signed URL
              ▼
        [S3 raw bucket]
              │ event
              ▼
        [Kafka video.raw.uploaded]
              │
              ▼
        [Transcoding GPU fleet]
              │
              ▼
       [S3 transcoded bucket]
              │ event
              ▼
        [Packaging + DRM]
              │
              ▼
       [S3 packaged bucket]
              │
              ├─→ event "video.packaged"
              │      │
              │      ├──→ [Video Data Service → Postgres]
              │      ├──→ [Search Service → Elasticsearch]
              │      └──→ [Email Notification]
              │
              └─→ [Multi-CDN push]
                       │
                       ▼
                  [Viewers global]
```

## NFR verification

| Requirement | Solution | Status |
|---|---|---|
| 3 nines creators | Horizontal scale + Postgres replicas | ✓ |
| 4 nines viewers | Multi-region active-active + multi-CDN | ✓ |
| 18 PB/year storage | S3 tiered + lifecycle | ✓ |
| 3.4 EB/day bandwidth | Multi-CDN + 99% hit rate | ✓ |
| 150M concurrent | CDN edges absorb all | ✓ |
| < few hours processing | GPU auto-scale + parallel chunks | ✓ |
| < 500ms search | ES + cached type-ahead | ✓ |
| Zero buffering | ABR + push CDN | ✓ |
| C > A creators | Postgres sync replica + primary reads | ✓ |
| A > C viewers | ES eventually consistent | ✓ |

## Lessons from VOD design

```text
1. Pipes-and-filters perfect for content processing workflows
2. Signed URLs save 10x bandwidth for large file uploads
3. CDN is core architecture, not afterthought
4. Multi-CDN for true HA at viewer scale
5. Storage tiering by view popularity saves millions/year
6. Async processing pipeline = scalability + observability
7. Adaptive bitrate is non-negotiable for varied networks
8. DRM required for paid content + license server design
9. Different SLA per actor type (creators vs viewers)
10. Per-service C/A tuning by access pattern
```

## Bẫy thường gặp khi optimize VOD

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Upload through API GW | Bandwidth $$$$ | Signed URL S3 multipart |
| Single CDN | Outage = global down | Multi-CDN |
| Pull CDN only | Cold start penalty | Push for popular content |
| Single storage tier | Cost dominates | Tier by view frequency |
| Single quality tier | Bad UX low bandwidth | ABR multi-tier |
| Sync transcoding | Timeout | Async Kafka |
| Long video on 1 worker | Slow processing | Chunk + parallel |
| No DRM | Piracy | Multi-platform DRM |
| Strong consistency search | Doesn't scale | A > C eventually |
| Forget license server caching | DRM bottleneck | Cache license per device |

## Tóm tắt bài 3

- **Signed URL**: direct S3 upload saves 10x bandwidth.
- **Transcoding parallelism**: GPU pool auto-scale + intra-video chunking for long content.
- **CDN as core architecture**: 99% hit rate, multi-CDN for HA.
- **Storage tiering**: top 1% on Standard, long-tail on Glacier Instant.
- **Multi-region active-active**: GeoDNS routing, async cross-region replication.
- **ABR streaming**: zero-buffering goal, dynamic quality per segment.
- **Consistency tuning**: C > A creators (Postgres sync), A > C viewers (ES eventual).
- VOD = CDN-first architecture. Without CDN, business impossible.

🎉 **Phase 9 complete** — Netflix-scale VOD platform. Phase 10 vào real-time messaging với latency budgets cực thấp (vs VOD bandwidth, messaging is latency-bound).

**Bài kế tiếp** → [Phase 10 - Bài 1: Real-Time Messaging Requirements](../phase-10-messaging/01-requirements.md)
