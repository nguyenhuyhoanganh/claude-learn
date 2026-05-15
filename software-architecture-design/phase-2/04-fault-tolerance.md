# Bài 4: Fault Tolerance & High Availability

## Nguồn gốc của Failures

```
Failures
├── Human Error (phổ biến nhất)
│   ├── Push faulty config to production
│   ├── Run wrong command/script
│   └── Deploy untested version
├── Software Errors
│   ├── Long garbage collection pauses
│   ├── Out-of-memory exceptions
│   ├── Null pointer exceptions
│   └── Segmentation faults
└── Hardware Failures
    ├── Server breakdown (shelf life)
    ├── Power outages (natural disasters)
    └── Network failures (infrastructure, congestion)
```

**Thực tế**: Dù improve code review, testing, maintenance — failures VẪN xảy ra.

## Fault Tolerance

> **Fault Tolerance** = Khả năng của hệ thống tiếp tục hoạt động và phục vụ users **dù có failures** trong một hoặc nhiều component.

Khi failure xảy ra, fault tolerant system có thể:
- Tiếp tục hoạt động ở **full performance**
- Hoặc **reduced performance** — nhưng KHÔNG down hoàn toàn

## Ba Chiến Lược Fault Tolerance

### 1. Failure Prevention (Ngăn ngừa)

**Loại bỏ Single Point of Failure (SPOF)**

```
TRƯỚC (SPOF):          SAU (Redundant):
   [App Server]    →    [App 1] [App 2] [App 3]
        |                      |
   [Database]      →    [DB Primary] [DB Replica]
```

**Spatial Redundancy**: Chạy nhiều instances/replicas trên nhiều máy khác nhau

**Time Redundancy**: Retry requests khi gặp failure (repeat operation until success or give up)

**Hai chiến lược Redundancy:**

| | Active-Active | Active-Passive |
|--|--------------|----------------|
| **Cách hoạt động** | Tất cả replicas nhận traffic | Một primary, rest là followers |
| **Failover** | Ngay lập tức | Cần promote passive |
| **Load distribution** | Có (horizontal scale) | Không |
| **Complexity** | Cao (sync giữa replicas) | Thấp |
| **Use case** | High traffic, performance | Simplicity, strong consistency |

### 2. Failure Detection & Isolation

Cần monitoring system để phát hiện sự cố:

**Health Checks (push-pull):**
```
Monitoring Service → "Ping" → App Instance
App Instance → "OK" / [No response]
```

**Heartbeat:**
```
App Instance → periodic "I'm alive" → Monitoring Service
[No heartbeat for X seconds] → Instance là faulty
```

**Phát hiện thêm:**
- Error rate cao bất thường
- Response time quá chậm
- CPU/memory spikes

**False positive vs False negative:**
- False positive (healthy host bị đánh giá faulty): Chấp nhận được
- False negative (faulty host không bị detect): **Tuyệt đối phải tránh**

### 3. Recovery (Phục hồi)

Sau khi detect và isolate faulty instance:

1. **Stop traffic**: Ngừng gửi requests đến instance lỗi
2. **Restart**: Khởi động lại với hy vọng vấn đề sẽ biến mất
3. **Rollback**: Quay lại phiên bản stable trước đó

**Database Rollback:**
```
Nếu transaction dẫn đến state không hợp lệ
→ Rollback về last known good state
```

**Software Rollback:**
```
New version có lỗi → Tất cả servers với version mới đều bị lỗi
→ Auto rollback về version cũ
→ Hệ thống tiếp tục hoạt động trong khi team fix lỗi
```

## MTTR và Recovery

Nhắc lại từ bài trước:
```
           MTBF
Availability = ─────────────
            MTBF + MTTR
```

→ **Giảm MTTR = Tăng Availability**

→ Mục tiêu: Detect failure nhanh + Recover nhanh (tự động hoặc bán tự động)

## Ví dụ thực tế: Kubernetes

```
Pod 1 (App) → Crash
    ↓
Kubernetes Health Check detect failure
    ↓
Kill pod, start new pod tự động
    ↓
MTTR = vài giây
```

## Tóm tắt

```
Fault Tolerance = Remain operational despite failures

3 Tactics:
├── Prevention: Redundancy (Active-Active / Active-Passive)
├── Detection: Health checks, Heartbeat, Monitoring
└── Recovery: Stop traffic, Restart, Rollback

Key: Giảm MTTR → Tăng Availability
```

---
**Tiếp theo:** Bài 5 - SLA, SLO, SLI →
