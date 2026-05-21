# Bài 3: Services Architecture

Bài này dạy:
- Mojo services overview: service per-feature, separate process.
- Content services (`services/`): network, audio, video_capture, storage.
- Out-of-process services: sandbox motivation, attack surface reduction.
- Service Manager (legacy) vs current pattern.
- Utility process: when to use, restrictions.

Kết thúc bài: bạn hiểu services architecture, biết khi nào dùng utility process, đọc được code interact với out-of-process service.

Prerequisite: [chromium/phase-6](../../chromium/phase-6-mojo-ipc/01-mojo-overview.md) (Mojo).

## Tại sao Services?

Trước: monolithic browser process — everything trong 1 process.

Vấn đề:

- 1 bug → crash entire browser.
- 1 vulnerability → escape to read everything.
- Hard to sandbox subsystems independently.

Solution: **services** = isolated functional units, có thể run trong separate process.

```text
Browser Process
   ↓ Mojo
Network Service (separate process, sandboxed)
   ↓ Mojo
URLLoaderFactory, CookieManager, etc.
```

## Services trong `services/`

```text
services/
├── network/         ← Network service (URL loading, cookies, DNS)
├── audio/           ← Audio service (record, playback)
├── video_capture/   ← Video capture (webcam)
├── tracing/         ← Performance tracing
├── storage/         ← Storage (cache, filesystem)
├── data_decoder/    ← Image/JSON decode (sandbox decoder)
├── device/          ← Device APIs (battery, sensors)
├── viz/             ← Viz compositor (display)
├── metrics/         ← Histogram collection
└── ...
```

Each service:

- Has Mojo interface in `services/<name>/public/mojom/`.
- Has implementation in `services/<name>/`.
- Can run in dedicated process or shared utility process.

## Architecture overview

```text
┌────────────────────────────────────────┐
│  Browser Process                        │
│  - chrome/, content/                    │
│  - Service clients via Mojo             │
└────────────────────────────────────────┘
        ↓ Mojo IPC over pipes
┌────────────────────────────────────────┐
│  Service Process (utility process)      │
│  - 1 or more services hosted            │
│  - Sandboxed                            │
└────────────────────────────────────────┘
```

Each service:

- **Public interface** (Mojo .mojom).
- **Implementation**.
- **Embedder** specifies process: in-process, dedicated process, shared utility.

## Network Service example

Mojom interface (`services/network/public/mojom/`):

```python
// network_service.mojom
interface NetworkService {
  CreateNetworkContext(
      pending_receiver<NetworkContext> context,
      NetworkContextParams params);

  // ... many more
};
```

Client (browser):

```cpp
// content/browser/network_service_instance.cc
mojo::Remote<network::mojom::NetworkService> network_service =
    GetNetworkServiceRemote();

network_service->CreateNetworkContext(
    network_context.BindNewPipeAndPassReceiver(),
    std::move(params));
```

Service runs in separate process. Browser talks to it via Mojo pipe.

## Utility process

Generic process type for hosting services:

```text
Utility Process:
- Sandboxed.
- Hosts 1 or more services.
- Can have custom sandbox profile.
- Restart on crash (browser policy).
```

Each service decide whether:

- Run in-process (no isolation, fast).
- Run in dedicated utility process (isolation, restart).
- Share utility process with other services (cost balance).

### Why sandbox utility process?

Network service handles **untrusted data** from internet. If bug → attacker controls process. But sandbox limits damage:

- No file system access (except whitelist).
- No network beyond what's needed.
- No spawn child process.
- Etc.

→ Compromise mitigation.

## Service Manager (legacy)

Earlier design: central "service manager" that brokers service connections.

```text
Browser → Service Manager → Network Service
                ↓
                → Other services
```

Removed in 2020+ for complexity reasons. Now: services launched directly by content layer (`ServiceProcessHost`).

Code in `services/service_manager/` mostly removed; few legacy traces in `chrome/browser/`.

## `ServiceProcessHost`

Modern API to launch utility process running service:

```cpp
mojo::Remote<my_service::mojom::MyService> remote;
content::ServiceProcessHost::Launch(
    remote.BindNewPipeAndPassReceiver(),
    content::ServiceProcessHost::Options()
        .WithDisplayName("My Service")
        .Pass());

// Now remote is connected to service in utility process
remote->DoSomething(args);
```

### Custom sandbox

```cpp
content::ServiceProcessHost::Launch(
    remote.BindNewPipeAndPassReceiver(),
    content::ServiceProcessHost::Options()
        .WithSandboxType(sandbox::mojom::Sandbox::kService)
        .Pass());
```

Sandbox types defined in `sandbox/policy/mojom/sandbox.mojom`.

## In-process vs out-of-process

```cpp
// In-process — same process as caller
class MyServiceImpl : public my_service::mojom::MyService {
  void DoSomething(...) override { ... }
};

mojo::Receiver<my_service::mojom::MyService> receiver{&impl};

// Connect via direct binding
remote.Bind(receiver.BindNewPipeAndPassRemote());
```

When in-process OK:

- No untrusted input.
- Performance critical.
- No sandbox needed.

```cpp
// Out-of-process via ServiceProcessHost
mojo::Remote<my_service::mojom::MyService> remote;
content::ServiceProcessHost::Launch(
    remote.BindNewPipeAndPassReceiver(), options);
```

When out-of-process required:

- Untrusted input (network, file).
- Need sandbox.
- Optional restart on crash.
- Code with poor security history (decoders).

## Real Chromium services

### Network Service

- Handle all HTTP/HTTPS, cookies, DNS.
- Sandboxed.
- Restart on crash → user not lose browsing.

### Audio Service

- Audio capture/playback.
- Sandboxed.

### Data Decoder

- JSON parse, image decode (PNG, JPEG, WebP, GIF).
- Untrusted input → sandbox to limit decoder vulnerabilities.

```cpp
data_decoder::DataDecoder::ParseJsonIsolated(
    json_string,
    base::BindOnce(&OnParsed));
```

Each call may spawn new utility process for isolation.

### Storage Service (Quota)

- Manage storage quota per origin.
- File system access.

### Video Capture

- Webcam capture.
- Sandboxed per camera device.

## Mojo interfaces — service boundary

`services/<name>/public/mojom/` defines public API.

```python
// data_decoder/public/mojom/json_parser.mojom
interface JsonParser {
  Parse(string json) => (Result result);
};

struct Result {
  ResultValue value;
  string? error;
};

union ResultValue {
  bool bool_val;
  double double_val;
  int64 int_val;
  string string_val;
  array<ResultValue> list_val;
  map<string, ResultValue> dict_val;
};
```

Cross-process: Mojo IDL → C++ binding generated.

## Service consumer pattern

```cpp
class MyFeature {
 public:
  MyFeature() {
    LaunchService();
  }

  void DoWork(const std::string& input) {
    if (!remote_) {
      LaunchService();
    }
    remote_->Process(input,
                      base::BindOnce(&MyFeature::OnDone,
                                     weak_factory_.GetWeakPtr()));
  }

 private:
  void LaunchService() {
    content::ServiceProcessHost::Launch(
        remote_.BindNewPipeAndPassReceiver(),
        content::ServiceProcessHost::Options()
            .WithDisplayName("My Service")
            .Pass());

    // Detect disconnect (service crashed/killed)
    remote_.set_disconnect_handler(
        base::BindOnce(&MyFeature::OnDisconnect,
                       weak_factory_.GetWeakPtr()));
  }

  void OnDisconnect() {
    remote_.reset();
    // Optionally relaunch
  }

  void OnDone(Result result) { ... }

  mojo::Remote<my_service::mojom::MyService> remote_;
  base::WeakPtrFactory<MyFeature> weak_factory_{this};
};
```

Common pattern:

1. Launch service via `ServiceProcessHost`.
2. Use remote to call methods.
3. Handle disconnect (service may crash).
4. Relaunch on demand.

## Service lifecycle

```text
First use → Launch utility process → Service start
   ↓
Idle for N min → Service may shutdown (configurable)
   ↓
Next use → Relaunch
```

Services may have idle timeout — auto-shutdown to free memory. Reuse process if multiple clients.

## Pros/cons of out-of-process

| Pro | Con |
|---|---|
| Sandbox security | IPC overhead |
| Crash isolation | Memory cost (per process) |
| Restartable | Complexity |
| Easier to audit | More moving parts |

Choose carefully — not everything needs out-of-process.

## Chromium architectural trends

- Move more to services (decompose monolith).
- Sandbox aggressively.
- Decouple via Mojo (replace direct in-process call).

But: don't over-decompose — overhead can dominate. Decisions per feature.

## Sandboxing types

Defined in `sandbox/policy/mojom/sandbox.mojom`:

| Sandbox | Use |
|---|---|
| `kNoSandbox` | Trusted, full privilege |
| `kRenderer` | Web content (most restrictive) |
| `kUtility` | Generic utility |
| `kGpu` | GPU operations |
| `kNetwork` | Network service |
| `kAudio` | Audio service |
| `kVideoCapture` | Webcam |
| `kPrintCompositor` | Print rendering |
| Etc. |

Each profile = different OS API restrictions.

## Pattern thực tế

### Browser → Service (one-time)

```cpp
data_decoder::DataDecoder::ParseJsonIsolated(
    json_text,
    base::BindOnce([](base::expected<base::Value, std::string> result) {
      if (result.has_value()) {
        // Use parsed JSON
      } else {
        LOG(ERROR) << "Parse failed: " << result.error();
      }
    }));
```

Library handle service launch, isolated process per call.

### Long-lived service connection

```cpp
class FooManager {
 public:
  FooManager() {
    content::ServiceProcessHost::Launch(
        remote_.BindNewPipeAndPassReceiver(),
        content::ServiceProcessHost::Options()
            .WithDisplayName("Foo Service")
            .Pass());

    remote_.set_disconnect_handler(
        base::BindOnce(&FooManager::OnServiceCrashed,
                       weak_factory_.GetWeakPtr()));
  }

  void DoFoo(int arg) {
    remote_->DoFoo(arg);
  }

 private:
  void OnServiceCrashed() {
    // Relaunch logic
  }

  mojo::Remote<my::mojom::FooService> remote_;
  base::WeakPtrFactory<FooManager> weak_factory_{this};
};
```

Keep remote alive for life of manager.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Forget disconnect handler | Silent service crash | Set `set_disconnect_handler` |
| Sync call cross-process | Deadlock | Always async |
| Heavy data over Mojo | Slow IPC | Use shared memory, data pipe |
| Hold remote with WeakPtr in dtor | UAF | Hold mojo::Remote in member |
| Trust untrusted data without validation | Sandbox bypass | Validate everything from service |
| Over-decompose (every class own service) | Performance bad | Choose carefully |
| Pre-launch service eagerly | Wasted memory | Launch on first use |

## Tóm tắt

| Concept | Take-away |
|---|---|
| Service | Functional unit, can be in/out-of-process |
| `services/` | Top-level services in Chromium |
| Utility process | Sandboxed generic process hosting services |
| Out-of-process | Sandbox + crash isolation |
| `ServiceProcessHost::Launch` | Spawn service in utility |
| Sandbox type | OS-level restrictions per sandbox profile |
| Disconnect handler | Detect service crash |

## Famous Chromium services

| Service | Location |
|---|---|
| Network | `services/network/` |
| Audio | `services/audio/` |
| Video capture | `services/video_capture/` |
| Data decoder | `services/data_decoder/` |
| Storage | `services/storage/` |
| Tracing | `services/tracing/` |
| Viz | `services/viz/` |
| Device | `services/device/` |

## Exercise (optional)

1. Find `services/network/` BUILD. Trace mojom interface declaration.
2. Find `data_decoder::DataDecoder::ParseJsonIsolated` usage. Trace service launch.
3. Read sandbox policy for network service. Note restrictions.
4. Trace: feature in browser → ServiceProcessHost::Launch → utility process spawn → Mojo call.

---

**Phase kế** → [Phase 5: Testing](../phase-5-testing/01-unit-tests-gtest.md)
