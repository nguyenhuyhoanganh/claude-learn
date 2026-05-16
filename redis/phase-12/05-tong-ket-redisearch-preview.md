# Bài 5: Tổng kết phase-12 + RediSearch preview

Bài cuối phase-12. Tổng kết khi nào dùng pipeline, SORT, hoặc RediSearch. Đây là bước "view from 10000 feet" về các options query data trong Redis — quyết định strategy quan trọng cho mọi app.

## Decision tree: query strategy

```text
                "Cần fetch entities theo criteria nào đó"
                              │
                              ▼
        ┌─────────────────────┴─────────────────────┐
        │                                           │
   Đã biết IDs                              Không biết IDs (filter/search)
        │                                           │
        ▼                                           ▼
   Pipeline                              ┌─────────┴──────────┐
   HGETALL                               │                    │
                                  Single criteria         Multi criteria
                                  (top N by 1 field)      / full-text search
                                         │                    │
                                         ▼                    ▼
                                  Sorted Set +           RediSearch
                                  ZRANGE                  (phase-18)
                                         │
                                         ▼
                                  Pipeline HGETALL
                                  (hoặc SORT)
```

### Case 1: Biết IDs trước

Vd: dashboard hiển thị items đã chọn, profile của followers cụ thể.

**Use**: Pipeline HGETALL.

```ts
const items = await Promise.all(ids.map((id) => client.hGetAll(itemKey(id))));
```

### Case 2: Filter theo 1 criteria (single sort)

Vd: top viewed, top expensive, recent posts.

**Use**: Sorted Set với appropriate score → ZRANGE + pipeline.

```ts
const ids = await client.zRange('items:views', 0, 19, { REV: true });
const items = await getItems(ids);
```

### Case 3: Filter theo nhiều criteria (faceted)

Vd: "items có tag X AND price 100-500 AND owner trong group Y".

**Use**: **RediSearch** (phase-18). Set operations chỉ làm được exact match, không range + multi-field.

```text
FT.SEARCH items_idx "@tags:{vintage} @price:[100 500]"
```

### Case 4: Full-text search

Vd: "items chứa từ 'piano'".

**Use**: **RediSearch**. Set/Sorted Set không hỗ trợ.

```text
FT.SEARCH items_idx "piano"
```

## Khi nào KHÔNG đủ với pipeline/Sorted Set?

3 dấu hiệu chuyển sang RediSearch:

1. **Query có nhiều filter criteria** kết hợp (AND/OR).
2. **Cần range query trên nhiều field** đồng thời (vd price 100-500 AND views > 1000).
3. **Cần full-text search** (substring, fuzzy match, prefix).

App RB đến giờ chỉ dùng case 1-2. RediSearch sẽ vào ở phase-18 cho **search bar**.

## Phân loại operations đã học

| Operation | Lệnh | Use case |
|---|---|---|
| Lookup theo key | HGETALL, GET | Profile, item detail |
| Lookup nhiều key | Pipeline HGETALL/HGET | List view |
| Top N by score | ZRANGE REV LIMIT | Leaderboard, carousel |
| Range theo score | ZRANGE BYSCORE | Time-based feed |
| Membership check | SISMEMBER | Liked? Banned? |
| Count unique | SCARD | Like count, view count (unique) |
| Set operations | SUNION/SINTER/SDIFF | Common likes, mutual friends |
| Counter atomic | INCR, HINCRBY, ZINCRBY | Views, balance |
| Sort + join (legacy) | SORT BY GET | Pre-cluster era code |
| Full-text + multi-filter | FT.SEARCH | Search bar (phase-18) |
| Time-series events | XADD, XREAD | Stream processing (phase-20) |

→ Bộ "công cụ" cho app Redis production. Nhớ map từ requirement → tool đúng.

## Anti-pattern reminder

Đã đề cập ở các phase trước, gom lại:

| Anti-pattern | Why bad | Fix |
|---|---|---|
| `KEYS *` ở production | Chặn O(N) | `SCAN` cursor |
| `SMEMBERS bigset` | Reply MB lớn, chặn | `SSCAN` |
| `HGETALL` trên hash 100k field | Chặn | `HSCAN` |
| N+1: loop `await getX(id)` | N RTT | Pipeline `Promise.all` |
| `SET key val` không EX cho cache | Memory leak | Luôn EX cache keys |
| Tự code `GET + +1 + SET` counter | Race | `INCR` / `HINCRBY` / `ZINCRBY` |
| `SORT` trên collection lớn | Chặn 1-5s | Sorted set + ZRANGE |
| Filter Hash field qua KEYS + HGET | Linear scan | Secondary index sorted set |
| `MULTI/EXEC` mong rollback | Không có rollback | Lua script |
| Cluster với multi-key không hash tag | CROSSSLOT error | Hash tag `{...}` |

## Patterns đã thấy

Đã nhắc rải rác, gom lại:

1. **Canonical hash + secondary index** — entity ở hash, sort index ở sorted set.
2. **Bi-directional index** — set per user + set per item cho relationship N-N.
3. **Cached counter** — số ở hash field cho fast read, set cho uniqueness check.
4. **Materialized view** — pre-compute kết quả phép toán Set/SortedSet vào key tạm với TTL.
5. **Two-step lookup** — IDs từ index → pipeline HGETALL → deserialize.
6. **Fire-and-forget** — analytics tracking không block render.
7. **Time-window via score** — sorted set với score = timestamp, ZRANGE BYSCORE.
8. **Atomic toggle** — Lua script cho like/unlike, view counter.
9. **Sliding TTL** — refresh expire on access cho session.
10. **Helper function wrapping mutation** — single source of truth cho update + sync indexes.

## Migration roadmap từ SQL sang Redis

Nếu chuyển từ SQL → Redis cho app mới:

```text
1. Liệt CRUD endpoints + queries chính (10-25 queries).
2. Mỗi query → chọn data structure (theo decision tree).
3. Vẽ key layout: hash, sets, sorted sets per entity.
4. Tính memory estimate: số entity × byte/entity × số indexes.
5. Implement: create + read first; mutations sau.
6. Test với data thật trên Redis cloud free tier.
7. Profile latency p50/p99; tune sort indexes.
8. Plan cluster nếu memory > 50% RAM mục tiêu.
```

Phase 1-3 quan trọng nhất. Sai design ban đầu = refactor toàn bộ.

## Bonus: SORT_RO + BY hash patterns nâng cao

Có pattern legacy hiếm gặp nhưng đáng biết:

```text
SORT mylist BY weight_*->priority GET pattern_*->name GET item_*->price
```

Multiple BY references là **không hỗ trợ**. Chỉ 1 BY.

Multiple GET là OK, mỗi GET dùng cùng pattern member.

`SORT_RO` (Redis 7+) — variant read-only, không có STORE. Cho permission system.

## Tóm tắt phase-12

Phase-12 đã hoàn thành:
- **2 cách load relational data**: pipeline vs SORT (Bài 1).
- **SORT step-by-step**: BY, GET, # patterns (Bài 2).
- **SORT options đầy đủ**: LIMIT, STORE, ALPHA, ASC/DESC (Bài 3).
- **SORT trong app RB**: so sánh với pipeline (Bài 4).
- **Tổng kết** + decision tree + RediSearch preview (Bài 5).

Bài học chính: SORT vẫn dạy, nhưng **production prefer pipeline hoặc RediSearch**.

**Phase tiếp theo** (phase-13 = Section 14): **HyperLogLog** — đếm unique xấp xỉ với 12 KB cho hàng tỷ phần tử. Tối ưu memory siêu mạnh cho metrics.

→ [Phase-13 — Bài 1: HyperLogLog là gì?](../phase-13/01-hyperloglog-la-gi.md)
