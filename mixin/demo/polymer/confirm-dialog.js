import {PolymerElement, html} from '@polymer/polymer/polymer-element.js';
import {OpenableMixin} from './openable-mixin.js';
import {EscapeCloseMixin} from '../shared/escape-close-mixin.js';
import {dialogStyles} from './dialog-styles.js';

// 1.5. Tùy biến phần kế thừa từ OpenableMixin và EscapeCloseMixin.
class ConfirmDialog extends EscapeCloseMixin(OpenableMixin(PolymerElement)) {
  static get properties() {
    return {
      // 1.5.1. Khai báo lại opened với default value mới. Giữ type;
      // reflectToAttribute và notify của mixin vẫn còn hiệu lực.
      opened: {type: Boolean, value: true},
      openCount: {
        type: Number,
        value: 0,
      },
    };
  }

  // 1.5.2. Theo dõi property khai báo trong OpenableMixin.
  static get observers() {
    return ['countOpen_(opened)'];
  }

  countOpen_(opened) {
    if (opened) this.openCount += 1;
  }

  // 1.5.3. Mở rộng method của mixin.
  open() {
    super.open();
    this.confirmButton.focus();
  }

  // 1.5.4. ready() là lúc đầu tiên đọc được local DOM.
  ready() {
    super.ready();
    this.confirmButton = this.$.confirm;
  }

  static get template() {
    return html`
      ${dialogStyles}
      <style>
        /* 1.5.3. Làm rõ nút đang được focus sau khi open(). */
        #confirm:focus {
          outline: 3px solid #f59e0b;
          outline-offset: 2px;
          background: #fef3c7;
        }
      </style>

      <button on-click="toggle">Mở / đóng dialog</button>

      <div class="dialog" hidden$="[[!opened]]">
        <h4>Lưu thay đổi?</h4>
        <div class="actions">
          <button id="confirm" on-click="close">Lưu</button>
          <button on-click="close">Hủy</button>
        </div>
      </div>

      <p>openCount = <b>[[openCount]]</b></p>
    `;
  }
}

customElements.define('confirm-dialog', ConfirmDialog);
