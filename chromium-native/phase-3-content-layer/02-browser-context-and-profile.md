# Bài 2: BrowserContext và Profile

Bài này dạy:
- `content::BrowserContext`: storage partition root, "user identity" in Chromium.
- `Profile` (chrome/): subclass adding prefs, history, services.
- Off-the-record (incognito) profile: parent profile pattern.
- StoragePartition: cookies, indexeddb, cache per partition.
- `KeyedService` overview (sẽ deep trong Phase 4).

Kết thúc bài: bạn navigate được Profile / BrowserContext lookup, hiểu OTR pattern, biết storage partition concept.

## BrowserContext = "user"

```cpp
class BrowserContext {
 public:
  // Identifiers
  virtual base::FilePath GetPath() = 0;
  virtual bool IsOffTheRecord() = 0;

  // Storage
  virtual StoragePartition* GetDefaultStoragePartition() = 0;

  // ... many more virtual methods
};
```

`BrowserContext` = abstract concept of "user/profile" in `content/`. Each tab belongs to 1 BrowserContext.

### Identity

```cpp
content::WebContents* wc = ...;
content::BrowserContext* bc = wc->GetBrowserContext();

base::FilePath dir = bc->GetPath();    // /home/user/.config/chromium/Default
bool incognito = bc->IsOffTheRecord();  // false for default, true for incognito
```

### Storage per BrowserContext

```cpp
StoragePartition* sp = bc->GetDefaultStoragePartition();
// sp has: cookies, localStorage, IndexedDB, cache, ServiceWorker, etc.
```

Each BrowserContext has separate storage:

- Cookies isolated.
- IndexedDB isolated.
- Cache isolated.

So profile = "user" — different profile, different storage.

## `Profile` (chrome/)

`Profile` extends `BrowserContext` for Chrome-specific stuff:

```cpp
// chrome/browser/profiles/profile.h
class Profile : public content::BrowserContext {
 public:
  // Prefs (we'll learn in Phase 4)
  virtual PrefService* GetPrefs() = 0;

  // Profile type
  virtual bool IsRegularProfile() = 0;
  virtual bool IsIncognitoProfile() = 0;
  virtual bool IsGuestSession() = 0;

  // Get original (non-OTR) profile
  virtual Profile* GetOriginalProfile() = 0;

  // ... many more
};
```

Profile adds:

- Prefs (user preferences).
- ProfileSyncService.
- BookmarkModel.
- HistoryService.
- ... lots of services.

Chrome-specific. Other Chromium-based browsers (Edge, Brave) may have different Profile subclass.

### Get Profile from context

```cpp
content::BrowserContext* bc = wc->GetBrowserContext();
Profile* profile = Profile::FromBrowserContext(bc);
// FromBrowserContext is downcast helper
```

### Profile lifecycle

- Created when user log in.
- Loaded from disk on startup.
- Destroyed on shutdown.
- Off-the-record profile: created lazily when incognito opened.

## Off-the-record (Incognito)

```cpp
Profile* original = ...;       // Regular profile
Profile* otr = original->GetOriginalProfile()->GetPrimaryOTRProfile(...);
// Or
Profile* otr = original->GetOffTheRecordProfile(...);

otr->IsOffTheRecord();         // true
otr->GetPath() == original->GetPath();  // SAME path on disk
otr->GetOriginalProfile();      // Returns original
```

OTR semantics:

- **Same disk path** as original — but
- **No data persisted**: cookies, history, etc. in-memory only.
- **Parent pattern**: refers back to original for read-only data (passwords, bookmarks read).
- Destroyed when last incognito window closed.

### Multi OTR (newer)

Modern Chromium: multiple OTR profile (Guest, incognito, etc.). Each have unique ID.

```cpp
Profile* otr = profile->GetOffTheRecordProfile(
    Profile::OTRProfileID::PrimaryID(), true);
```

## StoragePartition

```cpp
class StoragePartition {
 public:
  network::mojom::CookieManager* GetCookieManagerForBrowserProcess();
  content::IndexedDBContext* GetIndexedDBContext();
  storage::FileSystemContext* GetFileSystemContext();
  network::mojom::NetworkContext* GetNetworkContext();
  // ... etc
};
```

`StoragePartition` = grouping of storage services. Typically 1 per `BrowserContext`.

### Why partition?

Some features need isolated storage (extensions, service workers, ephemeral browsing):

```cpp
content::StoragePartition* default_sp =
    bc->GetDefaultStoragePartition();

content::StoragePartition* extension_sp =
    bc->GetStoragePartition(extension_partition_config);
// Extension has own cookie jar, cache, etc.
```

Each extension has own storage partition in Chrome → secure isolation.

## `KeyedService` — per-Profile services

```cpp
// e.g., BookmarkModel
class BookmarkModel : public KeyedService { ... };

BookmarkModel* model = BookmarkModelFactory::GetForProfile(profile);
```

`KeyedService` = service tied to 1 Profile lifetime. Many features expose state per-profile:

- BookmarkModel
- HistoryService
- ProfileSyncService
- PasswordStore
- AutofillManager

Sẽ học detail ở Phase 4.

## BrowserContext API extension

```cpp
// content::BrowserContext provides API to retrieve various services
// Many overridden in Profile subclass

content::BrowserContext* bc = ...;

bc->GetSpecialStoragePolicy();
bc->GetPushMessagingService();
bc->GetSSLHostStateDelegate();
bc->GetPermissionControllerDelegate();
bc->GetClientHintsControllerDelegate();
// ... etc
```

These are pluggable — Chrome supplies implementations via `BrowserProcessImpl` or via `Profile`.

## Profile manager

```cpp
ProfileManager* pm = g_browser_process->profile_manager();

// Get all loaded profiles
std::vector<Profile*> profiles = pm->GetLoadedProfiles();

// Get profile by path
Profile* p = pm->GetProfile(path);

// Get last used profile
Profile* p = pm->GetLastUsedProfile();
```

`ProfileManager` = browser-wide manager for all profiles. Lives in browser process.

## Pattern: ContextUserData

```cpp
// Per BrowserContext data
class MyData : public base::SupportsUserData::Data {
 public:
  static MyData* GetForBrowserContext(content::BrowserContext* bc) {
    return static_cast<MyData*>(bc->GetUserData(kKey));
  }

  static void Create(content::BrowserContext* bc) {
    bc->SetUserData(kKey, std::make_unique<MyData>());
  }

 private:
  static const char kKey[];
};

const char MyData::kKey[] = "MyData";
```

Attach data to BrowserContext lifetime. Common for browser-wide-per-profile state.

## Real example

```cpp
// chrome/browser/foo/foo_helper.cc

void FooHelper::Bar(content::WebContents* wc) {
  // Get current profile
  content::BrowserContext* bc = wc->GetBrowserContext();
  Profile* profile = Profile::FromBrowserContext(bc);

  if (profile->IsOffTheRecord()) {
    LOG(INFO) << "Skip in incognito";
    return;
  }

  // Get a per-profile service
  BookmarkModel* bookmarks = BookmarkModelFactory::GetForProfile(profile);
  if (!bookmarks->loaded()) {
    LOG(WARNING) << "Bookmarks not loaded yet";
    return;
  }

  // Get StoragePartition
  content::StoragePartition* sp = bc->GetDefaultStoragePartition();
  // ... use sp
}
```

Pattern thấy khắp `chrome/browser/`.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Use Profile pointer after destroy | UAF | Check `Profile* p = Profile::FromBrowserContext(bc)`; observe |
| Write to OTR like persistent | Data lost (no persistence) | Check `IsOffTheRecord` |
| Assume original profile alive when OTR alive | OTR destroyed first usually | But yes original outlives OTR — check by spec |
| Cross-profile data leak | Privacy violation | Verify profile boundary |
| Default StoragePartition for extensions | Wrong isolation | Use extension-specific partition |

## Tóm tắt

| Class | Layer | Purpose |
|---|---|---|
| `content::BrowserContext` | content/ | Abstract "user" |
| `Profile` | chrome/ | Chrome-specific extension |
| `StoragePartition` | content/ | Storage grouping |
| `ProfileManager` | chrome/ | All profiles |
| `KeyedService` | components/ | Per-profile service |

## Comparison

| Concept | Equivalent |
|---|---|
| Profile = "user" | Similar to user account in OS |
| OTR = "ephemeral profile" | Incognito browsing |
| StoragePartition = "site sandbox" | Origin/site-bound storage |
| KeyedService = "service per user" | Like Apache thread context, but tied to Profile |

## Exercise (optional)

1. Tìm 1 class derive từ `KeyedService` — vd `BookmarkModel`. Note pattern.
2. Read `Profile::GetOffTheRecordProfile()` implementation. Understand parent relationship.
3. Find code dealing with OTR specially — `IsOffTheRecord()` check.
4. Trace how default StoragePartition is created in `BrowserContextImpl`.

---

**Bài kế tiếp** → [Bài 3: URL Loading và Network](03-url-loading-and-network.md)
