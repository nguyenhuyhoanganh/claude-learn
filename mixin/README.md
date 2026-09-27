# Mixin & Reactive Controller

Tài liệu trình bày cách tái sử dụng logic trong JavaScript, Polymer và Lit.
Ví dụ dùng Polymer 3.5.2 và Lit 3.3.3. Polymer đang ở maintenance mode; dùng
Lit hoặc Web Components chuẩn cho component mới.

Toàn bộ ví dụ xoay quanh một **dialog có thể mở/đóng**. Dialog được phát
triển dần: bắt đầu bằng một Polymer mixin, thêm mixin khác vào chain, tùy
biến phần kế thừa, viết lại bằng Lit, rồi tách thành Reactive Controller.
Mỗi mục có một card tương ứng trong [demo](#6-demo-và-tài-liệu-tham-khảo).

## Mục lục

1. [Mixin](#1-mixin)
2. [Mixin trong Lit](#2-mixin-trong-lit)
3. [Reactive Controller](#3-reactive-controller)
4. [So sánh và lựa chọn](#4-so-sánh-và-lựa-chọn)
5. [Chuyển từ Polymer sang Lit](#5-chuyển-từ-polymer-sang-lit)
6. [Demo và tài liệu tham khảo](#6-demo-và-tài-liệu-tham-khảo)

## 1. Mixin

### 1.1. Khái niệm và syntax

Mixin là function nhận một `baseClass` và trả về class kế thừa `baseClass` đó.

```js
const SomeMixin = (baseClass) =>
  class extends baseClass {
    // Property hoặc method mới.
  };
```

Mixin không sửa `baseClass`. Với mixin thông thường, mỗi lần gọi tạo một class
mới trong prototype chain.

### 1.2. Ví dụ: `OpenableMixin`

Nhiều component cần trạng thái đóng/mở: dialog, dropdown, menu, tooltip.
`OpenableMixin` gom phần đó vào một chỗ:

```js
export const OpenableMixin = (baseClass) =>
  class OpenableMixinImpl extends baseClass {
    static get properties() {
      return {
        opened: {
          type: Boolean,
          value: false,
          reflectToAttribute: true,
          notify: true,
        },
      };
    }

    open() {
      this.opened = true;
    }

    close() {
      this.opened = false;
    }

    toggle() {
      this.opened ? this.close() : this.open();
    }
  };
```

Áp dụng mixin vào Polymer element:

```js
import {PolymerElement, html} from '@polymer/polymer/polymer-element.js';
import {OpenableMixin} from './openable-mixin.js';

class MyDialog extends OpenableMixin(PolymerElement) {
  static get template() {
    return html`
      <button on-click="toggle">Mở / đóng dialog</button>

      <div class="dialog" hidden$="[[!opened]]">
        <h4>Dialog</h4>
        <button on-click="close">Đóng</button>
      </div>
    `;
  }
}

customElements.define('my-dialog', MyDialog);
```

`MyDialog` chỉ viết template. `opened`, `open()`, `close()` và `toggle()` đến
từ mixin. Vì `reflectToAttribute: true`, khi dialog mở, element có thêm
attribute `opened`: `<my-dialog opened>`.

### 1.3. Mixin chain và `super`

Thêm `EscapeCloseMixin` để nhấn Escape thì đóng dialog:

```js
export const EscapeCloseMixin = (baseClass) =>
  class EscapeCloseMixinImpl extends baseClass {
    constructor() {
      super();
      this.escapeListener = (event) => {
        if (event.key === 'Escape') this.close();
      };
    }

    connectedCallback() {
      super.connectedCallback();
      document.addEventListener('keydown', this.escapeListener);
    }

    disconnectedCallback() {
      super.disconnectedCallback();
      document.removeEventListener('keydown', this.escapeListener);
    }
  };
```

Ghép nhiều mixin bằng cách lồng function:

```js
class EscapeDialog extends EscapeCloseMixin(OpenableMixin(PolymerElement)) {}
```

Prototype chain:

```text
EscapeDialog
  → EscapeCloseMixinImpl
  → OpenableMixinImpl
  → PolymerElement
```

Khi gọi method, JavaScript tìm từ prototype gần instance nhất rồi tiếp tục về
phía base class. `EscapeCloseMixin` không khai báo `close()`; lời gọi
`this.close()` đi xuống chain và gặp `close()` của `OpenableMixin`.

`super` gọi method kế tiếp trong chain. `connectedCallback()` của
`EscapeCloseMixin` gọi `super.connectedCallback()` để `PolymerElement` vẫn khởi
tạo element. Không gọi `super` thì template không render.

`connectedCallback()` chạy khi element được gắn vào document, không phải khi
dialog mở. Mở/đóng chỉ đổi `opened`; element `<escape-dialog>` vẫn nằm trong
DOM. Vì vậy listener được thêm một lần khi trang load và gỡ khi element bị gỡ
khỏi DOM.

### 1.4. Quy tắc khi viết mixin

- Gọi `super()` trước khi truy cập `this` trong constructor.
- Gọi `super` khi override method hoặc lifecycle cần giữ logic phía dưới.
- Đặt tên property và method rõ ràng để tránh trùng giữa các mixin.
- Ghi rõ base class, API, event, lifecycle và cleanup trong contract. Ví dụ
  `EscapeCloseMixin` yêu cầu class phía dưới có `close()`.
- Tránh đưa cùng một mixin vào chain nhiều lần.

Quy tắc cuối dễ bị vi phạm khi một mixin phụ thuộc mixin khác. `ModalMixin`
thêm backdrop, click ra ngoài để đóng; nó cần `close()` nên tự áp dụng
`OpenableMixin`:

```js
export const ModalMixin = (baseClass) =>
  class ModalMixinImpl extends OpenableMixin(baseClass) {
    closeOnBackdrop(event) {
      if (event.target === event.currentTarget) {
        this.close();
      }
    }
  };
```

`ModalMixin(X)` tạo ra chain:

```text
ModalMixinImpl
  → OpenableMixinImpl   (ModalMixin tự áp dụng)
  → X
```

Component không biết điều đó và áp dụng `OpenableMixin` thêm một lần:

```js
class ModalDialog extends EscapeCloseMixin(
  ModalMixin(OpenableMixin(PolymerElement))
) {}
```

Function trong cùng chạy trước, nên chain được dựng từ dưới lên:

```text
ModalDialog
  → EscapeCloseMixinImpl
  → ModalMixinImpl
  → OpenableMixinImpl   (ModalMixin tự áp dụng)
  → OpenableMixinImpl   (component áp dụng)
  → PolymerElement
```

Chain lúc này có hai `OpenableMixinImpl`: property `opened` được khai báo hai
lần, `open()`/`close()` nằm ở hai tầng, và lifecycle của mixin (nếu có) chạy
hai lần. Polymer có `dedupingMixin()` để bỏ lần áp dụng thứ hai:

```js
import {dedupingMixin} from '@polymer/polymer/lib/utils/mixin.js';

export const OpenableMixin = dedupingMixin((baseClass) =>
  class OpenableMixinImpl extends baseClass {
    // ...
  }
);
```

`dedupingMixin()` ghi nhớ base class nào đã có mixin. Khi `ModalMixin` gọi
`OpenableMixin(baseClass)` mà `baseClass` đã chứa `OpenableMixin`, nó trả về
luôn `baseClass`, không tạo class mới:

```text
ModalDialog
  → EscapeCloseMixinImpl
  → ModalMixinImpl
  → OpenableMixinImpl
  → PolymerElement
```

`dedupingMixin()` không bắt buộc. Mixin vẫn hoạt động khi dùng trực tiếp; tiện
ích này chỉ cần khi cùng một mixin có thể xuất hiện nhiều lần trong chain.

Mixin áp dụng cho `PolymerElement` có thể khai báo `properties`, observer,
computed property, method và lifecycle như một Polymer element thông thường.

### 1.5. Tùy biến phần kế thừa từ mixin

`ConfirmDialog` dùng lại hai mixin ở trên và tùy biến một số phần:

```js
class ConfirmDialog extends EscapeCloseMixin(OpenableMixin(PolymerElement)) {}
```

| Muốn | Cách làm |
|---|---|
| Đổi default value, option của property | Khai báo lại property trong `properties` |
| Chạy logic khi property kế thừa đổi | Thêm observer |
| Thay đổi hành vi method | Override method, gọi `super` |
| Thêm logic vào lifecycle | Override callback, gọi `super` |

#### 1.5.1. Property

`ConfirmDialog` mở sẵn khi trang load, nên khai báo lại `opened` với default
value mới:

```js
static get properties() {
  return {
    opened: {type: Boolean, value: true},
  };
}
```

Chỉ cần ghi `type` và `value`, không cần ghi lại `reflectToAttribute` và
`notify` của mixin:

| Option | Có cần ghi lại? | Vì sao |
|---|---|---|
| `value` | Có | Đây là option muốn đổi |
| `type` | Có | Object `opened` của subclass thay hẳn object của mixin, không trộn từng option. Polymer đọc `type` từ object này; thiếu `type` thì attribute `<confirm-dialog opened>` không được chuyển thành Boolean |
| `reflectToAttribute`, `notify` | Không | Mixin đã biến chúng thành effect lúc định nghĩa class. Subclass kế thừa effect qua prototype chain, dù object mới không ghi |

`readOnly`, `computed` và `observer` cũng là effect như vậy. Subclass không
tắt được `readOnly`, `computed`, `reflectToAttribute`, `notify` của mixin; với
observer thì chỉ thêm được observer mới.

Nguồn: JSDoc của `createPropertyFromConfig()` trong
[`element-mixin.js`](https://github.com/Polymer/polymer/blob/master/lib/mixins/element-mixin.js):
*"once a property has been set to `readOnly`, `computed`,
`reflectToAttribute`, or `notify` these values may not be changed. For
example, a subclass cannot alter these settings. However, additional
`observers` may be added by subclasses."* `type` và `value` đọc từ
`_properties`, được gộp bằng `Object.assign({}, superProps, ownProps)` trong
[`properties-mixin.js`](https://github.com/Polymer/polymer/blob/master/lib/mixins/properties-mixin.js).

#### 1.5.2. Observer

Thêm observer cho property khai báo trong mixin. Đếm số lần dialog được mở:

```js
static get properties() {
  return {
    // ...
    openCount: {type: Number, value: 0},
  };
}

static get observers() {
  return ['countOpen_(opened)'];
}

countOpen_(opened) {
  if (opened) this.openCount += 1;
}
```

Observer bổ sung không thay thế observer đã có ở class phía trên.

#### 1.5.3. Method

Override `open()` để chuyển focus vào nút Lưu khi dialog mở:

```js
open() {
  super.open();
  this.confirmButton.focus();
}
```

`super.open()` giữ phần đổi `opened` của mixin. `toggle()` của mixin gọi
`this.open()`, nên bấm nút toggle cũng dùng bản override này.

#### 1.5.4. Lifecycle

`open()` ở trên cần tham chiếu tới nút Lưu. Local DOM chỉ có sau `ready()`,
nên override `ready()`:

```js
ready() {
  super.ready();
  this.confirmButton = this.$.confirm;
}
```

`super.ready()` phải chạy trước; trong `constructor()`, `this.$` chưa có.
`connectedCallback()` và `disconnectedCallback()` override cùng cách, như
`EscapeCloseMixin` ở 1.3.

## 2. Mixin trong Lit

Mixin trong Lit vẫn là function nhận một `baseClass` và trả về class kế thừa
`baseClass`. Phần triển khai cần tuân theo reactive property, update cycle và
cách ghép style của Lit. Mục này viết lại dialog ở mục 1 bằng Lit.

### 2.1. Polymer và Lit

| Nội dung | Polymer | Lit |
|---|---|---|
| Property | `static get properties()` | `static properties` hoặc decorator |
| Cơ chế phản ứng | Property effects, observer và binding | Reactive update được batch và chạy async |
| Computed | `computed` | Getter hoặc `willUpdate()` |
| Observer | `observer`, `observers` | `willUpdate()` hoặc `updated()` |
| Notify | `notify: true` | Tự phát event |
| Object/array | `set`, `push`, `notifyPath` | Gán reference mới |
| DOM đầu tiên | `ready()` | `firstUpdated()` |

Update cycle chính của Lit:

```text
property đổi
  → requestUpdate()
  → đợi đến microtask tiếp theo
  → shouldUpdate()
  → willUpdate()
  → update() → render()
  → firstUpdated(), chỉ sau lần update đầu tiên
  → updated()
  → updateComplete resolve
```

Mở/đóng dialog trong Lit chạy update cycle này, không chạy
`connectedCallback()`.

### 2.2. Định nghĩa và sử dụng mixin

`OpenableMixin` viết lại cho Lit:

```js
export const OpenableMixin = (baseClass) =>
  class OpenableMixinImpl extends baseClass {
    static properties = {
      opened: {type: Boolean, reflect: true},
    };

    constructor() {
      super();
      this.opened = false;
    }

    open() {
      this.opened = true;
    }

    close() {
      this.opened = false;
    }

    toggle() {
      this.opened ? this.close() : this.open();
    }
  };
```

```js
import {LitElement, html} from 'lit';
import {OpenableMixin} from './openable-mixin.js';

export class LitDialog extends OpenableMixin(LitElement) {
  render() {
    return html`
      <button @click=${this.toggle}>Mở / đóng dialog</button>

      <div class="dialog" ?hidden=${!this.opened}>
        <h4>Lit dialog</h4>
        <button @click=${this.close}>Đóng</button>
      </div>
    `;
  }
}

customElements.define('lit-dialog', LitDialog);
```

`render()` thuộc `LitDialog`; mixin chỉ cung cấp state và method dùng trong
template. Mixin chỉ cần override `render()` khi chính contract của mixin yêu
cầu thay đổi kết quả render.

### 2.3. Custom property

`ExpandedDialog` kế thừa `LitDialog`, mở sẵn và đổi tên attribute. Đổi default
value sau `super()`:

```js
class ExpandedDialog extends LitDialog {
  constructor() {
    super();
    this.opened = true;
  }
}
```

Không dùng native class field cho property khai báo trong `static properties`:

```js
class WrongDialog extends LitDialog {
  opened = true; // Che reactive accessor của Lit.
}
```

Reactive property là accessor trên prototype; class field tạo property riêng
trên instance và che accessor đó. Gán `this.opened` không đi qua setter của
Lit nên không gọi `requestUpdate()`:

- Bản production của Lit: dialog hiện lúc đầu, nhưng bấm nút không re-render.
- Bản development của Lit: throw lỗi `class-field-shadowing` ngay lần update
  đầu tiên.

Lit tự kế thừa các reactive property của superclass. Chỉ cần khai báo lại một
property khi muốn đổi option của property đó. Khác Polymer, Lit thay toàn bộ
object option cũ bằng object mới (`elementProperties.set(name, options)` trong
[`reactive-element.ts`](https://github.com/lit/lit/blob/main/packages/reactive-element/src/reactive-element.ts)),
kể cả `reflect`. Vì vậy cần ghi lại đầy đủ các option cần giữ:

```js
class ExpandedDialog extends LitDialog {
  static properties = {
    opened: {
      type: Boolean,
      reflect: true,
      attribute: 'expanded',
    },
  };
}
```

Khi mở, element có attribute `expanded` thay cho `opened`.

Object và array: Lit chỉ phát hiện thay đổi khi reference đổi.
`this.push('items', item)` của Polymer trong Lit được viết thành:

```js
this.items = [...this.items, item];
```

Hoặc mutate rồi tự gọi `this.requestUpdate()`. Tài liệu Lit khuyên dùng cách
gán reference mới cho đa số trường hợp.

### 2.4. Lifecycle, style và event

`EscapeCloseMixin` ở [1.3](#13-mixin-chain-và-super) dùng lại được cho Lit
mà không sửa dòng nào. Mixin chỉ cần `connectedCallback()`,
`disconnectedCallback()` và `close()`; `LitElement` có hai callback đầu,
`OpenableMixin` cung cấp `close()`.

```js
import {EscapeCloseMixin} from '../shared/escape-close-mixin.js';
```

Mixin phụ thuộc càng ít vào base class thì càng dễ dùng lại.

Lit không có tiện ích tương đương `dedupingMixin()` ở 1.4. Tài liệu Lit
tham khảo thư viện [`@open-wc/dedupe-mixin`](https://open-wc.org/docs/development/dedupe-mixin/)
cho trường hợp cần loại mixin trùng.

Quy tắc chính:

- `connectedCallback()` và `disconnectedCallback()` phải gọi `super`.
- `update()` phải gọi `super.update(changedProperties)`; bỏ đi thì `render()`
  không chạy.
- Gọi `super` trong `willUpdate()`, `firstUpdated()` và `updated()` nếu
  superclass hoặc mixin có logic trong hook đó.
- Gán giá trị mới liên tục trong `updated()` có thể tạo update loop.
- Dùng `await this.updateComplete` trước khi đọc DOM của chính component sau
  một thay đổi. Promise này không mặc định chờ toàn bộ component con update.

Mixin thêm style qua `static styles`:

```js
export const DialogStyleMixin = (baseClass) =>
  class DialogStyleMixinImpl extends baseClass {
    static styles = dialogStyles;
  };
```

Subclass phải giữ style của base class:

```js
const DialogBase = EscapeCloseMixin(DialogStyleMixin(OpenableMixin(LitElement)));

class EscapeLitDialog extends DialogBase {
  static styles = [
    DialogBase.styles,
    css`.dialog { border-color: #7c3aed; }`,
  ];
}
```

Lit không có option tương đương `notify`. Component hoặc mixin phải tự phát
event bằng `dispatchEvent()` khi public state thay đổi. `OpenableMixin` phát
`opened-changed` trong `updated()`:

```js
updated(changedProperties) {
  super.updated?.(changedProperties);

  if (
    changedProperties.has('opened') &&
    changedProperties.get('opened') !== undefined
  ) {
    this.dispatchEvent(new CustomEvent('opened-changed', {
      bubbles: true,
      composed: true,
      detail: {value: this.opened},
    }));
  }
}
```

`changedProperties.get('opened')` là giá trị cũ. Điều kiện `!== undefined` bỏ
qua lần gán đầu tiên trong constructor.

Cách này mô phỏng `notify` của Polymer: event phát ra mỗi khi `opened` đổi,
kể cả khi code bên ngoài gán `dialog.opened = true`. Tài liệu Lit khuyên khác:
chỉ phát event khi người dùng tương tác hoặc state đổi bất đồng bộ, không phát
khi chính owner gán property (giống `<input>`: gõ phím thì có `change`, gán
`input.value` thì không). Muốn theo hướng đó, phát event trong handler của
nút thay vì trong `updated()`.

Consumer lắng nghe event như với element thông thường:

```js
dialog.addEventListener('opened-changed', (event) => {
  console.log(event.detail.value);
});
```

## 3. Reactive Controller

### 3.1. Khái niệm và syntax

Reactive Controller là object gắn vào một component (host) và tham gia update
cycle của host. Mixin làm element **là** một thứ gì đó (`is-a`); controller là
thứ element **có** (`has-a`):

```js
// Mixin: opened nằm trên element.
class MyDialog extends OpenableMixin(LitElement) {}

// Controller: opened nằm trên this.openable.
class MyDialog extends LitElement {
  openable = new OpenableController(this);
}
```

Syntax của một controller:

```js
class SomeController {
  constructor(host) {
    this.host = host;
    host.addController(this);
  }

  hostConnected() {}
  hostUpdate() {}
  hostUpdated() {}
  hostDisconnected() {}
}
```

Controller nhận host qua constructor và tự đăng ký bằng `addController()`.
Bốn hook đều optional:

| Hook | Thời điểm |
|---|---|
| `hostConnected()` | Host connect; render root đã tồn tại |
| `hostUpdate()` | Trước `update()` và `render()` |
| `hostUpdated()` | Sau khi DOM update, trước `firstUpdated()` và `updated()` |
| `hostDisconnected()` | Host disconnect |

`LitElement` cung cấp host API cho controller:

| API | Chức năng |
|---|---|
| `addController(controller)` | Đăng ký controller |
| `removeController(controller)` | Gỡ controller |
| `requestUpdate()` | Schedule update |
| `updateComplete` | Promise resolve khi update xong |

`PolymerElement` không có API này. Muốn dùng controller trong Polymer phải
viết adapter riêng; đây không phải API chính thức của Polymer.

### 3.2. Ví dụ: `OpenableController`

Viết lại `OpenableMixin` thành controller:

```js
export class OpenableController {
  constructor(host) {
    this.host = host;
    this._opened = false;
    host.addController(this);
  }

  get opened() {
    return this._opened;
  }

  set opened(value) {
    this._opened = value;
    this.host.requestUpdate();
  }

  open() {
    this.opened = true;
  }

  close() {
    this.opened = false;
  }

  toggle() {
    this.opened = !this.opened;
  }
}
```

State của controller không phải reactive property, nên setter phải tự gọi
`host.requestUpdate()`. Thiếu dòng này, `opened` đổi nhưng template không
render lại.

Dùng trong component:

```js
class CtrlDialog extends LitElement {
  openable = new OpenableController(this);

  render() {
    return html`
      <button @click=${() => this.openable.toggle()}>Mở / đóng dialog</button>

      <div class="dialog" ?hidden=${!this.openable.opened}>
        <h4>Dialog dùng controller</h4>
        <button @click=${() => this.openable.close()}>Đóng</button>
      </div>
    `;
  }
}
```

`openable` khai báo bằng class field. Khác với reactive property ở
[2.3](#23-custom-property), controller không bị class field che accessor.

Element không tự có `opened`, `toggle()` hay attribute `opened`. Host chọn API
nào cần expose ([3.4](#34-custom-controller)).

### 3.3. Ghép controller và lifecycle hook

Tương tự 1.3, thêm chức năng nhấn Escape để đóng. `EscapeController` dùng hai
hook để thêm và gỡ listener:

```js
export class EscapeController {
  constructor(host, onEscape) {
    this.host = host;
    this.onEscape = onEscape;
    this.listener = (event) => {
      if (event.key === 'Escape') this.onEscape();
    };
    host.addController(this);
  }

  hostConnected() {
    document.addEventListener('keydown', this.listener);
  }

  hostDisconnected() {
    document.removeEventListener('keydown', this.listener);
  }
}
```

```js
class CtrlDialog extends LitElement {
  openable = new OpenableController(this);
  escape = new EscapeController(this, () => this.openable.close());
}
```

So với `EscapeCloseMixin`:

| | `EscapeCloseMixin` | `EscapeController` |
|---|---|---|
| Ghép | Lồng function, tạo prototype chain | Thêm field |
| `super` | Phải gọi `super.connectedCallback()` | Không cần |
| Phụ thuộc | Class phía dưới phải có `close()` | Nhận callback, không cần biết host |

Hai controller không biết nhau; host nối chúng bằng callback.

### 3.4. Custom controller

Truyền config và callback qua object option:

```js
export class OpenableController {
  constructor(host, {opened = false, onChange} = {}) {
    this.host = host;
    this.onChange = onChange;
    this._opened = opened;
    host.addController(this);
  }

  set opened(value) {
    if (value === this._opened) return;

    this._opened = value;
    this.onChange?.(value);
    this.host.requestUpdate();
  }

  // ...
}
```

```js
openable = new OpenableController(this, {
  opened: true,
  onChange: (opened) => console.log(opened),
});
```

Controller có thể để private, element chỉ expose API cần thiết. Consumer bên
ngoài nhận thay đổi qua event do host phát:

```js
class PrivateCtrlDialog extends LitElement {
  #openable = new OpenableController(this, {
    onChange: (opened) => {
      this.dispatchEvent(new CustomEvent('opened-changed', {
        bubbles: true,
        composed: true,
        detail: {value: opened},
      }));
    },
  });

  get opened() {
    return this.#openable.opened;
  }

  toggle() {
    this.#openable.toggle();
  }
}
```

Từ bên ngoài, `PrivateCtrlDialog` dùng giống `LitDialog` ở 2.2: có `opened`,
`toggle()` và event `opened-changed`.

### 3.5. Nhiều instance

Một host có thể dùng nhiều instance của cùng controller, mỗi instance có state
riêng:

```js
class TwoDialogs extends LitElement {
  confirm = new OpenableController(this);
  help = new OpenableController(this);

  escape = new EscapeController(this, () => {
    this.confirm.close();
    this.help.close();
  });
}
```

Mixin không làm được việc này: `OpenableMixin` chỉ cho element một property
`opened`, áp dụng hai lần cũng không tạo ra hai trạng thái.

Controller cũng có thể chứa controller con. Truyền cùng `host` cho controller
con là đủ:

```js
export class AutoCloseController {
  constructor(host, seconds) {
    this.openable = new OpenableController(host, {
      onChange: (opened) => (opened ? this.start() : this.stop()),
    });
    // ...
  }
}
```

### 3.6. Cleanup và async

`AutoCloseController` ở trên tự đóng dialog sau vài giây. Timer phải được
clear khi host bị gỡ:

```js
export class AutoCloseController {
  constructor(host, seconds = 5) {
    this.host = host;
    this.seconds = seconds;
    this.openable = new OpenableController(host, {
      onChange: (opened) => (opened ? this.start() : this.stop()),
    });
    host.addController(this);
  }

  hostConnected() {
    if (this.openable.opened) this.start();
  }

  hostDisconnected() {
    this.stop();
  }

  start() {
    this.stop();
    this.remaining = this.seconds;
    this.timerId = setInterval(() => {
      this.remaining -= 1;
      if (this.remaining <= 0) {
        this.openable.close();
      } else {
        this.host.requestUpdate();
      }
    }, 1000);
  }

  stop() {
    clearInterval(this.timerId);
  }
}
```

Không clear trong `hostDisconnected()` thì element đã bị gỡ vẫn chạy
`setInterval` và gọi `requestUpdate()`.

Quy tắc:

- Thêm listener, observer, timer trong `hostConnected()` hoặc khi state cần.
- Cleanup trong `hostDisconnected()`.
- Khi tự gọi `removeController()`, cleanup trước khi gỡ.
- Với async, abort request cũ và bỏ kết quả đã stale, ví dụ dùng
  `AbortController` cho mỗi `fetch()` và gọi `abort()` trong
  `hostDisconnected()`.
- Dùng `@lit/task` nếu API `Task` đã đáp ứng yêu cầu async.

## 4. So sánh và lựa chọn

| Tiêu chí | Mixin | Reactive Controller |
|---|---|---|
| Cấu trúc | Class trong prototype chain | Object riêng do host giữ |
| State | Thường nằm trên element | Nằm trên controller |
| API | Tự thêm vào element | Host chọn API cần expose |
| Cấu hình | Property hoặc static metadata | Constructor, setter, method |
| Xung đột tên | Dễ xảy ra | Được giới hạn trong field controller |
| `super` | Cần để nối method và lifecycle | Không cần giữa host và controller |
| Nhiều instance cùng loại | Không thuận tiện | Hỗ trợ trực tiếp |
| Lifecycle | Override mọi hook của element | Bốn controller hook |
| Style | Lit mixin có thể cung cấp `static styles` | Host tự quản lý style |

Chọn theo nhu cầu:

- Logic thuần, không state hoặc lifecycle: dùng function/module.
- UI có template riêng: dùng component composition.
- State và lifecycle nội bộ trong Lit: ưu tiên Reactive Controller.
- Nhiều instance cùng chức năng: dùng Reactive Controller.
- Cần thêm API trực tiếp vào element hoặc override sâu lifecycle: dùng mixin.
- Polymer component: dùng Polymer mixin.
- Chỉ chia sẻ CSS: dùng `CSSResult` hoặc CSS custom property.

## 5. Chuyển từ Polymer sang Lit

| Polymer | Lit/Web API |
|---|---|
| `static get properties()` | `static properties` hoặc decorator |
| `value` | Gán trong constructor |
| `reflectToAttribute` | `reflect` |
| `notify` | `dispatchEvent()` |
| `computed` | Getter hoặc `willUpdate()` |
| `observer` | `willUpdate()` hoặc `updated()` |
| `[[value]]` | `${this.value}` |
| `on-click="handle"` | `@click=${this.handle}` |
| `this.$.button` | `renderRoot.querySelector()` hoặc `@query()` |
| `set`, `push`, `notifyPath` | Gán object/array mới |
| `setProperties()` | Gán liên tiếp; Lit tự batch |
| `ready()` | `constructor()`, `firstUpdated()` hoặc `updated()` tùy logic |

Quy trình ngắn:

1. Liệt kê property, method, event và lifecycle của Polymer mixin.
2. Tách utility function và shared style.
3. Chọn Lit mixin hoặc Reactive Controller cho phần còn lại.
4. Đổi mutation sang gán reference mới.
5. Chuyển logic `ready()` sang hook Lit phù hợp.
6. Test connect, disconnect, update timing, event và cleanup.

Các lỗi cần tránh:

- bỏ `super.ready()` trong Polymer;
- bỏ `super.connectedCallback()` hoặc `super.disconnectedCallback()` trong Lit;
- dùng class field che reactive accessor;
- override Lit property nhưng thiếu option;
- mutate object/array mà không trigger update;
- đọc DOM ngay sau khi đổi reactive property mà chưa chờ `updateComplete`;
- liên tục gán giá trị mới trong `updated()`;
- controller đổi state nhưng không gọi `requestUpdate()`;
- không cleanup listener, timer hoặc async task.

## 6. Demo và tài liệu tham khảo

### Chạy demo

```bash
python3 -m http.server 8000 --directory demo
```

Mở `http://localhost:8000`. Demo tải Polymer 3.5.2 và Lit 3.3.3 qua CDN nên
không cần `npm install` hoặc `node_modules`.

Demo là một trang [`demo/index.html`](demo/index.html), mỗi card ứng với một
mục trong tài liệu.

| Mục | Component | File |
|---|---|---|
| 1.2 | `<my-dialog>` | [`polymer/openable-mixin.js`](demo/polymer/openable-mixin.js), [`polymer/my-dialog.js`](demo/polymer/my-dialog.js) |
| 1.3 | `<escape-dialog>` | [`shared/escape-close-mixin.js`](demo/shared/escape-close-mixin.js), [`polymer/escape-dialog.js`](demo/polymer/escape-dialog.js) |
| 1.4 | `<modal-dialog>` | [`polymer/modal-mixin.js`](demo/polymer/modal-mixin.js), [`polymer/modal-dialog.js`](demo/polymer/modal-dialog.js) |
| 1.5 | `<confirm-dialog>` | [`polymer/confirm-dialog.js`](demo/polymer/confirm-dialog.js) |
| 2.2 | `<lit-dialog>` | [`lit/openable-mixin.js`](demo/lit/openable-mixin.js), [`lit/lit-dialog.js`](demo/lit/lit-dialog.js) |
| 2.3 | `<expanded-dialog>`, `<wrong-dialog>` | [`lit/expanded-dialog.js`](demo/lit/expanded-dialog.js), [`lit/wrong-dialog.js`](demo/lit/wrong-dialog.js) |
| 2.4 | `<escape-lit-dialog>` | [`lit/dialog-style-mixin.js`](demo/lit/dialog-style-mixin.js), [`lit/escape-lit-dialog.js`](demo/lit/escape-lit-dialog.js) |
| 3.2–3.3 | `<ctrl-dialog>` | [`controllers/openable-controller.js`](demo/controllers/openable-controller.js), [`controllers/escape-controller.js`](demo/controllers/escape-controller.js), [`controllers/ctrl-dialog.js`](demo/controllers/ctrl-dialog.js) |
| 3.4 | `<private-ctrl-dialog>` | [`controllers/private-ctrl-dialog.js`](demo/controllers/private-ctrl-dialog.js) |
| 3.5 | `<two-dialogs>` | [`controllers/two-dialogs.js`](demo/controllers/two-dialogs.js) |
| 3.6 | `<auto-close-dialog>` | [`controllers/auto-close-controller.js`](demo/controllers/auto-close-controller.js), [`controllers/auto-close-dialog.js`](demo/controllers/auto-close-dialog.js) |

Code trong tài liệu được rút gọn; file demo có thêm style. Thêm component mới: tạo file
JS, import trong [`main.js`](demo/main.js) và thêm một card vào `index.html`.

### Tài liệu tham khảo

- [MDN: Class mixins](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes/extends#mix-ins)
- [Polymer: Custom element concepts and mixins](https://polymer-library.polymer-project.org/3.0/docs/devguide/custom-elements)
- [Polymer: Properties](https://polymer-library.polymer-project.org/3.0/docs/devguide/properties)
- [Polymer: Data system](https://polymer-library.polymer-project.org/3.0/docs/devguide/data-system)
- [Lit: Mixins](https://lit.dev/docs/composition/mixins/)
- [Lit: Reactive controllers](https://lit.dev/docs/composition/controllers/)
- [Lit: Reactive properties](https://lit.dev/docs/components/properties/)
- [Lit: Lifecycle](https://lit.dev/docs/components/lifecycle/)
- [Lit: Composition overview](https://lit.dev/docs/composition/overview/)
