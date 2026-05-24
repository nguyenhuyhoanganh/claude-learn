# File 2 — Polymer Custom Elements

> File 2 trong series 4 file. Đến đây bạn đã hiểu WebUI và Mojo (file 1). Bây giờ học cách **viết một component** — vì 80%+ code WebUI bạn sẽ động vào trong Samsung Browser là **Polymer 3 components**. Sau khi đọc, bạn có thể đọc và viết một Polymer element hoàn chỉnh.

## 1. Nền tảng — Custom Elements là gì?

**Custom Element** là chuẩn của **browser** (không phải framework) cho phép định nghĩa HTML tag riêng:

```html
<settings-toggle label="Dark mode" checked></settings-toggle>
<cr-button>OK</cr-button>
<samsung-quick-settings-app></samsung-quick-settings-app>
```

Browser hiểu các tag này khi bạn đăng ký một JavaScript class với `customElements.define()`. Quy tắc: **tên tag phải có dấu gạch ngang** (`-`), để không xung đột với HTML tag chuẩn.

### Vanilla Custom Element (không framework)

```javascript
class MyButton extends HTMLElement {
  constructor() {
    super();             // BẮT BUỘC
  }

  connectedCallback() {  // Khi element vào DOM
    this.innerHTML = `<button>${this.getAttribute('label') || 'Click'}</button>`;
  }

  disconnectedCallback() {  // Khi element ra khỏi DOM
    // Cleanup
  }

  static get observedAttributes() { return ['label']; }
  attributeChangedCallback(name, oldValue, newValue) {
    // Re-render khi attribute đổi
  }
}

customElements.define('my-button', MyButton);
```

→ Verbose, dễ sai. Polymer ra đời để giải vấn đề này.

---

## 2. Polymer là gì?

**Polymer** là thư viện của Google **làm cho Web Components dễ viết hơn**. Cụ thể, Polymer cho bạn:

1. **Reactive properties** — thay đổi property → DOM tự update.
2. **Declarative template** — viết HTML template trực tiếp, có `[[binding]]` / `{{binding}}`.
3. **Auto Shadow DOM** — tự `attachShadow()`.
4. **Data binding** — one-way (`[[...]]`) hoặc two-way (`{{...}}`).
5. **Computed properties, observers** — derive value, react to changes.

Polymer **không phải framework như React**. Nó là wrapper rất mỏng trên Web Components.

### 3 phiên bản — chỉ cần biết Polymer 3

| | Polymer 1.x (2015) | Polymer 2.x (2017) | **Polymer 3.x (2018)** |
|--|------|------|------|
| Cách viết | `Polymer({...})` function | ES6 class | **ES6 class + ES modules** |
| File format | `.html` (HTML imports) | `.html` | **`.js` / `.ts`** |
| Import | `<link rel="import">` | `<link rel="import">` | **`import` (ES module)** |
| Chromium dùng | Cũ | Bridge | **Hiện tại** |

→ **Chromium hiện dùng Polymer 3.** Bài này = Polymer 3. Khi tài liệu nói "Polymer" mặc định là Polymer 3.

---

## 3. Anatomy của một Polymer 3 component

```javascript
// my_button.js
import {PolymerElement, html} from
    '@polymer/polymer/polymer-element.js';

class MyButton extends PolymerElement {
  static get is() { return 'my-button'; }

  static get template() {
    return html`
      <style>
        :host { display: inline-block; }
        button {
          padding: 8px 16px;
          background: var(--button-bg, #1a73e8);
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        :host([disabled]) {
          opacity: 0.5;
          pointer-events: none;
        }
      </style>
      <button on-click="onClick_">
        <slot></slot>
      </button>
    `;
  }

  static get properties() {
    return {
      disabled: {
        type: Boolean,
        value: false,
        reflectToAttribute: true,
      },
      label: {
        type: String,
        value: '',
      },
    };
  }

  onClick_(e) {
    if (this.disabled) return;
    this.dispatchEvent(new CustomEvent('button-tap', {
      bubbles: true,
      composed: true,
    }));
  }
}

customElements.define(MyButton.is, MyButton);
```

5 phần quan trọng:
1. **Import** `PolymerElement` và `html`.
2. **Class extends `PolymerElement`**.
3. **`static get is()`** — tên HTML tag.
4. **`static get template()`** — DOM của component.
5. **`static get properties()`** — data của component (reactive).
6. **Methods** — event handler, logic.
7. **`customElements.define(...)`** — đăng ký với browser.

---

## 4. `static get is()` — tên tag

```javascript
static get is() { return 'my-button'; }
```

- Phải có **dấu gạch ngang** (`my-button`, không `myButton`).
- Phải **lowercase**.
- **Unique trong app**.

Cuối file:
```javascript
customElements.define(MyButton.is, MyButton);
```

Tại sao `MyButton.is` thay vì hard-code `'my-button'`? Convention Chromium — đổi tên 1 chỗ thay vì 2.

> Có thể viết ngắn hơn: `static is = 'my-button';` (instance field, không cần `get`).

---

## 5. `static get template()` — DOM

```javascript
static get template() {
  return html`
    <style>...</style>
    <button on-click="onClick_">
      <slot></slot>
    </button>
  `;
}
```

`html\`...\`` là **tagged template literal**. Polymer parse template **1 lần khi class load**, cache lại, sau đó clone mỗi khi tạo instance. Nên 1000 `<my-button>` không cost gì thêm so với 1 cái.

### Cú pháp template

```html
<!-- Text binding (one-way) — hiện giá trị property -->
<span>[[label]]</span>

<!-- Property binding xuống component khác (one-way) -->
<my-input value="[[name]]"></my-input>

<!-- Two-way binding — child đổi → parent đổi -->
<my-input value="{{name}}"></my-input>

<!-- HTML attribute binding — chú ý $= -->
<img src$="[[imageUrl]]">

<!-- Event listener -->
<button on-click="onClick_">Click</button>

<!-- Slot — nhận content từ ngoài -->
<slot></slot>
<slot name="actions"></slot>

<!-- Conditional rendering -->
<template is="dom-if" if="[[isLoggedIn]]">
  <p>Welcome [[username]]!</p>
</template>

<!-- Repeat -->
<template is="dom-repeat" items="[[users]]">
  <div>[[item.name]] — [[item.email]]</div>
</template>
```

### `$=` cho HTML attribute

```html
<!-- Custom property binding (mặc định, không $) — set element.foo = bar -->
<my-element foo="[[bar]]"></my-element>

<!-- HTML attribute binding với $= — set element.setAttribute('foo', bar) -->
<my-element foo$="[[bar]]"></my-element>
```

Theo Polymer doc, **bắt buộc** dùng `$=` cho các attribute sau (vì IDL property tên khác hoặc không có): **`class`, `style`, `href`, `for`, `data-*`**. Ví dụ:

```html
<!-- SAI: class không có $= → Polymer cố set element.class (không tồn tại) -->
<div class="[[cssClass]]">

<!-- ĐÚNG -->
<div class$="[[cssClass]]">
```

Các attribute có property tương đương (`src`, `disabled`, `checked`, `hidden`...) — property binding **vẫn work**, nhưng best practice dùng `$=` để serialize ra DOM attribute (cho CSS selector hoạt động).

### `[[...]]` vs `{{...}}` — quan trọng

| | `[[prop]]` | `{{prop}}` |
|--|-----------|-----------|
| Hướng | One-way (parent → child) | Two-way (cả 2 chiều) |
| Dùng khi | Hầu hết các trường hợp | Form input, sync state |
| Yêu cầu | Không | Property phải `notify: true` |

```html
<!-- One-way: cập nhật parent.value → input value -->
<input value="[[value]]">

<!-- Two-way: input đổi → cập nhật ngược parent.value -->
<input value="{{value::input}}">
```

`::input` = event để trigger sync. Cho native input, dùng `::input`. Cho Polymer component có `notify: true`, không cần.

> **Best practice Chromium**: dùng `[[...]]` nhiều, `{{...}}` chỉ cho Polymer component có `notify: true` (vd `cr-input`, `cr-toggle`).

---

## 6. `static get properties()` — data

```javascript
static get properties() {
  return {
    // Cách viết ngắn — chỉ type
    name: String,

    // Cách viết đầy đủ — với options
    age: {
      type: Number,
      value: 0,                    // default value
      reflectToAttribute: true,    // sync property → HTML attribute
      notify: true,                // cho two-way binding
      observer: 'ageChanged_',     // callback khi đổi
      readOnly: false,             // chặn set từ ngoài
    },

    // Array/Object: value PHẢI là function (rất quan trọng!)
    items: {
      type: Array,
      value: () => [],
    },

    config: {
      type: Object,
      value: () => ({theme: 'light'}),
    },

    // Computed: derive từ properties khác
    fullName: {
      type: String,
      computed: 'computeFullName_(firstName, lastName)',
    },
  };
}

computeFullName_(first, last) {
  return `${first} ${last}`;
}
```

### Bẫy số 1: Array/Object value phải là function

```javascript
// SAI — tất cả instance share cùng 1 mảng!
items: {
  type: Array,
  value: [],
}

// Hậu quả:
const a = document.createElement('my-list');
const b = document.createElement('my-list');
a.items.push('x');                // mutate trực tiếp shared array
console.log(b.items);             // ['x'] — bị thay đổi cả b!

// ĐÚNG — mỗi instance có array riêng
items: {
  type: Array,
  value: () => [],
}
```

→ Đây là bẫy lớn nhất với newbie Polymer. Object cũng vậy. Primitive (String/Number/Boolean) không sao.

### Property options — ý nghĩa từng cái

- **`type`** — Polymer 3 chính thức support 6 type: String, Number, Boolean, Date, Array, Object (xem Polymer 3 doc). Polymer dùng để convert string attribute → đúng type.
- **`value`** — default. Set khi instance được tạo (sau constructor).
- **`reflectToAttribute: true`** — khi `this.disabled = true`, Polymer auto thêm `disabled` attribute vào DOM. Hữu ích cho CSS selector `:host([disabled])`.
- **`notify: true`** — khi property đổi, fire `<prop-name>-changed` event. Cần cho two-way binding `{{prop}}`.
- **`observer: 'methodName_'`** — gọi method này khi property đổi. Method nhận `(newVal, oldVal)`.
- **`readOnly: true`** — không set được từ ngoài. Phải dùng `this._setPropName(value)` từ trong.
- **`computed: 'methodName_(deps...)'`** — value derive từ properties khác.

### Observer & Computed — ví dụ

```javascript
static get properties() {
  return {
    firstName: { type: String, value: '' },
    lastName:  { type: String, value: '' },
    fullName: {
      type: String,
      computed: 'computeFullName_(firstName, lastName)',
    },
    isValid: {
      type: Boolean,
      observer: 'onValidChange_',
    },
  };
}

computeFullName_(first, last) {
  return `${first} ${last}`;
}

onValidChange_(newVal, oldVal) {
  console.log(`Valid changed: ${oldVal} → ${newVal}`);
}
```

→ `firstName` hoặc `lastName` đổi → `fullName` tự tính lại → DOM update.

### Complex observer — react khi nhiều property đổi cùng lúc

```javascript
static get observers() {
  return [
    'onUserChange_(user.name, user.email, user.role)',
    'onItemsChange_(items.*)',  // wildcard cho mọi sub-path
  ];
}

onUserChange_(name, email, role) {
  console.log('User updated:', name, email, role);
}

onItemsChange_(changeRecord) {
  console.log('Items changed:', changeRecord);
}
```

`static get observers()` khác `observer:` trong property — đây là observer top-level, có thể watch sub-path (`user.name`) hoặc nhiều property cùng lúc.

---

## 7. Truy cập DOM — `this.$` và `this.shadowRoot`

```html
<template>
  <input id="search">
  <button id="submit">Submit</button>
</template>
```

```javascript
ready() {
  super.ready();
  // Cả 2 cách đều OK:
  this.$.search.focus();                       // shortcut
  this.shadowRoot.querySelector('#search');    // full
}
```

`this.$.<id>` là shortcut — Polymer thu thập mọi element có `id` trong template lúc parse.

### Hạn chế của `this.$`

```html
<template is="dom-repeat" items="[[users]]">
  <input id="email-[[item.id]]">  <!-- KHÔNG có trong this.$ -->
</template>
```

`this.$` chỉ thấy element có id **tại thời điểm parse template gốc** — không thấy element trong `dom-repeat`, `dom-if`, hoặc dynamically added. Với những trường hợp này dùng `this.shadowRoot.querySelector()`.

---

## 8. Lifecycle hooks

```javascript
class MyComponent extends PolymerElement {
  // ─── Web Components native ───

  constructor() {
    super();
    // Element vừa được tạo. CHƯA có DOM, CHƯA có properties default.
    // Không setup DOM ở đây.
  }

  // ─── Polymer-specific ───

  ready() {
    super.ready();
    // DOM đã render. Properties đã set default.
    // Có thể query elements: this.$.*, this.shadowRoot.querySelector
    // Chạy MỘT LẦN duy nhất trong lần connect đầu của instance.
  }

  // ─── Web Components native ───

  connectedCallback() {
    super.connectedCallback();
    // Element đã vào DOM tree.
    // Chạy mỗi lần connect (nếu remove + re-add → gọi lại).
    // Setup global listener ở đây (document.addEventListener).
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    // Element bị remove khỏi DOM.
    // Cleanup global listener, timers ở đây.
  }

  attributeChangedCallback(name, oldValue, newValue) {
    super.attributeChangedCallback(name, oldValue, newValue);
    // Attribute thay đổi qua setAttribute hoặc HTML.
    // Polymer tự convert attribute → property cho declared properties.
  }
}
```

### `ready()` vs `connectedCallback()` — khi nào dùng cái nào?

| | `ready()` | `connectedCallback()` |
|--|-----------|----------------------|
| Khi gọi | Một lần trong lần connect đầu, sau khi local DOM được stamp | Mỗi lần connect vào DOM |
| Lần gọi | **1 lần** | Nhiều lần |
| Dùng cho | One-time setup | Subscribe global state |

```javascript
ready() {
  super.ready();
  // Setup once
  this.$.input.addEventListener('focus', () => this.wasFocused_ = true);
}

connectedCallback() {
  super.connectedCallback();
  // Setup mỗi lần component xuất hiện
  document.addEventListener('keydown', this.boundKeyHandler_);
}

disconnectedCallback() {
  super.disconnectedCallback();
  document.removeEventListener('keydown', this.boundKeyHandler_);
}
```

### Bẫy: quên `super.method()`

```javascript
ready() {
  super.ready();  // ← BẮT BUỘC, gọi ĐẦU TIÊN
  // your code
}
```

Quên `super` → Polymer chưa setup xong → properties không hoạt động → bug bí ẩn. Luôn `super.method()` đầu tiên.

---

## 9. Method và event handlers

Methods là JavaScript bình thường, không syntax đặc biệt.

```javascript
onClick_(e) {
  // this = component instance
  // e = Event object

  if (this.disabled) {
    e.stopPropagation();
    return;
  }

  // Set property → trigger re-render
  this.count = this.count + 1;

  // Truy cập DOM
  this.$.input.focus();

  // Dispatch custom event
  this.dispatchEvent(new CustomEvent('button-tap', {
    bubbles: true,
    composed: true,
    detail: {value: this.value},
  }));
}
```

### Convention private method — suffix `_`

```javascript
class MyButton extends PolymerElement {
  // Private (không dùng từ ngoài) — suffix `_`
  onClick_(e) { ... }
  computeFullName_(first, last) { ... }
  internalState_ = null;

  // Public (gọi từ ngoài hoặc test được) — không có dấu `_`
  focus() { this.$.button.focus(); }
  reset() { this.value = ''; }
}
```

→ Đây là Google JS style, **không phải Polymer requirement**. Nhưng trong Chromium code, suffix `_` cho private member là chuẩn chung. Theo convention này.

---

## 10. `set()` và path-based mutation

```javascript
// Nếu bạn làm thế này:
this.user.name = 'Alice';   // SAI — Polymer KHÔNG biết user.name đã đổi
this.items.push('new');     // SAI — Polymer KHÔNG biết items thay đổi
```

Lý do: Polymer dirty-check **reference**, không dirty-check sâu. Object/Array không đổi reference → không tới re-render.

→ Phải dùng Polymer API:

```javascript
// Set sub-path
this.set('user.name', 'Alice');
this.set('user.address.city', 'Saigon');

// Mutate array — phải dùng Polymer API
this.push('items', newItem);
this.unshift('items', newItem);
this.splice('items', index, 1);
this.pop('items');

// Lấy length
const len = this.items.length;
```

Hoặc dùng "reassignment trick":

```javascript
// Reassign reference — Polymer thấy reference đổi → re-render
this.items = [...this.items, newItem];
this.user = {...this.user, name: 'Alice'};
```

Cả 2 cách đều OK. Chromium code thường dùng `this.set()` và `this.push()` (rõ intention hơn).

---

## 11. Slots — nhận content từ ngoài

```html
<!-- Trong template -->
<style>
  .panel {
    background: white;
    border-radius: 8px;
    padding: 16px;
  }
</style>
<div class="panel">
  <h2>[[title]]</h2>
  <slot></slot>           <!-- default slot -->
  <slot name="footer"></slot>   <!-- named slot -->
</div>
```

```html
<!-- Người dùng -->
<my-panel title="Settings">
  <!-- Content vào default slot -->
  <p>Some description</p>
  <button>Save</button>

  <!-- Content vào named slot -->
  <div slot="footer">© 2026</div>
</my-panel>
```

→ `<slot>` là **placeholder** — render content user truyền vào tag. Trong file 3 (Shadow DOM) sẽ đào sâu cách style slot content.

---

## 12. Full ví dụ — Settings Toggle Row (production-style)

```javascript
import {PolymerElement, html} from
    '@polymer/polymer/polymer-element.js';

class SettingsToggleRow extends PolymerElement {
  static get is() { return 'settings-toggle-row'; }

  static get template() {
    return html`
      <style>
        :host {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 20px;
          border-bottom: 1px solid var(--cr-separator-color, #e0e0e0);
          font-family: 'Roboto', sans-serif;
        }
        :host([disabled]) {
          opacity: 0.38;
          pointer-events: none;
        }
        .text {
          flex: 1;
          margin-right: 16px;
        }
        .label {
          font-size: 14px;
          color: var(--cr-primary-text-color, #202124);
        }
        .sublabel {
          font-size: 12px;
          color: var(--cr-secondary-text-color, #5f6368);
          margin-top: 2px;
        }
        .toggle {
          width: 36px;
          height: 14px;
          background: var(--cr-toggle-off, #bdbdbd);
          border-radius: 7px;
          position: relative;
          cursor: pointer;
          transition: background 0.2s;
        }
        .toggle::before {
          content: '';
          position: absolute;
          width: 20px;
          height: 20px;
          background: white;
          border-radius: 50%;
          top: -3px;
          left: -3px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
          transition: transform 0.2s;
        }
        :host([checked]) .toggle {
          background: var(--cr-toggle-on, #1a73e8);
        }
        :host([checked]) .toggle::before {
          transform: translateX(22px);
        }
      </style>

      <div class="text">
        <div class="label">[[label]]</div>
        <template is="dom-if" if="[[sublabel]]">
          <div class="sublabel">[[sublabel]]</div>
        </template>
      </div>
      <div class="toggle" on-click="toggle_"></div>
    `;
  }

  static get properties() {
    return {
      label: { type: String, value: '' },
      sublabel: { type: String, value: '' },
      checked: {
        type: Boolean,
        value: false,
        reflectToAttribute: true,
        notify: true,  // ← cho two-way binding {{checked}}
      },
      disabled: {
        type: Boolean,
        value: false,
        reflectToAttribute: true,
      },
    };
  }

  toggle_() {
    if (this.disabled) return;
    this.checked = !this.checked;
    // Vì có notify:true, property change auto fire 'checked-changed' event
    // → Parent dùng {{checked}} tự sync

    this.dispatchEvent(new CustomEvent('toggle-changed', {
      detail: {checked: this.checked},
      bubbles: true,
      composed: true,
    }));
  }
}

customElements.define(SettingsToggleRow.is, SettingsToggleRow);
```

Cách dùng:

```html
<settings-toggle-row
    label="Dark Mode"
    sublabel="Override system theme"
    checked="{{darkMode}}"
    on-toggle-changed="onDarkModeChange_">
</settings-toggle-row>
```

→ Click toggle → `checked` đổi → vì có `notify`, parent `darkMode` cũng đổi tự động.

---

## 13. Chromium style — template trong file `.html` riêng

Polymer "chuẩn" có template inline trong `html\`...\``. Nhưng **Chromium dùng cách khác**: tách template ra file `.html` riêng.

`my_button.html`:
```html
<style>
  :host { display: inline-block; }
  button { padding: 8px; }
</style>
<button on-click="onClick_">
  <slot></slot>
</button>
```

`my_button.ts`:
```typescript
import {PolymerElement} from
    'chrome://resources/polymer/v3_0/polymer/polymer-element.js';
import {getTemplate} from './my_button.html.js';

class MyButton extends PolymerElement {
  static get is() { return 'my-button'; }

  static get template() {
    return getTemplate();
  }

  static get properties() {
    return {
      disabled: { type: Boolean, value: false },
    };
  }

  onClick_() { ... }
}

customElements.define(MyButton.is, MyButton);
```

Build system `html_to_wrapper` convert `my_button.html` → `my_button.html.js` lúc compile (auto-generated `getTemplate()` return template).

Tại sao Chromium dùng cách 2?
- HTML có syntax highlighting trong IDE.
- Tách concern: HTML/CSS riêng, logic riêng.
- Linting/formatting HTML dễ hơn.

Khi đọc code Samsung Browser, sẽ thấy pattern này khắp nơi.

---

## 14. Polymer trong TypeScript

Code mới Chromium chủ yếu **TypeScript**. Class signature đầy đủ:

```typescript
import {PolymerElement} from
    'chrome://resources/polymer/v3_0/polymer/polymer-element.js';
import {getTemplate} from './settings_toggle_row.html.js';

interface SettingsToggleRowElement {
  $: {
    toggle: HTMLDivElement;
  };
}

class SettingsToggleRowElement extends PolymerElement {
  static get is() { return 'settings-toggle-row'; }
  static get template() { return getTemplate(); }

  static get properties() {
    return {
      label: String,
      checked: {
        type: Boolean,
        value: false,
        reflectToAttribute: true,
        notify: true,
      },
    };
  }

  // Type cho property — TypeScript-friendly
  label: string;
  checked: boolean;

  toggle_(): void {
    this.checked = !this.checked;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'settings-toggle-row': SettingsToggleRowElement;
  }
}

customElements.define(SettingsToggleRowElement.is, SettingsToggleRowElement);
```

Khác biệt với JS:
- Khai báo `label: string;` để TypeScript biết type.
- `declare global { HTMLElementTagNameMap }` — cho `document.querySelector('settings-toggle-row')` return đúng type.
- Interface định nghĩa shape của `this.$`.

---

## 15. Mixin — kế thừa nhiều hành vi

Class trong JS chỉ extend 1 parent. Nếu cần combine logic, dùng **mixin** (function trả về class):

```javascript
import {PolymerElement} from
    'chrome://resources/polymer/v3_0/polymer/polymer-element.js';
import {I18nMixin} from
    'chrome://resources/cr_elements/i18n_mixin.js';

// Apply mixin
const Base = I18nMixin(PolymerElement);

class SettingsPage extends Base {
  static get is() { return 'settings-page'; }
  static get template() {
    return html`
      <h1>${this.i18n('settingsTitle')}</h1>  <!-- Mixin cung cấp this.i18n() -->
    `;
  }
}
```

Mixin phổ biến trong Chromium:
- **`I18nMixin`** — cho i18n (đọc localized string).
- **`WebUiListenerMixin`** — listen event từ C++ qua chrome.send (legacy).
- **`ListPropertyUpdateMixin`** — efficient list update.
- **`RouteObserverMixin`** — listen route change.
- **`FocusRowMixin`** — keyboard navigation cho list.

Combine nhiều mixin:
```javascript
const Base = I18nMixin(WebUiListenerMixin(PolymerElement));

class MyPage extends Base { ... }
```

> **Polymer 2 và trước** dùng "behaviors" — pattern khác, không recommend nữa. Polymer 3 dùng mixin.

---

## 16. `cr-*` elements — design system của Chromium

90% UI của Settings/History/Downloads dùng `cr-*` element library. Đây là design system riêng — bạn ít khi tự viết button/toggle/dialog từ đầu.

```javascript
import 'chrome://resources/cr_elements/cr_button/cr_button.js';
import 'chrome://resources/cr_elements/cr_toggle/cr_toggle.js';
import 'chrome://resources/cr_elements/cr_dialog/cr_dialog.js';
import 'chrome://resources/cr_elements/cr_input/cr_input.js';
import 'chrome://resources/cr_elements/cr_checkbox/cr_checkbox.js';
import 'chrome://resources/cr_elements/cr_icon_button/cr_icon_button.js';
```

```html
<cr-button on-click="onSave_">Save</cr-button>
<cr-toggle checked="{{enabled}}"></cr-toggle>

<cr-input label="Name" value="{{userName}}"
          invalid="[[hasError]]"
          error-message="Tên không hợp lệ"></cr-input>

<cr-checkbox checked="{{agreed}}">I agree</cr-checkbox>

<cr-dialog id="dialog">
  <div slot="title">Confirm Delete</div>
  <div slot="body">Bạn chắc chắn?</div>
  <div slot="button-container">
    <cr-button on-click="onCancel_">Cancel</cr-button>
    <cr-button class="action-button" on-click="onDelete_">Delete</cr-button>
  </div>
</cr-dialog>
```

`cr-*` element đã handle: focus management, keyboard navigation, theme, RTL, a11y. Dùng chúng thay vì raw `<button>` để consistency.

> Note: `paper-*` (Material Design) và `iron-*` là legacy. **Code mới dùng `cr-*`**.

---

## 17. Bẫy thường gặp (newbie traps)

| Bẫy | Hậu quả | Cách tránh |
|--|--|--|
| Quên `static get is()` | `customElements.define(undefined, ...)` lỗi | Luôn có `is` |
| Quên `super.ready()` | Properties không hoạt động, bug bí ẩn | Luôn `super.method()` đầu tiên |
| Array/Object `value: []` (không là function) | Shared between instances → bug ghost | `value: () => []` |
| `<img src="[[url]]">` (thiếu `$=`) | Attribute không bind, src = literal string | `<img src$="[[url]]">` |
| Truy cập `this.$.x` trong `constructor` | undefined (DOM chưa render) | Dùng trong `ready()` hoặc sau |
| Mutate object/array trực tiếp | DOM không update | `this.set('path.to.x', v)` hoặc reassign |
| Quên `customElements.define()` | Tag không hoạt động | Luôn define ở cuối file |
| Tên tag không có `-` | Throw error khi define | `my-button` chứ không `mybutton` |
| Property tên trùng HTML keyword (`class`, `for`) | Conflict | Đặt tên khác |
| `notify: true` không khai báo, dùng `{{...}}` | Two-way binding không sync | Thêm `notify: true` |
| Quên cleanup listener trong `disconnectedCallback` | Memory leak | Always cleanup |

---

## 18. Đọc code Polymer trong Samsung Browser

Khi bạn vào một file `.ts` trong Samsung Browser, đây là cách scan:

1. **Tìm `extends PolymerElement`** → đây là Polymer (không phải Lit).
2. **`static get is()`** → tên tag.
3. **`static get template()`** hoặc `import getTemplate from './*.html.js'` → template ở đâu.
4. **`static get properties()`** → data của component.
5. **Methods có suffix `_`** → private (không gọi từ ngoài).
6. **`customElements.define()` ở cuối** → đăng ký.
7. **Import từ `chrome://resources/`** → shared library.

Scan 10 file là quen pattern.

---

## 19. Checklist — bạn hiểu file này nếu trả lời được:

1. Quy tắc đặt tên Custom Element là gì? (Có dấu gạch ngang)
2. 4 thành phần bắt buộc của Polymer component? (`is`, `template`, `customElements.define`, optional `properties`)
3. `[[...]]` khác `{{...}}` ở điểm nào? (One-way / two-way)
4. Khi nào phải dùng `$=` trong template? (HTML standard attribute)
5. Vì sao `value: []` cho Array là sai? (Shared between instances)
6. `ready()` khác `connectedCallback()`? (1 lần / nhiều lần)
7. Mutate array/object đúng cách? (`this.set()` hoặc reassign)
8. `cr-*` element dùng để làm gì? (Design system của Chromium)
9. Mixin khác extends ở điểm nào? (Combine nhiều hành vi)
10. Khi nào dùng `notify: true`? (Cho two-way binding)

---

→ Đọc tiếp: [File 3: Shadow DOM và Styling](03-shadow-dom-va-styling.md)
