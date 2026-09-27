// Polymer mixin (mục 1)
import './polymer/my-dialog.js';
import './polymer/escape-dialog.js';
import './polymer/modal-dialog.js';
import './polymer/confirm-dialog.js';

// Lit mixin (mục 2)
import './lit/lit-dialog.js';
import './lit/expanded-dialog.js';
import './lit/wrong-dialog.js';
import './lit/escape-lit-dialog.js';

// Reactive Controller (mục 3)
import './controllers/ctrl-dialog.js';
import './controllers/private-ctrl-dialog.js';
import './controllers/two-dialogs.js';
import './controllers/auto-close-dialog.js';

import {writeLog} from './shared/log.js';

// Event opened-changed của Lit bubble lên document.
document.addEventListener('opened-changed', (event) => {
  writeLog(event.target, `event opened-changed: ${event.detail.value}`);
});

// Nút xóa log.
for (const button of document.querySelectorAll('[data-clear-log]')) {
  button.addEventListener('click', () => {
    document.querySelector(
      `[data-log-for="${button.dataset.clearLog}"]`
    ).textContent = '';
  });
}

// Nút gỡ / gắn lại element để gọi disconnectedCallback / connectedCallback.
for (const button of document.querySelectorAll('[data-remount]')) {
  const element = document.getElementById(button.dataset.remount);
  const placeholder = document.createComment(element.localName);

  button.addEventListener('click', () => {
    if (element.isConnected) {
      element.replaceWith(placeholder);
      button.textContent = 'Gắn lại vào DOM';
    } else {
      placeholder.replaceWith(element);
      button.textContent = 'Gỡ khỏi DOM';
    }
  });
}

// Hiện tag và attribute hiện tại của element, để thấy reflect attribute.
for (const element of document.querySelectorAll('[data-show-attrs]')) {
  const output = document.createElement('code');
  output.className = 'attrs';
  element.after(output);

  const render = () => {
    const attrs = [...element.attributes]
      .filter(({name}) => name !== 'data-show-attrs')
      .map(({name, value}) => (value === '' ? name : `${name}="${value}"`));
    output.textContent = `<${[element.localName, ...attrs].join(' ')}>`;
  };

  new MutationObserver(render).observe(element, {attributes: true});
  render();
}
