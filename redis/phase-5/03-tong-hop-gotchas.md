# Bài 3: Tổng hợp gotchas Redis & checklist trước khi đi prod

Hai bài trước đi sâu vào quirk của `HSET`/`HGETALL`. Bài này tổng hợp **mọi quirk lớn** của Redis ở mọi data type đã học (String, Hash), kèm checklist phòng tránh trước khi deploy. Hữu ích như "cheat sheet" review trước mỗi PR.

## Phần 1 — Quirk của riêng client lib

### Q1.1: Null/undefined gây error khi serialize

**Đã đề cập [Bài 1 phase-5]**.

```js
await client.hSet('user', { name: 'A', email: null });
// → TypeError
```

Fix: serialize helper loại null trước khi gửi.

### Q1.2: HGETALL key không tồn tại trả `{}`, không nil

**Đã đề cập [Bài 2 phase-5]**.

```js
const car = await client.hGetAll('missing');
if (!car) {}        // không bao giờ true
```

Fix: `Object.keys(obj).length === 0`.

### Q1.3: Boolean / Date / Object stringify với behavior khác nhau

```js
// Boolean
{ enabled: true }       → { enabled: "true" }   (truthy string)

// Date
{ at: new Date() }      → { at: "Wed Jan 15 2026..." }  (toString format!)

// Object
{ meta: { x: 1 } }      → { meta: "[object Object]" }   (vô dụng)

// Array
{ tags: ['a', 'b'] }    → { tags: "a,b" }   (comma-sep, không safe)
```

Fix: explicit serialize, đừng pass raw object.

### Q1.4: Empty string `""` truthy nhưng có thể là falsy ở JS

```js
const email = await client.hGet('user#42', 'email');
if (email) console.log('has email');     // FAIL nếu email = ""
```

`""` là falsy trong JS. Để biết "field tồn tại", check `=== null`.

### Q1.5: Numeric string từ Hash phải parse

```js
const age = await client.hGet('user#42', 'age');    // "30" (string!)
age + 1;     // "301" ← string concat
```

Fix: `parseInt(age, 10)` mỗi lần.

## Phần 2 — Quirk của Redis core (mọi lib)

### Q2.1: `SET key value` xoá TTL hiện tại

```text
SET cache:x val1 EX 60
TTL cache:x          # 58
SET cache:x val2     # KHÔNG có EX
TTL cache:x          # -1 ← TTL biến mất, key sống mãi
```

Fix: dùng `KEEPTTL` khi muốn giữ.

### Q2.2: `INCR/INCRBY/HINCRBY` tự tạo key với value 0 nếu chưa có

```text
DEL counter
INCR counter         # 1
INCR counter         # 2

# Hash:
DEL stats
HINCRBY stats views 1   # tự tạo hash + field
```

Hành vi tốt cho counter, **nhưng** có thể bất ngờ nếu bạn muốn "increment chỉ khi key đã có".

Fix: dùng Lua nếu cần check trước:
```text
EVAL "if redis.call('EXISTS', KEYS[1]) == 1 then return redis.call('INCR', KEYS[1]) else return -1 end" 1 counter
```

### Q2.3: TTL không giảm RAM ngay sau expire

Đã đề cập [phase-2 bài 4]. Lazy + active expiration → memory giảm sau vài giây/phút.

### Q2.4: `KEYS *` chặn server

10 triệu key → `KEYS *` chặn vài giây. Fix: `SCAN`.

### Q2.5: Numbers in String — luôn lưu là string

```text
SET age 30
GET age              # "30"  ← string
TYPE age             # string
```

Tương tự với Hash. Phải parse ở client.

### Q2.6: `INCRBYFLOAT` mất precision với tiền tệ

Dùng integer (cent) thay vì float cho money.

### Q2.7: WRONGTYPE — key đã tồn tại với kiểu khác

```text
SET counter 100
LPUSH counter "item"
# (error) WRONGTYPE Operation against a key holding the wrong kind of value
```

Fix: namespace key theo entity, không trùng kiểu.

### Q2.8: Key xoá khi field cuối bị xoá (Hash, Set, Sorted Set, List)

```text
HSET temp f1 v1
HDEL temp f1
EXISTS temp          # 0 — key tự biến mất
```

Hệ quả: `EXISTS key` để check "user từng được tạo" có thể sai nếu user bị xoá hết field.

### Q2.9: `MULTI/EXEC` không rollback khi lệnh fail

Đây là khác biệt **cực lớn** với SQL transaction:

```text
MULTI
SET foo bar
INCR foo             # foo = "bar" không phải số → lỗi
EXEC
```

→ `SET foo bar` vẫn được thực thi. Chỉ `INCR foo` bị skip. **Không** rollback.

Fix: dùng `WATCH` + check kiểu trước; hoặc Lua nếu cần atomic + rollback.

### Q2.10: Pub/Sub khác Stream — không persistence

```text
PUBLISH channel "msg"     # subscriber đang online → nhận; offline → MẤT
```

Tin nhắn Pub/Sub **không lưu trữ**. Subscriber offline mất tin.

Fix: dùng **Streams** (`XADD`/`XREAD`/`XGROUP`) cho message broker với persistence.

## Phần 3 — Quirk khi chạy cluster

### Q3.1: Multi-key command yêu cầu cùng slot

```text
MSET user:1:name A user:2:name B
# Cluster: (error) CROSSSLOT Keys in request don't hash to the same slot
```

Fix: hash tag `{user1}:name`, `{user1}:profile`.

### Q3.2: Logical DB (SELECT 0..15) KHÔNG hoạt động trong Cluster

Cluster chỉ hỗ trợ DB 0. Nếu code đang dùng `SELECT 5`, migrate phải đổi sang namespace.

### Q3.3: `SCAN` trong Cluster cần lặp qua mọi node

`SCAN` chỉ làm việc với node bạn connect. Để scan cluster đầy đủ, lặp qua từng node của cluster.

### Q3.4: Replica lag — đọc replica có thể stale

`replicaof` async → ghi vào master, đọc replica có thể chậm vài ms. Critical read phải đọc master.

## Phần 4 — Quirk khi dùng modules

### Q4.1: RedisJSON path syntax khác JSONPath thường

```text
JSON.SET user $.name '"Alice"'
# $ là root. Phải có dấu nháy đôi BÊN TRONG để JSON parse được.
```

### Q4.2: RediSearch index không tự rebuild khi đổi data outside

Nếu `HSET user#42 name X` không qua RediSearch path, index có thể stale tới lần update kế. Verify với `FT.INFO index`.

## Phần 5 — Quirk vận hành

### Q5.1: `FLUSHALL` xoá MỌI DB, không recover

Đã có ca thật: developer mở `redis-cli` tưởng dev console, gõ `FLUSHALL` trên prod.

Phòng:
```conf
rename-command FLUSHALL ""
rename-command FLUSHDB ""
rename-command KEYS ""        # vô hiệu hoá luôn
```

Hoặc dùng ACL từ Redis 6:
```text
ACL SETUSER readonly on >password ~* +@read -@dangerous
```

### Q5.2: AOF rewrite có thể tăng disk I/O đột biến

Khi AOF file quá lớn, Redis tự rewrite (compact). Trên ổ chậm có thể nghẽn. Cấu hình `auto-aof-rewrite-min-size`.

### Q5.3: Big keys làm chậm cả cluster

Một list 10 triệu phần tử: `LRANGE list 0 -1` chặn event loop nhiều giây. Dùng `--bigkeys` để tìm.

### Q5.4: Persistence khác RAM size

Snapshot RDB chiếm disk + fork process → cần ~2x RAM tạm thời. Cấu hình `vm.overcommit_memory = 1` trên Linux.

## Phần 6 — Checklist trước Production

Trước khi deploy app dùng Redis lên prod, đi qua:

### 6.1: Security
- [ ] `requirepass` được set với password mạnh.
- [ ] `bind` không phải `0.0.0.0` trừ khi có firewall.
- [ ] `protected-mode yes`.
- [ ] TLS bật nếu Redis qua mạng public.
- [ ] ACL: tách user app-only (no FLUSH, no CONFIG, no DEBUG).
- [ ] Lệnh nguy hiểm bị rename hoặc disable.

### 6.2: Persistence
- [ ] Quyết định: RDB only / AOF only / cả hai / không persistence.
- [ ] `appendfsync everysec` (default) — chấp nhận mất ≤ 1s khi crash.
- [ ] Disk space ≥ 2x dataset (cho fork + rewrite).
- [ ] Backup tự động (cron RDB snapshot).

### 6.3: Memory
- [ ] `maxmemory` được set ≤ 80% RAM máy (chừa RAM cho OS + fork).
- [ ] `maxmemory-policy` phù hợp workload (`allkeys-lru` cho cache).
- [ ] Monitoring `evicted_keys` — nếu tăng = cần thêm RAM hoặc tune TTL.
- [ ] Không có big key (> 100 MB) — dùng `--bigkeys` audit.

### 6.4: Performance
- [ ] Slow log enabled: `slowlog-log-slower-than 10000` (10 ms).
- [ ] Latency monitor: `latency-monitor-threshold 100`.
- [ ] Pipeline cho bulk operations.
- [ ] Connection pool ở app, không tạo connection mỗi request.

### 6.5: HA / Scale
- [ ] Replica (≥ 1) cho disaster recovery.
- [ ] Sentinel hoặc Cluster cho automatic failover (nếu uptime critical).
- [ ] Health check endpoint dùng `PING`.
- [ ] Client lib có retry + circuit breaker.

### 6.6: Code review
- [ ] Không có `KEYS *` trong code.
- [ ] Không có `FLUSHDB`/`FLUSHALL` trong code app.
- [ ] Cache keys có TTL.
- [ ] Counter atomic (INCR), không GET+SET.
- [ ] Lock dùng `SET NX EX` + Lua release.
- [ ] HGETALL check `Object.keys().length === 0`.
- [ ] Serialize helper xử lý null/undefined/Date/Boolean.

### 6.7: Monitoring & Alerting
- [ ] Connected clients (tăng → leak connection).
- [ ] Used memory + max memory ratio (cảnh báo > 80%).
- [ ] Evicted keys + expired keys.
- [ ] Cache hit ratio (`keyspace_hits / (hits + misses)`).
- [ ] Slow log size.
- [ ] Replica lag.
- [ ] Network bytes in/out.

### 6.8: Disaster scenarios — test trước
- [ ] Redis restart: data còn đầy đủ không (nếu persistence on)?
- [ ] Master failover: app reconnect đúng không?
- [ ] Network partition: app behave thế nào (timeout, queue lệnh)?
- [ ] OOM: lệnh ghi bị reject ra sao? App có graceful degrade không?

## Phần 7 — Top 10 bài học rút ra cho phase-2..5

1. **Hiểu kiểu dữ liệu trước khi chọn lệnh** — String cho blob/counter, Hash cho object, list/set/zset cho collection.
2. **Mọi value lưu là string** — luôn serialize/parse ở client lib.
3. **Atomic là default cho lệnh đơn** — không tự code `GET + +1 + SET`.
4. **TTL là tính năng cốt lõi** — đặt cho mọi key tạm thời, dùng `KEEPTTL` khi cập nhật.
5. **Hash collection commands quirky** — `HGETALL` trả empty object, `HMGET` trả mảng nil, kiểm tra size chứ không truthy.
6. **Null/undefined gây vấn đề** — serialize helper là bắt buộc, không phải tuỳ chọn.
7. **MULTI không rollback** — Lua hoặc WATCH cho atomic logic.
8. **Cluster có giới hạn** — hash tag, không DB index, replica lag.
9. **Vận hành cẩn thận** — FLUSHALL, big key, persistence trade-off, security defaults.
10. **Doc chính thức là nguồn cuối** — client lib doc thiếu; `redis.io/commands` đầy đủ.

## Tóm tắt phase-5

- Quirk của client lib khi serialize value: null, Date, object, array — phải có serialize helper.
- Quirk của Redis core: SET reset TTL, MULTI no rollback, WRONGTYPE, big key.
- Quirk của Cluster: hash tag bắt buộc, DB index không hỗ trợ.
- Quirk vận hành: FLUSHALL, persistence I/O, fork memory.
- Checklist 8 mảng trước khi đi prod.

**Phase tiếp theo** (phase-6 = Section 07 trong transcript) sẽ chuyển từ "lý thuyết về data structure" sang **Powerful Design Patterns** — xây dựng các feature lớn của app RB (user, auction, session) với pattern thực tế: query-first design, serialization layer, multi-key transactions.

→ [Phase-6 — Bài 1: Tổng quan các feature cần xây](../phase-6/01-app-overview.md)
