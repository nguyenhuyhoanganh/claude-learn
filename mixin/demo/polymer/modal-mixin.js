import {dedupingMixin} from '@polymer/polymer/lib/utils/mixin.js';
import {OpenableMixin, RawOpenableMixin} from './openable-mixin.js';

// 1.4. ModalMixin cần close() nên tự áp dụng OpenableMixin.
const modal = (openableMixin) => (baseClass) =>
  class ModalMixinImpl extends openableMixin(baseClass) {
    closeOnBackdrop(event) {
      // Chỉ đóng khi click vào backdrop, không đóng khi click trong dialog.
      if (event.target === event.currentTarget) {
        this.close();
      }
    }
  };

export const ModalMixin = dedupingMixin(modal(OpenableMixin));

// Bản không deduplicate, chỉ dùng để so sánh trong demo 1.4.
export const RawModalMixin = modal(RawOpenableMixin);
