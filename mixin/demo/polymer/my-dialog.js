import {PolymerElement, html} from '@polymer/polymer/polymer-element.js';
import {OpenableMixin} from './openable-mixin.js';
import {dialogStyles} from './dialog-styles.js';

// 1.2. Element chỉ viết template; opened, open(), close(), toggle() đến từ
// OpenableMixin.
class MyDialog extends OpenableMixin(PolymerElement) {
  static get template() {
    return html`
      ${dialogStyles}

      <button on-click="toggle">Mở / đóng dialog</button>

      <div class="dialog" hidden$="[[!opened]]">
        <h4>Dialog</h4>
        <div class="actions">
          <button on-click="close">Đóng</button>
        </div>
      </div>
    `;
  }
}

customElements.define('my-dialog', MyDialog);
