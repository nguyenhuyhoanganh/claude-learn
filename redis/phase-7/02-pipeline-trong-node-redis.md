# Bài 2: Pipeline trong node-redis — Promise.all vs multi()

Khái niệm pipeline áp dụng được cho mọi lib, nhưng **cú pháp khác nhau**. Bài này tập trung vào `node-redis` (lib khoá học dùng), so sánh với pattern phổ biến ở các lib khác, và giải thích lựa chọn cách dùng.

## Hai cách pipeline trong node-redis

### Cách 1: `Promise.all([...])` — pipeline thuần (KHÔNG atomic)

```ts
const results = await Promise.all([
  client.hGetAll('car1'),
  client.hGetAll('car2'),
  client.hGetAll('car3'),
]);
// results = [obj1, obj2, obj3]
```

**Quan trọng**: KHÔNG dùng `await` trước mỗi `client.x()`. `Promise.all` nhận **array các promise** chưa await, fire chúng song song.

`node-redis` đủ thông minh: khi nhiều command được fire trong cùng tick, lib **gom chúng vào 1 buffer**, gửi 1 lần. Đây là pipeline automatic.

### Cách 2: `client.multi()` — transaction atomic

```ts
const pipeline = client.multi();
pipeline.hGetAll('car1');
pipeline.hGetAll('car2');
pipeline.hGetAll('car3');
const results = await pipeline.exec();
// results = [obj1, obj2, obj3]
```

`multi()` ban đầu là **transaction** (MULTI/EXEC trong Redis). Trong node-redis, `multi()` cũng làm pipeline (gửi tất cả lệnh trong 1 RTT) **và** thêm tính chất atomic (lệnh khác từ client khác KHÔNG thể xen vào giữa).

## Khác biệt thực tế

| | `Promise.all([cmds])` | `client.multi()` |
|---|---|---|
| Số round-trip | 1 | 1 |
| Atomic | KHÔNG | CÓ |
| Server buffer | Reply trả ngay khi xử lý xong từng lệnh | Reply trả 1 lần ở EXEC |
| Conditional? | Có (logic ở client) | Có (qua WATCH/Lua) |
| Use case | Bulk read/write không quan tâm thứ tự | Group lệnh phải all-or-nothing |

## So với cú pháp lib khác (chuẩn cộng đồng)

Hầu hết lib khác dùng pattern `pipeline()` rõ ràng:

```python
# redis-py
pipe = r.pipeline()
pipe.hgetall('car1')
pipe.hgetall('car2')
pipe.hgetall('car3')
results = pipe.execute()
```

```go
// go-redis
pipe := rdb.Pipeline()
cmd1 := pipe.HGetAll(ctx, "car1")
cmd2 := pipe.HGetAll(ctx, "car2")
cmd3 := pipe.HGetAll(ctx, "car3")
_, err := pipe.Exec(ctx)
result1 := cmd1.Val()
```

```java
// Jedis
Pipeline pipe = jedis.pipelined();
Response<Map<String,String>> r1 = pipe.hgetAll("car1");
Response<Map<String,String>> r2 = pipe.hgetAll("car2");
Response<Map<String,String>> r3 = pipe.hgetAll("car3");
pipe.sync();
```

→ Mọi lib đều có method `pipeline()` rõ ràng. **node-redis là ngoại lệ** — dùng `Promise.all` cho pipeline pure, dùng `multi()` cho transaction.

Quy ước này có gốc rễ từ JavaScript: Promise/async-await là native concurrent primitive, lib tận dụng. Hơi confusing với người từ Python/Java sang.

## Implement `getItems` với Promise.all

```ts
// services/queries/items/items.ts
export async function getItems(ids: string[]): Promise<(Item | null)[]> {
  if (ids.length === 0) return [];
  
  const commands = ids.map((id) => client.hGetAll(itemKey(id)));
  const results = await Promise.all(commands);
  
  return results.map((raw, i) => {
    if (Object.keys(raw).length === 0) return null;
    return deserialize(ids[i], raw);
  });
}
```

Phân tích:

1. **`ids.map((id) => client.hGetAll(...))`** — tạo mảng promise. KHÔNG `await` trong map → mỗi item là Promise chưa hoàn thành.

2. **`await Promise.all(commands)`** — fire tất cả, đợi xong. node-redis batch tất cả vào 1 round-trip.

3. **`results.map((raw, i) => ...)`** — duyệt mảng kết quả. Index `i` để lấy lại `ids[i]` (cần cho `deserialize(id, raw)` vì hash không lưu id).

4. **Empty check** mỗi raw: nếu rỗng (key không tồn tại) → `null`, không phải bỏ qua. Mảng output có cùng length với input ids, position match → caller biết item nào bị thiếu.

## Cách viết tránh sai

Đây là cách **SAI** mà nhiều người mới mắc:

```ts
// SAI — vẫn tuần tự, không pipeline!
const items = [];
for (const id of ids) {
  const it = await getItem(id);     // ← await trong loop
  items.push(it);
}
```

`await` trong loop block đến khi promise resolved → mỗi lệnh đợi RTT trước. 30 lệnh = 30 RTT = ~15ms. Không phải pipeline.

```ts
// Cũng SAI — fire all nhưng dùng await sai
for (const id of ids) {
  const it = await client.hGetAll(itemKey(id));   // await trực tiếp
}
```

Same issue.

```ts
// ĐÚNG — fire all không await, gom vào Promise.all
const promises = ids.map((id) => client.hGetAll(itemKey(id)));
const results = await Promise.all(promises);
```

→ Nguyên tắc: **`await` chỉ tại 1 chỗ duy nhất** sau khi gom xong promise array.

## Mixed commands trong pipeline

Pipeline KHÔNG yêu cầu tất cả lệnh cùng loại:

```ts
const results = await Promise.all([
  client.hSet('user#1', { name: 'Alice' }),
  client.hGet('user#2', 'email'),
  client.del('cache#old'),
  client.expire('session#abc', 86400),
  client.incr('counter:views'),
]);
// results = [
//   1,                // hSet return
//   'bob@x.com',      // hGet return
//   1,                // del return
//   1,                // expire return
//   42                // incr return
// ]
```

5 lệnh khác nhau trong 1 round-trip. Hữu ích khi setup/teardown đa bước.

## Khi nào dùng `multi()` thay vì `Promise.all`?

Dùng `multi()` khi cần **atomic** (lệnh khác từ client khác KHÔNG được xen vào giữa):

```ts
// Pattern: "đọc balance, trừ, kiểm tra"
const pipeline = client.multi();
pipeline.hGet('account#1', 'balance');
pipeline.hIncrBy('account#1', 'balance', -100);
pipeline.hGet('account#1', 'balance');
const [oldBal, newBal, confirm] = await pipeline.exec();
// Giữa 3 lệnh, không ai có thể đọc/sửa account#1
```

Với `Promise.all`:
- Lệnh 1 và lệnh 2 có thể bị xen bởi client khác.
- Vd: client B cũng trừ 50 → state cuối sai.

Đa số case bulk read (như `getItems`) **không cần** atomic — chỉ cần tốc độ. Dùng `Promise.all`.

## Performance đo thực

App benchmark 100 `getItem`:

```ts
// Tuần tự
console.time('seq');
for (const id of ids) await getItem(id);
console.timeEnd('seq');
// seq: 52ms

// Pipeline
console.time('pipe');
await getItems(ids);
console.timeEnd('pipe');
// pipe: 1.8ms
```

**~30x nhanh hơn** cho 100 item. Càng nhiều item, hệ số càng cao.

## Bẫy: kích thước batch

Pipeline 1 triệu lệnh:
- Client buffer 1 triệu RESP frame (~30 MB) trước khi gửi.
- Server xử lý tuần tự 1 triệu lệnh → ~50ms thuần CPU + memory cho reply.
- TCP buffer có thể không đủ → blocking.

Best practice: chunk:

```ts
const BATCH_SIZE = 1000;
const allResults: any[] = [];
for (let i = 0; i < ids.length; i += BATCH_SIZE) {
  const batch = ids.slice(i, i + BATCH_SIZE);
  const promises = batch.map((id) => client.hGetAll(itemKey(id)));
  const results = await Promise.all(promises);
  allResults.push(...results);
}
```

1k là sweet spot cho hầu hết workload. Có thể tune.

## Pipeline trong CLI

`redis-cli` cũng hỗ trợ pipeline qua stdin:

```bash
(echo -e "SET k1 v1\nSET k2 v2\nSET k3 v3") | redis-cli --pipe
```

Hoặc:
```bash
cat commands.txt | redis-cli --pipe
```

Hữu ích cho seed data lớn hoặc migration.

## Code cuối bài: `getItems` hoàn chỉnh

```ts
// services/queries/items/items.ts
export async function getItems(ids: string[]): Promise<(Item | null)[]> {
  if (ids.length === 0) return [];
  
  const commands = ids.map((id) => client.hGetAll(itemKey(id)));
  const results = await Promise.all(commands);
  
  return results.map((raw, i) => {
    if (Object.keys(raw).length === 0) return null;
    return deserialize(ids[i], raw);
  });
}
```

11 dòng. Có thể reuse pattern này cho mọi resource Hash khác (`getUsers`, `getSessions`...).

## Tóm tắt bài 2

- node-redis dùng **`Promise.all([cmds])`** cho pipeline thuần, **`client.multi()`** cho atomic transaction.
- Khác cú pháp với hầu hết lib khác (Python, Java, Go) dùng `pipeline()` rõ ràng.
- Quy tắc: tạo mảng promise (không await), gọi `Promise.all` 1 chỗ.
- Pipeline mixed command tự do.
- Chunk batch 1k để tránh OOM.
- `getItems` 30x nhanh hơn loop tuần tự.

**Bài kế tiếp** → [Bài 3: Áp dụng pipeline vào app — getItems thực chiến](03-getitems-thuc-chien.md)
