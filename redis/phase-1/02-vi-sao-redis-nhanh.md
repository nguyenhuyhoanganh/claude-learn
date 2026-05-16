# Bài 2: Vì sao Redis nhanh đến vậy?

Mọi người chọn Redis vì **một lý do** duy nhất: **tốc độ**. Bài này sẽ trả lời câu hỏi quan trọng: *vì sao* Redis nhanh, và *cái giá* nào phải trả cho tốc độ ấy. Hiểu được điều này quyết định cách ta thiết kế dữ liệu trong Redis suốt phần còn lại của khoá.

## Đặt mốc so sánh

Trước khi nói "Redis nhanh", ta phải có thang đo. Đây là **thang độ trễ thông dụng** mà mọi software engineer nên nhớ:

```text
Truy cập 1 byte trên L1 cache CPU     ~ 0.5 ns
Truy cập 1 byte trên L2 cache CPU     ~ 7   ns
Truy cập 1 byte trên RAM              ~ 100 ns  (= 0.0001 ms)
Đọc 1 KB tuần tự từ SSD               ~ 150 μs  (= 0.15 ms)
Đọc 1 KB ngẫu nhiên từ SSD            ~ 1 ms
Đọc 1 KB ngẫu nhiên từ HDD            ~ 10 ms
Round-trip mạng nội bộ (cùng AZ)      ~ 0.5 ms
Round-trip mạng giữa các region       ~ 50-200 ms
```

**Tỉ lệ RAM:SSD ≈ 1 : 10,000**. Một thao tác đọc RAM nhanh hơn đọc SSD bốn bậc độ lớn. Đây là gốc rễ của mọi điều ta sắp nói.

Trong thực tế, một câu lệnh Redis (qua mạng nội bộ) thường mất **0.2 - 1 ms** vì bị bound bởi network latency, không phải CPU. Bản thân Redis xử lý lệnh trong **vài chục micro giây**.

## Ba lý do Redis nhanh

### Lý do 1: Toàn bộ dữ liệu nằm trong RAM

Các database "truyền thống" (MySQL, PostgreSQL, Mongo) đều **chứa dữ liệu trên đĩa**, có một phần đệm trong RAM (buffer pool). Khi truy vấn một dòng dữ liệu:

```text
SQL DB:  Query → Buffer Pool (RAM) ↘ hit  → return (~ 0.1 ms)
                                   ↗ miss → đọc từ disk (~ 1 ms)
                                          → swap into buffer pool
```

Tốc độ phụ thuộc nặng vào **cache hit ratio** trong buffer pool. Nếu working set lớn hơn RAM, performance giảm thảm hại vì đa số query rơi vào disk.

Redis thì khác: **không có đường đi qua disk**. Mọi dữ liệu nằm sẵn trong RAM, mọi câu lệnh là RAM-only:

```text
Redis:  Command → Look up in RAM → return (~ vài μs)
```

**Trade-off rõ ràng**: bị giới hạn bởi RAM. Nếu dataset 100 GB nhưng máy chỉ có 16 GB RAM, mặc định Redis **không** lưu hết được.

Có **3 chiến lược** để giải quyết hạn chế này (sẽ học sâu sau):

1. **Chia nhỏ dữ liệu** (sharding qua Redis Cluster): mỗi node chứa một phần dataset, gộp lại đủ chỗ. 16 node × 64 GB RAM = 1 TB workload.
2. **Eviction policy**: cấu hình `maxmemory` và `maxmemory-policy` (allkeys-lru, volatile-lfu, ...) để Redis tự xoá key cũ khi đầy. Dataset thực có thể lớn hơn RAM nếu chỉ một phần "hot" được truy cập.
3. **Tiered storage** (Redis Enterprise / Flash): để key ít dùng xuống NVMe SSD trong suốt với client. Hot keys vẫn ở RAM.

> Persistence (lưu dữ liệu lâu dài) khác với "lưu ở đĩa": Redis vẫn ghi snapshot (RDB) hoặc log thao tác (AOF) ra đĩa để hồi phục sau khi restart, nhưng **đường đọc/ghi runtime** không đi qua đĩa.

### Lý do 2: Tổ chức dữ liệu bằng các cấu trúc dữ liệu đơn giản, đã biết

Trong SQL, dữ liệu nằm trong bảng (hàng × cột) và phải qua các bước: parse SQL → planner chọn execution plan → tối ưu hoá → quét bảng/index → trả kết quả. Bộ tối ưu hoá rất mạnh nhưng cũng tốn CPU.

Trong Redis, **bạn chọn cấu trúc dữ liệu** trước, rồi gọi đúng câu lệnh tương ứng. Mỗi cấu trúc có **độ phức tạp đã biết**:

| Cấu trúc | Cài đặt nội bộ (đại lược) | Lệnh tiêu biểu | Độ phức tạp |
|---|---|---|---|
| String | Raw byte buffer (max 512 MB) | `GET`, `SET`, `INCR`, `APPEND` | O(1) |
| List | Quicklist (linked list of small ziplist nodes) | `LPUSH`, `RPUSH`, `LPOP`, `LRANGE` | O(1) ở 2 đầu, O(N) ở giữa |
| Hash | Hash table + ziplist khi nhỏ | `HSET`, `HGET`, `HDEL` | O(1) trung bình |
| Set | Hash table + intset khi toàn số | `SADD`, `SMEMBERS`, `SINTER` | O(1) ADD/EXISTS |
| Sorted set | Skip list + hash table | `ZADD`, `ZRANGEBYSCORE`, `ZRANK` | O(log N) |
| Stream | Radix tree of macro-nodes | `XADD`, `XREAD`, `XRANGE` | O(1) append, O(log N) seek |
| Bitmap | String dùng theo bit | `SETBIT`, `BITCOUNT`, `BITOP` | O(1) / O(N) |
| HyperLogLog | Probabilistic, ~12 KB | `PFADD`, `PFCOUNT` | O(1) |
| Geo | Sorted set với geohash làm score | `GEOADD`, `GEOSEARCH` | O(log N) |

**Hệ quả**: lập trình viên có **mô hình tinh thần rõ ràng** về chi phí của từng lệnh. Bạn biết `ZADD` mất `O(log N)`, không cần đoán mò. Khi thiết kế feature, ta chọn data structure phù hợp với truy vấn.

> Ví dụ tư duy: cần leaderboard top 100 ranking real-time? → sorted set, `ZADD` để cập nhật, `ZREVRANGE 0 99` để lấy top 100. Cả hai đều `O(log N)` cho update và `O(log N + 100)` cho range — cực nhanh.

**So sánh trực giác**: SQL "linh hoạt nhưng phải đoán cách bộ tối ưu hoá chạy"; Redis "bạn lựa cấu trúc, performance là dự đoán được".

### Lý do 3: Feature set đơn giản & kiến trúc single-threaded

Redis cố ý **không có** nhiều thứ mà SQL DB có:

- Không có JOIN giữa các "bảng".
- Không có lược đồ (schema) cố định, không có CHECK constraint phức tạp.
- Không có planner/optimizer phức tạp.
- Không có concurrency control kiểu MVCC, không có lock manager phức tạp.
- Không có row-level locking — vì lệnh chạy **tuần tự, single-threaded**.

**Single-threaded event loop** (cốt lõi): một thread chính nhận lệnh, xử lý từng lệnh **tuần tự** một, gửi kết quả. Mô hình giống Node.js, libuv, Nginx.

```text
+--------------------------------------------------+
| Redis main thread (event loop)                   |
|                                                  |
| while (true):                                    |
|   wait for I/O events from clients               |
|   read command bytes from socket                 |
|   parse RESP                                     |
|   execute command (in-memory, no I/O)            |
|   write reply bytes to socket                    |
|                                                  |
+--------------------------------------------------+
```

**Vì sao single-thread lại nhanh?**

1. **Không có overhead của lock/mutex** giữa các thread.
2. **Không có context switch** giữa các CPU core cho cùng một dataset → tận dụng CPU cache tốt.
3. **Tránh hoàn toàn race condition** ở mức database — mọi command là atomic so với các command khác.
4. **Đơn giản cho lập trình viên**: lệnh `INCR` đảm bảo counter +1 nguyên tử, không cần lock.

**Trade-off**:

- Một lệnh chậm (vd `KEYS *` quét toàn bộ keyspace, hay `SORT` lớn, hay Lua script vô hạn) **làm tắc nghẽn mọi client khác**. Đây là cội nguồn của "slow command kills Redis".
- Một instance không tận dụng được nhiều CPU core. Muốn dùng 16 core → phải chạy nhiều instance (Cluster) hoặc tách workload.

**Từ Redis 6+**: I/O có thể đa luồng (chỉ phần đọc/ghi socket), nhưng **xử lý lệnh vẫn single-thread**. Bật bằng `io-threads` trong config khi NIC là bottleneck.

## Ba lý do nối kết với nhau

```text
Trong RAM ─── lệnh chạy nhanh ─── single-thread vẫn đủ throughput
            ↓                  ↗
Data structure đơn giản ── không cần planner phức tạp
            ↓                  ↘
Feature set đơn giản ─── ít code path = predictable latency
```

Cả ba **củng cố lẫn nhau** thành một hệ thống nhất quán: nhanh và dự đoán được, nhưng "mỏng" và đòi hỏi developer biết mình đang làm gì.

## Đo lường thật

Trên một máy laptop bình thường (M-series Mac, Redis local):

```bash
$ redis-benchmark -t set,get -n 100000 -q
SET: 162338.71 requests per second, p50=0.151 msec
GET: 168918.92 requests per second, p50=0.143 msec
```

→ **~165k ops/giây**, mỗi lệnh dưới 0.2 ms ở p50. Đó là single thread một instance không tinh chỉnh gì.

Trên server cloud thật (AWS m6i.xlarge): 200k - 400k ops/giây/instance là bình thường. Một Redis Cluster 10 node có thể vượt **2 triệu ops/giây**.

## Mặt trái của tốc độ — những gì bạn phải đánh đổi

| Đánh đổi | Hệ quả thực tế |
|---|---|
| Bị giới hạn bởi RAM | Phải tính toán memory footprint, dùng eviction, sharding |
| Không có JOIN/query phức tạp | Phải thiết kế "query-first" — biết trước cách truy vấn rồi chọn cấu trúc |
| Single-threaded | Phải tránh lệnh chậm (`KEYS`, `SMEMBERS` set lớn), dùng `SCAN`, pipeline |
| Persistence không bằng SQL | Có thể mất vài giây cuối khi crash với cấu hình mặc định |
| Không có lược đồ | Tự chịu trách nhiệm naming, kiểu dữ liệu, version control |

## Quy tắc thực hành rút ra

1. **Không quét toàn bộ keyspace** với `KEYS *` ở production — dùng `SCAN`.
2. **Tránh value khổng lồ** trên một key — chia nhỏ. Một `LRANGE` trên list 10 triệu phần tử sẽ chặn server.
3. **Đặt expiration cho cache** — đừng để Redis bị OOM vì key "tồn tại mãi".
4. **Pipeline & batch** lệnh khi cần gửi nhiều (giảm chi phí round-trip mạng — sẽ học ở phase sau).
5. **Đo p99 latency, không chỉ p50** — single thread nên outlier có thể nhảy lên do GC, fork RDB, big key.
6. **Thiết kế từ query** — luôn đặt câu hỏi: "tôi cần đọc/ghi thế nào?" trước khi chọn data structure.

## Tóm tắt bài 2

- Redis nhanh do **3 lý do bổ sung lẫn nhau**: dữ liệu trong RAM, cấu trúc dữ liệu đơn giản đã biết, feature set đơn giản với event loop single-thread.
- Mỗi lý do đi kèm trade-off: giới hạn RAM, mất linh hoạt query, dễ bị chặn bởi lệnh chậm.
- Hiệu năng thực: ~100k-400k ops/giây/instance, độ trễ sub-millisecond.
- Tư duy đúng khi dùng Redis: **chọn data structure trước, biết trước cách query** → đây là chủ đề lớn của phase-3 (Redis design methodology).

**Bài kế tiếp** → [Bài 3: Các cách triển khai Redis (Cloud vs Local)](03-cac-loai-deployment.md)
