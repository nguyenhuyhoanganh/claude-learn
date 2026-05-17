# Bài 6: PrefService và Settings binding

Settings UI dạng `chrome://settings` cần đọc/ghi **preferences** (cài đặt) của user. Chromium có một subsystem riêng cho việc này gọi là **PrefService** (Preferences Service).

Bài này dạy:
- PrefService — cách Chromium lưu user preferences.
- Pref registration — declare pref ở C++.
- Binding pref với UI control (`cr-toggle`, `cr-radio-group`, etc.).
- `<settings-pref>` element — sync Polymer property với PrefService.
- Policy-controlled prefs — enterprise admin override.
- Pattern phổ biến trong Chromium WebUI.

## PrefService — kho lưu trữ preferences

**PrefService** là singleton trong Browser Process quản lý toàn bộ preferences của user:

```cpp
// Browser Process (C++)
class PrefService {
 public:
  // Read
  bool GetBoolean(const std::string& path) const;
  int GetInteger(const std::string& path) const;
  std::string GetString(const std::string& path) const;
  const base::Value::Dict& GetDict(const std::string& path) const;
  const base::Value::List& GetList(const std::string& path) const;
  
  // Write
  void SetBoolean(const std::string& path, bool value);
  void SetInteger(const std::string& path, int value);
  void SetString(const std::string& path, const std::string& value);
  
  // Listen for changes
  void AddPrefObserver(const std::string& path, PrefObserver* observer);
};
```

Preferences được lưu ở:
- **`~/.config/google-chrome/Default/Preferences`** (Linux JSON file).
- **`~/Library/Application Support/Google/Chrome/Default/Preferences`** (macOS).
- **`%LOCALAPPDATA%/Google/Chrome/User Data/Default/Preferences`** (Windows).

File JSON nhỏ, dễ đọc:
```json
{
  "browser": {
    "show_home_button": true,
    "home_page": "https://www.google.com"
  },
  "settings": {
    "dark_mode_enabled": false,
    "font_size": 14
  }
}
```

## Pref registration — declare trước khi dùng

Pref phải được **register** lúc browser startup. Không register = không tồn tại.

```cpp
// pref_names.h — define paths
namespace prefs {
constexpr char kDarkModeEnabled[] = "samsung.browser.dark_mode_enabled";
constexpr char kSamsungTheme[] = "samsung.browser.theme";
constexpr char kBlockThirdPartyCookies[] = "samsung.browser.block_third_party_cookies";
}

// chrome_browser_main_extra_parts_samsung.cc
void RegisterSamsungPrefs(PrefRegistrySimple* registry) {
  registry->RegisterBooleanPref(prefs::kDarkModeEnabled, false);
  registry->RegisterStringPref(prefs::kSamsungTheme, "auto");
  registry->RegisterBooleanPref(prefs::kBlockThirdPartyCookies, true);
}

// In browser startup:
RegisterSamsungPrefs(local_state_registry);
// OR for user prefs:
RegisterSamsungUserPrefs(profile_pref_registry);
```

Pref types:
- `RegisterBooleanPref(path, default_value)`
- `RegisterIntegerPref(path, default_value)`
- `RegisterDoublePref(path, default_value)`
- `RegisterStringPref(path, default_value)`
- `RegisterListPref(path)` (default empty list)
- `RegisterDictionaryPref(path)` (default empty dict)
- `RegisterFilePathPref(path, default_path)`

### Local state vs Profile prefs

Chromium có **2 PrefService instances**:

1. **Local state** — toàn browser, áp dụng cho tất cả profile (vd: browser language, last update time).
2. **Profile prefs** — per-profile (vd: user A có dark mode, user B không).

```cpp
// Local state
PrefService* local_state = g_browser_process->local_state();
bool browser_lang = local_state->GetString("intl.app_locale");

// Profile prefs (per-user)
PrefService* prefs = profile->GetPrefs();
bool dark_mode = prefs->GetBoolean(prefs::kDarkModeEnabled);
```

→ Settings page thường dùng **profile prefs** (per-user).

## C++ side — read/write pref from PageHandler

```cpp
// samsung_settings_handler.cc
class SamsungSettingsHandler : public mojom::SettingsHandler {
 public:
  SamsungSettingsHandler(
      mojo::PendingReceiver<mojom::SettingsHandler> receiver,
      Profile* profile)
      : receiver_(this, std::move(receiver)),
        profile_(profile) {
    // Listen pref changes
    pref_change_registrar_.Init(profile_->GetPrefs());
    pref_change_registrar_.Add(
        prefs::kDarkModeEnabled,
        base::BindRepeating(&SamsungSettingsHandler::OnDarkModeChanged,
                            base::Unretained(this)));
  }
  
  void GetSettings(GetSettingsCallback callback) override {
    auto settings = mojom::SamsungSettings::New();
    auto* prefs = profile_->GetPrefs();
    settings->dark_mode = prefs->GetBoolean(prefs::kDarkModeEnabled);
    settings->theme = prefs->GetString(prefs::kSamsungTheme);
    settings->block_third_party = 
        prefs->GetBoolean(prefs::kBlockThirdPartyCookies);
    std::move(callback).Run(std::move(settings));
  }
  
  void SetDarkMode(bool enabled) override {
    profile_->GetPrefs()->SetBoolean(prefs::kDarkModeEnabled, enabled);
  }
  
  void SetTheme(const std::string& theme) override {
    profile_->GetPrefs()->SetString(prefs::kSamsungTheme, theme);
  }
  
 private:
  void OnDarkModeChanged() {
    bool dark = profile_->GetPrefs()->GetBoolean(prefs::kDarkModeEnabled);
    // Push xuống JS qua Mojo
    page_->OnDarkModeChanged(dark);
  }
  
  Profile* profile_;
  PrefChangeRegistrar pref_change_registrar_;
  mojo::Receiver<mojom::SettingsHandler> receiver_;
  mojo::Remote<mojom::SettingsPage> page_;
};
```

Pattern:
1. Init `PrefChangeRegistrar` listen prefs cụ thể.
2. Khi pref đổi (qua bất kỳ source nào), callback `OnDarkModeChanged` fire.
3. Push update xuống JS qua Mojo.

→ Important: pref có thể đổi từ **nhiều nơi**: UI khác, command line flag, sync từ cloud, enterprise policy. JS phải subscribe để always up-to-date.

## JavaScript — đọc/ghi pref qua Mojo

```javascript
// browser_proxy.js
import {SamsungSettingsHandlerRemote, SamsungSettingsPageCallbackRouter} 
    from './samsung_settings.mojom-webui.js';

export class BrowserProxy {
  constructor() {
    this.handler = new SamsungSettingsHandlerRemote();
    this.callbackRouter = new SamsungSettingsPageCallbackRouter();
    
    const factory = SamsungSettingsHandlerFactory.getRemote();
    factory.createHandler(
      this.callbackRouter.$.bindNewPipeAndPassRemote(),
      this.handler.$.bindNewPipeAndPassReceiver(),
    );
  }
}
```

Component:

```javascript
class SamsungSettingsPage extends PolymerElement {
  static get template() {
    return html`
      <cr-toggle 
          checked="{{darkMode}}"
          on-change="onDarkModeChange_">
      </cr-toggle>
    `;
  }
  
  static get properties() {
    return {
      darkMode: {
        type: Boolean,
        value: false,
      },
    };
  }
  
  ready() {
    super.ready();
    this.proxy_ = BrowserProxy.getInstance();
    
    // Listen push from C++
    this.callbackRouter_ = this.proxy_.callbackRouter;
    this.listenerIds_ = [
      this.callbackRouter_.onDarkModeChanged.addListener(
          this.onDarkModePushed_.bind(this)),
    ];
    
    // Load initial settings
    this.loadSettings_();
  }
  
  disconnectedCallback() {
    super.disconnectedCallback();
    this.listenerIds_.forEach(
        id => this.callbackRouter_.removeListener(id));
  }
  
  async loadSettings_() {
    const {settings} = await this.proxy_.handler.getSettings();
    this.darkMode = settings.darkMode;
  }
  
  onDarkModePushed_(newValue) {
    // C++ thay đổi → update UI
    this.darkMode = newValue;
  }
  
  onDarkModeChange_(e) {
    // User toggle → ghi xuống C++
    this.proxy_.handler.setDarkMode(e.detail.checked);
    // Note: KHÔNG cần this.darkMode = e.detail.checked vì 
    //       cr-toggle two-way binding rồi
  }
}
```

→ Pattern **bi-directional sync**: UI ↔ C++. Mọi nguồn thay đổi đều update UI.

## `<settings-pref>` — pattern Chromium settings

`chrome://settings` có một abstraction tốt hơn: **PrefControlMixin** + **`<settings-pref>`** pattern.

```javascript
// CrPolicyPrefMixin / PrefControlMixin
import {CrPolicyPrefMixin} from 'chrome://resources/cr_elements/policy/cr_policy_pref_mixin.js';

class SettingsToggle extends CrPolicyPrefMixin(PolymerElement) {
  static get properties() {
    return {
      pref: {
        type: Object,
        notify: true,
      },
    };
  }
  
  static get template() {
    return html`
      <cr-toggle 
          checked="{{pref.value}}"
          disabled="[[isPrefEnforced(pref)]]">
      </cr-toggle>
      
      <!-- Policy indicator -->
      <cr-policy-indicator 
          hidden$="[[!showIndicator(pref)]]"
          indicator-type="[[getIndicatorType(pref)]]">
      </cr-policy-indicator>
    `;
  }
}
```

Sử dụng:

```html
<settings-toggle pref="{{prefs.samsung.dark_mode_enabled}}"></settings-toggle>
```

Trong đó `prefs` là object lớn từ root component, chứa tất cả prefs với structure:

```javascript
prefs = {
  samsung: {
    dark_mode_enabled: {
      type: 'BOOLEAN',
      value: false,
      controlledBy: undefined,    // hoặc 'DEVICE_POLICY', 'USER_POLICY', etc.
      enforcement: undefined,      // 'ENFORCED', 'RECOMMENDED'
      recommendedValue: undefined,
    },
    theme: {
      type: 'STRING',
      value: 'auto',
    },
  },
}
```

`{{pref.value}}` two-way bind value. Component tự gửi đến C++ qua proxy khi đổi.

→ Pattern này từ Chromium internal — phức tạp nhưng cho phép UI handle policy/enforcement uniformly.

## Pattern thực dụng cho Samsung Browser

Bạn không cần dùng full `<settings-pref>` pattern. Simple approach:

```javascript
class SamsungSettingsPage extends PolymerElement {
  static get template() {
    return html`
      <cr-link-row label="Dark mode">
        <cr-toggle 
            slot="secondary-action"
            checked="{{settings_.darkMode}}"
            on-change="onDarkModeChange_">
        </cr-toggle>
      </cr-link-row>
      
      <cr-link-row label="Theme">
        <cr-radio-group 
            slot="secondary-action"
            selected="{{settings_.theme}}"
            on-selected-changed="onThemeChange_">
          <cr-radio-button name="light"></cr-radio-button>
          <cr-radio-button name="dark"></cr-radio-button>
          <cr-radio-button name="auto"></cr-radio-button>
        </cr-radio-group>
      </cr-link-row>
    `;
  }
  
  static get properties() {
    return {
      settings_: {
        type: Object,
        value: () => ({
          darkMode: false,
          theme: 'auto',
        }),
      },
    };
  }
  
  ready() {
    super.ready();
    this.proxy_ = BrowserProxy.getInstance();
    
    this.listenerIds_ = [
      this.proxy_.callbackRouter.onSettingsChanged.addListener(
          this.onSettingsPushed_.bind(this)),
    ];
    
    this.loadSettings_();
  }
  
  async loadSettings_() {
    const {settings} = await this.proxy_.handler.getSettings();
    this.settings_ = settings;
  }
  
  onSettingsPushed_(settings) {
    // C++ push toàn bộ settings (vì có thể nhiều prefs đổi cùng lúc)
    this.settings_ = settings;
  }
  
  onDarkModeChange_(e) {
    this.proxy_.handler.setDarkMode(e.detail.checked);
  }
  
  onThemeChange_(e) {
    this.proxy_.handler.setTheme(e.detail.value);
  }
}
```

→ Simple, work tốt cho 90% case. Không bắt buộc dùng `<settings-pref>` complex pattern.

## Policy-controlled prefs

Enterprise admin có thể set policy "force dark mode = true" qua group policy. Khi đó:
- Pref value bị **enforced**.
- UI phải show indicator + disable toggle.

C++ side:

```cpp
void SamsungSettingsHandler::GetSettings(GetSettingsCallback callback) {
  auto settings = mojom::SamsungSettings::New();
  auto* prefs = profile_->GetPrefs();
  
  // Read value
  settings->dark_mode = prefs->GetBoolean(prefs::kDarkModeEnabled);
  
  // Check if managed
  const PrefService::Preference* pref = 
      prefs->FindPreference(prefs::kDarkModeEnabled);
  settings->dark_mode_managed = pref->IsManaged();
  settings->dark_mode_managed_by = 
      pref->IsManagedByCustodian() ? "custodian" : "policy";
  
  std::move(callback).Run(std::move(settings));
}

void SamsungSettingsHandler::SetDarkMode(bool enabled) {
  auto* prefs = profile_->GetPrefs();
  const PrefService::Preference* pref = 
      prefs->FindPreference(prefs::kDarkModeEnabled);
  
  // Refuse to change if managed (defensive — UI should prevent this)
  if (pref->IsManaged()) {
    return;
  }
  
  prefs->SetBoolean(prefs::kDarkModeEnabled, enabled);
}
```

JS:

```html
<cr-toggle 
    checked="{{settings_.darkMode}}"
    disabled$="[[settings_.darkModeManaged]]"
    on-change="onDarkModeChange_">
</cr-toggle>

<template is="dom-if" if="[[settings_.darkModeManaged]]">
  <cr-policy-indicator 
      indicator-type="userPolicy"
      indicator-source-name="Admin">
  </cr-policy-indicator>
</template>
```

`cr-policy-indicator` hiện icon (building) — user hover thấy "Controlled by Admin".

## Sync prefs giữa nhiều device

Chrome Sync sync một số prefs giữa các device:

```cpp
// pref_names.cc
registry->RegisterBooleanPref(
    prefs::kDarkModeEnabled,
    false,
    user_prefs::PrefRegistrySyncable::SYNCABLE_PREF);  // ← syncable

registry->RegisterBooleanPref(
    prefs::kLocalOnlySetting,
    false);  // không syncable
```

→ Khi user enable dark mode trên Phone A, Phone B cũng tự đổi (qua Chrome Sync). Pref change observer fire ở Phone B → UI update.

## List/Dict prefs

```cpp
// Register
registry->RegisterListPref(prefs::kAllowedSites);

// Read
const base::Value::List& sites = 
    profile_->GetPrefs()->GetList(prefs::kAllowedSites);
for (const auto& site : sites) {
  std::string url = site.GetString();
}

// Write
base::Value::List new_list;
new_list.Append("https://example.com");
new_list.Append("https://samsung.com");
profile_->GetPrefs()->SetList(prefs::kAllowedSites, std::move(new_list));
```

JS qua Mojo (vì list không serialize tốt qua loadTimeData):

```javascript
const {sites} = await proxy_.handler.getAllowedSites();
// sites = ['https://example.com', 'https://samsung.com']

await proxy_.handler.addAllowedSite('https://new.com');
```

## Migration — đổi pref schema giữa versions

Khi browser update, pref structure có thể đổi. Pattern:

```cpp
// Old pref: prefs::kOldThemeName
// New pref: prefs::kThemeId (integer)

void MigratePrefs(PrefService* prefs) {
  if (prefs->HasPrefPath(prefs::kOldThemeName)) {
    std::string old_name = prefs->GetString(prefs::kOldThemeName);
    int new_id = ConvertNameToId(old_name);
    prefs->SetInteger(prefs::kThemeId, new_id);
    prefs->ClearPref(prefs::kOldThemeName);
  }
}

// Call in browser startup
ProfileImpl::ProfileImpl(...) {
  MigratePrefs(prefs);
}
```

## Pref command-line override

Developer có thể override pref qua command line:

```bash
chrome --enable-features=DarkMode
chrome --force-darkmode
```

→ Đây không phải PrefService mechanism (xem `base::CommandLine` API). Nhưng có thể combine:

```cpp
bool IsDarkModeEnabled() {
  if (base::CommandLine::ForCurrentProcess()->HasSwitch("force-darkmode")) {
    return true;
  }
  return profile_->GetPrefs()->GetBoolean(prefs::kDarkModeEnabled);
}
```

## Best practices

### 1. Naming convention

```text
{vendor}.{module}.{name}

Examples:
  samsung.browser.dark_mode_enabled
  samsung.quick_settings.theme
  chrome.bookmarks.show_app_shortcuts
```

### 2. Always register pref

Quên register → silent fail (return default).

### 3. Use proper types

- `Boolean` cho on/off settings.
- `Integer` cho enum values.
- `String` cho text (vd theme name).
- `List/Dict` cho complex data.

### 4. Use enum constants, không magic numbers

```cpp
// pref_names.h
namespace prefs {
  enum ColorTheme {
    kLight = 0,
    kDark = 1,
    kAuto = 2,
  };
}

// Store as int
prefs->SetInteger(prefs::kColorTheme, static_cast<int>(ColorTheme::kDark));
```

### 5. Listen pref changes — không poll

```cpp
// SAI - poll
void Update() {
  while (true) {
    bool current = prefs->GetBoolean(prefs::kFoo);
    if (current != last_) {
      OnChanged();
    }
    sleep(1);
  }
}

// ĐÚNG - observer
pref_change_registrar_.Add(
    prefs::kFoo,
    base::BindRepeating(&Foo::OnChanged, base::Unretained(this)));
```

### 6. Push toàn bộ settings object, không từng pref

```mojom
// SAI - 10 events for 10 prefs
interface Page {
  OnDarkModeChanged(bool);
  OnThemeChanged(string);
  OnFontSizeChanged(int);
  ...
};

// ĐÚNG - 1 event with full state
interface Page {
  OnSettingsChanged(Settings settings);
};
```

→ Đơn giản hơn cho JS handle. Trừ khi performance là vấn đề (rare).

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Quên register pref | Default value, no persistence | `RegisterBooleanPref` lúc startup |
| Sai type | Crash hoặc unexpected value | Check type khi register |
| Forget pref observer cleanup | Memory leak | Auto cleanup với `PrefChangeRegistrar` |
| UI không reflect pref change từ external | Stale state | Subscribe `onSettingsChanged` event |
| Race condition khi write nhiều prefs | UI flicker | Batch update, push single event |
| Forget policy check | User có thể override policy | Check `IsManaged()` |

## Tóm tắt bài 6

- **PrefService** quản lý user preferences, persistent storage.
- Pref phải **register** lúc startup với default value.
- 2 instances: **local state** (browser-wide) + **profile prefs** (per-user).
- C++ API: `GetBoolean/SetBoolean/GetString/SetString`, etc.
- **`PrefChangeRegistrar`** observer pref changes — push xuống JS qua Mojo.
- Policy: `pref->IsManaged()` → UI disable + show `cr-policy-indicator`.
- Pattern: load initial qua Mojo, subscribe `onSettingsChanged` cho updates.
- Chrome Sync: prefs với flag `SYNCABLE_PREF`.

**Bài kế tiếp** → [Bài 7: Routes và Navigation trong WebUI](07-routes-navigation.md)
