# Bài 6: Dependency Inversion Principle (DIP)

## Định nghĩa

DIP có 2 phần:

> **Phần 1:** "High-level modules should not depend on low-level modules. Both should depend on abstractions."
> — Module cấp cao không nên phụ thuộc vào module cấp thấp. Cả hai nên phụ thuộc vào abstraction.

> **Phần 2:** "Abstractions should not depend on details. Details should depend on abstractions."
> — Abstraction không nên phụ thuộc vào implementation. Implementation nên phụ thuộc vào abstraction.

## Dependency là gì?

**Dependency** (phụ thuộc) là bất cứ object nào bạn cần để thực hiện một chức năng.

```java
// Ví dụ: Để in ra console, code phụ thuộc vào System.out
System.out.println("Hello"); // System.out là dependency

// Ví dụ: Để tạo report, method phụ thuộc vào JsonFormatter và FileWriter
public void generateReport(Report report) {
    JsonFormatter formatter = new JsonFormatter(); // dependency 1
    FileWriter writer = new FileWriter("report.json"); // dependency 2
    writer.write(formatter.format(report));
}
```

## High-level vs Low-level Module

| Module | Ý nghĩa | Ví dụ |
|--------|---------|-------|
| **High-level** | Chứa business logic, quy trình nghiệp vụ | `ReportGenerator`, `OrderService` |
| **Low-level** | Chứa chức năng cơ bản có thể dùng ở nhiều nơi | `FileWriter`, `JsonFormatter`, `EmailSender` |

**Vấn đề:** Nếu high-level module trực tiếp dùng low-level module (tạo `new` trong code), chúng **tightly coupled**.

## Ví dụ vi phạm DIP: Message Printer

```java
// VI PHẠM DIP
public class MessagePrinter {
    
    public void writeMessage(Message message, String fileName) {
        // Tightly coupled với JsonFormatter
        JsonFormatter formatter = new JsonFormatter(); // dependency cứng
        
        // Tightly coupled với PrintWriter (file)
        try (PrintWriter writer = new PrintWriter(new FileWriter(fileName))) {
            writer.println(formatter.format(message)); // dependency cứng
        } catch (IOException e) {
            e.printStackTrace();
        }
    }
}
```

**Vấn đề với code này:**
1. Muốn in ra console thay vì file → phải sửa `MessagePrinter`
2. Muốn format XML thay vì JSON → phải sửa `MessagePrinter`
3. Không thể test `MessagePrinter` mà không tạo file thực sự

## Giải pháp: Dùng Abstraction + Dependency Injection

```java
// Bước 1: Tạo abstractions (interfaces)
public interface Formatter {
    String format(Message message);
}

public interface MessageWriter {
    void write(String content);
}

// Bước 2: Các implementation (low-level modules)
public class JsonFormatter implements Formatter {
    @Override
    public String format(Message message) {
        // Dùng Jackson để serialize JSON
        return new ObjectMapper().writeValueAsString(message);
    }
}

public class XmlFormatter implements Formatter {
    @Override
    public String format(Message message) {
        // Format XML
        return "<message>" + message.getContent() + "</message>";
    }
}

public class FileMessageWriter implements MessageWriter {
    private final String fileName;
    
    public FileMessageWriter(String fileName) {
        this.fileName = fileName;
    }
    
    @Override
    public void write(String content) {
        try (PrintWriter pw = new PrintWriter(new FileWriter(fileName))) {
            pw.println(content);
        } catch (IOException e) {
            e.printStackTrace();
        }
    }
}

public class ConsoleMessageWriter implements MessageWriter {
    @Override
    public void write(String content) {
        System.out.println(content); // in ra console
    }
}

// Bước 3: High-level module phụ thuộc vào ABSTRACTION, không phải implementation
public class MessagePrinter {
    
    // Nhận dependencies từ bên ngoài (Dependency Injection)
    public void writeMessage(Message message, Formatter formatter, MessageWriter writer) {
        String formatted = formatter.format(message);
        writer.write(formatted);
    }
}

// Bước 4: Client code cung cấp dependencies
public class Main {
    public static void main(String[] args) {
        MessagePrinter printer = new MessagePrinter();
        Message message = new Message("Hello, World!");
        
        // Ghi JSON vào file
        printer.writeMessage(
            message,
            new JsonFormatter(),
            new FileMessageWriter("output.json")
        );
        
        // Ghi XML ra console - KHÔNG SỬA MessagePrinter
        printer.writeMessage(
            message,
            new XmlFormatter(),
            new ConsoleMessageWriter()
        );
    }
}
```

## Các hình thức Dependency Injection

### 1. Constructor Injection (khuyên dùng)

```java
public class OrderService {
    private final PaymentGateway paymentGateway;
    private final EmailService emailService;
    
    // Dependencies được truyền vào qua constructor
    public OrderService(PaymentGateway paymentGateway, EmailService emailService) {
        this.paymentGateway = paymentGateway;
        this.emailService = emailService;
    }
    
    public void processOrder(Order order) {
        paymentGateway.charge(order.getTotal());
        emailService.sendConfirmation(order.getCustomerEmail());
    }
}
```

### 2. Method Injection

```java
public class MessagePrinter {
    // Nhận dependencies qua method parameter
    public void writeMessage(Message msg, Formatter formatter, MessageWriter writer) {
        writer.write(formatter.format(msg));
    }
}
```

### 3. Setter Injection

```java
public class ReportService {
    private ReportRepository repository;
    
    // Inject qua setter
    public void setRepository(ReportRepository repository) {
        this.repository = repository;
    }
}
```

## DIP trong thực tế: Spring Framework

Spring Boot sử dụng DIP làm nền tảng qua cơ chế **Dependency Injection (IoC Container)**:

```java
// Interface (abstraction)
public interface UserRepository {
    User findById(Long id);
    void save(User user);
}

// Implementation (low-level detail)
@Repository
public class JpaUserRepository implements UserRepository {
    // JPA implementation
}

// High-level module phụ thuộc vào interface
@Service
public class UserService {
    private final UserRepository repository; // interface, không phải implementation
    
    @Autowired // Spring inject JpaUserRepository vào đây
    public UserService(UserRepository repository) {
        this.repository = repository;
    }
    
    public User getUser(Long id) {
        return repository.findById(id);
    }
}
```

**Lợi ích:** Khi cần đổi database → chỉ tạo `MongoUserRepository` implements `UserRepository`, không sửa `UserService`.

## Lợi ích của DIP

| Trước DIP | Sau DIP |
|-----------|---------|
| Phải tạo `new ConcreteClass()` trong code | Nhận dependency từ bên ngoài |
| Tightly coupled với implementation | Chỉ phụ thuộc vào interface |
| Khó test (phải dùng class thật) | Dễ test (dùng mock/stub) |
| Khó thay đổi implementation | Đổi implementation không cần sửa code |

## DIP và Unit Testing

```java
// Dễ test vì có thể mock dependencies
@Test
void testProcessOrder() {
    // Arrange
    PaymentGateway mockGateway = mock(PaymentGateway.class);
    EmailService mockEmail = mock(EmailService.class);
    
    OrderService service = new OrderService(mockGateway, mockEmail);
    Order order = new Order(100.0, "test@example.com");
    
    // Act
    service.processOrder(order);
    
    // Assert
    verify(mockGateway).charge(100.0);
    verify(mockEmail).sendConfirmation("test@example.com");
}
```

## Tóm lại toàn bộ SOLID

| Nguyên tắc | Câu hỏi kiểm tra |
|-----------|-----------------|
| SRP | "Class này có nhiều hơn một lý do để thay đổi không?" |
| OCP | "Khi thêm tính năng mới, tôi có phải sửa code cũ không?" |
| LSP | "Class con có thể thay thế class cha mà không phá vỡ behavior không?" |
| ISP | "Class có phải implement method vô nghĩa với mình không?" |
| DIP | "High-level module có phụ thuộc trực tiếp vào low-level module không?" |

---
**Tiếp theo:** Phase 2 - Creational Design Patterns →
