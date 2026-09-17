# Bài 2: Luồng chạy của mixin — prototype chain và `super` chain

> Mục tiêu: nhìn vào một chuỗi mixin bất kỳ và **nói đúng thứ tự** các đoạn code sẽ chạy, không cần đoán.

Đây là bài quan trọng nhất của buổi trình bày. Hầu hết bug liên quan đến mixin đều là bug *thứ tự*, không phải bug *logic*.

## 1. Mixin làm gì với prototype chain

Nhắc lại: `class B extends A` chỉ làm đúng một việc — đặt `B.prototype.__proto__ = A.prototype`. Nói cách khác, nó nối `B` vào sau `A` thành một chuỗi.

Mixin cũng y như vậy, chỉ khác là class trung gian không có tên sẵn.

Lấy lại `DemLuotMixin` từ bài 1:

```javascript
const DemLuotMixin = (Base) => class extends Base {
  ghiNhanDung() { this.soLanDung++; }
};

class NutBam extends DemLuotMixin(Object) { }
```

Chuỗi sinh ra chỉ có 3 mắt xích:

```text
NutBam.prototype
      │  __proto__
      ▼
(class ẩn danh do DemLuotMixin sinh ra).prototype   ← ghiNhanDung() nằm ở đây
      │  __proto__
      ▼
Object.prototype
```

Khi bạn gọi `nut.ghiNhanDung()`, JS đi **từ trên xuống**: tìm trong `NutBam.prototype` → không có → tìm tiếp ở class do mixin sinh ra → thấy → chạy.

Đây là toàn bộ "phép thuật" của mixin. Không có gì hơn.

Đổi `Object` thành `HTMLElement` thì chuỗi dài thêm ở phía dưới, nhưng phần mixin chèn vào **không đổi chút nào**:

```text
NutBam  →  DemLuotMixin  →  HTMLElement  →  Element  →  Node  →  EventTarget  →  Object
           └─ mixin chèn ─┘  └────── phần có sẵn của trình duyệt ──────────────────┘
```

### Xếp chồng nhiều mixin

```javascript
class MyEl extends A(B(C(HTMLElement))) { }
```

Đọc **từ trong ra ngoài**: `C` được áp trước (gần base nhất), rồi `B`, rồi `A` (gần `MyEl` nhất).

```text
MyEl  →  A  →  B  →  C  →  HTMLElement
 ▲                              ▲
 │                              │
gần bạn nhất              gần base nhất
ưu tiên cao nhất          chạy "sâu" nhất
```

> **Mẹo nhớ:** mixin nằm **gần class của bạn nhất** thì **thắng** khi trùng tên method, vì JS tìm thấy nó trước.

## 2. Thứ tự constructor — luôn từ trong ra ngoài

Trong JS, `super()` **bắt buộc** gọi trước khi dùng `this`. Nghĩa là constructor của base **luôn chạy xong trước** phần thân constructor của class con.

```javascript
const A = (Base) => class extends Base {
  constructor() { super(); console.log('A body'); }
};
const B = (Base) => class extends Base {
  constructor() { super(); console.log('B body'); }
};

class MyEl extends A(B(HTMLElement)) {
  constructor() { super(); console.log('MyEl body'); }
}
```

Kết quả:

```text
B body       ← trong cùng chạy trước
A body
MyEl body    ← ngoài cùng chạy sau
```

Luồng thực tế: `MyEl.constructor` gọi `super()` → `A.constructor` gọi `super()` → `B.constructor` gọi `super()` → `HTMLElement` xong → *quay ngược lại* chạy thân `B`, rồi `A`, rồi `MyEl`.

```text
đi xuống (gọi super)          đi lên (chạy thân hàm)
MyEl ──┐                              ┌── MyEl body   (4)
       ▼                              │
  A ───┐                          ┌───┘
       ▼                          │
  B ───┐                      ┌───┘  A body           (3)
       ▼                      │
 HTMLElement ─────────────────┘      B body           (2)
                                     HTMLElement      (1)
```

→ **Constructor: luôn là base-first.** Không có ngoại lệ, vì JS ép buộc.

## 3. Thứ tự method thường — bạn tự quyết

Với method không phải constructor, thứ tự phụ thuộc **bạn đặt `super.x()` ở đâu**.

### Kiểu A — `super` gọi đầu (phổ biến nhất)

```javascript
const M = (Base) => class extends Base {
  connectedCallback() {
    super.connectedCallback();     // ← đầu
    console.log('M: sau super');
  }
};
class MyEl extends M(HTMLElement) {
  connectedCallback() {
    super.connectedCallback();     // ← đầu
    console.log('MyEl: sau super');
  }
}
```

```text
M: sau super        ← base-first, giống constructor
MyEl: sau super
```

Dùng khi: logic của bạn **phụ thuộc** vào việc base đã khởi tạo xong (đọc `this.shadowRoot`, đọc property đã init...).

### Kiểu B — `super` gọi cuối

```javascript
const M = (Base) => class extends Base {
  disconnectedCallback() {
    console.log('M: trước super');
    super.disconnectedCallback();  // ← cuối
  }
};
```

```text
MyEl: trước super   ← đảo ngược!
M: trước super
```

Dùng khi: **cleanup**. Bạn muốn gỡ listener của mình *trước khi* base tháo dỡ mọi thứ.

> **Quy tắc thực chiến:**
> - Setup (`connectedCallback`, `ready`, `willUpdate`) → `super` **đầu tiên**.
> - Teardown (`disconnectedCallback`) → `super` **cuối cùng**.
>
> Cách nhớ: vào thì base vào trước, ra thì base ra sau — như xếp chồng đĩa.

### Kiểu C — quên `super` (bug kinh điển)

```javascript
const M = (Base) => class extends Base {
  connectedCallback() {
    console.log('M chạy');
    // quên super.connectedCallback()
  }
};
```

Hậu quả: **mọi thứ nằm dưới `M` trong chuỗi đều không chạy.** Với Lit, quên `super.connectedCallback()` → element không bao giờ render, màn hình trắng, không có lỗi nào được ném ra. Đây là lỗi tốn thời gian debug nhất khi làm việc với mixin.

## 4. Trace thật — chạy được, không phải lý thuyết

Đoạn trace dưới đây là **output thật** lấy từ Chromium headless, chạy Polymer 3.5.1 và Lit 3 với cùng một mixin log lifecycle.

### Polymer

```text
  LoggerMixin.connectedCallback
MyEl.ready — trước super
  LoggerMixin.ready — trước super
  LoggerMixin.ready — sau super
MyEl.ready — sau super
```

Đọc được 2 điều:

1. `connectedCallback` chạy **trước** `ready` — vì Polymer gọi `ready()` từ bên trong lần `connectedCallback` đầu tiên.
2. Phần trước `super.ready()` chạy **từ ngoài vào** (`MyEl` → `Mixin`), phần sau `super.ready()` chạy **từ trong ra** (`Mixin` → `MyEl`). Đây chính là mô hình "bọc" — mixin quấn quanh logic của base.

### Lit

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

Đọc được:

1. Constructor: mixin trước, class bạn sau (đúng quy tắc mục 2).
2. `willUpdate` nhận `changedProperties` chứa **cả property của mixin lẫn của class** (`logCount,own`) → Lit đã gộp khai báo property từ cả chuỗi.
3. `updated` của mixin chạy trước `updated` của class, vì cả hai đều gọi `super.updated()` ở đầu.

> Cả hai trace này được tái tạo trực tiếp trong [`demo/04-side-by-side.html`](demo/04-side-by-side.html) — chạy song song hai framework, in ra hai cột.

## 5. Vấn đề kim cương và deduping

Nhớ lại bài 1: **mỗi lần gọi mixin sinh ra một class mới.**

```javascript
M(Base) === M(Base)   // false
```

Giờ xét tình huống rất đời thường:

```javascript
const A = LoggerMixin(PolymerElement);

class Parent extends LoggerMixin(PolymerElement) { }
class Child  extends LoggerMixin(Parent) { }   // ← áp LoggerMixin lần 2
```

Chuỗi của `Child`:

```text
Child → LoggerMixin#2 → Parent → LoggerMixin#1 → PolymerElement
                ▲                       ▲
                └──── cùng 1 mixin, 2 bản sao ────┘
```

Hậu quả đo được (số liệu thật từ demo):

```text
1 element, mixin áp MỘT lần  → constructor của mixin chạy 1 lần
1 element, mixin áp HAI lần  → constructor của mixin chạy 2 lần
```

Nghĩa là: listener đăng ký 2 lần, event handler chạy 2 lần, và nếu mixin có counter thì nó tăng gấp đôi. Bug rất khó lần ra vì code trông hoàn toàn hợp lý.

### Cách chữa: nhớ xem đã áp chưa

Ý tưởng gồm **hai** phần, và phần thứ hai hay bị bỏ sót:

1. **Cache theo `Base`** — áp mixin lên đúng một `Base` hai lần thì trả lại class cũ.
2. **Đánh dấu lên class kết quả** — để nhận ra mixin đã nằm sẵn ở đâu đó *phía trên* trong chuỗi, kể cả khi đi qua kế thừa (chính là trường hợp `Child`/`Parent` ở trên).

```javascript
function dedupeMixin(mixin) {
  const cache = new WeakMap();
  const marker = Symbol('mixin-applied');   // dấu riêng cho từng mixin

  return (Base) => {
    // (2) Chuỗi đã có mixin này rồi → trả nguyên Base, không bọc thêm
    if (Base[marker]) return Base;
    // (1) Đã từng áp lên đúng Base này → dùng lại class cũ
    if (cache.has(Base)) return cache.get(Base);

    const Klass = mixin(Base);
    // static property → mọi class con của Klass đều "thấy" dấu này
    Object.defineProperty(Klass, marker, {value: true});
    cache.set(Base, Klass);
    return Klass;
  };
}

const LoggerMixin = dedupeMixin((Base) => class extends Base { /* ... */ });
```

Kết quả đo được, so với bản chỉ có `WeakMap`:

| | Chỉ `WeakMap` | `WeakMap` + dấu |
|---|---|---|
| `M(Base) === M(Base)` | ✅ true | ✅ true |
| `M(M(Base)) === M(Base)` | ❌ false | ✅ true |
| Số lần chạy ở ca kim cương `Child`/`Parent` | ❌ **2 lần** | ✅ 1 lần |

→ Chỉ dùng `WeakMap` thì **vẫn hỏng đúng ở tình huống đã nêu bên trên**. Phải có cả dấu đánh.

Hai chi tiết kỹ thuật:

- Dùng `WeakMap` chứ không phải `Map` — để class không bị giữ sống mãi (tránh leak).
- Dấu đánh là **static property**, mà static property được kế thừa theo chuỗi class (`Child.__proto__ === Parent`), nên `Parent[marker]` đúng cho mọi class con.

Polymer **đóng gói sẵn** đúng cơ chế hai phần này:

```javascript
import {dedupingMixin} from '@polymer/polymer/lib/utils/mixin.js';

const LoggerMixin = dedupingMixin((Base) => class extends Base { /* ... */ });

LoggerMixin(LoggerMixin(PolymerElement)) === LoggerMixin(PolymerElement)   // true ✅
```

Bên trong, `dedupingMixin` của Polymer dùng một `WeakMap` cộng với `__mixinSet` — vai trò y hệt `marker` ở trên.

Lit **không có** hàm tương đương — bạn tự viết (bài 4). Đây là một trong những khác biệt dễ vấp nhất khi migrate.

## 6. Bảng tra thứ tự

Với `class MyEl extends A(B(Base))`:

| Việc | Thứ tự chạy | Do ai quyết |
|---|---|---|
| `constructor` | `Base` → `B` → `A` → `MyEl` | JS ép buộc |
| Method có `super` ở **đầu** | `Base` → `B` → `A` → `MyEl` | Bạn |
| Method có `super` ở **cuối** | `MyEl` → `A` → `B` → `Base` | Bạn |
| Tra cứu method trùng tên | `MyEl` → `A` → `B` → `Base`, **dừng ở cái đầu tiên tìm thấy** | JS |
| Gộp `static properties` | Gộp cả chuỗi; **gần `MyEl` hơn thì thắng** khi trùng key | Framework |

## 7. Bẫy thường gặp

| Bẫy | Triệu chứng | Cách tránh |
|---|---|---|
| Quên `super.x()` | Element không render, **không có lỗi** | Luôn viết `super.x()` trước khi viết thân hàm |
| `super` đặt sai đầu/cuối | Cleanup chạy sau khi DOM đã tháo → lỗi null | Setup: super đầu. Teardown: super cuối |
| Áp mixin 2 lần | Listener nhân đôi, counter nhân đôi | `dedupingMixin` (Polymer) / WeakMap (Lit) |
| Hai mixin trùng tên method | Cái ngoài đè cái trong, im lặng | Đặt tên có tiền tố: `i18nUpdateLocale()` |
| Hai mixin trùng tên property | Framework gộp, giá trị khó đoán | Tiền tố theo mixin |
| Chuỗi mixin quá dài | Stack trace toàn class ẩn danh | Tối đa 3–4 mixin; gom vào một `const Base = ...` |

### Mẹo đặt tên cho class ẩn danh

Stack trace đầy class không tên rất khó debug. Đặt tên cho class bên trong mixin:

```javascript
const LoggerMixin = (Base) => {
  class LoggerMixinImpl extends Base { /* ... */ }   // ← có tên
  return LoggerMixinImpl;
};
```

Giờ DevTools hiện `LoggerMixinImpl` thay vì chuỗi rỗng. Chromium dùng đúng thủ thuật này trong các mixin TypeScript của `cr_elements`.

## Tóm tắt bài 2

- Mixin chèn một **mắt xích thật** vào prototype chain; mọi hành vi đều suy ra được từ đó.
- `A(B(Base))` đọc **từ trong ra ngoài**: `B` gần base, `A` gần bạn. Gần bạn hơn thì **thắng** khi trùng tên.
- **Constructor luôn base-first** — JS ép buộc, không đổi được.
- Method thường: **bạn** quyết thứ tự qua vị trí của `super`. Setup → super đầu; teardown → super cuối.
- Quên `super` = cắt đứt chuỗi, hỏng im lặng. Bug tốn thời gian nhất.
- Áp mixin 2 lần = chạy 2 lần thật (đã đo). Polymer có `dedupingMixin`; Lit phải tự viết WeakMap.

**Bài kế tiếp** → [Bài 3: Mixin trong Polymer](03-mixin-trong-polymer.md)
