# Bài 2: optional, variant, tuple

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- `std::optional<T>`: "có thể không có giá trị" — thay nullable pointer.
- `std::variant<A, B, C>`: discriminated union, visit pattern.
- `std::tuple<...>` và `std::pair<A, B>`.
- `std::expected<T, E>` (C++23): result type — khi available; fallback `std::variant` / tuple cho C++17.

---

**Bài kế tiếp** → [Bài 3: Error Handling Philosophy](03-error-handling-philosophy.md)
