# Bài 7: Tổng kết phase-17 + tổng hợp 4 approach concurrency

Bài cuối phase-17 và tổng hợp toàn bộ kiến thức concurrency đã học từ phase-15. Decision tree đầy đủ + checklist cho mọi feature mới.

## 4 approach đã học

| # | Approach | Phase | Khi dùng |
|---|---|---|---|
| 1 | **Atomic primitives** (INCR, HINCRBY, SADD return) | 15 | Single counter, single condition |
| 2 | **WATCH/MULTI/EXEC** | 15 | Conditional update đơn, app standalone |
| 3 | **Lua script** | 16 | Conditional update phức tạp, multi-key trên cùng slot |
| 4 | **Distributed Lock** | 17 | Long operation, external service, cross-system |

## Decision tree đầy đủ

```text
"Có concurrency issue cần fix?"
       │
       ▼
"Business chấp nhận last-write-wins?"
   ┌───┴───┐
   │       │
  YES      NO
   │       │
   ▼       ▼
KHÔNG    "Operation type?"
FIX        ┌──────┴──────┐
           │             │
       Single field    Multi-field
       counter/flag     /multi-key
           │             │
           ▼             ▼
       "Atomic op       "Logic phức tạp?"
        có sẵn?"        ┌──┴──┐
        ┌──┴──┐          │     │
       YES   NO         YES    NO
        │     │          │     │
        ▼     ▼          ▼     ▼
    Atomic  WATCH/    "Cần external"  WATCH/
    prim    MULTI       service?      MULTI
                       ┌─┴─┐ 
                       YES  NO
                        │    │
                        ▼    ▼
                      Lock  Lua
```

## Comparison table

| | Atomic | WATCH | Lua | Lock |
|---|---|---|---|---|
| RTT | 1 | 1+retry | 1 | 3 (acquire+work+release) |
| Atomic | ✓ | ✓ | ✓ | KHÔNG (coordination) |
| Logic | Đơn | Đơn | Phức | Bất kỳ |
| External service | KHÔNG | KHÔNG | KHÔNG | ✓ |
| Multi-key | KHÔNG | Cùng slot | Cùng slot | Bất kỳ |
| Retry needed | KHÔNG | CÓ | KHÔNG | CÓ (acquire fail) |
| Block server | KHÔNG | KHÔNG | Trong script run | KHÔNG |
| Code complexity | Thấp | Trung | Trung | Trung-cao |
| Performance | Cao | Trung (retry) | Cao | Trung-thấp |

## Mapping cho app RB

| Feature | Approach | Lý do |
|---|---|---|
| View counter | Atomic SADD return | Single condition, simple |
| Like toggle | Lua | 4 cấu trúc atomic |
| Bid | Lua | Conditional check + multi-update |
| Username uniqueness | Lua (or SET NX) | Atomic SADD đủ |
| Checkout (Stripe) | Lock | External API, multi-step |
| Cache rebuild | Lock with heartbeat | Long operation |
| Daily counter reset | Lock | Background job, 1 worker thắng |

## Checklist khi thiết kế feature mới

Khi gặp concurrency:

- [ ] **Identify race**: 2 client cùng làm gì cùng lúc → bug gì?
- [ ] **Business impact**: race có gây loss hoặc inconsistency thực sự không?
- [ ] **Approach choice**: theo decision tree.
- [ ] **TTL/timeout**: nếu lock, dài đủ + heartbeat hoặc signal nếu cần.
- [ ] **Fallback**: nếu acquire fail (lock), retry? Reject? Queue?
- [ ] **Idempotency**: external services cần idempotency key.
- [ ] **Test stress**: simulate 100+ concurrent → verify behavior.
- [ ] **Metrics**: track success rate, contention, latency.

## Một số use case ngoài app RB

### Rate limiting

Sliding window rate limit dùng Lua:

```lua
-- rate-limit.lua
-- KEYS[1] = user rate key
-- ARGV[1] = max requests
-- ARGV[2] = window seconds
-- ARGV[3] = current timestamp

local key = KEYS[1]
local max = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

-- Remove old entries
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window * 1000)

-- Count current
local count = redis.call('ZCARD', key)

if count >= max then
  return 0
end

-- Add current
redis.call('ZADD', key, now, now .. ':' .. math.random())
redis.call('EXPIRE', key, window)
return max - count - 1
```

→ Atomic sliding window rate limit. Return remaining quota.

### Job dedup

Tránh 2 worker process cùng job:

```ts
const lock = await acquireLock(`job:${jobId}`, 60);
if (!lock) {
  return; // ai đó đang xử lý
}
try {
  await processJob(jobId);
} finally {
  await releaseLock(`job:${jobId}`, lock);
}
```

### Optimistic counters với reconciliation

Cho counter cực hot (vd celeb follower count), atomic INCR sufficient. Race chỉ ảnh hưởng ordering, không value.

Nếu cần "exactly once" (vd quotas), pattern:
1. SADD vào set "processed".
2. INCR counter nếu SADD return 1.

Lua atomic 2 steps.

## When NOT to use Redis cho concurrency

- **Distributed transactions across services**: Redis lock + 2 services modify cùng resource → vẫn có window. Cần 2PC hoặc Saga.
- **Strong consistency yêu cầu**: Redis async replication → có thể mất data. Dùng SQL với strong isolation cho data critical.
- **Long-running workflow > 10 phút**: lock TTL khó set chính xác. Dùng workflow engine (Temporal, Airflow).

Redis lock tốt cho **medium-term** (< vài phút) coordination giữa stateless workers.

## RedLock vs single Redis

Đã đề cập bài 5. Tóm tắt:

**Single Redis + AOF + reasonable TTL** đủ cho 99% use case. Trade-off:
- Hiếm khi mất lock do Redis crash.
- Đơn giản, debuggable.

**RedLock** cho mission-critical:
- Tài chính, payment processing.
- Inventory management strict.
- Multi-region failover.

Đa số startup/medium business → single Redis. Big tech → có thể RedLock hoặc tự build với consensus protocol (Raft, Paxos).

## Lessons learned tổng hợp

Sau 3 phase (15-17) về concurrency:

1. **Race condition là default trong distributed system**. Phải design from start.
2. **Redis single-threaded ≠ no race**. Race ở mức application code (read-then-write).
3. **4 tools cho 4 mức độ phức tạp**. Pick đúng tool quan trọng hơn pick advanced.
4. **TTL bắt buộc cho lock**. Không có TTL = deadlock.
5. **Verify owner**. DEL không verify = release nhầm.
6. **External services cần idempotency**. Lock không đủ.
7. **Test stress** từ ngày đầu. 100% success ở dev != production.

## Phase tiếp theo

Phase 18-19 sẽ học **RediSearch** — module module Redis cho full-text search + multi-field index. Đây là cách giải cho:
- Search bar trong app (chưa implement).
- Faceted filter (vd price 100-500 + tag vintage).
- Fuzzy match, prefix search.

→ [Phase-18 — Bài 1: Redis modules + RediSearch overview](../phase-18/01-modules-redisearch-overview.md)

## Tóm tắt phase-17

- 4 approach concurrency: atomic, WATCH, Lua, Lock.
- Distributed Lock: SET NX EX + Lua unlock + TTL safety.
- 3 cách handle TTL expire: long TTL, heartbeat, signal.
- RedLock cho mission-critical, single Redis cho 99% case.
- Decision tree + checklist cho feature mới.
