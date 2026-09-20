# Mixin trong Polymer

## Phạm vi

Phần này mô tả Behavior legacy, class mixin Polymer, property effects, lifecycle và `dedupingMixin`.

## Các cơ chế chia sẻ code

| Kiểu | Bối cảnh sử dụng | Đặc điểm chính |
|---|---|---|
| Behavior | Mã Polymer legacy | Object cấu hình; Polymer gộp một số thành phần |
| Class mixin | Mã dùng class ES | Hàm nhận class và trả class con; dùng `super` của JavaScript |

Behavior vẫn xuất hiện trong các dự án cũ. Cơ chế này chỉ nên được duy trì hoặc chuyển đổi dần; mã mới nên dùng class mixin.

## Behavior legacy

```js
const OpenableBehavior = {
  properties: {
    opened: {type: Boolean, value: false},
  },

  attached() {
    this.addEventListener('click', this.toggle);
  },

  toggle() {
    this.opened = !this.opened;
  },
};
```

Trong Behavior, Polymer gộp `properties`, `observers`, `listeners` và gọi lifecycle callback theo quy tắc riêng. Đây không phải là chuỗi class của JavaScript. Vì vậy, hai Behavior cùng khai báo một method thông thường như `toggle()` không thể nối tiếp nhau bằng `super.toggle()`.

Polymer 3 có cầu nối để dùng Behavior cũ từ class:

```js
import {mixinBehaviors} from '@polymer/polymer/lib/legacy/class.js';

class MyPanel extends mixinBehaviors([OpenableBehavior], PolymerElement) {}
```

Dùng cầu nối để duy trì mã cũ; không dùng nó như một mẫu thiết kế mới.

## Mẫu class mixin

`dedupingMixin` bọc hàm mixin để ngăn cùng mixin xuất hiện lặp trong một chuỗi kế thừa phức tạp.

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
          observer: 'onOpenedChanged_',
        },
        label: {
          type: String,
          computed: 'computeLabel_(opened)',
        },
      };
    }

    connectedCallback() {
      super.connectedCallback();
      this.onKeyDown_ = (event) => {
        if (event.key === 'Escape') this.close();
      };
      document.addEventListener('keydown', this.onKeyDown_);
    }

    disconnectedCallback() {
      super.disconnectedCallback();
      document.removeEventListener('keydown', this.onKeyDown_);
    }

    open() { this.opened = true; }
    close() { this.opened = false; }
    toggle() { this.opened = !this.opened; }

    computeLabel_(opened) {
      return opened ? 'Đang mở' : 'Đang đóng';
    }

    onOpenedChanged_(opened) {
      this.dispatchEvent(new CustomEvent('opened-changed', {
        detail: {value: opened},
      }));
    }
  }

  return OpenableMixinImpl;
});
```

Tên `OpenableMixinImpl` không bắt buộc, nhưng nên dùng. Khi debug, stack trace sẽ hiển thị tên lớp thay vì một class ẩn danh.

## Property effects trong mixin

Về bản chất, mixin vẫn là JavaScript. Polymer bổ sung hệ thống property và data binding lên các lớp trong chain.

### Property được kế thừa và xử lý như property của element

```js
class MyPanel extends OpenableMixin(PolymerElement) {
  static get properties() {
    return {
      title: {type: String, value: 'Panel'},
    };
  }
}
```

`MyPanel` có cả `opened`, `label` và `title`. `opened` có thể được dùng trong template của `MyPanel`; `reflectToAttribute: true` cũng làm CSS như `:host([opened])` hoạt động.

Khi hai lớp cùng định nghĩa một property có cùng tên, không nên dựa vào quy tắc ghi đè để thiết kế API. State nội bộ của mixin cần có tên hoặc tiền tố riêng để tránh xung đột.

### Property effects hoạt động trong mixin

Mixin có thể khai báo các tính năng Polymer sau:

| Tính năng | Ý nghĩa |
|---|---|
| `value` | Giá trị mặc định |
| `computed` | Tính giá trị từ các dependency đã khai báo |
| `observer` | Gọi method khi property thay đổi |
| `reflectToAttribute` | Phản chiếu property sang attribute |
| `notify` | Phát sự kiện `property-name-changed` cho data binding hai chiều |

Property effects của Polymer xử lý luồng dữ liệu đồng bộ đối với thay đổi quan sát được. Tuy nhiên, một số phần tử template như danh sách có thể còn có lịch render riêng; nếu code phụ thuộc vào DOM của một phần tử đó, hãy dùng API render phù hợp thay vì suy luận chỉ từ việc gán property.

## Lifecycle Polymer

Polymer dùng lifecycle chuẩn của custom element và thêm `ready()`.

- `connectedCallback()` có thể chạy nhiều lần, mỗi lần element được gắn lại vào document. Phù hợp để đăng ký listener cấp `document`.
- `disconnectedCallback()` có thể chạy nhiều lần. Phù hợp để gỡ listener đã đăng ký khi connect.
- `ready()` chạy một lần khi Polymer khởi tạo element lần đầu trong document. Sau `super.ready()`, template và data system của Polymer đã sẵn sàng.

Khi ghi đè các callback này, gọi `super` là bắt buộc để Polymer hoàn tất lifecycle của nó. Theo hướng dẫn Polymer, lời gọi đó phải đứng đầu callback.

```js
ready() {
  super.ready();
  // Có thể truy cập shadow root của Polymer ở đây.
}
```

Không dùng `ready()` để quản lý tài nguyên cần được tạo và hủy theo mỗi lần connect/disconnect. Ví dụ listener trên `document` nên luôn có cặp `connectedCallback()` và `disconnectedCallback()`.

## Xếp chồng mixin

```js
export const DisableableMixin = dedupingMixin((Base) => {
  class DisableableMixinImpl extends Base {
    static get properties() {
      return {
        disabled: {type: Boolean, value: false, reflectToAttribute: true},
      };
    }

    toggle() {
      if (!this.disabled) {
        super.toggle();
      }
    }
  }
  return DisableableMixinImpl;
});

class MyPanel extends DisableableMixin(OpenableMixin(PolymerElement)) {}
```

`DisableableMixin` có phụ thuộc rõ ràng vào `OpenableMixin`: lớp phía dưới phải cung cấp `toggle()`. Đây là một hợp đồng cần thể hiện trong tên, comment hoặc type của mixin; không nên giả định mọi `Base` đều có method này.

## Danh sách kiểm tra

- Mixin có được bọc bằng `dedupingMixin` nếu có thể xuất hiện qua nhiều nhánh kế thừa không?
- Mọi lifecycle callback có gọi `super` ở đầu không?
- State và method do mixin thêm vào có tên đủ riêng để không xung đột không?
- Listener tạo ở `connectedCallback()` có được gỡ ở `disconnectedCallback()` không?
- `ready()` có chỉ dùng cho khởi tạo một lần không?
- Nếu dùng `computed` hoặc `observer`, dependency có được khai báo đầy đủ không?

## Quy tắc chính

- Behavior là cơ chế legacy; class mixin là cơ chế dựa trên kế thừa ES.
- Mixin Polymer có thể mang theo property, observer, computed property và lifecycle callback.
- Gọi `super` trong lifecycle là bắt buộc; với Polymer, đặt lời gọi đó ở đầu callback.
- Dùng `dedupingMixin` khi mixin có thể được đưa vào cùng một chuỗi kế thừa nhiều lần.
