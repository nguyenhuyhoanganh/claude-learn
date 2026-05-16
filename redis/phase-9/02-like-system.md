# Bài 2: Like system — bi-directional set & atomic count

Implement chức năng **like/unlike** cho item, kèm hiển thị đếm số like. Đây là feature dùng đủ 3 kỹ thuật: SADD/SREM với return value, atomic counter trong hash, SISMEMBER cho UI state.

## Yêu cầu

Item detail page:
- Có nút "Like" (toggle).
- Hiển thị **số like** real-time.
- Khi user F5, button vẫn ở đúng state (liked/unliked).
- Sản phẩm cùng like khi click 2 lần liên tiếp chỉ count 1 lần (idempotent).

## Data design

Phase-8 đã chọn:

```text
likes:user#<userId>    → Set của itemIds user đã like
liked_by:item#<itemId> → Set của userIds đã like item
items#<itemId> → field "likes": counter cached
```

3 cấu trúc cho 1 feature — vì sao? Mỗi cái phục vụ query khác nhau:

| Query | Cấu trúc dùng |
|---|---|
| "User X like những item nào?" (profile page) | `SMEMBERS likes:user#X` |
| "Item Y có những ai like?" | `SMEMBERS liked_by:item#Y` |
| "Item Y có bao nhiêu like?" (UI badge) | `HGET items#Y likes` |
| "User X đã like item Y chưa?" (button state) | `SISMEMBER liked_by:item#Y X` |

Tất cả O(1). Trade-off: 3 nơi phải sync khi like/unlike.

## Key generators

```ts
// src/services/keys.ts
export const userLikesKey   = (userId: string) => `likes:user#${userId}`;
export const itemLikedByKey = (itemId: string) => `liked_by:item#${itemId}`;
// itemKey đã có sẵn từ phase-6
```

## Implement `likeItem`

```ts
// src/services/queries/likes.ts
import { client } from '../redis/client';
import { userLikesKey, itemLikedByKey, itemKey } from '../keys';

export async function likeItem(userId: string, itemId: string): Promise<boolean> {
  // SADD trả 1 nếu mới thêm, 0 nếu đã có
  const inserted = await client.sAdd(userLikesKey(userId), itemId);
  
  if (inserted === 0) {
    return false;       // đã like rồi, không count thêm
  }
  
  // Atomic: thêm vào index ngược + tăng counter
  await Promise.all([
    client.sAdd(itemLikedByKey(itemId), userId),
    client.hIncrBy(itemKey(itemId), 'likes', 1),
  ]);
  
  return true;
}
```

Phân tích:

**1. `SADD userLikesKey ...` trả về 0 hoặc 1**:
- 1 = user vừa like lần đầu — cần update các cấu trúc khác.
- 0 = user đã like rồi (click nút 2 lần) — KHÔNG count thêm.

→ Đây là **idempotency mechanism**. Không cần check trước bằng SISMEMBER (sẽ là 2 RTT). Dùng return value của SADD.

**2. Update song song**:
- Thêm user vào `liked_by` set (reverse index).
- Tăng counter `likes` trong hash item — atomic (HINCRBY).

3 RTT total: 1 cho SADD + 1 pipeline cho 2 lệnh sau.

## Implement `unlikeItem`

```ts
export async function unlikeItem(userId: string, itemId: string): Promise<boolean> {
  const removed = await client.sRem(userLikesKey(userId), itemId);
  
  if (removed === 0) {
    return false;       // chưa like, không cần làm gì
  }
  
  await Promise.all([
    client.sRem(itemLikedByKey(itemId), userId),
    client.hIncrBy(itemKey(itemId), 'likes', -1),
  ]);
  
  return true;
}
```

Tương tự, SREM trả 1 nếu thật sự xoá, 0 nếu không có gì để xoá. Idempotent.

## Implement helper `userLikesItem`

```ts
export async function userLikesItem(userId: string, itemId: string): Promise<boolean> {
  return (await client.sIsMember(itemLikedByKey(itemId), userId)) === 1;
}
```

→ Dùng để render button state ("Liked" vs "Like").

## Route handler — toggle

```ts
// POST /items/:id/like
router.post('/items/:id/like', requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const itemId = req.params.id;
  
  const isLiked = await userLikesItem(userId, itemId);
  
  if (isLiked) {
    await unlikeItem(userId, itemId);
  } else {
    await likeItem(userId, itemId);
  }
  
  res.redirect(`/items/${itemId}`);
});
```

**Bẫy**: Giữa `userLikesItem` và `unlikeItem`, một client khác có thể chèn vào → race. Trong case này hậu quả nhỏ (chỉ đảo trạng thái 1 lần). Production nghiêm túc dùng Lua:

```lua
-- toggle_like.lua
if redis.call('SADD', KEYS[1], ARGV[2]) == 1 then
  redis.call('SADD', KEYS[2], ARGV[1])
  redis.call('HINCRBY', KEYS[3], 'likes', 1)
  return 'liked'
else
  redis.call('SREM', KEYS[1], ARGV[2])
  redis.call('SREM', KEYS[2], ARGV[1])
  redis.call('HINCRBY', KEYS[3], 'likes', -1)
  return 'unliked'
end
```

Atomic toggle: trong 1 lệnh, hoặc liked hoặc unliked, không thể có state "nửa vời".

## Render item detail với context user

```ts
router.get('/items/:id', async (req, res) => {
  const itemId = req.params.id;
  const userId = req.session?.userId;
  
  const [item, isLiked] = await Promise.all([
    getItem(itemId),
    userId ? userLikesItem(userId, itemId) : false,
  ]);
  
  if (!item) return res.status(404).send('Not found');
  
  res.render('item-detail', {
    item,
    isLiked,                    // for button state
    likeCount: item.likes,      // from hash field
  });
});
```

Note: `item.likes` lấy từ hash field, **không** cần `SCARD liked_by:item#X` mỗi lần. Counter cached, đọc cùng với item, không tốn thêm RTT.

## Vì sao cached counter thay vì SCARD?

Lý do quan trọng — đáng nhớ.

### Cách A: Đếm bằng SCARD mỗi lần

```ts
const likeCount = await client.sCard(itemLikedByKey(itemId));
```

→ 1 lệnh thêm khi render. SCARD O(1) — không vấn đề.

### Cách B: Cached counter trong hash

```ts
const item = await getItem(itemId);
const likeCount = item.likes;     // free, đã có
```

→ 0 lệnh thêm.

Cả hai đều fast. **Vì sao chọn B?**

**Lý do 1: Item luôn được fetch — counter "free"**.

Mọi render item-detail đều `HGETALL items#<id>`. Counter là 1 field thêm, không thêm cost.

**Lý do 2: Sort theo số like — cần counter là field hash**.

App có sort items by likes (dashboard, search). Sort không thể đụng vào set `liked_by:*` — phải có field number trong hash item, lưu thành Sorted Set bên ngoài.

**Lý do 3: Search index**.

RediSearch (phase-18) index field của hash. Field `likes` integer được index, có thể query "items có likes > 10". Nếu chỉ có set, RediSearch không index được.

→ **Cached counter là design quyết định**, không phải tối ưu nhỏ. Đầu tư hash field + sync với set.

## Bẫy: counter lệch với set

Nếu có bug làm SADD chạy mà HINCRBY không (lỗi network giữa các lệnh), `item.likes` lệch với `SCARD liked_by:item#X`.

**Cơ chế phòng vệ**:
1. **Lua script** đảm bảo atomic (xem ở trên).
2. **Reconciliation job**: chạy hàng đêm so sánh `item.likes` với `SCARD`, fix lệch.

Job mẫu:
```ts
async function reconcileLikeCounts() {
  for await (const itemKey of client.scanIterator({ MATCH: 'items#*' })) {
    const itemId = itemKey.split('#')[1];
    const cachedCount = parseInt(await client.hGet(itemKey, 'likes') || '0');
    const actualCount = await client.sCard(itemLikedByKey(itemId));
    if (cachedCount !== actualCount) {
      await client.hSet(itemKey, 'likes', actualCount.toString());
      console.warn(`Fixed item ${itemId}: ${cachedCount} → ${actualCount}`);
    }
  }
}
```

## Câu hỏi: tại sao 2 set riêng, không "fan-out" 1 hướng?

Hai design alternative:

**Alt 1: chỉ `likes:user#X` (forward)**.
- Query "items user X like": SMEMBERS — OK.
- Query "ai like item Y": phải `SCAN` mọi user set + check — **không khả thi**.

**Alt 2: chỉ `liked_by:item#Y` (backward)**.
- Query "ai like item Y": SMEMBERS — OK.
- Query "items user X like": phải SCAN mọi item set + check — **không khả thi**.

→ **Cần cả 2** vì cả 2 query đều phổ biến. Memory gấp đôi nhưng O(1) cả 2 chiều.

Đây là **bi-directional index pattern** — kinh điển trong NoSQL design.

## Test thực

1. Sign up + create item.
2. Vào item detail → click Like:
   ```text
   > SMEMBERS likes:user#alice
   1) "item-xyz"
   > SMEMBERS liked_by:item#xyz
   1) "alice"
   > HGET items#xyz likes
   "1"
   ```
3. Refresh page → button vẫn "Unlike" (state correct).
4. Click Unlike → mọi cấu trúc trở về:
   ```text
   > SMEMBERS likes:user#alice
   (empty)
   > HGET items#xyz likes
   "0"
   ```

## Tóm tắt bài 2

- Like system = SADD (forward) + SADD (backward) + HINCRBY counter cached.
- Return value SADD/SREM (0/1) làm cơ chế idempotent — tránh count nhiều lần khi click nhanh.
- Cached counter trong hash để: free khi HGETALL, sort-able, search-indexable.
- Race condition giải bằng Lua atomic script.
- Reconciliation job chạy đêm để fix lệch counter (defensive programming).

**Bài kế tiếp** → [Bài 3: Liked items + Common likes (intersection)](03-liked-items-intersection.md)
