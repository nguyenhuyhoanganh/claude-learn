import {PolymerElement, html} from '@polymer/polymer/polymer-element.js';
import {OpenableMixin, RawOpenableMixin} from './openable-mixin.js';
import {ModalMixin, RawModalMixin} from './modal-mixin.js';
import {EscapeCloseMixin} from '../shared/escape-close-mixin.js';
import {dialogStyles} from './dialog-styles.js';

// In prototype chain của một class, ví dụ "A → B → PolymerElement".
const chainOf = (klass) => {
  const names = [];
  let current = klass;
  while (current.name !== 'PolymerElement') {
    names.push(current.name);
    current = Object.getPrototypeOf(current);
  }
  names.push('PolymerElement');
  return names.join(' → ');
};

// 1.4. OpenableMixin được áp dụng hai lần: một lần trực tiếp, một lần bên
// trong ModalMixin. dedupingMixin() bỏ lần áp dụng thứ hai.
class ModalDialog extends EscapeCloseMixin(
  ModalMixin(OpenableMixin(PolymerElement))
) {
  static get properties() {
    return {
      dedupedChain: {
        type: String,
        value: () => chainOf(ModalDialog),
      },
      rawChain: {
        type: String,
        // Cùng cách ghép, nhưng dùng mixin không bọc dedupingMixin().
        value: () => chainOf(
          class ModalDialog extends EscapeCloseMixin(
            RawModalMixin(RawOpenableMixin(PolymerElement))
          ) {}
        ),
      },
    };
  }

  static get template() {
    return html`
      ${dialogStyles}

      <button on-click="toggle">Mở / đóng modal</button>

      <div class="backdrop" hidden$="[[!opened]]" on-click="closeOnBackdrop">
        <div class="dialog">
          <h4>Click vùng tối để đóng</h4>
          <div class="actions">
            <button on-click="close">Đóng</button>
          </div>
        </div>
      </div>

      <p>Có dedupingMixin:<br><code>[[dedupedChain]]</code></p>
      <p>Không dedupingMixin:<br><code>[[rawChain]]</code></p>
    `;
  }
}

customElements.define('modal-dialog', ModalDialog);
