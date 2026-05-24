# Bài 2: Overview Distributed Lock — anatomy + acquire/release

Bài này đi sâu vào cấu trúc Distributed Lock: key gì lưu, value gì, làm sao acquire atomic, làm sao release safe. Đây là nền tảng cho mọi pattern lock trong Redis.

## Anatomy của lock

Một lock trong Redis là **1 key** với:
- **Key name**: identifier của resource (vd `lock:bid:item-xyz`).
- **Value**: identifier của owner (vd UUID của worker).
- **TTL**: thời gian tối đa lock được giữ (safety mechanism).

```text
key: lock:bid:item-xyz
value: a3f9c2d1-uuid-of-worker-A
TTL: 30 seconds
```

→ "Worker A giữ lock cho bid trên item-xyz trong 30s".

## 4 yêu cầu của lock

Lock đúng phải thoả:

1. **Mutual exclusion**: chỉ 1 client giữ lock tại 1 thời điểm.
2. **Deadlock-free**: nếu owner chết, lock tự release sau TTL.
3. **Fault-tolerant**: lock vẫn hoạt động khi Redis có replica.
4. **Verify before release**: chỉ owner mới được release lock của mình.

## Acquire: SET NX EX atomic

```text
SET lock:bid:item-xyz a3f9c2d1 NX EX 30
```

- `NX`: chỉ set nếu key chưa tồn tại (1 atomic check).
- `EX 30`: TTL 30 giây.
- Return `OK` nếu acquire thành công, `nil` nếu lock đã tồn tại.

→ **Atomic acquire**. Hai client cùng SET NX → chỉ 1 thắng.

Sai pattern ngày xưa:
```text
EXISTS lock      → 0
SET lock myID    → OK
EXPIRE lock 30   → OK
```

3 lệnh = race. Client khác có thể chen giữa EXISTS và SET. Phải `SET NX EX` trong 1 lệnh.

## Implementation cơ bản

```ts
import { v4 as uuidv4 } from 'uuid';

async function acquireLock(resource: string, ttl = 30): Promise<string | null> {
  const owner = uuidv4();
  const ok = await client.set(`lock:${resource}`, owner, {
    NX: true,
    EX: ttl,
  });
  return ok === 'OK' ? owner : null;
}
```

Return:
- `owner` string nếu acquire thành công. Client lưu để release sau.
- `null` nếu lock đã có owner khác.

## Release: chỉ chính chủ

❌ **Sai cách**:
```ts
async function releaseLock(resource: string) {
  await client.del(`lock:${resource}`);
}
```

→ Bất kỳ ai cũng release được. Nếu A đang giữ lock, B accidentally release → A vẫn nghĩ mình có lock, làm việc tiếp → conflict.

✅ **Đúng cách** — verify owner:

```ts
async function releaseLock(resource: string, owner: string): Promise<boolean> {
  const stored = await client.get(`lock:${resource}`);
  if (stored === owner) {
    await client.del(`lock:${resource}`);
    return true;
  }
  return false;
}
```

Nhưng GET + DEL **không atomic** — race ở giữa:

```text
T1: A: GET lock → "A_id"  (A's UUID)
T2: A: (chuẩn bị DEL)
T3: lock TTL expires
T4: B: SET lock B_id NX EX 30  (B acquires)
T5: A: DEL lock  ← Xóa nhầm lock của B!
```

→ Phải atomic GET+DEL. **Dùng Lua**:

```lua
-- unlock.lua
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
```

Caller:
```ts
async function releaseLock(resource: string, owner: string): Promise<boolean> {
  const result = await client.eval(UNLOCK_LUA, {
    keys: [`lock:${resource}`],
    arguments: [owner],
  });
  return result === 1;
}
```

Lua atomic: GET, compare, DEL trong 1 step.

## Pattern: withLock helper

Gói acquire + work + release thành 1 helper:

```ts
async function withLock<T>(
  resource: string,
  callback: () => Promise<T>,
  options: { ttl?: number; timeout?: number } = {}
): Promise<T> {
  const ttl = options.ttl ?? 30;
  const timeout = options.timeout ?? 5000;
  
  const startTime = Date.now();
  let owner: string | null = null;
  
  while (Date.now() - startTime < timeout) {
    owner = await acquireLock(resource, ttl);
    if (owner) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  
  if (!owner) {
    throw new Error(`Failed to acquire lock on ${resource} within ${timeout}ms`);
  }
  
  try {
    return await callback();
  } finally {
    await releaseLock(resource, owner);
  }
}
```

Cách dùng:
```ts
await withLock('bid:item-xyz', async () => {
  const item = await getItem(itemId);
  if (item.price >= amount) throw new Error('Bid too low');
  await client.hSet(itemKey(itemId), { price: amount.toString() });
}, { ttl: 30, timeout: 5000 });
```

→ Logic trong callback **chạy với lock**. Khi xong (hoặc lỗi), lock release.

## TTL — vì sao quan trọng

Không có TTL: worker crash giữa chừng → lock vĩnh viễn → **deadlock**.

```text
T1: Worker A acquires lock.
T2: Worker A crashes (process kill).
T3: Lock vẫn tồn tại.
T4: Worker B, C, D ... đều không acquire được.
T5: Toàn hệ thống stuck cho đến khi admin xoá lock thủ công.
```

→ TTL fix tự động: sau N giây, Redis xoá lock. Worker khác acquire được.

**Chọn TTL bao nhiêu?**
- Đủ dài để operation hoàn tất bình thường (vd 30s cho payment).
- Đủ ngắn để không stuck quá lâu nếu worker chết (vd không phải 1 giờ).
- Common: 10-60s cho most operations.

## Vấn đề TTL: operation lâu hơn TTL

Nếu callback chạy 45s mà TTL là 30s:

```text
T0:  A acquires lock TTL=30s.
T30: Lock expires, A vẫn đang làm việc.
T35: B acquires lock (vì A's lock đã expire).
T45: A finishes, gọi release.
     → owner check pass? Không (owner trong Redis giờ là B).
     → Lock của B KHÔNG bị xoá nhầm. Tốt.
     → Nhưng: trong T30-T45, A và B cùng "giữ lock" — vi phạm mutex.
```

→ **Lock bị "expired during use"**. A và B cùng modify resource = data corruption.

Mitigation (sẽ học bài 6):
- **Lock extension**: A check thường xuyên, extend TTL nếu sắp expire.
- **Lock signal**: A polls "tôi vẫn còn lock?" trước mỗi step.
- **Short operations**: kế hoạch sao cho < TTL.

## Áp dụng cho app RB

Refactor `createBid` dùng lock:

```ts
export async function createBid(attrs: CreateBidAttrs): Promise<void> {
  await withLock(`bid:${attrs.itemId}`, async () => {
    const item = await getItem(attrs.itemId);
    if (!item) throw new Error('Item does not exist');
    if (item.endingAt.getTime() < Date.now()) throw new Error('Closed');
    if (item.price >= attrs.amount) throw new Error('Bid too low');
    
    const bid = { userId: attrs.userId, amount: attrs.amount, time: new Date() };
    
    await Promise.all([
      client.rPush(itemBidsKey(attrs.itemId), serializeBid(bid)),
      client.hSet(itemKey(attrs.itemId), {
        price: attrs.amount.toString(),
        highestBidUserId: attrs.userId,
      }),
      client.hIncrBy(itemKey(attrs.itemId), 'bids', 1),
      client.zAdd('items:price', { score: attrs.amount, value: attrs.itemId }, { GT: true }),
    ]);
  }, { ttl: 10, timeout: 5000 });
}
```

So với Lua (phase 16):
- Lua: 1 RTT, atomic, fast.
- Lock: nhiều RTT (acquire + work + release), chậm hơn.

Khi nào pick lock thay Lua?
- Khi logic phức tạp không fit Lua.
- Khi cần gọi external API trong critical section.
- Khi cần coordinate giữa nhiều process không qua Redis.

App RB bid case: Lua tốt hơn. Lock dùng cho **checkout** (cần charge Stripe, tạo order, gửi email).

## Stress test lock vs WATCH

Cùng setup 150 bid:

| Approach | Success rate | Avg latency |
|---|---|---|
| WATCH | 60-70% | 5ms |
| Lua | 100% | 1ms |
| Lock | 100% | 8ms |

→ Lock đúng đắn nhưng chậm hơn Lua. Trade-off.

## Tóm tắt bài 2

- Lock = key với owner UUID + TTL.
- **Acquire**: `SET lock:X owner NX EX 30` atomic.
- **Release**: Lua verify owner + DEL.
- `withLock(resource, callback)` helper gói lifecycle.
- TTL bắt buộc để tránh deadlock khi worker chết.
- Bẫy: operation > TTL → 2 owner đồng thời.

**Bài kế tiếp** → [Bài 3: Implementing withLock helper](03-with-lock-helper.md)
