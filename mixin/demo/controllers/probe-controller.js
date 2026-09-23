function emitLog(host, message) {
  host.dispatchEvent(new CustomEvent('demo-log', {detail: message}));
}

// Controller chỉ ghi log để quan sát addController()/removeController()
// khi host đã được gắn vào document.
export class ProbeController {
  constructor(host) {
    this.host = host;
    this.updates = 0;
    this.connected = false;
    this.attached = false;
  }

  attach() {
    if (this.attached) return;
    this.attached = true;
    // Nếu host đang connected, Lit gọi hostConnected() ngay trong lệnh này.
    this.host.addController(this);
    this.host.requestUpdate();
  }

  detach() {
    if (!this.attached) return;
    this.attached = false;
    // removeController() KHÔNG gọi hostDisconnected().
    // Controller phải tự dọn tài nguyên nếu bị gỡ khi host vẫn connected.
    this.host.removeController(this);
    if (this.connected) {
      this.cleanup('detach()');
    }
    this.host.requestUpdate();
  }

  hostConnected() {
    this.connected = true;
    emitLog(this.host, 'probe.hostConnected()');
  }

  hostUpdate() {
    this.updates += 1;
    emitLog(this.host, `probe.hostUpdate() #${this.updates}`);
  }

  hostDisconnected() {
    this.cleanup('hostDisconnected()');
  }

  cleanup(source) {
    this.connected = false;
    emitLog(this.host, `probe: dọn tài nguyên từ ${source}`);
  }
}
