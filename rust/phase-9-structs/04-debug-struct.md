# Bài 69: In struct với `#[derive(Debug)]` — `{:?}` và `{:#?}`

Bạn vừa tạo một struct và muốn in nó ra để kiểm tra: `println!("{}", coffee)` — **lỗi compile**. Cả `{}` lẫn `{:?}` đều từ chối. Struct tự định nghĩa **mặc định không** in được, vì nó chưa implement trait nào về biểu diễn chuỗi. Lời giải là một dòng: `#[derive(Debug)]` — và đây là attribute bạn sẽ gắn lên gần như **mọi** struct.

## Vấn đề: struct không in được mặc định

Nhắc lại bài 27: `Display` (`{}`) cho người dùng, `Debug` (`{:?}`) cho lập trình viên; type phải **implement** trait mới in được. Số/bool có sẵn cả hai; array/tuple chỉ có Debug. **Struct tự định nghĩa: không có cái nào.**

```rust
struct Coffee { name: String, price: f64, is_hot: bool }

fn main() {
    let mocha = Coffee { name: String::from("Mocha"), price: 4.99, is_hot: true };
    println!("{}", mocha);           // ERROR — no Display
    println!("{:?}", mocha);         // ERROR — no Debug
}
```
```text
error[E0277]: `Coffee` doesn't implement `Debug`
  = help: the trait `Debug` is not implemented for `Coffee`
  = note: add `#[derive(Debug)]` to `Coffee`
```

Compiler nói thẳng cách sửa: thêm `#[derive(Debug)]`.

## `#[derive(Debug)]` — tự sinh Debug

`derive` nghĩa "suy ra/tạo tự động". Attribute `#[derive(Debug)]` đặt **trên** định nghĩa struct bảo Rust **tự sinh** một implementation Debug mặc định:

```rust
#[derive(Debug)]
struct Coffee { name: String, price: f64, is_hot: bool }

fn main() {
    let mocha = Coffee { name: String::from("Mocha"), price: 4.99, is_hot: true };
    println!("{:?}", mocha);
    // Coffee { name: "Mocha", price: 4.99, is_hot: true }
}
```

Debug mặc định in: **tên struct** + `{ field: value, ... }` cho mọi field. Rust team chọn đây làm chuẩn vì hợp lý cho debug và chỉ tốn một dòng.

## Cú pháp attribute (nhắc lại bài 18)

```text
#[derive(Debug)]
│  │      │
│  │      └ trait cần sinh
│  └ tên attribute: derive
└ # + [] (outer attribute, áp cho thứ ngay dưới)
```

Cùng cú pháp `#[...]` như `#[allow(...)]` (bài 18), nhưng lệnh là `derive`. `derive` nhận một hoặc nhiều trait trong `()`. Đây là ứng dụng quan trọng nhất của attribute trong Rust thực tế.

## Pretty-print với `{:#?}`

Thêm `#` trước `?` → pretty-print, mỗi field một dòng — dễ đọc cho struct nhiều field:

```rust
println!("{mocha:#?}");
```
```text
Coffee {
    name: "Mocha",
    price: 4.99,
    is_hot: true,
}
```

| Specifier | Output |
|---|---|
| `{:?}` | `Coffee { name: "Mocha", price: 4.99, is_hot: true }` (một dòng) |
| `{:#?}` | mỗi field một dòng (pretty) |

## Display vẫn KHÔNG derive được

Quan trọng: `#[derive(Debug)]` cho Debug, nhưng `{}` (Display) **vẫn lỗi**:

```rust
#[derive(Debug)]
struct Coffee { /* ... */ }

println!("{:?}", mocha);     // OK — Debug derived
println!("{}", mocha);       // ERROR — Display KHÔNG derive được
```

Vì sao? Rust **không thể đoán** cách hiển thị "thân thiện người dùng" cho struct của bạn — `Coffee` nên hiện là "Mocha $4.99" hay "Mocha (hot)"? Không có chuẩn hiển nhiên. Debug có chuẩn (tên + field) nên derive được; Display thì bạn **tự** implement (`impl Display` — phase Traits). Đây là lý do `{:?}` luôn dùng được sau derive, còn `{}` cho struct phải tự viết.

## Derive nhiều trait cùng lúc

`derive` nhận nhiều trait, cách nhau bằng `,`:

```rust
#[derive(Debug, Clone, PartialEq)]
struct Point { x: i32, y: i32 }

fn main() {
    let a = Point { x: 1, y: 2 };
    let b = a.clone();               // Clone → .clone() được
    println!("{}", a == b);          // PartialEq → so == được
    println!("{a:?}");               // Debug → in {:?}
}
```

| Trait derive | Cho phép |
|---|---|
| `Debug` | in `{:?}`, `{:#?}` |
| `Clone` | `.clone()` (sao chép sâu) |
| `Copy` | tự copy (chỉ khi mọi field Copy) |
| `PartialEq` | so sánh `==`, `!=` |
| `PartialOrd` | so sánh `<`, `>` |
| `Default` | `Type::default()` |
| `Hash` | dùng làm key HashMap |

`#[derive(Debug, Clone, PartialEq)]` là combo cực phổ biến — gặp trên hầu hết struct. Mỗi trait được sinh tự động dựa trên field.

> Lưu ý `Copy`: chỉ derive được nếu **mọi** field đều Copy. Struct có field `String` (non-Copy) → không derive `Copy` được (chỉ `Clone`). Đây là lý do struct mặc định move (non-Copy) trừ khi mọi field Copy + bạn derive `Copy`.

## Use case thực tế

```rust
#[derive(Debug, Clone)]
struct Order {
    id: u32,
    items: u32,
    total: f64,
}

fn main() {
    let order = Order { id: 1001, items: 3, total: 59.99 };

    // Debug cho log/dev
    println!("{order:?}");                       // một dòng, gọn cho log
    println!("{order:#?}");                       // pretty cho đọc kỹ

    let backup = order.clone();                  // Clone → sao lưu
    println!("Backup: {backup:?}");
}
```

`#[derive(Debug)]` cho phép log struct tức thì khi debug; `#[derive(Clone)]` cho sao chép. Đây là lý do gần như mọi struct production có dòng `#[derive(...)]` ở trên.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| `{:?}` struct chưa derive | Compile error | Thêm `#[derive(Debug)]` |
| Mong `{}` cho struct sau derive Debug | Display không derive được | Tự `impl Display` |
| Đặt `#[derive]` sai chỗ (không trên struct) | Không áp dụng | Ngay trên `struct` |
| Derive `Copy` cho struct có field String | Compile error | Chỉ `Clone`; mọi field phải Copy để Copy |
| Quên `#` cho pretty-print | In một dòng | `{:#?}` |
| Derive trait mà field không hỗ trợ | Compile error | Field phải hỗ trợ trait đó |

## Tóm tắt bài 69

- Struct tự định nghĩa **mặc định không** in được (`{}` và `{:?}` đều lỗi).
- **`#[derive(Debug)]`** đặt trên struct → tự sinh Debug, in `{:?}` (tên + field) và `{:#?}` (pretty).
- **Display (`{}`) không derive được** — Rust không đoán được cách hiển thị; phải tự `impl Display`.
- Derive nhiều trait: `#[derive(Debug, Clone, PartialEq)]` (combo phổ biến).
- `Copy` chỉ derive được khi **mọi** field Copy; struct có String chỉ derive `Clone`.
- Gần như mọi struct production có `#[derive(...)]` — Debug để log, Clone để sao chép.

**Bài kế tiếp** → [Bài 70: Methods — hàm sống trên struct, 4 dạng `self`](05-methods.md)
