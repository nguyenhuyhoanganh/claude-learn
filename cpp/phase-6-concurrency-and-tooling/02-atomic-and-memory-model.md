# Bài 2: Atomic và Memory Model

Bài này dạy:
- `std::atomic<T>`: atomic operations cho integer/pointer.
- Memory order: `relaxed`, `acquire`, `release`, `acq_rel`, `seq_cst`.
- Khi nào atomic đủ, khi nào cần mutex.
- `std::condition_variable` chi tiết.
- `std::async`, `std::future`, `std::promise` recap.

Kết thúc bài: bạn biết khi nào dùng atomic thay mutex, hiểu cơ bản về memory ordering, và viết được lock-free counter / flag.

## Vì sao atomic?

Mutex chậm — acquire/release có overhead. Cho operation đơn giản (vd `++counter`), atomic nhanh hơn 10-100x.

```cpp
#include <atomic>

std::atomic<int> counter{0};

void Increment() {
  for (int i = 0; i < 100000; ++i) {
    counter++;     // Thread-safe, no mutex
  }
}
```

`++counter` trên `std::atomic<int>` là **single atomic instruction** trên hầu hết CPU. Không thể split → không race.

## `std::atomic<T>`

```cpp
#include <atomic>

std::atomic<int> n{0};

n.store(5);           // Atomic write
int x = n.load();      // Atomic read
n++;                   // Atomic increment
n--;                   // Atomic decrement
n += 10;               // Atomic add
n.fetch_add(5);        // Add, return old value
n.exchange(100);       // Swap, return old value
```

Atomic-friendly types:

- `int`, `bool`, pointer (T*).
- POD type ≤ 8 byte (thường 16 byte tùy hardware).

```cpp
std::atomic<int> a;
std::atomic<bool> b;
std::atomic<int*> ptr;
std::atomic<size_t> idx;
```

### Atomic class type — lock-free not guaranteed

```cpp
struct LargeData { int x, y, z, w, v, u; };
std::atomic<LargeData> data;

if (data.is_lock_free()) {
  // Hardware support — fast
} else {
  // Fallback to internal mutex — same speed as std::mutex
}
```

Type lớn hơn 8/16 byte thường không lock-free → atomic fallback dùng mutex internal → không faster.

## Memory order

Khi đọc/ghi atomic, có thể chỉ định **memory order** — bao nhiêu memory barrier.

```cpp
n.store(5, std::memory_order_relaxed);
int x = n.load(std::memory_order_acquire);
```

5 memory order:

1. `memory_order_relaxed` — chỉ atomic, không memory barrier.
2. `memory_order_acquire` — load với acquire (đảm bảo read sau không reorder lên trước).
3. `memory_order_release` — store với release (đảm bảo write trước không reorder xuống sau).
4. `memory_order_acq_rel` — read-modify-write với cả acquire và release.
5. `memory_order_seq_cst` — sequential consistency (mặc định, strongest).

### `memory_order_seq_cst` — default

```cpp
n.store(5);                 // = store(5, seq_cst)
int x = n.load();           // = load(seq_cst)
```

Mặc định: tất cả thread thấy operation theo cùng thứ tự global. Strongest, slowest. **An toàn**: nếu không hiểu memory order, dùng cái này.

### `memory_order_relaxed`

```cpp
std::atomic<int> counter{0};

void Increment() {
  counter.fetch_add(1, std::memory_order_relaxed);
}
```

Chỉ đảm bảo atomic. Không có ordering constraint với memory khác.

**Use case**: counter — không care thứ tự increment vs other memory operations.

**Bẫy**: không an toàn cho synchronization. Vd:

```cpp
std::atomic<bool> ready{false};
int data = 0;

// Thread 1
data = 42;
ready.store(true, std::memory_order_relaxed);

// Thread 2
if (ready.load(std::memory_order_relaxed)) {
  std::cout << data;   // Might see 0!
}
```

Relaxed không có barrier → Thread 2 có thể thấy `ready=true` trước `data=42`.

### Acquire-Release

```cpp
std::atomic<bool> ready{false};
int data = 0;

// Thread 1 (producer)
data = 42;
ready.store(true, std::memory_order_release);

// Thread 2 (consumer)
if (ready.load(std::memory_order_acquire)) {
  std::cout << data;   // GUARANTEED to see 42
}
```

Release-Acquire pair tạo "happens-before" relationship: mọi write trước store-release của Thread 1 visible cho Thread 2 sau load-acquire.

Faster than seq_cst, sufficient cho phần lớn synchronization.

### `compare_exchange` — CAS

```cpp
std::atomic<int> n{0};

int expected = 0;
int desired = 1;
if (n.compare_exchange_strong(expected, desired)) {
  // n was 0, now 1
} else {
  // n was something else, expected updated to current
}
```

**Compare-and-Swap (CAS)**: atomically check + replace. Building block cho lock-free algorithm.

```cpp
// Atomic increment via CAS loop
void Inc(std::atomic<int>& n) {
  int old = n.load();
  while (!n.compare_exchange_weak(old, old + 1)) {
    // Spin
  }
}
```

`compare_exchange_weak` có thể spurious fail (faster on some arch) → dùng trong loop. `_strong` không spurious fail → dùng khi không loop.

## Khi nào atomic đủ?

✅ **Đủ:**

- Counter, flag, sentinel.
- Lock-free queue/stack (rất phức tạp viết đúng, dùng library).
- Reference count.

❌ **Không đủ:**

- Bảo vệ multi-step operation: "load, modify based on multiple field, store" → dùng mutex.
- Container modification: vector push_back atomic? Không trivial.
- Pattern phức tạp: lock-free hard to get right.

→ **Default**: dùng mutex cho complex shared state. Atomic cho counter, flag.

## Pattern thực tế

### Lock-free counter

```cpp
class Counter {
 public:
  void Increment() {
    n_.fetch_add(1, std::memory_order_relaxed);
  }

  int Get() const {
    return n_.load(std::memory_order_relaxed);
  }

 private:
  std::atomic<int> n_{0};
};
```

### Spinlock (don't use in production)

```cpp
class Spinlock {
 public:
  void lock() {
    while (flag_.test_and_set(std::memory_order_acquire)) {
      // Spin
    }
  }
  void unlock() {
    flag_.clear(std::memory_order_release);
  }

 private:
  std::atomic_flag flag_ = ATOMIC_FLAG_INIT;
};
```

Hữu ích cho extremely short critical section. Production thường dùng `std::mutex` (nó có thể spinwait first, then sleep).

### One-time init flag

```cpp
class LazyResource {
 public:
  Resource* Get() {
    if (!ready_.load(std::memory_order_acquire)) {
      std::lock_guard<std::mutex> lock(m_);
      if (!ready_.load(std::memory_order_relaxed)) {
        // Double-check pattern
        resource_ = new Resource();
        ready_.store(true, std::memory_order_release);
      }
    }
    return resource_;
  }

 private:
  std::atomic<bool> ready_{false};
  std::mutex m_;
  Resource* resource_ = nullptr;
};
```

**Double-checked locking** — pattern lock-free fast path, locked slow path. Hoặc dùng `std::call_once` (Bài 1).

## `std::condition_variable` recap

(Đã giới thiệu ở Bài 1, recap với pattern phức tạp hơn.)

```cpp
std::mutex m;
std::condition_variable cv;
std::queue<int> queue;
bool stop = false;

void Producer() {
  for (int i = 0; i < 10; ++i) {
    {
      std::lock_guard<std::mutex> lock(m);
      queue.push(i);
    }
    cv.notify_one();
  }
  {
    std::lock_guard<std::mutex> lock(m);
    stop = true;
  }
  cv.notify_all();
}

void Consumer() {
  while (true) {
    std::unique_lock<std::mutex> lock(m);
    cv.wait(lock, []() { return !queue.empty() || stop; });

    if (stop && queue.empty()) return;

    int item = queue.front();
    queue.pop();
    lock.unlock();
    Process(item);
  }
}
```

### Spurious wakeup

`cv.wait` có thể wake up không có notify (spurious wakeup) — do OS implementation. Đó là lý do **luôn dùng predicate**:

```cpp
cv.wait(lock, []() { return condition; });
// equivalent to
while (!condition) {
  cv.wait(lock);
}
```

### `wait_for` / `wait_until` — timeout

```cpp
if (cv.wait_for(lock, std::chrono::seconds(5),
                []() { return ready; })) {
  // Got signal
} else {
  // Timeout
}
```

## `std::async`, `std::future`, `std::promise`

### `std::async` — fire-and-forget với result

```cpp
std::future<int> f = std::async(std::launch::async, []() {
  std::this_thread::sleep_for(std::chrono::seconds(1));
  return 42;
});

// Do other work...
int result = f.get();   // Block until ready
```

`std::launch::async`: bắt buộc start thread riêng.
`std::launch::deferred`: lazy — chỉ chạy khi `.get()`.

### `std::promise`/`std::future` — explicit signaling

```cpp
std::promise<int> p;
std::future<int> f = p.get_future();

std::thread t([&p]() {
  std::this_thread::sleep_for(std::chrono::seconds(1));
  p.set_value(42);   // Signal future
});

int result = f.get();   // Block
t.join();
```

Producer/consumer with explicit handoff.

### `std::shared_future`

```cpp
std::shared_future<int> sf = std::async(...).share();

// Multiple thread đợi cùng future
auto t1 = std::thread([sf]() { std::cout << sf.get(); });
auto t2 = std::thread([sf]() { std::cout << sf.get(); });
```

`future` chỉ get 1 lần. `shared_future` cho phép nhiều thread share + get.

### Limitations

`std::async`/`future` design limitation:

- Không cancel.
- Không chain (`.then(...)` không có trong stdlib).
- Limited combinator.

→ Library bên thứ 3 (`folly::Future`, `cppcoro`, `boost::future`) hoặc Chromium `base::PostTaskAndReplyWithResult` cung cấp đầy đủ hơn.

## Memory model — đơn giản hóa

```text
CPU 1                    CPU 2
[L1 cache]              [L1 cache]
    |                       |
    +-----[Shared L2/L3]----+
              |
         [Main RAM]
```

Memory không globally consistent — cache không sync immediately. Compiler + CPU reorder instruction để optimize.

**Sequential consistency** (`seq_cst`): pretend như memory consistent, không reorder. Strongest model.

**Relaxed**: chỉ atomic, no ordering.

**Acquire-Release**: ordering tại boundary, không global.

### Khi nào care?

- Multi-threaded code: care.
- Single-threaded: không quan trọng.
- "Hot path" lock-free code: care a lot.
- "Cold path" mutex: mutex implicitly seq_cst, không lo.

→ **Beginner advice**: dùng mutex hoặc atomic seq_cst. Học acquire-release khi optimize hot path lock-free.

## Chromium threading

Chromium có `base::AtomicSequenceNumber`, `base::subtle::Atomic*`. Modern Chromium dùng `std::atomic<T>` trực tiếp.

Threading primitive Chromium: `base::Lock`, `base::AutoLock`, `base::ConditionVariable`. Tương đương stdlib nhưng integration với Chromium's task system.

→ Sẽ học chi tiết ở `chromium-native/phase-2/03-task-runners-and-threading.md`.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| `volatile` cho thread sync | NOT thread-safe! | `std::atomic<T>` thay |
| Atomic cho complex op | Race despite atomic | Dùng mutex cho multi-step |
| `memory_order_relaxed` cho sync | Visibility issue | Acquire-release pair |
| Forget `noexcept` cho atomic store | Container fallback | Atomic operation luôn noexcept |
| Mix atomic and non-atomic access | UB | Always atomic or always non-atomic |
| Spurious wakeup không check predicate | Race | `cv.wait(lock, predicate)` |
| `future.get()` 2 lần | Exception | `shared_future` hoặc cache result |
| Deadlock với mutex + cv | Stuck | Lock đúng thứ tự |

## Tóm tắt

| Concept | Take-away |
|---|---|
| `std::atomic<T>` | Atomic ops cho POD type |
| `memory_order_seq_cst` (default) | Strongest, safest |
| `memory_order_relaxed` | Atomic only, no ordering |
| `acquire/release` pair | Sync primitive, faster than seq_cst |
| `compare_exchange` | CAS — building block lock-free |
| Spinlock | Chỉ cho ultra-short critical section |
| `cv.wait(lock, predicate)` | Avoid spurious wakeup bug |
| `std::async` | Fire-and-forget async với result |
| `std::promise/future` | Explicit signal handoff |

## Exercise (optional)

1. Convert counter dùng mutex (Bài 1) sang atomic. Benchmark — atomic should be ~10x faster.
2. Implement double-checked locking cho lazy singleton.
3. Implement lock-free single-producer-single-consumer queue (hint: 2 atomic index, ring buffer).
4. Test memory order: relaxed vs acquire-release. Reproduce visibility bug với relaxed (khó trên x86, dễ hơn trên ARM).

---

**Bài kế tiếp** → [Bài 3: Build, Debug, Sanitize](03-build-debug-sanitize.md)
