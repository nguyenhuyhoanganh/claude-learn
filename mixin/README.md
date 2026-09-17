# Bài trình bày: Mixin — từ cơ bản đến nâng cao (Polymer → Lit)

> Một buổi trình bày ~60–90 phút về **mixin** trong Web Components: định nghĩa, luồng chạy, cách dùng, demo chạy thật, và so sánh chi tiết **Polymer 3 ↔ LitElement**.

Tài liệu bám đúng môi trường **Chromium WebUI**: mọi ví dụ viết bằng Polymer 3 hoặc Lit 3, không lùi về JavaScript thuần. Nó trả lời hai câu hỏi mà tài liệu thông thường hay bỏ qua: **mixin thực sự chạy như thế nào** (prototype chain, thứ tự `super`, deduping), và **đổi gì khi codebase nâng từ Polymer lên Lit** — kể cả `ReactiveController`, công cụ Lit đưa ra để thay mixin trong nhiều trường hợp.

Một ví dụ duy nhất xuyên suốt cả 6 bài: **`OpenableMixin`** — khả năng mở/đóng cho panel, dropdown, dialog. Nó chỉ dùng những thứ có sẵn của framework (`properties`, lifecycle, template), không gọi API nào bên ngoài, nhưng đủ để chạm tới mọi tính năng của mixin: property + reflect, computed, observer, lifecycle có `super`, method thêm vào element, và xếp chồng với `DisableableMixin`.

> Nếu bạn đang học WebUI Chromium, [`chromium/phase-3-polymer/07-mixins-behaviors.md`](../chromium/phase-3-polymer/07-mixins-behaviors.md) trong repo này dạy *cách viết mixin theo convention của Chromium*. Bộ này đi sâu vào *cơ chế* bên dưới — hai bên bổ sung cho nhau, không trùng lặp.

## Đối tượng

- Dev sắp đọc/sửa code WebUI Chromium (Polymer cũ + Lit mới lẫn lộn).
- Dev đã biết ES6 class, chưa nắm chắc `super` chain và prototype chain.
- Người chuẩn bị migrate component Polymer → Lit.

## Mục lục

| # | Bài | Nội dung | Thời lượng |
|---|-----|----------|-----------|
| 1 | [Mixin là gì](01-mixin-la-gi.md) | Bài toán trong Polymer → Behaviors hỏng ở đâu → mixin → định nghĩa | 15 phút |
| 2 | [Luồng chạy của mixin](02-luong-chay-cua-mixin.md) | Prototype chain, `super` chain, thứ tự constructor, deduping | 20 phút |
| 3 | [Mixin trong Polymer](03-mixin-trong-polymer.md) | Behaviors → mixins, `dedupingMixin`, properties/observers merge | 15 phút |
| 4 | [Mixin trong Lit](04-mixin-trong-lit.md) | `static properties` merge, lifecycle mới, **ReactiveController** | 15 phút |
| 5 | [So sánh chi tiết Polymer ↔ Lit](05-so-sanh-polymer-vs-lit.md) | Syntax, luồng chạy, cùng 1 mixin 2 cách, migration | 20 phút |
| 6 | [Kịch bản demo](06-kich-ban-demo.md) | Cách chạy demo, timing, câu hỏi thường gặp | — |

## Slide

[`slides.html`](slides.html) — deck tự chứa (không cần internet, không cần build). Mở bằng browser:

```bash
# Mở trực tiếp
xdg-open mixin/slides.html   # Linux
open mixin/slides.html       # macOS
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
cd mixin/demo
python3 -m http.server 8000
# → http://localhost:8000/02-mixin-polymer.html
```

> Các demo dùng Polymer `3.5.1`, Lit `3.x` và `@webcomponents/shadycss` `1.11.2` từ jsDelivr. Bản Polymer tải qua CDN dùng import tương đối nên chạy thẳng được; riêng nhánh **Behaviors legacy** cần `<script type="importmap">` để map `@webcomponents/shadycss/` — demo 02 đã kèm sẵn.

## Một trang tóm tắt

Nếu chỉ có 5 phút, đây là toàn bộ nội dung:

```text
Mixin = hàm nhận 1 class, trả về class con mới đã thêm tính năng.

    const OpenableMixin = (superClass) => class extends superClass { ... };
    class MyPanel extends OpenableMixin(PolymerElement) { }

Nó KHÔNG copy method sang component bạn. Nó CHÈN một mắt xích mới
vào chuỗi kế thừa, nằm GIỮA component bạn và class base:

    MyPanel  →  OpenableMixin  →  PolymerElement  →  HTMLElement

Vì là mắt xích thật nên `super.toggle()` hoạt động bình thường
→ một mixin có thể "bọc" method của mixin khác thay vì đè mất nó.
Đây đúng là thứ Behaviors của Polymer 1 KHÔNG làm được, và là lý do
Polymer 3 bỏ Behaviors.

Polymer và Lit dùng CHUNG cơ chế này (đều là ES6 class).
Khác nhau ở phần framework, không phải phần mixin:

  • Polymer: `static get properties()`, `value:`, `computed:`, `observer:`,
             `reflectToAttribute`, hook `ready()`, có sẵn `dedupingMixin()`.
             Cập nhật DOM ĐỒNG BỘ.
  • Lit:     `static properties = {}`, mặc định gán trong constructor,
             computed → getter, observer → `updated()`, `reflect`.
             KHÔNG có deduping sẵn. Cập nhật DOM BẤT ĐỒNG BỘ
             → phải `await this.updateComplete` trước khi đọc DOM.

Ở Lit còn có ReactiveController — dùng thay mixin khi KHÔNG cần
thêm API lên chính element, hoặc khi cần nhiều bản trong một element.

    Cần el.toggle() gọi được từ template?  → Mixin
    Chỉ cần lifecycle + state riêng?        → ReactiveController
```

## Nguồn tham chiếu

- [Polymer 3 — mixin utils](https://github.com/Polymer/polymer/blob/master/lib/utils/mixin.js)
- [Lit — Mixins guide](https://lit.dev/docs/composition/mixins/)
- [Lit — Reactive Controllers](https://lit.dev/docs/composition/controllers/)
- [TypeScript — Mixins handbook](https://www.typescriptlang.org/docs/handbook/mixins.html)
- Chromium: `ui/webui/resources/cr_elements/i18n_mixin.ts`, `web_ui_listener_mixin.ts`

→ Bắt đầu: [Bài 1 — Mixin là gì](01-mixin-la-gi.md)
