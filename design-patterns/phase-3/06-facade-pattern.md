# Bài 6: Facade Pattern

## Facade Pattern là gì?

Facade là một **Structural Design Pattern** cung cấp một interface đơn giản cho một hệ thống phức tạp gồm nhiều class, library hoặc framework.

**Ý tưởng cốt lõi:** Che giấu sự phức tạp bên trong sau một "mặt tiền" đơn giản. Client chỉ tương tác với Facade thay vì trực tiếp với hàng chục class bên trong.

**Ví dụ thực tế:**
- Nút "Đặt hàng" → ẩn hàng chục bước xử lý phía sau
- TV remote → ẩn mạch điện tử phức tạp
- API Gateway → một điểm vào thay vì nhiều microservice
- `URL.openStream()` trong Java

## UML Cấu trúc

```
Client ──────> Facade
               |  + simpleOperation()
               |
       ┌───────┼───────┬──────────┐
       ↓       ↓       ↓          ↓
   SubsystemA  SubsystemB  SubsystemC  SubsystemD
   (phức tạp)  (phức tạp)  (phức tạp)  (phức tạp)
```

## Ví dụ: Order Email System

Khi đặt hàng thành công, hệ thống phải: lấy template email, lấy thông tin order, tạo nội dung email, mã hóa và gửi. Không dùng Facade:

```java
// Client phải biết và dùng trực tiếp 5+ class
public void sendOrderEmail(Order order) {
    // Phức tạp: client phải hiểu từng bước
    TemplateEngine templateEngine = new TemplateEngine();
    Template template = templateEngine.getOrderTemplate();
    
    StatisticsService statsService = new StatisticsService();
    OrderStats stats = statsService.getOrderStats(order.getId());
    
    EmailBuilder emailBuilder = new EmailBuilder();
    emailBuilder.setTemplate(template);
    emailBuilder.setStats(stats);
    emailBuilder.setOrderId(order.getId());
    String emailContent = emailBuilder.build();
    
    EmailFormatter formatter = new EmailFormatter();
    String formattedEmail = formatter.format(emailContent);
    
    Mailer mailer = new Mailer();
    mailer.send(order.getCustomerEmail(), formattedEmail);
}
```

**Với Facade:**

```java
// Các subsystem classes
public class TemplateEngine {
    public Template getOrderTemplate() {
        System.out.println("Loading order email template");
        return new Template("order-confirmation");
    }
    
    public String render(Template template, Map<String, Object> data) {
        return "Rendered email with order data: " + data;
    }
}

public class Mailer {
    public void send(String to, String subject, String body) {
        System.out.printf("Sending email to %s: [%s]%n%s%n", to, subject, body);
    }
}

public class StatisticsService {
    public void logOrderEmail(String orderId) {
        System.out.println("Logging email sent for order: " + orderId);
    }
}

public class OrderReport {
    private final Order order;
    
    public OrderReport(Order order) {
        this.order = order;
    }
    
    public Map<String, Object> generateReportData() {
        Map<String, Object> data = new HashMap<>();
        data.put("orderId", order.getId());
        data.put("customerName", order.getCustomerName());
        data.put("items", order.getItems());
        data.put("total", order.getTotal());
        return data;
    }
}

// FACADE - interface đơn giản cho cả hệ thống phức tạp
public class EmailFacade {
    private final TemplateEngine templateEngine;
    private final Mailer mailer;
    private final StatisticsService statsService;
    
    // Facade tạo hoặc nhận các subsystem objects
    public EmailFacade() {
        this.templateEngine = new TemplateEngine();
        this.mailer = new Mailer();
        this.statsService = new StatisticsService();
    }
    
    // Constructor injection cho testing
    public EmailFacade(TemplateEngine engine, Mailer mailer, StatisticsService stats) {
        this.templateEngine = engine;
        this.mailer = mailer;
        this.statsService = stats;
    }
    
    // Một method đơn giản thay vì 5 bước
    public void sendOrderConfirmation(Order order) {
        Template template = templateEngine.getOrderTemplate();
        
        OrderReport report = new OrderReport(order);
        Map<String, Object> data = report.generateReportData();
        
        String emailBody = templateEngine.render(template, data);
        
        mailer.send(
            order.getCustomerEmail(),
            "Order Confirmed: #" + order.getId(),
            emailBody
        );
        
        statsService.logOrderEmail(order.getId());
    }
    
    // Thêm operation khác cũng đơn giản với client
    public void sendShippingNotification(Order order, String trackingNumber) {
        Template template = templateEngine.getOrderTemplate(); // hoặc shipping template
        Map<String, Object> data = new HashMap<>();
        data.put("trackingNumber", trackingNumber);
        data.put("orderId", order.getId());
        
        String emailBody = templateEngine.render(template, data);
        mailer.send(order.getCustomerEmail(), "Your order is on the way!", emailBody);
        statsService.logOrderEmail(order.getId());
    }
}

// Client - chỉ cần biết Facade
public class OrderController {
    private final EmailFacade emailFacade = new EmailFacade();
    
    public void placeOrder(Order order) {
        // Xử lý order...
        processPayment(order);
        saveToDatabase(order);
        
        // Gửi email - một dòng thay vì nhiều bước phức tạp
        emailFacade.sendOrderConfirmation(order);
    }
}
```

## Ví dụ thực tế: URL.openStream() trong Java

```java
// URL.openStream() là Facade cho quá trình kết nối HTTP phức tạp
URL url = new URL("https://example.com/data.json");
InputStream stream = url.openStream(); // Facade method

// Bên trong URL.openStream() làm nhiều bước:
// 1. Parse URL
// 2. Tạo URLConnection
// 3. Mở TCP connection
// 4. Handshake SSL/TLS (nếu HTTPS)
// 5. Gửi HTTP GET request
// 6. Đọc HTTP response headers
// 7. Trả về InputStream của response body

// Nếu không có Facade, phải viết:
URLConnection connection = url.openConnection();
connection.setRequestProperty("User-Agent", "Java/11");
connection.connect();
InputStream manualStream = connection.getInputStream();
// ... và nhiều bước khác
```

## Design Considerations

| Điểm | Giải thích |
|------|-----------|
| **Không ẩn hoàn toàn** | Facade không cản client truy cập trực tiếp subsystem nếu cần |
| **Không gói hết logic** | Facade chỉ coordinate, không thay thế subsystem classes |
| **Singleton** | Thường chỉ cần 1 Facade instance |
| **Layered facades** | Hệ thống lớn có thể có nhiều tầng facade |

## So sánh Facade vs Adapter

| | Facade | Adapter |
|--|--------|---------|
| **Mục đích** | Đơn giản hóa giao diện phức tạp | Fix incompatible interface |
| **Objects** | Wrap nhiều objects | Wrap 1 object |
| **Interface** | Tạo interface mới đơn giản | Chuyển đổi interface hiện có |
| **Khi nào** | Hệ thống phức tạp, nhiều step | Tích hợp incompatible code |

## Pitfalls (Nhược điểm)

1. **God object:** Facade phình to → trở thành anti-pattern nếu chứa quá nhiều logic
2. **Coupling:** Tất cả subsystem thay đổi → Facade có thể phải cập nhật
3. **Limited functionality:** Nếu client cần advanced feature, vẫn phải truy cập subsystem trực tiếp
4. **Testing:** Facade bao gồm nhiều subsystem → harder to unit test

## Tóm lại

```
Facade = Interface đơn giản che giấu sự phức tạp của nhiều subsystem
```

**Nhận dạng Facade:** Một class với vài method đơn giản, bên trong gọi nhiều class khác để phối hợp.

**Dùng Facade khi:**
- Hệ thống phức tạp với nhiều class cần phối hợp
- Muốn cung cấp simple API cho library phức tạp
- Muốn tạo layered architecture (controller → service facade → repositories)

---
**Tiếp theo:** Flyweight Pattern →
