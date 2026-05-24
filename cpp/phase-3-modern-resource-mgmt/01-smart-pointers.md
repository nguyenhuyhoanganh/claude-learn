# Bài 1: Smart Pointers

Bài này dạy:
- Vì sao raw `new`/`delete` là antipattern trong modern C++.
- `std::unique_ptr<T>`: single ownership, move-only — workhorse.
- `std::shared_ptr<T>`: shared ownership với reference count.
- `std::weak_ptr<T>`: non-owning observer; phá circular reference.
- `std::make_unique` và `std::make_shared` — factory function khuyến nghị.
- Rule of thumb: khi nào dùng cái nào.

Kết thúc bài: bạn sẽ tránh được mọi `new`/`delete` thủ công, hiểu ownership semantics, và biết khi gặp leak / use-after-free thì là vì lý do gì.

## Tại sao smart pointer thay raw `new`/`delete`?

```cpp
// Raw — antipattern
void Foo() {
  Widget* w = new Widget();
  if (SomeCondition()) {
    return;  // LEAK! w chưa delete
  }
  w->DoSomething();   // Nếu DoSomething throw → LEAK
  delete w;
}
```

Manual `new`/`delete` có nhiều cách hỏng:

- Quên `delete` → memory leak.
- Early return / throw → leak.
- Double `delete` → UB / crash.
- Use after `delete` → UB / crash.
- Mất track ownership: ai responsible cho `delete`?

**Smart pointer** = wrapper object quản lý raw pointer + tự `delete` khi out of scope. Áp dụng RAII (Bài 3) lên ownership.

```cpp
#include <memory>

void Foo() {
  auto w = std::make_unique<Widget>();  // unique_ptr<Widget>
  if (SomeCondition()) {
    return;  // OK — w tự destroy, delete Widget
  }
  w->DoSomething();
}  // w destroyed → Widget deleted automatically
```

→ **Modern C++ rule**: `new`/`delete` chỉ thấy trong internal của library (smart pointer impl, allocator). User code dùng smart pointer.

## `std::unique_ptr<T>` — single ownership

```cpp
#include <memory>

class Widget {
 public:
  void DoSomething() { /* ... */ }
};

std::unique_ptr<Widget> p = std::make_unique<Widget>();

p->DoSomething();          // Truy cập như raw pointer
(*p).DoSomething();        // Hoặc dereference

Widget* raw = p.get();     // Lấy raw pointer (KHÔNG transfer ownership)
p.reset();                 // Delete sớm, p giờ là nullptr
```

| Operation | Ý nghĩa |
|---|---|
| `make_unique<T>(args...)` | Tạo T + wrap trong unique_ptr |
| `p->member` / `(*p).member` | Truy cập member |
| `p.get()` | Trả raw `T*`; **không** transfer ownership |
| `p.reset()` | Delete object, p = nullptr |
| `p.reset(new_ptr)` | Replace: delete cũ, take ownership của new_ptr |
| `p.release()` | Trả raw `T*`, p = nullptr (transfer ownership manually) |
| `if (p)` | Check có object không (= `p.get() != nullptr`) |
| `p1 = std::move(p2)` | Transfer ownership |

### Single ownership — move-only

`unique_ptr` KHÔNG copy được:

```cpp
auto p1 = std::make_unique<Widget>();
// auto p2 = p1;  // ERROR: copy không cho phép

auto p2 = std::move(p1);   // OK: transfer ownership
// p1 giờ là nullptr
// p2 own object
```

Sẽ học `std::move` chi tiết ở Bài 2.

### Return unique_ptr

```cpp
std::unique_ptr<Widget> CreateWidget() {
  return std::make_unique<Widget>();
}

auto w = CreateWidget();   // Move automatically (RVO/move)
```

Return value optimization (RVO) + move ctor đảm bảo không có copy → zero-overhead.

### Pass unique_ptr

```cpp
// Take ownership
void TakeWidget(std::unique_ptr<Widget> w) {
  // w own giờ — sẽ destroy khi function kết thúc (trừ khi transfer tiếp)
}

auto w = std::make_unique<Widget>();
TakeWidget(std::move(w));   // Phải explicit move
// w giờ là nullptr
```

Pass by value → transfer ownership. Caller phải `std::move` để rõ ràng.

```cpp
// Borrow (không own) — dùng raw pointer hoặc reference
void UseWidget(Widget* w);       // Optional
void UseWidget(Widget& w);       // Required

UseWidget(w.get());     // Pass raw pointer
UseWidget(*w);          // Pass reference
```

→ **Quy tắc**: function nhận `unique_ptr<T>` chỉ khi muốn **take ownership**. Nếu chỉ **dùng**, pass raw pointer hoặc reference.

### `unique_ptr` array

```cpp
auto buf = std::make_unique<int[]>(100);   // Array of 100 int
buf[0] = 42;
buf[1] = 100;
// Tự delete[] khi out of scope
```

Tuy nhiên `std::vector<int>` hoặc `std::array<int, N>` thường tốt hơn (có size info, iterator).

## `std::shared_ptr<T>` — shared ownership

```cpp
#include <memory>

auto p1 = std::make_shared<Widget>();   // count = 1
{
  auto p2 = p1;                          // copy → count = 2
  p2->DoSomething();
}                                        // p2 destroy → count = 1
// p1 vẫn own → object còn sống

p1.reset();                              // count = 0 → object destroy
```

`shared_ptr` có **reference count**: nhiều `shared_ptr` cùng own 1 object. Object destroy khi count = 0.

| Operation | Ý nghĩa |
|---|---|
| `make_shared<T>(args...)` | Tạo T + shared_ptr |
| `p1 = p2` | Copy → tăng count |
| `p1 = std::move(p2)` | Move → không tăng count |
| `p.use_count()` | Lấy ref count (debug only) |

### Khi nào dùng shared_ptr?

❌ **KHÔNG phải default**. `shared_ptr` có overhead:

- Atomic refcount (chậm hơn raw pointer dù không contention).
- Memory bigger (control block với refcount + weak count).
- Khó reason: ai destroy?

✅ Dùng khi **thực sự** cần shared ownership:

- Nhiều thread / async chia sẻ object, không biết ai hold lâu nhất.
- Multiple owner pattern (vd graph có node được nhiều edge reference).
- Callback async giữ object alive.

Trong nhiều case, `unique_ptr` + raw pointer "borrow" là đủ.

### `make_shared` vs `shared_ptr(new T)`

```cpp
auto p1 = std::make_shared<Widget>();              // Khuyến nghị
std::shared_ptr<Widget> p2(new Widget());          // OK nhưng kém
```

`make_shared`:

- 1 allocation (object + control block cùng 1 chunk).
- Exception-safe.
- Ngắn gọn.

`shared_ptr(new T)`:

- 2 allocation (object riêng, control block riêng).
- Exception-unsafe trong 1 số case (vd `f(shared_ptr<A>(new A), shared_ptr<B>(new B))` — nếu B throw sau A new, A leak).

→ **Luôn dùng `make_shared`**, trừ khi cần custom deleter (hiếm).

### Custom deleter

```cpp
auto file_closer = [](std::FILE* f) {
  if (f) std::fclose(f);
};

std::shared_ptr<std::FILE> file(std::fopen("data.txt", "r"), file_closer);
```

Dùng khi resource cần cleanup custom (file handle, OS handle, etc.). Tuy nhiên RAII wrapper class thường tốt hơn.

## `std::weak_ptr<T>` — non-owning observer

```cpp
auto sp = std::make_shared<Widget>();
std::weak_ptr<Widget> wp = sp;

if (auto locked = wp.lock()) {   // Trả shared_ptr nếu còn alive, nullptr nếu không
  locked->DoSomething();
}
```

`weak_ptr`:

- KHÔNG own object (không tăng refcount).
- Có thể check object còn alive bằng `.lock()`.
- Hữu ích cho: observer, cache, phá circular reference.

### Circular reference — vấn đề `shared_ptr` không tự fix

```cpp
class B;

class A {
 public:
  std::shared_ptr<B> b_;
};

class B {
 public:
  std::shared_ptr<A> a_;  // ← circular!
};

auto a = std::make_shared<A>();
auto b = std::make_shared<B>();
a->b_ = b;   // a's refcount of b = 1 (b's = 2 total)
b->a_ = a;   // b's refcount of a = 1 (a's = 2 total)

// Reset
a.reset();   // a refcount: 2 → 1 (b->a_ vẫn hold)
b.reset();   // b refcount: 2 → 1 (a->b_ vẫn hold)

// Cả 2 leak — nobody destroy
```

Fix: 1 chiều dùng `weak_ptr`:

```cpp
class B {
 public:
  std::weak_ptr<A> a_;   // weak — không hold strong ref
};
```

Khi `a.reset()`: a refcount → 0 → destroy → b->a_ vẫn weak, không sao.

→ **Nguyên tắc**: parent → child = `shared_ptr` (own); child → parent = `weak_ptr` (back-ref).

## Bảng quyết định: dùng cái nào?

| Tình huống | Smart pointer |
|---|---|
| Object có 1 owner, lifetime rõ ràng | `unique_ptr` (default!) |
| Function tạo + return ownership | `unique_ptr` |
| Object share giữa async/thread | `shared_ptr` |
| Observer / cache | `weak_ptr` |
| Phá circular reference | `weak_ptr` |
| Borrow tạm trong function | Raw `T*` hoặc `T&` (không phải smart) |
| Lưu trong container, polymorphic | `vector<unique_ptr<Base>>` |

### Pattern: container of polymorphic

```cpp
std::vector<std::unique_ptr<Shape>> shapes;
shapes.push_back(std::make_unique<Circle>(5.0));
shapes.push_back(std::make_unique<Square>(3.0));

for (const auto& shape : shapes) {
  shape->Area();   // Polymorphic call OK
}
```

`unique_ptr` move-only nhưng container hỗ trợ — `vector::push_back(make_unique<...>())` move thẳng vào vector.

## So sánh với Chromium

Chromium dùng `base::` smart pointer riêng:

| Chromium | Tương đương std |
|---|---|
| `std::unique_ptr` | `std::unique_ptr` (Chromium dùng std luôn) |
| `scoped_refptr<T>` | Tương tự `shared_ptr` nhưng cho `RefCounted` class |
| `base::WeakPtr<T>` | Tương tự `weak_ptr` nhưng work với sequence model của Chromium |
| `std::shared_ptr` | Hiếm dùng trong Chromium — prefer `scoped_refptr` |

Sẽ học chi tiết Chromium variant ở `chromium-native/phase-2/02-refcounted-and-weakptr.md`.

## Pattern thực tế

### Factory function

```cpp
std::unique_ptr<Widget> CreateWidget(int width, int height) {
  auto w = std::make_unique<Widget>(width, height);
  if (!w->Initialize()) {
    return nullptr;
  }
  return w;
}

auto w = CreateWidget(800, 600);
if (!w) {
  // Init fail
  return;
}
w->Show();
```

### Resource handle với custom cleanup

```cpp
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

auto f = std::make_unique<FileHandle>("data.txt");
// ... khi f out of scope, FileHandle destroy → file close
```

Khi nào dùng wrapper class vs custom deleter:

- **Wrapper class**: cần interface phong phú (read, write, etc.).
- **Custom deleter**: chỉ cần cleanup, không cần interface — vd `unique_ptr<std::FILE, decltype(&fclose)>`.

### Observer pattern với weak_ptr

```cpp
class EventBus {
 public:
  void Subscribe(std::shared_ptr<Listener> l) {
    listeners_.push_back(l);  // Store as weak_ptr
  }

  void Fire(const Event& e) {
    for (auto it = listeners_.begin(); it != listeners_.end(); ) {
      if (auto l = it->lock()) {
        l->OnEvent(e);
        ++it;
      } else {
        it = listeners_.erase(it);  // Listener gone — cleanup
      }
    }
  }

 private:
  std::vector<std::weak_ptr<Listener>> listeners_;
};
```

EventBus không own listener — caller own. Khi listener destroy, weak_ptr trở thành expired tự động.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Dùng `new` thay `make_unique`/`make_shared` | Exception unsafe, double allocation | Luôn `make_*` |
| 2 `shared_ptr` từ cùng raw pointer | Double delete khi cả 2 destroy | KHÔNG: `shared_ptr<T>(raw)` 2 lần |
| Quên `std::move` khi pass unique_ptr | Compile error (copy) | `std::move(p)` explicit |
| `unique_ptr` trong copy-required context (vd legacy container) | Compile error | Dùng `shared_ptr` hoặc raw pointer |
| Circular `shared_ptr` | Memory leak | 1 chiều dùng `weak_ptr` |
| `get()` rồi `delete` | UB (double delete) | Đừng delete output của `get()` |
| `release()` quên handle pointer | Memory leak | Chỉ dùng `release()` khi transfer cho code khác |
| `shared_ptr` cho mọi thứ | Overhead | `unique_ptr` là default; shared khi thực sự cần |

## Tóm tắt

| Smart pointer | Ownership | Use case |
|---|---|---|
| `unique_ptr<T>` | Single, exclusive | Default cho heap-allocated object |
| `shared_ptr<T>` | Shared, refcounted | Khi nhiều owner thực sự |
| `weak_ptr<T>` | None (observer) | Phá circular, cache, observer |
| Raw `T*` | None (borrow) | Function parameter "use but not own" |

**3 rule quan trọng:**

1. Default là `unique_ptr` + `make_unique`.
2. `shared_ptr` chỉ khi shared ownership thực sự.
3. `weak_ptr` phá circular, observer pattern.

## Analogy với JS

| JS | C++ |
|---|---|
| `const obj = new Widget()` (GC tự cleanup) | `auto w = std::make_unique<Widget>()` (RAII cleanup) |
| Multiple variable trỏ tới object → GC count refs | `shared_ptr` → manual refcount |
| `WeakRef` | `weak_ptr` |

C++ smart pointer giải bài toán GC tự động bằng deterministic destruction (out of scope = cleanup ngay), không phải garbage collector.

## Exercise (optional)

1. Tạo class `Buffer` (allocate 1MB trong ctor, free trong dtor). Tạo qua `make_unique`, transfer ownership giữa các function.
2. Setup circular reference với `shared_ptr` cố tình. Verify memory leak (ASan / valgrind). Fix bằng `weak_ptr`.
3. Tạo observer pattern: `Publisher` với `vector<weak_ptr<Subscriber>>`. Subscribe 3 listener, destroy 1, fire event — verify chỉ 2 nhận event.
4. So sánh performance: `vector<int*>` với manual `new`/`delete` vs `vector<unique_ptr<int>>`.

---

**Bài kế tiếp** → [Bài 2: Move Semantics](02-move-semantics.md)
