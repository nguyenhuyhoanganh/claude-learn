import {html, PolymerElement} from '@polymer/polymer/polymer-element.js';
import {ClockController} from '../controllers/clock-controller.js';
import {ControllerHostMixin} from '../mixins/polymer-controller-host-mixin.js';

// Element Polymer dùng lại ClockController viết cho Lit.
export class PolymerClock extends ControllerHostMixin(PolymerElement) {
  static get is() {
    return 'polymer-clock';
  }

  static get template() {
    // formatTime_ phụ thuộc _hostRevision nên chạy lại mỗi lần controller
    // gọi requestUpdate().
    return html`<p>Polymer + ClockController: [[formatTime_(_hostRevision)]]</p>`;
  }

  constructor() {
    super();
    this.clock = new ClockController(this, 1000, 'polymerClock');
  }

  formatTime_() {
    return this.clock.value.toLocaleTimeString('vi-VN');
  }
}

customElements.define(PolymerClock.is, PolymerClock);
