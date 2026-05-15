# Bài 3: Open-Closed Principle (OCP)

## Định nghĩa

> **"Software entities should be open for extension but closed for modification."**
> — Các thực thể phần mềm (class, module, method) nên mở để mở rộng nhưng đóng với sửa đổi.

Hay nói cách khác:
- **Open for extension:** Có thể thêm hành vi mới
- **Closed for modification:** Không cần sửa code đã viết và đã test

## Ý nghĩa trong Java

Trong Java, OCP được hiện thực hóa qua **kế thừa (inheritance) và ghi đè (method overriding)**:
- Base class đã được viết và test → không đụng vào
- Khi cần hành vi mới → tạo subclass và override method

## Ví dụ vi phạm OCP: Tính phí bảo hiểm

```java
// VI PHẠM OCP
public class InsurancePremiumCalculator {
    
    public double calculate(Person person) {
        if (person.getType() == PersonType.EMPLOYEE) {
            return person.getSalary() * 0.06;
        } else if (person.getType() == PersonType.MANAGER) {
            return person.getSalary() * 0.1;
        } else if (person.getType() == PersonType.DIRECTOR) {
            return person.getSalary() * 0.15;
        }
        // Mỗi lần thêm loại người mới → PHẢI SỬA CLASS NÀY
        return 0;
    }
}
```

**Vấn đề:** Khi thêm loại nhân viên mới (VD: `CONTRACTOR`), phải sửa class `InsurancePremiumCalculator` đang hoạt động tốt → có thể gây ra bug mới.

## Giải pháp đúng: Dùng kế thừa

```java
// Base class - KHÔNG SỬA NỮA sau khi đã test
public abstract class Person {
    protected String name;
    protected double salary;
    
    public abstract double calculateInsurancePremium();
    
    // getters...
}

// Mở rộng bằng cách tạo subclass MỚI
public class Employee extends Person {
    @Override
    public double calculateInsurancePremium() {
        return salary * 0.06;
    }
}

public class Manager extends Person {
    @Override
    public double calculateInsurancePremium() {
        return salary * 0.1;
    }
}

public class Director extends Person {
    @Override
    public double calculateInsurancePremium() {
        return salary * 0.15;
    }
}

// Khi thêm Contractor → chỉ tạo class mới, KHÔNG sửa gì
public class Contractor extends Person {
    @Override
    public double calculateInsurancePremium() {
        return salary * 0.03; // contractor trả ít hơn
    }
}

// Calculator giờ không cần if-else
public class InsurancePremiumCalculator {
    public double calculate(Person person) {
        return person.calculateInsurancePremium(); // Polymorphism
    }
}
```

**Kết quả:** Thêm loại người mới → chỉ tạo class mới, không đụng đến code cũ.

## Ví dụ thực tế: Payment Processing

```java
// Interface đóng vai trò "abstraction"
public interface PaymentProcessor {
    void processPayment(double amount);
}

// Các implementation - mỗi loại thanh toán là một class riêng
public class CreditCardProcessor implements PaymentProcessor {
    @Override
    public void processPayment(double amount) {
        System.out.println("Processing credit card payment: " + amount);
    }
}

public class PayPalProcessor implements PaymentProcessor {
    @Override
    public void processPayment(double amount) {
        System.out.println("Processing PayPal payment: " + amount);
    }
}

// Khi thêm Bitcoin → tạo class mới, không sửa gì cũ
public class BitcoinProcessor implements PaymentProcessor {
    @Override
    public void processPayment(double amount) {
        System.out.println("Processing Bitcoin payment: " + amount);
    }
}

// OrderService không cần thay đổi khi thêm phương thức thanh toán mới
public class OrderService {
    public void checkout(PaymentProcessor processor, double amount) {
        processor.processPayment(amount);
    }
}
```

## Cách áp dụng OCP

1. **Xác định điểm có thể thay đổi:** Tìm các `if-else` hoặc `switch` dựa trên type
2. **Tạo abstraction:** Dùng abstract class hoặc interface
3. **Di chuyển logic vào subclass/implementation:** Mỗi variant = một class riêng
4. **Sử dụng polymorphism:** Code gọi qua interface/abstract type

## OCP và Design Patterns

Nhiều Design Patterns ra đời chính là để hỗ trợ OCP:
- **Strategy Pattern:** Cho phép thay đổi algorithm mà không sửa context
- **Template Method Pattern:** Định nghĩa skeleton, subclass điền chi tiết
- **Decorator Pattern:** Thêm hành vi mà không sửa class gốc

## Lưu ý thực tế

OCP không có nghĩa là **không bao giờ** sửa code cũ. Trong thực tế:
- Khi phát hiện bug → phải sửa
- Khi refactor → có thể sửa
- Khi design sai từ đầu → phải sửa

OCP hướng đến việc **thiết kế từ đầu** để tránh phải sửa khi thêm tính năng mới. Hãy tự hỏi: "Nếu yêu cầu này thay đổi, tôi có phải sửa class này không?"

---
**Tiếp theo:** Liskov Substitution Principle →
