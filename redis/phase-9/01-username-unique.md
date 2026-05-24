# Bài 1: Implement username uniqueness trong app RB

Phase trước đã chọn data type cho từng resource. Phase này code thực: implement username uniqueness, like system với count, intersection profile page. Đây là **lần đầu** ta gộp nhiều lệnh Redis lại thành business feature hoàn chỉnh.

## Yêu cầu

Khi user đăng ký:
1. Check username đã có ai dùng chưa.
2. Nếu chưa: tạo user + thêm username vào set "đã dùng".
3. Nếu có: throw error.

## Flow

```text
POST /signup {username: "alice", password: "..."}
      ↓
1. SISMEMBER usernames:unique "alice"
   ↓ 1 = đã có → throw "Username taken"
   ↓ 0 = chưa có
2. HSET users#<newId> username "alice" password "..."
3. SADD usernames:unique "alice"
   ↓
Done — return userId
```

## Bước 1: Thêm key generator

```ts
// src/services/keys.ts
export const usernamesUniqueKey = () => `usernames:unique`;
```

**Vì sao tên dài `usernames:unique`?**

Sau này ta sẽ thêm một set khác cũng tên `usernames` — nhưng là **sorted set** dùng cho autocomplete search (phase-11). Để tránh đụng độ, đặt rõ ràng từ đầu.

→ Lesson: **think ahead** khi đặt namespace. Đổi tên về sau yêu cầu migrate data.

## Bước 2: Sửa `createUser` để check uniqueness

```ts
// src/services/queries/users.ts
import { client } from '../redis/client';
import { userKey, usernamesUniqueKey } from '../keys';
import { genId } from '$lib/utils/id';

export async function createUser(attrs: CreateUserAttrs): Promise<string> {
  // 1. Check uniqueness
  const exists = await client.sIsMember(usernamesUniqueKey(), attrs.username);
  if (exists) {
    throw new Error('Username is taken');
  }
  
  // 2. Tạo user
  const id = genId();
  await client.hSet(userKey(id), serialize(attrs));
  
  // 3. Đăng ký username
  await client.sAdd(usernamesUniqueKey(), attrs.username);
  
  return id;
}
```

3 lệnh Redis tuần tự:
1. SISMEMBER — O(1)
2. HSET — O(1)
3. SADD — O(1)

Tổng: 3 RTT ~1.5ms. Acceptable cho signup (mỗi user chỉ làm 1 lần).

## Bẫy: race condition

Hai client cùng đăng ký username "alice" đồng thời:

```text
Time | Client A                    Client B
-----|-----------------------------|-----------------------------
T1   | SISMEMBER → 0 (chưa có)     |
T2   |                             | SISMEMBER → 0 (chưa có)
T3   | HSET users#A1 + SADD        |
T4   |                             | HSET users#A2 + SADD
```

→ Cả 2 đều "tạo thành công", nhưng có 2 user với cùng username trong set.

**Tần suất**: rất hiếm (xác suất ~0.0001% với 100 RPS signup). Nhưng tồn tại.

**Mitigation** (sẽ học sâu phase-17):
1. **MULTI/EXEC + WATCH** — optimistic locking.
2. **Distributed lock** — `SET lock:signup:alice NX EX 5`.
3. **Lua script** — atomic check-and-add.

Hiện tại chấp nhận race rất hiếm. Production cần Lua:

```lua
-- atomic: check + set + return
if redis.call('SISMEMBER', KEYS[1], ARGV[1]) == 1 then
  return 'TAKEN'
end
redis.call('SADD', KEYS[1], ARGV[1])
redis.call('HSET', KEYS[2], 'username', ARGV[1], 'password', ARGV[2])
return 'OK'
```

Gọi qua `client.eval(script, {keys: [usernamesUniqueKey(), userKey(id)], arguments: [username, password]})`.

## Lowercase convention

Quan trọng cho UX:

```ts
const usernameNormalized = attrs.username.toLowerCase().trim();

const exists = await client.sIsMember(usernamesUniqueKey(), usernameNormalized);
// ...
await client.sAdd(usernamesUniqueKey(), usernameNormalized);
```

→ "Alice" và "alice" không thể đăng ký cả 2. Hiển thị giữ nguyên case gốc:

```ts
await client.hSet(userKey(id), {
  username: attrs.username,           // giữ "Alice" để hiển thị
  usernameLower: usernameNormalized,  // "alice" cho check
  ...
});
```

Hoặc đơn giản: lưu tất cả lowercase, UI render lại cho đẹp.

## Test thực

```bash
npm run dev
```

1. Mở `/auth/signup`, đăng ký "alice" → thành công.
2. Refresh, đăng ký lại "alice" → "Username is taken".
3. Đăng ký "bob" → thành công.
4. Verify Redis:
   ```text
   > SMEMBERS usernames:unique
   1) "alice"
   2) "bob"
   > SISMEMBER usernames:unique "alice"
   1
   > SISMEMBER usernames:unique "charlie"
   0
   ```

## Câu hỏi: vì sao không lưu username vào hash user → check trong hash?

Một cách "có vẻ logic":

```text
HSET users#abc username alice
```

Nhưng làm sao tìm user theo username? Phải:

```text
KEYS users#*    ❌ chặn server
```

→ **Set là secondary index thủ công**. Set `usernames:unique` đóng vai trò **index lookup**:

| Có index | Không index |
|---|---|
| `SISMEMBER usernames:unique "alice"` — O(1) | `KEYS users#* + HGETALL` mỗi key — O(N) chặn |

Bài học rộng hơn: **Redis không tự index field**. Mọi truy vấn theo field phải có **secondary structure** mà bạn maintain.

## Mở rộng: map username → user_id

Hiện check uniqueness OK, nhưng **chưa làm được sign-in**: cần tìm user_id từ username.

```ts
// keys.ts
export const usernameToIdKey = () => `usernames:to-id`;
```

Trong `createUser`:

```ts
await Promise.all([
  client.hSet(userKey(id), serialize(attrs)),
  client.sAdd(usernamesUniqueKey(), username),
  client.hSet(usernameToIdKey(), username, id),    // hash: username → user_id
]);
```

Một **hash** dùng làm "index" — field là username, value là id. Tốt hơn 1 hash per user vì:
- 1 key cho cả index.
- HGET O(1).

Implement `getUserByUsername`:

```ts
export async function getUserByUsername(username: string): Promise<User | null> {
  const id = await client.hGet(usernameToIdKey(), username);
  if (!id) return null;
  return await getUserById(id);
}
```

Sign-in flow:
```ts
const user = await getUserByUsername(username);
if (!user) return { error: 'Not found' };
const match = await bcrypt.compare(password, user.password);
if (!match) return { error: 'Wrong password' };
// Create session...
```

## Tối ưu: gộp 2 set lại được không?

Có thể bỏ `usernames:unique` và chỉ dùng `usernames:to-id`:

```ts
// Check uniqueness = check field tồn tại
const exists = await client.hExists(usernameToIdKey(), username);
```

→ Tiết kiệm 1 set. Trade-off: nếu cần liệt **mọi username** (vd autocomplete prefix search), set có lệnh tốt hơn (SSCAN MATCH); hash phải HSCAN match field.

Khoá học giữ 2 cấu trúc cho rõ ràng (1 phụ trách uniqueness, 1 phụ trách lookup). Production có thể merge.

## Hệ quả thực tế

Sau phase này:
- **Sign up bị block** khi username trùng.
- **Sign in hoạt động** (qua `getUserByUsername`).
- App có thể bị **race condition** ở traffic rất cao — fix sau ở phase concurrency.

## Tóm tắt bài 1

- Username uniqueness = SADD vào set `usernames:unique`, check bằng SISMEMBER trước khi tạo.
- Race condition có thể xảy ra → cần Lua/MULTI cho production.
- Lowercase + trim before check để tránh "Alice" vs "alice".
- Set là **secondary index thủ công** — Redis không tự index.
- Thêm `usernames:to-id` hash để map username → user_id cho sign-in flow.

**Bài kế tiếp** → [Bài 2: Like system — bi-directional set](02-like-system.md)
