// 3.3. Controller gọi callback khi nhấn Escape, thay cho EscapeCloseMixin.
export class EscapeController {
  constructor(host, onEscape) {
    this.host = host;
    this.onEscape = onEscape;
    this.listener = (event) => {
      if (event.key === 'Escape') this.onEscape();
    };
    host.addController(this);
  }

  hostConnected() {
    document.addEventListener('keydown', this.listener);
  }

  hostDisconnected() {
    document.removeEventListener('keydown', this.listener);
  }
}
