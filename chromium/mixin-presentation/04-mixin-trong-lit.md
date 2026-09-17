# Bài 4: Mixin trong Lit — và người thay thế nó, ReactiveController

> Mục tiêu: viết được mixin cho Lit đúng chuẩn, và biết **khi nào không nên dùng mixin** vì Lit có công cụ tốt hơn.

## 1. Tin tốt: cơ chế y hệt

Lit không phát minh gì mới về mixin. `LitElement` là một ES6 class, nên mixin ở bài 1–2 áp dụng nguyên xi:

```javascript
import {LitElement, html} from 'lit';

const LoggerMixin = (Base) => class extends Base {
  connectedCallback() {
    super.connectedCallback();
    console.log('gắn vào DOM');
  }
};

class MyEl extends LoggerMixin(LitElement) {
  render() { return html`<p>xin chào</p>`; }
}
customElements.define('my-el', MyEl);
```

Khác biệt nằm ở 3 chỗ: **cách khai báo property**, **các hook lifecycle**, và **không có deduping sẵn**.

## 2. `static properties` — vẫn gộp tự động

Lit gom `properties` từ toàn bộ prototype chain, giống Polymer:

```javascript
const CounterMixin = (Base) => class extends Base {
  static properties = {count: {type: Number}};
  constructor() { super(); this.count = 0; }
};

class MyEl extends CounterMixin(LitElement) {
  static properties = {name: {type: String}};
  constructor() { super(); this.name = 'x'; }
  render() { return html`${this.name}: ${this.count}`; }
}
```

Kiểm chứng thật:

```text
MyEl.elementProperties có 'count' (từ mixin): true
MyEl.elementProperties có 'name'  (từ class): true
```

→ `static properties` là **class field**, không phải static getter như Polymer, nhưng Lit vẫn đi ngược chain để gộp. Cả hai property đều reactive, đều xuất hiện trong `changedProperties`.

> **Lưu ý về giá trị khởi tạo.** Polymer khai báo `value: 0` ngay trong `properties`. Lit không có chỗ đó — phải gán trong `constructor` (hoặc dùng class field). Đây là khác biệt nhỏ nhưng gây lỗi `undefined` rất thường xuyên khi migrate.

Với decorator (cần TypeScript hoặc Babel):

```typescript
const CounterMixin = <T extends Constructor<LitElement>>(Base: T) => {
  class CounterMixinImpl extends Base {
    @property({type: Number}) count = 0;
  }
  return CounterMixinImpl;
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
MyLit.connectedCallback BEFORE super
  LoggerMixin.connectedCallback BEFORE super
MyLit.willUpdate
  LoggerMixin.willUpdate keys=logCount,own
MyLit.render
MyLit.firstUpdated
  LoggerMixin.updated keys=logCount,own
MyLit.updated
```

→ `changedProperties` chứa property của **cả** mixin lẫn class, đúng như mong đợi.

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

export declare class LoadableMixinInterface {
  isLoading: boolean;
  loadError: string;
  withLoading<T>(fn: () => Promise<T>): Promise<T>;
}

export const LoadableMixin = <T extends Constructor<LitElement>>(Base: T) => {
  class LoadableMixinImpl extends Base {
    @property({type: Boolean, reflect: true}) isLoading = false;
    @property({type: String}) loadError = '';

    async withLoading<R>(fn: () => Promise<R>): Promise<R> {
      this.isLoading = true;
      this.loadError = '';
      try {
        return await fn();
      } catch (e) {
        this.loadError = (e as Error).message ?? 'Lỗi không xác định';
        throw e;
      } finally {
        this.isLoading = false;
      }
    }
  }
  return LoadableMixinImpl as Constructor<LoadableMixinInterface> & T;
};
```

Hai chi tiết TypeScript:

- **`declare class`** thay vì `interface` — cần khi mixin có property dùng decorator, để TypeScript không đòi khởi tạo.
- **Ép kiểu `as Constructor<Interface> & T`** ở cuối — nếu không, kiểu của property decorator bị mất khi ra khỏi hàm.

Dùng:

```typescript
class UserCard extends LoadableMixin(LitElement) {
  @property({type: Object}) user?: User;

  async firstUpdated() {
    await this.withLoading(async () => {
      this.user = await (await fetch('/api/user')).json();
    });
  }

  render() {
    if (this.isLoading) return html`<spinner-el></spinner-el>`;
    if (this.loadError) return html`<p class="err">${this.loadError}</p>`;
    return html`<h2>${this.user?.name}</h2>`;
  }
}
```

## 6. ReactiveController — cách làm "đúng Lit" hơn

Đây là phần quan trọng nhất của bài. Lit team đưa ra **ReactiveController** và khuyến nghị dùng nó **thay cho mixin trong đa số trường hợp**.

ReactiveController là một **object** gắn vào element, được element gọi lại ở các mốc lifecycle:

```javascript
class LanguageController {
  constructor(host) {
    this.host = host;
    host.addController(this);          // đăng ký
    this.locale = 'en';
  }

  hostConnected() {
    this._h = () => {
      this.locale = document.documentElement.lang;
      this.host.requestUpdate();       // chủ động yêu cầu render lại
    };
    document.addEventListener('language-changed', this._h);
  }

  hostDisconnected() {
    document.removeEventListener('language-changed', this._h);
  }

  i18n(key) { return loadTimeData.getString(key); }
}
```

Dùng:

```javascript
class SettingsPage extends LitElement {
  #lang = new LanguageController(this);

  render() {
    return html`<h1>${this.#lang.i18n('settingsTitle')}</h1>`;
  }
}
```

Các hook của controller: `hostConnected`, `hostDisconnected`, `hostUpdate`, `hostUpdated`.

### Vì sao controller thường tốt hơn

| | Mixin | ReactiveController |
|---|---|---|
| Ảnh hưởng prototype chain | Có — chèn mắt xích | **Không** — chỉ là object |
| Trùng tên | Có thể đè method | **Không thể** — nằm trong namespace riêng (`this.#lang.i18n`) |
| Cần deduping | Có | **Không** — cứ tạo nhiều instance thoải mái |
| Dùng nhiều bản cùng lúc | ❌ Không (một mixin, một bản) | ✅ Được (`new Timer(this)` hai lần = hai timer) |
| Thêm method vào element | ✅ | ❌ (cố ý — truy cập qua object) |
| Dùng được ngoài Lit | Có (JS thuần) | Cần host implement giao thức |
| Test riêng lẻ | Khó — phải dựng element | **Dễ** — host giả là đủ |

Điểm quyết định: **controller là composition, mixin là inheritance.** Composition không có vấn đề trùng tên và không có vấn đề deduping — hai bẫy lớn nhất của mixin.

### Chọn cái nào

```text
Bạn có cần thêm method/property lên CHÍNH element
(để template ngoài, hoặc code khác, gọi el.foo() được)?
        │
        ├── CÓ ──────────► Mixin
        │                  (vd: i18n() dùng trong template, API công khai)
        │
        └── KHÔNG ───────► ReactiveController
                           (vd: theo dõi kích thước, timer, fetch state,
                            nghe sự kiện, kết nối WebSocket)
```

Ví dụ rõ nhất về thứ **phải** là controller: theo dõi kích thước element.

```javascript
class ResizeController {
  constructor(host) {
    this.host = host;
    host.addController(this);
    this.width = 0;
  }
  hostConnected() {
    this._ro = new ResizeObserver(([entry]) => {
      this.width = entry.contentRect.width;
      this.host.requestUpdate();
    });
    this._ro.observe(this.host);
  }
  hostDisconnected() { this._ro.disconnect(); }
}
```

Viết thành mixin cũng được, nhưng khi một element cần theo dõi **hai** phần tử khác nhau thì mixin bó tay — còn controller chỉ cần `new` hai lần.

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
