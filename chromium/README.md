# Lộ trình học Samsung Browser WebUI

> Stack: **Polymer / LitElement** + **Mojo IPC** trên nền **Chromium WebUI**

---

## Tổng quan kiến trúc

```
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

Samsung Browser WebUI là **các trang giao diện** (settings, new tab, history...) được viết bằng web technology nhưng chạy bên trong browser process sandbox. Chúng giao tiếp với C++ native thông qua Mojo IPC.

---

## Cấu trúc tài liệu

```
chromium/
├── README.md                    ← Bạn đang ở đây
│
├── phase-1-web-foundations/     ← Nền tảng Web Components
│   ├── 01-custom-elements.md
│   ├── 02-shadow-dom.md
│   ├── 03-html-templates.md
│   ├── 04-es-modules.md
│   └── exercises/
│
├── phase-2-chromium-architecture/  ← Hiểu Chromium hoạt động thế nào
│   ├── 01-multi-process.md
│   ├── 02-processes-deep-dive.md
│   └── 03-ipc-concepts.md
│
├── phase-3-litelement/          ← Framework Polymer/LitElement
│   ├── 01-litelement-basics.md
│   ├── 02-properties-reactive.md
│   ├── 03-templates-directives.md
│   ├── 04-events.md
│   └── 05-css-shadow-dom.md
│
├── phase-4-chromium-webui/      ← WebUI Framework của Chromium
│   ├── 01-webui-overview.md
│   ├── 02-webui-controller.md
│   └── 03-resources-build.md
│
├── phase-5-mojo-ipc/            ← Mojo IPC (core của công việc)
│   ├── 01-mojo-overview.md
│   ├── 02-mojom-idl.md
│   ├── 03-data-types.md
│   ├── 04-interfaces-remote-receiver.md
│   ├── 05-js-bindings.md
│   └── 06-pagehandler-pattern.md
│
└── phase-6-practical/           ← Thực chiến với Chromium source
    ├── 01-reading-source.md
    ├── 02-case-study-settings.md
    └── 03-debugging.md
```

---

## Lộ trình học (6–10 tuần)

| Phase | Nội dung | Thời gian | Ưu tiên |
|-------|----------|-----------|---------|
| 1 | Web Components fundamentals | 1–2 tuần | Phải học |
| 2 | Chromium architecture | 3–4 ngày | Đọc hiểu |
| 3 | LitElement / Polymer | 2–3 tuần | Phải học |
| 4 | Chromium WebUI framework | 1 tuần | Phải học |
| 5 | Mojo IPC | 2–3 tuần | **Core** |
| 6 | Thực chiến | Liên tục | Quan trọng |

---

## Nguyên tắc học

1. **Đọc code thực** — Chromium source là tài liệu tốt nhất. Đọc song song với lý thuyết.
2. **Chạy được thì mới tiếp** — Mỗi bài có exercise, làm xong mới qua bài tiếp.
3. **Hiểu WHY trước HOW** — Tại sao cần Mojo? Tại sao Shadow DOM? Hiểu lý do sẽ nhớ lâu hơn.

---

## Bắt đầu

→ [Phase 1: Web Components](phase-1-web-foundations/01-custom-elements.md)
