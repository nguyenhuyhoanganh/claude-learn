# Bài 3: Các option của SET — NX, XX, GET, KEEPTTL, EX/PX/EXAT/PXAT

`SET` không chỉ là "gán key = value". Với các option, một lệnh `SET` có thể thực hiện:
- Đặt key chỉ khi chưa tồn tại (lock cơ bản).
- Đặt key chỉ khi đã tồn tại (refresh cache).
- Trả về value cũ trước khi ghi.
- Đặt expiration tự động (cache với TTL).

Tất cả những thao tác trên đều **atomic** trong một lệnh.

## Cú pháp đầy đủ

```text
SET key value [NX | XX] [GET] 
              [EX seconds | PX milliseconds | EXAT unix-secs | PXAT unix-ms | KEEPTTL]
              [IFEQ comparison-value | IFGT | IFLT ...]
```

3 nhóm option chính:

1. **Điều kiện đặt** — `NX` / `XX` (chọn tối đa 1).
2. **Lấy value cũ** — `GET` (flag).
3. **Expiration** — `EX` / `PX` / `EXAT` / `PXAT` / `KEEPTTL` (chọn 1).

(Redis 7.4+ thêm `IFEQ`/`IFGT`/`IFLT` — ít gặp, không bàn ở đây.)

## NX — "set if Not eXists"

`SET key value NX` chỉ thành công nếu **key chưa tồn tại**.

```text
GET color
(nil)

SET color red NX
OK                 # thành công (key trước đó không có)

SET color blue NX
(nil)              # thất bại (key đã có)

GET color
"red"              # vẫn là red, không bị blue ghi đè
```

- Thành công: trả `OK`.
- Thất bại: trả `(nil)` (không phải lỗi — bạn phải tự xử lý ở client).

### Lệnh tương đương cũ: `SETNX`

`SETNX key value` làm việc giống hệt `SET key value NX`, nhưng **không có** option expiration. Redis docs khuyến cáo **dùng `SET ... NX` thay vì `SETNX`** — bạn có thể kết hợp `NX` với `EX` trong cùng lệnh.

### Use case kinh điển: **Distributed Lock**

Một trong các use case nổi tiếng nhất của Redis:

```text
SET lock:order:1234 worker-A NX EX 30
```

- `NX`: chỉ chiếm lock nếu chưa ai chiếm.
- `EX 30`: lock tự giải phóng sau 30s — phòng worker crash mà quên unlock.
- Value `worker-A` để biết ai đang giữ lock (verify khi unlock).

```python
# Pseudocode distributed lock
def acquire(name, owner, ttl=30):
    return redis.set(f"lock:{name}", owner, nx=True, ex=ttl) == "OK"

def release(name, owner):
    # Lua script để check + del atomic
    script = """
        if redis.call('GET', KEYS[1]) == ARGV[1] then
            return redis.call('DEL', KEYS[1])
        else
            return 0
        end
    """
    return redis.eval(script, [f"lock:{name}"], [owner])

if acquire("order:1234", "worker-A"):
    try:
        do_work()
    finally:
        release("order:1234", "worker-A")
```

> **Quan trọng**: đây là single-node lock. Cho production phân tán nhiều Redis node, dùng thuật toán **RedLock** (5 node) hoặc giải pháp khác. Không dùng `KEYS *` để liệt lock.

### Use case: idempotent ghi (one-shot)

```text
# Đánh dấu user X đã nhận voucher Y, mỗi user chỉ nhận 1 lần
SET voucher:Y:user:X received NX EX 86400
# OK → đây là lần đầu, cấp voucher.
# (nil) → đã nhận rồi, skip.
```

## XX — "set if eXists"

Ngược NX. Chỉ thành công nếu key **đã tồn tại**.

```text
DEL color
(integer) 1

SET color green XX
(nil)              # thất bại (key không có sẵn)

SET color red
OK
SET color green XX
OK                 # thành công (key đã có)
GET color
"green"
```

### Use case: refresh cache không tạo cache mới

```text
# Backend chỉ muốn update cache nếu hiện đang có (giả sử worker khác sẽ tạo cache khi cần)
SET cache:user:1 "<json>" XX EX 60
```

Nếu cache bị evict rồi, lệnh không tạo lại — tránh "ghi nhầm" giá trị cũ vào key đã bị xoá có chủ ý.

### Use case: distributed lock — gia hạn TTL của lock đang nắm

```text
# Tôi đang giữ lock, gần hết hạn, muốn gia hạn thêm 30s
SET lock:order:1234 worker-A XX EX 30
```

Chỉ thành công nếu lock vẫn tồn tại (tức tôi vẫn là chủ logical). Tuy nhiên cần Lua để check chủ sở hữu chính xác.

## GET — lấy value cũ khi đang ghi

Flag `GET` khiến SET **trả về** value trước đó (hoặc nil nếu chưa có), thay vì trả `OK`.

```text
SET color red
SET color green GET
"red"              # value cũ trả về

GET color
"green"            # value hiện tại
```

**Atomic**: việc "đọc cũ + ghi mới" diễn ra như một thao tác. Không client nào khác có thể chen vào giữa.

### Use case: pop-and-replace, swap atomic

```text
# Lấy session token cũ và ghi token mới trong một bước
SET session:abc:token "new-token" GET
# Trả về "old-token" (hoặc nil nếu lần đầu)
```

Tương đương việc thay thế lệnh deprecated cũ `GETSET key value` (Redis ≥ 6.2 khuyến cáo dùng `SET ... GET` thay).

### Hành vi đặc biệt

- Nếu key trước đó **không phải String** (vd là List), `SET ... GET` trả `WRONGTYPE`. Vì `GET` chỉ làm việc với String — nó không thể trả "value cũ" của list.

## EX / PX / EXAT / PXAT — expiration

| Option | Đơn vị | Ý nghĩa |
|---|---|---|
| `EX seconds` | giây | Hết hạn sau N giây |
| `PX milliseconds` | ms | Hết hạn sau N mili giây |
| `EXAT unix-time-seconds` | Unix timestamp giây | Hết hạn TẠI thời điểm tuyệt đối |
| `PXAT unix-time-milliseconds` | Unix timestamp ms | Hết hạn TẠI thời điểm tuyệt đối (ms) |

Ví dụ:

```text
SET cache:page:home "<html>" EX 60          # hết hạn sau 60s
SET token "abc"           PX 5000           # hết hạn sau 5000ms
SET event "start"         EXAT 1735689600   # 2025-01-01 UTC
SET token "abc"           PXAT 1735689600000  # cùng nghĩa, ms
```

Sau khi hết hạn:
- `GET key` trả `(nil)`.
- `TTL key` trả `-2`.
- Redis tự giải phóng memory (gần như, có lag — bài 4 sẽ giải thích).

### EX 0 / PX 0 — lỗi

```text
SET key val EX 0
(error) ERR invalid expire time in 'set' command
```

Redis không cho phép TTL ≤ 0. Phải ≥ 1.

### EX cũ bị reset khi SET không có expiration

Đây là **cạm bẫy phổ biến**:

```text
SET cache:x val1 EX 60       # TTL = 60
TTL cache:x                  # 58
SET cache:x val2             # KHÔNG có EX
TTL cache:x                  # -1  ← TTL biến mất, key sống mãi
```

Để tránh, dùng `KEEPTTL`:

## KEEPTTL — giữ nguyên TTL cũ khi update value

`KEEPTTL` (Redis ≥ 6.0) bảo Redis: "thay value, nhưng đừng đụng đến expiration".

```text
SET cache:x val1 EX 60
TTL cache:x                  # 58
SET cache:x val2 KEEPTTL
TTL cache:x                  # 56  ← TTL vẫn chạy
```

Khi nào cần: bạn muốn refresh value (vd cache hit ratio analytics), nhưng vẫn để key hết hạn theo lịch ban đầu.

## Lệnh độc lập SETEX và PSETEX (deprecated)

```text
SETEX key seconds value      # tương đương SET key value EX seconds
PSETEX key milliseconds value # tương đương SET key value PX milliseconds
```

Redis docs khuyến cáo **dùng `SET ... EX`/`PX` thay**. Bạn vẫn thấy code cũ dùng SETEX, biết nó là gì.

## Kết hợp option — ví dụ thực tế

### 1. Acquire lock có TTL
```text
SET lock:queue worker-1 NX EX 30
```

### 2. Tạo session đăng nhập (idempotent + TTL)
```text
SET session:user:42 '{"name":"Alice","csrf":"x"}' NX EX 3600
```

### 3. Refresh cache value chỉ khi cache còn
```text
SET cache:product:7 "<json>" XX KEEPTTL
```

### 4. Lấy value cũ + ghi mới + TTL
```text
SET feature:flag:beta enabled GET EX 86400
# Trả về "disabled" (giá trị cũ), key giờ là "enabled", hết hạn sau 1 ngày
```

### 5. Đặt key tại thời điểm cụ thể trong tương lai
```text
SET promo:black-friday active EXAT 1732838400   # bắt đầu cụ thể ngày X
```

> Hệ thống của bạn không cần dùng option phức tạp nếu logic không yêu cầu. Đơn giản nhất là tốt nhất. Nhưng biết các option giúp bạn **gom 2-3 lệnh thành 1 atomic**.

## Bảng tổng hợp return code của SET

| Tình huống | Reply |
|---|---|
| Thành công bình thường | `OK` |
| `NX` thất bại (key đã có) | `(nil)` |
| `XX` thất bại (key chưa có) | `(nil)` |
| Có `GET` flag, thành công | value cũ (hoặc nil) |
| Có `GET` flag, fail vì NX/XX | value cũ (hoặc nil) — vẫn trả |
| Có `GET` mà key cũ không phải string | `WRONGTYPE` error |
| `EX 0` hoặc combo invalid | error |

Trong client lib, "nil" thường là `null`/`None` — kiểm tra **truthy** không an toàn, kiểm tra `=== null` / `is None` mới đúng.

## Tóm tắt bài 3

- `NX` / `XX` đảo ngược điều kiện set — **atomic** giúp tránh race condition.
- `GET` = đọc-rồi-ghi trong một lệnh (thay `GETSET` cũ).
- `EX`/`PX`/`EXAT`/`PXAT` đặt TTL ngay trong SET — đừng làm 2 lệnh tách.
- `KEEPTTL` cứu cache: update value mà không reset hạn dùng.
- 1 lệnh `SET ... NX EX 30` = distributed lock cơ bản. RedLock cần thêm.

**Bài kế tiếp** → [Bài 4: Đào sâu về Expiration — cơ chế Active/Lazy, TTL, PERSIST](04-expiration-deep-dive.md)
