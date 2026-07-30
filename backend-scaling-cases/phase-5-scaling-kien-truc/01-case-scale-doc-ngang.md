# Case 1: Scale dọc hay scale ngang — và vì sao monolith khó scale

Bốn phase trước đều nói về **làm sao dùng tốt tài nguyên đang có**. Phase này nói về chuyện khác: **khi nào thì thêm tài nguyên, và thêm kiểu gì**.

Bắt đầu bằng câu chuyện mà mọi hệ thống đều trải qua.

## Hiện tượng

```text
   Năm 1: 1.000 người dùng.   1 server 4 core / 8 GB.  Mọi thứ hoàn hảo.
   Năm 2: 50.000 người dùng.  Nâng lên 16 core / 64 GB. Vẫn ổn.
   Năm 3: 500.000 người dùng. Nâng lên 64 core / 256 GB. Bắt đầu chậm.
   Năm 4: 2 triệu người dùng.

          Không còn máy nào to hơn để mua.
          Và kỳ lạ hơn: máy 64 core chỉ nhanh hơn máy 16 core khoảng 1,8 lần,
          dù giá đắt gấp 6 lần.
```

Hai vấn đề riêng biệt lộ ra ở đây, và cần tách bạch:

1. **Có trần cứng** — không thể mua máy to vô hạn.
2. **Hiệu quả giảm dần** — gấp 4 lần tài nguyên không cho gấp 4 lần công suất.

## Scale dọc (vertical scaling / scale up)

Làm máy hiện tại mạnh hơn: thêm CPU, RAM, ổ đĩa nhanh hơn.

| Ưu điểm | Nhược điểm |
|---|---|
| **Không đổi code gì cả** | Có trần cứng (máy lớn nhất trên thị trường) |
| Không phải xử lý phân tán | Giá tăng **phi tuyến** — máy gấp đôi thường đắt hơn gấp đôi |
| Không có độ trễ mạng nội bộ | Điểm hỏng đơn (single point of failure) |
| Transaction ACID vẫn đơn giản | Nâng cấp thường cần dừng dịch vụ |
| Debug dễ | Hiệu quả giảm dần (định luật Amdahl) |

**Khi nào scale dọc là lựa chọn đúng**: gần như **luôn luôn là bước đầu tiên**.

Đây là điều nhiều kỹ sư mới bỏ qua vì "microservice mới hiện đại". Nhưng thực tế: một máy 64 core / 512 GB RAM hiện nay xử lý được lượng tải mà 10 năm trước cần cả một cụm máy. Rất nhiều công ty có thể chạy toàn bộ nghiệp vụ trên một máy chủ lớn với chi phí vận hành thấp hơn nhiều so với một hệ phân tán.

**Nguyên tắc thực dụng**: đừng phân tán cho tới khi bạn buộc phải phân tán. Mỗi bước phân tán mua thêm khả năng mở rộng bằng cách trả giá bằng độ phức tạp — và độ phức tạp là thứ tốn kém nhất trong dài hạn.

## Scale ngang (horizontal scaling / scale out)

Thêm nhiều máy, chia tải giữa chúng.

| Ưu điểm | Nhược điểm |
|---|---|
| Về lý thuyết không có trần | **Ứng dụng phải stateless** (case 2) |
| Giá tăng tuyến tính | Cần load balancer, service discovery |
| Chịu lỗi tốt (một máy chết vẫn chạy) | Vấn đề nhất quán dữ liệu |
| Nâng cấp không cần dừng (rolling update) | Debug khó hơn nhiều |
| Dùng máy phổ thông, rẻ | Vẫn có trần (case USL bên dưới) |

## Vì sao scale ngang cũng có trần

Đây là phần quan trọng nhất của bài, và là chỗ trực giác sai nhiều nhất.

Nhớ lại Universal Scalability Law (phase-1 bài 5):

```text
                        N
   C(N) = ───────────────────────────────
           1 + α(N−1) + βN(N−1)

   α = contention  — tranh chấp tài nguyên dùng chung
   β = coherency   — chi phí đồng bộ giữa các node
```

```text
   Công suất
      │           ╱─╲
      │        ╱      ╲___         ← thêm máy làm CHẬM ĐI
      │      ╱             ╲___
      │    ╱
      │  ╱
      └────────────────────────────→ Số instance
          ↑ điểm tối ưu
```

Trong hệ thống thực, α và β đến từ đâu?

| Nguồn | Loại | Ví dụ cụ thể |
|---|---|---|
| Database chung | α | 50 instance cùng ghi vào một bảng |
| Dòng nóng | α | Mọi instance cùng UPDATE một dòng tồn kho (phase-3 case 4) |
| Lock phân tán | α | Mọi instance tranh một khoá Redis |
| Cache invalidation | β | Mỗi thay đổi phải báo cho N−1 node khác |
| Session replication | β | Mọi node phải biết session của mọi node |
| Service discovery | β | N node × N node kết nối |

**Trong hầu hết hệ thống, α chính là database.** Đây là lý do câu nói "chỉ cần thêm pod là xong" gần như luôn sai — bạn thêm pod thì database nhận nhiều connection hơn, nhiều query hơn, nhiều tranh chấp lock hơn.

### Cách đo xem bạn đang ở đâu trên đường cong

```text
   Chạy thử với 2, 4, 8, 16 instance, đo throughput ở mỗi mức:

   2 instance  →  1.000 RPS   (500 RPS/instance)
   4 instance  →  1.900 RPS   (475 RPS/instance)   ← đã giảm 5%
   8 instance  →  3.200 RPS   (400 RPS/instance)   ← giảm 20%
   16 instance →  4.400 RPS   (275 RPS/instance)   ← giảm 45%!

   ⇒ Đang tiến gần điểm bão hoà. Thêm instance không còn hiệu quả.
   ⇒ Phải đi tìm và giảm α trước khi thêm máy.
```

Chỉ số cần theo dõi: **throughput trên mỗi instance**. Nếu nó giảm khi thêm instance, bạn đang trả tiền cho tài nguyên không dùng được.

## Vì sao monolith khó scale — phân tích trung thực

"Monolith khó scale" là câu nói được lặp lại nhiều tới mức ít ai hỏi **chính xác là khó ở đâu**. Có bốn lý do thật, và một số lý do giả.

### Lý do thật 1: Không tách được tài nguyên theo nhu cầu

```text
   Monolith có 5 module với nhu cầu rất khác nhau:

   ┌────────────────────────────────────────────────────┐
   │  MONOLITH (mỗi instance chứa TẤT CẢ)               │
   │  ├─ Xử lý ảnh      : cần nhiều CPU                 │
   │  ├─ Tìm kiếm       : cần nhiều RAM                 │
   │  ├─ Đặt hàng       : cần ít, nhưng traffic cao     │
   │  ├─ Báo cáo        : chạy vài lần/ngày, rất nặng   │
   │  └─ Gửi email      : hầu như không tốn gì          │
   └────────────────────────────────────────────────────┘

   Module xử lý ảnh cần thêm CPU
   ⇒ Phải nhân bản TOÀN BỘ monolith
   ⇒ Trả tiền cho cả tìm kiếm, báo cáo, email — những thứ không cần thêm
```

Đây là lý do **kinh tế** rõ ràng nhất và khó phản bác.

### Lý do thật 2: Không cách ly được sự cố

Đã trình bày kỹ ở phase-2 case 1 và case 5. Một module lỗi ăn hết thread pool của mọi module.

Nhưng lưu ý: **bulkhead giải quyết được phần lớn vấn đề này ngay trong monolith**. Đây không phải lý do bắt buộc phải tách service.

### Lý do thật 3: Database chung là điểm nghẽn α

Mọi module dùng chung một database. Báo cáo chạy nặng làm chậm đặt hàng. Đây là contention ở mức cao nhất.

Giải pháp trong monolith: pool riêng, read replica cho báo cáo (phase-2 case 2). Giải quyết được phần lớn, nhưng không phải tất cả.

### Lý do thật 4: Ràng buộc tổ chức

50 lập trình viên cùng làm trên một codebase, cùng deploy một artifact. Mỗi lần deploy phải phối hợp giữa các đội, mỗi lỗi của một đội chặn deploy của mọi đội.

Đây thực ra là **lý do phổ biến nhất khiến các công ty tách microservice** — và nó là lý do về tổ chức, không phải về kỹ thuật. Điều đó hoàn toàn hợp lệ; chỉ cần gọi đúng tên.

### Lý do giả 1: "Monolith không scale ngang được"

**Sai.** Monolith stateless scale ngang rất tốt: nhân bản 50 instance sau load balancer là chuyện bình thường. Nhiều hệ thống lớn chạy monolith với hàng trăm instance.

Cái không scale được là **database**, không phải tầng ứng dụng. Và tách microservice **không tự động** giải quyết vấn đề database.

### Lý do giả 2: "Microservice nhanh hơn"

**Sai, thường ngược lại.** Một lời gọi hàm trong monolith mất ~10 nano-giây. Cùng lời gọi đó qua HTTP giữa hai service mất ~1 mili-giây — **chậm hơn 100.000 lần**.

```text
   Monolith:      request → 5 lời gọi hàm → 2 ms tổng
   Microservice:  request → 5 lời gọi HTTP → 2 ms + 5 ms mạng = 7 ms

   Và mỗi lời gọi mạng đều có thể thất bại (phase-4 tail latency).
```

Microservice mua **khả năng mở rộng độc lập và tự chủ cho từng đội**, trả giá bằng **latency và độ phức tạp**. Đó là một đánh đổi hợp lý ở quy mô nhất định, nhưng không phải là "nhanh hơn".

## Ba bước đúng trước khi nghĩ tới microservice

### Bước 1: Đảm bảo ứng dụng stateless

Không stateless thì không scale ngang được, dù monolith hay microservice. Case 2 dành trọn cho chủ đề này.

### Bước 2: Tách tầng ứng dụng khỏi tầng dữ liệu

```text
   [LB] → [app × N]  ← scale ngang thoải mái, stateless
              ↓
        [database]   ← nút thắt thật sự
```

Sau bước này, bạn scale được tầng ứng dụng tới khi database trở thành nút thắt. Với nhiều hệ thống, mốc đó rất xa.

### Bước 3: Scale tầng dữ liệu theo thứ tự chi phí tăng dần

| Bước | Kỹ thuật | Độ phức tạp | Giới hạn |
|---|---|---|---|
| 3.1 | **Tối ưu query, thêm index** (phase-3) | Rất thấp | Thường cải thiện 10-100 lần |
| 3.2 | **Cache** (phase-4 case 2) | Thấp | Giảm 90%+ tải đọc |
| 3.3 | **Read replica** (case 5) | Trung bình | Chỉ giúp đọc, có độ trễ |
| 3.4 | **Async hoá bằng queue** (case 4) | Trung bình | Giảm tải ghi tức thời |
| 3.5 | **Tách database theo module** | Cao | Mất JOIN, mất transaction chung |
| 3.6 | **Sharding** (case 6) | **Rất cao** | Gần như không giới hạn |

**Làm theo đúng thứ tự.** Rất nhiều đội nhảy thẳng từ 3.1 lên 3.6 và tạo ra một hệ thống phức tạp gấp mười lần trong khi chỉ cần thêm hai cái index.

## Autoscaling — tự động scale ngang

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: order-service
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: order-service
  # Số pod tối thiểu — luôn giữ ít nhất 3 để chịu được việc mất 1 pod.
  minReplicas: 3
  # Số pod tối đa. Nếu database là nút thắt, giới hạn con số này theo
  # max_connections: maxReplicas × maximum-pool-size phải < max_connections.
  maxReplicas: 30

  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          # Utilization = tính theo % của `requests.cpu`, không phải % của limit.
          type: Utilization
          # Ngưỡng 60%: khi CPU trung bình vượt 60% thì thêm pod.
          # Không đặt 90% — vì lý thuyết hàng đợi cho biết ở 90% tải
          # latency đã gấp 10 lần, và pod mới cần 60-180 giây mới sẵn sàng.
          averageUtilization: 60

  # `behavior` điều khiển TỐC ĐỘ scale — phần hay bị bỏ qua nhất.
  behavior:
    scaleUp:
      # Nhìn lại 30 giây gần nhất để quyết định tăng.
      # Ngắn = phản ứng nhanh khi tải tăng (thiếu pod thì mất dịch vụ).
      stabilizationWindowSeconds: 30
      policies:
        - type: Percent
          value: 100                     # được phép GẤP ĐÔI số pod...
          periodSeconds: 30              # ...mỗi 30 giây
    scaleDown:
      # Nhìn lại 300 giây trước khi quyết định giảm.
      # Dài = giảm CHẬM, tránh dao động lên xuống liên tục (flapping).
      # Bất đối xứng có chủ ý: tăng thiếu thì mất dịch vụ,
      # giảm chậm chỉ tốn thêm chút tiền.
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 20                      # mỗi lần chỉ bớt tối đa 20% số pod
          periodSeconds: 60
```

Bốn nguyên tắc quan trọng:

**1. Tăng nhanh, giảm chậm.** Tăng thiếu thì mất dịch vụ; giảm chậm chỉ tốn thêm chút tiền. Sự bất đối xứng này phải phản ánh trong cấu hình.

**2. Ngưỡng 60%, không phải 90%.** Vì thời gian khởi động pod mới không phải tức thì — bạn cần khoảng đệm để sống sót trong lúc chờ.

**3. Cẩn thận với autoscale khi database là nút thắt.** Thêm pod = thêm connection tới database. Nếu database đang là α, autoscaling làm mọi thứ tệ hơn (phase-4 case 7).

```yaml
# Nếu database là nút thắt, giới hạn maxReplicas theo max_connections
maxReplicas: 15        # 15 pod × pool 5 = 75 connection < max_connections 100
```

**4. Scale theo chỉ số đúng.** CPU thường không phải chỉ số tốt cho ứng dụng I/O-bound. Dùng metric tuỳ chỉnh:

```yaml
metrics:
  - type: Pods
    pods:
      metric:
        name: tomcat_threads_busy_ratio     # tỉ lệ thread bận
      target:
        type: AverageValue
        averageValue: "0.7"
```

Hoặc scale theo **độ dài hàng đợi** với hệ thống xử lý bất đồng bộ — đây thường là chỉ số tốt nhất vì nó phản ánh trực tiếp nhu cầu:

```yaml
# KEDA — scale theo Kafka consumer lag
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
spec:
  triggers:
    - type: kafka
      metadata:
        topic: orders
        lagThreshold: "1000"
```

### Cảnh báo: autoscaling không cứu được đỉnh nhọn

```text
   Đỉnh flash sale: tải tăng 40× trong 10 GIÂY

   Thời gian pod mới sẵn sàng:
   ├─ Kubernetes lập lịch pod:      2-5 giây
   ├─ Kéo image (nếu chưa có):     10-60 giây
   ├─ JVM khởi động:               20-60 giây
   ├─ Warm-up (phase-4 case 6):    30-60 giây
   └─ TỔNG:                        60-180 giây

   ⇒ Đỉnh đã qua từ lâu trước khi pod mới sẵn sàng.
```

Với đỉnh nhọn dự đoán được (sale, sự kiện), phải **scale trước theo lịch**:

```yaml
# CronJob điều chỉnh minReplicas trước sự kiện
apiVersion: batch/v1
kind: CronJob
metadata:
  name: prescale-flashsale
spec:
  schedule: "50 19 * * *"          # 19:50, sale bắt đầu 20:00
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: kubectl
              image: bitnami/kubectl
              command:
                - kubectl
                - patch
                - hpa/order-service
                - --patch
                - '{"spec":{"minReplicas":50}}'
```

Với đỉnh không dự đoán được, phải dựa vào **load shedding** (phase-4 case 4), không phải autoscaling.

## Bảng quyết định

```text
   Hệ thống chậm. Nên làm gì?
   │
   ├─ Đã tối ưu query/index chưa?
   │    → Chưa: làm trước. Thường cải thiện 10-100 lần, gần như miễn phí.
   │
   ├─ Đã có cache chưa?
   │    → Chưa: thêm. Giảm 90% tải đọc.
   │
   ├─ CPU/RAM của một instance đã dùng hết chưa?
   │    → Chưa: nút thắt ở chỗ khác (I/O, lock, downstream). Tìm bằng USE method.
   │    → Rồi: scale dọc nếu còn máy to hơn (rẻ và đơn giản nhất)
   │
   ├─ Ứng dụng stateless chưa?
   │    → Chưa: làm stateless trước (case 2)
   │    → Rồi: scale ngang
   │
   ├─ Throughput/instance có giảm khi thêm instance không?
   │    → Có: đang chạm α (thường là database). Đi giảm α trước.
   │    → Không: cứ thêm instance
   │
   └─ Database là nút thắt?
        → Theo thứ tự: index → cache → read replica → async → tách DB → sharding
```

## Trường hợp thực tế: hành trình 4 năm

Một nền tảng giáo dục trực tuyến, từ 10.000 lên 3 triệu người dùng:

| Giai đoạn | Người dùng | Kiến trúc | Điều học được |
|---|---|---|---|
| Năm 1 | 10 nghìn | Monolith, 1 server, 1 PostgreSQL | Đủ dùng. Không tối ưu gì cả. |
| Năm 2 | 100 nghìn | Monolith 4 instance + LB, PostgreSQL lớn hơn | Chỉ cần làm stateless (bỏ session trong bộ nhớ) |
| Năm 2,5 | 300 nghìn | Thêm Redis cache, 2 read replica | Cache giảm 85% tải database |
| Năm 3 | 1 triệu | Tách **video-service** (ngốn băng thông) và **report-service** (ngốn CPU) | Chỉ tách 2 module có nhu cầu tài nguyên khác biệt rõ rệt |
| Năm 3,5 | 2 triệu | Async hoá: chấm bài, gửi mail, thống kê qua Kafka | Giảm 60% tải ghi lên database chính |
| Năm 4 | 3 triệu | Sharding bảng `submission` (bảng lớn nhất) theo `course_id` | Chỉ shard **một** bảng, không shard toàn bộ |

Nhận xét quan trọng: **họ vẫn còn monolith ở năm thứ 4**. Chỉ tách ra những module có lý do rõ ràng (nhu cầu tài nguyên khác biệt), và chỉ shard một bảng thay vì cả database.

Chi phí hạ tầng qua các năm không tăng tuyến tính theo người dùng — vì mỗi lần tối ưu (cache, async) đều giảm nhu cầu tài nguyên trên mỗi người dùng.

Và điều họ tiếc nhất: **năm thứ 3 từng thử tách 12 microservice cùng lúc, mất 6 tháng và phải quay lại**. Bài học: tách từng cái một, khi có lý do cụ thể, và đo kết quả trước khi tách cái tiếp theo.

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Nhảy thẳng sang microservice | Độ phức tạp gấp 10 lần mà không giải quyết được nút thắt thật (database) |
| Thêm instance khi database là nút thắt | Tệ hơn: nhiều connection, nhiều tranh chấp hơn |
| Autoscale ngưỡng 90% CPU | Không kịp scale trước khi sập |
| Tin autoscaling xử lý được đỉnh nhọn | Pod mới cần 60-180 giây |
| Không đo throughput/instance | Không biết mình đang ở đâu trên đường cong USL |
| Scale dọc tới trần rồi mới nghĩ tới scale ngang | Bị dồn vào chân tường, phải làm gấp |
| Bỏ qua scale dọc vì "không hiện đại" | Bỏ lỡ giải pháp đơn giản nhất và rẻ nhất |
| Tách nhiều service cùng lúc | Không đo được cái nào có tác dụng |

## Tóm tắt case 1

- **Scale dọc luôn là bước đầu tiên** — không đổi code, không thêm độ phức tạp. Máy hiện đại rất mạnh.
- Scale ngang cần **stateless**, và cũng **có trần** do α (contention) và β (coherency) trong USL.
- Chỉ số quyết định: **throughput trên mỗi instance**. Giảm khi thêm máy = đang chạm α.
- Trong hầu hết hệ thống, **α chính là database**.
- Monolith khó scale vì: không tách được tài nguyên theo nhu cầu, không cách ly sự cố, database chung, và **ràng buộc tổ chức**.
- Microservice **không nhanh hơn** — lời gọi mạng chậm hơn lời gọi hàm 100.000 lần.
- Thứ tự đúng: **index → cache → read replica → async → tách DB → sharding**.
- Autoscaling: **tăng nhanh giảm chậm, ngưỡng 60%**, và **không cứu được đỉnh nhọn** — phải scale trước theo lịch.

**Bài kế tiếp** → [Case 2: Trạng thái trong bộ nhớ — thứ chặn đường scale ngang](02-case-stateful-can-scale.md)
