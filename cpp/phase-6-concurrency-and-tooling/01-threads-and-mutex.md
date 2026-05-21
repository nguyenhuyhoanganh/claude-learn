# Bài 1: Threads và Mutex

Bài này dạy:
- `std::thread`: tạo, join, detach.
- Race condition: ví dụ và hậu quả thực tế.
- `std::mutex`, `std::lock_guard`, `std::unique_lock`.
- Deadlock và cách tránh (lock ordering, `std::lock`).
- Memory visibility intro — setup cho bài atomic.

Kết thúc bài: bạn tạo được multi-threaded program đơn giản, dùng mutex bảo vệ shared data, biết tránh deadlock và race condition cơ bản.

## Tại sao concurrency?

Browser modern là **highly concurrent**:

- UI thread render frame.
- Network thread I/O.
- GPU thread composite.
- V8 worker threads.
- Disk I/O thread.

Chromium có threading model phức tạp (sẽ học ở `chromium-native/phase-2/03`). Trước khi đến đó, cần hiểu primitive cơ bản của C++ stdlib.

## `std::thread`

```cpp
#include <thread>
#include <iostream>

void Hello() {
  std::cout << "Hello from thread " << std::this_thread::get_id() << "\n";
}

int main() {
  std::thread t(Hello);   // Start thread chạy Hello()
  t.join();                // Wait for thread finish
  return 0;
}
```

### Tạo thread với argument

```cpp
void Greet(const std::string& name, int times) {
  for (int i = 0; i < times; ++i) {
    std::cout << "Hi " << name << "\n";
  }
}

std::thread t(Greet, "World", 3);
t.join();
```

Arguments được pass **by value** vào thread (copy). Nếu cần reference:

```cpp
void Update(int& counter) { ++counter; }

int n = 0;
std::thread t(Update, std::ref(n));  // Explicit reference wrapper
t.join();
std::cout << n;   // 1
```

### Lambda

```cpp
int x = 0;
std::thread t([&x]() {
  x = 42;
});
t.join();
std::cout << x;   // 42
```

### `join()` vs `detach()`

```cpp
std::thread t(Hello);

t.join();    // Main thread chờ t finish
// Hoặc:
t.detach();  // t chạy độc lập, không wait
```

**Bẫy**: nếu `std::thread` destroy mà chưa join hoặc detach → `std::terminate()` ngay.

```cpp
void Bad() {
  std::thread t(Hello);
  // t out of scope without join/detach → terminate!
}
```

Fix: dùng `std::jthread` (C++20) — auto-join trong destructor:

```cpp
{
  std::jthread t(Hello);
  // ... auto join khi t destroy
}
```

Hoặc luôn join/detach manually.

### `std::this_thread`

```cpp
std::this_thread::get_id();             // ID của thread hiện tại
std::this_thread::sleep_for(std::chrono::milliseconds(100));
std::this_thread::yield();              // Hint to scheduler
```

### Hardware concurrency

```cpp
unsigned n = std::thread::hardware_concurrency();
std::cout << "Cores: " << n << "\n";
```

Số lõi logic (thread). Hữu ích cho thread pool sizing.

## Race condition

Khi nhiều thread access cùng shared variable, **ít nhất 1 thread write** → race condition.

```cpp
int counter = 0;

void Increment() {
  for (int i = 0; i < 100000; ++i) {
    counter++;   // RACE!
  }
}

int main() {
  std::thread t1(Increment);
  std::thread t2(Increment);
  t1.join();
  t2.join();
  std::cout << counter;  // Expect 200000, thường ít hơn — BUG
}
```

Tại sao? `counter++` thực ra là 3 instruction:

1. Load `counter` từ memory.
2. Tăng giá trị.
3. Store về memory.

2 thread có thể interleave, lost update.

### Hậu quả race condition

- Data corruption.
- Bug non-deterministic — chạy 100 lần OK, lần thứ 101 fail.
- Khó reproduce → khó debug.
- Memory unsafety: pointer corrupt → crash, UAF.

## `std::mutex`

**Mutex** = "mutual exclusion" — chỉ 1 thread có thể hold tại 1 thời điểm.

```cpp
#include <mutex>

std::mutex m;
int counter = 0;

void Increment() {
  for (int i = 0; i < 100000; ++i) {
    m.lock();
    counter++;     // Critical section
    m.unlock();
  }
}
```

Bây giờ counter đúng 200000.

### `std::lock_guard` — RAII wrapper

`m.lock()/m.unlock()` manual dễ quên (early return, exception):

```cpp
void Bad() {
  m.lock();
  if (SomeCondition()) return;   // LEAK — quên unlock!
  // ...
  m.unlock();
}
```

`std::lock_guard` = RAII: lock trong ctor, unlock trong dtor.

```cpp
void Good() {
  std::lock_guard<std::mutex> lock(m);   // Lock
  if (SomeCondition()) return;            // OK — unlock tự khi return
  // ...
}                                          // Unlock khi out of scope
```

→ **Always prefer `lock_guard` over manual lock/unlock**.

### `std::unique_lock` — flexible

`unique_lock` tương tự `lock_guard` nhưng có thể manually lock/unlock:

```cpp
std::unique_lock<std::mutex> lock(m);  // Lock
// ... critical section ...
lock.unlock();  // Unlock sớm
// ... non-critical ...
lock.lock();    // Re-acquire
// ...
// Auto unlock khi destroy
```

Use case:

- Cần unlock tạm.
- Dùng với `std::condition_variable` (require unique_lock).

Overhead lớn hơn `lock_guard` chút — dùng khi cần feature.

### Scope của mutex

```cpp
class Counter {
 public:
  void Increment() {
    std::lock_guard<std::mutex> lock(m_);
    ++count_;
  }

  int Get() const {
    std::lock_guard<std::mutex> lock(m_);
    return count_;
  }

 private:
  mutable std::mutex m_;   // mutable — lock trong const method
  int count_ = 0;
};
```

Note `mutable` cho mutex — để lock được trong const method.

### `std::shared_mutex` (C++17+) — reader-writer lock

```cpp
#include <shared_mutex>

std::shared_mutex sm;

void Read() {
  std::shared_lock<std::shared_mutex> lock(sm);   // Reader lock
  // Multiple readers OK
}

void Write() {
  std::lock_guard<std::shared_mutex> lock(sm);   // Exclusive lock
  // Chỉ 1 writer; reader phải đợi
}
```

Cho read-heavy workload. Nhiều reader concurrent, writer exclusive.

## Deadlock

```cpp
std::mutex m1, m2;

void Thread1() {
  std::lock_guard<std::mutex> l1(m1);
  std::this_thread::sleep_for(std::chrono::milliseconds(10));
  std::lock_guard<std::mutex> l2(m2);   // Block forever nếu Thread2 hold m2
  // ...
}

void Thread2() {
  std::lock_guard<std::mutex> l2(m2);
  std::this_thread::sleep_for(std::chrono::milliseconds(10));
  std::lock_guard<std::mutex> l1(m1);   // Block forever
  // ...
}
```

Thread1 hold m1, đợi m2. Thread2 hold m2, đợi m1 → cả 2 stuck → deadlock.

### Cách tránh

**1. Lock ordering**: luôn lock theo cùng thứ tự ở mọi thread.

```cpp
// Always lock m1 first, then m2
void Thread1() {
  std::lock_guard<std::mutex> l1(m1);
  std::lock_guard<std::mutex> l2(m2);
}

void Thread2() {
  std::lock_guard<std::mutex> l1(m1);   // Same order
  std::lock_guard<std::mutex> l2(m2);
}
```

**2. `std::lock`** — lock multiple mutex cùng lúc atomically:

```cpp
void Foo() {
  std::lock(m1, m2);    // Lock cả 2, atomic, không deadlock
  std::lock_guard<std::mutex> l1(m1, std::adopt_lock);
  std::lock_guard<std::mutex> l2(m2, std::adopt_lock);
  // ...
}
```

Hoặc C++17:

```cpp
std::scoped_lock lock(m1, m2);   // Lock cả 2 atomically
// ...
```

`std::scoped_lock` mới hơn — preferred.

**3. Không lock trong khi hold lock khác**: pattern "lock-and-do" → reduce contention.

### Detect deadlock

ThreadSanitizer (TSan) detect deadlock và race condition (sẽ học ở Bài 3).

## `std::condition_variable`

Để 1 thread **đợi 1 condition** trở thành true, signal bởi thread khác.

```cpp
#include <condition_variable>

std::mutex m;
std::condition_variable cv;
bool ready = false;

void Producer() {
  std::this_thread::sleep_for(std::chrono::seconds(1));
  {
    std::lock_guard<std::mutex> lock(m);
    ready = true;
  }
  cv.notify_one();
}

void Consumer() {
  std::unique_lock<std::mutex> lock(m);
  cv.wait(lock, []() { return ready; });   // Wait until ready
  std::cout << "Got signal\n";
}

int main() {
  std::thread t1(Consumer);
  std::thread t2(Producer);
  t1.join();
  t2.join();
}
```

### Cơ chế

- `cv.wait(lock, predicate)`:
  - Atomically unlock + sleep.
  - Khi notified, re-acquire lock, check predicate.
  - Predicate false → sleep lại.

- `cv.notify_one()`: wake up 1 thread đang wait.
- `cv.notify_all()`: wake up tất cả.

### Producer-consumer queue example

```cpp
template <typename T>
class BlockingQueue {
 public:
  void Push(T item) {
    {
      std::lock_guard<std::mutex> lock(m_);
      queue_.push(std::move(item));
    }
    cv_.notify_one();
  }

  T Pop() {
    std::unique_lock<std::mutex> lock(m_);
    cv_.wait(lock, [this]() { return !queue_.empty(); });
    T item = std::move(queue_.front());
    queue_.pop();
    return item;
  }

 private:
  std::mutex m_;
  std::condition_variable cv_;
  std::queue<T> queue_;
};
```

Producer push, consumer wait + pop.

## `std::async`, `std::future`, `std::promise`

```cpp
#include <future>

int Compute() {
  std::this_thread::sleep_for(std::chrono::seconds(2));
  return 42;
}

int main() {
  std::future<int> f = std::async(std::launch::async, Compute);
  std::cout << "Doing other work...\n";
  std::cout << "Got: " << f.get() << "\n";   // Block until ready
}
```

`std::async` start function async, trả `std::future<T>`. `.get()` block đợi result.

### `std::promise` / `std::future`

```cpp
std::promise<int> p;
std::future<int> f = p.get_future();

std::thread t([&p]() {
  std::this_thread::sleep_for(std::chrono::seconds(1));
  p.set_value(42);
});

std::cout << f.get();   // Block, then 42
t.join();
```

Promise = "tôi sẽ set value sau". Future = "nhận value khi sẵn sàng".

### Chromium thay thế

Chromium không dùng `std::async`/`std::future` nhiều. Thay vào đó: `base::ThreadPool`, `base::PostTaskAndReplyWithResult`, `base::OnceCallback`. Sẽ học ở `chromium-native/phase-2/03`.

## Memory visibility — setup cho atomic

```cpp
int data = 0;
bool ready = false;

// Thread 1
data = 42;
ready = true;

// Thread 2
if (ready) {
  std::cout << data;   // Might see 0 even though ready==true!
}
```

Vì sao? CPU reorder instruction, cache không sync giữa core → Thread 2 thấy `ready=true` trước khi thấy `data=42`.

`std::mutex` đảm bảo memory barrier — Thread 2 thấy mọi thay đổi của Thread 1 trước khi unlock. Nhưng nếu KHÔNG dùng mutex (atomic, lock-free), phải dùng `std::atomic` + memory order. Bài 2.

## Patterns

### Counter thread-safe

```cpp
class Counter {
 public:
  void Increment() {
    std::lock_guard<std::mutex> lock(m_);
    ++count_;
  }
  int Get() const {
    std::lock_guard<std::mutex> lock(m_);
    return count_;
  }

 private:
  mutable std::mutex m_;
  int count_ = 0;
};
```

(Atomic int faster — Bài 2.)

### Lazy initialization với `std::once_flag`

```cpp
#include <mutex>

std::once_flag init_flag;
Resource* resource;

void Init() {
  resource = new Resource(...);
}

Resource* Get() {
  std::call_once(init_flag, Init);   // Chỉ chạy Init 1 lần, thread-safe
  return resource;
}
```

Cho singleton lazy init.

### Thread pool đơn giản

```cpp
class ThreadPool {
 public:
  ThreadPool(size_t n) {
    for (size_t i = 0; i < n; ++i) {
      workers_.emplace_back([this]() { Run(); });
    }
  }

  ~ThreadPool() {
    {
      std::lock_guard<std::mutex> lock(m_);
      stop_ = true;
    }
    cv_.notify_all();
    for (auto& w : workers_) w.join();
  }

  void Submit(std::function<void()> task) {
    {
      std::lock_guard<std::mutex> lock(m_);
      tasks_.push(std::move(task));
    }
    cv_.notify_one();
  }

 private:
  void Run() {
    while (true) {
      std::function<void()> task;
      {
        std::unique_lock<std::mutex> lock(m_);
        cv_.wait(lock, [this]() { return stop_ || !tasks_.empty(); });
        if (stop_ && tasks_.empty()) return;
        task = std::move(tasks_.front());
        tasks_.pop();
      }
      task();
    }
  }

  std::vector<std::thread> workers_;
  std::queue<std::function<void()>> tasks_;
  std::mutex m_;
  std::condition_variable cv_;
  bool stop_ = false;
};
```

Production code dùng library (`folly`, `tbb`, hoặc Chromium `base::ThreadPool`) thay tự viết.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Race condition trên int | Lost update | Mutex hoặc atomic |
| `std::thread` destroy mà không join/detach | Terminate | `jthread` hoặc luôn join |
| Lock without RAII | Quên unlock | `lock_guard` |
| Lock 2 mutex sai thứ tự | Deadlock | Same order, hoặc `scoped_lock` |
| Hold lock quá lâu | Contention | Minimize critical section |
| Spurious wakeup không check predicate | Bug | `cv.wait(lock, predicate)` syntax |
| Pass thread argument by reference (without `std::ref`) | Compile error or unexpected behavior | `std::ref(x)` explicit |
| Recursive lock với non-recursive mutex | Deadlock | `std::recursive_mutex` (hiếm) |
| Detach worker mà main exit | UB | Manage lifetime carefully |

## Tóm tắt

| Concept | Take-away |
|---|---|
| `std::thread` | Spawn thread; join hoặc detach BẮT BUỘC |
| `std::jthread` (C++20) | Auto-join thread |
| `std::mutex` | Protect shared data |
| `std::lock_guard` | RAII for mutex |
| `std::scoped_lock` (C++17) | Lock multiple mutex atomically |
| `std::shared_mutex` | Reader-writer lock |
| `std::condition_variable` | Wait-notify pattern |
| `std::async`/`future` | Async execution + result |
| Race condition | Multiple thread, ≥1 write → mutex hoặc atomic |
| Deadlock | Same lock order, hoặc scoped_lock |

## Exercise (optional)

1. Tạo counter race condition. Fix bằng mutex. So sánh result.
2. Implement `BlockingQueue<T>` đầy đủ. Test với producer-consumer.
3. Cố tình tạo deadlock với 2 mutex, 2 thread. Fix bằng `std::scoped_lock`.
4. Compare performance: counter dùng `std::mutex` vs `std::atomic<int>` (Bài 2).

---

**Bài kế tiếp** → [Bài 2: Atomic và Memory Model](02-atomic-and-memory-model.md)
