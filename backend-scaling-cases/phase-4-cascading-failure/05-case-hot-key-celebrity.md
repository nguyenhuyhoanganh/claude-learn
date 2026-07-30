# Case 5: Hot key và bài toán người nổi tiếng

Bạn đã shard database ra 64 mảnh. Bạn có 20 node Redis. Bạn có 48 partition Kafka. Hệ thống được thiết kế để scale ngang hoàn hảo.

Rồi một ngôi sao có 50 triệu người theo dõi đăng một bài viết.

```text
   Node Redis #7:  98% CPU, latency 200 ms
   19 node còn lại: 3% CPU, latency 0,2 ms
```

Toàn bộ hệ thống nghẽn vì **một khoá duy nhất**. Đây là **hot key problem** — và biến thể nổi tiếng nhất của nó là **celebrity problem** (bài toán người nổi tiếng).

## Vì sao phân mảnh không cứu được

Mọi hệ thống phân tán đều dùng một hàm băm để quyết định dữ liệu nằm ở đâu:

```text
   node = hash(key) % số_node
```

Cách này chia đều **số lượng khoá**, nhưng không chia đều **lượng truy cập**.

```text
   1 triệu khoá chia đều cho 20 node → mỗi node 50.000 khoá  ✓ cân bằng

   Nhưng lượng truy cập:
   ├─ khoá "post:celebrity_123"  : 500.000 lượt/giây   ← nằm trên node #7
   └─ 999.999 khoá còn lại       : 1-10 lượt/giây mỗi cái

   ⇒ Node #7 nhận 90% tổng tải. 19 node kia rảnh rỗi.
```

**Phân bố truy cập trong thực tế luôn lệch** — thường theo quy luật Zipf: khoá phổ biến nhất được truy cập nhiều gấp nhiều lần khoá thứ hai, và top 1% khoá chiếm phần lớn traffic.

Điều này có nghĩa: **thêm node không giải quyết được hot key**. Khoá nóng vẫn nằm trên một node.

## Nhận diện hot key

### Redis

```bash
# Theo dõi trực tiếp (chỉ dùng thời gian ngắn — tốn tài nguyên)
redis-cli --hotkeys

# Lấy mẫu lệnh đang chạy (KHÔNG dùng lâu trên production)
redis-cli monitor | head -10000 | awk '{print $4}' | sort | uniq -c | sort -rn | head

# Kiểm tra phân bố tải giữa các node
redis-cli --cluster call <host>:<port> INFO commandstats
```

`redis-cli --hotkeys` cần `maxmemory-policy` được đặt là `allkeys-lfu` hoặc `volatile-lfu` để hoạt động.

### Kafka

```bash
# Xem phân bố message giữa các partition
kafka-run-class.sh kafka.tools.GetOffsetShell \
  --broker-list localhost:9092 --topic orders

# Nếu một partition có offset lớn hơn hẳn → hot partition
```

```promql
# Consumer lag theo partition — lệch nhiều = hot partition
kafka_consumergroup_lag{topic="orders"} by (partition)
```

### Database sharding

```sql
-- Chạy trên từng shard, so sánh
SELECT count(*), sum(access_count) FROM ...;
```

### Ở tầng ứng dụng — cách tổng quát nhất

```java
@Component
public class HotKeyDetector {
    // Count-Min Sketch: đếm xấp xỉ với bộ nhớ cố định
    private final ConcurrentHashMap<String, LongAdder> counts = new ConcurrentHashMap<>();

    public void record(String key) {
        counts.computeIfAbsent(key, k -> new LongAdder()).increment();
    }

    @Scheduled(fixedDelay = 10_000)
    public void report() {
        counts.entrySet().stream()
            .sorted((a, b) -> Long.compare(b.getValue().sum(), a.getValue().sum()))
            .limit(10)
            .forEach(e -> {
                if (e.getValue().sum() > HOT_THRESHOLD) {
                    log.warn("Hot key phát hiện: {} ({} lượt/10s)", e.getKey(), e.getValue().sum());
                    hotKeySet.add(e.getKey());        // đẩy vào cache cục bộ
                }
            });
        counts.clear();
    }
}
```

Với lượng khoá cực lớn, dùng **Count-Min Sketch** hoặc thuật toán **Space-Saving** để đếm xấp xỉ top-K với bộ nhớ cố định thay vì `ConcurrentHashMap` không giới hạn.

## Giải pháp cho hot key ĐỌC

### 1. Cache cục bộ cho khoá nóng — hiệu quả nhất

```java
@Component
public class TieredCache {
    private final Cache<String, Object> local = Caffeine.newBuilder()
        .maximumSize(1_000)                          // chỉ giữ khoá nóng
        .expireAfterWrite(Duration.ofSeconds(5))     // TTL RẤT NGẮN
        .build();

    public Object get(String key) {
        Object v = local.getIfPresent(key);
        if (v != null) return v;

        v = redis.get(key);
        if (v != null && hotKeyDetector.isHot(key)) {
            local.put(key, v);                       // chỉ cache cục bộ khoá nóng
        }
        return v;
    }
}
```

```text
   500.000 lượt/giây trên một khoá, 50 instance ứng dụng

   Trước: 500.000 lượt/giây tới Redis
   Sau:   50 instance × (1 / 5 giây) = 10 lượt/giây tới Redis

   ⇒ Giảm 50.000 lần.
```

TTL 5 giây là đánh đổi quan trọng: dữ liệu có thể cũ tối đa 5 giây. Với bài viết, số lượt thích, thông tin sản phẩm — hoàn toàn chấp nhận được. Với số dư tài khoản — không.

Chỉ cache cục bộ **khoá nóng**, không phải mọi khoá — nếu không bộ nhớ mỗi instance sẽ phình và hit rate thấp.

### 2. Nhân bản khoá (key replication)

Tạo N bản sao của khoá nóng, đọc ngẫu nhiên một bản:

```java
public Object getHot(String key) {
    int replica = ThreadLocalRandom.current().nextInt(REPLICAS);
    return redis.get(key + ":replica:" + replica);       // rải qua nhiều node
}

public void setHot(String key, Object value) {
    for (int i = 0; i < REPLICAS; i++) {
        redis.set(key + ":replica:" + i, value, TTL);
    }
}
```

Vì hậu tố khác nhau, hàm băm cho ra node khác nhau → tải được rải đều.

Đánh đổi: ghi tốn N lần, và có khoảng thời gian các bản sao không đồng nhất. Chỉ dùng cho dữ liệu đọc nhiều ghi ít.

### 3. Redis replica cho đọc

```java
LettuceClientConfiguration config = LettuceClientConfiguration.builder()
    .readFrom(ReadFrom.REPLICA_PREFERRED)     // đọc từ replica
    .build();
```

Đơn giản, không đổi code. Nhưng chỉ chia được tải đọc theo số replica (thường 2-3), và có độ trễ đồng bộ.

## Giải pháp cho hot key GHI

Ghi khó hơn nhiều vì không thể nhân bản.

### 1. Gom lô (đã nói ở phase-3 case 4)

```java
// Gom 1 giây rồi ghi một lần
buffer.merge(key, 1L, Long::sum);

@Scheduled(fixedDelay = 1000)
public void flush() {
    buffer.forEach((k, v) -> redis.incrBy(k, v));
    buffer.clear();
}
```

### 2. Chia nhỏ khoá (key sharding)

```java
public void increment(String key) {
    int shard = ThreadLocalRandom.current().nextInt(16);
    redis.incr(key + ":" + shard);
}

public long get(String key) {
    return IntStream.range(0, 16)
        .mapToLong(i -> redis.get(key + ":" + i))
        .sum();
}
```

Ghi rải đều qua 16 khoá (16 node khác nhau), đọc thì cộng lại. Nếu đọc nhiều hơn ghi, cache kết quả tổng.

### 3. Kafka: thêm hậu tố vào khoá partition

Khi một khoá làm nóng một partition:

```java
// Thay vì
producer.send(new ProducerRecord<>("events", celebrityId, event));

// Dùng — rải qua nhiều partition
String key = celebrityId + "-" + ThreadLocalRandom.current().nextInt(10);
producer.send(new ProducerRecord<>("events", key, event));
```

**Đánh đổi rất quan trọng**: bạn **mất đảm bảo thứ tự** cho khoá đó. Kafka chỉ đảm bảo thứ tự trong một partition. Chỉ làm điều này khi thứ tự không quan trọng, hoặc khi bạn có cách sắp xếp lại ở phía consumer (theo timestamp, theo số thứ tự).

## Celebrity problem — biến thể kinh điển

Bài toán: khi một người có 50 triệu người theo dõi đăng bài, làm sao đưa bài đó tới news feed của 50 triệu người?

### Fan-out on write (đẩy)

```text
   Người dùng đăng bài
        ↓
   Ghi bài vào bảng posts
        ↓
   Ghi 50 TRIỆU dòng vào feed của từng follower

   Đọc feed: SELECT * FROM feed WHERE user_id = ? — RẤT NHANH (1 query)
   Đăng bài: 50 triệu lần ghi — RẤT CHẬM (hàng giờ)
```

### Fan-out on read (kéo)

```text
   Người dùng đăng bài → chỉ ghi 1 dòng vào posts

   Đọc feed: lấy danh sách người đang theo dõi (500 người)
             → query bài viết của 500 người đó
             → trộn, sắp xếp
   ⇒ Đăng bài rất nhanh, đọc feed rất chậm
```

### Giải pháp lai — cách các mạng xã hội lớn thực sự làm

```java
public void publishPost(Post post) {
    postRepository.save(post);

    long followers = followerService.count(post.getAuthorId());

    if (followers < CELEBRITY_THRESHOLD) {        // ví dụ: 10.000
        fanOutService.pushToFollowerFeeds(post);   // đẩy — người thường
    }
    // Người nổi tiếng: KHÔNG đẩy, để lúc đọc mới kéo
}

public List<Post> getFeed(Long userId) {
    List<Post> pushed = feedRepository.findByUserId(userId);        // đã đẩy sẵn

    List<Long> celebrities = followService.getCelebritiesFollowedBy(userId);
    List<Post> pulled = postRepository.findRecentByAuthors(celebrities);  // kéo

    return merge(pushed, pulled);                                    // trộn theo thời gian
}
```

```text
   Người thường (< 10.000 follower): fan-out on write
   ⇒ Đẩy nhanh, đọc nhanh

   Người nổi tiếng (> 10.000 follower): fan-out on read
   ⇒ Đăng nhanh, và bài của họ được cache mạnh
      (vì mọi follower đều đọc cùng một tập bài viết)

   ⇒ Số người nổi tiếng ít, nên số bài phải kéo lúc đọc cũng ít.
```

Cái hay của giải pháp lai: bài viết của người nổi tiếng **được đọc bởi rất nhiều người**, nên tỉ lệ cache hit cực cao. Chi phí kéo lúc đọc gần như bằng 0 nhờ cache.

Đây là ví dụ điển hình của nguyên tắc: **không có một giải pháp đúng cho mọi trường hợp; hãy phân loại và xử lý khác nhau.**

## Hot shard trong database

Cùng vấn đề, ở tầng database:

```text
   Shard theo user_id % 64

   Một khách hàng doanh nghiệp lớn chiếm 40% dữ liệu và 60% truy vấn
   ⇒ Shard chứa họ quá tải, 63 shard khác nhàn rỗi
```

Giải pháp:

| Cách | Mô tả | Đánh đổi |
|---|---|---|
| **Tách riêng** | Khách hàng lớn có database riêng | Vận hành phức tạp hơn, nhưng cách ly tốt nhất |
| **Shard theo khoá phức hợp** | `hash(tenant_id + entity_id)` thay vì chỉ `tenant_id` | Mất khả năng query theo tenant trên một shard |
| **Sharding động** | Theo dõi tải, di chuyển shard nóng | Cần cơ chế rebalance |
| **Consistent hashing + virtual node** | Mỗi node vật lý có nhiều node ảo | Phân bố đều hơn, nhưng không cứu được một khoá siêu nóng |

Với hệ thống nhiều khách hàng (multi-tenant), **tách riêng khách hàng lớn** thường là câu trả lời đúng — vừa giải quyết hiệu năng, vừa giải quyết vấn đề cách ly và tuân thủ.

## Trường hợp thực tế: livestream bán hàng

Bối cảnh: nền tảng thương mại điện tử có tính năng livestream. Một phiên live của KOL lớn có 500.000 người xem đồng thời.

**Các khoá nóng phát sinh**:

```text
   1. Thông tin phiên live       : 500.000 lượt đọc/giây
   2. Số người xem hiện tại       : 500.000 đọc + 50.000 ghi/giây
   3. Bình luận (danh sách mới)   : 500.000 đọc + 5.000 ghi/giây
   4. Tồn kho sản phẩm đang bán   : 100.000 ghi/giây khi có flash sale
```

**Giải pháp cho từng khoá**:

| Khoá | Kỹ thuật | Kết quả |
|---|---|---|
| Thông tin phiên | Cache cục bộ TTL 10 giây (dữ liệu gần như tĩnh) | 500.000 → 5 lượt/giây tới Redis |
| Số người xem | Gom lô 2 giây + cache cục bộ TTL 2 giây | Số hiển thị trễ 2 giây, không ai nhận ra |
| Bình luận | WebSocket đẩy (push) thay vì client hỏi liên tục (poll) | Bỏ hoàn toàn 500.000 lượt đọc/giây |
| Tồn kho | Redis + Lua, chia 32 shard khoá | Chịu được 100.000 ghi/giây |

Thay đổi có tác động lớn nhất là ở dòng thứ ba: **đổi từ polling sang push**. 500.000 client hỏi mỗi giây là 500.000 request/giây; đẩy qua WebSocket thì server chỉ gửi khi có bình luận mới — vài nghìn lần mỗi giây.

Bài học tổng quát: **đôi khi giải pháp cho hot key không nằm ở tầng lưu trữ mà ở tầng giao tiếp.** Hỏi "vì sao lại có nhiều lượt đọc đến thế?" trước khi hỏi "làm sao chịu được nhiều lượt đọc đến thế?".

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Nghĩ thêm node là giải quyết được | Khoá nóng vẫn nằm trên một node |
| Cache cục bộ cho **mọi** khoá | Bộ nhớ phình, hit rate thấp |
| Cache cục bộ với TTL dài | Dữ liệu lệch giữa các instance quá lâu |
| Thêm hậu tố vào khoá Kafka mà quên mất thứ tự | Sự kiện xử lý sai thứ tự |
| Nhân bản khoá cho dữ liệu ghi nhiều | Chi phí ghi tăng N lần |
| Không phát hiện được hot key | Chỉ biết khi hệ thống đã nghẽn |
| `redis-cli monitor` chạy lâu trên production | Chính lệnh giám sát làm chậm Redis |
| Không phân loại người dùng (celebrity vs thường) | Một giải pháp cho mọi trường hợp = kém ở cả hai |

## Tóm tắt case 5

- **Hot key không giải được bằng cách thêm node** — khoá vẫn nằm trên một node.
- Phân bố truy cập thực tế luôn lệch (Zipf): top 1% khoá chiếm phần lớn traffic.
- Hot key **đọc**: cache cục bộ TTL ngắn (hiệu quả nhất, giảm hàng chục nghìn lần), nhân bản khoá, đọc từ replica.
- Hot key **ghi**: gom lô, chia nhỏ khoá, thêm hậu tố partition (đánh đổi thứ tự).
- **Celebrity problem**: giải pháp lai — fan-out on **write** cho người thường, fan-out on **read** cho người nổi tiếng.
- **Hot shard**: tách riêng khách hàng lớn thường là câu trả lời đúng nhất.
- Luôn có cơ chế **phát hiện hot key tự động**, đừng chờ tới lúc nghẽn.
- Đôi khi giải pháp nằm ở **tầng giao tiếp** (đổi polling sang push), không phải tầng lưu trữ.

**Bài kế tiếp** → [Case 6: Health check giết pod — vòng xoáy tử thần tự tạo](06-case-health-check-death-spiral.md)
