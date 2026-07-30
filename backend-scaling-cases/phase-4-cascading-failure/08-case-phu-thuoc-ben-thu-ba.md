# Case 8: Phụ thuộc bên thứ ba — khi bạn không kiểm soát được nguyên nhân

Bảy case trước đều có một điểm chung: bạn sửa được nguyên nhân. Thêm index, tăng pool, sửa code.

Case này khác. Nhà cung cấp cổng thanh toán bị sự cố. Dịch vụ gửi SMS quá tải. API bản đồ đổi giới hạn tần suất mà không báo trước. Bạn **không thể** sửa gì cả — chỉ có thể quyết định hệ thống của mình hành xử ra sao.

## Hiện tượng

```text
   09:00  Cổng thanh toán của đối tác bắt đầu trả lỗi 30%.
   09:05  Trang trạng thái của họ: "Investigating" — không có thời gian dự kiến.
   09:10  Nhóm hỗ trợ của họ trả lời: "Chúng tôi đang xử lý."
   09:15  Khách hàng của bạn không thanh toán được.
          Bộ phận kinh doanh hỏi: "Bao giờ thì xong?"
          Bạn không biết. Bạn không kiểm soát được gì.

   14:20  Đối tác khắc phục xong. 5 tiếng 20 phút.
```

Câu hỏi thực sự không phải "làm sao sửa" mà là: **trong 5 tiếng đó, hệ thống của bạn nên làm gì?**

## Nguyên tắc: coi mọi phụ thuộc ngoài là "sẽ hỏng"

Không phải "có thể hỏng" — mà là **"chắc chắn sẽ hỏng, chỉ là khi nào"**. Kể cả nhà cung cấp lớn:

```text
   SLA 99,9%  = 43 phút mất dịch vụ mỗi tháng
   SLA 99,95% = 21 phút mỗi tháng

   Bạn phụ thuộc 5 dịch vụ ngoài, mỗi cái 99,9%:
   Khả dụng tổng = 0,999^5 = 99,5%  →  3,6 giờ mất dịch vụ mỗi tháng
```

**Phụ thuộc càng nhiều, khả dụng càng thấp** — theo cấp số nhân. Đây là lý do việc thiết kế để **sống sót khi phụ thuộc chết** quan trọng hơn việc chọn nhà cung cấp có SLA cao.

## Phân loại phụ thuộc — bước đầu tiên và quan trọng nhất

Không phải phụ thuộc nào cũng như nhau. Phân loại quyết định chiến lược:

| Loại | Định nghĩa | Ví dụ | Chiến lược khi hỏng |
|---|---|---|---|
| **Sống còn (hard)** | Không có nó thì không làm được việc chính | Cổng thanh toán, database | Hàng đợi + xử lý sau, hoặc nhà cung cấp dự phòng |
| **Quan trọng (soft)** | Mất thì giảm chất lượng nhiều | Dịch vụ tìm kiếm, tính phí ship | Dữ liệu cũ, giá trị mặc định |
| **Phụ trợ (optional)** | Mất thì hầu như không ai nhận ra | Gợi ý, phân tích, đánh giá | Bỏ qua hoàn toàn |

Bài tập đáng làm ngay hôm nay: liệt kê **mọi** lời gọi ra ngoài trong hệ thống, phân loại từng cái, và với mỗi cái trả lời câu hỏi "nếu nó chết 5 tiếng thì sao?".

Kết quả thường gây ngạc nhiên: rất nhiều thứ được code như "sống còn" (chặn cả luồng nếu lỗi) trong khi thực ra chỉ là "phụ trợ".

## Chiến lược 1: Hàng đợi + xử lý sau (cho phụ thuộc sống còn)

Đây là chiến lược mạnh nhất. Thay vì gọi đồng bộ, ghi vào hàng đợi bền vững và xử lý khi đối tác khoẻ lại.

```java
@Transactional
public OrderResult placeOrder(OrderRequest req) {
    Order order = orderRepository.save(new Order(req, PENDING_PAYMENT));

    // Ghi vào outbox TRONG CÙNG transaction — đảm bảo không mất
    outboxRepository.save(new OutboxEvent(
        "payment.charge", order.getId(), toJson(req)));

    return OrderResult.accepted(order.getId(),
        "Đơn hàng đã ghi nhận. Chúng tôi sẽ xác nhận thanh toán trong ít phút.");
}

@Scheduled(fixedDelay = 5000)
public void processOutbox() {
    List<OutboxEvent> pending = outboxRepository.findPending(100);
    for (OutboxEvent e : pending) {
        try {
            paymentClient.charge(e.getPayload());
            outboxRepository.markDone(e.getId());
        } catch (Exception ex) {
            outboxRepository.scheduleRetry(e.getId(), backoffFor(e.getAttempts()));
        }
    }
}
```

**Mẫu outbox** này (ghi sự kiện vào cùng transaction với dữ liệu nghiệp vụ) đảm bảo không bao giờ mất yêu cầu, kể cả khi ứng dụng chết ngay sau khi commit.

```text
   Đối tác chết 5 tiếng:
   ├─ Người dùng VẪN đặt được hàng (nhận 202 Accepted)
   ├─ 50.000 yêu cầu thanh toán nằm trong outbox
   ├─ Đối tác khoẻ lại → xử lý dần trong 20 phút
   └─ Doanh thu: KHÔNG MẤT ĐỒNG NÀO
```

Đánh đổi phải thừa nhận rõ ràng:

- Trải nghiệm đổi từ "thanh toán thành công" sang "đang xử lý" — bộ phận kinh doanh phải đồng ý.
- Phải xử lý trường hợp thanh toán thất bại **sau khi** đã nhận đơn (huỷ đơn, hoàn kho, thông báo).
- Cần cơ chế thông báo kết quả (email, push, WebSocket).
- Phải có **idempotency key** để đối tác không trừ tiền hai lần khi retry.

Không phải nghiệp vụ nào cũng chấp nhận được. Nhưng với thương mại điện tử, đây gần như luôn là lựa chọn đúng — vì "đơn hàng đang xử lý" tốt hơn vô hạn lần so với "lỗi hệ thống, vui lòng thử lại".

Với việc cần tốc độ và độ bền cao hơn, dùng Kafka thay cho bảng outbox, hoặc kết hợp cả hai qua CDC (Debezium đọc binlog và đẩy vào Kafka).

## Chiến lược 2: Nhà cung cấp dự phòng

```java
@Component
public class PaymentRouter {
    private final List<PaymentProvider> providers;      // theo thứ tự ưu tiên

    public PaymentResult charge(ChargeRequest req) {
        List<Exception> errors = new ArrayList<>();

        for (PaymentProvider p : providers) {
            if (!p.getCircuitBreaker().tryAcquirePermission()) {
                continue;                                // đang mở mạch, bỏ qua
            }
            try {
                return p.charge(req);
            } catch (Exception e) {
                errors.add(e);
                log.warn("Nhà cung cấp {} lỗi, thử cái tiếp theo", p.getName(), e);
            }
        }
        throw new AllProvidersFailedException(errors);
    }
}
```

Đánh đổi rất thật, đừng đánh giá thấp:

| Chi phí | Chi tiết |
|---|---|
| Tích hợp | Mỗi nhà cung cấp một API khác nhau — công sức nhân đôi |
| Đối soát | Giao dịch nằm ở hai nơi, đối soát phức tạp hơn nhiều |
| Kiểm thử | Đường dẫn dự phòng ít khi chạy → dễ có lỗi ngủ quên |
| Hợp đồng | Thường phải cam kết doanh số tối thiểu với mỗi bên |

Vì vậy: **chỉ làm dự phòng cho phụ thuộc thật sự sống còn** và khi thiệt hại do mất dịch vụ đủ lớn để bù chi phí.

Mẹo giữ đường dẫn dự phòng luôn hoạt động: **định kỳ đẩy một phần nhỏ traffic thật (1-5%) sang nhà cung cấp phụ**. Nếu nó hỏng, bạn biết ngay chứ không phải phát hiện lúc khẩn cấp.

## Chiến lược 3: Dữ liệu cũ và giá trị mặc định

Cho phụ thuộc "quan trọng" nhưng không sống còn:

```java
@CircuitBreaker(name = "shippingRate", fallbackMethod = "fallbackRate")
public ShippingRate getRate(Address from, Address to, double weight) {
    return shippingClient.calculate(from, to, weight);
}

private ShippingRate fallbackRate(Address from, Address to, double weight, Throwable t) {
    // Bậc 1: kết quả cũ cho cùng tuyến đường
    ShippingRate cached = rateCache.getStale(routeKey(from, to, weight));
    if (cached != null) return cached.markAsEstimate();

    // Bậc 2: bảng giá tĩnh tính sẵn theo vùng
    ShippingRate table = staticRateTable.lookup(from.getRegion(), to.getRegion(), weight);
    if (table != null) return table.markAsEstimate();

    // Bậc 3: giá cố định an toàn (hơi cao để không lỗ)
    return ShippingRate.flat(new BigDecimal("35000")).markAsEstimate();
}
```

`markAsEstimate()` là chi tiết quan trọng: giao diện hiển thị "Phí vận chuyển (tạm tính)" thay vì con số chắc chắn. Người dùng được thông báo trung thực, và bạn tránh được tranh chấp sau này.

Nguyên tắc chọn giá trị mặc định: **chọn hướng an toàn cho bạn về mặt tài chính, nhưng vẫn công bằng với khách**. Với phí ship, ước cao hơn một chút rồi hoàn lại; với giảm giá, ước thấp hơn.

## Chiến lược 4: Kill switch cho từng tính năng

```java
@Component
public class FeatureFlags {
    // Đọc từ config server — đổi được trong 30 giây, không cần deploy
    @Value("${features.recommendations.enabled:true}")
    private volatile boolean recommendations;

    @Value("${features.reviews.enabled:true}")
    private volatile boolean reviews;

    @Value("${features.liveTracking.enabled:true}")
    private volatile boolean liveTracking;
}
```

```java
public ProductPage getPage(Long id) {
    return ProductPage.builder()
        .product(productService.get(id))
        .reviews(flags.isReviews() ? reviewService.get(id) : List.of())
        .recommendations(flags.isRecommendations() ? recommendService.get(id) : List.of())
        .build();
}
```

Vì sao cần cả kill switch khi đã có circuit breaker? Vì có những tình huống cầu dao không xử lý được:

| Tình huống | Cầu dao có tự xử lý? |
|---|---|
| Đối tác trả lỗi | **Có** |
| Đối tác chậm | **Có** (nếu cấu hình `slow-call`) |
| Đối tác trả **dữ liệu sai** (200 OK nhưng nội dung hỏng) | **Không** |
| Đối tác báo trước sẽ bảo trì | Không — bạn muốn tắt **trước** khi hỏng |
| Đối tác tăng giá đột ngột theo request | Không |
| Bạn cần giảm tải khẩn cấp | Không |

Trường hợp "trả dữ liệu sai" đáng chú ý: một lần đối tác trả về giá bằng 0 cho mọi sản phẩm. Cầu dao thấy 200 OK nên không mở. Chỉ có kill switch thủ công mới cứu được.

## Chiến lược 5: Đặt ranh giới ở đúng chỗ

Sai lầm kiến trúc phổ biến: rải lời gọi tới đối tác khắp nơi trong codebase.

```java
// SAI — gọi trực tiếp SDK của đối tác từ service nghiệp vụ
@Service
public class OrderService {
    public void place(OrderRequest req) {
        StripeCharge charge = Stripe.charges().create(...);   // dính chặt
    }
}
```

```java
// ĐÚNG — một cổng (gateway) duy nhất, có giao diện của riêng bạn
public interface PaymentGateway {
    PaymentResult charge(ChargeCommand cmd);
    RefundResult refund(RefundCommand cmd);
}

@Component
class StripePaymentGateway implements PaymentGateway {
    @CircuitBreaker(name = "stripe", fallbackMethod = "fallback")
    @Bulkhead(name = "stripe")
    @TimeLimiter(name = "stripe")
    public PaymentResult charge(ChargeCommand cmd) {
        // Chuyển đổi mô hình của bạn ↔ mô hình của Stripe ở ĐÂY
    }
}
```

Lợi ích của việc có một điểm vào duy nhất:

- Mọi cơ chế bảo vệ (timeout, cầu dao, bulkhead, retry) đặt ở một chỗ.
- Đổi nhà cung cấp = viết một lớp mới, không đụng code nghiệp vụ.
- Kiểm thử dễ: mock một interface thay vì mock SDK.
- Mô hình dữ liệu của đối tác không rò rỉ vào miền nghiệp vụ của bạn.

Đây là mẫu **Anti-Corruption Layer** trong Domain-Driven Design — và nó có giá trị thực tế rất lớn, không chỉ là lý thuyết kiến trúc.

## Giám sát bên thứ ba

Bạn không giám sát được hệ thống của họ, nhưng giám sát được **trải nghiệm của bạn với họ**:

```java
@Around("@annotation(ExternalCall)")
public Object measure(ProceedingJoinPoint pjp) throws Throwable {
    String provider = extractProvider(pjp);
    Timer.Sample sample = Timer.start(registry);
    String outcome = "success";
    try {
        return pjp.proceed();
    } catch (Exception e) {
        outcome = classify(e);          // timeout / 4xx / 5xx / connection
        throw e;
    } finally {
        sample.stop(registry.timer("external.call",
            "provider", provider, "outcome", outcome));
    }
}
```

Ba chỉ số cần theo dõi cho mỗi đối tác:

| Chỉ số | Ngưỡng cảnh báo | Vì sao |
|---|---|---|
| Tỉ lệ lỗi | > 1% trong 5 phút | Phát hiện sớm hơn trang trạng thái của họ |
| p99 latency | > 2× mức nền | Chậm nguy hiểm hơn lỗi |
| Tỉ lệ so với hạn ngạch | > 80% | Tránh bị chặn vì vượt giới hạn |

**Bạn thường phát hiện sự cố của đối tác trước khi họ cập nhật trang trạng thái.** Đó là lý do việc đo lường phía mình quan trọng hơn việc theo dõi trang trạng thái của họ.

Ngoài ra nên có **synthetic check**: định kỳ (mỗi phút) gọi một API rẻ tiền của đối tác từ ngoài luồng nghiệp vụ, để biết tình trạng ngay cả khi không có traffic thật.

## Vấn đề hạn ngạch — cái bẫy ít ai chuẩn bị

Đối tác thường giới hạn số request. Vượt là bị chặn — và bị chặn thường tệ hơn bị chậm.

```java
@Component
public class QuotaAwareClient {
    private final RateLimiter limiter = RateLimiter.create(80.0);    // hạn ngạch 100/s,
                                                                      // ta tự giới hạn 80

    public Result call(Request req) {
        if (!limiter.tryAcquire(100, TimeUnit.MILLISECONDS)) {
            return fallback(req);                     // tự giới hạn TRƯỚC khi bị chặn
        }
        return client.call(req);
    }
}
```

Nguyên tắc: **tự giới hạn ở 70-80% hạn ngạch**. Để dành phần còn lại cho các đợt tăng đột biến và cho các hệ thống khác trong công ty cũng đang dùng chung hạn ngạch đó.

Và luôn đọc header hạn ngạch nếu đối tác cung cấp:

```java
String remaining = response.getHeaders().getFirst("X-RateLimit-Remaining");
if (remaining != null && Integer.parseInt(remaining) < 100) {
    log.warn("Hạn ngạch sắp hết: còn {}", remaining);
    quotaGauge.set(Integer.parseInt(remaining));
}
```

## Trường hợp thực tế: đối tác SMS chết 8 tiếng

Bối cảnh: ứng dụng dùng SMS để gửi mã OTP đăng nhập. Nhà cung cấp SMS chết hoàn toàn 8 tiếng.

**Trước khi có chuẩn bị**:

```text
   Không gửi được OTP → không ai đăng nhập được → mất 100% người dùng mới
   và mọi người dùng đã đăng xuất. Thiệt hại 8 tiếng.
```

**Sau khi thiết kế lại**:

```java
public void sendOtp(String phone, String code) {
    // Kênh 1: nhà cung cấp SMS chính
    if (smsGateway.trySend(phone, code)) return;

    // Kênh 2: nhà cung cấp SMS dự phòng
    if (backupSmsGateway.trySend(phone, code)) return;

    // Kênh 3: thông báo đẩy (nếu người dùng đã cài app)
    if (pushService.trySend(phone, code)) return;

    // Kênh 4: cuộc gọi tự động đọc mã
    if (voiceCallService.trySend(phone, code)) return;

    // Kênh 5: email (nếu có)
    if (emailService.trySend(phone, code)) return;

    throw new OtpDeliveryFailedException();
}
```

Và quan trọng không kém — giảm nhu cầu gửi OTP:

| Biện pháp | Giảm số OTP cần gửi |
|---|---|
| Kéo dài thời hạn phiên đăng nhập từ 7 lên 30 ngày | −60% |
| Nhớ thiết bị tin cậy | −25% |
| Cho phép đăng nhập bằng sinh trắc học trên thiết bị đã xác thực | −10% |

```text
   Kết quả trong lần sự cố tiếp theo (nhà cung cấp chính chết 3 tiếng):
   ├─ 78% OTP đi qua nhà cung cấp dự phòng
   ├─ 19% qua thông báo đẩy
   ├─  3% qua cuộc gọi thoại
   └─ Tác động tới người dùng: gần như bằng không
```

Bài học lớn nhất: **giảm sự phụ thuộc còn giá trị hơn xử lý sự phụ thuộc**. Ba biện pháp giảm nhu cầu OTP ở trên rẻ hơn và hiệu quả hơn nhiều so với việc tích hợp thêm nhà cung cấp.

Câu hỏi nên hỏi trước tiên với mọi phụ thuộc: **"Có cách nào để không cần nó không?"**

## Checklist cho mỗi phụ thuộc ngoài

```text
□ Đã phân loại: sống còn / quan trọng / phụ trợ?
□ Có timeout (connect + read + tổng)?
□ Có circuit breaker (kể cả slow-call)?
□ Có bulkhead giới hạn số lời gọi đồng thời?
□ Có fallback, và fallback ĐÃ ĐƯỢC KIỂM THỬ?
□ Có kill switch đổi nóng được?
□ Có idempotency key cho thao tác ghi?
□ Có giám sát tỉ lệ lỗi + latency + hạn ngạch?
□ Có tự giới hạn ở 70-80% hạn ngạch?
□ Có nằm sau một interface của riêng mình (anti-corruption layer)?
□ Đã trả lời được: "nếu nó chết 8 tiếng thì sao?"
□ Đã diễn tập kịch bản đó chưa?
```

Mục cuối cùng là mục hay bị bỏ qua nhất và có giá trị nhất. Một buổi diễn tập nửa ngày phát hiện được nhiều lỗ hổng hơn nhiều tuần đọc lại code.

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Tin vào SLA của đối tác | 99,9% vẫn là 43 phút chết mỗi tháng |
| Gọi SDK đối tác trực tiếp từ code nghiệp vụ | Không thể đổi, không thể bảo vệ, không thể test |
| Coi mọi phụ thuộc là "sống còn" | Một tính năng phụ làm chết cả hệ thống |
| Fallback chưa bao giờ chạy thật | Fallback lỗi đúng lúc cần |
| Không có kill switch | Đối tác trả dữ liệu sai mà không tắt được |
| Dùng hết 100% hạn ngạch | Bị chặn, tệ hơn bị chậm |
| Chỉ theo dõi trang trạng thái của đối tác | Biết chậm hơn chính người dùng của mình |
| Không có idempotency key | Retry gây trừ tiền hai lần |
| Không hỏi "có cách nào không cần nó?" | Bỏ lỡ giải pháp rẻ nhất |

## Tóm tắt case 8

- Coi mọi phụ thuộc ngoài là **chắc chắn sẽ hỏng**. 5 phụ thuộc × 99,9% = 3,6 giờ chết mỗi tháng.
- Bước đầu tiên: **phân loại** sống còn / quan trọng / phụ trợ. Đa số thứ tưởng sống còn thực ra không phải.
- Phụ thuộc sống còn: **hàng đợi + xử lý sau** (mẫu outbox) — người dùng vẫn hoàn thành được việc.
- Nhà cung cấp dự phòng đắt và phức tạp — chỉ làm khi thật sự đáng, và **đẩy 1-5% traffic thật** để nó luôn hoạt động.
- Phụ thuộc quan trọng: **dữ liệu cũ → bảng tĩnh → giá trị mặc định an toàn**, có đánh dấu "tạm tính".
- **Kill switch đổi nóng** xử lý được những gì circuit breaker không xử lý được (dữ liệu sai, bảo trì báo trước).
- Đặt mọi phụ thuộc sau **một interface của riêng mình** (anti-corruption layer).
- Tự giới hạn ở **70-80% hạn ngạch**, và giám sát phía mình chứ đừng chờ trang trạng thái của họ.
- Câu hỏi giá trị nhất: **"Có cách nào để không cần phụ thuộc này không?"**

**Bài kế tiếp** → [Phase 5 - Case 1: Scale dọc hay scale ngang — và vì sao monolith khó scale](../phase-5-scaling-kien-truc/01-case-scale-doc-ngang.md)
