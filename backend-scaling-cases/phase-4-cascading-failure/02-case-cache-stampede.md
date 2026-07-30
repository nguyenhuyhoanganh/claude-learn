# Case 2: Cache stampede — khi cache hết hạn làm sập database

Cache là công cụ tăng tốc phổ biến nhất. Nó cũng là nguồn của một loạt sự cố mà nạn nhân thường không nghĩ tới, vì "cache thì có gì mà hỏng".

Bài này trình bày **ba kiểu hỏng của cache** — stampede, penetration, avalanche — và giải pháp cho từng cái.

## Hiện tượng

```text
   Trang chủ được cache 5 phút. 10.000 RPS. Cache hit rate 99,9%.
   Database chỉ nhận ~3 query/giây. Mọi thứ hoàn hảo.

   14:05:00  Cache key "homepage" HẾT HẠN.
   14:05:00  10.000 request cùng thấy cache miss.
   14:05:00  Cả 10.000 cùng chạy query database (query nặng, 800 ms).
   14:05:01  Database: 10.000 kết nối đồng thời → quá tải → chậm dần
   14:05:04  Query bắt đầu timeout. Không ai ghi được vào cache.
   14:05:05  Request mới vẫn miss, vẫn query, vòng lặp tiếp tục.
   14:05:30  Database chết. Toàn bộ website sập.

   Nguyên nhân: MỘT cache key hết hạn.
```

Đây là **cache stampede** (còn gọi là **dog-piling** hoặc **thundering herd**): rất nhiều request cùng phát hiện cache miss và cùng lao vào nguồn dữ liệu gốc.

## Vì sao nó nguy hiểm đến vậy

Toán học đơn giản mà đáng sợ:

```text
   Bình thường (cache hit):
   Database nhận: 10.000 / 300 giây = 33 query/giây   ← nhàn nhã

   Lúc stampede:
   Database nhận: 10.000 query trong 1 giây          ← gấp 300 lần

   Database chịu được: khoảng 500 query/giây
   ⇒ Quá tải 20 lần.
```

Cache càng hiệu quả (TTL càng dài, hit rate càng cao) thì **cú sốc khi hết hạn càng lớn**. Đây là nghịch lý: cache tốt hơn → sự cố nặng hơn.

## Giải pháp cho stampede

### 1. Khoá khi nạp lại (cache lock / mutex)

Chỉ cho **một** request được nạp dữ liệu, các request khác chờ hoặc dùng dữ liệu cũ.

```java
public Product get(Long id) {
    String key = "product:" + id;
    Product cached = redis.get(key);
    if (cached != null) return cached;

    String lockKey = "lock:" + key;
    boolean gotLock = redis.setIfAbsent(lockKey, "1", Duration.ofSeconds(10));

    if (gotLock) {
        try {
            Product p = repository.findById(id).orElseThrow();
            redis.set(key, p, Duration.ofMinutes(5));
            return p;
        } finally {
            redis.delete(lockKey);
        }
    } else {
        // Có người khác đang nạp — chờ một chút rồi đọc lại
        Thread.sleep(50);
        Product retry = redis.get(key);
        if (retry != null) return retry;
        return repository.findById(id).orElseThrow();   // hết kiên nhẫn, tự làm
    }
}
```

Đơn giản nhưng có vấn đề: các request khác vẫn phải **chờ**, và nếu chờ lâu thì thread bị giam (phase-2). Cần có giới hạn chờ.

Với cache trong bộ nhớ (một instance), **Caffeine làm sẵn việc này**:

```java
LoadingCache<Long, Product> cache = Caffeine.newBuilder()
    .maximumSize(10_000)
    .expireAfterWrite(Duration.ofMinutes(5))
    .build(id -> repository.findById(id).orElseThrow());
```

Caffeine đảm bảo với cùng một khoá, chỉ một thread gọi hàm nạp; các thread khác chờ đúng khoá đó mà **không chặn các khoá khác**.

### 2. Stale-while-revalidate — cách tốt nhất

Trả về dữ liệu **cũ** ngay lập tức, đồng thời làm mới ở nền.

```text
   TTL "mềm": 5 phút   — quá hạn thì trả dữ liệu cũ + kích hoạt làm mới nền
   TTL "cứng": 30 phút — quá hạn thì bắt buộc phải nạp mới

   t=0      : nạp dữ liệu, lưu cache
   t=5 phút : cache "cũ" nhưng vẫn dùng được
              → request nhận dữ liệu cũ NGAY (0 ms chờ)
              → một luồng nền đi nạp dữ liệu mới
   t=5,8 phút: dữ liệu mới sẵn sàng
```

```java
LoadingCache<Long, Product> cache = Caffeine.newBuilder()
    .maximumSize(10_000)
    .refreshAfterWrite(Duration.ofMinutes(5))     // làm mới nền sau 5 phút
    .expireAfterWrite(Duration.ofMinutes(30))     // hết hạn cứng sau 30 phút
    .build(id -> repository.findById(id).orElseThrow());
```

`refreshAfterWrite` là điểm mấu chốt: khi có request đến sau mốc 5 phút, Caffeine trả **giá trị cũ ngay** và kích hoạt nạp lại bất đồng bộ. **Không ai phải chờ, và database chỉ nhận một query.**

Đây gần như luôn là giải pháp tốt nhất cho dữ liệu chấp nhận được độ trễ vài giây.

Với HTTP, cơ chế tương đương là header chuẩn:

```text
Cache-Control: max-age=300, stale-while-revalidate=600
```

### 3. TTL có jitter — tránh hết hạn đồng loạt

```java
// SAI — mọi key nạp cùng lúc sẽ hết hạn cùng lúc
redis.set(key, value, Duration.ofMinutes(5));

// ĐÚNG — rải ngẫu nhiên ±20%
long baseSeconds = 300;
long jittered = baseSeconds + ThreadLocalRandom.current().nextLong(-60, 60);
redis.set(key, value, Duration.ofSeconds(jittered));
```

Đặc biệt quan trọng khi bạn nạp cache hàng loạt (ví dụ khởi động lại, hoặc warm-up): nếu 10.000 key được nạp trong cùng một giây với TTL giống hệt, chúng sẽ **hết hạn cùng một giây** — biến stampede thành avalanche.

### 4. Hết hạn sớm theo xác suất

Kỹ thuật tinh tế: mỗi request có một xác suất nhỏ tự nguyện làm mới cache **trước khi** nó hết hạn, và xác suất này tăng dần khi gần đến hạn.

```java
public Product get(Long id) {
    CacheEntry<Product> entry = redis.get("product:" + id);
    if (entry == null) return loadAndCache(id);

    long remainingMs = entry.getExpiresAt() - System.currentTimeMillis();
    long deltaMs = entry.getLoadDurationMs();      // thời gian nạp lần trước
    double beta = 1.0;

    // Công thức XFetch: càng gần hạn, xác suất làm mới càng cao
    double xfetch = deltaMs * beta * -Math.log(ThreadLocalRandom.current().nextDouble());
    if (xfetch >= remainingMs) {
        return loadAndCache(id);                   // tự nguyện làm mới sớm
    }
    return entry.getValue();
}
```

Ưu điểm so với lock: **không ai phải chờ**, và xác suất hai request cùng làm mới rất thấp. Đây là kỹ thuật được dùng trong các hệ thống quy mô lớn, tên gọi trong tài liệu là **probabilistic early expiration** hoặc **XFetch**.

### 5. Không bao giờ để hết hạn — làm mới chủ động

Với dữ liệu cực nóng (trang chủ, cấu hình hệ thống), đừng dùng TTL. Có một job chủ động cập nhật:

```java
@Scheduled(fixedDelay = 60_000)
public void refreshHotKeys() {
    for (String key : hotKeys) {
        try {
            Object fresh = load(key);
            redis.set(key, fresh);                  // KHÔNG đặt TTL
        } catch (Exception e) {
            log.warn("Làm mới {} thất bại, giữ giá trị cũ", key, e);
            // Quan trọng: KHÔNG xoá cache khi lỗi
        }
    }
}
```

Điểm mấu chốt ở dòng cuối: nếu nạp thất bại thì **giữ nguyên giá trị cũ**. Dữ liệu cũ luôn tốt hơn không có dữ liệu.

## Kiểu hỏng thứ hai: Cache penetration

**Cache penetration (xuyên thủng cache)** — request hỏi những khoá **không tồn tại**, nên không bao giờ cache được, và mọi request đều xuống database.

```text
   Kẻ tấn công (hoặc bug ở client) gọi liên tục:
   GET /api/products/999999991
   GET /api/products/999999992
   GET /api/products/999999993
   ...

   Mỗi ID không tồn tại → cache miss → query DB → không có kết quả
   → KHÔNG GHI GÌ VÀO CACHE → lần sau lại miss

   ⇒ 100% request xuống database. Cache hoàn toàn vô dụng.
```

### Giải pháp 1: Cache cả kết quả rỗng

```java
public Optional<Product> get(Long id) {
    String key = "product:" + id;
    String cached = redis.get(key);

    if ("__NULL__".equals(cached)) return Optional.empty();     // đã biết là không có
    if (cached != null) return Optional.of(deserialize(cached));

    Optional<Product> p = repository.findById(id);
    if (p.isEmpty()) {
        redis.set(key, "__NULL__", Duration.ofMinutes(1));       // TTL NGẮN
    } else {
        redis.set(key, serialize(p.get()), Duration.ofMinutes(30));
    }
    return p;
}
```

TTL của giá trị rỗng phải **ngắn hơn nhiều** so với giá trị thật — vì sản phẩm có thể được tạo ra bất cứ lúc nào, và bạn không muốn nói "không tồn tại" trong 30 phút.

### Giải pháp 2: Bloom filter

**Bloom filter** — cấu trúc dữ liệu xác suất trả lời câu hỏi "phần tử này CÓ THỂ tồn tại không?" với bộ nhớ cực nhỏ.

```text
   Đặc tính:
   ├─ Trả lời "KHÔNG" → chắc chắn không tồn tại (không có âm tính giả)
   └─ Trả lời "CÓ"    → có thể tồn tại (có dương tính giả, tỉ lệ ~1%)

   Kích thước: 10 triệu phần tử ≈ 12 MB (với tỉ lệ sai 1%)
```

```java
private final BloomFilter<Long> filter = BloomFilter.create(
    Funnels.longFunnel(), 10_000_000, 0.01);

public Optional<Product> get(Long id) {
    if (!filter.mightContain(id)) {
        return Optional.empty();          // chắc chắn không có, không cần hỏi ai
    }
    return getFromCacheOrDb(id);
}
```

Bloom filter chặn được **99% request rác** với 12 MB bộ nhớ. Redis cũng có sẵn kiểu dữ liệu này qua module RedisBloom.

Hạn chế: không xoá được phần tử khỏi Bloom filter thông thường (cần Counting Bloom Filter), và phải xây lại khi dữ liệu thay đổi nhiều.

### Giải pháp 3: Validate trước khi hỏi

Đơn giản nhất và hay bị quên: nếu ID sản phẩm của bạn không bao giờ vượt quá 10 triệu, hãy từ chối mọi ID lớn hơn ngay ở tầng validate — không cần cache, không cần Bloom filter.

## Kiểu hỏng thứ ba: Cache avalanche

**Cache avalanche (tuyết lở cache)** — **rất nhiều** khoá hết hạn cùng lúc, hoặc cả cụm cache chết.

```text
   Kịch bản A: Redis restart
   → Toàn bộ cache trống
   → 100% request xuống database
   → Database chết ngay lập tức

   Kịch bản B: Warm-up đồng loạt
   → 09:00 deploy, nạp 50.000 key với TTL 1 giờ
   → 10:00 tất cả cùng hết hạn
   → Avalanche
```

### Giải pháp

**1. Cache nhiều tầng**

```text
   Request → [L1: Caffeine trong tiến trình, 1.000 key nóng, TTL 30 giây]
                    ↓ miss
             [L2: Redis, 1 triệu key, TTL 10 phút]
                    ↓ miss
             [Database]
```

Nếu Redis chết, L1 vẫn hứng được phần lớn traffic cho các khoá nóng. Đây là bulkhead áp dụng cho cache.

L1 nên có TTL rất ngắn (30 giây) để giảm vấn đề dữ liệu cũ khi chạy nhiều instance.

**2. Circuit breaker phía trước database**

```java
@CircuitBreaker(name = "database", fallbackMethod = "serveStale")
public Product loadFromDb(Long id) { ... }

private Product serveStale(Long id, Throwable t) {
    Product stale = redis.getStale("product:" + id);      // dữ liệu quá hạn
    if (stale != null) return stale;
    throw new ServiceUnavailableException();
}
```

**3. Giới hạn tốc độ nạp lại (rate limit trên cache miss)**

```java
private final RateLimiter dbLimiter = RateLimiter.create(500);   // tối đa 500 query/giây

public Product get(Long id) {
    Product cached = redis.get(key);
    if (cached != null) return cached;

    if (!dbLimiter.tryAcquire(50, TimeUnit.MILLISECONDS)) {
        Product stale = redis.getStale(key);
        if (stale != null) return stale;                  // dùng dữ liệu cũ
        throw new ServiceBusyException();                  // hoặc từ chối
    }
    return loadAndCache(id);
}
```

Đây là **load shedding** áp dụng cho cache miss: database không bao giờ nhận quá 500 query/giây dù cache có trống hoàn toàn. Nó biến "database chết" thành "một số request nhận dữ liệu cũ hoặc lỗi" — đánh đổi tốt hơn nhiều.

**4. Warm-up có kiểm soát khi khởi động**

```java
@EventListener(ApplicationReadyEvent.class)
public void warmUp() {
    List<Long> hotIds = analyticsService.getTopProducts(1000);
    hotIds.forEach(id -> {
        cache.get(id);
        sleep(10);                              // rải ra, đừng dội vào DB
    });
}
```

## Bảng tổng hợp ba kiểu hỏng

| Kiểu | Nguyên nhân | Dấu hiệu | Giải pháp chính |
|---|---|---|---|
| **Stampede** | Một khoá nóng hết hạn | Đỉnh query DB đúng lúc TTL hết | `refreshAfterWrite` (stale-while-revalidate) |
| **Penetration** | Hỏi khoá không tồn tại | Hit rate thấp bất thường, DB nhận nhiều query trả rỗng | Cache giá trị rỗng + Bloom filter |
| **Avalanche** | Nhiều khoá hết hạn cùng lúc / cache chết | Hit rate sụp về 0 | Cache nhiều tầng + jitter TTL + rate limit |

## Vấn đề nhất quán — mặt trái ít được nói

Cache tạo ra một bản sao dữ liệu. Bản sao thì có thể lệch.

### Cập nhật cache thế nào cho đúng?

```java
// Cách 1: Cache-aside (phổ biến nhất)
public void updateProduct(Product p) {
    repository.save(p);
    redis.delete("product:" + p.getId());     // XOÁ, không phải ghi đè
}
```

**Vì sao xoá tốt hơn ghi đè?** Vì ghi đè có race condition:

```text
   A: đọc DB → giá trị cũ (100)
   B: ghi DB = 200, ghi cache = 200
   A: ghi cache = 100        ← GHI ĐÈ giá trị mới bằng giá trị cũ!

   ⇒ Cache giữ 100 mãi mãi, trong khi DB là 200.
```

Xoá cache thì không có vấn đề này — lần đọc tiếp theo sẽ nạp lại từ DB.

Nhưng ngay cả cache-aside cũng có khe hở hiếm gặp:

```text
   A: cache miss, đọc DB → 100
   B: ghi DB = 200, xoá cache
   A: ghi cache = 100        ← cache lại lệch
```

Xác suất thấp (cần A bị dừng đúng giữa hai bước), nhưng ở quy mô lớn thì vẫn xảy ra. Giải pháp:

- **TTL ngắn** — giới hạn thời gian lệch.
- **Delayed double delete** — xoá cache, ghi DB, chờ vài trăm ms rồi xoá lần nữa.
- **Cache invalidation qua CDC** — dùng Debezium bắt thay đổi từ binlog/WAL để xoá cache. Đây là cách chắc chắn nhất, vì nó dựa vào nguồn sự thật duy nhất.

### Nhất quán giữa nhiều instance cache cục bộ

Nếu bạn dùng Caffeine ở mỗi pod, 10 pod = 10 bản cache độc lập. Cập nhật ở pod 1 không ảnh hưởng pod 2-10.

Giải pháp: phát sự kiện vô hiệu hoá qua Redis Pub/Sub hoặc Kafka.

```java
@EventListener
public void onProductUpdated(ProductUpdatedEvent e) {
    redisTemplate.convertAndSend("cache-invalidate", "product:" + e.getId());
}

@RedisListener("cache-invalidate")
public void onInvalidate(String key) {
    localCache.invalidate(key);
}
```

Đánh đổi thật: giữa hai thời điểm phát và nhận sự kiện (thường vài ms) vẫn có lệch. Với dữ liệu chịu được điều đó thì tốt; với dữ liệu không chịu được thì **đừng cache cục bộ**.

## Giám sát cache

```promql
# Hit rate — dưới 80% là dấu hiệu có vấn đề
rate(cache_gets_total{result="hit"}[5m]) / rate(cache_gets_total[5m])

# Query database do cache miss — đỉnh nhọn = stampede
rate(cache_loads_total[1m])

# Thời gian nạp — nếu tăng, cache miss sẽ càng nguy hiểm
histogram_quantile(0.99, rate(cache_load_duration_seconds_bucket[5m]))
```

Cảnh báo hiệu quả nhất: **hit rate sụt đột ngột**. Nó báo hiệu cả ba kiểu hỏng.

Với Caffeine, nhớ bật thống kê (`recordStats()`) và đăng ký với Micrometer, nếu không bạn sẽ không có số liệu nào.

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| TTL giống hệt nhau cho mọi khoá | Hết hạn đồng loạt → avalanche |
| Không cache kết quả rỗng | Cache penetration |
| Ghi đè cache thay vì xoá | Race condition, cache lệch vĩnh viễn |
| Xoá cache khi nạp lỗi | Mất luôn dữ liệu cũ vốn vẫn dùng được |
| Không có tầng cache cục bộ | Redis chết là database chết theo |
| Cache dữ liệu quá lớn | Redis chậm, chiếm mạng, đẩy khoá nóng ra |
| Dùng `KEYS *` để tìm khoá | Chặn Redis (single-threaded) — dùng `SCAN` |
| Không đo hit rate | Không biết cache có hoạt động không |
| Cache cục bộ cho dữ liệu cần nhất quán | Mỗi pod thấy một kiểu |

## Tóm tắt case 2

- **Cache stampede**: một khoá nóng hết hạn → hàng nghìn request cùng lao xuống DB. Cache càng tốt thì cú sốc càng lớn.
- Giải pháp tốt nhất: **`refreshAfterWrite`** (stale-while-revalidate) — trả dữ liệu cũ ngay, làm mới ở nền.
- **Luôn thêm jitter vào TTL** để tránh hết hạn đồng loạt.
- **Cache penetration**: hỏi khoá không tồn tại → cache giá trị rỗng (TTL ngắn) + Bloom filter.
- **Cache avalanche**: cache chết/hết hạn hàng loạt → cache nhiều tầng + rate limit trên cache miss.
- **Rate limit cache miss** biến "database chết" thành "một số request nhận dữ liệu cũ".
- Cập nhật: **xoá cache, đừng ghi đè**. Chắc chắn nhất là vô hiệu hoá qua CDC.
- Cache cục bộ nhiều instance luôn có độ lệch — chấp nhận được thì dùng, không thì đừng.

**Bài kế tiếp** → [Case 3: Circuit breaker — cầu dao và nghệ thuật chỉnh ngưỡng](03-case-circuit-breaker.md)
