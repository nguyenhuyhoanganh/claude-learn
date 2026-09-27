import {LitElement, html} from 'lit';
import {OpenableMixin} from './openable-mixin.js';
import {dialogStyles} from './dialog-styles.js';

// 2.2. Cùng dialog ở 1.2, viết bằng Lit.
export class LitDialog extends OpenableMixin(LitElement) {
  static styles = dialogStyles;

  render() {
    return html`
      <button @click=${this.toggle}>Mở / đóng dialog</button>

      <div class="dialog" ?hidden=${!this.opened}>
        <h4>Lit dialog</h4>
        <div class="actions">
          <button @click=${this.close}>Đóng</button>
        </div>
      </div>
    `;
  }
}

customElements.define('lit-dialog', LitDialog);
