# Bài 1: Polymer là gì? Và vì sao Chromium chọn Polymer?

Bài này không dạy code. Mục đích là trả lời các câu hỏi: **Polymer ra đời để giải vấn đề gì? Có những phiên bản nào? Vì sao Chromium chọn nó? Vì sao Samsung Browser đến giờ vẫn dùng?** Hiểu được những điều này, bạn mới biết khi đọc code Polymer sẽ thấy "kiểu cũ" nhìn khác lạ ở đâu.

Nếu bạn chỉ muốn viết được component ngay, có thể skip qua [Bài 2](02-polymer-element.md). Nhưng đọc bài này 15 phút sẽ tiết kiệm hàng giờ confused sau.

## Bối cảnh — Web năm 2013

Năm 2013, web frontend cực **lộn xộn**:
- jQuery chiếm dominant nhưng chỉ là utility, không phải framework component.
- AngularJS (1.x) ra mắt 2010, complex và có scope tự định nghĩa.
- React vừa ra (2013) — nhưng chưa phổ biến.
- Backbone, Ember, Knockout... mỗi cái một phong cách.

**Vấn đề lớn**: Mỗi framework có cách định nghĩa "component" riêng — không thể tái sử dụng giữa các framework. Một `<my-button>` viết bằng Angular không xài được trong React.

Cùng năm đó, **W3C** đang chuẩn hoá một bộ specs gọi là **Web Components**:
- **Custom Elements** — định nghĩa HTML tag mới.
- **Shadow DOM** — encapsulate DOM/CSS.
- **HTML Templates** — template chưa render.
- **HTML Imports** — import HTML file khác (về sau bị deprecate).

→ Web Components là **chuẩn của browser**, không phụ thuộc framework. Component viết bằng Web Components dùng được mọi nơi.

**Vấn đề thực tế năm 2013**: Spec mới, browser support chậm, syntax raw rất verbose. Mỗi component đơn giản phải viết hàng trăm dòng `attachShadow + querySelector + attributeChangedCallback...`.

Google nói: "OK, ta viết một thư viện **làm cho Web Components dễ dùng** + **polyfill cho browser chưa support**" — đó là **Polymer**.

## Polymer — sinh ra để làm gì

> **Polymer** = thư viện của Google để viết **Web Components dễ hơn** + **polyfill** để chạy trên browser cũ.

Polymer **không phải framework như Angular/React**. Nó là thư viện mỏng phía trên Web Components standard. Tôn chỉ:

1. **Use the platform** — dùng tối đa native browser, không build virtual DOM mới.
2. **HTML-first** — template trong file `.html`, không phải JSX.
3. **Two-way data binding** — declarative, gắn DOM với JS property.
4. **Mọi thứ là Custom Element** — page, route, dialog đều là tag.

```text
   Trước Polymer (vanilla Web Components):
   ────────────────────────────────────────
   class MyButton extends HTMLElement {
     constructor() {
       super();
       this.attachShadow({mode: 'open'});
     }
     connectedCallback() {
       this.shadowRoot.innerHTML = `
         <style>...</style>
         <button>${this.label || 'Click'}</button>
       `;
     }
     static get observedAttributes() { return ['label']; }
     attributeChangedCallback(name, oldVal, newVal) {
       if (name === 'label') {
         this.shadowRoot.querySelector('button').textContent = newVal;
       }
     }
   }
   customElements.define('my-button', MyButton);
   
   → 15+ dòng, dễ sai, không có data binding tự động.

   Với Polymer:
   ────────────
   class MyButton extends PolymerElement {
     static get template() {
       return html`<button>[[label]]</button>`;
     }
     static get properties() {
       return { label: { type: String, value: 'Click' } };
     }
   }
   customElements.define('my-button', MyButton);
   
   → 8 dòng. Label thay đổi → button text tự update.
```

## Lịch sử Polymer — 3 phiên bản, khác biệt rất quan trọng

Đây là **chỗ confusing nhất** cho người mới. Khi đọc code Chromium, bạn phải biết bạn đang xem phiên bản nào.

### Polymer 0.x (2013-2015) — Experimental

Bản alpha/beta. Syntax dùng `<polymer-element>` tag, HTML imports. **Đừng đọc code Polymer 0.x** — chỉ tồn tại trong project rất cũ. Chromium chưa từng dùng nhiều.

### Polymer 1.x (2015) — First stable

Cú pháp:

```html
<!-- my-button.html -->
<link rel="import" href="../polymer/polymer.html">

<dom-module id="my-button">
  <template>
    <style>
      button { padding: 8px 16px; }
    </style>
    <button>[[label]]</button>
  </template>

  <script>
    Polymer({
      is: 'my-button',
      properties: {
        label: { type: String, value: 'Click' }
      }
    });
  </script>
</dom-module>
```

Đặc trưng:
- HTML Imports (`<link rel="import">`).
- `<dom-module>` element wrap template + script.
- `Polymer({...})` — **function call**, không phải class.
- Component và styles bundled trong 1 file `.html`.

**Chromium dùng Polymer 1 cho `chrome://settings` và nhiều WebUI page từ 2015 đến ~2018.**

### Polymer 2.x (2017) — Transition

Bridge giữa 1 và 3. Vẫn HTML imports nhưng giờ là **ES6 class**:

```html
<dom-module id="my-button">
  <template>
    <button>[[label]]</button>
  </template>
  <script>
    class MyButton extends Polymer.Element {
      static get is() { return 'my-button'; }
      static get properties() {
        return { label: { type: String, value: 'Click' } };
      }
    }
    customElements.define(MyButton.is, MyButton);
  </script>
</dom-module>
```

Đặc trưng:
- Bỏ `Polymer({...})` function, dùng `class extends Polymer.Element`.
- Vẫn HTML imports.
- Hybrid: code 2.x chạy được trên Polymer 1 với compat shim.

Polymer 2 không phổ biến lâu — chỉ là bước trung gian.

### Polymer 3.x (2018) — Modern (Chromium hiện tại)

Big rewrite. Bỏ HTML Imports, chuyển sang **ES modules**:

```javascript
// my-button.js (không phải .html nữa)
import {PolymerElement, html} from '@polymer/polymer/polymer-element.js';

class MyButton extends PolymerElement {
  static get template() {
    return html`
      <style>
        button { padding: 8px 16px; }
      </style>
      <button>[[label]]</button>
    `;
  }

  static get is() { return 'my-button'; }

  static get properties() {
    return {
      label: { type: String, value: 'Click' }
    };
  }
}

customElements.define(MyButton.is, MyButton);
```

Đặc trưng:
- **File `.js` thay vì `.html`** — code dùng ES modules.
- Template trong tagged template literal `html\`\`` (giống LitElement sau này).
- Không còn `<dom-module>`, không còn HTML imports.
- Có thể import từ npm: `@polymer/polymer`.

→ **Chromium hiện tại dùng Polymer 3**. Samsung Browser cũng vậy. **Khoá học này dạy Polymer 3**.

> Trong tài liệu khi nói "Polymer" mà không nói version, mặc định là Polymer 3.

## Vì sao Chromium chọn Polymer?

Lý do thực dụng năm 2015:

1. **Google sở hữu cả Chromium và Polymer** — kiểm soát toàn bộ stack.
2. **Web Components là standard** — không phụ thuộc framework bên ngoài (React/Vue có thể bị Facebook/cộng đồng thay đổi).
3. **Material Design** — Google muốn Material Design lan rộng, build "Paper elements" (giờ là `paper-*`) bằng Polymer.
4. **chrome://settings** đang được rewrite từ HTML/jQuery sang component-based — chọn Polymer.
5. **iron-* elements** (basic UI building blocks) sẵn có và polyfilled tốt cho IE11.

Kết quả: phần lớn UI nội bộ của Chromium (settings, NTP, history, downloads, bookmarks, devtools) **được viết hoặc rewrite bằng Polymer** giai đoạn 2015-2018.

## Polymer → LitElement: cuộc dịch chuyển

Từ ~2019, Google bắt đầu build **lit-html + LitElement** — kế thừa tinh thần của Polymer nhưng:

- Bỏ two-way binding (cause nhiều bugs).
- Bỏ properties phức tạp (notify, computed, observers).
- Reactive đơn giản hơn (chỉ re-render khi property thay đổi).
- Performance tốt hơn (lit-html template caching cực hiệu quả).
- TypeScript-first.

→ **LitElement** chính là "next gen Polymer". Polymer team (cùng người) build LitElement.

Chromium **đang migrate** dần từ Polymer sang LitElement. Cụ thể:

| Module | Trạng thái 2026 |
|---|---|
| `chrome://settings` | Phần lớn vẫn Polymer 3, một số sub-page đã LitElement |
| `chrome://history` | Đang migrate |
| `chrome://downloads` | Đã LitElement |
| `chrome://bookmarks` | Polymer 3 |
| `chrome://new-tab-page` | Hybrid |
| Code mới sau 2022 | LitElement |
| `cr-*` shared library | Đã migrate sang LitElement (`cr_lit_element_*`) |

→ Samsung Browser (fork Chromium tại thời điểm cụ thể) **đa số là Polymer 3**. Phải biết cả 2.

## Polymer vs các framework khác — bảng so sánh nhanh

| | Polymer 3 | LitElement | React | Vue |
|---|---|---|---|---|
| Standard-based | Web Components | Web Components | Custom (JSX, virtual DOM) | Custom |
| Template syntax | `html\`[[prop]]\`` | `html\`${this.prop}\`` | JSX | Template directives |
| Two-way binding | **Có** (`{{prop}}`) | Không | Không (manual) | `v-model` |
| Reactive properties | Có | Có (cleaner) | State + props | Reactivity system |
| Shadow DOM | Default | Default | Optional | Optional |
| Bundle size | ~30 KB | ~5-7 KB | ~40+ KB | ~30 KB |
| Native browser feel | Cao | Cao | Trung | Trung |
| TypeScript support | Tốt | Tốt nhất | Tốt | Tốt |
| Vẫn được Google maintain | Yes (security only) | Yes (active) | N/A | N/A |

## Tại sao bạn vẫn phải học Polymer (dù nó "cũ")?

Lý do duy nhất nhưng đủ mạnh:

> **80%+ code WebUI bạn đụng tay sửa trong Samsung Browser là Polymer 3.**

Không học Polymer = không hiểu code = không sửa được bug = không thêm feature được.

Tin tốt: Polymer 3 không quá phức tạp. Nếu đã quen Web Components (Phase 1), học Polymer 3 mất ~1-2 tuần.

## Bộ thuật ngữ Polymer cần thuộc

Từ giờ đến hết phase này, bạn sẽ gặp các từ sau liên tục:

| Thuật ngữ | Ý nghĩa |
|---|---|
| **PolymerElement** | Base class — kế thừa từ đây để tạo Polymer component |
| **Property** | Biến public của component, **reactive** — thay đổi → DOM update |
| **Observer** | Hàm tự chạy khi property thay đổi |
| **Computed property** | Property tính từ properties khác |
| **Binding** | Gắn property với DOM (`[[prop]]` hoặc `{{prop}}`) |
| **`[[...]]`** | One-way binding (downward) |
| **`{{...}}`** | Two-way binding (cả 2 chiều) |
| **`notify: true`** | Cho phép property "thông báo" thay đổi lên parent (cho two-way binding) |
| **`dom-repeat`** | Element render list |
| **`dom-if`** | Element render conditional |
| **`dom-bind`** | Auto-bind template ở top level |
| **Mixin** | Function trả về class — pattern thay cho behavior trong Polymer 3 |
| **Behavior** | Pattern cũ (Polymer 1) — đã thay bằng mixin trong Polymer 3 |
| **`on-tap`** | Event listener cho tap (touch + click) |
| **`iron-*`** | Element library cơ bản (iron-icon, iron-list...) |
| **`paper-*`** | Element library Material Design (paper-button, paper-input...) |
| **`cr-*`** | Element library của Chromium (cr-button, cr-toggle...) |

## Phong cách code trong Chromium

Chromium có **quy ước riêng** khi viết Polymer (khác với tutorial trên Polymer.dev):

1. **TypeScript** thay vì JavaScript (hầu hết code mới).
2. **`cr-*` elements** thay vì `paper-*` (Material Design có `cr-` version riêng cho Chromium).
3. **`html_to_wrapper`** convert HTML template → TypeScript module ở compile time.
4. **`I18nMixin`** cho i18n.
5. **`BrowserProxy` pattern** wrap Mojo calls.
6. **Strict private fields** với suffix `_` (vd `this.settings_`, method `onClick_()` — Chromium convention dùng underscore ở **cuối** chứ không phải đầu).
7. **`PolicyControlledIndicatorMixin`** cho settings controlled by enterprise policy.

Sẽ học từng cái trong các bài sau.

## Hello World Polymer 3 — chạy thật

Để cảm nhận Polymer 3 trước khi đi sâu. Setup tối giản (không cần Chromium):

`hello.html`:
```html
<!DOCTYPE html>
<html>
<head>
  <script type="importmap">
  {
    "imports": {
      "@polymer/polymer/": "https://unpkg.com/@polymer/polymer@3.5.1/"
    }
  }
  </script>
</head>
<body>
  <hello-element name="World"></hello-element>

  <script type="module">
    import {PolymerElement, html} from '@polymer/polymer/polymer-element.js';

    class HelloElement extends PolymerElement {
      static get template() {
        return html`
          <style>
            :host {
              display: block;
              padding: 16px;
              background: #eef;
              font-family: sans-serif;
            }
            h1 { color: #1a73e8; }
          </style>
          <h1>Hello, [[name]]!</h1>
          <input value="{{name::input}}" placeholder="Type your name">
          <p>Bạn nhập: <strong>[[name]]</strong></p>
        `;
      }

      static get is() { return 'hello-element'; }

      static get properties() {
        return {
          name: {
            type: String,
            value: 'World',
          },
        };
      }
    }

    customElements.define(HelloElement.is, HelloElement);
  </script>
</body>
</html>
```

Mở file này trong Chrome → bạn thấy "Hello, World!". Gõ vào input → text trên `<h1>` đổi theo **ngay lập tức** (two-way binding `{{name::input}}`).

→ Đây là điểm bán hàng số một của Polymer: declarative two-way binding.

## Tóm tắt bài 1

- **Polymer** = thư viện của Google để viết Web Components dễ hơn (2013).
- 3 phiên bản lớn: 1.x (HTML imports + `Polymer({})`), 2.x (transition), **3.x (ES modules + class — Chromium hiện dùng)**.
- Chromium chọn Polymer vì: standard-based, Material Design, Google control.
- LitElement là "next gen Polymer" — đơn giản hơn, performance hơn. Chromium đang migrate.
- Samsung Browser fork: **80%+ code WebUI vẫn là Polymer 3** — phải học.
- Bộ thuật ngữ: PolymerElement, property, observer, binding, dom-repeat, mixin.

**Bài kế tiếp** → [Bài 2: PolymerElement class — tạo component đầu tiên](02-polymer-element.md)
