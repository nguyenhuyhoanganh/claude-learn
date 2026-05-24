# Bài 2: Prefs System (C++)

Bài này dạy:
- `PrefService` API: GetBoolean, SetInteger, etc.
- `PrefRegistrySimple` vs `PrefRegistrySyncable`: registration, default.
- Profile prefs vs local state (browser-level).
- `PrefChangeRegistrar`: observe pref change.
- `PrefMember<T>`: cached pref accessor.
- Migration pattern khi rename/change type pref.

Kết thúc bài: bạn đăng ký pref, đọc/ghi từ C++, observe change, hiểu profile vs local state.

Prerequisite: [chromium/phase-5/06-prefs-and-settings](../../chromium/phase-5-chromium-webui/06-prefs-and-settings.md) (UI side), [Bài 1: KeyedService](01-keyed-service-pattern.md).

## Pref là gì?

**Pref** (preference) = persistent user setting hoặc state. Lưu thành JSON file.

Examples:

- `browser.show_home_button = true`
- `download.default_directory = "/home/user/Downloads"`
- `webkit.webprefs.default_font_size = 16`

## Two-tier system

### Profile prefs

Per-profile preferences. File: `<Profile>/Preferences` (JSON).

```cpp
PrefService* prefs = profile->GetPrefs();
prefs->GetBoolean("browser.show_home_button");
prefs->SetInteger("foo.count", 42);
```

Examples: bookmarks bar visible, autofill enabled, theme.

### Local state

Browser-global preferences. File: `User Data/Local State` (JSON).

```cpp
PrefService* local_state = g_browser_process->local_state();
local_state->GetString("locale");
```

Examples: locale, last session info, browser-wide settings.

→ **Quyết định**: nếu user-specific → profile; nếu browser-wide → local state.

## Register a pref

Pref **must be registered** before use. Register at startup (factory or browser init).

### Profile pref

```cpp
// chrome/browser/foo/foo_service_factory.cc

void FooServiceFactory::RegisterProfilePrefs(
    user_prefs::PrefRegistrySyncable* registry) {
  registry->RegisterBooleanPref(
      prefs::kFooEnabled,
      /*default_value=*/true);
  registry->RegisterIntegerPref(
      prefs::kFooCount,
      /*default_value=*/0);
  registry->RegisterStringPref(
      prefs::kFooName,
      /*default_value=*/std::string());
}
```

### Local state pref

```cpp
// chrome/browser/browser_process_impl.cc or similar
void RegisterLocalState(PrefRegistrySimple* registry) {
  registry->RegisterStringPref(prefs::kLastLocale, "en-US");
}
```

### Pref name constants

```cpp
// chrome/browser/foo/pref_names.h
#pragma once

namespace prefs {
extern const char kFooEnabled[];
extern const char kFooCount[];
}  // namespace prefs

// pref_names.cc
namespace prefs {
const char kFooEnabled[] = "foo.enabled";
const char kFooCount[] = "foo.count";
}  // namespace prefs
```

Use dot-separated nested keys for namespace.

## PrefRegistrySimple vs PrefRegistrySyncable

| Type | Use |
|---|---|
| `PrefRegistrySimple` | Local state, non-syncable prefs |
| `PrefRegistrySyncable` | Profile prefs, can be synced via Chrome Sync |

When registering profile pref, use `RegisterSyncable*Pref` if user expects pref synced across devices.

```cpp
registry->RegisterIntegerPref(
    prefs::kFooCount, 0,
    user_prefs::PrefRegistrySyncable::SYNCABLE_PREF);
```

## Read prefs

```cpp
PrefService* prefs = profile->GetPrefs();

// Type-specific
bool enabled = prefs->GetBoolean(prefs::kFooEnabled);
int count = prefs->GetInteger(prefs::kFooCount);
std::string name = prefs->GetString(prefs::kFooName);
double ratio = prefs->GetDouble(prefs::kFooRatio);

// List / Dict
const base::Value::List& items = prefs->GetList(prefs::kFooList);
const base::Value::Dict& settings = prefs->GetDict(prefs::kFooSettings);

// Time
base::Time t = prefs->GetTime(prefs::kFooTime);
```

## Write prefs

```cpp
PrefService* prefs = profile->GetPrefs();

prefs->SetBoolean(prefs::kFooEnabled, false);
prefs->SetInteger(prefs::kFooCount, 100);
prefs->SetString(prefs::kFooName, "hello");

// Lists / dicts
base::Value::List list;
list.Append("a");
list.Append("b");
prefs->SetList(prefs::kFooList, std::move(list));
```

Changes auto-saved to disk (debounced, async).

### Atomic update

```cpp
// ScopedDictPrefUpdate for modify-in-place
{
  ScopedDictPrefUpdate update(prefs, prefs::kFooSettings);
  base::Value::Dict& dict = update.Get();
  dict.Set("key1", "value1");
  dict.Set("key2", 42);
}  // Auto save on destroy
```

For complex modifications, use `ScopedDictPrefUpdate` / `ScopedListPrefUpdate`.

## Observe pref change

### `PrefChangeRegistrar`

```cpp
class FooHandler {
 public:
  FooHandler(PrefService* prefs) {
    pref_change_registrar_.Init(prefs);
    pref_change_registrar_.Add(
        prefs::kFooEnabled,
        base::BindRepeating(&FooHandler::OnPrefChanged,
                            base::Unretained(this)));
  }

 private:
  void OnPrefChanged() {
    bool enabled = pref_change_registrar_.prefs()->GetBoolean(prefs::kFooEnabled);
    // ... react ...
  }

  PrefChangeRegistrar pref_change_registrar_;
};
```

`PrefChangeRegistrar` register callbacks for pref changes. Unsubscribes on destruction.

### `PrefMember<T>` — cached accessor

```cpp
class FooHandler {
 public:
  FooHandler(PrefService* prefs) {
    foo_enabled_.Init(prefs::kFooEnabled, prefs,
                      base::BindRepeating(&FooHandler::OnFooEnabledChanged,
                                          base::Unretained(this)));
  }

  void Use() {
    if (foo_enabled_.GetValue()) {     // Cached
      // ...
    }
  }

 private:
  void OnFooEnabledChanged() { /* ... */ }

  BooleanPrefMember foo_enabled_;
};
```

`PrefMember<T>` cache pref value in C++ member (avoid repeated lookup). Auto update when pref changes.

Variants: `BooleanPrefMember`, `IntegerPrefMember`, `StringPrefMember`, `DoublePrefMember`, `TimePrefMember`.

## User vs default

```cpp
prefs->IsUserModifiable(prefs::kFooEnabled);   // true if user changed
prefs->IsManagedPreference(prefs::kFooEnabled); // true if enterprise policy
prefs->IsDefaultValue(prefs::kFooEnabled);     // true if default value
prefs->GetDefaultPrefValue(prefs::kFooEnabled); // default value
```

Used để show "you've changed this" indicator, allow reset to default, etc.

## Migration pattern

When rename/change pref type:

```cpp
// chrome/browser/foo/foo_pref_migration.cc

void MigrateFooPref(PrefService* prefs) {
  // Old: "foo.enabled" (bool)
  // New: "foo.mode" (int with enum)

  if (prefs->HasPrefPath("foo.enabled")) {
    bool old_value = prefs->GetBoolean("foo.enabled");
    int new_value = old_value ? 1 : 0;
    prefs->SetInteger(prefs::kFooMode, new_value);
    prefs->ClearPref("foo.enabled");
  }
}
```

Called during profile initialization. Allow gradual migration without losing data.

## Pref types — full list

```cpp
RegisterBooleanPref
RegisterIntegerPref
RegisterDoublePref
RegisterStringPref
RegisterFilePathPref
RegisterListPref
RegisterDictionaryPref
RegisterTimePref
RegisterTimeDeltaPref
RegisterInt64Pref
RegisterUint64Pref
```

`base::Value`-typed dict/list pref for arbitrary JSON.

## Pattern: feature flag via prefs

```cpp
class FooManager : public KeyedService {
 public:
  bool IsEnabled() const {
    return prefs_->GetBoolean(prefs::kFooEnabled);
  }

  void SetEnabled(bool enabled) {
    prefs_->SetBoolean(prefs::kFooEnabled, enabled);
  }

 private:
  PrefService* prefs_;
};
```

vs `base::Feature` (Finch experiments) — Pref persisted user setting; Feature is rollout/experiment.

## Real example

```cpp
// chrome/browser/bookmarks/bookmark_model_factory.cc

void BookmarkModelFactory::RegisterProfilePrefs(
    user_prefs::PrefRegistrySyncable* registry) {
  registry->RegisterBooleanPref(
      bookmarks::prefs::kEditBookmarksEnabled,
      true,
      user_prefs::PrefRegistrySyncable::SYNCABLE_PREF);
  registry->RegisterBooleanPref(
      bookmarks::prefs::kShowBookmarkBar,
      false,
      user_prefs::PrefRegistrySyncable::SYNCABLE_PREF);
  // ... more
}
```

```cpp
// In some BookmarkBarView
class BookmarkBarView {
 public:
  BookmarkBarView(Profile* profile) {
    show_bookmark_bar_.Init(
        bookmarks::prefs::kShowBookmarkBar,
        profile->GetPrefs(),
        base::BindRepeating(&BookmarkBarView::OnShowBookmarkBarChanged,
                            base::Unretained(this)));
  }

  void OnShowBookmarkBarChanged() {
    SetVisible(show_bookmark_bar_.GetValue());
  }

 private:
  BooleanPrefMember show_bookmark_bar_;
};
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Get pref not registered | CHECK fail | Register before use |
| Wrong type get/set | UB / crash | Type-match registration |
| Access pref on wrong thread | Race | Pref API thread-affine (UI thread for profile prefs) |
| Forget migration after rename | User loses data | Add migration function |
| Use PrefMember without `weak_factory_` | UAF in callback | Use Init's BindRepeating with Unretained(this) — safe if PrefMember member of class |
| Local state vs profile pref confusion | Wrong scope | Document, name with `kLocalState*` prefix maybe |
| Override managed pref | Silently ignored | Check `IsManagedPreference` |

## Tóm tắt

| Concept | Take-away |
|---|---|
| `PrefService` | API: GetX, SetX, observe |
| Profile prefs | Per-profile, `profile->GetPrefs()` |
| Local state | Browser-wide, `g_browser_process->local_state()` |
| `PrefRegistrySimple` | Local state registration |
| `PrefRegistrySyncable` | Profile registration (syncable optional) |
| `PrefChangeRegistrar` | Callback on change |
| `PrefMember<T>` | Cached typed accessor |
| `ScopedDictPrefUpdate` | Atomic dict modify |
| Migration | Handle rename / type change gracefully |

## Pattern integration với WebUI

Settings UI (Polymer/Lit) → Mojo handler → `PrefService` C++.

`chromium/phase-5/06-prefs-and-settings.md` shows UI side. C++ side use `PrefService`.

## Exercise (optional)

1. Find pref registration in any chrome/browser/ feature. Note categories (boolean, list, etc.).
2. Read `PrefService` API. Note thread restrictions.
3. Create `FooManager` with PrefMember-cached value + change observer. Test pref change reflects.
4. Trace pref change → disk save (look for `JsonPrefStore` save logic).

---

**Bài kế tiếp** → [Bài 3: Services Architecture](03-services-architecture.md)
