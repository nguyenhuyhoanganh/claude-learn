# Bài 1: Custom Elements

## Tại sao cần học cái này?

Polymer và LitElement **đều build trên Web Components**. Web Components là chuẩn của trình duyệt, không phải thư viện. Hiểu nền tảng này, bạn sẽ hiểu Polymer làm gì "behind the scenes".

Web Components gồm 3 phần:
1. **Custom Elements** — tự định nghĩa HTML tag mới (bài này)
2. **Shadow DOM** — encapsulate HTML/CSS bên trong component (bài 2)
3. **HTML Templates** — template có thể clone và tái dùng (bài 3)

---

## Custom Elements là gì?

Bình thường HTML có sẵn các tag: `<div>`, `<button>`, `<input>`. Custom Elements cho phép bạn tạo tag riêng:

```html
<my-button label="Click me"></my-button>
<user-avatar name="Hoanganh" size="large"></user-avatar>
<settings-panel theme="dark"></settings-panel>
```

Đây là **chuẩn của trình duyệt** — không cần framework, không cần build tool.

---

## Cách định nghĩa Custom Element

```javascript
// 1. Tạo class kế thừa HTMLElement
class MyButton extends HTMLElement {

  // Chạy khi element được tạo ra (new MyButton() hoặc parser gặp tag)
  constructor() {
    super(); // BẮT BUỘC phải gọi super() đầu tiên
    console.log('MyButton được tạo');
  }

  // Chạy khi element được thêm vào DOM
  connectedCallback() {
    this.innerHTML = `<button>${this.getAttribute('label') || 'Button'}</button>`;
  }

  // Chạy khi element bị xóa khỏi DOM
  disconnectedCallback() {
    console.log('MyButton bị xóa khỏi DOM');
  }

  // Chạy khi attribute thay đổi (phải khai báo observedAttributes)
  attributeChangedCallback(name, oldValue, newValue) {
    console.log(`Attribute "${name}" đổi từ "${oldValue}" thành "${newValue}"`);
    if (name === 'label') {
      const btn = this.querySelector('button');
      if (btn) btn.textContent = newValue;
    }
  }

  // Khai báo những attribute nào sẽ trigger attributeChangedCallback
  static get observedAttributes() {
    return ['label', 'disabled'];
  }
}

// 2. Đăng ký tag name với browser
customElements.define('my-button', MyButton);
```

**Quy tắc đặt tên:** Tag name phải có **dấu gạch ngang** (`-`). Lý do: browser dành tên không có `-` cho HTML tiêu chuẩn, tránh xung đột.

---

## Lifecycle của Custom Element

```
HTML parser gặp <my-button>
        ↓
  constructor()          ← Khởi tạo, KHÔNG được đọc attributes ở đây
        ↓
  attributeChangedCallback()  ← Nếu element có attributes
        ↓
  connectedCallback()    ← Element đã vào DOM, an toàn để render
        ↓
  [element hoạt động bình thường]
        ↓
  disconnectedCallback() ← Element bị remove khỏi DOM
```

**Lưu ý quan trọng:** Không làm DOM operations trong `constructor()`. Browser có thể tạo element trước khi nó vào DOM (ví dụ: `document.createElement('my-button')`). Hãy làm trong `connectedCallback()`.

---

## Customized Built-in Elements

Bạn cũng có thể extend element có sẵn:

```javascript
class FancyButton extends HTMLButtonElement {
  constructor() {
    super();
    this.addEventListener('click', () => {
      this.classList.add('clicked');
    });
  }
}

customElements.define('fancy-button', FancyButton, { extends: 'button' });
```

```html
<!-- Dùng như này -->
<button is="fancy-button">Click</button>
```

---

## Ví dụ thực tế: Settings Toggle

Đây là ví dụ gần với công việc thực tế trong Samsung Browser WebUI:

```javascript
class SettingsToggle extends HTMLElement {
  static get observedAttributes() {
    return ['checked', 'label', 'disabled'];
  }

  constructor() {
    super();
    this._checked = false;
  }

  connectedCallback() {
    this._render();
    this.querySelector('input').addEventListener('change', (e) => {
      this._checked = e.target.checked;
      // Dispatch custom event để parent component nghe
      this.dispatchEvent(new CustomEvent('change', {
        detail: { checked: this._checked },
        bubbles: true,   // event nổi lên DOM tree
        composed: true,  // vượt qua Shadow DOM boundary (quan trọng!)
      }));
    });
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'checked') this._checked = newValue !== null;
    if (name === 'label' || name === 'disabled') this._render();
  }

  _render() {
    const label = this.getAttribute('label') || '';
    const disabled = this.hasAttribute('disabled');
    this.innerHTML = `
      <label>
        <input type="checkbox" ${this._checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
        <span>${label}</span>
      </label>
    `;
  }
}

customElements.define('settings-toggle', SettingsToggle);
```

```html
<settings-toggle label="Enable dark mode" checked></settings-toggle>
```

---

## Custom Elements trong Chromium

Trong Chromium WebUI, bạn sẽ thấy pattern này khắp nơi:

```javascript
// Từ chrome/browser/resources/settings/
class CrToggleElement extends PolymerElement { ... }
customElements.define('cr-toggle', CrToggleElement);

class SettingsRadioGroupElement extends PolymerElement { ... }
customElements.define('settings-radio-group', SettingsRadioGroupElement);
```

Polymer và LitElement làm cho việc viết Custom Elements dễ hơn — thay vì tự viết `_render()`, framework tự động re-render khi data thay đổi.

---

## Kiểm tra Custom Element đã đăng ký

```javascript
// Kiểm tra một element có được đăng ký chưa
customElements.get('my-button'); // Trả về class hoặc undefined

// Chờ cho đến khi element được upgrade (hữu ích khi script load async)
customElements.whenDefined('my-button').then(() => {
  console.log('my-button đã sẵn sàng');
});
```

---

## Tóm tắt

| Lifecycle | Khi nào | Làm gì |
|-----------|---------|--------|
| `constructor()` | Element được tạo | Setup ban đầu, KHÔNG đọc DOM/attributes |
| `connectedCallback()` | Vào DOM | Render, add event listeners |
| `disconnectedCallback()` | Ra khỏi DOM | Cleanup, remove event listeners |
| `attributeChangedCallback()` | Attribute thay đổi | Cập nhật UI |

---

## Exercise

Tạo file `exercises/ex01-counter.html` và implement `<click-counter>` element:

- Hiển thị số đếm bắt đầu từ `start` attribute (mặc định 0)
- Có nút "+" và "-"
- Khi số thay đổi, dispatch event `count-changed` với `detail.count`
- Khi count = 0, nút "-" bị disable

**Gợi ý:**
```html
<click-counter start="5"></click-counter>
```

→ [Bài tiếp theo: Shadow DOM](02-shadow-dom.md)
