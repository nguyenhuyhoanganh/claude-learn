# Bài 3: Build System và Resources

## Tổng quan Build Pipeline

```
Source files                   Build outputs
─────────────────              ─────────────────
settings.mojom     →  mojom→   settings.mojom-webui.js (JS bindings)
                               settings.mojom.h         (C++ bindings)

settings_page.ts   →  tsc →   settings_page.js

settings_page.html →  tool →  settings_page.html.js    (TS module)

BUILD.gn           →  gn gen→  build.ninja
                   → ninja →   final bundle
```

---

## GN Build File cơ bản

```gn
# BUILD.gn cho một WebUI page

# JS/TS library
ts_library("settings_page_ts") {
  sources = [
    "settings_page.ts",
    "settings_browser_proxy.ts",
  ]
  deps = [
    # LitElement
    "//third_party/lit/v3_0:build_ts",

    # cr-* shared components
    "//ui/webui/resources/cr_elements/cr_button:build_ts",
    "//ui/webui/resources/cr_elements/cr_toggle:build_ts",

    # Mojo JS bindings (auto-generated từ .mojom)
    "//chrome/browser/ui/webui/settings:mojo_bindings_ts",
  ]
}

# HTML → TS wrapper
html_to_wrapper("html_wrapper_ts") {
  in_files = [ "settings_page.html" ]
}

# CSS → TS module
css_to_wrapper("css_wrapper_ts") {
  in_files = [ "settings_page.css" ]
}

# Mojo bindings generation
mojo_webui_js_bundle("mojo_bindings_ts") {
  mojo_files = [ "settings.mojom" ]
}
```

---

## TypeScript trong Chromium WebUI

Chromium WebUI dùng TypeScript (không phải plain JavaScript):

```typescript
// settings_browser_proxy.ts
import {SettingsPageHandlerRemote} from
    './settings.mojom-webui.js';

// Interface cho testing (có thể mock trong tests)
export interface SettingsBrowserProxy {
  getSettings(): Promise<{settings: Settings}>;
  setTheme(theme: string): void;
}

// Real implementation
export class SettingsBrowserProxyImpl implements SettingsBrowserProxy {
  private handler_: SettingsPageHandlerRemote;

  constructor() {
    this.handler_ = new SettingsPageHandlerRemote();
    // ... setup
  }

  getSettings() {
    return this.handler_.getSettings();
  }

  setTheme(theme: string) {
    this.handler_.setTheme(theme);
  }

  // Singleton
  static instance: SettingsBrowserProxy|null = null;

  static getInstance(): SettingsBrowserProxy {
    return SettingsBrowserProxyImpl.instance ||
        (SettingsBrowserProxyImpl.instance =
            new SettingsBrowserProxyImpl());
  }

  static setInstance(instance: SettingsBrowserProxy) {
    SettingsBrowserProxyImpl.instance = instance;
  }
}
```

---

## HTML to Wrapper

Trong Chromium WebUI, HTML templates được convert sang TypeScript modules:

```html
<!-- settings_page.html -->
<style include="shared-style settings-shared">
  :host { display: block; }
  .section { padding: 16px; }
</style>

<div class="container">
  <h1>[[i18n('settingsTitle')]]</h1>
</div>
```

Được convert thành `settings_page.html.ts`:

```typescript
// settings_page.html.ts (auto-generated)
import {html} from 'chrome://resources/lit/v3_0/lit.rollup.js';
import type {SettingsPageElement} from './settings_page.js';

export function getHtml(this: SettingsPageElement) {
  return html`
    <style>
      :host { display: block; }
      .section { padding: 16px; }
    </style>
    <div class="container">
      <h1>${this.i18n('settingsTitle')}</h1>
    </div>
  `;
}
```

---

## IDR Constants — Resource IDs

Resources được reference bằng integer IDs:

```cpp
// chrome/browser/resources/settings/resources.grd
// → Generates chrome/grit/settings_resources.h

// Trong C++:
#include "chrome/grit/settings_resources.h"

source->AddResourcePath("settings.html", IDR_SETTINGS_HTML);
source->AddResourcePath("settings_main.js", IDR_SETTINGS_MAIN_JS);
```

```gn
# BUILD.gn
grit("resources") {
  source = "settings_resources.grd"
  outputs = [
    "grit/settings_resources.h",
    "settings_resources.pak",
  ]
}
```

---

## Samsung Browser: Custom WebUI

Samsung Browser thêm custom WebUI pages trên top của Chromium:

```
Chromium code (upstream)
└── chrome/browser/resources/settings/
    └── [Chromium's settings page]

Samsung Browser additions
└── samsung/browser/resources/samsung_settings/
    ├── BUILD.gn
    ├── samsung_settings.html
    ├── samsung_settings_main.ts
    ├── samsung_settings_page.ts
    └── samsung_settings_browser_proxy.ts

└── samsung/browser/ui/webui/samsung_settings/
    ├── samsung_settings_ui.cc        ← WebUIController
    ├── samsung_settings_ui.h
    ├── samsung_settings_handler.cc   ← PageHandler (C++)
    ├── samsung_settings_handler.h
    └── samsung_settings.mojom        ← Interfaces
```

---

## Debugging WebUI Resources

```javascript
// Bật WebUI developer mode: chrome://flags/#debug-webui
// Cho phép hot-reload resources mà không cần rebuild

// Xem tất cả registered WebUI hosts:
// chrome://about → list all chrome:// URLs

// Inspect WebUI page:
// Right-click → Inspect (nếu được enable)
// hoặc: chrome://inspect → Other → [page name]

// Network panel trong DevTools:
// Xem requests tới chrome://resources/
// Xem Mojo messages (không visible mặc định)
```

---

## Checklist khi tạo WebUI page mới

```
□ Tạo .mojom file với PageHandlerFactory, PageHandler, Page interfaces
□ Tạo WebUIController (C++) kế thừa MojoWebUIController
□ Tạo PageHandler (C++) implement mojom
□ Register URL trong chrome_web_ui_controller_factory.cc
□ Tạo HTML entry point
□ Tạo JS/TS BrowserProxy
□ Tạo LitElement root component
□ Add resources vào .grd file
□ Update BUILD.gn
□ Add permission (nếu cần) trong content_security_policy
```

---

→ [Phase 5: Mojo IPC](../phase-5-mojo-ipc/01-mojo-overview.md)
