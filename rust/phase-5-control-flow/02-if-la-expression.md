# Bài 35: `if` là expression — gán kết quả vào biến, thay ternary

Nhiều ngôn ngữ có **ternary operator** `condition ? a : b` để gán giá trị theo điều kiện trong một dòng. Rust **không có** ternary. Nhưng Rust có thứ mạnh hơn: vì `if` là **expression** (bài 32), nó **trả giá trị** — gán thẳng `if/else` vào biến. Bài này khai thác triệt để tính chất đó.

## Nhắc lại: `if` trả giá trị

Ở bài 32 (statement vs expression) ta thấy: block `{}` là expression, trả về dòng cuối không `;`. Vì `if`/`else` dùng block, cả cấu trúc `if/else` **là một expression** trả giá trị:

```rust
fn main() {
    let number = 17;

    let result = if number % 2 == 0 {
        "chẵn"                     // nhánh true trả giá trị này
    } else {
        "lẻ"                       // nhánh false trả giá trị này
    };                              // ; kết thúc câu let

    println!("Số là {result}");    // Số là lẻ
}
```

`result` nhận giá trị từ block của nhánh được chọn. Đọc trái sang phải: `let result = if <điều kiện> { <giá trị nếu true> } else { <giá trị nếu false> };`.

```text
let result = if cond { "chẵn" } else { "lẻ" } ;
│            │         │             │          │
│            │         │             │          └ ; kết thúc let
│            │         │             └ nhánh false → giá trị
│            │         └ nhánh true → giá trị (KHÔNG ;)
│            └ if là EXPRESSION
└ gán vào biến
```

Compiler tự format gọn về một dòng nếu vừa — nhưng logic không đổi.

## Đây là "ternary" của Rust

```text
// Ngôn ngữ khác (ternary):
let result = condition ? "chẵn" : "lẻ";

// Rust (if-expression):
let result = if condition { "chẵn" } else { "lẻ" };
# let condition = true;
```

Rust cố tình bỏ ternary `? :` — cú pháp `if/else` đã làm cùng việc, rõ ràng hơn, và mở rộng được sang nhiều nhánh (`else if`). Một cú pháp, mọi trường hợp.

## Quy tắc bắt buộc: mọi nhánh cùng type

Vì `if` trả giá trị gán vào biến, và biến chỉ có một type, **mọi nhánh phải trả cùng type**:

```rust
let x = if cond { 5 } else { "five" };   // ERROR
```
```text
error[E0308]: `if` and `else` have incompatible types
  expected integer, found `&str`
```

Và nhánh trả giá trị thì **không** có `;` (có `;` → trả unit `()`):

```rust
let x = if cond { 5 } else { 10 };       // OK
let y = if cond { 5; } else { 10; };     // y = () — bẫy dấu ;
# let cond = true;
```

## Cần `else` khi gán biến

Nếu gán `if` vào biến mà **thiếu** `else`, compiler báo lỗi — vì khi điều kiện false, biến không có giá trị:

```rust
let x = if cond { 5 };          // ERROR — thiếu else
```
```text
error[E0317]: `if` may be missing an `else` clause
  expected `i32`, found `()`
```

Khi điều kiện false mà không có `else`, `if` trả `()` → mâu thuẫn với type của nhánh true. Phải có `else` đầy đủ. (Ngoại lệ: nếu `if` không gán vào đâu, dùng như statement thì `else` không bắt buộc.)

## `if/else if/else` nhiều nhánh cũng trả giá trị

```rust
fn grade(score: i32) -> &'static str {
    let letter = if score >= 90 {
        "A"
    } else if score >= 80 {
        "B"
    } else if score >= 70 {
        "C"
    } else {
        "F"
    };
    letter
}
```

Hoặc gọn hơn — bỏ biến trung gian, để cả `if/else` làm implicit return của function:

```rust
fn grade(score: i32) -> &'static str {
    if score >= 90 { "A" }
    else if score >= 80 { "B" }
    else if score >= 70 { "C" }
    else { "F" }                // cả if-chain là return value
}
```

Đây là idiom Rust: `if/else` vừa là logic vừa là giá trị trả về.

## Đào sâu: vì sao điều này giảm bug

So sánh hai phong cách:

```rust
// Kiểu mệnh lệnh (cần mut, gán trong từng nhánh)
let mut label = "";
if temp > 30 {
    label = "nóng";
} else {
    label = "mát";
}

// Kiểu Rust (if là expression)
let label = if temp > 30 { "nóng" } else { "mát" };
# let temp = 20;
```

Bản Rust thắng ở ba điểm:
1. **`label` immutable** — không cần `mut`, an toàn hơn.
2. **Không thể quên gán nhánh** — compiler buộc mọi nhánh trả giá trị; bản mệnh lệnh có thể quên gán trong một nhánh, để `label` rỗng.
3. **Gọn, đọc như công thức** — giá trị "chảy" từ điều kiện ra biến.

Đây là biểu hiện của triết lý expression-oriented: ưu tiên biểu thức trả giá trị thay vì lệnh gán rời rạc → ít `mut`, ít trạng thái thay đổi, ít bug.

## Use case thực tế

```rust
fn main() {
    let temperature = 28;
    let humidity = 70;

    // Gán trực tiếp từ điều kiện
    let comfort = if temperature > 30 || humidity > 80 {
        "khó chịu"
    } else if temperature < 18 {
        "lạnh"
    } else {
        "dễ chịu"
    };

    // Dùng if-expression ngay trong biểu thức lớn hơn
    let fee = 100.0 * if humidity > 80 { 1.2 } else { 1.0 };

    println!("{comfort}, phí: {fee}");      // dễ chịu, phí: 100
}
```

`if` là expression nên dùng được **mọi chỗ cần một giá trị** — gán biến, làm toán tử, làm argument, làm return value.

## Khi nào tách thành nhiều dòng

`if`-expression gọn, nhưng nhánh có logic dài thì đừng nhồi một dòng:

```rust
// Nhánh phức tạp: dùng block nhiều dòng, dòng cuối là giá trị
let result = if is_premium {
    let base = calculate_base();
    let bonus = base * 0.1;
    base + bonus                // dòng cuối không ; → giá trị nhánh
} else {
    calculate_base()
};
# fn calculate_base() -> f64 { 100.0 }
# let is_premium = true;
```

Block trong nhánh chạy nhiều statement, dòng cuối (không `;`) là giá trị. Giữ logic rõ ràng hơn là ép một dòng.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Nhánh trả khác type | Compile error | Mọi nhánh cùng type |
| Thừa `;` ở nhánh giá trị | Nhánh trả `()` | Bỏ `;` ở dòng giá trị |
| Gán `if` không có `else` | Compile error | Có `else` đầy đủ |
| Tìm ternary `? :` | Không tồn tại | Dùng `if/else` expression |
| Quên dòng cuối block là giá trị | Trả `()` | Dòng cuối không `;` |
| Nhồi logic dài vào một dòng | Khó đọc | Dùng block nhiều dòng |

## Tóm tắt bài 35

- `if`/`else` là **expression** → trả giá trị; gán thẳng vào biến: `let x = if c { a } else { b };`.
- Đây là **"ternary" của Rust** — Rust không có `? :`, dùng `if/else` rõ và mở rộng được.
- **Mọi nhánh phải cùng type**; nhánh giá trị **không** `;`; gán biến thì **bắt buộc** `else`.
- Dùng được nhiều nhánh (`else if`) và làm implicit return của function.
- Giảm bug: ít `mut`, không quên gán nhánh, code như công thức (expression-oriented).
- Nhánh logic dài → dùng block nhiều dòng, dòng cuối không `;` là giá trị.

**Bài kế tiếp** → [Bài 36: `match` cơ bản — kiểm tra mọi biến thể, catch-all `_`](03-match-co-ban.md)
