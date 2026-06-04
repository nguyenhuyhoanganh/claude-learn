# Bài 5: Ride Sharing — Geohash + Geospatial Indexing

Cuối cùng giải bài toán "find drivers within 1km of rider in O(few) instead of O(N)". **Geohash** chia Earth thành grid cells, mỗi cell có ID dạng base-32 string. Query "nearby drivers" trở thành "drivers in these few cells" — index-able, shardable, fast. Đây là technique Uber, Lyft, food delivery apps **tất cả đều dùng**. Master geohash = master geospatial systems.

## Problem statement

```text
[Setup]
- Rider requests ride at (lat, lng)
- 200K active drivers each at their (lat, lng)
- Find drivers within 1km radius
- Sub-second response time

[Naive approach]
For each of 200K drivers:
  Compute haversine distance between driver and rider
  If < 1km: include

Complexity: O(N) where N = total drivers
Time: ~200ms with 200K drivers (just computation)
Multiplied by concurrent matches: doesn't scale.
```

## Why haversine math is slow

```text
[Earth = sphere approximation]

distance = R * arccos(
  sin(lat1) * sin(lat2) +
  cos(lat1) * cos(lat2) * cos(lng2 - lng1)
)

Where R = Earth's radius (6371 km)

Operations:
- 4 trigonometric functions (sin, cos, arccos)
- 3-5 floating-point multiplications
- 1-2 floating-point additions
- Floating-point math is SLOW for CPUs

Per computation: ~5-10 microseconds
For 200K drivers: 1-2 seconds per match (single-threaded)

→ Unacceptable for 10s P99 match latency at scale.
```

## Why floating-point indexing doesn't work

```text
[Idea: B-tree index on lat, lng?]
- B-tree is 1D sorted
- Lat + lng = 2D problem
- Range query on lat alone: too broad
- Composite index (lat, lng): same problem (sorted by lat first)

[Better: Spatial indexes (R-tree)?]
- R-tree handles 2D natively
- But: drivers update locations every 5-10s
- R-tree rebuild costly on updates

→ Need different approach.
```

## Geohash insight

```text
[Idea]
Divide Earth into grid cells.
Each cell has unique ID (string).
Driver's location → which cell.
Index by cell ID (simple string).

To find nearby:
- Find rider's cell + adjacent cells (~3-9 cells)
- Query DB: drivers in these cells
- Compute haversine only on subset (few hundred drivers)
- Filter by exact 1km
```

## Geohash algorithm

```text
[Top level]
Earth divided into 32 rectangles.
Each labeled with single base-32 character (0-9, b-z minus a/i/l/o).

Approximate sizes at top level:
- Each cell ~5000 × 5000 km

[Recursive subdivision]
Each cell can be divided into 32 sub-cells.
Sub-cell labeled by appending one more char.

Cell "9q" = "9" then sub-cell "q"
"9q" represents area of ~600 × 600 km

[Continue]
"9q8" → 150 × 150 km
"9q8y" → 20 × 20 km
"9q8yy" → 5 × 5 km
"9q8yy0" → ~1.2 × 0.6 km    ← perfect for us!
"9q8yy0u" → ~150 × 75 m
```

### Precision picker for us

```text
[Goal]
1km radius search → cell size ~1km

[6-char geohash]
Cell ~1.2 × 0.6 km
Globally: ~32^6 = 1 billion cells
Each driver location → 6-char string

[Examples (real coordinates)]
San Francisco (37.7749, -122.4194):
geohash = "9q8yy"  (5 char, ~5km)
geohash = "9q8yy0" (6 char, ~1km)
geohash = "9q8yy0u" (7 char, ~150m)

[Adaptive]
Dense urban: use 7+ chars (smaller cells)
Rural: 5-char enough (rare drivers, larger search)
```

## How geohash encoded

```text
[Bit interleaving — simplified]
Split lat range [-90, 90] in halves recursively:
- North half = 1, south = 0
- For each bit, choose half rider is in

Split lng range [-180, 180] in halves recursively:
- East half = 1, west = 0

Interleave the bits: lng bit, lat bit, lng bit, lat bit, ...
Group every 5 bits into base-32 char.

Result: hierarchical string where shared prefix = shared region.
```

### Property: Shared prefix = shared region

```text
[Examples]
"9q8yy" and "9q8yz" share prefix "9q8y" → same 4-cell area
"9q8yy" and "9q8y0" share "9q8y" → same 4-cell area
"9q8yy" and "9q9xx" share "9q" → same 600km region
"9q" and "0r" share nothing → opposite sides of Earth

[Implication]
Find "drivers near rider":
- Compute rider's 6-char geohash
- Query for drivers with same 6-char prefix (or compute neighbors)
- All matched drivers are in same ~1km cell
```

## Edge case: boundary problem

```text
[Problem]
Rider at center of cell "9q8yy0" — nearby drivers in same cell ✓
Rider near cell boundary — driver 100m away in cell "9q8yy1" missed!

[Solution: include 8 neighbor cells]
Rider's cell = center cell
Plus: north, south, east, west, NE, NW, SE, SW (8 neighbors)

Query: drivers in any of these 9 cells
Then filter exact 1km with haversine on small subset.

[Computing neighbors]
Geohash library provides API:
  neighbors("9q8yy0") → ["9q8yy1", "9q8yy2", "9q8yyf", ...]
```

## DB schema with geohash

```text
[Old]
driver_locations:
  driver_id PK, lat, lng, last_update

Query: WHERE 1km_haversine(lat, lng, rider_lat, rider_lng) < 1
→ Full table scan + math per row

[New]
driver_locations:
  driver_id PK, lat, lng, geohash (indexed), last_update

Index: BTREE on geohash column

Query: WHERE geohash IN ('9q8yy0', '9q8yy1', '9q8yy2', ...)
→ Index seek, return small set
→ Haversine only on that small set
```

### Why this is fast

```text
[Index seek]
- BTREE: O(log N) lookup per geohash
- 9 cells: 9 × O(log 200K) = ~17 ops × 9 = 150 ops
- Result: ~10 drivers per cell × 9 = 90 candidates

[Haversine on 90 drivers]
- 90 × 10 microsec = ~1ms

[Total]
- ~5ms instead of 1000ms
- 200x speedup
```

## Sharding by geohash

Bonus: geohash is great shard key.

```text
[Strategy]
Hash geohash → shard

[Pro]
- Drivers in same area → same shard
- Query naturally hits 1 shard most of the time
- Adjacent cells share prefix → likely same shard
- Cross-shard query rare (city border edge cases)

[Anti-hotspot]
Hash on geohash (not just prefix) → uniform shard distribution
Hot regions (cities) get spread across all shards by hash.
```

## Update workflow

```text
[Every 5s, driver sends location update]
Driver → Driver Service (WS): {lat, lng}
Driver Service → Kafka "driver.location": event {driver_id, lat, lng, ts}

Location Service consumer:
1. Receive event
2. Compute geohash (server-side library)
3. UPDATE driver_locations SET lat=?, lng=?, geohash=?, last_update=? WHERE driver_id=?

Cost: ~1ms per update
At 20K updates/sec → manageable
```

### Geohash rarely changes during update

```text
[Insight]
- Driver moving at 60 mph = 27 m/s
- Cell size ~1km
- Cell boundary cross: every ~37 seconds on average

[Optimization]
Don't recompute index unless geohash changes:
- Driver Service caches last computed geohash
- Only UPDATE geohash column if changed
- Cheaper writes for stationary or slow drivers
```

## Matching flow updated

```text
[Rider requests ride at (lat=37.77, lng=-122.42)]

Matching Service:
1. Compute rider's geohash: "9q8yy0"
2. Get 8 neighbors: ["9q8yy1", "9q8yyb", ...]
3. Query Location Service:
   "drivers in cells [9q8yy0, 9q8yy1, ...] WHERE state = 'available'"
4. Returns ~50-200 candidate drivers (depends on density)
5. For each: compute haversine to verify within 1km
6. Filter to drivers actually within 1km: ~20-100 drivers
7. Call external ETA API for these:
   batch: pairs of (rider, driver_lat_lng)
   returns ETAs traffic-aware
8. Pick best: shortest ETA + tiebreakers
9. Match
```

Total time: typically 1-3 seconds (mostly external ETA call).

## Alternative geospatial techniques

```text
[S2 (Google)]
- Sphere covering with hierarchical cells
- More accurate (handles spherical geometry better)
- Tencent, Foursquare use
- More complex than geohash

[H3 (Uber's own)]
- Hexagonal cells
- Uniform area (square cells distorted near poles)
- Better for uniform analytics
- Open source

[QuadTree]
- Recursive 2D partitioning
- Good for highly uneven density
- Cassandra ES use variants

[For this design — Geohash]
- Simple, widely supported
- Public domain (free)
- Built into Redis (GEO commands), PostGIS, MongoDB
- Good enough for ride matching
```

## NFR verification

| Requirement | Solution | Status |
|---|---|---|
| Match P50 < 5s | Geohash query + ETA call | ✓ |
| Match P99 < 10s | Same + degraded gracefully | ✓ |
| 1.7B location updates/day | Kafka + only-changed-write | ✓ |
| 1M+ users | Sharded everywhere | ✓ |
| 99.99% availability | Multi-region + replication | ✓ |
| Login < 100ms error | Bloom filter (bài 4) | ✓ |

## Recap of all 5 bài for ride sharing

```text
[Bài 1] Requirements + state diagram
- Scope locked, NFRs defined
- Driver state machine documented

[Bài 2] 7 services architecture
- Driver/Rider Service stateful WS
- Location Service separate for geospatial
- Matching Service stateless business logic

[Bài 3] Post-trip choreography
- 4 services event-driven chain
- Event sourcing for map (Kafka replay)
- Trip → Payment + Map → Notification

[Bài 4] Stateful scaling + Bloom Filter
- Connection Manager for stateful routing
- Bloom Filter for sub-100ms login error
- DB sharding + multi-region

[Bài 5] Geohash for nearby search
- 6-char geohash ~1km cell
- Index by geohash → fast lookup
- 8 neighbor cells for boundary
- 200x speedup over haversine scan
```

## Bẫy thường gặp với geohash

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Search only rider's cell | Miss boundary drivers | Include 8 neighbors |
| Hardcode 6-char | Wrong precision for area | Adaptive by density |
| Single shard hot in city | Performance | Hash geohash for shard |
| Recompute geohash every update | Wasted writes | Only when changed |
| Geohash = exact distance | False! | Always re-verify haversine |
| Forget timezone in coordinates | Bug | UTC + decimal degrees consistent |
| Custom geohash impl | Bugs | Use library (geohashed, redis GEO) |

## Lessons across phase 12

```text
1. State diagram for entities with multi-state lifecycle
2. Stateful services need explicit routing (Connection Manager)
3. Bloom filter for fast rejection at low memory cost
4. Geohash transforms O(N) spatial → O(log N) + small subset
5. Choreography decouples post-event workflows
6. Event sourcing enables replay for derived data (maps)
7. External services for ETA, payment, banking
8. Per-service C/A tuning + sharding strategy
9. Real-time + batch in same system (live match + offline payment)
10. WebSocket + Kafka + KV combo for stateful + scaling
```

## Tóm tắt bài 5

- **Geohash**: divides Earth into hierarchical base-32 grid.
- 6-char geohash = ~1km cell, perfect for ride matching.
- Shared prefix = shared region (hierarchical property).
- Search: rider's cell + 8 neighbors → DB index seek (10ms vs 1000ms).
- Re-verify with haversine on small subset for exactness.
- Geohash also great shard key (with hash to avoid hotspot).
- Only update DB index when geohash changes (rare per driver).
- Alternatives: S2 (Google), H3 (Uber), QuadTree.

🎉 **Phase 12 complete** — Uber-scale ride sharing. Phase 13 ends course with system design interview final tips.

**Bài kế tiếp** → [Phase 13 - Bài 1: System Design Interview Tips](../phase-13-final-tips/01-interview-tips.md)
