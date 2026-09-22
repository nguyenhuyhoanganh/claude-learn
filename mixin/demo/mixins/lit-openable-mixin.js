function emitLog(host, message) {
  host.dispatchEvent(new CustomEvent('demo-log', {detail: message}));
}

export const OpenableMixin = (BaseClass) =>
  class OpenableMixinImpl extends BaseClass {
    static properties = {
      opened: {type: Boolean, reflect: true},
    };

    constructor() {
      super();
      this.opened = false;
    }

    connectedCallback() {
      super.connectedCallback();
      emitLog(this, 'mixin.connectedCallback()');
    }

    disconnectedCallback() {
      super.disconnectedCallback();
      emitLog(this, 'mixin.disconnectedCallback()');
    }

    toggle() {
      this.opened = !this.opened;
    }

    firstUpdated(changedProperties) {
      super.firstUpdated?.(changedProperties);
      emitLog(this, 'mixin.firstUpdated() — DOM đã render lần đầu');
    }

    updated(changedProperties) {
      super.updated?.(changedProperties);
      if (changedProperties.has('opened')) {
        emitLog(this, `mixin.updated(): opened = ${this.opened}`);
      }
    }
  };
