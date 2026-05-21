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
