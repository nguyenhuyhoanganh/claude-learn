# Bài 4: Logging và Assertions

Bài này dạy:
- `LOG(INFO/WARNING/ERROR/FATAL)`: log levels.
- `DLOG`, `VLOG`: debug-only và verbose.
- `CHECK` (always) vs `DCHECK` (debug-only).
- `NOTREACHED()`, `NOTIMPLEMENTED()`.
- Comparison macros: `CHECK_EQ`, `DCHECK_GT`, etc.
- Scoped tracing intro.
- Best practice: khi nào CHECK vs DCHECK vs LOG.

Kết thúc bài: bạn dùng đúng macro logging/assertion, debug được crash với CHECK, viết được code Chromium production-ready.

Prerequisite: [cpp/phase-5/03-error-handling-philosophy](../../cpp/phase-5-modern-features-errors/03-error-handling-philosophy.md).

## Tại sao macros riêng?

Chromium tắt exception (`-fno-exceptions`). Cần alternative để:

- Crash với clear error message khi invariant violated.
- Log diagnostic mà không slow down release build.
- Conditional logging (verbose chỉ khi developer bật).
- Cross-platform (file path, format).

`LOG`/`CHECK`/`DCHECK` macros giải 4 mục đích này.

## `LOG()` — runtime log

```cpp
#include "base/logging.h"

LOG(INFO) << "Loaded " << count << " items";
LOG(WARNING) << "Retry attempt " << attempt;
LOG(ERROR) << "Failed to open file: " << path;
LOG(FATAL) << "Unrecoverable error";   // CRASH after logging
```

### Levels

| Level | Use case | Show in release |
|---|---|---|
| `INFO` | General diagnostic | Yes |
| `WARNING` | Non-critical issue | Yes |
| `ERROR` | Error happened, recovered | Yes |
| `FATAL` | Unrecoverable → CRASH | Yes |

`LOG(FATAL)` always crashes (after logging). Use carefully.

### Stream syntax

```cpp
LOG(INFO) << "User " << user_id << " logged in at "
          << base::Time::Now().ToString();
```

Use `<<` like `std::cout`. Chromium's stream supports any type with `operator<<`.

### Where logs go?

- Linux: `/tmp/chrome.log` (debug build) or stderr.
- macOS: `~/Library/Logs/Chromium/`.
- Windows: `%USERPROFILE%\AppData\Local\Chromium\chrome_debug.log`.
- Configurable via `--log-file=...` command-line.

## `DLOG()` — debug-only

```cpp
DLOG(INFO) << "Debug detail";
```

Compiled to **no-op in release build**. Use for verbose diagnostic that's only useful in development.

```cpp
DLOG(WARNING) << "About to do something risky";
DLOG(ERROR) << "Validation failed for " << input;
```

In release: zero overhead. In debug: same as LOG.

## `VLOG(n)` — verbose log

```cpp
VLOG(1) << "Step 1 details";    // Show if --v=1
VLOG(2) << "Step 2 deep dive";  // Show if --v=2
```

Controlled by `--v=N` command-line flag:

```bash
chrome --v=1   # Show VLOG(1)
chrome --v=2   # Show VLOG(1) AND VLOG(2)
```

Per-file logging:

```bash
chrome --vmodule=foo_handler=2  # File `foo_handler.cc`: VLOG up to level 2
```

Useful for selective deep diagnostics in production.

## `CHECK()` — runtime assertion

```cpp
CHECK(value != nullptr);
CHECK(items.size() > 0) << "Expected at least 1 item, got " << items.size();
```

`CHECK(condition)`:

- If `condition` false → log + crash.
- **In both debug AND release builds**.

Use for invariants that **MUST hold** for program correctness.

### `CHECK_*` comparison

```cpp
CHECK_EQ(a, b);     // a == b
CHECK_NE(a, b);     // a != b
CHECK_LT(a, b);     // a < b
CHECK_LE(a, b);     // a <= b
CHECK_GT(a, b);     // a > b
CHECK_GE(a, b);     // a >= b
```

Better than `CHECK(a == b)` because crash message shows actual values:

```
Check failed: count == 5. count=3
```

vs `CHECK(count == 5)`:

```
Check failed: count == 5.
```

→ Use `CHECK_EQ` etc. when comparing.

## `DCHECK()` — debug-only assertion

```cpp
DCHECK(invariant);
DCHECK_EQ(state, kReady);
```

Same as `CHECK` but **only in debug build**.

In release: **completely compiled out** (zero overhead).

### When CHECK vs DCHECK?

| Use | When |
|---|---|
| `CHECK` | Invariant absolutely critical (memory safety, security) |
| `DCHECK` | Logical invariant (developer assumption) |
| Neither | Recoverable error; use LOG + return |

Examples:

```cpp
void Process(const std::vector<int>& items, int idx) {
  // DCHECK: developer expects this; in release just trust
  DCHECK(!items.empty());
  DCHECK_LT(idx, items.size());

  // CHECK: memory safety — if idx > size, OOB → security issue
  CHECK_LT(idx, items.size());
  return items[idx];
}
```

Actually in Chromium codebase, you'll see lots of `CHECK` for both — Chromium prefers crash over UB.

### `dcheck_always_on`

GN flag:

```python
dcheck_always_on = true
```

Treats `DCHECK` as `CHECK` even in release build. Useful for staging/canary build to catch bugs.

## `NOTREACHED()` and `NOTIMPLEMENTED()`

```cpp
switch (state) {
  case kReady: HandleReady(); break;
  case kBusy: HandleBusy(); break;
  case kDone: HandleDone(); break;
}
NOTREACHED() << "Unknown state: " << state;   // Crash + log
```

`NOTREACHED()` = "code should not execute here". Crashes if reached.

```cpp
void Foo() {
  NOTIMPLEMENTED();
}
```

`NOTIMPLEMENTED()` = "TODO, not implemented yet". Logs warning (doesn't crash).

## `LOG_IF` — conditional log

```cpp
LOG_IF(WARNING, retries > 3) << "Too many retries";
DLOG_IF(INFO, debug_mode) << "Debug info";
CHECK_IF(condition, other_check) << "...";
```

Log/check only if first arg true.

## `PLOG` — log with errno

```cpp
if (open(path) < 0) {
  PLOG(ERROR) << "Failed to open " << path;
  // PLOG appends: "PERMISSION_DENIED" or similar from errno
}
```

`P` = "POSIX errno". Hữu ích cho system call.

## `ScopedTracing` — performance tracing

```cpp
#include "base/trace_event/trace_event.h"

void Foo() {
  TRACE_EVENT0("rendering", "Foo");
  // ... work ...
  // Event scoped to function — auto end
}

void Bar(int n) {
  TRACE_EVENT1("rendering", "Bar", "count", n);
  // Annotate with arg
}
```

Generate trace events visible in `chrome://tracing` or Perfetto. Useful for perf analysis.

Categories: "rendering", "network", "javascript", etc.

## Crash dump

When Chromium crashes (FATAL log, CHECK fail, segfault), it produces:

1. **Stack trace** in log.
2. **Minidump** file (Windows-style mini crash dump).
3. **Crash report** uploaded to Chromium crash server (if enabled).

Crash reports have:

- Stack trace.
- Module list.
- Process state.
- Custom keys (set via `base::debug::SetCrashKeyString`).

### Custom crash keys

```cpp
#include "base/debug/crash_logging.h"

static auto* const k_url_key = base::debug::AllocateCrashKeyString(
    "current_url", base::debug::CrashKeySize::Size256);

base::debug::SetCrashKeyString(k_url_key, current_url);

// Later, if crash happens, "current_url" included in report
```

Help debug crashes with context.

## Real Chromium example

```cpp
// chrome/browser/foo/foo_service.cc
#include "base/logging.h"

void FooService::Initialize() {
  DCHECK_CURRENTLY_ON(content::BrowserThread::UI);
  DCHECK(!initialized_);

  if (!LoadConfig()) {
    LOG(ERROR) << "Failed to load FooService config";
    // Continue with defaults
    config_ = DefaultConfig();
  }

  initialized_ = true;
  VLOG(1) << "FooService initialized";
}

void FooService::HandleRequest(int request_id) {
  CHECK_NE(request_id, 0) << "Invalid request_id";

  auto it = pending_requests_.find(request_id);
  if (it == pending_requests_.end()) {
    DLOG(WARNING) << "Unknown request_id: " << request_id;
    return;
  }

  switch (it->second.state) {
    case kPending:
      ProcessPending(it->second);
      break;
    case kActive:
      ProcessActive(it->second);
      break;
    case kComplete:
      NOTREACHED() << "Should not receive request for completed: " << request_id;
      break;
  }
}
```

## Best practice

### LOG vs CHECK vs DCHECK matrix

| Condition | Use |
|---|---|
| Critical invariant, MUST hold | `CHECK` |
| Developer assumption, should hold but not security | `DCHECK` |
| Recoverable error, log + return | `LOG(ERROR)` + return |
| Diagnostic info | `LOG(INFO)` or `VLOG` |
| Detail for debugging | `DLOG(INFO)` |
| Code shouldn't reach here | `NOTREACHED()` |
| Function intentionally stubbed | `NOTIMPLEMENTED()` |

### Don't over-CHECK

```cpp
// BAD: CHECK trivial things
void Foo(int x) {
  CHECK(x >= 0);    // What if x = -1? Just crash?
  Process(x);
}
```

Better: handle gracefully, return error, document precondition.

### Don't log too much

```cpp
// BAD: log every function call
void HotPath() {
  LOG(INFO) << "Entered HotPath";    // Performance killer
  // ...
}
```

Use `DLOG` or `VLOG(n)` for verbose.

### Don't ignore CHECK failure pattern

```cpp
// BAD
if (!CheckSomething()) {
  LOG(ERROR) << "Check failed";
  // Continue anyway
}

// GOOD: either CHECK or handle properly
if (!CheckSomething()) {
  LOG(ERROR) << "Check failed, recovering";
  return Recover();  // Real recovery
}
```

## Chromium-specific patterns

### `RAW_CHECK` — minimal CHECK

```cpp
RAW_CHECK(invariant);
```

For code where standard `CHECK` may not be safe (e.g., during init before logging system ready). Minimal — no stream, just crash.

### `IMMEDIATE_CRASH()`

```cpp
if (corruption_detected) {
  IMMEDIATE_CRASH();
}
```

Force crash NOW (vs `LOG(FATAL)` which has slight cleanup). For security-critical scenarios.

### `SCOPED_CRASH_KEY_*` — crash context

```cpp
void ProcessUrl(const GURL& url) {
  SCOPED_CRASH_KEY_STRING256("network", "current_url", url.spec());
  // If crash happens within this scope, "current_url" set
}
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| `CHECK(x = 5)` (assign, not equal) | Always succeed | `CHECK_EQ(x, 5)` |
| `LOG(INFO)` on hot path | Perf killer | `VLOG(1)` or `DLOG` |
| `CHECK` instead of error handling | Crash on user input | Handle recoverable error gracefully |
| `DCHECK` something with side effect | No-op in release! | Don't put logic in DCHECK |
| `NOTREACHED` then continue | UB (path taken anyway) | After `NOTREACHED`, code shouldn't continue meaningfully |
| Stream + dangerous side effect | Side effect compiled out in `DLOG` | Keep side effects outside log statement |
| `LOG(FATAL)` for handleable error | Crash unnecessarily | Use `LOG(ERROR)` + return |

## Tóm tắt

| Macro | When |
|---|---|
| `LOG(level)` | Runtime log (release + debug) |
| `DLOG(level)` | Debug-only log |
| `VLOG(n)` | Verbose log (controlled by `--v=N`) |
| `CHECK(cond)` | Always-on assertion (crash on fail) |
| `DCHECK(cond)` | Debug-only assertion |
| `CHECK_EQ(a, b)` | Equality with value in error msg |
| `NOTREACHED()` | "Code shouldn't reach here" |
| `NOTIMPLEMENTED()` | "Not implemented yet" (warn, no crash) |
| `LOG_IF(level, cond)` | Conditional log |
| `PLOG` | Log with errno |
| `TRACE_EVENT*` | Performance trace |
| `SCOPED_CRASH_KEY_*` | Crash context |

## Build configuration

GN flags affect macros:

```python
is_debug = true              # DLOG, DCHECK enabled
dcheck_always_on = true      # DCHECK in release builds too
enable_logging = true        # Compile log statements
```

`is_official_build = true` strips DCHECK + DLOG completely → smaller binary.

## Exercise (optional)

1. Find 1 file Chromium with `LOG(FATAL)`. Understand when it's used.
2. Trace `CHECK` failure: build with `CHECK(false)`, run, observe crash output.
3. Implement function with `DCHECK_CURRENTLY_ON(BrowserThread::UI)`. Call from IO thread → see crash.
4. Add `VLOG(2)` to a function. Run with `--vmodule=myfile=2` → see output.

---

**Phase kế** → [Phase 3: content/ Layer](../phase-3-content-layer/01-process-model-deep.md)
