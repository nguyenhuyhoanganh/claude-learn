# Case 2: "Connection is not available" — cạn connection pool database

Nếu bạn viết Spring Boot đủ lâu, sớm muộn cũng gặp dòng log này:

```text
java.sql.SQLTransientConnectionException: HikariPool-1 - Connection is not
available, request timed out after 30000ms.
        at com.zaxxer.hikari.pool.HikariPool.createTimeoutException(...)
        at com.zaxxer.hikari.pool.HikariPool.getConnection(HikariPool.java:180)
```

Phản ứng đầu tiên của 90% người: **tăng `maximum-pool-size`**. Đó thường là lựa chọn sai, và bài này giải thích vì sao — cùng cách tìm ra nguyên nhân thật trong 5 phút.

## Hiện tượng

```text
09:00  Hệ thống bình thường. p99 = 200 ms.
09:15  Bắt đầu có lỗi 500 rải rác. Đúng 30 giây một lần theo từng cụm.
09:20  50% request lỗi. Log đầy "Connection is not available".
09:22  CPU của app: 15%.  CPU của database: 12%.
       Cả hai đều nhàn rỗi, nhưng hệ thống thì chết.
```

Chi tiết đáng chú ý: **lỗi xảy ra sau đúng 30 giây** — đó chính là `connectionTimeout` mặc định của HikariCP. Đây là dấu vân tay không thể nhầm.

## Cơ chế: cái phễu ba tầng

```text
   200 worker thread                    Pool: 10 connection
   ┌───────────────┐                    ┌──────────────────┐
   │ thread 1-10   │──── mượn được ────→│ 10 conn ĐANG BẬN │──→ Database
   ├───────────────┤                    └──────────────────┘     (rảnh rỗi,
   │ thread 11-200 │──── XẾP HÀNG ──╳                             12% CPU)
   │ (190 thread)  │     chờ 30 giây rồi ném exception
   └───────────────┘
```

Mặc định của Spring Boot: **`maximum-pool-size = 10`**. Trong khi Tomcat cho 200 thread chạy song song. Tỉ lệ 20:1.

Điều này **không tự nó là lỗi** — như phase-1 bài 4 đã chỉ ra, pool nhỏ thường tốt hơn pool lớn. Vấn đề chỉ xuất hiện khi **thời gian giữ connection quá dài**.

### Toán học của vấn đề

```text
   Thông lượng tối đa = pool_size / thời_gian_giữ_connection

   Giữ 10 ms  →  10 / 0,01 = 1.000 query/giây   ✓ thoải mái
   Giữ 100 ms →  10 / 0,10 =   100 query/giây   ~ vừa đủ
   Giữ 1 giây →  10 / 1,00 =    10 query/giây   ✗ thảm hoạ
   Giữ 5 giây →  10 / 5,00 =     2 query/giây   ✗✗
```

**Câu hỏi đúng không phải "pool bao nhiêu là đủ" mà là "vì sao connection bị giữ lâu thế?"**

## Bảy nguyên nhân giữ connection quá lâu

Xếp theo tần suất gặp trong thực tế:

### 1. Gọi HTTP bên trong `@Transactional` — thủ phạm số một

```java
// SAI NGHIÊM TRỌNG
@Transactional
public Order placeOrder(OrderRequest req) {
    Order order = orderRepository.save(new Order(req));   // mượn connection

    PaymentResult result = paymentClient.charge(order);   // ← gọi HTTP 2 giây!
                                                          //   connection VẪN bị giữ
                                                          //   lock DB VẪN bị giữ
    order.setPaymentId(result.getId());
    return order;                                          // giờ mới nhả
}
```

Connection bị giữ suốt 2 giây chỉ vì một lời gọi mạng chẳng liên quan gì đến database. Với pool 10, thông lượng tụt xuống **5 đơn/giây**.

Tệ hơn: transaction đang mở nghĩa là **lock cũng đang bị giữ** — mọi transaction khác đụng cùng dòng dữ liệu cũng phải chờ. Phase-3 bài 2 sẽ mổ xẻ mặt lock của vấn đề này.

```java
// ĐÚNG — tách phần gọi mạng ra NGOÀI transaction
public Order placeOrder(OrderRequest req) {
    Order order = createOrder(req);                 // transaction 1, ~5 ms
    PaymentResult result = paymentClient.charge(order);  // ngoài transaction
    return attachPayment(order.getId(), result);    // transaction 2, ~5 ms
}

@Transactional
protected Order createOrder(OrderRequest req) {
    return orderRepository.save(new Order(req));
}

@Transactional
protected Order attachPayment(Long orderId, PaymentResult result) {
    Order order = orderRepository.findById(orderId).orElseThrow();
    order.setPaymentId(result.getId());
    return order;
}
```

Thời gian giữ connection: 2 giây → **10 ms**. Thông lượng tăng **200 lần** mà không đổi một dòng cấu hình.

> Lưu ý kỹ thuật: `@Transactional` trên method `protected`/`private` gọi nội bộ trong cùng class **sẽ không có tác dụng** (Spring dùng proxy). Phải tách sang class khác hoặc dùng `TransactionTemplate`. Đây là bẫy kinh điển làm nhiều người "sửa xong mà không thấy khác gì".

### 2. `open-in-view` — cái bẫy mặc định của Spring Boot

Spring Boot **mặc định bật** `spring.jpa.open-in-view = true`. Nghĩa là: connection database được giữ **từ đầu đến cuối request HTTP**, kể cả trong lúc serialize JSON và ghi response ra mạng.

```text
   open-in-view = true (MẶC ĐỊNH)
   |─────────────────── connection bị giữ ───────────────────|
   [nhận request][chạy service][query DB][serialize JSON][ghi response ra mạng]
                                                          ↑ client mạng chậm
                                                            = giữ connection lâu hơn!

   open-in-view = false
                          |─ giữ ─|
   [nhận request][chạy service][query DB][serialize JSON][ghi response]
```

Với `open-in-view=true`, một client dùng 3G chậm cũng làm bạn giữ connection DB lâu hơn. Hoàn toàn phi lý.

```yaml
spring:
  jpa:
    open-in-view: false      # LUÔN đặt false trong production
```

Đánh đổi: tắt nó đi sẽ làm lộ ra `LazyInitializationException` ở những chỗ code đang lười — truy cập quan hệ lazy sau khi transaction đóng. Đó là **tính năng, không phải lỗi**: nó buộc bạn viết query cho tử tế (dùng `JOIN FETCH`, `@EntityGraph`, hoặc DTO projection) thay vì để Hibernate âm thầm bắn thêm hàng chục query.

Nên tắt ngay từ đầu dự án. Tắt ở dự án đã lớn thì cần một đợt refactor có kiểm soát.

### 3. Chạy job/batch dùng chung pool với API

```java
@Scheduled(cron = "0 0 * * * *")
@Transactional
public void reconcile() {
    List<Order> all = orderRepository.findAll();   // 2 triệu dòng, giữ connection 10 phút
    ...
}
```

Job này một mình chiếm 1 connection trong 10 phút. Nếu có vài job như vậy, pool 10 chỉ còn 6 cho toàn bộ API. Giải pháp: **pool riêng cho batch** (xem phần cấu hình cuối bài).

### 4. Query chậm vì thiếu index

Query 3 giây thì connection bị giữ 3 giây. Thêm index để query còn 5 ms là cách rẻ nhất tăng thông lượng pool lên 600 lần. Phase-3 bài 9 sẽ nói kỹ.

### 5. Rò rỉ connection (connection leak)

Code lấy connection thủ công mà quên trả:

```java
// SAI — nếu executeQuery ném exception, connection không bao giờ được trả
Connection conn = dataSource.getConnection();
Statement stmt = conn.createStatement();
ResultSet rs = stmt.executeQuery("SELECT ...");
conn.close();

// ĐÚNG — try-with-resources luôn đóng, kể cả khi có exception
try (Connection conn = dataSource.getConnection();
     Statement stmt = conn.createStatement();
     ResultSet rs = stmt.executeQuery("SELECT ...")) {
    ...
}
```

HikariCP có công cụ phát hiện sẵn:

```yaml
spring:
  datasource:
    hikari:
      leak-detection-threshold: 60000   # connection giữ >60s → in cảnh báo + stack trace
```

Nó sẽ in ra chính xác đoạn code nào đang giữ connection quá lâu. **Bật nó trên staging là việc nên làm ngay hôm nay.**

### 6. `@Transactional` bọc cả hàm quá lớn

```java
@Transactional
public void importFile(MultipartFile file) {
    List<Row> rows = parseExcel(file);        // 30 giây parse — connection bị giữ vô ích
    rows.forEach(r -> repository.save(r));
}
```

Sửa: parse xong rồi mới mở transaction, và chia lô (batch) để mỗi transaction ngắn.

### 7. Pool bị chia sẻ với nhiều instance

5 pod × pool 10 = 50 connection tới DB. Nếu `max_connections = 100` và có thêm 3 service khác, bạn chạm trần. Xem phase-1 bài 4.

## Chẩn đoán — 5 phút tìm ra thủ phạm

**Bước 1 — Xác nhận đúng là cạn pool**

```promql
hikaricp_connections_pending          # > 0 = có thread đang xếp hàng
hikaricp_connections_active           # bằng max = pool cạn
histogram_quantile(0.99, rate(hikaricp_connections_usage_seconds_bucket[5m]))
                                      # ← QUAN TRỌNG NHẤT: giữ connection bao lâu
```

Metric `hikaricp.connections.usage` là chìa khoá. Nếu p99 = 2 giây, bạn biết ngay có ai đó đang giữ connection 2 giây và cần tìm xem là ai.

**Bước 2 — Bật leak detection và đọc stack trace**

```yaml
spring.datasource.hikari.leak-detection-threshold: 20000
```

```text
WARN  c.z.h.p.ProxyLeakTask - Connection leak detection triggered for
      conn0: url=jdbc:postgresql://... on thread http-nio-8080-exec-5,
      stack trace follows
java.lang.Exception: Apparent connection leak detected
        at com.shop.order.OrderService.placeOrder(OrderService.java:88)   ← ĐÂY
```

Nó chỉ thẳng dòng code. Không cần đoán.

**Bước 3 — Nhìn từ phía database**

```sql
-- PostgreSQL: connection nào đang mở transaction mà không làm gì
SELECT pid, state, now() - state_change AS idle_duration, left(query, 60)
FROM pg_stat_activity
WHERE state = 'idle in transaction'
ORDER BY idle_duration DESC;
```

Nếu thấy nhiều dòng `idle in transaction` với thời gian dài → chắc chắn là nguyên nhân số 1 (gọi mạng trong transaction) hoặc số 6.

**Bước 4 — Thread dump**

```text
at com.zaxxer.hikari.util.ConcurrentBag.borrow(ConcurrentBag.java:151)
```

Đếm bao nhiêu thread đang kẹt ở đây. Nếu 190/200 → xác nhận.

## Giải pháp theo thứ tự ưu tiên

| # | Việc làm | Hiệu quả | Chi phí |
|---|---|---|---|
| 1 | Đưa mọi lời gọi mạng ra **ngoài** `@Transactional` | Rất cao (10-200×) | Refactor nhỏ |
| 2 | `open-in-view: false` | Cao | Có thể phải sửa query lazy |
| 3 | Thêm index cho query chậm | Cao | Thấp |
| 4 | Bật `leak-detection-threshold`, vá chỗ rò | Cao nếu có rò | Rất thấp |
| 5 | Tách pool riêng cho batch/report | Trung bình | Thấp |
| 6 | Giảm `connection-timeout` để fail nhanh | Cải thiện trải nghiệm | Rất thấp |
| 7 | **Tăng `maximum-pool-size`** | Thường thấp, đôi khi **âm** | Thấp nhưng rủi ro |

Việc số 7 nằm cuối danh sách là có chủ ý. Nó chỉ đúng khi bạn đã đo và biết chắc DB còn dư CPU/IO, và pool hiện tại thật sự nhỏ hơn công thức `(core × 2) + đĩa`.

## Cấu hình đầy đủ cho production

```yaml
spring:
  jpa:
    open-in-view: false
    properties:
      hibernate:
        jdbc.batch_size: 50
        order_inserts: true
        order_updates: true

  datasource:
    hikari:
      maximum-pool-size: 15          # theo công thức, chia cho số instance
      minimum-idle: 15               # = maximum: tránh tạo connection lúc cao điểm
      connection-timeout: 3000       # 3s: fail nhanh, đừng để user chờ 30s
      validation-timeout: 1000
      idle-timeout: 600000           # 10 phút
      max-lifetime: 1200000          # 20 phút — PHẢI nhỏ hơn timeout của DB/LB
      leak-detection-threshold: 20000
      pool-name: main-pool
```

Hai tham số dễ đặt sai:

**`minimum-idle` nên bằng `maximum-pool-size`.** Nếu để nhỏ hơn, lúc traffic tăng đột ngột HikariCP phải mở connection mới — mỗi cái tốn 20-50 ms, đúng lúc bạn cần tốc độ nhất. Pool cố định thì dự đoán được.

**`max-lifetime` phải nhỏ hơn thời gian timeout của mọi thứ nằm giữa app và DB**: `wait_timeout` của MySQL (mặc định 28800s), idle timeout của load balancer (AWS NLB: 350 giây!), firewall. Nếu để lớn hơn, HikariCP sẽ đưa cho bạn một connection đã bị bên kia đóng lặng lẽ → lỗi ngẫu nhiên `Connection reset` rất khó chẩn đoán.

### Pool riêng cho batch

```java
@Configuration
public class DataSourceConfig {

    @Bean @Primary
    @ConfigurationProperties("spring.datasource.hikari")
    public DataSource mainDataSource() {
        return DataSourceBuilder.create().type(HikariDataSource.class).build();
    }

    @Bean
    @ConfigurationProperties("app.datasource.batch.hikari")
    public DataSource batchDataSource() {
        return DataSourceBuilder.create().type(HikariDataSource.class).build();
    }
}
```

```yaml
app:
  datasource:
    batch:
      hikari:
        maximum-pool-size: 3         # batch chậm nhưng ít, chỉ cần 3
        connection-timeout: 30000    # batch chờ được lâu, không sao
        pool-name: batch-pool
```

Đây chính là **bulkhead áp dụng cho connection pool**: job báo cáo chạy 10 phút cũng không thể làm chết API bán hàng.

## PgBouncer — khi có quá nhiều instance

Khi bạn có 50 pod, mỗi pod pool 10 = 500 connection, PostgreSQL không chịu nổi (mỗi connection là một tiến trình OS). Giải pháp: **connection pooler tập trung**.

```text
   50 pod × 10 conn ──→ [PgBouncer] ──→ 20 conn thật ──→ PostgreSQL
        (500 "connection" ảo)              (rẻ, nhẹ)
```

```ini
[databases]
shop = host=postgres port=5432 dbname=shop

[pgbouncer]
pool_mode = transaction        # chế độ quan trọng nhất
max_client_conn = 1000         # app kết nối vào bao nhiêu cũng được
default_pool_size = 20         # nhưng chỉ 20 connection thật tới DB
```

Ba chế độ pool, khác nhau rất lớn:

| `pool_mode` | Connection thật được gán cho client trong bao lâu | Tiết kiệm | Hạn chế |
|---|---|---|---|
| `session` | Cả phiên kết nối | Ít | Gần như không lợi gì |
| `transaction` | Chỉ trong một transaction | **Nhiều** | Không dùng được prepared statement ở chế độ cũ, không dùng session variable, `LISTEN/NOTIFY`, advisory lock ở mức session |
| `statement` | Chỉ một câu lệnh | Nhiều nhất | Không dùng được transaction nhiều câu |

Thực tế gần như luôn chọn `transaction`. Với Java, cần tắt server-side prepared statement:

```yaml
spring.datasource.url: jdbc:postgresql://pgbouncer:6432/shop?prepareThreshold=0
```

(PgBouncer 1.21+ đã hỗ trợ prepared statement ở chế độ transaction, nhưng vẫn nên kiểm tra kỹ phiên bản đang dùng.)

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Tăng pool lên 100 "cho chắc" | DB context switch nhiều hơn, latency mỗi query tăng, thông lượng có thể **giảm** |
| Quên nhân pool với số instance | Chạm `max_connections`, không ai vào được DB kể cả admin |
| `max-lifetime` > idle timeout của LB | Lỗi `Connection reset` ngẫu nhiên, cực khó tìm |
| `connection-timeout: 30000` (mặc định) | User chờ 30 giây rồi mới nhận lỗi. Đặt 2-3 giây |
| Không bật leak detection | Rò rỉ âm thầm suốt nhiều tháng |
| Để `open-in-view: true` | Client mạng chậm cũng giữ connection DB |
| Dùng chung pool cho API và batch | Một job báo cáo giết cả hệ thống bán hàng |
| Nghĩ pool cạn = DB yếu | Thường DB đang rảnh 12% CPU; vấn đề nằm ở **thời gian giữ** |

## Khi nào tăng pool là ĐÚNG

Có, đôi khi tăng pool đúng thật. Điều kiện cần đủ:

1. `hikaricp_connections_pending` > 0 kéo dài, **và**
2. `hikaricp_connections_usage` p99 đã thấp (< 50 ms) — nghĩa là không ai giữ lâu, **và**
3. CPU và I/O của database còn dư (< 60%), **và**
4. Tổng pool của mọi instance vẫn dưới `max_connections` một khoảng an toàn.

Đủ cả 4 thì tăng. Thiếu một điều kiện thì tăng pool chỉ chuyển vấn đề xuống database.

## Tóm tắt case 2

- Mặc định Spring Boot: **200 thread nhưng chỉ 10 connection**. Tỉ lệ 20:1.
- `Thông lượng = pool_size / thời_gian_giữ_connection`. Câu hỏi đúng là **"vì sao giữ lâu?"**.
- Thủ phạm số một: **gọi HTTP bên trong `@Transactional`**.
- Thủ phạm số hai: **`open-in-view: true`** — giữ connection suốt cả request HTTP.
- Metric quyết định: `hikaricp.connections.usage` p99 và `hikaricp.connections.pending`.
- Bật `leak-detection-threshold` để nó chỉ thẳng dòng code có vấn đề.
- **Tách pool riêng cho batch** — bulkhead cho database.
- Tăng pool là **giải pháp cuối cùng**, chỉ đúng khi đủ 4 điều kiện.

**Bài kế tiếp** → [Case 3: Timeout mặc định là vô hạn — cái bẫy im lặng ở mọi client](03-case-thieu-timeout.md)
