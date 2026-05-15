# Bài 1: Structural Design Patterns - Tổng quan

## Structural Patterns là gì?

Structural Patterns giải quyết câu hỏi: **"Làm thế nào để tổ chức và kết hợp các class và object để tạo ra cấu trúc lớn hơn?"**

Chúng tập trung vào:
- **Cách kết hợp (compose)** các class và object thành cấu trúc phức tạp hơn
- **Cách tái sử dụng** các class hiện có theo cách linh hoạt
- **Cách ẩn phức tạp** bên dưới các interface đơn giản

## 7 Structural Patterns

| Pattern | Mục đích | Analogie |
|---------|----------|---------|
| **Adapter** | Chuyển đổi interface không tương thích | Bộ chuyển đổi cắm điện |
| **Bridge** | Tách abstraction khỏi implementation | Remote control + TV |
| **Decorator** | Thêm hành vi mà không sửa class | Ly cà phê + thêm sữa, đường... |
| **Composite** | Treat đơn lẻ và nhóm như nhau | Cây thư mục file |
| **Facade** | Interface đơn giản cho hệ thống phức tạp | Mặt tiền tòa nhà |
| **Flyweight** | Chia sẻ object để tiết kiệm bộ nhớ | Ký tự trong text editor |
| **Proxy** | Đại diện (placeholder) cho object khác | Proxy server |

## Khi nào dùng Structural Patterns?

| Tình huống | Pattern phù hợp |
|-----------|----------------|
| Cần dùng library có interface không phù hợp | Adapter |
| Có nhiều biến thể của abstraction VÀ implementation | Bridge |
| Muốn thêm tính năng mà không sửa class gốc | Decorator |
| Xử lý cây phân cấp (file system, menu...) | Composite |
| Muốn đơn giản hóa API cho hệ thống phức tạp | Facade |
| Cần tạo rất nhiều object tương tự → tốn RAM | Flyweight |
| Cần kiểm soát truy cập, lazy loading, caching | Proxy |

## Điểm chung

Hầu hết Structural Patterns đều dùng **composition** (thành phần) thay vì inheritance (kế thừa), tuân theo nguyên tắc: *"Favor composition over inheritance"*.

---
**Tiếp theo:** Adapter Pattern →
