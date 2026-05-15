# Bài 4: Factory Method Pattern

## Factory Method là gì?

Factory Method là một **Creational Design Pattern** cho phép **subclass quyết định class nào sẽ được khởi tạo**. Thay vì gọi `new ConcreteClass()` trực tiếp, client gọi qua factory method — và subclass implement method đó để trả về object phù hợp.

**Đặc điểm quan trọng nhất:** Client code không cần biết class cụ thể nào được tạo ra.

## Vấn đề Factory Method giải quyết

Khi có một hierarchy các product class và muốn tạo object mà không cần biết class cụ thể:

```java
// Vấn đề: Client phụ thuộc vào class cụ thể
Message msg;
if (format.equals("json")) {
    msg = new JsonMessage(); // tightly coupled
} else {
    msg = new TextMessage(); // tightly coupled
}
```

Khi thêm `HtmlMessage`, phải sửa tất cả chỗ có `if-else` này.

## UML Cấu trúc

```
Creator (abstract)                    Product (abstract)
├── factoryMethod(): Product          Message
└── getMessage(): Message       ←     ├── JsonMessage
    └── uses factoryMethod()          └── TextMessage

JsonMessageCreator                    
├── factoryMethod(): JsonMessage ─────→ new JsonMessage()

TextMessageCreator
├── factoryMethod(): TextMessage ────→ new TextMessage()
```

## Implement Factory Method trong Java

```java
// Product - abstract class
public abstract class Message {
    public abstract String getContent();
    
    public void addDefaultHeaders() {
        // thêm headers mặc định
    }
    
    public void encrypt() {
        // mã hóa message
    }
}

// Concrete Products
public class JsonMessage extends Message {
    @Override
    public String getContent() {
        return "{\"message\":\"Hello from JSON\"}";
    }
}

public class TextMessage extends Message {
    @Override
    public String getContent() {
        return "Hello from Text";
    }
}

// Creator - abstract class có factory method
public abstract class MessageCreator {
    
    // Factory method - subclass phải override
    protected abstract Message createMessage();
    
    // Template method dùng factory method
    public Message getMessage() {
        Message msg = createMessage(); // gọi factory method
        msg.addDefaultHeaders();      // xử lý thêm
        msg.encrypt();
        return msg;
    }
}

// Concrete Creators
public class JsonMessageCreator extends MessageCreator {
    @Override
    protected Message createMessage() {
        return new JsonMessage(); // quyết định class cụ thể
    }
}

public class TextMessageCreator extends MessageCreator {
    @Override
    protected Message createMessage() {
        return new TextMessage();
    }
}

// Client code - không biết class cụ thể nào được tạo
public class Client {
    
    public static void printMessage(MessageCreator creator) {
        Message msg = creator.getMessage();
        System.out.println(msg.getContent());
    }
    
    public static void main(String[] args) {
        // Dùng JsonMessageCreator
        printMessage(new JsonMessageCreator());
        
        // Dùng TextMessageCreator - method printMessage không thay đổi!
        printMessage(new TextMessageCreator());
        
        // Thêm HtmlMessageCreator → không cần sửa printMessage
    }
}
```

## Thêm Product mới mà không sửa code cũ (tuân thủ OCP)

```java
// Thêm HTML Message - chỉ tạo 2 class mới
public class HtmlMessage extends Message {
    @Override
    public String getContent() {
        return "<html><body>Hello from HTML</body></html>";
    }
}

public class HtmlMessageCreator extends MessageCreator {
    @Override
    protected Message createMessage() {
        return new HtmlMessage();
    }
}

// Client code KHÔNG CẦN SỬA
printMessage(new HtmlMessageCreator()); // hoạt động ngay!
```

## Ví dụ thực tế: Iterator trong Java Collections

```java
// AbstractCollection định nghĩa factory method
public abstract class AbstractCollection<E> implements Collection<E> {
    
    // Factory method - subclass phải implement
    public abstract Iterator<E> iterator();
    
    // Method dùng factory method
    public boolean contains(Object o) {
        Iterator<E> it = iterator(); // gọi factory method
        // duyệt collection...
    }
}

// ArrayList override factory method
public class ArrayList<E> extends AbstractList<E> {
    @Override
    public Iterator<E> iterator() {
        return new Itr(); // tạo ArrayList-specific iterator
    }
}

// LinkedList override factory method
public class LinkedList<E> extends AbstractSequentialList<E> {
    @Override
    public Iterator<E> iterator() {
        return new ListItr(0); // tạo LinkedList-specific iterator
    }
}
```

`iterator()` là factory method! Subclass quyết định loại Iterator nào được tạo.

## Factory Method với Tham số (Parameterized Factory)

Factory method có thể nhận tham số để quyết định object nào tạo:

```java
public abstract class MessageCreator {
    
    // Factory method có tham số
    protected abstract Message createMessage(String recipient);
    
    public Message getMessage(String recipient) {
        return createMessage(recipient);
    }
}

public class JsonMessageCreator extends MessageCreator {
    @Override
    protected Message createMessage(String recipient) {
        JsonMessage msg = new JsonMessage();
        msg.setRecipient(recipient);
        return msg;
    }
}
```

## Design Considerations

| Điểm | Giải thích |
|------|-----------|
| **Creator có thể là concrete** | Nếu có default object, creator không cần abstract |
| **Hierarchy mirror** | Creator hierarchy phản chiếu Product hierarchy |
| **Template Method** | Creator thường dùng Template Method Pattern |
| **Tham số** | Factory method có thể nhận tham số như Simple Factory |

## So sánh Factory Method vs Simple Factory

| | Simple Factory | Factory Method |
|--|---------------|----------------|
| **Cấu trúc** | 1 class, static method | Hierarchy classes |
| **Mở rộng** | Sửa Factory | Thêm Subclass mới |
| **OCP** | Vi phạm | Tuân thủ |
| **Phức tạp** | Thấp | Cao hơn |
| **Subclass quyết định** | Không | Có |

## Pitfalls (Nhược điểm)

- **Nhiều class hơn:** Mỗi product cần một creator → số class tăng
- **Khó refactor:** Khó thêm Factory Method vào code đã viết
- **Subclass bắt buộc:** Đôi khi phải tạo subclass chỉ để dùng pattern

## Tóm lại

```
Factory Method = Abstract Creator định nghĩa factory method,
                 Concrete Creator implement method đó,
                 trả về Concrete Product
```

**Nhận dạng Factory Method:** Tìm abstract/interface method trong base class mà subclass implement để trả về object.

**Dùng Factory Method khi:**
- Có product hierarchy và muốn mở rộng dễ dàng
- Muốn subclass kiểm soát việc tạo object
- Tuân thủ Open-Closed Principle là quan trọng

---
**Tiếp theo:** Prototype Pattern →
