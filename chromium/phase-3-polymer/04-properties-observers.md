# Bài 4: Properties — notify, observers, computed sâu

Properties là **trái tim** của Polymer. Mọi data flow, mọi reactivity đều chạy qua đây. Bài này đào sâu:

- Cú pháp đầy đủ của properties declaration.
- `value` — default value và bẫy với Array/Object.
- `notify` — cho two-way binding.
- `observer` — callback khi property đổi.
- `computed` — property derive từ properties khác.
- `readOnly` — property chỉ component đặt được.
- `reflectToAttribute` — sync xuống HTML attribute.

Sau bài này, bạn đọc bất kỳ Polymer component nào trong Chromium và hiểu mọi property declaration.

## Property declaration — cú pháp tổng

```javascript
static get properties() {
  return {
    // Shorthand: chỉ type
    name: String,
    age: Number,
    isActive: Boolean,
    
    // Full form: type + options
    title: {
      type: String,
      value: 'Default Title',
      notify: false,
      observer: 'titleChanged_',
      reflectToAttribute: true,
      readOnly: false,
    },
    
    // Computed
    fullName: {
      type: String,
      computed: 'computeFullName_(firstName, lastName)',
    },
  };
}
```

7 options chính thức của Polymer 3:

| Option | Mô tả |
|---|---|
| `type` | Convert từ attribute string sang JS type |
| `value` | Default value khi không set explicit |
| `notify` | Fire `<prop>-changed` event khi đổi → enable `{{...}}` |
| `observer` | Callback method khi property đổi |
| `computed` | Function expression để compute từ properties khác |
| `reflectToAttribute` | Sync property → HTML attribute |
| `readOnly` | Chỉ component tự đặt được (qua `_setX(value)`) |

## `type` — type coercion

```javascript
static get properties() {
  return {
    age: { type: Number },
  };
}
```

Khi attribute đến từ HTML (luôn là string):

```html
<my-comp age="25"></my-comp>
```

Polymer:
1. Đọc attribute `age` = `"25"` (string).
2. Thấy `type: Number` → convert thành `25` (number).
3. Set `this.age = 25`.

Polymer 3 chính thức support **6 type** sau:

| Type | Conversion từ attribute string |
|---|---|
| `String` | Giữ nguyên |
| `Number` | `parseFloat()` |
| `Boolean` | Có attribute = `true`, không = `false` |
| `Array` | `JSON.parse()` — vd `[1,2,3]` |
| `Object` | `JSON.parse()` — vd `{"a":1}` |
| `Date` | `new Date(string)` |

Type khác (`Function`, custom class) không deserialize được từ attribute, chỉ set qua JS.

```html
<!-- Boolean: presence = true -->
<my-comp disabled></my-comp>          <!-- disabled = true -->
<my-comp></my-comp>                    <!-- disabled = false -->
<my-comp disabled="true"></my-comp>    <!-- disabled = true (vẫn truthy) -->
<my-comp disabled="false"></my-comp>   <!-- disabled = TRUE (vì attribute tồn tại!) -->

<!-- Array/Object: dùng JSON -->
<my-comp items='[1,2,3]'></my-comp>
<my-comp config='{"theme":"dark"}'></my-comp>
```

> **Bẫy**: `disabled="false"` vẫn là true vì attribute tồn tại. Đây là chuẩn HTML, không phải Polymer bug.

## `value` — default value

```javascript
title: {
  type: String,
  value: 'Untitled',
},
```

Khi `this.title` không được set explicit, dùng `'Untitled'`.

### Bẫy lớn nhất: Array/Object value PHẢI là function

```javascript
// SAI - tất cả instance share cùng 1 array!
items: {
  type: Array,
  value: [],   // ← danger
}

// Test:
const a = document.createElement('my-list');
const b = document.createElement('my-list');
a.items.push('x');                // mutate trực tiếp shared array
console.log(b.items);             // ['x'] — bị thay đổi!
```

Lý do: trong JavaScript, default value được đánh giá **1 lần** lúc class load. Mọi instance reference cùng object.

```javascript
// ĐÚNG — function tạo array/object mới mỗi instance
items: {
  type: Array,
  value: () => [],
},

config: {
  type: Object,
  value: () => ({theme: 'light', fontSize: 14}),
},
```

→ Quy tắc vàng: **mọi `value` cho Array/Object phải là function**.

### Function value vs static value

```javascript
// String primitive: static OK
name: { type: String, value: '' }

// Number primitive: static OK
count: { type: Number, value: 0 }

// Boolean primitive: static OK
isActive: { type: Boolean, value: false }

// Array/Object: PHẢI function
items: { type: Array, value: () => [] }
user: { type: Object, value: () => ({}) }
```

## `notify: true` — enable two-way binding

Đã giới thiệu ở bài 3. Recap:

```javascript
checked: {
  type: Boolean,
  value: false,
  notify: true,  // ← bắt buộc cho {{checked}} từ parent
}
```

Khi `this.checked = true`, Polymer fire `checked-changed` event với `detail.value = true`.

Parent dùng `{{checked}}` tự attach listener.

### Tự fire `<prop>-changed` event manual

Đôi khi muốn fire event mà không thông qua property setter:

```javascript
this.dispatchEvent(new CustomEvent('checked-changed', {
  detail: {value: true},
  bubbles: false,  // ← thường KHÔNG bubbles để event không leak
}));
```

`notify` tự fire với `bubbles: false, composed: false`. Đây là behavior chuẩn — event chỉ pass parent gần nhất qua binding, không bubble lên cao hơn.

## `observer` — callback khi property đổi

```javascript
static get properties() {
  return {
    userId: {
      type: String,
      observer: 'userIdChanged_',
    },
  };
}

userIdChanged_(newValue, oldValue) {
  console.log(`userId: ${oldValue} → ${newValue}`);
  // Load user data mới
  this.loadUser_(newValue);
}
```

`observer` là **tên method** (string). Method được gọi mỗi khi property change.

### Signature: `(newValue, oldValue)`

```javascript
observer_(newValue, oldValue) {
  // Note: oldValue undefined lần đầu set (từ default → value)
  if (oldValue === undefined) return;  // skip initial set
  
  // Logic của bạn
}
```

Lần đầu set (initialization), `oldValue` thường là `undefined`. Cẩn thận edge case này.

### Khi nào observer fire?

- Property setter được gọi với value **khác** giá trị hiện tại.
- Polymer dùng `===` để compare.

```javascript
this.count = 5;        // observer fire
this.count = 5;        // observer KHÔNG fire (same value)
this.count = 6;        // observer fire

// Object/Array: reference compare
this.items = this.items;        // KHÔNG fire (same reference)
this.items = [...this.items];   // fire (new reference)
```

### Multi-property observer — observe nhiều property

```javascript
static get properties() {
  return {
    width: Number,
    height: Number,
    // ...
  };
}

static get observers() {
  return [
    'sizeChanged_(width, height)',
    'configChanged_(theme, fontSize, language)',
  ];
}

sizeChanged_(width, height) {
  console.log(`Size: ${width}x${height}`);
  // Recompute area, layout, etc.
}

configChanged_(theme, fontSize, language) {
  this.applyConfig_({theme, fontSize, language});
}
```

`static get observers()` (plural, không có `r`) trả về array of strings.

**Khác biệt với single observer**:
- Single: nhận `(newVal, oldVal)`.
- Multi: nhận **tất cả values** của properties được watch — không có `oldValue`.
- Multi observer fire khi **bất kỳ** property nào trong list đổi.

### Sub-property observer

```javascript
static get observers() {
  return [
    'userChanged_(user.*)',           // any sub-property of user
    'addressChanged_(user.address.*)',  // any deep sub-property
    'cityChanged_(user.address.city)',  // exact path
  ];
}

userChanged_(changeRecord) {
  console.log(changeRecord.path);   // vd 'user.name', 'user.age'
  console.log(changeRecord.value);  // new value tại path đó
  console.log(changeRecord.base);   // full user object
}
```

`*` ở cuối path = "any sub-path". Method nhận **change record** object.

### Array observer

```javascript
static get observers() {
  return [
    'itemsChanged_(items.*)',
    'itemsLengthChanged_(items.length)',
  ];
}

itemsChanged_(changeRecord) {
  // path: vd 'items.3.name' (item index 3, sub-prop 'name')
  //       hoặc 'items.splices' (array mutation)
  if (changeRecord.path === 'items.splices') {
    const splices = changeRecord.value;
    splices.indexSplices.forEach(s => {
      console.log(`Removed ${s.removed.length} at index ${s.index}`);
      console.log(`Added ${s.addedCount} items`);
    });
  }
}
```

→ Phức tạp. Trong thực tế Chromium hay dùng `this.set()` + observe full path.

## `computed` — property derive

```javascript
static get properties() {
  return {
    firstName: String,
    lastName: String,
    fullName: {
      type: String,
      computed: 'computeFullName_(firstName, lastName)',
    },
  };
}

computeFullName_(first, last) {
  if (!first || !last) return '';
  return `${first} ${last}`;
}
```

`fullName` được compute lại mỗi khi `firstName` hoặc `lastName` đổi.

Use case phổ biến:

```javascript
// Boolean negation phức tạp (nếu chỉ negation đơn giản, dùng [[!isVisible]] trong template — Polymer support single ! ở đầu binding)
isHidden_: {
  type: Boolean,
  computed: 'computeIsHidden_(isVisible, isOverride)',
},

computeIsHidden_(visible, override) { return !visible && !override; }
```

```javascript
// Class string từ multiple bool
classes_: {
  type: String,
  computed: 'computeClasses_(isActive, isDisabled, isFocused)',
},

computeClasses_(active, disabled, focused) {
  return [
    'item',
    active && 'active',
    disabled && 'disabled',
    focused && 'focused',
  ].filter(Boolean).join(' ');
}
```

```javascript
// Filter list
filteredItems_: {
  type: Array,
  computed: 'computeFiltered_(items.*, searchQuery)',
},

computeFiltered_(itemsChange, query) {
  if (!this.items) return [];
  if (!query) return this.items;
  return this.items.filter(item =>
    item.name.toLowerCase().includes(query.toLowerCase())
  );
}
```

> Lưu ý: khi observe `items.*`, method nhận change record, không phải array. Phải `this.items` để access array thật.

### Computed inline trong template

```html
<p>[[computeFullName_(firstName, lastName)]]</p>
```

Cùng kết quả như computed property nhưng không reusable.

## `readOnly` — property chỉ component tự đặt

```javascript
static get properties() {
  return {
    progress: {
      type: Number,
      value: 0,
      readOnly: true,
      notify: true,
    },
  };
}

doWork_() {
  this._setProgress(50);   // Polymer tự generate _setProgress
  // sau...
  this._setProgress(100);
}
```

Khi `readOnly: true`, Polymer tự generate `_set<PropName>` method. External code không thể set property trực tiếp.

```javascript
this.progress = 50;       // ← KHÔNG WORK (silent ignore)
this._setProgress(50);    // ← OK
```

Use case: component có internal state mà parent **đọc được** (qua binding) nhưng **không set được** (chỉ component tự đổi).

Ví dụ: `<image-loader>` có property `loaded` — chỉ component tự đặt khi load xong, parent chỉ đọc.

## `reflectToAttribute` — sync property xuống HTML attribute

```javascript
static get properties() {
  return {
    selected: {
      type: Boolean,
      value: false,
      reflectToAttribute: true,
    },
  };
}
```

Khi `this.selected = true`, DOM thành `<my-item selected>` (attribute xuất hiện).
Khi `this.selected = false`, attribute biến mất.

### Tại sao cần `reflectToAttribute`?

**Để CSS selector hoạt động**:

```css
:host([selected]) {
  background: blue;
}

/* Hoặc từ parent */
my-item[selected] {
  border: 2px solid red;
}
```

Mà không có reflect, attribute không có → selector không match → CSS không apply.

### Khi nào dùng

| Property | Reflect? |
|---|---|
| Visual state (selected, active, disabled, expanded) | **Có** |
| Internal data (items, config object) | Không (object không stringify dễ vào attribute) |
| Computed properties | Không (vì attribute string không phù hợp với computed) |

## Property naming convention

### Camel case JS → kebab case attribute

```javascript
static get properties() {
  return {
    firstName: String,      // camelCase trong JS
    isLoggedIn: Boolean,
  };
}
```

HTML attribute tự động kebab-case:

```html
<my-comp first-name="Alice" is-logged-in></my-comp>
```

Polymer tự convert. Bạn dùng `this.firstName` trong JS, viết `first-name` trong HTML.

### Không thể override mapping

Polymer 3 không có option để đổi tên attribute mapping — convention `firstName ↔ first-name` là **fixed**. Nếu cần observe attribute bằng tên khác, phải tự override `attributeChangedCallback`.

## Order — khi nào properties được initialize?

```text
1. constructor()
   ↓
2. Default values từ `properties.value` được set
   ↓
3. Attributes từ HTML được parse và set (override defaults)
   ↓
4. Programmatic property sets (vd this.foo = 'bar' trong constructor)
   ↓
5. ready() được gọi
   ↓
6. connectedCallback()
   ↓
7. Initial render (DOM được tạo, bindings hoạt động)
```

→ Lúc `ready()`, mọi property đã có giá trị. Đó là chỗ tốt để do logic phụ thuộc property.

## Property change order trong observers

Khi multiple properties đổi cùng lúc (vd từ một `Object.assign`), Polymer **batch updates**:

```javascript
// Set 3 properties cùng lúc
this.setProperties({
  width: 100,
  height: 200,
  color: 'red',
});

// Observer được gọi sau khi tất cả đã set:
sizeChanged_(w, h) {
  // w = 100, h = 200 (already updated)
}
```

`setProperties` là helper batch. Nếu set tuần tự (`this.width = 100; this.height = 200;`), observer fire 2 lần.

## Pattern thực tế — Settings page state

```javascript
class SettingsPage extends PolymerElement {
  static get is() { return 'settings-page'; }
  
  static get template() {
    return html`
      <h1>Settings</h1>
      <p>Theme: [[settings.theme]]</p>
      <p>Font: [[settings.fontSize]]px</p>
      
      <!-- Computed -->
      <p>Status: [[displayStatus_]]</p>
      
      <!-- Conditional -->
      <div hidden$="[[isLoading_]]">
        <button on-click="resetSettings_">Reset</button>
      </div>
      
      <!-- Two-way với child -->
      <theme-selector value="{{settings.theme}}"></theme-selector>
    `;
  }
  
  static get properties() {
    return {
      settings: {
        type: Object,
        value: () => ({
          theme: 'light',
          fontSize: 14,
        }),
        notify: true,
        observer: 'settingsChanged_',
      },
      isLoading_: {
        type: Boolean,
        value: false,
        readOnly: true,
      },
      displayStatus_: {
        type: String,
        computed: 'computeStatus_(settings.theme, settings.fontSize)',
      },
    };
  }
  
  static get observers() {
    return [
      'persistSettings_(settings.theme, settings.fontSize)',
    ];
  }
  
  computeStatus_(theme, fontSize) {
    return `${theme} mode, font ${fontSize}px`;
  }
  
  settingsChanged_(newSettings, oldSettings) {
    // Top-level settings object replaced
    console.log('Settings replaced:', newSettings);
  }
  
  persistSettings_(theme, fontSize) {
    // Fire khi bất kỳ sub-property đổi (vì observe path)
    localStorage.setItem('theme', theme);
    localStorage.setItem('fontSize', fontSize);
  }
  
  async resetSettings_() {
    this._setIsLoading_(true);
    try {
      await this.api.reset();
      this.set('settings', {theme: 'light', fontSize: 14});
    } finally {
      this._setIsLoading_(false);
    }
  }
}

customElements.define(SettingsPage.is, SettingsPage);
```

## Tóm tắt bài 4

| Option | Khi dùng |
|---|---|
| `type` | Convert attribute string → JS type |
| `value` | Default value. **Function cho Array/Object**! |
| `notify: true` | Enable two-way binding (`{{...}}` from parent) |
| `observer: 'method_'` | Callback khi property đổi (single property) |
| `static get observers()` | Multi-property observer (no oldValue) |
| `computed` | Property derive từ properties khác |
| `readOnly: true` | Chỉ component tự đặt (qua `_setX()`) |
| `reflectToAttribute: true` | Sync xuống HTML attribute (cho CSS selector) |

**Patterns**:
- `this.set('user.name', 'Bob')` thay vì `this.user.name = 'Bob'` (cho nested).
- `this.push/pop/splice('items', ...)` thay vì native array methods (cho array).
- Observer signature: `(newVal, oldVal)` single, `(...allVals)` multi.
- Sub-property observe: `'method_(user.*)'`.

**Bài kế tiếp** → [Bài 5: Templates, dom-repeat, dom-if, dom-bind](05-templates-dom-repeat-if.md)
