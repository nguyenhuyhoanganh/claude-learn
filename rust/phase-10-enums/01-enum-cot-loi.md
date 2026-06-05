# Bài 18: Enums và match — tổng hợp variant + pattern matching

> Enum Rust khác C: mỗi variant **có thể chứa data**. Đây là **sum type** trong type theory, cho phép express "value là X **hoặc** Y **hoặc** Z" cực gọn. Kết hợp với `match` → exhaustive pattern matching catch logic bug tại compile time.

## Enum cơ bản

```rust
enum Direction {
    North,
    South,
    East,
    West,
}

fn main() {
    let d = Direction::North;
    
    match d {
        Direction::North => println!("up"),
        Direction::South => println!("down"),
        Direction::East => println!("right"),
        Direction::West => println!("left"),
    }
}
```

`enum Name { Variant1, Variant2, ... }`. Tạo: `Name::Variant`. Match: list mọi variant.

### Enum với data

```rust
enum Shape {
    Circle(f64),                        // 1 field
    Rectangle(f64, f64),                 // tuple
    Triangle { a: f64, b: f64, c: f64 }, // named field
}

fn main() {
    let s1 = Shape::Circle(1.5);
    let s2 = Shape::Rectangle(3.0, 4.0);
    let s3 = Shape::Triangle { a: 3.0, b: 4.0, c: 5.0 };
}
```

Variant có thể chứa:
- Không gì (`North`).
- 1+ unnamed field (tuple variant).
- Named field (struct-like variant).

Đây là **sum type** — value chỉ là **1** trong các variant tại 1 thời điểm.

### `impl` cho enum

```rust
impl Shape {
    fn area(&self) -> f64 {
        match self {
            Shape::Circle(r) => std::f64::consts::PI * r * r,
            Shape::Rectangle(w, h) => w * h,
            Shape::Triangle { a, b, c } => {
                let s = (a + b + c) / 2.0;
                (s * (s - a) * (s - b) * (s - c)).sqrt()
            }
        }
    }
}
```

Method work giống struct. `&self` matches against variants.

## `match` — exhaustive pattern matching

```rust
let n = 3;
match n {
    1 => println!("one"),
    2 => println!("two"),
    3 => println!("three"),
    _ => println!("other"),       // catch-all
}
```

Mỗi arm: `pattern => expression`. **Exhaustive** — phải cover mọi case, hoặc compiler báo lỗi.

### `_` wildcard

```rust
match n {
    1 | 2 | 3 => println!("small"),    // OR pattern
    4..=10 => println!("medium"),       // range
    _ => println!("large"),             // catch all
}
```

### Binding với `@`

```rust
let n = 5;
match n {
    x @ 1..=5 => println!("small: {x}"),
    x @ 6..=10 => println!("medium: {x}"),
    _ => println!("large"),
}
```

`@` capture matched value vào variable.

### Guard

```rust
let pair = (1, 2);
match pair {
    (x, y) if x == y => println!("equal"),
    (x, y) if x > y => println!("x bigger"),
    _ => println!("y bigger"),
}
```

`if` condition sau pattern.

### Destructure struct/tuple

```rust
struct Point { x: i32, y: i32 }
let p = Point { x: 1, y: 2 };

match p {
    Point { x: 0, y: 0 } => println!("origin"),
    Point { x, y: 0 } => println!("on x-axis at {x}"),
    Point { x: 0, y } => println!("on y-axis at {y}"),
    Point { x, y } => println!("at ({x}, {y})"),
}
```

Cực mạnh — pattern matching trên field.

## `if let` — match shorthand

Khi chỉ care 1 variant:

```rust
let val = Some(5);

// Verbose match
match val {
    Some(x) => println!("{x}"),
    None => (),
}

// Idiomatic if let
if let Some(x) = val {
    println!("{x}");
}
```

`if let pattern = expr { ... }`. Concise cho single-variant match.

### `if let else`

```rust
if let Some(x) = val {
    println!("got {x}");
} else {
    println!("none");
}
```

## `while let` — loop với pattern

```rust
let mut stack = vec![1, 2, 3];

while let Some(x) = stack.pop() {
    println!("{x}");
}
// 3, 2, 1
```

Loop chừng nào pattern match. Khi `None` → thoát.

## Enum với discriminant

```rust
enum Status {
    Active = 1,
    Inactive = 0,
    Pending = 2,
}

fn main() {
    let s = Status::Active;
    println!("{}", s as i32);     // 1
}
```

Mỗi variant có integer discriminant. Cast `as i32`. C-style enum.

## Option và Result — preview

Rust standard library define 2 enum siêu quan trọng:

```rust
enum Option<T> {
    Some(T),
    None,
}

enum Result<T, E> {
    Ok(T),
    Err(E),
}
```

Thay null pointer + exception bằng explicit type. Phase Option/Result (12) đào sâu.

## Method dispatch — polymorphism qua enum

```rust
enum Animal {
    Dog,
    Cat,
    Fish,
}

impl Animal {
    fn speak(&self) -> &str {
        match self {
            Animal::Dog => "Woof",
            Animal::Cat => "Meow",
            Animal::Fish => "...",
        }
    }
}
```

Polymorphism mà không cần inheritance. Compile-time dispatch — fast.

## Sum type vs Product type

| | Sum (enum) | Product (struct) |
|---|---|---|
| Value là | 1 trong N variants | tất cả N fields cùng lúc |
| Example | `Either<A, B>` | `(A, B)` |
| Constructor | `Variant(value)` | `Struct { field: value, ... }` |
| Destructure | `match` / `if let` | direct access `.field` |

Real systems thường mix cả 2: `struct User { status: Status }` với `enum Status { Active, Suspended(String) }`.

## Bẫy thường gặp

| Bẫy | Sửa |
|---|---|
| Match không exhaustive | Compile error. Thêm `_` hoặc list missing variant. |
| Quên `Name::` prefix | `North` thay `Direction::North` SAI (trừ when `use Direction::*`). |
| Pattern variable shadow outer | `match x { y => ... }` — y là binding mới, không phải compare. |
| `if let Some(x) = ...` mà x dùng ngoài | x scope chỉ trong branch. |
| Enum to lớn tốn RAM | Variant size = max của variants. Box value lớn. |
| Compare enum without `PartialEq` | Derive `PartialEq`. |
| `match` arm rớt `=>` | Syntax error. |
| Catch-all `_` đặt trước explicit case | Unreachable. Compiler warn. |

## Tóm tắt bài 18

- Enum = sum type — value là 1 trong các variants.
- Variant có thể chứa data (unnamed tuple, named struct).
- `impl Enum { ... }` cho methods.
- `match` exhaustive, mỗi arm `pat => expr`. Bind `@`, guard `if`, OR `|`, range `..=`.
- `if let` / `while let` shorthand cho single-variant match.
- Sum type + product type combine tạo systems mạnh.
- `Option<T>` và `Result<T, E>` là enum quan trọng nhất stdlib.

**Bài kế tiếp** → [Bài 19 (phase-11): Generics — code reusable theo type](../phase-11-generics/01-generics-cot-loi.md)
