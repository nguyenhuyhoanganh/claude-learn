# Bài 5: PageHandler Pattern — Complete Walkthrough

## Bài toán

Xây dựng một WebUI page "Samsung Quick Settings" với:
- Hiển thị current theme (light/dark/auto)
- Toggle dark mode
- Khi native theme thay đổi (từ OS), UI tự update
- Button "Reset to defaults"

Chúng ta sẽ đi qua toàn bộ flow từ .mojom đến UI.

---

## Bước 1: Định nghĩa .mojom

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

// C++ → JS (push notifications)
interface QuickSettingsPage {
  OnThemeChanged(ColorTheme theme);
  OnDarkModeChanged(bool enabled);
};

// JS → C++ (requests)
interface QuickSettingsHandler {
  GetSettings() => (QuickSettings settings);
  SetTheme(ColorTheme theme) => (bool success);
  SetDarkMode(bool enabled) => (bool success);
  ResetToDefaults() => ();
};

// Bootstrap connection
interface QuickSettingsHandlerFactory {
  CreateHandler(
    pending_remote<QuickSettingsPage> page,
    pending_receiver<QuickSettingsHandler> handler
  );
};
```

---

## Bước 2: C++ WebUIController

```cpp
// samsung_quick_settings_ui.h
#pragma once
#include "samsung/quick_settings/samsung_quick_settings.mojom.h"
#include "ui/webui/mojo_web_ui_controller.h"

class SamsungQuickSettingsUI
    : public ui::MojoWebUIController,
      public samsung::quick_settings::mojom::QuickSettingsHandlerFactory {
 public:
  explicit SamsungQuickSettingsUI(content::WebUI* web_ui);
  ~SamsungQuickSettingsUI() override;

  void BindInterface(
      mojo::PendingReceiver<
          samsung::quick_settings::mojom::QuickSettingsHandlerFactory>
          receiver);

 private:
  void CreateHandler(
      mojo::PendingRemote<
          samsung::quick_settings::mojom::QuickSettingsPage> page,
      mojo::PendingReceiver<
          samsung::quick_settings::mojom::QuickSettingsHandler> handler)
      override;

  std::unique_ptr<SamsungQuickSettingsHandler> handler_;
  mojo::Receiver<samsung::quick_settings::mojom::QuickSettingsHandlerFactory>
      factory_receiver_{this};

  WEB_UI_CONTROLLER_TYPE_DECL();
};
```

```cpp
// samsung_quick_settings_ui.cc
#include "samsung_quick_settings_ui.h"
#include "samsung/browser/grit/samsung_resources.h"

SamsungQuickSettingsUI::SamsungQuickSettingsUI(content::WebUI* web_ui)
    : MojoWebUIController(web_ui) {

  auto* source = content::WebUIDataSource::CreateAndAdd(
      web_ui->GetWebContents()->GetBrowserContext(),
      "samsung-quick-settings");

  // Register resources
  source->AddResourcePath("",
      IDR_SAMSUNG_QUICK_SETTINGS_HTML);
  source->AddResourcePath("samsung_quick_settings.js",
      IDR_SAMSUNG_QUICK_SETTINGS_JS);
}

void SamsungQuickSettingsUI::BindInterface(
    mojo::PendingReceiver<mojom::QuickSettingsHandlerFactory> receiver) {
  factory_receiver_.Bind(std::move(receiver));
}

void SamsungQuickSettingsUI::CreateHandler(
    mojo::PendingRemote<mojom::QuickSettingsPage> page,
    mojo::PendingReceiver<mojom::QuickSettingsHandler> handler) {
  handler_ = std::make_unique<SamsungQuickSettingsHandler>(
      std::move(handler), std::move(page));
}
```

---

## Bước 3: C++ PageHandler

```cpp
// samsung_quick_settings_handler.h
class SamsungQuickSettingsHandler
    : public samsung::quick_settings::mojom::QuickSettingsHandler,
      public ThemeServiceObserver {  // Observe native theme changes
 public:
  SamsungQuickSettingsHandler(
      mojo::PendingReceiver<mojom::QuickSettingsHandler> receiver,
      mojo::PendingRemote<mojom::QuickSettingsPage> page);

  // QuickSettingsHandler implementation
  void GetSettings(GetSettingsCallback callback) override;
  void SetTheme(mojom::ColorTheme theme, SetThemeCallback callback) override;
  void SetDarkMode(bool enabled, SetDarkModeCallback callback) override;
  void ResetToDefaults(ResetToDefaultsCallback callback) override;

  // ThemeServiceObserver
  void OnThemeChanged() override;

 private:
  Profile* GetProfile();

  mojo::Receiver<mojom::QuickSettingsHandler> receiver_;
  mojo::Remote<mojom::QuickSettingsPage> page_;  // Để push xuống JS

  base::ScopedObservation<ThemeService, ThemeServiceObserver>
      theme_observation_{this};
};
```

```cpp
// samsung_quick_settings_handler.cc
SamsungQuickSettingsHandler::SamsungQuickSettingsHandler(
    mojo::PendingReceiver<mojom::QuickSettingsHandler> receiver,
    mojo::PendingRemote<mojom::QuickSettingsPage> page)
    : receiver_(this, std::move(receiver)),
      page_(std::move(page)) {

  // Subscribe to theme changes
  auto* theme_service = ThemeServiceFactory::GetForProfile(GetProfile());
  theme_observation_.Observe(theme_service);
}

void SamsungQuickSettingsHandler::GetSettings(
    GetSettingsCallback callback) {
  auto settings = mojom::QuickSettings::New();

  auto* prefs = GetProfile()->GetPrefs();
  int theme_int = prefs->GetInteger(prefs::kSamsungTheme);
  settings->theme = static_cast<mojom::ColorTheme>(theme_int);
  settings->dark_mode_enabled = prefs->GetBoolean(prefs::kDarkModeEnabled);
  settings->browser_version = version_info::GetVersionNumber();

  std::move(callback).Run(std::move(settings));
}

void SamsungQuickSettingsHandler::SetTheme(
    mojom::ColorTheme theme,
    SetThemeCallback callback) {
  auto* prefs = GetProfile()->GetPrefs();
  prefs->SetInteger(prefs::kSamsungTheme, static_cast<int>(theme));

  // Apply theme ngay
  ApplyTheme(theme);

  std::move(callback).Run(/*success=*/true);
}

void SamsungQuickSettingsHandler::OnThemeChanged() {
  // Native theme thay đổi → push xuống JS
  auto* prefs = GetProfile()->GetPrefs();
  bool dark_mode = IsSystemDarkMode();

  page_->OnDarkModeChanged(dark_mode);  // Push sang JS
}
```

---

## Bước 4: JavaScript BrowserProxy

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

  static setInstance(instance) {
    SamsungQuickSettingsBrowserProxy.instance_ = instance;
  }
}

export {ColorTheme};
```

---

## Bước 5: LitElement Component

```javascript
// samsung_quick_settings_app.js
import {LitElement, html, css} from
    'chrome://resources/lit/v3_0/lit.rollup.js';
import {
  SamsungQuickSettingsBrowserProxy,
  ColorTheme,
} from './samsung_quick_settings_browser_proxy.js';

class SamsungQuickSettingsApp extends LitElement {
  static properties = {
    settings_: {state: true},
    isLoading_: {state: true},
  };

  static styles = css`
    :host { display: block; padding: 20px; font-family: 'Roboto', sans-serif; }
    h1 { font-size: 20px; margin-bottom: 16px; }
    .setting-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 0;
      border-bottom: 1px solid #e0e0e0;
    }
    .loading { color: #757575; }
  `;

  constructor() {
    super();
    this.proxy_ = SamsungQuickSettingsBrowserProxy.getInstance();
    this.settings_ = null;
    this.isLoading_ = true;
    this.listenerIds_ = [];
  }

  connectedCallback() {
    super.connectedCallback();

    // Subscribe to push updates từ C++
    const router = this.proxy_.callbackRouter;
    this.listenerIds_.push(
      router.onThemeChanged.addListener(
          theme => { this.settings_ = {...this.settings_, theme}; }),
      router.onDarkModeChanged.addListener(
          enabled => { this.settings_ = {...this.settings_, darkModeEnabled: enabled}; }),
    );

    this.loadSettings_();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.listenerIds_.forEach(
        id => this.proxy_.callbackRouter.removeListener(id));
    this.listenerIds_ = [];
  }

  async loadSettings_() {
    try {
      const {settings} = await this.proxy_.handler.getSettings();
      this.settings_ = settings;
    } finally {
      this.isLoading_ = false;
    }
  }

  render() {
    if (this.isLoading_) {
      return html`<p class="loading">Loading...</p>`;
    }

    return html`
      <h1>Quick Settings</h1>

      <div class="setting-row">
        <span>Theme</span>
        <select @change=${this.onThemeChange_}
                .value=${String(this.settings_.theme)}>
          <option value="${ColorTheme.kLight}">Light</option>
          <option value="${ColorTheme.kDark}">Dark</option>
          <option value="${ColorTheme.kAuto}">Auto (System)</option>
        </select>
      </div>

      <div class="setting-row">
        <span>Dark Mode</span>
        <input type="checkbox"
               .checked=${this.settings_.darkModeEnabled}
               @change=${this.onDarkModeChange_}>
      </div>

      <div class="setting-row">
        <span>Browser Version</span>
        <span>${this.settings_.browserVersion}</span>
      </div>

      <button @click=${this.onReset_}>Reset to Defaults</button>
    `;
  }

  async onThemeChange_(e) {
    const theme = parseInt(e.target.value);
    // Optimistic update
    this.settings_ = {...this.settings_, theme};
    const {success} = await this.proxy_.handler.setTheme(theme);
    if (!success) {
      // Rollback
      await this.loadSettings_();
    }
  }

  async onDarkModeChange_(e) {
    const enabled = e.target.checked;
    this.settings_ = {...this.settings_, darkModeEnabled: enabled};
    await this.proxy_.handler.setDarkMode(enabled);
  }

  async onReset_() {
    await this.proxy_.handler.resetToDefaults();
    await this.loadSettings_();  // Reload sau reset
  }
}

customElements.define('samsung-quick-settings-app', SamsungQuickSettingsApp);
```

---

## Tổng kết: Toàn bộ Flow

```
User thay đổi theme
       ↓
onThemeChange_() được gọi (JS)
       ↓
proxy_.handler.setTheme(theme) — Mojo call
       ↓
SetTheme() trong C++ (Browser Process)
  → Lưu vào PrefService
  → ApplyTheme()
  → callback.Run(true)
       ↓
Promise resolve trong JS
{success: true}

Nếu OS theme thay đổi:
ThemeService notify → OnThemeChanged() (C++)
       ↓
page_->OnDarkModeChanged(dark_mode) — Mojo push
       ↓
callbackRouter.onDarkModeChanged fires (JS)
       ↓
settings_ property updated → re-render
```

---

→ [Phase 7: Thực chiến](../phase-7-practical/01-reading-source.md)
