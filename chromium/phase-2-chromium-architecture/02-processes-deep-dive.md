# Bài 2: Đào sâu vào Browser và Renderer Process

## Browser Process — Bên trong

Browser process có nhiều **threads**:

```
Browser Process
├── UI Thread        ← Main thread, xử lý user input, manages tabs
├── IO Thread        ← Handles IPC messages đến/đi từ Renderer
├── DB Thread        ← Database operations (history, cookies)
└── [Nhiều worker threads khác]
```

**UI Thread** là thread quan trọng nhất trong Browser Process:
- Tạo và manage các `WebContents` (mỗi tab là một WebContents)
- Xử lý navigation
- Respond to Mojo IPC calls từ Renderer

### WebContents và RenderFrameHost

```
Browser Process
└── BrowserWindow
    └── TabStrip
        ├── Tab 1 → WebContents
        │           └── RenderFrameHost (main frame)
        │               └── RenderFrameHost (iframe)
        ├── Tab 2 → WebContents
        │           └── RenderFrameHost
        └── Tab 3 → WebContents (Samsung WebUI page)
                    └── RenderFrameHost
                        └── [Mojo pipe endpoint ở đây]
```

`RenderFrameHost` trong Browser Process là "đại diện" của một frame đang chạy trong Renderer Process. Khi WebUI JS gọi Mojo, message đến `RenderFrameHost` trước.

---

## Renderer Process — Bên trong

```
Renderer Process
├── Main Thread (Blink + V8)
│   ├── HTML parsing
│   ├── CSS cascade
│   ├── JavaScript execution  ← Polymer/LitElement code chạy đây
│   ├── Layout
│   └── Paint
├── Compositor Thread
│   └── Manages layer tree, handles scroll/animation
└── Worker Threads
    └── Web Workers, Service Workers
```

**Quan trọng:** JavaScript **single-threaded**. Tất cả JS code (bao gồm event handlers, Mojo callbacks, Polymer re-renders) chạy trên **main thread**.

---

## Life of a Mojo Call

Khi WebUI gọi `pageHandler.getSettings()`:

```
1. [Renderer - Main Thread]
   JS: const result = await pageHandler.getSettings();
   → Serialize thành Mojo message
   → Post lên Mojo pipe

2. [Mojo pipe]
   → Message được chuyển qua shared memory hoặc socket
   → Đến Browser Process IO Thread

3. [Browser Process - IO Thread]
   → Nhận message
   → Route đến đúng Receiver (SettingsPageHandler)

4. [Browser Process - UI Thread]
   → SettingsPageHandler::GetSettings() được gọi
   → Đọc settings từ PrefService (in-memory preferences)
   → Serialize kết quả thành Mojo response

5. [Mojo pipe - ngược lại]
   → Response về Renderer Process

6. [Renderer - Main Thread]
   → Promise resolves
   → await tiếp tục
   → result = { theme: 'dark', fontSize: 14, ... }
```

Toàn bộ quá trình này xảy ra **bất đồng bộ** — JavaScript không block trong khi chờ response. Đó là lý do API là async/await.

---

## WebUI là "Privileged Renderer"

WebUI pages (chrome://, samsung://) khác với web pages thông thường:

| | Web Page | WebUI Page |
|--|---------|-----------|
| Origin | https://... | chrome://... |
| Sandbox | Có (strict) | Có (nhưng cho phép Mojo) |
| Trusted | Không | Có |
| Mojo access | Bị chặn | Được phép |
| File access | Không | Không (vẫn qua Mojo) |

WebUI pages được trust vì chúng là **built-in** resources, không phải từ internet. Browser Process kiểm tra origin trước khi cho phép Mojo connections.

```cpp
// Browser Process kiểm tra này (C++ code)
void SettingsUI::BindInterface(
    const std::string& interface_name,
    mojo::ScopedMessagePipeHandle pipe) {

  // Chỉ cho phép nếu đây là WebUI page hợp lệ
  if (interface_name == mojom::PageHandler::Name_) {
    page_handler_factory_receiver_.Bind(
        mojo::PendingReceiver<mojom::PageHandlerFactory>(std::move(pipe)));
  }
}
```

---

## Blink — Rendering Engine

Blink là rendering engine trong Renderer Process (fork của WebKit năm 2013):

```
Input: HTML + CSS + JS
         ↓
    HTML Parser → DOM Tree
    CSS Parser  → CSSOM Tree
         ↓
    Style Resolution → Computed Styles
         ↓
    Layout Tree (xác định vị trí, kích thước)
         ↓
    Paint (vẽ từng element)
         ↓
    Compositor (tổng hợp layers)
         ↓
Output: Pixels (gửi đến GPU Process)
```

**Polymer/LitElement** hoạt động ở tầng **DOM Tree** — chúng manipulate DOM, Blink lo phần còn lại.

---

## V8 — JavaScript Engine

V8 là JavaScript engine của Google, chạy trong Renderer Process:

- **JIT compilation**: Compile JS thành native machine code khi chạy
- **Garbage Collection**: Tự động quản lý memory
- **Isolates**: Mỗi Renderer có V8 isolate riêng

Khi bạn viết Polymer component, V8 thực thi code đó. Mojo JS bindings cũng là JS code được V8 chạy.

---

## Sandbox: Làm thế nào hoạt động?

Chromium dùng OS-level sandboxing:

**Linux:** seccomp-bpf filter — chặn system calls nguy hiểm
**Windows:** Job Objects + Restricted Token
**macOS:** App Sandbox

```
Renderer Process muốn đọc file:
   read('/etc/passwd')
        ↓ (system call)
   Kernel intercepts → BLOCKED by seccomp
        ↓
   SIGSYS signal
        ↓
   Crash (intentional)
```

Muốn đọc file, Renderer phải nhờ Browser Process qua Mojo:
```javascript
// Không thể làm trực tiếp — phải nhờ qua Mojo
const { content } = await fileReader.readFile(path);
```

---

## Memory Model

Mỗi Renderer Process có memory space riêng:

```
Browser Process Memory:  [A][B][C][D][E]...
Renderer Process Memory: [X][Y][Z]...
                          ↑
                    Không thể đọc memory của Browser!
```

Mojo IPC copy data giữa processes (hoặc dùng shared memory cho data lớn).

---

## Debugging Chromium Processes

```bash
# Xem các processes Chromium đang chạy
ps aux | grep chrome

# Chrome DevTools: chrome://inspect/#workers
# Để inspect Renderer Process của WebUI page

# Chromium command line flags hữu ích khi develop:
chrome --renderer-startup-dialog    # Pause renderer để attach debugger
chrome --no-sandbox                 # Disable sandbox (CHỈ để debug, KHÔNG dùng production)
chrome --enable-logging --v=1       # Verbose logging
```

Trong Samsung Browser, bạn có thể mở DevTools cho WebUI pages bằng cách right-click → Inspect (nếu được enable trong build).

---

→ [Bài tiếp theo: IPC Concepts](03-ipc-concepts.md)
