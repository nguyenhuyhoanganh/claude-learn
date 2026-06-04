# Bài 3: Availability (Tính sẵn sàng)

## Tại sao Availability lại quan trọng đặc biệt?

Trong các quality attributes, **Availability có ảnh hưởng lớn nhất** tới cả user lẫn business — vì hệ thống không hoạt động thì mọi quality khác (performance, security) đều vô nghĩa.

**Đối với người dùng (users):**
- Không load được trang web → bực bội, mất niềm tin.
- Dịch vụ email không vào được → mất quyền truy cập thông tin quan trọng.
- Sự cố AWS S3 năm 2017 → hàng trăm nghìn website trên toàn thế giới đồng loạt bị ảnh hưởng (vì rất nhiều site dùng S3 làm storage).
- Hệ thống kiểm soát không lưu, bệnh viện → liên quan đến tính mạng con người.

**Đối với business (kinh doanh):**
- Hệ thống down (không hoạt động) → doanh thu = 0 trong khoảng thời gian đó.
- Down quá lâu hoặc quá thường xuyên → user bỏ sang đối thủ (competitor).
- **Tổn thất kép (double damage)**: vừa mất doanh thu trong thời gian down, vừa mất khách hàng sau khi up lại.

→ Vì lý do này, hầu hết startup khi pitch cho đầu tư đều đề cập đến cam kết uptime của mình.

## Định nghĩa

> **Availability** = Phần trăm thời gian (hoặc xác suất) mà service hoạt động bình thường và user có thể truy cập được.

Công thức cơ bản:

```text
                  Uptime
Availability = ─────────────────────── × 100%
               Uptime + Downtime
```

**Các thuật ngữ chính:**
- **Uptime**: Tổng thời gian hệ thống hoạt động bình thường.
- **Downtime**: Tổng thời gian hệ thống không hoạt động (do crash, maintenance, network issue...).

## Công thức ước tính: MTBF và MTTR

Trong thực tế khi hệ thống chưa hoạt động (đang thiết kế), ta không có dữ liệu uptime/downtime thực. Khi đó dùng công thức ước tính dựa vào thống kê lỗi:

```text
                  MTBF
Availability = ────────────────────
               MTBF + MTTR
```

- **MTBF** (Mean Time Between Failures): **Thời gian trung bình giữa 2 lần hệ thống lỗi**. MTBF lớn = hệ thống ít lỗi.
- **MTTR** (Mean Time To Recovery): **Thời gian trung bình để phát hiện và phục hồi** từ một lỗi. MTTR nhỏ = recover nhanh.

**Insight (góc nhìn) quan trọng**: Nếu MTTR tiến về 0 (recover gần như tức thì), thì Availability tiến về 100% **dù MTBF có lớn hay nhỏ**!

→ Đây là lý do các đội ops hiện đại tập trung vào **automated recovery, self-healing, fast detection**.

→ **Phát hiện nhanh + Phục hồi nhanh = High Availability**, quan trọng hơn việc cố gắng làm cho hệ thống không bao giờ lỗi.

## Bảng Availability — quy ra thời gian downtime cụ thể

Người ta thường nói "99.9% uptime" nhưng ít ai hình dung được số đó nghĩa là downtime bao nhiêu. Bảng dưới giúp hình dung:

| Availability | Downtime mỗi ngày | Downtime mỗi năm |
|---|---|---|
| 90% | 2 giờ 24 phút | 36.5 ngày |
| 95% | 1 giờ 12 phút | 18.25 ngày |
| 99% | 14.4 phút | 3.65 ngày |
| **99.9%** | **1.44 phút** | **8.76 giờ** |
| 99.99% | 8.6 giây | 52.6 phút |
| 99.999% | 0.86 giây | 5.26 phút |
| 99.9999% | < 0.1 giây | 31.5 giây |

→ Càng nhiều số 9 thì downtime cho phép càng nhỏ — và chi phí để đạt được càng tăng theo cấp số.

## High Availability — ngưỡng nào được coi là "cao"?

- **90-95%**: KHÔNG phải high availability (vài giờ downtime mỗi ngày — không chấp nhận được cho production).
- **99% trở lên**: Tiêu chuẩn ngành công nghiệp bắt đầu từ đây.
- **99.9% (3 nines — ba số 9)**: Mức tối thiểu cho hầu hết hệ thống production.
- **99.99% (4 nines)**: Mức enterprise-grade (dành cho doanh nghiệp lớn).
- **99.999% (5 nines)**: Hệ thống mission-critical (sàn giao dịch chứng khoán, hệ thống không lưu, viễn thông).

**Cách nói tắt (shorthand) trong giới kỹ thuật:** đếm số 9.
- `99.9%` → "three nines" (ba số 9).
- `99.99%` → "four nines" (bốn số 9).
- `99.999%` → "five nines" (năm số 9).

Khi nghe ai nói "we have four nines availability", họ đang nói về 99.99%.

## SLA — cam kết Availability với khách hàng

> **SLA** (Service Level Agreement — Thoả thuận mức độ dịch vụ) = Hợp đồng giữa nhà cung cấp dịch vụ và khách hàng, cam kết mức availability nhất định.

Các nhà cung cấp cloud lớn thường publish SLA với mức 3-4 nines:
- **AWS EC2**: 99.99%
- **AWS S3**: 99.99%
- **Google Cloud SQL**: 99.95%
- **Azure VM**: 99.9%

Nếu nhà cung cấp không đạt SLA, khách hàng được hoàn tiền hoặc credit (theo % vi phạm).

⚠️ Lưu ý: SLA của các dịch vụ cloud chỉ áp dụng cho dịch vụ đó, **không phải toàn bộ hệ thống của bạn**. Nếu app của bạn dùng 3 dịch vụ AWS, mỗi cái 99.99%, thì SLA tổng có thể chỉ còn 99.97% (nhân các xác suất).

## Tóm tắt bài 3

```text
Availability (Tính sẵn sàng):

- Đo lường thực tế:
    Availability = Uptime / (Uptime + Downtime)

- Ước tính khi thiết kế:
    Availability = MTBF / (MTBF + MTTR)

- High Availability: tối thiểu 99.9% (three nines)

- Insight cốt lõi: 
    Giảm MTTR (thời gian recover) = Tăng Availability
    → Tập trung vào auto-detect, auto-recover, self-healing

- SLA: cam kết availability với khách hàng, vi phạm = đền bù
```

Availability là quality attribute mà mọi hệ thống production phải có. Bài tiếp theo sẽ học **Fault Tolerance** — kỹ thuật cụ thể để đạt được High Availability.

---
**Bài kế tiếp**: [Bài 4 - Fault Tolerance & High Availability](04-fault-tolerance.md) →
