# Bài 1: System Requirements & Architectural Drivers

## Tại sao System Requirements quan trọng?

Khi thiết kế large-scale system, requirements khác với lập trình thông thường ở hai điểm:

1. **Scope & Abstraction**: Thay vì implement một method, ta phải design cả hệ thống — phạm vi lớn đến mức khó hình dung được
2. **Ambiguity (Sự mơ hồ)**: Requirements thường đến từ người không kỹ thuật, hoặc client chưa biết chính xác họ cần gì

**Ví dụ:** "Thiết kế hệ thống hitchhiking cho phép người đi nhờ xe tìm tài xế"
- Là real-time hay đặt trước?
- Mobile hay desktop?
- Thanh toán qua app hay trực tiếp?

→ **Hỏi những câu hỏi này là một phần của giải pháp.**

## Chi phí của việc sai requirements

Large-scale systems:
- Có nhiều engineers, nhiều teams
- Mất nhiều tháng để build
- Cần mua hardware/license upfront
- Có contracts với time commitments tài chính
- Chậm trễ → mất uy tín, mất khách hàng

**→ Getting requirements right upfront là CỰC KỲ quan trọng.**

## Ba loại Requirements (Architectural Drivers)

```
Requirements
├── 1. Feature Requirements (Functional)
├── 2. Quality Attributes (Non-functional)
└── 3. System Constraints
```

### 1. Feature Requirements (Functional Requirements)

- Mô tả **hệ thống làm gì** (behavior)
- Gắn liền với objective của hệ thống
- **KHÔNG quyết định kiến trúc** — bất kỳ kiến trúc nào cũng có thể đạt được bất kỳ feature nào

**Ví dụ (hitchhiking service):**
- Khi rider đăng nhập, hệ thống hiển thị bản đồ với tài xế trong 5 miles
- Khi chuyến đi hoàn thành, trừ tiền rider và chuyển cho driver trừ phí

### 2. Quality Attributes (Non-functional Requirements)

- Mô tả **hệ thống hoạt động như thế nào** (qualities)
- **CÓ quyết định kiến trúc** — các kiến trúc khác nhau cho quality attributes khác nhau
- Ví dụ: scalability, availability, reliability, security, performance

**Ví dụ:**
- "Search kết quả trong 100ms" → performance
- "Hệ thống available 99.9% thời gian" → availability
- "Deploy được 2 lần/tuần" → deployability

### 3. System Constraints

- Các **quyết định đã được đưa ra** hạn chế degrees of freedom của ta
- Không phải lúc nào cũng là điều xấu — đôi khi là "trụ cột" của kiến trúc

**Ba loại constraints:**
- **Technical**: locked vendor, required programming language, supported platforms
- **Business**: deadline, budget, team size, third-party services
- **Legal**: HIPAA (US healthcare), GDPR (EU data privacy), industry regulations

## Lưu ý về System Constraints

**Consideration 1**: Phân biệt **real constraints** vs **self-imposed constraints**
- Real: luật pháp, hợp đồng đã ký → không thể thay đổi
- Self-imposed: deadline từ business → có thể negotiate

**Consideration 2**: Đừng couple chặt với constraints
- Nếu bị locked vào một database/vendor, thiết kế để có thể swap out sau
- Minimize tight coupling để tránh re-architect toàn bộ nếu constraint thay đổi

## Tóm tắt

```
Architectural Drivers = Những yếu tố dẫn dắt quyết định kiến trúc
│
├── Feature Requirements → Định nghĩa WHAT
├── Quality Attributes  → Quyết định HOW (architecture)
└── System Constraints  → Giới hạn POSSIBILITIES
```

---
**Tiếp theo:** Bài 2 - Feature Requirements: Step by Step Process →
