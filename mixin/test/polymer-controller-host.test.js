// Kiểm chứng ControllerHostMixin: dùng ReactiveController của Lit trong Polymer.
import assert from 'node:assert/strict';
import {afterEach, test} from 'node:test';
import './setup-dom.js';

const {PolymerElement} = await import('@polymer/polymer/polymer-element.js');
const {LitElement} = await import('lit');
const {ControllerHostMixin} =
  await import('../demo/mixins/polymer-controller-host-mixin.js');
const {PolymerClock} = await import('../demo/components/polymer-clock.js');

afterEach(() => {
  document.body.replaceChildren();
});

test('PolymerElement không có API của ReactiveControllerHost', () => {
  assert.equal('addController' in PolymerElement.prototype, false);
  assert.equal('requestUpdate' in PolymerElement.prototype, false);
  assert.equal('addController' in LitElement.prototype, true);
});

test('Chuỗi kế thừa của PolymerElement được ghép từ các mixin', () => {
  const names = [];
  let current = PolymerElement;
  while (current && current !== HTMLElement) {
    names.push(current.name);
    current = Object.getPrototypeOf(current);
  }
  assert.deepEqual(names, [
    'PolymerElement',
    'PropertiesMixin',
    'PropertyEffects',
    'TemplateStamp',
    'PropertyAccessors',
    'PropertiesChanged',
  ]);
});

test('ControllerHostMixin gọi lifecycle của controller như Lit', async () => {
  const order = [];

  class Probe {
    constructor(host) {
      this.host = host;
      this.value = 0;
      host.addController(this);
    }

    hostConnected() {
      order.push(`hostConnected:shadowRoot=${Boolean(this.host.shadowRoot)}`);
    }

    hostUpdate() {
      order.push('hostUpdate');
    }

    hostUpdated() {
      order.push(`hostUpdated:${this.host.shadowRoot.textContent}`);
    }

    hostDisconnected() {
      order.push('hostDisconnected');
    }

    increment() {
      this.value += 1;
      this.host.requestUpdate();
    }
  }

  const {html} = await import('@polymer/polymer/polymer-element.js');

  class Host extends ControllerHostMixin(PolymerElement) {
    static get template() {
      return html`[[text_(_hostRevision)]]`;
    }

    constructor() {
      super();
      this.probe = new Probe(this);
    }

    text_() {
      return `value=${this.probe.value}`;
    }
  }
  customElements.define('controller-host-test', Host);

  const host = document.createElement('controller-host-test');
  document.body.append(host);
  await host.updateComplete;

  assert.deepEqual(order, [
    'hostConnected:shadowRoot=true',
    'hostUpdate',
    'hostUpdated:value=0',
  ]);

  order.length = 0;
  host.probe.increment();
  host.probe.increment();
  assert.equal(host.shadowRoot.textContent, 'value=0', 'chưa cập nhật đồng bộ');
  await host.updateComplete;
  assert.deepEqual(order, ['hostUpdate', 'hostUpdated:value=2'],
    'hai lần requestUpdate được gom thành một lần update');

  order.length = 0;
  host.remove();
  assert.deepEqual(order, ['hostDisconnected']);

  const late = {connected: 0, hostConnected() { this.connected += 1; }};
  document.body.append(host);
  host.addController(late);
  assert.equal(late.connected, 1, 'addController khi đã connected gọi hostConnected ngay');
});

test('PolymerClock dùng lại ClockController và dọn timer khi bị gỡ', async () => {
  const clock = document.createElement('polymer-clock');
  document.body.append(clock);
  await clock.updateComplete;

  assert.ok(clock instanceof PolymerClock);
  assert.notEqual(clock.clock.timerId, undefined);
  assert.match(clock.shadowRoot.textContent, /Polymer \+ ClockController: \d/);

  clock.remove();
  assert.equal(clock.clock.timerId, undefined);
});
