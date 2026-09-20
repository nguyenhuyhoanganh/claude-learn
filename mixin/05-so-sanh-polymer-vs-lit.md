# Chuyển mixin từ Polymer sang Lit

## Phạm vi

Phần này cung cấp bản đồ chuyển đổi và danh sách kiểm tra cho mixin Polymer có property, observer, computed property và lifecycle callback.

## Các phần giữ nguyên và thay đổi

Mixin vẫn là class mixin của JavaScript ở cả hai framework. Những phần sau giữ nguyên:

- biểu thức `(Base) => class extends Base`;
- prototype chain và quy tắc tìm method;
- `super` khi một mixin mở rộng method của mixin khác;
- constructor chạy từ lớp cơ sở đến lớp cuối.

Phần cần xem lại là cách framework quản lý property, template, lifecycle và thời điểm DOM được cập nhật.

| Nhu cầu | Polymer | Lit |
|---|---|---|
| Khai báo property | `static get properties()` | `static properties` hoặc decorator |
| Giá trị mặc định | `value: ...` | Gán trong constructor hoặc auto-accessor/decorator phù hợp |
| Phản chiếu attribute | `reflectToAttribute: true` | `reflect: true` |
| Giá trị dẫn xuất | `computed: 'method_(a)'` | Getter hoặc tính trong `willUpdate()` |
| Theo dõi property | `observer` / `observers` | `willUpdate(changed)` hoặc `updated(changed)` |
| Sự kiện notify | `notify: true` | Tự `dispatchEvent()` nếu API cần sự kiện |
| Khởi tạo một lần | `ready()` | Chọn `connectedCallback()` hoặc `firstUpdated()` theo mục đích |
| Chờ DOM mới | Tùy template helper | `await updateComplete` |
| Deduping | `dedupingMixin` có sẵn | Tự thiết kế nếu chuỗi có thể lặp mixin |

## Ví dụ chuyển đổi

### Bản Polymer

```js
import {dedupingMixin} from '@polymer/polymer/lib/utils/mixin.js';

export const OpenableMixin = dedupingMixin((Base) => {
  class OpenableMixinImpl extends Base {
    static get properties() {
      return {
        opened: {
          type: Boolean,
          value: false,
          reflectToAttribute: true,
          observer: 'openedChanged_',
        },
        label: {type: String, computed: 'computeLabel_(opened)'},
      };
    }

    open() { this.opened = true; }
    close() { this.opened = false; }
    toggle() { this.opened = !this.opened; }

    computeLabel_(opened) {
      return opened ? 'Đang mở' : 'Đang đóng';
    }

    openedChanged_(opened) {
      this.dispatchEvent(new CustomEvent('opened-changed', {
        detail: {value: opened},
      }));
    }
  }
  return OpenableMixinImpl;
});
```

### Bản Lit tương ứng

```js
export const OpenableMixin = (Base) => {
  class OpenableMixinImpl extends Base {
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

    updated(changed) {
      super.updated?.(changed);
      if (changed.has('opened')) {
        this.dispatchEvent(new CustomEvent('opened-changed', {
          detail: {value: this.opened},
        }));
      }
    }
  }
  return OpenableMixinImpl;
};
```

Logic mở/đóng và quan hệ `super` không đổi. Phần viết lại nằm ở khai báo `opened`, cách tạo `label` và nơi phát sự kiện khi `opened` đổi.

## Chuyển đổi theo hành vi

### `computed` không luôn phải thành property mới

Nếu giá trị chỉ rẻ và chỉ dùng để render, getter là lựa chọn đơn giản:

```js
get fullName() {
  return `${this.firstName} ${this.lastName}`;
}
```

Nếu tính toán tốn kém hoặc kết quả cần là reactive state riêng, tính nó trong `willUpdate()` khi dependency thay đổi:

```js
willUpdate(changed) {
  super.willUpdate?.(changed);
  if (changed.has('items')) {
    this.visibleCount = this.items.filter((item) => item.visible).length;
  }
}
```

Property thay đổi trong `willUpdate()` được dùng cho lần render đang diễn ra, không tự tạo vòng update mới.

### `observer` phải chọn đúng thời điểm

`updated(changed)` phù hợp khi side effect cần DOM đã render. Nếu chỉ cần chuẩn bị dữ liệu cho render, dùng `willUpdate(changed)`.

```js
updated(changed) {
  super.updated?.(changed);
  if (changed.has('selectedId')) {
    this.renderRoot.querySelector('[aria-selected="true"]')?.scrollIntoView();
  }
}
```

Tránh gán reactive property vô điều kiện trong `updated()`, vì nó sẽ đặt lịch một update mới.

### `notify: true` là một hợp đồng API, không chỉ là đổi cú pháp

Polymer dùng `notify` cho data binding hai chiều và sự kiện `property-name-changed`. Lit không có two-way binding tự động. Khi chuyển đổi, hãy xác định rõ ai cần biết thay đổi đó, rồi phát event với tên, `detail`, `bubbles` và `composed` phù hợp với API của component. Không nên phát event chỉ vì bản Polymer cũ có `notify` nếu không còn consumer nào cần nó.

### Object và array cần thay đổi tham chiếu trong Lit

Polymer có API như `this.set('user.name', value)` để báo thay đổi ở path. Lit mặc định phát hiện thay đổi theo tham chiếu. Khi chuyển mã:

```js
// Polymer
this.set('user.name', 'An');

// Lit
this.user = {...this.user, name: 'An'};
```

Tương tự, thay vì sửa trực tiếp một mảng, thường tạo mảng mới: `this.items = [...this.items, item]`.

## Ánh xạ `ready()` sang Lit

`ready()` của Polymer chạy một lần khi Polymer khởi tạo element lần đầu trong document. Nó tạo template và khởi tạo data system của Polymer.

Đừng đổi mọi `ready()` thành `firstUpdated()` mà không xét mục đích:

| Code cũ cần gì? | Điểm đặt trong Lit thường phù hợp |
|---|---|
| Đăng ký listener/tài nguyên theo lúc gắn vào document | `connectedCallback()` và `disconnectedCallback()` |
| Cần thao tác DOM sau lần render đầu | `firstUpdated()` |
| Chuẩn bị dữ liệu trước render | Constructor hoặc `willUpdate()` |

Mọi callback chuẩn như `connectedCallback()` vẫn cần gọi `super` để Lit hoạt động đúng.

## Thời điểm DOM cập nhật

Polymer xử lý data flow của thay đổi quan sát được một cách đồng bộ. Lit gom các thay đổi reactive và render ở microtask tiếp theo. Vì vậy, đoạn sau thường phải đổi khi sang Lit:

```js
// Lit
async revealSelected() {
  this.opened = true;
  await this.updateComplete;
  this.renderRoot.querySelector('.selected')?.scrollIntoView();
}
```

Chỉ thêm `await updateComplete` khi code thực sự đọc hoặc thao tác DOM phụ thuộc vào lần render mới. Các phương thức chỉ gán property hoặc tính toán dữ liệu không cần chờ.

## Quy trình chuyển đổi

1. Liệt kê API mà mixin công khai: property, method, event, attribute và CSS contract.
2. Chuyển `properties`, `value` và `reflectToAttribute` sang reactive property của Lit.
3. Phân loại từng `computed` và `observer`: getter, `willUpdate`, `updated` hay event handler.
4. Phân loại code trong `ready()` theo bảng ở mục 4.
5. Tìm mọi cập nhật object/array theo path và chuyển sang thay đổi bất biến hoặc gọi `requestUpdate()` có chủ đích.
6. Tìm mọi đoạn đọc DOM ngay sau khi đổi property; thêm `await updateComplete` ở nơi cần thiết.
7. Kiểm tra đường kế thừa. Chỉ thêm dedupe nếu mixin có thể xuất hiện hai lần.
8. Viết test cho API bên ngoài, lifecycle connect/disconnect và thứ tự `super` giữa các mixin.

## Danh sách kiểm tra

| Hạng mục | Nội dung xác nhận |
|---|---|
| Property | Giá trị mặc định, attribute và type conversion có còn đúng không? |
| Event | Consumer nào thực sự nghe event? Event có cần đi qua shadow boundary không? |
| DOM timing | Có đoạn nào đọc DOM trước khi Lit render xong không? |
| State phức tạp | Object và array có được gán tham chiếu mới không? |
| Lifecycle | Listener có được gỡ đúng lúc không? `ready()` cũ đã được đặt vào hook phù hợp chưa? |
| Inheritance | `super` có được gọi ở các override cần thiết không? Mixin có bị lặp trong chain không? |

## Quy tắc chính

- Cơ chế mixin là JavaScript nên không cần “migrate” lại từ đầu.
- Chuyển đổi tập trung vào reactive property, observer/computed, lifecycle và thời điểm DOM render.
- Getter và `willUpdate()` thường thay thế tốt cho computed property; `updated()` chỉ dùng khi cần DOM đã cập nhật.
- Lit yêu cầu thay đổi tham chiếu đối với object/array nếu muốn update tự động.
- Kiểm tra hành vi của component sau chuyển đổi, không chỉ kiểm tra mã có biên dịch hay không.
