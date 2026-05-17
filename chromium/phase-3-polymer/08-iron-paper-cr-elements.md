# Bài 8: iron-*, paper-*, cr-* — Element libraries

Polymer team build sẵn các "library element" — component đã viết, bạn import dùng luôn. Có **3 family** chính:

- **iron-*** — basic UI building blocks (icon, list, scroll, a11y helpers).
- **paper-*** — Material Design components (button, input, dialog với MD style).
- **cr-*** — Chromium's own design system (cr-button, cr-toggle, cr-dialog với Chromium style).

Trong Chromium WebUI bạn **chủ yếu dùng `cr-*`** (Chromium thay paper-* bằng cr-*). Hiểu cả 3 vì code legacy/upstream Polymer có thể xuất hiện.

## Tại sao có 3 family?

Lịch sử:

1. **2015 — iron-*** ra trước, là building blocks tổng quát.
2. **2015 — paper-*** Material Design, build trên iron-*.
3. **2017+ — Chromium fork paper-*** thành cr-* để có style consistent với Chrome design (Material You sau này), bỏ một số element không cần.

Hiện tại:
- Code **mới trong Chromium**: dùng cr-* hoặc LitElement equivalents.
- Code **cũ Chromium**: vẫn iron-* và paper-* nhiều chỗ.
- Code **upstream Polymer.dev tutorial**: paper-*.

## `iron-*` family — building blocks

`iron-*` cung cấp **low-level** utilities. Không có style đặc trưng (style nhỏ + nhiều CSS variables để customize).

### `iron-icon` — display SVG icon

```html
<link rel="import" href="iron-icon/iron-icon.html">
<link rel="import" href="iron-icons/iron-icons.html">

<iron-icon icon="add"></iron-icon>
<iron-icon icon="settings" style="color: blue"></iron-icon>
<iron-icon icon="image:photo"></iron-icon>      <!-- "image" iconset, "photo" icon -->
<iron-icon icon="my-icons:special"></iron-icon> <!-- custom iconset -->
```

Icons từ Material Icons set. Có thể custom iconset.

> Polymer 3 version: `import '@polymer/iron-icon/iron-icon.js';`

### `iron-iconset-svg` — define custom iconset

```html
<iron-iconset-svg name="my-icons" size="24">
  <svg>
    <defs>
      <g id="logo">
        <path d="..."/>
      </g>
      <g id="brand">
        <path d="..."/>
      </g>
    </defs>
  </svg>
</iron-iconset-svg>

<!-- Use -->
<iron-icon icon="my-icons:logo"></iron-icon>
```

### `iron-list` — virtualized list

```html
<iron-list items="[[items]]" as="item" style="height: 400px">
  <template>
    <div class="item">
      <span>[[item.name]]</span>
    </div>
  </template>
</iron-list>
```

**Khác `dom-repeat`**: chỉ render visible items, virtual scroll. Cho list dài (10k+ items).

```javascript
static get properties() {
  return {
    items: Array,  // 100k items OK
  };
}
```

iron-list quản lý DOM recycling — như RecyclerView trong Android. Performance tốt cho list lớn.

### `iron-a11y-keys` — keyboard shortcuts

```html
<iron-a11y-keys target="[[focusTarget_]]" keys="enter space" on-keys-pressed="onActivate_">
</iron-a11y-keys>

<input id="myInput" on-focus="setFocusTarget_">
```

```javascript
setFocusTarget_(e) {
  this.focusTarget_ = e.target;
}

onActivate_() {
  // Enter hoặc space được nhấn
}
```

Standardize keyboard interaction cho a11y.

### `iron-resizable-behavior` (Polymer 1) / iron-overlay-behavior

Mixin/behavior support dùng cho:
- Notify children khi component resize.
- Manage overlay (dialog, dropdown).

```javascript
import {IronOverlayBehavior} from '@polymer/iron-overlay-behavior/iron-overlay-behavior.js';

class MyDialog extends mixinBehaviors([IronOverlayBehavior], PolymerElement) {
  // Có open(), close(), opened property
}
```

### Other iron-*

| Element | Mục đích |
|---|---|
| `iron-input` | Input với validation |
| `iron-form` | Form helpers |
| `iron-pages` | Page switching (như tab) |
| `iron-collapse` | Animate collapse/expand |
| `iron-image` | Image với lazy load, placeholder |
| `iron-ajax` | XHR helper (deprecated, dùng fetch) |
| `iron-media-query` | Match CSS media query trong JS |
| `iron-fit-behavior` | Position element relative to other |
| `iron-scroll-target-behavior` | Custom scroll containers |

## `paper-*` family — Material Design

`paper-*` build trên iron-*, thêm Material Design style.

### `paper-button`

```html
<link rel="import" href="paper-button/paper-button.html">

<paper-button>Default</paper-button>
<paper-button raised>Raised</paper-button>
<paper-button raised disabled>Disabled</paper-button>
<paper-button class="custom" raised>Custom</paper-button>
```

```css
paper-button.custom {
  --paper-button-flat-keyboard-focus: { background: red; };
  background-color: #1a73e8;
  color: white;
}
```

### `paper-input`

```html
<paper-input label="Name" value="{{name}}"></paper-input>
<paper-input label="Email" type="email" required></paper-input>
<paper-input label="Password" type="password" minlength="8"></paper-input>
```

Material design floating label, error state, validation built-in.

### `paper-dialog`

```html
<paper-dialog id="dialog">
  <h2>Confirm</h2>
  <p>Bạn có chắc?</p>
  <div class="buttons">
    <paper-button dialog-dismiss>Cancel</paper-button>
    <paper-button dialog-confirm>OK</paper-button>
  </div>
</paper-dialog>

<paper-button on-click="openDialog_">Open</paper-button>
```

```javascript
openDialog_() {
  this.$.dialog.open();
}
```

Auto handle: focus trap, backdrop, escape close, ARIA.

### Other paper-*

| Element | Mục đích |
|---|---|
| `paper-checkbox` | Material checkbox |
| `paper-toggle-button` | Toggle switch |
| `paper-radio-button` / `paper-radio-group` | Radio buttons |
| `paper-slider` | Range slider |
| `paper-dropdown-menu` | Select dropdown |
| `paper-tabs` | Tab bar |
| `paper-card` | Material Card |
| `paper-fab` | Floating Action Button |
| `paper-progress` | Progress bar |
| `paper-spinner` | Loading spinner |
| `paper-tooltip` | Tooltip |
| `paper-icon-button` | Icon-only button |

→ **Chromium ít dùng paper-***. Đa số đã chuyển sang `cr-*` equivalents.

## `cr-*` family — Chromium design system

Đây là **family bạn dùng nhiều nhất** trong Chromium WebUI.

Path import:
```javascript
import 'chrome://resources/cr_elements/cr_button/cr_button.js';
import 'chrome://resources/cr_elements/cr_toggle/cr_toggle.js';
// ...
```

Hoặc trong build:
```javascript
import '//resources/cr_elements/cr_button/cr_button.js';
```

### `cr-button`

```html
<cr-button>Default</cr-button>
<cr-button class="action-button">Primary</cr-button>
<cr-button disabled>Disabled</cr-button>
<cr-button class="tonal-button">Tonal</cr-button>
```

3 variant:
- Default — text button.
- `action-button` — primary blue button.
- `tonal-button` — secondary tinted button.

```html
<cr-button on-click="onSave_">
  <iron-icon icon="cr:check" slot="prefix-icon"></iron-icon>
  Save
</cr-button>
```

Slots: `prefix-icon`, `suffix-icon` (Chromium-specific extension).

### `cr-toggle`

```html
<cr-toggle 
    checked="{{darkMode}}" 
    disabled$="[[isPolicyControlled]]">
</cr-toggle>
```

Toggle switch. Có `notify: true` cho `checked` → two-way binding work.

Events: `change` fire khi user toggle.

```html
<cr-toggle on-change="onToggleChange_"></cr-toggle>
```

```javascript
onToggleChange_(e) {
  console.log('Toggled to', e.target.checked);
}
```

### `cr-checkbox`

```html
<cr-checkbox checked="{{accepted}}">
  I agree to terms
</cr-checkbox>
```

Material checkbox với label slot.

### `cr-input`

```html
<cr-input 
    label="Email"
    type="email"
    value="{{email}}"
    invalid="[[hasError]]"
    error-message="Email không hợp lệ"
    auto-validate>
</cr-input>
```

Properties:
- `label` — floating label.
- `type` — text, email, password, etc.
- `value` — two-way bindable.
- `invalid` — show error state.
- `error-message` — text khi invalid.
- `auto-validate` — validate ngay khi input.

### `cr-radio-group` và `cr-radio-button`

```html
<cr-radio-group selected="{{selectedTheme}}">
  <cr-radio-button name="light">Light</cr-radio-button>
  <cr-radio-button name="dark">Dark</cr-radio-button>
  <cr-radio-button name="auto">Auto</cr-radio-button>
</cr-radio-group>
```

`selected` = value của radio đang chọn.

### `cr-dialog`

```html
<cr-dialog id="confirmDialog">
  <div slot="title">Confirm Delete</div>
  <div slot="body">
    Bạn có chắc muốn xoá [[itemName]]?
  </div>
  <div slot="button-container">
    <cr-button class="cancel-button" on-click="onCancel_">Cancel</cr-button>
    <cr-button class="action-button" on-click="onDelete_">Delete</cr-button>
  </div>
</cr-dialog>
```

Slots: `title`, `body`, `button-container`, `header`, `footer`.

```javascript
showDialog_() {
  this.$.confirmDialog.showModal();
}

onCancel_() {
  this.$.confirmDialog.close();
}

onDelete_() {
  // Do delete
  this.$.confirmDialog.close();
}
```

Methods: `showModal()`, `close()`. Auto handle focus trap, ESC, backdrop click.

### `cr-icon-button`

```html
<cr-icon-button iron-icon="cr:close" on-click="onClose_"></cr-icon-button>
<cr-icon-button iron-icon="cr:more-vert" title="More options"></cr-icon-button>
```

Icon-only button. Build-in tooltip, focus state.

### `cr-tabs`

```html
<cr-tabs tab-names="[['General', 'Privacy', 'Advanced']]" selected="{{selectedTab}}">
</cr-tabs>

<div hidden$="[[!isTab_(selectedTab, 0)]]">General content</div>
<div hidden$="[[!isTab_(selectedTab, 1)]]">Privacy content</div>
<div hidden$="[[!isTab_(selectedTab, 2)]]">Advanced content</div>
```

```javascript
isTab_(selected, idx) { return selected === idx; }
```

### `cr-toolbar`

```html
<cr-toolbar 
    page-name="Settings"
    show-search>
  <cr-button slot="actions" on-click="onAddNew_">Add</cr-button>
</cr-toolbar>
```

Top bar với title + search box + actions.

### `cr-action-menu` — context menu / dropdown

```html
<cr-icon-button iron-icon="cr:more-vert" on-click="openMenu_"></cr-icon-button>

<cr-action-menu>
  <button class="dropdown-item" on-click="onEdit_">Edit</button>
  <button class="dropdown-item" on-click="onDelete_">Delete</button>
  <hr>
  <button class="dropdown-item" on-click="onShare_">Share</button>
</cr-action-menu>
```

```javascript
openMenu_(e) {
  this.shadowRoot.querySelector('cr-action-menu').showAt(e.target);
}
```

### `cr-link-row`

```html
<cr-link-row
    label="Privacy and security"
    sub-label="Cookies, history, passwords"
    icon-class="cr-icon"
    on-click="navigateToPrivacy_">
</cr-link-row>
```

Row với icon + text + arrow — pattern row trong Settings page.

### `cr-expand-button`

```html
<cr-expand-button expanded="{{showAdvanced}}">
  Advanced settings
</cr-expand-button>

<iron-collapse opened="[[showAdvanced]]">
  <p>Hidden advanced settings...</p>
</iron-collapse>
```

Button với expand/collapse animation. Thường pair với `iron-collapse`.

### Khác

| Element | Mục đích |
|---|---|
| `cr-card-radio-group` | Card-style radio group |
| `cr-search-field` | Search box với clear button |
| `cr-slider` | Range slider |
| `cr-tooltip` | Tooltip (replacement cho paper-tooltip) |
| `cr-loading-gradient` | Skeleton loading placeholder |
| `cr-icon` | Icon (replacement cho iron-icon) |
| `cr-fingerprint-progress-arc` | Progress arc cho fingerprint setup |
| `cr-policy-indicator` | Icon indicator policy-controlled setting |

## Browse `cr-*` library

Tốt nhất là **đọc trực tiếp Chromium source**:

```
ui/webui/resources/cr_elements/
├── cr_button/
│   ├── cr_button.ts
│   ├── cr_button.html.ts (auto-generated)
│   ├── cr_button.css.ts (auto-generated)
│   └── cr_button.html (source HTML)
├── cr_toggle/
│   ├── cr_toggle.ts
│   └── ...
├── cr_dialog/
└── ... (~40 elements)
```

Tools:
- **source.chromium.org**: search "cr_button" hoặc browse `ui/webui/resources/cr_elements/`.
- Trong code, search "import 'chrome://resources/cr_elements/" để xem mọi component dùng.

## `cr-*` Polymer vs LitElement version

Chromium đang migrate cr-* sang LitElement:

```
cr_button.ts           ← Polymer 3 (older)
cr_lit_button.ts        ← LitElement (newer)
```

Trong source, có thể thấy cả 2 phiên bản. Khi import:

```javascript
// Polymer 3 version
import 'chrome://resources/cr_elements/cr_button/cr_button.js';

// LitElement version (mới hơn)
import 'chrome://resources/cr_elements/cr_button/cr_lit_button.js';
```

Convention: nếu component bạn đang viết là Polymer 3, dùng `cr_button.js` (Polymer). Nếu LitElement, dùng `cr_lit_button.js`.

→ Bài 9 sẽ nói về migration path.

## Style variables — customize cr-* elements

`cr-*` elements expose nhiều CSS custom properties. Vd `cr-button`:

```css
cr-button.my-custom {
  --cr-button-text-color: white;
  --cr-button-background-color: #1a73e8;
  --cr-button-text-color-hover: rgba(255, 255, 255, 0.9);
  --cr-button-background-color-hover: #1557b0;
}
```

Đọc source `cr_button.css` để biết các variables available.

Chromium-wide tokens:

```css
:root {
  --cr-primary-text-color: #202124;
  --cr-secondary-text-color: #5f6368;
  --cr-link-color: #1a73e8;
  --cr-icon-color: #5f6368;
  --cr-separator-color: rgba(0, 0, 0, 0.06);
  --cr-card-background-color: white;
  --cr-section-padding: 20px;
  --cr-section-vertical-padding: 12px;
  /* ... */
}

.dark-theme {
  --cr-primary-text-color: #e8eaed;
  --cr-secondary-text-color: #9aa0a6;
  /* ... */
}
```

→ Define ở document level (vd `settings.html`), `cr-*` components tự dùng.

## Real example — Settings page với nhiều cr-*

```javascript
import 'chrome://resources/cr_elements/cr_button/cr_button.js';
import 'chrome://resources/cr_elements/cr_toggle/cr_toggle.js';
import 'chrome://resources/cr_elements/cr_input/cr_input.js';
import 'chrome://resources/cr_elements/cr_dialog/cr_dialog.js';
import 'chrome://resources/cr_elements/cr_radio_group/cr_radio_group.js';
import 'chrome://resources/cr_elements/cr_radio_button/cr_radio_button.js';
import 'chrome://resources/cr_elements/cr_link_row/cr_link_row.js';
import {PolymerElement, html} from 'chrome://resources/polymer/v3_0/polymer/polymer-element.js';

class AppearanceSettings extends PolymerElement {
  static get is() { return 'appearance-settings'; }
  
  static get template() {
    return html`
      <style>
        :host {
          display: block;
          padding: var(--cr-section-padding, 20px);
        }
        .section {
          margin-bottom: 24px;
        }
        .section-title {
          font-size: 14px;
          font-weight: 500;
          color: var(--cr-primary-text-color);
          margin-bottom: 12px;
        }
        .row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 0;
        }
        .row-label {
          color: var(--cr-primary-text-color);
        }
        .row-sub {
          color: var(--cr-secondary-text-color);
          font-size: 12px;
          margin-top: 2px;
        }
      </style>
      
      <div class="section">
        <h2 class="section-title">Theme</h2>
        <cr-radio-group selected="{{theme}}">
          <cr-radio-button name="light">Light</cr-radio-button>
          <cr-radio-button name="dark">Dark</cr-radio-button>
          <cr-radio-button name="auto">Auto (System)</cr-radio-button>
        </cr-radio-group>
      </div>
      
      <div class="section">
        <h2 class="section-title">Display</h2>
        <div class="row">
          <div>
            <div class="row-label">Dark mode</div>
            <div class="row-sub">Override system theme</div>
          </div>
          <cr-toggle 
              checked="{{darkMode}}" 
              disabled$="[[isDarkModeManaged]]">
          </cr-toggle>
        </div>
        
        <div class="row">
          <div class="row-label">Font size</div>
          <cr-input 
              type="number" 
              value="{{fontSize}}"
              min="10" max="20"
              style="width: 80px">
          </cr-input>
        </div>
      </div>
      
      <div class="section">
        <h2 class="section-title">Advanced</h2>
        <cr-link-row
            label="Customize fonts"
            sub-label="Choose font family"
            on-click="openFontPicker_">
        </cr-link-row>
        <cr-link-row
            label="Page zoom"
            sub-label="[[zoomLevel]]%"
            on-click="openZoomDialog_">
        </cr-link-row>
      </div>
      
      <div class="section">
        <cr-button class="action-button" on-click="saveSettings_">
          Save Changes
        </cr-button>
        <cr-button on-click="resetDefaults_">Reset to Defaults</cr-button>
      </div>
      
      <!-- Reset confirmation dialog -->
      <cr-dialog id="resetDialog">
        <div slot="title">Reset to Defaults?</div>
        <div slot="body">
          Tất cả tuỳ chỉnh sẽ bị xoá. Hành động này không thể hoàn tác.
        </div>
        <div slot="button-container">
          <cr-button class="cancel-button" on-click="onCancelReset_">
            Cancel
          </cr-button>
          <cr-button class="action-button" on-click="onConfirmReset_">
            Reset
          </cr-button>
        </div>
      </cr-dialog>
    `;
  }
  
  static get properties() {
    return {
      theme: { type: String, value: 'auto' },
      darkMode: { type: Boolean, value: false },
      fontSize: { type: Number, value: 14 },
      zoomLevel: { type: Number, value: 100 },
      isDarkModeManaged: { type: Boolean, value: false },
    };
  }
  
  saveSettings_() {
    // Call Mojo
  }
  
  resetDefaults_() {
    this.$.resetDialog.showModal();
  }
  
  onCancelReset_() {
    this.$.resetDialog.close();
  }
  
  onConfirmReset_() {
    this.theme = 'auto';
    this.darkMode = false;
    this.fontSize = 14;
    this.$.resetDialog.close();
  }
  
  openFontPicker_() { /* ... */ }
  openZoomDialog_() { /* ... */ }
}

customElements.define(AppearanceSettings.is, AppearanceSettings);
```

→ Bạn thấy: hầu hết UI elements là `cr-*`. Style chỉ là layout + spacing. Đây là **đặc trưng Chromium WebUI**.

## Bẫy thường gặp

| Bẫy | Cách tránh |
|---|---|
| Mix `paper-*` và `cr-*` cùng page | Chọn 1 family. Code mới: `cr-*` |
| Quên import cr-element | `Uncaught (in promise) Error: cr-button is not defined` → Add `import` |
| Style cr-* qua descendant selector | Không work (Shadow DOM). Dùng CSS variables |
| Dùng `paper-toggle-button` thay `cr-toggle` | Cũ + style không match | Dùng `cr-toggle` |
| Quên slot trong `cr-dialog` | Content không hiện | Set `slot="title"`, `slot="body"`, etc. |
| `cr-button` với pure text trong content | OK | Chỉ text content được render |
| Iron-icon trong cr-button không có color | iron-icon dùng `currentColor` | Set `color` CSS cho parent |

## Tóm tắt bài 8

- **`iron-*`**: low-level building blocks, không có style.
- **`paper-*`**: Material Design components, build trên iron-*.
- **`cr-*`**: Chromium design system, ưu tiên dùng trong WebUI.
- **Code mới Chromium**: dùng `cr-*` (Polymer hoặc LitElement version).
- Customize qua CSS custom properties (`--cr-*` tokens).
- Đọc source `ui/webui/resources/cr_elements/` để biết available properties.
- Pattern: import elements riêng, không bundle (giảm size).
- Common elements: `cr-button`, `cr-toggle`, `cr-input`, `cr-dialog`, `cr-radio-group`, `cr-link-row`, `cr-tabs`, `cr-action-menu`.

**Bài kế tiếp** → [Bài 9: Polymer vs LitElement — so sánh và migration](09-polymer-vs-litelement.md)
