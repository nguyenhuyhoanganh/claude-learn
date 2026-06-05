# Bài 17: Structs — định nghĩa kiểu dữ liệu phức hợp

> Struct = "class without inheritance" trong Rust. Gói nhiều field type khác nhau vào 1 type mới. Bài này dạy 3 dạng struct, methods (`impl`), associated functions, và builder pattern cơ bản.

## Struct cơ bản — named fields

```rust
struct User {
    username: String,
    email: String,
    age: u32,
    active: bool,
}

fn main() {
    let user1 = User {
        username: String::from("alice"),
        email: String::from("alice@example.com"),
        age: 30,
        active: true,
    };
    
    println!("{} ({})", user1.username, user1.email);
}
```

Khai báo struct với keyword `struct`. Field cú pháp `name: Type`. Tạo instance: `Name { field: value, ... }`.

### Field init shorthand

```rust
fn create_user(username: String, email: String) -> User {
    User {
        username,           // ← username: username
        email,              // ← email: email
        age: 18,
        active: true,
    }
}
```

Nếu variable name = field name → omit `: value`.

### Mutate struct

```rust
let mut user = User { ... };
user.age = 31;
user.active = false;
```

`mut` apply lên cả struct — Rust không cho per-field mut. Muốn từng field mut riêng → cell type (phase 27).

### Struct update syntax `..`

```rust
let user1 = User { username: ..., email: ..., age: 30, active: true };

let user2 = User {
    email: String::from("new@example.com"),
    ..user1                  // ← copy field còn lại từ user1
};
```

`..user1` = "everything else from user1". Lưu ý: `user1.username` (String) bị **move** sang user2 — user1 không dùng được nữa cho field đã move.

## Tuple struct

```rust
struct Point(f64, f64);
struct Color(u8, u8, u8);

fn main() {
    let origin = Point(0.0, 0.0);
    let red = Color(255, 0, 0);
    
    println!("{} {}", origin.0, origin.1);
    println!("({}, {}, {})", red.0, red.1, red.2);
}
```

Field unnamed, access qua `.0`, `.1`. Hữu ích khi:
- Name field không cần thiết.
- Newtype pattern (wrap type để có semantic mới).

### Newtype pattern

```rust
struct Meters(f64);
struct Seconds(f64);

fn speed(distance: Meters, time: Seconds) -> f64 {
    distance.0 / time.0
}

fn main() {
    let d = Meters(100.0);
    let t = Seconds(10.0);
    println!("{} m/s", speed(d, t));
}
```

`Meters` ≠ `Seconds` dù cả 2 wrap `f64`. Compile catch nếu nhầm:
```rust
speed(t, d);    // ERROR — type mismatch
```

Strong typing for the win.

## Unit-like struct

```rust
struct AlwaysEqual;

fn main() {
    let s = AlwaysEqual;
}
```

Không field. Hữu ích với trait (phase 18) — mark type cho behavior, không cần data.

## Method với `impl`

```rust
struct Rectangle {
    width: u32,
    height: u32,
}

impl Rectangle {
    fn area(&self) -> u32 {
        self.width * self.height
    }
    
    fn perimeter(&self) -> u32 {
        2 * (self.width + self.height)
    }
    
    fn can_hold(&self, other: &Rectangle) -> bool {
        self.width > other.width && self.height > other.height
    }
}

fn main() {
    let r1 = Rectangle { width: 30, height: 50 };
    let r2 = Rectangle { width: 10, height: 40 };
    
    println!("area: {}", r1.area());
    println!("can hold r2: {}", r1.can_hold(&r2));
}
```

`impl StructName { ... }` block chứa methods. First param:
- `&self` — read-only borrow (đọc).
- `&mut self` — mutable borrow (modify).
- `self` — take ownership (consume).

`self` ≈ `this` trong OOP, nhưng explicit về borrowing.

### Method signatures

```rust
impl Rectangle {
    fn area(&self) -> u32 { ... }                // read
    fn double(&mut self) { ... }                  // modify
    fn destroy(self) -> String { ... }             // consume
}
```

3 kiểu phục vụ 3 use case khác nhau.

## Associated function — không có `self`

```rust
impl Rectangle {
    fn new(w: u32, h: u32) -> Rectangle {
        Rectangle { width: w, height: h }
    }
    
    fn square(size: u32) -> Rectangle {
        Rectangle { width: size, height: size }
    }
}

fn main() {
    let r = Rectangle::new(30, 50);
    let s = Rectangle::square(20);
}
```

Không có `self` → "static method" trong OOP terminology. Gọi qua `Type::function_name()`.

Convention: `new` cho constructor chính, additional constructors named `from_X`, `with_X`.

### Multiple `impl` blocks

```rust
impl Rectangle {
    fn area(&self) -> u32 { ... }
}

impl Rectangle {
    fn perimeter(&self) -> u32 { ... }
}
```

Cả 2 OK — Rust gộp lại. Hữu ích cho organize code, conditional compilation.

## Builder pattern

Khi struct nhiều field optional:

```rust
struct Config {
    host: String,
    port: u16,
    timeout_ms: u32,
    retries: u8,
}

impl Config {
    fn new(host: String) -> Self {
        Config {
            host,
            port: 8080,
            timeout_ms: 5000,
            retries: 3,
        }
    }
    
    fn port(mut self, p: u16) -> Self {
        self.port = p;
        self
    }
    
    fn timeout(mut self, ms: u32) -> Self {
        self.timeout_ms = ms;
        self
    }
}

fn main() {
    let config = Config::new(String::from("localhost"))
        .port(9090)
        .timeout(10000);
}
```

`Self` = alias cho struct name trong `impl` block. Take + return self → chain calls.

## Debug print — `#[derive(Debug)]`

```rust
#[derive(Debug)]
struct Point {
    x: f64,
    y: f64,
}

fn main() {
    let p = Point { x: 1.0, y: 2.0 };
    println!("{:?}", p);          // Point { x: 1.0, y: 2.0 }
    println!("{:#?}", p);          // pretty
}
```

`#[derive(Debug)]` = "auto-implement Debug trait". Phase Traits (18) đào sâu derive.

Common derives:
- `Debug` — `{:?}` print.
- `Clone` — `.clone()` deep copy.
- `Copy` — implicit copy (chỉ struct toàn Copy field).
- `PartialEq, Eq` — `==` compare.
- `Hash` — dùng làm HashMap key.

```rust
#[derive(Debug, Clone, PartialEq)]
struct User { ... }
```

## Field visibility — `pub`

```rust
pub struct Point {
    pub x: f64,
    pub y: f64,                   // public
    private: bool,                // private — only same module
}

impl Point {
    pub fn new(x: f64, y: f64) -> Self {
        Point { x, y, private: false }
    }
}
```

Default = private (module level). `pub` expose ra ngoài. Phase Project Structure (14) đào sâu.

## Bẫy thường gặp

| Bẫy | Sửa |
|---|---|
| Mut per-field | Không hỗ trợ. Cell type cho interior mutability. |
| Update `..other` move ownership | Field đã move không dùng được. Clone explicit. |
| Method `&mut self` khi instance không mut | Compile error. Khai `let mut x`. |
| Forget `&` trong `r1.can_hold(&r2)` | `can_hold(other: &Rectangle)` — pass `&r2`. |
| Tuple struct nhầm với tuple | `Point(1.0, 2.0)` khác `(1.0, 2.0)` — type khác. |
| Compare struct without `PartialEq` | Derive `PartialEq`. |
| Print without `Debug` | Derive `Debug`, dùng `{:?}`. |
| Self vs self | `Self` (capital) = type alias; `self` = instance ref. |

## Tóm tắt bài 17

- 3 dạng struct: named field, tuple struct (unnamed), unit-like (không field).
- Tạo instance `Name { field: value, ... }`. Update syntax `..other`.
- `impl Name { fn method(&self) ... }` for methods.
- `&self`, `&mut self`, `self` — 3 receiver kiểu khác.
- Associated function (no `self`) gọi qua `Type::function()`.
- Builder pattern: take + return Self, chain method.
- `#[derive(Debug, Clone, ...)]` auto-implement common traits.

**Bài kế tiếp** → [Bài 18 (phase-10): Enums — kiểu dữ liệu tổng hợp với variant](../phase-10-enums/01-enum-cot-loi.md)
