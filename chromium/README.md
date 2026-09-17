# Lộ trình học Samsung Browser WebUI

> Stack: **Polymer** + **LitElement** + **Mojo IPC** trên nền **Chromium WebUI**

Khoá học này dành cho developer làm WebUI cho Samsung Browser (hoặc bất kỳ trình duyệt nào fork từ Chromium). Sau khoá, bạn có thể: viết được component Polymer hoàn chỉnh, kết nối với native C++ qua Mojo IPC, tạo WebUI page mới từ đầu, debug khi gặp lỗi.

## Tổng quan kiến trúc

```text
┌─────────────────────────────────────────────────────┐
│              Samsung Browser (Native C++)            │
│   - Network, Storage, Settings, OS integration      │
│   - Implements Mojo Interface (PageHandler)          │
└────────────────────────┬────────────────────────────┘
                         │  Mojo IPC (qua message pipe)
┌────────────────────────▼────────────────────────────┐
│           WebUI Page (Renderer Process)              │
│   - HTML / CSS / JavaScript                         │
│   - Polymer hoặc LitElement components              │
│   - Gọi native qua JS Mojo bindings                 │
└─────────────────────────────────────────────────────┘
```

Samsung Browser WebUI là **các trang giao diện** (settings, new tab, history, downloads...) được viết bằng web technology nhưng chạy bên trong browser process với quyền đặc biệt và có thể giao tiếp với C++ native qua Mojo IPC.

## Vì sao học Polymer chứ không chỉ LitElement?

Chromium **đang migrate** từ Polymer sang LitElement (slow rolling, 2022-2026+). Trong giai đoạn này:

- Phần lớn `chrome://settings`, `chrome://history`, `chrome://downloads`, `chrome://bookmarks` của **Chromium hiện vẫn dùng Polymer**.
- Samsung Browser fork Chromium tại một thời điểm cụ thể — đa số code base **đang dùng Polymer 3**.
- Code mới có thể dùng LitElement, nhưng đọc/sửa code cũ **bắt buộc** biết Polymer.

→ Khoá học dạy **cả 2** với ưu tiên Polymer (phase 3) trước, LitElement (phase 4) sau.

## Cấu trúc khoá học (7 phase, ~38 bài)

```text
chromium/
├── README.md                          ← Bạn đang ở đây
│
├── phase-1-web-foundations/           ← Nền tảng Web Components
│   ├── 01-custom-elements.md
│   ├── 02-shadow-dom.md
│   ├── 03-html-templates.md
│   └── 04-es-modules.md
│
├── phase-2-chromium-architecture/     ← Hiểu Chromium hoạt động
│   ├── 01-multi-process.md
│   ├── 02-processes-deep-dive.md
│   └── 03-ipc-concepts.md
│
├── phase-3-polymer/                   ← ⭐ Polymer (đa số code Samsung Browser)
│   ├── 01-polymer-intro.md            ← Polymer 1/2/3, lịch sử, vì sao Chromium chọn
│   ├── 02-polymer-element.md          ← Class Polymer.Element, register
│   ├── 03-data-binding.md             ← One-way [[]] vs Two-way {{}}
│   ├── 04-properties-observers.md     ← notify, observers, computed
│   ├── 05-templates-dom-repeat-if.md  ← dom-repeat, dom-if, dom-bind
│   ├── 06-events-gestures.md          ← on-tap, gesture events
│   ├── 07-mixins-behaviors.md         ← Mixins, legacy behaviors
│   ├── 08-iron-paper-cr-elements.md   ← iron-*, paper-*, cr-* library
│   └── 09-polymer-vs-litelement.md    ← So sánh + migration
│
├── phase-4-litelement/                ← LitElement (code mới)
│   ├── 01-litelement-basics.md
│   ├── 02-properties-reactive.md
│   ├── 03-templates-directives.md
│   ├── 04-events.md
│   └── 05-css-shadow-dom.md
│
├── phase-5-chromium-webui/            ← ⭐ Chromium WebUI Framework (deep)
│   ├── 01-webui-overview.md
│   ├── 02-webui-controller-cpp.md
│   ├── 03-webui-data-source.md
│   ├── 04-cr-elements-library.md      ← Toàn bộ cr-* elements
│   ├── 05-i18n-loadtime-data.md
│   ├── 06-prefs-and-settings.md
│   ├── 07-routes-navigation.md
│   └── 08-build-system-gn.md
│
├── phase-6-mojo-ipc/                  ← Mojo IPC chi tiết
│   ├── 01-mojo-overview.md
│   ├── 02-mojom-idl.md
│   ├── 03-interfaces-remote-receiver.md
│   ├── 04-js-bindings.md
│   └── 05-pagehandler-pattern.md
│
└── phase-7-practical/                 ← Thực chiến
    ├── 01-reading-source.md
    ├── 02-case-study-settings.md
    ├── 03-creating-new-webui.md       ← Tạo WebUI page mới từ đầu
    ├── 04-testing-webui.md
    └── 05-debugging.md
```

## Lộ trình học (8–12 tuần)

| Phase | Nội dung | Thời gian | Ưu tiên |
|-------|----------|-----------|---------|
| 1 | Web Components fundamentals | 1 tuần | Phải học |
| 2 | Chromium architecture | 3 ngày | Đọc hiểu |
| **3** | **Polymer** | **2–3 tuần** | **⭐ Core** |
| 4 | LitElement | 1 tuần | Cần biết |
| **5** | **Chromium WebUI framework** | **2 tuần** | **⭐ Core** |
| 6 | Mojo IPC | 2 tuần | Core |
| 7 | Thực chiến | Liên tục | Quan trọng |

## Yêu cầu nền tảng

- JavaScript ES6+ (classes, modules, async/await, destructuring).
- HTML/CSS cơ bản.
- C++ đủ đọc — không cần viết (sẽ học khi cần).
- Git + command line.

## Nguyên tắc học

1. **Đọc code Chromium thật** — `source.chromium.org` là tài liệu tốt nhất. Đọc song song với lý thuyết.
2. **Chạy được mới qua bài** — Mỗi bài có exercise. Làm xong mới tiếp.
3. **Hiểu WHY trước HOW** — Tại sao cần Mojo? Tại sao Shadow DOM? Tại sao Polymer? Hiểu lý do nhớ lâu hơn.
4. **So sánh Polymer ↔ LitElement liên tục** — chúng có chung concepts (Web Components), syntax khác.

## Bắt đầu

→ [Phase 1: Web Components](phase-1-web-foundations/01-custom-elements.md)

Hoặc nếu đã quen Web Components → [Phase 3: Polymer](phase-3-polymer/01-polymer-intro.md)
