# Case 1: Một service chậm làm chết cả hệ thống (thread pool exhaustion)

Đây là case xảy ra nhiều nhất trong thực tế, và cũng là case gây bất ngờ nhất — vì **service bị chết không phải service có lỗi**.

## Hiện tượng

23:40, sàn thương mại điện tử đang chạy sale.

```text
23:40  Đội thanh toán deploy một thay đổi nhỏ ở payment-service.
       Một query trong đó thiếu index → latency từ 80 ms lên 6 giây.

23:43  order-service bắt đầu chậm.
23:45  Trang chủ chậm. Trang danh mục chậm. Trang tìm kiếm chậm.
       Những trang này KHÔNG gọi payment-service.

23:47  API gateway trả 504 Gateway Timeout cho MỌI endpoint.
       Toàn bộ website sập.

23:52  Health check của Kubernetes cũng timeout → pod bị giết và
       khởi động lại liên tục. Tình hình tệ hơn.
```

Câu hỏi: **vì sao trang chủ chết trong khi nó không hề gọi payment-service?**

## Cơ chế: thread pool là tài nguyên dùng chung

Nhắc lại phase-1: Tomcat có 200 worker thread, dùng chung cho **toàn bộ** endpoint của ứng dụng. Không có sự phân chia nào giữa endpoint này với endpoint kia.

```text
   TRẠNG THÁI BÌNH THƯỜNG (payment nhanh 80 ms)

   Thread pool (200)
   ├─ 12 thread : POST /orders     → gọi payment 80 ms
   ├─  8 thread : GET  /products
   ├─  3 thread : GET  /           (trang chủ)
   └─ 177 thread: RẢNH             ← còn dư rất nhiều

   Mọi thứ ổn. Mỗi thread quay vòng nhanh.
```

Bây giờ payment chậm thành 6 giây. Áp định luật Little (phase-1 bài 4):

```text
   Số thread cần cho /orders = RPS × latency
                             = 50 RPS × 6 giây
                             = 300 thread

   Nhưng pool chỉ có 200!
```

```text
   TRẠNG THÁI SAU 4 GIÂY

   Thread pool (200)
   ├─ 200 thread : POST /orders → ĐANG CHỜ payment-service
   ├─   0 thread : GET /products    ← không còn thread nào
   ├─   0 thread : GET /            ← không còn thread nào
   └─   0 thread : RẢNH

   Mọi request khác xếp hàng trong max-connections và chết dần vì timeout.
```

**Thread pool bị một endpoint duy nhất "ăn" sạch.** Mọi endpoint khác chết theo dù chúng hoàn toàn khoẻ mạnh. Hiện tượng này có tên: **resource contention** (tranh chấp tài nguyên dùng chung), và hệ quả của nó là **cascading failure** (sập dây chuyền).

### Diễn biến theo thời gian

```text
  Thread bận
   200 │                        ████████████████████████████
       │                    ████
   150 │                ████
       │            ████
   100 │        ████
       │    ████
    50 │████
       └────┬────┬────┬────┬────┬────┬────┬────┬────────→ thời gian
           0s   1s   2s   3s   4s   5s   6s   7s

       ↑ payment bắt đầu chậm        ↑ pool cạn hoàn toàn
                                       → toàn bộ site sập
```

Chỉ mất **4 giây** từ lúc downstream chậm đến lúc toàn bộ hệ thống sập. Không đủ thời gian để con người phản ứng — nên giải pháp bắt buộc phải là **tự động**.

### Vì sao nó lan ngược lên trên?

Chưa hết. API gateway cũng có thread pool riêng, và nó cũng đang chờ order-service:

```text
   payment-service chậm
        ↓ (giam thread của)
   order-service cạn thread
        ↓ (giam thread của)
   api-gateway cạn thread
        ↓
   MỌI service phía sau gateway đều không truy cập được
```

Đây gọi là **backpressure ngược** hoặc hiệu ứng domino. Một lỗi ở service lá cây leo ngược lên tận gốc và làm chết cả rừng.

## Chẩn đoán: xác nhận đúng là case này

Theo quy trình phase-1 bài 6:

**Metric**

```promql
tomcat_threads_busy_threads / tomcat_threads_config_max_threads   # → 1.0 (100%)
```

CPU thì sao? **10%**. Đây là chữ ký đặc trưng: **thread đầy + CPU thấp = đang chờ, không phải đang tính**.

**Thread dump** (lấy 3 cái cách 10 giây):

```bash
jstack <pid> | grep -A1 "java.lang.Thread.State: RUNNABLE" \
  | grep "^\s*at" | sort | uniq -c | sort -rn | head -3
```

```text
   193     at java.net.SocketInputStream.socketRead0(Native Method)
     4     at java.util.zip.Inflater.inflateBytes(Native Method)
     2     at sun.nio.ch.EPollArrayWrapper.epollWait(Native Method)
```

193/200 thread đang chờ đọc socket. Xem chi tiết một thread:

```text
"http-nio-8080-exec-137" #237 daemon runnable
   java.lang.Thread.State: RUNNABLE
        at java.net.SocketInputStream.socketRead0(Native Method)
        ...
        at org.springframework.web.client.RestTemplate.execute(...)
        at com.shop.order.PaymentClient.charge(PaymentClient.java:45)   ← ĐÂY
        at com.shop.order.OrderService.placeOrder(OrderService.java:88)
```

Kết luận trong 2 phút: **193 thread đang chờ `PaymentClient.charge`**. Thủ phạm rõ ràng.

## Giải pháp — bốn tầng phòng thủ

Không có một giải pháp duy nhất. Cần **nhiều lớp**, mỗi lớp chặn một phần.

### Tầng 1: Timeout — bắt buộc, không có ngoại lệ

Nguyên nhân sâu xa nhất của case này là **không đặt timeout**. Mặc định của phần lớn HTTP client là **chờ vô hạn**.

```java
// SAI — RestTemplate mặc định KHÔNG có timeout
@Bean
public RestTemplate restTemplate() {
    return new RestTemplate();   // chờ mãi mãi nếu server không trả lời
}

// ĐÚNG
@Bean
public RestTemplate restTemplate(RestTemplateBuilder builder) {
    return builder
        .setConnectTimeout(Duration.ofSeconds(1))   // bắt tay TCP
        .setReadTimeout(Duration.ofSeconds(2))      // chờ dữ liệu về
        .build();
}
```

Hai loại timeout khác nhau, cần hiểu rõ:

| Loại | Đo cái gì | Giá trị hợp lý |
|---|---|---|
| **Connect timeout** | Thời gian bắt tay TCP | 500 ms - 1 giây (cùng datacenter thì rất nhanh) |
| **Read/socket timeout** | Thời gian chờ **giữa hai gói dữ liệu** | 2-5 lần p99 của downstream |
| **Request timeout** (tổng) | Toàn bộ vòng đời request | Đặt ở tầng cao hơn (Resilience4j) |

> **Bẫy tinh vi**: read timeout đo khoảng cách giữa hai gói tin, **không phải** tổng thời gian. Một server trả về 1 byte mỗi 1,9 giây sẽ không bao giờ chạm read timeout 2 giây — nó có thể giữ thread của bạn vô hạn. Muốn chặn triệt để phải có timeout tổng (dùng `TimeLimiter` của Resilience4j hoặc `CompletableFuture.orTimeout`).

Đặt timeout bao nhiêu? Công thức thực dụng:

```text
   timeout = p99 của downstream × 1,5 - 2

   Đo được payment-service p99 = 300 ms  →  timeout = 500-600 ms
```

Đừng đặt theo cảm tính "30 giây cho chắc". 30 giây nghĩa là mỗi thread bị giam 30 giây, và với công thức Little bạn cần `RPS × 30` thread — con số không tưởng.

Tính ra ngay hiệu quả: với timeout 600 ms thay vì chờ 6 giây, số thread cần giảm 10 lần:

```text
   Không timeout : 50 RPS × 6,0s = 300 thread  → CẠN
   Timeout 600ms : 50 RPS × 0,6s =  30 thread  → ổn
```

**Chỉ một dòng cấu hình timeout đã cứu cả hệ thống.**

### Tầng 2: Circuit breaker — ngừng gọi khi biết chắc sẽ hỏng

Timeout tốt, nhưng vẫn lãng phí: mỗi request vẫn giam thread 600 ms rồi mới thất bại. Nếu payment-service chết hẳn, ta biết trước là sẽ hỏng — sao còn thử?

**Circuit breaker (cầu dao)** — lấy ý tưởng từ cầu dao điện: khi phát hiện quá nhiều lỗi, nó "ngắt mạch", các lời gọi tiếp theo **thất bại ngay lập tức** (0 ms) mà không chạm tới service đích.

```text
    ┌──────────┐  lỗi > 50%   ┌──────────┐  hết 30 giây  ┌───────────┐
    │  CLOSED  │─────────────→│   OPEN   │──────────────→│ HALF_OPEN │
    │(cho qua) │              │(chặn hết)│               │(thử vài cái)│
    └──────────┘              └──────────┘               └───────────┘
         ↑                                                     │
         │                    thử thành công                   │
         └─────────────────────────────────────────────────────┘
                                    │ thử vẫn lỗi
                                    └──→ quay lại OPEN
```

Ba trạng thái:

| Trạng thái | Hành vi | Khi nào chuyển |
|---|---|---|
| **CLOSED** (đóng mạch) | Cho request đi qua bình thường | Tỉ lệ lỗi vượt ngưỡng → OPEN |
| **OPEN** (hở mạch) | Từ chối ngay, không gọi downstream | Sau `waitDuration` → HALF_OPEN |
| **HALF_OPEN** (thử) | Cho vài request đi thử | Thành công → CLOSED, lỗi → OPEN |

```yaml
resilience4j:
  circuitbreaker:
    instances:
      paymentService:
        # COUNT_BASED = quyết định dựa trên N lời gọi GẦN NHẤT.
        # (Dùng TIME_BASED nếu traffic thưa — xem phase-4 case 3.)
        sliding-window-type: COUNT_BASED

        # Cỡ cửa sổ: xét 20 lời gọi gần nhất để tính tỉ lệ lỗi.
        sliding-window-size: 20

        # Cần ít nhất 10 mẫu mới được phép mở mạch.
        # Chống việc "2 lỗi trên 2 lời gọi = 100% lỗi" → mở mạch oan.
        minimum-number-of-calls: 10

        # Tỉ lệ lỗi (%) vượt ngưỡng này thì MỞ MẠCH.
        failure-rate-threshold: 50

        # Lời gọi lâu hơn 1 giây được ĐẾM LÀ LỖI, dù nó trả về 200 OK.
        # Đây là tham số quan trọng nhất: service CHẬM giam thread,
        # nguy hiểm hơn service CHẾT (chết thì trả lỗi ngay, thread được thả).
        slow-call-duration-threshold: 1s

        # Trên 50% lời gọi bị coi là "chậm" thì cũng mở mạch.
        slow-call-rate-threshold: 50

        # Mạch mở bao lâu trước khi thử lại (chuyển sang HALF_OPEN).
        # Quá ngắn thì không cho downstream thời gian hồi phục.
        wait-duration-in-open-state: 30s

        # Ở trạng thái HALF_OPEN, cho bao nhiêu lời gọi đi "thăm dò".
        # Ít thôi — để không dội toàn bộ tải vào service vừa mới sống lại.
        permitted-number-of-calls-in-half-open-state: 3
```

```java
@CircuitBreaker(name = "paymentService", fallbackMethod = "chargeFallback")
public PaymentResult charge(Order order) {
    return restTemplate.postForObject(PAYMENT_URL, order, PaymentResult.class);
}

private PaymentResult chargeFallback(Order order, Throwable t) {
    // Không có thanh toán ngay → chuyển sang xử lý bất đồng bộ
    outboxRepository.save(new PendingPayment(order));
    return PaymentResult.pending("Đang xử lý, chúng tôi sẽ báo lại trong ít phút");
}
```

Chú ý tham số `slow-call-duration-threshold` — đây là thứ mà nhiều người bỏ qua nhưng lại quan trọng nhất cho case này. **Service chậm còn nguy hiểm hơn service chết**: service chết trả lỗi ngay (thread được giải phóng), service chậm giam thread. Circuit breaker phải coi "chậm" cũng là "lỗi".

### Tầng 3: Bulkhead — giới hạn số thread cho mỗi downstream

Ngay cả khi có timeout và circuit breaker, trong 20 lời gọi đầu tiên (trước khi mạch mở), vẫn có thể có 200 thread lao vào cùng lúc. Cần chặn cứng: **một downstream chỉ được dùng tối đa N thread**.

```yaml
resilience4j:
  bulkhead:
    instances:
      paymentService:
        # Số lời gọi ĐỒNG THỜI tối đa tới payment-service.
        # Dù payment treo hoàn toàn, chỉ 20 thread bị giam;
        # 180 thread còn lại vẫn phục vụ các endpoint khác.
        max-concurrent-calls: 20

        # Hết chỗ thì chờ bao lâu để xin một suất.
        # ĐẶT 0 — nếu cho chờ, thread vẫn bị giam trong lúc chờ
        # và bulkhead mất sạch tác dụng. Từ chối ngay là đúng.
        max-wait-duration: 0
```

```java
@Bulkhead(name = "paymentService", fallbackMethod = "chargeFallback")
@CircuitBreaker(name = "paymentService", fallbackMethod = "chargeFallback")
public PaymentResult charge(Order order) { ... }
```

Kết quả: dù payment-service treo hoàn toàn, **chỉ 20 thread bị giam**, 180 thread còn lại vẫn phục vụ trang chủ, danh mục, tìm kiếm. Website vẫn sống, chỉ chức năng đặt hàng bị ảnh hưởng.

Đây là ý nghĩa gốc của từ "bulkhead": vách ngăn kín nước trên tàu thuỷ. Một khoang thủng thì nước không tràn sang khoang khác, tàu vẫn nổi. Case 5 sẽ đào sâu.

### Tầng 4: Không gọi đồng bộ nếu không cần đồng bộ

Câu hỏi nên đặt sớm nhất: **có thật sự cần chờ payment trả lời ngay trong request HTTP không?**

```text
   ĐỒNG BỘ (nguy hiểm)
   User → order-service → [CHỜ] payment-service → trả lời user
                            ↑ giam thread ở đây

   BẤT ĐỒNG BỘ (an toàn)
   User → order-service → ghi DB + đẩy message → trả lời user NGAY (50 ms)
                                    ↓
                          Kafka/RabbitMQ
                                    ↓
                          payment-service xử lý khi nào rảnh
                                    ↓
                          báo kết quả qua webhook/websocket/email
```

Với kiến trúc bất đồng bộ, payment-service **chết hẳn 3 tiếng cũng không ảnh hưởng** tới việc nhận đơn — message nằm chờ trong queue, xử lý sau. Đây là giải pháp triệt để nhất, và là nội dung của phase-5.

Đánh đổi: phức tạp hơn nhiều. Phải xử lý eventual consistency (nhất quán cuối cùng), idempotency (chống xử lý trùng), và trải nghiệm người dùng thay đổi ("đơn hàng đang xử lý" thay vì "đặt hàng thành công"). Không phải lúc nào cũng đáng.

## So sánh bốn tầng

| Giải pháp | Chặn được gì | Chi phí triển khai | Đánh đổi |
|---|---|---|---|
| **Timeout** | Giới hạn thời gian giam thread | Rất thấp — vài dòng config | Có thể cắt nhầm request chậm hợp lệ |
| **Circuit breaker** | Không phí thread khi biết chắc hỏng | Thấp | Cần chọn ngưỡng đúng; có thể mở nhầm |
| **Bulkhead** | Cô lập, giới hạn thiệt hại | Thấp | Giới hạn cứng công suất endpoint đó |
| **Async hoá** | Loại bỏ hoàn toàn sự phụ thuộc | **Cao** — đổi kiến trúc | Eventual consistency, phức tạp |

**Thứ tự triển khai khuyến nghị**: timeout (làm ngay hôm nay) → bulkhead → circuit breaker → cân nhắc async cho luồng quan trọng.

## Case biến thể — những dạng khác của cùng một vấn đề

Cùng cơ chế "thread bị giam", nhưng thủ phạm khác nhau:

| Biến thể | Thủ phạm | Dấu hiệu trong thread dump |
|---|---|---|
| DNS lookup chậm | Phân giải tên miền treo 5 giây | `InetAddress.getAllByName` |
| Đọc file trên NFS/network storage | Ổ đĩa mạng treo | `FileInputStream.readBytes` |
| Ghi log đồng bộ sang mạng | Logstash/Splunk chậm | `SocketAppender.append` (phase-6) |
| Gọi Redis không timeout | Redis bị chặn bởi lệnh `KEYS *` | `RedisInputStream.read` |
| Gửi email trong request | SMTP server chậm | `SMTPTransport.sendMessage` |
| Gọi API bên thứ ba (SMS, OTP) | Nhà cung cấp quá tải | tuỳ client |
| S3/object storage | Tải file lớn trong request | `SdkHttpClient` |

Danh sách này cho thấy quy tắc tổng quát: **mọi lời gọi ra ngoài tiến trình đều phải có timeout**. Không có ngoại lệ. Kể cả gọi Redis (vốn "luôn nhanh"), kể cả đọc file (vốn "luôn nhanh") — vì "luôn nhanh" chỉ đúng cho tới ngày nó không nhanh.

## Bẫy thường gặp

| Bẫy | Vì sao nguy hiểm |
|---|---|
| Tăng `threads.max` lên 2000 để "chịu được" | Tốn 2 GB RAM, context switch điên cuồng, và vẫn cạn khi downstream chậm hơn |
| Đặt timeout 30 giây "cho an toàn" | 30 giây × RPS = số thread khổng lồ. Timeout dài gần như vô dụng |
| Chỉ đặt connect timeout, quên read timeout | Kết nối thành công rồi treo mãi ở bước đọc — vẫn giam thread |
| Circuit breaker không đếm "chậm" là lỗi | Service chậm không kích hoạt cầu dao → vô tác dụng đúng lúc cần nhất |
| Đặt bulkhead nhưng `max-wait-duration` lớn | Thread vẫn xếp hàng chờ vào bulkhead → vẫn bị giam |
| Retry ngay khi timeout | Nhân đôi tải lên service đang ngắc ngoải (phase-4 bài 1) |
| Health check gọi vào downstream | Downstream chậm → health check fail → pod bị giết → tệ hơn (phase-4 bài 7) |

Bẫy cuối cùng đáng nói thêm: nếu `/health` của bạn kiểm tra cả payment-service, thì khi payment chậm, Kubernetes tưởng order-service hỏng và giết pod. Pod mới khởi động lại, cũng gặp payment chậm, cũng bị giết. Vòng lặp tử thần. **Liveness probe chỉ nên kiểm tra "tiến trình này còn sống không", tuyệt đối không kiểm tra dependency.**

## Cấu hình hoàn chỉnh — dán vào dự án được ngay

```yaml
server:
  tomcat:
    threads:
      max: 150                    # số luồng xử lý song song (xem phase-1 bài 4 để tính)
    connection-timeout: 5s         # chờ client gửi request đầu tiên; chống Slowloris

resilience4j:
  circuitbreaker:
    # `configs.default` là một BỘ THAM SỐ DÙNG CHUNG.
    # Các instance bên dưới kế thừa nó qua `base-config: default`,
    # nên không phải lặp lại cấu hình cho từng downstream.
    configs:
      default:
        sliding-window-size: 20                   # xét 20 lời gọi gần nhất
        minimum-number-of-calls: 10               # cần ≥10 mẫu mới được mở mạch
        failure-rate-threshold: 50                # >50% lỗi → mở mạch
        slow-call-duration-threshold: 1s          # >1s được tính là "lỗi chậm"
        slow-call-rate-threshold: 50              # >50% chậm → cũng mở mạch
        wait-duration-in-open-state: 30s          # mở mạch 30s rồi mới thử lại
        permitted-number-of-calls-in-half-open-state: 3   # số lời gọi thăm dò
        # Đưa trạng thái cầu dao vào /actuator/health để nhìn thấy được.
        # Lưu ý: nếu readiness probe dùng chung endpoint đó, cầu dao mở sẽ
        # khiến pod bị rút khỏi load balancer — thường KHÔNG phải điều bạn muốn.
        register-health-indicator: true
    instances:
      # Mỗi downstream một cầu dao RIÊNG — nếu dùng chung, email hỏng
      # sẽ chặn luôn cả thanh toán.
      paymentService: { base-config: default }
      inventoryService: { base-config: default }

  bulkhead:
    instances:
      # Chia hạn ngạch thread theo mức quan trọng nghiệp vụ.
      # inventory được nhiều hơn payment vì thiếu nó thì không bán được hàng.
      paymentService:   { max-concurrent-calls: 20, max-wait-duration: 0 }
      inventoryService: { max-concurrent-calls: 30, max-wait-duration: 0 }

  timelimiter:
    instances:
      paymentService:
        # Giới hạn TỔNG thời gian một lời gọi. Cần thiết vì read timeout
        # chỉ đo khoảng cách GIỮA HAI GÓI TIN — server trả nhỏ giọt
        # sẽ không bao giờ chạm read timeout nhưng vẫn giam thread mãi.
        timeout-duration: 2s
        # Huỷ thật tác vụ đang chạy khi hết giờ, không chỉ trả lỗi cho người gọi.
        cancel-running-future: true
```

```java
@Bean
public RestTemplate paymentRestTemplate(RestTemplateBuilder builder) {
    return builder
        .setConnectTimeout(Duration.ofMillis(500))
        .setReadTimeout(Duration.ofSeconds(2))
        .build();
}
```

Đừng quên **theo dõi** cầu dao sau khi bật, nếu không bạn sẽ không biết nó đang mở:

```promql
resilience4j_circuitbreaker_state{name="paymentService", state="open"}
resilience4j_bulkhead_available_concurrent_calls{name="paymentService"}
```

## Tóm tắt case 1

- Thread pool là **tài nguyên dùng chung**: một endpoint chậm ăn hết thread của mọi endpoint khác.
- Chữ ký nhận diện: **thread đầy + CPU thấp + thread dump toàn `socketRead0`**.
- Từ lúc downstream chậm đến lúc sập chỉ mất **vài giây** — phòng thủ phải tự động, không kịp làm thủ công.
- Bốn tầng phòng thủ: **timeout → bulkhead → circuit breaker → async hoá**.
- `timeout = p99 downstream × 1,5-2`. Timeout dài gần như vô dụng.
- Circuit breaker phải coi **"chậm" cũng là "lỗi"** (`slow-call-rate-threshold`).
- **Mọi lời gọi ra ngoài tiến trình đều phải có timeout** — kể cả Redis, kể cả đọc file.

**Bài kế tiếp** → [Case 2: Connection is not available — cạn connection pool database](02-case-hikaricp-connection-timeout.md)
