# Plan 01: Skeleton cho `cpp/` và `chromium-native/`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tạo skeleton cho 2 course mới (`cpp/`, `chromium-native/`) bao gồm 2 README đầy đủ + 34 file stub + cấu trúc thư mục, push 1 commit lên `origin/chromium`. Unblock các plan phase tiếp theo.

**Architecture:** Working trên branch `chromium` (git root: `/Users/hoanganh/Workspace/learn/`). Tạo 2 thư mục course mới sibling với `chromium/` hiện có. README đầy đủ nội dung; mỗi file content là stub gồm heading + placeholder + cross-link tới bài kế tiếp.

**Tech Stack:** Markdown, git (commit + push lên `origin/chromium`).

**Spec:** `docs/superpowers/plans/../specs/2026-05-21-cpp-and-native-courses-design.md`

---

## File structure được tạo

```text
cpp/
├── README.md                                  ← Full content (~120 dòng)
├── phase-1-getting-started/
│   ├── 01-hello-world-toolchain.md            ← Stub
│   ├── 02-types-and-control-flow.md           ← Stub
│   └── 03-headers-and-scopes.md               ← Stub
├── phase-2-pointers-references-oop/
│   ├── 01-pointers-and-references.md          ← Stub
│   ├── 02-classes-and-lifetime.md             ← Stub
│   └── 03-inheritance-and-polymorphism.md     ← Stub
├── phase-3-modern-resource-mgmt/
│   ├── 01-smart-pointers.md                   ← Stub
│   ├── 02-move-semantics.md                   ← Stub
│   └── 03-raii-and-rule-of-five.md            ← Stub
├── phase-4-templates-and-stl/
│   ├── 01-templates.md                        ← Stub
│   ├── 02-containers-and-strings.md           ← Stub
│   ├── 03-iterators-and-algorithms.md         ← Stub
│   └── 04-lambdas-and-callables.md            ← Stub
├── phase-5-modern-features-errors/
│   ├── 01-auto-and-bindings.md                ← Stub
│   ├── 02-optional-variant-tuple.md           ← Stub
│   └── 03-error-handling-philosophy.md        ← Stub
└── phase-6-concurrency-and-tooling/
    ├── 01-threads-and-mutex.md                ← Stub
    ├── 02-atomic-and-memory-model.md          ← Stub
    └── 03-build-debug-sanitize.md             ← Stub

chromium-native/
├── README.md                                  ← Full content (~120 dòng)
├── phase-1-codebase-and-build/
│   ├── 01-source-tree-tour.md                 ← Stub
│   ├── 02-code-search-and-tools.md            ← Stub
│   └── 03-gn-ninja-deep.md                    ← Stub
├── phase-2-base-library/
│   ├── 01-callbacks-and-bind.md               ← Stub
│   ├── 02-refcounted-and-weakptr.md           ← Stub
│   ├── 03-task-runners-and-threading.md       ← Stub
│   └── 04-logging-and-assertions.md           ← Stub
├── phase-3-content-layer/
│   ├── 01-process-model-deep.md               ← Stub
│   ├── 02-browser-context-and-profile.md      ← Stub
│   └── 03-url-loading-and-network.md          ← Stub
├── phase-4-services-and-subsystems/
│   ├── 01-keyed-service-pattern.md            ← Stub
│   ├── 02-prefs-system-cpp.md                 ← Stub
│   └── 03-services-architecture.md            ← Stub
└── phase-5-testing/
    ├── 01-unit-tests-gtest.md                 ← Stub
    └── 02-browser-and-content-tests.md        ← Stub
```

Tổng: **36 file mới** (2 README đầy đủ + 34 stub) trong **11 folder mới**.

---

### Stub template

Mọi stub đều theo template duy nhất sau (thay `<placeholder>` cho mỗi file):

```markdown
# Bài N: <Tên bài>

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

<1-3 bullet liệt kê concept chính sẽ dạy>

---

**Bài kế tiếp** → [<Tên bài kế>](<đường dẫn tương đối>)
```

File cuối phase thay link "Bài kế tiếp" bằng "Phase kế" trỏ tới file đầu của phase tiếp theo (hoặc README nếu là phase cuối).

---

## Task 1: Tạo cấu trúc thư mục cpp/

**Files:**
- Create: 7 directory (`cpp/` + 6 phase folder)

- [ ] **Step 1: Tạo folder structure**

Chạy:
```bash
cd /Users/hoanganh/Workspace/learn && \
  mkdir -p cpp/phase-1-getting-started \
           cpp/phase-2-pointers-references-oop \
           cpp/phase-3-modern-resource-mgmt \
           cpp/phase-4-templates-and-stl \
           cpp/phase-5-modern-features-errors \
           cpp/phase-6-concurrency-and-tooling
```

- [ ] **Step 2: Verify folder tree**

Chạy:
```bash
ls -d /Users/hoanganh/Workspace/learn/cpp/phase-*
```

Expected output (6 folder, alphabetical):
```
/Users/hoanganh/Workspace/learn/cpp/phase-1-getting-started
/Users/hoanganh/Workspace/learn/cpp/phase-2-pointers-references-oop
/Users/hoanganh/Workspace/learn/cpp/phase-3-modern-resource-mgmt
/Users/hoanganh/Workspace/learn/cpp/phase-4-templates-and-stl
/Users/hoanganh/Workspace/learn/cpp/phase-5-modern-features-errors
/Users/hoanganh/Workspace/learn/cpp/phase-6-concurrency-and-tooling
```

---

## Task 2: Viết cpp/README.md

**Files:**
- Create: `cpp/README.md`

- [ ] **Step 1: Tạo file `cpp/README.md` với nội dung sau**

```markdown
# C++ Foundation

> Pure C++ — không phụ thuộc Chromium. Học xong có thể đọc/viết code production C++17/20.

Khoá học này dành cho developer muốn học C++ từ đầu hoặc consolidate lại nền tảng để chuẩn bị làm việc với codebase modern (Chromium, LLVM, Node.js, etc.). Sau khoá:

- Đọc và viết được C++ ở mức production (C++17/20).
- Hiểu memory model, lifetime, RAII đủ để debug bug về pointer / lifetime.
- Sử dụng STL containers/algorithms thành thạo.
- Đọc được code dùng template, lambda, smart pointer, move semantics.
- Hiểu concurrency cơ bản: thread, mutex, atomic, std::async.

## Tổng quan kiến trúc

```text
┌─────────────────────────────────────────────────────────────────┐
│  C++ Foundation                                                  │
│                                                                  │
│  Toolchain  →  Types  →  Pointers  →  Class  →  RAII / Smart    │
│  Pointer  →  Templates / STL  →  Modern Features  →  Concurrency │
│  →  Tooling (CMake, debugger, sanitizer)                         │
└─────────────────────────────────────────────────────────────────┘
```

Course tự cấp, không cần Chromium. Có thể học độc lập.

## Vì sao học C++ hiện đại?

C++ "modern" (C++17/20) khác C++ truyền thống rất nhiều:

- Smart pointer thay raw `new`/`delete` — gần như không bao giờ phải tự `delete`.
- RAII là rule, không phải exception — mọi resource được scope-bound.
- Move semantics, perfect forwarding — ownership rõ ràng.
- STL chiếm phần lớn code — học STL trước, học OOP nâng cao sau.

Course này dạy modern C++ là default; old-style chỉ nhắc khi cần đọc legacy code.

## Cấu trúc khoá học (6 phase, 19 bài)

```text
cpp/
├── README.md                                  ← Bạn đang ở đây
│
├── phase-1-getting-started/                   ← Toolchain, syntax, control flow
│   ├── 01-hello-world-toolchain.md
│   ├── 02-types-and-control-flow.md
│   └── 03-headers-and-scopes.md
│
├── phase-2-pointers-references-oop/           ← Pointer, ref, class, inheritance
│   ├── 01-pointers-and-references.md
│   ├── 02-classes-and-lifetime.md
│   └── 03-inheritance-and-polymorphism.md
│
├── phase-3-modern-resource-mgmt/              ← ⭐ Smart pointer, move, RAII
│   ├── 01-smart-pointers.md
│   ├── 02-move-semantics.md
│   └── 03-raii-and-rule-of-five.md
│
├── phase-4-templates-and-stl/                 ← Template, container, algorithm, lambda
│   ├── 01-templates.md
│   ├── 02-containers-and-strings.md
│   ├── 03-iterators-and-algorithms.md
│   └── 04-lambdas-and-callables.md
│
├── phase-5-modern-features-errors/            ← auto, optional, error handling
│   ├── 01-auto-and-bindings.md
│   ├── 02-optional-variant-tuple.md
│   └── 03-error-handling-philosophy.md
│
└── phase-6-concurrency-and-tooling/           ← Thread, atomic, debugger, sanitizer
    ├── 01-threads-and-mutex.md
    ├── 02-atomic-and-memory-model.md
    └── 03-build-debug-sanitize.md
```

## Lộ trình học (~6-8 tuần)

| Phase | Nội dung | Thời gian | Ưu tiên |
|-------|----------|-----------|---------|
| 1 | Getting started | 3-4 ngày | Phải học |
| 2 | Pointer, reference, OOP | 1 tuần | Phải học |
| **3** | **Modern resource management** | **1-1.5 tuần** | **⭐ Core** |
| 4 | Templates + STL | 1.5-2 tuần | Cần biết |
| 5 | Modern features + error handling | 1 tuần | Nên biết |
| 6 | Concurrency + tooling | 1 tuần | Khi cần debug |

## Yêu cầu nền tảng

- Biết ít nhất 1 ngôn ngữ programming (Python, JS, Java, Go...). Course có analogy với JS/TS khi hợp lý.
- Command line + git basics.
- Compiler: `g++` ≥ 9 hoặc `clang++` ≥ 10 (C++17 support đầy đủ).

## Nguyên tắc học

1. **Compile mọi code mẫu** — code chỉ ngấm khi tay đã gõ và compiler đã ăn.
2. **Hiểu WHY trước HOW** — Tại sao smart pointer? Tại sao move semantics? Tại sao Chromium tắt exception? Hiểu lý do để nhớ lâu.
3. **Đọc error message của compiler** — C++ error message dài và đáng sợ ban đầu, nhưng đó là teacher tốt nhất.
4. **Phase 3 (resource management) là milestone** — học chậm, kỹ. Đây là phần phân biệt C++ modern vs legacy.

## Bắt đầu

→ [Phase 1: Getting Started](phase-1-getting-started/01-hello-world-toolchain.md)
```

- [ ] **Step 2: Verify file tồn tại và đếm dòng**

Chạy:
```bash
wc -l /Users/hoanganh/Workspace/learn/cpp/README.md
```

Expected: ≥ 90 dòng (thực tế ~115 dòng).

---

## Task 3: Viết 19 stub file của cpp/

**Files:**
- Create: 19 file `.md` stub (đường dẫn liệt kê dưới)

- [ ] **Step 1: Tạo file `cpp/phase-1-getting-started/01-hello-world-toolchain.md`**

```markdown
# Bài 1: Hello World và Toolchain

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- Compiler (`g++`, `clang++`): cách invoke, flags cơ bản (`-std=c++17`, `-Wall`, `-g`, `-O0`).
- Cấu trúc 1 project C++ tối thiểu: `.cpp` file → object → executable.
- Header file (`.h`) vs source (`.cpp`); `#include` quote vs angle bracket.
- Hello world và compile run cycle.

---

**Bài kế tiếp** → [Bài 2: Types và Control Flow](02-types-and-control-flow.md)
```

- [ ] **Step 2: Tạo `cpp/phase-1-getting-started/02-types-and-control-flow.md`**

```markdown
# Bài 2: Types và Control Flow

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- Built-in types: `int`, `double`, `float`, `bool`, `char`, kích thước cố định (`int32_t`, `uint8_t`...).
- Biến, `const`, `constexpr`, type deduction với `auto`.
- Control flow: `if`/`else`, `for`, `while`, `switch`, range-for.
- Function: declaration vs definition, default arguments, function overloading, `inline`.

---

**Bài kế tiếp** → [Bài 3: Headers và Scopes](03-headers-and-scopes.md)
```

- [ ] **Step 3: Tạo `cpp/phase-1-getting-started/03-headers-and-scopes.md`**

```markdown
# Bài 3: Headers và Scopes

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- Header guard: `#pragma once` vs `#ifndef`/`#define`/`#endif`.
- `.h` vs `.cpp`: thường khai báo nằm `.h`, định nghĩa nằm `.cpp`. Khi nào ngược lại (template, `inline`).
- Namespace: declaration, nested, `using` directive, `using namespace` anti-pattern.
- Forward declaration: khi nào dùng, vì sao tránh full include.
- Scope và lifetime: block scope, function scope, file scope, automatic vs static storage.

---

**Phase kế** → [Phase 2: Pointers, References, OOP](../phase-2-pointers-references-oop/01-pointers-and-references.md)
```

- [ ] **Step 4: Tạo `cpp/phase-2-pointers-references-oop/01-pointers-and-references.md`**

```markdown
# Bài 1: Pointers và References

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- Pointer cơ bản: `T*`, `&` lấy địa chỉ, `*` dereference, `nullptr`.
- Reference: `T&`, khác pointer ở đâu (không reseat, không nullable).
- `const` correctness: `const T*`, `T const*`, `T* const`, `const T&`.
- Khi nào dùng pointer, khi nào dùng reference (rule of thumb).
- Pointer arithmetic — nhắc qua, không dạy sâu.

---

**Bài kế tiếp** → [Bài 2: Classes và Lifetime](02-classes-and-lifetime.md)
```

- [ ] **Step 5: Tạo `cpp/phase-2-pointers-references-oop/02-classes-and-lifetime.md`**

```markdown
# Bài 2: Classes và Lifetime

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- `class` vs `struct`: chỉ khác default access.
- Constructor (default, parameterized, copy, move), destructor, member initialization list.
- Access: `public`, `private`, `protected`.
- `this` pointer, member function, `const` member function.
- Stack vs heap: khi nào object sống ở đâu, automatic vs dynamic lifetime.

---

**Bài kế tiếp** → [Bài 3: Inheritance và Polymorphism](03-inheritance-and-polymorphism.md)
```

- [ ] **Step 6: Tạo `cpp/phase-2-pointers-references-oop/03-inheritance-and-polymorphism.md`**

```markdown
# Bài 3: Inheritance và Polymorphism

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- Public inheritance, `virtual` function, `override`, `final`.
- Abstract class (pure virtual), interface pattern.
- Virtual destructor — vì sao base class cần.
- Object slicing pitfall.
- Multiple inheritance (nhắc qua, không khuyến khích).

---

**Phase kế** → [Phase 3: Modern Resource Management](../phase-3-modern-resource-mgmt/01-smart-pointers.md)
```

- [ ] **Step 7: Tạo `cpp/phase-3-modern-resource-mgmt/01-smart-pointers.md`**

```markdown
# Bài 1: Smart Pointers

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- `std::unique_ptr<T>`: single ownership, move-only.
- `std::shared_ptr<T>`: shared ownership, reference count.
- `std::weak_ptr<T>`: non-owning observer.
- `std::make_unique` / `std::make_shared` — vì sao prefer over `new`.
- Ownership semantics: khi nào dùng cái nào (rule of thumb).

---

**Bài kế tiếp** → [Bài 2: Move Semantics](02-move-semantics.md)
```

- [ ] **Step 8: Tạo `cpp/phase-3-modern-resource-mgmt/02-move-semantics.md`**

```markdown
# Bài 2: Move Semantics

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- Lvalue vs rvalue: định nghĩa, ví dụ.
- Rvalue reference `T&&`.
- `std::move` thực sự làm gì (chỉ là cast).
- Move constructor, move assignment operator.
- Perfect forwarding intro (`std::forward`).
- Khi nào move tự động xảy ra (return by value, RVO).

---

**Bài kế tiếp** → [Bài 3: RAII và Rule of Five](03-raii-and-rule-of-five.md)
```

- [ ] **Step 9: Tạo `cpp/phase-3-modern-resource-mgmt/03-raii-and-rule-of-five.md`**

```markdown
# Bài 3: RAII và Rule of Five

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- RAII principle: resource acquisition is initialization, release in destructor.
- Patterns: `std::lock_guard`, file handle wrapper, scope guard.
- Rule of 0: prefer no manual special member.
- Rule of 3 (legacy): copy ctor, copy assignment, destructor.
- Rule of 5 (modern): + move ctor + move assignment.
- `= default` và `= delete`.
- Exception safety basics: basic guarantee, strong guarantee, no-throw.

---

**Phase kế** → [Phase 4: Templates và STL](../phase-4-templates-and-stl/01-templates.md)
```

- [ ] **Step 10: Tạo `cpp/phase-4-templates-and-stl/01-templates.md`**

```markdown
# Bài 1: Templates

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- Function template: `template<typename T> T max(T a, T b)`.
- Class template: `template<typename T> class Vector`.
- Template argument deduction.
- Explicit specialization và partial specialization (nhắc qua).
- Variadic template basics (`template<typename... Args>`).
- C++20 concepts intro (`requires` clause, named concepts).

---

**Bài kế tiếp** → [Bài 2: Containers và Strings](02-containers-and-strings.md)
```

- [ ] **Step 11: Tạo `cpp/phase-4-templates-and-stl/02-containers-and-strings.md`**

```markdown
# Bài 2: Containers và Strings

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- `std::string` và `std::string_view`.
- `std::vector<T>`: dynamic array, growth strategy.
- `std::array<T, N>`: fixed-size, stack-allocated.
- `std::span<T>` (C++20): non-owning view của contiguous sequence.
- `std::map<K, V>` (ordered) vs `std::unordered_map<K, V>` (hash).
- `std::set<T>` (ordered) vs `std::unordered_set<T>` (hash).
- `std::deque<T>`, `std::list<T>` — khi nào dùng.

---

**Bài kế tiếp** → [Bài 3: Iterators và Algorithms](03-iterators-and-algorithms.md)
```

- [ ] **Step 12: Tạo `cpp/phase-4-templates-and-stl/03-iterators-and-algorithms.md`**

```markdown
# Bài 3: Iterators và Algorithms

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- Iterator concept: begin/end, `++`, `*`.
- Iterator categories: input, output, forward, bidirectional, random-access.
- `<algorithm>`: `std::find`, `std::sort`, `std::for_each`, `std::transform`, `std::accumulate`.
- `std::ranges` (C++20): range-based algorithm.
- Range-for loop và structured binding.

---

**Bài kế tiếp** → [Bài 4: Lambdas và Callables](04-lambdas-and-callables.md)
```

- [ ] **Step 13: Tạo `cpp/phase-4-templates-and-stl/04-lambdas-and-callables.md`**

```markdown
# Bài 4: Lambdas và Callables

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- Lambda syntax: `[capture](params) -> ret { body }`.
- Capture mode: `[=]`, `[&]`, `[var]`, `[&var]`, `[this]`.
- `std::function<R(Args...)>`: type-erased callable wrapper.
- `std::bind` (nhắc qua, prefer lambda).
- Function pointer cơ bản.
- Analogy: JS function reference / closure.

---

**Phase kế** → [Phase 5: Modern Features và Error Handling](../phase-5-modern-features-errors/01-auto-and-bindings.md)
```

- [ ] **Step 14: Tạo `cpp/phase-5-modern-features-errors/01-auto-and-bindings.md`**

```markdown
# Bài 1: auto và Structured Binding

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- `auto`: type deduction trong khai báo biến.
- `decltype`: lấy type của expression.
- `auto&`, `auto&&`, `auto*`.
- Structured binding: `auto [a, b] = pair`.
- Range-for nâng cao với structured binding.
- Initializer list `{}` và uniform initialization.

---

**Bài kế tiếp** → [Bài 2: optional, variant, tuple](02-optional-variant-tuple.md)
```

- [ ] **Step 15: Tạo `cpp/phase-5-modern-features-errors/02-optional-variant-tuple.md`**

```markdown
# Bài 2: optional, variant, tuple

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- `std::optional<T>`: "có thể không có giá trị" — thay nullable pointer.
- `std::variant<A, B, C>`: discriminated union, visit pattern.
- `std::tuple<...>` và `std::pair<A, B>`.
- `std::expected<T, E>` (C++23): result type — khi available; fallback `std::variant` / tuple cho C++17.

---

**Bài kế tiếp** → [Bài 3: Error Handling Philosophy](03-error-handling-philosophy.md)
```

- [ ] **Step 16: Tạo `cpp/phase-5-modern-features-errors/03-error-handling-philosophy.md`**

```markdown
# Bài 3: Error Handling Philosophy

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- Exception: cách dùng, cost (throw + unwind).
- Return code style: `bool`, `int`, `std::optional`, `std::expected`.
- RAII as cleanup (không cần `finally`).
- Vì sao Chromium tắt exception (binary size, predictable cost, ABI).
- Best practice modern: optional cho "có thể không có", expected cho "có thể fail với detail".

---

**Phase kế** → [Phase 6: Concurrency và Tooling](../phase-6-concurrency-and-tooling/01-threads-and-mutex.md)
```

- [ ] **Step 17: Tạo `cpp/phase-6-concurrency-and-tooling/01-threads-and-mutex.md`**

```markdown
# Bài 1: Threads và Mutex

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- `std::thread`: tạo, join, detach.
- Race condition: ví dụ, hậu quả.
- `std::mutex`, `std::lock_guard`, `std::unique_lock`.
- Deadlock và cách tránh (lock ordering).
- Memory visibility intro (chuẩn bị cho bài atomic).

---

**Bài kế tiếp** → [Bài 2: Atomic và Memory Model](02-atomic-and-memory-model.md)
```

- [ ] **Step 18: Tạo `cpp/phase-6-concurrency-and-tooling/02-atomic-and-memory-model.md`**

```markdown
# Bài 2: Atomic và Memory Model

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- `std::atomic<T>`: atomic operations cho integer/pointer.
- Memory order basics: `memory_order_relaxed`, `acquire`, `release`, `acq_rel`, `seq_cst`.
- `std::condition_variable`: wait + notify pattern.
- `std::async`, `std::future`, `std::promise` intro.

---

**Bài kế tiếp** → [Bài 3: Build, Debug, Sanitize](03-build-debug-sanitize.md)
```

- [ ] **Step 19: Tạo `cpp/phase-6-concurrency-and-tooling/03-build-debug-sanitize.md`**

```markdown
# Bài 3: Build, Debug, Sanitize

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- CMake basics: `CMakeLists.txt`, target, link library.
- Debugger: `gdb` / `lldb` cheat sheet (break, run, step, print, backtrace).
- Sanitizers: AddressSanitizer (ASan), UndefinedBehaviorSanitizer (UBSan), ThreadSanitizer (TSan).
- Common C++ bug patterns: use-after-free, out-of-bound, data race, integer overflow.
- Static analysis: `clang-tidy` intro.

---

**Course tiếp theo** → [chromium-native/](../../chromium-native/README.md)
```

- [ ] **Step 20: Verify tất cả 19 stub file tồn tại**

Chạy:
```bash
find /Users/hoanganh/Workspace/learn/cpp -type f -name "*.md" | sort
```

Expected output: 20 file (1 README + 19 stub), thứ tự alphabetical theo path.

---

## Task 4: Tạo cấu trúc thư mục chromium-native/

**Files:**
- Create: 6 directory (`chromium-native/` + 5 phase folder)

- [ ] **Step 1: Tạo folder structure**

Chạy:
```bash
cd /Users/hoanganh/Workspace/learn && \
  mkdir -p chromium-native/phase-1-codebase-and-build \
           chromium-native/phase-2-base-library \
           chromium-native/phase-3-content-layer \
           chromium-native/phase-4-services-and-subsystems \
           chromium-native/phase-5-testing
```

- [ ] **Step 2: Verify folder tree**

Chạy:
```bash
ls -d /Users/hoanganh/Workspace/learn/chromium-native/phase-*
```

Expected output:
```
/Users/hoanganh/Workspace/learn/chromium-native/phase-1-codebase-and-build
/Users/hoanganh/Workspace/learn/chromium-native/phase-2-base-library
/Users/hoanganh/Workspace/learn/chromium-native/phase-3-content-layer
/Users/hoanganh/Workspace/learn/chromium-native/phase-4-services-and-subsystems
/Users/hoanganh/Workspace/learn/chromium-native/phase-5-testing
```

---

## Task 5: Viết chromium-native/README.md

**Files:**
- Create: `chromium-native/README.md`

- [ ] **Step 1: Tạo file `chromium-native/README.md` với nội dung sau**

```markdown
# Native Chromium Development

> Chromium-specific native (C++) dev — phần "ẩn dưới" UI mà Samsung Browser WebUI dev cần biết để fix bug, add feature ở native side.

Khoá học này dạy những gì native C++ trong Chromium thực sự dùng: `base::` library, threading model, content/ layer, services, testing. Sau khoá:

- Navigate Chromium codebase: cs.chromium.org, Gerrit, depot_tools.
- Viết code với `base::OnceCallback`, `base::WeakPtr`, `base::PostTask` thành thạo.
- Hiểu threading model: UI / IO thread, ThreadPool, SequencedTaskRunner.
- Hiểu `content/` layer: WebContents, RenderFrameHost, RenderProcessHost, BrowserContext.
- Tạo Mojo service, KeyedService, factory pattern.
- Đọc và viết Prefs (PrefService, PrefRegistrySimple).
- Viết unit test (gtest) và browser_test cho code mình thêm.

## Tổng quan kiến trúc

```text
┌──────────────────────────────────────────────────────────────────┐
│  Native Chromium Layers                                           │
│                                                                   │
│  Codebase + Build  (gn, ninja, cs.chromium.org)                   │
│         │                                                         │
│  base/ library  (Callback, WeakPtr, TaskRunner, LOG/CHECK)        │
│         │                                                         │
│  content/ layer  (WebContents, RFH, RPH, BrowserContext)          │
│         │                                                         │
│  Services + Subsystems  (KeyedService, Prefs, Mojo services)      │
│         │                                                         │
│  Testing  (gtest, gmock, browser_test, content_browsertest)       │
└──────────────────────────────────────────────────────────────────┘
```

## Yêu cầu nền tảng

- **Đã học [cpp/](../cpp/README.md)** hoặc đã biết modern C++ (C++17/20, smart pointer, lambda, move semantics, template basics).
- **Đã học [chromium/](../chromium/README.md)** (7 phase) — biết browser architecture, IPC concept, WebUI structure.
- Có command line + git + depot_tools (sẽ học depot_tools trong phase 1).
- Optional: Chromium source tree checkout. Phần lớn bài đọc code online được; khi cần build, sẽ note rõ.

## Cấu trúc khoá học (5 phase, 15 bài)

```text
chromium-native/
├── README.md                                  ← Bạn đang ở đây
│
├── phase-1-codebase-and-build/                ← Navigate Chromium source
│   ├── 01-source-tree-tour.md
│   ├── 02-code-search-and-tools.md
│   └── 03-gn-ninja-deep.md
│
├── phase-2-base-library/                      ← ⭐ base:: là DNA của Chromium
│   ├── 01-callbacks-and-bind.md
│   ├── 02-refcounted-and-weakptr.md
│   ├── 03-task-runners-and-threading.md
│   └── 04-logging-and-assertions.md
│
├── phase-3-content-layer/                     ← WebContents, RFH, BrowserContext
│   ├── 01-process-model-deep.md
│   ├── 02-browser-context-and-profile.md
│   └── 03-url-loading-and-network.md
│
├── phase-4-services-and-subsystems/           ← KeyedService, Prefs, services arch
│   ├── 01-keyed-service-pattern.md
│   ├── 02-prefs-system-cpp.md
│   └── 03-services-architecture.md
│
└── phase-5-testing/                           ← gtest, browser_test
    ├── 01-unit-tests-gtest.md
    └── 02-browser-and-content-tests.md
```

## Lộ trình học (~4-6 tuần)

| Phase | Nội dung | Thời gian | Ưu tiên |
|-------|----------|-----------|---------|
| 1 | Codebase + build | 3-4 ngày | Phải học |
| **2** | **base/ library** | **1.5-2 tuần** | **⭐ Core** |
| 3 | content/ layer | 1 tuần | Phải học |
| 4 | Services + subsystems | 1 tuần | Phải học |
| 5 | Testing | 3-4 ngày | Khi viết code |

## Nguyên tắc học

1. **Đọc source.chromium.org liên tục** — code thực là tài liệu tốt nhất.
2. **Phase 2 (base/) là tâm điểm** — học chậm, kỹ. `base::Bind` + `WeakPtr` + `TaskRunner` chiếm phần lớn pattern.
3. **Liên hệ với cpp/** — mỗi khi gặp Chromium pattern, hỏi: "std::xxx tương đương gì trong stdlib?". `base::OnceCallback` ↔ `std::function` (more or less); `base::PostTask` ↔ `std::async` (more or less).
4. **Không cần build Chromium cho phần lớn bài** — đọc code, trace gọi, hiểu pattern là đủ. Bài nào cần build sẽ note rõ.

## Bắt đầu

→ [Phase 1: Codebase và Build](phase-1-codebase-and-build/01-source-tree-tour.md)
```

- [ ] **Step 2: Verify file**

Chạy:
```bash
wc -l /Users/hoanganh/Workspace/learn/chromium-native/README.md
```

Expected: ≥ 90 dòng.

---

## Task 6: Viết 15 stub file của chromium-native/

**Files:**
- Create: 15 file `.md` stub

- [ ] **Step 1: Tạo `chromium-native/phase-1-codebase-and-build/01-source-tree-tour.md`**

```markdown
# Bài 1: Source Tree Tour

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- Cấu trúc `src/`: `chrome/`, `content/`, `components/`, `base/`, `third_party/`, `tools/`, `ui/`.
- Ý nghĩa của từng top-level dir: ai dùng cái nào, layering rule.
- Cách Samsung Browser fork khác Chromium upstream ở đâu (`vendor/`).
- "Where does X live?" cho các topic phổ biến (settings, prefs, autofill, downloads, history).

---

**Bài kế tiếp** → [Bài 2: Code Search và Tools](02-code-search-and-tools.md)
```

- [ ] **Step 2: Tạo `chromium-native/phase-1-codebase-and-build/02-code-search-and-tools.md`**

```markdown
# Bài 2: Code Search và Tools

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- `cs.chromium.org` (Code Search): search query syntax, refs/usages, blame.
- `chromium-review.googlesource.com` (Gerrit): CL review workflow, history search.
- `depot_tools`: `gclient`, `git cl`, `cipd`, what each does.
- Local checkout layout: `src/`, `out/`, `tools/`, `buildtools/`.
- Useful tools: `gn ls`, `gn desc`, `git grep`.

---

**Bài kế tiếp** → [Bài 3: GN + Ninja Deep](03-gn-ninja-deep.md)
```

- [ ] **Step 3: Tạo `chromium-native/phase-1-codebase-and-build/03-gn-ninja-deep.md`**

```markdown
# Bài 3: GN + Ninja Deep

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- GN là gì, vì sao không dùng CMake / Bazel.
- `args.gn`: build flags (`is_debug`, `is_component_build`, `dcheck_always_on`, `enable_nacl`, etc.).
- `gn gen out/Debug`, `autoninja -C out/Debug chrome`.
- BUILD.gn patterns: `source_set`, `static_library`, `component`, `executable`, `test`.
- `gn desc`, `gn ls`, `gn refs` — tooling để hiểu dependencies.
- Build flavor: debug vs release vs component, khi nào dùng cái nào.

---

**Phase kế** → [Phase 2: base/ Library](../phase-2-base-library/01-callbacks-and-bind.md)
```

- [ ] **Step 4: Tạo `chromium-native/phase-2-base-library/01-callbacks-and-bind.md`**

```markdown
# Bài 1: Callbacks và Bind

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- `base::OnceCallback<R(Args...)>` vs `base::RepeatingCallback<R(Args...)>`.
- `base::BindOnce(...)`, `base::BindRepeating(...)`.
- Capture method pointer + receiver: `base::BindOnce(&Class::Method, instance)`.
- Bind argument: pass by value vs `std::ref` vs `base::Unretained`.
- `base::OnceClosure` / `base::RepeatingClosure` (callback không có arg, không return).
- So sánh với `std::function`: vì sao Chromium có riêng (move-only OnceCallback, ASan-friendly).

---

**Bài kế tiếp** → [Bài 2: RefCounted và WeakPtr](02-refcounted-and-weakptr.md)
```

- [ ] **Step 5: Tạo `chromium-native/phase-2-base-library/02-refcounted-and-weakptr.md`**

```markdown
# Bài 2: RefCounted và WeakPtr

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- `base::RefCounted<T>` và `base::RefCountedThreadSafe<T>`.
- `scoped_refptr<T>`: smart pointer cho refcounted object.
- Khi nào dùng refcount vs `std::shared_ptr` (Chromium prefer scoped_refptr cho thread-safe scenarios).
- `base::WeakPtr<T>` và `base::WeakPtrFactory<T>`: pattern cho async callback an toàn.
- `base::Unretained` vs `base::WeakPtr`: trade-off.
- Anti-patterns thường gặp.

---

**Bài kế tiếp** → [Bài 3: TaskRunners và Threading](03-task-runners-and-threading.md)
```

- [ ] **Step 6: Tạo `chromium-native/phase-2-base-library/03-task-runners-and-threading.md`**

```markdown
# Bài 3: TaskRunners và Threading

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- Chromium threading model: UI thread, IO thread, ThreadPool, sequences.
- `base::TaskRunner`, `base::SequencedTaskRunner`, `base::SingleThreadTaskRunner`.
- `base::ThreadPool::PostTask`, `content::GetUIThreadTaskRunner`, `content::GetIOThreadTaskRunner`.
- Sequence vs thread: vì sao prefer sequence.
- `base::PostTaskAndReplyWithResult` pattern.
- Threading restrictions: blocking, may_block, MUST_USE_RESULT.

---

**Bài kế tiếp** → [Bài 4: Logging và Assertions](04-logging-and-assertions.md)
```

- [ ] **Step 7: Tạo `chromium-native/phase-2-base-library/04-logging-and-assertions.md`**

```markdown
# Bài 4: Logging và Assertions

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- `LOG(INFO)`, `LOG(WARNING)`, `LOG(ERROR)`, `LOG(FATAL)`.
- `DLOG`, `VLOG`, verbose level control.
- `CHECK(condition)` (release + debug) vs `DCHECK(condition)` (debug only).
- `NOTREACHED()`, `NOTIMPLEMENTED()`.
- `LOG_IF`, `CHECK_EQ`, `CHECK_NE`, `CHECK_GT`...
- Scoped tracing intro (cho perf analysis).
- Best practice: khi nào CHECK, khi nào DCHECK, khi nào LOG.

---

**Phase kế** → [Phase 3: content/ Layer](../phase-3-content-layer/01-process-model-deep.md)
```

- [ ] **Step 8: Tạo `chromium-native/phase-3-content-layer/01-process-model-deep.md`**

```markdown
# Bài 1: Process Model Deep

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- BrowserProcess vs RenderProcess vs UtilityProcess vs GPUProcess.
- `WebContents`: tab abstraction, lifecycle, observers.
- `RenderFrameHost` (RFH): mỗi frame có 1, lifecycle (Speculative, Active, PendingDeletion).
- `RenderProcessHost` (RPH): browser-side proxy cho 1 renderer process.
- `NavigationController`, `NavigationRequest`, `NavigationHandle`.
- Site Isolation intro.

---

**Bài kế tiếp** → [Bài 2: BrowserContext và Profile](02-browser-context-and-profile.md)
```

- [ ] **Step 9: Tạo `chromium-native/phase-3-content-layer/02-browser-context-and-profile.md`**

```markdown
# Bài 2: BrowserContext và Profile

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- `content::BrowserContext`: storage partition root, "user" trong Chromium.
- `Profile` (chrome/): subclass của BrowserContext, thêm prefs, history, etc.
- Off-the-record (incognito) profile: parent profile pattern.
- StoragePartition: cookies, indexeddb, cache per partition.
- `KeyedService` overview (sẽ deep trong Phase 4).

---

**Bài kế tiếp** → [Bài 3: URL Loading và Network](03-url-loading-and-network.md)
```

- [ ] **Step 10: Tạo `chromium-native/phase-3-content-layer/03-url-loading-and-network.md`**

```markdown
# Bài 3: URL Loading và Network

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- `URLLoader` / `URLLoaderFactory`: Mojo interface cho network request.
- `ResourceRequest`: URL, method, headers, etc.
- Network Service architecture: tách process, sandbox.
- `SimpleURLLoader`: convenience wrapper cho fetch đơn giản.
- Cookie + storage access intro (overview only, không deep dive).

---

**Phase kế** → [Phase 4: Services và Subsystems](../phase-4-services-and-subsystems/01-keyed-service-pattern.md)
```

- [ ] **Step 11: Tạo `chromium-native/phase-4-services-and-subsystems/01-keyed-service-pattern.md`**

```markdown
# Bài 1: KeyedService Pattern

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- `KeyedService`: per-Profile/BrowserContext service.
- `BrowserContextKeyedServiceFactory`: singleton factory, lifecycle management.
- Registration: factory đăng ký với `BrowserContextDependencyManager`.
- Lifetime: tạo lazily, destroy khi BrowserContext destroy.
- Dependencies giữa services: `DependsOn(...)`.
- Incognito behavior: `ServiceIsCreatedWithBrowserContext`, `ServiceIsNULLWhileTesting`.

---

**Bài kế tiếp** → [Bài 2: Prefs System (C++)](02-prefs-system-cpp.md)
```

- [ ] **Step 12: Tạo `chromium-native/phase-4-services-and-subsystems/02-prefs-system-cpp.md`**

```markdown
# Bài 2: Prefs System (C++)

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- `PrefService`: API đọc/ghi pref (`GetBoolean`, `SetInteger`, etc.).
- `PrefRegistrySimple` vs `PrefRegistrySyncable`: registration, default value.
- Profile prefs vs local state (browser-level).
- `PrefChangeRegistrar`: observe pref change.
- `PrefMember<T>`: cached pref accessor.
- Migration pattern khi rename / change type pref.

---

**Bài kế tiếp** → [Bài 3: Services Architecture](03-services-architecture.md)
```

- [ ] **Step 13: Tạo `chromium-native/phase-4-services-and-subsystems/03-services-architecture.md`**

```markdown
# Bài 3: Services Architecture

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- Mojo services overview: service per-feature, separate process.
- Content services (`services/`): network, audio, video_capture, storage.
- Out-of-process services: sandbox motivation, attack surface reduction.
- Service Manager (legacy) vs current pattern.
- Utility process: when to use, restrictions.

---

**Phase kế** → [Phase 5: Testing](../phase-5-testing/01-unit-tests-gtest.md)
```

- [ ] **Step 14: Tạo `chromium-native/phase-5-testing/01-unit-tests-gtest.md`**

```markdown
# Bài 1: Unit Tests với gtest

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- gtest basics: `TEST(SuiteName, TestName)`, `TEST_F(FixtureName, TestName)`.
- gmock: `MOCK_METHOD`, `EXPECT_CALL`, matcher cơ bản.
- Test target trong BUILD.gn: `test("foo_unittests") { ... }`.
- Naming convention: `*_unittest.cc`, suite name CamelCase.
- Fixture pattern, SetUp/TearDown, common base fixture.
- Chromium-specific: `base::test::TaskEnvironment`, `content::BrowserTaskEnvironment`.

---

**Bài kế tiếp** → [Bài 2: Browser và Content Tests](02-browser-and-content-tests.md)
```

- [ ] **Step 15: Tạo `chromium-native/phase-5-testing/02-browser-and-content-tests.md`**

```markdown
# Bài 2: Browser và Content Tests

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- `InProcessBrowserTest`: tests chạy in-process với real browser.
- `ContentBrowserTest`: lighter, không full chrome/.
- `*_browsertest.cc` naming.
- `EmbeddedTestServer`: serve test files.
- Headless mode, when to use.
- Khi nào unit test, khi nào browser test (rule of thumb).

---

**Course kết thúc.** Quay về [README](../README.md) hoặc tham khảo [chromium/phase-7-practical](../../chromium/phase-7-practical/01-reading-source.md) để áp dụng.
```

- [ ] **Step 16: Verify tất cả 15 stub file tồn tại**

Chạy:
```bash
find /Users/hoanganh/Workspace/learn/chromium-native -type f -name "*.md" | sort
```

Expected: 16 file (1 README + 15 stub).

---

## Task 7: Verify cross-link integrity

**Files:** N/A (verification only)

- [ ] **Step 1: Check tất cả markdown link không broken**

Chạy:
```bash
cd /Users/hoanganh/Workspace/learn && \
  for f in $(find cpp chromium-native -name "*.md"); do
    grep -oE '\[.*?\]\(([^)]+)\)' "$f" | grep -oE '\(([^)]+)\)' | tr -d '()' | while read link; do
      # Skip http/https links
      if [[ "$link" =~ ^https?:// ]]; then continue; fi
      # Resolve relative to file's directory
      dir=$(dirname "$f")
      target="$dir/$link"
      # Normalize path
      target=$(cd "$(dirname "$target")" 2>/dev/null && echo "$(pwd)/$(basename "$target")" || echo "$target")
      if [[ ! -f "$target" ]]; then
        echo "BROKEN in $f: $link -> $target"
      fi
    done
  done
```

Expected: không output gì (= tất cả link OK). Nếu có "BROKEN" line, fix link đó.

- [ ] **Step 2: Đếm tổng file**

Chạy:
```bash
find /Users/hoanganh/Workspace/learn/cpp /Users/hoanganh/Workspace/learn/chromium-native -type f -name "*.md" | wc -l
```

Expected output: `36` (2 README + 19 cpp stub + 15 chromium-native stub).

- [ ] **Step 3: Đếm tổng folder mới**

Chạy:
```bash
find /Users/hoanganh/Workspace/learn/cpp /Users/hoanganh/Workspace/learn/chromium-native -type d | wc -l
```

Expected output: `13` (cpp/ + 6 phase folders + chromium-native/ + 5 phase folders).

---

## Task 8: Commit + push

**Files:** N/A (git operation)

- [ ] **Step 1: Stage tất cả file mới**

Chạy:
```bash
cd /Users/hoanganh/Workspace/learn && \
  git add cpp/ chromium-native/ && \
  git status
```

Expected: 36 file mới được staged dưới `new file:`.

- [ ] **Step 2: Tạo commit**

Chạy:
```bash
cd /Users/hoanganh/Workspace/learn && \
  git commit -m "$(cat <<'EOF'
Add skeleton for cpp/ and chromium-native/ courses

Skeleton bao gồm:
- cpp/README.md (full content): C++ foundation course, 6 phase, 19 bài
- chromium-native/README.md (full content): native Chromium dev, 5 phase, 15 bài
- 19 stub file trong cpp/ (phase-1 đến phase-6)
- 15 stub file trong chromium-native/ (phase-1 đến phase-5)
- Cross-link giữa các bài đã setup

Nội dung đầy đủ của mỗi stub sẽ được viết trong các plan phase tiếp theo
(Plan 02-12). Course chromium/ hiện có không bị thay đổi.

Spec: docs/superpowers/specs/2026-05-21-cpp-and-native-courses-design.md

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

Expected: commit thành công, hiển thị `[chromium <hash>] Add skeleton...` và `36 files changed, NNNN insertions(+)`.

- [ ] **Step 3: Push lên origin/chromium**

Chạy:
```bash
cd /Users/hoanganh/Workspace/learn && git push origin chromium
```

Expected: `<old-hash>..<new-hash>  chromium -> chromium`, không có error.

- [ ] **Step 4: Verify trên git log**

Chạy:
```bash
cd /Users/hoanganh/Workspace/learn && git log --oneline -3
```

Expected: commit "Add skeleton..." nằm đầu list.

---

## Definition of Done (Plan 01)

- [ ] Folder structure `cpp/` (7 directory) + `chromium-native/` (6 directory) đã tạo.
- [ ] `cpp/README.md` ≥ 90 dòng với ASCII diagram, learning path, prerequisites.
- [ ] `chromium-native/README.md` ≥ 90 dòng với ASCII diagram, prerequisites, learning path.
- [ ] 19 file stub trong `cpp/` đã tạo, mỗi file có header + scope bullets + "Bài kế tiếp" link.
- [ ] 15 file stub trong `chromium-native/` đã tạo, mỗi file có header + scope bullets + "Bài kế tiếp" link.
- [ ] Cross-link integrity check pass (không broken link).
- [ ] 1 commit duy nhất chứa toàn bộ skeleton, push lên `origin/chromium` thành công.
- [ ] Course `chromium/` hiện có **không bị thay đổi**.

---

## Out of scope (Plan 01)

- Viết nội dung đầy đủ cho bất kỳ stub nào (đó là Plan 02-12).
- Thêm exercise, code mẫu cho stub.
- Verify Chromium source link URL (Plan phase sẽ làm khi quote code).
- Thay đổi `chromium/` (giữ nguyên).
- Setup CI / lint cho markdown (không cần cho project này).
