# Bài 89: Generic trong enum — `Option<T>` và các enum generic

Enum cũng nhận generic — và đây là điểm cực quan trọng, vì **`Option<T>` và `Result<T, E>`** (hai enum nền tảng nhất Rust, phase tiếp theo) đều là enum generic. Variant của enum có thể chứa dữ liệu type linh hoạt. Hiểu generic enum là hiểu cách `Option`/`Result` hoạt động — chúng không phải ma thuật, chỉ là enum generic bạn sắp tự viết được.

## Generic trong enum: `<T>` sau tên enum

Khai `<T>` sau tên enum, dùng `T` làm type cho dữ liệu kèm variant:

```rust
#[derive(Debug)]
enum Cheesesteak<T> {                 // khai generic T
    Plain,                            // variant trơn (không dùng T)
    Topping(T),                       // variant kèm dữ liệu type T
}
```

```text
enum Cheesesteak <T> {
│    │           │
│    │           └ khai generic T (sau tên enum)
│    └ tên enum
└ keyword

  Topping(T),     ← variant kèm dữ liệu generic T
```

`<T>` sau tên enum khai generic; `Topping(T)` cho variant kèm dữ liệu type linh hoạt. Không bắt buộc mọi variant dùng `T` — `Plain` không dùng, `Topping` dùng. Tuỳ bạn.

## Tạo instance: Rust suy T từ dữ liệu

```rust
fn main() {
    let mushroom = Cheesesteak::Topping("mushroom");        // T = &str
    let onions = Cheesesteak::Topping(String::from("onions")); // T = String
    let bacon = Cheesesteak::Topping(5);                     // T = i32
}
# #[derive(Debug)] enum Cheesesteak<T> { Plain, Topping(T) }
```

Rust suy `T` từ dữ liệu trong `Topping`. Type: `Cheesesteak<&str>`, `Cheesesteak<String>`, `Cheesesteak<i32>` — cùng enum, khác `T`. Dữ liệu kèm linh hoạt mọi type.

## Bẫy: variant trơn cần annotate type

Điểm tinh tế. Tạo variant trơn (`Plain`) — không có dữ liệu để suy `T` → Rust **không biết** `T`:

```rust
let plain = Cheesesteak::Plain;       // ERROR — T không xác định
```
```text
error[E0282]: type annotations needed
  consider giving `plain` an explicit type
```

`Plain` không kèm dữ liệu → Rust không suy được `T`. Phải **annotate** type rõ ràng:

```rust
let plain: Cheesesteak<String> = Cheesesteak::Plain;   // chỉ rõ T = String
# #[derive(Debug)] enum Cheesesteak<T> { Plain, Topping(T) }
```

Vì sao cần `T` dù `Plain` không dùng nó? Vì `T` là phần của type enum (như struct, bài 87). Nếu `plain` là `mut` và sau này gán `Topping(...)`, Rust cần biết `T` từ đầu (để check + cấp memory). `T` thuộc type, kể cả variant không dùng `T`.

```rust
fn main() {
    let mut order: Cheesesteak<String> = Cheesesteak::Plain;   // T = String
    order = Cheesesteak::Topping(String::from("cheese"));      // OK — T là String
    // order = Cheesesteak::Topping(5);                        // ERROR — không phải String
}
# #[derive(Debug)] enum Cheesesteak<T> { Plain, Topping(T) }
```

Khai `T = String` từ đầu → variant sau phải dùng String. Compiler giữ nhất quán nhờ biết `T` ngay từ khai báo.

## `Option<T>` — enum generic quan trọng nhất Rust

Đây là lý do generic enum cực quan trọng. **`Option<T>`** (phase tiếp theo) là một enum generic — biểu diễn "có giá trị hoặc không":

```rust
enum Option<T> {                      // T = type của giá trị (nếu có)
    Some(T),                          // CÓ giá trị, type T
    None,                             // KHÔNG có giá trị
}
```

`Option<T>` chính là `Cheesesteak<T>` bạn vừa viết, đổi tên: `Some(T)` ≈ `Topping(T)` (kèm dữ liệu), `None` ≈ `Plain` (không kèm). Đây là enum built-in của Rust, dùng khắp nơi thay cho `null`:

```rust
fn main() {
    let some_number: Option<i32> = Some(5);        // có giá trị i32
    let no_number: Option<i32> = None;             // không có (cần annotate, như Plain)
    let some_text = Some("hello");                 // Option<&str>, T suy được
}
```

`Some(5)` → Rust suy `Option<i32>`; `None` → cần annotate `Option<i32>` (như bẫy variant trơn). Hiểu generic enum = hiểu `Option`/`Result`.

## `Result<T, E>` — enum hai generic

**`Result<T, E>`** (phase Error Handling) là enum **hai** generic — "thành công với `T` hoặc lỗi với `E`":

```rust
enum Result<T, E> {                   // T = giá trị thành công, E = lỗi
    Ok(T),                            // thành công, kèm giá trị T
    Err(E),                           // lỗi, kèm lỗi E
}
```

Hai generic độc lập (như `<T, U>` ở struct): `T` cho giá trị thành công, `E` cho lỗi. `Result<i32, String>` = thành công trả `i32`, lỗi trả `String`. Đây là cách Rust xử lý lỗi (thay exception).

## Method trên enum generic

Như struct generic (bài 88), method trên enum generic cần xử lý `T`:

```rust
enum Cheesesteak<T> { Plain, Topping(T) }

impl<T> Cheesesteak<T> {              // method cho mọi T
    fn is_plain(&self) -> bool {
        matches!(self, Cheesesteak::Plain)   // matches! macro: kiểm variant
    }
}
```

`impl<T> Cheesesteak<T>` cho method tồn tại mọi `T` (cách 2, bài 88). `Option<T>` có hàng tá method như vậy (`.is_some()`, `.unwrap()`, `.map()` — phase sau).

## Use case thực tế

```rust
#[derive(Debug)]
enum Tree<T> {                        // cây nhị phân generic
    Leaf(T),                          // lá kèm giá trị
    Empty,                            // rỗng
}

fn main() {
    let int_leaf: Tree<i32> = Tree::Leaf(42);
    let str_leaf: Tree<&str> = Tree::Leaf("hello");
    let empty: Tree<i32> = Tree::Empty;        // annotate vì variant trơn

    println!("{int_leaf:?}");         // Leaf(42)
    println!("{str_leaf:?}");         // Leaf("hello")
}
```

`Tree<T>` lưu giá trị type bất kỳ — một định nghĩa cho cây số, cây chữ, v.v. Generic enum cho phép xây cấu trúc dữ liệu (cây, list, option) tái sử dụng mọi type. `Option<T>`, `Result<T, E>` là ứng dụng quan trọng nhất — phase tiếp theo dạy dùng chúng.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Variant trơn không annotate type | type annotations needed | `let x: Enum<Type> = ...` |
| Dùng `T` không khai `<T>` | Rust tìm type tên T | Khai `<T>` sau tên enum |
| Tưởng `Option`/`Result` là ma thuật | Chỉ là enum generic | Hiểu generic enum |
| `Enum<i32>` ≠ `Enum<String>` nhầm lẫn | Type khác nhau | `T` là phần của type |
| Quên `None` cần annotate | type cần biết | Annotate hoặc dùng trong ngữ cảnh rõ |

## Tóm tắt bài 89

- **Generic enum**: `enum Name<T> { Variant(T) }` — variant kèm dữ liệu type linh hoạt; khai `<T>` sau tên.
- Rust suy `T` từ dữ liệu variant; **variant trơn** (không dữ liệu) cần **annotate** type vì `T` là phần của type.
- **`Option<T>`** = `enum { Some(T), None }` — "có giá trị hoặc không", thay `null` (phase sau).
- **`Result<T, E>`** = `enum { Ok(T), Err(E) }` — "thành công hoặc lỗi", hai generic (phase Error Handling).
- Method trên enum generic: `impl<T> Enum<T>` (như struct, bài 88).
- `Option`/`Result` không ma thuật — chỉ là enum generic; hiểu bài này là hiểu chúng.

**Bài kế tiếp** → [Bài 90: Project & Section Review — ChatMessage generic, tổng kết phase](06-project-va-review.md)
