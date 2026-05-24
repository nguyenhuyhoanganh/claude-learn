# Bài 3: Error Handling Philosophy

Bài này dạy:
- Exception trong C++: cú pháp, cost (throw + stack unwind).
- Return code style: `bool`, `int`, `std::optional`, `std::expected`.
- RAII as cleanup pattern (không cần `finally`).
- Vì sao Chromium tắt exception (binary size, ABI, predictable cost).
- Best practice modern: optional cho "có thể không có", expected cho "có thể fail với detail".
- `assert`, `CHECK`, `DCHECK` (Chromium).

Kết thúc bài: bạn chọn được error strategy phù hợp, hiểu trade-off, và biết tại sao Chromium chọn no-exception path.

## Tại sao bàn về error handling?

Mọi function thực tế đều có thể "fail":

- File không tồn tại.
- Network timeout.
- Input invalid.
- Out of memory.

Lập trình viên cần signal lỗi tới caller. C++ có nhiều approach — mỗi cái có trade-off khác nhau.

## Approach 1: Exception

```cpp
#include <stdexcept>

int ParseInt(const std::string& s) {
  try {
    return std::stoi(s);
  } catch (const std::invalid_argument& e) {
    throw std::runtime_error("Invalid input: " + s);
  }
}

try {
  int value = ParseInt("not_a_number");
} catch (const std::exception& e) {
  std::cerr << e.what() << "\n";
}
```

### Cú pháp

```cpp
throw expression;       // Throw bất kỳ object nào (thường dẫn xuất std::exception)

try {
  // Code có thể throw
} catch (const std::exception& e) {     // Catch by reference
  // Handle exception
  std::cerr << e.what();
} catch (...) {                         // Catch any
  // Fallback
}
```

### Standard exception hierarchy

```text
std::exception
├── std::logic_error
│   ├── std::invalid_argument
│   ├── std::domain_error
│   ├── std::out_of_range
│   └── std::length_error
├── std::runtime_error
│   ├── std::overflow_error
│   ├── std::underflow_error
│   └── std::range_error
├── std::bad_alloc
├── std::bad_cast
├── std::bad_typeid
└── std::bad_exception
```

### Cost của exception

**Khi không throw**: gần như 0 cost (modern implementation dùng "zero-cost exception" — chỉ table lookup khi unwind).

**Khi throw**:

- Stack unwinding: phải tìm và gọi destructor của mọi object trên stack.
- Type matching: tìm catch handler đúng type.
- Allocation: nhiều khi cần heap alloc cho exception object.
- Slowdown: 10-100x so với return code.

→ Exception **không free khi throw**. Phù hợp cho **exceptional** case (hiếm), không cho normal control flow.

### Specification — `noexcept`

```cpp
void Foo() noexcept;        // Hàm này không throw
void Bar() noexcept(false);  // Cho phép throw (default)
```

`noexcept` is contract. Nếu throw từ noexcept function → `std::terminate()` → crash.

**Use case**:

- Move ctor / move assignment.
- Swap function.
- Destructor (luôn implicitly noexcept).

## Approach 2: Return code

```cpp
// Bool — chỉ ok/fail
bool TryParseInt(const std::string& s, int* result);

if (TryParseInt("42", &value)) {
  std::cout << value;
}

// Int code — multiple error states
enum class ParseStatus { kOk, kEmpty, kInvalid, kOverflow };

ParseStatus ParseInt(const std::string& s, int* result);
```

### Ưu

- Predictable cost — không có hidden control flow.
- Explicit ở mọi call site (caller phải check).
- Binary size nhỏ (no exception tables).
- ABI-stable (interop với C dễ).

### Nhược

- Verbose — phải check mỗi call.
- Easy to ignore — quên check error.
- Mixing output value + status awkward.

## Approach 3: Optional / Expected

```cpp
// Optional — fail = nullopt
std::optional<int> ParseInt(const std::string& s) {
  // ...
  return std::nullopt;
}

// Expected (C++23) — fail with detail
std::expected<int, std::string> ParseInt(const std::string& s) {
  if (s.empty()) return std::unexpected("empty");
  if (!IsValid(s)) return std::unexpected("invalid: " + s);
  return std::stoi(s);
}
```

### Modern best practice

| Case | Use |
|---|---|
| "Có thể không có giá trị" | `std::optional<T>` |
| "Có thể fail với detail" | `std::expected<T, E>` (C++23) |
| Multiple failure modes | `std::expected` hoặc `std::variant<Success, Errors...>` |
| Truly exceptional (vd OOM, file system error) | Exception (nếu enable) |

## RAII as cleanup — không cần `finally`

Java/Python có `try-finally` để cleanup:

```python
file = open("data.txt")
try:
    process(file)
finally:
    file.close()
```

C++ không cần `finally` — RAII tự cleanup khi out of scope, kể cả khi exception:

```cpp
void Process() {
  std::ifstream file("data.txt");   // RAII open
  ProcessFile(file);                 // Có thể throw
  // file.close() tự gọi khi file destroy
}                                    // file destroy ở đây (kể cả throw)
```

Mọi resource Cleanup được đảm bảo nhờ destructor. Đây là RAII (Bài 3 Phase 3).

### Throw trong destructor — đừng

```cpp
class Foo {
 public:
  ~Foo() {
    throw std::runtime_error("oops");  // BẨN
  }
};
```

Nếu destructor throw trong stack unwinding (đang xử lý 1 exception trước đó) → `std::terminate` ngay. Đa số dtor ngầm noexcept.

→ **Destructor không throw**.

## Chromium: tắt exception

Chromium build với `-fno-exceptions`. Lý do:

### 1. Binary size

Exception tables (cho unwinding) chiếm 5-15% binary size. Chromium tắt → smaller binary, faster load.

### 2. Predictable cost

Browser cần latency stable. Exception throw có spike latency (allocation, type matching). Tắt exception → no surprise.

### 3. ABI compatibility

Chromium phải interop với C library (V8, third-party). C không có exception → mixing dễ leak.

### 4. Style / discipline

Google C++ Style Guide cấm exception. Lý do lịch sử: codebase pre-exists exception. Migrate khó.

### Hậu quả trong Chromium

- Không `throw`, không `try/catch`.
- STL operation có thể throw (`std::bad_alloc`, `vector::at()`) → terminate ngay.
- `std::vector::at()` thay `[]` cho bound check? Không — vì throw → terminate.
- Custom error handling: return `bool`, `base::expected`, hoặc `LOG/CHECK`.

### `CHECK`, `DCHECK`, `LOG`

```cpp
#include "base/check.h"
#include "base/logging.h"

void Process(int x) {
  CHECK(x >= 0) << "x must be non-negative, got " << x;
  // CHECK fail → crash (in both release + debug)

  DCHECK(x < 1000);
  // DCHECK only in debug build

  LOG(INFO) << "Processing " << x;
  LOG(WARNING) << "Value high: " << x;
  LOG(ERROR) << "Invalid input";
  LOG(FATAL) << "Unrecoverable";   // Crash
}
```

Sẽ học detail trong `chromium-native/phase-2/04-logging-and-assertions.md`.

### `NOTREACHED`

```cpp
void HandleEvent(EventType e) {
  switch (e) {
    case kClick: HandleClick(); break;
    case kHover: HandleHover(); break;
    default:
      NOTREACHED() << "Unknown event type: " << e;
  }
}
```

`NOTREACHED` = "code không bao giờ tới đây". Crash + log nếu thấy.

## Pattern: error wrapper

Khi muốn chứa error detail:

```cpp
struct Error {
  enum Code {
    kNotFound,
    kPermissionDenied,
    kTimeout,
    kInternal,
  };

  Code code;
  std::string message;
};

base::expected<User, Error> GetUser(int id) {
  if (id < 0) {
    return base::unexpected(Error{Error::kNotFound, "negative id"});
  }
  // ... fetch ...
  return user;
}

auto result = GetUser(42);
if (result.has_value()) {
  Use(*result);
} else {
  LOG(ERROR) << result.error().message;
}
```

## Best practice tổng kết

### General modern C++ (with exception)

1. **Recoverable error** → `optional`, `expected`.
2. **Programming error / invariant violation** → `assert` (dev), `throw` (production) hoặc `terminate`.
3. **Truly exceptional** (OOM, hardware fail) → exception.
4. **Cleanup** → RAII (always).

### Chromium specifically

1. **Recoverable error** → return `bool`, `base::expected`, `std::optional`.
2. **Invariant** → `DCHECK` (debug-only), `CHECK` (always).
3. **Unrecoverable / "should not happen"** → `CHECK(false)`, `NOTREACHED()`, `LOG(FATAL)`.
4. **Cleanup** → RAII via smart pointer, `base::ScopedClosureRunner`.

## Pattern thực tế Chromium

```cpp
// chrome/browser/foo/foo_service.h
#pragma once

#include <optional>
#include "base/expected.h"

namespace foo {

enum class FetchError {
  kNetworkFailure,
  kInvalidResponse,
  kTimeout,
};

class FooService {
 public:
  // Optional cho "có thể không có"
  std::optional<int> GetCachedValue(const std::string& key) const;

  // Expected cho "có thể fail with detail"
  base::expected<std::string, FetchError> FetchData(const std::string& url) const;

  // Async pattern (sẽ học ở chromium-native)
  using FetchCallback =
      base::OnceCallback<void(base::expected<std::string, FetchError>)>;
  void FetchAsync(const std::string& url, FetchCallback callback);
};

}  // namespace foo
```

```cpp
// Call site
auto result = service->FetchData("http://example.com");
if (result.has_value()) {
  ProcessData(*result);
} else {
  switch (result.error()) {
    case FetchError::kNetworkFailure:
      ScheduleRetry();
      break;
    case FetchError::kTimeout:
      ReportTimeout();
      break;
    case FetchError::kInvalidResponse:
      LOG(ERROR) << "Bad response";
      break;
  }
}
```

## Exception safety levels (recap)

Trong code có exception:

1. **No-throw guarantee**: `noexcept` — không bao giờ throw.
2. **Strong guarantee**: nếu throw, state không đổi (như chưa gọi).
3. **Basic guarantee**: nếu throw, state hợp lệ nhưng thay đổi.
4. **None**: throw có thể leave object trong state không hợp lệ — UB.

→ Trong Chromium (no exception), không cần lo về level — code không throw.

## So sánh với language khác

| Language | Default error style |
|---|---|
| Python | Exception |
| Java | Checked + unchecked exception |
| C# | Exception |
| C | Return code (int / errno) |
| C++ (general) | Exception (modern), nhưng có cả 2 style |
| C++ (Chromium / Google) | Return code (no exception) |
| Rust | `Result<T, E>` |
| Go | Multiple return + error value |
| JavaScript | Throw / try-catch + Promise reject |

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Throw từ destructor | Terminate nếu trong unwinding | Destructor không throw |
| Throw từ `noexcept` function | Immediate terminate | Đảm bảo no throw if marked noexcept |
| Catch by value (slice) | Polymorphic info lost | Catch by `const reference` |
| Ignore return code | Silent fail | `[[nodiscard]]` cho return type quan trọng |
| Mix exception + C-style code | Resource leak khi unwind qua C frame | Tắt exception hoặc dùng wrapper |
| Treat optional as error | Wrong abstraction | Dùng expected nếu cần error detail |
| Hide error trong default | Bug silent | Explicit handle error, hoặc fail loud |

### `[[nodiscard]]`

```cpp
[[nodiscard]] bool TryParse(const std::string& s, int* out);

TryParse("42", &val);   // Warning — discarded return value
```

C++17 attribute để force check return value. Chromium dùng nhiều.

## Tóm tắt

| Strategy | Khi nào |
|---|---|
| Exception | Modern C++ general; truly exceptional |
| Return code (bool/int/enum) | Predictable cost, interop C, Chromium |
| `std::optional<T>` | "Có thể không có giá trị" |
| `std::expected<T, E>` (C++23) | "Fail with detail" |
| `CHECK`/`DCHECK`/`NOTREACHED` (Chromium) | Invariant, "should not happen" |
| RAII | Cleanup luôn |

**Chromium rule**: no throw, prefer optional/expected, CHECK for invariant, LOG for diagnostic.

## Exercise (optional)

1. Viết function `Divide(int a, int b)` 3 version: throw if b=0; return optional<int>; return expected<int, string>. So sánh call site.
2. Viết RAII `ScopedTimer` log execution time. Verify nó log kể cả khi function throw / early return.
3. Đọc 1 file Chromium dùng `base::expected`. Trace error code flow.
4. Convert 1 function dùng exception sang return-code style. Cảm nhận trade-off.

---

**Phase kế** → [Phase 6: Concurrency và Tooling](../phase-6-concurrency-and-tooling/01-threads-and-mutex.md)
