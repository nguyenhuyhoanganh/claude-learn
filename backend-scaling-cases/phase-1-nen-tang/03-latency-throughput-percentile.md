# Bài 3: Latency, throughput, p99 — đọc số liệu sao cho không bị lừa

Sếp hỏi: "API đặt hàng nhanh không?". Bạn mở dashboard, thấy **average response time: 120 ms**, trả lời "nhanh ạ". Hai tuần sau bộ phận chăm sóc khách hàng báo có hàng trăm khiếu nại "app treo khi đặt hàng".

Cả hai đều đúng. Vấn đề là **con số trung bình đã nói dối bạn**. Bài này dạy cách đọc số liệu hiệu năng để không bao giờ bị lừa nữa — và giải thích vì sao dân trong nghề chỉ nhìn p99 chứ không nhìn average.

## Bốn khái niệm nền tảng

### Latency (độ trễ)

Thời gian từ lúc gửi request đến lúc nhận đủ response. Đơn vị: mili-giây (ms).

Cần phân biệt hai loại đo ở hai chỗ khác nhau — chúng chênh nhau rất nhiều và đây là nguồn cãi nhau bất tận giữa dev và QA:

```text
   ├──────────────── Latency phía CLIENT (cái người dùng cảm nhận) ────────────────┤
   │                                                                               │
Client ─(mạng)→ [LB] ─→ [xếp hàng chờ thread] ─→ [xử lý] ─→ [chờ DB] ─→ ... ─(mạng)→ Client
                                                 │           │
                                                 ├───────────┤
                                                 Latency phía SERVER
                                                 (cái dashboard của bạn hiển thị)
```

**Server-side latency** chỉ đếm từ lúc thread bắt đầu chạy. Thời gian request **nằm chờ trong hàng đợi** không được tính. Khi hệ thống quá tải, đây chính là phần lớn nhất — nên dashboard vẫn xanh trong khi người dùng đang chửi.

> Bài học: luôn có ít nhất một phép đo **từ ngoài vào** (synthetic monitoring, hoặc metric ở load balancer). Chỉ tin dashboard app là tự bịt mắt.

### Throughput (thông lượng)

Số request xử lý xong trong một đơn vị thời gian. Đơn vị: **RPS** (requests per second) hoặc **QPS** (queries per second), hoặc **TPS** (transactions per second).

### Concurrency (số việc đang chạy đồng thời)

Số request **đang dở dang** tại một thời điểm. Khác với throughput: throughput là "bao nhiêu cái xong mỗi giây", concurrency là "bao nhiêu cái đang treo lơ lửng".

### Utilization (mức sử dụng)

Tỉ lệ thời gian một tài nguyên bận. CPU 70% nghĩa là 70% thời gian CPU đang tính toán. Thread pool utilization = `threads.busy / threads.max`.

### Ba khái niệm này liên quan với nhau bằng một công thức duy nhất

```text
   Concurrency = Throughput × Latency
   (số việc đang chạy) = (việc/giây) × (giây/việc)
```

Đây là **định luật Little (Little's Law)**, bài 4 sẽ dùng nó để tính số thread. Ví dụ nhanh: nếu app xử lý 500 RPS và mỗi request mất 0,2 giây thì luôn có 500 × 0,2 = **100 request đang chạy đồng thời** → cần ít nhất 100 thread.

## Vì sao "trung bình" nói dối

Giả sử trong 1 phút có 10.000 request:

```text
  9.900 request  →  50 ms
     100 request  →  8.000 ms  (8 giây — vì đụng phải database lock)

  Trung bình = (9900×50 + 100×8000) / 10000 = 129 ms
```

Dashboard hiện **129 ms — trông rất đẹp**. Nhưng thực tế **100 người dùng phải chờ 8 giây**, và họ chính là những người viết review 1 sao.

Với 10.000 request/phút, con số "1% chậm" nghĩa là **6 người mỗi giây gặp trải nghiệm tệ**. Ở quy mô lớn hơn, "0,1% chậm" vẫn là hàng nghìn người mỗi ngày.

### Percentile — cách đọc đúng

**Percentile (phân vị)**: sắp xếp toàn bộ latency từ nhỏ đến lớn, p99 là giá trị ở vị trí 99%.

- **p50** (median, trung vị): một nửa số request nhanh hơn con số này. Đây là "trải nghiệm điển hình".
- **p95**: 95 trong 100 request nhanh hơn.
- **p99**: 99 trong 100 nhanh hơn — **1 trong 100 chậm hơn**.
- **p999** (p99.9): 1 trong 1000 chậm hơn.
- **max**: request tệ nhất.

Với ví dụ trên:

| Chỉ số | Giá trị | Nói lên điều gì |
|---|---|---|
| average | 129 ms | Vô dụng, che giấu vấn đề |
| p50 | 50 ms | Đa số người dùng thấy nhanh |
| p95 | 50 ms | Vẫn nhanh |
| **p99** | **8.000 ms** | **Có vấn đề nghiêm trọng!** |
| max | 8.100 ms | Trường hợp tệ nhất |

Chỉ p99 nói lên sự thật. Quy tắc thực chiến: **theo dõi p50 để biết trải nghiệm điển hình, p99 để biết chỗ hỏng, và tuyệt đối không đặt cảnh báo dựa trên average.**

### Bẫy: không được cộng/lấy trung bình các percentile

Bạn có 3 server, mỗi server p99 = 300 ms. p99 của toàn hệ thống **không phải** 300 ms — có thể cao hơn nhiều. Percentile không cộng được. Muốn đúng, phải gộp dữ liệu thô rồi tính lại (các hệ metric hiện đại dùng cấu trúc **histogram** để làm việc này).

Tương tự, p99 của 5 phút vừa rồi **không phải** trung bình của p99 từng phút.

## Tail latency amplification — vì sao microservice hay chậm

**Tail latency** (độ trễ đuôi) — nhóm request chậm nhất, phần "đuôi" của biểu đồ phân bố.

Đây là hiệu ứng khiến kiến trúc microservice dễ chậm hơn monolith, và ít người mới biết:

Giả sử API của bạn gọi song song **10 service**, mỗi service có p99 = 1 giây (nghĩa là 99% nhanh, 1% chậm). Response chỉ trả về khi **cả 10 đều xong**. Xác suất **cả 10 cùng nhanh**:

```text
   0,99 ^ 10 = 0,904  →  chỉ 90,4%

   ⇒ 9,6% số request sẽ chạm phải ít nhất một service chậm
   ⇒ p99 của bạn KHÔNG phải 1 giây; p90 của bạn đã là 1 giây rồi!
```

```text
   Số service gọi   →   Tỉ lệ request gặp "đuôi chậm"
        1                       1%
        5                       4,9%
       10                       9,6%
       50                      39,5%
      100                      63,4%    ← gần 2/3 request bị chậm!
```

**Bài học**: trong hệ phân tán, "1% chậm" của từng thành phần cộng dồn thành "đa số chậm" của hệ thống. Đây là lý do các công ty lớn ám ảnh với việc cắt tail latency, và là lý do có kỹ thuật **hedged request** (gửi request thứ hai sang bản sao khác nếu cái đầu chậm quá p95) — phase-4 sẽ nói.

## Coordinated omission — cái bẫy làm mọi kết quả benchmark sai

Đây là lỗi tinh vi nhất trong đo hiệu năng, và **hầu hết công cụ benchmark đơn giản đều mắc phải**.

Tình huống: bạn muốn bắn 100 RPS, tức cứ 10 ms gửi 1 request. Công cụ của bạn viết kiểu:

```java
while (true) {
    long start = now();
    sendRequest();      // chờ response xong mới gửi cái tiếp theo
    record(now() - start);
    sleep(10ms);
}
```

Server bị khựng 1 giây. Chuyện gì xảy ra?

```text
  Thực tế đúng ra phải có:  100 request bị ảnh hưởng bởi cú khựng 1 giây
                            (những request lẽ ra gửi trong giây đó)

  Công cụ ghi nhận:         CHỈ 1 request chậm 1 giây
                            99 request kia không bao giờ được gửi
                            vì công cụ đang đứng chờ!
```

Kết quả: những mẫu đo tệ nhất **bị bỏ sót một cách có hệ thống** ("coordinated omission" — bỏ sót có phối hợp). Báo cáo p99 đẹp long lanh, production thì sập.

**Cách tránh**:
- Dùng công cụ có chế độ đúng: `wrk2`, `k6` (hằng số arrival rate), JMeter với Constant Throughput Timer, Gatling.
- Nguyên tắc: công cụ phải gửi request **theo lịch cố định**, không phụ thuộc response trước xong hay chưa. Thuật ngữ: **open model** (đúng) vs **closed model** (sai với mục đích này).

| Mô hình | Cách hoạt động | Mô phỏng đúng cái gì |
|---|---|---|
| **Closed model** | N user ảo, mỗi user chờ response rồi mới gửi tiếp | Hệ thống nội bộ có số user cố định |
| **Open model** | Request đến theo tốc độ cố định, bất kể server | Người dùng Internet thật — họ không chờ bạn |

Với web/API công khai, **luôn dùng open model**. Người dùng thật không kiên nhẫn chờ server rảnh rồi mới bấm nút.

## Đọc một biểu đồ latency điển hình

```text
  Latency
    │
 5s │                                              ╱  ← "hockey stick"
    │                                            ╱      (gậy khúc côn cầu)
 2s │                                         ╱
    │                                    ╱
500m│                            ╱─────
    │            ────────────
 50m│────────────
    └────────────────────────────────────────────────→ Throughput (RPS)
     0        200      400     600    700  750  800

              ^ vùng phẳng            ^ đầu gối       ^ vùng sụp
              (hệ thống thoải mái)    (knee)          (quá tải)
```

Ba vùng, ba cách hành xử hoàn toàn khác nhau:

1. **Vùng phẳng**: tăng tải, latency gần như không đổi. Hệ thống còn dư sức.
2. **Đầu gối (knee)**: bắt đầu cong lên. Đây là **công suất thật sự** của hệ thống — hãy vận hành ở khoảng 60-70% điểm này.
3. **Vùng sụp**: latency nổ tung. Thêm 5% tải làm latency tăng 10 lần.

Vì sao đường cong lại có hình này? Đó là **lý thuyết hàng đợi** — bài 5.

**Sai lầm phổ biến**: benchmark ra 800 RPS rồi ghi vào tài liệu "hệ thống chịu được 800 RPS". Không. Ở 800 RPS latency đã 5 giây, người dùng đã bỏ đi hết. Công suất dùng được là ~450 RPS.

Quy tắc: **công suất công bố = mức tải cao nhất mà p99 vẫn nằm trong ngưỡng chấp nhận được**, không phải mức tải cao nhất mà server chưa chết.

## SLI, SLO, SLA — ba từ hay bị dùng lẫn lộn

- **SLI (Service Level Indicator)** — *chỉ số* bạn đo. Ví dụ: "tỉ lệ request trả về dưới 300 ms".
- **SLO (Service Level Objective)** — *mục tiêu* nội bộ. Ví dụ: "99% request dưới 300 ms trong 30 ngày".
- **SLA (Service Level Agreement)** — *cam kết hợp đồng* với khách hàng, vi phạm thì đền tiền. Thường đặt lỏng hơn SLO.

**Error budget (ngân sách lỗi)**: nếu SLO là 99,9% thành công trong 30 ngày, bạn được phép hỏng 0,1% — khoảng **43 phút/tháng**. Còn ngân sách thì đội được phép deploy tính năng mới; tiêu hết ngân sách thì tạm dừng, tập trung sửa độ ổn định. Đây là cách Google biến "ổn định" thành con số thay vì cảm tính.

| Availability | Downtime/tháng | Downtime/năm |
|---|---|---|
| 99% ("two nines") | 7,2 giờ | 3,65 ngày |
| 99,9% | 43,2 phút | 8,76 giờ |
| 99,95% | 21,6 phút | 4,38 giờ |
| 99,99% ("four nines") | 4,3 phút | 52,6 phút |
| 99,999% ("five nines") | 26 giây | 5,26 phút |

Nhìn bảng này để hiểu vì sao "five nines" là chuyện rất đắt đỏ: 26 giây/tháng nghĩa là **một lần restart pod cũng có thể phá vỡ cam kết**.

## Bẫy thường gặp khi đọc số liệu

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Cảnh báo dựa trên average | Không bao giờ nổ dù người dùng đang khổ | Cảnh báo trên p99 + tỉ lệ lỗi |
| Lấy trung bình các p99 | Con số vô nghĩa | Gộp histogram rồi tính lại |
| Benchmark bằng closed model | p99 đẹp giả tạo | Dùng wrk2/k6/Gatling ở open model |
| Chỉ đo ở server | Bỏ sót thời gian xếp hàng | Đo thêm ở LB/client |
| Benchmark trên máy dev | Không có mạng, không có nhiễu | Chạy trên môi trường giống prod |
| Warm-up không đủ | JVM chưa JIT, cache lạnh → số xấu giả | Bỏ 30-60 giây đầu (phase-6) |
| Đo trong 30 giây | Không thấy GC pause, không thấy cron | Chạy tối thiểu 10-15 phút |
| Chỉ nhìn latency, quên tỉ lệ lỗi | Server trả 500 rất nhanh → "latency giảm"! | Luôn nhìn cặp latency + error rate |

Cái bẫy cuối cùng đáng nhớ nhất: **khi hệ thống bắt đầu lỗi, latency thường GIẢM** vì trả lỗi nhanh hơn trả dữ liệu thật. Nhìn mỗi biểu đồ latency, bạn sẽ tưởng vừa tối ưu thành công.

## Bộ chỉ số tối thiểu cần có

Cho mọi service, tối thiểu 4 chỉ số (gọi là **golden signals** của Google SRE):

| Tín hiệu | Đo gì | Metric Spring Boot tương ứng |
|---|---|---|
| **Latency** | p50, p95, p99 (tách riêng request thành công / lỗi) | `http.server.requests` |
| **Traffic** | RPS | `http.server.requests` (count) |
| **Errors** | tỉ lệ 5xx, tỉ lệ exception | `http.server.requests{status=5xx}` |
| **Saturation** | mức đầy của tài nguyên | `tomcat.threads.busy`, `hikaricp.connections.active` |

Saturation là tín hiệu **báo trước** — nó tăng trước khi latency tăng, cho bạn thời gian phản ứng. Bài 6 sẽ hướng dẫn dựng đủ bộ này.

## Tóm tắt bài 3

- **Average nói dối.** Chỉ dùng p50 (điển hình) và p99 (chỗ hỏng).
- **Percentile không cộng được**, không lấy trung bình được — phải gộp dữ liệu thô.
- `Concurrency = Throughput × Latency` — định luật Little, nền tảng của mọi tính toán pool.
- **Tail latency amplification**: gọi 10 service mỗi cái p99=1s → 9,6% request chậm, không phải 1%.
- **Coordinated omission** làm mọi benchmark closed-model đẹp giả tạo. Dùng open model.
- Công suất thật = mức tải mà **p99 vẫn đạt SLO**, không phải mức tải server chưa chết.
- Khi hỏng, **latency có thể giảm** vì lỗi trả nhanh. Luôn xem kèm error rate.

**Bài kế tiếp** → [Bài 4: Định luật Little — tính chính xác cần bao nhiêu thread và bao nhiêu connection](04-dinh-luat-little-tinh-pool-size.md)
