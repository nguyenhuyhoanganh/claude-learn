# Bài 1: Concurrency revisited — vấn đề với WATCH ở traffic cao

Phase 15 đã giải race với WATCH/MULTI. Phase 16 thay bằng Lua. Bài này nhìn lại vấn đề ở **góc nhìn business**: cả 2 approach có khuyết điểm khi traffic cực cao. Đây là motivation cho **Distributed Lock** — cách thứ 4.

## Recap: WATCH với bid

```ts
async function bidWithWatch(itemId, amount) {
  await conn.watch(itemKey(itemId));
  const item = await getItem(itemId);
  if (item.price >= amount) {
    await conn.unwatch();
    throw new Error('Bid too low');
  }
  const result = await conn.multi()
    .hSet(itemKey(itemId), {...})
    .exec();
  if (result === null) {
    throw new Error('Bid lost (concurrent update)');   // ← bid valid nhưng bị reject
  }
}
```

WATCH fail → bid bị reject **dù bid hợp lệ**.

## Scenario business

```text
Auction item, current price $5.

Time | Client A bid $15        Client B bid $10
-----|--------------------------|------------------------
T1   | WATCH + getItem(price=5) |
T2   |                          | WATCH + getItem(price=5)
T3   | MULTI + HSET price=15    |
T4   | EXEC ✓ price=15          |
T5   |                          | MULTI + HSET price=10
T6   |                          | EXEC ❌ key modified (WATCH fail)
```

→ Client A win với $15. Client B reject. **Đúng** vì B bid thấp hơn A.

**Nhưng** swap thứ tự:

```text
Time | Client A bid $15        Client B bid $10
-----|--------------------------|------------------------
T1   |                          | WATCH + getItem(price=5)
T2   | WATCH + getItem(price=5) |
T3   |                          | MULTI + HSET price=10
T4   |                          | EXEC ✓ price=10
T5   | MULTI + HSET price=15    |
T6   | EXEC ❌ key modified (WATCH fail)
```

→ B bid $10 thắng. A bid $15 **bị reject** dù higher.

Đây là **business loss**: app từ chối bid hợp lệ → user nghĩ "app broken" → bỏ đi.

## Stress test thực

App có 3 server, 3 bidder script, 50 bid mỗi script (150 total):

```text
Server 1: 35/50 success (70%)
Server 2: 30/50 success (60%)
Server 3: 32/50 success (64%)

Total: 64-70% success rate
```

→ **30% bid valid bị reject**. Cho auction site, đây là **catastrophe**.

## Retry — sửa được không?

```ts
for (let retry = 0; retry < 10; retry++) {
  await conn.watch(...);
  const item = await getItem(...);
  if (item.price >= amount) {
    await conn.unwatch();
    return reject;     // hợp lệ reject
  }
  const r = await conn.multi()...exec();
  if (r !== null) return;
  await sleep(...);
}
throw new Error('Too much contention');
```

Lúc retry, fetch lại price hiện tại. Nếu B đã bid $10 và A retry với $15 → A thấy price=10, validate $15 > $10 ✓, ghi thành công.

**Hoạt động**, nhưng:
- Thêm load lên Redis: mỗi retry = 1 RTT fetch + 1 RTT MULTI.
- High contention: 10 client cùng bid → mỗi cái retry trung bình 5 lần → **5x load**.
- Latency increase: p99 từ 2ms lên 20ms.

→ Không scale tốt.

## Lua — better nhưng vẫn có vấn đề

Phase 16 đã refactor sang Lua atomic. Không cần retry — Redis xử lý tuần tự, mỗi bid hoặc valid hoặc reject.

```lua
local price = tonumber(redis.call('HGET', KEYS[1], 'price'))
if price >= tonumber(ARGV[1]) then
  return redis.error_reply('BID_TOO_LOW')
end
redis.call('HSET', KEYS[1], 'price', ARGV[1])
return 'OK'
```

Stress test: **100% success cho bid valid**. Vì:
- A bid $15. Lua chạy: price=5, validate ✓, set price=15. Return OK.
- B bid $10 sau. Lua chạy: price=15, validate ✗, return BID_TOO_LOW.

→ Đúng business logic. **Lua thắng WATCH** ở stress test.

## Khi Lua KHÔNG đủ

Lua chỉ dùng được khi:
- Logic fit trong 1 script (< 50 dòng).
- Không gọi external service.
- Toàn bộ data trong Redis.

**Khi nào không đủ**:
1. **Workflow phức tạp**: vd "lock auction, charge user qua Stripe (external), commit only if charge success".
2. **Cross-system coordination**: vd "lock item, gọi inventory service xác nhận, ghi vào DB chính".
3. **Long-running operation**: vd "rebuild search index 30 giây — cần lock trong suốt".

Lua không phù hợp vì **block server** trong suốt thời gian chạy.

## Distributed Lock — cách thứ 4

> **Distributed Lock** = một entity Redis cho biết "ai đang giữ quyền operate trên resource X". Workers tranh nhau acquire lock; chỉ 1 thắng. Worker thắng làm việc xong → release. Worker khác chờ.

Workflow:
1. Client A: `SET lock:bid:itemX A_id NX EX 30` — chỉ thành công nếu chưa lock.
2. Nếu acquire → A có 30s để làm việc.
3. A thực hiện logic (đọc Redis, validate, ghi, hoặc gọi service ngoài).
4. A release: `DEL lock:bid:itemX` (kèm verify A vẫn là owner).
5. Client B đến trong khi A đang giữ lock → fail acquire → retry hoặc throw.

→ Không như WATCH/Lua, lock **không atomic mức Redis**. Là **coordination primitive** giúa các worker.

## Khác MULTI/Lua như thế nào?

| | MULTI/WATCH | Lua | Distributed Lock |
|---|---|---|---|
| Atomic | Per transaction | Per script | KHÔNG (manual) |
| Scope | Redis operations only | Redis operations only | **Anything, kể cả external** |
| Wait/retry | Retry if conflict | Không cần retry | Acquire fail → wait/retry |
| Duration | Microseconds | Milliseconds | **Seconds** (tuỳ business op) |
| Risk | Failed transactions | Block server nếu chậm | Deadlock nếu quên release |

→ Lock cho phép **long operation** mà 2 cái trên không cho.

## Use case lock thực tế

- **Checkout flow**: lock cart → validate stock → charge payment → tạo order → release lock.
- **Cache rebuild**: chỉ 1 worker rebuild big cache, các worker khác chờ kết quả.
- **Migration script**: chỉ 1 instance chạy migration tại một thời điểm.
- **Schedule task**: 1 worker đảm nhận task trong cluster N workers.

## Roadmap phase-17

6 bài tới sẽ cover:
- Bài 2: Lock overview + acquire/release pattern.
- Bài 3: Implementing `withLock` helper.
- Bài 4: Automatic expiration để tránh deadlock.
- Bài 5: Verify owner khi release.
- Bài 6: Lock signaling expiration cho long operation.
- Bài 7: Tổng kết + RedLock + alternatives.

## Tóm tắt bài 1

- WATCH với high contention: 30%+ bid valid bị reject.
- Retry mitigates nhưng tăng load.
- Lua atomic giải tốt cho operation ngắn fit Redis.
- **Distributed Lock** cho long operation + external service.
- Lock là **coordination**, không atomic mức Redis.

**Bài kế tiếp** → [Bài 2: Overview Distributed Lock](02-overview-distributed-lock.md)
