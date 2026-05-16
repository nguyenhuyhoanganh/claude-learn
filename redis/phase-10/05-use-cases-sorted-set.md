# Bài 5: Use case kinh điển + sorted set trong app RB

Tổng kết phase-10 với 5 use case classic của Sorted Set, mỗi cái kèm pattern code đầy đủ. Đây là phần tham khảo quan trọng — Sorted Set xuất hiện ở rất nhiều feature production.

## Use case 1: Leaderboard

**Pattern cơ bản**:

```ts
// Tăng điểm
await client.zIncrBy('leaderboard', points, userId);

// Top 100
const top = await client.zRange('leaderboard', 0, 99, { REV: true, WITHSCORES: true });

// Rank của user X
const rank = (await client.zRevRank('leaderboard', userId)) + 1;   // 1-based

// User score
const score = await client.zScore('leaderboard', userId);

// Có bao nhiêu user trong khoảng 1000-5000 điểm?
const count = await client.zCount('leaderboard', 1000, 5000);
```

### Reset leaderboard theo tuần/tháng

```ts
function leaderboardKey(period: 'all-time' | 'weekly' | 'monthly') {
  if (period === 'all-time') return 'leaderboard:all';
  if (period === 'weekly') return `leaderboard:week:${getCurrentWeek()}`;
  return `leaderboard:month:${getCurrentMonth()}`;
}

// Mỗi action: update CẢ 3
await Promise.all([
  client.zIncrBy(leaderboardKey('all-time'), points, userId),
  client.zIncrBy(leaderboardKey('weekly'), points, userId),
  client.zIncrBy(leaderboardKey('monthly'), points, userId),
]);
```

→ User xem leaderboard nào (all-time, tuần, tháng) cũng có sẵn. Không cần aggregate runtime.

### Tie-breaking

Hai user cùng điểm → ai trên? Redis sort theo **lexicographic của member** trong cùng score. Có thể không như mong muốn.

Fix: encode timestamp vào score:

```ts
// Score = points * 10^13 + (10^13 - achievedAt) 
// → người đạt cùng điểm trước được xếp cao hơn
const compositeScore = points * 1e13 + (1e13 - achievedAt);
```

Trade-off: phải tính score composite. Hoặc dùng 2 sorted set (1 cho điểm, 1 cho timestamp), filter ở client.

## Use case 2: Time-ordered feed

```text
ZADD feed:user#alice <timestamp> <postId>
```

```ts
async function addPost(userId: string, postId: string) {
  await client.zAdd(`feed:user#${userId}`, {
    score: Date.now(),
    value: postId,
  });
}

// Feed mới nhất
async function getRecentFeed(userId: string, page = 1, perPage = 20) {
  const offset = (page - 1) * perPage;
  return await client.zRange(`feed:user#${userId}`, '+inf', '-inf', {
    BY: 'SCORE',
    REV: true,
    LIMIT: { offset, count: perPage },
  });
}

// Feed trong 24h qua
async function getFeed24h(userId: string) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return await client.zRange(`feed:user#${userId}`, cutoff, '+inf', {
    BY: 'SCORE',
  });
}
```

### Trim feed (giữ N gần nhất)

```ts
// Sau khi thêm, giữ chỉ 1000 gần nhất
await client.zAdd(`feed:user#${userId}`, ...);
await client.zRemRangeByRank(`feed:user#${userId}`, 0, -1001);
// Xoá tất cả phần tử có rank từ 0 đến (length - 1001)
// → giữ lại 1000 phần tử cuối (score cao nhất = gần đây nhất)
```

→ Feed không phình vô hạn. Tự dọn dẹp.

## Use case 3: Priority Queue / Job Scheduler

```text
ZADD jobs <runAt-timestamp> <jobId>
```

Worker:
```ts
async function pickJob() {
  const now = Date.now();
  // Job nào có score (= runAt) ≤ now
  const ready = await client.zRange('jobs', '-inf', now, {
    BY: 'SCORE',
    LIMIT: { offset: 0, count: 1 },
  });
  if (ready.length === 0) return null;
  
  const jobId = ready[0];
  const removed = await client.zRem('jobs', jobId);
  if (removed === 0) return null;   // worker khác đã lấy
  
  return jobId;
}
```

Hoặc atomic với Lua:

```lua
local ready = redis.call('ZRANGE', KEYS[1], '-inf', ARGV[1], 'BYSCORE', 'LIMIT', 0, 1)
if #ready == 0 then return nil end
redis.call('ZREM', KEYS[1], ready[1])
return ready[1]
```

Schedule job trong tương lai:
```ts
await client.zAdd('jobs', { score: Date.now() + 3600 * 1000, value: 'sendEmail:1234' });
```

→ Sau 1 giờ, worker tự pick. Không cần cron riêng.

Tương đương Bull, Sidekiq — chính chúng cũng dùng Sorted Set bên dưới.

## Use case 4: Rate limit sliding window

```ts
async function isAllowed(userId: string, maxPerMinute = 60): Promise<boolean> {
  const now = Date.now();
  const windowStart = now - 60 * 1000;
  const key = `rate:${userId}`;
  
  // Pipeline:
  const pipe = client.multi();
  pipe.zRemRangeByScore(key, '-inf', windowStart);     // xoá entry cũ
  pipe.zAdd(key, { score: now, value: `${now}-${Math.random()}` });
  pipe.zCard(key);                                       // đếm entry trong window
  pipe.expire(key, 60);
  const results = await pipe.exec();
  
  const count = results[2] as number;
  return count <= maxPerMinute;
}
```

So với rate limit dùng counter (`INCR`):
- Counter: cố định window 60s, có thể bị "burst" ở ranh giới window.
- Sliding window: chính xác — bất kỳ window 60s nào.

Trade-off: Sorted set tốn nhiều memory hơn (1 entry/request).

## Use case 5: Top N với composite criteria

Carousel "Most expensive items":

```ts
// keys.ts
export const itemsByPriceKey = () => 'items:by-price';

// Khi tạo item
await client.zAdd(itemsByPriceKey(), { score: price, value: itemId });

// Khi bid mới (giá tăng)
await client.zAdd(itemsByPriceKey(), { score: newPrice, value: itemId });   // override

// Top 20 đắt nhất
const ids = await client.zRange(itemsByPriceKey(), 0, 19, { REV: true });
const items = await getItems(ids);
```

### "Ending soonest" carousel

```text
items:by-ending-soon → score = endingAt timestamp
```

```ts
// Khi tạo item
await client.zAdd('items:by-ending-soon', { score: endingAt, value: itemId });

// Top 20 sắp kết thúc
const now = Date.now();
const ids = await client.zRange('items:by-ending-soon', now, '+inf', {
  BY: 'SCORE',
  LIMIT: { offset: 0, count: 20 },
});
```

Filter `score >= now` → bỏ qua items đã kết thúc.

### Cleanup ended items

```ts
// Cron hàng phút
await client.zRemRangeByScore('items:by-ending-soon', '-inf', Date.now());
```

→ Sorted set không phình to với items expired.

## Áp dụng đầy đủ cho app RB

Cập nhật `keys.ts`:

```ts
// Sorted sets cho sort/ranking
export const itemsByViewsKey      = () => 'items:by-views';
export const itemsByPriceKey      = () => 'items:by-price';
export const itemsByEndingSoonKey = () => 'items:by-ending-soon';
export const itemsByLikesKey      = () => 'items:by-likes';
export const itemsByCreatedKey    = () => 'items:by-created';

// Per-user feeds
export const userItemsKey = (userId: string) => `items:by-owner#${userId}`;
```

`createItem`:
```ts
export async function createItem(attrs: CreateItemAttrs): Promise<string> {
  const id = genId();
  const now = Date.now();
  
  await Promise.all([
    client.hSet(itemKey(id), serialize(attrs)),
    client.zAdd(itemsByPriceKey(), { score: attrs.price, value: id }),
    client.zAdd(itemsByEndingSoonKey(), { score: attrs.endingAt.getTime(), value: id }),
    client.zAdd(itemsByViewsKey(), { score: 0, value: id }),
    client.zAdd(itemsByLikesKey(), { score: 0, value: id }),
    client.zAdd(itemsByCreatedKey(), { score: now, value: id }),
    client.zAdd(userItemsKey(attrs.ownerId), { score: now, value: id }),
  ]);
  
  return id;
}
```

7 lệnh trong 1 pipeline. ~1ms. Setup nhiều secondary indexes, sau này query siêu nhanh.

### Landing page

```ts
async function getLandingPage() {
  const [expensiveIds, endingSoonIds, mostViewedIds] = await Promise.all([
    client.zRange(itemsByPriceKey(), 0, 19, { REV: true }),
    client.zRange(itemsByEndingSoonKey(), Date.now(), '+inf', {
      BY: 'SCORE',
      LIMIT: { offset: 0, count: 20 },
    }),
    client.zRange(itemsByViewsKey(), 0, 19, { REV: true }),
  ]);
  
  const allIds = [...new Set([...expensiveIds, ...endingSoonIds, ...mostViewedIds])];
  const itemsMap = new Map();
  const items = await getItems(allIds);
  items.forEach((it, i) => itemsMap.set(allIds[i], it));
  
  return {
    expensive: expensiveIds.map((id) => itemsMap.get(id)),
    endingSoon: endingSoonIds.map((id) => itemsMap.get(id)),
    mostViewed: mostViewedIds.map((id) => itemsMap.get(id)),
  };
}
```

3 sorted set query + 1 pipeline get items = 2 RTT cho cả landing page. ~2ms.

So với SQL: cần index trên `price`, `endingAt`, `views` + 3 separate `SELECT ... ORDER BY ... LIMIT 20`. Mỗi cái 5-50ms. Total 15-150ms.

→ Redis **5-50x nhanh hơn** SQL cho landing page kiểu này.

## Hệ quả: Mỗi sort = 1 sorted set

App có 5 cách sort items → 5 sorted set. Mỗi thay đổi item phải update tất cả relevant sets.

Trade-off:
- ✓ Query siêu nhanh, O(log N + K).
- ✗ Memory: mỗi sorted set ~50 byte/entry × 1M item = 50 MB × 5 sets = 250 MB.
- ✗ Write amplification: 1 like → update 2-3 sorted set.

So với SQL: 1 bảng + 5 index. Memory tương tự, performance kém hơn nhưng linh hoạt hơn (có thể thêm sort tiêu chí ad-hoc).

**Quy tắc**: chỉ tạo sorted set cho sort có nhu cầu UI thực sự. Đừng tạo "phòng hờ".

## Tóm tắt phase-10

Phase-10 đã hoàn thành:
- Sorted Set là gì, encoding skip list (Bài 1).
- ZRANGE chi tiết: index, score, lex, limit (Bài 2).
- ZINCRBY và leaderboard real-time (Bài 3).
- ZUNIONSTORE/ZINTERSTORE với WEIGHTS, AGGREGATE (Bài 4).
- 5 use case classic + app RB hoàn chỉnh (Bài 5).

App RB giờ có 5 sorted set indexes — sẵn sàng cho mọi sort/pagination UI cần.

**Phase tiếp theo** (phase-11 = Section 12): **Sorted Sets practice** — implement thêm các feature nâng cao của RB: username autocomplete, item by views với time, user IDs conversion.

→ [Phase-11 — Bài 1: Sorted Set use cases mở rộng](../phase-11/01-use-cases-mo-rong.md)
