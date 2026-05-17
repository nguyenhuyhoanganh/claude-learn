# Bài 2: Mojom IDL — Cú pháp chi tiết

## File .mojom là gì?

`.mojom` là **Interface Definition Language (IDL)** của Mojo. Bạn định nghĩa interfaces và data structures ở đây, build system sẽ generate code C++ và JavaScript tương ứng.

---

## Cấu trúc file .mojom

```mojom
// Module declaration (namespace)
module samsung.browser.settings.mojom;

// Import other mojom files
import "mojo/public/mojom/base/string16.mojom";
import "ui/gfx/geometry/mojom/geometry.mojom";

// Enums
enum ThemeType {
  kLight,
  kDark,
  kSystem,
};

// Structs
struct BrowserSettings {
  ThemeType theme;
  bool dark_mode;
  int32 font_size;
  string user_agent;
  array<string> blocked_sites;
};

// Interfaces
interface SettingsPageHandler {
  GetSettings() => (BrowserSettings settings);
  SetTheme(ThemeType theme) => ();
};
```

---

## Primitive Types

```mojom
// Booleans
bool is_enabled;

// Integers
int8  small_value;
int16 medium_value;
int32 count;           // Dùng nhiều nhất
int64 timestamp;       // Unix timestamp, large IDs
uint8, uint16, uint32, uint64  // Unsigned variants

// Floats
float  percentage;     // 32-bit
double precise_value;  // 64-bit

// Strings
string name;           // UTF-8 string
mojo_base.mojom.String16 display_text;  // UTF-16 (Windows-style)

// Mapping trong JavaScript:
// bool   → boolean
// int32  → number
// int64  → BigInt (cẩn thận!)
// string → string
```

---

## Nullable Types

```mojom
// Thêm ? để cho phép null
string? optional_name;
int32? optional_count;
BrowserSettings? cached_settings;
array<string>? optional_list;
```

```javascript
// Trong JS, nullable types có thể là null
const { name } = await handler.getName();
if (name !== null) {
  console.log(name);
}
```

---

## Enums

```mojom
enum DownloadState {
  kPending = 0,
  kInProgress = 1,
  kCompleted = 2,
  kFailed = 3,
  kCancelled = 4,
};

// Dùng trong struct/method
struct DownloadItem {
  int32 id;
  string url;
  DownloadState state;
};
```

```javascript
// Trong JS: enum values là numbers
import {DownloadState} from './foo.mojom-webui.js';

if (item.state === DownloadState.kCompleted) {
  showCompletedUI();
}
```

---

## Structs

```mojom
struct TabInfo {
  int32 id;
  string title;
  string url;
  bool is_active;
  bool is_pinned;
  int32 index;
};

struct WindowInfo {
  int32 id;
  array<TabInfo> tabs;
  bool is_focused;
  // Nested struct
  TabInfo? active_tab;
};

// Struct có thể nest
struct BookmarkNode {
  int64 id;
  string title;
  string? url;          // null nếu là folder
  array<BookmarkNode> children;  // Recursive!
};
```

```javascript
// Trong JS, struct là plain object
const {tab} = await handler.getActiveTab();
console.log(tab.title);   // string
console.log(tab.isActive); // boolean (camelCase!)
console.log(tab.id);       // number
```

**Lưu ý naming:** Mojom dùng `snake_case`, JS bindings tự convert sang `camelCase`.

---

## Unions

```mojom
union SearchResult {
  TabInfo tab;
  BookmarkNode bookmark;
  string history_entry;
};
```

```javascript
// Trong JS
const {result} = await handler.search(query);
// result có field 'which' cho biết loại nào
if (result.which === SearchResult.Tags.TAB) {
  openTab(result.tab);
} else if (result.which === SearchResult.Tags.BOOKMARK) {
  openBookmark(result.bookmark);
}
```

---

## Arrays và Maps

```mojom
// Arrays
array<string> keywords;
array<TabInfo> tabs;
array<int32> selected_ids;

// Fixed-size array
array<float, 4> color_rgba;

// Maps
map<string, string> headers;
map<int32, TabInfo> tab_map;
```

```javascript
// Arrays → JS Array
const {tabs} = await handler.getTabs();
tabs.forEach(tab => console.log(tab.title));

// Maps → JS Map
const {headers} = await handler.getHeaders();
headers.forEach((value, key) => console.log(key, value));
```

---

## Interfaces

```mojom
interface PageHandler {
  // Method không có return value
  SetTheme(string theme);

  // Method với return value
  GetSettings() => (BrowserSettings settings);

  // Method với nhiều return values
  GetTabInfo(int32 tab_id) => (TabInfo? tab, string? error);

  // Method với nullable input
  SearchBookmarks(string? query) => (array<BookmarkNode> results);

  // Method với enum
  SetDownloadPriority(int32 download_id, DownloadPriority priority) => (bool success);
};
```

---

## Pending Remote và Pending Receiver trong IDL

```mojom
// Factory pattern: JS gửi cả 2 đầu pipe cho C++
interface PageHandlerFactory {
  CreatePageHandler(
    pending_remote<Page> page,           // C++ giữ để push updates xuống JS
    pending_receiver<PageHandler> handler  // C++ sẽ implement và bind
  );
};

// Observer pattern: JS đăng ký observer với C++
interface PageHandler {
  SetObserver(pending_remote<PageObserver> observer);
};

interface PageObserver {
  OnThemeChanged(string new_theme);
  OnSettingsUpdated(BrowserSettings settings);
};
```

---

## Versioning và Compatibility

```mojom
// [MinVersion=1] — method chỉ available từ version 1
interface PageHandler {
  GetSettings() => (BrowserSettings settings);

  [MinVersion=1]
  GetAdvancedSettings() => (AdvancedSettings? settings);
};
```

Chromium cần maintain backward compatibility giữa browser và renderer (có thể khác version trong auto-update scenarios).

---

## Naming Conventions trong .mojom

```mojom
// Module: snake_case, đầy đủ namespace
module samsung.browser.new_tab.mojom;

// Interfaces: PascalCase
interface NewTabPageHandler { ... };

// Methods: camelCase trong IDL (→ camelCase trong JS)
interface Handler {
  getBookmarks() => (array<Bookmark> bookmarks);
  setSearchEngine(string engine);
};

// Structs: PascalCase
struct BookmarkItem {
  int32 id;
  string title;
  string url;
};

// Enums: PascalCase, values kPascalCase
enum BookmarkType {
  kUrl,
  kFolder,
};
```

---

## Ví dụ thực tế: Samsung Browser Settings

```mojom
// samsung_settings.mojom
module samsung.browser.settings.mojom;

enum ColorTheme {
  kLight,
  kDark,
  kAuto,  // Follow system
};

enum FontSize {
  kSmall,
  kMedium,
  kLarge,
  kExtraLarge,
};

struct SamsungSettings {
  ColorTheme theme;
  FontSize font_size;
  bool samsung_pass_enabled;
  bool samsung_wallet_enabled;
  bool secret_mode_enabled;
  string? default_search_engine;
  array<string> blocked_ad_sources;
};

interface SamsungSettingsPage {
  OnSettingsChanged(SamsungSettings settings);
  OnSamsungPassStatusChanged(bool is_signed_in);
};

interface SamsungSettingsHandler {
  GetSettings() => (SamsungSettings settings);

  SetTheme(ColorTheme theme);
  SetFontSize(FontSize size);

  EnableSamsungPass(bool enable) => (bool success);
  EnableSecretMode(bool enable);

  GetSearchEngines() => (array<string> engines, string current);
  SetSearchEngine(string engine) => (bool success);
};

interface SamsungSettingsHandlerFactory {
  CreateHandler(
    pending_remote<SamsungSettingsPage> page,
    pending_receiver<SamsungSettingsHandler> handler
  );
};
```

---

→ [Bài tiếp theo: Data Types và Serialization](03-data-types.md)
