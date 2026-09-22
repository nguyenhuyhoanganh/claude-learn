# Mixin trong JavaScript, Polymer và Lit

> Polymer hiện chỉ được duy trì để hỗ trợ các dự án cũ. Với component mới,
> nên sử dụng Lit hoặc Web Components chuẩn.

## Mục lục

1. [Mixin là gì?](#1-mixin-là-gì)
2. [Chuỗi mixin, thứ tự gọi và `super`](#2-chuỗi-mixin-thứ-tự-gọi-và-super)
3. [Mixin trong Polymer](#3-mixin-trong-polymer)
4. [Mixin trong Lit](#4-mixin-trong-lit)
5. [Lifecycle và quá trình cập nhật của Lit](#5-lifecycle-và-quá-trình-cập-nhật-của-lit)
6. [`ready()` của Polymer chuyển sang Lit như thế nào?](#6-ready-của-polymer-chuyển-sang-lit-như-thế-nào)
7. [ReactiveController](#7-reactivecontroller)
8. [Khi nào dùng mixin, controller hoặc function?](#8-khi-nào-dùng-mixin-controller-hoặc-function)
9. [Chuyển từ Polymer sang Lit](#9-chuyển-từ-polymer-sang-lit)
10. [Các lỗi thường gặp](#10-các-lỗi-thường-gặp)
11. [Chạy demo](#11-chạy-demo)
12. [Tài liệu tham khảo](#12-tài-liệu-tham-khảo)

## 1. Mixin là gì?

### Cấu trúc tối thiểu

Mixin là một function nhận vào `BaseClass` và trả về một class mới
`extends BaseClass`. Class mới giữ nguyên những gì đã có trong `BaseClass`,
đồng thời bổ sung thêm property, method hoặc lifecycle.

Cấu trúc tối thiểu:

```js
const SomeMixin = (BaseClass) => class extends BaseClass {
  // Property, method hoặc lifecycle cần bổ sung.
};
```

Đọc đoạn code trên theo bốn bước:

1. `SomeMixin` là một function.
2. `BaseClass` là class được truyền vào.
3. Function trả về một class mới.
4. Class mới `extends BaseClass`, nên vẫn có toàn bộ API của `BaseClass`.

`BaseClass` không phải tên của một class cụ thể. Nó có thể là `HTMLElement`,
`PolymerElement`, `LitElement` hoặc một class đã được áp dụng mixin khác.

### Ví dụ đơn giản: `OpenableMixin`

```js
export const OpenableMixin = (BaseClass) =>
  class OpenableMixinImpl extends BaseClass {
    constructor() {
      super();
      this.opened = false;
    }

    toggle() {
      this.opened = !this.opened;
    }
  };
```

Áp dụng mixin vào một custom element:

```js
class BasicPanel extends OpenableMixin(HTMLElement) {}

customElements.define('basic-panel', BasicPanel);

const panel = document.createElement('basic-panel');
panel.toggle();
console.log(panel.opened); // true
```

`BasicPanel` có `opened` và `toggle()` dù các API này không được viết trực tiếp
trong `BasicPanel`.

### JavaScript thực sự tạo ra gì?

Khi gọi:

```js
OpenableMixin(HTMLElement)
```

kết quả là một class mới:

```js
class OpenableMixinImpl extends HTMLElement {
  // ...
}
```

Vì vậy mixin không sao chép method vào `HTMLElement.prototype`. Nó tạo thêm
một class trong prototype chain:

```text
BasicPanel
  → OpenableMixinImpl
  → HTMLElement
```

Đây là lý do `super` vẫn hoạt động bình thường trong mixin.

### Một mixin nên nói rõ những gì?

Trước khi dùng lại một mixin, cần biết:

- Mixin thêm property và method nào?
- Mixin cần API nào từ class được truyền vào?
- Mixin có override lifecycle hay không?
- Mixin có tạo listener, timer, observer hoặc subscription không?
- Tài nguyên đó được dọn ở đâu?
- Mixin phát event nào?

Ví dụ sau chỉ hoạt động khi `BaseClass` đã có `toggle()`:

```js
const DisableableMixin = (BaseClass) => class extends BaseClass {
  toggle() {
    if (!this.disabled) {
      super.toggle();
    }
  }
};
```

Nếu `BaseClass` không có `toggle()`, `super.toggle()` sẽ gây lỗi. Điều kiện này
cần được ghi rõ trong tài liệu của mixin vì JavaScript không tự kiểm tra.

## 2. Chuỗi mixin, thứ tự gọi và `super`

### Cách đọc một chain

```js
class MyElement extends LoggingMixin(OpenableMixin(HTMLElement)) {}
```

JavaScript thực hiện từ trong ra ngoài:

1. `OpenableMixin(HTMLElement)` tạo class thứ nhất.
2. Class thứ nhất được truyền vào `LoggingMixin(...)` để tạo class thứ hai.
3. `MyElement` extends class thứ hai.

Prototype chain cuối cùng:

```text
MyElement
  → LoggingMixinImpl
  → OpenableMixinImpl
  → HTMLElement
```

### Method nào được ưu tiên?

JavaScript tìm method từ trên xuống theo prototype chain và dừng ở method đầu
tiên tìm thấy. Nếu cả hai mixin đều có `toggle()`, method của
`LoggingMixinImpl` được tìm thấy trước vì nó gần `MyElement` hơn.

```js
const LoggingMixin = (BaseClass) => class extends BaseClass {
  toggle() {
    console.log('trước khi toggle');
    super.toggle();
    console.log('sau khi toggle');
  }
};
```

Khi gọi `element.toggle()`:

```text
LoggingMixin.toggle()
  → super.toggle()
  → OpenableMixin.toggle()
```

Mixin được áp dụng sau có thể xử lý trước hoặc sau method đã có. Nó phải gọi
`super` nếu muốn method trước đó tiếp tục chạy.

### Thứ tự constructor

Constructor chạy từ `HTMLElement` lên đến `MyElement`:

```text
HTMLElement
  → OpenableMixinImpl
  → LoggingMixinImpl
  → MyElement
```

Lý do là constructor của class kế thừa phải gọi `super()` trước khi dùng
`this`.

### Vị trí gọi `super` quyết định thứ tự

```js
method() {
  console.log('A');
  super.method();
  console.log('B');
}
```

Phần code trước `super` của mixin được áp dụng sau sẽ chạy trước. Phần code sau
`super` chỉ chạy khi method trước đó đã hoàn tất. Vị trí gọi `super` phải tuân
theo yêu cầu của framework:

- Polymer yêu cầu gọi lifecycle tương ứng qua `super` ở dòng đầu tiên.
- Lit yêu cầu gọi `super` khi override lifecycle chuẩn của custom element như
  `connectedCallback()` và `disconnectedCallback()`.
- Các hook `willUpdate()`, `firstUpdated()` và `updated()` không bắt buộc gọi
  `super` đối với bản thân Lit, nhưng mixin nên gọi để không làm đứt chain.
- Nếu override `update()` của Lit, bắt buộc gọi `super.update()`.

### Khi hai mixin trùng tên

Nếu hai mixin khai báo cùng property hoặc method:

- method ở gần element nhất được ưu tiên;
- `super` có thể nối các method thành một chuỗi;
- cấu hình property có thể bị ghi đè và khó nhận ra;
- trạng thái nội bộ nên có tên đủ riêng để tránh xung đột.

### Khi một mixin bị áp dụng hai lần

Mỗi lần gọi mixin thông thường tạo ra một class mới:

```js
OpenableMixin(HTMLElement) === OpenableMixin(HTMLElement); // false
```

Nếu cùng một mixin xuất hiện hai lần trong chain, listener hoặc lifecycle có
thể chạy hai lần. Polymer cung cấp `dedupingMixin()` để tránh trường hợp này:

```js
import {dedupingMixin} from
  '@polymer/polymer/lib/utils/mixin.js';

export const OpenableMixin = dedupingMixin(
  (BaseClass) => class extends BaseClass {}
);
```

Lit không có hàm hỗ trợ tương đương tích hợp sẵn. Nếu thường xuyên gặp mixin lặp,
nên kiểm tra lại chain hoặc cân nhắc chuyển phần logic phù hợp sang
ReactiveController.

Mở demo JavaScript thuần:
[`demo/index.html#javascript-mixin`](demo/index.html#javascript-mixin).

## 3. Mixin trong Polymer

Polymer đọc `properties`, observer và lifecycle trên toàn bộ prototype chain.
Do đó property do mixin khai báo có thể dùng trực tiếp trong template của
element.

### Bước 1: viết mixin Polymer

```js
import {dedupingMixin} from
  '@polymer/polymer/lib/utils/mixin.js';

export const OpenableMixin = dedupingMixin((BaseClass) =>
  class OpenableMixinImpl extends BaseClass {
    static get properties() {
      return {
        opened: {
          type: Boolean,
          value: false,
          reflectToAttribute: true,
          notify: true,
          observer: 'openedChanged_',
        },
        label: {
          type: String,
          computed: 'computeLabel_(opened)',
        },
      };
    }

    toggle() {
      this.opened = !this.opened;
    }

    computeLabel_(opened) {
      return opened ? 'Đang mở' : 'Đang đóng';
    }

    openedChanged_(opened, oldOpened) {
      console.log({opened, oldOpened});
    }
  });
```

Mixin trên cung cấp:

- property `opened`;
- attribute `opened` nhờ `reflectToAttribute`;
- event `opened-changed` nhờ `notify`;
- computed property `label`;
- observer `openedChanged_()`;
- method `toggle()`.

### Bước 2: element sử dụng mixin

```js
import {html, PolymerElement} from
  '@polymer/polymer/polymer-element.js';
import {OpenableMixin} from './openable-mixin.js';

class PolymerPanel extends OpenableMixin(PolymerElement) {
  static get is() {
    return 'polymer-panel';
  }

  static get template() {
    return html`
      <button on-click="toggle">[[label]]</button>
      <p>opened = [[opened]]</p>
      <div hidden$="[[!opened]]">
        Nội dung đang hiển thị.
      </div>
    `;
  }
}

customElements.define(PolymerPanel.is, PolymerPanel);
```

Element không khai báo lại `opened`, `label` hoặc `toggle()`. Polymer lấy các
API đó từ mixin trong prototype chain.

### Dùng trạng thái của mixin trong CSS

`reflectToAttribute: true` phản chiếu giá trị `opened` thành attribute trên
element. CSS bên ngoài có thể dùng attribute này:

```css
polymer-panel {
  border: 1px solid #999;
}

polymer-panel[opened] {
  border-color: #111;
}
```

Nếu CSS nằm trong shadow DOM của element, có thể dùng:

```css
:host([opened]) .content {
  display: block;
}
```

Mixin cung cấp trạng thái và attribute. Element quyết định trạng thái đó được
hiển thị như thế nào.

### Các option thường dùng trong `properties`

| Option | Ý nghĩa |
|---|---|
| `type` | Chuyển đổi giá trị giữa attribute và property |
| `value` | Giá trị mặc định; object và array phải dùng function trả về giá trị mới |
| `reflectToAttribute` | Phản chiếu property thành attribute |
| `notify` | Phát event `<property>-changed` |
| `readOnly` | Chỉ cho phép thay đổi qua setter nội bộ do Polymer tạo |
| `computed` | Tính property từ các property khác |
| `observer` | Gọi method khi property thay đổi |

### Property effects chạy theo thứ tự nào?

Khi một property hoặc path thay đổi, Polymer xử lý theo thứ tự:

```text
Property hoặc path thay đổi
            │
            ▼
  1. Computed properties
            │
            ▼
  2. Data bindings
            │
            ▼
  3. Phản chiếu attribute
            │
            ▼
  4. Observers
            │
            ▼
  5. Change notification events
```

Các bước này chạy đồng bộ. Nếu gán hai property riêng biệt, observer phụ thuộc
cả hai có thể chạy nhiều lần:

```js
this.firstName = 'An';
this.lastName = 'Nguyen';
```

Khi cần cập nhật cùng lúc trong Polymer, dùng:

```js
this.setProperties({
  firstName: 'An',
  lastName: 'Nguyen',
});
```

### Object, array và path trong Polymer

Thay đổi trực tiếp một giá trị nằm sâu bên trong object không tự tạo property
effect:

```js
this.user.name = 'An'; // Polymer không biết path này vừa đổi.
```

Dùng API của Polymer:

```js
this.set('user.name', 'An');
this.push('items', newItem);
this.splice('items', index, 1);
this.notifyPath('user.name');
```

### Event trong Polymer

Event handler trong template:

```html
<button on-click="toggle">Toggle</button>
```

Với `notify: true`, khi `opened` thay đổi, Polymer phát event
`opened-changed`. Giá trị mới nằm ở `event.detail.value`:

```js
panel.addEventListener('opened-changed', (event) => {
  console.log(event.detail.value);
});
```

Giá trị mặc định cũng đi qua property effects. Vì vậy, nếu listener đã được
gắn trước lúc element khởi tạo xong, nó có thể nhận event cho giá trị mặc định
trước những lần thay đổi do người dùng tạo ra.

Event do `notify` tạo không bubble. Nếu cần một event nghiệp vụ đi qua shadow
boundary, phải phát rõ ràng:

```js
this.dispatchEvent(new CustomEvent('panel-opened', {
  detail: {source: 'keyboard'},
  bubbles: true,
  composed: true,
}));
```

Không nên tự động đặt mọi event thành `bubbles: true` và `composed: true`.
Đây phải là một phần trong API của component.

### Lifecycle Polymer

| Callback | Số lần | Dùng cho |
|---|---:|---|
| `constructor()` | Một lần | Khởi tạo JavaScript chưa cần DOM |
| `connectedCallback()` | Có thể nhiều lần | Đăng ký listener hoặc subscription bên ngoài element |
| `ready()` | Một lần | Truy cập template, shadow DOM và `this.$` sau khi Polymer khởi tạo |
| `disconnectedCallback()` | Có thể nhiều lần | Gỡ listener, observer và subscription |

```text
Tạo element
    │
    ▼
constructor()                         [một lần]
    │
    ▼
Gắn vào document lần đầu
    │
    ▼
connectedCallback()
    └── ready()                       [một lần, trong lần khởi tạo đầu]
    │
    ▼
Gỡ khỏi document
    │
    ▼
disconnectedCallback()
    │
    ▼
Gắn lại
    │
    ▼
connectedCallback()                   [ready() không chạy lại]
```

Polymer yêu cầu gọi lifecycle tương ứng qua `super` ở dòng đầu tiên:

```js
ready() {
  super.ready();
  this.$.button.focus();
}
```

Listener trên `window` hoặc `document` phải được quản lý theo cặp:

```js
connectedCallback() {
  super.connectedCallback();
  this.resizeListener ??= () => this.handleResize();
  window.addEventListener('resize', this.resizeListener);
}

disconnectedCallback() {
  super.disconnectedCallback();
  window.removeEventListener('resize', this.resizeListener);
}
```

Không nên đặt listener loại này trong `ready()` vì `ready()` chỉ chạy một lần,
trong khi element có thể bị tháo ra và gắn lại nhiều lần.

### Class mixin, Behavior và CSS mixin không giống nhau

| Tên gọi | Bản chất |
|---|---|
| Class mixin | Function nhận `BaseClass`, trả về class mới |
| Behavior | Object cấu hình được Polymer legacy merge vào element |
| CSS mixin | Nhóm khai báo CSS dùng qua custom property và `@apply` |

Behavior và CSS mixin là cơ chế cũ. Khi đọc dự án Polymer cũ vẫn có thể gặp,
nhưng không nên tạo thêm cho code mới.

Mở demo Polymer:
[`demo/index.html#polymer-mixin`](demo/index.html#polymer-mixin).

## 4. Mixin trong Lit

Cấu trúc mixin trong Lit vẫn là JavaScript mixin thông thường. Điểm khác nằm
ở cách Lit theo dõi property và cập nhật DOM.

### Bước 1: viết mixin Lit

```js
export const OpenableMixin = (BaseClass) =>
  class OpenableMixinImpl extends BaseClass {
    static properties = {
      opened: {type: Boolean, reflect: true},
    };

    constructor() {
      super();
      this.opened = false;
    }

    toggle() {
      this.opened = !this.opened;
    }
  };
```

Lit kế thừa khai báo reactive property qua class chain. Element sử dụng mixin
không cần khai báo lại `opened`.

### Bước 2: element sử dụng mixin

```js
import {html, LitElement} from 'lit';
import {OpenableMixin} from './openable-mixin.js';

class LitPanel extends OpenableMixin(LitElement) {
  render() {
    return html`
      <button @click=${this.toggle}>
        opened = ${this.opened}
      </button>
      <div ?hidden=${!this.opened}>
        Nội dung đang hiển thị.
      </div>
    `;
  }
}

customElements.define('lit-panel', LitPanel);
```

Khi `toggle()` đổi `opened`, setter do Lit tạo sẽ yêu cầu cập nhật. Lit không
render ngay tại dòng gán; các thay đổi được gom lại và xử lý trong microtask.

### Reactive property trong Lit

```js
static properties = {
  opened: {
    type: Boolean,
    reflect: true,
    attribute: 'opened',
    hasChanged: (value, oldValue) => value !== oldValue,
  },
};
```

- `type` dùng để chuyển đổi giữa attribute và property.
- `reflect` phản chiếu property thành attribute trong lần cập nhật.
- `attribute` đổi tên attribute hoặc tắt attribute bằng `false`.
- `hasChanged` quyết định giá trị mới có cần update hay không.
- Giá trị mặc định thường được gán trong constructor.

### Object và array trong Lit

Lit mặc định kiểm tra thay đổi bằng tham chiếu. Nên tạo object hoặc array mới:

```js
this.user = {...this.user, name: 'An'};
this.items = [...this.items, newItem];
```

Không nên chỉ mutate giá trị cũ:

```js
this.user.name = 'An';
```

Có thể gọi `requestUpdate()` sau khi mutate, nhưng gán một tham chiếu mới dễ
theo dõi hơn và phù hợp với luồng dữ liệu một chiều.

### Style trong Lit mixin

Mixin có thể cung cấp `static styles`. Nếu element tự khai báo `static styles`,
cần đưa styles của mixin vào mảng để không làm mất chúng.

```js
const openableStyles = css`
  :host([opened]) {
    border-color: currentColor;
  }
`;

const StyledOpenableMixin = (BaseClass) => class extends BaseClass {
  static styles = [BaseClass.styles ?? [], openableStyles];
};

const PanelBase = StyledOpenableMixin(LitElement);

class LitPanel extends PanelBase {
  static styles = [
    PanelBase.styles ?? [],
    css`:host { display: block; }`,
  ];
}
```

Nếu style không cần kế thừa, xuất một `CSSResult` riêng thường dễ dùng và
dễ kiểm soát hơn. Theme theo từng instance nên dùng CSS custom properties.

### Event trong Lit

Lit không có `notify: true`. Component phải tự xác định event nào thuộc API:

```js
this.dispatchEvent(new CustomEvent('opened-changed', {
  detail: {value: this.opened},
  bubbles: true,
  composed: true,
}));
```

Nếu listener cần nhìn thấy DOM đã cập nhật, chờ update hoàn tất trước khi phát:

```js
this.opened = true;
await this.updateComplete;
this.dispatchEvent(new CustomEvent('panel-opened'));
```

## 5. Lifecycle và quá trình cập nhật của Lit

### Lifecycle chuẩn của custom element

LitElement vẫn là custom element, nên có các callback chuẩn:

| Callback | Dùng cho |
|---|---|
| `constructor()` | Khởi tạo giá trị chưa cần DOM |
| `connectedCallback()` | Đăng ký listener, observer hoặc subscription bên ngoài |
| `disconnectedCallback()` | Dọn những gì đã đăng ký khi connect |
| `attributeChangedCallback()` | Lit dùng để đồng bộ attribute sang property; hiếm khi cần override |
| `adoptedCallback()` | Element được chuyển sang document khác |

```text
Tạo element
    │
    ▼
constructor()                         [một lần]
    │
    ▼
connectedCallback()
    │
    ▼
Lần render đầu
    │
    ▼
firstUpdated()                        [một lần]
    │
    ▼
updated()
    │
    ├── property đổi → update → updated()
    │
    ▼
disconnectedCallback()
    │
    ▼
connectedCallback()                   [firstUpdated() không chạy lại]
```

Khi override các callback này, phải gọi `super`:

```js
connectedCallback() {
  super.connectedCallback();
  this.resizeListener ??= () => this.handleResize();
  window.addEventListener('resize', this.resizeListener);
}

disconnectedCallback() {
  super.disconnectedCallback();
  window.removeEventListener('resize', this.resizeListener);
}
```

### Lit cập nhật giao diện theo thứ tự nào?

Khi reactive property thay đổi:

```text
property setter
  → hasChanged()
  → requestUpdate()
  → chờ microtask
  → shouldUpdate(changedProperties)
  → willUpdate(changedProperties)
  → update(changedProperties)
      → phản chiếu attribute
      → gọi render()
      → cập nhật DOM
  → firstUpdated(changedProperties)   [chỉ lần đầu]
  → updated(changedProperties)
  → updateComplete hoàn tất
```

`changedProperties` là một `Map`. Key là tên property; value là giá trị cũ.

```js
updated(changedProperties) {
  if (changedProperties.has('opened')) {
    console.log('Giá trị cũ:', changedProperties.get('opened'));
    console.log('Giá trị mới:', this.opened);
  }
}
```

### Chọn hook nào?

| Hook | DOM đã cập nhật? | Dùng cho |
|---|:---:|---|
| `shouldUpdate()` | Chưa | Quyết định có tiếp tục update hay không |
| `willUpdate()` | Chưa | Tính dữ liệu cần cho lần render hiện tại |
| `render()` | Đang tạo template | Trả về template, không đặt side effect ở đây |
| `update()` | Đang cập nhật | Hook thấp; hiếm khi cần override |
| `firstUpdated()` | Rồi | Công việc cần DOM và chỉ chạy sau lần render đầu |
| `updated()` | Rồi | Side effect cần DOM sau mỗi lần update |

Nếu override `update()`, phải gọi `super.update()`:

```js
update(changedProperties) {
  // Việc cần làm trước render.
  super.update(changedProperties);
  // DOM của element đã được cập nhật.
}
```

### Khi thay property trong lifecycle

- Thay property từ `shouldUpdate()` đến `render()` không tạo thêm lần cập nhật.
- Thay property trong `firstUpdated()` hoặc `updated()` tạo một update mới.
- Gán trạng thái vô điều kiện trong `updated()` có thể gây vòng lặp cập nhật.

### `updateComplete`

```js
async openAndFocus() {
  this.opened = true;
  await this.updateComplete;
  this.renderRoot.querySelector('button')?.focus();
}
```

`updateComplete` mặc định chỉ chờ update của element hiện tại, không chờ toàn
bộ component con. Promise trả về:

- `true` nếu sau lần cập nhật vừa xong không còn update nào đang chờ;
- `false` nếu lần cập nhật đó tạo thêm một update.

Không cần chờ `updateComplete` khi code chỉ thay trạng thái và không đọc DOM mới.

### Lifecycle trong Lit mixin

Mixin nên gọi hook đã có qua `super` để không làm mất logic của mixin khác:

```js
const MeasureMixin = (BaseClass) => class extends BaseClass {
  firstUpdated(changedProperties) {
    super.firstUpdated?.(changedProperties);
    this.measure();
  }

  updated(changedProperties) {
    super.updated?.(changedProperties);
    if (changedProperties.has('opened')) {
      this.measure();
    }
  }
};
```

## 6. `ready()` của Polymer chuyển sang Lit như thế nào?

Lit không có `ready()`. Không nên đổi tên `ready()` thành một hook cố định.
Cần nhìn vào công việc bên trong để chọn vị trí mới.

| Công việc trong Polymer `ready()` | Vị trí phù hợp trong Lit |
|---|---|
| Gán giá trị không cần DOM | `constructor()` |
| Đăng ký listener trên `window` hoặc `document` | `connectedCallback()` và `disconnectedCallback()` |
| Chuẩn bị dữ liệu trước render | Getter hoặc `willUpdate()` |
| Truy cập DOM sau lần render đầu | `firstUpdated()` |
| Phản ứng sau mọi lần render | `updated()` |
| Đọc DOM ngay sau khi đổi property | `await updateComplete` |

Polymer:

```js
ready() {
  super.ready();
  this.$.input.focus();
}
```

Lit:

```js
firstUpdated(changedProperties) {
  super.firstUpdated?.(changedProperties);
  this.renderRoot.querySelector('input')?.focus();
}
```

Nếu đoạn code phụ thuộc vào light DOM children, không nên mặc định dùng
`firstUpdated()`. Cần theo dõi `slotchange` vì children có thể thay đổi sau đó.

## 7. ReactiveController

### ReactiveController là gì?

ReactiveController là một object thuộc về một Lit element. Lit gọi lifecycle
method của controller trong quá trình element connect, update và disconnect.

Điểm khác nhau quan trọng:

```text
Mixin:
  LitPanel → OpenableMixinImpl → LitElement
  Mixin nằm trong prototype chain.

Controller:
  LitPanel
    └── counter: CounterController
  Controller là một object nằm trong element.
```

Mixin thêm API trực tiếp lên element. Controller giữ API và trạng thái trong một
object riêng.

### API mà controller nhận từ host

Trong tài liệu Lit, element đang sở hữu controller được gọi là **host**. Host
cung cấp các API:

- `addController(controller)`;
- `removeController(controller)`;
- `requestUpdate()`;
- `updateComplete`.

### Lifecycle của controller

| Callback | Thời điểm |
|---|---|
| `hostConnected()` | Host được gắn vào document |
| `hostUpdate()` | Trước khi host render và cập nhật DOM |
| `hostUpdated()` | Sau khi DOM của host đã cập nhật |
| `hostDisconnected()` | Host bị tháo khỏi document |

Các callback đều không bắt buộc. Controller chỉ cần khai báo callback phù hợp
với chức năng của nó.

Trong một lần cập nhật, `hostUpdate()` chạy trước `host.update()` và
`render()`. `hostUpdated()` chạy sau khi DOM được cập nhật và trước
`updated()` của host.

```text
Host bắt đầu cập nhật
        │
        ▼
controller.hostUpdate()               [trước update/render]
        │
        ▼
host.update() → render() → cập nhật DOM
        │
        ▼
controller.hostUpdated()              [sau update, trước updated]
        │
        ▼
host.firstUpdated()                    [chỉ lần đầu]
        │
        ▼
host.updated()
```

Khi host được gắn hoặc tháo khỏi document:

```text
host connected      → controller.hostConnected()
host disconnected   → controller.hostDisconnected()
```

Nếu một mixin gọi `super.connectedCallback()` hoặc
`super.disconnectedCallback()` trước phần logic riêng, callback tương ứng của
controller chạy trong lời gọi `super` đó. Thứ tự cụ thể giữa log của mixin và
controller vì thế phụ thuộc vào vị trí gọi `super`, không chỉ phụ thuộc tên
lifecycle.

### Ví dụ reactive đơn giản

```js
export class CounterController {
  constructor(host) {
    this.host = host;
    this.value = 0;
    host.addController(this);
  }

  increment() {
    this.value += 1;
    this.host.requestUpdate();
  }
}
```

Sử dụng trong element:

```js
class LitPanel extends OpenableMixin(LitElement) {
  constructor() {
    super();
    this.counter = new CounterController(this);
  }

  render() {
    return html`
      <button @click=${() => this.counter.increment()}>
        count = ${this.counter.value}
      </button>
    `;
  }
}
```

`value` là trạng thái của controller, không phải reactive property của element.
Vì template đọc `this.counter.value`, controller phải gọi
`host.requestUpdate()` sau khi thay đổi giá trị.

### Ví dụ có lifecycle và dọn tài nguyên

```js
export class MediaQueryController {
  constructor(host, query) {
    this.host = host;
    this.query = query;
    this.matches = false;
    host.addController(this);
  }

  hostConnected() {
    this.media = window.matchMedia(this.query);
    this.matches = this.media.matches;
    this.handleChange = (event) => {
      this.matches = event.matches;
      this.host.requestUpdate();
    };
    this.media.addEventListener('change', this.handleChange);
    this.host.requestUpdate();
  }

  hostDisconnected() {
    this.media?.removeEventListener('change', this.handleChange);
  }
}
```

Controller phù hợp với listener, observer, timer, fetch hoặc subscription vì
phần khởi tạo và cleanup được đặt cạnh nhau.

### Nhiều instance trong cùng một element

```js
class ResponsivePanel extends LitElement {
  constructor() {
    super();
    this.narrow = new MediaQueryController(
      this,
      '(max-width: 700px)',
    );
    this.reducedMotion = new MediaQueryController(
      this,
      '(prefers-reduced-motion: reduce)',
    );
  }
}
```

Hai controller có trạng thái riêng. Mixin không phù hợp với trường hợp cần nhiều
instance độc lập của cùng một chức năng trong một element.

### Tác vụ bất đồng bộ

Controller có thể đóng gói input, trạng thái `pending`, kết quả, lỗi và
cancellation của một tác vụ bất đồng bộ. Lit cung cấp `@lit/task`, một
ReactiveController được thiết kế sẵn cho mục đích này.

Mở demo Lit:
[`demo/index.html#lit-controller`](demo/index.html#lit-controller).

## 8. Khi nào dùng mixin, controller hoặc function?

| Nhu cầu | Lựa chọn phù hợp |
|---|---|
| Chỉ tính toán, không giữ trạng thái và không cần lifecycle | Function hoặc module thường |
| Thêm property/method công khai trực tiếp lên element | Mixin |
| Override method và phối hợp bằng `super` | Mixin |
| Trạng thái và lifecycle chỉ dùng bên trong element | ReactiveController |
| Cần nhiều instance của cùng một chức năng | ReactiveController |
| Cần truyền cấu hình khi khởi tạo | ReactiveController |
| Chỉ tái sử dụng style | CSSResult hoặc CSS custom properties |

Quy tắc lựa chọn ngắn gọn:

1. Không có trạng thái hoặc lifecycle: dùng function.
2. Có trạng thái và lifecycle nội bộ: ưu tiên controller.
3. Cần thêm API trực tiếp vào element hoặc tham gia chuỗi kế thừa: dùng mixin.

Một element vẫn có thể cung cấp public method gọi vào controller:

```js
class SearchBox extends LitElement {
  constructor() {
    super();
    this.task = new SearchController(this);
  }

  search(query) {
    return this.task.run(query);
  }
}
```

Vì vậy, có public method không đồng nghĩa bắt buộc phải dùng mixin.

## 9. Chuyển từ Polymer sang Lit

### Bảng API tương ứng

| Polymer | Lit hoặc Web API | Ghi chú |
|---|---|---|
| `static get properties()` | `static properties` hoặc decorator `@property` | Lit kế thừa property qua class chain |
| `value` | Gán trong constructor | Mỗi instance phải có object/array riêng |
| `reflectToAttribute: true` | `reflect: true` | Cùng mục đích |
| `readOnly: true` | Private property và public getter | Lit không có option tương đương trực tiếp |
| `notify: true` | `dispatchEvent()` | Lit không tự tạo two-way binding |
| `computed` | Getter hoặc `willUpdate()` | Getter phù hợp với phép tính nhẹ |
| `observer` | `willUpdate()` hoặc `updated()` | Chọn theo việc có cần DOM mới hay không |
| `[[value]]` | `${this.value}` | Expression Lit là JavaScript |
| `{{value}}` | Property và event một chiều rõ ràng | Không có two-way binding tự động |
| `on-click="handle"` | `@click=${this.handle}` | Event binding của Lit |
| `hidden$="[[!opened]]"` | `?hidden=${!this.opened}` | Boolean attribute binding |
| `dom-if` | Conditional expression hoặc `when()` | |
| `dom-repeat` | `map()` hoặc `repeat()` | `repeat()` hữu ích khi cần key ổn định |
| `this.$.button` | `renderRoot.querySelector()` hoặc `@query` | Chỉ đọc sau render |
| `this.set('a.b', value)` | `this.a = {...this.a, b: value}` | Gán tham chiếu mới |
| `push()`/`splice()` của Polymer | Gán array mới | Ví dụ `[...items, item]` |
| `notifyPath()` | Gán object/array mới | Chỉ dùng `requestUpdate()` khi thật sự cần |
| `setProperties({...})` | Gán liên tiếp các reactive property | Lit tự gom thay đổi trong cùng microtask |
| `ready()` | Chọn hook theo mục đích | Không có ánh xạ một-một |
| `afterNextRender()` | `updateComplete`, sau đó `requestAnimationFrame()` nếu cần chờ paint | Hai API không hoàn toàn giống nhau |
| Polymer CSS mixin | CSS custom properties chuẩn | Không tiếp tục dùng `@apply` cho code mới |

### Observer nên chuyển đi đâu?

Polymer:

```js
openedChanged_(opened) {
  this.updateSomething(opened);
}
```

Lit, nếu không cần DOM mới:

```js
willUpdate(changedProperties) {
  if (changedProperties.has('opened')) {
    this.updateSomething(this.opened);
  }
}
```

Lit, nếu cần DOM đã render:

```js
updated(changedProperties) {
  if (changedProperties.has('opened')) {
    this.measureRenderedContent();
  }
}
```

Nếu logic chỉ xuất phát từ một thao tác người dùng, đặt trực tiếp trong event
handler thường rõ hơn observer.

### Quy trình chuyển một mixin

1. Liệt kê property, default value và attribute của mixin Polymer.
2. Liệt kê method công khai và event mà bên ngoài đang sử dụng.
3. Xác định computed, observer và lifecycle hiện có.
4. Tìm listener, timer, observer và subscription cần cleanup.
5. Quyết định chức năng đó nên tiếp tục là mixin hay chuyển thành controller.
6. Chuyển property declaration sang Lit.
7. Chuyển path mutation sang gán object hoặc array mới.
8. Chuyển `ready()` theo công việc thực tế bên trong.
9. Kiểm tra mọi đoạn đọc DOM ngay sau khi set property.
10. Thiết kế lại event thay vì chuyển `notify` một cách máy móc.
11. Kiểm tra `super`, kế thừa style và mixin bị áp dụng lặp.
12. Viết test cho connect, disconnect, update timing và event.

## 10. Các lỗi thường gặp

| Lỗi | Hậu quả | Cách xử lý |
|---|---|---|
| Quên `super.connectedCallback()` | Lit, Polymer hoặc mixin khác không chạy đúng | Gọi `super.connectedCallback()` |
| Không cleanup listener bên ngoài | Element bị giữ trong bộ nhớ hoặc handler vẫn chạy | Dùng cặp connect/disconnect |
| Hai mixin trùng method | Mixin được áp dụng sau che method đã có | Xác định rõ API và dùng `super` |
| Hai mixin trùng property | Cấu hình bị ghi đè khó nhận biết | Đổi tên trạng thái hoặc tách chức năng |
| Áp cùng mixin nhiều lần | Lifecycle và listener chạy lặp | Dùng `dedupingMixin` hoặc sửa chain |
| Đưa tag name vào mixin | Mixin bị gắn chặt với một element | Để element sở hữu tag name |
| Element Lit ghi đè `static styles` | Mất style của mixin | Giữ styles cũ trong mảng |
| Mutate object/array trong Lit | Không có update tự động | Gán tham chiếu mới |
| Đọc DOM ngay sau khi set Lit property | Đọc DOM của lần render cũ | Chờ `updateComplete` |
| Gán trạng thái vô điều kiện trong `updated()` | Update lặp vô hạn | Dùng điều kiện hoặc chuyển sang `willUpdate()` |
| Controller đổi trạng thái nhưng không `requestUpdate()` | Template không render lại | Gọi `host.requestUpdate()` |
| Controller tạo listener trong constructor | Listener tồn tại sai vòng đời | Dùng `hostConnected()` và `hostDisconnected()` |
| Chuyển mọi `notify` thành event | Giữ API cũ dù không còn consumer | Kiểm tra nơi sử dụng trước |

## 11. Chạy demo

Khởi động web server:

```bash
cd mixin/demo
python3 -m http.server 8000
```

Mở [`demo/index.html`](demo/index.html). Ba phần nằm trên cùng một trang và có
liên kết riêng để mở trực tiếp:

1. [`#javascript-mixin`](demo/index.html#javascript-mixin): bản chất của mixin,
   prototype chain và `super`.
2. [`#polymer-mixin`](demo/index.html#polymer-mixin): property, observer,
   event và lifecycle Polymer.
3. [`#lit-controller`](demo/index.html#lit-controller): Lit mixin,
   ReactiveController và thứ tự cập nhật.

### Cấu trúc file demo

```text
demo/
  index.html                         cấu trúc chung của trang
  styles.css                         giao diện chung
  main.js                            nút điều khiển và vùng log

  components/
    basic-panel.js                   custom element JavaScript thuần
    polymer-panel.js                 custom element Polymer
    lit-panel.js                     custom element Lit

  mixins/
    javascript-openable-mixin.js     mixin JavaScript thuần
    logging-mixin.js                 minh họa chuỗi gọi super
    polymer-openable-mixin.js        property và lifecycle Polymer
    lit-openable-mixin.js            reactive property và lifecycle Lit

  controllers/
    counter-controller.js            ReactiveController
```

Ba file `*-openable-mixin.js` đều export cùng tên `OpenableMixin`, đúng với
các đoạn code trong tài liệu. Tiền tố trong tên file chỉ dùng để phân biệt bản
JavaScript thuần, Polymer và Lit trên trang demo chung.

`main.js` chỉ nối các nút trên trang với component và hiển thị log. Property,
method, lifecycle và template cần trình bày nằm trong các thư mục
`mixins/`, `components/` và `controllers/`.

### Kiểm tra hành vi của demo

Các test chạy trực tiếp mã nguồn trong thư mục `demo/` với Lit 3.3.3,
Polymer 3.5.2 và một môi trường DOM. Test kiểm tra:

- prototype chain và thứ tự gọi `super` của JavaScript mixin;
- Polymer property effects, binding, observer, notify event, phản chiếu attribute,
  `ready()`, `connectedCallback()` và `disconnectedCallback()`;
- Lit reactive property, `updateComplete`, thứ tự hook của ReactiveController,
  `firstUpdated()` và hành vi khi controller gọi `requestUpdate()`.

Chạy test bằng hai lệnh:

```bash
cd mixin
npm install
npm test
```

### Muốn thử thay đổi thì sửa file nào?

| Muốn thay đổi | File cần mở |
|---|---|
| Thêm method hoặc trạng thái cho mixin JavaScript | `mixins/javascript-openable-mixin.js` |
| Thay đổi thứ tự gọi `super` | `mixins/logging-mixin.js` |
| Thêm Polymer property, observer hoặc lifecycle | `mixins/polymer-openable-mixin.js` |
| Sửa template Polymer | `components/polymer-panel.js` |
| Thêm Lit reactive property hoặc lifecycle | `mixins/lit-openable-mixin.js` |
| Sửa template Lit | `components/lit-panel.js` |
| Thêm trạng thái hoặc lifecycle cho controller | `controllers/counter-controller.js` |
| Thêm nút để gọi thử API | `main.js` và `index.html` |
| Đổi giao diện trang demo | `styles.css` |

## 12. Tài liệu tham khảo

JavaScript và Web Components:

- [MDN: Inheritance and the prototype chain](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Inheritance_and_the_prototype_chain)
- [MDN: `super`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/super)
- [MDN: Using custom elements](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements)

Polymer:

- [Custom element lifecycle và class mixin](https://polymer-library.polymer-project.org/3.0/docs/devguide/custom-elements)
- [Declare properties](https://polymer-library.polymer-project.org/3.0/docs/devguide/properties)
- [Data system và thứ tự property effects](https://polymer-library.polymer-project.org/3.0/docs/devguide/data-system)
- [Observers và computed properties](https://polymer-library.polymer-project.org/3.0/docs/devguide/observers)
- [DOM template](https://polymer-library.polymer-project.org/3.0/docs/devguide/dom-template)
- [Events](https://polymer-library.polymer-project.org/3.0/docs/devguide/events)
- [Shadow DOM styles](https://polymer-library.polymer-project.org/3.0/docs/devguide/style-shadow-dom)
- [Custom CSS properties và CSS mixins](https://polymer-library.polymer-project.org/3.0/docs/devguide/custom-css-properties)
- [Source `dedupingMixin`](https://github.com/Polymer/polymer/blob/master/lib/utils/mixin.js)

Lit:

- [Class mixins](https://lit.dev/docs/composition/mixins/)
- [Controllers và mixins](https://lit.dev/docs/composition/overview/)
- [ReactiveController](https://lit.dev/docs/composition/controllers/)
- [Reactive properties](https://lit.dev/docs/components/properties/)
- [Lifecycle và reactive update cycle](https://lit.dev/docs/components/lifecycle/)
- [Events](https://lit.dev/docs/components/events/)
- [Styles](https://lit.dev/docs/components/styles/)
- [Lit for Polymer users](https://lit.dev/articles/lit-for-polymer-users/)
- [`@lit/task`](https://lit.dev/docs/data/task/)
