# Bài 7: Mixins và Behaviors — chia sẻ logic giữa components

Khi nhiều components có chung một số logic (vd: tất cả Chromium WebUI cần i18n), bạn không muốn copy-paste. Cần cơ chế **share code**.

Polymer 1/2 dùng **Behaviors**. Polymer 3 chuyển sang **Mixins** (class mixin pattern). Bài này dạy cả 2 — vì code cũ vẫn có Behaviors.

## Vấn đề — cần share logic

Giả sử bạn có 5 component, tất cả đều cần:
- Translate strings qua `i18n('key')` (gọi `loadTimeData.getString`).
- Listen "language-changed" event để re-render.
- Method `i18nUpdateLocale()` để update khi user đổi ngôn ngữ.

Cách "ngây thơ":

```javascript
// Component 1
class SettingsPage extends PolymerElement {
  i18n(key) { return loadTimeData.getString(key); }
  // ... setup language listener ...
}

// Component 2
class PrivacyPage extends PolymerElement {
  i18n(key) { return loadTimeData.getString(key); }
  // ... same setup ...
}

// Component 3, 4, 5... — copy paste hoài
```

→ Không scale. Phải có cơ chế tái sử dụng.

## Mixin pattern — Polymer 3 standard

**Mixin** = function nhận một class, trả về class mới đã extend với features mới.

```javascript
// Định nghĩa mixin
const I18nMixin = (superClass) => class extends superClass {
  // Methods của mixin
  i18n(key, ...args) {
    return loadTimeData.getString(key, ...args);
  }
  
  // Lifecycle hooks
  ready() {
    super.ready();
    
    // Listen language change
    this._langHandler = this._onLangChange.bind(this);
    document.addEventListener('language-changed', this._langHandler);
  }
  
  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('language-changed', this._langHandler);
  }
  
  _onLangChange() {
    // Force re-render mọi binding có i18n call
    this.notifyResize();
  }
};

// Dùng mixin
class SettingsPage extends I18nMixin(PolymerElement) {
  static get template() {
    return html`<h1>[[i18n('settingsTitle')]]</h1>`;
  }
}

class PrivacyPage extends I18nMixin(PolymerElement) {
  static get template() {
    return html`<h1>[[i18n('privacyTitle')]]</h1>`;
  }
}
```

→ Cả 2 components có method `i18n()` mà không copy code.

### Class structure

```text
PolymerElement (base)
   ↓ extended by
I18nMixin(PolymerElement) → class với i18n
   ↓ extended by
SettingsPage / PrivacyPage / etc.
```

`I18nMixin` trả về **class mới**. Class này extend `PolymerElement` và thêm `i18n` method.

### Compose nhiều mixin

```javascript
class MyComponent extends I18nMixin(
                          KeyboardMixin(
                            FocusMixin(
                              PolymerElement))) {
  // Có cả i18n, keyboard, và focus features
}
```

Chain mixins. Đọc từ trong ra ngoài: `FocusMixin` apply trước, sau đó `KeyboardMixin`, cuối cùng `I18nMixin`.

> Verbose. Convention Chromium dùng helper:

```javascript
const MyMixin = I18nMixin(KeyboardMixin(FocusMixin(PolymerElement)));
class MyComponent extends MyMixin {
  // ...
}
```

## Mixin với properties

Mixin có thể declare properties:

```javascript
const FocusMixin = (superClass) => class extends superClass {
  static get properties() {
    return {
      focused: {
        type: Boolean,
        value: false,
        reflectToAttribute: true,
        readOnly: true,
      },
    };
  }
  
  ready() {
    super.ready();
    this.addEventListener('focus', () => this._setFocused(true));
    this.addEventListener('blur', () => this._setFocused(false));
  }
};
```

### Merge properties — Polymer auto handle

Khi component và mixin đều khai báo `properties`, Polymer **merge** tự động:

```javascript
const I18nMixin = (superClass) => class extends superClass {
  static get properties() {
    return {
      locale: { type: String, value: 'en' },
    };
  }
};

class MyComp extends I18nMixin(PolymerElement) {
  static get properties() {
    return {
      title: String,
      // 'locale' từ mixin tự có
    };
  }
}

// MyComp có cả 'locale' và 'title'
```

Polymer khi xử lý class, walk lên prototype chain và collect tất cả `properties`. Không cần manual merge.

## `dedupingMixin` — tránh apply mixin nhiều lần

Khi mixin được chain phức tạp, có thể bị apply 2 lần:

```javascript
class A extends I18nMixin(PolymerElement) { }
class B extends I18nMixin(A) { } // ← I18nMixin apply 2 lần
```

→ Memory waste, có thể bug.

Solution: `dedupingMixin` từ Polymer:

```javascript
import {dedupingMixin} from '@polymer/polymer/lib/utils/mixin.js';

const I18nMixin = dedupingMixin((superClass) => class extends superClass {
  // ...
});
```

`dedupingMixin` cache: nếu mixin đã được apply lên `superClass` rồi, trả về class cũ thay vì wrap mới.

Trong Chromium code:

```javascript
import {dedupingMixin} from 'chrome://resources/polymer/v3_0/polymer/lib/utils/mixin.js';

export const I18nMixin = dedupingMixin((superClass) => {
  return class extends superClass {
    // ...
  };
});
```

→ **Best practice: always wrap mixin với `dedupingMixin`**.

## TypeScript mixin

Trong Chromium hiện đại (TypeScript):

```typescript
import {dedupingMixin} from 'chrome://resources/polymer/v3_0/polymer/lib/utils/mixin.js';

type Constructor<T> = new (...args: any[]) => T;

export interface I18nMixinInterface {
  i18n(key: string, ...args: string[]): string;
  i18nUpdateLocale(): void;
}

export const I18nMixin = dedupingMixin(<T extends Constructor<PolymerElement>>(
  superClass: T
) => {
  class I18nMixin extends superClass implements I18nMixinInterface {
    i18n(key: string, ...args: string[]): string {
      return loadTimeData.getString(key, ...args);
    }
    
    i18nUpdateLocale(): void {
      // ...
    }
  }
  
  return I18nMixin;
});
```

Khi extend:

```typescript
const Base = I18nMixin(PolymerElement);

export class SettingsPage extends Base {
  // TypeScript hiểu this.i18n() có exist
}
```

→ Type-safe. Chromium dùng pattern này nhiều.

## Behaviors — Polymer 1 legacy

Polymer 1 không có ES6 class, dùng `Polymer({...})` function:

```javascript
// Polymer 1 — Behavior definition
var I18nBehavior = {
  properties: {
    locale: { type: String, value: 'en' },
  },
  
  // Lifecycle (Polymer 1 names)
  attached: function() {
    document.addEventListener('language-changed', this._onLangChange);
  },
  
  detached: function() {
    document.removeEventListener('language-changed', this._onLangChange);
  },
  
  i18n: function(key) {
    return loadTimeData.getString(key);
  },
};

// Polymer 1 — Component sử dụng behavior
Polymer({
  is: 'settings-page',
  behaviors: [I18nBehavior],
  // ...
});
```

Đặc trưng Behavior:
- **Object literal**, không phải class/function.
- `behaviors: []` array.
- Polymer 1 merge các keys (properties, methods, listeners) tự động.

### Behaviors trong Polymer 3 — backward compat

Polymer 3 vẫn support behaviors (legacy):

```javascript
import {mixinBehaviors} from '@polymer/polymer/lib/legacy/class.js';

class SettingsPage extends mixinBehaviors([I18nBehavior], PolymerElement) {
  // ...
}
```

→ Trong **code mới**, **không dùng behaviors**. Chỉ gặp khi đọc code cũ.

## Chromium-specific mixins

Trong Chromium WebUI, có nhiều mixin sẵn dùng:

### `I18nMixin`

```javascript
import {I18nMixin} from 'chrome://resources/cr_elements/i18n_mixin.js';

class MyPage extends I18nMixin(PolymerElement) {
  static get template() {
    return html`
      <h1>[[i18n('pageTitle')]]</h1>
      <p>[[i18n('userWelcome', userName)]]</p>
    `;
  }
}
```

Methods cung cấp:
- `i18n(key)` — translate key.
- `i18n(key, ...args)` — với substitutions.
- `i18nAdvanced(key, options)` — với HTML support.
- `i18nUpdateLocale()` — force re-render.

### `WebUIListenerMixin`

```javascript
import {WebUIListenerMixin} from 'chrome://resources/cr_elements/web_ui_listener_mixin.js';

class SettingsPage extends WebUIListenerMixin(PolymerElement) {
  ready() {
    super.ready();
    // Listen to events fire từ C++
    this.addWebUIListener('theme-changed', this.onThemeChanged_);
  }
  
  onThemeChanged_(newTheme) {
    // C++ fired event
  }
}
```

Pattern cũ trước Mojo: C++ gọi `chrome.send('eventName', data)`. Webside listen qua `addWebUIListener`. Đã được Mojo thay thế nhưng vẫn còn nhiều code dùng.

### `ListPropertyUpdateMixin`

```javascript
import {ListPropertyUpdateMixin} from 'chrome://resources/cr_elements/list_property_update_mixin.js';

class BookmarkList extends ListPropertyUpdateMixin(PolymerElement) {
  refreshBookmarks_(newBookmarks) {
    // Smart update: chỉ thay đổi items thực sự đổi
    this.updateList('bookmarks', b => b.id, newBookmarks);
  }
}
```

Helper để update list efficiently — chỉ replace items thay đổi, giữ DOM cho items không đổi.

### `FocusOutlineManagerMixin`

```javascript
import {FocusOutlineManager} from 'chrome://resources/cr_elements/focus_outline_manager.js';
```

Manage focus indicator (visible khi keyboard nav, hidden khi mouse).

### `PolicyControlledIndicatorMixin`

Cho settings được manage bởi enterprise policy — hiển thị icon indicator.

### `PrefControlMixin`

Đồng bộ component property với `PrefService` (sẽ học ở phase 5).

## Khi nào tạo mixin riêng?

**Có**:
- Logic được dùng ở ≥ 3 components.
- Logic phức tạp (>20 dòng).
- Có lifecycle hooks (connectedCallback, disconnectedCallback).

**Không**:
- Logic chỉ 1-2 components — copy paste OK.
- Logic 1-2 dòng — verbose hơn copy.
- Stateless function — chỉ cần export function.

## Function utility — alternative cho mixin

Khi không cần state hay lifecycle, **function utility** đơn giản hơn:

```javascript
// utils.js
export function formatTimestamp(ts) {
  return new Date(ts).toLocaleString();
}

export function classifyError(err) {
  if (err.code === 'NETWORK') return 'network';
  return 'unknown';
}
```

```javascript
import {formatTimestamp} from './utils.js';

class MyComp extends PolymerElement {
  computeTime_(ts) {
    return formatTimestamp(ts);
  }
}
```

→ Đơn giản hơn mixin. Dùng cho pure functions.

## Full ví dụ — tạo mixin của bạn

Giả sử nhiều components cần "loading state":

```javascript
import {dedupingMixin} from 'chrome://resources/polymer/v3_0/polymer/lib/utils/mixin.js';

export const LoadableMixin = dedupingMixin((superClass) => {
  return class extends superClass {
    static get properties() {
      return {
        isLoading: {
          type: Boolean,
          value: false,
          readOnly: true,
          reflectToAttribute: true,
        },
        loadError: {
          type: String,
          value: '',
          readOnly: true,
        },
      };
    }
    
    /**
     * Wrapper cho async operations với loading state.
     * @param {function(): Promise} fn 
     * @returns {Promise}
     */
    async withLoading(fn) {
      this._setIsLoading(true);
      this._setLoadError('');
      try {
        const result = await fn();
        return result;
      } catch (e) {
        this._setLoadError(e.message || 'Unknown error');
        throw e;
      } finally {
        this._setIsLoading(false);
      }
    }
  };
});
```

Sử dụng:

```javascript
class UserPage extends LoadableMixin(PolymerElement) {
  static get template() {
    return html`
      <style>
        :host([is-loading]) .content { opacity: 0.3; }
        .error { color: red; }
      </style>
      
      <template is="dom-if" if="[[isLoading]]">
        <loading-spinner></loading-spinner>
      </template>
      
      <template is="dom-if" if="[[loadError]]">
        <div class="error">[[loadError]]</div>
      </template>
      
      <div class="content">
        <h1>[[user.name]]</h1>
        <p>[[user.email]]</p>
      </div>
    `;
  }
  
  static get properties() {
    return {
      user: Object,
    };
  }
  
  async ready() {
    super.ready();
    await this.loadUser_();
  }
  
  async loadUser_() {
    // withLoading từ mixin — tự handle isLoading, loadError
    await this.withLoading(async () => {
      const response = await fetch('/api/user');
      this.user = await response.json();
    });
  }
}
```

→ Component sạch, logic loading/error được share qua mixin.

## Mixin inheritance — multi-level

Mixin có thể extend mixin khác:

```javascript
const BaseMixin = (sc) => class extends sc {
  doSomething() { ... }
};

const SpecificMixin = (sc) => class extends BaseMixin(sc) {
  // Có cả doSomething từ BaseMixin
  doMoreSpecific() { ... }
};

class MyComp extends SpecificMixin(PolymerElement) {
  // Có cả doSomething và doMoreSpecific
}
```

## Mixin với generic constructor

Khi dùng TypeScript advanced patterns:

```typescript
type Constructor<T = {}> = new (...args: any[]) => T;

interface CounterMixinInterface {
  count: number;
  increment(): void;
}

function CounterMixin<TBase extends Constructor<PolymerElement>>(Base: TBase) {
  return class extends Base implements CounterMixinInterface {
    count = 0;
    increment() { this.count++; }
  };
}
```

Polymer Chromium TypeScript code dùng nhiều pattern này. Khá complex nhưng cần biết để đọc.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Quên `dedupingMixin` | Apply mixin 2 lần khi inheritance | Always wrap với `dedupingMixin` |
| Quên `super.ready()` trong mixin | Parent mixin's `ready` không chạy | Always `super.ready()` đầu hàm |
| Mixin chain quá dài | Khó debug, tên class lạ | Tối đa 3-4 mixins |
| Trùng tên method giữa mixins | Override silent | Đặt tên unique hoặc namespace |
| Trùng property name | Polymer merge có thể conflict | Đặt tên đặc trưng cho mixin |
| Behaviors trong code mới | Legacy syntax, deprecated | Dùng mixin pattern |

## Tóm tắt bài 7

- **Mixin** = function nhận class, trả class mới với features thêm. Polymer 3 standard.
- **Behavior** = object pattern của Polymer 1. Legacy, không dùng cho code mới.
- Pattern: `class extends MyMixin(PolymerElement)`.
- Compose: `A(B(C(PolymerElement)))`.
- **Always `dedupingMixin`** để tránh duplicate apply.
- **Always `super.method()` đầu lifecycle methods** trong mixin.
- Chromium có sẵn: `I18nMixin`, `WebUIListenerMixin`, `ListPropertyUpdateMixin`, `PrefControlMixin`, etc.
- Tự tạo mixin khi: logic share ≥ 3 components, có lifecycle, có state.
- Pure function utility đơn giản hơn — dùng khi không cần state.

**Bài kế tiếp** → [Bài 8: iron-*, paper-*, cr-* element libraries](08-iron-paper-cr-elements.md)
