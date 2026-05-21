# Bài 1: Callbacks và Bind

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- `base::OnceCallback<R(Args...)>` vs `base::RepeatingCallback<R(Args...)>`.
- `base::BindOnce(...)`, `base::BindRepeating(...)`.
- Capture method pointer + receiver: `base::BindOnce(&Class::Method, instance)`.
- Bind argument: pass by value vs `std::ref` vs `base::Unretained`.
- `base::OnceClosure` / `base::RepeatingClosure` (callback không có arg, không return).
- So sánh với `std::function`: vì sao Chromium có riêng (move-only OnceCallback, ASan-friendly).

---

**Bài kế tiếp** → [Bài 2: RefCounted và WeakPtr](02-refcounted-and-weakptr.md)
