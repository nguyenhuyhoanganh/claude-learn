# Bài 4: HINCRBY, HINCRBYFLOAT — counter trong hash

`HINCRBY` cho hash giống `INCRBY` cho String — tăng/giảm số ở 1 field, **atomic**. Đây là pattern cực phổ biến: "đếm view per user", "score per game", "balance per account" — gom mọi counter của một entity vào một hash.

## HINCRBY — tăng integer

### Cú pháp

```text
HINCRBY key field delta
```

`delta` là integer **có thể âm** để giảm.

### Ví dụ

```text
HSET company age 1915
HINCRBY company age 10
(integer) 1925           # value mới

HGET company age
"1925"

HINCRBY company age -15
(integer) 1910

# Field không tồn tại — tự tạo với value ban đầu = 0
HINCRBY company revenue 1000
(integer) 1000

# Hash không tồn tại — tự tạo cả hash
DEL counters
HINCRBY counters visits 1
(integer) 1
EXISTS counters
(integer) 1
```

### Tính chất

| | |
|---|---|
| Atomic | ✓ — single-threaded event loop đảm bảo |
| Auto-create hash | ✓ — nếu key không có |
| Auto-create field | ✓ — coi value ban đầu là 0 |
| Tự `parseInt` field hiện có | ✓ — fail nếu không parse được |
| Phạm vi | signed 64-bit (~ ±9.2 × 10^18) |
| Complexity | O(1) |

### Lỗi khi field không phải số

```text
HSET company name "Alice"
HINCRBY company name 1
(error) ERR hash value is not an integer
```

Khác String `INCR` cho phép parse số float (kiểu `"3.5"`) → vẫn lỗi nếu không parse được integer. `HINCRBY` cũng vậy: chỉ integer.

## HINCRBYFLOAT — tăng floating-point

```text
HINCRBYFLOAT company revenue 5.3
"5.3"             # → field "revenue" tăng từ 0 lên 5.3

HINCRBYFLOAT company revenue 1.001
"6.301"

# Giảm: dùng số âm
HINCRBYFLOAT company revenue -0.3
"6.001"
```

### Lưu ý precision

Như đã đề cập ở phase-2 với INCRBYFLOAT String: **không dùng float cho tiền tệ**. Tích luỹ sai số sau hàng triệu thao tác.

```ts
// SAI cho tiền
await client.hIncrByFloat(userKey(id), 'balance', 0.10);

// ĐÚNG: lưu cent (integer)
await client.hIncrBy(userKey(id), 'balance_cents', 10);
```

`HINCRBYFLOAT` phù hợp cho:
- Tỉ lệ (rating, percentage).
- Khoa học (kết quả đo).
- Counter không yêu cầu chính xác tuyệt đối.

## Use case: Atomic counters trên entity

Đây là điểm Hash phát huy mạnh.

### Ví dụ 1: Counter per user

```ts
async function incrementUserActivity(userId: string, activityType: string) {
  await client.hIncrBy(
    `users#${userId}:counters`,
    activityType,
    1
  );
}

await incrementUserActivity('42', 'page_views');
await incrementUserActivity('42', 'page_views');
await incrementUserActivity('42', 'logins');
await incrementUserActivity('42', 'logins');
await incrementUserActivity('42', 'logins');

// HGETALL users#42:counters
// → { page_views: '2', logins: '3' }
```

Thay vì 2 String key `user:42:page_views`, `user:42:logins`, ta gộp vào 1 hash → tiết kiệm memory, atomic per field.

### Ví dụ 2: Game stats

```ts
async function recordGame(userId: string, won: boolean, points: number) {
  const key = `users#${userId}:stats`;
  await client.hIncrBy(key, won ? 'wins' : 'losses', 1);
  await client.hIncrBy(key, 'totalPoints', points);
  await client.hIncrBy(key, 'gamesPlayed', 1);
}
```

3 lệnh tách, mỗi cái atomic. Nếu cần **cả 3 atomic chung** (vd để đảm bảo gamesPlayed = wins + losses), dùng `MULTI/EXEC` hoặc Lua script.

### Ví dụ 3: Inventory atomic decrement với check

`HINCRBY` luôn thành công nếu value parse được. Để kiểm tra "chỉ giảm nếu > 0", phải Lua:

```ts
const DECREMENT_IF_POSITIVE = `
  local current = tonumber(redis.call('HGET', KEYS[1], ARGV[1]))
  if current == nil or current <= 0 then
    return -1
  end
  return redis.call('HINCRBY', KEYS[1], ARGV[1], -1)
`;

async function reserveStock(itemId: string): Promise<boolean> {
  const result = await client.eval(
    DECREMENT_IF_POSITIVE,
    { keys: [`items#${itemId}`], arguments: ['stock'] }
  );
  return result !== -1;
}
```

Sẽ học Lua chi tiết ở phase-16 (= S17 transcript).

## Counter pattern với expiration

Counter theo cửa sổ thời gian (rate limit, hourly stats):

```ts
async function recordHourlyRequest(userId: string) {
  const hourKey = new Date().toISOString().slice(0, 13);  // "2026-01-15T14"
  const key = `stats:${userId}:${hourKey}`;
  await client.hIncrBy(key, 'requests', 1);
  await client.expire(key, 86400);   // giữ 24h rồi xoá
}

// Đọc stat:
const stats = await client.hGet(`stats:42:2026-01-15T14`, 'requests');
```

> Có pattern hay hơn dùng Sorted Set với time-window — sẽ học sau.

## Khi nào KHÔNG dùng `HINCRBY`?

- **Tiền tệ chính xác**: dùng integer cent + `HINCRBY` thông thường, hoặc DB chính.
- **Counter cao tần trên 1 field duy nhất**: Hash field counter có overhead nhẹ hơn String INCR nhưng vẫn vào single event loop. Nếu 1 counter quá nóng (vd 1M+ ops/sec) → cần shard counter theo nhiều key.
- **Cần xem snapshot atomic của nhiều field**: `HGETALL` không atomic với pending `HINCRBY`. Phải `MULTI/EXEC`.

## So với INCRBY trên nhiều String

| | Hash + HINCRBY | Nhiều String + INCRBY |
|---|---|---|
| Atomic per counter | ✓ | ✓ |
| Atomic multi-counter (vd reset cả 3) | Cần MULTI/EXEC | Cần MULTI/EXEC |
| Memory (10 counter/user) | Nhỏ hơn ~50% với listpack | Lớn hơn |
| Pattern matching (KEYS users:*:visits) | Không thể (1 hash, 1 key) | Có thể (rủi ro KEYS) |
| TTL group | 1 EXPIRE cho toàn bộ user counters | N lệnh EXPIRE |
| Hot key concentration | Nếu 1 hash quá nóng → bottleneck | Có thể spread |

Quy tắc: gom counter cùng entity vào hash; tách counter dùng cho group-stat ra String/Sorted Set.

## Pattern thực: dashboard hành vi user

```ts
const KEY = (uid: string) => `users#${uid}:counters`;

export async function trackEvent(uid: string, event: string) {
  await client.hIncrBy(KEY(uid), event, 1);
  await client.hSet(KEY(uid), 'lastSeen', new Date().toISOString());
}

export async function getDashboard(uid: string) {
  const raw = await client.hGetAll(KEY(uid));
  return {
    pageViews:    parseInt(raw.page_view ?? '0', 10),
    auctionsCreated: parseInt(raw.auction_create ?? '0', 10),
    bidsPlaced:   parseInt(raw.bid_place ?? '0', 10),
    bidsWon:      parseInt(raw.bid_win ?? '0', 10),
    lastSeen:     raw.lastSeen ? new Date(raw.lastSeen) : null,
  };
}
```

→ Tất cả counter của user 42 nằm trong 1 hash, atomic per field, dễ truy vấn.

## Tóm tắt phase-4

Đã học:
- **Hash là gì** và vì sao tốt cho object/record (Bài 1).
- **HSET/HGET/HGETALL** với cẩn trọng về format trả (Bài 2).
- **HDEL, TTL key, HEXPIRE per-field** (Bài 3).
- **HINCRBY/HINCRBYFLOAT** atomic counter pattern (Bài 4).

Hash là kiểu dữ liệu thứ 2 quan trọng nhất sau String. Bạn sẽ dùng nó cho:
- Lưu user, product, order, session.
- Counter group cho mỗi entity.
- Cache với metadata.

**Phase tiếp theo** (phase-5 = Section 06 trong transcript) sẽ học **"Redis Gotchas"** — các bẫy quirky của Hash và lệnh khác mà nếu không biết sẽ trả giá bằng debug nhiều giờ.

→ [Phase-5 — Bài 1: HSET/HGETALL có những quirk gì?](../phase-5/01-hset-quirks.md)
