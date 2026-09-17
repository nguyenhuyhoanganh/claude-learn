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
// Định nghĩa behavior — chỉ là một OBJECT thường
const OpenableBehavior = {
  properties: {
    opened: {type: Boolean, value: false, reflectToAttribute: true},
  },

  // Lifecycle của Polymer 1 có tên riêng: attached / detached
  attached() {
    this.esc_ = (e) => { if (e.key === 'Escape') this.close(); };
    document.addEventListener('keydown', this.esc_);
  },
  detached() {
    document.removeEventListener('keydown', this.esc_);
  },

  toggle() { this.opened = !this.opened; },
  open()   { this.opened = true; },
  close()  { this.opened = false; },
};

// Dùng
Polymer({
  is: 'my-panel',
  behaviors: [OpenableBehavior],
  properties: {
    tieuDe: {type: String},
  },
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
  is: 'my-panel',
  behaviors: [OpenableBehavior, DisableableBehavior],
  attached() { console.log('element'); },
});
// Lifecycle → Openable.attached, Disableable.attached, element.attached (cả 3 chạy)

// Nhưng method thường thì KHÔNG:
// cả hai behavior đều có toggle() → chỉ bản của DisableableBehavior tồn tại.
// Bản của OpenableBehavior mất im lặng, và không có super để gọi lại nó.
```

### Dùng Behaviors trong Polymer 3

Polymer 3 vẫn chạy được behaviors cũ qua cầu nối `mixinBehaviors`:

```javascript
import {mixinBehaviors} from '@polymer/polymer/lib/legacy/class.js';

class MyPanel extends mixinBehaviors([OpenableBehavior], PolymerElement) {
  static get is() { return 'my-panel'; }
}
```

`mixinBehaviors` chính là **một mixin** bọc behavior object lại — chuyển thế giới cũ vào thế giới mới.

> ⚠️ Khi chạy từ CDN, nhánh legacy này kéo theo `@webcomponents/shadycss` bằng bare specifier, nên cần `<script type="importmap">`. Demo 02 đã kèm sẵn.

**Kết luận:** đọc được là đủ. **Không viết behavior mới.**

## 3. Mixins — thế hệ hiện tại

Cú pháp chuẩn Polymer 3, kèm convention Chromium (hậu tố `_` cho private, đặt tên cho class bên trong để stack trace đọc được):

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

    connectedCallback() {
      super.connectedCallback();             // ← setup: super ĐẦU
      this.esc_ = (e) => { if (e.key === 'Escape') this.close(); };
      document.addEventListener('keydown', this.esc_);
    }

    disconnectedCallback() {
      document.removeEventListener('keydown', this.esc_);
      super.disconnectedCallback();          // ← teardown: super CUỐI
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
    return {tieuDe: {type: String, value: 'Bảng'}};
  }

  static get template() {
    return html`
      <style>
        :host([opened]) .than { display: block; }   /* dùng attribute mixin reflect ra */
        .than { display: none; }
      </style>
      <h3 on-click="toggle">[[tieuDe]] — [[nhan]]</h3>
      <div class="than"><slot></slot></div>`;
  }
}
customElements.define(MyPanel.is, MyPanel);
```

Ba chi tiết đáng chú ý trong đoạn trên:

1. Template của element gọi thẳng `toggle` (method của mixin) trong `on-click`, và bind `[[nhan]]` (computed của mixin) — **không phân biệt** với thứ của chính element.
2. CSS của element dùng `:host([opened])` — attribute do mixin `reflectToAttribute` đẩy ra.
3. `MyPanel` chỉ khai báo `tieuDe`, phần riêng của nó. Mọi thứ mở/đóng nằm ở mixin.

## 4. Polymer thêm gì lên trên mixin thuần

Mixin thuần JS chỉ cho bạn method + prototype chain. Polymer bổ sung 3 thứ, và **cả 3 đều hoạt động từ bên trong mixin** — đây là điều nhiều người không biết.

### 4.1 `properties` được gộp tự động

```javascript
class MyPanel extends DisableableMixin(OpenableMixin(PolymerElement)) {
  static get properties() {
    return {tieuDe: {type: String}};    // KHÔNG cần khai báo lại opened / disabled
  }
}
```

Kết quả chạy thật — `MyPanel` có đủ property từ cả ba nguồn:

```text
opened    ← OpenableMixin
nhan      ← OpenableMixin (computed)
disabled  ← DisableableMixin
tieuDe    ← chính MyPanel
```

Polymer đi ngược prototype chain, gom tất cả `static get properties()` và merge. Trùng key → **class gần bạn nhất thắng**.

### 4.2 `observers` và `computed` chạy được trong mixin

Đây là điểm mạnh riêng của Polymer. Mixin mang theo được cả hệ thống phản ứng — chính là `nhan` và `openedChanged_` ở mục 3:

```javascript
static get properties() {
  return {
    opened: {type: Boolean, value: false, observer: 'openedChanged_'},
    nhan:   {type: String, computed: 'tinhNhan_(opened)'},
  };
}
tinhNhan_(opened) { return opened ? 'Đang mở' : 'Đang đóng'; }
openedChanged_(moi) { /* bắn event */ }
```

Kết quả chạy thật:

```text
panel.opened                 → false
panel.nhan                   → "Đang đóng"      computed trong mixin
panel.toggle()
panel.opened                 → true
panel.nhan                   → "Đang mở"        computed tự tính lại
panel.hasAttribute('opened') → true             reflectToAttribute
event 'opened-changed'       → đã bắn           observer trong mixin
template render              → "Đang mở" ngay   binding [[nhan]] thấy được
```

→ `computed`, `observer`, `reflectToAttribute` và data binding trong template **đều thấy** property do mixin khai báo. Mixin Polymer là một "mảnh component" thực thụ, không chỉ là túi method.

### 4.3 `dedupingMixin` — bắt buộc

Đã giải thích ở bài 2. Trong Polymer, **luôn bọc**:

```javascript
export const MyMixin = dedupingMixin((sc) => class extends sc { /* ... */ });
```

Kiểm chứng:

```javascript
OpenableMixin(OpenableMixin(PolymerElement)) === OpenableMixin(PolymerElement)   // true
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
  LoggerMixin.connectedCallback        ← connectedCallback chạy trước ready
MyEl.ready — trước super
  LoggerMixin.ready — trước super
  LoggerMixin.ready — sau super
MyEl.ready — sau super
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
export interface OpenableMixinInterface {
  opened: boolean;
  toggle(): void;
  open(): void;
  close(): void;
}

// 2. Bản thân mixin
export const OpenableMixin = dedupingMixin(
    <T extends Constructor<PolymerElement>>(superClass: T): T &
    Constructor<OpenableMixinInterface> => {
      class OpenableMixinImpl extends superClass implements OpenableMixinInterface {
        static get properties() {
          return {
            opened: {type: Boolean, value: false, reflectToAttribute: true},
          };
        }

        opened: boolean;

        toggle(): void { this.opened = !this.opened; }
        open(): void   { this.opened = true; }
        close(): void  { this.opened = false; }
      }
      return OpenableMixinImpl;
    });
```

Ba chi tiết đáng chú ý:

1. **Kiểu trả về `T & Constructor<OpenableMixinInterface>`** — nói với TypeScript: "class trả về có mọi thứ của `T`, **cộng thêm** những gì trong interface". Thiếu dòng này thì `this.toggle()` báo lỗi biên dịch ở component dùng mixin.
2. **Class có tên** (`OpenableMixinImpl`) — để stack trace đọc được. Class biểu thức ẩn danh sẽ hiện chuỗi rỗng trong DevTools.
3. **Interface export riêng** — component khác `implements` được, và dùng làm kiểu cho biến.

Khi dùng, tách base ra biến cho dễ đọc — nhất là khi xếp chồng nhiều mixin:

```typescript
const MyPanelBase = DisableableMixin(OpenableMixin(PolymerElement));

export class MyPanelElement extends MyPanelBase {
  static get is() { return 'my-panel'; }
  // TypeScript biết this.toggle() và this.disabled tồn tại
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
