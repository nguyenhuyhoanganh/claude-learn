# Bài 3: Error Handling Philosophy

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- Exception: cách dùng, cost (throw + unwind).
- Return code style: `bool`, `int`, `std::optional`, `std::expected`.
- RAII as cleanup (không cần `finally`).
- Vì sao Chromium tắt exception (binary size, predictable cost, ABI).
- Best practice modern: optional cho "có thể không có", expected cho "có thể fail với detail".

---

**Phase kế** → [Phase 6: Concurrency và Tooling](../phase-6-concurrency-and-tooling/01-threads-and-mutex.md)
