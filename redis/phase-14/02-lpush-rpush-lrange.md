# Bài 2: LPUSH/RPUSH/LRANGE/LPOP/RPOP — operation cơ bản

Bài 1 đã giới thiệu sơ. Bài này đi sâu vào 5 lệnh dùng nhiều nhất với List, kèm pattern queue và stack.

## LPUSH — thêm vào đầu (left)

```text
LPUSH key element [element ...]
```

```text
DEL temps
LPUSH temps 25
(integer) 1            # length sau push

LPUSH temps 27
(integer) 2

LRANGE temps 0 -1
1) "27"        # mới push gần nhất ở đầu
2) "25"
```

→ LPUSH là **stack push**: phần tử mới luôn ở đầu.

### Multi-element

```text
LPUSH temps 1 2 3
```

→ Push lần lượt: 1 vào đầu, 2 vào đầu (= trước 1), 3 vào đầu (= trước 2). Kết quả list = `[3, 2, 1]`.

Hơi counter-intuitive. Có thể hình dung: each element pushed individually.

### LPUSHX — chỉ push nếu key tồn tại

```text
LPUSHX nonexistent_list 1
(integer) 0            # không push vì list không có

LPUSH realList 0
LPUSHX realList 1
(integer) 2
```

Use case: "chỉ append nếu queue tồn tại" — pattern hiếm dùng.

## RPUSH — thêm vào cuối (right)

```text
RPUSH temps 25
RPUSH temps 27

LRANGE temps 0 -1
1) "25"        # vào trước
2) "27"        # vào sau
```

→ RPUSH là **queue enqueue**: phần tử mới ở cuối, phần tử cũ ở đầu.

### Phối hợp với LPOP cho FIFO

```text
RPUSH queue task1
RPUSH queue task2
RPUSH queue task3

LPOP queue              # → "task1" (FIFO: vào trước, ra trước)
LPOP queue              # → "task2"
LPOP queue              # → "task3"
LPOP queue              # → nil
```

→ Queue FIFO. Producer RPUSH (enqueue), consumer LPOP (dequeue).

### Stack: LPUSH + LPOP

```text
LPUSH stack item1
LPUSH stack item2
LPUSH stack item3

LPOP stack              # → "item3" (LIFO: vào sau, ra trước)
LPOP stack              # → "item2"
LPOP stack              # → "item1"
```

→ Stack LIFO. Push và pop cùng đầu.

## LPOP / RPOP

```text
LPOP key [count]
RPOP key [count]
```

```text
LPOP queue              # 1 element từ đầu
LPOP queue 5            # 5 elements từ đầu (Redis 6.2+)
RPOP queue 3            # 3 elements từ cuối
```

Return:
- Single (no count): bulk string hoặc nil.
- With count: array, có thể nil-element nếu list rỗng giữa chừng.

**Tính chất**:
- Atomic.
- O(N) với N = count (default 1).
- Khi list trống, key tự xoá.

## BLPOP / BRPOP — blocking pop

Pattern worker: pop từ queue, nhưng queue có thể rỗng → wait có element mới.

```text
BLPOP queue 0           # block vô hạn đến khi có element
BLPOP queue 5           # block tối đa 5 giây
```

```ts
async function worker() {
  while (true) {
    const result = await client.blPop('jobs', 0);    // 0 = vô hạn
    if (result) {
      const { key, element } = result;
      processJob(JSON.parse(element));
    }
  }
}
```

→ Tiết kiệm CPU so với polling. Worker idle khi queue rỗng, instant resume khi có job.

**Bẫy**: BLPOP dùng connection cố định trong khi chờ. Phải dùng **connection riêng** (qua `client.duplicate()`), không lẫn với client chính của app.

```ts
const blockingClient = client.duplicate();
await blockingClient.connect();
const result = await blockingClient.blPop('jobs', 0);
```

## LRANGE

```text
LRANGE key start stop
```

Lấy range index. Inclusive both ends. Negative index OK.

```text
LRANGE temps 0 4            # 5 phần tử đầu (index 0-4)
LRANGE temps 0 -1           # toàn bộ
LRANGE temps -5 -1          # 5 phần tử cuối
LRANGE temps 1 0            # mảng rỗng (start > stop)
LRANGE temps 100 200        # mảng rỗng (out of range)
```

### Hiệu năng

O(S + N) với S = số phần tử cần skip để tới start, N = số phần tử trả về.

→ `LRANGE 0 9` trên list 1M: O(10) — nhanh.  
→ `LRANGE 999990 999999` trên list 1M: O(1000000) — chậm! Phải traverse từ đầu hoặc cuối.

Cải thiện: Redis dùng "tail traversal" khi start gần hơn từ cuối. `LRANGE -10 -1` trên list 1M = O(10) (đếm từ cuối).

→ Pattern "lấy N cuối": dùng negative index thay vì compute index dương.

## LLEN

```text
LLEN temps
(integer) 5
```

O(1). Cached.

## LINDEX

```text
LINDEX temps 0          # đầu
LINDEX temps -1         # cuối
LINDEX temps 100        # nil
```

O(N) — chậm với list lớn. Tránh dùng nhiều.

## Patterns thực

### Pattern 1: Recent activity feed (per user)

```ts
async function logActivity(userId: string, activity: object) {
  const key = `activity:user#${userId}`;
  await Promise.all([
    client.lPush(key, JSON.stringify(activity)),
    client.lTrim(key, 0, 99),    // giữ 100 gần nhất
  ]);
}

async function getRecentActivities(userId: string, count = 20) {
  const raw = await client.lRange(`activity:user#${userId}`, 0, count - 1);
  return raw.map((r) => JSON.parse(r));
}
```

LPUSH + LTRIM = "circular buffer" với capacity cố định.

### Pattern 2: Job queue đơn giản

```ts
// Producer
await client.rPush('jobs', JSON.stringify({ type, payload }));

// Worker (blocking)
const subClient = client.duplicate();
await subClient.connect();
while (true) {
  const result = await subClient.blPop('jobs', 0);
  if (result) {
    const job = JSON.parse(result.element);
    await processJob(job);
  }
}
```

**Đơn giản nhưng**:
- Mất ack: nếu worker crash sau BLPOP nhưng trước khi xử lý xong → job mất.
- Không có retry/dead letter queue.

→ Cho production thực, dùng **Stream + Consumer Group** (phase-20).

### Pattern 3: Reliable queue với LMOVE

LMOVE atomic move 1 element giữa 2 list. Có thể dùng để pattern "process pending queue":

```ts
// Worker
const job = await client.lMove('jobs', 'processing', 'LEFT', 'RIGHT');
if (job) {
  try {
    await processJob(JSON.parse(job));
    await client.lRem('processing', 1, job);    // xoá khi done
  } catch (e) {
    // Job vẫn ở processing — sẽ retry sau
  }
}

// Recovery cron: chuyển processing > 5 phút back to jobs
```

LMOVE replace `RPOPLPUSH` (deprecated từ Redis 6.2).

## Cảnh báo big list

```text
LRANGE huge_list 0 -1         # ❌ trả 1M element về client → MB data
```

Cách đúng:
- Pagination với `LRANGE 0 99` rồi `LRANGE 100 199` ...
- Hoặc dùng Sorted Set thay (range query rẻ hơn).

## Quirk: list rỗng → key bị xoá

```text
RPUSH mylist a
LPOP mylist           # → "a"
EXISTS mylist
(integer) 0           # key biến mất
```

Same với Hash, Set, Sorted Set. Redis không lưu collection rỗng.

## Tóm tắt bài 2

- **LPUSH** thêm đầu, **RPUSH** thêm cuối.
- **LPOP** lấy đầu, **RPOP** lấy cuối. Hỗ trợ count.
- **BLPOP/BRPOP** blocking — pattern worker queue.
- **LRANGE** O(S+N) — tránh range giữa list lớn.
- **LLEN** O(1), **LINDEX** O(N).
- Queue FIFO: RPUSH + LPOP. Stack LIFO: LPUSH + LPOP.
- Patterns: activity feed (LPUSH + LTRIM), job queue (BLPOP), reliable queue (LMOVE).

**Bài kế tiếp** → [Bài 3: LSET, LTRIM, LINSERT, LREM — modify operations](03-lset-ltrim-linsert-lrem.md)
