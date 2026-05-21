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
