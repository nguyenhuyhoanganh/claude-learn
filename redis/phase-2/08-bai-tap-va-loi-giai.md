# Bài 8: Bài tập tổng kết & các bẫy thường gặp

Bài cuối phase-2 — củng cố mọi lệnh String đã học, thực hành các pattern thường gặp, và đặt tên cụ thể cho các bẫy mà nhiều người mới mắc.

## Phần 1 — Bài tập cơ bản

### Bài tập 1

> Lưu chuỗi `Toyota` vào key `car`.

<details>
<summary>Giải</summary>

```text
SET car Toyota
OK

GET car
"Toyota"
```
</details>

### Bài tập 2

> Lưu chuỗi `triangle` vào key `shape`, **chỉ khi** key `shape` chưa có giá trị.

<details>
<summary>Giải</summary>

```text
SET shape triangle NX
OK            # lần đầu

SET shape circle NX
(nil)         # lần sau: key đã có, không ghi

GET shape
"triangle"
```

Hoặc lệnh cũ tương đương: `SETNX shape triangle` — nhưng khuyến cáo dùng `SET ... NX`.
</details>

### Bài tập 3

> Lưu chuỗi `Today's headlines` vào key `news`, **tự xoá sau 3 giây**.

<details>
<summary>Giải</summary>

```text
SET news "Today's headlines" EX 3
OK

GET news
"Today's headlines"

# Sau 3 giây:
GET news
(nil)
TTL news
(integer) -2
```

Lưu ý:
- Quote dấu nháy đôi bao ngoài vì giá trị chứa dấu nháy đơn (`'`).
- Có thể thay `EX 3` bằng `PX 3000` (millisecond).
</details>

## Phần 2 — Bài tập áp dụng

### Bài tập 4: Cache với refresh đúng

> Implement hàm `get_product(id)`: nếu có cache `product:{id}` trả về luôn; nếu không, query "DB" (giả lập), set cache với TTL 60s, trả về. Khi update product, **xoá** cache.

<details>
<summary>Giải</summary>

```python
import json

def get_product(id):
    cached = redis.get(f"product:{id}")
    if cached is not None:
        return json.loads(cached)

    product = db_query(id)              # SELECT * FROM products WHERE id = ?
    if product is None:
        return None
    redis.set(f"product:{id}", json.dumps(product), ex=60)
    return product

def update_product(id, new_data):
    db_update(id, new_data)
    redis.delete(f"product:{id}")        # invalidate
```

**Cải tiến**: dùng `EX 60` + jitter (random ±10s) để tránh stampede.

```python
import random
redis.set(f"product:{id}", json.dumps(product), ex=60 + random.randint(-10, 10))
```
</details>

### Bài tập 5: Rate limit 60 request / phút / user

> Một user (id) không được gọi quá 60 lần trong một phút.

<details>
<summary>Giải</summary>

```python
import time

def allow(user_id, max_per_minute=60):
    bucket = f"rl:{user_id}:{int(time.time() // 60)}"
    n = redis.incr(bucket)
    if n == 1:
        redis.expire(bucket, 60)
    return n <= max_per_minute
```

Hoặc dùng Lua để atomic INCR + EXPIRE:

```python
LUA = """
local n = redis.call('INCR', KEYS[1])
if n == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return n
"""
def allow(user_id, max_per_minute=60):
    bucket = f"rl:{user_id}:{int(time.time() // 60)}"
    n = redis.eval(LUA, 1, bucket, 60)
    return n <= max_per_minute
```

**Bẫy hay gặp**: code "set bucket = 0 nếu chưa có, rồi INCR". Sai vì có race condition. Pattern `INCR + EXPIRE-once` là đúng.
</details>

### Bài tập 6: Distributed lock với owner verification

> Viết acquire/release lock cho resource X. Acquire phải atomic, release phải verify owner để không "release nhầm lock của người khác".

<details>
<summary>Giải</summary>

```python
import uuid

def acquire(resource, ttl=30):
    owner = str(uuid.uuid4())
    ok = redis.set(f"lock:{resource}", owner, nx=True, ex=ttl)
    return owner if ok else None

RELEASE_LUA = """
if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
else
    return 0
end
"""

def release(resource, owner):
    return redis.eval(RELEASE_LUA, 1, f"lock:{resource}", owner) == 1

# Cách dùng
owner = acquire("order:1234")
if owner is None:
    raise BusyError
try:
    do_work()
finally:
    release("order:1234", owner)
```

**Vì sao cần Lua khi release?** Nếu chỉ `GET` rồi `DEL`, giữa hai lệnh khoảng trống → lock có thể đã expire và worker khác đã chiếm. Bạn lỡ tay DEL lock của họ.
</details>

### Bài tập 7: ID generator gap-free?

> `INCR seq:order` tạo ID 1, 2, 3, .... Có gap-free không?

<details>
<summary>Giải</summary>

**Không gap-free**. INCR luôn atomic trả về ID mới, nhưng:

- Nếu client crash sau khi nhận ID mà chưa dùng → ID bị "mất".
- Nếu Redis restart và mất phiên bản chưa snapshot xong → counter có thể tụt lại (nếu không AOF appendfsync always).

Nếu cần ID **gap-free, monotonic, không trùng**: phải có hệ thống thiết kế cho việc đó (Snowflake ID, DB sequence với commit pattern). Redis INCR thích hợp cho ID "unique, tăng dần, không cần liên tục".
</details>

## Phần 3 — Các bẫy thường gặp ("Redis Gotchas")

### Bẫy 1: SET ghi đè TTL

```text
SET cache:x val1 EX 60
TTL cache:x          # 58

# Code đâu đó refresh value:
SET cache:x val2     # KHÔNG kèm EX

TTL cache:x          # -1   ← TTL biến mất!
```

→ Cache giờ "vĩnh viễn", chiếm memory. Sử dụng `KEEPTTL` hoặc nhớ luôn truyền `EX` lại.

### Bẫy 2: KEYS * trên prod

```text
KEYS user:*          # quét toàn bộ keyspace
```

Với 10 triệu key → có thể chặn server **vài giây**. Mọi client khác bị treo. Dùng `SCAN`:

```text
SCAN 0 MATCH user:* COUNT 100
```

Lặp với cursor mới nhận được, đến khi cursor về 0.

### Bẫy 3: INCRBYFLOAT cho tiền tệ

```text
SET balance 100.00
INCRBYFLOAT balance 0.10
INCRBYFLOAT balance 0.10
INCRBYFLOAT balance 0.10
...
```

Sau nhiều lần, sai số float tích luỹ. Lưu tiền bằng integer (cent):

```text
SET balance_cents 10000
INCRBY balance_cents 10
```

### Bẫy 4: Race condition tự code

```python
# SAI
count = redis.get("counter") or 0
redis.set("counter", int(count) + 1)
```

→ Mất count khi nhiều client. Dùng `INCR`.

### Bẫy 5: Hash tag trong Cluster

```text
MSET user:1:name Alice user:1:role admin
# Trong Cluster: CROSSSLOT error
```

→ Phải dùng hash tag: `user:{1}:name`.

### Bẫy 6: Cache stampede

100k user truy cập cache hot vừa expire → 100k miss → đập DB cùng lúc. Mitigation:
- TTL jitter.
- Background refresh trước khi expire.
- Lock: chỉ 1 worker rebuild cache (`SET ... NX EX`).

Sẽ học chi tiết phase-3.

### Bẫy 7: FLUSHALL trên dev gõ nhầm vào prod console

Đã có ca thật. Để phòng:
- Đặt biến `rename-command FLUSHALL ""` trong redis.conf để vô hiệu hoá.
- Hoặc đổi tên lệnh: `rename-command FLUSHALL "FLUSH_AAAA_BBBB"`.
- Dùng ACL để giới hạn user nào được dùng FLUSH/CONFIG.

### Bẫy 8: Quên TTL cho counter window

```python
# Rate limit hỏng vì key sống mãi:
redis.incr(f"rl:user:42:{minute}")
```

→ Sau 1 tháng, hàng triệu key counter cũ chiếm memory. **Luôn** đặt TTL cho key tạm thời.

### Bẫy 9: Lưu binary thông qua redis-cli không cẩn thận

Khi paste byte raw vào terminal, escape có thể sai. Dùng `redis-cli -x` (đọc value từ stdin), hoặc gửi từ code lib.

### Bẫy 10: SETRANGE với offset rất lớn

```text
SETRANGE empty 1000000 "x"
```

→ Tạo string 1 MB ngay lập tức (pad zero). Cẩn thận với SETBIT/SETRANGE ở offset cao.

## Phần 4 — Checklist trước khi triển khai feature dùng String

Trước khi `SET`/`GET` chính thức vào production:

- [ ] **Đặt tên key có namespace** (`feature:entity:id`).
- [ ] **Quyết định TTL** phù hợp với loại data (cache, session, lock, persistent).
- [ ] **Plan invalidate**: khi update source, làm sao cache đồng bộ?
- [ ] **Atomic logic**: dùng `INCR`, `SET ... NX`, hoặc Lua khi cần.
- [ ] **Cluster compatibility**: hash tag nếu cần MSET/MGET cùng entity.
- [ ] **Memory footprint**: ước tính (số key × kích thước value) ≤ memory budget.
- [ ] **Eviction policy** phù hợp (`allkeys-lru` cho cache, `volatile-*` cho mix).
- [ ] **Monitoring**: TTL còn nhiêu, hit ratio, evicted keys.

## Phần 5 — Quick reference các lệnh String đã học

```text
─── Cơ bản ───
SET key value [NX|XX] [GET] [EX|PX|EXAT|PXAT|KEEPTTL]
GET key
EXISTS key [key ...]
DEL key [key ...]
UNLINK key [key ...]
TYPE key

─── Multi ───
MSET k1 v1 k2 v2 ...
MSETNX k1 v1 k2 v2 ...
MGET k1 k2 ...

─── String ops ───
APPEND key value
STRLEN key
GETRANGE key start end      (cũ: SUBSTR)
SETRANGE key offset value

─── Số ───
INCR key
DECR key
INCRBY key delta
DECRBY key delta
INCRBYFLOAT key delta

─── Bit ───
SETBIT key offset 0|1
GETBIT key offset
BITCOUNT key [start end [BYTE|BIT]]
BITOP AND|OR|XOR|NOT dest src [src ...]
BITPOS key 0|1 [start [end [BYTE|BIT]]]
BITFIELD key OP type #idx ...

─── TTL ───
EXPIRE key seconds [NX|XX|GT|LT]
PEXPIRE key millis [NX|XX|GT|LT]
EXPIREAT key unix-secs
PEXPIREAT key unix-ms
TTL key
PTTL key
EXPIRETIME key              (≥ 7.0)
PEXPIRETIME key             (≥ 7.0)
PERSIST key

─── Cũ / deprecated nhưng có thể gặp ───
SETEX key seconds value     ≡ SET key value EX seconds
PSETEX key ms value         ≡ SET key value PX ms
SETNX key value             ≡ SET key value NX  (không có TTL)
GETSET key value            ≡ SET key value GET (≥ 6.2)
```

## Tóm tắt phase-2

Đã học:
- Mô hình key-value, 10+ data type, namespace.
- SET/GET, các option (NX, XX, GET, KEEPTTL, EX/PX/EXAT/PXAT).
- Cơ chế expiration: lazy + active, maxmemory + eviction.
- MSET/MGET tăng throughput, hash tag trong Cluster.
- String ranges + bitmap: fixed-layout encoding, DAU, BITOP analytics.
- INCR family: atomic vs race condition tự code, rate limit, counter pattern.
- 10 bẫy thường gặp và checklist trước production.

**Phase tiếp theo** (phase-3) sẽ chuyển từ "lệnh đơn lẻ" sang **xây dựng app thực tế**: app e-commerce dạng eBay với Node.js. Sẽ học **Redis Design Methodology** — cách thiết kế dữ liệu Redis cho một feature từ A đến Z.

→ [Phase-3 — Bài 1: Tổng quan app e-commerce](../phase-3/01-app-tong-quan.md)
