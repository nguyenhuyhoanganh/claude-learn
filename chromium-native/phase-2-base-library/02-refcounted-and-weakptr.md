# Bài 2: RefCounted và WeakPtr

Bài này dạy:
- `base::RefCounted<T>` và `base::RefCountedThreadSafe<T>`.
- `scoped_refptr<T>`: smart pointer cho refcounted object.
- Khi nào dùng `scoped_refptr` vs `std::shared_ptr`.
- `base::WeakPtr<T>` và `base::WeakPtrFactory<T>`.
- `base::Unretained` vs `base::WeakPtr` trade-off.
- Anti-patterns thường gặp.

Kết thúc bài: bạn dùng RefCounted/WeakPtr đúng pattern, hiểu lifetime model của Chromium, tránh được use-after-free trong async code.

Prerequisite: [cpp/phase-3/01-smart-pointers](../../cpp/phase-3-modern-resource-mgmt/01-smart-pointers.md).

## Tại sao 2 hệ thống smart pointer?

Chromium có **2 lifetime model** chính (ngoài `unique_ptr`):

1. **`scoped_refptr<T>`** — reference-counted (like `shared_ptr`).
2. **`base::WeakPtr<T>`** — non-owning observer, auto-null on destroy.

stdlib có `shared_ptr`/`weak_ptr` — Chromium chọn tự build vì:

- Historical (pre-C++11).
- Tích hợp tốt hơn với threading model.
- Performance tuned cho Chromium use case.

→ Phần lớn code Chromium **prefer `scoped_refptr`** trên `shared_ptr`. Code mới có thể dùng `shared_ptr` khi không thread-safe concern.

## `base::RefCounted<T>` — base class

Để 1 class refcounted, derive từ `base::RefCounted<T>`:

```cpp
#include "base/memory/ref_counted.h"

class MyData : public base::RefCounted<MyData> {
 public:
  MyData() = default;

  void Process() { /* ... */ }

 private:
  // Destructor PRIVATE — only base::RefCounted can delete
  friend class base::RefCounted<MyData>;
  ~MyData() = default;

  // ... members ...
};
```

Key requirements:

1. Derive `public base::RefCounted<T>` (CRTP — T là class itself).
2. Destructor `private` + `friend class base::RefCounted<T>`.
3. Không allow stack instance.

Vì sao private dtor? Đảm bảo object **chỉ destroy qua refcount**, không phải stack/manual delete.

## `scoped_refptr<T>` — smart pointer

```cpp
#include "base/memory/scoped_refptr.h"

scoped_refptr<MyData> data = base::MakeRefCounted<MyData>();
data->Process();

// Copy = increment refcount
scoped_refptr<MyData> data2 = data;
// Now refcount = 2

data.reset();
// refcount = 1; object still alive (data2 holds)

data2.reset();
// refcount = 0; object destroyed
```

`scoped_refptr<T>` tương tự `shared_ptr<T>` nhưng:

- Refcount embedded trong object (1 alloc, vs `shared_ptr`'s 2).
- Faster, no separate control block.
- Specific to `base::RefCounted` derived class.

### `base::MakeRefCounted<T>(...)` — factory

```cpp
auto data = base::MakeRefCounted<MyData>(arg1, arg2);
```

Tương tự `std::make_shared`. Forward args tới ctor.

Old code có dùng `new MyData()` + `scoped_refptr<MyData>(raw_ptr)` — không safe. Modern Chromium: `MakeRefCounted`.

## `base::RefCountedThreadSafe<T>` — thread-safe

```cpp
class MyData : public base::RefCountedThreadSafe<MyData> {
 public:
  MyData() = default;

 private:
  friend class base::RefCountedThreadSafe<MyData>;
  ~MyData() = default;
};
```

Khác `RefCounted`:

- Atomic increment/decrement → safe để copy `scoped_refptr` từ multiple thread.
- Slight overhead cho atomic op.

**Khi nào dùng cái nào**:

- Object chỉ access từ 1 thread → `RefCounted` (faster).
- Object access từ nhiều thread → `RefCountedThreadSafe`.
- **Default**: `RefCountedThreadSafe` cho safety (cost minimal).

### Custom deletion thread

Object có thể create trên thread A, destroy trên thread B (khi refcount → 0). Đôi khi muốn destroy luôn trên thread A:

```cpp
class MyData : public base::RefCountedThreadSafe<MyData,
                                                  base::DeleteOnIOThread> {
  // ... ~MyData runs on IO thread
};
```

`DeleteOnIOThread` = predefined trait. Sẽ học sau khi thấy thread model.

## Khi nào `scoped_refptr<T>` vs `std::shared_ptr<T>`?

| Aspect | `scoped_refptr<T>` | `std::shared_ptr<T>` |
|---|---|---|
| Allocation | 1 alloc (embedded) | 2 alloc (object + control block) |
| Faster | Yes | No |
| Custom delete (thread) | Yes | Limited |
| Standard | Chromium | C++ stdlib |
| Available in Chromium | Yes | Yes |
| Default choice | ✓ (most cases) | When stdlib needed |

→ **Chromium default**: `scoped_refptr`. `std::shared_ptr` cho code interop với non-Chromium library.

## `base::WeakPtr<T>` — non-owning observer

```cpp
#include "base/memory/weak_ptr.h"

class MyObject {
 public:
  void StartAsync() {
    base::ThreadPool::PostTask(
        FROM_HERE,
        base::BindOnce(&MyObject::OnDone, weak_factory_.GetWeakPtr()));
  }

  void OnDone() {
    // Runs only if MyObject still alive
  }

 private:
  base::WeakPtrFactory<MyObject> weak_factory_{this};   // MUST be last member
};

// Usage
MyObject obj;
obj.StartAsync();
// ... if obj destroyed before async work completes, OnDone() not called
```

### `WeakPtrFactory<T>` — produces WeakPtr

```cpp
class MyClass {
 public:
  base::WeakPtr<MyClass> GetWeakPtr() {
    return weak_factory_.GetWeakPtr();
  }

 private:
  base::WeakPtrFactory<MyClass> weak_factory_{this};
};

MyClass obj;
base::WeakPtr<MyClass> weak = obj.GetWeakPtr();

if (weak) {                  // Valid if obj alive
  weak->Method();
}

// After obj destroyed
if (weak) { ... }            // false — auto invalidated
```

### Use cases

✅ **Async callback**:

```cpp
base::BindOnce(&MyClass::OnDone, weak_factory_.GetWeakPtr());
```

Callback `Run()` automatically cancel nếu object destroyed.

✅ **Observer pattern** (sometimes):

```cpp
class Subject {
  std::vector<base::WeakPtr<Observer>> observers_;
};
```

✅ **Cache** referencing object you don't own.

❌ **KHÔNG dùng cho lifetime control** — WeakPtr doesn't extend lifetime.

### `WeakPtrFactory` as last member

```cpp
class MyClass {
 public:
  // ... methods ...

 private:
  int data_;
  std::string name_;
  // ... other members ...

  base::WeakPtrFactory<MyClass> weak_factory_{this};   // ← LAST!
};
```

**Why last?** Destruction order: members destroyed in **reverse declaration order**. `weak_factory_` destroyed first → invalidate WeakPtr **before** other members destroyed. This prevents callbacks from accessing partially-destroyed object.

→ Chromium presubmit warns if `WeakPtrFactory` not last member.

### Thread restriction

`WeakPtr` chỉ valid trên **same sequence** (thread/sequence) nơi `WeakPtrFactory` created.

```cpp
class MyClass {
 public:
  MyClass() : weak_factory_(this) {
    // weak_factory_ tied to current thread
  }

  void DoSomething() {
    auto wp = weak_factory_.GetWeakPtr();
    // wp tied to thread where MyClass created
  }

 private:
  base::WeakPtrFactory<MyClass> weak_factory_;
};
```

Pass `WeakPtr` qua thread khác → use sequence-bound, callback fire on bound thread. Sẽ học sâu khi đến TaskRunner (Bài 3).

## `base::Unretained` vs `base::WeakPtr`

```cpp
// Unretained — caller promise lifetime
base::BindOnce(&MyClass::OnDone, base::Unretained(this));

// WeakPtr — auto cancel if destroyed
base::BindOnce(&MyClass::OnDone, weak_factory_.GetWeakPtr());
```

| | `base::Unretained` | `base::WeakPtr` |
|---|---|---|
| Lifetime check | None (caller promises) | Auto |
| Performance | Faster (no factory) | Slight overhead |
| Crash if destroyed | Yes (UAF) | No (silently skip) |
| Code clarity | Implicit assumption | Explicit safety |
| When safe to use | Lifetime obvious (sync, parent owns child) | Async, unknown lifetime |

**Quy tắc Chromium**:

- **Sync call, parent owns**: `Unretained` OK.
- **Async, lifetime uncertain**: `WeakPtr` required.
- **Default**: prefer `WeakPtr` để safety.

### Pattern: parent owns child, sync callback

```cpp
class Parent {
 public:
  void DoWork() {
    child_.RunSync(
        base::BindOnce(&Parent::OnDone, base::Unretained(this)));
    // child runs callback before returning; Parent is alive
  }

  void OnDone() { ... }

 private:
  Child child_;
};
```

OK because:

1. Callback runs synchronously trong `RunSync`.
2. `this` lives throughout.

### Pattern: async, WeakPtr

```cpp
class MyHandler {
 public:
  void Start() {
    fetcher_->FetchAsync(
        url,
        base::BindOnce(&MyHandler::OnFetched, weak_factory_.GetWeakPtr()));
  }

  void OnFetched(std::string data) { ... }

 private:
  Fetcher* fetcher_;  // Owned elsewhere
  base::WeakPtrFactory<MyHandler> weak_factory_{this};
};
```

If `MyHandler` destroyed before fetch completes, `OnFetched` silently skipped.

## scoped_refptr vs WeakPtr — when to use which

```cpp
// Object lifetime tied to callback (must survive)
auto refcounted = base::MakeRefCounted<MyData>();
base::BindOnce(&Process, refcounted);
// Callback hold strong ref → MyData survives until callback dies

// Object lifetime independent; callback safe-skip
class MyHandler { ... };
MyHandler handler;
base::BindOnce(&MyHandler::Run, handler.GetWeakPtr());
// MyHandler can destroy any time; callback no-op
```

| Need | Use |
|---|---|
| Keep object alive | `scoped_refptr` |
| Don't extend lifetime, skip if destroyed | `WeakPtr` |
| Object guaranteed alive (sync) | `Unretained` |

## Real Chromium example

```cpp
// chrome/browser/foo/foo_service.h
class FooService : public KeyedService {
 public:
  void FetchAsync(base::OnceCallback<void(int)> callback);

 private:
  void OnFetchDone(base::OnceCallback<void(int)> callback, int result);

  base::WeakPtrFactory<FooService> weak_factory_{this};
};
```

```cpp
// foo_service.cc
void FooService::FetchAsync(base::OnceCallback<void(int)> callback) {
  base::ThreadPool::PostTaskAndReplyWithResult(
      FROM_HERE,
      base::BindOnce(&ExpensiveCompute),
      base::BindOnce(&FooService::OnFetchDone,
                     weak_factory_.GetWeakPtr(),
                     std::move(callback)));
}

void FooService::OnFetchDone(base::OnceCallback<void(int)> callback, int result) {
  std::move(callback).Run(result);
}
```

Pattern:

1. Async work via `ThreadPool`.
2. Reply callback bound với `WeakPtr` → auto skip nếu `FooService` destroyed.
3. User callback forwarded to `OnFetchDone` to ensure proper lifecycle.

## Anti-patterns

### ❌ Anti-pattern 1: `Unretained` cho async lifetime uncertain

```cpp
class Handler {
 public:
  void Start() {
    base::ThreadPool::PostTask(
        FROM_HERE,
        base::BindOnce(&Handler::OnDone, base::Unretained(this)));
    // BUG if Handler destroyed before task runs
  }
};
```

Fix: `WeakPtr`.

### ❌ Anti-pattern 2: WeakPtrFactory not last

```cpp
class Foo {
 private:
  base::WeakPtrFactory<Foo> weak_factory_{this};
  std::string state_;   // ← Wrong: state_ destroyed BEFORE weak_factory_
};
```

Fix: move `weak_factory_` to last member.

### ❌ Anti-pattern 3: scoped_refptr for non-shared object

```cpp
class Owned : public base::RefCountedThreadSafe<Owned> { ... };

auto p = base::MakeRefCounted<Owned>();
// Only 1 owner, no sharing... why refcount?
```

Use `unique_ptr` instead.

### ❌ Anti-pattern 4: scoped_refptr for short-lived

```cpp
void Foo() {
  auto p = base::MakeRefCounted<Data>();
  // ... use p locally ...
}  // destroy
```

Just use stack object or `unique_ptr`.

### ❌ Anti-pattern 5: Manual `AddRef`/`Release`

```cpp
data->AddRef();
data->Release();
```

Always use `scoped_refptr`. Manual is error-prone.

## Tóm tắt

| Tool | Use case |
|---|---|
| `base::RefCounted<T>` | Refcount, single-threaded |
| `base::RefCountedThreadSafe<T>` | Refcount, multi-threaded (default) |
| `scoped_refptr<T>` | Smart pointer for refcounted |
| `base::MakeRefCounted<T>` | Factory (always use) |
| `base::WeakPtr<T>` | Auto-cancel observer |
| `base::WeakPtrFactory<T>` | Produces WeakPtr (must be LAST member) |
| `base::Unretained(p)` | Caller-guaranteed lifetime; risky |

## Comparison

| Chromium | stdlib | Use case |
|---|---|---|
| `scoped_refptr<T>` | `std::shared_ptr<T>` | Shared ownership |
| `base::WeakPtr<T>` | `std::weak_ptr<T>` | Non-owning observer |
| (no equivalent) | `std::unique_ptr<T>` | Exclusive ownership |

Chromium **also** uses `std::unique_ptr<T>` directly — it's the C++ stdlib smart pointer.

## Exercise (optional)

1. Tìm 1 class trong Chromium derive từ `base::RefCounted`. Note destructor private + friend pattern.
2. Convert `std::shared_ptr<MyClass>` to `scoped_refptr<MyClass>`. Note changes.
3. Tạo lifecycle test: `WeakPtrFactory` + async callback. Destroy object mid-flight, verify callback silently skipped.
4. So sánh ASan output: `Unretained` vs `WeakPtr` khi object destroyed before callback fires.

---

**Bài kế tiếp** → [Bài 3: TaskRunners và Threading](03-task-runners-and-threading.md)
