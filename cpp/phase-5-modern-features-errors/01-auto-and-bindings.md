# Bài 1: auto và Structured Binding

Bài này dạy:
- `auto`: type deduction trong khai báo.
- `decltype`: lấy type của expression mà không evaluate.
- `auto&`, `auto&&`, `auto*` — type modifier với auto.
- Structured binding (C++17): destructure pair, tuple, struct.
- Range-for nâng cao với structured binding.
- Initializer list `{}` và uniform initialization.

Kết thúc bài: bạn dùng `auto` đúng chỗ (không lạm dụng), destructure container hiệu quả, hiểu sự khác biệt giữa `auto`, `auto&`, `auto&&`.

## Tại sao `auto`?

C++ static-typed, mọi biến phải có type. Nhưng đôi khi type rất dài:

```cpp
std::unordered_map<std::string, std::vector<std::pair<int, std::string>>> m;

// Iterate — type của iterator dài kinh khủng
for (std::unordered_map<std::string, std::vector<std::pair<int, std::string>>>::iterator
     it = m.begin(); it != m.end(); ++it) {
  // ...
}

// Với auto: gọn
for (auto it = m.begin(); it != m.end(); ++it) {
  // ...
}
```

`auto` báo compiler "tự suy type từ initializer". Compile-time, không có runtime cost.

## Cú pháp cơ bản

```cpp
auto x = 5;           // int
auto y = 3.14;        // double
auto s = "hello";     // const char*  (literal là char array, decay thành const char*)
auto s2 = std::string("hi");   // std::string

auto v = std::vector<int>{1, 2, 3};   // std::vector<int>
```

### Phải có initializer

```cpp
auto x;     // ERROR — không có initializer, compiler không suy được
auto x = 5; // OK
```

### Class member

C++11 — không cho `auto` cho non-static member:

```cpp
class Foo {
  auto x_ = 5;  // ERROR pre-C++17, không cho phép
  static const auto y_ = 10;  // OK (static const inline-init)
};
```

C++17+ cho phép `static inline`:

```cpp
class Foo {
  static inline auto y_ = 10;
};
```

## `auto&` — reference

```cpp
std::vector<int> v = {1, 2, 3};

for (auto x : v) { x *= 2; }       // x là COPY — không modify v
for (auto& x : v) { x *= 2; }      // x là reference — modify v
for (const auto& x : v) { ... }    // const reference — read-only, no copy
```

**Phổ biến trong Chromium**:

```cpp
const auto& name = user.GetName();   // Read-only reference, no copy
```

### `auto*`

```cpp
int* p = ...;
auto p2 = p;       // p2 là int*
auto* p3 = p;      // p3 là int* — explicit pointer
```

`auto*` document rõ rằng đây là pointer. Compiler error nếu RHS không phải pointer.

### `auto&&` — forwarding reference

Trong template context, `auto&&` là forwarding reference:

```cpp
auto&& x = expr;
// Nếu expr là lvalue: x là T&
// Nếu expr là rvalue: x là T&&
```

Trong range-for:

```cpp
for (auto&& x : container) { ... }
```

Linh hoạt nhất — work với mọi container, kể cả những container trả proxy reference (vd `std::vector<bool>`).

Beginner: dùng `for (auto& x : container)` đủ tốt. `auto&&` dành cho advanced.

## Khi nào dùng `auto`?

✅ **DÙNG:**

```cpp
// Type dài, không informational
auto it = map.find("key");                        // GOOD
auto user = GetUserFromDatabase();                // GOOD

// Range-for
for (const auto& kv : map) { ... }                // GOOD

// Lambda — phải dùng auto (lambda type unnamed)
auto cb = [](int x) { return x * 2; };            // GOOD
```

❌ **KHÔNG dùng:**

```cpp
auto x = 0;       // BAD — int? long? size_t?
int x = 0;        // GOOD — clear

auto count = users.size();   // BAD — count là size_t? int?
size_t count = users.size(); // GOOD

auto result = Compute();     // BAD — caller không biết return type
double result = Compute();   // GOOD
```

**Rule of thumb**: `auto` khi type không quan trọng cho người đọc (dài, hoặc obvious từ RHS). Explicit type khi type là thông tin có ý nghĩa.

## `decltype`

`decltype(expr)` = "type của expression mà không evaluate":

```cpp
int x = 5;
decltype(x) y = 10;        // y is int

std::vector<int> v;
decltype(v.size()) n = 0;  // n is size_t (return type của size())

auto Compute() {
  return 3.14;
}
decltype(Compute()) result = ...;  // double — không thực sự gọi Compute()
```

### `decltype(auto)` (C++14+)

```cpp
template <typename Container>
decltype(auto) GetFirst(Container& c) {
  return c.front();    // Preserve ref-ness (T& if container::front() returns ref)
}
```

`decltype(auto)` giữ category lvalue/rvalue của return expression. Khác với `auto` — auto strip reference.

```cpp
int x = 5;
int& r = x;

auto a = r;            // a là int (strip ref)
decltype(auto) b = r;  // b là int&
```

Beginner: ít dùng. Quan trọng cho generic library code.

## Structured binding (C++17)

```cpp
std::pair<int, std::string> p = {42, "hello"};

auto [num, str] = p;
std::cout << num << ", " << str;   // 42, hello
```

`auto [a, b] = expr` destructure expression thành named variables. Tương tự JS:

```javascript
const { num, str } = obj;
const [a, b] = arr;
```

### Với `std::tuple`

```cpp
std::tuple<int, double, std::string> t = {1, 3.14, "test"};
auto [i, d, s] = t;
```

### Với struct

```cpp
struct Point {
  int x, y;
};

Point p = {1, 2};
auto [x, y] = p;
// Equivalent to: int x = p.x; int y = p.y;
```

Compiler destructure dựa trên thứ tự member.

### Với map iteration

```cpp
std::map<std::string, int> ages;
ages["Alice"] = 30;
ages["Bob"] = 25;

for (const auto& [name, age] : ages) {
  std::cout << name << ": " << age << "\n";
}
```

So với pre-C++17:

```cpp
for (const auto& kv : ages) {
  std::cout << kv.first << ": " << kv.second << "\n";
}
```

Structured binding gọn hơn nhiều.

### Reference + structured binding

```cpp
std::pair<int, std::string> p = {1, "hello"};

auto [a, b] = p;          // Copies
auto& [c, d] = p;         // References — modify p
const auto& [e, f] = p;   // Const references
```

### Return multiple values từ function

```cpp
std::tuple<int, double, bool> Compute() {
  return {42, 3.14, true};
}

auto [count, ratio, ok] = Compute();
```

Pattern phổ biến: function trả `std::pair<bool, T>` hoặc `std::tuple<...>` thay vì output parameter.

```cpp
std::pair<bool, int> TryParse(const std::string& s) {
  // ...
  return {true, 42};
}

auto [ok, value] = TryParse("42");
if (ok) {
  std::cout << value;
}
```

### Limitations

- Số binding phải khớp với số element của source.
- Không thể skip element (Python: `_`; C++: phải nhận hết).

## Initializer list `{}` — uniform initialization

C++11+ cho phép init mọi loại type bằng `{}`:

```cpp
int a{5};
double b{3.14};
std::string s{"hello"};

std::vector<int> v{1, 2, 3};
std::map<std::string, int> m{{"Alice", 30}, {"Bob", 25}};

Point p{1, 2};   // Aggregate init for struct
```

### Bắt narrowing conversion

```cpp
int x = 3.14;        // OK, truncate silent
int y{3.14};         // ERROR — narrowing conversion not allowed in {}
int z = {3.14};      // ERROR (with `=`, also tight check)
```

→ `{}` an toàn hơn `=`.

### Vector quirk

```cpp
std::vector<int> v1(5, 10);   // Size 5, all 10: {10, 10, 10, 10, 10}
std::vector<int> v2{5, 10};   // 2 elements: {5, 10} — initializer list takes priority!
```

→ Cẩn thận khi dùng `{}` với vector + 2-3 element. Có thể bất ngờ.

### `std::initializer_list<T>`

```cpp
class MyList {
 public:
  MyList(std::initializer_list<int> init) {
    for (int x : init) data_.push_back(x);
  }

 private:
  std::vector<int> data_;
};

MyList l = {1, 2, 3, 4, 5};
```

`std::vector`, `std::map`, etc. có constructor nhận `initializer_list`.

### "Most vexing parse" và `{}`

```cpp
std::vector<int> v();  // KHÔNG phải khai biến — đây là function declaration!
                        // v là function trả vector<int>, không có argument

std::vector<int> v{};  // OK — empty vector
std::vector<int> v;    // OK — empty vector
```

→ Dùng `{}` để tránh ambiguity.

## Pattern thực tế

### Iterate với destructuring

```cpp
std::unordered_map<std::string, std::vector<int>> data;

for (const auto& [key, values] : data) {
  std::cout << key << ": " << values.size() << " items\n";
}
```

### Return + destructure

```cpp
std::tuple<bool, std::string, int> ParseLine(const std::string& line) {
  // ...
  return {true, "name", 42};
}

if (auto [ok, name, value] = ParseLine(line); ok) {
  // C++17: init-statement trong if
  std::cout << name << " = " << value;
}
```

### Auto for iterator

```cpp
auto it = container.find("key");
if (it != container.end()) {
  std::cout << it->second;
}
```

### Forward type via auto

```cpp
template <typename Container>
void Process(Container&& c) {
  for (auto&& item : c) {
    Use(item);
  }
}
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| `auto x = 0;` ambiguous | Reader không biết type | Explicit `int x = 0;` cho POD |
| `auto s = "hello";` | `s` là `const char*`, không `std::string` | `auto s = std::string("hello");` hoặc explicit |
| `auto x = vec;` copy entire vector | Performance | `const auto& x = vec;` cho read-only |
| Structured binding count mismatch | Compile error | Match số element |
| `std::vector<int> v(5, 10)` vs `v{5, 10}` | Khác hành vi | Dùng explicit constructor cho vector size+default |
| Narrowing trong `{}` | Compile error | Dùng `static_cast<int>(3.14)` explicit |
| `auto&` cho rvalue | OK nhưng tạo lifetime confusion | Hiểu rõ category lvalue/rvalue |

## Tóm tắt

| Feature | Take-away |
|---|---|
| `auto` | Type deduction; dùng khi type dài/không informational |
| `auto&` / `const auto&` | Reference deduction; tránh copy |
| `auto*` | Pointer deduction explicit |
| `auto&&` | Forwarding reference (template-like) |
| `decltype(expr)` | Type của expression không evaluate |
| `decltype(auto)` | Preserve ref category trong return |
| Structured binding | Destructure pair/tuple/struct |
| `{}` init | Uniform initialization; bắt narrowing |

## Analogy với JS/TypeScript

| JS/TS | C++ |
|---|---|
| `const x = 5;` (inferred) | `auto x = 5;` |
| `let arr: number[] = []` | `std::vector<int> v;` (explicit type) |
| `const { a, b } = obj;` | `auto [a, b] = obj;` (structured binding) |
| `const [x, y] = arr;` | `auto [x, y] = std::tie(...);` or pair |
| `for (const item of arr)` | `for (const auto& item : container)` |

TypeScript có type inference mạnh hơn (gần với `auto`). JS không có static type.

## Exercise (optional)

1. Refactor function loop iterator manual sang `auto` + range-for.
2. Tạo function `std::tuple<bool, std::string, int> GetInfo(int id)`. Gọi và destructure.
3. Dùng structured binding để iterate `std::map<std::string, std::vector<int>>` print key + size.
4. Verify narrowing: `int x{3.14}` compile fail. `int x = 3.14` compile pass (warn). Hiểu vì sao.

---

**Bài kế tiếp** → [Bài 2: optional, variant, tuple](02-optional-variant-tuple.md)
