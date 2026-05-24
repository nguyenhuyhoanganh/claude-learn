# Bài 3: HLL trong app RB — unique view counter siêu tiết kiệm memory

Bài 4 phase-9 đã implement unique view với Set. Bài này refactor sang HLL — minh chứng thực tế cho memory saving. Đồng thời tổng kết phase-13.

## Vấn đề với Set approach

```text
viewers:item#42  Set {user_id_1, user_id_2, ..., user_id_1M}
```

- 1M viewers × ~30 byte (UUID) = ~30 MB per popular item.
- 10k item phổ biến = **300 GB**. Vượt RAM 1 instance.

## Refactor sang HLL

Thay Set bằng HLL:

```text
viewers_hll:item#42  HLL (12 KB cố định)
```

- 10k item × 12 KB = **120 MB**. Acceptable trên 1 instance bình thường.

Tỷ lệ tiết kiệm: ~**2500x**.

Đánh đổi: sai số 0.81% trong count. Cho "views = 1234567" thay vì "views = 1239876" thực tế — chấp nhận được cho UI display.

## Implementation

### Key generator

```ts
// src/services/keys.ts
export const itemViewsHllKey = (itemId: string) => `viewers_hll:item#${itemId}`;
```

(Đổi tên từ `itemViewersKey` để rõ ràng dùng HLL.)

### Update `viewItem`

```ts
// src/services/queries/items/views.ts
import { client } from '../../redis/client';
import { itemKey, itemViewsHllKey, itemsByViewsKey } from '../../keys';

export async function viewItem(userId: string, itemId: string): Promise<void> {
  // PFADD trả 1 nếu HLL state thay đổi (lần đầu — probabilistic)
  const isNew = await client.pfAdd(itemViewsHllKey(itemId), userId);
  
  if (isNew === 1) {
    await Promise.all([
      client.hIncrBy(itemKey(itemId), 'views', 1),
      client.zIncrBy(itemsByViewsKey(), 1, itemId),
    ]);
  }
}
```

Đổi 1 dòng: `sAdd → pfAdd`. Mọi logic còn lại giữ nguyên.

### Đọc unique view count

```ts
export async function getUniqueViews(itemId: string): Promise<number> {
  return await client.pfCount(itemViewsHllKey(itemId));
}
```

Hoặc đọc cached counter từ hash (faster, không sai số):
```ts
const item = await getItem(itemId);
const cachedViews = item.views;
```

Cached counter trong hash **chính xác** (vì là kết quả của HINCRBY mỗi khi PFADD trả 1). Sai số chỉ xuất hiện nếu PFADD false negative (rất hiếm cho small set).

Trade-off: cached count chính xác hơn PFCOUNT vì là delta tracking, nhưng vẫn có thể sai do PFADD false negative.

## Test thực

```bash
npm run dev
```

1. Sign up + create item.
2. Vào item detail → view count tăng từ 0 → 1.
3. Refresh 100 lần → vẫn 1 (HLL recognize same user).
4. Verify Redis:
   ```text
   > PFCOUNT viewers_hll:item#xyz
   (integer) 1
   > HGET items#xyz views
   "1"
   > MEMORY USAGE viewers_hll:item#xyz
   (integer) 80         # sparse encoding, chỉ ~80 byte với 1 element
   ```

Trên sparse, HLL nhỏ rất gọn. Khi vượt threshold → convert dense → 12 KB.

5. Sign up account khác, view → count = 2.
6. Đẩy script tạo 100k user view:
   ```ts
   for (let i = 0; i < 100_000; i++) {
     await client.pfAdd('viewers_hll:item#xyz', `user_${i}`);
   }
   ```
7. Verify:
   ```text
   > PFCOUNT viewers_hll:item#xyz
   (integer) 100132          # sai số ~0.13% trong case này
   > MEMORY USAGE viewers_hll:item#xyz
   (integer) 12304           # dense encoding, ~12 KB
   ```

Sai số 100,000 ± 810. Acceptable cho UI.

## Trade-off thực tế

### Lợi

- Memory giảm **~2500x** so với Set với 1M viewer.
- Performance không khác (cả 2 đều O(1)).
- Đơn giản code (đổi 1 dòng).

### Bất tiện

- **Không còn answer "user X đã view item Y?"** — PFADD không có membership check thực sự (return value xấp xỉ).
- Sai số 0.81% — không dùng cho audit.

App RB không cần "user X đã view chưa?" → HLL phù hợp. Nếu cần (vd "recommend item X tới user chưa view Y") → giữ Set hoặc Bitmap.

## Khi nào KHÔNG dùng HLL cho view counter

1. **Item nhỏ, vài chục viewer**: Set rẻ hơn 12 KB HLL fixed.
2. **Cần check "user X xem chưa?"** (vd recommendation engine).
3. **Compliance / billing đếm view → tính tiền**: cần chính xác.

→ Nếu trong app RB có "recommendation" feature dùng "user chưa xem item nào" — phải giữ Set, hoặc dùng song song (Set cho membership + HLL cho count).

## Pattern song song Set + HLL

Khi cần cả "ai đã xem" và "count":

```ts
export async function viewItem(userId: string, itemId: string) {
  const isNewInSet = await client.sAdd(itemViewersKey(itemId), userId);
  if (isNewInSet === 1) {
    await Promise.all([
      client.hIncrBy(itemKey(itemId), 'views', 1),
      client.zIncrBy(itemsByViewsKey(), 1, itemId),
      client.pfAdd(itemViewsHllKey(itemId), userId),    // duplicate cho count fast
    ]);
  }
}
```

- Set: source of truth, exact, support membership.
- HLL: fast count cho large item.

Memory:
- Item < 1000 viewer: Set ~30 KB.
- Item 1M+ viewer: Set ~30 MB + HLL 12 KB ≈ 30 MB (HLL ko đáng kể).

→ HLL không giúp **cho item small/medium**, chỉ giúp khi item rất phổ biến. Hybrid:

```ts
if (await client.sCard(itemViewersKey(itemId)) > 100_000) {
  // Migrate sang HLL-only
  await client.del(itemViewersKey(itemId));
}
```

→ Complex. Đa số app không cần optimization này.

## Mặt khác: HLL cho global metrics

HLL rất hợp cho **global counter** không cần membership:

```ts
// Daily unique visitors toàn site
async function trackVisitor(userId: string) {
  const today = todayString();
  await client.pfAdd(`unique_visitors:${today}`, userId);
}

async function getDAU(date: string) {
  return await client.pfCount(`unique_visitors:${date}`);
}
```

Memory: 12 KB / day × 365 days = ~4.4 MB / year. Không đáng kể.

So với Set: 1M user × 30 byte × 365 day = 11 GB / year. Lưu trữ Set không feasible cho dài hạn.

## Use case khác cho app RB

### Unique search queries

```ts
async function trackSearch(query: string) {
  const today = todayString();
  await client.pfAdd(`unique_searches:${today}`, query.toLowerCase());
}

// Top distinct search queries cho 7 ngày
const dauKeys = lastNDays(7).map((d) => `unique_searches:${d}`);
const distinctSearches7d = await client.pfCount(...dauKeys);
```

### Unique bidders per auction

```ts
async function trackBid(userId: string, itemId: string) {
  await client.pfAdd(`unique_bidders:item#${itemId}`, userId);
}

async function getUniqueBidderCount(itemId: string) {
  return await client.pfCount(`unique_bidders:item#${itemId}`);
}
```

→ Hiển thị "157 bidders" trên trang auction. Count xấp xỉ OK.

## Tóm tắt phase-13

Phase-13 đã hoàn thành:
- **HyperLogLog là gì** — probabilistic counter, 12 KB cố định (Bài 1).
- **PFADD/PFCOUNT/PFMERGE chi tiết** + aggregation pyramid (Bài 2).
- **HLL trong app RB** — refactor unique view, hybrid pattern (Bài 3).

3 lệnh duy nhất, 1 use case chính (approximate unique count). Cấu trúc nhỏ nhưng cực hữu ích cho metrics/analytics.

**Phase tiếp theo** (phase-14 = Section 15): **List** — kiểu dữ liệu thứ 7, dùng cho queue, recent items, bid history. Đây là kiểu cuối trước khi vào các topic nâng cao.

→ [Phase-14 — Bài 1: List là gì?](../phase-14/01-list-la-gi.md)
