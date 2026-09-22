import {JavaScriptOpenableMixin} from '../mixins/javascript-openable-mixin.js';
import {LoggingMixin} from '../mixins/logging-mixin.js';

export class BasicPanel extends LoggingMixin(
  JavaScriptOpenableMixin(HTMLElement)
) {
  connectedCallback() {
    this.render();
  }

  toggle() {
    super.toggle();
    this.render();
  }

  render() {
    this.textContent = `opened = ${this.opened}`;
  }
}

customElements.define('basic-panel', BasicPanel);
