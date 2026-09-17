# Bài 5: So sánh chi tiết — mixin khi ở Polymer và khi nâng lên Lit

> Mục tiêu: cầm một mixin Polymer bất kỳ trong Chromium và chuyển nó sang Lit mà không vỡ hành vi.

Bài này là phần trọng tâm của buổi trình bày. Ba góc so sánh: **cú pháp**, **luồng chạy**, **ví dụ hoàn chỉnh**.

## 1. Điều không đổi

Trước khi nói khác biệt, cần nói rõ phần **giống nhau**, vì nó là phần lớn:

| Vẫn y nguyên | Chi tiết |
|---|---|
| Định nghĩa mixin | `(Base) => class extends Base {}` — giống hệt |
| Prototype chain | Vẫn chèn mắt xích, vẫn `A(B(C(Base)))` |
| Thứ tự constructor | Vẫn base-first, JS ép buộc |
| Quy tắc `super` | Setup super đầu, teardown super cuối |
| `properties` được gộp qua chain | Cả hai framework đều đi ngược chain gom lại |
| Trùng tên method → gần nhất thắng | Quy tắc JS, không đổi |
| Bẫy quên `super` | Vẫn hỏng im lặng ở cả hai |

> **Thông điệp chính:** migrate mixin Polymer → Lit **không phải học lại khái niệm**. Bạn chỉ đổi 3 thứ: cách khai báo property, tên hook lifecycle, và tự lo deduping.

## 2. So sánh cú pháp

### Bảng đối chiếu

| Việc | Polymer 3 | Lit 3 |
|---|---|---|
| Import deduping | `import {dedupingMixin} from '.../mixin.js'` | **Không có** — tự viết |
| Bọc mixin | `dedupingMixin((sc) => class extends sc {})` | `(Base) => class extends Base {}` |
| Khai báo property | `static get properties() { return {...}; }` | `static properties = {...}` hoặc `@property` |
| Giá trị mặc định | `{type: Number, value: 0}` | Gán trong `constructor` |
| Phản chiếu ra attribute | `reflectToAttribute: true` | `reflect: true` |
| Property chỉ đọc | `readOnly: true` + `this._setX(v)` | Không có sẵn — dùng getter + field private |
| Thông báo ra ngoài | `notify: true` (tự bắn `x-changed`) | Không có — tự `dispatchEvent` |
| Giá trị dẫn xuất | `computed: 'fn_(a,b)'` | Getter, hoặc gán trong `willUpdate()` |
| Theo dõi thay đổi | `static get observers()` / `observer:` | `updated(changed)` / `willUpdate(changed)` |
| Hook khởi tạo | `ready()` | `firstUpdated()` / `connectedCallback()` |
| Hook mỗi lần render | — (Polymer cập nhật từng binding) | `updated(changed)` |
| Ép render lại | `this.notifyPath(...)` | `this.requestUpdate()` |
| Chờ render xong | `afterNextRender(this, fn)` | `await this.updateComplete` |
| Template | `static get template()` + `[[prop]]` | `render()` + `${this.prop}` |

### Cùng một mixin, hai cách viết

Lấy đúng `OpenableMixin` xuyên suốt tài liệu, đặt hai bản cạnh nhau.

**Polymer 3**

```javascript
import {dedupingMixin} from 'chrome://resources/polymer/v3_0/polymer/lib/utils/mixin.js';

export const OpenableMixin = dedupingMixin((superClass) => {
  class OpenableMixinImpl extends superClass {
    static get properties() {                      // ① static GETTER
      return {
        opened: {
          type: Boolean,
          value: false,                            // ② mặc định khai báo tại chỗ
          reflectToAttribute: true,                // ③ tên dài
          observer: 'openedChanged_',              // ④ observer khai báo
        },
        nhan: {type: String, computed: 'tinhNhan_(opened)'},   // ⑤ computed khai báo
      };
    }

    connectedCallback() {
      super.connectedCallback();
      this.esc_ = (e) => { if (e.key === 'Escape') this.close(); };
      document.addEventListener('keydown', this.esc_);
    }

    disconnectedCallback() {
      document.removeEventListener('keydown', this.esc_);
      super.disconnectedCallback();
    }

    toggle() { this.opened = !this.opened; }       // ⑥ giống hệt hai bên
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

**Lit 3**

```javascript
// ⓪ Lit không có dedupingMixin → tự viết (bài 2 mục 5 giải thích vì sao cần cả `marker`)
function dedupeMixin(mixin) {
  const cache = new WeakMap();
  const marker = Symbol('mixin-applied');
  return (Base) => {
    if (Base[marker]) return Base;
    if (cache.has(Base)) return cache.get(Base);
    const Klass = mixin(Base);
    Object.defineProperty(Klass, marker, {value: true});
    cache.set(Base, Klass);
    return Klass;
  };
}

export const OpenableMixin = dedupeMixin((Base) => {
  class OpenableMixinImpl extends Base {
    static properties = {                          // ① static FIELD
      opened: {
        type: Boolean,
        reflect: true,                             // ③ tên ngắn
      },
      // ④ không có observer, ⑤ không có computed
    };

    constructor() {
      super();
      this.opened = false;                         // ② mặc định gán ở đây
    }

    get nhan() {                                   // ⑤ computed → getter thường
      return this.opened ? 'Đang mở' : 'Đang đóng';
    }

    connectedCallback() {
      super.connectedCallback();
      this.esc_ = (e) => { if (e.key === 'Escape') this.close(); };
      document.addEventListener('keydown', this.esc_);
    }

    disconnectedCallback() {
      document.removeEventListener('keydown', this.esc_);
      super.disconnectedCallback();
    }

    toggle() { this.opened = !this.opened; }       // ⑥ giống hệt hai bên
    open()   { this.opened = true; }
    close()  { this.opened = false; }

    updated(changed) {                             // ④ observer → updated()
      super.updated(changed);
      if (changed.has('opened')) {
        this.dispatchEvent(new CustomEvent('opened-changed',
            {detail: {value: this.opened}}));
      }
    }
  }
  return OpenableMixinImpl;
});
```

Khác biệt, đối chiếu theo số đánh dấu:

| # | Polymer | Lit | Vì sao |
|---|---|---|---|
| ⓪ | `dedupingMixin()` có sẵn | tự viết `dedupeMixin` | Lit không cung cấp |
| ① | `static get properties()` | `static properties = {}` | Khác cú pháp, **cùng cơ chế gộp qua chain** |
| ② | `value: false` tại chỗ | gán trong `constructor` | Lit không có khái niệm `value:` |
| ③ | `reflectToAttribute` | `reflect` | Chỉ khác tên |
| ④ | `observer: 'openedChanged_'` | `updated(changed)` + kiểm tra `changed.has()` | Lit không có observer theo property |
| ⑤ | `computed: 'tinhNhan_(opened)'` | getter thường | Lit không có computed |
| ⑥ | `toggle/open/close` | **giống hệt** | Phần logic thuần không đổi chút nào |
| — | `connectedCallback` + `super` | **giống hệt** | Lifecycle hook trùng tên, trùng quy tắc `super` |

> **Đọc bảng này xong là nắm được 80% việc migrate.** Phần khung mixin (`(Base) => class extends Base`), phần method, phần lifecycle — **không đổi gì**. Chỉ phần *khai báo property* và *cách phản ứng khi property đổi* là phải viết lại.

## 3. So sánh luồng chạy

Đây là khác biệt **sâu** nhất, không chỉ đổi tên.

### Polymer — cập nhật từng binding

```text
this.count = 5
      │
      ▼
setter của Polymer chặn lại
      │
      ├─► so sánh giá trị cũ/mới, khác thì mới đi tiếp
      ├─► chạy computed phụ thuộc `count`
      ├─► chạy observers của `count`
      └─► cập nhật ĐÚNG những binding [[count]] trong template
            (không đụng phần còn lại của template)
      │
      ▼
DOM đổi — ĐỒNG BỘ, ngay trong lệnh gán
```

Điểm mấu chốt: **đồng bộ**. Sau `this.count = 5`, DOM đã đổi ngay dòng sau.

### Lit — render lại rồi so sánh

```text
this.count = 5
      │
      ▼
setter của Lit ghi nhận `count` vào changedProperties
      │
      └─► requestUpdate() → đặt lịch cho microtask kế tiếp
                                  │
      [ nhiều lệnh gán khác gom chung vào đây ]
                                  │
                                  ▼
                            shouldUpdate(changed)
                            willUpdate(changed)
                            update(changed)
                                  ├─► render() — chạy LẠI TOÀN BỘ template
                                  └─► lit-html so sánh, chỉ patch chỗ khác
                            firstUpdated() / updated(changed)
      │
      ▼
DOM đổi — BẤT ĐỒNG BỘ, phải `await el.updateComplete`
```

Điểm mấu chốt: **bất đồng bộ và gom nhóm**. Gán 10 property liên tiếp → chỉ **một** lần render.

### Hệ quả cho mixin

Đây là chỗ mixin Polymer hay vỡ khi bê thẳng sang Lit:

```javascript
// Polymer — chạy đúng
someMethod() {
  this.value = 42;
  const el = this.shadowRoot.querySelector('.result');
  console.log(el.textContent);       // "42" ✅ DOM đã cập nhật
}

// Lit — bê nguyên sang thì SAI
someMethod() {
  this.value = 42;
  const el = this.shadowRoot.querySelector('.result');
  console.log(el.textContent);       // giá trị CŨ ❌ chưa render
}

// Lit — cách đúng
async someMethod() {
  this.value = 42;
  await this.updateComplete;         // ← chờ render xong
  const el = this.shadowRoot.querySelector('.result');
  console.log(el.textContent);       // "42" ✅
}
```

> **Bẫy migrate số 1.** Mixin nào đọc DOM ngay sau khi set property đều phải thêm `await this.updateComplete`.

### Bảng đối chiếu lifecycle

| Mốc | Polymer | Lit | Ghi chú khi chuyển |
|---|---|---|---|
| Tạo instance | `constructor()` | `constructor()` | Giống. Lit thêm: khởi tạo giá trị mặc định ở đây |
| Gắn vào DOM | `connectedCallback()` | `connectedCallback()` | Giống |
| Khởi tạo một lần | `ready()` | `firstUpdated()` | ⚠️ **Không tương đương hoàn toàn** — xem dưới |
| Trước khi render | — | `willUpdate(changed)` | Nơi thay `computed` |
| Sau khi render | — | `updated(changed)` | Nơi thay `observers` |
| Giá trị dẫn xuất | `computed: 'fn_(a)'` | getter hoặc `willUpdate` | |
| Theo dõi đổi | `observers: ['fn_(a)']` | `updated(changed)` | |
| Gỡ khỏi DOM | `disconnectedCallback()` | `disconnectedCallback()` | Giống |

### `ready()` ≠ `firstUpdated()`

Khác biệt tinh tế nhưng gây bug:

| | Polymer `ready()` | Lit `firstUpdated()` |
|---|---|---|
| Chạy khi nào | Trong `connectedCallback` **đầu tiên** | Sau vòng render **đầu tiên** |
| Shadow DOM đã có? | Có (template vừa stamp) | Có (vừa render) |
| Property đã có giá trị? | Có | Có |
| Đồng bộ với connect? | **Có** | **Không** — chạy ở microtask sau |

Nghĩa là code trong `firstUpdated()` chạy **muộn hơn** so với `ready()`. Nếu mixin của bạn cần làm việc gì đó *ngay khi element vào DOM* (vd: đăng ký vào một registry toàn cục), hãy đặt ở `connectedCallback()`, đừng đặt ở `firstUpdated()`.

## 4. Tương ứng từng tính năng

### `computed` → getter

```javascript
// Polymer
static get properties() {
  return {
    first: String,
    last: String,
    full: {type: String, computed: 'computeFull_(first, last)'},
  };
}
computeFull_(f, l) { return `${f} ${l}`; }
```

```javascript
// Lit — cách 1: getter (đơn giản nhất, tính lại mỗi lần render)
static properties = {first: {type: String}, last: {type: String}};
get full() { return `${this.first} ${this.last}`; }

// Lit — cách 2: willUpdate (khi tính toán nặng, hoặc cần `full` là reactive)
static properties = {first: {}, last: {}, full: {}};
willUpdate(changed) {
  super.willUpdate(changed);
  if (changed.has('first') || changed.has('last')) {
    this.full = `${this.first} ${this.last}`;
  }
}
```

Dùng getter khi tính toán rẻ (đa số trường hợp). Dùng `willUpdate` khi tính toán tốn kém hoặc cần property đó nằm trong `changedProperties` của vòng sau.

### `observers` → `updated`

```javascript
// Polymer
static get observers() { return ['onUserChanged_(user.name, user.age)']; }
onUserChanged_(name, age) { console.log(name, age); }
```

```javascript
// Lit
updated(changed) {
  super.updated(changed);
  if (changed.has('user')) {
    console.log(this.user.name, this.user.age);
  }
}
```

⚠️ **Khác biệt lớn:** Polymer theo dõi được **đường dẫn con** (`user.name`). Lit chỉ theo dõi **toàn bộ object** — và chỉ khi tham chiếu đổi:

```javascript
// Lit: KHÔNG kích hoạt update — cùng một object
this.user.name = 'Ann';

// Lit: kích hoạt update — object mới
this.user = {...this.user, name: 'Ann'};
```

> **Bẫy migrate số 2.** Mọi chỗ mixin Polymer dùng `this.set('user.name', v)` phải đổi thành gán object mới trong Lit.

### `notify: true` → `dispatchEvent` thủ công

```javascript
// Polymer — tự bắn 'value-changed', binding {{}} tự bắt
static get properties() {
  return {value: {type: String, notify: true}};
}
```

```javascript
// Lit — tự làm
set value(v) {
  const old = this._value;
  this._value = v;
  this.requestUpdate('value', old);
  this.dispatchEvent(new CustomEvent('value-changed', {
    detail: {value: v},
    bubbles: true,
    composed: true,
  }));
}
get value() { return this._value; }
```

Lit bỏ two-way binding có chủ đích — luồng dữ liệu một chiều dễ suy luận hơn. Giá phải trả là code dài hơn.

### `readOnly: true` → quy ước

Giả sử `opened` chỉ được đổi qua `toggle()/open()/close()`, không ai gán thẳng.

```javascript
// Polymer: readOnly sinh ra this._setOpened()
opened: {type: Boolean, value: false, readOnly: true}

toggle() { this._setOpened(!this.opened); }   // gán thẳng this.opened = ... sẽ BÁO LỖI
```

```javascript
// Lit: không có cơ chế tương đương. Hai lựa chọn:

// (a) Quy ước — đơn giản, không ép buộc
static properties = {opened: {type: Boolean, reflect: true}};
// tài liệu ghi rõ "chỉ đổi qua toggle/open/close"

// (b) Getter + field private — ép buộc thật sự
static properties = {opened: {type: Boolean, reflect: true}};
#opened = false;
get opened() { return this.#opened; }
_setOpened(v) {
  const cu = this.#opened;
  this.#opened = v;
  this.requestUpdate('opened', cu);     // ← phải gọi thủ công
}
toggle() { this._setOpened(!this.#opened); }
```

Cách (b) giữ đúng ngữ nghĩa Polymer. Lưu ý phải gọi `requestUpdate()` thủ công, vì Lit không thấy được thay đổi của field private — nó chỉ theo dõi những property nó tự tạo accessor.

Thực tế đa số code Lit chọn cách (a): đơn giản hơn, và `reflect: true` đã đủ để lộ trạng thái ra ngoài cho CSS.

## 5. Quy trình migrate — 7 bước

Áp dụng cho một mixin Polymer bất kỳ:

```text
1. Bỏ dedupingMixin của Polymer  →  thay bằng dedupeMixin tự viết
2. static get properties()       →  static properties = {...}
3. value: X                      →  gán this.x = X trong constructor
4. reflectToAttribute            →  reflect
5. readOnly + _setX()            →  getter + #private + requestUpdate()
6. ready()                       →  firstUpdated() HOẶC connectedCallback()
                                    (chọn connectedCallback nếu cần chạy sớm)
7. computed / observers          →  getter / willUpdate / updated
```

Rồi rà soát 3 bẫy:

```text
☐ Có chỗ nào đọc DOM ngay sau khi set property?  → thêm await this.updateComplete
☐ Có chỗ nào dùng this.set('a.b', v)?            → đổi thành gán object mới
☐ Có property nào notify: true?                  → thêm dispatchEvent thủ công
```

## 6. Ví dụ migrate hoàn chỉnh

Migrate `OpenableMixin` cùng với `DisableableMixin` — có đủ property, computed, observer, lifecycle, và `super` giữa hai mixin.

**Trước — Polymer 3**

```javascript
import {dedupingMixin} from 'chrome://resources/polymer/v3_0/polymer/lib/utils/mixin.js';

export const OpenableMixin = dedupingMixin((superClass) => {
  class OpenableMixinImpl extends superClass {
    static get properties() {
      return {
        opened:  {type: Boolean, value: false, reflectToAttribute: true,
                  observer: 'openedChanged_'},
        nhan:    {type: String, computed: 'tinhNhan_(opened)'},
      };
    }

    connectedCallback() {
      super.connectedCallback();
      this.esc_ = (e) => { if (e.key === 'Escape') this.close(); };
      document.addEventListener('keydown', this.esc_);
    }

    disconnectedCallback() {
      document.removeEventListener('keydown', this.esc_);
      super.disconnectedCallback();
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

export const DisableableMixin = dedupingMixin((superClass) => {
  class DisableableMixinImpl extends superClass {
    static get properties() {
      return {disabled: {type: Boolean, value: false, reflectToAttribute: true}};
    }
    toggle() {
      if (this.disabled) return;
      super.toggle();
    }
  }
  return DisableableMixinImpl;
});

class MyPanel extends DisableableMixin(OpenableMixin(PolymerElement)) {
  static get is() { return 'my-panel'; }
  static get properties() { return {tieuDe: {type: String, value: 'Bảng'}}; }
  static get template() {
    return html`
      <style>
        :host([opened]) .than { display: block; }
        :host([disabled]) { opacity: .5; }
        .than { display: none; }
      </style>
      <h3 on-click="toggle">[[tieuDe]] — [[nhan]]</h3>
      <div class="than"><slot></slot></div>`;
  }
}
customElements.define(MyPanel.is, MyPanel);
```

**Sau — Lit 3**

```javascript
function dedupeMixin(mixin) {
  const cache = new WeakMap();
  const marker = Symbol('mixin-applied');
  return (Base) => {
    if (Base[marker]) return Base;
    if (cache.has(Base)) return cache.get(Base);
    const Klass = mixin(Base);
    Object.defineProperty(Klass, marker, {value: true});
    cache.set(Base, Klass);
    return Klass;
  };
}

export const OpenableMixin = dedupeMixin((Base) => {
  class OpenableMixinImpl extends Base {
    static properties = {
      opened: {type: Boolean, reflect: true},        // ③ reflectToAttribute → reflect
    };

    constructor() {
      super();
      this.opened = false;                           // ② value: → constructor
    }

    get nhan() {                                     // ⑤ computed → getter
      return this.opened ? 'Đang mở' : 'Đang đóng';
    }

    connectedCallback() {
      super.connectedCallback();                     // không đổi
      this.esc_ = (e) => { if (e.key === 'Escape') this.close(); };
      document.addEventListener('keydown', this.esc_);
    }

    disconnectedCallback() {
      document.removeEventListener('keydown', this.esc_);
      super.disconnectedCallback();                  // teardown: super CUỐI
    }

    toggle() { this.opened = !this.opened; }         // không đổi
    open()   { this.opened = true; }
    close()  { this.opened = false; }

    updated(changed) {                               // ④ observer → updated()
      super.updated(changed);
      if (changed.has('opened')) {
        this.dispatchEvent(new CustomEvent('opened-changed',
            {detail: {value: this.opened}}));
      }
    }
  }
  return OpenableMixinImpl;
});

export const DisableableMixin = dedupeMixin((Base) => {
  class DisableableMixinImpl extends Base {
    static properties = {disabled: {type: Boolean, reflect: true}};
    constructor() { super(); this.disabled = false; }
    toggle() {
      if (this.disabled) return;
      super.toggle();                                // ← `super` giữa hai mixin: KHÔNG ĐỔI
    }
  }
  return DisableableMixinImpl;
});

class MyPanel extends DisableableMixin(OpenableMixin(LitElement)) {
  static properties = {tieuDe: {type: String}};

  static styles = css`
    :host([opened]) .than { display: block; }
    :host([disabled]) { opacity: .5; }
    .than { display: none; }
  `;

  constructor() { super(); this.tieuDe = 'Bảng'; }

  render() {
    return html`
      <h3 @click=${this.toggle}>${this.tieuDe} — ${this.nhan}</h3>
      <div class="than"><slot></slot></div>`;
  }
}
customElements.define('my-panel', MyPanel);
```

Đối chiếu từng thay đổi:

| # | Polymer | Lit | Lý do |
|---|---|---|---|
| 1 | `dedupingMixin` | `dedupeMixin` tự viết | Lit không có |
| 2 | `static get properties()` | `static properties =` | Khác cú pháp |
| 3 | `value: false` | gán trong constructor | Lit không có `value:` |
| 4 | `reflectToAttribute` | `reflect` | Khác tên |
| 5 | `computed: 'tinhNhan_(opened)'` | `get nhan()` | Lit không có computed |
| 6 | `observer: 'openedChanged_'` | `updated()` + `changed.has()` | Lit không có observer |
| 7 | `static get template()` + `[[...]]` | `render()` + `${...}` | Khác cơ chế template |
| 8 | `on-click="toggle"` | `@click=${this.toggle}` | Khác cú pháp bind event |
| 9 | CSS trong `<style>` của template | `static styles = css\`` | Lit tách riêng |
| — | `connectedCallback` + `super` | **giữ nguyên** | Lifecycle trùng tên, trùng quy tắc |
| — | `toggle/open/close` | **giữ nguyên** | Logic thuần không đổi |
| — | `super.toggle()` giữa hai mixin | **giữ nguyên** | Cơ chế `super` là của JS, không phải framework |

> Ba dòng cuối bảng là điểm quan trọng nhất: **bản thân cơ chế mixin không cần migrate.** Chỉ có phần giao tiếp với framework (khai báo property, phản ứng thay đổi, template) là phải viết lại.

### Đừng quên rà lại chỗ đọc DOM

Bản Polymer có thể có đoạn như thế này ở component dùng mixin:

```javascript
// Polymer — chạy đúng
moRoi_() {
  this.open();
  this.$.than.scrollIntoView();        // DOM đã cập nhật, .than đã hiện
}
```

Bê thẳng sang Lit thì **sai**, vì lúc đó `.than` vẫn còn `display: none`:

```javascript
// Lit — phải chờ
async moRoi_() {
  this.open();
  await this.updateComplete;           // ← thêm dòng này
  this.shadowRoot.querySelector('.than').scrollIntoView();
}
```

## 7. Bảng bẫy migrate

| Bẫy | Triệu chứng | Sửa |
|---|---|---|
| Đọc DOM ngay sau khi set property | Lấy được giá trị cũ | `await this.updateComplete` |
| `this.set('a.b', v)` | Không render lại | Gán object mới: `this.a = {...this.a, b: v}` |
| Sửa item trong mảng | Không render lại | `this.list = [...this.list]` |
| Quên deduping | Listener nhân đôi | `dedupeMixin` (WeakMap **+** dấu đánh) |
| `ready()` → `firstUpdated()` máy móc | Bỏ lỡ event sớm | Cân nhắc `connectedCallback()` |
| Quên `notify` | Component cha không nhận được thay đổi | `dispatchEvent` thủ công |
| Quên giá trị mặc định | Render ra `undefined` | Gán trong `constructor` |
| Set property trong `updated()` | Thêm vòng render, có thể lặp vô hạn | Chuyển sang `willUpdate()` |

## 8. Bảng tổng kết

| Tiêu chí | Polymer 3 | Lit 3 | Ai thắng |
|---|---|---|---|
| Khái niệm mixin | Subclass factory | Subclass factory | Hoà — giống hệt |
| Deduping | Có sẵn | Tự viết | **Polymer** |
| Khai báo property | Nhiều tính năng (`value`, `readOnly`, `notify`, `computed`) | Tối giản | **Polymer** (tính năng) / **Lit** (dễ hiểu) |
| Giá trị dẫn xuất | `computed` khai báo | Getter | **Lit** — JS thuần, debug dễ |
| Theo dõi thay đổi | `observers`, theo được path con | `updated`, chỉ theo tham chiếu | **Polymer** (mạnh hơn) / **Lit** (dễ đoán) |
| Luồng cập nhật | Đồng bộ, từng binding | Bất đồng bộ, gom nhóm | **Lit** — gom nhóm hiệu quả hơn |
| Lifecycle hook | Ít | Nhiều, rõ ràng | **Lit** |
| Hỗ trợ TypeScript | Được | Tốt hơn (decorator) | **Lit** |
| Lựa chọn thay thế mixin | Không có | **ReactiveController** | **Lit** |
| Kích thước | ~30 KB | ~5–7 KB | **Lit** |
| Đường cong học | Phải học DSL riêng | Gần JS thuần | **Lit** |

**Vì sao Chromium migrate:** không phải vì mixin Polymer tệ, mà vì Lit nhỏ hơn 5 lần, gần JavaScript chuẩn hơn (ít DSL để học), và có ReactiveController — công cụ giải quyết đúng những bài toán mà mixin làm nhưng không có bẫy trùng tên và deduping.

## Tóm tắt bài 5

- **Khái niệm mixin không đổi** giữa hai framework. Chỉ đổi 3 thứ: khai báo property, tên hook, và deduping.
- Khác biệt sâu nhất là **luồng cập nhật**: Polymer đồng bộ từng binding, Lit bất đồng bộ gom nhóm → mọi chỗ đọc DOM đều cần `await this.updateComplete`.
- `ready()` **không** tương đương `firstUpdated()`. Cần chạy sớm → dùng `connectedCallback()`.
- Polymer theo dõi được **path con** (`user.name`); Lit chỉ theo **tham chiếu** → phải gán object/mảng mới.
- Lit bỏ `computed`, `observers`, `notify`, `readOnly` — thay bằng getter, `willUpdate`, `updated`, `dispatchEvent`.
- Quy trình migrate 7 bước + 3 bẫy cần rà ở mục 5.
- Ở Lit, hỏi trước: *thứ này có cần là ReactiveController không?* Thường là có.

**Bài kế tiếp** → [Bài 6: Kịch bản demo](06-kich-ban-demo.md)
