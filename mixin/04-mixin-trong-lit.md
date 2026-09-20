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

### Mô hình composition

`ReactiveController` là object được host sở hữu. Host đăng ký controller bằng `addController()`, sau đó gọi lifecycle callback của controller trong vòng đời của host.

```text
LitElement (host)
  ├── controller A: theo dõi media query
  ├── controller B: xử lý click bên ngoài
  └── controller C: quản lý tác vụ bất đồng bộ
```

Controller không được chèn vào prototype chain. State và method của controller không tự trở thành API công khai của element. Host chỉ công khai API khi chủ động giữ controller ở một field không-private hoặc ủy quyền một method của controller.

| Mô hình | Quan hệ | Hệ quả |
|---|---|---|
| Class mixin | Element **là một** lớp đã được mở rộng | API mixin nằm trên element; có thể ghi đè method và dùng `super` |
| ReactiveController | Element **sở hữu một** controller | API được tách namespace; có thể tạo nhiều instance controller |

### Contract giữa controller và host

`ReactiveControllerHost` cung cấp một API tối thiểu:

| API | Mục đích |
|---|---|
| `addController(controller)` | Đăng ký controller vào lifecycle của host |
| `removeController(controller)` | Gỡ controller khỏi host khi không còn sử dụng |
| `requestUpdate()` | Yêu cầu host chạy một reactive update |
| `updateComplete` | Promise hoàn tất update gần nhất của host |

`LitElement` và `ReactiveElement` đều là controller host. Controller cũng có thể dùng với host khác nếu host triển khai contract này; không bắt buộc controller phải gắn cứng với `LitElement`.

Mẫu TypeScript tối thiểu:

```ts
import type {ReactiveController, ReactiveControllerHost} from 'lit';

export class FeatureController implements ReactiveController {
  constructor(protected readonly host: ReactiveControllerHost) {
    host.addController(this);
  }
}
```

Constructor nên nhận các cấu hình không đổi của feature, chẳng hạn chu kỳ timer, tên media query hoặc callback. Những input thay đổi theo thời gian nên được cung cấp qua method/property riêng của controller hoặc qua một interface hẹp của host.

### Lifecycle callback

Toàn bộ callback là tùy chọn. Lit gọi callback của controller trước callback tương ứng của host.

| Callback | Vị trí trong lifecycle | Công việc phù hợp |
|---|---|---|
| `hostConnected()` | Host đã được kết nối; `renderRoot` đã tồn tại | Đăng ký global event, observer, subscription |
| `hostUpdate()` | Trước `host.update()` và `render()` | Đọc DOM trước khi patch; chuẩn bị animation |
| `hostUpdated()` | Sau khi DOM được cập nhật, trước `firstUpdated()`/`updated()` của host | Đọc DOM mới; đồng bộ animation sau render |
| `hostDisconnected()` | Host bị gỡ khỏi document | Gỡ listener, observer, timer, subscription |

`hostConnected()` và `hostDisconnected()` có thể chạy nhiều lần vì custom element có thể bị gỡ rồi gắn lại. Mỗi tài nguyên tạo ở `hostConnected()` phải có thao tác giải phóng tương ứng ở `hostDisconnected()`.

### State của controller và render của host

State của controller là state JavaScript thông thường, không phải reactive property của Lit. Khi state đó thay đổi và template của host đọc state này, controller phải gọi `host.requestUpdate()`.

Ví dụ dưới đây đóng gói `MediaQueryList` cùng state `matches`. Controller không yêu cầu host có property hay lifecycle callback riêng.

```ts
import type {ReactiveController, ReactiveControllerHost} from 'lit';

export class MediaQueryController implements ReactiveController {
  matches = false;
  private media_: MediaQueryList|undefined;
  private listener_: ((event: MediaQueryListEvent) => void)|undefined;

  constructor(
      private readonly host: ReactiveControllerHost,
      private readonly query: string) {
    host.addController(this);
  }

  hostConnected() {
    this.media_ = window.matchMedia(this.query);
    this.matches = this.media_.matches;
    this.listener_ = (event) => {
      this.matches = event.matches;
      this.host.requestUpdate();
    };
    this.media_.addEventListener('change', this.listener_);
    this.host.requestUpdate();
  }

  hostDisconnected() {
    if (this.media_ && this.listener_) {
      this.media_.removeEventListener('change', this.listener_);
    }
    this.media_ = undefined;
    this.listener_ = undefined;
  }
}
```

Host sử dụng controller bằng cách lưu instance và đọc API của controller trong `render()`:

```ts
import {LitElement, html} from 'lit';

class AdaptiveNav extends LitElement {
  private readonly compact_ = new MediaQueryController(
      this, '(max-width: 700px)');

  render() {
    return html`
      <nav class=${this.compact_.matches ? 'compact' : 'wide'}>
        <slot></slot>
      </nav>`;
  }
}
```

`requestUpdate()` chỉ yêu cầu Lit lập lịch render; nó không biến field của controller thành reactive property, không phản chiếu attribute và không tạo event. Những hợp đồng đó vẫn thuộc về host hoặc API công khai của component.

### Controller quản lý side effect

Controller phù hợp với các side effect gắn với vòng đời host. Ví dụ click bên ngoài element:

```ts
import type {ReactiveController, ReactiveControllerHost} from 'lit';

export class ClickOutsideController implements ReactiveController {
  private listener_: ((event: MouseEvent) => void)|undefined;

  constructor(
      private readonly host: ReactiveControllerHost & EventTarget,
      private readonly onOutsideClick: () => void) {
    host.addController(this);
  }

  hostConnected() {
    this.listener_ = (event) => {
      if (!event.composedPath().includes(this.host)) {
        this.onOutsideClick();
      }
    };
    document.addEventListener('click', this.listener_);
  }

  hostDisconnected() {
    if (this.listener_) {
      document.removeEventListener('click', this.listener_);
      this.listener_ = undefined;
    }
  }
}
```

Controller không quyết định API công khai của panel. Host có thể kết hợp controller với mixin hoặc tự triển khai API:

```ts
class MyPanel extends OpenableMixin(LitElement) {
  private readonly clickOutside_ = new ClickOutsideController(
      this, () => this.close());
}
```

`OpenableMixin` cung cấp `open()`, `close()` và `toggle()` trên element. `ClickOutsideController` chỉ quản lý listener. Việc tách hai trách nhiệm này tránh đưa method nội bộ vào prototype chain.

### Nhiều controller và composition giữa controller

Một host có thể chứa nhiều instance của cùng một controller:

```ts
class DashboardElement extends LitElement {
  private readonly narrowLayout_ = new MediaQueryController(
      this, '(max-width: 700px)');
  private readonly reducedMotion_ = new MediaQueryController(
      this, '(prefers-reduced-motion: reduce)');
}
```

Mỗi instance có state và lifecycle riêng. Không nên dùng thứ tự đăng ký controller làm contract nghiệp vụ giữa các controller. Nếu controller B cần dữ liệu từ controller A, có hai cách rõ ràng hơn:

1. Host đọc state của A rồi truyền input rõ ràng cho B.
2. Một controller điều phối tạo các controller con và công khai API tổng hợp.

Controller con đăng ký trực tiếp với cùng host bằng cách nhận lại host trong constructor. Khi feature bị vô hiệu hóa vĩnh viễn hoặc controller được thay thế trong thời gian sống của host, gọi `host.removeController(controller)` và tự giải phóng tài nguyên đang giữ.

### Đồng bộ với DOM và `updateComplete`

`hostUpdated()` là điểm phù hợp cho controller cần đọc DOM sau khi Lit patch template. Nếu controller chủ động yêu cầu update rồi cần chờ render hoàn tất, có thể chờ `host.updateComplete`:

```ts
async refreshLayout() {
  this.host.requestUpdate();
  await this.host.updateComplete;
  // Đọc DOM sau update nếu contract của controller yêu cầu.
}
```

Controller không nên truy cập `shadowRoot` hoặc selector của host trừ khi controller được thiết kế riêng cho loại host đó. Controller tổng quát chỉ nên phụ thuộc vào `ReactiveControllerHost`; controller phụ thuộc DOM cần khai báo rõ interface host bổ sung mà nó yêu cầu.

### Kiểm thử controller

Controller có thể kiểm thử độc lập với `LitElement` bằng host giả. Host giả cần lưu controller, đếm `requestUpdate()` và chủ động gọi lifecycle callback trong test.

```ts
import type {ReactiveController, ReactiveControllerHost} from 'lit';

class TestHost implements ReactiveControllerHost {
  readonly controllers: ReactiveController[] = [];
  updateRequests = 0;
  readonly updateComplete = Promise.resolve(true);

  addController(controller: ReactiveController) {
    this.controllers.push(controller);
  }

  removeController(controller: ReactiveController) {
    const index = this.controllers.indexOf(controller);
    if (index !== -1) this.controllers.splice(index, 1);
  }

  requestUpdate() {
    this.updateRequests++;
  }

  connect() {
    this.controllers.forEach((controller) => controller.hostConnected?.());
  }

  disconnect() {
    this.controllers.forEach((controller) => controller.hostDisconnected?.());
  }
}
```

Các case tối thiểu:

- Controller đăng ký vào host khi khởi tạo.
- `hostConnected()` chỉ tạo một subscription cho mỗi lần connect.
- `hostDisconnected()` gỡ đúng subscription hoặc timer.
- Input bên ngoài thay đổi state và gọi `requestUpdate()` đúng một lần.
- `removeController()` ngăn host gọi callback ở vòng lifecycle sau.

### Lỗi thiết kế thường gặp

| Lỗi | Hậu quả | Cách xử lý |
|---|---|---|
| Không gọi `host.addController(this)` | Không nhận lifecycle callback | Đăng ký trong constructor hoặc factory |
| Đổi state nhưng không gọi `host.requestUpdate()` | Template không render lại | Gọi `requestUpdate()` khi state controller xuất hiện trong template |
| Đăng ký listener trong constructor | Listener tồn tại cả khi host chưa connect hoặc đã disconnect | Đăng ký/gỡ ở `hostConnected()` và `hostDisconnected()` |
| Đổi state vô điều kiện trong `hostUpdated()` | Có thể tạo chu kỳ update lặp | Chỉ thay state khi có điều kiện dừng rõ ràng |
| Controller biết quá nhiều về host | Khó tái sử dụng và khó test | Dùng `ReactiveControllerHost` hoặc interface hẹp |
| Dùng thứ tự callback giữa controller làm contract | Phụ thuộc ẩn, dễ vỡ khi refactor | Truyền input/dependency tường minh |

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
