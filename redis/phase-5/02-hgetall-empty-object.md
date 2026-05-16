# Bài 2: HGETALL trả empty object — bẫy existence check

Đây là **bẫy phổ biến và tinh tế** nhất với Hash, gây bug "không tìm thấy nhưng vẫn trả OK" cho rất nhiều app khi mới chuyển sang Redis. Bài này phân tích, đưa ra pattern chuẩn.

## Vấn đề

Code "có vẻ đúng":

```ts
async function getCar(id: string) {
  const car = await client.hGetAll(`car#${id}`);
  if (!car) {
    return { status: 404, body: 'Not found' };
  }
  return { status: 200, body: car };
}

// Test:
await getCar('does-not-exist');
// → { status: 200, body: {} }   ← BẪY!
```

`hGetAll` trên key không tồn tại **KHÔNG trả về `null`** — nó trả **object rỗng** `{}`.

Và `{}` trong JS là **truthy**:

```js
if ({}) console.log('truthy');   // → "truthy"
Boolean({})                       // → true
```

→ `if (!car)` không bao giờ true → app luôn trả 200 dù record không có.

## Tại sao Redis làm thế?

Đây là quirk **không phải của lib, mà của chính RESP/Redis**:

```text
# CLI:
HGETALL car#does-not-exist
(empty array)
```

Trên RESP protocol, `HGETALL` luôn trả **mảng** (array). Mảng có thể có 0 phần tử nhưng nó **vẫn là kiểu "array"**, không phải `nil`. Lib convert array thành object → empty array thành empty object.

Khác với `GET` của String:
```text
GET nonexistent_key
(nil)         ← RESP "nil"
```

`GET` có thể trả nil; `HGETALL` không thể.

### Lý do thiết kế

Một câu hỏi hay: tại sao không trả nil? Lý do (suy đoán từ behavior):
- Hash có thể "trống" (0 field) trong giây ngắn ngủi giữa HSET và HDEL — phân biệt với "không tồn tại" thường vô nghĩa.
- Caller có thể check `Object.keys(obj).length === 0` để biết "empty" gồm cả 2 trường hợp.

Nhưng từ góc nhìn developer, hành vi vẫn **bất ngờ**.

## Cách check đúng

### Pattern 1: check số field

```ts
const car = await client.hGetAll(`car#${id}`);
if (Object.keys(car).length === 0) {
  return { status: 404, body: 'Not found' };
}
return { status: 200, body: car };
```

`Object.keys(obj).length === 0` cho cả 2 trường hợp:
- Key không tồn tại.
- Key tồn tại nhưng hash trống (hiếm, vì Redis xoá key khi field cuối bị HDEL).

→ Hành vi 1 và 2 cùng nghĩa "không có data" → check `length === 0` đủ.

### Pattern 2: check `EXISTS` riêng

```ts
const exists = await client.exists(`car#${id}`);
if (!exists) {
  return { status: 404 };
}
const car = await client.hGetAll(`car#${id}`);
```

**Trade-off**:
- ✓ Rõ ràng semantic.
- ✗ Hai round-trip (chậm hơn).
- ✗ Race condition giữa 2 lệnh: key có thể bị xoá giữa chừng → exists=1, hGetAll = {}.

Khuyến cáo: dùng **pattern 1** cho hầu hết trường hợp.

### Pattern 3: helper function tập trung

```ts
async function getHash<T>(
  client: Redis,
  key: string,
  deserialize: (raw: Record<string, string>) => T
): Promise<T | null> {
  const raw = await client.hGetAll(key);
  if (Object.keys(raw).length === 0) return null;
  return deserialize(raw);
}

// Cách dùng:
const car = await getHash(client, `car#${id}`, (raw) => ({
  color: raw.color,
  year: parseInt(raw.year, 10),
}));

if (!car) {
  return { status: 404 };
}
```

→ Mọi nơi đụng vào hash dùng `getHash()` thay vì `hGetAll` raw. Logic check đặt 1 chỗ.

## Bài học rộng hơn: Mọi command có quirk tương tự không?

**Có nhiều**. Đây là quirk pattern hay gặp khi command trả về collection:

| Lệnh | Trả khi key không tồn tại | Cách check empty |
|---|---|---|
| `GET` | `nil` (null) | `=== null` |
| `HGET` | `nil` (null) | `=== null` |
| `HGETALL` | `{}` (empty object) | `Object.keys().length === 0` |
| `HMGET` | mảng full `nil` | check từng phần tử |
| `HKEYS`, `HVALS` | `[]` (empty array) | `arr.length === 0` |
| `LRANGE` | `[]` | `arr.length === 0` |
| `SMEMBERS` | `[]` | `arr.length === 0` |
| `ZRANGE` | `[]` | `arr.length === 0` |
| `XRANGE` | `[]` | `arr.length === 0` |
| `SCAN`/`HSCAN` | cursor + empty array | cursor và data |
| `EXISTS` | `0` (integer) | `=== 0` |
| `TTL` | `-2` (integer) | `=== -2` |
| `TYPE` | `"none"` (string) | `=== 'none'` |

**Quy tắc**: với lệnh collection (HGETALL, LRANGE, SMEMBERS, ZRANGE, ...), **luôn check size, không check truthy**.

## Bẫy phụ: HMGET trả array có nil

```ts
const values = await client.hmGet('user#42', ['name', 'age', 'nonexistent']);
// → ['Alice', '30', null]
```

`HMGET` luôn trả mảng đúng số field bạn yêu cầu. Field không có → `null` trong mảng.

```ts
const [name, age, email] = await client.hmGet('user#42', ['name', 'age', 'email']);

if (!name) {
  // ← bẫy: nếu name === '' (empty string), name vẫn falsy!
  // Phải dùng:
  if (name === null) ...
}
```

Empty string `""` cũng là falsy trong JS. Để check chính xác **"field tồn tại"** vs **"field rỗng"**, phải `=== null`.

## Bẫy phụ: HEXISTS đúng nhưng tốn round-trip

```ts
// Cách 1: check + get
if (await client.hExists('user#42', 'email')) {
  const email = await client.hGet('user#42', 'email');
}
// 2 round-trip, race condition possible
```

```ts
// Cách 2: get rồi check nil
const email = await client.hGet('user#42', 'email');
if (email !== null) { ... }
// 1 round-trip, không race
```

→ Trừ khi value cực lớn (cần tránh kéo về client), **dùng cách 2**.

## Pattern thực: existence check trong app RB

Trong app khi controller xử lý:

```ts
import { getHash } from './hash-helpers';
import { userKey } from './keys';

router.get('/users/:id', async (req, res) => {
  const user = await getHash(client, userKey(req.params.id), deserializeUser);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json(user);
});
```

Pattern dùng `getHash()` tránh phải nhớ `Object.keys().length === 0` ở mọi controller.

## Bẫy "không tồn tại vs trống" — phân biệt khi cần

Nếu app cần phân biệt "user chưa được tạo" vs "user bị xoá hết field" (rất hiếm):

```ts
const exists = await client.exists(userKey(id));
if (!exists) {
  // chưa từng được tạo
}

const fieldCount = await client.hLen(userKey(id));
if (fieldCount === 0) {
  // tồn tại nhưng trống — không xảy ra trong Redis vì auto-xoá
}
```

Thực tế Redis tự xoá hash khi field cuối bị HDEL → 2 trường hợp gộp làm 1. Không cần phân biệt.

## Tóm tắt bài 2

- `HGETALL` key không tồn tại → empty object `{}`, KHÔNG nil.
- `{}` là **truthy** trong JS → `if (!obj)` bị bypass.
- Check đúng: `Object.keys(obj).length === 0`.
- Quy tắc tổng quát: với lệnh collection, **check size**, không check truthy.
- Pattern tốt nhất: helper `getHash()` tập trung logic.
- HMGET tương tự — phân biệt `null` (không có) vs `""` (rỗng) bằng `=== null`.

**Bài kế tiếp** → [Bài 3: Tổng hợp gotchas Redis & checklist trước khi đi prod](03-tong-hop-gotchas.md)
