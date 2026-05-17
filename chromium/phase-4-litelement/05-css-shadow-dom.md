# Bài 5: CSS trong LitElement

## Static Styles

```javascript
import {LitElement, html, css} from 'lit';

class MyComponent extends LitElement {
  static styles = css`
    /* Tất cả CSS này được scoped vào shadow DOM */
    :host {
      display: block;
    }
    .title {
      font-size: 20px;
      color: var(--title-color, #333);
    }
  `;
}
```

Lit tự động inject styles vào shadow DOM. Styles được share (dùng `<style>` với `CSSStyleSheet` adoptedStyleSheets).

---

## Kế thừa Styles

```javascript
class BaseButton extends LitElement {
  static styles = css`
    :host { display: inline-flex; }
    button { padding: 8px 16px; border-radius: 4px; }
  `;
}

class PrimaryButton extends BaseButton {
  static styles = [
    // Kế thừa styles từ parent
    BaseButton.styles,
    // Thêm styles riêng
    css`
      button {
        background: var(--primary, #1a73e8);
        color: white;
        border: none;
      }
    `,
  ];
}
```

---

## CSS Custom Properties (Design Tokens)

Pattern phổ biến trong Chromium: define design tokens ở root, dùng trong components.

```css
/* Global CSS (document level) */
:root {
  /* Colors */
  --cr-primary-text-color: #202124;
  --cr-secondary-text-color: #5f6368;
  --cr-card-background-color: #fff;
  --cr-separator-color: rgba(0,0,0,.06);

  /* Typography */
  --cr-primary-font-size: 13px;
  --cr-body-font-family: 'Roboto', sans-serif;

  /* Spacing */
  --cr-section-padding: 20px;

  /* Elevation */
  --cr-card-shadow: 0 1px 2px rgba(0,0,0,.3);
}

/* Dark theme override */
.dark-theme {
  --cr-primary-text-color: #e8eaed;
  --cr-secondary-text-color: #9aa0a6;
  --cr-card-background-color: #292a2d;
}
```

```javascript
// Component dùng design tokens
class SettingsCard extends LitElement {
  static styles = css`
    :host {
      display: block;
      background: var(--cr-card-background-color);
      box-shadow: var(--cr-card-shadow);
      border-radius: 8px;
    }
    .title {
      color: var(--cr-primary-text-color);
      font-family: var(--cr-body-font-family);
      font-size: var(--cr-primary-font-size);
    }
    .subtitle {
      color: var(--cr-secondary-text-color);
    }
  `;
}
```

---

## `:host` Selectors

```javascript
static styles = css`
  /* Base host styles */
  :host {
    display: block;
    margin: 0;
    padding: 0;
  }

  /* When element has 'hidden' attribute */
  :host([hidden]) {
    display: none;
  }

  /* When element has 'disabled' attribute */
  :host([disabled]) {
    opacity: 0.38;
    pointer-events: none;
  }

  /* When inside a specific parent (context styling) */
  :host-context(.cr-dialog) {
    padding: 20px;
  }

  /* When focused (for keyboard navigation) */
  :host(:focus-within) {
    outline: 2px solid var(--cr-focus-color);
  }
`;
```

---

## `::slotted()` — Style slot content

```javascript
static styles = css`
  /* Style elements được slot vào */
  ::slotted(*) {
    display: block;
    margin: 0;
    padding: 8px 0;
  }

  /* Chỉ style p elements trong slot */
  ::slotted(p) {
    color: var(--cr-secondary-text-color);
    font-size: 12px;
  }

  /* Chỉ style first slotted element */
  ::slotted(:first-child) {
    padding-top: 0;
  }
`;
```

**Giới hạn:** `::slotted()` chỉ match **direct children** của slot, không phải descendants.

---

## `::part()` — Expose elements cho external styling

```javascript
class CrButton extends LitElement {
  render() {
    return html`
      <button part="button">   <!-- Expose 'button' part -->
        <span part="icon" class="icon"></span>
        <span part="label"><slot></slot></span>
      </button>
    `;
  }
}
```

```css
/* External CSS có thể style các parts -->
cr-button::part(button) {
  border-radius: 20px;
}

cr-button::part(label) {
  font-weight: bold;
}

/* State-based part styling */
cr-button:hover::part(button) {
  background: var(--hover-color);
}
```

---

## Focus Styles (Chromium convention)

Chromium có convention rõ ràng cho focus indicators:

```javascript
static styles = css`
  /* Ẩn default browser focus ring */
  :host(:focus) {
    outline: none;
  }

  /* Custom focus ring — chỉ khi keyboard navigation */
  :host(:focus-visible) {
    box-shadow: 0 0 0 2px var(--cr-focus-outline-color);
  }

  /* Internal focusable element */
  button:focus-visible {
    outline: 2px solid var(--cr-focus-outline-color);
    outline-offset: 2px;
  }
`;
```

---

## Responsive Styles trong WebUI

WebUI pages thường không cần responsive như web, nhưng vẫn có:

```javascript
static styles = css`
  .settings-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 16px;
  }

  /* Breakpoint cho wider panels */
  @media (min-width: 680px) {
    .settings-grid {
      grid-template-columns: 1fr 1fr;
    }
  }
`;
```

---

## Animation và Transition

```javascript
static styles = css`
  .panel {
    overflow: hidden;
    max-height: 0;
    transition: max-height 0.3s ease-out, opacity 0.3s ease-out;
    opacity: 0;
  }

  .panel.expanded {
    max-height: 500px;
    opacity: 1;
  }

  /* Respect user's motion preferences */
  @media (prefers-reduced-motion: reduce) {
    .panel {
      transition: none;
    }
  }
`;
```

---

## Pattern: Shared Styles Module

Trong Chromium, styles dùng chung được tách thành module:

```javascript
// shared_style.css.js (generated từ shared_style.css)
import {css} from 'lit';

export const sharedStyle = css`
  :host {
    --cr-primary-text-color: #202124;
  }

  .cr-title-text {
    font-size: 15px;
    font-weight: 500;
    color: var(--cr-primary-text-color);
  }
`;
```

```javascript
// Component dùng shared styles
import {sharedStyle} from './shared_style.css.js';

class MyComponent extends LitElement {
  static styles = [
    sharedStyle,
    css`
      /* Component-specific styles */
      :host { display: block; }
    `,
  ];
}
```

---

## Tổng quan Pattern trong Chromium WebUI

```javascript
class SettingsSection extends LitElement {
  static styles = [
    // 1. Shared styles (colors, typography, spacing tokens)
    sharedStyle,
    settingsSharedStyle,

    // 2. Component-specific
    css`
      :host {
        display: block;
        padding: var(--cr-section-padding);
      }

      :host([hidden]) {
        display: none;
      }

      .section-title {
        color: var(--cr-primary-text-color);
        font-family: var(--cr-body-font-family);
        font-size: 13px;
        font-weight: 500;
        margin-bottom: 8px;
      }

      .section-content {
        background: var(--cr-card-background-color);
        border-radius: 8px;
        box-shadow: var(--cr-card-shadow);
        overflow: hidden;
      }

      /* Separator between items */
      ::slotted(:not(:last-child)) {
        border-bottom: 1px solid var(--cr-separator-color);
      }
    `,
  ];

  render() {
    return html`
      <h2 class="section-title">${this.title}</h2>
      <div class="section-content">
        <slot></slot>
      </div>
    `;
  }
}
```

---

## Tóm tắt

| Feature | Dùng khi |
|---------|---------|
| `static styles = css\`\`` | Component-specific styles |
| `[BaseClass.styles, css\`\`]` | Kế thừa + extend styles |
| CSS custom properties | Design tokens, themeable values |
| `:host` | Style chính element |
| `:host([attr])` | State-based styles |
| `::slotted()` | Style slot content |
| `::part()` | Expose để external styling |

→ [Phase 5: Chromium WebUI Framework](../phase-5-chromium-webui/01-webui-overview.md)
