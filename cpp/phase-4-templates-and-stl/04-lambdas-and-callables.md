# Bài 4: Lambdas và Callables

Bài này dạy:
- Lambda syntax đầy đủ: `[capture](params) -> ret { body }`.
- Capture mode: `[=]`, `[&]`, `[var]`, `[&var]`, `[this]`, init capture.
- `std::function<R(Args...)>`: type-erased callable wrapper.
- `std::bind` (nhắc qua, thường prefer lambda).
- Function pointer cơ bản.
- Analogy với JS function/closure.

Kết thúc bài: bạn viết được lambda đúng capture (tránh dangling), biết khi nào dùng `std::function`, hiểu cost của abstraction.

## Lambda là gì?

**Lambda** = anonymous function — function viết inline tại nơi cần dùng.

```cpp
// Function thường
int Square(int x) { return x * x; }

// Lambda equivalent
auto square = [](int x) { return x * x; };

square(5);   // 25
```

Lambda compile thành **unnamed class** với `operator()`. Đây là "function object" / "functor".

Use case phổ biến:

- Predicate cho algorithm: `std::find_if(begin, end, [](T x) { ... })`.
- Callback: pass function tới async API.
- Inline transform: `std::transform(begin, end, dst, [](T x) { return ... })`.

**Analogy với JS**:

```javascript
const square = (x) => x * x;
arr.find(x => x > 5);
arr.map(x => x * 2);
```

C++ lambda tương tự arrow function. Khác biệt: capture phải explicit (sẽ học dưới).

## Cú pháp đầy đủ

```cpp
[capture](params) mutable noexcept -> ret_type { body }
```

| Phần | Ý nghĩa |
|---|---|
| `[capture]` | List of variable captured từ enclosing scope |
| `(params)` | Parameter list |
| `mutable` | Optional — cho phép modify captured-by-value var |
| `noexcept` | Optional — không throw |
| `-> ret_type` | Optional — explicit return type |
| `{ body }` | Function body |

Phần đơn giản nhất:

```cpp
auto add = [](int a, int b) { return a + b; };
```

Lambda với return type explicit (cần khi compiler không suy được):

```cpp
auto select = [](bool flag) -> double {
  return flag ? 1 : 0.5;
  // Không có explicit, compiler có thể fail vì 2 branch khác type
};
```

## Capture mode

Khác biệt cốt lõi với regular function: lambda có thể **capture** variable từ enclosing scope.

### `[=]` — capture all by value (copy)

```cpp
int x = 10;
auto f = [=]() { return x + 1; };
// f là object lưu COPY của x

x = 100;
std::cout << f();   // 11 (captured x = 10, không phải 100)
```

### `[&]` — capture all by reference

```cpp
int x = 10;
auto f = [&]() { return x + 1; };
// f lưu reference tới x

x = 100;
std::cout << f();   // 101
```

### `[var]` — capture cụ thể by value

```cpp
int x = 10, y = 20;
auto f = [x]() { return x + 5; };   // Capture chỉ x by value
// y không capture
```

### `[&var]` — capture cụ thể by reference

```cpp
int x = 10;
auto f = [&x]() { x = 100; };   // Capture x by reference
f();
std::cout << x;   // 100
```

### Mix

```cpp
int a = 1, b = 2, c = 3;
auto f = [a, &b, &c]() { return a + b + c; };   // a by value; b, c by reference
```

```cpp
auto f = [=, &b]() { return ... };   // All by value EXCEPT b (by ref)
auto f = [&, a]() { return ... };    // All by reference EXCEPT a (by value)
```

### `[this]` — capture this pointer

```cpp
class Widget {
 public:
  void Start() {
    int timeout = 5000;
    auto callback = [this, timeout]() {
      DoWork();             // OK — gọi method qua this
      std::cout << "after " << timeout;
    };
    Schedule(callback);
  }

  void DoWork() {}
};
```

`[this]` capture pointer to enclosing object. Cho phép gọi member method, access member.

**Bẫy lớn**: `[this]` chỉ capture pointer, KHÔNG extend object lifetime. Nếu object destroy trước khi lambda chạy → UB.

```cpp
void Foo() {
  auto* w = new Widget();
  auto cb = [w]() { w->DoWork(); };
  delete w;
  cb();   // UB — w deleted
}
```

→ **Async lambda với `this`**: dùng `WeakPtr` (Chromium pattern) hoặc `shared_ptr` để extend lifetime. Sẽ học chi tiết ở `chromium-native/phase-2/02-refcounted-and-weakptr.md`.

### `[*this]` (C++17+) — capture *this by value

```cpp
auto cb = [*this]() { /* dùng copy của object */ };
```

Tạo copy entire object trong lambda. Hữu ích cho async không muốn dangling.

### Init capture (C++14+)

```cpp
int x = 10;
auto f = [y = x * 2]() { return y; };  // Init capture
f();   // 20

// Hữu ích cho move
auto p = std::make_unique<Widget>();
auto cb = [p = std::move(p)]() { p->DoWork(); };  // Move unique_ptr vào lambda
```

Init capture cho phép initialize captured variable với expression — không cần biến cùng tên ở enclosing scope.

## Mutable lambda

Default lambda's `operator()` là `const` — không modify captured value:

```cpp
int x = 10;
auto f = [x]() {
  // x = 20;   // ERROR — x is const inside lambda
  return x;
};
```

Thêm `mutable` để cho phép:

```cpp
auto f = [x]() mutable {
  x = 20;   // OK
  return x;
};

f();   // 20
// x bên ngoài vẫn = 10 (vì captured by value)
```

## Lambda type — không in toString

Mỗi lambda có **unique unnamed type**. Hai lambda cùng body cũng khác type:

```cpp
auto f1 = []() { return 1; };
auto f2 = []() { return 1; };
// decltype(f1) != decltype(f2)
```

→ Không thể declare `lambda_type x = ...`. Phải dùng `auto`.

Để pass/store lambda với specific signature: dùng `std::function`.

## `std::function<R(Args...)>`

```cpp
#include <functional>

std::function<int(int)> square = [](int x) { return x * x; };
std::function<int(int, int)> add = [](int a, int b) { return a + b; };

square(5);   // 25
```

`std::function` là **type-erased callable** — wrap bất kỳ callable nào với signature matching.

### Use case

```cpp
class EventBus {
 public:
  void Subscribe(std::function<void(const Event&)> handler) {
    handlers_.push_back(std::move(handler));
  }

  void Fire(const Event& e) {
    for (auto& h : handlers_) h(e);
  }

 private:
  std::vector<std::function<void(const Event&)>> handlers_;
};

// Subscribe lambda
bus.Subscribe([](const Event& e) { std::cout << "got event"; });

// Subscribe function
void Handle(const Event& e) {}
bus.Subscribe(Handle);

// Subscribe bound member
class Listener {
 public:
  void OnEvent(const Event& e) {}
};
Listener l;
bus.Subscribe([&l](const Event& e) { l.OnEvent(e); });
```

`std::function` flexible nhưng có overhead:

- Heap allocation (cho captured state).
- Indirect call (virtual-like).
- Copyable (nếu wrap copyable callable).

### Khi nào dùng `std::function`?

- Store callback có signature variable.
- Container of callbacks.
- Public API muốn nhận bất kỳ callable.

### Khi nào KHÔNG dùng `std::function`?

- Hot path — overhead matters.
- Single use lambda → pass to template:

```cpp
// Template — no overhead
template <typename F>
void Process(F callback) {
  callback();
}

// std::function — overhead
void Process2(std::function<void()> callback) {
  callback();
}
```

STL algorithm dùng template (no overhead).

### `std::function` vs Chromium `base::OnceCallback`

| Aspect | `std::function` | `base::OnceCallback` |
|---|---|---|
| Move-only? | No (copyable) | Yes (move-only) |
| Bind member with WeakPtr? | Manual | `base::BindOnce(..., weak_factory_.GetWeakPtr())` |
| ASan-friendly? | Maybe | Yes |
| Use in Chromium | Hiếm | Khắp nơi |

Chromium prefer `base::OnceCallback` / `base::RepeatingCallback`. Sẽ học ở `chromium-native/phase-2/01-callbacks-and-bind.md`.

## `std::bind` — nhắc qua

```cpp
#include <functional>

int Add(int a, int b) { return a + b; }

auto add5 = std::bind(Add, 5, std::placeholders::_1);
add5(10);   // 15 — equivalent Add(5, 10)
```

`std::bind` partial application. Tuy nhiên modern C++ **prefer lambda** vì:

- Compile faster.
- Read clearer.
- More flexible (capture, init capture).

```cpp
// std::bind — old style
auto f = std::bind(Add, 5, std::placeholders::_1);

// Lambda — modern, clearer
auto f = [](int x) { return Add(5, x); };
```

→ **Rule modern C++**: prefer lambda. `std::bind` chỉ thấy trong legacy code.

## Function pointer

Plain C function pointer:

```cpp
int Add(int a, int b) { return a + b; }

int (*fp)(int, int) = &Add;   // Function pointer
int (*fp2)(int, int) = Add;    // & implicit

fp(3, 4);   // 7
```

Verbose, ít dùng modern C++. Có use case khi:

- Interop với C API (callback C-style).
- Performance critical (faster than std::function khi không cần state).

```cpp
// Sort with function pointer
int Compare(const void* a, const void* b);
qsort(arr, n, sizeof(int), Compare);   // C API
```

## Lambda recipes

### Sort by member

```cpp
std::vector<User> users;
std::sort(users.begin(), users.end(),
          [](const User& a, const User& b) {
            return a.age < b.age;
          });
```

### Find with condition

```cpp
auto it = std::find_if(users.begin(), users.end(),
                       [](const User& u) { return u.is_active; });
```

### Capture by move (init capture)

```cpp
auto data = std::make_unique<Data>();
auto cb = [data = std::move(data)]() {
  data->Process();
};
// data outside is now nullptr
```

### Generic lambda (C++14+)

```cpp
auto print = [](const auto& x) { std::cout << x; };
print(5);          // OK — auto = int
print("hello");    // OK — auto = const char*
print(3.14);       // OK — auto = double
```

`auto` trong lambda param = template parameter implicit. Mỗi call có thể infer khác.

### Recursive lambda

Lambda khó tự gọi mình. Workaround:

```cpp
std::function<int(int)> factorial = [&factorial](int n) -> int {
  return n <= 1 ? 1 : n * factorial(n - 1);
};
factorial(5);   // 120
```

Phải dùng `std::function` để có "tên" mà lambda capture được. Recursive lambda thường ít clean — prefer regular function.

### Đếm trong container

```cpp
int n = std::count_if(v.begin(), v.end(),
                      [](int x) { return x > 0; });
```

### Cleanup with lambda + ScopeGuard

```cpp
auto cleanup = [&]() { ReleaseResource(); };
// ScopeGuard wraps cleanup → call khi out of scope
```

## Pattern Chromium

### Async với base::BindOnce + lambda

Chromium pattern thường:

```cpp
// Lambda cho callback async
base::ThreadPool::PostTaskAndReplyWithResult(
    FROM_HERE, {base::TaskPriority::USER_VISIBLE},
    base::BindOnce(&ComputeExpensive),
    base::BindOnce([](int result) {
      LOG(INFO) << "Got result: " << result;
    }));
```

(Sẽ học `base::BindOnce` ở `chromium-native/phase-2`.)

## Lambda vs function vs functor

| Aspect | Lambda | Free function | Functor (struct + operator()) |
|---|---|---|---|
| Capture state? | Yes | No | Yes (via member) |
| Inline definition? | Yes | No | No |
| Type unique? | Yes (unnamed) | No | Yes (named) |
| Compile speed | Medium | Best | Best |
| Use with template | Yes | Yes | Yes |
| Use with std::function | Yes | Yes | Yes |
| Use with function pointer | Only if no capture | Yes | No (functor is class) |

Modern C++ default: lambda. Functor explicit khi:

- Cần reuse functor type (template instantiate).
- Cần member function khác `operator()`.
- Lambda capture phức tạp → functor class cleaner.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| `[&]` lambda survive scope → dangling reference | UB | Dùng `[=]` hoặc capture cụ thể, hoặc kéo dài lifetime |
| `[this]` lambda async sau object destroy | UB | `WeakPtr` (Chromium) hoặc `[shared_from_this()]` |
| `[=]` capture pointer rồi pointer dangling | UB | Hiểu capture by value = copy pointer, không object |
| Mutable lambda nghĩ modify outer var | Không (captured by value = independent copy) | `[&]` nếu thực sự muốn modify outer |
| `std::function` hot path | Slow | Dùng template generic |
| Recursive lambda với `auto` | Compile error (can't reference self) | `std::function` hoặc named function |
| Capture default value với reference | Captured ref to temporary | Cẩn thận init capture |
| Forget `noexcept` khi cần | Container fallback non-move | Mark `noexcept` lambda khi không throw |

## Tóm tắt

| Concept | Take-away |
|---|---|
| Lambda | Anonymous function; có capture, type unnamed |
| Capture mode | `[=]` value, `[&]` ref, `[var]`, `[&var]`, `[this]` |
| Init capture (C++14) | `[name = expr]` — move, custom name |
| Mutable | Cho phép modify captured-by-value |
| `std::function<R(Args...)>` | Type-erased callable; flexible, overhead |
| Generic lambda (C++14) | `auto` param = template implicit |
| Use case | Algorithm predicate, callback, scope guard |
| Chromium | Prefer `base::OnceCallback` / `base::BindOnce` for async |

## Analogy với JS

| JS | C++ |
|---|---|
| `(x) => x * x` | `[](int x) { return x * x; }` |
| `arr.map(x => x * 2)` | `std::transform(begin, end, dst, [](int x) { return x * 2; })` |
| Closure capture (implicit) | `[&]` (all by ref) or `[=]` (all by value) |
| `function fn(x) { ... }` | Lambda or `std::function` for storage |
| `() => this.foo()` (arrow keeps this) | `[this]() { foo(); }` (explicit) |

C++ phải explicit capture. JS arrow function tự lexical scope (capture all by reference, sort of).

## Exercise (optional)

1. Viết `Sort(std::vector<User>&)` sort theo 3 field khác nhau (age, name, id) bằng 3 lambda khác.
2. Implement `Retry(int times, std::function<bool()> action)` — call action tối đa N lần, return true nếu thành công.
3. Init capture move `std::unique_ptr<Data>` vào lambda. Verify caller's pointer null.
4. Generic lambda `print` log mọi type ra console. Test với int, string, vector.

---

**Phase kế** → [Phase 5: Modern Features và Error Handling](../phase-5-modern-features-errors/01-auto-and-bindings.md)
