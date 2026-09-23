# Mixin và ReactiveController: từ Polymer đến Lit

> Polymer hiện chỉ được duy trì để hỗ trợ các dự án cũ. Component mới nên được
> xây dựng bằng Lit hoặc Web Components chuẩn.

Tài liệu này trình bày các cơ chế tái sử dụng logic cho custom element theo
trình tự:

1. mixin trong JavaScript;
2. mixin trong Polymer;
3. mixin trong Lit;
4. ReactiveController trong Lit.

Ở mỗi cơ chế, tài liệu mô tả ba nội dung:

- thành phần được cung cấp: property, state, method, event, style, lifecycle;
- cách element dùng lại, cấu hình và ghi đè các thành phần đó;
- ảnh hưởng qua lại giữa lifecycle của element và của phần được tái sử dụng.

Mọi hành vi nêu trong tài liệu đều có test tương ứng, chạy với Lit 3.3.3 và
Polymer 3.5.2 (xem [mục 10](#10-demo-và-kiểm-chứng)).

## Mục lục

1. [Mixin trong JavaScript](#1-mixin-trong-javascript)
2. [Custom element và lifecycle chuẩn](#2-custom-element-và-lifecycle-chuẩn)
3. [Mixin trong Polymer](#3-mixin-trong-polymer)
4. [Nền tảng của Lit](#4-nền-tảng-của-lit)
5. [Mixin trong Lit](#5-mixin-trong-lit)
6. [ReactiveController](#6-reactivecontroller)
7. [Lựa chọn giữa mixin và controller](#7-lựa-chọn-giữa-mixin-và-controller)
8. [Chuyển từ Polymer sang Lit](#8-chuyển-từ-polymer-sang-lit)
9. [Các lỗi thường gặp](#9-các-lỗi-thường-gặp)
10. [Demo và kiểm chứng](#10-demo-và-kiểm-chứng)
11. [Tài liệu tham khảo](#11-tài-liệu-tham-khảo)

## 1. Mixin trong JavaScript

### 1.1. Định nghĩa

Mixin là một function nhận vào một class và trả về class mới kế thừa class đó.
Class mới giữ nguyên API của class đầu vào và bổ sung property, method hoặc
lifecycle.

```js
const SomeMixin = (BaseClass) => class extends BaseClass {
  // Property, method hoặc lifecycle được bổ sung.
};
```

Trong đó:

- `SomeMixin` là function định nghĩa mixin;
- `BaseClass` là class đầu vào, có thể là `HTMLElement`, `PolymerElement`,
  `LitElement` hoặc một class đã áp dụng mixin khác;
- giá trị trả về là class mới có toàn bộ API của `BaseClass` cùng phần bổ sung.

### 1.2. Ví dụ `OpenableMixin`

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

Áp dụng vào một custom element:

```js
class BasicPanel extends OpenableMixin(HTMLElement) {}

customElements.define('basic-panel', BasicPanel);

const panel = document.createElement('basic-panel');
panel.toggle();
console.log(panel.opened); // true
```

`BasicPanel` có `opened` và `toggle()` mà không cần tự khai báo.

### 1.3. Prototype chain sau khi áp dụng mixin

Biểu thức `OpenableMixin(HTMLElement)` tạo ra một class mới
`OpenableMixinImpl extends HTMLElement`. Mixin không sao chép method vào
`HTMLElement.prototype` mà thêm một tầng vào prototype chain:

```text
BasicPanel
  → OpenableMixinImpl
  → HTMLElement
```

Nhờ đó `super` trong mixin hoạt động như trong kế thừa thông thường.

### 1.4. Chuỗi nhiều mixin

```js
class MyElement extends LoggingMixin(OpenableMixin(HTMLElement)) {}
```

Các mixin được áp dụng từ trong ra ngoài:

1. `OpenableMixin(HTMLElement)` tạo class thứ nhất.
2. `LoggingMixin(...)` nhận class thứ nhất và tạo class thứ hai.
3. `MyElement` kế thừa class thứ hai.

```text
MyElement
  → LoggingMixinImpl
  → OpenableMixinImpl
  → HTMLElement
```

Constructor chạy theo chiều ngược lại, từ `HTMLElement` lên `MyElement`, vì
constructor của class con phải gọi `super()` trước khi dùng `this`.

### 1.5. Tìm method và vai trò của `super`

JavaScript tìm method từ đầu prototype chain và dừng ở method đầu tiên tìm
thấy. Khi cả hai mixin cùng có `toggle()`, method của `LoggingMixinImpl` được
dùng vì nằm gần `MyElement` hơn:

```js
const LoggingMixin = (BaseClass) => class extends BaseClass {
  toggle() {
    console.log('trước super');
    super.toggle();
    console.log('sau super');
  }
};
```

```text
element.toggle()
  → LoggingMixin.toggle()     in "trước super"
  → OpenableMixin.toggle()    đổi opened
  → LoggingMixin.toggle()     in "sau super"
```

Vị trí gọi `super` quyết định thứ tự: phần code trước `super` chạy trước logic
của lớp dưới, phần code sau `super` chạy khi lớp dưới đã xong. Không gọi
`super` đồng nghĩa với việc bỏ qua toàn bộ logic của lớp dưới.

Mỗi framework có yêu cầu riêng về `super`:

- Polymer yêu cầu gọi `super` ở dòng đầu tiên của lifecycle callback.
- Lit yêu cầu gọi `super` trong `connectedCallback()`, `disconnectedCallback()`
  và `update()`.
- Các hook `willUpdate()`, `firstUpdated()`, `updated()` của Lit không bắt buộc
  gọi `super` đối với bản thân Lit, nhưng mixin cần gọi để không làm đứt chuỗi.

### 1.6. Xung đột tên và mixin áp dụng lặp

Khi hai mixin khai báo cùng tên property hoặc method, thành phần của mixin
được áp dụng sau che thành phần của mixin trước. Method có thể nối với nhau
bằng `super`; cấu hình property thì bị ghi đè và khó phát hiện. Trạng thái nội
bộ của mixin cần tên đủ riêng để tránh xung đột.

Mỗi lần gọi mixin tạo một class mới:

```js
OpenableMixin(HTMLElement) === OpenableMixin(HTMLElement); // false
```

Nếu cùng một mixin xuất hiện hai lần trong chain, lifecycle và listener của nó
chạy hai lần. Polymer cung cấp `dedupingMixin()` để bỏ qua lần áp dụng lặp:

```js
import {dedupingMixin} from '@polymer/polymer/lib/utils/mixin.js';

export const OpenableMixin = dedupingMixin(
  (BaseClass) => class extends BaseClass {}
);
```

Lit không có hàm tương đương tích hợp sẵn.

### 1.7. Hợp đồng của mixin

Tài liệu của một mixin cần nêu rõ:

- property và method được thêm;
- API mà class đầu vào bắt buộc phải có;
- lifecycle bị override và yêu cầu gọi `super`;
- listener, timer, observer hoặc subscription được tạo, và vị trí giải phóng;
- các event được phát.

Ví dụ sau chỉ hoạt động khi class đầu vào đã có `toggle()`:

```js
const DisableableMixin = (BaseClass) => class extends BaseClass {
  toggle() {
    if (!this.disabled) {
      super.toggle();
    }
  }
};
```

JavaScript không tự kiểm tra điều kiện này; nếu class đầu vào không có
`toggle()`, lời gọi `super.toggle()` gây lỗi lúc chạy.

Demo: [`demo/index.html#javascript-mixin`](demo/index.html#javascript-mixin).

## 2. Custom element và lifecycle chuẩn

Polymer và Lit đều xây dựng trên custom element, một Web API chuẩn của trình
duyệt. Custom element là class kế thừa `HTMLElement` và được đăng ký với một
tên thẻ:

```js
class HelloBox extends HTMLElement {
  connectedCallback() {
    this.textContent = 'Xin chào';
  }
}

customElements.define('hello-box', HelloBox);
```

Trình duyệt gọi các callback sau:

| Callback | Thời điểm | Mục đích |
|---|---|---|
| `constructor()` | Khi element được tạo, một lần | Khởi tạo giá trị không cần DOM |
| `connectedCallback()` | Mỗi lần element được gắn vào document | Đăng ký listener, observer, subscription bên ngoài |
| `disconnectedCallback()` | Mỗi lần element bị tháo khỏi document | Giải phóng những gì đã đăng ký khi connect |
| `attributeChangedCallback()` | Khi attribute được theo dõi thay đổi | Đồng bộ attribute sang property |
| `adoptedCallback()` | Khi element chuyển sang document khác | Ít dùng |

Một element có thể được gắn và tháo nhiều lần, nên tài nguyên đăng ký trong
`connectedCallback()` phải được giải phóng trong `disconnectedCallback()`.

Custom element thuần không tự cập nhật giao diện khi dữ liệu thay đổi:

```js
class CounterBox extends HTMLElement {
  count = 0;

  increment() {
    this.count += 1;
    this.textContent = `count = ${this.count}`; // cập nhật DOM thủ công
  }
}
```

Polymer và Lit bổ sung cơ chế **reactive**: khi property thay đổi, giao diện
được cập nhật tự động. Hai thư viện cài đặt cơ chế này theo cách khác nhau,
và điều đó quyết định cách mixin của từng thư viện hoạt động.

## 3. Mixin trong Polymer

### 3.1. `PolymerElement` được xây dựng từ mixin

Bản thân `PolymerElement` là kết quả của một chuỗi mixin. Trong source Polymer,
`PolymerElement = ElementMixin(HTMLElement)`, và `ElementMixin` áp dụng tiếp
các mixin bên dưới. Prototype chain thực tế:

```text
PolymerElement
  → PropertiesMixin       đọc khai báo static get properties()
  → PropertyEffects       computed, observer, binding, reflect, notify
  → TemplateStamp         tạo DOM từ template
  → PropertyAccessors     tạo getter/setter cho property
  → PropertiesChanged     gom thay đổi và gọi _propertiesChanged()
  → HTMLElement
```

Vì vậy mixin do người dùng viết cho Polymer hoạt động cùng cơ chế với các mixin
nội bộ: Polymer đọc `properties`, `observers` và lifecycle trên toàn bộ
prototype chain.

### 3.2. Viết mixin

```js
import {dedupingMixin} from '@polymer/polymer/lib/utils/mixin.js';

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

### 3.3. Áp dụng vào element

```js
import {html, PolymerElement} from '@polymer/polymer/polymer-element.js';
import {OpenableMixin} from './openable-mixin.js';

class PolymerPanel extends OpenableMixin(PolymerElement) {
  static get is() {
    return 'polymer-panel';
  }

  static get template() {
    return html`
      <button on-click="toggle">[[label]]</button>
      <p>opened = [[opened]]</p>
      <div hidden$="[[!opened]]">Nội dung đang hiển thị.</div>
    `;
  }
}

customElements.define(PolymerPanel.is, PolymerPanel);
```

Element không khai báo lại `opened`, `label` hoặc `toggle()`. Template dùng
trực tiếp property và method của mixin.

### 3.4. Thành phần mixin cung cấp qua `properties`

Mỗi option trong `properties` của mixin tạo ra một hành vi cho mọi element sử
dụng mixin:

| Option trong mixin | Hành vi element nhận được |
|---|---|
| `type` | Attribute được chuyển đổi sang kiểu tương ứng (ví dụ Boolean) |
| `value` | Giá trị mặc định khi element khởi tạo |
| `reflectToAttribute` | Attribute trên thẻ luôn phản ánh giá trị property |
| `notify` | Event `<property>-changed` mỗi khi property đổi |
| `readOnly` | Chỉ setter nội bộ (`_setOpened`) được đổi giá trị |
| `computed` | Property được tính từ property khác |
| `observer` | Method được gọi mỗi khi property đổi, bất kể nguồn thay đổi |

Element chỉ cần gán `this.opened = true`; các hành vi trên chạy tự động.

### 3.5. Dùng lại và thay đổi property của mixin

**Đọc và gán.** Element dùng `[[opened]]` trong template và gán
`this.opened = ...` trong method như với property của chính nó.

**Đổi giá trị mặc định.** Element khai báo lại property và chỉ ghi option cần
đổi:

```js
class ExpandedPanel extends OpenableMixin(PolymerElement) {
  static get properties() {
    return {
      opened: {value: true},
    };
  }
}
```

Polymer gộp property effect trên toàn bộ class chain, nên `reflectToAttribute`,
`notify` và `observer` do mixin khai báo vẫn được giữ.

**Thêm observer riêng.** Element theo dõi property của mixin mà không thay đổi
mixin:

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

**Ghi đè observer của mixin.** Method trùng tên `openedChanged_` trong element
che method của mixin (mục 1.5). Để giữ logic của mixin, cần gọi `super`:

```js
openedChanged_(opened, oldOpened) {
  super.openedChanged_(opened, oldOpened);
  this.updateAria_(opened);
}
```

### 3.6. Thứ tự property effects

Khi `opened` thay đổi, Polymer chạy đồng bộ các effect do mixin và element khai
báo theo thứ tự:

```text
this.opened = true
  1. Computed     label được tính lại
  2. Binding      template cập nhật [[opened]], [[label]]
  3. Reflect      attribute opened được đặt
  4. Observer     openedChanged_ của mixin, observer của element
  5. Notify       event opened-changed được phát
```

Hệ quả:

- Trong observer, template đã được cập nhật và attribute đã được phản chiếu.
- Listener của `opened-changed` chạy sau observer.
- Mỗi lần gán property là một lượt effect riêng. Observer phụ thuộc hai property
  (`observers: ['sync_(opened, disabled)']`) sẽ chạy hai lần khi hai property
  được gán lần lượt. `setProperties()` gộp các thay đổi thành một lượt:

```js
this.setProperties({opened: true, disabled: false});
```

### 3.7. Object và array do mixin quản lý

```js
export const ListMixin = (BaseClass) => class extends BaseClass {
  static get properties() {
    return {
      items: {type: Array, value: () => []},
    };
  }

  static get observers() {
    return ['itemsChanged_(items.splices)'];
  }

  itemsChanged_(splices) {
    // Đồng bộ trạng thái phụ thuộc danh sách.
  }
};
```

Hai yêu cầu đối với element:

1. `value` của object hoặc array phải là function trả về giá trị mới. Với
   `value: []`, mọi instance dùng chung một mảng.
2. Mảng phải được thay đổi qua API của Polymer thì observer của mixin mới được
   gọi:

```js
this.push('items', item);   // observer items.splices được gọi
this.items.push(item);      // mảng đổi nhưng observer không được gọi
```

Tương tự với object: dùng `this.set('user.name', 'An')` thay cho
`this.user.name = 'An'`. Mixin nên cung cấp method như `addItem(item)` để
element không phụ thuộc vào path mà mixin theo dõi.

### 3.8. Event do mixin phát

**Event từ `notify: true`.** Mixin không cần gọi `dispatchEvent`. Bên ngoài
nhận được mọi thay đổi của property:

```js
panel.addEventListener('opened-changed', (event) => {
  console.log(event.detail.value);
});
```

Two-way binding của element cha dựa trên event này:

```html
<polymer-panel opened="{{panelOpened}}"></polymer-panel>
```

Giá trị mặc định cũng đi qua property effect, nên listener gắn trước khi element
khởi tạo nhận thêm một event cho giá trị mặc định. Event do `notify` tạo ra
không bubble.

**Event nghiệp vụ do mixin phát.** Event mô tả hành động, khác với event mô tả
thay đổi property:

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

Event này nằm trong `toggle()` của mixin. Element ghi đè `toggle()` mà không
gọi `super.toggle()` sẽ làm mất event. `bubbles` và `composed` là một phần của
API, chỉ bật khi event cần đi qua shadow boundary.

### 3.9. Style dựa trên trạng thái của mixin

`reflectToAttribute: true` cho phép CSS dùng trạng thái của mixin:

```css
/* CSS bên ngoài element */
polymer-panel[opened] {
  border-color: #111;
}

/* CSS trong shadow DOM của element */
:host([opened]) .content {
  display: block;
}
```

Mixin cung cấp trạng thái và attribute; element quyết định cách hiển thị.

### 3.10. Lifecycle

| Callback | Số lần | Mục đích |
|---|---:|---|
| `constructor()` | Một | Khởi tạo không cần DOM |
| `connectedCallback()` | Nhiều | Đăng ký listener, subscription bên ngoài |
| `ready()` | Một | Truy cập template, shadow DOM, `this.$` |
| `disconnectedCallback()` | Nhiều | Giải phóng listener, subscription |

```text
constructor()                    một lần
connectedCallback()
  └── ready()                    một lần, trong lần connect đầu tiên
disconnectedCallback()
connectedCallback()              ready() không chạy lại
```

Khi mixin và element cùng override `ready()`, chúng tạo thành chuỗi `super`:

```js
// Element
ready() {
  // (1) chưa có shadow DOM, observer của mixin chưa chạy
  super.ready();
  // (2) shadow DOM đã được tạo, mixin đã hoàn tất ready()
}
```

```text
Element.ready() – phần trước super
  → OpenableMixin.ready()
      → PolymerElement.ready()
          tạo shadow DOM từ template,
          chạy effect cho giá trị ban đầu (observer của mixin chạy lần đầu)
      → phần còn lại của OpenableMixin.ready()
Element.ready() – phần sau super
```

Ảnh hưởng:

- Element không gọi `super.ready()` thì template không được tạo (`shadowRoot`
  bằng `null`) và `ready()` của mixin không chạy.
- Listener do mixin đăng ký trong `connectedCallback()` tồn tại trên mọi element
  dùng mixin; mixin phải tự giải phóng trong `disconnectedCallback()`.
- Listener không đặt trong `ready()`, vì `ready()` chỉ chạy một lần trong khi
  element có thể được gắn lại nhiều lần.

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

### 3.11. Class mixin, Behavior và CSS mixin

| Tên gọi | Bản chất |
|---|---|
| Class mixin | Function nhận class và trả về class mới (nội dung mục này) |
| Behavior | Object cấu hình được Polymer legacy merge vào element |
| CSS mixin | Nhóm khai báo CSS dùng qua custom property và `@apply` |

Behavior và CSS mixin là cơ chế cũ, không nên dùng cho code mới.

Demo: [`demo/index.html#polymer-mixin`](demo/index.html#polymer-mixin).

## 4. Nền tảng của Lit

### 4.1. `HTMLElement`, `ReactiveElement` và `LitElement`

Lit chia cơ chế reactive thành hai lớp:

```text
LitElement
  → ReactiveElement
  → HTMLElement
```

| Lớp | Vai trò | Package |
|---|---|---|
| `HTMLElement` | Custom element và lifecycle chuẩn (mục 2) | Trình duyệt |
| `ReactiveElement` | Quyết định **khi nào** cập nhật: reactive property, `requestUpdate()`, chu trình cập nhật, `updateComplete`, `static styles`, `addController()` | `@lit/reactive-element` |
| `LitElement` | Quyết định **cập nhật DOM như thế nào**: gọi `render()` và dùng lit-html vẽ template vào `renderRoot`, chỉ sửa phần thay đổi | `lit` |

Component thường kế thừa `LitElement`. Mọi tính năng reactive, bao gồm
ReactiveController, được cung cấp bởi `ReactiveElement`.

### 4.2. So sánh với Polymer

Polymer không có `ReactiveElement`. Các trách nhiệm tương ứng nằm ở những
mixin nội bộ đã nêu ở mục 3.1:

| Trách nhiệm | Lit | Polymer |
|---|---|---|
| Tạo getter/setter cho property | `ReactiveElement` | `PropertyAccessors` |
| Gom thay đổi, báo property nào đổi | `ReactiveElement` (`requestUpdate`, `changedProperties`) | `PropertiesChanged` (`_propertiesChanged`) |
| Đọc khai báo property | `ReactiveElement` (`static properties`) | `PropertiesMixin` (`static get properties()`) |
| Computed, observer, binding, reflect, notify | Không có; dùng `willUpdate()`, `updated()` | `PropertyEffects` |
| Tạo DOM từ template | `LitElement` + lit-html | `TemplateStamp` + `ElementMixin` |
| Gắn ReactiveController | `addController()` | Không có |

Khác biệt về thời điểm cập nhật:

- Polymer chạy property effect **đồng bộ** tại dòng gán.
- Lit **gom** các thay đổi và cập nhật trong microtask; mã cần đọc DOM mới phải
  chờ `updateComplete`.

### 4.3. Element Lit tối thiểu

```js
import {LitElement, html} from 'lit';

class CounterBox extends LitElement {
  static properties = {
    count: {type: Number},
  };

  constructor() {
    super();
    this.count = 0;
  }

  render() {
    return html`
      <button @click=${() => this.count++}>count = ${this.count}</button>
    `;
  }
}

customElements.define('counter-box', CounterBox);
```

Khi nút được bấm:

```text
this.count++           setter do Lit tạo phát hiện giá trị mới
  → requestUpdate()    lên lịch cập nhật
  → microtask          gom các thay đổi khác
  → render()           tạo template mới
  → cập nhật DOM       chỉ sửa đoạn text "count = …"
```

### 4.4. Reactive property

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

| Option | Ý nghĩa |
|---|---|
| `type` | Chuyển đổi giữa attribute và property |
| `reflect` | Phản chiếu property thành attribute trong lượt cập nhật |
| `attribute` | Đổi tên attribute, hoặc `false` để không dùng attribute |
| `hasChanged` | Quy tắc quyết định giá trị mới có gây cập nhật hay không |

Giá trị mặc định được gán trong constructor. Lit so sánh bằng tham chiếu, nên
object và array cần được gán tham chiếu mới để tạo cập nhật.

### 4.5. Chu trình cập nhật

```text
property setter
  → hasChanged()
  → requestUpdate()
  → chờ microtask
  → shouldUpdate(changedProperties)
  → willUpdate(changedProperties)
  → update(changedProperties)
      → phản chiếu attribute
      → render()
      → cập nhật DOM
  → firstUpdated(changedProperties)   chỉ lần đầu
  → updated(changedProperties)
  → updateComplete hoàn tất
```

`changedProperties` là một `Map`: key là tên property, value là giá trị cũ.

| Hook | DOM đã cập nhật | Mục đích |
|---|:---:|---|
| `shouldUpdate()` | Chưa | Quyết định có tiếp tục cập nhật hay không |
| `willUpdate()` | Chưa | Tính dữ liệu cho lượt render hiện tại |
| `render()` | Đang tạo | Trả về template; không chứa side effect |
| `update()` | Đang cập nhật | Hook mức thấp; override phải gọi `super.update()` |
| `firstUpdated()` | Rồi | Công việc cần DOM, chỉ sau lần render đầu |
| `updated()` | Rồi | Side effect cần DOM sau mỗi lượt cập nhật |

Quy tắc khi gán property trong lifecycle:

- Gán từ `shouldUpdate()` đến `render()` không tạo lượt cập nhật mới.
- Gán trong `firstUpdated()` hoặc `updated()` tạo thêm một lượt cập nhật.
- Gán vô điều kiện trong `updated()` gây vòng lặp cập nhật.

Lifecycle theo thời gian:

```text
constructor()                    một lần
connectedCallback()
lượt cập nhật đầu tiên
  → firstUpdated()               một lần
  → updated()
property đổi → lượt cập nhật → updated()
disconnectedCallback()
connectedCallback()              firstUpdated() không chạy lại
```

### 4.6. `updateComplete`

```js
async openAndFocus() {
  this.opened = true;
  await this.updateComplete;
  this.renderRoot.querySelector('button')?.focus();
}
```

`updateComplete` là Promise của lượt cập nhật hiện tại, không bao gồm các
component con. Giá trị trả về là `true` nếu không còn lượt cập nhật nào đang
chờ, `false` nếu lượt vừa xong đã tạo thêm lượt mới.

## 5. Mixin trong Lit

Mixin Lit có cùng cấu trúc với mixin JavaScript (mục 1). Khác biệt nằm ở cách
Lit kế thừa khai báo property, style và ở chu trình cập nhật (mục 4).

### 5.1. Viết mixin

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

### 5.2. Áp dụng vào element

```js
import {html, LitElement} from 'lit';
import {OpenableMixin} from './openable-mixin.js';

class LitPanel extends OpenableMixin(LitElement) {
  render() {
    return html`
      <button @click=${this.toggle}>opened = ${this.opened}</button>
      <div ?hidden=${!this.opened}>Nội dung đang hiển thị.</div>
    `;
  }
}

customElements.define('lit-panel', LitPanel);
```

Lit gộp `static properties` trên toàn bộ class chain. Element không khai báo
lại `opened`; mọi phép gán `this.opened` đều tạo cập nhật và phản chiếu
attribute theo cấu hình của mixin.

### 5.3. Dùng lại và thay đổi property của mixin

**Đổi giá trị mặc định.** Gán trong constructor của element, sau `super()`:

```js
class ExpandedPanel extends OpenableMixin(LitElement) {
  constructor() {
    super();              // mixin gán opened = false
    this.opened = true;   // element đặt giá trị mặc định mới
  }
}
```

Cả hai phép gán xảy ra trước lần render đầu, nên Lit chỉ render một lần với
`opened = true`.

**Không dùng class field cho property của mixin.** Khai báo
`opened = true;` dưới dạng class field tạo một property riêng trên instance,
che accessor mà Lit tạo cho `opened`. Sau đó phép gán `this.opened = false`
không còn tạo cập nhật. Lit ở chế độ development phát cảnh báo cho trường hợp
này.

**Khai báo lại property thay thế toàn bộ option.** Khác Polymer, Lit không gộp
từng option:

```js
class ExpandedPanel extends OpenableMixin(LitElement) {
  static properties = {
    opened: {attribute: 'expanded'},   // mất type: Boolean và reflect
  };
}
```

Với khai báo trên, attribute `expanded` được chuyển thành chuỗi `""` thay vì
`true`. Cần khai báo lại đầy đủ option. Mixin có thể export option để element
dùng lại:

```js
export const openedProperty = {type: Boolean, reflect: true};

// Trong element
static properties = {
  opened: {...openedProperty, attribute: 'expanded'},
};
```

Việc khai báo lại chỉ ảnh hưởng đến property đó; các property khác của mixin
được giữ nguyên.

**Phản ứng khi property của mixin đổi.** Element kiểm tra `changedProperties`
trong `willUpdate()` hoặc `updated()`:

```js
updated(changedProperties) {
  super.updated(changedProperties);
  if (changedProperties.has('opened')) {
    this.renderRoot.querySelector('.content')?.scrollIntoView();
  }
}
```

`changedProperties` chứa mọi property thay đổi trong lượt cập nhật, của cả
mixin lẫn element. Mixin chỉ nên xử lý các key thuộc về mình.

### 5.4. Object và array do mixin quản lý

```js
export const ListMixin = (BaseClass) => class extends BaseClass {
  static properties = {
    items: {type: Array},
  };

  constructor() {
    super();
    this.items = [];
  }

  addItem(item) {
    this.items = [...this.items, item];
  }

  removeItem(index) {
    this.items = this.items.filter((_, i) => i !== index);
  }
};
```

Hai yêu cầu:

1. Giá trị mặc định là object hoặc array phải được tạo mới trong constructor.
   Dùng chung một hằng số rồi mutate làm mọi instance cùng thay đổi.
2. Mutate trực tiếp không tạo cập nhật, và `willUpdate()`/`updated()` của mixin
   cũng không chạy:

```js
this.items.push(item);                 // không có cập nhật
this.addItem(item);                    // có cập nhật
this.items = [...this.items, item];    // có cập nhật
```

Có thể gọi `this.requestUpdate('items')` sau khi mutate, nhưng khi đó
`changedProperties.get('items')` là `undefined`; mixin không có giá trị cũ để
so sánh.

### 5.5. Style do mixin cung cấp

```js
const openableStyles = css`
  :host([opened]) {
    border-color: var(--openable-border-color, currentColor);
  }
`;

export const StyledOpenableMixin = (BaseClass) => class extends BaseClass {
  static styles = [BaseClass.styles ?? [], openableStyles];
};
```

`:host([opened])` hoạt động nhờ `reflect: true` của `opened`. Nếu element khai
báo lại `opened` mà bỏ `reflect`, style này không còn tác dụng.

Khi element khai báo `static styles`, style của mixin bị thay thế. Style của
lớp cha phải được đưa vào mảng:

```js
const PanelBase = StyledOpenableMixin(LitElement);

class LitPanel extends PanelBase {
  static styles = [
    PanelBase.styles,
    css`:host { display: block; }`,
  ];
}
```

Style đứng sau trong mảng được ưu tiên khi cùng độ đặc hiệu, nên element có
thể ghi đè style của mixin. CSS custom property (`--openable-border-color`)
cho phép tùy biến mà không cần ghi đè.

### 5.6. Event do mixin phát

Lit không có `notify`. Mixin tự phát event, và vị trí phát quyết định khi nào
event xuất hiện.

**Phát trong method.** Event chỉ xuất hiện khi method được gọi:

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

Phép gán `this.opened = true` trực tiếp không phát event. Element ghi đè
`toggle()` mà không gọi `super.toggle()` làm mất event.

**Phát trong `updated()`.** Event xuất hiện với mọi thay đổi của property:

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

Điều kiện giá trị cũ khác `undefined` bỏ qua lần gán mặc định. Event được phát
sau khi DOM đã cập nhật. Element ghi đè `updated()` mà không gọi
`super.updated()` làm mất event.

Phát trong method phù hợp với event mô tả thao tác người dùng; phát trong
`updated()` phù hợp với event mô tả thay đổi trạng thái.

### 5.7. Lifecycle của mixin và element

Khi mixin và element cùng override một hook, vị trí gọi `super` trong element
quyết định thứ tự:

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

| Hook mixin override | Ảnh hưởng đến element |
|---|---|
| `connectedCallback()` / `disconnectedCallback()` | Chạy trên mọi element dùng mixin. Element không gọi `super.connectedCallback()` thì Lit không tạo `renderRoot` và không bao giờ cập nhật |
| `willUpdate()` | Giá trị do mixin tính sẵn dùng được trong `render()` của element |
| `updated()` | Element không gọi `super.updated()` thì logic của mixin (event, đo DOM) bị mất |
| `updated()` có gán property | Tạo thêm một lượt cập nhật; `updateComplete` trả về `false` |
| `firstUpdated()` | Chỉ chạy một lần, không chạy lại khi element được gắn lại |
| `shouldUpdate()` trả về `false` | Element không render, kể cả khi property của element đổi |

Quy tắc chung:

- Mixin gọi `super.<hook>?.(...)`; toán tử `?.` phòng trường hợp lớp dưới không
  định nghĩa hook.
- Element override hook nào thì gọi `super` của hook đó.
- Hợp đồng của mixin (mục 1.7) liệt kê các hook bị override.

Demo: [`demo/index.html#lit-controller`](demo/index.html#lit-controller).

## 6. ReactiveController

### 6.1. Hạn chế của mixin

Mixin đưa property và method trực tiếp vào element. Cách này có các hạn chế:

- mỗi element chỉ có một bản của mixin, không thể có hai đồng hồ độc lập từ cùng
  một `ClockMixin`;
- property của mixin trộn vào API của element và có thể trùng tên;
- element phải giữ đúng chuỗi `super` ở mọi hook mà mixin override;
- cấu hình chỉ truyền được qua property, không truyền được lúc khởi tạo.

ReactiveController tách logic có state và lifecycle thành một object riêng,
thuộc sở hữu của element.

```text
Mixin:       LitPanel → OpenableMixinImpl → LitElement
             (mixin nằm trong prototype chain)

Controller:  LitPanel
               └── clock: ClockController
             (controller là object được element sở hữu)
```

Tài liệu Lit mô tả quan hệ này như sau: element **là** instance của mixin
(is-a), còn element **có** controller (has-a).

### 6.2. Host và API của host

Element sở hữu controller được gọi là **host**. Host cung cấp bốn API:

| API | Hành vi trong `ReactiveElement` (Lit 3.3.3) |
|---|---|
| `addController(c)` | Thêm `c` vào tập controller. Nếu host đã connected, gọi `c.hostConnected()` ngay |
| `removeController(c)` | Chỉ xóa `c` khỏi tập controller; không gọi `c.hostDisconnected()` |
| `requestUpdate()` | Lên lịch cập nhật; lời gọi trong `hostUpdate()` được gộp vào lượt hiện tại |
| `updateComplete` | Promise hoàn tất khi host cập nhật xong |

`LitElement` và `ReactiveElement` là host. Theo tài liệu Lit, host cũng có thể
là base class của thư viện khác, component của framework khác hoặc một
controller khác, miễn là cung cấp đủ bốn API trên (xem mục 6.11).

### 6.3. Lifecycle của controller

| Callback | Thời điểm | Mục đích |
|---|---|---|
| `hostConnected()` | Host được gắn vào document, sau khi `renderRoot` đã tạo | Đăng ký listener, observer, timer |
| `hostUpdate()` | Trước `update()` và `render()` của host | Đọc DOM trước khi thay đổi, chuẩn bị dữ liệu |
| `hostUpdated()` | Sau khi DOM cập nhật, trước `updated()` của host | Đọc DOM sau khi thay đổi |
| `hostDisconnected()` | Host bị tháo khỏi document | Giải phóng những gì tạo trong `hostConnected()` |

Các callback đều không bắt buộc.

Thứ tự trong một lượt cập nhật của host có hai controller:

```text
host.shouldUpdate()          false → dừng, controller không được gọi
host.willUpdate()
first.hostUpdate()           theo thứ tự addController
second.hostUpdate()
host.update() → render() → cập nhật DOM
first.hostUpdated()
second.hostUpdated()
host.firstUpdated()          chỉ lần đầu
host.updated()
```

`hostConnected()` và `hostDisconnected()` được gọi bên trong
`super.connectedCallback()` và `super.disconnectedCallback()` của
`ReactiveElement`. Vì vậy thứ tự giữa log của mixin và của controller phụ thuộc
vào vị trí mixin gọi `super`.

### 6.4. Viết controller

`ClockController` theo ví dụ trong tài liệu Lit:

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

Các điểm chính:

1. Controller là object thông thường, không kế thừa lớp nào.
2. `host.addController(this)` đăng ký controller vào lifecycle của host.
3. State của controller không phải reactive property; controller gọi
   `host.requestUpdate()` sau mỗi thay đổi.
4. Tài nguyên tạo trong `hostConnected()` được giải phóng trong
   `hostDisconnected()`; cả hai có thể chạy nhiều lần.

Sử dụng trong element:

```js
class MyClock extends LitElement {
  clock = new ClockController(this, 1000);

  render() {
    return html`${this.clock.value.toLocaleTimeString()}`;
  }
}
```

Class field phù hợp để tạo controller, vì `clock` không phải reactive property.

### 6.5. Dùng lại và cấu hình controller trong element

Các ví dụ trong mục này dùng `ToggleController`, cung cấp cùng chức năng với
`OpenableMixin`:

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

**Đọc state.** Element truy cập qua field chứa controller:

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

**Cấu hình và giá trị mặc định.** Truyền qua constructor, mỗi element một cấu
hình riêng:

```js
toggle = new ToggleController(this, {opened: true, attribute: 'expanded'});
```

Không có khai báo nào bị ghi đè, nên không xảy ra tình trạng mất option như khi
khai báo lại property của mixin Lit.

**Phản ứng khi state đổi.** `changedProperties` chỉ tự chứa reactive property.
Khi controller gọi `requestUpdate` kèm tên và giá trị cũ, host nhận được key
tương ứng:

```js
// Trong controller
this.host.requestUpdate('toggle.opened', old);

// Trong element
updated(changedProperties) {
  if (changedProperties.has('toggle.opened')) {
    console.log('giá trị cũ:', changedProperties.get('toggle.opened'));
  }
}
```

Nếu controller gọi `requestUpdate()` không tham số, host vẫn cập nhật nhưng
không biết thành phần nào đã đổi.

**Object và array.** Controller cung cấp method tạo tham chiếu mới và gọi
`requestUpdate()`:

```js
addItem(item) {
  this.items = [...this.items, item];
  this.host.requestUpdate();
}
```

State của controller không có setter do Lit tạo, nên mutate trực tiếp
(`this.toggle.items.push(x)`) không tạo cập nhật. Mọi thay đổi state phải đi qua
method hoặc setter của controller.

### 6.6. Event, style và public API

**Event và callback.** Controller có hai cách thông báo:

| Cách | Bên nhận | Trường hợp sử dụng |
|---|---|---|
| Callback trong option (`onChange`) | Element tạo controller | Phản ứng nội bộ; tương tự `onComplete`, `onError` của `@lit/task` |
| `host.dispatchEvent(...)` | Mọi listener trên element | Event thuộc public API của element |

```js
toggle = new ToggleController(this, {
  onChange: (opened) => this.saveState(opened),
});
```

Method của controller không nằm trong prototype chain của element, nên element
không thể làm mất event của controller bằng cách override method mà thiếu
`super`.

**Style.** Controller không có `static styles`. Hai cách cung cấp style:

1. Controller phản chiếu state thành attribute trên host (`toggleAttribute`
   trong `hostUpdated()`), element viết CSS `:host([opened])`.
2. Module của controller export `CSSResult`, element tự thêm vào `styles`:

```js
export const toggleStyles = css`:host([opened]) { font-weight: bold; }`;

class Panel extends LitElement {
  static styles = [toggleStyles, css`:host { display: block; }`];
  toggle = new ToggleController(this);
}
```

**Public API.** Method của mixin tự trở thành API của element. Với controller,
element chọn phần được công khai và có thể giữ controller ở private field:

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

### 6.7. Lifecycle của controller và element

Controller không override hook của element; `ReactiveElement` gọi hook của
controller từ bên trong hook của chính nó.

| Tình huống | Ảnh hưởng |
|---|---|
| Element không gọi `super.connectedCallback()` | `hostConnected()` của mọi controller không chạy; element không bao giờ cập nhật |
| Element không gọi `super.disconnectedCallback()` | `hostDisconnected()` không chạy; timer và listener của controller không được giải phóng |
| Element tính dữ liệu trong `willUpdate()` | Controller đọc được trong `hostUpdate()` |
| Controller đo DOM trong `hostUpdated()` | Element đọc được kết quả trong `updated()` |
| Controller cần chặn render | Không thực hiện được; controller không có `shouldUpdate()` |

So với mixin, element chỉ cần giữ `super` trong `connectedCallback()` và
`disconnectedCallback()`.

### 6.8. Nhiều instance và ghép controller

Mỗi controller có state riêng, nên một element có thể dùng nhiều instance:

```js
class TwoClocks extends LitElement {
  fast = new ClockController(this, 1000);
  slow = new ClockController(this, 60000);
}
```

`fast` và `slow` có timer và giá trị riêng. Một mixin không cung cấp được hai
bản độc lập như vậy trong cùng một element.

Controller có thể được ghép từ controller khác bằng cách chuyển tiếp host.
Controller con tự đăng ký với host; controller cha không cần gọi
`addController()` nếu không có lifecycle riêng:

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

### 6.9. Gắn và gỡ controller khi host đang hoạt động

Mọi object được truyền vào `addController()` đều là controller; controller không
bắt buộc là field của host.

```js
attach() {
  this.host.addController(this);    // host đã connected → hostConnected() chạy ngay
}

detach() {
  this.host.removeController(this); // không gọi hostDisconnected()
  this.cleanup();
}
```

Controller bị gỡ khi host vẫn connected phải tự giải phóng tài nguyên. Sau khi
gỡ, controller không còn nhận `hostUpdate()`, `hostUpdated()` và
`hostDisconnected()`.

**Controller và directive.** Tài liệu Lit mô tả hai cách kết hợp: directive tự
gọi `addController()` để nhận lifecycle của host, hoặc controller có method trả
về directive để gắn lên một element cụ thể trong template:

```js
render() {
  return html`
    <textarea ${this.textSize.observe()}></textarea>
    <p>Width: ${this.textSize.contentRect?.width}</p>
  `;
}
```

### 6.10. Tác vụ bất đồng bộ

Controller phù hợp để đóng gói input, trạng thái, kết quả, lỗi và việc hủy của
tác vụ bất đồng bộ. Lit cung cấp controller `Task` trong package `@lit/task`:

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

| API | Ý nghĩa |
|---|---|
| `args: () => [...]` | Đọc input từ host; task chạy lại khi mảng args đổi (so sánh nông từng phần tử) |
| `task([args], {signal})` | Hàm async thực hiện công việc; `signal` là `AbortSignal` |
| `status` | `TaskStatus.INITIAL`, `PENDING`, `COMPLETE` hoặc `ERROR` |
| `value`, `error` | Kết quả hoặc lỗi của lần chạy gần nhất |
| `render({initial, pending, complete, error})` | Chọn template theo `status` |
| `autoRun` | `true` (mặc định): chạy trong `hostUpdate()`; `'afterUpdate'`: chạy trong `hostUpdated()`; `false`: chỉ chạy khi gọi `run()` |
| `run(args?)`, `abort(reason?)` | Chạy thủ công, hủy lần chạy đang chờ |
| `taskComplete` | Promise của lần chạy hiện tại |
| `initialState` | Giá trị task trả về để quay lại trạng thái `INITIAL` |

Khi lần chạy mới bắt đầu trong lúc lần trước còn `PENDING`, `Task` gọi `abort()`
trên `AbortController` của lần trước và bỏ qua kết quả cũ. `AbortSignal` chỉ là
tín hiệu; công việc chỉ dừng khi signal được chuyển cho API hỗ trợ (như
`fetch()`) hoặc được kiểm tra bằng `signal.throwIfAborted()` sau mỗi `await`.

Với `autoRun: true`, `run()` gọi `host.requestUpdate()` bên trong
`hostUpdate()`. Host đang trong lượt cập nhật nên lời gọi này không tạo lượt
mới; template của lượt hiện tại hiển thị trạng thái `PENDING`. Khi task hoàn
tất, `Task` gọi `requestUpdate()` một lần nữa để hiển thị kết quả.

Demo có `SearchController`, một bản rút gọn của cơ chế trên:

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
    const value = await this.task(args, {signal: this.abortController.signal});
    if (runId !== this.runId) return;   // kết quả của lần chạy cũ
    this.value = value;
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

### 6.11. Sử dụng controller trong Polymer

`PolymerElement` không có `addController()` và `requestUpdate()`, nên không dùng
trực tiếp được ReactiveController. Có thể bổ sung bốn API của host bằng một
mixin. Đây là giải pháp tự cài đặt, không phải tính năng của Polymer.

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
      super.connectedCallback();          // ready() lần đầu chạy tại đây
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
        this._hostRevision += 1;          // binding chạy lại đồng bộ
        this.__controllers.forEach((c) => c.hostUpdated?.());
        return true;
      });
    }

    get updateComplete() {
      return this.__updatePromise;
    }
  });
```

Polymer không có `render()`; binding chỉ chạy lại khi property thay đổi. Mixin
tăng property `_hostRevision` sau mỗi lượt cập nhật, và binding đọc state của
controller phải phụ thuộc property này:

```js
class PolymerClock extends ControllerHostMixin(PolymerElement) {
  static get template() {
    return html`<p>[[formatTime_(_hostRevision)]]</p>`;
  }

  constructor() {
    super();
    this.clock = new ClockController(this, 1000);
  }

  formatTime_() {
    return this.clock.value.toLocaleTimeString('vi-VN');
  }
}
```

Giới hạn so với Lit:

- `changedProperties` của Polymer không chứa state của controller;
- `hostUpdate()` không đảm bảo chạy trước mọi thay đổi DOM, vì binding của
  Polymer chạy ngay khi bất kỳ property nào thay đổi.

Dự án cần dùng nhiều controller nên cân nhắc chuyển component sang Lit (mục 8).

Demo: [`demo/index.html#reactive-controller`](demo/index.html#reactive-controller).

## 7. Lựa chọn giữa mixin và controller

Tài liệu Lit khuyến nghị đóng gói chức năng thành controller, trừ khi chức
năng cần:

- thêm public API trực tiếp lên component;
- can thiệp vào lifecycle của component ở mức chi tiết.

So sánh theo từng nhu cầu:

| Nhu cầu của element | Mixin | Controller |
|---|---|---|
| Đọc state | `this.opened` | `this.toggle.opened` |
| Đổi giá trị mặc định | Gán trong constructor sau `super()` | Truyền option khi tạo controller |
| Đổi cấu hình property | Khai báo lại đầy đủ option (Lit) hoặc chỉ option cần đổi (Polymer) | Truyền option khác khi tạo |
| Nhận biết state đổi | `changedProperties.has('opened')` | Controller gọi `requestUpdate('toggle.opened', old)` |
| Object và array | Method của mixin gán tham chiếu mới | Method của controller gán tham chiếu mới và gọi `requestUpdate()` |
| Event | Mất nếu element override thiếu `super` | Callback hoặc `host.dispatchEvent`; không bị ảnh hưởng bởi override |
| Style | `static styles` được kế thừa; element phải giữ style của lớp cha | Element tự thêm `CSSResult` |
| Public API | Có sẵn trên element | Element tự công khai qua getter, method |
| Nhiều instance | Không | Có |
| Can thiệp sâu lifecycle | Có (`shouldUpdate`, vị trí `super`) | Không |
| Hook element phải gọi `super` | Mọi hook mixin override | `connectedCallback`, `disconnectedCallback` |

Tiêu chí tổng quát:

| Nhu cầu | Lựa chọn |
|---|---|
| Chỉ tính toán, không có state và lifecycle | Function hoặc module |
| State và lifecycle dùng nội bộ trong element | ReactiveController |
| Nhiều instance hoặc cấu hình khi khởi tạo | ReactiveController |
| Thêm API trực tiếp lên element, phối hợp bằng `super` | Mixin |
| Chỉ tái sử dụng style | `CSSResult` hoặc CSS custom property |
| Component Polymer | Mixin (hoặc `ControllerHostMixin`, mục 6.11) |

Element vẫn có thể công khai method gọi vào controller, nên nhu cầu có public
method không bắt buộc phải dùng mixin.

## 8. Chuyển từ Polymer sang Lit

### 8.1. API tương ứng

| Polymer | Lit hoặc Web API | Ghi chú |
|---|---|---|
| `static get properties()` | `static properties` hoặc `@property` | Lit kế thừa property qua class chain |
| `value` | Gán trong constructor | Object/array phải tạo mới cho mỗi instance |
| `reflectToAttribute: true` | `reflect: true` | |
| `readOnly: true` | Private property và public getter | Không có option tương đương |
| `notify: true` | `dispatchEvent()` | Không có two-way binding tự động |
| `computed` | Getter hoặc `willUpdate()` | Getter phù hợp với phép tính nhẹ |
| `observer` | `willUpdate()` hoặc `updated()` | Chọn theo nhu cầu đọc DOM mới |
| `[[value]]` | `${this.value}` | Expression là JavaScript |
| `{{value}}` | Property và event một chiều | |
| `on-click="handle"` | `@click=${this.handle}` | |
| `hidden$="[[!opened]]"` | `?hidden=${!this.opened}` | Boolean attribute binding |
| `dom-if` | Biểu thức điều kiện hoặc `when()` | |
| `dom-repeat` | `map()` hoặc `repeat()` | `repeat()` dùng khi cần key ổn định |
| `this.$.button` | `renderRoot.querySelector()` hoặc `@query` | Chỉ đọc sau render |
| `this.set('a.b', value)` | `this.a = {...this.a, b: value}` | Gán tham chiếu mới |
| `push()`/`splice()` | Gán array mới | `[...items, item]` |
| `notifyPath()` | Gán object/array mới | `requestUpdate()` chỉ khi cần |
| `setProperties({...})` | Gán liên tiếp | Lit tự gom trong cùng microtask |
| `afterNextRender()` | `updateComplete`, sau đó `requestAnimationFrame()` nếu cần chờ paint | Không hoàn toàn tương đương |
| Polymer CSS mixin | CSS custom property | Không dùng `@apply` |

### 8.2. Thay thế `ready()`

Lit không có `ready()`. Vị trí thay thế phụ thuộc công việc bên trong:

| Công việc trong `ready()` | Vị trí trong Lit |
|---|---|
| Gán giá trị không cần DOM | `constructor()` |
| Đăng ký listener trên `window` hoặc `document` | `connectedCallback()` và `disconnectedCallback()` |
| Chuẩn bị dữ liệu trước render | Getter hoặc `willUpdate()` |
| Truy cập DOM sau lần render đầu | `firstUpdated()` |
| Phản ứng sau mọi lần render | `updated()` |
| Đọc DOM ngay sau khi đổi property | `await this.updateComplete` |

```js
// Polymer
ready() {
  super.ready();
  this.$.input.focus();
}

// Lit
firstUpdated(changedProperties) {
  super.firstUpdated?.(changedProperties);
  this.renderRoot.querySelector('input')?.focus();
}
```

Code phụ thuộc light DOM children cần theo dõi `slotchange`, vì children có thể
thay đổi sau lần render đầu.

### 8.3. Thay thế observer

```js
// Polymer
openedChanged_(opened) {
  this.updateSomething(opened);
}

// Lit, không cần DOM mới
willUpdate(changedProperties) {
  if (changedProperties.has('opened')) {
    this.updateSomething(this.opened);
  }
}

// Lit, cần DOM đã render
updated(changedProperties) {
  if (changedProperties.has('opened')) {
    this.measureRenderedContent();
  }
}
```

Logic chỉ phát sinh từ một thao tác người dùng nên đặt trực tiếp trong event
handler.

### 8.4. Quy trình chuyển một mixin

1. Liệt kê property, giá trị mặc định và attribute.
2. Liệt kê method công khai và event đang được sử dụng.
3. Xác định computed, observer và lifecycle.
4. Tìm listener, timer, observer và subscription cần giải phóng.
5. Quyết định giữ dạng mixin hay chuyển thành controller (mục 7).
6. Chuyển khai báo property sang Lit.
7. Thay path mutation bằng gán object hoặc array mới.
8. Chuyển `ready()` theo công việc thực tế (mục 8.2).
9. Kiểm tra mọi đoạn đọc DOM ngay sau khi gán property.
10. Thiết kế lại event thay vì chuyển `notify` một cách máy móc.
11. Kiểm tra `super`, kế thừa style và mixin áp dụng lặp.
12. Viết test cho connect, disconnect, thời điểm cập nhật và event.

## 9. Các lỗi thường gặp

| Lỗi | Hậu quả | Cách xử lý |
|---|---|---|
| Không gọi `super.connectedCallback()` | Lit không cập nhật; controller và mixin không nhận lifecycle | Luôn gọi `super` |
| Không gọi `super.ready()` (Polymer) | Template không được tạo; `ready()` của mixin không chạy | Gọi `super.ready()` ở dòng đầu |
| Không giải phóng listener bên ngoài | Element bị giữ trong bộ nhớ, handler vẫn chạy | Dùng cặp connect/disconnect |
| Hai mixin trùng method hoặc property | Mixin áp dụng sau che mixin trước | Đặt tên riêng, dùng `super` |
| Áp dụng cùng mixin nhiều lần | Lifecycle và listener chạy lặp | `dedupingMixin` hoặc sửa chain |
| Đưa tag name vào mixin | Mixin gắn chặt với một element | Element sở hữu tag name |
| Khai báo lại property của mixin Lit thiếu option | Mất `type`, `reflect` | Khai báo đầy đủ hoặc dùng option do mixin export |
| Dùng class field cho reactive property | Accessor bị che, không có cập nhật | Gán trong constructor |
| Element Lit khai báo `static styles` | Mất style của mixin | Giữ style của lớp cha trong mảng |
| Mutate object/array | Không có cập nhật, observer không chạy | Gán tham chiếu mới hoặc dùng API của Polymer |
| Đọc DOM ngay sau khi gán property Lit | Đọc DOM của lượt render cũ | Chờ `updateComplete` |
| Gán property vô điều kiện trong `updated()` | Vòng lặp cập nhật | Thêm điều kiện hoặc dùng `willUpdate()` |
| Controller đổi state không gọi `requestUpdate()` | Template không cập nhật | Gọi `host.requestUpdate()` |
| Controller tạo listener trong constructor | Listener tồn tại sai vòng đời | Dùng `hostConnected()`/`hostDisconnected()` |
| Chờ `hostDisconnected()` sau `removeController()` | Tài nguyên không được giải phóng | Giải phóng ngay sau `removeController()` |
| Tác vụ bất đồng bộ không hủy khi input đổi | Kết quả cũ ghi đè kết quả mới | Dùng `AbortSignal`, bỏ qua kết quả cũ |
| Chuyển mọi `notify` thành event | Giữ API không còn nơi sử dụng | Kiểm tra nơi sử dụng trước |

## 10. Demo và kiểm chứng

### 10.1. Chạy demo

```bash
cd mixin/demo
python3 -m http.server 8000
```

Trang [`demo/index.html`](demo/index.html) gồm bốn phần theo đúng trình tự tài
liệu:

| Phần | Nội dung | Mục |
|---|---|---|
| [`#javascript-mixin`](demo/index.html#javascript-mixin) | Prototype chain và thứ tự `super` | 1 |
| [`#polymer-mixin`](demo/index.html#polymer-mixin) | Property effect, event, lifecycle Polymer; `ControllerHostMixin` | 3, 6.11 |
| [`#lit-controller`](demo/index.html#lit-controller) | Mixin Lit, controller cơ bản, thứ tự cập nhật | 5, 6.3 |
| [`#reactive-controller`](demo/index.html#reactive-controller) | Controller ghép, tác vụ bất đồng bộ, gắn/gỡ controller | 6.8–6.10 |

### 10.2. Cấu trúc thư mục

```text
demo/
  index.html                         cấu trúc trang
  styles.css                         giao diện
  main.js                            nối nút điều khiển với component, hiển thị log

  mixins/
    javascript-openable-mixin.js     mixin JavaScript
    logging-mixin.js                 chuỗi gọi super
    polymer-openable-mixin.js        property và lifecycle Polymer
    polymer-controller-host-mixin.js API host của controller cho Polymer
    lit-openable-mixin.js            reactive property và lifecycle Lit

  components/
    basic-panel.js                   custom element JavaScript
    polymer-panel.js                 element Polymer dùng mixin
    polymer-clock.js                 element Polymer dùng ClockController
    lit-panel.js                     element Lit dùng mixin và controller
    controller-lab.js                element Lit dùng nhiều controller

  controllers/
    counter-controller.js            controller cơ bản
    clock-controller.js              timer và giải phóng khi disconnect
    dual-clock-controller.js         controller ghép
    search-controller.js             tác vụ bất đồng bộ có hủy
    probe-controller.js              addController/removeController khi đang chạy

  data/
    fruit-api.js                     API giả lập có độ trễ và AbortSignal

test/
  setup-dom.js                       môi trường DOM (happy-dom)
  runtime.test.js                    hành vi của các component demo
  mixin-interaction.test.js          element dùng lại và thay đổi mixin
  controller-interaction.test.js     element dùng lại và cấu hình controller
  polymer-controller-host.test.js    Polymer internals và ControllerHostMixin
```

Ba file `*-openable-mixin.js` cùng export tên `OpenableMixin` như trong tài
liệu; tiền tố trong tên file dùng để phân biệt trên trang demo.

### 10.3. Test

```bash
cd mixin
npm install
npm test
```

Test chạy trực tiếp mã nguồn trong `demo/` và các ví dụ trong tài liệu:

| File | Nội dung kiểm chứng | Mục |
|---|---|---|
| `runtime.test.js` | Prototype chain, `super`; property effect và lifecycle Polymer; chu trình cập nhật Lit; thứ tự hook controller; controller ghép; tác vụ bất đồng bộ; `addController`/`removeController` | 1, 3, 4, 6 |
| `mixin-interaction.test.js` | Polymer: khai báo lại `value`, observer của element, `push()`, thiếu `super.ready()`. Lit: đổi default, class field, khai báo lại property, mutate mảng, `static styles`, thiếu `super`, `changedProperties` | 3, 5 |
| `controller-interaction.test.js` | Cấu hình controller, `requestUpdate(name, old)`, array, callback và event, style, public API, thiếu `super`, thứ tự hook nhiều controller | 6.3–6.7 |
| `polymer-controller-host.test.js` | Chuỗi mixin của `PolymerElement`, thiếu API host, `ControllerHostMixin` | 3.1, 4.2, 6.11 |

### 10.4. Vị trí chỉnh sửa

| Nội dung | File |
|---|---|
| Method, trạng thái của mixin JavaScript | `mixins/javascript-openable-mixin.js` |
| Thứ tự gọi `super` | `mixins/logging-mixin.js` |
| Property, observer, lifecycle Polymer | `mixins/polymer-openable-mixin.js` |
| Template Polymer | `components/polymer-panel.js` |
| Controller trong Polymer | `mixins/polymer-controller-host-mixin.js`, `components/polymer-clock.js` |
| Reactive property, lifecycle Lit | `mixins/lit-openable-mixin.js` |
| Template Lit | `components/lit-panel.js` |
| Controller cơ bản | `controllers/counter-controller.js` |
| Timer, controller ghép | `controllers/clock-controller.js`, `controllers/dual-clock-controller.js` |
| Tác vụ bất đồng bộ | `controllers/search-controller.js`, `data/fruit-api.js` |
| Element dùng nhiều controller | `components/controller-lab.js` |
| Nút điều khiển | `main.js`, `index.html` |
| Giao diện | `styles.css` |

## 11. Tài liệu tham khảo

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

- [Components overview](https://lit.dev/docs/components/overview/)
- [Reactive properties](https://lit.dev/docs/components/properties/)
- [Lifecycle và reactive update cycle](https://lit.dev/docs/components/lifecycle/)
- [Styles](https://lit.dev/docs/components/styles/)
- [Events](https://lit.dev/docs/components/events/)
- [Class mixins](https://lit.dev/docs/composition/mixins/)
- [Controllers và mixins](https://lit.dev/docs/composition/overview/)
- [Reactive controllers](https://lit.dev/docs/composition/controllers/)
- [API `ReactiveElement`](https://lit.dev/docs/api/ReactiveElement/)
- [API `ReactiveController` và `ReactiveControllerHost`](https://lit.dev/docs/api/controllers/)
- [Source `ReactiveElement`](https://github.com/lit/lit/blob/main/packages/reactive-element/src/reactive-element.ts)
- [`@lit/task`](https://lit.dev/docs/data/task/)
- [Lit for Polymer users](https://lit.dev/articles/lit-for-polymer-users/)
