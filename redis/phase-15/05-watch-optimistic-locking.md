# Bài 5: WATCH + optimistic locking

`WATCH` là cơ chế **optimistic locking** của Redis. Kết hợp với MULTI/EXEC, giải bài toán "ghi atomic dựa trên điều kiện đọc trước". Đây là pattern critical cho mọi conditional update.

## Optimistic vs Pessimistic locking

**Pessimistic locking** (SQL `SELECT FOR UPDATE`): khoá key trước, không ai khác đọc/ghi được, làm xong unlock. An toàn nhưng chậm + có thể deadlock.

**Optimistic locking**: không khoá. Đọc, làm việc, ghi. Khi ghi, **kiểm tra**: "có ai đã modify từ lúc tôi đọc không?". Có → reject, retry. Không → ghi thành công.

→ **Optimistic** scale tốt hơn (không lock thực), nhưng cần retry logic.

Redis chỉ hỗ trợ **optimistic** qua WATCH.

## Cú pháp WATCH

```text
WATCH key [key ...]
... (đọc và logic) ...
MULTI
... (lệnh write) ...
EXEC
```

`WATCH` đánh dấu key cần monitor. Giữa WATCH và EXEC:
- Nếu **bất kỳ ai modify** key đã watch → EXEC **fail** (trả null).
- Nếu không → EXEC thành công.

```text
WATCH counter
+OK

GET counter
"5"

MULTI
SET counter 6
EXEC
*1
1) +OK         ← thành công

# Nếu giữa WATCH và EXEC, client khác làm SET counter 100:
WATCH counter
GET counter → "5"
(client khác chen vào: SET counter 100)
MULTI
SET counter 6
EXEC
$-1            ← null, EXEC bị abort
```

## Hiểu sâu hơn — WATCH dùng cơ chế gì?

Redis maintain mỗi key một "version" (tăng mỗi khi modify). WATCH lưu snapshot version. EXEC check version: khác → fail.

**Chỉ check "was modified"** — không quan tâm modify thành gì. Nếu client khác SET counter 5 (cùng giá trị), vẫn count là modified → EXEC fail.

→ Có thể quá nghiêm trong vài case. Nhưng đảm bảo correctness.

## Pattern retry loop

```ts
async function bidOptimistic(itemId: string, userId: string, amount: number) {
  const conn = client.duplicate();    // ← cần connection riêng
  await conn.connect();
  
  try {
    for (let retry = 0; retry < 5; retry++) {
      await conn.watch(itemKey(itemId));
      
      const item = await getItemWith(conn, itemId);
      if (!item) {
        await conn.unwatch();
        throw new Error('Item not found');
      }
      if (item.endingAt.getTime() < Date.now()) {
        await conn.unwatch();
        throw new Error('Closed');
      }
      if (item.price >= amount) {
        await conn.unwatch();
        throw new Error('Bid too low');
      }
      
      const result = await conn.multi()
        .hSet(itemKey(itemId), { 
          price: amount.toString(),
          highestBidUserId: userId,
        })
        .hIncrBy(itemKey(itemId), 'bids', 1)
        .rPush(itemBidsKey(itemId), serializeBid({ userId, amount, time: new Date() }))
        .zAdd('items:price', { score: amount, value: itemId }, { GT: true })
        .exec();
      
      if (result !== null) {
        return;     // success
      }
      // result === null → key bị modify → retry
    }
    throw new Error('Bid failed after 5 retries');
  } finally {
    await conn.quit();
  }
}
```

Flow:
1. WATCH item key.
2. Read item, validate.
3. MULTI block với write.
4. EXEC. Null → retry.
5. Sau 5 retry fail → throw error (avoid infinite loop).

## Vì sao cần connection riêng?

`WATCH` state **per-connection**. Nếu app dùng chung 1 client cho mọi request, WATCH của request A có thể ảnh hưởng request B.

Pattern:
```ts
const conn = client.duplicate();
await conn.connect();
// dùng conn cho transaction này
await conn.quit();
```

Hoặc connection pool: mỗi transaction lấy 1 connection riêng.

→ Khác pipeline (`Promise.all` hoặc `client.multi()` không WATCH), dùng connection chung được.

## Vấn đề: UNWATCH

Nếu logic trước MULTI throw error (vd validation fail), WATCH state vẫn ở connection. Phải `UNWATCH` để cleanup:

```ts
try {
  await conn.watch(itemKey);
  const item = await getItem(itemId);
  if (item.price >= amount) {
    await conn.unwatch();       // ← cleanup
    throw new Error('Too low');
  }
  // ...
} catch (e) {
  await conn.unwatch();          // ← cleanup ở finally
  throw e;
}
```

Hoặc đơn giản: gọi UNWATCH cả ở finally để safe.

EXEC tự động clear WATCH (success or fail). DISCARD cũng clear.

## Quirk: retry không guarantee success

Nếu key cực hot (vd celebrity follower count), mỗi retry có thể fail tiếp. Cần:

1. **Limit retry** (vd 5 lần).
2. **Backoff giữa retry** (vd 10ms, 20ms, 50ms — exponential).
3. **Fallback nếu max retry**: throw "system busy", retry sau.

```ts
for (let retry = 0; retry < 5; retry++) {
  // ... watch + multi + exec
  if (result !== null) return;
  await sleep(2 ** retry * 10);    // 10, 20, 40, 80, 160ms
}
```

## Cluster + WATCH

WATCH chỉ làm việc với **keys cùng slot** trong Cluster. Phải hash tag nếu watch nhiều key.

```text
WATCH items#{X}:price items#{X}:bids     ← cùng hash tag
```

## So với Lua atomic

Lua script cũng atomic + có logic + read intermediate value. Khác:

| | WATCH/MULTI | Lua |
|---|---|---|
| Logic phức tạp | Hạn chế (chỉ check pre-condition) | Full programming |
| Retry tự động | Phải code | Không cần (chạy 1 lần) |
| Read intermediate | Phải đọc trước WATCH | Trong script |
| Lock contention | Optimistic — retry khi conflict | Server chạy tuần tự — không conflict |
| Debug | Pipeline mode rõ | Khó hơn |
| RTT | 1 RTT per attempt | 1 RTT total |

→ Lua thường **simpler + nhanh hơn** cho conditional update. WATCH dùng khi:
- Logic dài, cần JS runtime (vd dùng external lib).
- Đã có code WATCH legacy.

App RB sẽ dùng cả 2: WATCH ở phase 15, Lua ở phase 16.

## Apply cho createBid

Refactor cuối phase 15:

```ts
export async function createBid(attrs: CreateBidAttrs): Promise<void> {
  const conn = client.duplicate();
  await conn.connect();
  
  try {
    for (let retry = 0; retry < 5; retry++) {
      await conn.watch(itemKey(attrs.itemId));
      
      const item = await getItemWith(conn, attrs.itemId);
      if (!item) {
        await conn.unwatch();
        throw new Error('Item does not exist');
      }
      if (item.endingAt.getTime() < Date.now()) {
        await conn.unwatch();
        throw new Error('Item closed to bidding');
      }
      if (item.price >= attrs.amount) {
        await conn.unwatch();
        throw new Error('Bid too low');
      }
      
      const bid = {
        userId: attrs.userId,
        amount: attrs.amount,
        time: new Date(),
      };
      
      const result = await conn.multi()
        .rPush(itemBidsKey(attrs.itemId), serializeBid(bid))
        .hSet(itemKey(attrs.itemId), {
          price: attrs.amount.toString(),
          highestBidUserId: attrs.userId,
        })
        .hIncrBy(itemKey(attrs.itemId), 'bids', 1)
        .zAdd('items:price', { score: attrs.amount, value: attrs.itemId }, { GT: true })
        .exec();
      
      if (result !== null) return;
      await new Promise((r) => setTimeout(r, 10 * (retry + 1)));
    }
    throw new Error('Bid failed: too much contention');
  } finally {
    await conn.quit();
  }
}
```

Test stress: 15 bid click cùng lúc:
- 1 thắng.
- 14 fail "Bid too low" (đã có người bid cao hơn).
- Hoặc 1 vài "too much contention" nếu retry exceeded.

→ Bug đã fix.

## Tóm tắt bài 5

- WATCH = optimistic locking, đánh dấu key, EXEC fail nếu key bị modify giữa chừng.
- Pattern: WATCH → read → validate → MULTI → write → EXEC → retry nếu null.
- **Cần connection riêng** cho WATCH transaction.
- Phải UNWATCH ở error path để cleanup.
- Retry với backoff để tránh livelock.
- Lua thường simpler cho conditional update — sẽ học phase 16.

**Bài kế tiếp** → [Bài 6: Items by price + finishing bid feature](06-items-by-price.md)
