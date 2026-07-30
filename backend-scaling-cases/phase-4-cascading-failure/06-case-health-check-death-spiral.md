# Case 6: Health check giết pod — vòng xoáy tử thần tự tạo

Health check sinh ra để **bảo vệ** hệ thống: phát hiện instance hỏng và loại nó ra. Nhưng cấu hình sai một chút, nó trở thành thứ **giết chết** hệ thống — và giết nhanh hơn bất kỳ lỗi nào khác.

Đây là loại sự cố cay đắng nhất, vì công cụ bảo vệ lại chính là hung thủ.

## Hiện tượng

```text
   14:00  Traffic tăng nhẹ. Latency từ 100 ms lên 800 ms. Vẫn phục vụ được.

   14:01  Health check (timeout 1 giây) bắt đầu thất bại rải rác.
   14:02  Kubernetes giết pod #3 vì liveness probe fail 3 lần liên tiếp.
   14:02  Traffic của pod #3 dồn sang 9 pod còn lại → mỗi pod +11% tải.
   14:03  Latency lên 1.200 ms. Pod #5, #7 cũng fail health check → bị giết.
   14:03  7 pod còn lại gánh 100% traffic → latency 2.000 ms.
   14:04  Toàn bộ pod fail health check. Kubernetes giết tất cả.
   14:05  Pod mới khởi động, chưa kịp warm-up đã nhận full traffic → chết ngay.
   14:06  CrashLoopBackOff. Dịch vụ chết hoàn toàn.

   Nguyên nhân gốc: traffic tăng 20%.
   Kết quả: mất dịch vụ hoàn toàn.
```

Nếu **không có health check**, hệ thống chỉ chậm đi (800 ms) rồi tự hồi phục. Health check biến "chậm" thành "chết".

## Cơ chế: vòng phản hồi dương

```text
        ┌────────────────────────────────────┐
        │                                    │
        ▼                                    │
   Hệ thống chậm ──→ Health check fail ──→ Pod bị giết
        ▲                                    │
        │                                    │
        └──── Ít pod hơn, tải cao hơn ←──────┘
```

Giống hệt retry storm (case 1): một vòng lặp tự khuếch đại, không có điểm dừng tự nhiên cho tới khi sập hoàn toàn.

## Ba loại probe của Kubernetes — hiểu đúng vai trò

Đây là gốc rễ của mọi sai lầm: dùng nhầm loại probe.

| Probe | Câu hỏi nó trả lời | Fail thì sao |
|---|---|---|
| **Liveness** | "Tiến trình này có bị treo không?" | **GIẾT pod và khởi động lại** |
| **Readiness** | "Pod này sẵn sàng nhận traffic chưa?" | **Loại khỏi load balancer** (không giết) |
| **Startup** | "Pod đã khởi động xong chưa?" | Giết nếu quá thời gian cho phép |

**Khác biệt sống còn**: liveness **giết**, readiness chỉ **tạm ngừng gửi traffic**.

```text
   Liveness fail  → pod restart → mất toàn bộ trạng thái, mất warm-up,
                                   mất connection pool, mất JIT
   Readiness fail → pod nghỉ ngơi → hồi phục → tự quay lại
```

### Quy tắc vàng: liveness KHÔNG được kiểm tra dependency

```java
// SAI NGHIÊM TRỌNG — liveness kiểm tra database
@GetMapping("/health/live")
public ResponseEntity<String> liveness() {
    jdbcTemplate.queryForObject("SELECT 1", Integer.class);      // ← SAI
    redisTemplate.hasKey("ping");                                // ← SAI
    paymentClient.ping();                                        // ← RẤT SAI
    return ResponseEntity.ok("OK");
}
```

Chuyện gì xảy ra khi database chậm 2 giây?

```text
   Database chậm
        ↓
   Liveness fail ở TẤT CẢ pod cùng lúc
        ↓
   Kubernetes giết TẤT CẢ pod
        ↓
   Pod mới khởi động, database vẫn chậm, lại fail
        ↓
   CrashLoopBackOff vĩnh viễn
        ↓
   Database khoẻ lại, nhưng pod đang ở backoff 5 phút — dịch vụ vẫn chết
```

**Restart pod không sửa được database chậm.** Nó chỉ làm mọi thứ tệ hơn: pod mới phải mở lại connection pool, nạp lại cache, JIT compile lại từ đầu — tức là tạo thêm tải lên chính database đang ốm.

```java
// ĐÚNG — liveness chỉ kiểm tra "tiến trình còn sống"
@GetMapping("/health/live")
public ResponseEntity<String> liveness() {
    return ResponseEntity.ok("OK");        // trả về được = JVM còn chạy
}
```

Nghe có vẻ vô dụng, nhưng không: nếu JVM bị deadlock hoàn toàn hoặc treo vì GC, endpoint này cũng không trả lời được. Đó chính xác là trường hợp restart thật sự giúp ích.

Muốn kỹ hơn, kiểm tra những thứ **chỉ restart mới sửa được**:

```java
@GetMapping("/health/live")
public ResponseEntity<String> liveness() {
    // Deadlock trong JVM — chỉ restart mới thoát
    long[] deadlocked = ManagementFactory.getThreadMXBean().findDeadlockedThreads();
    if (deadlocked != null && deadlocked.length > 0) {
        return ResponseEntity.status(503).body("deadlock detected");
    }
    return ResponseEntity.ok("OK");
}
```

### Readiness mới là nơi kiểm tra dependency

```java
@GetMapping("/health/ready")
public ResponseEntity<Map<String, String>> readiness() {
    Map<String, String> status = new LinkedHashMap<>();
    boolean ready = true;

    // Database là dependency BẮT BUỘC — không có thì không phục vụ được
    try {
        jdbcTemplate.queryForObject("SELECT 1", Integer.class);
        status.put("database", "UP");
    } catch (Exception e) {
        status.put("database", "DOWN");
        ready = false;
    }

    // Thread pool sắp cạn → tạm ngừng nhận traffic mới
    double util = (double) tomcatBusyThreads() / tomcatMaxThreads();
    status.put("threadPool", String.format("%.0f%%", util * 100));
    if (util > 0.95) ready = false;

    // Dependency KHÔNG bắt buộc — chỉ ghi nhận, KHÔNG ảnh hưởng ready
    status.put("recommendService", recommendCircuitBreaker.getState().toString());

    return ready ? ResponseEntity.ok(status)
                 : ResponseEntity.status(503).body(status);
}
```

Phân biệt **dependency bắt buộc** và **không bắt buộc** là điểm mấu chốt. Nếu service gợi ý chết mà bạn cho readiness fail, bạn tự loại mình khỏi load balancer vì một tính năng phụ.

## Cạm bẫy: readiness fail đồng loạt cũng giết hệ thống

Ngay cả readiness cũng nguy hiểm nếu mọi pod cùng fail:

```text
   Database chậm → readiness fail ở TẤT CẢ pod
        ↓
   Load balancer loại TẤT CẢ pod khỏi danh sách
        ↓
   Không còn instance nào nhận traffic
        ↓
   503 cho 100% người dùng — dù các pod vẫn chạy tốt!
```

Load balancer cần cơ chế bảo vệ, thường gọi là **fail-open** hoặc **panic mode**:

```text
   AWS Target Group : nếu TẤT CẢ target unhealthy → vẫn gửi traffic tới tất cả
   Envoy            : panic threshold (mặc định 50%) — nếu dưới ngưỡng healthy,
                      bỏ qua trạng thái health và gửi cho tất cả
   Nginx            : cần cấu hình thủ công
```

Triết lý: **thà gửi traffic tới một instance đang ốm còn hơn không gửi đi đâu cả.**

Trong Kubernetes, thêm `PodDisruptionBudget` để tránh bị xoá quá nhiều pod cùng lúc trong các thao tác vận hành:

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: order-service-pdb
spec:
  minAvailable: 60%
  selector:
    matchLabels:
      app: order-service
```

## Cấu hình probe đúng

```yaml
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
        - name: app
          # STARTUP: cho ứng dụng thời gian khởi động
          startupProbe:
            httpGet: { path: /actuator/health/liveness, port: 8080 }
            failureThreshold: 30          # 30 × 5s = tối đa 150 giây khởi động
            periodSeconds: 5

          # LIVENESS: rộng rãi, chỉ giết khi thật sự treo
          livenessProbe:
            httpGet: { path: /actuator/health/liveness, port: 8080 }
            periodSeconds: 20             # kiểm tra thưa
            timeoutSeconds: 5             # timeout rộng rãi
            failureThreshold: 6           # 6 lần liên tiếp = 2 phút mới giết
            successThreshold: 1

          # READINESS: nhạy, phản ứng nhanh
          readinessProbe:
            httpGet: { path: /actuator/health/readiness, port: 8080 }
            periodSeconds: 5
            timeoutSeconds: 3
            failureThreshold: 3           # 15 giây thì rút khỏi LB
            successThreshold: 2           # cần 2 lần OK mới quay lại (chống dao động)
```

Bốn nguyên tắc rút ra từ cấu hình này:

| Nguyên tắc | Lý do |
|---|---|
| **Liveness rộng rãi hơn readiness rất nhiều** | Giết pod là hành động phá huỷ, phải rất chắc chắn |
| **Dùng `startupProbe`** | Ứng dụng Java khởi động 60-120 giây; không có startupProbe thì liveness giết nó giữa chừng |
| **`successThreshold: 2` cho readiness** | Chống dao động vào/ra load balancer liên tục |
| **`failureThreshold` cao cho liveness** | 2 phút suy giảm không đáng để restart |

### Spring Boot có sẵn hai endpoint riêng

```yaml
management:
  endpoint:
    health:
      probes:
        enabled: true                    # tạo /health/liveness và /health/readiness
      show-details: always
  health:
    livenessstate:
      enabled: true
    readinessstate:
      enabled: true
    # TẮT các health indicator không nên ảnh hưởng tới probe
    redis:
      enabled: false
    mail:
      enabled: false
```

Mặc định, Spring Boot gom **mọi** health indicator vào `/actuator/health` — bao gồm Redis, RabbitMQ, disk space, mail. Nếu bạn trỏ probe vào đó, một Redis chậm sẽ làm pod bị giết. Luôn dùng hai endpoint riêng biệt.

## Cạm bẫy: warm-up

Ứng dụng Java vừa khởi động chậm hơn nhiều so với khi đã chạy ổn định:

```text
   Pod mới khởi động:
   ├─ JIT chưa compile → code chạy ở chế độ thông dịch, chậm 10-50 lần
   ├─ Connection pool trống → mỗi query phải mở connection mới
   ├─ Cache trống → mọi request đều xuống database
   └─ Class chưa nạp hết

   ⇒ Nhận full traffic ngay = quá tải = readiness fail = vòng lặp
```

Giải pháp:

**1. Warm-up trước khi báo sẵn sàng**

```java
@Component
public class WarmUpService {
    private volatile boolean warmedUp = false;

    @EventListener(ApplicationReadyEvent.class)
    public void warmUp() {
        // Làm nóng connection pool
        for (int i = 0; i < poolSize; i++) {
            jdbcTemplate.queryForObject("SELECT 1", Integer.class);
        }
        // Làm nóng JIT bằng cách chạy thử các đường dẫn nóng
        for (int i = 0; i < 1000; i++) {
            orderService.calculatePrice(sampleOrder);
        }
        // Nạp trước cache khoá nóng
        cacheWarmer.loadTopProducts(500);

        warmedUp = true;
    }

    public boolean isWarmedUp() { return warmedUp; }
}
```

Readiness trả `503` cho tới khi `warmedUp = true`.

**2. Tăng traffic từ từ (slow start)**

```yaml
# Istio DestinationRule
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
spec:
  trafficPolicy:
    loadBalancer:
      warmupDurationSecs: 60        # tăng dần traffic trong 60 giây đầu
```

AWS ALB có tính năng tương đương (`slow_start.duration_seconds`).

**3. CRaC / AOT compilation** (nâng cao): Spring Boot 3 hỗ trợ CRaC (Coordinated Restore at Checkpoint) và biên dịch native với GraalVM — khởi động trong vài chục mili-giây thay vì vài chục giây. Đánh đổi: quy trình build phức tạp hơn, một số thư viện chưa tương thích.

## Cạm bẫy: health check tốn tài nguyên

```java
// SAI — health check chạy query nặng
@GetMapping("/health")
public String health() {
    long count = orderRepository.count();      // COUNT(*) trên 50 triệu dòng!
    return "OK: " + count;
}
```

Với 10 pod và probe mỗi 5 giây, đó là **2 query nặng mỗi giây** chỉ để kiểm tra sức khoẻ. Chính health check trở thành nguồn tải.

Health check phải **cực nhẹ**:
- Query nhẹ nhất có thể (`SELECT 1`).
- Có cache kết quả vài giây.
- Không bao giờ gọi ra mạng ngoài.

```java
@Component
public class CachedHealthCheck {
    private final Cache<String, Boolean> cache = Caffeine.newBuilder()
        .expireAfterWrite(Duration.ofSeconds(3))
        .build();

    public boolean isDatabaseUp() {
        return cache.get("db", k -> {
            try { jdbcTemplate.queryForObject("SELECT 1", Integer.class); return true; }
            catch (Exception e) { return false; }
        });
    }
}
```

## Tắt êm (graceful shutdown) — mặt còn lại của vấn đề

Khi Kubernetes muốn dừng pod, nó gửi `SIGTERM`. Nếu ứng dụng thoát ngay, các request đang xử lý bị đứt giữa chừng.

```yaml
spring:
  lifecycle:
    timeout-per-shutdown-phase: 30s
server:
  shutdown: graceful          # ngừng nhận request mới, xử lý nốt request cũ
```

```yaml
# Kubernetes
spec:
  terminationGracePeriodSeconds: 45      # phải LỚN HƠN timeout của Spring
  containers:
    - name: app
      lifecycle:
        preStop:
          exec:
            command: ["sh", "-c", "sleep 10"]    # chờ LB cập nhật xong
```

`preStop` với `sleep 10` giải quyết một vấn đề tinh tế: Kubernetes xoá pod khỏi Endpoints **đồng thời** với việc gửi `SIGTERM`, nhưng load balancer cần vài giây để cập nhật. Trong khoảng đó, traffic vẫn tới pod đang tắt.

```text
   Không có preStop:
   t=0   : SIGTERM, app bắt đầu tắt
   t=0-3s: LB vẫn gửi traffic tới → 502/503 cho người dùng

   Có preStop sleep 10:
   t=0    : Kubernetes xoá khỏi Endpoints, chạy preStop
   t=0-10s: app VẪN PHỤC VỤ BÌNH THƯỜNG, LB cập nhật xong
   t=10s  : SIGTERM, tắt êm
   ⇒ Không mất request nào
```

Đây là cấu hình mà rất nhiều hệ thống thiếu, và là nguyên nhân của những lỗi 502 rải rác mỗi lần deploy.

## Trường hợp thực tế: sự cố dây chuyền 3 tiếng

Bối cảnh: hệ thống 12 microservice trên Kubernetes.

**Nguyên nhân gốc**: một replica database bị lỗi, query chậm từ 20 ms lên 900 ms.

**Chuỗi sự kiện**:

```text
   1. Query chậm → health check (kiểm tra DB) vượt timeout 1 giây
   2. Liveness fail → Kubernetes giết pod
   3. Pod mới khởi động → chưa warm-up → chậm hơn nữa → lại fail
   4. CrashLoopBackOff ở service A
   5. Service B gọi A → timeout → thread cạn → health check của B cũng fail
   6. Lan sang C, D, E... 8/12 service vào CrashLoopBackOff
   7. Database replica được sửa lúc 15:20, nhưng hệ thống KHÔNG hồi phục
      vì tất cả pod đang ở backoff 5 phút và khởi động lại thì gặp
      cơn bão connection từ 8 service cùng lúc
   8. 17:10: Phải tắt hết, khởi động lại từng service một theo thứ tự phụ thuộc
```

**Các thay đổi sau sự cố**:

| Thay đổi | Tác dụng |
|---|---|
| Liveness **không** kiểm tra dependency | Cắt đứt vòng lặp ở gốc |
| Readiness phân biệt dependency bắt buộc/không | Không tự loại mình vì tính năng phụ |
| `failureThreshold: 6` cho liveness | Chịu được suy giảm 2 phút |
| Thêm `startupProbe` | Pod không bị giết lúc đang khởi động |
| Warm-up trước khi báo ready | Pod mới không chết vì full traffic |
| `preStop` + graceful shutdown | Deploy không mất request |
| Panic mode ở service mesh | Không bao giờ loại hết instance |
| Bulkhead + circuit breaker (phase-2) | Ngăn lan truyền giữa các service |

Diễn tập lại kịch bản y hệt sau khi sửa: **latency tăng lên 900 ms, không pod nào bị giết, hệ thống suy giảm nhưng vẫn phục vụ, và tự hồi phục hoàn toàn trong 40 giây sau khi database được sửa.**

## Bảng tổng kết: probe nên kiểm tra gì

| Kiểm tra | Liveness | Readiness | Lý do |
|---|---|---|---|
| Tiến trình còn chạy | ✓ | ✓ | |
| Deadlock trong JVM | ✓ | | Chỉ restart mới sửa được |
| Database (bắt buộc) | **✗** | ✓ | Restart không sửa được DB |
| Redis (cache) | ✗ | ✗ | Có fallback, không chặn phục vụ |
| Service phụ thuộc | **✗** | ✗ | Có circuit breaker lo |
| Thread pool sắp cạn | ✗ | ✓ | Tạm nghỉ để hồi phục |
| Đã warm-up xong | ✗ | ✓ | Chưa sẵn sàng nhận full traffic |
| Dung lượng đĩa | ✗ | Tuỳ | Chỉ khi ứng dụng thật sự cần ghi đĩa |

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Liveness kiểm tra database | Database chậm → giết toàn bộ pod |
| Dùng chung một endpoint cho cả hai probe | Mất hoàn toàn sự phân biệt |
| Trỏ probe vào `/actuator/health` mặc định | Mọi indicator (Redis, mail, disk) đều ảnh hưởng |
| Không có `startupProbe` | Pod bị giết giữa lúc khởi động |
| `failureThreshold: 1` cho liveness | Một lần mạng chớp nháy = restart |
| Health check chạy query nặng | Chính nó gây tải |
| Không warm-up | Pod mới chết ngay khi nhận traffic |
| Không có `preStop` | Mất request mỗi lần deploy |
| Không có panic mode ở LB | Tất cả pod bị loại = 100% lỗi |

## Tóm tắt case 6

- **Liveness GIẾT pod, readiness chỉ tạm ngừng traffic.** Đây là khác biệt sống còn.
- **Liveness tuyệt đối không kiểm tra dependency** — restart không sửa được database chậm, chỉ làm tệ hơn.
- Readiness kiểm tra dependency **bắt buộc**, bỏ qua dependency **không bắt buộc**.
- Liveness phải **rộng rãi** (`failureThreshold: 6`, `periodSeconds: 20`); readiness thì nhạy hơn.
- **Luôn có `startupProbe`** cho ứng dụng Java (khởi động 60-120 giây).
- **Warm-up trước khi báo ready** — JIT, connection pool, cache.
- **`preStop: sleep 10` + graceful shutdown** để không mất request khi deploy.
- Load balancer cần **panic mode**: thà gửi tới instance ốm còn hơn không gửi đi đâu.

**Bài kế tiếp** → [Case 7: Metastable failure — vì sao hệ thống không tự hồi phục](07-case-metastable-failure.md)
