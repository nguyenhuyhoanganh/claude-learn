import {LitElement, html} from 'lit';
import {OpenableController} from './openable-controller.js';
import {dialogStyles} from '../lit/dialog-styles.js';

// 3.4. Controller private; element chỉ expose opened, toggle() và close().
class PrivateCtrlDialog extends LitElement {
  static styles = dialogStyles;

  #openable = new OpenableController(this, {
    // Callback cho giao tiếp nội bộ; host phát event cho consumer bên ngoài.
    onChange: (opened) => {
      this.dispatchEvent(new CustomEvent('opened-changed', {
        bubbles: true,
        composed: true,
        detail: {value: opened},
      }));
    },
  });

  get opened() {
    return this.#openable.opened;
  }

  toggle() {
    this.#openable.toggle();
  }

  close() {
    this.#openable.close();
  }

  render() {
    return html`
      <button @click=${this.toggle}>Mở / đóng dialog</button>

      <div class="dialog" ?hidden=${!this.opened}>
        <h4>Controller private</h4>
        <div class="actions">
          <button @click=${this.close}>Đóng</button>
        </div>
      </div>
    `;
  }
}

customElements.define('private-ctrl-dialog', PrivateCtrlDialog);
