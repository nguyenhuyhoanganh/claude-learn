# Bài 2: Builder Pattern

## Builder Pattern là gì?

Builder Pattern là một **Creational Design Pattern** tách rời quá trình xây dựng (construction) của một object phức tạp khỏi representation của nó, cho phép cùng một quy trình tạo ra các representation khác nhau.

**Khi nào cần dùng Builder?**
1. **Constructor quá nhiều tham số** — đặc biệt khi nhiều tham số cùng kiểu dữ liệu
2. **Cần nhiều bước** để tạo object (phải tạo các sub-object trước)
3. **Muốn object immutable** mà không cần constructor khổng lồ

## Vấn đề không có Builder

```java
// Vấn đề 1: Constructor quá nhiều tham số - confusing, error-prone
User user = new User("John", "Doe", "123 Main St", "New York", "NY", 
                     "10001", "USA", 30, "john@email.com", "555-1234");
// Tham số nào là gì? Rất khó đọc

// Vấn đề 2: Object phức tạp cần nhiều bước
Address address = new Address("123 Main St", "New York");
List<Role> roles = new ArrayList<>();
roles.add(new Role("ADMIN"));
roles.add(new Role("USER"));
User user2 = new User(address, roles); // Phải tạo nhiều object trước
```

## Cấu trúc Builder Pattern

```
Director ──────────────> Builder (abstract/interface)
                              |
                     ┌────────────────┐
                     | + withName()   |
                     | + withAddress()|
                     | + withAge()    |
                     | + build()      |
                     └───────┬────────┘
                             |
                    ConcreteBuilder
                    (implements Builder)
                             |
                             ↓
                          Product
                       (UserDTO, etc.)
```

## Implement 1: Builder là class riêng (Classic)

```java
// Product - class muốn tạo
public class UserWebDTO {
    private String name;
    private String address;
    private String age;
    
    // Getters only - immutable từ bên ngoài
    public String getName() { return name; }
    public String getAddress() { return address; }
    public String getAge() { return age; }
    
    @Override
    public String toString() {
        return "UserWebDTO{name='" + name + "', address='" + address + "', age='" + age + "'}";
    }
}

// Abstract Builder - định nghĩa các "bước xây dựng"
public interface UserDTOBuilder {
    UserDTOBuilder withFirstName(String firstName);
    UserDTOBuilder withLastName(String lastName);
    UserDTOBuilder withBirthday(LocalDate birthday);
    UserDTOBuilder withAddress(Address address);
    UserWebDTO build();
    UserWebDTO getUserDTO(); // query method - lấy object đã build
}

// Concrete Builder
public class UserWebDTOBuilder implements UserDTOBuilder {
    private String firstName;
    private String lastName;
    private String age;
    private String address;
    private UserWebDTO userWebDTO;
    
    @Override
    public UserDTOBuilder withFirstName(String firstName) {
        this.firstName = firstName;
        return this; // trả về this để method chaining
    }
    
    @Override
    public UserDTOBuilder withLastName(String lastName) {
        this.lastName = lastName;
        return this;
    }
    
    @Override
    public UserDTOBuilder withBirthday(LocalDate birthday) {
        // Tính tuổi từ ngày sinh
        Period period = Period.between(birthday, LocalDate.now());
        this.age = Integer.toString(period.getYears());
        return this;
    }
    
    @Override
    public UserDTOBuilder withAddress(Address address) {
        // Xây dựng address string từ Address object
        this.address = address.getHouseNumber() + ", " 
                     + address.getStreet() + ", " 
                     + address.getCity();
        return this;
    }
    
    @Override
    public UserWebDTO build() {
        // Assemble final object
        userWebDTO = new UserWebDTO();
        userWebDTO.setName(firstName + " " + lastName);
        userWebDTO.setAge(age);
        userWebDTO.setAddress(address);
        return userWebDTO;
    }
    
    @Override
    public UserWebDTO getUserDTO() {
        return userWebDTO; // trả object đã build
    }
}

// Client đóng vai Director (phổ biến hơn là tạo class Director riêng)
public class Client {
    public static void main(String[] args) {
        User user = getUser(); // lấy từ database
        
        UserDTOBuilder builder = new UserWebDTOBuilder();
        
        UserWebDTO dto = directBuild(builder, user);
        System.out.println(dto);
    }
    
    // Director method - biết thứ tự gọi các builder methods
    private static UserWebDTO directBuild(UserDTOBuilder builder, User user) {
        return builder
            .withFirstName(user.getFirstName())
            .withLastName(user.getLastName())
            .withBirthday(user.getBirthday())
            .withAddress(user.getAddress())
            .build();
    }
}
```

## Implement 2: Builder là Inner Static Class (Cách phổ biến nhất)

```java
// Product class với Builder bên trong
public class User {
    private String firstName;
    private String lastName;
    private String email;
    private int age;
    private String phone;
    
    // Getters - public
    public String getFirstName() { return firstName; }
    public String getLastName() { return lastName; }
    public String getEmail() { return email; }
    public int getAge() { return age; }
    public String getPhone() { return phone; }
    
    // Setters - private → immutable từ bên ngoài
    private void setFirstName(String firstName) { this.firstName = firstName; }
    private void setLastName(String lastName) { this.lastName = lastName; }
    private void setEmail(String email) { this.email = email; }
    private void setAge(int age) { this.age = age; }
    private void setPhone(String phone) { this.phone = phone; }
    
    // Static factory method để lấy Builder
    public static UserBuilder getBuilder() {
        return new UserBuilder();
    }
    
    // Inner static Builder class
    // Vì là inner class, nó truy cập được private setters của User
    public static class UserBuilder {
        private User user;
        
        private UserBuilder() {
            this.user = new User();
        }
        
        public UserBuilder firstName(String firstName) {
            user.setFirstName(firstName);
            return this;
        }
        
        public UserBuilder lastName(String lastName) {
            user.setLastName(lastName);
            return this;
        }
        
        public UserBuilder email(String email) {
            user.setEmail(email);
            return this;
        }
        
        public UserBuilder age(int age) {
            user.setAge(age);
            return this;
        }
        
        public UserBuilder phone(String phone) {
            user.setPhone(phone);
            return this;
        }
        
        public User build() {
            // Validate trước khi trả về
            if (user.getFirstName() == null || user.getLastName() == null) {
                throw new IllegalStateException("First name and last name are required");
            }
            return user;
        }
    }
}

// Sử dụng
User user = User.getBuilder()
    .firstName("John")
    .lastName("Doe")
    .email("john@example.com")
    .age(30)
    .build();
```

## Ví dụ thực tế: Calendar.Builder trong Java

```java
// java.util.Calendar sử dụng Builder Pattern
Calendar calendar = new Calendar.Builder()
    .setCalendarType("iso8601")
    .setDate(2024, Calendar.JANUARY, 15)
    .setTimeOfDay(10, 30, 0)
    .setTimeZone(TimeZone.getTimeZone("UTC"))
    .build();
```

## Method Chaining

Method chaining là kỹ thuật trả về `this` (builder instance) từ mỗi method, cho phép gọi liên tiếp:

```java
// Không method chaining - verbose
builder.withFirstName("John");
builder.withLastName("Doe");
builder.withEmail("john@example.com");
UserDTO dto = builder.build();

// Với method chaining - clean và fluent
UserDTO dto = builder
    .withFirstName("John")
    .withLastName("Doe")
    .withEmail("john@example.com")
    .build();
```

## Design Considerations

| Điểm | Khuyến nghị |
|------|------------|
| **Inner static class** | Luôn ưu tiên — namespace gọn, truy cập private members |
| **Abstract Builder** | Chỉ cần khi có nhiều Product subclass |
| **Director riêng** | Hiếm khi cần — client thường đóng vai Director |
| **Validation trong build()** | Nên validate bắt buộc fields trước khi trả về |

## So sánh Builder vs Prototype

| | Builder | Prototype |
|--|---------|-----------|
| **Tạo object** | Qua constructor + setter steps | Qua clone() |
| **Độ phức tạp** | Phù hợp object phức tạp nhiều bước | Phù hợp clone object đơn giản |
| **Legacy code** | Builder riêng, không cần sửa Product | Phải thêm clone() vào Product |
| **Immutability** | Hỗ trợ tốt qua private setters | Phụ thuộc vào implementation |

## Pitfalls (Nhược điểm)

1. **Method chaining** khó hiểu với người mới học
2. **Partially initialized object:** Client gọi `build()` mà không set đủ fields → cần validate trong `build()`
3. **Nhiều code hơn:** Cần viết thêm Builder class

## Tóm lại

```
Builder = Tách construction logic ra Builder class riêng
          → Build từng phần → Assemble cuối cùng
```

**Nhận dạng Builder:** Tìm class có nhiều method trả về `this` và một method `build()`.

**Dùng Builder khi:**
- Constructor có > 4-5 tham số
- Cần nhiều bước để tạo object
- Muốn tạo object immutable mà không có telescoping constructor
- Cùng quy trình cần tạo ra các representation khác nhau

---
**Tiếp theo:** Simple Factory →
