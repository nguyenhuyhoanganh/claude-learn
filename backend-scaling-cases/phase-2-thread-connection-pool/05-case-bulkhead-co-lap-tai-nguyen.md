# Case 5: Bulkhead — vách ngăn kín nước cho ứng dụng

Tàu Titanic không chìm ngay khi đâm vào tảng băng. Nó nổi thêm 2 giờ 40 phút, đủ để hạ xuồng cứu sinh. Lý do: thân tàu được chia thành **16 khoang kín nước** ngăn cách bởi các vách gọi là **bulkhead**. Nước tràn vào khoang này không sang được khoang kia.

(Titanic chìm vì tảng băng xé rách 5-6 khoang liền — nhiều hơn thiết kế chịu được. Bài học phụ: bulkhead giới hạn thiệt hại, không loại bỏ thiệt hại.)

Ứng dụng của bạn hiện tại giống một con tàu **không có vách ngăn nào**: một lỗ thủng ở đâu cũng làm chìm cả tàu. Bài này dạy cách chia khoang.

## Vấn đề: mọi thứ dùng chung một pool

```text
   ┌─────────────── Ứng dụng của bạn ───────────────┐
   │                                                 │
   │   GET /products      ─┐                         │
   │   GET /              ─┤                         │
   │   POST /orders       ─┼─→ [ THREAD POOL 200 ]   │
   │   GET /reports       ─┤    dùng chung tất cả    │
   │   POST /export       ─┘                         │
   │                                                 │
   └─────────────────────────────────────────────────┘

   /reports chậm 30 giây → ăn hết 200 thread → mọi thứ khác chết.
```

Đây chính xác là case 1, nhìn từ góc độ khác. Lần này ta không tìm cách làm `/reports` nhanh hơn (có thể không làm được — nó vốn là báo cáo nặng). Ta chấp nhận nó chậm, nhưng **không cho nó làm chết cái khác**.

## Nguyên lý: chia tài nguyên thành khoang

```text
   ┌─────────────── CÓ BULKHEAD ────────────────────┐
   │                                                 │
   │   GET /products   ─→ [pool: 60 ]                │
   │   GET /           ─→ [pool: 40 ]                │
   │   POST /orders    ─→ [pool: 60 ]                │
   │   GET /reports    ─→ [pool: 20 ]  ← trần cứng   │
   │   POST /export    ─→ [pool: 20 ]                │
   │                                                 │
   └─────────────────────────────────────────────────┘

   /reports treo hoàn toàn → chỉ 20 thread bị giam.
   180 thread còn lại phục vụ bình thường.
```

Đánh đổi rõ ràng và phải chấp nhận: **tổng công suất giảm**. Trước đây lúc `/products` cần 150 thread nó lấy được 150; giờ trần cứng là 60. Bạn đổi **hiệu suất sử dụng tài nguyên** lấy **khả năng cô lập sự cố**.

Đây là đánh đổi hầu như luôn đáng — vì mất 100% dịch vụ tệ hơn nhiều so với giảm 30% công suất một endpoint.

## Hai kiểu bulkhead

### Kiểu 1: Semaphore bulkhead (đếm số lượng)

**Semaphore** (đèn hiệu) — một bộ đếm giới hạn số việc được làm đồng thời. Xin phép trước khi làm, trả lại sau khi xong. Hết phép thì bị từ chối.

```text
   Semaphore = 20 vé

   Request tới → xin vé
     ├─ còn vé  → lấy vé, chạy trên CHÍNH thread hiện tại, xong thì trả vé
     └─ hết vé  → chờ tối đa maxWaitDuration, không được thì từ chối ngay
```

Đặc điểm: **không đổi thread**, rất nhẹ, không tốn thêm bộ nhớ.

```yaml
resilience4j:
  bulkhead:
    instances:
      reportApi:
        max-concurrent-calls: 20
        max-wait-duration: 0        # hết vé thì từ chối NGAY
```

```java
@Bulkhead(name = "reportApi", fallbackMethod = "busy")
@GetMapping("/reports/{id}")
public Report getReport(@PathVariable Long id) {
    return reportService.generate(id);
}

private ResponseEntity<String> busy(Long id, BulkheadFullException e) {
    return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
        .header("Retry-After", "30")
        .body("Hệ thống báo cáo đang bận, vui lòng thử lại sau 30 giây");
}
```

> `max-wait-duration: 0` là lựa chọn quan trọng. Nếu đặt lớn (ví dụ 5 giây), thread vẫn bị giam trong lúc chờ vé — đúng thứ ta đang muốn tránh. **Từ chối ngay tốt hơn xếp hàng.**

### Kiểu 2: Thread pool bulkhead (pool riêng)

Tác vụ được đẩy sang một pool thread **hoàn toàn riêng**. Thread gọi được giải phóng ngay.

```text
   Tomcat thread ──submit──→ [Pool riêng: 10 thread + hàng đợi 50]
        │                              │
        └─ chờ CompletableFuture       └─ chạy tác vụ ở đây
           (có timeout)
```

```yaml
resilience4j:
  thread-pool-bulkhead:
    instances:
      reportApi:
        core-thread-pool-size: 5
        max-thread-pool-size: 10
        queue-capacity: 50
        keep-alive-duration: 20ms
```

```java
@Bulkhead(name = "reportApi", type = Bulkhead.Type.THREADPOOL)
@TimeLimiter(name = "reportApi")
public CompletableFuture<Report> getReport(Long id) {
    return CompletableFuture.completedFuture(reportService.generate(id));
}
```

### So sánh

| Tiêu chí | Semaphore | Thread pool |
|---|---|---|
| Đổi thread | Không | Có |
| Chi phí bộ nhớ | Rất thấp | Cao (mỗi pool là bộ thread riêng) |
| Có hàng đợi riêng | Không | Có |
| Giải phóng thread gọi | **Không** — thread gọi vẫn bị giam | **Có** |
| Giữ được `ThreadLocal` (MDC, security context) | **Có** | Không — phải truyền thủ công |
| Áp được cho code reactive | Có | Không phù hợp |
| Khi nào dùng | Đa số trường hợp | Khi cần cách ly triệt để, tác vụ rất chậm |

**Khuyến nghị**: bắt đầu bằng semaphore. Nó đơn giản, rẻ, giữ nguyên context. Chỉ dùng thread pool bulkhead khi cần tác vụ chạy hẳn ở nơi khác (ví dụ tác vụ 30 giây mà bạn muốn trả `202 Accepted` ngay).

Với thread pool bulkhead, nhớ truyền context sang thread mới:

```java
public class MdcTaskDecorator implements TaskDecorator {
    @Override
    public Runnable decorate(Runnable runnable) {
        Map<String, String> context = MDC.getCopyOfContextMap();
        return () -> {
            try {
                if (context != null) MDC.setContextMap(context);
                runnable.run();
            } finally {
                MDC.clear();
            }
        };
    }
}
```

Không làm bước này thì log trong thread mới **mất trace ID**, và bạn sẽ không lần được request nào sinh ra nó.

## Bốn tầng áp dụng bulkhead

Bulkhead không chỉ cho thread. Áp dụng ở mọi tài nguyên dùng chung:

### Tầng 1 — Theo downstream (phổ biến nhất)

```yaml
resilience4j:
  bulkhead:
    instances:
      paymentService:   { max-concurrent-calls: 20, max-wait-duration: 0 }
      inventoryService: { max-concurrent-calls: 40, max-wait-duration: 0 }
      emailService:     { max-concurrent-calls: 5,  max-wait-duration: 0 }
      recommendService: { max-concurrent-calls: 10, max-wait-duration: 0 }
```

Cách chia: **service càng quan trọng, càng nhiều vé**. `emailService` chỉ 5 vé vì gửi email không khẩn cấp; `inventoryService` 40 vé vì thiếu nó thì không bán được hàng.

### Tầng 2 — Theo connection pool database

```java
@Bean @Primary
public DataSource apiDataSource() {           // pool 15 cho API
    return build("api-pool", 15, 3000);
}

@Bean
public DataSource reportDataSource() {        // pool 3 cho báo cáo
    return build("report-pool", 3, 30000);
}

@Bean
public DataSource batchDataSource() {         // pool 2 cho job đêm
    return build("batch-pool", 2, 60000);
}
```

Job báo cáo chạy 10 phút cũng chỉ chiếm 3 connection. API bán hàng luôn còn 15.

Nếu database hỗ trợ, đi xa hơn: cho batch dùng **read replica** để nó không đụng gì tới DB chính.

### Tầng 3 — Theo loại khách hàng (multi-tenant)

Trong hệ thống nhiều khách hàng dùng chung, một khách gửi 10.000 request có thể làm hỏng trải nghiệm của mọi khách còn lại. Đây gọi là **noisy neighbor problem** (vấn đề hàng xóm ồn ào).

```java
@Component
public class TenantBulkhead {
    private final Map<String, Semaphore> perTenant = new ConcurrentHashMap<>();
    private final int quota;

    public <T> T execute(String tenantId, Supplier<T> task) {
        Semaphore sem = perTenant.computeIfAbsent(tenantId, k -> new Semaphore(quota));
        if (!sem.tryAcquire()) {
            throw new TenantQuotaExceededException(tenantId);
        }
        try {
            return task.get();
        } finally {
            sem.release();
        }
    }
}
```

Nâng cao hơn là **fair queuing** — chia lượt theo vòng tròn giữa các tenant, đảm bảo tenant nhỏ không bao giờ bị tenant lớn đè.

### Tầng 4 — Theo process/container (cách ly mạnh nhất)

Tách hẳn thành deployment riêng:

```yaml
# Kubernetes: cùng một image, hai deployment, chia traffic bằng Ingress
apiVersion: apps/v1
kind: Deployment
metadata:
  name: shop-api           # phục vụ traffic người dùng
spec:
  replicas: 10
  template:
    spec:
      containers:
        - name: app
          env:
            - name: SPRING_PROFILES_ACTIVE
              value: "api"
          resources:
            requests: { cpu: "1",  memory: "1Gi" }
            limits:   { cpu: "2",  memory: "2Gi" }
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: shop-report        # phục vụ báo cáo, cùng code
spec:
  replicas: 2
  template:
    spec:
      containers:
        - name: app
          env:
            - name: SPRING_PROFILES_ACTIVE
              value: "report"
          resources:
            requests: { cpu: "2", memory: "4Gi" }
            limits:   { cpu: "4", memory: "8Gi" }
```

Cùng một codebase, hai nhóm pod. Báo cáo chạy hết CPU cũng không đụng được tới pod API vì chúng là **tiến trình khác nhau, trên máy khác nhau**. Đây là mức cách ly mạnh nhất mà không cần tách microservice.

Cách này thường bị bỏ qua nhưng cực kỳ hiệu quả: **bạn được 90% lợi ích của việc tách service với 5% công sức** — không cần tách database, không cần API mới, không cần xử lý phân tán.

## Cách chia hạn ngạch — phương pháp cụ thể

Đừng chia theo cảm tính. Quy trình:

**Bước 1 — Phân loại endpoint theo mức quan trọng**

| Nhóm | Ví dụ | Mất nó thì sao | % thread |
|---|---|---|---|
| Sống còn (critical) | thanh toán, đăng nhập, đặt hàng | Mất doanh thu ngay | 50% |
| Quan trọng | danh mục, tìm kiếm, giỏ hàng | Trải nghiệm tệ | 30% |
| Bình thường | gợi ý, đánh giá, banner | Người dùng ít nhận ra | 15% |
| Phụ trợ | báo cáo, xuất file, admin | Không ảnh hưởng khách | 5% |

**Bước 2 — Áp định luật Little cho từng nhóm**

```text
   Endpoint /orders:  50 RPS × 0,2 giây × 1,5 = 15 thread
   Endpoint /reports:  2 RPS × 5,0 giây × 1,5 = 15 thread
   ...
```

**Bước 3 — Cộng lại, kiểm tra không vượt tổng**

Nếu tổng vượt `threads.max`, cắt từ nhóm ít quan trọng trước.

**Bước 4 — Chừa dự phòng**

Đừng phân bổ 100%. Chừa 10-15% chưa gán cho các endpoint không lường trước (health check, metric scrape, endpoint mới).

## Trường hợp thực tế: sàn thương mại điện tử

Bối cảnh: `threads.max = 200`, có 4 downstream và 3 nhóm endpoint.

```yaml
resilience4j:
  bulkhead:
    instances:
      # Sống còn — nhiều vé nhất
      paymentService:    { max-concurrent-calls: 40, max-wait-duration: 50ms }
      inventoryService:  { max-concurrent-calls: 40, max-wait-duration: 50ms }
      # Quan trọng
      searchService:     { max-concurrent-calls: 30, max-wait-duration: 0 }
      # Bình thường — ít vé, hỏng cũng không sao
      recommendService:  { max-concurrent-calls: 10, max-wait-duration: 0 }
      reviewService:     { max-concurrent-calls: 10, max-wait-duration: 0 }

  circuitbreaker:
    configs:
      # Downstream không quan trọng: mở mạch sớm, đóng lại chậm
      optional:
        failure-rate-threshold: 30
        wait-duration-in-open-state: 60s
      # Downstream sống còn: mở mạch muộn hơn, thử lại sớm
      critical:
        failure-rate-threshold: 60
        wait-duration-in-open-state: 15s
    instances:
      recommendService: { base-config: optional }
      reviewService:    { base-config: optional }
      paymentService:   { base-config: critical }
```

Tổng vé: 40+40+30+10+10 = **130** trên 200 thread. Còn 70 thread cho các endpoint không gọi downstream (trang tĩnh, health, metric) và dự phòng.

Kết quả kiểm chứng bằng thử nghiệm hỗn loạn (chaos test) — giả lập `recommendService` treo hoàn toàn:

```text
   TRƯỚC bulkhead:  toàn site sập sau 12 giây
   SAU  bulkhead:   trang sản phẩm mất phần "Có thể bạn thích",
                    mọi thứ khác hoạt động bình thường.
                    Doanh thu không đổi.
```

Đây là thước đo đúng của bulkhead: **một tính năng phụ hỏng chỉ được phép làm mất tính năng phụ đó**.

## Fallback — hỏng một cách duyên dáng

Bulkhead từ chối request thì trả về gì? Đừng trả lỗi 500 — hãy **suy giảm có kiểm soát** (graceful degradation):

```java
@Bulkhead(name = "recommendService", fallbackMethod = "defaultRecommendations")
public List<Product> getRecommendations(Long userId) {
    return recommendClient.fetch(userId);
}

private List<Product> defaultRecommendations(Long userId, Throwable t) {
    // Bậc 1: cache cũ (có thể lỗi thời nhưng vẫn hữu ích)
    List<Product> cached = cache.getStale("recommend:" + userId);
    if (cached != null) return cached;

    // Bậc 2: danh sách bán chạy chung, tính sẵn mỗi giờ
    return popularProducts.getTop(10);

    // Bậc 3 (nếu cả hai đều không có): trả danh sách rỗng,
    // giao diện tự ẩn khối "Gợi ý" đi
}
```

Thang bậc suy giảm: **dữ liệu tươi → dữ liệu cũ → dữ liệu chung → không có gì**. Mỗi bậc vẫn cho người dùng một trang web dùng được.

Nguyên tắc: **fallback không được gọi ra ngoài**. Nếu fallback lại gọi một service khác, bạn chỉ chuyển vấn đề sang chỗ mới — và service đó rất có thể cũng đang quá tải vì cùng nguyên nhân.

## Bẫy thường gặp

| Bẫy | Hậu quả | Sửa |
|---|---|---|
| `max-wait-duration` lớn | Thread vẫn bị giam khi chờ vé → mất hết tác dụng | Đặt 0 hoặc rất nhỏ (< 100 ms) |
| Chia quá nhỏ, quá nhiều khoang | Mỗi khoang thiếu, tổng công suất tụt | Chỉ tách những gì thật sự cần cô lập |
| Chia quá to | Một khoang vẫn ăn được gần hết | Áp định luật Little, đo lại |
| Quên metric bulkhead | Không biết khoang nào đang đầy | Theo dõi `resilience4j_bulkhead_available_concurrent_calls` |
| Fallback lại gọi mạng | Lan truyền sự cố sang chỗ khác | Fallback chỉ dùng cache/hằng số |
| Thread pool bulkhead mà quên `TaskDecorator` | Mất MDC, mất trace ID, mất security context | Thêm decorator |
| Áp bulkhead nhưng không có timeout | Vé bị giữ vô hạn → vẫn cạn | Bulkhead **phải** đi kèm timeout |

Bẫy cuối cùng quan trọng nhất: **bulkhead không thay thế timeout**. Nếu một lời gọi giữ vé mãi mãi thì 20 vé cạn trong tích tắc và không bao giờ được trả. Thứ tự đúng của các annotation:

```java
@Bulkhead(name = "svc")           // 3. giới hạn số lượng
@CircuitBreaker(name = "svc")     // 2. ngắt khi hỏng nhiều
@TimeLimiter(name = "svc")        // 1. giới hạn thời gian
@Retry(name = "svc")              // 4. thử lại (ngoài cùng)
public CompletableFuture<X> call() { ... }
```

Resilience4j áp dụng theo thứ tự (từ trong ra ngoài): `Retry` → `CircuitBreaker` → `RateLimiter` → `TimeLimiter` → `Bulkhead`. Nghĩa là retry bọc ngoài cùng — mỗi lần retry sẽ đi qua lại toàn bộ chuỗi, và circuit breaker sẽ đếm cả các lần retry. Đây là hành vi mong muốn.

## Khi nào KHÔNG cần bulkhead

- **Ứng dụng chỉ có một loại endpoint đồng nhất** (ví dụ một API duy nhất): không có gì để cô lập với nhau.
- **Không có downstream nào** (chỉ đọc DB của chính mình): rủi ro thấp hơn nhiều, ưu tiên timeout + pool DB hợp lý.
- **Giai đoạn rất sớm của dự án**: thêm bulkhead sớm làm phức tạp cấu hình mà chưa có dữ liệu để chia hạn ngạch đúng. Hãy có metric trước, bulkhead sau.

Và nhớ: bulkhead **không làm hệ thống nhanh hơn**. Nó làm hệ thống **hỏng có giới hạn**. Đó là hai mục tiêu khác nhau, đừng nhầm lẫn khi báo cáo kết quả.

## Tóm tắt case 5

- Bulkhead = **chia tài nguyên thành khoang** để sự cố không lan ra toàn hệ thống.
- Đánh đổi: **giảm hiệu suất dùng tài nguyên, đổi lấy khả năng cô lập**. Gần như luôn đáng.
- Hai kiểu: **semaphore** (nhẹ, giữ context — dùng mặc định) và **thread pool** (cách ly triệt để, tốn kém).
- `max-wait-duration` phải **bằng 0** hoặc rất nhỏ, nếu không thread vẫn bị giam.
- Áp dụng ở 4 tầng: downstream, connection pool DB, tenant, và **deployment riêng** (mạnh nhất, rẻ nhất).
- Chia hạn ngạch theo **mức quan trọng nghiệp vụ** + định luật Little, chừa 10-15% dự phòng.
- **Bulkhead phải đi kèm timeout** — nếu không, vé bị giữ vĩnh viễn.
- Fallback nên **suy giảm theo bậc** và **không bao giờ gọi ra ngoài**.

**Bài kế tiếp** → [Case 6: synchronized và lock trong JVM — khi thread chặn nhau ngay trong bộ nhớ](06-case-lock-trong-jvm.md)
