# Bài 2: Classes và Lifetime

Bài này dạy:
- `class` vs `struct`: chỉ khác default access, dùng khi nào.
- Constructor và destructor: lifecycle của object.
- Member initialization list — vì sao phải dùng, không phải gán trong body.
- Access modifier: `public`, `private`, `protected`.
- `this` pointer, member function, `const` member function.
- Stack vs heap: nơi object sống, automatic vs dynamic lifetime.

Kết thúc bài: bạn viết được class với constructor đúng cách, hiểu lifetime của object, biết được data member init khi nào và như thế nào.

## Tại sao class?

Class là cơ chế C++ để gói **data + behavior** liên quan. Tương tự object trong Python/JS, nhưng minh bạch hơn về memory layout, lifetime, access.

```cpp
// Không có class — data và logic rời rạc
struct UserData {
  std::string name;
  int age;
};
void GreetUser(const UserData& u);
bool IsAdult(const UserData& u);

// Có class — gói lại
class User {
 public:
  User(std::string name, int age);
  std::string Greet() const;
  bool IsAdult() const;

 private:
  std::string name_;
  int age_;
};
```

Lợi ích:

- **Encapsulation**: data ẩn (private), chỉ access qua method public.
- **Invariant**: constructor đảm bảo state hợp lệ, không phải check ở mọi nơi.
- **Behavior gắn data**: dễ tìm "user làm gì được" thay vì search hàm tự do.

## `class` vs `struct`

```cpp
class Foo {
  int x;   // private by default
};

struct Bar {
  int x;   // public by default
};
```

**Đó là khác biệt DUY NHẤT**. Mọi thứ khác (constructor, method, inheritance) đều giống.

**Convention Chromium / industry:**

- **`class`** khi có invariant + private data + method có logic.
- **`struct`** khi là plain data aggregate (POD-like), không có invariant phức tạp.

```cpp
struct Rect {           // Plain data
  int width = 0;
  int height = 0;
};

class Window {          // Có invariant + behavior
 public:
  Window(int width, int height);
  void Resize(int width, int height);

 private:
  Rect bounds_;
  bool visible_ = false;
};
```

## Cấu trúc class cơ bản

```cpp
// greeter.h
#pragma once

#include <string>

class Greeter {
 public:
  // Constructor
  Greeter(std::string name, std::string greeting);

  // Destructor
  ~Greeter();

  // Method (public API)
  std::string Greet() const;
  void SetName(const std::string& name);

  // Getter
  const std::string& name() const { return name_; }

 private:
  // Member variable (state) — trailing underscore (Chromium style)
  std::string name_;
  std::string greeting_;
};
```

```cpp
// greeter.cc
#include "greeter.h"

#include <iostream>

Greeter::Greeter(std::string name, std::string greeting)
    : name_(std::move(name)),
      greeting_(std::move(greeting)) {
  std::cout << "Greeter constructed: " << name_ << "\n";
}

Greeter::~Greeter() {
  std::cout << "Greeter destroyed: " << name_ << "\n";
}

std::string Greeter::Greet() const {
  return greeting_ + ", " + name_ + "!";
}

void Greeter::SetName(const std::string& name) {
  name_ = name;
}
```

```cpp
// main.cc
#include "greeter.h"
#include <iostream>

int main() {
  Greeter g("World", "Hello");
  std::cout << g.Greet() << "\n";
  // g.name_ = "X";  // ERROR: name_ là private

  g.SetName("Universe");
  std::cout << g.Greet() << "\n";
  return 0;
  // g destructor được gọi tự động khi out of scope
}
```

Output:
```
Greeter constructed: World
Hello, World!
Greeter destroyed: Universe
```

## Constructor

Constructor là method đặc biệt được gọi khi object **được tạo**. Cùng tên với class, không có return type.

### Default constructor

```cpp
class Foo {
 public:
  Foo() {  // Default constructor — không có parameter
    x_ = 0;
  }
 private:
  int x_;
};

Foo f;  // Tạo bằng default constructor
```

Nếu bạn KHÔNG khai báo bất kỳ constructor nào, compiler tự sinh default constructor (gọi default ctor của mỗi member).

Nếu bạn khai báo bất kỳ constructor nào (parameterized), compiler **không** sinh default ctor nữa. Phải khai báo tự:

```cpp
class Foo {
 public:
  Foo() = default;       // Yêu cầu compiler sinh default
  Foo(int x);            // Parameterized
};
```

### Parameterized constructor

```cpp
class Rect {
 public:
  Rect(int width, int height) : width_(width), height_(height) {}

 private:
  int width_;
  int height_;
};

Rect r(100, 50);
Rect r2{200, 100};   // Uniform init (C++11+)
```

### Member initialization list — quan trọng

Cú pháp `: member_(value), other_(value2)` **trước** body của constructor:

```cpp
class Foo {
 public:
  Foo(int x, const std::string& name)
      : x_(x),                // Init x_ với x
        name_(name),          // Init name_ với name
        timestamp_(GetNow()) {  // Init timestamp_ với GetNow()
    // Body — chỉ thực thi sau khi mọi member init xong
    if (x_ < 0) {
      // ...
    }
  }

 private:
  int x_;
  std::string name_;
  int64_t timestamp_;
};
```

**Vì sao phải dùng init list, không gán trong body?**

```cpp
// BAD — gán trong body
Foo::Foo(int x, const std::string& name) {
  x_ = x;            // x_ đã được default-construct rồi gán — 2 bước
  name_ = name;      // name_ đã được default-construct (empty string) rồi assign — 2 bước
}

// GOOD — init list
Foo::Foo(int x, const std::string& name) : x_(x), name_(name) {}
```

Lý do:

1. **Hiệu quả**: init list direct-init, body gán cần default-construct + assign.
2. **Bắt buộc** cho:
   - `const` member: không gán lại được sau init.
   - Reference member: bắt buộc init khi tạo.
   - Base class constructor (sẽ học ở Bài 3).
   - Member không có default constructor.

```cpp
class Foo {
 public:
  Foo(int x) : x_(x), name_("default") {}
  // Không thể init kiểu này được nếu dùng body — vì const phải init khi tạo
 private:
  const int x_;       // const → BẮT BUỘC init list
  std::string name_;
};
```

### Thứ tự init member

Members được init theo **thứ tự khai báo trong class**, KHÔNG phải thứ tự trong init list:

```cpp
class Foo {
 public:
  Foo() : b_(2), a_(1) {}    // Init list nói b_ trước
 private:
  int a_;   // Khai báo a_ trước
  int b_;   // Khai báo b_ sau
};
// Thực tế: a_ init trước (= 1), rồi b_ (= 2)
```

→ **Quy tắc**: viết init list theo cùng thứ tự khai báo. Compiler warn nếu không.

### Constructor overload

```cpp
class Greeter {
 public:
  Greeter();                              // Default
  Greeter(std::string name);              // 1 param
  Greeter(std::string name, std::string greeting);  // 2 param

 private:
  std::string name_;
  std::string greeting_;
};

Greeter g1;                  // Default
Greeter g2("World");         // 1 param
Greeter g3("World", "Hi");   // 2 param
```

### Delegate constructor (C++11+)

```cpp
class Greeter {
 public:
  Greeter() : Greeter("World", "Hello") {}        // Delegate
  Greeter(std::string name) : Greeter(std::move(name), "Hello") {}
  Greeter(std::string name, std::string greeting)
      : name_(std::move(name)), greeting_(std::move(greeting)) {}

 private:
  std::string name_;
  std::string greeting_;
};
```

Đỡ duplicate code khi có nhiều overload.

### `explicit` — chặn implicit conversion

```cpp
class FileHandle {
 public:
  FileHandle(const std::string& path);  // Không có explicit
};

void OpenFile(FileHandle f);
OpenFile("foo.txt");  // OK — implicit conversion từ const char* → string → FileHandle
                       //  → có thể bất ngờ cho người đọc!
```

```cpp
class FileHandle {
 public:
  explicit FileHandle(const std::string& path);
};

OpenFile("foo.txt");           // ERROR
OpenFile(FileHandle("foo.txt"));  // OK — explicit conversion
```

→ **Chromium convention**: mọi constructor có 1 parameter **phải có `explicit`** (trừ khi cố ý cho phép conversion).

## Destructor

Destructor gọi khi object bị destroy. Cùng tên class, prefix `~`:

```cpp
class FileHandle {
 public:
  FileHandle(const std::string& path) {
    file_ = std::fopen(path.c_str(), "r");
  }

  ~FileHandle() {
    if (file_) {
      std::fclose(file_);   // Cleanup khi destroy
    }
  }

 private:
  std::FILE* file_ = nullptr;
};

void Foo() {
  FileHandle f("data.txt");
  // ... sử dụng ...
}  // f destructor gọi tự động → file đóng
```

Đây là **RAII** (Resource Acquisition Is Initialization) — pattern cốt lõi của C++. Resource acquire trong constructor, release trong destructor. Sẽ học sâu ở Phase 3.

### Khi nào destructor được gọi?

```cpp
class Logger {
 public:
  ~Logger() { std::cout << "destroyed\n"; }
};

void Foo() {
  Logger a;       // Local — destroy khi out of scope
  Logger* b = new Logger();
  delete b;       // Manual destroy
}                 // a destroyed ở đây
```

| Loại | Khi nào destroyed |
|---|---|
| Local (stack) | Out of scope |
| Member | Khi container object destroyed |
| Global / namespace | Sau `main()` |
| Heap (`new`) | Khi `delete` |
| `unique_ptr`/`shared_ptr` | Khi smart pointer destroy (Phase 3) |

### Default destructor

Nếu không khai báo destructor, compiler sinh default = empty body + destruct mọi member theo thứ tự ngược khai báo.

```cpp
class Foo {
 private:
  std::string name_;     // Destruct lần 2
  std::vector<int> v_;   // Destruct lần 1
};
// ~Foo() implicit gọi v_::~vector() rồi name_::~string()
```

→ **Rule of zero**: nếu không cần custom cleanup, đừng định nghĩa destructor. Default đủ tốt.

## Member function

```cpp
class Greeter {
 public:
  std::string Greet() const;    // Member function
  void SetName(const std::string& name);

 private:
  std::string name_;
};

// Định nghĩa
std::string Greeter::Greet() const {
  return "Hello, " + name_;
}

void Greeter::SetName(const std::string& name) {
  name_ = name;
}
```

### `this` pointer

Trong member function, `this` là **pointer tới object hiện tại**:

```cpp
class Foo {
 public:
  void DoSomething() {
    std::cout << this;     // Print địa chỉ object
    this->x_ = 10;          // Tương đương x_ = 10
    x_ = 10;                // OK — implicit this->
  }

 private:
  int x_ = 0;
};
```

`this->` thường không cần (compiler resolve `x_` thành `this->x_`), nhưng dùng khi:

- Cần phân biệt với param cùng tên: `this->x = x;` (param x vs member x).
  - Tuy nhiên Chromium prefer trailing underscore (`x_`) cho member → tránh case này.
- Pass `this` cho callback.
- Method template — đôi khi compiler cần hint.

### `const` member function

```cpp
class Foo {
 public:
  int Get() const {       // const ở cuối — không modify state
    // x_ = 10;             // ERROR — không modify được
    return x_;
  }

  void Set(int x) {        // Không const — modify được
    x_ = x;
  }

 private:
  int x_ = 0;
};
```

`const` ở cuối khai báo method = "method này không modify state của object".

Hậu quả:

- Object `const Foo f;` chỉ gọi được `const` method.
- Compiler bắt nhầm.
- Caller biết method "read-only".

**Quy tắc**: getter, query method → `const`. Setter, mutate method → không const.

```cpp
class Rect {
 public:
  int width() const { return width_; }      // Getter — const
  int height() const { return height_; }    // const
  int Area() const { return width_ * height_; }  // Computed — const
  void Resize(int w, int h) { width_ = w; height_ = h; }  // Mutate — không const

 private:
  int width_ = 0;
  int height_ = 0;
};

const Rect r(10, 20);
r.width();    // OK
r.Area();      // OK
// r.Resize(5, 5);  // ERROR — r is const
```

### `mutable` — exception cho const

```cpp
class Cache {
 public:
  int GetExpensive() const {
    if (!cached_) {
      value_ = ComputeExpensive();  // OK với mutable
      cached_ = true;
    }
    return value_;
  }

 private:
  mutable int value_ = 0;
  mutable bool cached_ = false;
};
```

`mutable` cho phép modify trong `const` method. Hiếm dùng, chủ yếu cho cache / lazy init.

### Static method

```cpp
class Math {
 public:
  static int Square(int x) { return x * x; }
};

Math::Square(5);   // Gọi không cần instance — 25
```

Static method không có `this`, không access non-static member. Khi method không cần state, dùng static.

## Access modifier

```cpp
class Foo {
 public:        // Truy cập từ bất kỳ đâu
  void PublicMethod();
  int public_field;

 private:       // Chỉ trong class này
  void PrivateMethod();
  int private_field_;

 protected:     // Trong class này + class kế thừa
  void ProtectedMethod();
  int protected_field_;
};
```

**Quy tắc**:

- **Data member → `private`** (gần như luôn).
- **API method → `public`**.
- **Helper internal → `private`**.
- **`protected`** chỉ dùng khi thiết kế cho inheritance (sẽ học ở Bài 3).

### `friend` — exception cho access control

```cpp
class Foo {
  friend class Bar;
  friend void DebugDump(const Foo& f);

 private:
  int secret_ = 42;
};

void DebugDump(const Foo& f) {
  std::cout << f.secret_;   // OK qua friend
}
```

`friend` cho phép class/function khác access private member. Dùng có chọn lọc (testing, operator overload). Modern C++ thường tránh `friend`.

## Stack vs heap

Object có thể sống ở 2 nơi:

### Stack (automatic storage)

```cpp
void Foo() {
  Greeter g("World", "Hi");  // g trên stack
  std::cout << g.Greet();
}  // g destroyed tự động
```

- **Sinh**: khi khai báo.
- **Destroy**: khi out of scope.
- **Speed**: nhanh.
- **Limit**: stack size (thường vài MB) — không thể tạo array khổng lồ trên stack.

### Heap (dynamic storage)

```cpp
void Foo() {
  Greeter* g = new Greeter("World", "Hi");  // g trên heap
  std::cout << g->Greet();
  delete g;  // Bạn phải manual destroy
}
```

- **Sinh**: `new` (return pointer).
- **Destroy**: `delete` (manual).
- **Speed**: chậm hơn stack (allocator overhead).
- **Limit**: chỉ giới hạn bởi RAM.
- **Bẫy lớn**: quên `delete` = memory leak; double `delete` = UB; `delete` rồi dùng = UB.

### Khi nào dùng heap?

- Object lớn không vừa stack.
- Lifetime cần tồn tại ngoài scope.
- Polymorphic object (lưu base pointer trỏ tới derived — Bài 3).
- Container ngầm dùng heap (`std::vector` thực ra alloc trên heap dù bạn khai báo `std::vector<int> v;` trên stack).

### Modern C++: smart pointer thay raw `new`/`delete`

```cpp
// Bad (legacy)
Greeter* g = new Greeter("World", "Hi");
// ... có thể quên delete ...
delete g;

// Good (modern)
#include <memory>
auto g = std::make_unique<Greeter>("World", "Hi");
// ... auto destroy khi g out of scope ...
```

Sẽ học chi tiết ở Phase 3.

## Object lifetime — bigger picture

```cpp
class Owner {
 public:
  Owner(std::string name) : name_(std::move(name)) {
    std::cout << "ctor " << name_ << "\n";
  }
  ~Owner() {
    std::cout << "dtor " << name_ << "\n";
  }
 private:
  std::string name_;
};

void Foo() {
  Owner a("A");
  {
    Owner b("B");
    Owner c("C");
  }  // c, b destroyed ở đây (ngược thứ tự construct)
}    // a destroyed ở đây
```

Output:
```
ctor A
ctor B
ctor C
dtor C
dtor B
dtor A
```

→ **Destruction order = reverse construction order** (within same scope).

## Pattern thực tế Chromium

```cpp
// chrome/browser/foo/foo_manager.h
#pragma once

#include <string>
#include <vector>

namespace foo {

class FooManager {
 public:
  // 2 ctors — default + parameterized
  FooManager();
  explicit FooManager(int max_items);  // explicit cho single-param ctor

  // Custom destructor — sẽ học vì sao ở Phase 3
  ~FooManager();

  // Disallow copy (Chromium pattern)
  FooManager(const FooManager&) = delete;
  FooManager& operator=(const FooManager&) = delete;

  // Public API
  bool AddItem(const std::string& item);
  bool RemoveItem(const std::string& item);

  // Getter — const, return reference
  const std::vector<std::string>& items() const { return items_; }
  int max_items() const { return max_items_; }

 private:
  // Private helper
  bool IsValidItem(const std::string& item) const;

  std::vector<std::string> items_;
  int max_items_ = 100;
};

}  // namespace foo
```

```cpp
// chrome/browser/foo/foo_manager.cc
#include "chrome/browser/foo/foo_manager.h"

namespace foo {

FooManager::FooManager() = default;

FooManager::FooManager(int max_items) : max_items_(max_items) {}

FooManager::~FooManager() = default;

bool FooManager::AddItem(const std::string& item) {
  if (items_.size() >= static_cast<size_t>(max_items_)) {
    return false;
  }
  if (!IsValidItem(item)) {
    return false;
  }
  items_.push_back(item);
  return true;
}

bool FooManager::IsValidItem(const std::string& item) const {
  return !item.empty();
}

// ... etc
}  // namespace foo
```

Note:

- `explicit` cho single-param ctor.
- `= delete` chặn copy (Chromium pattern phổ biến — sẽ học ở Phase 3).
- Default ctor/dtor `= default` thay vì empty body.
- Member init in-place: `int max_items_ = 100;` (C++11+).

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Gán trong body thay vì init list | Inefficient; không hoạt động cho const/ref | Luôn init list |
| Init list sai thứ tự với declaration | Compiler warn, có thể bug nếu member depend nhau | Match thứ tự declaration |
| Quên `explicit` cho 1-param ctor | Implicit conversion bất ngờ | `explicit` mọi 1-param ctor |
| Public data member | Mất encapsulation, không bảo vệ invariant | Private + getter/setter |
| Quên `const` method khi đáng có | `const Foo&` không gọi được | Mark getter/query const |
| Destructor không cleanup resource | Leak | RAII: cleanup trong dtor (Phase 3 — smart pointer thay) |
| Return pointer/ref tới member sau khi class destroy | Dangling | Hiểu lifetime cẩn thận |
| Init member theo thứ tự sai trong header | Bug khó debug | Khai báo theo thứ tự dependency |

## Tóm tắt

| Concept | Take-away |
|---|---|
| `class` vs `struct` | Chỉ khác default access; convention class = behavior, struct = data |
| Constructor | Init member, dùng init list, `explicit` cho 1-param |
| Destructor | Cleanup resource (RAII), prefer `= default` nếu không cần custom |
| Member init list | Bắt buộc cho const/ref/no-default-ctor member; match declaration order |
| `this` | Pointer tới object hiện tại trong member method |
| `const` method | Không modify state, gọi được trên const object |
| Access | Data → private; API → public; `protected` cho inheritance |
| Stack vs heap | Local default; heap qua smart pointer (modern) |
| Lifetime | Ctor on create, dtor on destroy; reverse construct order |

## Exercise (optional)

1. Viết class `Point` với x, y; constructor 2-param; method `Distance(const Point& other) const`.
2. Viết class `Counter` với `Increment()`, `Decrement()`, `value() const`. Đảm bảo invariant `value >= 0`.
3. Tạo class `FileHandle` mở file trong ctor, đóng trong dtor. Test: tạo trong scope, ra scope thấy file được đóng.
4. Viết class `Rectangle` với explicit single-param ctor (`Rectangle(int square_size)`) tạo hình vuông. Verify không gọi được implicit (`Rectangle r = 5;` phải error).

---

**Bài kế tiếp** → [Bài 3: Inheritance và Polymorphism](03-inheritance-and-polymorphism.md)
