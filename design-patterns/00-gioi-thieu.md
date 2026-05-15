# Giới thiệu: Design Patterns trong Java

## Design Patterns là gì?

Design Pattern là **giải pháp có thể tái sử dụng** cho các vấn đề thường gặp trong thiết kế phần mềm hướng đối tượng. Chúng không phải là code có thể copy-paste, mà là **template mô tả cách giải quyết vấn đề** trong nhiều tình huống khác nhau.

**Tại sao cần Design Patterns?**
- **Ngôn ngữ chung (Shared vocabulary):** "Dùng Observer" thay vì giải thích dài dòng
- **Tái sử dụng kiến thức:** Giải pháp đã được chứng minh, không cần "reinvent the wheel"
- **Code dễ đọc hơn:** Developer hiểu patterns sẽ hiểu intent ngay lập tức
- **Giảm technical debt:** Cấu trúc tốt từ đầu → ít refactoring sau

## Nguồn gốc: Gang of Four (GoF)

Design Patterns được hệ thống hóa bởi **Erich Gamma, Richard Helm, Ralph Johnson, John Vlissides** trong cuốn sách nổi tiếng năm 1994: *"Design Patterns: Elements of Reusable Object-Oriented Software"*. Nhóm 4 tác giả được gọi là "Gang of Four" (GoF).

Cuốn sách mô tả **23 design patterns** cơ bản, chia thành 3 nhóm chính.

## 3 Nhóm Design Patterns

### 1. Creational Patterns (Khởi tạo)
Giải quyết vấn đề **tạo object** sao cho linh hoạt và tái sử dụng được.

| Pattern | Mục đích tóm gọn |
|---------|-----------------|
| Builder | Xây dựng object phức tạp từng bước |
| Simple Factory | Factory method đơn giản trong 1 class |
| Factory Method | Để subclass quyết định class nào được tạo |
| Abstract Factory | Factory của factories — tạo family of objects |
| Prototype | Clone object thay vì tạo mới từ đầu |
| Singleton | Đảm bảo chỉ có duy nhất 1 instance |
| Object Pool | Tái sử dụng objects tốn kém (thread, DB connection) |

### 2. Structural Patterns (Cấu trúc)
Giải quyết cách **tổ chức và kết hợp** classes/objects để tạo cấu trúc lớn hơn.

| Pattern | Mục đích tóm gọn |
|---------|-----------------|
| Adapter | Chuyển đổi interface không tương thích |
| Bridge | Tách abstraction khỏi implementation |
| Decorator | Thêm behavior mà không sửa class gốc |
| Composite | Cây phân cấp — treat leaf và composite giống nhau |
| Facade | Interface đơn giản cho hệ thống phức tạp |
| Flyweight | Chia sẻ objects để tiết kiệm RAM |
| Proxy | Đại diện kiểm soát truy cập đến real object |

### 3. Behavioral Patterns (Hành vi)
Giải quyết cách **giao tiếp và tương tác** giữa objects/classes.

| Pattern | Mục đích tóm gọn |
|---------|-----------------|
| Chain of Responsibility | Chuỗi handler, mỗi cái có thể xử lý hoặc chuyển tiếp |
| Command | Đóng gói request thành object (undo/redo/queue) |
| Interpreter | Parse và evaluate ngôn ngữ đơn giản |
| Mediator | Object trung gian điều phối giao tiếp |
| Iterator | Duyệt collection mà không lộ cấu trúc bên trong |
| Memento | Lưu/khôi phục state (snapshot, undo) |
| Observer | Subject notify observers khi state thay đổi |
| State | Thay đổi behavior khi internal state thay đổi |
| Strategy | Đổi algorithm lúc runtime |
| Template Method | Base class định nghĩa skeleton, subclass điền chi tiết |
| Visitor | Thêm operations mà không sửa class hierarchy |
| Null Object | Object "không làm gì" thay cho null |

## Quan hệ giữa Patterns và SOLID

Design Patterns và SOLID Principles bổ trợ nhau:

| SOLID Principle | Patterns thể hiện rõ |
|----------------|---------------------|
| **SRP** - Single Responsibility | Command, Iterator, Mediator |
| **OCP** - Open/Closed | Strategy, Observer, Decorator |
| **LSP** - Liskov Substitution | Composite, Template Method, Proxy |
| **ISP** - Interface Segregation | Adapter, Facade |
| **DIP** - Dependency Inversion | Factory Method, Abstract Factory, Builder |

## Cách học hiệu quả

```
Đừng học thuộc → Hãy hiểu VẤN ĐỀ mà pattern giải quyết
```

1. **Nhận diện vấn đề trước:** Null check ở khắp nơi? → Null Object. Nhiều if-else cho algorithm? → Strategy
2. **Học theo nhóm:** Creational → Structural → Behavioral
3. **Thực hành nhận diện:** Tìm patterns trong Java Collections, Spring Framework, JDK
4. **So sánh patterns tương tự:** State vs Strategy, Decorator vs Proxy, Iterator vs Composite

## Patterns trong Java/Spring thực tế

```java
// Collections
Collections.emptyList()      // Null Object
Collections.sort(list, comp) // Strategy (Comparator)
list.iterator()              // Iterator

// Java I/O
new BufferedReader(new FileReader(file))  // Decorator
                                          
// java.sql / JDBC
DriverManager.getConnection(...)          // Factory Method / Simple Factory
connection.setSavepoint()                 // Memento

// Java NIO
Files.walkFileTree(path, visitor)         // Visitor

// Spring Framework
@Transactional                            // Proxy (AOP)
@EventListener                            // Observer
@Component (singleton scope)              // Singleton
ApplicationContext.getBean(...)           // Factory

// Spring Security
SecurityFilterChain                       // Chain of Responsibility
```

## Lộ trình học

```
Phase 1: SOLID Principles    → Nền tảng tư duy hướng đối tượng
Phase 2: Creational Patterns → Cách tạo objects linh hoạt  
Phase 3: Structural Patterns → Cách tổ chức/kết hợp objects
Phase 4: Behavioral Patterns → Cách objects tương tác nhau
```

---
**Bắt đầu:** SOLID Principles →
