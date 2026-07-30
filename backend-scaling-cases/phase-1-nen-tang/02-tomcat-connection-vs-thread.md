# Bài 2: max-connections, accept-count, threads.max — ba con số hay bị hiểu nhầm nhất

Mở file `application.yml` của một dự án Spring Boot bất kỳ, 95% khả năng bạn không thấy dòng nào về Tomcat. Nghĩa là app đang chạy với mặc định. Và mặc định đó là:

```yaml
server:
  tomcat:
    max-connections: 8192       # nhận tối đa 8192 kết nối cùng lúc
    accept-count: 100           # hàng chờ của hệ điều hành
    threads:
      max: 200                  # 200 luồng xử lý thật sự
      min-spare: 10             # luôn giữ sẵn 10 luồng
    connection-timeout: 20000ms # 20 giây
    keep-alive-timeout: 20000ms
    max-keep-alive-requests: 100
```

Bài này giải thích chính xác từng con số, chúng tương tác với nhau ra sao, và vì sao **8192 không phải là "app chịu được 8192 người"**.

## Ẩn dụ quán ăn — nhớ một lần dùng cả đời

```text
           accept-count = 100        max-connections = 8192      threads.max = 200
        ┌────────────────────┐    ┌─────────────────────────┐  ┌─────────────────┐
        │  Vỉa hè trước cửa  │ →  │   Sảnh chờ trong quán   │→ │   Bàn ăn (200)  │
        │  Đứng được 100 người│    │  Chứa được 8192 người   │  │ Ăn thật ở đây  │
        │  Đầy → đuổi về      │    │  Đầy → không mở cửa nữa │  │                 │
        └────────────────────┘    └─────────────────────────┘  └─────────────────┘
             "Connection             "Đang chờ, chưa được         "Đang được xử lý"
              refused"                 phục vụ"
```

- **Vào được quán (connection) ≠ được phục vụ (thread).**
- Người trong sảnh **vẫn đang đếm giờ chờ**. Chờ quá lâu, client bỏ cuộc → timeout.
- Chỉ 200 người được ăn cùng lúc. Muốn phục vụ nhanh hơn: **ăn nhanh hơn** (giảm thời gian xử lý) hoặc **kê thêm bàn** (tăng thread — nhưng có giới hạn, xem bài 4).

## Từng tham số, chi tiết

### `accept-count` — hàng đợi của hệ điều hành

Khi client bắt tay TCP xong, kết nối nằm trong một hàng đợi **do kernel (nhân hệ điều hành) quản lý**, chờ ứng dụng gọi `accept()` để nhận. Hàng đợi này gọi là **accept queue** hay **backlog**.

- Mặc định Tomcat: **100**.
- Đầy thì sao? Kernel **từ chối kết nối mới**. Client nhận `ECONNREFUSED` — trong Java là `java.net.ConnectException: Connection refused`.

> Lưu ý: giá trị thực tế còn bị chặn bởi tham số kernel `net.core.somaxconn` (Linux hiện đại mặc định 4096). Nếu bạn đặt `accept-count: 10000` mà `somaxconn` là 4096, giá trị thật là 4096.

**Khi nào tăng?** Khi traffic có đỉnh nhọn rất ngắn (burst) và bạn muốn "hứng" tạm thay vì từ chối. **Khi nào giảm?** Khi bạn muốn **fail nhanh** thay vì để client chờ vô ích — triết lý "fail fast" (hỏng thì hỏng ngay, đừng ngắc ngoải).

### `max-connections` — số kết nối Tomcat chịu quản

Số kết nối TCP mà Tomcat đồng ý giữ đồng thời.

- Mặc định: **8192** với connector NIO (mặc định của Spring Boot).
- Khi đạt ngưỡng, Tomcat **ngừng gọi `accept()`**. Kết nối mới dồn ngược về accept queue. Accept queue đầy nốt → `Connection refused`.

Vì sao con số này lớn hơn số thread rất nhiều? Vì nhờ **NIO (Non-blocking I/O)**, một kết nối đang mở mà **không có dữ liệu** thì không tốn thread nào — chỉ tốn một chút bộ nhớ và một **file descriptor**.

> **File descriptor (fd)** — một số nguyên hệ điều hành cấp cho mỗi thứ mà tiến trình mở: file, socket, pipe. Mỗi kết nối TCP tốn 1 fd. Linux mặc định giới hạn 1024 fd/tiến trình — quá thấp so với 8192. Đây là lý do container chạy Java hay phải đặt `ulimit -n 65535`. Nếu không, bạn gặp `java.net.SocketException: Too many open files`. (Xem phase-6.)

### `threads.max` — số luồng xử lý, con số quan trọng nhất

Số worker thread tối đa trong pool. Mặc định **200**.

Đây là **giới hạn thật sự về số request được xử lý song song**. 

**Vì sao lại là 200?** Không có phép màu nào — đó là con số kinh nghiệm Tomcat chọn từ đầu những năm 2000. Nó **không** được tính theo số CPU của bạn. Máy 2 core hay 64 core, mặc định vẫn 200. Bài 4 sẽ dạy cách tính con số đúng cho hệ thống của bạn.

**Chi phí của một thread**: mỗi Java thread có stack riêng, mặc định **1 MB** (`-Xss1m`). 200 thread = ~200 MB bộ nhớ chỉ cho stack. Đặt `threads.max: 5000` trên container 512 MB RAM là công thức để nhận `OutOfMemoryError: unable to create new native thread`.

### `min-spare` — luồng giữ sẵn

Mặc định **10**. Tomcat luôn giữ ít nhất 10 thread sống, kể cả lúc không có traffic. Thread mới được tạo dần khi tải tăng.

Hệ quả tinh vi: **cú sốc traffic đầu tiên sẽ chậm** vì phải tạo thread mới (tạo một OS thread tốn ~50-100 micro-giây, chưa kể JIT chưa "nóng" — xem phase-6). Nếu hệ thống của bạn có burst đều đặn, tăng `min-spare` lên 50 là hợp lý.

### `connection-timeout` — chờ client gửi request bao lâu

Mặc định **20 giây**. Sau khi kết nối mở, nếu client không gửi dòng request nào trong 20 giây, Tomcat đóng kết nối.

Con số này là tuyến phòng thủ trước **Slowloris** — kiểu tấn công mở thật nhiều kết nối rồi gửi dữ liệu nhỏ giọt để chiếm hết `max-connections`. Xem phase-6.

### `keep-alive-timeout` và `max-keep-alive-requests`

- `keep-alive-timeout` (20s): giữ kết nối mở bao lâu sau khi trả response, chờ request tiếp theo.
- `max-keep-alive-requests` (100): một kết nối được dùng lại tối đa 100 lần rồi bị đóng.

Đặt `max-keep-alive-requests: -1` = không giới hạn. Nghe hấp dẫn nhưng nguy hiểm khi có load balancer: kết nối không bao giờ đóng → khi bạn thêm instance mới, **traffic cũ không tự chuyển sang instance mới** vì kết nối cũ vẫn dính chặt vào instance cũ.

## Chuyện gì xảy ra khi 10.000 request tới cùng lúc

Đây là case gốc của khoá học. Giả sử mỗi request mất **100 ms** để xử lý.

```text
  t = 0 ms
  ├─ 100 request  → vào thẳng accept queue → Tomcat accept ngay
  ├─ 8192 request → được accept, giữ trong max-connections
  ├─ 200 request  → được giao thread, BẮT ĐẦU CHẠY
  ├─ 7992 request → nằm chờ trong Tomcat, chưa có thread
  └─ 1808 request → accept queue đầy → CONNECTION REFUSED ngay lập tức

  t = 100 ms   → 200 request đầu xong, 200 request tiếp được cấp thread
  t = 200 ms   → xong 400
  ...
  t = 4096 ms  → xong 8192  (8192 / 200 × 100 ms ≈ 4,1 giây)
```

Vấn đề lộ ra ngay: **request cuối cùng phải chờ 4,1 giây**. Nếu client đặt timeout 3 giây (rất phổ biến), **hơn 2000 request bị timeout dù server vẫn đang chạy hoàn toàn khoẻ mạnh.**

Và đó mới là kịch bản đẹp — mỗi request 100 ms. Nếu một request bị chậm thành 5 giây vì database khoá:

```text
  t = 4096 ms  → cần: 4,1 giây     (request 100 ms)
  t = 204 giây → cần: 3,4 PHÚT     (request 5 giây)
```

**Latency tăng 50 lần thì thời gian giải phóng hàng đợi cũng tăng 50 lần.** Đây là lý do vì sao "chỉ chậm một chút" ở tầng database lại làm sập cả hệ thống — nội dung chính của phase-2 và phase-3.

## Bảng: đầy hàng nào thì triệu chứng gì

| Hàng đầy | Client thấy gì | Log server thấy gì | Nhận diện |
|---|---|---|---|
| accept queue (`accept-count`) | `Connection refused` ngay lập tức | thường **không có log gì** — kernel từ chối, app không biết | Lỗi tức thì, không phải timeout |
| `max-connections` | treo rồi timeout | không có log | Client chờ lâu rồi bỏ cuộc |
| thread pool | chậm dần rồi timeout | latency tăng, `http.server.requests` p99 vọt | CPU thấp mà chậm |
| connection pool DB | 500 sau đúng 30 giây | `Connection is not available, request timed out after 30000ms` | Rất dễ nhận |

Điểm đáng nhớ: **hai hàng đầu gần như không để lại log trên app**. Nếu chỉ nhìn log app, bạn sẽ thấy "app vẫn bình thường" trong khi người dùng kêu trời. Phải nhìn metric ở tầng dưới (bài 6).

## Cấu hình thực tế theo loại workload

Không có con số vạn năng. Chọn theo **bản chất công việc**:

| Loại API | Đặc điểm | `threads.max` gợi ý | Lý do |
|---|---|---|---|
| Tính toán thuần (CPU-bound) | mã hoá, nén, xử lý ảnh | **số core × 1-2** (vd 8) | Thêm thread không giúp gì, chỉ tốn context switch |
| Gọi DB nhanh (I/O-bound nhẹ) | CRUD đơn giản, 5-20 ms | 50-200 | Thread chờ I/O nhiều hơn tính |
| Gọi service ngoài chậm | gọi API đối tác 500 ms+ | 200-800 **kèm bulkhead** | Thread chờ lâu; nhưng phải cô lập (phase-2 bài 5) |
| Trả file/stream lớn | tải file, SSE, WebSocket | dùng **async** thay vì tăng thread | Thread bị giam cả phút |

Ví dụ cấu hình cho một service CRUD điển hình trên container 2 core / 2 GB RAM:

```yaml
server:
  tomcat:
    threads:
      max: 100            # 200 là thừa cho 2 core; 100 vừa đủ, tiết kiệm RAM
      min-spare: 20       # ấm sẵn để burst đầu không chậm
    max-connections: 2000 # không cần 8192 nếu LB đã giới hạn
    accept-count: 100
    connection-timeout: 5s   # fail nhanh, chống Slowloris
    keep-alive-timeout: 15s
  # Rất quan trọng: pool DB phải cân xứng với số thread (xem phase-2 bài 2)
spring:
  datasource:
    hikari:
      maximum-pool-size: 20
      connection-timeout: 3000
```

> **Nguyên tắc vàng**: `threads.max` lớn mà `maximum-pool-size` nhỏ thì thread chỉ đứng xếp hàng chờ kết nối DB — bạn tốn RAM cho 200 thread mà thông lượng vẫn bằng 20. Hai con số này phải được chọn **cùng nhau**.

## Tự kiểm chứng — thí nghiệm 10 phút

Tạo một endpoint chậm giả:

```java
@RestController
public class SlowController {
    @GetMapping("/slow")
    public String slow() throws InterruptedException {
        Thread.sleep(2000);            // giả lập DB/downstream chậm 2 giây
        return "done";
    }
}
```

Đặt `threads.max: 10` cho dễ quan sát, rồi bắn tải bằng `hey` (hoặc `ab`, `wrk`):

```bash
hey -n 100 -c 100 http://localhost:8080/slow
```

Kết quả dự đoán được: 100 request, mỗi "đợt" 10 cái, mỗi đợt 2 giây → tổng ~20 giây.

```text
Summary:
  Total:        20.1 secs
  Requests/sec: 4.97          ← đúng bằng 10 thread / 2 giây

Latency distribution:
  50% in 10.0 secs
  99% in 20.0 secs            ← request cuối chờ gần hết 20 giây
```

Bài học ngay từ thí nghiệm này: **throughput (thông lượng) = số thread ÷ thời gian mỗi request**. Công thức này chính là định luật Little, bài 4 sẽ nói kỹ.

## Bẫy thường gặp

| Bẫy | Vì sao sai | Làm đúng |
|---|---|---|
| Tăng `max-connections` để "chịu tải hơn" | Chỉ làm hàng chờ dài hơn, không xử lý nhanh hơn. Người dùng chờ lâu hơn rồi vẫn timeout | Giảm thời gian xử lý, hoặc thêm instance |
| Đặt `threads.max: 2000` | Tốn ~2 GB stack, context switch nhiều, chậm hơn cả trước | Tính theo bài 4, thường 50-400 |
| Để `connection-timeout` mặc định 20s trên API public | Mở đường cho Slowloris | 3-5 giây |
| Chỉnh Tomcat mà quên HikariCP | Nút thắt thật nằm ở pool DB | Chỉnh cả hai cùng lúc |
| Nghĩ `max-connections` = số user đồng thời | Một trang web mở 6 kết nối/tab (HTTP/1.1) | Đo bằng metric thật |
| Copy cấu hình từ blog về production | Blog không biết workload của bạn | Đo, rồi chỉnh, rồi đo lại |

## Khi nào KHÔNG nên đụng vào các con số này

Nếu bạn chưa **đo** được rằng thread pool là nút thắt, đừng chỉnh. Thứ tự đúng luôn là:

1. Đo p99 latency và tỉ lệ lỗi (bài 3).
2. Xem thread pool có thật sự cạn không: metric `tomcat.threads.busy` chạm `tomcat.threads.config.max` (bài 6).
3. Nếu cạn → hỏi tiếp: **thread đang bận làm gì?** (thread dump). 99% trường hợp câu trả lời là "đang chờ I/O" → sửa chỗ chờ, không phải tăng thread.
4. Chỉ khi thật sự cần mới chỉnh số.

Tăng `threads.max` khi nguyên nhân là database chậm cũng giống như mở thêm quầy thu ngân khi máy quẹt thẻ hỏng — chỉ làm đám đông tràn vào nhanh hơn.

## Tóm tắt bài 2

- `accept-count` (100) = vỉa hè, đầy thì **Connection refused**.
- `max-connections` (8192) = sảnh chờ, đầy thì client **treo rồi timeout**.
- `threads.max` (200) = bàn ăn — **giới hạn xử lý song song thật sự**.
- Nhận kết nối không tốn thread (nhờ NIO), nhưng tốn **file descriptor**.
- Thời gian giải phóng hàng đợi tỉ lệ thuận với latency: latency ×50 thì thời gian chờ ×50.
- `threads.max` và `maximum-pool-size` của HikariCP phải chọn **cùng nhau**, không tách rời.
- Tăng số chỉ chữa triệu chứng. Luôn hỏi trước: **thread đang bận chờ cái gì?**

**Bài kế tiếp** → [Bài 3: Latency, throughput, p99 — đọc số liệu sao cho không bị lừa](03-latency-throughput-percentile.md)
