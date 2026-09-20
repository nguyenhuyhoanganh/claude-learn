# Hướng dẫn chạy demo

## Phạm vi

Tài liệu này mô tả môi trường chạy, thứ tự sử dụng và các kết quả cần quan sát trong bốn demo đi kèm.

## Khởi động môi trường

Chạy các demo qua HTTP server:

```bash
cd mixin/demo
python3 -m http.server 8000
```

| Nội dung | Địa chỉ |
|---|---|
| Slide | `mixin/slides.html` |
| Mixin JavaScript | `http://localhost:8000/01-mixin-thuan-js.html` |
| Polymer | `http://localhost:8000/02-mixin-polymer.html` |
| Lit | `http://localhost:8000/03-mixin-lit.html` |
| So sánh Polymer/Lit | `http://localhost:8000/04-side-by-side.html` |

Demo 2–4 tải thư viện từ CDN. Cần kiểm tra trạng thái tải thư viện trước khi sử dụng. Demo 1 không cần mạng.

## Thứ tự sử dụng

| Nội dung | Mục đích | Demo |
|---|---|---|
| Mixin JavaScript | Prototype chain, `super`, constructor, deduping | 01 |
| Polymer | Property effects, lifecycle, Behavior legacy | 02 |
| Lit | Reactive property, update cycle, controller | 03 |
| Chuyển đổi | Khác biệt về API và thời điểm DOM cập nhật | 04 |

## Demo 1: class mixin JavaScript

### Các thao tác

1. Chạy phần so sánh `Object.assign` và class mixin.
2. Mở bảng prototype chain.
3. Chạy trace constructor.
4. Gắn và gỡ element để xem trace lifecycle.
5. Chạy phần deduping.

### Kết quả cần quan sát

- `Object.assign` chỉ giữ implementation cuối cùng khi trùng tên method; class mixin có thể gọi tiếp implementation phía dưới qua `super`.
- Method được tra cứu theo chain từ lớp cuối đến lớp cơ sở.
- Constructor chạy từ lớp cơ sở lên lớp cuối.
- Vị trí `super` trong method quyết định thứ tự thực thi.
- Một mixin xuất hiện hai lần trong chain có thể khiến listener hoặc lifecycle callback chạy hai lần.

## Demo 2: Polymer

### Các thao tác

1. Tạo element và thay đổi `opened`.
2. Kiểm tra `label`, attribute `opened` và CSS phụ thuộc vào attribute.
3. Gắn lại element để phân biệt `connectedCallback()` với `ready()`.
4. Mở ví dụ Behavior legacy.
5. Chạy phần deduping nếu cần kiểm tra chain phức tạp.

### Kết quả cần quan sát

- Property khai báo trong mixin được template, observer và CSS của element sử dụng như property của chính element.
- `connectedCallback()` chạy mỗi lần element được gắn vào document; `ready()` chỉ phục vụ khởi tạo Polymer lần đầu.
- Listener trên `document` phải được thêm ở `connectedCallback()` và gỡ ở `disconnectedCallback()`.
- Behavior là cơ chế legacy; method thông thường của các Behavior không nối tiếp được bằng `super`.

## Demo 3: Lit

### Các thao tác

1. Tạo element và kiểm tra vòng update đầu tiên.
2. Đổi property, sau đó kiểm tra `changedProperties` ở vòng update tiếp theo.
3. Thay đổi property rồi đọc DOM trước và sau `updateComplete`.
4. Mở phần `ReactiveController`.

### Kết quả cần quan sát

- Mixin Lit vẫn dùng prototype chain và `super` như mixin JavaScript thông thường.
- Property reactive không làm DOM đổi ngay trong lệnh gán; Lit gom thay đổi trước khi update.
- `willUpdate()` phù hợp để chuẩn bị state cho render; `updated()` chạy sau render.
- Controller có thể có nhiều instance trong cùng host; mỗi instance có state và lifecycle riêng.

## Demo 4: so sánh Polymer và Lit

### Các thao tác

1. Đối chiếu source code hai implementation của `OpenableMixin`.
2. Chạy cùng một thao tác mở/đóng ở cả hai cột.
3. Gán property rồi kiểm tra DOM ngay sau đó.
4. Gọi `toggle()` qua API của element và kiểm tra attribute phản chiếu.

### Kết quả cần quan sát

- API JavaScript `open()`, `close()` và `toggle()` không phụ thuộc framework.
- Khai báo property, template, observer và thời điểm DOM cập nhật là các phần khác nhau giữa Polymer và Lit.
- Đoạn code Lit thao tác DOM phụ thuộc vào render mới cần `await updateComplete`.

## Lưu ý kỹ thuật

| Chủ đề | Quy tắc |
|---|---|
| HOC của React | HOC bọc component ở cấp render; class mixin thêm lớp vào prototype chain. |
| Mixin và controller | Controller phù hợp với logic nội bộ; mixin phù hợp khi cần API công khai hoặc kiểm soát inheritance chain. |
| Deduping | Chỉ cần khi mixin có thể xuất hiện nhiều lần qua inheritance hoặc qua mixin khác. |
| `ready()` | Không thay trực tiếp bằng `firstUpdated()`; hook Lit phụ thuộc vào mục đích của code cũ. |
| Mixin chain | Chain quá sâu làm tăng rủi ro trùng tên method và khó debug; nên tách logic độc lập thành controller hoặc hàm thuần. |

## Danh sách kiểm tra

- Demo 2–4 đã tải đủ dependency từ CDN.
- Trace trong demo 1 thể hiện đúng thứ tự prototype, constructor và lifecycle.
- Demo Polymer cho thấy property từ mixin xuất hiện trong template và attribute.
- Demo Lit cho thấy update cycle và `updateComplete`.
- Demo so sánh cho thấy cùng API JavaScript nhưng khác reactive system.
