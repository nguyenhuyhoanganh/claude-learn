// Kiểm chứng các khẳng định trong README (mục 3 và 5) về cách element dùng lại,
// thay đổi property, event, style và lifecycle do mixin cung cấp.
import assert from 'node:assert/strict';
import {afterEach, test} from 'node:test';
import './setup-dom.js';

const {LitElement, html, css} = await import('lit');
const {PolymerElement, html: polymerHtml} =
  await import('@polymer/polymer/polymer-element.js');

afterEach(() => {
  document.body.replaceChildren();
});

let tagIndex = 0;
const tags = new Map();
function define(Class) {
  if (!tags.has(Class)) {
    const tag = `test-el-${++tagIndex}`;
    customElements.define(tag, Class);
    tags.set(Class, tag);
  }
  return tags.get(Class);
}

async function mountLit(Class) {
  const element = document.createElement(define(Class));
  document.body.append(element);
  await element.updateComplete;
  return element;
}

function mountPolymer(Class) {
  const element = document.createElement(define(Class));
  document.body.append(element);
  return element;
}

// ---------------------------------------------------------------- Polymer

const PolymerOpenableMixin = (BaseClass) => class extends BaseClass {
  static get properties() {
    return {
      opened: {
        type: Boolean,
        value: false,
        reflectToAttribute: true,
        notify: true,
        observer: 'openedChanged_',
      },
      items: {type: Array, value: () => []},
    };
  }

  static get observers() {
    return ['itemsChanged_(items.splices)'];
  }

  openedChanged_(opened) {
    (this.observerCalls ??= []).push(`mixin:${opened}`);
  }

  itemsChanged_(splices) {
    if (splices) this.spliceCount = (this.spliceCount ?? 0) + 1;
  }

  ready() {
    super.ready();
    this.mixinReady = true;
  }
};

test('Polymer: element khai báo lại value vẫn giữ reflect, notify, observer của mixin', () => {
  class ExpandedPanel extends PolymerOpenableMixin(PolymerElement) {
    static get properties() {
      return {opened: {value: true}};
    }
  }

  const tag = define(ExpandedPanel);
  const panel = document.createElement(tag);
  const events = [];
  panel.addEventListener('opened-changed', (e) => events.push(e.detail.value));
  document.body.append(panel);

  assert.equal(panel.opened, true);
  assert.equal(panel.hasAttribute('opened'), true);
  assert.deepEqual(events, [true]);
  assert.deepEqual(panel.observerCalls, ['mixin:true']);

  panel.opened = false;
  assert.equal(panel.hasAttribute('opened'), false);
  assert.deepEqual(events, [true, false]);
});

test('Polymer: element thêm observer riêng hoặc ghi đè observer của mixin', () => {
  class Tracking extends PolymerOpenableMixin(PolymerElement) {
    static get observers() {
      return ['trackOpened_(opened)'];
    }

    trackOpened_(opened) {
      (this.observerCalls ??= []).push(`element:${opened}`);
    }
  }

  const tracking = mountPolymer(Tracking);
  tracking.observerCalls = [];
  tracking.opened = true;
  assert.ok(tracking.observerCalls.includes('mixin:true'));
  assert.ok(tracking.observerCalls.includes('element:true'));

  class Override extends PolymerOpenableMixin(PolymerElement) {
    openedChanged_(opened) {
      (this.observerCalls ??= []).push(`override:${opened}`);
    }
  }

  const override = mountPolymer(Override);
  override.observerCalls = [];
  override.opened = true;
  assert.deepEqual(override.observerCalls, ['override:true'],
    'không gọi super thì observer của mixin không chạy');
});

test('Polymer: chỉ this.push() mới kích hoạt observer items.splices của mixin', () => {
  class List extends PolymerOpenableMixin(PolymerElement) {}
  const first = mountPolymer(List);
  const second = mountPolymer(List);

  assert.notEqual(first.items, second.items, 'value: () => [] tạo mảng riêng');

  first.items.push('a');
  assert.equal(first.spliceCount, undefined);

  first.push('items', 'b');
  assert.equal(first.spliceCount, 1);
});

test('Polymer: element quên super.ready() thì template và ready() của mixin không chạy', () => {
  const order = [];

  class Good extends PolymerOpenableMixin(PolymerElement) {
    static get template() {
      return polymerHtml`<span>[[opened]]</span>`;
    }

    ready() {
      order.push(`before:${Boolean(this.shadowRoot)}`);
      super.ready();
      order.push(`after:${Boolean(this.shadowRoot)}:${this.mixinReady}`);
    }
  }

  const good = mountPolymer(Good);
  assert.deepEqual(order, ['before:false', 'after:true:true']);
  assert.match(good.shadowRoot.textContent, /false/);

  class Broken extends PolymerOpenableMixin(PolymerElement) {
    static get template() {
      return polymerHtml`<span>[[opened]]</span>`;
    }

    ready() {}
  }

  const broken = mountPolymer(Broken);
  assert.equal(broken.shadowRoot, null);
  assert.equal(broken.mixinReady, undefined);
});

// ---------------------------------------------------------------- Lit

const openedProperty = {type: Boolean, reflect: true};

const LitOpenableMixin = (BaseClass) => class extends BaseClass {
  static properties = {
    opened: openedProperty,
    items: {type: Array},
  };

  constructor() {
    super();
    this.opened = false;
    this.items = [];
    this.renders = 0;
  }

  toggle() {
    this.opened = !this.opened;
    this.dispatchEvent(new CustomEvent('opened-changed', {
      detail: {value: this.opened},
    }));
  }

  addItem(item) {
    this.items = [...this.items, item];
  }

  updated(changedProperties) {
    super.updated?.(changedProperties);
    this.renders += 1;
    this.lastChanged = changedProperties;
  }
};

test('Lit: đổi default trong constructor chỉ render một lần', async () => {
  class Expanded extends LitOpenableMixin(LitElement) {
    constructor() {
      super();
      this.opened = true;
    }

    render() {
      return html`${this.opened}`;
    }
  }

  const panel = await mountLit(Expanded);
  assert.equal(panel.renders, 1);
  assert.equal(panel.shadowRoot.textContent.trim(), 'true');
  assert.equal(panel.hasAttribute('opened'), true);
});

test('Lit: class field che accessor của property mixin', async () => {
  class Wrong extends LitOpenableMixin(LitElement) {
    opened = true;

    render() {
      return html`${this.opened}`;
    }
  }

  const panel = await mountLit(Wrong);
  panel.opened = false;
  await panel.updateComplete;
  assert.equal(panel.shadowRoot.textContent.trim(), 'true', 'không re-render');
});

test('Lit: khai báo lại property thay thế toàn bộ option của mixin', async () => {
  class Partial extends LitOpenableMixin(LitElement) {
    static properties = {opened: {attribute: 'expanded'}};
  }

  const partial = await mountLit(Partial);
  partial.setAttribute('expanded', '');
  assert.equal(partial.opened, '', 'mất type: Boolean');

  class Full extends LitOpenableMixin(LitElement) {
    static properties = {opened: {...openedProperty, attribute: 'expanded'}};
  }

  const full = await mountLit(Full);
  full.setAttribute('expanded', '');
  assert.equal(full.opened, true);
  full.opened = false;
  await full.updateComplete;
  assert.equal(full.hasAttribute('expanded'), false);
  full.opened = true;
  await full.updateComplete;
  assert.equal(full.hasAttribute('expanded'), true, 'giữ reflect');
  assert.ok(Full.elementProperties.has('items'), 'property khác của mixin vẫn còn');
});

test('Lit: mutate mảng của mixin không gây update; dùng method của mixin', async () => {
  class List extends LitOpenableMixin(LitElement) {}
  const list = await mountLit(List);
  const other = await mountLit(List);
  assert.notEqual(list.items, other.items);

  list.items.push('a');
  await list.updateComplete;
  assert.equal(list.renders, 1);

  list.addItem('b');
  await list.updateComplete;
  assert.equal(list.renders, 2);

  list.items.push('c');
  list.requestUpdate('items');
  await list.updateComplete;
  assert.equal(list.renders, 3);
  assert.equal(list.lastChanged.get('items'), undefined, 'không có giá trị cũ');
});

test('Lit: element tự khai báo styles thay thế style của mixin', () => {
  const StyledMixin = (BaseClass) => class extends BaseClass {
    static styles = [BaseClass.styles ?? [], css`:host([opened]) { color: red; }`];
  };

  class Replaced extends StyledMixin(LitElement) {
    static styles = css`:host { display: block; }`;
  }
  define(Replaced);
  assert.equal(Replaced.elementStyles.length, 1);

  const Base = StyledMixin(LitElement);
  class Kept extends Base {
    static styles = [Base.styles, css`:host { display: block; }`];
  }
  define(Kept);
  assert.equal(Kept.elementStyles.length, 2);
});

test('Lit: override thiếu super làm mất event và lifecycle của mixin', async () => {
  class NoSuperToggle extends LitOpenableMixin(LitElement) {
    toggle() {
      this.opened = !this.opened;
    }
  }

  const panel = await mountLit(NoSuperToggle);
  let events = 0;
  panel.addEventListener('opened-changed', () => events++);
  panel.toggle();
  assert.equal(events, 0);

  class NoSuperUpdated extends LitOpenableMixin(LitElement) {
    updated() {}
  }

  const noUpdated = await mountLit(NoSuperUpdated);
  assert.equal(noUpdated.renders, 0, 'updated() của mixin không chạy');

  class NoSuperConnected extends LitOpenableMixin(LitElement) {
    connectedCallback() {}

    render() {
      return html`hi`;
    }
  }

  const noConnected = document.createElement(define(NoSuperConnected));
  document.body.append(noConnected);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(noConnected.renderRoot, undefined);
  assert.equal(noConnected.hasUpdated, false);
});

test('Lit: changedProperties chứa property của cả mixin lẫn element', async () => {
  class WithCount extends LitOpenableMixin(LitElement) {
    static properties = {count: {type: Number}};

    constructor() {
      super();
      this.count = 0;
    }
  }

  const panel = await mountLit(WithCount);
  assert.deepEqual([...panel.lastChanged.keys()].sort(), ['count', 'items', 'opened']);

  panel.count = 1;
  await panel.updateComplete;
  assert.deepEqual([...panel.lastChanged.keys()], ['count'],
    'updated() của mixin cũng thấy property của element');
});
