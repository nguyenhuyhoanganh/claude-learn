# Bài 4: Mixin trong Lit — và người thay thế nó, ReactiveController

> Mục tiêu: viết được mixin cho Lit đúng chuẩn, và biết **khi nào không nên dùng mixin** vì Lit có công cụ tốt hơn.

## 1. Tin tốt: cơ chế y hệt

Lit không phát minh gì mới về mixin. `LitElement` là một ES6 class, nên mixin ở bài 1–2 áp dụng nguyên xi:

Lấy đúng `OpenableMixin` của bài 3, viết lại bằng Lit:

```javascript
import {LitElement, html} from 'lit';

const OpenableMixin = (Base) => class extends Base {
  static properties = {
    opened: {type: Boolean, reflect: true},
  };

  constructor() {
    super();
    this.opened = false;              // Lit không có `value:` → gán ở đây
  }

  get nhan() { return this.opened ? 'Đang mở' : 'Đang đóng'; }

  toggle() { this.opened = !this.opened; }
  open()   { this.opened = true; }
  close()  { this.opened = false; }
};

class MyPanel extends OpenableMixin(LitElement) {
  static properties = {tieuDe: {type: String}};

  constructor() { super(); this.tieuDe = 'Bảng'; }

  render() {
    return html`<h3 @click=${this.toggle}>${this.tieuDe} — ${this.nhan}</h3>`;
  }
}
customElements.define('my-panel', MyPanel);
```

So với bản Polymer ở bài 3: **dòng `(Base) => class extends Base` giống hệt**, `toggle/open/close` giống hệt. Chỉ phần khai báo property và template là khác.

Khác biệt nằm đúng ở 3 chỗ: **cách khai báo property**, **các hook lifecycle**, và **không có deduping sẵn**. Bài 5 sẽ đối chiếu từng dòng.

## 2. `static properties` — vẫn gộp tự động

Lit gom `properties` từ toàn bộ prototype chain, giống Polymer:

```javascript
const DisableableMixin = (Base) => class extends Base {
  static properties = {disabled: {type: Boolean, reflect: true}};
  constructor() { super(); this.disabled = false; }
  toggle() {
    if (this.disabled) return;
    super.toggle();                   // ← bọc quanh toggle() của OpenableMixin
  }
};

class MyPanel extends DisableableMixin(OpenableMixin(LitElement)) {
  static properties = {tieuDe: {type: String}};
  constructor() { super(); this.tieuDe = 'Bảng'; }
}
```

Kiểm chứng thật — Lit gộp property từ cả hai mixin lẫn element:

```text
MyPanel.elementProperties có 'opened'   (OpenableMixin)    : true
MyPanel.elementProperties có 'disabled' (DisableableMixin) : true
MyPanel.elementProperties có 'tieuDe'   (chính element)    : true

panel.toggle()          → opened = true
panel.disabled = true
panel.toggle()          → opened VẪN = true   (chặn qua super, y như Polymer)
```

→ `static properties` là **class field**, không phải static getter như Polymer, nhưng Lit vẫn đi ngược chain để gộp. Cả hai property đều reactive, đều xuất hiện trong `changedProperties`.

> **Lưu ý về giá trị khởi tạo.** Polymer khai báo `value: 0` ngay trong `properties`. Lit không có chỗ đó — phải gán trong `constructor` (hoặc dùng class field). Đây là khác biệt nhỏ nhưng gây lỗi `undefined` rất thường xuyên khi migrate.

Với decorator (cần TypeScript hoặc Babel):

```typescript
const OpenableMixin = <T extends Constructor<LitElement>>(Base: T) => {
  class OpenableMixinImpl extends Base {
    @property({type: Boolean, reflect: true}) opened = false;
  }
  return OpenableMixinImpl;
};
```

## 3. Lifecycle của Lit — nhiều hook hơn Polymer

```text
constructor()
      │
      ▼
connectedCallback()
      │
      ▼
[ property thay đổi ]  ─────┐
      │                     │  gom lại, chờ tới microtask kế tiếp
      ▼                     │  (nhiều thay đổi → CHỈ MỘT lần update)
shouldUpdate()  ────────────┘  trả false → dừng, không render
      │
      ▼
willUpdate(changed)      ← tính toán trước khi render (nơi mixin hay hook)
      │
      ▼
update(changed)          ← Lit gọi render() rồi patch DOM
      │
      ├─► render()
      │
      ▼
firstUpdated(changed)    ← CHỈ lần đầu; DOM đã có thật, đo đạc được
      │
      ▼
updated(changed)         ← mọi lần; đọc DOM sau khi patch xong
      │
      ▼
[ await el.updateComplete ]
      │
      ▼
disconnectedCallback()
```

Ba hook không có tương đương trực tiếp ở Polymer:

| Hook | Dùng làm gì |
|---|---|
| `shouldUpdate(changed)` | Chặn render. Trả `false` → bỏ qua vòng update |
| `willUpdate(changed)` | Tính giá trị dẫn xuất **trước** khi render — đây là nơi thay thế `computed` của Polymer |
| `updated(changed)` | Thay thế `observers` của Polymer |

Trace thật từ một mixin hook vào lifecycle:

```text
  LoggerMixin.constructor
MyLit.constructor
MyLit.connectedCallback — trước super
  LoggerMixin.connectedCallback — trước super
MyLit.willUpdate
  LoggerMixin.willUpdate  đổi=[logCount,own]
MyLit.render
MyLit.firstUpdated
  LoggerMixin.updated     đổi=[logCount,own]
MyLit.updated
```

→ `đổi=[...]` chính là `changedProperties`: chứa property của **cả** mixin lẫn class.

## 4. Không có `dedupingMixin` — tự lo

Lit **không** cung cấp hàm deduping. Kiểm chứng:

```javascript
M(M(LitElement)) === M(LitElement)   // false
```

Và cái giá phải trả, đo thật:

```text
1 element, mixin áp MỘT lần  → constructor mixin chạy 1 lần
1 element, mixin áp HAI lần  → constructor mixin chạy 2 lần
```

Tự viết (xem bài 2 mục 5 để hiểu vì sao cần **cả hai** phần):

```javascript
function dedupeMixin(mixin) {
  const cache = new WeakMap();
  const marker = Symbol('mixin-applied');

  return (Base) => {
    if (Base[marker]) return Base;                 // chuỗi đã có → không bọc thêm
    if (cache.has(Base)) return cache.get(Base);   // đã áp lên Base này → dùng lại

    const Klass = mixin(Base);
    Object.defineProperty(Klass, marker, {value: true});
    cache.set(Base, Klass);
    return Klass;
  };
}

const LoggerMixin = dedupeMixin((Base) => class extends Base { /* ... */ });

LoggerMixin(LoggerMixin(LitElement)) === LoggerMixin(LitElement);   // true ✅
```

> ⚠️ Bản chỉ có `WeakMap` (rất hay gặp trên blog) **không đủ**: nó vẫn cho `M(M(Base)) !== M(Base)` và vẫn chạy nhân đôi ở ca kế thừa. Phải có dấu đánh `marker`.

> Thư viện `@open-wc/dedupe-mixin` làm đúng việc này nếu bạn không muốn tự viết. Trong Chromium, code Lit mới thường tránh vấn đề bằng cách **không xếp chồng sâu** — kèm với ReactiveController ở mục sau.

## 5. Mixin TypeScript trong Lit

```typescript
import {LitElement} from 'lit';
import {property} from 'lit/decorators.js';

type Constructor<T = {}> = new (...args: any[]) => T;

export declare class OpenableMixinInterface {
  opened: boolean;
  readonly nhan: string;
  toggle(): void;
  open(): void;
  close(): void;
}

export const OpenableMixin = <T extends Constructor<LitElement>>(Base: T) => {
  class OpenableMixinImpl extends Base {
    @property({type: Boolean, reflect: true}) opened = false;

    get nhan(): string { return this.opened ? 'Đang mở' : 'Đang đóng'; }

    toggle(): void { this.opened = !this.opened; }
    open(): void   { this.opened = true; }
    close(): void  { this.opened = false; }
  }
  return OpenableMixinImpl as Constructor<OpenableMixinInterface> & T;
};
```

Dùng:

```typescript
const MyPanelBase = OpenableMixin(LitElement);

class MyPanel extends MyPanelBase {
  render() {
    // TypeScript biết this.toggle() và this.nhan tồn tại
    return html`<h3 @click=${this.toggle}>${this.nhan}</h3>`;
  }
}
```

Hai chi tiết TypeScript:

- **`declare class`** thay vì `interface` — cần khi mixin có property dùng decorator, để TypeScript không đòi khởi tạo.
- **Ép kiểu `as Constructor<Interface> & T`** ở cuối — nếu không, kiểu của property decorator bị mất khi ra khỏi hàm.

Dùng:

```typescript
class MyPanel extends OpenableMixin(LitElement) {
  @property({type: String}) tieuDe = 'Bảng';

  render() {
    return html`
      <h3 @click=${this.toggle}>${this.tieuDe} — ${this.nhan}</h3>
      ${this.opened ? html`<div><slot></slot></div>` : ''}`;
  }
}
```

## 6. ReactiveController — cách làm "đúng Lit" hơn

Đây là phần quan trọng nhất của bài. Lit đưa ra **ReactiveController** và khuyến nghị dùng nó **thay cho mixin trong đa số trường hợp**.

### Controller là gì

Mixin **chèn một mắt xích vào chuỗi kế thừa**. Controller thì không đụng gì tới chuỗi đó — nó chỉ là một **object thường**, gắn vào element và được element gọi lại ở các mốc lifecycle.

Giao thức chỉ có 4 hook, đều không bắt buộc:

| Hook | Gọi khi |
|---|---|
| `hostConnected()` | Element vào DOM |
| `hostDisconnected()` | Element rời DOM |
| `hostUpdate()` | Trước khi element render |
| `hostUpdated()` | Sau khi element render xong |

### Ví dụ: đóng panel khi click ra ngoài

Tiếp tục bài toán panel. Ta muốn: đang mở mà click ra ngoài thì tự đóng.

```javascript
class ClickOutsideController {
  constructor(host, khiRaNgoai) {
    this.host = host;
    this.khiRaNgoai = khiRaNgoai;
    host.addController(this);           // ← đăng ký với element
  }

  hostConnected() {
    this.xuLy_ = (e) => {
      // composedPath() xuyên qua được shadow DOM
      if (!e.composedPath().includes(this.host)) {
        this.khiRaNgoai();
      }
    };
    document.addEventListener('click', this.xuLy_);
  }

  hostDisconnected() {
    document.removeEventListener('click', this.xuLy_);   // tự dọn dẹp
  }
}
```

Ghép với `OpenableMixin`:

```javascript
class MyPanel extends OpenableMixin(LitElement) {
  ngoai = new ClickOutsideController(this, () => this.close());

  render() {
    return html`<h3 @click=${this.toggle}>${this.nhan}</h3>`;
  }
}
```

Kết quả chạy thật:

```text
panel.open()                 → opened = true      (method của MIXIN)
click ra ngoài panel         → opened = false     (CONTROLLER gọi close())
element rời DOM, click tiếp  → không chạy nữa     (hostDisconnected đã gỡ listener)
```

Để ý sự phân vai rất rõ:

- **`OpenableMixin`** cung cấp `opened`, `toggle()`, `close()` — thứ **phải nằm trên chính element**, vì template và code bên ngoài gọi `panel.close()`.
- **`ClickOutsideController`** chỉ cần lifecycle và một callback. Nó **không cần** thêm gì lên element.

### Điều mixin không làm được: nhiều bản cùng lúc

Đây là khác biệt quyết định. Một mixin áp lên một class chỉ cho **một** bản — nó chỉ có một `this.opened`. Controller thì `new` bao nhiêu lần cũng được:

```javascript
class MyDialog extends LitElement {
  // Hai vùng theo dõi độc lập, trong CÙNG một element
  vungA = new ClickOutsideController(this, () => this.dongA());
  vungB = new ClickOutsideController(this, () => this.dongB());
}
```

Kiểm chứng thật: click một lần, **cả hai** controller đều chạy, mỗi bản giữ state riêng. Viết bằng mixin thì bó tay — bạn không thể áp `ClickOutsideMixin` hai lần lên cùng một class (và `dedupeMixin` còn chủ động ngăn điều đó).

### Bảng so sánh

| | Mixin | ReactiveController |
|---|---|---|
| Ảnh hưởng prototype chain | Có — chèn mắt xích | **Không** — chỉ là object |
| Trùng tên method | Có thể đè nhau | **Không thể** — nằm trong namespace riêng (`this.ngoai.…`) |
| Cần deduping | Có | **Không** — tạo bao nhiêu bản cũng được |
| Nhiều bản trong một element | ❌ Không | ✅ Được |
| Thêm API lên chính element | ✅ | ❌ (cố ý — truy cập qua object) |
| Truyền tham số lúc tạo | Khó | ✅ Dễ — `new C(this, thamSo)` |
| Test riêng lẻ | Khó — phải dựng element | **Dễ** — host giả là đủ |
| Dùng được ngoài Lit | Có (JS thuần) | Cần host cài giao thức |

Điểm cốt lõi: **controller là composition, mixin là inheritance.** Composition không có bẫy trùng tên và không có bẫy deduping — hai bẫy lớn nhất của mixin (bài 2).

### Chọn cái nào

```text
Thứ này có cần thêm method/property lên CHÍNH element không?
(để template, hoặc code bên ngoài, gọi được el.foo())
        │
        ├── CÓ ──────────► Mixin
        │                  vd: opened + toggle() — template bind [[opened]],
        │                      component cha gọi panel.close()
        │
        └── KHÔNG ───────► ReactiveController
                           vd: click ra ngoài, theo dõi kích thước, timer,
                               fetch state, kết nối WebSocket
```

Câu hỏi phụ giúp chốt nhanh: **"Có khi nào tôi cần hai bản của thứ này trong một element không?"** Nếu có → chắc chắn là controller.

### Một ví dụ nữa: theo dõi kích thước

```javascript
class ResizeController {
  constructor(host) {
    this.host = host;
    this.width = 0;
    host.addController(this);
  }
  hostConnected() {
    this.ro_ = new ResizeObserver(([entry]) => {
      this.width = entry.contentRect.width;
      this.host.requestUpdate();        // chủ động yêu cầu render lại
    });
    this.ro_.observe(this.host);
  }
  hostDisconnected() { this.ro_.disconnect(); }
}
```

`this.host.requestUpdate()` là cách controller kích hoạt render — nó không có property reactive của riêng mình, nên phải báo cho host.

Viết thành mixin cũng được. Nhưng khi một element cần theo dõi **hai** phần tử khác nhau thì mixin bó tay, còn controller chỉ cần `new` hai lần.

## 7. Bẫy riêng của Lit

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Quên `super.connectedCallback()` | **Không render, không báo lỗi** | Luôn gọi super đầu tiên |
| Quên deduping | Mixin chạy 2 lần | `dedupeMixin` ở mục 4 (WeakMap + dấu đánh) |
| Quên khởi tạo property trong constructor | Render ra `undefined` | Gán giá trị mặc định trong `constructor` |
| Đổi property trong `updated()` | Kích hoạt vòng update mới → có thể lặp vô hạn | Chuyển logic sang `willUpdate()` |
| Dùng decorator không có build step | Cú pháp lỗi | `static properties = {...}` nếu chạy JS thuần |
| Mixin chỉ để gom state + lifecycle | Phức tạp không cần thiết | Dùng ReactiveController |

### Vì sao `updated()` nguy hiểm hơn bạn nghĩ

```javascript
updated(changed) {
  super.updated(changed);
  if (changed.has('items')) {
    this.count = this.items.length;   // ← set property trong updated
  }                                    //   → kích hoạt update lần nữa
}
```

Mỗi lần set sẽ đặt lịch một vòng render nữa. Với một property thì chỉ tốn thêm một vòng; nhưng nếu hai property update chéo nhau thì thành vòng lặp vô tận. Chuyển sang `willUpdate()` thì giá trị được tính **trước** khi render, chỉ tốn một vòng:

```javascript
willUpdate(changed) {
  super.willUpdate(changed);
  if (changed.has('items')) {
    this.count = this.items.length;   // ✅ an toàn, cùng một vòng render
  }
}
```

## Tóm tắt bài 4

- Cơ chế mixin của Lit **giống hệt** JS thuần — `LitElement` chỉ là một class.
- `static properties` (class field) được Lit gộp qua cả chuỗi, y như Polymer.
- Giá trị mặc định phải gán trong `constructor` — Lit không có `value:` như Polymer.
- Lifecycle nhiều hook hơn: `shouldUpdate` → `willUpdate` → `update`/`render` → `firstUpdated` → `updated`.
- **Lit không có `dedupingMixin`** — tự viết (WeakMap **cộng** dấu đánh) hoặc dùng `@open-wc/dedupe-mixin`.
- **ReactiveController là lựa chọn mặc định nên cân nhắc trước.** Chỉ dùng mixin khi cần thêm API lên chính element.
- Tính giá trị dẫn xuất ở `willUpdate()`, không phải `updated()`.

**Bài kế tiếp** → [Bài 5: So sánh chi tiết Polymer ↔ Lit](05-so-sanh-polymer-vs-lit.md)
