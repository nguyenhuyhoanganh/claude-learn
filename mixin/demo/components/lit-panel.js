import {
  LitElement,
  html,
} from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import {CounterController} from '../controllers/counter-controller.js';
import {OpenableMixin} from '../mixins/lit-openable-mixin.js';

export class LitPanel extends OpenableMixin(LitElement) {
  constructor() {
    super();
    this.counter = new CounterController(this);
  }

  render() {
    return html`
      <button @click=${this.toggle}>
        Mixin: opened = ${this.opened}
      </button>
      <button @click=${() => this.counter.increment()}>
        Controller: count = ${this.counter.value}
      </button>
      <div ?hidden=${!this.opened}>Nội dung đang hiển thị.</div>
    `;
  }
}

customElements.define('lit-panel', LitPanel);
