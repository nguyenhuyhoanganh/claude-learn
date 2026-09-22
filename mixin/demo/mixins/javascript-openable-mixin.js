export const OpenableMixin = (BaseClass) =>
  class OpenableMixinImpl extends BaseClass {
    constructor() {
      super();
      this.opened = false;
    }

    toggle() {
      this.dispatchEvent(new CustomEvent('demo-log', {
        detail: '2. OpenableMixin.toggle()',
      }));
      this.opened = !this.opened;
    }
  };
