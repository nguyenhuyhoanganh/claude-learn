# Bài 1: LitElement — Cơ bản

## LitElement là gì?

LitElement là **base class** để viết Custom Elements. Nó wrap lại Web Components API (Custom Elements + Shadow DOM) và thêm:

1. **Reactive properties** — Tự động re-render khi property thay đổi
2. **Declarative templates** — Dùng tagged template literals thay vì manipulate DOM thủ công
3. **Efficient updates** — Chỉ update phần DOM thực sự thay đổi (dùng `lit-html`)

LitElement là sự kế thừa của Polymer 3. Chromium đang dần migrate từ Polymer sang LitElement.

---

## Setup

Trong Chromium WebUI, LitElement được import từ resources:

```javascript
import {LitElement, html, css} from
    'chrome://resources/lit/v3_0/lit.rollup.js';
```

Trong project học tập bình thường (dùng npm):

```bash
npm install lit
```

```javascript
import {LitElement, html, css} from 'lit';
```

---

## Component đầu tiên

```javascript
import {LitElement, html, css} from 'lit';

class MyCounter extends LitElement {

  // 1. Định nghĩa reactive properties
  static properties = {
    count: {type: Number},
    label: {type: String},
  };

  // 2. Định nghĩa styles (tự động scoped vào shadow DOM)
  static styles = css`
    :host {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-family: sans-serif;
    }
    button {
      padding: 4px 12px;
      border-radius: 4px;
      border: 1px solid #ccc;
      cursor: pointer;
    }
    .count {
      min-width: 32px;
      text-align: center;
      font-weight: bold;
    }
  `;

  // 3. Constructor — khởi tạo default values
  constructor() {
    super();
    this.count = 0;
    this.label = 'Counter';
  }

  // 4. Template — trả về HTML để render
  render() {
    return html`
      <span>${this.label}:</span>
      <button @click=${this._decrement}>−</button>
      <span class="count">${this.count}</span>
      <button @click=${this._increment}>+</button>
    `;
  }

  // 5. Event handlers
  _increment() {
    this.count++;
    // LitElement tự động re-render vì count là reactive property
  }

  _decrement() {
    this.count = Math.max(0, this.count - 1);
  }
}

customElements.define('my-counter', MyCounter);
```

```html
<my-counter label="Score" count="10"></my-counter>
```

---

## Reactive Properties — Cơ chế re-render

Đây là tính năng cốt lõi của LitElement:

```javascript
static properties = {
  // type: hint để convert từ attribute string sang JS type
  name:     {type: String},     // 'hello' → 'hello'
  count:    {type: Number},     // '42' → 42
  checked:  {type: Boolean},    // attribute tồn tại → true
  items:    {type: Array},      // JSON.parse
  config:   {type: Object},     // JSON.parse

  // reflect: sync ngược lại từ property lên attribute
  active:   {type: Boolean, reflect: true},

  // attribute: custom attribute name (mặc định là lowercase của property name)
  firstName: {type: String, attribute: 'first-name'},

  // Không map từ attribute (internal state)
  _loading: {state: true},
};
```

**Cơ chế hoạt động:**

```javascript
// Khi bạn set property...
this.count = 5;

// LitElement:
// 1. Detect thay đổi (so sánh với giá trị cũ)
// 2. Schedule re-render (microtask, không sync)
// 3. Gọi render() để lấy template mới
// 4. Diff với DOM hiện tại
// 5. Update chỉ những phần thực sự thay đổi
```

**Batch updates** — LitElement gộp nhiều thay đổi vào một lần render:

```javascript
// 3 lần set property → chỉ render 1 lần
this.name = 'Hoanganh';
this.age = 25;
this.role = 'Developer';
// → 1 render duy nhất sau tất cả
```

---

## Template Syntax — `html\`\``

`html\`\`` là **tagged template literal** của lit-html:

```javascript
render() {
  return html`
    <!-- Expression: hiển thị giá trị -->
    <p>Hello, ${this.name}</p>

    <!-- Attribute binding -->
    <input type="text" .value=${this.inputValue}>

    <!-- Boolean attribute (có/không có attribute) -->
    <button ?disabled=${this.isLoading}>Submit</button>

    <!-- Event handler -->
    <button @click=${this.handleClick}>Click</button>
    <input @input=${(e) => this.value = e.target.value}>

    <!-- Property binding (dùng . prefix) -->
    <my-list .items=${this.listItems}></my-list>

    <!-- Conditional rendering -->
    ${this.isLoading
      ? html`<span>Loading...</span>`
      : html`<span>Done</span>`
    }

    <!-- List rendering -->
    <ul>
      ${this.items.map(item => html`
        <li>${item.name}</li>
      `)}
    </ul>
  `;
}
```

### Sự khác biệt quan trọng: `.value` vs `value`

```javascript
// Attribute binding (string)
html`<input value=${this.text}>`
// → setAttribute('value', this.text) — chỉ set initial value

// Property binding (bất kỳ type nào)
html`<input .value=${this.text}>`
// → element.value = this.text — set JS property, reflect ngay lập tức
```

**Rule of thumb:** Dùng `.` prefix khi cần truyền non-string data hoặc keep in sync với DOM state.

---

## Lifecycle Methods

```javascript
class MyComponent extends LitElement {

  // Gọi trước render đầu tiên
  // Dùng để setup ban đầu, fetch initial data
  async connectedCallback() {
    super.connectedCallback(); // BẮT BUỘC gọi super
    this.data = await this.pageHandler.getData();
  }

  // Gọi khi component bị remove khỏi DOM
  disconnectedCallback() {
    super.disconnectedCallback();
    // Cleanup: remove event listeners, cancel timers
    clearInterval(this._pollInterval);
  }

  // Gọi TRƯỚC mỗi lần render
  // Nhận map của changed properties
  willUpdate(changedProperties) {
    if (changedProperties.has('userId')) {
      this._loadUserData(this.userId);
    }
  }

  // Gọi SAU mỗi lần render
  // Dùng để interact với DOM elements
  updated(changedProperties) {
    if (changedProperties.has('focused') && this.focused) {
      this.shadowRoot.querySelector('input')?.focus();
    }
  }

  // Gọi sau lần render ĐẦU TIÊN
  // Dùng để setup things cần DOM
  firstUpdated() {
    // DOM đã ready, có thể query elements
    this._input = this.shadowRoot.querySelector('input');
  }
}
```

---

## `this.shadowRoot` và Querying Elements

```javascript
// Không dùng document.querySelector (đó là Light DOM)
// Dùng this.shadowRoot.querySelector

firstUpdated() {
  const input = this.shadowRoot.querySelector('#my-input');
  const buttons = this.shadowRoot.querySelectorAll('button');
}

// Hoặc dùng @query decorator (nếu dùng decorators)
// Thường thấy trong Chromium WebUI code:
// @query('#search-input') searchInput_;
```

---

## Một component thực tế: Settings Toggle

```javascript
import {LitElement, html, css} from 'lit';

class SettingsToggle extends LitElement {
  static properties = {
    label: {type: String},
    sublabel: {type: String},
    checked: {type: Boolean, reflect: true},
    disabled: {type: Boolean, reflect: true},
  };

  static styles = css`
    :host {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 0;
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
    }
    :host([disabled]) { opacity: 0.38; }

    .text-group { flex: 1; }
    .label { font-size: 14px; font-weight: 500; }
    .sublabel { font-size: 12px; color: var(--secondary-text, #757575); margin-top: 2px; }

    .toggle {
      width: 36px; height: 20px;
      background: var(--toggle-off, #ccc);
      border-radius: 10px;
      position: relative;
      cursor: pointer;
      transition: background 0.2s;
    }
    /* Vì checked có reflect: true → attribute selector hoạt động. 
       static styles được evaluate 1 lần khi class define, KHÔNG có this 
       — không thể viết `background: ${this.checked ? ... : ...}` */
    :host([checked]) .toggle {
      background: var(--toggle-on, #1a73e8);
    }
  `;

  constructor() {
    super();
    this.checked = false;
    this.disabled = false;
    this.label = '';
    this.sublabel = '';
  }

  render() {
    return html`
      <div class="text-group">
        <div class="label">${this.label}</div>
        ${this.sublabel
          ? html`<div class="sublabel">${this.sublabel}</div>`
          : ''
        }
      </div>
      <div
        class="toggle"
        role="switch"
        aria-checked=${this.checked}
        ?aria-disabled=${this.disabled}
        tabindex=${this.disabled ? '-1' : '0'}
        @click=${this._handleToggle}
        @keydown=${this._handleKeydown}>
      </div>
    `;
  }

  _handleToggle() {
    if (this.disabled) return;
    this.checked = !this.checked;
    this.dispatchEvent(new CustomEvent('change', {
      detail: {checked: this.checked},
      bubbles: true,
      composed: true,
    }));
  }

  _handleKeydown(e) {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      this._handleToggle();
    }
  }
}

customElements.define('settings-toggle', SettingsToggle);
```

---

## Tóm tắt

| Khái niệm | Cú pháp |
|-----------|---------|
| Reactive property | `static properties = { name: {type: String} }` |
| Template | `render() { return html\`...\` }` |
| Style | `static styles = css\`...\`` |
| Event binding | `@click=${this.handler}` |
| Property binding | `.value=${this.data}` |
| Boolean attribute | `?disabled=${bool}` |
| Conditional | `${cond ? html\`...\` : ''}` |
| List | `${items.map(i => html\`...\`)}` |

→ [Bài tiếp theo: Properties và Reactive System](02-properties-reactive.md)
