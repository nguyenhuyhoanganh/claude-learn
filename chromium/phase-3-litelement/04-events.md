# Bài 4: Events trong LitElement

## Event Binding trong Templates

```javascript
render() {
  return html`
    <!-- Method reference (preferred) -->
    <button @click=${this.handleClick}>Click</button>

    <!-- Arrow function (tạo function mới mỗi render — tránh dùng) -->
    <button @click=${() => this.count++}>+</button>

    <!-- Truyền data qua arrow function -->
    ${this.items.map(item => html`
      <div @click=${() => this.selectItem(item.id)}>${item.name}</div>
    `)}
  `;
}

handleClick(event) {
  console.log('Clicked!', event.target);
}
```

---

## Event Binding với Options

```javascript
render() {
  return html`
    <!-- once: chỉ fire một lần -->
    <button @click=${{handleEvent: this.handleOnce, once: true}}>
      One-time action
    </button>

    <!-- passive: cho scroll events (better performance) -->
    <div @scroll=${{handleEvent: this.onScroll, passive: true}}>
      Scrollable content
    </div>

    <!-- capture: fire trong capture phase thay vì bubble phase -->
    <div @click=${{handleEvent: this.onCapture, capture: true}}>
      Capture clicks
    </div>
  `;
}
```

---

## Dispatching Custom Events

```javascript
class SettingsToggle extends LitElement {
  _handleToggle() {
    this.checked = !this.checked;

    // Chuẩn: CustomEvent với detail
    this.dispatchEvent(new CustomEvent('change', {
      detail: {
        checked: this.checked,
        value: this.value,
      },
      bubbles: true,    // Nổi lên DOM tree
      composed: true,   // Vượt qua Shadow DOM boundary
    }));
  }
}
```

**`bubbles` vs `composed`:**

```
Không có bubbles, không có composed:
  └── shadow-host
      └── #shadow-root
          └── [event fired here] → chỉ lắng nghe được trong shadow

Có bubbles, không có composed:
  └── shadow-host           ← sự kiện dừng ở đây
      └── #shadow-root
          └── [event fires] → bubble trong shadow root, không qua shadow boundary

Có bubbles VÀ composed:
  └── document
      └── body
          └── shadow-host   ← có thể nghe ở đây
              └── #shadow-root
                  └── [event fires] → bubble qua shadow boundary lên document
```

**Rule:** Cho events muốn parent component nghe: `bubbles: true, composed: true`.

---

## Lắng nghe Events từ Child Components

```javascript
class SettingsPage extends LitElement {
  render() {
    return html`
      <!-- Nghe 'change' event từ toggle -->
      <settings-toggle
        label="Dark Mode"
        .checked=${this._darkMode}
        @change=${this._onDarkModeChange}>
      </settings-toggle>

      <!-- Nghe custom event -->
      <search-bar
        @search-query-changed=${this._onSearch}>
      </search-bar>
    `;
  }

  _onDarkModeChange(event) {
    this._darkMode = event.detail.checked;
    this._saveSettings();
  }

  _onSearch(event) {
    this._searchQuery = event.detail.query;
  }
}
```

---

## Event Naming Convention

Chromium WebUI tuân theo convention của Polymer:

```javascript
// Custom events: kebab-case
this.dispatchEvent(new CustomEvent('value-changed', {...}));
this.dispatchEvent(new CustomEvent('search-query-changed', {...}));
this.dispatchEvent(new CustomEvent('items-loaded', {...}));

// Trong HTML: @value-changed, @search-query-changed
```

---

## addEventListener vs Template Binding

```javascript
// Template binding (preferred trong LitElement)
render() {
  return html`<button @click=${this.onClick}>Click</button>`;
}

// addEventListener — dùng khi cần dynamically add/remove
connectedCallback() {
  super.connectedCallback();
  // Bind 'this' để có thể remove sau
  this._boundKeyHandler = this._onKeyDown.bind(this);
  document.addEventListener('keydown', this._boundKeyHandler);
}

disconnectedCallback() {
  super.disconnectedCallback();
  // QUAN TRỌNG: Remove listener để tránh memory leak
  document.removeEventListener('keydown', this._boundKeyHandler);
}
```

---

## Event Delegation

Khi có list item nhiều, thay vì thêm listener vào từng item:

```javascript
render() {
  return html`
    <!-- Một listener trên container thay vì N listeners trên items -->
    <ul @click=${this._onListClick}>
      ${this.items.map(item => html`
        <li data-id=${item.id} data-action="select">${item.name}</li>
      `)}
    </ul>
  `;
}

_onListClick(event) {
  // Tìm target thực sự (có thể click vào child của li)
  const li = event.target.closest('li[data-id]');
  if (!li) return;

  const id = li.dataset.id;
  const action = li.dataset.action;

  if (action === 'select') {
    this._selectItem(id);
  }
}
```

---

## Communicating Up và Down

```
Parent Component
      │
      │  .property=${value}   (xuống)
      ▼
Child Component
      │
      │  @event=${handler}    (lên)
      ▼
Parent Component
```

```javascript
// Parent: truyền data xuống và lắng nghe events lên
class BookmarkManager extends LitElement {
  render() {
    return html`
      <bookmark-list
        .items=${this._bookmarks}          <!-- data xuống -->
        @bookmark-deleted=${this._onDelete} <!-- event lên -->
        @bookmark-edited=${this._onEdit}>
      </bookmark-list>
    `;
  }

  _onDelete(event) {
    const {id} = event.detail;
    this._bookmarks = this._bookmarks.filter(b => b.id !== id);
    this._pageHandler.deleteBookmark(id);
  }
}

// Child: nhận data, dispatch events
class BookmarkList extends LitElement {
  static properties = {
    items: {type: Array},
  };

  render() {
    return html`
      ${this.items.map(item => html`
        <bookmark-item
          .bookmark=${item}
          @delete=${() => this._requestDelete(item.id)}>
        </bookmark-item>
      `)}
    `;
  }

  _requestDelete(id) {
    this.dispatchEvent(new CustomEvent('bookmark-deleted', {
      detail: {id},
      bubbles: true,
      composed: true,
    }));
  }
}
```

---

## Pattern: Mojo Observer + Events

Khi C++ backend push notifications xuống WebUI:

```javascript
class ThemeSettingsPage extends LitElement {
  // Implement Observer interface (nhận callbacks từ C++)
  constructor() {
    super();
    this._receiver = new ThemeObserverReceiver(this);
    this._pageHandler = ThemePageHandlerRemote.getRemote();
  }

  async connectedCallback() {
    super.connectedCallback();

    // Đăng ký observer
    this._pageHandler.setObserver(
      this._receiver.$.bindNewPipeAndPassRemote()
    );

    // Load initial data
    const {theme} = await this._pageHandler.getTheme();
    this._currentTheme = theme;
  }

  // Mojo Observer callback — được C++ gọi khi theme thay đổi
  onThemeChanged(newTheme) {
    this._currentTheme = newTheme; // → trigger re-render
    // Dispatch event cho parent nếu cần
    this.dispatchEvent(new CustomEvent('theme-changed', {
      detail: {theme: newTheme},
      bubbles: true,
      composed: true,
    }));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    // Cleanup Mojo receiver
    this._receiver.$.close();
  }
}
```

---

## Tóm tắt

| Pattern | Cú pháp |
|---------|---------|
| Bind event | `@click=${this.handler}` |
| Dispatch event | `new CustomEvent('name', {detail, bubbles, composed})` |
| Global listener | `addEventListener` trong `connectedCallback` |
| Cleanup | `removeEventListener` trong `disconnectedCallback` |
| Parent → Child | `.property=${value}` |
| Child → Parent | `@event=${handler}` + `dispatchEvent` |

→ [Bài tiếp theo: CSS và Shadow DOM](05-css-shadow-dom.md)
