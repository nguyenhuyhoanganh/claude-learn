# Bài 3: HTML Templates

## `<template>` là gì?

`<template>` là một HTML element đặc biệt: nội dung bên trong **không được render**, không được parse resources (images không load, scripts không chạy), cho đến khi bạn clone nó ra.

```html
<template id="user-row-template">
  <tr>
    <td class="name"></td>
    <td class="email"></td>
    <td><button class="delete-btn">Delete</button></td>
  </tr>
</template>
```

Khi trang load, DOM trên tồn tại nhưng **không hiển thị gì**. Bạn phải clone nó để dùng.

---

## Clone và dùng template

```javascript
const template = document.getElementById('user-row-template');

function addUserRow(user) {
  // Clone nội dung template
  // true = deep clone (bao gồm children)
  const clone = template.content.cloneNode(true);

  // Điền dữ liệu vào
  clone.querySelector('.name').textContent = user.name;
  clone.querySelector('.email').textContent = user.email;
  clone.querySelector('.delete-btn').addEventListener('click', () => {
    deleteUser(user.id);
  });

  // Thêm vào DOM
  document.querySelector('tbody').appendChild(clone);
}
```

---

## Template trong Custom Elements

Pattern phổ biến là định nghĩa template một lần, dùng cho nhiều instances:

```javascript
// Định nghĩa template một lần (shared across all instances)
const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host { display: flex; align-items: center; gap: 8px; }
    .icon { width: 20px; height: 20px; }
    .label { font-size: 14px; }
  </style>
  <img class="icon">
  <span class="label"></span>
`;

class IconLabel extends HTMLElement {
  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });

    // Clone template vào shadow root
    shadow.appendChild(template.content.cloneNode(true));

    // Lấy references (chỉ cần query một lần trong constructor)
    this._icon = shadow.querySelector('.icon');
    this._label = shadow.querySelector('.label');
  }

  static get observedAttributes() {
    return ['src', 'label'];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'src') this._icon.src = newValue;
    if (name === 'label') this._label.textContent = newValue;
  }
}

customElements.define('icon-label', IconLabel);
```

**Tại sao tạo template bên ngoài class?** Vì `template.content.cloneNode(true)` nhanh hơn nhiều so với parse `innerHTML` mỗi lần tạo instance. Template chỉ parse HTML một lần.

---

## `<template>` với `<slot>` trong Shadow DOM

```javascript
const template = document.createElement('template');
template.innerHTML = `
  <style>
    .card { border: 1px solid #ddd; border-radius: 8px; overflow: hidden; }
    .card-header { background: #f5f5f5; padding: 12px 16px; font-weight: 600; }
    .card-body { padding: 16px; }
    .card-footer { border-top: 1px solid #ddd; padding: 12px 16px; }
  </style>
  <div class="card">
    <div class="card-header">
      <slot name="header">Default Header</slot>
    </div>
    <div class="card-body">
      <slot></slot>
    </div>
    <div class="card-footer">
      <slot name="footer"></slot>
    </div>
  </div>
`;

class CardComponent extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' })
        .appendChild(template.content.cloneNode(true));
  }
}

customElements.define('card-component', CardComponent);
```

```html
<card-component>
  <span slot="header">User Settings</span>
  <p>Configure your preferences below.</p>
  <div slot="footer">
    <button>Cancel</button>
    <button>Save</button>
  </div>
</card-component>
```

---

## Tại sao Polymer/LitElement không dùng `<template>` trực tiếp?

LitElement dùng **Tagged Template Literals** thay vì HTML `<template>` element:

```javascript
// LitElement dùng cú pháp này
render() {
  return html`
    <div class="card">
      <h2>${this.title}</h2>
      <slot></slot>
    </div>
  `;
}
```

`html\`...\`` là một tagged template literal — nó vẫn compile thành DOM operations hiệu quả bên dưới, dùng một kỹ thuật tương tự `<template>` nhưng thêm khả năng binding dữ liệu động.

**Tuy nhiên**, hiểu `<template>` vẫn rất quan trọng vì:
1. LitElement internals dùng nó
2. Chromium có nhiều code cũ dùng `<template>` trực tiếp
3. Giúp bạn debug khi cần

---

## `slotchange` event

Khi nội dung của slot thay đổi:

```javascript
class MyComponent extends HTMLElement {
  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<slot></slot>`;

    shadow.querySelector('slot').addEventListener('slotchange', (e) => {
      const nodes = e.target.assignedNodes({ flatten: true });
      console.log('Slot content changed, nodes:', nodes);
    });
  }
}
```

`assignedNodes()` — lấy danh sách nodes được assign vào slot.

---

## Tóm tắt

| Khái niệm | Ý nghĩa |
|-----------|---------|
| `<template>` | HTML không render, dùng làm blueprint |
| `template.content` | DocumentFragment chứa nội dung |
| `cloneNode(true)` | Clone toàn bộ template để dùng |
| `<slot>` | Vị trí để nhận content từ Light DOM |
| `slotchange` | Event khi slot content thay đổi |
| `assignedNodes()` | Lấy nodes được assign vào slot |

---

## Exercise

Tạo `exercises/ex03-template.html`:

Implement một `<data-table>` component không dùng framework:
- Nhận data qua JavaScript property (không phải attribute)
- Dùng `<template>` cho row template
- Render rows khi data được set
- Có nút "Sort" trong header để sort theo column

```javascript
const table = document.querySelector('data-table');
table.data = [
  { name: 'Hoanganh', role: 'Developer' },
  { name: 'Samsung', role: 'Company' },
];
```

→ [Bài tiếp theo: ES Modules](04-es-modules.md)
