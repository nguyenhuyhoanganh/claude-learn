# Bài 1: Pointers và References

Bài này dạy:
- Pointer: `T*`, lấy địa chỉ (`&`), dereference (`*`), `nullptr`.
- Reference: `T&`, khác pointer thế nào, vì sao có cả 2.
- `const` correctness deep: 4 dạng `const` với pointer, reference.
- Khi nào dùng pointer, khi nào dùng reference.
- Pointer arithmetic — nhắc qua, không khuyến khích modern code.

Kết thúc bài: bạn pass argument by reference đúng cách, hiểu lifetime của object qua pointer/reference, tránh được null deref và dangling reference.

## Tại sao cần pointer và reference?

Trong JavaScript, mọi object được pass "by reference" implicitly (technically by reference value). Trong Python tương tự. Bạn không nghĩ về memory address.

C++ minh bạch: bạn quyết định pass **value** (copy), **pointer** (địa chỉ), hay **reference** (alias). Mỗi lựa chọn có hậu quả về performance và semantic rõ ràng.

```cpp
void ByValue(std::string s);          // Copy string khi gọi — chậm với string lớn
void ByPointer(std::string* s);        // Pass địa chỉ — không copy, có thể null
void ByReference(std::string& s);      // Alias — không copy, không null
```

Hiểu pointer/reference là **prerequisite** cho mọi thứ về sau: class, smart pointer, virtual function, container, callback.

## Pointer cơ bản

```cpp
int x = 42;
int* p = &x;      // p chứa địa chỉ của x

std::cout << x;   // 42
std::cout << p;   // 0x7ffeefbff5ac (địa chỉ — số hex)
std::cout << *p;  // 42 (dereference — đọc giá trị tại địa chỉ p)

*p = 100;
std::cout << x;   // 100 — modify qua pointer
```

| Toán tử | Ý nghĩa |
|---|---|
| `T*` | Type "pointer to T" |
| `&x` | Address-of — lấy địa chỉ của x |
| `*p` | Dereference — truy cập giá trị tại địa chỉ p |
| `nullptr` | Pointer rỗng (modern C++; cũ dùng `NULL` hoặc `0`) |
| `p->member` | Tương đương `(*p).member` cho struct/class |

### `nullptr` — pointer rỗng

```cpp
int* p = nullptr;
if (p != nullptr) {
  *p = 5;  // Không chạy
}

if (p) {           // Idiomatic: pointer convert sang bool, nullptr = false
  *p = 5;
}
```

`nullptr` modern C++ (C++11+). Trước đó dùng `NULL` (define là `0` trong C, ambiguous trong overloading).

**Bẫy lớn**: dereference `nullptr` = UB (thường crash với segfault, nhưng đôi khi không).

```cpp
int* p = nullptr;
int x = *p;  // CRASH (hoặc UB silent)
```

→ **Luôn check trước khi dereference**, hoặc dùng reference (không thể null — sẽ học dưới).

### Pointer to pointer

```cpp
int x = 42;
int* p = &x;
int** pp = &p;     // Pointer to pointer

**pp = 100;        // Modify x qua 2 lớp
std::cout << x;    // 100
```

Hiếm dùng trong modern C++. Xuất hiện chủ yếu trong C API, output parameter cho function.

### Pointer arithmetic

```cpp
int arr[5] = {10, 20, 30, 40, 50};
int* p = arr;       // Trỏ tới phần tử đầu

std::cout << *p;        // 10
std::cout << *(p + 1);  // 20 — tăng pointer 1 element
std::cout << *(p + 2);  // 30

p += 3;
std::cout << *p;        // 40
```

C++ cho phép cộng/trừ pointer với integer, hoặc trừ 2 pointer:

```cpp
int* a = arr + 1;
int* b = arr + 4;
ptrdiff_t diff = b - a;  // = 3
```

**Trong modern C++**: pointer arithmetic chỉ dùng khi cần thao tác array thấp cấp. Thường dùng iterator hoặc `std::span<T>` thay (sẽ học ở Phase 4).

### Dangerous pointer

```cpp
int* GetLocal() {
  int x = 42;
  return &x;  // SAI: trả về địa chỉ của local variable
}             // x destroy ở đây — pointer trả về là dangling

int* p = GetLocal();
std::cout << *p;  // UB — đọc memory đã giải phóng
```

Mọi pointer phải có thời gian sống ≤ object nó trỏ tới. Đây là một trong các nguồn bug lớn nhất của C++.

## Reference

Reference là **alias** — tên khác cho cùng 1 biến.

```cpp
int x = 42;
int& r = x;        // r là alias của x

r = 100;
std::cout << x;    // 100

std::cout << &r;   // Cùng địa chỉ với &x
```

### Reference vs pointer — khác biệt

| Khía cạnh | Pointer `T*` | Reference `T&` |
|---|---|---|
| Có thể null? | Có (`nullptr`) | Không |
| Có thể reseat (point to thing khác)? | Có | Không (1 lần init duy nhất) |
| Phải init? | Không bắt buộc | **Bắt buộc** khi khai báo |
| Cú pháp truy cập | `*p`, `p->member` | Như biến thường (`r`, `r.member`) |
| Có thể array? | Có | Không (có array of reference khó/UB) |
| Lưu trong container? | Có | Không (`std::vector<int&>` không hợp lệ) |

```cpp
int x = 1, y = 2;

int& r = x;
r = y;            // KHÔNG phải reseat r tới y — đây là gán x = y
std::cout << x;   // 2

int* p = &x;
p = &y;           // ĐÚNG nghĩa reseat — p giờ trỏ y
```

Reference 1 lần init = forever bound. Không có "null reference" hợp lệ.

### Bẫy: dangling reference

Tương tự pointer:

```cpp
int& GetLocal() {
  int x = 42;
  return x;  // SAI: trả về reference của local
}

int& r = GetLocal();
std::cout << r;  // UB
```

Reference vẫn có thể dangling. Không "an toàn hơn pointer" về mặt lifetime. Khác biệt là về syntax + null-safety.

## `const` correctness

C++ cho phép apply `const` ở nhiều chỗ. Quy tắc đọc: **đọc từ phải sang trái**.

```cpp
int x = 5;

const int* p1 = &x;       // "p1 is pointer to const int"
int const* p2 = &x;       // tương đương — "p2 is pointer to const int"
int* const p3 = &x;       // "p3 is const pointer to int"
const int* const p4 = &x; // "p4 is const pointer to const int"
```

| Khai báo | Có thể modify pointer? | Có thể modify data? |
|---|---|---|
| `int* p` | ✓ | ✓ |
| `const int* p` (= `int const* p`) | ✓ | ✗ |
| `int* const p` | ✗ | ✓ |
| `const int* const p` | ✗ | ✗ |

### Ví dụ

```cpp
int a = 10, b = 20;

const int* p1 = &a;   // Pointer to const int
// *p1 = 30;          // ERROR: không modify data được
p1 = &b;              // OK: reseat OK

int* const p2 = &a;   // Const pointer to int
*p2 = 30;             // OK: modify data
// p2 = &b;           // ERROR: không reseat được

const int* const p3 = &a;
// *p3 = 30;          // ERROR
// p3 = &b;           // ERROR
```

### `const` reference

```cpp
int x = 5;
const int& r = x;  // r là reference to const int

// r = 10;          // ERROR: không modify qua r
x = 10;             // OK: modify x trực tiếp
std::cout << r;     // 10 — r là alias của x
```

`const&` không có dạng "const reference to const" — reference inherently const (không reseat được), chỉ có "reference to const T" hay "reference to T".

### `const` member function (sẽ học sâu ở Bài 2)

```cpp
class Greeter {
 public:
  // const ở cuối: hàm này không modify state của object
  std::string Greet() const {
    return "Hello, " + name_;
  }

  void SetName(const std::string& name) {  // Không const — modify state
    name_ = name;
  }

 private:
  std::string name_;
};
```

`const Greeter g;` chỉ gọi được `const` method.

## Khi nào dùng pointer, khi nào dùng reference?

**Rule of thumb Chromium / industry:**

✅ **Dùng REFERENCE (`T&` hoặc `const T&`) khi:**

- Function parameter cần access object, **chắc chắn không null**, không reseat.
- Pass type lớn để tránh copy: `const std::string&`, `const std::vector<int>&`.
- Member của class **luôn refer tới object cố định** (hiếm — thường dùng pointer hoặc owned member).

```cpp
void Print(const std::string& s);   // Read-only access, không copy

void IncrementAll(std::vector<int>& v) {  // Modify, không copy
  for (int& x : v) ++x;
}
```

✅ **Dùng POINTER (`T*`) khi:**

- Có thể **null** (vd "optional"): `Bar* bar_or_null_`.
- Cần **reseat** (point sang object khác): callback, observer.
- Lưu trong container: `std::vector<Foo*>`.
- Manual lifetime management: `new`/`delete` (modern: smart pointer).
- Function output parameter (Google C++ Style preference).

```cpp
class Observer {
 public:
  void SetTarget(Foo* target) { target_ = target; }  // Có thể nil

 private:
  Foo* target_ = nullptr;
};

// Output parameter pattern
bool TryParse(const std::string& input, int* out_value);
TryParse("42", &result);
```

### Chromium-specific style

Chromium style guide nói:

- **Input parameter**: `const T&` cho object lớn, `T` cho primitive.
- **Output parameter**: `T*`, gọi với `&`.
- **Required object** (non-null): reference hoặc raw pointer (depends).

```cpp
// Input + output Chromium style
bool FormatName(const std::string& first, const std::string& last,
                std::string* result);

std::string formatted;
if (FormatName("Hoang", "Anh", &formatted)) {
  std::cout << formatted;
}
```

Tại sao Chromium prefer output pointer? Vì khi đọc call site, `&result` rõ ràng là "biến này có thể được modify". Reference `FormatName(first, last, result)` không phân biệt được result là in hay out.

(Một số nơi Chromium dùng output reference khi context rõ ràng — không tuyệt đối.)

## Pattern thực tế trong Chromium

```cpp
// chrome/browser/foo/foo_helper.h
#pragma once

#include <string>

namespace foo {

class FooHelper {
 public:
  // Reference cho input
  void SetName(const std::string& name);

  // Reference return (read-only access tới member)
  const std::string& name() const { return name_; }

  // Output via pointer
  bool TryParseInput(const std::string& input, int* result) const;

 private:
  std::string name_;
};

}  // namespace foo
```

Note:

- Setter dùng `const std::string&` để input (không copy).
- Getter trả về `const std::string&` để read-only access (không copy, không modify).
- Function "Try*" có output qua pointer.

## Pointer vs reference trong template

Hiếm gặp ở mức beginner nhưng đáng biết: `std::vector<T&>` không hợp lệ vì reference không phải "true type" (không có sizeof rõ ràng cho purpose của container). Dùng `std::vector<T*>` hoặc `std::vector<std::reference_wrapper<T>>`.

```cpp
std::vector<int&> v;  // ERROR
std::vector<int*> v;  // OK
std::vector<std::reference_wrapper<int>> v;  // OK nhưng verbose
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Dereference `nullptr` | UB / crash | Check `if (p)` trước; prefer reference khi không null |
| Return reference/pointer tới local variable | Dangling — UB | Trả về copy (value) hoặc by smart pointer |
| Pointer arithmetic out of bound | UB | Dùng iterator, `std::span`, container API |
| Đọc `const` từ trái sang phải | Hiểu sai const | Đọc từ phải: `int const* p` = "p is pointer to const int" |
| Quên `*` khi dereference | Print address thay value | Đọc kỹ: `std::cout << p` (address) vs `std::cout << *p` (value) |
| `int*&` (reference to pointer) — confusing | Code khó đọc | Có nhu cầu thật mới dùng |
| `T&` parameter rồi pass `&x` (sai cú pháp) | Compile error | `T*` parameter → call `f(&x)`; `T&` parameter → call `f(x)` |
| Default arg `T* p = nullptr` rồi quên check | Crash | Document clearly hoặc dùng `std::optional<T>` |

## Tóm tắt

| Concept | Take-away |
|---|---|
| `T*` | Pointer — có thể null, reseat, lưu container |
| `&x` | Address-of |
| `*p` | Dereference |
| `nullptr` | Null pointer (modern C++) |
| `T&` | Reference — alias, không null, không reseat |
| `const T*` / `T const*` | Pointer to const data |
| `T* const` | Const pointer (không reseat) |
| `const T&` | Reference to const — phổ biến nhất cho input |
| Input parameter | `const T&` cho large type, `T` cho primitive |
| Output parameter | `T*` (Chromium style), call site dùng `&result` |

## Exercise (optional)

1. Viết `void Swap(int* a, int* b)` swap 2 số qua pointer. Test với `Swap(&x, &y)`.
2. Viết overload `void Swap(int& a, int& b)` — version reference. So sánh call site.
3. Viết `const int* FindFirst(const std::vector<int>& v, int target)` — return pointer tới element, hoặc `nullptr` nếu không tìm thấy.
4. Tạo function `bool TryParse(const std::string& s, int* out)` — return success, output via pointer.

---

**Bài kế tiếp** → [Bài 2: Classes và Lifetime](02-classes-and-lifetime.md)
