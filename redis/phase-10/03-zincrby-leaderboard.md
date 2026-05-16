# Bài 3: ZINCRBY và update score — leaderboard real-time

`ZINCRBY` là combo "thay đổi score + auto re-sort" trong 1 lệnh atomic. Đây là **lệnh quan trọng nhất** của Sorted Set trong production — backbone của mọi leaderboard, trending feed, view counter có ranking.

## Cú pháp

```text
ZINCRBY key delta member
```

```text
ZADD products 45 monitor
ZINCRBY products 10 monitor
"55"          # score mới

ZINCRBY products -5 monitor
"50"
```

- `delta` có thể âm để giảm.
- Member không tồn tại → tự tạo với score = 0 + delta.
- Atomic. O(log N).

## Vì sao ZINCRBY > ZADD update score?

```ts
// Cách A — ZADD update score
const currentScore = await client.zScore('lb', 'alice');     // 100
await client.zAdd('lb', { score: parseFloat(currentScore) + 1, value: 'alice' });
```

→ 2 RTT, race condition (client khác có thể tăng giữa GET và ADD).

```ts
// Cách B — ZINCRBY atomic
await client.zIncrBy('lb', 1, 'alice');     // → 101
```

→ 1 RTT, atomic. **Luôn ưu tiên ZINCRBY** khi tăng/giảm.

## Use case 1: Leaderboard

Game ghi điểm:

```ts
async function recordKill(userId: string) {
  await client.zIncrBy('leaderboard:wins', 1, userId);
}

async function getTopPlayers(limit = 10) {
  return await client.zRange('leaderboard:wins', 0, limit - 1, {
    REV: true,
    WITHSCORES: true,
  });
}

async function getUserRank(userId: string): Promise<number | null> {
  const rank = await client.zRevRank('leaderboard:wins', userId);
  return rank === null ? null : rank + 1;    // ZRANK 0-based, rank 1-based
}
```

Real-time:
- Mỗi kill: 1 lệnh `ZINCRBY` ~50μs ở server.
- Top 10: 1 lệnh `ZRANGE REV` ~50μs.
- User rank: 1 lệnh `ZREVRANK` ~50μs.

→ Leaderboard 10 triệu user chạy real-time với <1ms response.

## Use case 2: Trending posts

```ts
async function recordView(postId: string) {
  await client.zIncrBy('trending:posts', 1, postId);
}

async function getTrendingPosts(limit = 20) {
  return await client.zRange('trending:posts', '+inf', '-inf', {
    BY: 'SCORE',
    REV: true,
    LIMIT: { offset: 0, count: limit },
    WITHSCORES: true,
  });
}
```

Mỗi view → post nổi lên trang chủ tự nhiên. Không cần cron job rebuild ranking.

### Time-decay trending

Vấn đề: post cũ tích luỹ nhiều view sẽ luôn dẫn đầu. Cần "decay" theo thời gian.

**Cách 1: Time bucket**
```text
trending:posts:2026-01-15    # chỉ tính view trong ngày
trending:posts:2026-01-16
...
```

Mỗi ngày bucket mới. Old bucket có TTL 30 ngày. Trang trending hiển thị bucket hôm nay.

**Cách 2: Decayed score**
```ts
async function recordViewDecayed(postId: string) {
  const now = Date.now();
  const score = now / 1000;     // 1 view = 1 second worth
  await client.zIncrBy('trending:decayed', score, postId);
}
```

Score tăng theo timestamp → post mới có score cao hơn post cũ kể cả ít view.

**Cách 3: Periodic decay**
```ts
// Cron mỗi giờ: nhân tất cả score với 0.95 (decay 5%)
async function decayTrending() {
  const members = await client.zRange('trending', 0, -1, { WITHSCORES: true });
  // Reset với score đã decay
  const args = members.flatMap(({ score, value }) => [score * 0.95, value]);
  await client.zAdd('trending', /* ... */);
}
```

Trade-off: cron phải chạy, có thể không chính xác giữa các runs.

→ Chọn cách 1 (time bucket) cho đơn giản nhất.

## Use case 3: View counter cho item RB

Quay lại app RB. Phase-9 đã có:
```text
items#<itemId> field "views"     # cached counter
viewers:item#<itemId>             # Set unique viewer
```

Nhưng làm sao có **carousel "most viewed"**? Phải sort items theo views. **Sorted Set là index sort**.

```ts
// keys.ts
export const itemsByViewsKey = () => `items:by-views`;
```

```ts
// queries/items/views.ts (update)
export async function viewItem(userId: string, itemId: string) {
  const isNew = await client.sAdd(itemViewersKey(itemId), userId);
  if (isNew === 1) {
    await Promise.all([
      client.hIncrBy(itemKey(itemId), 'views', 1),
      client.zIncrBy(itemsByViewsKey(), 1, itemId),    // ← maintain sorted set
    ]);
  }
}
```

Mọi view → sorted set tự sắp lại. Trang chủ:

```ts
async function getMostViewedItemIds(limit = 20): Promise<string[]> {
  return await client.zRange(itemsByViewsKey(), 0, limit - 1, { REV: true });
}

router.get('/', async (req, res) => {
  const ids = await getMostViewedItemIds(20);
  const items = await getItems(ids);   // pipeline từ phase-7
  res.render('landing', { mostViewed: items });
});
```

2 lệnh Redis (ZRANGE + pipeline HGETALL) cho top 20 items. ~1ms.

### Hệ quả: 3 cấu trúc cho 1 feature

| Cấu trúc | Mục đích | Query |
|---|---|---|
| `items#<id>` hash field `views` | Hiển thị count trên UI | `HGET items#<id> views` |
| `viewers:item#<id>` set | Idempotency, "ai đã view" | `SISMEMBER`, `SCARD` |
| `items:by-views` sorted set | Sort, top N | `ZRANGE REV` |

3 cấu trúc đồng bộ với nhau khi có view mới. Lua atomic giúp đảm bảo consistency.

→ **Đặc trưng của Redis design**: không có "one structure to rule them all". Mỗi query → cấu trúc tối ưu cho query đó. Trade-off memory/sync code để có performance.

## ZADD vs ZINCRBY

Khi nào dùng ZADD, khi nào ZINCRBY?

| Tình huống | Lệnh |
|---|---|
| Set score lần đầu (vd subscribe ngày X) | `ZADD` |
| Update score đến giá trị tuyệt đối (vd set price = $99) | `ZADD` |
| Increment/decrement (vd +1 view) | `ZINCRBY` |
| Cập nhật atomic (race-safe) | `ZINCRBY` hoặc `ZADD GT/LT` |

`ZADD GT` (Redis 6.2+) thú vị: chỉ update nếu score mới > hiện tại.

```text
ZADD highscore GT 500 player#alice
```
→ Score chỉ tăng, không bao giờ tụt. Lý tưởng cho leaderboard.

## ZPOPMIN/ZPOPMAX — atomic take

```text
ZPOPMIN tasks
1) "task1"
2) "1"          # priority 1
```

Lấy phần tử ưu tiên cao nhất (score thấp = priority cao) + xoá. Atomic.

→ **Priority queue** đơn giản nhất.

```ts
async function nextJob() {
  const result = await client.zPopMin('tasks');
  return result?.value;
}
```

Pattern worker:
```ts
while (true) {
  const job = await nextJob();
  if (job) {
    await processJob(job);
  } else {
    await sleep(100);    // poll
  }
}
```

Tốt hơn: `BZPOPMIN` (blocking pop) — chờ tới khi có job:

```ts
const result = await client.bzPopMin('tasks', 0);    // 0 = chờ vô hạn
```

→ Worker không cần poll, server "đẩy" job đến.

## Quirk: số chính xác double, không bigint

Score là **IEEE 754 double** — ~15-17 chữ số có nghĩa.

Vấn đề:
- Unix timestamp ms (~13 chữ số) — OK.
- Unix timestamp μs (~16 chữ số) — gần ranh giới precision.
- BigInt counter rất lớn — sẽ mất precision.

```text
ZADD test 9007199254740993 member
ZSCORE test member
"9.007199254740992e+15"     # đã mất 1!
```

Mitigation: chia thành 2 score, hoặc dùng String/Hash cho high-precision counter.

## Bẫy: thêm score `NaN`

```text
ZADD test NaN member
(error) ERR value is not a valid float
```

Redis từ chối NaN, +Infinity (nếu không qua keyword `inf`), v.v. Tốt — tránh corrupt sorted set.

## Tóm tắt bài 3

- `ZINCRBY` là core operation: tăng/giảm score atomic, auto re-sort.
- Leaderboard, trending, ranking — đều dùng ZINCRBY.
- App RB: maintain `items:by-views` sorted set song song với hash counter & set uniqueness.
- Priority queue: `ZADD` + `ZPOPMIN` (+`BZPOPMIN` cho blocking).
- `ZADD GT/LT` cho update score đơn hướng.
- Score là double — chú ý precision với số rất lớn.

**Bài kế tiếp** → [Bài 4: ZUNIONSTORE/ZINTERSTORE — kết hợp nhiều sorted set](04-zunion-zinter-store.md)
