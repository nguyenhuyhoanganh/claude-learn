# Bài 1: Templates

Bài này dạy:
- Function template: viết hàm generic theo type.
- Class template: viết class generic (vd container).
- Template argument deduction — compiler tự suy type.
- Specialization (explicit và partial) — nhắc qua.
- Variadic template — số lượng argument tùy ý.
- C++20 concepts — constraint template argument.

Kết thúc bài: bạn đọc được code có template, viết được helper function generic, hiểu được tại sao `std::vector<int>` và `std::vector<std::string>` là 2 class khác nhau ở mức compile.

## Tại sao cần template?

Bài toán: viết hàm `Max` cho int, double, string... Mỗi type 1 overload?

```cpp
int Max(int a, int b) { return a > b ? a : b; }
double Max(double a, double b) { return a > b ? a : b; }
std::string Max(const std::string& a, const std::string& b) { return a > b ? a : b; }
// ... và mọi type khác
```

Lặp code mệt. Template giải bài toán: viết "công thức" cho hàm, compiler sinh ra phiên bản cụ thể khi cần.

```cpp
template <typename T>
T Max(T a, T b) {
  return a > b ? a : b;
}

Max(1, 2);              // T = int
Max(1.5, 2.5);          // T = double
Max(std::string("a"), std::string("b"));  // T = std::string
```

→ Template = **compile-time code generation**. Compiler sinh ra code cụ thể (gọi là **instantiation**) cho mỗi type bạn dùng.

**Analogy với TypeScript**:

```typescript
function max<T>(a: T, b: T): T {
  return a > b ? a : b;
}
```

C++ template tương tự generics nhưng:

- Compile-time (TypeScript có generic chỉ ở type-check phase).
- Có thể dùng cho value, không chỉ type.
- Mạnh hơn nhiều (turing-complete metaprogramming) nhưng error message thường dài và đau đầu.

## Function template

### Cú pháp cơ bản

```cpp
template <typename T>
T Identity(T x) {
  return x;
}

Identity(5);         // T = int → int Identity(int)
Identity(3.14);      // T = double → double Identity(double)
Identity("hello");   // T = const char* → const char* Identity(const char*)
```

`template <typename T>` declare template parameter `T`. Có thể dùng `class T` thay `typename T` — đồng nghĩa (historical reason, dùng `typename` modern).

### Multiple parameter

```cpp
template <typename T, typename U>
auto Add(T a, U b) {
  return a + b;
}

Add(1, 2.5);         // T = int, U = double → return type = double
Add(1, 2);           // T = int, U = int → return type = int
```

### Non-type template parameter

Template không chỉ là type — cũng có thể là **giá trị compile-time**:

```cpp
template <typename T, size_t N>
class Array {
 public:
  T& operator[](size_t i) { return data_[i]; }

 private:
  T data_[N];
};

Array<int, 10> a;     // N = 10
Array<int, 100> b;    // N = 100 — class khác hoàn toàn với Array<int, 10>!
```

`std::array<T, N>` thực ra dùng pattern này.

### Template argument deduction

Compiler suy type từ argument:

```cpp
template <typename T>
void Print(T x) { std::cout << x; }

Print(5);          // T deduced = int
Print("hello");    // T deduced = const char*
Print(std::vector<int>{1, 2});  // T = std::vector<int>
```

Đôi khi compiler không suy được → explicit:

```cpp
template <typename T>
T Default() { return T{}; }

// Default();      // ERROR — không có argument để suy T
Default<int>();    // Explicit T = int → trả 0
Default<std::string>();  // Trả ""
```

### Template không phải runtime polymorphism

```cpp
template <typename T>
void DoSomething(T x) {
  x.SomeMethod();
}

class A {
 public:
  void SomeMethod() { std::cout << "A\n"; }
};

class B {
 public:
  void SomeMethod() { std::cout << "B\n"; }
};

DoSomething(A{});   // OK — compiler instantiate DoSomething<A>
DoSomething(B{});   // OK — compiler instantiate DoSomething<B>
DoSomething(5);     // ERROR — int không có SomeMethod()
```

Lưu ý:

- A và B **không cần kế thừa interface chung**. Template work nhờ "duck typing" compile-time: nếu method được gọi, type phải support.
- Error message khi mismatch thường dài và đáng sợ — phần lớn coi như "T không support method này".

### Inline definition trong header

Template **phải define trong header** (vì compiler cần body khi instantiate ở mỗi file).

```cpp
// max.h
#pragma once

template <typename T>
T Max(T a, T b) {
  return a > b ? a : b;
}
```

Không tách `.cpp` cho template, trừ khi explicit instantiate.

## Class template

```cpp
template <typename T>
class Box {
 public:
  Box(T value) : value_(value) {}

  T Get() const { return value_; }
  void Set(T value) { value_ = value; }

 private:
  T value_;
};

Box<int> bi(42);
Box<std::string> bs("hello");

bi.Get();    // int 42
bs.Get();    // string "hello"
```

### Method định nghĩa ngoài class body

```cpp
template <typename T>
class Box {
 public:
  Box(T value);
  T Get() const;
 private:
  T value_;
};

// Định nghĩa ngoài
template <typename T>
Box<T>::Box(T value) : value_(value) {}

template <typename T>
T Box<T>::Get() const { return value_; }
```

Phải repeat `template <typename T>` và `Box<T>::` cho mỗi method.

### Multiple parameter

```cpp
template <typename K, typename V>
class Pair {
 public:
  Pair(K k, V v) : key_(k), value_(v) {}

  const K& key() const { return key_; }
  const V& value() const { return value_; }

 private:
  K key_;
  V value_;
};

Pair<std::string, int> p("count", 42);
```

`std::pair`, `std::map` build trên pattern này.

### CTAD — Class Template Argument Deduction (C++17+)

```cpp
template <typename T>
class Container {
 public:
  Container(T x) : data_(x) {}
 private:
  T data_;
};

Container c(5);           // C++17 — T deduced = int (CTAD)
Container<int> c2(5);     // Explicit
```

C++17 cho phép class template suy type từ ctor argument. Trước đó phải explicit.

## Specialization

### Explicit specialization

Override behavior cho type cụ thể:

```cpp
template <typename T>
class Printer {
 public:
  void Print(T x) { std::cout << x << "\n"; }
};

// Specialize cho bool
template <>
class Printer<bool> {
 public:
  void Print(bool b) { std::cout << (b ? "true" : "false") << "\n"; }
};

Printer<int>().Print(5);     // 5
Printer<bool>().Print(true); // true
```

### Function template specialization

```cpp
template <typename T>
std::string Format(T x) {
  return std::to_string(x);
}

// Specialize cho string
template <>
std::string Format<std::string>(std::string x) {
  return "\"" + x + "\"";
}

Format(42);                  // "42"
Format(std::string("hi"));    // "\"hi\""
```

### Partial specialization (class only — không function)

```cpp
template <typename T, typename U>
class Pair { ... };

// Partial: T = U (cả 2 cùng type)
template <typename T>
class Pair<T, T> {
  // ...
};
```

Function template không hỗ trợ partial — workaround dùng overloading hoặc tag dispatch.

→ Specialization là advanced topic. Beginner: biết tồn tại, đọc được, không cần viết thường.

## Variadic template

Số lượng template parameter tùy ý:

```cpp
template <typename... Args>
void Log(Args... args) {
  (std::cout << ... << args) << "\n";   // C++17 fold expression
}

Log("Hello", 42, " ", 3.14);
// Output: Hello42 3.14
```

`typename...` = "0 hoặc nhiều type". `args...` = "expand pack thành argument list".

### Use case: forward arguments

```cpp
template <typename T, typename... Args>
std::unique_ptr<T> MakeUnique(Args&&... args) {
  return std::unique_ptr<T>(new T(std::forward<Args>(args)...));
}

auto p = MakeUnique<Widget>(800, 600, "title");
```

Đây gần như là implementation của `std::make_unique`.

`std::forward<Args>(args)...` = forward từng argument với category lvalue/rvalue đúng.

## Concepts (C++20)

C++20 thêm **concepts** — constraint cho template parameter:

```cpp
#include <concepts>

template <std::integral T>
T Square(T x) {
  return x * x;
}

Square(5);        // OK — int is integral
// Square(3.14);  // ERROR — double không satisfy integral
```

`std::integral`, `std::floating_point`, `std::regular`, ... có sẵn trong `<concepts>`.

### Custom concept

```cpp
template <typename T>
concept Printable = requires(T x) {
  { std::cout << x } -> std::same_as<std::ostream&>;
};

template <Printable T>
void Print(T x) {
  std::cout << x;
}
```

`concept` define yêu cầu. `requires` clause expression check syntactic.

### `requires` clause

```cpp
template <typename T>
requires std::integral<T>
T Square(T x) {
  return x * x;
}

// Tương đương
template <std::integral T>
T Square(T x) { return x * x; }
```

Hai cú pháp tương đương.

### Vì sao concepts?

Trước concepts, template error message kinh khủng. Vd `Square(3.14)` báo lỗi 50 dòng "operator< not found for double in stl_algobase.h:...".

Với concepts:

```
error: 'double' does not satisfy 'integral'
```

Rõ ràng hơn nhiều.

**Trạng thái 2026**: C++20 concepts đã được support tốt (GCC 12+, Clang 14+). Chromium build với C++20 nên dùng được. Nhưng phần lớn code Chromium hiện chưa migrate sang concepts.

## Template trong STL — quick survey

STL = "Standard Template Library" — toàn bộ STL build trên template:

```cpp
std::vector<int> v;
std::vector<std::string> v2;
std::map<std::string, int> m;
std::shared_ptr<Widget> p;
std::unique_ptr<int[]> arr;

std::function<int(int, int)> f;   // Type-erased callable
std::optional<int> opt;
```

Tất cả đều là class template. Tốt vì:

- 1 implementation, dùng cho mọi type.
- Compile-time check.

Trở ngại: error message khi sai có thể tới 100 dòng.

## Pattern thực tế Chromium

### Generic container

```cpp
// base/containers/circular_deque.h
template <typename T>
class CircularDeque {
 public:
  void push_back(T value);
  T pop_front();
  // ...
};

CircularDeque<int> queue;
CircularDeque<std::string> str_queue;
```

### Generic callback wrapper

```cpp
// base/callback.h (simplified)
template <typename R, typename... Args>
class OnceCallback;

template <typename R, typename... Args>
class OnceCallback<R(Args...)> {
 public:
  R Run(Args... args) &&;
};

OnceCallback<void(int)> cb;
OnceCallback<bool(const std::string&)> cb2;
```

Sẽ học detail ở `chromium-native/phase-2/01-callbacks-and-bind.md`.

### Singleton template

```cpp
template <typename T>
class Singleton {
 public:
  static T* GetInstance() {
    static T instance;
    return &instance;
  }
};

class Logger : public Singleton<Logger> { ... };
auto* logger = Logger::GetInstance();
```

(Chromium dùng `base::Singleton` thay direct pattern.)

## Khi nào viết template?

✅ **Khi:**

- Logic giống nhau cho nhiều type (container, callback, algorithm).
- Cần compile-time polymorphism (faster than virtual).
- Library code dùng cho user generic.

❌ **KHÔNG khi:**

- Chỉ dùng 1 type → viết function/class thường, không template.
- Polymorphism runtime → dùng virtual function.
- Code rất phức tạp với SFINAE/metaprogramming → maintainability kém.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Template define trong `.cpp` | Linker error nếu dùng từ file khác | Define trong header |
| Template instantiate quá nhiều type | Binary bloat | Limit, hoặc dùng type erasure (`std::function`) |
| Sai type khi explicit instantiate | Compile error dài dòng | Đọc kỹ message hoặc dùng concepts |
| Forward declare class template không đầy đủ | Compile error | Forward declare đầy đủ template params |
| Quên `typename` cho dependent type | Compile error | `typename T::Iterator it` trong template |
| Auto-deduce type không như mong đợi | Bug subtle | Test với `decltype` để check |
| Specialize function template — dùng overload thay | Có thể không match như mong đợi | Prefer overload over specialization cho function |

## Tóm tắt

| Concept | Take-away |
|---|---|
| `template <typename T>` | Declare template parameter |
| Function template | Generic function, compiler instantiate per type |
| Class template | Generic class (container, wrapper) |
| Specialization | Override cho type cụ thể |
| Variadic | `typename...`, `Args... args`, fold expression |
| Concepts (C++20) | Constraint template parameter |
| STL = templates | Mọi container/algorithm là template |
| Header-only | Template definition phải ở header |

## Analogy với TypeScript

```typescript
function max<T>(a: T, b: T): T { ... }            // function template
class Container<T> { ... }                         // class template
function multi<K, V>(k: K, v: V): Pair<K, V> { } // multiple params
function variadic<T extends any[]>(...args: T) { } // variadic
function constrained<T extends number>(x: T): T { } // concepts equivalent
```

C++ template mạnh hơn (compile-time computation), nhưng error message phức tạp hơn.

## Exercise (optional)

1. Viết `template <typename T> void Swap(T& a, T& b)`. Test với int, string, vector.
2. Viết `template <typename T, size_t N> class StackArray` lưu N phần tử T trên stack.
3. Viết variadic `Sum(Args... args)` trả về tổng. Dùng C++17 fold expression.
4. Dùng concept để constrain `Print<T>` chỉ work với type có `operator<<(std::ostream&)`.

---

**Bài kế tiếp** → [Bài 2: Containers và Strings](02-containers-and-strings.md)
