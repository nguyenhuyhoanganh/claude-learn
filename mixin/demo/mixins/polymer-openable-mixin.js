import {dedupingMixin} from 'https://cdn.jsdelivr.net/npm/@polymer/polymer@3.5.1/lib/utils/mixin.js';

function emitLog(host, message) {
  host.dispatchEvent(new CustomEvent('demo-log', {detail: message}));
}

export const OpenableMixin = dedupingMixin((BaseClass) =>
  class OpenableMixinImpl extends BaseClass {
    static get properties() {
      return {
        opened: {
          type: Boolean,
          value: false,
          reflectToAttribute: true,
          notify: true,
          observer: 'openedChanged_',
        },
        label: {
          type: String,
          computed: 'computeLabel_(opened)',
        },
      };
    }

    connectedCallback() {
      super.connectedCallback();
      emitLog(this, 'mixin.connectedCallback()');
    }

    ready() {
      super.ready();
      emitLog(this, 'mixin.ready() — chỉ chạy một lần');
    }

    disconnectedCallback() {
      super.disconnectedCallback();
      emitLog(this, 'mixin.disconnectedCallback()');
    }

    toggle() {
      this.opened = !this.opened;
    }

    computeLabel_(opened) {
      return opened ? 'Đang mở' : 'Đang đóng';
    }

    openedChanged_(opened, oldOpened) {
      emitLog(this, `observer: ${oldOpened} → ${opened}`);
    }
  });
