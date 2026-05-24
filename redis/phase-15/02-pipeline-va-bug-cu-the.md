# Bài 2: Pipeline cho update + concurrency bug chi tiết

Bài này phân tích **chính xác** bug race condition đã thấy ở bài 1. Hiểu nó là tiền đề cho mọi giải pháp ở các bài sau.

## Recap code có bug

```ts
export async function createBid(attrs: CreateBidAttrs) {
  const item = await getItem(attrs.itemId);       // ① READ
  
  if (!item) throw new Error('Item does not exist');
  if (item.endingAt.getTime() < Date.now()) throw new Error('Closed');
  if (item.price >= attrs.amount) throw new Error('Too low');
  
  await Promise.all([                              // ② WRITE
    client.rPush(itemBidsKey(attrs.itemId), serializeBid(...)),
    client.hSet(itemKey(attrs.itemId), {
      price: attrs.amount.toString(),
      highestBidUserId: attrs.userId,
      bids: (item.bids + 1).toString(),
    }),
    client.zAdd('items:price', { score: attrs.amount, value: attrs.itemId }),
  ]);
}
```

Pattern: **READ → process → WRITE**. Đây là **read-then-write race**.

## Diagram chi tiết

```text
═══════════════════════════════════════════════════════════════
              Hai client cùng bid $11 trên item có price = $10
═══════════════════════════════════════════════════════════════

Time  │ Client A (bid $11)              Client B (bid $11)
──────┼─────────────────────────────────────────────────────────
 t1   │ getItem(X) → ① RTT to Redis
 t2   │                                  getItem(X) → ① RTT
 t3   │ ◄── { price: 10, bids: 5 }
 t4   │                                  ◄── { price: 10, bids: 5 }
 t5   │ validate: 11 > 10 ✓
 t6   │                                  validate: 11 > 10 ✓
 t7   │ HSET price=11, bids=6 → ② RTT
 t8   │                                  HSET price=11, bids=6 → ② RTT
 t9   │ ◄── OK
 t10  │                                  ◄── OK
═══════════════════════════════════════════════════════════════
            Result: price=11, bids=6   ← chỉ tăng 1
            Bid list: 2 bids appended
            ⚠️  Bids counter LỆCH với bid list length
═══════════════════════════════════════════════════════════════
```

Cụ thể:
- Bid list: `RPUSH` 2 lần → có 2 entry mới (đúng).
- Bids counter: cả 2 ghi `bids = item.bids + 1 = 6` → counter chỉ tăng từ 5 → 6 (sai, đáng lý 5 → 7).
- Price: cả 2 ghi $11 → result $11 (đúng).

→ **Bids counter lệch**. Bid list length 2 (đúng) ≠ counter 6 (đáng lý 7).

## Tại sao xảy ra — single-threaded mà còn race?

Redis single-threaded mà! Sao có race?

**Answer**: Redis xử lý mỗi **lệnh** atomic, nhưng KHÔNG đảm bảo "group of lệnh" atomic. Giữa lệnh 1 và lệnh 2 của cùng client, **lệnh của client khác có thể chen**.

```text
Lệnh trong queue Redis:
[A: HGET items#X, A: HGET, B: HGET, A: HSET, B: HSET]

Redis xử lý tuần tự:
1. A's HGET    → price=10
2. A's HGET    → bids=5
3. B's HGET    → price=10 (chưa được ghi)
4. A's HSET    → price=11, bids=6
5. B's HSET    → price=11, bids=6 (ghi đè)
```

→ Race không phải do Redis, mà do **logic ứng dụng** đọc + xử lý + ghi qua nhiều round-trip.

## Cách 1: Loại bỏ READ với atomic primitives

Quan sát: nếu thay `bids: (item.bids + 1)` bằng atomic `HINCRBY items#X bids 1`, **không cần đọc bids trước**:

```ts
// Bỏ phần read bids từ item, dùng HINCRBY
await client.hIncrBy(itemKey(itemId), 'bids', 1);
```

`HINCRBY` atomic — Redis tính `current_value + 1` server-side. Không cần app đọc trước.

Refactor:

```ts
export async function createBid(attrs: CreateBidAttrs) {
  const item = await getItem(attrs.itemId);
  if (!item) throw new Error('Item does not exist');
  if (item.endingAt.getTime() < Date.now()) throw new Error('Closed');
  if (item.price >= attrs.amount) throw new Error('Too low');
  
  await Promise.all([
    client.rPush(itemBidsKey(attrs.itemId), serializeBid({...})),
    client.hSet(itemKey(attrs.itemId), {
      price: attrs.amount.toString(),
      highestBidUserId: attrs.userId,
    }),
    client.hIncrBy(itemKey(attrs.itemId), 'bids', 1),    // ← atomic
    client.zAdd('items:price', { score: attrs.amount, value: attrs.itemId }),
  ]);
}
```

Bây giờ:
- **Bids counter** atomic correct (mỗi bid → +1, không lệch).
- **Bid list length** = bids counter. ✓
- Nhưng **price** vẫn race: cả 2 client set $11 (cùng giá trị) — không vấn đề.

## Vấn đề còn lại: validation race

Vấn đề bigger: **validation** "price >= amount" dựa trên price ĐÃ ĐỌC:

```text
Client A bids $11, sees price=10, validate pass.
Client B bids $11.50, sees price=10 (chưa ghi), validate pass.

A's HSET price=11
B's HSET price=11.50

Final price=11.50 → B thắng.

Nhưng A nhận "success" → tưởng mình thắng. SAI.
```

→ HSET atomic không giải. Cần **conditional update**: "chỉ ghi nếu price chưa thay đổi từ lúc tôi đọc".

Đây là điểm **MULTI/EXEC + WATCH** vào.

## Cách 2 preview: MULTI/EXEC + WATCH

```ts
const isolatedClient = client.duplicate();
await isolatedClient.connect();

await isolatedClient.watch(itemKey(itemId));     // theo dõi key

const item = await getItem(itemId, isolatedClient);
if (item.price >= attrs.amount) {
  await isolatedClient.unwatch();
  throw new Error('Too low');
}

const multi = isolatedClient.multi();
multi.hSet(itemKey(itemId), { price: amount.toString(), ... });
const result = await multi.exec();

if (!result) {
  throw new Error('Bid lost due to concurrent bid — retry');
}
```

`WATCH` đánh dấu key. Nếu **bất kỳ ai** modify key giữa WATCH và EXEC, EXEC **fail** (trả null). Caller phải retry.

→ Optimistic locking. Lock-free, scale tốt. Sẽ học chi tiết bài 5.

## Khi naive race là OK?

Không phải mọi race condition cần fix. Ví dụ:

- **To-do app**: user A và B cùng mark task = "done" → cả 2 thành công → state cuối "done" (đúng intent của cả 2).
- **Last write wins**: vd update user profile, accept ghi đè.
- **Counter approximations**: vd page view count, ±1 không quan trọng.

→ Trước khi fix race, hỏi: **business có bị ảnh hưởng?**.

Bid auction → race **chắc chắn xấu**: 2 user tưởng họ thắng. Phải fix.

## Tóm tắt bài 2

- Race condition không phải do Redis (single-threaded), mà do logic **read-then-write** xuyên nhiều round-trip.
- Atomic primitives (INCR, HINCRBY, ZINCRBY) fix race cho **single counter**, không cho conditional update.
- Conditional update cần WATCH/MULTI/EXEC hoặc Lua.
- Validation phase: hiểu chính xác bug.
- Một số race là OK — depend on business logic.

**Bài kế tiếp** → [Bài 3: Atomic primitives — giải race condition cấp 1](03-atomic-primitives.md)
