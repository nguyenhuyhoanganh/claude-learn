# Bài 1: Source Tree Tour

Bài này dạy:
- Top-level layout của `src/` Chromium.
- Ý nghĩa từng directory: `chrome/`, `content/`, `components/`, `base/`, `third_party/`, `ui/`, `tools/`.
- Layering rule: cái nào được include cái nào.
- Cách Samsung Browser (hoặc browser fork khác) tổ chức code ngoài upstream.
- "Where does X live?" — tìm code cho các topic phổ biến.

Kết thúc bài: bạn navigate được Chromium source tree, biết chỗ nào để tìm code feature nào, hiểu layering rule.

## Tại sao cần "tour" source tree?

Chromium có **~40+ triệu dòng code**, **300,000+ file**, **30+ ngàn directory**. Không tour trước → lạc.

Mục đích bài này: cho bạn một bản đồ tinh thần — khi gặp 1 task, biết "ah, code này chắc ở `chrome/browser/`" hay "ah, network thì ở `services/network/`".

## Top-level layout

```text
src/
├── base/              ← Foundation library, dùng bởi mọi layer
├── build/             ← Build configuration, scripts
├── buildtools/        ← Toolchain (clang, gn, ninja)
├── chrome/            ← Chrome browser specific
├── components/        ← Reusable components (autofill, password_manager, ...)
├── content/           ← Browser content layer (multi-process arch)
├── docs/              ← Documentation
├── extensions/        ← Extension system
├── gpu/               ← GPU process, OpenGL/Vulkan
├── ipc/               ← Legacy IPC (mostly Mojo now)
├── media/             ← Audio/video stack
├── mojo/              ← Mojo IPC system
├── net/               ← Networking stack (was in chrome/, now standalone)
├── pdf/               ← PDF viewer
├── printing/          ← Printing system
├── services/          ← Out-of-process services (network, audio, ...)
├── skia/              ← Skia graphics library wrapper
├── storage/           ← Storage system (Blob, Filesystem)
├── third_party/       ← External libraries
├── tools/             ← Developer tools, scripts
├── ui/                ← UI toolkit (views, gfx, base UI)
├── url/               ← URL parsing (GURL)
└── v8/                ← V8 JavaScript engine (third-party fork)
```

Tổng số directory top-level: ~30. Quan trọng nhất là **chrome/**, **content/**, **components/**, **base/**.

## Layering rule

Chromium có layer hierarchy. Mỗi layer được include layer dưới, KHÔNG được include layer trên.

```text
chrome/             ← Highest layer — Chrome browser code
   ↓ can include
extensions/, components/, services/, ...
   ↓
content/            ← Mid layer — generic content browser
   ↓
mojo/, ipc/, net/, ui/, media/, ...
   ↓
base/, third_party/  ← Foundation layer
```

Vi phạm layering = compile error hoặc DEPS check fail.

### `base/` — foundation

`base/` chứa basic utilities mà mọi layer khác dùng:

- `base/callback.h`, `base/bind.h` — callback system.
- `base/memory/scoped_refptr.h`, `base/memory/weak_ptr.h` — smart pointer.
- `base/strings/*` — string utilities.
- `base/files/file_path.h` — file path handling.
- `base/logging.h` — `LOG`, `CHECK`, `DCHECK`.
- `base/task/*` — task scheduling, thread pool.
- `base/time/*` — time + clock.
- `base/values.h` — `base::Value` (dynamic JSON-like).

`base/` không depend `content/`, `chrome/`, etc. — chỉ depend std + system.

### `content/` — browser process model

`content/` định nghĩa "browser engine":

- `content/browser/` — code chạy trong browser process.
- `content/renderer/` — code chạy trong renderer process.
- `content/common/` — code dùng chung 2 process.
- `content/public/` — public API mà chrome/ dùng.

Khái niệm: `WebContents`, `RenderFrameHost`, `RenderProcessHost`, `BrowserContext`. Đây là "what makes a browser".

`content/` không biết gì về UI hay chrome-specific feature — nó là "headless content engine". Bạn có thể build content_shell standalone không có chrome UI.

### `chrome/` — Chrome browser

`chrome/` build trên `content/`:

- `chrome/browser/` — Chrome browser process code.
- `chrome/renderer/` — Chrome renderer process code.
- `chrome/common/` — shared.
- `chrome/test/` — Chrome tests.

Đây là chỗ feature Chrome-specific sống: bookmarks, history, password manager, downloads, settings UI, omnibox.

Samsung Browser fork điển hình ở đây — thay/ thêm/ tùy chỉnh `chrome/`.

### `components/` — reusable

`components/` chứa component dùng được giữa nhiều browser (Chrome, Edge, Samsung Browser, etc.). Mỗi component có embedder pattern (interface để host browser inject hành vi specific).

Vd:

- `components/autofill/` — form autofill.
- `components/password_manager/` — password.
- `components/bookmarks/` — bookmark.
- `components/translate/` — page translate.
- `components/printing/`.

→ Khi fork browser, thường giữ `components/` upstream, customize `chrome/` (hoặc `vendor/`).

## Khi `chrome/` vs `content/` vs `components/`?

| Layer | Purpose | Visible to |
|---|---|---|
| `base/` | Foundation utility | All |
| `mojo/`, `ipc/`, `net/`, ... | Infrastructure | content, services, chrome |
| `content/` | Browser engine (process, navigation, IPC) | services, chrome |
| `services/` | Out-of-process services | content, chrome |
| `components/` | Reusable feature components | chrome (mostly) |
| `chrome/` | Chrome browser specific | App level |
| `extensions/` | Extension system | chrome |

**Rule of thumb**:

- Code dùng được trên iOS, Android, Chrome OS đa platform → `content/` hoặc `components/`.
- Code chỉ Chrome desktop → `chrome/`.
- Foundation utility (no UI/browser concept) → `base/`.

## Process model — recap

`content/` define process model:

- **Browser process** (1 instance): main UI, manage tabs, coordinate.
- **Renderer process** (N instance): render web page, run JS via V8.
- **GPU process** (1 instance): compositing, accelerated graphics.
- **Utility process** (N instance): sandboxed services.
- **Network service process** (separate process now).

Code path:

```text
chrome/browser/  ← Chrome-specific browser logic
        ↓ uses
content/public/browser/  ← Public API of content
        ↓
content/browser/  ← Implementation
        ↓ mojo
content/renderer/  ← Renderer side
        ↓
blink/  ← Web platform implementation
```

Sẽ học detail ở `phase-3-content-layer`.

## Sub-tree spotlight

### `chrome/browser/`

```text
chrome/browser/
├── ui/                  ← Chrome UI: tabs, toolbar, bookmarks bar
│   ├── views/           ← Views toolkit (desktop)
│   ├── webui/           ← chrome:// pages
│   ├── tab_contents/
│   └── ...
├── prefs/               ← Profile preferences
├── profiles/            ← Profile management
├── extensions/          ← Extension integration
├── bookmarks/
├── history/
├── downloads/
├── password_manager/
├── autofill/
├── safe_browsing/
├── search_engines/
└── ... (rất nhiều!)
```

Khi tìm code cho feature trong Chrome: `chrome/browser/<feature>/` thường là điểm khởi đầu.

### `content/browser/`

```text
content/browser/
├── renderer_host/       ← RenderProcessHost, RenderFrameHost
├── web_contents/        ← WebContentsImpl
├── frame_host/
├── browser_main_loop.cc ← Browser main entry
├── child_process_host_impl.cc
├── storage_partition_impl.*
├── devtools/
└── ...
```

Đây là engine của browser process.

### `base/`

```text
base/
├── callback.h, bind.h, bind_internal.h
├── memory/              ← scoped_refptr, WeakPtr, raw_ptr
├── containers/          ← flat_map, small_map, span
├── strings/             ← string utilities, utf conversion
├── files/               ← FilePath, File, FileUtilsBlocking
├── task/                ← TaskRunner, ThreadPool, sequence
├── time/                ← TimeTicks, Time, TimeDelta
├── threading/           ← Thread, ThreadChecker, sequence_checker
├── values.h             ← base::Value
├── logging.h            ← LOG, CHECK, DCHECK
├── synchronization/     ← Lock, ConditionVariable
└── ...
```

Sẽ học detail ở Phase 2.

## Where does X live?

Cheatsheet — feature → directory:

| Feature | Directory |
|---|---|
| New tab page | `chrome/browser/new_tab_page/`, `chrome/browser/ui/webui/new_tab_page/` |
| Bookmarks | `components/bookmarks/`, `chrome/browser/ui/bookmarks/` |
| History | `components/history/`, `chrome/browser/ui/webui/history/` |
| Downloads | `chrome/browser/download/`, UI: `chrome/browser/ui/webui/downloads/` |
| Settings | `chrome/browser/ui/webui/settings/`, prefs: `chrome/browser/prefs/` |
| Password manager | `components/password_manager/`, `chrome/browser/password_manager/` |
| Autofill | `components/autofill/`, `chrome/browser/autofill/` |
| Extensions | `extensions/`, `chrome/browser/extensions/` |
| Sync | `components/sync/`, `chrome/browser/sync/` |
| Search engines | `components/search_engines/` |
| Omnibox | `components/omnibox/`, `chrome/browser/ui/omnibox/` |
| Network requests | `net/`, `services/network/` |
| Cookies | `net/cookies/`, `services/network/cookie_manager/` |
| Storage (LocalStorage, IndexedDB) | `storage/`, `content/browser/storage_partition_impl.*` |
| Tab management | `chrome/browser/ui/tabs/`, `content/public/browser/web_contents.h` |
| WebUI framework | `content/public/browser/web_ui*.h`, `chrome/browser/ui/webui/` |
| Mojo IPC | `mojo/`, generated bindings in `out/.../gen/` |
| V8 / JS | `v8/`, `third_party/blink/renderer/bindings/` |
| Rendering (web) | `third_party/blink/` |
| GPU compositing | `gpu/`, `cc/`, `viz/` |

## Samsung Browser / browser fork pattern

Khi fork Chromium thành browser của bạn (Edge, Brave, Opera, Samsung):

1. **Upstream `src/`** — Chromium source, sync periodic.
2. **`vendor/` hoặc `samsung/`** — code custom, sit alongside `chrome/`.
3. **Patch file** — modification của upstream code.
4. **Branding** — replace Chrome logo, name, default settings.

Pattern Samsung Browser điển hình:

```text
src/
├── chrome/                ← Upstream Chrome
├── components/            ← Upstream
├── content/               ← Upstream
├── samsung/               ← Samsung Browser-specific (custom)
│   ├── browser/
│   ├── renderer/
│   └── common/
└── ...
```

Hoặc:

```text
src/
├── ...                    ← Upstream
└── samsung_browser/       ← Samsung Browser repo overlaid
    ├── chrome/            ← Overrides / extensions
    └── ...
```

Build system (GN) configure để include Samsung code thay vì upstream when conflict.

### Khi navigate code Samsung Browser:

1. Tìm trong `samsung/` (hoặc tương đương vendor dir) trước — Samsung custom.
2. Nếu không có → upstream `chrome/`, `components/`, etc.
3. Khi sửa: prefer modify `samsung/` để giữ upstream clean (dễ rebase).

## Bài đọc khuyến nghị

Trong Chromium docs:

- `docs/getting_started.md` — set up dev env.
- `docs/contributing.md` — contribute workflow.
- `docs/threading_and_tasks.md` — threading model.
- `docs/security/process_model_and_site_isolation.md`.
- `docs/webui_intro.md`.

Online:

- chromium.org/Home/chromium-architecture
- docs.google.com/document/... (search "Chromium design docs").

## Pattern thực tế khi join 1 task

Say bạn được giao "fix bug X trong settings page":

1. **Locate**: settings → `chrome/browser/ui/webui/settings/`.
2. **Find file**: tìm file liên quan dựa trên bug description.
3. **Read header** trước, sau đó source.
4. **Search usages**: `git grep` hoặc cs.chromium.org.
5. **Trace dependency**: `BUILD.gn` để biết target dependency.

## Bẫy thường gặp khi navigate

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Tìm "settings" trong `chrome/settings/` | Không có | Nó ở `chrome/browser/ui/webui/settings/` |
| Edit upstream code thay vì samsung/ | Khó rebase | Theo convention fork; modify `samsung/` |
| Include `chrome/` từ `content/` | Layering violation | Forward declaration hoặc abstract interface |
| Tưởng `base/` có UI | Không | UI ở `ui/`, base chỉ utility |
| Forget `third_party/blink/` cho rendering | Tìm DOM ở wrong place | Web rendering hoàn toàn ở blink/ |

## Tóm tắt

| Directory | Purpose |
|---|---|
| `base/` | Foundation utility |
| `content/` | Browser engine (process, navigation) |
| `components/` | Reusable feature components |
| `chrome/` | Chrome-specific browser code |
| `services/` | Out-of-process services |
| `extensions/` | Extension system |
| `ui/` | UI toolkit (views, gfx) |
| `net/`, `services/network/` | Networking |
| `third_party/blink/` | Web platform / rendering |
| `mojo/`, `ipc/` | IPC infrastructure |
| `v8/`, `third_party/v8/` | JavaScript engine |

## Exercise (optional)

1. Mở source.chromium.org. Browse `chrome/browser/` — tìm 5 sub-directory bạn thấy interesting.
2. Tìm file `web_contents.h` ở đâu (header)? Tìm implementation `web_contents_impl.cc`?
3. Trace: từ `WebContents::Create()` → `WebContentsImpl::Create()` → `WebContentsImpl ctor`.
4. So sánh `chrome/browser/bookmarks/` vs `components/bookmarks/`. Cái nào là business logic, cái nào là Chrome integration?

---

**Bài kế tiếp** → [Bài 2: Code Search và Tools](02-code-search-and-tools.md)
