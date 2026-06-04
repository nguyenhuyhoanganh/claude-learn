# Bài 4: Ride Sharing — Scaling Stateful + Bloom Filter

Functional architecture done. Bài này áp dụng scaling tools cho 7 services, focus 2 challenges đặc thù: **(1)** stateful Driver/Rider Service routing — pattern messaging service reused, và **(2)** sub-100ms login error — pattern **Bloom Filter** mới. Bloom filter là tool quan trọng mọi senior architect phải biết — bài này là canonical introduction.

## Standard scaling (recap)

```text
[All HTTP services]
- Place behind load balancer
- Run as identical instance group
- Auto-scale by CPU/QPS

Users/Drivers, Payment, Trip, Matching, Notification, Map Generator, Web App
→ stateless → standard horizontal scaling
```

## Stateful service scaling (Driver + Rider Service)

Same challenge as messaging system (Phase 10).

```text
[Problem]
Driver D connected to Driver Service instance #3.
Matching Service finds match → needs to push to D.
How does it know D is on instance #3?

[Solution: Connection Manager Service]
Redis KV store:
  KEY: driver:{driver_id} → VAL: "driver-svc-3:port"
  KEY: rider:{rider_id} → VAL: "rider-svc-7:port"

TTL with heartbeat (60s).
```

### Connection lifecycle

```text
Driver opens WebSocket:
1. Connects to LB → routed to driver-svc-3
2. driver-svc-3 stores in local map
3. driver-svc-3 → Connection Manager: SET driver:{D} → driver-svc-3

Every 30s heartbeat refreshes TTL.

Driver disconnects:
1. driver-svc-3 removes from local map
2. driver-svc-3 → Connection Manager: DEL driver:{D}

If driver-svc-3 crashes:
- Heartbeat misses
- TTL expires after 60s
- Stale entry auto-removed
- Driver app reconnects, lands on different instance
```

### Message routing

```text
Matching Service decides: assign trip to driver D

1. Matching Service → Connection Manager: GET driver:{D}
2. CM returns: "driver-svc-3:port"
3. Matching Service publishes to Kafka topic partitioned by instance:
   topic "driver_messages.driver-svc-3"
   {target_driver: D, payload: trip details}
4. driver-svc-3 subscribes to its own partition
5. driver-svc-3 receives message → looks up D in local map → pushes via WS
```

Same pattern as messaging system. Battle-tested.

## Bloom Filter for fast login

### Problem revisit

```text
[Login flow]
User → Users Service → Postgres "SELECT * FROM users WHERE username=?"
  If found: verify password
  If not found: return error

[Latency]
Each Postgres query: 5-20ms
Plus network roundtrip
Total: 30-80ms

For login error case:
- 95% of mistyped usernames don't exist
- Wasted DB query
- Hit budget < 100ms target

[Goal]
Reject impossible usernames in <5ms without hitting DB.
```

### Hash table approach (rejected)

```text
[Idea]
Cache all usernames in memory: hash table.
Lookup: O(1), nanoseconds.

[Problem]
- 100M users × 30 chars/username × 2 bytes (UTF-16) = ~6GB per service instance
- × 100 service instances = 600GB total RAM
- Too expensive
- Sync to all instances when new user registers
```

### Bloom Filter — Space-efficient probabilistic structure

```text
[Concept]
- Fixed-size bit array (e.g. 10MB)
- K different hash functions (typically 3)
- Insert: hash item k times, set k bits to 1
- Query: hash item k times, check k bits
  - All k bits = 1: "MAYBE in set" (false positive possible)
  - Any bit = 0: "DEFINITELY NOT in set" (no false negative)
```

### Insert example

```text
Bit array (size 16 for example):
[0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0]
 0 1 2 3 4 5 6 7 8 9 ...

Insert "alice":
hash1("alice") % 16 = 3
hash2("alice") % 16 = 7
hash3("alice") % 16 = 12

Set bits 3, 7, 12 to 1:
[0 0 0 1 0 0 0 1 0 0 0 0 1 0 0 0]

Insert "bob":
hash1("bob") % 16 = 1
hash2("bob") % 16 = 7   ← collision with alice OK
hash3("bob") % 16 = 14

Set bits 1, 7, 14 to 1:
[0 1 0 1 0 0 0 1 0 0 0 0 1 0 1 0]
```

### Query example

```text
Query "alice":
Check bits 3, 7, 12 → all 1 → "maybe in set" → check DB

Query "charlie":
hash1("charlie") % 16 = 5
hash2("charlie") % 16 = 7
hash3("charlie") % 16 = 9
Check bits 5, 7, 9:
  Bit 5 = 0 → "definitely NOT in set" → reject immediately!
  No DB query needed.

Query "dave":
hash1("dave") % 16 = 1
hash2("dave") % 16 = 12  
hash3("dave") % 16 = 14
All three are 1 (by coincidence from alice + bob insertions)
→ "maybe in set" → check DB → DB says no → false positive
```

### False positive rate

```text
[Math]
- m = bit array size
- n = items inserted
- k = hash functions

False positive rate ≈ (1 - e^(-kn/m))^k

[Practical sizing]
For 100M users with 1% false positive rate:
- m ~ 1GB (8 billion bits)
- k = 7 hash functions
- Manageable per instance

For 10MB Bloom filter with 100M users:
- FP rate ~ 50% (too high)
- → Need larger filter

[Tuning]
1% FP rate = 99% of mistypes rejected without DB hit
99% of latency budget saved
```

### Sizing for our case

```text
[Our system]
- 100M registered users
- Want 0.1% false positive rate
- Optimal m = ~1.5GB total per filter
- Per service instance: 1.5GB RAM dedicated

[Better: distributed Bloom filter]
- Each Users/Drivers Service instance has own filter
- Sharded by username hash
- Each instance only needs filter for its shard

[Or: shared global filter]
- Redis-backed Bloom (RedisBloom module)
- All service instances query Redis
- Latency: 1-2ms (acceptable still)
```

### Why Bloom filter not just hash table

```text
[Hash table — 100M usernames]
~6GB per instance (per-string overhead)

[Bloom filter — 100M items, 0.1% FP]
~1.5GB per instance

[Bloom + DB combo]
Reject most → no DB query → < 5ms response
On false positive → DB query → 50ms but rare

→ Bloom: 4x more memory efficient + same effective latency
```

### Limitation: no deletion

```text
[Hash table]
Delete user → remove from cache → consistent

[Bloom filter]
Cannot remove bits (other entries share bits)

[Mitigation]
- Rebuild filter from scratch on instance restart
- Acceptable: deletes are rare in our system
- Or: use "counting Bloom filter" (each slot is counter, decrement on delete)
- Trade-off: more memory
```

### Maintaining the filter

```text
[On user registration]
1. Insert into users DB
2. Add username to Bloom filter
3. Publish event "user.created" 
4. Other service instances subscribe → add to their own filter

[On instance restart]
1. Query users DB for all usernames
2. Build filter from scratch
3. Takes few minutes for 100M users
4. Filter is correct (no stale deletes)
```

## DB sharding + replication (standard)

```text
[Sharding]
- Users/Drivers Service: shard by user_id hash, 100 shards
- Trip Service: shard by trip_id, 50 shards
- Location Service: shard by geohash (see bài 5)
- Payment Service: shard by transaction_id

[Replication]
Each shard:
- Primary + sync replica + async replica
- HA + read scale + DR
```

## Multi-region active-active

```text
[Geo DNS routes users to nearest region]
us-east, eu-west, ap-southeast each have full stack.

[Cross-region considerations]
- Driver location data: localized (no cross-region needed)
- User profile: replicate (user might travel)
- Trip history: local to trip's region

[Latency benefit]
User in Tokyo:
- Without multi-region: 200ms to US-East
- Multi-region: 10ms to Tokyo region
- Critical for sub-second match latency
```

## API Gateway

```text
Standard inclusion:
- Single REST entry point
- Auth check (validate JWT)
- Rate limiting (per user per endpoint)
- CORS, request transformation
- Routes to internal services
```

## Updated architecture

```text
            [Client Apps]
                  │
        ┌────────────────┐
        │                │
   HTTP REST         WebSocket
        │                │
        ▼                ▼
   [API Gateway]    [WS LB]
        │                │
   ┌────┴────┐  ┌────────┴────────┐
   ▼         ▼  ▼                 ▼
[Users  [Trip [Driver Svc x N]   [Rider Svc x N]
 Drivers Svc] (stateful + Bloom)  (stateful)
 Svc                ▲ ▲ ▲              ▲ ▲ ▲
 + Bloom filter]    │ │ │              │ │ │
        │           │ │ │              │ │ │
        ▼      ┌────┴─┴─┴──────┐  ┌────┴─┴─┴──┐
   [Postgres   │ Connection    │  │ Connection │
    sharded]   │ Manager Svc   │  │ Manager   │
               │ Redis         │  │ shared    │
               └──────┬────────┘  └───────────┘
                      │
                      └── routes msgs ──→ Kafka topics partitioned by instance
                                          │
                                          ▼
                                  [Driver/Rider Service receives + pushes via WS]
```

## What we still need

```text
[Open challenge]
Finding nearby drivers in 1km radius
- 200K drivers in Location Service DB
- Naive: compute haversine distance for each (1ms per × 200K = 200s per match!)
- Need spatial indexing

→ Bài 5 (Geohash)
```

## Bloom Filter — where else useful?

```text
[Patterns in real systems]
- Email spam filtering (Gmail uses Bloom-like)
- URL deduplication (web crawlers)
- Cache filter (Cassandra row cache lookup)
- CDN: "do we have this file?"
- Bitcoin: SPV wallet block filters
- Apache HBase: avoid disk seek for non-existent rows

Whenever:
- Set membership question
- "Probably not" is good enough for fast reject
- "Maybe" triggers expensive verification
```

## Bẫy thường gặp với Bloom filter

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Undersize filter | High FP rate, defeats purpose | Compute size from n + FP target |
| Forget false negative | Impossible — only FP exists | Don't worry, by design |
| Try to delete | Corrupts filter | Use counting Bloom or rebuild |
| Single hash function | High collision | k=3 minimum |
| Forget to add on new user | Stale → false negative | Event-driven update |
| Use Bloom for security | Probabilistic ≠ secure | Different tool |
| Mix Bloom + crypto hash | Slow | Fast non-crypto hash (Murmur) |

## Tóm tắt bài 4

- **Stateful Driver/Rider Service** scaling = same pattern as messaging: Connection Manager + Kafka per-instance topics.
- **Bloom Filter**: space-efficient probabilistic set membership.
  - K hash functions, all bits = 1 = "maybe", any 0 = "definitely no".
  - 100M users in ~1.5GB for 0.1% FP rate (vs 6GB hash table).
  - No deletion: rebuild on restart.
- Sub-100ms login error achieved: Bloom reject in <5ms.
- Standard sharding + replication + multi-region + API Gateway applied.
- Bloom filter ubiquitous: spam, dedup, cache, crawler, blockchain.

**Bài kế tiếp** → [Bài 5: Geohash — Geospatial indexing for nearby search](05-geohash.md)
