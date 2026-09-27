import {LitElement, html} from 'lit';
import {OpenableController} from './openable-controller.js';
import {EscapeController} from './escape-controller.js';
import {dialogStyles} from '../lit/dialog-styles.js';

// 3.2. Cùng dialog ở 2.2, nhưng state nằm trong controller.
// 3.3. Thêm EscapeController để nhấn Escape thì đóng.
class CtrlDialog extends LitElement {
  static styles = dialogStyles;

  openable = new OpenableController(this);
  escape = new EscapeController(this, () => this.openable.close());

  render() {
    return html`
      <button @click=${() => this.openable.toggle()}>Mở / đóng dialog</button>

      <div class="dialog" ?hidden=${!this.openable.opened}>
        <h4>Dialog dùng controller</h4>
        <div class="actions">
          <button @click=${() => this.openable.close()}>Đóng</button>
        </div>
      </div>
    `;
  }
}

customElements.define('ctrl-dialog', CtrlDialog);
