# Bài 3: TaskRunners và Threading

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- Chromium threading model: UI thread, IO thread, ThreadPool, sequences.
- `base::TaskRunner`, `base::SequencedTaskRunner`, `base::SingleThreadTaskRunner`.
- `base::ThreadPool::PostTask`, `content::GetUIThreadTaskRunner`, `content::GetIOThreadTaskRunner`.
- Sequence vs thread: vì sao prefer sequence.
- `base::PostTaskAndReplyWithResult` pattern.
- Threading restrictions: blocking, may_block, MUST_USE_RESULT.

---

**Bài kế tiếp** → [Bài 4: Logging và Assertions](04-logging-and-assertions.md)
