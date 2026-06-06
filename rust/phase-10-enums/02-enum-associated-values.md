# Bài 77: Enum với dữ liệu kèm theo — tuple variant

Một variant trơn (`Hearts`) chỉ là một nhãn. Nhưng đời thực, mỗi lựa chọn thường **kèm dữ liệu**: một phương thức thanh toán CreditCard kèm số thẻ; PayPal kèm email + mật khẩu. Rust cho phép mỗi variant **chứa dữ liệu riêng** — gọi là **associated value**. Đây là điều khiến enum Rust mạnh hơn hẳn enum của nhiều ngôn ngữ khác (vốn chỉ là nhãn hằng số).

## Vấn đề: variant cần dữ liệu kèm

Variant trơn không mang dữ liệu:

```rust
#[derive(Debug)]
enum PaymentMethodType {
    CreditCard,
    DebitCard,
    PayPal,
}
```

Muốn mỗi variant kèm số tài khoản? Cách vụng: dùng tuple `(PaymentMethodType, String)`. Nhưng Rust có cách gọn hơn nhiều: cho variant **tự chứa** dữ liệu.

## Tuple variant — variant chứa dữ liệu theo vị trí

Thêm `()` sau variant + khai type dữ liệu kèm theo (giống khai type tuple):

```rust
#[derive(Debug)]
enum PaymentMethodType {
    CreditCard(String),              // kèm một String (số thẻ)
    DebitCard(String),
    PayPal(String),
}
```

```text
CreditCard(String)
│         │
│         └ type dữ liệu kèm theo (theo vị trí, như tuple)
└ variant
```

Gọi là **tuple variant** vì dữ liệu kèm trông như tuple. Variant không bắt buộc kèm dữ liệu giống nhau — `CreditCard` có thể kèm String, `DebitCard` kèm gì khác, `PayPal` không kèm gì. Tuỳ bạn.

## Tạo instance: truyền dữ liệu

Tạo variant kèm dữ liệu: variant + `()` chứa **giá trị cụ thể**:

```rust
fn main() {
    let visa = PaymentMethodType::CreditCard(String::from("5678"));
    let mastercard = PaymentMethodType::DebitCard(String::from("2532-1298"));

    println!("{visa:?}");            // CreditCard("5678")
    println!("{mastercard:?}");      // DebitCard("2532-1298")
}
# #[derive(Debug)] enum PaymentMethodType { CreditCard(String), DebitCard(String), PayPal(String) }
```

`CreditCard(String::from("5678"))` — như gọi constructor cho variant. Rust nói "muốn CreditCard thì cần một String"; bạn cung cấp. Dữ liệu kèm như argument của variant.

> Đào sâu: mỗi variant kèm dữ liệu thực chất là một **function constructor** — `PaymentMethodType::CreditCard` là function nhận `String`, trả về một `PaymentMethodType`. Đây là lý do cú pháp giống gọi hàm.

In Debug: hiện tên variant + Debug của dữ liệu kèm (`CreditCard("5678")`). Dữ liệu kèm phải implement Debug để hiện trong view tổng.

## Nhiều dữ liệu, nhiều type

Variant kèm nhiều giá trị, khác type — như khai tuple:

```rust
#[derive(Debug)]
enum PaymentMethodType {
    CreditCard(String, i32, bool),   // 3 dữ liệu: String, i32, bool
    DebitCard(String),
    PayPal,
}
```

Tạo: cung cấp đủ giá trị đúng thứ tự:

```rust
let card = PaymentMethodType::CreditCard(String::from("5678"), 2026, true);
```

Tách bằng `,`, đúng số lượng + type. Sai → compile error.

## Variant khác nhau, dữ liệu khác nhau

Sức mạnh thật: mỗi variant kèm **dữ liệu khác nhau hoàn toàn**. Vd CreditCard/DebitCard kèm số tài khoản (1 String), nhưng PayPal kèm email + mật khẩu (2 String):

```rust
#[derive(Debug)]
enum PaymentMethodType {
    CreditCard(String),              // 1 String
    DebitCard(String),               // 1 String
    PayPal(String, String),          // 2 String: email + password
}

fn main() {
    let mut method = PaymentMethodType::CreditCard(String::from("5678"));
    method = PaymentMethodType::PayPal(
        String::from("bob@gmail.com"),
        String::from("password"),
    );
    println!("{method:?}");          // PayPal("bob@gmail.com", "password")
}
```

`method` là `PaymentMethodType` — gán lại được giữa các variant (nếu `mut`), dù chúng kèm dữ liệu khác nhau. Đây là điểm enum Rust vượt trội: một type, nhiều variant, mỗi variant cấu trúc dữ liệu riêng.

Thiếu/thừa dữ liệu → compiler bắt:

```rust
let bad = PaymentMethodType::PayPal(String::from("bob@gmail.com"));   // ERROR — thiếu 1
```
```text
error: this enum variant takes 2 arguments but 1 was supplied
```

## Vì sao đây là mô hình hoá mạnh

Enum-with-data biểu diễn "một trong nhiều biến thể, **mỗi biến thể mang dữ liệu phù hợp riêng**". Đây là cách Rust mô hình hoá dữ liệu cực kỳ chính xác:

```text
PaymentMethodType là:
  CreditCard + số thẻ,           HOẶC
  DebitCard  + số tài khoản,     HOẶC
  PayPal     + email + password
```

Một giá trị, đúng một variant, kèm đúng dữ liệu của variant đó. Các enum nền tảng của Rust (`Option`, `Result` — phase sau) đều dựa trên cơ chế này: `Some(value)` kèm giá trị, `None` không kèm; `Ok(value)` / `Err(error)`. Hiểu tuple variant là hiểu nền của `Option`/`Result`.

## Use case thực tế

```rust
#[derive(Debug)]
enum WebEvent {
    PageLoad,                        // không dữ liệu
    Click(i32, i32),                 // toạ độ x, y
    KeyPress(char),                  // phím
    Paste(String),                   // nội dung dán
}

fn main() {
    let events = [
        WebEvent::PageLoad,
        WebEvent::Click(100, 200),
        WebEvent::KeyPress('a'),
        WebEvent::Paste(String::from("hello")),
    ];
    for e in &events {
        println!("{e:?}");
    }
}
```

Một type `WebEvent` mô tả mọi sự kiện, mỗi loại kèm đúng dữ liệu cần (click kèm toạ độ, keypress kèm phím). Mảng chứa hỗn hợp các variant vì tất cả cùng type `WebEvent`. Pattern này (sự kiện, message, lệnh) cực phổ biến.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Thiếu/thừa dữ liệu khi tạo variant | Compile error | Đúng số lượng + type |
| Dùng tuple `(Enum, data)` thay tuple variant | Rườm rà | Cho variant tự chứa dữ liệu |
| Quên `()` khi variant có dữ liệu | Compile error | `Variant(value)` |
| Tưởng mọi variant phải kèm cùng dữ liệu | Không bắt buộc | Mỗi variant tuỳ ý |
| Dữ liệu kèm không implement Debug | `{:?}` lỗi | Dữ liệu cần Debug |

## Tóm tắt bài 77

- Variant có thể **kèm dữ liệu** (associated value) — điều khiến enum Rust mạnh hơn enum nhãn-trơn.
- **Tuple variant**: `Variant(Type)` kèm dữ liệu **theo vị trí** (như tuple); tạo bằng `Variant(value)`.
- Mỗi variant kèm dữ liệu **khác nhau hoàn toàn** (số lượng, type) — một type, nhiều cấu trúc.
- Variant kèm dữ liệu thực chất là **function constructor**; compiler bắt thiếu/thừa/sai type.
- Mô hình hoá chính xác "một trong nhiều biến thể, mỗi cái mang dữ liệu riêng" — nền của `Option`/`Result`.

**Bài kế tiếp** → [Bài 78: Bộ nhớ enum & struct variant — kích thước & dữ liệu có tên](03-enum-memory-va-struct-variants.md)
