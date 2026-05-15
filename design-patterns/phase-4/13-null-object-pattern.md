# Bài 13: Null Object Pattern

## Null Object Pattern là gì?

Null Object là một **Behavioral Design Pattern** cung cấp một object đặc biệt đại diện cho "không có object" (absence of object), thay vì dùng `null`. Object này implement cùng interface nhưng không làm gì cả.

**Ý tưởng cốt lõi:** Thay vì return `null` và bắt caller phải kiểm tra null, trả về "Null Object" — object thật nhưng có behavior "do-nothing". Caller không cần kiểm tra null.

**Ví dụ thực tế:**
- `Collections.emptyList()` — trả về List empty thay vì null
- `Optional.empty()` — thay vì null
- `NullHandler` trong logging (nếu không có logger, dùng NullLogger)
- `MouseAdapter` trong Java AWT

## Vấn đề với null

```java
// Vấn đề: Caller phải kiểm tra null ở khắp nơi
public void generateReport(Order order) {
    StorageService storage = getStorageService(); // có thể null
    
    if (storage != null) { // null check ở khắp nơi!
        storage.save(report);
    }
    
    EmailService email = getEmailService(); // có thể null
    if (email != null) { // lại null check!
        email.send(report);
    }
}

// NullPointerException nếu quên kiểm tra
storage.save(report); // BOOM! NPE nếu storage là null
```

## UML Cấu trúc

```
Client ──────> AbstractService (interface/abstract class)
                    |  + save(data)
                    |
         ┌──────────┴──────────────────┐
         ↓                             ↓
  RealService                    NullService
  + save(data) {                 + save(data) {
      // actual logic                // do NOTHING
    }                               }
```

## Implement Null Object Pattern

```java
// Abstract service interface
public abstract class StorageService {
    public abstract void save(Report report);
    public abstract Report load(String id);
    public abstract boolean exists(String id);
}

// Real implementation
public class DiskStorageService extends StorageService {
    private final String storagePath;
    
    public DiskStorageService(String storagePath) {
        this.storagePath = storagePath;
    }
    
    @Override
    public void save(Report report) {
        System.out.println("Saving report '" + report.getName() + 
            "' to disk at " + storagePath);
        // Actual file I/O...
    }
    
    @Override
    public Report load(String id) {
        System.out.println("Loading report " + id + " from disk");
        return new Report(id); // simplified
    }
    
    @Override
    public boolean exists(String id) {
        System.out.println("Checking if " + id + " exists on disk");
        return true; // simplified
    }
}

// NULL OBJECT - do nothing implementation
public class NullStorageService extends StorageService {
    
    // Singleton: no state, no side effects → safe to share
    private static final NullStorageService INSTANCE = new NullStorageService();
    
    private NullStorageService() {}
    
    public static NullStorageService getInstance() {
        return INSTANCE;
    }
    
    @Override
    public void save(Report report) {
        // Do NOTHING - intentionally empty
        // (có thể log để debug nếu cần)
        System.out.println("[NullStorageService] save() - doing nothing");
    }
    
    @Override
    public Report load(String id) {
        return null; // hoặc return new NullReport()
    }
    
    @Override
    public boolean exists(String id) {
        return false; // default: nothing exists
    }
}

// Report class
public class Report {
    private final String name;
    
    public Report(String name) { this.name = name; }
    public String getName() { return name; }
}

// Context - dùng StorageService mà không cần null check
public class ComplexService {
    private final StorageService storage;
    private final String reportName;
    
    public ComplexService(String reportName, StorageService storage) {
        this.reportName = reportName;
        this.storage = storage; // có thể là real hoặc null object
    }
    
    public void generateReport() {
        System.out.println("Generating report: " + reportName);
        // Giả lập xử lý phức tạp...
        Report report = new Report(reportName);
        
        // Không cần null check!
        storage.save(report); // real service save, null service do nothing
        System.out.println("Done generating report");
    }
}

// Client
public class Main {
    public static void main(String[] args) {
        // Production: dùng real storage
        StorageService diskStorage = new DiskStorageService("/var/reports");
        ComplexService prod = new ComplexService("Monthly Report", diskStorage);
        prod.generateReport();
        // Output: Saving report 'Monthly Report' to disk at /var/reports
        
        System.out.println("---");
        
        // Test/Debug: dùng null object (không lưu file)
        StorageService nullStorage = NullStorageService.getInstance();
        ComplexService test = new ComplexService("Test Report", nullStorage);
        test.generateReport();
        // Output: [NullStorageService] save() - doing nothing
        
        // ComplexService không biết sự khác biệt!
    }
}
```

## Ví dụ: Null Logger

```java
// Logger interface
public interface Logger {
    void log(String message);
    void warn(String message);
    void error(String message);
    boolean isEnabled();
}

// Real logger
public class ConsoleLogger implements Logger {
    @Override public void log(String message) { System.out.println("[INFO] " + message); }
    @Override public void warn(String message) { System.out.println("[WARN] " + message); }
    @Override public void error(String message) { System.err.println("[ERROR] " + message); }
    @Override public boolean isEnabled() { return true; }
}

// Null logger - không làm gì
public class NullLogger implements Logger {
    private static final NullLogger INSTANCE = new NullLogger();
    
    private NullLogger() {}
    public static NullLogger getInstance() { return INSTANCE; }
    
    @Override public void log(String message) { }   // do nothing
    @Override public void warn(String message) { }  // do nothing
    @Override public void error(String message) { } // do nothing
    @Override public boolean isEnabled() { return false; }
}

// Service sử dụng
public class DataProcessor {
    private final Logger logger;
    
    // Default: NullLogger nếu không có logger được cung cấp
    public DataProcessor() {
        this(NullLogger.getInstance());
    }
    
    public DataProcessor(Logger logger) {
        this.logger = logger;
    }
    
    public void process(List<String> data) {
        logger.log("Processing " + data.size() + " items");
        for (String item : data) {
            // ... process item
            logger.log("Processed: " + item);
        }
        logger.log("Done");
        // Không cần if (logger != null) ở bất cứ đâu!
    }
}

// Sử dụng
DataProcessor withLogging = new DataProcessor(new ConsoleLogger());
withLogging.process(Arrays.asList("a", "b")); // logs everything

DataProcessor silent = new DataProcessor(); // NullLogger - không log gì
silent.process(Arrays.asList("a", "b")); // chạy bình thường, không log
```

## So sánh Null Object vs Proxy

| | Null Object | Proxy |
|--|------------|-------|
| **Mục đích** | Đại diện cho "không có gì" | Đại diện cho real object |
| **Behavior** | Làm gì cũng không làm gì | Thực hiện actual work (hoặc defer đến real object) |
| **Transform** | Không bao giờ thành real object | Có thể tạo/load real object |
| **State** | Không có state | Có thể có state |

## Design Considerations

| Điểm | Giải thích |
|------|-----------|
| **Singleton** | Null Object không có state → có thể dùng Singleton để reuse |
| **Return values** | Khi method phải return value → return sensible default (0, false, empty list) |
| **Subclass** | Nếu có class hierarchy → null object phải extend base class |
| **State pattern** | Null Object có thể dùng làm một state trong State Pattern |

## Ví dụ thực tế: Java

```java
// Collections.emptyList() trả về immutable empty list thay vì null
List<String> result = findItems("query");
if (result == null) result = new ArrayList<>(); // pattern cũ tệ

// Dùng null object thay:
public List<String> findItems(String query) {
    if (!hasData()) return Collections.emptyList(); // null object!
    return actualSearch(query);
}
// Caller không cần null check

// Optional là null object concept
public Optional<User> findUser(String id) {
    User user = database.find(id);
    return Optional.ofNullable(user); // Optional.empty() = null object
}

findUser("123")
    .map(User::getName)
    .ifPresent(System.out::println); // không cần null check
```

## Pitfalls (Nhược điểm)

1. **"Do nothing" ambiguity:** Không phải mọi trường hợp đều rõ ràng "làm gì = không làm gì"
2. **Return value confusion:** Method trả về int nên return 0 hay -1? Boolean nên return true hay false?
3. **Hiding bugs:** Null object ẩn lỗi — đôi khi NPE tốt hơn vì nó làm lộ lỗi
4. **Transforming:** Nếu null object cần chuyển thành real object → dùng State Pattern thay thế

## Tóm lại

```
Null Object = Object "không làm gì" thay cho null, loại bỏ null checks
```

**Dùng Null Object khi:**
- Muốn loại bỏ null checks lặp đi lặp lại
- Cần default behavior khi không có real object
- Trong testing: thay real external service bằng null object

**Không dùng khi:**
- Null biểu thị lỗi thực sự (nên throw exception)
- "Làm gì là không làm gì" không rõ ràng

---
**Kết thúc:** Đây là tất cả 12 Behavioral Patterns và 7 Structural Patterns. Chúc bạn học tốt!
