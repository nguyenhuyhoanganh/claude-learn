# Bài 2: Lua basics — syntax cần biết cho dev Redis

Bài này dạy syntax Lua **đủ để viết Redis script**. Không phải full Lua tutorial — chỉ cover phần dùng nhiều: variable, control flow, function, type conversion. Hết bài này bạn đọc + viết được 90% Redis Lua script.

## Variable

```lua
local x = 10           -- local variable trong scope
local name = "Alice"
local price = 19.99
local flag = true
local nothing = nil

-- Không có local = global (avoid!)
counter = 100          -- global
```

→ **Luôn dùng `local`** trong Redis script. Global vars có thể đụng giữa các script invocation.

## Comments

```lua
-- Single line comment

--[[
   Multi-line
   block comment
]]
```

## String

```lua
local s = "hello"
local s2 = 'world'           -- single quote OK
local s3 = "she said \"hi\"" -- escape với \

-- Concat dùng ..
local greeting = s .. " " .. s2
-- → "hello world"

-- Length: #
print(#s)        -- 5

-- Substring: string.sub
local sub = string.sub(s, 1, 3)    -- "hel" (index 1-3, inclusive)
```

**Quan trọng**: Lua index **1-based**, không phải 0! Khác hầu hết ngôn ngữ.

## Number

```lua
local i = 42
local f = 3.14
local big = 1e10
local neg = -5

-- Operators
local a = 10 + 5     -- 15
local b = 10 / 3     -- 3.333... (always float div)
local c = 10 % 3     -- 1
local d = 2 ^ 10     -- 1024

-- Convert
local s = tostring(42)        -- "42"
local n = tonumber("3.14")    -- 3.14
local fail = tonumber("abc")  -- nil (không parse được)
```

Trong Redis Lua: số được pass từ ARGV là **string**. Phải `tonumber()`.

```lua
local n = tonumber(ARGV[1])
if n == nil then return -1 end
```

## Boolean & nil

```lua
local t = true
local f = false
local nothing = nil
```

**Quan trọng**:
- `nil` và `false` là **falsy**.
- Everything else (including 0, "") là **truthy**.

```lua
if 0 then print("truthy") end       -- print "truthy"
if "" then print("truthy") end       -- print "truthy"
if nil then ... end                  -- skip
```

→ Khác JS/Python (0 và "" là falsy). **Cẩn thận** khi code Lua.

## Control flow

### if/elseif/else

```lua
if x > 10 then
  print("big")
elseif x > 5 then
  print("medium")
else
  print("small")
end
```

Cú pháp: `if ... then`, `end` đóng block.

### while

```lua
local i = 1
while i <= 5 do
  print(i)
  i = i + 1
end
```

### for (numeric)

```lua
for i = 1, 10 do          -- i = 1..10, inclusive
  print(i)
end

for i = 1, 10, 2 do       -- step 2
  print(i)                 -- 1, 3, 5, 7, 9
end

for i = 10, 1, -1 do      -- countdown
  print(i)
end
```

### for (generic — for table iteration)

```lua
for index, value in ipairs(myArray) do
  print(index, value)
end

for key, value in pairs(myDict) do
  print(key, value)
end
```

`ipairs`: iterate array (sequential numeric index from 1).  
`pairs`: iterate all key-value (including string keys).

## Function

```lua
local function add(a, b)
  return a + b
end

print(add(3, 4))    -- 7
```

Or anonymous:
```lua
local add = function(a, b) return a + b end
```

Multiple return:
```lua
local function minmax(arr)
  local mn, mx = arr[1], arr[1]
  for i = 2, #arr do
    if arr[i] < mn then mn = arr[i] end
    if arr[i] > mx then mx = arr[i] end
  end
  return mn, mx
end

local lo, hi = minmax({5, 2, 8, 1, 9})
```

## Table — cấu trúc dữ liệu chính của Lua

Table = **mọi thứ** trong Lua: array, dict, object.

### Như array

```lua
local arr = {10, 20, 30, 40}
print(arr[1])     -- 10 (1-based!)
print(#arr)        -- 4 (length)

table.insert(arr, 50)        -- append
table.remove(arr, 1)         -- xoá index 1
```

### Như dict (key-value)

```lua
local user = {
  name = "Alice",
  age = 30,
}

print(user.name)     -- "Alice"
print(user["age"])   -- 30

user.email = "a@b.com"      -- thêm key mới
user.age = nil               -- xoá key
```

`obj.key` = `obj["key"]` (syntactic sugar).

### Mixed

```lua
local mixed = {
  "first",
  "second",
  name = "table",
}
print(mixed[1])     -- "first"
print(mixed.name)   -- "table"
```

→ Mixed thường gây nhầm. Khuyến cáo: tách array và dict riêng.

## Type conversion trong Redis Lua

Thường gặp:

```lua
-- ARGV[1] là string. Convert sang số:
local n = tonumber(ARGV[1])

-- Số → string để pass vào lệnh Redis:
redis.call('SET', KEYS[1], tostring(n))

-- Check type:
if type(value) == "number" then ... end
if type(value) == "string" then ... end
if type(value) == "table" then ... end
```

## String formatting

```lua
local s = string.format("Hello %s, you are %d", name, age)
-- "Hello Alice, you are 30"
```

Specifier:
- `%s` — string
- `%d` — integer
- `%f` — float
- `%.2f` — float với 2 chữ số thập phân

## Table.concat — join array

```lua
local arr = {"a", "b", "c"}
local s = table.concat(arr, ", ")
-- "a, b, c"
```

## Length operator # với table

```lua
#{1, 2, 3}        -- 3
#{}               -- 0
#{1, nil, 3}      -- không xác định (1 hoặc 3, depend)
```

**Bẫy**: `#` chỉ chính xác cho **array dày** (sequential indexes from 1). Với "holes", behavior không xác định.

→ Always `table.insert` thay vì gán index thưa.

## Logical operators

```lua
a and b           -- a nếu false/nil, else b
a or b            -- a nếu truthy, else b
not a             -- false nếu a truthy, else true

-- Idiom: default value
local x = ARGV[1] or "default"
local n = tonumber(ARGV[2]) or 0
```

## Common bug: `==` cho string vs number

```lua
"5" == 5          -- false (different types!)
tonumber("5") == 5  -- true
```

→ Compare cẩn thận khi mix types từ Redis.

## `redis.call()` vs `redis.pcall()`

```lua
-- redis.call: lỗi thì script abort
local val = redis.call('GET', 'maybe_missing')

-- redis.pcall: lỗi return error object, không abort
local val = redis.pcall('GET', 'maybe_missing')
if type(val) == "table" and val.err then
  -- handle error
end
```

→ `pcall` cho graceful error handling. `call` cho fast-fail (let Redis abort).

## Return value cho Redis

```lua
return "OK"                        -- bulk string
return 42                          -- integer
return {1, 2, 3}                   -- array
return redis.error_reply("oops")   -- error
return redis.status_reply("OK")    -- simple string

-- nil → (nil)
return nil
```

## Tóm tắt syntax thường dùng

```lua
-- Variable
local x = 10

-- String concat
"hello " .. "world"

-- Length
#myString    #myTable

-- If
if x > 0 then ... elseif ... else ... end

-- For
for i = 1, 10 do ... end
for k, v in pairs(t) do ... end

-- Function
local function f(a, b) return a + b end

-- Table
{1, 2, 3}    {name = "x", age = 1}

-- Type convert
tonumber("5")    tostring(5)

-- Redis call
redis.call('GET', KEYS[1])
```

## Một script đầy đủ ví dụ

```lua
-- "Decrement stock if > 0, return new value or -1 if can't"
local key = KEYS[1]
local stock = tonumber(redis.call('HGET', key, 'stock'))

if stock == nil or stock <= 0 then
  return -1
end

return redis.call('HINCRBY', key, 'stock', -1)
```

Gọi:
```text
EVAL "..." 1 items#xyz
```

→ Atomic decrement-if-positive. Bài 5 sẽ áp pattern này vào app RB.

## Tóm tắt bài 2

- Syntax Lua: `local`, `if/then/end`, `for ... do ... end`, function.
- Table = array + dict combined.
- **Index 1-based**, không 0!
- `nil` và `false` là falsy duy nhất.
- `tonumber()` / `tostring()` cho convert.
- `redis.call()` cho lệnh Redis bên trong.

**Bài kế tiếp** → [Bài 3: Lua tables — array và dict pattern](03-lua-tables.md)
