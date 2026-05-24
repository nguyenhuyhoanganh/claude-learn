# Bài 6: Events và Gestures

Bài này dạy:
- Cú pháp `on-event` trong template.
- Custom events: dispatch, listen, bubbles vs composed.
- Polymer gesture events: `tap`, `down`, `up`, `track`.
- Event handling trong dom-repeat (e.model pattern).
- Communicate giữa parent/child component.

## Cú pháp `on-event` trong template

```html
<button on-click="onClick_">Click</button>
<input on-input="onInput_" on-focus="onFocus_" on-blur="onBlur_">
<my-list on-item-selected="onItemSelected_"></my-list>
```

`on-<event-name>="<method-name>"`:
- `<event-name>` = tên event (kebab-case nếu nhiều từ: `item-selected`).
- `<method-name>` = tên method của component (không có dấu ngoặc đơn `()`).

Method nhận `Event` object:

```javascript
onClick_(e) {
  console.log(e.target);    // DOM element fire event
  console.log(e.detail);    // Custom event data (nếu là CustomEvent)
  console.log(e.model);     // dom-repeat local context (nếu trong dom-repeat)
}
```

### `on-tap` vs `on-click` — khác biệt

```html
<button on-click="onTap_">Click only</button>
<button on-tap="onTap_">Touch + Click</button>
```

| | `on-click` | `on-tap` |
|---|---|---|
| Trigger | Click (mouse) | Tap (touch + click) |
| Mobile touch | Có delay ~300ms | Không delay |
| Touch + drag | Vẫn fire | KHÔNG fire (drag cancel) |
| Standardized | Có (web standard) | Polymer-specific |

→ Trong Chromium Polymer code, **`on-click` được dùng**. `on-tap` là legacy từ thời mobile touch chậm. Chromium nói thẳng: dùng `on-click` để consistency.

## Custom Events — dispatch

Đây là cách component **giao tiếp lên parent**.

```javascript
class MyToggle extends PolymerElement {
  toggleHandler_() {
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

### `bubbles` — event nổi lên DOM tree

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

Nếu `bubbles: true`, `<parent>` nhận event. Nếu `false`, không nhận.

### `composed` — vượt qua Shadow DOM boundary

Đây là **đặc trưng Web Components**.

```text
Light DOM tree:
   <my-app>
     <some-component>      ← Có shadow DOM
       #shadow-root
         <inner-button>    ← Fire event tại đây
```

`bubbles: true` nhưng `composed: false`:
- Event nổi đến `<inner-button>`, lên đến `#shadow-root`.
- **Dừng tại shadow root**, không pass qua `<some-component>` → `<my-app>`.

`bubbles: true` và `composed: true`:
- Event vượt qua mọi shadow boundary → đến document root.

→ **Phổ biến: `bubbles: true, composed: true`** cho event "cross-component". Đây là default cần thiết để parent nhận được event từ child.

## Lắng nghe event từ child trong template

```html
<my-toggle 
    checked="{{darkMode}}"
    on-toggle-changed="onToggleChange_">
</my-toggle>
```

```javascript
onToggleChange_(e) {
  const checked = e.detail.checked;
  console.log('Toggle changed to', checked);
}
```

→ Pattern: child dispatch custom event với `detail`, parent listen qua `on-<event-name>`.

## Property notify event — `<prop>-changed`

Khi property có `notify: true` đổi:

```javascript
// Child
static get properties() {
  return {
    value: { type: String, notify: true },
  };
}
```

Polymer auto fire `value-changed` event mỗi khi `this.value` đổi.

```html
<!-- Parent có 2 cách handle: -->

<!-- Cách 1: Two-way binding {{}} -->
<my-input value="{{userInput}}"></my-input>

<!-- Cách 2: Listen event manually -->
<my-input on-value-changed="onValueChanged_"></my-input>
```

```javascript
onValueChanged_(e) {
  this.userInput = e.detail.value;
}
```

Hai cách tương đương. `{{}}` là syntactic sugar.

## Event handling trong dom-repeat — `e.model`

Đã giới thiệu ở bài 5. Recap với detail:

```html
<template is="dom-repeat" items="[[users]]">
  <div on-click="onUserClick_">[[item.name]]</div>
</template>
```

```javascript
onUserClick_(e) {
  // e.model contains the local variables of dom-repeat
  console.log(e.model.item);     // {name: 'Alice', email: '...'}
  console.log(e.model.index);    // 0, 1, 2, ...
  
  // Truy cập property của item
  const userId = e.model.item.id;
  const userName = e.model.item.name;
}
```

### Mutate item trong handler — dùng Polymer API

```javascript
onToggleActiveUser_(e) {
  const item = e.model.item;
  const idx = e.model.index;
  
  // SAI — mutate trực tiếp, Polymer không biết
  // item.isActive = !item.isActive;
  
  // ĐÚNG — qua Polymer path
  this.set(`users.${idx}.isActive`, !item.isActive);
}
```

`this.set('users.0.isActive', ...)` báo cho Polymer biết sub-path đã đổi → bindings update.

## Global event listeners — `addEventListener`

Khi cần listen event không phải trên element trong template (vd document keyboard, window resize):

```javascript
class SearchPage extends PolymerElement {
  ready() {
    super.ready();
    
    // Bind 'this' để có thể remove sau (convention Chromium: suffix _ cho private field)
    this.keyHandler_ = this.onGlobalKey_.bind(this);
    document.addEventListener('keydown', this.keyHandler_);
    
    this.resizeHandler_ = this.onResize_.bind(this);
    window.addEventListener('resize', this.resizeHandler_);
  }
  
  disconnectedCallback() {
    super.disconnectedCallback();
    
    // CLEANUP — quan trọng!
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

**Bẫy lớn**: quên `removeEventListener` → memory leak. Component bị destroy nhưng handler vẫn tồn tại trong document, vẫn được gọi, giữ reference đến component instance đã chết.

## `listeners` declaration — Polymer 1 style (đã deprecated trong Polymer 3)

Polymer 1/2 cho phép khai báo listener trong class:

```javascript
// Polymer 1 (CŨ — đừng dùng)
Polymer({
  listeners: {
    'tap': 'onTap_',
    'input.input': 'onInput_',
  },
});
```

→ `PolymerElement` style Polymer 3 không dùng `listeners`. Phải dùng `on-event` trong template hoặc `addEventListener` trong `ready()`. Legacy mode qua `LegacyElementMixin` vẫn có thể support `listeners`, nhưng không dùng cho code mới.

## Polymer gesture events

Polymer cung cấp gesture events từ thời mobile touch chậm. Phổ biến nhất:

Trong Polymer 3, muốn listen gesture event bằng `on-tap`, `on-track`, `on-down`, `on-up` trong template, component phải apply `GestureEventListeners` mixin:

```javascript
import {GestureEventListeners} from '@polymer/polymer/lib/mixins/gesture-event-listeners.js';

class MyGestureElement extends GestureEventListeners(PolymerElement) {
  // ...
}
```

### `tap`

```html
<div on-tap="onTap_">Tap me</div>
```

Tap = touch + release nhanh trong cùng vị trí. Hoặc click chuột.

> Trong Chromium hiện đại, **dùng `click` thay `tap`**. Touch delay không còn là vấn đề.

### `down` và `up`

```html
<div on-down="onDown_" on-up="onUp_">Press me</div>
```

`down` = bắt đầu touch/click (mousedown/touchstart).
`up` = kết thúc (mouseup/touchend).

Hữu ích để implement hold-to-action, swipe, etc.

### `track`

```html
<div on-track="onTrack_">Drag me</div>
```

```javascript
onTrack_(e) {
  // e.detail có các properties:
  //   state: 'start' | 'track' | 'end'
  //   x, y: current position
  //   dx, dy: total delta from start
  //   ddx, ddy: delta from last track event
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

Track = continuous drag. Polymer abstract mouse + touch → 1 API thống nhất.

→ Trong Chromium, `track` ít dùng. Native Pointer Events (`pointerdown`, `pointermove`, `pointerup`) thường preferred.

## Tap vs Click — kỹ hơn

```javascript
// Polymer tap
listeners: {
  'tap': 'onTap_',
}

// Implementation:
// Polymer track touchstart/touchmove/touchend.
// Nếu touch không di chuyển nhiều → fire 'tap' event tại touchend.
// Cancel nếu touch move > threshold (treat as scroll/drag).
```

`tap` cố giải bài toán: trên mobile, browser delay `click` ~300ms vì chờ double-tap. `tap` fire ngay.

→ Hiện đại: `touch-action: manipulation` CSS giải vấn đề này tốt hơn. Chromium prefer `click`.

## Stop propagation

```javascript
onClick_(e) {
  e.stopPropagation();   // Không bubble lên parent
  e.preventDefault();    // Cancel default action (vd form submit)
}
```

```html
<div on-click="onOuterClick_">
  <button on-click="onInnerClick_">Click</button>
</div>
```

```javascript
onInnerClick_(e) {
  e.stopPropagation();
  // onOuterClick_ KHÔNG được gọi
}
```

Phổ biến trong dom-repeat khi có nút "Delete" trong row mà row cũng có on-click navigate:

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
  // Navigate
}

onDelete_(e) {
  e.stopPropagation();  // ← Quan trọng! Không trigger onRowClick_
  this.deleteItem_(e.model.item);
}
```

## Custom event naming convention

Chromium WebUI dùng kebab-case cho custom events:

```javascript
// Tên event: kebab-case
this.dispatchEvent(new CustomEvent('value-changed', {...}));
this.dispatchEvent(new CustomEvent('item-selected', {...}));
this.dispatchEvent(new CustomEvent('search-query-changed', {...}));
this.dispatchEvent(new CustomEvent('settings-loaded', {...}));

// Template binding tương ứng:
// on-value-changed, on-item-selected, on-search-query-changed
```

Convention cho `notify: true` properties: event tự gen tên `<prop-name-with-dashes>-changed`. Vd `firstName` → `first-name-changed`.

## Pattern thực tế — communicating up the tree

### Đơn cấp: child → parent trực tiếp

```html
<!-- Parent -->
<my-toggle on-checked-changed="onChange_"></my-toggle>
```

```javascript
// Child
toggle_() {
  this.checked = !this.checked;
  // notify:true tự fire 'checked-changed'
}
```

### Đa cấp: cháu → ông

```html
<!-- Grandparent -->
<my-form on-field-changed="onFieldChange_">
  <field-group>
    <my-input></my-input>
  </field-group>
</my-form>
```

```javascript
// my-input
this.dispatchEvent(new CustomEvent('field-changed', {
  detail: {field: 'email', value: 'a@b.com'},
  bubbles: true,
  composed: true,
}));

// my-form (grandparent)
onFieldChange_(e) {
  // Nhận event từ cháu (qua bubbling + composed)
  console.log(e.detail);
}
```

→ Event bubbling + composed cho phép skip middle component.

## Pattern thực tế — communicating down

Down communication không qua events — qua **property binding**:

```html
<!-- Parent set property cho child -->
<my-toggle checked="[[isDarkMode]]"></my-toggle>
```

```javascript
// Parent
this.isDarkMode = true;
// → child.checked = true tự động
```

## Real example — form với validation

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
  
  computeIsValid_(errorsChange) {
    if (!this.errors) return false;
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

Pattern trong example:
- Two-way binding với native input: `{{user.name::input}}`.
- Conditional error message với `dom-if`.
- Dynamic class via computed.
- Event blur trigger validation.
- Custom event submit lên parent.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Quên `composed: true` | Event không vượt shadow boundary | Luôn `composed: true` cho cross-component event |
| Quên `bubbles: true` | Parent không nhận event | Luôn `bubbles: true` cho cross-component event |
| Method name có `()` trong `on-event` | Polymer parse fail | `on-click="onClick_"` không `on-click="onClick_()"` |
| Lambda trong template | Không hoạt động | Phải method reference |
| Quên `e.stopPropagation` trong nested click | Event bubble unintentionally | `stopPropagation` cho inner buttons |
| Quên cleanup global listener | Memory leak | Always remove in `disconnectedCallback` |
| Dùng `e.model` ngoài dom-repeat | undefined | Chỉ có trong handler **bên trong** dom-repeat template |

## Tóm tắt bài 6

| Cú pháp | Mục đích |
|---|---|
| `on-click="method_"` | Listen DOM event |
| `dispatchEvent(new CustomEvent(name, {detail, bubbles, composed}))` | Fire custom event |
| `notify: true` property | Tự fire `<prop>-changed` event |
| `e.detail` | Custom event payload |
| `e.model.item/index` | Local context trong dom-repeat |
| `e.stopPropagation()` | Stop event bubbling |
| `addEventListener` trong `ready()` + cleanup trong `disconnectedCallback()` | Global events |

**Bài kế tiếp** → [Bài 7: Mixins và Behaviors](07-mixins-behaviors.md)
