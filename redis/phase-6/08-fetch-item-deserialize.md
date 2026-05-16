# Bài 8: Fetch item — deserialize phức tạp

Bài cuối phase-6. Implement `getItem` — đối xứng với `createItem` bài 7. Đây là **chỗ deserialize có nhiều việc nhất**: parse ms timestamp → Date, parse string → number/float, convert empty string → null. Pattern này dùng được cho mọi resource Hash phức tạp.

## Goal

```ts
export async function getItem(id: string): Promise<Item | null> {
  // 1. HGETALL từ Redis
  // 2. Empty check
  // 3. Deserialize raw → Item
  // 4. Return
}
```

Type `Item` (đầy đủ):

```ts
type Item = {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  imageUrl: string;
  price: number;
  views: number;
  likes: number;
  bids: number;
  createdAt: Date;
  endingAt: Date;
  highestBidUserId: string | null;
};
```

## Implement `getItem`

```ts
// services/queries/items/items.ts
import { client } from '../../redis/client';
import { itemKey } from '../../keys';
import { serialize } from './serialize';
import { deserialize } from './deserialize';
import { genId } from '$lib/utils/id';

export async function createItem(attrs: CreateItemAttrs): Promise<string> {
  const id = genId();
  await client.hSet(itemKey(id), serialize(attrs));
  return id;
}

export async function getItem(id: string): Promise<Item | null> {
  const item = await client.hGetAll(itemKey(id));
  if (Object.keys(item).length === 0) return null;
  return deserialize(id, item);
}
```

## Implement `deserialize.ts`

```ts
// services/queries/items/deserialize.ts
import type { Item } from '$lib/types';

export function deserialize(
  id: string,
  item: Record<string, string>
): Item {
  return {
    id,
    ownerId: item.ownerId,
    name: item.name,
    description: item.description,
    imageUrl: item.imageUrl,
    
    // Number conversions
    price: parseFloat(item.price),
    views: parseInt(item.views, 10),
    likes: parseInt(item.likes, 10),
    bids: parseInt(item.bids, 10),
    
    // Date conversions
    createdAt: new Date(parseInt(item.createdAt, 10)),
    endingAt: new Date(parseInt(item.endingAt, 10)),
    
    // Nullable string
    highestBidUserId: item.highestBidUserId || null,
  };
}
```

15 dòng. Đi qua từng nhóm:

### Nhóm 1: pass-through strings

```ts
ownerId: item.ownerId,
name: item.name,
description: item.description,
imageUrl: item.imageUrl,
```

Field đã là string trong app type → copy thẳng. Không có conversion.

### Nhóm 2: number conversions

```ts
price: parseFloat(item.price),
views: parseInt(item.views, 10),
likes: parseInt(item.likes, 10),
bids: parseInt(item.bids, 10),
```

**`parseFloat` vs `parseInt`**:
- `parseFloat("5.30")` → `5.3` (số thập phân).
- `parseInt("5.30", 10)` → `5` (bỏ phần thập phân).
- `parseInt("237", 10)` → `237`.

Quy tắc:
- **`price`** là tiền (có thập phân) → `parseFloat`.
- **`views`, `likes`, `bids`** là count integer → `parseInt`.

> **Radix 10 bắt buộc**: `parseInt("037")` không có radix → một số runtime cũ parse hệ 8 → `31`. `parseInt("037", 10)` luôn đúng = `37`. Lint rule (`radix`) yêu cầu.

### Nhóm 3: Date conversion

```ts
createdAt: new Date(parseInt(item.createdAt, 10)),
endingAt: new Date(parseInt(item.endingAt, 10)),
```

Hai bước:
1. `parseInt(str, 10)` — string `"1736935200000"` → number `1736935200000`.
2. `new Date(num)` — constructor Date nhận ms timestamp → Date object.

`new Date(string)` cũng work với ISO format, nhưng:
- Slow hơn (parsing).
- Edge case với timezone string.

→ Số ms → Date là cách an toàn nhất.

### Nhóm 4: nullable

```ts
highestBidUserId: item.highestBidUserId || null,
```

Convention bài 7: null → empty string `""` khi serialize. Deserialize ngược lại: empty string → null.

`||` trick: `"" || null` → `null`. `"abc-123" || null` → `"abc-123"`.

**Bẫy**: nếu giá trị thật có thể là `"0"` hoặc `"false"`, `||` sẽ chuyển thành null sai. Cần check explicit:

```ts
highestBidUserId: item.highestBidUserId === '' ? null : item.highestBidUserId,
```

Trong app này user id luôn là UUID-like non-empty → `||` đủ. Cẩn thận với field khác.

## Test thực tế

```bash
npm run dev
```

Flow:
1. Sign up + login.
2. Tạo item: `/items/new` → submit form.
3. Redirect tới `/items/<id>` → trang hiển thị item.

Backend `/items/:id`:

```ts
router.get('/items/:id', async (req, res) => {
  const item = await getItem(req.params.id);
  if (!item) return res.status(404).send('Not found');
  
  res.render('item-detail', { item });
});
```

Template `item-detail`:

```html
<h1>{{ item.name }}</h1>
<p>{{ item.description }}</p>
<img src="{{ item.imageUrl }}" />
<p>Price: ${{ item.price.toFixed(2) }}</p>
<p>Ending: {{ item.endingAt.toLocaleString() }}</p>
<p>Views: {{ item.views }} | Likes: {{ item.likes }} | Bids: {{ item.bids }}</p>
```

Nếu serialize/deserialize đúng:
- `item.price.toFixed(2)` chạy (vì `price` là number).
- `item.endingAt.toLocaleString()` chạy (vì `endingAt` là Date).
- `item.views` hiển thị số, không phải `"237"` quote.

Nếu serialize/deserialize sai (vd quên `parseFloat`):
- `item.price.toFixed` không tồn tại trên string → **runtime error**.

→ Deserialize hoạt động như **schema enforcement** runtime: ép data về type app dùng.

## Vì sao thêm `id` từ ngoài vào?

Như đã giải thích bài 5: Redis hash **không lưu id** (đã có trong key). Caller pass id vào `deserialize(id, raw)` để thêm vào object trả.

Nếu quên:
```ts
// SAI
function deserialize(item: Record<string, string>) {
  return { /* không có id */ };
}

// gọi:
const it = deserialize(raw);
// rest of app: console.log(it.id) → undefined
```

→ Bug âm thầm vì id thiếu mà không có error. Phát hiện chậm.

**Pattern**: signature `deserialize(id, raw)` để TypeScript enforce caller phải pass id.

## Test edge cases

### Test 1: item không tồn tại

```ts
const it = await getItem('nonexistent');
console.log(it);   // null
```

✓ `Object.keys({}).length === 0` → return null.

### Test 2: item với `highestBidUserId = null`

Sau khi tạo item mới (chưa ai bid):

```ts
const it = await getItem(newId);
console.log(it.highestBidUserId);   // null  ← từ ""
```

✓ `"" || null` → null.

### Test 3: item với date xa

```ts
await createItem({ ..., endingAt: new Date('2030-01-01') });
const it = await getItem(id);
console.log(it.endingAt instanceof Date);   // true
console.log(it.endingAt.getFullYear());     // 2030
```

✓ Round-trip Date hoạt động.

### Test 4: item với price 0

```ts
await createItem({ ..., price: 0 });
const it = await getItem(id);
console.log(it.price);            // 0 (number)
console.log(typeof it.price);     // "number"
```

✓ `parseFloat("0")` → `0`.

### Test 5: HGETALL trên kiểu key khác (vd accidentally SET)

```ts
await client.set('items#wrong', 'string-value');
const it = await getItem('wrong');
// → WRONGTYPE error
```

Để handle gracefully:

```ts
export async function getItem(id: string): Promise<Item | null> {
  try {
    const item = await client.hGetAll(itemKey(id));
    if (Object.keys(item).length === 0) return null;
    return deserialize(id, item);
  } catch (err) {
    if (err.message.includes('WRONGTYPE')) return null;
    throw err;
  }
}
```

Trong app sạch, key luôn dùng `itemKey()` → không cần try/catch. Cẩn thận khi migrate từ codebase cũ.

## Performance

- HGETALL trên hash 12 field: O(12) ~10 μs.
- 1 round-trip: ~0.5ms.
- deserialize JS-side: O(1) per field, ~5 μs cho 12 field.
- Tổng: ~0.5ms / call.

Trên app traffic ~1k req/s, page item-detail thực hiện ~1 `getItem` per request → throughput ổn từ 1 instance Redis.

## Bonus: nếu cần nhiều item cùng lúc

```ts
export async function getItems(ids: string[]): Promise<(Item | null)[]> {
  if (ids.length === 0) return [];
  
  const pipeline = client.multi();
  for (const id of ids) {
    pipeline.hGetAll(itemKey(id));
  }
  const results = await pipeline.exec();
  
  return ids.map((id, i) => {
    const raw = results[i] as Record<string, string>;
    return Object.keys(raw).length === 0 ? null : deserialize(id, raw);
  });
}
```

Use case: render carousel hiển thị 10 item top. 1 round-trip lấy 10 hash.

## Pattern tổng quan đã học phase-6

Cho mỗi resource Hash:

```text
src/services/
  keys.ts                              ← <entity>Key(id)
  queries/
    <entity>.ts (đơn giản)             ← create + get + serialize/deserialize inline
    <entity>/                          ← (phức tạp)
      <entity>.ts                      ← create + get
      serialize.ts                     ← serialize(attrs) → Record<string, string>
      deserialize.ts                   ← deserialize(id, raw) → Entity
```

`create<Entity>`:
1. `genId()` → id.
2. `client.hSet(key, serialize(attrs))`.
3. Return id.

`get<Entity>ById`:
1. `client.hGetAll(key)` → raw.
2. `Object.keys(raw).length === 0 ? null : deserialize(id, raw)`.

Mọi resource Hash đi qua đúng skeleton này.

## Tóm tắt phase-6

Phase-6 đã hoàn thành:
- App overview + 25 operations cần implement (Bài 1).
- Decision framework: 3 resource Hash + 3 cấu trúc khác (Bài 2).
- `createUser` với HSET object syntax (Bài 3).
- Serialize/deserialize pattern + lý do (Bài 4).
- `getUserById` với empty check + id injection (Bài 5).
- Session pattern hoàn chỉnh — auth flow, TTL, cookie (Bài 6).
- `createItem` với datetime serialization → Unix ms (Bài 7).
- `getItem` với deserialize phức tạp: Date, number, nullable (Bài 8).

Đã có **3 resource Hash hoạt động đầy đủ**: User, Session, Item.

Còn thiếu: secondary index (find user by username), Like/View (Set), Bid (List), Sort/Search/Pagination. Sẽ học ở phase tiếp.

**Phase tiếp theo** (phase-7 = Section 08 trong transcript): **Pipelining Commands** — batch nhiều lệnh trong 1 round-trip để boost throughput từ 10k → 100k+ ops/s.

→ [Phase-7 — Bài 1: Pipelining là gì và vì sao cần?](../phase-7/01-pipelining-la-gi.md)
