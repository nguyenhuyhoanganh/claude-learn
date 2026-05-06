# Bài 2: Shadow DOM

## Tại sao cần Shadow DOM?

Hãy tưởng tượng bạn viết component `<settings-panel>`. Component này có CSS riêng:

```css
h2 { color: red; font-size: 24px; }
.item { padding: 16px; border-bottom: 1px solid #eee; }
```

Vấn đề: CSS này sẽ **leak ra toàn bộ trang**, ảnh hưởng đến mọi `<h2>` và `.item` trong app. Ngược lại, CSS của trang cũng sẽ ảnh hưởng vào bên trong component của bạn.

**Shadow DOM giải quyết vấn đề này**: Nó tạo ra một "bong bóng" riêng biệt cho HTML và CSS, cô lập hoàn toàn với phần còn lại.

---

## Shadow DOM là gì?

```
document (Light DOM)
├── <header>
├── <main>
│   ├── <settings-panel>   ← Custom element
│   │   └── #shadow-root  ← Shadow Root (ranh giới cô lập)
│   │       ├── <style>   ← CSS chỉ áp dụng bên trong
│   │       ├── <h2>      ← Không bị ảnh hưởng từ bên ngoài
│   │       └── <div class="item">
│   └── <h2>              ← Không bị ảnh hưởng bởi CSS trong shadow
└── <footer>
```

Shadow root là một "mini document" gắn vào element. CSS bên trong không leak ra ngoài, CSS bên ngoài không tác động vào trong.

---

## Tạo Shadow DOM

```javascript
class SettingsPanel extends HTMLElement {
  constructor() {
    super();

    // Tạo shadow root
    // mode: 'open'  → JS bên ngoài có thể truy cập qua element.shadowRoot
    // mode: 'closed' → Không thể truy cập từ ngoài (dùng cho security)
    const shadow = this.attachShadow({ mode: 'open' });

    // Thêm content vào shadow root
    shadow.innerHTML = `
      <style>
        /* CSS này CHỈ áp dụng bên trong shadow */
        h2 {
          color: #1a73e8;
          font-family: 'Google Sans', sans-serif;
        }
        .panel {
          background: white;
          border-radius: 8px;
          padding: 16px;
        }
      </style>
      <div class="panel">
        <h2>Settings</h2>
        <slot></slot>
      </div>
    `;
  }
}
```

---

## `<slot>` — Cách nhận nội dung từ bên ngoài

Shadow DOM cô lập nội dung, nhưng đôi khi bạn muốn người dùng component truyền HTML vào bên trong. Đó là lúc dùng `<slot>`:

```html
<!-- Người dùng dùng component thế này -->
<settings-panel>
  <settings-row label="Dark mode"></settings-row>
  <settings-row label="Notifications"></settings-row>
</settings-panel>
```

```javascript
// Bên trong shadow DOM
shadow.innerHTML = `
  <div class="panel">
    <h2>Settings</h2>
    <slot></slot>  <!-- Nội dung bên ngoài được "chiếu" vào đây -->
  </div>
`;
```

**Named slots** — Khi cần nhiều vị trí:

```javascript
shadow.innerHTML = `
  <div class="dialog">
    <header><slot name="title">Default Title</slot></header>
    <main><slot></slot></main>  <!-- default slot -->
    <footer><slot name="actions"></slot></footer>
  </div>
`;
```

```html
<my-dialog>
  <span slot="title">Confirm Delete</span>
  <p>Are you sure?</p>  <!-- vào default slot -->
  <div slot="actions">
    <button>Cancel</button>
    <button>Delete</button>
  </div>
</my-dialog>
```

---

## CSS trong Shadow DOM

### CSS không leak ra ngoài

```javascript
shadow.innerHTML = `
  <style>
    /* Chỉ áp dụng trong shadow, không ảnh hưởng trang */
    button { background: blue; color: white; }
    .red { color: red; }
  </style>
  <button>I'm blue</button>
`;
```

Ngoài trang, `button` CSS không bị ảnh hưởng gì cả.

### CSS bên ngoài không vào được bên trong

```css
/* style.css của trang */
button { background: green; }  /* Không ảnh hưởng button trong shadow */
```

### `:host` — Style cho chính element chứa shadow

```javascript
shadow.innerHTML = `
  <style>
    /* Style cho <settings-panel> từ bên trong */
    :host {
      display: block;
      margin: 8px 0;
    }

    /* Khi element có attribute disabled */
    :host([disabled]) {
      opacity: 0.5;
      pointer-events: none;
    }

    /* Context-based: khi element nằm trong .dark-theme */
    :host-context(.dark-theme) {
      background: #333;
      color: white;
    }
  </style>
`;
```

### CSS Custom Properties — "Lỗ hổng" có kiểm soát để customize từ ngoài

```javascript
shadow.innerHTML = `
  <style>
    button {
      /* Dùng CSS variable với fallback value */
      background: var(--button-bg, #1a73e8);
      color: var(--button-color, white);
      border-radius: var(--button-radius, 4px);
    }
  </style>
  <button><slot></slot></button>
`;
```

```css
/* Người dùng có thể customize từ bên ngoài */
my-button {
  --button-bg: #ea4335;
  --button-radius: 20px;
}
```

### `::part()` — Expose element cụ thể để style từ ngoài

```javascript
shadow.innerHTML = `
  <style>
    .inner-button { ... }
  </style>
  <button part="button" class="inner-button">
    <slot></slot>
  </button>
`;
```

```css
/* Bên ngoài có thể style phần "button" được expose */
my-button::part(button) {
  font-weight: bold;
  border: 2px solid currentColor;
}
```

---

## Events và Shadow DOM

Events mặc định **không vượt qua** shadow boundary. Để event đi ra ngoài, cần set `composed: true`:

```javascript
// Bên trong shadow DOM
const button = shadow.querySelector('button');
button.addEventListener('click', () => {
  this.dispatchEvent(new CustomEvent('my-click', {
    bubbles: true,    // nổi lên DOM tree
    composed: true,   // vượt qua shadow boundary
    detail: { value: 'something' }
  }));
});
```

**Lưu ý:** Event `click` của browser (và nhiều native events) có `composed: true` mặc định, nên chúng tự động bubble qua shadow boundary.

---

## Shadow DOM trong Chromium WebUI

Polymer và LitElement tự động tạo shadow DOM cho mỗi component:

```javascript
// LitElement tự gọi this.attachShadow({ mode: 'open' }) cho bạn
class CrButtonElement extends LitElement {
  static get styles() {
    return css`
      /* Tự động scoped vào shadow DOM */
      :host { display: inline-flex; }
      button { ... }
    `;
  }

  render() {
    return html`<button><slot></slot></button>`;
  }
}
```

Trong Chromium source, bạn sẽ thấy CSS files như `cr_button.css` — chúng được load vào shadow DOM của component tương ứng, không phải global style.

---

## Tóm tắt

| Tính năng | Mục đích |
|-----------|----------|
| `attachShadow()` | Tạo shadow root, cô lập DOM và CSS |
| `<slot>` | Nhận nội dung từ bên ngoài vào vị trí cụ thể |
| `:host` | Style cho chính element từ bên trong |
| `CSS custom properties` | Cho phép customize có kiểm soát từ ngoài |
| `::part()` | Expose element cụ thể để style từ ngoài |
| `composed: true` | Cho phép event vượt qua shadow boundary |

---

## Exercise

Mở `exercises/ex02-shadow-dom.html` và implement `<user-card>` component:
- Dùng Shadow DOM để cô lập styles
- Nhận `name`, `role`, `avatar-url` qua attributes
- Dùng `<slot>` cho phần description
- Expose `::part(avatar)` để người dùng có thể style avatar từ ngoài
- Test: thêm CSS global `div { color: red }` và verify nó không ảnh hưởng bên trong

→ [Bài tiếp theo: HTML Templates](03-html-templates.md)
