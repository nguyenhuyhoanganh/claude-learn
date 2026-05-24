# Bài 3: URL Loading và Network

Bài này dạy:
- `URLLoader` / `URLLoaderFactory`: Mojo interface cho network request.
- `ResourceRequest`: URL, method, headers, body.
- Network Service architecture: tách process, sandbox.
- `SimpleURLLoader`: convenience wrapper cho fetch đơn giản.
- Cookie + storage access intro (overview only).

Kết thúc bài: bạn dùng được `SimpleURLLoader` cho HTTP fetch, hiểu network stack architecture, biết network service là gì.

## Network architecture overview

```text
Browser Process              Network Service Process
   ↓                              ↓
URLLoaderFactory  ─ Mojo ─→  network::URLLoaderFactoryImpl
   ↓                              ↓
URLLoader        ─ Mojo ─→  network::URLLoaderImpl
                                  ↓
                              HTTP stack (Net library)
                                  ↓
                              Socket / TCP / TLS / DNS
                                  ↓
                              OS network APIs
```

Mojo interfaces cross process boundary.

### Network Service (separate process)

Until ~2018, network code ran in browser process. Now: **Network Service** = separate sandboxed process.

Benefits:

- Sandbox: network code can't read browser state directly.
- Crash isolation.
- Restart on crash.

Implementation in `services/network/`.

### Why URLLoader?

Earlier: `URLRequest` direct API. Now: `URLLoader` Mojo interface — async, cross-process safe.

```text
//net/url_request/      ← Low-level HTTP stack (in network service)
//services/network/     ← Network service (URLLoaderFactory, etc.)
//content/.../url_loader_factory ← Browser-side bridge
```

## `URLLoaderFactory`

```cpp
namespace network {
namespace mojom {

interface URLLoaderFactory {
  CreateLoaderAndStart(
      pending_receiver<URLLoader> loader,
      int32 request_id,
      uint32 options,
      ResourceRequest request,
      pending_remote<URLLoaderClient> client,
      MutableNetworkTrafficAnnotationTag annotation);
  // ...
};

}  // namespace mojom
}  // namespace network
```

Factory pattern: create URLLoader per request.

### Get URLLoaderFactory

```cpp
// From browser process
network::mojom::URLLoaderFactory* factory = ...;
// e.g., from StoragePartition:
auto* sp = browser_context->GetDefaultStoragePartition();
network::mojom::URLLoaderFactory* shared_factory =
    sp->GetURLLoaderFactoryForBrowserProcess().get();
```

Each `BrowserContext` (profile) has factory — separate from extensions, etc.

## `ResourceRequest`

```cpp
struct ResourceRequest {
  GURL url;
  std::string method;          // "GET", "POST", ...
  net::HttpRequestHeaders headers;
  std::string request_body;    // For POST
  url::Origin request_initiator;
  // ... many fields
};
```

Request structure passed to URLLoader.

## `URLLoader`

```cpp
interface URLLoader {
  FollowRedirect(...);   // Continue redirect
  CancelLoading();
  // ...
};

interface URLLoaderClient {   // Callbacks from loader
  OnReceiveResponse(URLResponseHead head, ...);
  OnReceiveRedirect(...);
  OnDataAvailable(ScopedDataPipeConsumerHandle body);
  OnComplete(URLLoaderCompletionStatus status);
  // ...
};
```

Pattern: caller create URLLoader + URLLoaderClient pair. URLLoader runs request, URLLoaderClient receives events.

## `SimpleURLLoader` — easy API

`SimpleURLLoader` wraps URLLoader for common cases:

```cpp
#include "services/network/public/cpp/simple_url_loader.h"

void FetchUrl(network::mojom::URLLoaderFactory* factory) {
  auto request = std::make_unique<network::ResourceRequest>();
  request->url = GURL("https://example.com/api/data");
  request->method = "GET";

  auto url_loader = network::SimpleURLLoader::Create(
      std::move(request),
      net::DefineNetworkTrafficAnnotation("my_request", R"(
        semantics {
          description: "Fetches data for my feature."
        }
        // ... required annotation
      )"));

  url_loader->DownloadToString(
      factory,
      base::BindOnce(&OnDownloadDone),
      /*max_body_size=*/1024 * 1024);   // 1MB limit
}

void OnDownloadDone(std::unique_ptr<std::string> body) {
  if (body) {
    LOG(INFO) << "Got: " << *body;
  } else {
    LOG(ERROR) << "Download failed";
  }
}
```

`SimpleURLLoader` handles:

- Redirect.
- Buffering response body.
- Lifetime (delete itself or self-own).
- Callback.

### Common patterns

```cpp
// Download to string (up to size limit)
url_loader->DownloadToString(factory, callback, max_size);

// Download to file
url_loader->DownloadToFile(factory, callback, file_path);

// Stream response body
url_loader->DownloadAsStream(factory, stream_consumer);
```

### Cancel

```cpp
url_loader.reset();    // Just destroy → cancel
```

`unique_ptr` destruction cancels in-flight request.

### Async pattern with WeakPtr

```cpp
class MyHandler {
 public:
  void StartFetch(network::mojom::URLLoaderFactory* factory) {
    auto request = std::make_unique<network::ResourceRequest>();
    request->url = url_;
    url_loader_ = network::SimpleURLLoader::Create(
        std::move(request), kTrafficAnnotation);

    url_loader_->DownloadToString(
        factory,
        base::BindOnce(&MyHandler::OnDone, weak_factory_.GetWeakPtr()),
        kMaxSize);
  }

  void OnDone(std::unique_ptr<std::string> body) {
    if (body) {
      Use(*body);
    }
    url_loader_.reset();   // Cleanup
  }

 private:
  GURL url_;
  std::unique_ptr<network::SimpleURLLoader> url_loader_;
  base::WeakPtrFactory<MyHandler> weak_factory_{this};
};
```

Standard pattern: own loader, callback with WeakPtr.

## Net Annotation

```cpp
constexpr net::NetworkTrafficAnnotationTag kTrafficAnnotation =
    net::DefineNetworkTrafficAnnotation("foo_fetch", R"(
      semantics {
        sender: "Foo Service"
        description: "Fetches Foo data periodically."
        trigger: "When app starts."
        data: "URL and timestamp."
        destination: WEBSITE
      }
      policy {
        cookies_allowed: NO
        setting: "Not user-controllable."
      }
    )");
```

**Required** for every network request. Documents data usage, privacy policy.

Annotation processed by lint to ensure correct format + tracked for privacy review.

## Authentication, cookies

`SimpleURLLoader` defaults:

- Send cookies for URL's origin.
- Follow redirect within same eTLD+1.

For custom cookie behavior:

```cpp
auto request = std::make_unique<network::ResourceRequest>();
request->credentials_mode = network::mojom::CredentialsMode::kInclude;
// Or kOmit, kSameOrigin, etc.
```

## NetworkContext

```cpp
network::mojom::NetworkContext* nc = sp->GetNetworkContext();

// Get URLLoaderFactory for browser process
mojo::PendingRemote<network::mojom::URLLoaderFactory> factory;
network::mojom::URLLoaderFactoryParamsPtr params = ...;
nc->CreateURLLoaderFactory(factory.InitWithNewPipeAndPassReceiver(),
                            std::move(params));
```

`NetworkContext` = network state for 1 profile (cookies, HTTP cache, certificates).

## Error handling

```cpp
void OnDone(std::unique_ptr<std::string> body) {
  if (!body) {
    // Failed — check error code
    int net_error = url_loader_->NetError();   // net::Error
    int http_code = url_loader_->ResponseInfo()
        ? url_loader_->ResponseInfo()->headers->response_code()
        : 0;
    LOG(ERROR) << "Failed: net_err=" << net::ErrorToString(net_error)
               << " http=" << http_code;
    return;
  }
  // Success: body has response
}
```

Net errors: `net::ERR_*` constants. Examples:

- `ERR_INTERNET_DISCONNECTED`.
- `ERR_NAME_NOT_RESOLVED`.
- `ERR_CERT_AUTHORITY_INVALID`.
- `ERR_TIMED_OUT`.

## Higher-level: `network::PrefetchURLLoaderService`, others

Many higher-level abstractions on top of URLLoader for specific features. Beyond scope.

## Real example

```cpp
// chrome/browser/foo/foo_uploader.h
class FooUploader {
 public:
  FooUploader(Profile* profile);
  ~FooUploader();

  void Upload(const std::string& data,
              base::OnceCallback<void(bool)> on_done);

 private:
  void OnUploadDone(base::OnceCallback<void(bool)> on_done,
                    std::unique_ptr<std::string> response_body);

  Profile* profile_;
  std::unique_ptr<network::SimpleURLLoader> url_loader_;
  base::WeakPtrFactory<FooUploader> weak_factory_{this};
};
```

```cpp
// foo_uploader.cc
void FooUploader::Upload(const std::string& data,
                         base::OnceCallback<void(bool)> on_done) {
  auto request = std::make_unique<network::ResourceRequest>();
  request->url = GURL("https://upload.example.com/api");
  request->method = "POST";
  request->headers.SetHeader("Content-Type", "application/json");

  url_loader_ = network::SimpleURLLoader::Create(
      std::move(request), kTrafficAnnotation);
  url_loader_->AttachStringForUpload(data, "application/json");

  auto* factory = profile_->GetDefaultStoragePartition()
      ->GetURLLoaderFactoryForBrowserProcess()
      .get();

  url_loader_->DownloadToString(
      factory,
      base::BindOnce(&FooUploader::OnUploadDone,
                     weak_factory_.GetWeakPtr(),
                     std::move(on_done)),
      /*max_body_size=*/64 * 1024);
}

void FooUploader::OnUploadDone(base::OnceCallback<void(bool)> on_done,
                               std::unique_ptr<std::string> response_body) {
  bool success = (response_body != nullptr);
  std::move(on_done).Run(success);
  url_loader_.reset();
}
```

Pattern complete: factory get → SimpleURLLoader → callback.

## Cookies (high-level overview)

Cookies stored per-`StoragePartition`. Access:

```cpp
// CookieManager Mojo interface
network::mojom::CookieManager* cm = sp->GetCookieManagerForBrowserProcess();
cm->GetCookieList(url, options, cookie_partition_key,
                  base::BindOnce(&OnCookies));
```

Complex API — typical features use `URLLoader` which auto-handle cookies.

## Local storage / IndexedDB

Browser-side access uncommon — these are renderer-facing. Web pages access via Web API.

If needed (rare):

- `StoragePartition::GetDOMStorageContext` for LocalStorage.
- `StoragePartition::GetIndexedDBContext` for IndexedDB.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Forget traffic annotation | Build fail | Define `net::NetworkTrafficAnnotationTag` |
| Sync wait for network | UI freeze, deadlock | Always async |
| Don't check `body != nullptr` | Crash | Check before use |
| Use without WeakPtr/own loader | UAF | Own loader + WeakPtr callback |
| Wrong factory (no auth, wrong profile) | Wrong cookies / no creds | Use profile's factory |
| Too large response | OOM | `max_body_size` param |
| Forget URLLoaderFactory binding lifetime | Disconnect mid-request | Hold remote alive |

## Tóm tắt

| Concept | Take-away |
|---|---|
| Network Service | Separate sandboxed process |
| `URLLoaderFactory` | Mojo interface, create URLLoader |
| `URLLoader` | 1 request, async |
| `SimpleURLLoader` | Easy wrapper (use this!) |
| `ResourceRequest` | URL, method, headers, body |
| `NetworkTrafficAnnotationTag` | Required documentation |
| `NetworkContext` | Cookies + cache per profile |
| Get factory from `StoragePartition` | Profile-aware |

## Exercise (optional)

1. Find 1 use of `SimpleURLLoader` in chrome/browser/. Trace flow.
2. Read net traffic annotation example. Understand fields.
3. Trace from `BrowserContext::GetDefaultStoragePartition()` → `GetURLLoaderFactoryForBrowserProcess()`.
4. Compare: legacy `URLFetcher` (deprecated) vs modern `SimpleURLLoader`.

---

**Phase kế** → [Phase 4: Services và Subsystems](../phase-4-services-and-subsystems/01-keyed-service-pattern.md)
