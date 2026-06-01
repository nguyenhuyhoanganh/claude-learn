# Bài 3: System Quality Attributes (Thuộc tính chất lượng hệ thống)

## Tại sao Quality Attributes lại là yếu tố quan trọng nhất?

Theo nhiều nghiên cứu công nghiệp, **phần lớn các đợt thiết kế lại (system redesign) hệ thống lớn** xảy ra **KHÔNG phải vì thiếu tính năng**, mà vì:

- Hệ thống chạy **không đủ nhanh** (chậm trong giờ cao điểm).
- **Không scale được** khi số người dùng tăng (vài chục nghìn user là sập).
- **Khó phát triển, bảo trì, hoặc bảo mật** (mỗi lần đổi code đều phải sửa hàng chục chỗ).

→ Sau khi redesign, hệ thống thường cung cấp **đúng các chức năng cũ** — chỉ khác nhau ở **chất lượng** (cách nó vận hành).

Bài học: chất lượng hệ thống (qualities) ảnh hưởng đến số phận của hệ thống **mạnh hơn cả số lượng feature**.

## Định nghĩa Quality Attribute

> **Quality Attributes** = các yêu cầu phi chức năng (non-functional requirements) mô tả **chất lượng** của hệ thống. Không phải hệ thống làm **được gì**, mà là hệ thống làm **tốt đến đâu** trên một chiều cụ thể (dimension).

⚠️ Khác với feature requirements (không quyết định kiến trúc), **quality attributes CÓ liên hệ trực tiếp với phần kiến trúc** — chọn kiến trúc khác sẽ ra chất lượng khác.

## Ví dụ phân biệt Functional Requirement vs Quality Attribute

```text
─────────────────────────────────────────────
Functional Requirement (yêu cầu chức năng):
"Khi user click nút Search, hệ thống hiển thị kết quả"
─────────────────────────────────────────────
Quality Attribute (về Performance — hiệu năng):
"Khi user click nút Search, hệ thống hiển thị kết quả
 trong vòng 100ms"
─────────────────────────────────────────────
```

Cùng 1 hành vi, nhưng quality attribute thêm vào **ngưỡng đo lường** (100ms) — đây là điểm khác biệt cốt lõi.

Quality attribute **không nhất thiết phải gắn với feature cụ thể**:

```text
─────────────────────────────────────────────
Quality Attribute toàn hệ thống (Availability):
"Online store sẵn sàng phục vụ 99.9% thời gian"
─────────────────────────────────────────────
Quality Attribute cho team phát triển (Deployability):
"Team có thể deploy phiên bản mới 2 lần/tuần
 mà không gây downtime"
─────────────────────────────────────────────
```

## 3 nguyên tắc quan trọng về Quality Attributes

### Nguyên tắc 1: Phải đo được và kiểm chứng được (Measurable & Testable)

❌ **Sai**: "Trang xác nhận đơn hàng (purchase confirmation) hiển thị **nhanh**" — không đo được.

✅ **Đúng**: "Trang xác nhận đơn hàng hiển thị trong **200ms** (đo bằng percentile 95)" — đo được, test được.

Nếu không đo được → ta không bao giờ biết hệ thống đã đạt yêu cầu hay chưa, không có cơ sở để cải thiện hoặc tranh luận.

Quy tắc đặt quality attribute tốt:
- Có con số cụ thể (200ms, 99.9%, 1000 req/s).
- Có điều kiện đo (under normal load, p95, on production).
- Có thể viết được test/monitor để verify.

### Nguyên tắc 2: Không tồn tại kiến trúc nào "tốt cho tất cả" (No silver bullet)

Một số quality attributes **mâu thuẫn (conflict)** với nhau trên cơ sở vật lý/toán học, không thể đạt cả 2 cùng lúc ở mức tối đa:

| Yêu cầu 1 | Yêu cầu 2 | Lý do mâu thuẫn |
|---|---|---|
| Login < 1 giây | Bảo mật cao (SSL, hash password mạnh) | SSL handshake + hash phức tạp ăn thời gian |
| API đơn giản | Backward compatibility (tương thích bản cũ) | Versioning thêm complexity vào API |
| Strong consistency (đồng nhất tuyệt đối) | High availability (luôn sẵn sàng) | CAP theorem chứng minh không thể có cả 2 + partition tolerance |
| Cost thấp | Performance cao | Hardware mạnh = đắt tiền |
| Time-to-market nhanh | Code chất lượng cao | Viết test + review tốn thời gian |

**→ Vai trò cốt lõi của Software Architect là quyết định trade-off — ưu tiên các quality attributes nào trước, hy sinh cái nào.** Không phải đặt mọi thứ ở mức "tốt nhất".

### Nguyên tắc 3: Phải khả thi (Feasibility)

Khách hàng đôi khi yêu cầu những điều **bất khả thi về mặt kỹ thuật** hoặc **chi phí cao đến vô lý**:

❌ "Trang web load dưới 100ms" — khi đã biết network latency Brazil → US trung bình là 200ms (vật lý đường truyền).

❌ "100% availability" — không bao giờ downtime, kể cả khi data center bị động đất? Không có hệ thống thực nào đạt được điều này.

❌ "Bảo vệ trước mọi loại hacker" — bảo mật là cuộc đua không có đích.

→ **Architect phải gắn cờ (call out) sớm những yêu cầu không khả thi** và đàm phán lại với khách hàng để có yêu cầu thực tế. Im lặng = đồng ý = về sau cả team phải chịu hậu quả.

## Quality Attributes phục vụ tất cả stakeholders, không chỉ end-user

Khi nói về "chất lượng hệ thống", đừng chỉ nghĩ đến người dùng cuối. Mỗi bên liên quan (stakeholder) có loại chất lượng riêng họ quan tâm:

| Stakeholder | Quality Attribute họ quan tâm |
|---|---|
| **End users** (người dùng cuối) | Performance (độ trễ < 200ms), UX mượt mà |
| **Business team** (kinh doanh) | Availability (99.9% uptime), revenue (đảm bảo doanh thu) |
| **Dev team** (lập trình viên) | Deployability (deploy nhanh, an toàn), maintainability (dễ sửa) |
| **Security team** (bảo mật) | Security (SSL, auth chuẩn, không lỗ hổng OWASP top 10) |
| **Ops team** (vận hành) | Observability (theo dõi được), alerting (cảnh báo sớm) |
| **CFO** (tài chính) | Cost efficiency (chi phí hợp lý) |

Architect tốt cân nhắc **tất cả stakeholder**, không chỉ end-user.

## Các Quality Attributes phổ biến trong hệ thống lớn

```text
Performance     — Response time (độ trễ), throughput (thông lượng)
Scalability     — Khả năng xử lý tải tăng theo thời gian
Availability    — Tỷ lệ uptime (99.9% = "three nines")
Fault Tolerance — Vẫn hoạt động khi có thành phần lỗi
Security        — Bảo vệ chống tấn công, rò rỉ dữ liệu
Maintainability — Dễ thay đổi và mở rộng
Testability     — Dễ viết test, dễ verify
Deployability   — Release nhanh và an toàn
Observability   — Quan sát được trạng thái hệ thống (logs, metrics, traces)
Cost Efficiency — Chi phí vận hành hợp lý
```

Mỗi quality attribute sẽ được phân tích chi tiết trong các phase sau (đặc biệt Phase 2-3).

## Tóm tắt

```text
Quality Attributes (Thuộc tính chất lượng):

- Định nghĩa: NON-FUNCTIONAL requirements, đo chất lượng,
              không phải đo chức năng

- Ảnh hưởng:  TRỰC TIẾP quyết định software architecture

- 3 nguyên tắc bắt buộc:
  ① Measurable & Testable  — đo được, kiểm chứng được
  ② Trade-off               — không tồn tại "tốt cho mọi mặt"
  ③ Feasible                — phải khả thi về kỹ thuật + chi phí

- Phục vụ tất cả stakeholders, không chỉ end-user
```

Hiểu sâu Quality Attributes là **nền tảng của tư duy kiến trúc sư phần mềm**. Mọi quyết định kiến trúc về sau đều phải tham chiếu lại chúng.

---
**Bài kế tiếp**: [Phase 2 — Quality Attributes chi tiết](../phase-2/01-performance.md) →
