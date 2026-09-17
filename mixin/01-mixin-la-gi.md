# Bài 1: Mixin là gì — đi từ chỗ đơn giản nhất

> Mục tiêu: sau bài này bạn định nghĩa được mixin bằng **một câu**, và giải thích được vì sao 3 cách share code "tự nhiên" hơn lại không đủ.
>
> Cả bài chỉ dùng **JavaScript thuần**. Không framework, không thư viện. Phần Polymer/Lit để dành cho bài 3 trở đi.

## 1. Bài toán gốc — không có mixin thì sao?

Bắt đầu bằng thứ nhỏ nhất có thể. Bạn có hai class chẳng liên quan gì đến nhau:

```javascript
class NutBam {
  bam() {
    console.log('Nút được bấm');
  }
}

class OTimKiem {
  tim(tuKhoa) {
    console.log('Đang tìm:', tuKhoa);
  }
}
```

Giờ sếp bảo: *"Đếm xem mỗi thứ được dùng bao nhiêu lần."*

Cách làm đầu tiên ai cũng nghĩ ra — viết thẳng vào từng class:

```javascript
class NutBam {
  constructor() {
    this.soLanDung = 0;              // ①
  }
  bam() {
    this.soLanDung++;                // ②
    console.log('Nút được bấm');
  }
  thongKe() {
    return `Đã dùng ${this.soLanDung} lần`;   // ③
  }
}

class OTimKiem {
  constructor() {
    this.soLanDung = 0;              // ① y hệt
  }
  tim(tuKhoa) {
    this.soLanDung++;                // ② y hệt
    console.log('Đang tìm:', tuKhoa);
  }
  thongKe() {
    return `Đã dùng ${this.soLanDung} lần`;   // ③ y hệt
  }
}
```

Chạy thử:

```javascript
const nut = new NutBam();
nut.bam();
nut.bam();
console.log(nut.thongKe());     // "Đã dùng 2 lần"
```

Hoạt động tốt. Nhưng ba chỗ đánh dấu ①②③ **lặp lại y hệt**. Và đây mới chỉ là 2 class.

### Vì sao lặp code lại là vấn đề

Không phải vì "gõ nhiều". Gõ thì nhanh thôi. Vấn đề là:

| Vấn đề | Chuyện gì xảy ra |
|---|---|
| **Sửa 1 chỗ, phải sửa N chỗ** | Sếp muốn đếm cả thời điểm dùng lần cuối → mở từng class ra sửa |
| **Sai lệch âm thầm** | Class thứ 5 có người quên dòng `this.soLanDung++` → số liệu sai, không ai biết |
| **Không test riêng được** | Muốn kiểm tra logic đếm phải dựng cả `NutBam` lên |

Ta cần một cơ chế: **viết logic đếm một lần, gắn vào bao nhiêu class cũng được.**

## 2. Bốn cấp độ share code

Có 4 cách. Đi từ đơn giản → phức tạp, mỗi cấp giải quyết được điều mà cấp trước không làm nổi. Ta thử lần lượt trên chính bài toán đếm ở trên.

### Cấp 0 — Hàm tiện ích

Tách phần dùng chung ra thành hàm:

```javascript
// dem-utils.js
export function taoThongKe(soLan) {
  return `Đã dùng ${soLan} lần`;
}
```

```javascript
import {taoThongKe} from './dem-utils.js';

class NutBam {
  constructor() { this.soLanDung = 0; }     // ← vẫn phải tự khai báo
  bam() {
    this.soLanDung++;                       // ← vẫn phải tự tăng
    console.log('Nút được bấm');
  }
  thongKe() { return taoThongKe(this.soLanDung); }   // ← chỉ phần này dùng chung
}
```

✅ Đơn giản nhất, dễ test nhất, không có gì "ảo diệu".
❌ **Chỉ tách được phần tính toán thuần.** Cái `soLanDung = 0` và `soLanDung++` vẫn nằm lại trong từng class, vì hàm thuần **không giữ được state riêng cho từng đối tượng**.

> **Nguyên tắc số 1:** nếu hàm thuần đủ dùng thì **đừng** viết mixin. Mixin là công cụ nặng hơn nhiều. Chỉ đi tiếp khi hàm thuần thật sự không đủ — như trường hợp này.

### Cấp 1 — Class cha (kế thừa)

Đưa cả state lẫn method lên một class cha:

```javascript
class CoDemLuot {
  constructor() {
    this.soLanDung = 0;
  }
  ghiNhanDung() {
    this.soLanDung++;
  }
  thongKe() {
    return `Đã dùng ${this.soLanDung} lần`;
  }
}

class NutBam extends CoDemLuot {
  bam() {
    this.ghiNhanDung();               // state và method đều thừa hưởng
    console.log('Nút được bấm');
  }
}

class OTimKiem extends CoDemLuot {
  tim(tuKhoa) {
    this.ghiNhanDung();
    console.log('Đang tìm:', tuKhoa);
  }
}
```

✅ Có state riêng từng đối tượng, không lặp dòng nào. Giải quyết trọn bài toán.

Cho đến khi có yêu cầu thứ hai.

Sếp bảo tiếp: *"Cho phép bật/tắt từng thứ."* Bạn viết thêm một class cha nữa:

```javascript
class CoBatTat {
  constructor() { this.dangBat = true; }
  bat()  { this.dangBat = true; }
  tat()  { this.dangBat = false; }
}
```

Giờ `NutBam` cần **cả hai**. Và đây là lúc đụng tường:

```javascript
class NutBam extends CoDemLuot, CoBatTat { }
//                             ^^^^^^^^^
// ✗ SyntaxError. JavaScript KHÔNG có đa kế thừa.
```

❌ **JavaScript chỉ cho kế thừa đơn.** Một class chỉ được có đúng một cha.

Bạn có thể lồng chúng lại — `class CoBatTat extends CoDemLuot` — nhưng như vậy là ép mọi thứ bật/tắt đều phải biết đếm, dù có cần hay không. Càng thêm khả năng, chuỗi càng cứng và càng vô lý.

> **Đây chính là bức tường mà mixin sinh ra để phá.**

### Cấp 2 — Copy method vào prototype (`Object.assign`)

Cách "mixin cổ điển", có từ thời jQuery. Ý tưởng: gom method vào một object thường, rồi copy sang class:

```javascript
const demLuot = {
  ghiNhanDung() { this.soLanDung = (this.soLanDung ?? 0) + 1; },
  thongKe()     { return `Đã dùng ${this.soLanDung ?? 0} lần`; },
};

const batTat = {
  bat() { this.dangBat = true; },
  tat() { this.dangBat = false; },
};

class NutBam { }
Object.assign(NutBam.prototype, demLuot);
Object.assign(NutBam.prototype, batTat);   // gắn được CẢ HAI
```

✅ Gắn được nhiều nguồn vào cùng một class — vượt qua giới hạn kế thừa đơn.

❌ Nhưng hỏng nặng ở hai chỗ. **Hỏng 1 — hai nguồn trùng tên method thì đè nhau, im lặng:**

```javascript
const nguonA = { khoiTao() { return 'A'; } };
const nguonB = { khoiTao() { return 'B'; } };

class X { }
Object.assign(X.prototype, nguonA);
Object.assign(X.prototype, nguonB);   // ĐÈ LÊN

new X().khoiTao();   // "B" — khoiTao của nguonA biến mất, không một lời cảnh báo
```

**Hỏng 2 — đè mất luôn method của class cha, và không có cách nào gọi lại bản gốc:**

```javascript
class Base {
  khoiTao() { return 'BASE'; }
}

class X extends Base { }
Object.assign(X.prototype, { khoiTao() { return 'MOI'; } });

new X().khoiTao();   // "MOI" — logic của Base mất sạch
```

Bạn không viết được `super.khoiTao()` bên trong `nguonA`, vì `nguonA` chỉ là một object thường — nó không nằm trong chuỗi kế thừa nào cả.

> `Object.assign` là **ghi đè phẳng**. Không có khái niệm "chạy tiếp cái trước đó". Đây là lý do Polymer 1 phải tự viết cơ chế merge riêng (bài 3), và là lý do Polymer 3 bỏ hẳn cách này.

### Cấp 3 — Class mixin ⭐

Ý tưởng khác hẳn: thay vì *copy method vào* class có sẵn, ta **sinh ra một class trung gian** rồi chèn nó vào giữa chuỗi kế thừa.

```javascript
const DemLuotMixin = (Base) => class extends Base {
  constructor(...args) {
    super(...args);
    this.soLanDung = 0;
  }
  ghiNhanDung() { this.soLanDung++; }
  thongKe()     { return `Đã dùng ${this.soLanDung} lần`; }
};

const BatTatMixin = (Base) => class extends Base {
  constructor(...args) {
    super(...args);
    this.dangBat = true;
  }
  bat() { this.dangBat = true; }
  tat() { this.dangBat = false; }
};
```

Đọc kỹ ba điểm: nó là **một hàm**, nhận vào `Base`, và bên trong `extends Base`.

Vì nhận class → trả class, ta **xếp chồng** được bao nhiêu tuỳ thích:

```javascript
class NutBam extends DemLuotMixin(BatTatMixin(Object)) {
  bam() {
    if (!this.dangBat) return;       // từ BatTatMixin
    this.ghiNhanDung();              // từ DemLuotMixin
    console.log('Nút được bấm');
  }
}

const nut = new NutBam();
nut.bam();
nut.bam();
console.log(nut.thongKe());    // "Đã dùng 2 lần"

nut.tat();
nut.bam();                     // bị chặn
console.log(nut.thongKe());    // vẫn "Đã dùng 2 lần"
```

Cùng hai mixin đó, áp lên class khác mà không sửa dòng nào:

```javascript
class OTimKiem extends DemLuotMixin(BatTatMixin(Object)) {
  tim(tuKhoa) {
    if (!this.dangBat) return;
    this.ghiNhanDung();
    console.log('Đang tìm:', tuKhoa);
  }
}
```

✅ Có state riêng, gắn được nhiều nguồn, và — quan trọng nhất — **gọi được `super`** (bài 2 sẽ đào sâu).
❌ Chuỗi dài đọc hơi rối, vẫn có thể đụng tên method, và có thể bị áp trùng (bài 2).

## 3. Định nghĩa

> **Mixin là một hàm nhận vào một class và trả về một class con mới của nó, đã được bổ sung tính năng.**

Bộ khung tối giản, thuộc lòng được:

```javascript
const TenMixin = (Base) => class extends Base {
  // thêm gì đó ở đây
};
```

Ba tính chất bắt buộc, thiếu một cái thì không còn là mixin:

| Tính chất | Vì sao cần |
|---|---|
| Nhận `Base` làm **tham số** | Nếu viết cứng `extends Object` thì chỉ dùng được cho đúng một loại, không xếp chồng được |
| Trả về **class mới**, không sửa `Base` | `Base` giữ nguyên → dùng lại được ở chỗ khác, không ô nhiễm toàn cục |
| Bên trong dùng `extends Base` | Đây là thứ tạo ra `super` — khác biệt cốt lõi so với `Object.assign` |

### Vì sao tên "subclass factory" chính xác hơn "mixin"

Chữ "mixin" (trộn vào) dễ gây hiểu lầm rằng nó **trộn** method vào class bạn. Nó không trộn gì cả.

Nó là một **nhà máy sản xuất class con**: đưa vào class `A`, nhận về một class `B extends A`.

```javascript
const M = (Base) => class extends Base { chao() { return 'xin chào'; } };

class Base { }
const X = M(Base);

console.log(Object.getPrototypeOf(X.prototype) === Base.prototype);  // true — X đúng là con của Base
console.log(M(Base) === M(Base));                                    // false — mỗi lần gọi là một class MỚI
```

Dòng cuối trông vô hại nhưng sẽ quay lại ám bạn ở bài 2 (vấn đề deduping).

## 4. So sánh 4 cấp độ

| | Hàm thuần | Kế thừa | `Object.assign` | **Class mixin** |
|---|---|---|---|---|
| Có state riêng mỗi đối tượng | ❌ | ✅ | ✅ | ✅ |
| Gắn nhiều nguồn cùng lúc | ✅ | ❌ | ✅ | ✅ |
| Gọi được `super` | — | ✅ | ❌ | ✅ |
| Ghi đè an toàn (không mất method cũ) | — | ✅ | ❌ | ✅ |
| Độ phức tạp | Thấp nhất | Thấp | Trung bình | Cao nhất |

→ Class mixin là cột duy nhất **không có ❌ nào**. Giá phải trả là độ phức tạp — nên chỉ dùng khi thật sự cần.

## 5. Khi nào dùng mixin, khi nào không

**Dùng mixin khi hội đủ:**

- Logic được dùng ở **từ 3 class trở lên**, và
- cần **state riêng** cho từng đối tượng, hoặc
- cần **chen vào giữa** một method có sẵn (gọi `super` rồi làm thêm).

**Không dùng mixin khi:**

| Tình huống | Dùng gì thay thế |
|---|---|
| Chỉ tính toán, không giữ state | Hàm thuần — `export function` |
| Chỉ 1–2 class xài | Viết thẳng, copy cũng được |
| Các class thật sự "là một loại" với nhau | Kế thừa thường |

> Câu hỏi sàng lọc nhanh: *"Thứ này có cần trở thành một phần của bản thân đối tượng không?"*
> Có → mixin. Không → hàm thuần.

## 6. Từ ví dụ đơn giản sang bài toán thật

Đếm lượt dùng là ví dụ để hiểu cơ chế. Giờ xem mixin giải quyết gì trong dự án thật.

Trong WebUI của Chromium, hàng chục component đều cần **dịch chuỗi sang ngôn ngữ người dùng**. Mỗi component cần 3 thứ:

1. Một hàm `i18n('key')` trả về chuỗi đã dịch.
2. Nghe sự kiện `language-changed` để vẽ lại khi người dùng đổi ngôn ngữ.
3. Gỡ listener khi component bị xoá — quên là **rò rỉ bộ nhớ**.

Không có mixin thì 3 việc này bị chép vào từng component. Có mixin thì viết đúng một lần:

```javascript
const I18nMixin = (Base) => class extends Base {
  i18n(key) {
    return loadTimeData.getString(key);       // kho chuỗi đã dịch của Chromium
  }

  connectedCallback() {                       // chạy khi component vào trang
    super.connectedCallback();                // ← chen vào giữa: cho base chạy trước
    this.xuLy_ = () => this.veLai();
    document.addEventListener('language-changed', this.xuLy_);
  }

  disconnectedCallback() {                    // chạy khi component bị xoá
    document.removeEventListener('language-changed', this.xuLy_);
    super.disconnectedCallback();
  }
};

class TrangCaiDat extends I18nMixin(BaseElement) { }
class TrangTaiVe  extends I18nMixin(BaseElement) { }
```

Để ý: **cấu trúc y hệt** `DemLuotMixin` ở mục 2 — vẫn là `(Base) => class extends Base`. Chỉ có nội dung bên trong là đời thực hơn.

Điểm mới duy nhất là `super.connectedCallback()`: mixin không **thay thế** method của base, nó **bọc quanh** — cho base chạy trước rồi làm thêm phần của mình. Đây là thứ `Object.assign` không bao giờ làm được, và là lý do cả Polymer lẫn Lit đều chọn class mixin.

> Chưa cần hiểu `connectedCallback` hay `BaseElement` là gì — bài 3 và bài 4 sẽ nói. Ở đây chỉ cần thấy: **cùng một khuôn mixin, dùng cho bài toán thật**.

## 7. Ví dụ hoàn chỉnh — mixin đầu tiên cho một element

Ghép hai thứ vừa học: khuôn mixin ở mục 2, và việc chen vào lifecycle ở mục 6.

Mixin đếm số lần một element được gắn vào trang:

```javascript
const DemLanHienMixin = (Base) => class extends Base {
  #soLan = 0;                         // state riêng từng đối tượng (# = private)

  connectedCallback() {
    super.connectedCallback?.();      // ?. vì HTMLElement thuần không có hàm này
    this.#soLan++;
  }

  get soLanHien() { return this.#soLan; }
};

class HopThongBao extends DemLanHienMixin(HTMLElement) {
  connectedCallback() {
    super.connectedCallback();        // chạy phần đếm của mixin trước
    this.textContent = `Đã hiện ${this.soLanHien} lần`;
  }
}

customElements.define('hop-thong-bao', HopThongBao);
```

Dùng trong HTML:

```html
<hop-thong-bao></hop-thong-bao>
```

Gỡ element ra rồi gắn lại, số đếm tăng lên — vì state nằm trong từng đối tượng, không phải biến toàn cục.

Chạy thử: [`demo/01-mixin-thuan-js.html`](demo/01-mixin-thuan-js.html) — demo in ra prototype chain thật và thứ tự `super` chạy.

## Tóm tắt bài 1

- Mixin sinh ra để phá giới hạn **kế thừa đơn** của JavaScript: một class chỉ có một cha, nhưng có thể cần nhiều khả năng.
- **Định nghĩa:** hàm nhận class → trả class con mới đã thêm tính năng. Khuôn: `(Base) => class extends Base { }`.
- Nó **không copy method**; nó **chèn một mắt xích** vào chuỗi kế thừa → nhờ vậy `super` chạy được.
- `Object.assign` vào prototype là mixin "giả": không có `super`, hai nguồn trùng tên thì đè nhau im lặng.
- Mỗi lần gọi mixin sinh ra **một class mới** → nguồn gốc của vấn đề deduping ở bài 2.
- Thứ tự ưu tiên khi cần share code: **hàm thuần → kế thừa → mixin**. Đừng nhảy thẳng tới mixin.

**Bài kế tiếp** → [Bài 2: Luồng chạy của mixin](02-luong-chay-cua-mixin.md)
