# Bài 1: Process Model Deep

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- BrowserProcess vs RenderProcess vs UtilityProcess vs GPUProcess.
- `WebContents`: tab abstraction, lifecycle, observers.
- `RenderFrameHost` (RFH): mỗi frame có 1, lifecycle (Speculative, Active, PendingDeletion).
- `RenderProcessHost` (RPH): browser-side proxy cho 1 renderer process.
- `NavigationController`, `NavigationRequest`, `NavigationHandle`.
- Site Isolation intro.

---

**Bài kế tiếp** → [Bài 2: BrowserContext và Profile](02-browser-context-and-profile.md)
