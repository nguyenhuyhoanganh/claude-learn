# Bài 6: Lock signal — defensive operation cho long task

Approach 3 từ bài 4: **callback check lock state trước mỗi step**. Bài này implement đầy đủ, kèm pattern abort-and-rollback khi lock lost.

## Recap problem

Lock TTL = 30s. Operation thực mất 45s. Tại T=30s, lock expired. Tại T=31s, worker khác B acquires. Nếu worker A tiếp tục modify resource sau T=30s → conflict với B.

→ Worker A **phải biết khi lock expired** và stop.

## Solution 1: heartbeat — extend TTL background

Bài 4 đã đề cập. Pros: lock không expire khi worker còn live. Cons: complexity, edge case khi worker chết giữa heartbeat.

## Solution 2: signal — check trước mỗi step

Worker check `signal.isStillValid()` trước mỗi operation critical. Nếu lost, abort.

```ts
await withLock(client, 'rebuild', async (signal) => {
  const items = await fetchItems();
  
  for (const item of items) {
    if (!(await signal.isStillValid())) {
      throw new LockLostError();
    }
    await rebuildIndexFor(item);
  }
});
```

Mỗi vòng for: 1 RTT để check + 1 RTT để rebuild = 2 RTT/item.

Trade-off:
- ✓ No background task, đơn giản.
- ✓ Worker tự abort gracefully.
- ✗ Overhead 1 RTT/check.
- ✗ Race nhỏ: check pass → lock expire → continue → conflict.

## Implementation chi tiết

```ts
export type LockSignal = {
  isStillValid: () => Promise<boolean>;
  remainingTTL: () => Promise<number>;
};

const CHECK_LUA = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('TTL', KEYS[1])
end
return -1
`;

function buildSignal(
  client: RedisClientType,
  lockKey: string,
  owner: string
): LockSignal {
  return {
    isStillValid: async () => {
      const ttl = await client.eval(CHECK_LUA, {
        keys: [lockKey],
        arguments: [owner],
      });
      return ttl > 0;
    },
    remainingTTL: async () => {
      const ttl = await client.eval(CHECK_LUA, {
        keys: [lockKey],
        arguments: [owner],
      });
      return ttl;
    },
  };
}
```

`isStillValid` = TTL > 0 (chưa expire + đúng owner).  
`remainingTTL` = số giây còn (-1 nếu lost).

## Pattern: throw early on lost

```ts
async function checkOrThrow(signal: LockSignal): Promise<void> {
  if (!(await signal.isStillValid())) {
    throw new Error('LOCK_LOST');
  }
}

await withLock('checkout', async (signal) => {
  const cart = await getCart(userId);
  await checkOrThrow(signal);
  
  const charge = await stripe.charge(cart.total);
  await checkOrThrow(signal);
  
  await createOrder(cart, charge.id);
  await checkOrThrow(signal);
  
  await sendConfirmEmail(cart.userEmail);
});
```

→ Mỗi bước có check trước. Lock lost → throw → cleanup ở finally.

## Pattern: rollback on lost

Khi lock lost giữa external operation (vd Stripe charge):

```ts
await withLock('checkout', async (signal) => {
  // 1. Charge Stripe
  const charge = await stripe.charges.create({ amount, customer });
  
  // 2. Check lock
  if (!(await signal.isStillValid())) {
    // Rollback charge
    await stripe.refunds.create({ charge: charge.id });
    throw new Error('LOCK_LOST');
  }
  
  // 3. Continue
  await createOrder(charge.id);
});
```

→ Charge xảy ra **trong khi vẫn có lock** (đã check trước). Sau charge, check lại — nếu lost giữa charge và creating order, **rollback charge**.

## Idempotency keys cho external service

Vấn đề: nếu lock lost sau Stripe charge, worker A try refund. Nhưng nếu A crash sau charge, không có refund. B retry checkout → charge lại → double charge.

Fix: **idempotency key**:

```ts
await stripe.charges.create({
  amount,
  customer,
  idempotency_key: `checkout:${userId}:${cartId}`,
});
```

Stripe nhận cùng key → return cùng charge ID, không create duplicate. Worker B retry an toàn.

Pattern này áp dụng cho mọi external API trong critical section.

## Reserved time pattern

Một biến thể: worker estimate operation duration upfront, acquire lock với TTL đó. Không cần signal.

```ts
const estimatedDuration = await estimateOperation();
const lockTTL = Math.ceil(estimatedDuration * 1.5);

await withLock(resource, callback, { ttl: lockTTL });
```

→ Lock TTL "fit" với operation. Không cần check giữa.

Trade-off:
- ✓ Đơn giản.
- ✗ Estimate có thể sai. Spike latency → fail.
- ✗ TTL dài → deadlock lâu nếu worker chết.

## So sánh 3 approach

| Approach | Complexity | RTT overhead | Worker crash handling | Operation length |
|---|---|---|---|---|
| Long TTL | Low | 0 | Deadlock up to TTL | < TTL |
| Heartbeat | Medium | 1 RTT/interval | Lock auto-expire sau ~2 intervals | Bất kỳ |
| Signal check | Medium | 1 RTT/check | Lock TTL fallback | Steps rõ ràng |

App RB:
- Bid: < 1s → Long TTL (5s).
- Checkout với Stripe: ~10s → Signal check với TTL=30s.
- Cache rebuild (5 phút): Heartbeat với TTL=60s, interval=20s.

## Apply cho checkout

Implement full checkout với signal:

```ts
export async function checkout(userId: string, cartId: string) {
  return await withLock(
    client,
    `checkout:${userId}`,
    async (signal) => {
      // 1. Validate cart
      const cart = await getCart(cartId);
      if (!cart || cart.items.length === 0) {
        throw new Error('Cart empty');
      }
      
      // 2. Reserve inventory (atomic Lua)
      const reserved = await reserveInventory(cart.items);
      if (!reserved) {
        throw new Error('Insufficient stock');
      }
      
      // Check before external call
      if (!(await signal.isStillValid())) {
        await rollbackInventory(reserved);
        throw new Error('LOCK_LOST');
      }
      
      // 3. Charge Stripe (slow, ~3s)
      let charge;
      try {
        charge = await stripe.charges.create({
          amount: cart.total,
          customer: userId,
          idempotency_key: `checkout:${userId}:${cartId}`,
        });
      } catch (err) {
        await rollbackInventory(reserved);
        throw err;
      }
      
      // Check after slow external
      if (!(await signal.isStillValid())) {
        await stripe.refunds.create({
          charge: charge.id,
          idempotency_key: `refund:${charge.id}`,
        });
        await rollbackInventory(reserved);
        throw new Error('LOCK_LOST');
      }
      
      // 4. Commit
      const orderId = await createOrder(cart, charge.id);
      await clearCart(cartId);
      
      return orderId;
    },
    { ttl: 30, acquireTimeout: 10000 }
  );
}
```

Complex nhưng đầy đủ. Production checkout flow gần như đúng kiểu này.

## Vấn đề: rollback có thể fail

Trong rollback path (lock lost → refund Stripe), nếu Stripe API down, refund fail. Money tạm thời "lost".

Mitigation:
- **Outbox pattern**: log refund cần làm vào Redis/DB. Background worker retry.
- **Dead letter queue**: failed rollbacks → manual review.
- **Compensation transactions**: Saga pattern.

Distributed system corner cases. Có sách riêng cho topic này (vd "Designing Data-Intensive Applications").

## Tóm tắt bài 6

- Signal pattern: callback check `signal.isStillValid()` trước critical steps.
- Lock lost → throw → cleanup ở finally.
- External service: idempotency key tránh duplicate.
- Rollback path cũng cần handle failure (outbox pattern).
- Approach phù hợp khi operation có steps rõ ràng.

**Bài kế tiếp** → [Bài 7: Tổng kết phase-17 + alternative solutions](07-tong-ket-concurrency.md)
