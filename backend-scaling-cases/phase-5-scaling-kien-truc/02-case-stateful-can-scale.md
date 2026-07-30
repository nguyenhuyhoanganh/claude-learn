# Case 2: Trạng thái trong bộ nhớ — thứ chặn đường scale ngang

Bạn deploy instance thứ hai. Mọi thứ hỏng ngay lập tức:

```text
   ├─ Người dùng bị đăng xuất ngẫu nhiên
   ├─ Giỏ hàng lúc có lúc không
   ├─ Job hàng đêm chạy 2 lần → gửi 2 email cho mỗi khách
   ├─ Bộ đếm hiển thị sai
   ├─ Tải file lên bị lỗi giữa chừng
   └─ Cache của instance A không biết instance B đã sửa dữ liệu
```

Nguyên nhân chung: **trạng thái (state) nằm trong bộ nhớ của một instance**. Bài này liệt kê mọi nơi trạng thái ẩn nấp và cách gỡ từng cái.

## Vì sao stateless là điều kiện tiên quyết

**Stateless (không trạng thái)** — instance không giữ thông tin nào cần thiết cho request tiếp theo. Mọi request có thể được xử lý bởi **bất kỳ** instance nào.

```text
   CÓ TRẠNG THÁI (không scale được)
   Request 1 → Instance A (lưu session vào RAM của A)
   Request 2 → Instance B (không biết session)  → ĐĂNG XUẤT

   KHÔNG TRẠNG THÁI (scale thoải mái)
   Request 1 → Instance A → đọc/ghi session ở Redis
   Request 2 → Instance B → đọc/ghi session ở Redis  → HOẠT ĐỘNG
```

Stateless mang lại bốn thứ cùng lúc, và cả bốn đều cần cho hệ thống hiện đại:

| Khả năng | Vì sao cần stateless |
|---|---|
| Scale ngang | Bất kỳ instance nào cũng xử lý được |
| Rolling update | Giết pod bất kỳ mà không mất gì |
| Tự phục hồi | Pod chết, pod mới thay thế ngay |
| Autoscaling | Thêm/bớt instance tuỳ ý |

## Bảy nơi trạng thái ẩn nấp

### 1. HTTP Session trong bộ nhớ

```java
@GetMapping("/cart")
public Cart getCart(HttpSession session) {
    return (Cart) session.getAttribute("cart");    // lưu trong RAM của instance này
}
```

**Giải pháp A — Session bên ngoài (khuyến nghị)**:

```xml
<dependency>
    <groupId>org.springframework.session</groupId>
    <artifactId>spring-session-data-redis</artifactId>
</dependency>
```

```yaml
spring:
  session:
    # Nơi lưu session. `redis` = Spring Session thay thế HttpSession mặc định
    # bằng bản lưu trong Redis, trong suốt với code nghiệp vụ.
    store-type: redis

    # Session hết hạn sau bao lâu không hoạt động.
    timeout: 30m

    redis:
      # Tiền tố cho mọi khoá session trong Redis.
      # Cần thiết khi nhiều ứng dụng dùng chung một Redis — tránh đụng khoá.
      namespace: myapp:session

      # Khi nào ghi thay đổi xuống Redis:
      #   on_save   = chỉ ghi một lần vào cuối request (ít round-trip, mặc định)
      #   immediate = ghi ngay mỗi lần setAttribute (nhiều round-trip hơn,
      #               nhưng an toàn hơn nếu request có thể bị ngắt giữa chừng)
      flush-mode: on_save
```

Không đổi một dòng code nghiệp vụ nào — Spring Session thay thế `HttpSession` một cách trong suốt.

Đánh đổi: mỗi request thêm 1-2 round-trip tới Redis (~1 ms), và Redis trở thành phụ thuộc sống còn. Cần Redis có replica và persistence.

**Giải pháp B — Token không trạng thái (JWT)**:

```java
String token = Jwts.builder()
    .setSubject(user.getId().toString())
    .claim("roles", user.getRoles())
    .setExpiration(Date.from(Instant.now().plus(15, ChronoUnit.MINUTES)))
    .signWith(key)
    .compact();
```

Server không lưu gì cả — mọi thông tin nằm trong token đã ký.

Đánh đổi rất quan trọng và hay bị bỏ qua: **không thu hồi (revoke) được token trước khi hết hạn**. Người dùng bị khoá tài khoản vẫn dùng được token cũ tới khi nó hết hạn.

Cách xử lý phổ biến:
- **Token sống ngắn** (15 phút) + refresh token lưu ở server. Thu hồi refresh token thì tối đa 15 phút sau là mất quyền.
- **Danh sách đen** trong Redis cho các token cần thu hồi ngay — nhưng lúc đó bạn lại có trạng thái, mất đi một phần lợi ích.

**Giải pháp C — Sticky session**: load balancer luôn gửi cùng một người dùng tới cùng một instance.

```nginx
upstream backend {
    ip_hash;                    # hoặc: hash $cookie_JSESSIONID consistent;
    server app1:8080;
    server app2:8080;
}
```

Đây là **giải pháp tệ nhất** trong ba cách, dù dễ nhất:

| Vấn đề | Hậu quả |
|---|---|
| Instance chết = mất session của mọi người trên đó | Người dùng bị đăng xuất |
| Tải không đều | Instance nào có người dùng nặng thì quá tải |
| Rolling update làm mất session | Mỗi lần deploy là một đợt đăng xuất |
| Autoscaling không hiệu quả | Instance mới không nhận được người dùng cũ |

Chỉ dùng sticky session làm giải pháp tạm thời trong quá trình chuyển đổi.

### 2. Cache trong bộ nhớ

```java
private final Map<Long, Product> cache = new ConcurrentHashMap<>();
```

Với 10 instance, bạn có 10 bản cache độc lập. Instance A cập nhật sản phẩm, 9 instance kia vẫn giữ dữ liệu cũ vô thời hạn.

Ba lựa chọn, tuỳ mức độ chấp nhận dữ liệu cũ:

| Cách | Độ lệch | Khi nào dùng |
|---|---|---|
| **Cache tập trung** (Redis) | Không có | Dữ liệu cần nhất quán |
| **Cache cục bộ TTL ngắn** (30 giây) | Tối đa 30 giây | Dữ liệu ít đổi, cần tốc độ |
| **Cache cục bộ + thông báo vô hiệu hoá** | Vài mili-giây | Cần cả tốc độ và độ tươi |

```java
// Cách thứ ba: cache cục bộ + phát sự kiện qua Redis Pub/Sub
@EventListener
public void onProductUpdated(ProductUpdatedEvent e) {
    redisTemplate.convertAndSend("cache-invalidate", "product:" + e.getId());
}

@Component
public class CacheInvalidationListener implements MessageListener {
    @Override
    public void onMessage(Message message, byte[] pattern) {
        localCache.invalidate(new String(message.getBody()));
    }
}
```

Cách này cho tốc độ của cache cục bộ với độ lệch chỉ vài mili-giây. Nhưng nếu tin nhắn bị mất (Redis Pub/Sub không đảm bảo gửi tới), cache lệch vĩnh viễn — nên vẫn cần TTL làm lưới an toàn.

### 3. Scheduled job chạy trùng

```java
@Scheduled(cron = "0 0 2 * * *")
public void sendDailyReport() {
    emailService.sendToAll(generateReport());
}
```

Với 10 instance, **10 email được gửi cho mỗi khách hàng**.

**Giải pháp A — Khoá phân tán** (đơn giản nhất):

```xml
<dependency>
    <groupId>net.javacrumbs.shedlock</groupId>
    <artifactId>shedlock-spring</artifactId>
</dependency>
```

```java
@Scheduled(cron = "0 0 2 * * *")
@SchedulerLock(name = "dailyReport", lockAtMostFor = "30m", lockAtLeastFor = "1m")
public void sendDailyReport() { ... }
```

Hai tham số quan trọng:
- `lockAtMostFor`: nếu instance chết giữa chừng, khoá tự nhả sau thời gian này. Đặt **lớn hơn thời gian chạy tối đa dự kiến**.
- `lockAtLeastFor`: giữ khoá tối thiểu, chống trường hợp đồng hồ giữa các máy lệch nhau khiến job chạy hai lần liên tiếp.

ShedLock lưu khoá trong database hoặc Redis — chọn database nếu bạn muốn khoá bền vững hơn.

**Giải pháp B — Tách riêng job runner**:

```yaml
# Deployment riêng, replicas = 1
apiVersion: apps/v1
kind: Deployment
metadata:
  name: job-runner
spec:
  replicas: 1                  # chỉ MỘT instance chạy job
  template:
    spec:
      containers:
        - name: app
          env:
            - name: SPRING_PROFILES_ACTIVE
              value: "job"     # profile này bật @Scheduled, profile "api" thì tắt
```

Cách này còn có lợi ích phụ: job nặng không ăn tài nguyên của API (bulkhead ở mức deployment — phase-2 case 5).

**Giải pháp C — Kubernetes CronJob**: đưa job ra hẳn ngoài ứng dụng. Sạch nhất về mặt kiến trúc, nhưng cần đóng gói riêng.

### 4. Biến static và singleton có trạng thái

```java
@Component
public class RequestCounter {
    private final AtomicLong count = new AtomicLong();     // đếm riêng từng instance
    public long increment() { return count.incrementAndGet(); }
}
```

Với 10 instance, mỗi cái đếm riêng. Muốn số tổng thì phải cộng lại — mà không ai cộng.

```java
// Giải pháp: dùng Redis cho bộ đếm dùng chung
public long increment(String key) {
    return redisTemplate.opsForValue().increment("counter:" + key);
}

// Hoặc: nếu chỉ để giám sát, dùng metric — hệ thống metric tự cộng
@Autowired MeterRegistry registry;
registry.counter("requests.total", "endpoint", "/orders").increment();
```

Với mục đích giám sát, **metric là câu trả lời đúng** — Prometheus tự cộng các instance lại, và bạn không phải quản lý trạng thái nào.

### 5. File tải lên lưu trên đĩa cục bộ

```java
@PostMapping("/upload")
public void upload(MultipartFile file) {
    file.transferTo(new File("/data/uploads/" + file.getOriginalFilename()));
}
```

Instance A lưu file, request đọc file rơi vào instance B → `FileNotFoundException`. Và pod restart là mất sạch.

```java
// Giải pháp: object storage
@PostMapping("/upload")
public String upload(MultipartFile file) {
    String key = "uploads/" + UUID.randomUUID() + "/" + file.getOriginalFilename();
    s3Client.putObject(PutObjectRequest.builder()
        .bucket(bucket).key(key).build(),
        RequestBody.fromInputStream(file.getInputStream(), file.getSize()));
    return key;
}
```

Với file lớn, tốt hơn nữa là **presigned URL** — client tải thẳng lên S3, không đi qua ứng dụng của bạn:

```java
@GetMapping("/upload-url")
public String getUploadUrl(@RequestParam String filename) {
    PresignedPutObjectRequest presigned = presigner.presignPutObject(r -> r
        .signatureDuration(Duration.ofMinutes(10))
        .putObjectRequest(p -> p.bucket(bucket).key("uploads/" + filename)));
    return presigned.url().toString();
}
```

Lợi ích kép: không tốn băng thông và thread của ứng dụng (nhớ phase-2: tải file lớn giam thread rất lâu).

### 6. WebSocket và kết nối dài

```text
   Người dùng kết nối WebSocket tới instance A.
   Instance B muốn gửi tin nhắn cho người dùng đó.
   → Instance B không có kết nối tới người dùng.
```

Giải pháp: **message broker làm trung gian**.

```java
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {
    @Override
    public void configureMessageBroker(MessageBrokerRegistry config) {
        config.enableStompBrokerRelay("/topic", "/queue")
              .setRelayHost("rabbitmq")           // broker ngoài
              .setRelayPort(61613);
    }
}
```

```text
   Instance B → publish vào broker → broker định tuyến →
   Instance A (đang giữ kết nối) → đẩy tới người dùng
```

Redis Pub/Sub cũng làm được với cấu hình đơn giản hơn, nhưng không đảm bảo gửi tới (at-most-once). Với chat quan trọng, dùng RabbitMQ hoặc Kafka.

Lưu ý thêm: kết nối WebSocket bản chất **là** trạng thái. Bạn không loại bỏ được nó, chỉ có thể thiết kế để mất kết nối không gây mất dữ liệu — client tự kết nối lại và đồng bộ những gì đã bỏ lỡ.

### 7. Rate limiter cục bộ

```java
private final RateLimiter limiter = RateLimiter.create(100);   // 100/giây MỖI INSTANCE
```

Với 10 instance, giới hạn thực tế là 1.000/giây — gấp 10 lần dự định.

```java
// Giải pháp: rate limiter phân tán qua Redis
public boolean tryAcquire(String userId) {
    String key = "rate:" + userId + ":" + (System.currentTimeMillis() / 1000);
    Long count = redis.opsForValue().increment(key);
    if (count == 1) redis.expire(key, Duration.ofSeconds(2));
    return count <= 100;
}
```

Hoặc chấp nhận sai số: chia hạn ngạch cho số instance (`100 / 10 = 10` mỗi instance). Kém chính xác khi tải không đều, nhưng không tốn round-trip.

## Bảng tổng hợp

| Trạng thái | Vấn đề khi nhiều instance | Giải pháp |
|---|---|---|
| HTTP Session | Đăng xuất ngẫu nhiên | Spring Session + Redis, hoặc JWT |
| Cache cục bộ | Dữ liệu lệch giữa instance | Redis, hoặc TTL ngắn + pub/sub |
| `@Scheduled` | Job chạy N lần | ShedLock, hoặc job runner riêng |
| Biến static/counter | Số liệu sai | Redis counter, hoặc metric |
| File trên đĩa | Không tìm thấy file | S3/object storage + presigned URL |
| WebSocket | Không gửi được tin nhắn | Message broker relay |
| Rate limiter | Giới hạn nhân N lần | Redis, hoặc chia hạn ngạch |
| `synchronized` | Không có tác dụng (phase-2 case 6) | Khoá phân tán hoặc DB constraint |

## Kiểm tra ứng dụng đã stateless chưa

### Cách 1: Tìm trong code

```bash
# Tìm biến static có thể thay đổi
grep -rn "private static.*Map\|private static.*List\|private static.*Set" src/main/java \
  | grep -v "final.*=.*of(\|final.*=.*unmodifiable"

# Tìm session
grep -rn "HttpSession\|@SessionAttributes\|@SessionScope" src/main/java

# Tìm scheduled job
grep -rn "@Scheduled" src/main/java

# Tìm ghi file cục bộ
grep -rn "new File(\|Files.write\|FileOutputStream" src/main/java
```

### Cách 2: Kiểm thử thực tế — cách chắc chắn nhất

```text
   1. Chạy 2 instance sau load balancer round-robin
      (KHÔNG dùng sticky session)
   2. Chạy toàn bộ bộ test tích hợp
   3. Giết ngẫu nhiên một instance giữa chừng
   4. Mọi thứ vẫn phải hoạt động

   Nếu có lỗi → có trạng thái ở đâu đó.
```

Cách hiệu quả hơn nữa: **cấu hình môi trường staging với 2 instance và load balancer round-robin ngay từ đầu**. Mọi vấn đề trạng thái lộ ra trong quá trình phát triển thay vì lúc lên production.

### Cách 3: Chaos test

```bash
# Giết ngẫu nhiên một pod mỗi 5 phút
kubectl delete pod $(kubectl get pods -l app=myapp -o name | shuf -n 1)
```

Nếu người dùng không nhận ra gì, bạn đã stateless thật sự.

## Trạng thái không loại bỏ được — thì sao?

Một số hệ thống bản chất là có trạng thái: game server, xử lý video theo phiên, WebSocket, các hệ thống tính toán trên luồng dữ liệu.

Với chúng, mục tiêu không phải "bỏ trạng thái" mà là **quản lý trạng thái có kiểm soát**:

| Kỹ thuật | Mô tả |
|---|---|
| **StatefulSet** (Kubernetes) | Pod có danh tính ổn định và ổ đĩa riêng bền vững |
| **Consistent hashing** | Định tuyến theo khoá tới đúng instance giữ trạng thái |
| **Checkpoint** | Định kỳ lưu trạng thái ra ngoài; khôi phục khi khởi động lại |
| **Bàn giao có kiểm soát** | Trước khi tắt, chuyển trạng thái sang instance khác |
| **Event sourcing** | Trạng thái là kết quả phát lại chuỗi sự kiện đã lưu bền vững |

Ví dụ: Kafka Streams dùng consistent hashing (theo partition) + checkpoint (changelog topic) để có trạng thái mà vẫn scale và chịu lỗi được.

Điểm chung của mọi kỹ thuật này: **trạng thái phải có thể tái tạo từ một nguồn bền vững**. Trạng thái chỉ tồn tại trong RAM và không tái tạo được là trạng thái không thể vận hành.

## Trường hợp thực tế: chuyển đổi trong 3 tháng

Một hệ thống quản lý bán hàng, monolith, 1 instance, cần scale ngang.

**Kiểm kê trạng thái tìm được**:

```text
   1. HttpSession lưu giỏ hàng và thông tin đăng nhập
   2. 14 job @Scheduled
   3. Cache sản phẩm bằng ConcurrentHashMap
   4. File hoá đơn PDF lưu ở /var/data/invoices
   5. Bộ đếm mã đơn hàng bằng AtomicLong
   6. Rate limiter cục bộ cho API công khai
   7. 3 chỗ dùng synchronized để chống trùng
```

**Lộ trình thực hiện** (theo thứ tự rủi ro thấp → cao):

| Tuần | Việc | Rủi ro |
|---|---|---|
| 1-2 | File PDF → S3 | Thấp — chỉ đổi nơi lưu |
| 3 | Bộ đếm → PostgreSQL sequence | Thấp |
| 4-5 | Cache → Redis (giữ Caffeine làm L1, TTL 30 giây) | Thấp |
| 6-7 | 14 job → ShedLock | Trung bình — phải test kỹ từng job |
| 8-9 | Rate limiter → Redis | Trung bình |
| 10-12 | Session → Spring Session Redis | **Cao** — ảnh hưởng mọi người dùng |
| 13 | `synchronized` → ràng buộc unique ở database | Cao — đổi logic nghiệp vụ |

Session để cuối vì rủi ro cao nhất. Cách triển khai an toàn: chạy song song hai cơ chế trong 1 tuần (ghi cả vào session cũ và Redis, đọc từ Redis nếu có), rồi mới bỏ cái cũ.

**Kết quả**: từ 1 instance lên 12 instance, throughput tăng từ 400 lên 4.200 RPS, và lần đầu tiên deploy được mà không cần dừng dịch vụ.

Điều bất ngờ nhất với đội: **việc tách trạng thái mất 3 tháng, còn việc scale ngang sau đó mất 1 ngày**. Đó là tỉ lệ điển hình — công sức nằm ở việc gỡ trạng thái, không phải ở việc thêm máy.

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Dùng sticky session để "khỏi sửa code" | Mất session mỗi lần deploy, tải không đều |
| Quên `@Scheduled` khi scale | Job chạy N lần, gửi N email |
| JWT không có cơ chế thu hồi | Người bị khoá tài khoản vẫn dùng được |
| Cache cục bộ TTL dài | Mỗi instance hiển thị một kiểu |
| Ghi file vào đĩa container | Mất khi pod restart |
| `synchronized` giữa nhiều pod | Không có tác dụng gì |
| Rate limiter cục bộ | Giới hạn thực tế nhân với số instance |
| Không test với nhiều instance | Lỗi chỉ lộ ra ở production |

## Tóm tắt case 2

- **Stateless là điều kiện tiên quyết** của scale ngang, rolling update, tự phục hồi và autoscaling.
- Bảy nơi trạng thái ẩn: **session, cache cục bộ, scheduled job, biến static, file trên đĩa, WebSocket, rate limiter**.
- Session: **Spring Session + Redis** (đơn giản nhất) hoặc **JWT ngắn hạn + refresh token**.
- **Sticky session là giải pháp tệ nhất** — chỉ dùng tạm thời khi chuyển đổi.
- Scheduled job: **ShedLock** hoặc **deployment job runner riêng** (có thêm lợi ích cách ly tài nguyên).
- File: **object storage + presigned URL** để không tốn thread của ứng dụng.
- Kiểm chứng bằng cách chạy **2 instance round-robin ngay từ môi trường phát triển**.
- Trạng thái không loại bỏ được thì phải **tái tạo được từ nguồn bền vững** — checkpoint, event sourcing, consistent hashing.

**Bài kế tiếp** → [Case 3: Tách service theo nút thắt — không phải theo sơ đồ đẹp](03-case-tach-service.md)
