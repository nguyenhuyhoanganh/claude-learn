# Bài 6: Items by price + tổng kết phase-15

Bài cuối phase-15. Hoàn thiện carousel "Most expensive" trên landing page bằng Sorted Set `items:price`, đồng thời tổng kết những bài học race condition đã thấy.

## Sorted Set `items:price`

Đã preview ở phase-11. Giờ implement đầy đủ:

```ts
// keys.ts
export const itemsByPriceKey = () => 'items:price';
```

## Maintain `items:price` qua mọi thay đổi

3 nơi cần update sort index:

### Khi tạo item

```ts
export async function createItem(attrs: CreateItemAttrs): Promise<string> {
  const id = genId();
  await Promise.all([
    client.hSet(itemKey(id), serialize(attrs)),
    client.zAdd(itemsByPriceKey(), { score: attrs.price, value: id }),
    // ... các sort index khác
  ]);
  return id;
}
```

### Khi bid thành công

```ts
// Trong createBid, đã có:
client.zAdd('items:price', { score: attrs.amount, value: attrs.itemId }, { GT: true });
```

`GT: true` đảm bảo monotonic — price chỉ tăng. Tránh "score regression" nếu bid thấp hơn (đã reject ở validation, nhưng defensive).

### Khi xoá item

```ts
export async function deleteItem(itemId: string) {
  await Promise.all([
    client.del(itemKey(itemId)),
    client.zRem(itemsByPriceKey(), itemId),
    // ... mọi sort index khác
  ]);
}
```

## Query: getMostExpensiveItems

```ts
export async function getMostExpensiveItems(
  offset = 0,
  count = 20
): Promise<Item[]> {
  const ids = await client.zRange(
    itemsByPriceKey(),
    offset,
    offset + count - 1,
    { REV: true }
  );
  
  if (ids.length === 0) return [];
  
  const items = await Promise.all(ids.map((id) => client.hGetAll(itemKey(id))));
  return items
    .map((raw, i) => Object.keys(raw).length === 0 ? null : deserialize(ids[i], raw))
    .filter((it): it is Item => it !== null);
}
```

Same pattern như `getMostViewedItems`. Reuse `loadAndDeserialize` helper:

```ts
async function loadAndDeserialize(ids: string[]): Promise<Item[]> {
  if (ids.length === 0) return [];
  const commands = ids.map((id) => client.hGetAll(itemKey(id)));
  const results = await Promise.all(commands);
  return results
    .map((raw, i) => Object.keys(raw).length === 0 ? null : deserialize(ids[i], raw))
    .filter((it): it is Item => it !== null);
}

export async function getMostExpensiveItems(offset = 0, count = 20) {
  const ids = await client.zRange(itemsByPriceKey(), offset, offset + count - 1, { REV: true });
  return loadAndDeserialize(ids);
}
```

## Landing page hoàn chỉnh

```ts
router.get('/', async (req, res) => {
  const [mostViewed, endingSoon, mostExpensive] = await Promise.all([
    getMostViewedItems(0, 20),
    getItemsByEndingSoonest(0, 20),
    getMostExpensiveItems(0, 20),
  ]);
  
  res.render('landing', { mostViewed, endingSoon, mostExpensive });
});
```

3 query song song. Mỗi query: ZRANGE (1 RTT) + pipeline HGETALL (1 RTT) = 2 RTT.

Tổng cộng: **2 RTT thực tế** (3 query chạy parallel). ~2ms.

## Test

```bash
npm run dev
```

1. Tạo nhiều items với price khác nhau.
2. Bid trên một số items → price thay đổi.
3. Refresh `/` → carousel "Most expensive" update.

Verify:
```text
> ZRANGE items:price 0 -1 WITHSCORES
1) "itemA"     2) "150"
3) "itemB"     4) "100"
5) "itemC"     6) "50"
> ZRANGE items:price 0 2 REV    # top 3
1) "itemA"     # price 150
2) "itemB"     # price 100
3) "itemC"     # price 50
```

## Tổng kết phase-15

Phase-15 đã hoàn thành:
- **Bid validation** (Bài 1): 3 rule check.
- **Pipeline + concurrency bug** (Bài 2): hiểu chính xác race condition.
- **Atomic primitives** (Bài 3): giải race cấp 1.
- **MULTI/EXEC** (Bài 4): transaction Redis, khác SQL.
- **WATCH + optimistic locking** (Bài 5): conditional update an toàn.
- **Items by price** (Bài 6): hoàn thiện sort indexes.

## Bài học race condition tổng quan

Decision tree khi gặp race trong Redis:

```text
"Có race condition?"
       │
       ▼
"Business chấp nhận race (last-write-wins)?"
       │
   ┌───┴───┐
   │       │
  YES      NO
   │       │
   ▼       ▼
KHÔNG FIX  "Race ở counter/flag đơn?"
           │
       ┌───┴───┐
       │       │
      YES      NO
       │       │
       ▼       ▼
   INCR/HINCRBY/  "Cần read-then-write conditional?"
   ZINCRBY/      │
   SADD return   ┌───┴───┐
                YES      NO
                 │       │
                 ▼       ▼
            WATCH/MULTI  Pipeline đủ
            hoặc Lua     (Promise.all)
```

## So sánh 4 cách giải race

| Cách | Latency | Complexity | Khi nào dùng |
|---|---|---|---|
| Atomic primitive | 1 RTT | Thấp | Single counter, single condition |
| MULTI/WATCH | 1 RTT/attempt + retry | Trung | Conditional update đơn giản |
| Lua script | 1 RTT | Trung | Logic phức tạp, atomic + abort |
| Distributed lock | 1 RTT acquire + work + release | Cao | Business operation rộng (vd checkout flow) |

App RB sẽ cần cả 4:
- Atomic primitive: views counter, likes counter, HLL.
- MULTI/WATCH: bid (đã làm).
- Lua: like toggle (phase 16).
- Distributed lock: payment processing (phase 17).

## Phase tiếp theo

Phase 16 sẽ học **Lua scripting** chi tiết. Lua cho phép:
- Logic if/else server-side.
- Atomic group lệnh + có thể abort.
- Hiệu năng cao (1 RTT, không retry).

Áp dụng cho:
- Refactor bid từ WATCH sang Lua (đơn giản hơn).
- Toggle like với atomic check.
- Distributed lock release (verify owner).

→ [Phase-16 — Bài 1: Lua scripting trong Redis](../phase-16/01-lua-scripting.md)

## Tóm tắt phase-15 (cô đọng)

- App RB có bid validation đầy đủ + carousel "most expensive".
- Race condition là **gặp ở mọi app multi-user** — phải biết khi nào và cách giải.
- 4 công cụ giải race: atomic primitive, MULTI/WATCH, Lua, distributed lock.
- Trade-off: complexity vs correctness vs performance.
- Pattern thực tế: WATCH với retry loop, backoff, max retry.
