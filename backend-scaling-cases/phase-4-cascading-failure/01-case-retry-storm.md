# Case 1: Retry storm — khi cơ chế thử lại tự giết hệ thống

Retry là kỹ thuật đầu tiên ai cũng học khi làm hệ phân tán: "gọi lỗi thì thử lại". Nó cứu bạn khỏi những lỗi mạng thoáng qua.

Nó cũng là cách nhanh nhất để biến một sự cố nhỏ thành một sự cố toàn diện.

## Hiện tượng

```text
   10:00  payment-service quá tải nhẹ. Tỉ lệ lỗi 5%. Vẫn phục vụ được 95% khách.

   10:01  order-service thấy lỗi → retry 3 lần.
          Tải lên payment-service: 1.000 → 1.150 RPS (+15%)

   10:02  Tải cao hơn → tỉ lệ lỗi 20% → nhiều retry hơn.
          Tải: 1.150 → 1.600 RPS

   10:03  Tỉ lệ lỗi 60% → gần như mọi request đều retry 3 lần.
          Tải: 1.600 → 3.400 RPS

   10:04  payment-service CHẾT HOÀN TOÀN. Tỉ lệ lỗi 100%.
          Tải: 4.000 RPS — toàn bộ là retry vô ích.

   10:20  Đội vận hành khởi động lại payment-service.
          Nó sống được 8 giây rồi chết ngay vì 4.000 RPS retry vẫn đang dội vào.
```

Điểm cay đắng nhất: nếu **không có retry**, hệ thống chỉ hỏng 5%. Có retry, nó hỏng 100% và **không thể khởi động lại được**.

## Cơ chế: khuếch đại theo cấp số nhân

```text
   Chuỗi gọi: Gateway → Order → Payment → Bank

   Mỗi tầng retry 3 lần:

   1 request người dùng
     → 3 lần Gateway gọi Order
       → 3 × 3 = 9 lần Order gọi Payment
         → 9 × 3 = 27 lần Payment gọi Bank

   ⇒ Một cú bấm nút của người dùng = 27 lần gọi ngân hàng.
```

Công thức: với chuỗi `n` tầng, mỗi tầng retry `r` lần, hệ số khuếch đại là **`r^n`**.

| Số tầng | Retry 2 lần | Retry 3 lần | Retry 5 lần |
|---|---|---|---|
| 2 | 4× | 9× | 25× |
| 3 | 8× | 27× | 125× |
| 4 | 16× | 81× | 625× |
| 5 | 32× | **243×** | 3.125× |

Trong kiến trúc microservice 5 tầng — hoàn toàn bình thường — retry 3 lần ở mỗi tầng tạo ra **243 lần tải**. Đây là lý do retry storm sập hệ thống nhanh đến vậy.

### Vòng phản hồi dương

```text
        ┌──────────────────────────────────┐
        │                                  │
        ▼                                  │
   Service chậm ──→ Nhiều lỗi ──→ Nhiều retry
        ▲                                  │
        │                                  │
        └──────── Tải tăng ←───────────────┘
```

Đây là **positive feedback loop** (vòng phản hồi dương) — mỗi vòng làm tình hình tệ hơn, không có điểm dừng tự nhiên. Hệ thống chỉ dừng khi sập hoàn toàn.

Đây cũng là lý do **metastable failure** (case 7): sau khi nguyên nhân gốc biến mất, vòng lặp vẫn tự duy trì bằng chính retry của nó.

## Năm sai lầm khi retry

### Sai lầm 1: Retry ngay lập tức, không chờ

```java
// SAI
for (int i = 0; i < 3; i++) {
    try { return client.call(); }
    catch (Exception e) { /* thử lại ngay */ }
}
```

Service đang quá tải cần **thời gian để hồi phục**. Dội request vào ngay lập tức là điều tệ nhất có thể làm.

### Sai lầm 2: Backoff cố định, không có jitter

```java
// VẪN SAI
Thread.sleep(1000);      // mọi client đều chờ đúng 1 giây
```

```text
   1.000 client cùng gặp lỗi tại t=0
   Tất cả cùng retry tại t=1s     ← đợt sóng thứ hai, cùng lúc
   Tất cả cùng retry tại t=2s     ← đợt sóng thứ ba
```

Các đợt sóng đồng bộ này gọi là **thundering herd** (đàn thú giẫm đạp). Chính là vấn đề `c²ₐ` — biến động đầu vào — trong công thức Kingman (phase-1 bài 5).

### Sai lầm 3: Retry lỗi không đáng retry

```text
   ĐÁNG retry (lỗi tạm thời):
   ├─ Timeout mạng
   ├─ 503 Service Unavailable
   ├─ 429 Too Many Requests (kèm Retry-After)
   ├─ Connection reset
   └─ Deadlock database

   KHÔNG đáng retry (lỗi vĩnh viễn):
   ├─ 400 Bad Request      — dữ liệu sai, thử lại vẫn sai
   ├─ 401 / 403            — không có quyền
   ├─ 404 Not Found        — không tồn tại
   ├─ 422 Unprocessable    — vi phạm quy tắc nghiệp vụ
   └─ Mọi lỗi logic của chính bạn
```

Retry một request `400 Bad Request` là lãng phí thuần tuý — nó sẽ lỗi lần nữa, chắc chắn 100%.

### Sai lầm 4: Retry thao tác không idempotent

```java
@Retryable(maxAttempts = 3)
public void charge(String cardId, BigDecimal amount) {
    paymentGateway.charge(cardId, amount);      // NGUY HIỂM
}
```

Nếu request đã tới ngân hàng nhưng response bị mất, retry sẽ **trừ tiền lần thứ hai**. Timeout **không** có nghĩa là thao tác chưa xảy ra.

**Quy tắc sống còn**: chỉ retry khi thao tác idempotent (chạy nhiều lần cho kết quả như chạy một lần). Nếu không idempotent, phải thêm **idempotency key** (phase-3 case 6).

### Sai lầm 5: Retry ở mọi tầng

Đây là sai lầm sinh ra hệ số `r^n`. Giải pháp ở phần sau.

## Retry đúng cách

### Bước 1: Exponential backoff + jitter

```java
@Retryable(
    retryFor = { SocketTimeoutException.class, ServiceUnavailableException.class },
    noRetryFor = { BadRequestException.class, NotFoundException.class },
    maxAttempts = 3,
    backoff = @Backoff(
        delay = 100,           // lần 1 chờ 100 ms
        multiplier = 2,        // lần 2: 200 ms, lần 3: 400 ms
        maxDelay = 5000,
        random = true          // JITTER — bắt buộc
    )
)
public PaymentResult charge(ChargeRequest req) { ... }
```

Các kiểu backoff, so sánh:

| Kiểu | Công thức | Đánh giá |
|---|---|---|
| Cố định | `delay` | Tệ — đồng bộ hoá các client |
| Tuyến tính | `delay × n` | Khá hơn nhưng vẫn đồng bộ |
| Mũ | `delay × 2^n` | Tốt cho việc giãn tải |
| **Mũ + full jitter** | `random(0, delay × 2^n)` | **Tốt nhất** |
| Decorrelated jitter | `random(base, prev × 3)` | Tốt cho tải rất cao |

**Full jitter** — công thức được AWS khuyến nghị sau khi phân tích thực nghiệm:

```java
long delay = ThreadLocalRandom.current().nextLong(0, baseDelay * (1L << attempt));
```

```text
   Không jitter:  1.000 client retry đúng tại t=100ms, 200ms, 400ms
                  → ba đợt sóng 1.000 request

   Full jitter:   1.000 client rải đều trong khoảng 0-100ms, 0-200ms, 0-400ms
                  → tải phẳng, không có sóng
```

Sự khác biệt trong thực nghiệm là rất lớn: full jitter giảm tải đỉnh xuống **khoảng một nửa** và giảm tổng số lần thử đáng kể so với backoff không jitter.

### Bước 2: Chỉ retry ở MỘT tầng

Đây là quyết định kiến trúc quan trọng nhất về retry.

```text
   SAI — retry ở mọi tầng:
   Gateway (3×) → Order (3×) → Payment (3×) → Bank (3×) = 81×

   ĐÚNG — retry ở tầng ngoài cùng, các tầng trong fail fast:
   Gateway (3×) → Order (0) → Payment (0) → Bank (0) = 3×
```

Vì sao chọn tầng ngoài cùng? Vì nó có đủ thông tin để quyết định: nó biết người dùng còn chờ được bao lâu, biết request này quan trọng đến đâu.

Trường hợp ngoại lệ hợp lý: retry ở **tầng sát nhất với lỗi mạng thoáng qua** (ví dụ retry một lần khi kết nối bị reset), miễn là ghi rõ trong tài liệu và không chồng chất.

Cách thực thi trong thực tế: truyền một header đánh dấu.

```java
// Tầng trong kiểm tra: nếu đây đã là retry thì không retry nữa
if (request.getHeader("X-Retry-Attempt") != null) {
    // fail fast, không retry
}
```

### Bước 3: Retry budget — giới hạn tổng lượng retry

Đây là kỹ thuật mạnh nhất và ít được biết nhất. Ý tưởng: **retry không được vượt quá X% tổng số request**.

```java
@Component
public class RetryBudget {
    private final AtomicLong requests = new AtomicLong();
    private final AtomicLong retries  = new AtomicLong();
    private static final double MAX_RATIO = 0.10;    // retry tối đa 10%

    public boolean canRetry() {
        long req = requests.get();
        if (req < 100) return true;                  // chưa đủ mẫu, cho phép
        return retries.get() < req * MAX_RATIO;
    }

    public void recordRequest() { requests.incrementAndGet(); }
    public void recordRetry()   { retries.incrementAndGet(); }

    @Scheduled(fixedDelay = 10_000)                  // cửa sổ trượt 10 giây
    public void reset() {
        requests.set(0);
        retries.set(0);
    }
}
```

```text
   Bình thường:  1.000 request, 20 lỗi → 20 retry (2%) → cho phép

   Sự cố:        1.000 request, 900 lỗi → muốn 2.700 retry (270%)
                 → CHẶN. Chỉ cho phép 100 retry (10%).

   ⇒ Tải thêm tối đa 10%, không bao giờ là 270%.
```

Retry budget đảm bảo rằng **dù mọi thứ hỏng, retry cũng chỉ thêm 10% tải**. Nó biến một cơ chế nguy hiểm thành một cơ chế an toàn có giới hạn.

Đây là cách gRPC, Envoy và các service mesh hiện đại triển khai retry. Nếu bạn dùng Istio/Linkerd, hãy bật tính năng này thay vì tự viết.

### Bước 4: Kết hợp với circuit breaker

Retry và circuit breaker giải quyết hai vấn đề khác nhau và **phải dùng cùng nhau**:

```text
   Retry           : xử lý lỗi TẠM THỜI, NGẪU NHIÊN (mạng chớp nháy)
   Circuit breaker : xử lý lỗi KÉO DÀI, CÓ HỆ THỐNG (service chết)
```

```java
@Retry(name = "payment")                    // ngoài cùng
@CircuitBreaker(name = "payment")           // trong
@Bulkhead(name = "payment")
public PaymentResult charge(...) { ... }
```

Khi cầu dao mở, retry sẽ nhận `CallNotPermittedException` và **dừng ngay** thay vì thử lại — vì cầu dao đã biết chắc là sẽ hỏng. Đây là sự phối hợp quan trọng: circuit breaker **cắt nguồn nhiên liệu** của retry storm.

Cấu hình để retry không thử lại khi cầu dao mở:

```yaml
resilience4j:
  retry:
    instances:
      payment:
        max-attempts: 3
        wait-duration: 100ms
        exponential-backoff-multiplier: 2
        randomized-wait-factor: 0.5          # jitter
        ignore-exceptions:
          - io.github.resilience4j.circuitbreaker.CallNotPermittedException
          - com.shop.BadRequestException
```

### Bước 5: Tôn trọng `Retry-After`

Khi server trả `429` hoặc `503` kèm header `Retry-After`, nó đang **nói cho bạn biết khi nào nên quay lại**. Tuân thủ nó.

```java
catch (HttpStatusCodeException e) {
    if (e.getStatusCode() == HttpStatus.TOO_MANY_REQUESTS) {
        String retryAfter = e.getResponseHeaders().getFirst("Retry-After");
        if (retryAfter != null) {
            Thread.sleep(Long.parseLong(retryAfter) * 1000);
        }
    }
}
```

Và ở phía server, hãy **luôn gửi header này** khi từ chối vì quá tải — nó giúp client hành xử đúng.

## Trường hợp thực tế: sự cố 4 tiếng

Bối cảnh: hệ thống thương mại điện tử, 6 microservice, mỗi service dùng `@Retryable(maxAttempts = 3)` như một "thực hành tốt".

**Diễn biến**:

```text
   09:00  Một node database bị lỗi phần cứng. inventory-service chậm.
   09:01  Retry storm bắt đầu. Tải nội bộ tăng 27 lần.
   09:03  Toàn bộ 6 service quá tải, không service nào phục vụ được.
   09:15  Đội vận hành khởi động lại các service. Chúng chết lại sau vài giây.
   09:45  Chuyển database sang node dự phòng. VẪN KHÔNG HỒI PHỤC.
   10:30  Nhận ra retry là thủ phạm. Tắt retry bằng feature flag.
   10:32  Hệ thống hồi phục hoàn toàn trong 2 phút.
```

Điểm quan trọng: **từ 09:45 nguyên nhân gốc đã được sửa, nhưng hệ thống vẫn chết thêm 45 phút** — vì retry storm tự nuôi chính nó. Đây là metastable failure điển hình.

**Các biện pháp sau sự cố**:

| Việc | Kết quả trong lần diễn tập tiếp theo |
|---|---|
| Chỉ retry ở API gateway, các service khác `maxAttempts = 1` | Khuếch đại 27× → 3× |
| Thêm full jitter | Không còn sóng đồng bộ |
| Retry budget 10% | Tải thêm tối đa 10% khi sự cố |
| Circuit breaker với `slow-call-rate-threshold` | Cắt sớm, retry không kích hoạt |
| **Feature flag tắt retry toàn cục** | Công tắc cứu hộ, tắt được trong 30 giây |
| Load shedding ở gateway | Bảo vệ tầng trong |

Hạng mục quan trọng nhất là cái thứ năm: **một công tắc để tắt retry ngay lập tức trên toàn hệ thống**. Trong sự cố trên, nếu có sẵn công tắc này, sự cố đã kết thúc lúc 09:46 thay vì 10:32.

```java
@Component
public class RetryPolicy {
    @Value("${resilience.retry.enabled:true}")     // đọc từ config server, đổi nóng
    private volatile boolean enabled;

    public boolean shouldRetry(Throwable t, int attempt) {
        if (!enabled) return false;                 // công tắc khẩn cấp
        if (!retryBudget.canRetry()) return false;
        return isTransient(t) && attempt < maxAttempts;
    }
}
```

## Giám sát retry

```promql
# Tỉ lệ retry — cảnh báo khi vượt 10%
rate(resilience4j_retry_calls_total{kind="successful_with_retry"}[5m])
  / rate(resilience4j_retry_calls_total[5m])

# Số lần retry thất bại hoàn toàn
rate(resilience4j_retry_calls_total{kind="failed_with_retry"}[5m])
```

Dấu hiệu cảnh báo sớm của retry storm: **tỉ lệ retry tăng đột ngột**. Nó xuất hiện trước khi hệ thống sập vài phút — đủ để tự động hoá phản ứng.

## Bảng tổng kết: retry đúng vs sai

| Khía cạnh | Sai | Đúng |
|---|---|---|
| Số lần | 3-5 ở mọi tầng | **3 ở một tầng duy nhất** |
| Chờ giữa các lần | Không chờ / cố định | **Mũ + full jitter** |
| Loại lỗi | Retry tất cả | **Chỉ lỗi tạm thời** |
| Idempotency | Không quan tâm | **Bắt buộc, hoặc dùng idempotency key** |
| Giới hạn tổng | Không có | **Retry budget 10%** |
| Kết hợp | Retry đơn độc | **Retry + circuit breaker + bulkhead** |
| Công tắc khẩn cấp | Không có | **Feature flag tắt được trong 30 giây** |
| Giám sát | Không đo | **Cảnh báo khi tỉ lệ retry > 10%** |

## Khi nào KHÔNG nên retry

- **Thao tác tốn kém** (báo cáo chạy 5 phút): retry nhân đôi tải nặng. Thà báo lỗi và để người dùng chủ động thử lại.
- **Người dùng đang chờ và đã gần hết kiên nhẫn**: nếu ngân sách thời gian còn 200 ms, đừng retry với backoff 500 ms. Kiểm tra deadline trước khi retry.
- **Đã biết chắc downstream đang chết** (cầu dao mở): retry chỉ tốn tài nguyên.
- **Ghi dữ liệu không idempotent và không có idempotency key**: nguy cơ hỏng dữ liệu lớn hơn lợi ích.

```java
// Kiểm tra ngân sách thời gian trước khi retry
if (Deadline.remaining().toMillis() < estimatedBackoff + estimatedCallDuration) {
    throw new DeadlineExceededException();       // đừng retry vô ích
}
```

## Tóm tắt case 1

- Retry ở `n` tầng, mỗi tầng `r` lần → khuếch đại **`r^n`**. Năm tầng retry 3 lần = **243×**.
- Retry tạo **vòng phản hồi dương**: càng lỗi càng retry, càng retry càng lỗi.
- Bốn quy tắc: **exponential backoff + full jitter**, **chỉ retry ở một tầng**, **chỉ retry lỗi tạm thời**, **chỉ retry thao tác idempotent**.
- **Retry budget (10%)** là biện pháp mạnh nhất — giới hạn cứng lượng tải thêm dù mọi thứ hỏng.
- **Retry + circuit breaker phải đi cùng nhau** — cầu dao cắt nhiên liệu của retry storm.
- Tôn trọng header `Retry-After`, và luôn gửi nó khi từ chối vì quá tải.
- **Feature flag tắt retry toàn cục** là công cụ cứu hộ đáng giá nhất trong sự cố.

**Bài kế tiếp** → [Case 2: Cache stampede — khi cache hết hạn làm sập database](02-case-cache-stampede.md)
