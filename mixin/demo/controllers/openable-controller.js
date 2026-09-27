// 3.2. Controller giữ trạng thái đóng/mở, thay cho OpenableMixin.
// 3.4. Nhận config và callback qua constructor.
export class OpenableController {
  constructor(host, {opened = false, onChange} = {}) {
    this.host = host;
    this.onChange = onChange;
    this._opened = opened;
    host.addController(this);
  }

  get opened() {
    return this._opened;
  }

  set opened(value) {
    if (value === this._opened) return;

    this._opened = value;
    this.onChange?.(value);
    // State của controller không reactive: phải tự yêu cầu host update.
    this.host.requestUpdate();
  }

  open() {
    this.opened = true;
  }

  close() {
    this.opened = false;
  }

  toggle() {
    this.opened = !this.opened;
  }
}
