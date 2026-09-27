// 2.2. OpenableMixin viết lại cho Lit.
export const OpenableMixin = (baseClass) =>
  class OpenableMixinImpl extends baseClass {
    static properties = {
      opened: {type: Boolean, reflect: true},
    };

    constructor() {
      super();
      this.opened = false;
    }

    open() {
      this.opened = true;
    }

    close() {
      this.opened = false;
    }

    toggle() {
      this.opened ? this.close() : this.open();
    }

    // 2.4. Lit không có notify: tự phát event khi opened đổi.
    updated(changedProperties) {
      super.updated?.(changedProperties);

      // Bỏ qua lần gán giá trị đầu tiên trong constructor.
      if (
        changedProperties.has('opened') &&
        changedProperties.get('opened') !== undefined
      ) {
        this.dispatchEvent(new CustomEvent('opened-changed', {
          bubbles: true,
          composed: true,
          detail: {value: this.opened},
        }));
      }
    }
  };
