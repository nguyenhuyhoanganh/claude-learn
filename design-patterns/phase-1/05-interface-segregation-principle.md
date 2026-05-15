# Bài 5: Interface Segregation Principle (ISP)

## Định nghĩa

> **"Clients shouldn't have to depend on interfaces that they don't use."**
> — Client không nên phải phụ thuộc vào interface mà họ không dùng.

Cụ thể hơn: Đừng tạo một interface "béo" (fat interface) chứa nhiều method không liên quan. Thay vào đó, tách thành nhiều interface nhỏ, tập trung.

## Khái niệm "Interface Pollution"

**Interface pollution** xảy ra khi:
- Một interface có quá nhiều method không liên quan đến nhau
- Các class implement interface đó phải implement các method vô nghĩa với chúng
- Dấu hiệu: method có body rỗng, throw `UnsupportedOperationException`, hoặc return `null`

## Ví dụ vi phạm ISP: Persistence Service

```java
// Interface "béo" - VI PHẠM ISP
public interface PersistenceService<T> {
    void save(T entity);
    void delete(T entity);
    T findById(String id);
    List<T> findByName(String name); // Chỉ có nghĩa với User, không phải Order!
}

// User Service - OK, findByName có nghĩa với User
public class UserPersistenceService implements PersistenceService<User> {
    private Map<String, User> users = new HashMap<>();
    
    @Override
    public void save(User user) { users.put(user.getId(), user); }
    
    @Override
    public void delete(User user) { users.remove(user.getId()); }
    
    @Override
    public User findById(String id) { return users.get(id); }
    
    @Override
    public List<User> findByName(String name) {
        // Logic tìm theo tên - có nghĩa với User
        return users.values().stream()
            .filter(u -> u.getName().equals(name))
            .collect(Collectors.toList());
    }
}

// Order Service - VI PHẠM! Order không có "name"
public class OrderPersistenceService implements PersistenceService<Order> {
    private Map<String, Order> orders = new HashMap<>();
    
    @Override
    public void save(Order order) { orders.put(order.getId(), order); }
    
    @Override
    public void delete(Order order) { orders.remove(order.getId()); }
    
    @Override
    public Order findById(String id) { return orders.get(id); }
    
    @Override
    public List<Order> findByName(String name) {
        // Order không có name - phải implement nhưng vô nghĩa!
        throw new UnsupportedOperationException("Orders don't have names"); // VI PHẠM!
    }
}
```

## Giải pháp: Tách interface

```java
// Interface cơ bản - CRUD operations, áp dụng cho mọi entity
public interface PersistenceService<T> {
    void save(T entity);
    void delete(T entity);
    T findById(String id);
}

// Interface mở rộng - chỉ cho entity có thể tìm theo tên
public interface NameSearchable<T> {
    List<T> findByName(String name);
}

// User Service implement CẢ HAI interface (vì User có tên)
public class UserPersistenceService 
    implements PersistenceService<User>, NameSearchable<User> {
    
    private Map<String, User> users = new HashMap<>();
    
    @Override
    public void save(User user) { users.put(user.getId(), user); }
    
    @Override
    public void delete(User user) { users.remove(user.getId()); }
    
    @Override
    public User findById(String id) { return users.get(id); }
    
    @Override
    public List<User> findByName(String name) {
        return users.values().stream()
            .filter(u -> u.getName().equals(name))
            .collect(Collectors.toList());
    }
}

// Order Service chỉ implement interface phù hợp
public class OrderPersistenceService implements PersistenceService<Order> {
    private Map<String, Order> orders = new HashMap<>();
    
    @Override
    public void save(Order order) { orders.put(order.getId(), order); }
    
    @Override
    public void delete(Order order) { orders.remove(order.getId()); }
    
    @Override
    public Order findById(String id) { return orders.get(id); }
    // Không cần implement findByName - không bị ép buộc!
}
```

## Ví dụ thực tế: Máy in đa chức năng

```java
// Interface "béo" - VI PHẠM
public interface MultifunctionDevice {
    void print(Document doc);
    void scan(Document doc);
    void fax(Document doc);
    void copy(Document doc);
}

// Máy in đơn giản phải implement fax và scan dù không có
public class SimplePrinter implements MultifunctionDevice {
    @Override
    public void print(Document doc) { /* thực sự in */ }
    
    @Override
    public void scan(Document doc) {
        throw new UnsupportedOperationException("No scanner!"); // VI PHẠM!
    }
    
    @Override
    public void fax(Document doc) {
        throw new UnsupportedOperationException("No fax!"); // VI PHẠM!
    }
    
    @Override
    public void copy(Document doc) {
        throw new UnsupportedOperationException("No copier!"); // VI PHẠM!
    }
}

// ============================================
// Giải pháp đúng: Tách interface nhỏ
// ============================================

public interface Printer {
    void print(Document doc);
}

public interface Scanner {
    void scan(Document doc);
}

public interface FaxMachine {
    void fax(Document doc);
}

public interface Copier {
    void copy(Document doc);
}

// Máy in đơn giản - chỉ implement Printer
public class SimplePrinter implements Printer {
    @Override
    public void print(Document doc) { System.out.println("Printing..."); }
}

// Máy in đa chức năng - implement tất cả
public class OfficePrinter implements Printer, Scanner, FaxMachine, Copier {
    @Override
    public void print(Document doc) { ... }
    
    @Override
    public void scan(Document doc) { ... }
    
    @Override
    public void fax(Document doc) { ... }
    
    @Override
    public void copy(Document doc) { ... }
}
```

## Cách nhận biết vi phạm ISP

| Dấu hiệu | Ý nghĩa |
|---------|---------|
| Method với body rỗng | Class không dùng method đó |
| `throw new UnsupportedOperationException()` | Class bị ép implement method vô nghĩa |
| Method return `null` hoặc giá trị mặc định | Không có implementation thực sự |
| Class chỉ dùng một phần methods của interface | Interface quá lớn |

## Cách tách interface hợp lý

1. **Nhóm các method liên quan** về cùng một chức năng/mục đích
2. **Mỗi interface = một vai trò** (role interface)
3. **Đặt tên interface theo hành vi:** `Printable`, `Serializable`, `Comparable`
4. **Client code chỉ dùng interface cần thiết**, không phụ thuộc vào cái khác

## ISP và Role Interfaces

Thay vì nghĩ "interface = danh sách method", hãy nghĩ **"interface = vai trò"**:

```java
// Các vai trò khác nhau
public interface Readable { String read(); }
public interface Writable { void write(String data); }
public interface Closeable { void close(); }

// File stream: đọc, ghi và đóng được
public class FileStream implements Readable, Writable, Closeable { ... }

// Console: chỉ đọc
public class ConsoleReader implements Readable { ... }
```

## Tóm lại

**"Nhiều interface nhỏ tốt hơn một interface lớn"**

ISP giúp:
- Tránh implement những method vô nghĩa
- Giảm coupling giữa các component
- Code dễ test hơn (mock chỉ interface cần thiết)
- Tuân theo SRP ở cấp độ interface

---
**Tiếp theo:** Dependency Inversion Principle →
