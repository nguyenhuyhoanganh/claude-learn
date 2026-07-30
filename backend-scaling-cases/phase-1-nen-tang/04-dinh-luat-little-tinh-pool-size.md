# Bài 4: Định luật Little — tính chính xác cần bao nhiêu thread, bao nhiêu connection

"Đặt bao nhiêu thread là đủ?" là câu hỏi được trả lời sai nhiều nhất trong nghề backend. Câu trả lời phổ biến nhất trên các diễn đàn là "cứ tăng lên khi nào hết chậm thì thôi" — cách này vừa tốn RAM, vừa **làm hệ thống chậm hơn** trong nhiều trường hợp.

Thực ra có công thức. Bài này đưa bạn từ một định luật một dòng đến con số cụ thể để điền vào `application.yml`.

## Định luật Little

Nhà toán học John Little chứng minh năm 1961 một điều đúng với **mọi hàng đợi ổn định** — quán phở, sân bay, hay thread pool:

```text
                    L  =  λ  ×  W

   L (Length)     = số việc đang nằm trong hệ thống  (concurrency)
   λ (lambda)     = tốc độ việc đến                  (throughput, việc/giây)
   W (Wait)       = thời gian mỗi việc ở trong hệ thống (latency, giây)
```

Không cần giả định gì về phân bố xác suất, không cần biết việc đến đều hay dồn cục. Chỉ cần hệ thống ổn định (vào bao nhiêu ra bấy nhiêu) là đúng.

### Ví dụ đời thường trước

Quán phở, khách vào **2 người/phút**, mỗi người ngồi **15 phút**.

```text
   L = 2 × 15 = 30 người luôn có mặt trong quán
```

Muốn không ai phải đứng chờ, quán cần **30 ghế**. Nếu chỉ có 20 ghế, 10 người sẽ xếp hàng ngoài cửa — và hàng đó **dài mãi ra** chứ không dừng lại, vì tốc độ vào lớn hơn tốc độ phục vụ.

### Áp vào backend

```text
   Số thread cần  =  RPS  ×  latency trung bình (giây)
```

Ví dụ: API cần phục vụ **500 RPS**, mỗi request mất **200 ms**:

```text
   L = 500 × 0,2 = 100 thread
```

Đặt `threads.max: 100`. Đặt 200 là dư (tốn RAM), đặt 50 là hàng đợi phình vô hạn.

### Chiều ngược lại còn hữu ích hơn

Biến đổi công thức để **dự đoán hệ thống chịu được bao nhiêu**:

```text
   Throughput tối đa  =  số thread  ÷  latency

   200 thread ÷ 0,2 giây  =  1000 RPS
   200 thread ÷ 2,0 giây  =  100 RPS     ← latency ×10 thì công suất ÷10
```

Đây là công thức đáng giá nhất trong khoá học. Nó cho thấy: **giảm latency và tăng số thread có hiệu quả như nhau, nhưng giảm latency thì miễn phí, còn thêm thread thì tốn RAM và context switch.**

## Tính `threads.max` — quy trình 4 bước

### Bước 1: Đo latency thật (không đoán)

```promql
# Prometheus, latency trung bình 5 phút của endpoint
rate(http_server_requests_seconds_sum[5m])
  / rate(http_server_requests_seconds_count[5m])
```

Dùng **trung bình** ở đây là đúng (định luật Little dùng trung bình), khác với việc theo dõi sức khoẻ (dùng p99).

### Bước 2: Xác định RPS đỉnh cần phục vụ

Lấy RPS cao nhất 30 ngày qua, nhân hệ số dự phòng 1,5-2 lần.

### Bước 3: Áp công thức, cộng biên an toàn

```text
   threads = RPS_đỉnh × latency × 1,5
```

Hệ số 1,5 để hấp thụ dao động (traffic không tới đều mà tới cục — gọi là **burstiness**).

### Bước 4: Kiểm tra trần cứng

Kết quả không được vượt:

- **RAM**: mỗi thread ~1 MB stack. 500 thread = 500 MB. Container 512 MB thì không thể.
- **CPU**: nếu công việc là tính toán thuần thì thread nhiều hơn số core chỉ gây context switch.

```text
   Ví dụ hoàn chỉnh:
   RPS đỉnh = 800, latency = 150 ms, container 2 core / 1 GB RAM

   threads = 800 × 0,15 × 1,5 = 180
   Kiểm tra RAM: 180 MB stack trên 1 GB → chấp nhận được (nhưng sát)
   Kiểm tra: request có phải CPU-bound không? Nếu latency 150ms chủ yếu
             là chờ DB → OK. Nếu là tính toán → giảm còn ~8 và scale ngang.

   ⇒ threads.max: 180
```

## Tính `maximumPoolSize` cho HikariCP — nơi trực giác sai nhất

Trực giác nói: "200 thread thì cần 200 connection để không thread nào phải chờ". **Sai hoàn toàn**, và đây là sai lầm khiến rất nhiều hệ thống chậm đi sau khi "tối ưu".

### Vì sao pool lớn lại chậm hơn

Database **không** xử lý 200 query song song nhanh hơn 20 query song song. Lý do vật lý:

- Một câu query cần **CPU core** để tính. Máy DB 8 core thì tại một thời điểm chỉ 8 query thực sự chạy.
- Nếu đọc từ đĩa, số lượng I/O đồng thời hữu ích bị giới hạn bởi thiết bị.
- 200 connection nghĩa là 200 tiến trình/luồng trên DB giành nhau 8 core → **context switch điên cuồng**, mỗi query chậm hơn, tổng thông lượng **giảm**.
- PostgreSQL còn tệ hơn: mỗi connection là **một tiến trình OS riêng**, tốn 5-10 MB RAM và tham gia vào các cấu trúc dữ liệu nội bộ có độ phức tạp phụ thuộc số connection.

```text
   Thí nghiệm kinh điển (PostgreSQL, tài liệu HikariCP):

   Pool size 2048  →  throughput ~ 15.000 TPS,  latency ~ 100 ms
   Pool size 96    →  throughput ~ 15.000 TPS,  latency ~ 6 ms

   Cùng thông lượng. Pool nhỏ hơn 20 lần, latency tốt hơn 16 lần.
```

Ý nghĩa: hàng đợi phải nằm ở đâu đó. Thà để nó nằm **trong app** (nơi bạn kiểm soát được, có thể từ chối, có thể ưu tiên) còn hơn để nó nằm **trong database** (nơi nó làm chậm tất cả mọi người, kể cả query của hệ thống khác).

### Công thức chuẩn

```text
   pool size = (số core của DB × 2) + số ổ đĩa hiệu dụng
```

- **× 2**: mỗi core phục vụ được ~2 connection vì query luân phiên giữa tính toán và chờ I/O.
- **+ số ổ đĩa**: thêm chỗ cho các query đang chờ đĩa. Với SSD/NVMe hoặc cloud disk, cứ tính 1-2.

Ví dụ: DB 8 core, SSD → `(8 × 2) + 2 = 18`. Làm tròn **20**.

> **Quan trọng**: đây là tổng cho **toàn bộ** ứng dụng nối tới DB đó. Nếu bạn chạy 5 instance của cùng một service, mỗi instance đặt pool 20 thì DB nhận 100 connection. Phải chia: `20 / 5 = 4` mỗi instance, hoặc dùng một **connection pooler tập trung** như PgBouncer.

### Kiểm tra trần cứng của database

```sql
-- PostgreSQL
SHOW max_connections;   -- mặc định 100
SELECT count(*) FROM pg_stat_activity;

-- MySQL
SHOW VARIABLES LIKE 'max_connections';   -- mặc định 151
SHOW STATUS LIKE 'Threads_connected';
```

Tổng pool của **tất cả** ứng dụng + kết nối của tool quản trị + kết nối dự phòng cho superuser phải nhỏ hơn `max_connections`. Vượt qua thì bạn gặp `FATAL: sorry, too many clients already` — và éo le nhất là lúc đó **bạn cũng không vào được DB để sửa**, vì psql cũng cần một connection.

> PostgreSQL luôn để dành `superuser_reserved_connections` (mặc định 3) cho tình huống này. Đừng bao giờ chỉnh nó về 0.

## Công thức chống deadlock cho pool

Đây là công thức ít người biết nhưng cứu bạn khỏi một loại lỗi cực khó chẩn đoán.

Nếu **một tác vụ cần giữ đồng thời nhiều hơn một connection** (ví dụ: đang trong transaction, gọi một hàm khác cũng mở connection mới), pool có thể **deadlock** — mọi thread đều giữ 1 connection và đều chờ connection thứ 2 vốn không bao giờ có.

```text
   Pool = 10 connection, mỗi tác vụ cần 2 connection

   10 thread cùng chạy, mỗi thread giành được 1 connection → pool cạn
   Cả 10 thread chờ connection thứ 2 → không ai nhả → TREO VĨNH VIỄN
```

Công thức an toàn (từ *Java Concurrency in Practice*):

```text
   pool size  ≥  Tn × (Cm − 1) + 1

   Tn = số thread tối đa chạy đồng thời
   Cm = số connection tối đa MỘT tác vụ cần cùng lúc
```

Ví dụ: 50 thread, mỗi tác vụ cần tối đa 2 connection → `50 × (2−1) + 1 = 51`. 

Con số 51 nghe to. Đó là dấu hiệu bạn nên **sửa thiết kế** thay vì tăng pool: đừng để một tác vụ giữ hai connection. Trong Spring, nguyên nhân phổ biến nhất là `@Transactional(propagation = REQUIRES_NEW)` gọi lồng nhau. Phase-2 bài 4 sẽ mổ xẻ case này.

## Bảng tra nhanh

| Loại tài nguyên | Công thức | Ví dụ điển hình |
|---|---|---|
| Tomcat `threads.max` | `RPS × latency × 1,5` | 800 × 0,15 × 1,5 = 180 |
| Thread pool CPU-bound | `số core + 1` | 8 core → 9 |
| Thread pool I/O-bound | `số core × (1 + thời_gian_chờ/thời_gian_tính)` | 8 × (1 + 90/10) = 80 |
| HikariCP `maximumPoolSize` | `(core DB × 2) + số đĩa`, chia cho số instance | (8×2+2)/5 ≈ 4 |
| Pool chống deadlock | `Tn × (Cm−1) + 1` | 50 × 1 + 1 = 51 |
| Kafka consumer | `≤ số partition` | 12 partition → tối đa 12 |

Công thức I/O-bound đáng giải thích thêm: nếu request mất 100 ms trong đó 90 ms là **chờ** (database, HTTP) và 10 ms là **tính**, thì tỉ lệ chờ/tính = 9. Một core "nuôi" được 10 thread. 8 core → 80 thread. Công thức này (còn gọi là **Brian Goetz's formula**) khớp rất tốt với thực tế.

## USE method — quy trình tìm nút thắt

Trước khi tính toán, phải biết **cái gì đang là nút thắt**. Brendan Gregg đề xuất phương pháp **USE**: với mỗi tài nguyên, kiểm tra 3 thứ:

- **U — Utilization**: bận bao nhiêu phần trăm thời gian?
- **S — Saturation**: có hàng đợi không, dài bao nhiêu?
- **E — Errors**: có lỗi không?

| Tài nguyên | Utilization | Saturation | Errors |
|---|---|---|---|
| CPU | `%util` | load average, run queue | throttling (phase-6) |
| Bộ nhớ | heap used / max | tần suất GC, swap | `OutOfMemoryError` |
| Thread pool | `threads.busy / max` | số request chờ | request bị từ chối |
| Connection pool | `connections.active / max` | `connections.pending` | `connections.timeout` |
| Database | CPU/IO của DB | số query đang chờ lock | deadlock, timeout |
| Đĩa | `%util` (iostat) | độ sâu hàng đợi | lỗi I/O |
| Mạng | băng thông dùng/tổng | gói tin bị drop | lỗi TCP retransmit |

Quy tắc: đi từ trên xuống, **tài nguyên đầu tiên có Saturation > 0 chính là nút thắt**. Đừng tối ưu cái gì khác trước khi xử lý nó — theo lý thuyết ràng buộc, cải thiện chỗ không phải nút thắt không làm hệ thống nhanh hơn một chút nào.

## Case thực tế: tính lại toàn bộ cho một service

Bối cảnh: service `order-service`, chạy 4 instance trên Kubernetes, mỗi pod 2 core / 2 GB. Database PostgreSQL 8 core. Đo được:

```text
   RPS đỉnh (tổng, cả 4 pod)  : 1200
   Latency trung bình          : 180 ms
     ├─ 30 ms  : tính toán (CPU)
     ├─ 120 ms : chờ database
     └─ 30 ms  : chờ service thanh toán
   p99 hiện tại                : 3,5 giây  ← có vấn đề
```

**Bước 1 — thread cần bao nhiêu?**

```text
   Tổng: 1200 × 0,18 × 1,5 = 324 thread
   Mỗi pod: 324 / 4 = 81  →  làm tròn 100
```

**Bước 2 — connection pool bao nhiêu?**

```text
   Trần DB: (8 × 2) + 2 = 18 connection cho TOÀN BỘ hệ thống
   Mỗi pod: 18 / 4 ≈ 4  →  đặt 5, để dành chút cho tool quản trị
```

**Bước 3 — kiểm tra tính nhất quán bằng định luật Little (chiều ngược)**

```text
   Thông lượng DB tối đa = pool_tổng / thời_gian_giữ_connection
                         = 18 / 0,12 giây
                         = 150 query/giây

   Nhưng ta cần 1200 RPS, mỗi RPS ít nhất 1 query!
   ⇒ 1200 > 150  →  DATABASE LÀ NÚT THẮT, không phải thread.
```

Đây là khoảnh khắc "à ra thế". Tăng thread lên 100 hay 1000 đều vô nghĩa — DB chỉ nuốt được 150 query/giây với thời gian giữ connection 120 ms.

**Bước 4 — sửa đúng chỗ**

| Hướng | Cách làm | Kết quả |
|---|---|---|
| Giảm thời gian giữ connection | Thêm index, bỏ N+1 query, đừng gọi HTTP trong transaction | 120 ms → 10 ms ⇒ 18/0,01 = **1800 query/s** |
| Giảm số query | Cache đọc bằng Redis, gộp query | 1200 → 300 query/s |
| Tăng công suất DB | Read replica cho query đọc, nâng cấu hình | 150 → 400 |
| Tăng pool (**chỉ khi DB còn dư CPU**) | 18 → 30 | 150 → 250, latency DB xấu đi |

Thứ tự đúng là từ trên xuống. **Giảm thời gian giữ connection cho hiệu quả lớn nhất và rẻ nhất** — thường chỉ là thêm một index và bỏ một lời gọi HTTP nằm nhầm chỗ trong transaction.

Bài học tổng quát: khi latency giảm 12 lần, công suất tăng 12 lần **mà không tốn thêm một đồng phần cứng nào**. Đây là lý do tối ưu latency luôn được ưu tiên hơn tăng tài nguyên.

## Bẫy thường gặp

| Bẫy | Vì sao sai |
|---|---|
| Đặt pool DB = số thread | DB không chạy song song nhiều thế; latency xấu đi, thông lượng không tăng |
| Quên nhân với số instance | 5 pod × pool 20 = 100 connection, vượt `max_connections` |
| Dùng p99 trong công thức Little | Định luật Little dùng **trung bình** |
| Tính một lần rồi để mãi | Latency thay đổi theo mùa, theo dữ liệu lớn dần → tính lại định kỳ |
| Tăng thread khi DB là nút thắt | Chỉ chuyển hàng đợi từ app xuống DB, làm mọi thứ tệ hơn |
| Bỏ qua các pool khác | HTTP client (Feign/RestTemplate) cũng có pool riêng, mặc định thường rất nhỏ |

Bẫy cuối cùng rất hay gặp: Apache HttpClient mặc định `maxTotal = 20` và `defaultMaxPerRoute = **2**`. Nghĩa là dù bạn có 200 thread, **chỉ 2 request cùng lúc được gửi tới mỗi host đích**. Rất nhiều "service chậm bí ẩn" chỉ là con số 2 này.

## Khi nào KHÔNG áp dụng máy móc

- **Traffic rất không đều** (đỉnh gấp 20 lần trung bình): công thức Little cho giá trị trung bình. Với đỉnh nhọn, cần thêm hàng đợi có giới hạn + load shedding (phase-4).
- **Latency có phương sai lớn** (từ 10 ms đến 10 giây): trung bình vô nghĩa. Hãy **tách endpoint nhanh và chậm ra pool riêng** — đó chính là bulkhead (phase-2 bài 5).
- **Đã dùng virtual thread / async**: khái niệm "thread" thay đổi, nhưng định luật Little vẫn đúng — chỉ là L bây giờ đếm số tác vụ chứ không phải số OS thread. Nút thắt dời xuống connection pool và database (phase-2 bài 8).

## Tóm tắt bài 4

- **`L = λ × W`** — số việc đồng thời = throughput × latency. Đúng với mọi hàng đợi.
- `threads.max = RPS × latency × 1,5`.
- `maximumPoolSize = (core DB × 2) + số đĩa`, **chia cho số instance**. Pool nhỏ thường nhanh hơn pool lớn.
- Pool chống deadlock: `Tn × (Cm − 1) + 1`. Nếu con số quá to → sửa thiết kế.
- Thread pool I/O-bound: `core × (1 + chờ/tính)`.
- Dùng **USE method** để tìm nút thắt trước khi tính bất cứ thứ gì.
- **Giảm latency luôn rẻ hơn tăng tài nguyên** — giảm 12 lần latency = tăng 12 lần công suất, miễn phí.

**Bài kế tiếp** → [Bài 5: Lý thuyết hàng đợi — vì sao 80% tải làm latency gấp đôi, 95% làm gấp 20 lần](05-ly-thuyet-hang-doi.md)
