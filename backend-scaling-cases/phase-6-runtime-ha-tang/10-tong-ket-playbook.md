# Bài tổng kết: Playbook chẩn đoán và cấu hình tham chiếu

Bạn đã đi qua 49 case. Bài này gói tất cả lại thành ba thứ dùng được ngay:

1. **Bảng tra triệu chứng → nguyên nhân** — nhìn triệu chứng, biết đọc bài nào.
2. **Playbook 15 phút** — quy trình xử lý khi có sự cố.
3. **Cấu hình tham chiếu** — một file cấu hình production hoàn chỉnh, **chú thích từng dòng**.

## Phần 1: Bảng tra triệu chứng → nguyên nhân

### Nhóm "chậm"

| Triệu chứng | Nguyên nhân khả dĩ | Đọc bài |
|---|---|---|
| Thread đầy + **CPU thấp** | Đang chờ I/O bên ngoài | phase-2 case 1 |
| Thread đầy + **CPU cao** | Thật sự thiếu CPU, hoặc bị throttle | phase-6 case 2 |
| `Connection is not available ... 30000ms` | Cạn connection pool DB | phase-2 case 2 |
| Không có log lỗi + thread dump **không đổi sau 10 phút** | Thiếu timeout, thread treo vĩnh viễn | phase-2 case 3 |
| CPU ~0%, downstream khoẻ, **không bao giờ tự hồi phục** | Deadlock pool lồng pool | phase-2 case 4 |
| Throughput **chạm trần**, thêm pod không giúp | Lock contention trong JVM | phase-2 case 6 |
| Latency **răng cưa theo chu kỳ đều đặn** | GC pause | phase-6 case 1 |
| "CPU 35%" mà vẫn chậm | CFS throttling trên Kubernetes | phase-6 case 2 |
| Đỉnh latency **đúng 5 giây** | Mất gói UDP khi truy vấn DNS | phase-6 case 4 |
| Chậm ngay sau deploy, 6 phút sau hết | Cold start / JIT chưa warm-up | phase-6 case 7 |
| Một API chậm làm **mọi API** chậm | Không có bulkhead | phase-2 case 5 |
| 1 request → hàng trăm câu SQL | N+1 query | phase-3 case 8 |
| Trang sau của danh sách chậm dần | OFFSET pagination | phase-3 case 8 |

### Nhóm "lỗi dữ liệu"

| Triệu chứng | Nguyên nhân khả dĩ | Đọc bài |
|---|---|---|
| Bán quá số lượng tồn kho | Race condition kiểu check-then-act | phase-3 case 6 |
| Hai bản ghi trùng dù có kiểm tra | Thiếu unique constraint | phase-3 case 6 |
| Thay đổi của người dùng "biến mất" | Lost update | phase-3 case 5 |
| Trừ tiền hai lần | Thiếu idempotency, hoặc cài đặt sai | phase-5 case 7 |
| `deadlock detected` ngẫu nhiên | Thứ tự khoá không nhất quán | phase-3 case 3 |
| Sửa xong vẫn thấy dữ liệu cũ | Replication lag | phase-5 case 5 |
| Số liệu lệch giữa các instance | Trạng thái trong bộ nhớ | phase-5 case 2 |
| Job gửi N email cho mỗi khách | `@Scheduled` chạy trên mọi instance | phase-5 case 2 |
| Báo cáo lệch số giữa hai hệ thống | "Ngày" khác múi giờ | phase-6 case 9 |
| Người dùng bị đăng xuất ngẫu nhiên | Session trong bộ nhớ, hoặc clock skew | phase-5 case 2, phase-6 case 9 |

### Nhóm "sập"

| Triệu chứng | Nguyên nhân khả dĩ | Đọc bài |
|---|---|---|
| Sửa xong nguyên nhân gốc mà **vẫn chết** | Metastable failure | phase-4 case 7 |
| Tải nội bộ tăng gấp nhiều lần khi có lỗi | Retry storm | phase-4 case 1 |
| Database sập đúng lúc cache hết hạn | Cache stampede | phase-4 case 2 |
| Pod bị giết liên tục (`CrashLoopBackOff`) | Liveness probe kiểm tra dependency | phase-4 case 6 |
| `OutOfMemoryError: Java heap space` | Hàng đợi vô hạn, hoặc rò rỉ bộ nhớ | phase-2 case 7 |
| `OOMKilled`, exit code **137** | Vượt memory limit của container | phase-6 case 2 |
| `Too many open files` | Cạn file descriptor | phase-6 case 3 |
| `Cannot assign requested address` | Cạn ephemeral port | phase-6 case 3 |
| `unable to create new native thread` | Vượt giới hạn số thread của OS | phase-6 case 3 |
| Đầy đĩa | Log không có `totalSizeCap` | phase-6 case 5 |
| Sập đúng đầu mỗi giờ | Cron đồng bộ hoá | phase-6 case 8 |
| Failover DB xong mà app vẫn lỗi | JVM cache DNS vĩnh viễn | phase-6 case 4 |
| Một partition Kafka dừng vĩnh viễn | Poison message | phase-6 case 6 |
| Một khoá làm nghẽn một node | Hot key | phase-4 case 5 |

## Phần 2: Playbook 15 phút

```text
┌───────────────────────────────────────────────────────────────────┐
│  BƯỚC 0 (30 giây)  — Có thay đổi gì trong 2 giờ qua không?        │
│  ├─ Deploy? Đổi config? Đổi feature flag? Migration?              │
│  └─ NẾU CÓ: ROLLBACK TRƯỚC, điều tra sau.                         │
│     (Đa số sự cố production đến từ một thay đổi vừa đưa lên.)     │
├───────────────────────────────────────────────────────────────────┤
│  BƯỚC 1 (2 phút)   — Chậm ở TẦNG nào?                             │
│  ├─ So latency đo ở load balancer với latency đo ở app            │
│  ├─ Chênh lớn  → đang xếp hàng chờ thread  → phase-2              │
│  └─ Bằng nhau  → thời gian nằm trong app hoặc downstream          │
├───────────────────────────────────────────────────────────────────┤
│  BƯỚC 2 (2 phút)   — Tài nguyên nào bão hoà?                      │
│  ├─ tomcat.threads.busy / max                = ?                  │
│  ├─ hikaricp.connections.pending             = ?                  │
│  ├─ CPU (độ phân giải 15 giây, xem cả max)   = ?                  │
│  ├─ container_cpu_cfs_throttled_periods_total= ?                  │
│  └─ jvm.gc.pause (p99)                       = ?                  │
├───────────────────────────────────────────────────────────────────┤
│  BƯỚC 3 (3 phút)   — Thread đang LÀM GÌ?                          │
│  ├─ Lấy 3 thread dump cách nhau 10 giây                           │
│  ├─ Đếm theo trạng thái, xem 3 stack trace phổ biến nhất          │
│  ├─ socketRead0 nhiều       → downstream chậm (phase-2 case 1)    │
│  ├─ ConcurrentBag.borrow    → cạn pool DB   (phase-2 case 2)      │
│  ├─ BLOCKED nhiều           → lock trong JVM (phase-2 case 6)     │
│  └─ Dump giống hệt nhau     → thread treo   (phase-2 case 3)      │
├───────────────────────────────────────────────────────────────────┤
│  BƯỚC 4 (3 phút)   — Phía DATABASE                                │
│  ├─ Có 'idle in transaction' không?  → phase-3 case 2             │
│  ├─ Có query nào chờ lock không?     → phase-3 case 1             │
│  ├─ Có deadlock trong log không?     → phase-3 case 3             │
│  └─ Query nào chậm nhất?             → phase-3 case 9             │
├───────────────────────────────────────────────────────────────────┤
│  BƯỚC 5 (5 phút)   — CẦM MÁU (chưa sửa gốc)                       │
│  ├─ Bật load shedding tích cực                                    │
│  ├─ Tắt retry toàn cục (feature flag)                             │
│  ├─ Tắt các tính năng không thiết yếu                             │
│  ├─ Buộc circuit breaker mở cho downstream đang hỏng              │
│  └─ NẾU đã sửa gốc mà vẫn chết → METASTABLE (phase-4 case 7):     │
│     chặn traffic → dọn hàng đợi → mở lại 10/25/50/100%            │
└───────────────────────────────────────────────────────────────────┘
```

### Ba câu hỏi quyết định

Trong lúc chẩn đoán, ba câu hỏi này thu hẹp phạm vi nhanh nhất:

```text
   1. "CPU cao hay thấp?"
      Thấp + chậm  = ĐANG CHỜ (I/O, lock, hàng đợi)
      Cao  + chậm  = ĐANG TÍNH (hoặc bị throttle)

   2. "Tải đầu vào có cao bất thường không?"
      Không cao mà vẫn chết = METASTABLE FAILURE

   3. "Thêm instance có giúp không?"
      Không giúp = nút thắt là tài nguyên DÙNG CHUNG
                   (database, lock, hot key, hot row)
```

## Phần 3: Cấu hình tham chiếu, chú thích từng dòng

Đây là cấu hình khởi điểm cho một service Spring Boot chạy trên Kubernetes. **Đừng copy nguyên xi** — đọc chú thích, hiểu từng tham số, rồi điều chỉnh theo số liệu đo được của bạn.

### `application.yml`

```yaml
server:
  # ============ TOMCAT: tầng nhận và xử lý HTTP ============
  tomcat:
    threads:
      # max: số luồng xử lý request TỐI ĐA. Đây là giới hạn thật sự về
      # số request được xử lý SONG SONG (phase-1 bài 2).
      # Cách tính (định luật Little, phase-1 bài 4):
      #     max = RPS_đỉnh × latency_trung_bình(giây) × 1,5
      # Ví dụ: 400 RPS × 0,15s × 1,5 ≈ 90 → làm tròn 100.
      # Mặc định Spring Boot là 200 — thường thừa cho container 2 core.
      max: 100

      # min-spare: số luồng LUÔN giữ sẵn kể cả lúc nhàn rỗi.
      # Tạo một OS thread mới tốn ~50-100 micro-giây; giữ sẵn giúp đợt
      # traffic đầu tiên không bị chậm. Mặc định là 10.
      min-spare: 20

    # max-connections: số kết nối TCP Tomcat đồng ý giữ đồng thời.
    # Nhờ NIO, một kết nối đang mở mà không có dữ liệu KHÔNG tốn thread —
    # chỉ tốn bộ nhớ và một file descriptor.
    # Đây là "sảnh chờ", KHÔNG phải số request xử lý được (phase-1 bài 2).
    # Mặc định 8192; giảm xuống nếu đã có load balancer giới hạn phía trước.
    max-connections: 2000

    # accept-count: sức chứa hàng đợi của HỆ ĐIỀU HÀNH (accept queue/backlog).
    # Kết nối đã bắt tay TCP xong, đang chờ Tomcat gọi accept().
    # Hàng này đầy → kernel TỪ CHỐI kết nối mới ("Connection refused").
    # Giá trị thực tế còn bị chặn bởi tham số kernel net.core.somaxconn.
    accept-count: 100

    # connection-timeout: chờ client gửi dòng request đầu tiên bao lâu
    # sau khi kết nối được thiết lập. Mặc định 20 giây — quá dài,
    # mở đường cho tấn công Slowloris (mở nhiều kết nối rồi gửi nhỏ giọt).
    connection-timeout: 5s

    # keep-alive-timeout: giữ kết nối mở bao lâu SAU KHI trả response,
    # chờ request tiếp theo trên cùng kết nối (tiết kiệm bắt tay TCP).
    keep-alive-timeout: 15s

    # max-keep-alive-requests: một kết nối được tái sử dụng tối đa bao nhiêu lần
    # rồi bị đóng. Đặt -1 = không giới hạn, nhưng khi đó kết nối "dính" mãi vào
    # một instance và traffic không tự chuyển sang instance mới khi scale.
    max-keep-alive-requests: 100

  # shutdown: graceful = khi nhận SIGTERM thì NGỪNG nhận request mới
  # nhưng XỬ LÝ NỐT các request đang chạy (phase-4 case 6).
  # Không có nó, mỗi lần deploy sẽ cắt đứt các request dở dang.
  shutdown: graceful

spring:
  lifecycle:
    # Thời gian tối đa chờ các request đang chạy hoàn tất khi tắt.
    # PHẢI nhỏ hơn terminationGracePeriodSeconds của Kubernetes.
    timeout-per-shutdown-phase: 30s

  # ============ JPA / HIBERNATE ============
  jpa:
    # open-in-view: nếu true (MẶC ĐỊNH của Spring Boot), connection database
    # bị giữ TỪ ĐẦU ĐẾN CUỐI request HTTP — kể cả trong lúc serialize JSON
    # và ghi response ra mạng. Client mạng chậm cũng làm bạn giữ connection lâu.
    # LUÔN đặt false trong production (phase-2 case 2).
    # Hệ quả: sẽ lộ ra LazyInitializationException ở chỗ code đang lười —
    # đó là tính năng, buộc bạn viết query tử tế (JOIN FETCH / DTO projection).
    open-in-view: false

    properties:
      hibernate:
        # default_batch_fetch_size: khi Hibernate cần nạp quan hệ lazy cho
        # nhiều entity, nó gộp thành một câu "WHERE id IN (...)" với tối đa
        # N phần tử, thay vì bắn N câu riêng lẻ.
        # ĐÂY LÀ CẢI THIỆN LỚN NHẤT VỚI CHI PHÍ NHỎ NHẤT cho N+1 (phase-3 case 8).
        default_batch_fetch_size: 100

        # jdbc.batch_size: gộp N câu INSERT/UPDATE thành một lần gửi xuống DB.
        jdbc.batch_size: 50

        # order_inserts/order_updates: sắp xếp các câu lệnh theo bảng trước khi
        # gửi, để batch_size ở trên thực sự gộp được (nếu xen kẽ bảng thì không gộp).
        order_inserts: true
        order_updates: true

        # query.fail_on_pagination_over_collection_fetch: ném lỗi thay vì
        # âm thầm nạp cả bảng vào RAM khi dùng JOIN FETCH + phân trang
        # (phase-3 case 8 — bẫy gây OutOfMemoryError).
        query.fail_on_pagination_over_collection_fetch: true

  # ============ CONNECTION POOL DATABASE (HikariCP) ============
  datasource:
    hikari:
      # maximum-pool-size: số connection tối đa tới database.
      # Công thức (phase-1 bài 4):  (số core của DB × 2) + số ổ đĩa
      # và CHIA cho số instance ứng dụng.
      # Ví dụ: DB 8 core, SSD → (8×2)+2 = 18 cho TOÀN HỆ THỐNG.
      #        Chạy 3 pod → 18/3 = 6 mỗi pod.
      # Pool LỚN không nhanh hơn — database không chạy song song nhiều thế;
      # nó chỉ làm latency mỗi query xấu đi.
      maximum-pool-size: 6

      # minimum-idle: số connection tối thiểu luôn giữ sẵn.
      # Đặt BẰNG maximum-pool-size để pool cố định — không phải mở connection
      # mới (tốn 20-50 ms) đúng lúc traffic tăng đột ngột.
      minimum-idle: 6

      # connection-timeout: chờ mượn connection từ pool bao lâu trước khi
      # ném SQLTransientConnectionException. Mặc định 30 giây — quá dài,
      # người dùng đã bỏ đi từ lâu. Fail nhanh tốt hơn.
      connection-timeout: 3000

      # validation-timeout: thời gian tối đa để kiểm tra một connection còn sống.
      validation-timeout: 1000

      # idle-timeout: connection nhàn rỗi quá lâu sẽ bị đóng.
      # Chỉ có tác dụng khi minimum-idle < maximum-pool-size.
      idle-timeout: 600000

      # max-lifetime: tuổi thọ tối đa của một connection, sau đó bị thay mới.
      # PHẢI NHỎ HƠN mọi timeout nằm giữa app và DB:
      #   - wait_timeout của MySQL
      #   - idle timeout của load balancer (AWS NLB: 350 giây!)
      #   - timeout của firewall
      # Nếu lớn hơn, HikariCP sẽ đưa cho bạn connection đã bị bên kia đóng
      # lặng lẽ → lỗi "Connection reset" ngẫu nhiên rất khó chẩn đoán.
      # Cũng giúp phân bố lại kết nối sau khi DNS/topology thay đổi (phase-6 case 4).
      max-lifetime: 300000

      # keepalive-time: định kỳ gửi truy vấn nhẹ để giữ connection sống
      # và phát hiện sớm connection đã chết. Phải nhỏ hơn max-lifetime.
      keepalive-time: 120000

      # leak-detection-threshold: nếu một connection bị giữ quá N ms mà chưa
      # trả về pool, HikariCP in CẢNH BÁO KÈM STACK TRACE chỉ đúng dòng code
      # đang giữ nó. Công cụ chẩn đoán rò rỉ connection tốt nhất (phase-2 case 2).
      # Đặt 0 để tắt. Nên bật ở staging và production.
      leak-detection-threshold: 20000

      # pool-name: tên hiển thị trong log và metric. Đặt tên có ý nghĩa
      # để phân biệt khi có nhiều pool (api / batch / report).
      pool-name: main-pool

  # ============ REDIS ============
  data:
    redis:
      # timeout: thời gian chờ một lệnh Redis trả về.
      # Mặc định của Lettuce là 60 GIÂY — quá dài. Redis bình thường trả lời
      # trong 1 ms; quá 500 ms nghĩa là có gì đó rất sai (ai đó chạy KEYS *,
      # hoặc SAVE đang chặn), chờ thêm cũng vô ích.
      timeout: 500ms

      # connect-timeout: thời gian bắt tay TCP tới Redis.
      connect-timeout: 300ms

      lettuce:
        pool:
          # max-active: số kết nối Redis tối đa.
          max-active: 32
          # max-idle / min-idle: số kết nối nhàn rỗi được giữ.
          max-idle: 16
          min-idle: 8
          # max-wait: chờ mượn kết nối từ pool bao lâu.
          # MẶC ĐỊNH LÀ -1 = CHỜ VÔ HẠN — rất nguy hiểm, phải đổi.
          max-wait: 200ms

  # ============ THREADS ẢO (Java 21+) ============
  threads:
    virtual:
      # Bật virtual thread: mỗi request được một luồng ảo riêng, rất rẻ
      # (~1 KB thay vì 1 MB). Bỏ giới hạn 200 thread của Tomcat (phase-2 case 8).
      # CẢNH BÁO: bật cái này DỜI NÚT THẮT XUỐNG DATABASE — thread pool cũ
      # vô tình đóng vai trò giới hạn tải cho DB. Phải siết maximum-pool-size
      # và thêm rate limiter khi bật.
      # Chỉ bật nếu chạy JDK 21+ (tốt nhất 24+ để tránh vấn đề pinning).
      enabled: false

# ============ ACTUATOR: metric và health check ============
management:
  endpoints:
    web:
      exposure:
        # Danh sách endpoint được mở ra qua HTTP.
        # threaddump và heapdump rất hữu ích khi chẩn đoán — nhưng nhớ
        # bảo vệ bằng xác thực hoặc chỉ mở trên cổng nội bộ.
        include: health,info,metrics,prometheus,threaddump,heapdump,loggers

  endpoint:
    health:
      # probes.enabled: tạo hai endpoint RIÊNG BIỆT
      #   /actuator/health/liveness  — "tiến trình còn sống không?"
      #   /actuator/health/readiness — "sẵn sàng nhận traffic chưa?"
      # BẮT BUỘC phải tách, vì liveness fail thì pod bị GIẾT còn readiness fail
      # chỉ tạm rút khỏi load balancer (phase-4 case 6).
      probes:
        enabled: true
      show-details: always

  health:
    livenessstate:
      enabled: true
    readinessstate:
      enabled: true
    # TẮT các health indicator không nên ảnh hưởng tới probe.
    # Mặc định Spring Boot gom MỌI indicator vào /actuator/health —
    # nếu trỏ probe vào đó, một Redis chậm sẽ làm pod bị giết.
    redis:
      enabled: false
    mail:
      enabled: false

  metrics:
    distribution:
      # percentiles-histogram: yêu cầu Micrometer xuất dữ liệu dạng histogram
      # thay vì chỉ count+sum. BẮT BUỘC nếu muốn tính p99 CHÍNH XÁC ở Prometheus
      # (phase-1 bài 3 — percentile không cộng được, phải gộp histogram).
      percentiles-histogram:
        http.server.requests: true
        hikaricp.connections.acquire: true
      # slo: các mốc thời gian bạn quan tâm — Micrometer tạo bucket riêng cho chúng,
      # giúp tính chính xác tỉ lệ request dưới từng mốc.
      slo:
        http.server.requests: 100ms,300ms,1s,3s
    tags:
      # Gắn tên ứng dụng vào mọi metric để phân biệt khi gom nhiều service.
      application: ${spring.application.name}

# ============ RESILIENCE4J: các mẫu chống sập dây chuyền ============
resilience4j:
  circuitbreaker:
    configs:
      default:
        # sliding-window-type: COUNT_BASED = xét N lời gọi gần nhất.
        # Dùng TIME_BASED nếu traffic THƯA (phase-4 case 3) — vì với traffic thưa,
        # cửa sổ đếm có thể chứa dữ liệu từ nhiều giờ trước.
        sliding-window-type: COUNT_BASED
        sliding-window-size: 20

        # minimum-number-of-calls: cần ít nhất N mẫu mới được phép mở mạch.
        # Chống việc 2 lỗi trên 2 lời gọi = "100% lỗi" → mở mạch oan.
        minimum-number-of-calls: 10

        # failure-rate-threshold: tỉ lệ lỗi (%) vượt ngưỡng thì MỞ MẠCH.
        # Chọn theo mức quan trọng: dịch vụ phụ 30%, thường 50%, sống còn 70%.
        failure-rate-threshold: 50

        # slow-call-duration-threshold: lời gọi lâu hơn ngưỡng này được ĐẾM LÀ LỖI.
        # THAM SỐ QUAN TRỌNG NHẤT — service CHẬM nguy hiểm hơn service CHẾT
        # (chết thì trả lỗi ngay, thread được giải phóng; chậm thì giam thread).
        # Đặt bằng p99 bình thường của downstream × 2.
        slow-call-duration-threshold: 1s
        slow-call-rate-threshold: 50

        # wait-duration-in-open-state: mạch mở bao lâu trước khi thử lại.
        # Quá ngắn → không cho downstream thời gian hồi phục.
        wait-duration-in-open-state: 30s

        # permitted-number-of-calls-in-half-open-state: khi chuyển sang HALF_OPEN,
        # cho bao nhiêu lời gọi đi "thăm dò". Không dội toàn bộ tải vào service
        # vừa mới hồi phục.
        permitted-number-of-calls-in-half-open-state: 5

        # automatic-transition-from-open-to-half-open-enabled: tự chuyển sang
        # HALF_OPEN khi hết thời gian, không cần chờ có request tới.
        automatic-transition-from-open-to-half-open-enabled: true

        # register-health-indicator: đưa trạng thái cầu dao vào /actuator/health.
        # LƯU Ý: nếu readiness probe dùng chung endpoint đó, cầu dao mở sẽ khiến
        # pod bị rút khỏi load balancer — thường KHÔNG phải điều bạn muốn.
        register-health-indicator: true

        # ignore-exceptions: các exception KHÔNG được tính là lỗi hạ tầng.
        # Lỗi nghiệp vụ (validation, not found) là lỗi của NGƯỜI GỌI,
        # không có nghĩa là service đang hỏng — đếm chúng sẽ mở mạch oan.
        ignore-exceptions:
          - com.shop.common.BusinessException
          - com.shop.common.NotFoundException
    instances:
      paymentService:
        base-config: default
        failure-rate-threshold: 70      # sống còn → mở mạch muộn hơn
        wait-duration-in-open-state: 15s
      recommendService:
        base-config: default
        failure-rate-threshold: 30      # phụ → hy sinh sớm để giữ tài nguyên

  bulkhead:
    instances:
      # max-concurrent-calls: số lời gọi ĐỒNG THỜI tối đa tới downstream này.
      # Đây là "vách ngăn kín nước" — dù downstream treo hoàn toàn,
      # chỉ N thread bị giam, phần còn lại vẫn phục vụ (phase-2 case 5).
      paymentService:
        max-concurrent-calls: 20
        # max-wait-duration: hết chỗ thì chờ bao lâu.
        # ĐẶT 0 — nếu chờ, thread vẫn bị giam và bulkhead mất hết tác dụng.
        max-wait-duration: 0
      recommendService:
        max-concurrent-calls: 10
        max-wait-duration: 0

  timelimiter:
    instances:
      paymentService:
        # timeout-duration: giới hạn TỔNG thời gian một lời gọi.
        # Cần thiết vì read timeout chỉ đo khoảng cách GIỮA HAI GÓI TIN —
        # server trả 1 byte mỗi 1,9 giây sẽ không bao giờ chạm read timeout 2s
        # nhưng vẫn giam thread vô hạn (phase-2 case 3).
        timeout-duration: 2s
        # cancel-running-future: huỷ thật future đang chạy khi hết giờ.
        cancel-running-future: true

  retry:
    instances:
      paymentService:
        # max-attempts: TỔNG số lần gọi (1 lần đầu + các lần thử lại).
        # Chỉ retry ở MỘT tầng trong toàn chuỗi — nếu mọi tầng đều retry 3 lần,
        # chuỗi 5 tầng cho hệ số khuếch đại 3^5 = 243 lần (phase-4 case 1).
        max-attempts: 3
        wait-duration: 200ms
        # exponential-backoff-multiplier: mỗi lần chờ gấp N lần lần trước.
        exponential-backoff-multiplier: 2
        # randomized-wait-factor: thêm nhiễu ngẫu nhiên ±50% vào thời gian chờ.
        # BẮT BUỘC — không có nó, mọi client cùng thử lại tại một thời điểm
        # và tạo ra sóng đồng bộ (thundering herd).
        randomized-wait-factor: 0.5
        # retry-exceptions: CHỈ retry lỗi TẠM THỜI.
        retry-exceptions:
          - java.io.IOException
          - java.util.concurrent.TimeoutException
        # ignore-exceptions: KHÔNG retry lỗi vĩnh viễn (retry vẫn sẽ lỗi)
        # và không retry khi cầu dao đã mở (biết chắc sẽ hỏng).
        ignore-exceptions:
          - io.github.resilience4j.circuitbreaker.CallNotPermittedException
          - com.shop.common.BusinessException

# ============ LOGGING ============
logging:
  level:
    root: INFO
    com.shop: INFO
  pattern:
    # KHÔNG dùng %class, %method, %line, %F trong pattern production —
    # chúng buộc Logback tạo stack trace cho MỖI dòng log,
    # làm chậm 10-100 lần (phase-6 case 5).
    console: "%d{HH:mm:ss.SSS} [%thread] %-5level %logger{36} [%X{traceId}] - %msg%n"
```

### `logback-spring.xml` — phần async, chú thích từng thuộc tính

```xml
<configuration>
  <appender name="FILE" class="ch.qos.logback.core.rolling.RollingFileAppender">
    <file>/var/log/app/app.log</file>
    <rollingPolicy class="ch.qos.logback.core.rolling.SizeAndTimeBasedRollingPolicy">
      <fileNamePattern>/var/log/app/app-%d{yyyy-MM-dd}.%i.log.gz</fileNamePattern>
      <!-- maxFileSize: cắt file khi vượt kích thước này -->
      <maxFileSize>100MB</maxFileSize>
      <!-- maxHistory: giữ log của bao nhiêu ngày -->
      <maxHistory>7</maxHistory>
      <!-- totalSizeCap: TRẦN CỨNG cho tổng dung lượng log. BẮT BUỘC PHẢI CÓ —
           đầy đĩa sẽ làm sập cả những thứ dùng chung volume (phase-6 case 5). -->
      <totalSizeCap>3GB</totalSizeCap>
    </rollingPolicy>
    <encoder>
      <pattern>%d{HH:mm:ss.SSS} [%thread] %-5level %logger{36} [%X{traceId}] - %msg%n</pattern>
      <!-- immediateFlush=false: gom lô trước khi ghi xuống đĩa thay vì
           gọi flush() sau MỖI dòng. Giảm mạnh số syscall. -->
      <immediateFlush>false</immediateFlush>
    </encoder>
  </appender>

  <appender name="ASYNC" class="ch.qos.logback.classic.AsyncAppender">
    <!-- queueSize: sức chứa hàng đợi log trong bộ nhớ. -->
    <queueSize>8192</queueSize>

    <!-- discardingThreshold: khi hàng đợi còn dưới N% chỗ trống, Logback BỎ
         các log mức TRACE/DEBUG/INFO. Mặc định là 20 — nghĩa là bạn âm thầm
         mất log INFO khi tải cao. Đặt 0 để giữ tất cả. -->
    <discardingThreshold>0</discardingThreshold>

    <!-- neverBlock=true: khi hàng đợi ĐẦY, BỎ log thay vì CHẶN thread ứng dụng.
         Mất vài dòng log tốt hơn nhiều so với treo cả hệ thống. -->
    <neverBlock>true</neverBlock>

    <!-- includeCallerData=false: KHÔNG lấy tên class/method/dòng.
         Đặt true làm mỗi dòng log tạo một stack trace → chậm 10-100 lần. -->
    <includeCallerData>false</includeCallerData>

    <appender-ref ref="FILE"/>
  </appender>

  <root level="INFO">
    <appender-ref ref="ASYNC"/>
  </root>
</configuration>
```

### Kubernetes `Deployment` — chú thích từng trường

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
spec:
  replicas: 4
  strategy:
    type: RollingUpdate
    rollingUpdate:
      # maxSurge: được tạo thêm tối đa bao nhiêu pod so với `replicas` khi deploy.
      # Đặt 1 để chỉ có 1 pod mới (đang cold start) tại một thời điểm — giảm
      # ảnh hưởng của cold start lên latency tổng (phase-6 case 7).
      maxSurge: 1
      # maxUnavailable: được phép có bao nhiêu pod KHÔNG sẵn sàng khi deploy.
      # Đặt 0 để không bao giờ giảm công suất phục vụ.
      maxUnavailable: 0

  # minReadySeconds: sau khi pod báo Ready, chờ thêm N giây rồi mới coi là
  # ổn định và tiếp tục thay pod tiếp theo. Buộc rolling update đi CHẬM
  # nhưng ÊM — không có 20 pod cold cùng lúc.
  minReadySeconds: 60

  template:
    spec:
      # terminationGracePeriodSeconds: sau khi gửi SIGTERM, Kubernetes chờ
      # bao lâu trước khi SIGKILL. PHẢI LỚN HƠN
      # (thời gian preStop + spring.lifecycle.timeout-per-shutdown-phase).
      terminationGracePeriodSeconds: 60

      containers:
        - name: app
          image: shop/order-service:1.4.2

          lifecycle:
            preStop:
              exec:
                # Kubernetes xoá pod khỏi danh sách Endpoints ĐỒNG THỜI với việc
                # gửi SIGTERM, nhưng load balancer cần vài giây để cập nhật.
                # `sleep 10` giữ pod PHỤC VỤ BÌNH THƯỜNG trong lúc LB cập nhật
                # → không mất request nào khi deploy (phase-4 case 6).
                command: ["sh", "-c", "sleep 10"]

          resources:
            requests:
              # requests.cpu: lượng CPU được ĐẢM BẢO. Kubernetes dùng con số này
              # để chọn node và để chia CPU khi có tranh chấp.
              cpu: "1"
              # requests.memory: lượng RAM được đảm bảo.
              memory: "2Gi"
            limits:
              # KHÔNG đặt limits.cpu — CPU là tài nguyên "nén được": thiếu thì
              # chậm chứ không chết. Đặt limit gây CFS throttling: container bị
              # ĐÓNG BĂNG phần còn lại của mỗi chu kỳ 100 ms, kể cả GC cũng bị
              # đóng băng (phase-6 case 2).
              # Nếu chính sách bắt buộc phải có, đặt limit ≥ 2-4× request.
              #
              # limits.memory PHẢI đặt và nên BẰNG requests.memory — bộ nhớ là
              # tài nguyên "không nén được": vượt là bị GIẾT ngay (OOMKilled, exit 137).
              memory: "2Gi"

          env:
            - name: TZ
              # Múi giờ của hệ điều hành trong container. Đặt UTC để mọi
              # container ở mọi vùng cho kết quả giống nhau (phase-6 case 9).
              value: "UTC"
            - name: JAVA_TOOL_OPTIONS
              value: >-
                -XX:MaxRAMPercentage=70.0
                -XX:+UseG1GC
                -XX:MaxGCPauseMillis=100
                -XX:+HeapDumpOnOutOfMemoryError
                -XX:HeapDumpPath=/dumps/
                -XX:+ExitOnOutOfMemoryError
                -Xlog:gc*:file=/var/log/gc.log:time,uptime:filecount=5,filesize=50M
                -Dsun.net.inetaddr.ttl=30
                -Dsun.net.inetaddr.negative.ttl=0
                -Duser.timezone=UTC
              # Giải thích từng tham số:
              #  MaxRAMPercentage=70      : heap chỉ dùng 70% RAM container.
              #                             30% còn lại cho metaspace, thread stack,
              #                             code cache, direct buffer — nếu không chừa,
              #                             bị OOMKilled trước khi JVM kịp báo lỗi.
              #  UseG1GC                  : chọn thuật toán GC (mặc định từ JDK 9).
              #                             Đổi sang -XX:+UseZGC -XX:+ZGenerational
              #                             nếu cần p99 cực ổn định.
              #  MaxGCPauseMillis=100     : MỤC TIÊU (không phải đảm bảo) cho độ dài
              #                             mỗi lần GC dừng. Đặt quá thấp làm GC chạy
              #                             quá thường xuyên, tốn CPU.
              #  HeapDumpOnOutOfMemoryError: tự dump heap khi OOM — không có nó thì
              #                             không bao giờ biết cái gì chiếm bộ nhớ.
              #  ExitOnOutOfMemoryError   : thoát hẳn thay vì sống ngắc ngoải.
              #                             Sau OOM, JVM ở trạng thái không đáng tin.
              #  -Xlog:gc*                : ghi log GC. Gần như miễn phí và là dữ liệu
              #                             ĐẦU TIÊN cần khi điều tra latency răng cưa.
              #  sun.net.inetaddr.ttl=30  : JVM cache kết quả phân giải DNS 30 giây.
              #                             Mặc định có thể là -1 (VĨNH VIỄN) →
              #                             database failover xong app vẫn nối IP cũ
              #                             cho tới khi restart (phase-6 case 4).
              #  negative.ttl=0           : không cache kết quả phân giải THẤT BẠI.
              #  user.timezone=UTC        : múi giờ mặc định của JVM.

          # startupProbe: dành riêng cho giai đoạn KHỞI ĐỘNG.
          # Khi nó chưa pass, liveness và readiness KHÔNG chạy —
          # nên pod không bị giết oan trong lúc đang khởi động chậm.
          startupProbe:
            httpGet:
              path: /actuator/health/liveness
              port: 8080
            periodSeconds: 5
            # failureThreshold × periodSeconds = thời gian khởi động tối đa
            # 30 × 5 = 150 giây. Ứng dụng Java thường cần 60-120 giây.
            failureThreshold: 30

          # livenessProbe: trả lời câu hỏi "tiến trình có bị TREO không?"
          # Fail → pod bị GIẾT và khởi động lại.
          # TUYỆT ĐỐI KHÔNG kiểm tra database/downstream ở đây: restart pod
          # không sửa được database chậm, chỉ làm mọi thứ tệ hơn (phase-4 case 6).
          livenessProbe:
            httpGet:
              path: /actuator/health/liveness
              port: 8080
            # periodSeconds lớn + failureThreshold lớn = RẤT RỘNG RÃI.
            # 20s × 6 = 2 phút suy giảm mới giết pod. Giết pod là hành động
            # phá huỷ, phải rất chắc chắn.
            periodSeconds: 20
            timeoutSeconds: 5
            failureThreshold: 6

          # readinessProbe: trả lời "pod này sẵn sàng nhận traffic chưa?"
          # Fail → chỉ tạm RÚT KHỎI load balancer, KHÔNG bị giết.
          # Đây mới là nơi kiểm tra dependency BẮT BUỘC (database)
          # và trạng thái warm-up.
          readinessProbe:
            httpGet:
              path: /actuator/health/readiness
              port: 8080
            # Nhạy hơn liveness: 5s × 3 = 15 giây thì rút khỏi LB.
            periodSeconds: 5
            timeoutSeconds: 3
            failureThreshold: 3
            # successThreshold=2: cần 2 lần OK liên tiếp mới quay lại LB.
            # Chống "dao động" vào/ra liên tục khi hệ thống đang chập chờn.
            successThreshold: 2
---
# PodDisruptionBudget: bảo vệ khỏi việc Kubernetes xoá quá nhiều pod cùng lúc
# trong các thao tác vận hành (nâng cấp node, drain node).
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: order-service-pdb
spec:
  # minAvailable: luôn giữ ít nhất 60% số pod đang phục vụ.
  minAvailable: 60%
  selector:
    matchLabels:
      app: order-service
```

### Ba dòng SQL đáng giá nhất

```sql
-- Đặt ở mức user database, áp dụng cho MỌI phiên kết nối của ứng dụng.

-- statement_timeout: huỷ câu lệnh chạy quá 10 giây.
-- Chặn query lỗi (thiếu điều kiện JOIN, tích Descartes) chiếm tài nguyên vô hạn.
ALTER ROLE app_user SET statement_timeout = '10s';

-- lock_timeout: bỏ cuộc nếu chờ lock quá 3 giây.
-- Đây là LOAD SHEDDING Ở TẦNG DATABASE: thà một số giao dịch lỗi
-- còn hơn 200 giao dịch xếp hàng làm sập cả hệ thống (phase-3 case 1).
ALTER ROLE app_user SET lock_timeout = '3s';

-- idle_in_transaction_session_timeout: huỷ phiên đã MỞ TRANSACTION
-- nhưng ngồi không quá 30 giây.
-- Chặn thủ phạm số một của mọi vấn đề lock và bloat: code gọi HTTP
-- bên trong @Transactional, hoặc lập trình viên đặt breakpoint rồi đi ăn trưa
-- (phase-3 case 2).
ALTER ROLE app_user SET idle_in_transaction_session_timeout = '30s';

-- Cho user chạy báo cáo thì nới lỏng hơn — nhưng vẫn PHẢI CÓ giới hạn.
ALTER ROLE report_user SET statement_timeout = '30min';
ALTER ROLE report_user SET idle_in_transaction_session_timeout = '2min';
```

## Phần 4: Danh sách cảnh báo tối thiểu

Nếu chỉ dựng được 12 cảnh báo, hãy chọn 12 cái này:

```yaml
groups:
  - name: backend-critical
    rules:
      # 1. Thread pool sắp cạn — báo TRƯỚC khi latency tăng
      - alert: ThreadPoolNearExhaustion
        expr: tomcat_threads_busy_threads / tomcat_threads_config_max_threads > 0.8
        for: 2m

      # 2. Có thread đang XẾP HÀNG chờ connection DB — luôn là dấu hiệu xấu
      - alert: ConnectionPoolPending
        expr: hikaricp_connections_pending > 0
        for: 1m

      # 3. Connection bị giữ quá lâu — tìm ai đang giữ (gọi HTTP trong transaction?)
      - alert: ConnectionHeldTooLong
        expr: histogram_quantile(0.99, rate(hikaricp_connections_usage_seconds_bucket[5m])) > 1
        for: 5m

      # 4. CPU bị THROTTLE — chỉ số này không xuất hiện ở đâu khác
      - alert: CpuThrottling
        expr: rate(container_cpu_cfs_throttled_periods_total[5m])
              / rate(container_cpu_cfs_periods_total[5m]) > 0.05
        for: 5m

      # 5. GC ăn quá nhiều thời gian
      - alert: HighGcPause
        expr: rate(jvm_gc_pause_seconds_sum[5m]) > 0.1
        for: 5m

      # 6. Sắp cạn file descriptor
      - alert: FileDescriptorsNearLimit
        expr: process_open_fds / process_max_fds > 0.8
        for: 5m

      # 7. Cầu dao mở — downstream đang hỏng
      - alert: CircuitBreakerOpen
        expr: resilience4j_circuitbreaker_state{state="open"} == 1
        for: 1m

      # 8. Tỉ lệ retry cao — dấu hiệu sớm của retry storm
      - alert: HighRetryRate
        expr: rate(resilience4j_retry_calls_total{kind=~"successful_with_retry|failed_with_retry"}[5m])
              / rate(resilience4j_retry_calls_total[5m]) > 0.1
        for: 5m

      # 9. Hàng đợi bất đồng bộ tăng đơn điệu — báo trước OOM 10-30 phút
      - alert: QueueGrowingMonotonically
        expr: deriv(executor_queued_tasks[5m]) > 0 and executor_queued_tasks > 100
        for: 10m

      # 10. Transaction database chạy quá lâu — gây bloat và chặn DDL
      - alert: LongRunningTransaction
        expr: pg_stat_activity_max_tx_duration > 300
        for: 2m

      # 11. Replica tụt hậu — người dùng thấy dữ liệu cũ
      - alert: ReplicationLagHigh
        expr: pg_replication_lag_seconds > 10
        for: 3m

      # 12. Máy mất đồng bộ NTP — nguồn của mọi lỗi thời gian
      - alert: ClockNotSynchronized
        expr: node_timex_sync_status == 0
        for: 10m
```

Ba cảnh báo hay bị bỏ sót nhất trong danh sách này: **số 4 (CPU throttling)**, **số 9 (hàng đợi tăng đơn điệu)** và **số 12 (mất đồng bộ NTP)**. Cả ba đều phát hiện được những sự cố mà không chỉ số thông thường nào nhìn thấy.

## Phần 5: Bảy nguyên tắc rút ra từ 49 case

1. **CPU thấp mà chậm = đang chờ, không phải đang tính.** Câu hỏi tiếp theo luôn là "chờ cái gì?".
2. **Mọi lời gọi ra ngoài tiến trình phải có timeout.** Không có ngoại lệ — kể cả Redis, kể cả đọc file.
3. **Giảm latency rẻ hơn thêm tài nguyên.** Latency giảm 12 lần = công suất tăng 12 lần, miễn phí.
4. **Cô lập quan trọng hơn tối ưu.** Bulkhead làm hệ thống hỏng *có giới hạn*, và đó là thứ cứu bạn lúc 3 giờ sáng.
5. **Từ chối bớt tốt hơn phục vụ tất cả.** Khi quá tải, load shedding cho thông lượng hữu ích cao hơn hẳn.
6. **Diễn đạt bất biến bằng ràng buộc database**, đừng dựa vào code ứng dụng hay isolation level.
7. **Thiết kế để trùng lặp vô hại.** Exactly-once không tồn tại; at-least-once + idempotent thì có.

## Đi tiếp từ đây

Khoá học này dừng ở mức "hiểu và xử lý được". Ba hướng đi sâu hơn:

| Hướng | Nội dung | Bắt đầu từ |
|---|---|---|
| **Quan sát hệ thống** | OpenTelemetry, distributed tracing, eBPF, continuous profiling | phase-1 bài 6 |
| **Kỹ thuật hỗn loạn** | Chaos engineering, game day, fault injection | phase-4 case 7 |
| **Hệ phân tán lý thuyết** | Consensus (Raft), CAP, CRDT, đồng hồ logic | phase-5 case 7 |

Nhưng trước khi đi tiếp, hãy làm một việc có giá trị hơn: **lấy hệ thống thật của bạn và chạy qua playbook ở phần 2**. Bạn sẽ tìm thấy ít nhất ba thứ trong khoá học này đang tồn tại ngay lúc này.

**Quay lại** → [Mục lục khoá học](../00-gioi-thieu.md) · [Từ điển thuật ngữ](../00-thuat-ngu.md)
