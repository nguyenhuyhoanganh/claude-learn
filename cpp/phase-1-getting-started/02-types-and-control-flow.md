# Bài 2: Types và Control Flow

Bài này dạy:
- Built-in types của C++: integer, floating-point, boolean, character.
- Fixed-width types (`int32_t`, `uint8_t`, `size_t`) — chuẩn Chromium.
- `const` và `constexpr` — immutability ở 2 mức.
- `auto` type deduction — khi nào dùng, khi nào không.
- Control flow: `if`, `switch`, `for`, `while`, range-for.
- Function: declaration, definition, default arguments, overloading.

Kết thúc bài: bạn viết được hàm có nhiều biến, vòng lặp, conditional và hiểu được phần lớn syntax cơ bản trong code C++.

## Tại sao type quan trọng?

Trong Python, JS, hay Ruby: bạn gán giá trị cho biến, type là của giá trị, không phải biến. `x = 1` rồi `x = "hello"` không sao.

C++ static-typed: **biến có type cố định** từ lúc khai báo đến hết scope. `int x = 1;` rồi `x = "hello";` → compile error.

Hậu quả:

- Compiler check type lúc compile → bắt nhiều bug sớm.
- Code minh bạch: đọc signature `int Add(int, int)` biết ngay nó nhận gì, trả gì.
- Performance: compiler biết exact memory layout → optimize tốt.
- Trade-off: code dài hơn, khai báo tường minh.

C++17 có `auto` để giảm verbosity — sẽ học dưới.

## Built-in types

### Integer types

| Type | Size (thường) | Range (signed) | Khi nào dùng |
|---|---|---|---|
| `char` | 1 byte | -128..127 (hoặc 0..255 — implementation-defined!) | Character, byte |
| `short` | 2 byte | -32768..32767 | Hiếm dùng |
| `int` | 4 byte (32-bit) hoặc đôi khi 2 byte | -2³¹..2³¹-1 | Default integer |
| `long` | 4 hoặc 8 byte (platform-dependent!) | — | Hiếm dùng, prefer fixed-width |
| `long long` | 8 byte | -2⁶³..2⁶³-1 | Số rất lớn |

**Vấn đề lớn**: kích thước của `int`, `long` **không cố định** giữa platform. `long` là 8 byte trên Linux 64-bit, nhưng 4 byte trên Windows 64-bit. → Code dùng `long` để giả định 8 byte sẽ buggy.

### Fixed-width integer types — chuẩn Chromium

Khi cần kích thước cụ thể, dùng `<cstdint>`:

```cpp
#include <cstdint>

int8_t   a;   // signed 8-bit
uint8_t  b;   // unsigned 8-bit
int16_t  c;   // signed 16-bit
uint16_t d;   // unsigned 16-bit
int32_t  e;   // signed 32-bit
uint32_t f;   // unsigned 32-bit
int64_t  g;   // signed 64-bit
uint64_t h;   // unsigned 64-bit
```

→ **Trong Chromium, prefer fixed-width khi kích thước có ý nghĩa** (vd byte buffer, network protocol, file format). `int` chỉ dùng khi kích thước không quan trọng.

### `size_t` — special

```cpp
#include <cstddef>

size_t n = vector.size();  // Trả về size_t (unsigned)
```

`size_t` là **unsigned integer đủ lớn để chứa size của bất kỳ object nào**. Trên 64-bit thường là `uint64_t`. Trả về của `sizeof()`, `vector::size()`, `string::length()`, etc.

**Bẫy**: `size_t` là unsigned. Trừ 2 `size_t` ra số âm sẽ wrap around về số rất lớn.

```cpp
size_t a = 5;
size_t b = 10;
size_t diff = a - b;  // diff = 18446744073709551611, KHÔNG phải -5!
```

→ Cẩn thận khi mix signed/unsigned. Compiler warn nếu bật `-Wsign-compare`.

### Floating-point

| Type | Size | Precision | Khi nào dùng |
|---|---|---|---|
| `float` | 4 byte | ~7 decimal digit | Khi memory critical (GPU, image) |
| `double` | 8 byte | ~15 decimal digit | **Default** cho real number |
| `long double` | ≥ 8 byte | ≥ 15 digit | Hiếm dùng, không portable |

→ Mặc định dùng `double`. Chỉ dùng `float` khi có lý do cụ thể.

```cpp
double pi = 3.14159265358979;
float radius = 2.5f;  // Suffix 'f' để literal là float, không phải double
```

### Boolean

```cpp
bool flag = true;
bool ok = false;
```

`bool` chỉ có `true` (1) hoặc `false` (0). 1 byte (không phải 1 bit — đó là minimum addressable unit).

**Bẫy phổ biến từ C**: trong C, không có `bool` thuần — người ta dùng `int`. Trong C++ luôn dùng `bool`.

### Character

```cpp
char c = 'A';      // 1 byte ASCII
char16_t k = u'語'; // 2 byte UTF-16 unit
char32_t u = U'😀'; // 4 byte UTF-32 unit
```

Chromium dùng `std::u16string` (UTF-16) cho text internally — historical reason, JavaScript dùng UTF-16. Sẽ học string ở Phase 4.

### `void`

```cpp
void Foo();           // Hàm không return gì
void* ptr;            // Pointer không có type — raw memory
```

`void` đại diện "không có type". `void*` thường avoid (dùng `std::any`, template, hoặc `std::byte` thay).

## Biến và khởi tạo

### Cú pháp khai báo

```cpp
int x;            // x chưa khởi tạo (UB nếu đọc!)
int y = 10;       // Khởi tạo với 10
int z(20);        // Khởi tạo "direct"
int w{30};        // Khởi tạo "uniform" (C++11+) — KHUYẾN KHÍCH
int a = {40};     // Cũng được
```

**Khuyến nghị**: dùng `{}` (uniform initialization) khi có thể. Lý do:

- Bắt được narrowing conversion (vd `int x{3.14}` → error vì 3.14 không vừa `int`).
- Consistent syntax cho mọi loại type (POD, class, container).

```cpp
int safe{3.14};      // ERROR: narrowing
int unsafe = 3.14;   // OK (silently truncate to 3)

std::vector<int> v{1, 2, 3};       // Init list
std::string s{"hello"};            // Char array → string
```

### Biến chưa init — coi chừng UB

```cpp
int x;
std::cout << x;  // UNDEFINED BEHAVIOR — x có thể là bất cứ giá trị nào
```

C++ không tự zero-init local variable (khác Python/Java). **Luôn init**.

Trong Chromium, ta thường:

```cpp
int counter = 0;
bool ready = false;
std::string message;        // Container/string tự init thành empty — OK
```

## `const` và `constexpr`

### `const` — immutable runtime

```cpp
const int kMaxRetries = 3;
kMaxRetries = 5;  // ERROR: assignment of read-only variable

void Foo(const std::string& name) {
  name = "new";  // ERROR
}
```

`const` đảm bảo biến không thay đổi sau khởi tạo. Lợi ích:

- Compiler bắt nhầm khi vô tình modify.
- Người đọc biết biến là immutable → suy luận dễ hơn.
- Optimization tiềm năng (compiler biết giá trị không đổi).

**`const` apply nhiều chỗ:**

```cpp
const int x = 5;             // x là const int
int const y = 5;             // Tương đương — đọc từ phải sang trái: "y is const int"

const int* p1 = &x;          // p1 trỏ tới const int (data không đổi, pointer đổi được)
int* const p2 = &y;          // p2 là const pointer (pointer không đổi, data đổi được)
const int* const p3 = &x;    // Cả hai không đổi
```

→ Sẽ học sâu trong Bài 1 Phase 2.

### `constexpr` — compile-time constant

```cpp
constexpr int kBufferSize = 1024;
constexpr int Square(int x) { return x * x; }

constexpr int kBig = Square(100);  // Tính lúc compile, = 10000
```

`constexpr` mạnh hơn `const`: yêu cầu giá trị **biết được lúc compile**. Có thể dùng cho:

- Array size: `int buf[Square(8)];` OK với constexpr, không OK với chỉ const.
- Template argument.
- Optimization mạnh hơn.

**Khuyến nghị**: dùng `constexpr` cho constant ở scope file/class khi có thể.

Chromium prefer `kCamelCase` cho constant: `kMaxRetries`, `kDefaultTimeout`.

## `auto` — type deduction

```cpp
auto x = 5;                      // x là int
auto y = 3.14;                   // y là double
auto s = std::string("hello");   // s là std::string

std::vector<int> v{1, 2, 3};
for (auto it = v.begin(); it != v.end(); ++it) {  // it là std::vector<int>::iterator
  ...
}
```

`auto` để compiler infer type từ initializer. Khi nào dùng:

✅ **DÙNG khi:**

- Type dài, lặp đi lặp lại: `auto it = map.begin();` thay vì `std::unordered_map<std::string, std::vector<int>>::iterator it = ...`
- Type không quan trọng cho người đọc, chỉ quan trọng cho compiler.
- Trong template code.
- Range-for loop: `for (auto& item : container)`.

❌ **KHÔNG dùng khi:**

- Type quan trọng cho semantic: `auto count = users.size();` — `count` là `size_t` chứ không phải `int`. Người đọc cần biết.
- Numeric literal: `auto x = 0;` ambiguous (`int`? `long`?). Viết rõ `int x = 0;`.
- Initializer khó hiểu: `auto x = Foo();` — người đọc không biết Foo trả gì.

### `auto&`, `auto&&`, `auto*`

```cpp
std::vector<int> v{1, 2, 3};

for (auto x : v) { x = 0; }         // x là COPY, không modify v
for (auto& x : v) { x = 0; }        // x là reference, modify v
for (const auto& x : v) { use(x); } // const reference, không modify, không copy
```

`auto&` rất phổ biến — tránh copy không cần thiết khi iterate container.

### `decltype`

```cpp
int x = 5;
decltype(x) y = 10;  // y là int (type của x)

std::vector<int> v;
decltype(v.size()) n = 0;  // n là decltype của size() = size_t
```

`decltype` "lấy type của expression mà không evaluate". Dùng trong template metaprogramming hoặc khi type của expression khó viết. Sẽ học thêm ở Phase 5.

## Conversion

### Implicit conversion

C++ tự động convert một số case:

```cpp
int x = 5;
double y = x;      // OK: int → double, không mất data
int z = 3.7;       // OK nhưng truncate thành 3 (warning với -Wconversion)
```

### Explicit conversion (cast)

```cpp
double pi = 3.14;
int rounded = static_cast<int>(pi);   // Modern C++ cast
int rounded2 = (int)pi;               // C-style cast — TRÁNH
```

C++ có 4 loại cast (sẽ học sâu ở Phase 2):

- `static_cast<T>(x)` — convert tường minh, compile-time check.
- `reinterpret_cast<T>(x)` — re-interpret bit pattern, dangerous.
- `const_cast<T>(x)` — bỏ `const`, dangerous.
- `dynamic_cast<T>(x)` — runtime check cho polymorphic class.

→ **Default dùng `static_cast`**. C-style cast bypass tất cả check → không an toàn.

## Control flow

### `if` / `else`

```cpp
if (x > 10) {
  Foo();
} else if (x > 5) {
  Bar();
} else {
  Baz();
}
```

C++17 có **init-statement** trong `if`:

```cpp
if (auto* p = FindElement(); p != nullptr) {
  use(*p);
}
// p out of scope ở đây
```

Pattern phổ biến: declare biến + check trong cùng `if`. Chromium dùng nhiều.

### `switch`

```cpp
switch (event_type) {
  case kClick:
    HandleClick();
    break;
  case kHover:
    HandleHover();
    break;
  case kScroll:
  case kZoom:
    HandleScroll();
    break;
  default:
    HandleUnknown();
}
```

**Bẫy lớn**: quên `break` → fallthrough (chạy tiếp case sau). C++17 có `[[fallthrough]]` để intentional:

```cpp
case kClick:
  DoClick();
  [[fallthrough]];  // Có ý đồ chạy tiếp
case kHover:
  DoHover();
  break;
```

Compiler warn fallthrough nếu không có `[[fallthrough]]`.

### Loops

```cpp
// Counted for
for (int i = 0; i < 10; ++i) {
  std::cout << i << " ";
}

// While
int n = 100;
while (n > 0) {
  n /= 2;
}

// Do-while (hiếm dùng, nhưng có)
int c;
do {
  c = GetChar();
} while (c != EOF);

// Range-for (C++11+) — KHUYẾN KHÍCH
std::vector<int> v{1, 2, 3, 4, 5};
for (int x : v) {
  std::cout << x;
}
```

Range-for là idiom modern: ngắn, an toàn (không off-by-one), không cần iterator boilerplate.

### `break`, `continue`

```cpp
for (int x : v) {
  if (x < 0) continue;   // Bỏ qua iteration này
  if (x > 100) break;    // Thoát loop
  Process(x);
}
```

Tương đương Python/JS.

### Bẫy: `++i` vs `i++`

```cpp
for (int i = 0; i < 10; ++i) ...   // Prefix — khuyến khích
for (int i = 0; i < 10; i++) ...   // Postfix — OK cho int, nhưng cho iterator/object có thể chậm
```

`i++` (postfix) trả về **copy** của `i` trước khi tăng. Với int là free, nhưng với iterator phức tạp, là copy thật → chậm hơn `++i` (prefix).

→ **Habit tốt**: dùng `++i` mặc định. Chromium style guide cũng vậy.

## Functions

### Declaration vs definition

```cpp
// Declaration (thường ở .h)
int Add(int a, int b);

// Definition (thường ở .cpp)
int Add(int a, int b) {
  return a + b;
}
```

### Default arguments

```cpp
void Greet(const std::string& name, const std::string& greeting = "Hello") {
  std::cout << greeting << ", " << name << "!\n";
}

Greet("World");                  // Dùng default: "Hello, World!"
Greet("World", "Bonjour");       // Override: "Bonjour, World!"
```

**Bẫy**: default chỉ ở **declaration**, không phải definition. Đừng repeat ở `.cpp`.

```cpp
// foo.h
void Greet(const std::string& name, const std::string& greeting = "Hello");

// foo.cpp
void Greet(const std::string& name, const std::string& greeting) {  // KHÔNG có default
  ...
}
```

### Overloading

```cpp
int Add(int a, int b) { return a + b; }
double Add(double a, double b) { return a + b; }
std::string Add(const std::string& a, const std::string& b) { return a + b; }

Add(1, 2);              // Gọi int version
Add(1.0, 2.0);          // Gọi double version
Add("foo", "bar");      // Gọi string version
```

Compiler chọn overload dựa trên type của argument. **Không thể overload chỉ dựa trên return type.**

### Pass by value vs by reference

```cpp
void ByValue(std::string s) { ... }        // COPY s khi gọi
void ByRef(std::string& s) { ... }         // s là alias, KHÔNG copy
void ByConstRef(const std::string& s) { ... }  // Alias + không thay đổi
```

**Quy tắc default cho parameter:**

- Type nhỏ (`int`, `bool`, pointer): pass by value.
- Type lớn (`std::string`, `std::vector`, class lớn): pass by `const T&` để tránh copy.
- Khi cần modify: `T&` (non-const reference).

Sẽ học sâu ở Phase 2 Bài 1.

### `inline`

```cpp
inline int Square(int x) { return x * x; }
```

`inline` hint cho compiler: "tôi muốn inline hàm này". Modern compiler thường ignore hint, tự quyết định. Tuy nhiên `inline` còn có vai trò:

- Cho phép định nghĩa hàm trong header mà không vi phạm ODR (One Definition Rule).
- Template function tự động `inline`.

Trong code thường không cần manually thêm `inline` — chỉ khi định nghĩa trong header (vd helper function trong namespace).

## Pattern thực tế

Function cơ bản trong Chromium style:

```cpp
// foo.h
#pragma once

#include <string>

namespace foo {

constexpr int kMaxRetries = 3;

int Add(int a, int b);
std::string FormatName(const std::string& first, const std::string& last);
bool TryParse(const std::string& input, int* out_value);

}  // namespace foo
```

```cpp
// foo.cc
#include "foo.h"

#include <cstdlib>

namespace foo {

int Add(int a, int b) {
  return a + b;
}

std::string FormatName(const std::string& first, const std::string& last) {
  return last + ", " + first;
}

bool TryParse(const std::string& input, int* out_value) {
  if (input.empty()) return false;
  char* end;
  long val = std::strtol(input.c_str(), &end, 10);
  if (*end != '\0') return false;
  *out_value = static_cast<int>(val);
  return true;
}

}  // namespace foo
```

Note:

- Constant naming: `kMaxRetries` (Chromium style).
- Function naming: `CamelCase` (Chromium style).
- "Try" prefix + output pointer: Chromium convention cho hàm có thể fail.
- `const std::string&` cho input string (không copy).

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Uninitialized variable | UB, value rác | Luôn init: `int x = 0;` |
| Signed/unsigned mismatch | Wrap around bất ngờ | `-Wsign-compare`, dùng cùng type |
| `int` overflow | UB (signed) hoặc wrap (unsigned) | Dùng `int64_t` khi cần range lớn |
| Quên `break` trong `switch` | Fallthrough silent | Compiler warn, dùng `[[fallthrough]]` rõ ràng |
| Default argument ở definition | Linker error | Default chỉ ở declaration |
| Postfix `i++` cho iterator | Chậm hơn `++i` | Habit `++i` |
| `auto` cho numeric literal | Type ambiguous | Viết rõ `int x = 0;` |
| Truncate khi convert `double` → `int` | Mất phần thập phân silent | Dùng `static_cast<int>` để rõ ý định |

## Tóm tắt

| Topic | Take-away |
|---|---|
| Integer | Prefer fixed-width (`int32_t`, `size_t`) khi size có ý nghĩa |
| Floating | Default `double`, `float` chỉ khi cần |
| `bool` | `true`/`false`, 1 byte |
| Init | `int x = 0;` hoặc `int x{0};` — đừng để uninitialized |
| `const` | Immutability runtime |
| `constexpr` | Constant compile-time |
| `auto` | Type deduction, dùng khi type dài/không quan trọng |
| `if`/`switch` | C++17 có init-statement; coi chừng fallthrough |
| Range-for | Idiom modern: `for (const auto& x : v)` |
| Function | Default arg ở declaration; const-ref cho input lớn |
| `++i` vs `i++` | Habit `++i` |

## Exercise (optional)

1. Viết function `Factorial(int n)` trả về `int64_t` (vì `int` overflow khi n ≥ 13).
2. Viết function `IsPrime(int n)` dùng for loop, early `return false`.
3. Dùng range-for + structured binding (C++17): iterate `std::vector<std::pair<int, std::string>>` và print từng element.
4. Đọc 10 số từ stdin vào `std::vector<int>`, in tổng và trung bình.

---

**Bài kế tiếp** → [Bài 3: Headers và Scopes](03-headers-and-scopes.md)
