import {LitElement, html} from 'lit';
import {DualClockController} from '../controllers/dual-clock-controller.js';
import {ProbeController} from '../controllers/probe-controller.js';
import {initialState, SearchController} from '../controllers/search-controller.js';
import {searchFruits} from '../data/fruit-api.js';

const formatTime = (date) => date.toLocaleTimeString('vi-VN');

export class ControllerLab extends LitElement {
  static properties = {
    query: {type: String},
    delay: {type: Number},
  };

  constructor() {
    super();
    this.query = '';
    this.delay = 600;

    // 1. Controller ghép: một controller cha chứa hai ClockController con.
    this.clocks = new DualClockController(this, 1000, 3000);

    // 2. Controller cho tác vụ bất đồng bộ, đọc input từ reactive property.
    this.search = new SearchController(this, {
      args: () => [this.query.trim(), this.delay],
      task: ([query, delay], {signal}) =>
        query ? searchFruits(query, {delay, signal}) : initialState,
    });

    // 3. Controller được gắn/gỡ lúc runtime bằng addController/removeController.
    this.probe = new ProbeController(this);
  }

  // Public method của element chỉ chuyển lời gọi vào controller.
  attachProbe() {
    this.probe.attach();
  }

  detachProbe() {
    this.probe.detach();
  }

  willUpdate(changedProperties) {
    if (changedProperties.has('query')) {
      this.dispatchEvent(new CustomEvent('demo-log', {
        detail: `host.willUpdate(): query = "${this.query}"`,
      }));
    }
  }

  onInput(event) {
    this.query = event.target.value;
  }

  render() {
    return html`
      <p>
        fastClock (1s): ${formatTime(this.clocks.fastTime)} ·
        slowClock (3s): ${formatTime(this.clocks.slowTime)}
      </p>
      <label>
        Tìm trái cây:
        <input .value=${this.query} @input=${this.onInput}
          placeholder="ví dụ: ap, an, error">
      </label>
      <p class="search-result">
        ${this.search.render({
          initial: () => 'Nhập từ khóa để tìm.',
          pending: () => 'Đang tìm…',
          complete: (items) => items.length
            ? `Kết quả: ${items.join(', ')}`
            : 'Không có kết quả.',
          error: (error) => `Lỗi: ${error.message}`,
        })}
      </p>
      <p>probe: ${this.probe.attached ? 'đã addController()' : 'chưa gắn'}</p>
    `;
  }
}

customElements.define('controller-lab', ControllerLab);
