import {dedupingMixin} from '@polymer/polymer/lib/utils/mixin.js';

// Polymer không có addController()/requestUpdate(). Mixin này bổ sung đủ bốn
// API của ReactiveControllerHost để dùng lại ReactiveController của Lit.
//
// Polymer không có render(): binding chỉ chạy lại khi property đổi. Vì vậy
// mỗi lần requestUpdate(), mixin tăng property _hostRevision; binding nào đọc
// state của controller phải phụ thuộc vào _hostRevision.
export const ControllerHostMixin = dedupingMixin((BaseClass) =>
  class ControllerHostMixinImpl extends BaseClass {
    static get properties() {
      return {
        _hostRevision: {type: Number, value: 0},
      };
    }

    constructor() {
      super();
      this.__controllers = new Set();
      this.__hostConnected = false;
      this.__hasUpdated = false;
      this.__updatePending = false;
      this.__updatePromise = Promise.resolve(true);
    }

    addController(controller) {
      this.__controllers.add(controller);
      // Giống Lit: host đã connected thì gọi hostConnected() ngay.
      if (this.__hostConnected) {
        controller.hostConnected?.();
      }
    }

    removeController(controller) {
      this.__controllers.delete(controller);
    }

    connectedCallback() {
      // super.connectedCallback() chạy ready() lần đầu: template đã có
      // trước khi controller nhận hostConnected().
      super.connectedCallback();
      this.__hostConnected = true;
      this.__controllers.forEach((c) => c.hostConnected?.());
      if (!this.__hasUpdated) {
        this.requestUpdate();
      }
    }

    disconnectedCallback() {
      super.disconnectedCallback();
      this.__hostConnected = false;
      this.__controllers.forEach((c) => c.hostDisconnected?.());
    }

    requestUpdate() {
      if (this.__updatePending) return;
      this.__updatePending = true;
      // Gom nhiều lần gọi trong cùng một tick thành một lần update, như Lit.
      this.__updatePromise = Promise.resolve().then(() => this.__performUpdate());
    }

    get updateComplete() {
      return this.__updatePromise;
    }

    __performUpdate() {
      this.__updatePending = false;
      this.__controllers.forEach((c) => c.hostUpdate?.());
      // Property effects của Polymer chạy đồng bộ ngay tại dòng gán này.
      this._hostRevision += 1;
      this.__hasUpdated = true;
      this.__controllers.forEach((c) => c.hostUpdated?.());
      return !this.__updatePending;
    }
  });
