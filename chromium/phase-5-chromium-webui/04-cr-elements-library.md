# Bài 4: cr-* elements library — đào sâu cho từng element thường dùng

Phase 3 bài 8 đã giới thiệu nhanh `cr-*` family. Bài này **đào sâu** với code thật, properties đầy đủ, slots, events, styling — để khi viết WebUI bạn dùng được luôn không phải tra docs liên tục.

Đây là **tham chiếu**. Đọc 1 lần để biết có gì. Khi viết code, quay lại tra cụ thể.

## Layout — `cr-toolbar`, `cr-link-row`, `cr-action-menu`

### `cr-toolbar` — top bar

```html
<cr-toolbar
    page-name="Settings"
    show-search
    autofocus
    on-search-changed="onSearchChanged_">
  <!-- Actions ở bên phải toolbar -->
  <cr-icon-button slot="actions" 
                   iron-icon="cr:help-outline"
                   title="Help"
                   on-click="openHelp_">
  </cr-icon-button>
  <cr-icon-button slot="actions" 
                   iron-icon="cr:more-vert"
                   title="More">
  </cr-icon-button>
</cr-toolbar>
```

Properties:
- `page-name` — title chính.
- `show-search` — show search box.
- `autofocus` — focus search khi page load.
- `clear-label`, `search-input-aria-description` — a11y labels.

Slots:
- `actions` — buttons phải toolbar.
- `menu` — sidebar menu icon button.

Events:
- `search-changed` — fire khi search query đổi (`e.detail` = query string).
- `cr-toolbar-menu-tap` — fire khi menu button bấm.

### `cr-link-row` — clickable row với arrow

Pattern row trong Settings page:

```html
<cr-link-row 
    label="Privacy and security"
    sub-label="Cookies, history, passwords"
    icon-class="cr-icon"
    role-description="link"
    on-click="navigateToPrivacy_">
</cr-link-row>
```

Properties:
- `label` — text chính (bold).
- `sub-label` — text phụ (xám, dưới label).
- `start-icon` — `iron-icon` name show bên trái.
- `external` — hiển thị "open in new" icon thay arrow.
- `hide-policy-indicator` — ẩn icon enterprise policy indicator.

Slots:
- `prefix` — icon bên trái custom.
- `secondary-action` — element phụ bên phải (vd `cr-toggle`).

```html
<!-- Pattern với toggle -->
<cr-link-row 
    label="Sync"
    sub-label="Synced and enabled">
  <cr-toggle slot="secondary-action" checked="{{syncEnabled}}"></cr-toggle>
</cr-link-row>
```

### `cr-action-menu` — dropdown menu

```html
<cr-icon-button id="moreButton" 
                 iron-icon="cr:more-vert"
                 on-click="openMenu_">
</cr-icon-button>

<cr-action-menu role-description="Menu">
  <button class="dropdown-item" on-click="onEdit_">
    <iron-icon icon="cr:create"></iron-icon>
    Edit
  </button>
  <button class="dropdown-item" on-click="onDuplicate_">
    <iron-icon icon="cr:content-copy"></iron-icon>
    Duplicate
  </button>
  <hr>
  <button class="dropdown-item" on-click="onDelete_">
    <iron-icon icon="cr:delete"></iron-icon>
    Delete
  </button>
</cr-action-menu>
```

Logic:

```javascript
openMenu_(e) {
  const menu = this.shadowRoot.querySelector('cr-action-menu');
  menu.showAt(e.target);
}

onEdit_() {
  const menu = this.shadowRoot.querySelector('cr-action-menu');
  menu.close();
  this.dispatchEvent(new CustomEvent('edit-requested'));
}
```

Auto handle:
- Focus trap.
- ESC close.
- Click outside close.
- Position relative to anchor element.

## Inputs — `cr-input`, `cr-checkbox`, `cr-toggle`, `cr-radio-button`

### `cr-input` — text input

```html
<cr-input
    id="emailInput"
    label="Email"
    type="email"
    value="{{email}}"
    error-message="[[errorMessage]]"
    invalid="[[hasError]]"
    auto-validate
    required
    minlength="3"
    maxlength="100"
    pattern="[^@]+@[^@]+\.[^@]+"
    placeholder="you@example.com"
    on-input="onEmailInput_"
    on-validate="onValidate_">
</cr-input>
```

Properties đầy đủ:

| Property | Type | Mô tả |
|---|---|---|
| `label` | String | Floating label |
| `value` | String | Value (two-way bindable) |
| `type` | String | `text`, `email`, `password`, `number`, `tel`, `url`, `search` |
| `placeholder` | String | Placeholder khi empty |
| `invalid` | Boolean | Hiện error state |
| `error-message` | String | Text khi invalid |
| `auto-validate` | Boolean | Validate ngay khi gõ |
| `required` | Boolean | Bắt buộc |
| `disabled` | Boolean | Disable |
| `readonly` | Boolean | Read-only |
| `autofocus` | Boolean | Focus khi load |
| `minlength` / `maxlength` | Number | Length constraint |
| `pattern` | String | Regex pattern |
| `min` / `max` | Number | Cho type number |
| `step` | Number | Cho type number |

Slots:
- `prefix` — element trước input (icon).
- `suffix` — element sau (button clear, icon).

```html
<cr-input label="Search" type="search">
  <iron-icon icon="cr:search" slot="prefix"></iron-icon>
  <cr-icon-button slot="suffix" iron-icon="cr:close" on-click="clear_">
  </cr-icon-button>
</cr-input>
```

Methods:

```javascript
const input = this.$.emailInput;
input.focus();
input.select();
input.validate();
input.focusInput();    // focus underlying <input> native
```

### `cr-checkbox` — checkbox

```html
<cr-checkbox 
    checked="{{accepted}}"
    disabled$="[[isPolicyControlled]]"
    on-change="onAcceptChange_">
  I accept the terms and conditions
</cr-checkbox>
```

Default slot = label. Properties: `checked`, `disabled`, `tabindex`, `aria-description`.

Events: `change` fire khi state đổi.

### `cr-toggle` — switch

```html
<cr-toggle 
    checked="{{darkMode}}"
    disabled$="[[isControlled]]"
    aria-label="Dark mode"
    on-change="onToggleChange_">
</cr-toggle>
```

Same API như cr-checkbox về `checked`/`disabled`/`change` event.

Quan trọng: thường pair với `cr-link-row` slot `secondary-action`:

```html
<cr-link-row label="Dark mode" sub-label="Override system">
  <cr-toggle slot="secondary-action" checked="{{darkMode}}"></cr-toggle>
</cr-link-row>
```

### `cr-radio-group` + `cr-radio-button`

```html
<cr-radio-group selected="{{selectedTheme}}" 
                 on-selected-changed="onThemeChange_">
  <cr-radio-button name="light" label="Light mode">
    <div class="extra-text">System default</div>
  </cr-radio-button>
  <cr-radio-button name="dark" label="Dark mode"></cr-radio-button>
  <cr-radio-button name="auto" label="Auto" 
                    disabled$="[[!supportsAuto]]">
  </cr-radio-button>
</cr-radio-group>
```

- `selected` — value của radio đang chọn (= `name` của radio button).
- `selected-changed` event với `e.detail.value`.

### `cr-slider` — range slider

```html
<cr-slider 
    min="0" 
    max="100"
    value="{{volume}}"
    label="Volume"
    show-markers="11"
    snaps>
</cr-slider>
```

- `min` / `max` — range.
- `value` — current (two-way).
- `show-markers="N"` — N tick marks.
- `snaps` — snap to tick marks.

### `cr-search-field` — search box độc lập (không phải toolbar)

```html
<cr-search-field
    placeholder="Search bookmarks"
    autofocus
    on-search-changed="onSearch_">
</cr-search-field>
```

`search-changed` event fire khi query đổi (có debounce built-in).

## Buttons — `cr-button`, `cr-icon-button`

### `cr-button` — text button

```html
<!-- Variants -->
<cr-button>Default</cr-button>
<cr-button class="action-button">Primary (blue)</cr-button>
<cr-button class="tonal-button">Tonal (light blue)</cr-button>
<cr-button class="cancel-button">Cancel</cr-button>

<!-- With icons -->
<cr-button>
  <iron-icon icon="cr:add" slot="prefix-icon"></iron-icon>
  Add Item
</cr-button>

<cr-button class="action-button">
  Continue
  <iron-icon icon="cr:arrow-forward" slot="suffix-icon"></iron-icon>
</cr-button>

<!-- States -->
<cr-button disabled>Disabled</cr-button>
<cr-button loading>Loading...</cr-button>
```

### `cr-icon-button` — icon-only button

```html
<cr-icon-button 
    iron-icon="cr:close"
    title="Close"
    aria-label="Close dialog"
    on-click="close_">
</cr-icon-button>

<!-- Với badge -->
<cr-icon-button iron-icon="cr:notifications">
  <span slot="badge">3</span>
</cr-icon-button>
```

## Dialog — `cr-dialog`

```html
<cr-dialog 
    id="confirmDialog"
    ignore-popstate
    on-close="onDialogClose_">
  
  <!-- Header với close button (auto) -->
  <div slot="title">Delete bookmark?</div>
  
  <div slot="body">
    <p>"[[bookmarkName]]" sẽ bị xoá vĩnh viễn.</p>
    <p>Hành động này không thể hoàn tác.</p>
  </div>
  
  <!-- Footer buttons -->
  <div slot="button-container">
    <cr-button class="cancel-button" on-click="onCancel_">
      Cancel
    </cr-button>
    <cr-button class="action-button" on-click="onConfirmDelete_">
      Delete
    </cr-button>
  </div>
</cr-dialog>
```

Slots: `title`, `body`, `button-container`, `header` (custom header), `footer` (below buttons).

Properties:
- `no-cancel` — không có close X button.
- `ignore-popstate` — không close khi back button.
- `consume-keydown-event` — dialog handle key event, không propagate.

Methods:
```javascript
this.$.confirmDialog.showModal();   // mở dialog modal
this.$.confirmDialog.close();        // đóng
this.$.confirmDialog.cancel();       // đóng + fire 'cancel' event
```

Events:
- `close` — dialog closed.
- `cancel` — closed via cancel/ESC.

### Pattern dialog với form

```html
<cr-dialog id="addBookmarkDialog">
  <div slot="title">Add Bookmark</div>
  
  <div slot="body">
    <cr-input 
        id="urlInput" 
        label="URL" 
        value="{{newUrl}}"
        autofocus
        required
        on-input="validateUrl_">
    </cr-input>
    
    <cr-input 
        id="titleInput" 
        label="Title" 
        value="{{newTitle}}">
    </cr-input>
  </div>
  
  <div slot="button-container">
    <cr-button class="cancel-button" on-click="closeDialog_">
      Cancel
    </cr-button>
    <cr-button 
        class="action-button" 
        disabled$="[[!isValid_]]"
        on-click="onSave_">
      Save
    </cr-button>
  </div>
</cr-dialog>
```

## Selection — `cr-tabs`, `cr-card-radio-group`

### `cr-tabs` — tab bar

```html
<cr-tabs
    tab-names="[[tabNames_]]"
    selected="{{selectedIndex}}"
    on-selected-changed="onTabChange_">
</cr-tabs>

<!-- Content cho từng tab -->
<div hidden$="[[!isTab_(selectedIndex, 0)]]">General settings</div>
<div hidden$="[[!isTab_(selectedIndex, 1)]]">Privacy settings</div>
<div hidden$="[[!isTab_(selectedIndex, 2)]]">Advanced settings</div>
```

```javascript
static get properties() {
  return {
    tabNames_: {
      type: Array,
      value: () => ['General', 'Privacy', 'Advanced'],
    },
    selectedIndex: {
      type: Number,
      value: 0,
    },
  };
}

isTab_(selected, idx) { return selected === idx; }
```

### `cr-card-radio-group` — card-style choices

```html
<cr-card-radio-group selected="{{selectedSize}}">
  <cr-card-radio-button name="small">
    <div class="card-title">Small</div>
    <div class="card-description">Compact view</div>
  </cr-card-radio-button>
  <cr-card-radio-button name="medium">
    <div class="card-title">Medium</div>
    <div class="card-description">Default view</div>
  </cr-card-radio-button>
  <cr-card-radio-button name="large">
    <div class="card-title">Large</div>
    <div class="card-description">Spacious view</div>
  </cr-card-radio-button>
</cr-card-radio-group>
```

## Expand/Collapse — `cr-expand-button` + `iron-collapse`

```html
<cr-expand-button 
    expanded="{{advancedExpanded}}"
    no-hover>
  Advanced settings
</cr-expand-button>

<iron-collapse opened="[[advancedExpanded]]">
  <!-- Content collapsible -->
  <cr-link-row label="Setting 1"></cr-link-row>
  <cr-link-row label="Setting 2"></cr-link-row>
</iron-collapse>
```

## Loading + States — `cr-loading-gradient`, `cr-progress`

### `cr-loading-gradient` — skeleton loading

```html
<template is="dom-if" if="[[isLoading]]">
  <cr-loading-gradient>
    <svg xmlns="http://www.w3.org/2000/svg" 
         width="100%" height="80">
      <clipPath id="loading-clip">
        <rect x="0" y="10" width="60%" height="16" rx="4"/>
        <rect x="0" y="36" width="80%" height="14" rx="4"/>
        <rect x="0" y="56" width="40%" height="12" rx="4"/>
      </clipPath>
    </svg>
  </cr-loading-gradient>
</template>
```

Skeleton placeholder với gradient animation. Pattern hơn `<loading-spinner>` cho perceived performance.

## Indicators — `cr-policy-indicator`, `cr-tooltip-icon`

### `cr-policy-indicator` — enterprise policy

```html
<cr-link-row label="Allowed sites">
  <cr-policy-indicator
      slot="prefix"
      indicator-type="devicePolicy"
      indicator-source-name="Admin">
  </cr-policy-indicator>
</cr-link-row>
```

`indicator-type`: `devicePolicy`, `userPolicy`, `extension`, `parent`, `owner`, `recommended`, `primary_user`, etc.

Show icon (building, person, etc.) — user hover → tooltip "Controlled by..."

### `cr-tooltip-icon` — help tooltip

```html
<cr-link-row label="Sync passwords">
  <cr-tooltip-icon 
      slot="prefix"
      icon-class="cr-icon"
      tooltip-text="Synced with your Google account">
  </cr-tooltip-icon>
</cr-link-row>
```

## Pattern thực tế — Settings section

Settings có pattern row group rất phổ biến. Đây là template:

```javascript
import 'chrome://resources/cr_elements/cr_link_row/cr_link_row.js';
import 'chrome://resources/cr_elements/cr_toggle/cr_toggle.js';
import 'chrome://resources/cr_elements/cr_radio_group/cr_radio_group.js';
import 'chrome://resources/cr_elements/cr_radio_button/cr_radio_button.js';
import 'chrome://resources/cr_elements/cr_expand_button/cr_expand_button.js';
import 'chrome://resources/cr_elements/cr_policy_indicator/cr_policy_indicator.js';
import 'chrome://resources/polymer/v3_0/iron-collapse/iron-collapse.js';

class PrivacySettings extends PolymerElement {
  static get is() { return 'privacy-settings'; }
  
  static get template() {
    return html`
      <style>
        :host {
          display: block;
          --cr-section-padding: 20px;
        }
        .section {
          padding: var(--cr-section-padding);
          background: var(--cr-card-background-color, white);
          border-radius: 8px;
          margin-bottom: 16px;
        }
        .section-title {
          font-size: 14px;
          font-weight: 500;
          color: var(--cr-primary-text-color);
          margin-bottom: 8px;
        }
        .section-description {
          font-size: 13px;
          color: var(--cr-secondary-text-color);
          margin-bottom: 16px;
        }
      </style>
      
      <!-- Section 1: Safe Browsing -->
      <div class="section">
        <h2 class="section-title">Safe Browsing</h2>
        <p class="section-description">
          Bảo vệ bạn khỏi trang web nguy hiểm
        </p>
        
        <cr-radio-group selected="{{safeBrowsingLevel}}">
          <cr-radio-button name="enhanced" label="Enhanced protection">
            <span slot="extra-content">
              Real-time + ML-based detection
            </span>
          </cr-radio-button>
          
          <cr-radio-button name="standard" label="Standard protection">
            <span slot="extra-content">
              Default protection level
            </span>
          </cr-radio-button>
          
          <cr-radio-button name="off" label="No protection (không khuyến nghị)">
          </cr-radio-button>
        </cr-radio-group>
      </div>
      
      <!-- Section 2: Cookies -->
      <div class="section">
        <h2 class="section-title">Cookies and other site data</h2>
        
        <cr-link-row 
            label="Block third-party cookies"
            sub-label="Sites can use first-party cookies">
          <cr-toggle slot="secondary-action" 
                     checked="{{blockThirdPartyCookies}}">
          </cr-toggle>
        </cr-link-row>
        
        <cr-link-row 
            label="Clear cookies when closing browser"
            sub-label="Cookies will be deleted on browser exit">
          <cr-toggle slot="secondary-action" 
                     checked="{{clearOnExit}}"
                     disabled$="[[isPolicyControlled]]">
          </cr-toggle>
          <template is="dom-if" if="[[isPolicyControlled]]">
            <cr-policy-indicator
                slot="prefix"
                indicator-type="userPolicy">
            </cr-policy-indicator>
          </template>
        </cr-link-row>
      </div>
      
      <!-- Section 3: Advanced (collapsible) -->
      <div class="section">
        <cr-expand-button expanded="{{advancedExpanded}}">
          Advanced settings
        </cr-expand-button>
        
        <iron-collapse opened="[[advancedExpanded]]">
          <cr-link-row 
              label="Do Not Track"
              sub-label="Send 'Do Not Track' header with requests"
              on-click="openDoNotTrackDialog_">
          </cr-link-row>
          
          <cr-link-row 
              label="Use secure DNS"
              sub-label="Encrypted DNS queries">
            <cr-toggle slot="secondary-action" 
                       checked="{{useSecureDns}}">
            </cr-toggle>
          </cr-link-row>
        </iron-collapse>
      </div>
    `;
  }
  
  static get properties() {
    return {
      safeBrowsingLevel: { 
        type: String, 
        value: 'standard',
        observer: 'safeBrowsingChanged_',
      },
      blockThirdPartyCookies: { type: Boolean, value: true },
      clearOnExit: { type: Boolean, value: false },
      useSecureDns: { type: Boolean, value: true },
      advancedExpanded: { type: Boolean, value: false },
      isPolicyControlled: { type: Boolean, value: false },
    };
  }
  
  safeBrowsingChanged_(newLevel) {
    // Save to backend
    this.proxy_.handler.setSafeBrowsingLevel(newLevel);
  }
  
  openDoNotTrackDialog_() {
    // Open separate dialog component
  }
}
```

→ Đây là **pattern điển hình** một settings page. Nhiều section, mỗi section có title + rows.

## Style customization — CSS variables

`cr-*` expose nhiều variables:

```css
:root {
  /* Primary colors */
  --cr-primary-text-color: #202124;
  --cr-secondary-text-color: #5f6368;
  --cr-disabled-text-color: rgba(0, 0, 0, 0.38);
  --cr-link-color: #1a73e8;
  --cr-focus-outline-color: #1a73e8;
  
  /* Surfaces */
  --cr-card-background-color: white;
  --cr-fallback-color-surface: white;
  --cr-card-border-color: rgba(0, 0, 0, 0.06);
  
  /* Spacing */
  --cr-section-padding: 20px;
  --cr-section-vertical-padding: 12px;
  
  /* Icon colors */
  --cr-icon-color: #5f6368;
  
  /* Specific elements */
  --cr-button-edge-spacing: 16px;
  --cr-toggle-bar-color: #bdbdbd;
  --cr-toggle-handle-color: white;
  --cr-toggle-bar-color-checked: #1a73e8;
  --cr-toggle-handle-color-checked: white;
  
  /* Errors */
  --cr-input-error-color: #d93025;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  :root {
    --cr-primary-text-color: #e8eaed;
    --cr-secondary-text-color: #9aa0a6;
    --cr-card-background-color: #292a2d;
    /* ... */
  }
}
```

→ Define tokens ở root, cr-* tự pick up. Override per element nếu cần:

```css
my-component cr-button.special {
  --cr-button-background-color: red;
  --cr-button-text-color: white;
}
```

## Khi nào KHÔNG dùng cr-*?

| Use case | Alternative |
|---|---|
| Component cần highly custom design | Tự viết, không dùng cr-* |
| Need feature cr-* không có | Tự viết hoặc fork |
| Performance critical (rendering 1000s items) | `iron-list` virtual scroll |
| Page hoàn toàn không phải settings/cài đặt style | Có thể không cần cr-* |

Đa số WebUI page Chromium dùng cr-* nên consistency cao.

## Tóm tắt bài 4

`cr-*` library cover gần như mọi UI element bạn cần:

| Loại | Elements |
|---|---|
| **Layout** | `cr-toolbar`, `cr-link-row`, `cr-action-menu` |
| **Inputs** | `cr-input`, `cr-checkbox`, `cr-toggle`, `cr-radio-group/button`, `cr-slider`, `cr-search-field` |
| **Buttons** | `cr-button` (default/action/tonal), `cr-icon-button` |
| **Dialog** | `cr-dialog` (modal) |
| **Selection** | `cr-tabs`, `cr-card-radio-group` |
| **Collapse** | `cr-expand-button` + `iron-collapse` |
| **Loading** | `cr-loading-gradient` |
| **Indicators** | `cr-policy-indicator`, `cr-tooltip-icon` |

**Patterns**:
- Settings row: `cr-link-row` với `cr-toggle` slot `secondary-action`.
- Form trong dialog: `cr-dialog` + `cr-input` + `cr-button` slots.
- Tabs: `cr-tabs` + `hidden$="[[!isTab_()]]"`.
- Policy: `cr-policy-indicator` + `disabled$="[[isControlled]]"`.

Đọc source ở `ui/webui/resources/cr_elements/` để xem full API.

**Bài kế tiếp** → [Bài 5: i18n và loadTimeData](05-i18n-loadtime-data.md)
