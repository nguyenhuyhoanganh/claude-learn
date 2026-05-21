# Bài 3: GN + Ninja Deep

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- GN là gì, vì sao không dùng CMake / Bazel.
- `args.gn`: build flags (`is_debug`, `is_component_build`, `dcheck_always_on`, `enable_nacl`, etc.).
- `gn gen out/Debug`, `autoninja -C out/Debug chrome`.
- BUILD.gn patterns: `source_set`, `static_library`, `component`, `executable`, `test`.
- `gn desc`, `gn ls`, `gn refs` — tooling để hiểu dependencies.
- Build flavor: debug vs release vs component, khi nào dùng cái nào.

---

**Phase kế** → [Phase 2: base/ Library](../phase-2-base-library/01-callbacks-and-bind.md)
