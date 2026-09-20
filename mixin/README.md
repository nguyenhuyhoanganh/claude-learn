# Mixin trong Polymer và Lit

Bộ tài liệu này giải thích mixin theo đúng cơ chế của JavaScript, sau đó áp dụng cơ chế đó vào Polymer và Lit. Ví dụ xuyên suốt là `OpenableMixin`: bổ sung trạng thái `opened` cùng các phương thức `open()`, `close()` và `toggle()` cho một custom element.

Phạm vi tài liệu:

1. Cơ chế class mixin trong JavaScript: prototype chain, thứ tự gọi và `super`.
2. Cách Polymer và Lit tích hợp mixin với hệ thống property và lifecycle.
3. Các điểm cần kiểm tra khi chuyển mixin từ Polymer sang Lit.

> Polymer đang ở chế độ bảo trì. Phần Polymer trong tài liệu phục vụ việc đọc và sửa mã nguồn hiện có; với mã mới, hãy tuân theo lựa chọn framework và quy ước của codebase đang làm việc.

## Phạm vi áp dụng

- Người đã biết `class`, `extends` và phương thức trong JavaScript.
- Người cần đọc mã Polymer cũ hoặc chuyển component sang Lit.
- Người làm Web Components, không nhất thiết làm Chromium WebUI.

## Cấu trúc tài liệu

| Bài | Nội dung chính |
|---|---|
| [1. Mixin là gì?](01-mixin-la-gi.md) | Bài toán dùng chung logic, định nghĩa và giới hạn của Behavior |
| [2. Mixin hoạt động thế nào?](02-luong-chay-cua-mixin.md) | Prototype chain, `super`, constructor và deduping |
| [3. Mixin trong Polymer](03-mixin-trong-polymer.md) | `properties`, lifecycle, `dedupingMixin` và mã legacy |
| [4. Mixin trong Lit](04-mixin-trong-lit.md) | Reactive property, update cycle và ReactiveController |
| [5. Chuyển từ Polymer sang Lit](05-so-sanh-polymer-vs-lit.md) | Bản đồ chuyển đổi và quy trình kiểm tra |
| [6. Kịch bản demo](06-kich-ban-demo.md) | Cách trình bày các demo theo một mạch ngắn gọn |

## Định nghĩa ngắn

```js
const OpenableMixin = (Base) => class extends Base {
  toggle() {
    this.opened = !this.opened;
  }
};

class MyPanel extends OpenableMixin(HTMLElement) {}
```

Mixin không sao chép phương thức vào `MyPanel`. Nó tạo một lớp con trung gian:

```text
MyPanel → OpenableMixinImpl → HTMLElement
```

Vì đây là quan hệ kế thừa thật, một mixin có thể gọi `super.toggle()` để tiếp tục thực thi phương thức ở lớp phía dưới.

## Slide và demo

- [slides.html](slides.html) là bộ slide tự chứa, có thể mở trực tiếp bằng trình duyệt.
- Các file trong [demo](demo) minh họa thứ tự thực thi. Demo Polymer và Lit tải thư viện từ CDN, nên cần mạng và nên chạy qua HTTP server:

```bash
cd mixin/demo
python3 -m http.server 8000
```

Sau đó mở `http://localhost:8000/01-mixin-thuan-js.html` đến `04-side-by-side.html`.

## Tài liệu tham khảo

- [Polymer: custom elements và mixin](https://polymer-library.polymer-project.org/3.0/docs/devguide/custom-elements)
- [Polymer: data system](https://polymer-library.polymer-project.org/3.0/docs/devguide/data-system)
- [Lit: mixins](https://lit.dev/docs/composition/mixins/)
- [Lit: reactive properties](https://lit.dev/docs/components/properties/)
- [Lit: lifecycle](https://lit.dev/docs/components/lifecycle/)
- [Lit: controllers và composition](https://lit.dev/docs/composition/overview/)
