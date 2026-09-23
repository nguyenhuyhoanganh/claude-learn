# Mixin trong JavaScript, Polymer và Lit

> Polymer hiện chỉ được duy trì để hỗ trợ các dự án cũ. Với component mới,
> nên sử dụng Lit hoặc Web Components chuẩn.

## Bắt đầu từ đâu

Mục tiêu của tài liệu: **tận dụng** mixin và ReactiveController, tức là viết
một lần phần property, state, event, style, lifecycle rồi để nhiều element
dùng lại, và biết element phải làm gì để không làm hỏng phần dùng lại đó.
Mỗi mục đều trả lời các câu hỏi:

- element dùng lại property/state có sẵn như thế nào;
- element đổi default, cấu hình hoặc ghi đè chúng ra sao;
- event, style và lifecycle của mixin/controller ảnh hưởng element thế nào.

Nếu chưa biết Lit, nên đọc theo thứ tự:

1. Mục 1–2: mixin trong JavaScript thuần.
2. [Kiến thức nền về Lit](#kiến-thức-nền-về-lit): custom element, "reactive",
   `ReactiveElement` và `LitElement`.
3. Mục 5: các bước Lit cập nhật một element.
4. Mục 7: ReactiveController.

Mục 3 (Polymer) và mục 9 (chuyển từ Polymer sang Lit) chỉ cần khi làm việc với
dự án Polymer cũ.

## Mục lục

1. [Khái niệm mixin](#1-khái-niệm-mixin)
2. [Chuỗi mixin, thứ tự gọi và `super`](#2-chuỗi-mixin-thứ-tự-gọi-và-super)
3. [Mixin trong Polymer](#3-mixin-trong-polymer)
4. [Mixin trong Lit](#4-mixin-trong-lit) (bắt đầu bằng
   [Kiến thức nền về Lit](#kiến-thức-nền-về-lit))
5. [Lifecycle và quá trình cập nhật của Lit](#5-lifecycle-và-quá-trình-cập-nhật-của-lit)
6. [Ánh xạ `ready()` từ Polymer sang Lit](#6-ánh-xạ-ready-từ-polymer-sang-lit)
7. [ReactiveController](#7-reactivecontroller)
8. [Tiêu chí chọn mixin, controller hoặc function](#8-tiêu-chí-chọn-mixin-controller-hoặc-function)
9. [Chuyển từ Polymer sang Lit](#9-chuyển-từ-polymer-sang-lit)
10. [Các lỗi thường gặp](#10-các-lỗi-thường-gặp)
11. [Chạy demo](#11-chạy-demo)
12. [Tài liệu tham khảo](#12-tài-liệu-tham-khảo)

## 1. Khái niệm mixin

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

Cấu trúc trên gồm:

- `SomeMixin`: function định nghĩa mixin;
- `BaseClass`: class đầu vào;
- giá trị trả về: class mới kế thừa `BaseClass`;
- API của class kết quả: toàn bộ API từ `BaseClass` cùng các thành phần do mixin
  bổ sung.

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

### Class được tạo sau khi áp dụng mixin

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

### Hợp đồng của mixin

Tài liệu của mixin cần xác định:

- property và method được thêm;
- API bắt buộc trên class đầu vào;
- lifecycle bị override;
- listener, timer, observer hoặc subscription được tạo;
- vị trí giải phóng tài nguyên;
- các event được phát.

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

### Thứ tự áp dụng trong một chain

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

### Quy tắc ưu tiên method

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

Mục tiêu của mục này: tận dụng property, observer, event và lifecycle mà mixin
Polymer đã khai báo, không phải viết lại trong từng element.

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

### Mixin cấu hình những gì cho property

Mỗi option trong `properties` của mixin tạo ra một hành vi mà **mọi element**
dùng mixin đều nhận được:

| Option trong mixin | Element dùng mixin nhận được |
|---|---|
| `type` | Attribute `opened` trên thẻ được chuyển thành Boolean |
| `value` | Giá trị mặc định khi element khởi tạo |
| `reflectToAttribute` | Attribute `opened` xuất hiện/mất đi theo property, dùng được trong CSS |
| `notify` | Event `opened-changed` mỗi khi property đổi |
| `readOnly` | Chỉ mixin (qua setter nội bộ `_setOpened`) được đổi giá trị |
| `computed` | Property tính sẵn (`label`) để element dùng trong template |
| `observer` | Method của mixin chạy mỗi khi property đổi, dù ai là người đổi |

Điểm quan trọng: element **không cần biết** các hành vi này tồn tại. Element chỉ
gán `this.opened = true`; reflect, notify, observer của mixin tự chạy.

### Element dùng lại và thay đổi property của mixin

**Đọc và gán như property của chính element.** Template dùng `[[opened]]`,
method của element gán `this.opened = ...`. Mọi effect mixin đã cấu hình đều
chạy.

**Đổi giá trị mặc định.** Element khai báo lại property, chỉ ghi option cần đổi:

```js
class ExpandedPanel extends OpenableMixin(PolymerElement) {
  static get properties() {
    return {
      opened: {value: true},   // chỉ đổi default
    };
  }
}
```

Polymer gộp property effect qua cả class chain, nên `reflectToAttribute`,
`notify` và `observer` của mixin **vẫn giữ nguyên**. Test đã kiểm tra:
`ExpandedPanel` khởi tạo với `opened = true`, attribute `opened` có mặt và
event `opened-changed` vẫn được phát.

**Theo dõi property của mixin từ element.** Element có thể thêm observer riêng
mà không đụng vào mixin:

```js
class PolymerPanel extends OpenableMixin(PolymerElement) {
  static get observers() {
    return ['trackOpened_(opened)'];
  }

  trackOpened_(opened) {
    // Logic riêng của element; observer của mixin vẫn chạy.
  }
}
```

**Ghi đè observer của mixin.** Nếu element định nghĩa method trùng tên
`openedChanged_`, method của element thay thế method của mixin (quy tắc
prototype chain ở mục 2). Muốn giữ logic của mixin, phải gọi `super`:

```js
openedChanged_(opened, oldOpened) {
  super.openedChanged_(opened, oldOpened);
  this.updateAria_(opened);
}
```

### Khi element đổi property của mixin: effect chạy theo thứ tự nào

Khi element (hoặc bên ngoài) gán `this.opened = true`, Polymer chạy các effect
mà mixin và element đã khai báo, theo thứ tự:

```text
this.opened = true
      │
      ▼
1. Computed      label của mixin được tính lại
      │
      ▼
2. Binding       template của element cập nhật [[opened]], [[label]]
      │
      ▼
3. Reflect       attribute opened (do mixin bật reflectToAttribute)
      │
      ▼
4. Observer      openedChanged_ của mixin, observer riêng của element
      │
      ▼
5. Notify        event opened-changed (do mixin bật notify)
```

Hệ quả thực tế:

- Trong observer của mixin, template của element **đã** cập nhật và attribute
  đã được phản chiếu (test kiểm tra `label`, attribute và nội dung shadow DOM
  ngay trong observer).
- Listener của `opened-changed` chạy **sau** observer.
- Các bước chạy đồng bộ. Nếu mixin có observer phụ thuộc hai property
  (`observers: ['sync_(opened, disabled)']`) và element gán lần lượt hai
  property, observer chạy hai lần. Element nên gán cùng lúc:

```js
this.setProperties({opened: true, disabled: false});
```

### Object và array do mixin sở hữu

Giả sử mixin quản lý danh sách và theo dõi thay đổi của nó:

```js
export const ListMixin = (BaseClass) => class extends BaseClass {
  static get properties() {
    return {
      items: {type: Array, value: () => []},   // mỗi instance một mảng mới
    };
  }

  static get observers() {
    return ['itemsChanged_(items.splices)'];
  }

  itemsChanged_(splices) {
    // Mixin cập nhật số lượng, đồng bộ trạng thái…
  }
};
```

Hai điểm element cần tuân thủ:

1. `value` của object/array trong mixin **phải** là function. Nếu viết
   `value: []`, mọi element dùng mixin dùng chung một mảng.
2. Element phải sửa mảng qua API của Polymer thì observer của mixin mới chạy:

```js
this.push('items', item);        // observer items.splices của mixin chạy
this.items.push(item);           // mảng đổi nhưng mixin KHÔNG biết
```

Tương tự với object: `this.set('user.name', 'An')` thay vì
`this.user.name = 'An'`. Cách tốt hơn là mixin cung cấp sẵn method như
`addItem(item)` để element không cần biết mixin đang theo dõi path nào.

### Event do mixin phát

Mixin có thể phát hai loại event, element và bên ngoài dùng khác nhau.

**Event từ `notify: true`.** Mixin không cần viết dòng `dispatchEvent` nào.
Bên ngoài nghe được mọi thay đổi của `opened`:

```js
panel.addEventListener('opened-changed', (event) => {
  console.log(event.detail.value);
});
```

Element cha dùng two-way binding `{{...}}` cũng dựa vào event này:

```html
<polymer-panel opened="{{panelOpened}}"></polymer-panel>
```

Lưu ý: giá trị mặc định cũng đi qua property effects, nên listener gắn trước
khi element khởi tạo nhận thêm một event cho giá trị mặc định. Event này
**không** bubble.

**Event nghiệp vụ do mixin tự phát.** Ví dụ mixin muốn báo "người dùng vừa mở
panel", khác với "property đổi":

```js
toggle() {
  this.opened = !this.opened;
  this.dispatchEvent(new CustomEvent('panel-toggled', {
    detail: {opened: this.opened},
    bubbles: true,
    composed: true,
  }));
}
```

Event này nằm trong `toggle()` của mixin. Nếu element ghi đè `toggle()` mà
**không** gọi `super.toggle()`, event biến mất. Đây là lý do mixin nên ghi rõ
event nào thuộc hợp đồng (mục 1) và method nào element phải gọi `super`.

Event handler trong template của element có thể gọi thẳng method của mixin:

```html
<button on-click="toggle">Toggle</button>
```

### Lifecycle của mixin ảnh hưởng element thế nào

Lifecycle Polymer:

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

Khi cả mixin và element cùng override một callback, chúng tạo thành chuỗi
`super` (mục 2). Thứ tự chạy khi element override `ready()`:

```js
// Element
ready() {
  console.log('element: trước super');
  super.ready();
  console.log('element: sau super');
}
```

```text
element: trước super
  → super.ready() của mixin
      → super.ready() của PolymerElement
          tạo shadow DOM từ template, chạy effect cho giá trị ban đầu
          (observer của mixin chạy lần đầu ở đây)
      → phần còn lại trong ready() của mixin
element: sau super
```

Hệ quả:

- Code element đặt **trước** `super.ready()` chưa có shadow DOM, `this.$`
  chưa có, observer của mixin chưa chạy. Vì vậy Polymer yêu cầu gọi `super`
  ở dòng đầu.
- Nếu element **quên** `super.ready()`: `ready()` của mixin không chạy,
  template không được tạo, `shadowRoot` là `null` (test đã kiểm tra).
- Mixin đăng ký listener trong `connectedCallback()` thì **mọi** element dùng
  mixin đều có listener đó. Mixin phải tự gỡ trong `disconnectedCallback()`;
  element không thể biết để gỡ thay.
- Không đặt listener của mixin trong `ready()`: `ready()` chỉ chạy một lần,
  trong khi element có thể bị gỡ ra và gắn lại nhiều lần.

```js
// Trong mixin
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

Mục tiêu của mục này: tận dụng reactive property, style, event và lifecycle
mà mixin Lit đã khai báo. Cách tận dụng cùng các nhu cầu đó bằng
ReactiveController nằm ở
[Element tận dụng controller như thế nào](#element-tận-dụng-controller-như-thế-nào).

Nếu chưa từng dùng Lit, đọc phần [Kiến thức nền về Lit](#kiến-thức-nền-về-lit)
trước. Các phần sau dùng lại những khái niệm trong đó.

### Kiến thức nền về Lit

#### Custom element là gì

Trình duyệt cho phép tự tạo thẻ HTML mới bằng cách viết một class
`extends HTMLElement` rồi đăng ký tên thẻ:

```js
class HelloBox extends HTMLElement {
  connectedCallback() {
    this.textContent = 'Xin chào';
  }
}

customElements.define('hello-box', HelloBox);
```

Sau đó có thể viết `<hello-box></hello-box>` trong HTML. Đây là Web API chuẩn,
không cần thư viện nào.

Vấn đề: khi dữ liệu thay đổi, phải **tự tay** cập nhật DOM.

```js
class CounterBox extends HTMLElement {
  count = 0;

  increment() {
    this.count += 1;
    this.textContent = `count = ${this.count}`;   // tự cập nhật DOM
  }
}
```

Nếu có nhiều dữ liệu và nhiều chỗ hiển thị, việc nhớ cập nhật đúng chỗ, đúng
lúc trở nên khó.

#### "Reactive" nghĩa là gì

**Reactive** nghĩa là: đổi dữ liệu thì giao diện **tự** cập nhật theo.
Chỉ cần viết:

```js
this.count += 1;
```

và thư viện tự biết phải vẽ lại phần hiển thị `count`. Lit làm điều này cho
custom element.

#### Ba lớp: `HTMLElement` → `ReactiveElement` → `LitElement`

Khi viết `class MyEl extends LitElement`, element kế thừa qua ba lớp:

```text
HTMLElement          (trình duyệt)   thẻ HTML tự định nghĩa, lifecycle chuẩn
    ▲
ReactiveElement      (Lit)           reactive property, update cycle, controller
    ▲
LitElement           (Lit)           render() + template html`...`
    ▲
MyEl                 (code của bạn)
```

| Lớp | Cung cấp | Package |
|---|---|---|
| `HTMLElement` | Là một thẻ HTML; `connectedCallback()`, `disconnectedCallback()`, attribute | Có sẵn trong trình duyệt |
| `ReactiveElement` | Reactive property (`static properties`), `requestUpdate()`, update cycle (`willUpdate`, `update`, `updated`…), `updateComplete`, `static styles`, `addController()` | `@lit/reactive-element` |
| `LitElement` | Method `render()` trả về template `` html`...` ``; mỗi lần update, Lit so sánh và chỉ sửa phần DOM thay đổi | `lit` |

Nói ngắn gọn:

- **`ReactiveElement`** lo phần "khi nào cần cập nhật": theo dõi property, gom
  các thay đổi, gọi các hook theo đúng thứ tự.
- **`LitElement`** lo phần "cập nhật DOM như thế nào": gọi `render()` và vẽ
  template vào shadow root.

Trong thực tế hầu như luôn dùng `LitElement`. `ReactiveElement` quan trọng vì
**mọi** tính năng reactive (kể cả ReactiveController ở mục 7) nằm ở lớp này.

#### Element Lit tối thiểu

```js
import {LitElement, html} from 'lit';

class CounterBox extends LitElement {
  // 1. Khai báo reactive property.
  static properties = {
    count: {type: Number},
  };

  constructor() {
    super();
    this.count = 0;              // 2. Giá trị mặc định.
  }

  // 3. Mô tả giao diện theo dữ liệu hiện tại.
  render() {
    return html`
      <button @click=${() => this.count++}>
        count = ${this.count}
      </button>
    `;
  }
}

customElements.define('counter-box', CounterBox);
```

Điều xảy ra khi bấm nút:

```text
this.count++                     gán vào reactive property
   → setter do Lit tạo nhận ra giá trị đổi
   → requestUpdate()             lên lịch cập nhật (chưa vẽ ngay)
   → (chờ microtask)             gom các thay đổi khác nếu có
   → render()                    tạo template mới
   → Lit chỉ sửa text "count = …" trong DOM
```

Không có dòng nào tự sửa DOM. Chỉ đổi dữ liệu, Lit lo phần còn lại.

#### Tóm tắt: `ReactiveElement` là gì

`ReactiveElement` là lớp nền của Lit, nằm giữa `HTMLElement` và `LitElement`.
Nó lo phần **khi nào** element cần cập nhật:

- `static properties`: khai báo reactive property;
- `requestUpdate()`: yêu cầu một lần cập nhật;
- các bước cập nhật `shouldUpdate` → `willUpdate` → `update` →
  `firstUpdated` → `updated` (chi tiết ở mục 5);
- `updateComplete`: Promise báo lần cập nhật đã xong;
- `addController()` / `removeController()`: gắn controller.

`LitElement` thêm phần **như thế nào**: trong `update()`, nó gọi `render()` rồi
dùng lit-html vẽ template vào `renderRoot`, chỉ sửa phần DOM thay đổi (theo
source `lit-element` 4.x trong Lit 3.3.3).

Khi code, gần như luôn `extends LitElement`. Nhưng mọi tính năng reactive,
kể cả controller, đều đến từ `ReactiveElement`.

#### Polymer có `ReactiveElement` không

**Không.** `ReactiveElement` là lớp riêng của Lit. Polymer có hệ thống reactive
riêng, và bản thân `PolymerElement` được **ghép từ nhiều mixin**. Chuỗi kế
thừa thật (in từ Polymer 3.5.2 và Lit 3.3.3, có test kiểm tra):

```text
Polymer:
PolymerElement → PropertiesMixin → PropertyEffects → TemplateStamp
               → PropertyAccessors → PropertiesChanged → HTMLElement

Lit:
LitElement → ReactiveElement → HTMLElement
```

Trong source Polymer: `PolymerElement = ElementMixin(HTMLElement)`, và
`ElementMixin` áp dụng `PropertiesMixin(PropertyEffects(base))`; tiếp tục như
vậy xuống dưới.

Phần làm việc tương đương `ReactiveElement` nằm ở đâu:

| Việc | Lit | Polymer |
|---|---|---|
| Tạo getter/setter cho property | `ReactiveElement` | `PropertyAccessors` |
| Gom thay đổi, báo property nào đổi | `ReactiveElement` (`requestUpdate`, `changedProperties`) | `PropertiesChanged` (`_propertiesChanged`) |
| Đọc khai báo property | `ReactiveElement` (`static properties`) | `PropertiesMixin` (`static get properties()`) |
| Computed, observer, binding, reflect, notify | Không có; dùng `willUpdate`/`updated` | `PropertyEffects` |
| Tạo DOM từ template | `LitElement` + lit-html | `TemplateStamp` + `ElementMixin` |
| Gắn ReactiveController | `addController()` | **Không có** |

Khác biệt quan trọng khi tận dụng:

- **Thời điểm:** Polymer chạy property effect **đồng bộ** ngay tại dòng gán.
  Lit gom thay đổi và cập nhật trong microtask, nên cần `updateComplete` để
  đọc DOM mới.
- **Công cụ tái sử dụng:** Polymer chỉ có mixin (và Behavior kiểu cũ).
  `PolymerElement.prototype` không có `addController()` hay `requestUpdate()`,
  nên ReactiveController của Lit **không dùng trực tiếp** được.

#### Dùng ReactiveController trong Polymer

Tài liệu Lit cho phép host là base class của thư viện khác, miễn là có đủ bốn
API: `addController()`, `removeController()`, `requestUpdate()`,
`updateComplete`. Vì vậy có thể **viết một mixin** bổ sung bốn API này cho
`PolymerElement`. Đây là cách tự làm, không phải tính năng có sẵn của Polymer.

Mixin trong demo: `demo/mixins/polymer-controller-host-mixin.js`.

```js
export const ControllerHostMixin = dedupingMixin((BaseClass) =>
  class extends BaseClass {
    static get properties() {
      return {_hostRevision: {type: Number, value: 0}};
    }

    constructor() {
      super();
      this.__controllers = new Set();
      this.__updatePromise = Promise.resolve(true);
    }

    addController(controller) {
      this.__controllers.add(controller);
      if (this.__hostConnected) controller.hostConnected?.();
    }

    removeController(controller) {
      this.__controllers.delete(controller);
    }

    connectedCallback() {
      super.connectedCallback();          // ready() lần đầu chạy ở đây
      this.__hostConnected = true;
      this.__controllers.forEach((c) => c.hostConnected?.());
    }

    disconnectedCallback() {
      super.disconnectedCallback();
      this.__hostConnected = false;
      this.__controllers.forEach((c) => c.hostDisconnected?.());
    }

    requestUpdate() {
      if (this.__updatePending) return;
      this.__updatePending = true;
      this.__updatePromise = Promise.resolve().then(() => {
        this.__updatePending = false;
        this.__controllers.forEach((c) => c.hostUpdate?.());
        this._hostRevision += 1;          // binding chạy lại, đồng bộ
        this.__controllers.forEach((c) => c.hostUpdated?.());
        return true;
      });
    }

    get updateComplete() {
      return this.__updatePromise;
    }
  });
```

Polymer không có `render()`: binding chỉ chạy lại khi **property** đổi, còn
state của controller không phải property. Mixin giải quyết bằng cách tăng
`_hostRevision` mỗi lần update. Binding nào đọc state của controller phải phụ
thuộc property này:

```js
class PolymerClock extends ControllerHostMixin(PolymerElement) {
  static get template() {
    return html`<p>[[formatTime_(_hostRevision)]]</p>`;
  }

  constructor() {
    super();
    this.clock = new ClockController(this, 1000);   // controller viết cho Lit
  }

  formatTime_() {
    return this.clock.value.toLocaleTimeString('vi-VN');
  }
}
```

`test/polymer-controller-host.test.js` kiểm tra:

- `hostConnected()` chạy khi template đã được tạo (`shadowRoot` đã có);
- nhiều `requestUpdate()` trong cùng tick được gom thành một lần
  `hostUpdate()`/`hostUpdated()`, và DOM chưa đổi trước khi `updateComplete`
  hoàn tất;
- `hostDisconnected()` chạy khi gỡ element, `ClockController` dọn timer;
- `addController()` khi host đã connected gọi `hostConnected()` ngay.

Giới hạn so với Lit: `changedProperties` của Polymer không biết state của
controller; và `hostUpdate()` không chạy "trước render" theo nghĩa của Lit, vì
binding của Polymer có thể chạy bất cứ lúc nào một property đổi. Với dự án
Polymer mới cần nhiều controller, nên cân nhắc chuyển component sang Lit
(mục 9).

#### Từ `ReactiveElement` đến ReactiveController

- Controller là một **object bình thường**, không phải element. Nó gọi
  `host.addController(this)`, trong đó **host** là element sở hữu nó.
- Từ đó, khi host được gắn vào trang, cập nhật hoặc bị gỡ khỏi trang,
  `ReactiveElement` gọi `hostConnected()`, `hostUpdate()`, `hostUpdated()`,
  `hostDisconnected()` của controller.
- Dữ liệu trong controller **không** phải reactive property, nên controller
  phải tự gọi `host.requestUpdate()` khi dữ liệu đổi.

Chi tiết ở [mục 7](#7-reactivecontroller).

#### Các thuật ngữ sẽ gặp

| Thuật ngữ | Nghĩa |
|---|---|
| Reactive property | Property khai báo trong `static properties`; gán giá trị mới sẽ tự kích hoạt cập nhật |
| Update / update cycle | Một lượt Lit tính lại và vẽ lại element sau khi có thay đổi |
| `render()` | Method trả về template mô tả giao diện; Lit gọi trong mỗi lần update |
| `` html`...` `` | Template của Lit; `${...}` là chỗ chèn dữ liệu |
| `requestUpdate()` | Tự yêu cầu một lần update, dùng khi dữ liệu đổi nhưng không phải reactive property |
| `updateComplete` | Promise hoàn tất khi lần update hiện tại vẽ xong DOM |
| Lifecycle | Các method Lit/trình duyệt tự gọi ở từng giai đoạn: gắn vào trang, cập nhật, gỡ khỏi trang |
| Shadow root / `renderRoot` | Vùng DOM riêng của element, nơi `render()` vẽ vào; CSS bên trong không lọt ra ngoài |
| Host | Element "chủ" đang sở hữu một controller (dùng ở mục 7) |

### Cấu trúc mixin trong Lit

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

### Mixin cấu hình những gì cho property

Option của `static properties` trong mixin quyết định element dùng mixin nhận
được gì:

| Option trong mixin | Element dùng mixin nhận được |
|---|---|
| `type: Boolean` | Attribute `opened` trên thẻ được chuyển thành `true`/`false` |
| `reflect: true` | Attribute `opened` xuất hiện/mất đi theo property, dùng được trong CSS |
| `attribute` | Tên attribute (hoặc `false` để không dùng attribute) |
| `hasChanged` | Quy tắc quyết định giá trị mới có gây update hay không |
| Gán trong constructor của mixin | Giá trị mặc định |

Lit gộp `static properties` qua class chain. Element dùng mixin không cần khai
báo lại `opened`; gán `this.opened = true` ở bất kỳ đâu trong element đều tạo
update, phản chiếu attribute theo cấu hình của mixin.

### Element dùng lại và thay đổi property của mixin

**Đổi giá trị mặc định: gán trong constructor, sau `super()`.**

```js
class ExpandedPanel extends OpenableMixin(LitElement) {
  constructor() {
    super();              // mixin gán opened = false
    this.opened = true;   // element ghi đè default
  }
}
```

Cả hai lần gán xảy ra trước lần render đầu nên Lit chỉ render một lần với
`opened = true`.

**Không dùng class field để đổi default.**

```js
class WrongPanel extends OpenableMixin(LitElement) {
  opened = true;   // SAI
}
```

Class field tạo một property riêng trên instance, **che mất** accessor mà Lit
tạo cho `opened`. Sau đó `this.opened = false` không còn gây update: test đã
kiểm tra template vẫn hiển thị `true`. Lit ở chế độ development cũng cảnh báo
lỗi này.

**Khai báo lại property: option mới thay thế toàn bộ option của mixin.**

```js
class ExpandedPanel extends OpenableMixin(LitElement) {
  static properties = {
    opened: {attribute: 'expanded'},   // SAI: mất type: Boolean và reflect
  };
}
```

Khác Polymer, Lit **không** gộp từng option. Khai báo trên làm `opened` mất
`type: Boolean`: đặt attribute `expanded` cho ra chuỗi `""` thay vì `true`
(test đã kiểm tra). Nếu cần đổi option, khai báo lại đầy đủ:

```js
static properties = {
  opened: {type: Boolean, reflect: true, attribute: 'expanded'},
};
```

Cách an toàn hơn là mixin export option để element dùng lại:

```js
export const openedProperty = {type: Boolean, reflect: true};

// Trong element
static properties = {
  opened: {...openedProperty, attribute: 'expanded'},
};
```

Việc khai báo lại chỉ ảnh hưởng property đó. Các property khác của mixin vẫn
giữ nguyên.

**Phản ứng khi property của mixin đổi.** Element không cần observer: kiểm tra
`changedProperties` trong `willUpdate()` hoặc `updated()` của element.

```js
updated(changedProperties) {
  super.updated(changedProperties);   // giữ logic updated() của mixin
  if (changedProperties.has('opened')) {
    this.renderRoot.querySelector('.content')?.scrollIntoView();
  }
}
```

`changedProperties` chứa **mọi** property đổi trong lần update, cả của mixin
lẫn của element. Mixin cũng nhìn thấy property của element, nên mixin chỉ nên
kiểm tra những key mà nó sở hữu.

### Object và array do mixin sở hữu

```js
export const ListMixin = (BaseClass) => class extends BaseClass {
  static properties = {
    items: {type: Array},
  };

  constructor() {
    super();
    this.items = [];   // mỗi instance một mảng mới
  }

  addItem(item) {
    this.items = [...this.items, item];   // tham chiếu mới → update
  }

  removeItem(index) {
    this.items = this.items.filter((_, i) => i !== index);
  }
};
```

Hai điểm element cần tuân thủ:

1. Default là object/array phải tạo mới trong constructor của mixin. Nếu dùng
   một hằng số chung (`const EMPTY = []; this.items = EMPTY;`) rồi mutate, mọi
   instance cùng đổi.
2. Lit so sánh bằng tham chiếu. Element mutate trực tiếp thì **không** có
   update, và `willUpdate()`/`updated()` của mixin cũng không chạy:

```js
this.items.push(item);          // mảng đổi, nhưng không có update
this.addItem(item);             // dùng method của mixin → có update
this.items = [...this.items, item];   // hoặc tự gán tham chiếu mới
```

Nếu buộc phải mutate, gọi `this.requestUpdate('items')` sau đó. Khi đó
`changedProperties.get('items')` là `undefined` (test đã kiểm tra), nên
`updated()` của mixin không biết giá trị cũ để so sánh.

### Style do mixin cung cấp

Mixin cung cấp `static styles` để mọi element dùng mixin có cùng giao diện cho
trạng thái của mixin:

```js
const openableStyles = css`
  :host([opened]) {
    border-color: currentColor;
  }
`;

export const StyledOpenableMixin = (BaseClass) => class extends BaseClass {
  static styles = [BaseClass.styles ?? [], openableStyles];
};
```

`:host([opened])` dùng được vì mixin bật `reflect: true` cho `opened`. Style và
property phụ thuộc nhau: nếu element khai báo lại `opened` mà bỏ `reflect`,
style này không còn tác dụng.

Khi element tự khai báo `static styles`, style của mixin **bị thay thế** (test
kiểm tra số style còn lại). Phải đưa style của lớp cha vào mảng:

```js
const PanelBase = StyledOpenableMixin(LitElement);

class LitPanel extends PanelBase {
  static styles = [
    PanelBase.styles,                 // giữ style của mixin
    css`:host { display: block; }`,   // style riêng của element
  ];
}
```

Style đứng sau trong mảng thắng khi cùng độ ưu tiên, nên element ghi đè được
style của mixin. Nếu mixin muốn cho phép tùy biến mà không cần ghi đè, dùng CSS
custom property:

```css
:host([opened]) {
  border-color: var(--openable-border-color, currentColor);
}
```

### Event do mixin phát

Lit không có `notify: true`. Mixin phải tự phát event, và **vị trí** phát
quyết định khi nào element nhận được.

**Phát trong method của mixin**: chỉ khi method đó được gọi.

```js
toggle() {
  this.opened = !this.opened;
  this.dispatchEvent(new CustomEvent('opened-changed', {
    detail: {value: this.opened},
    bubbles: true,
    composed: true,
  }));
}
```

- Element gán `this.opened = true` trực tiếp thì **không** có event.
- Element ghi đè `toggle()` mà không gọi `super.toggle()` thì event biến mất
  (test đã kiểm tra: 0 event).

**Phát trong `updated()` của mixin**: mọi thay đổi của `opened`, dù ai gán.

```js
updated(changedProperties) {
  super.updated?.(changedProperties);
  if (changedProperties.has('opened') &&
      changedProperties.get('opened') !== undefined) {
    this.dispatchEvent(new CustomEvent('opened-changed', {
      detail: {value: this.opened},
    }));
  }
}
```

- Kiểm tra giá trị cũ khác `undefined` để bỏ qua lần gán default.
- Event phát sau khi DOM đã cập nhật, listener đọc được DOM mới.
- Element ghi đè `updated()` mà quên `super.updated()` thì event biến mất.

Chọn cách nào là quyết định về API: event chỉ báo thao tác người dùng thì phát
trong method, event báo mọi thay đổi trạng thái thì phát trong `updated()`.
Cả hai cách đều yêu cầu element gọi `super` khi override.

### Lifecycle của mixin ảnh hưởng element thế nào

Mixin và element cùng override một hook tạo thành chuỗi `super`. Vị trí gọi
`super` trong element quyết định code của ai chạy trước:

```js
// Mixin
updated(changedProperties) {
  super.updated?.(changedProperties);
  console.log('mixin.updated');
}

// Element
updated(changedProperties) {
  super.updated(changedProperties);   // mixin chạy trước
  console.log('element.updated');
}
```

Những ảnh hưởng cần biết:

| Mixin làm gì | Ảnh hưởng tới element |
|---|---|
| Override `connectedCallback()` / `disconnectedCallback()` | Chạy cho **mọi** element dùng mixin; element quên `super` thì Lit không tạo `renderRoot` và không bắt đầu update |
| Override `willUpdate()` để tính property phụ | Element đọc được giá trị đã tính trong `render()` |
| Override `updated()` để phát event hoặc đo DOM | Element quên `super.updated()` thì logic này mất (test đã kiểm tra) |
| Gán property trong `updated()` | Tạo thêm một lần update cho element; `updateComplete` trả về `false` |
| Override `firstUpdated()` | Chỉ chạy một lần, không chạy lại khi element được gắn lại |
| Override `shouldUpdate()` trả về `false` | Element **không** render, dù property của element đổi |

Quy tắc cho cả hai phía:

- Mixin: luôn gọi `super.<hook>?.(...)` (dùng `?.` vì lớp dưới có thể không
  định nghĩa hook đó).
- Element: override hook nào cũng gọi `super` tương ứng.
- Mixin nên ghi rõ trong hợp đồng (mục 1) những hook nó override để element
  biết cần giữ `super` ở đâu.

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

### Thứ tự cập nhật giao diện của Lit

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

### Tiêu chí chọn lifecycle hook

| Hook | Trạng thái DOM | Dùng cho |
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

Cách mixin và element cùng override hook, và ảnh hưởng của từng hook do mixin
override, xem
[Lifecycle của mixin ảnh hưởng element thế nào](#lifecycle-của-mixin-ảnh-hưởng-element-thế-nào-1)
ở mục 4.

## 6. Ánh xạ `ready()` từ Polymer sang Lit

Lit không có `ready()` và không tồn tại một hook thay thế tương ứng cho mọi
trường hợp. Vị trí thay thế phụ thuộc vào công việc bên trong `ready()`.

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

### Vấn đề controller giải quyết

Giả sử nhiều element cần hiển thị đồng hồ. Nếu viết thẳng trong element, mỗi
element phải lặp lại cùng một đoạn:

```js
class MyClock extends LitElement {
  connectedCallback() {
    super.connectedCallback();
    this.timer = setInterval(() => {
      this.now = new Date();
      this.requestUpdate();
    }, 1000);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearInterval(this.timer);
  }
}
```

Đoạn code này có trạng thái riêng (`timer`, `now`) và cần lifecycle
(connect/disconnect). Function thường không làm được vì không nhận được
lifecycle. Mixin làm được, nhưng mỗi element chỉ có một bản, và property của
mixin bị trộn vào element.

ReactiveController tách đoạn đó ra thành **một object riêng**:

```js
class ClockController {
  constructor(host) {
    this.host = host;              // element chủ
    this.now = new Date();
    host.addController(this);      // đăng ký để nhận lifecycle
  }

  hostConnected() {                // element gắn vào trang
    this.timer = setInterval(() => {
      this.now = new Date();
      this.host.requestUpdate();   // báo element vẽ lại
    }, 1000);
  }

  hostDisconnected() {             // element bị gỡ khỏi trang
    clearInterval(this.timer);
  }
}

class MyClock extends LitElement {
  clock = new ClockController(this);

  render() {
    return html`${this.clock.now.toLocaleTimeString()}`;
  }
}
```

Ba ý cần nhớ:

1. Controller là một **object bình thường**, không phải element, không kế thừa
   gì.
2. `host.addController(this)` là bước nối controller vào element. Từ đó, mỗi
   khi element connect, update, disconnect, Lit gọi method tương ứng của
   controller (`hostConnected`, `hostUpdate`, `hostUpdated`,
   `hostDisconnected`).
3. Dữ liệu trong controller **không** phải reactive property, nên controller
   phải tự gọi `host.requestUpdate()` khi dữ liệu đổi.

`addController()` và `requestUpdate()` đều là method của `ReactiveElement`
(xem [Kiến thức nền về Lit](#kiến-thức-nền-về-lit)), nên mọi `LitElement` đều
dùng được controller.

### Khái niệm ReactiveController

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

`LitElement` và `ReactiveElement` đều là host. Tài liệu Lit cũng cho phép host
là object khác, ví dụ base class của thư viện web component khác, component
của framework khác hoặc một controller khác, miễn là cung cấp đủ bốn API trên.

Chi tiết từ source `ReactiveElement` (Lit 3.3.3):

| API | Hành vi |
|---|---|
| `addController(c)` | Thêm `c` vào một `Set`. Nếu host **đã connected**, gọi `c.hostConnected()` ngay trong lệnh này |
| `removeController(c)` | Chỉ xóa `c` khỏi `Set`; **không** gọi `c.hostDisconnected()` |
| `requestUpdate()` | Lên lịch update bất đồng bộ; gọi trong `hostUpdate()` thì được gom vào lần update đang chạy |
| `updateComplete` | Promise hoàn tất khi host update xong |

Controller thường được tạo trong constructor hoặc class field của host. Lúc đó
host chưa connected, nên `hostConnected()` sẽ chạy khi host được gắn vào
document. Nếu tạo controller sau khi host đã connected, `addController()` tự gọi
`hostConnected()` để controller không bỏ lỡ callback.

### Lifecycle của controller

| Callback | Thời điểm |
|---|---|
| `hostConnected()` | Host được gắn vào document |
| `hostUpdate()` | Trước khi host render và cập nhật DOM |
| `hostUpdated()` | Sau khi DOM của host đã cập nhật |
| `hostDisconnected()` | Host bị tháo khỏi document |

Các callback đều không bắt buộc. Controller chỉ cần khai báo callback phù hợp
với chức năng của nó.

Chi tiết theo tài liệu Lit:

- `hostConnected()` chạy sau khi host tạo `renderRoot`, nên shadow root đã
  tồn tại. Phù hợp để đăng ký listener, observer, timer.
- `hostUpdate()` chạy trước `update()` và `render()` của host. Phù hợp để đọc
  DOM trước khi DOM đổi (ví dụ animation) hoặc chuẩn bị dữ liệu cho render.
- `hostUpdated()` chạy sau khi DOM cập nhật, trước `updated()` của host. Phù
  hợp để đọc DOM sau khi đổi.
- `hostDisconnected()` dọn những gì đã tạo trong `hostConnected()`.

Trong một lần cập nhật, `hostUpdate()` chạy sau `willUpdate()` và trước
`host.update()`/`render()`. `hostUpdated()` chạy sau khi DOM được cập nhật và
trước `firstUpdated()`/`updated()` của host. Nếu `shouldUpdate()` trả về
`false`, cả hai callback này đều không chạy.

```text
Host bắt đầu cập nhật
        │
        ▼
host.shouldUpdate()                   [false → dừng, controller không được gọi]
        │
        ▼
host.willUpdate()
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

Ví dụ chuẩn trong tài liệu Lit là `ClockController`: tạo timer trong
`hostConnected()`, xóa timer trong `hostDisconnected()`, và gọi
`requestUpdate()` mỗi lần có giá trị mới:

```js
export class ClockController {
  constructor(host, timeout = 1000) {
    this.host = host;
    this.timeout = timeout;
    this.value = new Date();
    host.addController(this);
  }

  hostConnected() {
    this.timerId = setInterval(() => {
      this.value = new Date();
      this.host.requestUpdate();
    }, this.timeout);
  }

  hostDisconnected() {
    clearInterval(this.timerId);
    this.timerId = undefined;
  }
}
```

Nếu `hostConnected()` tạo tài nguyên mà `hostDisconnected()` không dọn, element
bị gỡ vẫn tiếp tục chạy timer và bị giữ trong bộ nhớ. Element có thể được gắn
lại nhiều lần, nên hai callback này phải chạy được lặp lại.

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

### Ghép controller từ controller khác

Controller có thể được xây dựng từ controller khác bằng cách chuyển tiếp
`host` cho controller con. Controller cha không cần tự gọi `addController()`
nếu nó không có lifecycle riêng; các controller con tự đăng ký với host.

```js
export class DualClockController {
  constructor(host, fastTimeout, slowTimeout) {
    this.fast = new ClockController(host, fastTimeout);
    this.slow = new ClockController(host, slowTimeout);
  }

  get fastTime() {
    return this.fast.value;
  }

  get slowTime() {
    return this.slow.value;
  }
}
```

Host chỉ thấy một API (`fastTime`, `slowTime`), còn lifecycle của từng timer
vẫn do `ClockController` quản lý.

### Gắn và gỡ controller lúc runtime

Controller không bắt buộc phải là field của host: bất kỳ object nào được
truyền vào `addController()` đều là controller. Có thể gắn hoặc gỡ controller
khi host đang chạy:

```js
attach() {
  // Host đang connected → hostConnected() chạy ngay trong lệnh này.
  this.host.addController(this);
}

detach() {
  // removeController() không gọi hostDisconnected().
  this.host.removeController(this);
  this.cleanup();
}
```

Vì `removeController()` không gọi `hostDisconnected()`, controller bị gỡ khi
host vẫn connected phải tự dọn tài nguyên. Sau khi gỡ, controller không còn
nhận `hostUpdate()`, `hostUpdated()` hay `hostDisconnected()`.

### Controller và directive

Tài liệu Lit mô tả hai cách kết hợp:

- **Controller directive**: directive tự gọi `addController()` để nhận
  lifecycle của host.
- **Controller sở hữu directive**: controller có method trả về directive để
  đặt lên một element cụ thể trong template, ví dụ:

```js
render() {
  return html`
    <textarea ${this.textSize.observe()}></textarea>
    <p>Width: ${this.textSize.contentRect?.width}</p>
  `;
}
```

Cách thứ hai hữu ích khi controller cần tham chiếu tới một element trong
template, ví dụ `ResizeController` dùng `ResizeObserver`.

### Element tận dụng controller như thế nào

Mixin trao property và method **thẳng vào element**. Controller giữ chúng
**trong một object riêng**, element truy cập qua field (`this.toggle.opened`).
Vì vậy cách tận dụng khác mixin ở từng điểm. Các ví dụ dưới dùng một
`ToggleController` làm cùng việc với `OpenableMixin`; mọi hành vi đều được
kiểm chứng trong `test/controller-interaction.test.js`.

```js
export class ToggleController {
  constructor(host, {opened = false, attribute = 'opened', onChange} = {}) {
    this.host = host;
    this._opened = opened;
    this.attribute = attribute;
    this.onChange = onChange;
    host.addController(this);
  }

  get opened() {
    return this._opened;
  }

  set opened(value) {
    const old = this._opened;
    if (value === old) return;
    this._opened = value;
    this.host.requestUpdate('toggle.opened', old);
    this.onChange?.(value);
    this.host.dispatchEvent(new CustomEvent('opened-changed', {
      detail: {value},
    }));
  }

  toggle() {
    this.opened = !this.opened;
  }

  hostUpdated() {
    this.host.toggleAttribute(this.attribute, this._opened);
  }
}
```

#### Dùng lại state của controller

Element đọc state qua field chứa controller, ngay trong `render()`:

```js
class Panel extends LitElement {
  toggle = new ToggleController(this);

  render() {
    return html`
      <button @click=${() => this.toggle.toggle()}>
        opened = ${this.toggle.opened}
      </button>
    `;
  }
}
```

State của controller **không** phải reactive property. Nó chỉ làm element
render lại vì controller tự gọi `host.requestUpdate()` trong setter. Element
gán `this.toggle.opened = true` cũng đi qua setter đó nên vẫn render lại.

Dùng class field cho controller là an toàn (khác với class field che property
của mixin), vì `toggle` không phải reactive property.

#### Cấu hình và đổi default

Với mixin, element đổi default bằng cách gán trong constructor hoặc khai báo
lại property. Với controller, default và cấu hình được **truyền vào
constructor**, mỗi element một cấu hình:

```js
class ExpandedPanel extends LitElement {
  toggle = new ToggleController(this, {opened: true, attribute: 'expanded'});
}
```

Không có rủi ro "khai báo lại làm mất option" như mixin Lit, vì không có gì bị
khai báo lại. Đổi cấu hình lúc chạy thì controller cần cung cấp setter gọi
`requestUpdate()`, như setter `opened` ở trên.

#### Phản ứng khi state của controller đổi

`changedProperties` của element chỉ tự chứa reactive property. Controller muốn
element nhận biết thay đổi của mình thì gọi `requestUpdate` kèm tên và giá trị
cũ:

```js
this.host.requestUpdate('toggle.opened', old);
```

Khi đó element kiểm tra được như với property của mixin:

```js
updated(changedProperties) {
  if (changedProperties.has('toggle.opened')) {
    console.log('giá trị cũ:', changedProperties.get('toggle.opened'));
  }
}
```

Nếu controller chỉ gọi `requestUpdate()` không tham số, element vẫn render lại
nhưng không biết **cái gì** đã đổi.

#### Object và array trong controller

Giống mixin Lit: controller nên cung cấp method tạo tham chiếu mới và gọi
`requestUpdate()`:

```js
addItem(item) {
  this.items = [...this.items, item];
  this.host.requestUpdate();
}
```

Element mutate thẳng (`this.toggle.items.push(x)`) thì không có update. Khác
mixin, ở đây không có setter nào để Lit bắt được, nên **mọi** thay đổi state
của controller đều phải đi qua method hoặc setter của controller.

#### Event và callback từ controller

Controller có hai cách báo cho element và bên ngoài:

| Cách | Ai nhận | Dùng khi |
|---|---|---|
| Callback trong option (`onChange`) | Chỉ element đã tạo controller | Element cần phản ứng nội bộ; giống `onComplete`/`onError` của `@lit/task` |
| `host.dispatchEvent(...)` | Bất kỳ ai nghe trên element | Event thuộc public API của element |

```js
class Panel extends LitElement {
  toggle = new ToggleController(this, {
    onChange: (opened) => this.saveState(opened),
  });
}
```

Khác mixin: element **không thể** vô tình làm mất event của controller bằng
cách ghi đè method mà quên `super`, vì method nằm trên controller, không nằm
trong prototype chain của element.

#### Style khi dùng controller

Controller **không** có `static styles`; nó không phải class trong chuỗi kế
thừa. Có hai cách tận dụng:

1. Controller phản chiếu state thành attribute trên host (như `hostUpdated()`
   ở trên gọi `toggleAttribute`), element viết CSS `:host([opened])`.
2. Module của controller export một `CSSResult`, element tự đưa vào `styles`:

```js
export const toggleStyles = css`:host([opened]) { font-weight: bold; }`;

class Panel extends LitElement {
  static styles = [toggleStyles, css`:host { display: block; }`];
  toggle = new ToggleController(this);
}
```

Mixin tự gộp style vào element; controller buộc element tự chọn style, nên
không có lỗi "element ghi đè `static styles` làm mất style của mixin".

#### Public API: element tự quyết định mở gì

Với mixin, mọi method của mixin tự thành API của element. Với controller,
element chọn phần muốn mở và có thể giấu controller bằng private field:

```js
class Panel extends LitElement {
  #toggle = new ToggleController(this);

  get opened() {
    return this.#toggle.opened;
  }

  toggle() {
    this.#toggle.toggle();
  }
}
```

#### Lifecycle của controller ảnh hưởng element thế nào

Controller không override hook nào của element; `ReactiveElement` gọi hook
của controller từ bên trong các hook của chính nó. Thứ tự trong một lần update
(test đã kiểm tra với hai controller):

```text
host.willUpdate()
first.hostUpdate()        ← controller theo thứ tự addController
second.hostUpdate()
host.render()             (trong host.update())
first.hostUpdated()
second.hostUpdated()
host.firstUpdated()       [chỉ lần đầu]
host.updated()
```

| Tình huống | Ảnh hưởng |
|---|---|
| Element quên `super.connectedCallback()` | `hostConnected()` của **mọi** controller không chạy, element cũng không bao giờ update |
| Element quên `super.disconnectedCallback()` | `hostDisconnected()` không chạy: timer, listener của controller bị rò rỉ |
| Controller cần dữ liệu tính trong `willUpdate()` của element | Đọc được trong `hostUpdate()`, vì `willUpdate()` chạy trước |
| Controller đo DOM trong `hostUpdated()` | Element đọc được kết quả đo trong `updated()` |
| Controller muốn chặn render | Không làm được: controller không có `shouldUpdate()`; cần mixin nếu thật sự cần |

Điều element phải giữ khi tận dụng controller ít hơn mixin: chỉ cần gọi
`super.connectedCallback()` và `super.disconnectedCallback()` khi override.
Không có chuỗi `super` nào giữa controller và element cho các hook update.

### Tác vụ bất đồng bộ

Controller có thể đóng gói input, trạng thái `pending`, kết quả, lỗi và
cancellation của một tác vụ bất đồng bộ. Lit cung cấp `@lit/task`, một
ReactiveController được thiết kế sẵn cho mục đích này.

Cách dùng `@lit/task` (`npm install @lit/task`):

```js
import {Task} from '@lit/task';

class UserCard extends LitElement {
  static properties = {userId: {type: Number}};

  userTask = new Task(this, {
    task: async ([userId], {signal}) => {
      const response = await fetch(`/api/users/${userId}`, {signal});
      if (!response.ok) throw new Error(response.status);
      return response.json();
    },
    args: () => [this.userId],
  });

  render() {
    return this.userTask.render({
      initial: () => html`Chưa tải.`,
      pending: () => html`Đang tải…`,
      complete: (user) => html`${user.name}`,
      error: (error) => html`Lỗi: ${error}`,
    });
  }
}
```

Các điểm chính của `Task`:

| API | Ý nghĩa |
|---|---|
| `args: () => [...]` | Hàm đọc input từ host; task chạy lại khi mảng args đổi (so sánh nông từng phần tử) |
| `task([args], {signal})` | Hàm async thực hiện công việc; `signal` là `AbortSignal` |
| `status` | `TaskStatus.INITIAL`, `PENDING`, `COMPLETE` hoặc `ERROR` |
| `value`, `error` | Kết quả hoặc lỗi của lần chạy gần nhất |
| `render({initial, pending, complete, error})` | Chọn template theo `status` |
| `autoRun` | `true` (mặc định) chạy trong `hostUpdate()`; `'afterUpdate'` chạy trong `hostUpdated()`; `false` chỉ chạy khi gọi `run()` |
| `run(args?)`, `abort(reason?)` | Chạy thủ công hoặc hủy lần chạy đang chờ |
| `taskComplete` | Promise của lần chạy hiện tại |
| `initialState` | Task trả giá trị này để quay về `INITIAL` |

Khi một lần chạy mới bắt đầu trong lúc lần trước còn `PENDING`, `Task` gọi
`abort()` trên `AbortController` của lần trước và bỏ qua kết quả cũ.
`AbortSignal` chỉ là tín hiệu: cần chuyển tiếp nó vào API như `fetch()`, hoặc
tự kiểm tra bằng `signal.throwIfAborted()` sau mỗi `await`.

Source của `Task` cho thấy khi `autoRun` là `true`, `run()` gọi
`host.requestUpdate()` ngay trong `hostUpdate()`. Host đang update nên lệnh này
không tạo update mới: template của lần update hiện tại đã thấy `PENDING`. Khi
task xong, `Task` gọi `requestUpdate()` lần nữa để render kết quả.

Demo trong thư mục này có `SearchController`, một bản rút gọn của cùng ý tưởng
(không cần cài `@lit/task`) để đọc được toàn bộ luồng:

```js
hostUpdate() {
  const args = this.args();
  if (argsChanged(this.previousArgs, args)) {
    this.run(args);
  }
}

async run(args) {
  this.previousArgs = args;
  this.abort('có lần chạy mới');
  const runId = ++this.runId;
  this.abortController = new AbortController();
  this.status = 'pending';
  this.host.requestUpdate();

  try {
    this.value = await this.task(args, {signal: this.abortController.signal});
    if (runId !== this.runId) return;   // kết quả cũ, bỏ qua
    this.status = 'complete';
  } catch (error) {
    if (runId !== this.runId) return;
    this.error = error;
    this.status = 'error';
  }
  this.host.requestUpdate();
}

hostDisconnected() {
  this.abort('host disconnected');
}
```

### Khi nào dùng controller thay vì mixin

Tài liệu Lit khuyến nghị: nên đóng gói chức năng thành controller, **trừ khi**
chức năng đó cần:

- thêm public API trực tiếp lên component;
- truy cập lifecycle của component ở mức rất chi tiết.

Quan hệ giữa hai cách:

- Component **có** controller (has-a). Người dùng component không truy cập
  controller được, trừ khi component tự mở API.
- Component **là** instance của mixin (is-a). Field và method public của mixin
  trở thành API của component.
- Lifecycle method của controller được gọi **trước** lifecycle method tương
  ứng của component. Mixin nằm trong prototype chain nên component quyết định
  được thời điểm gọi `super`.

Mở demo Lit:
[`demo/index.html#lit-controller`](demo/index.html#lit-controller) (controller
cơ bản) và
[`demo/index.html#reactive-controller`](demo/index.html#reactive-controller)
(controller ghép, tác vụ bất đồng bộ, gắn/gỡ lúc runtime).

## 8. Tiêu chí chọn mixin, controller hoặc function

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

### Cùng một nhu cầu: tận dụng mixin hay controller

| Nhu cầu của element | Tận dụng mixin | Tận dụng controller |
|---|---|---|
| Đọc state | `this.opened` | `this.toggle.opened` |
| Đổi default | Gán trong constructor sau `super()` | Truyền option: `new ToggleController(this, {opened: true})` |
| Đổi cấu hình property | Khai báo lại **đầy đủ** option (Lit) hoặc chỉ option cần đổi (Polymer) | Truyền option khác khi tạo |
| Biết state vừa đổi | `changedProperties.has('opened')` | Controller gọi `requestUpdate('toggle.opened', old)` |
| Object/array | Method của mixin gán tham chiếu mới | Method của controller gán tham chiếu mới + `requestUpdate()` |
| Nhận event | Mixin phát; mất nếu element ghi đè thiếu `super` | Callback option hoặc `host.dispatchEvent`; không mất vì override |
| Style | Mixin gộp `static styles`; element phải giữ `Base.styles` | Element tự thêm `CSSResult` của controller |
| Public API | Tự có trên element | Element tự mở bằng getter/method |
| Nhiều bản cùng lúc | Không được | Tạo nhiều instance |
| Chặn hoặc can thiệp sâu lifecycle | Được (`shouldUpdate`, vị trí `super`) | Không |
| Element phải giữ `super` ở | Mọi hook mà mixin override | Chỉ `connectedCallback`/`disconnectedCallback` |

Tóm lại: controller dễ tận dụng an toàn hơn vì element ít cách làm hỏng nó.
Chọn mixin khi thật sự cần API xuất hiện trực tiếp trên element hoặc cần can
thiệp sâu vào lifecycle.

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

### Vị trí thay thế observer

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
| Gọi `removeController()` rồi chờ `hostDisconnected()` | Timer/listener của controller không được dọn | Tự dọn ngay sau `removeController()` |
| Task bất đồng bộ không abort khi input đổi | Kết quả cũ ghi đè kết quả mới | Dùng `AbortSignal` và bỏ qua kết quả của lần chạy cũ |
| Chuyển mọi `notify` thành event | Giữ API cũ dù không còn consumer | Kiểm tra nơi sử dụng trước |

## 11. Chạy demo

Khởi động web server:

```bash
cd mixin/demo
python3 -m http.server 8000
```

Mở [`demo/index.html`](demo/index.html). Bốn phần nằm trên cùng một trang và có
liên kết riêng để mở trực tiếp:

1. [`#javascript-mixin`](demo/index.html#javascript-mixin): bản chất của mixin,
   prototype chain và `super`.
2. [`#polymer-mixin`](demo/index.html#polymer-mixin): property, observer,
   event và lifecycle Polymer.
3. [`#lit-controller`](demo/index.html#lit-controller): Lit mixin,
   ReactiveController và thứ tự cập nhật.
4. [`#reactive-controller`](demo/index.html#reactive-controller): controller
   ghép, nhiều instance, tác vụ bất đồng bộ có abort, `addController()` và
   `removeController()` lúc runtime.

### Cấu trúc file demo

```text
demo/
  index.html                         cấu trúc chung của trang
  styles.css                         giao diện chung
  main.js                            nút điều khiển và vùng log

  components/
    basic-panel.js                   custom element JavaScript thuần
    polymer-panel.js                 custom element Polymer
    polymer-clock.js                 Polymer dùng lại ClockController
    lit-panel.js                     custom element Lit
    controller-lab.js                element Lit dùng nhiều controller

  mixins/
    javascript-openable-mixin.js     mixin JavaScript thuần
    logging-mixin.js                 minh họa chuỗi gọi super
    polymer-openable-mixin.js        property và lifecycle Polymer
    polymer-controller-host-mixin.js thêm addController() cho Polymer
    lit-openable-mixin.js            reactive property và lifecycle Lit

  controllers/
    counter-controller.js            ReactiveController cơ bản
    clock-controller.js              timer + dọn tài nguyên khi disconnect
    dual-clock-controller.js         controller ghép từ hai ClockController
    search-controller.js             tác vụ bất đồng bộ có abort
    probe-controller.js              addController/removeController lúc runtime

  data/
    fruit-api.js                     API giả lập có độ trễ và AbortSignal
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
  `firstUpdated()` và hành vi khi controller gọi `requestUpdate()`;
- controller ghép và việc dọn timer khi host disconnect;
- task chạy trong `hostUpdate()` sau `willUpdate()`, abort lần chạy cũ, abort
  khi disconnect và chạy lại khi connect lại;
- `addController()` gọi `hostConnected()` ngay khi host đã connected,
  `removeController()` không gọi `hostDisconnected()`.

File `test/mixin-interaction.test.js` kiểm chứng các khẳng định ở mục 3 và 4
về quan hệ giữa element và mixin:

- Polymer: khai báo lại `value` vẫn giữ reflect/notify/observer của mixin;
  observer riêng của element và ghi đè observer; `this.push()` so với
  `items.push()`; element quên `super.ready()`;
- Lit: đổi default trong constructor; class field che accessor; khai báo lại
  property thay thế toàn bộ option; mutate mảng của mixin; element ghi đè
  `static styles`; override thiếu `super` làm mất event và lifecycle của mixin;
  `changedProperties` chứa property của cả mixin lẫn element.

File `test/polymer-controller-host.test.js` kiểm chứng Polymer không có API
host của controller, chuỗi mixin tạo nên `PolymerElement`, và
`ControllerHostMixin` gọi lifecycle của controller đúng như Lit.

File `test/controller-interaction.test.js` kiểm chứng cách element tận dụng
controller ở mục 7: cấu hình qua constructor, `requestUpdate(name, old)`,
mảng, callback và event, style, public API, ảnh hưởng khi thiếu `super`, và
thứ tự hook giữa nhiều controller với host.

Chạy test bằng hai lệnh:

```bash
cd mixin
npm install
npm test
```

### Vị trí chỉnh sửa demo

| Nội dung thay đổi | File |
|---|---|
| Thêm method hoặc trạng thái cho mixin JavaScript | `mixins/javascript-openable-mixin.js` |
| Thay đổi thứ tự gọi `super` | `mixins/logging-mixin.js` |
| Thêm Polymer property, observer hoặc lifecycle | `mixins/polymer-openable-mixin.js` |
| Sửa template Polymer | `components/polymer-panel.js` |
| Dùng controller trong Polymer | `mixins/polymer-controller-host-mixin.js`, `components/polymer-clock.js` |
| Thêm Lit reactive property hoặc lifecycle | `mixins/lit-openable-mixin.js` |
| Sửa template Lit | `components/lit-panel.js` |
| Thêm trạng thái hoặc lifecycle cho controller | `controllers/counter-controller.js` |
| Đổi timer hoặc cách ghép controller | `controllers/clock-controller.js`, `controllers/dual-clock-controller.js` |
| Đổi logic tác vụ bất đồng bộ | `controllers/search-controller.js`, `data/fruit-api.js` |
| Sửa template dùng nhiều controller | `components/controller-lab.js` |
| Thêm nút gọi API | `main.js` và `index.html` |
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

- [Lit: Components overview](https://lit.dev/docs/components/overview/)
- [API `ReactiveElement`](https://lit.dev/docs/api/ReactiveElement/)
- [Class mixins](https://lit.dev/docs/composition/mixins/)
- [Controllers và mixins](https://lit.dev/docs/composition/overview/)
- [ReactiveController](https://lit.dev/docs/composition/controllers/)
- [API `ReactiveController` và `ReactiveControllerHost`](https://lit.dev/docs/api/controllers/)
- [Source `ReactiveElement`](https://github.com/lit/lit/blob/main/packages/reactive-element/src/reactive-element.ts)
- [Reactive properties](https://lit.dev/docs/components/properties/)
- [Lifecycle và reactive update cycle](https://lit.dev/docs/components/lifecycle/)
- [Events](https://lit.dev/docs/components/events/)
- [Styles](https://lit.dev/docs/components/styles/)
- [Lit for Polymer users](https://lit.dev/articles/lit-for-polymer-users/)
- [`@lit/task`](https://lit.dev/docs/data/task/)
