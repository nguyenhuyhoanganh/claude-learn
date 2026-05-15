# Bài 8: Proxy Pattern

## Proxy Pattern là gì?

Proxy là một **Structural Design Pattern** cung cấp một đại diện (placeholder/surrogate) cho object khác để kiểm soát việc truy cập đến object đó.

**Ý tưởng cốt lõi:** Client nghĩ nó đang làm việc với real object, nhưng thực ra đang làm việc với proxy. Proxy có thể thực hiện thêm logic (lazy loading, caching, access control, logging...) trước/sau khi delegate cho real object.

**Các loại Proxy phổ biến:**
- **Virtual Proxy:** Lazy creation — tạo object tốn kém chỉ khi thực sự cần
- **Remote Proxy:** Đại diện cho object ở máy khác (RMI, gRPC)
- **Protection Proxy:** Kiểm soát quyền truy cập
- **Caching Proxy:** Cache kết quả để tránh tính lại
- **Logging Proxy:** Ghi log tất cả operations

## UML Cấu trúc

```
Client ──────> Subject (interface)
                    ↑
          ┌─────────┴────────────┐
          ↓                      ↓
     RealSubject               Proxy
     (real object)        ─────────────────
                          - realSubject: RealSubject
                          + operation() {
                              // pre-processing
                              realSubject.operation()
                              // post-processing
                            }
```

## Ví dụ: Virtual Proxy cho Bitmap Image

```java
// Subject interface - client chỉ biết interface này
public interface Image {
    void display();
    int getWidth();
    int getHeight();
}

// Real Subject - tốn kém để tạo (load ảnh từ disk)
public class BitmapImage implements Image {
    private final String filename;
    private byte[] imageData;
    private int width;
    private int height;
    
    public BitmapImage(String filename) {
        this.filename = filename;
        loadFromDisk(); // tốn thời gian!
    }
    
    private void loadFromDisk() {
        System.out.println("Loading image from disk: " + filename);
        // Giả lập I/O tốn thời gian
        try { Thread.sleep(500); } catch (InterruptedException e) { }
        this.imageData = new byte[1024 * 1024]; // 1MB
        this.width = 1920;
        this.height = 1080;
    }
    
    @Override
    public void display() {
        System.out.println("Displaying " + filename + " (" + width + "x" + height + ")");
    }
    
    @Override public int getWidth() { return width; }
    @Override public int getHeight() { return height; }
}

// Virtual Proxy - lazy loading
public class ImageProxy implements Image {
    private final String filename;
    private BitmapImage realImage; // null cho đến khi cần
    
    public ImageProxy(String filename) {
        this.filename = filename;
        // KHÔNG tải ảnh ngay - chỉ lưu filename
        System.out.println("Proxy created for: " + filename);
    }
    
    // Lazy initialization - chỉ load khi thực sự cần
    private BitmapImage getRealImage() {
        if (realImage == null) {
            realImage = new BitmapImage(filename); // tải khi lần đầu dùng
        }
        return realImage;
    }
    
    @Override
    public void display() {
        getRealImage().display(); // trigger lazy load
    }
    
    @Override
    public int getWidth() {
        return getRealImage().getWidth();
    }
    
    @Override
    public int getHeight() {
        return getRealImage().getHeight();
    }
}

// Client - không biết đây là Proxy hay Real
public class ImageGallery {
    private final List<Image> images;
    
    public ImageGallery(List<String> filenames) {
        // Tạo proxy cho tất cả ảnh - NHANH, không tải gì
        images = filenames.stream()
            .map(ImageProxy::new) // proxy, không phải BitmapImage
            .collect(Collectors.toList());
        System.out.println("Gallery created with " + images.size() + " images (lazy)");
    }
    
    public void displayImage(int index) {
        images.get(index).display(); // chỉ load khi hiển thị
    }
    
    public static void main(String[] args) {
        List<String> files = Arrays.asList(
            "photo1.jpg", "photo2.jpg", "photo3.jpg", "photo4.jpg"
        );
        
        // Tạo gallery - proxy được tạo, ảnh CHƯA tải
        ImageGallery gallery = new ImageGallery(files);
        System.out.println("Gallery ready\n");
        
        // Chỉ load ảnh 0 và 2
        gallery.displayImage(0); // load photo1.jpg lần đầu
        gallery.displayImage(0); // dùng cached realImage
        gallery.displayImage(2); // load photo3.jpg
        // photo2.jpg và photo4.jpg không bao giờ bị load!
    }
}
```

## Protection Proxy

```java
// Protection Proxy - kiểm soát quyền truy cập
public interface DatabaseService {
    List<User> getAllUsers();
    void deleteUser(String userId);
    void updateUser(User user);
}

public class DatabaseServiceImpl implements DatabaseService {
    @Override public List<User> getAllUsers() { /* query DB */ return new ArrayList<>(); }
    @Override public void deleteUser(String userId) { /* delete */ }
    @Override public void updateUser(User user) { /* update */ }
}

public class DatabaseServiceProxy implements DatabaseService {
    private final DatabaseServiceImpl realService = new DatabaseServiceImpl();
    private final String userRole;
    
    public DatabaseServiceProxy(String userRole) {
        this.userRole = userRole;
    }
    
    @Override
    public List<User> getAllUsers() {
        if (!hasRole("READ")) throw new SecurityException("No read permission");
        return realService.getAllUsers();
    }
    
    @Override
    public void deleteUser(String userId) {
        if (!hasRole("ADMIN")) throw new SecurityException("No admin permission");
        realService.deleteUser(userId);
    }
    
    @Override
    public void updateUser(User user) {
        if (!hasRole("WRITE")) throw new SecurityException("No write permission");
        realService.updateUser(user);
    }
    
    private boolean hasRole(String requiredRole) {
        return switch (userRole) {
            case "ADMIN" -> true;
            case "EDITOR" -> requiredRole.equals("READ") || requiredRole.equals("WRITE");
            case "VIEWER" -> requiredRole.equals("READ");
            default -> false;
        };
    }
}
```

## Dynamic Proxy trong Java

Java có `java.lang.reflect.Proxy` để tạo proxy động mà không cần viết proxy class cho từng interface:

```java
import java.lang.reflect.*;

// InvocationHandler - xử lý tất cả method calls
public class LoggingHandler implements InvocationHandler {
    private final Object target; // real object
    
    public LoggingHandler(Object target) {
        this.target = target;
    }
    
    @Override
    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
        // Pre-processing: log trước khi gọi
        System.out.printf("[LOG] Calling %s.%s%n", 
            target.getClass().getSimpleName(), method.getName());
        long start = System.currentTimeMillis();
        
        try {
            // Delegate cho real object
            Object result = method.invoke(target, args);
            
            // Post-processing: log sau khi gọi
            long duration = System.currentTimeMillis() - start;
            System.out.printf("[LOG] %s completed in %dms%n", method.getName(), duration);
            return result;
        } catch (InvocationTargetException e) {
            System.out.printf("[LOG] %s threw: %s%n", method.getName(), e.getCause());
            throw e.getCause();
        }
    }
}

// Tạo dynamic proxy
public class Main {
    public static void main(String[] args) {
        DatabaseService realService = new DatabaseServiceImpl();
        
        // Tạo proxy động - không cần viết class LoggingDatabaseServiceProxy
        DatabaseService proxy = (DatabaseService) Proxy.newProxyInstance(
            DatabaseService.class.getClassLoader(),
            new Class[]{DatabaseService.class},
            new LoggingHandler(realService)
        );
        
        proxy.getAllUsers();
        // Output:
        // [LOG] Calling DatabaseServiceImpl.getAllUsers
        // [LOG] getAllUsers completed in 5ms
        
        proxy.deleteUser("user-123");
        // Output:
        // [LOG] Calling DatabaseServiceImpl.deleteUser
        // [LOG] deleteUser completed in 2ms
    }
}
```

## Proxy trong Frameworks

**Hibernate (JPA) - Lazy Loading:**
```java
// Khi load User, address không được load ngay
@Entity
public class User {
    @ManyToOne(fetch = FetchType.LAZY)
    private Address address; // Proxy ở đây!
}

User user = entityManager.find(User.class, 1L);
// address là proxy, chưa query DB

user.getAddress().getCity(); // LÚC NÀY mới query DB
```

**Spring AOP - Transaction, Security Proxy:**
```java
@Service
public class UserService {
    @Transactional // Spring tạo proxy để quản lý transaction
    public void updateUser(User user) {
        // Spring proxy: BEGIN TRANSACTION
        userRepository.save(user);
        // Spring proxy: COMMIT hoặc ROLLBACK
    }
}
```

## So sánh Proxy vs Decorator

| | Proxy | Decorator |
|--|-------|-----------|
| **Mục đích** | Kiểm soát truy cập/lazy creation | Thêm behavior |
| **Creation** | Proxy thường tự tạo real object | Decorator nhận real object từ bên ngoài |
| **Knowledge** | Proxy biết về real object type cụ thể | Decorator làm việc với interface |
| **Use case** | Lazy loading, security, caching | Wrapping thêm features |

## Design Considerations

| Điểm | Giải thích |
|------|-----------|
| **Cùng interface** | Proxy phải implement cùng interface với Real Object |
| **Lazy loading** | Virtual Proxy tạo Real Object lần đầu tiên cần |
| **Thread safety** | Lazy initialization phải thread-safe nếu dùng multi-thread |
| **Dynamic Proxy** | Java Reflection API cho phép proxy mà không cần code thủ công |

## Pitfalls (Nhược điểm)

1. **Performance overhead:** Thêm layer indirection → latency tăng nhẹ
2. **Complexity:** Code phức tạp hơn, khó debug hơn
3. **Response delay:** Virtual proxy tạo real object lần đầu → có thể chậm đột ngột
4. **Not always transparent:** Một số proxy có behavior khác real object (exception types, etc.)

## Tóm lại

```
Proxy = Đại diện kiểm soát truy cập đến real object
```

**Nhận dạng Proxy:** Implement cùng interface với real object, chứa reference đến real object, thực hiện logic bổ sung trước/sau khi delegate.

**Dùng Proxy khi:**
- Cần lazy initialization (Virtual Proxy)
- Cần kiểm soát quyền truy cập (Protection Proxy)
- Cần cache kết quả (Caching Proxy)
- Cần logging, monitoring (Logging Proxy)
- Cần truy cập remote object (Remote Proxy)

---
**Tiếp theo:** Behavioral Design Patterns →
