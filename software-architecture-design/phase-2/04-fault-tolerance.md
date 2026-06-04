# Bài 4: Fault Tolerance & High Availability (Khả năng chịu lỗi và Sẵn sàng cao)

## Nguồn gốc của Failures (sự cố)

Trước khi nói về Fault Tolerance, ta cần hiểu **lỗi đến từ đâu**. Có 3 nguồn chính:

```text
Failures (sự cố)
├── Human Error (Lỗi do con người) — PHỔ BIẾN NHẤT
│   ├── Đẩy config sai lên production
│   ├── Chạy nhầm lệnh / nhầm script
│   └── Deploy phiên bản chưa test kỹ
│
├── Software Errors (Lỗi phần mềm)
│   ├── Long garbage collection pauses (JVM dọn rác kéo dài)
│   ├── Out-of-memory exceptions (hết bộ nhớ)
│   ├── Null pointer exceptions
│   └── Segmentation faults (lỗi truy cập bộ nhớ)
│
└── Hardware Failures (Lỗi phần cứng)
    ├── Server hỏng (do hết tuổi thọ)
    ├── Mất điện (thiên tai, cúp điện diện rộng)
    └── Mạng hỏng (cáp đứt, congestion, sự cố ISP)
```

**Thực tế cay đắng**: Dù team có cải thiện code review, tăng test coverage, làm maintenance định kỳ — **failures VẪN xảy ra**. Không có hệ thống nào 100% không lỗi.

→ Vì vậy thay vì cố gắng tránh mọi lỗi (impossible), ta phải thiết kế hệ thống để **chịu được lỗi mà vẫn hoạt động**.

## Định nghĩa Fault Tolerance

> **Fault Tolerance** = Khả năng của hệ thống tiếp tục hoạt động và phục vụ users **dù có failure xảy ra** ở một hoặc nhiều component.

Khi failure xảy ra, hệ thống có khả năng chịu lỗi tốt sẽ:
- Tiếp tục hoạt động ở **đầy đủ hiệu năng (full performance)** — tốt nhất.
- Hoặc **hiệu năng giảm (reduced performance)** — chấp nhận được.
- **KHÔNG bao giờ down hoàn toàn** — đây là điều quan trọng nhất.

## 3 chiến lược Fault Tolerance

Để đạt được Fault Tolerance, ta áp dụng 3 chiến lược lồng vào nhau theo thứ tự: Prevention → Detection → Recovery.

### Chiến lược 1: Failure Prevention (Phòng ngừa sự cố)

**Mục tiêu**: Loại bỏ các điểm có thể gây toàn bộ hệ thống down.

**Loại bỏ Single Point of Failure (SPOF — điểm lỗi đơn lẻ):**

```text
TRƯỚC (có SPOF):                   SAU (Redundant — dư thừa):

   [App Server]               →    [App 1] [App 2] [App 3]
        |                                |    |    |
   [Database]                  →    [DB Primary] [DB Replica]
        ↑                                ↑
   1 server chết = toàn          Hỏng 1 server vẫn còn các
   bộ hệ thống chết              server khác phục vụ
```

Có 2 dạng redundancy (dư thừa) chính:

#### Spatial Redundancy (Dư thừa không gian)

Chạy **nhiều bản sao (replicas)** của cùng 1 component trên các máy **vật lý khác nhau**.

→ Một máy hỏng, các máy còn lại vẫn chạy.

Vd: chạy 3 instance app trên 3 server khác nhau, đặt ở 3 availability zone khác nhau.

#### Time Redundancy (Dư thừa thời gian)

**Retry** (thử lại) request khi gặp failure — lặp lại operation cho đến khi thành công hoặc bỏ cuộc.

→ Nhiều lỗi là tạm thời (transient), thử lại sẽ thành công (vd: network glitch, momentary overload).

⚠️ Cần kết hợp với backoff (đợi tăng dần giữa các lần retry) để không làm hỏng hệ thống nặng hơn.

**2 chiến lược Redundancy chính:**

| Tiêu chí | Active-Active | Active-Passive |
|---|---|---|
| **Cách hoạt động** | Tất cả replica đều nhận traffic | 1 primary (chính), các bản kia là follower (theo dõi) |
| **Failover** (chuyển đổi khi lỗi) | Ngay lập tức | Cần promote (nâng cấp) passive lên primary |
| **Phân bố tải** | Có (vừa làm horizontal scale) | Không (passive không phục vụ traffic) |
| **Độ phức tạp** | Cao (phải đồng bộ giữa các replica) | Thấp |
| **Use case** | Traffic cao, ưu tiên performance | Đơn giản, ưu tiên strong consistency |

### Chiến lược 2: Failure Detection & Isolation (Phát hiện và cách ly lỗi)

Để recover được, trước hết phải **phát hiện được** rằng có lỗi đang xảy ra. Cần hệ thống giám sát (monitoring system).

**2 mô hình giám sát phổ biến:**

#### Health Checks (theo dạng "hỏi-đáp"):

```text
Monitoring Service  →  "Ping (bạn còn sống không?)"  →  App Instance
App Instance        →  "OK!"   hoặc   [Không trả lời]
```

Monitor chủ động hỏi từng instance định kỳ (vd 10 giây/lần).

#### Heartbeat (theo dạng "tự báo cáo"):

```text
App Instance  →  Gửi tín hiệu "Tôi còn sống" định kỳ  →  Monitoring Service
[Không có heartbeat trong X giây]  →  Coi instance đó là lỗi
```

Instance chủ động gửi tín hiệu sống định kỳ. Monitor đếm — không thấy tín hiệu = instance chết.

**Các dấu hiệu khác để phát hiện lỗi:**
- Error rate (tỷ lệ lỗi) tăng đột biến.
- Response time (thời gian phản hồi) chậm bất thường.
- CPU/memory tăng vọt (spike).

**Cân nhắc False Positive vs False Negative trong detection:**

- **False positive** (báo nhầm — instance khoẻ bị coi là lỗi): **Chấp nhận được**. Tệ nhất là tạm dừng instance khoẻ, có thể restart lại.
- **False negative** (không phát hiện — instance lỗi không được nhận diện): **Tuyệt đối tránh**. Người dùng vẫn bị route vào instance lỗi → trải nghiệm tệ.

→ Khi tune ngưỡng phát hiện, ưu tiên bắt được hết lỗi, kể cả có sai cũng được.

### Chiến lược 3: Recovery (Phục hồi)

Sau khi đã detect và isolate (cách ly) instance lỗi, cần phục hồi. Quy trình 3 bước:

1. **Stop traffic** — Ngừng gửi request mới đến instance lỗi (xoá khỏi load balancer pool).
2. **Restart** — Khởi động lại instance, hy vọng vấn đề (memory leak, deadlock) sẽ biến mất.
3. **Rollback** — Nếu restart không cứu được (lỗi do code mới), quay lại phiên bản ổn định trước đó.

**Database Rollback:**

```text
Nếu transaction dẫn đến state (trạng thái DB) không hợp lệ
→ Rollback (quay lại) về last known good state (trạng thái tốt cuối cùng)
```

Đây là lý do mọi DB hiện đại đều support transaction với rollback.

**Software Rollback:**

```text
Phiên bản mới có bug → Tất cả server với phiên bản này đều bị lỗi
→ Auto rollback (tự động hoàn nguyên) về phiên bản cũ
→ Hệ thống tiếp tục hoạt động trong khi dev team sửa lỗi
```

Đây là lý do cần CI/CD pipeline có khả năng rollback nhanh.

## MTTR và Recovery — chìa khoá của Availability

Nhắc lại công thức từ bài 3:

```text
                  MTBF
Availability = ───────────────
               MTBF + MTTR
```

→ **Giảm MTTR (thời gian phục hồi) = Tăng Availability**.

→ Vì MTBF khó cải thiện (lỗi vẫn cứ xảy ra), nên chiến lược thực tế là **tối ưu MTTR**.

Mục tiêu: Detect (phát hiện) lỗi nhanh + Recover (phục hồi) nhanh — tốt nhất là **tự động (automated)** hoặc bán tự động.

## Ví dụ thực tế: Kubernetes self-healing

Kubernetes có sẵn cơ chế fault tolerance tự động cho mọi pod (container):

```text
Pod 1 (App)  →  Crash (lỗi)
    ↓
Kubernetes Health Check phát hiện (mất heartbeat hoặc fail readiness probe)
    ↓
Tự động kill (giết) pod cũ, start (khởi động) pod mới từ image gốc
    ↓
MTTR ≈ vài giây
```

Người vận hành (sysadmin) không cần can thiệp. K8s tự xử lý 24/7.

Đây là lý do K8s trở thành de facto standard cho deploy app: nó tự giải quyết phần lớn fault tolerance.

## Tóm tắt bài 4

```text
Fault Tolerance (Khả năng chịu lỗi) = 
    Hệ thống vẫn hoạt động dù có failures

3 chiến lược (theo thứ tự):
├── 1. Prevention (Phòng ngừa):
│      Redundancy — Active-Active / Active-Passive
│      Spatial + Time redundancy
│
├── 2. Detection (Phát hiện):
│      Health checks (hỏi-đáp)
│      Heartbeat (tự báo)
│      Monitoring các chỉ số bất thường
│
└── 3. Recovery (Phục hồi):
       Stop traffic → Restart → Rollback
       Mục tiêu: tự động hoá càng nhiều càng tốt

Key insight: Giảm MTTR là cách hiệu quả nhất để tăng Availability
```

Đây là toàn bộ cơ sở lý thuyết để thiết kế hệ thống High Availability thực tế.

---
**Bài kế tiếp**: [Bài 5 - SLA, SLO, SLI (Hệ thống đo lường cam kết)](05-sla-slo-sli.md) →
