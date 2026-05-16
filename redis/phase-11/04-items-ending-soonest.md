# Bài 4: Items by ending soonest — time-based sorted set

Carousel "Ending soonest" trên landing page hiển thị items sắp hết hạn đấu giá. Bài này demonstrate **time-based sorted set** với score = timestamp ms, kèm range query `BYSCORE LIMIT`, cleanup tự động.

## Yêu cầu

- Carousel hiển thị top 20 items có `endingAt` sớm nhất **trong tương lai**.
- Items đã hết hạn KHÔNG xuất hiện.
- Cập nhật real-time khi item mới được tạo.

## Data design

```text
items:ending-at sorted set:
  members  scores (timestamp ms)
  item#1   1736935200000     # 2026-01-15 10:00
  item#2   1736935800000     # 2026-01-15 10:10
  item#3   1736942400000     # 2026-01-15 12:00
  item#4   1736000000000     # đã qua — cần filter
```

→ Score nhỏ = ending sớm. Sort ascending = top sắp hết.

Filter "trong tương lai" = `score >= now`.

## Key generator

```ts
// src/services/keys.ts
export const itemsByEndingSoonKey = () => `items:ending-at`;
```

## Update `createItem`

```ts
export async function createItem(attrs: CreateItemAttrs): Promise<string> {
  const id = genId();
  const endingMs = attrs.endingAt.getTime();
  
  await Promise.all([
    client.hSet(itemKey(id), serialize(attrs)),
    client.zAdd(itemsByViewsKey(),      { score: 0,        value: id }),
    client.zAdd(itemsByEndingSoonKey(), { score: endingMs, value: id }),    // ← thêm
    client.zAdd(itemsByPriceKey(),      { score: attrs.price, value: id }),
  ]);
  
  return id;
}
```

`endingMs` = Unix timestamp milliseconds. Phù hợp với score double precision (15-16 chữ số có nghĩa, timestamp ms ~13 chữ số).

## Query "ending soonest"

```ts
export async function getEndingSoonestItemIds(
  offset = 0,
  count = 20
): Promise<string[]> {
  const now = Date.now();
  return await client.zRange(itemsByEndingSoonKey(), now, '+inf', {
    BY: 'SCORE',
    LIMIT: { offset, count },
  });
}
```

Phân tích:
- `BY: 'SCORE'` — range theo score, không phải index.
- `now` → `+inf` — score từ now đến tương lai. **Items đã qua tự bỏ**.
- `LIMIT offset count` — pagination.
- Mặc định ascending (small score first) — đúng nhất "ending soonest".

`+inf` trong node-redis có thể là chuỗi `'+inf'` hoặc number `Infinity`. Kiểm tra doc lib.

## So với BYSCORE deprecated commands

Code cũ:
```ts
await client.zRangeByScore('items:ending-at', now, '+inf', { LIMIT: { offset, count } });
```

→ Hoạt động nhưng deprecated từ Redis 6.2. Dùng `zRange` với `BY: 'SCORE'`.

## Route landing page mở rộng

```ts
router.get('/', async (req, res) => {
  const [mostViewedIds, endingSoonestIds, mostExpensiveIds] = await Promise.all([
    getMostViewedItemIds(0, 20),
    getEndingSoonestItemIds(0, 20),
    getMostExpensiveItemIds(0, 20),
  ]);
  
  // Dedupe IDs across 3 lists, batch fetch hash
  const allIds = [...new Set([...mostViewedIds, ...endingSoonestIds, ...mostExpensiveIds])];
  const items = await getItems(allIds);
  const map = new Map(allIds.map((id, i) => [id, items[i]]));
  
  res.render('landing', {
    mostViewed:     mostViewedIds.map((id) => map.get(id)).filter(Boolean),
    endingSoonest:  endingSoonestIds.map((id) => map.get(id)).filter(Boolean),
    mostExpensive:  mostExpensiveIds.map((id) => map.get(id)).filter(Boolean),
  });
});
```

Tối ưu: gộp HGETALL của tất cả unique IDs (giả định nhiều item trùng giữa 3 list). Pipeline 1 lần.

3 ZRANGE + 1 pipeline HGETALL = **2 RTT** cho cả landing page. ~2ms.

## Cleanup items expired

Items có `endingAt < now` vẫn nằm trong sorted set, chỉ không xuất hiện trong query "ending soon" do filter. Nhưng:
- Vẫn chiếm memory.
- Khi pagination với offset lớn, tốn chi phí skip qua.

**Cleanup cron**:

```ts
// Chạy mỗi giờ
async function cleanupExpiredItems() {
  const now = Date.now();
  const removed = await client.zRemRangeByScore(itemsByEndingSoonKey(), '-inf', now - 1);
  console.log(`Removed ${removed} expired items from ending-at index`);
}
```

`ZREMRANGEBYSCORE` xoá tất cả member có score trong khoảng. O(log N + K).

Trade-off: phải nhớ chạy cron. Quên = sorted set phình.

**Alternative**: TTL trên item hash trigger xoá. Nhưng sorted set không tự xoá member khi item key expire. Phải subscribe keyspace events hoặc cron.

## "Live" data trong sorted set

Sorted set time-based có pattern phổ biến:

| Use case | Score | Filter |
|---|---|---|
| Auctions ending soon | endingAt ms | `score >= now` |
| Scheduled jobs | runAt ms | `score <= now` (jobs to run) |
| Recent activities | createdAt ms | `score >= now - 24h` |
| Subscription expiration | expiresAt ms | `score <= now + 7d` |
| Event timeline | eventAt ms | range theo time |

Đều dùng `ZRANGE BYSCORE`.

## Bonus: Items ending **today**

```ts
async function getItemsEndingToday(): Promise<string[]> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);
  
  return await client.zRange(
    itemsByEndingSoonKey(),
    startOfDay.getTime(),
    endOfDay.getTime(),
    { BY: 'SCORE' }
  );
}
```

→ Filter range giờ trong ngày. O(log N + K) bất kể sorted set có bao nhiêu items.

## "Just-in-time" updates khi bid

Khi user bid và làm `endingAt` đổi (vd policy: bid trong 1 phút cuối kéo dài thêm 5 phút), phải update sorted set:

```ts
async function placeBid(itemId: string, userId: string, amount: number) {
  const item = await getItem(itemId);
  if (!item) throw new Error('Not found');
  
  const now = Date.now();
  const endingMs = item.endingAt.getTime();
  
  // Anti-snipe: nếu bid trong 60s cuối, kéo dài 5 phút
  let newEndingMs = endingMs;
  if (endingMs - now < 60_000) {
    newEndingMs = now + 5 * 60_000;
  }
  
  await Promise.all([
    client.hSet(itemKey(itemId), {
      highestBidUserId: userId,
      price: amount.toString(),
      endingAt: newEndingMs.toString(),
    }),
    client.zAdd(itemsByEndingSoonKey(), { score: newEndingMs, value: itemId }),    // override
    client.zAdd(itemsByPriceKey(), { score: amount, value: itemId }),              // update price
  ]);
}
```

`ZADD` với member đã tồn tại → **update score**, không add duplicate. Atomic.

## Sorted set memory tracking

```text
items:ending-at với 1M items, mỗi entry ~50 byte = 50 MB
```

Sorted set vài MB là OK. Lo lắng khi > 1 GB hoặc operation chậm.

`MEMORY USAGE items:ending-at` cho memory thực.

## Cluster — hash tag cho sorted set

```text
items:ending-at sorted set tồn tại trên 1 node.
items#1, items#2, ... hash tồn tại có thể trên node khác (nếu key khác slot).
```

→ Lệnh ZRANGE → trả ids. Sau đó `getItems(ids)` cần pipeline HGETALL — mỗi key có thể ở node khác.

`node-redis` Cluster mode auto-route từng lệnh đúng node. Pipeline pump qua nhiều connection.

Nếu cần guarantee mọi item của owner X cùng slot (để có operation đa key atomic):
```ts
export const itemKey = (id: string, ownerId: string) => `items:{${ownerId}}#${id}`;
```

Trade-off: owner X "nóng" (concentration). Cân nhắc cho production lớn.

## Tóm tắt bài 4

- Sorted set time-based: score = timestamp ms.
- `ZRANGE BYSCORE` với range `now → +inf` cho "future events".
- Pagination qua `LIMIT offset count`.
- Cleanup cron với `ZREMRANGEBYSCORE` định kỳ.
- Update `endingAt` = ZADD lại với cùng member (override score atomic).
- Pattern dùng cho: ending auctions, scheduled jobs, recent activities, expiration.

**Bài kế tiếp** → [Bài 5: Loading relational data sau ZRANGE](05-loading-relational.md)
