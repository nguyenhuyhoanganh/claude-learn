# Bài 3: Typeahead — Step 5 (Shard Manager + Sampling + Multi-Region)

Bài 2 đã có CQRS architecture. Bài này address 3 NFR còn lại: **hot prefix problem** (everyone types "a" → one shard melts) qua shard manager với dynamic replication, **input volume reduction** qua sampling, và **multi-region** cho latency + HA. Pattern shard manager đây cực hữu ích cho mọi system với uneven load distribution.

## Problem 1: Hot prefix

```text
[Naive sharding]
hash("a") → shard 5
hash("ab") → shard 12
...

[Observation]
- Prefix "a": 100M lookups/day
- Prefix "the": 50M/day  
- Prefix "covid-19": 30M/day
- Prefix "xyz123" : 0/day

→ Shards with hot prefixes overloaded.
→ Cold shards underutilized.
→ Adding more shards (re-hash) doesn't help — same prefix still 1 shard.
```

### Solution: Dynamic replication via Shard Manager

```text
[Architecture]

Autocomplete Service
        │
        ▼
   Shard Manager      ← intelligent proxy
        │
   ┌────┴────┐
   ▼         ▼
[Shard A]  [Shard B]
 ┌─┐ ┌─┐    ┌─┐ ┌─┐ ┌─┐ ┌─┐ ┌─┐    ← hot shard B has more replicas
 │1│ │2│    │1│ │2│ │3│ │4│ │5│
 └─┘ └─┘    └─┘ └─┘ └─┘ └─┘ └─┘
```

Shard Manager responsibilities:
1. Route requests to shards
2. Monitor per-shard CPU + bandwidth
3. Dynamically add/remove replicas
4. Maintain minimum healthy node count

### How dynamic replication works

```text
[Setup]
- Each Redis instance reports metrics to Shard Manager
- Metrics: CPU %, network bytes/sec, query count
- Reported every 10 seconds

[Hot shard detection]
- Threshold: CPU > 70% sustained 1 minute
- Shard Manager: "Shard B too loaded"

[Action: provision replica]
1. Allocate new Redis instance (cloud auto-provision)
2. Initiate replication from primary
3. Wait until sync complete (~30s for full state)
4. Add to read load balancing pool
5. Hot shard load now split across more nodes

[Cooling down]
- Threshold: CPU < 30% sustained 5 minutes
- Action: remove one replica from pool
- Save cost
```

### Why not just over-provision everything?

```text
[Static high replication]
- Provision 10 replicas per shard always
- Pro: handles any spike
- Con: 90% wasted capacity for cold shards
- Cost: 10x what we need

[Dynamic per shard]
- Hot shards: 10 replicas
- Cold shards: 2 replicas (HA minimum)
- Cost: efficient
- Adapt to: time-of-day, trending events, regional traffic
```

### Trending event handling

```text
[Example: news breaks "Apple announces X"]
- Suddenly 100x QPS for prefix "apple"
- Shard hosting "apple" overloads
- Shard Manager detects in 1 minute
- Adds 5 more replicas in 1 minute
- Total response time: 2 min from event to scaled

[For ultra-fast trending]
- Pre-warm replicas during known events (Super Bowl, elections)
- Predictive scaling based on time-of-day patterns
- Override: human-trigger pre-scale
```

## Problem 2: Input volume — Sampling

```text
[Math]
- 10B queries/day → ~400M/hr
- Map function processes each → emits 28 prefixes avg
- Map output: 11B (prefix, query) pairs/hr
- Reduce input: 11B → top-10 per prefix

[Cost]
Storage during shuffle: ~TB of intermediate data
Network bandwidth: significant
Reduce CPU: significant

[But...]
We only need RELATIVE popularity. Absolute counts don't matter.
```

### Random sampling

```text
[At ingestion]
- Sample 1% of search queries randomly
- Discard 99%
- Statistical sampling preserves relative ranking

[Result]
- Input reduced 100x: 400M/hr → 4M/hr
- Map output reduced 100x
- Reduce computation 100x cheaper
- Top-10 rankings statistically identical to full data
```

### Why random sampling works

```text
[Law of large numbers]
- "how to" gets 10M searches/day → sample sees 100K
- "tutorial" gets 1M/day → sample sees 10K
- "obscure query" gets 100/day → sample sees 1

Relative order preserved. Top-10 unchanged.

[Edge case]
- Very rare queries (< 100/day) may be missed
- Acceptable: they wouldn't be in top-10 anyway
```

### Trade-offs

```text
[Pro]
- 100x compute savings
- Faster pipeline (30 min instead of hours)

[Con]
- Cannot accurately count absolute frequency
- But: not needed for autocomplete

[Tuning]
- Critical events (Super Bowl): use full data
- Daily pipeline: 1% sample OK
- For more precision: 10% sample (still 10x savings)
```

## Problem 3: Multi-region

```text
[Single region]
- Users in Asia querying US-hosted KV store
- Round-trip latency: 150-250ms
- Eats into 240ms budget completely
- → Suggestions arrive after typing

[Multi-region]
- Replicate KV store to multiple regions
- Route user to nearest region via Geo DNS
- Round-trip: 20ms (intra-region)
- Well under budget
```

### Architecture

```text
              [Geo DNS]
                  │
        ┌─────────┼─────────┐
        ▼         ▼         ▼
   [US-East]  [EU-West]  [Asia-NE]
       │          │          │
   ┌───┴───┐  ┌──┴──┐    ┌──┴──┐
   │ ALB   │  │ ALB │    │ ALB │
   └───┬───┘  └──┬──┘    └──┬──┘
       │         │           │
       ▼         ▼           ▼
   Full      Full         Full
   Autocomplete stack each region

   ▲         ▲             ▲
   │         │             │
   └────────┴─ Cross-region async sync ─┘
        (MapReduce output replicated)
```

### Sync strategy

```text
[Single MapReduce, distribute results]
- Run pipeline in 1 region (e.g. US-East)
- After CDC: replicate Redis state to other regions
- Lag: ~few minutes
- All regions serve same suggestions

[Per-region MapReduce — alternative]
- Each region runs own pipeline on its local queries
- Regional bias in suggestions (e.g. Asia sees more Asian queries)
- More complex but enables localization

→ Choose single pipeline. Localization phase 2.
```

## Service horizontal scaling

```text
[Autocomplete Service]
- 1M QPS distributed across regions
- Each region: ~300K QPS
- Each instance: ~5K QPS (lightweight handler)
- Need: 60 instances per region

[Autocomplete Updater]
- 1M QPS (every search query)
- Each instance: ~10K QPS (writes to log)
- Need: 100 instances total (across regions)
```

## Pipeline parallelism

```text
[Mappers]
- Input: 4M queries/hr (after sampling)
- Each mapper: 100K queries
- 40 mappers run parallel

[Reducers]
- Buckets: 10K
- Each reducer: 4 buckets
- 2500 reducers

[Wall clock]
- Map: ~5 minutes
- Shuffle: ~10 minutes
- Reduce: ~10 minutes
- Total: ~25 minutes (vs hours single-machine)
```

### Auto-scaling

```text
[Pipeline]
- Use managed Spark / Dataproc / EMR
- Auto-scale workers by queue depth
- Pay per minute of compute
- Idle off-hours: 0 cost

[KV store]
- Shard Manager handles
- Replicas scale to traffic
- Cluster baseline always running
```

## High availability

### Service-level

```text
[Multi-region active-active]
- Region down: GeoDNS routes to next
- Increased latency, still functional
- Each region capable of all traffic

[Redis HA]
- Master + 2 replicas per shard
- Auto-failover on master death
- Cluster mode: data continues available
```

### Pipeline HA

```text
[Pipeline failure]
- Last run failed → use previous run's results
- Stale by 2 hours instead of 1 — acceptable
- Engineer alerted, investigates

[Distributed FS failure]
- Replicated across many nodes
- HDFS / S3 multi-AZ
- Lose 1 AZ → no data loss
```

## Final architecture

```text
                    [Geo DNS]
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
    [US-East]      [EU-West]      [Asia-NE]

[Within a region:]

User → [Load Balancer] → [Autocomplete Service x N]
                              │
                              ▼
                        [Shard Manager]
                              │
                       [Redis Cluster sharded + dynamic replicas]
                              ▲
                              │ CDC stream
                              │
                       [Kafka events]
                              ▲
                              │
                       [Staging DB (results)]
                              ▲
                              │
                       [MapReduce pipeline]
                              ▲
                              │
                       [Sampling 1%]
                              ▲
                              │
                       [Distributed FS (raw queries)]
                              ▲
                              │
                       [Autocomplete Updater x N]
                              ▲
                              │ search event
                              │
                       [Search Service] (out of scope)
                              ▲
                              │
                            [User]
```

## NFR verification

| Requirement | Solution | Status |
|---|---|---|
| 1B+ queries/day | Distributed pipeline + sampling | ✓ |
| 1M QPS reads | Sharded Redis + dynamic replicas | ✓ |
| P99 < 240ms | In-mem KV + multi-region | ✓ |
| 1hr staleness | Hourly batch MapReduce | ✓ |
| Eventually consistent | Single pipeline, async replication | ✓ |
| Hot prefix | Shard Manager dynamic replication | ✓ |

## Lessons from typeahead design

```text
1. Textbook data structure (trie) ≠ scale answer
2. CQRS: read and write are different problems
3. Pre-compute when latency budget < query time
4. MapReduce: canonical pattern for batch aggregation
5. Sampling: 100x compute savings, statistically equivalent
6. Hot keys: dynamic replication > static over-provision
7. Shard manager pattern: useful across many systems
8. In-memory KV justified when SLA < disk latency
9. CDC efficient sync between staging and serving
10. Multi-region required for global sub-second
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Fixed replica count all shards | Hot melts, cold wastes | Dynamic Shard Manager |
| No sampling | 100x unnecessary compute | Sample 1% |
| Single region | Global users miss budget | Multi-region + GeoDNS |
| Full sync, not CDC | Network storm | CDC delta |
| Pipeline single machine | Doesn't scale | Distributed M/R |
| Forget normalization | Cache fragmentation | Lowercase always |
| Real-time pretense | Over-engineered | Batch + accept lag |
| Shard manager no rebalance | Eventually unbalanced | Periodic rebalance |

## Tóm tắt bài 3

- **Shard Manager**: dynamic replicas per shard based on CPU/traffic. Cost-efficient, hot-key tolerant.
- **Sampling 1%**: 100x compute savings, top-10 preserved statistically.
- **Multi-region**: GeoDNS + per-region full stack, single pipeline → global sync.
- **Pipeline parallelism**: 40 mappers + 2500 reducers, 25 min wall clock.
- **HA**: multi-region active-active, Redis cluster mode, replicated FS, fallback to previous pipeline output.
- Final SLA: P99 < 100ms typical (well under 240ms budget).

🎉 **Phase 11 complete** — Google typeahead architecture. Phase 12 vào Uber ride sharing (5-part deep dive with geospatial indexing, real-time matching).

**Bài kế tiếp** → [Phase 12 - Bài 1: Ride Sharing Requirements](../phase-12-ride-sharing/01-requirements-state.md)
