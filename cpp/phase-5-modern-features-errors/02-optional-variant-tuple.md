# Bài 2: optional, variant, tuple

Bài này dạy:
- `std::optional<T>` (C++17): "có thể không có giá trị" — thay nullable pointer.
- `std::variant<A, B, C>` (C++17): discriminated union, visit pattern.
- `std::tuple<...>` và `std::pair<A, B>`: heterogeneous collection.
- `std::expected<T, E>` (C++23): result type — fallback cho C++17.

Kết thúc bài: bạn return optional thay vì nullable pointer / sentinel, dùng variant để model multiple states, hiểu khi nào dùng tuple vs struct.

## `std::optional<T>` — value-or-nothing

```cpp
#include <optional>

std::optional<int> FindUser(const std::string& name);

auto result = FindUser("Alice");
if (result.has_value()) {
  std::cout << *result;
}

if (result) {                  // implicit bool
  std::cout << *result;        // dereference
}

int value = result.value_or(0);  // value or default if empty
```

| Operation | Ý nghĩa |
|---|---|
| `std::nullopt` | Empty value (default) |
| `has_value()` / `bool(opt)` | Có value không |
| `*opt` / `opt.value()` | Get value (UB if empty với `*`; throw với `.value()`) |
| `opt.value_or(default)` | Get value or default |
| `opt = value` | Set value |
| `opt = std::nullopt` | Clear |
| `opt.reset()` | Clear |
| `opt.emplace(args...)` | In-place construct |

### Thay vì pointer null

```cpp
// BAD — caller phải remember check
int* FindCount(const std::string& key);

int* count = FindCount("foo");
if (count) {
  std::cout << *count;
}

// GOOD — clearer intent, no heap allocation
std::optional<int> FindCount(const std::string& key);

if (auto count = FindCount("foo")) {
  std::cout << *count;
}
```

Lợi ích `optional`:

- Stack-allocated (không heap).
- Type system rõ ràng "có thể không có value".
- Không nhầm với "sentinel" như `-1`, `INT_MAX`.

### Khi nào dùng `optional`?

✅ **Function có thể không trả giá trị**:

```cpp
std::optional<User> FindUser(int id);
std::optional<int> ParseInt(const std::string& s);
std::optional<std::string> ReadEnvVar(const std::string& name);
```

✅ **Lazy / cached value**:

```cpp
class Cache {
  std::optional<int> cached_value_;

  int Get() {
    if (!cached_value_) {
      cached_value_ = Compute();
    }
    return *cached_value_;
  }
};
```

❌ **KHÔNG dùng cho error detail**:

```cpp
std::optional<int> Parse(const std::string& s);  // Ai biết vì sao fail?

// Better: std::expected hoặc enum/struct kết hợp
```

`optional` chỉ có "có hoặc không có" — không có thông tin về vì sao không.

### Init

```cpp
std::optional<int> a;                 // Empty
std::optional<int> b(42);             // Has 42
std::optional<int> c = 42;            // Has 42 (implicit)
std::optional<int> d = std::nullopt;  // Empty explicit
std::optional<std::string> e("hi");   // Has "hi"
```

### Trong return

```cpp
std::optional<int> Find(const std::vector<int>& v, int target) {
  for (size_t i = 0; i < v.size(); ++i) {
    if (v[i] == target) return i;
  }
  return std::nullopt;   // Hoặc return {};
}

auto idx = Find(v, 5);
if (idx) {
  std::cout << "Found at " << *idx;
} else {
  std::cout << "Not found";
}
```

### `optional<T&>` — không hợp lệ

```cpp
std::optional<int&> ref;   // ERROR — optional không support reference type
```

Workaround: `std::optional<std::reference_wrapper<T>>` hoặc dùng pointer (`T*`).

## `std::variant<A, B, C>` — discriminated union

```cpp
#include <variant>

std::variant<int, double, std::string> v = 42;

std::visit([](const auto& x) {
  std::cout << x << "\n";
}, v);

v = std::string("hello");
std::visit([](const auto& x) { std::cout << x; }, v);
```

`variant` chứa **đúng 1 type tại 1 thời điểm** từ list được khai báo. Type-safe alternative cho `union`.

### Operations

```cpp
v.index();              // Index của type hiện tại (0, 1, 2)

std::get<int>(v);       // Get int (throw bad_variant_access if not int)
std::get<0>(v);          // Get by index

std::holds_alternative<int>(v);   // true/false

std::get_if<int>(&v);    // Pointer or nullptr
```

### Visit pattern

```cpp
std::variant<int, double, std::string> v;

// Lambda với auto — visit mọi type
std::visit([](const auto& x) {
  std::cout << x;
}, v);

// Lambda với overload cho từng type
struct Visitor {
  void operator()(int x)         { std::cout << "int: " << x; }
  void operator()(double x)      { std::cout << "double: " << x; }
  void operator()(const std::string& x) { std::cout << "string: " << x; }
};

std::visit(Visitor{}, v);
```

`overloaded` trick (C++17):

```cpp
template <typename... Ts>
struct overloaded : Ts... { using Ts::operator()...; };

template <typename... Ts>
overloaded(Ts...) -> overloaded<Ts...>;

std::visit(overloaded{
  [](int x) { std::cout << "int: " << x; },
  [](double x) { std::cout << "double: " << x; },
  [](const std::string& x) { std::cout << "str: " << x; },
}, v);
```

Đẹp hơn struct visitor.

### Use case: tagged union / sum type

```cpp
struct Connecting {};
struct Connected { int session_id; };
struct Disconnected { std::string reason; };

using ConnectionState = std::variant<Connecting, Connected, Disconnected>;

ConnectionState state = Connecting{};
// ... time passes ...
state = Connected{42};
// ...
state = Disconnected{"timeout"};

std::visit(overloaded{
  [](Connecting)             { std::cout << "Connecting..."; },
  [](Connected c)            { std::cout << "Connected #" << c.session_id; },
  [](const Disconnected& d)  { std::cout << "Disconnected: " << d.reason; },
}, state);
```

Pattern phổ biến trong state machine, parsing, etc.

### Chromium: base::Value

Chromium dùng `base::Value` — JSON-like dynamic type (int/string/list/dict union). Tương tự variant nhưng dynamic hơn.

## `std::tuple<...>` và `std::pair<A, B>`

```cpp
#include <tuple>
#include <utility>

std::pair<int, std::string> p = {1, "hello"};
std::tuple<int, double, std::string> t = {1, 3.14, "test"};

p.first;         // 1
p.second;        // "hello"

std::get<0>(t);  // 1
std::get<1>(t);  // 3.14
std::get<2>(t);  // "test"

auto [a, b] = p;        // Structured binding (C++17)
auto [x, y, z] = t;
```

### `std::make_pair`, `std::make_tuple`

```cpp
auto p = std::make_pair(1, "hello");   // pair<int, const char*>
auto t = std::make_tuple(1, 3.14, "test");
```

CTAD (C++17) đỡ phải dùng `make_*`:

```cpp
std::pair p(1, "hello");
std::tuple t(1, 3.14, "test");
```

### `std::tie`

```cpp
int a;
std::string b;

std::tie(a, b) = SomePair();      // Unpack into existing variables
std::tie(a, b) = std::make_pair(42, "hi");
```

Useful trước structured binding (C++14 — nay đỡ cần).

### Khi nào dùng tuple vs struct?

```cpp
// Tuple — anonymous fields
auto result = std::make_tuple(true, "name", 42);
auto [ok, name, value] = result;
// Hơi confusing: ok, name, value mean what?

// Struct — named fields
struct ParseResult {
  bool ok;
  std::string name;
  int value;
};
ParseResult r = {true, "name", 42};
r.ok;
r.name;
r.value;
```

→ **Rule**: dùng struct cho data có ý nghĩa lâu dài. Tuple cho temporary kết hợp local (vd return từ helper internal).

### Return multiple values

```cpp
std::tuple<int, std::string, bool> Compute() {
  return {42, "result", true};
}

auto [num, str, ok] = Compute();
```

Modern alternative: struct với named members.

## `std::expected<T, E>` (C++23)

```cpp
// C++23
std::expected<int, std::string> Parse(const std::string& s) {
  try {
    return std::stoi(s);
  } catch (...) {
    return std::unexpected("invalid number");
  }
}

auto result = Parse("42");
if (result.has_value()) {
  std::cout << "Got: " << *result;
} else {
  std::cout << "Error: " << result.error();
}
```

`expected<T, E>` chứa **hoặc** `T` (success) **hoặc** `E` (error). Tương tự Rust `Result<T, E>` hoặc Haskell `Either e a`.

**Lợi ích so với optional**:

- Có thông tin error (E).
- Function return type document rõ ràng.

### Fallback cho C++17

```cpp
// Workaround C++17
struct ParseError {
  std::string message;
};

std::variant<int, ParseError> Parse(const std::string& s) {
  // ...
}

auto result = Parse("42");
if (auto* val = std::get_if<int>(&result)) {
  std::cout << *val;
} else {
  auto& err = std::get<ParseError>(result);
  std::cout << err.message;
}
```

Hoặc dùng struct với optional + error string. Chromium dùng `base::expected` (precursor cho `std::expected`).

## Khi nào dùng cái nào?

| Tình huống | Best |
|---|---|
| Function có thể không trả gì, không care error | `optional<T>` |
| Function có thể fail với detail | `expected<T, E>` (C++23) hoặc variant |
| Type là 1 trong nhiều type rõ ràng | `variant<...>` |
| Return multiple values temp | `tuple<...>` |
| Return data structure persistent | struct |
| State machine / sum type | `variant<...>` |

## Pattern thực tế

### Optional return

```cpp
std::optional<std::string> ReadConfig(const std::string& key) {
  auto file = OpenFile("config.txt");
  if (!file) return std::nullopt;

  for (const auto& line : file->Lines()) {
    auto [k, v] = SplitOnce(line, '=');
    if (k == key) return v;
  }
  return std::nullopt;
}

auto config = ReadConfig("api_url");
if (config) {
  Connect(*config);
}
```

### Variant cho parsing result

```cpp
struct Number  { double value; };
struct String  { std::string value; };
struct Boolean { bool value; };
struct Null    {};
struct Array   { std::vector<JsonValue> items; };
// ...

using JsonValue = std::variant<Number, String, Boolean, Null, Array>;
```

JSON parser tự nhiên dùng variant.

### State machine

```cpp
struct Idle {};
struct Connecting { int attempt; };
struct Connected { std::chrono::steady_clock::time_point since; };
struct Failed { std::string reason; };

using State = std::variant<Idle, Connecting, Connected, Failed>;

class Client {
 public:
  void Tick() {
    state_ = std::visit(overloaded{
      [](Idle) -> State { return Connecting{1}; },
      [](Connecting c) -> State {
        if (Try()) return Connected{std::chrono::steady_clock::now()};
        if (c.attempt >= 3) return Failed{"max retries"};
        return Connecting{c.attempt + 1};
      },
      [](Connected) -> State { return Idle{}; },
      [](Failed f) -> State { return f; },   // Stay failed
    }, state_);
  }

 private:
  State state_ = Idle{};
};
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Dereference empty `optional` với `*` | UB | Check `if (opt)` trước; hoặc `.value()` để throw |
| `optional<T>` với T = reference | Compile error | Dùng `optional<reference_wrapper<T>>` hoặc `T*` |
| `variant` access wrong type | `bad_variant_access` exception | `holds_alternative` check, hoặc `get_if` |
| Tuple với nhiều same-type fields | Confusing | Dùng struct |
| Forget `std::unexpected{...}` | Compile error | Wrap error vào `unexpected` |
| Visit lambda không handle hết type | Compile error | Bắt buộc cover hết types |
| Optional + side effect | Operation nhân đôi | Cache vào local |

## Tóm tắt

| Type | Khi nào dùng |
|---|---|
| `std::optional<T>` | Function "có thể không trả gì" |
| `std::variant<A, B, C>` | Sum type / tagged union |
| `std::tuple<...>` | Return multiple values temp |
| `std::pair<A, B>` | Map element, return 2 values |
| `std::expected<T, E>` (C++23) | Result với error detail |

## Analogy

| JS/TS / Rust | C++ |
|---|---|
| `T \| undefined` | `std::optional<T>` |
| `T \| null` | `std::optional<T>` |
| `Result<T, E>` (Rust) | `std::expected<T, E>` |
| `union { A; B; C; }` (TS) | `std::variant<A, B, C>` |
| `[T1, T2, T3]` tuple | `std::tuple<T1, T2, T3>` |

## Exercise (optional)

1. Viết `std::optional<int> SafeDivide(int a, int b)` trả nullopt nếu b = 0.
2. Implement JSON-like `Value` variant với `int`, `double`, `string`, `bool`, `list<Value>`, `map<string, Value>`.
3. Viết function parser nhỏ trả `std::variant<Success, Error>`. Visit để handle.
4. So sánh interface dùng `optional` vs return pointer null. Pros/cons cho trường hợp Find function.

---

**Bài kế tiếp** → [Bài 3: Error Handling Philosophy](03-error-handling-philosophy.md)
