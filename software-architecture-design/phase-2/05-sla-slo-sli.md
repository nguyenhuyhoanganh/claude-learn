# Bài 5: SLA, SLO, SLI (Hệ thống cam kết và đo lường chất lượng)

## Tổng quan 3 thuật ngữ

Ba thuật ngữ này được dùng để **đặt mục tiêu và đo lường** các quality attributes như Availability, Performance. Quan hệ giữa chúng:

```text
SLA  (Service Level Agreement — Hợp đồng cấp dịch vụ)
 └── chứa nhiều SLO (Service Level Objective — Mục tiêu cấp dịch vụ)
       └── được đo bằng SLI (Service Level Indicator — Chỉ số cấp dịch vụ)
```

Hiểu nôm na:
- **SLA** = hợp đồng ngoài giấy tờ (legal-level).
- **SLO** = mục tiêu kỹ thuật cụ thể trong hợp đồng đó.
- **SLI** = số đo thực tế để xem có đạt SLO không.

## SLA — Service Level Agreement (Thoả thuận mức dịch vụ)

> **SLA** = Hợp đồng pháp lý giữa nhà cung cấp dịch vụ (service provider) và khách hàng (customer), trong đó nhà cung cấp **cam kết** về chất lượng dịch vụ.

**Nội dung điển hình của SLA:**
- **Availability guarantees** (cam kết uptime): "99.9%, hoặc 99.99%".
- **Performance targets** (mục tiêu hiệu năng): "P95 response time < 200ms".
- **Data durability** (độ bền dữ liệu): "Đảm bảo không mất dữ liệu với xác suất 99.999999999% (11 số 9 — phổ biến trong cloud storage)".
- **Incident response time** (thời gian phản hồi sự cố): "Phản hồi trong 1 giờ, fix trong 24 giờ".
- **Penalties** (mức phạt) khi vi phạm: hoàn tiền, credit, gia hạn subscription miễn phí.

**SLA tồn tại với những đối tượng nào?**

| Đối tượng | Có SLA không? |
|---|---|
| External paying users (khách trả tiền bên ngoài) | ✅ Luôn có |
| Free external users (user miễn phí bên ngoài) | ✅ Đôi khi có (mức thấp hơn) |
| Internal teams (đội nội bộ trong công ty) | ✅ Có (không có penalty, nhưng vẫn hữu ích để align kỳ vọng) |

**Lưu ý**: các dịch vụ miễn phí (free) thường tránh công bố SLA chặt chẽ — vì không có lợi, chỉ rước hoạ vào thân.

## SLO — Service Level Objective (Mục tiêu mức dịch vụ)

> **SLO** = **Mục tiêu cụ thể** cho từng metric (chỉ số) của hệ thống — như viên gạch xây nên SLA.

**Ví dụ các SLO:**

```text
Availability SLO:  99.9% uptime
Latency SLO:       P90 < 100ms (90% request dưới 100ms)
Resolution SLO:    Sự cố được resolve trong 24-48 giờ
Error rate SLO:    < 0.1% request trả về lỗi
```

**Quan hệ với SLA:**
- Nếu có SLA → mỗi SLO là một điều khoản trong SLA.
- KHÔNG có SLA → vẫn **PHẢI có SLO** (để team biết mình đang nhắm tới đâu).

→ Ngay cả khi không bán dịch vụ ra ngoài, team luôn cần SLO để biết "đủ tốt" là bao nhiêu.

## SLI — Service Level Indicator (Chỉ số mức dịch vụ)

> **SLI** = **Con số thực tế đo được** dùng để verify (xác minh) xem hệ thống có đạt SLO không.

**Ví dụ:**

```text
SLO: Availability 99.9%
SLI: % request trả về 200 OK / tổng số request = 99.95%  ✓ Đạt

SLO: P90 latency < 100ms
SLI: Đo từ logs ra P90 = 87ms   ✓ Đạt
                      = 125ms  ✗ Không đạt

SLO: Error rate < 0.1%
SLI: (errors / total_requests) × 100 = 0.08%   ✓ Đạt
```

SLI được lấy từ:
- **Monitoring systems** (Prometheus, Datadog, New Relic).
- **Log analysis** (ELK stack, Splunk).
- **Synthetic monitoring** (ping tự động từ nhiều vị trí địa lý).

## Error Budget — ngân sách lỗi

Khái niệm thú vị từ Google SRE:

```text
SLO: 99.9% availability
Error Budget = 100% - 99.9% = 0.1%
             ≈ 43 phút downtime/tháng

Nếu còn error budget  →  có thể deploy mạnh tay, làm experiment
Nếu hết error budget  →  freeze deployments, tập trung sửa stability
```

→ Error budget biến "stability vs feature velocity" thành **quyết định dựa trên số liệu**, không còn là tranh cãi.

Cách quản lý:
- Còn nhiều error budget → cho phép team product push feature mới.
- Sắp hết → tạm dừng release, ưu tiên fix bugs.
- Đã hết → freeze (đóng băng) mọi non-critical change cho đến khi recover.

## 4 lưu ý khi định nghĩa SLOs

### Lưu ý 1: Tập trung vào metric mà user thực sự quan tâm

Không phải metric nào cũng cần SLO:

- ✅ **Response time** — user cảm nhận trực tiếp khi chờ trang load.
- ✅ **Availability** — user gặp lỗi không truy cập được.
- ✅ **Error rate** — user thấy thông báo lỗi.
- ❌ **CPU utilization** — user không biết, không cần.
- ❌ **Memory usage** — user không biết.

CPU/RAM cao mà user không bị ảnh hưởng → không phải vấn đề user-facing → không cần SLO. Chúng là internal metric phục vụ debug.

### Lưu ý 2: Ít SLO hơn = tốt hơn

Quá nhiều SLO → khó ưu tiên → đội ngũ không biết tập trung vào đâu.

Một vài SLO **quan trọng nhất** → dễ tập trung cải thiện, dễ communicate với business.

Quy tắc tốt: 3-5 SLO chính cho mỗi service.

### Lưu ý 3: Đặt mục tiêu thực tế, có buffer cho error budget

❌ **Sai**: Cam kết 99.999% (5 số 9) khi hệ thống chỉ thực sự đạt được 99.9% — vi phạm liên tục, mất uy tín, phải bồi thường liên miên.

✅ **Đúng**: Cam kết **thấp hơn** khả năng thực tế → có buffer cho các sự cố ngoài dự kiến.

**Strategy phổ biến — SLO ngoài và trong khác nhau:**

```text
External SLO:  99.9%   ← cam kết với khách hàng (an toàn, đạt được)
Internal SLO:  99.99%  ← mục tiêu nội bộ (tham vọng hơn)
```

→ Khi nội bộ vi phạm 99.99% nhưng vẫn trên 99.9% → team biết phải cải thiện, nhưng chưa phải compensate cho khách.

### Lưu ý 4: Phải có Recovery Plan rõ ràng

Khi SLI cho thấy sắp vi phạm SLO → cần có quy trình xử lý:

```text
SLI cho thấy bất thường  →  Alert trigger (cảnh báo)
                              ↓
On-call engineer được notify (gọi)
                              ↓
Runbook / Handbook: chỉ rõ phải làm gì trong tình huống này
                              ↓
Auto failover / restart / rollback nếu có
                              ↓
Post-mortem: Họp phân tích nguyên nhân, làm sao tránh lặp lại
```

Không có quy trình rõ → mỗi lần sự cố là một lần hỗn loạn → MTTR tăng → vi phạm SLO nặng hơn.

## Phân công trách nhiệm trong tổ chức

| Role (vai trò) | Trách nhiệm |
|---|---|
| **Business / Legal team** | Soạn SLA, chốt cam kết với khách |
| **Engineers / Architects** | Định nghĩa SLO và SLI cụ thể (cần kỹ thuật) |
| **DevOps / SRE** | Giám sát SLI, đảm bảo SLO, response khi vi phạm |

Mọi role cần align để mọi người hiểu cam kết là gì và mỗi người đóng vai trò gì.

## Ví dụ thực tế: Google SRE

Google là tổ chức tiên phong dùng SLO + Error Budget chính thức trong quy trình:

- Service đang dùng error budget → engineering team **focus on reliability** (sửa lỗi, giảm rủi ro).
- Service vẫn còn nhiều error budget → có thể **ship feature thoải mái hơn**.

→ Quyết định cân bằng giữa innovation (feature) và stability (ổn định) được dựa trên **dữ liệu**, không phải cảm tính của manager.

Tài liệu chính: Google SRE Book (đọc free online).

## Tóm tắt bài 5

```text
3 thuật ngữ cốt lõi:

SLA (Service Level Agreement) = Hợp đồng pháp lý
SLO (Service Level Objective) = Mục tiêu kỹ thuật cụ thể (P90 < 100ms)
SLI (Service Level Indicator) = Số đo thực tế (P90 = 87ms)

Quan hệ:  SLA chứa SLOs, SLOs được verify bằng SLIs

4 lưu ý khi định nghĩa SLO:
  ① Tập trung vào user-facing metric (không CPU/RAM)
  ② Ít SLO = tốt hơn (3-5 cái chính)
  ③ Đặt mục tiêu conservative (có buffer)
  ④ Phải có Recovery Plan rõ ràng

Error Budget = công cụ quản lý cân bằng feature vs reliability
```

Đây là kết thúc Phase 2. Bạn đã nắm 5 quality attributes quan trọng nhất: Performance, Scalability, Availability, Fault Tolerance, và cách đo lường (SLA/SLO/SLI). Phase 3 sẽ chuyển sang **API Design** — cách thiết kế giao diện giữa các thành phần.

---
**Bài kế tiếp**: [Phase 3 - API Design](../phase-3/01-api-design-intro.md) →
