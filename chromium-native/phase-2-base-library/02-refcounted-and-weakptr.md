# Bài 2: RefCounted và WeakPtr

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- `base::RefCounted<T>` và `base::RefCountedThreadSafe<T>`.
- `scoped_refptr<T>`: smart pointer cho refcounted object.
- Khi nào dùng refcount vs `std::shared_ptr` (Chromium prefer scoped_refptr cho thread-safe scenarios).
- `base::WeakPtr<T>` và `base::WeakPtrFactory<T>`: pattern cho async callback an toàn.
- `base::Unretained` vs `base::WeakPtr`: trade-off.
- Anti-patterns thường gặp.

---

**Bài kế tiếp** → [Bài 3: TaskRunners và Threading](03-task-runners-and-threading.md)
