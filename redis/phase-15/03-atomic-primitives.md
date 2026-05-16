# Bài 3: Atomic primitives — giải race condition cấp 1

Cách giải đơn giản nhất cho race: thay logic "read → modify → write" bằng **single atomic command**. Bài này list các atomic primitives Redis có, đối chiếu với "natural fix" cho từng loại race.

## Vì sao "atomic primitive" giải race?

Atomic primitive = 1 command thực hiện cả 3 step ở Redis server:
1. Read current value.
2. Modify.
3. Write back.

Vì Redis single-threaded, bước 1-3 **không thể bị xen** bởi command khác. Race biến mất.

## Catalogue atomic primitives đã học

| Operation | Lệnh | Use case |
|---|---|---|
| Increment integer (String) | `INCR`, `INCRBY` | View count, balance cents |
| Decrement integer | `DECR`, `DECRBY` | Stock count, credit |
| Increment float | `INCRBYFLOAT` | Rate, percentage (not money) |
| Set with conditions | `SET key val NX EX 30` | Lock, idempotency |
| Get + set new value | `SET key val GET` | Swap, replace token |
| Increment hash field | `HINCRBY`, `HINCRBYFLOAT` | Counter per object |
| Set hash field if not exist | `HSETNX` | Initialize field once |
| Add to set | `SADD` | Unique-check via return |
| Remove from set | `SREM` | Cleanup |
| Move element between sets | `SMOVE` | State transition |
| Add to sorted set | `ZADD`, `ZADD GT`/`LT` | Monotonic update |
| Increment score | `ZINCRBY` | Leaderboard |
| Push/pop list | `LPUSH`, `RPOP`, `BLPOP` | Queue |
| Move element between lists | `LMOVE`, `BLMOVE` | Reliable queue |
| Append HLL | `PFADD` | Unique count |
| Set bit | `SETBIT` | Boolean flag per id |

→ Mỗi cái là **1 lệnh, atomic**. Khi pattern app match được vào danh sách này → không cần MULTI/Lua.

## Pattern phổ biến: replace "GET + compute + SET" với atomic

### Counter
❌ Read-then-write:
```ts
const count = parseInt(await client.get('views') || '0');
await client.set('views', (count + 1).toString());
```

✓ Atomic:
```ts
await client.incr('views');
```

### Counter per hash
❌
```ts
const item = await client.hGet(itemKey(id), 'views');
await client.hSet(itemKey(id), 'views', (parseInt(item) + 1).toString());
```

✓
```ts
await client.hIncrBy(itemKey(id), 'views', 1);
```

### Stock decrement (chỉ nếu > 0)
❌
```ts
const stock = parseInt(await client.hGet(itemKey, 'stock'));
if (stock > 0) {
  await client.hSet(itemKey, 'stock', (stock - 1).toString());
}
```

→ Race: 2 client thấy stock=1, cả 2 decrement → stock = -1 hoặc 0 với 2 sale (sai).

✓ Lua atomic:
```lua
local stock = tonumber(redis.call('HGET', KEYS[1], 'stock'))
if stock == nil or stock <= 0 then return -1 end
return redis.call('HINCRBY', KEYS[1], 'stock', -1)
```

(Sẽ học Lua phase 16. Tạm dùng HINCRBY rồi check kết quả < 0 → revert.)

### Distributed lock
❌
```ts
const owner = await client.get('lock:X');
if (!owner) {
  await client.set('lock:X', myId);
}
```

→ Race: 2 client thấy nil, cả 2 set → cả 2 nghĩ mình giữ lock.

✓ Atomic:
```ts
const acquired = await client.set('lock:X', myId, { NX: true, EX: 30 });
if (acquired) { /* I have the lock */ }
```

### Idempotent insert
❌
```ts
const exists = await client.sIsMember('voted', userId);
if (!exists) {
  await client.sAdd('voted', userId);
  await client.hIncrBy(post, 'votes', 1);
}
```

→ Race: 2 click cùng lúc → 2 votes.

✓:
```ts
const isNew = await client.sAdd('voted', userId);
if (isNew === 1) {
  await client.hIncrBy(post, 'votes', 1);
}
```

→ `SADD` return value làm cờ idempotent (probabilistically — 100% với Set).

## Apply cho app RB

Quay lại `createBid`. Có thể fix một phần race với atomic primitives:

```ts
export async function createBid(attrs: CreateBidAttrs) {
  const item = await getItem(attrs.itemId);
  if (!item) throw new Error('Item does not exist');
  if (item.endingAt.getTime() < Date.now()) throw new Error('Closed');
  if (item.price >= attrs.amount) throw new Error('Too low');
  
  await Promise.all([
    client.rPush(itemBidsKey(attrs.itemId), serializeBid({...})),
    
    // ✓ HSET set price + highestBidUserId — race "last write wins"
    client.hSet(itemKey(attrs.itemId), {
      price: attrs.amount.toString(),
      highestBidUserId: attrs.userId,
    }),
    
    // ✓ HINCRBY atomic — không lệch counter
    client.hIncrBy(itemKey(attrs.itemId), 'bids', 1),
    
    // ✓ ZADD GT — chỉ update sort index nếu amount > score hiện tại
    client.zAdd('items:price', { 
      score: attrs.amount, 
      value: attrs.itemId,
    }, { GT: true }),
  ]);
}
```

Fixes:
1. `HINCRBY bids 1` thay vì `bids: item.bids + 1` → counter chính xác.
2. `ZADD GT` → sort index chỉ tăng (monotonic).

**Vấn đề CÒN**: validation race. Cả 2 client thấy price=10, validate pass, cả 2 set price → price cuối = giá lớn hơn (random). Không an toàn.

→ Atomic primitives chỉ fix counter. **Validation race cần MULTI/WATCH hoặc Lua.**

## ZADD GT/LT — atomic conditional update

`ZADD ... GT` chỉ update score nếu **lớn hơn** current. Hoàn hảo cho "price chỉ tăng":

```text
ZADD items:price GT 10 itemX
ZADD items:price GT 5  itemX     # không update, vì 5 < 10
ZADD items:price GT 15 itemX     # update, score = 15
```

Atomic. Không cần WATCH.

Tương tự `LT`: chỉ update nếu nhỏ hơn.

→ Khi business logic là "monotonic", dùng GT/LT — đỡ phải transaction phức tạp.

## SETRANGE - update bit/byte trong string

Đã học phase-2 bài 6. Cũng atomic. Hữu ích cho:
- Update field cụ thể trong fixed-layout encoding.
- Update bitmap.

## Khi atomic primitive **không đủ**

3 dấu hiệu cần leo lên MULTI/Lua:

1. **Conditional update đa field** dựa trên state read trước.
2. **Validation phức tạp** (vd "stock > 0 AND user is admin AND...").
3. **Multi-key atomic** (vd "ghi A xong rồi ghi B, cả 2 phải success").

App RB bid: condition 1 và 2 đều có. Cần MULTI/Lua.

## Decision flow: chọn approach

```text
Race condition cần fix?
   │
   ▼
"Operation là một single counter/flag?"
   ┌──┴──┐
   │     │
  YES    NO
   │     │
   ▼     ▼
Atomic  "Multi-step nhưng có conditional?"
prim    ┌──────┴───────┐
        │              │
       YES             NO (just multi-step batch)
        │              │
        ▼              ▼
   MULTI/WATCH    Pipeline đủ
   hoặc Lua       (Promise.all)
```

## Tóm tắt bài 3

- Atomic primitives = 1 lệnh thay 2 (read+write).
- Fix race cho counter (INCR, HINCRBY), unique check (SADD return), monotonic (ZADD GT/LT), lock (SET NX EX).
- **KHÔNG fix** race khi cần validation từ state read trước.
- App RB: atomic primitives chỉ giải counter lệch. Validation race vẫn còn → cần WATCH (bài 5).

**Bài kế tiếp** → [Bài 4: MULTI/EXEC — transaction trong Redis](04-multi-exec-transaction.md)
