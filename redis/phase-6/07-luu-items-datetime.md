# Bài 7: Lưu items — serialize datetime

Resource Hash thứ 3 (sau User và Session): **Item** — auction trong app RB. Item phức tạp hơn: có **2 field DateTime** (`createdAt`, `endingAt`), nhiều field số. Bài này đi qua cách serialize Date đúng và lý do dùng Unix milliseconds.

## Type của Item

```ts
type CreateItemAttrs = {
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

10+ field với nhiều type khác nhau. Mọi field này sẽ thành **string trong Redis hash**. Vấn đề: 2 field Date.

## Vì sao không lưu Date bằng `toString()` mặc định?

Lib `node-redis` nếu nhận Date sẽ gọi `Date.toString()`:

```ts
new Date().toString()
// → "Wed Jan 15 2026 10:00:00 GMT+0700 (Indochina Time)"
```

Vấn đề với format này:
1. **Phụ thuộc locale + timezone** — chạy server US sẽ khác server VN.
2. **Khó parse lại** trong code (`new Date("Wed Jan ...")` không reliable).
3. **Khó query** trong Redis. Nếu sau này muốn "lấy item ending trong 1 giờ tới" — không thể so sánh string `"Wed Jan 15"` với `"Wed Jan 16"`.

## Lựa chọn format cho Date

Có 3 lựa chọn phổ biến:

### Lựa chọn 1: ISO 8601 string

```text
"2026-01-15T10:00:00.000Z"
```

✓ Human-readable.  
✓ Universal format.  
✗ Vẫn là string — Redis không sort/range được bằng số.

### Lựa chọn 2: Unix timestamp seconds

```text
"1736935200"      (= Wed Jan 15 2026 10:00:00 UTC)
```

✓ Là số — sort/range được khi cần.  
✓ Compact (10 ký tự).  
✗ Chỉ giây — không chính xác đến ms.

### Lựa chọn 3: Unix timestamp milliseconds

```text
"1736935200000"   (= Wed Jan 15 2026 10:00:00.000 UTC)
```

✓ Là số — sort/range được.  
✓ Chính xác millisecond.  
✗ 13 ký tự, hơi dài hơn.

→ **Khoá học chọn lựa chọn 3** (ms). Lý do: app là **auction** — phải chính xác tới ms khi quyết định ai bid trước (tránh tie ở seconds). Pháp lý đấu giá thường yêu cầu này.

## Convention nhất quán: timestamp ms cho mọi Date

```text
createdAt:  "1736935200000"
endingAt:   "1736938800000"
```

Khi đọc về:
```text
new Date(parseInt("1736935200000", 10))
// → Wed Jan 15 2026 10:00:00 GMT+0000
```

## Tách `serialize.ts` riêng

Item có 10+ field với 2 Date, nhiều number. File `items.ts` chính sẽ phình to. Tách:

```text
src/services/queries/items/
├── items.ts            (createItem, getItem, getItems)
├── serialize.ts        (serialize)
└── deserialize.ts      (deserialize)
```

> Khi resource có < 10 field đơn giản (như User, Session), inline trong cùng file. Khi resource phức tạp, tách. Đây là cảm quan, không phải luật.

## Implement `serialize.ts`

```ts
// services/queries/items/serialize.ts
import type { CreateItemAttrs } from '$lib/types';

export function serialize(attrs: CreateItemAttrs) {
  return {
    ...attrs,
    createdAt: attrs.createdAt.toMillis().toString(),
    endingAt: attrs.endingAt.toMillis().toString(),
  };
}
```

Chú ý:

1. **Spread `...attrs` trước**: copy mọi field plain (string, number).
2. **Override `createdAt` và `endingAt`** sau spread với converted version.
3. `toMillis()` là helper của library `luxon` (DateTime class). Nếu dùng vanilla Date:
   ```ts
   createdAt: String(attrs.createdAt.getTime()),
   ```

### Vì sao `.toString()` cuối?

`getTime()` trả `number`. Khi `HSET`, lib sẽ tự call `String(num)`. Nhưng explicit tốt hơn — không phụ thuộc behavior lib.

### Vì sao spread tốt?

```ts
return { ...attrs, createdAt: ..., endingAt: ... };
```

Nếu liệt tay từng field:

```ts
return {
  ownerId: attrs.ownerId,
  name: attrs.name,
  description: attrs.description,
  imageUrl: attrs.imageUrl,
  price: attrs.price,
  views: attrs.views,
  likes: attrs.likes,
  bids: attrs.bids,
  createdAt: ...,
  endingAt: ...,
  highestBidUserId: attrs.highestBidUserId,
};
```

→ Dài, dễ quên field khi thêm.

Spread + override giúp:
- Tự động pick up field mới khi type thay đổi.
- Chỉ liệt rõ field nào **cần convert**.

**Trade-off**: nếu attrs có field "rác" (debug, validation), spread sẽ lưu cả. Cần đảm bảo `CreateItemAttrs` type clean.

## Implement `createItem`

```ts
// services/queries/items/items.ts
import { client } from '../../redis/client';
import { itemKey } from '../../keys';
import { genId } from '$lib/utils/id';
import { serialize } from './serialize';
import type { CreateItemAttrs } from '$lib/types';

export async function createItem(attrs: CreateItemAttrs): Promise<string> {
  const id = genId();
  await client.hSet(itemKey(id), serialize(attrs));
  return id;
}
```

`itemKey` thêm vào `keys.ts`:

```ts
export const itemKey = (id: string) => `items#${id}`;
```

5 dòng — đúng pattern của `createUser`.

## Test với form `/items/new`

Frontend đã có form trong app. Submit:

```text
POST /items/new
body: { name: "Vintage Piano", description: "...", duration: 3600 }
```

Backend (mock):
```ts
router.post('/items/new', async (req, res) => {
  const id = await createItem({
    ownerId: req.session.userId,
    name: req.body.name,
    description: req.body.description,
    imageUrl: req.body.imageUrl,
    price: 0,
    views: 0,
    likes: 0,
    bids: 0,
    createdAt: new Date(),
    endingAt: new Date(Date.now() + req.body.duration * 1000),
    highestBidUserId: null,
  });
  res.redirect(`/items/${id}`);
});
```

Trong Redis:

```text
> HGETALL items#xyz
 1) "ownerId"        2) "abc-123"
 3) "name"           4) "Vintage Piano"
 5) "description"    6) "Beautiful old piano"
 7) "imageUrl"       8) "https://..."
 9) "price"         10) "0"
11) "views"         12) "0"
13) "likes"         14) "0"
15) "bids"          16) "0"
17) "createdAt"     18) "1736935200000"    ← ms timestamp
19) "endingAt"      20) "1736938800000"    ← ms timestamp
21) "highestBidUserId"  22) ""             ← null → empty string?
```

## Vấn đề với `highestBidUserId: null`

`null` truyền vào lib → **error** (nhắc lại từ [phase-5 bài 1](../phase-5/01-hset-quirks.md)).

Fix trong serialize:

```ts
export function serialize(attrs: CreateItemAttrs) {
  return {
    ownerId: attrs.ownerId,
    name: attrs.name,
    description: attrs.description,
    imageUrl: attrs.imageUrl,
    price: attrs.price.toString(),
    views: attrs.views.toString(),
    likes: attrs.likes.toString(),
    bids: attrs.bids.toString(),
    createdAt: attrs.createdAt.getTime().toString(),
    endingAt: attrs.endingAt.getTime().toString(),
    highestBidUserId: attrs.highestBidUserId ?? '',   // ← null → ""
  };
}
```

Convention: `null` field → empty string `""`. Deserialize sau sẽ convert lại.

Hoặc cách khác: **bỏ field** nếu null:

```ts
const result: Record<string, any> = { /* ... mọi field non-null */ };
if (attrs.highestBidUserId !== null) {
  result.highestBidUserId = attrs.highestBidUserId;
}
return result;
```

Deserialize sẽ check `raw.highestBidUserId || null`.

Khoá học chọn cách empty string vì simpler.

## Convert number → string nhất quán

```ts
price: attrs.price.toString(),
views: attrs.views.toString(),
```

Mọi number explicit convert. Lib làm hộ nếu bạn không, nhưng:
- **Explicit > implicit**: rõ ràng để đọc code.
- **Tránh edge case**: với `NaN`, `Infinity`, behavior `String()` khác giữa lib.

## Tóm tắt code đầy đủ

```ts
// services/queries/items/serialize.ts
import type { CreateItemAttrs } from '$lib/types';

export function serialize(attrs: CreateItemAttrs) {
  return {
    ownerId: attrs.ownerId,
    name: attrs.name,
    description: attrs.description,
    imageUrl: attrs.imageUrl,
    price: attrs.price.toString(),
    views: attrs.views.toString(),
    likes: attrs.likes.toString(),
    bids: attrs.bids.toString(),
    createdAt: attrs.createdAt.getTime().toString(),
    endingAt: attrs.endingAt.getTime().toString(),
    highestBidUserId: attrs.highestBidUserId ?? '',
  };
}
```

```ts
// services/queries/items/items.ts
import { client } from '../../redis/client';
import { itemKey } from '../../keys';
import { genId } from '$lib/utils/id';
import { serialize } from './serialize';

export async function createItem(attrs: CreateItemAttrs): Promise<string> {
  const id = genId();
  await client.hSet(itemKey(id), serialize(attrs));
  return id;
}
```

## Bonus: TTL cho item?

Item không có TTL — đây là **data master**. Item tồn tại đến khi:
- Auction kết thúc (status thay đổi, không xoá).
- User chủ động xoá (`DEL itemKey(id)`).

Khác Session: Session có TTL vì là data **tạm**.

## Pitfalls khi làm việc với Date trong Redis

### Pitfall 1: timezone confusion

```ts
new Date('2026-01-15')        // 00:00:00 LOCAL time
new Date('2026-01-15T00:00:00Z')  // 00:00:00 UTC
```

Sai locale → lưu sai timestamp. **Quy ước team**: mọi Date trong code là **UTC**. UI render convert sang local timezone của user.

### Pitfall 2: precision khác giữa các runtime

```ts
// Browser, Node modern
new Date().getTime()    // ms precision

// Một số embedded runtime
Date.now()              // có thể chỉ giây
```

Node/browser hiện đại đảm bảo ms. Test trên runtime target.

### Pitfall 3: parsing chậm

`new Date(parseInt(str, 10))` — fast (vài μs). `new Date(isoString)` — chậm hơn (parsing). Với deserialize hàng nghìn record, chọn ms.

## Tóm tắt bài 7

- Lưu Date trong Redis: **Unix timestamp milliseconds** (string).
- Tách `serialize.ts` riêng khi resource phức tạp (10+ field).
- Spread `...attrs` + override field cần convert.
- `null` → empty string (hoặc bỏ field), convention nhất quán.
- Item là data master, không có TTL.

**Bài kế tiếp** → [Bài 8: Fetch item — deserialize phức tạp](08-fetch-item-deserialize.md)
