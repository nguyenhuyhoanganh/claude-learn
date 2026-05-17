# Bài 5: i18n và loadTimeData — đa ngôn ngữ + data từ C++

WebUI phải support **mọi ngôn ngữ** mà Chrome support — 60+ ngôn ngữ. Mọi text hiển thị (button, label, error message) phải qua i18n. Bài này dạy:

- Cách Chromium quản lý translations.
- `loadTimeData` — inject simple data từ C++.
- `I18nMixin` — translate trong component.
- Placeholder, plurals, HTML in translations.
- Best practices cho i18n trong Samsung Browser.

## Tổng quan luồng i18n

```text
1. Source string trong code:
   C++:  IDS_SETTINGS_PAGE_TITLE → "Settings"
   
2. Translators dịch:
   IDS_SETTINGS_PAGE_TITLE in Vietnamese.xtb → "Cài đặt"
   IDS_SETTINGS_PAGE_TITLE in French.xtb     → "Paramètres"
   ...
   
3. Build time:
   Grit compile tất cả → settings_strings.pak (per-locale)
   
4. Runtime:
   Browser detect user locale → load đúng pak file
   C++ code: l10n_util::GetStringUTF8(IDS_SETTINGS_PAGE_TITLE)
            → trả về string đúng ngôn ngữ
   
5. Inject vào WebUI:
   C++:  source->AddLocalizedString("pageTitle", IDS_SETTINGS_PAGE_TITLE);
   JS:   loadTimeData.getString('pageTitle')  // "Cài đặt"
```

## `.grdp` file — định nghĩa strings

`.grd` chứa resources binary (HTML, JS). `.grdp` chứa **string messages**:

```xml
<!-- chrome/app/settings_strings.grdp -->
<?xml version="1.0" encoding="utf-8"?>
<grit-part>
  <message name="IDS_SETTINGS_PAGE_TITLE" 
           desc="Title of the Settings page">
    Settings
  </message>
  
  <message name="IDS_SETTINGS_SAVE_BUTTON" 
           desc="Label of the Save button in settings">
    Save
  </message>
  
  <!-- Với placeholder -->
  <message name="IDS_SETTINGS_HELLO_USER" 
           desc="Greeting on settings page">
    Hello, <ph name="USER_NAME">$1<ex>Alice</ex></ph>!
  </message>
  
  <!-- Plural support -->
  <message name="IDS_SETTINGS_ITEM_COUNT" 
           desc="Number of items">
    {COUNT, plural,
      =0    {No items}
      =1    {1 item}
      other {# items}
    }
  </message>
  
  <!-- HTML content -->
  <message name="IDS_SETTINGS_LEARN_MORE" 
           desc="Link to learn more">
    <ph name="BEGIN_LINK">&lt;a target="_blank" href="https://example.com/help"&gt;</ph>
    Learn more
    <ph name="END_LINK">&lt;/a&gt;</ph>
    about this setting
  </message>
</grit-part>
```

Phần quan trọng:

| Tag | Mô tả |
|---|---|
| `<message name="IDS_*" desc="...">` | Define string với ID + description cho translator |
| `<ph name="...">` | Placeholder cho variable substitution |
| `<ex>...</ex>` | Example value cho translator hiểu context |
| `{COUNT, plural, ...}` | ICU MessageFormat cho plural |

### Naming convention

```text
IDS_<DOMAIN>_<CONTEXT>_<DESCRIPTION>

Examples:
  IDS_SETTINGS_PAGE_TITLE
  IDS_BOOKMARKS_ADD_BUTTON
  IDS_HISTORY_DELETE_CONFIRM
  IDS_SAMSUNG_QUICK_SETTINGS_THEME
```

Tên should describe **what it is**, not the content (vì content có thể đổi).

## C++ side — inject vào WebUI

```cpp
// settings_ui.cc
source->AddLocalizedString("pageTitle", IDS_SETTINGS_PAGE_TITLE);
source->AddLocalizedString("saveButton", IDS_SETTINGS_SAVE_BUTTON);
source->AddLocalizedString("itemCount", IDS_SETTINGS_ITEM_COUNT);
```

**Add nhiều cùng lúc** (helper pattern):

```cpp
// settings_localized_strings_provider.cc
constexpr webui::LocalizedString kLocalizedStrings[] = {
    {"pageTitle", IDS_SETTINGS_PAGE_TITLE},
    {"saveButton", IDS_SETTINGS_SAVE_BUTTON},
    {"cancelButton", IDS_SETTINGS_CANCEL_BUTTON},
    {"itemCount", IDS_SETTINGS_ITEM_COUNT},
    {"helloUser", IDS_SETTINGS_HELLO_USER},
    // ... 100s strings
};

void AddLocalizedStrings(content::WebUIDataSource* source) {
  source->AddLocalizedStrings(kLocalizedStrings);
}

// Trong SettingsUI constructor:
AddLocalizedStrings(source);
```

→ Mỗi WebUI page có 1 file `*_localized_strings.cc` chứa toàn bộ strings của page đó. Clean.

## JS side — `loadTimeData`

### Read string đơn giản

```javascript
import {loadTimeData} from 'chrome://resources/js/load_time_data.js';

const title = loadTimeData.getString('pageTitle');
// "Cài đặt" (nếu locale vi)
```

### Read string với placeholder

```javascript
const greeting = loadTimeData.getStringF('helloUser', userName);
// "Hello, Alice!"
```

`getStringF` substitute `$1`, `$2`, ... với args.

```javascript
// String có nhiều placeholder
const msg = loadTimeData.getStringF('threeArgString', arg1, arg2, arg3);
// "$1 và $2 đã $3" → "Alice và Bob đã join"
```

### Other types

```javascript
loadTimeData.getBoolean('isDarkMode');
loadTimeData.getInteger('fontSize');
loadTimeData.getValue('userPrefs');  // Object — rare
```

C++ side tương ứng:

```cpp
source->AddBoolean("isDarkMode", IsDarkModeEnabled());
source->AddInteger("fontSize", GetFontSize());
source->AddString("userEmail", GetUserEmail());

// Object: AddDictionary với base::Value::Dict
base::Value::Dict prefs;
prefs.Set("theme", "dark");
prefs.Set("fontSize", 14);
source->AddDictionary("userPrefs", std::move(prefs));
```

## `I18nMixin` — i18n trong Polymer component

```javascript
import {I18nMixin} from 'chrome://resources/cr_elements/i18n_mixin.js';
import {PolymerElement, html} from 'chrome://resources/polymer/v3_0/polymer/polymer-element.js';

class SettingsPage extends I18nMixin(PolymerElement) {
  static get is() { return 'settings-page'; }
  
  static get template() {
    return html`
      <h1>[[i18n('pageTitle')]]</h1>
      <button>[[i18n('saveButton')]]</button>
      <button>[[i18n('cancelButton')]]</button>
      
      <!-- Với placeholder -->
      <p>[[i18n('helloUser', userName)]]</p>
    `;
  }
  
  static get properties() {
    return {
      userName: { type: String, value: 'Alice' },
    };
  }
}
```

`I18nMixin` cung cấp method `this.i18n(key, ...args)`:

```javascript
class MyComp extends I18nMixin(PolymerElement) {
  someMethod() {
    const title = this.i18n('pageTitle');                  // simple
    const greeting = this.i18n('helloUser', 'Alice');      // with arg
    const itemMsg = this.i18n('itemCount', 5);             // plural
  }
}
```

### `i18nAdvanced` — HTML content

Khi string có HTML (vd link), dùng `i18nAdvanced`:

```javascript
const html = this.i18nAdvanced('learnMoreLink', {
  substitutions: [],
  tags: ['a'],     // allow <a> tag
});
// "Learn more about this setting" với <a> link work
```

```html
<div .innerHTML="[[i18nAdvanced('learnMoreLink')]]"></div>
```

> ⚠️ `i18nAdvanced` allow HTML — chỉ dùng với **trusted translation strings**, không bao giờ user input.

### LitElement version — `I18nMixinLit`

```typescript
import {I18nMixinLit} from 'chrome://resources/cr_elements/i18n_mixin_lit.js';

const Base = I18nMixinLit(LitElement);

class SettingsPage extends Base {
  render() {
    return html`
      <h1>${this.i18n('pageTitle')}</h1>
      <p>${this.i18n('helloUser', this.userName)}</p>
    `;
  }
}
```

## LitElement không có I18nMixin

Nếu component pure LitElement:

```typescript
import {loadTimeData} from 'chrome://resources/js/load_time_data.js';

class Comp extends LitElement {
  render() {
    return html`
      <h1>${loadTimeData.getString('pageTitle')}</h1>
    `;
  }
}
```

Verbose hơn nhưng work. Polymer mixin tự cache + i18n updates.

## Plurals — ICU MessageFormat

```xml
<message name="IDS_SETTINGS_ITEM_COUNT" desc="Number of items">
  {COUNT, plural,
    =0    {No items}
    =1    {1 item}
    other {# items}
  }
</message>
```

Trong JS:

```javascript
this.i18n('itemCount', 0);   // "No items"
this.i18n('itemCount', 1);   // "1 item"
this.i18n('itemCount', 5);   // "5 items"
```

`#` = số được thay vào (without group separator).

### Other plural categories

Ngôn ngữ có nhiều forms hơn `=0/=1/other`. ICU support:

```xml
{COUNT, plural,
  zero   {Empty}      <!-- some langs có "zero" form khác -->
  one    {Single}
  two    {Pair}        <!-- Arabic, Hebrew có "two" form -->
  few    {Few items}
  many   {Many items}
  other  {# items}
}
```

Tiếng Việt và tiếng Anh chỉ cần `=0`, `=1`, `other`. Tiếng Ả Rập, Nga có nhiều forms.

## Substitution với complex values

```xml
<message name="IDS_FILE_INFO" desc="File info">
  <ph name="FILE_NAME">$1<ex>document.pdf</ex></ph> 
  (<ph name="FILE_SIZE">$2<ex>2.4 MB</ex></ph>)
</message>
```

```javascript
this.i18n('fileInfo', 'document.pdf', formatBytes(2456789));
// "document.pdf (2.4 MB)"
```

> Chú ý: argument positions `$1`, `$2`, ... có thể đổi thứ tự ở các ngôn ngữ khác (đôi khi tiếng Pháp xếp khác). Translator tự handle.

## Date / Time / Number formatting

Chromium dùng **Intl** API native cho format date/time/number — không qua i18n strings:

```javascript
const date = new Date(timestamp);

// Format theo locale của user
const formatted = date.toLocaleDateString();  // "01/15/2024" en-US, "15/01/2024" en-GB, ...

const number = (1234567).toLocaleString();    // "1,234,567" en-US, "1.234.567" de-DE

const currency = (99.99).toLocaleString('en-US', {
  style: 'currency', 
  currency: 'USD',
});  // "$99.99"
```

→ Không inject qua loadTimeData. JavaScript Intl handle.

## Locale của user — runtime

```javascript
// Get current locale
console.log(navigator.language);  // "vi", "en-US", "ja-JP"

// Hoặc qua Chromium API
import {loadTimeData} from 'chrome://resources/js/load_time_data.js';
const locale = loadTimeData.getString('language');  // được C++ inject

// RTL detection
const isRtl = document.dir === 'rtl';  // tiếng Ả Rập, Hebrew
```

C++ inject:

```cpp
source->AddString("language", g_browser_process->GetApplicationLocale());
source->AddString("textDirection", base::i18n::IsRTL() ? "rtl" : "ltr");
```

### RTL support

```html
<html dir="ltr">  <!-- hoặc dir="rtl" cho Ả Rập -->
```

C++ tự set `dir` của HTML. CSS cần handle:

```css
:host {
  /* SAI - không RTL aware */
  padding-left: 16px;
  
  /* ĐÚNG - logical property */
  padding-inline-start: 16px;
}
```

Logical properties (`inline-start`, `inline-end`, `block-start`, `block-end`) tự đảo theo direction. Chromium WebUI dùng pattern này.

## Loading strings dynamic — không qua loadTimeData

Đôi khi cần load strings dynamic (vd content từ server):

```javascript
// KHÔNG dùng i18n cho dynamic content
const userPostTitle = post.title;  // Đây là content user, không cần dịch
```

→ i18n chỉ cho **UI labels static**, không cho user content.

## `loadTimeData` advanced — Dictionary

```cpp
base::Value::Dict syncStatus;
syncStatus.Set("signedIn", true);
syncStatus.Set("email", "user@example.com");
syncStatus.Set("photoUrl", "https://...");

source->AddDictionary("syncStatus", std::move(syncStatus));
```

```javascript
const status = loadTimeData.getValue('syncStatus');
// status = {signedIn: true, email: '...', photoUrl: '...'}

console.log(status.email);
```

→ Dùng cho **complex initial data**. Cho data thay đổi runtime, dùng Mojo (phase 6).

## Common patterns trong Chromium WebUI

### Pattern 1: Title page

```javascript
class MyPage extends I18nMixin(PolymerElement) {
  ready() {
    super.ready();
    document.title = this.i18n('pageTitle');  // Set browser tab title
  }
}
```

### Pattern 2: Button labels

```html
<cr-button class="action-button" on-click="onSave_">
  [[i18n('saveButton')]]
</cr-button>
<cr-button class="cancel-button" on-click="onCancel_">
  [[i18n('cancelButton')]]
</cr-button>
```

### Pattern 3: Error messages

```html
<template is="dom-if" if="[[hasError]]">
  <div class="error">[[i18n('errorGeneric')]]</div>
</template>
```

### Pattern 4: Tooltip

```html
<cr-icon-button 
    iron-icon="cr:help-outline"
    title="[[i18n('helpTooltip')]]">
</cr-icon-button>
```

`title` attribute = native browser tooltip.

### Pattern 5: ARIA labels

```html
<input aria-label="[[i18n('searchInputLabel')]]">
<button aria-describedby="hint">
  [[i18n('actionButton')]]
</button>
<div id="hint">[[i18n('actionHint')]]</div>
```

→ A11y phụ thuộc i18n. Mọi `aria-label` phải qua i18n.

## Build chain — chi tiết

```text
.grdp (string definitions)
    ↓ Grit compiler
.h file với IDS_* constants
.pak file per-locale (chứa actual translated strings)

C++ code:
    source->AddLocalizedString("key", IDS_KEY);
    ↓
WebUI bootstrap (auto):
    Read user's locale → load <locale>.pak
    For each AddLocalizedString → load text from pak
    Inject <script>loadTimeData.data = {key: "translated text"};</script>

JS code:
    loadTimeData.getString('key') → translated text
```

## Translator workflow (Google internal — for awareness)

1. Developer add new string trong `.grdp` với placeholder English.
2. Translation request gửi đến Google Translation Console (TC).
3. Translators (linguists) dịch sang 60+ languages.
4. Translations check vào `.xtb` files (Translation Bundle).
5. Build pull `.xtb` → compile `.pak`.

→ Cycle thường 2-4 tuần. Developer phải plan trước.

Samsung Browser: có thể có **own translation pipeline** (vendor-specific strings).

## Pseudo-locale — test layout với fake long text

Để test UI khi text dài (German, etc.):

```bash
# Chrome flag
chrome://flags/#enable-ui-debugging-tools
# Or command line:
chrome --use-pseudolocale
```

→ Browser hiển thị **pseudo-locale** với chars Unicode (vd "[!! Settings !!]"). Test rendering, không cần translate thật.

## Best practices

### 1. Mọi user-facing text qua i18n

```javascript
// SAI - hard-coded text
html`<button>Save</button>`

// ĐÚNG
html`<button>[[i18n('saveButton')]]</button>`
```

### 2. Description hữu ích cho translator

```xml
<!-- BAD: description không giúp gì -->
<message name="IDS_BUTTON" desc="A button">Save</message>

<!-- GOOD: context rõ ràng -->
<message name="IDS_SETTINGS_SAVE_BUTTON" 
         desc="Label on the button that saves the user's settings 
               changes and closes the dialog">
  Save
</message>
```

### 3. Tránh string concatenation

```javascript
// SAI - không translate được
`Hello, ${name}, you have ${count} messages`

// ĐÚNG - full sentence trong i18n
this.i18n('helloMessages', name, count);
// XML: "Hello, $1, you have $2 messages"
```

Lý do: word order khác nhau theo language. Tiếng Đức `"Hallo {name}, du hast {count} Nachrichten"` — vẫn OK với placeholder. Concatenation không cho phép reorder.

### 4. Plurals dùng ICU, không if-else

```javascript
// SAI
const msg = count === 1 ? this.i18n('oneItem') : this.i18n('manyItems');

// ĐÚNG - ICU plural trong .grdp
this.i18n('itemCount', count);
```

### 5. Date/Number qua Intl, không i18n

```javascript
// SAI
this.i18n('priceFormat', price);  // không cần i18n cho format

// ĐÚNG
new Intl.NumberFormat('vi-VN', {style: 'currency', currency: 'VND'}).format(price);
```

### 6. RTL aware CSS

```css
/* SAI */
.icon { margin-left: 8px; }

/* ĐÚNG */
.icon { margin-inline-start: 8px; }
```

### 7. Track strings unused

Chromium có script check strings declared trong .grdp nhưng không reference → flag để remove. Giảm bundle size.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Hard-code English text | Không translate được | Mọi text qua `i18n('key')` |
| String concatenation | Word order sai ở language khác | Full sentence trong `.grdp` với placeholder |
| `i18nAdvanced` với user input | XSS risk | Chỉ dùng với trusted strings |
| Format date qua i18n | Không locale-aware | Dùng `Intl.DateTimeFormat` |
| RTL bị break layout | Layout xấu ở Ả Rập | Logical CSS properties |
| Forgot description | Translator dịch sai | Đầy đủ `desc` attribute |
| Same string nhiều `IDS_*` | Tốn bundle, không consistent | Reuse `IDS_*` cho cùng context |

## Tóm tắt bài 5

- **`.grdp`** XML → string definitions với `IDS_*` IDs.
- **Grit compile** → per-locale `.pak` files.
- **C++**: `source->AddLocalizedString("key", IDS_KEY)`.
- **JS**: `loadTimeData.getString('key')` hoặc `this.i18n('key')` qua `I18nMixin`.
- Placeholder: `$1`, `$2`, ... cho substitution.
- ICU **MessageFormat** cho plurals.
- `i18nAdvanced` cho HTML content (trusted only).
- **Intl** native API cho date/time/number formatting.
- RTL aware: logical CSS properties (`padding-inline-start`).

**Bài kế tiếp** → [Bài 6: PrefService và Settings binding](06-prefs-and-settings.md)
