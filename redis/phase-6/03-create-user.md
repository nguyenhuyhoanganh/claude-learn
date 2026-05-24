# Bài 3: Implement create user — HSET object syntax

Đã thiết kế xong. Giờ vào code feature đầu tiên dùng Hash: **tạo user**. Bài này đi qua trình tự: thêm key generator → import client → viết `createUser` → hiểu vì sao cách viết "có vẻ thừa" này lại là pattern đúng cho production.

## File ta sẽ làm việc

`src/services/queries/users.ts` — có 3 function rỗng:

```ts
export async function createUser(attrs: CreateUserAttrs): Promise<string> {
  // TODO
}

export async function getUserById(id: string): Promise<User | null> {
  // TODO
}

export async function getUserByUsername(username: string): Promise<User | null> {
  // TODO  ← sẽ làm sau, cần secondary index
}
```

## Bước 1 — Thêm key generator

Theo pattern [phase-3 bài 6](../phase-3/06-cache-key-generation.md), mọi key sinh từ `keys.ts`:

```ts
// src/services/keys.ts
export const userKey = (userId: string) => `users#${userId}`;
```

Đơn giản: hàm pure, lấy id, trả tên key.

**Vì sao bắt buộc thêm helper, không inline?**
- Tránh typo (đã giải thích phase-3 bài 6).
- File `keys.ts` thành **bản đồ data layer** — đọc nó biết app dùng key gì.
- Đổi convention (vd `users#<id>` → `user:<id>`) chỉ sửa 1 chỗ.

## Bước 2 — Import dependencies

```ts
// src/services/queries/users.ts
import { client } from '../redis/client';
import { userKey } from '../keys';
import { genId } from '$lib/utils/id';   // helper sinh random UUID-like id
```

`genId()` là helper đã có sẵn trong project (sinh chuỗi ngẫu nhiên ~22 ký tự). Redis **không tự sinh id** — bạn phải tự lo.

> Nhiều người mới hỏi: "tại sao Redis không có AUTO_INCREMENT?". Trả lời: Redis thiết kế đơn giản và phân tán. Sequence atomic toàn cluster là khó (bottleneck single-node). Pattern phổ biến: client sinh UUID (collision xác suất gần 0) hoặc `INCR seq:user` (tăng dần, chấp nhận gap).

## Bước 3 — Code createUser cơ bản

```ts
export async function createUser(attrs: CreateUserAttrs): Promise<string> {
  const id = genId();
  
  await client.hSet(userKey(id), {
    username: attrs.username,
    password: attrs.password,
  });
  
  return id;
}
```

Phân tích:
- `id = genId()` — sinh id trước, dùng để build key.
- `userKey(id)` → ví dụ `"users#a3f9c2d1..."`.
- `client.hSet(key, object)` — node-redis nhận **object** thay vì alternating list. Lib tự convert sang `HSET key f1 v1 f2 v2 ...` ở dưới.
- Return `id` để caller dùng tiếp (vd tạo session).

> Lưu ý cú pháp khác CLI: trên `redis-cli` ta gõ `HSET key f1 v1 f2 v2`, nhưng `node-redis` cho phép pass object — **không phải feature của Redis, là tiện ích của lib**. Doc chính thức Redis ghi alternating-form, lib mỗi ngôn ngữ tự thêm "object form" cho thuận tay.

## Pattern object → alternating form (lib internal)

Khi bạn pass:

```ts
client.hSet('users#abc', {
  username: 'alice',
  password: '<hash>',
});
```

Lib làm bên dưới:

```text
HSET users#abc username alice password <hash>
```

→ Đi qua `Object.entries(obj)`, flatten thành mảng phẳng `[f1, v1, f2, v2]`, build RESP.

**Bẫy đã nhắc phase-5**: trong vòng convert này, mọi value bị gọi `String(v)`. `null`/`undefined` → error. `Date`/`Object` → format không như mong đợi.

→ Phần này dẫn vào pattern **serialize** ở bài kế.

## Bước 4 — Verify hoạt động

```bash
npm run dev
```

Mở `http://localhost:3000/auth/signup`. Nhập username + password, submit.

Verify trong Redis:

```text
> KEYS users#*
1) "users#a3f9c2d1..."

> HGETALL users#a3f9c2d1...
1) "username"
2) "alice"
3) "password"
4) "$2b$10$..."   (đã được salt+hash bởi middleware, không phải plain text)
```

## Password — đã được hash sẵn bởi framework

Khi user gõ "abc123" trong form, **không** lưu plain text. Framework đã có middleware:

```text
form input: "abc123"
    ↓
bcrypt hash với salt
    ↓
attrs.password = "$2b$10$XYZ..."
    ↓
createUser(attrs)
    ↓
HSET users#<id> password "$2b$10$XYZ..."
```

Login flow ngược lại:

```text
form input: "abc123"
    ↓
GET HSET users#<id> password → "$2b$10$XYZ..."
    ↓
bcrypt.compare("abc123", stored_hash) → true/false
```

→ Code Redis không đụng đến password security. Đó là việc của app layer, không phải Redis. Bài học: **Redis chỉ là storage; security/validation ở layer trên**.

## Câu hỏi: vì sao tạo object trung gian thay vì pass `attrs` thẳng?

Đây là code đang viết:

```ts
await client.hSet(userKey(id), {
  username: attrs.username,
  password: attrs.password,
});
```

Sao không gọn hơn:

```ts
await client.hSet(userKey(id), attrs);    // pass thẳng
```

Vì `attrs` có thể có **extra field** không nên/không cần lưu. Vd:
- `attrs.confirmPassword` — chỉ để validate, không cần lưu.
- `attrs.csrfToken` — meta của form, không phải data của user.
- `attrs.captchaResponse` — request-level, không persist.

Nếu pass thẳng, mọi field theo về Redis → bloat, leak data (confirmPassword!), khó debug.

→ **Pattern**: viết explicit object liệt kê field cần lưu. Đây là "tay thì lười nhưng đầu thì tỉnh".

Khi feature mở rộng (thêm field email, role, age), bạn chỉ thêm dòng vào object — không cần lo "attrs có chứa gì nữa".

## Câu hỏi: vì sao return ID chứ không return user?

```ts
async function createUser(attrs): Promise<string> {
  const id = genId();
  await client.hSet(...);
  return id;       // ← string, không phải full user object
}
```

Lý do app này:
1. Caller (route handler signup) cần id để **tạo session** ngay sau đó.
2. Caller đã có `attrs.username` và `attrs.password` rồi — không cần Redis trả lại.
3. Nếu cần full user, gọi `getUserById(id)` riêng — chia tách responsibility.

> Nhiều app khác có thể return `Promise<User>` cho convenience. Cả 2 đều OK. Quy ước team.

## Cải thiện cho tương lai

Code hiện chưa hoàn chỉnh. Sẽ thêm về sau:

1. **Username uniqueness check**: hiện 2 user có thể có cùng username. Cần secondary index (phase tiếp).
2. **Email field**: nếu có.
3. **createdAt timestamp**: để track join date.
4. **Avatar / profile fields**: khi cần.
5. **Atomic transaction**: tạo user + tạo username-index trong 1 MULTI/EXEC.

Mỗi cái sẽ thêm dần.

## Code cuối bài

```ts
// src/services/queries/users.ts
import { client } from '../redis/client';
import { userKey } from '../keys';
import { genId } from '$lib/utils/id';

export async function createUser(attrs: CreateUserAttrs): Promise<string> {
  const id = genId();
  await client.hSet(userKey(id), {
    username: attrs.username,
    password: attrs.password,
  });
  return id;
}
```

5 dòng code thực sự. Pattern này lặp lại cho nhiều entity khác.

## So sánh với SQL

Tương đương SQL:

```sql
INSERT INTO users (id, username, password)
VALUES (?, ?, ?)
RETURNING id;
```

Khác biệt:
- SQL có **schema enforcement** — sai field type → reject. Redis không.
- SQL có **constraint** (UNIQUE username) — Redis phải tự lo.
- SQL có **auto-increment** id — Redis client tự sinh.
- SQL phải **CONNECT pool** — Redis thường 1 connection persistent là đủ.

Trade-off: Redis cho phép linh hoạt schema cao hơn nhưng đòi developer chịu trách nhiệm validation/uniqueness.

## Tóm tắt bài 3

- `createUser` = sinh id + `HSET` + return id. 5 dòng code.
- `client.hSet(key, object)` là tiện ích của lib, nội bộ convert sang alternating-form.
- **Luôn tạo object explicit** thay vì pass `attrs` thẳng — tránh leak field thừa.
- Password đã được hash trước khi tới Redis; security là việc app layer.
- Còn thiếu: username uniqueness, timestamp, atomic — sẽ thêm dần.

**Bài kế tiếp** → [Bài 4: Serialize/Deserialize pattern — vì sao luôn cần](04-serialize-deserialize-pattern.md)
