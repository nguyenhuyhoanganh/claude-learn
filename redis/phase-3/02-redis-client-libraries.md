# Bài 2: Redis client library — vì sao chúng khác ORM SQL

Khi học SQL, bạn quen với **ORM** (Sequelize, Hibernate, Django ORM, SQLAlchemy, GORM, ...) — biến SQL thành "method chain" trừu tượng. Bạn có thể viết Sequelize mà không cần thực sự hiểu SQL.

**Với Redis, không có ORM thật.** Hầu hết client library chỉ là **bộ ánh xạ 1-1** từ command Redis sang function. Bài này giải thích vì sao, hệ quả gì, và cách dùng `node-redis` trong app.

## Bản đồ client lib theo ngôn ngữ

| Ngôn ngữ | Lib chính chủ | Lib phổ biến khác | Đặc điểm |
|---|---|---|---|
| **Node.js / TS** | `node-redis` (`redis` npm package) | `ioredis` | node-redis: chính chủ Redis Inc., RESP3, đầy đủ; ioredis: rất mạnh với cluster, pipeline |
| **Python** | `redis-py` (`redis` pip) | `aioredis` (đã merge vào redis-py) | redis-py rất phổ biến, sync + async; có decode_responses tiện lợi |
| **Java** | `Lettuce` (Netty-based, async/reactive) | `Jedis` (đơn giản, sync) | Spring Data Redis dùng Lettuce mặc định; Jedis dễ học hơn |
| **Go** | `go-redis/redis` (chính chủ Redis Inc.) | `redigo` | go-redis hỗ trợ context, cluster, RESP3 |
| **C#/.NET** | `StackExchange.Redis` | — | Async-first, very mature |
| **Ruby** | `redis-rb` | — | Sync; có `connection_pool` riêng |
| **PHP** | `phpredis` (extension C) | `predis` (pure PHP) | phpredis nhanh hơn nhờ là extension |
| **Rust** | `redis-rs` | — | sync + async (tokio) |
| **C** | `hiredis` | — | Lib gốc, mọi lib khác wrap quanh hiredis |

> **Tin tốt**: API gần như giống hệt nhau. Học `node-redis` xong, chuyển sang `redis-py` chỉ là khác cú pháp ngôn ngữ, không phải khác concept.

### So sánh cú pháp giữa các lib

Lệnh `SET hello world EX 60`:

```js
// node-redis
await client.set('hello', 'world', { EX: 60 });
```

```python
# redis-py
r.set('hello', 'world', ex=60)
```

```java
// Jedis
jedis.set("hello", "world", SetParams.setParams().ex(60));

// Lettuce
commands.set("hello", "world", SetArgs.Builder.ex(60));
```

```go
// go-redis
rdb.Set(ctx, "hello", "world", 60*time.Second)
```

```csharp
// StackExchange.Redis
await db.StringSetAsync("hello", "world", TimeSpan.FromMinutes(1));
```

→ Function name + tham số gần như đồng nghĩa. Một khi nắm "ý tưởng lệnh SET" + "option EX", chuyển ngôn ngữ là vài phút.

## Vì sao Redis lib không phải ORM "thật sự"?

ORM SQL như Sequelize cho phép bạn viết:

```js
const user = await User.findOne({
    where: { username: 'alice' },
    include: [Profile]
});
```

Đằng sau ORM:
1. Sinh ra SQL: `SELECT users.*, profiles.* FROM users JOIN profiles ON ... WHERE username = 'alice'`.
2. Gửi tới DB.
3. Hydrate kết quả thành object JavaScript.
4. Hỗ trợ lazy loading, dirty tracking, migrations...

**Bạn không cần biết SQL** để dùng ORM. Hệ thống SQL DB là **declarative**: bạn nói "tôi muốn gì", DB lo "lấy như thế nào".

Redis ngược lại:
- Không có "JOIN". Bạn phải tự đọc nhiều key, ghép ở app.
- Không có schema. Mỗi key/value bạn tự quản.
- Không có "query planner". Bạn chọn data structure, chọn lệnh.

→ Redis lib không có gì để trừu tượng hoá. Bạn vẫn phải **biết lệnh** và biết nó làm gì.

## Hệ quả: doc của lib thường... thiếu

Một thực tế dễ gây sốc khi mới dùng:

> Nhiều client lib **không** document từng lệnh. Họ nói thẳng: "đi đọc redis.io/commands".

Ví dụ trang docs `node-redis`:

```text
## Commands

There are dozens of Redis commands. Each one is implemented as a 
method on the client. For documentation on what each does, please see 
the official Redis documentation.
```

→ Hết. Không có chi tiết "SET nhận tham số gì, trả gì". Bạn phải đi [redis.io/commands/set](https://redis.io/docs/latest/commands/set/).

### Tại sao? — quyết định thiết kế hợp lý

- Số lệnh Redis: ~250 lệnh × N option mỗi cái. Maintain doc song song với Redis docs = nỗ lực gấp đôi.
- Redis docs **rất đầy đủ** — type, complexity, return, example, history.
- Lib chỉ wrap → behavior giống hệt → đọc Redis docs là đủ.

**Hệ quả thực tế cho bạn**:
- Bookmark `https://redis.io/commands/`.
- Mỗi khi không chắc lệnh trả gì, đọc Redis docs, KHÔNG đọc docs lib.
- Học lệnh Redis là **kiến thức nền tảng** — dùng được suốt sự nghiệp, không phụ thuộc ngôn ngữ.

## Có "Redis ORM" không?

Có vài thư viện cố làm ORM cho Redis:

- **Redis OM Node / Python / .NET / Spring** — chính chủ Redis Inc.: định nghĩa schema, tạo entity, tự sinh key, tự index qua RediSearch.
- **Redisson** (Java) — distributed object framework, có Map, Set, Lock... wrap Redis.
- **node-redis-orm** — community.

**Đánh giá**:
- Hữu ích cho prototype nhanh, dự án nhỏ.
- **Hạn chế**: che mất control quan trọng — bạn không thấy lệnh thực được gửi, khó tối ưu performance khi scale.
- Production lớn thường **không dùng** ORM Redis — dùng lib base + thiết kế thủ công.

Khoá này dùng **`node-redis` thuần** — biết chính xác lệnh nào được gửi.

## `node-redis` — những gì bạn cần biết để bắt đầu

### Cài đặt

```bash
npm install redis
```

### Khởi tạo client

```ts
// src/services/redis/client.ts
import { createClient } from 'redis';

const client = createClient({
  socket: {
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
  },
  password: process.env.REDIS_PASSWORD,
});

client.on('error', (err) => console.error('Redis error', err));

await client.connect();

export { client };
```

Vài điểm cần biết:
- **`createClient()`** chỉ tạo object — chưa connect tới Redis.
- **`await client.connect()`** mở TCP socket. Phải đợi xong trước khi dùng.
- Lib có **auto-reconnect** mặc định khi mất kết nối, với backoff exponential.
- **`client.on('error', ...)`** bắt event lỗi — luôn đăng ký để không crash app khi disconnect tạm thời.

### Cú pháp lệnh

```ts
// Hầu hết lệnh có method tương ứng, camelCase hoá:
await client.set('color', 'red');
await client.get('color');                      // 'red' hoặc null
await client.set('color', 'blue', { EX: 60 });  // option dạng object
await client.mGet(['a', 'b', 'c']);             // mảng
await client.hSet('user:1', { name: 'Alice', age: 30 });
await client.zAdd('lb', { score: 99, value: 'alice' });
await client.expire('key', 30);
await client.del('key');
```

Hoặc dùng lệnh raw (nếu method không có / lệnh mới chưa được implement):

```ts
const reply = await client.sendCommand(['SET', 'color', 'red', 'EX', '60']);
```

### Connection pool và lifecycle

- **Một client = một connection TCP** (không phải pool).
- Trong Node.js single-thread, một connection thường đủ — pipelining giúp throughput cao.
- Cần nhiều connection (vd thread-pool app server hiếm) → tạo nhiều client.
- Khi tạo Redis cluster, dùng `createCluster` thay vì `createClient`.

### Pipeline trong node-redis

```ts
const pipeline = client.multi();
for (let i = 0; i < 1000; i++) {
  pipeline.set(`key:${i}`, `value:${i}`, { EX: 60 });
}
await pipeline.exec();    // gửi 1 lần, nhận 1000 reply
```

> `client.multi()` trong node-redis làm **cả** transaction (MULTI/EXEC) **lẫn** pipeline. Nếu cần "không atomic, chỉ batch", có cờ `{ MULTI: false }` ở phiên bản mới.

### Pub/Sub — cần connection riêng

```ts
const subscriber = client.duplicate();
await subscriber.connect();
await subscriber.subscribe('chat', (msg) => console.log('Got:', msg));
```

Lý do: khi client đang trong subscribe mode, **không nhận lệnh bình thường**. Phải tách connection.

## Bẫy hay gặp trong node-redis (và các lib khác)

### 1. Quên `await client.connect()` trước khi gọi lệnh

```ts
const client = createClient({...});
await client.get('foo');     // Error: client not connected
```

### 2. Lẫn lộn `null` vs `'(nil)'`

`client.get('not-exists')` trả về `null` trong JS (không phải chuỗi `"(nil)"`). Check `=== null`, không phải `=== ''`.

### 3. Buffer vs string

Mặc định node-redis decode UTF-8 → string. Khi lưu binary thuần (image, protobuf), set option `returnBuffers: true` hoặc dùng `client.duplicate({...})` riêng cho binary key.

### 4. Pipeline khi mạng đứt giữa chừng

Pipeline `multi()` gửi tất cả lệnh; nếu mạng đứt giữa, một số lệnh đã chạy, một số chưa → cần idempotent operation và retry.

### 5. Đặt timeout hợp lý

Mặc định node-redis có thể chờ vô hạn. Set `socket: { connectTimeout: 5000 }` và `socket: { reconnectStrategy: ... }` để app fail-fast khi Redis down.

## Tip thực tế: tạo wrapper "thin" trong app

Đừng để mọi file đụng thẳng `client.set/get`. Tạo lớp services mỏng:

```ts
// services/queries/page-cache.ts
import { client } from '../redis/client';
import { pageCacheKey } from '../keys';

const CACHED_ROUTES = ['/about', '/privacy', '/auth/signin', '/auth/signup'];

export async function getCachePage(route: string): Promise<string | null> {
  if (!CACHED_ROUTES.includes(route)) return null;
  return await client.get(pageCacheKey(route));
}

export async function setCachePage(route: string, page: string): Promise<void> {
  if (!CACHED_ROUTES.includes(route)) return;
  await client.set(pageCacheKey(route), page, { EX: 60 });
}
```

Lợi:
- Test/mock dễ hơn (chỉ cần mock `services/queries/*`).
- Đổi key naming một chỗ.
- Thay Redis thành caching khác (vd Memcached) trong tương lai → ít chỗ phải sửa.

## Tóm tắt bài 2

- Client lib Redis là **wrapper mỏng 1-1** quanh lệnh Redis, KHÔNG phải ORM.
- Docs của lib thường thiếu — luôn đọc **redis.io/commands** làm nguồn chính.
- Lệnh giống nhau giữa các ngôn ngữ → kiến thức "lệnh Redis" portable cao.
- `node-redis`: `createClient` + `connect`, method camelCase, `multi()` cho pipeline/transaction, `duplicate()` cho pub/sub.
- Tạo lớp service mỏng để isolate Redis call khỏi business code.

**Bài kế tiếp** → [Bài 3: Redis Design Methodology — bài học cốt lõi nhất khoá học](03-redis-design-methodology.md)
