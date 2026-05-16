# Bài 4: Unique view counter với Set

Bài cuối phase-9. Implement feature **đếm view duy nhất** — mỗi user chỉ count 1 view cho 1 item (refresh trang nhiều lần không tăng count). Đây là sự kết hợp đẹp giữa Set (uniqueness) + Hash counter, áp dụng Lua atomic để tránh race.

## Yêu cầu (nhắc lại từ phase-6 bài 1)

- User chưa login view item → không count.
- User đã login view item lần đầu → count +1.
- User đã login view item refresh nhiều lần → vẫn 1 count.
- Count hiển thị trên item card (carousel "most viewed").

## Data design

```text
items#<itemId> → field "views": cached counter
viewers:item#<itemId> → Set userIds đã view item này
```

Pattern y hệt like:
- Set lưu **ai đã view**.
- Hash field lưu **count cached**.

## Key generator

```ts
// src/services/keys.ts
export const itemViewersKey = (itemId: string) => `viewers:item#${itemId}`;
```

## Implement `viewItem`

```ts
// src/services/queries/items/views.ts
import { client } from '../../redis/client';
import { itemViewersKey, itemKey } from '../../keys';

export async function viewItem(userId: string | null, itemId: string): Promise<void> {
  if (!userId) {
    return;     // anonymous → không count
  }
  
  // SADD trả 1 nếu lần đầu, 0 nếu đã view
  const isNewViewer = await client.sAdd(itemViewersKey(itemId), userId);
  
  if (isNewViewer === 1) {
    await client.hIncrBy(itemKey(itemId), 'views', 1);
  }
}
```

Logic giống `likeItem` bài 2:
- SADD return value = idempotency check.
- Chỉ HINCRBY khi thực sự lần đầu.

2 RTT cho lần đầu, 1 RTT cho lần sau (chỉ SADD).

## Route handler

```ts
router.get('/items/:id', async (req, res) => {
  const itemId = req.params.id;
  const userId = req.session?.userId ?? null;
  
  // Fire-and-forget: tracking không block render
  viewItem(userId, itemId).catch(console.error);
  
  // Render bình thường
  const item = await getItem(itemId);
  if (!item) return res.status(404).send('Not found');
  res.render('item-detail', { item });
});
```

**`fire-and-forget` pattern**: không `await` `viewItem` — không block render. Nếu Redis chậm 100ms, user vẫn thấy trang ngay.

Trade-off:
- ✓ Không trễ render.
- ✗ Nếu Redis fail, view count bị mất (không retry).

Đối với view count, mất 1 vài lần OK — nó là metric "best effort". Cho operation quan trọng (payment), KHÔNG dùng fire-and-forget.

## Race condition giữa SADD và HINCRBY

```text
Time | Client A                       Client B
-----|--------------------------------|------------------------
T1   | SADD viewers:item#X user42 → 1 |
T2   |                                | SADD viewers:item#X user42 → 0
T3   | HINCRBY items#X views 1        |
T4   |                                | (skip — isNewViewer = 0)
```

Trường hợp trên OK — Redis single-threaded đảm bảo SADD tuần tự, lần thứ 2 trả 0 → đúng.

Race khác: app crash giữa SADD và HINCRBY:

```text
SADD viewers:item#X user42 → 1
[server crashes]
# HINCRBY never executes
# → user42 ở viewers nhưng counter không tăng → lệch
```

Mitigation: Lua atomic.

```lua
-- view_item.lua
local isNew = redis.call('SADD', KEYS[1], ARGV[1])
if isNew == 1 then
  return redis.call('HINCRBY', KEYS[2], 'views', 1)
end
return -1
```

Gọi:
```ts
await client.eval(LUA, {
  keys: [itemViewersKey(itemId), itemKey(itemId)],
  arguments: [userId],
});
```

Atomic: cả 2 lệnh hoặc cùng chạy hoặc cùng không.

## Câu hỏi: Set sẽ phình to với item phổ biến

Item phổ biến (viral) có 1M viewer → Set 1M phần tử × 30 byte ID = ~30 MB / item. 10k item phổ biến = 300 GB. Có thể vượt RAM.

**Mitigation**:

1. **TTL cho Set**: chỉ giữ unique-view trong 1 tháng:
   ```text
   EXPIRE viewers:item#X 2592000     # 30 ngày
   ```
   Sau 30 ngày, "fresh start" — user có thể được count lại.

2. **HyperLogLog thay Set**: count xấp xỉ (sai số ~0.8%) với chỉ 12 KB / item bất kể có bao nhiêu viewer.
   ```ts
   await client.pfAdd(`viewers:item#${id}:hll`, userId);
   const count = await client.pfCount(`viewers:item#${id}:hll`);
   ```
   → Sẽ học phase-13.

3. **Limit Set size**: chỉ track 100k viewer đầu, sau đó tăng count bằng probabilistic sampling.

→ Trade-off chính xác vs memory. Cho count display thường, HyperLogLog acceptable. Cho audit "user X có view item Y không?", phải Set.

## Vì sao không INCR mỗi view (không cần Set)?

```ts
// Cách "đơn giản" — không phải unique
await client.hIncrBy(itemKey(itemId), 'views', 1);
```

Sai vì:
- User F5 nhiều lần → count nổ.
- Bot crawler view 1000 lần → fake count.

→ Yêu cầu "unique per user" bắt buộc phải có Set (hoặc HyperLogLog).

## Pattern: "Recently viewed by user"

Bonus feature: hiển thị "Sản phẩm bạn đã xem" cho user.

```ts
export const userViewedKey = (userId: string) => `viewed:user#${userId}`;

export async function trackUserView(userId: string, itemId: string) {
  // Bi-directional: viewers + viewed
  await Promise.all([
    client.sAdd(itemViewersKey(itemId), userId),
    client.sAdd(userViewedKey(userId), itemId),
  ]);
}
```

Khi user vào dashboard:
```ts
const recentlyViewedIds = await client.sMembers(userViewedKey(userId));
const items = await getItems(recentlyViewedIds);
```

Lại bi-directional index. Trade-off memory để có cả 2 chiều query.

Nếu cần **thứ tự thời gian** (xem gần đây nhất lên đầu), Set không đủ — cần Sorted Set với timestamp làm score (sẽ học phase-10).

## Bonus: BITMAP thay cho Set với user id integer

Nếu user id là **integer tăng dần** (1, 2, 3, ..., N), có thể dùng bitmap:

```text
SETBIT viewers_bm:item#X 42 1     # user 42 đã view
GETBIT viewers_bm:item#X 42        # check: 1 nếu đã view
BITCOUNT viewers_bm:item#X         # đếm số viewer
```

Memory: 1 bit/user → 1M user = 125 KB. **240x tiết kiệm** so với Set string (30 MB).

Trade-off:
- ✓ Memory siêu gọn.
- ✗ Phụ thuộc id integer dense (không có gap lớn).
- ✗ Không lưu được UUID — chỉ integer.

App RB dùng UUID → không phù hợp bitmap. App với integer id (vd auto-increment SQL → Redis cache): bitmap rất đáng.

## Test thực

```bash
npm run dev
```

1. Sign up + create item.
2. Lần đầu vào `/items/<id>` → views = 1.
3. Refresh nhiều lần → views vẫn 1.
4. Sign out, sign up account khác, vào cùng item → views = 2.
5. Verify:
   ```text
   > SMEMBERS viewers:item#xyz
   1) "alice"
   2) "bob"
   > HGET items#xyz views
   "2"
   ```

## Tóm tắt phase-9

Phase-9 đã hoàn thành 3 feature lớn dùng Set:
- **Username uniqueness** (Bài 1): SADD/SISMEMBER + secondary index hash.
- **Like system** (Bài 2): bi-directional set + cached counter, Lua atomic.
- **Common likes / liked items** (Bài 3): SINTER + getItems pipeline.
- **Unique view counter** (Bài 4): Set + HINCRBY, fire-and-forget, Lua atomic.

App RB hiện có Hash, Set hoạt động. Còn thiếu: sort/pagination, search, real-time bid history.

**Phase tiếp theo** (phase-10 = Section 11): **Sorted Set** — kiểu dữ liệu thứ 5, dùng cho leaderboard, ranking, time-based ordering. Đây là cấu trúc mạnh nhất Redis có.

→ [Phase-10 — Bài 1: Sorted Set là gì?](../phase-10/01-sorted-set-la-gi.md)
