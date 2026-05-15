# Bài 4: Liskov Substitution Principle (LSP)

## Định nghĩa

> **"We should be able to substitute a subclass object wherever a base class object is expected, and this substitution should not alter the desired properties of the program."**
> — Có thể thay thế object của class con ở bất kỳ đâu đang dùng object của class cha, và sự thay thế này không được thay đổi hành vi mong đợi của chương trình.

Có 2 khía cạnh:
1. **Type-based substitution (ngôn ngữ đảm bảo):** Compiler Java đảm bảo class con có thể gán cho biến kiểu class cha
2. **Behavioral subtyping (lập trình viên phải đảm bảo):** Hành vi không được thay đổi khi thay thế

## Vấn đề kinh điển: Rectangle và Square

Về mặt toán học, hình vuông là hình chữ nhật đặc biệt (4 cạnh bằng nhau). Vì vậy trong code, ta muốn `Square extends Rectangle`.

### Code vi phạm LSP

```java
public class Rectangle {
    protected int width;
    protected int height;
    
    public Rectangle(int width, int height) {
        this.width = width;
        this.height = height;
    }
    
    public void setWidth(int width) {
        this.width = width;
    }
    
    public void setHeight(int height) {
        this.height = height;
    }
    
    public int getWidth() { return width; }
    public int getHeight() { return height; }
    
    public int computeArea() {
        return width * height;
    }
}

public class Square extends Rectangle {
    
    public Square(int side) {
        super(side, side); // width = height = side
    }
    
    // Square phải đảm bảo width luôn = height
    @Override
    public void setWidth(int side) {
        setSide(side);
    }
    
    @Override
    public void setHeight(int side) {
        setSide(side);
    }
    
    private void setSide(int side) {
        this.width = side;
        this.height = side; // luôn giữ width = height
    }
}
```

### Test case phát hiện vi phạm

```java
public static void useRectangle(Rectangle r) {
    r.setHeight(20);
    r.setWidth(30);
    
    // Hợp đồng (contract) của Rectangle:
    // Sau khi setHeight(20) và setWidth(30), getHeight() == 20 và getWidth() == 30
    assert r.getHeight() == 20 : "Height should be 20";  // FAIL với Square!
    assert r.getWidth() == 30 : "Width should be 30";    // OK
    
    System.out.println("Area: " + r.computeArea());
    // Rectangle: 20 * 30 = 600 (đúng)
    // Square: 30 * 30 = 900 (sai! vì setWidth(30) cũng đổi height thành 30)
}

// Test
Rectangle rect = new Rectangle(10, 10);
useRectangle(rect); // PASS

Square square = new Square(10);
useRectangle(square); // FAIL - LSP bị vi phạm!
```

**Tại sao vi phạm?** Khi `Rectangle.setHeight(20)` được gọi, contract là `getHeight()` trả về 20. Nhưng `Square` override lại behavior này, phá vỡ contract của class cha.

## Giải pháp: Dùng Interface thay vì kế thừa

```java
// Chỉ định nghĩa behavior CHUNG - không có contract setWidth/setHeight riêng lẻ
public interface Shape {
    int computeArea();
}

// Rectangle implement Shape trực tiếp
public class Rectangle implements Shape {
    private int width;
    private int height;
    
    public Rectangle(int width, int height) {
        this.width = width;
        this.height = height;
    }
    
    public void setWidth(int width) { this.width = width; }
    public void setHeight(int height) { this.height = height; }
    public int getWidth() { return width; }
    public int getHeight() { return height; }
    
    @Override
    public int computeArea() { return width * height; }
}

// Square implement Shape trực tiếp - KHÔNG kế thừa Rectangle
public class Square implements Shape {
    private int side;
    
    public Square(int side) { this.side = side; }
    
    public void setSide(int side) { this.side = side; }
    public int getSide() { return side; }
    
    @Override
    public int computeArea() { return side * side; }
}

// Bây giờ code dùng Shape không bị phá vỡ contract
public static void printArea(Shape shape) {
    System.out.println("Area: " + shape.computeArea()); // Luôn đúng
}
```

## Dấu hiệu nhận biết vi phạm LSP

1. **Override method để throw exception:** "Method này không hỗ trợ trong class con"
   ```java
   @Override
   public void fly() {
       throw new UnsupportedOperationException("Penguin cannot fly!");
   }
   ```

2. **Override method để return null hoặc empty:**
   ```java
   @Override
   public List<Order> getOrders() {
       return null; // class cha trả về List, class con trả về null
   }
   ```

3. **Precondition mạnh hơn class cha:** Class con yêu cầu thêm điều kiện input
4. **Postcondition yếu hơn class cha:** Class con đảm bảo ít hơn về output

## Ví dụ thực tế: Bird và Penguin

```java
// Vi phạm LSP
public class Bird {
    public void fly() {
        System.out.println("Flying...");
    }
}

public class Penguin extends Bird {
    @Override
    public void fly() {
        throw new UnsupportedOperationException("Penguin cannot fly!"); // VI PHẠM!
    }
}

// Giải pháp đúng
public interface Animal {
    void move();
}

public interface FlyingAnimal extends Animal {
    void fly();
}

public class Eagle implements FlyingAnimal {
    @Override
    public void move() { fly(); }
    
    @Override
    public void fly() { System.out.println("Eagle flying..."); }
}

public class Penguin implements Animal {
    @Override
    public void move() { swim(); }
    
    public void swim() { System.out.println("Penguin swimming..."); }
}
```

## Quy tắc Design cho LSP

| Quy tắc | Giải thích |
|---------|-----------|
| **Covariant return types** | Class con có thể trả về type cụ thể hơn |
| **Contravariant parameter types** | Class con có thể nhận type rộng hơn |
| **No stronger preconditions** | Class con không được yêu cầu thêm điều kiện |
| **No weaker postconditions** | Class con phải đảm bảo ít nhất bằng class cha |
| **Preserve invariants** | Bất biến của class cha phải được giữ nguyên |

## Tóm lại

**"Is-a" quan hệ trong toán học ≠ "Is-a" quan hệ trong OOP**

- Toán học: Square IS-A Rectangle ✓
- OOP: Square không nên kế thừa Rectangle vì vi phạm behavioral contract

Trước khi cho class B kế thừa class A, hãy hỏi: **"Mọi behavior của A có còn đúng khi dùng B không?"**

---
**Tiếp theo:** Interface Segregation Principle →
