# Bài 2: BrowserContext và Profile

> **Trạng thái:** Stub. Nội dung đầy đủ sẽ được viết trong Plan phase tương ứng.

## Phạm vi dự kiến

- `content::BrowserContext`: storage partition root, "user" trong Chromium.
- `Profile` (chrome/): subclass của BrowserContext, thêm prefs, history, etc.
- Off-the-record (incognito) profile: parent profile pattern.
- StoragePartition: cookies, indexeddb, cache per partition.
- `KeyedService` overview (sẽ deep trong Phase 4).

---

**Bài kế tiếp** → [Bài 3: URL Loading và Network](03-url-loading-and-network.md)
