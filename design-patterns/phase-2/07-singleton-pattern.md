# Bài 7: Singleton Pattern

## Singleton Pattern là gì?

Singleton đảm bảo một class **chỉ có đúng một instance** trong toàn bộ ứng dụng, và cung cấp một điểm truy cập toàn cục đến instance đó.

**Ví dụ thực tế cần Singleton:**
- Configuration manager (đọc file config một lần)
- Logger (một instance ghi log toàn app)
- Connection pool manager
- `java.lang.Runtime` trong Java

## Implement Singleton: 4 Cách

### Cách 1: Eager Singleton (đơn giản nhất)

```java
public class EagerSingleton {
    // Tạo instance ngay khi class được load
    private static final EagerSingleton INSTANCE = new EagerSingleton();
    
    // Private constructor - ngăn tạo instance từ bên ngoài
    // Cũng ngăn inheritance vì subclass phải gọi super()
    private EagerSingleton() {}
    
    // Điểm truy cập toàn cục duy nhất
    public static EagerSingleton getInstance() {
        return INSTANCE;
    }
    
    // Các method khác...
    public String getConfig(String key) { return "value"; }
}

// Sử dụng
EagerSingleton s1 = EagerSingleton.getInstance();
EagerSingleton s2 = EagerSingleton.getInstance();
System.out.println(s1 == s2); // true - cùng một object
```

**Ưu:** Đơn giản, thread-safe tự động  
**Nhược:** Tạo instance ngay khi class load, dù chưa cần → tăng startup time

### Cách 2: Lazy Singleton với Double-Checked Locking

```java
public class LazySingleton {
    // volatile đảm bảo threads không dùng cached value
    private static volatile LazySingleton instance;
    
    private LazySingleton() {}
    
    public static LazySingleton getInstance() {
        if (instance == null) {              // Check lần 1 (không lock)
            synchronized (LazySingleton.class) {
                if (instance == null) {      // Check lần 2 (có lock)
                    instance = new LazySingleton();
                }
            }
        }
        return instance;
    }
}
```

**Tại sao cần check 2 lần?**
- Thread A và Thread B cùng thấy `instance == null` → cả hai vào synchronized
- Thread A lấy lock, tạo instance, release lock
- Thread B lấy lock → check lần 2 → đã có instance → không tạo nữa

**`volatile` là gì?** Ngăn JVM cache giá trị biến trong CPU register. Đảm bảo mọi thread đều đọc giá trị mới nhất từ main memory.

**Ưu:** Lazy - chỉ tạo khi cần  
**Nhược:** Phức tạp, `volatile` chỉ work từ Java 5+

### Cách 3: Lazy Initialization Holder (Tốt nhất)

```java
public class HolderSingleton {
    
    private HolderSingleton() {}
    
    // Inner static class - chỉ được load khi lần đầu được tham chiếu
    private static class SingletonHolder {
        // Được khởi tạo ngay khi SingletonHolder class được load
        private static final HolderSingleton INSTANCE = new HolderSingleton();
    }
    
    public static HolderSingleton getInstance() {
        // Lần đầu gọi → JVM load SingletonHolder → khởi tạo INSTANCE
        return SingletonHolder.INSTANCE;
    }
}
```

**Cách hoạt động:**
- `SingletonHolder` chỉ được load khi `getInstance()` được gọi lần đầu
- JVM đảm bảo class initialization là thread-safe → không cần `synchronized`
- Kết hợp được cả Eager (thread-safe tự động) và Lazy (chỉ tạo khi cần)

**→ ĐÂY LÀ CÁCH KHUYÊN DÙNG nếu cần lazy singleton**

### Cách 4: Enum Singleton

```java
public enum EnumSingleton {
    INSTANCE; // Đây là singleton instance duy nhất
    
    // Thêm methods như class thường
    private String config;
    
    public String getConfig() { return config; }
    public void setConfig(String config) { this.config = config; }
}

// Sử dụng
EnumSingleton singleton = EnumSingleton.INSTANCE;
```

**Ưu:**
- Không thể tạo thêm instance (Java đảm bảo)
- Không thể subclass
- Handle serialization/deserialization đúng (không tạo thêm instance khi deserialize)

**Nhược:** Người mới thấy enum là "constant" → dùng enum cho singleton có mutable state trông kỳ lạ

## Ví dụ thực tế: Runtime trong Java

```java
// java.lang.Runtime là Eager Singleton
public class Runtime {
    private static Runtime currentRuntime = new Runtime(); // eager
    
    private Runtime() {}
    
    public static Runtime getRuntime() {
        return currentRuntime;
    }
    
    // Methods để tương tác với JVM
    public long freeMemory() { ... }
    public int availableProcessors() { ... }
    public Process exec(String command) { ... }
}

// Sử dụng
Runtime runtime = Runtime.getRuntime();
System.out.println("Free memory: " + runtime.freeMemory());
System.out.println("Processors: " + runtime.availableProcessors());
```

## So sánh 4 cách Implement

| Cách | Thread-safe | Lazy | Phức tạp | Khuyến nghị |
|------|------------|------|----------|------------|
| Eager | ✅ | ❌ | Thấp | ✅ Mặc định |
| Double-checked | ✅ | ✅ | Cao | ⚠️ Cần volatile |
| Holder | ✅ | ✅ | Trung bình | ✅✅ Tốt nhất |
| Enum | ✅ | ❌ | Thấp | ✅ Nếu state immutable |

## Design Considerations

| Điểm | Khuyến nghị |
|------|------------|
| **Ít mutable state** | Singleton với nhiều mutable global state = bad design |
| **Không truyền tham số vào getInstance()** | Nếu cần args, dùng Factory thay vì Singleton |
| **Spring context** | Spring beans là Singleton theo mặc định - không cần code Singleton |

## Singleton trong Spring

```java
// Spring tự quản lý Singleton - không cần code pattern
@Component  // hoặc @Service, @Repository...
public class UserService {
    // Spring đảm bảo chỉ có 1 instance trong ApplicationContext
    private final UserRepository repository;
    
    @Autowired
    public UserService(UserRepository repository) {
        this.repository = repository;
    }
}
```

## Pitfalls (Nhược điểm - QUAN TRỌNG)

1. **Global mutable state:** Singleton với nhiều state mutable = nguồn gốc bug khó tìm
2. **Khó unit test:** `static getInstance()` khó mock
3. **Class loader scope:** Mỗi ClassLoader có 1 instance riêng → trong web container như Tomcat với nhiều app, mỗi app có Singleton riêng
4. **Anti-pattern:** Nhiều người coi Singleton là anti-pattern vì tạo coupling ẩn (hidden dependency)

## Tóm lại

```
Singleton = Private constructor + Static instance + Public static getter
```

**Thứ tự ưu tiên:**
1. Tránh Singleton nếu có thể → dùng DI Framework
2. Nếu cần → dùng Eager Singleton (đơn giản nhất)
3. Nếu lo startup time → dùng Initialization Holder
4. Nếu state immutable → có thể dùng Enum

**Dùng Singleton khi:**
- Thực sự cần đúng 1 instance (config, logger)
- State là immutable hoặc rất ít mutable state
- Không có DI Framework (Spring, Guice...)

---
**Tiếp theo:** Object Pool Pattern →
