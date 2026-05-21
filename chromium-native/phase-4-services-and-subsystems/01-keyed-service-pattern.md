# Bài 1: KeyedService Pattern

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- `KeyedService`: per-Profile/BrowserContext service.
- `BrowserContextKeyedServiceFactory`: singleton factory, lifecycle management.
- Registration: factory đăng ký với `BrowserContextDependencyManager`.
- Lifetime: tạo lazily, destroy khi BrowserContext destroy.
- Dependencies giữa services: `DependsOn(...)`.
- Incognito behavior: `ServiceIsCreatedWithBrowserContext`, `ServiceIsNULLWhileTesting`.

---

**Bài kế tiếp** → [Bài 2: Prefs System (C++)](02-prefs-system-cpp.md)
