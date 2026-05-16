# Bài 1: HSET có những quirk gì khi gọi từ code

Trên CLI, `HSET` rất dễ chịu. Nhưng khi bạn gọi từ code (Node, Python, Java...), có vài "bẫy" liên quan đến cách **client lib serialize value**. Bài này phân tích kỹ và đưa ra pattern an toàn cho production.

## Quirk: lib auto-stringify mọi value

Đầu vào `HSET` trên RESP là **chuỗi byte**. Khi bạn truyền object JavaScript:

```js
await client.hSet('car', {
  color: 'red',
  year: 1950,
});
```

Client lib (`node-redis`) phải convert sang:

```text
HSET car color "red" year "1950"
```

Cách convert:
1. Lặp qua các property của object.
2. Với mỗi value, gọi `String(value)` hoặc `value.toString()`.
3. Ghép vào lệnh RESP.

**90% trường hợp** code chạy đúng. **10% trường hợp** xảy ra điều bất ngờ.

## Bẫy 1: `null` và `undefined` — ERROR

```js
await client.hSet('car', {
  color: 'red',
  year: 1950,
  engine: { cylinders: 8 },
  owner: null,
  service: undefined,
});
```

→ Error:
```text
TypeError: Cannot read properties of null (reading 'toString')
```

### Tại sao?

Khi lib gọi `null.toString()` — chính `null` không có method `toString` → JS ném error. Same with `undefined.toString()`.

### Cách giải

**3 lựa chọn**:

```js
// Lựa chọn 1: bỏ field hoàn toàn (đa số trường hợp)
const data = { color: 'red', year: 1950 };
if (owner !== null) data.owner = owner;
await client.hSet('car', data);

// Lựa chọn 2: lưu chuỗi rỗng để biểu thị "không có"
await client.hSet('car', {
  color: 'red',
  year: 1950,
  owner: owner ?? '',         // null → ""
});

// Lựa chọn 3: helper function loại null trước khi gửi
function clean(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v != null && v !== undefined)
  );
}
await client.hSet('car', clean(data));
```

### Semantic — quan trọng!

`null` ≠ chuỗi rỗng:
- `owner: null` thường nghĩa "không có chủ sở hữu".
- `owner: ""` có thể nghĩa "chủ sở hữu là empty string" (rỗng nhưng có).

Phải nhất quán convention trong app. Nếu chọn "lưu chuỗi rỗng cho null", `HEXISTS` trả 1 cho cả hai trường hợp — không phân biệt được. Một số app lưu `__NULL__` sentinel để giữ semantic, nhưng dễ rò rỉ sentinel ra UI.

→ **Khuyến cáo**: bỏ field nếu không có (HDEL nếu cập nhật). Phía đọc dùng `HEXISTS` hoặc check `data.owner === undefined`.

## Bẫy 2: object lồng → `[object Object]`

```js
await client.hSet('car', {
  color: 'red',
  engine: { cylinders: 8 },   // ← object lồng
});

await client.hGetAll('car');
// → { color: 'red', engine: '[object Object]' }
```

Default `toString()` của object JS là `"[object Object]"` — vô dụng, không lưu được data.

### Cách giải

**Serialize thủ công JSON**:

```js
await client.hSet('car', {
  color: 'red',
  engine: JSON.stringify({ cylinders: 8 }),
});

const raw = await client.hGetAll('car');
const car = {
  color: raw.color,
  engine: JSON.parse(raw.engine),
};
```

Trade-off:
- Tốt: lưu được nested data.
- Xấu: không thể `HSET car engine.cylinders 8` để update field con — phải đọc cả `engine`, parse, modify, serialize lại, HSET.
- Race condition khi update concurrent (giống String JSON problem).

**Khi gặp nested thường**: cân nhắc:
- Bỏ qua Hash, dùng **RedisJSON** (`JSON.SET car $.engine.cylinders 8`).
- Tách hash con riêng: `car#xxx:engine`.

## Bẫy 3: `Date` → ISO string nhưng không chắc parse đúng

```js
await client.hSet('event', {
  name: 'Launch',
  scheduledAt: new Date(),       // Date object
});

const raw = await client.hGetAll('event');
raw.scheduledAt;   
// → "2026-01-15T10:00:00.000Z"  (Date.toString() trả ISO)
```

`Date.toString()` trả về ISO string trong các runtime hiện đại. **Nhưng**:
- Format chính xác phụ thuộc runtime (Node v14 vs v20 vs browser).
- Một số runtime trả về `"Fri Jan 15 2026 10:00:00 GMT+0000"` thay vì ISO.

→ **Luôn explicit serialize**:

```js
await client.hSet('event', {
  name: 'Launch',
  scheduledAt: scheduledDate.toISOString(),   // explicit
});

// Đọc:
const raw = await client.hGetAll('event');
const date = new Date(raw.scheduledAt);

// Hoặc lưu timestamp number:
await client.hSet('event', {
  scheduledAt: String(scheduledDate.getTime()),
});
const date = new Date(parseInt(raw.scheduledAt, 10));
```

## Bẫy 4: Boolean → `"true"` / `"false"` (string!)

```js
await client.hSet('user', { enabled: true });
const raw = await client.hGetAll('user');
raw.enabled;       // "true"  (string!)

if (raw.enabled) console.log('Enabled');  // luôn true!!
```

`"true"` và `"false"` đều là **string không rỗng → truthy**. So sánh boolean phải explicit:

```js
const enabled = raw.enabled === 'true';
```

Hoặc lưu `'1'` / `'0'`:

```js
await client.hSet('user', { enabled: '1' });
const enabled = raw.enabled === '1';
```

> Quy ước chung trong team — chọn 1, dùng nhất quán.

## Bẫy 5: Array → `"a,b,c"` (comma-separated)

```js
await client.hSet('post', {
  tags: ['javascript', 'redis'],
});

const raw = await client.hGetAll('post');
raw.tags;          // "javascript,redis"
```

`Array.toString()` = `arr.join(',')`. **Bẫy**: nếu element chứa dấu phẩy thì tách bị sai.

→ Luôn JSON serialize array:

```js
await client.hSet('post', {
  tags: JSON.stringify(['javascript', 'redis']),
});

const tags = JSON.parse(raw.tags);
```

Tốt hơn: dùng **Set** type của Redis cho mảng tag (sẽ học phase-8).

## Bẫy 6: Number lớn → mất precision

JavaScript `Number` chỉ chính xác đến 2^53 - 1. Với ID > 9 × 10^15 (Twitter ID, MongoDB ObjectId binary...) → mất precision khi `String(bigNumber)`.

```js
const id = 9007199254740993n;  // BigInt
await client.hSet('item', { id });
// BigInt.toString() OK: "9007199254740993"

// Nhưng nếu là Number:
const id = 9007199254740993;   // → tự thành 9007199254740992 (lệch 1)
```

→ Với ID lớn, dùng String hoặc BigInt explicit.

## Pattern an toàn: helper `serialize()`

Tạo helper tập trung mọi convention:

```ts
type Hashable = Record<string, string>;

function serialize(obj: Record<string, unknown>): Hashable {
  const result: Hashable = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      continue;       // bỏ qua null/undefined
    }
    if (value instanceof Date) {
      result[key] = value.toISOString();
    } else if (typeof value === 'boolean') {
      result[key] = value ? '1' : '0';
    } else if (typeof value === 'object') {
      result[key] = JSON.stringify(value);
    } else {
      result[key] = String(value);
    }
  }
  return result;
}
```

Cách dùng:

```ts
await client.hSet(userKey(id), serialize({
  name: 'Alice',
  age: 30,
  enabled: true,
  createdAt: new Date(),
  tags: ['admin', 'beta'],
  notes: null,        // bỏ qua
}));
```

Pair với `deserialize()`:

```ts
function deserializeUser(raw: Record<string, string>): User {
  return {
    name: raw.name,
    age: parseInt(raw.age, 10),
    enabled: raw.enabled === '1',
    createdAt: new Date(raw.createdAt),
    tags: JSON.parse(raw.tags ?? '[]'),
    notes: raw.notes ?? null,
  };
}
```

→ App có **một chỗ duy nhất** xử lý mọi quirk. Phase-6 (= S07 transcript) sẽ làm pattern này thật.

## Khác biệt giữa các lib

Tham chiếu nhanh cho lib khác:

| Lib | null/undefined | Object | Date | Boolean |
|---|---|---|---|---|
| **node-redis** | Error | `[object Object]` | ISO string | `"true"`/`"false"` |
| **ioredis** | Error | `[object Object]` | ISO string | `"true"`/`"false"` |
| **redis-py** (chính chủ) | TypeError | str(dict) | str(datetime) | `"True"`/`"False"` |
| **Jedis** | NullPointerException | object.toString() | toString() | `"true"`/`"false"` |
| **go-redis** | redigo: ignore; go-redis: error | fail | use `time.RFC3339` recommendation | `"true"`/`"false"` |

Mỗi lib có quirk riêng. Khuyến cáo: **không bao giờ pass raw object trực tiếp** — luôn dùng serialize layer của bạn.

## Tóm tắt bài 1

- `HSET` từ code phải đi qua serialize. Mỗi value gọi `.toString()`.
- 6 bẫy phổ biến: `null`, nested object, Date, Boolean, Array, BigNumber.
- Giải pháp duy nhất bền vững: **viết helper `serialize()`/`deserialize()`** trong app, áp dụng nhất quán.
- Convention nhất quán: `null` → bỏ field hoặc empty string, không trộn lẫn.

**Bài kế tiếp** → [Bài 2: HGETALL trả empty object — bẫy existence check](02-hgetall-empty-object.md)
