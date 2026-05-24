# Bài 6: When to use Lua + áp dụng app RB hoàn chỉnh

Bài cuối phase-16. Tổng kết khi nào dùng Lua, khi nào không, refactor app RB từ WATCH sang Lua cho bid (đơn giản hơn), và view counter atomic.

## Decision: Lua vs alternatives

| Tình huống | Approach |
|---|---|
| Single atomic op (INCR, SADD, HSET) | **Native command** — đơn giản nhất |
| Batch không atomic | **Pipeline** (`Promise.all`) |
| Batch atomic không có conditional | **MULTI/EXEC** |
| Conditional update đơn (read-then-check-then-write) | **MULTI/WATCH** với retry |
| Conditional update phức tạp + abort logic | **Lua** |
| Compute server-side (sum, filter, aggregate) | **Lua** |
| Multi-key atomic logic | **Lua** với hash tag |
| Sequence of dependent commands | **Lua** |

→ Lua thắng khi cần **logic** + **atomic**. Không có alternative đủ.

## Khi nào KHÔNG dùng Lua

1. **Logic dài (>10ms ở server)**: chặn event loop, mọi client khác chờ. Tách thành smaller scripts hoặc rethink.
2. **Loop trên big collection**: vd duyệt 1M element sorted set → script chạy giây → BAD. Dùng SCAN từ client.
3. **External call**: Lua không có HTTP/I/O. Không gọi service ngoài được.
4. **State giữa các call**: Lua script stateless. Mỗi call độc lập. Không phải dùng Lua cho state machine multi-step.
5. **Team không quen Lua**: learning curve. Cân nhắc trước.

## Tips để Lua script nhanh

1. **Pre-fetch một lần**: thay vì gọi `redis.call` trong loop, fetch all data 1 lần rồi process.
2. **Avoid unnecessary table operations**: pre-allocate, không insert/remove giữa array.
3. **Use cjson**: parse JSON nhanh trong Lua.
4. **Limit script complexity**: 50 dòng = OK. 500 dòng = refactor.
5. **Profile với `SLOWLOG`**: script chậm xuất hiện trong slow log.

## Refactor app RB: bid với Lua

Bài 5 phase-15 dùng WATCH/MULTI/EXEC với retry loop. Code dài, complex. Lua đơn giản hơn:

```lua
-- bid-script.lua
-- KEYS[1] = items#<itemId>
-- KEYS[2] = items:price (sorted set)
-- KEYS[3] = bids:item#<itemId> (list)
-- ARGV[1] = userId
-- ARGV[2] = amount (string)
-- ARGV[3] = time (Unix ms string)
-- ARGV[4] = bidJson (serialized full bid)

-- Fetch item state
local item = redis.call('HMGET', KEYS[1], 'price', 'endingAt')
local price = tonumber(item[1])
local endingAt = tonumber(item[2])
local amount = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

-- Validate
if price == nil then
  return redis.error_reply('ITEM_NOT_FOUND')
end
if endingAt < now then
  return redis.error_reply('ITEM_CLOSED')
end
if amount <= price then
  return redis.error_reply('BID_TOO_LOW')
end

-- Update (atomic)
redis.call('RPUSH', KEYS[3], ARGV[4])
redis.call('HSET', KEYS[1], 'price', ARGV[2], 'highestBidUserId', ARGV[1])
redis.call('HINCRBY', KEYS[1], 'bids', 1)
redis.call('ZADD', KEYS[2], 'GT', amount, ARGV[1])

return 'OK'
```

Caller:
```ts
const BID_LUA = await client.scriptLoad(fs.readFileSync('bid-script.lua', 'utf8'));

export async function createBid(attrs: CreateBidAttrs) {
  const bid = { userId: attrs.userId, amount: attrs.amount, time: new Date() };
  
  try {
    const result = await client.evalSha(BID_LUA, {
      keys: [
        itemKey(attrs.itemId),
        itemsByPriceKey(),
        itemBidsKey(attrs.itemId),
      ],
      arguments: [
        attrs.userId,
        attrs.amount.toString(),
        Date.now().toString(),
        serializeBid(bid),
      ],
    });
    
    if (result === 'OK') return;
  } catch (err) {
    if (err.message === 'ITEM_NOT_FOUND') throw new Error('Item does not exist');
    if (err.message === 'ITEM_CLOSED') throw new Error('Item closed to bidding');
    if (err.message === 'BID_TOO_LOW') throw new Error('Bid too low');
    throw err;
  }
}
```

So với WATCH approach:
- ✓ 1 RTT thay vì 1 RTT + retry.
- ✓ Không cần retry loop, không livelock risk.
- ✓ Không cần connection isolation.
- ✓ Atomic absolute (không có "window" giữa các lệnh).
- ✓ Code ngắn gọn hơn.

→ **Lua thường tốt hơn WATCH** cho bid case.

## Refactor view counter với Lua

```lua
-- view-script.lua
-- KEYS[1] = viewers:item#<itemId> (Set)
-- KEYS[2] = items#<itemId> (Hash)
-- KEYS[3] = items:views (Sorted Set)
-- ARGV[1] = userId
-- ARGV[2] = itemId

local isNew = redis.call('SADD', KEYS[1], ARGV[1])
if isNew == 1 then
  redis.call('HINCRBY', KEYS[2], 'views', 1)
  redis.call('ZINCRBY', KEYS[3], 1, ARGV[2])
end
return isNew
```

Caller:
```ts
const VIEW_LUA = await client.scriptLoad(/* script */);

async function viewItem(userId: string, itemId: string) {
  await client.evalSha(VIEW_LUA, {
    keys: [itemViewersKey(itemId), itemKey(itemId), itemsByViewsKey()],
    arguments: [userId, itemId],
  });
}
```

Atomic 3 cấu trúc cập nhật. Trước race nhỏ giữa SADD và HINCRBY (như bài 4 phase-9) — giờ hết.

## Cluster compatibility với hash tags

Lua đa key cần KEYS cùng slot. App RB cần re-design key naming:

```ts
// Hash tag theo entity
export const itemKey = (id: string) => `items#{${id}}`;
export const itemViewersKey = (id: string) => `viewers:item#{${id}}`;
export const itemBidsKey = (id: string) => `bids:item#{${id}}`;
// Mọi key của 1 item cùng slot

// Cross-entity (likes user→items): khó cluster. 
// Workaround: tách script per-entity.
```

Trade-off:
- Cluster compatible nhưng hot shard cho item phổ biến.
- Hoặc fallback non-Lua per-entity (HSET, SADD riêng).

App scale cực lớn → cân nhắc kỹ. App vừa → atomic Lua thắng.

## SCRIPT debugging

Lua khó debug hơn JS/Python. Tips:

1. **Test với `redis-cli` trực tiếp**:
   ```bash
   redis-cli --eval bid-script.lua items#x , user1 100 1736000000 '{}'
   ```
   `--eval`: load script từ file. `,` phân tách KEYS và ARGV.

2. **Return debug info**:
   ```lua
   if amount <= price then
     return redis.error_reply('BID_TOO_LOW. price=' .. price .. ' amount=' .. amount)
   end
   ```

3. **Use SLOWLOG**: script chậm xuất hiện ở `SLOWLOG GET`.

4. **Unit test script** với mock Redis (vd `ioredis-mock`).

## Common patterns đã làm

Tổng hợp các Lua patterns đã thấy:

| Pattern | Code skeleton |
|---|---|
| Atomic increment if condition | `local v = redis.call('GET', K); if v then ... HINCRBY end` |
| Atomic toggle | `local r = redis.call('SADD',...); if r == 1 then ... else ... end` |
| Compound read+validate+write | `HMGET → validate → HSET + RPUSH + ZADD` |
| Server-side filter | `ZRANGE → for loop → filter → table.insert → return` |
| Multi-key atomic | `for i = 1, #KEYS → redis.call` |

## Limitations + caveat

1. **No floating point cleanly**: Lua `1/3 = 0.333...`. Khi return → Redis truncate integer. Workaround: return string của float.
2. **No JSON literal**: phải `cjson.decode/encode`.
3. **Script timeout**: default 5s. Cấu hình `lua-time-limit`. Khi timeout, server kill script — nhưng đã modify state có thể remain. Cẩn thận.
4. **Replication**: script được replicate (effects, không source) → tránh `math.random`, `os.time` (non-deterministic).

## Tóm tắt phase-16

Đã học:
- **Lua scripting là gì** + giải quyết race + over-fetch (Bài 1).
- **Lua syntax basics** (Bài 2).
- **Lua tables** array + dict patterns (Bài 3).
- **SCRIPT LOAD + EVALSHA** + caching (Bài 4).
- **KEYS và ARGV** + cluster considerations (Bài 5).
- **When to use Lua** + áp dụng app RB (Bài 6).

App RB giờ có Lua atomic cho bid + view. Race condition hết, code ngắn hơn so với WATCH approach.

## Phase tiếp theo

Phase 17 (Section 18) sẽ học **Distributed Lock** chi tiết — pattern thứ 4 (sau atomic primitive, WATCH, Lua) cho concurrency. Lock dùng cho:
- Business operation lớn (vd checkout flow).
- Logic không phù hợp Lua (gọi external service).
- Coordinate giữa nhiều worker.

→ [Phase-17 — Bài 1: Concurrency revisited + Distributed Lock](../phase-17/01-concurrency-revisited.md)
