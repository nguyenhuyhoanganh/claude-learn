import {dedupingMixin} from '@polymer/polymer/lib/utils/mixin.js';

// 1.2. Mixin thêm trạng thái đóng/mở cho element.
const openable = (baseClass) =>
  class OpenableMixinImpl extends baseClass {
    static get properties() {
      return {
        opened: {
          type: Boolean,
          value: false,
          reflectToAttribute: true,
          notify: true,
        },
      };
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
  };

// 1.4. Bọc bằng dedupingMixin() để OpenableMixin chỉ xuất hiện một lần
// trong prototype chain, kể cả khi được áp dụng nhiều lần.
export const OpenableMixin = dedupingMixin(openable);

// Bản không deduplicate, chỉ dùng để so sánh trong demo 1.4.
export const RawOpenableMixin = openable;
