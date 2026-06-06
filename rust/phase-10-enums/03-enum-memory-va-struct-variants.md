# Bài 78: Bộ nhớ enum & struct variant — kích thước & dữ liệu có tên

Mỗi variant kèm dữ liệu khác nhau, kích thước khác nhau — vậy Rust cấp bao nhiêu memory cho một enum? Câu trả lời tiết lộ cách enum hoạt động bên dưới. Và tuple variant lưu dữ liệu theo vị trí (`PayPal(String, String)`) — không rõ String nào là email, String nào là password. **Struct variant** giải quyết: dữ liệu kèm có **tên**, như struct nhúng trong variant.

## Bộ nhớ enum: chọn theo variant lớn nhất

Variant khác nhau cần memory khác nhau. Rust giải quyết bằng cách: **cấp memory theo variant LỚN NHẤT**.

```text
enum PaymentMethodType {
    CreditCard(String),          → 1 String  ≈ 24 byte (con trỏ heap trên stack)
    DebitCard(String),           → 1 String  ≈ 24 byte
    PayPal(String, String),      → 2 String  ≈ 48 byte  ← LỚN NHẤT
}
→ Rust cấp ≈ 48 byte cho MỌI instance enum này
```

Một con trỏ String chiếm ~24 byte trên stack (text nằm heap, con trỏ nằm stack). CreditCard/DebitCard cần ~24, PayPal cần ~48. Rust chọn **48** (lớn nhất) — vì phải đủ chứa mọi khả năng.

**Vì sao**: nếu `let mut x = CreditCard(...)` rồi gán lại `x = PayPal(...)` (cần nhiều hơn), Rust đã cấp sẵn 48 byte từ đầu → không phải reallocate. Đây là "worst case scenario" — cấp theo nhu cầu lớn nhất.

> Lưu ý: tổng thực tế không chính xác bằng tổng dữ liệu — Rust còn lưu **tag** (variant nào đang dùng: CreditCard/PayPal/...) và đôi khi tối ưu thêm. Nên enum cấp **ít nhất** kích thước variant lớn nhất, cộng tag. Ngày thường không cần lo chi tiết này — chỉ cần biết Rust cấp theo variant lớn nhất để mọi variant vừa.

## Struct variant — dữ liệu kèm có tên

Tuple variant lưu dữ liệu theo **vị trí**: `PayPal(String, String)` — String đầu là email hay password? Không rõ. **Struct variant** cho dữ liệu kèm **tên field** (như struct), thêm ngữ cảnh:

```rust
#[derive(Debug)]
enum PaymentMethodType {
    CreditCard(String),                          // tuple variant (vị trí)
    PayPal { username: String, password: String },   // STRUCT variant (tên)
    Cash,                                         // không dữ liệu
}
```

```text
PayPal { username: String, password: String }
│      │
│      └ {} chứa field CÓ TÊN (như struct)
└ variant
```

Struct variant dùng `{}` (không phải `()`), field có `tên: type` — y cú pháp struct. Lợi ích như struct so với tuple: **ngữ cảnh** (rõ field nào là gì) thay vì chỉ thứ tự.

## Tạo & dùng struct variant

Tạo: dùng `{}` với field (như tạo struct):

```rust
fn main() {
    let payment = PaymentMethodType::PayPal {
        username: String::from("bob@gmail.com"),
        password: String::from("password"),
    };
    println!("{payment:?}");
    // PayPal { username: "bob@gmail.com", password: "password" }
}
# #[derive(Debug)] enum PaymentMethodType { CreditCard(String), PayPal { username: String, password: String }, Cash }
```

Cú pháp tạo mirror khai báo: tuple variant → `()`, struct variant → `{}`. Debug hiện tên field, rõ nghĩa hơn tuple variant.

## Ba loại variant — mirror ba loại struct

Enum có **3 loại variant**, ánh xạ 1-1 với 3 loại struct (bài 74):

| Loại variant | Cú pháp | Dữ liệu theo | Tương đương struct |
|---|---|---|---|
| **Unit** (trơn) | `Cash` | không dữ liệu | unit-like struct (`struct S;`) |
| **Tuple** | `CreditCard(String)` | vị trí | tuple struct (`struct S(T)`) |
| **Struct** | `PayPal { user: String }` | tên field | named field struct (`struct S { f: T }`) |

```text
Cash                           ← unit variant     ≈ struct S;
CreditCard(String)             ← tuple variant    ≈ struct S(String);
PayPal { user: String }        ← struct variant   ≈ struct S { user: String }
```

Một enum trộn cả ba loại thoải mái — Rust rất linh hoạt. Cùng ý tưởng "chọn container phù hợp chứa dữ liệu" lặp lại khắp Rust (tuple/struct/enum) — nên cú pháp tương tự nhau.

## Tuple variant vs struct variant: khi nào dùng

| | Tuple variant | Struct variant |
|---|---|---|
| Dữ liệu theo | vị trí (`.0`, `.1`) | tên field |
| Ngữ cảnh | ít (chỉ thứ tự) | rõ (tên field) |
| Khi dùng | 1-2 dữ liệu đơn giản, rõ ý | nhiều field, cần ngữ cảnh |
| Cú pháp | gọn | dài hơn |

Quy tắc: ít dữ liệu rõ nghĩa (`Click(i32, i32)` — x, y) → tuple variant; nhiều field dễ lẫn → struct variant. Như tuple vs struct.

## Struct variant vs struct riêng nhúng

Có thể nhúng struct riêng vào tuple variant thay vì struct variant:

```rust
// Cách A: struct riêng nhúng vào tuple variant
#[derive(Debug)]
struct Credentials { username: String, password: String }
enum Payment { PayPal(Credentials) }     // tuple variant chứa struct

// Cách B: struct variant (nhúng trực tiếp)
enum Payment2 { PayPal { username: String, password: String } }
```

| | Struct riêng (cách A) | Struct variant (cách B) |
|---|---|---|
| Type tách rời | **Có** — `Credentials` dùng nơi khác được | Không — gắn chặt variant |
| Code | nhiều hơn (khai struct riêng) | gọn hơn |
| Khi dùng | cần tái dùng type ngoài enum | dữ liệu chỉ thuộc variant này |

Cần dùng `Credentials` ở chỗ khác → struct riêng. Dữ liệu chỉ thuộc variant → struct variant (gọn).

## Use case thực tế

```rust
#[derive(Debug)]
enum Shape {
    Circle { radius: f64 },                      // struct variant
    Rectangle { width: f64, height: f64 },       // struct variant
    Triangle(f64, f64, f64),                     // tuple variant (3 cạnh)
    Point,                                        // unit variant
}

fn main() {
    let shapes = [
        Shape::Circle { radius: 5.0 },
        Shape::Rectangle { width: 4.0, height: 3.0 },
        Shape::Triangle(3.0, 4.0, 5.0),
        Shape::Point,
    ];
    for s in &shapes { println!("{s:?}"); }
}
```

`Shape` trộn cả ba loại variant: Circle/Rectangle dùng struct variant (field rõ nghĩa), Triangle dùng tuple variant (3 cạnh), Point unit. Linh hoạt chọn loại phù hợp từng variant.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Dùng `()` cho struct variant | Lỗi cú pháp | Struct variant dùng `{}` |
| Dùng `{}` cho tuple variant | Lỗi | Tuple variant dùng `()` |
| Mong enum nhỏ bằng variant nhỏ nhất | Cấp theo lớn nhất | Bình thường — đủ mọi variant |
| Struct variant dữ liệu không rõ → dùng tuple | Mất ngữ cảnh | Nhiều field → struct variant |
| Cố dùng struct variant ở nơi khác | Gắn chặt enum | Cần tách → struct riêng |

## Tóm tắt bài 78

- Rust cấp memory enum theo **variant lớn nhất** (để mọi variant vừa, tránh reallocate); cộng tag variant.
- **Struct variant** `Variant { field: type }` (dùng `{}`): dữ liệu kèm có **tên field** — ngữ cảnh rõ hơn tuple variant.
- 3 loại variant ánh xạ 3 loại struct: **unit** (≈ unit struct), **tuple** (≈ tuple struct), **struct** (≈ named struct).
- Một enum trộn cả ba loại variant thoải mái.
- Tuple variant cho dữ liệu ít/rõ; struct variant cho nhiều field/cần ngữ cảnh.
- Cần tái dùng type ngoài enum → struct riêng; chỉ thuộc variant → struct variant (gọn).

**Bài kế tiếp** → [Bài 79: Lồng enum trong enum — kết hợp các type](04-nesting-enums.md)
