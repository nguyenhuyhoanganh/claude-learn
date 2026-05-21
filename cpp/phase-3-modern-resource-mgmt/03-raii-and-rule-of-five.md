# Bài 3: RAII và Rule of Five

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- RAII principle: resource acquisition is initialization, release in destructor.
- Patterns: `std::lock_guard`, file handle wrapper, scope guard.
- Rule of 0: prefer no manual special member.
- Rule of 3 (legacy): copy ctor, copy assignment, destructor.
- Rule of 5 (modern): + move ctor + move assignment.
- `= default` và `= delete`.
- Exception safety basics: basic guarantee, strong guarantee, no-throw.

---

**Phase kế** → [Phase 4: Templates và STL](../phase-4-templates-and-stl/01-templates.md)
