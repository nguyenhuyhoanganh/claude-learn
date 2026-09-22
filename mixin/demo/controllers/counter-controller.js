function emitLog(host, message) {
  host.dispatchEvent(new CustomEvent('demo-log', {detail: message}));
}

export class CounterController {
  constructor(host) {
    this.host = host;
    this.value = 0;
    host.addController(this);
  }

  hostConnected() {
    emitLog(this.host, 'controller.hostConnected()');
  }

  hostUpdate() {
    emitLog(this.host, 'controller.hostUpdate() — trước render');
  }

  hostUpdated() {
    emitLog(this.host, 'controller.hostUpdated() — sau render');
  }

  hostDisconnected() {
    emitLog(this.host, 'controller.hostDisconnected()');
  }

  increment() {
    this.value += 1;
    this.host.requestUpdate();
  }
}
