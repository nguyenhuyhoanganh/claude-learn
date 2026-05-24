# Bài 1: Redis là gì?

## Một câu trả lời ngắn gọn

> **Redis** = **RE**mote **DI**ctionary **S**erver — một **database lưu trữ toàn bộ dữ liệu trong RAM**, được tổ chức theo cấu trúc **key → value**, nổi tiếng vì tốc độ truy cập **sub-millisecond** (dưới 1 ms).

Đọc lại định nghĩa trên một lần nữa. Có 4 ý chính:

1. **Database**: nơi lưu trữ dữ liệu lâu dài (persistent) hoặc tạm thời, ta có thể ghi vào và đọc ra sau này.
2. **In-memory** (lưu trong RAM): toàn bộ dataset nằm trong bộ nhớ trong, không nằm trên ổ cứng như MySQL/PostgreSQL.
3. **Key-value**: cách tổ chức dữ liệu đơn giản kiểu "danh bạ" — mỗi giá trị (value) được dán nhãn bởi một khoá (key) duy nhất.
4. **Cực nhanh**: do nằm trong RAM + thiết kế đơn giản, mỗi câu lệnh phản hồi trong vài chục microsecond đến dưới 1 ms.

## Đặt Redis vào bản đồ database

Để hiểu Redis làm tốt việc gì, ta cần xếp nó cạnh các database khác.

| Loại | Đại diện | Lưu ở đâu | Mô hình dữ liệu | Tốc độ | Mạnh ở |
|---|---|---|---|---|---|
| RDBMS | MySQL, PostgreSQL, SQL Server | Disk (có cache RAM) | Bảng quan hệ (table, row, column) | ms → 10ms | Query phức tạp, ACID, JOIN |
| Document DB | MongoDB, CouchDB | Disk (có cache RAM) | JSON document | ms → 10ms | Schema linh hoạt, nested data |
| Wide-column | Cassandra, HBase | Disk (SSTable) | Column family | ms | Ghi rất nhiều, phân tán cực lớn |
| Graph DB | Neo4j, Neptune | Disk | Node + relationship | ms | Quan hệ nhiều bước (social, knowledge graph) |
| **In-memory KV** | **Redis**, Memcached | **RAM** | **Key-value** | **microsecond → sub-ms** | **Cache, counter, queue, real-time** |
| Time-series | InfluxDB, TimescaleDB | Disk tối ưu | Time-stamped value | ms | Metric, IoT, logging |
| Search engine | Elasticsearch, Solr | Disk (Lucene index) | Inverted index | ms → 100ms | Full-text search, log analytics |

> **Lưu ý quan trọng**: Redis không "thay thế" các database trên. Trong kiến trúc thực tế, Redis thường nằm **bên cạnh** một database chính (PostgreSQL, MongoDB...) đóng vai trò là **lớp tăng tốc / cache / data structure server**.

## "Key-value" cụ thể là gì?

Hình dung Redis như một **HashMap khổng lồ** chạy như một server. Bạn truy cập từ xa qua giao thức mạng (TCP):

```text
+-----------------------------------------------+
| Redis Server (RAM)                            |
|                                               |
|  "user:1001"        → "Alice"                 |
|  "user:1002"        → "Bob"                   |
|  "page:home:html"   → "<html>...</html>"      |
|  "cart:1001"        → [item-a, item-b, ...]   |
|  "leaderboard:game" → {bob: 99, alice: 87,...}|
|  "stream:orders"    → [(t1,...),(t2,...),...] |
|                                               |
+-----------------------------------------------+
```

Lưu ý: **value** ở đây không chỉ là string. Redis hỗ trợ nhiều **kiểu dữ liệu** (data type) khác nhau: string, list, hash, set, sorted set, stream, bitmap, hyperloglog, geo, JSON, vector... Ta sẽ học từng cái trong các phase sau.

## "Server" và mô hình client-server

Redis là một **process server** lắng nghe trên cổng TCP (mặc định **6379**). Mọi tương tác với Redis đi qua **client** kết nối qua mạng (kể cả khi client chạy cùng máy với server, vẫn dùng TCP hoặc Unix socket).

```text
   +----------+                  +-------------+
   |  Client  | <-- TCP 6379 --> | Redis Server|
   | (app)    |   RESP protocol  |  (in-memory)|
   +----------+                  +-------------+
```

- **RESP** (REdis Serialization Protocol) là giao thức dạng text-based mà client và server dùng để nói chuyện. Bạn không cần viết RESP thủ công — các client library lo việc đó. (Phase-2 sẽ giải thích chi tiết.)
- Một Redis server có thể phục vụ hàng chục nghìn client đồng thời nhờ **kiến trúc single-threaded, event-loop** (giống Node.js). Hệ quả: lệnh chạy **tuần tự**, không có race condition giữa hai lệnh — đây là tính chất cực kỳ quan trọng cho counter, lock, queue.

## Một số dùng phổ biến trong sản phẩm thật

Để hình dung Redis dùng để làm gì, đây là **6 use case** ta sẽ học làm thực tế xuyên suốt khoá này:

1. **Cache** — lưu kết quả query đắt tiền (page HTML, SQL result, API response), tăng tốc app, giảm tải DB chính.
2. **Session store** — lưu phiên đăng nhập của user (thay cookie/JWT khi cần revoke nhanh).
3. **Counter / Rate-limit** — đếm số request, like, view; giới hạn API call (atomic increment).
4. **Leaderboard / Ranking** — bảng xếp hạng top user, top sản phẩm (sorted set).
5. **Queue / Pub-Sub / Stream** — message broker, task queue (Sidekiq, Bull, RQ), event sourcing.
6. **Lock phân tán** — đồng bộ giữa nhiều instance app (SET NX + EX, RedLock).

Ngoài ra: real-time analytics, geospatial query (tìm cửa hàng gần nhất), full-text search (RediSearch), vector search cho AI (Redis Stack).

## Một định nghĩa hoàn chỉnh hơn (sau khi đã nắm các ý trên)

> **Redis** là một **in-memory data structure server** mã nguồn mở, lưu **toàn bộ dataset trong RAM**, tổ chức theo mô hình **key-value** với **value đa kiểu cấu trúc**, giao tiếp qua **giao thức RESP trên TCP**, thường dùng làm **cache, session store, message broker, real-time database** trong các hệ thống cần độ trễ thấp.

## Lịch sử nhanh (để hiểu tại sao Redis trông như vậy)

- **2009** — Salvatore Sanfilippo (Antirez) viết Redis bằng C để giải quyết bottleneck cho startup phân tích web log của ông. Lý do tự viết: các giải pháp lúc đó (Memcached) chỉ làm cache key-value đơn thuần, không hỗ trợ data structure.
- **2010-2015** — Redis bùng nổ trong cộng đồng web/startup. Twitter, GitHub, StackOverflow, Snapchat đều dùng.
- **2015** — Redis Labs (nay là Redis Inc.) thành lập, đóng vai trò công ty thương mại đứng sau Redis open-source.
- **2020** — Antirez nghỉ vai trò maintainer chính.
- **2024** — Redis đổi license từ BSD sang **RSALv2/SSPLv1** (license nguồn-sẵn-có nhưng có giới hạn thương mại). Ngay sau đó, Linux Foundation fork ra **Valkey** (BSD-3) — về cú pháp/lệnh **gần như giống hệt** Redis OSS 7.x, dùng được lẫn nhau. Trong khoá này, kiến thức **áp dụng được cho cả Redis và Valkey**.
- **2025** — Redis Inc. quay lại với license AGPL cho Redis 8, mở rộng vector search, Redis Stack.

> **Bạn cần biết**: cú pháp lệnh Redis cực kỳ ổn định, hầu như không thay đổi qua các phiên bản. Code/lệnh học hôm nay vẫn dùng được 5-10 năm nữa.

## Vài hiểu lầm cần dẹp ngay

| Hiểu lầm | Thực tế |
|---|---|
| "Redis là cache, không phải database" | Redis có persistence (RDB snapshot + AOF log), replication, transaction → là database thực thụ. Cache chỉ là một use case. |
| "Mất điện là mất dữ liệu vì lưu trong RAM" | Sai — Redis ghi định kỳ ra disk (RDB) và ghi log thao tác (AOF). Trade-off có thể mất vài giây cuối nếu dùng `appendfsync everysec`. |
| "Redis chỉ lưu được string ngắn" | Sai — Redis hỗ trợ list, hash, set, sorted set, stream... và value string có thể đến 512 MB. |
| "Redis chỉ chạy được một core (single-threaded → chậm)" | Single-threaded ở phần xử lý lệnh, nhưng I/O có thể đa luồng từ Redis 6+. Một instance vẫn đạt 100k+ ops/giây trên 1 core. |
| "Redis không scale được vì single-threaded" | Sai — scale bằng **replication** (đọc) và **Cluster** (sharding) khi cần > 100k ops/s. |

## Khi nào KHÔNG nên chọn Redis

Hiểu giới hạn quan trọng không kém hiểu sức mạnh:

- **Dataset rất lớn nhưng ngân sách hạn chế** — RAM đắt hơn disk ~50x. Lưu 1 TB log vào Redis là phí tiền; nên dùng object storage (S3) hoặc data warehouse.
- **Cần query phức tạp ad-hoc** (JOIN nhiều bảng, GROUP BY, aggregate động) — đây là sở trường của SQL DB. Redis cần ta **biết trước query** để chọn data structure phù hợp (phase-3 sẽ học sâu).
- **Cần ACID đầy đủ với consistency cao** — Redis có `MULTI/EXEC` (transaction) và Lua script, nhưng không có rollback tự động khi lệnh trong transaction lỗi (chỉ skip lệnh đó). Dùng SQL DB nếu cần atomic + isolation level cao.
- **Compliance yêu cầu mọi ghi phải bền vững ngay lập tức** — Redis ưu tiên tốc độ; durability "ngay tức khắc" với `appendfsync always` sẽ làm Redis chậm như SQL DB → mất lợi thế.

## Tóm tắt bài 1

- Redis là **in-memory key-value database** với value đa cấu trúc.
- Kiến trúc **client-server, single-threaded event loop, RESP protocol trên TCP 6379**.
- Định vị: nằm **cạnh** database chính, làm cache / data structure server / real-time layer.
- 6 use case kinh điển: cache, session, counter, leaderboard, queue, lock.
- Không phải "viên đạn bạc" — biết khi nào KHÔNG dùng cũng quan trọng.

**Bài kế tiếp** → [Bài 2: Vì sao Redis nhanh đến vậy? Đi sâu vào 3 lý do](02-vi-sao-redis-nhanh.md)
