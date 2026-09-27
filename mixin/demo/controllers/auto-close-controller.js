import {OpenableController} from './openable-controller.js';
import {writeLog} from '../shared/log.js';

// 3.5–3.6. Controller ghép từ controller con: dùng OpenableController cho state
// đóng/mở và thêm timer tự đóng sau `seconds` giây.
export class AutoCloseController {
  constructor(host, seconds = 5) {
    this.host = host;
    this.seconds = seconds;
    this.remaining = 0;
    this.openable = new OpenableController(host, {
      onChange: (opened) => (opened ? this.start() : this.stop()),
    });
    host.addController(this);
  }

  hostConnected() {
    // Gắn lại khi dialog vẫn mở: chạy lại timer.
    if (this.openable.opened) this.start();
  }

  hostDisconnected() {
    // Cleanup timer khi host bị gỡ khỏi DOM.
    this.stop();
  }

  start() {
    this.stop();
    this.remaining = this.seconds;
    this.timerId = setInterval(() => {
      this.remaining -= 1;
      if (this.remaining <= 0) {
        this.openable.close();
      } else {
        this.host.requestUpdate();
      }
    }, 1000);
    writeLog(this.host, `start timer ${this.seconds}s`);
  }

  stop() {
    if (this.timerId === undefined) return;

    clearInterval(this.timerId);
    this.timerId = undefined;
    writeLog(this.host, 'clear timer');
  }
}
