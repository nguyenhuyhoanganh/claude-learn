# Bài 3: HDEL, expiration cho hash & dọn dẹp

Lưu được là một chuyện. Quản lý lifecycle (xoá field, xoá hash, hết hạn) là chuyện khác — và là điểm Hash khác String đáng kể.

## HDEL — xoá một hoặc nhiều field

### Cú pháp

```text
HDEL key field [field ...]
```

### Ví dụ

```text
HGETALL company
1) "name"        2) "Concrete Co"
3) "age"         4) "1915"
5) "industry"    6) "Materials"
7) "revenue"     8) "5.3"

HDEL company age
(integer) 1            # 1 field bị xoá

HDEL company industry revenue nonexistent
(integer) 2            # 2 field bị xoá thật sự (nonexistent không tính)

HGETALL company
1) "name"
2) "Concrete Co"
```

### Return value

Số field thực sự bị xoá (không tính field bạn yêu cầu xoá mà nó không tồn tại).

```text
HDEL company nonexistent1 nonexistent2
(integer) 0            # không xoá field nào
```

### O(N) với N = số field bạn yêu cầu xoá

Rất nhanh. Không phụ thuộc kích thước hash.

### Hash trống → key biến mất

Khi xoá field cuối cùng, **key cũng bị xoá luôn**:

```text
HSET temp lonely "single field"
HDEL temp lonely
(integer) 1

EXISTS temp
(integer) 0            # key đã biến mất

TYPE temp
"none"
```

Hệ quả thực tế: bạn không thể có "hash với 0 field" tồn tại. Đây là quirk quan trọng cho lifecycle:
- Có thể `EXISTS key` để check "user có tồn tại?".
- Khi xoá field cuối, có thể bất ngờ mất luôn meta-info "user này từng có".

## DEL — xoá toàn bộ hash

`DEL` của String dùng được cho mọi kiểu — bao gồm Hash:

```text
DEL company
(integer) 1            # 1 key bị xoá

HGETALL company
(empty array)
```

So với `HDEL` xoá từng field, `DEL` xoá cả key trong một lệnh O(1) (logical), O(N) (free memory). Nếu hash to, dùng **`UNLINK`** để xoá non-blocking:

```text
UNLINK big_hash
(integer) 1            # gỡ key khỏi dictionary ngay, free memory ở background thread
```

## TTL trên Hash — toàn bộ key, không phải field

Mặc định, **TTL áp dụng cho cả Redis key**, không cho field cụ thể.

```text
HSET user#42 name "Alice" age 30
EXPIRE user#42 60           # toàn bộ hash hết hạn sau 60s

TTL user#42
(integer) 58

# Sau 60s:
HGET user#42 name
(nil)
EXISTS user#42
(integer) 0
```

Không phải `EXPIRE company name 60` để chỉ field `name` hết hạn — `EXPIRE` chỉ làm việc với **toàn bộ key**.

### Use case: session với TTL

```ts
async function createSession(token: string, userId: string) {
  await client.hSet(sessionKey(token), {
    userId,
    csrf: generateCSRF(),
    createdAt: new Date().toISOString(),
  });
  await client.expire(sessionKey(token), 86400);   // 24h
}
```

Pattern phổ biến trong app: mỗi session là một hash, TTL = 24h.

### Refresh TTL khi user hoạt động — sliding session

```ts
async function refreshSession(token: string) {
  const exists = await client.exists(sessionKey(token));
  if (exists) {
    await client.expire(sessionKey(token), 86400);  // gia hạn 24h
  }
}
```

Hoặc atomic với `EXPIRE ... XX` (chỉ gia hạn nếu key tồn tại):

```text
EXPIRE sessions#abc-123 86400 XX
```

## HEXPIRE — TTL trên FIELD (Redis ≥ 7.4)

Từ Redis 7.4 (cuối 2024), có thể đặt TTL cho **field riêng** trong hash:

```text
HSET user#42 name "Alice" otp "ABC123"

HEXPIRE user#42 60 FIELDS 1 otp
1) (integer) 1         # set thành công

HTTL user#42 FIELDS 1 otp
1) (integer) 58

# Sau 60s:
HGET user#42 otp        # (nil) - chỉ field này expire
HGET user#42 name       # "Alice" - vẫn còn
```

### Các lệnh HEXPIRE family

| Lệnh | Đơn vị | Ý nghĩa |
|---|---|---|
| `HEXPIRE key seconds FIELDS N field [field ...]` | giây | Hết hạn sau N giây |
| `HPEXPIRE key ms FIELDS N field ...` | ms | (ms) |
| `HEXPIREAT key unix-secs FIELDS N field ...` | unix-secs | Tại thời điểm |
| `HPEXPIREAT key unix-ms FIELDS N field ...` | unix-ms | (ms) |
| `HPERSIST key FIELDS N field ...` | — | Bỏ TTL |
| `HTTL key FIELDS N field ...` | — | Còn bao nhiêu giây |
| `HPTTL key FIELDS N field ...` | — | (ms) |
| `HEXPIRETIME key FIELDS N field ...` | — | Trả về unix-secs hết hạn |

### Use case: OTP, temporary fields

Trước Redis 7.4, OTP thường lưu key riêng `otp:user:42` với TTL. Giờ có thể nhúng vào hash user:

```ts
await client.hSet(userKey(id), 'otp', code);
await client.hExpire(userKey(id), 60, 'otp');
```

Khi gọi `HGET user#42 otp` sau 60s, field tự nil mà các field khác vẫn còn.

> **Lưu ý**: HEXPIRE rất mới. Production phải đảm bảo Redis ≥ 7.4 (cuối 2024). Code cũ nhiều khi dùng workaround: lưu OTP ở key riêng với TTL, hoặc embed `otp_expires_at` field và filter ở client.

## Atomic update — không có race condition

Như đã nhắc bài 1: update field của hash là **atomic**.

```text
# 2 client cùng thời điểm:
Client A: HSET user#42 status "online"
Client B: HSET user#42 status "offline"
```

Một trong hai sẽ thắng tuỳ thứ tự arrived, nhưng KHÔNG có "đọc-modify-ghi tách" gây mất update. Mỗi `HSET` là one-shot.

**Hệ quả**: update nhiều field atomic:

```text
HSET user#42 name "Alice (renamed)" updatedAt "2026-01-15T10:00:00Z"
```

Cả 2 field set cùng một block atomic — không thể một client khác thấy `name` mới mà `updatedAt` cũ.

## So sánh atomic của hash vs nhiều String key

Đây là một lý do mạnh để chọn Hash thay vì nhiều String key cho cùng object:

❌ **Nhiều String key**:
```text
SET user:42:name "Alice (renamed)"
SET user:42:updatedAt "..."
```
Giữa 2 lệnh, một client khác có thể đọc state nửa vời (name mới, updatedAt cũ). Phải dùng `MULTI/EXEC` để atomic.

✅ **Một Hash**:
```text
HSET user#42 name "Alice (renamed)" updatedAt "..."
```
Atomic. Client khác hoặc thấy cả old, hoặc cả new.

## Pattern: lưu meta-data cho cache

Hash dùng tốt cho **cache với metadata**:

```ts
async function setCachedItem(key: string, data: string, ttl: number) {
  await client.hSet(`cache#${key}`, {
    data,
    cachedAt: String(Date.now()),
    expiresAt: String(Date.now() + ttl * 1000),
    version: 'v2',
  });
  await client.expire(`cache#${key}`, ttl);
}

async function getCachedItem(key: string) {
  const obj = await client.hGetAll(`cache#${key}`);
  if (!obj.data) return null;
  return {
    data: obj.data,
    cachedAt: new Date(parseInt(obj.cachedAt)),
    version: obj.version,
  };
}
```

So với "chỉ lưu data" trong String, ta có thêm meta để debug cache, đo độ "ngon" của cache, áp dụng versioning.

## Tóm tắt bài 3

- `HDEL key field [field ...]` xoá field, trả số field thực sự bị xoá.
- Khi xoá field cuối → **cả key biến mất**. Quirk quan trọng cho EXISTS check.
- `DEL`/`UNLINK` xoá toàn bộ hash key.
- **Mặc định TTL áp lên key, không field** — toàn bộ hash hết hạn cùng lúc.
- **HEXPIRE** (Redis ≥ 7.4) cho phép TTL per-field.
- Mỗi `HSET` là atomic (có thể set nhiều field cùng atomic block).
- Hash tốt hơn nhiều String key khi cần atomic update group fields.

**Bài kế tiếp** → [Bài 4: HINCRBY, HINCRBYFLOAT — số trong hash + atomic counter](04-hincrby-counter-trong-hash.md)
