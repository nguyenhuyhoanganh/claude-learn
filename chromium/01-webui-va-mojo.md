# File 1 — WebUI trong Chromium và Mojo IPC

> Đây là file đầu tiên trong series 4 file. Mục tiêu: sau khi đọc, bạn hiểu **Samsung Browser WebUI là gì, trang `chrome://settings` được build ra sao, và làm thế nào JavaScript trên trang gọi được code C++ native**. Đây là bức tranh tổng thể — 3 file sau (Polymer custom elements, Shadow DOM, Events) đào sâu vào từng tầng.

## 1. WebUI là gì?

**WebUI** (Web User Interface) là **framework của Chromium** để build các trang UI của browser bằng web technology (HTML/CSS/JS). Nó không phải website. Đây là các URL kiểu:

```
chrome://settings          ← Trang cài đặt
chrome://history           ← Lịch sử duyệt
chrome://downloads         ← Quản lý tải xuống
chrome://newtab            ← Trang new tab
chrome://bookmarks         ← Bookmarks
samsung://settings         ← Samsung Browser
```

Người dùng nhìn vào nghĩ là "trang web" nhưng thực tế đây là **browser UI được build bằng web tech**. Chúng chạy trong Renderer Process **với quyền đặc biệt**, có thể giao tiếp trực tiếp với C++ native qua một thứ tên là Mojo.

### Vì sao Chromium chọn web tech cho UI thay vì native?

| | WebUI | Native UI (Views/C++) |
|--|-------|------------------|
| Ngôn ngữ | HTML/CSS/JS | C++ |
| Cross-platform | Tự động | Cần code per-platform |
| Tốc độ phát triển | Nhanh | Chậm |
| Flexibility (responsive, theme...) | Cao | Thấp |
| Native feel | Cần effort | Tự nhiên |

Lý do thực dụng: Settings, History, Extensions, NTP, Bookmarks đều cần **flexibility cao** và **iterate nhanh**. Google chọn WebUI cho hầu hết các "non-critical UI". Còn UI critical như omnibox, tab strip, browser chrome vẫn là native Views.

---

## 2. Tại sao web tech lại cần "framework"? — Browser process và Renderer process

Để hiểu WHY, bạn cần biết Chromium là **multi-process**:

```text
┌─────────────────────────────────────────────────────────┐
│                   Browser Process (C++)                  │
│  - Quản lý cửa sổ, tab, network                         │
│  - Có quyền truy cập OS, filesystem, settings           │
│  - Là "trung tâm" của browser                           │
└──────────────────────┬──────────────────────────────────┘
                       │  IPC (Mojo)
       ┌───────────────┼───────────────┐
       │               │               │
       ▼               ▼               ▼
┌──────────┐    ┌──────────┐    ┌──────────┐
│ Renderer │    │ Renderer │    │ Renderer │
│ Process  │    │ Process  │    │ Process  │
│ (tab 1)  │    │ (tab 2)  │    │ WebUI    │
│          │    │          │    │ page     │
│ Sandboxed│    │ Sandboxed│    │ (đặc biệt)│
└──────────┘    └──────────┘    └──────────┘
```

Web page bình thường (vd `google.com`) chạy trong Renderer Process **bị sandbox**: không truy cập được filesystem, không đọc được settings của user, không gọi được API hệ điều hành. Đây là bảo mật — nếu Google bị hack, malware không lan ra ngoài tab.

Nhưng `chrome://settings` thì **cần** thay đổi cài đặt browser, đọc/ghi pref file, gọi các service của OS. Nó cũng chạy trong Renderer Process (vì là HTML/JS), nhưng có quyền đặc biệt: được phép **gọi Mojo interface** lên Browser Process để thực thi các thao tác có quyền cao.

→ WebUI = web page với quyền đặc biệt + cơ chế giao tiếp với C++ qua Mojo.

---

## 3. Anatomy của một WebUI page

Lấy `chrome://settings` làm ví dụ. Mỗi WebUI page gồm 3 phía:

```text
chrome/browser/resources/settings/          ← Phía JS (Renderer)
├── settings.html                          ← Entry HTML
├── settings_main.ts                       ← Entry JS
├── settings_page/
│   ├── settings_page.ts                   ← Polymer/Lit components
│   └── settings_page.html
└── BUILD.gn                               ← Build rules

chrome/browser/ui/webui/settings/           ← Phía C++ (Browser)
├── settings_ui.cc                         ← WebUIController
├── settings_ui.h
├── settings_page_handler.cc               ← Mojo handler
└── settings_page_handler.h

chrome/browser/ui/webui/settings/           ← Mojo interface
└── settings.mojom                         ← IDL
```

3 phía này luôn đi cùng nhau khi tạo WebUI page mới: **JS code** (UI), **C++ code** (handler logic + service binding), và **`.mojom` file** (define contract giữa JS ↔ C++).

### Phía JS — đơn giản hoá

```html
<!-- settings.html -->
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Settings</title>
</head>
<body>
  <!-- Root component, là một Polymer/Lit custom element -->
  <settings-ui></settings-ui>

  <!-- Entry module — define các component -->
  <script type="module" src="settings_main.js"></script>
</body>
</html>
```

### Phía C++ — WebUIController

```cpp
// settings_ui.h
class SettingsUI : public ui::MojoWebUIController,
                   public mojom::PageHandlerFactory {
 public:
  explicit SettingsUI(content::WebUI* web_ui);

  // Browser gọi khi JS xin Mojo interface
  void BindInterface(
      mojo::PendingReceiver<mojom::PageHandlerFactory> receiver);

 private:
  // Factory: tạo PageHandler khi JS sẵn sàng
  void CreatePageHandler(
      mojo::PendingRemote<mojom::Page> page,
      mojo::PendingReceiver<mojom::PageHandler> receiver) override;
};
```

```cpp
// settings_ui.cc
SettingsUI::SettingsUI(content::WebUI* web_ui)
    : MojoWebUIController(web_ui) {
  // Đăng ký resources (HTML/JS/CSS files)
  content::WebUIDataSource* source =
      content::WebUIDataSource::CreateAndAdd(
          web_ui->GetWebContents()->GetBrowserContext(),
          chrome::kChromeUISettingsHost);

  source->AddResourcePath("settings.html", IDR_SETTINGS_HTML);
  source->AddResourcePath("settings_main.js", IDR_SETTINGS_MAIN_JS);
}
```

`WebUIController` là **người quản lý** của một WebUI page ở phía C++. Nhiệm vụ:
1. Đăng ký các resources (HTML/JS/CSS) cho URL scheme `chrome://settings`.
2. Bind các Mojo interface khi JS yêu cầu.

---

## 4. Luồng từ URL đến UI hiển thị

```text
1. User gõ chrome://settings hoặc click Settings button
         ↓
2. Browser Process nhận navigation request
         ↓
3. URL Scheme Handler nhận ra "chrome://"
   → Tìm WebUIController đã đăng ký cho "settings"
         ↓
4. SettingsUI (WebUIController) được tạo trong Browser Process
   → Đăng ký resources với WebUIDataSource
   → Sẵn sàng bind Mojo interfaces
         ↓
5. Renderer Process được tạo (hoặc reuse) cho tab này
   → Load chrome://settings/settings.html
   → Execute JS, render Polymer/Lit components
         ↓
6. Components load xong, JS gọi Mojo:
   → handler.getInitialSettings()
   → Mojo gửi request qua message pipe → Browser Process
   → C++ thực thi, trả data về
   → JS render UI với data
```

Người mới thường confuse 2 process: phải nhớ **JS chạy trong Renderer, C++ trong Browser**, 2 bên nói chuyện qua Mojo (message pipe).

---

## 5. Mojo IPC — cầu nối JS ↔ C++

**Mojo** là hệ thống IPC (Inter-Process Communication) của Chromium. Mojo cung cấp:

1. **Message pipes** — kênh giao tiếp 2 chiều giữa các process.
2. **Interfaces** — type-safe API định nghĩa bằng IDL (`.mojom` files).
3. **Bindings** — code tự generate cho cả C++ và JavaScript.

→ Bạn không bao giờ viết "gửi byte" thủ công. Bạn viết một file `.mojom`, build system generate ra code C++ và JS, bạn dùng các class này như call function bình thường.

### Vì sao Mojo, không phải REST/WebSocket?

| | REST/WebSocket | Mojo |
|--|---------------|------|
| Same machine | Phí phạm (HTTP overhead) | Native, low overhead |
| Type safety | Không (manual JSON parse) | Có (IDL + codegen) |
| Cross-process handles | Không | Có (truyền file handle, shared memory...) |
| Versioning | Manual | Built-in |

WebUI và C++ luôn cùng máy, cùng tiến trình parent → dùng Mojo nhanh và an toàn hơn HTTP.

---

## 6. File `.mojom` — định nghĩa contract

`.mojom` là **Interface Definition Language** của Mojo. Đây là chỗ bạn khai báo: JS có thể gọi C++ những method nào, C++ có thể push xuống JS những event nào.

Ví dụ thực tế — một WebUI page "Samsung Quick Settings":

```mojom
// samsung_quick_settings.mojom
module samsung.quick_settings.mojom;

enum ColorTheme {
  kLight,
  kDark,
  kAuto,
};

struct QuickSettings {
  ColorTheme theme;
  bool dark_mode_enabled;
  string browser_version;
};

// JS → C++ (requests)
interface QuickSettingsHandler {
  GetSettings() => (QuickSettings settings);
  SetTheme(ColorTheme theme) => (bool success);
  SetDarkMode(bool enabled) => (bool success);
  ResetToDefaults() => ();
};

// C++ → JS (push notifications)
interface QuickSettingsPage {
  OnThemeChanged(ColorTheme theme);
  OnDarkModeChanged(bool enabled);
};

// Bootstrap: tạo cặp connection lúc page load
interface QuickSettingsHandlerFactory {
  CreateHandler(
    pending_remote<QuickSettingsPage> page,
    pending_receiver<QuickSettingsHandler> handler
  );
};
```

Đọc file này:
- `enum`, `struct` = data types share giữa JS/C++.
- `interface QuickSettingsHandler` = "JS gọi xuống C++". Mỗi method có thể return value qua callback (`=> (...)`).
- `interface QuickSettingsPage` = "C++ push lên JS" (observer pattern).
- `QuickSettingsHandlerFactory` = pattern bootstrap — JS xin factory, factory tạo cặp Handler/Page kết nối với nhau.

Build system (GN + mojom compiler) sẽ generate:
- `samsung_quick_settings.mojom.h` / `.cc` — C++ bindings.
- `samsung_quick_settings.mojom-webui.js` — JS bindings.

---

## 7. 3 class JS được generate

Khi compile `foo.mojom` cho JavaScript, bạn nhận được 3 class chính:

### a. `XxxRemote` — JS gọi C++

```javascript
import {QuickSettingsHandlerRemote} from
    './samsung_quick_settings.mojom-webui.js';

const handler = new QuickSettingsHandlerRemote();
// Sau khi bind pipe (xem section 8):
const {settings} = await handler.getSettings();
console.log(settings.theme);  // ColorTheme.kDark
```

`Remote` = client side. Mọi method đều return `Promise`.

### b. `XxxReceiver` — JS implement interface (C++ gọi JS)

Ít dùng. Thường thay bằng `CallbackRouter` dưới đây.

### c. `XxxCallbackRouter` — C++ push event xuống JS

```javascript
import {QuickSettingsPageCallbackRouter} from
    './samsung_quick_settings.mojom-webui.js';

const router = new QuickSettingsPageCallbackRouter();

// Đăng ký listener cho event từ C++
router.onThemeChanged.addListener(theme => {
  console.log('Theme changed by native:', theme);
});

router.onDarkModeChanged.addListener(enabled => {
  console.log('Dark mode toggled by native:', enabled);
});
```

→ Tóm tắt:
- **Remote**: JS chủ động gọi xuống C++ → await response.
- **CallbackRouter**: JS đăng ký listener, C++ push event lên bất kỳ lúc nào.

---

## 8. BrowserProxy pattern — "wrapper" của Mojo cho component

Trong code Chromium thật, bạn ít khi dùng `Remote` / `CallbackRouter` trực tiếp trong UI component. Thay vào đó, có một class trung gian gọi là **BrowserProxy** — singleton, wrap toàn bộ Mojo setup.

```javascript
// samsung_quick_settings_browser_proxy.js
import {
  QuickSettingsHandlerFactory,
  QuickSettingsHandlerRemote,
  QuickSettingsPageCallbackRouter,
  ColorTheme,
} from './samsung_quick_settings.mojom-webui.js';

export class SamsungQuickSettingsBrowserProxy {
  constructor() {
    this.handler = new QuickSettingsHandlerRemote();
    this.callbackRouter = new QuickSettingsPageCallbackRouter();

    // Tạo factory → factory tạo cặp Handler/Page
    const factory = QuickSettingsHandlerFactory.getRemote();
    factory.createHandler(
      this.callbackRouter.$.bindNewPipeAndPassRemote(),
      this.handler.$.bindNewPipeAndPassReceiver(),
    );
  }

  static instance_ = null;
  static getInstance() {
    return SamsungQuickSettingsBrowserProxy.instance_ ||
        (SamsungQuickSettingsBrowserProxy.instance_ =
            new SamsungQuickSettingsBrowserProxy());
  }

  // Cho phép test override với mock
  static setInstance(instance) {
    SamsungQuickSettingsBrowserProxy.instance_ = instance;
  }
}

export {ColorTheme};
```

UI component giờ chỉ cần:

```javascript
import {SamsungQuickSettingsBrowserProxy} from './samsung_quick_settings_browser_proxy.js';

const proxy = SamsungQuickSettingsBrowserProxy.getInstance();
const {settings} = await proxy.handler.getSettings();
```

Lý do tách BrowserProxy:
1. **Singleton** — toàn bộ UI dùng chung 1 connection.
2. **Testable** — test có thể `setInstance(mockProxy)` để mock toàn bộ Mojo.
3. **Single source of truth** — UI không biết Mojo, chỉ biết `proxy`.

Đây là pattern xuất hiện **khắp Chromium**. Khi bạn vào file mới và thấy `*_browser_proxy.ts`, đó là wrapper Mojo.

---

## 9. End-to-end ví dụ: toggle dark mode

Xem một flow đầy đủ — JS user nhấn toggle, C++ lưu, OS thông báo trở lại.

### Bước 1 — UI component (LitElement)

```javascript
// samsung_quick_settings_app.js
import {LitElement, html, css} from
    'chrome://resources/lit/v3_0/lit.rollup.js';
import {SamsungQuickSettingsBrowserProxy} from
    './samsung_quick_settings_browser_proxy.js';

class SamsungQuickSettingsApp extends LitElement {
  static properties = {
    settings_: {state: true},
  };

  constructor() {
    super();
    this.proxy_ = SamsungQuickSettingsBrowserProxy.getInstance();
    this.settings_ = null;
    this.listenerIds_ = [];
  }

  connectedCallback() {
    super.connectedCallback();

    // Đăng ký listener push từ C++
    const router = this.proxy_.callbackRouter;
    this.listenerIds_.push(
      router.onDarkModeChanged.addListener(enabled => {
        this.settings_ = {...this.settings_, darkModeEnabled: enabled};
      }),
    );

    // Load initial data
    this.proxy_.handler.getSettings().then(({settings}) => {
      this.settings_ = settings;
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    // Cleanup — quan trọng để tránh memory leak
    this.listenerIds_.forEach(
        id => this.proxy_.callbackRouter.removeListener(id));
  }

  render() {
    if (!this.settings_) return html`<p>Loading...</p>`;
    return html`
      <label>
        Dark Mode
        <input type="checkbox"
               .checked=${this.settings_.darkModeEnabled}
               @change=${this.onDarkModeChange_}>
      </label>
    `;
  }

  async onDarkModeChange_(e) {
    const enabled = e.target.checked;
    // Optimistic update
    this.settings_ = {...this.settings_, darkModeEnabled: enabled};
    // Gọi C++
    await this.proxy_.handler.setDarkMode(enabled);
  }
}
customElements.define('samsung-quick-settings-app', SamsungQuickSettingsApp);
```

### Bước 2 — C++ Handler nhận request

```cpp
// samsung_quick_settings_handler.cc
void SamsungQuickSettingsHandler::SetDarkMode(
    bool enabled, SetDarkModeCallback callback) {
  auto* prefs = GetProfile()->GetPrefs();
  prefs->SetBoolean(prefs::kDarkModeEnabled, enabled);

  // Apply theme (call ThemeService...)
  ApplyDarkMode(enabled);

  std::move(callback).Run(/*success=*/true);
}
```

### Bước 3 — Khi OS thông báo theme đổi

```cpp
// Khi user đổi theme từ Settings OS (không qua UI)
void SamsungQuickSettingsHandler::OnThemeChanged() {
  bool dark_mode = IsSystemDarkMode();
  // Push xuống JS qua CallbackRouter
  page_->OnDarkModeChanged(dark_mode);
}
```

### Bước 4 — JS nhận push, re-render

```javascript
// Listener đã đăng ký ở connectedCallback fire:
router.onDarkModeChanged.addListener(enabled => {
  this.settings_ = {...this.settings_, darkModeEnabled: enabled};
  // Lit auto re-render
});
```

---

## 10. `loadTimeData` — alternative cho data đơn giản

Khi data không thay đổi nhiều và bạn muốn nó có sẵn ngay lúc page load (không qua async Mojo call), dùng `loadTimeData`:

```cpp
// C++: inject vào lúc tạo WebUIDataSource
source->AddBoolean("isDarkModeEnabled", IsDarkModeEnabled());
source->AddString("userEmail", GetUserEmail());
source->AddLocalizedString("settingsTitle", IDS_SETTINGS_TITLE);
```

```javascript
// JS: đọc ngay sync
import {loadTimeData} from 'chrome://resources/js/load_time_data.js';

const isDark = loadTimeData.getBoolean('isDarkModeEnabled');
const email = loadTimeData.getString('userEmail');
const title = loadTimeData.getString('settingsTitle');  // đã translate
```

→ `loadTimeData` cho: feature flags, user email, locale strings, simple booleans. Cho data động (list, complex object, real-time updates) → dùng Mojo.

---

## 11. `chrome://resources` — shared library

Mọi WebUI page dùng chung một bộ thư viện tại `chrome://resources/`:

```javascript
// LitElement
import {LitElement, html, css} from
    'chrome://resources/lit/v3_0/lit.rollup.js';

// Polymer
import {PolymerElement, html} from
    'chrome://resources/polymer/v3_0/polymer/polymer-element.js';

// cr-* shared components (design system)
import 'chrome://resources/cr_elements/cr_button/cr_button.js';
import 'chrome://resources/cr_elements/cr_toggle/cr_toggle.js';
import 'chrome://resources/cr_elements/cr_dialog/cr_dialog.js';

// Utilities
import {assert} from 'chrome://resources/js/assert.js';
import {loadTimeData} from 'chrome://resources/js/load_time_data.js';
import {I18nMixinLit} from 'chrome://resources/cr_elements/i18n_mixin_lit.js';
```

`cr-*` là design system riêng của Chromium — sẽ dùng cho 90% UI element trong Settings/History/Downloads.

---

## 12. Content Security Policy — đừng để bị surprise

WebUI có CSP **rất nghiêm**:

```text
default-src 'none';
script-src chrome://resources 'self';
img-src chrome://resources data: 'self';
style-src chrome://resources 'self' 'unsafe-inline';
```

Hậu quả:
- **Không load được script từ internet** — không CDN, không Google Analytics.
- **Không `eval()`** — không `new Function()`, không inline JS không có nonce.
- **Không `fetch()` external URL** trực tiếp — phải qua Browser Process (Mojo → Network Service).

→ Nếu bạn cần dùng thư viện bên ngoài, phải vendor vào `chrome://resources` qua build system. Không có shortcut.

---

## 13. Build system — GN (rất ngắn)

Chromium dùng **GN** (Generate Ninja) làm build system. Mỗi WebUI page có `BUILD.gn`:

```gn
# BUILD.gn
js_library("settings_page") {
  sources = [
    "settings_page.ts",
    "settings_page_browser_proxy.ts",
  ]
  deps = [
    "//third_party/lit/v3_0:build_ts",
    "//ui/webui/resources/cr_elements/cr_button:cr_button",
  ]
}

html_to_wrapper("html_wrapper") {
  in_files = [ "settings_page.html" ]
}

mojom("mojo_bindings") {
  sources = [ "settings.mojom" ]
}
```

Không cần hiểu sâu ngay. Chỉ cần biết:
- Mỗi file `.ts` / `.html` / `.mojom` mới phải khai báo trong `BUILD.gn`.
- `html_to_wrapper` convert `*.html` → `*.html.js` để TypeScript import.
- `mojom(...)` compile `.mojom` → bindings cho C++ và JS.

---

## 14. Polymer vs LitElement — nhanh

Trên một WebUI page, JS framework là một trong hai:

- **Polymer 3** — framework cũ hơn, 80%+ code Samsung Browser hiện tại.
- **LitElement** — framework mới, code mới sau 2022 ưu tiên dùng.

Cả hai đều là wrapper trên Web Components. File 2 sẽ đào sâu Polymer. Bạn chỉ cần biết:
- File `.ts` extend `PolymerElement` → đây là Polymer.
- File `.ts` extend `LitElement` → đây là Lit.
- Code mới: chọn Lit. Code cũ (sửa bug, thêm feature): theo style của file đó.

Chromium **đang migrate** từ Polymer sang Lit nhưng quá trình kéo dài đến nhiều năm. Đến hết 2026, vẫn nhiều file Polymer trong Samsung Browser.

---

## 15. Quy ước Chromium-specific

Khi đọc code WebUI thật, sẽ gặp các quy ước sau:

1. **TypeScript** — code mới chủ yếu là `.ts`, không phải `.js`.
2. **Private field dùng suffix `_`** — `this._settings`, `onClick_()`, `_renderToggle_()`. Đây là Google JS style.
3. **`I18nMixin`** — mixin cho i18n (đọc localized string).
4. **`BrowserProxy` pattern** — wrap Mojo (đã giải thích).
5. **`cr-*` elements** — design system, không dùng `paper-*` (legacy).
6. **`html_to_wrapper`** — template HTML tách ra file `.html` riêng, build compile sang `.html.ts`.
7. **`PolicyControlledIndicatorMixin`** — cho settings bị enterprise policy lock.

---

## 16. Tổng kết — flow một WebUI page

```text
chrome://samsung-quick-settings
            ↓
Browser Process: URL Scheme Handler
            ↓
SamsungQuickSettingsUI (WebUIController) khởi tạo
   → Register HTML/JS/CSS resources
   → Sẵn sàng bind Mojo interfaces
            ↓
Renderer Process tạo ra, load HTML
   → Browser inject loadTimeData (đơn giản)
            ↓
JS module load
   → BrowserProxy singleton init
   → Tạo HandlerFactory → CreateHandler() → cặp Remote/CallbackRouter sẵn sàng
            ↓
UI Component (Polymer/Lit) mount
   → connectedCallback()
   → addListener cho callbackRouter
   → await handler.getInitialData()
            ↓
User tương tác:
   → JS gọi handler.someMethod() (Mojo call qua message pipe)
   → C++ thực thi, modify state
   → C++ push event qua page_->onSomethingChanged() (Mojo push)
   → JS listener fire, update state, re-render
```

→ Đây là **bộ khung mọi WebUI page**. Khi đọc Settings, History, Downloads — bạn sẽ nhận ra cùng pattern.

---

## 17. Checklist — bạn đã hiểu file này nếu trả lời được:

1. WebUI khác website thường ở điểm nào? (Quyền + Mojo connection)
2. JS chạy trong process nào, C++ trong process nào? (Renderer / Browser)
3. `.mojom` file dùng để làm gì? (Define interface JS ↔ C++)
4. Khác biệt `Remote` và `CallbackRouter`? (JS chủ động gọi / C++ push)
5. `BrowserProxy` là gì và vì sao có? (Singleton wrap Mojo, để test mock)
6. `loadTimeData` khác Mojo call ra sao? (Sync, fixed at load / Async, real-time)
7. CSP của WebUI có gì đặc biệt? (Không external script, không eval)
8. `cr-*` element là gì? (Design system của Chromium)

Nếu OK cả 8 → bạn sẵn sàng đọc code WebUI thật. File tiếp theo dạy cách viết component.

---

→ Đọc tiếp: [File 2: Polymer Custom Elements](02-polymer-custom-elements.md)
