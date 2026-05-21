# File 3 — Shadow DOM và Styling

> File 3 trong series 4 file. File 1 (WebUI + Mojo) cho bạn bức tranh tổng thể. File 2 (Polymer Custom Elements) dạy viết component. File này giải thích **cách CSS hoạt động trong WebUI** — vì sao style không leak, làm sao customize từ ngoài, và pattern design token mà Chromium dùng khắp nơi.

## 1. Vấn đề mà Shadow DOM giải quyết

Tưởng tượng bạn viết component `<settings-panel>` với CSS:

```css
h2 { color: red; font-size: 24px; }
.item { padding: 16px; border-bottom: 1px solid #eee; }
```

Nếu CSS này load trong page thường, hậu quả:
- **Mọi `<h2>` trong app sẽ đỏ** — kể cả ở phần khác không phải `settings-panel`.
- **Mọi `.item` trong app sẽ bị padding** — collision tên class.
- Ngược lại, CSS global của app sẽ ảnh hưởng vào **bên trong** component của bạn — không kiểm soát được.

Đây là vấn đề **CSS encapsulation** của web. Trước Web Components, giải pháp là dùng BEM naming convention, CSS Modules, hoặc CSS-in-JS — đều là workaround.

**Shadow DOM giải quyết tận gốc**: nó tạo ra một "bong bóng" cô lập cho HTML + CSS bên trong component. CSS không leak ra, không leak vào.

---

## 2. Shadow DOM là gì?

```text
document (Light DOM — DOM bình thường)
├── <header>
├── <main>
│   ├── <settings-panel>            ← Custom element
│   │   #shadow-root (open)         ← Shadow root — ranh giới cô lập
│   │     ├── <style>
│   │     │     h2 { color: red; }  ← CSS chỉ trong shadow
│   │     ├── <h2>                  ← Không ảnh hưởng bởi external CSS
│   │     ├── <div class="item">
│   │     └── <slot>                ← Hiển thị content từ light DOM
│   └── <h2>                        ← Không bị ảnh hưởng bởi shadow CSS
└── <footer>
```

Shadow root là một "mini document" gắn vào element. Bên trong shadow root:
- CSS scope hoàn toàn — không leak.
- DOM selector từ ngoài không "nhìn thấy" được bên trong (vd `document.querySelector('h2')` không thấy `<h2>` trong shadow).
- Event có quy tắc đặc biệt khi vượt qua shadow boundary (xem file 4).

---

## 3. Tạo Shadow DOM thủ công

```javascript
class SettingsPanel extends HTMLElement {
  constructor() {
    super();
    // Tạo shadow root
    const shadow = this.attachShadow({mode: 'open'});

    // Thêm content
    shadow.innerHTML = `
      <style>
        /* CSS này CHỈ áp dụng bên trong shadow */
        h2 { color: #1a73e8; }
        .panel { padding: 16px; }
      </style>
      <div class="panel">
        <h2>Settings</h2>
        <slot></slot>  <!-- placeholder cho content từ ngoài -->
      </div>
    `;
  }
}
```

`mode`:
- **`'open'`** — JS bên ngoài truy cập được qua `element.shadowRoot`.
- **`'closed'`** — Không truy cập được từ ngoài. Hầu như không dùng (gây khó test/debug).

→ **Chromium luôn dùng `'open'`**.

### Polymer và Lit tự attach shadow

Bạn ít khi tự gọi `attachShadow()`. `PolymerElement` và `LitElement` tự làm điều đó cho bạn — chỉ cần viết template + style trong class, framework tự inject vào shadow.

```javascript
// Polymer — không cần gọi attachShadow
class MyPanel extends PolymerElement {
  static get template() {
    return html`
      <style>
        :host { display: block; }
        h2 { color: blue; }
      </style>
      <h2>Title</h2>
      <slot></slot>
    `;
  }
}
```

---

## 4. CSS scope — không leak ra, không leak vào

### Ra ngoài

```javascript
// shadow DOM
shadow.innerHTML = `
  <style>
    button { background: blue; color: white; }
  </style>
  <button>I'm blue</button>
`;
```

Mọi `<button>` ở Light DOM (ngoài shadow) **không bị ảnh hưởng**. CSS đứng yên trong shadow.

### Vào trong

```css
/* style.css của trang */
button { background: green; }
.item { color: red; }
```

CSS này **không vào** bên trong `<settings-panel>`. Trừ khi component cố tình "mở cửa" qua CSS Custom Properties (xem section 7).

→ **Đây là điểm khác biệt căn bản với CSS thường**: component có scope của riêng mình. Bạn có thể đặt `.item` mà không lo trùng tên với app.

---

## 5. `:host` — style chính element

Khi CSS bên trong shadow muốn style **chính cái element chứa shadow** (vd `<settings-panel>` chứ không phải child), dùng `:host`:

```css
/* Style cho <settings-panel> từ bên trong shadow */
:host {
  display: block;
  margin: 8px 0;
}
```

### `:host` với state — pattern phổ biến

```css
/* Khi element có attribute disabled */
:host([disabled]) {
  opacity: 0.5;
  pointer-events: none;
}

/* Khi element có attribute checked */
:host([checked]) {
  background: var(--cr-primary);
}

/* Khi element có class active */
:host(.active) {
  border: 2px solid blue;
}

/* Khi element được focus (hoặc descendant) */
:host(:focus-within) {
  outline: 2px solid var(--cr-focus-color);
}
```

→ Đây là cách style theo state mà không cần class manipulation. Property có `reflectToAttribute: true` cho phép pattern này hoạt động:

```javascript
static get properties() {
  return {
    checked: {
      type: Boolean,
      value: false,
      reflectToAttribute: true,  // ← sync property → HTML attribute
    },
  };
}
```

```css
:host([checked]) {
  background: blue;  /* CSS hoạt động */
}
```

### `:host-context()` — style theo context

```css
/* Khi element nằm trong .dark-theme */
:host-context(.dark-theme) {
  background: #333;
  color: white;
}

/* Khi element nằm trong .compact-mode */
:host-context(.compact-mode) {
  padding: 4px;
}
```

→ Hữu ích cho theme switching. App set `class="dark-theme"` trên `<body>`, mọi component biết "tôi đang trong dark theme".

### Best practice: luôn khai báo `display` cho `:host`

```css
:host { display: block; }       /* Cho component dạng container */
:host { display: inline-block; } /* Cho button-like */
:host { display: flex; }
```

Không khai báo `display` → element là `display: inline` (default của HTMLElement) → margin/padding không hoạt động đúng → bug layout bí ẩn.

---

## 6. `<slot>` — nhận content từ ngoài

Shadow DOM cô lập, nhưng đôi khi bạn muốn user truyền HTML vào component. Dùng `<slot>`:

```javascript
// Component
shadow.innerHTML = `
  <div class="panel">
    <h2>Settings</h2>
    <slot></slot>   <!-- content từ ngoài render vào đây -->
  </div>
`;
```

```html
<!-- User -->
<settings-panel>
  <settings-row label="Dark mode"></settings-row>
  <settings-row label="Notifications"></settings-row>
</settings-panel>
```

Khi render:
```
<settings-panel>
  └── #shadow-root
      └── <div class="panel">
          ├── <h2>Settings</h2>
          └── <slot>            ← projection
              ├── <settings-row label="Dark mode">     (từ light DOM)
              └── <settings-row label="Notifications"> (từ light DOM)
```

### Named slots — nhiều vị trí

```javascript
shadow.innerHTML = `
  <div class="dialog">
    <header><slot name="title">Default Title</slot></header>
    <main><slot></slot></main>     <!-- default slot -->
    <footer><slot name="actions"></slot></footer>
  </div>
`;
```

```html
<my-dialog>
  <span slot="title">Confirm Delete</span>
  <p>Are you sure?</p>           <!-- vào default slot -->
  <div slot="actions">
    <button>Cancel</button>
    <button>Delete</button>
  </div>
</my-dialog>
```

Content có `slot="<name>"` vào named slot tương ứng. Content không có `slot` attribute vào default slot.

### Slot fallback content

```html
<slot>Default Title</slot>
<slot name="actions">
  <button>OK</button>
</slot>
```

Khi user không truyền gì, fallback hiển thị. Hữu ích cho component có content optional.

---

## 7. CSS Custom Properties — "lỗ hổng có kiểm soát"

Shadow DOM cô lập CSS rất chặt. Nhưng đôi khi bạn cần cho user customize component từ ngoài — vd thay đổi màu, padding, font.

**CSS Custom Properties** (CSS variables) là cách chính: chúng **xuyên qua được shadow boundary**.

### Bên trong component

```css
button {
  background: var(--my-button-bg, #1a73e8);  /* default #1a73e8 */
  color: var(--my-button-color, white);
  padding: var(--my-button-padding, 8px 16px);
  border-radius: var(--my-button-radius, 4px);
}
```

### Bên ngoài — user override

```css
/* CSS của app */
my-button {
  --my-button-bg: red;
  --my-button-radius: 20px;
}

.danger-button {
  --my-button-bg: #ea4335;
  --my-button-color: white;
}
```

```html
<my-button>Normal</my-button>
<my-button class="danger-button">Delete</my-button>
```

→ Đây là **API styling chính thức** của component. Bạn chọn property nào expose, user customize những property đó.

### Pattern: design tokens trong Chromium

Chromium dùng pattern này rất nặng — gọi là **design tokens**. Global root khai báo các token, component dùng:

```css
/* Global (load 1 lần trong page) */
:root {
  /* Colors */
  --cr-primary-text-color: #202124;
  --cr-secondary-text-color: #5f6368;
  --cr-card-background-color: #fff;
  --cr-separator-color: rgba(0, 0, 0, 0.06);
  --cr-toggle-on: #1a73e8;
  --cr-toggle-off: #bdbdbd;
  --cr-focus-color: #1a73e8;

  /* Typography */
  --cr-primary-font-size: 13px;
  --cr-body-font-family: 'Roboto', sans-serif;
  --cr-title-font-size: 15px;

  /* Spacing */
  --cr-section-padding: 20px;

  /* Elevation */
  --cr-card-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

/* Dark theme override */
.dark-theme {
  --cr-primary-text-color: #e8eaed;
  --cr-secondary-text-color: #9aa0a6;
  --cr-card-background-color: #292a2d;
  --cr-toggle-on: #8ab4f8;
}
```

Component dùng tokens:

```javascript
class SettingsCard extends PolymerElement {
  static get template() {
    return html`
      <style>
        :host {
          display: block;
          background: var(--cr-card-background-color);
          box-shadow: var(--cr-card-shadow);
          border-radius: 8px;
          padding: var(--cr-section-padding);
        }
        .title {
          color: var(--cr-primary-text-color);
          font-family: var(--cr-body-font-family);
          font-size: var(--cr-title-font-size);
        }
        .subtitle {
          color: var(--cr-secondary-text-color);
          font-size: var(--cr-primary-font-size);
        }
      </style>
      ...
    `;
  }
}
```

→ App switch dark theme bằng cách add class `dark-theme` lên `<body>` — **mọi component tự update** vì token đổi. Component không cần biết gì về theme.

---

## 8. `::slotted()` — style content trong slot

CSS bên trong shadow **không thể** style content được slot vào (vì content đó vẫn thuộc light DOM). Nhưng có exception: `::slotted()`.

```javascript
shadow.innerHTML = `
  <style>
    /* Style mọi element trực tiếp được slot vào */
    ::slotted(*) {
      display: block;
      margin: 0;
      padding: 8px 0;
    }

    /* Chỉ style <p> trong slot */
    ::slotted(p) {
      color: var(--cr-secondary-text-color);
      font-size: 12px;
    }

    /* Chỉ first child */
    ::slotted(:first-child) {
      padding-top: 0;
    }

    /* Style item có class */
    ::slotted(.action-button) {
      font-weight: bold;
    }
  </style>
  <slot></slot>
`;
```

### Giới hạn quan trọng của `::slotted()`

`::slotted()` chỉ match **direct children** của slot, không phải descendants:

```html
<my-list>
  <div class="item">       ← match được ::slotted(div) hoặc ::slotted(.item)
    <span>Nested</span>    ← KHÔNG match ::slotted(span)
  </div>
</my-list>
```

Nếu cần style nested content, dùng CSS Custom Properties hoặc let user style themselves (vì là light DOM, CSS app vẫn hoạt động trên đó).

---

## 9. `::part()` — expose element cụ thể để style từ ngoài

Đôi khi bạn muốn cho user style **một element cụ thể bên trong component**, không phải toàn bộ. Đây là use case cho `part`:

```javascript
// Component
shadow.innerHTML = `
  <style>
    button { background: blue; }
  </style>
  <button part="button">              <!-- expose 'button' part -->
    <span part="icon" class="icon"></span>
    <span part="label"><slot></slot></span>
  </button>
`;
```

```css
/* External CSS */
my-button::part(button) {
  border-radius: 20px;
  font-weight: bold;
}

my-button::part(label) {
  text-transform: uppercase;
}

/* State-based part styling */
my-button:hover::part(button) {
  background: var(--hover-color);
}
```

→ User chỉ style được phần mình expose. Phần internal vẫn an toàn.

`::part()` ít phổ biến hơn CSS variables. Dùng khi bạn cần expose state phức tạp (vd selector kết hợp `:hover`, `:focus`...). Đa số trường hợp, CSS variables đủ dùng.

---

## 10. Focus styles — Chromium convention

Focus indicator là **a11y critical** — keyboard user phải thấy element nào đang focus. Chromium có convention rõ ràng:

```css
/* Ẩn default browser focus ring (browser-specific) */
:host(:focus) {
  outline: none;
}

/* Custom focus ring — CHỈ khi keyboard navigation */
:host(:focus-visible) {
  box-shadow: 0 0 0 2px var(--cr-focus-outline-color);
}

/* Internal focusable element */
button:focus-visible {
  outline: 2px solid var(--cr-focus-outline-color);
  outline-offset: 2px;
}
```

Vì sao `:focus-visible` thay vì `:focus`?
- `:focus` fire cả khi mouse click → ring xuất hiện khi click chuột (ugly UX).
- `:focus-visible` chỉ fire khi keyboard (Tab, Shift+Tab) → ring chỉ xuất hiện khi cần.

→ Tất cả `cr-*` element đã handle focus đúng cách. Bạn chỉ cần dùng `cr-button`, `cr-input`... thay vì raw `<button>`.

---

## 11. Pattern Chromium: shared styles module

Trong Chromium, styles dùng chung được tách thành module:

```javascript
// shared_style.css.js (generated từ shared_style.css)
import {css} from 'lit';

export const sharedStyle = css`
  :host {
    --cr-primary-text-color: #202124;
  }

  .cr-title-text {
    font-size: 15px;
    font-weight: 500;
    color: var(--cr-primary-text-color);
  }

  .cr-secondary-text {
    color: var(--cr-secondary-text-color);
  }
`;
```

Component dùng shared style + component-specific:

```javascript
import {sharedStyle} from './shared_style.css.js';

class SettingsSection extends LitElement {
  static styles = [
    // 1. Shared design tokens
    sharedStyle,
    settingsSharedStyle,

    // 2. Component-specific
    css`
      :host {
        display: block;
        padding: var(--cr-section-padding);
      }

      :host([hidden]) {
        display: none;
      }

      .section-title {
        color: var(--cr-primary-text-color);
        font-family: var(--cr-body-font-family);
        font-size: 13px;
        font-weight: 500;
        margin-bottom: 8px;
      }

      .section-content {
        background: var(--cr-card-background-color);
        border-radius: 8px;
        box-shadow: var(--cr-card-shadow);
        overflow: hidden;
      }

      /* Separator giữa items */
      ::slotted(:not(:last-child)) {
        border-bottom: 1px solid var(--cr-separator-color);
      }
    `,
  ];

  render() {
    return html`
      <h2 class="section-title">${this.title}</h2>
      <div class="section-content">
        <slot></slot>
      </div>
    `;
  }
}
```

→ `static styles = [array]` cho phép compose multiple style modules. Polymer cũng có cơ chế tương tự nhưng cú pháp khác (qua `<style include="...">`).

---

## 12. Polymer-specific: `<style include>`

Polymer có pattern khác để share styles — qua `<style include="<module-name>">`:

```javascript
// shared_style.js — define shared style module
import '@polymer/polymer/lib/elements/dom-module.js';

const template = document.createElement('template');
template.innerHTML = `
  <dom-module id="cr-shared-style">
    <template>
      <style>
        .cr-title-text {
          font-size: 15px;
          font-weight: 500;
        }
      </style>
    </template>
  </dom-module>
`;
document.head.appendChild(template.content);
```

Component dùng:

```javascript
class MyComponent extends PolymerElement {
  static get template() {
    return html`
      <style include="cr-shared-style">
        :host { display: block; }
      </style>
      <h2 class="cr-title-text">Title</h2>
    `;
  }
}
```

→ `<style include="cr-shared-style">` import styles từ module `cr-shared-style`. Trong Chromium, có nhiều module shared như `cr-shared-style`, `cr-icons`, `settings-shared`...

> Đây là Polymer 1/2 legacy pattern. Code mới (LitElement) dùng `static styles = []`. Khi đọc Polymer code Chromium sẽ thấy nhiều `<style include="...">`.

---

## 13. Responsive trong WebUI

WebUI thường không cần responsive như web (vì là browser UI), nhưng vẫn có một số use case:

```javascript
static styles = css`
  .settings-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 16px;
  }

  /* Breakpoint cho wider window */
  @media (min-width: 680px) {
    .settings-grid {
      grid-template-columns: 1fr 1fr;
    }
  }
`;
```

Use case phổ biến:
- Settings page với side-by-side preview ở wide window.
- New Tab Page card layout responsive.
- Window mode khác fullscreen mode.

---

## 14. Animation và transition

```javascript
static styles = css`
  .panel {
    overflow: hidden;
    max-height: 0;
    opacity: 0;
    transition: max-height 0.3s ease-out, opacity 0.3s ease-out;
  }

  .panel.expanded {
    max-height: 500px;
    opacity: 1;
  }

  /* Respect user's motion preferences — A11Y */
  @media (prefers-reduced-motion: reduce) {
    .panel {
      transition: none;
    }
  }
`;
```

A11y: luôn check `prefers-reduced-motion` cho animation. User có thể tắt animation OS-level.

---

## 15. Cấu trúc CSS điển hình của một WebUI component

```css
/* 1. :host — element chính */
:host {
  display: block;
  background: var(--cr-card-background-color);
  border-radius: 8px;
  padding: var(--cr-section-padding);
}

/* 2. :host state variants */
:host([hidden]) { display: none; }
:host([disabled]) { opacity: 0.5; pointer-events: none; }
:host(:focus-within) { outline: 2px solid var(--cr-focus-color); }

/* 3. Internal elements */
.title {
  color: var(--cr-primary-text-color);
  font-size: 15px;
}

.subtitle {
  color: var(--cr-secondary-text-color);
  font-size: 12px;
  margin-top: 2px;
}

/* 4. ::slotted */
::slotted(:not(:last-child)) {
  border-bottom: 1px solid var(--cr-separator-color);
}

/* 5. Responsive */
@media (min-width: 680px) {
  :host { padding: 24px; }
}

/* 6. Motion */
@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; }
}
```

Khi đọc CSS Chromium, thấy structure này khắp nơi.

---

## 16. Debug Shadow DOM trong DevTools

Chrome DevTools support Shadow DOM rất tốt:

1. **Elements panel** → expand custom element → thấy `#shadow-root (open)` → expand → thấy nội dung shadow.
2. **Styles panel** — chọn element bên trong shadow, panel hiện CSS riêng (cả từ shadow style và custom property inherited).
3. **`element.shadowRoot`** trong Console — truy cập shadow programmatically.

```javascript
// Console
const panel = document.querySelector('settings-panel');
panel.shadowRoot.querySelector('.title');  // truy cập từ ngoài
```

> `'closed'` mode shadow không expose `shadowRoot` — hard to debug.

### Truy cập light DOM children

```javascript
// Light DOM children — direct children của tag
panel.children;
panel.firstElementChild;

// Shadow DOM
panel.shadowRoot.children;
panel.shadowRoot.querySelector(...);
```

Phân biệt **light DOM** (con của tag) vs **shadow DOM** (template render bên trong) là then chốt khi debug.

---

## 17. Bẫy thường gặp với Shadow DOM + CSS

| Bẫy | Hậu quả | Cách tránh |
|--|--|--|
| Quên `:host { display: block }` | Margin/padding không hoạt động | Luôn khai báo display cho `:host` |
| CSS app không "vào" shadow | Component không nhận theme | Dùng CSS custom properties |
| `::slotted(.deep .nested)` | Không hoạt động | `::slotted()` chỉ match direct children |
| Style content trong slot không được | Vì content vẫn ở light DOM | Style từ app, hoặc dùng `::slotted()` |
| Override `cr-*` style failed | Component dùng CSS variables | Set custom property, không override class |
| Quên `reflectToAttribute: true` cho `:host([checked])` | CSS không hoạt động | Add `reflectToAttribute` |
| `:focus` ring xuất hiện khi click chuột | Ugly UX | Dùng `:focus-visible` |
| Animation không respect a11y | User bị say khi enabled reduce-motion | Add `@media (prefers-reduced-motion)` |

---

## 18. Customize `cr-*` element từ outside — đúng cách

Khi dùng `cr-button`, `cr-toggle`... và muốn customize:

```css
/* SAI — không vào được shadow của cr-button */
cr-button button {
  background: red;
}

/* SAI — dù tên class trong shadow */
cr-button .button-content {
  font-weight: bold;
}

/* ĐÚNG — qua CSS custom properties */
cr-button {
  --cr-button-background-color: red;
  --cr-button-text-color: white;
}

/* ĐÚNG — qua part (nếu component expose) */
cr-button::part(button) {
  font-weight: bold;
}
```

Mỗi `cr-*` element document property nào nó expose. Check file source hoặc docs khi cần customize.

---

## 19. Khi nào nên/không nên dùng Shadow DOM

### Nên dùng (default cho component)
- Component reusable (button, dialog, toggle).
- Cần style không leak.
- Có internal structure phức tạp.

### Có thể skip (Light DOM)
- Component thuần data — không có UI riêng.
- Form integration (form không thấy input trong shadow → cần special handling).
- Print/SEO critical content (rare trong WebUI).

Polymer cho phép disable shadow DOM nhưng **không nên**. LitElement có tùy chọn `createRenderRoot()` return `this` để render vào light DOM — chỉ dùng khi bạn biết mình cần gì.

→ **Default trong Chromium: shadow DOM bật**. Đừng nghĩ về việc tắt nó.

---

## 20. Checklist — bạn hiểu file này nếu trả lời được:

1. Shadow DOM giải quyết vấn đề gì? (CSS encapsulation)
2. `:host` dùng để làm gì? (Style chính element chứa shadow)
3. Khi nào `:host([disabled])` hoạt động? (Cần `reflectToAttribute: true`)
4. `<slot>` làm gì? (Nhận content từ light DOM)
5. CSS Custom Properties khác CSS bình thường ở điểm nào? (Xuyên qua shadow boundary)
6. `::slotted()` có giới hạn gì? (Chỉ direct children)
7. `::part()` dùng khi nào? (Expose element cụ thể để style từ ngoài)
8. `:focus` vs `:focus-visible`? (Focus-visible chỉ keyboard)
9. Customize `cr-button` đúng cách? (Set custom property, không override class)
10. Design token pattern là gì? (Global CSS variables cho theme + spacing + typography)

---

→ Đọc tiếp: [File 4: Events](04-events.md)
