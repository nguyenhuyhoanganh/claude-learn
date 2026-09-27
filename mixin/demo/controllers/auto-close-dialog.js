import {LitElement, html} from 'lit';
import {AutoCloseController} from './auto-close-controller.js';
import {dialogStyles} from '../lit/dialog-styles.js';

// 3.6. Dialog tự đóng; timer được cleanup khi host disconnect.
class AutoCloseDialog extends LitElement {
  static styles = dialogStyles;

  autoClose = new AutoCloseController(this, 5);

  render() {
    const {openable, remaining} = this.autoClose;

    return html`
      <button @click=${() => openable.toggle()}>Mở / đóng dialog</button>

      <div class="dialog" ?hidden=${!openable.opened}>
        <h4>Tự đóng sau ${remaining}s</h4>
        <button @click=${() => openable.close()}>Đóng</button>
      </div>
    `;
  }
}

customElements.define('auto-close-dialog', AutoCloseDialog);
