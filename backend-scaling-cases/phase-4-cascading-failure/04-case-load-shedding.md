# Case 4: Load shedding và backpressure — nghệ thuật từ chối đúng lúc

Có một sự thật mà kỹ sư mới thường khó chấp nhận:

> **Khi quá tải, từ chối 30% request là hành động tốt nhất bạn có thể làm.**

Không phải vì bạn lười, mà vì toán học. Bài này chứng minh điều đó và trình bày cách từ chối cho đúng.

## Vì sao "cố phục vụ hết" là sai

```text
   Công suất: 1.000 RPS.  Tải đến: 1.500 RPS.

   PHƯƠNG ÁN A — cố phục vụ tất cả:
   ├─ Hàng đợi phình 500 request mỗi giây
   ├─ Sau 20 giây: 10.000 request đang chờ
   ├─ Thời gian chờ trung bình: 10 giây
   ├─ Client timeout ở 3 giây → 100% request FAIL
   └─ Kết quả: phục vụ thành công 0 RPS

   PHƯƠNG ÁN B — từ chối 500 RPS ngay lập tức:
   ├─ 1.000 RPS được phục vụ đàng hoàng, latency 200 ms
   ├─ 500 RPS nhận 503 ngay (0 ms), client biết đường xử lý
   └─ Kết quả: phục vụ thành công 1.000 RPS

   ⇒ Từ chối bớt cho kết quả TỐT HƠN VÔ HẠN LẦN.
```

Đây không phải lý thuyết suông — nó là hệ quả trực tiếp của lý thuyết hàng đợi (phase-1 bài 5). Khi tải vượt công suất, hàng đợi phình vô hạn và **mọi người đều thất bại**, kể cả những người lẽ ra được phục vụ.

**Load shedding (xả tải)** = chủ động từ chối một phần request để phần còn lại được phục vụ tử tế.

## Bốn tầng phòng thủ

```text
   ┌─────────────────────────────────────────────────────────┐
   │ Tầng 1: RATE LIMIT (theo client)                        │
   │ "Mỗi user tối đa 100 req/phút"                          │
   │ → Chống lạm dụng, chia công bằng                        │
   ├─────────────────────────────────────────────────────────┤
   │ Tầng 2: CONCURRENCY LIMIT (theo hệ thống)               │
   │ "Tối đa 200 request đang xử lý đồng thời"               │
   │ → Bảo vệ khỏi quá tải tổng thể                          │
   ├─────────────────────────────────────────────────────────┤
   │ Tầng 3: LOAD SHEDDING THEO ƯU TIÊN                      │
   │ "Quá tải thì bỏ request ít quan trọng trước"            │
   │ → Giữ chức năng sống còn                                │
   ├─────────────────────────────────────────────────────────┤
   │ Tầng 4: DEADLINE / TIMEOUT                              │
   │ "Bỏ request mà client đã không còn chờ"                 │
   │ → Không lãng phí công sức                               │
   └─────────────────────────────────────────────────────────┘
```

## Tầng 1: Rate limiting

Bốn thuật toán, khác nhau ở cách xử lý đỉnh:

### Token bucket (xô token) — phổ biến nhất

```text
   Xô chứa tối đa 100 token, được nạp thêm 10 token/giây.
   Mỗi request lấy 1 token. Hết token → từ chối.

   ⇒ Cho phép BURST tới 100 request, nhưng tốc độ trung bình là 10/giây.
```

```java
private final RateLimiter limiter = RateLimiter.create(10.0);   // Guava

if (!limiter.tryAcquire()) {
    throw new TooManyRequestsException();
}
```

Ưu điểm: cho phép burst, phù hợp với hành vi người dùng thật (bấm liên tục vài cái rồi nghỉ).

### Leaky bucket (xô rò)

```text
   Request vào xô, chảy ra với tốc độ CỐ ĐỊNH 10/giây.
   ⇒ Đầu ra hoàn toàn phẳng, KHÔNG cho burst.
```

Dùng khi downstream cực nhạy cảm với đỉnh tải (ví dụ API bên thứ ba tính phí theo tốc độ).

### Fixed window (cửa sổ cố định)

```text
   "100 request mỗi phút", reset lúc đầu mỗi phút.

   VẤN ĐỀ — hiệu ứng biên:
   12:00:59 → 100 request  ✓
   12:01:00 → 100 request  ✓
   ⇒ 200 request trong 1 giây! Gấp đôi giới hạn dự kiến.
```

Đơn giản nhất nhưng có lỗ hổng ở biên. Chỉ dùng khi độ chính xác không quan trọng.

### Sliding window (cửa sổ trượt) — chính xác nhất

```java
// Redis Lua: cửa sổ trượt bằng sorted set
String lua = """
    local now = tonumber(ARGV[1])
    local window = tonumber(ARGV[2])
    local limit = tonumber(ARGV[3])
    redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, now - window)
    local count = redis.call('ZCARD', KEYS[1])
    if count < limit then
        redis.call('ZADD', KEYS[1], now, now .. ':' .. math.random())
        redis.call('EXPIRE', KEYS[1], math.ceil(window / 1000))
        return 1
    end
    return 0
    """;
```

Chính xác nhưng tốn bộ nhớ hơn (lưu timestamp của từng request). Biến thể **sliding window counter** kết hợp hai cửa sổ cố định để xấp xỉ — đủ tốt cho hầu hết trường hợp và rẻ hơn nhiều.

### So sánh

| Thuật toán | Cho burst | Chính xác | Bộ nhớ | Dùng khi |
|---|---|---|---|---|
| Token bucket | **Có** | Tốt | Rất thấp | Mặc định cho API công khai |
| Leaky bucket | Không | Tốt | Thấp | Bảo vệ downstream nhạy cảm |
| Fixed window | Có (gấp đôi ở biên) | Kém | Rất thấp | Không khuyến nghị |
| Sliding window log | Không | **Cao nhất** | Cao | Khi cần chính xác tuyệt đối |
| Sliding window counter | Ít | Tốt | Thấp | Cân bằng tốt nhất |

### Rate limit phân tán

Với nhiều instance, giới hạn phải dùng chung. Redis là lựa chọn phổ biến:

```yaml
spring:
  cloud:
    gateway:
      routes:
        - id: order-service
          uri: lb://order-service
          filters:
            - name: RequestRateLimiter
              args:
                redis-rate-limiter.replenishRate: 100    # token/giây
                redis-rate-limiter.burstCapacity: 200    # dung tích xô
                key-resolver: "#{@userKeyResolver}"
```

Đánh đổi: mỗi lần kiểm tra là một round-trip tới Redis (~1 ms). Với API tần suất cực cao, cân nhắc **rate limit cục bộ với hạn ngạch được chia** (mỗi instance giữ 1/N hạn ngạch, định kỳ đồng bộ lại) — kém chính xác hơn nhưng không tốn round-trip.

## Tầng 2: Concurrency limit

Rate limit đếm **request/giây**. Concurrency limit đếm **request đang chạy**. Cái thứ hai bảo vệ tốt hơn vì nó tự thích ứng với latency.

```text
   Rate limit 100 RPS:
   ├─ Bình thường (latency 100ms) → 10 request đồng thời  ✓
   └─ Khi chậm (latency 3s)       → 300 request đồng thời ✗ CẠN THREAD

   Concurrency limit 50:
   ├─ Bình thường → phục vụ 500 RPS
   └─ Khi chậm    → phục vụ 17 RPS, nhưng KHÔNG BAO GIỜ quá 50 đồng thời ✓
```

Concurrency limit **tự động giảm thông lượng khi hệ thống chậm lại** — chính xác là hành vi ta muốn.

```java
@Component
public class ConcurrencyLimiter {
    private final Semaphore semaphore = new Semaphore(200);

    public <T> T execute(Supplier<T> task) {
        if (!semaphore.tryAcquire()) {
            throw new ServiceOverloadedException();
        }
        try {
            return task.get();
        } finally {
            semaphore.release();
        }
    }
}
```

### Adaptive concurrency limit — tự động tìm giới hạn

Đặt con số cứng (200) có vấn đề: nó đúng hôm nay, sai sau khi bạn tối ưu code hoặc nâng cấp máy. Giải pháp là để hệ thống **tự tìm**.

Ý tưởng lấy từ điều khiển tắc nghẽn của TCP: theo dõi latency, nếu latency tăng thì giảm giới hạn, nếu ổn định thì tăng dần.

```text
   Thuật toán (kiểu TCP Vegas / Gradient):

   RTT_min = latency thấp nhất từng thấy (khi hệ thống rảnh)
   RTT_now = latency hiện tại

   gradient = RTT_min / RTT_now

   gradient ≈ 1 (không tắc)  → tăng giới hạn
   gradient < 1 (đang tắc)   → giảm giới hạn theo tỉ lệ

   newLimit = currentLimit × gradient + queueSize
```

Netflix đã mã nguồn mở thư viện `concurrency-limits` cài đặt ý tưởng này:

```java
Limiter<HttpServletRequest> limiter = ServletLimiterBuilder.newBuilder()
    .limit(VegasLimit.newDefault())
    .partitionByHeader("X-Priority")
    .build();
```

Ưu điểm lớn: **không cần chỉnh tham số thủ công**, và tự thích ứng khi downstream chậm đi. Đây là hướng đi hiện đại cho các hệ thống quy mô lớn.

## Tầng 3: Load shedding theo ưu tiên

Khi phải từ chối, **từ chối cái gì** là quyết định quan trọng nhất.

```java
public enum Priority {
    CRITICAL(1),    // thanh toán, đăng nhập
    HIGH(2),        // đặt hàng, giỏ hàng
    NORMAL(3),      // duyệt sản phẩm, tìm kiếm
    LOW(4);         // gợi ý, phân tích, báo cáo
}

@Component
public class PriorityShedder {
    private volatile int shedBelow = 5;      // 5 = không bỏ gì

    public boolean shouldServe(Priority p) {
        return p.getLevel() < shedBelow;
    }

    @Scheduled(fixedDelay = 1000)
    public void adjust() {
        double util = threadPoolUtilization();
        if      (util > 0.95) shedBelow = 2;   // chỉ phục vụ CRITICAL
        else if (util > 0.85) shedBelow = 3;   // bỏ NORMAL và LOW
        else if (util > 0.75) shedBelow = 4;   // bỏ LOW
        else                  shedBelow = 5;   // phục vụ tất cả
    }
}
```

Cách gán ưu tiên trong thực tế:

| Tiêu chí | Ví dụ |
|---|---|
| Theo endpoint | `/payment` = CRITICAL, `/recommendations` = LOW |
| Theo loại người dùng | Khách trả phí > khách miễn phí |
| Theo nguồn | Giao diện người dùng > job nền > bot thu thập dữ liệu |
| Theo việc đã làm | Request retry lần 3 ưu tiên thấp hơn request mới |

Tiêu chí cuối cùng khá tinh tế: nếu một request đã retry nhiều lần, khả năng cao là nó sẽ lại thất bại — ưu tiên request mới cho công bằng hơn.

## Tầng 4: Deadline — bỏ việc đã hết giá trị

```java
@Component
public class DeadlineFilter implements Filter {
    @Override
    public void doFilter(ServletRequest req, ServletResponse res, FilterChain chain) {
        long queuedAt = getQueuedTime((HttpServletRequest) req);
        long waited = System.currentTimeMillis() - queuedAt;

        if (waited > 2000) {
            ((HttpServletResponse) res).setStatus(503);
            res.getWriter().write("Request đã hết hạn trong hàng đợi");
            return;                     // KHÔNG xử lý — client đã bỏ đi rồi
        }
        chain.doFilter(req, res);
    }
}
```

Đơn giản đến bất ngờ nhưng cực kỳ hiệu quả: nó **dọn sạch hàng đợi rác** với chi phí gần bằng 0, và là chìa khoá để thoát khỏi metastable failure (case 7).

Để biết `queuedAt`, có thể dùng header do load balancer thêm vào (`X-Request-Start` của Nginx/HAProxy) hoặc thời điểm nhận kết nối.

### CoDel — thuật toán thông minh hơn

**CoDel (Controlled Delay)** đến từ lĩnh vực mạng máy tính, giải quyết vấn đề "bufferbloat". Ý tưởng: thay vì giới hạn **kích thước** hàng đợi, giới hạn **thời gian nằm trong hàng đợi**.

```text
   Nếu thời gian chờ tối thiểu trong 100 ms qua vẫn > 5 ms
   ⇒ Hàng đợi đang "đọng" (standing queue), không phải burst tạm thời
   ⇒ Bắt đầu bỏ bớt request

   Ưu điểm: phân biệt được BURST NGẮN (chấp nhận được, không bỏ)
            với QUÁ TẢI KÉO DÀI (phải bỏ)
```

Facebook có biến thể gọi là **adaptive LIFO + CoDel**: khi hàng đợi bình thường thì phục vụ FIFO, khi hàng đợi đọng thì chuyển sang **LIFO** (phục vụ request mới nhất trước).

Nghe phản trực giác nhưng có lý: khi đang tắc, các request cũ trong hàng đợi gần như chắc chắn đã timeout ở phía client. Phục vụ chúng là lãng phí. Phục vụ request mới nhất — vốn vẫn đang được chờ — cho tỉ lệ thành công cao hơn hẳn.

## Trả lời client cho đúng

Từ chối cũng phải từ chối cho tử tế:

```java
return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)     // 503
    .header("Retry-After", "5")                                   // quay lại sau 5 giây
    .header("X-Shed-Reason", "system-overloaded")
    .body(Map.of(
        "error", "Hệ thống đang quá tải",
        "message", "Vui lòng thử lại sau ít giây",
        "retryAfter", 5
    ));
```

Phân biệt hai mã trạng thái — nhiều người dùng lẫn lộn:

| Mã | Nghĩa | Dùng khi |
|---|---|---|
| **429** Too Many Requests | **Bạn** gửi quá nhiều | Rate limit theo client |
| **503** Service Unavailable | **Hệ thống** đang quá tải | Load shedding tổng thể |

Khác biệt quan trọng ở phía client: `429` nghĩa là "hãy chậm lại", `503` nghĩa là "hãy thử lại sau, không phải lỗi của bạn". Client thông minh sẽ xử lý hai trường hợp khác nhau.

**Luôn gửi `Retry-After`.** Nó giúp client backoff đúng thay vì đoán mò — và giảm retry storm (case 1).

## Brownout — suy giảm dần thay vì tắt hẳn

Thay vì từ chối hoàn toàn, giảm **chất lượng** dịch vụ để phục vụ được nhiều người hơn:

```java
public ProductPage getPage(Long id, LoadLevel load) {
    Product p = productService.get(id);

    return ProductPage.builder()
        .product(p)
        .reviews(load.below(HIGH) ? reviewService.get(id) : List.of())
        .recommendations(load.below(MEDIUM) ? recommendService.get(id) : List.of())
        .relatedProducts(load.below(MEDIUM) ? relatedService.get(id) : List.of())
        .personalizedBanner(load.below(LOW) ? bannerService.get(id) : defaultBanner())
        .build();
}
```

```text
   Tải bình thường : trang đầy đủ, 8 lời gọi downstream
   Tải cao         : bỏ gợi ý và sản phẩm liên quan, 3 lời gọi
   Tải rất cao     : chỉ thông tin sản phẩm, 1 lời gọi

   ⇒ Người dùng vẫn mua được hàng. Chỉ mất phần trang trí.
```

Đây gọi là **brownout** (giảm điện áp) — mượn từ ngành điện, nơi người ta giảm điện áp thay vì cắt điện hoàn toàn.

Cách triển khai thực dụng: dùng **feature flag** có thể đổi nóng, kết hợp với chỉ số tải. Đội vận hành cũng bật/tắt thủ công được trong sự cố.

## Đặt load shedding ở đâu?

```text
   [CDN / WAF]        ← chặn bot, tấn công. Rẻ nhất, xa nhất.
        ↓
   [API Gateway]      ← rate limit theo user/API key
        ↓
   [Service]          ← concurrency limit, priority shedding
        ↓
   [Database]         ← statement_timeout, lock_timeout (phase-3)
```

**Nguyên tắc: chặn càng sớm càng rẻ.** Một request bị chặn ở CDN tốn 0,01 ms; cũng request đó đi tới database rồi mới bị từ chối tốn 50 ms và một connection.

Nhưng cũng cần lớp phòng thủ ở tầng trong: tầng ngoài không biết tình trạng thật của tầng trong, và có thể có traffic nội bộ không đi qua gateway.

## Trường hợp thực tế: đêm giao thừa

Bối cảnh: ứng dụng nhắn tin, đêm giao thừa tải gấp 40 lần bình thường.

**Năm ngoái (không có load shedding)**:

```text
   23:55  Tải bắt đầu tăng
   23:59  Tải đạt đỉnh 40×
   00:00  Toàn bộ hệ thống sập
   00:47  Hồi phục sau khi tự tay chặn traffic ở LB
   ⇒ Người dùng không gửi được lời chúc năm mới. Sự cố lớn nhất năm.
```

**Năm nay (có đủ 4 tầng)**:

```text
   23:55  Concurrency limit tự động thắt chặt
   23:58  Bắt đầu bỏ request ưu tiên LOW (cập nhật trạng thái online, "đang gõ...")
   23:59  Bật brownout: tắt xem trước link, tắt ảnh động
   00:00  Tải đỉnh 40×
          ├─ 65% request được phục vụ đầy đủ
          ├─ 25% được phục vụ ở chế độ suy giảm
          └─ 10% nhận 503 kèm Retry-After
   00:03  Tải giảm, mọi thứ tự động trở lại bình thường
   ⇒ KHÔNG CÓ SỰ CỐ. Tin nhắn chúc mừng vẫn gửi được.
```

Điểm mấu chốt: **90% người dùng vẫn gửi được tin nhắn**, so với 0% năm ngoái. Việc từ chối 10% là cái giá rất rẻ.

Bài học rút ra từ sự cố này:

| Việc | Vì sao quan trọng |
|---|---|
| Xác định trước ưu tiên của từng endpoint | Lúc sự cố không kịp nghĩ |
| Bảng điều khiển bật/tắt tính năng | Đội vận hành can thiệp được trong 30 giây |
| Diễn tập tải trước sự kiện | Biết trước ngưỡng thật |
| Tự động hoá | Sự cố diễn ra trong vài giây, con người không kịp |

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Chỉ có rate limit, không có concurrency limit | Không bảo vệ được khi downstream chậm |
| Load shedding không phân biệt ưu tiên | Bỏ nhầm request thanh toán, giữ request gợi ý |
| Trả 500 thay vì 503 | Client không biết đây là quá tải tạm thời |
| Không gửi `Retry-After` | Client retry ngay → retry storm |
| Ngưỡng cứng không tự điều chỉnh | Sai sau mỗi lần thay đổi hệ thống |
| Load shedding tốn kém (kiểm tra ở tầng sâu) | Chính việc từ chối cũng làm quá tải |
| Không kiểm thử | Code shedding chưa bao giờ chạy thật, có bug |
| Bỏ request nhưng vẫn ghi log đầy đủ | Log I/O trở thành nút thắt mới |

Bẫy cuối cùng đáng nhớ: khi bỏ 10.000 request/giây, đừng ghi 10.000 dòng log. Dùng log lấy mẫu (sampling) hoặc chỉ đếm bằng metric.

## Tóm tắt case 4

- Khi quá tải, **từ chối bớt cho kết quả tốt hơn hẳn** so với cố phục vụ tất cả.
- Bốn tầng: **rate limit** (theo client) → **concurrency limit** (theo hệ thống) → **shedding theo ưu tiên** → **deadline**.
- **Concurrency limit bảo vệ tốt hơn rate limit** vì nó tự thích ứng khi latency tăng.
- **Adaptive concurrency limit** (kiểu TCP Vegas) tự tìm giới hạn, không cần chỉnh tay.
- Token bucket cho API công khai; sliding window counter khi cần chính xác.
- **CoDel + adaptive LIFO**: khi hàng đợi đọng, phục vụ request mới nhất trước — tỉ lệ thành công cao hơn.
- Trả **429** (bạn gửi quá nhiều) hoặc **503** (hệ thống quá tải), **luôn kèm `Retry-After`**.
- **Brownout**: giảm chất lượng thay vì từ chối — người dùng vẫn hoàn thành được việc chính.
- Chặn càng sớm càng rẻ, nhưng vẫn cần lớp phòng thủ ở tầng trong.

**Bài kế tiếp** → [Case 5: Hot key và bài toán người nổi tiếng](05-case-hot-key-celebrity.md)
