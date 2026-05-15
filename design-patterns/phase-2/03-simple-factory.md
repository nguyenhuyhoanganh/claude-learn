# Bài 3: Simple Factory

## Simple Factory là gì?

Simple Factory **không phải là một design pattern chính thức** trong GoF, nhưng nó là một kỹ thuật phổ biến và thường bị nhầm lẫn với Factory Method Pattern.

**Ý tưởng cốt lõi:** Lấy logic khởi tạo object (new SomeClass()) và đóng gói nó vào một static method trong một class riêng.

## Vấn đề Simple Factory giải quyết

Khi code có logic như này rải rác ở nhiều chỗ:

```java
// Rải rác ở nhiều nơi trong code
if (type.equals("blog")) {
    post = new BlogPost();
} else if (type.equals("news")) {
    post = new NewsPost();
} else if (type.equals("product")) {
    post = new ProductPost();
}
```

Simple Factory tập trung logic này vào một nơi duy nhất.

## UML

```
Client ──────────────> PostFactory
                           |
                    createPost(type)
                           |
              ┌────────────┼────────────┐
              ↓            ↓            ↓
          BlogPost     NewsPost    ProductPost
          (extends)    (extends)   (extends)
              └────────────┼────────────┘
                           ↓
                          Post
                       (abstract)
```

## Implement Simple Factory trong Java

```java
// Abstract product class
public abstract class Post {
    private String title;
    private String content;
    private LocalDate createdOn;
    
    public abstract String getPostType();
    
    // getters/setters...
}

// Concrete products
public class BlogPost extends Post {
    private String author;
    
    @Override
    public String getPostType() { return "Blog"; }
}

public class NewsPost extends Post {
    private String headline;
    
    @Override
    public String getPostType() { return "News"; }
}

public class ProductPost extends Post {
    private String productId;
    
    @Override
    public String getPostType() { return "Product"; }
}

// Simple Factory - class riêng với static method
public class PostFactory {
    
    public static Post createPost(String type) {
        switch (type.toLowerCase()) {
            case "blog":
                return new BlogPost();
            case "news":
                return new NewsPost();
            case "product":
                return new ProductPost();
            default:
                throw new IllegalArgumentException("Unknown post type: " + type);
        }
    }
}

// Client code
public class Client {
    public static void main(String[] args) {
        Post blogPost = PostFactory.createPost("blog");
        Post newsPost = PostFactory.createPost("news");
        
        System.out.println(blogPost.getPostType()); // Blog
        System.out.println(newsPost.getPostType()); // News
    }
}
```

## Ví dụ thực tế: NumberFormat trong Java

```java
// Trong thư viện Java - java.text.NumberFormat
public abstract class NumberFormat {
    
    public static final NumberFormat getInstance() {
        return getInstance(Locale.getDefault(Locale.Category.FORMAT), NUMBERSTYLE);
    }
    
    // Static factory method - đây là Simple Factory
    static final NumberFormat getInstance(Locale desiredLocale, int choice) {
        // Tùy theo choice, tạo DecimalFormat, PercentFormat, hoặc CurrencyFormat
        if (choice == INTEGERSTYLE) {
            return new DecimalFormat(INTEGERSTYLE_PATTERN);
        } else if (choice == CURRENCYSTYLE) {
            return new DecimalFormat(CURRENCY_PATTERN);
        }
        // ...
    }
}
```

## Design Considerations

| Điểm | Giải thích |
|------|-----------|
| **Static method** | Không cần state → dùng static, không cần tạo object Factory |
| **Class riêng** | Tách PostFactory ra class riêng để có thể import từ nhiều nơi |
| **Truyền thêm tham số** | Factory method có thể nhận thêm args để truyền vào constructor |
| **Dùng pattern khác bên trong** | Factory có thể dùng Builder để tạo object phức tạp |

## So sánh Simple Factory vs Factory Method

| Điểm so sánh | Simple Factory | Factory Method |
|-------------|----------------|----------------|
| **Cấu trúc** | Một class, một static method | Hierarchy của creator classes |
| **Biết về products** | Biết tất cả concrete products | Không cần biết trước |
| **Mở rộng** | Thêm product → phải sửa Factory | Thêm product → tạo creator mới |
| **Phức tạp** | Đơn giản | Phức tạp hơn |
| **OCP** | Vi phạm | Tuân thủ |

## Pitfalls (Nhược điểm)

- **Duy nhất:** Logic trong static method có thể ngày càng phức tạp theo thời gian
- Khi logic quyết định trở nên phức tạp → nên chuyển sang Factory Method Pattern
- Vi phạm Open-Closed Principle (thêm product mới phải sửa Factory)

## Tóm lại

```
Simple Factory = Đóng gói logic tạo object vào static method trong class riêng
```

**Dùng Simple Factory khi:**
- Logic quyết định đơn giản (so sánh string, enum...)
- Số lượng products ổn định, ít thay đổi
- Muốn một giải pháp nhanh và đơn giản

**Chuyển sang Factory Method khi:**
- Logic ngày càng phức tạp
- Cần thêm products thường xuyên mà không muốn sửa Factory

---
**Tiếp theo:** Factory Method Pattern →
