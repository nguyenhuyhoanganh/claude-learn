# Bài 1: Mô hình key-value và các kiểu dữ liệu Redis

Trước khi học bất kỳ lệnh nào, ta cần một **mô hình tư duy** đúng về cách Redis tổ chức dữ liệu. Sai mô hình từ đầu sẽ dẫn tới thiết kế xấu cho mọi feature sau này.

## Một câu mô tả Redis cho người mới

> Redis là **một dictionary toàn cục, sống trong RAM của server**, mà bạn truy cập qua mạng. Mỗi entry trong dictionary có **một key (string)** và **một value (kiểu cấu trúc bạn chọn)**.

Đó là một mức trừu tượng đơn giản, nhưng cực kỳ mạnh mẽ. Mọi tính năng của Redis dựng trên ý tưởng này.

## Key là gì?

- **Key luôn là string** (chuỗi byte). Có thể chứa text, dấu chấm, hai chấm, số, UTF-8 — kể cả binary data.
- **Không có "lược đồ"**. Bạn không khai báo trước "tôi sẽ tạo key tên này, kiểu này". Khi bạn gọi `SET user:1 ...`, key xuất hiện. Khi bạn `DEL user:1`, nó biến mất.
- **Tối đa 512 MB** mỗi key (nhưng thực tế nên giữ key ngắn để tiết kiệm memory).
- Không phân biệt chữ hoa/thường ở cấp lệnh, nhưng **có phân biệt ở key**: `User:1` và `user:1` là 2 key khác nhau.

### Quy ước đặt tên key (sẽ học sâu ở phase-3)

Hầu hết người dùng Redis dùng pattern `namespace:entity:id[:subfield]`:

```text
user:1001              → toàn bộ user 1001 (thường là hash)
user:1001:profile      → profile riêng
user:1001:sessions     → list các session
session:abc123         → một session cụ thể
cache:page:home        → cache của trang home
order:2025:001234      → một order, có cả năm trong tên
```

Lý do dùng `:` chứ không phải `.`/`/` — đây là **quy ước cộng đồng** từ những ngày đầu Redis; mọi tool (RedisInsight, redis-cli...) hiển thị tree view dựa trên dấu hai chấm.

## Value là gì?

Value KHÔNG chỉ là string. Redis hỗ trợ **10+ kiểu cấu trúc** ngay từ core. Mỗi kiểu có một bộ lệnh riêng. Đây là bảng tổng quan để bạn có "bản đồ":

| Kiểu | Hình dung | Khi nào dùng | Lệnh tiêu biểu |
|---|---|---|---|
| **String** | byte buffer (text/số/binary, tối đa 512 MB) | Cache HTML/JSON, counter, lock, bitmap | `SET`, `GET`, `INCR`, `APPEND` |
| **List** | linked list của string | Queue, gần đây xem, message inbox | `LPUSH`, `RPUSH`, `LPOP`, `LRANGE` |
| **Hash** | map field → value (cả 2 là string) | Object (user, product), tránh nhiều key nhỏ | `HSET`, `HGET`, `HGETALL`, `HINCRBY` |
| **Set** | tập không thứ tự, không trùng | Tag, follower, unique visitor | `SADD`, `SMEMBERS`, `SINTER`, `SISMEMBER` |
| **Sorted Set** | set có score (double), tự sắp xếp | Leaderboard, lịch trình, top-K | `ZADD`, `ZRANGE`, `ZRANGEBYSCORE` |
| **Stream** | append-only log, mỗi entry có ID + field-value | Event sourcing, message broker | `XADD`, `XREAD`, `XGROUP` |
| **Bitmap** | string xem như chuỗi bit | Active user mỗi ngày, feature flag | `SETBIT`, `GETBIT`, `BITCOUNT`, `BITOP` |
| **HyperLogLog** | xấp xỉ số phần tử duy nhất (12 KB) | Đếm unique visit cực lớn, sai số ~0.8% | `PFADD`, `PFCOUNT`, `PFMERGE` |
| **Geospatial** | sorted set với geohash | Tìm quanh đây, khoảng cách | `GEOADD`, `GEOSEARCH`, `GEODIST` |
| **Bit Field** | nhiều int kích cỡ tuỳ ý đóng gói trong 1 string | Counter nhiều chiều, lưu nén | `BITFIELD` |
| **JSON** (module) | JSON object thật | Document data | `JSON.SET`, `JSON.GET`, `JSON.ARRAPPEND` |

> Phase-2 này chỉ tập trung vào **String**. Các phase sau sẽ học từng kiểu một.

## Một key chỉ thuộc một kiểu

Khi bạn `SET user:1 "Alice"`, key `user:1` là **String**. Nếu sau đó bạn cố `LPUSH user:1 something`, Redis trả lỗi:

```text
WRONGTYPE Operation against a key holding the wrong kind of value
```

Lý do: Redis muốn lệnh **predictable** — `LPUSH` chỉ làm việc với list, không "tự chuyển kiểu". Đây là lý do **đặt tên key có namespace** quan trọng: tránh đụng kiểu giữa các feature.

Kiểm tra kiểu của key bằng:
```text
TYPE user:1
# → string  | list | hash | set | zset | stream | none
```

## Database index (DB)

Redis có sẵn **16 logical database** đánh số 0-15 (cấu hình được). Mỗi DB là một **không gian key tách biệt**. Mặc định client kết nối vào DB 0.

```text
SELECT 1        # chuyển sang DB 1
SET hello a     # set ở DB 1, không thấy ở DB 0
SELECT 0
GET hello       # → "world" (giá trị ở DB 0)
```

**Trong thực tế**:
- Logical DB là tính năng "legacy" — **Redis Cluster KHÔNG hỗ trợ** (chỉ DB 0).
- **Khuyến nghị**: dùng **namespace trong key** (`prod:`, `staging:`) thay vì logical DB. Code dễ migrate khi lên cluster.

## TTL — Time To Live (key có hạn dùng)

Mỗi key có thể có **thời gian sống**. Hết hạn, Redis tự xoá. Đây là tính năng cực mạnh cho cache, session, rate limit.

```text
SET cache:home "<html>...</html>" EX 60     # set kèm hết hạn 60 giây
TTL cache:home
# → 58       (còn 58 giây)

# Sau 60s:
GET cache:home
# → (nil)
TTL cache:home
# → -2       (key không tồn tại)

# Với key không TTL:
SET name "Alice"
TTL name
# → -1       (tồn tại, không expire)
```

Quy ước TTL return code:
- `>0`: số giây còn lại
- `-1`: key tồn tại nhưng không hết hạn
- `-2`: key không tồn tại (đã expire hoặc chưa từng được set)

Sẽ học cơ chế expiration sâu hơn ở [Bài 4](04-expiration-deep-dive.md).

## Atomicity — mọi lệnh đều atomic

Đây là **đặc tính cực kỳ quan trọng** của Redis:

> **Mỗi lệnh Redis là atomic** so với các lệnh từ client khác. Không có chuyện lệnh chạy "nửa chừng" bị xen ngang.

Hệ quả thực tế:
- `INCR counter` đảm bảo +1 chính xác kể cả khi 1000 client cùng gọi.
- `LPUSH queue item` không bao giờ chèn ½ phần tử.
- `HSET user:1 name Alice age 30` set cả hai field atomically.

Lý do: kiến trúc single-threaded của Redis. Một lệnh chạy xong mới đến lệnh kế tiếp.

> Có thêm `MULTI/EXEC` (transaction) để gom **nhiều lệnh** thành một block atomic. Đây là chủ đề riêng sau.

## Tổng quan về RESP protocol — request/response

Khi bạn gõ lệnh trong redis-cli, hoặc gọi `client.set()` trong code, đây là dòng chảy:

```text
[Bạn]  → SET hello world
        ↓
[Client wraps thành RESP]
        ↓
        bytes: *3\r\n$3\r\nSET\r\n$5\r\nhello\r\n$5\r\nworld\r\n
        ↓ qua TCP
[Redis nhận, parse RESP]
        ↓
[Redis tìm command "SET" trong command table]
        ↓
[Redis thực thi: gán "hello" → "world" vào dictionary]
        ↓
[Redis encode reply: "+OK\r\n"]
        ↓ qua TCP
[Client decode reply: "OK"]
        ↓
[Bạn thấy: OK]
```

Mỗi vòng request/response = một **round-trip** (RTT). Trên mạng nội bộ, RTT ~0.5 ms; xuyên region ~50-200 ms. Khi gửi nhiều lệnh, RTT là bottleneck chính → cần **pipelining** (sẽ học sau).

## Một số lệnh "trợ giúp" cần biết ngay

Trước khi vào bài SET/GET chính thức, đây là vài lệnh sẽ dùng xuyên suốt:

```text
PING                    # kiểm tra connection. Reply: PONG
ECHO "hello"            # echo lại chuỗi. Hữu ích test client

DBSIZE                  # tổng số key trong DB hiện tại
EXISTS user:1           # 1 nếu có, 0 nếu không
EXISTS user:1 user:2    # đếm số key tồn tại trong danh sách → 0/1/2
TYPE user:1             # kiểu: string/list/hash/set/zset/stream/none

DEL user:1              # xoá key, trả số key đã xoá
DEL user:1 user:2       # xoá nhiều key, trả số đã xoá thật sự (0..N)
UNLINK bigkey           # xoá NON-BLOCKING (chạy ở thread khác) — dùng với big key

RENAME old new          # đổi tên key (ghi đè nếu new đã tồn tại)
RENAMENX old new        # đổi tên chỉ khi new chưa tồn tại

KEYS pattern            # ❌ TRÁNH ở prod, chặn server
SCAN 0 MATCH user:*     # ✅ cách an toàn, cursor-based

FLUSHDB                 # ⚠️ XOÁ MỌI KEY trong DB hiện tại
FLUSHALL                # ⚠️ XOÁ MỌI KEY trong MỌI DB
```

> **`KEYS *` vs `SCAN`**: `KEYS` chạy O(N) một lần (chặn event loop khi N lớn). `SCAN` lặp nhiều bước nhỏ (cursor), không chặn — luôn dùng `SCAN` ở production.

## "Use case bản đồ" — đặt một feature vào kiểu nào?

Khi thiết kế feature mới, hỏi: **truy vấn của tôi cần gì?**

| Feature | Truy vấn chính | Kiểu phù hợp |
|---|---|---|
| Cache trang HTML | `GET cache:page:home` | String |
| Session user | đọc/ghi field (`user_id`, `csrf`...) | Hash hoặc String JSON |
| Đếm view bài viết | `+1` mỗi view, đọc tổng | String (INCR) |
| Top 100 user theo điểm | thêm điểm, xem top N | Sorted Set |
| Tag của bài viết | thêm/xoá tag, kiểm tra có tag X | Set |
| Hộp thư đến | thêm tin mới, lấy 20 tin gần nhất | List (LPUSH + LRANGE) |
| Order event log | append event, đọc từ ID X | Stream |
| Đã xem rồi (per user) | check một bài đã xem chưa | Bitmap (1 bit/bài) hoặc Set |
| Số unique IP/ngày | đếm xấp xỉ, không cần chính xác | HyperLogLog |
| Tìm cửa hàng gần | trả về điểm trong bán kính | Geospatial |

Tư duy này gọi là **query-driven design** — sẽ là chủ đề chính của phase-3.

## Tóm tắt bài 1

- Redis = dictionary toàn cục: key (string) → value (đa kiểu).
- 10+ kiểu cấu trúc; mỗi key thuộc đúng 1 kiểu; lệnh dùng đúng kiểu, sai kiểu → `WRONGTYPE`.
- TTL cho phép key tự hết hạn — nền tảng của cache.
- Mọi lệnh đơn lẻ là **atomic**.
- 16 logical DB là legacy — production hay dùng namespace + Cluster.
- Quy tắc an toàn: tránh `KEYS *`, `FLUSHALL`; dùng `SCAN`, `UNLINK`.

**Bài kế tiếp** → [Bài 2: SET và GET — hai lệnh cơ bản nhất](02-set-get-co-ban.md)
