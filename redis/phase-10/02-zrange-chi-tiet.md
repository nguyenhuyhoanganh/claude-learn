# Bài 2: ZRANGE chi tiết — index, score, lex, limit

`ZRANGE` là lệnh **dùng nhiều nhất** với Sorted Set. Nó thay thế ~5 lệnh cũ (`ZREVRANGE`, `ZRANGEBYSCORE`, `ZREVRANGEBYSCORE`, `ZRANGEBYLEX`) bằng một cú pháp thống nhất. Bài này đi sâu vào 4 mode + LIMIT + WITHSCORES.

## Cú pháp unified

```text
ZRANGE key start stop [BYSCORE | BYLEX] [REV] [LIMIT offset count] [WITHSCORES]
```

3 mode tách biệt qua cờ:

| Mode | Cờ | `start`/`stop` là gì |
|---|---|---|
| **Index** (mặc định) | (không có) | Vị trí 0-based |
| **By score** | `BYSCORE` | Min/max score |
| **By lex** | `BYLEX` | Min/max string (cho member cùng score) |

Cờ phụ:
- `REV` — đảo thứ tự sorted set trước khi áp dụng range.
- `LIMIT offset count` — pagination (chỉ với BYSCORE/BYLEX).
- `WITHSCORES` — trả kèm score (chỉ với mode trả member).

## Mode 1: BY INDEX (mặc định)

Sorted set:
```text
products → [
  (peanut_butter, -4.0),    # index 0
  (strawberry,     5.32),   # index 1
  (monitor,        45.0),   # index 2
  (keyboard,       50.0),   # index 3
  (cpu,            55.0),   # index 4
]
```

```text
ZRANGE products 0 2
1) "peanut_butter"
2) "strawberry"
3) "monitor"
```

→ Index 0, 1, 2 (inclusive both ends).

### Negative index

```text
ZRANGE products -2 -1
1) "keyboard"
2) "cpu"
```

→ 2 phần tử cuối. `-1` = phần tử cuối, `-2` = áp cuối.

```text
ZRANGE products 0 -1
```
→ Toàn bộ. (`-1` = cuối, từ 0 đến cuối = tất cả.)

### Với REV — đảo

```text
ZRANGE products 0 2 REV
1) "cpu"
2) "keyboard"
3) "monitor"
```

→ 3 phần tử có **score cao nhất**. Đây là cách lấy "top N" leaderboard.

### Với WITHSCORES

```text
ZRANGE products 0 -1 WITHSCORES
1) "peanut_butter"
2) "-4"
3) "strawberry"
4) "5.32"
5) "monitor"
6) "45"
...
```

Trả mảng phẳng [member, score, member, score, ...]. Client lib thường gộp thành `[{member, score}, ...]`.

## Mode 2: BY SCORE

```text
ZRANGE products 0 50 BYSCORE
1) "strawberry"     # score 5.32 ∈ [0, 50]
2) "monitor"        # score 45 ∈ [0, 50]
3) "keyboard"       # score 50 ∈ [0, 50]
```

`start`/`stop` là **min**/**max** score.

### Cú pháp range đặc biệt

| Cú pháp | Nghĩa |
|---|---|
| `0 50` | `[0, 50]` inclusive both |
| `(0 50` | `(0, 50]` exclude 0 |
| `0 (50` | `[0, 50)` exclude 50 |
| `(0 (50` | `(0, 50)` exclude both |
| `-inf 50` | `(-∞, 50]` |
| `50 +inf` | `[50, +∞)` |
| `-inf +inf` | `(-∞, +∞)` toàn bộ |

`(` đặt **trước số**, KHÔNG có closing paren. **Đây là quirk Redis riêng**, không phải toán học chuẩn.

### Với LIMIT

```text
ZRANGE products -inf +inf BYSCORE LIMIT 0 10
```

`LIMIT offset count`:
- `offset` — skip bao nhiêu.
- `count` — lấy bao nhiêu.

Tương đương SQL `LIMIT count OFFSET offset`.

```text
ZRANGE products -inf +inf BYSCORE LIMIT 0 5     # page 1 (5 phần tử đầu)
ZRANGE products -inf +inf BYSCORE LIMIT 5 5     # page 2
ZRANGE products -inf +inf BYSCORE LIMIT 10 5    # page 3
```

### Score cao xuống thấp

```text
ZRANGE products +inf -inf BYSCORE REV
```

`REV` cùng `BYSCORE` → đảo thứ tự ra **score giảm dần**. Note: thứ tự `+inf -inf` (ngược).

→ Top N theo score:
```text
ZRANGE products +inf -inf BYSCORE REV LIMIT 0 10 WITHSCORES
```

## Mode 3: BY LEX (lexicographic)

Khi **mọi member có cùng score**, có thể range theo thứ tự alphabet:

```text
ZADD users 0 alice 0 bob 0 charlie 0 david 0 eve

ZRANGE users "[b" "[d" BYLEX
1) "bob"
2) "charlie"
3) "david"
```

Cú pháp range cho LEX:
- `[a` — bao gồm "a" (inclusive).
- `(a` — không bao gồm "a" (exclusive).
- `-` — minimum string (trước mọi string).
- `+` — maximum string (sau mọi string).

```text
ZRANGE users - + BYLEX                 # toàn bộ theo thứ tự alphabet
ZRANGE users "[c" + BYLEX              # từ "c" trở đi
ZRANGE users - "(d" BYLEX              # đến trước "d"
```

### Use case BYLEX: autocomplete

```text
ZADD autocomplete 0 apple 0 application 0 banana 0 band 0 cat

ZRANGE autocomplete "[app" "[app\xff" BYLEX
1) "apple"
2) "application"
```

Tất cả từ bắt đầu bằng "app". `\xff` (byte tối đa) làm upper bound — chặn ở "apz...".

→ Search prefix O(log N). Hữu ích cho search bar gợi ý.

> Lưu ý: mọi member phải có **cùng score** (thường = 0). Score khác → sort theo score trước, lex sau, kết quả không như mong đợi.

## ZRANGESTORE — lưu kết quả vào key mới

Redis 6.2+:

```text
ZRANGESTORE dest source 0 10 REV
```

Lấy top 10 của `source`, lưu vào `dest` (sorted set mới với cùng member+score).

Use case: pre-compute top 100 leaderboard, cache 1 phút:

```ts
await client.zRangeStore('cache:top:100', 'leaderboard', 0, 99, { REV: true });
await client.expire('cache:top:100', 60);
```

App đọc `cache:top:100` instant không cần tính top mỗi request.

## ZRANK và ZREVRANK

```text
ZRANK products keyboard
(integer) 3            # index 3 (score thấp → cao)

ZREVRANK products keyboard
(integer) 1            # index 1 từ cuối lên (score cao → thấp)
```

Use case: "Tôi đang xếp thứ mấy trong leaderboard?":
```text
ZREVRANK leaderboard user#alice
```

`(integer) 0` = đỉnh bảng. `(integer) 9` = thứ 10. `(nil)` = chưa có trong sorted set.

### ZRANK WITHSCORE (Redis 7.2+)

```text
ZRANK products keyboard WITHSCORE
1) (integer) 3
2) "50"
```

Tiết kiệm 1 RTT nếu cần cả rank và score.

## ZRANGEBYSCORE — deprecated nhưng còn gặp

Code cũ dùng:

```text
ZRANGEBYSCORE products 0 50 WITHSCORES
ZREVRANGEBYSCORE products 50 0 WITHSCORES
```

Tương đương:

```text
ZRANGE products 0 50 BYSCORE WITHSCORES
ZRANGE products 50 0 BYSCORE REV WITHSCORES
```

Redis vẫn hỗ trợ cú pháp cũ. **Code mới nên dùng `ZRANGE` unified**.

## Pagination — pattern thực tế

```ts
async function getTopProducts(page: number, perPage = 10) {
  const offset = (page - 1) * perPage;
  return await client.zRange('products', '+inf', '-inf', {
    BY: 'SCORE',
    REV: true,
    LIMIT: { offset, count: perPage },
    WITHSCORES: true,
  });
}
```

App e-commerce: page 1 = top 10 hot nhất, page 2 = 11-20, ...

Stable ordering: thứ tự giữa các page nhất quán nếu data không đổi (cùng score).

### Quirk: pagination với data đổi

Nếu data sorted set thay đổi giữa page 1 và page 2 (vd có item mới được like → score tăng → nhảy lên page 1), user có thể thấy **trùng** hoặc **bỏ sót** item.

Mitigation:
- Snapshot bằng `ZRANGESTORE` → page từ snapshot.
- Hoặc cursor-based với last seen score.
- Hoặc chấp nhận: blog comment, real-time feed thường có "tốc độ chậm" page → ít vấn đề.

## Hiệu năng

| Operation | Complexity |
|---|---|
| `ZADD` | O(log N) |
| `ZSCORE` | O(1) |
| `ZRANK` / `ZREVRANK` | O(log N) |
| `ZRANGE BYINDEX 0 K` | O(log N + K) |
| `ZRANGE BYSCORE` | O(log N + K) |
| `ZINCRBY` | O(log N) |
| `ZCOUNT` | O(log N) |

→ Mọi operation **scale tốt** với sorted set lớn. Sorted set 10M phần tử vẫn `ZRANGE 0 10` trong vài μs.

So sánh: SQL `SELECT ORDER BY ... LIMIT 10` trên bảng 10M row cần index — và vẫn chậm hơn Redis với độ trễ ms.

## Tóm tắt bài 2

- `ZRANGE` (Redis 6.2+) gộp 5 lệnh cũ thành 1 với mode `BYSCORE`/`BYLEX`, `REV`, `LIMIT`, `WITHSCORES`.
- Cú pháp range độc đáo: `(50` exclude, `-inf`/`+inf`, `[a`/`(a` cho lex.
- LIMIT cho pagination — giống SQL `LIMIT/OFFSET`.
- `ZRANGESTORE` cache kết quả top-N.
- Mọi operation O(log N + K) — scale rất tốt.

**Bài kế tiếp** → [Bài 3: ZINCRBY và update score — leaderboard real-time](03-zincrby-leaderboard.md)
