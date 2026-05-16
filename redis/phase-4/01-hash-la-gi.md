# Bài 1: Hash — kiểu dữ liệu lý tưởng cho object/record

Đã học String (phase-2). Giờ chuyển sang **Hash** — kiểu dữ liệu thứ hai bạn sẽ dùng nhiều nhất, đặc biệt khi lưu **object có nhiều field** như user, product, session. Bài này giải thích Hash là gì, vì sao nó tốt hơn String JSON, và những giới hạn cần biết.

## Hash trong Redis là gì?

> **Hash** trong Redis là một **map từ field (string) → value (string)**, được gán nhãn bởi một **key** ở Redis level.

Hai cấp **key**:
- **Outer key** (key Redis): cho biết entry này nằm ở đâu trong keyspace. Ví dụ `users#42`, `company`.
- **Inner field**: cho biết field bên trong hash. Ví dụ `name`, `age`, `email`.

```text
Redis keyspace
+---------------------------------------------+
|  users#42  →  { name:    "Alice",           |
|                age:      "30",              |
|                email:    "a@b.com",         |
|                role:     "admin"   }        |
|                                             |
|  company   →  { name:    "Concrete Co",     |
|                age:      "1915",            |
|                industry: "Concrete" }       |
+---------------------------------------------+
```

Mô hình quen thuộc với người đã dùng:
- **JavaScript**: object `{ key: value }` (nhưng giá trị bị giới hạn — xem bên dưới).
- **Python**: `dict` (giới hạn tương tự).
- **Java**: `HashMap<String, String>`.
- **Go**: `map[string]string`.

## Use case kinh điển

Hash sinh ra để lưu **một bản ghi (record) / object**:

| Object | Outer key | Field |
|---|---|---|
| User | `users#42` | name, email, age, role, created_at |
| Product | `items#7` | title, price, stock, seller_id |
| Session | `sessions#abc-123` | user_id, csrf_token, created_at |
| Image metadata | `images#xyz` | path, width, height, mime |
| Order | `orders#001234` | user_id, total, status |

So với việc dùng nhiều String key độc lập (`user:42:name`, `user:42:age`, ...), Hash gọn hơn cả về:
- **Số key** trong Redis (1 thay vì N).
- **Memory overhead** mỗi key (Redis tốn ~50-100 byte cho mỗi key tách rời).
- **Atomic operations** trên cùng entity (`HSET user:42 name X age Y` set 2 field atomic).

## Hash KHÔNG hỗ trợ nested hoặc array

Đây là **giới hạn quan trọng** thường gây lúng túng cho người mới.

✅ **Được**:
```json
{
  "name": "Concrete Co",
  "age": 1915,
  "industry": "Concrete"
}
```

❌ **KHÔNG được** (nested object):
```json
{
  "name": "Concrete Co",
  "industry": {
    "primary": "Concrete",
    "secondary": "Materials"
  }
}
```

❌ **KHÔNG được** (array):
```json
{
  "name": "Concrete Co",
  "tags": ["building", "infrastructure", "USA"]
}
```

**Vì sao?** Hash trong Redis là **map 2 cấp duy nhất** (key → field → value). Mọi value bên trong phải là **string** (hoặc số được biểu diễn dạng string, giống String type bài phase-2).

### Cách khắc phục

| Need | Solution |
|---|---|
| Nested object | (a) Flatten field name: `industry.primary`, `industry.secondary` (cộng đồng quy ước dùng `.` hoặc `_`). (b) Hash riêng cho object con: `company#7:industry`. (c) Serialize JSON vào một field string: `industry: "{\"primary\":\"...\"}"`. |
| Array | (a) Serialize JSON vào field. (b) Dùng cấu trúc Redis khác: **List** cho thứ tự, **Set** cho không trùng, **Sorted Set** cho ranking. (c) Liên kết: `items#7:tags` là Set riêng. |
| Document phức tạp | Dùng **RedisJSON module** (`JSON.SET`, `JSON.GET`) — hỗ trợ JSON đúng chuẩn, query nested. |

### Vì sao Redis không support nested?

Quyết định thiết kế gốc của Antirez: **đơn giản, predictable performance**. Nested cấu trúc sẽ:
- Yêu cầu parser phức tạp.
- Phải hỗ trợ query path (`HGET company.industry.primary`).
- Khó tính memory footprint.

Antirez chọn "primitive types đơn giản, ghép lại từ nhiều key" thay vì "document phức tạp như Mongo". Đây cũng là lý do RedisJSON ra đời như một **module riêng** — giữ core Redis gọn.

## Cấu trúc nội bộ của Hash (encoding)

Redis chuyển đổi encoding nội bộ tuỳ kích thước hash:

| Encoding | Khi nào | Đặc điểm |
|---|---|---|
| **listpack** (≥ 7.0, trước là ziplist) | Hash nhỏ: ≤ 128 field & mỗi value ≤ 64 byte | Lưu nén liên tục, tiết kiệm memory ~10x, nhưng O(N) cho mỗi thao tác |
| **hashtable** | Hash lớn hơn | Hash table thật, O(1), tốn nhiều memory hơn |

Cấu hình ngưỡng trong `redis.conf`:
```conf
hash-max-listpack-entries 128
hash-max-listpack-value 64
```

→ Với object nhỏ điển hình (user có ~10 field, value ngắn), Hash dùng listpack — **rất gọn**. Đây là một trong những lý do Hash hiệu quả hơn nhiều String tách rời.

> Bạn không cần thao tác trực tiếp với encoding. Redis tự chuyển khi cần. Lệnh `OBJECT ENCODING users#42` cho biết hiện tại đang là gì.

## Hash vs String-JSON — so sánh

Một câu hỏi rất hay gặp: **lưu user là `HSET users#42 name X age Y` hay `SET users#42 '{"name":"X","age":"Y"}'`?**

| Tiêu chí | Hash (HSET) | String JSON (SET) |
|---|---|---|
| Update 1 field | `HSET users#42 age 31` — atomic, 1 RTT | `GET` → parse → modify → `SET` — race condition, 2 RTT |
| Đọc 1 field | `HGET users#42 age` — chỉ field cần | Phải `GET` cả object rồi parse |
| Đọc tất cả | `HGETALL users#42` | `GET` rồi parse JSON ở client |
| Memory (object nhỏ ~10 field) | Nhỏ hơn ~30-50% nhờ listpack | Phải lưu cả JSON brace + key name lặp |
| Nested data | KHÔNG (workaround flatten) | Có |
| Array | KHÔNG | Có |
| Schema validation | KHÔNG | Có thể validate client-side |
| Đếm field | `HLEN users#42` O(1) | Phải parse JSON |
| Increment counter field | `HINCRBY users#42 views 1` atomic | Race condition |

**Quy tắc đơn giản**:
- **Hash khi**: object có schema bằng phẳng, cần update lẻ tẻ từng field.
- **JSON-in-String khi**: object nested, ít update (chỉ ghi/đọc toàn bộ), hoặc đã có lý do dùng String (vd cache HTML).
- **RedisJSON module khi**: cần JSON đúng chuẩn với query nested.

## 5 lệnh cốt lõi của Hash

Phase này sẽ học 5 lệnh:

1. **`HSET`** — set 1 hoặc nhiều field.
2. **`HGET`** — get 1 field.
3. **`HGETALL`** — get tất cả field.
4. **`HDEL`** — xoá 1 hoặc nhiều field.
5. **`HINCRBY`** / **`HINCRBYFLOAT`** — tăng/giảm field số.

Cùng các "helper":
- `HEXISTS` — field có tồn tại?
- `HLEN` — số field.
- `HKEYS` / `HVALS` — chỉ field, chỉ value.
- `HSTRLEN` — độ dài string của 1 field.
- `HMGET` — get nhiều field cùng lúc.
- `HSETNX` — set field chỉ khi chưa có.
- `HRANDFIELD` — random field (≥ Redis 6.2).
- `HSCAN` — duyệt hash lớn không chặn.

Sẽ học chi tiết ở bài 2-3.

## Mapping với data layer của app RB

Ở phase-3 ta đã làm page caching. Đến phase-7 (= Section 07 transcript) ta sẽ tạo các function user/item dùng Hash:

```ts
// keys.ts (mở rộng)
export const userKey = (id: string) => `users#${id}`;
export const itemKey = (id: string) => `items#${id}`;
export const sessionKey = (id: string) => `sessions#${id}`;

// queries/users.ts
async function createUser(data: UserData) {
  await client.hSet(userKey(data.id), {
    name: data.name,
    email: data.email,
    age: String(data.age),
    role: data.role,
    createdAt: new Date().toISOString(),
  });
}

async function getUser(id: string): Promise<User | null> {
  const obj = await client.hGetAll(userKey(id));
  if (Object.keys(obj).length === 0) return null;
  return deserializeUser(obj);
}

async function updateUserRole(id: string, role: string) {
  await client.hSet(userKey(id), 'role', role);   // atomic, 1 field
}
```

Sẽ làm thật ở phase-6 (= S07 transcript).

## Vài giới hạn kích thước cần biết

| Giới hạn | Giá trị |
|---|---|
| Số field tối đa trong 1 hash | ~4 tỷ (2^32 - 1) |
| Độ dài 1 field hoặc value | 512 MB |
| Listpack threshold mặc định | 128 field × 64 byte/value |
| Hash → hashtable encoding | Tự động khi vượt ngưỡng |

Thực tế:
- Không nên có hash > vài nghìn field — `HGETALL` sẽ chậm, chặn event loop.
- Field name lặp ở mọi entry → ngắn càng tốt nếu có hàng triệu hash giống schema.

## Bẫy thường gặp đầu tiên

(Sẽ học sâu hơn ở phase-5 = "Redis has gotchas". Đây là preview.)

1. **Type field bị mất**: Hash chỉ lưu string. `age: 30` (number) bị Redis lưu là `"30"` (string). Bạn phải tự `parseInt` khi đọc.
2. **Boolean phải tự convert**: `enabled: true` → lưu `"true"` hay `"1"`? Quy ước team.
3. **`null` field**: bạn không thể lưu null trực tiếp. Hoặc xoá field (`HDEL`), hoặc lưu chuỗi rỗng `""`.
4. **Date phải serialize**: `Date.now()` ms hoặc ISO string — chọn 1 convention.
5. **`HGETALL` trên hash khổng lồ**: chặn event loop nếu hash có 100k field. Dùng `HSCAN`.

## Tóm tắt bài 1

- Hash = map `field → value` (cả 2 là string) gán nhãn bằng key Redis.
- Use case kinh điển: object/record (user, product, session).
- KHÔNG hỗ trợ nested hoặc array — workaround: flatten, ref qua key khác, hoặc RedisJSON.
- Encoding nội bộ: listpack (nhỏ, gọn) → hashtable (lớn, O(1)).
- Hash thường tốt hơn String-JSON khi cần update field lẻ tẻ; ngược lại khi value nested.
- 5 lệnh cốt lõi: HSET, HGET, HGETALL, HDEL, HINCRBY (+ nhiều helper).

**Bài kế tiếp** → [Bài 2: HSET, HGET, HGETALL — đọc/ghi cơ bản](02-hset-hget-hgetall.md)
