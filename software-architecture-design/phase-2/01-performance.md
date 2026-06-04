# Bài 1: Performance (Hiệu năng)

## Performance là gì?

Performance (hiệu năng) là quality attribute được nghĩ đến đầu tiên khi nói về chất lượng hệ thống — hệ thống nhanh = hiệu năng cao. Nhưng "nhanh" cần được định nghĩa chính xác hơn vì có nhiều cách hiểu "nhanh" khác nhau.

## Hai loại Performance Metrics chính

### 1. Response Time (Thời gian phản hồi)

> **Response Time** = Thời gian tính từ lúc client gửi request cho đến khi client nhận được response.

Response Time được cấu thành từ 2 phần:

```text
Response Time = Processing Time + Waiting Time
                     ↑                  ↑
              Thời gian code,      Thời gian chờ
              DB query, business   trong queue,
              logic xử lý          chờ network,
                                   chờ I/O...
```

⚠️ **Lỗi phổ biến**: chỉ đo Processing Time mà bỏ qua Waiting Time → biểu đồ (graph) trông rất đẹp nhưng người dùng vẫn cảm thấy chậm.

**Ví dụ minh hoạ:**

```text
Request 1: [Processing: 10ms]                  → Response Time: 10ms ✓
Request 2: [Wait in queue: 10ms][Processing: 10ms] → Response Time: 20ms ❌

Trung bình thực tế: 15ms
Nhưng nếu logs chỉ ghi processing time → ta tưởng là 10ms!
```

→ Lỗ hổng ở đo lường khiến team thấy số liệu "đẹp" nhưng user vẫn than chậm.

### 2. Throughput (Thông lượng)

> **Throughput** = Khối lượng công việc mà hệ thống xử lý được trong một đơn vị thời gian.

Đơn vị đo:
- **Số tác vụ / giây**: requests per second (req/s), transactions per second (TPS).
- **Lượng dữ liệu / giây**: MB/s, Gbps.

**Ví dụ thực tế**: Hệ thống ghi log phân tán (distributed logging) — cần ingest (nuốt vào) hàng triệu log mỗi giây → throughput là metric quan trọng hơn nhiều so với response time của từng log.

Throughput thường được ưu tiên ở các hệ thống:
- Stream processing (xử lý luồng dữ liệu lớn).
- Batch job (xử lý hàng loạt).
- Logging / monitoring pipelines.
- ETL (extract-transform-load).

## 3 lưu ý quan trọng khi đo Performance

### Lưu ý 1: Đo Response Time đúng cách (end-to-end)

Phải đo **end-to-end** — tức là từ góc nhìn của người dùng, không chỉ đo thời gian code chạy.

Bao gồm đầy đủ:
- **Network transit time** (thời gian gói tin đi trên đường truyền).
- **Queue wait time** (thời gian chờ trong queue ở server side).
- **Processing time** (thời gian thực sự xử lý).
- **Network response time** (thời gian response đi ngược về client).

Đo ở **client browser/app** mới phản ánh đúng trải nghiệm. Đo ở server chỉ thấy 1 phần.

### Lưu ý 2: Phân bố Response Time (Distribution) — đừng dùng giá trị trung bình

**KHÔNG dùng average (trung bình)** — vì average che giấu (mask) các outlier (giá trị bất thường).

**Cách đúng: Vẽ histogram (biểu đồ tần suất) → tính Percentile Distribution (phân vị)**

```text
P50 (Median)  = 50% requests hoàn thành trong vòng X ms
P90           = 90% requests hoàn thành trong vòng X ms
P95           = 95% requests hoàn thành trong vòng X ms
P99           = 99% requests hoàn thành trong vòng X ms
P99.9         = 99.9% requests hoàn thành trong vòng X ms
```

**Ví dụ phân tích thực tế:**

```text
P50  = 20ms   → Ổn (đa số user thấy nhanh)
P90  = 52ms   → Vẫn ổn
P95  = 100ms  → Bắt đầu chậm cho 5% user → cảnh báo
P99  = 500ms  → 1% user chờ nửa giây → vấn đề nghiêm trọng!

Average = 25ms  → trông "đẹp" nhưng SAI:
  5% user chịu 500ms — họ có thể bỏ trang web!
```

**Tail Latency** (độ trễ phần đuôi) = phần nhỏ requests có latency cao nhất (P95, P99, P99.9). Phải **theo dõi và giảm thiểu** vì:
- Phần đuôi này là user có trải nghiệm tệ nhất.
- Họ thường là người chia sẻ negative feedback.
- Trong các hệ thống lớn, ngay cả 0.1% cũng là hàng nghìn user.

**Cách đặt SLO (Service Level Objective) đúng:**
- ✅ "P95 < 30ms" — 95% request dưới 30ms.
- ✅ "P99 < 100ms" — 99% request dưới 100ms.
- ❌ "Average < 30ms" — vô nghĩa vì average che giấu outlier.

### Lưu ý 3: Performance Degradation Point (Điểm suy giảm hiệu năng)

Cần theo dõi **điểm mà hiệu năng bắt đầu xấu đi** khi tải tăng dần:

```text
Throughput (số req/giây xử lý được)
    │
    │          ──────────╮ ← Performance bắt đầu giảm
    │         /          ╰─── Degradation point (điểm suy giảm)
    │        /
    │       /
    │──────/
    └──────────────────────────► Load (số request đến)
```

Trước degradation point: throughput tăng tuyến tính theo tải.
Sau degradation point: throughput không tăng nữa, có khi còn giảm (do overhead xử lý các retry, timeout).

**Nguyên nhân phổ biến gây degradation:**
- CPU utilization gần 100% — không còn chỗ xử lý thêm.
- Memory sắp đầy — phải swap → cực chậm.
- Quá nhiều connection mở cùng lúc — exhaust file descriptor, socket.
- Queue trong phần mềm đầy — request mới phải bỏ.
- Database connection pool cạn.

→ Tìm đúng bottleneck (điểm thắt cổ chai) để tối ưu **đúng chỗ**. Tối ưu chỗ khác = lãng phí công sức.

## Khi nào ưu tiên Response Time vs Throughput?

| Metric | Khi nào quan trọng nhất |
|---|---|
| **Response Time** | User-facing operations: tìm kiếm (search), checkout, hiển thị trang |
| **Throughput** | Data processing pipelines, batch jobs, hệ thống log/monitoring |

Trong nhiều trường hợp cần cân nhắc cả hai. Vd: e-commerce — response time của trang chính phải nhanh, throughput của hệ thống xử lý đơn cuối ngày cần cao.

## Tóm tắt bài 1

```text
Performance Metrics:
├── Response Time = Processing Time + Waiting Time
└── Throughput    = Khối lượng công việc / đơn vị thời gian

Best Practices khi đo lường:
├── Đo end-to-end (từ góc nhìn user, không chỉ server)
├── Dùng Percentile (P95, P99) thay vì Average
└── Xác định Degradation Point để biết khi nào hệ thống "đụng trần"
```

Performance là quality attribute đầu tiên cần làm chủ. Các bài sau sẽ học về Scalability — cách để Performance vẫn được duy trì khi tải tăng.

---
**Bài kế tiếp**: [Bài 2 - Scalability (Khả năng mở rộng)](02-scalability.md) →
