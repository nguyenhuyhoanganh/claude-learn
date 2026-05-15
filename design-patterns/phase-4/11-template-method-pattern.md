# Bài 11: Template Method Pattern

## Template Method Pattern là gì?

Template Method là một **Behavioral Design Pattern** định nghĩa skeleton (khung sườn) của một algorithm trong base class, để subclasses override các bước cụ thể mà không thay đổi cấu trúc tổng thể.

**Ý tưởng cốt lõi:** Base class định nghĩa "công thức" (template method), subclass cung cấp chi tiết từng bước. Algorithm được gọi từ base class, nhưng implementation của mỗi step đến từ subclass.

**Ví dụ thực tế:**
- Framework hooks (Spring, Hibernate lifecycle)
- `AbstractList`, `AbstractSet` trong Java Collections
- Report generation (header → data → footer)
- `HttpServlet.service()` gọi `doGet()`/`doPost()`

## UML Cấu trúc

```
AbstractClass
─────────────────────────────
+ templateMethod()        // final - không override!
  {                      
    step1()               // có thể abstract hoặc có default
    step2()               // abstract - subclass PHẢI implement
    step3()               // có thể hook (optional override)
  }
+ step1()                 // optional: có implementation mặc định
+ abstract step2()        // required: subclass phải implement
+ step3()                 // hook: empty by default, subclass có thể override

         ↑
    ┌────┴────────────┐
    ↓                 ↓
ConcreteClassA   ConcreteClassB
+ step2()        + step2()
(+ step3())      (+ step1() override)
```

## Implement Template Method

```java
// Abstract base class - định nghĩa template
public abstract class OrderPrinter {
    
    // TEMPLATE METHOD - final: không ai override cấu trúc này
    public final void printOrder(Order order) {
        printHeader(order);
        printItems(order);
        printTotal(order);
        printFooter(order);
    }
    
    // Abstract steps - subclass PHẢI implement
    protected abstract void printHeader(Order order);
    protected abstract void printItems(Order order);
    
    // Concrete steps với default implementation
    protected void printTotal(Order order) {
        // Default: in tổng đơn giản
        double total = order.getItems().stream()
            .mapToDouble(item -> item.getPrice() * item.getQuantity())
            .sum();
        System.out.printf("TOTAL: $%.2f%n", total);
    }
    
    // Hook method - optional override (không làm gì mặc định)
    protected void printFooter(Order order) {
        // Default: không in gì
    }
}

// Concrete Class 1 - Text format
public class TextOrderPrinter extends OrderPrinter {
    
    @Override
    protected void printHeader(Order order) {
        System.out.println("========================================");
        System.out.println("ORDER CONFIRMATION");
        System.out.println("Order #: " + order.getId());
        System.out.println("Date: " + order.getDate());
        System.out.println("Customer: " + order.getCustomerName());
        System.out.println("========================================");
    }
    
    @Override
    protected void printItems(Order order) {
        System.out.println("Items:");
        for (OrderItem item : order.getItems()) {
            System.out.printf("  %-30s  %3dx  $%8.2f%n",
                item.getName(), item.getQuantity(), item.getPrice());
        }
        System.out.println("----------------------------------------");
    }
    
    @Override
    protected void printFooter(Order order) {
        System.out.println("Thank you for your order!");
        System.out.println("Contact: support@shop.com");
    }
}

// Concrete Class 2 - HTML format
public class HtmlOrderPrinter extends OrderPrinter {
    
    @Override
    protected void printHeader(Order order) {
        System.out.println("<!DOCTYPE html><html><body>");
        System.out.println("<h1>Order Confirmation</h1>");
        System.out.printf("<p>Order #: <strong>%s</strong></p>%n", order.getId());
        System.out.printf("<p>Customer: %s</p>%n", order.getCustomerName());
        System.out.println("<table border='1'><tr><th>Item</th><th>Qty</th><th>Price</th></tr>");
    }
    
    @Override
    protected void printItems(Order order) {
        for (OrderItem item : order.getItems()) {
            System.out.printf("<tr><td>%s</td><td>%d</td><td>$%.2f</td></tr>%n",
                item.getName(), item.getQuantity(), item.getPrice());
        }
        System.out.println("</table>");
    }
    
    @Override
    protected void printTotal(Order order) {
        double total = order.getItems().stream()
            .mapToDouble(item -> item.getPrice() * item.getQuantity())
            .sum();
        System.out.printf("<p><strong>TOTAL: $%.2f</strong></p>%n", total);
    }
    
    @Override
    protected void printFooter(Order order) {
        System.out.println("<p>Thank you!</p></body></html>");
    }
}

// Client
public class Main {
    public static void main(String[] args) {
        Order order = new Order("ORD-001", "John Doe", LocalDate.now());
        order.addItem(new OrderItem("Java Book", 2, 49.99));
        order.addItem(new OrderItem("Mouse", 1, 29.99));
        
        System.out.println("=== TEXT FORMAT ===");
        OrderPrinter textPrinter = new TextOrderPrinter();
        textPrinter.printOrder(order); // gọi template method
        
        System.out.println("\n=== HTML FORMAT ===");
        OrderPrinter htmlPrinter = new HtmlOrderPrinter();
        htmlPrinter.printOrder(order); // cùng template, khác implementation
    }
}
```

## Ví dụ thực tế: Java AbstractList

```java
// AbstractList.get() là abstract → subclass phải implement
// AbstractList.add(), remove() có default implementation (throws exception)
// AbstractList.size() là abstract → subclass phải implement

public class SquareNumberList extends AbstractList<Integer> {
    private final int size;
    
    public SquareNumberList(int size) { this.size = size; }
    
    @Override
    public Integer get(int index) { // implement abstract method
        return (index + 1) * (index + 1); // 1, 4, 9, 16, ...
    }
    
    @Override
    public int size() { return size; } // implement abstract method
    
    // Không cần implement iterator, indexOf, contains, etc.
    // AbstractList đã có template methods dùng get() và size()
}

// Sử dụng
AbstractList<Integer> squares = new SquareNumberList(5);
System.out.println(squares); // [1, 4, 9, 16, 25]
System.out.println(squares.contains(9)); // true
System.out.println(squares.indexOf(16)); // 3
```

## Ví dụ thực tế: HttpServlet

```java
// HttpServlet.service() là template method
// doGet(), doPost(), doPut() là abstract/hook methods
public class MyServlet extends HttpServlet {
    
    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse res)
            throws IOException {
        res.getWriter().println("GET response");
        // HttpServlet.service() gọi doGet() khi nhận GET request
    }
    
    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse res)
            throws IOException {
        res.getWriter().println("POST response");
    }
    // service() → kiểm tra method → gọi doGet/doPost/... tự động
}
```

## Hook Methods

```java
// Hook = optional step với default implementation (thường là empty)
public abstract class DataMigration {
    
    public final void migrate() {
        connect();
        if (shouldBackup()) { // HOOK - subclass có thể override
            backup();
        }
        readData();
        transformData();
        writeData();
        cleanup();
    }
    
    protected abstract void readData();
    protected abstract void writeData();
    
    protected void transformData() {} // Hook: default no-op
    protected boolean shouldBackup() { return true; } // Hook với default
    protected void backup() { System.out.println("Default backup"); }
    
    private void connect() { System.out.println("Connecting..."); }
    private void cleanup() { System.out.println("Cleanup done"); }
}

// Subclass 1 - cần transform, không cần backup
public class FastMigration extends DataMigration {
    @Override
    protected boolean shouldBackup() { return false; } // override hook
    
    @Override
    protected void transformData() { // override hook
        System.out.println("Fast transform");
    }
    
    @Override
    protected void readData() { System.out.println("Reading..."); }
    
    @Override
    protected void writeData() { System.out.println("Writing..."); }
}
```

## So sánh Template Method vs Strategy

| | Template Method | Strategy |
|--|----------------|---------|
| **Cơ chế** | Inheritance | Composition |
| **Algorithm** | Skeleton fixed, steps vary | Toàn bộ algorithm vary |
| **Linh hoạt** | Cố định khi compile | Đổi lúc runtime |
| **Code reuse** | Base class có common code | Ít code reuse hơn |
| **OCP** | Mở rộng qua subclass | Mở rộng qua interface |

## Design Considerations

| Điểm | Giải thích |
|------|-----------|
| **Granularity balance** | Quá nhiều steps → tedious to implement. Quá ít steps → mất kiểm soát algorithm |
| **final template method** | Đánh dấu `final` để ngăn subclass override toàn bộ algorithm |
| **Subclass inheritance** | Subclasses có thể kế thừa lẫn nhau để tái sử dụng step implementations |
| **Factory Method** | Factory Method pattern thường sử dụng Template Method để định nghĩa factory workflow |

## Pitfalls (Nhược điểm)

1. **Inheritance coupling:** Subclass phụ thuộc vào base class → khó test riêng lẻ
2. **Liskov violation risk:** Subclass có thể phá vỡ invariants của algorithm
3. **Class explosion:** Nhiều variants → nhiều subclasses
4. **Hard to trace:** Logic spread across base và subclass → khó debug

## Tóm lại

```
Template Method = Base class định nghĩa skeleton algorithm, subclass điền vào chi tiết
```

**Dùng Template Method khi:**
- Nhiều class có cùng algorithm structure nhưng khác nhau ở vài bước
- Muốn tránh code duplication trong common algorithm skeleton
- Framework muốn cho phép users customize một số bước

---
**Tiếp theo:** Visitor Pattern →
