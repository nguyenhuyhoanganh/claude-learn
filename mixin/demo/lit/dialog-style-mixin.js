import {dialogStyles} from './dialog-styles.js';

// 2.4. Mixin cung cấp style qua static styles.
export const DialogStyleMixin = (baseClass) =>
  class DialogStyleMixinImpl extends baseClass {
    static styles = dialogStyles;
  };
