# Bài 6: Session — authentication pattern hoàn chỉnh

User đã đăng ký xong (bài 3-5). Giờ vấn đề: làm sao Redis "nhớ" user đã đăng nhập giữa các request HTTP? Đây là **session**. Bài này đi qua flow đầy đủ: từ login → tạo session → gắn token → mỗi request lookup → logout.

Pattern session với Hash + TTL là một trong những **use case classic** nhất của Redis trong production. Hàng nghìn app sử dụng đúng pattern này.

## Vấn đề: HTTP là stateless

HTTP mỗi request độc lập. Server nhận request, xử lý, trả response — không nhớ gì request trước. Vậy làm sao biết "ai đang gọi"?

Có vài cách kinh điển:

| Cách | Cách hoạt động | Trade-off |
|---|---|---|
| **Basic auth** | Mỗi request gửi `Authorization: Basic <base64 user:pass>` | Lộ password mỗi request, không revoke được |
| **JWT** (token tự chứa) | Server cấp JWT signed; client gửi mỗi request; server verify signature | Stateless, nhưng khó revoke khi user bị ban |
| **Session-based** (cách này) | Server tạo session với token random; lưu mapping token → user; client gửi token; server lookup | Cần server storage; revoke dễ |

Session-based phù hợp khi:
- Cần revoke user instantly (ban, logout from all devices).
- Có thể tốn lookup mỗi request (Redis fast → OK).
- Muốn lưu state phụ (CSRF token, last activity, IP, ...).

Khoá học dùng session-based.

## Flow đầy đủ — Sign up

```text
+--------+                                  +--------+               +-------+
| Client |                                  | Server |               | Redis |
+--------+                                  +--------+               +-------+
    |                                            |                       |
    | POST /signup {username, password}          |                       |
    |------------------------------------------->|                       |
    |                                            | HSET users#<id> ...   |
    |                                            |---------------------->|
    |                                            |                       |
    |                                            | (1) Tạo session       |
    |                                            |     token = genId()   |
    |                                            | HSET sessions#<tok>   |
    |                                            |   userId=<id>         |
    |                                            |   username=<u>        |
    |                                            |---------------------->|
    |                                            | EXPIRE 86400          |
    |                                            |---------------------->|
    |                                            |                       |
    | Set-Cookie: session=<tok>                  |                       |
    |<-------------------------------------------|                       |
    |                                            |                       |
```

Tới khi client có cookie `session=<tok>`, app coi user là **đã đăng nhập**.

## Flow đầy đủ — Subsequent request

```text
+--------+                                  +--------+               +-------+
| Client |                                  | Server |               | Redis |
+--------+                                  +--------+               +-------+
    |                                            |                       |
    | POST /items/new                            |                       |
    | Cookie: session=<tok>                      |                       |
    |------------------------------------------->|                       |
    |                                            |                       |
    |                                            | HGETALL sessions#<tok>|
    |                                            |---------------------->|
    |                                            |<----- {userId, ...} --|
    |                                            |                       |
    |                                            | Tạo item với owner=   |
    |                                            |   session.userId      |
    |                                            | HSET items#<id> ...   |
    |                                            |---------------------->|
    |                                            |                       |
    | 200 OK                                     |                       |
    |<-------------------------------------------|                       |
```

**Mỗi request gọi `HGETALL sessions#<tok>`** — đó là cost của session-based auth. May mắn, Redis nhanh: ~0.5ms / lookup.

## Key generator

```ts
// src/services/keys.ts
export const sessionKey = (token: string) => `sessions#${token}`;
```

Token là một string ngẫu nhiên (UUID, cryptographically secure). KHÔNG dùng user id làm token — id predictable, attacker đoán được.

## File: `services/queries/sessions.ts`

3 function:

```ts
export async function getSession(id: string): Promise<Session | null> { /* ... */ }
export async function saveSession(session: Session): Promise<void> { /* ... */ }
// (deleteSession sẽ thêm cho logout)
```

Type:

```ts
type Session = {
  id: string;          // = token
  userId: string;
  username: string;
};
```

## Implement `getSession`

Pattern y hệt `getUserById`:

```ts
export async function getSession(id: string): Promise<Session | null> {
  const raw = await client.hGetAll(sessionKey(id));
  if (Object.keys(raw).length === 0) return null;
  return deserialize(id, raw);
}

function deserialize(id: string, raw: Record<string, string>): Session {
  return {
    id,
    userId: raw.userId,
    username: raw.username,
  };
}
```

**Lưu ý quan trọng**: `Object.keys(raw).length === 0` check là **bắt buộc**, không phải optional. Đây là bẫy [phase-5 bài 2](../phase-5/02-hgetall-empty-object.md): `HGETALL` trả `{}` cho key không tồn tại, không trả nil. Empty object trong JS là **truthy** → bypass `if (!raw)`.

Test thực tế:

```ts
const session = await getSession('nonexistent-token');
console.log(session);  // null ← đúng

if (session) {
  console.log('Logged in as', session.username);
} else {
  console.log('Not logged in');   // ← chạy nhánh này
}
```

## Implement `saveSession`

```ts
export async function saveSession(session: Session): Promise<void> {
  await client.hSet(sessionKey(session.id), serialize(session));
}

function serialize(session: Session) {
  return {
    userId: session.userId,
    username: session.username,
    // Không lưu session.id — đã có trong key
  };
}
```

**Khác biệt với `createUser`**: ở đây không sinh id mới. Token (= session.id) đã được tạo bởi caller (middleware login). Khi save, chỉ lấy id đã có.

→ Pattern: tách rời "ai sinh id" và "ai lưu". Nếu function nào cũng tự sinh id, control flow rối.

## TTL cho session

Mặc định code trên **không** set TTL → session sống mãi. Trong production:

```ts
export async function saveSession(session: Session, ttl = 86400): Promise<void> {
  await client.hSet(sessionKey(session.id), serialize(session));
  await client.expire(sessionKey(session.id), ttl);
}
```

Lưu ý:
- `HSET` + `EXPIRE` là **2 lệnh** — giữa chúng có khả năng race. Trong thực tế hầu như vô hại (session vừa tạo, không ai delete giữa chừng).
- Nếu cần atomic tuyệt đối: dùng `MULTI/EXEC` hoặc Lua.

### Sliding session — gia hạn khi user hoạt động

Mỗi request, nếu thấy session valid → gia hạn TTL:

```ts
// Middleware mỗi request
async function authMiddleware(req) {
  const token = req.cookies.session;
  if (!token) return null;
  
  const session = await getSession(token);
  if (!session) return null;
  
  // Sliding: mỗi request gia hạn 24h
  await client.expire(sessionKey(token), 86400);
  
  return session;
}
```

Trade-off:
- ✓ User không bị "đá ra" giữa khi đang dùng.
- ✗ Mỗi request thêm 1 lệnh EXPIRE → tăng cost.

Optimization: chỉ refresh khi TTL < 50% (vd: nếu còn < 12h thì gia hạn). Giảm số lệnh EXPIRE.

## Cookie security

Khi gửi token về browser, **cookie phải an toàn**:

```ts
res.setCookie('session', token, {
  httpOnly: true,        // JS không đọc được (chống XSS lấy session)
  secure: true,          // HTTPS only (chống MITM)
  sameSite: 'lax',       // chống CSRF cơ bản
  maxAge: 86400 * 1000,  // 24h
});
```

Không phải code Redis, nhưng **bắt buộc** cho app production.

## Logout — `deleteSession`

```ts
export async function deleteSession(id: string): Promise<void> {
  await client.del(sessionKey(id));
}
```

Route handler:
```ts
router.post('/logout', async (req, res) => {
  const token = req.cookies.session;
  if (token) {
    await deleteSession(token);
  }
  res.clearCookie('session');
  res.redirect('/');
});
```

## Sign up — chain các operation

Route handler `/signup`:

```ts
import { v4 as uuidv4 } from 'uuid';

router.post('/signup', async (req, res) => {
  const { username, password } = req.body;
  
  // 1. Hash password (middleware)
  const hashed = await bcrypt.hash(password, 10);
  
  // 2. Tạo user
  const userId = await createUser({ username, password: hashed });
  
  // 3. Tạo session
  const sessionToken = uuidv4();
  await saveSession({
    id: sessionToken,
    userId,
    username,
  });
  
  // 4. Gửi cookie
  res.setCookie('session', sessionToken, { httpOnly: true, /*...*/ });
  res.redirect('/');
});
```

→ Sign up = 2 Redis writes + cookie. Latency ~1-2ms.

## Sign in — thiếu một mảnh ghép

Sign in cần "find user by username". Code hiện chưa làm được:

```ts
async function signIn(username: string, password: string) {
  const user = await getUserByUsername(username);   // ← chưa implement
  if (!user) return { error: 'User not found' };
  
  const match = await bcrypt.compare(password, user.password);
  if (!match) return { error: 'Wrong password' };
  
  const sessionToken = uuidv4();
  await saveSession({ id: sessionToken, userId: user.id, username: user.username });
  return { sessionToken };
}
```

Vấn đề: `getUserByUsername` cần **secondary index** (username → user_id). Redis không index field tự động.

Giải pháp (phase tiếp): khi tạo user, thêm `SET usernames:<username> <user_id>`. Khi find by username, đọc map đó để lấy id, rồi `getUserById`.

> Đây là **kinh điển** của Redis: muốn truy vấn nào, **tạo index thủ công** cho truy vấn đó. Liên quan tới [phase-3 bài 3 design methodology](../phase-3/03-redis-design-methodology.md).

## Tóm tắt bài 6

- Session = mapping token random → user info, lưu trong Redis Hash với TTL.
- Pattern y hệt user hash: `getSession`/`saveSession` + serialize/deserialize.
- **Empty object check bắt buộc** — bẫy `HGETALL` không trả nil.
- TTL: dùng `EXPIRE` sau `HSET`; sliding session cho UX tốt.
- Cookie phải `httpOnly + secure + sameSite`.
- Sign in cần secondary index `usernames:<u> → <id>` — Redis không index field.

**Bài kế tiếp** → [Bài 7: Lưu items — serialize datetime](07-luu-items-datetime.md)
