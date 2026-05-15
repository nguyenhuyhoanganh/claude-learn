# Bài 4: Decorator Pattern

## Decorator Pattern là gì?

Decorator là một **Structural Design Pattern** cho phép thêm behavior mới vào object bằng cách wrap nó trong một decorator object, mà không cần sửa class gốc.

**Ý tưởng cốt lõi:** Decorator implement cùng interface với object gốc, chứa object gốc bên trong, và thêm behavior trước/sau khi delegate cho object gốc.

**Ví dụ thực tế:**
- Cà phê + sữa + đường + kem → từng bước "trang trí" thêm
- Java IO Streams: `BufferedReader(new FileReader(...))` → thêm buffering
- Web middleware: request → auth → logging → compression → handler

## UML Cấu trúc

```
Client ──────> Component (interface)
                    ↑
          ┌─────────┴──────────────────────────┐
          ↓                                     ↓
    ConcreteComponent                    Decorator (abstract)
    (original object)                   ─────────────────────
                                        - component: Component
                                        + operation() {
                                            component.operation()
                                          }
                                                ↑
                                    ┌───────────┴───────────┐
                                    ↓                       ↓
                              DecoratorA              DecoratorB
                            (adds behavior A)       (adds behavior B)
```

## Ví dụ: Message Encoding/Encrypting

```java
// Component interface - được implement bởi cả real object và decorators
public interface Message {
    String getContent();
}

// Concrete Component - object gốc
public class TextMessage implements Message {
    private final String content;
    
    public TextMessage(String content) {
        this.content = content;
    }
    
    @Override
    public String getContent() {
        return content;
    }
}

// Base Decorator - abstract class
// Implement cùng interface, nhưng delegate cho wrapped object
public abstract class MessageDecorator implements Message {
    protected final Message message; // wrapped object
    
    public MessageDecorator(Message message) {
        this.message = message;
    }
    
    @Override
    public String getContent() {
        return message.getContent(); // delegate by default
    }
}

// Concrete Decorator 1 - HTML encode
public class HtmlEncodedMessage extends MessageDecorator {
    
    public HtmlEncodedMessage(Message message) {
        super(message);
    }
    
    @Override
    public String getContent() {
        return htmlEncode(message.getContent()); // add behavior: encode HTML
    }
    
    private String htmlEncode(String text) {
        return text
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("\"", "&quot;");
    }
}

// Concrete Decorator 2 - Base64 encode
public class Base64EncodedMessage extends MessageDecorator {
    
    public Base64EncodedMessage(Message message) {
        super(message);
    }
    
    @Override
    public String getContent() {
        byte[] bytes = message.getContent().getBytes(StandardCharsets.UTF_8);
        return Base64.getEncoder().encodeToString(bytes); // add behavior: Base64
    }
}

// Concrete Decorator 3 - Add timestamp
public class TimestampedMessage extends MessageDecorator {
    
    public TimestampedMessage(Message message) {
        super(message);
    }
    
    @Override
    public String getContent() {
        return "[" + LocalDateTime.now() + "] " + message.getContent();
    }
}

// Client - chain decorators tùy ý
public class Client {
    public static void main(String[] args) {
        Message original = new TextMessage("Hello <World> & <Everyone>");
        
        // Chỉ HTML encode
        Message htmlEncoded = new HtmlEncodedMessage(original);
        System.out.println(htmlEncoded.getContent());
        // "Hello &lt;World&gt; &amp; &lt;Everyone&gt;"
        
        // HTML encode rồi Base64
        Message doubleEncoded = new Base64EncodedMessage(
            new HtmlEncodedMessage(original)
        );
        System.out.println(doubleEncoded.getContent());
        // Base64(htmlEncoded content)
        
        // Timestamp + HTML encode + Base64
        Message fullyDecorated = new TimestampedMessage(
            new Base64EncodedMessage(
                new HtmlEncodedMessage(original)
            )
        );
        System.out.println(fullyDecorated.getContent());
    }
}
```

## Ví dụ thực tế: Java IO Streams

Java IO là ví dụ kinh điển nhất của Decorator:

```java
// Component: InputStream (abstract)
// ConcreteComponent: FileInputStream, ByteArrayInputStream...
// Decorator base: FilterInputStream
// Concrete decorators: BufferedInputStream, DataInputStream, ...

// Đọc file với buffering (thêm buffer vào FileInputStream)
InputStream inputStream = new BufferedInputStream(     // Decorator
                            new FileInputStream("data.txt") // ConcreteComponent
                          );

// Đọc file, có buffer, và đọc được data types như int, long...
DataInputStream dataStream = new DataInputStream(     // Decorator 2
                               new BufferedInputStream(  // Decorator 1
                                 new FileInputStream("data.bin") // ConcreteComponent
                               )
                             );

int number = dataStream.readInt(); // đọc 4 bytes as int

// Tương tự với Writer/OutputStream:
Writer writer = new BufferedWriter(     // Decorator (buffering)
                  new OutputStreamWriter( // Decorator (bytes → chars)
                    new FileOutputStream("output.txt") // ConcreteComponent
                  )
                );
writer.write("Hello World");
writer.flush(); // flush buffer
```

## Điểm khác biệt với Inheritance

```java
// Vấn đề với Inheritance:
class TextMessage { }
class HtmlTextMessage extends TextMessage { }
class Base64TextMessage extends TextMessage { }
class HtmlBase64TextMessage extends HtmlTextMessage { }   // cần class mới!
class Base64HtmlTextMessage extends Base64TextMessage { } // thứ tự khác nhau!

// Với Decorator: kết hợp tùy ý lúc runtime, không cần class mới
Message m = new Base64EncodedMessage(new HtmlEncodedMessage(new TextMessage("...")));
Message m2 = new HtmlEncodedMessage(new Base64EncodedMessage(new TextMessage("...")));
```

## Design Considerations

| Điểm | Giải thích |
|------|-----------|
| **Giống Component interface** | Decorator phải implement cùng interface với Component |
| **Thứ tự quan trọng** | A(B(x)) ≠ B(A(x)) → cẩn thận khi chain |
| **Quá nhiều decorators** | Khó debug khi nhiều layer → cân nhắc |
| **Chỉ thêm behavior** | Không nên thay đổi semantic của Component |

## So sánh Decorator vs Composite

| | Decorator | Composite |
|--|-----------|-----------|
| **Mục đích** | Thêm behavior | Treat đơn lẻ và group như nhau |
| **Children** | Chỉ 1 child | Nhiều children |
| **Focus** | Enrich object | Organize objects |
| **Direction** | Wrap (1 level) | Tree structure |

## Pitfalls (Nhược điểm)

1. **Type checking fail:** `instanceof HtmlEncodedMessage` sẽ fail khi wrap qua nhiều decorator
2. **Quá nhiều tiny classes:** Nhiều decorator class nhỏ → codebase phình to
3. **Ordering bugs:** Thứ tự chain quan trọng, dễ gây lỗi logic
4. **Khó remove decorator:** Không thể dễ dàng "bỏ" một decorator ra khỏi chain

## Tóm lại

```
Decorator = Wrap object trong object khác cùng interface để thêm behavior
```

**Nhận dạng Decorator:** Class implement interface X VÀ chứa field kiểu interface X.

**Dùng Decorator khi:**
- Muốn thêm behavior mà không sửa class gốc
- Cần các behavior combination tùy ý lúc runtime
- Inheritance tạo quá nhiều subclass (combinatorial explosion)

---
**Tiếp theo:** Composite Pattern →
