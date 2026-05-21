# Bài 1: KeyedService Pattern

Bài này dạy:
- `KeyedService`: per-Profile/BrowserContext service base class.
- `BrowserContextKeyedServiceFactory`: singleton factory.
- Registration: factory đăng ký với `BrowserContextDependencyManager`.
- Lifetime: tạo lazily, destroy khi BrowserContext destroy.
- Dependencies giữa services: `DependsOn(...)`.
- Incognito behavior: `ServiceIsCreatedWithBrowserContext`, etc.

Kết thúc bài: bạn tạo được KeyedService, register factory, manage dependency, hiểu lifecycle pattern.

Prerequisite: [Bài 2 Phase 3](../phase-3-content-layer/02-browser-context-and-profile.md) (Profile/BrowserContext).

## KeyedService là gì?

```cpp
class KeyedService {
 public:
  virtual ~KeyedService() = default;
  virtual void Shutdown() {}    // Called before destroy
};
```

`KeyedService` = service **per-key** (key thường là BrowserContext / Profile). 1 instance per profile.

Examples in Chromium:

- `BookmarkModel` — per profile.
- `HistoryService` — per profile.
- `PrefService` — per profile (actually not KeyedService but similar).
- `ProfileSyncService` — per profile.

→ Pattern dùng khắp Chrome cho per-user state.

## Lifecycle

```text
Profile created
    ↓
Factory::GetForProfile(profile) called lazily
    ↓
Factory::BuildServiceInstanceFor() → new KeyedService
    ↓
Service registered with DependencyManager
    ↓
... Use service ...
    ↓
Profile shutting down
    ↓
Service::Shutdown() called (before Profile destroyed)
    ↓
Service destroyed (in dependency-reverse order)
```

Key: `Shutdown()` cho service cleanup access to other services (which may have already shutdown).

## Define a KeyedService

```cpp
// chrome/browser/foo/foo_service.h
#pragma once

#include "components/keyed_service/core/keyed_service.h"

class Profile;

class FooService : public KeyedService {
 public:
  explicit FooService(Profile* profile);
  ~FooService() override;

  FooService(const FooService&) = delete;
  FooService& operator=(const FooService&) = delete;

  // Public API
  void DoSomething();
  int GetState() const;

  // KeyedService:
  void Shutdown() override;

 private:
  Profile* profile_;
  int state_ = 0;
};
```

```cpp
// foo_service.cc
#include "chrome/browser/foo/foo_service.h"

FooService::FooService(Profile* profile) : profile_(profile) {
  // Init
}

FooService::~FooService() = default;

void FooService::Shutdown() {
  // Release references to other services / KeyedService dependencies
}

void FooService::DoSomething() { ... }
```

## Define a Factory

```cpp
// chrome/browser/foo/foo_service_factory.h
#pragma once

#include "base/no_destructor.h"
#include "components/keyed_service/content/browser_context_keyed_service_factory.h"

class FooService;
class Profile;

class FooServiceFactory : public BrowserContextKeyedServiceFactory {
 public:
  static FooService* GetForProfile(Profile* profile);
  static FooServiceFactory* GetInstance();

  FooServiceFactory(const FooServiceFactory&) = delete;
  FooServiceFactory& operator=(const FooServiceFactory&) = delete;

 private:
  friend class base::NoDestructor<FooServiceFactory>;

  FooServiceFactory();
  ~FooServiceFactory() override;

  // BrowserContextKeyedServiceFactory:
  std::unique_ptr<KeyedService> BuildServiceInstanceForBrowserContext(
      content::BrowserContext* context) const override;

  content::BrowserContext* GetBrowserContextToUse(
      content::BrowserContext* context) const override;

  bool ServiceIsCreatedWithBrowserContext() const override;
};
```

```cpp
// foo_service_factory.cc
#include "chrome/browser/foo/foo_service_factory.h"

#include "chrome/browser/foo/foo_service.h"
#include "chrome/browser/profiles/profile.h"

// static
FooService* FooServiceFactory::GetForProfile(Profile* profile) {
  return static_cast<FooService*>(
      GetInstance()->GetServiceForBrowserContext(profile, /*create=*/true));
}

// static
FooServiceFactory* FooServiceFactory::GetInstance() {
  static base::NoDestructor<FooServiceFactory> instance;
  return instance.get();
}

FooServiceFactory::FooServiceFactory()
    : BrowserContextKeyedServiceFactory(
          "FooService",
          BrowserContextDependencyManager::GetInstance()) {
  // Declare dependencies
  // DependsOn(SomeOtherFactory::GetInstance());
}

FooServiceFactory::~FooServiceFactory() = default;

std::unique_ptr<KeyedService>
FooServiceFactory::BuildServiceInstanceForBrowserContext(
    content::BrowserContext* context) const {
  Profile* profile = Profile::FromBrowserContext(context);
  return std::make_unique<FooService>(profile);
}

content::BrowserContext* FooServiceFactory::GetBrowserContextToUse(
    content::BrowserContext* context) const {
  // Decide: use this context as-is, or redirect (e.g., OTR → original)?
  Profile* profile = Profile::FromBrowserContext(context);
  if (profile->IsOffTheRecord()) {
    // Option 1: use OTR (separate service per incognito)
    return context;
    // Option 2: use original (share with regular)
    // return profile->GetOriginalProfile();
    // Option 3: nullptr (no service for OTR)
    // return nullptr;
  }
  return context;
}

bool FooServiceFactory::ServiceIsCreatedWithBrowserContext() const {
  return false;   // Lazy creation (default)
  // return true; // Create immediately when profile created
}
```

## Using the service

```cpp
// In some other file
#include "chrome/browser/foo/foo_service.h"
#include "chrome/browser/foo/foo_service_factory.h"

void UseFoo(Profile* profile) {
  FooService* service = FooServiceFactory::GetForProfile(profile);
  if (!service) {
    // OTR with GetBrowserContextToUse returning nullptr
    return;
  }
  service->DoSomething();
}
```

`GetForProfile` returns:

- Existing service if already created.
- New service (created via `BuildServiceInstanceForBrowserContext`) on first call.
- `nullptr` if `GetBrowserContextToUse` returned nullptr.

## Dependency

If FooService depends on BarService:

```cpp
FooServiceFactory::FooServiceFactory()
    : BrowserContextKeyedServiceFactory(
          "FooService",
          BrowserContextDependencyManager::GetInstance()) {
  DependsOn(BarServiceFactory::GetInstance());
}
```

Effects:

- BarService created **before** FooService when needed.
- FooService::Shutdown() called **before** BarService::Shutdown() → FooService can still access Bar.
- FooService destroyed **before** BarService.

```cpp
// FooService can safely use BarService in ctor + Shutdown
FooService::FooService(Profile* profile) {
  bar_service_ = BarServiceFactory::GetForProfile(profile);
  bar_service_->RegisterObserver(this);
}

void FooService::Shutdown() {
  bar_service_->RemoveObserver(this);
  bar_service_ = nullptr;
}
```

## OTR (Incognito) behavior

Override `GetBrowserContextToUse`:

```cpp
content::BrowserContext* FooServiceFactory::GetBrowserContextToUse(
    content::BrowserContext* context) const {
  // OPTION A: Same as input (separate service for OTR)
  return context;

  // OPTION B: Always use original (share)
  return chrome::GetBrowserContextRedirectedInIncognito(context);

  // OPTION C: No service for OTR
  return chrome::GetBrowserContextOwnInstanceInIncognito(context)
      ? context
      : nullptr;
}
```

Decision based on feature semantics:

- Per-tab counter → separate (each OTR own).
- Read-only access to bookmarks → use original.
- Disable in incognito → nullptr.

## Other Factory overrides

```cpp
class FooServiceFactory : public BrowserContextKeyedServiceFactory {
 protected:
  // Create immediately on profile creation (eager)
  bool ServiceIsCreatedWithBrowserContext() const override { return true; }

  // Skip service in tests
  bool ServiceIsNULLWhileTesting() const override { return true; }

  // Register prefs (called once at startup)
  void RegisterProfilePrefs(
      user_prefs::PrefRegistrySyncable* registry) override {
    registry->RegisterIntegerPref(prefs::kFooCount, 0);
  }
};
```

## Multiple Factory types

`BrowserContextKeyedServiceFactory` for BrowserContext.

Variants:

- `RefcountedBrowserContextKeyedServiceFactory` — service is refcounted.
- `SimpleKeyedServiceFactory` — for non-Profile keys.

## Real example

`chrome/browser/bookmarks/bookmark_model_factory.h`:

```cpp
class BookmarkModelFactory : public BrowserContextKeyedServiceFactory {
 public:
  static BookmarkModel* GetForProfile(Profile* profile);
  static BookmarkModelFactory* GetInstance();

 private:
  friend class base::NoDestructor<BookmarkModelFactory>;
  BookmarkModelFactory();
  ~BookmarkModelFactory() override;

  std::unique_ptr<KeyedService> BuildServiceInstanceForBrowserContext(
      content::BrowserContext* context) const override;
  void RegisterProfilePrefs(
      user_prefs::PrefRegistrySyncable* registry) override;
  content::BrowserContext* GetBrowserContextToUse(
      content::BrowserContext* context) const override;
  bool ServiceIsCreatedWithBrowserContext() const override;
};
```

## Pattern variations

### Skip if profile not regular

```cpp
content::BrowserContext* GetBrowserContextToUse(
    content::BrowserContext* context) const override {
  Profile* profile = Profile::FromBrowserContext(context);
  if (!profile->IsRegularProfile()) return nullptr;
  return context;
}
```

### Eager creation (during profile init)

```cpp
bool ServiceIsCreatedWithBrowserContext() const override {
  return true;
}
```

Useful if service must observe early profile events.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Use other KeyedService in ctor without `DependsOn` | Crash if other not created yet | Declare `DependsOn` |
| Access destroyed service in dtor | UAF | Move cleanup to `Shutdown()` |
| Singleton non-thread-safe | Race | `base::NoDestructor` (thread-safe) |
| `GetForProfile(otr_profile)` when factory returns nullptr | crash on null | Check returned ptr |
| Service holds Profile pointer past Profile destruction | UAF | Profile dies last among its services (after Shutdown) — OK if you don't post async after Shutdown |
| Forget Shutdown to release references | Cycle / leak | Override Shutdown |
| Factory not registered | Service not created | Register in `EnsureBrowserContextKeyedServiceFactoriesBuilt()` |

## Service Factory registration

Service factory must be **instantiated once at startup** so it registers with `BrowserContextDependencyManager`:

```cpp
// chrome/browser/profiles/profile_keyed_service_factories.cc
// or chrome/browser/browser_keyed_service_factories.cc

void EnsureBrowserContextKeyedServiceFactoriesBuilt() {
  FooServiceFactory::GetInstance();
  BarServiceFactory::GetInstance();
  // ... all factories
}
```

This is called early in browser startup.

## Tóm tắt

| Concept | Take-away |
|---|---|
| `KeyedService` | Base class, per-profile service |
| `BrowserContextKeyedServiceFactory` | Singleton, manage instance per profile |
| `GetForProfile(profile)` | Lookup/create service |
| `DependsOn(factory)` | Declare service dependency |
| `Shutdown()` | Cleanup before destroyed |
| `GetBrowserContextToUse` | OTR behavior |
| `RegisterProfilePrefs` | Register prefs at startup |
| `base::NoDestructor` | Singleton thread-safe |

## Pattern thực tế

Standard Chromium service:

1. **Service class** derive `KeyedService`.
2. **Factory class** derive `BrowserContextKeyedServiceFactory`.
3. **Factory singleton** via `base::NoDestructor`.
4. **Register factory** in `EnsureBrowserContextKeyedServiceFactoriesBuilt`.
5. **Public API**: `Factory::GetForProfile(profile)` returns Service.
6. **Cleanup** in `Service::Shutdown()`.

Common cho mọi feature thêm vào Chrome.

## Exercise (optional)

1. Read `BookmarkModelFactory` source. Trace `BookmarkModel` creation.
2. Find feature using `DependsOn`. Note dependency order.
3. Create stub `FooService` + `FooServiceFactory`. Register and use.
4. Compare `ServiceIsCreatedWithBrowserContext` true vs false — when each appropriate.

---

**Bài kế tiếp** → [Bài 2: Prefs System (C++)](02-prefs-system-cpp.md)
