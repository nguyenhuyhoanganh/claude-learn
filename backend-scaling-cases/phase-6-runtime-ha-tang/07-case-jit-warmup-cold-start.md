# Case 7: JIT warmup và cold start — vì sao pod mới luôn chậm

```text
   Deploy phiên bản mới lúc 14:00.

   14:00:00  Pod mới khởi động
   14:00:45  Pod báo ready, nhận traffic
   14:00:46  p99 latency: 4.800 ms   ← chậm gấp 60 lần!
   14:01:30  p99: 900 ms
   14:03:00  p99: 180 ms
   14:06:00  p99: 80 ms              ← cuối cùng cũng bình thường

   Trong 6 phút đó, người dùng gặp trải nghiệm rất tệ.
   Và nếu bạn deploy 20 pod theo kiểu rolling update — 6 phút × nhiều đợt.
```

Không có gì hỏng. Đây là **cold start** — trạng thái tự nhiên của một tiến trình JVM vừa khởi động. Bài này giải thích vì sao và cách giảm thiểu.

## Bốn nguyên nhân của cold start

### 1. JIT chưa biên dịch

**JIT (Just-In-Time compiler)** — JVM không biên dịch toàn bộ mã sang mã máy ngay từ đầu. Nó chạy **thông dịch** trước, đếm số lần thực thi, và chỉ biên dịch những phần "nóng".

```text
   Vòng đời một method trong JVM:

   Lần 1-200      : Thông dịch (interpreter)     — chậm nhất, ~20-50× so với native
   Lần 200-10.000 : Biên dịch bởi C1 (tầng 3)    — nhanh vừa, có thu thập thống kê
   Lần > 10.000   : Biên dịch bởi C2 (tầng 4)    — nhanh nhất, tối ưu tối đa
```

Ngưỡng mặc định: `-XX:CompileThreshold` khoảng 10.000 lần gọi cho C2 (với biên dịch phân tầng, ngưỡng thực tế phức tạp hơn).

```text
   Endpoint nhận 10 request/giây:
   ⇒ Cần ~17 phút để một method được gọi 10.000 lần
   ⇒ 17 phút đó, code chạy ở tốc độ dưới mức tối ưu
```

C2 còn làm những tối ưu chỉ có thể làm sau khi quan sát hành vi thực tế: **inline** method nhỏ, loại bỏ nhánh không bao giờ chạy, loại bỏ kiểm tra biên mảng, **escape analysis** (cấp phát object trên stack thay vì heap). Những tối ưu này cần dữ liệu thống kê, nên không thể làm ngay từ đầu.

Chênh lệch tốc độ giữa thông dịch và C2 thường là **20-50 lần**.

### 2. Class chưa được nạp

Java nạp class **lười biếng** — chỉ khi lần đầu dùng tới.

```text
   Một ứng dụng Spring Boot điển hình nạp 10.000-20.000 class.
   Mỗi lần nạp: đọc file, phân tích bytecode, xác minh, liên kết.

   ⇒ Request đầu tiên tới một endpoint phải nạp hàng trăm class.
```

Đây là lý do request đầu tiên luôn chậm hơn hẳn các request sau, kể cả khi JIT không phải vấn đề.

### 3. Cache và pool còn trống

```text
   ├─ Connection pool: HikariCP mở connection dần → mỗi query đầu tốn 20-50 ms
   ├─ Cache ứng dụng: trống → mọi request xuống database
   ├─ Cache của hệ điều hành: trống → đọc file từ đĩa thật
   └─ Cache của database: buffer pool chưa có dữ liệu nóng
```

### 4. Bộ nhớ chưa được cấp phát thật

JVM xin bộ nhớ từ hệ điều hành nhưng hệ điều hành chỉ **hứa** — trang bộ nhớ thật chỉ được cấp khi lần đầu chạm tới (**lazy allocation**). Mỗi lần chạm trang mới gây một **page fault** nhẹ.

```bash
-XX:+AlwaysPreTouch      # chạm mọi trang heap ngay khi khởi động
```

Đánh đổi: thời gian khởi động tăng (vài giây với heap lớn), nhưng latency sau đó ổn định hơn. Đáng dùng cho dịch vụ nhạy latency.

## Đo cold start

```java
@Component
public class WarmupMetrics {
    private final long startTime = System.currentTimeMillis();

    @EventListener(ApplicationReadyEvent.class)
    public void onReady() {
        log.info("Khởi động xong sau {} ms", System.currentTimeMillis() - startTime);
    }
}
```

```promql
# So latency của pod mới với pod cũ
histogram_quantile(0.99,
  rate(http_server_requests_seconds_bucket[1m])) by (pod)
```

Xem JIT đang làm gì:

```bash
java -XX:+PrintCompilation -jar app.jar | head -50
```

```text
    142   45       3       com.shop.OrderService::calculate (87 bytes)
    198   67       4       com.shop.OrderService::calculate (87 bytes)
     ↑    ↑        ↑
   thời  id     tầng biên dịch (3 = C1, 4 = C2)
   gian
```

```bash
# Thống kê tổng quan
java -XX:+UnlockDiagnosticVMOptions -XX:+PrintCompilationStatistics -jar app.jar
```

## Sáu cách giảm cold start

### 1. Warm-up chủ động trước khi nhận traffic

```java
@Component
public class WarmUpService {
    private volatile boolean ready = false;

    @EventListener(ApplicationReadyEvent.class)
    public void warmUp() {
        long start = System.currentTimeMillis();

        // Làm nóng connection pool — mở đủ số connection tối thiểu
        for (int i = 0; i < poolSize; i++) {
            jdbcTemplate.queryForObject("SELECT 1", Integer.class);
        }

        // Làm nóng JIT: chạy các đường dẫn nóng nhiều lần
        Order sample = buildSampleOrder();
        for (int i = 0; i < 20_000; i++) {
            orderService.calculatePrice(sample);
            orderMapper.toDto(sample);
            validator.validate(sample);
        }

        // Làm nóng serializer JSON (Jackson tạo bộ ánh xạ lười)
        for (int i = 0; i < 5_000; i++) {
            objectMapper.writeValueAsString(sample);
        }

        // Nạp trước cache khoá nóng
        cacheWarmer.loadTopProducts(500);

        ready = true;
        log.info("Warm-up xong sau {} ms", System.currentTimeMillis() - start);
    }

    public boolean isReady() { return ready; }
}
```

Readiness probe trả `503` cho tới khi `ready = true` (phase-4 case 6).

Con số 20.000 lần lặp không ngẫu nhiên — nó vượt ngưỡng để C2 biên dịch. Ít hơn thì chỉ đạt tới C1.

**Cách tốt hơn — dùng chính request thật**: ghi lại một tập request đại diện từ production, phát lại chúng vào pod mới lúc warm-up. Cách này làm nóng đúng những đường dẫn thật sự được dùng, thay vì đoán.

### 2. Tăng traffic từ từ (slow start)

```yaml
# Istio
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
spec:
  trafficPolicy:
    loadBalancer:
      warmupDurationSecs: 90
```

```json
// AWS ALB Target Group
{ "slow_start.duration_seconds": "120" }
```

Load balancer tăng dần tỉ trọng traffic cho instance mới thay vì dồn ngay 1/N.

Đây là biện pháp rẻ nhất và hiệu quả nhất — chỉ một dòng cấu hình.

### 3. AppCDS — chia sẻ dữ liệu class

**CDS (Class Data Sharing)** lưu trạng thái đã phân tích của class vào một file, JVM nạp trực tiếp thay vì phân tích lại.

```bash
# Bước 1: ghi lại danh sách class được dùng
java -XX:ArchiveClassesAtExit=app.jsa -jar app.jar
# (chạy ứng dụng, thực hiện một số thao tác tiêu biểu, rồi thoát)

# Bước 2: dùng archive
java -XX:SharedArchiveFile=app.jsa -jar app.jar
```

Kết quả điển hình: **giảm 20-40% thời gian khởi động**. Với ứng dụng Spring Boot khởi động 45 giây, tiết kiệm được 10-18 giây.

Từ JDK 19+, có chế độ tự động:

```bash
java -XX:+AutoCreateSharedArchive -XX:SharedArchiveFile=app.jsa -jar app.jar
```

### 4. CRaC — chụp và khôi phục trạng thái

**CRaC (Coordinated Restore at Checkpoint)** chụp toàn bộ trạng thái tiến trình JVM (đã warm-up đầy đủ) và khôi phục lại tức thì.

```bash
# Chụp sau khi đã warm-up
jcmd <pid> JDK.checkpoint

# Khôi phục
java -XX:CRaCRestoreFrom=/path/to/checkpoint
```

```text
   Khởi động thường : 45 giây + 6 phút warm-up
   Khôi phục CRaC   : ~100 mili-giây, ĐÃ warm-up sẵn
```

Spring Boot 3.2+ hỗ trợ CRaC qua `spring-context-indexer` và các lifecycle hook.

Hạn chế phải biết:

| Hạn chế | Chi tiết |
|---|---|
| Kết nối mạng | Phải đóng trước checkpoint, mở lại sau restore |
| File descriptor | Tương tự |
| Thời gian | Ứng dụng "tỉnh dậy" ở thời điểm khác — timer, cache TTL cần xử lý |
| Bảo mật | Checkpoint chứa toàn bộ bộ nhớ, kể cả secret |
| Nền tảng | Cần Linux với CRIU |

Với các framework hỗ trợ sẵn (Spring Boot), phần lớn việc đóng/mở kết nối được xử lý tự động qua interface `Resource` của CRaC.

### 5. GraalVM Native Image — biên dịch trước hoàn toàn

```bash
./mvnw -Pnative native:compile
./target/myapp
```

```text
   JVM thường     : khởi động 45 giây, RAM 800 MB, cần warm-up
   Native image   : khởi động 0,05 giây, RAM 120 MB, KHÔNG cần warm-up
```

Đánh đổi rất thực:

| Được | Mất |
|---|---|
| Khởi động ~50 ms | **Thông lượng đỉnh thấp hơn 10-30%** (không có JIT thích ứng) |
| RAM giảm 5-7 lần | Thời gian build 5-15 phút |
| Không cần warm-up | Reflection/proxy động cần khai báo trước |
| Bề mặt tấn công nhỏ hơn | Một số thư viện chưa tương thích |
| Không có GC pause dài (heap nhỏ) | Debug và profiling khó hơn |

**Khi nào native image đáng dùng**: hàm serverless, CLI, sidecar, dịch vụ scale lên xuống liên tục.
**Khi nào không**: dịch vụ chạy liên tục cần thông lượng cao — JIT sau khi warm-up **nhanh hơn** native image.

Điểm này quan trọng và hay bị hiểu sai: **native image nhanh khi khởi động, nhưng chậm hơn khi đã chạy ổn định.** JIT có lợi thế là biết được hành vi thực tế của chương trình (nhánh nào hay chạy, kiểu nào hay xuất hiện) và tối ưu theo đó — điều mà biên dịch tĩnh không làm được.

### 6. Chiến lược deploy giảm tác động

```yaml
# Rolling update chậm hơn, ít pod mới cùng lúc
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1              # chỉ thêm 1 pod mới mỗi lần
      maxUnavailable: 0        # không giảm số pod đang phục vụ
  minReadySeconds: 60          # chờ 60 giây sau khi ready mới coi là ổn
```

`minReadySeconds` quan trọng: nó buộc Kubernetes chờ pod mới ổn định trước khi tiếp tục thay pod tiếp theo. Không có nó, 20 pod có thể được thay trong 2 phút và toàn bộ đều đang cold.

Với hệ thống lớn, cân nhắc **canary deployment**: đưa 5% traffic vào phiên bản mới, theo dõi 15 phút, rồi mới tăng dần.

## Trường hợp thực tế: deploy giờ cao điểm

Bối cảnh: dịch vụ API, 30 pod, deploy 2-3 lần mỗi ngày.

**Vấn đề đo được**:

```text
   Mỗi lần deploy:
   ├─ p99 toàn hệ thống tăng từ 90 ms lên 1.800 ms trong 12 phút
   ├─ Tỉ lệ lỗi tăng từ 0,02% lên 1,4%
   └─ Đội buộc phải deploy lúc 2 giờ sáng
```

**Các biện pháp và kết quả**:

| Bước | Biện pháp | p99 lúc deploy | Thời gian ảnh hưởng |
|---|---|---|---|
| 0 | Ban đầu | 1.800 ms | 12 phút |
| 1 | `minReadySeconds: 60`, `maxSurge: 1` | 900 ms | 25 phút (lâu hơn nhưng nhẹ hơn) |
| 2 | Warm-up chủ động trước khi ready | 420 ms | 22 phút |
| 3 | Slow start ở load balancer (90 giây) | 180 ms | 22 phút |
| 4 | AppCDS | 165 ms | 18 phút |
| 5 | Phát lại request thật lúc warm-up | **110 ms** | 16 phút |

**Kết quả cuối**: p99 lúc deploy chỉ tăng từ 90 lên 110 ms — người dùng không nhận ra. Đội chuyển sang deploy giữa ban ngày.

Nhận xét: bước 1 làm **kéo dài** thời gian deploy nhưng **giảm mạnh** mức độ ảnh hưởng. Đây là đánh đổi đúng — không ai quan tâm deploy mất 25 phút thay vì 12, nhưng ai cũng quan tâm latency tăng 20 lần.

Bước 5 (phát lại request thật) cho cải thiện đáng kể so với warm-up bằng dữ liệu giả, vì nó làm nóng đúng những đường dẫn code thật sự được dùng.

## Cold start trong serverless

Với AWS Lambda / Cloud Run, vấn đề còn nghiêm trọng hơn vì instance bị **tắt hẳn** khi không có traffic:

```text
   Java trên Lambda:
   ├─ Cold start: 3-8 giây
   ├─ Warm start: 20-50 ms
   └─ Instance bị tắt sau ~15 phút không dùng
```

Giải pháp:

| Cách | Hiệu quả |
|---|---|
| **GraalVM Native Image** | Cold start 3-8 giây → 100-300 ms |
| **SnapStart** (AWS Lambda cho Java) | Chụp trạng thái sau init, khôi phục nhanh |
| **Provisioned concurrency** | Giữ sẵn N instance ấm (tốn tiền) |
| **Ping định kỳ** | Giữ instance sống (không đáng tin cậy) |
| Giảm số dependency | Ít class hơn = khởi động nhanh hơn |

Với Java trên serverless, **native image hoặc SnapStart gần như là bắt buộc** — cold start 8 giây là không chấp nhận được với API đồng bộ.

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Không có warm-up, nhận full traffic ngay | Latency tăng 20-60 lần |
| Warm-up không đủ vòng lặp (< 10.000) | Chỉ đạt tới C1, không tới C2 |
| Không có `minReadySeconds` | Thay toàn bộ pod trong vài phút, tất cả đều cold |
| Không có slow start ở LB | Pod mới nhận ngay 1/N traffic |
| Benchmark không bỏ qua giai đoạn warm-up | Kết quả sai hoàn toàn |
| Dùng native image cho dịch vụ cần thông lượng cao | Chậm hơn JIT sau khi warm-up |
| Warm-up bằng dữ liệu không giống thật | Làm nóng nhầm đường dẫn code |
| Deploy nhiều pod cùng lúc lúc cao điểm | Đỉnh latency lớn |

Bẫy về benchmark đáng nhắc lại (phase-1 bài 3): nếu bạn chạy JMH hoặc bất kỳ benchmark nào mà không có giai đoạn warm-up, kết quả đo được là tốc độ của **interpreter**, không phải tốc độ thật của ứng dụng. Chênh lệch có thể tới 50 lần.

## Tóm tắt case 7

- Cold start có **4 nguyên nhân**: JIT chưa biên dịch, class chưa nạp, cache/pool trống, bộ nhớ chưa cấp phát thật.
- JIT cần **~10.000 lần gọi** để đạt tầng C2; chênh lệch tốc độ với thông dịch là **20-50 lần**.
- **Warm-up chủ động trước khi báo ready** — và dùng đủ số vòng lặp để vượt ngưỡng C2.
- **Slow start ở load balancer** là biện pháp rẻ nhất, hiệu quả nhất.
- **AppCDS** giảm 20-40% thời gian khởi động với chi phí gần bằng 0.
- **CRaC** khôi phục trạng thái đã warm-up trong ~100 ms; **native image** khởi động 50 ms nhưng **thông lượng đỉnh thấp hơn 10-30%**.
- `minReadySeconds` + `maxSurge: 1` làm deploy lâu hơn nhưng **nhẹ hơn nhiều** — đánh đổi đúng.
- Warm-up bằng **request thật ghi lại từ production** hiệu quả hơn dữ liệu giả.

**Bài kế tiếp** → [Case 8: Đồng bộ hoá vô tình — cron, restart và những cơn sóng tự tạo](08-case-dong-bo-hoa-vo-tinh.md)
