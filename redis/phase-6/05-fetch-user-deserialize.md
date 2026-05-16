# Bài 5: Fetch user — deserialize và thêm id vào object

Tiếp tục `users.ts`. Bài này hoàn thiện `getUserById` — đọc hash, check empty, deserialize, thêm id từ key vào object trả về. Pattern này lặp lại cho mọi resource Hash.

## Goal

```ts
export async function getUserById(id: string): Promise<User | null> {
  // 1. HGETALL từ Redis
  // 2. Nếu key không tồn tại → return null
  // 3. Deserialize raw object → User
  // 4. Return
}
```

Type `User`:

```ts
export type User = {
  id: string;
  username: string;
  password: string;
};
```

Chú ý: `User` có **id**, nhưng raw hash trong Redis **không** chứa id (id ở key). `deserialize` phải thêm vào.

## Bước 1 — HGETALL

```ts
export async function getUserById(id: string): Promise<User | null> {
  const raw = await client.hGetAll(userKey(id));
  // ...
}
```

`raw` có 1 trong 2 dạng:

- Tồn tại: `{ username: 'alice', password: '$2b$...' }` (2+ field).
- Không tồn tại: `{}` (empty object) — **không phải `null`**.

Nhắc lại từ [phase-5 bài 2](../phase-5/02-hgetall-empty-object.md): **`HGETALL` trên key không có vẫn trả `{}` chứ không nil**.

## Bước 2 — Check empty

```ts
if (Object.keys(raw).length === 0) {
  return null;
}
```

Hai cách tương đương:

```ts
// Cách A: check số key
if (Object.keys(raw).length === 0) return null;

// Cách B: check field bắt buộc
if (!raw.username) return null;
```

Cách A **safer** — không phụ thuộc field cụ thể. Nếu schema đổi (vd rename `username` → `name`), code không bị break ở chỗ check existence.

Cách B nhanh hơn 1 micro giây (không phải `Object.keys`) nhưng coupling.

Khuyến cáo: **Cách A**.

## Bước 3 — Deserialize

```ts
return deserialize(id, raw);
```

```ts
function deserialize(id: string, user: Record<string, string>): User {
  return {
    id,
    username: user.username,
    password: user.password,
  };
}
```

**Quan trọng**: `id` được pass vào từ caller (`getUserById(id)` → `deserialize(id, raw)`). Trong raw Redis không có id.

### Vì sao thêm id vào object trả?

Object `User` mà app dùng cần id để:
- Tạo session: `sessionData.userId = user.id`.
- Tạo route link: `<a href="/users/${user.id}">`.
- Đối chiếu trong logic: `if (item.ownerId === currentUser.id) {...}`.

Nếu không có id, mọi caller phải remember `userKey(...)` riêng → gấp đôi state, dễ sai.

→ **Pattern**: Redis lưu data **không có id** (tiết kiệm memory), app **luôn nhận lại object có id** (tiện dùng).

## Code đầy đủ

```ts
// src/services/queries/users.ts
import { client } from '../redis/client';
import { userKey } from '../keys';
import { genId } from '$lib/utils/id';
import type { CreateUserAttrs, User } from '$lib/types';

export async function createUser(attrs: CreateUserAttrs): Promise<string> {
  const id = genId();
  await client.hSet(userKey(id), serialize(attrs));
  return id;
}

export async function getUserById(id: string): Promise<User | null> {
  const user = await client.hGetAll(userKey(id));
  if (Object.keys(user).length === 0) return null;
  return deserialize(id, user);
}

function serialize(user: CreateUserAttrs) {
  return {
    username: user.username,
    password: user.password,
  };
}

function deserialize(id: string, user: Record<string, string>): User {
  return {
    id,
    username: user.username,
    password: user.password,
  };
}
```

20 dòng. Đây là file `users.ts` cho User entity với 2 operation cơ bản.

## Test

```bash
npm run dev
```

Trong browser:
1. Signup user mới.
2. Check Redis Insight: thấy key `users#<id>` với 2 field.
3. Tạo simple route test (hoặc dùng REPL):
   ```ts
   const u = await getUserById('a3f9...');
   console.log(u);
   // → { id: 'a3f9...', username: 'alice', password: '$2b$...' }
   ```
4. Test key không tồn tại:
   ```ts
   const u = await getUserById('nonexistent-id');
   console.log(u);
   // → null
   ```

Cả 2 case đúng.

## Hành vi khi nào trả `null`?

| Tình huống | Return |
|---|---|
| Key tồn tại với field đầy đủ | `User` object |
| Key không tồn tại | `null` |
| Key tồn tại nhưng 0 field (rất hiếm — Redis tự xoá) | `null` |
| Key tồn tại nhưng kiểu khác (vd accidentally `SET`) | **Error WRONGTYPE** từ Redis |

Case cuối là edge case. Nếu app **luôn** dùng `userKey()` để truy cập, sẽ không xảy ra. Nếu lo: thêm `try/catch` ở caller.

## Pattern lặp cho mọi resource Hash

Mọi resource dùng Hash đều có shape giống nhau:

```ts
// Tạo resource X
export async function createX(attrs: CreateXAttrs): Promise<string> {
  const id = genId();
  await client.hSet(xKey(id), serialize(attrs));
  return id;
}

// Đọc resource X theo id
export async function getXById(id: string): Promise<X | null> {
  const raw = await client.hGetAll(xKey(id));
  if (Object.keys(raw).length === 0) return null;
  return deserialize(id, raw);
}

// Helper riêng cho resource
function serialize(x: CreateXAttrs) { /* ... */ }
function deserialize(id: string, raw: Record<string, string>): X { /* ... */ }
```

→ Khi viết tiếp Session, Item, ... ta dùng đúng skeleton này, chỉ thay tên resource + nội dung serialize/deserialize.

## "Thừa code" hay "Khôn ngoan"?

Một số developer sẽ nói: "code này đầy boilerplate, sao không tự động hoá?". Có nhiều giải pháp:

1. **Generic helper**:
   ```ts
   async function getById<T>(
     key: string,
     deserialize: (id: string, raw: Record<string, string>) => T
   ): Promise<T | null> {
     const raw = await client.hGetAll(key);
     if (Object.keys(raw).length === 0) return null;
     return deserialize(id, raw);
   }
   ```
2. **Class-based ORM** (vd `redis-om`).
3. **Decorator + reflection**.

**Trade-off**:
- Generic helper: tốt cho 80% case nhưng khó tùy biến với resource đặc biệt.
- ORM: thêm dependency, mất kiểm soát performance, magic.

Khoá học chọn **lặp boilerplate** vì:
- Mỗi function nhỏ, dễ hiểu, dễ test.
- Sửa schema chỉ touch 1 file.
- Thấy rõ lệnh Redis gì được chạy.
- Junior dev đọc code không cần biết framework lạ.

Khi codebase lớn (50+ resource), generic helper trở nên đáng giá. Tới đó refactor.

## Performance

Mỗi `getUserById`:
- 1 round-trip Redis (~0.5 ms cùng AZ).
- HGETALL trên hash 2 field: O(2), micro giây.
- deserialize: O(1).

Tổng: ~0.5 ms / call. Trên 10k user concurrent, throughput ~20k ops/s/connection. Nếu cần cao hơn → pipeline batch hoặc shard.

## Bonus: `mget` cho nhiều user

Nếu cần đọc nhiều user (vd page hiển thị danh sách):

```ts
export async function getUsersByIds(ids: string[]): Promise<(User | null)[]> {
  if (ids.length === 0) return [];
  
  const pipeline = client.multi();
  for (const id of ids) {
    pipeline.hGetAll(userKey(id));
  }
  const results = await pipeline.exec();
  
  return ids.map((id, i) => {
    const raw = results[i] as Record<string, string>;
    return Object.keys(raw).length === 0 ? null : deserialize(id, raw);
  });
}
```

1 round-trip cho N user. Hữu ích cho list view.

## Tóm tắt bài 5

- `getUserById`: `HGETALL` → check `Object.keys().length === 0` → `deserialize(id, raw)`.
- **`deserialize` thêm id vào object** vì Redis hash không lưu id (đã ở key).
- Pattern lặp identical cho mọi resource Hash → có thể trừu tượng hoá nhưng đa số case dùng boilerplate là OK.
- Round-trip ~0.5ms; throughput ~20k ops/s/connection.
- Lấy nhiều user: pipeline với `multi()`.

**Bài kế tiếp** → [Bài 6: Session — authentication pattern hoàn chỉnh](06-session-authentication.md)
