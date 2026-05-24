# Bài 2: HSET, HGET, HGETALL — đọc/ghi cơ bản của Hash

3 lệnh phổ biến nhất khi làm việc với Hash. Bài này đi qua chi tiết từng cú pháp, return value, độ phức tạp, và quirk cần biết.

## HSET — set một hoặc nhiều field

### Cú pháp

```text
HSET key field value [field value ...]
```

### Ví dụ cơ bản

```text
HSET company name "Concrete Co" age 1915
(integer) 2

HGETALL company
1) "name"
2) "Concrete Co"
3) "age"
4) "1915"
```

### Return value

`HSET` trả về **số field mới được thêm** vào hash (KHÔNG phải số field bị update).

```text
HSET company name "Concrete Co" age 1915
(integer) 2          # 2 field mới

HSET company industry "Concrete" revenue 5.3
(integer) 2          # thêm 2 field mới (industry + revenue)

HSET company industry "Materials"
(integer) 0          # 0 field mới (industry đã có, chỉ update)

HSET company industry "Materials" tagline "We build"
(integer) 1          # tagline mới, industry chỉ update
```

> **Lưu ý**: nhiều tutorial cũ nói `HSET` trả `OK`. Đó là `HMSET` cũ (đã deprecated). `HSET` từ Redis 4.0 trả integer.

### Thay đổi value (update)

`HSET` luôn **ghi đè** value cũ của field nếu đã tồn tại:

```text
HSET company name "Old Name"
HSET company name "New Name"
HGET company name
"New Name"
```

Không có cách nào "fail nếu đã có" với HSET. Để chỉ-set-nếu-chưa-có, dùng `HSETNX`:

```text
HSETNX company name "Try Again"
(integer) 0          # KHÔNG set vì đã có

HSETNX company website "concrete.co"
(integer) 1          # set thành công vì chưa có
```

### Độ phức tạp

`HSET`: **O(N)** với N = số field bạn truyền vào (không phải số field trong hash).

`HSET` thêm 100 field trong 1 lệnh ~ O(100), nhanh hơn nhiều so với 100 lệnh `HSET` riêng vì tiết kiệm round-trip.

### Cú pháp cũ HMSET — đã deprecated

```text
HMSET key field1 val1 field2 val2 ...       # cũ, đã deprecated
```

Giống HSET nhưng trả `"OK"`. Code cũ vẫn dùng được. Khuyến cáo: dùng `HSET` cho code mới.

## HGET — get một field

### Cú pháp

```text
HGET key field
```

### Ví dụ

```text
HGET company name
"Concrete Co"

HGET company age
"1915"           # ← luôn là string, kể cả khi bạn set số

HGET company nonexistent
(nil)            # field không tồn tại

HGET nonexistent_hash anything
(nil)            # key không tồn tại
```

### Return value

- Tồn tại → bulk string (value).
- Field không có hoặc key không có → `nil`.
- O(1).

### Cách phân biệt "field không có" vs "key không có"

Cả hai đều trả `nil`. Để phân biệt:

```text
EXISTS company          # 1 nếu hash tồn tại
HEXISTS company name    # 1 nếu field tồn tại
```

Trong client lib, hành vi giống nhau — `null` ở JS, `None` ở Python.

## HGETALL — get tất cả field

### Cú pháp

```text
HGETALL key
```

### Ví dụ

```text
HGETALL company
1) "name"
2) "Concrete Co"
3) "age"
4) "1915"
5) "industry"
6) "Materials"
7) "revenue"
8) "5.3"
```

### Return value — RAW vs FORMATTED

**Đây là điểm khiến nhiều người mới ngỡ ngàng.**

Trong RESP protocol, `HGETALL` trả về **mảng phẳng** kiểu `[field1, val1, field2, val2, ...]`. Đây là 8 phần tử cho hash 4 field.

Client lib khác nhau xử lý khác nhau:

| Lib | Trả về | Bạn cần làm gì |
|---|---|---|
| `node-redis` (mới) | Object `{ name: "...", age: "..." }` | Sẵn sàng dùng |
| `ioredis` | Object | Sẵn sàng |
| `redis-py` với `decode_responses=True` | Dict | Sẵn sàng |
| `redis-py` mặc định | Dict bytes | Cần decode |
| `Jedis` | `Map<String, String>` | Sẵn sàng |
| `go-redis` | `map[string]string` | Sẵn sàng |
| `redis-cli` raw | Mảng phẳng (in numbered) | Format hiển thị |
| **Một số lib cũ** | Mảng phẳng | **Bạn tự chunk pair** |

```python
# redis-py
data = r.hgetall('company')          # {'name': 'Concrete Co', 'age': '1915'}

# Nếu lib trả mảng phẳng (rare nhưng tồn tại):
flat = ['name', 'Concrete Co', 'age', '1915']
data = dict(zip(flat[::2], flat[1::2]))   # chunk thành dict
```

→ **Đọc doc client lib bạn đang dùng** trước khi giả định format.

### Độ phức tạp & cảnh báo big hash

**O(N)** với N = số field trong hash.

Với hash 10 field — nhanh. Với hash 100,000 field — **chặn event loop trong vài chục ms**, mọi client khác phải đợi.

→ Với hash lớn:
- Dùng `HMGET key field1 field2 ...` lấy chính xác field cần.
- Dùng `HSCAN` để lặp paginated (giống `SCAN` cho keyspace).

```text
HSCAN company 0 COUNT 10
1) "12"                  # cursor để gọi tiếp
2) 1) "name"
   2) "Concrete Co"
   3) "age"
   4) "1915"
   ...
```

Lặp đến khi cursor về 0 là hết.

### Value type — luôn là string

Như đã nhắc bài 1: mọi value trả về là **string**, kể cả số.

```ts
const data = await client.hGetAll('company');
data.age;          // "1915" (string)
const age = parseInt(data.age, 10);   // 1915 (number)

data.revenue;      // "5.3" (string)
const rev = parseFloat(data.revenue); // 5.3 (number)
```

Pattern phổ biến: viết hàm **deserialize** để convert tự động:

```ts
function deserializeUser(raw: Record<string, string>): User {
  return {
    name: raw.name,
    age: parseInt(raw.age, 10),
    enabled: raw.enabled === 'true',
    createdAt: new Date(raw.createdAt),
    score: parseFloat(raw.score),
  };
}

const user = deserializeUser(await client.hGetAll(userKey(id)));
```

Đối ngược là **serialize** trước khi `HSET`:

```ts
function serializeUser(user: User): Record<string, string> {
  return {
    name: user.name,
    age: String(user.age),
    enabled: user.enabled ? 'true' : 'false',
    createdAt: user.createdAt.toISOString(),
    score: String(user.score),
  };
}

await client.hSet(userKey(id), serializeUser(user));
```

Sẽ làm pattern này thật ở phase-6 (= Section 07 transcript).

## HMGET — get nhiều field cụ thể

Khi bạn không cần toàn bộ hash, chỉ vài field — `HMGET` hiệu quả hơn `HGETALL`:

```text
HMGET company name industry nonexistent
1) "Concrete Co"
2) "Materials"
3) (nil)
```

- Trả về **mảng**, đúng thứ tự field bạn yêu cầu.
- Field không tồn tại → vị trí tương ứng là `nil`.
- O(N) với N = số field bạn yêu cầu.

Use case: lấy chỉ thông tin cần hiển thị (vd `name, email` cho user list), tránh kéo về cả profile đầy đủ.

## HLEN, HKEYS, HVALS — helper

```text
HLEN company
(integer) 4              # 4 field

HKEYS company
1) "name"
2) "age"
3) "industry"
4) "revenue"

HVALS company
1) "Concrete Co"
2) "1915"
3) "Materials"
4) "5.3"
```

- `HLEN` O(1).
- `HKEYS` / `HVALS` O(N).

Cảnh báo: với hash lớn, `HKEYS` cũng chặn như `HGETALL`. Dùng `HSCAN` nếu cần duyệt mọi field.

## HEXISTS — kiểm tra field

```text
HEXISTS company name
(integer) 1

HEXISTS company nonexistent
(integer) 0
```

**Quan trọng**: `HEXISTS` chỉ kiểm tra **field có tồn tại** không. KHÔNG kiểm tra giá trị là "truthy".

```text
HSET company tagline ""
HEXISTS company tagline    # 1 (field tồn tại, dù value rỗng)
HGET company tagline       # ""
```

Tương tự với `"0"`, `"false"`, `"null"` — đều là string không rỗng, field tồn tại.

→ Để check "value có nghĩa", phải HGET rồi so sánh ở client.

## HSTRLEN — độ dài của value một field

```text
HSTRLEN company name
(integer) 11           # "Concrete Co" có 11 byte
```

Hữu ích khi:
- Kiểm tra "user có set field hay không" (phân biệt với empty string).
- Tránh `HGET` value khổng lồ chỉ để đo độ dài.

## HRANDFIELD — random field (Redis ≥ 6.2)

```text
HRANDFIELD company             # 1 field random
"industry"

HRANDFIELD company 2           # 2 field random KHÔNG trùng
1) "name"
2) "revenue"

HRANDFIELD company -5          # 5 field random CÓ THỂ trùng
1) "name"
2) "age"
3) "name"
4) "industry"
5) "name"

HRANDFIELD company 2 WITHVALUES  # kèm value
1) "name"
2) "Concrete Co"
3) "age"
4) "1915"
```

Use case: sample data, A/B test, fairness.

## Pipeline với Hash

Khi cần thao tác nhiều hash key một lúc:

```js
const pipeline = client.multi();
pipeline.hSet('users#1', { name: 'Alice', age: '30' });
pipeline.hSet('users#2', { name: 'Bob', age: '25' });
pipeline.hSet('users#3', { name: 'Carol', age: '40' });
await pipeline.exec();    // 1 round-trip cho 3 lệnh HSET
```

## Tóm tắt bài 2

- `HSET key f1 v1 f2 v2 ...` — set 1+ field, trả số field MỚI thêm (không phải số được update).
- `HGET key field` — get 1 field, trả nil nếu không có.
- `HGETALL key` — get all, return format khác nhau giữa các lib (object vs flat array).
- `HMGET key f1 f2 ...` — get nhiều field cụ thể.
- Value luôn là **string** — pattern serialize/deserialize ở client.
- Hash lớn (10k+ field) → `HSCAN` thay vì `HGETALL`.
- Helper: `HLEN`, `HKEYS`, `HVALS`, `HEXISTS`, `HSTRLEN`, `HRANDFIELD`.

**Bài kế tiếp** → [Bài 3: HDEL, HEXPIRE, dọn dẹp hash](03-hdel-dieu-quan-ly.md)
