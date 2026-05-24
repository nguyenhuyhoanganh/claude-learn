# Bài 6: Tổng kết phase-14 — bước nhảy sang phần advanced

Bài cuối phase-14 và bài cuối của nhóm "core data types". Bài này tổng kết List, mở rộng decision tree cuối, và preview các topic advanced sắp tới.

## Tổng kết phase-14

Phase-14 đã cover:
- **List là gì** + so sánh array vs linked list + ít dùng hơn nghĩ (Bài 1).
- **LPUSH/RPUSH/LRANGE/LPOP/RPOP** + queue, stack pattern (Bài 2).
- **LSET/LTRIM/LINSERT/LREM/LPOS/LMOVE** — modify operations (Bài 3).
- **Use cases** + decision tree (Bài 4).
- **Bid history app RB** in action (Bài 5).

## Tổng kết 7 kiểu data types core của Redis

Sau 14 phase, ta đã học toàn bộ kiểu cốt lõi:

| # | Kiểu | Use case chính | Lệnh tiêu biểu |
|---|---|---|---|
| 1 | **String** | Cache, counter, lock | SET, GET, INCR |
| 2 | **Hash** | Object/record | HSET, HGET, HGETALL |
| 3 | **Set** | Uniqueness, membership, intersection | SADD, SISMEMBER, SINTER |
| 4 | **Sorted Set** | Ranking, time-feed, priority | ZADD, ZRANGE, ZINCRBY |
| 5 | **HyperLogLog** | Approximate unique count | PFADD, PFCOUNT |
| 6 | **Bitmap** (subtype of String) | Boolean per user, BITCOUNT | SETBIT, BITCOUNT |
| 7 | **List** | Append-only log, simple queue | LPUSH, RPUSH, LRANGE |

(Bonus, learning sau:)
| 8 | **Stream** | Event log, consumer group, replay | XADD, XREAD, XGROUP |
| 9 | **Geospatial** (sorted set wrapper) | Location query | GEOADD, GEOSEARCH |
| 10 | **JSON** (module) | Document data với nested | JSON.SET, JSON.GET |

## Decision tree cuối cùng

```text
"Tôi cần lưu cái gì?"
       │
       ▼
"Đó là single value (text/number/blob)?"
       │
   ┌───┴───┐
   │       │
  YES      NO
   │       │
   ▼       ▼
String   "Record với multiple field?"
            │
        ┌───┴───┐
        │       │
       YES      NO
        │       │
        ▼       ▼
       Hash   "Collection?"
                  │
              ┌───┴───┐
              │       │
             YES      NO
              │       │
              ▼       ▼
        "Cần thứ tự?" Stream
              │
        ┌─────┴─────┐
        │           │
       NO           YES
        │           │
        ▼           ▼
   "Trùng OK?"  "Theo score?"
        │           │
    ┌───┴───┐   ┌───┴───┐
    │       │   │       │
   YES      NO YES      NO
    │       │   │       │
    ▼       ▼   ▼       ▼
  List    Set Sorted   List
                Set    (insertion order)
```

## Performance characteristics summary

| Kiểu | ADD | GET | RANGE | MEMBERSHIP | COUNT |
|---|---|---|---|---|---|
| String | O(1) | O(1) | — | — | — |
| Hash | O(1) | O(1) | O(N) | O(1) HEXISTS | O(1) HLEN |
| Set | O(1) | — | O(N) SMEMBERS | **O(1) SISMEMBER** | O(1) SCARD |
| Sorted Set | O(log N) | O(1) ZSCORE | **O(log N + K)** | O(log N) ZRANK | O(1) ZCARD |
| List | O(1) push 2 đầu | O(N) LINDEX | O(S+N) | O(N) LPOS | O(1) LLEN |
| HLL | O(1) PFADD | — | — | — | **O(1) PFCOUNT** xấp xỉ |

→ **Sorted Set là kiểu cân bằng nhất**: O(log N) cho mọi thao tác chính. Lý do nó "dùng nhiều nhất" trong production phức tạp.

## Memory comparison (rough)

| Kiểu | Per-entity overhead | Per-element |
|---|---|---|
| String | ~50-80 byte | 0 (1 entity = 1 entry) |
| Hash (listpack, small) | ~50-80 byte | ~15-30 byte |
| Hash (hashtable, large) | ~50-80 byte | ~60-100 byte |
| Set (intset/listpack) | ~50-80 byte | ~10-30 byte |
| Set (hashtable) | ~50-80 byte | ~50-80 byte |
| Sorted Set | ~50-80 byte | ~100-150 byte |
| List (listpack/quicklist) | ~50-80 byte | ~20-50 byte |
| HLL | ~50-80 byte | 12 KB cố định toàn HLL |

→ Sorted Set tốn memory nhiều nhất. HLL cố định 12 KB → lợi cho big sets.

Quy tắc: **đo memory thực** với `MEMORY USAGE key` và `MEMORY STATS` trước khi sản xuất.

## Roadmap phase sau (15-20)

Đã làm 14/20 phase. Còn 6 phase, đa số advanced:

| Phase | Topic | Tính chất |
|---|---|---|
| 15 | More practice (Section 16) | Apply những gì đã học, fix issues của app RB |
| 16 | Lua scripting | Atomic logic server-side |
| 17 | Concurrency | MULTI/EXEC/WATCH, locks |
| 18 | RediSearch | Full-text + multi-field search |
| 19 | Search in action | Apply RediSearch cho app RB |
| 20 | Streams | Event-driven messaging, consumer groups |

→ 4 trong 6 là **advanced features** vượt khỏi core data types. App RB sau khi hết phase 20 sẽ tương đương ~70% feature của một marketplace thật.

## Skills bạn đã có sau phase-14

- ✓ Chọn data structure phù hợp cho mỗi requirement.
- ✓ Maintain bi-directional index, materialized view, secondary index.
- ✓ Hiểu trade-off memory vs query latency.
- ✓ Tránh anti-pattern: KEYS*, big SMEMBERS, N+1 query, INCR race.
- ✓ Serialize/deserialize layer cho Hash.
- ✓ Pipeline với Promise.all, transaction với multi().
- ✓ TTL strategy cho cache, session, rate limit.

## Skills phase 15-20 sẽ thêm

- Lua atomic scripting cho race-free updates.
- WATCH/MULTI/EXEC optimistic locking.
- Distributed lock với SET NX EX, RedLock awareness.
- RediSearch: index, query syntax, faceted search.
- Stream: event log, consumer group, ack/retry.
- Pub/Sub patterns.
- Memory profiling, slow log analysis.

## Tóm tắt phase-14 (cô đọng)

- List = chuỗi string có thứ tự, có duplicate, push/pop 2 đầu O(1).
- Internal: doubly linked list of listpack nodes. Random access O(N).
- **Ít dùng hơn nghĩ** trong production — Sorted Set/Stream thường tốt hơn.
- Use case OK: activity feed cap N, simple queue, append-only log, bid history.
- Anti-patterns: list >10k, LINSERT để sort, LREM 0 list lớn.

**Phase tiếp theo** (phase-15 = Section 16): **More practice with e-Commerce app** — implement chi tiết bid validation, atomic updates, transaction. Đây là phase áp dụng nặng kiến thức đã học.

→ [Phase-15 — Bài 1: More on Bids](../phase-15/01-more-on-bids.md)
