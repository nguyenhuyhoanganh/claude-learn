# Bài 1: Lua scripting là gì — extend Redis với logic server-side

Phase 15 đã thấy WATCH/MULTI giải race nhưng có retry overhead + cú pháp dài. **Lua script** chạy logic **server-side** trong Redis — atomic tự nhiên, không cần retry. Phase này dạy Lua scripting cho atomic ops phức tạp.

## Vấn đề Lua giải

### Vấn đề 1: over-fetching

App muốn "lấy member của sorted set có score chẵn":

```text
ZADD scores 1 a 2 b 3 c 4 d 5 e
```

Không có Redis command native cho "score chẵn". Phải:
1. `ZRANGE scores 0 -1 WITHSCORES` — lấy tất cả về client (over-fetch).
2. Filter ở client: keep even scores.

→ Nếu sorted set 1M element, đẩy 1M về client → MB data + JSON parse + filter. Wasteful.

### Vấn đề 2: race condition phức tạp

```ts
// "Decrement stock nếu > 0"
const stock = parseInt(await client.hGet(item, 'stock'));
if (stock > 0) {
  await client.hIncrBy(item, 'stock', -1);
}
```

Race: 2 client thấy stock=1, cả 2 decrement → stock = -1.

WATCH/MULTI giải được, nhưng retry overhead. Lua đơn giản hơn:

```lua
local s = tonumber(redis.call('HGET', KEYS[1], 'stock'))
if s == nil or s <= 0 then return -1 end
return redis.call('HINCRBY', KEYS[1], 'stock', -1)
```

**Atomic + abort + 1 RTT**. Không retry.

## Lua là gì?

> **Lua** = scripting language nhúng (embedded), C-friendly, syntax đơn giản. Redis nhúng Lua runtime để chạy script server-side.

Đặc điểm Lua:
- Dynamic typed, garbage collected.
- Cú pháp gần Python/Ruby.
- Cực gọn: chỉ vài chục KB cho runtime.
- Nhanh: gần native C cho hầu hết operations.

Lua được chọn vì:
1. Embedded mature từ 1993.
2. Nhỏ + nhanh.
3. Không có timer/I/O nguy hiểm khi nhúng.
4. Game devs đã quen (WoW, Roblox dùng Lua).

## Tính chất "atomic" của Lua trong Redis

> **Khi Redis chạy Lua script, không lệnh nào khác từ client khác chạy giữa chừng**.

Lua script trên Redis = một "long-running command" — đảm bảo atomic. Tương đương MULTI/EXEC nhưng với logic phức tạp.

Hệ quả:
- ✓ Race condition biến mất.
- ✗ **Lua script chậm block toàn server**. Mọi client khác chờ.

→ **Quy tắc**: Lua script phải **nhanh** (< 1ms). Tránh loop dài, tránh đọc/ghi quá nhiều keys.

## Cú pháp gọi từ Redis

3 lệnh chính:

```text
EVAL <script_source> <numkeys> [key1 ...] [arg1 ...]
EVALSHA <sha1_hash> <numkeys> [key1 ...] [arg1 ...]
SCRIPT LOAD <script_source>
```

### EVAL — chạy script raw

```text
EVAL "return 'hello'" 0
"hello"

EVAL "return redis.call('GET', KEYS[1])" 1 mykey
"value"
```

Pattern: `EVAL <script> <numkeys> KEYS... ARGS...`.

### SCRIPT LOAD + EVALSHA — cache script

```text
SCRIPT LOAD "return redis.call('GET', KEYS[1])"
"f72adc..."        ← SHA1 hash của script

EVALSHA f72adc... 1 mykey
"value"
```

SCRIPT LOAD cache script trên server, trả SHA1. EVALSHA chạy script đã cache.

→ **Tiết kiệm bandwidth**: không cần gửi script source mỗi lần. Send SHA1 + KEYS + ARGS.

Subsequent invocations: EVALSHA luôn nhanh hơn EVAL.

## Phân biệt KEYS và ARGS

Redis Lua API có 2 array:
- **KEYS[1..]**: keys bạn sẽ operate trên (cluster-aware — phải khai báo).
- **ARGV[1..]**: arguments khác (value, count, ...).

Tại sao tách? Vì:
1. **Cluster routing**: Redis cần biết keys nào để route đến đúng node.
2. **Security**: best practice tách "what" (keys) và "with what" (args).

```text
EVAL "return redis.call('SET', KEYS[1], ARGV[1])" 1 mykey myvalue
```

→ 1 key (`mykey`), 1 arg (`myvalue`).

Coding convention: KEYS = read/write target. ARGV = data đi kèm.

## Lệnh Redis từ Lua

Trong script:

```lua
redis.call('GET', 'mykey')          -- gọi lệnh Redis, throw error nếu fail
redis.pcall('GET', 'mykey')         -- pcall = protected call, return error object
```

Cùng tham số như Redis command. Result là Lua value (string/number/table).

## Return value

Lua return → Redis reply:

| Lua value | Redis reply |
|---|---|
| `nil` | `(nil)` bulk string |
| `true` | `(integer) 1` |
| `false` | `(nil)` |
| Number (integer) | `(integer) N` |
| Number (float) | `(integer)` (truncated!) |
| String | bulk string |
| Table (array) | array reply |
| Table với `err` field | error |

**Bẫy**: Lua float → Redis integer. Mất phần thập phân. Workaround: return string `"3.14"`.

## Ví dụ first script

```lua
-- Script: increment counter, return new value
local current = tonumber(redis.call('GET', KEYS[1])) or 0
local new = current + tonumber(ARGV[1])
redis.call('SET', KEYS[1], tostring(new))
return new
```

Gọi từ CLI:
```text
EVAL "local current = tonumber(redis.call('GET', KEYS[1])) or 0; local new = current + tonumber(ARGV[1]); redis.call('SET', KEYS[1], tostring(new)); return new" 1 mycounter 5
(integer) 5

EVAL "..." 1 mycounter 3
(integer) 8
```

→ Tương đương `INCRBY mycounter 3`. Đây là toy example — INCR đã làm cùng. Lua giá trị khi có logic phức tạp hơn.

## Khi nào Lua thực sự lợi?

1. **Atomic check-and-act**: vd stock decrement chỉ nếu > 0.
2. **Compound query**: vd "lấy hash, validate, ghi log".
3. **Custom aggregation**: vd "tổng score của member match pattern".
4. **Avoid round-trip**: thay 5 lệnh = 5 RTT bằng 1 Lua = 1 RTT.

## Khi nào KHÔNG dùng?

1. **Logic siêu phức tạp**: Lua chạy block server. > 10ms = nguy hiểm.
2. **Có lệnh native tương đương**: dùng native nhanh hơn.
3. **Cần debugging**: Lua hơi khó debug. Code đơn giản dễ maintain hơn.
4. **Junior team**: Lua syntax khác JS/Python, learning curve.

## Lua không phải Lua thuần (Redis Lua)

Redis Lua = subset của Lua 5.1 + thư viện Redis-specific. Hạn chế:
- ✗ Không có file I/O.
- ✗ Không có network.
- ✗ Không có random thực (`math.random` deterministic theo seed).
- ✗ Không có thời gian thực (cố định trong script — để replication ổn).

→ Đảm bảo script **deterministic**: cùng input + cùng state → cùng output. Quan trọng cho replication.

## Tóm tắt bài 1

- Lua = embedded scripting cho Redis, atomic logic server-side.
- Giải 2 vấn đề: over-fetching và race condition phức tạp.
- EVAL/EVALSHA/SCRIPT LOAD — 3 lệnh chính.
- KEYS vs ARGV: tách keys và non-key arguments.
- `redis.call(...)` để invoke command từ Lua.
- Script phải nhanh + deterministic.

**Bài kế tiếp** → [Bài 2: Lua basics — syntax cơ bản cho dev Redis](02-lua-basics.md)
