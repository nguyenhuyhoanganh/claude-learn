# Bài 32: Blocks, Statements & Expressions — chìa khoá hiểu cú pháp Rust

Vì sao bỏ dấu `;` lại biến một dòng thành giá trị trả về? Vì sao `let x = if cond { 1 } else { 2 };` hợp lệ trong Rust nhưng vô lý trong nhiều ngôn ngữ? Câu trả lời cho **mọi** câu hỏi cú pháp khó hiểu của Rust nằm ở một phân biệt: **statement vs expression**. Nắm bài này, cú pháp Rust thôi bí ẩn.

## Hai loại "dòng code": statement và expression

Mọi dòng Rust thuộc một trong hai loại:

| | **Statement** (câu lệnh) | **Expression** (biểu thức) |
|---|---|---|
| Định nghĩa | Thực hiện hành động, **không** trả giá trị | Đánh giá thành **một giá trị** |
| Kết thúc | Bằng `;` | **Không** `;` (nếu muốn dùng giá trị) |
| Ví dụ | `let x = 5;` | `5 + 3`, `square(2)`, `x` |

```rust
let x = 5;          // STATEMENT — khai báo biến, không trả giá trị
5 + 3               // EXPRESSION — đánh giá thành 8
x                    // EXPRESSION — đánh giá thành giá trị của x
square(2)            // EXPRESSION — đánh giá thành return value
```

Điểm mấu chốt: **dấu `;` biến expression thành statement.** `5 + 3` là expression (giá trị 8); `5 + 3;` là statement (tính rồi vứt).

```text
5 + 3      → expression → giá trị 8
5 + 3 ;    → statement   → tính 8, vứt đi
```

Đây chính là cơ chế đằng sau implicit return ở bài 31: bỏ `;` giữ expression → giá trị chảy ra; thêm `;` → statement → vứt.

## `let` luôn là statement

`let x = 5;` là **statement** — nó *làm việc* (gán biến) chứ không *là* giá trị. Hệ quả: không gán `let` cho `let`:

```rust
let x = (let y = 6);        // ERROR — let là statement, không có giá trị
```

Khác ngôn ngữ như C nơi `x = y = 6` chạy (assignment trả giá trị). Trong Rust, gán là statement, không chain được kiểu đó.

## Block là expression

**Block** = vùng giữa `{ }`. Điều đặc biệt của Rust: **block tự nó là expression** — đánh giá thành giá trị của **dòng cuối không có `;`**.

```rust
fn main() {
    let multiplier = 3;

    let calculation = {
        let value = 5 + 4;     // statement (có ;)
        value * multiplier     // expression cuối (KHÔNG ;) → giá trị của block
    };                          // ; này kết thúc câu let

    println!("{calculation}"); // 27
}
```

```text
let calculation = {
    let value = 5 + 4;     ← statement
    value * multiplier     ← expression cuối, KHÔNG ; → block = 27
};                         ← ; kết thúc let
```

Block là một **execution environment độc lập** lồng trong hàm: nó **thấy** biến của scope ngoài (`multiplier`), nhưng biến khai trong block (`value`) **chết** khi block kết thúc — out of scope (nhắc lại bài Scopes).

### Thêm `;` vào dòng cuối block → block trả unit

```rust
let calculation = {
    let value = 5 + 4;
    value * multiplier;        // CÓ ; → block không có gì để trả → ()
};
// calculation giờ là () — không phải 27
```

Y hệt quy tắc function: dòng cuối có `;` → trả unit. Vì function body **chính là** một block.

## Vì sao điều này quan trọng: `if`, `match` là expression

Đây là phần trả lời câu hỏi đầu bài. Vì block là expression, và `if`/`match`/`loop` dùng block, chúng **trả giá trị** — gán thẳng vào biến:

```rust
fn main() {
    let temperature = 25;

    // if là EXPRESSION → gán vào biến được
    let label = if temperature > 30 {
        "nóng"
    } else {
        "mát"
    };                          // mỗi nhánh trả giá trị (không ;)

    println!("{label}");        // mát
}
```

So với nhiều ngôn ngữ phải viết dài dòng (gán trong từng nhánh hoặc dùng ternary `? :`), Rust để `if` trả giá trị trực tiếp. Phase Control Flow đào sâu; điểm cần thấy bây giờ: **đây là hệ quả trực tiếp của "block là expression"**.

```rust
// match cũng là expression
let grade = match score {
    90..=100 => "A",
    80..=89  => "B",
    _        => "F",
};
# let score = 85;
```

Rust được gọi là **expression-oriented language** (ngôn ngữ hướng biểu thức): gần như mọi cấu trúc trả giá trị, không chỉ "làm việc".

## Quy tắc nhất quán: nhánh nào cũng cùng type

Vì `if`/`match` trả giá trị, **mọi nhánh phải trả cùng type**:

```rust
let x = if cond { 5 } else { "five" };   // ERROR — i32 vs &str
```
```text
error[E0308]: `if` and `else` have incompatible types
```

Hợp lý: biến `x` chỉ có một type. Compiler bắt mọi nhánh nhất quán — bắt lỗi sớm.

Và nhánh trả giá trị thì **không** có `;`:

```rust
let x = if cond { 5 } else { 10 };       // OK — nhánh không ;
# let cond = true;
```

## Đào sâu: vì sao expression-oriented quan trọng

Thiết kế này không phải trang trí — nó kéo theo lợi ích thực:

- **Ít biến trung gian**: gán `if`/`match` trực tiếp thay vì khai biến `mut` rồi gán trong từng nhánh → ít `mut`, code an toàn hơn.
- **Ít bug "quên gán nhánh"**: compiler buộc mọi nhánh trả giá trị cùng type → không có nhánh nào âm thầm bỏ sót.
- **Code gọn, đọc như công thức**: giá trị "chảy" từ biểu thức ra ngoài.

```rust
// Kiểu mệnh lệnh (nhiều ngôn ngữ): mut + gán từng nhánh
let mut label = "";
if temp > 30 { label = "nóng"; } else { label = "mát"; }

// Kiểu Rust idiomatic: if là expression
let label = if temp > 30 { "nóng" } else { "mát" };
# let temp = 20;
```

Bản Rust: `label` immutable, không quên nhánh nào, một dòng.

## Khi nào dùng block độc lập

Block lồng (không phải function) hữu ích khi muốn **gói một tính toán tạm** và vứt biến trung gian sau khi xong:

```rust
fn main() {
    let area = {
        let width = 10;
        let height = 5;
        width * height          // block trả 50
    };
    // width, height đã chết ở đây — không làm bẩn scope
    println!("{area}");          // 50
}
```

Khác function: block không có tên, không parameter, không tái sử dụng — chỉ để cô lập logic một lần. Cần tái sử dụng thì tách thành function.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Thêm `;` vào nhánh `if` trả giá trị | Nhánh trả `()` | Bỏ `;` ở nhánh giá trị |
| Nhánh `if`/`else` khác type | Compile error | Mọi nhánh cùng type |
| `if` không `else` nhưng gán biến | Compile error (thiếu nhánh `()`) | Có đủ `else`, hoặc nhánh trả `()` |
| Gán `let` cho `let` | `let` là statement | Tách thành hai dòng |
| Quên block trả dòng cuối không `;` | Block trả `()` | Bỏ `;` dòng giá trị cuối |
| Nhầm statement với expression | Hiểu sai giá trị trả về | `;` = statement; không `;` = expression |

## Tóm tắt bài 32

- **Statement** làm việc, không trả giá trị (kết thúc `;`); **expression** đánh giá thành giá trị.
- **Dấu `;` biến expression thành statement** — cơ chế của implicit return.
- `let` luôn là statement; **block `{}` là expression**, trả dòng cuối không `;`.
- Vì block là expression, **`if`/`match`/`loop` trả giá trị** → gán thẳng vào biến.
- Mọi nhánh `if`/`match` phải **cùng type**; nhánh giá trị **không** `;`.
- Rust là **expression-oriented** → ít `mut`, ít bug, code gọn như công thức.

**Bài kế tiếp** → [Bài 33: Project & Section Review — ráp toàn bộ phase Functions](04-project-va-review.md)
