# Bài 2: Adapter Pattern

## Adapter Pattern là gì?

Adapter là một **Structural Design Pattern** cho phép các interface không tương thích có thể làm việc với nhau. Nó hoạt động như một bộ chuyển đổi giữa hai interface.

**Ví dụ thực tế:** Bộ chuyển đổi cắm điện khi đi du lịch nước ngoài — ổ cắm của bạn không tương thích với ổ điện địa phương, adapter giải quyết vấn đề đó.

**Khi nào cần Adapter:**
- Muốn dùng library/class bên thứ 3 nhưng interface không khớp
- Muốn tái sử dụng class hiện có mà không thể sửa code
- Cần làm cho các class không liên quan cùng làm việc với nhau

## Hai kiểu Adapter

### Kiểu 1: Class Adapter (dùng Inheritance)

```
Client ──────> Target (interface)
                    ↑
               Adapter (extends Adaptee)
```

### Kiểu 2: Object Adapter (dùng Composition) — Được khuyến nghị

```
Client ──────> Target (interface)
                    ↑
               Adapter ──────> Adaptee
```

## Ví dụ: Customer Report với XML và JSON

```java
// Target interface - cái mà client cần
public interface CustomerDTO {
    String getFirstName();
    String getLastName();
    String getEmail();
}

// Adaptee - class hiện có, không thể sửa
// Đây là class từ legacy system hoặc thư viện bên ngoài
public class LegacyCustomer {
    private String name;  // "firstName lastName" dưới dạng 1 string
    private String emailAddress;
    
    public LegacyCustomer(String name, String email) {
        this.name = name;
        this.emailAddress = email;
    }
    
    public String getName() { return name; }
    public String getEmailAddress() { return emailAddress; }
}
```

### Class Adapter (Inheritance)

```java
// Adapter kế thừa từ Adaptee
public class CustomerDTOAdapter extends LegacyCustomer implements CustomerDTO {
    
    public CustomerDTOAdapter(LegacyCustomer customer) {
        super(customer.getName(), customer.getEmailAddress());
    }
    
    @Override
    public String getFirstName() {
        return getName().split(" ")[0]; // tách tên từ "firstName lastName"
    }
    
    @Override
    public String getLastName() {
        String[] parts = getName().split(" ");
        return parts.length > 1 ? parts[1] : "";
    }
    
    @Override
    public String getEmail() {
        return getEmailAddress();
    }
}
```

### Object Adapter (Composition) — Khuyến nghị hơn

```java
// Adapter chứa Adaptee như 1 field (composition)
public class CustomerDTOAdapter implements CustomerDTO {
    private final LegacyCustomer adaptee; // giữ reference thay vì kế thừa
    
    public CustomerDTOAdapter(LegacyCustomer customer) {
        this.adaptee = customer;
    }
    
    @Override
    public String getFirstName() {
        return adaptee.getName().split(" ")[0];
    }
    
    @Override
    public String getLastName() {
        String[] parts = adaptee.getName().split(" ");
        return parts.length > 1 ? parts[1] : "";
    }
    
    @Override
    public String getEmail() {
        return adaptee.getEmailAddress();
    }
}

// Client - chỉ biết CustomerDTO, không biết LegacyCustomer
public class CustomerReport {
    public void printReport(List<CustomerDTO> customers) {
        for (CustomerDTO customer : customers) {
            System.out.printf("Name: %s %s, Email: %s%n",
                customer.getFirstName(),
                customer.getLastName(),
                customer.getEmail());
        }
    }
}

// Main
public class Main {
    public static void main(String[] args) {
        // Legacy customers từ database cũ
        List<LegacyCustomer> legacyCustomers = Arrays.asList(
            new LegacyCustomer("John Doe", "john@example.com"),
            new LegacyCustomer("Jane Smith", "jane@example.com")
        );
        
        // Chuyển đổi qua Adapter
        List<CustomerDTO> customers = legacyCustomers.stream()
            .map(CustomerDTOAdapter::new)
            .collect(Collectors.toList());
        
        // Report không cần biết về LegacyCustomer
        new CustomerReport().printReport(customers);
    }
}
```

## Ví dụ thực tế trong Java: InputStream/OutputStream

Java IO API là ví dụ điển hình của Adapter:

```java
// InputStreamReader là Adapter:
// Target: Reader (đọc characters)
// Adaptee: InputStream (đọc bytes)
Reader reader = new InputStreamReader(System.in); // System.in là InputStream

// OutputStreamWriter là Adapter:
// Target: Writer (ghi characters)  
// Adaptee: OutputStream (ghi bytes)
Writer writer = new OutputStreamWriter(System.out);

// Arrays.asList() là Adapter:
// Target: List interface
// Adaptee: array
String[] arr = {"a", "b", "c"};
List<String> list = Arrays.asList(arr); // array được wrap thành List

// Collections.enumeration() là Adapter:
// Target: Enumeration (legacy)
// Adaptee: Collection (modern)
Enumeration<String> enumeration = Collections.enumeration(list);
```

## Class Adapter vs Object Adapter

| | Class Adapter | Object Adapter |
|--|--------------|---------------|
| **Cơ chế** | Inheritance | Composition |
| **Override** | Có thể override Adaptee behavior | Không trực tiếp override |
| **Flexibility** | Ít flexible | Flexible hơn |
| **Multi-adapt** | Không thể adapt nhiều Adaptee | Có thể adapt nhiều Adaptee |
| **Java** | Chỉ khi Adaptee là class (không phải final) | Luôn dùng được |
| **Khuyến nghị** | ⚠️ Hạn chế | ✅ Nên dùng |

## So sánh Adapter vs Decorator

| | Adapter | Decorator |
|--|---------|-----------|
| **Mục đích** | Chuyển đổi interface | Thêm behavior |
| **Interface** | Khác (incompatible → compatible) | Giống (wraps same interface) |
| **Client thấy** | Interface mới | Interface cũ |
| **Inheritance** | Optional | Thường có |

## Pitfalls (Nhược điểm)

1. **Thêm tầng trung gian:** Mỗi lời gọi phải đi qua adapter → overhead nhỏ
2. **Có thể không complete:** Adapter chỉ expose phần interface cần, có thể thiếu method
3. **Confusion:** Quá nhiều adapter → khó trace code

## Tóm lại

```
Adapter = Wrapper chuyển đổi interface không tương thích
```

**Nhận dạng Adapter:** Class implement interface A nhưng bên trong chứa/kế thừa object của class B.

**Dùng Adapter khi:**
- Cần dùng class hiện có với interface không phù hợp
- Tái sử dụng code mà không thể modify
- Tích hợp legacy code vào hệ thống mới

---
**Tiếp theo:** Bridge Pattern →
