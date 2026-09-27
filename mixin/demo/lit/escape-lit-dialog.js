import {LitElement, html, css} from 'lit';
import {OpenableMixin} from './openable-mixin.js';
import {DialogStyleMixin} from './dialog-style-mixin.js';
import {EscapeCloseMixin} from '../shared/escape-close-mixin.js';

// 2.4. EscapeCloseMixin ở 1.3 dùng lại nguyên vẹn cho Lit.
const DialogBase = EscapeCloseMixin(DialogStyleMixin(OpenableMixin(LitElement)));

class EscapeLitDialog extends DialogBase {
  // Giữ style của base class rồi thêm style riêng.
  static styles = [
    DialogBase.styles,
    css`
      .dialog {
        border-color: #7c3aed;
      }
    `,
  ];

  render() {
    return html`
      <button @click=${this.toggle}>Mở / đóng dialog</button>

      <div class="dialog" ?hidden=${!this.opened}>
        <h4>Nhấn Esc để đóng</h4>
        <div class="actions">
          <button @click=${this.close}>Đóng</button>
        </div>
      </div>
    `;
  }
}

customElements.define('escape-lit-dialog', EscapeLitDialog);
