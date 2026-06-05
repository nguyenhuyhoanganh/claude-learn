# Bài 34: Câu lệnh `if` / `else if` / `else` — chương trình ra quyết định

Tới giờ mọi chương trình chạy từ trên xuống, một mạch, kết quả luôn giống nhau. Sức mạnh thật của lập trình đến từ **code có điều kiện** — code chỉ chạy *nếu* một điều kiện thoả. Nút Pause trên video player bạn đang xem: video không tự dừng, nó dừng *nếu* bạn bấm. Đó là **control flow** — và `if` là công cụ đầu tiên.

## `if` — chạy code nếu điều kiện đúng

**Control flow** (luồng điều khiển) = cách chương trình thực thi; ta điều khiển luồng bằng các cấu trúc điều kiện. Cú pháp `if`:

```text
if <boolean> {
    // chạy nếu boolean = true
}
```

```rust
fn main() {
    if true {
        println!("Dòng này được in");
    }
    if false {
        println!("Dòng này KHÔNG được in");
    }
}
```

Block sau `if` chạy **chỉ khi** boolean là `true`. Block thứ hai (`if false`) không chạy.

### Khác ngôn ngữ khác: không ngoặc, không truthiness

```rust
if x > 5 { }            // ĐÚNG — không ngoặc quanh điều kiện
if (x > 5) { }          // chạy nhưng compiler WARN — ngoặc thừa
```

Rust **không cần** ngoặc quanh điều kiện (khác C/Java/JS), và sẽ cảnh báo nếu bạn thêm.

Quan trọng hơn: điều kiện **bắt buộc** là `bool` — Rust **không có truthiness**:

```rust
if 5 { }                // ERROR — 5 là i32, không phải bool
```
```text
error[E0308]: mismatched types: expected `bool`, found integer
```

Nhiều ngôn ngữ coi `5`, `"text"`, `[]` là "truthy/falsy". Rust nghiêm khắc: chỉ `true`/`false`. Điều kiện phải là bool hoặc biểu thức trả bool (`x > 5`, `name == "a"`).

## Điều kiện thường là giá trị động

Hard-code `if true` thì vô nghĩa (luôn chạy như nhau). Thực tế điều kiện đến từ giá trị **động** — biến, so sánh, kết quả tính:

```rust
fn main() {
    let age = 20;
    if age >= 18 {
        println!("Đủ tuổi");
    }
}
```

Mỗi lần chạy, `age` có thể khác → luồng đi khác. Đó là điểm cốt lõi: điều kiện không đoán trước được, nên chương trình rẽ nhánh.

## `else if` — kiểm tra điều kiện kế tiếp

`else if` gắn **sau** một `if`, kiểm tra điều kiện khác **nếu** `if` trước đó `false`:

```rust
fn main() {
    let season = "summer";

    if season == "summer" {
        println!("Nghỉ hè");
    } else if season == "winter" {
        println!("Lạnh quá");
    } else if season == "fall" {
        println!("Lá rụng");
    } else if season == "spring" {
        println!("Mưa nhiều");
    }
}
```

Rust kiểm tra **lần lượt từ trên xuống**, dừng ở **điều kiện đầu tiên** đúng, chạy block đó, **bỏ qua phần còn lại**. Nếu `summer` đúng, ba `else if` sau **không** được kiểm tra.

`else if` chỉ tồn tại sau `if` — không đứng độc lập.

## `else` — phương án dự phòng

`else` (không có điều kiện) chạy khi **mọi** `if`/`else if` trước đều `false` — là fallback "nếu tất cả thất bại":

```rust
fn main() {
    let season = "autumn";

    if season == "summer" {
        println!("Nghỉ hè");
    } else if season == "winter" {
        println!("Lạnh quá");
    } else {
        println!("Mùa khác");      // chạy vì không khớp summer/winter
    }
}
```

Khác biệt then chốt:

```text
Chỉ if / else if     → CÓ THỂ không block nào chạy (mọi điều kiện false)
Có else ở cuối       → ĐẢM BẢO đúng một block chạy
```

`if` + `else` tạo cấu trúc "luôn có đúng một nhánh chạy" — pattern gặp khắp nơi.

## `else if` vs nhiều `if` riêng lẻ — khác biệt quan trọng

Trông giống nhau, hành xử khác hẳn:

```rust
// CÁCH A: else if — Rust dừng ở match đầu tiên
if x > 0 { a(); }
else if x > 10 { b(); }     // KHÔNG chạy nếu x>0 đã đúng

// CÁCH B: nhiều if độc lập — Rust kiểm TẤT CẢ
if x > 0 { a(); }
if x > 10 { b(); }          // CŨNG chạy nếu x>10 (cả a() lẫn b())
# fn a(){} fn b(){} let x = 20;
```

| | `else if` (liên kết) | Nhiều `if` (độc lập) |
|---|---|---|
| Số điều kiện được kiểm tra | Dừng ở cái đúng đầu tiên | Kiểm tra **tất cả** |
| Số block có thể chạy | Tối đa **một** | Có thể **nhiều** |
| Dùng khi | Các điều kiện **liên quan**, loại trừ nhau | Các điều kiện **độc lập** |

Với `x = 20`: cách A chạy `a()` (dừng); cách B chạy **cả** `a()` và `b()`. Chọn theo logic: điều kiện loại trừ nhau (mùa nào) → `else if`; điều kiện độc lập (vừa gửi mail vừa ghi log) → nhiều `if`.

## Đào sâu: lồng `if` và clippy

`if` lồng nhiều tầng làm code khó đọc — Rust khuyến khích "làm phẳng":

```rust
// Khó đọc — lồng sâu
fn check(logged_in: bool, is_admin: bool) {
    if logged_in {
        if is_admin {
            println!("admin");
        }
    }
}

// Tốt hơn — gộp điều kiện bằng &&
fn check2(logged_in: bool, is_admin: bool) {
    if logged_in && is_admin {
        println!("admin");
    }
}
```

Công cụ `clippy` (`cargo clippy`) tự phát hiện các lồng/điều kiện rút gọn được và gợi ý. Đây là linter chính thức của Rust — chạy thường xuyên để code sạch hơn.

## Use case thực tế: phân loại theo ngưỡng

```rust
fn grade(score: i32) -> char {
    if score >= 90 {
        'A'
    } else if score >= 80 {
        'B'
    } else if score >= 70 {
        'C'
    } else {
        'F'
    }
}

fn main() {
    println!("{}", grade(85));      // B
}
```

Thứ tự **quan trọng**: kiểm tra ngưỡng cao trước. Nếu đảo ngược (kiểm `>= 70` trước), điểm 95 sẽ khớp ngay nhánh đầu và trả sai. `else if` dừng ở match đầu tiên — sắp xếp đúng thứ tự là then chốt.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Điều kiện không phải bool (`if 5`) | Compile error (no truthiness) | Dùng biểu thức trả bool |
| Ngoặc quanh điều kiện | Warning thừa | Bỏ ngoặc |
| Dùng `=` thay `==` trong điều kiện | Compile error | `==` để so sánh |
| Thứ tự `else if` sai (ngưỡng) | Khớp nhầm nhánh | Ngưỡng chặt/cao trước |
| Dùng nhiều `if` khi cần `else if` | Nhiều block cùng chạy | Điều kiện loại trừ → `else if` |
| `else if`/`else` không có `if` trước | Compile error | Phải bắt đầu bằng `if` |

## Tóm tắt bài 34

- **Control flow**: code có điều kiện, chỉ chạy khi điều kiện thoả → chương trình rẽ nhánh.
- `if <bool> { }`: chạy block nếu bool `true`; **không ngoặc**, **không truthiness** (phải là bool).
- `else if`: kiểm tra điều kiện kế tiếp nếu cái trước false; `else`: fallback chạy khi mọi thứ false.
- Rust dừng ở **match đầu tiên** trong chuỗi `if`/`else if`; có `else` → đảm bảo đúng một nhánh chạy.
- Nhiều `if` độc lập kiểm **tất cả** (nhiều block chạy được); `else if` chỉ chạy **một**.
- Thứ tự điều kiện quan trọng (ngưỡng cao trước); dùng `&&` thay vì lồng sâu; chạy `clippy`.

**Bài kế tiếp** → [Bài 35: `if` là expression — gán kết quả vào biến, thay ternary](02-if-la-expression.md)
