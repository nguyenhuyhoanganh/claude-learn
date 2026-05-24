# Bài 1: Hello World và Toolchain

Bài này dạy:
- Cách compiler C++ biến `.cpp` thành executable.
- 4 stage của build cycle: preprocess → compile → assemble → link.
- Header (`.h`) vs source (`.cpp`) — vì sao C++ tách 2.
- `#include` quote `""` vs angle `<>`.
- Compiler flags quan trọng (`-std=c++17`, `-Wall`, `-g`).
- Cấu trúc 1 project nhỏ với nhiều file.

Kết thúc bài này, bạn compile và chạy được chương trình C++ multi-file từ command line, hiểu được error message cơ bản của compiler.

## Tại sao hiểu toolchain?

Trong Python hay JavaScript, bạn viết `python script.py` hay `node app.js` là chạy. Source code là thứ runtime đọc trực tiếp.

C++ khác hẳn: **source code phải được biến thành machine code** trước khi chạy. Quá trình đó gọi là **compile**. Bạn sẽ có 1 file binary (`a.out`, `chrome.exe`), chạy độc lập, không cần source code.

Hậu quả thực tế:

- Lỗi syntax phát hiện lúc compile, không phải runtime.
- Compiler tạo ra **rất nhiều** error message dài — học cách đọc chúng quan trọng hơn bạn nghĩ.
- Code phải khai báo trước khi dùng — không có "import dynamic", "require at runtime" như JS.
- Có concept "header" và "source" — JS/Python không có.

Hiểu được compile cycle giúp debug nhanh hơn rất nhiều khi gặp link error, undefined reference, multiple definition, missing symbol.

## Chương trình C++ tối thiểu

Tạo file `hello.cpp`:

```cpp
#include <iostream>

int main() {
  std::cout << "Hello, C++!" << std::endl;
  return 0;
}
```

Compile và chạy:

```bash
$ g++ -std=c++17 -Wall hello.cpp -o hello
$ ./hello
Hello, C++!
```

Đã có file binary `hello`. Bạn có thể copy nó sang máy khác cùng OS/architecture, nó vẫn chạy được mà không cần `g++` hay source code.

### Mỗi phần trong `hello.cpp` làm gì

```cpp
#include <iostream>
```

Đây là **preprocessor directive** (bắt đầu bằng `#`). Nó nói: "thay dòng này bằng toàn bộ nội dung của file `iostream`". `<iostream>` cung cấp `std::cout`, `std::cin`, `std::endl`. Preprocessor đọc nội dung file kia rồi paste trực tiếp vào — y hệt như bạn copy-paste thủ công.

```cpp
int main() {
  ...
  return 0;
}
```

`main` là **entry point** — hàm đầu tiên chạy khi binary được invoke. Phải tên đúng `main`, return type `int`. Trả về `0` nghĩa "thành công"; bất kỳ giá trị khác `0` là "lỗi" — convention của shell.

```cpp
std::cout << "Hello, C++!" << std::endl;
```

`std::cout` là output stream tới stdout. Toán tử `<<` (gọi là "insertion operator") đẩy giá trị vào stream. `std::endl` thêm newline + flush buffer. `std::` là namespace prefix (sẽ học chi tiết ở Bài 3) — nó nói "lấy `cout` từ namespace `std`".

### Phân tích lệnh compile

```
g++ -std=c++17 -Wall hello.cpp -o hello
```

| Phần | Ý nghĩa |
|---|---|
| `g++` | Compiler. Trên macOS thường là alias tới `clang++`. Linux thường là GCC. |
| `-std=c++17` | Dùng C++17 standard. Mặc định của một số phiên bản cũ là C++14 hoặc cũ hơn. **Luôn specify.** |
| `-Wall` | Bật cảnh báo phổ biến ("warning all"). Sẽ thấy warning về biến không dùng, so sánh signed/unsigned, etc. |
| `hello.cpp` | Source file input. |
| `-o hello` | Output filename = `hello`. Nếu không có, mặc định là `a.out` (cũ kỹ, đừng để mặc định). |

Flags khác hay dùng:

| Flag | Ý nghĩa |
|---|---|
| `-Wextra` | Cảnh báo thêm. Khuyến khích. |
| `-Wpedantic` | Báo lỗi khi dùng GNU extension không chuẩn. |
| `-g` | Embed debug info (cho gdb/lldb). |
| `-O0` | Không optimize — debug dễ hơn, biến không bị loại bỏ. |
| `-O2` | Optimize trung bình — release build. |
| `-O3` | Optimize tối đa (có khi chậm compile, có khi binary lớn). |
| `-fsanitize=address` | Bật AddressSanitizer (sẽ học ở Phase 6). |
| `-c` | Chỉ compile, không link — output object file. |
| `-I/path/to/include` | Thêm include path. |
| `-L/path/to/lib -lname` | Link với library `libname.a` hoặc `libname.so`. |

**Khuyến nghị cho dev hàng ngày:**

```bash
g++ -std=c++17 -Wall -Wextra -g -O0 hello.cpp -o hello
```

Đủ warnings, có debug info, không optimize. Khi build release: đổi `-O0` thành `-O2`.

## Build cycle: 4 giai đoạn

Khi bạn chạy `g++ hello.cpp -o hello`, compiler thực ra làm 4 bước. Hiểu được 4 bước này giúp debug error nhanh hơn.

```text
hello.cpp
    │
    │  1. Preprocessor (cpp)
    │     - Expand #include
    │     - Expand #define
    │     - Strip comment
    ▼
hello.i           ← Translation unit (file đã preprocess, hàng nghìn dòng)
    │
    │  2. Compiler (g++ -S)
    │     - Parse C++
    │     - Generate assembly
    ▼
hello.s           ← Assembly text
    │
    │  3. Assembler (as)
    │     - Generate machine code
    ▼
hello.o           ← Object file (binary, chưa link)
    │
    │  4. Linker (ld)
    │     - Link với standard library
    │     - Resolve symbol reference
    ▼
hello             ← Executable
```

Bạn có thể chạy từng bước riêng:

```bash
# Bước 1: preprocess
g++ -E hello.cpp -o hello.i
# Mở hello.i — bạn sẽ thấy NỘI DUNG <iostream> đã được paste vào đó
# (hàng chục nghìn dòng cho 1 file 5 dòng!)

# Bước 2: compile to assembly
g++ -S hello.cpp -o hello.s

# Bước 3: assemble (chỉ compile, không link)
g++ -c hello.cpp -o hello.o

# Bước 4: link
g++ hello.o -o hello
```

### Compile error vs link error

Compile error thường rõ ràng:

```
hello.cpp:4:3: error: 'cot' is not a member of 'std'; did you mean 'cot'?
```

Compiler chỉ ra dòng và cột; thường gợi ý fix.

Link error đến **sau khi compile thành công**, ở giai đoạn 4:

```
undefined reference to `MyClass::myMethod()'
```

Nghĩa là: compiler thấy bạn `gọi` `MyClass::myMethod()`, nhưng linker không tìm thấy `định nghĩa`. Có thể:

- Bạn quên implement method (chỉ khai báo trong `.h`).
- Bạn không compile + link file `.cpp` chứa định nghĩa.
- Bạn link sai library.

→ **Compile error = trong 1 file. Link error = giữa các file.**

## Header (`.h`) vs Source (`.cpp`)

C++ có **2 loại file source** cho 1 logic unit:

| File | Chứa | Vai trò |
|---|---|---|
| `foo.h` (header) | Khai báo (declaration) | "Có hàm `Bar()` tồn tại" |
| `foo.cpp` (source / implementation) | Định nghĩa (definition) | "Đây là body của hàm `Bar()`" |

Ví dụ:

`math_utils.h`:

```cpp
#pragma once

// Declaration — chỉ nói "có hàm này tồn tại, signature là vậy"
int Square(int x);
int Cube(int x);
```

`math_utils.cpp`:

```cpp
#include "math_utils.h"

// Definition — body thực sự
int Square(int x) {
  return x * x;
}

int Cube(int x) {
  return x * x * x;
}
```

`main.cpp`:

```cpp
#include "math_utils.h"
#include <iostream>

int main() {
  std::cout << Square(5) << std::endl;  // 25
  std::cout << Cube(3) << std::endl;    // 27
  return 0;
}
```

Compile:

```bash
g++ -std=c++17 -Wall math_utils.cpp main.cpp -o app
./app
```

### Vì sao tách 2 file?

Trong JavaScript / Python: bạn có 1 file, mọi thứ ở đó. Tại sao C++ phải có 2?

Lý do là **separate compilation**. Mỗi `.cpp` được compile **riêng** thành `.o`. Compiler cần biết signature của hàm bạn gọi (để check type, sinh call instruction), nhưng **không cần biết body** ở giai đoạn này. Body có thể nằm ở `.cpp` khác.

- `main.cpp` include `math_utils.h` → biết `Square(int)` tồn tại, signature đúng → compile OK.
- `math_utils.cpp` chứa body → compile thành `math_utils.o`.
- Linker combine `main.o` + `math_utils.o` → resolve `Square` symbol → tạo executable.

Lợi ích:

1. **Build nhanh hơn**: sửa 1 file `.cpp` không cần recompile các file khác.
2. **Header = interface, source = implementation**: bạn có thể đóng gói library thành `.h` + `.so` (compiled binary), người dùng chỉ thấy header.
3. **Encapsulation**: code khác không thấy được internal helper trong `.cpp`.

### Khi nào không cần tách?

- **Template**: định nghĩa template phải ở header (compiler cần body khi instantiate). Đây là exception.
- **`inline` function**: cho compiler quyết định inline, định nghĩa thường ở header.
- **Header-only library**: small library tiện cho user, không tách `.cpp`. Boost có nhiều cái như vậy.
- **Internal helper function**: trong `.cpp` only, không cần khai báo ở `.h`. Thường khai báo là `static` để giới hạn linkage (sẽ học ở Bài 3).

## `#include`: quote `""` vs angle `<>`

```cpp
#include <iostream>     // angle bracket
#include "my_header.h"  // quote
```

Quy tắc:

- **Quote `""`** cho header **của project bạn**. Compiler search trong thư mục hiện tại trước, sau đó các `-I` include path.
- **Angle `<>`** cho **standard library + third-party**. Compiler search trong system include paths + `-I`.

Trong thực tế Chromium:

```cpp
#include <string>                            // standard
#include <vector>                            // standard
#include "base/files/file_path.h"            // Chromium internal — dùng quote
#include "third_party/icu/icu_utf.h"         // third-party trong tree
```

Convention Chromium: dùng **quote cho tất cả internal headers** (kể cả `base/`, `content/`, `chrome/`), angle bracket chỉ cho thư viện hệ thống thực sự.

### Thứ tự include

Chromium recommend thứ tự (xem `tools/clang/scripts/format_xml.py` hoặc style guide):

```cpp
// 1. Header tương ứng (cho file .cc/.cpp này)
#include "my_class.h"

// 2. Standard headers (C standard, C++ standard)
#include <stddef.h>
#include <string>
#include <vector>

// 3. Other project headers
#include "base/strings/string_util.h"
#include "content/public/browser/web_contents.h"
```

Mỗi nhóm sort alphabetical. Lý do thứ tự này: header tương ứng include đầu tiên để đảm bảo nó self-contained (không phụ thuộc include trước).

`clang-format` tự động sắp xếp nếu bạn config đúng.

## Multi-file project: trace 1 ví dụ

Cấu trúc:

```text
project/
├── main.cpp
├── greeter.h
├── greeter.cpp
└── Makefile     (sẽ chuyển sang CMake ở Phase 6)
```

`greeter.h`:

```cpp
#pragma once

#include <string>

class Greeter {
 public:
  Greeter(std::string name);
  std::string Greet() const;

 private:
  std::string name_;
};
```

`greeter.cpp`:

```cpp
#include "greeter.h"

Greeter::Greeter(std::string name) : name_(std::move(name)) {}

std::string Greeter::Greet() const {
  return "Hello, " + name_ + "!";
}
```

`main.cpp`:

```cpp
#include "greeter.h"
#include <iostream>

int main() {
  Greeter g("World");
  std::cout << g.Greet() << std::endl;
  return 0;
}
```

Build (option 1 — manual):

```bash
g++ -std=c++17 -Wall -c greeter.cpp -o greeter.o
g++ -std=c++17 -Wall -c main.cpp -o main.o
g++ greeter.o main.o -o app
./app
# Output: Hello, World!
```

Build (option 2 — 1 lệnh):

```bash
g++ -std=c++17 -Wall greeter.cpp main.cpp -o app
```

Compiler tự động làm 3 bước. Khi project lớn, dùng build system (CMake, Make, Bazel, ninja) để tránh recompile file không thay đổi.

### Trace lỗi link điển hình

Giả sử bạn quên compile `greeter.cpp`:

```bash
g++ -std=c++17 -Wall main.cpp -o app
```

Lỗi:

```
/usr/bin/ld: /tmp/main-xxx.o: in function `main':
main.cpp:(.text+0x42): undefined reference to `Greeter::Greeter(std::string)'
main.cpp:(.text+0x52): undefined reference to `Greeter::Greet() const'
collect2: error: ld returned 1 exit status
```

Đây là **link error**, không phải compile error. `main.cpp` compile OK (vì nó có header `greeter.h` để biết `Greeter` có method gì). Nhưng linker không tìm thấy body — vì bạn chưa compile `greeter.cpp`. Fix: thêm `greeter.cpp` vào lệnh.

→ **Nguyên tắc**: gặp "undefined reference" → kiểm tra có compile + link **tất cả** `.cpp` chứa định nghĩa không.

## Compiler nào dùng?

| Platform | Default | Note |
|---|---|---|
| Linux | `g++` (GCC) | Cài `build-essential` (Ubuntu) hoặc `gcc-c++` (Fedora). |
| macOS | `clang++` (LLVM, ship với Xcode CLT) | `g++` là alias tới `clang++`. Cài `xcode-select --install`. |
| Windows | MSVC (`cl.exe`) hoặc MinGW/MSYS2 (`g++`) | WSL có Linux toolchain đầy đủ. |

Chromium dùng **clang** cho mọi platform (kể cả Windows — Chromium toolchain ship clang riêng). Khi bạn build Chromium, hệ thống sẽ dùng `third_party/llvm-build/Release+Asserts/bin/clang++`.

Cho course này, `g++` hoặc `clang++` đều OK. Hai compiler tương đương về tính năng C++17.

### Verify version

```bash
$ g++ --version
g++ (Ubuntu 11.4.0-1ubuntu1) 11.4.0

$ clang++ --version
Apple clang version 15.0.0 (clang-1500.3.9.4)
```

Cần `g++` ≥ 9 hoặc `clang++` ≥ 10 cho C++17 support đầy đủ.

## Phổ biến: warning vs error

Compiler có 2 loại message:

- **Error**: compile fail, không tạo binary.
- **Warning**: compile OK, tạo binary, nhưng compiler nghi ngờ code có vấn đề.

```bash
g++ -Wall -Wextra hello.cpp -o hello
```

Bật cảnh báo. Mọi warning **nên fix**, không nên ignore. Code review tốt sẽ block PR có warning mới.

Để biến warning thành error (CI strict):

```bash
g++ -Wall -Wextra -Werror hello.cpp -o hello
```

Khuyến nghị `-Werror` trong CI. Local dev có thể không bật để iterate nhanh.

## Pattern thực tế trong Chromium

Chromium dùng GN build system (sẽ học ở `chromium-native/phase-1/03-gn-ninja-deep.md`). Một target nhìn như:

```python
# BUILD.gn
source_set("my_feature") {
  sources = [
    "my_feature.cc",
    "my_feature.h",
  ]
  deps = [
    "//base",
    "//content/public/browser",
  ]
}
```

GN sinh ra ninja file; ninja invoke clang++ với flags Chromium-specific (`-std=c++20`, `-fno-exceptions`, `-fvisibility=hidden`, etc.). Bạn không gọi compiler trực tiếp — build system làm hết.

Tuy nhiên hiểu compiler invocation cơ bản giúp bạn:

- Debug khi build fail (đọc command thực sự mà ninja chạy).
- Compile test snippet ngoài Chromium tree.
- Hiểu link error trong Chromium build.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Quên `-std=c++17` | Mặc định cũ, thiếu feature | Luôn specify std version |
| Quên `#include <iostream>` khi dùng `std::cout` | `'cout' is not a member of 'std'` | Include đầy đủ; Chromium có lint check |
| Compile 1 file thay vì cả project | Undefined reference khi link | Pass tất cả `.cpp` hoặc dùng build system |
| Header guard sai (thiếu `#pragma once`) | Multiple definition error | Mọi header dùng `#pragma once` (Chromium convention) |
| Define hàm trong header | Multiple definition khi nhiều file include | Define ở `.cpp`, chỉ declare ở `.h`. Exception: `inline`, `template`. |
| Include circular (`A` include `B`, `B` include `A`) | Compile fail hoặc weird error | Dùng forward declaration (Bài 3) |
| `using namespace std;` trong header | Pollute namespace cho mọi file include | Đừng dùng `using namespace` global trong header |

## Tóm tắt

| Khái niệm | Ý nghĩa |
|---|---|
| Source file `.cpp` / `.cc` | Implementation, chứa body của function/method |
| Header file `.h` / `.hpp` | Declaration, chứa signature |
| `#include "..."` | Internal header (project + Chromium) |
| `#include <...>` | Standard library + system headers |
| `g++ -std=c++17 -Wall -g file.cpp -o out` | Compile + link cơ bản |
| Build cycle | Preprocess → Compile → Assemble → Link |
| Compile error | Lỗi trong 1 file |
| Link error | Symbol không resolve được giữa các file |
| `-O0` | Debug build, không optimize |
| `-O2` | Release build, optimize |

## Exercise (optional)

1. Tạo project 3-file: `add.h`, `add.cpp` (định nghĩa hàm `int Add(int, int)`), `main.cpp` gọi nó. Compile + chạy.
2. Cố tình quên compile `add.cpp` — xem link error. Đọc kỹ message.
3. Cố tình define `Add` trong `add.h` thay vì `add.cpp`, include `add.h` từ 2 file `.cpp`. Compile cả 2 — xem multiple definition error.
4. Chạy `g++ -E main.cpp` và đếm tổng số dòng output. Bạn sẽ ngạc nhiên về việc 1 file 5 dòng "thực sự" lớn cỡ nào sau khi preprocess.

---

**Bài kế tiếp** → [Bài 2: Types và Control Flow](02-types-and-control-flow.md)
