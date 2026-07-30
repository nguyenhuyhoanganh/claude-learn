# Case 3: Circuit breaker — cầu dao và nghệ thuật chỉnh ngưỡng

Circuit breaker đã xuất hiện thoáng qua ở phase-2. Bài này đi sâu, vì đây là mẫu thiết kế **dễ cấu hình sai nhất** trong nhóm resilience — và cấu hình sai thì nó vô dụng hoặc gây hại.

Ba lỗi phổ biến nhất:

```text
   1. Ngưỡng quá cao  → cầu dao không bao giờ mở → vô dụng
   2. Ngưỡng quá thấp → cầu dao mở liên tục → tự gây sự cố
   3. Không đếm "chậm" là lỗi → không mở đúng lúc cần nhất
```

## Ý tưởng gốc

Trong nhà bạn có cầu dao điện (circuit breaker). Khi có chập điện, nó **ngắt mạch** — thà mất điện một khu còn hơn cháy nhà.

Trong phần mềm: khi một dịch vụ phụ thuộc hỏng liên tục, ngừng gọi nó. Thất bại **ngay lập tức (0 ms)** thay vì chờ timeout rồi mới thất bại.

```text
   KHÔNG CÓ CẦU DAO
   1.000 request/giây × timeout 2 giây = 2.000 thread bị giam
   ⇒ Cạn thread pool (phase-2 case 1)

   CÓ CẦU DAO (đang mở)
   1.000 request/giây × 0 ms = 0 thread bị giam
   ⇒ Thất bại nhanh, tài nguyên được bảo toàn, còn phục vụ được việc khác
```

Lợi ích thứ hai, quan trọng không kém: **cho service đang hỏng thời gian hồi phục**. Một service quá tải cần khoảng lặng để xử lý hết hàng đợi. Nếu ta cứ dội request vào, nó không bao giờ ngóc đầu lên được (đây chính là metastable failure — case 7).

## Ba trạng thái

```text
                    tỉ lệ lỗi vượt ngưỡng
    ┌──────────┐ ──────────────────────→ ┌──────────┐
    │  CLOSED  │                          │   OPEN   │
    │ cho qua  │ ←────────────────────── │ chặn hết │
    └──────────┘   thử nghiệm thành công  └──────────┘
         ▲                                      │
         │                                      │ hết waitDuration
         │         ┌───────────┐                │
         └─────────│ HALF_OPEN │←───────────────┘
                   │ cho thử N │
                   └───────────┘
                         │ thử vẫn lỗi
                         └──→ quay lại OPEN
```

| Trạng thái | Hành vi | Chuyển đi khi |
|---|---|---|
| **CLOSED** | Cho request qua, đếm kết quả | Tỉ lệ lỗi > ngưỡng → OPEN |
| **OPEN** | Từ chối ngay (`CallNotPermittedException`) | Sau `waitDurationInOpenState` → HALF_OPEN |
| **HALF_OPEN** | Cho `permittedNumberOfCalls` request đi thử | Đủ tỉ lệ thành công → CLOSED, ngược lại → OPEN |

Trạng thái `HALF_OPEN` là chỗ tinh tế: nó **thăm dò** xem service đã khoẻ chưa mà không dội toàn bộ tải vào. Nếu chuyển thẳng OPEN → CLOSED, 1.000 request sẽ đổ vào ngay lập tức và giết chết service vừa mới hồi phục.

## Từng tham số, và cách chọn

```yaml
resilience4j:
  circuitbreaker:
    instances:
      paymentService:
        # Cách đếm: COUNT_BASED = N lời gọi gần nhất.
        # TIME_BASED = mọi lời gọi trong N giây gần nhất (dùng khi traffic thưa).
        sliding-window-type: COUNT_BASED

        # Cỡ cửa sổ quan sát.
        sliding-window-size: 100

        # Số mẫu tối thiểu trước khi được phép ra quyết định mở mạch.
        # Đặt khoảng 20-30% của sliding-window-size.
        minimum-number-of-calls: 20

        # Tỉ lệ lỗi (%) để mở mạch. Chọn theo mức quan trọng của downstream:
        # dịch vụ phụ 30% (hy sinh sớm) · thường 50% · sống còn 70% (cố tới cùng).
        failure-rate-threshold: 50

        # Lời gọi lâu hơn ngưỡng này bị ĐẾM LÀ LỖI dù trả về thành công.
        # Đặt bằng p99 bình thường của downstream × 2.
        slow-call-duration-threshold: 2s

        # Tỉ lệ lời gọi "chậm" để mở mạch.
        slow-call-rate-threshold: 50

        # Mạch giữ trạng thái OPEN bao lâu trước khi cho thử lại.
        wait-duration-in-open-state: 30s

        # Ở trạng thái HALF_OPEN, cho bao nhiêu lời gọi đi thăm dò
        # trước khi quyết định đóng mạch lại hay mở tiếp.
        permitted-number-of-calls-in-half-open-state: 5

        # Tự chuyển OPEN → HALF_OPEN khi hết thời gian, không cần chờ
        # có request tới mới chuyển. Cần một thread nền, nhưng phản ứng nhanh hơn.
        automatic-transition-from-open-to-half-open-enabled: true

        # record-exceptions: DANH SÁCH TRẮNG — chỉ những exception này
        # được tính vào tỉ lệ lỗi. Nếu khai báo, mọi exception khác bị bỏ qua.
        record-exceptions:
          - java.io.IOException
          - java.util.concurrent.TimeoutException

        # ignore-exceptions: DANH SÁCH ĐEN — những exception KHÔNG bao giờ
        # được tính là lỗi. Lỗi nghiệp vụ (nhập sai mã giảm giá, không tìm thấy)
        # là lỗi của NGƯỜI GỌI, không có nghĩa là service đang hỏng.
        # Đếm chúng sẽ mở mạch oan đúng lúc service vẫn khoẻ.
        ignore-exceptions:
          - com.shop.BusinessValidationException
```

### `sliding-window-type`: COUNT_BASED hay TIME_BASED?

| Kiểu | Cách đếm | Phù hợp với |
|---|---|---|
| `COUNT_BASED` | N lời gọi gần nhất | Traffic **đều đặn**, tần suất cao |
| `TIME_BASED` | Mọi lời gọi trong N giây gần nhất | Traffic **thưa thớt** hoặc thất thường |

Vì sao quan trọng? Với `COUNT_BASED` và traffic thưa, cửa sổ có thể chứa dữ liệu từ **nhiều giờ trước** — cầu dao ra quyết định dựa trên thông tin đã lỗi thời.

```text
   COUNT_BASED size=100, service chỉ nhận 5 request/giờ
   ⇒ Cửa sổ trải dài 20 giờ. Lỗi từ hôm qua vẫn được tính!
   ⇒ Với traffic thưa, LUÔN dùng TIME_BASED.
```

### `minimum-number-of-calls` — chống quyết định vội

Nếu chưa đủ số lời gọi này, cầu dao **không bao giờ mở** dù 100% lỗi.

Vì sao cần? Vì 2 lỗi trên 2 lời gọi = 100% tỉ lệ lỗi — nhưng đó có thể chỉ là trùng hợp. Cần đủ mẫu để kết luận có ý nghĩa thống kê.

Quy tắc: đặt khoảng **20-30% của `sliding-window-size`**, và tối thiểu 10.

### `failure-rate-threshold` — con số gây tranh cãi nhất

```text
   Quá cao (90%): service hỏng 80% mà cầu dao vẫn đóng → vô dụng
   Quá thấp (10%): một đợt lỗi nhỏ cũng mở mạch → tự gây sự cố
```

Cách chọn dựa trên số liệu:

```text
   1. Đo tỉ lệ lỗi BÌNH THƯỜNG của downstream (ví dụ 0,5%)
   2. Đặt ngưỡng cao hơn hẳn mức nền, nhưng thấp hơn mức "thật sự hỏng"
   3. Điểm khởi đầu hợp lý: 50%
```

Điều chỉnh theo mức quan trọng:

| Loại downstream | Ngưỡng lỗi | Thời gian mở | Lý do |
|---|---|---|---|
| Không quan trọng (gợi ý, đánh giá) | 30% | 60 giây | Mở sớm, đóng muộn — mất cũng không sao |
| Quan trọng (tìm kiếm, danh mục) | 50% | 30 giây | Cân bằng |
| Sống còn (thanh toán, đăng nhập) | 70% | 10 giây | Mở muộn, thử lại sớm — cố hết sức |

Logic: với dịch vụ **không quan trọng**, ta sẵn sàng "hy sinh" nó sớm để bảo vệ tài nguyên. Với dịch vụ **sống còn**, ta cố gắng đến cùng vì không có nó thì cũng chẳng làm gì được.

### `slow-call-duration-threshold` — tham số quan trọng nhất mà hay bị bỏ qua

```text
   Service CHẾT   : trả lỗi ngay → thread được giải phóng → ít hại
   Service CHẬM   : giam thread 2 giây mỗi request → CẠN THREAD POOL

   ⇒ Service chậm nguy hiểm hơn service chết!
```

Nếu chỉ đếm exception, cầu dao **không bao giờ mở** khi service trả về 200 OK sau 5 giây — đúng tình huống nguy hiểm nhất.

```yaml
slow-call-duration-threshold: 2s      # coi lời gọi > 2s là "lỗi chậm"
slow-call-rate-threshold: 50          # > 50% chậm → mở mạch
```

Cách chọn `slow-call-duration-threshold`: đặt bằng **p99 bình thường × 2**. Nếu downstream bình thường p99 = 300 ms, đặt 600 ms.

**Luôn cấu hình hai tham số này.** Đây là khác biệt giữa một cầu dao có tác dụng và một cầu dao trang trí.

### `wait-duration-in-open-state`

Quá ngắn → thử lại liên tục, không cho downstream thời gian hồi phục.
Quá dài → dịch vụ đã khoẻ mà vẫn bị chặn.

Điểm khởi đầu: **30 giây**. Điều chỉnh theo thời gian hồi phục thực tế của downstream (nếu nó thường tự khỏi sau 10 giây thì đặt 10-15 giây).

### `record-exceptions` và `ignore-exceptions`

Đây là chỗ rất nhiều người sai:

```yaml
ignore-exceptions:
  - com.shop.BusinessValidationException     # lỗi nghiệp vụ, KHÔNG phải lỗi hạ tầng
  - com.shop.NotFoundException
```

**Lỗi nghiệp vụ không được tính vào tỉ lệ lỗi của cầu dao.** Nếu người dùng nhập sai mã giảm giá 1.000 lần, đó không có nghĩa là service khuyến mãi đang hỏng — mở cầu dao ở đây là hoàn toàn sai.

Quy tắc: **cầu dao chỉ đếm lỗi hạ tầng** (timeout, kết nối, 5xx). Lỗi 4xx là lỗi của người gọi, không phải của service.

## Cầu dao ở tầng nào?

Đây là quyết định kiến trúc quan trọng:

```text
   MỖI DOWNSTREAM một cầu dao riêng — ĐÚNG
   ├─ paymentService  → cầu dao A
   ├─ inventoryService→ cầu dao B
   └─ emailService    → cầu dao C

   MỘT cầu dao cho tất cả — SAI
   → email hỏng làm chặn cả thanh toán
```

Chi tiết hơn nữa: nếu một downstream có nhiều endpoint với đặc tính rất khác nhau, tách cầu dao theo endpoint:

```text
   inventoryService
   ├─ GET /stock/{sku}       (nhanh, 10ms)  → cầu dao B1
   └─ POST /reserve          (chậm, 500ms)  → cầu dao B2
```

Nếu dùng chung, `/reserve` chậm sẽ kéo cầu dao mở và chặn luôn `/stock` vốn vẫn khoẻ.

## Fallback — hỏng một cách duyên dáng

Cầu dao mở thì trả về gì? Đây mới là phần quyết định trải nghiệm người dùng.

```java
@CircuitBreaker(name = "recommendService", fallbackMethod = "fallbackRecommend")
public List<Product> getRecommendations(Long userId) {
    return recommendClient.fetch(userId);
}

private List<Product> fallbackRecommend(Long userId, Throwable t) {
    // Bậc 1: cache cũ
    List<Product> stale = cache.getStale("recommend:" + userId);
    if (stale != null) return stale;

    // Bậc 2: danh sách bán chạy chung (tính sẵn, luôn có)
    return popularProductsHolder.get();

    // Bậc 3 ngầm định: nếu cả hai không có → danh sách rỗng,
    // giao diện tự ẩn khối "Gợi ý"
}
```

**Thang bậc suy giảm**: dữ liệu tươi → dữ liệu cũ → dữ liệu chung → không có gì.

Ba quy tắc cho fallback:

1. **Fallback không được gọi ra ngoài.** Nếu nó gọi service khác, bạn chỉ chuyển vấn đề — và service đó rất có thể cũng đang quá tải vì cùng nguyên nhân.
2. **Fallback phải rất nhanh.** Nó chạy khi hệ thống đang căng thẳng; một fallback chậm còn tệ hơn không có.
3. **Fallback phải được kiểm thử.** Code fallback chạy 0,1% thời gian nên thường chưa bao giờ được chạy thật. Rất nhiều sự cố là do fallback bị lỗi.

Với thao tác ghi, fallback thường là **chuyển sang bất đồng bộ**:

```java
private PaymentResult fallbackCharge(Order order, Throwable t) {
    outboxRepository.save(new PendingPayment(order));    // ghi vào outbox
    return PaymentResult.pending("Đơn hàng đang được xử lý");
}
```

Người dùng vẫn đặt được hàng; việc thanh toán được thực hiện sau khi payment-service khoẻ lại. Đây là trải nghiệm tốt hơn nhiều so với "Lỗi hệ thống".

## Khi cầu dao gây hại

Circuit breaker không phải luôn tốt. Ba tình huống nó làm mọi thứ tệ hơn:

### 1. Ngưỡng quá nhạy với dịch vụ sống còn

```text
   Service thanh toán lỗi 55% (vẫn phục vụ được 45% khách hàng)
   Cầu dao ngưỡng 50% → MỞ → phục vụ được 0% khách hàng

   ⇒ Cầu dao làm mất 45% doanh thu còn lại.
```

Với dịch vụ sống còn, ngưỡng nên cao (70-80%), hoặc cân nhắc dùng **adaptive concurrency limit** (case 4) thay vì cầu dao đóng-mở nhị phân.

### 2. Dao động (flapping)

```text
   Cầu dao mở → tải giảm → downstream khoẻ lại → cầu dao đóng
   → tải dồn vào → downstream chết → cầu dao mở → ...

   Chu kỳ lặp mỗi 30 giây. Người dùng thấy lúc được lúc không.
```

Cách xử lý:

- Tăng `permitted-number-of-calls-in-half-open-state` để thăm dò kỹ hơn.
- Áp dụng **backoff cho `waitDuration`**: lần mở thứ nhất 30 giây, thứ hai 60 giây, thứ ba 120 giây.
- Kết hợp với **rate limiter** ở trạng thái nửa mở để không dội tải.

### 3. Cầu dao trên chính database của mình

Cẩn thận khi đặt cầu dao trước database chính. Nếu nó mở, ứng dụng của bạn **không làm được gì cả** — và không có fallback nào có ý nghĩa. Trong trường hợp này, connection pool + timeout thường là công cụ phù hợp hơn.

## Giám sát

```promql
# Trạng thái cầu dao (1 = đang ở trạng thái đó)
resilience4j_circuitbreaker_state{name="paymentService", state="open"}

# Tỉ lệ lỗi hiện tại
resilience4j_circuitbreaker_failure_rate{name="paymentService"}

# Tỉ lệ lời gọi chậm
resilience4j_circuitbreaker_slow_call_rate{name="paymentService"}

# Số lời gọi bị từ chối vì cầu dao mở
rate(resilience4j_circuitbreaker_calls_total{kind="not_permitted"}[5m])
```

Cảnh báo cần có:

| Cảnh báo | Điều kiện | Ý nghĩa |
|---|---|---|
| Cầu dao mở | `state{state="open"} == 1` trong 1 phút | Downstream đang hỏng |
| Dao động | Số lần chuyển trạng thái > 5 trong 10 phút | Cấu hình cần chỉnh |
| Tỉ lệ lỗi gần ngưỡng | `failure_rate > threshold * 0.8` | Cảnh báo sớm |

Đưa trạng thái cầu dao vào health endpoint để dễ quan sát:

```yaml
management:
  health:
    circuitbreakers:
      enabled: true
resilience4j:
  circuitbreaker:
    configs:
      default:
        register-health-indicator: true
```

Lưu ý: nếu bạn dùng health endpoint này cho **readiness probe** của Kubernetes, cầu dao mở sẽ khiến pod bị loại khỏi load balancer — thường **không** phải điều bạn muốn (xem case 6).

## Thứ tự các annotation resilience

Resilience4j áp dụng theo thứ tự cố định (từ ngoài vào trong):

```text
   Retry
     └─ CircuitBreaker
          └─ RateLimiter
               └─ TimeLimiter
                    └─ Bulkhead
                         └─ (lời gọi thật)
```

Ý nghĩa của thứ tự này:

- **Retry ngoài cùng**: mỗi lần thử lại đi qua toàn bộ chuỗi.
- **CircuitBreaker đếm cả các lần retry** — đúng, vì mỗi lần retry đều là một lời gọi thật.
- **Bulkhead trong cùng**: giới hạn số lời gọi thật sự đang chạy.

```java
@Retry(name = "payment")
@CircuitBreaker(name = "payment", fallbackMethod = "fallback")
@TimeLimiter(name = "payment")
@Bulkhead(name = "payment", type = Bulkhead.Type.SEMAPHORE)
public CompletableFuture<PaymentResult> charge(Order order) { ... }
```

Muốn đổi thứ tự thì dùng thuộc tính `order` trong cấu hình từng aspect — nhưng hiếm khi cần.

## Kiểm thử cầu dao

Code cầu dao chạy rất hiếm, nên phải kiểm thử chủ động:

```java
@Test
void circuitBreakerShouldOpenAfterFailures() {
    CircuitBreaker cb = registry.circuitBreaker("paymentService");
    assertThat(cb.getState()).isEqualTo(State.CLOSED);

    // Gây 20 lỗi liên tiếp
    for (int i = 0; i < 20; i++) {
        try { paymentService.charge(order); } catch (Exception ignored) {}
    }

    assertThat(cb.getState()).isEqualTo(State.OPEN);

    // Lời gọi tiếp theo phải bị từ chối ngay, không chạm downstream
    long start = System.currentTimeMillis();
    PaymentResult r = paymentService.charge(order);        // vào fallback
    assertThat(System.currentTimeMillis() - start).isLessThan(50);
    assertThat(r.getStatus()).isEqualTo(PENDING);
}
```

Và quan trọng hơn: **chaos testing** trên môi trường staging — chủ động làm downstream chậm/chết và quan sát hệ thống có hành xử đúng không. Nếu chưa từng thử, bạn không thực sự biết cấu hình của mình có hoạt động hay không.

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Không cấu hình `slow-call-*` | Cầu dao không mở khi service chậm — tình huống nguy hiểm nhất |
| Đếm cả lỗi nghiệp vụ (4xx) | Mở mạch khi người dùng nhập sai |
| Một cầu dao cho mọi downstream | Email hỏng chặn cả thanh toán |
| `COUNT_BASED` với traffic thưa | Quyết định dựa trên dữ liệu cũ hàng giờ |
| Ngưỡng 50% cho dịch vụ sống còn | Mất nốt phần đang phục vụ được |
| Fallback gọi service khác | Lan truyền sự cố |
| Fallback chưa bao giờ được kiểm thử | Fallback lỗi đúng lúc cần nhất |
| Không giám sát trạng thái cầu dao | Không biết mạch đang mở |
| Dùng cầu dao thay cho timeout | Cầu dao **không thay thế** timeout, phải có cả hai |

## Tóm tắt case 3

- Cầu dao: **thất bại nhanh (0 ms)** thay vì chờ timeout, và **cho downstream thời gian hồi phục**.
- Ba trạng thái: **CLOSED → OPEN → HALF_OPEN**. `HALF_OPEN` thăm dò để không dội tải vào service vừa khoẻ.
- **`slow-call-duration-threshold` là tham số quan trọng nhất** — service chậm nguy hiểm hơn service chết.
- Chỉ đếm **lỗi hạ tầng**, bỏ qua lỗi nghiệp vụ (4xx).
- **Mỗi downstream một cầu dao riêng**; tách thêm theo endpoint nếu đặc tính khác nhau.
- Ngưỡng theo mức quan trọng: không quan trọng 30%, quan trọng 50%, **sống còn 70%**.
- Fallback phải **nhanh, không gọi ra ngoài, và được kiểm thử**.
- Thứ tự: **Retry → CircuitBreaker → RateLimiter → TimeLimiter → Bulkhead**.

**Bài kế tiếp** → [Case 4: Load shedding và backpressure — nghệ thuật từ chối đúng lúc](04-case-load-shedding.md)
