# Bài 3: Liked items + Common likes (intersection trên app)

Profile page hiển thị 2 section:
1. **Items they like** — items mà user xem (host) đã like.
2. **Items you both like** — items mà cả viewer và host cùng like.

Cả 2 đều dùng Set, nhưng pattern khác nhau. Bài này áp dụng intersection thực, kèm pipeline để fetch hash sau khi có IDs.

## Bước 1 — "Items they like"

Logic 2 bước:
1. Lấy set IDs items user đã like.
2. Fetch hash của từng item theo IDs đó.

```ts
// src/services/queries/likes.ts
import { client } from '../redis/client';
import { userLikesKey } from '../keys';
import { getItems } from './items/items';

export async function getLikedItems(userId: string): Promise<Item[]> {
  const ids = await client.sMembers(userLikesKey(userId));
  if (ids.length === 0) return [];
  
  const items = await getItems(ids);
  return items.filter((it): it is Item => it !== null);
}
```

Bước 2 = `getItems(ids)` từ phase-7 (pipeline `HGETALL` cho mọi id). **Tái sử dụng** thay vì viết mới.

**Filter null**: `getItems` trả `(Item | null)[]` — có thể có items đã bị xoá nhưng vẫn còn trong set (rare). Filter để UI khỏi crash.

### Performance

```text
Sets có 50 IDs:
  SMEMBERS: 1 RTT, O(50)
  getItems pipeline 50 HGETALL: 1 RTT
Total: 2 RTT ≈ 1ms
```

User có 10k+ liked items: cần `SSCAN` paginated thay `SMEMBERS`. Sẽ làm sau với pagination.

## Bước 2 — "Items you both like" (intersection)

```ts
export async function getCommonLikedItems(
  userIdA: string,
  userIdB: string
): Promise<Item[]> {
  const ids = await client.sInter([
    userLikesKey(userIdA),
    userLikesKey(userIdB),
  ]);
  if (ids.length === 0) return [];
  
  const items = await getItems(ids);
  return items.filter((it): it is Item => it !== null);
}
```

Pattern y chang `getLikedItems`, chỉ thay SMEMBERS bằng SINTER.

**Cú pháp node-redis**: `client.sInter([key1, key2])` — pass array key, không phải varargs.

### Vì sao không SINTERSTORE?

```ts
// Alternative dùng STORE
await client.sInterStore('temp:common', [userALikes, userBLikes]);
const ids = await client.sMembers('temp:common');
await client.del('temp:common');
```

3 RTT, lưu kết quả tạm rồi xoá. **Không cần** ở case này:
- Intersection nhỏ (ít item).
- Gọi 1 lần per page render.
- Không tái sử dụng kết quả.

SINTERSTORE phù hợp khi:
- Set lớn (1M+), intersection tốn nhiều giây.
- Cùng intersection được query nhiều lần.
- Cache 5-15 phút để giảm load.

→ Quy tắc: **default SINTER**, đổi sang SINTERSTORE khi đo lường thấy chậm.

## Route handler — profile page

```ts
router.get('/users/:id', async (req, res) => {
  const profileUserId = req.params.id;
  const currentUserId = req.session?.userId;
  
  // Lấy user info
  const profileUser = await getUserById(profileUserId);
  if (!profileUser) return res.status(404).send('User not found');
  
  // 2 query song song qua Promise.all
  const [theirLikes, commonLikes] = await Promise.all([
    getLikedItems(profileUserId),
    currentUserId && currentUserId !== profileUserId
      ? getCommonLikedItems(currentUserId, profileUserId)
      : Promise.resolve([]),
  ]);
  
  res.render('profile', {
    profileUser,
    theirLikes,
    commonLikes,
  });
});
```

Phân tích:
- `getUserById` first (cần check user tồn tại).
- 2 query likes song song.
- Edge case: user xem chính mình → không cần common likes.

### Performance trang profile

```text
1 HGETALL (getUserById)   : 1 RTT
2 song song (likes queries): 2 RTT max
  Mỗi query = SMEMBERS/SINTER + getItems pipeline
Total: ~3 RTT ≈ 1.5ms
```

Render < 5ms total. Nhanh.

## Trang khác có thể dùng intersection

### "Friends of friends"

```ts
async function getMutualFollows(userIdA: string, userIdB: string) {
  return await client.sInter([
    `follows:user#${userIdA}`,
    `follows:user#${userIdB}`,
  ]);
}
```

→ "Bạn chung" trong app social.

### Search by multiple criteria

```ts
async function searchItems(filters: { color?: string; size?: string; brand?: string }) {
  const keys: string[] = [];
  if (filters.color) keys.push(`items:color#${filters.color}`);
  if (filters.size) keys.push(`items:size#${filters.size}`);
  if (filters.brand) keys.push(`items:brand#${filters.brand}`);
  
  if (keys.length === 0) return await getAllItemIds();
  
  return await client.sInter(keys);
}
```

→ Faceted search exact match. Bộ lọc càng nhiều, kết quả càng hẹp.

> Search phức tạp (full-text, ranking) cần RediSearch (phase-18). Set chỉ tốt cho exact-match facet.

## Cảnh báo: intersection với set khổng lồ

Set follower của celebrity có ~10M phần tử. Intersection 2 celeb:

```text
SINTER followers:celeb_A followers:celeb_B
```

Có thể chặn **vài giây** — không acceptable cho user-facing.

Mitigation:
1. **SINTERSTORE + TTL** — cache kết quả 1 giờ.
2. **Approximate**: HyperLogLog cho count, không intersection thật.
3. **Pre-compute background**: tính sẵn intersection của các cặp phổ biến.
4. **Limit input**: chỉ intersect các set < 100k phần tử.

Trong app RB, user trung bình like ~50 item → intersection nhỏ, không lo.

## Bẫy: order matter cho SDIFF (đã nhắc bài 2 phase-8)

```text
SDIFF likes:user#alice likes:user#bob   # alice like, bob không
SDIFF likes:user#bob likes:user#alice   # bob like, alice không
```

**Không commutative**. Khác SINTER (commutative).

Use case: "items I like that they don't" — gợi ý chia sẻ.

## Hiển thị badge "X bạn chung"

```ts
async function countCommonLikes(userIdA: string, userIdB: string): Promise<number> {
  // SINTERCARD (Redis ≥ 7.0) — đếm intersection không cần trả mảng
  return await client.sInterCard([
    userLikesKey(userIdA),
    userLikesKey(userIdB),
  ]);
}
```

`SINTERCARD` chỉ trả count, không trả mảng → nhanh hơn `SINTER` với set lớn.

`SINTERCARD [LIMIT N]` còn nhanh hơn: dừng sớm khi đếm tới N.

```text
SINTERCARD 2 followers:A followers:B LIMIT 100
```

Useful khi UI chỉ cần "≥ 100" không cần con số chính xác.

## Tóm tắt bài 3

- "Items they like" = SMEMBERS + getItems pipeline → 2 RTT.
- "Common likes" = SINTER + getItems pipeline → 2 RTT.
- Default SINTER (không STORE) cho query 1 lần. STORE khi cần cache.
- Bi-directional index không cần khi query đơn hướng (vd SDIFF).
- SINTERCARD (Redis 7+) cho count đếm intersection không cần mảng.

**Bài kế tiếp** → [Bài 4: Unique view counter với Set](04-unique-view.md)
