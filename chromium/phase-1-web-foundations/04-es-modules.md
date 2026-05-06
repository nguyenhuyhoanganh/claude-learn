# Bài 4: ES Modules và JavaScript hiện đại

## Tại sao cần học phần này?

Toàn bộ Chromium WebUI dùng **ES Modules** để tổ chức code. Polymer, LitElement, và Mojo bindings đều được import dưới dạng modules. Bạn phải hiểu cơ chế này để đọc và viết code.

---

## ES Modules cơ bản

```javascript
// math.js — export
export function add(a, b) { return a + b; }
export function multiply(a, b) { return a * b; }
export const PI = 3.14159;

// Named export default
export default class Calculator { ... }
```

```javascript
// main.js — import
import { add, multiply } from './math.js';
import Calculator from './math.js';         // import default
import { add as sum } from './math.js';     // rename
import * as MathUtils from './math.js';     // import all
```

```html
<!-- Trong HTML -->
<script type="module" src="main.js"></script>
<!-- hoặc inline -->
<script type="module">
  import { add } from './math.js';
  console.log(add(1, 2));
</script>
```

**Đặc điểm quan trọng của ES Modules:**
- Tự động **strict mode**
- Mỗi module có **scope riêng** (không leak global)
- Được **cache**: import cùng module nhiều lần chỉ execute một lần
- **Defer** mặc định: không block HTML parsing

---

## Dynamic Import

Dùng khi muốn lazy-load module (không load trước khi cần):

```javascript
// Thay vì import tĩnh (load ngay khi script chạy)
import { HeavyComponent } from './heavy-component.js';

// Dùng dynamic import (load khi cần)
async function loadSettings() {
  const { SettingsPage } = await import('./settings-page.js');
  const page = new SettingsPage();
  document.body.appendChild(page);
}

// Pattern trong Chromium WebUI: lazy-load pages
button.addEventListener('click', async () => {
  const module = await import('./privacy-settings.js');
  module.openPrivacySettings();
});
```

---

## JavaScript ES6+ quan trọng cho WebUI

### Destructuring

```javascript
// Object destructuring
const { theme, language, fontSize } = userSettings;

// Với rename và default
const { theme: colorTheme = 'light', fontSize = 14 } = userSettings;

// Trong function parameters
function applySettings({ theme, language }) {
  document.body.className = theme;
}

// Array destructuring
const [first, second, ...rest] = items;

// Từ Mojo response (rất phổ biến!)
const { settings } = await pageHandler.getSettings();
```

### Async/Await và Promises

```javascript
// Mojo IPC calls đều trả về Promise
// Không dùng callback, dùng async/await

// Cũ (callback hell)
pageHandler.getTheme(function(response) {
  pageHandler.applyTheme(response.theme, function() {
    updateUI();
  });
});

// Đúng với Mojo JS bindings
async function loadAndApplyTheme() {
  try {
    const { theme } = await pageHandler.getTheme();
    await pageHandler.applyTheme(theme);
    updateUI();
  } catch (error) {
    console.error('Failed to load theme:', error);
  }
}

// Promise.all — gọi song song nhiều Mojo calls
async function loadInitialData() {
  const [{ theme }, { language }, { bookmarks }] = await Promise.all([
    pageHandler.getTheme(),
    pageHandler.getLanguage(),
    pageHandler.getBookmarks(),
  ]);

  // Cả 3 calls chạy song song, chờ tất cả xong
  return { theme, language, bookmarks };
}
```

### Classes và Inheritance

```javascript
// LitElement dùng class cú pháp này
class SettingsSection extends LitElement {
  // Static fields
  static properties = {
    title: { type: String },
    expanded: { type: Boolean },
  };

  // Private fields (ES2022)
  #internalState = null;

  // Getter/Setter
  get isValid() {
    return this.#internalState !== null;
  }

  // Method
  async handleToggle() {
    this.expanded = !this.expanded;
    await this.pageHandler.setSectionExpanded(this.expanded);
  }
}
```

### Optional Chaining và Nullish Coalescing

```javascript
// Optional chaining (?.) — tránh null pointer
const themeName = userPrefs?.display?.theme?.name;
// Thay vì: userPrefs && userPrefs.display && userPrefs.display.theme && ...

// Nullish coalescing (??) — chỉ fallback khi null/undefined (không phải 0 hay '')
const fontSize = userPrefs?.fontSize ?? 14;
// Khác với: userPrefs?.fontSize || 14  (|| sẽ fallback cả khi fontSize = 0)

// Kết hợp với Mojo response
async function getTheme() {
  const response = await pageHandler?.getTheme();
  return response?.theme ?? 'default';
}
```

### Array Methods quan trọng

```javascript
const settings = [
  { id: 1, name: 'Dark Mode', enabled: true, category: 'display' },
  { id: 2, name: 'Notifications', enabled: false, category: 'notifications' },
  { id: 3, name: 'Font Size', value: 14, category: 'display' },
];

// filter — lấy display settings
const displaySettings = settings.filter(s => s.category === 'display');

// map — transform data từ Mojo response sang UI format
const uiItems = mojoSettings.map(s => ({
  id: s.id,
  label: s.displayName,
  checked: s.isEnabled,
}));

// find — tìm setting cụ thể
const darkModeSetting = settings.find(s => s.name === 'Dark Mode');

// some/every
const hasEnabledSettings = settings.some(s => s.enabled);
const allEnabled = settings.every(s => s.enabled);

// reduce — group by category
const byCategory = settings.reduce((acc, setting) => {
  const cat = setting.category;
  acc[cat] = acc[cat] || [];
  acc[cat].push(setting);
  return acc;
}, {});
```

---

## Module Pattern trong Chromium WebUI

Chromium WebUI dùng một pattern nhất quán:

```javascript
// settings_page.js
import { SettingsPageHandlerRemote } from
    './settings_page.mojom-webui.js';
import { SettingsToggleElement } from './settings_toggle.js';

// Singleton pattern cho Mojo handler
let pageHandlerInstance = null;

export function getPageHandler() {
  if (!pageHandlerInstance) {
    pageHandlerInstance = new SettingsPageHandlerRemote();
    // Mojo setup...
  }
  return pageHandlerInstance;
}

// LitElement component
export class SettingsPage extends LitElement {
  constructor() {
    super();
    this.pageHandler = getPageHandler();
  }
}

customElements.define('settings-page', SettingsPage);
```

---

## Import Maps (Chromium dùng cái này)

Chromium dùng **import maps** để map module paths:

```html
<script type="importmap">
{
  "imports": {
    "chrome://resources/js/lit/": "chrome://resources/lit/v3_0/",
    "//resources/mojo/": "chrome://resources/mojo/"
  }
}
</script>
```

Điều này cho phép code dùng paths ngắn gọn mà không cần relative paths:

```javascript
// Thay vì '../../../resources/lit/v3_0/lit.rollup.js'
import { LitElement } from 'chrome://resources/js/lit/index.js';
```

---

## Tóm tắt những gì cần nhớ

```javascript
// 1. Export/Import
export function foo() {}
export default class Bar {}
import { foo } from './module.js';
import Bar from './module.js';

// 2. Dynamic import
const module = await import('./lazy.js');

// 3. Async/await với Mojo calls
const { data } = await pageHandler.getData();

// 4. Destructuring
const { theme, language } = settings;

// 5. Optional chaining + nullish coalescing
const value = obj?.prop?.nested ?? 'default';

// 6. Array methods
items.filter(...).map(...).find(...)
```

---

## Exercise

Tạo `exercises/ex04-modules/`:

**`settings-store.js`**: Module quản lý settings state
- Export function `getSetting(key)` và `setSetting(key, value)`
- Export function `subscribeToChanges(callback)` — callback được gọi khi setting thay đổi
- Settings được lưu trong closure (không dùng global variable)

**`settings-ui.js`**: Import settings-store và render UI
- Subscribe to changes, re-render khi settings thay đổi
- Expose `initSettingsUI(container)` function

**`main.js`**: Orchestrate — import và khởi tạo

Chạy bằng cách tạo `index.html` với `<script type="module" src="main.js">`.

→ [Phase 1 tổng kết và sang Phase 2](../phase-2-chromium-architecture/01-multi-process.md)
