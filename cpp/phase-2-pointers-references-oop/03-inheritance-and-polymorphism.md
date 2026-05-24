# Bài 3: Inheritance và Polymorphism

Bài này dạy:
- Public inheritance — "is-a" relationship.
- `virtual` function: cho phép override ở derived class.
- `override` keyword (C++11+) — explicit khi override.
- `final` — chặn override / chặn inherit thêm.
- Abstract class + pure virtual: interface pattern.
- Virtual destructor — vì sao base class polymorphic cần.
- Object slicing — bẫy lớn nhất khi mix base/derived.
- Multiple inheritance — nhắc qua, hạn chế dùng.

Kết thúc bài: bạn thiết kế được class hierarchy đúng cách, biết khi nào dùng virtual, hiểu được polymorphic call cơ bản và tránh được slicing/missing-virtual-dtor.

## Inheritance là gì, khi nào dùng?

Inheritance cho phép 1 class **kế thừa** member và behavior từ class khác. Concept tương tự Java/C#:

```cpp
class Animal {
 public:
  std::string name() const { return name_; }
 protected:
  std::string name_;
};

class Dog : public Animal {     // Dog kế thừa Animal — "Dog is-a Animal"
 public:
  void Bark() { std::cout << name_ << " says woof!\n"; }
};

Dog d;
d.name();      // OK — kế thừa từ Animal
d.Bark();      // Dog method riêng
```

`Dog` có mọi public/protected member của `Animal` + thêm member riêng.

### "Is-a" vs "has-a"

```cpp
// Is-a (inheritance): "Dog là 1 loại Animal"
class Dog : public Animal { ... };

// Has-a (composition): "Car has 1 Engine"
class Car {
  Engine engine_;       // Composition
};
```

**Rule chung**: prefer composition over inheritance. Inheritance chỉ dùng khi:

- Có "is-a" relationship thực sự.
- Cần polymorphism (gọi method qua base pointer).
- Base class thiết kế **explicit** để được kế thừa (có virtual method, virtual dtor).

### 3 loại inheritance

```cpp
class Derived : public Base { ... };       // Public — phổ biến nhất (is-a)
class Derived : protected Base { ... };    // Protected — hiếm dùng
class Derived : private Base { ... };      // Private — "implemented in terms of" (composition alternative)
```

99% case là **public inheritance**. `private`/`protected` rất hiếm trong code modern.

## `virtual` function — polymorphism

Vấn đề: gọi method qua base pointer/reference, muốn chọn implementation của derived class.

### Không có `virtual` — static dispatch

```cpp
class Animal {
 public:
  std::string Sound() const { return "generic sound"; }  // Không virtual
};

class Dog : public Animal {
 public:
  std::string Sound() const { return "woof"; }
};

Dog d;
Animal* a = &d;
std::cout << a->Sound();  // "generic sound" — gọi version của Animal!
```

Vì `Sound()` không `virtual`, compiler quyết định method lúc compile dựa trên **type của pointer/reference** (`Animal*`), không phải object thực tế.

### Có `virtual` — dynamic dispatch

```cpp
class Animal {
 public:
  virtual std::string Sound() const { return "generic sound"; }  // virtual
};

class Dog : public Animal {
 public:
  std::string Sound() const override { return "woof"; }  // override
};

Dog d;
Animal* a = &d;
std::cout << a->Sound();  // "woof" — gọi version Dog!
```

`virtual` báo compiler: "method này có thể được override". Khi gọi qua base pointer, lookup vtable (virtual table) runtime → tìm implementation đúng.

### `override` keyword (C++11+)

```cpp
class Dog : public Animal {
 public:
  std::string Sound() const override { return "woof"; }  // override explicit
};
```

`override` báo compiler: "tôi đang override method virtual của base". Lợi ích:

- Compiler check: nếu base không có method virtual matching → error.
- Bắt typo / signature mismatch.

```cpp
class Cat : public Animal {
 public:
  std::string Sount() const override { return "meow"; }
  //          ^^^ typo
  // ERROR: no member function 'Sount' in base
};

// Without override, typo would silently create a NEW method
```

→ **Chromium rule**: mọi method override phải có `override` keyword.

### `final` — chặn override

```cpp
class Animal {
 public:
  virtual std::string Sound() const { return "generic"; }
};

class Dog : public Animal {
 public:
  std::string Sound() const override final { return "woof"; }  // Không override được nữa
};

class Puppy : public Dog {
 public:
  // std::string Sound() const override { return "yip"; }  // ERROR: Dog::Sound is final
};
```

Hoặc apply cho cả class — chặn inherit thêm:

```cpp
class Dog final : public Animal { ... };

// class Puppy : public Dog { ... };  // ERROR: Dog is final
```

Hiếm dùng trong code thường. Có ý nghĩa khi:

- Class không design cho inheritance thêm.
- Compiler có thể optimize (devirtualization).

### vtable mechanic (đủ để hiểu, không deep)

Khi class có virtual method, compiler thêm 1 pointer ẩn (`vptr`) trong object trỏ tới **virtual table** của class. Vtable chứa pointer tới implementation thực tế.

```text
Memory layout của Dog:
[ vptr ] → vtable_of_Dog:
            [ &Dog::Sound ]    ← Dog version, không phải Animal version
[ name_ ]
[ ... ]
```

Khi gọi `a->Sound()`, runtime:
1. Đọc `vptr` của object.
2. Lookup `Sound` trong vtable.
3. Gọi function pointer.

→ Có 1 chút overhead so với non-virtual (1 indirect call). Phần lớn case overhead không đáng lo.

## Constructor + destructor với inheritance

### Constructor order

```cpp
class Animal {
 public:
  Animal(std::string name) : name_(std::move(name)) {
    std::cout << "Animal ctor\n";
  }
 protected:
  std::string name_;
};

class Dog : public Animal {
 public:
  Dog(std::string name, std::string breed)
      : Animal(std::move(name)),       // Gọi base ctor trong init list
        breed_(std::move(breed)) {
    std::cout << "Dog ctor\n";
  }
 private:
  std::string breed_;
};

Dog d("Rex", "Beagle");
```

Output:
```
Animal ctor
Dog ctor
```

→ **Base ctor luôn chạy trước derived ctor**. Tự động nếu base có default ctor; phải gọi explicit trong init list nếu base không có default.

### Destructor order — ngược

```cpp
class Animal {
 public:
  ~Animal() { std::cout << "Animal dtor\n"; }
};

class Dog : public Animal {
 public:
  ~Dog() { std::cout << "Dog dtor\n"; }
};

void Foo() {
  Dog d;
}
```

Output:
```
Dog dtor
Animal dtor
```

→ Derived dtor chạy trước base dtor. Cleanup ngược thứ tự construct.

## Virtual destructor — BẮT BUỘC khi polymorphic

```cpp
class Animal {
 public:
  ~Animal() { ... }   // KHÔNG virtual
};

class Dog : public Animal {
 public:
  ~Dog() { ... }
};

Animal* a = new Dog();
delete a;  // UB! Chỉ gọi Animal::~Animal, không gọi Dog::~Dog
```

Khi delete qua base pointer, nếu dtor không virtual → chỉ base dtor được gọi → leak member của derived.

Fix:

```cpp
class Animal {
 public:
  virtual ~Animal() { ... }   // Virtual!
};

Animal* a = new Dog();
delete a;  // OK — gọi Dog::~Dog rồi Animal::~Animal
```

→ **Rule sắt**: nếu class có **bất kỳ virtual method nào**, dtor phải virtual. Hoặc base class designed để derived → dtor phải virtual.

```cpp
class Animal {
 public:
  virtual ~Animal() = default;     // Pattern phổ biến — virtual + = default
  virtual std::string Sound() const = 0;
};
```

Trong Chromium, mọi base class polymorphic đều có `virtual ~Base() = default;`.

## Abstract class — pure virtual

```cpp
class Shape {
 public:
  virtual ~Shape() = default;
  virtual double Area() const = 0;     // Pure virtual — chưa implement
  virtual std::string Name() const = 0;
};

// Shape s;     // ERROR — abstract class không instantiate được
// new Shape(); // ERROR

class Circle : public Shape {
 public:
  Circle(double r) : radius_(r) {}
  double Area() const override { return 3.14159 * radius_ * radius_; }
  std::string Name() const override { return "Circle"; }

 private:
  double radius_;
};

Circle c(5.0);  // OK
Shape* s = &c;
std::cout << s->Area();  // 78.54
```

`= 0` ở cuối khai báo method virtual = pure virtual = "method không có implementation, derived class phải override". Class có ≥ 1 pure virtual → abstract → không instantiate được.

### Interface pattern

```cpp
// Chrome style: class chỉ có pure virtual = interface
class Observer {
 public:
  virtual ~Observer() = default;
  virtual void OnEvent(const Event& event) = 0;
  virtual void OnError(int code) = 0;
};

class MyHandler : public Observer {
 public:
  void OnEvent(const Event& event) override { ... }
  void OnError(int code) override { ... }
};
```

→ **Chromium dùng pattern này khắp nơi**: `WebContentsObserver`, `RenderProcessHostObserver`, `PrefObserver`, etc.

### Pure virtual + implementation (hiếm)

```cpp
class Shape {
 public:
  virtual double Area() const = 0;
};

// Có thể vẫn implement (gọi từ derived qua Shape::Area())
double Shape::Area() const { return 0.0; }
```

Hiếm dùng. Thường dùng khi muốn buộc override nhưng có default.

## Object slicing — bẫy lớn

```cpp
class Animal {
 public:
  virtual std::string Sound() const { return "generic"; }
};

class Dog : public Animal {
 public:
  std::string Sound() const override { return "woof"; }
  std::string breed_ = "Beagle";
};

Dog d;

// Slicing!
Animal a = d;      // COPY d thành a — nhưng a chỉ là Animal!
std::cout << a.Sound();  // "generic" — Dog part bị cut off

void TakeAnimal(Animal a) { ... }   // Pass by value
TakeAnimal(d);  // Slicing — d's Dog part bị cut
```

`Animal a = d;` copy phần Animal của `d` vào `a`. Phần Dog (`breed_`, vtable to Dog version) **bị bỏ** — "sliced off".

**Hậu quả**:

- `a.Sound()` không gọi `Dog::Sound`.
- Member của Dog bị lost.

**Fix**: dùng pointer hoặc reference:

```cpp
Animal* a = &d;
Animal& ar = d;

a->Sound();     // "woof"
ar.Sound();     // "woof"
```

Hoặc pass by reference:

```cpp
void TakeAnimal(Animal& a) { ... }   // Reference — không slice
void TakeAnimal(const Animal& a) { ... }  // const ref — không slice, không modify
```

→ **Rule**: với polymorphic class, **luôn dùng pointer/reference** khi pass và lưu. Pass/store by value = slicing.

### Chromium pattern

```cpp
// Đúng — store base pointer (qua smart pointer)
std::vector<std::unique_ptr<Animal>> animals;
animals.push_back(std::make_unique<Dog>("Rex"));
animals.push_back(std::make_unique<Cat>("Whiskers"));

for (const auto& a : animals) {
  std::cout << a->Sound() << "\n";  // Polymorphic OK
}
```

Smart pointer (`unique_ptr`) cho phép store polymorphic safely. Sẽ học ở Phase 3.

## Calling base method từ derived

```cpp
class Animal {
 public:
  virtual std::string Sound() const { return "generic"; }
};

class Dog : public Animal {
 public:
  std::string Sound() const override {
    return Animal::Sound() + " + woof";    // Gọi base version
  }
};

Dog d;
std::cout << d.Sound();  // "generic + woof"
```

`Base::Method()` — explicit scope resolution để gọi version của base.

Trong constructor / destructor, base method được gọi tự động cho phần base; bạn chỉ explicit khi muốn extend.

## Multiple inheritance — hạn chế

C++ cho phép kế thừa từ nhiều base:

```cpp
class Drawable {
 public:
  virtual void Draw() const = 0;
};

class Serializable {
 public:
  virtual std::string Serialize() const = 0;
};

class Widget : public Drawable, public Serializable {
 public:
  void Draw() const override { ... }
  std::string Serialize() const override { ... }
};
```

OK khi base là **interface-only** (pure virtual, no data). Đó là use case duy nhất khuyên dùng.

### Diamond problem — vì sao multiple inheritance phức tạp

```cpp
class A { public: int x_; };
class B : public A { };
class C : public A { };
class D : public B, public C { };

D d;
// d.x_;  // ERROR: ambiguous — có 2 A subobject trong d!
```

`D` có 2 `A` subobject (1 qua B, 1 qua C). Access `x_` ambiguous.

Fix: virtual inheritance (rất rắc rối, hiếm dùng):

```cpp
class B : public virtual A { };
class C : public virtual A { };
class D : public B, public C { };
// D giờ chỉ có 1 A subobject
```

→ **Khuyên**: tránh multiple inheritance trừ khi tất cả base là interface. Chromium hầu như không dùng diamond.

## Pattern thực tế Chromium

### Observer pattern

```cpp
// chrome/browser/foo/foo_service.h
#pragma once

#include "base/observer_list.h"

namespace foo {

class FooService {
 public:
  // Observer interface — pure abstract
  class Observer {
   public:
    virtual ~Observer() = default;
    virtual void OnFooChanged(const std::string& new_value) = 0;
  };

  FooService();
  ~FooService();

  void AddObserver(Observer* observer);
  void RemoveObserver(Observer* observer);

  void UpdateFoo(const std::string& value);

 private:
  base::ObserverList<Observer> observers_;
  std::string value_;
};

}  // namespace foo
```

```cpp
// chrome/browser/foo/foo_handler.h
#include "chrome/browser/foo/foo_service.h"

class FooHandler : public foo::FooService::Observer {
 public:
  FooHandler(foo::FooService* service);
  ~FooHandler() override;

  // Override Observer
  void OnFooChanged(const std::string& new_value) override;

 private:
  foo::FooService* service_;  // Raw pointer — không own
};

void FooHandler::OnFooChanged(const std::string& new_value) {
  std::cout << "Foo changed to: " << new_value << "\n";
}
```

Note convention:

- Interface là nested class `Observer` trong `FooService` (Chromium pattern).
- `virtual ~Observer() = default;` mandatory.
- Override method có `override` keyword.
- Observer không own service (raw pointer).

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Quên `virtual` ở base dtor | Memory leak khi delete qua base pointer | Mọi polymorphic base có `virtual ~Base() = default` |
| Quên `override` keyword | Typo silent thành method mới | Mọi override có `override` |
| Slicing khi pass by value | Polymorphic vô hiệu | Pass by pointer hoặc reference |
| Public inheritance không phải "is-a" | Confusing design | Dùng composition |
| Multiple inheritance không phải interface | Diamond problem | Chỉ kế thừa nhiều interface (pure virtual only) |
| Virtual function gọi từ ctor/dtor | KHÔNG dispatch tới derived! | Gọi pure virtual từ ctor = UB; tránh virtual call trong ctor/dtor |
| `protected` data member rộng rãi | Mất encapsulation cho subclass | Prefer private + protected accessor |
| Modify member qua base reference | OK nếu virtual, nhưng có thể bypass invariant | Design API kỹ lưỡng |

## Tóm tắt

| Concept | Take-away |
|---|---|
| Inheritance | "is-a"; prefer composition khi không thực sự "is-a" |
| `virtual` | Cho phép override; dispatch dynamic |
| `override` | Explicit override; mọi override có |
| `final` | Chặn override / chặn inherit thêm |
| Pure virtual `= 0` | Method abstract; class có ≥ 1 = abstract class |
| Virtual destructor | BẮT BUỘC cho polymorphic base |
| Object slicing | Pass/store polymorphic by value = lost derived part |
| Polymorphic storage | Smart pointer: `unique_ptr<Base>` |
| Multiple inheritance | OK khi interface-only; tránh diamond |

## Exercise (optional)

1. Tạo abstract class `Shape` với `Area() = 0`. Implement `Circle`, `Square`, `Triangle`. Store trong `std::vector<std::unique_ptr<Shape>>` rồi loop tính tổng area.
2. Tạo class `LoggerObserver` với virtual `OnLog(const std::string&)`. Tạo `FileLogger` và `ConsoleLogger` derived. Test cả 2 qua pointer base.
3. Cố tình tạo base class không có virtual dtor, derived có member dùng heap. Delete qua base pointer — verify leak (cần valgrind / ASan).
4. Cố tình slice: pass `Dog` by value vào `void f(Animal a)`. So sánh hành vi với pass by reference.

---

**Phase kế** → [Phase 3: Modern Resource Management](../phase-3-modern-resource-mgmt/01-smart-pointers.md)
