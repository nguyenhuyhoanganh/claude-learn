# Case 9: Thời gian — đồng hồ lệch, múi giờ và những lỗi khó tin

Thời gian trông đơn giản. Nó không đơn giản.

```text
   ├─ Token hết hạn ngay khi vừa được cấp
   ├─ Log ghi rằng response đến TRƯỚC khi request được gửi
   ├─ Đơn hàng có thời gian tạo ở tương lai
   ├─ Job chạy hai lần vào 02:00 sáng ngày chuyển giờ mùa đông
   ├─ Khoá phân tán hết hạn sớm hơn dự kiến
   └─ Báo cáo doanh thu ngày lệch nhau giữa hai hệ thống
```

Tất cả đều là lỗi thật, đều khó tái hiện, và đều bắt nguồn từ những hiểu lầm về thời gian trong hệ phân tán.

## Thuật ngữ cần nắm

| Thuật ngữ tiếng Anh | Tiếng Việt | Nghĩa |
|---|---|---|
| **Wall clock** | Đồng hồ treo tường | Thời gian "thật" theo lịch — có thể nhảy tới nhảy lui khi đồng bộ |
| **Monotonic clock** | Đồng hồ đơn điệu | Bộ đếm chỉ tăng, không bao giờ nhảy lùi — dùng để đo khoảng thời gian |
| **Clock skew** | Lệch đồng hồ | Chênh lệch thời gian giữa hai máy tại cùng một thời điểm |
| **Clock drift** | Trôi đồng hồ | Tốc độ đồng hồ của máy chạy nhanh/chậm hơn thực tế |
| **NTP** | Giao thức đồng bộ thời gian mạng | Cơ chế các máy đồng bộ đồng hồ với máy chủ thời gian |
| **UTC** | Giờ phối hợp quốc tế | Chuẩn thời gian toàn cầu, không có mùa hè/mùa đông |
| **DST** | Giờ mùa hè | Quy ước chỉnh đồng hồ theo mùa ở một số quốc gia |
| **Epoch / Unix timestamp** | Mốc thời gian Unix | Số giây (hoặc mili-giây) tính từ 00:00:00 UTC ngày 1/1/1970 |
| **Leap second** | Giây nhuận | Giây được chèn thêm để đồng bộ giờ nguyên tử với vòng quay Trái Đất |

## Vấn đề 1: Dùng wall clock để đo khoảng thời gian

Đây là lỗi phổ biến nhất và ít người biết.

```java
// SAI — dùng đồng hồ treo tường để đo thời lượng
long start = System.currentTimeMillis();
doWork();
long duration = System.currentTimeMillis() - start;
```

**Vì sao sai?** Vì `System.currentTimeMillis()` trả về **wall clock** — thời gian theo lịch. Và wall clock **có thể nhảy**:

```text
   Nguyên nhân đồng hồ nhảy:
   ├─ NTP đồng bộ và chỉnh đồng hồ (có thể lùi vài giây!)
   ├─ Quản trị viên chỉnh giờ thủ công
   ├─ Máy ảo bị tạm dừng rồi khôi phục
   ├─ Chuyển đổi giờ mùa hè (ở các nước có DST)
   └─ Giây nhuận
```

```text
   Kịch bản thật:
   t = 10:00:00.000  start = 1722301200000
   ... doWork() chạy 50 ms ...
   t = 10:00:00.050  NTP chỉnh đồng hồ LÙI 2 giây
                     now = 1722301198050
   duration = 1722301198050 - 1722301200000 = -1.950 ms

   ⇒ Thời lượng ÂM. Nếu code có `if (duration > timeout)` thì nó
     không bao giờ đúng; nếu có phép chia thì có thể chia cho số âm.
```

### Cách đúng: dùng monotonic clock

```java
// ĐÚNG — System.nanoTime() là monotonic clock:
// nó là một bộ đếm CHỈ TĂNG, không liên quan gì tới lịch,
// không bị NTP hay việc chỉnh giờ ảnh hưởng.
long start = System.nanoTime();
doWork();
long durationNanos = System.nanoTime() - start;
long durationMs = TimeUnit.NANOSECONDS.toMillis(durationNanos);
```

Quy tắc ghi nhớ:

| Mục đích | Dùng gì |
|---|---|
| **Đo thời lượng** (bao lâu, timeout, benchmark) | `System.nanoTime()` — monotonic |
| **Ghi thời điểm** (khi nào xảy ra, lưu vào DB, hiển thị) | `Instant.now()` / `System.currentTimeMillis()` — wall clock |

> Lưu ý về `System.nanoTime()`: giá trị tuyệt đối của nó **vô nghĩa** (không phải thời gian từ 1970, có thể âm). Nó chỉ dùng để **trừ hai giá trị** cho ra khoảng thời gian. Và nó chỉ so sánh được **trong cùng một JVM** — không gửi qua mạng được.

Java 8+ có cách biểu đạt rõ ràng hơn:

```java
// Clock là một abstraction cho nguồn thời gian — dễ thay thế khi viết test
Instant start = Instant.now(clock);
doWork();
Duration elapsed = Duration.between(start, Instant.now(clock));
```

Nhưng nhớ: `Instant.now()` vẫn là wall clock. Muốn đo chính xác thì vẫn phải `nanoTime()`.

## Vấn đề 2: Clock skew giữa các máy

Không có hai máy nào có đồng hồ giống hệt nhau.

```text
   Máy A: 10:00:00.000
   Máy B: 10:00:00.150     ← lệch 150 ms

   Với NTP hoạt động tốt : lệch 1-50 ms
   Với NTP có vấn đề     : lệch vài giây đến vài phút
   Máy ảo bị tạm dừng     : có thể lệch hàng giờ
```

### Hậu quả 1: Token hết hạn ngay khi cấp

```text
   Auth service (đồng hồ nhanh 30 giây):
   → Cấp token với exp = now + 60 giây = 10:01:30

   API service (đồng hồ chậm 30 giây):
   → Nhận token lúc 10:00:00 theo đồng hồ của nó
   → Kiểm tra: exp (10:01:30) > now (10:00:00) ✓ OK

   Nhưng nếu ngược lại (auth chậm, API nhanh):
   → Auth cấp exp = 10:00:30
   → API thấy now = 10:01:00 > exp → TOKEN ĐÃ HẾT HẠN
   ⇒ Token chết ngay khi vừa sinh ra.
```

**Cách xử lý: cho phép một khoảng sai lệch (clock skew tolerance)**

```java
// Khi kiểm tra token JWT, cho phép lệch tối đa 60 giây giữa hai máy
Jwts.parserBuilder()
    .setSigningKey(key)
    // setAllowedClockSkewSeconds: số giây được phép lệch khi so sánh
    // các trường thời gian (exp = hết hạn, nbf = chưa hiệu lực, iat = thời điểm cấp).
    // Không đặt = 0 → chỉ cần lệch 1 giây là token bị từ chối.
    .setAllowedClockSkewSeconds(60)
    .build()
    .parseClaimsJws(token);
```

Với Spring Security OAuth2:

```yaml
spring:
  security:
    oauth2:
      resourceserver:
        jwt:
          # Thời gian cho phép lệch đồng hồ khi xác thực token.
          # Mặc định của thư viện Nimbus là 60 giây; đặt tường minh cho rõ ràng.
          clock-skew: 60s
```

### Hậu quả 2: Sắp xếp sự kiện sai thứ tự

```text
   Service A ghi log lúc 10:00:00.100 (đồng hồ nhanh 200 ms)
   Service B ghi log lúc 10:00:00.050 (đồng hồ chuẩn)

   Thực tế: A xảy ra TRƯỚC B
   Theo timestamp: B (00.050) < A (00.100) → tưởng B trước A

   ⇒ Đọc log thấy "response trả về trước khi request được gửi"
```

Đây là lý do **không được dùng timestamp để xác định thứ tự nhân quả trong hệ phân tán**.

Giải pháp:

| Cách | Mô tả | Dùng khi |
|---|---|---|
| **Trace ID + span** | Mỗi request có ID, các span có quan hệ cha-con tường minh | Truy vết phân tán (khuyến nghị) |
| **Logical clock** (Lamport) | Bộ đếm tăng dần, gửi kèm message | Cần thứ tự nhân quả |
| **Vector clock** | Mỗi node giữ một vector bộ đếm | Cần phát hiện xung đột song song |
| **Số thứ tự từ một nguồn** | Sequence của database, offset của Kafka | Đơn giản, hiệu quả |

Trong thực tế backend, **Kafka offset** và **database sequence** là hai nguồn thứ tự đáng tin nhất và dễ dùng nhất.

### Hậu quả 3: Khoá phân tán hết hạn sai

```text
   Redis (đồng hồ chuẩn), client (đồng hồ nhanh 5 giây)

   Client lấy khoá lúc 10:00:00 với TTL 10 giây
   → Redis sẽ xoá khoá lúc 10:00:10 (theo đồng hồ Redis)

   Client nghĩ mình giữ khoá tới 10:00:10 theo đồng hồ CỦA NÓ,
   tức 10:00:05 theo đồng hồ Redis.

   Nếu client tính sai chiều, nó có thể tưởng còn giữ khoá
   trong khi khoá đã bị xoá.
```

Kết hợp với GC pause (case 1), đây là lý do **khoá phân tán không bao giờ an toàn tuyệt đối** (phase-3 case 6).

Cách giảm rủi ro: **luôn đo thời gian còn lại bằng monotonic clock của chính client**, và coi khoá là mất khi đã dùng quá ~2/3 TTL.

```java
long acquiredAtNanos = System.nanoTime();          // monotonic
long ttlNanos = TimeUnit.SECONDS.toNanos(10);

// Chỉ tiếp tục làm việc nếu đã dùng dưới 2/3 TTL —
// chừa biên an toàn cho GC pause và lệch đồng hồ.
boolean stillSafe = (System.nanoTime() - acquiredAtNanos) < ttlNanos * 2 / 3;
```

## Vấn đề 3: Múi giờ và giờ mùa hè

### Quy tắc vàng: lưu và tính toán bằng UTC

```java
// SAI — LocalDateTime KHÔNG chứa thông tin múi giờ.
// Nó chỉ là "10 giờ ngày 30/7" mà không biết là 10 giờ ở đâu.
LocalDateTime now = LocalDateTime.now();

// ĐÚNG — Instant là một điểm tuyệt đối trên trục thời gian, luôn theo UTC.
Instant now = Instant.now();

// ĐÚNG — nếu cần biết cả múi giờ (ví dụ để hiển thị)
ZonedDateTime nowInVN = ZonedDateTime.now(ZoneId.of("Asia/Ho_Chi_Minh"));
```

Ba kiểu dữ liệu thời gian trong Java, khác nhau rõ rệt:

| Kiểu | Chứa gì | Dùng khi |
|---|---|---|
| `LocalDateTime` | Ngày + giờ, **không có múi giờ** | Giờ "danh nghĩa" như giờ mở cửa cửa hàng (9:00 dù ở đâu) |
| `Instant` | Một điểm tuyệt đối trên trục thời gian (UTC) | **Lưu trong database, ghi log, đo lường** |
| `ZonedDateTime` | Instant + múi giờ | Hiển thị cho người dùng, tính lịch theo địa phương |

Trong database:

```sql
-- SAI: TIMESTAMP không có múi giờ → không biết giá trị này thuộc múi nào
created_at TIMESTAMP

-- ĐÚNG: TIMESTAMPTZ lưu điểm tuyệt đối, PostgreSQL tự chuyển đổi khi đọc
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
```

> Đặt tên `TIMESTAMPTZ` gây hiểu lầm: PostgreSQL **không lưu múi giờ** trong cột này. Nó chuyển giá trị đầu vào sang UTC để lưu, và chuyển sang múi giờ của phiên khi đọc. Đó chính xác là hành vi bạn muốn.

MySQL: dùng `TIMESTAMP` (lưu theo UTC) thay vì `DATETIME` (không có múi giờ). Nhưng `TIMESTAMP` của MySQL chỉ hỗ trợ đến năm 2038 — với dữ liệu xa tương lai, cân nhắc `DATETIME` kèm quy ước rõ ràng là UTC.

### Cạm bẫy giờ mùa hè (DST)

Việt Nam không dùng DST, nhưng nếu hệ thống của bạn phục vụ người dùng ở châu Âu hoặc Bắc Mỹ, đây là vấn đề thật:

```text
   Ở châu Âu, ngày chuyển sang giờ mùa đông:
   02:59:59 → 02:00:00  (đồng hồ LÙI 1 giờ)

   ⇒ Khoảng thời gian 02:00-03:00 XẢY RA HAI LẦN.
   ⇒ Job cron "0 30 2 * * *" chạy HAI LẦN.

   Ngày chuyển sang giờ mùa hè:
   01:59:59 → 03:00:00  (đồng hồ TIẾN 1 giờ)

   ⇒ Khoảng 02:00-03:00 KHÔNG TỒN TẠI.
   ⇒ Job cron "0 30 2 * * *" KHÔNG CHẠY ngày hôm đó.
```

Cách phòng:

```java
// Đặt scheduler chạy theo UTC — không bị ảnh hưởng bởi DST của bất kỳ vùng nào
@Bean
public TaskScheduler taskScheduler() {
    ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
    scheduler.setPoolSize(5);
    // Đặt múi giờ cho scheduler là UTC.
    // Nếu không đặt, nó dùng múi giờ mặc định của JVM — thay đổi theo máy.
    scheduler.setClock(Clock.systemUTC());
    return scheduler;
}

// Hoặc chỉ định múi giờ trực tiếp trên từng job
@Scheduled(cron = "0 30 2 * * *", zone = "UTC")
public void nightlyJob() { ... }
```

Và luôn đặt múi giờ mặc định của JVM một cách tường minh:

```yaml
env:
  - name: TZ
    value: "UTC"                    # múi giờ của container/hệ điều hành
  - name: JAVA_TOOL_OPTIONS
    value: "-Duser.timezone=UTC"    # múi giờ mặc định của JVM
```

Không đặt thì JVM lấy múi giờ của hệ điều hành — và container ở các vùng khác nhau có thể khác nhau, dẫn tới cùng một đoạn code cho kết quả khác nhau tuỳ nơi chạy.

### Cạm bẫy "ngày"

```java
// Câu hỏi: "doanh thu ngày hôm nay" — theo múi giờ nào?
LocalDate today = LocalDate.now();     // theo múi giờ mặc định JVM — mơ hồ!
```

Với hệ thống phục vụ nhiều quốc gia, "ngày 30/7" bắt đầu và kết thúc ở các thời điểm khác nhau. Phải quyết định tường minh:

```java
// Quy ước rõ ràng: "ngày" theo múi giờ của doanh nghiệp (ví dụ VN)
private static final ZoneId BUSINESS_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

public Revenue getDailyRevenue(LocalDate date) {
    // Chuyển "ngày 30/7 theo giờ VN" thành khoảng Instant tuyệt đối
    Instant from = date.atStartOfDay(BUSINESS_ZONE).toInstant();
    Instant to   = date.plusDays(1).atStartOfDay(BUSINESS_ZONE).toInstant();

    return repository.sumRevenueBetween(from, to);
}
```

Đây là nguồn của rất nhiều "báo cáo lệch số giữa hai hệ thống": mỗi hệ thống hiểu "ngày" theo một múi giờ khác nhau.

## Vấn đề 4: Giây nhuận

**Leap second (giây nhuận)** — thỉnh thoảng một giây được chèn thêm vào UTC để đồng bộ với vòng quay Trái Đất.

```text
   23:59:58
   23:59:59
   23:59:60      ← giây thứ 61 của phút này!
   00:00:00
```

Đã có những sự cố lớn trong ngành do giây nhuận: một số hệ thống bị treo, một số ứng dụng Java rơi vào vòng lặp bận (busy loop) chiếm 100% CPU.

Cách xử lý hiện đại: **leap smear** (bôi trơn giây nhuận) — thay vì chèn một giây đột ngột, làm chậm đồng hồ một chút trong nhiều giờ để "hấp thụ" giây đó.

```text
   Google, AWS, Cloudflare đều dùng leap smear trên NTP server của họ.
   Nếu bạn dùng NTP của các nhà cung cấp này, bạn được bảo vệ tự động.
```

Cấu hình NTP trỏ tới máy chủ có leap smear:

```bash
# /etc/chrony/chrony.conf
# Dùng NTP của Google — có leap smear, đồng hồ không bao giờ nhảy đột ngột
server time1.google.com iburst
server time2.google.com iburst

# makestep: cho phép chỉnh đồng hồ ĐỘT NGỘT (thay vì chỉnh từ từ)
# nếu lệch quá 1 giây, và CHỈ trong 3 lần cập nhật đầu tiên sau khi khởi động.
# Sau đó luôn chỉnh từ từ (slew) để tránh đồng hồ nhảy lùi lúc đang chạy.
makestep 1.0 3
```

> Dòng `makestep 1.0 3` rất quan trọng: nó cho phép sửa nhanh lệch lớn lúc máy vừa khởi động (khi chưa có ứng dụng nào chạy), nhưng sau đó chuyển sang chế độ chỉnh từ từ — nên ứng dụng đang chạy không bao giờ thấy đồng hồ nhảy lùi.

## Vấn đề 5: Timestamp làm khoá chính

```java
// SAI — hai bản ghi trong cùng mili-giây sẽ trùng khoá
String id = String.valueOf(System.currentTimeMillis());
```

Ngoài chuyện trùng, còn vấn đề đồng hồ nhảy lùi làm ID không còn tăng dần.

```java
// ĐÚNG — UUID v7: 48 bit đầu là timestamp (nên sắp xếp được theo thời gian),
// phần còn lại là ngẫu nhiên (nên không bao giờ trùng).
UUID id = UuidCreator.getTimeOrderedEpoch();      // thư viện uuid-creator
```

Snowflake ID cũng phổ biến nhưng cần cẩn thận với đồng hồ:

```java
public synchronized long nextId() {
    long timestamp = System.currentTimeMillis();

    // Nếu đồng hồ nhảy LÙI, ID sinh ra có thể trùng với ID đã cấp trước đó.
    // Cách an toàn: từ chối cấp ID cho tới khi đồng hồ đuổi kịp.
    if (timestamp < lastTimestamp) {
        throw new IllegalStateException(
            "Đồng hồ nhảy lùi " + (lastTimestamp - timestamp) + " ms, từ chối cấp ID");
    }
    ...
}
```

## Giám sát thời gian

```promql
# Độ lệch đồng hồ so với NTP server (giây).
# Ngưỡng cảnh báo: > 0.1 giây (100 ms)
node_timex_offset_seconds

# NTP có đang đồng bộ không (1 = đang đồng bộ, 0 = mất đồng bộ)
node_timex_sync_status
```

```bash
# Kiểm tra trạng thái đồng bộ thời gian
chronyc tracking
```

```text
Reference ID    : C0248F82 (time1.google.com)
Stratum         : 2                        # số bước tới nguồn thời gian gốc
System time     : 0.000012 seconds fast     # đang nhanh 12 micro-giây — rất tốt
Last offset     : +0.000003 seconds
RMS offset      : 0.000021 seconds
Frequency       : 12.345 ppm slow           # tần số dao động của đồng hồ máy
Leap status     : Normal                    # không có giây nhuận sắp tới
```

Cảnh báo cần có: **`node_timex_sync_status == 0`** (máy mất đồng bộ NTP) — đây là dấu hiệu sớm của mọi vấn đề trong bài này.

## Trường hợp thực tế: token chết trong 3 phút

Bối cảnh: hệ thống microservice, người dùng thỉnh thoảng bị đăng xuất ngẫu nhiên. Tỉ lệ khoảng 0,3% request, không theo quy luật.

**Điều tra**:

```text
   Log auth-service : token cấp lúc 10:00:00, exp = 10:15:00
   Log api-service  : từ chối token lúc 10:12:00 với lý do "expired"

   ⇒ Token bị coi là hết hạn 3 phút TRƯỚC thời hạn.
```

Kiểm tra đồng hồ:

```bash
# Trên node chạy auth-service
chronyc tracking | grep "System time"
# System time : 0.000015 seconds fast     ← chuẩn

# Trên node chạy api-service
chronyc tracking
# 506 Cannot talk to daemon               ← chronyd KHÔNG CHẠY!

date
# Lệch 3 phút 12 giây so với thực tế
```

**Nguyên nhân**: một node trong cụm có `chronyd` bị tắt sau một lần bảo trì. Đồng hồ trôi dần, tới 3 phút. Chỉ những request rơi vào pod trên node đó mới bị lỗi — giải thích tỉ lệ 0,3% và tính ngẫu nhiên.

**Các biện pháp**:

| Biện pháp | Tác dụng |
|---|---|
| Bật lại `chronyd` và đưa vào cấu hình bắt buộc của node | Sửa gốc |
| Thêm cảnh báo `node_timex_sync_status == 0` | Phát hiện trong 5 phút thay vì vài tuần |
| Thêm `clock-skew: 60s` khi xác thực JWT | Chịu được lệch nhỏ |
| Ghi log cả `exp`, `iat`, và `now` khi từ chối token | Chẩn đoán nhanh hơn nhiều |
| Thêm health check báo cáo độ lệch đồng hồ | Nhìn thấy được từ dashboard |

Điểm đáng học: **vấn đề tồn tại 6 tuần trước khi được tìm ra**, vì không ai giám sát đồng bộ thời gian. Đây là một trong những cảnh báo rẻ nhất và giá trị nhất mà bạn có thể thêm.

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Dùng `currentTimeMillis()` để đo thời lượng | Kết quả âm hoặc sai khi NTP chỉnh giờ |
| Không cho phép clock skew khi xác thực token | Đăng xuất ngẫu nhiên |
| Dùng `LocalDateTime` lưu vào database | Mất thông tin múi giờ, không so sánh được |
| Dùng `TIMESTAMP` thay `TIMESTAMPTZ` | Không biết giá trị thuộc múi giờ nào |
| Không đặt `TZ=UTC` cho container | Cùng code, kết quả khác nhau tuỳ nơi chạy |
| Cron job chạy theo giờ địa phương có DST | Chạy hai lần hoặc không chạy |
| Dùng timestamp xác định thứ tự nhân quả | Thấy "response trước request" |
| Timestamp làm khoá chính | Trùng khoá, ID không tăng dần |
| Không giám sát NTP | Vấn đề tồn tại hàng tuần không ai biết |
| "Ngày" không định nghĩa múi giờ | Báo cáo lệch số giữa các hệ thống |

## Tóm tắt case 9

- **`System.nanoTime()` để đo thời lượng; `Instant.now()` để ghi thời điểm.** Đừng lẫn lộn.
- Wall clock **có thể nhảy lùi** (NTP, chỉnh tay, VM khôi phục) — không bao giờ dùng nó để đo khoảng thời gian.
- **Clock skew** giữa các máy là chuyện bình thường (1-50 ms với NTP tốt) — luôn cho phép sai lệch khi xác thực token.
- **Không dùng timestamp để xác định thứ tự nhân quả** — dùng trace ID, Kafka offset, hoặc database sequence.
- Lưu thời gian bằng **UTC** (`Instant` / `TIMESTAMPTZ`); chỉ chuyển sang múi giờ địa phương khi hiển thị.
- Đặt tường minh **`TZ=UTC`** và **`-Duser.timezone=UTC`** cho container.
- Cron chạy theo giờ có DST sẽ **chạy hai lần hoặc bỏ qua** một ngày mỗi năm.
- Cảnh báo **`node_timex_sync_status == 0`** là một trong những cảnh báo rẻ và giá trị nhất.

**Bài kế tiếp** → [Bài tổng kết: Playbook chẩn đoán và bảng tra cứu toàn khoá](10-tong-ket-playbook.md)
