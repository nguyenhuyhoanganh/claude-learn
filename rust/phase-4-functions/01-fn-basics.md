# Bài 12: Functions — parameters, return, statement vs expression

> Rust function khác Python/JS ở một điểm quan trọng: **expression-based**. Block cuối cùng không có `;` chính là return value. Bài này dạy fn syntax, parameters, return type, và phân biệt statement vs expression — concept fundamental dùng suốt khoá.

## Khai báo function

```rust
fn greet() {
    println!("Hello!");
}

fn main() {
    greet();
    greet();
    greet();
}
```

`fn name() { ... }`. Gọi: `name()`.

Order khai báo **không quan trọng** — Rust scan toàn file trước khi resolve calls. `main` có thể gọi function khai báo phía dưới.

```rust
fn main() {
    other();         // OK dù other khai báo bên dưới
}

fn other() {
    println!("Other");
}
```

## Parameters — input

```rust
fn greet(name: &str) {
    println!("Hello, {name}!");
}

fn main() {
    greet("Alice");
    greet("Bob");
}
```

Cú pháp: `name: Type` — type **bắt buộc**.

Nhiều params:

```rust
fn print_user(name: &str, age: u32, height: f64) {
    println!("{name}, {age}, {height:.2}m");
}

fn main() {
    print_user("Alice", 30, 1.65);
}
```

Order = order khai báo. Không có "named arguments" như Python `f(name=...)`.

### Vì sao bắt buộc annotate type

Rust strong + static typed. Compiler verify type tại call site. Nếu signature ambiguous, function reusable kém + bug type lurk.

```rust
fn add(a: i32, b: i32) -> i32 {
    a + b
}

add(1, 2);          // OK
add(1.5, 2.5);      // ERROR — expected i32, got f64
```

## Return value

```rust
fn add(a: i32, b: i32) -> i32 {
    a + b              // ← không có ; — đây là return
}

fn main() {
    let sum = add(5, 10);
    println!("{sum}");  // 15
}
```

Cú pháp return type: `-> Type` sau `()`.

### 2 cách return

**Cách 1: Implicit return** (idiomatic):
```rust
fn double(x: i32) -> i32 {
    x * 2          // expression, không ;
}
```

**Cách 2: Explicit `return`**:
```rust
fn double(x: i32) -> i32 {
    return x * 2;  // có ;
}
```

Explicit `return` chỉ dùng khi early return:

```rust
fn safe_divide(a: f64, b: f64) -> f64 {
    if b == 0.0 {
        return 0.0;     // early return
    }
    a / b               // implicit return
}
```

### Statement vs Expression — concept quan trọng

| | Statement | Expression |
|---|---|---|
| Định nghĩa | Làm việc gì | Tính ra giá trị |
| Có `;` cuối | Có | Không (khi dùng làm value) |
| Trả value | Không (trả `()`) | Có |
| Ví dụ | `let x = 5;` | `5 + 3`, `x * 2`, `if x { 1 } else { 2 }` |

```rust
let x = 5;                  // statement
let y = x * 2;              // statement; `x * 2` là expression
let z = { let a = 5; a + 1 }; // block là expression, return 6
```

**Block `{ ... }`** cũng là expression. Giá trị của block = giá trị của expression cuối cùng (không `;`).

```rust
let result = {
    let x = 10;
    let y = 20;
    x + y           // ← block trả về 30
};
println!("{result}");  // 30
```

Đây là cách Rust **không cần** keyword `return` ở cuối function — body của function là 1 block, expression cuối là return value.

### `if` là expression

```rust
let max = if a > b { a } else { b };
```

Đây là **ternary** của Rust. Khác C `a > b ? a : b` ở syntax nhưng cùng concept.

### Tail semicolon biến expression thành statement

```rust
fn double(x: i32) -> i32 {
    x * 2;          // ; → biến thành statement, return ()
}
```

```text
error[E0308]: mismatched types
  expected `i32`, found `()`
```

Compiler báo: function khai báo return `i32`, mà body return `()` (unit). Sửa: xoá `;`.

Đây là **bẫy lớn nhất** beginner. Quên `;` (hoặc thêm thừa) làm compile fail.

## Unit return — `()`

Nếu function không return gì:

```rust
fn log(msg: &str) {
    println!("[LOG] {msg}");
}
```

Implicit return type `()`. Tương đương:

```rust
fn log(msg: &str) -> () {
    println!("[LOG] {msg}");
}
```

Cả 2 OK. Convention: omit `-> ()`.

## Pass by value vs reference — preview

```rust
fn double_owned(x: i32) -> i32 {
    x * 2
}

fn double_ref(x: &i32) -> i32 {
    *x * 2
}

fn main() {
    let n = 5;
    let a = double_owned(n);    // copy n (i32 implement Copy)
    let b = double_ref(&n);     // pass reference
    println!("{a} {b}");
}
```

- `x: i32` → pass by value (copy với Copy type).
- `x: &i32` → pass by reference.

Phase Ownership (6) + References (7) đào sâu. Lúc này biết: scalar type (`i32`, `f64`, `bool`, `char`) có `Copy` trait → copy tự do. `String`, `Vec` không Copy → cần `&` hoặc transfer ownership.

## Function as first-class value

Function có thể assign vào variable:

```rust
fn add(a: i32, b: i32) -> i32 { a + b }

fn main() {
    let f = add;
    println!("{}", f(2, 3));    // 5
    
    let g: fn(i32, i32) -> i32 = add;
    println!("{}", g(4, 5));    // 9
}
```

`fn(i32, i32) -> i32` = function pointer type.

Closure (phase 20) tổng quát hơn — capture environment.

## Recursion

```rust
fn factorial(n: u64) -> u64 {
    if n <= 1 {
        1
    } else {
        n * factorial(n - 1)
    }
}

fn main() {
    println!("{}", factorial(10));   // 3628800
}
```

Hoạt động như mọi language. Cẩn thận stack overflow với deep recursion — Rust không tail-call optimize.

## Bẫy thường gặp

| Bẫy | Sửa |
|---|---|
| `;` cuối return expression → type mismatch | Xoá `;`. |
| Quên `-> Type` khi return value | Compiler báo expected `()` found `i32`. Thêm return type. |
| `return value` mà có `;` rồi expression | `return x;` rồi `y` dưới — y không reachable. Dead code. |
| Function gọi function chưa khai báo trong cùng module | OK với Rust — không cần forward declaration như C. |
| Generic function thiếu bound | `fn foo<T>(x: T) { x + 1 }` SAI vì T không guarantee `+`. Cần `T: Add`. |
| Parameter `&str` literal pass `&String` | Compile OK — auto deref. |
| Return reference từ local | Borrow error — local drop. Phase Lifetimes. |

## Tóm tắt bài 12

- `fn name(p: Type) -> ReturnType { body }`.
- Parameters bắt buộc type annotation.
- Return: implicit (expression cuối, không `;`) hoặc `return value;` explicit.
- Block `{ ... }` là expression — value = expression cuối, không `;`.
- `if/else` cũng là expression — dùng làm value được.
- `;` biến expression thành statement (return `()`).
- Unit return `()` omit được trong signature.

**Bài kế tiếp** → [Bài 13: Control flow — if, loops, match preview](../phase-5-control-flow/01-if-loops.md)
