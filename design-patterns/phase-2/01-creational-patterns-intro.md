# Bài 1: Creational Design Patterns - Tổng quan

## Design Patterns là gì?

Design Patterns là các **giải pháp đã được kiểm chứng** cho các vấn đề thường gặp trong thiết kế phần mềm. Chúng không phải là code sẵn để copy-paste, mà là **blueprint** (bản thiết kế) mô tả cách giải quyết vấn đề trong một ngữ cảnh cụ thể.

Design Patterns được tổng hợp bởi "Gang of Four" (GoF) - 4 tác giả Erich Gamma, Richard Helm, Ralph Johnson, John Vlissides trong cuốn sách kinh điển **"Design Patterns: Elements of Reusable Object-Oriented Software"** (1994).

## 3 nhóm Design Patterns

| Nhóm | Số lượng | Tập trung vào |
|------|---------|--------------|
| **Creational** | 7 patterns | Cách tạo object từ class |
| **Structural** | 7 patterns | Cách tổ chức/kết hợp class và object |
| **Behavioral** | 12 patterns | Cách các class và object giao tiếp với nhau |

## Creational Design Patterns

Tất cả Creational Patterns đều giải quyết một câu hỏi: **"Làm thế nào để tạo object một cách linh hoạt và phù hợp?"**

### Các pattern trong nhóm này

| Pattern | Vấn đề giải quyết |
|---------|------------------|
| **Builder** | Tạo object phức tạp từng bước, tách rời quá trình xây dựng khỏi representation |
| **Simple Factory** | Đóng gói logic tạo object vào một method tĩnh |
| **Factory Method** | Để subclass quyết định class nào sẽ được khởi tạo |
| **Prototype** | Tạo object mới bằng cách clone từ object có sẵn |
| **Abstract Factory** | Tạo các "gia đình" object liên quan mà không biết class cụ thể |
| **Singleton** | Đảm bảo một class chỉ có đúng một instance |
| **Object Pool** | Tái sử dụng object thay vì tạo và hủy liên tục |

### Khi nào dùng Creational Patterns?

1. **Quá trình tạo object phức tạp** → Builder, Abstract Factory
2. **Muốn ẩn logic tạo object khỏi client** → Simple Factory, Factory Method
3. **Tạo nhiều object tương tự nhau** → Prototype
4. **Chỉ cần một instance duy nhất** → Singleton
5. **Object tốn kém để tạo mới** → Object Pool, Prototype

## Cách học hiệu quả

Với mỗi pattern, tập trung vào:
1. **Vấn đề** nó giải quyết là gì?
2. **Cấu trúc** (UML) trông như thế nào?
3. **Cách implement** trong Java
4. **Khi nào nên dùng** và **khi nào không nên dùng**
5. **Phân biệt** với các pattern tương tự

---
**Tiếp theo:** Builder Pattern →
