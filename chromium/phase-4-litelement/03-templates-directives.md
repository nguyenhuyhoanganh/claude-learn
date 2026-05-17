# Bài 3: Templates và Directives

## lit-html là gì?

`html\`\`` không phải string concatenation thông thường. Nó là một **tagged template literal** tạo ra `TemplateResult` — một object mô tả DOM cần render.

```javascript
// Đây KHÔNG phải string
const template = html`<div>${this.name}</div>`;
// template là TemplateResult object

// lit-html:
// 1. Parse HTML một lần, tạo <template> element
// 2. Lần sau chỉ update phần dynamic (${...})
// 3. Không re-parse toàn bộ HTML string
```

**Tại sao nhanh hơn innerHTML?**
- `innerHTML = 'hello'` → parse HTML mỗi lần
- `html\`hello\`` → parse một lần, update incremental

---

## Conditional Rendering

```javascript
render() {
  return html`
    <!-- Ternary: chọn giữa 2 template -->
    ${this.isLoggedIn
      ? html`<user-menu .user=${this.user}></user-menu>`
      : html`<login-button></login-button>`
    }

    <!-- Nothing (render trống) -->
    ${this.showBanner ? html`<promo-banner></promo-banner>` : nothing}

    <!-- Guard: chỉ render khi truthy -->
    ${this.user && html`<p>Welcome ${this.user.name}</p>`}
  `;
}
```

Import `nothing` từ lit:
```javascript
import {LitElement, html, css, nothing} from 'lit';
```

---

## List Rendering

```javascript
render() {
  return html`
    <!-- Basic list -->
    <ul>
      ${this.items.map(item => html`<li>${item.name}</li>`)}
    </ul>

    <!-- Với index -->
    ${this.tabs.map((tab, index) => html`
      <tab-item
        .label=${tab.label}
        ?active=${index === this.activeTab}
        @click=${() => this.activeTab = index}>
      </tab-item>
    `)}

    <!-- Filter + map -->
    ${this.settings
      .filter(s => s.visible)
      .map(s => html`<settings-row .setting=${s}></settings-row>`)
    }
  `;
}
```

---

## `repeat` Directive — Tối ưu list rendering

Khi list có nhiều items và thứ tự thay đổi thường xuyên, dùng `repeat`:

```javascript
import {repeat} from 'lit/directives/repeat.js';

render() {
  return html`
    <ul>
      ${repeat(
        this.items,
        item => item.id,          // key function — giúp lit track items
        item => html`<li>${item.name}</li>` // template function
      )}
    </ul>
  `;
}
```

**Không có `repeat`:** Khi list reorder, lit update mỗi DOM node tại chỗ.
**Có `repeat`:** lit move DOM nodes (hiệu quả hơn nếu có animation hoặc focus state).

---

## `classMap` — Dynamic CSS classes

```javascript
import {classMap} from 'lit/directives/class-map.js';

render() {
  const buttonClasses = {
    'btn': true,                          // luôn có
    'btn-primary': this.variant === 'primary',
    'btn-danger':  this.variant === 'danger',
    'btn-loading': this.isLoading,
    'btn-disabled': this.disabled,
  };

  return html`
    <button class=${classMap(buttonClasses)}>
      ${this.label}
    </button>
  `;
}
```

---

## `styleMap` — Dynamic inline styles

```javascript
import {styleMap} from 'lit/directives/style-map.js';

render() {
  const progressStyles = {
    width: `${this.progress}%`,
    backgroundColor: this.progress > 80 ? '#4caf50' : '#2196f3',
    transition: 'width 0.3s ease',
  };

  return html`
    <div class="progress-bar">
      <div class="fill" style=${styleMap(progressStyles)}></div>
    </div>
  `;
}
```

---

## `ifDefined` — Chỉ set attribute khi có giá trị

```javascript
import {ifDefined} from 'lit/directives/if-defined.js';

render() {
  return html`
    <!-- Nếu this.href là undefined, attribute 'href' sẽ không được set -->
    <a href=${ifDefined(this.href)}>${this.label}</a>

    <!-- Thay vì: href=${this.href} → href="undefined" (string!) -->
  `;
}
```

---

## `ref` — Lấy reference đến DOM element

```javascript
import {ref, createRef} from 'lit/directives/ref.js';

class SearchBar extends LitElement {
  // Tạo ref object
  _inputRef = createRef();

  render() {
    return html`
      <input
        type="search"
        ${ref(this._inputRef)}
        @input=${this._onInput}>
    `;
  }

  focus() {
    // Truy cập DOM element an toàn
    this._inputRef.value?.focus();
  }

  // Alternative: callback ref
  render2() {
    return html`
      <input ${ref(this._onInputCreated)}>
    `;
  }

  _onInputCreated(inputElement) {
    if (inputElement) {
      // element được tạo
      inputElement.focus();
    }
    // inputElement = undefined khi element bị destroy
  }
}
```

---

## `live` — Force sync với DOM giá trị hiện tại

```javascript
import {live} from 'lit/directives/live.js';

render() {
  return html`
    <!-- Dùng live() khi DOM value có thể thay đổi bên ngoài Lit -->
    <!-- Ví dụ: native form elements, contenteditable -->
    <input .value=${live(this.value)}>
  `;
}
```

Thông thường lit skip update nếu nó cho rằng value không thay đổi. `live()` force check giá trị thực tế trong DOM.

---

## `cache` — Giữ hidden DOM thay vì destroy

```javascript
import {cache} from 'lit/directives/cache.js';

render() {
  // Không dùng cache: switch giữa 2 view sẽ destroy/recreate DOM
  // ${this.activeView === 'A' ? html`<view-a>` : html`<view-b>`}

  // Dùng cache: giữ cả 2 views trong memory, chỉ show/hide
  return html`
    ${cache(this.activeView === 'A'
      ? html`<view-a .data=${this.data}></view-a>`
      : html`<view-b .data=${this.data}></view-b>`
    )}
  `;
}
```

Hữu ích khi view có internal state quan trọng (scroll position, focus, form values) mà bạn không muốn mất khi switch.

---

## `unsafeHTML` — Render HTML string (dùng cẩn thận)

```javascript
import {unsafeHTML} from 'lit/directives/unsafe-html.js';

render() {
  // ⚠️ CHỈ dùng với trusted content — XSS risk!
  // Không bao giờ dùng với user input!

  // Use case: rich text từ trusted source (localization strings với markup)
  return html`
    <div class="description">
      ${unsafeHTML(this.trustedHtmlContent)}
    </div>
  `;
}
```

**Trong Chromium WebUI:** Localization strings đôi khi chứa HTML tags. Chromium có `sanitizeInnerHtml` utility để sanitize trước khi dùng.

---

## Template Composition

```javascript
// Tách template thành helpers
_renderHeader() {
  return html`
    <header>
      <h1>${this.title}</h1>
      ${this.subtitle ? html`<p>${this.subtitle}</p>` : nothing}
    </header>
  `;
}

_renderSettingItem(setting) {
  return html`
    <div class="setting-item">
      <span>${setting.label}</span>
      <settings-toggle
        .checked=${setting.value}
        @change=${e => this._onSettingChange(setting.key, e.detail.checked)}>
      </settings-toggle>
    </div>
  `;
}

render() {
  return html`
    ${this._renderHeader()}
    <main>
      ${this.settings.map(s => this._renderSettingItem(s))}
    </main>
  `;
}
```

---

## Pattern thực tế: Empty State

```javascript
render() {
  return html`
    <div class="container">
      ${this._isLoading_ ? html`
        <div class="loading">
          <cr-loading-gradient></cr-loading-gradient>
        </div>
      ` : this._items_.length === 0 ? html`
        <div class="empty-state">
          <img src="empty.svg" alt="">
          <p>No items found</p>
          <button @click=${this._refresh}>Refresh</button>
        </div>
      ` : html`
        <ul>
          ${repeat(
            this._items_,
            item => item.id,
            item => html`<li>${item.name}</li>`
          )}
        </ul>
      `}
    </div>
  `;
}
```

---

## Tóm tắt Directives

| Directive | Import | Dùng khi |
|-----------|--------|---------|
| `repeat` | `lit/directives/repeat.js` | List dài, thứ tự thay đổi |
| `classMap` | `lit/directives/class-map.js` | Dynamic CSS classes |
| `styleMap` | `lit/directives/style-map.js` | Dynamic inline styles |
| `ifDefined` | `lit/directives/if-defined.js` | Optional attributes |
| `ref` | `lit/directives/ref.js` | Cần DOM element reference |
| `live` | `lit/directives/live.js` | Sync với DOM hiện tại |
| `cache` | `lit/directives/cache.js` | Preserve DOM khi ẩn |
| `unsafeHTML` | `lit/directives/unsafe-html.js` | Render HTML string |

→ [Bài tiếp theo: Events](04-events.md)
