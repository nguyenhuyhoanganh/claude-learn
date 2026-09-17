# Bài 1: Mixin là gì — đi từ chỗ đơn giản nhất

> Mục tiêu: sau bài này bạn định nghĩa được mixin bằng **một câu**, và giải thích được vì sao 3 cách share code "tự nhiên" hơn lại không đủ.

## 1. Bài toán gốc — không có mixin thì sao?

Bạn có 5 component WebUI. Cả 5 đều cần đúng 3 thứ:

1. Hàm `i18n('key')` để dịch chuỗi.
2. Nghe sự kiện `language-changed` để render lại.
3. Gỡ listener khi element bị remove (nếu không → **memory leak**).

Viết "ngây thơ":

```javascript
class SettingsPage extends PolymerElement {
  i18n(key) { return loadTimeData.getString(key); }
  connectedCallback() {
    super.connectedCallback();
    this.h_ = () => this.requestRender();
    document.addEventListener('language-changed', this.h_);
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('language-changed', this.h_);
  }
}

class PrivacyPage extends PolymerElement {
  // ... y hệt 12 dòng trên ...
}

class DownloadsPage extends PolymerElement {
  // ... y hệt, nhưng hôm nay ai đó quên dòng removeEventListener ...
}
```

Vấn đề không phải là "gõ nhiều". Vấn đề là:

- **Sửa 1 chỗ → phải sửa 5 chỗ.** Đổi tên event `language-changed` → grep toàn repo.
- **Sai lệch âm thầm.** Một component quên `removeEventListener` → leak, không ai thấy cho tới khi profiling.
- **Không test được riêng.** Muốn test logic i18n phải dựng cả một component.

Ta cần một cơ chế: *viết logic 1 lần, gắn vào N class*.

## 2. Bốn cấp độ share code

Đi từ đơn giản → phức tạp. Mỗi cấp giải quyết được điều mà cấp trước không làm nổi.

### Cấp 0 — Hàm tiện ích (function utility)

```javascript
// i18n-utils.js
export function i18n(key, ...args) {
  return loadTimeData.getString(key, ...args);
}
```

```javascript
import {i18n} from './i18n-utils.js';

class SettingsPage extends PolymerElement {
  computeTitle_() { return i18n('settingsTitle'); }
}
```

✅ Đơn giản nhất, dễ test nhất, không có magic.
❌ **Không giữ được state riêng của từng element.** Không hook được vào lifecycle. Không khai báo được `properties` phản ứng (reactive).

> **Nguyên tắc số 1 của bài này:** nếu hàm thuần đủ dùng thì **đừng** viết mixin. Mixin là công cụ nặng hơn.

### Cấp 1 — Class cha (inheritance)

```javascript
class I18nElement extends PolymerElement {
  i18n(key) { return loadTimeData.getString(key); }
}

class SettingsPage extends I18nElement { }
class PrivacyPage  extends I18nElement { }
```

✅ Có state, có lifecycle, `super` chạy đúng.
❌ **JavaScript chỉ cho kế thừa đơn.** Ngay khi cần thứ hai:

```javascript
class SettingsPage extends I18nElement { }      // cần i18n
// ... giờ cần thêm WebUIListener nữa thì extends cái gì?
// extends I18nElement, WebUIListenerElement  ← KHÔNG tồn tại trong JS
```

Đây chính là bức tường mà mixin sinh ra để phá.

### Cấp 2 — Copy method vào prototype (`Object.assign`)

Cách "mixin cổ điển", có từ thời jQuery/Underscore:

```javascript
const i18nBehavior = {
  i18n(key) { return loadTimeData.getString(key); },
  connectedCallback() {
    console.log('i18n setup');
  },
};

class SettingsPage extends PolymerElement { }
Object.assign(SettingsPage.prototype, i18nBehavior);
```

✅ Gắn được nhiều "behavior" vào cùng 1 class — vượt qua giới hạn kế thừa đơn.
❌ Hỏng nặng ở 2 điểm:

```javascript
// HỎNG 1: đè mất method của base, KHÔNG gọi lại được bản gốc.
// connectedCallback của PolymerElement bị ghi đè hoàn toàn
// → element không bao giờ được khởi tạo. Không có super để cứu.

// HỎNG 2: hai behavior cùng định nghĩa connectedCallback
Object.assign(P.prototype, i18nBehavior);       // ghi connectedCallback
Object.assign(P.prototype, listenerBehavior);   // ĐÈ LÊN, i18n mất luôn
```

`Object.assign` là **ghi đè phẳng**. Không có khái niệm "gọi cái trước đó". Đây là lý do Polymer 1 `behaviors: []` phải tự viết cơ chế merge đặc biệt (bài 3 sẽ nói), và là lý do Polymer 3 bỏ hẳn nó.

### Cấp 3 — Class mixin (subclass factory) ⭐

Ý tưởng: thay vì *copy method vào* class, ta **sinh ra một class trung gian** và chèn nó vào giữa chuỗi kế thừa.

```javascript
const I18nMixin = (Base) => class extends Base {
  i18n(key) { return loadTimeData.getString(key); }

  connectedCallback() {
    super.connectedCallback();        // ← gọi được base! Không đè mất.
    this.h_ = () => this.requestRender();
    document.addEventListener('language-changed', this.h_);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('language-changed', this.h_);
  }
};

class SettingsPage extends I18nMixin(PolymerElement) { }
```

Và vì nó nhận class → trả class, ta **xếp chồng** được:

```javascript
class SettingsPage extends I18nMixin(WebUIListenerMixin(PolymerElement)) { }
```

✅ Có state, có lifecycle, có `super`, xếp chồng không giới hạn.
❌ Chuỗi dài khó đọc, dễ đụng tên method, có thể bị apply trùng (bài 2).

## 3. Định nghĩa

> **Mixin là một hàm nhận vào một class và trả về một class con mới của nó, đã được bổ sung tính năng.**

Trong TypeScript, chữ ký đầy đủ:

```typescript
type Constructor<T = {}> = new (...args: any[]) => T;

function I18nMixin<TBase extends Constructor<HTMLElement>>(Base: TBase) {
  return class extends Base {
    i18n(key: string): string { /* ... */ return ''; }
  };
}
```

Ba tính chất bắt buộc, thiếu một cái thì không còn là mixin:

| Tính chất | Vì sao cần |
|---|---|
| Nhận `Base` làm **tham số** | Nếu hard-code `extends PolymerElement` thì chỉ dùng được cho Polymer, không xếp chồng được |
| Trả về **class mới**, không sửa `Base` | `Base` giữ nguyên → dùng lại được ở chỗ khác, không ô nhiễm toàn cục |
| Bên trong dùng `extends Base` | Đây là thứ tạo ra `super` — điểm khác biệt cốt lõi so với `Object.assign` |

### Vì sao cái tên "subclass factory" chính xác hơn "mixin"

Gọi là "mixin" dễ gây hiểu lầm rằng nó **trộn** method vào class bạn. Nó không trộn gì cả. Nó là một **nhà máy sản xuất class con**: đưa vào class `A`, nhận về class `B extends A`.

```javascript
const M = (Base) => class extends Base { hello() { return 'hi'; } };

const X = M(HTMLElement);
console.log(Object.getPrototypeOf(X.prototype) === HTMLElement.prototype); // true
console.log(X.name);            // '' — class biểu thức ẩn danh
console.log(M(HTMLElement) === M(HTMLElement)); // false — mỗi lần gọi là 1 class MỚI
```

Dòng cuối rất quan trọng và sẽ quay lại ám bạn ở bài 2 (`dedupingMixin`).

## 4. So sánh 4 cấp độ

| | Hàm thuần | Kế thừa | `Object.assign` | **Class mixin** |
|---|---|---|---|---|
| Có state riêng mỗi element | ❌ | ✅ | ✅ | ✅ |
| Hook lifecycle | ❌ | ✅ | ⚠️ đè mất | ✅ |
| Gọi được `super` | — | ✅ | ❌ | ✅ |
| Nhiều nguồn cùng lúc | ✅ | ❌ | ✅ | ✅ |
| Khai báo reactive `properties` | ❌ | ✅ | ⚠️ | ✅ |
| Độ phức tạp | Thấp nhất | Thấp | Trung bình | Cao nhất |

→ Class mixin là ô duy nhất **không có ❌ nào**. Giá phải trả là độ phức tạp — nên chỉ dùng khi thật sự cần.

## 5. Khi nào dùng mixin, khi nào không

**Dùng mixin khi hội đủ:**

- Logic được dùng ở **≥ 3 component**, và
- cần **lifecycle hook** (`connectedCallback`, `ready`, `updated`), hoặc
- cần **state / reactive property** gắn theo từng element.

**Không dùng mixin khi:**

| Tình huống | Dùng gì thay thế |
|---|---|
| Hàm thuần, không state | `export function` |
| Chỉ 1–2 component xài | Viết thẳng, copy cũng được |
| Chỉ cần state + lifecycle, không cần thêm method vào element | **ReactiveController** (Lit — bài 4) |
| Chỉ cần gom UI dùng lại | Một component con |

> Câu hỏi sàng lọc nhanh: *"Thứ này có cần trở thành một phần của bản thân element không?"*
> Có → mixin. Không → hàm thuần hoặc controller.

## 6. Ví dụ hoàn chỉnh đầu tiên

Mixin đếm số lần element được gắn vào DOM — đủ nhỏ để đọc hết trong 30 giây, đủ đầy để có cả 3 tính chất.

```javascript
const ConnectCounterMixin = (Base) => class extends Base {
  #count = 0;                       // state riêng từng instance

  connectedCallback() {
    super.connectedCallback?.();    // ?. vì HTMLElement thuần không có hàm này
    this.#count++;
    this.dataset.connectCount = this.#count;
  }

  get connectCount() { return this.#count; }
};

class MyBox extends ConnectCounterMixin(HTMLElement) {
  connectedCallback() {
    super.connectedCallback();      // chạy logic mixin trước
    this.textContent = `Đã gắn ${this.connectCount} lần`;
  }
}
customElements.define('my-box', MyBox);
```

Chạy thử: [`demo/01-mixin-thuan-js.html`](demo/01-mixin-thuan-js.html) — demo in ra prototype chain thật và thứ tự `super` chạy.

## Tóm tắt bài 1

- Mixin sinh ra để phá giới hạn **kế thừa đơn** của JavaScript.
- **Định nghĩa:** hàm nhận class → trả class con mới đã thêm tính năng.
- Nó **không copy method**; nó **chèn một mắt xích** vào prototype chain → nhờ vậy `super` chạy được.
- `Object.assign` vào prototype là mixin "giả": không có `super`, hai behavior đè nhau.
- Mỗi lần gọi mixin sinh ra **một class mới** → nguồn gốc của vấn đề deduping.
- Thứ tự ưu tiên khi cần share code: **hàm thuần → controller → mixin**. Đừng nhảy thẳng tới mixin.

**Bài kế tiếp** → [Bài 2: Luồng chạy của mixin](02-luong-chay-cua-mixin.md)
