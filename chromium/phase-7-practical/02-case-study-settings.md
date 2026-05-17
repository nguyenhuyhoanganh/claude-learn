# Bài 2: Case Study — Trace một Feature hoàn chỉnh

## Feature: "Toggle Dark Mode trong Samsung Settings"

Chúng ta trace toàn bộ flow từ user click đến native setting được lưu.

---

## Sơ đồ tổng quan

```
User click toggle
       │
       ▼
LitElement: onDarkModeToggle_(event)
       │
       ▼
BrowserProxy: handler.setDarkMode(enabled)
       │  [Mojo IPC cross-process]
       ▼
C++ PageHandler: SetDarkMode(enabled, callback)
       │
       ▼
PrefService: SetBoolean(prefs::kDarkMode, enabled)
       │
       ▼
ThemeService: ApplyDarkMode(enabled)
       │
       ▼
ThemeService notifies observers
       │
       ▼
PageHandler::OnThemeChanged()
       │  [Mojo IPC cross-process, ngược lại]
       ▼
JS callbackRouter: onThemeChanged.fire(theme)
       │
       ▼
LitElement: settings_ updated → re-render
```

---

## 1. Mojo Interface (Contract)

```mojom
// samsung_settings.mojom

interface SamsungSettingsPage {
  // C++ → JS: push notifications
  OnThemeChanged(ColorTheme theme);
  OnDarkModeChanged(bool enabled);
};

interface SamsungSettingsHandler {
  // JS → C++: requests
  GetSettings() => (SamsungSettings settings);
  SetDarkMode(bool enabled) => (bool success);
};
```

---

## 2. C++ Handler — SetDarkMode

```cpp
void SamsungSettingsHandler::SetDarkMode(
    bool enabled,
    SetDarkModeCallback callback) {
  // Validation
  if (!IsFeatureEnabled(features::kSamsungDarkMode)) {
    std::move(callback).Run(/*success=*/false);
    return;
  }

  // Save to preferences
  profile_->GetPrefs()->SetBoolean(
      prefs::kSamsungDarkModeEnabled, enabled);

  // Apply immediately
  SamsungThemeManager::GetInstance()->SetDarkMode(enabled);

  // Respond to JS
  std::move(callback).Run(/*success=*/true);
  // callback phải được gọi ĐÚNG MỘT LẦN — quan trọng!
}
```

---

## 3. C++ Observer → Push xuống JS

```cpp
// SamsungSettingsHandler cũng observe ThemeService
void SamsungSettingsHandler::OnThemeChanged() {
  // Đọc state mới
  bool dark_mode = profile_->GetPrefs()->GetBoolean(
      prefs::kSamsungDarkModeEnabled);

  // Push xuống JS qua Mojo
  page_->OnDarkModeChanged(dark_mode);

  // Cũng push theme
  int theme = profile_->GetPrefs()->GetInteger(prefs::kSamsungTheme);
  page_->OnThemeChanged(
      static_cast<samsung_settings::mojom::ColorTheme>(theme));
}
```

---

## 4. JavaScript — Toàn bộ component

```typescript
// samsung_settings_page.ts
import {LitElement, html, css} from
    'chrome://resources/lit/v3_0/lit.rollup.js';
import {
  SamsungSettingsBrowserProxy,
  ColorTheme,
} from './samsung_settings_browser_proxy.js';
import type {SamsungSettings} from
    './samsung_settings.mojom-webui.js';

export class SamsungSettingsPageElement extends LitElement {
  static override properties = {
    settings_: {state: true},
    saving_: {state: true},
    error_: {state: true},
  };

  static override styles = css`...`;

  private proxy_: SamsungSettingsBrowserProxy;
  private listenerIds_: number[] = [];
  private settings_: SamsungSettings|null = null;
  private saving_ = false;
  private error_: string|null = null;

  constructor() {
    super();
    this.proxy_ = SamsungSettingsBrowserProxy.getInstance();
  }

  override connectedCallback() {
    super.connectedCallback();

    const router = this.proxy_.callbackRouter;
    this.listenerIds_.push(
      router.onThemeChanged.addListener(
          (theme: ColorTheme) => this.onThemePushed_(theme)),
      router.onDarkModeChanged.addListener(
          (enabled: boolean) => this.onDarkModePushed_(enabled)),
    );

    this.loadSettings_();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.listenerIds_.forEach(
        id => this.proxy_.callbackRouter.removeListener(id));
    this.listenerIds_ = [];
  }

  private async loadSettings_() {
    try {
      const {settings} = await this.proxy_.handler.getSettings();
      this.settings_ = settings;
    } catch {
      this.error_ = 'Failed to load settings';
    }
  }

  // Được C++ gọi khi theme thay đổi (từ bất kỳ đâu)
  private onThemePushed_(theme: ColorTheme) {
    if (this.settings_) {
      this.settings_ = {...this.settings_, theme};
    }
  }

  private onDarkModePushed_(enabled: boolean) {
    if (this.settings_) {
      this.settings_ = {...this.settings_, darkModeEnabled: enabled};
    }
  }

  private async onDarkModeToggle_(e: Event) {
    const enabled = (e.target as HTMLInputElement).checked;

    // Optimistic update — update UI ngay, rollback nếu fail
    const prevSettings = this.settings_;
    this.settings_ = {...this.settings_!, darkModeEnabled: enabled};
    this.saving_ = true;

    try {
      const {success} = await this.proxy_.handler.setDarkMode(enabled);
      if (!success) throw new Error('Failed');
    } catch {
      // Rollback
      this.settings_ = prevSettings;
      this.error_ = 'Failed to save dark mode setting';
    } finally {
      this.saving_ = false;
    }
  }

  override render() {
    if (!this.settings_) {
      return html`<loading-spinner></loading-spinner>`;
    }

    return html`
      <div class="settings-section">
        <div class="setting-row">
          <div class="setting-label">
            <span>Dark Mode</span>
            <span class="sublabel">Override system dark mode</span>
          </div>
          <cr-toggle
            .checked=${this.settings_.darkModeEnabled}
            ?disabled=${this.saving_}
            @change=${this.onDarkModeToggle_}>
          </cr-toggle>
        </div>
      </div>

      ${this.error_ ? html`
        <div class="error-message">${this.error_}</div>
      ` : ''}
    `;
  }
}

customElements.define('samsung-settings-page', SamsungSettingsPageElement);
```

---

## 5. Điểm quan trọng cần nhớ

### Optimistic Updates

```
User action → Update UI ngay (optimistic)
           → Gọi Mojo (async)
           → Nếu fail: rollback UI về state cũ
           → Nếu success: UI đã đúng, không cần gì thêm
```

Tại sao? Vì UX tốt hơn — user thấy kết quả ngay, không bị lag.

### Push vs Pull

```
Pull (JS polling):  JS gọi getSettings() mỗi X giây → Lãng phí
Push (Observer):    C++ chủ động gọi JS khi có thay đổi → Hiệu quả
```

Luôn dùng Observer pattern cho changes từ native side.

### Cleanup Listeners

```javascript
// connectedCallback: đăng ký
this.listenerIds_.push(router.onXxx.addListener(...));

// disconnectedCallback: cleanup
this.listenerIds_.forEach(id => router.removeListener(id));
```

Quên cleanup → memory leak, unexpected callbacks sau khi component bị destroy.

---

## 6. Testing Strategy

```typescript
// samsung_settings_page_test.ts
import {SamsungSettingsBrowserProxy} from '../samsung_settings_browser_proxy.js';

// Mock proxy
class TestSamsungSettingsBrowserProxy {
  handler = {
    getSettings: () => Promise.resolve({
      settings: {
        theme: ColorTheme.kLight,
        darkModeEnabled: false,
        browserVersion: '1.0',
      }
    }),
    setDarkMode: (enabled: boolean) =>
        Promise.resolve({success: true}),
  };

  callbackRouter = {
    onThemeChanged: {addListener: (fn: any) => 0, removeListener: (_: any) => {}},
    onDarkModeChanged: {addListener: (fn: any) => 0, removeListener: (_: any) => {}},
    removeListener: (_: any) => {},
  };
}

suite('SamsungSettingsPage', () => {
  let proxy: TestSamsungSettingsBrowserProxy;
  let page: SamsungSettingsPageElement;

  setup(async () => {
    proxy = new TestSamsungSettingsBrowserProxy();
    SamsungSettingsBrowserProxy.setInstance(proxy as any);

    page = document.createElement('samsung-settings-page') as any;
    document.body.appendChild(page);
    await page.updateComplete;
  });

  teardown(() => {
    page.remove();
  });

  test('renders dark mode toggle', () => {
    const toggle = page.shadowRoot!.querySelector('cr-toggle');
    assertNotEquals(toggle, null);
  });

  test('toggle calls setDarkMode', async () => {
    let calledWith: boolean|null = null;
    proxy.handler.setDarkMode = (enabled) => {
      calledWith = enabled;
      return Promise.resolve({success: true});
    };

    const toggle = page.shadowRoot!.querySelector('cr-toggle')!;
    toggle.click();
    await page.updateComplete;

    assertEquals(true, calledWith);
  });
});
```

---

→ [Bài tiếp theo: Tạo WebUI page mới từ đầu](03-creating-new-webui.md)
