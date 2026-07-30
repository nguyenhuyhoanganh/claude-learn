# Case 8: Đồng bộ hoá vô tình — cron, restart và những cơn sóng tự tạo

Hệ thống của bạn chịu được 5.000 RPS. Traffic trung bình chỉ 800 RPS. Vậy mà đúng đầu mỗi giờ, nó sập.

```text
   Traffic thực tế theo từng giây:

   RPS
   6000 │           █                  █                  █
        │           █                  █                  █
   3000 │           █                  █                  █
        │           █                  █                  █
    800 │███████████████████████████████████████████████████
        └────────────────────────────────────────────────────→
         14:00:00   15:00:00           16:00:00

   Trung bình: 800 RPS.  Đỉnh 1 giây: 6.000 RPS.
```

Nguyên nhân: hàng nghìn thứ khác nhau vô tình được lập lịch chạy **cùng một thời điểm**. Đây là **thundering herd** (đàn thú giẫm đạp) — và nó là một trong những vấn đề dễ sửa nhất nhưng khó nhìn ra nhất.

## Thuật ngữ cần nắm trước

| Thuật ngữ tiếng Anh | Tiếng Việt | Nghĩa |
|---|---|---|
| **Thundering herd** | Đàn thú giẫm đạp | Nhiều tiến trình cùng thức dậy và cùng làm một việc tại một thời điểm |
| **Jitter** | Nhiễu ngẫu nhiên | Cộng thêm một khoảng thời gian ngẫu nhiên để làm lệch thời điểm |
| **Synchronization** | Đồng bộ hoá | Ở đây nghĩa xấu: nhiều thứ vô tình rơi vào cùng nhịp |
| **Burst** | Đợt bùng phát | Lượng lớn request dồn trong thời gian rất ngắn |
| **Connection storm** | Bão kết nối | Rất nhiều kết nối được mở cùng lúc |
| **Cron** | Bộ lập lịch theo thời gian | Cơ chế chạy công việc theo lịch định sẵn |

Nhắc lại từ phase-1 bài 5: công thức Kingman cho biết thời gian chờ phụ thuộc vào **độ biến động** của luồng đến (`c²ₐ`) chứ không chỉ mức tải trung bình. Bài này chính là về việc giảm `c²ₐ`.

## Sáu nguồn đồng bộ hoá vô tình

### 1. Cron chạy đúng phút 0

```java
@Scheduled(cron = "0 0 * * * *")     // giây=0, phút=0, mọi giờ → đúng đầu mỗi giờ
public void syncData() { ... }
```

Nếu 500 khách hàng đều cài đặt lịch đồng bộ "mỗi giờ", và ai cũng chọn phút 0, thì đúng 14:00:00 có 500 request dồn vào.

**Vì sao ai cũng chọn phút 0?** Vì đó là lựa chọn tự nhiên nhất của con người. Không ai nghĩ "để tôi chọn phút 37 cho lệch với người khác".

### 2. Retry đồng loạt sau sự cố

```text
   14:00:00  Service downstream chết. 3.000 request cùng thất bại.
   14:00:01  Cả 3.000 cùng retry (backoff cố định 1 giây)
   14:00:03  Cả 3.000 cùng retry lần 2
   ⇒ Ba đợt sóng 3.000 request thay vì tải rải đều.
```

Đã nói ở phase-4 case 1. Giải pháp: **full jitter**.

### 3. Cache hết hạn đồng loạt

```text
   09:00  Deploy, warm-up cache: nạp 50.000 khoá, mỗi khoá TTL = 1 giờ
   10:00  50.000 khoá HẾT HẠN CÙNG MỘT GIÂY
   ⇒ Cache avalanche (phase-4 case 2)
```

### 4. Restart đồng loạt sau sự cố

```text
   Cụm Kubernetes gặp sự cố, 60 pod bị giết cùng lúc.
   60 pod khởi động lại đồng thời:
   ├─ 60 × 20 connection = 1.200 kết nối tới database CÙNG LÚC
   ├─ Database (max_connections = 200) từ chối phần lớn
   ├─ Pod thất bại khi khởi động → restart → thử lại
   └─ Vòng lặp không thoát ra được (metastable failure — phase-4 case 7)
```

Đây là **connection storm**, và nó là lý do rất nhiều sự cố không tự phục hồi sau khi khôi phục cụm.

### 5. Token hết hạn cùng lúc

```text
   JWT phát cho toàn bộ người dùng lúc deploy, TTL = 1 giờ
   ⇒ Một giờ sau, TOÀN BỘ người dùng cùng gọi API làm mới token
   ⇒ Auth service quá tải
```

### 6. Health check và metric scrape đồng bộ

```text
   Prometheus scrape mỗi 15 giây, đúng giây 0, 15, 30, 45.
   Với 500 target, tất cả bị hỏi cùng lúc.
   Nếu endpoint /metrics tốn tài nguyên (tính toán histogram),
   mỗi 15 giây có một đỉnh CPU.
```

## Giải pháp chung: thêm jitter

**Jitter** = cộng một lượng ngẫu nhiên vào thời điểm thực hiện, để các bên lệch nhau.

```text
   KHÔNG jitter: mọi client chạy tại t = 0
   ├──────────────────────────────────────────→
   ↑ 500 request cùng lúc

   CÓ jitter (rải trong 5 phút):
   ├─ ─ ─ ── ─ ─── ── ─ ─ ── ─── ─ ── ─ ─ ──→
     500 request rải đều trên 300 giây = 1,7 request/giây
```

Cải thiện: đỉnh giảm **300 lần** mà không cần thêm một máy nào.

### Jitter cho scheduled job

```java
@Component
public class JitteredScheduler {

    // Chạy mỗi giờ, nhưng LỆCH ngẫu nhiên 0-10 phút so với đầu giờ
    @Scheduled(cron = "0 0 * * * *")
    public void hourlySync() {
        // Sinh một độ trễ ngẫu nhiên từ 0 đến 600.000 ms (10 phút)
        long delayMs = ThreadLocalRandom.current().nextLong(0, 600_000);

        // Lên lịch chạy sau độ trễ đó, thay vì chạy ngay
        scheduler.schedule(this::doSync, delayMs, TimeUnit.MILLISECONDS);
    }

    private void doSync() { ... }
}
```

Cách gọn hơn — dùng `fixedDelay` thay vì `cron`:

```java
// fixedDelay: chờ N ms SAU KHI lần chạy trước KẾT THÚC rồi mới chạy tiếp.
// Vì thời gian chạy mỗi lần khác nhau, các instance tự nhiên lệch pha nhau.
// initialDelay: độ trễ trước lần chạy đầu tiên — đặt ngẫu nhiên để lệch ngay từ đầu.
@Scheduled(fixedDelay = 3_600_000, initialDelayString = "#{T(java.util.concurrent.ThreadLocalRandom).current().nextLong(0, 600000)}")
public void hourlySync() { ... }
```

> Phân biệt ba thuộc tính của `@Scheduled`:
> - **`fixedRate`**: chạy đúng mỗi N ms tính từ **lúc bắt đầu** lần trước → dễ đồng bộ hoá, và nếu lần trước chạy lâu hơn N thì các lần chạy chồng lên nhau.
> - **`fixedDelay`**: chờ N ms **sau khi lần trước kết thúc** → tự nhiên lệch pha, không bao giờ chồng nhau. **Thường là lựa chọn đúng.**
> - **`cron`**: chạy đúng thời điểm theo lịch → chính xác nhưng dễ gây đồng bộ hoá.

### Jitter cho TTL cache

```java
public void cacheProduct(Long id, Product product) {
    // TTL cơ sở: 5 phút = 300 giây
    long baseSeconds = 300;

    // Cộng thêm ngẫu nhiên -20% đến +20% (tức là ±60 giây)
    // → các khoá hết hạn rải đều trong khoảng 240-360 giây
    long jitterSeconds = ThreadLocalRandom.current().nextLong(-60, 61);

    redisTemplate.opsForValue()
        .set("product:" + id, product, Duration.ofSeconds(baseSeconds + jitterSeconds));
}
```

### Jitter cho retry (full jitter)

```java
/**
 * Tính thời gian chờ trước lần thử lại thứ `attempt`.
 * Công thức "full jitter" được AWS khuyến nghị:
 *     delay = random(0, base * 2^attempt)
 *
 * Khác với "exponential backoff" thuần (delay = base * 2^attempt),
 * full jitter rải các lần thử ra một khoảng thay vì dồn vào một điểm.
 */
public long fullJitterDelayMs(int attempt, long baseMs, long maxMs) {
    // base * 2^attempt — tăng theo cấp số nhân
    long exponential = Math.min(maxMs, baseMs * (1L << attempt));

    // Lấy ngẫu nhiên trong khoảng [0, exponential]
    return ThreadLocalRandom.current().nextLong(0, exponential + 1);
}
```

Với Spring Retry:

```yaml
resilience4j:
  retry:
    instances:
      paymentService:
        max-attempts: 3              # tổng số lần gọi (1 lần đầu + 2 lần thử lại)
        wait-duration: 200ms         # thời gian chờ cơ sở trước lần thử lại đầu tiên
        exponential-backoff-multiplier: 2   # mỗi lần chờ gấp đôi lần trước: 200ms → 400ms
        randomized-wait-factor: 0.5  # thêm nhiễu ±50% vào thời gian chờ
                                     # ví dụ 400ms → ngẫu nhiên trong [200ms, 600ms]
```

### Jitter cho khởi động (chống connection storm)

```java
@Component
public class StartupJitter {

    @EventListener(ApplicationReadyEvent.class)
    public void jitteredStartup() {
        // Khi 60 pod cùng khởi động sau sự cố, nếu tất cả cùng mở
        // connection pool ngay lập tức thì database bị dội 1.200 kết nối.
        // Chờ ngẫu nhiên 0-15 giây để rải ra.
        long delay = ThreadLocalRandom.current().nextLong(0, 15_000);
        log.info("Chờ {} ms trước khi khởi tạo connection pool", delay);
        Thread.sleep(delay);

        initializeConnectionPool();
    }
}
```

Cách tốt hơn — cấu hình pool để tự mở dần:

```yaml
spring:
  datasource:
    hikari:
      # minimum-idle: số connection TỐI THIỂU luôn giữ sẵn (kể cả lúc nhàn rỗi).
      # Đặt nhỏ hơn maximum-pool-size khi khởi động → pool mở dần theo nhu cầu,
      # thay vì mở đủ 20 connection ngay khi khởi động.
      minimum-idle: 2
      # maximum-pool-size: số connection tối đa pool được phép mở.
      maximum-pool-size: 20
      # initialization-fail-timeout: thời gian (ms) chờ mở được connection ĐẦU TIÊN
      # khi khởi động. Giá trị âm = không chặn khởi động dù chưa nối được database
      # → ứng dụng vẫn lên, tự kết nối lại sau. Tránh vòng lặp restart khi DB đang bận.
      initialization-fail-timeout: -1
```

> Lưu ý đánh đổi: `minimum-idle` nhỏ giúp khởi động êm, nhưng khi traffic tăng đột ngột thì phải mở connection mới (mỗi cái tốn 20-50 ms). Nếu hệ thống có đỉnh nhọn, hãy đặt `minimum-idle = maximum-pool-size` và giải quyết connection storm bằng jitter khởi động thay thế.

## Trường hợp thực tế: nền tảng IoT

Bối cảnh: 200.000 thiết bị IoT gửi dữ liệu định kỳ về máy chủ.

**Thiết kế ban đầu** (firmware của thiết bị):

```c
// Gửi dữ liệu mỗi 5 phút, đúng vào phút chia hết cho 5
while (1) {
    wait_until_next_5min_boundary();   // chờ tới 00, 05, 10, 15...
    send_telemetry();
}
```

**Hậu quả**:

```text
   Traffic theo từng giây:
   ├─ Giây 0 của mỗi phút chia hết cho 5: 200.000 request
   ├─ 299 giây còn lại: 0 request

   Trung bình: 667 RPS
   Đỉnh:       200.000 RPS  ← gấp 300 lần trung bình
```

Máy chủ phải được thiết kế cho 200.000 RPS trong khi thực tế chỉ cần 667 RPS — lãng phí khủng khiếp, và vẫn thường xuyên sập.

**Sửa** (firmware phiên bản mới):

```c
// Mỗi thiết bị chọn một "offset" cố định dựa trên ID của chính nó.
// Cùng một thiết bị luôn có offset giống nhau (dễ debug),
// nhưng các thiết bị khác nhau thì lệch nhau.
int offset_seconds = hash(device_id) % 300;   // 0-299 giây

while (1) {
    wait_until_next_5min_boundary();
    sleep(offset_seconds);              // lệch đi theo offset riêng
    send_telemetry();
}
```

**Kết quả**:

| Chỉ số | Trước | Sau |
|---|---|---|
| Đỉnh RPS | 200.000 | **710** |
| Số máy chủ cần | 40 | **3** |
| Chi phí hạ tầng | 100% | **8%** |
| Sự cố quá tải | 12 lần/tháng | **0** |

Giảm 92% chi phí hạ tầng chỉ bằng **một dòng code trong firmware**. Đây là ví dụ rõ ràng nhất cho thấy giảm biến động (`c²ₐ` trong công thức Kingman) hiệu quả ngang hoặc hơn việc thêm tài nguyên.

Chi tiết đáng học: dùng `hash(device_id)` thay vì `random()` để offset **ổn định qua các lần khởi động lại**. Nếu dùng random, mỗi lần thiết bị restart lại chọn offset mới — khó debug hơn, và một đợt restart hàng loạt vẫn có thể vô tình dồn cục.

## Chẩn đoán đồng bộ hoá vô tình

Vấn đề này **vô hình trên biểu đồ trung bình**. Phải nhìn ở độ phân giải nhỏ:

```promql
# SAI — trung bình 5 phút che mất mọi đỉnh nhọn
rate(http_requests_total[5m])

# ĐÚNG — độ phân giải 15 giây, thấy được đỉnh
rate(http_requests_total[15s])

# Tốt hơn nữa — tỉ lệ đỉnh trên trung bình.
# Giá trị > 3 nghĩa là traffic rất "cục", cần điều tra.
max_over_time(rate(http_requests_total[15s])[1h:15s])
  / avg_over_time(rate(http_requests_total[15s])[1h:15s])
```

Cách nhìn trực quan nhất: vẽ biểu đồ **request theo giây trong phút** (heatmap 60 cột) — nếu có cột nào cao vọt, bạn đã tìm ra.

```sql
-- Với log truy cập lưu trong database
SELECT EXTRACT(SECOND FROM request_time)::int AS giay_trong_phut,
       count(*) AS so_request
FROM access_log
WHERE request_time > now() - interval '1 hour'
GROUP BY 1
ORDER BY 2 DESC
LIMIT 10;
```

Nếu giây 0 có số request gấp 50 lần các giây khác — bạn có vấn đề đồng bộ hoá.

## Bảng tổng hợp: thêm jitter ở đâu

| Vị trí | Khoảng jitter khuyến nghị | Lý do |
|---|---|---|
| Cron job của client | 0 đến 1 chu kỳ (ví dụ 0-5 phút cho job 5 phút) | Rải đều toàn bộ chu kỳ |
| Retry | Full jitter: `random(0, base × 2^n)` | Chống sóng retry |
| TTL cache | ±10-20% giá trị TTL | Chống cache avalanche |
| Khởi động pod | 0-15 giây | Chống connection storm |
| Làm mới token | ±10% thời hạn | Rải tải lên auth service |
| Health check nội bộ | ±20% chu kỳ | Rải tải kiểm tra |
| Polling từ client | ±25% chu kỳ | Rải tải server |

Nguyên tắc chung: **khoảng jitter nên đủ lớn để rải đều, nhưng không lớn tới mức làm sai nghiệp vụ**. Job "chạy mỗi giờ" chạy lệch 10 phút thì không sao; job "chốt sổ lúc 0 giờ" thì phải chính xác.

## Các dạng đồng bộ hoá khác

### Nhịp cộng hưởng (resonance)

Hai chu kỳ khác nhau vẫn có thể trùng nhau định kỳ:

```text
   Job A chạy mỗi 3 phút:  0, 3, 6, 9, 12, 15, ...
   Job B chạy mỗi 5 phút:  0, 5, 10, 15, ...

   Trùng nhau tại: 0, 15, 30, 45 phút (bội chung nhỏ nhất của 3 và 5)
   ⇒ Cứ 15 phút một lần, cả hai job cùng chạy
```

Cách tránh: chọn chu kỳ là **số nguyên tố cùng nhau** hoặc thêm jitter.

### Đồng bộ hoá do GC

Nếu nhiều pod cùng khởi động lúc deploy, chúng cấp phát bộ nhớ với tốc độ tương tự và có thể **cùng chạy Full GC** tại các thời điểm gần nhau — tạo ra đỉnh latency đồng bộ toàn hệ thống (phase-6 case 1).

Jitter khởi động cũng giúp giảm hiện tượng này.

### Đồng bộ hoá do rate limiter cửa sổ cố định

```text
   Rate limit "100 request mỗi phút", reset vào đầu mỗi phút.
   Client thông minh sẽ chờ tới đầu phút để gửi burst 100 request.
   ⇒ Toàn bộ client dồn vào giây đầu tiên của mỗi phút.
```

Đây là lý do **sliding window** (cửa sổ trượt) tốt hơn **fixed window** (phase-4 case 4) — không có "mốc reset" để mọi người cùng chờ.

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Dùng `cron = "0 0 * * * *"` cho job không cần chính xác | Đồng bộ hoá với mọi hệ thống khác |
| Dùng `fixedRate` thay vì `fixedDelay` | Các instance giữ nhịp, không tự lệch |
| Retry với backoff cố định | Sóng retry đồng bộ |
| TTL cache giống hệt nhau | Cache avalanche |
| Không có jitter khi khởi động | Connection storm sau sự cố cụm |
| Dùng `random()` thay `hash(id)` cho offset thiết bị | Offset đổi mỗi lần restart, khó debug |
| Chỉ nhìn biểu đồ trung bình 5 phút | Không bao giờ thấy vấn đề |
| Chọn các chu kỳ là bội số của nhau | Cộng hưởng định kỳ |

## Tóm tắt case 8

- **Đồng bộ hoá vô tình** biến traffic trung bình 800 RPS thành đỉnh 6.000 RPS — hệ thống phải trả tiền cho đỉnh, không phải trung bình.
- Sáu nguồn: cron đúng phút 0, retry đồng loạt, TTL cache giống nhau, restart hàng loạt, token hết hạn cùng lúc, health check đồng bộ.
- Giải pháp duy nhất và cực rẻ: **thêm jitter** — rải ngẫu nhiên thời điểm thực hiện.
- Với `@Scheduled`, **`fixedDelay` tự nhiên chống đồng bộ hơn `fixedRate` và `cron`**.
- Dùng **`hash(id)` thay `random()`** cho offset cố định theo thiết bị — ổn định qua restart.
- Vấn đề **vô hình ở độ phân giải 5 phút** — phải nhìn ở 15 giây và xem tỉ lệ đỉnh/trung bình.
- Case thực tế: một dòng code jitter trong firmware giảm **92% chi phí hạ tầng**.

**Bài kế tiếp** → [Case 9: Thời gian — đồng hồ lệch, múi giờ và những lỗi khó tin](09-case-thoi-gian-dong-ho.md)
