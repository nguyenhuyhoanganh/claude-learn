# Bài 3: Lua tables — array và dict patterns trong Redis script

Table là **everything trong Lua**. Trong Redis script, table xuất hiện khi:
- Receive từ Redis (HGETALL, LRANGE, ZRANGE WITHSCORES trả về table).
- Build response (return array để Redis trả mảng).
- Loop để process data.

Bài này cover patterns thực tế.

## Pattern 1: Array iteration

```lua
local arr = redis.call('LRANGE', KEYS[1], 0, -1)
-- arr = {"a", "b", "c", "d"}

for i, val in ipairs(arr) do
  print(i, val)
end
-- 1   a
-- 2   b
-- 3   c
-- 4   d
```

`ipairs` iterate sequential numeric indexes. Stop ở nil hoặc hết.

```lua
-- Alternative với numeric for
for i = 1, #arr do
  print(arr[i])
end
```

Equivalent. Dùng `ipairs` thường rõ hơn.

## Pattern 2: HGETALL → key-value pairs

`HGETALL` Redis trả flat array trong Lua: `{field1, value1, field2, value2, ...}`.

```lua
local raw = redis.call('HGETALL', KEYS[1])
-- raw = {"name", "Alice", "age", "30", "role", "admin"}

-- Convert thành Lua dict
local dict = {}
for i = 1, #raw, 2 do        -- step 2
  dict[raw[i]] = raw[i + 1]
end
-- dict = { name="Alice", age="30", role="admin" }

print(dict.name)    -- "Alice"
```

Pattern này phổ biến — chuyển flat array thành dict cho access.

## Pattern 3: Build array response

```lua
local result = {}
table.insert(result, "first")
table.insert(result, "second")
return result
-- Redis reply: array of 2 elements
```

Hoặc dùng table literal:
```lua
return {"first", "second", "third"}
```

## Pattern 4: Filter array

```lua
local all = redis.call('ZRANGE', KEYS[1], 0, -1, 'WITHSCORES')
-- {"a", "1", "b", "2", "c", "3"}

local result = {}
for i = 1, #all, 2 do
  local member = all[i]
  local score = tonumber(all[i + 1])
  if score % 2 == 0 then           -- even scores only
    table.insert(result, member)
  end
end
return result
-- {"b"}
```

Filter server-side — không over-fetch.

## Pattern 5: Aggregate / reduce

```lua
local scores = redis.call('ZRANGE', KEYS[1], 0, -1, 'WITHSCORES')
local sum = 0
for i = 2, #scores, 2 do    -- start at 2, step 2 (only scores)
  sum = sum + tonumber(scores[i])
end
return sum
```

Sum all scores trong sorted set. Server-side, 1 RTT.

## Pattern 6: Multi-key operation

```lua
-- Move user từ set A sang set B nếu trong A
local key_a = KEYS[1]
local key_b = KEYS[2]
local user = ARGV[1]

if redis.call('SISMEMBER', key_a, user) == 1 then
  redis.call('SREM', key_a, user)
  redis.call('SADD', key_b, user)
  return 1
end
return 0
```

Atomic move giữa 2 set. Tương đương SMOVE nhưng có check khác.

## Pattern 7: Loop với break

Lua không có `break` keyword đơn giản — phải dùng pattern khác:

```lua
for i, v in ipairs(arr) do
  if v == target then
    return i
  end
end
return -1
```

→ `return` sớm thay vì `break`. Cleaner cho Redis script.

Lua 5.2+ có `goto continue`, nhưng Redis Lua 5.1 → không có break direct.

```lua
-- Lua 5.1 trick: dùng repeat...until
local found = false
local i = 1
repeat
  if arr[i] == target then found = true end
  i = i + 1
until found or i > #arr
```

Verbose. Pattern `return early` đơn giản hơn.

## Pattern 8: Conditional accumulator

```lua
-- Count members có score > threshold
local key = KEYS[1]
local threshold = tonumber(ARGV[1])

local all = redis.call('ZRANGE', key, 0, -1, 'WITHSCORES')
local count = 0
for i = 2, #all, 2 do
  if tonumber(all[i]) > threshold then
    count = count + 1
  end
end
return count
```

→ Tương đương `ZCOUNT key (threshold +inf` nhưng demonstration.

## Pattern 9: Build nested response

```lua
local items = redis.call('LRANGE', KEYS[1], 0, 9)

local response = {}
for i, raw in ipairs(items) do
  -- Mỗi raw là JSON string của bid
  -- Lua không có JSON parse built-in. Decode bằng cjson:
  local bid = cjson.decode(raw)
  -- bid = { userId="abc", amount=100, time=1234567890 }
  
  -- Return chỉ amount + userId (subset)
  table.insert(response, bid.userId)
  table.insert(response, tostring(bid.amount))
end
return response
```

`cjson.decode` — JSON library có sẵn trong Redis Lua. `cjson.encode` cho serialize.

## Pattern 10: Return table với metadata

```lua
local key = KEYS[1]
local count = redis.call('LLEN', key)
local first = redis.call('LINDEX', key, 0)
local last = redis.call('LINDEX', key, -1)

return {count, first, last}
-- Redis client nhận: array of 3 elements
```

→ Encode multiple return values trong 1 array.

## Pattern 11: Process pairs từ multiple sources

```lua
-- Update view counter cho nhiều item
local items_key = KEYS[1]      -- sorted set
local item_ids = ARGV          -- list of itemIds from ARGV

for i, id in ipairs(item_ids) do
  redis.call('HINCRBY', 'items#' .. id, 'views', 1)
  redis.call('ZINCRBY', items_key, 1, id)
end

return #item_ids
```

→ Bulk update với 1 script. So với pipeline: atomic + 1 RTT.

## Pattern 12: Snapshot multiple hashes

```lua
-- Fetch N hash + return data
local keys = KEYS    -- multiple keys
local result = {}

for i, key in ipairs(keys) do
  local data = redis.call('HGETALL', key)
  table.insert(result, data)
end

return result
-- Redis: array of arrays
```

Atomic snapshot — không có client khác chen giữa các HGETALL.

## Bẫy: table có nil giữa array

```lua
local arr = {"a", nil, "c"}
print(#arr)        -- không xác định: 1, 2, hoặc 3
```

`#` count đến nil đầu tiên (thường). **Tránh nil trong array**.

Workaround:
```lua
local arr = {"a", "", "c"}    -- empty string thay nil
```

Hoặc dùng `n` field:
```lua
local arr = { n = 3, "a", nil, "c" }
print(arr.n)    -- 3
```

## Bẫy: Lua không có ordered dict

```lua
local d = { a = 1, b = 2, c = 3 }
for k, v in pairs(d) do print(k, v) end
-- Order không guarantee
```

`pairs` iterate **không có order**. Khác Python dict (3.7+ ordered).

→ Nếu cần order, dùng array of pairs:
```lua
local list = {
  {key="a", value=1},
  {key="b", value=2},
}
for i, item in ipairs(list) do print(item.key, item.value) end
```

## Performance tip: pre-allocate

```lua
-- Slow
local result = {}
for i = 1, 100000 do
  table.insert(result, i)
end

-- Faster: pre-allocate
local result = {}
for i = 1, 100000 do
  result[i] = i
end
```

`table.insert` slower than direct assignment với big array (resize overhead).

## Example tổng hợp: get top N items với details

```lua
-- KEYS[1] = sorted set 'items:views'
-- ARGV[1] = count

local n = tonumber(ARGV[1])
local ids = redis.call('ZREVRANGE', KEYS[1], 0, n - 1)

local response = {}
for i, id in ipairs(ids) do
  local data = redis.call('HMGET', 'items#' .. id, 'name', 'price', 'views')
  -- data = {name, price, views}
  table.insert(response, id)
  table.insert(response, data[1])
  table.insert(response, data[2])
  table.insert(response, data[3])
end

return response
```

→ 1 RTT. Server-side iteration. Phía client chunk 4 fields per item.

Tương đương: ZRANGE + pipeline HMGET = 2 RTT.

## Tóm tắt bài 3

- Table là cấu trúc duy nhất cho cả array và dict.
- HGETALL trả flat array → convert thành dict với `for i = 1, #raw, 2`.
- Filter/aggregate server-side để tránh over-fetch.
- `cjson.encode`/`cjson.decode` cho JSON.
- Tránh nil trong array — dùng empty string hoặc field `n`.
- `pairs` không order; dùng array of pairs nếu cần.

**Bài kế tiếp** → [Bài 4: SCRIPT LOAD + EVALSHA — caching và performance](04-script-load-evalsha.md)
