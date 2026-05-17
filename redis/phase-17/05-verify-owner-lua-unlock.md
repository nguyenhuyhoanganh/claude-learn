# Bài 5: Verify owner — Lua unlock script chi tiết

Đã đề cập sơ ở bài 2-3. Bài này đi sâu vào **vì sao Lua bắt buộc**, edge case khi không có Lua, và pattern multi-script cho lock operations.

## Vấn đề: race trong release

Nếu release không verify owner:
```ts
async function release(resource: string) {
  await client.del(`lock:${resource}`);
}
```

Scenario:
```text
T1: A acquires lock, TTL=10s.
T2: A's operation slow (12s).
T3: Lock TTL expires.
T4: B acquires lock fresh.
T5: A finishes, calls release(resource).
    → DEL lock — xoá lock của B!
T6: C acquires.
    → A, B, C đều "have lock" → chaos.
```

Verify owner trước DEL fix vấn đề T5.

## Naive verify — vẫn có race

```ts
async function release(resource: string, owner: string) {
  const stored = await client.get(`lock:${resource}`);
  if (stored === owner) {
    await client.del(`lock:${resource}`);
  }
}
```

Race trong **giữa GET và DEL**:

```text
T1: A: GET lock → "A_uuid"   (đúng owner)
T2: A: (chuẩn bị DEL)
T3: Lock TTL expires.
T4: B: SET lock B_uuid NX EX 10
    → B acquires.
T5: A: DEL lock
    → Xóa lock của B nhầm!
```

→ 1 race vẫn còn. Phải GET + DEL **atomic**.

## Solution: Lua atomic

```lua
-- unlock.lua
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
```

Lua chạy atomic — GET, compare, DEL trong 1 step.

```ts
const UNLOCK_LUA = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

async function release(resource: string, owner: string): Promise<boolean> {
  const result = await client.eval(UNLOCK_LUA, {
    keys: [`lock:${resource}`],
    arguments: [owner],
  });
  return result === 1;
}
```

Return:
- `1`: thành công release (lock đúng của caller).
- `0`: lock đã được transfer hoặc expire — không phải của caller.

Cả 2 case OK. Caller không cần lo.

## Alternative không Lua — KHÔNG khuyến nghị

Trước Lua scripting (Redis < 2.6), pattern Redis chính chủ:

```text
WATCH lock
GET lock
[so sánh client-side]
MULTI
  DEL lock
EXEC
```

WATCH + MULTI cho atomic. Phức tạp hơn Lua nhiều. Cần connection riêng.

→ **Luôn dùng Lua** cho unlock. Đã thành industry standard.

## Multi-script pattern cho lock

Nhiều operations trên lock cần Lua:

### 1. Unlock script

```lua
-- unlock.lua
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
```

### 2. Extend script

```lua
-- extend.lua
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('EXPIRE', KEYS[1], ARGV[2])
end
return 0
```

Extend TTL chỉ khi owner đúng.

### 3. Acquire script (advanced)

Acquire thường dùng `SET NX EX` không cần Lua. Nhưng nếu cần custom logic (vd "acquire nếu pending lock < N"):

```lua
-- acquire-with-fence.lua
local n = redis.call('INCR', KEYS[2])    -- fencing token counter
local ok = redis.call('SET', KEYS[1], ARGV[1] .. ':' .. n, 'NX', 'EX', ARGV[2])
if ok then return n else return 0 end
```

Sinh fencing token tăng dần kèm UUID.

### 4. Check ownership

```lua
-- check.lua
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('TTL', KEYS[1])
end
return -1
```

Return TTL còn lại nếu đúng owner, -1 nếu không. Hữu ích cho `signal.isStillValid()`.

## Pattern: pre-load tất cả scripts

```ts
class LockService {
  private unlockSha: string;
  private extendSha: string;
  private checkSha: string;
  
  async init() {
    this.unlockSha = await this.client.scriptLoad(UNLOCK_LUA);
    this.extendSha = await this.client.scriptLoad(EXTEND_LUA);
    this.checkSha = await this.client.scriptLoad(CHECK_LUA);
  }
  
  async unlock(resource: string, owner: string) {
    return await this.client.evalSha(this.unlockSha, {
      keys: [`lock:${resource}`],
      arguments: [owner],
    });
  }
  
  async extend(resource: string, owner: string, ttl: number) {
    return await this.client.evalSha(this.extendSha, {
      keys: [`lock:${resource}`],
      arguments: [owner, ttl.toString()],
    });
  }
  
  async ttl(resource: string, owner: string) {
    return await this.client.evalSha(this.checkSha, {
      keys: [`lock:${resource}`],
      arguments: [owner],
    });
  }
}
```

→ Init một lần lúc app start, sau đó evalSha cho mọi lock op. Tiết kiệm bandwidth.

## Edge case: Redis restart

Lock state lưu trong memory + persistence (RDB/AOF). Nếu Redis restart:
- AOF với fsync everysec: mất ≤ 1s data. Lock có thể "mất".
- RDB snapshot: mất từ snapshot cuối → có thể mất phút.

Hệ quả:
```text
T0:  A acquires lock.
T1:  Redis crashes.
T2:  Redis restarts từ snapshot cũ (T-30s) → không có A's lock.
T3:  B acquires fresh lock.
T4:  A và B cùng "have lock".
```

Mitigation:
- **AOF appendfsync always**: every write fsync. Slow nhưng durable.
- **RedLock**: lock acquired qua majority (3/5) instances. Single restart không mất lock.
- **Accept tradeoff**: với non-critical operations, accept rare race.

## RedLock — distributed lock chính thức

[RedLock](https://redis.io/docs/latest/develop/use/patterns/distributed-locks/) là algorithm chính thức cho lock fault-tolerant qua nhiều Redis instances.

Cơ chế:
1. Try acquire lock trên N Redis instances (vd 5).
2. Lock thành công nếu acquire được trên **majority** (≥3/5).
3. Release: gọi unlock trên tất cả instances.

Pros:
- Khi 1-2 instance crash, lock vẫn safe.
- Không phụ thuộc single point of failure.

Cons:
- Phức tạp, cần 5 Redis nodes.
- Hiệu năng giảm (5x lệnh thay 1).
- Vẫn có critique từ academic (Martin Kleppmann).

Đa số app **không cần RedLock**. Single Redis + AOF + lock TTL bảo thủ đủ.

## Library cho RedLock

- Node: `redlock` (npm).
- Python: `pottery`, `aioredlock`.
- Java: `Redisson`.
- Go: `redsync`.

Code:
```ts
import Redlock from 'redlock';

const redlock = new Redlock([client], {
  retryCount: 5,
  retryDelay: 200,
});

const lock = await redlock.acquire(['lock:checkout:user-42'], 30000);
try {
  await processCheckout();
} finally {
  await lock.release();
}
```

→ Đơn giản dùng. Lib lo extension, multi-instance, retry.

## Khi nào đầu tư vào RedLock?

| Scenario | Có cần RedLock? |
|---|---|
| Hobby project | KHÔNG — single Redis OK |
| App < 1M user | KHÔNG — single với good ops |
| Tiền > $1000/transaction | CÓ — đầu tư correctness |
| Highly regulated (financial, healthcare) | CÓ |
| Operations 100% phải atomic | CÓ |

App RB là demo → single Redis + simple lock đủ.

## Tóm tắt bài 5

- Verify owner trước DEL bắt buộc, nhưng phải atomic.
- Lua unlock script là standard: GET + compare + DEL.
- Multi-script pattern: unlock, extend, check.
- Pre-load + EVALSHA cho performance.
- Redis restart có thể mất lock — RedLock nếu critical.
- App thường: single Redis + Lua đủ. RedLock cho high-value operations.

**Bài kế tiếp** → [Bài 6: Lock signal — defensive operation cho long task](06-lock-signal.md)
