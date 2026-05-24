# Bài 1: Bid validation — check trước khi append

App RB hiện cho phép bid bất kỳ giá nào, trên item bất kỳ, kể cả item đã đóng. Phase này thêm validation đầy đủ: item tồn tại, còn mở bid, amount đủ cao. Cùng đó là khám phá vấn đề **race condition** xuyên suốt phase.

## 3 validation rules

```text
POST /items/:id/bid {amount}
   │
   ▼
1. Item có tồn tại?     → 404 "Item does not exist"
2. Item còn mở bid?     → 400 "Item closed to bidding"
3. amount > current price? → 400 "Bid too low"
   │
   ▼
Continue to create bid
```

## Implement validation

```ts
// src/services/queries/items/bids.ts
import { client } from '../../redis/client';
import { itemBidsKey, itemKey } from '../../keys';
import { getItem } from './items';
import { serializeBid } from './bid-serialize';

export async function createBid(attrs: CreateBidAttrs): Promise<void> {
  // 1. Fetch item
  const item = await getItem(attrs.itemId);
  
  // 2. Validate: item tồn tại
  if (!item) {
    throw new Error('Item does not exist');
  }
  
  // 3. Validate: item còn mở bid
  if (item.endingAt.getTime() < Date.now()) {
    throw new Error('Item closed to bidding');
  }
  
  // 4. Validate: amount > price hiện tại
  if (item.price >= attrs.amount) {
    throw new Error('Bid too low');
  }
  
  // Đến đây mới create
  const bid = {
    userId: attrs.userId,
    amount: attrs.amount,
    time: new Date(),
  };
  
  await Promise.all([
    client.rPush(itemBidsKey(attrs.itemId), serializeBid(bid)),
    client.hSet(itemKey(attrs.itemId), {
      price: attrs.amount.toString(),
      highestBidUserId: attrs.userId,
      bids: (item.bids + 1).toString(),
    }),
    // Update sort indexes
    client.zAdd('items:price', { score: attrs.amount, value: attrs.itemId }),
    client.hIncrBy(itemKey(attrs.itemId), 'bids', 1),
  ]);
}
```

Logic:
- Step 1-4: validate. Throw error nếu fail.
- Bid object: tự generate time.
- Pipeline 4 lệnh Redis: append bid + update price + update sort index + increment bids.

## Test thử

```bash
npm run dev
```

1. Tạo item kết thúc 1 ngày trước → bid → error "Item closed to bidding".
2. Tạo item mới → bid $10 → OK. Bid lại $5 → error "Bid too low".
3. Bid $20 → OK. Bid lại $20 → error "Bid too low".

Validation hoạt động.

## Bug: race condition

Test stress: dùng browser DevTools script bấm nút "Place Bid" 15 lần liên tiếp:

```js
const button = $0;   // chọn nút Place Bid trước
for (let i = 0; i < 15; i++) {
  button.click();
}
```

Trên server, **15 request đến gần như đồng thời**. Mỗi request:
1. Fetch item (price = $10).
2. Validate (amount > $10 — pass cho mọi request gửi $11).
3. Update price = $11, bids += 1.

Result mong đợi: 1 bid success, 14 reject. **Result thực**: nhiều bid success (5-7 thường thấy).

## Vì sao bug xảy ra?

Đây là **race condition kinh điển read-then-write**.

```text
Time | Req A (bid $11)         Req B (bid $11)
-----|-------------------------|-------------------------
T1   | getItem → price=$10     |
T2   |                          | getItem → price=$10
T3   | validate $11 > $10 ✓     |
T4   |                          | validate $11 > $10 ✓
T5   | Update price=$11         |
T6   |                          | Update price=$11
```

Cả 2 đọc state cũ ($10), validate dựa trên state cũ, ghi đè nhau. **Cả 2 thành công** — sai logic auction.

→ Đây là **subject chính phase 15-17**: cách giải race condition trong Redis.

## 4 cách giải

Khoá học sẽ cover 4 approach:

| Approach | Khi nào | Phase |
|---|---|---|
| **1. Atomic primitive** (INCR, HINCRBY) | Counter, increment đơn giản | Bài 3 (phase này) |
| **2. Transaction** MULTI/EXEC + WATCH | Update group với check pre-condition | Bài 5-6 |
| **3. Lua script** | Logic phức tạp, atomic | Phase 16 |
| **4. Distributed lock** | Lock business operation rộng | Phase 17 |

Bài 2-3 chuyển sang giải bằng cách 1 (atomic primitive). Bài 5-6 dạy cách 2 (MULTI/WATCH). Phase 16-17 cho 3-4.

## Hiện tại: bug được "documented"

Phase này không sửa hết bug — chỉ thêm validation + làm cho bug rõ ràng. Sau khi học cách giải, sẽ refactor để thực sự atomic.

→ Pattern teaching tốt: **understand the bug → understand the solution**.

## Mở rộng: bid amount validation chính xác

```ts
if (item.price >= attrs.amount) {
  throw new Error('Bid too low');
}
```

→ Cho phép bid bằng giá hiện tại không? Tuỳ business rule:
- Strict: `attrs.amount <= item.price` reject.
- Lenient: `attrs.amount < item.price` reject (cho phép tie).

Hầu hết auction: strict. Code trên là strict (`>=`).

## Mở rộng: minimum increment

Cho phép $0.01 nhảy giá ít? Hay phải nhảy ít nhất $1?

```ts
const MIN_INCREMENT = 0.01;
if (attrs.amount < item.price + MIN_INCREMENT) {
  throw new Error(`Bid must be at least $${(item.price + MIN_INCREMENT).toFixed(2)}`);
}
```

Hợp business hơn — tránh war bid spam $0.0001.

## Tóm tắt bài 1

- 3 validation: item exists, not ended, amount > current price.
- Pipeline 4 lệnh để update hash + sort index + bid list.
- **Bug race condition** xuất hiện ngay khi traffic cao.
- 4 cách giải sẽ học dần qua phase 15-17.
- Validation done nhưng app vẫn có bug — sẽ fix dần.

**Bài kế tiếp** → [Bài 2: Update item với pipeline + concurrency issue chi tiết](02-pipeline-va-bug-cu-the.md)
