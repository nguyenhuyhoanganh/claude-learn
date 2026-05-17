# Bài 3: Data binding — `[[...]]` vs `{{...}}`

Đây là **tính năng signature** của Polymer. Hiểu data binding = hiểu 80% Polymer. Đặc biệt **two-way binding** với `{{...}}` là thứ LitElement KHÔNG có — đây là lý do nhiều người vẫn thích Polymer.

Bài này khá dài vì topic này lan tỏa khắp mọi component. Đầu tư 30 phút đọc kỹ sẽ tiết kiệm nhiều giờ debug.

## Data binding — khái niệm

> **Data binding** = gắn JavaScript property với DOM. Khi property thay đổi → DOM tự update. (Và đôi khi ngược lại — đổi DOM → property update — gọi là two-way.)

Trong vanilla JS, để hiển thị property `name` lên DOM:

```javascript
const heading = document.querySelector('h1');
heading.textContent = this.name;  // manual

// Khi name đổi, phải manual update lại
this.name = 'Bob';
heading.textContent = this.name;  // mỗi lần đổi phải gọi
```

Polymer làm việc này **tự động**:

```html
<h1>[[name]]</h1>
```

```javascript
this.name = 'Bob';
// → DOM tự update <h1>Bob</h1>, không cần làm gì thêm
```

## 4 kiểu binding trong Polymer

### 1. Text binding — bind vào text content

```html
<h1>[[title]]</h1>
<p>Số lượng: [[count]]</p>
<span>Xin chào, [[user.name]] !</span>
```

Polymer thay `[[title]]` bằng text content của property `title`. Khi `this.title = 'Hello'`, text content tự update.

> **Lưu ý**: Polymer KHÔNG hỗ trợ expression trong binding. `[[count + 1]]` không work. Phải dùng computed property (Bài 4).

### 2. Attribute binding — bind vào HTML attribute

```html
<!-- Property binding (mặc định, không có $) -->
<my-element foo="[[bar]]"></my-element>
<!-- → element.foo = this.bar -->

<!-- Attribute binding (có $) -->
<a href$="[[url]]" title$="[[tooltip]]">Link</a>
<!-- → element.setAttribute('href', this.url) -->
```

**Khi nào property, khi nào attribute?**

| Loại | Khi dùng |
|---|---|
| Property (`foo="[[bar]]"`) | Custom component property hoặc DOM property (any JS value) |
| Attribute (`foo$="[[bar]]"`) | HTML standard attribute (`href`, `class`, `style`, `id`, `data-*`...) |

Quy tắc đơn giản:
- Truyền **string** vào HTML standard attribute → **dùng `$=`**.
- Truyền **bất kỳ giá trị nào** (object, array, boolean) vào custom property → **không dùng `$=`**.

```html
<!-- Truyền array vào property: KHÔNG dùng $ -->
<my-list items="[[users]]"></my-list>

<!-- Truyền string vào href attribute: DÙNG $ -->
<a href$="[[url]]">Link</a>

<!-- class attribute: DÙNG $ -->
<div class$="card [[isActive ? 'active' : '']]">...</div>
```

### 3. Boolean attribute binding

Cho attribute kiểu "có hoặc không có" (`disabled`, `hidden`, `checked`...):

```html
<!-- Sai (sẽ render disabled="false" hoặc disabled="true" — cả 2 đều mean disabled!) -->
<button disabled="[[isDisabled]]">Click</button>

<!-- Đúng -->
<button disabled$="[[isDisabled]]">Click</button>
```

Polymer hiểu boolean: `true` → có attribute, `false` → không có attribute.

### 4. Event binding — không phải data binding nhưng cùng cú pháp template

```html
<button on-click="onClick_">Click</button>
<button on-tap="onTap_">Tap (touch + click)</button>
<input on-input="onInput_" on-keydown="onKeyDown_">
```

`on-<event>="handlerName"` — tên handler là **string** (tên method của component).

> Polymer cũng có `addEventListener` thông thường. `on-*` chỉ là shortcut cho event in template.

## `[[...]]` vs `{{...}}` — sự khác biệt cốt lõi

Đây là **điểm gây confused** lớn nhất của Polymer.

### `[[...]]` — One-way binding (mặc định)

```html
<my-input value="[[name]]"></my-input>
```

Data chảy **1 chiều, từ parent xuống child**:

```text
   Parent.name  ──────────────►  child element.value
   
   Khi parent.name đổi → child.value tự update.
   Khi child.value đổi → parent.name KHÔNG đổi.
```

**Use case**: 99% binding. Cho phép control flow rõ ràng.

### `{{...}}` — Two-way binding

```html
<my-input value="{{name}}"></my-input>
```

Data chảy **2 chiều**:

```text
   Parent.name  ◄────────────►  child element.value
   
   Khi parent.name đổi → child.value update.
   Khi child.value đổi → parent.name update.
```

**Use case**: form input, settings toggle, slider — nơi child cần "report back" lên parent.

### Two-way binding hoạt động ra sao?

Hai điều kiện **bắt buộc**:

1. Child property phải có **`notify: true`**.
2. Parent dùng `{{...}}` (không phải `[[...]]`).

Cách hoạt động:

```text
Child element:
  properties: {
    value: {
      type: String,
      notify: true,    ← Khi value đổi, fire event 'value-changed'
    }
  }

Parent template:
  <my-input value="{{name}}">
                   ↑
                Polymer thấy {{}} → tự attach event listener cho 'value-changed'
                Khi event fire → cập nhật parent.name
```

### Demo cụ thể

```javascript
// Child: my-input
class MyInput extends PolymerElement {
  static get template() {
    return html`
      <input value$="[[value]]" on-input="onInput_">
    `;
  }
  
  static get properties() {
    return {
      value: {
        type: String,
        value: '',
        notify: true,  // ← key!
      },
    };
  }
  
  onInput_(e) {
    this.value = e.target.value;
    // Vì notify:true, Polymer tự fire 'value-changed' event sau khi set
  }
}
```

```javascript
// Parent
class MyForm extends PolymerElement {
  static get template() {
    return html`
      <my-input value="{{userName}}"></my-input>
      <p>Bạn nhập: [[userName]]</p>
    `;
  }
  
  static get properties() {
    return {
      userName: {
        type: String,
        value: '',
      },
    };
  }
}
```

User gõ vào input:
1. Input event fire → `MyInput.onInput_()` set `this.value = e.target.value`.
2. Vì `notify: true`, Polymer fire `value-changed` CustomEvent với `detail.value`.
3. Parent có `{{userName}}` → Polymer đã attach listener → nhận event → set `this.userName = e.detail.value`.
4. Parent `[[userName]]` trong `<p>` tự re-render.

Toàn bộ chain xảy ra trong 1 microtask, gần như instant.

### Two-way với native HTML elements (không phải Polymer)

Native elements (như `<input>`) **không có `notify` property** vì chúng không phải Polymer. Để two-way bind với native input:

```html
<!-- Sai: <input value="{{name}}"> — không work với native input -->

<!-- Đúng: chỉ định event để Polymer listen -->
<input value="{{name::input}}">
```

`{{name::input}}` = "bind value 2 chiều, listen `input` event để update `name`".

```html
<!-- Các pattern phổ biến -->
<input value="{{name::input}}">       <!-- listen 'input' event -->
<input value="{{name::change}}">      <!-- listen 'change' event (khi blur) -->
<input type="checkbox" checked="{{isOn::change}}">
<input type="range" value="{{volume::change}}">
<select value="{{theme::change}}">...</select>
```

## Sub-property binding — nested objects

```html
<p>[[user.name]]</p>
<p>[[user.address.city]]</p>
```

Polymer hỗ trợ nested path. Nhưng **với caveat lớn**:

### Bẫy: thay đổi sub-property KHÔNG trigger update

```javascript
this.user.name = 'Bob';  // ← Polymer KHÔNG biết!
// → DOM không update
```

Lý do: Polymer detect change bằng setter của `user`. Khi bạn mutate `user.name`, setter của `user` không được gọi.

### 3 cách fix

```javascript
// Cách 1: Replace toàn bộ object (immutable pattern)
this.user = {...this.user, name: 'Bob'};

// Cách 2: Dùng Polymer.set() API
this.set('user.name', 'Bob');
// Polymer dispatch path-changed notification
// → mọi binding với 'user.name' được update

// Cách 3: notifyPath sau khi mutate
this.user.name = 'Bob';
this.notifyPath('user.name');
```

→ **Best practice**: Dùng `this.set('user.name', value)` thay vì mutate trực tiếp.

### Array binding — cũng cần API riêng

```javascript
// Sai
this.items.push(newItem);  // ← Polymer không biết

// Đúng
this.push('items', newItem);
this.pop('items');
this.shift('items');
this.unshift('items', newItem);
this.splice('items', index, deleteCount, ...newItems);

// Hoặc replace:
this.items = [...this.items, newItem];
```

`this.push('items', x)` không phải JavaScript `Array.push` — đây là Polymer API. Đầu tiên là **path string** (`'items'`), sau đó là args.

## Computed binding — derive value

```html
<p>[[computeFullName(firstName, lastName)]]</p>
```

Polymer tự tạo "computed property" inline. Method `computeFullName` được gọi mỗi khi `firstName` hoặc `lastName` đổi.

```javascript
computeFullName(first, last) {
  return `${first} ${last}`;
}
```

**Cẩn thận**: method **phải public** (không có `_` prefix) khi dùng trong template. Polymer parser cần xem được tên method.

Phổ biến hơn là dùng [computed property](04-properties-observers.md) (declared, không inline):

```javascript
static get properties() {
  return {
    fullName: {
      type: String,
      computed: 'computeFullName_(firstName, lastName)',
    },
    firstName: String,
    lastName: String,
  };
}

computeFullName_(first, last) {
  return `${first} ${last}`;
}
```

```html
<p>[[fullName]]</p>
```

→ Cùng kết quả, nhưng `fullName` giờ là một property thực, có thể bind ở nhiều chỗ.

## Negation / boolean operations trong binding?

Polymer **KHÔNG hỗ trợ expression** trong binding:

```html
<!-- KHÔNG WORK -->
<div hidden$="[[!isVisible]]">
<div hidden$="[[count > 0]]">
<div class$="[[isActive ? 'on' : 'off']]">
```

Phải dùng computed property:

```javascript
static get properties() {
  return {
    isVisible: Boolean,
    isHidden_: {
      type: Boolean,
      computed: 'computeHidden_(isVisible)',
    },
  };
}

computeHidden_(visible) {
  return !visible;
}
```

```html
<div hidden$="[[isHidden_]]">
```

→ Verbose hơn React/Vue nhưng force tách biệt logic ra khỏi template. Có ưu/nhược.

## Multiple bindings trong 1 attribute — concatenation

```html
<!-- KHÔNG WORK trong Polymer -->
<div class="card [[type]]">

<!-- Phải computed property hoặc tách dòng -->
<div class$="card [[typeClass]]">
```

Polymer cho phép **single binding** trong attribute, không cho concatenation phức tạp.

Trick: dùng `_computeClasses_` computed property:

```javascript
computeClasses_(type, isActive) {
  const classes = ['card'];
  if (type) classes.push(type);
  if (isActive) classes.push('active');
  return classes.join(' ');
}
```

```html
<div class$="[[computeClasses_(type, isActive)]]">
```

## So sánh với LitElement (preview)

```html
<!-- Polymer -->
<input value="[[name]]" disabled$="[[isDisabled]]">

<!-- LitElement -->
<input value="${this.name}" ?disabled="${this.isDisabled}">
```

LitElement dùng `${}` (JavaScript template literal expressions) — cho phép expression đầy đủ:

```html
<!-- LitElement: expression OK -->
<div class="card ${isActive ? 'on' : 'off'}">
<p>${count + 1}</p>
```

Polymer thì không. Đây là trade-off:
- Polymer: declarative, không cho phép logic phức tạp trong template → buộc tách logic.
- LitElement: flexible, JavaScript-native expression → cho phép quá nhiều logic trong template nếu lười.

## Bẫy + best practices

### 1. Thiếu `notify: true` → two-way binding silent fail

```javascript
// Child
static get properties() {
  return {
    value: { type: String },  // ← THIẾU notify
  };
}
```

```html
<!-- Parent -->
<my-input value="{{name}}"></my-input>
```

→ Không lỗi gì cả. Polymer **vẫn down-bind**, nhưng **không up-bind**. Bạn nghĩ two-way work nhưng thực ra one-way.

**Fix**: child property muốn two-way phải có `notify: true`.

### 2. Mutate object/array không notify

```javascript
// Sai
this.user.name = 'Bob';
this.items.push(x);

// Đúng
this.set('user.name', 'Bob');
this.push('items', x);
```

### 3. `[[!something]]` không work

```html
<!-- Sai -->
<div hidden$="[[!isVisible]]">

<!-- Đúng: computed -->
<div hidden$="[[isHidden_]]">
```

### 4. Method trong binding phải public

```html
<!-- Sai: method có _ → Polymer parser không tìm thấy -->
<p>[[_computeFullName(first, last)]]</p>

<!-- Đúng: method public -->
<p>[[computeFullName_(first, last)]]</p>
```

Chú ý: trong Chromium convention, method `_` ở **cuối** (`computeFullName_`) thì OK. `_` ở **đầu** (`_computeFullName`) là sai.

### 5. `$=` cho attribute, không cho property

```html
<!-- Sai: data-id$ vô nghĩa nếu data-id không phải standard attribute -->
<div data-id$="[[itemId]]">

<!-- Đúng: data-* là standard, dùng $= -->
<div data-id$="[[itemId]]">

<!-- Hoặc property style -->
<my-element item-id="[[itemId]]"></my-element>
<!-- → element.itemId = itemId (camelCase auto convert) -->
```

## Ví dụ thực tế — search box với debounce

```javascript
class SearchBox extends PolymerElement {
  static get is() { return 'search-box'; }
  
  static get template() {
    return html`
      <style>
        :host { display: block; }
        input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
        }
        .results {
          margin-top: 8px;
        }
      </style>
      
      <input 
        value="{{query::input}}"
        placeholder="[[placeholder]]"
        on-keydown="onKeyDown_">
      
      <div class="results">
        <p hidden$="[[!hasResults_]]">
          Tìm thấy [[results.length]] kết quả cho "[[query]]"
        </p>
        <p hidden$="[[hasResults_]]">
          Không có kết quả
        </p>
      </div>
    `;
  }
  
  static get properties() {
    return {
      query: {
        type: String,
        value: '',
        notify: true,
        observer: 'onQueryChange_',
      },
      placeholder: {
        type: String,
        value: 'Search...',
      },
      results: {
        type: Array,
        value: () => [],
      },
      hasResults_: {
        type: Boolean,
        computed: 'computeHasResults_(results.length)',
      },
    };
  }
  
  computeHasResults_(length) {
    return length > 0;
  }
  
  onQueryChange_(newQuery) {
    // Debounce: chỉ search sau 300ms không gõ
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => {
      this.dispatchEvent(new CustomEvent('search', {
        detail: {query: newQuery},
        bubbles: true,
        composed: true,
      }));
    }, 300);
  }
  
  onKeyDown_(e) {
    if (e.key === 'Enter') {
      this.dispatchEvent(new CustomEvent('search-submit', {
        detail: {query: this.query},
        bubbles: true,
        composed: true,
      }));
    }
  }
}

customElements.define(SearchBox.is, SearchBox);
```

Dùng:

```html
<search-box 
    query="{{searchQuery}}"
    placeholder="Tìm bookmark..."
    on-search="onSearch_"
    on-search-submit="onSearchSubmit_">
</search-box>
<p>Query hiện tại: [[searchQuery]]</p>
```

Trong ví dụ này:
- `{{searchQuery}}` — two-way: input đổi → parent đổi → `<p>` cập nhật.
- `[[!hasResults_]]` — không work! Phải dùng computed `hasResults_`.
- `value="{{query::input}}"` — bind native input value.
- `notify: true` cho `query` → cho phép `{{query}}` từ parent.

## Tóm tắt bài 3

- `[[...]]` = one-way binding (parent → child). 99% case.
- `{{...}}` = two-way binding (parent ↔ child). Cần `notify: true` ở child.
- `$=` cho HTML attribute (`href$=`, `class$=`). Không có `$` = property binding.
- `on-event="handler"` cho event listener.
- `{{prop::input}}` cho two-way với native input.
- `this.set('a.b.c', value)` thay vì `this.a.b.c = value` (vì nested change).
- `this.push('items', x)` thay vì `this.items.push(x)`.
- Polymer **không support expression** trong binding — phải dùng computed property cho `!`, `?:`, `+`, etc.

**Bài kế tiếp** → [Bài 4: Properties — notify, observers, computed](04-properties-observers.md)
