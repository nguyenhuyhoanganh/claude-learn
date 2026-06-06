# Bài 66: Struct là gì — định nghĩa type dữ liệu của riêng bạn

Một ly cà phê có: tên (String), giá (f64), nóng hay không (bool). Ba thứ khác type nhưng thuộc về **một** khái niệm. Tuple gói được nhưng dở: `(5.99, "Mocha", true)` — `true` là gì? `5.99` là gì? Không có ngữ cảnh, và thứ tự thì tuỳ tiện. **Struct** giải quyết: gói nhiều field **có tên** thành một **type của riêng bạn**. Đây là công cụ mô hình hoá dữ liệu quan trọng nhất Rust.

## Vấn đề của tuple

Tuple gói nhiều giá trị khác type, nhưng theo **thứ tự** — và thứ tự thường không phải thứ ta quan tâm:

```rust
let coffee = (5.99, String::from("Mocha"), true);   // tuple
```

Hai vấn đề:
1. **Không ngữ cảnh**: `true` nghĩa gì? `5.99` nghĩa gì? Người đọc mới không biết.
2. **Thứ tự tuỳ tiện**: giá ở index 0 hay 1 không quan trọng — ta chỉ cần gói chúng lại, không cần thứ tự.

Cái ta thực sự muốn: gói các giá trị **theo tên**, không theo thứ tự. Đó là struct.

## Struct là gì

**Struct** (structure) = container cho dữ liệu **liên quan**. Nếu từng dùng OOP, struct tương tự **object**. Nó gói nhiều giá trị khác type, mỗi giá trị có **tên** (gọi là **field** hay member).

Rust có 3 loại struct: **named field** (phổ biến nhất), **tuple-like**, **unit-like**. Bài này lo named field; hai loại kia ở bài 74.

## Định nghĩa struct — blueprint

`struct` định nghĩa một **blueprint** (bản thiết kế), tương tự `class` ở OOP. Nó tạo một **type mới**, chưa phải giá trị cụ thể:

```rust
struct Coffee {
    price: f64,
    name: String,
    is_hot: bool,
}
```

```text
struct Coffee {
│      │       │
│      │       └ block chứa các field
│      └ tên struct: PascalCase
└ keyword

  price: f64,      ← field: tên + type (KHÔNG phải giá trị)
```

- `struct` keyword + tên (**PascalCase** — viết hoa chữ đầu mỗi từ: `Coffee`, `CoffeeDrink`).
- Trong `{}`: các field, mỗi field là `tên: type`, cách nhau bằng `,`.
- Field name dùng **snake_case** (`is_hot`).
- Field chỉ ghi **type** (`f64`), không ghi giá trị — đây là template.

Đây là **type mới** trong Rust, ngang hàng `i32`/`String`/`bool` — nhưng do bạn định nghĩa. Rust không biết "cà phê" là gì; bạn định nghĩa nó.

## Tạo instance — giá trị cụ thể

**Instance** = giá trị cụ thể tạo từ struct. Tạo bằng tên struct + `{}` với giá trị cho **mọi** field:

```rust
fn main() {
    let mocha = Coffee {
        name: String::from("Mocha"),     // field: giá trị
        price: 4.99,
        is_hot: true,
    };
}
```

- Phải cung cấp **đủ** mọi field, **đúng type** — thiếu/sai → không compile.
- **Thứ tự field tuỳ ý** (đây là lợi ích struct — tham chiếu theo tên, không theo thứ tự).

Sai type hoặc thiếu field:

```rust
let bad = Coffee { name: ..., price: 4.99, is_hot: 5 };   // ERROR — 5 không phải bool
let bad = Coffee { name: ..., is_hot: true };             // ERROR — missing field: price
```
```text
error[E0308]: mismatched types
error[E0063]: missing structure fields: price
```

Compiler bắt bạn sống đúng blueprint — đủ field, đúng type.

## Truy cập field: `.field`

Đọc field bằng `instance.field`:

```rust
fn main() {
    let mocha = Coffee {
        name: String::from("Mocha"),
        price: 4.99,
        is_hot: false,
    };

    println!("{}", mocha.name);          // Mocha
    println!("{} giá {} — nóng? {}", mocha.name, mocha.price, mocha.is_hot);
    // Mocha giá 4.99 — nóng? false
}
```

(Lưu ý: không nhúng `mocha.name` thẳng trong `{}` được — phải truyền làm argument như trên, hoặc dùng `{}` rỗng + đối số.)

## Ownership: struct sở hữu field, field sở hữu giá trị

Cây ownership (nhắc lại bài 43, 57): biến sở hữu struct → struct sở hữu field → field sở hữu giá trị.

```text
mocha (biến)  →  Coffee instance  →  field name  →  "Mocha" (heap)
                                  →  field price →  4.99 (stack)
                                  →  field is_hot→  false (stack)
```

Khi `mocha` ra khỏi scope, dọn dẹp **lan xuống**: dọn struct → dọn từng field → dọn giá trị. Tự động, đệ quy.

### Lấy field non-Copy ra → move

Cùng bẫy như array/tuple (bài 57): lấy field type non-Copy (String) ra khỏi struct → **move** → field đó vô hiệu:

```rust
let favorite = mocha.name;           // move String ra khỏi field name
// println!("{}", mocha.name);      // ERROR — name đã move
let price = mocha.price;             // OK — f64 là Copy, chỉ sao chép
```
```text
error[E0382]: borrow of moved value
```

String (heap, non-Copy) → move; f64/bool (stack, Copy) → copy. Muốn giữ field: borrow `&mocha.name` (bài 67) hoặc `.clone()`.

## Use case thực tế

```rust
struct User {
    username: String,
    email: String,
    age: u32,
    active: bool,
}

fn main() {
    let user = User {
        username: String::from("alice"),
        email: String::from("alice@example.com"),
        age: 30,
        active: true,
    };
    println!("{} ({})", user.username, user.email);
}
```

Struct mô hình hoá thực thể đời thực (user, đơn hàng, sản phẩm) với field có tên rõ nghĩa — nền tảng mọi chương trình Rust thực tế.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Tên struct snake_case | Warning | PascalCase |
| Thiếu field khi tạo instance | Compile error | Cung cấp đủ field |
| Sai type field | Compile error | Khớp type blueprint |
| Field ghi giá trị trong định nghĩa | Lỗi cú pháp | Định nghĩa chỉ ghi type |
| Lấy field String ra → dùng struct tiếp | move error | `&` borrow hoặc `.clone()` |
| Nhúng `s.field` thẳng trong `{}` | Lỗi | Truyền làm đối số |

## Tóm tắt bài 66

- **Struct** = container cho dữ liệu liên quan, mỗi field có **tên** (hơn tuple: có ngữ cảnh, không phụ thuộc thứ tự).
- Định nghĩa: `struct Name { field: type, ... }` — blueprint, tạo type mới; tên **PascalCase**, field **snake_case**.
- **Instance**: `Name { field: value, ... }` — đủ field, đúng type, thứ tự tuỳ ý.
- Truy cập field: `instance.field`; compiler bắt buộc đủ field + đúng type.
- Ownership: struct sở hữu field, field sở hữu giá trị; dọn lan xuống khi struct hết scope.
- Lấy field non-Copy (String) ra → **move**; field Copy (f64/bool) → copy.

**Bài kế tiếp** → [Bài 67: Sửa field & truyền struct vào hàm — 4 cách nhận struct](02-mutate-va-functions.md)
