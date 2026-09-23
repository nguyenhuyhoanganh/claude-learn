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

