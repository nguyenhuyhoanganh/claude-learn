# Bài 2: Typeahead — CQRS + MapReduce Pipeline

Bài 1 đã chứng minh trie fail ở scale. Bài này build **đúng kiến trúc**: CQRS split read/write paths, MapReduce batch process billions of queries, CDC sync results vào hot KV store. Pattern này là **canonical answer** cho mọi bài "build X at Google scale" trong system design interviews.

## CQRS recap

CQRS = **Command Query Responsibility Segregation**

```text
[One model for both → trade-off both]
[Two models → optimize each independently]

Command (Write) side:
- Optimize for ingest throughput
- Complex aggregation logic
- Batch acceptable

Query (Read) side:
- Optimize for read latency
- Simple lookup
- Pre-computed results

Sync between sides:
- Via events / CDC / batch jobs
- Eventually consistent
```

For typeahead:
- **Query side** = Autocomplete Service (reads prefix → top 10)
- **Command side** = Autocomplete Updater + batch pipeline (processes queries → updates suggestions)

## Architecture overview

```text
                [Client]
                   │
                   │ types char
                   ▼
              [Load Balancer]
                   │
                   ▼
        [Autocomplete Service]      ← 240ms SLA
                   │
                   ▼
              [KV Store]            ← pre-computed top-10 per prefix
              (in-memory, sharded)
                   ▲
                   │ CDC events
                   │
        [Batch processed output]
                   ▲
                   │ MapReduce job (hourly)
                   │
        [Distributed File System]
                   ▲
                   │ tuples (query, ts)
                   │
        [Autocomplete Updater]      ← receives search queries
                   ▲
                   │
                [Client]
                   │
                   │ submits search
                   ▼
        [Real Search Engine]        (out of scope)
```

## Query side: Autocomplete Service

### Storage model

```text
KV Store schema:
  KEY: prefix string (lowercase, normalized)
  VAL: top-10 suggestion list (sorted by frequency desc)

Example entries:
  "h"   → ["how", "hello", "house", "hot", "happy", "have", "her", "his", "him", "harry"]
  "ho"  → ["house", "hot", "how", "home", "hope", "hour", "hold", "horse", "host", "hot dog"]
  "how" → ["how to", "how old", "how many", "how long", "how do", ...]
  "how t" → ["how to", "how to tie", "how to cook", "how to draw", ...]
```

### Lookup operation

```text
GET /api/v1/complete?q=ho

1. Load Balancer routes to autocomplete instance
2. Instance hashes "ho" → determines shard
3. Send request to KV store shard
4. KV lookup: prefix="ho" → return list
5. Serialize JSON
6. Return to client

Total latency:
  Network LB → service: 5ms
  Hash + routing: < 1ms
  Redis GET: 1-2ms
  Network back to client: 5-50ms
Total: ~15-70ms — well under 240ms budget
```

### Why KV store + memory?

```text
[Disk DB]
- Latency: 5-50ms per lookup
- Won't make budget after network

[Memory (Redis / Memcached)]
- Latency: < 1ms per lookup
- Required

[Cost]
- Redis ~$0.10/GB/month vs S3 $0.023/GB
- 100x more expensive — but speed required
- Many billions of prefixes × ~1KB each = ~few TB
- Yes, hundreds of TB RAM across cluster
- Cost: significant but justified by SLA
```

### KV store choice

```text
Options:
- Redis (in-memory, sortedt sets, replication)
- Memcached (simpler, cache-only)
- DynamoDB DAX (managed, integrated)
- Aerospike (multi-model, very fast)

Choose Redis for:
- Sub-ms latency
- Sharding via Redis Cluster
- Replication built-in
- Mature ecosystem
```

## Command side: Autocomplete Updater + Pipeline

### Stage 1: Collect search queries

```text
Search button clicked:
- User → /api/v1/search?q=...
- Search Service (out of scope) returns results
- Also: emit event to Autocomplete Updater

Autocomplete Updater:
- Receive (query, timestamp, user_id?)
- Append to distributed file system (HDFS / S3)
- Time-partitioned: logs/2026-06-04/14-00/queries-000.log

Storage layout:
- One log per partition per hour
- ~1B queries/day = ~1TB raw text data/day
```

→ Cheap durable storage. Process later.

### Stage 2: MapReduce pipeline

Run every 30-60 minutes.

### Stage 2a: Map

```text
Input: file containing tuples (query, timestamp)

For each tuple:
1. Check timestamp: within last 24h? If no, skip.
2. Lowercase normalize query
3. Generate all prefixes:
   "how to open" → ["h", "ho", "how", "how ", "how t", "how to", "how to ", "how to o", ...]
4. For each prefix, emit (prefix, full_query)

Example for "how to open a jar":
  ("h", "how to open a jar")
  ("ho", "how to open a jar")
  ("how", "how to open a jar")
  ...
  ("how to open a jar", "how to open a jar")
```

### Shuffle (built into MapReduce)

```text
Hash each emitted (key, value) by key.
All pairs with same key → same reducer.

After shuffle:
  reducer-1 handles prefixes hashed to bucket 1
  reducer-2 handles prefixes hashed to bucket 2
  ...
```

### Stage 2b: Reduce

```text
Input: (prefix, [list of queries that had this prefix in last 24h])

For each prefix:
1. Count frequency of each unique full_query
2. Sort by frequency descending
3. Take top 10
4. Emit (prefix, top_10_list)

Example for prefix "how to":
  Input: ["how to open a jar", "how to tie a tie", "how to open a jar", ...]
  
  Counts:
  - "how to open a jar": 50K
  - "how to tie a tie": 30K
  - "how to cook rice": 25K
  - "how to draw": 20K
  - ...
  
  Output:
  ("how to", ["how to open a jar", "how to tie a tie", "how to cook rice", ...])
```

### Stage 2c: Write to staging DB

```text
Output of reduce: huge list of (prefix, top_10_list)

Write to staging DB (could be same Redis cluster):
- Each write is INSERT or UPDATE if exists
- Comparison with old value: many entries unchanged
```

### Stage 3: CDC (Change Data Capture)

```text
Why CDC?
- Naive approach: copy all entries to Autocomplete KV store
- Most entries unchanged → wasted bandwidth + write load
- CDC publishes only changed entries

Implementation:
1. Staging DB writes go to change log
2. CDC service tails the log
3. For each change: publish event to Kafka
4. Autocomplete Service consumes events
5. Updates its KV store

Result: only delta data flows → efficient.
```

## End-to-end flow

```text
[User types "h"]
1. Client → Autocomplete Service: GET /complete?q=h
2. Autocomplete Service → Redis: GET prefix:h
3. Redis returns [how, hello, ...]
4. Client sees suggestions in <100ms

[User searches "how to open a jar"]
5. Client → Search Service: GET /search?q=...
6. Search Service: returns results (out of scope)
7. Search Service → Autocomplete Updater: log query

[Background, every hour]
8. MapReduce job reads last 24hr of queries
9. Computes top-10 per prefix
10. Writes to staging DB
11. CDC publishes diffs to Kafka
12. Autocomplete Service updates Redis

[Next user types "h"]
13. Sees fresh top-10 (up to 1hr lag from real-time)
```

## Trade-offs in this architecture

### Pre-compute everything vs lazy

```text
[Pre-compute every prefix]
- Storage: TB-scale
- Read: O(1)
- Update: batch job overhead

[Lazy compute on read]
- Storage: minimal
- Read: complex aggregation (slow)
- Update: distributed across requests

→ Pre-compute. Latency budget forces it.
```

### Single MapReduce vs streaming

```text
[Batch MapReduce]
- Process 24hr window every hour
- High throughput per query
- 1hr lag

[Streaming (Flink/Spark Streaming)]
- Process queries as they arrive
- Lower lag (seconds)
- Higher complexity, less efficient per query

→ Batch. Staleness budget allows it.
```

### Update full Redis vs CDC delta

```text
[Full sync]
Replace all KV entries from staging.
- Simple
- Massive write load
- Cache miss during sync

[CDC delta]
Only changes propagate.
- Complex (log tailing)
- Efficient
- No miss during update

→ CDC at scale.
```

## API summary

```text
[User-facing]
GET /api/v1/complete?q=<prefix>      → returns 10 suggestions
GET /api/v1/search?q=<query>         → triggers search (and logs query for analytics)

[Internal]
- Autocomplete Updater receives search events
- Logs to distributed FS
- MapReduce job processes hourly
- CDC publishes deltas to Kafka
- Autocomplete Service consumes, updates Redis
```

## What we have

```text
✓ Functional: prefix → top 10 suggestions
✓ CQRS pattern: read/write paths separate
✓ MapReduce: scales to billion queries
✓ CDC: efficient sync
✓ Eventually consistent: 1hr lag acceptable
```

What we **haven't** addressed:
- Hot prefix problem (everyone types "a" → one Redis shard melts)
- Multi-region availability
- Sampling for cost reduction
- Auto-replication for hot shards

→ Bài 3 (optimization).

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Single model for read+write | Sub-optimal both | CQRS split |
| Real-time updates | Over-engineered | Batch + accept 1hr lag |
| Disk DB for hot reads | Latency miss | In-memory KV |
| Naive full sync | Network/write storm | CDC delta |
| Forget normalization (case) | Cache miss explosion | Lowercase server-side |
| Single MapReduce machine | Doesn't scale | Distributed M/R |
| No sampling | Process unnecessary volume | Sample 1% (bài 3) |

## Tóm tắt bài 2

- **CQRS**: separate Autocomplete Service (read) from Updater + pipeline (write).
- **Storage shape**: KV store with prefix → top-10 list (denormalized, large but fast).
- **In-memory Redis** for sub-ms latency. Cost justified by 240ms SLA.
- **MapReduce pipeline**:
  - Map: query → many (prefix, query) pairs
  - Reduce: aggregate by prefix → top-10
  - Output to staging DB
- **CDC** publishes only deltas → efficient sync.
- Pre-compute pattern: trade storage for read latency.
- Eventually consistent, 1-hour staleness.

**Bài kế tiếp** → [Bài 3: Optimization — Shard Manager + Sampling](03-optimization.md)
