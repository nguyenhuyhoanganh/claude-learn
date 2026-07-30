# Case 4: Hot row — khi cả nghìn người tranh nhau một dòng dữ liệu

Bạn đã rút transaction xuống 2 ms, đã bỏ hết lời gọi HTTP ra ngoài, đã đặt `lock_timeout`. Hệ thống vẫn nghẽn khi flash sale.

Lý do: dù transaction chỉ 2 ms, **10.000 người vẫn phải xếp hàng đi qua một cánh cửa duy nhất**.

```text
   Thông lượng tối đa trên MỘT dòng = 1 / thời_gian_giữ_lock
                                     = 1 / 0,002
                                     = 500 UPDATE/giây

   Cần: 10.000 đơn trong 10 giây = 1.000 đơn/giây
   ⇒ Vẫn thiếu gấp đôi. Và không có cách nào tăng thêm bằng cách tối ưu SQL.
```

Đây là **hot row problem** (dòng nóng) — giới hạn vật lý, không phải lỗi cấu hình. Bài này trình bày 7 kỹ thuật vượt qua nó, kèm đánh đổi của từng cái.

## Nhận diện hot row

Hot row xuất hiện khi có một bản ghi mà **rất nhiều giao dịch cùng muốn ghi**:

| Tình huống | Dòng nóng | Mức độ |
|---|---|---|
| Flash sale một sản phẩm | `inventory[sku=IPHONE]` | Cực cao |
| Đếm lượt xem bài viết viral | `post[id=123].view_count` | Cực cao |
| Trừ số dư ví của merchant lớn | `account[id=SHOPEE].balance` | Cao |
| Sinh số hoá đơn tuần tự | `sequence[type=INVOICE]` | Cao |
| Cập nhật tổng doanh thu ngày | `daily_stats[date=today]` | Cao |
| Đếm số người trong phòng chat | `room[id=X].member_count` | Trung bình |

Điểm chung: **một hàng, nhiều người ghi**. Phân biệt với "bảng nóng" (nhiều dòng khác nhau bị ghi nhiều) — bảng nóng thì scale được bằng phần cứng, dòng nóng thì không.

### Chẩn đoán

```sql
-- PostgreSQL: xem query nào chờ lock nhiều nhất
SELECT wait_event_type, wait_event, count(*), left(query, 60)
FROM pg_stat_activity
WHERE wait_event_type = 'Lock'
GROUP BY 1,2,4
ORDER BY 3 DESC;
```

```sql
-- MySQL: dòng nào bị chờ nhiều nhất
SELECT object_name, index_name, lock_type, lock_mode, count(*)
FROM performance_schema.data_locks
WHERE lock_status = 'WAITING'
GROUP BY 1,2,3,4
ORDER BY 5 DESC;
```

Nếu kết quả tập trung vào **một giá trị khoá duy nhất**, bạn đã xác nhận hot row.

## Kỹ thuật 1: Chia nhỏ counter (counter sharding)

Ý tưởng: thay vì một dòng, dùng N dòng và cộng ngẫu nhiên vào một trong số đó.

```sql
CREATE TABLE view_counter (
    post_id  BIGINT NOT NULL,
    shard    SMALLINT NOT NULL,
    count    BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (post_id, shard)
);

-- Khởi tạo 16 shard cho mỗi bài viết
INSERT INTO view_counter (post_id, shard, count)
SELECT 123, generate_series(0, 15), 0;
```

```java
public void incrementView(long postId) {
    int shard = ThreadLocalRandom.current().nextInt(16);
    jdbc.update("UPDATE view_counter SET count = count + 1 " +
                "WHERE post_id = ? AND shard = ?", postId, shard);
}

public long getViews(long postId) {
    return jdbc.queryForObject(
        "SELECT COALESCE(SUM(count), 0) FROM view_counter WHERE post_id = ?",
        Long.class, postId);
}
```

```text
   Trước:  1 dòng  → 500 UPDATE/giây
   Sau:   16 dòng  → 8.000 UPDATE/giây  (tăng 16 lần)
```

**Đánh đổi**:

| Ưu | Nhược |
|---|---|
| Đơn giản, không đổi kiến trúc | Đọc phải `SUM` 16 dòng (chậm hơn, nhưng vẫn nhanh) |
| Thông lượng tăng tuyến tính theo số shard | Không dùng được khi cần kiểm tra ràng buộc tổng (`stock >= 0`) |
| Vẫn nằm trong database, vẫn ACID | Số shard cố định, đổi thì phải migrate |

**Không dùng được cho tồn kho** — vì không thể kiểm tra "còn hàng không" nếu số lượng nằm rải rác 16 dòng. Có biến thể xử lý được (mỗi shard giữ một phần kho, hết thì mượn shard khác) nhưng phức tạp hơn nhiều.

Kỹ thuật này lý tưởng cho **counter chỉ tăng, không có ràng buộc**: lượt xem, lượt thích, số lần tải.

## Kỹ thuật 2: Gom lô (batching)

Thay vì mỗi request một UPDATE, gom nhiều request lại rồi UPDATE một lần.

```java
@Component
public class ViewCounterBuffer {
    private final ConcurrentHashMap<Long, LongAdder> buffer = new ConcurrentHashMap<>();

    public void increment(long postId) {
        buffer.computeIfAbsent(postId, k -> new LongAdder()).increment();
    }

    @Scheduled(fixedDelay = 1000)      // mỗi giây ghi xuống DB một lần
    public void flush() {
        Map<Long, Long> snapshot = new HashMap<>();
        buffer.forEach((postId, adder) -> {
            long value = adder.sumThenReset();
            if (value > 0) snapshot.put(postId, value);
        });
        if (snapshot.isEmpty()) return;

        jdbc.batchUpdate(
            "UPDATE post SET view_count = view_count + ? WHERE id = ?",
            snapshot.entrySet().stream()
                .map(e -> new Object[]{ e.getValue(), e.getKey() })
                .toList());
    }
}
```

```text
   10.000 lượt xem/giây trên 1 bài viết
   Trước: 10.000 UPDATE/giây  → nghẽn
   Sau:        1 UPDATE/giây  → không nghẽn chút nào
   ⇒ Giảm tải 10.000 lần
```

**Đánh đổi**:

- **Mất dữ liệu khi crash**: bộ đệm nằm trong RAM. Pod chết là mất tối đa 1 giây dữ liệu. Với lượt xem thì chấp nhận được; với tiền thì tuyệt đối không.
- **Dữ liệu trễ**: người dùng không thấy con số cập nhật tức thì.
- **Không dùng được khi nhiều instance cần thấy nhau ngay**: mỗi pod có bộ đệm riêng.

Đây là đánh đổi kinh điển giữa **độ chính xác tức thời** và **thông lượng**. Với các con số "hiển thị cho vui" (lượt xem, lượt thích), gần như luôn nên chọn thông lượng.

## Kỹ thuật 3: Đưa sang Redis

Redis là single-threaded và `INCR` là thao tác nguyên tử — nó xử lý được ~100.000 lệnh/giây trên một khoá.

```java
public long incrementView(long postId) {
    return redis.opsForValue().increment("views:" + postId);
}

// Đồng bộ về database định kỳ để lưu bền vững
@Scheduled(fixedDelay = 60000)
public void syncToDatabase() {
    Set<String> keys = redis.keys("views:*");
    for (String key : keys) {
        long postId = Long.parseLong(key.substring(6));
        Long count = redis.opsForValue().get(key);
        jdbc.update("UPDATE post SET view_count = ? WHERE id = ?", count, postId);
    }
}
```

> Lưu ý: `KEYS *` chặn Redis, đừng dùng trên production. Dùng `SCAN`, hoặc giữ danh sách khoá thay đổi trong một `SET` riêng.

Với bài toán tồn kho, Redis còn làm được cả kiểm tra ràng buộc bằng Lua script (chạy nguyên tử):

```lua
-- reserve.lua: trừ kho nguyên tử, có kiểm tra
local stock = tonumber(redis.call('GET', KEYS[1]) or 0)
local qty = tonumber(ARGV[1])
if stock >= qty then
    redis.call('DECRBY', KEYS[1], qty)
    return 1        -- thành công
else
    return 0        -- hết hàng
end
```

```java
private final RedisScript<Long> reserveScript =
    RedisScript.of(new ClassPathResource("reserve.lua"), Long.class);

public boolean reserve(String sku, int qty) {
    Long ok = redis.execute(reserveScript, List.of("stock:" + sku), String.valueOf(qty));
    return ok != null && ok == 1;
}
```

**Đánh đổi**:

| Ưu | Nhược |
|---|---|
| Thông lượng ~100k ops/giây trên một khoá | Thêm một hệ thống phải vận hành |
| Lua script cho phép kiểm tra ràng buộc nguyên tử | **Không ACID chung với database** — Redis thành công mà DB thất bại thì lệch |
| Latency dưới 1 ms | Redis mất dữ liệu nếu chưa persist (AOF/RDB) |

Vấn đề "lệch giữa Redis và DB" là thật và phải xử lý: thường dùng mẫu **outbox** hoặc job đối soát định kỳ. Đừng coi nhẹ.

## Kỹ thuật 4: Hàng đợi tuần tự hoá

Thay vì cho 10.000 người tranh nhau, đưa tất cả vào một hàng đợi và xử lý theo thứ tự.

```text
   10.000 request → [Kafka topic: orders, partition theo SKU]
                              ↓
                    Consumer xử lý tuần tự cho từng SKU
                              ↓
                    UPDATE inventory — KHÔNG CÓ TRANH CHẤP
                    (chỉ một consumer ghi vào mỗi SKU)
```

Điểm mấu chốt: **partition theo SKU**. Kafka đảm bảo mọi message cùng khoá vào cùng partition, và mỗi partition chỉ có một consumer trong group. Nghĩa là mọi thao tác trên `SKU-IPHONE` được xử lý tuần tự bởi một consumer duy nhất — không cần lock nào cả.

```java
@KafkaListener(topics = "order-requests", concurrency = "12")
public void handle(OrderRequest req) {
    // Chỉ MỘT consumer xử lý SKU này → không tranh chấp
    boolean ok = inventoryService.reserve(req.getSku(), req.getQty());
    resultProducer.send(new OrderResult(req.getId(), ok));
}
```

```java
// Bên gửi: đảm bảo cùng SKU vào cùng partition
kafkaTemplate.send("order-requests", req.getSku(), req);
//                                    ↑ key = SKU
```

**Đánh đổi**:

- **Bất đồng bộ**: người dùng không nhận kết quả ngay. Phải trả `202 Accepted` và thông báo sau (WebSocket, polling, push).
- **Phức tạp hơn nhiều**: cần Kafka, cần xử lý idempotency, cần theo dõi lag.
- **Vẫn có giới hạn**: một consumer xử lý một SKU vẫn có trần thông lượng — nhưng cao hơn nhiều vì không có chi phí lock và có thể gom lô.

Đây là giải pháp của các sàn thương mại điện tử lớn cho flash sale. Nó đổi trải nghiệm người dùng ("đang xử lý...") lấy khả năng chịu tải khổng lồ.

## Kỹ thuật 5: Cấp phát trước (pre-allocation / ticket)

Chia sẵn kho thành các "lô vé" và phát cho từng instance.

```text
   Kho: 10.000 sản phẩm, 10 instance ứng dụng

   Mỗi instance nhận trước 1.000 vé (một lần UPDATE duy nhất)
        ↓
   Instance bán từ kho cục bộ của nó — KHÔNG chạm database
        ↓
   Hết vé thì xin lô mới
```

```java
@Component
public class TicketPool {
    private final AtomicInteger local = new AtomicInteger(0);
    private static final int CHUNK = 1000;

    public synchronized boolean tryAcquire() {
        if (local.get() > 0) {
            local.decrementAndGet();
            return true;
        }
        int got = fetchChunkFromDb(CHUNK);      // 1 UPDATE cho 1000 lượt bán
        if (got == 0) return false;
        local.set(got - 1);
        return true;
    }

    private int fetchChunkFromDb(int want) {
        return jdbc.queryForObject(
            "UPDATE inventory SET stock = stock - LEAST(stock, ?) " +
            "WHERE sku = ? RETURNING LEAST(stock + ?, ?)",
            Integer.class, want, sku, want, want);
    }
}
```

```text
   Trước: 10.000 UPDATE trên dòng nóng
   Sau:      10 UPDATE (mỗi instance 1 lần)
   ⇒ Giảm 1.000 lần
```

**Đánh đổi**:

- **Kho có thể "kẹt"**: instance A còn 300 vé chưa bán nhưng instance B đã hết. Khách thấy "hết hàng" trong khi thực ra còn. Cần cơ chế trả vé thừa về.
- **Mất vé khi instance chết**: 300 vé trong RAM của pod bị giết là mất. Cần job đối soát.
- Chỉ phù hợp khi **không cần chính xác tuyệt đối** hoặc chấp nhận được cơ chế đối soát.

Đây là kỹ thuật rất phổ biến cho sinh số tuần tự (`sequence` với `CACHE 1000` của PostgreSQL chính là ý tưởng này).

## Kỹ thuật 6: Optimistic locking + retry

Không khoá gì, chỉ kiểm tra khi ghi:

```sql
UPDATE inventory
SET stock = stock - 1, version = version + 1
WHERE sku = 'ABC' AND version = 42 AND stock >= 1;
```

Nếu `updated == 0` nghĩa là ai đó đã sửa trước, đọc lại và thử lại.

**Với hot row, cách này thường TỆ HƠN pessimistic locking.** Lý do: tỉ lệ xung đột quá cao, phần lớn giao dịch phải thử lại nhiều lần, và mỗi lần thử lại là một vòng round-trip tới database.

```text
   Tỉ lệ xung đột thấp (< 5%)  → optimistic thắng rõ rệt
   Tỉ lệ xung đột cao (> 30%)  → pessimistic thắng
   Hot row (~100% xung đột)    → optimistic là thảm hoạ
```

Case 5 sẽ so sánh kỹ hai chiến lược này.

## Kỹ thuật 7: Thiết kế lại để không cần dòng nóng

Đôi khi câu trả lời đúng là thay đổi mô hình dữ liệu.

```sql
-- THAY VÌ: một dòng tồn kho bị cập nhật liên tục
inventory(sku, stock)

-- DÙNG: bảng chỉ INSERT, không UPDATE
CREATE TABLE stock_movement (
    id BIGSERIAL PRIMARY KEY,
    sku TEXT NOT NULL,
    delta INT NOT NULL,           -- +100 nhập kho, -1 bán
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Tồn kho hiện tại = tổng các biến động
SELECT SUM(delta) FROM stock_movement WHERE sku = 'ABC';
```

`INSERT` **không tranh chấp với nhau** — mỗi giao dịch ghi một dòng mới, không ai chặn ai. Thông lượng tăng vọt.

**Đánh đổi**:

- Đọc trở nên đắt (`SUM` hàng triệu dòng) → cần **bảng tổng hợp** (materialized view) cập nhật định kỳ.
- Không thể kiểm tra `stock >= 0` một cách nguyên tử → có thể bán âm kho, cần bù trừ sau.
- Bảng phình nhanh → cần chiến lược lưu trữ/gộp cũ.

Đây chính là ý tưởng nền của **event sourcing**: lưu chuỗi sự kiện thay vì trạng thái hiện tại. Nó giải quyết hot row rất tốt nhưng kéo theo cả một mô hình kiến trúc.

## Bảng so sánh 7 kỹ thuật

| Kỹ thuật | Thông lượng | Chính xác tức thì | Phức tạp | Phù hợp nhất với |
|---|---|---|---|---|
| Counter sharding | ×N (số shard) | Có | Thấp | Counter không ràng buộc |
| Gom lô trong bộ nhớ | ×1000+ | **Không** | Thấp | Lượt xem, thống kê |
| Redis + Lua | ×200 | Có | Trung bình | Tồn kho flash sale |
| Hàng đợi Kafka | ×100+ | **Không** (async) | Cao | Đơn hàng quy mô lớn |
| Cấp phát trước | ×1000 | Gần đúng | Trung bình | Vé, số tuần tự |
| Optimistic + retry | **Giảm** | Có | Thấp | **Không dùng cho hot row** |
| Thiết kế lại (append-only) | ×100+ | Có (ghi), trễ (đọc) | Cao | Hệ thống mới |

## Cây quyết định

```text
   Dòng nóng của bạn là gì?
   │
   ├─ Counter thuần tuý (view, like), không ràng buộc
   │    ├─ Cần chính xác tuyệt đối? → Counter sharding
   │    └─ Chấp nhận trễ 1 giây?    → Gom lô  ← thường là lựa chọn tốt nhất
   │
   ├─ Tồn kho / số dư, CÓ ràng buộc không âm
   │    ├─ Quy mô vừa (< 1.000/giây)  → Rút transaction + lock_timeout
   │    ├─ Flash sale (> 5.000/giây)  → Redis + Lua, đối soát về DB
   │    └─ Quy mô rất lớn, chấp nhận async → Hàng đợi Kafka partition theo SKU
   │
   └─ Sinh số tuần tự → Sequence có CACHE, hoặc cấp phát trước
```

## Trường hợp thực tế: flash sale 5.000 iPhone

Yêu cầu: bán 5.000 máy trong 30 giây, không được bán quá số lượng (oversell), 200.000 người vào cùng lúc.

**Kiến trúc chọn dùng — nhiều tầng lọc**:

```text
   200.000 người
        ↓
   [Tầng 1] Rate limit ở gateway: mỗi IP 1 request/giây
        ↓ còn ~50.000
   [Tầng 2] Redis: kiểm tra đã mua chưa (SET NX per user)
        ↓ còn ~50.000 người hợp lệ
   [Tầng 3] Redis Lua: DECRBY stock, hết thì trả về ngay
        ↓ chỉ 5.000 người qua được
   [Tầng 4] Kafka: đẩy 5.000 đơn vào topic
        ↓
   [Tầng 5] Consumer ghi database với tốc độ vừa phải
```

Nguyên tắc thiết kế: **lọc sớm, lọc rẻ**. 195.000 người bị từ chối ở tầng Redis với chi phí 0,2 ms mỗi người, không bao giờ chạm tới database.

Kết quả đo:

```text
   Đỉnh: 47.000 request/giây tới Redis
   Database: chỉ nhận 5.000 INSERT trong 20 giây (250/giây) — nhàn nhã
   Không có oversell
   p99 phản hồi cho người dùng: 85 ms (kể cả người bị từ chối)
```

Điểm đáng học: **database không hề bị chạm tới trong lúc cao điểm**. Nó chỉ ghi nhận kết quả sau đó. Đây là mẫu hình chung của mọi hệ thống flash sale nghiêm túc.

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Dùng optimistic locking cho hot row | Tỉ lệ retry ~100%, tệ hơn không làm gì |
| Gom lô cho dữ liệu tiền bạc | Mất tiền khi pod restart |
| Redis không có cơ chế đối soát với DB | Số liệu lệch dần, không ai phát hiện |
| Counter sharding cho tồn kho | Không kiểm tra được ràng buộc tổng |
| Cấp phát trước mà không trả vé thừa | Báo hết hàng trong khi còn |
| Nghĩ thêm replica sẽ giúp | Replica chỉ giúp **đọc**; ghi vẫn dồn vào primary |
| Nghĩ sharding database sẽ giúp | Dòng nóng vẫn nằm trên **một** shard |

Hai bẫy cuối rất phổ biến ở người mới học kiến trúc: hot row là bài toán **không giải được bằng cách thêm máy**. Phải đổi cách ghi dữ liệu.

## Tóm tắt case 4

- Hot row là **giới hạn vật lý**: `thông lượng = 1 / thời_gian_giữ_lock` trên một dòng.
- Không giải được bằng thêm máy, thêm replica, hay sharding.
- 7 kỹ thuật: **sharding counter, gom lô, Redis+Lua, hàng đợi, cấp phát trước, optimistic (không nên), thiết kế lại append-only**.
- **Optimistic locking là lựa chọn tệ nhất cho hot row** — tỉ lệ xung đột gần 100%.
- Counter hiển thị → **gom lô** (rẻ nhất, hiệu quả nhất). Tồn kho flash sale → **Redis + Lua**.
- Kafka partition theo khoá nghiệp vụ = **tuần tự hoá không cần lock**.
- Nguyên tắc thiết kế flash sale: **lọc sớm, lọc rẻ** — database không được chạm tới lúc cao điểm.
- Mọi giải pháp đều đánh đổi: độ chính xác tức thì, tính bền vững, hoặc độ phức tạp. Chọn có ý thức.

**Bài kế tiếp** → [Case 5: Optimistic vs Pessimistic locking — chọn sai là hỏng cả hệ thống](05-case-optimistic-vs-pessimistic.md)
