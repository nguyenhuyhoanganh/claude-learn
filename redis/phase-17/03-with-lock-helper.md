# Bài 3: Implementing withLock helper — production-grade

Bài 2 đã giới thiệu `withLock` sơ. Bài này build production-grade với: error handling, exponential backoff, owner verify on release, type safety, metrics. Đây là code thực sự để dùng trong app.

## Anatomy của production withLock

```ts
export async function withLock<T>(
  resource: string,
  callback: (signal: LockSignal) => Promise<T>,
  options?: WithLockOptions
): Promise<T>;
```

- `resource`: string identifier (đi vào key `lock:<resource>`).
- `callback`: function chạy với lock. Nhận `LockSignal` để check status.
- `options`: TTL, timeout, retry strategy.

## Full implementation

```ts
// src/lib/with-lock.ts
import { v4 as uuidv4 } from 'uuid';
import type { RedisClientType } from 'redis';

const UNLOCK_LUA = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

export type LockSignal = {
  isStillValid: () => Promise<boolean>;
};

export type WithLockOptions = {
  ttl?: number;          // lock TTL (seconds)
  acquireTimeout?: number; // max wait to acquire (ms)
  retryInterval?: number;  // ms between retries
};

export async function withLock<T>(
  client: RedisClientType,
  resource: string,
  callback: (signal: LockSignal) => Promise<T>,
  options: WithLockOptions = {}
): Promise<T> {
  const ttl = options.ttl ?? 10;
  const acquireTimeout = options.acquireTimeout ?? 5000;
  const retryInterval = options.retryInterval ?? 50;
  
  const lockKey = `lock:${resource}`;
  const owner = uuidv4();
  
  // 1. Acquire with retry
  const startTime = Date.now();
  let acquired = false;
  
  while (Date.now() - startTime < acquireTimeout) {
    const result = await client.set(lockKey, owner, {
      NX: true,
      EX: ttl,
    });
    
    if (result === 'OK') {
      acquired = true;
      break;
    }
    
    await new Promise((r) => setTimeout(r, retryInterval));
  }
  
  if (!acquired) {
    throw new Error(`Failed to acquire lock on ${resource} within ${acquireTimeout}ms`);
  }
  
  // 2. Build signal
  const signal: LockSignal = {
    isStillValid: async () => {
      const current = await client.get(lockKey);
      return current === owner;
    },
  };
  
  // 3. Run callback with cleanup
  try {
    return await callback(signal);
  } finally {
    try {
      await client.eval(UNLOCK_LUA, {
        keys: [lockKey],
        arguments: [owner],
      });
    } catch (err) {
      console.error(`Failed to release lock ${resource}:`, err);
    }
  }
}
```

## Key design decisions

### 1. Owner UUID per call

Mỗi lần gọi `withLock` sinh UUID mới. Không reuse giữa các call.

→ Ngăn race nếu cùng worker call 2 lần concurrent.

### 2. Retry with fixed interval

```ts
while (Date.now() - startTime < acquireTimeout) {
  // try acquire
  await sleep(retryInterval);
}
```

Default 50ms. Có thể đổi:
- **Constant**: predictable, dễ debug.
- **Exponential backoff**: 50ms, 100ms, 200ms... — tốt khi contention cao.
- **Jittered**: thêm random ±50% — tránh thundering herd.

Production thường: jittered exponential.

```ts
const interval = retryInterval * (1.5 ** attempt) * (0.5 + Math.random());
```

### 3. Atomic release via Lua

`eval(UNLOCK_LUA)` đảm bảo "check owner + del" atomic. Tránh race "release nhầm".

### 4. Lock Signal

`signal.isStillValid()` cho phép callback check "tôi còn lock không?". Quan trọng cho operation dài:

```ts
await withLock(client, 'rebuild-cache', async (signal) => {
  for (let i = 0; i < 1000; i++) {
    if (!(await signal.isStillValid())) {
      throw new Error('Lock expired, aborting');
    }
    await processItem(i);
  }
}, { ttl: 60 });
```

→ Mỗi bước check. Nếu lock đã expire (TTL passed), throw → không tiếp tục.

### 5. Cleanup in finally

```ts
try {
  return await callback(...);
} finally {
  await release();
}
```

Release **luôn chạy**, kể cả callback throw. Quan trọng để tránh deadlock.

`try/catch` quanh release: release fail không ảnh hưởng kết quả. Log warning.

## Cách dùng

### Basic

```ts
const result = await withLock(client, 'bid:item-xyz', async () => {
  // logic critical section
  const item = await getItem(itemId);
  if (item.price >= amount) throw new Error('Too low');
  await updateItem(...);
  return 'OK';
});
```

### With signal check

```ts
await withLock(client, 'cache-rebuild', async (signal) => {
  const items = await fetchAllItems();
  for (const item of items) {
    if (!(await signal.isStillValid())) {
      throw new Error('Lock lost during rebuild');
    }
    await rebuildCacheFor(item);
  }
}, { ttl: 60, acquireTimeout: 10000 });
```

### Try-acquire (no wait)

```ts
async function tryWithLock<T>(
  resource: string,
  callback: () => Promise<T>
): Promise<T | null> {
  try {
    return await withLock(client, resource, callback, {
      acquireTimeout: 0,    // không retry
    });
  } catch (err) {
    if (err.message.includes('Failed to acquire')) {
      return null;          // ai khác đã giữ lock
    }
    throw err;
  }
}
```

→ Pattern "first wins": worker đầu tiên grab job, các worker khác return null + làm task khác.

## Apply cho app RB

### Bid với lock

```ts
export async function createBid(attrs: CreateBidAttrs): Promise<void> {
  return await withLock(
    client,
    `bid:${attrs.itemId}`,
    async () => {
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
    },
    { ttl: 5, acquireTimeout: 2000 }
  );
}
```

TTL 5s là đủ cho bid op (vài ms thực tế).  
Acquire timeout 2s — không chờ vô hạn nếu contention rất cao.

### Checkout flow (long operation)

```ts
export async function checkout(userId: string, cartId: string) {
  return await withLock(
    client,
    `checkout:user:${userId}`,
    async (signal) => {
      // 1. Validate cart
      const cart = await getCart(cartId);
      if (!cart) throw new Error('Cart not found');
      
      // Check lock vẫn valid trước khi gọi external service
      if (!(await signal.isStillValid())) throw new Error('Lock lost');
      
      // 2. Charge Stripe (external, có thể chậm)
      const charge = await stripe.charges.create({
        amount: cart.total,
        currency: 'usd',
        customer: cart.userId,
      });
      
      if (!(await signal.isStillValid())) {
        // Lock lost giữa charge. Phải refund.
        await stripe.refunds.create({ charge: charge.id });
        throw new Error('Lock lost during checkout');
      }
      
      // 3. Create order in Redis
      const orderId = await createOrder(cart, charge.id);
      
      // 4. Clear cart
      await clearCart(cartId);
      
      return orderId;
    },
    { ttl: 30, acquireTimeout: 10000 }
  );
}
```

→ Pattern phức tạp với external service. Lock signal critical.

## Metrics + observability

Production cần track:
- Acquisition success rate.
- Acquisition latency (p50, p99).
- Lock hold time.
- Lock contention (số retry trung bình).

```ts
async function withLockTracked<T>(
  resource: string,
  callback: () => Promise<T>,
  options: WithLockOptions = {}
): Promise<T> {
  const acquireStart = Date.now();
  
  return await withLock(client, resource, async (signal) => {
    metrics.lockAcquired(resource, Date.now() - acquireStart);
    const workStart = Date.now();
    
    try {
      const result = await callback();
      metrics.lockReleased(resource, Date.now() - workStart);
      return result;
    } catch (err) {
      metrics.lockFailed(resource, err);
      throw err;
    }
  }, options);
}
```

## Anti-pattern: lock toàn cục

```ts
await withLock(client, 'global-lock', async () => {
  // mọi thứ ở đây
});
```

→ Serialize toàn bộ app. Throughput drops to 1 request/lock-duration. **Không bao giờ** dùng global lock trong production.

Lock per-entity (per-user, per-item) — most cases ổn.

## Tóm tắt bài 3

- `withLock(resource, callback, options)` — production helper.
- UUID owner mỗi call. Atomic release qua Lua.
- Retry với configurable interval, default 50ms.
- `LockSignal` cho phép callback check lock validity (cho long op).
- Cleanup ở `finally` — release luôn chạy.
- Metrics: acquisition rate, latency, hold time.

**Bài kế tiếp** → [Bài 4: Lock TTL + auto-expiration vấn đề](04-lock-ttl-auto-expiration.md)
