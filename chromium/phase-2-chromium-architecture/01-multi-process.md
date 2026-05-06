# Bài 1: Multi-Process Architecture

## Tại sao Chromium dùng nhiều process?

Trình duyệt đời đầu (như IE6) chạy một process duy nhất. Vấn đề:

- Một tab crash → **toàn bộ browser crash**
- Một tab bị exploit → attacker có quyền truy cập **mọi thứ** trên máy
- Một tab bị memory leak → **toàn bộ browser bị chậm**

Chromium giải quyết bằng cách dùng nhiều process riêng biệt.

---

## Kiến trúc process của Chromium

```
┌────────────────────────────────────────────────────┐
│                  Browser Process                    │
│  (Một process duy nhất)                            │
│                                                    │
│  • Quản lý UI của browser (toolbar, tabs)          │
│  • Network requests                                │
│  • File system access                              │
│  • Database (cookies, history, bookmarks)          │
│  • Spawning renderer processes                     │
└──────┬──────────────┬────────────────┬─────────────┘
       │ IPC          │ IPC            │ IPC
┌──────▼──────┐ ┌─────▼──────┐ ┌──────▼──────┐
│  Renderer   │ │  Renderer  │ │  Renderer   │
│  Process 1  │ │  Process 2 │ │  Process 3  │
│             │ │            │ │             │
│  Tab A      │ │  Tab B     │ │  WebUI      │
│  (web page) │ │  (web page)│ │  pages      │
└─────────────┘ └────────────┘ └─────────────┘

Ngoài ra còn có:
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   GPU       │  │   Network   │  │   Storage   │
│  Process    │  │   Service   │  │   Service   │
└─────────────┘  └─────────────┘  └─────────────┘
```

---

## Browser Process — "Trái tim" của Chromium

Browser process là process duy nhất có quyền truy cập hệ thống đầy đủ. Nó:

- **Không render web content** — chỉ render UI của browser (chrome)
- Quản lý vòng đời của tất cả processes khác
- Là người "duy nhất" có thể nói chuyện với OS

Trong Samsung Browser context, **tất cả native C++ backend** chạy ở đây:
- Settings storage
- Bookmark management
- Download management
- Theme engine
- Samsung-specific features

---

## Renderer Process — Nơi WebUI chạy

Renderer process chạy trong **sandbox** — bị cô lập khỏi OS:

```
Renderer Process (sandboxed)
├── Không thể đọc file hệ thống
├── Không thể tạo network connections trực tiếp
├── Không thể access hardware
└── Chỉ có thể "xin" Browser Process làm thay
```

Đây là nơi:
- Blink (rendering engine, fork của WebKit) chạy
- V8 JavaScript engine chạy
- **WebUI pages của bạn chạy** (Polymer/LitElement components)

**Tại sao sandbox?** Nếu website bị exploit, attacker chỉ có quyền trong renderer sandbox, không thể truy cập file hệ thống hay OS.

---

## Site Isolation

Từ Chrome 67, mỗi **origin** (domain) có renderer process riêng:

```
Tab với https://samsung.com/settings
  → Renderer Process A

iframe với https://ads.example.com
  → Renderer Process B (khác!)
```

Điều này ngăn chặn các cuộc tấn công như Spectre (đọc memory của process khác).

**WebUI pages** (như `chrome://settings`, hay Samsung WebUI) cũng chạy trong renderer process riêng, nhưng được tin tưởng hơn vì chúng là internal pages.

---

## GPU Process

Xử lý tất cả GPU operations:
- Compositing (gộp các layer lại thành frame)
- WebGL/WebGPU
- Hardware-accelerated video decoding

Renderer process gửi **draw calls** đến GPU process, không trực tiếp access GPU.

---

## Network Service và Storage Service

Từ Chromium ~M80, network và storage được tách thành service riêng:

```
Renderer → "Tôi cần fetch https://api.samsung.com/data"
         → Browser Process nhận request
         → Forward sang Network Service
         → Network Service thực hiện request
         → Trả kết quả về Renderer
```

Pattern này gọi là **Services Architecture** — mỗi capability là một service độc lập, giao tiếp qua Mojo IPC.

---

## Implications cho WebUI Development

Khi bạn viết WebUI code, cần hiểu:

```javascript
// Code này chạy trong Renderer Process
// Nó KHÔNG THỂ trực tiếp:
// - Đọc file settings từ disk
// - Access Samsung-specific native APIs
// - Modify browser state

// Thay vào đó, dùng Mojo IPC để "nhờ" Browser Process làm:
const { settings } = await pageHandler.getSettings();
//                                     ^^^^^^^^^^^
//                   Đây là Mojo call sang Browser Process

// Browser Process nhận call, đọc settings từ disk,
// và trả kết quả về Renderer Process
```

Đây là lý do Mojo IPC tồn tại — nó là **cây cầu** giữa Renderer (WebUI JS code) và Browser Process (native C++ code).

---

## Process Communication Overview

```
WebUI JS (Renderer)          Browser Process (C++)
        │                           │
        │  Mojo IPC pipe            │
        │ ─────────────────────────►│
        │  getSettings()            │
        │                           │  Đọc settings từ disk
        │                           │  Prepare response
        │ ◄─────────────────────────│
        │  { theme: 'dark', ... }   │
        │                           │
```

Message đi qua **Mojo message pipe** — một kênh giao tiếp nhanh, type-safe, được define bằng `.mojom` interface files.

---

## Tóm tắt

| Process | Trách nhiệm | Sandbox |
|---------|-------------|---------|
| Browser Process | Quản lý, native features, storage | Không |
| Renderer Process | Render web/WebUI, chạy JS | Có |
| GPU Process | Graphics, compositing | Có |
| Network Service | Fetch, DNS, sockets | Có |
| Storage Service | Cookies, databases | Có |

---

## Đọc thêm

- Chromium docs: `docs/multi_process_architecture.md` trong Chromium source
- Code: `content/browser/` — Browser Process code
- Code: `content/renderer/` — Renderer Process code

→ [Bài tiếp theo: Đào sâu vào từng Process](02-processes-deep-dive.md)
