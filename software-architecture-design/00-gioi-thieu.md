# Software Architecture Design of Modern Large-Scale Systems

## Tổng quan khóa học

Khóa học này cung cấp kiến thức toàn diện về thiết kế kiến trúc phần mềm cho các hệ thống hiện đại, quy mô lớn — những hệ thống phục vụ hàng triệu người dùng như ride-sharing, video streaming, social media, online banking.

## Kiến trúc phần mềm là gì?

> **Software Architecture** = Mô tả cấp cao về cấu trúc hệ thống, các thành phần khác nhau và cách chúng giao tiếp để đáp ứng yêu cầu và ràng buộc của hệ thống.

**Ba điểm quan trọng:**
1. **High-level abstraction** — ẩn chi tiết implementation, không phải về chọn technology/language
2. **Components & Communication** — các thành phần là black boxes, được định nghĩa qua behavior và API
3. **Requirements & Constraints** — kiến trúc phải đáp ứng những gì hệ thống PHẢI làm và KHÔNG làm

## Tại sao kiến trúc phần mềm quan trọng?

```
Kiến trúc tốt → Hệ thống thành công
Kiến trúc kém → Tốn tháng trời rebuild, mất tiền, mất khách hàng
```

Kiến trúc phần mềm ảnh hưởng đến:
- **Performance & Scalability**: hệ thống xử lý tải như thế nào
- **Maintainability**: thêm tính năng mới có dễ không
- **Fault Tolerance**: phản ứng với failure như thế nào
- **Team Scalability**: tổ chức engineering team

## Software Architecture trong SDLC

```
Design Phase → Implementation → Testing → Deployment
     ↑                ↑
 Kiến trúc là   Kiến trúc là
 OUTPUT của     INPUT cho
 design phase   implementation
```

## Cấu trúc khóa học

| Phase | Nội dung |
|-------|----------|
| **Phase 1** | System Requirements & Architectural Drivers |
| **Phase 2** | Quality Attributes (Performance, Scalability, Availability) |
| **Phase 3** | API Design (RPC, REST) |
| **Phase 4** | Architectural Building Blocks (Load Balancer, Message Broker, API Gateway, CDN) |
| **Phase 5** | Data Storage at Global Scale |
| **Phase 6** | Architecture Patterns, Big Data, System Design Practice |

## Phương pháp tiếp cận

Không có một kiến trúc "đúng" duy nhất — mỗi quyết định kiến trúc là **sự đánh đổi (trade-off)**. Nhiệm vụ của Software Architect là:

1. Thu thập và phân tích requirements
2. Xác định quality attributes quan trọng nhất
3. Áp dụng industry-proven patterns
4. Thực hiện đúng trade-off cho từng use case cụ thể

---
**Bắt đầu:** Phase 1 - System Requirements →
