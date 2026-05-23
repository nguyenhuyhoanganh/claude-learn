# File 4 — Events

> File 4 (cuối) trong series 4 file. Đã có WebUI + Mojo (file 1), component (file 2), styling (file 3). File này giải thích **events — cách component nói chuyện với nhau** trong WebUI. Sau khi đọc, bạn biết cách wire event listener, dispatch custom event, communicate giữa parent/child component, và pattern observer cho Mojo push từ C++.

## 1. Vì sao events quan trọng?

Một WebUI page là tree các component lồng nhau:

```text
<settings-ui>
  <settings-toolbar>
    <cr-toolbar-search>...</cr-toolbar-search>
  </settings-toolbar>
  <settings-page>
    <privacy-section>
      <settings-toggle-row label="Cookies"></settings-toggle-row>
      <settings-toggle-row label="Cache"></settings-toggle-row>
    </privacy-section>
  </settings-page>
</settings-ui>
```

Data flow trong tree:
- **Xuống (parent → child)**: qua **property binding** (`[[prop]]`, `.prop=${val}`).
- **Lên (child → parent)**: qua **events** (`dispatchEvent` + listener).

Child không nên reach lên parent trực tiếp — phá vỡ encapsulation. Cách clean là child dispatch event, parent listen. Hiểu events = hiểu cách wire component tree.

---

## 2. Cú pháp listen event trong template

### Polymer — `on-<event-name>`

```html
<button on-click="onClick_">Click</button>
<input on-input="onInput_" on-focus="onFocus_" on-blur="onBlur_">
<my-list on-item-selected="onItemSelected_"></my-list>
```

- `on-<event-name>="<method-name>"`.
- Event name **kebab-case** nếu nhiều từ (`item-selected`).
- Method name **không có `()`** — chỉ tên (Polymer gọi method với event object).

### LitElement — `@<event-name>=${this.handler}`

```javascript
render() {
  return html`
    <button @click=${this.onClick}>Click</button>
    <my-list @item-selected=${this.onItemSelected}></my-list>
  `;
}
```

- `@<event-name>=${method}`.
- Truyền **method reference** trực tiếp (không string).
- Có thể arrow function nhưng tránh: tạo function mới mỗi render → re-bind event mỗi lần.

### Method nhận Event object

```javascript
onClick_(e) {
  console.log(e.target);        // DOM element fire event
  console.log(e.currentTarget); // Element có listener
  console.log(e.detail);        // Custom event data
  console.log(e.model);         // dom-repeat context (Polymer only)
}
```

---

## 3. Native DOM events

Browser cung cấp nhiều native event sẵn:

```html
<!-- Mouse -->
<button on-click="onClick_">
<div on-mouseenter="onEnter_" on-mouseleave="onLeave_">

<!-- Keyboard -->
<input on-keydown="onKey_" on-input="onInput_" on-change="onChange_">

<!-- Form -->
<form on-submit="onSubmit_">
<input on-focus="onFocus_" on-blur="onBlur_">

<!-- Touch (mobile) -->
<div on-touchstart="onTouchStart_" on-touchend="onTouchEnd_">

<!-- Pointer (unified mouse + touch + pen) -->
<div on-pointerdown="onDown_" on-pointermove="onMove_" on-pointerup="onUp_">
```

Native events có sẵn properties chuẩn:
- `e.target` — element fire event (có thể là descendant).
- `e.currentTarget` — element có listener attach.
- `e.preventDefault()` — cancel default action (vd form submit, link click).
- `e.stopPropagation()` — không bubble lên parent.
- `e.key` (keyboard) — `'Enter'`, `'Escape'`, `'ArrowUp'`...
- `e.clientX/Y` (mouse) — position.

### `on-click` vs `on-tap` (Polymer)

| | `on-click` | `on-tap` |
|--|-----------|----------|
| Trigger | Click (mouse) + touch tap | Touch + click với cancel-on-drag |
| Mobile delay | Không (modern browser) | Không |
| Touch + drag | Vẫn fire | KHÔNG fire |
| Standardized | Web standard | Polymer-specific |

→ **Chromium dùng `on-click`**. `on-tap` là legacy từ thời mobile touch chậm. Chromium docs nói thẳng: dùng `on-click` để consistency.

---

## 4. Custom Events — dispatch từ component

Component giao tiếp với parent bằng cách **dispatch custom event**. Đây là kênh "lên" trong tree.

```javascript
class MyToggle extends PolymerElement {
  toggle_() {
    this.checked = !this.checked;

    this.dispatchEvent(new CustomEvent('toggle-changed', {
      detail: {checked: this.checked},
      bubbles: true,
      composed: true,
    }));
  }
}
```

3 options của `CustomEvent`:

### `detail` — payload

```javascript
new CustomEvent('user-selected', {
  detail: {
    userId: 42,
    userName: 'Alice',
    timestamp: Date.now(),
  },
});
```

`detail` là object truyền dữ liệu kèm event. Listener đọc qua `e.detail`.

### `bubbles` — nổi lên DOM tree

```javascript
// bubbles: false (default)
//   Event chỉ fire trên element dispatch, parent KHÔNG nhận.

// bubbles: true
//   Event nổi lên tree, mọi ancestor có thể listen.
```

```html
<parent on-toggle-changed="onChange_">
  <middle>
    <my-toggle></my-toggle>
  </middle>
</parent>
```

`bubbles: true` → `<parent>` nhận event. `false` → không nhận.

### `composed` — vượt qua Shadow DOM boundary

Đây là điểm **đặc trưng Web Components**, gây confusion cho newbie.

```text
DOM tree với shadow:
   <my-app>
     <some-component>      ← Có shadow DOM
       #shadow-root
         <inner-button>    ← Fire event tại đây
```

| | `composed: false` | `composed: true` |
|--|-------------------|------------------|
| Trong shadow root | Bubble bình thường | Bubble bình thường |
| Qua shadow boundary | **Dừng tại boundary** | **Vượt qua** |
| `<my-app>` có nhận? | Không | Có |

```javascript
// bubbles: true, composed: false
// → Event bubble đến shadow root rồi dừng, không pass qua <some-component>

// bubbles: true, composed: true
// → Event bubble lên đến document
```

→ **Convention: `bubbles: true, composed: true`** cho mọi custom event "cross-component". Hầu hết native event (click, input, change) **đã có `composed: true` mặc định** — chỉ cần lưu ý cho `CustomEvent`.

### Template hoàn chỉnh

```javascript
this.dispatchEvent(new CustomEvent('item-selected', {
  detail: { itemId: this.id, item: this.item },
  bubbles: true,
  composed: true,
}));
```

Nhớ thuộc lòng cú pháp này — viết nhiều lần trong code Chromium.

---

## 5. Listen custom event từ child

```html
<!-- Polymer -->
<my-toggle
    checked="{{darkMode}}"
    on-toggle-changed="onToggleChange_">
</my-toggle>
```

```javascript
// Polymer
onToggleChange_(e) {
  const checked = e.detail.checked;
  console.log('Toggle changed to', checked);
}
```

```javascript
// LitElement
render() {
  return html`
    <my-toggle
        .checked=${this.darkMode}
        @toggle-changed=${this.onToggleChange}>
    </my-toggle>
  `;
}

onToggleChange(e) {
  this.darkMode = e.detail.checked;
}
```

→ Pattern: child dispatch event với `detail`, parent listen qua `on-<event-name>` (Polymer) / `@<event-name>` (Lit). **Đây là kênh giao tiếp chính giữa các component.**

---

## 6. Property notify event — `<prop>-changed`

Khi property của Polymer component có `notify: true`:

```javascript
static get properties() {
  return {
    value: { type: String, notify: true },
    isActive: { type: Boolean, notify: true },
  };
}
```

Polymer **tự fire event** mỗi khi `this.value` đổi:
- `value` → `value-changed`
- `isActive` → `is-active-changed` (camelCase → kebab-case)

Parent có 2 cách handle:

```html
<!-- Cách 1: Two-way binding {{}} (Polymer syntactic sugar) -->
<my-input value="{{userInput}}"></my-input>

<!-- Cách 2: Listen event manually -->
<my-input on-value-changed="onValueChanged_"></my-input>
```

```javascript
onValueChanged_(e) {
  this.userInput = e.detail.value;
}
```

Hai cách **tương đương**. `{{...}}` là syntactic sugar cho pattern: listen `*-changed` event + sync ngược về.

→ Đây là vì sao `notify: true` cần thiết cho two-way binding hoạt động.

---

## 7. Event trong `dom-repeat` (Polymer-specific) — `e.model`

```html
<template is="dom-repeat" items="[[users]]">
  <div on-click="onUserClick_">[[item.name]]</div>
</template>
```

```javascript
onUserClick_(e) {
  // e.model chứa local context của dom-repeat
  console.log(e.model.item);     // {name: 'Alice', email: '...'}
  console.log(e.model.index);    // 0, 1, 2, ...

  const userId = e.model.item.id;
}
```

`e.model` chỉ có **trong event handler bên trong `dom-repeat`**. Ngoài dom-repeat = `undefined`.

### Mutate item — dùng Polymer API

```javascript
onToggleActive_(e) {
  const item = e.model.item;
  const idx = e.model.index;

  // SAI — mutate trực tiếp, Polymer không biết
  // item.isActive = !item.isActive;

  // ĐÚNG — dùng path-based set
  this.set(`users.${idx}.isActive`, !item.isActive);
}
```

`this.set('users.0.isActive', ...)` báo cho Polymer biết sub-path đã đổi → bindings update.

---

## 8. Stop propagation — `e.stopPropagation()`

```javascript
onClick_(e) {
  e.stopPropagation();   // Không bubble lên parent
  e.preventDefault();    // Cancel default action (form submit, link navigate)
}
```

Use case phổ biến: nested click handler.

```html
<template is="dom-repeat" items="[[items]]">
  <div class="row" on-click="onRowClick_">
    [[item.name]]
    <button on-click="onDelete_">Delete</button>
  </div>
</template>
```

```javascript
onRowClick_(e) {
  this.navigateTo_(e.model.item);
}

onDelete_(e) {
  e.stopPropagation();  // ← QUAN TRỌNG! Không thì trigger onRowClick_
  this.deleteItem_(e.model.item);
}
```

Click button → event bubble lên `<div class="row">` → trigger luôn `onRowClick_` (navigate). Dùng `stopPropagation` để tránh.

---

## 9. Global event listeners — `addEventListener`

Khi cần listen event không phải trên element trong template (vd document keyboard, window resize):

```javascript
class SearchPage extends PolymerElement {
  ready() {
    super.ready();

    // Bind 'this' để có thể remove sau
    this.keyHandler_ = this.onGlobalKey_.bind(this);
    this.resizeHandler_ = this.onResize_.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this.keyHandler_);
    window.addEventListener('resize', this.resizeHandler_);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    // CLEANUP — bắt buộc, đừng quên
    document.removeEventListener('keydown', this.keyHandler_);
    window.removeEventListener('resize', this.resizeHandler_);
  }

  onGlobalKey_(e) {
    if (e.key === 'Escape') {
      this.close();
    }
  }

  onResize_() {
    this.recalculateLayout_();
  }
}
```

### Bẫy lớn: quên cleanup → memory leak

Component bị destroy nhưng handler vẫn tồn tại trong `document` → vẫn được gọi → giữ reference đến component instance đã chết → memory leak.

→ **Quy tắc**: `addEventListener` trong `connectedCallback` + `removeEventListener` trong `disconnectedCallback`. **Cùng method reference** (đó là vì sao phải `.bind(this)` và store vào field).

---

## 10. Event delegation

Khi có list với nhiều item, thay vì thêm listener vào mỗi item, attach 1 listener trên container và check `e.target`:

```html
<ul on-click="onListClick_">
  <template is="dom-repeat" items="[[items]]">
    <li data-id$="[[item.id]]" data-action="select">
      [[item.name]]
    </li>
  </template>
</ul>
```

```javascript
onListClick_(e) {
  // Tìm li thực sự (target có thể là child của li)
  const li = e.target.closest('li[data-id]');
  if (!li) return;

  const id = li.dataset.id;
  const action = li.dataset.action;

  if (action === 'select') {
    this.selectItem_(id);
  }
}
```

Lợi ích:
- 1 listener thay vì N listener → tiết kiệm memory.
- Item thêm/xoá runtime không cần re-attach listener.

Hữu ích khi list lớn (>50 items).

---

## 11. Communicating up nhiều cấp

Bubbles + composed cho phép event "skip" middle component:

```html
<my-form on-field-changed="onFieldChange_">
  <field-group>
    <my-input></my-input>
  </field-group>
</my-form>
```

```javascript
// my-input dispatch
this.dispatchEvent(new CustomEvent('field-changed', {
  detail: {field: 'email', value: 'a@b.com'},
  bubbles: true,
  composed: true,
}));

// my-form (grandparent) nhận
onFieldChange_(e) {
  console.log(e.detail);  // {field: 'email', value: 'a@b.com'}
}
```

`<field-group>` không cần làm gì — event bubble qua. Pattern này tránh việc mỗi cấp phải re-dispatch event.

---

## 12. Communicating down — không qua event

Down communication **không qua event**. Dùng **property binding**:

```html
<!-- Polymer -->
<my-toggle checked="[[isDarkMode]]"></my-toggle>

<!-- LitElement -->
<my-toggle .checked=${this.isDarkMode}></my-toggle>
```

```javascript
// Parent
this.isDarkMode = true;
// → child.checked tự đổi → DOM update
```

→ Rule cứng: **child → parent qua event, parent → child qua property**. Không trộn lẫn.

---

## 13. Naming convention cho custom event

Chromium dùng **kebab-case** cho custom event name:

```javascript
this.dispatchEvent(new CustomEvent('value-changed', {...}));
this.dispatchEvent(new CustomEvent('item-selected', {...}));
this.dispatchEvent(new CustomEvent('search-query-changed', {...}));
this.dispatchEvent(new CustomEvent('settings-loaded', {...}));
this.dispatchEvent(new CustomEvent('cr-toolbar-menu-tap', {...}));
```

Template binding tương ứng: `on-value-changed`, `on-item-selected`, `@search-query-changed`...

`notify: true` property auto fire event với pattern `<prop-name-kebab>-changed`:
- `firstName` → `first-name-changed`
- `isActive` → `is-active-changed`

---

## 14. Pattern thực tế: form với validation

Code thực tế hơn — form input + validation + submit event:

```javascript
class UserForm extends PolymerElement {
  static get is() { return 'user-form'; }

  static get template() {
    return html`
      <style>
        .field { margin-bottom: 16px; }
        .error { color: red; font-size: 12px; }
        input { padding: 8px; width: 100%; }
        input.invalid { border-color: red; }
      </style>

      <div class="field">
        <label>Name</label>
        <input
          value="{{user.name::input}}"
          class$="[[computeInputClass_(errors.name)]]"
          on-blur="validateName_">
        <template is="dom-if" if="[[errors.name]]">
          <div class="error">[[errors.name]]</div>
        </template>
      </div>

      <div class="field">
        <label>Email</label>
        <input
          type="email"
          value="{{user.email::input}}"
          class$="[[computeInputClass_(errors.email)]]"
          on-blur="validateEmail_">
        <template is="dom-if" if="[[errors.email]]">
          <div class="error">[[errors.email]]</div>
        </template>
      </div>

      <button on-click="submit_" disabled$="[[!isValid_]]">
        Submit
      </button>
    `;
  }

  static get properties() {
    return {
      user: {
        type: Object,
        value: () => ({name: '', email: ''}),
      },
      errors: {
        type: Object,
        value: () => ({}),
      },
      isValid_: {
        type: Boolean,
        computed: 'computeIsValid_(errors.*)',
      },
    };
  }

  computeInputClass_(error) {
    return error ? 'invalid' : '';
  }

  computeIsValid_() {
    return !this.errors.name && !this.errors.email;
  }

  validateName_() {
    if (!this.user.name) {
      this.set('errors.name', 'Tên không được trống');
    } else if (this.user.name.length < 2) {
      this.set('errors.name', 'Tên quá ngắn');
    } else {
      this.set('errors.name', null);
    }
  }

  validateEmail_() {
    const email = this.user.email;
    if (!email) {
      this.set('errors.email', 'Email không được trống');
    } else if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
      this.set('errors.email', 'Email không hợp lệ');
    } else {
      this.set('errors.email', null);
    }
  }

  submit_() {
    this.validateName_();
    this.validateEmail_();

    if (!this.isValid_) return;

    this.dispatchEvent(new CustomEvent('user-submitted', {
      detail: {user: this.user},
      bubbles: true,
      composed: true,
    }));
  }
}

customElements.define(UserForm.is, UserForm);
```

Pattern xuất hiện:
- Two-way binding với native input: `{{user.name::input}}`.
- Conditional render error message với `dom-if`.
- Dynamic class với computed.
- Event `blur` trigger validation.
- Computed property `isValid_`.
- Custom event `user-submitted` lên parent.

---

## 15. Mojo + Events — pattern observer push từ C++

Như file 1 đã giới thiệu: C++ push event xuống JS qua **CallbackRouter** (Mojo). Nhưng đây không phải DOM event — đây là **callback** từ Mojo.

```javascript
class ThemeSettingsPage extends PolymerElement {
  constructor() {
    super();
    this.proxy_ = SamsungQuickSettingsBrowserProxy.getInstance();
    this.listenerIds_ = [];
  }

  connectedCallback() {
    super.connectedCallback();

    // Subscribe Mojo callback từ C++
    const router = this.proxy_.callbackRouter;
    this.listenerIds_.push(
      router.onThemeChanged.addListener(theme => {
        // C++ push event — update state
        this.theme = theme;

        // Optionally — re-dispatch DOM event cho ancestor
        this.dispatchEvent(new CustomEvent('theme-changed', {
          detail: {theme},
          bubbles: true,
          composed: true,
        }));
      }),
    );
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    // Cleanup Mojo listeners
    this.listenerIds_.forEach(
        id => this.proxy_.callbackRouter.removeListener(id));
    this.listenerIds_ = [];
  }
}
```

→ **Pattern**: C++ Mojo push → component update state → optionally re-dispatch DOM event để cho ancestor component biết. Component vừa là **Mojo client** (gọi handler.xxx()) vừa là **Mojo listener** (đăng ký callbackRouter.xxx).

Quan trọng: **luôn cleanup** trong `disconnectedCallback`. Mojo listener leak → memory leak + bug khi component re-add.

---

## 16. Listener trong `dom-repeat` với binding

```html
<template is="dom-repeat" items="[[items]]">
  <my-row
      on-click="onRowClick_"
      on-delete="onDelete_"
      on-edit="onEdit_">
    [[item.name]]
  </my-row>
</template>
```

```javascript
onRowClick_(e) {
  const item = e.model.item;
  // ...
}

onDelete_(e) {
  e.stopPropagation();
  const item = e.model.item;
  this.deleteItem_(item);
}
```

Listener bên ngoài dom-repeat vẫn có `e.model` — vì listener attach trong template của dom-repeat. Nếu listener attach **ngoài** dom-repeat (vd `on-click` trên ancestor không phải `<template>`), không có `e.model`.

---

## 17. `listeners` declaration (Polymer 1 legacy — không dùng)

Polymer 1/2 cho phép khai báo listener trong class:

```javascript
// Polymer 1 — CŨ, đừng dùng
Polymer({
  listeners: {
    'tap': 'onTap_',
    'input.input': 'onInput_',
  },
});
```

→ `PolymerElement` style Polymer 3 không dùng `listeners`. Phải dùng `on-event` trong template hoặc `addEventListener` trong `ready()`. Legacy mode qua `LegacyElementMixin` vẫn có thể support `listeners`, nhưng không dùng cho code mới.

Khi đọc code rất cũ và thấy `listeners`, đó thường là Polymer legacy style.

---

## 18. Polymer gesture events — `track`

Polymer cung cấp gesture events cho drag:

Trong Polymer 3, muốn dùng gesture event trong template, component phải apply `GestureEventListeners` mixin:

```javascript
import {GestureEventListeners} from '@polymer/polymer/lib/mixins/gesture-event-listeners.js';

class MyGestureElement extends GestureEventListeners(PolymerElement) {
  // ...
}
```

```html
<div on-track="onTrack_">Drag me</div>
```

```javascript
onTrack_(e) {
  switch (e.detail.state) {
    case 'start':
      this._dragStartX = e.detail.x;
      break;
    case 'track':
      this.style.transform = `translateX(${e.detail.dx}px)`;
      break;
    case 'end':
      // Snap or finalize
      break;
  }
}
```

`e.detail`:
- `state` — `'start'` | `'track'` | `'end'`.
- `x, y` — current position.
- `dx, dy` — delta từ start.
- `ddx, ddy` — delta từ event trước.

→ Modern Chromium ít dùng `track`. Pointer Events (`pointerdown`, `pointermove`, `pointerup`) thường preferred. `track` chỉ thấy trong code rất cũ.

---

## 19. Lit-specific event options

LitElement support options khi bind event:

```javascript
render() {
  return html`
    <!-- once: chỉ fire 1 lần -->
    <button @click=${{handleEvent: this.handleOnce, once: true}}>
      One-time
    </button>

    <!-- passive: cho scroll events (better perf) -->
    <div @scroll=${{handleEvent: this.onScroll, passive: true}}>
      Scrollable
    </div>

    <!-- capture: fire trong capture phase -->
    <div @click=${{handleEvent: this.onCapture, capture: true}}>
      Capture
    </div>
  `;
}
```

Object form `{handleEvent, once, passive, capture}` là same options của `addEventListener` thứ 3 param.

Polymer không support options trong `on-event` — phải fallback `addEventListener` trong `ready()`.

---

## 20. Bẫy thường gặp với events

| Bẫy | Hậu quả | Cách tránh |
|--|--|--|
| Quên `composed: true` cho custom event | Event không qua shadow boundary | Luôn `composed: true` cho cross-component event |
| Quên `bubbles: true` | Parent không nhận | Luôn `bubbles: true` cho cross-component event |
| Method name có `()` trong Polymer `on-event` | Polymer parse fail | `on-click="onClick_"` không `on-click="onClick_()"` |
| Lambda trong template (Polymer) | Không hoạt động | Phải method reference, không lambda |
| Quên `e.stopPropagation` trong nested click | Trigger parent handler unintentionally | `stopPropagation` cho inner action |
| Quên cleanup global listener | Memory leak | Always remove trong `disconnectedCallback` |
| Quên cleanup Mojo callbackRouter listener | Memory leak + bug | Always `removeListener(id)` |
| Dùng `e.model` ngoài `dom-repeat` | undefined | Chỉ có trong handler **bên trong** dom-repeat template |
| Anonymous function khi `addEventListener` | Không remove được sau | Bind & store function reference |
| Two-way binding `{{}}` không work | Property thiếu `notify: true` | Add `notify: true` cho property |

---

## 21. Patterns thường gặp — bảng tóm tắt

| Use case | Pattern |
|--|--|
| Listen native event | `on-click="handler_"` / `@click=${this.handler}` |
| Dispatch custom event | `dispatchEvent(new CustomEvent(name, {detail, bubbles:true, composed:true}))` |
| Child báo parent | Custom event + `bubbles+composed` |
| Parent set child | Property binding `[[prop]]` / `.prop=${val}` |
| Two-way sync | `notify:true` + `{{prop}}` (Polymer) hoặc bidirectional manual (Lit) |
| Click trong dom-repeat | Listener trong template, dùng `e.model.item` |
| Stop bubbling | `e.stopPropagation()` |
| Cancel default | `e.preventDefault()` |
| Global event (document/window) | `addEventListener` trong `connectedCallback` + cleanup |
| Mojo push từ C++ | `callbackRouter.onXxx.addListener(...)` + cleanup |
| Event delegation cho large list | 1 listener trên container + `e.target.closest()` |
| Item delete trong row có click | `e.stopPropagation()` trong delete handler |

---

## 22. Flow điển hình: button click → C++ → UI update

Combine những gì học từ 4 file:

```text
1. User click <cr-button>
   ↓
2. <cr-button> dispatch native 'click' event (bubbles + composed mặc định)
   ↓
3. Component cha listen on-click="onSave_"
   ↓
4. onSave_() gọi proxy.handler.saveSettings(this.settings)
   ↓ (qua Mojo message pipe)
5. C++ Browser Process: Handler::SaveSettings()
   → Lưu vào PrefService
   → Apply
   → callback.Run(true)
   ↓
6. JS Promise resolve, component update state
   ↓
7. (Optionally) C++ push event xuống các component khác
   → page_->OnSettingsChanged(new_settings)
   ↓ (Mojo push)
8. callbackRouter.onSettingsChanged listener fire
   → Component update state → re-render
   ↓
9. (Optionally) Component dispatch DOM event 'settings-saved'
   → Toast notification component listen, show "Saved"
```

→ Đây là **toàn bộ life cycle** của một user interaction trong WebUI. Hiểu được flow này = hiểu cách Samsung Browser WebUI hoạt động.

---

## 23. Checklist — bạn hiểu file này nếu trả lời được:

1. Khi nào event vượt qua shadow boundary? (`composed: true`)
2. `bubbles` khác `composed` ở điểm nào? (Bubble trong tree / vượt shadow)
3. Listen native event trong Polymer template? (`on-click="handler_"`)
4. `e.detail` chứa gì? (Custom event payload)
5. Tại sao phải `e.stopPropagation()` trong nested click? (Tránh trigger parent handler)
6. Cleanup `addEventListener` ở đâu? (`disconnectedCallback`)
7. `notify: true` liên quan event ra sao? (Auto fire `<prop>-changed`)
8. `e.model` chỉ có khi nào? (Bên trong `dom-repeat` template)
9. C++ push event xuống JS qua cơ chế gì? (Mojo CallbackRouter)
10. Child báo parent qua kênh nào, ngược lại? (Event lên / Property xuống)

---

## 24. Tổng kết series 4 file

Đến đây bạn đã đi qua:

| File | Chủ đề | Kỹ năng |
|--|--|--|
| 1 | WebUI + Mojo | Bức tranh tổng thể: 2 process, Mojo IPC, BrowserProxy pattern |
| 2 | Polymer Custom Elements | Viết được component: `is`, `template`, `properties`, lifecycle |
| 3 | Shadow DOM + Styling | CSS encapsulation, `:host`, slot, design tokens, customize `cr-*` |
| 4 | Events | Communicate component tree, custom event, Mojo observer |

Bạn có thể:
- Đọc code Polymer/Lit trong Samsung Browser và hiểu được flow.
- Viết một WebUI page mới: HTML/CSS/JS + C++ controller + Mojo interface.
- Wire events giữa các component theo Chromium convention.
- Customize `cr-*` element qua CSS custom properties.

Bước tiếp theo (ngoài 4 file này):
- Đọc một WebUI page có sẵn từ đầu đến cuối (vd Settings privacy page).
- Tự tạo một WebUI page nhỏ (vd "samsung-quick-settings") theo PageHandler pattern.
- Học sâu hơn Mojo IDL (`array`, `map`, `union`, async pattern) khi gặp.
- Tham khảo Phase 7 (Thực chiến) trong khoá học nếu cần case study chi tiết.

→ Welcome to Samsung Browser WebUI team!
