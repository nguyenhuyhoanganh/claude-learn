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

Mixin quản lý trạng thái loading — bài toán thật, gặp ở mọi page WebUI.

**Polymer 3**

```javascript
import {dedupingMixin} from 'chrome://resources/polymer/v3_0/polymer/lib/utils/mixin.js';

export const LoadableMixin = dedupingMixin((superClass) => {
  class LoadableMixinImpl extends superClass {
    static get properties() {
      return {
        isLoading: {
          type: Boolean,
          value: false,              // ← giá trị mặc định khai báo tại chỗ
          readOnly: true,            // ← chỉ mixin được sửa
          reflectToAttribute: true,  // ← thành attribute để CSS bắt được
        },
        loadError: {
          type: String,
          value: '',
          readOnly: true,
        },
      };
    }

    async withLoading(fn) {
      this._setIsLoading(true);      // ← setter sinh tự động do readOnly
      this._setLoadError('');
      try {
        return await fn();
      } catch (e) {
        this._setLoadError(e.message || 'Lỗi không xác định');
        throw e;
      } finally {
        this._setIsLoading(false);
      }
    }
  }
  return LoadableMixinImpl;
});
```

**Lit 3**

```javascript
// Lit không có dedupingMixin → tự viết (bài 2 mục 5 giải thích vì sao cần cả `marker`)
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

export const LoadableMixin = dedupeMixin((Base) => {
  class LoadableMixinImpl extends Base {
    static properties = {
      isLoading: {type: Boolean, reflect: true},   // ← reflect, không phải reflectToAttribute
      loadError: {type: String},
      // không có readOnly → dùng quy ước đặt tên, hoặc getter + field private
    };

    constructor() {
      super();
      this.isLoading = false;        // ← giá trị mặc định phải gán ở đây
      this.loadError = '';
    }

    async withLoading(fn) {
      this.isLoading = true;         // ← gán thẳng, không có _setX()
      this.loadError = '';
      try {
        return await fn();
      } catch (e) {
        this.loadError = e.message || 'Lỗi không xác định';
        throw e;
      } finally {
        this.isLoading = false;
      }
    }
  }
  return LoadableMixinImpl;
});
```

Khác biệt cụ thể, dòng-đối-dòng:

| Dòng | Polymer | Lit | Vì sao |
|---|---|---|---|
| Bọc mixin | `dedupingMixin(...)` có sẵn | tự viết `dedupeMixin` | Lit không cung cấp |
| `properties` | static **getter** | static **field** | Khác cú pháp, cùng cơ chế gộp |
| Mặc định | `value: false` | gán trong constructor | Lit không có khái niệm `value:` |
| Reflect | `reflectToAttribute` | `reflect` | Chỉ khác tên |
| Chỉ đọc | `readOnly: true` → `this._setX()` | không có | Lit cố ý bỏ, tin vào quy ước |

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

```javascript
// Polymer: sinh ra this._setIsLoading()
isLoading: {type: Boolean, readOnly: true}
this._setIsLoading(true);
```

```javascript
// Lit: không có cơ chế tương đương. Hai lựa chọn:

// (a) Quy ước — đơn giản, không ép buộc
static properties = {isLoading: {type: Boolean}};
// tài liệu ghi rõ "chỉ mixin được ghi"

// (b) Getter + field private — ép buộc thật sự
#isLoading = false;
get isLoading() { return this.#isLoading; }
_setIsLoading(v) {
  const old = this.#isLoading;
  this.#isLoading = v;
  this.requestUpdate('isLoading', old);
}
```

Cách (b) giữ đúng ngữ nghĩa Polymer. Lưu ý phải gọi `requestUpdate()` thủ công vì Lit không thấy được thay đổi của field private.

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

Mixin theo dõi vị trí cuộn — có đủ property, lifecycle, giá trị dẫn xuất.

**Trước — Polymer 3**

```javascript
import {dedupingMixin} from 'chrome://resources/polymer/v3_0/polymer/lib/utils/mixin.js';

export const ScrollMixin = dedupingMixin((superClass) => {
  class ScrollMixinImpl extends superClass {
    static get properties() {
      return {
        scrollTop_:  {type: Number, value: 0},
        isScrolled:  {type: Boolean, value: false, reflectToAttribute: true,
                      computed: 'computeScrolled_(scrollTop_)'},
      };
    }

    static get observers() {
      return ['onScrolledChanged_(isScrolled)'];
    }

    ready() {
      super.ready();
      this.scrollHandler_ = this.onScroll_.bind(this);
      window.addEventListener('scroll', this.scrollHandler_, {passive: true});
    }

    disconnectedCallback() {
      window.removeEventListener('scroll', this.scrollHandler_);
      super.disconnectedCallback();
    }

    onScroll_() { this.scrollTop_ = window.scrollY; }

    computeScrolled_(top) { return top > 10; }

    onScrolledChanged_(scrolled) {
      this.dispatchEvent(new CustomEvent('scrolled-changed', {detail: {scrolled}}));
    }
  }
  return ScrollMixinImpl;
});
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

export const ScrollMixin = dedupeMixin((Base) => {
  class ScrollMixinImpl extends Base {
    static properties = {
      scrollTop_: {state: true},                        // state: nội bộ, không thành attribute
      isScrolled: {type: Boolean, reflect: true},       // reflectToAttribute → reflect
    };

    constructor() {
      super();
      this.scrollTop_ = 0;                              // value: → constructor
      this.isScrolled = false;
    }

    connectedCallback() {
      super.connectedCallback();                        // ready() → connectedCallback()
      this.scrollHandler_ = this.onScroll_.bind(this);  // (cần chạy sớm, nên không dùng firstUpdated)
      window.addEventListener('scroll', this.scrollHandler_, {passive: true});
    }

    disconnectedCallback() {
      window.removeEventListener('scroll', this.scrollHandler_);
      super.disconnectedCallback();                     // teardown: super CUỐI
    }

    willUpdate(changed) {
      super.willUpdate(changed);
      if (changed.has('scrollTop_')) {
        this.isScrolled = this.scrollTop_ > 10;         // computed → willUpdate
      }
    }

    updated(changed) {
      super.updated(changed);
      if (changed.has('isScrolled')) {                  // observers → updated
        this.dispatchEvent(new CustomEvent('scrolled-changed', {
          detail: {scrolled: this.isScrolled},
        }));
      }
    }

    onScroll_() { this.scrollTop_ = window.scrollY; }
  }
  return ScrollMixinImpl;
});
```

Đối chiếu từng thay đổi:

| # | Polymer | Lit | Lý do |
|---|---|---|---|
| 1 | `dedupingMixin` | `dedupeMixin` tự viết | Lit không có |
| 2 | `static get properties()` | `static properties =` | Khác cú pháp |
| 3 | `value: 0` | gán trong constructor | Lit không có `value:` |
| 4 | `reflectToAttribute` | `reflect` | Khác tên |
| 5 | (không có) | `state: true` | Đánh dấu property nội bộ |
| 6 | `computed:` | `willUpdate()` | Lit không có computed |
| 7 | `static get observers()` | `updated()` | Lit không có observers |
| 8 | `ready()` | `connectedCallback()` | Cần chạy sớm, `firstUpdated` quá muộn |

> Chú ý #8: chọn `connectedCallback()` chứ không phải `firstUpdated()`. Nếu đặt listener ở `firstUpdated()`, element bỏ lỡ mọi sự kiện scroll giữa lúc gắn vào DOM và lúc render xong. Đây đúng là khác biệt đã nói ở mục 3.

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
