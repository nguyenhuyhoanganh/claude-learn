// 1.3. Nhấn Escape để đóng. Mixin chỉ dùng connectedCallback(),
// disconnectedCallback() và close(), nên áp dụng được cho cả Polymer và Lit.
export const EscapeCloseMixin = (baseClass) =>
  class EscapeCloseMixinImpl extends baseClass {
    constructor() {
      super();
      this.escapeListener = (event) => {
        if (event.key === 'Escape') this.close();
      };
    }

    connectedCallback() {
      super.connectedCallback();
      document.addEventListener('keydown', this.escapeListener);
    }

    disconnectedCallback() {
      super.disconnectedCallback();
      document.removeEventListener('keydown', this.escapeListener);
    }
  };
