# Bài 2: WebUIController — Cầu nối C++ và WebUI

> **🎯 Định hướng bài này cho web dev:** Bạn sẽ viết Polymer/Lit, **không viết C++**. Bài này dạy bạn **hiểu hệ thống** để:
> - Đồng thiết kế Mojo interface với native team (`.mojom` file).
> - Viết BrowserProxy + Component chính xác.
> - Debug khi connection vỡ — biết "lỗi ở phía nào".
>
> Code C++ trong bài này đều bọc trong `<details>` collapse. Mở ra khi tò mò, đóng lại nếu chỉ cần concept.

## PageHandler Pattern

Đây là pattern **chuẩn** trong toàn bộ Chromium WebUI. Gần như mọi WebUI page đều follow pattern này:

```
JS (Renderer)                    C++ (Browser Process)
─────────────────                ─────────────────────
                                 PageHandlerFactory
                                   ↑ implements
                                 WebUIController

SettingsPageProxy ←──────────── SettingsPageHandler
  (Remote)         Mojo pipe      (Receiver, impl)

Page (Receiver) ─────────────→  Page (Remote)
(JS implements)   Mojo pipe      (C++ calls JS)
```

Có 2 "hướng" giao tiếp:
1. **JS → C++**: `PageHandler` — JS gọi methods trên C++
2. **C++ → JS**: `Page` — C++ gọi methods trên JS (observer/push notifications)

---

## Mojom file — Định nghĩa Contract

> **🎯 ĐÂY là phần quan trọng nhất bạn cần thuộc.** `.mojom` là **contract** giữa C++ và JS. Bạn sẽ tham gia thiết kế nó (cùng native team), và mọi method/event/struct ở đây sẽ phản chiếu sang JS side. Đọc kỹ.

```mojom
// settings.mojom
module settings.mojom;

// 1. C++ → JS (push notifications)
interface Page {
  // C++ gọi khi theme thay đổi
  OnThemeChanged(string theme);
  // C++ gọi khi user sign in/out
  OnSignInStateChanged(bool is_signed_in);
};

// 2. JS → C++ (requests)
interface PageHandler {
  // JS gọi để lấy settings
  GetSettings() => (Settings settings);
  // JS gọi để thay đổi theme
  SetTheme(string theme);
  // JS gọi để open dialog
  OpenManageProfilesPage();
};

// 3. Factory: tạo PageHandler + Page connection
interface PageHandlerFactory {
  CreatePageHandler(pending_remote<Page> page,
                    pending_receiver<PageHandler> handler);
};

// Data types
struct Settings {
  string theme;
  bool dark_mode;
  int32 font_size;
  array<string> search_engines;
};
```

---

## C++ WebUIController Implementation

> **🎯 Concept (cần biết, không cần viết):**
>
> `SettingsUI` (đặt tên theo page) là class C++ kế thừa từ `MojoWebUIController` + implement `PageHandlerFactory` interface từ `.mojom`. Vai trò:
>
> 1. **Là entry point** khi browser navigate đến `chrome://settings` — Chromium tạo 1 instance của class này.
> 2. **Register resources** trong constructor (xem bài 3 — `WebUIDataSource`).
> 3. **Bind Mojo pipe** khi JS gọi `getRemote()` lần đầu — qua `BindInterface()`.
> 4. **Tạo `PageHandler` thực** khi JS gọi `createPageHandler(...)` — qua method `CreatePageHandler()`.
>
> **Bạn cần biết để debug:** Nếu BrowserProxy ở JS không kết nối được → một trong 2 method `BindInterface` hoặc `CreatePageHandler` lỗi ở C++ side. Báo native team check.

<details>
<summary>📎 Reference: C++ WebUIController code (không cần memorize)</summary>

```cpp
// settings_ui.h
#include "chrome/browser/ui/webui/settings/settings.mojom.h"
#include "ui/webui/mojo_web_ui_controller.h"

class SettingsUI
    : public ui::MojoWebUIController,
      public settings::mojom::PageHandlerFactory {
 public:
  explicit SettingsUI(content::WebUI* web_ui);
  ~SettingsUI() override;

  // Chromium calls này để bind Mojo interfaces
  void BindInterface(
      mojo::PendingReceiver<settings::mojom::PageHandlerFactory> receiver);

 private:
  // PageHandlerFactory implementation
  void CreatePageHandler(
      mojo::PendingRemote<settings::mojom::Page> page,
      mojo::PendingReceiver<settings::mojom::PageHandler> handler) override;

  std::unique_ptr<SettingsPageHandler> page_handler_;
  mojo::Receiver<settings::mojom::PageHandlerFactory> factory_receiver_{this};

  WEB_UI_CONTROLLER_TYPE_DECL();
};
```

```cpp
// settings_ui.cc
SettingsUI::SettingsUI(content::WebUI* web_ui)
    : MojoWebUIController(web_ui, /*enable_chrome_send=*/true) {

  // Setup data source
  auto* source = content::WebUIDataSource::CreateAndAdd(
      Profile::FromWebUI(web_ui), chrome::kChromeUISettingsHost);

  // Register resources
  webui::SetupWebUIDataSource(source,
      base::make_span(kSettingsResources, kSettingsResourcesSize),
      IDR_SETTINGS_SETTINGS_HTML);
}

void SettingsUI::BindInterface(
    mojo::PendingReceiver<settings::mojom::PageHandlerFactory> receiver) {
  factory_receiver_.Bind(std::move(receiver));
}

void SettingsUI::CreatePageHandler(
    mojo::PendingRemote<settings::mojom::Page> page,
    mojo::PendingReceiver<settings::mojom::PageHandler> handler) {
  // Tạo PageHandler với connection đến JS Page
  page_handler_ = std::make_unique<SettingsPageHandler>(
      std::move(handler), std::move(page));
}
```

</details>

---

## C++ PageHandler Implementation

> **🎯 Concept (cần biết):**
>
> `SettingsPageHandler` là class C++ implement **interface `PageHandler`** đã định nghĩa trong `.mojom`. Mỗi method trong `.mojom` (vd `GetSettings`, `SetTheme`) tương ứng **một method C++** ở đây.
>
> - Khi JS gọi `proxy.handler.getSettings()` → C++ chạy `SettingsPageHandler::GetSettings(callback)` → trả data qua `callback`.
> - Khi C++ muốn báo JS (vd theme đổi) → gọi `page_->OnThemeChanged(...)` → JS nhận ở `callbackRouter.onThemeChanged`.
>
> **Lifecycle:** PageHandler được tạo MỘT lần khi page load (qua `CreatePageHandler` ở WebUIController), sống đến khi tab đóng.
>
> **Mapping cần nhớ:**
>
> | JS (BrowserProxy) | C++ (PageHandler) |
> |---|---|
> | `proxy.handler.getSettings()` | `PageHandler::GetSettings(callback)` |
> | `proxy.handler.setTheme('dark')` | `PageHandler::SetTheme(const std::string& theme)` |
> | `proxy.callbackRouter.onThemeChanged.addListener(fn)` | `page_->OnThemeChanged(theme)` |
>
> **Bạn cần biết để debug:** Nếu method JS gọi không nhận response → C++ side method không implement hoặc throw. Báo native team check log.

<details>
<summary>📎 Reference: C++ PageHandler code (không cần memorize)</summary>

```cpp
// settings_page_handler.h
class SettingsPageHandler : public settings::mojom::PageHandler {
 public:
  SettingsPageHandler(
      mojo::PendingReceiver<settings::mojom::PageHandler> receiver,
      mojo::PendingRemote<settings::mojom::Page> page);

  // Implement các methods từ mojom
  void GetSettings(GetSettingsCallback callback) override;
  void SetTheme(const std::string& theme) override;
  void OpenManageProfilesPage() override;

 private:
  mojo::Receiver<settings::mojom::PageHandler> receiver_;
  mojo::Remote<settings::mojom::Page> page_;  // Để call JS
};
```

```cpp
// settings_page_handler.cc
SettingsPageHandler::SettingsPageHandler(
    mojo::PendingReceiver<settings::mojom::PageHandler> receiver,
    mojo::PendingRemote<settings::mojom::Page> page)
    : receiver_(this, std::move(receiver)),
      page_(std::move(page)) {

  // Subscribe to native theme changes
  theme_observer_.Observe(ThemeService::GetForProfile(profile_));
}

void SettingsPageHandler::GetSettings(GetSettingsCallback callback) {
  auto settings = settings::mojom::Settings::New();
  settings->theme = GetCurrentTheme();
  settings->dark_mode = IsDarkModeEnabled();
  settings->font_size = GetFontSize();

  std::move(callback).Run(std::move(settings));
}

void SettingsPageHandler::SetTheme(const std::string& theme) {
  // Lưu theme vào PrefService
  profile_->GetPrefs()->SetString(prefs::kTheme, theme);
}

// Khi theme thay đổi (callback từ ThemeService)
void SettingsPageHandler::OnThemeChanged() {
  // Push notification xuống JS!
  page_->OnThemeChanged(GetCurrentTheme());
}
```

</details>

---

## JavaScript BrowserProxy Pattern

> **🎯 ĐÂY là code bạn sẽ viết.** Đọc kỹ.

JS không giao tiếp Mojo trực tiếp trong component — thường qua một **BrowserProxy** class:

```javascript
// settings_browser_proxy.js
import {PageCallbackRouter, PageHandlerFactory, PageHandlerRemote}
    from './settings.mojom-webui.js';

// Singleton
let instance = null;

export class SettingsBrowserProxy {
  constructor() {
    this.handler = new PageHandlerRemote();
    this.callbackRouter = new PageCallbackRouter();

    // Pattern chuẩn Chromium: PageHandlerFactory.getRemote() là static method
    // mojo bindings tự gen — trả về Remote đã bind sẵn qua interface broker
    // của browser. Sau đó gọi createPageHandler để tạo cả PageHandler (JS→C++)
    // và Page callback (C++→JS) trên cùng connection.
    PageHandlerFactory.getRemote().createPageHandler(
      this.callbackRouter.$.bindNewPipeAndPassRemote(),
      this.handler.$.bindNewPipeAndPassReceiver(),
    );
  }

  static getInstance() {
    return instance || (instance = new SettingsBrowserProxy());
  }

  // Convenience methods (optional wrapper)
  getSettings() {
    return this.handler.getSettings();
  }

  setTheme(theme) {
    return this.handler.setTheme(theme);
  }
}
```

```javascript
// settings_page.js — sử dụng proxy
import {SettingsBrowserProxy} from './settings_browser_proxy.js';
import {LitElement, html} from 'chrome://resources/lit/v3_0/lit.rollup.js';

class SettingsPage extends LitElement {
  constructor() {
    super();
    this._proxy = SettingsBrowserProxy.getInstance();
    this._settings = null;
  }

  connectedCallback() {
    super.connectedCallback();

    // Subscribe to push notifications từ C++
    this._proxy.callbackRouter.onThemeChanged.addListener(
        theme => { this._currentTheme = theme; });

    // Load initial data
    this._loadSettings();
  }

  async _loadSettings() {
    const {settings} = await this._proxy.getSettings();
    this._settings = settings;
  }

  async _onThemeChange(e) {
    const theme = e.detail.value;
    await this._proxy.setTheme(theme);
  }
}
```

---

## Tóm tắt WebUIController Pattern

Full pattern 5 bước (web dev viết 2 bước in đậm):

```
1. Định nghĩa .mojom  ← bạn cùng design với native
   → PageHandlerFactory, PageHandler, Page interfaces
   → Data structs

2. C++: WebUIController  ← native viết
   → Kế thừa MojoWebUIController
   → Register resources
   → Implement PageHandlerFactory.CreatePageHandler()

3. C++: PageHandler  ← native viết
   → Implement tất cả methods trong PageHandler interface
   → Giữ Remote<Page> để push updates xuống JS

4. JS: BrowserProxy  ← ⭐ BẠN VIẾT
   → Tạo Remote<PageHandler>
   → Tạo Receiver<Page> (CallbackRouter)
   → Gọi Factory.CreatePageHandler() để kết nối

5. JS: LitElement/Polymer Component  ← ⭐ BẠN VIẾT
   → Dùng BrowserProxy.getInstance()
   → Gọi async methods
   → Subscribe callbacks cho push updates
```

---

## ✅ Web dev — bạn cần nhớ gì sau bài 2

**Mental model cần có:**

```
┌──────────────────────────────┐         ┌──────────────────────────────┐
│   JS (Renderer Process)      │         │  C++ (Browser Process)       │
│  ──────────────────────      │         │  ──────────────────────      │
│                              │         │                              │
│  Component (bạn viết)        │         │  WebUIController (native)    │
│    │                          │         │    │                          │
│    │ uses                     │         │    │ creates                  │
│    ▼                          │         │    ▼                          │
│  BrowserProxy (bạn viết)     │ ◄────► │  PageHandler (native)        │
│    - handler: Remote          │  Mojo   │    - implements PageHandler  │
│    - callbackRouter: Receiver │  pipe   │    - holds Remote<Page>      │
└──────────────────────────────┘         └──────────────────────────────┘
        ▲                                          │
        │                                          │
        └──────────────────────────────────────────┘
              C++ push notifications xuống JS
              (qua callbackRouter của BrowserProxy)
```

**Checklist khi viết WebUI page mới:**

| File | Ai viết | Bạn làm gì |
|---|---|---|
| `feature.mojom` | Native | ✋ Cùng design — chốt interface methods, data structs |
| `feature_ui.cc/.h` (WebUIController) | Native | ❌ Không động |
| `feature_page_handler.cc/.h` (PageHandler) | Native | ❌ Không động |
| `feature.mojom-webui.js` | Auto-generated | ✅ Import vào BrowserProxy |
| `browser_proxy.js` | **Bạn** | ⭐ Viết singleton wrapper Mojo |
| `feature_page.ts` (Component) | **Bạn** | ⭐ Polymer/Lit, dùng BrowserProxy |

**Lỗi thường gặp & nơi check:**

| Triệu chứng | Nguyên nhân có thể | Check ở đâu |
|---|---|---|
| `handler.getXxx is not a function` | Sai tên method JS ↔ Mojo (camelCase JS, PascalCase Mojo) | Mojom file vs proxy.js |
| Method gọi xong không return | C++ chưa `std::move(callback).Run(...)` | Native team check `PageHandler` |
| Push event không nhận được ở JS | Quên `callbackRouter.onXxx.addListener(...)` | Component constructor/connectedCallback |
| `PageHandlerFactory.getRemote() returns null` | Interface chưa register trong `BindInterface` ở WebUIController | Native team check |

→ [Bài tiếp theo: WebUIDataSource — serve resources](03-webui-data-source.md)
