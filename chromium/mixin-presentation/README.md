# Bài trình bày: Mixin — từ cơ bản đến nâng cao (Polymer → Lit)

> Một buổi trình bày ~60–90 phút về **mixin** trong Web Components: định nghĩa, luồng chạy, cách dùng, demo chạy thật, và so sánh chi tiết **Polymer 3 ↔ LitElement**.

Bộ tài liệu này bổ sung cho [`phase-3-polymer/07-mixins-behaviors.md`](../phase-3-polymer/07-mixins-behaviors.md). Bài đó dạy *cách viết mixin trong Chromium*. Bộ này trả lời câu hỏi sâu hơn: **mixin thực sự chạy như thế nào**, và **đổi gì khi codebase migrate từ Polymer sang Lit**.

## Đối tượng

- Dev sắp đọc/sửa code WebUI Chromium (Polymer cũ + Lit mới lẫn lộn).
- Dev đã biết ES6 class, chưa nắm chắc `super` chain và prototype chain.
- Người chuẩn bị migrate component Polymer → Lit.

## Mục lục

| # | Bài | Nội dung | Thời lượng |
|---|-----|----------|-----------|
| 1 | [Mixin là gì](01-mixin-la-gi.md) | Vấn đề → 4 cấp độ share code → định nghĩa chính xác | 15 phút |
| 2 | [Luồng chạy của mixin](02-luong-chay-cua-mixin.md) | Prototype chain, `super` chain, thứ tự constructor, deduping | 20 phút |
| 3 | [Mixin trong Polymer](03-mixin-trong-polymer.md) | Behaviors → mixins, `dedupingMixin`, properties/observers merge | 15 phút |
| 4 | [Mixin trong Lit](04-mixin-trong-lit.md) | `static properties` merge, lifecycle mới, ReactiveController | 15 phút |
| 5 | [So sánh chi tiết Polymer ↔ Lit](05-so-sanh-polymer-vs-lit.md) | Syntax, luồng chạy, cùng 1 mixin 2 cách, migration | 20 phút |
| 6 | [Kịch bản demo](06-kich-ban-demo.md) | Cách chạy demo, timing, câu hỏi thường gặp | — |

## Slide

[`slides.html`](slides.html) — deck tự chứa (không cần internet, không cần build). Mở bằng browser:

```bash
# Mở trực tiếp
xdg-open chromium/mixin-presentation/slides.html   # Linux
open chromium/mixin-presentation/slides.html       # macOS
```

Điều khiển: `→` / `Space` next, `←` prev, `F` fullscreen, `O` overview.

## Demo

4 demo chạy thật trong browser, mỗi demo có **bảng trace** in ra thứ tự thực thi để bạn *nhìn thấy* luồng chạy thay vì tưởng tượng.

| Demo | File | Cần internet |
|---|---|---|
| Mixin thuần JS — prototype chain & super chain | [`demo/01-mixin-thuan-js.html`](demo/01-mixin-thuan-js.html) | Không |
| Mixin trong Polymer 3 — cả Behaviors legacy | [`demo/02-mixin-polymer.html`](demo/02-mixin-polymer.html) | Có (CDN) |
| Mixin trong Lit 3 — lifecycle & ReactiveController | [`demo/03-mixin-lit.html`](demo/03-mixin-lit.html) | Có (CDN) |
| Side-by-side: cùng 1 mixin, 2 framework | [`demo/04-side-by-side.html`](demo/04-side-by-side.html) | Có (CDN) |

### Chạy demo

Demo 01 mở trực tiếp bằng `file://` được. Demo 02–04 dùng ES modules + import map từ CDN — **nên chạy qua HTTP server** để tránh khác biệt CORS giữa các browser:

```bash
cd chromium/mixin-presentation/demo
python3 -m http.server 8000
# → http://localhost:8000/02-mixin-polymer.html
```

> Các demo dùng Polymer `3.5.1`, Lit `3.x` và `@webcomponents/shadycss` `1.11.2` từ jsDelivr. Bản Polymer tải qua CDN dùng import tương đối nên chạy thẳng được; riêng nhánh **Behaviors legacy** cần `<script type="importmap">` để map `@webcomponents/shadycss/` — demo 02 đã kèm sẵn.

## Một trang tóm tắt

Nếu chỉ có 5 phút, đây là toàn bộ nội dung:

```text
Mixin = hàm nhận 1 class, trả về class con mới đã thêm tính năng.

    const Mixin = (Base) => class extends Base { /* thêm gì đó */ };
    class MyEl extends Mixin(BaseElement) { }

Nó KHÔNG copy method sang class bạn. Nó CHÈN một mắt xích mới
vào prototype chain, nằm GIỮA class bạn và class base:

    MyEl  →  Mixin(Base)  →  Base  →  HTMLElement

Vì là mắt xích thật nên `super.method()` hoạt động bình thường
→ mixin có thể "bọc" lifecycle của base thay vì đè mất nó.

Polymer và Lit dùng CHUNG cơ chế này (đều là ES6 class).
Khác nhau ở phần framework, không phải phần mixin:

  • Polymer: gom `properties` qua static getter, hook vào `ready()`,
             có sẵn `dedupingMixin()`.
  • Lit:     gom `properties` qua static field, hook vào `willUpdate()/updated()`,
             KHÔNG có deduping sẵn — tự viết, hoặc dùng
             ReactiveController thay cho mixin khi chỉ cần state + lifecycle.
```

## Nguồn tham chiếu

- [Polymer 3 — mixin utils](https://github.com/Polymer/polymer/blob/master/lib/utils/mixin.js)
- [Lit — Mixins guide](https://lit.dev/docs/composition/mixins/)
- [Lit — Reactive Controllers](https://lit.dev/docs/composition/controllers/)
- [TypeScript — Mixins handbook](https://www.typescriptlang.org/docs/handbook/mixins.html)
- Chromium: `ui/webui/resources/cr_elements/i18n_mixin.ts`, `web_ui_listener_mixin.ts`

→ Bắt đầu: [Bài 1 — Mixin là gì](01-mixin-la-gi.md)
