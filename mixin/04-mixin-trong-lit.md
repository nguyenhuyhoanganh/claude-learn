# Mixin trong Lit và ReactiveController

## Phạm vi

Phần này mô tả cách mixin hoạt động với reactive property và update cycle của Lit, đồng thời phân biệt class mixin với `ReactiveController`.

## Mixin vẫn là JavaScript

`LitElement` là một class. Vì vậy, cơ chế mixin không thay đổi:

```js
const OpenableMixin = (Base) => class extends Base {
  open() { this.opened = true; }
  close() { this.opened = false; }
  toggle() { this.opened = !this.opened; }
};

class MyPanel extends OpenableMixin(LitElement) {}
```

Mixin vẫn tạo một lớp trong prototype chain, method vẫn được tìm từ lớp gần nhất và `super` vẫn hoạt động như trong bài 2. Sự khác biệt nằm ở reactive property, lifecycle update và template của Lit.

## Khai báo property trong mixin

```js
import {LitElement, html} from 'lit';

const OpenableMixin = (Base) => class extends Base {
  static properties = {
    opened: {type: Boolean, reflect: true},
  };

  constructor() {
    super();
    this.opened = false;
  }

  get label() {
    return this.opened ? 'Đang mở' : 'Đang đóng';
  }

  open() { this.opened = true; }
  close() { this.opened = false; }
  toggle() { this.opened = !this.opened; }
};

class MyPanel extends OpenableMixin(LitElement) {
  static properties = {
    title: {type: String},
  };

  constructor() {
    super();
    this.title = 'Panel';
  }

  render() {
    return html`
      <h3 @click=${() => this.toggle()}>${this.title} — ${this.label}</h3>
      ${this.opened ? html`<slot></slot>` : ''}
    `;
  }
}
```

Lit kế thừa cấu hình reactive property của lớp cha, nên `MyPanel` có cả `opened` và `title`. `reflect: true` phản chiếu `opened` ra attribute, vì vậy CSS có thể dùng `:host([opened])`.

Lit không có cấu hình `value` như Polymer. Với property được khai báo bằng `static properties`, hãy khởi tạo giá trị mặc định trong constructor sau `super()`. Không dùng class field thông thường cho property reactive trong JavaScript thuần vì nó có thể che accessor mà Lit tạo trên prototype. Với decorator hoặc auto-accessor được cấu hình đúng, quy tắc này có ngoại lệ; hãy theo cấu hình TypeScript/Babel của dự án.

## Update cycle của Lit

Khi một reactive property thay đổi, Lit không render ngay trong lệnh gán. Nó đặt một update vào microtask, gom các thay đổi xảy ra trước lúc update bắt đầu, sau đó chạy chu kỳ:

```text
property thay đổi
  → shouldUpdate(changedProperties)
  → willUpdate(changedProperties)
  → update() / render()
  → firstUpdated()  (chỉ lần đầu)
  → updated(changedProperties)
  → updateComplete được resolve
```

Do đó, nếu cần đọc DOM vừa được render sau khi đổi property, hãy chờ `updateComplete`:

```js
async openAndFocus() {
  this.open();
  await this.updateComplete;
  this.renderRoot.querySelector('button')?.focus();
}
```

Đừng diễn giải điều này thành “mọi thứ Polymer đều đồng bộ, mọi DOM Lit đều bất đồng bộ”. Polymer xử lý data flow của thay đổi quan sát được theo cách đồng bộ, nhưng một số template helper vẫn có lịch render riêng. Khi chuyển mã, cần kiểm tra đúng element và đúng thao tác DOM đang dùng.

## Lifecycle hook và mục đích sử dụng

| Hook | Mục đích phù hợp |
|---|---|
| `connectedCallback()` | Kết nối tài nguyên theo vòng đời DOM, như listener trên `document` |
| `disconnectedCallback()` | Gỡ tài nguyên đã tạo lúc connect |
| `willUpdate(changed)` | Tính dữ liệu dẫn xuất cần dùng trong lần render sắp tới |
| `firstUpdated(changed)` | Thao tác DOM sau lần render đầu tiên |
| `updated(changed)` | Phản ứng với DOM đã được cập nhật |

Nếu ghi đè lifecycle chuẩn của custom element như `connectedCallback()`, phải gọi `super.connectedCallback()` để giữ hoạt động của Lit. Khi ghi đè reactive lifecycle như `updated()`, nên gọi implementation của lớp cha nếu có để các mixin/lớp khác trong chain vẫn nhận được callback:

```js
updated(changed) {
  super.updated?.(changed);
  if (changed.has('opened')) {
    this.dispatchEvent(new CustomEvent('opened-changed', {
      detail: {value: this.opened},
    }));
  }
}
```

Gán reactive property trong `willUpdate()` không tạo một update mới; đây là vị trí phù hợp để chuẩn bị dữ liệu cho cùng lần render. Ngược lại, gán property trong `updated()` sẽ tạo một chu kỳ update tiếp theo. Việc thay state trong `updated()` cần có điều kiện dừng rõ ràng.

## Deduping trong Lit

Lit không cung cấp `dedupingMixin` như Polymer. Nếu cùng một mixin có thể xuất hiện hai lần qua kế thừa hoặc qua mixin khác, hãy thiết kế một helper dedupe và kiểm thử chuỗi đó.

```js
function dedupeMixin(mixin) {
  const cache = new WeakMap();
  const marker = Symbol('applied');

  return (Base) => {
    if (Base[marker]) return Base;
    if (cache.has(Base)) return cache.get(Base);

    const Result = mixin(Base);
    Object.defineProperty(Result, marker, {value: true});
    cache.set(Base, Result);
    return Result;
  };
}
```

Không phải mọi mixin Lit đều cần helper này. Nếu mixin chỉ được áp dụng trực tiếp một lần và không được dùng bởi mixin khác, việc thêm một cơ chế dedupe có thể không mang lại lợi ích. Điều quan trọng là nhận diện đúng đường kế thừa.

## ReactiveController

ReactiveController là object được host đăng ký bằng `host.addController(this)`. Controller có thể nhận các callback sau:

| Callback | Thời điểm |
|---|---|
| `hostConnected()` | Host được kết nối vào document |
| `hostDisconnected()` | Host bị gỡ khỏi document |
| `hostUpdate()` | Trước khi host update |
| `hostUpdated()` | Sau khi host update |

Ví dụ controller xử lý click bên ngoài element:

```js
class ClickOutsideController {
  constructor(host, onOutsideClick) {
    this.host = host;
    this.onOutsideClick = onOutsideClick;
    host.addController(this);
  }

  hostConnected() {
    this.listener = (event) => {
      if (!event.composedPath().includes(this.host)) {
        this.onOutsideClick();
      }
    };
    document.addEventListener('click', this.listener);
  }

  hostDisconnected() {
    document.removeEventListener('click', this.listener);
  }
}

class MyPanel extends OpenableMixin(LitElement) {
  constructor() {
    super();
    this.clickOutside = new ClickOutsideController(this, () => this.close());
  }
}
```

`OpenableMixin` thêm API công khai `open()`, `close()` và `toggle()` lên element. `ClickOutsideController` chỉ quản lý một mối quan tâm nội bộ và gọi callback. Hai phần có trách nhiệm khác nhau.

Một controller có thể có nhiều instance trong cùng một host. Nếu controller tự thay đổi state của nó và host cần render lại, controller gọi `host.requestUpdate()`.

## Tiêu chí lựa chọn

Theo hướng dẫn Lit, mặc định hãy ưu tiên controller, trừ khi tính năng cần một trong hai điều sau:

- thêm API công khai vào chính component; hoặc
- kiểm soát rất chi tiết vị trí thực thi trong lifecycle chain.

| Điều kiện | Lựa chọn thường phù hợp |
|---|---|
| Cần `element.open()` hoặc property công khai `element.opened`? | Mixin hoặc API do host tự bọc controller |
| Chỉ cần listener, timer, observer, state nội bộ? | ReactiveController |
| Cần nhiều instance độc lập trong một element? | ReactiveController |
| Cần ghi đè method/lifecycle của lớp cha theo thứ tự `super`? | Mixin |
| Chỉ có logic tính toán không giữ state? | Hàm thuần |

Controller không cấm host tạo API công khai; host vẫn có thể ủy quyền cho controller. Điểm khác là API đó được thiết kế rõ ràng thay vì tự động xuất hiện trong prototype chain.

## Quy tắc chính

- Mixin Lit vẫn là class mixin JavaScript; cơ chế `super` không thay đổi.
- Reactive property của lớp cha được kế thừa; mặc định nên gán trong constructor.
- Lit gom update theo microtask; dùng `await updateComplete` khi cần DOM sau render.
- Tính dữ liệu cho render ở `willUpdate`; cẩn trọng khi thay state trong `updated`.
- Ưu tiên ReactiveController cho logic nội bộ; dùng mixin khi cần API công khai hoặc kiểm soát chain.
