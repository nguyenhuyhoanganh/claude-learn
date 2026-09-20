# Cơ chế hoạt động của mixin

## Phạm vi

Phần này mô tả prototype chain, thứ tự constructor, cách `super` ảnh hưởng đến thứ tự gọi method và trường hợp một mixin xuất hiện lặp trong chain.

## Prototype chain

Xét khai báo:

```js
class MyPanel extends DisableableMixin(OpenableMixin(HTMLElement)) {}
```

JavaScript tạo các lớp trung gian. Nếu gọi các lớp đó là `DisableableMixinImpl` và `OpenableMixinImpl`, quan hệ prototype là:

```text
MyPanel.prototype
  → DisableableMixinImpl.prototype
  → OpenableMixinImpl.prototype
  → HTMLElement.prototype
```

Khi chạy `panel.toggle()`, JavaScript tìm `toggle` từ trái sang phải trong sơ đồ trên. Nếu `MyPanel` không có method này nhưng `DisableableMixinImpl` có, method ở `DisableableMixinImpl` sẽ được gọi.

Quy tắc cần nhớ là: lớp ở gần `MyPanel` hơn có ưu tiên cao hơn khi trùng tên method.

## Xếp chồng mixin

Viết tổng quát:

```js
class MyElement extends A(B(Base)) {}
```

Thứ tự áp dụng là `B` trước rồi `A`. Chuỗi kế thừa là:

```text
MyElement → AImpl → BImpl → Base
```

Do đó, `AImpl` được tra cứu trước `BImpl`. Đây là lý do `A` có thể kiểm tra hoặc thay đổi hành vi rồi gọi `super` xuống `B`.

```js
const B = (Base) => class extends Base {
  action() {
    console.log('B');
  }
};

const A = (Base) => class extends Base {
  action() {
    console.log('A: before');
    super.action();
    console.log('A: after');
  }
};

class MyElement extends A(B(HTMLElement)) {}

new MyElement().action();
// A: before
// B
// A: after
```

Một mixin gọi `super.action()` chỉ khi nó có hợp đồng rõ ràng rằng lớp phía dưới cung cấp `action()`. Với mixin tổng quát, hãy ghi điều kiện này trong tài liệu hoặc dùng một tên method nội bộ ít có khả năng trùng.

## Thứ tự constructor

```js
const A = (Base) => class extends Base {
  constructor() {
    super();
    console.log('A');
  }
};

const B = (Base) => class extends Base {
  constructor() {
    super();
    console.log('B');
  }
};

class MyElement extends A(B(HTMLElement)) {
  constructor() {
    super();
    console.log('MyElement');
  }
}
```

Kết quả là `B`, `A`, rồi `MyElement`. Lý do là mỗi constructor phải gọi `super()` trước khi dùng `this`; lời gọi đi đến lớp cơ sở trước, sau đó phần thân constructor được thực thi khi ngăn xếp lời gọi quay trở lại.

```text
HTMLElement → B → A → MyElement
```

Đây là quy tắc của JavaScript, không phải quy tắc riêng của Polymer hay Lit.

## Thứ tự method và vị trí `super`

Constructor bắt buộc gọi `super()` trước khi dùng `this`, còn method thông thường thì không. Vì vậy, thứ tự chạy phụ thuộc vào vị trí của lệnh `super`.

```js
const A = (Base) => class extends Base {
  connectedCallback() {
    super.connectedCallback();
    console.log('A sau super');
  }
};
```

Nếu lớp cuối cũng gọi `super.connectedCallback()` trước khi log, phần ở lớp cơ sở sẽ chạy trước. Nếu một lớp log trước rồi mới gọi `super`, phần log của lớp đó chạy trước các lớp phía dưới.

Không có quy tắc chung rằng teardown luôn phải gọi `super` ở cuối. Vị trí lời gọi phải dựa trên hợp đồng của framework và thứ tự phụ thuộc của code. Polymer yêu cầu gọi phương thức lifecycle của lớp cha ngay đầu callback để framework hoàn tất phần xử lý của nó. Với Lit, callback chuẩn của custom element phải gọi implementation của lớp cha để giữ hoạt động chuẩn của Lit; vị trí lời gọi quyết định thứ tự của các lớp trong chain.

## Override lifecycle thiếu `super`

```js
const LoggingMixin = (Base) => class extends Base {
  connectedCallback() {
    console.log('connected');
    // thiếu super.connectedCallback()
  }
};
```

Lời gọi dừng ở lớp này. Mọi implementation `connectedCallback` phía dưới nó đều không chạy. Với `PolymerElement` hoặc `LitElement`, việc đó có thể làm hỏng quá trình khởi tạo hoặc update mà không tạo ra thông báo lỗi dễ hiểu.

Khi review mixin có override lifecycle, hãy kiểm tra `super` trước tiên.

## Mixin xuất hiện lặp trong chain

Mỗi lần gọi một mixin thông thường, JavaScript tạo một lớp mới:

```js
const M = (Base) => class extends Base {};

M(HTMLElement) === M(HTMLElement); // false
```

Điều này trở thành vấn đề nếu cùng một mixin đi vào chuỗi kế thừa qua hai đường khác nhau:

```js
class Parent extends LoggerMixin(HTMLElement) {}
class Child extends LoggerMixin(Parent) {}
```

`Child` lúc này có hai lớp do `LoggerMixin` tạo ra. Nếu mixin đăng ký listener hoặc thay đổi lifecycle, công việc có thể được thực hiện hai lần.

### `dedupingMixin` trong Polymer

Polymer cung cấp `dedupingMixin` cho trường hợp này. Hàm này nhớ lớp đã tạo cho một base class và kiểm tra xem mixin đã xuất hiện trong chuỗi kế thừa hay chưa.

```js
import {dedupingMixin} from '@polymer/polymer/lib/utils/mixin.js';

export const LoggerMixin = dedupingMixin((Base) => class extends Base {
  // ...
});
```

Đây là lựa chọn phù hợp cho mixin Polymer có thể được kết hợp với mixin hoặc lớp khác.

### Lit và JavaScript thuần

Lit không có helper deduping tích hợp. Chỉ cần viết helper riêng khi thiết kế mixin có khả năng bị áp dụng lặp qua nhiều lớp. Helper cần làm hai việc: nhớ kết quả theo base class và nhận ra mixin đã có trong chuỗi kế thừa.

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

`WeakMap` giúp cache không giữ class lại chỉ vì cache còn tồn tại. Deduping chỉ phù hợp khi cách sử dụng mixin có nguy cơ áp dụng lặp và có test cho trường hợp kế thừa tương ứng.

## Bảng tra cứu

Với `class MyElement extends A(B(Base))`:

| Việc | Thứ tự hoặc quy tắc |
|---|---|
| Tra cứu method | `MyElement → A → B → Base`; gặp method đầu tiên thì dừng |
| Constructor | `Base → B → A → MyElement` |
| Method có `super` ở đầu | Phần ở lớp cơ sở chạy trước phần sau `super` |
| Method có `super` ở cuối | Phần trước `super` ở lớp ngoài chạy trước |
| Áp cùng mixin hai lần | Có thể tạo hai lớp trung gian và chạy logic hai lần |

## Quy tắc chính

- Mixin tạo lớp trung gian thật trong prototype chain.
- Với `A(B(Base))`, `A` gần lớp cuối hơn và được tìm thấy trước.
- Constructor luôn đi từ base lên lớp cuối.
- Với method thường, thứ tự phụ thuộc vào nơi gọi `super`.
- Quên `super` ở lifecycle có thể cắt đứt phần framework phía dưới.
- Dùng `dedupingMixin` cho mixin Polymer có nguy cơ đi vào chain nhiều lần.
