import {PolymerElement, html} from '@polymer/polymer/polymer-element.js';
import {OpenableMixin} from './openable-mixin.js';
import {EscapeCloseMixin} from '../shared/escape-close-mixin.js';
import {dialogStyles} from './dialog-styles.js';

// 1.3. Dialog ở 1.2 + EscapeCloseMixin.
// Chain: EscapeDialog → EscapeCloseMixinImpl → OpenableMixinImpl → PolymerElement
class EscapeDialog extends EscapeCloseMixin(OpenableMixin(PolymerElement)) {
  static get template() {
    return html`
      ${dialogStyles}

      <button on-click="toggle">Mở / đóng dialog</button>

      <div class="dialog" hidden$="[[!opened]]">
        <h4>Nhấn Esc để đóng</h4>
        <div class="actions">
          <button on-click="close">Đóng</button>
        </div>
      </div>
    `;
  }
}

customElements.define('escape-dialog', EscapeDialog);
