# Bài 6: Tổng kết phase-11 + multiple sort indexes pattern

Bài cuối phase-11. Tổng kết pattern multi-index, code hoàn chỉnh cho 3 carousel landing page app RB, và đưa ra checklist cho mọi feature sort/rank trong tương lai.

## Tổng quan các index đã setup

Sau phase-10 và phase-11, app RB có:

```text
─── Canonical storage ───
users#<id>                    Hash      profile của user
items#<id>                    Hash      thông tin item
sessions#<token>              Hash      session đang active

─── Username indexes ───
usernames                     SortedSet member=username, score=decimalUserId
usernames:unique              Set       (legacy, có thể xoá)

─── Item sort indexes ───
items:views                   SortedSet member=itemId, score=viewCount
items:price                   SortedSet member=itemId, score=price
items:ending-at               SortedSet member=itemId, score=endingAt(ms)
items:likes                   SortedSet member=itemId, score=likeCount  (sẽ thêm)
items:created                 SortedSet member=itemId, score=createdAt  (sẽ thêm)

─── Per-user indexes ───
items:by-owner#<userId>       SortedSet member=itemId, score=createdAt
viewed:user#<userId>          SortedSet member=itemId, score=viewedAt   (bonus)
likes:user#<userId>           Set       items user đã like

─── Per-item indexes ───
viewers:item#<itemId>         Set       userIds đã view
liked_by:item#<itemId>        Set       userIds đã like
bids:item#<itemId>            List      (sẽ làm phase-14)
```

20+ keys/structures cho app vài feature. **Bình thường** trong Redis design — mỗi query mong muốn → 1 cấu trúc.

## Code đầy đủ: `createItem` cuối cùng

```ts
// src/services/queries/items/items.ts
export async function createItem(attrs: CreateItemAttrs): Promise<string> {
  const id = genId();
  const now = Date.now();
  const endingMs = attrs.endingAt.getTime();
  
  await Promise.all([
    client.hSet(itemKey(id), serialize(attrs)),
    
    // Sort indexes — initialize với appropriate score
    client.zAdd(itemsByViewsKey(),      { score: 0,        value: id }),
    client.zAdd(itemsByLikesKey(),      { score: 0,        value: id }),
    client.zAdd(itemsByPriceKey(),      { score: attrs.price, value: id }),
    client.zAdd(itemsByEndingSoonKey(), { score: endingMs, value: id }),
    client.zAdd(itemsByCreatedKey(),    { score: now,      value: id }),
    
    // Per-user index
    client.zAdd(userItemsKey(attrs.ownerId), { score: now, value: id }),
  ]);
  
  return id;
}
```

7 lệnh trong 1 pipeline. 1 RTT. ~1.5ms.

## Code đầy đủ: 3 query carousel

```ts
// src/services/queries/items/by-views.ts
export async function getMostViewedItems(
  offset = 0,
  count = 10
): Promise<Item[]> {
  const ids = await client.zRange(itemsByViewsKey(), offset, offset + count - 1, { REV: true });
  return loadAndDeserialize(ids);
}

// src/services/queries/items/by-price.ts
export async function getMostExpensiveItems(
  offset = 0,
  count = 10
): Promise<Item[]> {
  const ids = await client.zRange(itemsByPriceKey(), offset, offset + count - 1, { REV: true });
  return loadAndDeserialize(ids);
}

// src/services/queries/items/by-ending-time.ts
export async function getItemsEndingSoonest(
  offset = 0,
  count = 10
): Promise<Item[]> {
  const ids = await client.zRange(
    itemsByEndingSoonKey(),
    Date.now(),
    '+inf',
    { BY: 'SCORE', LIMIT: { offset, count } }
  );
  return loadAndDeserialize(ids);
}

// Helper chung
async function loadAndDeserialize(ids: string[]): Promise<Item[]> {
  if (ids.length === 0) return [];
  const commands = ids.map((id) => client.hGetAll(itemKey(id)));
  const results = await Promise.all(commands);
  return results
    .map((raw, i) => Object.keys(raw).length === 0 ? null : deserialize(ids[i], raw))
    .filter((it): it is Item => it !== null);
}
```

3 function tương tự, khác mỗi `ZRANGE`. Có thể refactor thành helper generic:

```ts
async function getItemsByIndex(
  indexKey: string,
  options: { offset?: number; count?: number; reverse?: boolean; minScore?: number | string; maxScore?: number | string }
): Promise<Item[]> {
  let ids: string[];
  if (options.minScore !== undefined || options.maxScore !== undefined) {
    ids = await client.zRange(
      indexKey,
      options.minScore ?? '-inf',
      options.maxScore ?? '+inf',
      {
        BY: 'SCORE',
        REV: options.reverse,
        LIMIT: { offset: options.offset ?? 0, count: options.count ?? 10 },
      }
    );
  } else {
    const start = options.offset ?? 0;
    const stop = start + (options.count ?? 10) - 1;
    ids = await client.zRange(indexKey, start, stop, { REV: options.reverse });
  }
  return loadAndDeserialize(ids);
}
```

Trade-off: gen function khó đọc hơn. Dùng khi có 5+ sort variants.

## Update khi item thay đổi

Mỗi mutation phải update relevant index:

| Action | Update |
|---|---|
| View | views counter + sort by views |
| Like | likes counter + sort by likes |
| Bid placed | price + sort by price, có thể endingAt + sort by ending |
| Edit | (nếu name/description đổi) — không liên quan sort |
| Delete | xoá khỏi mọi sort index |

Wrap mỗi mutation thành function helper:

```ts
export async function updateItemPrice(itemId: string, newPrice: number) {
  await Promise.all([
    client.hSet(itemKey(itemId), 'price', newPrice.toString()),
    client.zAdd(itemsByPriceKey(), { score: newPrice, value: itemId }),
  ]);
}

export async function deleteItem(itemId: string, ownerId: string) {
  await Promise.all([
    client.del(itemKey(itemId)),
    client.zRem(itemsByViewsKey(), itemId),
    client.zRem(itemsByLikesKey(), itemId),
    client.zRem(itemsByPriceKey(), itemId),
    client.zRem(itemsByEndingSoonKey(), itemId),
    client.zRem(itemsByCreatedKey(), itemId),
    client.zRem(userItemsKey(ownerId), itemId),
    client.del(itemViewersKey(itemId)),
    client.del(itemLikedByKey(itemId)),
    // bids list, comments, etc.
  ]);
}
```

→ **Single source of truth** cho mọi mutation. Không quên index.

## Memory analysis tổng

Với 1M items:

```text
items#<id>                  ~300 byte × 1M = 300 MB
items:views                 ~50 byte × 1M = 50 MB
items:likes                 ~50 byte × 1M = 50 MB
items:price                 ~50 byte × 1M = 50 MB
items:ending-at             ~50 byte × 1M = 50 MB
items:created               ~50 byte × 1M = 50 MB
viewers:item#<id>           ~30 byte × ~100 viewer avg = 3 KB / item → 3 GB
liked_by:item#<id>          ~30 byte × ~10 like avg = 300 byte / item → 300 MB
─────────────────────────────────────────────────────
Total: ~4 GB cho 1M items
```

OK với instance 8 GB RAM. 100M items → 400 GB, cần cluster.

> Phần lớn memory đi vào `viewers:item#<id>` (viewer set). Có thể optimize bằng HyperLogLog (phase-13) — 12KB/item bất kể có bao nhiêu viewer, sai số ~0.8%.

## Checklist khi thêm sort index mới

Trước khi tạo sorted set mới cho 1 sort criterion:

- [ ] **Sort thực sự cần thiết** trên UI? (đừng tạo phòng hờ)
- [ ] **Score là number cố định**? (nếu không, dùng RediSearch)
- [ ] **Memory đủ** cho 1 entry / record × số records?
- [ ] **Mọi mutation cập nhật score**? (init, increment, edit, delete)
- [ ] **`createX` đã thêm `ZADD` initial**?
- [ ] **`deleteX` đã thêm `ZREM`**?
- [ ] **Helper function tập trung mutation** (không scatter `zAdd` khắp code)?
- [ ] **Test với data lớn**: pagination ổn? Filter score range?
- [ ] **Cluster compatibility**: hash tag nếu cần atomic multi-key?

## Pitfall đã thấy + cách tránh

| Pitfall | Cách tránh |
|---|---|
| Quên init item trong sort index khi tạo | Helper `createItem` chứa mọi `ZADD` |
| Quên update sort index khi field đổi | Wrap mutation thành function, không gọi `HSET` trực tiếp |
| Quên xoá khỏi sort index khi delete | Helper `deleteX` xoá toàn diện |
| Sort index lệch với hash field (race) | Lua atomic, hoặc reconciliation cron |
| Sort index phình to với items đã hết hạn | Cleanup cron với `ZREMRANGEBYSCORE` |
| Pagination chậm với offset rất lớn | Dùng cursor-based (last seen score) thay vì offset |
| User id hex → score lệch precision | Giới hạn id length, hoặc dùng integer id |

## Tóm tắt phase-11

Đã hoàn thành:
- **Use case mở rộng** + mental model sorted set là secondary index (Bài 1).
- **Username sorted set** với hex-decimal conversion (Bài 2).
- **Most viewed** với 3-structure pattern (Bài 3).
- **Ending soonest** với time-based scoring (Bài 4).
- **Loading relational data** sau ZRANGE — 2-step + pipeline (Bài 5).
- **Tổng kết multi-index** + checklist (Bài 6).

App RB giờ có 5+ sort indexes, sub-millisecond response cho mọi list view.

**Phase tiếp theo** (phase-12 = Section 13): **Relational data trong Redis** — học SORT command, BY pattern, GET pattern để "JOIN" giữa Redis structures.

→ [Phase-12 — Bài 1: Migrating relational data vào Redis](../phase-12/01-migrating-relational.md)
