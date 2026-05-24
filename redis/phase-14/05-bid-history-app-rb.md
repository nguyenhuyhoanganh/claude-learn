# Bài 5: Bid history trong app RB — List in action

Áp dụng List cho feature **bid history** trong app RB. Đây là use case **append-only log** — List phù hợp. Bài này implement đầy đủ: ghi bid, lấy history với pagination, serialize/deserialize.

## Yêu cầu

Trang item detail có chart "bid price over time":

```text
$150 ┤             ●
$140 ┤        ●  
$130 ┤      ●
$120 ┤   ●
$110 ┤●
     └──────────────►
     T1 T2 T3 T4 T5
```

Mỗi bid là 1 entry với `userId`, `amount`, `time`. Chart hiển thị tối đa 50 bid gần nhất.

## Data design

```text
bids:item#<itemId>  List
  [bid1_json, bid2_json, bid3_json, ...]
```

Mỗi entry là JSON string của `{userId, amount, time}`.

Append-only (chỉ RPUSH), không update/delete bid → List phù hợp.

Alternative: Sorted Set với score = time. Nhưng List nhẹ hơn + đơn giản hơn cho use case này.

## Key generator

```ts
// src/services/keys.ts
export const itemBidsKey = (itemId: string) => `bids:item#${itemId}`;
```

## Bid entry type

```ts
type BidEntry = {
  userId: string;
  amount: number;
  time: Date;
};
```

## Serialize / Deserialize

```ts
// src/services/queries/items/bid-serialize.ts
import type { BidEntry } from '$lib/types';

export function serializeBid(bid: BidEntry): string {
  return JSON.stringify({
    userId: bid.userId,
    amount: bid.amount,
    time: bid.time.getTime(),     // store as Unix ms
  });
}

export function deserializeBid(raw: string): BidEntry {
  const obj = JSON.parse(raw);
  return {
    userId: obj.userId,
    amount: obj.amount,
    time: new Date(obj.time),
  };
}
```

Note: time được lưu dưới dạng Unix ms timestamp như đã học ở phase-6 bài 7 (datetime serialization).

## `createBid`

```ts
// src/services/queries/items/bids.ts
import { client } from '../../redis/client';
import { itemBidsKey, itemKey } from '../../keys';
import { serializeBid } from './bid-serialize';

export async function createBid(itemId: string, bid: BidEntry): Promise<void> {
  await Promise.all([
    // Append bid history
    client.rPush(itemBidsKey(itemId), serializeBid(bid)),
    
    // Update item highest bid
    client.hSet(itemKey(itemId), {
      price: bid.amount.toString(),
      highestBidUserId: bid.userId,
    }),
    
    // Update sort indexes
    client.zAdd('items:price', { score: bid.amount, value: itemId }),
    client.hIncrBy(itemKey(itemId), 'bids', 1),
    client.zIncrBy('items:bids', 1, itemId),
  ]);
}
```

5 lệnh trong 1 pipeline. ~1.5ms.

Phân tích từng lệnh:
1. **RPUSH** — append bid vào history list.
2. **HSET** — update `price` và `highestBidUserId` của item.
3. **ZADD** — update sort index theo price.
4. **HINCRBY** — tăng counter `bids` trong hash.
5. **ZINCRBY** — update sort index theo bids count.

→ 1 hành động "bid" → 5 cấu trúc Redis cần update. Đây là **write amplification** của Redis design. Đổi lại: mọi read sub-millisecond.

## Race condition khi bid

```text
Time | Client A (bid $120)        Client B (bid $130)
-----|------------------------------|------------------------------
T1   | RPUSH bids                  |
T2   |                              | RPUSH bids
T3   | HSET items#X price=$120     |
T4   |                              | HSET items#X price=$130
```

Result: bid list có cả 2, price=$130 (B thắng). **Hoạt động đúng** vì B bid sau và HSET sau.

Nhưng nếu thứ tự khác:
```text
Time | Client A (bid $130)        Client B (bid $120)
-----|------------------------------|------------------------------
T1   | RPUSH bids                  |
T2   |                              | RPUSH bids
T3   |                              | HSET items#X price=$120
T4   | HSET items#X price=$130     |
```

Result: price=$130, **đúng**.

Nhưng race ở step 4 với check trước:
```text
Read price=$110 (A)
Read price=$110 (B)
Decide bid $120 valid (A, > $110)
Decide bid $115 valid (B, > $110)
Both bid → price = max($120, $115) — bid của B technically nên reject
```

→ Cần **validation atomic**: "bid > current highest". Phải Lua hoặc WATCH/MULTI. Sẽ làm phase-17 (concurrency).

## `getBidHistory`

```ts
export async function getBidHistory(
  itemId: string,
  count = 50
): Promise<BidEntry[]> {
  // Lấy `count` bid gần nhất từ cuối list
  const raw = await client.lRange(itemBidsKey(itemId), -count, -1);
  
  // Deserialize
  const bids = raw.map(deserializeBid);
  
  // Reverse để newest first (LRANGE trả oldest first)
  return bids.reverse();
}
```

**LRANGE -count -1**: lấy `count` element cuối (= mới nhất, vì RPUSH append cuối).

Negative index nhanh: Redis "tail traversal" → O(count), không O(list_length).

## Render trang item detail

```ts
router.get('/items/:id', async (req, res) => {
  const itemId = req.params.id;
  const userId = req.session?.userId;
  
  const [item, bidHistory] = await Promise.all([
    getItem(itemId),
    getBidHistory(itemId, 50),
  ]);
  
  if (!item) return res.status(404).send('Not found');
  
  // Lấy user info cho mỗi bid
  const bidderIds = [...new Set(bidHistory.map((b) => b.userId))];
  const bidders = await getUsers(bidderIds);
  const biddersMap = new Map(bidderIds.map((id, i) => [id, bidders[i]]));
  
  const bidsWithUser = bidHistory.map((b) => ({
    ...b,
    bidder: biddersMap.get(b.userId),
  }));
  
  res.render('item-detail', { item, bids: bidsWithUser });
});
```

3-step lookup: item + bid history + bidders. 3 RTT pipeline. ~2ms.

## Pagination cho bid history

Nếu cần xem hết bid history (không chỉ 50 gần nhất):

```ts
async function getBidHistoryPaginated(
  itemId: string,
  page = 1,
  perPage = 20
): Promise<BidEntry[]> {
  const totalCount = await client.lLen(itemBidsKey(itemId));
  
  // Start từ cuối, mỗi page 20
  const stop = totalCount - 1 - (page - 1) * perPage;
  const start = Math.max(0, stop - perPage + 1);
  
  if (stop < 0) return [];
  
  const raw = await client.lRange(itemBidsKey(itemId), start, stop);
  return raw.map(deserializeBid).reverse();
}
```

Pagination bằng LRANGE với index tính từ cuối.

**Bẫy**: nếu bid mới được thêm giữa page 1 và page 2, có thể bị **trùng hoặc sót**. Workaround:
- Snapshot LLEN khi bắt đầu, dùng làm reference.
- Hoặc dùng Sorted Set với score = bidId.

## Trim bid history (cap)

Nếu chỉ care 1000 bid mới nhất:

```ts
async function createBid(itemId: string, bid: BidEntry) {
  await Promise.all([
    client.rPush(itemBidsKey(itemId), serializeBid(bid)),
    client.lTrim(itemBidsKey(itemId), -1000, -1),     // giữ 1000 cuối
    // ... các lệnh khác
  ]);
}
```

LTRIM với negative range = "giữ N cuối". Memory cap.

## So sánh List vs Sorted Set cho bid

Nếu chọn Sorted Set:

```ts
export const itemBidsKey = (itemId: string) => `bids:item#${itemId}`;

async function createBid(itemId: string, bid: BidEntry) {
  await client.zAdd(itemBidsKey(itemId), {
    score: bid.time.getTime(),    // hoặc bid.amount
    value: serializeBid(bid),
  });
}

async function getBidHistory(itemId: string, count = 50) {
  const raw = await client.zRange(itemBidsKey(itemId), 0, count - 1, { REV: true });
  return raw.map(deserializeBid);
}
```

**Sorted Set lợi**:
- Range query theo time: `ZRANGE BYSCORE` cho "bids trong 1h cuối".
- Range theo amount: lấy bids > $100.
- Mỗi bid unique theo serialized content.

**List lợi**:
- Đơn giản hơn (không cần score).
- Memory ~20% gọn hơn.
- Append O(1) chắc chắn (vs O(log N) Sorted Set).

Khoá chọn List cho đơn giản. Production thực có thể chọn Sorted Set tuỳ nhu cầu query.

## Verify trong Redis

```text
> LRANGE bids:item#xyz -5 -1
1) "{\"userId\":\"u1\",\"amount\":110,\"time\":1736935200000}"
2) "{\"userId\":\"u2\",\"amount\":120,\"time\":1736935260000}"
3) "{\"userId\":\"u1\",\"amount\":130,\"time\":1736935320000}"
4) "{\"userId\":\"u3\",\"amount\":140,\"time\":1736935380000}"
5) "{\"userId\":\"u2\",\"amount\":150,\"time\":1736935440000}"

> LLEN bids:item#xyz
(integer) 5

> HGET items#xyz price
"150"

> HGET items#xyz highestBidUserId
"u2"
```

## Tóm tắt bài 5

- App RB bid history = List với entry JSON.
- `createBid` update 5 cấu trúc trong 1 pipeline.
- `getBidHistory` dùng negative index để lấy N cuối nhanh.
- LTRIM để cap memory.
- Sorted Set có thể thay thế nếu cần range query — trade-off đơn giản vs query flexibility.

**Bài kế tiếp** → [Bài 6: Tổng kết phase-14 + transition tới phần advanced](06-tong-ket-list.md)
