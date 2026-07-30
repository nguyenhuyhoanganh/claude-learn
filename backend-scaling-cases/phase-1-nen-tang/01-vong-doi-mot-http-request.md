# Bài 1: Một HTTP request thực sự đi qua những đâu?

Bạn viết một hàm 5 dòng:

```java
@GetMapping("/orders/{id}")
public Order getOrder(@PathVariable Long id) {
    return orderRepository.findById(id).orElseThrow();
}
```

Người dùng bấm vào link, 80 mili-giây sau thấy dữ liệu. Giữa hai thời điểm đó có **ít nhất 9 chặng**, mỗi chặng là một nơi có thể tắc. Nếu không biết 9 chặng này, mỗi lần hệ thống chậm bạn chỉ có thể đoán mò. Bài này vẽ đủ 9 chặng, và định nghĩa mọi thuật ngữ xuất hiện.

## Bức tranh tổng thể

```text
 [1]        [2]        [3]           [4]          [5]        [6]
Browser →  DNS  →  Load Balancer → Web Server → Hàng đợi → Thread
                                   (Tomcat)     (queue)   (worker)
                                                              │
                                                              ▼
                                                         [7] Code
                                                          của bạn
                                                              │
                                                              ▼
                                     [9] Response  ←  [8] Database
                                                       (qua connection pool)
```

Ta đi từng chặng.

## Chặng 1-2: Từ trình duyệt đến địa chỉ IP

**HTTP (HyperText Transfer Protocol)** — giao thức quy định định dạng của "câu hỏi" (request) và "câu trả lời" (response) giữa client và server. Nó chỉ là quy ước về **nội dung tin nhắn**, không lo việc vận chuyển.

**TCP (Transmission Control Protocol)** — giao thức lo việc **vận chuyển**: đảm bảo dữ liệu tới nơi đúng thứ tự, không mất. HTTP chạy *bên trên* TCP.

**DNS (Domain Name System)** — "danh bạ" của Internet, đổi tên miền `shop.vn` thành địa chỉ IP `203.0.113.10`.

**Connection (kết nối)** — một "đường ống" TCP đã được thiết lập giữa hai máy. Muốn có nó, hai bên phải bắt tay trước:

```text
 Client                              Server
   │  ── SYN ──────────────────────→  │   "Tôi muốn kết nối"
   │  ←──────────────────── SYN-ACK ─ │   "OK, tôi cũng sẵn sàng"
   │  ── ACK ──────────────────────→  │   "Chốt"
   │                                  │
   │  ══ Kết nối đã mở, gửi HTTP ═══  │
```

Ba bước này gọi là **three-way handshake** (bắt tay ba bước). Nó tốn **một vòng đi-về mạng** — thuật ngữ là **RTT (Round-Trip Time)**, thời gian gói tin đi và về. Trong cùng datacenter, RTT khoảng 0,5 ms; từ Việt Nam sang Singapore khoảng 30-50 ms.

> **Vì sao cần nhớ điều này?** Vì mở kết nối là việc **đắt**. Đây chính là lý do tồn tại của *connection pool* (bài 2 và phase-2) và của *keep-alive*.

**Keep-alive** — cơ chế giữ kết nối TCP mở sau khi trả response, để request tiếp theo dùng lại, khỏi bắt tay lần nữa. Mặc định HTTP/1.1 bật keep-alive.

## Chặng 3: Load Balancer

**Load balancer (bộ cân bằng tải)** — một máy đứng trước nhiều server ứng dụng, nhận request rồi chia đều xuống. Ví dụ: Nginx, HAProxy, AWS ALB.

**Reverse proxy (proxy ngược)** — máy đứng *trước* server để nhận request thay server. Load balancer là một dạng reverse proxy. ("Ngược" vì proxy thường đứng trước *client*; cái này đứng trước *server*.)

```text
                     ┌──→ App instance 1  (Tomcat, 200 thread)
   Internet → [LB] ──┼──→ App instance 2  (Tomcat, 200 thread)
                     └──→ App instance 3  (Tomcat, 200 thread)
```

Đây là chỗ đầu tiên bạn có thể **scale horizontally** — *scale ngang*, nghĩa là thêm máy. Đối lập là **scale vertically** — *scale dọc*, nghĩa là làm máy hiện tại mạnh hơn (thêm CPU/RAM). Phase-5 sẽ đào sâu.

## Chặng 4: Web server / Servlet container

Trong Spring Boot, khi bạn chạy `java -jar app.jar`, có một **web server nhúng** (embedded) khởi động cùng. Mặc định là **Tomcat**.

**Servlet container** — phần mềm chịu trách nhiệm: mở cổng mạng, nhận byte thô từ TCP, dịch thành đối tượng `HttpServletRequest`, tìm đúng hàm controller của bạn để gọi, rồi dịch giá trị trả về thành byte gửi ngược lại. Tomcat, Jetty, Undertow đều là servlet container.

Bên trong Tomcat có 3 loại luồng khác nhau — đây là chi tiết mà 90% lập trình viên Spring không biết, và là gốc rễ của rất nhiều case trong khoá này:

```text
   ┌──────────────────────── TOMCAT ─────────────────────────┐
   │                                                          │
   │  [Acceptor thread]  ← 1 luồng, chỉ làm 1 việc:           │
   │        │              nhận kết nối TCP mới (accept())    │
   │        ▼                                                 │
   │  [Poller thread]    ← vài luồng, canh xem kết nối nào    │
   │        │              đã có đủ dữ liệu để đọc            │
   │        ▼                                                 │
   │  [Worker thread pool] ← 200 luồng, ĐÂY mới là nơi        │
   │                         code của bạn chạy                │
   └──────────────────────────────────────────────────────────┘
```

- **Acceptor**: chỉ bắt tay TCP rồi ném kết nối vào danh sách. Rất nhanh, gần như không bao giờ là nút thắt.
- **Poller**: dùng cơ chế **NIO (Non-blocking I/O)** — một luồng canh được hàng nghìn kết nối cùng lúc, chỉ đánh thức khi kết nối nào đó có dữ liệu.
- **Worker**: mỗi request được giao cho **đúng một** worker thread, và thread đó bị **giữ** cho tới khi request xong. Đây gọi là mô hình **thread-per-request** (mỗi request một luồng).

> **Thread (luồng)** — đơn vị thực thi của hệ điều hành. Một CPU core tại một thời điểm chỉ chạy được một thread. Muốn chạy 200 thread trên 4 core, hệ điều hành phải liên tục đổi qua đổi lại — gọi là **context switch** (chuyển ngữ cảnh), và mỗi lần đổi tốn 1-10 micro-giây.

## Chặng 5: Hàng đợi — nơi mọi hiểu lầm bắt đầu

Câu hỏi then chốt: **nếu 10.000 request tới cùng lúc mà chỉ có 200 worker thread thì sao?**

Chúng **không bị từ chối ngay**. Chúng xếp hàng. Có tận **ba hàng đợi** chồng lên nhau:

```text
  10.000 request tới
        │
        ▼
  ┌─────────────────────────────────────────────────────┐
  │ HÀNG 1: accept queue của hệ điều hành                │
  │ Kết nối đã bắt tay xong, chờ Tomcat gọi accept()     │
  │ Sức chứa: accept-count = 100 (mặc định)              │
  │ Đầy → hệ điều hành từ chối thẳng (Connection refused)│
  └─────────────────────────────────────────────────────┘
        │
        ▼
  ┌─────────────────────────────────────────────────────┐
  │ HÀNG 2: kết nối đang mở, Tomcat đang quản            │
  │ Sức chứa: max-connections = 8192 (mặc định)          │
  │ Đầy → không accept nữa, dồn ngược về HÀNG 1          │
  └─────────────────────────────────────────────────────┘
        │
        ▼
  ┌─────────────────────────────────────────────────────┐
  │ HÀNG 3: request chờ tới lượt có worker thread        │
  │ Sức chứa: xem như bằng max-connections               │
  └─────────────────────────────────────────────────────┘
        │
        ▼
  ┌─────────────────────────────────────────────────────┐
  │ 200 worker thread — chỗ duy nhất code thực sự chạy   │
  └─────────────────────────────────────────────────────┘
```

**Đây là hiểu lầm số 1 của người mới**: nghĩ rằng `max-connections = 8192` nghĩa là "app xử lý được 8192 request cùng lúc". Sai. 8192 là **số vé gửi xe**, 200 mới là **số bàn ăn**. 7992 người còn lại đang đứng chờ trong sảnh — và họ *vẫn đang tính giờ chờ*, vẫn sẽ timeout nếu chờ quá lâu.

Bài 2 sẽ mổ xẻ từng tham số này với con số cấu hình thật.

## Chặng 6-7: Thread chạy code của bạn

Worker thread nhận request, gọi vào chuỗi:

```text
Filter (bảo mật, log)
   → DispatcherServlet (Spring: tìm controller nào khớp URL)
      → Interceptor
         → Controller  ← code bạn viết
            → Service
               → Repository
```

Trong suốt chuỗi này, thread đó **thuộc về riêng request này**. Nếu code của bạn gọi `Thread.sleep(10000)`, thread đó nằm chơi 10 giây và không ai khác dùng được. Nếu code gọi HTTP sang service khác mà service đó chậm 30 giây, thread đó bị "giam" 30 giây.

> Nhớ kỹ ý này. **Toàn bộ phase-2 chỉ là các biến thể của một câu: "cái gì đang giam thread của tôi?"**

## Chặng 8: Database qua connection pool

Code gọi database. Nhưng nó **không tự mở kết nối** tới database — nó **mượn** một kết nối có sẵn từ **connection pool** (bể kết nối).

**Connection pool** — một tập kết nối tới database được mở sẵn từ lúc khởi động, dùng đi dùng lại. Lý do: mở kết nối tới PostgreSQL tốn 20-50 ms (bắt tay TCP + xác thực + có khi cả TLS + PostgreSQL còn `fork` hẳn một tiến trình mới). Mở lại mỗi request là lãng phí khủng khiếp.

Trong Spring Boot mặc định là **HikariCP**, và mặc định **chỉ có 10 kết nối**.

```text
   200 worker thread                HikariCP pool
   ┌──────────┐                    ┌──────────────┐
   │ thread 1 │──── mượn ─────────→│ conn 1  BUSY │
   │ thread 2 │──── mượn ─────────→│ conn 2  BUSY │
   │   ...    │                    │  ...         │
   │ thread 10│──── mượn ─────────→│ conn 10 BUSY │
   │ thread 11│──── CHỜ ──────╳    └──────────────┘
   │   ...    │                     hết sạch rồi!
   │ thread200│──── CHỜ ──────╳
   └──────────┘
```

**Đây là hiểu lầm số 2**: 200 thread nhưng chỉ 10 kết nối DB. Nghĩa là dù Tomcat cho phép 200 request chạy song song, nếu request nào cũng cần database thì **thực tế chỉ 10 cái chạy được**, 190 cái còn lại đứng chờ mượn kết nối, và sau 30 giây (mặc định `connectionTimeout`) sẽ nhận lỗi:

```text
java.sql.SQLTransientConnectionException:
HikariPool-1 - Connection is not available, request timed out after 30000ms
```

Nếu bạn từng thấy dòng log này — bạn vừa gặp case đầu tiên của khoá học. Phase-2 bài 2 dành trọn cho nó.

## Chặng 9: Response quay về

Kết quả được **serialize** (chuyển đối tượng Java thành chuỗi JSON), ghi ngược ra kết nối TCP, worker thread được **trả về pool**, kết nối DB được **trả về pool**. Vòng đời khép lại.

Điểm quan trọng: **thread chỉ được trả lại pool khi request kết thúc hoàn toàn**. Không có chuyện "trả tạm thread ra trong lúc chờ database" trong mô hình thread-per-request cổ điển.

## Bảng tổng kết: mỗi chặng hỏng kiểu gì

| Chặng | Tài nguyên giới hạn | Cạn kiệt thì biểu hiện ra sao | Học ở |
|---|---|---|---|
| Bắt tay TCP | file descriptor của OS | `Too many open files` | phase-1 bài 6 |
| Load balancer | kết nối tối đa của LB | `502 Bad Gateway`, `504 Gateway Timeout` | phase-4 |
| Accept queue | `accept-count` = 100 | `Connection refused` | phase-1 bài 2 |
| Kết nối Tomcat | `max-connections` = 8192 | client treo, chờ vô thời hạn | phase-1 bài 2 |
| Worker thread | `threads.max` = 200 | request xếp hàng, p99 tăng vọt | phase-2 bài 1 |
| Connection pool | `maximumPoolSize` = 10 | `Connection is not available` | phase-2 bài 2 |
| Database | lock, CPU, `max_connections` | query chậm, deadlock | phase-3 |
| Service phụ thuộc | thread bị giam | sập dây chuyền | phase-4 |

## So sánh nhanh với các nền tảng khác

Không phải ngôn ngữ nào cũng dùng thread-per-request. Hiểu điểm khác biệt giúp bạn đọc được case ở mọi stack:

| Nền tảng | Mô hình | Một request "chiếm" cái gì | Nút thắt điển hình |
|---|---|---|---|
| Spring MVC (Java) | thread-per-request | 1 OS thread (~1 MB stack) | hết 200 thread |
| Spring WebFlux (Java) | event loop + non-blocking | 1 đối tượng nhỏ trong bộ nhớ | chặn nhầm event loop |
| Node.js | 1 event loop + libuv thread pool | 1 callback/promise | code CPU nặng làm nghẽn event loop |
| Go | goroutine | 1 goroutine (~2 KB stack) | hết connection DB, hết bộ nhớ |
| Python + Gunicorn (sync) | process/thread-per-request | 1 worker process | số worker rất nhỏ (2×core+1) |

Điểm chung: **luôn có một tài nguyên hữu hạn nào đó bị chiếm giữ trong lúc request chạy**. Tên gọi khác nhau, bản chất giống hệt.

## Khi nào bạn KHÔNG cần quan tâm bài này

Thành thật: nếu hệ thống của bạn phục vụ dưới ~50 request/giây, mọi mặc định đều dư dùng và việc chỉnh tham số là **tối ưu sớm** (premature optimization) — tốn thời gian, dễ chỉnh sai hơn là để nguyên. Kiến thức này cần khi:

- Traffic có đỉnh (sale, tin nóng, cron chạy đồng loạt).
- App gọi sang service ngoài mà bạn không kiểm soát tốc độ.
- Bạn thấy p99 latency cao bất thường dù CPU chỉ 20%.

Dấu hiệu cuối cùng đó cực kỳ đáng nhớ: **CPU thấp mà vẫn chậm = đang chờ, không phải đang tính**. Chờ ở đâu — đó là toàn bộ nội dung khoá này.

## Tóm tắt bài 1

- Một request đi qua 9 chặng; mỗi chặng có một tài nguyên hữu hạn riêng.
- Tomcat có 3 loại thread: acceptor (bắt tay), poller (canh dữ liệu), **worker (chạy code — chỉ 200)**.
- Có **ba hàng đợi** chồng nhau trước khi tới worker thread: accept queue (100), max-connections (8192), rồi chờ thread.
- **Nhận kết nối ≠ xử lý được**. 8192 là vé gửi xe, 200 là bàn ăn.
- Connection pool mặc định chỉ **10** — thường là nút thắt thật sự, không phải 200 thread.
- Triệu chứng vàng: **CPU thấp + latency cao = đang chờ tài nguyên nào đó**.

**Bài kế tiếp** → [Bài 2: max-connections, accept-count, threads.max — ba con số hay bị hiểu nhầm nhất](02-tomcat-connection-vs-thread.md)
