// Kiểm chứng các khẳng định trong README (mục 7) về cách element tận dụng
// state, cấu hình, event, style và lifecycle do ReactiveController cung cấp.
import assert from 'node:assert/strict';
import {afterEach, test} from 'node:test';
import './setup-dom.js';

const {LitElement, html, css} = await import('lit');

afterEach(() => {
  document.body.replaceChildren();
});

let tagIndex = 0;
function append(Class) {
  const tag = `ctrl-el-${++tagIndex}`;
  customElements.define(tag, Class);
  const element = document.createElement(tag);
  document.body.append(element);
  return element;
}

async function mount(Class) {
  const element = append(Class);
  await element.updateComplete;
  return element;
}

class ToggleController {
  constructor(host, {opened = false, attribute = 'opened', onChange} = {}) {
    this.host = host;
    this._opened = opened;
    this.attribute = attribute;
    this.onChange = onChange;
    this.items = [];
    host.addController(this);
  }

  get opened() {
    return this._opened;
  }

  set opened(value) {
    const old = this._opened;
    if (value === old) return;
    this._opened = value;
    // Truyền tên + giá trị cũ để host thấy key trong changedProperties.
    this.host.requestUpdate('toggle.opened', old);
    this.onChange?.(value);
    this.host.dispatchEvent(new CustomEvent('opened-changed', {
      detail: {value},
    }));
  }

  toggle() {
    this.opened = !this.opened;
  }

  addItem(item) {
    this.items = [...this.items, item];
    this.host.requestUpdate();
  }

  hostConnected() {
    this.connected = true;
  }

  hostUpdated() {
    // Phản chiếu trạng thái thành attribute để CSS của host dùng được.
    this.host.toggleAttribute(this.attribute, this._opened);
  }

  hostDisconnected() {
    this.connected = false;
  }
}

test('Controller: cấu hình qua constructor, host đọc state trong render', async () => {
  class Panel extends LitElement {
    toggle = new ToggleController(this, {opened: true});

    render() {
      return html`${this.toggle.opened}`;
    }
  }

  const panel = await mount(Panel);
  assert.equal(panel.shadowRoot.textContent.trim(), 'true');
  assert.equal(panel.hasAttribute('opened'), true);

  panel.toggle.toggle();
  await panel.updateComplete;
  assert.equal(panel.shadowRoot.textContent.trim(), 'false');
  assert.equal(panel.hasAttribute('opened'), false);
});

test('Controller: requestUpdate(name, old) đưa key vào changedProperties của host', async () => {
  class Panel extends LitElement {
    toggle = new ToggleController(this);

    updated(changedProperties) {
      this.changed = new Map(changedProperties);
    }
  }

  const panel = await mount(Panel);
  panel.toggle.opened = true;
  await panel.updateComplete;
  assert.equal(panel.changed.has('toggle.opened'), true);
  assert.equal(panel.changed.get('toggle.opened'), false);
});

test('Controller: mảng đổi tham chiếu + requestUpdate; mutate thì không render', async () => {
  class Panel extends LitElement {
    toggle = new ToggleController(this);

    render() {
      return html`${this.toggle.items.length}`;
    }
  }

  const panel = await mount(Panel);
  panel.toggle.items.push('a');
  await panel.updateComplete;
  assert.equal(panel.shadowRoot.textContent.trim(), '0');

  panel.toggle.addItem('b');
  await panel.updateComplete;
  assert.equal(panel.shadowRoot.textContent.trim(), '2');
});

test('Controller: báo thay đổi qua callback và event trên host', async () => {
  const calls = [];

  class Panel extends LitElement {
    toggle = new ToggleController(this, {
      onChange: (value) => calls.push(value),
    });
  }

  const panel = await mount(Panel);
  const events = [];
  panel.addEventListener('opened-changed', (e) => events.push(e.detail.value));
  panel.toggle.toggle();
  assert.deepEqual(calls, [true]);
  assert.deepEqual(events, [true]);
});

test('Controller: không thêm được styles; host tự đưa CSSResult vào', async () => {
  const toggleStyles = css`:host([opened]) { font-weight: bold; }`;

  class Panel extends LitElement {
    static styles = [toggleStyles, css`:host { display: block; }`];
    toggle = new ToggleController(this);
  }

  await mount(Panel);
  assert.equal(Panel.elementStyles.length, 2);
});

test('Controller: public API của element chỉ chuyển lời gọi vào controller', async () => {
  class Panel extends LitElement {
    #toggle = new ToggleController(this);

    get opened() {
      return this.#toggle.opened;
    }

    toggle() {
      this.#toggle.toggle();
    }
  }

  const panel = await mount(Panel);
  panel.toggle();
  assert.equal(panel.opened, true);
});

test('Controller: element quên super.connectedCallback/disconnectedCallback thì controller không nhận lifecycle', async () => {
  class NoSuperConnect extends LitElement {
    toggle = new ToggleController(this);

    connectedCallback() {}
  }

  // Không await updateComplete: thiếu super thì Lit không bao giờ update.
  const a = append(NoSuperConnect);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(a.toggle.connected, undefined);
  assert.equal(a.hasUpdated, false);

  class NoSuperDisconnect extends LitElement {
    toggle = new ToggleController(this);

    disconnectedCallback() {}
  }

  const b = await mount(NoSuperDisconnect);
  assert.equal(b.toggle.connected, true);
  b.remove();
  assert.equal(b.toggle.connected, true, 'hostDisconnected() không chạy');
});

test('Controller: hook chạy theo thứ tự addController; hostUpdate sau willUpdate', async () => {
  const order = [];

  class Probe {
    constructor(host, name) {
      this.name = name;
      host.addController(this);
    }

    hostUpdate() {
      order.push(`${this.name}.hostUpdate`);
    }

    hostUpdated() {
      order.push(`${this.name}.hostUpdated`);
    }
  }

  class Panel extends LitElement {
    first = new Probe(this, 'first');
    second = new Probe(this, 'second');

    willUpdate() {
      order.push('host.willUpdate');
    }

    render() {
      order.push('host.render');
      return html``;
    }

    updated() {
      order.push('host.updated');
    }
  }

  await mount(Panel);
  assert.deepEqual(order, [
    'host.willUpdate',
    'first.hostUpdate',
    'second.hostUpdate',
    'host.render',
    'first.hostUpdated',
    'second.hostUpdated',
    'host.updated',
  ]);
});
