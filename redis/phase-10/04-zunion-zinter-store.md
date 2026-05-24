# Bài 4: ZUNIONSTORE/ZINTERSTORE — kết hợp nhiều sorted set

Set có UNION/INTER/DIFF. Sorted Set cũng có. Khác biệt: cần xử lý **score như thế nào** khi cùng member ở nhiều set. Bài này về 3 lệnh: `ZUNIONSTORE`, `ZINTERSTORE`, `ZDIFFSTORE` (+ versions không STORE).

## Cú pháp

```text
ZUNIONSTORE dest numkeys key1 key2 ... [WEIGHTS w1 w2 ...] [AGGREGATE SUM|MIN|MAX]
ZINTERSTORE dest numkeys key1 key2 ... [WEIGHTS w1 w2 ...] [AGGREGATE SUM|MIN|MAX]
ZDIFFSTORE  dest numkeys key1 key2 ...
```

`numkeys` = số sorted set input. Bắt buộc — khác Set commands.

## Score aggregation

Khi cùng member có ở 2+ set với score khác nhau, Redis phải quyết score nào trong kết quả.

```text
ZADD set1 10 alice 20 bob 30 charlie
ZADD set2 5  alice 100 bob 200 dave

ZUNIONSTORE result 2 set1 set2
```

Member `alice` có score 10 trong set1, 5 trong set2. Score `alice` trong `result` là gì?

3 mode:

| Mode | Score kết quả |
|---|---|
| `AGGREGATE SUM` (default) | Tổng các score (10 + 5 = 15) |
| `AGGREGATE MIN` | Score nhỏ nhất (5) |
| `AGGREGATE MAX` | Score lớn nhất (10) |

```text
ZUNIONSTORE result 2 set1 set2 AGGREGATE SUM
ZRANGE result 0 -1 WITHSCORES
1) "alice"     2) "15"
3) "bob"       4) "120"
5) "dave"      6) "200"
7) "charlie"   8) "30"
```

## WEIGHTS — nhân score trước aggregate

```text
ZUNIONSTORE result 2 set1 set2 WEIGHTS 2 1
```

Score trong set1 nhân với 2, set2 nhân với 1 trước khi aggregate.

`alice`: 10×2 + 5×1 = 25.

Use case: **weighted ranking**.

```text
ZADD recent_views 5 post#1 3 post#2
ZADD old_views    100 post#1 50 post#2

ZUNIONSTORE trending 2 recent_views old_views WEIGHTS 10 1
```

→ Recent views có trọng số 10x → post mới được đẩy lên cao hơn post cũ dù view ít hơn.

## ZINTERSTORE — intersection

```text
ZADD set1 1 a 2 b 3 c
ZADD set2 10 b 20 c 30 d

ZINTERSTORE result 2 set1 set2 AGGREGATE SUM
ZRANGE result 0 -1 WITHSCORES
1) "b"     2) "12"      # 2 + 10
3) "c"     4) "23"      # 3 + 20
```

Chỉ member có ở **mọi** set. Score = aggregate.

### Use case: ranked friends-of-friends

```text
follows:alice → [bob:1, charlie:1, david:1]
follows:bob   → [charlie:1, eve:1, frank:1]

ZINTERSTORE mutual 2 follows:alice follows:bob AGGREGATE SUM
```

→ Common friends. Có thể weighted theo "mạnh yếu" của follow relation.

### Use case: faceted search với ranking

```text
items:tag:vintage   → [item1: views, item5: views, item7: views]
items:tag:wood      → [item5: views, item7: views, item22: views]

ZINTERSTORE search:result 2 items:tag:vintage items:tag:wood AGGREGATE MAX
```

→ Items có cả 2 tag, score = views cao nhất giữa 2 ranking. Search filter + sort kết hợp.

## ZDIFFSTORE

```text
ZADD set1 1 a 2 b 3 c
ZADD set2 10 b 20 c

ZDIFFSTORE result 2 set1 set2
ZRANGE result 0 -1 WITHSCORES
1) "a"     2) "1"
```

Member có ở `set1` mà không ở set khác. Score giữ nguyên từ `set1`.

Không có WEIGHTS hay AGGREGATE — chỉ là filter.

## ZUNION/ZINTER/ZDIFF (không STORE)

Redis 6.2+ thêm version không STORE:

```text
ZUNION 2 set1 set2 WITHSCORES
ZINTER 2 set1 set2 WITHSCORES
ZDIFF  2 set1 set2 WITHSCORES
```

Trả về array thay vì lưu vào dest. Use case 1 lần.

## ZINTERCARD — chỉ đếm intersection (Redis 7+)

```text
ZINTERCARD 2 set1 set2 [LIMIT count]
(integer) 2
```

Tương đương `ZCARD (ZINTERSTORE temp ...)` nhưng không cần key tạm.

`LIMIT N` — dừng đếm khi đạt N (cho big set check ">= N common").

## Set + Sorted Set kết hợp trong STORE

**Trick mạnh**: Redis cho phép pass Set vào ZUNIONSTORE/ZINTERSTORE. Set sẽ được coi như Sorted Set với score = 1 cho mọi member.

```text
SADD vip_users alice bob charlie

ZADD purchases 100 alice 50 bob 200 david

# Intersect Sorted Set "purchases" với Set "vip_users"
ZINTERSTORE vip_purchases 2 purchases vip_users
ZRANGE vip_purchases 0 -1 WITHSCORES
1) "alice"     2) "101"     # 100 + 1
3) "bob"       4) "51"      # 50 + 1
```

→ Filter Sorted Set bằng Set membership. Vẫn giữ score (cộng thêm 1, nhỏ).

Mitigate effect "+1": dùng WEIGHTS:
```text
ZINTERSTORE vip_purchases 2 purchases vip_users WEIGHTS 1 0
```
→ Score Set nhân 0 → giữ nguyên score Sorted Set.

Đây là **cách filter rất hiệu quả** trong Redis. SQL phải JOIN; Redis 1 lệnh O(N).

## Hiệu năng

| Operation | Complexity |
|---|---|
| `ZUNIONSTORE` | O(N) + O(M log M) với N=tổng phần tử, M=phần tử kết quả |
| `ZINTERSTORE` | O(N*K) + O(M log M) với K=số set, N=phần tử set nhỏ nhất |
| `ZDIFFSTORE` | O(N) |

→ Với set 1M phần tử: ZUNIONSTORE ~100ms — chặn event loop nghiêm trọng. Phải:
- Cache kết quả với TTL.
- Pre-compute background.
- Sharding nếu cần real-time.

## Bẫy: dest bị ghi đè

```text
ZADD result 1 oldmember
ZUNIONSTORE result 2 set1 set2
ZSCORE result oldmember
(nil)         # đã bị xoá!
```

`ZUNIONSTORE` **xoá toàn bộ dest** trước khi ghi mới. Tránh dùng key đang có data làm dest.

## Use case ZUNIONSTORE: combined ranking

App RB carousel "trending" = combine 3 signals:
- Views (weight 1)
- Likes (weight 3)
- Bids (weight 5)

```text
items:by-views → [item1:1000, item2:500, ...]
items:by-likes → [item1:50,   item2:30,  ...]
items:by-bids  → [item1:5,    item2:3,   ...]

ZUNIONSTORE items:trending 3 items:by-views items:by-likes items:by-bids \
    WEIGHTS 1 3 5 AGGREGATE SUM
EXPIRE items:trending 60
```

Trending = `1*views + 3*likes + 5*bids`. Mỗi 1 phút refresh.

UI:
```ts
const trending = await client.zRange('items:trending', '+inf', '-inf', {
  BY: 'SCORE', REV: true, LIMIT: { offset: 0, count: 20 },
});
```

→ 1 lệnh ZRANGE cho top trending. Background worker chịu tính toán.

## Pattern: "Items both A and B liked, ranked by combined score"

```ts
// User A like items với score = timestamp khi like
// User B same
ZADD likes:user#A 1700000000 item1 1700001000 item2
ZADD likes:user#B 1700000500 item2 1700002000 item3

// Intersection
ZINTERSTORE common 2 likes:user#A likes:user#B AGGREGATE MAX

// → item2 với score = max(1700001000, 1700000500) = 1700001000
// Sort theo "khi nào cả 2 cùng like nhất"
```

Item nào A và B cùng like, sort theo "thời gian gần nhất một trong 2 like". Discovery rất tự nhiên.

## Tóm tắt bài 4

- `ZUNIONSTORE` / `ZINTERSTORE` / `ZDIFFSTORE` — phép toán giữa sorted set, store kết quả.
- `AGGREGATE SUM/MIN/MAX` quyết định score kết quả khi member trùng.
- `WEIGHTS w1 w2 ...` nhân score trước aggregate — pattern weighted ranking.
- Trộn Set + Sorted Set OK — Set member coi như score 1.
- Use case: combined ranking, faceted search, weighted scoring.
- Big set → cache kết quả, không tính real-time.

**Bài kế tiếp** → [Bài 5: Use case kinh điển + sorted set trong app RB](05-use-cases-sorted-set.md)
