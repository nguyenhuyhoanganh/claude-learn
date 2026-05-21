# Bài 1: Smart Pointers

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- `std::unique_ptr<T>`: single ownership, move-only.
- `std::shared_ptr<T>`: shared ownership, reference count.
- `std::weak_ptr<T>`: non-owning observer.
- `std::make_unique` / `std::make_shared` — vì sao prefer over `new`.
- Ownership semantics: khi nào dùng cái nào (rule of thumb).

---

**Bài kế tiếp** → [Bài 2: Move Semantics](02-move-semantics.md)
