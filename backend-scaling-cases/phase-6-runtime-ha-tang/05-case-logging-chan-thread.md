# Case 5: Logging chặn thread — khi việc ghi log giết hệ thống

Log là thứ giúp bạn chẩn đoán sự cố. Nó cũng có thể **là** sự cố.

```text
   03:00  Đội vận hành bật log DEBUG để điều tra một lỗi.
   03:02  Latency p99 từ 80 ms lên 1.400 ms.
   03:05  Đĩa đầy 100%. Ứng dụng không ghi được gì nữa.
   03:06  Database trên cùng máy cũng không ghi được → dừng nhận ghi.
   03:08  Toàn bộ hệ thống sập.

   Nguyên nhân: bật log DEBUG.
```

Bài này liệt kê các cách logging phá hệ thống, và cách cấu hình cho đúng.

## Vấn đề 1: Ghi log đồng bộ chặn thread

Mặc định của Logback `FileAppender`:

```java
// Bên trong OutputStreamAppender
protected void writeOut(E event) throws IOException {
    lock.lock();                 // ← MỌI thread xếp hàng ở đây
    try {
        this.encoder.encode(event);
        outputStream.write(...);
        if (immediateFlush) outputStream.flush();   // ← gọi xuống hệ điều hành
    } finally {
        lock.unlock();
    }
}
```

Hai vấn đề chồng lên nhau:

1. **Khoá dùng chung** — 200 thread giành nhau một khoá (phase-2 case 6).
2. **Ghi đĩa đồng bộ** — mỗi lần ghi là một syscall, có thể chặn nếu đĩa bận.

```text
   Ghi một dòng log vào SSD cục bộ  : ~10-50 micro-giây
   Ghi vào network storage (EFS/NFS): ~1-10 MILI-giây
   Ghi khi đĩa đang bận             : có thể vài trăm mili-giây

   Với 5 dòng log mỗi request và 1.000 request/giây:
   5.000 lần ghi/giây × 1 ms = 5 giây CPU-time mỗi giây
   ⇒ Không thể theo kịp. Thread xếp hàng.
```

### Cách sửa: AsyncAppender

```xml
<configuration>
  <appender name="FILE" class="ch.qos.logback.core.rolling.RollingFileAppender">
    <file>/var/log/app/app.log</file>
    <rollingPolicy class="ch.qos.logback.core.rolling.SizeAndTimeBasedRollingPolicy">
      <fileNamePattern>/var/log/app/app-%d{yyyy-MM-dd}.%i.log.gz</fileNamePattern>
      <maxFileSize>100MB</maxFileSize>
      <maxHistory>7</maxHistory>
      <totalSizeCap>3GB</totalSizeCap>          <!-- TRẦN CỨNG cho dung lượng -->
    </rollingPolicy>
    <encoder>
      <pattern>%d{HH:mm:ss.SSS} [%thread] %-5level %logger{36} - %msg%n</pattern>
      <immediateFlush>false</immediateFlush>     <!-- gom lô, không flush mỗi dòng -->
    </encoder>
  </appender>

  <appender name="ASYNC" class="ch.qos.logback.classic.AsyncAppender">
    <queueSize>8192</queueSize>
    <discardingThreshold>0</discardingThreshold>  <!-- 0 = không bỏ WARN/ERROR -->
    <neverBlock>true</neverBlock>                 <!-- hàng đầy thì BỎ, không chặn -->
    <includeCallerData>false</includeCallerData>  <!-- true làm chậm 10-100 lần! -->
    <appender-ref ref="FILE"/>
  </appender>

  <root level="INFO">
    <appender-ref ref="ASYNC"/>
  </root>
</configuration>
```

Bốn tham số quyết định:

| Tham số | Vì sao quan trọng |
|---|---|
| **`neverBlock=true`** | Hàng đợi đầy thì **bỏ log**, không chặn thread ứng dụng. Mất vài dòng log tốt hơn treo cả hệ thống |
| **`discardingThreshold=0`** | Mặc định là 20% — nghĩa là khi hàng còn 20% chỗ, Logback **bỏ mọi log mức TRACE/DEBUG/INFO**. Đặt 0 để giữ tất cả (kết hợp với `neverBlock`) |
| **`includeCallerData=false`** | `true` khiến mỗi dòng log phải tạo stack trace để lấy tên class/dòng — **chậm gấp 10-100 lần** |
| **`immediateFlush=false`** | Gom lô ghi đĩa thay vì flush từng dòng |

> `includeCallerData` đáng cảnh báo riêng: nếu pattern log của bạn có `%class`, `%method`, `%line`, hoặc `%F`, Logback **buộc phải** lấy caller data — và với AsyncAppender, thông tin đó phải được lấy ở thread ứng dụng (đắt) chứ không phải thread ghi log. Tránh dùng các pattern này trong production.

### Log4j2 với Disruptor — nhanh nhất

```xml
<Configuration>
  <Appenders>
    <RollingFile name="File" fileName="/var/log/app/app.log">
      <PatternLayout pattern="%d{HH:mm:ss.SSS} [%t] %-5level %logger{36} - %msg%n"/>
      <Policies>
        <SizeBasedTriggeringPolicy size="100 MB"/>
      </Policies>
      <DefaultRolloverStrategy max="10"/>
    </RollingFile>
  </Appenders>
  <Loggers>
    <AsyncRoot level="INFO">
      <AppenderRef ref="File"/>
    </AsyncRoot>
  </Loggers>
</Configuration>
```

```bash
# Bật async logger toàn cục (dùng LMAX Disruptor)
-Dlog4j2.contextSelector=org.apache.logging.log4j.core.async.AsyncLoggerContextSelector
```

Log4j2 async dùng vòng đệm không khoá (lock-free ring buffer), nhanh hơn `AsyncAppender` của Logback đáng kể ở tải cao — thường gấp 5-10 lần về thông lượng.

## Vấn đề 2: Log ra mạng

```xml
<!-- NGUY HIỂM: gửi log trực tiếp sang Logstash -->
<appender name="LOGSTASH" class="net.logstash.logback.appender.LogstashTcpSocketAppender">
  <destination>logstash:5000</destination>
</appender>
```

Nếu Logstash chậm hoặc chết:

```text
   ├─ Ghi log chặn → thread ứng dụng chặn
   ├─ Bộ đệm đầy → hoặc chặn, hoặc mất log
   └─ Toàn bộ ứng dụng chậm theo tốc độ của hệ thống log
```

**Nguyên tắc: ứng dụng không bao giờ được gửi log trực tiếp qua mạng.**

Cách đúng — dùng mẫu sidecar/agent:

```text
   [App] → ghi ra stdout hoặc file cục bộ (nhanh, không chặn)
              ↓
   [Agent: Fluent Bit / Vector / Promtail] → đọc file, gửi đi
              ↓
   [Elasticsearch / Loki / CloudWatch]

   ⇒ Nếu hệ thống log chết, agent buffer hoặc bỏ.
     ỨNG DỤNG KHÔNG BỊ ẢNH HƯỞNG.
```

Trong Kubernetes, cách chuẩn là ghi ra **stdout/stderr**, và một DaemonSet thu thập từ `/var/log/containers/`. Đơn giản, không có phụ thuộc nào từ phía ứng dụng.

Nhưng cẩn thận: ghi stdout cũng có thể chặn nếu bộ đệm của container runtime đầy. Với hệ thống ghi log cực nhiều, vẫn nên dùng async appender.

## Vấn đề 3: Đầy đĩa

```text
   Đĩa đầy → không ghi được gì → và nếu database ở cùng volume,
   database cũng dừng ghi → toàn hệ thống sập.
```

Đây là kịch bản sập nghiêm trọng và hoàn toàn phòng tránh được:

```xml
<rollingPolicy class="ch.qos.logback.core.rolling.SizeAndTimeBasedRollingPolicy">
  <fileNamePattern>app-%d{yyyy-MM-dd}.%i.log.gz</fileNamePattern>
  <maxFileSize>100MB</maxFileSize>
  <maxHistory>7</maxHistory>
  <totalSizeCap>3GB</totalSizeCap>      <!-- BẮT BUỘC có -->
</rollingPolicy>
```

`totalSizeCap` là trần cứng — Logback tự xoá file cũ khi vượt. Không có nó, một đợt log bùng nổ có thể lấp đầy đĩa trong vài phút.

Trong Kubernetes:

```yaml
volumes:
  - name: logs
    emptyDir:
      sizeLimit: 2Gi          # Kubernetes tự đuổi pod nếu vượt
```

Và luôn giám sát:

```promql
(node_filesystem_avail_bytes / node_filesystem_size_bytes) < 0.15
```

## Vấn đề 4: Bùng nổ log khi có sự cố

Đây là hiệu ứng phản hồi dương nguy hiểm:

```text
   Hệ thống bắt đầu lỗi
        ↓
   Mỗi lỗi ghi một stack trace (2-5 KB)
        ↓
   10.000 lỗi/giây × 3 KB = 30 MB/giây log
        ↓
   Ghi log chặn thread → hệ thống chậm hơn → nhiều lỗi hơn
        ↓
   Đĩa đầy trong 2 phút
```

Log biến một sự cố nhỏ thành sự cố lớn — giống hệt retry storm (phase-4 case 1).

### Giải pháp: giới hạn tần suất log

```java
@Component
public class RateLimitedLogger {
    private final Cache<String, Boolean> recentLogs = Caffeine.newBuilder()
        .expireAfterWrite(Duration.ofSeconds(10))
        .maximumSize(1000)
        .build();

    private final ConcurrentHashMap<String, LongAdder> suppressed = new ConcurrentHashMap<>();

    public void error(String key, String message, Throwable t) {
        if (recentLogs.getIfPresent(key) == null) {
            recentLogs.put(key, true);
            long count = suppressed.getOrDefault(key, new LongAdder()).sumThenReset();
            if (count > 0) {
                log.error("{} (đã bỏ qua {} lần tương tự trong 10 giây)", message, count, t);
            } else {
                log.error(message, t);
            }
        } else {
            suppressed.computeIfAbsent(key, k -> new LongAdder()).increment();
        }
    }
}
```

```java
// Dùng
rateLimitedLogger.error("payment-timeout", "Timeout khi gọi payment-service", e);
```

Kết quả: thay vì 10.000 dòng giống hệt nhau, bạn có 1 dòng mỗi 10 giây kèm số lần bị bỏ qua — **dễ đọc hơn và không giết hệ thống**.

Logback cũng có `DuplicateMessageFilter` sẵn nhưng kém linh hoạt hơn.

### Đừng log stack trace cho lỗi dự kiến

```java
// SAI — timeout là chuyện bình thường, không cần stack trace
catch (TimeoutException e) {
    log.error("Timeout khi gọi service", e);      // 3 KB mỗi lần
}

// ĐÚNG
catch (TimeoutException e) {
    log.warn("Timeout khi gọi {} sau {}ms", serviceName, timeout);   // 80 byte
    timeoutCounter.increment();                                       // metric mới là thứ cần
}
```

Nguyên tắc: **stack trace chỉ dành cho lỗi bạn không lường trước**. Lỗi đã lường trước (timeout, validation, not found) chỉ cần một dòng ngắn — và quan trọng hơn là một **metric**.

## Vấn đề 5: Log ở mức sai

```java
@GetMapping("/products/{id}")
public Product get(@PathVariable Long id) {
    log.info("Nhận request lấy sản phẩm id={}", id);       // ← INFO cho MỌI request?
    Product p = service.get(id);
    log.info("Trả về sản phẩm: {}", p);                     // ← log cả object!
    return p;
}
```

Với 10.000 RPS, đây là 20.000 dòng log mỗi giây — và dòng thứ hai còn serialize cả object.

Hướng dẫn chọn mức log:

| Mức | Dùng cho | Tần suất chấp nhận được |
|---|---|---|
| `ERROR` | Lỗi cần con người xử lý | Hiếm |
| `WARN` | Bất thường nhưng tự xử lý được | Thỉnh thoảng |
| `INFO` | Sự kiện nghiệp vụ quan trọng | Vài dòng mỗi request nghiệp vụ |
| `DEBUG` | Chi tiết để chẩn đoán | **Tắt ở production** |
| `TRACE` | Rất chi tiết | Chỉ khi cần, trong thời gian ngắn |

Và luôn bảo vệ các lời gọi log tốn kém:

```java
// Nếu tham số tốn kém để tính
if (log.isDebugEnabled()) {
    log.debug("Trạng thái chi tiết: {}", expensiveToString());
}
```

Với log có tham số (`{}`), việc kiểm tra `isDebugEnabled()` thường không cần thiết — trừ khi việc **tính tham số** tốn kém.

## Bật DEBUG an toàn ở production

Đôi khi bạn thật sự cần DEBUG để điều tra. Cách làm an toàn:

**1. Chỉ bật cho một logger cụ thể, qua Actuator:**

```bash
curl -X POST http://app:8080/actuator/loggers/com.shop.payment \
  -H "Content-Type: application/json" \
  -d '{"configuredLevel":"DEBUG"}'
```

Không cần restart, và chỉ ảnh hưởng package đó.

**2. Chỉ bật trên một instance:**

Nếu có 20 pod, bật DEBUG trên một pod duy nhất — bạn vẫn thu được thông tin mà chỉ 5% traffic bị ảnh hưởng.

**3. Đặt hẹn giờ tắt:**

```java
@Component
public class TemporaryDebugLogger {
    @Scheduled(fixedDelay = 60_000)
    public void resetDebugLevels() {
        LoggerContext ctx = (LoggerContext) LoggerFactory.getILoggerFactory();
        ctx.getLoggerList().stream()
            .filter(l -> l.getLevel() == Level.DEBUG || l.getLevel() == Level.TRACE)
            .filter(l -> !whitelist.contains(l.getName()))
            .forEach(l -> {
                log.warn("Tự động tắt DEBUG cho {}", l.getName());
                l.setLevel(null);       // quay về mức kế thừa
            });
    }
}
```

Cơ chế này cứu bạn khỏi kịch bản kinh điển: ai đó bật DEBUG lúc 3 giờ sáng, quên tắt, và hệ thống chết vào giờ cao điểm hôm sau.

**4. Log lấy mẫu:**

```java
if (ThreadLocalRandom.current().nextInt(100) == 0) {     // 1% request
    log.debug("Chi tiết đầy đủ: {}", detail);
}
```

Với 10.000 RPS, 1% vẫn là 100 mẫu mỗi giây — thừa đủ để chẩn đoán.

## Log có cấu trúc và trace ID

Với hệ nhiều service, log dạng văn bản thuần gần như vô dụng. Dùng log có cấu trúc (JSON) kèm trace ID:

```xml
<appender name="JSON" class="ch.qos.logback.core.rolling.RollingFileAppender">
  <encoder class="net.logstash.logback.encoder.LogstashEncoder">
    <includeMdcKeyName>traceId</includeMdcKeyName>
    <includeMdcKeyName>spanId</includeMdcKeyName>
    <includeMdcKeyName>userId</includeMdcKeyName>
  </encoder>
</appender>
```

```java
@Component
public class TraceIdFilter extends OncePerRequestFilter {
    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res,
                                    FilterChain chain) throws IOException, ServletException {
        String traceId = req.getHeader("X-Trace-Id");
        if (traceId == null) traceId = UUID.randomUUID().toString();
        MDC.put("traceId", traceId);
        res.setHeader("X-Trace-Id", traceId);
        try {
            chain.doFilter(req, res);
        } finally {
            MDC.clear();          // BẮT BUỘC — nếu không sẽ rò rỉ (phase-2 case 7)
        }
    }
}
```

Nhớ truyền `traceId` sang mọi lời gọi downstream và sang mọi thread pool (`TaskDecorator` — phase-2 case 5). Spring Boot 3 với Micrometer Tracing làm việc này tự động.

## Trường hợp thực tế: bật DEBUG làm sập hệ thống

Bối cảnh: dịch vụ xử lý thanh toán, 3.000 RPS.

**Diễn biến**:

```text
   02:00  Kỹ sư bật DEBUG cho toàn bộ com.shop để điều tra một lỗi hiếm.
   02:01  Số dòng log: 400/giây → 87.000/giây
   02:02  Ghi log đồng bộ (không có AsyncAppender) → thread bắt đầu xếp hàng
   02:03  p99: 60 ms → 3.200 ms
   02:04  Volume log (20 GB) đầy
   02:05  Ứng dụng ném IOException khi ghi log → mỗi exception lại ghi thêm log
   02:06  Sập hoàn toàn
```

Chi tiết đáng chú ý ở phút 02:05: **lỗi khi ghi log sinh ra thêm log**. Đây là vòng lặp phản hồi dương ở dạng thuần khiết nhất.

**Các biện pháp sau sự cố**:

| Biện pháp | Tác dụng |
|---|---|
| Chuyển sang `AsyncAppender` + `neverBlock=true` | Ghi log không bao giờ chặn thread |
| `totalSizeCap: 3GB` | Không bao giờ đầy đĩa |
| Tự động tắt DEBUG sau 15 phút | Không quên tắt |
| Chỉ bật DEBUG qua Actuator cho từng package | Phạm vi hẹp |
| Rate-limited logger cho lỗi lặp | Không bùng nổ khi sự cố |
| Cảnh báo tốc độ ghi log | Phát hiện sớm |
| Bỏ stack trace cho timeout, chuyển sang metric | Giảm 60% dung lượng log |

```promql
# Cảnh báo bùng nổ log
rate(logback_events_total[1m]) > 5000
```

**Kết quả**: lần sau khi ai đó bật DEBUG toàn cục, latency tăng từ 60 lên 75 ms (do CPU serialize log) và tự tắt sau 15 phút. Không có sự cố.

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Ghi log đồng bộ | Thread xếp hàng, latency tăng |
| `neverBlock=false` (mặc định) | Hàng đầy thì chặn thread ứng dụng |
| `discardingThreshold` mặc định 20% | Âm thầm mất log INFO khi tải cao |
| `includeCallerData=true` hoặc pattern có `%line` | Chậm 10-100 lần |
| Gửi log trực tiếp sang mạng | Hệ thống log chết kéo theo ứng dụng |
| Không có `totalSizeCap` | Đầy đĩa |
| Log stack trace cho lỗi dự kiến | Bùng nổ dung lượng khi sự cố |
| Bật DEBUG toàn cục ở production | Sập hệ thống |
| Quên tắt DEBUG | Sập vào giờ cao điểm hôm sau |
| Không `MDC.clear()` | Rò rỉ bộ nhớ, trace ID lẫn lộn |
| Log dữ liệu nhạy cảm | Vi phạm bảo mật, khó khắc phục |

Bẫy cuối cùng cần nói thêm: **đừng bao giờ log mật khẩu, token, số thẻ, thông tin cá nhân**. Log thường được lưu lâu, sao chép nhiều nơi, và nhiều người truy cập được. Dùng bộ lọc che dữ liệu nhạy cảm nếu có nguy cơ.

## Tóm tắt case 5

- Ghi log đồng bộ **chặn thread** — vừa do khoá dùng chung, vừa do I/O đĩa.
- Luôn dùng **`AsyncAppender` với `neverBlock=true`** và `discardingThreshold=0`.
- **`includeCallerData=true` (hoặc pattern `%line`) làm chậm 10-100 lần.**
- **Ứng dụng không bao giờ gửi log trực tiếp qua mạng** — ghi file/stdout, để agent thu thập.
- **`totalSizeCap` là bắt buộc** — đầy đĩa làm sập cả những thứ dùng chung volume.
- Lỗi sinh log, log sinh chậm, chậm sinh lỗi — **vòng lặp phản hồi dương**. Dùng rate-limited logger.
- Lỗi dự kiến (timeout, validation): **một dòng ngắn + metric**, không stack trace.
- Bật DEBUG ở production: **qua Actuator, cho một package, trên một pod, và tự động tắt**.

**Bài kế tiếp** → [Case 6: Head-of-line blocking — một phần tử chặn cả hàng](06-case-head-of-line-blocking.md)
