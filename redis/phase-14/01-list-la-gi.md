# Bài 1: List là gì — kiểu dữ liệu thứ 7

**List** = chuỗi string có thứ tự, có thể trùng. Đây là kiểu thứ 7 và cũng là **kiểu cuối** trong nhóm "core data types" của Redis. Bài này giải thích List, vì sao nó **ít dùng hơn** bạn nghĩ, khi nào thật sự cần.

## List trong Redis là gì?

> **List** = chuỗi string có thứ tự (ordered), có thể trùng (allows duplicates), 2 đầu mở (insert/remove cả 2 đầu O(1)).

```text
temps → [ 25, 27, 25, 30, 24 ]
         left           right
```

- Phần tử mới có thể vào **bên trái** (LPUSH) hoặc **bên phải** (RPUSH).
- Truy cập **index** được (O(N) ở giữa).
- **Cho phép trùng** — khác Set.

## Không phải Array — là Linked List

Internal: **quicklist** = doubly linked list of listpack nodes.

→ Operation chính của linked list:
- Push/pop 2 đầu: **O(1)**.
- Access middle index: **O(N)**.
- Range query: **O(N)** với N = số phần tử bị skip + lấy ra.

**Đây là điểm KHÁC array** mà nhiều người tưởng giống.

```text
LRANGE temps 0 10     # O(11) — nhanh
LRANGE temps 1000 1010 # O(1011) — chậm nếu list lớn
LINDEX temps 5000     # O(5000) — chậm
```

→ List **xấu cho random access** trên list lớn.

## So với Sorted Set

| | List | Sorted Set |
|---|---|---|
| Thứ tự | Insertion order | Score order |
| Duplicate | ✓ | ✗ |
| Insert | O(1) ở 2 đầu | O(log N) |
| Access middle | O(N) | O(log N) |
| Range top N | O(N) | O(log N + N) |
| Memory | Nhỏ hơn ~20% | Hơi nặng do skip list |

→ **Sorted Set thắng cho query top N** dù tốn memory hơn. List chỉ thắng khi:
- Cần duplicate.
- Chỉ thao tác 2 đầu (queue, stack).
- Không cần sort theo criterion.

## Sự thật về List — ít dùng hơn bạn nghĩ

Khi mới học Redis, nhiều người thấy List → nghĩ "list = mặc định cho collection". Sai. Trong production:

| Use case | Sai → Đúng |
|---|---|
| Top N recent posts | ~~LRANGE 0 N~~ → **Sorted Set** với score = timestamp |
| Queue/job | LPUSH/RPOP OK nhưng → **Stream** tốt hơn cho persistence |
| Recent items per user | List OK → **Sorted Set** ưu hơn vì có thể range query |
| Bid history | List OK → **Sorted Set** với score = bid amount |
| Activity log | ~~LPUSH~~ → **Stream** (XADD) — có ID và consumer group |
| Cache list | List OK | List OK |

→ List là **legacy** trong nhiều trường hợp. Pre-2017 (trước khi có Stream), List dùng làm queue, fanout, pub-sub buffer. Giờ Stream tốt hơn hầu hết.

**Khi nào List vẫn ổn**:
- Đơn giản, ít quan tâm performance.
- Workload chỉ push/pop 2 đầu.
- Cần preserve duplicates.

## Lệnh tổng quan

Mọi lệnh List bắt đầu bằng **`L`** (left) hoặc **`R`** (right):

```text
LPUSH    RPUSH       LPOP      RPOP        LRANGE      LLEN
LINDEX   LSET        LINSERT   LREM        LTRIM       LPOS
LPUSHX   RPUSHX      RPOPLPUSH (deprecated) LMOVE
BLPOP    BRPOP       BLMOVE   LMPOP (≥ 7.0) BLMPOP
```

~15 lệnh. Sẽ học chính ở bài 2-4.

## LPUSH / RPUSH

```text
LPUSH key element [element ...]
RPUSH key element [element ...]
```

```text
LPUSH temps 25
(integer) 1            # length sau push

RPUSH temps 27
(integer) 2

LRANGE temps 0 -1
1) "25"
2) "27"
```

LPUSH thêm vào đầu (left), RPUSH thêm vào cuối (right).

**Multi-element**: LPUSH temps 25 26 27 → đẩy lần lượt → cuối cùng list = [27, 26, 25] (vì mỗi LPUSH đẩy 25 trước, rồi 26, rồi 27 vào đầu).

```text
DEL temps
LPUSH temps 25 26 27
LRANGE temps 0 -1
1) "27"
2) "26"
3) "25"
```

→ Cẩn thận **thứ tự** với multi-element LPUSH.

## LRANGE

```text
LRANGE key start stop
```

Lấy range theo **index** (0-based, inclusive both ends).

```text
LRANGE temps 0 2          # 3 phần tử đầu
LRANGE temps 0 -1         # toàn bộ
LRANGE temps -3 -1        # 3 phần tử cuối
LRANGE temps 1 1          # chỉ phần tử index 1
```

`-1` = phần tử cuối. Negative index đếm từ cuối.

**Quan trọng**: với list lớn, **`LRANGE 0 -1` chặn server**. Tránh.

## LLEN

```text
LLEN temps
(integer) 5
```

O(1). Redis lưu cached length.

## LINDEX

```text
LINDEX temps 0       # phần tử đầu
LINDEX temps -1      # phần tử cuối
LINDEX temps 100     # nil nếu out-of-range
```

O(N). Slow với list lớn ở vị trí giữa.

## Encoding nội bộ — quicklist + listpack

List nhỏ: **listpack** = mảng nén liên tục. Memory siêu gọn.

List lớn: **quicklist** = doubly linked list của listpack nodes. Combine memory efficiency (listpack) với O(1) ở 2 đầu (linked list).

Cấu hình:
```conf
list-max-listpack-size -2       # mỗi node tối đa 8 KB
list-compress-depth 0           # nén nodes ở giữa (0 = không nén)
```

→ Bạn không cần care chi tiết. Redis tự xử lý.

## Use case đúng cho List

### 1. Queue đơn giản (job, task)

```ts
// Producer
await client.lPush('jobs', JSON.stringify({ type: 'send_email', userId: 42 }));

// Worker
const job = await client.rPop('jobs');
if (job) processJob(JSON.parse(job));
```

Pattern này phổ biến tới mức nhiều thư viện (Bull, Sidekiq) build trên list. **Nhưng Stream tốt hơn** cho ack/retry/multiple consumer.

### 2. Recent items với limit

```ts
await client.lPush('recent:user#42', JSON.stringify(post));
await client.lTrim('recent:user#42', 0, 99);    // giữ 100 phần tử mới nhất
```

LPUSH + LTRIM atomic-ish. List dùng được ở case này.

### 3. Bid history (sẽ làm phase này)

```ts
await client.rPush(`bids:item#${itemId}`, JSON.stringify({ userId, amount, time }));
```

Append-only log. List OK. Nhưng Sorted Set với score = bidAmount cũng đủ và cho range query.

## Tóm tắt bài 1

- List = ordered string với duplicates, push/pop 2 đầu O(1).
- Internal: doubly linked list + listpack nodes. **Không phải array**.
- Ít dùng hơn nghĩ trong production — Sorted Set / Stream thường tốt hơn.
- Hữu ích cho: simple queue, recent items với limit, append-only log.
- Lệnh bắt đầu bằng `L` hoặc `R`. ~15 lệnh.

**Bài kế tiếp** → [Bài 2: LPUSH/RPUSH/LRANGE — read & write cơ bản](02-lpush-rpush-lrange.md)
