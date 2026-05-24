# Bài 1: Sorted Set là gì — kiểu mạnh nhất của Redis

Đến **Sorted Set** — kiểu thứ 5, và là **kiểu mạnh nhất, linh hoạt nhất** Redis có. Đây là cấu trúc giải các bài toán mà 4 kiểu trước không làm được: leaderboard real-time, queue ưu tiên, time-series indexing, range query theo score.

Hiểu Sorted Set = mở khoá ~50% sức mạnh thực sự của Redis trong production.

## Sorted Set là gì?

> **Sorted Set** = một **set của member** (string không trùng), mỗi member có một **score** (số), tự sắp xếp theo score tăng dần.

```text
products → [
  (peanut_butter, -4.0),
  (monitor,        45.0),
  (keyboard,       50.0),
  (cpu,            55.0),
  (strawberry,      5.32),
]
```

Hai mặt:
- **Như Set**: member không trùng, có thể `ZADD` lần 2 không tạo bản sao.
- **Như Hash**: mỗi member có "value" — gọi là **score**, bắt buộc là số.
- **Khác cả hai**: tự sắp xếp theo score.

Score có thể là:
- Số nguyên (positive, negative, 0).
- Số thực (float).
- `+inf`, `-inf` (infinity).

**Member là string, score là double**. Mỗi member có **một score duy nhất** trong sorted set.

## So sánh với Set và Hash

| | Set | Hash | Sorted Set |
|---|---|---|---|
| Phần tử | string | field+value | member+score |
| Không trùng | ✓ | (field unique) | ✓ |
| Thứ tự | Không | Không | **Theo score** |
| Score là gì | — | string (value) | **double** |
| ADD | O(1) | O(1) | **O(log N)** |
| Get top N | — | — | **O(log N + N)** |

→ Trade-off: thêm chi phí log N cho insert, nhưng có **truy vấn theo thứ tự** rất mạnh.

## Cấu trúc nội bộ — skip list

Sorted Set dùng kết hợp:
1. **Hash table** map member → score (cho `ZSCORE`, `ZRANK` O(log N) lookup).
2. **Skip list** sắp xếp theo score (cho range query).

Skip list = mảng linked-list nhiều tầng, mỗi tầng "skip" qua nhiều phần tử. Cho phép tìm kiếm và insert O(log N) như balanced tree, nhưng đơn giản hơn để implement.

```text
Tầng 3: HEAD ───────────────────────────► CPU(55) ───────► NULL
Tầng 2: HEAD ───────► KEYBOARD(50) ────► CPU(55) ────────► NULL
Tầng 1: HEAD ─► MON(45) ─► KEY(50) ─► CPU(55) ─► POWER(60) ► NULL
```

Operation:
- `ZADD`: O(log N).
- `ZSCORE`: O(1) (qua hash table).
- `ZRANGE`: O(log N + K) với K = số phần tử trả về.
- `ZRANK`: O(log N).

## Khi nào dùng Sorted Set?

3 dấu hiệu chính:

1. **Cần thứ tự** — leaderboard, ranking, top-N.
2. **Score có ý nghĩa** — điểm, timestamp, ưu tiên, giá.
3. **Cần range query theo score** — "users điểm 100-500", "events trong 24h tới".

Use case kinh điển:

| Use case | Score là gì |
|---|---|
| Leaderboard game | Điểm |
| Trending posts | View count hoặc engagement score |
| Time-based feed | Timestamp |
| Priority queue | Priority value |
| Schedule jobs | Unix timestamp khi chạy |
| Auto-complete với ranking | Frequency hoặc popularity |
| Rate limit "sliding window" | Timestamp |

## Lệnh tổng quan — bắt đầu bằng `Z`

Tất cả lệnh Sorted Set bắt đầu bằng **`Z`** (zet sorted):

```text
ZADD       ZREM       ZSCORE     ZINCRBY
ZRANGE     ZREVRANGE  ZRANGEBYSCORE        ZREVRANGEBYSCORE
ZRANK      ZREVRANK
ZCARD      ZCOUNT     ZLEXCOUNT
ZPOPMIN    ZPOPMAX    BZPOPMIN   BZPOPMAX
ZUNIONSTORE   ZINTERSTORE   ZDIFFSTORE
ZRANGESTORE
ZSCAN
ZMPOP (≥ 7.0)
```

~25 lệnh — nhiều nhất trong các kiểu Redis. Bài 2-3 sẽ học chi tiết.

## ZADD — thêm member-score

```text
ZADD key score member [score member ...]
```

**Quan trọng**: thứ tự là `score member`, KHÔNG phải `member score`. Dễ nhầm vì các kiểu khác (Hash) là `field value`.

```text
ZADD products 45 monitor
(integer) 1

ZADD products 50 keyboard 55 cpu 60 power
(integer) 3            # 3 phần tử mới
```

**Return value**: số phần tử **mới được thêm** (không tính update score).

```text
ZADD products 99 monitor     # monitor đã có, update score
(integer) 0                   # 0 mới được thêm

ZSCORE products monitor
"99"
```

### Option của ZADD

```text
ZADD key [NX|XX|GT|LT] [CH] [INCR] score member ...
```

- `NX` — chỉ thêm member chưa có (không update existing).
- `XX` — chỉ update member đã có (không thêm mới).
- `GT` — chỉ update nếu score mới > score hiện tại (gia tăng).
- `LT` — chỉ update nếu score mới < score hiện tại.
- `CH` — return số phần tử thay đổi (cả thêm và update) thay vì chỉ thêm.
- `INCR` — tăng score (giống ZINCRBY).

Use case `GT`:
```text
ZADD highscore:user#alice GT 200 game_1    # chỉ update nếu score > hiện tại
```
→ Leaderboard không bao giờ tụt điểm.

## ZSCORE — lấy score của member

```text
ZSCORE products keyboard
"50"          # string!
```

Score trả về dạng **string** (nhắc lại quirk Redis: mọi số lưu là string). Client phải `parseFloat`.

O(1).

## ZREM — xoá member

```text
ZREM products monitor
(integer) 1            # 1 xoá thật sự

ZREM products nonexistent
(integer) 0
```

O(log N) per member.

## ZINCRBY — tăng/giảm score

```text
ZINCRBY products 15 keyboard
"65"          # score mới sau khi +15

ZINCRBY products -10 cpu
"45"
```

Atomic. Lý tưởng cho **counter** với side effect "tự sắp xếp":

```text
ZINCRBY trending:posts 1 post#42
```

Mỗi like → score tăng → post tự lên đầu leaderboard. Real-time.

## ZCARD — đếm member

```text
ZCARD products
(integer) 3
```

O(1).

## ZCOUNT — đếm member trong khoảng score

```text
ZCOUNT products 0 50
(integer) 2            # member có score trong [0, 50]
```

O(log N).

Cú pháp range:
- `0 50` — `[0, 50]` (inclusive cả hai đầu).
- `(0 50` — `(0, 50]` (open zero).
- `0 (50` — `[0, 50)` (open 50).
- `(0 (50` — `(0, 50)` (open cả hai).
- `-inf +inf` — toàn bộ.
- `100 +inf` — score ≥ 100.

Open parenthesis `(` đặt **trước số**, KHÔNG có closing paren. Quy ước Redis riêng.

## ZRANGE — lấy member theo index

```text
ZRANGE products 0 2
1) "keyboard"
2) "cpu"
3) "power"
```

Index 0-based, **bao gồm cả end**. `0 -1` = toàn bộ.

```text
ZRANGE products 0 -1 WITHSCORES
1) "keyboard"
2) "50"
3) "cpu"
4) "55"
5) "power"
6) "60"
```

`WITHSCORES` để trả kèm score.

## ZRANGE BYSCORE — lấy theo score

```text
ZRANGE products 0 55 BYSCORE
1) "keyboard"
2) "cpu"
```

Khi có `BYSCORE`, 2 số là **min** và **max** thay vì index.

```text
ZRANGE products -inf +inf BYSCORE WITHSCORES LIMIT 0 10
```

`LIMIT offset count` để pagination — tương tự SQL `LIMIT/OFFSET`.

## ZRANGE REV — đảo ngược

```text
ZRANGE products 0 2 REV
1) "power"
2) "cpu"
3) "keyboard"
```

Đảo thứ tự sorted set, rồi lấy index. → Top N theo score giảm dần.

> Trước Redis 6.2 có `ZREVRANGE`, `ZRANGEBYSCORE`, `ZREVRANGEBYSCORE` — giờ deprecated, gộp vào `ZRANGE` với option `BYSCORE`, `REV`, `LIMIT`.

## ZRANK — vị trí của member

```text
ZRANK products keyboard
(integer) 0            # index 0 (lowest score)

ZRANK products power
(integer) 2

ZRANK products nonexistent
(nil)
```

`ZREVRANK` cho rank từ cuối (highest score → 0).

## ZPOPMIN / ZPOPMAX — lấy & xoá

```text
ZPOPMIN products
1) "keyboard"
2) "50"

ZPOPMAX products 2
1) "power"
2) "60"
3) "cpu"
4) "55"
```

Lấy phần tử có score thấp/cao nhất + xoá khỏi set. Atomic.

Use case: priority queue. Mỗi `ZPOPMIN` lấy job ưu tiên cao nhất (score nhỏ = priority cao).

## Tính chất quan trọng

1. **Member unique** (như Set). Add lại = update score.
2. **Score là double** (IEEE 754) — chính xác ~15-17 chữ số có nghĩa.
3. **Multiple member cùng score OK** — sort theo lex string trong cùng score.
4. **Atomic mọi lệnh đơn**.
5. **Memory** ~ 100 byte / entry (heavy hơn Set ~30 byte, Hash field ~60 byte).

## Tóm tắt bài 1

- Sorted Set = Set + score, tự sắp xếp theo score.
- Lệnh bắt đầu bằng `Z`, ~25 lệnh.
- Cú pháp `ZADD key score member` (score TRƯỚC member).
- Internals: skip list + hash table → O(log N) insert, O(1) score lookup.
- Use case: leaderboard, time-feed, priority queue, range query.
- ZRANGE thống nhất (Redis 6.2+) gộp BYSCORE, REV, LIMIT — cú pháp linh hoạt.

**Bài kế tiếp** → [Bài 2: ZRANGE chi tiết — index, score, lex, limit](02-zrange-chi-tiet.md)
