# Bài 3: RAII và Rule of Five

Bài này dạy:
- RAII principle — pattern cốt lõi của C++ modern.
- Idioms RAII: `std::lock_guard`, file handle, scope guard.
- Rule of 0: design class không cần manual special member.
- Rule of 3 (legacy): copy ctor, copy assignment, destructor.
- Rule of 5 (modern): + move ctor + move assignment.
- `= default` và `= delete`.
- Exception safety basics: basic, strong, no-throw guarantee.

Kết thúc bài: bạn thiết kế được class quản lý resource đúng cách, biết khi nào cần định nghĩa 5 special member, khi nào để compiler tự sinh, hiểu exception safety cơ bản.

## RAII là gì?

**Resource Acquisition Is Initialization** — tên dở, idea hay.

**Idea**: gắn lifetime của resource (memory, file, lock, socket, OS handle) với **lifetime của object C++**. Resource acquire trong constructor, release trong destructor. Object out of scope → tự release.

```cpp
// Không RAII — bug-prone
void Foo() {
  std::FILE* f = std::fopen("data.txt", "r");
  if (!f) return;

  if (SomeCondition()) {
    std::fclose(f);
    return;
  }

  Process(f);

  if (Process2()) {
    std::fclose(f);
    return;
  }

  std::fclose(f);   // 3 chỗ phải nhớ close
}
```

```cpp
// RAII — clean
class FileHandle {
 public:
  FileHandle(const std::string& path) {
    file_ = std::fopen(path.c_str(), "r");
  }
  ~FileHandle() {
    if (file_) std::fclose(file_);
  }
  // ... interface ...

 private:
  std::FILE* file_ = nullptr;
};

void Foo() {
  FileHandle f("data.txt");
  if (!f.IsOpen()) return;

  if (SomeCondition()) return;   // f auto closed

  Process(f);

  if (Process2()) return;        // f auto closed

  // f auto closed at end
}
```

RAII đảm bảo cleanup **trong mọi trường hợp**: return sớm, exception, normal exit. Đây là cách C++ giải bài toán "deterministic cleanup" mà Java/Python không có (Java có `try-finally`, Python có `with` — workaround).

## RAII idioms

### `std::lock_guard` — bảo vệ mutex

```cpp
std::mutex m;
int shared_data;

void Update() {
  std::lock_guard<std::mutex> lock(m);   // Acquire
  shared_data = 42;
}                                        // Release khi lock destroy
```

`std::lock_guard` acquire mutex trong ctor, release trong dtor. Đảm bảo unlock kể cả khi exception.

### `std::unique_lock` — flexible lock

```cpp
std::mutex m;

void Foo() {
  std::unique_lock<std::mutex> lock(m);
  // ... critical section ...
  lock.unlock();   // Unlock sớm nếu cần
  // ... non-critical ...
  lock.lock();     // Re-acquire
}
```

Linh hoạt hơn `lock_guard` nhưng overhead lớn hơn. Default dùng `lock_guard`.

### Scope guard

```cpp
class ScopeGuard {
 public:
  ScopeGuard(std::function<void()> cleanup) : cleanup_(std::move(cleanup)) {}
  ~ScopeGuard() { if (cleanup_) cleanup_(); }

  void Dismiss() { cleanup_ = nullptr; }

 private:
  std::function<void()> cleanup_;
};

void Foo() {
  AcquireResource();
  ScopeGuard guard([]() { ReleaseResource(); });
  // ... có thể throw ...
}  // guard destroy → cleanup
```

Dùng khi resource không có RAII wrapper sẵn. Hoặc dùng `absl::Cleanup` (Chromium dùng `base::ScopedClosureRunner`).

### Smart pointer (Bài 1) là RAII

```cpp
auto p = std::make_unique<Widget>();  // Allocate
// ... có thể throw ...
}                                      // Auto delete khi p destroy
```

Smart pointer = RAII applied cho heap-allocated object.

## Special member functions

Class có **6 special member function** mà compiler có thể tự sinh:

| Function | Mặc định |
|---|---|
| Default constructor | Có (nếu không define ctor nào) |
| Destructor | Có (gọi member dtor) |
| Copy constructor | Có (copy member-wise) |
| Copy assignment | Có (assign member-wise) |
| Move constructor | Có (move member-wise) |
| Move assignment | Có (move member-wise) |

Bạn có thể:

- **Để mặc định**: compiler tự sinh.
- **Implement tự**: cho behavior tùy chỉnh.
- **Explicit `= default`**: yêu cầu compiler sinh.
- **Explicit `= delete`**: chặn.

```cpp
class Foo {
 public:
  Foo() = default;                       // Yêu cầu compiler sinh default
  Foo(const Foo&) = delete;              // Chặn copy
  Foo& operator=(const Foo&) = delete;   // Chặn copy assignment
  Foo(Foo&&) noexcept = default;          // Compiler sinh move ctor
  Foo& operator=(Foo&&) noexcept = default;  // Compiler sinh move assignment
  ~Foo() = default;                      // Compiler sinh dtor
};
```

## Rule of 0

**Rule of 0**: không define bất kỳ special member nào — để compiler tự sinh.

Điều kiện:

- Class chỉ chứa member tự manage resource: `std::string`, `std::vector`, smart pointer, etc.
- Không có raw pointer / handle cần manual cleanup.

```cpp
class User {
 public:
  User(std::string name, int age) : name_(std::move(name)), age_(age) {}
  // Không define copy, move, dtor — compiler tự lo

 private:
  std::string name_;
  int age_;
};

User u1("Alice", 30);
User u2 = u1;                   // Copy ctor auto-generated
User u3 = std::move(u1);         // Move ctor auto-generated
```

Compiler-generated ctor/dtor cho `User`:

```cpp
// Tự sinh — equivalent code
User(const User& other) : name_(other.name_), age_(other.age_) {}    // Copy
User(User&& other) noexcept : name_(std::move(other.name_)), age_(other.age_) {}  // Move
~User() = default;
```

→ **Modern C++ best practice**: prefer Rule of 0. Dùng RAII type cho member, đừng wrap raw resource trong class của bạn (trừ khi bạn ĐANG VIẾT RAII wrapper).

## Rule of 3 (legacy)

Nếu bạn define **1 trong 3** sau đây, thường phải define **cả 3**:

1. Destructor
2. Copy constructor
3. Copy assignment

Lý do: nếu class cần custom dtor (cleanup resource), nó cũng cần custom copy/assignment để khỏi double-free.

```cpp
// Trước C++11 — Rule of 3
class MyString {
 public:
  MyString(const char* s) {
    size_ = std::strlen(s);
    data_ = new char[size_ + 1];
    std::strcpy(data_, s);
  }

  ~MyString() {
    delete[] data_;
  }

  // Copy ctor — bắt buộc define vì dtor tự custom
  MyString(const MyString& other) {
    size_ = other.size_;
    data_ = new char[size_ + 1];
    std::strcpy(data_, other.data_);
  }

  // Copy assignment — bắt buộc
  MyString& operator=(const MyString& other) {
    if (this != &other) {
      delete[] data_;
      size_ = other.size_;
      data_ = new char[size_ + 1];
      std::strcpy(data_, other.data_);
    }
    return *this;
  }

 private:
  char* data_;
  size_t size_;
};
```

Nếu chỉ define dtor mà không copy ctor → compiler tự sinh shallow copy → 2 object cùng trỏ raw pointer → double `delete` khi destroy → UB.

## Rule of 5 (modern)

C++11 thêm move ctor + move assignment. **Rule of 5**: nếu bạn define 1 trong 5 sau đây, thường phải xem xét cả 5:

1. Destructor
2. Copy constructor
3. Copy assignment
4. **Move constructor**
5. **Move assignment**

```cpp
class MyString {
 public:
  MyString(const char* s) { ... }
  ~MyString() { delete[] data_; }

  MyString(const MyString& other) { /* copy */ }
  MyString& operator=(const MyString& other) { /* copy */ }

  MyString(MyString&& other) noexcept {
    data_ = other.data_;
    size_ = other.size_;
    other.data_ = nullptr;
    other.size_ = 0;
  }

  MyString& operator=(MyString&& other) noexcept {
    if (this != &other) {
      delete[] data_;
      data_ = other.data_;
      size_ = other.size_;
      other.data_ = nullptr;
      other.size_ = 0;
    }
    return *this;
  }

 private:
  char* data_ = nullptr;
  size_t size_ = 0;
};
```

## `= default` và `= delete`

### `= default` — yêu cầu compiler sinh

```cpp
class Widget {
 public:
  Widget() = default;
  ~Widget() = default;

  Widget(const Widget&) = default;
  Widget& operator=(const Widget&) = default;

  Widget(Widget&&) noexcept = default;
  Widget& operator=(Widget&&) noexcept = default;
};
```

Dùng khi muốn document explicit "tôi muốn default behavior" — clearer than không khai báo gì.

### `= delete` — chặn

```cpp
class NonCopyable {
 public:
  NonCopyable() = default;
  ~NonCopyable() = default;

  NonCopyable(const NonCopyable&) = delete;
  NonCopyable& operator=(const NonCopyable&) = delete;

  // Move vẫn cho (move-only type)
  NonCopyable(NonCopyable&&) noexcept = default;
  NonCopyable& operator=(NonCopyable&&) noexcept = default;
};
```

Pattern phổ biến trong Chromium — chặn copy để force ownership rõ ràng.

```cpp
// Chromium style
class FooManager {
 public:
  FooManager();
  ~FooManager();

  FooManager(const FooManager&) = delete;
  FooManager& operator=(const FooManager&) = delete;
};
```

(Có macro `DISALLOW_COPY_AND_ASSIGN(FooManager)` cũ — đã phased out, dùng `= delete` thay.)

### Implicit deletion

Define copy/move có thể vô tình **delete** function khác:

```cpp
class Foo {
 public:
  Foo(Foo&&) = default;   // Define move ctor
  // → copy ctor implicitly deleted!
};

Foo a, b;
b = a;   // ERROR — không có copy assignment
```

→ Khi define 1 move, thường phải define cả copy/dtor manually hoặc dùng `= default`. Chromium guideline: explicit cả 5.

### Implicit `noexcept` cho default move

```cpp
class Foo {
 public:
  Foo(Foo&&) = default;  // Có thể là noexcept hoặc không, tùy member
};
```

Default move noexcept **nếu tất cả member có noexcept move**. `std::string`, `std::vector`, `std::unique_ptr` đều noexcept → default move thường noexcept.

**Khuyến nghị**: cứ explicit `noexcept`:

```cpp
Foo(Foo&&) noexcept = default;
Foo& operator=(Foo&&) noexcept = default;
```

## Exception safety

Khi 1 function throw, state của object/container có thể bị hỏng. **Exception safety** classify mức độ bảo đảm.

### 3 mức guarantee

1. **No-throw guarantee (strongest)**: function không bao giờ throw. Dùng `noexcept`.

   ```cpp
   void Swap() noexcept { ... }
   ```

2. **Strong exception guarantee**: nếu function throw, state không thay đổi (như chưa gọi).

   ```cpp
   void PushBack(const T& x) {
     // Nếu T copy throw, vector state không đổi
   }
   ```

3. **Basic exception guarantee**: nếu throw, state hợp lệ nhưng có thể đã thay đổi.

4. **No guarantee** (no safety): nếu throw, state có thể không hợp lệ (UB).

### Strategy đạt strong guarantee

**Copy-and-swap idiom**:

```cpp
MyString& operator=(MyString other) {   // Pass by value — copy có thể throw, nhưng nếu fail, *this không đổi
  swap(*this, other);                   // swap noexcept — không throw
  return *this;
}                                        // other destroy với data cũ
```

Nếu `other` ctor throw (do copy fail) → `*this` không bị modify → strong guarantee.

### `noexcept` trong move

```cpp
MyString(MyString&& other) noexcept {
  data_ = other.data_;
  size_ = other.size_;
  other.data_ = nullptr;
}
```

`std::vector` chỉ dùng move khi noexcept (vì move giữa các element trong vector grow → nếu throw giữa chừng, vector bể). Nếu move ctor không noexcept, vector dùng copy → mất hiệu năng.

→ **Mark `noexcept`** cho move ctor + move assignment + swap.

### Chromium: no exceptions

Chromium **tắt exception** (`-fno-exceptions`). Code Chromium:

- Không throw.
- Không catch.
- Dùng return code, `bool`, `base::Status`, hoặc `CHECK`/`DCHECK` thay.

Tuy nhiên nhiều third-party code có thể throw — Chromium build flag tắt exception buộc compile fail nếu thấy `throw`.

→ Trong Chromium context, "exception safety" không quan trọng vì không có exception. Tuy nhiên `noexcept` vẫn được mark cho move + swap để tận dụng vector + container optimization.

## Special member function — bảng tổng kết

| Bạn define | Compiler sinh? (defaulted as implicit) |
|---|---|
| Không gì | All 6 |
| Default ctor (any) | Không default ctor; sinh copy/move/dtor |
| Destructor | Không sinh move; sinh copy (deprecated, cẩn thận) |
| Copy ctor / copy assignment | Không sinh move |
| Move ctor / move assignment | Copy bị implicitly deleted |

→ Quy tắc an toàn: nếu định nghĩa 1 trong 5 (dtor, copy ctor, copy assign, move ctor, move assign), define cả 5 (hoặc `= default` / `= delete`).

## Pattern thực tế Chromium

```cpp
// chrome/browser/foo/foo_manager.h
#pragma once

namespace foo {

class FooManager {
 public:
  FooManager();
  ~FooManager();

  // Disallow copy — Chromium common pattern
  FooManager(const FooManager&) = delete;
  FooManager& operator=(const FooManager&) = delete;

  // Allow move (sometimes)
  FooManager(FooManager&&) noexcept;
  FooManager& operator=(FooManager&&) noexcept;

  // ...
};

}  // namespace foo
```

Một số class Chromium còn delete cả move (pure non-movable singleton-like):

```cpp
class Singleton {
 public:
  Singleton(const Singleton&) = delete;
  Singleton& operator=(const Singleton&) = delete;
  Singleton(Singleton&&) = delete;
  Singleton& operator=(Singleton&&) = delete;
};
```

### RAII wrapper trong Chromium

`base::ScopedClosureRunner`:

```cpp
void Foo() {
  AcquireResource();
  base::ScopedClosureRunner cleanup(base::BindOnce(&ReleaseResource));
  // ... function body ...
}  // cleanup destroy → ReleaseResource gọi
```

`base::AutoLock`:

```cpp
void Foo() {
  base::AutoLock lock(mutex_);   // Acquire
  // ... critical section ...
}                                 // Release
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Define dtor không define copy ctor (Rule of 3) | Double delete | Define đủ 5 hoặc dùng smart pointer (Rule of 0) |
| Quên `noexcept` move | Container fallback copy | Mark `noexcept` |
| Move ctor throw | Exception in move = bad | Move chỉ làm pointer swap, không throw |
| `delete` raw pointer trong member dtor mà chưa nullify trong move | Double delete | Set source pointer to nullptr in move |
| `Rule of 3` mà quên move | Implicit-deleted move (chỉ copy được) | Define cả 5 hoặc trust Rule of 0 |
| RAII object trong class có raw resource | Copy implicit shallow | Rule of 5 với deep copy/move |
| Copy-and-swap với expensive default ctor | Slow copy assignment | Use case-by-case decision |

## Tóm tắt

| Rule | Khi nào |
|---|---|
| **Rule of 0** | Default — không define gì, dùng RAII member |
| **Rule of 3** | Legacy — pre-C++11 |
| **Rule of 5** | Modern — manual resource: define đủ 5 |
| `= default` | Document explicit default behavior |
| `= delete` | Chặn copy/move (Chromium pattern) |
| `noexcept` | Move ctor + assignment + swap |
| Exception safety | Strong (state không đổi if throw); Chromium no-exception |

**RAII checklist khi viết class:**

1. Class có raw resource? (raw pointer/handle?)
2. Nếu CÓ: viết RAII wrapper hoặc define 5 special member.
3. Nếu KHÔNG: Rule of 0 — không define gì.
4. Disallow copy (Chromium pattern): `= delete`.
5. Move noexcept.

## Exercise (optional)

1. Implement `Buffer` class với raw `new[]` data. Define đủ 5 special member. Test bằng cách copy, move, swap.
2. Refactor `Buffer` để dùng `std::unique_ptr<char[]>` thay raw pointer. Verify chỉ cần Rule of 0.
3. Implement `LockedCounter` class: increment với mutex. Dùng `std::lock_guard`. Test multithread.
4. Implement `ScopeGuard`. Sử dụng để cleanup khi function có nhiều early return.

---

**Phase kế** → [Phase 4: Templates và STL](../phase-4-templates-and-stl/01-templates.md)
