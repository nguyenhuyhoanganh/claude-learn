# Bài 1: Process Model Deep

Bài này dạy:
- BrowserProcess, RenderProcess, UtilityProcess, GPUProcess: ai làm gì.
- `WebContents`: tab abstraction, lifecycle, observers.
- `RenderFrameHost` (RFH): frame-side proxy.
- `RenderProcessHost` (RPH): renderer process proxy.
- `NavigationController`, `NavigationRequest`, `NavigationHandle`.
- Site Isolation intro.

Kết thúc bài: bạn hiểu được Chromium's multi-process architecture in depth, biết classes mapping browser/renderer, đọc được code path navigation.

Prerequisite: [chromium/phase-2](../../chromium/phase-2-chromium-architecture/01-multi-process.md) (mọi bài).

## Process types — recap

Chromium chạy trên nhiều process types:

```text
┌──────────────────────────────────────────────────────┐
│  Browser Process (1 instance — main process)          │
│  - UI                                                 │
│  - Coordinate everything                              │
│  - Mojo IPC hub                                       │
└──────────────────────────────────────────────────────┘
           │                                  │
   IPC ──────────────────────────  IPC
           │                                  │
┌──────────────────┐         ┌──────────────────┐
│ Renderer (N)     │         │ Utility (N)      │
│ - Render web     │         │ - Sandbox        │
│ - Run JS         │         │ - Network        │
└──────────────────┘         │ - Audio          │
                              │ - Video decode   │
┌──────────────────┐         └──────────────────┘
│ GPU (1)          │
│ - Compositing    │
└──────────────────┘
```

### Browser Process

- Main process — Chrome starts here.
- Has UI, manage tabs, handle keyboard/mouse.
- Coordinate renderer + utility + GPU process.
- `int main()` → `BrowserMain()` → `BrowserMainLoop`.

### Renderer Process

- 1 per "site instance" (with Site Isolation).
- Render web page: HTML parsing, CSS, JS via V8, layout, paint.
- **Sandboxed** — restricted access to OS.
- Communicate browser via Mojo IPC.
- Code: `content/renderer/`, `third_party/blink/`.

### Utility Process

- General-purpose sandboxed process.
- Used for: network service, audio, video decode, NaCl, PDF.
- Each task type its own process (or shared).
- Code: `services/`.

### GPU Process

- 1 process, handle GPU operations.
- Compositing layers from multiple renderers.
- Sandboxed (limited).

## Browser-side proxy classes

Browser process needs to track renderer state. Pattern: per-renderer-thing có 1 **proxy** class trong browser.

```text
Renderer Process              Browser Process
RenderFrame             →     RenderFrameHost (RFH)
RenderProcess           →     RenderProcessHost (RPH)
RenderWidget            →     RenderWidgetHost
Document                →     Frame state in RFH
```

Browser-side class name pattern: `<Renderer-side>Host`.

## `WebContents` — tab abstraction

```cpp
class WebContents {
 public:
  // Create
  static WebContents* Create(const CreateParams& params);

  // Navigation
  void NavigateToURL(const GURL& url);

  // Get the main frame
  RenderFrameHost* GetMainFrame();

  // Process info
  RenderProcessHost* GetRenderProcessHost();
};
```

`WebContents` = "1 tab" abstraction. (Actually it can be a popup, prerender, etc., but typically tab.)

Key concepts:

- 1 `WebContents` = 1 tab/document container.
- Has 1 **main frame** (`RenderFrameHost`).
- Main frame may have child frames (iframes).
- Multiple `WebContents` per browser window.

### Lifecycle

```cpp
auto wc = WebContents::Create(params);   // Create
wc->NavigateToURL(GURL("https://example.com"));   // Navigate
// ... user closes tab ...
wc.reset();   // Destroy
```

### `WebContentsObserver`

Listen to events:

```cpp
class MyObserver : public content::WebContentsObserver {
 public:
  explicit MyObserver(content::WebContents* contents) {
    Observe(contents);
  }

  // Override events
  void DidStartNavigation(content::NavigationHandle* nav) override;
  void DidFinishNavigation(content::NavigationHandle* nav) override;
  void RenderFrameCreated(content::RenderFrameHost* rfh) override;
  void RenderFrameDeleted(content::RenderFrameHost* rfh) override;
  void RenderProcessGone(base::TerminationStatus status) override;
  // ... many more events
};
```

Pattern: subscribe to lifecycle events. Used khắp Chromium.

## `RenderFrameHost` (RFH)

```cpp
class RenderFrameHost {
 public:
  GURL GetLastCommittedURL();
  RenderProcessHost* GetProcess();
  WebContents* GetWebContents();
  bool IsInMainFrame();
  RenderFrameHost* GetParent();

  // Get state
  bool IsActive();
  bool IsPendingDeletion();
  // ...
};
```

`RenderFrameHost` represents **1 frame** (main frame or iframe) in browser side.

### RFH lifecycle states

```text
Speculative  → Active  → PendingDeletion
                  ↓
             (replaced by new RFH on navigation)
```

- **Speculative**: created speculatively for navigation, may not commit.
- **Active**: currently displayed.
- **PendingDeletion**: about to be deleted, still referenced.
- **Cached** (back-forward cache): preserved for back-navigation.

Lifecycle complex — RFH có thể bị swap khi cross-site navigation (different process → new RFH in new RPH).

### Per-document data

```cpp
class MyData : public content::DocumentUserData<MyData> {
 public:
  MyData(RenderFrameHost* rfh) { ... }
};

// Get or create per-frame data
MyData* data = MyData::GetOrCreateForCurrentDocument(rfh);
```

Pattern: attach data to RFH lifetime. Common in extensions, features.

## `RenderProcessHost` (RPH)

```cpp
class RenderProcessHost {
 public:
  int GetID() const;
  base::Process& GetProcess();
  bool IsReady();

  // Many other methods
};
```

`RPH` = browser-side proxy for **1 renderer process**.

### Process per site instance (default)

```cpp
content::WebContents* wc = ...;
content::RenderProcessHost* rph = wc->GetMainFrame()->GetProcess();
int pid = rph->GetProcess().Pid();
// pid = OS process ID of renderer
```

Site Isolation: each site has own process. Cross-site navigation creates new RPH.

### Process Lifetime

- Created on demand (first navigation to site).
- Destroyed when last frame in process closed.
- Reused for same-site navigation.
- Can be killed/crashed; browser detect via observer.

## Site Isolation

Security mechanism: documents from different sites in **different OS processes**.

```text
tabs:
  https://example.com (RPH 1)
  https://other.com   (RPH 2, different OS process)
  https://example.com (RPH 1, shared with first tab — same site)
```

Hardening boundaries:

- Cross-site can't read memory of other site.
- V8 vulnerability in 1 process → only that site affected.
- Spectre-class CPU side-channel mitigated.

### Process per site model

```cpp
RenderProcessHost::ShouldUseProcessPerSite(...);
// Decides if new RPH or reuse existing
```

Implementation in `content::SiteInstance`, `BrowserContext`.

### Origin Isolation

Subset: each **origin** (not just eTLD+1 site) in own process. Even more isolation.

Sub-page detail — sẽ học deep ở Chromium docs.

## Navigation

When user enter URL or click link:

```text
User → NavigationController → NavigationRequest → NavigationHandle
                                    ↓
                              Network fetch
                                    ↓
                              Response arrives
                                    ↓
                         Commit to RenderFrame (new or existing RFH)
                                    ↓
                              Load + Render
```

### `NavigationController`

```cpp
class NavigationController {
 public:
  void LoadURL(const GURL& url, ...);
  void Reload();
  void GoBack();
  void GoForward();

  int GetEntryCount();   // History size
  NavigationEntry* GetEntry(int idx);
};

auto* nav = wc->GetController();
nav->LoadURL(GURL("https://example.com"), ...);
```

Per-`WebContents`. Manage history.

### `NavigationRequest`

Internal — represents in-progress navigation.

### `NavigationHandle`

Observer-facing — exposed to `WebContentsObserver`:

```cpp
void MyObserver::DidStartNavigation(NavigationHandle* handle) {
  GURL url = handle->GetURL();
  bool is_main_frame = handle->IsInMainFrame();
  // ...
}

void MyObserver::DidFinishNavigation(NavigationHandle* handle) {
  if (handle->HasCommitted()) {
    // Navigation committed (page loaded)
  }
  // ...
}
```

Many features hook into navigation: extensions, content blocking, prerendering, etc.

## `BrowserMain` flow

```cpp
// content/browser/browser_main_loop.cc

int BrowserMain() {
  // 1. Init basic services (logging, threading, etc.)
  InitializeMainThread();

  // 2. Create BrowserProcess (single instance)
  browser_process_ = std::make_unique<BrowserProcessImpl>();

  // 3. Create message loop
  base::RunLoop run_loop;

  // 4. Pre-shutdown
  PostMainMessageLoopRun();
  return result;
}
```

(Simplified — actual code far more complex.)

`BrowserMainParts` allows embedders (Chrome, content_shell, headless) to inject behavior at various stages.

## Pattern: WebContentsUserData

Pattern Chromium phổ biến: attach data to WebContents lifetime:

```cpp
class MyTabHelper : public content::WebContentsUserData<MyTabHelper> {
 public:
  ~MyTabHelper() override = default;

 private:
  friend class content::WebContentsUserData<MyTabHelper>;
  explicit MyTabHelper(content::WebContents* contents) {
    // ...
  }

  WEB_CONTENTS_USER_DATA_KEY_DECL();
};

// Get or create
MyTabHelper::CreateForWebContents(wc);
auto* helper = MyTabHelper::FromWebContents(wc);
```

Pattern used for: bookmarks, autofill, content blocking, etc. Tied to tab lifetime.

## Real example: detect navigation finished

```cpp
class NavigationLoggingObserver : public content::WebContentsObserver {
 public:
  explicit NavigationLoggingObserver(content::WebContents* wc)
      : WebContentsObserver(wc) {}

  void DidFinishNavigation(content::NavigationHandle* nav) override {
    if (!nav->HasCommitted()) return;
    if (!nav->IsInMainFrame()) return;

    GURL url = nav->GetURL();
    int status = nav->GetNetErrorCode();
    LOG(INFO) << "Navigated to " << url << " (status=" << status << ")";
  }
};

void Init(content::WebContents* wc) {
  auto observer = std::make_unique<NavigationLoggingObserver>(wc);
  // ... store observer somewhere ...
}
```

Typical pattern: subscribe to `WebContentsObserver`, react to events.

## Cross-process communication

Browser ↔ Renderer: **Mojo IPC** (sẽ học ở `chromium/phase-6`).

```cpp
// Browser side: setup interface
mojo::Remote<my_namespace::mojom::MyInterface> remote;
rfh->GetRemoteInterfaces()->GetInterface(remote.BindNewPipeAndPassReceiver());

remote->DoSomething(args);   // Call into renderer
```

```cpp
// Renderer side: implement interface
class MyImpl : public my_namespace::mojom::MyInterface {
  void DoSomething(...) override { ... }
};
```

Detail in chromium course's Mojo phase.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Hold raw `RenderFrameHost*` across navigation | UAF | Check still active; use WeakPtr; use FrameId |
| Hold raw `RenderProcessHost*` after process gone | UAF | Listen RenderProcessGone |
| Assume same RFH after cross-site nav | Wrong frame | Listen DidStartNavigation/DidFinishNavigation |
| Mix UI/IO thread access | Race | Use proper thread, post task |
| Forget WebContentsObserver detach | Leak / UAF | RAII observer or override `WebContentsDestroyed` |
| Sync wait for renderer | Deadlock | Always async |

## Tóm tắt

| Class | Purpose |
|---|---|
| `BrowserProcess` | Singleton browser-wide manager |
| `WebContents` | "Tab" abstraction |
| `RenderFrameHost` (RFH) | Browser-side proxy for 1 frame |
| `RenderProcessHost` (RPH) | Browser-side proxy for renderer process |
| `NavigationController` | Per-WebContents history |
| `NavigationHandle` | Observer-facing navigation |
| `WebContentsObserver` | Event subscriber |
| `WebContentsUserData<T>` | Per-tab data |
| `DocumentUserData<T>` | Per-frame data |
| `BrowserMainParts` | Embedder hook into startup |

## Process types

| Process | Count | Purpose |
|---|---|---|
| Browser | 1 | Main, coordinate |
| Renderer | N | Web content per site |
| Utility | N | Sandboxed services |
| GPU | 1 | GPU operations |

## Exercise (optional)

1. Read `WebContents` declaration in `content/public/browser/web_contents.h`. Note major methods.
2. Look up `WebContentsObserver` events. Find one feature using it (e.g., `chrome/browser/autofill/`).
3. Look up `RenderFrameHost` states. Find code handling speculative RFH.
4. Read `content/browser/browser_main_loop.cc` outline. Trace `BrowserMain` flow.

---

**Bài kế tiếp** → [Bài 2: BrowserContext và Profile](02-browser-context-and-profile.md)
