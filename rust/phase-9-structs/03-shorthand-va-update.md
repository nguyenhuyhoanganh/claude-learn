# Bài 68: Cú pháp rút gọn & struct update — `field` shorthand, `..` spread

Tạo struct với nhiều field gõ rất dài, nhất là khi giá trị đến từ biến/parameter cùng tên field. Rust có hai lối tắt: **field init shorthand** (bỏ `field: field` lặp lại) và **struct update syntax** (`..` sao chép field từ instance khác). Cả hai giảm code đáng kể — nhưng `..` có cái bẫy ownership cần biết.

## Field init shorthand — bỏ lặp `field: field`

Khi tên biến/parameter **trùng** tên field, bỏ `field: value` thành chỉ `field`:

```rust
fn make_coffee(name: String, price: f64, is_hot: bool) -> Coffee {
    Coffee { name, price, is_hot }       // shorthand!
    // thay vì: Coffee { name: name, price: price, is_hot: is_hot }
}
# struct Coffee { name: String, price: f64, is_hot: bool }
```

Rust thấy field `name`, tìm một tên `name` trong scope (parameter/biến), tự nối lại. Điều kiện: phải có **tên trùng** field. Nếu parameter tên `my_price` ≠ field `price` → shorthand không dùng được.

Áp dụng cả với biến:

```rust
fn main() {
    let name = String::from("Latte");
    let price = 3.99;
    let is_hot = false;

    let latte = Coffee { name, price, is_hot };   // biến trùng tên field
}
# struct Coffee { name: String, price: f64, is_hot: bool }
```

Đây là lý do convention: **đặt tên parameter/biến trùng field** — vừa gọn cú pháp, vừa nhất quán khái niệm (sao đặt hai tên khác nhau cho cùng một thứ?).

## Struct update syntax — `..` sao chép từ instance khác

Tạo struct mới dựa trên giá trị của instance cũ. Cách thủ công (dài dòng):

```rust
let mocha = Coffee { name: String::from("Mocha"), price: 4.99, is_hot: true };

let new_coffee = Coffee {
    name: String::from("Caramel Macchiato"),
    price: mocha.price,              // chép thủ công từng field
    is_hot: mocha.is_hot,
};
# struct Coffee { name: String, price: f64, is_hot: bool }
```

Với 10 field thì khổ. **Struct update syntax** `..instance` chép các field còn lại:

```rust
let new_coffee = Coffee {
    name: String::from("Caramel Macchiato"),    // field tự định nghĩa
    ..mocha                                       // chép price, is_hot từ mocha
};
```

```text
Coffee {
    name: ...,        ← field khai TRƯỚC .. → KHÔNG chép từ mocha
    ..mocha           ← chép MỌI field CÒN LẠI từ mocha (price, is_hot)
}
```

- `..instance` phải đặt **cuối cùng**.
- Field khai **trước** `..` → giữ giá trị riêng, **không** chép.
- Field còn lại → chép từ `instance`.

Khác JavaScript (spread `...` thường ghi đè hết): Rust **biết** field nào đã khai trước `..` và **không** chép field đó. Chỉ chép field chưa khai.

## Bẫy ownership của `..`

`..` hoạt động như **assignment** — nên field non-Copy bị **move**:

```rust
let mocha = Coffee { name: String::from("Mocha"), price: 4.99, is_hot: true };

let other = Coffee { price: 10.99, ..mocha };   // ..mocha chép name, is_hot

// println!("{}", mocha.name);      // ERROR — name đã MOVE qua other!
println!("{}", mocha.is_hot);        // OK — bool là Copy
```
```text
error[E0382]: borrow of moved value
```

`..mocha` ở đây tương đương `name: mocha.name, is_hot: mocha.is_hot`. `mocha.name` là String (non-Copy) → **move** sang field `name` của `other` → `mocha.name` vô hiệu. Còn `is_hot` (bool, Copy) → chép, `mocha.is_hot` vẫn dùng được.

```text
..mocha  =  name: mocha.name (MOVE - String)   → mocha mất name
            is_hot: mocha.is_hot (COPY - bool)  → mocha giữ is_hot
```

Nếu mọi field chép đều Copy (f64, bool) → không vấn đề, `mocha` còn nguyên. Có field non-Copy → một phần `mocha` bị move.

## Tránh move: clone field non-Copy

Muốn giữ `mocha` nguyên vẹn → tự khai field non-Copy với `.clone()` thay vì để `..` move:

```rust
let other = Coffee {
    name: mocha.name.clone(),        // clone String → KHÔNG move
    ..mocha                           // chỉ chép field Copy còn lại (price, is_hot)
};

println!("{}", mocha.name);          // OK — mocha.name vẫn còn (đã clone, không move)
```

`mocha.name.clone()` tạo String mới (clone trên String, không phải trên struct) → field `name` của `other` có bản riêng, `mocha.name` không bị move. `..mocha` giờ chỉ còn chép `price`, `is_hot` (đều Copy). `mocha` còn nguyên.

## Instance độc lập sau update

Sau `..`, hai struct là **độc lập** (với field Copy đã sao chép). Sửa `mocha` về sau không ảnh hưởng struct mới:

```rust
let mut a = Coffee { name: String::from("A"), price: 1.0, is_hot: true };
let b = Coffee { name: String::from("B"), ..a };   // b chép price, is_hot
a.price = 99.0;                                      // sửa a
// b.price vẫn = 1.0 (bản sao độc lập)
```

## Use case thực tế: cập nhật một phần

```rust
#[derive(Debug)]
struct Config { host: String, port: u32, timeout: u32, retries: u32 }

fn main() {
    let default = Config {
        host: String::from("localhost"),
        port: 8080,
        timeout: 30,
        retries: 3,
    };

    // Tạo config mới: chỉ đổi port, giữ phần còn lại
    let custom = Config {
        port: 9090,
        ..default                    // chép host, timeout, retries
    };
    // Lưu ý: host (String) bị move khỏi default
}
```

`..` lý tưởng cho "lấy cấu hình mặc định, đổi vài field" — pattern rất phổ biến (config, settings, test fixtures).

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Shorthand khi tên không trùng field | Không dùng được | Đặt tên trùng field |
| `..` không đặt cuối | Lỗi cú pháp | `..instance` luôn cuối |
| Dùng instance gốc sau `..` (field non-Copy) | move error | `.clone()` field non-Copy |
| Tưởng `..` ghi đè hết như JS | Rust giữ field khai trước | Field trước `..` không bị chép |
| Quên `..` chép theo ownership rules | Bất ngờ move | Hiểu `..` = assignment |

## Tóm tắt bài 68

- **Field init shorthand**: tên biến/parameter trùng field → viết `field` thay `field: field`.
- Convention: đặt tên parameter/biến **trùng field** để gọn + nhất quán.
- **Struct update `..instance`** (đặt cuối): chép các field **chưa khai** từ instance khác.
- `..` hoạt động như assignment → field non-Copy (String) bị **move**, Copy (f64/bool) thì chép.
- Tránh move: tự khai field non-Copy với `.clone()` trước `..`.
- `..` lý tưởng cho "đổi vài field, giữ phần còn lại" (config, defaults).

**Bài kế tiếp** → [Bài 69: In struct với `#[derive(Debug)]` — `{:?}` và `{:#?}`](04-debug-struct.md)
