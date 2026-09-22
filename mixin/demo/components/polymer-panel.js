import {
  PolymerElement,
  html,
} from 'https://cdn.jsdelivr.net/npm/@polymer/polymer@3.5.1/polymer-element.js';
import {PolymerOpenableMixin} from '../mixins/polymer-openable-mixin.js';

export class PolymerPanel extends PolymerOpenableMixin(PolymerElement) {
  static get is() {
    return 'polymer-panel';
  }

  static get template() {
    return html`
      <button on-click="toggle">[[label]]</button>
      <p>opened = [[opened]]</p>
      <div hidden$="[[!opened]]">Nội dung đang hiển thị.</div>
    `;
  }
}

customElements.define(PolymerPanel.is, PolymerPanel);
