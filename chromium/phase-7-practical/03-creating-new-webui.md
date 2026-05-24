# Bài 3: Tạo WebUI page mới từ đầu — step by step

Đây là **bài tâm điểm** của khoá. Sau bài này, bạn có thể tạo một WebUI page mới hoàn chỉnh trong Samsung Browser: URL `samsung://my-feature`, hiển thị data từ native, có thể save settings, đầy đủ i18n và testing.

Bài này đi tuần tự với **checklist 12 bước**. Hoàn thành theo thứ tự — mỗi bước build trên bước trước.

## Mục tiêu — `samsung://quick-launcher`

Để cụ thể, ta sẽ build `samsung://quick-launcher`:
- Hiển thị danh sách "quick launch apps" (URL shortcuts).
- User có thể add/edit/delete.
- Sync với native shortcut store.
- I18n đầy đủ.
- Có dialog confirm khi delete.

## Checklist 12 bước

```text
□ Bước  1: Decide URL scheme + host
□ Bước  2: Tạo file structure (folder + files)
□ Bước  3: Define .mojom interface
□ Bước  4: Implement C++ WebUIController
□ Bước  5: Implement C++ PageHandler
□ Bước  6: Register URL scheme trong factory
□ Bước  7: Tạo .grd + .grdp files
□ Bước  8: Tạo HTML entry point
□ Bước  9: Tạo BrowserProxy (JS/TS)
□ Bước 10: Tạo root Polymer component
□ Bước 11: Update BUILD.gn
□ Bước 12: Verify + test
```

## Bước 1: URL scheme + host

Samsung Browser thường dùng `samsung://` cho internal pages. Host = tên feature kebab-case:

```text
samsung://quick-launcher
        ▲       ▲
        scheme  host (= "quick-launcher")
```

Define constant ở **shared location**:

```cpp
// samsung/common/samsung_url_constants.h
namespace samsung {
constexpr char kSamsungUIScheme[]                  = "samsung";
constexpr char kSamsungQuickLauncherHost[]         = "quick-launcher";
constexpr char kSamsungQuickLauncherURL[]          = "samsung://quick-launcher/";
}  // namespace samsung
```

## Bước 2: File structure

Tạo các folder/file sau:

```text
samsung/
├── common/
│   └── samsung_url_constants.h               ← Step 1 đã thêm
│
├── browser/
│   ├── ui/webui/
│   │   └── quick_launcher/
│   │       ├── BUILD.gn
│   │       ├── quick_launcher.mojom          ← Step 3
│   │       ├── quick_launcher_ui.h           ← Step 4
│   │       ├── quick_launcher_ui.cc
│   │       ├── quick_launcher_page_handler.h  ← Step 5
│   │       └── quick_launcher_page_handler.cc
│   │
│   ├── resources/
│   │   └── quick_launcher/
│   │       ├── BUILD.gn
│   │       ├── quick_launcher_resources.grd  ← Step 7
│   │       ├── quick_launcher_strings.grdp
│   │       ├── quick_launcher.html           ← Step 8
│   │       ├── quick_launcher.ts             ← Root component
│   │       ├── browser_proxy.ts              ← Step 9
│   │       └── icons/
│   │           └── default_icon.svg
│
└── chrome_browser/ui/webui/
    └── samsung_web_ui_controller_factory.cc  ← Step 6 (register)
```

## Bước 3: Define `.mojom` interface

`samsung/browser/ui/webui/quick_launcher/quick_launcher.mojom`:

```mojom
module samsung.quick_launcher.mojom;

import "url/mojom/url.mojom";

// Data structures
struct QuickLaunchApp {
  string id;          // Unique ID
  string name;        // Display name
  url.mojom.Url url;  // URL to open
  string? icon_url;   // Optional favicon
  int32 position;     // Display order
};

// Interfaces

// C++ → JS push notifications
interface QuickLauncherPage {
  // Khi data thay đổi (add/edit/delete từ source khác)
  OnAppsChanged(array<QuickLaunchApp> apps);
};

// JS → C++ requests
interface QuickLauncherPageHandler {
  // Read
  GetApps() => (array<QuickLaunchApp> apps);
  
  // Write
  AddApp(string name, url.mojom.Url url) 
      => (bool success, QuickLaunchApp? new_app);
  EditApp(string id, string new_name, url.mojom.Url new_url) 
      => (bool success);
  DeleteApp(string id) => (bool success);
  ReorderApps(array<string> id_order) => (bool success);
  
  // Launch
  LaunchApp(string id);
};

// Factory để bootstrap connection
interface QuickLauncherPageHandlerFactory {
  CreatePageHandler(
      pending_remote<QuickLauncherPage> page,
      pending_receiver<QuickLauncherPageHandler> handler
  );
};
```

## Bước 4: C++ WebUIController

`quick_launcher_ui.h`:

```cpp
#ifndef SAMSUNG_BROWSER_UI_WEBUI_QUICK_LAUNCHER_QUICK_LAUNCHER_UI_H_
#define SAMSUNG_BROWSER_UI_WEBUI_QUICK_LAUNCHER_QUICK_LAUNCHER_UI_H_

#include "samsung/browser/ui/webui/quick_launcher/quick_launcher.mojom.h"
#include "ui/webui/mojo_web_ui_controller.h"
#include "mojo/public/cpp/bindings/pending_receiver.h"
#include "mojo/public/cpp/bindings/receiver.h"

namespace samsung {

class QuickLauncherPageHandler;

class QuickLauncherUI : public ui::MojoWebUIController,
                       public quick_launcher::mojom::QuickLauncherPageHandlerFactory {
 public:
  explicit QuickLauncherUI(content::WebUI* web_ui);
  ~QuickLauncherUI() override;
  
  QuickLauncherUI(const QuickLauncherUI&) = delete;
  QuickLauncherUI& operator=(const QuickLauncherUI&) = delete;
  
  // Mojo binding entry point (called by Chromium WebUI framework)
  void BindInterface(
      mojo::PendingReceiver<
          quick_launcher::mojom::QuickLauncherPageHandlerFactory> receiver);
  
 private:
  // QuickLauncherPageHandlerFactory implementation
  void CreatePageHandler(
      mojo::PendingRemote<quick_launcher::mojom::QuickLauncherPage> page,
      mojo::PendingReceiver<quick_launcher::mojom::QuickLauncherPageHandler>
          receiver) override;
  
  std::unique_ptr<QuickLauncherPageHandler> handler_;
  mojo::Receiver<quick_launcher::mojom::QuickLauncherPageHandlerFactory>
      factory_receiver_{this};
  
  WEB_UI_CONTROLLER_TYPE_DECL();
};

}  // namespace samsung

#endif  // SAMSUNG_BROWSER_UI_WEBUI_QUICK_LAUNCHER_QUICK_LAUNCHER_UI_H_
```

`quick_launcher_ui.cc`:

```cpp
#include "samsung/browser/ui/webui/quick_launcher/quick_launcher_ui.h"

#include "samsung/browser/grit/samsung_quick_launcher_resources.h"
#include "samsung/browser/grit/samsung_quick_launcher_resources_map.h"
#include "samsung/browser/ui/webui/quick_launcher/quick_launcher_page_handler.h"
#include "samsung/common/samsung_url_constants.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/webui/webui_util.h"
#include "content/public/browser/web_ui.h"
#include "content/public/browser/web_ui_data_source.h"

namespace samsung {

WEB_UI_CONTROLLER_TYPE_IMPL(QuickLauncherUI)

QuickLauncherUI::QuickLauncherUI(content::WebUI* web_ui)
    : ui::MojoWebUIController(web_ui) {
  
  Profile* profile = Profile::FromWebUI(web_ui);
  
  // 1. Create WebUI data source
  content::WebUIDataSource* source = content::WebUIDataSource::CreateAndAdd(
      profile, kSamsungQuickLauncherHost);
  
  // 2. Register resources (HTML, JS, CSS from .grd)
  webui::SetupWebUIDataSource(
      source,
      base::make_span(kSamsungQuickLauncherResources,
                      kSamsungQuickLauncherResourcesSize),
      IDR_SAMSUNG_QUICK_LAUNCHER_QUICK_LAUNCHER_HTML);
  
  // 3. CSP — allow chrome://resources for shared utilities
  source->OverrideContentSecurityPolicy(
      network::mojom::CSPDirectiveName::ScriptSrc,
      "script-src chrome://resources chrome://quick-launcher 'self';");
  
  // 4. Inject runtime data (optional)
  source->AddBoolean("isDarkModeEnabled", false);  // Stub
  source->AddString("samsungVersion", "1.0.0");
  
  // 5. Add localized strings (more on this in step 7)
  static constexpr webui::LocalizedString kStrings[] = {
      {"pageTitle", IDS_SAMSUNG_QUICK_LAUNCHER_TITLE},
      {"addButton", IDS_SAMSUNG_QUICK_LAUNCHER_ADD_BUTTON},
      {"editButton", IDS_SAMSUNG_QUICK_LAUNCHER_EDIT_BUTTON},
      {"deleteButton", IDS_SAMSUNG_QUICK_LAUNCHER_DELETE_BUTTON},
      {"emptyState", IDS_SAMSUNG_QUICK_LAUNCHER_EMPTY_STATE},
      {"deleteConfirm", IDS_SAMSUNG_QUICK_LAUNCHER_DELETE_CONFIRM},
  };
  source->AddLocalizedStrings(kStrings);
}

QuickLauncherUI::~QuickLauncherUI() = default;

void QuickLauncherUI::BindInterface(
    mojo::PendingReceiver<
        quick_launcher::mojom::QuickLauncherPageHandlerFactory> receiver) {
  factory_receiver_.reset();
  factory_receiver_.Bind(std::move(receiver));
}

void QuickLauncherUI::CreatePageHandler(
    mojo::PendingRemote<quick_launcher::mojom::QuickLauncherPage> page,
    mojo::PendingReceiver<quick_launcher::mojom::QuickLauncherPageHandler>
        receiver) {
  handler_ = std::make_unique<QuickLauncherPageHandler>(
      std::move(receiver), 
      std::move(page),
      Profile::FromWebUI(web_ui()));
}

}  // namespace samsung
```

## Bước 5: C++ PageHandler

`quick_launcher_page_handler.h`:

```cpp
#ifndef SAMSUNG_BROWSER_UI_WEBUI_QUICK_LAUNCHER_QUICK_LAUNCHER_PAGE_HANDLER_H_
#define SAMSUNG_BROWSER_UI_WEBUI_QUICK_LAUNCHER_QUICK_LAUNCHER_PAGE_HANDLER_H_

#include "samsung/browser/ui/webui/quick_launcher/quick_launcher.mojom.h"
#include "mojo/public/cpp/bindings/receiver.h"
#include "mojo/public/cpp/bindings/remote.h"

class Profile;

namespace samsung {

class QuickLauncherPageHandler
    : public quick_launcher::mojom::QuickLauncherPageHandler {
 public:
  QuickLauncherPageHandler(
      mojo::PendingReceiver<quick_launcher::mojom::QuickLauncherPageHandler>
          receiver,
      mojo::PendingRemote<quick_launcher::mojom::QuickLauncherPage> page,
      Profile* profile);
  ~QuickLauncherPageHandler() override;
  
  // quick_launcher::mojom::QuickLauncherPageHandler implementation
  void GetApps(GetAppsCallback callback) override;
  
  void AddApp(const std::string& name,
              const GURL& url,
              AddAppCallback callback) override;
  
  void EditApp(const std::string& id,
               const std::string& new_name,
               const GURL& new_url,
               EditAppCallback callback) override;
  
  void DeleteApp(const std::string& id, DeleteAppCallback callback) override;
  
  void ReorderApps(const std::vector<std::string>& id_order,
                   ReorderAppsCallback callback) override;
  
  void LaunchApp(const std::string& id) override;
  
 private:
  void NotifyAppsChanged();
  
  Profile* profile_;
  mojo::Receiver<quick_launcher::mojom::QuickLauncherPageHandler> receiver_;
  mojo::Remote<quick_launcher::mojom::QuickLauncherPage> page_;
};

}  // namespace samsung

#endif  // SAMSUNG_BROWSER_UI_WEBUI_QUICK_LAUNCHER_QUICK_LAUNCHER_PAGE_HANDLER_H_
```

`quick_launcher_page_handler.cc`:

```cpp
#include "samsung/browser/ui/webui/quick_launcher/quick_launcher_page_handler.h"

#include "base/uuid.h"
#include "chrome/browser/profiles/profile.h"
#include "components/prefs/pref_service.h"
#include "url/gurl.h"

namespace samsung {

namespace {

// Read/write apps qua PrefService (real implementation có thể dùng DB)
constexpr char kPrefQuickLaunchApps[] = "samsung.quick_launcher.apps";

std::vector<quick_launcher::mojom::QuickLaunchAppPtr> LoadApps(
    Profile* profile) {
  std::vector<quick_launcher::mojom::QuickLaunchAppPtr> apps;
  
  const base::Value::List& list = 
      profile->GetPrefs()->GetList(kPrefQuickLaunchApps);
  
  for (const auto& item : list) {
    if (!item.is_dict()) continue;
    const auto& dict = item.GetDict();
    
    auto app = quick_launcher::mojom::QuickLaunchApp::New();
    app->id = dict.FindString("id") ? *dict.FindString("id") : "";
    app->name = dict.FindString("name") ? *dict.FindString("name") : "";
    if (const std::string* url_str = dict.FindString("url")) {
      app->url = GURL(*url_str);
    }
    if (const std::string* icon = dict.FindString("icon_url")) {
      app->icon_url = *icon;
    }
    app->position = dict.FindInt("position").value_or(0);
    apps.push_back(std::move(app));
  }
  
  return apps;
}

void SaveApps(Profile* profile,
              const std::vector<quick_launcher::mojom::QuickLaunchAppPtr>& apps) {
  base::Value::List list;
  for (const auto& app : apps) {
    base::Value::Dict dict;
    dict.Set("id", app->id);
    dict.Set("name", app->name);
    dict.Set("url", app->url.spec());
    if (app->icon_url) dict.Set("icon_url", *app->icon_url);
    dict.Set("position", app->position);
    list.Append(std::move(dict));
  }
  profile->GetPrefs()->SetList(kPrefQuickLaunchApps, std::move(list));
}

}  // namespace

QuickLauncherPageHandler::QuickLauncherPageHandler(
    mojo::PendingReceiver<quick_launcher::mojom::QuickLauncherPageHandler>
        receiver,
    mojo::PendingRemote<quick_launcher::mojom::QuickLauncherPage> page,
    Profile* profile)
    : profile_(profile),
      receiver_(this, std::move(receiver)),
      page_(std::move(page)) {}

QuickLauncherPageHandler::~QuickLauncherPageHandler() = default;

void QuickLauncherPageHandler::GetApps(GetAppsCallback callback) {
  std::move(callback).Run(LoadApps(profile_));
}

void QuickLauncherPageHandler::AddApp(const std::string& name,
                                      const GURL& url,
                                      AddAppCallback callback) {
  if (name.empty() || !url.is_valid()) {
    std::move(callback).Run(/*success=*/false, nullptr);
    return;
  }
  
  auto apps = LoadApps(profile_);
  auto new_app = quick_launcher::mojom::QuickLaunchApp::New();
  new_app->id = base::Uuid::GenerateRandomV4().AsLowercaseString();
  new_app->name = name;
  new_app->url = url;
  new_app->position = static_cast<int>(apps.size());
  
  auto app_clone = new_app.Clone();
  apps.push_back(std::move(new_app));
  SaveApps(profile_, apps);
  
  std::move(callback).Run(/*success=*/true, std::move(app_clone));
  NotifyAppsChanged();
}

void QuickLauncherPageHandler::EditApp(const std::string& id,
                                       const std::string& new_name,
                                       const GURL& new_url,
                                       EditAppCallback callback) {
  auto apps = LoadApps(profile_);
  bool found = false;
  for (auto& app : apps) {
    if (app->id == id) {
      app->name = new_name;
      app->url = new_url;
      found = true;
      break;
    }
  }
  
  if (!found) {
    std::move(callback).Run(/*success=*/false);
    return;
  }
  
  SaveApps(profile_, apps);
  std::move(callback).Run(/*success=*/true);
  NotifyAppsChanged();
}

void QuickLauncherPageHandler::DeleteApp(const std::string& id,
                                         DeleteAppCallback callback) {
  auto apps = LoadApps(profile_);
  auto it = std::find_if(apps.begin(), apps.end(),
                         [&id](const auto& app) { return app->id == id; });
  
  if (it == apps.end()) {
    std::move(callback).Run(/*success=*/false);
    return;
  }
  
  apps.erase(it);
  SaveApps(profile_, apps);
  std::move(callback).Run(/*success=*/true);
  NotifyAppsChanged();
}

void QuickLauncherPageHandler::ReorderApps(
    const std::vector<std::string>& id_order,
    ReorderAppsCallback callback) {
  // Implementation: reorder apps theo id_order
  // ...
  std::move(callback).Run(/*success=*/true);
  NotifyAppsChanged();
}

void QuickLauncherPageHandler::LaunchApp(const std::string& id) {
  auto apps = LoadApps(profile_);
  for (const auto& app : apps) {
    if (app->id == id) {
      // Open URL in new tab
      // (Need NavigationController access — simplified here)
      // chrome::AddTabAt(...)
      return;
    }
  }
}

void QuickLauncherPageHandler::NotifyAppsChanged() {
  if (page_.is_bound()) {
    page_->OnAppsChanged(LoadApps(profile_));
  }
}

}  // namespace samsung
```

## Bước 6: Register URL trong factory

```cpp
// samsung_web_ui_controller_factory.cc
#include "samsung/browser/ui/webui/quick_launcher/quick_launcher_ui.h"
#include "samsung/common/samsung_url_constants.h"

WebUIController* SamsungWebUIControllerFactory::CreateWebUIControllerForURL(
    WebUI* web_ui, const GURL& url) const {
  
  // Existing handlers...
  
  if (url.host() == samsung::kSamsungQuickLauncherHost) {
    return new samsung::QuickLauncherUI(web_ui);
  }
  
  return nullptr;
}

WebUI::TypeID SamsungWebUIControllerFactory::GetWebUIType(
    BrowserContext* browser_context, const GURL& url) const {
  
  // Existing types...
  
  if (url.host() == samsung::kSamsungQuickLauncherHost) {
    return &kSamsungQuickLauncherUIType;
  }
  
  return WebUI::kNoWebUI;
}
```

## Bước 7: `.grd` + `.grdp` files

`samsung/browser/resources/quick_launcher/quick_launcher_resources.grd`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<grit-part>
  <includes>
    <include name="IDR_SAMSUNG_QUICK_LAUNCHER_QUICK_LAUNCHER_HTML" 
             file="quick_launcher.html" type="BINDATA" />
    <include name="IDR_SAMSUNG_QUICK_LAUNCHER_QUICK_LAUNCHER_JS" 
             file="quick_launcher.js" type="BINDATA" />
    <include name="IDR_SAMSUNG_QUICK_LAUNCHER_BROWSER_PROXY_JS" 
             file="browser_proxy.js" type="BINDATA" />
    <include name="IDR_SAMSUNG_QUICK_LAUNCHER_MOJOM_WEBUI_JS"
             file="${root_gen_dir}/samsung/browser/ui/webui/quick_launcher/quick_launcher.mojom-webui.js"
             use_base_dir="false" type="BINDATA" />
  </includes>
</grit-part>
```

Strings: `samsung/browser/strings/quick_launcher_strings.grdp`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<grit-part>
  <message name="IDS_SAMSUNG_QUICK_LAUNCHER_TITLE" 
           desc="Title of the Samsung Quick Launcher page">
    Quick Launcher
  </message>
  
  <message name="IDS_SAMSUNG_QUICK_LAUNCHER_ADD_BUTTON" 
           desc="Label of the Add app button">
    Add App
  </message>
  
  <message name="IDS_SAMSUNG_QUICK_LAUNCHER_EDIT_BUTTON" 
           desc="Label of the Edit button">
    Edit
  </message>
  
  <message name="IDS_SAMSUNG_QUICK_LAUNCHER_DELETE_BUTTON" 
           desc="Label of the Delete button">
    Delete
  </message>
  
  <message name="IDS_SAMSUNG_QUICK_LAUNCHER_EMPTY_STATE" 
           desc="Text shown when no apps are added">
    No quick launch apps. Click 'Add App' to start.
  </message>
  
  <message name="IDS_SAMSUNG_QUICK_LAUNCHER_DELETE_CONFIRM" 
           desc="Confirmation message for deleting an app">
    Delete <ph name="APP_NAME">$1<ex>Google</ex></ph>?
  </message>
</grit-part>
```

## Bước 8: HTML entry point

`samsung/browser/resources/quick_launcher/quick_launcher.html`:

```html
<!doctype html>
<html dir="$i18n{textDirection}" lang="$i18n{language}">
<head>
  <meta charset="utf-8">
  <title>$i18n{pageTitle}</title>
  
  <script type="importmap">
    {
      "imports": {
        "chrome://resources/": "//resources/"
      }
    }
  </script>
</head>
<body>
  <quick-launcher-app></quick-launcher-app>
  
  <script type="module" src="quick_launcher.js"></script>
</body>
</html>
```

## Bước 9: BrowserProxy (TypeScript)

`browser_proxy.ts`:

```typescript
import {
  QuickLauncherPageHandlerFactory,
  QuickLauncherPageHandlerRemote,
  QuickLauncherPageCallbackRouter,
  QuickLaunchApp,
} from './quick_launcher.mojom-webui.js';

export class BrowserProxy {
  handler: QuickLauncherPageHandlerRemote;
  callbackRouter: QuickLauncherPageCallbackRouter;
  
  constructor() {
    this.handler = new QuickLauncherPageHandlerRemote();
    this.callbackRouter = new QuickLauncherPageCallbackRouter();
    
    const factory = QuickLauncherPageHandlerFactory.getRemote();
    factory.createPageHandler(
      this.callbackRouter.$.bindNewPipeAndPassRemote(),
      this.handler.$.bindNewPipeAndPassReceiver(),
    );
  }
  
  // Singleton
  private static instance_: BrowserProxy|null = null;
  
  static getInstance(): BrowserProxy {
    return BrowserProxy.instance_ || 
        (BrowserProxy.instance_ = new BrowserProxy());
  }
  
  static setInstance(instance: BrowserProxy): void {
    BrowserProxy.instance_ = instance;
  }
}

export type {QuickLaunchApp};
```

## Bước 10: Root Polymer component

`quick_launcher.ts`:

```typescript
import 'chrome://resources/cr_elements/cr_button/cr_button.js';
import 'chrome://resources/cr_elements/cr_dialog/cr_dialog.js';
import 'chrome://resources/cr_elements/cr_input/cr_input.js';
import 'chrome://resources/cr_elements/cr_icon_button/cr_icon_button.js';

import {PolymerElement, html} from 'chrome://resources/polymer/v3_0/polymer/polymer-element.js';
import {I18nMixin} from 'chrome://resources/cr_elements/i18n_mixin.js';

import {BrowserProxy, QuickLaunchApp} from './browser_proxy.js';

const Base = I18nMixin(PolymerElement);

interface QuickLauncherAppElement {
  $: {
    addDialog: HTMLElement & {showModal: () => void; close: () => void};
    deleteDialog: HTMLElement & {showModal: () => void; close: () => void};
    nameInput: HTMLElement & {value: string};
    urlInput: HTMLElement & {value: string};
  };
}

class QuickLauncherAppElement extends Base {
  static get is() { return 'quick-launcher-app'; }
  
  static get template() {
    return html`
      <style>
        :host {
          display: block;
          padding: 24px;
          font-family: 'Roboto', sans-serif;
          color: var(--cr-primary-text-color);
        }
        h1 {
          font-size: 24px;
          margin: 0 0 16px 0;
        }
        .app-list {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 16px;
          margin-top: 16px;
        }
        .app-card {
          background: var(--cr-card-background-color);
          border-radius: 8px;
          padding: 16px;
          text-align: center;
          cursor: pointer;
          transition: transform 0.2s;
          position: relative;
        }
        .app-card:hover {
          transform: translateY(-2px);
        }
        .app-icon {
          width: 48px;
          height: 48px;
          border-radius: 8px;
          background: #f0f0f0;
          margin: 0 auto 8px;
        }
        .app-name {
          font-size: 13px;
          font-weight: 500;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .actions {
          position: absolute;
          top: 4px;
          right: 4px;
          display: none;
        }
        .app-card:hover .actions {
          display: flex;
        }
        .empty {
          padding: 40px;
          text-align: center;
          color: var(--cr-secondary-text-color);
        }
        .form-row {
          margin-bottom: 16px;
        }
      </style>
      
      <h1>[[i18n('pageTitle')]]</h1>
      
      <cr-button class="action-button" on-click="onAddClick_">
        [[i18n('addButton')]]
      </cr-button>
      
      <!-- Empty state -->
      <template is="dom-if" if="[[isEmpty_]]">
        <p class="empty">[[i18n('emptyState')]]</p>
      </template>
      
      <!-- App grid -->
      <template is="dom-if" if="[[!isEmpty_]]">
        <div class="app-list">
          <template is="dom-repeat" items="[[apps_]]" as="app">
            <div class="app-card" on-click="onLaunch_">
              <div class="app-icon"></div>
              <div class="app-name">[[app.name]]</div>
              
              <div class="actions" on-click="stopPropagation_">
                <cr-icon-button 
                    iron-icon="cr:create"
                    title="[[i18n('editButton')]]"
                    on-click="onEdit_">
                </cr-icon-button>
                <cr-icon-button 
                    iron-icon="cr:delete"
                    title="[[i18n('deleteButton')]]"
                    on-click="onDeleteClick_">
                </cr-icon-button>
              </div>
            </div>
          </template>
        </div>
      </template>
      
      <!-- Add/Edit Dialog -->
      <cr-dialog id="addDialog">
        <div slot="title">[[dialogTitle_]]</div>
        <div slot="body">
          <div class="form-row">
            <cr-input 
                id="nameInput"
                label="App Name"
                value="{{newAppName_}}"
                autofocus>
            </cr-input>
          </div>
          <div class="form-row">
            <cr-input 
                id="urlInput"
                label="URL"
                type="url"
                value="{{newAppUrl_}}"
                placeholder="https://example.com">
            </cr-input>
          </div>
        </div>
        <div slot="button-container">
          <cr-button class="cancel-button" on-click="onCancelAdd_">
            Cancel
          </cr-button>
          <cr-button 
              class="action-button"
              disabled$="[[!canSubmit_]]"
              on-click="onSubmitAdd_">
            [[submitButtonLabel_]]
          </cr-button>
        </div>
      </cr-dialog>
      
      <!-- Delete Confirm Dialog -->
      <cr-dialog id="deleteDialog">
        <div slot="title">[[i18n('deleteButton')]]</div>
        <div slot="body">
          [[i18n('deleteConfirm', appToDelete_.name)]]
        </div>
        <div slot="button-container">
          <cr-button class="cancel-button" on-click="onCancelDelete_">
            Cancel
          </cr-button>
          <cr-button class="action-button" on-click="onConfirmDelete_">
            Delete
          </cr-button>
        </div>
      </cr-dialog>
    `;
  }
  
  static get properties() {
    return {
      apps_: {
        type: Array,
        value: () => [],
      },
      isEmpty_: {
        type: Boolean,
        computed: 'computeEmpty_(apps_.length)',
      },
      newAppName_: { type: String, value: '' },
      newAppUrl_: { type: String, value: '' },
      editingAppId_: { type: String, value: '' },
      appToDelete_: { type: Object, value: null },
      canSubmit_: {
        type: Boolean,
        computed: 'computeCanSubmit_(newAppName_, newAppUrl_)',
      },
      dialogTitle_: {
        type: String,
        computed: 'computeDialogTitle_(editingAppId_)',
      },
      submitButtonLabel_: {
        type: String,
        computed: 'computeSubmitLabel_(editingAppId_)',
      },
    };
  }
  
  private proxy_!: BrowserProxy;
  private listenerIds_: number[] = [];
  private apps_!: QuickLaunchApp[];
  private newAppName_!: string;
  private newAppUrl_!: string;
  private editingAppId_!: string;
  private appToDelete_!: QuickLaunchApp|null;
  
  override ready() {
    super.ready();
    this.proxy_ = BrowserProxy.getInstance();
    
    // Subscribe push notifications
    this.listenerIds_.push(
      this.proxy_.callbackRouter.onAppsChanged.addListener(
          this.onAppsChanged_.bind(this))
    );
    
    this.loadApps_();
  }
  
  override disconnectedCallback() {
    super.disconnectedCallback();
    this.listenerIds_.forEach(
        id => this.proxy_.callbackRouter.removeListener(id));
    this.listenerIds_ = [];
  }
  
  // Mojo callback when apps changed from C++ side
  private onAppsChanged_(apps: QuickLaunchApp[]) {
    this.apps_ = apps;
  }
  
  private async loadApps_() {
    const {apps} = await this.proxy_.handler.getApps();
    this.apps_ = apps;
  }
  
  // Computed
  private computeEmpty_(length: number): boolean {
    return length === 0;
  }
  
  private computeCanSubmit_(name: string, url: string): boolean {
    return !!name && !!url && /^https?:\/\//.test(url);
  }
  
  private computeDialogTitle_(editingId: string): string {
    return editingId ? 'Edit App' : 'Add App';
  }
  
  private computeSubmitLabel_(editingId: string): string {
    return editingId ? 'Save' : 'Add';
  }
  
  // Event handlers
  private onAddClick_() {
    this.newAppName_ = '';
    this.newAppUrl_ = '';
    this.editingAppId_ = '';
    this.$.addDialog.showModal();
  }
  
  private onEdit_(e: any) {
    const app: QuickLaunchApp = e.model.app;
    this.newAppName_ = app.name;
    this.newAppUrl_ = app.url.url;
    this.editingAppId_ = app.id;
    this.$.addDialog.showModal();
  }
  
  private async onSubmitAdd_() {
    const url = {url: this.newAppUrl_};
    
    if (this.editingAppId_) {
      // Edit
      await this.proxy_.handler.editApp(
          this.editingAppId_, this.newAppName_, url);
    } else {
      // Add
      await this.proxy_.handler.addApp(this.newAppName_, url);
    }
    
    this.$.addDialog.close();
    this.loadApps_();  // Refresh
  }
  
  private onCancelAdd_() {
    this.$.addDialog.close();
  }
  
  private onDeleteClick_(e: any) {
    this.appToDelete_ = e.model.app;
    this.$.deleteDialog.showModal();
  }
  
  private async onConfirmDelete_() {
    if (this.appToDelete_) {
      await this.proxy_.handler.deleteApp(this.appToDelete_.id);
    }
    this.$.deleteDialog.close();
    this.loadApps_();
  }
  
  private onCancelDelete_() {
    this.$.deleteDialog.close();
  }
  
  private onLaunch_(e: any) {
    const app: QuickLaunchApp = e.model.app;
    this.proxy_.handler.launchApp(app.id);
  }
  
  private stopPropagation_(e: Event) {
    e.stopPropagation();
  }
}

customElements.define(QuickLauncherAppElement.is, QuickLauncherAppElement);
```

## Bước 11: BUILD.gn

```gn
# samsung/browser/ui/webui/quick_launcher/BUILD.gn

import("//mojo/public/tools/bindings/mojom.gni")
import("//tools/grit/preprocess_if_expr.gni")

# Mojo bindings
mojom("mojo_bindings") {
  sources = [ "quick_launcher.mojom" ]
  webui_module_path = "/"
  
  public_deps = [
    "//url/mojom:url_mojom_gurl",
  ]
}

# C++ implementation
source_set("quick_launcher_ui") {
  sources = [
    "quick_launcher_page_handler.cc",
    "quick_launcher_page_handler.h",
    "quick_launcher_ui.cc",
    "quick_launcher_ui.h",
  ]
  
  deps = [
    ":mojo_bindings",
    "//base",
    "//chrome/browser/profiles",
    "//components/prefs",
    "//content/public/browser",
    "//mojo/public/cpp/bindings",
    "//ui/webui",
    "//url",
  ]
  
  public_deps = [
    "//samsung/browser/resources/quick_launcher:resources",
  ]
}
```

```gn
# samsung/browser/resources/quick_launcher/BUILD.gn

import("//chrome/common/features.gni")
import("//tools/grit/grit_rule.gni")
import("//tools/typescript/ts_library.gni")
import("//ui/webui/resources/tools/build_webui.gni")

build_webui("build") {
  grd_prefix = "samsung_quick_launcher"
  
  static_files = [
    "quick_launcher.html",
  ]
  
  ts_files = [
    "quick_launcher.ts",
    "browser_proxy.ts",
  ]
  
  ts_deps = [
    "//samsung/browser/ui/webui/quick_launcher:mojo_bindings_ts",
    "//third_party/polymer/v3_0:library",
    "//ui/webui/resources/cr_elements:build_ts",
    "//ui/webui/resources/js:build_ts",
  ]
  
  webui_context_type = "trusted"
}
```

## Bước 12: Verify

Build:

```bash
cd ~/chromium/src
gn gen out/Default
autoninja -C out/Default chrome
```

Test:

```bash
out/Default/chrome --user-data-dir=/tmp/test-profile
```

Trong browser:
1. Mở URL: `samsung://quick-launcher` (hoặc `chrome://quick-launcher`).
2. Page render với title "Quick Launcher".
3. Click "Add App" → dialog hiện.
4. Nhập name + URL → submit → app xuất hiện trong grid.
5. Hover app → edit/delete buttons hiện.
6. Click delete → confirm dialog → confirm → app biến mất.

### DevTools

```text
Right-click trên page → Inspect (nếu developer build).
Hoặc: chrome://inspect → Other → Quick Launcher.
```

Console kiểm tra:
- Không có errors.
- Network không có failed loads.
- Application tab: xem session storage (nếu dùng).

## Common bugs khi tạo WebUI mới

| Bug | Nguyên nhân |
|---|---|
| Page 404 | Quên register URL trong factory |
| Resources không load | Sai .grd path, file không có trong .grd |
| Mojo "binding error" | Sai factory class, sai interface name |
| Strings không hiện | Quên `source->AddLocalizedString` |
| CSP block | Cần override CSP cho domain mới |
| Polymer "is not defined" | Quên import `@polymer/polymer/polymer-element.js` |
| `customElements.define` throws | Đã register tên trùng |
| Build error "no such target" | Thiếu deps trong BUILD.gn |

## Tóm tắt bài 3

12 bước tạo WebUI mới:

1. Decide URL `samsung://<host>`
2. File structure
3. `.mojom` interface
4. C++ `WebUIController`
5. C++ `PageHandler`
6. Register URL trong factory
7. `.grd` + `.grdp`
8. HTML entry point
9. JS/TS `BrowserProxy`
10. Polymer root component
11. `BUILD.gn`
12. Build + verify

Mỗi bước build trên bước trước — nếu lỡ stuck, check thứ tự + check missing import/dep.

**Bài kế tiếp** → [Bài 4: Testing WebUI](04-testing-webui.md)
