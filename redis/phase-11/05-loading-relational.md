# Bài 5: Loading relational data sau ZRANGE

`ZRANGE` chỉ trả về **member** (= IDs). Để hiển thị UI, cần thêm thông tin hash. Đây là pattern "two-step lookup" — common với mọi sorted set trong app thực. Bài này phân tích, đo performance, và bàn về anti-patterns.

## Pattern two-step

```text
Step 1: Get IDs from sorted set
  ZRANGE items:ending-at <now> +inf BYSCORE LIMIT 0 20
  → ['item#7', 'item#42', ...]

Step 2: Get hash data for each ID
  pipeline: HGETALL items#7, HGETALL items#42, ...
  → [hash7, hash42, ...]

Step 3: Deserialize + render
```

Mỗi step = 1 RTT (step 2 dùng pipeline). Total = **2 RTT**.

## Implementation

```ts
// src/services/queries/items/by-ending-time.ts
import { client } from '../../redis/client';
import { itemKey, itemsByEndingSoonKey } from '../../keys';
import { deserialize } from './deserialize';
import type { Item } from '$lib/types';

export async function getItemsByEndingSoonest(
  offset = 0,
  count = 10
): Promise<Item[]> {
  // Step 1: get IDs from sorted set
  const ids = await client.zRange(
    itemsByEndingSoonKey(),
    Date.now(),
    '+inf',
    { BY: 'SCORE', LIMIT: { offset, count } }
  );
  
  if (ids.length === 0) return [];
  
  // Step 2: pipeline HGETALL for each ID
  const commands = ids.map((id) => client.hGetAll(itemKey(id)));
  const results = await Promise.all(commands);
  
  // Step 3: deserialize, filter null (items đã bị xoá khỏi hash nhưng còn sorted set)
  return results
    .map((raw, i) => Object.keys(raw).length === 0 ? null : deserialize(ids[i], raw))
    .filter((it): it is Item => it !== null);
}
```

## Performance benchmark

Trên Redis local, 1M items:

| Phương án | Thời gian |
|---|---|
| 2-step (ZRANGE + pipeline HGETALL) | ~1.5ms |
| 1-step naive (ZRANGE + loop HGETALL await) | ~12ms |
| 1-step SQL equivalent `JOIN ORDER LIMIT` | ~50ms |

→ 2-step pipeline pattern ~8x nhanh hơn naive loop, ~30x nhanh hơn SQL.

## Anti-pattern: HMGET trên sorted set member

Một số người nghĩ: "HMGET lấy nhiều field, có thể lấy nhiều hash?". KHÔNG.

```text
HMGET items#7 items#42 ...     # SAI — HMGET làm với 1 hash, nhiều field
```

`HMGET key field1 field2 ...` chỉ làm với **1 key**, lấy nhiều **field trong cùng hash**.

Để fetch nhiều hash, **không có** "MGETHASH". Phải pipeline `HGETALL`.

## Anti-pattern: nested loop client

```ts
// SAI - N+1 query
const ids = await client.zRange(...);
const items = [];
for (const id of ids) {
  const item = await getItem(id);    // mỗi cái 1 RTT
  items.push(item);
}
```

Đã nhắc nhiều lần ở phase-7. Vẫn cần nhắc — đây là bug phổ biến nhất.

## Anti-pattern: SCAN + filter

```ts
// SAI - quét toàn bộ keyspace
const allItemKeys = [];
for await (const key of client.scanIterator({ MATCH: 'items#*' })) {
  allItemKeys.push(key);
}
const items = await Promise.all(allItemKeys.map((k) => client.hGetAll(k)));
const filtered = items.filter((it) => parseInt(it.endingAt) >= Date.now());
const sorted = filtered.sort((a, b) => parseInt(a.endingAt) - parseInt(b.endingAt));
const top20 = sorted.slice(0, 20);
```

→ Quét 1M key, load 1M hash về client, sort 1M, lấy 20. **Vô nghĩa**. Sorted set sinh ra để giải bài này — dùng nó.

## Variant: SORT command (Redis built-in)

Redis có lệnh `SORT` để sort + lookup, có thể thay 2-step bằng 1 lệnh:

```text
SORT items:ending-at BY items#*->endingAt GET # GET items#*->name GET items#*->price
```

→ Lấy IDs từ list/set, đọc field từ hash khác để sort/return.

Pros:
- 1 RTT thay vì 2.
- Server-side optimization.

Cons:
- Cú pháp phức tạp, khó đọc.
- Không hoạt động với Cluster (cần mọi key cùng slot).
- Deprecated cho mọi use case mới — RediSearch tốt hơn.

→ **Chỉ học để biết, không dùng cho code mới**. Sẽ học SORT chi tiết phase-12 (Section 13 transcript).

## Cải thiện: cache result tier 2

Khi traffic rất cao, có thể cache HTML rendered:

```ts
const CACHE_TTL = 30;   // 30 giây

async function getRenderedEndingSoon(): Promise<string> {
  const cached = await client.get('cache:rendered:ending-soon');
  if (cached) return cached;
  
  const items = await getItemsByEndingSoonest(0, 20);
  const html = await renderCarouselHTML(items);
  await client.set('cache:rendered:ending-soon', html, { EX: CACHE_TTL });
  return html;
}
```

→ Trong 30s, mọi request đọc 1 string. Sau 30s, **1 request** rebuild, 999 còn lại có thể spike (stampede). Cần lock pattern.

## Loading liên quan: owner của item

Trang chủ hiển thị `<a href="/users/${item.ownerId}">${ownerName}</a>`. Cần load owner sau khi có items:

```ts
async function getItemsWithOwners(ids: string[]): Promise<ItemWithOwner[]> {
  const items = (await getItems(ids)).filter(Boolean) as Item[];
  
  const ownerIds = [...new Set(items.map((it) => it.ownerId))];
  const owners = await getUsers(ownerIds);
  const ownersMap = new Map(ownerIds.map((id, i) => [id, owners[i]]));
  
  return items.map((it) => ({
    ...it,
    owner: ownersMap.get(it.ownerId),
  }));
}
```

3-step pattern:
1. IDs từ sorted set.
2. Items từ hash (pipeline).
3. Owners từ hash (pipeline).

Mỗi step 1 RTT. Total 3 RTT.

So với SQL: `SELECT items.*, users.* FROM items JOIN users ... ORDER BY endingAt LIMIT 20`. 1 query, có thể chậm hơn.

## Quy tắc: tối đa 4 RTT cho 1 page render

Với network latency 0.5ms/RTT, app server có ~50ms budget render → ~100 RTT là max. Thực tế 4-10 RTT là sweet spot.

| Số RTT | Latency | Khi nào |
|---|---|---|
| 1 | 0.5ms | Trang siêu đơn giản (cached HTML) |
| 2 | 1ms | Trang tĩnh với 1 list (vd carousel) |
| 3-4 | 2ms | Trang phức tạp với joined data |
| 5-10 | 5-10ms | Trang dashboard nhiều widget |
| > 20 | > 20ms | Có vấn đề N+1, refactor |

App RB landing page: 2-3 RTT cho cả 3 carousel. Performance đỉnh.

## Tóm tắt bài 5

- Two-step pattern: ZRANGE → pipeline HGETALL → deserialize.
- Avoid: N+1 await loop, SCAN + client-side filter, HMGET hiểu sai.
- SORT command tồn tại nhưng deprecated cho code mới.
- Cache rendered HTML tier 2 cho hot path.
- 3-step nếu cần joined data (item + owner).
- 4 RTT là budget tốt cho 1 page render.

**Bài kế tiếp** → [Bài 6: Tổng kết phase-11 + nhiều sort indexes](06-tong-ket-multi-sort.md)
