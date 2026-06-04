# Bài 1: System Requirements và Architectural Drivers (các yếu tố dẫn dắt kiến trúc)

## Tại sao System Requirements (yêu cầu hệ thống) lại quan trọng?

Khi thiết kế hệ thống quy mô lớn (large-scale system), việc xác định requirements khác hẳn so với lập trình thông thường ở hai điểm cốt lõi:

1. **Phạm vi và mức trừu tượng (Scope & Abstraction)**: Thay vì hiện thực một method nhỏ, ta phải thiết kế **cả hệ thống** — phạm vi lớn đến mức khó hình dung được trong đầu nếu không có công cụ giúp tư duy.

2. **Sự mơ hồ (Ambiguity)**: Requirements thường đến từ người **không chuyên kỹ thuật**, hoặc từ khách hàng (client) **chưa biết chính xác họ cần gì**. Ta phải tự khai thác, đặt câu hỏi để làm rõ.

**Ví dụ minh hoạ:** Khách yêu cầu "Thiết kế hệ thống đi nhờ xe (hitchhiking) cho phép người đi nhờ tìm tài xế".

Câu hỏi cần làm rõ ngay:
- Có cần đi nhờ theo thời gian thực hay đặt trước?
- Trên di động hay máy tính để bàn?
- Thanh toán qua app hay trả tiền mặt trực tiếp?
- Người dùng đăng ký bằng số điện thoại, email, hay tài khoản mạng xã hội?
- Có giới hạn quốc gia/thành phố nào không?

→ **Việc đặt được những câu hỏi như vậy chính là một phần của giải pháp.** Một kiến trúc sư giỏi luôn biết hỏi đúng câu hỏi trước khi vẽ thiết kế.

## Cái giá của việc xác định sai requirements

Hệ thống lớn có những đặc trưng làm cho việc sửa lỗi sai requirements **cực kỳ tốn kém**:

- Có nhiều kỹ sư (engineers), nhiều nhóm (teams) tham gia.
- Mất nhiều tháng đến nhiều năm để xây dựng (build).
- Phải mua phần cứng (hardware) hoặc license phần mềm trả trước (upfront cost).
- Đã ký hợp đồng (contract) với cam kết thời gian và tài chính.
- Chậm trễ → mất uy tín thương hiệu, mất khách hàng vào tay đối thủ.

→ **Việc xác định đúng requirements ngay từ đầu là CỰC KỲ quan trọng**, vì sửa sau này có thể đắt gấp 10-100 lần so với sửa ngay từ giai đoạn thiết kế.

## Ba loại Requirements (gọi chung là Architectural Drivers — các yếu tố dẫn dắt kiến trúc)

Mọi requirements của hệ thống có thể phân vào 3 nhóm sau:

```text
Requirements (Yêu cầu)
├── 1. Feature Requirements      — Yêu cầu chức năng
├── 2. Quality Attributes        — Thuộc tính chất lượng (yêu cầu phi chức năng)
└── 3. System Constraints        — Ràng buộc hệ thống
```

### 1. Feature Requirements (Yêu cầu chức năng)

- Mô tả **hệ thống làm được những gì** (mô tả hành vi — behavior).
- Gắn liền trực tiếp với **mục tiêu** (objective) mà hệ thống phải đạt được.
- ⚠️ **KHÔNG quyết định kiến trúc** — vì bất kỳ kiến trúc nào về cơ bản cũng có thể đáp ứng được bất kỳ feature nào (với chi phí khác nhau).

**Ví dụ với dịch vụ đi nhờ xe:**
- Khi người đi nhờ (rider) đăng nhập, hệ thống hiển thị bản đồ kèm danh sách tài xế (driver) trong bán kính 5 dặm.
- Khi chuyến đi hoàn thành, hệ thống trừ tiền từ tài khoản của rider và chuyển cho driver sau khi trừ phí dịch vụ.
- Khi rider huỷ chuyến trong vòng 2 phút, không bị tính phí.

### 2. Quality Attributes (Thuộc tính chất lượng — còn gọi là Non-functional Requirements)

- Mô tả **hệ thống hoạt động như thế nào** — không phải làm gì, mà là chất lượng của việc làm đó.
- ⚠️ **CÓ quyết định kiến trúc** — kiến trúc khác nhau sẽ cho ra các thuộc tính chất lượng khác nhau.
- Các ví dụ: scalability (khả năng mở rộng), availability (tính sẵn sàng), reliability (tính tin cậy), security (bảo mật), performance (hiệu năng), maintainability (khả năng bảo trì), deployability (khả năng triển khai).

**Ví dụ cụ thể:**
- "Kết quả tìm kiếm trả về trong 100ms" → **performance**.
- "Hệ thống sẵn sàng phục vụ 99.9% thời gian" → **availability**.
- "Có thể deploy bản mới 2 lần một tuần mà không downtime" → **deployability**.
- "Mật khẩu user được lưu sao cho admin cũng không đọc được" → **security**.

### 3. System Constraints (Ràng buộc hệ thống)

- Là các **quyết định đã được đưa ra trước** (đã rồi), giới hạn không gian lựa chọn (degrees of freedom) của người thiết kế.
- Không phải lúc nào cũng là điều xấu — đôi khi chính ràng buộc lại trở thành **trụ cột** của kiến trúc.

**Ba loại constraints chính:**

| Loại | Mô tả | Ví dụ |
|---|---|---|
| **Technical** (kỹ thuật) | Đã chốt nhà cung cấp công nghệ, ngôn ngữ lập trình bắt buộc, nền tảng phải hỗ trợ | "Phải dùng AWS vì công ty đã có hợp đồng" |
| **Business** (kinh doanh) | Deadline đã chốt, ngân sách (budget) giới hạn, quy mô nhóm cố định, phải dùng dịch vụ bên thứ ba (third-party) cụ thể | "Phải ra mắt trong Q3" |
| **Legal** (pháp lý) | Quy định pháp luật, ngành nghề | HIPAA (luật y tế Mỹ), GDPR (bảo vệ dữ liệu cá nhân ở châu Âu), PCI-DSS (thanh toán thẻ) |

## 2 lưu ý quan trọng về System Constraints

### Lưu ý 1: Phân biệt **real constraints** vs **self-imposed constraints**

- **Real constraints** (ràng buộc thật sự): luật pháp, hợp đồng đã ký → **không thể thay đổi**, phải chấp nhận và thiết kế quanh.
- **Self-imposed constraints** (ràng buộc do tự áp): deadline business đặt ra, ngân sách → **có thể thương lượng (negotiate)** nếu cần.

Kiến trúc sư giỏi luôn hỏi: "Đây là ràng buộc thật sự hay chỉ là giả định?" Đôi khi 1 cuộc trao đổi với stakeholder có thể bỏ được constraint tưởng như cố định.

### Lưu ý 2: Đừng **couple chặt** (gắn chặt) với constraints

- Nếu hệ thống bị khoá (lock) vào một database hay nhà cung cấp cụ thể, hãy thiết kế sao cho **có thể đổi (swap out) sau này** mà không phải viết lại toàn bộ.
- Giảm thiểu tight coupling (gắn kết chặt) để tránh trường hợp constraint thay đổi (vendor tăng giá, deprecate sản phẩm) → buộc phải re-architect (thiết kế lại) toàn bộ.

Ví dụ: ngay cả khi đã dùng AWS, nên đặt 1 lớp abstraction (trừu tượng hoá) trước các dịch vụ AWS để sau này nếu phải chuyển sang GCP/Azure thì chỉ thay lớp đó, không phải sửa cả nghìn dòng code.

## Tóm tắt bài 1

```text
Architectural Drivers = Các yếu tố dẫn dắt mọi quyết định kiến trúc
│
├── 1. Feature Requirements     → Định nghĩa hệ thống LÀM GÌ
│                                  (không quyết định kiến trúc)
│
├── 2. Quality Attributes       → Quyết định kiến trúc LÀM NHƯ THẾ NÀO
│                                  (kiến trúc khác nhau cho chất lượng khác nhau)
│
└── 3. System Constraints       → Giới hạn KHÔNG GIAN LỰA CHỌN
                                   (technical, business, legal)
```

Hiểu được 3 loại requirements này là **bước đầu tiên** trước khi bắt tay vào thiết kế bất kỳ kiến trúc nào.

---
**Bài kế tiếp**: [Bài 2 - Feature Requirements: Quy trình từng bước](02-feature-requirements.md) →
