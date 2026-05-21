# Bài 2: Prefs System (C++)

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- `PrefService`: API đọc/ghi pref (`GetBoolean`, `SetInteger`, etc.).
- `PrefRegistrySimple` vs `PrefRegistrySyncable`: registration, default value.
- Profile prefs vs local state (browser-level).
- `PrefChangeRegistrar`: observe pref change.
- `PrefMember<T>`: cached pref accessor.
- Migration pattern khi rename / change type pref.

---

**Bài kế tiếp** → [Bài 3: Services Architecture](03-services-architecture.md)
