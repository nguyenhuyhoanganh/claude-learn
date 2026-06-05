# Bài 30: Intro Functions & Parameters — đóng gói logic, tham số, đối số

Bạn viết cùng 10 dòng tính thuế ở 5 chỗ khác nhau. Sửa công thức = sửa 5 chỗ, sót một là bug. **Function** giải bài toán đó: gói logic một lần, gọi lại bao nhiêu lần tuỳ thích, mỗi lần truyền dữ liệu khác nhau. Function là viên gạch xây mọi chương trình.

## Function là gì

**Function** = một chuỗi bước thực hiện theo thứ tự — một **procedure** (thủ tục), một "công thức nấu ăn". Sức mạnh nằm ở **tái sử dụng**: định nghĩa một lần, chạy lại nhiều lần mà không chép code.

Bạn đã quen `main` — đó là một function. Nhưng `main` đặc biệt: nó chạy **tự động** một lần khi chương trình khởi động, bạn không tự gọi. Function khác do bạn tự định nghĩa **và** tự gọi, gọi bao nhiêu lần tuỳ ý.

## Cú pháp khai báo

Mọi function theo cùng khuôn mẫu như `main`:

```text
fn  function_name ( ) {
│        │         │  │
│        │         │  └ block: thân function (logic)
│        │         └ ngoặc tròn: khai báo input (parameter)
│        └ tên, snake_case
└ keyword 'fn'
```

```rust
fn open_store() {
    println!("Mở tiệm pizza");
}

fn bake_pizza() {
    println!("Nướng một cái pizza");
}

fn main() {
    open_store();          // invoke (gọi) → chạy thân function
    bake_pizza();
}
```

Tên function dùng **snake_case** (như biến): chữ thường, từ cách nhau bằng `_`.

## Khai báo ≠ chạy: phải invoke

Khai báo function chỉ là **viết công thức** — chưa nấu. Function **không chạy** cho tới khi bạn **invoke** (gọi/call) nó: viết tên + cặp `()`.

```rust
fn open_store() {
    println!("Mở tiệm pizza");
}

fn main() {
    // Nếu không có dòng dưới, KHÔNG có output nào
    open_store();          // cặp () thực sự chạy function
}
```

Quên `()` thì không gọi. "Invoke" và "call" nghĩa như nhau: chạy/thực thi function.

> Rust **không quan tâm** bạn định nghĩa function trước hay sau `main` — miễn cùng scope `main` thấy được (cùng file là đủ). Khác C, không cần khai báo trước.

## Tái sử dụng — sức mạnh chính

Gọi lại function nhiều lần, không chép code:

```rust
fn swim_in_profit() {
    println!("Nhiều tiền quá, ít thời gian quá");
}

fn main() {
    swim_in_profit();
    swim_in_profit();      // gọi lại — logic chạy lại
    swim_in_profit();      // 3 lần, không chép thân function
}
```

Một dòng thì tầm thường. Nhưng nếu function gói 10 bước phức tạp, tái sử dụng tiết kiệm khổng lồ và tránh sai lệch giữa các bản chép.

## Parameter và Argument — input cho function

Function tới giờ chạy y hệt mỗi lần. **Parameter** cho phép tuỳ biến: truyền dữ liệu vào để mỗi lần gọi xử lý khác nhau.

- **Parameter** (tham số) = **tên** của một input **mong đợi**, khai báo trong `()` của function.
- **Argument** (đối số) = **giá trị cụ thể** truyền vào khi invoke.

```text
Định nghĩa:  fn open_store(neighborhood: &str)   ← neighborhood = parameter
Gọi:         open_store("Brooklyn")              ← "Brooklyn"   = argument
```

Khai báo parameter cần **tên + type** (bắt buộc type, khác biến trong thân hàm):

```rust
fn open_store(neighborhood: &str) {
    println!("Mở tiệm pizza ở {neighborhood}");
}

fn main() {
    open_store("Brooklyn");        // "Mở tiệm pizza ở Brooklyn"
    open_store("Queens");          // "Mở tiệm pizza ở Queens" — cùng hàm, khác data
}
```

Trong thân function, parameter dùng **như một biến** đã được gán giá trị argument. Mỗi lần gọi, `neighborhood` mang giá trị khác.

> Vì sao parameter **bắt buộc** type? Rust không infer type parameter — bạn phải khai rõ để compiler kiểm tra mọi lời gọi truyền đúng type. Đây là một phần "explicit" của Rust: chữ ký hàm là hợp đồng rõ ràng.

## Nhiều parameter

Tách bằng dấu phẩy, mỗi cái có tên + type riêng:

```rust
fn bake_pizza(number: i32, topping: &str) {
    println!("Nướng {number} cái pizza {topping}");
}

fn main() {
    bake_pizza(20, "pepperoni");      // Nướng 20 cái pizza pepperoni
    bake_pizza(15, "mushroom");       // Nướng 15 cái pizza mushroom
}
```

## Compiler kiểm tra: số lượng và type argument

Rust validate **mọi** lời gọi: đúng **số** argument và đúng **type**.

```rust
fn bake_pizza(number: i32, topping: &str) { /* ... */ }

fn main() {
    bake_pizza();                     // ERROR — thiếu argument
    bake_pizza(true, "pepperoni");    // ERROR — true là bool, cần i32
    bake_pizza(20, "pepperoni");      // OK
}
```
```text
error[E0061]: this function takes 2 arguments but 0 arguments were supplied
error[E0308]: mismatched types: expected `i32`, found `bool`
```

Sai số lượng hoặc sai type → **không compile**. Đây là an toàn: bạn không thể gọi hàm sai cách rồi mới nổ lúc chạy.

## Đào sâu: single responsibility — hàm nhỏ, một việc

Triết lý thiết kế tốt: mỗi function nên **nhỏ** và có **một trách nhiệm** (single responsibility) — một lý do tồn tại.

```rust
// TỐT: chia nhỏ, mỗi hàm một việc
fn validate_email(email: &str) -> bool { /* ... */ true }
fn save_user(name: &str) { /* ... */ }
fn send_welcome(email: &str) { /* ... */ }

// XẤU: một hàm khổng lồ ôm hết
fn do_everything(name: &str, email: &str) {
    // 100 dòng: validate + save + send + log + ...
}
```

Dấu hiệu hàm làm quá nhiều:
- Thân hàm dài (vài chục–trăm dòng).
- Quá nhiều parameter (vd 10 cái) — vì sao cần ngần ấy dữ liệu cho một việc?

Chia thành nhiều hàm nhỏ giúp: dễ đọc, dễ test, dễ tái sử dụng, dễ sửa. Đây là lời khuyên đúng cho **mọi** ngôn ngữ, không riêng Rust.

## Use case thực tế

```rust
fn calculate_tax(amount: f64, rate: f64) -> f64 {
    amount * rate
}

fn format_currency(amount: f64) -> String {
    format!("{amount:.2}đ")
}

fn main() {
    let subtotal = 100_000.0;
    let tax = calculate_tax(subtotal, 0.08);
    println!("Thuế: {}", format_currency(tax));     // Thuế: 8000.00đ
}
```

Mỗi hàm một việc rõ ràng; `main` ghép chúng lại. Đổi cách tính thuế → sửa một hàm, mọi nơi gọi tự cập nhật.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Quên `()` khi gọi | Hàm không chạy | Luôn `name()` để invoke |
| Quên type cho parameter | Compile error | Parameter bắt buộc `: type` |
| Sai số/type argument | Compile error | Khớp chữ ký hàm |
| Tên function camelCase | Warning | Dùng snake_case |
| Hàm quá nhiều việc/parameter | Khó đọc, khó test | Chia nhỏ, single responsibility |
| Mong hàm chạy chỉ vì đã khai báo | Không có output | Phải invoke |

## Tóm tắt bài 30

- **Function** = chuỗi bước tái sử dụng; `fn name() { ... }`, tên snake_case.
- `main` chạy tự động; function khác phải **invoke** bằng `name()` (cặp `()` mới chạy).
- **Parameter** = tên input mong đợi (bắt buộc `: type`); **argument** = giá trị cụ thể khi gọi.
- Parameter dùng như biến trong thân hàm; nhiều parameter tách bằng `,`.
- Compiler kiểm tra **số lượng + type** argument tại compile time.
- Thiết kế tốt: hàm **nhỏ, một trách nhiệm** — dễ đọc, test, tái sử dụng.

**Bài kế tiếp** → [Bài 31: Return Values — explicit `return`, implicit (bỏ `;`), unit type `()`](02-return-values.md)
