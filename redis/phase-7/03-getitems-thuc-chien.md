# Bài 3: Áp dụng pipeline — getItems thực chiến + tips production

Bài cuối phase-7. Đi sâu hơn vào `getItems`: error handling, type safety, monitoring, và các pattern thực dụng khi pipeline trong production.

## Full implementation review

```ts
// services/queries/items/items.ts
export async function getItems(ids: string[]): Promise<(Item | null)[]> {
  if (ids.length === 0) return [];
  
  const commands = ids.map((id) => client.hGetAll(itemKey(id)));
  const results = await Promise.all(commands);
  
  return results.map((raw, i) => {
    if (Object.keys(raw).length === 0) return null;
    return deserialize(ids[i], raw);
  });
}
```

Vài chi tiết quan trọng:

### Detail 1: empty input check

```ts
if (ids.length === 0) return [];
```

Tránh gọi `Promise.all([])` — không phải lỗi nhưng trả về `[]` ngay, không phí RTT.

### Detail 2: position-preserving result

```ts
return results.map((raw, i) => {
  if (Object.keys(raw).length === 0) return null;
  return deserialize(ids[i], raw);
});
```

Output **giữ position** với input. Item thứ i có thể là `null` (không tồn tại) nhưng vẫn ở vị trí i. Caller có thể:

```ts
const items = await getItems(['a', 'b', 'c']);
// → [Item | null, Item | null, Item | null]

// Lọc null nếu cần
const found = items.filter((it): it is Item => it !== null);
```

Trade-off với cách "skip null":
```ts
return results
  .map((raw, i) => Object.keys(raw).length === 0 ? null : deserialize(ids[i], raw))
  .filter((it) => it !== null);
```

→ Mất mapping position ↔ id. Tuỳ use case.

## Khi pipeline bị "1 lệnh fail"

Pipeline KHÔNG rollback. Nếu 1 trong N lệnh fail (vd `WRONGTYPE`), các lệnh khác vẫn chạy.

```ts
await client.set('foo', 'string-value');
await client.hSet('user#1', { name: 'Alice' });

const results = await Promise.all([
  client.hGetAll('user#1'),   // ✓ OK
  client.hGetAll('foo'),       // ✗ WRONGTYPE
  client.hGetAll('user#2'),   // ? phụ thuộc lib
]);
```

**Hành vi node-redis**: `Promise.all` reject nếu **bất kỳ** promise nào reject. → toàn bộ batch fail.

**Workaround**: dùng `Promise.allSettled`:

```ts
const settled = await Promise.allSettled(commands);
return settled.map((result, i) => {
  if (result.status === 'rejected') {
    console.error('Command failed for id', ids[i], result.reason);
    return null;
  }
  const raw = result.value;
  if (Object.keys(raw).length === 0) return null;
  return deserialize(ids[i], raw);
});
```

`Promise.allSettled` luôn resolve với array `{ status, value | reason }` — không reject. Mỗi command kiểm tra riêng.

**Khi nào dùng allSettled?**
- Khi có khả năng dữ liệu bẩn (vd migrate codebase với key kiểu cũ lẫn mới).
- Khi không muốn 1 lỗi nhỏ phá toàn batch.

## Type-safety với node-redis

`hGetAll` trả `Record<string, string>` — không có info về schema. TypeScript không biết `raw.price` có tồn tại hay không.

Cải thiện:

```ts
type ItemHashFields = {
  ownerId: string;
  name: string;
  description: string;
  imageUrl: string;
  price: string;       // luôn string trong Redis
  views: string;
  likes: string;
  bids: string;
  createdAt: string;
  endingAt: string;
  highestBidUserId: string;
};

export function deserialize(
  id: string,
  raw: Partial<ItemHashFields>     // ← Partial vì field có thể thiếu
): Item {
  return {
    id,
    ownerId: raw.ownerId ?? '',
    // ... đầy đủ default ở mọi field
  };
}
```

Trade-off: thêm boilerplate type. Cho project lớn đáng làm; project nhỏ Skip.

## Pattern: dedupe ids trước khi pipeline

```ts
export async function getItems(ids: string[]): Promise<(Item | null)[]> {
  if (ids.length === 0) return [];
  
  // Dedupe để tránh gửi 2 lệnh giống nhau
  const uniqueIds = [...new Set(ids)];
  const commands = uniqueIds.map((id) => client.hGetAll(itemKey(id)));
  const results = await Promise.all(commands);
  
  // Map back về order/duplication ban đầu
  const idToResult = new Map(uniqueIds.map((id, i) => [id, results[i]]));
  return ids.map((id) => {
    const raw = idToResult.get(id)!;
    return Object.keys(raw).length === 0 ? null : deserialize(id, raw);
  });
}
```

Nếu input có id lặp (hiếm nhưng có) → pipeline gửi ít hơn.

Skip dedupe nếu input luôn unique (vd từ DB).

## Chunked pipeline cho list lớn

```ts
const BATCH_SIZE = 1000;

export async function getManyItems(ids: string[]): Promise<(Item | null)[]> {
  if (ids.length === 0) return [];
  
  const allResults: (Item | null)[] = [];
  
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const items = await getItems(batch);
    allResults.push(...items);
  }
  
  return allResults;
}
```

Mỗi batch là 1 round-trip với 1k lệnh. Tổng RTT = ceil(N/1000). Đảm bảo không OOM với list cực lớn.

## Monitor pipeline performance

Trong production, đo:

```ts
async function getItemsWithMetrics(ids: string[]): Promise<(Item | null)[]> {
  const start = Date.now();
  const result = await getItems(ids);
  const duration = Date.now() - start;
  
  metrics.histogram('redis.getItems.duration', duration, {
    batch_size: String(ids.length),
  });
  metrics.histogram('redis.getItems.per_item_us', (duration * 1000) / ids.length);
  
  return result;
}
```

Metric quan trọng:
- **Total duration** — toàn pipeline.
- **Duration per item** — đo hiệu quả batch.
- **Batch size distribution** — biết app dùng pipeline thế nào.

Cảnh báo nếu per-item > 100μs hoặc total > 50ms.

## Khi nào pipeline KHÔNG đủ?

Pipeline giải quyết "nhiều lệnh đơn lẻ". Có vài case cần thêm:

### Case 1: lệnh trên cluster với key khác slot

Redis Cluster yêu cầu mọi key trong 1 lệnh phải cùng slot. Pipeline `Promise.all` thì OK vì mỗi command là độc lập:

```ts
// Cluster: OK
await Promise.all([
  client.hGetAll('user#1'),   // có thể slot A
  client.hGetAll('user#2'),   // có thể slot B
  client.hGetAll('user#3'),   // có thể slot C
]);
```

`node-redis` cluster client tự route từng command đến đúng node. Pipeline cluster thực ra là **scatter-gather**: gửi đến nhiều node song song.

Tuy nhiên `multi()` cluster yêu cầu tất cả key cùng slot → cần hash tag.

### Case 2: lệnh phụ thuộc kết quả

```ts
const userId = await client.get('current:user');
const user = await client.hGetAll(`users#${userId}`);
```

Hai lệnh có dependency → không thể pipeline. Cần Lua script để gộp atomic:

```lua
local userId = redis.call('GET', 'current:user')
return redis.call('HGETALL', 'users#' .. userId)
```

(Sẽ học Lua phase-16.)

### Case 3: cần atomic group write

Phải dùng `multi()` (transaction), không phải `Promise.all`.

## Áp dụng `getItems` vào app

Backend `/items/list?ids=a,b,c`:

```ts
router.get('/items/list', async (req, res) => {
  const ids = (req.query.ids as string).split(',');
  const items = await getItems(ids);
  res.json(items);
});
```

Frontend gọi:
```ts
const ids = sortedItemIds.slice(0, 10);   // top 10
const items = await fetch(`/items/list?ids=${ids.join(',')}`);
// Render carousel
```

Trên backend `getItems(10 ids)` ~1ms. Latency tổng request: ~5-10ms (bao gồm parse, render).

## Pattern: bao bọc với cache layer

Khi nhiều request cùng `getItems` với id giống nhau, có thể thêm cache layer trước Redis:

```ts
const memCache = new LRUCache<string, Item>({ max: 1000, ttl: 5000 });

export async function getItemCached(id: string): Promise<Item | null> {
  const cached = memCache.get(id);
  if (cached) return cached;
  
  const item = await getItem(id);
  if (item) memCache.set(id, item);
  return item;
}
```

→ Hot item trả từ in-memory ~10μs, cold trả từ Redis ~500μs. Best of both.

Trade-off: stale data trong 5s. OK cho hầu hết display, không OK cho data financial.

## Tóm tắt phase-7

- Pipeline = batch nhiều lệnh trong 1 RTT, tăng throughput 10-50x.
- node-redis: `Promise.all([cmds])` cho pure pipeline, `multi()` cho atomic transaction.
- Pattern `ids.map → Promise.all → results.map` cho bulk fetch.
- `Promise.allSettled` khi cần tolerant với lỗi từng item.
- Chunk batch 1k để tránh OOM.
- Pipeline không atomic — dùng `multi()` hoặc Lua khi cần.
- Monitor metric per-batch trong production.

**Phase tiếp theo** (phase-8 = Section 09): **Set** — kiểu dữ liệu tiếp theo, cho unique membership, intersection (use case Like + View của app).

→ [Phase-8 — Bài 1: Set là gì? Tại sao quan trọng?](../phase-8/01-set-la-gi.md)
