import {LitDialog} from './lit-dialog.js';

// 2.3. Cách SAI: class field tạo property riêng trên instance, che accessor
// mà Lit tạo cho opened. Gán this.opened không còn trigger update.
class WrongDialog extends LitDialog {
  opened = true;
}

customElements.define('wrong-dialog', WrongDialog);
