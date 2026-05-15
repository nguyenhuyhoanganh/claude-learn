# Bài 8: Object Pool Pattern

## Object Pool Pattern là gì?

Object Pool là một **Creational Design Pattern** duy trì một tập hợp (pool) các object được tạo sẵn và tái sử dụng chúng thay vì tạo mới và hủy liên tục.

**Ý tưởng cốt lõi:** Khi chi phí tạo object cao (kết nối database, tải ảnh lớn, khởi tạo phức tạp), thay vì `new` mỗi lần cần, ta lấy từ pool, dùng xong trả về pool.

**Ví dụ thực tế cần Object Pool:**
- Database connection pool (JDBC)
- Thread pool (`ExecutorService`)
- Bitmap/image cache trên Android
- HTTP connection pool

## UML Cấu trúc

```
Client ──────────> ObjectPool
                       |  + acquire(): PooledObject
                       |  + release(obj): void
                       |
                       | (chứa)
                       ↓
                   PooledObject (interface)
                       |  + reset()
                       |
              ┌────────┴────────┐
              ↓                 ↓
          Bitmap           Connection
```

## Implementation Steps

1. Tạo class cho pooled object
2. Tạo `ObjectPool` class với:
   - `BlockingQueue` để chứa available objects
   - Method `acquire()` để lấy object
   - Method `release()` để trả về
3. Quyết định kích thước pool
4. Xử lý trường hợp pool rỗng (block hay throw exception)

## Implement Object Pool trong Java

```java
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.function.Supplier;

// Interface cho pooled object
public interface Poolable {
    void reset(); // reset về trạng thái ban đầu trước khi trả về pool
}

// Bitmap - object tốn kém để tạo
public class Bitmap implements Poolable {
    private final String filename;
    private byte[] data; // dữ liệu ảnh lớn
    
    public Bitmap(String filename) {
        this.filename = filename;
        // Giả lập tải ảnh tốn thời gian
        System.out.println("Loading bitmap from: " + filename);
        this.data = loadFromDisk(filename);
    }
    
    private byte[] loadFromDisk(String filename) {
        // I/O tốn kém...
        return new byte[1024 * 1024]; // 1MB
    }
    
    public void draw(int x, int y) {
        System.out.println("Drawing " + filename + " at (" + x + ", " + y + ")");
    }
    
    @Override
    public void reset() {
        // Reset state - không cần tải lại data
        System.out.println("Bitmap reset: " + filename);
    }
}

// ObjectPool generic
public class ObjectPool<T extends Poolable> {
    private final BlockingQueue<T> pool;
    
    // Supplier để tạo object mới khi cần
    public ObjectPool(Supplier<T> creator, int size) {
        pool = new LinkedBlockingQueue<>(size);
        // Pre-fill pool
        for (int i = 0; i < size; i++) {
            pool.offer(creator.get());
        }
    }
    
    // Lấy object từ pool (block nếu pool rỗng)
    public T acquire() throws InterruptedException {
        return pool.take(); // block nếu không có object sẵn
    }
    
    // Trả object về pool
    public void release(T obj) {
        if (obj != null) {
            obj.reset();            // reset trước khi trả về
            pool.offer(obj);        // không block - nếu pool đầy thì bỏ qua
        }
    }
    
    public int available() {
        return pool.size();
    }
}

// BitmapPool cụ thể
public class BitmapPool {
    private static final int POOL_SIZE = 5;
    private final ObjectPool<Bitmap> pool;
    
    public BitmapPool(String filename) {
        pool = new ObjectPool<>(() -> new Bitmap(filename), POOL_SIZE);
    }
    
    public Bitmap acquire() throws InterruptedException {
        return pool.acquire();
    }
    
    public void release(Bitmap bitmap) {
        pool.release(bitmap);
    }
}

// Client sử dụng
public class Game {
    public static void main(String[] args) throws InterruptedException {
        // Tạo pool với 3 bitmap - chỉ load 3 lần
        BitmapPool pool = new BitmapPool("enemy-sprite.png");
        
        // Lấy bitmap để vẽ
        Bitmap b1 = pool.acquire();
        b1.draw(10, 20);
        
        Bitmap b2 = pool.acquire();
        b2.draw(50, 30);
        
        // Trả về pool sau khi dùng xong
        pool.release(b1); // b1.reset() được gọi tự động
        pool.release(b2);
        
        // Lần sau lấy lại - không cần tạo mới
        Bitmap b3 = pool.acquire(); // lấy lại b1 hoặc b2 đã được reset
        b3.draw(100, 200);
    }
}
```

## Ví dụ thực tế: ThreadPoolExecutor

`ThreadPoolExecutor` trong Java là Object Pool cho Thread:

```java
import java.util.concurrent.*;

// Thread Pool thực tế
ExecutorService executor = new ThreadPoolExecutor(
    4,              // corePoolSize - số thread tối thiểu
    10,             // maximumPoolSize - số thread tối đa
    60L,            // keepAliveTime - thread nhàn rỗi bao lâu thì hủy
    TimeUnit.SECONDS,
    new LinkedBlockingQueue<>(100) // hàng đợi task
);

// Sử dụng - thread được tái sử dụng, không tạo mới mỗi lần
executor.submit(() -> {
    System.out.println("Task 1 on thread: " + Thread.currentThread().getName());
});

executor.submit(() -> {
    System.out.println("Task 2 on thread: " + Thread.currentThread().getName());
});

// Hai task trên có thể chạy trên cùng một thread (tái sử dụng)
executor.shutdown();
```

## Ví dụ thực tế: Apache Commons DBCP (Database Connection Pool)

```java
// Apache Commons DBCP - Connection Pool cho database
import org.apache.commons.dbcp2.BasicDataSource;

public class DatabaseConfig {
    private static BasicDataSource dataSource;
    
    static {
        dataSource = new BasicDataSource();
        dataSource.setDriverClassName("com.mysql.jdbc.Driver");
        dataSource.setUrl("jdbc:mysql://localhost/mydb");
        dataSource.setUsername("user");
        dataSource.setPassword("password");
        
        // Pool settings
        dataSource.setInitialSize(5);        // tạo sẵn 5 connections
        dataSource.setMaxTotal(20);          // tối đa 20 connections
        dataSource.setMaxIdle(10);           // tối đa 10 connections nhàn rỗi
        dataSource.setMaxWaitMillis(10000);  // đợi tối đa 10s nếu pool đầy
    }
    
    public static Connection getConnection() throws SQLException {
        return dataSource.getConnection(); // lấy từ pool
    }
}

// Sử dụng
public void queryDatabase() {
    try (Connection conn = DatabaseConfig.getConnection()) { // tự động trả về pool
        PreparedStatement stmt = conn.prepareStatement("SELECT * FROM users");
        ResultSet rs = stmt.executeQuery();
        // ... xử lý kết quả
    } // try-with-resources tự gọi conn.close() → trả về pool
}
```

## Design Considerations

| Điểm | Giải thích |
|------|-----------|
| **Kích thước pool** | Quá nhỏ → wait nhiều; quá lớn → lãng phí bộ nhớ |
| **Reset object** | Luôn reset trước khi trả về pool để tránh state leak |
| **Thread safety** | Dùng `BlockingQueue` hoặc `ConcurrentLinkedQueue` |
| **Timeout** | Quyết định block mãi hay throw exception khi pool rỗng |
| **Validation** | Kiểm tra object còn valid trước khi cấp (VD: connection bị đứt) |
| **Long-lived objects** | Không pool objects mà client dùng lâu → pool cạn mãi |
| **Reset ngoài sync** | Nếu reset tốn kém, thực hiện ngoài synchronized block để tránh block pool |

## So sánh Object Pool vs Prototype

| | Object Pool | Prototype |
|--|-------------|-----------|
| **Mục đích** | Tái sử dụng object đắt | Clone nhanh hơn new |
| **Số lượng** | Cố định (pool size) | Không giới hạn |
| **State** | Reset sau mỗi lần dùng | Clone giữ state của prototype |
| **Life cycle** | Pool quản lý | Client quản lý |
| **Dùng khi** | Resource khan hiếm (DB, thread) | Object phức tạp cần copy |

## Pitfalls (Nhược điểm)

1. **State leak:** Quên reset → object từ pool có state cũ của user khác
2. **Resource leak:** Lấy từ pool nhưng quên trả → pool cạn kiệt dần
3. **Pool size wrong:** Quá nhỏ → bottle neck; quá lớn → waste memory
4. **Stale objects:** Connection trong pool bị timeout/broken nhưng vẫn cấp ra
5. **Concurrency bugs:** Nhiều thread dùng cùng object → phải ensure thread isolation

## Tóm lại

```
Object Pool = Reuse expensive objects instead of create/destroy repeatedly
```

**Dùng Object Pool khi:**
- Tạo object tốn kém (I/O, network, CPU)
- Object được tạo và hủy thường xuyên
- Số lượng object cần dùng đồng thời có giới hạn

**Không dùng khi:**
- Object rẻ để tạo (overhead quản lý pool > tiết kiệm được)
- Không có giới hạn rõ ràng về số lượng object

---
**Tiếp theo:** Structural Design Patterns →
