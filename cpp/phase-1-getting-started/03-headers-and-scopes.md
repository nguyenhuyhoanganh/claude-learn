# Bài 3: Headers và Scopes

Bài này dạy:
- Header guard: `#pragma once` vs `#ifndef`.
- `.h` vs `.cpp` deep: One Definition Rule (ODR), khi nào define trong header.
- Forward declaration: giảm dependency, tránh circular include.
- Namespace: declaration, nested, `using`, anonymous namespace.
- Scope và lifetime: block, function, file, class, namespace.
- Storage duration: automatic, static, dynamic, thread-local.
- Linkage: internal vs external.

Kết thúc bài: bạn tổ chức được project nhiều file, hiểu vì sao function/variable scope nằm ở đâu, tránh được lỗi multiple-definition và circular dependency.

## Header guard

Mỗi `.cpp` có thể include 1 header **gián tiếp nhiều lần**. Ví dụ:

```cpp
// main.cpp
#include "a.h"   // a.h include "common.h"
#include "b.h"   // b.h include "common.h"
```

Sau preprocess, `common.h` xuất hiện 2 lần trong `main.cpp` → multiple definition error.

**Giải pháp**: header guard.

### `#pragma once` (modern, prefer)

```cpp
// common.h
#pragma once

void Util();
int Compute();
```

`#pragma once` báo compiler "chỉ include file này 1 lần per translation unit". Đơn giản, không thừa.

→ **Chromium dùng `#pragma once` cho mọi header.** Không cần dùng `#ifndef` style.

### `#ifndef` / `#define` / `#endif` (traditional)

```cpp
// common.h
#ifndef COMMON_H_
#define COMMON_H_

void Util();
int Compute();

#endif  // COMMON_H_
```

Nguyên lý: lần include đầu tiên `COMMON_H_` chưa define → vào block, define `COMMON_H_`. Lần thứ 2, đã define → block bị skip.

Hai phương pháp tương đương về kết quả. `#pragma once` ngắn hơn và không cần đặt tên guard duy nhất (đỡ collision khi 2 file có cùng base name).

**Chromium convention (cả 2 từng được dùng)**: hiện tại là `#pragma once`.

## One Definition Rule (ODR)

Quy tắc cốt lõi của C++:

> Mọi function (non-inline), non-inline variable, hoặc class member function (non-inline) chỉ được **DEFINE 1 lần** trên toàn binary.

Vi phạm ODR → linker error "multiple definition" hoặc UB silent.

### Khai báo (declaration) vs định nghĩa (definition)

```cpp
// Declaration — có thể lặp nhiều lần
int Add(int, int);             // Declaration của function
extern int counter;            // Declaration của variable
class Greeter;                 // Forward declaration của class

// Definition — chỉ 1 lần
int Add(int a, int b) { return a + b; }  // Body
int counter = 0;                          // Khởi tạo
class Greeter {                           // Full class definition
  ...
};
```

→ Header file thường chứa **declaration only**. Source file chứa **definition**.

### Exception: được phép define trong header

Một số thứ được phép define trong header (compiler/linker hiểu là "cùng 1 definition"):

1. **`inline` function**:

   ```cpp
   inline int Square(int x) { return x * x; }
   ```

2. **`constexpr` function** (implicitly inline):

   ```cpp
   constexpr int Cube(int x) { return x * x * x; }
   ```

3. **Template** (bắt buộc define ở header vì compiler cần body khi instantiate):

   ```cpp
   template <typename T>
   T Max(T a, T b) { return a > b ? a : b; }
   ```

4. **`class`/`struct` member function defined inline within class body**:

   ```cpp
   class Greeter {
    public:
     void Greet() { std::cout << "Hi"; }  // Implicitly inline
   };
   ```

5. **`inline` variable** (C++17+):

   ```cpp
   inline constexpr int kBufferSize = 1024;
   ```

→ Tất cả các trường hợp khác: **definition phải ở `.cpp`**.

### Bẫy: define non-inline function trong header

```cpp
// bad.h
#pragma once
int Add(int a, int b) { return a + b; }  // SAI: not inline, define in header
```

Nếu `bad.h` được include từ 2 file `.cpp` (vd `main.cpp` và `util.cpp`), cả 2 file đều có `Add` body. Linker thấy 2 definition → error:

```
multiple definition of `Add(int, int)'
```

Fix: chuyển định nghĩa sang `.cpp`, chỉ giữ declaration trong `.h`.

## Forward declaration

Khi `Foo` cần biết về `Bar` nhưng không cần full definition, dùng **forward declaration**:

```cpp
// foo.h
#pragma once

class Bar;  // Forward declaration — Bar tồn tại, chưa biết detail

class Foo {
 public:
  void Process(Bar* bar);  // OK — pointer/reference không cần full type
  void Apply(const Bar& bar);  // OK — reference

 private:
  Bar* bar_ptr_ = nullptr;  // OK — pointer
};
```

```cpp
// foo.cpp
#include "foo.h"
#include "bar.h"  // Full definition cần ở đây để gọi method của Bar

void Foo::Process(Bar* bar) {
  bar->DoSomething();  // Cần full Bar definition
}
```

### Khi nào dùng forward declaration?

✅ **Dùng khi:**

- Pointer (`T*`) hoặc reference (`T&`) tới type.
- Function signature (parameter type, return type) — không cần body.
- Tránh circular include.
- Giảm dependency → build nhanh hơn (1 file nhỏ thay đổi không trigger recompile cả tree).

❌ **KHÔNG dùng được khi:**

- Inheritance: `class Foo : public Bar` — cần full Bar.
- Member by value: `Bar bar_member;` — cần biết size của Bar.
- Gọi method/access member: `bar->Method()` — cần body.
- `sizeof(T)`, `delete T`.

### Circular include — vì sao và fix

```cpp
// a.h
#include "b.h"
class A {
  B* b;
};

// b.h
#include "a.h"
class B {
  A* a;
};
```

`a.h` include `b.h` include `a.h` include `b.h` ... với guard thì stop, nhưng compile sẽ fail vì khi compile `a.h`, `B` chưa defined.

Fix: dùng forward declaration thay full include:

```cpp
// a.h
#pragma once
class B;  // Forward
class A {
  B* b;
};

// b.h
#pragma once
class A;  // Forward
class B {
  A* a;
};
```

Khi method của `A` thực sự gọi method của `B`, include `b.h` trong `a.cpp`:

```cpp
// a.cpp
#include "a.h"
#include "b.h"  // Cần full B ở đây
void A::DoSomething() {
  b->Method();
}
```

→ **Rule Chromium**: header dùng forward declaration aggressive, full include chỉ trong `.cc`. Đây là điều quan trọng cho build performance khi codebase lớn.

## Namespace

Namespace giải quyết vấn đề **đặt tên trùng lặp**: 2 thư viện đều có hàm `Log()` → conflict. Namespace tách biệt scope.

### Khai báo

```cpp
namespace base {

void Log(const std::string& msg);

class FilePath {
 public:
  FilePath(const std::string& path);
};

}  // namespace base
```

Sử dụng:

```cpp
base::Log("Hello");

base::FilePath path("/tmp/foo");
```

### Nested namespace

```cpp
namespace base {
namespace internal {

void Helper();

}  // namespace internal
}  // namespace base

// Gọi
base::internal::Helper();
```

C++17 cho phép cú pháp gọn:

```cpp
namespace base::internal {

void Helper();

}  // namespace base::internal
```

→ Chromium dùng cú pháp C++17 này.

### `using` directive vs `using` declaration

```cpp
// using directive — đưa TẤT CẢ namespace vào scope hiện tại
using namespace std;  // ÁC! Mất hết benefit của namespace

cout << "..." << endl;  // Không cần std::

// using declaration — đưa 1 symbol cụ thể vào scope
using std::cout;
using std::endl;

cout << "..." << endl;  // OK, các thứ khác vẫn cần std::
```

**Rule**:

- **KHÔNG BAO GIỜ** dùng `using namespace std;` ở global scope hoặc trong header. Nó pollute namespace cho mọi file include.
- `using declaration` (chỉ specific symbol) OK trong narrow scope (function body).
- Trong implementation file (`.cpp`), `using namespace` OK ở function/block scope nhưng vẫn nên tránh.

### Anonymous namespace — alternative cho `static`

```cpp
// foo.cpp
#include "foo.h"

namespace {

// Helper chỉ dùng trong foo.cpp này
void InternalHelper() { ... }

constexpr int kInternalLimit = 100;

}  // namespace

void Foo() {
  InternalHelper();
  ...
}
```

Anonymous namespace giới hạn linkage tới **file hiện tại** (translation unit). Tương đương `static` ở scope file nhưng modern hơn:

```cpp
// Traditional C-style
static void InternalHelper() { ... }
static constexpr int kInternalLimit = 100;

// Modern C++ — prefer
namespace {
void InternalHelper() { ... }
constexpr int kInternalLimit = 100;
}  // namespace
```

→ Chromium thường dùng anonymous namespace trong `.cc` để bọc helper internal.

### Pattern Chromium phổ biến

```cpp
// chrome/browser/foo/foo_helper.h
#pragma once

#include <string>

namespace foo {

bool ParseInput(const std::string& input, int* result);

}  // namespace foo
```

```cpp
// chrome/browser/foo/foo_helper.cc
#include "chrome/browser/foo/foo_helper.h"

#include "base/strings/string_number_conversions.h"

namespace foo {
namespace {

// Helper chỉ dùng trong file này
constexpr int kMaxValue = 1000;

bool IsValid(int x) {
  return x > 0 && x < kMaxValue;
}

}  // namespace

bool ParseInput(const std::string& input, int* result) {
  int parsed;
  if (!base::StringToInt(input, &parsed)) {
    return false;
  }
  if (!IsValid(parsed)) {
    return false;
  }
  *result = parsed;
  return true;
}

}  // namespace foo
```

Note convention:

- `}  // namespace foo` — comment kết namespace cho dễ đọc với nested deep.
- `}  // namespace` cho anonymous.
- Empty line giữa nested namespace closing.

## Scope

Scope = vùng code mà 1 tên (variable, function, type) **có thể được nhắc đến**.

### 5 loại scope chính

1. **Block scope** — trong `{ ... }`.
2. **Function scope** — label trong function (label cho `goto`, hiếm dùng).
3. **Function parameter scope** — parameter của function.
4. **Namespace scope** — trong namespace (kể cả global).
5. **Class scope** — member của class.

### Block scope ví dụ

```cpp
void Foo() {
  int x = 1;        // x trong block của Foo

  {
    int y = 2;      // y trong inner block
    std::cout << x; // OK — x visible
  }
  // y out of scope ở đây

  std::cout << y;   // ERROR: y out of scope
}
```

### Shadowing

```cpp
int x = 10;  // Global

void Foo() {
  int x = 20;  // Local — shadow global

  {
    int x = 30;  // Inner — shadow local
    std::cout << x;  // 30
  }

  std::cout << x;     // 20
  std::cout << ::x;   // 10 (global, qua scope resolution operator)
}
```

Shadowing OK syntactically nhưng dễ bug. Compiler warn với `-Wshadow`.

### `if`/`for`/`while` init-statement scope

```cpp
for (int i = 0; i < 10; ++i) {
  // i visible
}
// i out of scope

if (auto* p = Find(); p != nullptr) {
  // p visible
}
// p out of scope
```

## Storage duration và lifetime

Mỗi variable có **storage duration** — vùng đời.

### Automatic (default cho local)

```cpp
void Foo() {
  int x = 5;  // Automatic — sống từ đây tới hết function
}             // x destroyed
```

Sống trên **stack**. Tự động cleanup khi out of scope.

### Static

```cpp
void Counter() {
  static int count = 0;  // Static — chỉ init 1 lần khi function lần đầu gọi
  ++count;
  std::cout << count;
}

Counter();  // 1
Counter();  // 2
Counter();  // 3
```

`static` ở scope function = "biến chỉ tồn tại trong scope function nhưng **sống suốt lifetime của program**". Init lần đầu được gọi.

```cpp
// Ở scope file/namespace — global lifetime
namespace {
static int s_counter = 0;        // Internal linkage + static lifetime
}

int g_counter = 0;               // External linkage + static lifetime
```

Variable global / namespace-scope có static lifetime — sinh trước `main()`, destroy sau `main()`.

### Dynamic

```cpp
int* p = new int(5);    // Cấp phát trên heap
// ... sử dụng p ...
delete p;               // Phải tự deallocate
```

Manual `new`/`delete` — KHÔNG khuyến khích. Modern C++ dùng smart pointer (Phase 3) để tự động manage.

### Thread-local

```cpp
thread_local int tls_value = 0;
```

Mỗi thread có 1 instance riêng. Sẽ học ở Phase 6.

## Linkage

Linkage = symbol có visible ra ngoài translation unit (file `.cpp`) không.

### External linkage (default cho function, class)

```cpp
// a.cpp
int Add(int a, int b) { return a + b; }   // External — visible từ file khác

// b.cpp
int Add(int, int);  // Declaration
Add(1, 2);           // OK, linker resolve
```

### Internal linkage

Internal = chỉ visible trong file hiện tại.

```cpp
// a.cpp
static void Helper() { ... }    // Internal (C-style)

namespace {
void Helper2() { ... }          // Internal (modern, prefer)
}

// b.cpp
void Helper();   // Declaration — linker KHÔNG tìm thấy Helper của a.cpp
```

→ Anonymous namespace = internal linkage. Tốt cho hide implementation detail.

### Global variable linkage

```cpp
// a.cpp
int g_counter = 0;              // External linkage default
extern int g_counter;           // Declaration ở header — báo "có cái này, externally linked"

static int s_internal = 0;      // Internal linkage

namespace {
int s_internal_modern = 0;      // Internal linkage modern
}
```

**Chromium prefer**: global variable rất hạn chế (chỉ với constants). Anonymous namespace cho file-local helpers.

## Pattern hoàn chỉnh — example

`logger.h`:

```cpp
#pragma once

#include <string>

namespace mylib {

// Public API
void Log(const std::string& msg);
void SetVerbose(bool verbose);

}  // namespace mylib
```

`logger.cpp`:

```cpp
#include "logger.h"

#include <iostream>
#include <mutex>

namespace mylib {

namespace {

// File-local state
std::mutex g_log_mutex;
bool g_verbose = false;
int g_call_count = 0;

// File-local helper
void PrintTimestamp() {
  // ...
}

}  // namespace

void Log(const std::string& msg) {
  std::lock_guard<std::mutex> lock(g_log_mutex);
  ++g_call_count;
  if (g_verbose) {
    PrintTimestamp();
  }
  std::cout << msg << std::endl;
}

void SetVerbose(bool verbose) {
  std::lock_guard<std::mutex> lock(g_log_mutex);
  g_verbose = verbose;
}

}  // namespace mylib
```

Note:

- Header chỉ chứa API public.
- `.cpp` có anonymous namespace bọc helper + state.
- Implementation chi tiết không leak qua header.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Quên `#pragma once` | Multiple definition error | Mọi header có `#pragma once` |
| Define non-inline function trong header | Multiple definition error | Define trong `.cpp` |
| `using namespace std;` global trong header | Pollute namespace mọi file | Đừng làm |
| Circular include | Compile fail | Forward declaration trong header |
| Shadow variable cùng tên | Bug khó debug | `-Wshadow` warning |
| Static initialization order | UB nếu 2 global từ 2 file phụ thuộc nhau | Tránh global mutable state, dùng singleton + lazy init |
| Forward declare type rồi instantiate by value | Compile fail | Phải full include nếu cần size |
| Anonymous namespace trong header | Symbol khác instance mỗi file include | Anonymous namespace chỉ trong `.cpp` |

## Tóm tắt

| Concept | Take-away |
|---|---|
| `#pragma once` | Modern header guard, mọi header dùng |
| ODR | Define 1 lần per binary (trừ inline, template, etc.) |
| Header = declaration, `.cpp` = definition | Trừ inline/template ở header |
| Forward declaration | Pointer/reference/signature thì OK; member by value thì cần full include |
| Namespace | Tách biệt scope, tránh trùng tên |
| Anonymous namespace | File-local linkage, prefer over `static` |
| Storage duration | Automatic (stack), static (lifetime), dynamic (heap), thread |
| Linkage | External (default function) vs internal (static, anon namespace) |
| `using namespace` | Tránh global; OK trong narrow scope |

## Exercise (optional)

1. Tạo project có circular dependency (A include B, B include A). Fix bằng forward declaration.
2. Tạo helper function chỉ dùng trong 1 file. Đặt trong anonymous namespace. Try đặt trong header xem có lỗi gì.
3. Define 1 function inline trong header. Include header từ 2 `.cpp`. Compile + link — không lỗi (vì inline). Bỏ `inline` → multiple definition error.
4. Có 2 file `.cpp` đều define static `int counter = 0;` ở scope file. Print counter từ mỗi file — sẽ thấy chúng độc lập (mỗi file 1 instance).

---

**Phase kế** → [Phase 2: Pointers, References, OOP](../phase-2-pointers-references-oop/01-pointers-and-references.md)
