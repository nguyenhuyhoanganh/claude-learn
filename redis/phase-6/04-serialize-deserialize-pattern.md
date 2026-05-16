# Bài 4: Serialize / Deserialize pattern — vì sao luôn cần

Bài 3 ta viết `client.hSet(key, { username, password })`. Có vẻ dư so với `client.hSet(key, attrs)`. **Đây không phải dư — đó là chỗ neo để bám pattern Serialize/Deserialize**.

Pattern này xuất hiện ở **mọi** function đụng Redis trong app production. Bài này giải thích vì sao, kèm hành vi mặc định "khó dùng" của lib mà ta cần workaround.

## Vấn đề: lib mặc định không xử lý value tốt

Giả sử ta lưu một company object:

```ts
const company = {
  id: 1234,
  name: 'Concrete Co',
  revenue: 89.0,
  createdAt: new Date('1915-03-03'),
};

await client.hSet('company#1234', company);
```

Lib gọi `String(v)` cho mỗi value. Kết quả trong Redis:

```text
HGETALL company#1234
1) "id"
2) "1234"                                          ← OK, số → string
3) "name"
4) "Concrete Co"                                   ← OK
5) "revenue"
6) "89"                                            ← OK
7) "createdAt"
8) "Wed Mar 03 1915 00:00:00 GMT+0700 (ICT)"      ← XẤU!
```

Vấn đề:
1. **createdAt**: format `Date.toString()` phụ thuộc locale + timezone → khó query, khó parse lại, lệ thuộc môi trường.
2. **id lưu trong hash bị thừa**: id đã có trong key (`company#1234`). Lưu lần nữa trong hash phí ~10 byte mỗi record × triệu record = 10 MB phí.

## Vấn đề: hành vi ngược chiều khi đọc về

```ts
const data = await client.hGetAll('company#1234');
// data = {
//   id: "1234",
//   name: "Concrete Co",
//   revenue: "89",
//   createdAt: "Wed Mar 03 1915 ..."
// }
```

Vấn đề:
1. **Số bị thành string**: `data.revenue` là `"89"` chứ không `89` → bug khi `data.revenue + 10` = `"8910"` (string concat).
2. **Date là string xấu**: rest of app expect `Date` object → phải parse, nhưng format xấu khó parse.
3. **id không có trong return**: nếu phần khác của app cần id, không có (vì id chỉ có trong key Redis, không trong hash).

→ Cần lớp **chuyển đổi** giữa "shape app dùng" và "shape Redis lưu".

## Pattern: `serialize()` + `deserialize()`

Hai hàm helper trong file của mỗi resource:

```ts
// services/queries/users.ts (cuối file)

function serialize(user: CreateUserAttrs) {
  return {
    username: user.username,
    password: user.password,
    // Bỏ field không cần lưu
    // Format field theo cách Redis lưu được tốt
  };
}

function deserialize(id: string, raw: Record<string, string>) {
  return {
    id,                              // thêm id từ key
    username: raw.username,
    password: raw.password,
    // Parse field về kiểu app dùng (số, date, boolean)
  };
}
```

Áp dụng:

```ts
// Khi GHI
async function createUser(attrs: CreateUserAttrs) {
  const id = genId();
  await client.hSet(userKey(id), serialize(attrs));   // ← qua serialize
  return id;
}

// Khi ĐỌC
async function getUserById(id: string): Promise<User | null> {
  const raw = await client.hGetAll(userKey(id));
  if (Object.keys(raw).length === 0) return null;
  return deserialize(id, raw);                          // ← qua deserialize
}
```

## "Nhưng serialize chỉ copy field, sao phải có?"

Đúng — với User chỉ có 2 field cơ bản, `serialize()` ban đầu **không làm gì khác** ngoài việc copy field:

```ts
function serialize(user: CreateUserAttrs) {
  return {
    username: user.username,
    password: user.password,
  };
}
```

Có vẻ "code thừa". **Nhưng đây là set-up cho tương lai**:

- Khi thêm `createdAt: Date` → trong `serialize` ta convert sang Unix ms.
- Khi thêm `roles: string[]` → JSON.stringify.
- Khi thêm `lastLogin: Date | null` → convert hoặc bỏ field nếu null.
- Khi thêm `enabled: boolean` → '0'/'1'.

Tất cả thay đổi **chỉ trong serialize/deserialize**. Code gọi `createUser()` / `getUserById()` không đổi.

→ Đây là **pattern lười khôn ngoan**: đặt 1 chỗ để chứa logic sẽ tăng theo thời gian.

## Tên `serialize` không có magic

`serialize` / `deserialize` **không** plug vào lib hay framework. Đây là **terminology cộng đồng dev** chung:

> **Serialize** = chuẩn bị data để gửi đi / lưu trữ ở format khác.  
> **Deserialize** = nhận data về và đưa về format app dùng.

Bạn có thể đặt tên `toHashFields()` / `fromHashFields()`, `dumpUser()` / `loadUser()`, ... — Redis không quan tâm. Quy ước team nhất quán là đủ.

## Pattern đầy đủ với edge case xử lý

Khi resource phức tạp hơn:

```ts
// services/queries/items/serialize.ts
import type { CreateItemAttrs } from '$lib/types';

export function serialize(attrs: CreateItemAttrs) {
  return {
    ...attrs,                              // spread mọi field plain
    createdAt: attrs.createdAt.getTime().toString(),
    endingAt: attrs.endingAt.getTime().toString(),
    price: attrs.price.toString(),          // number → string
    enabled: attrs.enabled ? '1' : '0',     // boolean → '0'/'1'
    // tags được serialize sang JSON nếu là array
    tags: attrs.tags ? JSON.stringify(attrs.tags) : '',
  };
}
```

```ts
// services/queries/items/deserialize.ts
import type { Item } from '$lib/types';

export function deserialize(id: string, raw: Record<string, string>): Item {
  return {
    id,
    name: raw.name,
    description: raw.description,
    imageUrl: raw.imageUrl,
    price: parseFloat(raw.price),
    views: parseInt(raw.views ?? '0', 10),
    likes: parseInt(raw.likes ?? '0', 10),
    bids: parseInt(raw.bids ?? '0', 10),
    enabled: raw.enabled === '1',
    createdAt: new Date(parseInt(raw.createdAt, 10)),
    endingAt: new Date(parseInt(raw.endingAt, 10)),
    ownerId: raw.ownerId,
    highestBidUserId: raw.highestBidUserId || null,
    tags: raw.tags ? JSON.parse(raw.tags) : [],
  };
}
```

→ 2 file rời cho 1 resource. Khi item có 15 field, đỡ "đầy" file `items.ts` chính.

## Khi nào tách `serialize.ts` riêng?

Quy tắc nhỏ:
- **Inline trong cùng file** (cuối `users.ts`): khi resource < 10 field, logic đơn giản.
- **Tách file `serialize.ts` / `deserialize.ts`**: khi resource ≥ 10 field, có nhiều format conversion (Date, JSON, number).

Item có 10+ field với nhiều type → tách file. User có 2-5 field đơn giản → inline.

## Pattern alternative: class với toJSON/fromJSON

Một số codebase dùng class:

```ts
class User {
  constructor(public id: string, public username: string, ...) {}
  
  toHashFields(): Record<string, string> {
    return { username: this.username, ... };
  }
  
  static fromHashFields(id: string, raw: Record<string, string>): User {
    return new User(id, raw.username, ...);
  }
}
```

Hoạt động ổn, nhưng:
- Verbose hơn function module.
- Phải dùng `new User(...)` mọi nơi.
- ORM-like patterns thêm complexity không cần thiết trong app này.

→ Function module + plain object đơn giản hơn. Khoá dùng cách này.

## Tự động hoá với reflection / decorators (hiếm)

```ts
// Hypothetical TS với decorator
@Hash('users#{id}')
class User {
  @Field id: string;
  @Field username: string;
  @Field({ serialize: (d) => d.getTime() }) createdAt: Date;
}
```

Có lib (vd `redis-om`) làm dạng này. **Trade-off**:
- ✓ Less boilerplate.
- ✗ Magic — khó debug khi sai.
- ✗ Performance cost của reflection.
- ✗ Phụ thuộc lib third-party.

Trong app production lớn, đa số team **không dùng** — code tay rõ ràng hơn.

## Quy tắc rút ra

1. **Mọi resource có serialize/deserialize**, dù lúc đầu rất đơn giản.
2. Serialize **bỏ id** (đã có trong key) và format field cho Redis.
3. Deserialize **thêm id** vào và parse field về type app dùng.
4. Convention số → number, date → Date, boolean → boolean, array → array (qua JSON).
5. Tách file khi resource phức tạp; inline cho đơn giản.

## So sánh với SQL ORM

ORM SQL (Sequelize, Hibernate, ...) lo cả serialize/deserialize tự động:

```js
const user = await User.findByPk(42);   // tự deserialize
user.name = 'New';
await user.save();                        // tự serialize
```

Redis không có ORM mạnh tương đương. Trade-off:
- Bạn viết code, nhưng **thấy chính xác lệnh gì được chạy**.
- Performance dễ dự đoán (không bị surprise N+1, lazy loading hidden).
- Schema không bị "fix cứng" — thêm field không phải migration.

Đây cũng là lý do Redis vẫn phổ biến dù viết "tay" hơn — bạn quyền kiểm soát toàn bộ data layer.

## Cập nhật code `createUser`

Sau bài này, code `createUser` thành:

```ts
export async function createUser(attrs: CreateUserAttrs): Promise<string> {
  const id = genId();
  await client.hSet(userKey(id), serialize(attrs));
  return id;
}

function serialize(user: CreateUserAttrs) {
  return {
    username: user.username,
    password: user.password,
  };
}
```

Plus `deserialize` cho bài kế.

## Tóm tắt bài 4

- Lib mặc định convert value bằng `String(v)` — **không đủ tốt** cho Date, null, nested object, number type.
- Pattern: `serialize(input)` trước khi `HSET`; `deserialize(id, raw)` sau khi `HGETALL`.
- Đặt 1 chỗ để chứa mọi conversion logic — code gọi không thay đổi khi schema thay đổi.
- Tên `serialize/deserialize` là quy ước cộng đồng, không phải lib API.
- Tách file riêng khi resource phức tạp; inline khi đơn giản.

**Bài kế tiếp** → [Bài 5: Fetch user — deserialize và thêm id vào object](05-fetch-user-deserialize.md)
