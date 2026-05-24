# Bài 4: Đào sâu về Expiration — TTL, PERSIST, Active/Lazy expiration

Hệ thống TTL của Redis trông đơn giản (`SET ... EX 60` là xong) nhưng đằng sau là **cơ chế tinh tế** quyết định performance và hành vi khi cache full. Hiểu nó giúp bạn:

- Biết tại sao memory không giảm ngay khi key hết hạn.
- Tránh "TTL cliff" — toàn bộ cache hết cùng lúc.
- Chọn đúng eviction policy khi maxmemory đầy.

## Đặt và kiểm tra TTL — các lệnh chính

| Lệnh | Tác dụng | Đơn vị |
|---|---|---|
| `EXPIRE key seconds [NX\|XX\|GT\|LT]` | Đặt/đổi TTL bằng giây | giây |
| `PEXPIRE key milliseconds [NX\|XX\|GT\|LT]` | Đặt/đổi TTL bằng ms | ms |
| `EXPIREAT key unix-time-seconds [NX\|XX\|GT\|LT]` | Đặt thời điểm hết hạn tuyệt đối | unix s |
| `PEXPIREAT key unix-time-ms [NX\|XX\|GT\|LT]` | (ms) | unix ms |
| `PERSIST key` | Bỏ TTL, key sống mãi | — |
| `TTL key` | Còn bao nhiêu giây | giây |
| `PTTL key` | Còn bao nhiêu ms | ms |
| `EXPIRETIME key` | Trả về Unix time hết hạn (Redis ≥ 7.0) | unix s |
| `PEXPIRETIME key` | (ms) | unix ms |

### Ví dụ

```text
SET cache:home "<html>" EX 60
TTL cache:home              # → 58
PTTL cache:home             # → 58234
EXPIRETIME cache:home       # → 1735689660 (Unix time)

EXPIRE cache:home 120       # gia hạn lên 120s
TTL cache:home              # → 120

PERSIST cache:home          # bỏ TTL
TTL cache:home              # → -1
```

### Return code của TTL/PTTL

| Trả về | Nghĩa |
|---|---|
| `>0` | Số giây/ms còn lại |
| `-1` | Key tồn tại nhưng không có TTL |
| `-2` | Key không tồn tại |

### Option NX/XX/GT/LT cho EXPIRE (Redis ≥ 7.0)

- `NX` — chỉ đặt khi **chưa có** TTL.
- `XX` — chỉ đặt khi **đã có** TTL.
- `GT` — chỉ đặt khi TTL mới **lớn hơn** TTL cũ (gia hạn).
- `LT` — chỉ đặt khi TTL mới **nhỏ hơn** TTL cũ (rút ngắn).

Ví dụ tăng TTL của lock chỉ khi cần kéo dài, không thu ngắn:

```text
EXPIRE lock:order 60 GT
```

## Cơ chế bên trong — vì sao key hết hạn vẫn "chiếm" memory một lúc?

Redis dùng **hai cơ chế song song** để xoá key hết hạn:

### 1. Lazy expiration (passive)

Khi một client **truy cập** key (GET, HGET, EXISTS...), Redis kiểm tra:

```text
if key.expire_at < now():
    delete key
    return (nil)   # cho lệnh GET
```

→ Key chỉ thực sự bị xoá khi có ai đó "đụng đến" nó.

**Hệ quả**: nếu một key hết hạn nhưng không ai truy cập, nó vẫn nằm trong memory cho tới khi cơ chế thứ 2 phát hiện.

### 2. Active expiration

Redis định kỳ chạy một job nền (10 lần/giây mặc định, cấu hình `hz`). Mỗi lần:

1. Lấy mẫu ngẫu nhiên 20 key có TTL từ keyspace.
2. Xoá những key đã hết hạn.
3. Nếu hơn 25% trong mẫu hết hạn → lặp lại (vì khả năng còn nhiều key cũ).

Lý do thiết kế kiểu **sampling** thay vì quét tất cả: quét toàn bộ key có TTL = O(N) → chặn event loop với N lớn.

> Đây là một thuật toán **probabilistic** — đảm bảo lượng key hết hạn tồn dư không vượt quá vài % tổng key có TTL trong hầu hết trường hợp.

### Vì sao quan trọng?

- **`USED_MEMORY` không giảm ngay** sau khi key hết hạn — bình thường, đợi vài giây.
- Nếu bạn set 1 triệu key cùng `EX 60`, sau giây thứ 61, Redis có thể mất vài giây tới chục giây để hoàn tất xoá. Mong đợi spike CPU lúc đó.
- Lệnh `INFO stats` có `expired_keys` — đếm số key đã expire tổng cộng.

## "TTL cliff" — bẫy cho người mới

Hãy tránh pattern này:

```python
# Sai: cache 1000 user, tất cả expire cùng lúc
for u in users:
    redis.set(f"user:{u.id}", json.dumps(u), ex=3600)
```

Sau 1 giờ, 1000 key hết hạn **gần như cùng lúc** → 1000 request kế tiếp đều miss cache → đập DB cùng lúc → **cache stampede**.

**Khắc phục**: jitter — thêm noise ngẫu nhiên:

```python
import random
for u in users:
    ttl = 3600 + random.randint(-300, 300)   # ±5 phút
    redis.set(f"user:{u.id}", json.dumps(u), ex=ttl)
```

Phase-3 sẽ học các kỹ thuật mitigation chi tiết (lock + early refresh + probabilistic refresh).

## Hết RAM — `maxmemory` và eviction policy

Khi Redis đầy bộ nhớ (`used_memory >= maxmemory`), nó phải:
- Từ chối lệnh ghi mới (mặc định `noeviction`), hoặc
- **Evict** (xoá bớt) key theo policy bạn chọn.

```text
# Trong redis.conf hoặc CONFIG SET
maxmemory 2gb
maxmemory-policy allkeys-lru
```

### Các policy

| Policy | Xoá key nào? | Khi nào dùng |
|---|---|---|
| `noeviction` (default) | Không xoá, fail ghi mới với OOM | Khi data là quan trọng, không phải cache |
| `allkeys-lru` | Key ít dùng gần đây nhất, **trong tất cả** | Cache thuần — phổ biến nhất |
| `allkeys-lfu` | Key ít được dùng tần suất nhất | Cache với access pattern khác nhau |
| `allkeys-random` | Random | Hiếm dùng |
| `volatile-lru` | LRU **chỉ trong key có TTL** | Mix data lâu dài + cache có TTL |
| `volatile-lfu` | LFU chỉ trong key có TTL | Mix |
| `volatile-random` | Random trong key có TTL | Hiếm dùng |
| `volatile-ttl` | Key có TTL sắp hết nhất | Hiếm dùng |

**LRU vs LFU**:
- **LRU** (Least Recently Used) — xoá key lâu chưa dùng nhất. Đơn giản, "1 lần đụng = mới".
- **LFU** (Least Frequently Used, từ Redis 4) — xoá key dùng ít tần suất nhất. Phân biệt được key được truy cập đều đặn vs spike một lần.

> Redis dùng **approximated LRU/LFU** (sampling, không phải linked list truyền thống) — nhanh nhưng không chính xác tuyệt đối. Cấu hình `maxmemory-samples` (mặc định 5) tăng số sample để chính xác hơn, đánh đổi CPU.

### Kiểm tra eviction
```text
INFO stats
# evicted_keys: 1234
# expired_keys: 5678
```

`evicted_keys` tăng → bạn đã chạm `maxmemory`. Đó là tín hiệu cần tăng RAM hoặc xem lại TTL strategy.

## Persistence và expiration

Khi Redis ghi RDB snapshot hoặc AOF log:
- **TTL được ghi cùng** key. Reload không mất TTL.
- Key đã hết hạn nhưng chưa bị xoá: không ghi vào RDB. Hành vi với AOF: lệnh DEL/EXPIRE được ghi khi xoá xảy ra.

## Multi-key delete và TTL — UNLINK

Với key lớn (vd list 1 triệu phần tử), `DEL` chặn event loop vì phải giải phóng hết memory đồng bộ.

`UNLINK` xoá **non-blocking**: gỡ key khỏi dictionary chính ngay (atomic), việc free memory dời sang thread khác.

```text
DEL big:list       # có thể chặn vài chục ms
UNLINK big:list    # gỡ ngay, không chặn
```

Khi key hết hạn theo TTL, Redis cũng dùng **lazyfree** (cấu hình `lazyfree-lazy-expire yes`) để tránh chặn.

## Lệnh OBJECT — kiểm tra metadata của key

```text
OBJECT IDLETIME user:1        # mấy giây kể từ lần truy cập cuối (cho LRU)
OBJECT FREQ user:1            # tần suất truy cập (chỉ khi dùng LFU)
OBJECT ENCODING user:1        # raw, embstr, int, ziplist, listpack...
OBJECT REFCOUNT user:1        # số reference
```

Hữu ích khi debug "tại sao key này chưa bị evict?".

## Pattern thực tế — TTL trong 3 loại workload

### 1. Cache thuần (đa số use case)
- Mỗi key có TTL (vd 5-60 phút).
- `maxmemory-policy allkeys-lru`.
- TTL có jitter.
- Có cơ chế cache stampede mitigation.

### 2. Session store
- Key có TTL = thời hạn session (vd 24h).
- Mỗi truy cập, gia hạn TTL: `EXPIRE session:abc 86400`.
- `maxmemory-policy volatile-lru` để chỉ evict session ít dùng.

### 3. Rate limit
- Key counter có TTL = window (vd 60s).
- `INCR rate:user:42:60s` (auto tạo key)
- `EXPIRE rate:user:42:60s 60 NX` (đặt TTL nếu key mới)
- Sau 60s tự reset.

## Đo TTL từ client lib

```js
// node-redis
await client.set('foo', 'bar', { EX: 60 });
const ttl = await client.ttl('foo');        // số giây
await client.expire('foo', 120);            // gia hạn
await client.persist('foo');                // bỏ TTL
```

```python
# redis-py
r.set('foo', 'bar', ex=60)
r.ttl('foo')                  # 58
r.expire('foo', 120)
r.persist('foo')
```

## Câu hỏi hay gặp

**Q: TTL của một key có thay đổi khi tôi SET lại không?**  
A: Có, **trừ khi** bạn dùng `KEEPTTL`. `SET key newval` mới (không có EX) sẽ xoá TTL hiện tại.

**Q: TTL có truyền sang replica không?**  
A: Có. Master gửi lệnh tới replica, expire chạy độc lập trên cả hai. Tuy nhiên cơ chế hơi tinh: master quyết định khi nào expire, replica chỉ chờ lệnh. Đảm bảo nhất quán giữa các node.

**Q: Hết hạn rồi RAM có giảm liền không?**  
A: Không. Cần lazy + active cơ chế xoá. Có thể vài giây tới phút trước khi memory được trả về OS (do allocator).

**Q: Có nên đặt TTL cho mọi key?**  
A: Tuỳ workload. Cache nên có. Session thường có. Data master (vd config) thường không. **Best practice**: data tạm thời → TTL; data persistent → không TTL + dùng `volatile-*` policy.

**Q: Cache cũ vs cache stale-while-revalidate?**  
A: Pattern phổ biến: TTL "hard" (vd 1h) + dấu hiệu mềm (vd `cache:x:soft_expires_at` sau 5 phút). Khi qua soft, refresh nền nhưng vẫn trả cache cũ. Bài phase-3 sẽ làm.

## Tóm tắt bài 4

- TTL được quản lý bởi **lazy** (xoá khi truy cập) + **active** (sampling, 10 Hz).
- `TTL`, `PTTL`, `EXPIRETIME`, `PERSIST` để kiểm tra/quản lý.
- Memory không giảm tức thì — chấp nhận; xài `UNLINK` cho big key.
- `maxmemory-policy` quyết định khi đầy RAM: `allkeys-lru` là default an toàn cho cache.
- TTL cliff → dùng jitter; cache stampede sẽ học mitigation ở phase-3.

**Bài kế tiếp** → [Bài 5: MSET & MGET — thao tác nhiều key cùng lúc](05-mset-mget-batch.md)
