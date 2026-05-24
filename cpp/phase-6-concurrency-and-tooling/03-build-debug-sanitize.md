# Bài 3: Build, Debug, Sanitize

Bài này dạy:
- CMake basics: `CMakeLists.txt`, target, link library.
- Debugger: `gdb` / `lldb` cheat sheet (break, run, step, print, backtrace).
- Sanitizers: AddressSanitizer (ASan), UndefinedBehaviorSanitizer (UBSan), ThreadSanitizer (TSan).
- Common C++ bug patterns: use-after-free, out-of-bound, data race, integer overflow.
- Static analysis: `clang-tidy` intro.

Kết thúc bài: bạn build được project nhỏ với CMake, debug bằng gdb/lldb, phát hiện được memory bug bằng sanitizer.

## CMake basics

CMake = meta build system. Generate Makefile / Ninja / Visual Studio project tương ứng platform.

### Tại sao CMake?

- Cross-platform (Linux, macOS, Windows).
- Dependency management.
- Industry standard cho project C++ medium+.

Chromium **không dùng CMake** — dùng GN/ninja riêng (sẽ học ở `chromium-native/phase-1/03`). Nhưng đa số project khác dùng CMake.

### CMakeLists.txt cơ bản

```cmake
cmake_minimum_required(VERSION 3.16)
project(MyApp VERSION 1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_executable(myapp
  src/main.cpp
  src/greeter.cpp
)

target_include_directories(myapp PRIVATE include)
```

Build:

```bash
mkdir build && cd build
cmake ..
make
./myapp
```

Hoặc với ninja:

```bash
cmake .. -G Ninja
ninja
```

### Library + executable

```cmake
add_library(greeter STATIC
  src/greeter.cpp
  include/greeter.h
)

target_include_directories(greeter PUBLIC include)

add_executable(myapp src/main.cpp)
target_link_libraries(myapp PRIVATE greeter)
```

`STATIC` library → `.a` (Linux/Mac) hoặc `.lib` (Windows).
`SHARED` library → `.so`/`.dylib`/`.dll`.

### Compiler flags

```cmake
target_compile_options(myapp PRIVATE
  -Wall
  -Wextra
  -Wpedantic
)

# Or globally
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -Wall -Wextra")
```

### Debug vs Release

```bash
cmake .. -DCMAKE_BUILD_TYPE=Debug      # -g -O0
cmake .. -DCMAKE_BUILD_TYPE=Release    # -O3 -DNDEBUG
```

### Find dependency

```cmake
find_package(Threads REQUIRED)
target_link_libraries(myapp PRIVATE Threads::Threads)

# Or with package manager
find_package(fmt REQUIRED)
target_link_libraries(myapp PRIVATE fmt::fmt)
```

### Modern CMake principles

1. **Target-based**: every dependency là target, link với `target_link_libraries`.
2. **PUBLIC/PRIVATE/INTERFACE**: control transitive dependency.
3. **No global state**: tránh `include_directories` global.

## Debugger (gdb / lldb)

Modern debugger cho C++:

- `gdb` — GNU debugger, default Linux.
- `lldb` — LLVM debugger, default macOS, cross-platform.

### Build với debug info

```bash
g++ -g -O0 main.cpp -o app
# -g: debug symbols
# -O0: no optimize (biến không bị eliminate, line không bị reorder)
```

### Basic gdb commands

```bash
$ gdb ./app

(gdb) break main              # Set breakpoint at main
(gdb) break greeter.cpp:25     # Set at file:line
(gdb) break Greeter::Greet     # Set at function

(gdb) run                      # Start program
(gdb) run arg1 arg2            # Start with arguments

# After hit breakpoint:
(gdb) next                     # Step over (next line)
(gdb) step                     # Step into function
(gdb) finish                   # Run until return
(gdb) continue                 # Continue execution

(gdb) print x                  # Print variable
(gdb) print arr[5]
(gdb) print *ptr
(gdb) print this->member_

(gdb) backtrace                # Or 'bt' — call stack
(gdb) frame 2                  # Switch to stack frame
(gdb) info locals              # All local variables
(gdb) info args                # Function arguments

(gdb) watch variable           # Break when variable changes
(gdb) display variable         # Show every step

(gdb) quit
```

### Lldb commands (tương đương)

```bash
$ lldb ./app

(lldb) breakpoint set --name main      # Or 'b main'
(lldb) breakpoint set --file greeter.cpp --line 25

(lldb) run

(lldb) next                            # Or 'n'
(lldb) step                            # Or 's'
(lldb) finish
(lldb) continue                        # Or 'c'

(lldb) print x                         # Or 'p x'
(lldb) frame variable                  # All variables
(lldb) bt
(lldb) frame select 2

(lldb) quit
```

### Pretty-printing STL

Modern gdb/lldb auto pretty-print STL:

```
(gdb) print v
$1 = std::vector of length 3, capacity 4 = {1, 2, 3}
```

Nếu không pretty: install python `libstdc++-pretty-printers`.

### Conditional breakpoint

```
(gdb) break greeter.cpp:25 if x > 100
(gdb) break ProcessUser if user.id == 42
```

### Core dump

```bash
# Enable core dump
ulimit -c unlimited

# Run program — if crash, get core file
./app

# Analyze core
gdb ./app core
(gdb) bt   # See where crash happened
```

## Sanitizers — bug detection runtime

Compiler flag instrument binary để detect bug.

### AddressSanitizer (ASan)

Detect memory bug: use-after-free, out-of-bound, double free, leak.

```bash
g++ -fsanitize=address -g main.cpp -o app
./app
```

Example bug:

```cpp
int* p = new int(42);
delete p;
std::cout << *p;   // Use after free
```

ASan output:

```
==12345==ERROR: AddressSanitizer: heap-use-after-free
READ of size 4 at 0x602000000010 thread T0
    #0 0x4007a4 in main main.cpp:5
    ...
0x602000000010 is located 0 bytes inside of 4-byte region
freed by thread T0 here:
    #0 0x4500d0 in operator delete(void*)
    #1 0x4007a0 in main main.cpp:4
previously allocated by thread T0 here:
    #0 0x44fed8 in operator new(unsigned long)
    #1 0x40079c in main main.cpp:3
```

→ Show exact location of bug + allocation history.

**Overhead**: 2x slow runtime, 3x memory. Worth it for development/testing.

### UndefinedBehaviorSanitizer (UBSan)

Detect UB: integer overflow, null deref, alignment issue, etc.

```bash
g++ -fsanitize=undefined -g main.cpp -o app
./app
```

Example:

```cpp
int x = INT_MAX;
x++;   // Signed overflow — UB
```

UBSan:

```
main.cpp:5:5: runtime error: signed integer overflow: 2147483647 + 1 cannot be represented in type 'int'
```

### ThreadSanitizer (TSan)

Detect data race và deadlock.

```bash
g++ -fsanitize=thread -g main.cpp -o app
./app
```

Example:

```cpp
int counter = 0;

void Inc() { counter++; }   // Race!

std::thread t1(Inc);
std::thread t2(Inc);
t1.join();
t2.join();
```

TSan output:

```
WARNING: ThreadSanitizer: data race
  Write of size 4 at 0x... by thread T2:
    #0 Inc() main.cpp:5
  Previous write of size 4 at 0x... by thread T1:
    #0 Inc() main.cpp:5
```

→ Locate cả 2 racing accesses.

**Overhead**: 5-15x slow. Run trong CI / dev environment.

### MemorySanitizer (MSan)

Detect use of uninitialized memory.

```bash
clang++ -fsanitize=memory -g main.cpp -o app
./app
```

(Chỉ clang, không gcc.)

### Combine

Một số sanitizer combine được:

```bash
g++ -fsanitize=address,undefined -g main.cpp -o app
```

(TSan + ASan không combine.)

### Trong Chromium

Chromium build với sanitizer:

```bash
# In args.gn
is_asan = true
is_ubsan = true
```

Run test suite under sanitizer → catch bug pre-merge.

## Common C++ bug patterns

### 1. Use after free

```cpp
auto* p = new Widget();
delete p;
p->Method();   // BUG — ASan catch
```

Modern fix: smart pointer.

### 2. Double free

```cpp
delete p;
delete p;   // BUG — double free
```

Modern fix: `unique_ptr`.

### 3. Out of bound

```cpp
int arr[5];
arr[10] = 0;   // BUG — buffer overflow
```

ASan catch. Modern fix: `std::array` + `at()`, hoặc `std::span` bound check.

### 4. Dangling reference

```cpp
const std::string& GetName() {
  std::string s = "local";
  return s;   // BUG — return ref to local
}
```

Modern fix: return by value (move semantics make it cheap).

### 5. Data race

```cpp
int counter = 0;
// Thread 1 + Thread 2 both ++counter
```

TSan catch. Modern fix: `std::atomic` hoặc mutex.

### 6. Integer overflow

```cpp
int n = INT_MAX;
n++;   // UB — UBSan catch
```

Fix: dùng wider type (`int64_t`), hoặc bound check.

### 7. Null deref

```cpp
Widget* w = GetWidget();   // Returns nullptr sometimes
w->Method();                // BUG if null
```

Fix: check before access; hoặc dùng reference (không null).

### 8. Memory leak

```cpp
void Foo() {
  int* p = new int(5);
  if (early_exit) return;   // Leak
  delete p;
}
```

ASan detect leak khi exit. Modern fix: `unique_ptr`.

## Static analysis

Tool phân tích code **without running** (vs sanitizer = runtime).

### `clang-tidy`

```bash
clang-tidy --checks='*' main.cpp -- -std=c++17
```

Check:

- Modern C++ idiom (use auto, ranged-for, smart pointer).
- Common bug pattern (null check missing, uninit member).
- Style (naming, header guard).
- Performance (unnecessary copy).

Trong Chromium: `tools/clang/scripts/run-find-bad-constructs.py` và custom clang plugin.

### Compiler warnings

```bash
g++ -Wall -Wextra -Wpedantic -Wshadow -Wnon-virtual-dtor -Wold-style-cast main.cpp
```

Hữu ích flag:

- `-Wall -Wextra` — phổ biến.
- `-Wshadow` — shadow variable.
- `-Wnon-virtual-dtor` — base class missing virtual dtor.
- `-Wold-style-cast` — `(int)x` thay `static_cast<int>(x)`.
- `-Wconversion` — implicit conversion (verbose, không phải lúc nào cũng dùng).

`-Werror` chuyển warning thành error → strict CI.

### Linter / formatter

- `clang-format` — auto format theo style guide.
- `clang-tidy` — static analysis.
- `cppcheck` — alternative static analyzer.
- `IWYU` (include-what-you-use) — clean up unused include.

## Pattern thực tế

### Dev workflow

```bash
# Build with debug + sanitizer
cmake -B build -DCMAKE_BUILD_TYPE=Debug \
              -DCMAKE_CXX_FLAGS="-fsanitize=address,undefined"
cmake --build build

# Run test under sanitizer
./build/test_app
# Inspect any sanitizer error

# Debug with lldb
lldb ./build/app
```

### CI workflow

```yaml
- name: Build with sanitizers
  run: |
    cmake -B build-asan -DCMAKE_CXX_FLAGS="-fsanitize=address"
    cmake --build build-asan

- name: Run tests under ASan
  run: |
    ./build-asan/tests

- name: Run lint
  run: |
    clang-tidy src/*.cpp
```

Catch bug pre-merge.

### Performance profiling

Khác debug — `perf` (Linux), `Instruments` (macOS), `vtune` (Intel):

```bash
perf record ./app
perf report
```

Show CPU hotspot.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Quên `-g` | Debug không có symbol | `-g` cho debug build |
| Optimize cao + debug | Variable optimized away, line không match | `-O0` cho debug |
| Sanitizer chỉ trong dev | Production bug | Run sanitizer trong CI |
| `printf` debugging | Slow iteration, dirty code | Dùng debugger |
| Heisenbug (disappear khi debug) | Race condition | TSan reproducible |
| Static analyzer false positive | Ignore tất cả warning | Triage carefully, fix true positive |
| Build từ scratch lâu | Slow iteration | `ninja` parallel, ccache |

## Tóm tắt

| Tool | Use case |
|---|---|
| `g++` / `clang++` | Compiler |
| CMake | Build system (general; Chromium dùng GN) |
| `gdb` / `lldb` | Debugger |
| AddressSanitizer | Memory bug |
| UBSanitizer | Undefined behavior |
| ThreadSanitizer | Data race, deadlock |
| MemorySanitizer | Uninitialized read (clang only) |
| `clang-tidy` | Static analysis |
| `clang-format` | Auto-format |

## Pattern Chromium

Chromium hỗ trợ tất cả sanitizer qua args.gn:

```python
is_asan = true
is_ubsan = true
is_tsan = true
```

Pre-submit test chạy sanitizer build. Crash report integrate với crash-staging server.

## Exercise (optional)

1. Tạo CMake project hello-world. Build, run.
2. Cố tình memory bug (use after free). Build với ASan, run, đọc message.
3. Cố tình data race. Build với TSan, run, đọc message.
4. Debug crash với `gdb`/`lldb`. Set breakpoint, step, print variable, backtrace.

---

**Course tiếp theo** → [chromium-native/](../../chromium-native/README.md)
