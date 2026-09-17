# Bài 3: Mixin trong Polymer — từ Behaviors đến `dedupingMixin`

> Mục tiêu: đọc được mọi kiểu share code trong codebase Polymer (cả code 2015 lẫn code 2024), và biết Polymer *thêm* gì lên trên cơ chế mixin thuần của JS.

## 1. Hai thế hệ

| | Polymer 1 / 2 | Polymer 3 |
|---|---|---|
| Tên gọi | **Behaviors** | **Mixins** |
| Hình thức | Object literal | Hàm nhận class → trả class |
| Khai báo | `behaviors: [MyBehavior]` | `extends MyMixin(PolymerElement)` |
| Có `super`? | ❌ (Polymer tự merge) | ✅ (ES6 chuẩn) |
| Dùng cho code mới? | ❌ | ✅ |

Chromium đã chuyển hết sang mixin, nhưng **Behaviors vẫn còn** trong code cũ và trong một số thư viện `iron-*`/`paper-*`. Bạn cần đọc được cả hai.

## 2. Behaviors — thế hệ cũ

Polymer 1 ra đời trước khi ES6 class phổ biến, nên nó dùng object thuần:

```javascript
// Định nghĩa behavior
const I18nBehavior = {
  properties: {
    locale: {type: String, value: 'en'},
  },

  // Lifecycle của Polymer 1 có tên riêng
  attached() {
    document.addEventListener('language-changed', this._onLang);
  },
  detached() {
    document.removeEventListener('language-changed', this._onLang);
  },

  i18n(key) { return loadTimeData.getString(key); },
};

// Dùng
Polymer({
  is: 'settings-page',
  behaviors: [I18nBehavior],
});
```

### Polymer merge behaviors thế nào

Đây là điểm khiến behaviors khác hẳn `Object.assign` ở bài 1 — Polymer **không** ghi đè phẳng:

| Loại key | Cách xử lý |
|---|---|
| **Lifecycle** (`attached`, `detached`, `ready`...) | **Gọi tất cả, theo thứ tự**: behaviors trước, element sau |
| `properties`, `observers`, `listeners` | Gộp lại |
| Method thường | **Ghi đè** — element thắng behavior; behavior sau thắng behavior trước |

Nghĩa là Polymer 1 đã **tự cài lại** thứ mà `super` cho bạn miễn phí — nhưng chỉ cho lifecycle, và không cho bạn điều khiển thứ tự.

```javascript
Polymer({
  is: 'my-el',
  behaviors: [BehaviorA, BehaviorB],
  attached() { console.log('element'); },
});
// → A.attached, B.attached, element.attached  (cả 3 đều chạy)

// Nhưng method thường:
// BehaviorA.foo và BehaviorB.foo → chỉ B.foo tồn tại. A.foo mất im lặng.
```

### Dùng Behaviors trong Polymer 3

Polymer 3 vẫn chạy được behaviors cũ qua cầu nối `mixinBehaviors`:

```javascript
import {mixinBehaviors} from '@polymer/polymer/lib/legacy/class.js';

class SettingsPage extends mixinBehaviors([I18nBehavior], PolymerElement) {
  static get is() { return 'settings-page'; }
}
```

`mixinBehaviors` chính là **một mixin** bọc behavior object lại — chuyển thế giới cũ vào thế giới mới.

> ⚠️ Khi chạy từ CDN, nhánh legacy này kéo theo `@webcomponents/shadycss` bằng bare specifier, nên cần `<script type="importmap">`. Demo 02 đã kèm sẵn.

**Kết luận:** đọc được là đủ. **Không viết behavior mới.**

## 3. Mixins — thế hệ hiện tại

Cú pháp chuẩn Polymer 3, kèm convention Chromium (hậu tố `_` cho private):

```javascript
import {dedupingMixin} from 'chrome://resources/polymer/v3_0/polymer/lib/utils/mixin.js';

export const I18nMixin = dedupingMixin((superClass) => {
  class I18nMixinImpl extends superClass {
    static get properties() {
      return {
        locale: {type: String, value: 'en'},
      };
    }

    ready() {
      super.ready();                         // ← setup: super ĐẦU
      this.langHandler_ = this.onLangChange_.bind(this);
      document.addEventListener('language-changed', this.langHandler_);
    }

    disconnectedCallback() {
      document.removeEventListener('language-changed', this.langHandler_);
      super.disconnectedCallback();          // ← teardown: super CUỐI
    }

    i18n(key, ...args) {
      return loadTimeData.getString(key, ...args);
    }

    onLangChange_() { /* ... */ }
  }
  return I18nMixinImpl;
});
```

Dùng:

```javascript
class SettingsPage extends I18nMixin(PolymerElement) {
  static get is() { return 'settings-page'; }
  static get template() {
    return html`<h1>[[i18n('settingsTitle')]]</h1>`;
  }
}
customElements.define(SettingsPage.is, SettingsPage);
```

## 4. Polymer thêm gì lên trên mixin thuần

Mixin thuần JS chỉ cho bạn method + prototype chain. Polymer bổ sung 3 thứ, và **cả 3 đều hoạt động từ bên trong mixin** — đây là điều nhiều người không biết.

### 4.1 `properties` được gộp tự động

```javascript
const CounterMixin = dedupingMixin((sc) => class extends sc {
  static get properties() {
    return {count: {type: Number, value: 0}};
  }
});

class MyEl extends CounterMixin(PolymerElement) {
  static get properties() {
    return {name: {type: String}};      // KHÔNG cần khai báo lại count
  }
}

// MyEl có cả `count` lẫn `name`
```

Polymer đi ngược prototype chain, gom tất cả `static get properties()` và merge. Trùng key → **class gần bạn nhất thắng**.

### 4.2 `observers` và `computed` chạy được trong mixin

Đây là điểm mạnh riêng của Polymer. Mixin có thể mang theo cả hệ thống phản ứng:

```javascript
const DoublerMixin = dedupingMixin((sc) => class extends sc {
  static get properties() {
    return {
      value:   {type: Number, value: 1},
      doubled: {type: Number, computed: 'compute_(value)'},
    };
  }
  static get observers() {
    return ['onValue_(value)'];
  }
  compute_(v) { return v * 2; }
  onValue_(v) { console.log('value đổi thành', v); }
});
```

Kết quả thật khi chạy (đã kiểm chứng):

```text
  ObsMixin.observer fired value=1
Polymer computed từ mixin: doubled=2, render ra "2"
→ set value = 21
  ObsMixin.observer fired value=21
doubled=42, render ra "42"
```

→ `computed`, `observers`, và data binding trong template **đều thấy** property do mixin khai báo. Mixin Polymer là một "mảnh component" thực thụ, không chỉ là túi method.

### 4.3 `dedupingMixin` — bắt buộc

Đã giải thích ở bài 2. Trong Polymer, **luôn bọc**:

```javascript
export const MyMixin = dedupingMixin((sc) => class extends sc { /* ... */ });
```

Kiểm chứng:

```javascript
LoggerMixin(LoggerMixin(PolymerElement)) === LoggerMixin(PolymerElement)   // true
```

Không bọc → hai bản sao trong chuỗi → listener nhân đôi.

## 5. Luồng chạy trong Polymer

Vòng đời một element Polymer có mixin:

```text
constructor()                    ← base-first (JS ép)
      │
      ▼
connectedCallback()              ← lần ĐẦU tiên sẽ kích hoạt ready()
      │
      ├─► ready()                ← nơi mixin hay hook vào
      │     ├─ stamp template vào shadow DOM
      │     ├─ khởi tạo property values
      │     └─ chạy observers lần đầu
      │
      ▼
[ property thay đổi ]
      │
      ├─► setter của Polymer phát hiện
      ├─► chạy computed liên quan
      ├─► chạy observers liên quan
      └─► cập nhật ĐÚNG binding bị ảnh hưởng trong template
      │
      ▼
disconnectedCallback()           ← teardown: super CUỐI
```

Trace thật với mixin hook vào `ready()`:

```text
  LoggerMixin.connectedCallback      ← connectedCallback chạy trước ready
MyEl.ready BEFORE super
  LoggerMixin.ready BEFORE super
  LoggerMixin.ready AFTER super
MyEl.ready AFTER super
```

Điểm cần nhớ: **`ready()` chỉ chạy một lần**, bên trong `connectedCallback` đầu tiên. Nếu element bị remove rồi add lại, `connectedCallback` chạy lại nhưng `ready` thì không.

> Hệ quả thực chiến: đăng ký listener trong `ready()` thì **không** được gỡ-và-đăng-ký-lại theo vòng connect/disconnect. Nếu mixin của bạn cần gắn listener lên `document`, đặt ở `connectedCallback` để cặp với `disconnectedCallback`.

## 6. Mixin TypeScript trong Chromium

Chromium hiện đại viết WebUI bằng TypeScript. Pattern chuẩn trong `ui/webui/resources/cr_elements/`:

```typescript
import {dedupingMixin} from 'chrome://resources/polymer/v3_0/polymer/lib/utils/mixin.js';
import type {PolymerElement} from 'chrome://resources/polymer/v3_0/polymer/polymer_bundled.min.js';

type Constructor<T> = new (...args: any[]) => T;

// 1. Interface mô tả những gì mixin thêm vào — để nơi khác import kiểu
export interface I18nMixinInterface {
  i18n(id: string, ...varArgs: Array<string|number>): string;
  i18nAdvanced(id: string, opts?: I18nAdvancedOpts): TrustedHTML;
  i18nUpdateLocale(): void;
}

// 2. Bản thân mixin
export const I18nMixin = dedupingMixin(
    <T extends Constructor<PolymerElement>>(superClass: T): T &
    Constructor<I18nMixinInterface> => {
      class I18nMixinImpl extends superClass implements I18nMixinInterface {
        i18n(id: string, ...varArgs: Array<string|number>): string {
          return loadTimeData.getStringF(id, ...varArgs);
        }
        i18nAdvanced(id: string, opts?: I18nAdvancedOpts): TrustedHTML { /* ... */ }
        i18nUpdateLocale(): void { /* ... */ }
      }
      return I18nMixinImpl;
    });
```

Ba chi tiết đáng chú ý:

1. **Kiểu trả về `T & Constructor<I18nMixinInterface>`** — nói với TypeScript: "class trả về có mọi thứ của `T`, **cộng thêm** những gì trong interface". Thiếu dòng này thì `this.i18n()` báo lỗi biên dịch.
2. **Class có tên** (`I18nMixinImpl`) — để stack trace đọc được.
3. **Interface export riêng** — component khác `implements` được, và dùng làm kiểu cho biến.

Khi dùng, tách base ra biến cho dễ đọc:

```typescript
const SettingsPageBase = I18nMixin(WebUiListenerMixin(PolymerElement));

export class SettingsPageElement extends SettingsPageBase {
  static get is() { return 'settings-page'; }
  // TypeScript biết this.i18n() và this.addWebUiListener() tồn tại
}
```

## 7. Các mixin có sẵn trong Chromium

| Mixin | Cho gì | Dùng khi |
|---|---|---|
| `I18nMixin` | `i18n()`, `i18nAdvanced()` | Mọi page có chữ hiển thị |
| `WebUiListenerMixin` | `addWebUiListener()` tự gỡ khi detach | Nhận event đẩy từ C++ (cơ chế trước Mojo) |
| `ListPropertyUpdateMixin` | `updateList()` — diff thông minh | List dài, muốn giữ DOM của item không đổi |
| `PrefsMixin` | Đồng bộ với `PrefService` | Settings gắn với pref |
| `FindShortcutMixin` | Bắt Ctrl+F | Page có ô tìm kiếm |
| `RouteObserverMixin` | Hook khi route đổi | Page con trong `chrome://settings` |

Ví dụ `WebUiListenerMixin` — minh hoạ rõ nhất giá trị của mixin (nó **tự cleanup**):

```javascript
class DownloadsPage extends WebUiListenerMixin(PolymerElement) {
  ready() {
    super.ready();
    // Không cần tự gỡ — mixin gỡ giúp ở disconnectedCallback
    this.addWebUiListener('downloads-changed', (list) => {
      this.items_ = list;
    });
  }
}
```

Nếu không có mixin, mỗi page phải tự nhớ gỡ listener. Đây đúng là bài toán ở đầu bài 1.

## 8. Bẫy riêng của Polymer

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Quên `dedupingMixin` | Mixin chạy 2 lần khi có kế thừa | Luôn bọc |
| Quên `super.ready()` | Template không stamp, shadow DOM rỗng | `super.ready()` dòng đầu |
| Đăng ký listener `document` trong `ready()` | Không gỡ được theo vòng connect/disconnect | Đặt ở `connectedCallback` |
| Property mixin trùng tên với element | Giá trị bị đè, khó truy | Đặt tiền tố theo mixin |
| Dùng `behaviors:` trong code mới | Cú pháp đã ngừng phát triển | Dùng mixin |
| Đặt `static get is()` trong mixin | Mọi element dùng mixin trùng tag name | `is` luôn thuộc về element cụ thể |

## Tóm tắt bài 3

- **Behaviors** (Polymer 1/2) = object literal, Polymer tự merge lifecycle. Đọc hiểu là đủ, **đừng viết mới**.
- **Mixins** (Polymer 3) = subclass factory ES6 chuẩn, có `super` thật.
- Polymer thêm 3 thứ lên trên mixin thuần: gộp `properties`, chạy `observers`/`computed` từ mixin, và `dedupingMixin`.
- **Luôn bọc `dedupingMixin`.**
- `ready()` chạy **một lần**, bên trong `connectedCallback` đầu tiên → listener toàn cục nên đặt ở `connectedCallback`.
- TypeScript: kiểu trả về phải là `T & Constructor<Interface>`, và nên đặt tên class bên trong.

**Bài kế tiếp** → [Bài 4: Mixin trong Lit](04-mixin-trong-lit.md)
