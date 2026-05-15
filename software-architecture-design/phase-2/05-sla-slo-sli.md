# Bài 5: SLA, SLO, SLI

## Tổng quan

Ba thuật ngữ quan trọng tổng hợp các cam kết về quality attributes:

```
SLA (Agreement)
 └── chứa nhiều SLO (Objectives)
       └── đo bằng SLI (Indicators)
```

## SLA — Service Level Agreement

> **SLA** = Hợp đồng pháp lý giữa service provider và khách hàng, cam kết về chất lượng dịch vụ.

**Nội dung SLA thường bao gồm:**
- Availability guarantees (99.9%, 99.99%)
- Performance targets (response time)
- Data durability
- Incident response time
- **Penalties nếu vi phạm**: refunds, credits, subscription extensions

**SLA tồn tại với:**
- ✅ External paying users (luôn có)
- ✅ Free external users (đôi khi có)
- ✅ Internal teams (không có penalties, nhưng vẫn hữu ích)

**Lưu ý**: Free services thường tránh public SLA nghiêm ngặt.

## SLO — Service Level Objective

> **SLO** = Mục tiêu cụ thể cho từng metric của hệ thống.

**Ví dụ SLOs:**
```
Availability SLO: 99.9% uptime
Latency SLO:      P90 < 100ms
Resolution SLO:   Issue resolved trong 24-48h
Error rate SLO:   < 0.1% requests trả về lỗi
```

**Mối quan hệ với SLA:**
- Nếu có SLA → mỗi SLO là một điều khoản trong SLA
- Không có SLA → vẫn PHẢI có SLOs (để biết mục tiêu)

## SLI — Service Level Indicator

> **SLI** = Con số thực tế đo được để verify xem có đạt SLO không.

**Ví dụ SLIs:**
```
SLO: Availability 99.9%
SLI: % requests trả về 200 OK / tổng requests = 99.95% ✓

SLO: P90 latency < 100ms
SLI: Đo P90 từ logs = 87ms ✓ hoặc 125ms ✗

SLO: Error rate < 0.1%
SLI: (errors / total_requests) × 100 = 0.08% ✓
```

SLI được tính từ:
- Monitoring systems
- Log analysis
- Synthetic monitoring

## Error Budget

```
SLO: 99.9% availability
Error Budget = 100% - 99.9% = 0.1%
             = ~43 phút downtime/tháng

Nếu còn error budget → có thể deploy, experiment
Nếu hết error budget → freeze deployments, focus on stability
```

## Four Considerations khi định nghĩa SLOs

### 1. Tập trung vào metrics user quan tâm

Không phải mọi metric đều cần SLO:
- ✅ Response time (user thấy trực tiếp)
- ✅ Availability (user không access được)
- ❌ CPU utilization (user không quan tâm)

### 2. Ít SLOs hơn = Tốt hơn

Quá nhiều SLOs → khó prioritize → không focus được.
Một vài SLOs quan trọng → dễ tập trung cải thiện.

### 3. Đặt mục tiêu realistic với error budget

❌ Đừng commit 99.999% nếu hệ thống chỉ đạt được 99.9%
✅ Commit ít hơn khả năng thực tế → room cho unexpected issues

**Internal vs External SLOs:**
```
External SLO: 99.9% (cam kết với khách hàng)
Internal SLO: 99.99% (mục tiêu nội bộ ambitious hơn)
```

### 4. Có Recovery Plan

Khi SLI cho thấy vi phạm SLO:

```
SLI → Alert trigger
    ↓
On-call engineer được notify
    ↓
Runbook/Handbook: Làm gì trong tình huống X?
    ↓
Auto failover / restart / rollback
    ↓
Post-mortem: Vì sao xảy ra? Ngăn ngừa thế nào?
```

## Ai làm gì?

| Role | Trách nhiệm |
|------|-------------|
| Business/Legal team | Crafts SLA |
| Engineers/Architects | Defines SLOs & SLIs |
| DevOps/SRE | Monitors SLIs, enforces SLOs |

## Ví dụ thực tế: Google SRE

Google dùng SLO + Error Budget chính thức:
- Nếu service đang dùng error budget → engineering focus on reliability
- Nếu vẫn còn nhiều error budget → có thể ship features thoải mái hơn

## Tóm tắt

```
SLA = Legal contract (aggregate of SLOs)
SLO = Individual target (e.g., P90 < 100ms)
SLI = Actual measurement (e.g., P90 = 87ms)

SLO Considerations:
① Tập trung vào user-facing metrics
② Ít SLOs hơn = tốt hơn
③ Đặt mục tiêu conservative (leave room)
④ Có Recovery Plan rõ ràng
```

---
**Tiếp theo:** Phase 3 - API Design →
