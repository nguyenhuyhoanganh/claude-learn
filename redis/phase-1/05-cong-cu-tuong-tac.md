# Bài 5: Các công cụ tương tác với Redis

Bạn đã có Redis chạy. Giờ cần một công cụ để **gõ lệnh** vào nó. Có 3 nhóm công cụ chính: CLI, GUI, và client library cho ngôn ngữ lập trình. Bài này giới thiệu cả ba, cùng giao thức **RESP** mà chúng dùng chung phía dưới.

## Một câu lệnh đi từ client tới server thế nào?

```text
        bạn gõ "SET hello world"
            │
            ▼
    +------------------+      RESP request       +------------------+
    | Client           |  ────────────────────▶  | Redis Server     |
    | (redis-cli/GUI)  |                         |                  |
    | (app + lib)      |  ◀────────────────────  | (event loop)     |
    +------------------+      RESP response      +------------------+
                              "+OK\r\n"
```

Mọi công cụ dưới đây đều là **client** gửi lệnh qua **RESP** (REdis Serialization Protocol) trên TCP. Khác biệt chỉ là **giao diện** — terminal, web, GUI, hay API ngôn ngữ.

### RESP — hiểu nhanh (không cần học thuộc)

RESP là giao thức **text-based**, dễ đọc bằng mắt thường. Ví dụ lệnh `SET hello world`:

**Client gửi đi** (mỗi `\r\n` là một dòng):
```text
*3\r\n              # mảng 3 phần tử
$3\r\nSET\r\n       # phần tử 1: string 3 byte "SET"
$5\r\nhello\r\n     # phần tử 2: string 5 byte "hello"
$5\r\nworld\r\n     # phần tử 3: string 5 byte "world"
```

**Server trả về**:
```text
+OK\r\n             # simple string "OK"
```

Các loại RESP type chính:
- `+` simple string (vd `+OK`)
- `-` error (vd `-ERR unknown command`)
- `:` integer (vd `:42`)
- `$` bulk string (có độ dài, có thể chứa binary)
- `*` array (chứa nhiều element)

Từ Redis 6 có **RESP3** với thêm map, set, double — chủ yếu các client library mới mới quan tâm.

> **Bạn không cần viết RESP thủ công**. Mọi công cụ dưới đây tự gói lệnh thành RESP. Nhưng biết RESP có ích khi debug `tcpdump`, MONITOR, hay viết client từ đầu.

## Công cụ 1 — `redis-cli` (CLI chính chủ)

Đây là **công cụ chuẩn**, có sẵn khi cài Redis. Đơn giản, mạnh, dùng cho cả dev và ops.

### Kết nối

```bash
# Local Redis không password
redis-cli

# Local Redis có password
redis-cli -a 'mypass'

# Remote (Redis Cloud)
redis-cli -h redis-12345.cloud.redislabs.com -p 12345 -a 'mypass'

# Dùng URI
redis-cli -u 'redis://default:mypass@redis-12345.cloud.redislabs.com:12345/0'
```

Sau khi connect, ta vào REPL:

```text
127.0.0.1:6379> PING
PONG
127.0.0.1:6379> SET hello "world"
OK
127.0.0.1:6379> GET hello
"world"
127.0.0.1:6379> EXIT
```

### Các flag/lệnh hay dùng

```bash
# Chạy 1 lệnh rồi thoát (script-friendly)
redis-cli PING

# Đổi DB (Redis có 16 DB index 0-15 mặc định)
redis-cli -n 1 PING
# Hoặc trong REPL: SELECT 1

# Stats lệnh chạy mỗi giây
redis-cli --stat

# Xem lệnh đang chạy real-time (CHẬN MỌI CLIENT KHÁC!) — chỉ dùng dev
redis-cli MONITOR

# Lấy thông tin server
redis-cli INFO            # tất cả
redis-cli INFO memory     # chỉ phần memory
redis-cli INFO clients

# Slow log (lệnh chậm gần đây)
redis-cli SLOWLOG GET 10

# Latency stat
redis-cli --latency
redis-cli --latency-history -i 5    # mỗi 5s in 1 dòng

# Scan keyspace an toàn (KHÔNG dùng KEYS * ở prod)
redis-cli --scan --pattern 'user:*' | head -100

# Big keys (key tốn nhiều memory)
redis-cli --bigkeys

# Memory analysis
redis-cli --memkeys
redis-cli MEMORY USAGE user:1001    # bytes của 1 key
redis-cli MEMORY STATS

# Benchmark
redis-cli -p 6379 --eval ./script.lua
redis-benchmark -t set,get -n 100000 -q
```

### Cờ hữu ích khác

| Cờ | Tác dụng |
|---|---|
| `-r N` | Lặp lệnh N lần |
| `-i SECONDS` | Khoảng cách giữa các lần lặp |
| `--no-raw` / `--raw` | Định dạng output (raw không escape) |
| `--json` | Format JSON cho output (Redis 7+) |
| `--csv` | Format CSV |
| `-t TIMEOUT` | Timeout |
| `--cluster` | Chế độ Cluster (vd `redis-cli --cluster create ...`) |

### Help ngay trong CLI

```text
127.0.0.1:6379> HELP            # liệt kê các nhóm lệnh
127.0.0.1:6379> HELP @string    # các lệnh thuộc nhóm string
127.0.0.1:6379> HELP SET        # tài liệu của SET
```

## Công cụ 2 — RedisInsight (GUI chính chủ)

[RedisInsight](https://redis.io/insight/) là GUI desktop/web miễn phí từ Redis Inc. Phù hợp khi:
- Cần **duyệt keyspace bằng mắt** (hierarchy view, lọc theo pattern).
- Cần **xem cấu trúc value** dạng đẹp (JSON, list, hash, sorted set, stream).
- Cần **profile latency** hoặc **memory analysis** chi tiết.
- Đang học, chưa quen lệnh.

### Cài đặt

3 cách:
1. **Desktop app**: download tại trang RedisInsight cho macOS/Windows/Linux.
2. **Docker**: `docker run -d --name redisinsight -p 5540:5540 redis/redisinsight:latest` → mở `http://localhost:5540`.
3. **Web on Redis Cloud**: tích hợp sẵn trong Redis Cloud Console (nút "Open RedisInsight").

### Các tab chính

| Tab | Dùng để |
|---|---|
| **Browser** | Xem mọi key, filter theo pattern, edit/delete value |
| **Workbench** | Gõ lệnh kèm autocomplete và help inline |
| **Profiler** | Theo dõi lệnh real-time (giống MONITOR) |
| **Pub/Sub** | Subscribe channel, gửi message test |
| **Slow Log** | Lệnh chậm gần đây |
| **Memory Analysis** | Phân bố memory theo key/data type/prefix |
| **Triggers & Functions** | Quản lý function nội bộ (Redis 7.4+) |
| **CLI** | Terminal-like trong app |

### Quirks cần biết

- **Browser tab dùng SCAN**, nên việc filter có thể hiển thị theo từng đợt, không phải tất cả ngay.
- Khi cluster mode, một số lệnh phải chỉ định node — UI sẽ hỏi.
- Sửa value qua UI là một thao tác **ghi đè** thẳng vào Redis. Cẩn thận với DB prod.

## Công cụ 3 — Client library trong ngôn ngữ lập trình

Trong app thật, ta không gõ tay từng lệnh. App dùng **client library** để gọi Redis qua function/method.

### Node.js

Hai lib phổ biến:

```js
// 1) node-redis (chính chủ)
import { createClient } from 'redis';
const client = createClient({ url: 'redis://localhost:6379' });
await client.connect();
await client.set('hello', 'world');
const v = await client.get('hello');     // "world"

// 2) ioredis (cộng đồng, hỗ trợ cluster, pipeline tốt)
import Redis from 'ioredis';
const redis = new Redis({ host: 'localhost', port: 6379 });
await redis.set('hello', 'world');
const v = await redis.get('hello');
```

### Python

```python
# redis-py (chính chủ)
import redis
r = redis.Redis(host='localhost', port=6379, decode_responses=True)
r.set('hello', 'world')
print(r.get('hello'))      # 'world'

# Async với redis.asyncio
import redis.asyncio as aioredis
r = aioredis.Redis(host='localhost', port=6379)
await r.set('hello', 'world')
```

### Java

```java
// Jedis (sync, đơn giản)
import redis.clients.jedis.Jedis;
try (Jedis jedis = new Jedis("localhost", 6379)) {
    jedis.set("hello", "world");
    String v = jedis.get("hello");
}

// Lettuce (Netty-based, async/reactive, dùng trong Spring Data Redis mặc định)
RedisClient client = RedisClient.create("redis://localhost:6379");
StatefulRedisConnection<String, String> conn = client.connect();
RedisCommands<String, String> sync = conn.sync();
sync.set("hello", "world");
```

### Go

```go
import "github.com/redis/go-redis/v9"
rdb := redis.NewClient(&redis.Options{Addr: "localhost:6379"})
rdb.Set(ctx, "hello", "world", 0)
v, _ := rdb.Get(ctx, "hello").Result()
```

### Đặc điểm quan trọng của client lib (chúng làm gì cho bạn)

1. **Connection pool** — quản lý nhiều TCP connection tới Redis, tái sử dụng.
2. **Auto reconnect** — khi mạng đứt, retry với backoff.
3. **Serialization** — chuyển Python dict / JS object thành RESP và ngược lại.
4. **Pipeline & transaction** — gom nhiều lệnh, gửi 1 lần.
5. **Cluster routing** — biết slot nào ở node nào, tự gửi đúng node.
6. **Pub/Sub & Stream** — wrapper sẵn cho subscribe/consume.
7. **Sentinel awareness** — biết failover, đổi master.

> Phase-3 sẽ chọn `node-redis` để xây e-commerce app, vì khoá theo Stephen dùng Node.js. Nhưng bài học **không phụ thuộc ngôn ngữ** — mọi lệnh đều như nhau.

## Vài công cụ "bonus" có ích

- **`redis-benchmark`**: đo throughput/latency từ machine. Đi kèm Redis package.
- **`redis-rdb-tools`** (Python, cộng đồng): parse RDB file, đếm key theo prefix, tìm big key offline.
- **iredis**: redis-cli "đẹp hơn", có autocomplete, syntax highlight (`pip install iredis`).
- **`memtier_benchmark`** (Redis Inc.): benchmark mạnh hơn redis-benchmark.

## Khi nào dùng gì?

| Tình huống | Công cụ |
|---|---|
| Học, debug nhanh trên 1 vài key | redis-cli |
| Duyệt keyspace, hiểu cấu trúc value | RedisInsight Browser |
| Viết app | Client library + RedisInsight để xem |
| Script ops (backup key, migrate) | redis-cli + shell hoặc Python script |
| Benchmark, đo p99 | redis-benchmark / memtier_benchmark |
| Trace lệnh sống ở dev | redis-cli MONITOR hoặc RedisInsight Profiler |
| Tìm big key, phân tích memory | `--bigkeys`, RedisInsight Memory Analysis |

## Một quy tắc an toàn — **đừng dùng MONITOR / KEYS \* ở production**

- `MONITOR` in mọi lệnh real-time → tiêu thụ CPU server đáng kể, nhất là Redis bận → có thể làm chậm app.
- `KEYS *` quét toàn bộ keyspace **trong một lần**, chặn event loop. Với 10 triệu key, có thể chặn vài giây → app timeout.

Thay thế:
- Profile bằng **slowlog** thay vì MONITOR.
- Tìm key bằng `SCAN` (lặp nhiều bước, mỗi bước nhỏ).

## Tóm tắt phase-1

Đến đây bạn đã có:

- Hiểu Redis là gì, vì sao nhanh, các lý do và trade-off (bài 1, 2).
- Biết cách triển khai Redis: cloud, Docker, bare-metal, source (bài 3).
- Có một Redis Cloud database hoặc Redis Docker chạy ở local (bài 4).
- Biết các công cụ tương tác: redis-cli, RedisInsight, client lib (bài 5).
- Hiểu RESP protocol đủ để debug khi cần.

**Phase tiếp theo** (phase-2) sẽ vào sâu **các lệnh thao tác dữ liệu cơ bản với kiểu String**: SET, GET, MSET, MGET, INCR/DECR, expiration, bitops... đây là nền tảng cho mọi data structure khác.

→ [Phase-2 — Bài 1: Mô hình key-value & các kiểu dữ liệu trong Redis](../phase-2/01-mo-hinh-key-value.md)
