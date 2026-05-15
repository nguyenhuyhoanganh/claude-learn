# Bài 7: Flyweight Pattern

## Flyweight Pattern là gì?

Flyweight là một **Structural Design Pattern** dùng sharing (chia sẻ) để hỗ trợ hiệu quả số lượng lớn các object chi tiết (fine-grained objects).

**Vấn đề:** Khi cần tạo hàng ngàn/triệu object có nhiều phần giống nhau → tốn RAM không cần thiết.

**Ý tưởng:** Tách state thành 2 phần:
- **Intrinsic state** (trạng thái bên trong): Không thay đổi, được chia sẻ giữa các object
- **Extrinsic state** (trạng thái bên ngoài): Khác nhau giữa các instance, được truyền vào khi cần

## Ví dụ thực tế cần Flyweight

Game bắn súng với 10.000 viên đạn — mỗi viên đạn có:
- **Intrinsic:** màu sắc, hình dạng, sprite image (giống nhau!)
- **Extrinsic:** tọa độ x, y, hướng bay (khác nhau mỗi viên)

Không dùng Flyweight: 10.000 objects mỗi cái chứa cả sprite → tốn RAM
Dùng Flyweight: 1 shared sprite object, 10.000 objects chỉ lưu x, y, direction

## UML Cấu trúc

```
Client ──────> FlyweightFactory
                    |  + getFlyweight(key): Flyweight
                    |  - flyweights: Map<key, Flyweight>
                    |
                    ↓ (trả về shared objects)
               Flyweight (interface)
                    |  + operation(extrinsicState)
                    |
          ┌─────────┴──────────┐
          ↓                    ↓
   ConcreteFlyweight     UnsharedFlyweight
   (shared - intrinsic)   (not shared)
```

## Ví dụ: Error Message với Flyweight

```java
// Flyweight interface
public interface ErrorMessage {
    String getText(String language); // extrinsic: language
    void logError(String location);  // extrinsic: location
}

// Intrinsic state - chia sẻ được
// Object này được reuse cho tất cả "404" errors
public class HttpErrorMessage implements ErrorMessage {
    // INTRINSIC STATE - không đổi, được chia sẻ
    private final int errorCode;      // 404, 500, etc.
    private final String errorType;   // "Not Found", "Server Error"
    private final Map<String, String> messages; // translations
    
    public HttpErrorMessage(int errorCode, String errorType) {
        this.errorCode = errorCode;
        this.errorType = errorType;
        this.messages = new HashMap<>();
        // Load translations - tốn memory nhưng chỉ một lần
        loadTranslations();
    }
    
    private void loadTranslations() {
        messages.put("en", errorType + " (HTTP " + errorCode + ")");
        messages.put("vi", getVietnamese(errorCode));
        messages.put("fr", getFrench(errorCode));
    }
    
    private String getVietnamese(int code) {
        return switch (code) {
            case 404 -> "Không tìm thấy trang (HTTP 404)";
            case 500 -> "Lỗi máy chủ (HTTP 500)";
            case 403 -> "Không có quyền truy cập (HTTP 403)";
            default -> "Lỗi HTTP " + code;
        };
    }
    
    private String getFrench(int code) { return "Erreur HTTP " + code; }
    
    @Override
    public String getText(String language) { // extrinsic: language
        return messages.getOrDefault(language, messages.get("en"));
    }
    
    @Override
    public void logError(String location) { // extrinsic: where it happened
        System.out.printf("[HTTP %d %s] occurred at: %s%n", 
            errorCode, errorType, location);
    }
}

// Flyweight Factory - quản lý shared objects
public class ErrorMessageFactory {
    // Cache - key là error code
    private static final Map<Integer, ErrorMessage> cache = new HashMap<>();
    
    // Tạo mới hoặc trả về cached flyweight
    public static ErrorMessage getErrorMessage(int errorCode) {
        return cache.computeIfAbsent(errorCode, code -> {
            String type = switch (code) {
                case 400 -> "Bad Request";
                case 403 -> "Forbidden";
                case 404 -> "Not Found";
                case 500 -> "Internal Server Error";
                case 503 -> "Service Unavailable";
                default -> "Unknown Error";
            };
            System.out.println("Creating flyweight for HTTP " + code);
            return new HttpErrorMessage(code, type);
        });
    }
    
    public static int getCacheSize() {
        return cache.size();
    }
}

// Client - truyền extrinsic state vào khi dùng
public class WebServer {
    public void handleRequest(String path, String userLanguage) {
        if (!resourceExists(path)) {
            // Lấy shared flyweight (không tạo mới nếu đã có)
            ErrorMessage error = ErrorMessageFactory.getErrorMessage(404);
            
            // Truyền extrinsic state vào lúc dùng
            String message = error.getText(userLanguage);   // extrinsic: language
            error.logError("/request/" + path);             // extrinsic: path
            
            sendResponse(404, message);
        }
    }
    
    private boolean resourceExists(String path) { return false; }
    private void sendResponse(int code, String body) {
        System.out.println("Response " + code + ": " + body);
    }
    
    public static void main(String[] args) {
        WebServer server = new WebServer();
        
        // 1000 requests với 404 - chỉ tạo 1 flyweight object
        for (int i = 0; i < 1000; i++) {
            server.handleRequest("/missing-" + i, i % 2 == 0 ? "vi" : "en");
        }
        
        System.out.println("Flyweight objects created: " + 
            ErrorMessageFactory.getCacheSize()); // chỉ 1!
    }
}
```

## Ví dụ thực tế trong Java

### Integer Cache (−128 đến 127)

```java
// Java cache Integer objects từ -128 đến 127
Integer a = Integer.valueOf(100);
Integer b = Integer.valueOf(100);
System.out.println(a == b);  // true - same object (flyweight)

Integer c = Integer.valueOf(200);
Integer d = Integer.valueOf(200);
System.out.println(c == d);  // false - different objects (out of cache range)

// Tương tự với Character, Short, Byte, Long
```

### String Pool

```java
// String literals dùng String pool (flyweight)
String s1 = "hello"; // từ pool
String s2 = "hello"; // lấy từ pool - cùng object
System.out.println(s1 == s2);       // true

String s3 = new String("hello");    // tạo object mới, KHÔNG từ pool
System.out.println(s1 == s3);       // false

String s4 = s3.intern();            // đưa vào pool
System.out.println(s1 == s4);       // true
```

## Intrinsic vs Extrinsic State

```java
// Ví dụ ký tự trong text editor (ví dụ kinh điển)
public class Character {
    // INTRINSIC - chia sẻ cho tất cả 'A' trong document
    private final char value;       // 'A'
    private final FontData font;    // Arial 12pt
    
    // EXTRINSIC - khác nhau mỗi lần xuất hiện (không lưu trong flyweight)
    // position (x, y) được truyền vào khi render
    public void render(int x, int y, Color color) { // x, y, color = extrinsic
        // render character at position using its font
    }
}

// 1 document với 100.000 ký tự 'A' chỉ cần 1 Character('A') object
// vị trí x,y được lưu ở nơi khác (e.g. document model)
```

## So sánh Flyweight vs Object Pool

| | Flyweight | Object Pool |
|--|-----------|-------------|
| **Mục đích** | Chia sẻ state, tiết kiệm RAM | Tái sử dụng expensive objects |
| **State** | Immutable/intrinsic được chia sẻ | Mutable, reset sau khi dùng |
| **Trả về** | Không cần trả về (shared read-only) | Phải trả về pool sau khi dùng |
| **Dùng khi** | RAM là bottleneck, object giống nhau | Tạo object tốn kém (I/O, CPU) |

## Design Considerations

| Điểm | Giải thích |
|------|-----------|
| **Immutable intrinsic** | Intrinsic state phải immutable để thread-safe |
| **Factory mandatory** | Luôn dùng factory để đảm bảo sharing |
| **Complexity tradeoff** | Code phức tạp hơn → chỉ dùng khi thực sự cần |
| **Measure first** | Profile trước khi áp dụng Flyweight |

## Pitfalls (Nhược điểm)

1. **Phức tạp hóa code:** Phải tách intrinsic/extrinsic → design khó hơn
2. **Thread safety:** Intrinsic state bị shared → phải đảm bảo immutable
3. **Runtime cost:** Extrinsic state phải tính toán hoặc truyền vào mỗi lần dùng
4. **Premature optimization:** Nếu không thực sự cần → complexity không đáng

## Tóm lại

```
Flyweight = Chia sẻ phần chung (intrinsic), truyền phần riêng (extrinsic) khi dùng
```

**Nhận dạng Flyweight:** Factory trả về cached objects; object có state được tách thành shared và per-use.

**Dùng Flyweight khi:**
- Cần số lượng lớn object tương tự nhau (hàng nghìn+)
- Object tiêu tốn nhiều bộ nhớ
- Có thể tách state thành intrinsic và extrinsic rõ ràng

---
**Tiếp theo:** Proxy Pattern →
