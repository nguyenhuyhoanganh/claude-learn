# Bài 4: Lock TTL + auto-expiration — bẫy và mitigation

TTL là cốt lõi của deadlock-free lock. Nhưng cũng nguồn gốc của lỗi tinh tế: lock expire khi worker vẫn đang làm việc. Bài này phân tích bẫy, các approach giải quyết.

## Vấn đề: operation lâu hơn TTL

```text
Lock TTL = 30s
Worker A: operation thực tế mất 45s (do DB chậm, external API timeout, ...).

T0:    A acquires lock
T30:   Lock TTL expires. Redis xoá key.
T31:   B sees no lock, B acquires (TTL=30 mới).
T35:   A vẫn đang làm việc — không biết lock expire.
T40:   A finishes step 1, starts step 2.
T45:   A tries to release.
        - Lua check: stored value = B's UUID.
        - A's UUID không match → DEL không chạy.
        - B's lock vẫn còn.
```

Cuối cùng:
- B's lock OK (chưa bị xoá nhầm).
- **NHƯNG**: trong T30-T45, A và B cùng "giữ lock" → cả 2 modify resource = data inconsistent.

→ **Verify owner trên release không cứu được**. Vấn đề là **mutex bị break trong giữa**.

## Visualization

```text
        ┌─────────── A's perceived hold ─────────────┐
        │                                              │
T0 ────►│ A acquires (TTL=30)                          │
        │                                              │
T30 ────► Lock TTL expires (Redis xoá)               
                                                         
        │           ┌─────── B's perceived hold ──────►
T31 ────►          │ B acquires (TTL=30)              
        │           │                                  
T45 ────► A finishes, tries to release — fail (UUID khác)
                    │                                  
T61 ────►          │ B releases                       
                    │                                  
─────────────────────────────────────────────────────
        T30-T45: A và B cùng "trong critical section" — BREAK MUTEX
```

## Các cách giải

### Approach 1: TTL dài đủ

Set TTL > worst-case operation time.

```ts
await withLock(client, 'checkout', callback, { ttl: 120 });
```

✓ Đơn giản.  
✗ Nếu worker chết, deadlock 2 phút.  
✗ Khó dự đoán worst-case.

Phù hợp cho operation predictable, < 30s.

### Approach 2: Lock extension (heartbeat)

Worker định kỳ extend TTL trong khi đang làm việc.

```ts
async function withLockExtended<T>(
  resource: string,
  callback: () => Promise<T>,
  options: { ttl: number; extendInterval: number }
): Promise<T> {
  const owner = uuidv4();
  await client.set(`lock:${resource}`, owner, { NX: true, EX: options.ttl });
  
  // Spawn background task to extend TTL
  let active = true;
  const extender = setInterval(async () => {
    if (!active) return;
    // Extend only if I'm still the owner
    await client.eval(`
      if redis.call('GET', KEYS[1]) == ARGV[1] then
        return redis.call('EXPIRE', KEYS[1], ARGV[2])
      end
      return 0
    `, { keys: [`lock:${resource}`], arguments: [owner, options.ttl.toString()] });
  }, options.extendInterval * 1000);
  
  try {
    return await callback();
  } finally {
    active = false;
    clearInterval(extender);
    await releaseLock(resource, owner);
  }
}
```

Trade-off:
- ✓ Lock không bao giờ expire khi worker đang làm.
- ✗ Worker chết → còn phải đợi đến lúc miss heartbeat → lock expire vẫn delay.
- ✗ Complexity: background task, cleanup, edge cases.

Pattern phổ biến trong production. Thư viện như `redlock` (Node) implement sẵn.

### Approach 3: Lock signal — defensive operations

Worker check lock state **trước mỗi step quan trọng**.

```ts
await withLock(client, 'rebuild-cache', async (signal) => {
  for (const batch of batches) {
    if (!(await signal.isStillValid())) {
      throw new Error('Lock expired, aborting');
    }
    await processBatch(batch);
  }
}, { ttl: 30 });
```

→ Nếu lock expire giữa chừng, worker tự abort. Tránh modify resource sau khi mất quyền.

Trade-off:
- ✓ Đơn giản, không cần background task.
- ✗ Mỗi check = 1 RTT. Overhead.
- ✗ Vẫn có race nhỏ: check pass → lock expire → continue → conflict (rất hẹp).

Phù hợp khi operation chia thành steps rõ ràng.

### Approach 4: Fencing token

Mỗi acquire gắn 1 **monotonic increasing token**. Resource từ chối write từ token cũ.

```ts
// Acquire trả về token
const { owner, fence } = await acquireLockWithFence('resource');

// Resource (vd file storage) verify fence
await storage.write(key, value, { fence });  // reject nếu fence < lastSeenFence
```

→ Ngay cả khi 2 worker cùng giữ lock, resource side reject worker cũ.

Pros: **chính xác tuyệt đối**.  
Cons: cần resource hỗ trợ fence. Phức tạp.

Pattern này từ Martin Kleppmann (RedLock critique). Đa số app không cần.

## Approach 2 chi tiết: pattern heartbeat

```ts
function startHeartbeat(
  client: RedisClientType,
  resource: string,
  owner: string,
  ttl: number,
  interval: number
) {
  const lockKey = `lock:${resource}`;
  const extendLua = `
    if redis.call('GET', KEYS[1]) == ARGV[1] then
      return redis.call('EXPIRE', KEYS[1], ARGV[2])
    end
    return 0
  `;
  
  let stopped = false;
  
  async function tick() {
    if (stopped) return;
    try {
      const ok = await client.eval(extendLua, {
        keys: [lockKey],
        arguments: [owner, ttl.toString()],
      });
      if (ok === 0) {
        // Lock đã bị mất (owner khác). Báo callback.
        emitter.emit('lock-lost', resource);
      }
    } catch (err) {
      // Log nhưng không throw
      console.error('Heartbeat error:', err);
    }
    
    if (!stopped) {
      setTimeout(tick, interval * 1000);
    }
  }
  
  tick();
  
  return {
    stop: () => { stopped = true; },
  };
}
```

→ Background task tự extend. Khi work xong, gọi `stop()`.

Common settings: interval = TTL / 3. TTL=30s → extend mỗi 10s.

## Khi nào pick approach nào?

| Operation duration | TTL | Approach |
|---|---|---|
| < 5s, predictable | TTL = 30s | Approach 1 (dài đủ) |
| 10-60s, predictable | TTL = 2x duration | Approach 1 |
| Variable, có thể dài | TTL = baseline + heartbeat | Approach 2 |
| Có steps rõ ràng | Approach 3 (signal) | Khi không muốn background task |
| Critical đúng đắn tuyệt đối | Approach 4 (fence) | Khi data corruption không chấp nhận |

App RB:
- Bid: < 1s → TTL=5s đủ.
- View counter: ms → TTL=2s đủ.
- Checkout với Stripe: 5-30s → TTL=60s + heartbeat hoặc signal check.
- Cache rebuild: 5+ phút → heartbeat bắt buộc.

## Đo TTL thực tế

```ts
const start = Date.now();
await withLock('checkout', async () => {
  await chargePayment();
  await createOrder();
  await sendConfirmation();
});
const duration = Date.now() - start;
console.log(`Checkout took ${duration}ms`);
```

Đo p50, p99. TTL ≥ p99 × 2 (buffer). Nếu p99 lên 30s, TTL ≥ 60s.

## TTL quá ngắn vs quá dài

| TTL | Vấn đề |
|---|---|
| Quá ngắn (< operation) | Lock expire giữa chừng → break mutex |
| Vừa đủ (= operation worst case) | Có thể không cover spike latency |
| Hơi dài (2x operation) | Sweet spot |
| Rất dài (10x operation) | Worker chết → deadlock lâu |
| Không TTL | Worker chết → deadlock vĩnh viễn |

→ Default sweet spot: 2x worst case.

## Tóm tắt bài 4

- Lock TTL bắt buộc, nhưng tạo bẫy "expire during use".
- 4 approach: TTL đủ dài, heartbeat extend, signal check, fencing token.
- Heartbeat phổ biến trong production lib (Redlock).
- Signal check đơn giản, phù hợp operations có steps.
- Đo TTL dựa trên p99 thực tế.

**Bài kế tiếp** → [Bài 5: Verify owner — Lua unlock script](05-verify-owner-lua-unlock.md)
