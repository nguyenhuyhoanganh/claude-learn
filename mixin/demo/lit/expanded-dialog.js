import {LitDialog} from './lit-dialog.js';

// 2.3. Kế thừa LitDialog, đổi default value và attribute của opened.
class ExpandedDialog extends LitDialog {
  // Option mới thay thế option cũ nên ghi lại cả type và reflect.
  static properties = {
    opened: {type: Boolean, reflect: true, attribute: 'expanded'},
  };

  constructor() {
    super();
    this.opened = true;
  }
}

customElements.define('expanded-dialog', ExpandedDialog);
