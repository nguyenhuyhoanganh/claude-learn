# Bài 3: System Quality Attributes

## Tại sao Quality Attributes quan trọng nhất?

Nghiên cứu cho thấy: **Phần lớn system redesigns xảy ra KHÔNG phải vì thiếu tính năng, mà vì:**
- Hệ thống không đủ nhanh
- Không scale được khi user tăng
- Khó develop, maintain, hoặc bảo mật

→ Sau redesign, system thường cung cấp **cùng functionality** như trước — chỉ khác về qualities.

## Định nghĩa

> **Quality Attributes** = Non-functional requirements mô tả *chất lượng* của hệ thống, không phải những gì nó làm, mà là **làm tốt đến đâu trên một dimension cụ thể**.

**Quality attributes CÓ direct correlation với software architecture.**

## Ví dụ Quality Attributes

```
Functional Requirement:
"Khi user click Search, hiển thị kết quả"

Quality Attribute (Performance):
"Khi user click Search, hiển thị kết quả trong 100ms"
```

```
Quality Attribute không gắn với feature cụ thể (Availability):
"Online store available 99.9% thời gian"
```

```
Quality Attribute cho development team (Deployability):
"Team có thể deploy phiên bản mới 2 lần/tuần"
```

## Ba điều quan trọng về Quality Attributes

### 1. Phải Measurable & Testable

❌ "Purchase confirmation hiển thị **nhanh**" — không đo được
✅ "Purchase confirmation hiển thị trong **200ms**" — có thể test

Nếu không đo được → không biết hệ thống tốt hay xấu.

### 2. Không có architecture nào cho tất cả Quality Attributes

Một số quality attributes **mâu thuẫn** với nhau:

| Requirement 1 | Requirement 2 | Conflict |
|--------------|--------------|---------|
| Login < 1 giây | Bảo mật (SSL, password) | SSL + password nhập chậm hơn |
| Simple API | Backward compatibility | Versioning adds complexity |
| Strong consistency | High availability | CAP theorem |

**→ Nhiệm vụ của Software Architect: trade-off đúng, ưu tiên quality attributes phù hợp.**

### 3. Feasibility (Tính khả thi)

Client đôi khi yêu cầu điều **không thể hoặc quá tốn kém**:

❌ "Page load < 100ms" khi network latency Brazil→US đã là 200ms
❌ "100% availability" — không bao giờ downtime?
❌ "Full protection against all hackers"

**→ Architect phải call out sớm những requirements không feasible.**

## Stakeholders của Quality Attributes

Quality attributes không chỉ satisfy clients — cần satisfy **tất cả stakeholders**:

| Stakeholder | Example Quality Attribute |
|-------------|--------------------------|
| End users | Performance (latency < 200ms) |
| Business team | Availability (99.9%), revenue |
| Dev team | Deployability (2 deploys/week) |
| Security team | Security (SSL, auth) |
| Ops team | Observability, alerting |

## Các Quality Attributes phổ biến trong Large-Scale Systems

```
Performance     → Response time, throughput
Scalability     → Handle growing load
Availability    → Uptime percentage
Fault Tolerance → Continue operating despite failures
Security        → Protect against attacks
Maintainability → Easy to change & extend
Testability     → Easy to verify
Deployability   → Fast & safe releases
```

## Tóm tắt

```
Quality Attributes:
- Định nghĩa: NON-FUNCTIONAL, đo chất lượng, không phải functionality
- Ảnh hưởng: Trực tiếp QUYẾT ĐỊNH software architecture
- 3 considerations:
  ① Phải Measurable & Testable
  ② Phải Trade-off (không thể có tất cả)
  ③ Phải Feasible (thực tế có thể achieve)
```

---
**Tiếp theo:** Phase 2 - Quality Attributes Chi tiết →
