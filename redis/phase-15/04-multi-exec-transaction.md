# Bài 4: MULTI/EXEC — transaction trong Redis

Khi atomic primitive không đủ, ta cần gom **nhiều lệnh** thành 1 đơn vị atomic. Redis có `MULTI/EXEC` — transaction lite. Bài này cover cú pháp, semantic, và **những khác biệt cốt lõi** với SQL transaction để tránh hiểu lầm.

## MULTI/EXEC là gì?

> **MULTI** = bắt đầu queue lệnh.  
> **EXEC** = thực thi toàn bộ queue như **một block atomic**.

```text
MULTI
+OK

SET counter 0
+QUEUED         ← không chạy ngay, vào queue

INCR counter
+QUEUED

EXEC
*2              ← reply mảng 2 element
1) +OK
2) :1
```

→ Cả 2 lệnh chạy **liên tục, không bị xen** bởi client khác.

## Khác SQL transaction — QUAN TRỌNG

| Aspect | SQL transaction | Redis MULTI/EXEC |
|---|---|---|
| Rollback khi lệnh fail? | **CÓ** | **KHÔNG** |
| Isolation level | Configurable (READ COMMITTED, ...) | "All-at-once" (snapshot không có) |
| Có thể read mid-transaction và branch? | Có (SELECT trong transaction) | **KHÔNG** — read trả `QUEUED`, không value |
| Lock | DB tự lock | **Không có lock**; race vẫn xảy ra trừ khi dùng WATCH |
| Cú pháp error → abort? | Có | Có (Redis 2.6.5+) |
| Runtime error → abort? | Có | **KHÔNG** — lệnh khác vẫn chạy |

Đây là điểm **hay làm nhầm** với người từ SQL sang.

### Ví dụ: runtime error KHÔNG rollback

```text
MULTI
SET counter 0
+QUEUED

LPUSH counter "hello"     ← sai kiểu (counter là String, không phải List)
+QUEUED                    ← không phát hiện được tại lúc queue

EXEC
1) +OK                     ← SET vẫn chạy
2) -WRONGTYPE              ← LPUSH fail
```

→ SET chạy, LPUSH fail. **No rollback**. Counter giờ = 0.

→ Mong đợi rollback giống SQL → bug âm thầm. Phải design code không cần rollback (idempotent retry, hoặc dùng Lua cho atomic + abort logic).

### Ví dụ: syntax error → abort

```text
MULTI
SET counter 0
+QUEUED

INVALIDCOMMAND
-ERR unknown command 'INVALIDCOMMAND'

EXEC
-EXECABORT Transaction discarded because of previous errors
```

Cú pháp lỗi (syntax) Redis bắt được lúc queue → abort EXEC. Chỉ runtime/type error mới qua.

## Trong node-redis: `client.multi()`

```ts
const result = await client.multi()
  .set('counter', '0')
  .incr('counter')
  .incr('counter')
  .exec();
// result = ['OK', 1, 2]
```

`client.multi()` trả về **pipeline-like object**. Chain lệnh. `.exec()` thực thi.

Tương đương `MULTI ... EXEC` server-side.

## Hành vi 1 RTT

`MULTI/EXEC` trong node-redis là **1 RTT** giống pipeline. Lib gom tất cả lệnh + EXEC vào 1 buffer, gửi 1 lần.

So với pipeline thuần (`Promise.all`):
- Pipeline: không atomic, lệnh khác có thể xen.
- MULTI/EXEC: **atomic** (không lệnh khác xen giữa các lệnh trong block).

→ Trong node-redis, dùng `multi()` cho atomic, `Promise.all` cho non-atomic batch.

## Use case 1: Atomic counter group

```ts
// Mỗi like: tăng like trên 2 cấu trúc atomic
await client.multi()
  .hIncrBy(itemKey(itemId), 'likes', 1)
  .zIncrBy('items:likes', 1, itemId)
  .exec();
```

Nếu pipeline thường: giữa 2 lệnh có thể có lệnh khác xen. Không vấn đề ở case này (vì 2 lệnh độc lập), nhưng dùng MULTI để show intent atomic.

## Use case 2: Snapshot read

Đôi khi cần "đọc nhiều key cùng atomic snapshot":

```ts
const result = await client.multi()
  .hGetAll(userKey(id))
  .lRange(`activity:${id}`, 0, 9)
  .sCard(`followers:${id}`)
  .exec();

const [user, activities, followerCount] = result;
```

Pipeline thường có thể có client khác modify giữa các lệnh đọc. MULTI/EXEC đảm bảo snapshot consistent.

(Đôi khi over-kill — đa số case pipeline đủ.)

## Use case 3: Move data between structures atomic

```ts
// Move user từ pool waiting sang processing
await client.multi()
  .sRem('waiting', userId)
  .sAdd('processing', userId)
  .exec();
```

Nếu không atomic: có moment user **không có** ở set nào (bị mất). MULTI bảo đảm.

## Vấn đề: làm sao validate trước EXEC?

Đây là điểm yếu lớn nhất của MULTI/EXEC.

```ts
// Mong muốn:
const item = await client.hGet(itemKey, 'price');     // read
if (parseFloat(item) < newAmount) {                    // validate
  await client.multi()
    .hSet(itemKey, 'price', newAmount.toString())
    .exec();
}
```

**Race**: giữa `hGet` và `multi().exec()`, client khác có thể update price.

`hGet` trong `multi()` block? **Không hoạt động**:

```text
MULTI
HGET items#X price
+QUEUED          ← không có value, chỉ "QUEUED"
EXEC
```

→ Trong MULTI block, lệnh không trả value. Trả `QUEUED`. Result chỉ có sau EXEC. Không thể branch giữa MULTI và EXEC.

## Giải: WATCH (bài 5)

`WATCH key` đánh dấu key. Nếu key bị modify bởi client khác giữa WATCH và EXEC → EXEC **fail** (trả null thay vì result array).

Pattern optimistic locking:

```ts
async function bidWithOptimisticLock(itemId: string, amount: number) {
  while (true) {
    await client.watch(itemKey(itemId));
    
    const item = await getItem(itemId);
    if (item.price >= amount) {
      await client.unwatch();
      throw new Error('Bid too low');
    }
    
    const result = await client.multi()
      .hSet(itemKey(itemId), 'price', amount.toString())
      .exec();
    
    if (result !== null) {
      return;     // success
    }
    // result === null → key bị modify, retry
  }
}
```

Sẽ học chi tiết bài 5.

## DISCARD — huỷ transaction

```text
MULTI
SET foo bar
+QUEUED

DISCARD
+OK

# Lệnh trong queue bị xoá, không thực thi
```

Use case: sau MULTI thấy condition không đúng → DISCARD thay vì EXEC.

Trong node-redis: `client.multi()` không exec → tự bị garbage collect. Hoặc:
```ts
const m = client.multi().set('foo', 'bar');
// Quyết định không chạy
m.discard();
```

## Memory consideration

Transaction queue lệnh **trong memory client + Redis** trước EXEC. Đẩy 1M lệnh vào MULTI → 1M command bytes pending. OOM risk.

→ Giới hạn lệnh trong 1 MULTI block (vd < 1000).

## Khi nào DÙNG MULTI/EXEC?

✓ Khi cần atomic giữa **nhiều lệnh** không có phụ thuộc value-of-each-other.  
✓ Khi cần snapshot consistent đọc nhiều key.  
✓ Kết hợp WATCH cho optimistic locking với pre-condition.

## Khi nào KHÔNG dùng?

✗ Atomic 1 lệnh đơn → atomic primitive đủ.  
✗ Logic có if/else dựa trên kết quả lệnh trong block → Lua script.  
✗ Cần rollback khi lệnh fail → Lua script (manual).  
✗ Cần read intermediate value → Lua.

## Tóm tắt bài 4

- **MULTI/EXEC** = queue lệnh + thực thi atomic.
- **KHÔNG rollback** khi lệnh fail runtime — khác SQL.
- 1 RTT trong node-redis (`client.multi().exec()`).
- **Không thể branch** giữa MULTI và EXEC dựa trên value — phải đọc trước, dùng WATCH.
- WATCH cho optimistic locking — bài 5.
- Lua cho logic phức tạp + manual abort.

**Bài kế tiếp** → [Bài 5: WATCH + optimistic locking](05-watch-optimistic-locking.md)
