# Case 1: GC pause — khi JVM dừng cả thế giới

Biểu đồ latency của bạn trông như răng cưa:

```text
   p99 latency
   3000ms │      ▐            ▐            ▐            ▐
          │      ▐            ▐            ▐            ▐
   1000ms │      ▐            ▐            ▐            ▐
          │      ▐            ▐            ▐            ▐
     50ms │──────▐────────────▐────────────▐────────────▐──────
          └─────────────────────────────────────────────────→
                 ↑ cứ ~45 giây một lần, latency vọt lên 60 lần
```

Không có deploy nào. Traffic đều. Database khoẻ. Đúng chu kỳ đều đặn.

Đây là **GC pause** — và nó là nguồn sự cố mà nhiều đội mất hàng tuần để tìm ra, vì nó không xuất hiện trong log ứng dụng.

## Cơ chế: stop-the-world

**GC (Garbage Collection)** — cơ chế tự động thu hồi bộ nhớ của các object không còn được dùng.

**Stop-the-world (STW)** — trong một số giai đoạn, GC phải **dừng toàn bộ thread ứng dụng** để đảm bảo bộ nhớ không thay đổi trong lúc nó dọn dẹp.

```text
   Thời gian
   ────────────────────────────────────────────────────────→

   Thread 1  ████████████░░░░░░░░░░████████████
   Thread 2  ████████████░░░░░░░░░░████████████
   Thread 3  ████████████░░░░░░░░░░████████████
                          ↑
                    GC chạy — MỌI thread đứng im
                    Không có ngoại lệ, không có cách nào thoát.
```

Trong lúc STW:
- Request đang xử lý bị treo.
- Request mới xếp hàng.
- Health check không trả lời → có thể bị giết (phase-4 case 6).
- Heartbeat tới Kafka/ZooKeeper không gửi được → có thể bị coi là chết.
- Khoá phân tán có thể hết hạn mà bạn không biết (phase-3 case 6).

Điểm cuối cùng đáng nhớ: **GC pause phá vỡ mọi giả định về thời gian**. Code của bạn có thể "ngủ" 5 giây giữa hai dòng lệnh liên tiếp.

## Cấu trúc heap và các loại GC

```text
   ┌──────────────── HEAP ────────────────────────┐
   │                                               │
   │  YOUNG GENERATION          OLD GENERATION     │
   │  ┌─────┬──────┬──────┐    ┌────────────────┐ │
   │  │Eden │ S0   │ S1   │ →  │  Tenured       │ │
   │  └─────┴──────┴──────┘    └────────────────┘ │
   │   ↑ object mới sinh ở đây   ↑ object sống lâu│
   └───────────────────────────────────────────────┘

   Minor GC: dọn Young — nhanh (1-20 ms), xảy ra thường xuyên
   Major/Full GC: dọn Old — CHẬM (100 ms - vài giây), ít xảy ra
```

Nguyên lý nền tảng (**weak generational hypothesis**): phần lớn object chết trẻ. Vì vậy chia heap theo tuổi và dọn vùng trẻ thường xuyên là hiệu quả nhất.

### So sánh các thuật toán GC

| GC | Pause điển hình | Throughput | Heap phù hợp | Từ JDK |
|---|---|---|---|---|
| **Serial** | Rất dài | Thấp | < 100 MB | mọi phiên bản |
| **Parallel** | 100 ms - vài giây | **Cao nhất** | < 4 GB | mọi phiên bản |
| **G1** (mặc định) | 50-200 ms | Cao | 4-32 GB | 9+ |
| **ZGC** | **< 1 ms** | Trung bình | 8 GB - 16 TB | 15+ (generational từ 21) |
| **Shenandoah** | **< 10 ms** | Trung bình | 4 GB - 1 TB | 12+ |

**Hướng dẫn chọn**:

```text
   Ứng dụng web cần latency ổn định, heap 4-32 GB
   → G1 (mặc định) là đủ tốt. Chỉnh MaxGCPauseMillis.

   Cần p99 latency cực ổn định (giao dịch, real-time)
   → ZGC. Pause dưới 1 ms bất kể heap lớn cỡ nào.

   Batch job, ưu tiên tổng thời gian chạy hơn độ trễ
   → Parallel GC. Throughput cao nhất.

   Heap rất lớn (> 32 GB)
   → ZGC hoặc Shenandoah. G1 bắt đầu đuối.
```

```bash
# G1 — chỉnh mục tiêu pause
java -XX:+UseG1GC -XX:MaxGCPauseMillis=100 -jar app.jar

# ZGC — generational (JDK 21+), khuyến nghị cho dịch vụ nhạy latency
java -XX:+UseZGC -XX:+ZGenerational -jar app.jar
```

Lưu ý về `MaxGCPauseMillis`: đây là **mục tiêu**, không phải đảm bảo. Đặt quá thấp (ví dụ 10 ms) khiến G1 dọn quá thường xuyên, tốn CPU và giảm throughput.

## Chẩn đoán

### Bật log GC — làm ngay hôm nay

```bash
java -Xlog:gc*:file=/var/log/gc.log:time,uptime,level,tags:filecount=5,filesize=100M \
     -jar app.jar
```

Log này gần như không tốn chi phí và là thứ đầu tiên bạn cần khi điều tra. Nhiều đội chỉ bật nó **sau khi** đã có sự cố — và phải chờ sự cố tái diễn.

Đọc log:

```text
[2026-07-30T10:23:45.123+0700][45.123s][info][gc] GC(142) Pause Young (Normal)
    (G1 Evacuation Pause) 2048M->512M(4096M) 45.231ms
                          ↑     ↑     ↑        ↑
                     trước  sau  tổng heap   thời gian dừng

[2026-07-30T10:24:12.456+0700][72.456s][info][gc] GC(143) Pause Full
    (G1 Compaction Pause) 3890M->3820M(4096M) 4521.123ms
                                                ↑
                                     4,5 GIÂY! Và chỉ giải phóng 70 MB
                                     ⇒ Heap gần đầy, sắp OOM.
```

**Full GC giải phóng được rất ít** là dấu hiệu nguy hiểm nhất — nó nghĩa là phần lớn object đang thực sự được dùng (hoặc bị rò rỉ), và bạn sắp gặp `OutOfMemoryError` hoặc GC thrashing (phase-2 case 7).

### Metric cần theo dõi

```promql
# Thời gian dừng do GC — mục tiêu < 1% tổng thời gian
rate(jvm_gc_pause_seconds_sum[5m])

# p99 độ dài mỗi lần pause
histogram_quantile(0.99, rate(jvm_gc_pause_seconds_bucket[5m]))

# Tốc độ cấp phát bộ nhớ — chỉ số quan trọng nhất
rate(jvm_memory_allocated_bytes_total[5m])

# Heap sau GC — nếu tăng đơn điệu = rò rỉ bộ nhớ
jvm_memory_used_bytes{area="heap"}
```

**Tốc độ cấp phát (allocation rate)** là chỉ số bị bỏ qua nhiều nhất nhưng quan trọng nhất:

```text
   Tốc độ cấp phát cao → Young gen đầy nhanh → Minor GC thường xuyên
                       → object bị đẩy sang Old gen sớm ("premature promotion")
                       → Old gen đầy nhanh → Full GC

   ⇒ Giảm rác sinh ra hiệu quả hơn nhiều so với chỉnh tham số GC.
```

Quy tắc kinh nghiệm: tốc độ cấp phát dưới **1 GB/giây** là bình thường; trên đó nên xem lại code.

### Tìm nguồn sinh rác

```bash
# async-profiler ở chế độ allocation
./profiler.sh -e alloc -d 60 -f /tmp/alloc.html <pid>
```

Flame graph cho thấy chính xác dòng code nào cấp phát nhiều nhất. Thường là những chỗ bất ngờ:

| Nguồn rác thường gặp | Cách giảm |
|---|---|
| Nối chuỗi trong vòng lặp | `StringBuilder`, hoặc dùng log có tham số |
| Log ở mức DEBUG trên đường dẫn nóng | Kiểm tra `isDebugEnabled()` hoặc dùng lambda |
| Serialize/deserialize JSON lớn | Dùng streaming, tránh nạp cả cây object |
| Autoboxing (`Integer` thay `int`) | Dùng kiểu nguyên thuỷ, `IntStream` |
| Tạo `SimpleDateFormat`/`ObjectMapper` mỗi lần gọi | Tái sử dụng (chú ý thread-safety, phase-2 case 6) |
| Copy mảng/list không cần thiết | Dùng view, `subList`, tránh `toArray()` thừa |
| Đọc cả file vào bộ nhớ | Streaming |

```java
// Rất nhiều rác — chuỗi được nối kể cả khi DEBUG bị tắt
log.debug("Xử lý đơn " + orderId + " cho khách " + customerId);

// Không sinh rác nếu DEBUG tắt
log.debug("Xử lý đơn {} cho khách {}", orderId, customerId);
```

Đây là thay đổi nhỏ nhưng ở đường dẫn nóng với hàng nghìn request/giây, nó tạo ra khác biệt đo được.

## Bốn nguyên nhân phổ biến của GC pause dài

### 1. Heap quá nhỏ

Heap nhỏ → GC chạy liên tục. Dấu hiệu: Full GC thường xuyên, heap sau GC luôn gần mức tối đa.

```bash
-XX:MaxRAMPercentage=75.0     # dùng 75% RAM container
```

Vì sao 75% chứ không phải 100%? Vì ngoài heap còn có: metaspace, code cache, thread stack, bộ đệm native (DirectByteBuffer), và bản thân JVM. Đặt heap bằng RAM container là công thức để bị `OOMKilled` bởi Kubernetes.

### 2. Heap quá lớn

Nghe nghịch lý nhưng đúng: heap 64 GB nghĩa là GC phải quét nhiều hơn, và Full GC (nếu xảy ra) mất rất lâu.

```text
   Heap  4 GB → Full GC ~2 giây
   Heap 32 GB → Full GC ~15 giây
   Heap 64 GB → Full GC ~30 giây trở lên
```

Với G1, heap trên 32 GB nên cân nhắc đổi sang ZGC. Hoặc tốt hơn: **chạy nhiều instance heap nhỏ thay vì một instance heap khổng lồ**.

Còn một lý do kỹ thuật nữa: dưới 32 GB, JVM dùng **compressed oops** (con trỏ 32-bit) — tiết kiệm bộ nhớ đáng kể. Vượt qua ngưỡng này, con trỏ thành 64-bit và cùng lượng dữ liệu sẽ chiếm nhiều bộ nhớ hơn. Nghĩa là heap 33 GB có thể chứa **ít** object hơn heap 31 GB.

### 3. Humongous object (G1)

G1 chia heap thành các vùng (region). Object lớn hơn **nửa kích thước một region** được gọi là **humongous** và phải cấp phát liên tiếp trong Old gen — xử lý rất kém hiệu quả.

```text
   Region mặc định: heap / 2048, làm tròn về luỹ thừa của 2
   Heap 4 GB  → region 2 MB  → object > 1 MB là humongous
   Heap 16 GB → region 8 MB  → object > 4 MB là humongous
```

Nguồn humongous object phổ biến: mảng byte lớn (đọc file, ảnh), `ResultSet` lớn, chuỗi JSON khổng lồ, danh sách hàng trăm nghìn phần tử.

```bash
# Tăng kích thước region nếu ứng dụng hay tạo object lớn
-XX:G1HeapRegionSize=16m
```

Nhưng cách đúng hơn là **đừng tạo object lớn**: đọc file theo luồng, phân trang kết quả query, xử lý JSON theo streaming.

### 4. Rò rỉ bộ nhớ

Heap sau mỗi Full GC tăng dần → object không được giải phóng.

```text
   Heap sau Full GC:
   Ngày 1: 800 MB
   Ngày 2: 1,2 GB
   Ngày 3: 1,9 GB
   Ngày 4: OutOfMemoryError
```

Ba nguồn rò rỉ hàng đầu (đã nói ở phase-2 case 7): `static Map` làm cache không giới hạn, `ThreadLocal` không `remove()`, listener không huỷ đăng ký.

Chẩn đoán bằng heap dump và Eclipse MAT — tính năng "Leak Suspects" chỉ ra ngay đối tượng giữ nhiều bộ nhớ nhất và **chuỗi tham chiếu** giữ chúng sống.

## GC pause tương tác với các case khác

Đây là phần thú vị nhất — GC pause là "kẻ phá bĩnh" ẩn sau nhiều sự cố ở các phase trước:

| Tương tác | Hậu quả |
|---|---|
| GC pause 5 giây + liveness timeout 3 giây | **Pod bị giết** (phase-4 case 6) |
| GC pause + khoá phân tán TTL 10 giây | **Hai tiến trình cùng giữ khoá** (phase-3 case 6) |
| GC pause + Kafka `session.timeout.ms` | **Consumer bị loại, rebalance** |
| GC pause + timeout downstream | Lời gọi thất bại hàng loạt, cầu dao mở |
| GC pause đồng thời trên nhiều pod | Đỉnh latency đồng bộ toàn hệ thống |

Trường hợp thứ hai đáng suy nghĩ kỹ: bạn lấy khoá Redis TTL 10 giây, bị GC pause 15 giây, tỉnh dậy và **tưởng mình vẫn giữ khoá** trong khi một tiến trình khác đã lấy được. Không có cách nào phát hiện từ bên trong ứng dụng.

Vì vậy: **timeout ở mọi nơi phải lớn hơn GC pause tệ nhất của bạn**. Nếu p99.9 của GC pause là 800 ms, đừng đặt timeout nào dưới 2 giây.

## Giảm GC pause — theo thứ tự hiệu quả

| Bước | Việc làm | Hiệu quả |
|---|---|---|
| 1 | **Giảm tốc độ cấp phát** (sửa code sinh rác) | Cao nhất, và miễn phí |
| 2 | Đổi sang **ZGC** nếu cần latency ổn định | Rất cao, dễ |
| 3 | Chỉnh kích thước heap cho vừa | Trung bình |
| 4 | Tránh object lớn (humongous) | Trung bình |
| 5 | Chỉnh `MaxGCPauseMillis` | Thấp |
| 6 | Chỉnh các tham số GC chi tiết | Rất thấp, dễ làm hỏng |

Bước 6 đáng cảnh báo: các blog cũ đầy những "tham số GC thần kỳ" từ thời JDK 8. Với JDK hiện đại, GC tự điều chỉnh rất tốt, và việc chỉnh tay thường làm mọi thứ tệ hơn. **Chỉ chỉnh khi bạn đo được và hiểu vì sao.**

## Trường hợp thực tế: API giao dịch chứng khoán

Yêu cầu: p99 latency dưới 50 ms. Đo được: p99 = 45 ms nhưng **p99.9 = 2.100 ms**.

**Chẩn đoán**:

```text
   Log GC: G1, Full GC mỗi ~3 phút, mỗi lần 1.800-2.400 ms
   Tốc độ cấp phát: 3,2 GB/giây  ← rất cao
   Heap: 8 GB
```

**Tìm nguồn rác** bằng `-e alloc`:

```text
   47% : com.trading.MarketDataParser.parse(String)
         → Tạo mới ObjectMapper cho MỖI message thị trường (12.000 msg/giây)
   23% : java.lang.String.concat trong logging
   14% : Autoboxing trong vòng lặp tính toán chỉ số
```

**Các bước sửa và kết quả**:

| Bước | Thay đổi | Tốc độ cấp phát | p99.9 |
|---|---|---|---|
| 0 | Ban đầu | 3,2 GB/s | 2.100 ms |
| 1 | Tái sử dụng `ObjectMapper` (một instance dùng chung) | 1,7 GB/s | 1.150 ms |
| 2 | Sửa logging sang dạng tham số | 1,3 GB/s | 890 ms |
| 3 | Bỏ autoboxing, dùng `double[]` thay `List<Double>` | 0,8 GB/s | 520 ms |
| 4 | Đổi sang ZGC generational | 0,8 GB/s | **48 ms** |

Bước 4 cho kết quả ngoạn mục, nhưng ba bước trước cũng cần thiết: với tốc độ cấp phát 3,2 GB/giây, ngay cả ZGC cũng phải làm việc rất vất vả và tốn nhiều CPU.

Bài học: **ZGC không phải phép màu che giấu code sinh rác**. Nó cho bạn pause ngắn, nhưng vẫn tốn CPU tỉ lệ với lượng rác.

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Không bật log GC | Điều tra sự cố mà không có dữ liệu |
| Đặt heap = RAM container | Bị `OOMKilled` trước khi JVM kịp ném lỗi |
| Heap > 32 GB với G1 | Full GC hàng chục giây, mất compressed oops |
| Timeout nhỏ hơn GC pause tệ nhất | Lỗi ngẫu nhiên không giải thích được |
| Liveness probe nhạy hơn GC pause | Pod bị giết vì GC |
| Copy tham số GC từ blog cũ | JDK hiện đại tự điều chỉnh tốt hơn |
| Chỉnh GC mà không giảm rác | Chữa triệu chứng |
| Bỏ qua tốc độ cấp phát | Bỏ lỡ chỉ số quan trọng nhất |

## Tóm tắt case 1

- GC **stop-the-world** dừng **mọi** thread — phá vỡ mọi giả định về thời gian trong code.
- Chữ ký: **latency răng cưa theo chu kỳ đều đặn**, không liên quan tới traffic hay deploy.
- **Bật `-Xlog:gc*` ngay hôm nay** — gần như miễn phí và là dữ liệu đầu tiên bạn cần.
- Chỉ số quan trọng nhất: **tốc độ cấp phát**. Giảm rác hiệu quả hơn chỉnh tham số.
- **ZGC** cho pause dưới 1 ms; **G1** đủ tốt cho đa số; **Parallel** cho batch.
- Heap không nên vượt **32 GB** với G1 (mất compressed oops, Full GC rất lâu).
- Đặt `MaxRAMPercentage=75` trong container, không dùng 100%.
- **Mọi timeout phải lớn hơn GC pause tệ nhất** — kể cả TTL của khoá phân tán.

**Bài kế tiếp** → [Case 2: CPU throttling trên Kubernetes — bị bóp cổ mà không biết](02-case-cpu-throttling.md)
