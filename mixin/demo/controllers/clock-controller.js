function emitLog(host, message) {
  host.dispatchEvent(new CustomEvent('demo-log', {detail: message}));
}

// Theo ví dụ ClockController trong tài liệu Lit:
// tạo timer khi host connect và dọn timer khi host disconnect.
export class ClockController {
  constructor(host, timeout = 1000, name = 'clock') {
    this.host = host;
    this.timeout = timeout;
    this.name = name;
    this.value = new Date();
    this.timerId = undefined;
    host.addController(this);
  }

  hostConnected() {
    this.value = new Date();
    this.timerId = setInterval(() => {
      this.value = new Date();
      this.host.requestUpdate();
    }, this.timeout);
    emitLog(this.host, `${this.name}.hostConnected(): bắt đầu timer ${this.timeout}ms`);
  }

  hostDisconnected() {
    clearInterval(this.timerId);
    this.timerId = undefined;
    emitLog(this.host, `${this.name}.hostDisconnected(): dừng timer`);
  }
}
