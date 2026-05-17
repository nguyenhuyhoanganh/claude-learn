# Bài 3: IPC Concepts — Nền tảng trước khi học Mojo

## IPC là gì?

**Inter-Process Communication (IPC)** — cơ chế để các process khác nhau giao tiếp.

Vì processes có memory space riêng biệt, chúng không thể đọc biến của nhau. Cần một "kênh" để trao đổi dữ liệu.

---

## Các loại IPC trong Chromium

Chromium có **lịch sử IPC** phức tạp:

### 1. Legacy IPC (IPC::Channel) — Cũ, đang bị loại bỏ

```
Format: IPC_MESSAGE_CONTROL1(ViewHostMsg_Foo, int)
File: messages.h
```

Được dùng từ 2008. Không type-safe, khó maintain. Đang được migrate sang Mojo.

### 2. Mojo — Hiện tại và tương lai

```
Format: .mojom IDL files
Generated: C++ và JS bindings tự động
```

Type-safe, có thể dùng từ cả C++ và JavaScript. **Đây là cái bạn sẽ làm việc.**

---

## Mojo Primitives — 3 khái niệm cốt lõi

### Message Pipe

Hai đầu của một kênh giao tiếp hai chiều:

```
┌─────────────────┐         ┌─────────────────┐
│    Process A    │         │    Process B    │
│                 │         │                 │
│   [Endpoint 0] ◄──────────► [Endpoint 1]   │
│                 │         │                 │
└─────────────────┘         └─────────────────┘
```

Message pipe là **low-level primitive**. Bạn ít khi dùng trực tiếp.

### Interface (Mojom Interface)

Định nghĩa **tập hợp các methods** mà một bên có thể gọi:

```
interface Settings {
  GetTheme() => (string theme);
  SetTheme(string theme);
}
```

Compile thành bindings cho C++ và JS.

### Remote và Receiver

Đây là 2 đầu của một Mojo interface connection:

```
         Renderer Process              Browser Process
         ─────────────────            ─────────────────
                                      implements Settings {
  Remote<Settings>                      GetTheme() { ... }
  (gọi methods)          ◄────────►     SetTheme() { ... }
                          message pipe  }
                                      Receiver<Settings>
                                      (nhận method calls)
```

- **Remote** = client side, **gọi** methods
- **Receiver** = server side, **implement** methods

---

## Pending Remote và Pending Receiver

Khi tạo connection, cần truyền endpoint qua IPC trước khi bind:

```
Renderer                         Browser
   │                                │
   │  Create pipe:                  │
   │  PendingRemote<Settings> ──────►  (gửi qua Mojo bootstrap)
   │  PendingReceiver<Settings>     │
   │                                │  BindReceiver(pending_receiver)
   │  BindRemote(pending_remote)    │  → Receiver<Settings> active
   │  → Remote<Settings> active    │
   │                                │
   │  remote.GetTheme()  ──────────►│  OnGetTheme() được gọi
   │  ◄──────────────────────────── │  Trả về theme
```

Trong JS (WebUI side):
```javascript
// 'pending_remote' đã được tạo và gửi qua
const remote = SettingsRemote();
// hoặc
const remote = new SettingsMojoRemote();
remote.$.bindNewPipeAndPassReceiver(); // tạo pipe, gửi receiver sang C++
```

---

## Data Types trong Mojo

Mojo IDL có các types cơ bản:

```mojom
// Primitive types
bool
int8, int16, int32, int64
uint8, uint16, uint32, uint64
float, double
string

// Nullable types (có thể null)
string?
int32?

// Composite types
array<T>          → JS Array
map<K, V>         → JS Map
struct Foo { ... } → JS object

// Handles (cross-process references)
pending_remote<T>    → Một đầu của pipe, chưa được bind
pending_receiver<T>  → Đầu còn lại
```

---

## Synchronous vs Asynchronous

**Tất cả Mojo calls từ JS đều bất đồng bộ (async)**. Không có sync Mojo calls trong renderer.

Lý do: sync calls sẽ **block main thread**, làm UI bị đơ.

```javascript
// ❌ Không tồn tại — không có sync Mojo call từ JS
const theme = pageHandler.getThemeSync();

// ✅ Đúng — async
const { theme } = await pageHandler.getTheme();

// ✅ Hoặc với callback style (cũ hơn)
pageHandler.getTheme().then(({ theme }) => {
  applyTheme(theme);
});
```

Trong C++, có thể có sync calls giữa các trusted processes, nhưng không phải từ renderer.

---

## Observer Pattern trong Mojo

Nhiều features cần "push" updates từ Browser sang WebUI (thay vì WebUI phải poll):

```mojom
// Browser gọi methods trên WebUI (ngược lại với pattern thông thường)
interface SettingsPageObserver {
  OnThemeChanged(string new_theme);
  OnSettingsReset();
};

interface SettingsPageHandler {
  GetSettings() => (Settings settings);
  // WebUI đăng ký observer
  SetObserver(pending_remote<SettingsPageObserver> observer);
};
```

```javascript
// JavaScript side
class MyPageObserver {
  onThemeChanged(newTheme) {
    this.updateThemeUI(newTheme);
  }
  onSettingsReset() {
    this.resetUI();
  }
}

// Đăng ký observer
const observer = new MyPageObserver();
const receiver = new SettingsPageObserverReceiver(observer);
pageHandler.setObserver(receiver.$.bindNewPipeAndPassRemote());
```

Đây là pattern **rất phổ biến** trong Chromium WebUI — Browser push events xuống JS.

---

## Mojo vs WebSockets vs fetch()

| | Mojo | WebSockets | fetch() |
|--|------|-----------|--------|
| Mục đích | Browser-internal IPC | Real-time web | HTTP requests |
| Từ WebUI | Có | Không (sandboxed) | Qua Network Service |
| Type-safe | Có (IDL) | Không | Không |
| Cross-process | Có | Có | Có |
| Latency | ~microseconds | ~milliseconds | ~milliseconds |

Mojo không phải network — đây là **in-process/between-process messaging** rất nhanh, chạy qua shared memory hoặc Unix socket.

---

## Tóm tắt: Key Concepts

```
Interface     = Hợp đồng (tập methods)
Remote        = Client (gọi methods)
Receiver      = Server (implement methods)
Message Pipe  = Kênh giao tiếp
.mojom file   = IDL định nghĩa interface
Generated JS  = .mojom-webui.js file (auto-generated)
```

Bây giờ bạn đã hiểu **tại sao** cần Mojo. Phase 5 sẽ dạy **cách dùng** chi tiết.

---

→ [Phase 3: Polymer](../phase-3-polymer/01-polymer-intro.md)
