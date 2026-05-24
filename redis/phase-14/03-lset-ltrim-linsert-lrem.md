# Bài 3: LSET, LTRIM, LINSERT, LREM, LPOS — modify operations

Phần "biến đổi" của List. Đa số O(N), dùng cẩn thận. Bài này cover từng lệnh với use case và bẫy cụ thể.

## LSET — update value tại index

```text
LSET key index element
```

```text
RPUSH temps 25 27 28 29 30
LSET temps 2 99
LRANGE temps 0 -1
1) "25"
2) "27"
3) "99"        # ← index 2 đã đổi
4) "29"
5) "30"
```

- Index out of range → error.
- O(N) — phải traverse tới index.

→ Hiếm khi dùng trong production. List thường append-only.

## LTRIM — giữ range, xoá phần khác

```text
LTRIM key start stop
```

```text
RPUSH temps 25 27 28 29 30
LTRIM temps 1 3
LRANGE temps 0 -1
1) "27"
2) "28"
3) "29"
```

→ Giữ index 1-3, xoá còn lại.

### Pattern: circular buffer

```ts
async function addRecentItem(userId: string, itemId: string) {
  const key = `recent:user#${userId}`;
  await client.lPush(key, itemId);
  await client.lTrim(key, 0, 99);    // giữ 100 mới nhất
}
```

**Pattern phổ biến nhất** của LTRIM. Mỗi LPUSH có thể làm list dài; LTRIM giữ cap.

Atomic chuẩn: LPUSH và LTRIM tách 2 lệnh → có thể có race ngắn (list dài tạm). Dùng pipeline hoặc Lua nếu cần atomic:

```ts
await client.multi()
  .lPush(key, itemId)
  .lTrim(key, 0, 99)
  .exec();
```

### LTRIM xoá hết → key biến mất

```text
LTRIM temps 10 20      # nếu list chỉ có 5 elements → trim ra rỗng
EXISTS temps
(integer) 0
```

Same quirk.

## LINSERT — chèn vào giữa

```text
LINSERT key BEFORE|AFTER pivot element
```

Chèn `element` ngay **trước** hoặc **sau** giá trị `pivot` đầu tiên tìm thấy.

```text
RPUSH temps 25 27 30
LINSERT temps BEFORE 30 28
LRANGE temps 0 -1
1) "25"
2) "27"
3) "28"        # chèn trước 30
4) "30"
```

```text
LINSERT temps AFTER 27 26
LRANGE temps 0 -1
1) "25"
2) "27"
3) "26"        # chèn sau 27
4) "28"
5) "30"
```

- O(N) — phải traverse tới pivot.
- Pivot không có trong list → return -1, không lỗi.
- Trùng nhiều giá trị → chỉ chèn cạnh **giá trị đầu tiên** tìm thấy.

→ Use case hiếm. Khi cần "insert giữ thứ tự sorted", **Sorted Set** tốt hơn nhiều.

## LREM — xoá phần tử theo giá trị

```text
LREM key count element
```

Xoá copies của `element`:
- `count > 0`: xoá `count` copy đầu tiên (từ trái sang).
- `count < 0`: xoá `|count|` copy cuối (từ phải sang).
- `count = 0`: xoá **tất cả** copy.

```text
RPUSH list a b c a b c a

LREM list 2 a           # xoá 2 'a' từ trái
LRANGE list 0 -1        # → ['b', 'c', 'b', 'c', 'a']

LREM list -1 c          # xoá 1 'c' từ phải  
LRANGE list 0 -1        # → ['b', 'c', 'b', 'a']

LREM list 0 b           # xoá tất cả 'b'
LRANGE list 0 -1        # → ['c', 'a']
```

Return: số element thực sự bị xoá.

O(N).

### Use case

```ts
// Xoá user khỏi notification queue
await client.lRem(`notifications:${userId}`, 0, notificationId);
```

→ Khi cần xoá by value, không có index. Use case nhỏ.

## LPOS — tìm vị trí của value

```text
LPOS key element [RANK rank] [COUNT count] [MAXLEN maxlen]
```

```text
RPUSH list a b c a b c a
LPOS list a              # → 0 (lần đầu)
LPOS list b              # → 1
LPOS list missing        # → nil

LPOS list a RANK 2       # → 3 (lần thứ 2)
LPOS list a RANK 3       # → 6
LPOS list a RANK -1      # → 6 (lần cuối)

LPOS list a COUNT 3      # → [0, 3, 6] (3 lần đầu)
LPOS list a COUNT 0      # → [0, 3, 6] (tất cả)

LPOS list a MAXLEN 5     # tìm trong 5 element đầu
```

**Options**:
- **RANK**: lần thứ N (default 1, từ đầu). Negative = từ cuối.
- **COUNT**: trả mảng N vị trí (0 = tất cả).
- **MAXLEN**: giới hạn quét, không quét hết list.

Use case:
- Tìm "user X có ở vị trí nào trong queue?": LPOS waiting_list user_X.
- Đếm số copy: LPOS list val COUNT 0 → mảng.length.

## LMOVE — atomic move giữa 2 list

```text
LMOVE source destination LEFT|RIGHT LEFT|RIGHT
```

Lấy phần tử từ source (left/right) và đẩy vào destination (left/right). Atomic.

```text
RPUSH source a b c
LMOVE source dest LEFT RIGHT    # lấy 'a' từ source LEFT, push vào dest RIGHT
LRANGE source 0 -1              # → ['b', 'c']
LRANGE dest 0 -1                # → ['a']
```

### Use case: reliable queue

```ts
// Worker: pop từ jobs, đẩy vào processing
const job = await client.lMove('jobs', 'processing', 'LEFT', 'RIGHT');
if (job) {
  try {
    await processJob(job);
    await client.lRem('processing', 1, job);    // remove khi done
  } catch (e) {
    // job vẫn ở processing — recovery cron sẽ retry
  }
}
```

`LMOVE` atomic đảm bảo job không "mất" giữa pop và process (như BLPOP/RPOP có thể bị).

LMOVE replace `RPOPLPUSH` (deprecated từ 6.2).

### BLMOVE — blocking variant

```text
BLMOVE source dest LEFT RIGHT 0     # block đến khi source có element
```

Combine `LMOVE` với blocking semantics.

## LMPOP / BLMPOP — pop nhiều list cùng lúc (Redis 7+)

```text
LMPOP numkeys key [key ...] LEFT|RIGHT [COUNT count]
```

```text
LMPOP 2 list1 list2 LEFT COUNT 5
1) "list1"     # source
2) 1) "a"      # 5 elements từ list1
   2) "b"
   ...
```

Lấy từ list **đầu tiên không rỗng**. Hữu ích priority queue: list ưu tiên cao trước.

```ts
const result = await client.lmPop(['urgent', 'normal', 'low'], 'LEFT', { COUNT: 1 });
// → ưu tiên urgent, nếu rỗng thì normal, nếu rỗng thì low
```

## Tóm tắt các lệnh modify

| Lệnh | Tác dụng | Complexity | Note |
|---|---|---|---|
| `LSET` | Update tại index | O(N) | Hiếm dùng |
| `LTRIM` | Giữ range, xoá phần khác | O(N) | Circular buffer pattern |
| `LINSERT` | Chèn before/after pivot | O(N) | Hiếm — Sorted Set tốt hơn |
| `LREM` | Xoá theo value | O(N) | Khi cần xoá by content |
| `LPOS` | Tìm vị trí | O(N) | Có MAXLEN để giới hạn |
| `LMOVE` | Atomic move 2 list | O(1) | Reliable queue pattern |
| `LMPOP` | Pop priority queue | O(N) per check | Multi-list priority |

## Cảnh báo chung

Tất cả lệnh **O(N)** trên list lớn (>10k) **chặn event loop**. Tránh:
- `LSET` ở giữa list lớn.
- `LREM count=0` quét toàn bộ list lớn.
- `LRANGE 0 -1` trên list lớn.
- `LINSERT` với pivot ở cuối list lớn.

Best practice: **list trong production nên < 1000 element**. Nếu cần lớn hơn → Sorted Set, Stream, hoặc shard.

## Tóm tắt bài 3

- LSET, LTRIM, LINSERT, LREM, LPOS đều **O(N)** — dùng cẩn thận với list lớn.
- `LTRIM` + `LPUSH` = circular buffer (pattern phổ biến nhất).
- `LMOVE` atomic cho reliable queue.
- `LMPOP` cho priority queue (Redis 7+).
- Khi cần modify nhiều → cân nhắc data structure khác.

**Bài kế tiếp** → [Bài 4: Use cases của List — khi nào nên/không nên dùng](04-list-use-cases.md)
