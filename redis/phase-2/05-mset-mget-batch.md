# Bài 5: MSET & MGET — thao tác nhiều key cùng lúc

Khi bạn cần set/get **nhiều key**, có 3 cách:
1. Gọi `SET`/`GET` lặp lại — chậm vì N round-trip mạng.
2. Dùng `MSET`/`MGET` — 1 lệnh, 1 round-trip.
3. Dùng **pipeline** — nhiều lệnh khác nhau gửi cùng lúc (sẽ học sau).

Bài này tập trung 2 lệnh M (multi) — `MSET`, `MSETNX`, `MGET` — và bàn về **round-trip latency** là tại sao chúng tồn tại.

## Lý do M-commands tồn tại — câu chuyện về round-trip

Một lệnh Redis thường mất:

```text
0.05 ms  → server xử lý lệnh (in-memory, đơn giản)
0.50 ms  → round-trip qua mạng (cùng AZ)
─────────
~0.55 ms cho một lệnh
```

**Network** áp đảo CPU. Nếu app cần set 100 key:

| Cách | Số request mạng | Thời gian (cùng AZ) |
|---|---|---|
| 100 lệnh `SET` lần lượt | 100 | ~50 ms |
| 1 lệnh `MSET ...` | **1** | **~1 ms** |
| 100 lệnh trong pipeline | 1 (gửi gộp) | ~1-2 ms |

→ M-commands là **gộp nhiều thao tác vào một round-trip** trong cú pháp ngắn gọn.

## MSET — set nhiều key trong 1 lệnh

```text
MSET key1 value1 key2 value2 ... keyN valueN
```

Ví dụ:

```text
MSET color red model Toyota year 2024
OK

MGET color model year
1) "red"
2) "Toyota"
3) "2024"
```

### Tính chất quan trọng

- **Atomic**: cả N key được set như một thao tác. Không client nào thấy "set xong 5/10".
- **Luôn trả `OK`** — không có cách báo lỗi từng key.
- **Ghi đè** mọi key (giống SET không option).
- **Không hỗ trợ TTL** trong MSET. Muốn vừa set vừa expire, dùng pipeline với `SET ... EX`.
- **O(N)** — với N rất lớn (vd 100k key), MSET chặn event loop. Chia batch nhỏ (vd 1000/lần) là an toàn.

### Use case
- Bulk import dữ liệu nhỏ.
- Cập nhật nhiều flag liên quan: `MSET feature:a on feature:b off feature:c on`.
- Ghi nhiều field config cùng lúc.

> Nếu data là một "object" với nhiều field, **hash** thường hợp lý hơn MSET nhiều key string. Học hash ở phase sau.

## MSETNX — set nhiều key chỉ khi TẤT CẢ chưa tồn tại

```text
MSETNX key1 val1 key2 val2 ...
```

Hành vi:
- Nếu **bất kỳ** một key đã tồn tại → KHÔNG set một key nào → trả `0`.
- Nếu **mọi** key chưa tồn tại → set tất cả → trả `1`.

Ví dụ:

```text
DEL color model

MSETNX color red model Toyota
(integer) 1                            # tất cả set thành công

MSETNX color blue brand Honda
(integer) 0                            # "color" đã có → không set cái nào
GET brand
(nil)                                  # không có brand
```

### Khi nào dùng

- "All-or-nothing initialization": tạo các key cho một entity mới, đảm bảo không "init" hai lần (idempotent).

```text
# Tạo các default field cho user mới — chỉ chạy nếu user chưa tồn tại
MSETNX user:42:name "Alice" user:42:role "guest" user:42:status "active"
```

Hạn chế: trong thực tế ít dùng hơn `SET ... NX` cho từng key — vì MSETNX không có TTL, không có atomicity "per key".

## MGET — get nhiều key trong 1 lệnh

```text
MGET key1 key2 ... keyN
```

Trả về **mảng** N phần tử, theo đúng thứ tự yêu cầu. Key không tồn tại → vị trí đó là `(nil)`.

```text
MSET a 1 b 2 c 3
MGET a b c d e
1) "1"
2) "2"
3) "3"
4) (nil)
5) (nil)
```

### Tính chất

- **Atomic snapshot**: tất cả N key được đọc tại một "thời điểm" — không client nào có thể thay đổi giữa chừng.
- **O(N)** — như MSET, không nên gọi với N quá lớn.
- Hữu ích để giảm latency khi cần đọc nhiều key cùng nguồn dữ liệu.

### Pattern: bulk lookup

```python
# Lookup 50 user một lần
keys = [f"user:{uid}" for uid in user_ids]
values = redis.mget(*keys)               # 1 round-trip
users = [json.loads(v) if v else None for v in values]
```

Tránh:

```python
# CHẬM — 50 round-trip
users = [redis.get(f"user:{uid}") for uid in user_ids]
```

## MSET/MGET trong Redis Cluster — **bẫy hash slot**

Đây là điểm **rất quan trọng** khi production scale.

Redis Cluster chia keyspace thành **16384 slot**, mỗi node giữ một dải slot. Slot tính bằng `CRC16(key) % 16384`.

Lệnh đa key (MSET, MGET, SUNION, ZADD nhiều key, ...) **yêu cầu mọi key trong lệnh phải cùng slot** — nếu không, lệnh fail với `CROSSSLOT`:

```text
(error) CROSSSLOT Keys in request don't hash to the same slot
```

### Giải pháp: **hash tag**

Đặt một phần tên key trong `{...}` — Redis chỉ băm phần trong dấu ngoặc:

```text
user:{42}:name       slot = hash("42") % 16384
user:{42}:profile    cùng slot
user:{42}:settings   cùng slot

MSET user:{42}:name Alice user:{42}:role admin   # OK trong cluster
```

→ Mọi key thuộc cùng user 42 nằm cùng node. MSET/MGET hoạt động.

**Trade-off**: hash tag tập trung dữ liệu một user lên 1 node → có thể "nóng" nếu user đó được truy cập nhiều. Cân bằng giữa "atomic operations" và "data spreading".

> Trong **standalone mode** (không cluster), không có giới hạn slot — MSET/MGET tự do.

## So sánh MSET / pipeline / Lua script

Khi cần "ghi/đọc nhiều thứ", có 3 công cụ tương tự, khác biệt tinh tế:

| | MSET/MGET | Pipeline | Lua script (EVAL) |
|---|---|---|---|
| Số round-trip | 1 | 1 | 1 |
| Loại lệnh | Chỉ MSET/MGET | Bất kỳ lệnh nào | Bất kỳ lệnh nào trong script |
| Atomic giữa các lệnh? | **Có** (một lệnh) | **Không** — các lệnh khác có thể xen | **Có** — Lua script chạy atomic |
| Logic điều kiện (if/loop) trong server | Không | Không | **Có** |
| Có TTL kèm theo? | Không | Có (SET ... EX) | Có |
| Phức tạp | Đơn giản | Đơn giản | Trung bình |

**Quy tắc chọn**:
- Cần đơn giản, chỉ get/set nhiều key → MSET/MGET.
- Cần get/set kèm option (EX, NX...) cho nhiều key → pipeline.
- Cần logic atomic (vd "if A > 5 then SET B") → Lua script.

## Pipeline — ngữ cảnh để hiểu MSET/MGET hơn

Sẽ học pipeline kỹ ở phase riêng, đây là tóm tắt:

```python
# Pipeline: tích luỹ N lệnh, gửi 1 lần, nhận N reply
pipe = redis.pipeline()
for u in users:
    pipe.set(f"user:{u.id}", json.dumps(u), ex=300)
pipe.execute()    # 1 round-trip cho N lệnh
```

Khác MSET ở chỗ:
- Pipeline cho phép mọi lệnh, mỗi cái có option riêng.
- Pipeline **không atomic** — giữa các lệnh trong pipeline, một client khác có thể xen.
- Pipeline có thể có cả lệnh đọc và ghi, lấy đầy đủ N reply.

## Use case thực — page caching nhiều trang

```python
def warm_cache(pages):
    """Đẩy nhiều HTML page vào cache khi build/deploy"""
    pipe = redis.pipeline()
    for slug, html in pages.items():
        pipe.set(f"cache:page:{slug}", html, ex=3600)   # mỗi cái có TTL riêng
    pipe.execute()
```

Đây là ví dụ MSET **không** dùng được (vì cần TTL); pipeline thì có.

```python
def get_cached_pages(slugs):
    """Đọc nhiều page về cùng lúc"""
    keys = [f"cache:page:{s}" for s in slugs]
    return dict(zip(slugs, redis.mget(*keys)))   # MGET dùng được
```

## Performance benchmark — số thực

Trên Redis local, benchmark 10,000 phần tử:

| Phương án | Thời gian (~) | Throughput |
|---|---|---|
| 10,000 SET tuần tự (sync) | ~5,000 ms | 2,000 op/s |
| MSET 10,000 cặp key-val | ~10 ms | 1,000,000 op/s |
| Pipeline 10,000 SET | ~15 ms | 666,000 op/s |

Nhanh hơn 100-500 lần. Tận dụng được = bạn đã tăng đáng kể throughput app.

## Một số sai lầm phổ biến

1. **MSET với hàng triệu key một lúc** → chặn event loop. Chia batch 1,000-10,000.
2. **MGET với 100k key** → tải lớn về client, có thể OOM JVM/Node. Chia batch.
3. **Quên hash tag trong Cluster** → mọi MSET fail. Khi thiết kế namespace, lên kế hoạch hash tag từ đầu.
4. **Lẫn lộn atomic của MSET với atomic của transaction**: MSET atomic trên N key cùng lệnh; transaction `MULTI/EXEC` cho phép gộp nhiều lệnh KHÁC NHAU thành một block atomic.
5. **Dùng MSETNX để emulate distributed lock** — không nên. Dùng `SET key val NX EX 30`.

## Cú pháp client lib

```js
// node-redis
await client.mSet({ a: '1', b: '2', c: '3' });
const vals = await client.mGet(['a', 'b', 'c']);
// vals = ['1', '2', '3']
```

```python
# redis-py
r.mset({'a': '1', 'b': '2', 'c': '3'})
vals = r.mget('a', 'b', 'c')   # ['1', '2', '3']
```

## Tóm tắt bài 5

- **MSET/MGET** gộp nhiều set/get vào 1 round-trip → tăng throughput nhiều lần.
- Atomic, O(N), không hỗ trợ TTL trong MSET (dùng pipeline cho TTL).
- Trong **Cluster**, cần **hash tag** để mọi key thuộc cùng slot.
- Pipeline linh hoạt hơn nhưng không atomic giữa các lệnh; Lua atomic + có logic.
- Tránh batch quá lớn — chia thành chunk 1k-10k.

**Bài kế tiếp** → [Bài 6: String ranges và Bitmap — GETRANGE, SETRANGE, BITCOUNT](06-string-ranges-bitops.md)
