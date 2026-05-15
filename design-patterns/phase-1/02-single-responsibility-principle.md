# Bài 2: Single Responsibility Principle (SRP)

## Định nghĩa

> **"There should never be more than one reason for a class to change."**
> — Không bao giờ được có nhiều hơn một lý do để một class thay đổi.

Nói đơn giản hơn: **Mỗi class chỉ nên đảm nhiệm một trách nhiệm duy nhất, tập trung vào một chức năng cụ thể.**

## Tại sao SRP quan trọng?

Khi một class có nhiều trách nhiệm:
- Thay đổi ở một trách nhiệm có thể ảnh hưởng đến các trách nhiệm khác
- Code trở nên khó đọc và khó hiểu
- Khó viết unit test cho từng chức năng riêng lẻ
- Mọi thay đổi nhỏ đều ảnh hưởng đến class lớn này

## Ví dụ vi phạm SRP: UserController

```java
// VI PHẠM SRP - Một class làm quá nhiều việc
public class UserController {
    
    public String createUser(String userJson) {
        // 1. Parse JSON thành User object (trách nhiệm parsing)
        User user = parseUser(userJson);
        
        // 2. Validate user (trách nhiệm validation)
        if (!isValidName(user.getName())) {
            return "Error: Invalid name";
        }
        if (!isValidEmail(user.getEmail())) {
            return "Error: Invalid email";
        }
        
        // 3. Lưu vào database (trách nhiệm persistence)
        Store store = new Store();
        store.store(user.getId(), user);
        
        return "Success";
    }
    
    // Methods validation - không thuộc về Controller
    private boolean isValidName(String name) { ... }
    private boolean isValidEmail(String email) { ... }
    
    // Methods parsing - cũng không thuộc về Controller
    private User parseUser(String json) { ... }
}
```

**Phân tích vi phạm:** `UserController` đang làm 3 việc:
1. Nhận và xử lý request (trách nhiệm thực sự của Controller)
2. Validate dữ liệu user
3. Lưu user vào database

**Hậu quả:** Có 3 lý do để class này thay đổi:
- Thay đổi cách nhận request
- Thay đổi quy tắc validation (thêm field mới, rule mới)
- Thay đổi cách lưu trữ (đổi từ HashMap sang MySQL, sang MongoDB...)

## Giải pháp đúng: Tách thành 3 class

```java
// Class 1: Chỉ xử lý request/response
public class UserController {
    private UserValidator validator = new UserValidator();
    private UserPersistenceService persistenceService = new UserPersistenceService();
    
    public String createUser(String userJson) {
        User user = parseUser(userJson);
        
        if (!validator.validate(user)) {
            return "Error: Invalid user data";
        }
        
        persistenceService.save(user);
        return "Success";
    }
    
    private User parseUser(String json) { ... }
}

// Class 2: Chỉ lo việc validation
public class UserValidator {
    public boolean validate(User user) {
        return isValidName(user.getName()) 
            && isValidEmail(user.getEmail());
    }
    
    private boolean isValidName(String name) { ... }
    private boolean isValidEmail(String email) { ... }
}

// Class 3: Chỉ lo việc lưu trữ
public class UserPersistenceService {
    private Map<String, User> store = new HashMap<>();
    
    public void save(User user) {
        store.put(user.getId(), user);
    }
    
    public User findById(String id) {
        return store.get(id);
    }
}
```

**Kết quả:**
- `UserController`: Thay đổi chỉ khi cách nhận/xử lý request thay đổi
- `UserValidator`: Thay đổi chỉ khi quy tắc validation thay đổi
- `UserPersistenceService`: Thay đổi chỉ khi cách lưu trữ thay đổi

## Cách nhận biết vi phạm SRP

Hỏi bản thân: **"Class này làm gì?"**
- Nếu câu trả lời dùng **"và"** → có thể đang vi phạm SRP
  - "Class này validate **và** lưu trữ **và** gửi email"
- Nếu câu trả lời là một chức năng duy nhất → OK
  - "Class này chỉ validate user"

## Lợi ích thực tế

| Tình huống | Trước SRP | Sau SRP |
|-----------|-----------|---------|
| Đổi từ HashMap sang MySQL | Phải sửa UserController | Chỉ sửa UserPersistenceService |
| Thêm validation rule mới | Phải sửa UserController | Chỉ sửa UserValidator |
| Thay đổi format response | Chỉ sửa UserController | Không ảnh hưởng class khác |
| Viết unit test | Khó - phải mock nhiều thứ | Dễ - test từng class độc lập |

## Lưu ý quan trọng

SRP không có nghĩa là mỗi class chỉ có một method. Class có thể có nhiều method, nhưng tất cả các method đó phải phục vụ cho **cùng một trách nhiệm/mục đích**.

Ví dụ: `UserValidator` có thể có nhiều method: `validateName()`, `validateEmail()`, `validateAge()` — nhưng tất cả đều phục vụ cho mục đích duy nhất là **validate user**.

---
**Tiếp theo:** Open-Closed Principle →
