# Bài 3: WebUIDataSource — serve HTML/JS/CSS cho WebUI page

Khi browser navigate đến `chrome://settings` hoặc `samsung://quick-settings`, browser **không** fetch qua HTTP/network. Nó tìm file **bên trong binary** Chromium. **`WebUIDataSource`** là API giúp đăng ký các file resource đó.

Bài này dạy:
- Cách `chrome://` URL serve content (không qua network).
- `WebUIDataSource` API — register HTML/JS/CSS.
- `.grd` file — declarative resource registration.
- `chrome://resources/` — shared resources giữa các WebUI pages.
- CSP — Content Security Policy cho WebUI.

## Cơ chế chrome:// URL — không qua network

Khi user gõ `chrome://settings`:

```text
1. Browser parse URL → scheme = "chrome", host = "settings"
2. URL Loader nhìn scheme "chrome://"
   → KHÔNG đi qua DNS/network
   → Tìm "chrome scheme handler"
3. Scheme handler nhận URL, tra trong registry:
   "settings" → SettingsUI class
4. Trả về resource từ binary (compiled vào executable)
   "settings.html", "settings_main.js" → đọc từ memory hoặc file system
5. Renderer Process render như normal HTML page
```

→ Tốc độ load gần như instant (no network). Resources được compress + bundle vào binary lúc build.

## `WebUIDataSource` — register URL host

`WebUIDataSource` là **một data source** cho 1 URL host (vd "settings", "history"). Nó định nghĩa:
- File nào available (HTML, JS, CSS, fonts, icons).
- Content Security Policy.
- Internal data inject vào page (qua `loadTimeData`).

### Tạo và register

```cpp
// settings_ui.cc
#include "chrome/browser/ui/webui/settings/settings_ui.h"
#include "chrome/common/url_constants.h"
#include "chrome/grit/settings_resources.h"          // Auto-generated IDR_* constants
#include "chrome/grit/settings_resources_map.h"      // {filename, IDR_*} pairs
#include "content/public/browser/web_ui_data_source.h"

SettingsUI::SettingsUI(content::WebUI* web_ui)
    : MojoWebUIController(web_ui) {

  // 1. Tạo data source cho host "settings"
  content::WebUIDataSource* source =
      content::WebUIDataSource::CreateAndAdd(
          Profile::FromWebUI(web_ui),     // BrowserContext
          chrome::kChromeUISettingsHost); // = "settings"

  // 2. Setup resources (sẽ giải thích kỹ)
  webui::SetupWebUIDataSource(
      source,
      base::make_span(kSettingsResources, kSettingsResourcesSize),
      IDR_SETTINGS_SETTINGS_HTML);  // entry HTML

  // 3. CSP (Content Security Policy)
  source->OverrideContentSecurityPolicy(
      network::mojom::CSPDirectiveName::ScriptSrc,
      "script-src chrome://resources chrome://settings 'self';");

  // 4. (Optional) Inject runtime data
  source->AddBoolean("isDarkModeEnabled", IsDarkModeEnabled());
  source->AddString("userEmail", GetUserEmail());
  source->AddLocalizedString("settingsTitle", IDS_SETTINGS_TITLE);
}
```

Phân tích từng bước:

### Bước 1: `WebUIDataSource::CreateAndAdd(...)`

Tạo data source và register với BrowserContext (= profile của user).

```cpp
auto* source = content::WebUIDataSource::CreateAndAdd(
    Profile::FromWebUI(web_ui),
    chrome::kChromeUISettingsHost);
```

`chrome::kChromeUISettingsHost` = constant `"settings"` định nghĩa ở:

```cpp
// chrome/common/url_constants.cc
const char kChromeUISettingsHost[] = "settings";
const char kChromeUISettingsURL[]  = "chrome://settings/";
```

Sau dòng này, browser hiểu **mọi request đến `chrome://settings/*` đi qua `source` này**.

### Bước 2: Register resources

Có **2 cách** add resources:

#### Cách 1 — `SetupWebUIDataSource` (Chromium convention)

```cpp
webui::SetupWebUIDataSource(
    source,
    base::make_span(kSettingsResources, kSettingsResourcesSize),
    IDR_SETTINGS_SETTINGS_HTML);
```

`kSettingsResources` là array auto-generated từ `.grd` file (sẽ explain dưới). `SetupWebUIDataSource` helper add tất cả vào source + default settings (CSP, MIME types).

#### Cách 2 — `AddResourcePath` manual

```cpp
source->AddResourcePath("settings.html", IDR_SETTINGS_HTML);
source->AddResourcePath("settings_main.js", IDR_SETTINGS_MAIN_JS);
source->AddResourcePath("settings_page.html", IDR_SETTINGS_PAGE_HTML);
source->AddResourcePath("settings_page.js", IDR_SETTINGS_PAGE_JS);
source->SetDefaultResource(IDR_SETTINGS_HTML);  // Khi URL không match path
```

`IDR_*` là **integer ID** của resource. Định nghĩa ở `chrome/grit/settings_resources.h` (auto-generated).

→ Cách 1 phổ biến hơn — dùng `.grd` file declarative.

### Bước 3: Content Security Policy

WebUI có **CSP strict** mặc định để chống attack:

```text
default-src 'none';
script-src chrome://resources 'self';
img-src    chrome://resources data: 'self';
style-src  chrome://resources 'self' 'unsafe-inline';
font-src   chrome://resources 'self';
connect-src 'self';
```

Hiểu:
- `'none'` — block tất cả mặc định.
- `'self'` — cho phép resources từ cùng origin (chrome://settings).
- `chrome://resources` — shared resources từ Chromium.

Override khi cần:

```cpp
source->OverrideContentSecurityPolicy(
    network::mojom::CSPDirectiveName::ScriptSrc,
    "script-src chrome://resources chrome://settings chrome://my-feature 'self';");

source->OverrideContentSecurityPolicy(
    network::mojom::CSPDirectiveName::ImgSrc,
    "img-src chrome://resources chrome://favicon data: blob: 'self';");
```

→ Common case: add `chrome://favicon` cho favicon, `blob:` cho file download preview.

### Bước 4: Inject runtime data — `loadTimeData`

```cpp
source->AddBoolean("isDarkMode", IsDarkModeEnabled());
source->AddString("userEmail", GetUserEmail());
source->AddInteger("fontSize", GetFontSize());
source->AddLocalizedString("welcomeTitle", IDS_WELCOME_TITLE);
```

Data này được inject vào HTML qua `<script>` tự generate. Trong JS:

```javascript
import {loadTimeData} from 'chrome://resources/js/load_time_data.js';

const isDark = loadTimeData.getBoolean('isDarkMode');
const email = loadTimeData.getString('userEmail');
const fontSize = loadTimeData.getInteger('fontSize');
const title = loadTimeData.getString('welcomeTitle');  // already translated
```

→ Pattern phổ biến truyền **simple data** từ C++ → JS lúc page load. Cho complex/changing data, dùng Mojo (phase 6).

Bài 5 sẽ đào sâu `loadTimeData`.

## `.grd` file — declarative resource registration

`.grd` (Grit Resource Description) là XML định nghĩa resources nào available trong WebUI. Đây là **single source of truth** cho resources.

```xml
<!-- chrome/browser/resources/settings/settings_resources.grd -->
<?xml version="1.0" encoding="UTF-8"?>
<grit-part>
  <includes>
    <!-- HTML entry point -->
    <include name="IDR_SETTINGS_HTML" 
             file="settings.html" 
             type="BINDATA" />
    
    <!-- JS files -->
    <include name="IDR_SETTINGS_MAIN_JS" 
             file="settings_main.js" 
             type="BINDATA" />
    
    <include name="IDR_SETTINGS_PAGE_JS" 
             file="settings_page.js" 
             type="BINDATA" />
    
    <!-- HTML templates (compiled từ .html) -->
    <include name="IDR_SETTINGS_PAGE_HTML_JS" 
             file="settings_page.html.js" 
             type="BINDATA" />
    
    <!-- CSS -->
    <include name="IDR_SETTINGS_PAGE_CSS_JS" 
             file="settings_page.css.js" 
             type="BINDATA" />
    
    <!-- Mojo bindings (generated) -->
    <include name="IDR_SETTINGS_PAGE_MOJOM_WEBUI_JS" 
             file="${root_gen_dir}/chrome/browser/ui/webui/settings/settings_page.mojom-webui.js"
             use_base_dir="false"
             type="BINDATA" />
    
    <!-- Images -->
    <include name="IDR_SETTINGS_LOGO_PNG" 
             file="images/logo.png" 
             type="BINDATA" />
  </includes>
</grit-part>
```

Khi build, Grit:
1. Đọc `.grd`.
2. Generate `settings_resources.h` với `#define IDR_SETTINGS_HTML 1234` (integer IDs).
3. Generate `settings_resources_map.h` với `{filename, IDR_*}` pairs.
4. Pack tất cả file binary vào `.pak` file (bundled vào Chromium executable).

Trong code C++, dùng `IDR_*` constant:

```cpp
source->AddResourcePath("settings.html", IDR_SETTINGS_HTML);
```

Browser khi nhận request `chrome://settings/settings.html`:
1. Look up `"settings.html"` → IDR_SETTINGS_HTML.
2. Load resource từ `.pak` file (in-memory).
3. Trả về Renderer.

## `chrome://resources/` — shared resources

Có nhiều resource chung dùng giữa các WebUI page:
- LitElement / Polymer library.
- `cr-*` elements.
- Mojo bindings runtime.
- Common utilities (`load_time_data.js`, `assert.js`, etc.).

Thay vì mỗi page bundle riêng, Chromium serve chúng tại `chrome://resources/`:

```javascript
// Import từ shared resources
import {LitElement, html} from 'chrome://resources/lit/v3_0/lit.rollup.js';
import 'chrome://resources/cr_elements/cr_button/cr_button.js';
import 'chrome://resources/cr_elements/cr_toggle/cr_toggle.js';
import {loadTimeData} from 'chrome://resources/js/load_time_data.js';
import {assert} from 'chrome://resources/js/assert.js';
import {I18nMixin} from 'chrome://resources/cr_elements/i18n_mixin.js';
```

→ All WebUI page **đều phải allow `chrome://resources`** trong CSP (mặc định đã có).

### Source code structure

```text
chromium/src/
├── ui/webui/resources/        ← Source of chrome://resources/
│   ├── BUILD.gn
│   ├── cr_elements/           ← cr-* components
│   │   ├── cr_button/
│   │   │   ├── cr_button.ts
│   │   │   └── cr_button.css
│   │   └── ...
│   ├── js/                    ← Utility JS
│   │   ├── load_time_data.ts
│   │   ├── assert.ts
│   │   └── ...
│   └── images/                ← Icons
│
└── chrome/browser/ui/webui/
    └── webui_resources_setup.cc   ← Register chrome://resources data source
```

Khi browser khởi tạo, Chromium auto register `WebUIDataSource` cho `chrome://resources/` → mọi WebUI page tự nhiên access.

## Multiple data sources per host

1 host có thể có **nhiều data sources**. Pattern dùng cho features riêng:

```cpp
// Main settings UI
auto* main_source = content::WebUIDataSource::CreateAndAdd(
    profile, chrome::kChromeUISettingsHost);

// Sub-feature (cùng host nhưng pattern URL khác)
auto* search_source = content::WebUIDataSource::CreateAndAdd(
    profile, "settings/search");
```

→ Hiếm dùng. Thông thường 1 host = 1 data source.

## Inline data — `AddBoolean` / `AddString` / etc.

Đã giới thiệu ở bước 4. Full list:

```cpp
source->AddBoolean("name", bool_value);
source->AddInteger("name", int_value);
source->AddDouble("name", double_value);
source->AddString("name", "string");

// Localized string (translate qua resource bundle)
source->AddLocalizedString("name", IDS_NAME);
source->AddLocalizedString("welcome", IDS_WELCOME_USER);

// Localized với placeholder
source->AddLocalizedString("hello_user", IDS_HELLO_USER);

// String với arguments lúc add (rare)
source->AddString("welcomeWithName", 
    l10n_util::GetStringFUTF16(IDS_WELCOME, user_name));
```

Trong JS:

```javascript
loadTimeData.getBoolean('name');
loadTimeData.getInteger('name');
loadTimeData.getDouble('name');
loadTimeData.getString('name');           // localized string
loadTimeData.getStringF('hello_user',     // string với arg
    'Alice');                              // Output: "Hello Alice"
```

## `<head>` data injection — JS load_time_data

Để inject `loadTimeData` vào page, cần script ở `<head>`:

```html
<!-- settings.html -->
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Settings</title>
  
  <!-- Auto-injected: <script>loadTimeData.data = {...};</script> -->
  
  <script type="module" src="settings_main.js"></script>
</head>
<body>
  <settings-ui></settings-ui>
</body>
</html>
```

Browser tự inject `<script>` set `loadTimeData.data` **trước** `settings_main.js` load. Khi JS chạy, `loadTimeData.getString(...)` đã sẵn sàng.

## CSP — Khi nào cần override

### Trường hợp 1: External fonts

```cpp
source->OverrideContentSecurityPolicy(
    network::mojom::CSPDirectiveName::FontSrc,
    "font-src chrome://resources https://fonts.gstatic.com 'self';");
```

Cho phép load Google Fonts. (Hiếm — thường bundle font vào resources.)

### Trường hợp 2: Inline scripts (NOT recommended)

```cpp
source->OverrideContentSecurityPolicy(
    network::mojom::CSPDirectiveName::ScriptSrc,
    "script-src chrome://resources 'self' 'unsafe-inline';");
```

`'unsafe-inline'` cho phép `<script>...</script>` inline. **Cẩn thận** — security risk.

### Trường hợp 3: Web Workers

```cpp
source->OverrideContentSecurityPolicy(
    network::mojom::CSPDirectiveName::WorkerSrc,
    "worker-src 'self';");
```

### Trường hợp 4: Frame ancestors (iframe)

```cpp
source->OverrideContentSecurityPolicy(
    network::mojom::CSPDirectiveName::FrameAncestors,
    "frame-ancestors 'self';");
```

## `RequestableLocalizedString` — partial localization

Đôi khi muốn add string với placeholder sẽ replace runtime:

```cpp
source->AddLocalizedString("user_greeting", IDS_USER_GREETING);
// IDS_USER_GREETING = "Hello $1, you have $2 messages"
```

JS:

```javascript
const msg = loadTimeData.getStringF('user_greeting', userName, count);
// "Hello Alice, you have 5 messages"
```

## Setup helper — `webui::SetupWebUIDataSource()`

Đây là **helper hay dùng nhất**:

```cpp
// chrome/browser/ui/webui/webui_util.h
namespace webui {
  void SetupWebUIDataSource(
      content::WebUIDataSource* source,
      base::span<const webui::ResourcePath> resources,
      int default_resource);
}
```

Helper này:
1. Add tất cả resources từ array (auto generated từ .grd).
2. Set default resource (URL không match path).
3. Setup basic CSP cho WebUI.
4. Add common shared strings (vd "OK", "Cancel" buttons).

Đầy đủ:

```cpp
SettingsUI::SettingsUI(content::WebUI* web_ui) 
    : MojoWebUIController(web_ui) {

  // Just 4 lines!
  auto* source = content::WebUIDataSource::CreateAndAdd(
      Profile::FromWebUI(web_ui), chrome::kChromeUISettingsHost);
  
  webui::SetupWebUIDataSource(
      source,
      base::make_span(kSettingsResources, kSettingsResourcesSize),
      IDR_SETTINGS_SETTINGS_HTML);
  
  // Optional: add page-specific data
  source->AddBoolean("foo", GetFooValue());
}
```

→ Hầu hết WebUI controllers chỉ cần như này.

## Samsung Browser specific — additional setup

Trong Samsung Browser, có thể có thêm:

```cpp
SamsungSettingsUI::SamsungSettingsUI(content::WebUI* web_ui) 
    : MojoWebUIController(web_ui) {

  auto* source = content::WebUIDataSource::CreateAndAdd(
      Profile::FromWebUI(web_ui), "samsung-settings");
  
  webui::SetupWebUIDataSource(
      source,
      base::make_span(kSamsungSettingsResources, kSamsungSettingsResourcesSize),
      IDR_SAMSUNG_SETTINGS_HTML);
  
  // Allow Samsung-specific shared resources
  source->OverrideContentSecurityPolicy(
      network::mojom::CSPDirectiveName::ScriptSrc,
      "script-src chrome://resources samsung://resources 'self';");
  
  // Samsung-specific runtime data
  source->AddBoolean("isSamsungAccount", HasSamsungAccount(profile));
  source->AddString("samsungBrowserVersion", GetSamsungVersion());
}
```

## Debugging — kiểm tra resources

### Browse all chrome:// URLs

```text
chrome://about    → list all WebUI hosts
chrome://chrome-urls   → cũng tương tự
```

### Inspect resources

```text
chrome://about  → click vào host → page load
DevTools → Network tab → xem requests đến chrome://...
```

### Force reload resource

```text
Developer mode (chrome://flags/#enable-webui-tab-strip etc.)
→ Một số WebUI page reload resources từ disk thay vì bundle
→ Edit JS/HTML → reload → thấy thay đổi (without rebuild)
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Quên register data source | URL chrome://foo không tồn tại | `WebUIDataSource::CreateAndAdd(...)` |
| Resource không trong `.grd` | 404 khi load | Update `.grd` + rebuild |
| Sai IDR constant | Wrong file served | Match `IDR_*` với file đúng |
| CSP block external font | Font không hiện | Override `FontSrc` |
| Inline `<script>` không có nonce | CSP block | Move script ra file riêng hoặc allow unsafe-inline (không khuyến nghị) |
| `loadTimeData.getString` cho key không exist | Throw runtime error | Add key trong C++ trước khi JS dùng |
| Wrong CSP override khi extending | Override toàn bộ thay vì append | Đọc kỹ CSP semantics |

## Real example — full setup cho `chrome://samsung-quick-settings`

```cpp
// samsung_quick_settings_ui.h
#pragma once
#include "ui/webui/mojo_web_ui_controller.h"
#include "samsung/browser/ui/webui/quick_settings.mojom.h"

class SamsungQuickSettingsUI 
    : public ui::MojoWebUIController,
      public samsung::quick_settings::mojom::QuickSettingsHandlerFactory {
 public:
  explicit SamsungQuickSettingsUI(content::WebUI* web_ui);
  ~SamsungQuickSettingsUI() override;
  
  void BindInterface(
      mojo::PendingReceiver<samsung::quick_settings::mojom::QuickSettingsHandlerFactory> receiver);
 
 private:
  void CreateHandler(
      mojo::PendingRemote<samsung::quick_settings::mojom::QuickSettingsPage> page,
      mojo::PendingReceiver<samsung::quick_settings::mojom::QuickSettingsHandler> handler) override;
  
  std::unique_ptr<SamsungQuickSettingsHandler> handler_;
  mojo::Receiver<samsung::quick_settings::mojom::QuickSettingsHandlerFactory> factory_receiver_{this};
  
  WEB_UI_CONTROLLER_TYPE_DECL();
};
```

```cpp
// samsung_quick_settings_ui.cc
#include "samsung/browser/ui/webui/samsung_quick_settings_ui.h"
#include "chrome/browser/profiles/profile.h"
#include "content/public/browser/web_ui.h"
#include "content/public/browser/web_ui_data_source.h"
#include "samsung/browser/grit/samsung_quick_settings_resources.h"
#include "samsung/browser/grit/samsung_quick_settings_resources_map.h"
#include "chrome/browser/ui/webui/webui_util.h"

WEB_UI_CONTROLLER_TYPE_IMPL(SamsungQuickSettingsUI)

SamsungQuickSettingsUI::SamsungQuickSettingsUI(content::WebUI* web_ui)
    : MojoWebUIController(web_ui) {
  
  Profile* profile = Profile::FromWebUI(web_ui);
  
  // 1. Create data source
  content::WebUIDataSource* source = 
      content::WebUIDataSource::CreateAndAdd(profile, "samsung-quick-settings");
  
  // 2. Register resources
  webui::SetupWebUIDataSource(
      source,
      base::make_span(kSamsungQuickSettingsResources, 
                      kSamsungQuickSettingsResourcesSize),
      IDR_SAMSUNG_QUICK_SETTINGS_INDEX_HTML);
  
  // 3. CSP — allow Mojo + samsung resources
  source->OverrideContentSecurityPolicy(
      network::mojom::CSPDirectiveName::ScriptSrc,
      "script-src chrome://resources chrome://samsung-quick-settings 'self';");
  
  // 4. Runtime data
  source->AddBoolean("hasSamsungAccount", 
      SamsungAccountService::GetForProfile(profile)->IsSignedIn());
  source->AddString("browserVersion", version_info::GetVersionNumber());
  source->AddLocalizedString("pageTitle", IDS_SAMSUNG_QS_PAGE_TITLE);
  source->AddLocalizedString("themeLight", IDS_SAMSUNG_QS_THEME_LIGHT);
  source->AddLocalizedString("themeDark", IDS_SAMSUNG_QS_THEME_DARK);
}

void SamsungQuickSettingsUI::BindInterface(
    mojo::PendingReceiver<samsung::quick_settings::mojom::QuickSettingsHandlerFactory> receiver) {
  factory_receiver_.Bind(std::move(receiver));
}

void SamsungQuickSettingsUI::CreateHandler(
    mojo::PendingRemote<samsung::quick_settings::mojom::QuickSettingsPage> page,
    mojo::PendingReceiver<samsung::quick_settings::mojom::QuickSettingsHandler> handler) {
  handler_ = std::make_unique<SamsungQuickSettingsHandler>(
      std::move(handler), std::move(page), Profile::FromWebUI(web_ui()));
}
```

```xml
<!-- samsung/browser/resources/samsung_quick_settings/samsung_quick_settings_resources.grd -->
<?xml version="1.0" encoding="UTF-8"?>
<grit-part>
  <includes>
    <include name="IDR_SAMSUNG_QUICK_SETTINGS_INDEX_HTML" 
             file="index.html" type="BINDATA" />
    <include name="IDR_SAMSUNG_QUICK_SETTINGS_APP_JS" 
             file="quick_settings_app.js" type="BINDATA" />
    <include name="IDR_SAMSUNG_QUICK_SETTINGS_BROWSER_PROXY_JS" 
             file="browser_proxy.js" type="BINDATA" />
    <include name="IDR_SAMSUNG_QUICK_SETTINGS_MOJOM_WEBUI_JS"
             file="${root_gen_dir}/samsung/browser/ui/webui/quick_settings.mojom-webui.js"
             use_base_dir="false" type="BINDATA" />
  </includes>
</grit-part>
```

## Tóm tắt bài 3

- **`WebUIDataSource`** = registry resources cho 1 host (`chrome://settings`, `samsung://...`).
- Resources không qua network — load từ binary qua **`.pak`** file.
- **`.grd`** XML file định nghĩa resources, generate `IDR_*` constants.
- **`chrome://resources/`** = shared resources (Lit, Polymer, cr-*, utils).
- **`webui::SetupWebUIDataSource`** helper cho 90% case.
- **`source->AddBoolean/String/etc`** inject data vào `loadTimeData` (xem bài 5).
- **CSP** strict mặc định, override khi cần thêm domains.

**Bài kế tiếp** → [Bài 4: cr-* elements library — chi tiết](04-cr-elements-library.md)
