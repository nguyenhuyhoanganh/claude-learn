import {LitElement, html} from 'lit';
import {OpenableController} from './openable-controller.js';
import {EscapeController} from './escape-controller.js';
import {dialogStyles} from '../lit/dialog-styles.js';

// 3.5. Một host, ba controller: hai instance OpenableController có state
// riêng và một EscapeController đóng cả hai.
class TwoDialogs extends LitElement {
  static styles = dialogStyles;

  confirm = new OpenableController(this);
  help = new OpenableController(this);

  escape = new EscapeController(this, () => {
    this.confirm.close();
    this.help.close();
  });

  render() {
    return html`
      <div class="actions">
        <button @click=${() => this.confirm.toggle()}>Mở / đóng Xác nhận</button>
        <button @click=${() => this.help.toggle()}>Mở / đóng Trợ giúp</button>
      </div>

      <div class="dialog" ?hidden=${!this.confirm.opened}>
        <h4>Xác nhận</h4>
        <button @click=${() => this.confirm.close()}>Đóng</button>
      </div>

      <div class="dialog" ?hidden=${!this.help.opened}>
        <h4>Trợ giúp</h4>
        <button @click=${() => this.help.close()}>Đóng</button>
      </div>
    `;
  }
}

customElements.define('two-dialogs', TwoDialogs);
