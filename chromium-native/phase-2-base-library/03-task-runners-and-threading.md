# Bài 3: TaskRunners và Threading

Bài này dạy:
- Chromium threading model: UI thread, IO thread, ThreadPool, sequences.
- `base::TaskRunner`, `base::SequencedTaskRunner`, `base::SingleThreadTaskRunner`.
- `base::ThreadPool::PostTask`, `content::GetUIThreadTaskRunner`.
- Sequence vs thread: vì sao Chromium prefer sequence.
- `base::PostTaskAndReplyWithResult` pattern.
- Threading restrictions (blocking, may_block, ThreadChecker).

Kết thúc bài: bạn biết post task đúng thread/sequence, hiểu Chromium's "sequence" abstraction, viết được async task với reply callback.

Prerequisite: [cpp/phase-6/01-threads-and-mutex](../../cpp/phase-6-concurrency-and-tooling/01-threads-and-mutex.md), [Bài 2: RefCounted và WeakPtr](02-refcounted-and-weakptr.md).

## Tại sao cần threading model phức tạp?

Browser có hàng chục thread:

- Main UI thread (1).
- IO thread (1) — handle async I/O.
- Renderer threads (per renderer process).
- ThreadPool worker threads (many).
- GPU thread.
- File thread.
- Network thread.
- ...

Code chạy ở thread nào quan trọng:

- UI thread blocked → frame drop, UI freeze.
- Wrong thread access UI → race condition.
- I/O on UI thread → ANR (App Not Responding) on Android.

Chromium's threading model = framework để post tasks tới đúng thread, avoid common bugs.

## Threading model overview

```text
Browser Process:
┌────────────────────────────────────────────────────┐
│  UI Thread (main thread)                            │
│  - Render UI, handle input                          │
│  - Mojo IPC dispatch                                │
└────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────┐
│  IO Thread                                          │
│  - Network I/O                                      │
│  - Mojo message routing                             │
└────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────┐
│  ThreadPool (managed by base::ThreadPool)           │
│  - Many worker threads                              │
│  - Run sequences/parallel tasks                     │
└────────────────────────────────────────────────────┘
```

### UI thread

- Single thread, main.
- Render UI, handle event, dispatch.
- Most browser code runs here.
- **MUST NOT BLOCK** — block here = browser freeze.

### IO thread

- Network I/O, file system, Mojo message dispatch.
- Also single thread.
- Less critical than UI but still must not block.

### ThreadPool

- Worker thread pool, dynamic size.
- For background work that can run async.
- File I/O, compute, etc.

## `base::TaskRunner` hierarchy

```text
TaskRunner                    ← Abstract: PostTask
   ↑
SequencedTaskRunner          ← Tasks run sequentially (1 at a time)
   ↑
SingleThreadTaskRunner       ← Tasks run on SAME thread
```

### `base::TaskRunner`

Most general: tasks can run in parallel, in any order.

```cpp
scoped_refptr<base::TaskRunner> runner = ...;
runner->PostTask(FROM_HERE, base::BindOnce([]() {
  std::cout << "running on some worker thread";
}));
```

Tasks may run concurrently (multiple at once). Rarely used directly.

### `base::SequencedTaskRunner`

Tasks run **sequentially**, no concurrent execution. Tasks may run on different threads, but no 2 tasks of this runner run at the same time.

```cpp
scoped_refptr<base::SequencedTaskRunner> runner =
    base::ThreadPool::CreateSequencedTaskRunner({base::MayBlock()});

runner->PostTask(FROM_HERE, base::BindOnce(&Step1));
runner->PostTask(FROM_HERE, base::BindOnce(&Step2));   // Runs AFTER Step1
```

→ **Default trong Chromium**. No race within sequence — feels single-threaded.

### `base::SingleThreadTaskRunner`

Tasks run on **same OS thread**. Stronger than Sequenced.

```cpp
scoped_refptr<base::SingleThreadTaskRunner> ui_runner =
    content::GetUIThreadTaskRunner({});

ui_runner->PostTask(FROM_HERE, base::BindOnce(&UpdateUI));
```

Why need same thread vs same sequence?

- Some library require thread-local state (OpenGL, certain OS APIs).
- TLS (thread-local storage).
- Otherwise prefer sequence (more flexible scheduling).

## Sequence vs thread

**Sequence** = "tasks run one-at-a-time, in order they were posted".

A sequence may execute on different threads over time, but never concurrently.

Why prefer sequence?

- Less overhead than single-thread (ThreadPool can reuse worker).
- No race condition within sequence.
- Better scheduling — workers shared.

**Single-thread** = "tasks always run on same OS thread".

Why need:

- Thread-affine state (TLS, COM apartment, OpenGL context).
- Compatibility with library requiring thread-pinning.

→ Use sequence by default. Single-thread khi mandatory.

## `base::ThreadPool::PostTask` family

Post task to ThreadPool (background, can run on any worker):

```cpp
#include "base/task/thread_pool.h"

// Fire-and-forget task
base::ThreadPool::PostTask(
    FROM_HERE,
    {base::TaskPriority::USER_VISIBLE, base::MayBlock()},
    base::BindOnce(&DoBackgroundWork));
```

`FROM_HERE` = macro for source location (file:line) for debugging.

### Traits

```cpp
base::ThreadPool::PostTask(
    FROM_HERE,
    {
      base::TaskPriority::BEST_EFFORT,        // Low priority
      base::MayBlock(),                        // Task may do blocking I/O
      base::TaskShutdownBehavior::SKIP_ON_SHUTDOWN,
    },
    base::BindOnce(&Task));
```

Traits:

| Trait | Meaning |
|---|---|
| `TaskPriority::USER_BLOCKING` | Critical, e.g. user interaction |
| `TaskPriority::USER_VISIBLE` | Visible to user (default) |
| `TaskPriority::BEST_EFFORT` | Background, can be delayed |
| `MayBlock()` | Task may do blocking I/O (file, network) |
| `WithBaseSyncPrimitives()` | Task may use sync primitives (mutex, etc) |
| `TaskShutdownBehavior` | Behavior on shutdown |

### Sequenced task on ThreadPool

```cpp
scoped_refptr<base::SequencedTaskRunner> runner =
    base::ThreadPool::CreateSequencedTaskRunner({base::MayBlock()});

runner->PostTask(FROM_HERE, base::BindOnce(&Step1));
runner->PostTask(FROM_HERE, base::BindOnce(&Step2));
```

All tasks of `runner` run sequentially.

### Single-thread on ThreadPool

```cpp
scoped_refptr<base::SingleThreadTaskRunner> runner =
    base::ThreadPool::CreateSingleThreadTaskRunner({base::MayBlock()});

runner->PostTask(...);
```

ThreadPool reserves 1 dedicated thread for runner.

## UI thread / IO thread

```cpp
#include "content/public/browser/browser_thread.h"

// Post to UI thread
content::GetUIThreadTaskRunner({})->PostTask(
    FROM_HERE,
    base::BindOnce(&UpdateUI));

// Post to IO thread
content::GetIOThreadTaskRunner({})->PostTask(
    FROM_HERE,
    base::BindOnce(&NetworkWork));
```

`content::BrowserThread::UI/IO` — exclusively these 2 thread (defined trong content layer). Most Chromium code runs on UI thread.

### Check current thread

```cpp
DCHECK_CURRENTLY_ON(content::BrowserThread::UI);
// ... code only safe on UI thread ...

if (content::BrowserThread::CurrentlyOn(content::BrowserThread::IO)) {
  // Handle differently
}
```

### Cross-thread post

```cpp
void UIWork() {
  DCHECK_CURRENTLY_ON(content::BrowserThread::UI);

  content::GetIOThreadTaskRunner({})->PostTask(
      FROM_HERE,
      base::BindOnce(&IOWork));
}

void IOWork() {
  DCHECK_CURRENTLY_ON(content::BrowserThread::IO);
  // ...
}
```

## `PostTaskAndReplyWithResult` — reply pattern

Common pattern: do work on background thread, callback on UI thread with result.

```cpp
base::ThreadPool::PostTaskAndReplyWithResult(
    FROM_HERE,
    {base::MayBlock()},
    base::BindOnce(&ComputeExpensive),        // Background work
    base::BindOnce(&OnComputeDone));          // Reply on current thread
```

`ComputeExpensive` runs on ThreadPool. Result auto-passed to `OnComputeDone` on **calling thread** (where PostTaskAndReplyWithResult was called).

```cpp
int ComputeExpensive() {
  // ... slow work ...
  return 42;
}

void OnComputeDone(int result) {
  // ... receives 42, on calling thread ...
}
```

### With class methods

```cpp
class MyHandler {
 public:
  void Start() {
    base::ThreadPool::PostTaskAndReplyWithResult(
        FROM_HERE,
        {base::MayBlock()},
        base::BindOnce(&MyHandler::ComputeStatic),   // Static or free fn
        base::BindOnce(&MyHandler::OnDone,
                       weak_factory_.GetWeakPtr()));   // Member with WeakPtr
  }

  static int ComputeStatic() { return 42; }

  void OnDone(int result) {
    // Receives 42 on calling thread
  }

 private:
  base::WeakPtrFactory<MyHandler> weak_factory_{this};
};
```

Note: callback uses `WeakPtr` → if `MyHandler` destroyed before reply fires, `OnDone` skipped.

### PostTask + Reply (no return)

```cpp
base::ThreadPool::PostTaskAndReply(
    FROM_HERE,
    {base::MayBlock()},
    base::BindOnce(&DoWork),
    base::BindOnce(&OnDone));
```

When work doesn't return value.

## Thread restriction: blocking

```cpp
void FooThatBlocks() {
  base::ScopedAllowBaseSyncPrimitives allow;   // Required for mutex
  // ... lock + wait ...
}

void FooThatDoesIO() {
  base::ScopedAllowBlocking allow_blocking;   // Required for file I/O
  std::ifstream file("...");
  // ...
}
```

Chromium **forbids blocking on UI/IO thread** by default. If you must, declare scope with `ScopedAllowBlocking`.

**Better**: post to ThreadPool with `MayBlock()`:

```cpp
base::ThreadPool::PostTask(
    FROM_HERE,
    {base::MayBlock()},
    base::BindOnce(&DoBlockingIO));
```

### `MUST_USE_RESULT`, `[[nodiscard]]`

```cpp
[[nodiscard]] bool PostTask(...);

PostTask(...);   // Warning: discarded return value
```

Many task functions return bool (success). Forgetting check = silently fail. `[[nodiscard]]` catches.

## ThreadChecker / SequenceChecker

```cpp
class MyClass {
 public:
  MyClass() {
    DETACH_FROM_SEQUENCE(sequence_checker_);
  }

  void Foo() {
    DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
    // ... only allowed on bound sequence
  }

 private:
  SEQUENCE_CHECKER(sequence_checker_);
};
```

`SequenceChecker` debug-only assertion: "this method always called on same sequence".

Variants:
- `THREAD_CHECKER`: strict, same thread.
- `SEQUENCE_CHECKER`: same sequence (looser, more flexible).

Catch threading bugs sớm trong debug build.

## Real example

```cpp
// chrome/browser/foo/foo_service.h
class FooService {
 public:
  void Initialize();
  void LoadAsync(base::OnceCallback<void(std::string)> callback);

 private:
  void OnLoadDone(base::OnceCallback<void(std::string)> callback,
                  std::string result);

  scoped_refptr<base::SequencedTaskRunner> task_runner_;
  base::WeakPtrFactory<FooService> weak_factory_{this};
};
```

```cpp
// foo_service.cc
void FooService::Initialize() {
  task_runner_ = base::ThreadPool::CreateSequencedTaskRunner(
      {base::TaskPriority::USER_VISIBLE, base::MayBlock()});
}

void FooService::LoadAsync(base::OnceCallback<void(std::string)> callback) {
  task_runner_->PostTaskAndReplyWithResult(
      FROM_HERE,
      base::BindOnce(&FooService::LoadFromDisk),   // Runs on task_runner_
      base::BindOnce(&FooService::OnLoadDone,
                     weak_factory_.GetWeakPtr(),
                     std::move(callback)));        // Runs on UI thread (caller)
}

// Static (no this) — runs on background thread
std::string FooService::LoadFromDisk() {
  // ... file I/O ...
  return contents;
}

void FooService::OnLoadDone(base::OnceCallback<void(std::string)> callback,
                            std::string result) {
  // Back on UI thread
  std::move(callback).Run(std::move(result));
}
```

Flow:

1. Caller (UI thread) → `LoadAsync(cb)`.
2. `LoadFromDisk` runs on `task_runner_` (ThreadPool, blocking allowed).
3. Result → `OnLoadDone` on UI thread (where called).
4. `OnLoadDone` → `cb` on UI thread.

If `FooService` destroyed mid-flight → `OnLoadDone` skipped (WeakPtr).

## Cross-thread parameter passing

```cpp
// Pass by value (copy)
content::GetIOThreadTaskRunner({})->PostTask(
    FROM_HERE,
    base::BindOnce([](std::string data) {
      // data is COPY (or move if rvalue)
    }, "hello"));

// Pass scoped_refptr (refcount, thread-safe)
auto data = base::MakeRefCounted<Data>();
content::GetIOThreadTaskRunner({})->PostTask(
    FROM_HERE,
    base::BindOnce(&IOWork, data));

// Pass unique_ptr — moves ownership
auto data = std::make_unique<Data>();
content::GetIOThreadTaskRunner({})->PostTask(
    FROM_HERE,
    base::BindOnce([](std::unique_ptr<Data> d) { ... },
                   std::move(data)));
```

**Don't pass raw pointer cross-thread** — lifetime hard to reason. Use `scoped_refptr`, `unique_ptr`, or value.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Blocking on UI thread | UI freeze | Post to ThreadPool with `MayBlock()` |
| Wrong thread access | Race / crash | `DCHECK_CURRENTLY_ON` |
| `Unretained` cross-thread | UAF if destroyed mid-flight | `WeakPtr` |
| Forget `weak_factory_` last | UAF in dtor | Make WeakPtrFactory last member |
| Pass raw pointer cross-thread | Lifetime undefined | `scoped_refptr` / `unique_ptr` |
| Sequence vs Thread confusion | Subtle bugs | Default to sequence; thread only when needed |
| Heavy work on IO thread | Network slow | IO thread = dispatch, real work to ThreadPool |
| Synchronously wait on UI thread | Deadlock | Async always |

## Tóm tắt

| Concept | Take-away |
|---|---|
| UI thread | Main thread, must not block |
| IO thread | Network/I/O dispatch, must not block |
| ThreadPool | Background worker pool |
| `TaskRunner` | Post task abstraction |
| `SequencedTaskRunner` | Tasks run sequentially (default) |
| `SingleThreadTaskRunner` | Tasks run on same OS thread |
| `base::ThreadPool::PostTask` | Fire-and-forget background task |
| `PostTaskAndReplyWithResult` | Background work + reply on calling thread |
| `base::MayBlock()` | Trait: task may do blocking I/O |
| `DCHECK_CURRENTLY_ON` | Verify thread |
| `SEQUENCE_CHECKER` | Member assertion |

## Comparison

| Chromium | stdlib |
|---|---|
| `base::ThreadPool::PostTask` | `std::async(std::launch::async, ...)` |
| `PostTaskAndReplyWithResult` | `std::future` + manual reply |
| `SequencedTaskRunner` | (no direct equivalent) |
| `WeakPtr` callback | Manual `weak_ptr` + check |

## Exercise (optional)

1. Tìm 1 file Chromium dùng `PostTaskAndReplyWithResult`. Trace flow.
2. Implement `class FileLoader` với `LoadAsync(callback)` pattern.
3. Trace: từ UI thread, post task tới ThreadPool, reply về UI thread. Verify thread bằng `DCHECK_CURRENTLY_ON`.
4. So sánh: `base::ThreadPool::CreateSequencedTaskRunner` vs `CreateSingleThreadTaskRunner` — when to use each?

---

**Bài kế tiếp** → [Bài 4: Logging và Assertions](04-logging-and-assertions.md)
