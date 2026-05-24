# Bài 2: WebUIController — Cầu nối C++ và WebUI

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

---

## C++ PageHandler Implementation

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

---

## JavaScript BrowserProxy Pattern

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

```
1. Định nghĩa .mojom
   → PageHandlerFactory, PageHandler, Page interfaces
   → Data structs

2. C++: WebUIController
   → Kế thừa MojoWebUIController
   → Register resources
   → Implement PageHandlerFactory.CreatePageHandler()

3. C++: PageHandler
   → Implement tất cả methods trong PageHandler interface
   → Giữ Remote<Page> để push updates xuống JS

4. JS: BrowserProxy
   → Tạo Remote<PageHandler>
   → Tạo Receiver<Page> (CallbackRouter)
   → Gọi Factory.CreatePageHandler() để kết nối

5. JS: LitElement Component
   → Dùng BrowserProxy.getInstance()
   → Gọi async methods
   → Subscribe callbacks cho push updates
```

→ [Bài tiếp theo: WebUIDataSource — serve resources](03-webui-data-source.md)
