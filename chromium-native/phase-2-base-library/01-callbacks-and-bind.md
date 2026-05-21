# Bài 1: Callbacks và Bind

Bài này dạy:
- `base::OnceCallback<R(Args...)>` vs `base::RepeatingCallback<R(Args...)>`.
- `base::BindOnce(...)` và `base::BindRepeating(...)`.
- Bind method pointer + receiver: `base::BindOnce(&Class::Method, instance)`.
- Bind argument: by value, `std::ref`, `base::Unretained`, `base::WeakPtr`.
- `base::OnceClosure` / `base::RepeatingClosure` — callback void(void).
- So sánh với `std::function`: vì sao Chromium có riêng.

Kết thúc bài: bạn đọc và viết được code dùng `base::Bind*`/`OnceCallback`, hiểu khi nào dùng `Unretained` vs `WeakPtr`, tránh được dangling callback.

Prerequisite: [cpp/phase-4/04-lambdas-and-callables](../../cpp/phase-4-templates-and-stl/04-lambdas-and-callables.md), [cpp/phase-3/02-move-semantics](../../cpp/phase-3-modern-resource-mgmt/02-move-semantics.md).

## Tại sao callback?

Browser là async. Bạn không thể block UI thread đợi disk read. Pattern:

```cpp
// Async: trigger work, callback khi xong
ReadFileAsync("foo.txt", base::BindOnce(&OnReadDone));

void OnReadDone(std::string contents) {
  // ... process contents ...
}
```

Callback = "tôi sẽ gọi lại bạn khi xong việc". Xuất hiện ở mọi async API trong Chromium.

## `base::OnceCallback` vs `base::RepeatingCallback`

```cpp
#include "base/functional/callback.h"
#include "base/functional/bind.h"

base::OnceCallback<void(int)> cb_once;       // Run-once callback
base::RepeatingCallback<void(int)> cb_rep;   // Run-multiple-times callback
```

### OnceCallback — move-only, run-once

```cpp
base::OnceCallback<int(int)> cb = base::BindOnce([](int x) { return x * 2; });

int result = std::move(cb).Run(5);   // = 10
// cb is now empty (moved-from); calling again is UB
```

`OnceCallback` chỉ chạy được 1 lần. Sau `.Run()` (qua `std::move`), object becomes empty.

**Vì sao move-only?**

- Có thể bind move-only argument (e.g., `unique_ptr<T>`).
- Compiler enforce "1 lần" tại compile time.
- ASan-friendly (no shared state).

### RepeatingCallback — copyable, run-many-times

```cpp
base::RepeatingCallback<int(int)> cb = base::BindRepeating([](int x) { return x * 2; });

cb.Run(5);    // 10
cb.Run(10);   // 20

base::RepeatingCallback<int(int)> cb2 = cb;   // Copy OK
cb2.Run(15);   // 30
```

Khi nào dùng cái nào:

| | OnceCallback | RepeatingCallback |
|---|---|---|
| Copy? | No (move-only) | Yes |
| Run multiple times? | No | Yes |
| Bind `unique_ptr`? | Yes | No (need copy) |
| Default choice | ✓ | Only when needed |

→ **Default `OnceCallback`** trừ khi cần copy hoặc gọi nhiều lần.

### `base::OnceClosure` / `base::RepeatingClosure`

Alias cho callback void(void):

```cpp
base::OnceClosure cb1 = base::BindOnce([]() { std::cout << "fired"; });
base::RepeatingClosure cb2 = base::BindRepeating([]() { /* ... */ });
```

Tương đương:

- `base::OnceClosure` = `base::OnceCallback<void()>`.
- `base::RepeatingClosure` = `base::RepeatingCallback<void()>`.

## `base::BindOnce` / `base::BindRepeating`

### Bind function

```cpp
void Greet(const std::string& name) {
  std::cout << "Hello " << name;
}

auto cb = base::BindOnce(&Greet, "World");
std::move(cb).Run();   // "Hello World"
```

`BindOnce(callable, args...)` bind:

1. Function/lambda/method pointer + 
2. Pre-bound arguments.

Result là callback nhận remaining arguments.

```cpp
void Add(int a, int b, int c);

auto cb1 = base::BindOnce(&Add, 1, 2, 3);  // No remaining args
std::move(cb1).Run();                       // Add(1, 2, 3)

auto cb2 = base::BindOnce(&Add, 1);          // c remaining
std::move(cb2).Run(2, 3);                    // Add(1, 2, 3)

base::OnceCallback<void(int, int, int)> cb3 = base::BindOnce(&Add);
std::move(cb3).Run(1, 2, 3);
```

### Bind lambda

```cpp
auto cb = base::BindOnce([](int x, int y) {
  std::cout << x + y;
}, 5);

std::move(cb).Run(10);   // 15
```

### Bind method pointer

```cpp
class Calculator {
 public:
  int Add(int a, int b) { return a + b; }
};

Calculator c;

auto cb = base::BindOnce(&Calculator::Add, base::Unretained(&c), 5);
std::move(cb).Run(10);   // 15
```

`base::Unretained(&c)` = "tôi đảm bảo `c` còn alive khi callback chạy".

⚠️ **Bẫy lớn**: nếu `c` destroy trước khi callback chạy → use-after-free → crash.

## Lifetime: ai phải sống khi callback chạy?

Đây là **vấn đề khó nhất** với callback. Có 4 cách handle:

### 1. `base::Unretained(ptr)` — caller guarantee

```cpp
auto cb = base::BindOnce(&MyClass::Method, base::Unretained(this));
```

Bạn promise compiler: "object sẽ còn alive khi callback chạy". Compile pass, nhưng **bạn phải verify**.

**Use case**: callback chạy synchronously hoặc trong scope đảm bảo lifetime.

### 2. `base::WeakPtr<T>` — auto-cancel nếu object gone

```cpp
class MyClass {
 public:
  void Start() {
    auto cb = base::BindOnce(&MyClass::OnDone, weak_factory_.GetWeakPtr());
    AsyncWork(std::move(cb));
  }

  void OnDone(int result) { ... }

 private:
  base::WeakPtrFactory<MyClass> weak_factory_{this};
};
```

Nếu `MyClass` destroy trước khi `OnDone` được gọi → callback **không chạy** (silently).

**Use case**: async callback nơi object có thể destroy trước.

→ **Idiomatic Chromium async pattern**. Sẽ học detail ở Bài 2.

### 3. `scoped_refptr<T>` / `base::RetainedRef(x)` — keep alive

```cpp
auto refcounted = base::MakeRefCounted<MyClass>();
auto cb = base::BindOnce(&MyClass::Method, refcounted);
// Object kept alive bằng refcount trong callback
```

Callback hold strong reference → object sống ít nhất tới khi callback destroy.

**Use case**: object phải sống đến hết callback execution.

### 4. Pass `unique_ptr` → move into callback

```cpp
auto data = std::make_unique<Data>();
auto cb = base::BindOnce([](std::unique_ptr<Data> d) {
  d->Process();
}, std::move(data));
std::move(cb).Run();
```

Data lifetime tied to callback.

## Bind argument

### By value (default)

```cpp
int x = 42;
auto cb = base::BindOnce([](int y) { std::cout << y; }, x);
// x copied into callback storage
std::move(cb).Run();   // 42
```

Argument được copy/move vào callback storage.

### Move-only (`unique_ptr`)

```cpp
auto data = std::make_unique<Data>();
auto cb = base::BindOnce(&Process, std::move(data));
// data moved into callback
```

`OnceCallback` support move-only argument. `RepeatingCallback` không (because copy needed).

### Reference (`std::ref`)

```cpp
int counter = 0;
auto cb = base::BindOnce([](int& c) { ++c; }, std::ref(counter));
std::move(cb).Run();
std::cout << counter;  // 1
```

⚠️ Bẫy: same as Unretained — caller phải đảm bảo lifetime.

### `base::Owned` — transfer ownership of raw pointer

```cpp
auto cb = base::BindOnce(&Process, base::Owned(new Data()));
// callback owns the pointer; deletes when callback destroyed
```

Hiếm dùng — prefer `unique_ptr` + `std::move`.

## Compose callback

### Pass callback to function

```cpp
void ReadFileAsync(const std::string& path,
                   base::OnceCallback<void(std::string)> callback) {
  // ... do async work ...
  std::move(callback).Run(contents);
}

ReadFileAsync("foo.txt",
              base::BindOnce(&OnFileRead, base::Unretained(this)));
```

### Chain callback

```cpp
void Stage1(base::OnceClosure done) {
  // ... work ...
  std::move(done).Run();
}

void Stage2(base::OnceClosure done) {
  // ... work ...
  std::move(done).Run();
}

Stage1(base::BindOnce(&Stage2, base::BindOnce([]() {
  std::cout << "All done";
})));
```

Chain async callbacks. Tương tự promise chain trong JS — nhưng verbose hơn.

## So sánh với `std::function`

| Aspect | `std::function<T>` | `base::OnceCallback<T>` |
|---|---|---|
| Move-only | No (copyable) | Yes |
| Run-once enforcement | No | Yes (compile-time) |
| Bind move-only arg | No | Yes |
| WeakPtr support | Manual | Built-in (`base::BindOnce(..., weak_ptr)`) |
| Memory allocator | Default | Chromium-optimized |
| ASan friendly | Manual | Yes (one-shot semantics) |

→ Chromium dùng `OnceCallback`/`RepeatingCallback` khắp nơi. `std::function` rất hiếm.

## Real Chromium example

From `chrome/browser/`:

```cpp
// Async load profile from disk
void ProfileManager::LoadProfileAsync(
    const base::FilePath& path,
    base::OnceCallback<void(Profile*)> callback) {
  // ... start async work ...
  // ... when done, run callback ...
  std::move(callback).Run(profile);
}

// Caller
class MyHandler {
 public:
  void Init(const base::FilePath& profile_path) {
    ProfileManager::Get()->LoadProfileAsync(
        profile_path,
        base::BindOnce(&MyHandler::OnProfileLoaded,
                       weak_factory_.GetWeakPtr()));
  }

 private:
  void OnProfileLoaded(Profile* profile) {
    // ... callback runs back here, or skipped if MyHandler destroyed
  }

  base::WeakPtrFactory<MyHandler> weak_factory_{this};
};
```

Pattern:

1. Async API takes `OnceCallback`.
2. Caller bind member method + WeakPtr (auto-cancel if destroyed).
3. Storage: callback object hold WeakPtr + bound args.

## `BarrierClosure` — N-shot synchronization

```cpp
auto on_all_done = base::BindOnce([]() {
  std::cout << "All N tasks complete";
});

base::RepeatingClosure each_done =
    base::BarrierClosure(3, std::move(on_all_done));

// Run each_done 3 times — only on 3rd call, all_done fires
each_done.Run();   // 1/3
each_done.Run();   // 2/3
each_done.Run();   // 3/3 → "All N tasks complete"
```

Pattern thường khi async N tasks parallel, callback khi all done.

## `BindRepeating` cho Observer pattern

```cpp
class FooObserver {
 public:
  virtual void OnFooChanged(int new_value) = 0;
};

class Foo {
 public:
  using ChangeCallback = base::RepeatingCallback<void(int)>;

  void AddObserver(ChangeCallback cb) {
    callbacks_.push_back(std::move(cb));
  }

  void NotifyAll(int new_value) {
    for (const auto& cb : callbacks_) {
      cb.Run(new_value);   // RepeatingCallback can be called multiple times
    }
  }

 private:
  std::vector<ChangeCallback> callbacks_;
};
```

(In practice Chromium uses `base::ObserverList<>` instead — see future bài.)

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| `Unretained` + async + destroy | Use-after-free | Dùng `WeakPtr` hoặc verify lifetime |
| Quên `std::move(cb).Run()` | OnceCallback run twice (UB sau lần 1) | `std::move` explicit |
| Bind lvalue (no `std::move`) cho move-only | Compile error | `std::move` argument |
| `RepeatingCallback` with `unique_ptr` | Compile error | Use `OnceCallback` |
| `BindOnce` lambda with capture | OK, but capture by value default | Reference capture for shared state |
| Run already-run OnceCallback | UB | Check `cb` before run |
| `Unretained(this)` async | Crash if `this` deleted | `weak_factory_.GetWeakPtr()` |

## Tóm tắt

| Tool | Use case |
|---|---|
| `base::OnceCallback<T>` | Default async callback |
| `base::RepeatingCallback<T>` | Observer, repeated invocation |
| `base::OnceClosure` | `OnceCallback<void()>` alias |
| `base::BindOnce` | Bind for OnceCallback |
| `base::BindRepeating` | Bind for RepeatingCallback |
| `base::Unretained(ptr)` | Caller guarantee lifetime — risky |
| `base::WeakPtr<T>` (via `weak_factory_.GetWeakPtr()`) | Auto-cancel if destroyed — idiomatic |
| `scoped_refptr<T>` | Keep object alive via refcount |
| `BarrierClosure` | Wait for N async to all complete |

## Khác biệt key với stdlib

| stdlib | Chromium |
|---|---|
| `std::function<R(Args...)>` | `base::RepeatingCallback<R(Args...)>` |
| Lambda + `std::bind` | `base::BindOnce/BindRepeating` |
| Manual lifetime | `base::Unretained` / `WeakPtr` / refcount |

Chromium's design tuned for:

- Async heavy code (browser).
- Crash safety (WeakPtr auto-cancel).
- Cross-thread (callback can be passed to PostTask).

## Exercise (optional)

1. Đọc 1 file Chromium dùng `base::BindOnce` với `WeakPtr`. Tìm bằng cs.chromium.org: `"base::BindOnce" "weak_factory_"`.
2. Implement `class AsyncWorker` với method `Start(base::OnceCallback<void(int)> done)`. Test bind lambda, bind member method.
3. Convert sample code dùng `std::function` sang `base::OnceCallback`.
4. Write code intentionally use `Unretained` rồi destroy object → ASan catch use-after-free.

---

**Bài kế tiếp** → [Bài 2: RefCounted và WeakPtr](02-refcounted-and-weakptr.md)
