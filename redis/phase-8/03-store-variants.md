# Bài 3: STORE variants và cache kết quả phép toán set

`SUNION`/`SINTER`/`SDIFF` chạy mỗi lần được gọi — tính toán O(N), trả mảng. Với set lớn (hàng triệu phần tử), gọi nhiều lần là phí. Redis cung cấp **STORE variants** để **lưu kết quả vào key mới**, rồi cache theo TTL.

Bài này về 3 lệnh: `SUNIONSTORE`, `SINTERSTORE`, `SDIFFSTORE` — và pattern "materialized view" trong Redis.

## Cú pháp

```text
SUNIONSTORE destination key [key ...]
SINTERSTORE destination key [key ...]
SDIFFSTORE  destination key [key ...]
```

Tham số đầu = key để **lưu kết quả vào**. Phần còn lại như SUNION/SINTER/SDIFF.

## Ví dụ

```text
SADD colors:1 red blue orange
SADD colors:2 blue green purple
SADD colors:3 blue red purple

# Lưu intersection vào key mới
SINTERSTORE colors:common colors:1 colors:2 colors:3
(integer) 1            # 1 phần tử trong destination

SMEMBERS colors:common
1) "blue"
```

Sau lệnh:
- Key `colors:common` là một **set mới** chứa kết quả phép giao.
- Lệnh trả về **số phần tử** trong destination.

Nếu destination đã tồn tại trước (kiểu khác hoặc cùng kiểu), **bị ghi đè**.

## Vì sao cần STORE?

### Lý do 1: Tránh tính lại

`SINTER setA setB` với 2 set 1 triệu phần tử mỗi cái: ~50ms. Nếu query này gọi 100 lần/giây → 5s CPU mỗi giây — không khả thi.

Giải pháp:
```text
SINTERSTORE cache:common setA setB      # tính 1 lần, lưu kết quả
SMEMBERS cache:common                    # gọi nhiều lần, ~0 cost
```

Refresh `cache:common` định kỳ (cron, hoặc khi setA/setB đổi).

### Lý do 2: Kết quả là set thật — dùng tiếp được

Kết quả `SUNIONSTORE` là **set Redis** đầy đủ tính năng. Có thể:
- `SCARD` đếm.
- `SISMEMBER` check.
- `SRANDMEMBER` lấy random.
- `SDIFF` so với set khác.

Vd: tính "DAU 7 ngày qua" (WAU) một lần, rồi xài tiếp:

```text
SUNIONSTORE wau:2026-W03 dau:2026-01-13 dau:2026-01-14 ... dau:2026-01-19
EXPIRE wau:2026-W03 86400      # cache 1 ngày

SCARD wau:2026-W03                          # số WAU
SDIFF wau:2026-W03 wau:2026-W02             # user mới vào tuần này
SINTER wau:2026-W03 paying_users            # WAU đã trả tiền
```

### Lý do 3: Multi-step computation

Composer phép toán phức tạp:

```text
# Bước 1: union DAU 30 ngày = MAU
SUNIONSTORE mau:2026-01 dau:2026-01-01 dau:2026-01-02 ... dau:2026-01-30
EXPIRE mau:2026-01 86400

# Bước 2: tìm MAU trả tiền
SINTERSTORE mau:paying:2026-01 mau:2026-01 paying_users

# Bước 3: trừ dùng test = user thực
SDIFFSTORE real_mau:2026-01 mau:paying:2026-01 test_accounts

SCARD real_mau:2026-01
```

Mỗi STORE = 1 lệnh, kết quả tái sử dụng. Code app gọn.

## Pattern: Materialized view với TTL

> **Materialized view** = view tính sẵn, lưu trữ, dùng lại — khái niệm từ DB.

Áp dụng Redis:

```ts
async function getOrCreateCommonLikes(userA: string, userB: string) {
  const cacheKey = `common_likes:${userA}:${userB}`;
  
  // Check cache trước
  const cached = await client.smembers(cacheKey);
  if (cached.length > 0) return cached;
  
  // Tính + lưu + TTL
  await client.sInterStore(
    cacheKey,
    `likes:user#${userA}`,
    `likes:user#${userB}`
  );
  await client.expire(cacheKey, 300);    // 5 phút
  
  return await client.smembers(cacheKey);
}
```

Trade-off:
- ✓ Giảm tải khi query lặp.
- ✗ Dữ liệu có thể stale 5 phút (user mới like không thấy ngay).
- ✗ Tốn memory cho cache.

Phù hợp khi data đổi chậm. Không phù hợp khi cần real-time.

## Pattern: Refresh background

```ts
// Worker chạy mỗi giờ
async function refreshWAU() {
  const days = lastNDays(7);   // ['2026-01-13', ..., '2026-01-19']
  const dauKeys = days.map((d) => `dau:${d}`);
  const wauKey = `wau:${currentWeek()}`;
  
  await client.sUnionStore(wauKey, ...dauKeys);
  await client.expire(wauKey, 7 * 86400);   // 7 ngày
}
```

App đọc `wau:<week>` luôn instant (không cần tính). Background worker chịu chi phí tính toán.

## Cảnh báo: STORE có thể chặn event loop

Cùng O(N) như SUNION/SINTER/SDIFF nhưng **cộng thêm thời gian ghi destination**.

Với set 100M phần tử output, STORE có thể chặn 1-5 giây. Đây là **lệnh chậm điển hình** Redis hay cảnh báo.

Mitigation:
- Tránh STORE quá lớn → chia nhỏ thành nhiều set bucket.
- Chạy STORE ở **node replica đặc biệt** (chỉ dành cho analytics).
- Dùng Redis 7+ có `lazyfree-lazy-server-del` để xoá destination cũ non-blocking.

## Quirk: destination bị xoá nếu kết quả rỗng

```text
SADD a "x"
SADD b "y"
SINTERSTORE result a b      # kết quả là rỗng
(integer) 0

EXISTS result
(integer) 0                  # key bị xoá luôn
```

Set rỗng không thể tồn tại trong Redis (như đã học bài 3 phase-4 với Hash). STORE kết quả rỗng = không tạo key.

→ Code phải handle: kiểm tra `EXISTS` hoặc count trả về 0.

## STORE vs UNIONSTORE/INTERSTORE — đừng nhầm với LSET/HSET

Lưu ý naming khá rối:

```text
SUNION  → trả về (read-only)
SUNIONSTORE → tính + lưu (read+write)
SINTER  → trả về (read-only)
SINTERSTORE → tính + lưu (read+write)
SDIFF  → trả về (read-only)
SDIFFSTORE → tính + lưu (read+write)
```

→ **Có chữ STORE → có ghi vào destination**.

## So với Lua script tự build

Bạn có thể tự code SUNIONSTORE bằng Lua:

```lua
local merged = {}
for _, key in ipairs(KEYS) do
  for _, m in ipairs(redis.call('SMEMBERS', key)) do
    merged[m] = true
  end
end
redis.call('DEL', ARGV[1])
for m in pairs(merged) do
  redis.call('SADD', ARGV[1], m)
end
```

KHÔNG nên — chậm hơn nhiều (mỗi SADD lua overhead, không tối ưu C-level như built-in). **Luôn dùng built-in STORE** khi có.

## Hiệu năng đo thực

Trên Redis 7, 2 set × 1M phần tử mỗi cái:

| Lệnh | Thời gian |
|---|---|
| `SUNION` (return) | ~80ms (gồm cả serialize reply) |
| `SUNIONSTORE` | ~50ms (không serialize reply) |
| `SINTER` (return) | ~30ms (set giao chỉ ~10k phần tử) |
| `SINTERSTORE` | ~20ms |

STORE thường **nhanh hơn** return version vì không phải serialize reply array.

## STORE bảo lưu mọi tính chất set

```text
SUNIONSTORE result a b
TYPE result          # "set"
SCARD result         # số phần tử
SADD result newItem  # ghi tiếp được
```

Destination là set chuẩn — không có gì đặc biệt sau lệnh STORE.

## Tóm tắt bài 3

- **SUNIONSTORE / SINTERSTORE / SDIFFSTORE**: tính + lưu kết quả vào key mới.
- Pattern: materialized view với TTL cho query lặp lại trên set lớn.
- STORE rỗng → key bị xoá; check trước khi dùng.
- Nhanh hơn version return (không serialize reply lớn).
- Background worker pattern: tính sẵn, app đọc instant.

**Bài kế tiếp** → [Bài 4: SISMEMBER, SSCAN — operations 1 set, an toàn](04-sismember-sscan.md)
