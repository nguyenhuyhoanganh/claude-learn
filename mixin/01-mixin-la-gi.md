# Mixin: khái niệm và phạm vi áp dụng

## Phạm vi

Phần này định nghĩa class mixin, mô tả vị trí của mixin trong chuỗi kế thừa và so sánh với Behavior legacy của Polymer.

## Vấn đề cần giải quyết

Ví dụ có hai custom element không liên quan về mặt nghiệp vụ:

- `my-panel` hiển thị hoặc ẩn một phần nội dung;
- `my-dropdown` hiển thị hoặc ẩn danh sách lựa chọn.

Cả hai đều cần cùng một khả năng: có trạng thái `opened`, phản chiếu trạng thái đó ra attribute để CSS sử dụng, và có các phương thức `open()`, `close()`, `toggle()`.

Nếu viết trực tiếp vào từng element, phần xử lý mở/đóng sẽ bị lặp. Khi cần thay đổi quy tắc, chẳng hạn không cho mở khi element bị vô hiệu hóa, ta phải sửa nhiều nơi và rất dễ bỏ sót. Mixin cho phép đóng gói khả năng này một lần rồi dùng lại cho nhiều lớp.

## Định nghĩa

> Mixin là một hàm nhận một lớp cơ sở và trả về một lớp con đã được bổ sung chức năng.

Mẫu cơ bản:

```js
const SomeMixin = (Base) => class extends Base {
  // property và method dùng chung
};
```

Ví dụ đơn giản:

```js
const OpenableMixin = (Base) => class extends Base {
  open() {
    this.opened = true;
  }

  close() {
    this.opened = false;
  }

  toggle() {
    this.opened = !this.opened;
  }
};

class MyPanel extends OpenableMixin(HTMLElement) {}
```

`OpenableMixin(HTMLElement)` tạo ra một lớp con mới của `HTMLElement`. `MyPanel` lại kế thừa từ lớp mới này. Vì vậy, chuỗi kế thừa thực tế là:

```text
MyPanel → OpenableMixinImpl → HTMLElement
```

Điều này khác với việc chép các method vào `MyPanel.prototype`. Mixin tạo thêm một mắt xích trong chuỗi kế thừa; nó không thay đổi lớp cơ sở và không ảnh hưởng tới element khác.

## Quan hệ với kế thừa thông thường

JavaScript chỉ cho một lớp cha trực tiếp:

```js
class MyPanel extends HTMLElement {}
```

Nhưng một element có thể cần nhiều khả năng độc lập, ví dụ mở/đóng, vô hiệu hóa, hỗ trợ i18n hoặc lắng nghe sự kiện. Mixin cho phép ghép các khả năng đó theo thứ tự rõ ràng:

```js
class MyPanel extends DisableableMixin(OpenableMixin(HTMLElement)) {}
```

Trong biểu thức trên, `OpenableMixin` được áp dụng trước, rồi kết quả được truyền vào `DisableableMixin`.

## Mở rộng method bằng `super`

Hai mixin có thể cùng có phương thức `toggle()`. Mixin ở ngoài cùng sẽ được tìm thấy trước. Nó không nhất thiết phải thay thế hoàn toàn phần còn lại; nó có thể bổ sung điều kiện rồi gọi tiếp phương thức ở lớp bên dưới.

```js
const DisableableMixin = (Base) => class extends Base {
  toggle() {
    if (this.disabled) {
      return;
    }
    super.toggle();
  }
};

class MyPanel extends DisableableMixin(OpenableMixin(HTMLElement)) {}
```

Khi gọi `panel.toggle()`:

1. `DisableableMixin.toggle()` chạy trước.
2. Nếu `disabled` là `true`, phương thức kết thúc.
3. Nếu không, `super.toggle()` gọi `OpenableMixin.toggle()`.

Đây là lý do cần hiểu mixin như một lớp trong chuỗi kế thừa. `super` chỉ có nghĩa khi có lớp cha thực sự.

## Behavior của Polymer

Các dự án Polymer đời cũ có thể dùng Behavior, là một object chứa property và method dùng chung:

```js
const OpenableBehavior = {
  properties: {
    opened: {type: Boolean, value: false},
  },
  toggle() {
    this.opened = !this.opened;
  },
};
```

Polymer có thể gộp một số cấu hình của Behavior, như `properties` và lifecycle callbacks. Tuy nhiên, Behavior không phải là một lớp trong chuỗi kế thừa. Nếu hai Behavior định nghĩa cùng một method thông thường, một bản sẽ ghi đè bản kia theo quy tắc merge của Polymer; method bị ghi đè không có `super` để gọi lại.

Polymer 3 vẫn có cơ chế tương thích với Behavior cũ, nhưng với mã mới, class mixin rõ ràng và an toàn hơn khi cần mở rộng method.

## Ví dụ Polymer

Mixin Polymer có thể khai báo property reactive như một element bình thường:

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
        },
      };
    }

    open() { this.opened = true; }
    close() { this.opened = false; }
    toggle() { this.opened = !this.opened; }
  }

  return OpenableMixinImpl;
});
```

Element dùng mixin chỉ giữ phần riêng của nó:

```js
class MyPanel extends OpenableMixin(PolymerElement) {
  static get properties() {
    return {title: {type: String, value: 'Panel'}};
  }
}
```

`opened` được khai báo trong mixin nhưng vẫn dùng được trong template và CSS của `MyPanel`, ví dụ `:host([opened])`.

## ReactiveController trong Lit

`ReactiveController` là một object được một `LitElement` sở hữu và đăng ký qua `host.addController(controller)`. Controller không được chèn vào prototype chain, vì vậy không tự thêm property hoặc method vào API của element.

Controller có thể triển khai các callback lifecycle sau:

| Callback | Thời điểm gọi |
|---|---|
| `hostConnected()` | Host được kết nối vào document |
| `hostDisconnected()` | Host bị gỡ khỏi document |
| `hostUpdate()` | Trước khi host chạy update |
| `hostUpdated()` | Sau khi host hoàn tất update |

Ví dụ controller quản lý listener cho thao tác click bên ngoài element:

```js
class ClickOutsideController {
  constructor(host, onOutsideClick) {
    this.host = host;
    this.onOutsideClick = onOutsideClick;
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
    document.removeEventListener('click', this.listener_);
  }
}

class MyPanel extends OpenableMixin(LitElement) {
  constructor() {
    super();
    this.clickOutside_ = new ClickOutsideController(this, () => this.close());
  }
}
```

Trong ví dụ này, `OpenableMixin` cung cấp API `open()`, `close()` và `toggle()` trên element. `ClickOutsideController` chỉ quản lý listener và gọi callback. Nếu controller thay đổi state nội bộ có ảnh hưởng tới template, controller gọi `this.host.requestUpdate()` để yêu cầu host render lại.

Controller phù hợp với logic có thể tách khỏi API công khai của element, đặc biệt khi cần nhiều instance độc lập trong cùng một host. Mixin phù hợp khi feature cần trở thành một phần của class, cần override method, hoặc cần kiểm soát thứ tự qua `super`.

## Tiêu chí sử dụng

Nên dùng mixin khi phần dùng chung thực sự là một phần của API element hoặc cần kiểm soát vị trí trong chuỗi lifecycle. Ví dụ: một mixin thêm `opened`, `toggle()` và quy tắc xử lý bàn phím cho mọi panel.

Không nên dùng mixin chỉ để gom một vài hàm tính toán. Khi đó, hàm thuần thường dễ kiểm thử hơn. Trong Lit, nếu phần dùng chung chỉ cần state, lifecycle và có thể nằm ngoài API công khai của element, hãy cân nhắc `ReactiveController`; bài 4 giải thích lựa chọn này.

## Quy tắc chính

- Mixin là hàm `Base → class extends Base`.
- Nó tạo lớp trung gian trong chuỗi kế thừa, không sao chép method vào lớp hiện có.
- Khi nhiều mixin ghi đè cùng một method, mixin ở gần lớp cuối hơn được gọi trước và có thể gọi tiếp bằng `super`.
- Behavior legacy của Polymer không có cơ chế `super` này cho method thông thường.
- `ReactiveController` của Lit dùng composition; controller phù hợp với lifecycle và state nội bộ không cần xuất hiện trong API của element.
