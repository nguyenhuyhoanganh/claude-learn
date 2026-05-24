# Spec: Hai course mới — `cpp/` và `chromium-native/`

**Ngày:** 2026-05-21
**Tác giả:** nguyenhuyhoanganh + Claude (brainstorming)
**Branch:** chromium

## 1. Bối cảnh và mục đích

Course `chromium/` (7 phase, ~16,000 dòng) hiện assume học viên "đọc được C++". Học viên thực tế (Samsung Browser WebUI dev) xuất phát từ **0 kiến thức C++** → cần prerequisite C++ + native Chromium dev để áp dụng được course đó.

Spec này thiết kế **hai course mới tách biệt** ở git root để bổ sung:

- **`cpp/`** — C++ foundation tự cấp (không phụ thuộc Chromium), tái dùng được cho bối cảnh khác.
- **`chromium-native/`** — Native Chromium development, prerequisite = `cpp/` + `chromium/`.

Course `chromium/` hiện tại **giữ nguyên 7 phase**, không thay đổi.

## 2. Mục tiêu học tập

### `cpp/` — C++ Foundation

Học viên sau khoá:

- Đọc và viết được C++ ở mức production (Chromium codebase, modern C++17/20).
- Hiểu memory model, lifetime, RAII đủ để debug bug về pointer / lifetime.
- Sử dụng STL containers/algorithms thành thạo cho task hàng ngày.
- Đọc được code dùng template, lambda, smart pointer, move semantics.
- Hiểu concurrency cơ bản: thread, mutex, atomic, std::async.

**Tự cấp:** không phụ thuộc Chromium. Học độc lập được.

### `chromium-native/` — Native Chromium Development

Học viên sau khoá:

- Navigate Chromium codebase (Code Search, cấu trúc thư mục).
- Viết code dùng `base::` library: callback, WeakPtr, RefCounted, TaskRunner.
- Hiểu threading model: UI thread / IO thread / ThreadPool, sequence.
- Hiểu content layer: WebContents, RenderFrameHost, RenderProcessHost, BrowserContext.
- Tạo Mojo service, KeyedService, factory pattern.
- Đọc và viết Prefs (PrefService, PrefRegistrySimple).
- Hiểu sandbox, services architecture ở mức concept.
- Viết unit test (gtest) và browser_test cho code mình thêm vào.

**Prerequisite:**

- Hoàn thành `cpp/` (hoặc đã biết modern C++).
- Hoàn thành `chromium/` (7 phase) — biết browser architecture, IPC concept, WebUI.

## 3. Nguyên tắc chung

1. **Vietnamese narrative, English code & terms** — Theo style `chromium/`. Concept tiếng Việt, identifier / API / commit code English.
2. **WHY trước HOW** — Mỗi bài giải thích lý do tồn tại của feature trước syntax.
3. **Real Chromium examples** — Code mẫu chiếu thẳng từ source.chromium.org khi có thể. Ưu tiên pattern Chromium đang dùng thay vì textbook style.
4. **Exercise optional** — Section exercise là tuỳ chọn. Nếu có, chỉ 1-2 dòng prompt; không bắt buộc, không có lời giải. **Trọng tâm là nội dung dạy.**
5. **Cross-link** — Bài liên quan link đi link lại (cpp/ ↔ chromium-native/ ↔ chromium/).
6. **File 500-700 dòng deep** — Đủ sâu; nếu vượt 800 dòng cần xem có tách được không; hard cap 1100.
7. **Analogy có chọn lọc với JS/Polymer/Lit** — Khi concept có tương đương (vd `std::function` ↔ JS function reference, `template<T>` ↔ TS generics), dùng analogy để làm sáng. Không ép mỗi bài đều có.

## 4. Cấu trúc course `cpp/`

**6 phase, 19 file.**

```text
cpp/
├── README.md                                 ← Intro, learning path, prerequisites
│
├── phase-1-getting-started/
│   ├── 01-hello-world-toolchain.md           ← Compiler (g++/clang), build, header/cpp, include
│   ├── 02-types-and-control-flow.md          ← Built-in types, const, auto, if/for/while, functions, overloading
│   └── 03-headers-and-scopes.md              ← Header guards, .h vs .cpp, namespace, forward decl, scope/lifetime
│
├── phase-2-pointers-references-oop/
│   ├── 01-pointers-and-references.md         ← Pointer, ref, nullptr, &, *, const correctness basics
│   ├── 02-classes-and-lifetime.md            ← class/struct, ctor/dtor, methods, this, stack vs heap
│   └── 03-inheritance-and-polymorphism.md    ← Inheritance, virtual, abstract, override, slicing
│
├── phase-3-modern-resource-mgmt/
│   ├── 01-smart-pointers.md                  ← unique_ptr, shared_ptr, weak_ptr, ownership semantics
│   ├── 02-move-semantics.md                  ← Rvalue, std::move, ownership transfer, perfect forwarding intro
│   └── 03-raii-and-rule-of-five.md           ← RAII patterns, copy/move/default rules, exception safety basics
│
├── phase-4-templates-and-stl/
│   ├── 01-templates.md                       ← Function template, class template, variadic, concepts intro
│   ├── 02-containers-and-strings.md          ← string, string_view, span, vector, array, map, set, deque
│   ├── 03-iterators-and-algorithms.md        ← Iterator concept, <algorithm>, ranges intro
│   └── 04-lambdas-and-callables.md           ← Lambda, captures, std::function, std::bind
│
├── phase-5-modern-features-errors/
│   ├── 01-auto-and-bindings.md               ← auto, decltype, structured binding, range-for, init-list
│   ├── 02-optional-variant-tuple.md          ← std::optional, std::variant, std::tuple/pair, std::expected
│   └── 03-error-handling-philosophy.md       ← Exception vs return codes, RAII for cleanup, no-exception style
│
└── phase-6-concurrency-and-tooling/
    ├── 01-threads-and-mutex.md               ← std::thread, mutex, lock_guard, race condition
    ├── 02-atomic-and-memory-model.md         ← std::atomic, memory order basics, condition_variable
    └── 03-build-debug-sanitize.md            ← CMake basics, gdb/lldb, ASan/UBSan/TSan, common bug patterns
```

### Đặc điểm thiết kế cpp/

1. **Phase 1-3 là core**: nếu dừng sau phase 3, vẫn đọc được phần lớn Chromium code (smart pointer + RAII chiếm ~80% C++ Chromium).
2. **Phase 4 (templates+STL) là utility** — cần khi viết container, callback wrapper.
3. **Phase 5 không bắt buộc** cho beginner, nhưng `std::optional`, `auto`, structured binding xuất hiện rất nhiều trong code modern → cần biết.
4. **Phase 6 hỗ trợ chromium-native/threading**: `std::thread`/`std::mutex` không giống `base::PostTask`/`base::Lock` 1-1, nhưng concept giống. Học `std::` trước có vocabulary, sau đó chromium-native/ dạy biến thể Chromium.
5. **Phase 6 cũng có tooling** (gdb/lldb, sanitizer) — quan trọng để debug native bug.
6. Không có project lớn, chỉ exercise nhỏ optional cuối file.

### Pitfall đã cân nhắc cpp/

- **Không dạy raw `new`/`delete` quá sâu** — hiện đại C++ hiếm dùng → nhắc qua trong phase 3/01.
- **Không dạy template metaprogramming sâu** — SFINAE, expression SFINAE quá nâng cao, không cần cho Chromium WebUI dev.
- **Không dạy exception sâu** — Chromium tắt exception → nhắc concept để hiểu code third-party có dùng.
- **`std::expected` (C++23)** có thể chưa available everywhere — dạy concept, fallback bằng `std::optional` hoặc tuple-based.

## 5. Cấu trúc course `chromium-native/`

**5 phase, 15 file.**

```text
chromium-native/
├── README.md                                 ← Intro, prerequisites (cpp/ + chromium/), learning path
│
├── phase-1-codebase-and-build/
│   ├── 01-source-tree-tour.md                ← src/ layout: chrome/, content/, components/, base/, third_party/
│   ├── 02-code-search-and-tools.md           ← cs.chromium.org, Gerrit, git cl, depot_tools workflow
│   └── 03-gn-ninja-deep.md                   ← args.gn, autoninja, debug/release, gn desc, BUILD.gn patterns
│
├── phase-2-base-library/                     ← ⭐ Most important — base:: là DNA của Chromium
│   ├── 01-callbacks-and-bind.md              ← base::OnceCallback, RepeatingCallback, BindOnce, BindRepeating
│   ├── 02-refcounted-and-weakptr.md          ← base::RefCounted, scoped_refptr, WeakPtr, WeakPtrFactory
│   ├── 03-task-runners-and-threading.md      ← UI/IO thread, ThreadPool, TaskRunner, SequencedTaskRunner, PostTask
│   └── 04-logging-and-assertions.md          ← LOG, VLOG, DLOG, CHECK, DCHECK, NOTREACHED, scoped trace
│
├── phase-3-content-layer/
│   ├── 01-process-model-deep.md              ← BrowserProcess, RenderProcess, WebContents, RenderFrameHost, NavigationController
│   ├── 02-browser-context-and-profile.md     ← BrowserContext, Profile, OTR, KeyedService overview
│   └── 03-url-loading-and-network.md         ← URLLoader, ResourceRequest, network service intro, mojo-bound services
│
├── phase-4-services-and-subsystems/
│   ├── 01-keyed-service-pattern.md           ← KeyedService, BrowserContextKeyedServiceFactory, lifetime, registration
│   ├── 02-prefs-system-cpp.md                ← PrefService deep, PrefRegistrySimple, profile vs local state, observer
│   └── 03-services-architecture.md           ← Mojo services, content services, sandbox concept, utility process
│
└── phase-5-testing/
    ├── 01-unit-tests-gtest.md                ← gtest/gmock, test target trong BUILD.gn, naming, patterns
    └── 02-browser-and-content-tests.md       ← browser_test, content_browsertest, in-process, headless, khi nào dùng
```

### Đặc điểm thiết kế chromium-native/

1. **Phase 2 (base/) là tâm điểm** — 4 file dày nhất. `base::Bind` + `WeakPtr` + `TaskRunner` xuất hiện ở mọi feature Chromium.
2. **Phase 3 (content/) là context** — giúp đọc phần lớn code không phải UI: navigation, web contents, network. Cần để hiểu Mojo handler được gọi từ đâu.
3. **Phase 4 (services) là pattern thực dụng** — KeyedService + Prefs là 2 pattern dùng hàng ngày khi add feature.
4. **Phase 5 (testing) ngắn (2 file) nhưng đặc** — gtest có ngoài Chromium nên đỡ phải dạy framework, focus Chromium-specific (test target, fixture, gmock idiom).
5. Không có "Practical / case study" phase — `chromium/phase-7-practical/` đã có rồi. Course này focus native foundation.

### Cross-references giữa 3 course

| File chromium-native/ | Link tới cpp/ | Link tới chromium/ |
|---|---|---|
| 02-base/01-callbacks-and-bind | cpp/4/04-lambdas-and-callables | chromium/6/05-pagehandler-pattern |
| 02-base/02-refcounted-weakptr | cpp/3/01-smart-pointers | — |
| 02-base/03-task-runners | cpp/6/01-threads-and-mutex | chromium/2/03-ipc-concepts |
| 02-base/04-logging | cpp/5/03-error-handling | chromium/7/05-debugging |
| 03-content/01-process-model-deep | — | chromium/2 (deepens) |
| 03-content/02-browser-context | — | chromium/5/06-prefs-and-settings (intro) |
| 04-services/02-prefs-cpp | — | chromium/5/06-prefs-and-settings (UI side) |
| 04-services/03-services-arch | — | chromium/6 (Mojo) |
| 05-testing/* | — | chromium/7/04-testing-webui (UI side) |

### Pitfall đã cân nhắc chromium-native/

- **Network stack deep** không bao gồm — quá nặng, không cần cho WebUI dev. Chỉ giới thiệu concept trong 03-content/03.
- **Extensions architecture** không bao gồm — khác hẳn WebUI dev, cần course riêng nếu muốn.
- **GPU/utility process internals** không bao gồm — chỉ nhắc trong services-architecture overview.
- **Permissions / content settings framework** không tách riêng — nhắc trong prefs-system-cpp khi liên quan.
- **IPC (legacy)** không dạy — Mojo đã thay thế, chromium/ đã có phase Mojo.

## 6. Standard cho mỗi bài

### Template

```markdown
# Bài N: <Tên bài>

<1-2 đoạn intro: bài này dạy gì, kết thúc bài sẽ làm được gì>

## Tại sao cần <topic>?
<WHY trước HOW — explain motivation bằng ví dụ thực>

## <Concept chính 1>
<Định nghĩa + code example + comment>

## <Concept chính 2>
...

## Pattern thực tế / Cách Chromium dùng
<Code mẫu lấy từ source.chromium.org khi có thể>

## Bẫy thường gặp
| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| ... | ... | ... |

## Tóm tắt
<Bảng feature → mục đích / cheat-sheet ngắn>

## Exercise (optional)
<1-2 dòng prompt nếu có; không bắt buộc, không có lời giải>

**Bài kế tiếp** → [link]
```

### Độ dài

| Loại bài | Số dòng target |
|---|---|
| Intro / overview / pointer to deeper | 200-350 |
| Standard concept bài | 500-700 |
| Deep dive (vd `base::Bind`, `task-runners`) | 700-900 |
| Không bao giờ vượt | 1100 (vượt phải tách) |

### Code example

1. **Compile được** — code mẫu chính phải compile/chạy được nếu paste vào C++ project.
2. **Source link** — quote Chromium code thì paste URL `source.chromium.org/chromium/chromium/src/+/main:path/to/file.cc;l=NN`. URL có thể rot — chấp nhận trade-off.
3. **Modern C++ default** — code mẫu dùng C++17 trở lên. Old-style chỉ dùng khi bài học chính là về old-style.
4. **Naming Chromium style** — Theo Chromium C++ Style Guide:
   - `CamelCase` cho class, struct, function, method, enum type.
   - `kCamelCase` cho constant và enum value (vd `kMaxRetries`, `kDefaultTimeout`).
   - `snake_case_` cho member variable (trailing underscore).
   - `snake_case` cho local variable và function parameter.
   - File name: `snake_case.cc` / `snake_case.h`.

   Khi quote code từ source.chromium.org thì giữ nguyên naming gốc.

### Cross-link

- File đầu phase có "Phase trước → [link]"; file giữa phase có "Bài trước → [link]".
- File cuối phase có "Phase kế → [link]"; file giữa phase có "Bài kế tiếp → [link]".
- Reference khái niệm ngoài course: link tương đối từ file hiện tại (vd `../../cpp/phase-3-modern-resource-mgmt/01-smart-pointers.md`).

### README mỗi course

1. Mục tiêu khoá (1 đoạn).
2. Sơ đồ ASCII overview (như `chromium/README.md`).
3. Vì sao học course này.
4. Bảng phase + thời lượng + ưu tiên.
5. Prerequisites.
6. Nguyên tắc học.
7. Link bắt đầu.

## 7. Plan of execution

### Thứ tự xây dựng

1. **Skeleton cả 2 course cùng lúc** — README + folder structure + file stub (mỗi file chỉ heading + "TODO"). Commit + push.
2. **Viết `cpp/` phase 1 → phase 6 tuần tự** — Lý do: `cpp/` là prerequisite. Viết `chromium-native/` trước sẽ phải reference section chưa tồn tại.
3. **Viết `chromium-native/` phase 1 → 5** — Sau khi `cpp/` đầy đủ.

### Đơn vị commit + push

| Đơn vị | Khi nào dùng |
|---|---|
| 1 file = 1 commit | File deep/độc lập (vd 02-base/01-callbacks-and-bind) |
| 1 phase = 1 commit | Phase nhỏ hoặc file chia sẻ nội dung (vd cpp/phase-1) |
| Skeleton + structure = 1 commit | Step 1 ở trên |

**Push:** mỗi commit lên `origin/chromium`.

### Định nghĩa "xong" của 1 file

- [ ] Đủ section theo template (Tại sao → Concept → Pattern thực tế → Bẫy → Tóm tắt; Exercise optional).
- [ ] Code example compile được (test thủ công nếu C++).
- [ ] Source link tới Chromium đã verify URL nếu là reference quan trọng.
- [ ] Cross-link tới bài khác đúng path.
- [ ] Độ dài ≥ 500 dòng (file standard) hoặc đã justify ngắn hơn.

### Risks & mitigations

| Risk | Tác động | Mitigation |
|---|---|---|
| Scope creep — file viết quá dài | Khó đọc, mất focus | Hard cap 1100 dòng; review file ≥ 800 dòng để xem có tách được không |
| Chromium API thay đổi (vd base::Callback đã deprecated → OnceCallback) | Code mẫu rot | Ghi rõ "tại thời điểm 2026", source link có commit SHA khi quote dòng cụ thể |
| C++ standard difference (vd `std::expected` C++23) | Code không compile trên môi trường cũ | Note version requirement; provide C++17 alternative |
| Cross-link rot khi đổi tên file | Link gãy | Đặt tên file kỹ ngay từ skeleton; nếu phải đổi tên, search & replace ngay |
| Khối lượng lớn (~34 file ~21,500 dòng) → kéo dài nhiều phiên | Mất context giữa phiên | Mỗi phase = milestone độc lập; spec này là single source of truth |

### Khối lượng ước lượng

- `cpp/`: 19 file × 600 dòng trung bình ≈ **11,400 dòng**
- `chromium-native/`: 15 file × 650 dòng trung bình ≈ **9,750 dòng**
- Skeleton + README: ~500 dòng
- **Tổng: ~21,500 dòng** (chromium course hiện ~16,000 dòng — quy mô tương đương)

## 8. Quyết định đã chốt (từ brainstorming)

- **Course mới tách biệt** thay vì mở rộng `chromium/` — đã chọn 2 courses riêng.
- **Scope cpp/**: Complete (foundation + templates + STL + threading + modern C++).
- **Scope chromium-native/**: Browser-wide (base, content, services, testing — không full network/extensions/GPU).
- **Phương pháp**: Topic-based với optional exercise, theo style `chromium/` hiện có.
- **Branch**: `chromium`, commit + push trực tiếp.
- **Ngôn ngữ**: Tiếng Việt cho narrative; English cho code/identifier/API.
- **Exercise**: optional, để hờ; trọng tâm là nội dung dạy.
- **README**: có ASCII overview diagram.
- **Analogy**: dùng JS/Polymer/Lit khi làm sáng nghĩa.

## 9. Out of scope (KHÔNG làm trong spec này)

- Modify course `chromium/` hiện có (giữ nguyên 7 phase).
- Thêm Shadow DOM styling deep / Events deep vào `chromium/` (đã từ chối).
- Lời giải cho exercise.
- Project-driven phase (đã chọn topic-based).
- Network stack deep, extensions architecture, GPU/utility internals (out of chromium-native scope).
- C++23 advanced features (concepts deep, modules, coroutines — chỉ mention).
- Templates metaprogramming nâng cao (SFINAE expression, CRTP đa tầng).
- Build infrastructure cho exercise (gtest target trong cpp/, không cần).
