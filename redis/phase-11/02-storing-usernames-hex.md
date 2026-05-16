# Bài 2: Lưu usernames trong sorted set + hex-decimal conversion

Phase-9 đã có 2 cấu trúc cho username: `usernames:unique` (Set) và `usernames:to-id` (Hash). Bài này thay bằng **một sorted set** duy nhất kết hợp được nhiều chức năng. Khám phá trick **convert hex ID → decimal** để dùng làm score.

## Yêu cầu mới

Một sorted set `usernames` với:
- **Member** = username.
- **Score** = userId.

Cho phép:
1. **Uniqueness check**: `ZSCORE usernames "alice"` — null nếu chưa có.
2. **Lookup id by username**: `ZSCORE` trả về id ngay.
3. **Autocomplete (bonus phase sau)**: `ZRANGE BYLEX` với prefix.

→ 1 cấu trúc thay 2. Memory tiết kiệm, code đơn giản hơn.

## Vấn đề: userId là hex string

App RB sinh id bằng `genId()` — UUID-like hex string (`a3f9c2d1...`).

```text
ZADD usernames "a3f9c2d1..." "alice"
```

→ Error: `score is not a valid float`. Score phải là **number**.

## Giải pháp: convert hex → decimal

Hexadecimal là biểu diễn base-16 của số. Có thể convert qua base-10:

```text
"a3f9c2d1" (hex) = 2750366929 (decimal)
"a3f9c2d1ff0044..." (hex) = một số rất lớn (decimal)
```

JavaScript:
```ts
const decimalId = parseInt(hexId, 16);     // "a3f9..." → number
const hexAgain = decimalId.toString(16);   // number → "a3f9..."
```

→ Convert qua lại không mất thông tin (với id đủ ngắn).

## Bẫy: precision của double

JavaScript `Number` là IEEE 754 double, chính xác đến **2^53 - 1 ≈ 9 × 10^15** (~16 chữ số decimal).

Hex IDs có thể dài 22+ ký tự → decimal có 30+ chữ số → **mất precision**.

```ts
parseInt('ffffffffffffffffffffff', 16)
// → 1.2089258196146292e+26  (đã mất precision)
```

Mitigation:
1. **Giới hạn id length**: dùng `genId()` ra id ngắn (≤ 13 hex chars ≈ 16 decimal digit).
2. **Dùng BigInt**: `BigInt('0x' + hexId)`. Nhưng Redis score vẫn là double — phải truncate.
3. **Composite score**: nửa đầu id làm score, nửa sau dùng member secondary.

Khoá học chấp nhận giới hạn id length. Production cần cân nhắc.

## Implement

### Key generator

```ts
// src/services/keys.ts
export const usernamesKey = () => `usernames`;
```

Lưu ý đặt tên: chỉ `usernames`, không `usernames:unique`. Đây là cấu trúc thay thế.

### Modify `createUser`

```ts
// src/services/queries/users.ts
import { client } from '../redis/client';
import { userKey, usernamesKey, usernamesUniqueKey } from '../keys';
import { genId } from '$lib/utils/id';

export async function createUser(attrs: CreateUserAttrs): Promise<string> {
  const username = attrs.username.toLowerCase().trim();
  
  // Check uniqueness qua sorted set
  const existingScore = await client.zScore(usernamesKey(), username);
  if (existingScore !== null) {
    throw new Error('Username is taken');
  }
  
  const id = genId();
  const decimalId = parseInt(id, 16);
  
  // Pipeline: tạo user + đăng ký username
  await Promise.all([
    client.hSet(userKey(id), serialize(attrs)),
    client.zAdd(usernamesKey(), { score: decimalId, value: username }),
    // Tạm thời giữ usernames:unique cho backward compat (sẽ remove sau)
    client.sAdd(usernamesUniqueKey(), username),
  ]);
  
  return id;
}
```

Giải thích:
1. **Lower + trim username**: convention.
2. **`ZSCORE` check uniqueness**: trả `null` nếu chưa có. Same complexity O(1) như `SISMEMBER`.
3. **`parseInt(id, 16)`**: convert hex → decimal để làm score.
4. **`ZADD` thêm member-score pair**: username là member, decimalId là score.

## Implement `getUserByUsername`

Đây là nơi pattern phát huy:

```ts
export async function getUserByUsername(username: string): Promise<User | null> {
  const normalized = username.toLowerCase().trim();
  
  // 1. Lookup score → decimal ID
  const decimalId = await client.zScore(usernamesKey(), normalized);
  if (decimalId === null) return null;
  
  // 2. Convert decimal → hex
  const hexId = decimalId.toString(16);
  
  // 3. Load user hash
  return await getUserById(hexId);
}
```

3 bước:
- ZSCORE: O(1).
- toString(16): pure JS.
- HGETALL: O(N field).

Total: 2 RTT (ZSCORE + HGETALL). ~1ms.

## Sign-in flow hoàn chỉnh

```ts
async function signIn(username: string, password: string) {
  const user = await getUserByUsername(username);
  if (!user) {
    return { error: 'Invalid credentials' };
  }
  
  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return { error: 'Invalid credentials' };
  }
  
  const sessionToken = uuidv4();
  await saveSession({ id: sessionToken, userId: user.id, username: user.username });
  return { sessionToken };
}
```

Note: error message "Invalid credentials" cho cả 2 trường hợp (user không có / password sai). **Bảo mật**: không cho attacker biết username nào tồn tại.

## So với Hash `usernames:to-id` (cách phase-9)

Cả 2 đều dùng để map username → userId:

| Aspect | Hash `usernames:to-id` | Sorted Set `usernames` |
|---|---|---|
| Lookup | HGET O(1) | ZSCORE O(1) |
| Memory mỗi entry | ~80 byte | ~100 byte |
| Iterate all usernames | HKEYS / HSCAN | ZRANGE 0 -1 |
| Autocomplete prefix | HSCAN MATCH (slow) | **ZRANGE BYLEX** (fast) |
| Range query | Không | **Có (theo score)** |

→ Sorted Set ưu hơn khi cần autocomplete hoặc range query.

## Bonus: Autocomplete với BYLEX

```ts
async function suggestUsernames(prefix: string, limit = 10): Promise<string[]> {
  return await client.zRange(
    usernamesKey(),
    `[${prefix}`,
    `[${prefix}\xff`,
    { BY: 'LEX', LIMIT: { offset: 0, count: limit } }
  );
}
```

→ User gõ "al" → suggest "alice", "albert", "alex"... trong vài μs.

Yêu cầu: mọi member cùng score? **Không bắt buộc** với BYLEX — Redis vẫn sort lex trong cùng score. Nhưng với score khác nhau (như case này, score = userId), thứ tự **phụ thuộc score trước, lex sau**.

→ Để autocomplete chuẩn, có thể tạo **sorted set riêng** `usernames:lex` với mọi score = 0:

```ts
await client.zAdd('usernames:lex', { score: 0, value: username });
```

Trade-off: thêm 1 sorted set. Hoặc dùng RediSearch (phase-18) cho autocomplete đầy đủ.

## Quirk: case sensitivity

Username "Alice" vs "alice":
- Hash field: case-sensitive (HGET "Alice" ≠ "alice").
- Set member: case-sensitive.
- Sorted Set member: case-sensitive.

→ Phải normalize **trước khi store + lookup**. Convention: lowercase.

```ts
const normalized = username.toLowerCase().trim();
```

Hiển thị giữ case gốc:
```ts
HSET users#<id> username "Alice" usernameLower "alice"
```

## Trade-off: redundant data

Sau bài này, app có:
- `users#<id>` (Hash) — canonical user.
- `usernames` (Sorted Set) — index username → id.
- `usernames:unique` (Set) — backward-compat, không cần nữa.

Phase-9 design có lý do (uniqueness check riêng). Bây giờ chỉ sorted set là đủ. **Có thể xoá `usernames:unique`** nếu migrate cẩn thận:

```ts
// Migration script
for await (const username of client.sScanIterator('usernames:unique')) {
  // Đảm bảo username đã có trong sorted set
  const score = await client.zScore('usernames', username);
  if (score === null) {
    // Lookup id từ user hash (cần index ngược)
    // Sau khi có id: ZADD
  }
}
// Xoá set cũ
await client.del('usernames:unique');
```

Để giữ giản tiện cho khoá học, **không xoá** — app vẫn chạy, chỉ tốn thêm chút memory.

## Tóm tắt bài 2

- Sorted set `usernames` với member = username, score = decimal id.
- Convert hex ID ↔ decimal: `parseInt(id, 16)` ↔ `n.toString(16)`.
- Bẫy precision: hex id quá dài → mất precision. Giới hạn length.
- `ZSCORE` thay thế `SISMEMBER` cho uniqueness check.
- `getUserByUsername`: ZSCORE → convert → HGETALL.
- Sorted set ưu hơn Hash cho autocomplete/range query (với cost ~25% memory).

**Bài kế tiếp** → [Bài 3: Most viewed items + tracking pattern](03-most-viewed-items.md)
