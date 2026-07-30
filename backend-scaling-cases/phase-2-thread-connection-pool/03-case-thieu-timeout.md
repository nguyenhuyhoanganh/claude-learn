# Case 3: Timeout mặc định là vô hạn — cái bẫy im lặng ở mọi client

Có một sự thật khó chịu về thư viện Java: **rất nhiều client mặc định chờ vô hạn**. Không phải 30 giây, không phải 5 phút — mà là mãi mãi, cho tới khi hệ điều hành tự bỏ cuộc (TCP keepalive mặc định của Linux mất **hơn 2 tiếng**).

Đây là loại lỗi tệ nhất: code chạy hoàn hảo suốt 2 năm, rồi một ngày mạng chập chờn và toàn bộ 200 thread treo vĩnh viễn. Không exception, không log, không restart. Chỉ đơn giản là đứng im.

## Hiện tượng

```text
14:20  Một switch mạng ở datacenter bị lỗi. Gói tin đi được, gói tin về mất.
       Kết nối TCP KHÔNG bị đóng — nó chỉ đơn giản là không có phản hồi.

14:21  Thread bắt đầu treo ở lời gọi tới inventory-service.
14:25  Cả 200 thread đều treo.
14:26  Metric: threads.busy = 200/200, CPU = 3%.
       Log ứng dụng: KHÔNG CÓ GÌ. Không một dòng lỗi.

15:40  Sau 1 tiếng 20 phút, vẫn không có exception nào.
       Vấn đề mạng đã được sửa từ 14:35 nhưng app không tự hồi phục.
       Phải restart thủ công.
```

Chi tiết đáng sợ nhất: **vấn đề mạng chỉ kéo dài 15 phút, nhưng app chết 80 phút** — và sẽ chết mãi nếu không ai restart. Đây là **metastable failure** (phase-1 bài 5) ở dạng thuần khiết nhất.

## Cơ chế: vì sao TCP không tự phát hiện

Khi bạn gọi `socket.read()` và bên kia không trả lời, chuyện gì xảy ra?

```text
   Trường hợp A: Server ĐÓNG kết nối tử tế
   Client ←── FIN ─── Server
   ⇒ read() trả về -1 ngay lập tức. Có exception. Tốt.

   Trường hợp B: Tiến trình server chết đột ngột
   Client ←── RST ─── OS của server
   ⇒ read() ném ConnectionResetException ngay. Vẫn tốt.

   Trường hợp C: Mạng đứt / server treo / firewall nuốt gói
   Client        ...        (im lặng tuyệt đối)
   ⇒ read() CHỜ MÃI MÃI.  ← ĐÂY LÀ CASE NGUY HIỂM
```

Trường hợp C là thứ giết hệ thống. TCP không có cách nào biết bên kia còn sống hay không nếu không có dữ liệu qua lại. Cơ chế `TCP keepalive` của Linux có tồn tại, nhưng mặc định:

```bash
net.ipv4.tcp_keepalive_time = 7200      # 2 tiếng mới bắt đầu dò
net.ipv4.tcp_keepalive_intvl = 75       # dò lại mỗi 75 giây
net.ipv4.tcp_keepalive_probes = 9       # thử 9 lần
# ⇒ Tổng: 7200 + 75×9 = 7875 giây ≈ 2 giờ 11 phút mới phát hiện!
```

Hơn hai tiếng. Không thể trông cậy vào nó. **Timeout ở tầng ứng dụng là bắt buộc.**

## Bảng mặc định — in ra và dán lên tường

Đây là phần giá trị nhất của bài. Các con số mặc định thật của những client phổ biến:

| Client | Connect timeout | Read timeout | Ghi chú |
|---|---|---|---|
| `RestTemplate` (mặc định) | **∞** | **∞** | Nguy hiểm nhất, dùng phổ biến nhất |
| `RestTemplate` + `RestTemplateBuilder` | ∞ | ∞ | Vẫn phải tự đặt |
| `WebClient` (Reactor Netty) | 30 giây | **∞** | Có `responseTimeout` nhưng mặc định tắt |
| `RestClient` (Spring 6.1+) | ∞ | ∞ | Kế thừa từ request factory |
| OpenFeign | 10 giây | 60 giây | Có mặc định, nhưng 60s là quá dài |
| Apache HttpClient 5 | 3 phút | 3 phút | Thêm: `maxTotal=25`, `maxPerRoute=**5**` |
| OkHttp | 10 giây | 10 giây | Mặc định hợp lý nhất |
| Java `HttpClient` (JDK 11+) | ∞ | ∞ | Phải tự đặt cả hai |
| JDBC (PostgreSQL driver) | 10 giây | **∞** (`socketTimeout=0`) | Query chạy mãi |
| JDBC (MySQL driver) | ∞ | **∞** | Cả hai đều vô hạn |
| Lettuce (Redis) | 10 giây | 60 giây (command timeout) | 60s quá dài cho Redis |
| Jedis (Redis) | 2 giây | 2 giây | Hợp lý |
| MongoDB driver | 10 giây | ∞ (`socketTimeout=0`) | `serverSelectionTimeout=30s` |
| Kafka producer | — | `delivery.timeout.ms=120000` (2 phút) | `max.block.ms=60000` |
| AWS SDK v2 | 2 giây | 30 giây | `apiCallTimeout` mặc định tắt |
| Elasticsearch client | 1 giây | 30 giây | |

Ba dòng đầu đáng chú ý nhất: **Spring không đặt timeout cho bạn**. Framework phổ biến nhất trong doanh nghiệp Java để mặc định nguy hiểm nhất — vì Spring cho rằng đây là quyết định của ứng dụng, không phải của framework.

## Bảy loại timeout cần phân biệt

Đây là chỗ nhiều người nhầm: "tôi đặt timeout rồi mà vẫn treo". Vì có **bảy** loại timeout khác nhau, đặt một cái không đủ.

```text
   ┌─ [1] Connection acquire ─┐  chờ mượn connection từ pool
   │                          │
   │  ┌─ [2] Connect ─┐       │  bắt tay TCP
   │  │               │       │
   │  │  ┌─ [3] TLS ─┐│       │  bắt tay SSL
   │  │  │           ││       │
   │  │  │ ┌─[4] Write─┐      │  gửi request body
   │  │  │ │           │      │
   │  │  │ │ ┌─[5] Read (socket) ─┐   chờ GIỮA HAI GÓI TIN
   │  │  │ │ │                     │
   │  │  │ │ │  ...gói...gói...gói │
   └──┴──┴─┴─┴─────────────────────┴──┐
   └────────── [6] Request/call timeout: TỔNG TOÀN BỘ ────┘
   └────────── [7] Deadline của cả chuỗi request ──────────┘
```

| # | Loại | Bảo vệ khỏi | Hay bị quên |
|---|---|---|---|
| 1 | Connection acquire | Pool cạn | Thỉnh thoảng |
| 2 | Connect | Host không tồn tại, firewall chặn | Ít |
| 3 | TLS handshake | Server TLS treo | **Thường xuyên** |
| 4 | Write | Gửi body lớn mà bên kia không nhận | **Thường xuyên** |
| 5 | Read (socket) | Không có dữ liệu về | Ít |
| 6 | **Tổng (request)** | Server nhỏ giọt dữ liệu | **Gần như luôn quên** |
| 7 | Deadline chuỗi | Tổng cả chain service | Hầu như không ai làm |

### Vì sao read timeout KHÔNG đủ

Đây là điều tinh vi nhất trong bài:

```text
   Read timeout = 2 giây.  Server ác ý (hoặc bị lỗi) trả về:

   t=0.0s : gửi 1 byte  "H"
   t=1.9s : gửi 1 byte  "T"     ← chưa chạm 2 giây, timeout được reset
   t=3.8s : gửi 1 byte  "T"     ← lại reset
   t=5.7s : gửi 1 byte  "P"
   ...

   ⇒ Read timeout KHÔNG BAO GIỜ kích hoạt.
   ⇒ Thread bị giam vô hạn dù đã đặt timeout.
```

Đây chính là nguyên lý của tấn công **Slowloris** (phase-6), và cũng xảy ra tự nhiên khi một service quá tải trả dữ liệu nhỏ giọt.

Chỉ **timeout tổng (số 6)** chặn được nó.

```java
// Timeout tổng với Resilience4j
@TimeLimiter(name = "inventoryService")
@CircuitBreaker(name = "inventoryService")
public CompletableFuture<Stock> getStock(String sku) {
    return CompletableFuture.supplyAsync(() -> inventoryClient.get(sku));
}
```

```yaml
resilience4j:
  timelimiter:
    instances:
      inventoryService:
        timeout-duration: 2s
        cancel-running-future: true    # quan trọng: huỷ thật, không chỉ trả lỗi
```

Hoặc thuần Java:

```java
CompletableFuture<Stock> future = CompletableFuture
    .supplyAsync(() -> inventoryClient.get(sku), ioExecutor)
    .orTimeout(2, TimeUnit.SECONDS);
```

> Cảnh báo: `orTimeout` làm future hoàn thành với lỗi, nhưng **thread đang chạy bên dưới vẫn tiếp tục chạy** — nó không bị giết. Nghĩa là timeout tổng bảo vệ *người gọi*, nhưng vẫn cần timeout tầng thấp để giải phóng thread. Phải có **cả hai**.

## Cấu hình đúng cho từng client

### RestTemplate

```java
@Bean
public RestTemplate restTemplate() {
    PoolingHttpClientConnectionManager cm = PoolingHttpClientConnectionManagerBuilder
        .create()
        .setMaxConnTotal(100)        // mặc định 25 — quá nhỏ
        .setMaxConnPerRoute(50)      // mặc định 5  — RẤT nhỏ, hay là nút thắt ẩn
        .setDefaultConnectionConfig(ConnectionConfig.custom()
            .setConnectTimeout(Timeout.ofMilliseconds(500))
            .setSocketTimeout(Timeout.ofSeconds(2))
            .build())
        .build();

    CloseableHttpClient client = HttpClients.custom()
        .setConnectionManager(cm)
        .setDefaultRequestConfig(RequestConfig.custom()
            .setConnectionRequestTimeout(Timeout.ofMilliseconds(200))  // chờ mượn từ pool
            .setResponseTimeout(Timeout.ofSeconds(3))                  // TỔNG
            .build())
        .evictIdleConnections(TimeValue.ofSeconds(30))
        .build();

    return new RestTemplate(new HttpComponentsClientHttpRequestFactory(client));
}
```

`setMaxConnPerRoute` đáng nói riêng: mặc định là **5**. Nghĩa là dù bạn có 200 thread, chỉ 5 request cùng lúc được gửi tới mỗi host đích. 195 thread còn lại xếp hàng chờ. Rất nhiều trường hợp "service ngoài chậm" thực ra là con số 5 này — và nó **không xuất hiện trong bất kỳ log nào**.

### WebClient (reactive)

```java
@Bean
public WebClient webClient() {
    HttpClient httpClient = HttpClient.create(
            ConnectionProvider.builder("custom")
                .maxConnections(100)
                .pendingAcquireTimeout(Duration.ofMillis(200))
                .maxIdleTime(Duration.ofSeconds(30))
                .build())
        .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, 500)
        .responseTimeout(Duration.ofSeconds(3))          // timeout TỔNG
        .doOnConnected(conn -> conn
            .addHandlerLast(new ReadTimeoutHandler(2))
            .addHandlerLast(new WriteTimeoutHandler(2)));

    return WebClient.builder()
        .clientConnector(new ReactorClientHttpConnector(httpClient))
        .build();
}
```

### OpenFeign

```yaml
feign:
  client:
    config:
      # `default` áp dụng cho MỌI Feign client không được cấu hình riêng.
      default:
        connect-timeout: 500       # ms — thời gian bắt tay TCP tới đích
        read-timeout: 2000         # ms — thời gian chờ GIỮA HAI GÓI dữ liệu về
      # Tên ở đây phải khớp với giá trị `name` trong @FeignClient(name = "...")
      inventoryService:
        connect-timeout: 300       # inventory ở gần, bắt tay phải nhanh
        read-timeout: 1000         # p99 của nó ~400ms → timeout 1s là hợp lý
  httpclient:
    # Bật Apache HttpClient thay cho HttpURLConnection mặc định của Feign.
    # Cần thiết để có connection pool (tái sử dụng kết nối, tránh cạn port).
    enabled: true
    # Tổng số kết nối trong pool, dùng chung cho mọi đích.
    max-connections: 200
    # Số kết nối tối đa tới MỖI host đích.
    # MẶC ĐỊNH CỦA APACHE LÀ 5 — nút thắt ẩn kinh điển: dù có 200 thread,
    # chỉ 5 request cùng lúc được gửi tới mỗi service, 195 cái xếp hàng
    # mà KHÔNG có log nào báo.
    max-connections-per-route: 50
```

### JDBC — hai lớp bảo vệ

```yaml
spring:
  datasource:
    url: jdbc:postgresql://db:5432/shop?socketTimeout=30&connectTimeout=5&loginTimeout=5
  jpa:
    properties:
      javax.persistence.query.timeout: 5000    # timeout cho từng query (ms)
```

Và quan trọng hơn, đặt ở **phía database** — vì client timeout không dừng được query đang chạy trên server:

```sql
-- PostgreSQL, đặt ở mức user hoặc database
ALTER ROLE app_user SET statement_timeout = '10s';
ALTER ROLE app_user SET lock_timeout = '3s';
ALTER ROLE app_user SET idle_in_transaction_session_timeout = '30s';
```

Ba dòng SQL này đáng giá hơn nhiều dòng cấu hình Java:

- `statement_timeout` — query chạy quá 10 giây bị huỷ. Chặn được query lỗi kiểu tích Descartes.
- `lock_timeout` — chờ lock quá 3 giây thì bỏ. Chặn được case phase-3.
- `idle_in_transaction_session_timeout` — transaction mở mà không làm gì quá 30 giây thì huỷ. **Chặn được thủ phạm số một của case 2.**

MySQL tương đương:

```sql
SET GLOBAL max_execution_time = 10000;          -- ms, chỉ áp cho SELECT
SET GLOBAL innodb_lock_wait_timeout = 5;        -- giây (mặc định 50!)
SET GLOBAL wait_timeout = 600;
```

### Redis (Lettuce)

```yaml
spring:
  data:
    redis:
      # Thời gian chờ MỘT LỆNH Redis trả về kết quả.
      # Mặc định của Lettuce là 60 GIÂY. Redis bình thường trả lời trong 1 ms;
      # quá 500 ms nghĩa là có gì đó rất sai (ai đó chạy KEYS *, hoặc lệnh SAVE
      # đang chặn) — chờ thêm cũng vô ích, chỉ tổ giam thread.
      timeout: 500ms

      # Thời gian bắt tay TCP tới Redis.
      connect-timeout: 300ms

      lettuce:
        pool:
          # Số kết nối tối đa trong pool tới Redis.
          max-active: 50
          # Chờ mượn kết nối từ pool bao lâu.
          # MẶC ĐỊNH LÀ -1 = CHỜ VÔ HẠN — phải đổi, nếu không một Redis chậm
          # sẽ giam toàn bộ thread của ứng dụng.
          max-wait: 200ms
```

Redis bình thường trả lời trong 1 ms. Nếu quá 500 ms nghĩa là có gì đó rất sai (ai đó chạy `KEYS *`, hoặc `SAVE` đang chặn) — chờ thêm cũng vô ích.

## Timeout budget — thiết kế timeout cho cả chuỗi

Sai lầm phổ biến: mỗi service tự đặt timeout theo cảm tính, không ai nhìn tổng thể.

```text
   SAI:
   Gateway (timeout 30s) → Order (timeout 30s) → Payment (timeout 30s) → DB (∞)

   Người dùng chờ 30 giây. Trình duyệt đã bỏ cuộc từ giây thứ 10.
   Cả chuỗi vẫn cặm cụi làm việc cho một người đã đi mất.
```

```text
   ĐÚNG — ngân sách giảm dần:
   Client   : 10s  (người dùng chịu được)
   Gateway  :  8s  (chừa 2s cho mạng + retry)
   Order    :  5s
   Payment  :  2s
   DB query :  1s

   Mỗi tầng phải NHỎ HƠN tầng trên nó.
```

Quy tắc: **timeout của tầng con phải nhỏ hơn tầng cha**, và phải chừa chỗ cho retry. Nếu tầng cha 5 giây và bạn retry 3 lần với timeout 2 giây thì `3 × 2 = 6 > 5` — retry cuối cùng chắc chắn vô nghĩa.

Nâng cao hơn là **deadline propagation** (truyền hạn chót): thay vì mỗi tầng có timeout cố định, request mang theo "hạn chót tuyệt đối":

```java
public class Deadline {
    private static final ThreadLocal<Long> DEADLINE = new ThreadLocal<>();

    public static void set(long millisFromNow) {
        DEADLINE.set(System.currentTimeMillis() + millisFromNow);
    }

    public static Duration remaining() {
        Long d = DEADLINE.get();
        if (d == null) return Duration.ofSeconds(5);       // mặc định an toàn
        long left = d - System.currentTimeMillis();
        if (left <= 0) throw new DeadlineExceededException();
        return Duration.ofMillis(left);
    }
}

// Ở filter: đọc header X-Request-Deadline hoặc đặt mặc định
// Ở mỗi lời gọi ra ngoài: dùng Deadline.remaining() làm timeout
```

gRPC hỗ trợ sẵn cơ chế này (`grpc-timeout` header). Với REST, bạn tự truyền qua header. Lợi ích: nếu tầng 1 đã tiêu 4 trong 5 giây, tầng 3 biết mình chỉ còn 1 giây — thay vì ngây thơ chờ tiếp 2 giây cho một request đã chết.

## Chẩn đoán case thiếu timeout

Dấu hiệu đặc trưng, khác hẳn các case khác:

| Dấu hiệu | Case thiếu timeout | Case khác |
|---|---|---|
| Log lỗi | **Không có gì** | Có exception |
| Thread bận | 100%, **đứng yên nhiều giờ** | Dao động |
| Tự hồi phục sau khi sự cố hết | **Không** | Có |
| Thread dump 3 lần cách 10 phút | **Giống hệt nhau** | Khác nhau |

Mẹo cực hữu ích: lấy thread dump cách nhau **10 phút**. Nếu cùng một thread ID vẫn nằm ở cùng một dòng code → nó bị treo, không phải đang chạy chậm.

```bash
jstack <pid> > d1.txt; sleep 600; jstack <pid> > d2.txt
diff <(grep -A5 "exec-42" d1.txt) <(grep -A5 "exec-42" d2.txt)
# Không có khác biệt → thread treo cứng
```

Kiểm tra kết nối ở tầng OS:

```bash
# Xem kết nối nào đang mở và hàng đợi gửi/nhận có bị ứ không
ss -tanp | grep ESTAB | head -20
# Recv-Q hoặc Send-Q lớn kéo dài = dữ liệu ứ, bên kia không đọc/không gửi
```

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Chỉ đặt read timeout | Server nhỏ giọt dữ liệu vẫn giam thread vô hạn |
| Quên `connectionRequestTimeout` | Thread chờ mượn connection từ pool HTTP client, vô hạn |
| Quên `maxConnPerRoute` (mặc định 5) | Nút thắt ẩn, không có log nào báo |
| Timeout ở tầng con lớn hơn tầng cha | Tầng cha đã bỏ cuộc, tầng con vẫn làm |
| Đặt timeout nhưng không đặt `statement_timeout` ở DB | Query vẫn chạy trên DB, tốn tài nguyên cho kết quả không ai nhận |
| Timeout quá ngắn | Cắt nhầm request hợp lệ, tăng tỉ lệ lỗi. Đặt theo p99 × 1,5-2 |
| Copy timeout từ service khác | Mỗi downstream có đặc tính latency khác nhau |
| Tin vào TCP keepalive | Mặc định 2 giờ 11 phút |

## Checklist audit — chạy trên dự án của bạn hôm nay

```text
□ Mọi RestTemplate/WebClient/Feign có connect + read timeout?
□ Có timeout TỔNG (responseTimeout / TimeLimiter) không?
□ maxConnPerRoute đã tăng từ mặc định 5 chưa?
□ JDBC URL có socketTimeout, connectTimeout chưa?
□ DB đã đặt statement_timeout, lock_timeout,
  idle_in_transaction_session_timeout chưa?
□ Redis timeout đã giảm từ 60s xuống ~500ms chưa?
□ Kafka max.block.ms, delivery.timeout.ms đã xem chưa?
□ Timeout các tầng có giảm dần từ ngoài vào trong không?
□ Có metric đo latency downstream để chọn timeout dựa trên số liệu không?
```

Chạy `grep -rn "new RestTemplate()" src/` là cách nhanh nhất tìm ra quả bom hẹn giờ trong dự án.

## Tóm tắt case 3

- Rất nhiều client Java **mặc định chờ vô hạn**: `RestTemplate`, JDBC MySQL, `HttpClient` của JDK.
- TCP không tự phát hiện đứt mạng — keepalive mặc định mất **2 giờ 11 phút**.
- Có **7 loại timeout**; đặt read timeout thôi là **chưa đủ**, vì server nhỏ giọt dữ liệu vẫn treo bạn.
- Bắt buộc phải có **timeout tổng** (`responseTimeout` / `TimeLimiter`).
- `maxConnPerRoute = 5` là nút thắt ẩn kinh điển của Apache HttpClient.
- Ba dòng SQL đáng giá nhất: `statement_timeout`, `lock_timeout`, `idle_in_transaction_session_timeout`.
- Thiết kế **timeout budget giảm dần** từ ngoài vào trong; nâng cao thì dùng **deadline propagation**.
- Chữ ký nhận diện: **không có log lỗi + thread dump giống hệt nhau sau 10 phút**.

**Bài kế tiếp** → [Case 4: Pool lồng pool — deadlock tự tạo trong ứng dụng của chính bạn](04-case-pool-long-pool-deadlock.md)
