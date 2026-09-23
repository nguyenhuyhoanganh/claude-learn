import {ClockController} from './clock-controller.js';

// Controller ghép từ controller khác: chỉ cần chuyển tiếp host.
// Hai ClockController con tự addController() vào cùng một host.
export class DualClockController {
  constructor(host, fastTimeout, slowTimeout) {
    this.fast = new ClockController(host, fastTimeout, 'fastClock');
    this.slow = new ClockController(host, slowTimeout, 'slowClock');
  }

  get fastTime() {
    return this.fast.value;
  }

  get slowTime() {
    return this.slow.value;
  }
}
