# Bài 2: Properties và Reactive System

## Hai loại state trong LitElement

```
┌─────────────────────────────────────────┐
│            Component State              │
├─────────────────────┬───────────────────┤
│  Public Properties  │  Internal State   │
│  (từ attribute/JS)  │  (chỉ trong cmp)  │
│                     │                   │
│  static properties  │  { state: true }  │
│  = { foo: {type} }  │  hoặc #private    │
└─────────────────────┴───────────────────┘
```

---

## Public Properties — Có thể set từ ngoài

```javascript
static properties = {
  // Cơ bản: String, Number, Boolean, Array, Object
  title:    {type: String},
  count:    {type: Number},
  active:   {type: Boolean},
  items:    {type: Array},
  config:   {type: Object},
};
```

```html
<!-- Set qua HTML attribute (string) -->
<my-component title="Hello" count="5" active></my-component>
```

```javascript
// Set qua JavaScript property
const el = document.querySelector('my-component');
el.title = 'World';       // String
el.count = 10;            // Number
el.active = true;         // Boolean
el.items = [1, 2, 3];     // Array — KHÔNG dùng attribute cho array/object
el.config = {key: 'val'}; // Object
```

---

## Type Conversion: Attribute → Property

HTML attributes đều là strings. LitElement tự convert:

```javascript
static properties = {
  count: {type: Number},
};
```

```html
<my-counter count="42"></my-counter>
```

```javascript
// Bên trong component:
console.log(this.count);        // 42 (number, không phải "42")
console.log(typeof this.count); // "number"
```

**Boolean attributes:**

```javascript
static properties = {
  disabled: {type: Boolean},
};
```

```html
<!-- Presence = true -->
<my-button disabled></my-button>
<!-- Absence = false -->
<my-button></my-button>
<!-- Không nên dùng: disabled="false" (vẫn là truthy vì attribute tồn tại!) -->
```

---

## `reflect: true` — Sync property xuống attribute

```javascript
static properties = {
  active: {type: Boolean, reflect: true},
  theme:  {type: String,  reflect: true},
};
```

```javascript
// Khi bạn set property:
this.active = true;

// DOM sẽ tự update:
// <my-component active theme="dark">
```

**Tại sao cần reflect?**
- Để CSS selector hoạt động: `my-component[active] { ... }`
- Để code bên ngoài có thể đọc state qua `getAttribute()`
- Pattern phổ biến trong Chromium WebUI cho state-based styling

---

## Internal State — `{state: true}`

State không exposed ra ngoài:

```javascript
static properties = {
  // Public property
  userId: {type: String},

  // Internal state — không map tới attribute
  _isLoading: {state: true},
  _userData:  {state: true},
  _error:     {state: true},
};

constructor() {
  super();
  this.userId = '';
  this._isLoading = false;
  this._userData = null;
  this._error = null;
}

async connectedCallback() {
  super.connectedCallback();
  await this._loadUser();
}

async _loadUser() {
  if (!this.userId) return;

  this._isLoading = true;  // → trigger re-render
  try {
    const {user} = await this.pageHandler.getUser(this.userId);
    this._userData = user;  // → trigger re-render
  } catch (e) {
    this._error = e.message;  // → trigger re-render
  } finally {
    this._isLoading = false;  // → trigger re-render
  }
}

render() {
  if (this._isLoading) return html`<loading-spinner></loading-spinner>`;
  if (this._error) return html`<error-message>${this._error}</error-message>`;
  if (!this._userData) return html``;

  return html`
    <div class="user-profile">
      <h2>${this._userData.name}</h2>
      <p>${this._userData.email}</p>
    </div>
  `;
}
```

---

## `willUpdate` — React to property changes

```javascript
willUpdate(changedProperties) {
  // changedProperties là Map<string, any> — old values

  if (changedProperties.has('userId')) {
    const oldId = changedProperties.get('userId');
    console.log(`userId changed from ${oldId} to ${this.userId}`);
    this._loadUser();
  }

  // Check nhiều properties
  if (changedProperties.has('startDate') || changedProperties.has('endDate')) {
    this._updateDateRange();
  }
}
```

---

## `updated` — Sau khi DOM được update

```javascript
updated(changedProperties) {
  // DOM đã được update, có thể interact

  if (changedProperties.has('focused') && this.focused) {
    // Focus element sau khi render
    this.shadowRoot.querySelector('input')?.focus();
  }

  if (changedProperties.has('items')) {
    // Tính toán sau khi list re-render
    this._updateScrollPosition();
  }
}
```

---

## `updateComplete` — Promise khi render xong

```javascript
// Đôi khi cần chờ render xong trước khi làm việc với DOM
async someMethod() {
  this.showDialog = true;
  // DOM chưa update ngay!

  await this.updateComplete;
  // Bây giờ DOM đã update
  const dialog = this.shadowRoot.querySelector('dialog');
  dialog.showModal();
}
```

---

## Computed Properties — Derive từ state

LitElement không có built-in computed properties. Dùng getter:

```javascript
// Cách đơn giản: getter
get filteredItems() {
  return this.items.filter(item =>
    item.name.toLowerCase().includes(this.searchText.toLowerCase())
  );
}

render() {
  return html`
    ${this.filteredItems.map(item => html`<li>${item.name}</li>`)}
  `;
}
```

**Vấn đề:** Getter gọi lại mỗi lần render. Nếu computation nặng, dùng caching:

```javascript
willUpdate(changedProperties) {
  // Chỉ recompute khi dependencies thay đổi
  if (changedProperties.has('items') || changedProperties.has('searchText')) {
    this._filteredItems = this.items.filter(item =>
      item.name.toLowerCase().includes(this.searchText.toLowerCase())
    );
  }
}

render() {
  return html`
    ${this._filteredItems?.map(item => html`<li>${item.name}</li>`)}
  `;
}
```

---

## Immutability — Pattern quan trọng

**KHÔNG** mutate arrays/objects trực tiếp:

```javascript
// ❌ Sai — LitElement sẽ không detect thay đổi này
this.items.push(newItem);

// ❌ Sai
this.config.theme = 'dark';

// ✅ Đúng — tạo reference mới
this.items = [...this.items, newItem];

// ✅ Đúng
this.config = {...this.config, theme: 'dark'};

// ✅ Đúng — filter
this.items = this.items.filter(item => item.id !== deletedId);
```

LitElement detect change bằng cách so sánh `===`. Nếu reference không đổi, nó cho là "không thay đổi" và skip re-render.

---

## Pattern thực tế trong Chromium: Settings Page

```javascript
class PrivacySettingsPage extends LitElement {
  static properties = {
    // Data từ Mojo
    settings_: {state: true},
    isLoading_: {state: true},
  };

  constructor() {
    super();
    this.settings_ = null;
    this.isLoading_ = true;
    this.pageHandler_ = PrivacySettingsPageHandlerRemote.getRemote();
  }

  async connectedCallback() {
    super.connectedCallback();
    // Load settings từ native qua Mojo
    const {settings} = await this.pageHandler_.getPrivacySettings();
    this.settings_ = settings;
    this.isLoading_ = false;
  }

  render() {
    if (this.isLoading_) {
      return html`<cr-loading-gradient></cr-loading-gradient>`;
    }
    return html`
      <settings-toggle
        label="Safe Browsing"
        .checked=${this.settings_.safeBrowsingEnabled}
        @change=${this.onSafeBrowsingChange_}>
      </settings-toggle>
      <settings-toggle
        label="Do Not Track"
        .checked=${this.settings_.doNotTrackEnabled}
        @change=${this.onDoNotTrackChange_}>
      </settings-toggle>
    `;
  }

  async onSafeBrowsingChange_(e) {
    const enabled = e.detail.checked;
    // Update local state ngay (optimistic update)
    this.settings_ = {...this.settings_, safeBrowsingEnabled: enabled};
    // Gọi Mojo để persist
    await this.pageHandler_.setSafeBrowsing(enabled);
  }
}
```

---

## Tóm tắt

| Tính năng | Cú pháp | Khi nào dùng |
|-----------|---------|-------------|
| Public property | `{type: String}` | Data từ parent/attribute |
| Internal state | `{state: true}` | State nội bộ |
| Reflect | `{reflect: true}` | CSS selector, external access |
| Observe change | `willUpdate(changed)` | Computed, side effects |
| Post-render | `updated(changed)` | Focus, scroll, measure |
| Wait for DOM | `await this.updateComplete` | Async post-render operations |

→ [Bài tiếp theo: Templates và Directives](03-templates-directives.md)
