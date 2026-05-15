# Bài 1: Performance (Hiệu năng)

## Performance là gì?

Performance thường được nghĩ đến ngay khi nói về chất lượng hệ thống — hệ thống nhanh → hiệu năng cao. Nhưng "nhanh" cần được định nghĩa cụ thể hơn.

## Hai loại Performance Metrics

### 1. Response Time

> **Response Time** = Thời gian từ lúc client gửi request đến khi nhận response.

Gồm hai phần:

```
Response Time = Processing Time + Waiting Time
                     ↑                  ↑
              Thời gian code,      Thời gian chờ
              DB, business         trong queue,
              logic xử lý          network transit
```

⚠️ **Lỗi phổ biến**: Chỉ đo Processing Time → bỏ qua Waiting Time → graphs đẹp nhưng user thấy chậm.

**Ví dụ:**

```
Request 1: [Processing: 10ms] → Response Time: 10ms ✓
Request 2: [Wait: 10ms][Processing: 10ms] → Response Time: 20ms ❌
Average: 15ms — nhưng logs chỉ thấy 10ms nếu chỉ đo processing!
```

### 2. Throughput

> **Throughput** = Lượng công việc hệ thống thực hiện trong một đơn vị thời gian.

Đo bằng:
- **Số tasks/giây**: requests/second, transactions/second
- **Lượng data/giây**: MB/s, Gbps

**Ví dụ thực tế**: Distributed logging system — cần ingest hàng triệu log/giây → throughput là metric quan trọng hơn response time.

## Ba Considerations quan trọng về Performance

### 1. Đo Response Time đúng cách

Phải đo **end-to-end** — từ user perspective, không chỉ code execution time.

Bao gồm: network transit + queue wait time + processing.

### 2. Response Time Distribution (Percentile)

**Không dùng average** — average che giấu outliers!

**Cách đúng: Histogram → Percentile Distribution**

```
P50 (Median) = 50% requests hoàn thành trong Xms
P90 = 90% requests hoàn thành trong Xms
P95 = 95% requests hoàn thành trong Xms
P99 = 99% requests hoàn thành trong Xms
```

**Ví dụ:**
```
P50 = 20ms  → Ổn
P90 = 52ms  → Ổn
P95 = 100ms → Cảnh báo
P99 = 500ms → Vấn đề!
```

Average = 25ms có vẻ ổn, nhưng 5% users thấy 500ms!

**Tail Latency** = phần nhỏ requests có latency cao nhất — phải theo dõi và minimize.

**Cách đặt SLO đúng:**
- ✅ "P95 < 30ms" 
- ✅ "P99 < 100ms"
- ❌ "Average < 30ms"

### 3. Performance Degradation Point

Theo dõi điểm mà performance bắt đầu xấu đi khi load tăng:

```
Throughput
    │          ──────────╮
    │         /          ╰─── Degradation point
    │        /
    │       /
    │──────/
    └──────────────────────── Load
```

**Nguyên nhân phổ biến:**
- CPU utilization ~100%
- Memory cao
- Too many connections (I/O exhaustion)
- Software queue at capacity

→ Tìm bottleneck để optimize đúng chỗ.

## Response Time vs Throughput

| Metric | Dùng khi nào |
|--------|-------------|
| **Response Time** | User-facing operations (search, checkout) |
| **Throughput** | Data processing pipelines, batch jobs, logging |

## Tóm tắt

```
Performance Metrics:
├── Response Time = Processing Time + Waiting Time
└── Throughput = Work per unit time

Measurement Best Practices:
├── Đo end-to-end (không chỉ processing time)
├── Dùng Percentile (P95, P99) không dùng Average
└── Xác định Degradation Point
```

---
**Tiếp theo:** Bài 2 - Scalability →
