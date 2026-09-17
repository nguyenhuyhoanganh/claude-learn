# Bài 6: Kịch bản demo — chạy buổi trình bày

> Dành cho người đứng lớp. Thứ tự bấm nút, câu cần nói ở mỗi bước, và các câu hỏi hay bị vặn lại.

## Chuẩn bị (5 phút trước giờ)

```bash
cd chromium/mixin-presentation/demo
python3 -m http.server 8000
```

Mở sẵn 5 tab:

| Tab | URL |
|---|---|
| Slide | `chromium/mixin-presentation/slides.html` (mở thẳng bằng `file://` được) |
| Demo 1 | `http://localhost:8000/01-mixin-thuan-js.html` |
| Demo 2 | `http://localhost:8000/02-mixin-polymer.html` |
| Demo 3 | `http://localhost:8000/03-mixin-lit.html` |
| Demo 4 | `http://localhost:8000/04-side-by-side.html` |

Kiểm tra trước: demo 2, 3, 4 phải hiện dải xanh **"✓ Đã tải…"** ở đầu trang. Nếu hiện dải đỏ → mất mạng hoặc CDN bị chặn.

> **Demo 1 không cần internet.** Nếu mạng hỏng hoàn toàn, vẫn trình bày được toàn bộ phần 1–2 (định nghĩa + luồng chạy) — là phần cốt lõi. Phần Polymer/Lit chuyển sang đọc trace in sẵn trong slide 17, 19, 21.

## Dòng chảy buổi trình bày (~75 phút)

| Phút | Slide | Demo | Việc cần làm |
|---|---|---|---|
| 0–5 | 1–2 | — | Mở đầu, nêu bài toán |
| 5–15 | 3–8 | **Demo 1 mục 4** | 4 cấp độ share code → định nghĩa |
| 15–30 | 9–14 | **Demo 1 mục 1, 2, 3, 5** | Luồng chạy — phần quan trọng nhất |
| 30–42 | 15–17 | **Demo 2** | Polymer |
| 42–55 | 18–24 | **Demo 3** | Lit + ReactiveController |
| 55–70 | 25–27 | **Demo 4** | So sánh & migration |
| 70–75 | 28 | — | Chốt 3 điều mang về, Q&A |

## Kịch bản chi tiết

### Demo 1 — nền tảng (dùng 2 lần)

**Lần 1, ở slide 6** (`Object.assign` — mixin giả):

> Bấm **"So sánh Object.assign vs class mixin"**.

Câu cần nói:
> "Nhìn dòng đầu: `Object.assign` cho ra `"TWO"`. Cả `ONE` lẫn method của base **biến mất**, và không có lỗi nào báo. Dòng dưới, class mixin cho ra `TWO(ONE(BASE-ĐÃ-CHẠY))` — cả ba tầng đều chạy. Khác biệt duy nhất là chữ `super`."

**Lần 2, ở slide 9–14** (luồng chạy) — đây là đoạn quan trọng nhất cả buổi:

1. **Bảng prototype chain** (mục 1) — có sẵn khi tải trang.
   > "Bốn dòng đầu là chain thật của element. `MixinA`, `B`, `C` là ba mắt xích do mixin chèn vào. Cả ba đều có `whoAmI()`. JS tra từ dòng 0 đi xuống, dừng ở cái đầu tiên — nên `MixinA` thắng."

2. **Mục 2 — constructor.** Bấm nút.
   > "C trước, rồi B, rồi A, cuối cùng mới đến class của mình. Base-first. Cái này JS ép, không đổi được."

3. **Mục 3 — bấm "Gắn vào DOM", rồi bấm "Gỡ khỏi DOM".**
   > "Để ý hai trace này **đảo ngược nhau**. Gắn vào: C→B→A→MyEl. Gỡ ra: MyEl→A→B→C. Khác biệt duy nhất trong code là `super` đặt ở đầu hay ở cuối hàm."

   *Đây là khoảnh khắc "à ra thế" của buổi học. Đừng vội qua.*

4. **Mục 5 — deduping.** Bấm nút.
   > "Ba cột. Cột giữa là bản chỉ dùng WeakMap — bản hay được chép trên mạng. Nó vẫn chạy **2 lần** ở ca kế thừa. Phải có thêm dấu đánh mới đúng."

### Demo 2 — Polymer (slide 15–17)

Thứ tự bấm: **1 → 2 → 4 → 3 → 5**.

1. **Mục 1** — bấm "Tạo & gắn element", rồi **"Gắn lại"**.
   > "Lần gắn lại, `connectedCallback` chạy lại nhưng `ready` thì không. Nên listener toàn cục phải đặt ở `connectedCallback`. Đây là bug hay gặp trong code Chromium thật."

2. **Mục 2** — bấm "value += 1" vài lần, rồi "value = 20".
   > "`observer` và `computed` này khai báo **bên trong mixin**, không phải trong element. Vẫn chạy, vẫn cập nhật template. Mixin Polymer là một mảnh component đầy đủ chứ không chỉ là túi method."

3. **Mục 4** — Behaviors.
   > "Cú pháp Polymer 1. Object literal, không có `super`. Còn gặp trong code cũ — đọc hiểu là đủ, đừng viết mới."

4. **Mục 3** — deduping. Nhanh, vì đã nói ở demo 1.

5. **Mục 5** — đồng bộ. **Dừng lại và bảo cả lớp ghi nhớ kết quả `"777"`.**
   > "Nhớ con số này. 10 phút nữa chúng ta chạy đúng đoạn code này trên Lit."

### Demo 3 — Lit (slide 18–24)

1. **Mục 1** — bấm "Tạo & gắn", rồi **"Đổi property"**.
   > "Vòng đầu có constructor và `firstUpdated`. Vòng hai thì không — chỉ `willUpdate → render → updated`. Và `changed` chỉ chứa property vừa đổi."

2. **Mục 2** — properties.
   > "`tick` khai báo trong mixin, `label` trong element. Lit gộp cả hai, giống Polymer. Nhưng để ý: không có `value:` — mặc định phải gán trong constructor."

3. **Mục 4** — ReactiveController. **Đây là điểm nhấn của phần Lit.**
   > "Nhìn hai dòng trong khung: `chậm` và `nhanh` nhảy với nhịp khác nhau — **hai controller trong cùng một element**. Mixin không làm được, vì một mixin chỉ cho bạn một `this.seconds`."

4. **Mục 5** — bất đồng bộ.
   > "Đây rồi. Cùng đoạn code Polymer cho `777`, Lit cho giá trị cũ. Không có lỗi, không có cảnh báo."

### Demo 4 — chốt (slide 25–27)

1. **Mục 1** — mã nguồn đối chiếu. Để cả lớp đọc 30 giây.
   > "Thân hàm `withLoading` **giống hệt nhau**. Chỉ khác cái vỏ."

2. **Mục 2** — bấm "Chạy kịch bản trên cả hai".
   > "Phần constructor và connectedCallback giống nhau ở hai cột — đó là phần JS thuần, không đổi. Khác biệt là Polymer có `ready()` chạy một lần, Lit có cả một vòng update lặp lại mỗi lần property đổi."

3. **Mục 3** — bấm "Gán property rồi đọc DOM". Hai cột cạnh nhau.
   > "`777` và `—`. Cùng một dòng code."

4. **Mục 4** — bấm "Gọi withLoading()" 2–3 lần cho thấy cả nhánh thành công lẫn nhánh lỗi.
   > "Cùng một API, hai bản cài đặt. Từ phía người dùng component, không phân biệt được."

## Câu hỏi hay bị vặn lại

**"Mixin có khác Higher-Order Component của React không?"**
Cùng ý tưởng — hàm nhận vào, trả về phiên bản đã tăng cường. Khác ở chỗ HOC bọc *component* và tạo thêm một tầng trong cây render; mixin bọc *class* và chèn vào prototype chain, không thêm tầng DOM nào. Hook của React gần với ReactiveController hơn là gần mixin.

**"Sao không dùng composition luôn cho gọn?"**
Nên, nếu được — đó chính là ReactiveController. Mixin chỉ thắng ở một điểm: khi bạn cần API xuất hiện **trên chính element**, ví dụ `i18n()` phải gọi được từ trong template, hoặc code bên ngoài phải gọi `el.withLoading()`.

**"Xếp chồng bao nhiêu mixin là quá nhiều?"**
3–4. Quá đó thì stack trace toàn class ẩn danh, và xác suất trùng tên method tăng nhanh. Nếu đang cần 6 mixin, nhiều khả năng một nửa trong số đó nên là controller hoặc hàm thuần.

**"Có cần `dedupingMixin` khi chắc chắn mixin chỉ dùng một lần không?"**
Có. Chi phí gần như bằng không, còn người sửa code sau bạn không biết ràng buộc đó. Trong Chromium, quên `dedupingMixin` bị coi là lỗi review.

**"TypeScript có bắt được lỗi trùng tên method giữa hai mixin không?"**
Không đáng tin. Nếu hai mixin có method cùng tên và **cùng chữ ký**, TypeScript không kêu gì cả — cái ngoài đè cái trong im lặng. Cách phòng duy nhất là đặt tên có tiền tố theo mixin.

**"Chromium đã migrate xong chưa? Giờ học Polymer có phí không?"**
Chưa xong, và sẽ còn lâu. `chrome://settings`, `chrome://history` và phần lớn WebUI hiện vẫn chạy Polymer. Samsung Browser fork tại một thời điểm cụ thể nên còn Polymer nhiều hơn nữa. Code mới viết bằng Lit, nhưng đọc và sửa code cũ thì bắt buộc biết Polymer.

**"Migrate một mixin mất bao lâu?"**
Một mixin đơn giản (chỉ method, không state): 15 phút. Có `computed`/`observers`: nửa ngày, chủ yếu tốn thời gian rà 3 cái bẫy ở bài 5 mục 5. Phần lâu nhất luôn là tìm chỗ nào đọc DOM ngay sau khi set property.

## Nếu chỉ có 20 phút

Cắt còn: slide 3 → 7 → 9 → 11 → 13 → 21 → 28, kèm **demo 1 mục 3** và **demo 4 mục 3**.

Hai demo đó truyền đạt được hai ý cốt lõi: *mixin là mắt xích trong chain nên `super` quyết định thứ tự*, và *Polymer đồng bộ còn Lit bất đồng bộ*.

## Tóm tắt bài 6

- Chạy demo qua `python3 -m http.server`, không dùng `file://` cho demo 2–4.
- Kiểm tra dải xanh "✓ Đã tải…" trước khi bắt đầu.
- Điểm nhấn: **demo 1 mục 3** (super đầu/cuối đảo ngược trace) và **demo 4 mục 3** (`777` vs `—`).
- Demo 1 chạy offline — luôn có phương án dự phòng khi mất mạng.

**Quay lại** → [README — mục lục](README.md)
