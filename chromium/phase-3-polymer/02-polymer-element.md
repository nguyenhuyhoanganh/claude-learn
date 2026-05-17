# Bài 2: PolymerElement class — tạo component đầu tiên

Bài 1 nói "Polymer là gì". Bài này dạy **cách viết một Polymer 3 component**. Sau bài, bạn sẽ hiểu mỗi dòng trong một component Polymer **làm gì và tại sao có nó**.

## Anatomy — giải phẫu một Polymer 3 component

Mở `cr-button.ts` của Chromium (file thực) — bạn sẽ thấy cấu trúc đại loại như:

```javascript
import {PolymerElement, html} from '@polymer/polymer/polymer-element.js';
import {getHtml} from './my_button.html.js';

class MyButton extends PolymerElement {
  static get is() { return 'my-button'; }
  
  static get template() {
    return html`
      <style>
        :host {
          display: inline-block;
        }
        button {
          padding: 8px 16px;
          background: var(--button-bg, #1a73e8);
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
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
    if (this.disabled) {
      e.stopPropagation();
      return;
    }
    this.dispatchEvent(new CustomEvent('button-tap', {
      bubbles: true,
      composed: true,
    }));
  }
}

customElements.define(MyButton.is, MyButton);
```

Mỗi phần có vai trò riêng. Đi từng cái.

## Phần 1 — Import `PolymerElement` và `html`

```javascript
import {PolymerElement, html} from '@polymer/polymer/polymer-element.js';
```

- **`PolymerElement`** — base class. Mọi Polymer component kế thừa từ đây.
- **`html`** — tagged template literal function. Dùng để viết template trong JS string mà vẫn hint syntax HTML.

> Tại sao import từ `@polymer/polymer/polymer-element.js`? Vì Polymer 3 là npm package. Trong Chromium, path sẽ là `chrome://resources/polymer/v3_0/polymer/polymer-element.js`.

## Phần 2 — `extends PolymerElement`

```javascript
class MyButton extends PolymerElement {
  // ...
}
```

`PolymerElement` extend `HTMLElement` (Web Components native) + thêm:
- Tự `attachShadow({mode: 'open'})`.
- Tự render template khi `connectedCallback`.
- Reactive property system.
- Data binding engine.
- Lifecycle hooks bổ sung.

→ Khi bạn extend `PolymerElement`, bạn **automatic có** mọi thứ này.

## Phần 3 — `static get is()` — tên tag

```javascript
static get is() { return 'my-button'; }
```

`is` là **tên HTML tag** của component. Quy tắc:
- **Phải có dấu gạch ngang** (`my-button` ✓, `myButton` ✗) — chuẩn Custom Elements.
- Lowercase.
- Tên unique trong app.

Dùng để `customElements.define(MyButton.is, MyButton)` ở cuối file:

```javascript
customElements.define(MyButton.is, MyButton);
// equivalent:
customElements.define('my-button', MyButton);
```

→ Tại sao dùng `MyButton.is` thay vì hard-code `'my-button'`? Để khi đổi tên class, không phải sửa 2 chỗ. Convention trong Chromium.

> Cách viết bằng instance field hiện đại: `static is = 'my-button';` (không cần `get` keyword). Cả 2 đều OK.

## Phần 4 — `static get template()` — định nghĩa DOM

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

`template` là DOM mà Polymer sẽ render **bên trong Shadow DOM** của component.

Tagged template literal `html\`...\``:
- Trông như string nhưng thực ra là **template hashing**.
- Polymer parse một lần duy nhất khi class load, sau đó **cache** template.
- Khi tạo instance, **clone** template node và bind data.

→ Hiệu quả: 1000 `<my-button>` chỉ parse HTML 1 lần.

### Cú pháp trong template

```html
<!-- Text binding (one-way): hiển thị giá trị property -->
<span>[[label]]</span>

<!-- Attribute binding (one-way) -->
<img src$="[[imageUrl]]">    <!-- Lưu ý: $= cho attribute -->

<!-- Property binding (one-way): bind JS property của element -->
<my-input value="[[name]]"></my-input>

<!-- Two-way binding -->
<my-input value="{{name}}"></my-input>

<!-- Event listener -->
<button on-click="onClick_">Click</button>
<button on-tap="onClick_">Tap (touch + click)</button>

<!-- Slot -->
<slot></slot>
<slot name="footer"></slot>
```

`[[...]]` vs `{{...}}` là **bài 3** đào sâu. Cứ nhớ `[[...]]` là phổ biến hơn.

### Lưu ý `$=` cho attribute

```html
<!-- Sai: src=[[imageUrl]] sẽ không bind! -->
<img src=[[imageUrl]]>

<!-- Đúng: dùng $= cho HTML attribute -->
<img src$="[[imageUrl]]">

<!-- Khác với property binding (mặc định): -->
<my-element foo="[[bar]]"></my-element>
<!-- = element.foo = bar (property) -->

<my-element foo$="[[bar]]"></my-element>
<!-- = element.setAttribute('foo', bar) (attribute) -->
```

`$=` cho HTML standard attributes (`src`, `href`, `class`, `style`...). Property binding (mặc định, không `$`) cho custom component properties.

## Phần 5 — `static get properties()` — định nghĩa data

```javascript
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
```

`properties` là **declaration** các reactive property. Polymer:
- Define getter/setter cho mỗi property.
- Setter trigger re-render khi value đổi.
- Convert từ attribute (string) sang đúng type.

### Property declaration — đầy đủ options

```javascript
static get properties() {
  return {
    // Cơ bản: chỉ type
    name: String,
    
    // Object form với options
    age: {
      type: Number,
      value: 0,                    // default value
      reflectToAttribute: true,    // property → attribute
      notify: true,                // cho two-way binding
      observer: 'ageChanged_',     // callback khi đổi
      readOnly: false,             // cho phép set từ ngoài
    },
    
    // Object/Array — value PHẢI là function (tránh share giữa instances)
    items: {
      type: Array,
      value: () => [],   // ← function trả mảng mới mỗi lần
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
```

Sẽ đào sâu mỗi option trong Bài 4. Hiện tại quan trọng nhất:

1. **`type`** — String, Number, Boolean, Array, Object, Function.
2. **`value`** — default value. **Phải là function** cho Array/Object.
3. **`reflectToAttribute`** — sync property xuống HTML attribute (cho CSS selector dùng được).

### Vì sao Array/Object value phải là function?

```javascript
// SAI — tất cả instance share cùng 1 array!
items: {
  type: Array,
  value: [],
}

// Hậu quả:
const a = document.createElement('my-list');
const b = document.createElement('my-list');
a.push('x');
console.log(b.items);  // ['x'] — bị thay đổi cả b!

// ĐÚNG — mỗi instance có array riêng
items: {
  type: Array,
  value: () => [],   // function tạo array mới mỗi lần
}
```

→ Object cũng vậy. Đây là **bẫy lớn nhất** với người mới dùng Polymer.

## Phần 6 — Methods (event handlers + logic)

```javascript
onClick_(e) {
  if (this.disabled) {
    e.stopPropagation();
    return;
  }
  this.dispatchEvent(new CustomEvent('button-tap', {
    bubbles: true,
    composed: true,
  }));
}
```

Methods là JavaScript bình thường. Polymer không có syntax đặc biệt.

> Convention Chromium: tên private method **kết thúc bằng `_`** (vd `onClick_`, `computeFullName_`). Đây là Google JS style — không phải Polymer requirement.

### Truy cập DOM trong methods

```javascript
onClick_(e) {
  // this = component instance
  // e = Event object
  
  // Truy cập Shadow DOM
  const input = this.shadowRoot.querySelector('input');
  
  // Shortcut: Polymer cung cấp this.$ object cho elements có id
  // <input id="search">
  this.$.search.focus();
  
  // Properties
  console.log(this.label);
  this.disabled = true;  // setter → trigger update
}
```

`this.$` là **shorthand**: tự động thu thập mọi element có attribute `id` trong template và expose qua object này.

```html
<template>
  <input id="search">
  <button id="submit">
</template>
```

```javascript
this.$.search   // = shadowRoot.querySelector('#search')
this.$.submit   // = shadowRoot.querySelector('#submit')
```

> **Hạn chế**: `this.$` chỉ thấy element có id **tại thời điểm parse template**. Không thấy element trong `dom-repeat` hay dynamically added.

## Phần 7 — `customElements.define(...)` — đăng ký

```javascript
customElements.define(MyButton.is, MyButton);
```

Đăng ký class với browser. Sau dòng này, browser hiểu `<my-button>` = instance của `MyButton`.

**Phải gọi sau khi class đã define đầy đủ.** Thường ở cuối file.

## Phần 8 — `<style>` — CSS scoped vào shadow DOM

```html
<template>
  <style>
    :host {
      display: inline-block;
    }
    button {
      padding: 8px 16px;
    }
  </style>
  <button>...</button>
</template>
```

CSS bên trong `<style>` chỉ áp dụng cho **Shadow DOM của component này**, không leak ra ngoài.

### `:host` — style chính element

```css
:host {
  display: inline-block;
}

/* Khi component có attribute disabled */
:host([disabled]) {
  opacity: 0.5;
  pointer-events: none;
}

/* Khi component là descendant của .dark-theme */
:host-context(.dark-theme) {
  background: #333;
  color: white;
}
```

Không có `:host` → element là `display: inline` mặc định (HTMLElement default). **Best practice: luôn khai báo display cho `:host`**.

### CSS Custom Properties — design tokens

```css
button {
  background: var(--my-button-bg, #1a73e8);
  color: var(--my-button-color, white);
}
```

User của component có thể override:

```css
my-button {
  --my-button-bg: red;
  --my-button-color: yellow;
}
```

→ CSS custom properties là **cách chính** để customize Polymer component từ ngoài. Chromium dùng `--cr-*` tokens khắp nơi.

## Lifecycle hooks Polymer 3

```javascript
class MyComponent extends PolymerElement {
  // ─── Web Components native ───
  
  constructor() {
    super();
    // Element vừa được tạo. ChƯA có DOM, CHƯA có properties.
    // Không setup DOM ở đây.
    console.log('1. constructor');
  }
  
  // Polymer-specific (gọi sau constructor, trước connectedCallback)
  ready() {
    super.ready();
    // DOM đã render. Properties đã set default values.
    // Có thể query elements: this.$.*, this.shadowRoot.querySelector
    console.log('2. ready');
  }
  
  connectedCallback() {
    super.connectedCallback();
    // Element đã được thêm vào DOM tree.
    // Add global event listeners ở đây.
    console.log('3. connectedCallback');
  }
  
  disconnectedCallback() {
    super.disconnectedCallback();
    // Element bị remove khỏi DOM.
    // Remove global event listeners, cancel timers.
    console.log('4. disconnectedCallback');
  }
  
  attributeChangedCallback(name, oldValue, newValue) {
    super.attributeChangedCallback(name, oldValue, newValue);
    // Attribute thay đổi (qua setAttribute hoặc HTML).
    // Polymer tự convert attribute → property cho declared properties.
    console.log(`5. attr ${name} changed: ${oldValue} → ${newValue}`);
  }
}
```

### Khi nào dùng `ready()` vs `connectedCallback()`?

| | `ready()` | `connectedCallback()` |
|---|---|---|
| Gọi lúc nào | Sau khi DOM render lần đầu | Element vào DOM tree |
| Gọi mấy lần | **1 lần duy nhất** | Nhiều lần (nếu remove + re-add) |
| DOM ready? | Có | Có |
| Dùng cho | One-time setup (focus initial, attach listeners trong component) | Setup mỗi lần connect (subscribe global) |

```javascript
ready() {
  super.ready();
  // Setup once
  this.$.input.addEventListener('focus', () => this._wasFocused = true);
}

connectedCallback() {
  super.connectedCallback();
  // Setup mỗi lần component xuất hiện
  document.addEventListener('keydown', this._boundKeyHandler);
}

disconnectedCallback() {
  super.disconnectedCallback();
  document.removeEventListener('keydown', this._boundKeyHandler);
}
```

### Phải gọi `super.method()` luôn

```javascript
ready() {
  super.ready();  // ← BẮT BUỘC
  // your code
}
```

Quên `super` → Polymer chưa setup xong (DOM chưa render đầy đủ) → bugs lạ.

## Full ví dụ — Settings Toggle Row

Component thực tế bạn sẽ thấy nhiều trong Chromium WebUI:

```javascript
import {PolymerElement, html} from '@polymer/polymer/polymer-element.js';

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
      label: {
        type: String,
        value: '',
      },
      sublabel: {
        type: String,
        value: '',
      },
      checked: {
        type: Boolean,
        value: false,
        reflectToAttribute: true,
        notify: true,  // ← cho phép two-way binding {{checked}}
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
    // Vì có notify:true, property change tự fire 'checked-changed' event
    // → Parent dùng {{checked}} tự sync
    
    // Nếu cần event riêng, dispatch thêm:
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

## Hai cách viết template (Chromium specific)

Chromium WebUI có **2 cách** để định nghĩa template:

### Cách 1 — Inline `html\`\`` trong file `.ts`/`.js` (Polymer chuẩn)

```javascript
class MyButton extends PolymerElement {
  static get template() {
    return html`
      <button>[[label]]</button>
    `;
  }
}
```

Đơn giản, mọi thứ trong 1 file.

### Cách 2 — Template trong file `.html` riêng (Chromium standard)

`my_button.html`:
```html
<style>
  button { padding: 8px; }
</style>
<button>[[label]]</button>
```

`my_button.ts`:
```typescript
import {PolymerElement, html} from '@polymer/polymer/polymer-element.js';
import {getHtml} from './my_button.html.js';

class MyButton extends PolymerElement {
  static get is() { return 'my-button'; }
  
  static get template() {
    return getHtml();
  }
}
```

Build system `html_to_wrapper` convert `my_button.html` → `my_button.html.js` (auto-generated `getHtml()` returning the template).

→ **Chromium dùng cách 2** vì:
- HTML có syntax highlighting trong IDE.
- Tách concern: HTML/CSS riêng, logic riêng.
- Linting/formatting HTML dễ hơn.

Khoá học sẽ dùng cách 1 cho ví dụ đơn giản, cách 2 cho ví dụ production (phase 5 sẽ đào sâu build system).

## Bẫy thường gặp — newbie traps

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Quên `static get is()` | `customElements.define(undefined, ...)` lỗi | Luôn có `static get is()` |
| Quên `super.ready()` | Properties không hoạt động | Luôn gọi `super.method()` đầu tiên |
| Array/Object value không là function | Shared between instances | `value: () => []` |
| `<img src="[[url]]">` (thiếu `$=`) | Attribute không bind | `<img src$="[[url]]">` |
| Truy cập `this.$.search` trong constructor | undefined (DOM chưa render) | Dùng trong `ready()` hoặc `connectedCallback()` |
| Quên `customElements.define()` | Tag không hoạt động, browser parse như unknown | Luôn define ở cuối file |
| Tên tag không có `-` | `customElements.define()` throw error | `my-button` không `mybutton` |
| Property tên `class` hoặc `for` | Conflict với HTML keyword | Đặt tên khác |

## Tóm tắt bài 2

- Polymer 3 component = ES module với `class extends PolymerElement`.
- 4 thành phần bắt buộc: **`static get is`**, **`static get template`**, **properties** (optional nhưng phổ biến), **`customElements.define`**.
- `html\`\`` tagged template literal cho template.
- `[[prop]]` text binding, `on-click` event, `$=` attribute binding, `<slot>` cho children.
- `this.$.id` shortcut truy cập elements có id.
- Lifecycle: `constructor` → `ready` (1 lần) → `connectedCallback` (mỗi lần connect) → `disconnectedCallback`.
- **Luôn `value: () => []`** cho Array/Object property.
- **Luôn `super.method()`** đầu tiên trong overridden lifecycle.

**Bài kế tiếp** → [Bài 3: Data binding — `[[...]]` vs `{{...}}`](03-data-binding.md)
