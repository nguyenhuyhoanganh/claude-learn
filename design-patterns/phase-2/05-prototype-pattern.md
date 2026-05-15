# Bài 5: Prototype Pattern

## Prototype Pattern là gì?

Prototype Pattern là một **Creational Design Pattern** cho phép **tạo object mới bằng cách clone (sao chép) từ object hiện có** thay vì tạo từ đầu.

**Khi nào dùng?**
- Tạo object mới **tốn kém** (đọc file, gọi API, tính toán phức tạp)
- Object được **cấp phát từ bên ngoài** (không biết class cụ thể)
- Cần nhiều object **giống nhau** với minor differences

## UML

```
Client ──────────────> GameUnit (Prototype)
                           |  + clone(): GameUnit (abstract)
                           |
              ┌────────────┴────────────┐
              ↓                         ↓
          Swordsman                 General
      + clone(): Swordsman      + clone() throws
      + reset()                   CloneNotSupportedException
```

## Implement Prototype trong Java

Java có sẵn cơ chế clone qua `Object.clone()` và interface `Cloneable`.

```java
// Prototype base class
public abstract class GameUnit implements Cloneable {
    private Point3D position;
    
    public GameUnit() {
        this.position = Point3D.ZERO;
    }
    
    // Override clone() từ Object class
    // protected → public để dùng từ package khác
    @Override
    public GameUnit clone() throws CloneNotSupportedException {
        // Shallow copy - vì Point3D là immutable nên an toàn
        GameUnit unit = (GameUnit) super.clone();
        // Reset state trước khi trả về
        unit.initialize();
        return unit;
    }
    
    // Template method - subclass override để reset state riêng của chúng
    protected void initialize() {
        this.position = Point3D.ZERO;
        reset(); // gọi abstract method để subclass reset state của mình
    }
    
    // Subclass phải implement để reset state riêng
    protected abstract void reset();
    
    public void move(Point3D newPosition) {
        this.position = newPosition;
    }
    
    public Point3D getPosition() { return position; }
}

// Concrete Prototype - hỗ trợ cloning
public class Swordsman extends GameUnit {
    private String state = "idle";
    
    public void attack() {
        this.state = "attacking";
    }
    
    @Override
    protected void reset() {
        this.state = "idle"; // reset về trạng thái ban đầu
    }
    
    @Override
    public String toString() {
        return "Swordsman at " + getPosition() + ", state: " + state;
    }
}

// Concrete class KHÔNG hỗ trợ cloning
public class General extends GameUnit {
    
    @Override
    public GameUnit clone() throws CloneNotSupportedException {
        // General là unique unit - không cho phép clone
        throw new CloneNotSupportedException("Generals are unique!");
    }
    
    @Override
    protected void reset() {
        throw new UnsupportedOperationException("Reset not supported");
    }
}

// Client
public class Client {
    public static void main(String[] args) throws CloneNotSupportedException {
        // Tạo prototype ban đầu
        Swordsman s1 = new Swordsman();
        s1.move(new Point3D(-10, 0, 0));
        s1.attack();
        System.out.println("Original: " + s1);
        // Output: Swordsman at (-10.0, 0.0, 0.0), state: attacking
        
        // Clone từ prototype - KHÔNG cần new Swordsman()
        Swordsman s2 = (Swordsman) s1.clone();
        System.out.println("Clone: " + s2);
        // Output: Swordsman at (0.0, 0.0, 0.0), state: idle
        // → Clone được reset về trạng thái mặc định
        
        // Thử clone General
        General general = new General();
        try {
            general.clone(); // throws CloneNotSupportedException
        } catch (CloneNotSupportedException e) {
            System.out.println("Cannot clone: " + e.getMessage());
        }
    }
}
```

## Deep Copy vs Shallow Copy

Đây là điểm quan trọng nhất khi implement Prototype:

### Shallow Copy (bản sao nông)
```java
// super.clone() tự động làm shallow copy
// An toàn khi tất cả field là immutable hoặc primitive
public class ShallowExample implements Cloneable {
    private String name;        // String - immutable → OK shallow copy
    private int age;            // primitive → OK
    private Point3D position;   // Point3D immutable → OK
    
    @Override
    public ShallowExample clone() throws CloneNotSupportedException {
        return (ShallowExample) super.clone(); // OK - tất cả đều immutable
    }
}
```

### Deep Copy (bản sao sâu)
```java
// Cần deep copy khi có mutable objects
public class DeepExample implements Cloneable {
    private String name;
    private List<String> roles; // List là mutable → cần deep copy!
    
    @Override
    public DeepExample clone() throws CloneNotSupportedException {
        DeepExample copy = (DeepExample) super.clone(); // shallow copy trước
        // Deep copy phần mutable
        copy.roles = new ArrayList<>(this.roles); // tạo list mới
        return copy;
    }
}
```

**Quy tắc:** 
- Field là **immutable** (String, Integer, Point3D...) → shallow copy OK
- Field là **mutable** (List, Map, custom objects...) → cần deep copy

## Prototype Registry

Khi cần tái sử dụng prototype từ nhiều nơi, dùng Registry:

```java
public class PrototypeRegistry {
    private Map<String, GameUnit> prototypes = new HashMap<>();
    
    public void registerPrototype(String key, GameUnit unit) {
        prototypes.put(key, unit);
    }
    
    public GameUnit getClone(String key) throws CloneNotSupportedException {
        GameUnit prototype = prototypes.get(key);
        if (prototype == null) throw new IllegalArgumentException("Unknown prototype: " + key);
        return prototype.clone();
    }
}

// Sử dụng
PrototypeRegistry registry = new PrototypeRegistry();
registry.registerPrototype("swordsman", new Swordsman());
registry.registerPrototype("archer", new Archer());

// Tạo object từ registry - không cần biết class cụ thể
GameUnit unit1 = registry.getClone("swordsman");
GameUnit unit2 = registry.getClone("archer");
```

## So sánh Prototype vs Singleton

| | Prototype | Singleton |
|--|---------|---------|
| **Số instance** | Nhiều (mỗi clone là instance mới) | Đúng 1 |
| **State** | Mỗi clone có state riêng | Chung 1 global state |
| **Constructor** | Chỉ gọi lần đầu cho prototype | Không gọi được từ ngoài |

## Ví dụ thực tế: Object.clone() trong Java

```java
// Java ArrayList implement Cloneable
ArrayList<String> original = new ArrayList<>(Arrays.asList("a", "b", "c"));
ArrayList<String> copy = (ArrayList<String>) original.clone();
// Lưu ý: đây là shallow copy - elements không bị copy
```

## Pitfalls (Nhược điểm)

1. **Deep copy phức tạp:** Nếu object có nhiều mutable fields → khó implement
2. **CloneNotSupportedException:** Subclass có thể từ chối clone → client phải handle
3. **Shallow copy bugs:** Quên deep copy mutable fields → clone và original share state

## Tóm lại

```
Prototype = Tạo object mới bằng clone() thay vì new()
```

**Dùng Prototype khi:**
- Tạo object tốn kém (IO, network, heavy computation)
- Nhiều object giống nhau với small differences
- Không muốn tạo subclass chỉ để tạo object

**Không dùng khi:**
- Object có nhiều mutable fields phức tạp → deep copy khó
- Chi phí tạo mới thấp hơn chi phí clone

---
**Tiếp theo:** Abstract Factory Pattern →
