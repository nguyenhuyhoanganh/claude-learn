import assert from 'node:assert/strict';
import {afterEach, test} from 'node:test';
import {Window} from 'happy-dom';

const window = new Window({url: 'http://localhost/'});

for (const name of [
  'window',
  'document',
  'Document',
  'DocumentFragment',
  'Node',
  'Element',
  'HTMLElement',
  'ShadowRoot',
  'CustomEvent',
  'Event',
  'EventTarget',
  'customElements',
  'navigator',
  'location',
  'MutationObserver',
  'CSSStyleSheet',
]) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: name === 'window' ? window : window[name],
  });
}

globalThis.JSCompiler_renameProperty = (property) => property;
window.JSCompiler_renameProperty = globalThis.JSCompiler_renameProperty;

const [{BasicPanel}, {PolymerPanel}, {LitPanel}] = await Promise.all([
  import('../demo/components/basic-panel.js'),
  import('../demo/components/polymer-panel.js'),
  import('../demo/components/lit-panel.js'),
]);

afterEach(() => {
  document.body.replaceChildren();
});

function collectLogs(element) {
  const logs = [];
  element.addEventListener('demo-log', (event) => logs.push(event.detail));
  return logs;
}

test('JavaScript mixin tạo đúng prototype chain và gọi super đúng thứ tự', () => {
  const panel = document.createElement('basic-panel');
  const logs = collectLogs(panel);
  document.body.append(panel);

  assert.ok(panel instanceof BasicPanel);
  assert.equal(panel.opened, false);
  assert.equal(panel.textContent, 'opened = false');

  panel.toggle();

  assert.equal(panel.opened, true);
  assert.equal(panel.textContent, 'opened = true');
  assert.deepEqual(logs, [
    '1. LoggingMixin: trước super',
    '2. OpenableMixin.toggle()',
    '3. LoggingMixin: sau super',
  ]);

  const constructors = [];
  let prototype = BasicPanel.prototype;
  while (prototype && prototype !== HTMLElement.prototype) {
    constructors.push(prototype.constructor.name);
    prototype = Object.getPrototypeOf(prototype);
  }

  assert.deepEqual(constructors, [
    'BasicPanel',
    'LoggingMixinImpl',
    'OpenableMixinImpl',
  ]);
});

test('Polymer mixin chạy property effects, event và lifecycle thật', async () => {
  const panel = document.createElement('polymer-panel');
  const logs = collectLogs(panel);
  const changes = [];
  const effects = [];

  panel.addEventListener('demo-log', (event) => {
    if (event.detail.startsWith('observer:')) {
      effects.push({
        type: 'observer',
        label: panel.label,
        reflected: panel.hasAttribute('opened'),
        rendered: panel.shadowRoot?.textContent.includes(`opened = ${panel.opened}`),
      });
    }
  });
  panel.addEventListener('opened-changed', (event) => {
    changes.push(event.detail.value);
    effects.push({type: 'notify', value: event.detail.value});
  });

  document.body.append(panel);
  await Promise.resolve();

  assert.ok(panel instanceof PolymerPanel);
  assert.equal(panel.opened, false);
  assert.equal(panel.label, 'Đang đóng');
  assert.equal(panel.hasAttribute('opened'), false);
  assert.match(panel.shadowRoot.textContent, /opened = false/);
  assert.match(panel.shadowRoot.textContent, /Đang đóng/);
  assert.equal(
    logs.filter((message) => message.startsWith('mixin.ready()')).length,
    1
  );
  assert.equal(
    logs.filter((message) => message === 'mixin.connectedCallback()').length,
    1
  );

  effects.length = 0;
  panel.toggle();
  await Promise.resolve();

  assert.equal(panel.opened, true);
  assert.equal(panel.label, 'Đang mở');
  assert.equal(panel.hasAttribute('opened'), true);
  assert.match(panel.shadowRoot.textContent, /opened = true/);
  assert.match(panel.shadowRoot.textContent, /Đang mở/);
  assert.deepEqual(changes, [false, true]);
  assert.ok(logs.includes('observer: undefined → false'));
  assert.ok(logs.includes('observer: false → true'));
  assert.deepEqual(effects, [
    {
      type: 'observer',
      label: 'Đang mở',
      reflected: true,
      rendered: true,
    },
    {type: 'notify', value: true},
  ]);

  panel.remove();
  document.body.append(panel);
  await Promise.resolve();

  assert.equal(
    logs.filter((message) => message.startsWith('mixin.ready()')).length,
    1,
    'ready() không chạy lại khi element được gắn lại'
  );
  assert.equal(
    logs.filter((message) => message === 'mixin.connectedCallback()').length,
    2,
    'connectedCallback() chạy lại khi element được gắn lại'
  );
  assert.equal(
    logs.filter((message) => message === 'mixin.disconnectedCallback()').length,
    1
  );
});

test('Lit mixin và ReactiveController chạy đúng quanh update cycle', async () => {
  const panel = document.createElement('lit-panel');
  const logs = collectLogs(panel);

  document.body.append(panel);
  await panel.updateComplete;

  assert.ok(panel instanceof LitPanel);
  assert.equal(panel.opened, false);
  assert.equal(panel.counter.value, 0);
  assert.equal(panel.hasAttribute('opened'), false);
  assert.match(panel.shadowRoot.textContent, /Mixin: opened = false/);
  assert.match(panel.shadowRoot.textContent, /Controller: count = 0/);
  assert.equal(
    logs.filter((message) => message.startsWith('mixin.firstUpdated()')).length,
    1
  );
  assert.deepEqual(logs, [
    'controller.hostConnected()',
    'mixin.connectedCallback()',
    'controller.hostUpdate() — trước render',
    'controller.hostUpdated() — sau render',
    'mixin.firstUpdated() — DOM đã render lần đầu',
    'mixin.updated(): opened = false',
  ]);

  const firstHostUpdate = logs.indexOf('controller.hostUpdate() — trước render');
  const firstHostUpdated = logs.indexOf('controller.hostUpdated() — sau render');
  assert.ok(firstHostUpdate !== -1 && firstHostUpdated !== -1);
  assert.ok(firstHostUpdate < firstHostUpdated);

  logs.length = 0;
  panel.toggle();
  await panel.updateComplete;

  assert.equal(panel.opened, true);
  assert.equal(panel.hasAttribute('opened'), true);
  assert.match(panel.shadowRoot.textContent, /Mixin: opened = true/);
  assert.deepEqual(logs, [
    'controller.hostUpdate() — trước render',
    'controller.hostUpdated() — sau render',
    'mixin.updated(): opened = true',
  ]);

  logs.length = 0;
  panel.counter.increment();
  await panel.updateComplete;

  assert.equal(panel.counter.value, 1);
  assert.match(panel.shadowRoot.textContent, /Controller: count = 1/);
  assert.deepEqual(logs, [
    'controller.hostUpdate() — trước render',
    'controller.hostUpdated() — sau render',
  ]);

  panel.remove();
  assert.deepEqual(logs.slice(-2), [
    'controller.hostDisconnected()',
    'mixin.disconnectedCallback()',
  ]);

  document.body.append(panel);
  await panel.updateComplete;
  assert.equal(
    logs.filter((message) => message.startsWith('mixin.firstUpdated()')).length,
    0,
    'firstUpdated() không chạy lại khi element được gắn lại'
  );
  assert.deepEqual(logs.slice(-2), [
    'controller.hostConnected()',
    'mixin.connectedCallback()',
  ]);
});
