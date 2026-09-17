# Bài 1: Mixin là gì — trong Polymer

> Mục tiêu: sau bài này bạn định nghĩa được mixin bằng **một câu**, viết được một mixin Polymer chạy thật, và hiểu vì sao Polymer 3 bỏ Behaviors của Polymer 1.

Cả bài dùng **Polymer 3**. Ví dụ chỉ dùng những thứ có sẵn của framework — `properties`, lifecycle, template — không gọi API nào bên ngoài.

## 1. Bài toán — hai component cùng cần một khả năng

Bạn có hai component WebUI chẳng liên quan gì nhau:

- `<my-panel>` — khung nội dung gập được.
- `<my-dropdown>` — danh sách xổ xuống.

Cả hai đều cần **mở/đóng**. Cụ thể là 4 thứ:

1. Property `opened` (Boolean).
2. Đẩy `opened` ra ngoài thành attribute để CSS bắt được (`:host([opened])`).
3. Các method `toggle()`, `open()`, `close()`.
4. Bắn event `opened-changed` để component cha biết.

Cách làm đầu tiên ai cũng nghĩ ra — viết thẳng vào từng component:

```javascript
class MyPanel extends PolymerElement {
  static get is() { return 'my-panel'; }

  static get properties() {
    return {
      opened: {                          // ①
        type: Boolean,
        value: false,
        reflectToAttribute: true,
        observer: 'openedChanged_',
      },
      tieuDe: {type: String},            // ← phần riêng của MyPanel
    };
  }

  toggle() { this.opened = !this.opened; }        // ②
  open()   { this.opened = true; }
  close()  { this.opened = false; }

  openedChanged_(moi) {                            // ③
    this.dispatchEvent(new CustomEvent('opened-changed', {detail: {value: moi}}));
  }
}

class MyDropdown extends PolymerElement {
  static get is() { return 'my-dropdown'; }

  static get properties() {
    return {
      opened: {                          // ① y hệt
        type: Boolean,
        value: false,
        reflectToAttribute: true,
        observer: 'openedChanged_',
      },
      danhSach: {type: Array},           // ← phần riêng của MyDropdown
    };
  }

  toggle() { this.opened = !this.opened; }        // ② y hệt
  open()   { this.opened = true; }
  close()  { this.opened = false; }

  openedChanged_(moi) {                            // ③ y hệt
    this.dispatchEvent(new CustomEvent('opened-changed', {detail: {value: moi}}));
  }
}
```

Chạy thì tốt. Nhưng ba khối ①②③ **lặp lại y hệt**, và đây mới chỉ là 2 component. Trong `chrome://settings` có hàng chục thứ mở/đóng được.

### Vì sao lặp code là vấn đề

Không phải vì "gõ nhiều". Vấn đề là:

| Vấn đề | Chuyện gì xảy ra |
|---|---|
| **Sửa 1 chỗ, phải sửa N chỗ** | Muốn thêm: nhấn `Escape` thì đóng → mở từng component ra sửa |
| **Sai lệch âm thầm** | Component thứ 5 có người quên `reflectToAttribute` → CSS không ăn, không ai báo lỗi |
| **Không test riêng được** | Muốn kiểm tra logic đóng/mở phải dựng cả `MyPanel` lên |

Ta cần: **viết logic mở/đóng một lần, gắn vào bao nhiêu component cũng được.**

## 2. Cách của Polymer 1 — Behaviors

Polymer 1 ra đời trước khi class ES6 phổ biến, nên nó gom phần dùng chung vào một **object thường**, gọi là Behavior:

```javascript
const OpenableBehavior = {
  properties: {
    opened: {
      type: Boolean,
      value: false,
      reflectToAttribute: true,
      observer: 'openedChanged_',
    },
  },

  toggle() { this.opened = !this.opened; },
  open()   { this.opened = true; },
  close()  { this.opened = false; },

  openedChanged_(moi) {
    this.dispatchEvent(new CustomEvent('opened-changed', {detail: {value: moi}}));
  },
};

Polymer({
  is: 'my-panel',
  behaviors: [OpenableBehavior],       // ← gắn vào
  properties: {
    tieuDe: {type: String},
  },
});
```

✅ Giải quyết được bài toán lặp code. Gắn được **nhiều** behavior cùng lúc, thứ mà kế thừa thường không làm nổi (`class A extends B, C` là `SyntaxError` — JavaScript chỉ cho một class cha).

❌ Nhưng vì behavior chỉ là object thường, nó có một lỗ hổng chết người: **không có `super`**.

Polymer 1 phải tự viết cơ chế merge để bù. Kết quả nửa vời:

| Loại key | Polymer 1 xử lý |
|---|---|
| Lifecycle (`attached`, `detached`…) | Gọi **tất cả**, theo thứ tự — behavior trước, element sau |
| `properties`, `observers`, `listeners` | Gộp lại |
| **Method thường** | **Ghi đè — cái sau đè cái trước, im lặng** |

Dòng cuối là chỗ vỡ:

```javascript
const OpenableBehavior  = { toggle() { /* mở/đóng */ } };
const DisableableBehavior = { toggle() { /* kiểm tra disabled rồi mới mở/đóng */ } };

Polymer({
  is: 'my-panel',
  behaviors: [OpenableBehavior, DisableableBehavior],
});

// element.toggle() → chỉ chạy bản của DisableableBehavior.
// Bản của OpenableBehavior BIẾN MẤT. Không một lời cảnh báo.
```

`DisableableBehavior` muốn "kiểm tra `disabled` rồi **gọi tiếp** bản gốc" — nhưng nó không có cách nào gọi. Nó là object thường, không nằm trong chuỗi kế thừa nào cả, nên không có `super` để gọi.

> Cùng một vấn đề xảy ra với `Object.assign(MyPanel.prototype, behavior)` — cách "mixin cổ điển" thời jQuery. Đó là **ghi đè phẳng**: không có khái niệm "chạy tiếp cái trước đó".

Đây chính là lý do Polymer 3 bỏ Behaviors.

## 3. Cách của Polymer 3 — Mixin ⭐

Ý tưởng khác hẳn: thay vì *copy method vào* class có sẵn, ta **sinh ra một class trung gian** rồi chèn nó vào giữa chuỗi kế thừa.

```javascript
import {dedupingMixin} from 'chrome://resources/polymer/v3_0/polymer/lib/utils/mixin.js';

export const OpenableMixin = dedupingMixin((superClass) => {
  class OpenableMixinImpl extends superClass {
    static get properties() {
      return {
        opened: {
          type: Boolean,
          value: false,
          reflectToAttribute: true,
          observer: 'openedChanged_',
        },
        nhan: {type: String, computed: 'tinhNhan_(opened)'},
      };
    }

    toggle() { this.opened = !this.opened; }
    open()   { this.opened = true; }
    close()  { this.opened = false; }

    tinhNhan_(opened) { return opened ? 'Đang mở' : 'Đang đóng'; }

    openedChanged_(moi) {
      this.dispatchEvent(new CustomEvent('opened-changed', {detail: {value: moi}}));
    }
  }
  return OpenableMixinImpl;
});
```

Dùng:

```javascript
class MyPanel extends OpenableMixin(PolymerElement) {
  static get is() { return 'my-panel'; }

  static get properties() {
    return {tieuDe: {type: String, value: 'Bảng'}};   // chỉ phần riêng
  }

  static get template() {
    return html`
      <style>
        :host([opened]) .than { display: block; }     /* reflect từ mixin */
        .than { display: none; }
      </style>
      <h3 on-click="toggle">[[tieuDe]] — [[nhan]]</h3>
      <div class="than"><slot></slot></div>`;
  }
}
customElements.define(MyPanel.is, MyPanel);
```

Kết quả chạy thật:

```text
panel.opened                      → false          (giá trị mặc định từ mixin)
panel.nhan                        → "Đang đóng"    (computed trong mixin)
panel.toggle()
panel.opened                      → true
panel.nhan                        → "Đang mở"      (computed tự cập nhật)
panel.hasAttribute('opened')      → true           (reflectToAttribute)
panel.tieuDe                      → "Bảng"         (property riêng vẫn còn)
event 'opened-changed'            → đã bắn         (observer trong mixin)
```

Để ý ba điều:

1. `MyPanel` chỉ còn khai báo **phần riêng của nó**. Toàn bộ logic mở/đóng nằm ở mixin.
2. Property của mixin (`opened`, `nhan`) và của element (`tieuDe`) **gộp lại với nhau**, dùng trong template như nhau.
3. `computed`, `observer`, `reflectToAttribute` — mọi tính năng của Polymer **đều chạy từ bên trong mixin**. Mixin không phải cái túi đựng method; nó là một *mảnh component* hoàn chỉnh.

Áp lên component thứ hai, không sửa dòng nào trong mixin:

```javascript
class MyDropdown extends OpenableMixin(PolymerElement) {
  static get is() { return 'my-dropdown'; }
  static get properties() { return {danhSach: {type: Array}}; }
}
```

## 4. Định nghĩa

> **Mixin là một hàm nhận vào một class và trả về một class con mới của nó, đã được bổ sung tính năng.**

Bộ khung tối giản, thuộc lòng được:

```javascript
const TenMixin = (superClass) => class extends superClass {
  // thêm gì đó ở đây
};
```

Ba tính chất bắt buộc, thiếu một cái thì không còn là mixin:

| Tính chất | Vì sao cần |
|---|---|
| Nhận `superClass` làm **tham số** | Viết cứng `extends PolymerElement` thì không xếp chồng được, và không dùng lại cho Lit được |
| Trả về **class mới**, không sửa `superClass` | `PolymerElement` giữ nguyên → mọi chỗ khác không bị ảnh hưởng |
| Bên trong dùng `extends superClass` | Đây là thứ tạo ra `super` — khác biệt cốt lõi so với Behaviors |

### Vì sao tên "subclass factory" chính xác hơn

Chữ "mixin" (trộn vào) dễ gây hiểu lầm rằng nó **trộn** method vào class bạn. Nó không trộn gì cả.

Nó là một **nhà máy sản xuất class con**: đưa vào `PolymerElement`, nhận về một class `extends PolymerElement`.

```javascript
const X = OpenableMixin(PolymerElement);
Object.getPrototypeOf(X.prototype) === PolymerElement.prototype;   // true — X đúng là con
```

Chuỗi kế thừa của `MyPanel`:

```text
MyPanel  →  OpenableMixin  →  PolymerElement  →  HTMLElement
            └─ mắt xích mixin chèn vào ─┘
```

Bài 2 sẽ đào sâu chuỗi này — nó giải thích mọi hành vi của mixin.

## 5. Xếp chồng nhiều mixin — và thứ Behaviors không làm được

Vì mixin nhận class → trả class, ta lồng được bao nhiêu tuỳ thích:

```javascript
class MyPanel extends DisableableMixin(OpenableMixin(PolymerElement)) { }
```

Giờ viết `DisableableMixin` — và đây là chỗ thấy rõ giá trị của `super`:

```javascript
export const DisableableMixin = dedupingMixin((superClass) => {
  class DisableableMixinImpl extends superClass {
    static get properties() {
      return {
        disabled: {type: Boolean, value: false, reflectToAttribute: true},
      };
    }

    toggle() {
      if (this.disabled) return;      // thêm điều kiện của mình
      super.toggle();                 // ← rồi CHẠY TIẾP bản của OpenableMixin
    }
  }
  return DisableableMixinImpl;
});
```

`DisableableMixin` **không thay thế** `toggle()` của `OpenableMixin` — nó **bọc quanh**: kiểm tra thêm một điều kiện, rồi gọi tiếp bản gốc.

Kết quả chạy thật:

```text
panel.toggle()          → opened = true
panel.disabled = true
panel.toggle()          → opened VẪN = true   (DisableableMixin chặn lại)
```

Đây đúng là thứ Behaviors ở mục 2 bó tay: hai behavior cùng có `toggle()` thì cái sau đè mất cái trước, không có cách nào gọi lại.

> **Đọc chuỗi mixin từ trong ra ngoài.** `DisableableMixin(OpenableMixin(PolymerElement))`: `OpenableMixin` áp trước (gần `PolymerElement`), `DisableableMixin` áp sau (gần `MyPanel`). Cái **gần bạn hơn thì thắng** khi trùng tên — nên `toggle()` của `DisableableMixin` chạy trước, rồi nó gọi `super.toggle()` xuống bản của `OpenableMixin`.

## 6. Thêm lifecycle vào mixin

Mixin làm được cả những việc cần móc vào vòng đời element. Thêm: nhấn `Escape` thì đóng.

```javascript
connectedCallback() {
  super.connectedCallback();            // ← setup: super gọi ĐẦU
  this.esc_ = (e) => { if (e.key === 'Escape') this.close(); };
  document.addEventListener('keydown', this.esc_);
}

disconnectedCallback() {
  document.removeEventListener('keydown', this.esc_);
  super.disconnectedCallback();         // ← teardown: super gọi CUỐI
}
```

Viết một lần trong `OpenableMixin`, mọi component dùng mixin đều có. Và quan trọng: **dọn dẹp được đóng gói cùng chỗ với đăng ký**, nên không component nào quên gỡ listener nữa.

> Vị trí đặt `super` — đầu hay cuối — quyết định thứ tự chạy. Bài 2 sẽ giải thích kỹ vì sao setup thì `super` đầu, teardown thì `super` cuối.

## 7. Khi nào dùng mixin, khi nào không

**Dùng mixin khi hội đủ:**

- Logic được dùng ở **từ 3 component trở lên**, và
- cần **property / state** gắn theo từng element, hoặc
- cần **móc vào lifecycle**, hoặc
- cần **thêm method vào chính element** để template hay code ngoài gọi được (`el.toggle()`).

**Không dùng mixin khi:**

| Tình huống | Dùng gì thay thế |
|---|---|
| Chỉ tính toán, không giữ state | Hàm thuần — `export function` |
| Chỉ 1–2 component xài | Viết thẳng vào component |
| Cần state + lifecycle nhưng **không** cần thêm API lên element | **ReactiveController** (Lit — bài 4) |
| Cần dùng **nhiều bản cùng lúc** trong một element | **ReactiveController** — mixin chỉ cho một bản |

> Câu hỏi sàng lọc nhanh: *"Thứ này có cần trở thành một phần của bản thân element không?"*
> Có → mixin. Không → hàm thuần hoặc controller.

## Tóm tắt bài 1

- Mixin sinh ra để giải bài toán: **nhiều component cùng cần một khả năng**, mà JavaScript chỉ cho **một class cha**.
- **Định nghĩa:** hàm nhận class → trả class con mới đã thêm tính năng. Khuôn: `(superClass) => class extends superClass { }`.
- Nó **không copy method**; nó **chèn một mắt xích** vào chuỗi kế thừa → nhờ vậy `super` chạy được.
- **Behaviors** (Polymer 1) là object thường, **không có `super`** → hai behavior trùng tên method thì đè nhau im lặng. Đây là lý do Polymer 3 bỏ nó.
- Mixin Polymer là một **mảnh component đầy đủ**: `properties`, `computed`, `observer`, `reflectToAttribute`, lifecycle — chạy hết từ bên trong mixin.
- `super.toggle()` cho phép một mixin **bọc quanh** method của mixin khác thay vì đè mất.

**Bài kế tiếp** → [Bài 2: Luồng chạy của mixin](02-luong-chay-cua-mixin.md)
