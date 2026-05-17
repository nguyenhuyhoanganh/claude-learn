# Bài 1: Đọc Chromium Source Code

## Setup: Chromium Code Search

Không cần clone toàn bộ Chromium (~30GB). Dùng:

- **https://source.chromium.org** — Official Chromium Code Search, full text search
- **https://cs.chromium.org** — Alias
- **grep.app** — Cross-repo search nhanh hơn

---

## Cấu trúc thư mục quan trọng

```
chromium/src/
├── chrome/
│   ├── browser/
│   │   ├── resources/          ← JS/HTML/CSS cho WebUI pages
│   │   │   ├── settings/       ← chrome://settings
│   │   │   ├── new_tab_page/   ← New tab page
│   │   │   ├── bookmarks/      ← Bookmarks manager
│   │   │   └── downloads/      ← Downloads page
│   │   └── ui/
│   │       └── webui/          ← C++ WebUIController implementations
│   │           ├── settings/
│   │           └── bookmarks/
│   └── common/
│       └── url_constants.h     ← chrome:// URL constants
│
├── content/
│   ├── browser/               ← Browser process code
│   └── renderer/              ← Renderer process code
│
├── ui/
│   └── webui/
│       └── resources/
│           ├── cr_elements/   ← Shared cr-* components (cr-button, cr-toggle...)
│           └── js/            ← Shared utilities
│
└── mojo/
    └── public/
        └── mojom/             ← Base mojo types
```

---

## Case Study: chrome://settings

Đây là WebUI page phức tạp nhất. Đọc nó giúp bạn hiểu mọi pattern.

### 1. Tìm entry point

```
chrome/browser/resources/settings/
└── settings.html          ← HTML entry
└── settings_main.ts       ← JS entry
└── settings_ui.ts         ← Root Lit component
```

**Tìm trên Chromium Code Search:**
```
Search: "settings_main.ts" path:chrome/browser/resources/settings
```

### 2. Theo dõi Mojo flow

```
Tìm .mojom file:
chrome/browser/ui/webui/settings/settings_page_ui_handler.mojom

Tìm C++ handler:
chrome/browser/ui/webui/settings/settings_page_ui_handler.cc

Tìm JS proxy:
chrome/browser/resources/settings/settings_page_browser_proxy.ts
```

### 3. Đọc một feature cụ thể: Appearance Settings

```typescript
// chrome/browser/resources/settings/appearance_page/appearance_page.ts
// Tìm: @customElement('settings-appearance-page')

// Tìm mojom:
// chrome/browser/ui/webui/settings/appearance_handler.mojom

// C++ handler:
// chrome/browser/ui/webui/settings/appearance_handler.cc
```

---

## Cách đọc C++ WebUI handler hiệu quả

```
1. Tìm class header (.h file)
   → Xem: kế thừa gì? implement mojom gì?

2. Tìm constructor
   → Xem: subscribe to observers nào?

3. Tìm từng method
   → Xem: đọc từ đâu? (PrefService, native API, ...)

4. Tìm callback calls (page_->OnXxx)
   → Đây là push events xuống JS
```

Ví dụ đọc `AppearanceHandler`:

```cpp
// Tìm: void AppearanceHandler::GetThemeInfo(...)
// → Đọc từ: ThemeService::GetForProfile(profile_)
// → Trả về: mojom::ThemeInfo::New()

// Tìm: void AppearanceHandler::OnThemeChanged()
// → C++ observer callback
// → Gọi: page_->OnThemeChanged(GetThemeInfo())
```

---

## cr-* Components: Cách đọc

Samsung Browser dùng lại `cr-*` components từ Chromium. Hiểu chúng là quan trọng:

```
ui/webui/resources/cr_elements/
├── cr_button/
│   ├── cr_button.ts           ← LitElement component
│   └── cr_button.css          ← Styles
├── cr_toggle/
│   ├── cr_toggle.ts
│   └── cr_toggle_test.ts      ← Tests!
├── cr_dialog/
│   ├── cr_dialog.ts
│   └── cr_dialog.html
└── cr_input/
    └── cr_input.ts
```

**Đọc cr-toggle để hiểu pattern:**
1. Xem `cr_toggle.ts` — properties nào? events nào?
2. Xem tests `cr_toggle_test.ts` — cách dùng đúng
3. Dùng lại trong Samsung page

---

## Tìm Samsung-specific code

Khi làm việc với Samsung Browser codebase:

```bash
# Tìm Samsung WebUI pages
find . -path "*/samsung*webui*" -name "*.cc"
find . -path "*/samsung*/resources*" -name "*.ts"

# Tìm samsung-specific mojom
find . -name "*.mojom" -path "*/samsung*"

# Grep cho samsung namespace
grep -r "namespace samsung" --include="*.h" -l
```

---

## Pattern: Đọc code để hiểu feature

**Bài tập:** Tìm hiểu cách chrome://settings/appearance hoạt động

```
Step 1: Tìm AppearanceHandler trong Chromium source
        search: "AppearanceHandler" site:source.chromium.org

Step 2: Đọc AppearanceHandler.mojom
        → Hiểu các methods và data types

Step 3: Đọc AppearanceHandler.cc
        → Hiểu cách đọc từ native APIs

Step 4: Đọc appearance_page.ts
        → Hiểu cách JS gọi handler

Step 5: Chạy chrome://settings/appearance trong browser
        → Open DevTools, xem console, network
        → Breakpoint trong JS code
```

---

## Chromium Code Reading Tips

1. **Dùng `Find References`** (Cmd+Shift+F trên Code Search) để trace code flow
2. **Đọc tests trước tiên** — tests cho thấy expected behavior rõ nhất
3. **`base::Unretained` và `base::BindOnce`** — C++ callback pattern trong Chromium
4. **`DCHECK` statements** — documentation về preconditions
5. **`// static`** comments trên static methods
6. **`// virtual`** comments trên virtual method calls

---

## Công cụ hữu ích

| Công cụ | URL/Command | Dùng cho |
|---------|-------------|---------|
| Chromium Code Search | source.chromium.org | Tìm file, symbol |
| Chromium Dashboard | chromiumdash.appspot.com | Track changes |
| Git blame (CS) | Source CS có blame view | Xem ai thay đổi gì |
| `git log --grep` | Local | Tìm commits liên quan |
| Mojo IDL Reference | chromium.googlesource.com/chromium/src/+/HEAD/mojo/public/tools/bindings/README.md | Mojom syntax |

---

→ [Bài tiếp theo: Case Study — Settings Page](02-case-study-settings.md)
