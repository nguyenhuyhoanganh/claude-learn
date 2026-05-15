# Bài 3: Availability (Tính sẵn sàng)

## Tại sao Availability quan trọng nhất?

Availability ảnh hưởng lớn nhất đến cả users lẫn business:

**Với users:**
- Không load được trang → frustrating
- Email service down → mất truy cập quan trọng
- AWS S3 outage 2017 → hàng trăm nghìn websites bị ảnh hưởng
- Air traffic control, hospital systems → tính mạng con người

**Với business:**
- System down → doanh thu = 0
- Kéo dài too long/too often → users bỏ sang competitor
- **Double damage**: mất revenue + mất customers

## Định nghĩa

> **Availability** = Phần trăm thời gian (hoặc xác suất) mà service hoạt động bình thường và user có thể truy cập.

```
         Uptime
Availability = ─────────────────── × 100%
            Uptime + Downtime
```

**Các thuật ngữ:**
- **Uptime**: Thời gian hệ thống hoạt động bình thường
- **Downtime**: Thời gian hệ thống không hoạt động

## Công thức MTBF & MTTR

> Thay vì đo actual uptime/downtime, ta có thể ước tính:

```
           MTBF
Availability = ─────────────
            MTBF + MTTR
```

- **MTBF** (Mean Time Between Failures): Thời gian trung bình hệ thống hoạt động giữa các lần failure
- **MTTR** (Mean Time To Recovery): Thời gian trung bình detect và recover từ failure

**Insight quan trọng**: Nếu MTTR → 0, Availability → 100% bất kể MTBF!
→ **Detect nhanh + Recover nhanh = High Availability**

## Bảng Availability

| Availability | Downtime/ngày | Downtime/năm |
|-------------|--------------|-------------|
| 90% | 2.4 giờ | 36.5 ngày |
| 95% | 1.2 giờ | 18.25 ngày |
| 99% | 14.4 phút | 3.65 ngày |
| **99.9%** | **1.44 phút** | **8.76 giờ** |
| 99.99% | 8.6 giây | 52.6 phút |
| 99.999% | 0.86 giây | 5.26 phút |

## High Availability là bao nhiêu?

- **90-95%**: Không phải high availability (hàng giờ downtime mỗi ngày)
- **99%+**: Industry standard bắt đầu từ đây
- **99.9% (3 nines)**: Minimum cho most production systems
- **99.99% (4 nines)**: Enterprise-grade
- **99.999% (5 nines)**: Mission-critical systems

**Shorthand:** Đếm số 9:
- `99.9%` → "three nines"
- `99.99%` → "four nines"
- `99.999%` → "five nines"

## Cách nói về Availability (SLA)

Cloud vendors thường publish SLA với 3-4 nines:
- AWS EC2: 99.99%
- AWS S3: 99.99%
- Google Cloud SQL: 99.95%

## Tóm tắt

```
Availability:
- Đo: Uptime / (Uptime + Downtime)
- Estimate: MTBF / (MTBF + MTTR)
- High Availability: ≥ 99.9% (three nines)
- Key insight: Reduce MTTR = Improve Availability
```

---
**Tiếp theo:** Bài 4 - Fault Tolerance & High Availability →
