# Bài 22: Floats & Format Specifier — f32/f64, độ chính xác, làm tròn khi in

`0.1 + 0.2` bằng bao nhiêu? Bạn nghĩ `0.3`. Máy tính trả `0.30000000000000004`. Đây không phải bug của Rust — là cách **mọi** máy tính lưu số thập phân. Hiểu float và giới hạn của nó tránh cho bạn vô số bug âm thầm, nhất là khi xử lý tiền.

## Float là gì

**Float** (floating-point — số dấu phẩy động) = số có phần thập phân. Rust có hai type float:

| Type | Bit | Độ chính xác | Tương đương ngôn ngữ khác |
|---|---|---|---|
| `f32` | 32 | ~6–9 chữ số | `float` (C/Java) |
| `f64` | 64 | ~15–17 chữ số | `double` (C/Java) |

Khác integer, float **luôn signed** (cả âm lẫn dương) — không có float unsigned.

Mặc định Rust infer float là **`f64`** (chính xác hơn, máy hiện đại thừa sức). Chỉ dùng `f32` khi thật sự cần tiết kiệm memory.

```rust
fn main() {
    let pi = 3.14159;            // có dấu chấm → f64 (mặc định)
    let small: f32 = 1.5;        // annotate để dùng f32
    let neg = -0.001;            // f64, âm
}
```

Chỉ cần một dấu chấm là Rust hiểu đây là float, không phải integer.

## Độ chính xác (precision) và rounding error

**Precision** = số chữ số sau dấu phẩy còn **chính xác**. Vượt giới hạn, float bắt đầu **làm tròn** — mất chính xác.

```rust
fn main() {
    let pi: f64 = 3.14159265358979323846;
    println!("{pi}");
}
```
```text
3.141592653589793     ← f64 cắt ở ~15-16 chữ số
```

Cùng số với `f32` mất sớm hơn:

```rust
let pi: f32 = 3.14159265358979323846;
println!("{pi}");        // 3.1415927 — chỉ ~7 chữ số
```

### Vì sao có rounding error — đào sâu

Đây là vấn đề **kiến trúc máy tính**, không riêng Rust. Float lưu số bằng **hữu hạn bit** dạng nhị phân (cơ số 2). Nhiều số thập phân cơ số 10 **không** biểu diễn chính xác được trong cơ số 2 — y như `1/3 = 0.333...` không hết trong cơ số 10.

```text
0.1 trong hệ nhị phân = 0.0001100110011001100... (lặp vô hạn)
→ máy cắt ở 52 bit → sai số nhỏ
→ 0.1 + 0.2 = 0.30000000000000004
```

Hệ quả thực tế:

```rust
fn main() {
    println!("{}", 0.1 + 0.2);              // 0.30000000000000004
    println!("{}", 0.1 + 0.2 == 0.3);       // false (!)
}
```

**Đừng bao giờ so sánh float bằng `==`.** So bằng sai số cho phép (epsilon):

```rust
let a = 0.1 + 0.2;
let b = 0.3;
let equal = (a - b).abs() < 1e-10;          // true — so trong ngưỡng
```

> **Tiền bạc: KHÔNG dùng float.** Sai số float làm lệch số dư tài khoản. Production lưu tiền bằng **integer cents** (`i64` = số xu) hoặc thư viện decimal (`rust_decimal`). `$19.99` → lưu `1999` (i64).

## Method trên float

Float có method, nhưng phải **annotate type rõ ràng** để gọi được:

```rust
fn main() {
    let pi: f64 = 3.14;
    println!("{}", pi.floor());      // 3 — làm tròn xuống
    println!("{}", pi.ceil());       // 4 — làm tròn lên
    println!("{}", pi.round());      // 3 — làm tròn gần nhất
    println!("{}", pi.trunc());      // 3 — cắt phần thập phân
    println!("{}", pi.fract());      // 0.14000... — chỉ phần thập phân
    println!("{}", (2.0_f64).sqrt()); // 1.4142... — căn bậc 2
    println!("{}", (8.0_f64).powi(2)); // 64 — lũy thừa
}
```

| Method | Tác dụng | `3.7` → |
|---|---|---|
| `floor()` | tròn xuống | `3` |
| `ceil()` | tròn lên | `4` |
| `round()` | tròn gần nhất | `4` |
| `trunc()` | cắt thập phân | `3` |
| `fract()` | lấy phần thập phân | `0.7` |

Lưu ý: `floor()`/`ceil()`/`round()` trả về vẫn là `f64` (chỉ không hiện phần thập phân), không phải integer.

## Format specifier — tuỳ biến cách IN, không đổi giá trị

Khi interpolate trong `println!`, thêm dấu `:` trong `{}` để tạo **format specifier** — tuỳ biến **cách hiển thị**, giá trị gốc **không đổi**.

```rust
fn main() {
    let pi = 3.14159265;
    println!("{pi:.2}");        // 3.14   — 2 chữ số thập phân
    println!("{pi:.4}");        // 3.1416 — 4 chữ số (tự làm tròn)
    println!("{pi}");           // 3.14159265 — gốc không đổi
}
```

```text
{ pi : .2 }
  │  │  │
  │  │  └ precision: 2 chữ số sau dấu chấm
  │  └ bắt đầu format specifier
  └ giá trị cần in
```

Dùng được cả hai cú pháp interpolation:

```rust
let pi = 3.14159;
println!("{pi:.4}");                 // tên trong ngoặc
println!("{:.4}", pi);               // truyền theo thứ tự
```

### Các specifier hữu ích khác

```rust
let n = 42;
println!("{n:5}");        // "   42"   — căn phải, rộng 5
println!("{n:<5}");       // "42   "   — căn trái
println!("{n:^5}");       // " 42  "   — căn giữa
println!("{n:05}");       // "00042"   — đệm số 0
println!("{n:+}");        // "+42"     — luôn hiện dấu
println!("{n:#x}");       // "0x2a"    — hex
println!("{n:#b}");       // "0b101010"— nhị phân

let price = 1234.5;
println!("{price:>10.2}"); // "   1234.50" — rộng 10, 2 thập phân, căn phải
```

Bảng nhanh:

| Specifier | Ý nghĩa |
|---|---|
| `.N` | N chữ số thập phân |
| `N` (số) | độ rộng tối thiểu (căn phải) |
| `<` `>` `^` | căn trái / phải / giữa |
| `0N` | đệm số 0, rộng N |
| `+` | luôn hiện dấu |
| `#x` `#b` `#o` | hex / nhị phân / bát phân |

## Use case thực tế: in bảng số liệu thẳng cột

```rust
fn main() {
    let items = [("Cà phê", 25000.0), ("Bánh mì", 15000.0), ("Trà", 8000.0)];
    for (name, price) in items {
        println!("{name:<10} {price:>12.2} đ");
    }
}
```
```text
Cà phê         25000.00 đ
Bánh mì        15000.00 đ
Trà             8000.00 đ
```

Format specifier biến output lộn xộn thành bảng gọn — không cần thư viện ngoài.

## Khi nào KHÔNG dùng float

| Tình huống | Dùng gì thay |
|---|---|
| Tiền bạc, tài chính | integer cents (`i64`) hoặc `rust_decimal` |
| Cần so sánh bằng chính xác | integer, hoặc so epsilon |
| Đếm (số lượng nguyên) | integer |
| ID, mã số | integer/string |

Float hợp cho: đo lường khoa học, đồ hoạ, vật lý, thống kê — chỗ sai số nhỏ chấp nhận được.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| So float bằng `==` | `0.1+0.2 != 0.3` | So `(a-b).abs() < epsilon` |
| Dùng float cho tiền | Sai số dồn, lệch tiền | integer cents / decimal |
| Quên annotate khi gọi method | method không gọi được | `let x: f64 = ...` |
| Tưởng `{:.2}` đổi giá trị gốc | Chỉ đổi cách in | Giá trị biến không đổi |
| Tưởng `f32` đủ chính xác | Mất số sớm (~7 chữ số) | Mặc định `f64` |
| Quên `0` đệm cần `0N` | Đệm space thay vì 0 | `{n:05}` không `{n:5}` |

## Tóm tắt bài 22

- **Float** = số thập phân; `f32` (~7 chữ số) và `f64` (~15-17, mặc định); luôn signed.
- **Rounding error** là bản chất máy tính (nhị phân không lưu hết số thập phân) — không phải bug Rust.
- **Không so float bằng `==`**; **không dùng float cho tiền** (dùng integer cents).
- Method: `floor`/`ceil`/`round`/`trunc`/`sqrt`/`powi`; cần annotate type để gọi.
- **Format specifier** `{x:.2}` tuỳ biến cách in, không đổi giá trị gốc; còn có căn lề, đệm 0, hex…
- Format specifier giúp in bảng số thẳng cột không cần lib ngoài.

**Bài kế tiếp** → [Bài 23: Casting, Math & Augmented Assignment — `as`, phép toán, floor division, `+=`](04-casting-math-augmented.md)
