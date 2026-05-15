# Bài 1: SOLID Design Principles - Tổng quan

## SOLID là gì?

SOLID là từ viết tắt của 5 nguyên tắc thiết kế phần mềm hướng đối tượng quan trọng nhất, được đặt tên bởi Robert C. Martin (Uncle Bob). Đây không phải là tất cả các nguyên tắc thiết kế, nhưng chúng là những nguyên tắc nền tảng quan trọng nhất mà mọi lập trình viên cần nắm vững.

| Chữ cái | Nguyên tắc | Ý nghĩa ngắn gọn |
|---------|-----------|------------------|
| **S** | Single Responsibility Principle | Mỗi class chỉ có một lý do để thay đổi |
| **O** | Open-Closed Principle | Mở để mở rộng, đóng với sửa đổi |
| **L** | Liskov Substitution Principle | Class con có thể thay thế class cha |
| **I** | Interface Segregation Principle | Nhiều interface nhỏ tốt hơn một interface lớn |
| **D** | Dependency Inversion Principle | Phụ thuộc vào abstraction, không phụ thuộc vào implementation |

## Tại sao phải học SOLID?

Khi viết code mà không tuân theo các nguyên tắc này, phần mềm sẽ dần trở nên:
- **Giòn (Fragile):** Thay đổi một chỗ gây lỗi chỗ khác không liên quan
- **Cứng nhắc (Rigid):** Khó thay đổi vì mọi thứ đều phụ thuộc lẫn nhau
- **Bất động (Immobile):** Không thể tái sử dụng các component ở dự án khác
- **Khó kiểm thử:** Unit test trở nên phức tạp hoặc không thể viết

SOLID giúp tạo ra code:
- Dễ bảo trì và mở rộng
- Dễ kiểm thử (unit test)
- Linh hoạt trước sự thay đổi yêu cầu

## Thứ tự học

Thứ tự trong từ viết tắt SOLID không phản ánh mức độ quan trọng. Thứ tự chỉ để dễ nhớ. Chúng ta sẽ học từng nguyên tắc theo thứ tự S → O → L → I → D.

---
**Tiếp theo:** Single Responsibility Principle →
