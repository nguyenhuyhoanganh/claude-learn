# Bài 7: Làm việc với số — INCR, DECR, INCRBY và bài học về concurrency

Bề ngoài, `INCR` chỉ là "tăng số đếm thêm 1". Bài học sâu hơn là **vì sao Redis cần một lệnh dành riêng** cho việc này — câu trả lời mở ra cánh cửa hiểu cách Redis đảm bảo đúng đắn trong môi trường nhiều client. Đây là một trong những concept quan trọng nhất khi dùng Redis.

## Số trong Redis là string nhưng "có thể parse"

Như bài 2 đã đề cập:

```text
SET age 30
GET age           # "30"   ← string
TYPE age          # string
```

Khi bạn gọi lệnh số trên một string, Redis cố parse string thành integer/float:

```text
INCR age          # parse "30" → 30 → +1 → 31 → lưu lại "31"
GET age           # "31"
```

Nếu key trước đó không tồn tại, mọi lệnh số coi như **giá trị ban đầu = 0**:

```text
DEL counter
INCR counter      # (integer) 1
INCR counter      # (integer) 2
```

Nếu key chứa giá trị không phải số:

```text
SET name "Alice"
INCR name
(error) ERR value is not an integer or out of range
```

## Các lệnh số chính

| Lệnh | Tác dụng | Phạm vi |
|---|---|---|
| `INCR key` | +1 | integer 64-bit signed (~ ±9.2 × 10^18) |
| `DECR key` | −1 | integer |
| `INCRBY key delta` | +delta (có thể âm) | integer |
| `DECRBY key delta` | −delta | integer |
| `INCRBYFLOAT key delta` | ± delta cho số thực | float (IEEE 754 double, ~17 digit precision) |

```text
SET views 1000
INCR views               # 1001
INCRBY views 50          # 1051
DECR views               # 1050
DECRBY views 10          # 1040

SET price 19.99
INCRBYFLOAT price 5.0    # "24.99"
INCRBYFLOAT price -0.5   # "24.49"
```

### Đặc tính chung

- Mỗi lệnh là **atomic**.
- O(1).
- Tự tạo key với giá trị ban đầu 0 nếu chưa tồn tại.
- Lỗi nếu value không parse được số.
- `INCRBYFLOAT` lưu kết quả **dưới dạng string** (vd `"24.49"`), giữ độ chính xác cao hơn 32-bit float.

## "Tại sao phải có INCR? Tôi tự làm GET + +1 + SET được mà!"

Tự làm sai. Đây là **một trong những bài học quan trọng nhất** của khoá Redis.

### Cách "tự làm" (SAI)

```python
# Pseudocode — chương trình upvote
def upvote(post_id):
    current = int(redis.get(f"votes:{post_id}") or 0)
    new = current + 1
    redis.set(f"votes:{post_id}", new)
```

Chạy trên 1 server, đơn lẻ thì có vẻ ổn. Nhưng khi 2 client gọi `upvote(123)` cùng lúc:

```text
   API server 1                   Redis                  API server 2
   ─────────────                  ─────                  ─────────────
       │                                                       │
       │  GET votes:123  ─────→  [votes:123 = 20]              │
       │  ←─── "20" ──────────                                 │
       │                                                       │  GET votes:123
       │                                  ───────────────────→ │
       │                          ←──── "20" ─────────────     │
       │  (parse: 20)                                          │  (parse: 20)
       │  (compute: 21)                                        │  (compute: 21)
       │  SET votes:123 21 ────→ [votes:123 = 21]              │
       │  ←─── OK ────────                                     │
       │                                                       │  SET votes:123 21
       │                                  ───────────────────→ │
       │                          ←──── OK ────────────────    │
       │                                                       │
                          [votes:123 = 21]  ← cuối cùng
                          NHƯNG ĐÚNG PHẢI LÀ 22!
```

**2 vote nhưng chỉ đếm 1**. Đây là **race condition kinh điển**. Càng nhiều traffic, mất càng nhiều count.

### Cách đúng: dùng INCR

```python
def upvote(post_id):
    new = redis.incr(f"votes:{post_id}")
    return new
```

```text
   API server 1                   Redis                  API server 2
   ─────────────                  ─────                  ─────────────
       │  INCR votes:123 ─────→  [event loop xếp hàng]         │  INCR votes:123
       │                          [xử lý cmd 1: 20 → 21]       │
       │  ←─── 21 ────────                                     │
       │                          [xử lý cmd 2: 21 → 22]       │
       │                                  ───────────────────→ │
       │                          ←─── 22 ─────────────────    │
       │                                                       │
                          [votes:123 = 22]  ← ĐÚNG
```

Redis nhận 2 lệnh, xếp hàng, xử lý tuần tự. Mỗi `INCR` là **read-modify-write** trong **một bước duy nhất** không gián đoạn được — đó là định nghĩa của atomic.

### Lý do sâu hơn: Redis **single-threaded**

Tất cả lệnh đi qua **một event loop**. Hai lệnh tới "cùng lúc" sẽ được nhận theo thứ tự socket nào sẵn sàng trước, rồi **xử lý tuần tự**. Không có chuyện 2 lệnh chạy "song song" trên cùng 1 instance Redis.

→ Mọi lệnh built-in của Redis là **atomic so với các lệnh khác**. Đây là tính chất bạn không có với SQL DB (cần lock/MVCC để đạt cùng kết quả).

## Bài học tổng quát: tránh "lookup + modify + write"

Pattern sai phổ biến với bất kỳ data structure nào:

```python
val = redis.get(key)        # ← lúc này
# ... computation ...        # ← client khác có thể đổi val
redis.set(key, new_val)     # ← ghi đè dựa trên val cũ
```

**Cách tránh**:

1. **Dùng lệnh atomic chuyên dụng** — `INCR`/`DECR`/`INCRBY` cho số, `HINCRBY` cho hash field, `SADD`/`SREM` cho set, `ZADD ... INCR` cho sorted set, `LPUSH`/`RPUSH` cho list.

2. **Dùng `SET ... NX`** cho "ghi nếu chưa có" idempotent.

3. **Dùng `MULTI/EXEC` + `WATCH`** (optimistic locking) khi cần đọc + ghi với logic phức tạp:
   ```text
   WATCH votes:123                       # giám sát key
   val = GET votes:123                   # đọc
   MULTI                                 # bắt đầu transaction
   SET votes:123 <val+1>
   EXEC                                  # commit; nếu key thay đổi giữa WATCH/EXEC → fail
   ```
   Nếu EXEC trả `(nil)`, lặp lại từ WATCH.

4. **Lua script** (`EVAL`) — chạy logic atomic ở server side.

5. **Distributed lock** (`SET key val NX EX 30`) — khi cần quy mô business operation rộng hơn.

→ INCR là lựa chọn đơn giản nhất và an toàn nhất khi business operation chỉ là "tăng số".

## Các use case kinh điển của INCR

### 1. Counter — view, like, vote
```text
INCR views:post:7    # mỗi pageview
INCR likes:post:7
GET views:post:7     # tổng view
```

### 2. Rate limit theo cửa sổ thời gian
```python
def rate_limit(user, max_per_minute=60):
    bucket = f"rl:{user}:{int(time.time() // 60)}"
    n = redis.incr(bucket)
    if n == 1:
        redis.expire(bucket, 60)     # đặt TTL lần đầu
    if n > max_per_minute:
        raise RateLimitExceeded
```

Mỗi phút có một key riêng. Sau 60s key tự xoá. **Atomic** giữa client.

> Pattern này phổ biến tới mức Redis có lệnh "token bucket" trong module Redis Cell, hoặc trong các thư viện như `redis-rate-limiter`.

### 3. ID generator phân tán
```text
INCR seq:order        # → 1, 2, 3, ... mọi server đều an toàn
```

Cho ra ID tăng dần, atomic giữa nhiều server. Lưu ý: ID có thể skip khi `INCR` thành công nhưng kết quả không được consumer dùng (vì lỗi business). Không phải gap-free.

### 4. Counter hiệu suất (analytics theo phút/giờ/ngày)
```text
INCR stats:requests:2025-01-15:14    # request đến giờ thứ 14
```

Hash field counter cũng được:
```text
HINCRBY stats:2025-01-15 hour:14 1
```

### 5. Inventory đơn giản (giảm tồn kho khi đặt hàng)
```text
DECR stock:product:42    # trả về số mới
# Nếu < 0 → từ chối, INCR lại để hoàn
```

Trong production thực, dùng Lua + WATCH để đảm bảo "atomic decrement only if > 0".

## INCRBYFLOAT — cẩn thận với floating point

```text
SET price 0.1
INCRBYFLOAT price 0.2
"0.3"     # Redis làm đẹp output

SET price 0.1
INCRBYFLOAT price 0.2
INCRBYFLOAT price 0.2
INCRBYFLOAT price 0.2
"0.7"     # nhưng nội bộ có thể là 0.7000000000001
```

- Redis dùng `long double` ở server và serialize ra string.
- Đủ tốt cho counter, không đủ cho **tiền tệ** chính xác. Lưu tiền bằng **cent** (integer, dùng `INCRBY`) thay vì float.

## Overflow

`INCR` dùng signed 64-bit. Vượt ±9.2 × 10^18 → lỗi:

```text
SET n 9223372036854775806
INCR n              # 9223372036854775807
INCR n              # (error) ERR increment or decrement would overflow
```

Trong thực tế hiếm gặp (cần đếm 10^18 lần) nhưng cần biết.

## INCR với expiration

Khi đếm theo window, hay quên expire:

```python
# CHƯA TỐT — key sống mãi
redis.incr("rate:user:42")
```

```python
# TỐT — atomic incr + đảm bảo có TTL
key = "rate:user:42:m"
val = redis.incr(key)
if val == 1:                     # chỉ lần đầu tiên (key vừa tạo)
    redis.expire(key, 60)
```

> `SET key val EX 60` reset TTL mỗi lần ghi; với INCR thì TTL "dán" 1 lần ở lần đầu là pattern phổ biến.

Hoặc Lua script (atomic 2 lệnh):
```text
EVAL "local v = redis.call('INCR', KEYS[1]); if v == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end; return v" 1 rate:user:42:m 60
```

## Sai lầm hay gặp

1. **Tự code `GET + SET`** thay vì INCR → race condition khi traffic cao.
2. **Lưu tiền bằng float** (INCRBYFLOAT) → sai số tích luỹ. Lưu cent (integer).
3. **Không expire counter window** → key bùng nổ memory.
4. **INCR + EXPIRE riêng (không Lua/transaction)** trong loop → expire có thể thất bại nếu chỉ lần đầu, có thể set sai TTL. Pattern "if val == 1 then EXPIRE" trên đáp ứng đủ tốt cho rate limit.
5. **Quên check overflow trong INCRBY với delta lớn**.

## Lệnh số trong các kiểu khác

INCR có "anh em" cho các data structure khác:

| Cấu trúc | Lệnh tăng |
|---|---|
| Hash field | `HINCRBY key field delta` (int), `HINCRBYFLOAT key field delta` |
| Sorted set score | `ZINCRBY key delta member` |
| Bit field | `BITFIELD key INCRBY u8 #0 1` |
| String | `INCR`, `INCRBY`, `INCRBYFLOAT` |

Tất cả đều atomic.

## Tóm tắt bài 7

- `INCR`/`DECR`/`INCRBY`/`INCRBYFLOAT` là lệnh số **atomic, O(1), tự tạo key 0 nếu chưa có**.
- Tự code "GET + +1 + SET" = race condition. **Luôn dùng lệnh built-in atomic**.
- Lý do gốc: Redis **single-threaded event loop** → mỗi lệnh đơn = atomic.
- Use case: view counter, rate limit, ID generator, inventory, analytics.
- Lưu tiền bằng integer cent (không INCRBYFLOAT) để tránh sai số.
- TTL cho window counter: pattern `if val == 1 then EXPIRE` hoặc Lua atomic.
- "Lookup + modify + write" có nhiều cách thoát: lệnh atomic chuyên, `MULTI/WATCH`, Lua, distributed lock.

**Bài kế tiếp** → [Bài 8: Bài tập tổng kết và các bẫy thường gặp](08-bai-tap-va-loi-giai.md)
