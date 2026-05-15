# Bài 6: Abstract Factory Pattern

## Abstract Factory là gì?

Abstract Factory là một **Creational Design Pattern** cung cấp interface để tạo các **"gia đình" (families) object liên quan** mà không cần biết concrete class cụ thể.

**Ý tưởng cốt lõi:** Khi có nhiều object phải làm việc cùng nhau thành một bộ (kit/family), Abstract Factory đảm bảo rằng các object được tạo ra đều thuộc cùng một bộ.

## Ví dụ trực quan: Game Strategy

Trong Age of Empires/Civilization style game:

| Thời đại | Land Unit | Naval Unit |
|---------|-----------|------------|
| Medieval | Swordsman | Galley |
| Industrial | Rifleman | Ironclad |

`Swordsman + Galley` = bộ Medieval
`Rifleman + Ironclad` = bộ Industrial

**Vấn đề không có Abstract Factory:**
```java
// Code AI bị litter với if-else
if (currentAge == MEDIEVAL) {
    LandUnit land = new Swordsman();
    NavalUnit naval = new Galley();
} else if (currentAge == INDUSTRIAL) {
    LandUnit land = new Rifleman();
    NavalUnit naval = new Ironclad();
}
```

## UML Cấu trúc

```
Client ──────────> AbstractFactory (interface)
                       |  + createLandUnit()
                       |  + createNavalUnit()
                       |
          ┌────────────┴────────────┐
          ↓                         ↓
MedievalFactory              IndustrialFactory
+ createLandUnit() → Swordsman  + createLandUnit() → Rifleman
+ createNavalUnit() → Galley    + createNavalUnit() → Ironclad

LandUnit (abstract)    NavalUnit (abstract)
    ├── Swordsman           ├── Galley
    └── Rifleman            └── Ironclad
```

## Ví dụ thực tế: Cloud Provider Factory

```java
// Abstract Products
public interface Instance {
    void start();
    void stop();
    void attachStorage(Storage storage);
}

public interface Storage {
    void allocate();
    void deallocate();
}

// Concrete Products - AWS family
public class EC2Instance implements Instance {
    private final String capacity;
    
    public EC2Instance(String capacity) {
        this.capacity = capacity;
        System.out.println("EC2 instance created with capacity: " + capacity);
    }
    
    @Override
    public void start() { System.out.println("EC2 instance started"); }
    
    @Override
    public void stop() { System.out.println("EC2 instance stopped"); }
    
    @Override
    public void attachStorage(Storage storage) {
        System.out.println("Attaching S3 storage to EC2 instance");
    }
}

public class S3Storage implements Storage {
    private final int capacityGB;
    
    public S3Storage(int capacityGB) {
        this.capacityGB = capacityGB;
    }
    
    @Override
    public void allocate() { System.out.println("Allocating " + capacityGB + "GB S3 storage"); }
    
    @Override
    public void deallocate() { System.out.println("Deallocating S3 storage"); }
}

// Concrete Products - Google Cloud family
public class GoogleComputeInstance implements Instance {
    private final String capacity;
    
    public GoogleComputeInstance(String capacity) {
        this.capacity = capacity;
    }
    
    @Override
    public void start() { System.out.println("Google Compute Engine started"); }
    
    @Override
    public void stop() { System.out.println("Google Compute Engine stopped"); }
    
    @Override
    public void attachStorage(Storage storage) {
        System.out.println("Attaching Google Cloud Storage to GCE");
    }
}

public class GoogleCloudStorage implements Storage {
    private final int capacityGB;
    
    public GoogleCloudStorage(int capacityGB) {
        this.capacityGB = capacityGB;
    }
    
    @Override
    public void allocate() { System.out.println("Allocating " + capacityGB + "GB Google Cloud Storage"); }
    
    @Override
    public void deallocate() { System.out.println("Deallocating GCS"); }
}

// Abstract Factory - interface
public interface ResourceFactory {
    Instance createInstance(String capacity);
    Storage createStorage(int capacityGB);
}

// Concrete Factories
public class AwsResourceFactory implements ResourceFactory {
    @Override
    public Instance createInstance(String capacity) {
        return new EC2Instance(capacity); // luôn tạo AWS objects
    }
    
    @Override
    public Storage createStorage(int capacityGB) {
        return new S3Storage(capacityGB); // luôn tạo AWS objects
    }
}

public class GoogleResourceFactory implements ResourceFactory {
    @Override
    public Instance createInstance(String capacity) {
        return new GoogleComputeInstance(capacity); // luôn tạo GCP objects
    }
    
    @Override
    public Storage createStorage(int capacityGB) {
        return new GoogleCloudStorage(capacityGB); // luôn tạo GCP objects
    }
}

// Client - không biết AWS hay Google
public class CloudClient {
    private final ResourceFactory factory; // phụ thuộc vào interface
    
    // Nhận concrete factory qua constructor (Dependency Injection)
    public CloudClient(ResourceFactory factory) {
        this.factory = factory;
    }
    
    public Instance provisionServer(String capacity, int storageGB) {
        Instance instance = factory.createInstance(capacity);
        Storage storage = factory.createStorage(storageGB);
        instance.attachStorage(storage);
        instance.start();
        return instance;
    }
}

// Main - quyết định dùng factory nào
public class Main {
    public static void main(String[] args) {
        // Deploy trên AWS
        CloudClient awsClient = new CloudClient(new AwsResourceFactory());
        Instance awsServer = awsClient.provisionServer("large", 100);
        
        // Deploy trên Google Cloud - CloudClient KHÔNG thay đổi!
        CloudClient gcpClient = new CloudClient(new GoogleResourceFactory());
        Instance gcpServer = gcpClient.provisionServer("n1-standard-4", 200);
        
        // Đổi provider ở runtime - chỉ đổi factory
        ResourceFactory factory = getFactoryFromConfig(); // từ config file
        CloudClient flexClient = new CloudClient(factory);
    }
    
    private static ResourceFactory getFactoryFromConfig() {
        String provider = System.getProperty("cloud.provider", "aws");
        return provider.equals("gcp") ? new GoogleResourceFactory() : new AwsResourceFactory();
    }
}
```

## Ví dụ thực tế: DocumentBuilderFactory trong Java

```java
// Java XML API - DocumentBuilderFactory là Abstract Factory
DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
// newInstance() trả về implementation khác nhau tùy classpath

DocumentBuilder builder = factory.newDocumentBuilder();
Document document = builder.newDocument();
// builder và document luôn "matching" - cùng implementation
```

## Design Considerations

| Điểm | Giải thích |
|------|-----------|
| **Concrete Factory = Singleton** | Thường chỉ cần 1 instance của factory |
| **Abstract Factory dùng Factory Method** | Mỗi `createXxx()` là một Factory Method |
| **Thêm product type** | Phải sửa interface + tất cả implementations |
| **Đổi factory lúc runtime** | Có thể đổi toàn bộ product family |

## So sánh Abstract Factory vs Factory Method

| | Factory Method | Abstract Factory |
|--|---------------|-----------------|
| **Tạo** | 1 loại product | Nhiều loại product liên quan |
| **Cấu trúc** | 1 factory method | Nhiều factory methods |
| **Vấn đề** | Product hierarchy | Product families |
| **Subclass** | Quyết định class nào tạo | Quyết định family nào |

## Pitfalls (Nhược điểm)

1. **Phức tạp nhất** trong Creational Patterns
2. **Thêm product type** → phải sửa interface + tất cả concrete factories (vi phạm OCP theo một nghĩa)
3. **Khó thấy từ đầu:** Thường bắt đầu với Simple Factory, rồi mới nâng cấp
4. **Rất specific:** Chỉ hữu ích khi thực sự có product families

## Tóm lại

```
Abstract Factory = Interface tạo ra "bộ" object liên quan
                   mà không biết class cụ thể
```

**Nhận dạng Abstract Factory:** Tìm interface/abstract class có nhiều `createXxx()` methods, mỗi method trả về abstract type.

**Dùng Abstract Factory khi:**
- Có nhiều object phải làm việc cùng nhau (family/set)
- Muốn đảm bảo objects cùng family được sử dụng với nhau
- Muốn isolate client khỏi cả factory lẫn concrete products

---
**Tiếp theo:** Singleton Pattern →
