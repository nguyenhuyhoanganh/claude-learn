# Bài 5: KEYS và ARGV — passing data into script

Lua script truy cập 2 array global: `KEYS` và `ARGV`. Bài này giải thích vì sao Redis tách 2, cách dùng đúng, và bẫy khi cluster.

## Cú pháp EVAL với KEYS và ARGV

```text
EVAL <script> <numkeys> [key1] [key2] ... [arg1] [arg2] ...
```

`<numkeys>` quy định bao nhiêu argument đầu là **keys**. Phần còn lại là **args**.

Ví dụ:
```text
EVAL "return KEYS[1] .. ARGV[1]" 1 foo bar
"foobar"
-- KEYS[1] = "foo", ARGV[1] = "bar"

EVAL "return {KEYS[1], KEYS[2], ARGV[1]}" 2 k1 k2 a1
1) "k1"     2) "k2"     3) "a1"
```

## Vì sao tách KEYS và ARGV?

**Lý do 1: Cluster routing**

Trong Redis Cluster, keys phân tán trên nhiều node theo hash slot. Khi script đụng nhiều key, Redis cần biết **tất cả keys script sẽ touch** để route đúng node.

→ Tất cả KEYS phải **cùng slot** trong Cluster.

```text
EVAL "..." 2 user:{42}:name user:{42}:profile arg1
-- OK: cùng hash tag {42}

EVAL "..." 2 user:{42}:name user:{99}:profile arg1
-- ERROR: CROSSSLOT
```

ARGV không phải keys → không slot check. Chứa data thuần.

**Lý do 2: Conventions + Lint**

Best practice: mọi key script touch phải khai báo trong KEYS. Lint tools / static analysis dựa vào convention này.

**Sai pattern** (cluster-incompatible):
```lua
-- KHÔNG nên: key hard-coded trong script
return redis.call('GET', 'hardcoded_key')

-- KHÔNG nên: key build từ ARGV
return redis.call('GET', 'prefix:' .. ARGV[1])
```

**Đúng**:
```lua
-- Mọi key qua KEYS
return redis.call('GET', KEYS[1])
```

## Bẫy: build key từ ARGV

Đây là **anti-pattern** phổ biến:

```lua
-- ❌ KHÔNG nên
local userId = ARGV[1]
local key = 'user#' .. userId
local data = redis.call('HGETALL', key)
```

→ Trong Cluster, Redis không biết script sẽ touch key nào → không route được. Cluster sẽ reject hoặc gây error.

**Đúng**:
```ts
// Build key ở client, pass qua KEYS
const userKey = `user#${userId}`;
await client.eval(SCRIPT, { keys: [userKey], arguments: [userId] });
```

```lua
local data = redis.call('HGETALL', KEYS[1])
local userId = ARGV[1]      -- nếu cần dùng userId riêng
```

## Khi nào dùng ARGV?

ARGV chứa:
- Values to set/incr.
- Threshold cho comparison.
- Counts/limits.
- User-supplied data.

```lua
-- Set if condition
local threshold = tonumber(ARGV[1])
local current = tonumber(redis.call('GET', KEYS[1])) or 0
if current < threshold then
  redis.call('SET', KEYS[1], ARGV[2])
end
```

Gọi:
```text
EVAL "..." 1 counter 100 newvalue
```

KEYS[1] = `counter`. ARGV[1] = `100` (threshold). ARGV[2] = `newvalue`.

## Pattern: variadic ARGV

Script nhận N args không cố định:

```lua
-- Add tất cả ARGV vào set
for i = 1, #ARGV do
  redis.call('SADD', KEYS[1], ARGV[i])
end
return #ARGV
```

Gọi:
```text
EVAL "..." 1 tags vintage wood handmade
(integer) 3
```

3 args được lặp qua, add vào set.

## Pattern: variadic KEYS

Tương tự với KEYS:

```lua
-- Get all and aggregate
local total = 0
for i = 1, #KEYS do
  local v = tonumber(redis.call('GET', KEYS[i])) or 0
  total = total + v
end
return total
```

Gọi:
```text
EVAL "..." 3 counter1 counter2 counter3
(integer) 750
```

## Real example: like toggle

App RB: toggle like (like nếu chưa, unlike nếu rồi). Atomic.

```lua
-- like-toggle.lua
-- KEYS[1] = likes:user#<userId> (Set)
-- KEYS[2] = liked_by:item#<itemId> (Set)
-- KEYS[3] = items#<itemId> (Hash)
-- KEYS[4] = items:by-likes (Sorted Set)
-- ARGV[1] = userId
-- ARGV[2] = itemId

local isNew = redis.call('SADD', KEYS[1], ARGV[2])
if isNew == 1 then
  -- Liked
  redis.call('SADD', KEYS[2], ARGV[1])
  redis.call('HINCRBY', KEYS[3], 'likes', 1)
  redis.call('ZINCRBY', KEYS[4], 1, ARGV[2])
  return 1
else
  -- Unliked
  redis.call('SREM', KEYS[1], ARGV[2])
  redis.call('SREM', KEYS[2], ARGV[1])
  redis.call('HINCRBY', KEYS[3], 'likes', -1)
  redis.call('ZINCRBY', KEYS[4], -1, ARGV[2])
  return 0
end
```

Caller:
```ts
const result = await client.eval(LIKE_SCRIPT, {
  keys: [
    userLikesKey(userId),
    itemLikedByKey(itemId),
    itemKey(itemId),
    itemsByLikesKey(),
  ],
  arguments: [userId, itemId],
});
// result = 1 nếu liked, 0 nếu unliked
```

**Cluster compatibility**: 4 keys phải cùng slot → hash tag.

```ts
// keys.ts
export const userLikesKey = (uid: string) => `likes:user#{${uid}}`;
export const itemLikedByKey = (iid: string) => `liked_by:item#{${iid}}`;
```

Tuy nhiên hash tag khác nhau cho user và item → vẫn không cùng slot.

**Workaround cluster**: dùng cùng hash tag toàn bộ:
```ts
const SHARED_TAG = '{social}';
userLikesKey: (uid) => `likes:user#${SHARED_TAG}#${uid}`,
itemLikedByKey: (iid) => `liked_by:item#${SHARED_TAG}#${iid}`,
itemKey: (iid) => `items#${SHARED_TAG}#${iid}`,
```

Trade-off: mọi like + item nằm cùng node → hot shard. Cluster bị nghẽn.

→ Cho large-scale: **không dùng Lua đa key qua nhiều entity**. Fallback WATCH/MULTI per-key.

## Recommendation: tách scripts theo entity

Thay vì 1 script đụng 4 keys khác slots, tách thành 2 script:

```lua
-- like-toggle-user.lua: KEYS[1] = user likes set
-- like-toggle-item.lua: KEYS[1] = item liked-by, KEYS[2] = item hash
```

App gọi 2 script. Mỗi cái cluster-compatible với hash tag. Mất atomic giữa 2 nhưng acceptable cho like toggle (race rare).

## EVAL không cần KEYS

```text
EVAL "return 'hello'" 0
"hello"
```

`<numkeys> = 0`: không có KEYS, chỉ ARGV.

```text
EVAL "return ARGV[1]" 0 helloworld
"helloworld"
```

→ Cho scripts pure computation, không đụng key.

## Đặt tên thực dụng

Khi script lớn, dùng comment đầu để document KEYS/ARGV:

```lua
-- bid-script.lua
-- KEYS:
--   [1] items#<itemId>
--   [2] items:price (sorted set)
--   [3] bids:item#<itemId> (list)
-- ARGV:
--   [1] userId
--   [2] amount (string of number)
--   [3] time (Unix ms string)

local item_key = KEYS[1]
local price_key = KEYS[2]
local bids_key = KEYS[3]

local user_id = ARGV[1]
local amount = tonumber(ARGV[2])
local time = tonumber(ARGV[3])

-- ... logic
```

→ Code đọc dễ hơn nhiều. Maintain tốt hơn.

## Pattern: dùng named local aliases

```lua
local key_item = KEYS[1]
local key_index = KEYS[2]

local arg_amount = tonumber(ARGV[1])
local arg_user = ARGV[2]

-- Sau đó dùng key_item, key_index... thay vì KEYS[1], KEYS[2]
```

Cải thiện readability.

## Tóm tắt bài 5

- KEYS = mọi key script touch. ARGV = data khác.
- Cluster cần KEYS để route — luôn pass keys qua KEYS, không hard-code.
- Tránh build key từ ARGV — anti-pattern.
- Variadic KEYS / ARGV qua loop `for i = 1, #KEYS do`.
- Multi-key Lua cần hash tag trong Cluster — cẩn thận hot shard.
- Comment KEYS/ARGV đầu script cho maintain.

**Bài kế tiếp** → [Bài 6: When to use Lua + áp dụng app RB hoàn chỉnh](06-when-to-use-lua-app-rb.md)
