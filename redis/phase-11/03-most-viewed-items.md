# Bài 3: Most viewed items — tracking pattern hoàn chỉnh

Implement carousel "Most viewed" trên landing page app RB. Đây là pattern **đầy đủ nhất** kết hợp tất cả kiến thức đã học: Hash counter + Set uniqueness + Sorted Set ranking, đồng bộ qua pipeline.

## Yêu cầu

- Mỗi item có counter `views` đếm unique viewer.
- Carousel "Most viewed" trên landing page hiển thị top 20 items theo views.
- View được track real-time — refresh page thấy thay đổi.

## Data design tổng hợp

3 cấu trúc song song cho feature "view":

```text
items#<itemId>                  Hash       # canonical item, có field "views"
viewers:item#<itemId>           Set        # unique viewers (uniqueness check)
items:views                     SortedSet  # sort items theo views
```

Mỗi view (lần đầu của user X cho item Y):
1. SADD user vào `viewers:item#Y` → trả 1 (lần đầu).
2. HINCRBY `items#Y` field `views` +1.
3. ZINCRBY `items:views` +1 cho member Y.

Tất cả phải atomic. Nếu một fail, các cấu trúc lệch.

## Key generators

```ts
// src/services/keys.ts (mở rộng phần items)
export const itemKey            = (id: string) => `items#${id}`;
export const itemViewersKey     = (id: string) => `viewers:item#${id}`;
export const itemsByViewsKey    = () => `items:views`;
```

## `createItem` — khởi tạo trong sorted set

```ts
// src/services/queries/items/items.ts
import {
  itemKey, itemsByViewsKey, itemsByEndingSoonKey, itemsByPriceKey
} from '../../keys';

export async function createItem(attrs: CreateItemAttrs): Promise<string> {
  const id = genId();
  
  await Promise.all([
    client.hSet(itemKey(id), serialize(attrs)),
    client.zAdd(itemsByViewsKey(),      { score: 0,                         value: id }),
    client.zAdd(itemsByEndingSoonKey(), { score: attrs.endingAt.getTime(),  value: id }),
    client.zAdd(itemsByPriceKey(),      { score: attrs.price,               value: id }),
  ]);
  
  return id;
}
```

Mọi item mới có ngay trong 3 sorted set với initial score. Không cần "first event" để xuất hiện.

> Lý do quan trọng: nếu không init, item chưa view nào sẽ không có trong sort by views. Filter UI phải tự handle "missing → treat as 0" — phức tạp. Init từ đầu đơn giản hơn.

## `viewItem` — track view với uniqueness + sort sync

```ts
// src/services/queries/items/views.ts
import { client } from '../../redis/client';
import { itemKey, itemViewersKey, itemsByViewsKey } from '../../keys';

export async function viewItem(userId: string, itemId: string): Promise<void> {
  // SADD trả 1 nếu lần đầu user view item này
  const isNewViewer = await client.sAdd(itemViewersKey(itemId), userId);
  
  if (isNewViewer === 1) {
    // Increment cả 2 counter trong pipeline
    await Promise.all([
      client.hIncrBy(itemKey(itemId), 'views', 1),
      client.zIncrBy(itemsByViewsKey(), 1, itemId),
    ]);
  }
}
```

3 RTT cho lần đầu: SADD + (HINCRBY pipeline ZINCRBY). 1 RTT cho lần sau.

## Route handler

```ts
router.get('/items/:id', async (req, res) => {
  const itemId = req.params.id;
  const userId = req.session?.userId;
  
  // Fire-and-forget tracking (không block render)
  if (userId) {
    viewItem(userId, itemId).catch(console.error);
  }
  
  const item = await getItem(itemId);
  if (!item) return res.status(404).send('Not found');
  res.render('item-detail', { item });
});
```

Pattern fire-and-forget bài 4 phase-9.

## Race condition giữa SADD và HINCRBY/ZINCRBY

```text
Time | Client A                           Client B
-----|------------------------------------|----------------------------
T1   | SADD viewers:item#X user42 → 1     |
T2   | [crash before HINCRBY]             |
```

→ Set có user42, nhưng counter không tăng. Lệch.

**Giải pháp Lua** atomic:

```lua
-- view_item.lua
local isNew = redis.call('SADD', KEYS[1], ARGV[1])
if isNew == 1 then
  redis.call('HINCRBY', KEYS[2], 'views', 1)
  redis.call('ZINCRBY', KEYS[3], 1, ARGV[2])
end
return isNew
```

```ts
const VIEW_LUA = await client.scriptLoad(/* lua source */);

export async function viewItem(userId: string, itemId: string) {
  return await client.evalSha(VIEW_LUA, {
    keys: [itemViewersKey(itemId), itemKey(itemId), itemsByViewsKey()],
    arguments: [userId, itemId],
  });
}
```

Atomic 3 lệnh: hoặc cả thành công, hoặc cả không. Sẽ học Lua chi tiết ở phase-16.

## `getMostViewedItemIds`

```ts
// src/services/queries/items/items.ts
export async function getMostViewedItemIds(
  offset = 0,
  count = 20
): Promise<string[]> {
  return await client.zRange(itemsByViewsKey(), 0, -1, {
    REV: true,
    LIMIT: { offset, count },
  });
}
```

Wait — `0 -1` lấy toàn bộ, không phù hợp khi có triệu items. Đúng phải dùng `BYSCORE` hoặc giới hạn rank:

```ts
return await client.zRange(itemsByViewsKey(), 0, count - 1, {
  REV: true,
});
```

→ `ZRANGE 0 (count-1) REV` lấy top N. Pagination qua start/stop index:

```ts
return await client.zRange(itemsByViewsKey(), offset, offset + count - 1, {
  REV: true,
});
```

## Landing page

```ts
router.get('/', async (req, res) => {
  const mostViewedIds = await getMostViewedItemIds(0, 20);
  const items = (await getItems(mostViewedIds)).filter(Boolean);
  res.render('landing', { mostViewed: items });
});
```

2 lệnh Redis (ZRANGE + pipeline HGETALL). ~1ms.

## Cache stampede — vấn đề traffic cao

Trang chủ là **hot path** — triệu user gọi mỗi giờ. Mỗi request:
- ZRANGE (~0.1ms)
- 20 HGETALL pipeline (~1ms)

→ 20 lệnh Redis × 1M req/h = ~600 ops/s. OK cho 1 instance.

Nhưng nếu Redis cache rebuild đồng thời (vd sau restart), tất cả request đập vào → spike.

Mitigation:
1. **Cache landing data ở app-level** (Node memory) với TTL 10s.
2. **Cache HTML** rendered ở Redis với TTL 30s.
3. **CDN** cho HTML static (phù hợp nhất nếu content giống mọi user).

App RB landing page giống mọi user (chưa login) → ý 3 tốt nhất. Logic Redis chỉ chạy cho cache miss.

## Memory analysis

1M items × ~50 byte/sorted set entry = 50 MB cho `items:views`.

Mỗi item × 5 sorted set indexes = 250 MB sort-related.

Plus canonical hash × ~300 byte/item = 300 MB hash.

Total: ~550 MB cho 1M items. Vừa với instance 1-2 GB RAM.

10M items → 5.5 GB → cần Cluster hoặc instance lớn.

## Per-user "items I viewed" (bonus)

Yêu cầu phụ: "user gần đây xem những item nào".

```ts
export const userViewedKey = (uid: string) => `viewed:user#${uid}`;

// Trong viewItem (sau khi confirm isNew):
await client.zAdd(userViewedKey(userId), {
  score: Date.now(),     // timestamp khi view
  value: itemId,
});

// Trim giữ 50 gần nhất
await client.zRemRangeByRank(userViewedKey(userId), 0, -51);
```

→ Dashboard "Recently viewed": ZRANGE REV LIMIT 0 10.

## Tóm tắt bài 3

- 3 cấu trúc song song cho view feature: hash counter, set unique, sorted set sort.
- Sync 3 cấu trúc qua pipeline (Promise.all).
- Cho atomic chuẩn: Lua script.
- `createItem` init mọi sort index với score = 0 (hoặc giá trị ban đầu).
- Top N: `ZRANGE 0 N-1 REV`.
- Landing page = 2 RTT, ~1ms backend.
- Memory: ~50 byte/entry/index. Plan ahead với 1M+ items.

**Bài kế tiếp** → [Bài 4: Items by ending soonest — time-based sorted set](04-items-ending-soonest.md)
