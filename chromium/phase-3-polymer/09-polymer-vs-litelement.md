# Bài 9: Polymer vs LitElement — so sánh và migration path

Bài tổng kết phase Polymer. Câu hỏi quan trọng: **Nếu Polymer ổn vậy, sao Chromium migrate sang LitElement?** Hiểu được câu trả lời = hiểu được hướng đi của codebase Chromium 5 năm tới = biết viết code "đúng style".

## Cùng một component, 2 cách viết

Để thấy rõ khác biệt, viết cùng `<my-counter>` bằng cả 2.

### Polymer 3

```javascript
import {PolymerElement, html} from '@polymer/polymer/polymer-element.js';

class MyCounter extends PolymerElement {
  static get is() { return 'my-counter'; }
  
  static get template() {
    return html`
      <style>
        :host { display: inline-flex; gap: 8px; }
        button { padding: 4px 12px; }
      </style>
      <button on-click="decrement_">−</button>
      <span>[[count]]</span>
      <button on-click="increment_">+</button>
    `;
  }
  
  static get properties() {
    return {
      count: {
        type: Number,
        value: 0,
        notify: true,
      },
      step: {
        type: Number,
        value: 1,
      },
    };
  }
  
  increment_() { this.count += this.step; }
  decrement_() { this.count -= this.step; }
}

customElements.define(MyCounter.is, MyCounter);
```

### LitElement 3

```typescript
import {LitElement, html, css} from 'lit';
import {customElement, property} from 'lit/decorators.js';

@customElement('my-counter')
class MyCounter extends LitElement {
  static styles = css`
    :host { display: inline-flex; gap: 8px; }
    button { padding: 4px 12px; }
  `;
  
  @property({type: Number}) count = 0;
  @property({type: Number}) step = 1;
  
  render() {
    return html`
      <button @click=${this._decrement}>−</button>
      <span>${this.count}</span>
      <button @click=${this._increment}>+</button>
    `;
  }
  
  private _increment() {
    this.count += this.step;
    this.dispatchEvent(new CustomEvent('count-changed', {detail: {value: this.count}}));
  }
  
  private _decrement() {
    this.count -= this.step;
    this.dispatchEvent(new CustomEvent('count-changed', {detail: {value: this.count}}));
  }
}
```

## Khác biệt chính

| | Polymer 3 | LitElement |
|---|---|---|
| Class field syntax | Static getter | Static field / decorator |
| Property declaration | `static get properties()` | `@property` decorator hoặc `static properties` |
| Template syntax | `[[prop]]` | `${this.prop}` |
| Attribute binding | `attr$="[[prop]]"` | `attr="${this.prop}"` |
| Property binding | `prop="[[val]]"` | `.prop=${this.val}` |
| Event binding | `on-click="method_"` | `@click=${this._method}` |
| Boolean attribute | `disabled$="[[isDisabled]]"` | `?disabled=${this.isDisabled}` |
| **Two-way binding** | `{{prop}}` | **KHÔNG có** (manual) |
| Conditional | `<template is="dom-if">` | `${cond ? html`...` : ''}` |
| List | `<template is="dom-repeat">` | `${arr.map(i => html`...`)}` |
| Expression in template | KHÔNG (chỉ value) | **CÓ** (full JS expression) |
| Computed property | `computed: 'method_(...)'` | Getter property |
| Observers | `observer:` / `observers` | `updated()` callback |
| Code share | Mixins | Mixins / function utilities |
| TypeScript native | Có (với typings) | Có (decorator-first) |
| Bundle size | ~30 KB | ~5-7 KB |
| Template caching | Yes | Yes (lit-html, better) |
| Update performance | Tốt | Tốt hơn |
| Native browser feel | Cao | Cao (same Web Components base) |

## Khác biệt sâu — không chỉ syntax

### 1. Reactivity model

**Polymer**: setter-based + observer system.

```javascript
this.count = 5;
// Polymer setter detect change, fire observer, fire bindings.
```

**LitElement**: queued re-render.

```typescript
this.count = 5;
// Lit schedule full render() at next microtask
// → re-evaluate entire template, smart-diff DOM
```

Polymer update **chính xác từng binding**. Lit re-evaluate template + diff. Trong thực tế, lit-html diffing rất hiệu quả → tương đương hoặc nhanh hơn Polymer cho hầu hết case.

### 2. Template — declarative vs JavaScript

**Polymer**: declarative — template chỉ là string với `[[...]]` placeholders.

```html
<div class$="card [[type]]">  <!-- không expression -->
<p hidden$="[[!isVisible]]">  <!-- KHÔNG WORK (no `!`) -->
```

**LitElement**: JavaScript-native expression.

```typescript
html`
  <div class="card ${this.type}">
  <p ?hidden=${!this.isVisible}>
`
```

→ Lit linh hoạt hơn, Polymer "cleaner" (force tách logic ra computed).

### 3. Two-way binding

**Polymer**: built-in `{{}}` syntax.

```html
<my-input value="{{name}}"></my-input>
```

**Lit**: không có. Manual event listening.

```typescript
html`
  <my-input 
    .value=${this.name}
    @value-changed=${(e) => this.name = e.detail.value}>
  </my-input>
`
```

→ Polymer concise, Lit verbose nhưng explicit. Đa số tranh cãi rằng two-way làm code khó hiểu → Lit team cố ý bỏ.

### 4. Type safety

**Polymer**: property types là runtime hint (`type: String` để convert attribute).

**Lit**: TypeScript decorators native.

```typescript
@property({type: String}) name: string = '';
// TypeScript compile-time check
```

Polymer 3 cũng work với TypeScript nhưng less ergonomic.

## Vì sao Chromium migrate?

5 lý do chính:

### 1. Bundle size

Polymer ~30KB, LitElement ~5-7KB. Chromium WebUI có ~20 page → bundle size matter.

### 2. Update performance

Lit-html smart diff cực hiệu quả. Polymer setter-based có overhead với deep object changes.

### 3. JavaScript expression in template

Code linh hoạt hơn. Computed property cho mọi conditional/calculation là verbose.

### 4. Two-way binding gây bug

Implicit data flow khó debug. "Why is my parent property changing?" → trace qua nhiều layer.

### 5. Maintainability + community

Lit có active development. Polymer ở maintenance mode (security only).

## Migration path — Chromium thực tế

Migration không phải "rewrite all" overnight. Chromium làm step by step:

### Phase 1 — Coexistence (đang diễn ra)

Polymer 3 và LitElement chạy song song trong cùng app:

```javascript
// Polymer component dùng LitElement child
class SettingsPage extends PolymerElement {  // Polymer
  static get template() {
    return html`
      <new-feature-component></new-feature-component>  <!-- LitElement -->
    `;
  }
}

// LitElement component
class NewFeatureComponent extends LitElement {  // LitElement
  render() {
    return html`<div>New feature</div>`;
  }
}
```

→ Work because **cả 2 đều là Web Components standard**.

### Phase 2 — Convert leaf components first

Đổi component **không có children** trước:

```text
Đã convert:
   <my-icon-button>
   <my-progress-bar>
   <my-tooltip>
   ...

Chưa convert:
   <settings-main>
     <settings-section>
       <settings-toggle>
       (mixed Polymer + LitElement children OK)
```

### Phase 3 — Convert page-level components

Khi tất cả children đã LitElement, convert root.

### Phase 4 — Drop Polymer dependency

Loại Polymer khỏi build entirely.

→ Chromium đang ở **Phase 1-2** (2024-2026). Samsung Browser fork → catch up theo upstream.

## Migrate 1 component — practical example

Component Polymer:

```javascript
class TodoItem extends PolymerElement {
  static get is() { return 'todo-item'; }
  
  static get template() {
    return html`
      <style>
        :host { display: flex; padding: 8px; }
        :host([completed]) { opacity: 0.5; }
      </style>
      <input 
          type="checkbox" 
          checked="{{completed}}"
          on-change="onCheckboxChange_">
      <span class$="text [[textClass_]]">[[text]]</span>
      <button on-click="onDelete_">Delete</button>
    `;
  }
  
  static get properties() {
    return {
      text: String,
      completed: {
        type: Boolean,
        value: false,
        reflectToAttribute: true,
        notify: true,
      },
      textClass_: {
        type: String,
        computed: 'computeTextClass_(completed)',
      },
    };
  }
  
  computeTextClass_(completed) {
    return completed ? 'strikethrough' : '';
  }
  
  onCheckboxChange_(e) {
    this.completed = e.target.checked;
  }
  
  onDelete_() {
    this.dispatchEvent(new CustomEvent('delete', {
      detail: {id: this.id},
      bubbles: true,
      composed: true,
    }));
  }
}

customElements.define(TodoItem.is, TodoItem);
```

Convert sang LitElement:

```typescript
import {LitElement, html, css} from 'lit';
import {customElement, property} from 'lit/decorators.js';

@customElement('todo-item')
class TodoItem extends LitElement {
  static styles = css`
    :host { display: flex; padding: 8px; }
    :host([completed]) { opacity: 0.5; }
    .strikethrough { text-decoration: line-through; }
  `;
  
  @property({type: String}) text = '';
  @property({type: Boolean, reflect: true}) completed = false;
  
  render() {
    return html`
      <input 
          type="checkbox" 
          .checked=${this.completed}
          @change=${this._onCheckboxChange}>
      <span class="text ${this.completed ? 'strikethrough' : ''}">
        ${this.text}
      </span>
      <button @click=${this._onDelete}>Delete</button>
    `;
  }
  
  private _onCheckboxChange(e: Event) {
    this.completed = (e.target as HTMLInputElement).checked;
    this.dispatchEvent(new CustomEvent('completed-changed', {
      detail: {value: this.completed},
      bubbles: true,
      composed: true,
    }));
  }
  
  private _onDelete() {
    this.dispatchEvent(new CustomEvent('delete', {
      detail: {id: this.id},
      bubbles: true,
      composed: true,
    }));
  }
}
```

Changes:
1. `[[...]]` → `${this....}`.
2. `on-click="method_"` → `@click=${this._method}`.
3. `class$="..."` → `class="..."` với JS expression.
4. `static get properties()` → `@property` decorators.
5. Bỏ `computed` (textClass_) → inline expression trong template.
6. `notify: true` → manual `dispatchEvent('completed-changed', ...)`.
7. `{{completed}}` (two-way) → caller phải `@completed-changed=${...}` thủ công.

### Caller — cũng phải đổi

Polymer caller:
```html
<todo-item 
    text="[[item.text]]" 
    completed="{{item.completed}}">
</todo-item>
```

LitElement caller (verbose hơn):
```html
<todo-item 
    .text=${item.text}
    .completed=${item.completed}
    @completed-changed=${(e) => this._onItemCompleted(item.id, e.detail.value)}>
</todo-item>
```

→ Two-way thành 2 explicit lines. Verbose nhưng explicit.

## Strategy cho Samsung Browser dev

Khi làm việc với Samsung Browser code:

### Khi nào dùng Polymer?

- **Sửa bug** trong code Polymer cũ → giữ Polymer.
- **Thêm feature** vào component Polymer → giữ Polymer.
- **Component dùng cr-* Polymer version** → Polymer.
- **Code legacy** với mixin Polymer-based → Polymer.

### Khi nào dùng LitElement?

- **Component hoàn toàn mới**, không phụ thuộc Polymer code → LitElement.
- **Upstream Chromium đã LitElement version** → follow upstream.
- **Refactor scope đủ lớn** (>500 dòng) → cân nhắc migrate.

### Quy tắc thực dụng

> **Đừng mix Polymer và LitElement trong cùng component**. Chọn 1.

```javascript
// SAI - inheritance mix
class MyComp extends LitElement {
  // dùng Polymer mixin
  static get template() { ... }  // ← Polymer syntax
}

// ĐÚNG - 1 framework per component
class MyComp extends PolymerElement { ... }
// HOẶC
class MyComp extends LitElement { ... }
```

Trong cùng **page** thì mix OK (component này Polymer, component khác Lit).

## Tools để migrate

### `lit-element-polymer-codemod` (Google internal)

Tool auto convert Polymer → Lit. Không phải cho public. Trong Chromium internal, có scripts cho migration mass.

### Manual conversion

Đa số chromium devs migrate **manually** với checklist:

```text
□ Template: [[...]] → ${this...}
□ Events: on-click → @click với this prefix
□ Properties: static get properties() → @property
□ Computed: → inline expression hoặc getter
□ Observers: → updated() callback
□ Two-way binding: → explicit event handlers
□ Conditional: dom-if → ternary
□ List: dom-repeat → .map()
□ Mixin: dedupingMixin pattern không đổi nhiều
□ Tests: update test API
```

## Khi nào KHÔNG migrate?

- Component được sử dụng bởi nhiều page **vẫn dùng Polymer** → keep.
- Code generation tự động (vd Mojo bindings).
- Component đã stable, không có bugs, không thêm features.

> "If it ain't broke, don't migrate." — chỉ migrate khi có lý do cụ thể.

## Memory + cleanup — pattern khác nhau

Polymer:
```javascript
ready() {
  super.ready();
  document.addEventListener('keydown', this._handler);
}

disconnectedCallback() {
  super.disconnectedCallback();
  document.removeEventListener('keydown', this._handler);
}
```

LitElement:
```typescript
private _abortController?: AbortController;

connectedCallback() {
  super.connectedCallback();
  this._abortController = new AbortController();
  document.addEventListener('keydown', this._handler, {
    signal: this._abortController.signal,
  });
}

disconnectedCallback() {
  super.disconnectedCallback();
  this._abortController?.abort();  // Tự cleanup tất cả listeners
}
```

→ LitElement pattern modern hơn — dùng AbortController.

## Tóm tắt bài 9 + Phase 3

### Bảng so sánh tổng

| Feature | Polymer | LitElement |
|---|---|---|
| Bundle | 30 KB | 5-7 KB |
| Two-way binding | ✓ | ✗ |
| Expression in template | ✗ | ✓ |
| Computed property declarative | ✓ | Getter only |
| TypeScript decorators | △ | ✓ |
| Mature ecosystem | ✓ | Growing |
| Active development | Maintenance | Active |
| Chromium future | Migrating away | Future |

### Polymer phase recap

- **Bài 1**: Polymer là gì, lịch sử, vì sao Chromium chọn.
- **Bài 2**: PolymerElement class — template, properties, lifecycle.
- **Bài 3**: Data binding — `[[]]` vs `{{}}`, attribute vs property.
- **Bài 4**: Properties — type, value, notify, observer, computed, readOnly, reflect.
- **Bài 5**: Templates — dom-repeat, dom-if, dom-bind.
- **Bài 6**: Events — custom events, gestures, dispatch/listen.
- **Bài 7**: Mixins (Polymer 3) vs Behaviors (Polymer 1).
- **Bài 8**: iron-*, paper-*, cr-* element libraries.
- **Bài 9**: So sánh Polymer vs LitElement + migration.

→ Bạn giờ có đầy đủ kiến thức để **đọc, hiểu, viết, sửa** code Polymer trong Chromium.

**Bài kế tiếp** → [Phase 4 — LitElement](../phase-4-litelement/01-litelement-basics.md)

Hoặc nếu đã muốn vào Chromium WebUI ngay → [Phase 5 — Chromium WebUI](../phase-5-chromium-webui/01-webui-overview.md)
