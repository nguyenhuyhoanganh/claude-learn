function emitLog(host, message) {
  host.dispatchEvent(new CustomEvent('demo-log', {detail: message}));
}

// Task trả về giá trị này để quay về trạng thái INITIAL (giống initialState
// của @lit/task), ví dụ khi ô tìm kiếm đang trống.
export const initialState = Symbol('initialState');

export const SearchStatus = Object.freeze({
  INITIAL: 'initial',
  PENDING: 'pending',
  COMPLETE: 'complete',
  ERROR: 'error',
});

// Bản rút gọn của ý tưởng trong @lit/task:
// - args() đọc input từ host;
// - hostUpdate() so sánh args, nếu đổi thì chạy task;
// - lần chạy mới abort lần chạy đang chờ;
// - mỗi lần đổi status thì gọi host.requestUpdate().
export class SearchController {
  constructor(host, {task, args}) {
    this.host = host;
    this.task = task;
    this.args = args;
    this.status = SearchStatus.INITIAL;
    this.value = undefined;
    this.error = undefined;
    this.previousArgs = undefined;
    this.abortController = undefined;
    this.runId = 0;
    host.addController(this);
  }

  hostUpdate() {
    const args = this.args();
    const changed = !this.previousArgs ||
      args.length !== this.previousArgs.length ||
      args.some((value, index) => value !== this.previousArgs[index]);

    if (changed) {
      this.run(args);
    }
  }

  hostConnected() {
    // Nếu lần chạy trước bị abort khi disconnect, yêu cầu update để
    // hostUpdate() chạy lại task với args hiện tại.
    if (this.previousArgs === undefined) {
      this.host.requestUpdate();
    }
  }

  hostDisconnected() {
    if (this.status === SearchStatus.PENDING) {
      this.abort('host disconnected');
      // Quên args cũ để lần connect sau chạy lại task.
      this.previousArgs = undefined;
    }
  }

  abort(reason) {
    if (this.status === SearchStatus.PENDING) {
      this.abortController?.abort(reason);
      emitLog(this.host, `search.abort(): ${reason}`);
    }
  }

  async run(args = this.args()) {
    this.previousArgs = args;
    this.abort('có lần chạy mới');

    const runId = ++this.runId;
    const abortController = new AbortController();
    this.abortController = abortController;
    this.status = SearchStatus.PENDING;
    emitLog(this.host, `search.run(${JSON.stringify(args)}): pending`);
    // Nếu run() được gọi trong hostUpdate(), host đang update nên lệnh này
    // không tạo thêm lần update; template của lần update hiện tại sẽ thấy pending.
    this.host.requestUpdate();

    try {
      const value = await this.task(args, {signal: abortController.signal});
      if (runId !== this.runId) return;
      if (value === initialState) {
        this.value = undefined;
        this.status = SearchStatus.INITIAL;
      } else {
        this.value = value;
        this.error = undefined;
        this.status = SearchStatus.COMPLETE;
        emitLog(this.host, `search: complete (${value.length} kết quả)`);
      }
    } catch (error) {
      if (runId !== this.runId) return;
      if (abortController.signal.aborted) {
        // Bị abort do host disconnect: quay về INITIAL, chờ lần connect sau.
        this.status = SearchStatus.INITIAL;
        return;
      }
      this.error = error;
      this.status = SearchStatus.ERROR;
      emitLog(this.host, `search: error (${error.message})`);
    }

    this.host.requestUpdate();
  }

  // Cùng quy ước với Task.render(): complete nhận value, error nhận error.
  render(renderers) {
    switch (this.status) {
      case SearchStatus.INITIAL:
        return renderers.initial?.();
      case SearchStatus.PENDING:
        return renderers.pending?.();
      case SearchStatus.COMPLETE:
        return renderers.complete?.(this.value);
      case SearchStatus.ERROR:
        return renderers.error?.(this.error);
    }
  }
}
