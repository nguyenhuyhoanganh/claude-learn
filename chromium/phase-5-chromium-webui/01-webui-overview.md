# Bài 1: Chromium WebUI — Tổng quan

## WebUI là gì?

**WebUI** (Web User Interface) là framework của Chromium để build browser UI pages dùng web technologies (HTML/CSS/JS). Đây là những trang có URL dạng:

- `chrome://settings`
- `chrome://history`
- `chrome://newtab`
- `samsung://settings` (Samsung Browser)

Những trang này **không phải website** — chúng là **browser UI được build bằng web tech**, chạy với quyền đặc biệt và có thể giao tiếp với native C++ qua Mojo.

---

## Tại sao dùng WebUI thay vì native UI?

| | WebUI | Native UI (Views) |
|--|-------|------------------|
| Language | HTML/CSS/JS | C++ |
| Flexibility | Cao (web là responsive) | Thấp (per-platform) |
| Development speed | Nhanh | Chậm |
| Cross-platform | Tự động | Cần code per-platform |
| Performance | Tốt (hardware accelerated) | Tốt |
| Native feel | Cần effort | Tự nhiên |

Google đã chọn WebUI cho Settings, History, Extensions, NTP... vì flexibility và development speed.

---

## Luồng từ URL đến WebUI

```
1. User gõ chrome://settings hoặc click Settings button
         ↓
2. Browser nhận navigation request
         ↓
3. URL Scheme Handler nhận ra "chrome://"
   → Tìm WebUIController đã đăng ký cho "settings"
         ↓
4. SettingsUI (WebUIController) được tạo
   → Bind Mojo interfaces
   → Serve HTML/JS/CSS resources
         ↓
5. Renderer Process được tạo (hoặc reuse)
   → Load settings/settings.html
   → Execute JS, render Polymer/Lit components
         ↓
6. Components load, kết nối Mojo
   → Gọi getInitialSettings()
   → Render UI với data từ native
```

---

## Cấu trúc file của một WebUI page

```
chrome/browser/resources/settings/
├── BUILD.gn                    ← Build rules (GN)
├── settings.html               ← Entry point HTML
├── settings_main.ts            ← Entry point JS
│
├── settings_page/
│   ├── settings_page.ts        ← Main component
│   └── settings_page.html      ← Template
│
├── privacy_page/
│   ├── privacy_page.ts
│   ├── privacy_page.html
│   └── privacy_page_browser_proxy.ts  ← Mojo wrapper
│
└── prefs/
    └── prefs.ts                ← Preferences management
```

```
chrome/browser/ui/webui/settings/
├── settings_ui.cc              ← WebUIController (C++)
├── settings_ui.h
├── settings_page_handler.cc    ← Mojo handler implementation
└── settings_page_handler.h
```

```
chrome/browser/ui/webui/settings/
└── settings.mojom              ← Interface definitions
```

---

## HTML Entry Point

```html
<!-- settings.html -->
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Settings</title>

  <!-- Preload fonts -->
  <link rel="preload" href="chrome://resources/fonts/roboto-regular.woff2"
        as="font" crossorigin>

  <!-- Import map: alias module paths -->
  <script type="importmap">
  {
    "imports": {
      "chrome://resources/js/lit/": "/lit/",
      "//resources/mojo/": "chrome://resources/mojo/"
    }
  }
  </script>
</head>
<body>
  <!-- Root component -->
  <settings-ui></settings-ui>

  <!-- Entry module -->
  <script type="module" src="settings_main.js"></script>
</body>
</html>
```

---

## WebUIController (C++ side)

Đây là "người quản lý" của mỗi WebUI page:

```cpp
// settings_ui.h
class SettingsUI : public ui::MojoWebUIController,
                   public mojom::PageHandlerFactory {
 public:
  explicit SettingsUI(content::WebUI* web_ui);

  // Bind Mojo interfaces khi JS yêu cầu
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

  // Đăng ký resources
  content::WebUIDataSource* source =
      content::WebUIDataSource::CreateAndAdd(
          web_ui->GetWebContents()->GetBrowserContext(),
          chrome::kChromeUISettingsHost);

  // Add HTML/JS/CSS files
  source->AddResourcePath("settings.html", IDR_SETTINGS_HTML);
  source->AddResourcePath("settings_main.js", IDR_SETTINGS_MAIN_JS);

  // Cho phép Mojo bindings
  source->OverrideContentSecurityPolicy(
      network::mojom::CSPDirectiveName::ScriptSrc,
      "script-src chrome://resources 'self';");
}
```

---

## chrome://resources — Shared Resources

Chromium cung cấp shared resources tại `chrome://resources/`:

```javascript
// LitElement
import {LitElement, html, css} from
    'chrome://resources/lit/v3_0/lit.rollup.js';

// Common UI components (cr-* components)
import 'chrome://resources/cr_elements/cr_button/cr_button.js';
import 'chrome://resources/cr_elements/cr_toggle/cr_toggle.js';
import 'chrome://resources/cr_elements/cr_dialog/cr_dialog.js';

// Utilities
import {assert} from 'chrome://resources/js/assert.js';
import {loadTimeData} from 'chrome://resources/js/load_time_data.js';
import {I18nMixinLit} from 'chrome://resources/cr_elements/i18n_mixin_lit.js';
```

`cr-*` components là design system của Chromium:
- `<cr-button>` — standard button
- `<cr-toggle>` — toggle switch
- `<cr-dialog>` — modal dialog
- `<cr-icon-button>` — icon button
- `<cr-checkbox>` — checkbox
- `<cr-input>` — text input

---

## `loadTimeData` — Data từ C++ lúc load

Browser truyền một số data vào WebUI lúc page load (không qua Mojo call):

```cpp
// C++ side: inject data khi tạo page
source->AddBoolean("isDarkModeEnabled", IsDarkModeEnabled());
source->AddString("userEmail", GetUserEmail());
source->AddInteger("fontSize", GetFontSize());
source->AddLocalizedString("settingsTitle",
    IDS_SETTINGS_TITLE);  // Localized string
```

```javascript
// JS side: đọc data
import {loadTimeData} from 'chrome://resources/js/load_time_data.js';

const isDark = loadTimeData.getBoolean('isDarkModeEnabled');
const email = loadTimeData.getString('userEmail');
const fontSize = loadTimeData.getInteger('fontSize');
const title = loadTimeData.getString('settingsTitle'); // translated
```

`loadTimeData` là cách nhanh để truyền simple values. Với complex data hoặc data thay đổi, dùng Mojo.

---

## I18n (Internationalization)

```javascript
// Mixin để dùng i18n trong LitElement
import {I18nMixinLit} from
    'chrome://resources/cr_elements/i18n_mixin_lit.js';
import {LitElement, html} from
    'chrome://resources/lit/v3_0/lit.rollup.js';

const SettingsBase = I18nMixinLit(LitElement);

class SettingsPage extends SettingsBase {
  render() {
    return html`
      <h1>${this.i18n('settingsTitle')}</h1>
      <p>${this.i18n('settingsDescription')}</p>

      <!-- With substitution -->
      <p>${this.i18n('welcomeMessage', this.userName)}</p>
    `;
  }
}
```

---

## Content Security Policy trong WebUI

WebUI có CSP nghiêm ngặt:

```
default-src 'none';
script-src chrome://resources 'self';
img-src chrome://resources data: 'self';
style-src chrome://resources 'self' 'unsafe-inline';
```

Điều này có nghĩa:
- **Không thể load scripts từ internet** (chỉ từ chrome://resources và 'self')
- **Không thể dùng eval()** hay inline scripts không được nonce
- **Không thể fetch external URLs** trực tiếp

Mọi external data phải đi qua Mojo → Browser Process → Network Service.

---

## Build System (GN)

Chromium dùng **GN** (Generate Ninja) làm build system:

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
```

Bạn không cần hiểu sâu GN ngay. Biết rằng:
- Mỗi component cần được khai báo trong BUILD.gn
- Dependencies phải được khai báo rõ ràng
- TypeScript được compile sang JS
- Mojo `.mojom` files được compile sang bindings

---

→ [Bài tiếp theo: WebUIController chi tiết](02-webui-controller.md)
