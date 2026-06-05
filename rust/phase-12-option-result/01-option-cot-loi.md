# Bài 20: Option và Result — thay null pointer và exception

> "I call it my billion-dollar mistake" — Tony Hoare về null pointer (1965). Rust **không có null**. Thay bằng `Option<T>` — type system buộc bạn check absence trước khi dùng. `Result<T, E>` thay exception. 2 enum tưởng nhỏ này là **trái tim** của Rust safety.

## Option — "có thể có hoặc không"

```rust
enum Option<T> {
    Some(T),
    None,
}
```

`Option<T>` = "value type T **hoặc** không có gì".

```rust
fn divide(a: f64, b: f64) -> Option<f64> {
    if b == 0.0 {
        None
    } else {
        Some(a / b)
    }
}

fn main() {
    match divide(10.0, 2.0) {
        Some(result) => println!("got {result}"),
        None => println!("cannot divide by zero"),
    }
}
```

Caller **buộc** xử lý cả 2 case. Compiler không cho skip `None`.

### Tại sao không null

C/Java/JS: `null` là valid value của mọi pointer/reference type. Forget check → NullPointerException.

```java
String name = getUser().getName();    // null thì NPE
```

Rust loại null hoàn toàn:
```rust
fn get_name() -> Option<String> { ... }

let n = get_name();
println!("{}", n);             // ERROR — n is Option<String>, not String
println!("{}", n.unwrap());     // có thể panic, nhưng explicit
```

Type system force handle. Bug compile-time.

## Common Option methods

### `unwrap` — panic on None
```rust
let x: Option<i32> = Some(5);
let v = x.unwrap();             // 5

let y: Option<i32> = None;
let v = y.unwrap();             // panic!
```

Dùng khi chắc chắn `Some`. Production thường avoid.

### `unwrap_or` — default value
```rust
let x: Option<i32> = None;
let v = x.unwrap_or(0);          // 0
```

### `unwrap_or_else` — lazy default
```rust
let v = some_option.unwrap_or_else(|| expensive_default());
```

Closure chỉ gọi khi `None` — không tốn CPU nếu `Some`.

### `unwrap_or_default`
```rust
let x: Option<i32> = None;
let v = x.unwrap_or_default();   // 0 (default of i32)
```

### `expect` — panic với message
```rust
let v = some_option.expect("config file should exist");
```

Tốt hơn `unwrap()` vì error message rõ context.

### `map` — transform inside
```rust
let x = Some(5);
let y = x.map(|n| n * 2);       // Some(10)

let z: Option<i32> = None;
let w = z.map(|n| n * 2);       // None
```

`map(f)`: `Some(v) → Some(f(v))`, `None → None`. Functional style.

### `and_then` — chain Option-returning fn
```rust
fn double_if_positive(n: i32) -> Option<i32> {
    if n > 0 { Some(n * 2) } else { None }
}

let r = Some(5).and_then(double_if_positive);   // Some(10)
let r = Some(-1).and_then(double_if_positive);  // None
```

`and_then(f)` (flatmap): `Some(v) → f(v)`, `None → None`. Avoid nested `Some(Some(...))`.

### `is_some` / `is_none`
```rust
let x = Some(5);
if x.is_some() { println!("got value"); }
```

Check không destruct.

### `if let` — clean check
```rust
if let Some(v) = x {
    println!("value: {v}");
}
```

Idiomatic cho single-arm match.

## Result — "thành công hoặc lỗi"

```rust
enum Result<T, E> {
    Ok(T),
    Err(E),
}
```

`Result<T, E>` = "thành công type T **hoặc** lỗi type E".

```rust
fn parse_int(s: &str) -> Result<i32, std::num::ParseIntError> {
    s.parse::<i32>()
}

fn main() {
    match parse_int("42") {
        Ok(n) => println!("got {n}"),
        Err(e) => println!("error: {e}"),
    }
}
```

### Common Result methods

```rust
let r: Result<i32, String> = Ok(5);

r.unwrap();                      // 5
r.expect("should be ok");        // 5

r.unwrap_or(0);                  // 5
r.unwrap_or_else(|e| 0);          // 5

r.is_ok();                       // true
r.is_err();                       // false

r.map(|n| n * 2);                 // Ok(10)
r.map_err(|e| e.to_uppercase()); // Err transform

r.and_then(|n| Ok(n + 1));        // chain
r.or_else(|_| Ok(0));             // recover from Err
```

Pattern giống Option.

### `?` operator — propagate error

```rust
fn read_username() -> Result<String, std::io::Error> {
    let mut s = String::new();
    std::fs::File::open("user.txt")?       // Err → early return
        .read_to_string(&mut s)?;          // Err → early return
    Ok(s)
}
```

`?` expand thành:
```rust
match expr {
    Ok(v) => v,
    Err(e) => return Err(e.into()),
}
```

Chain operations cleanly. Phase Error Handling (17) đào sâu.

### `?` cho Option

```rust
fn first_char(s: Option<&str>) -> Option<char> {
    Some(s?.chars().next()?)
}
```

Cùng concept — propagate None.

## Option/Result tương tác

### Convert qua lại

```rust
let opt: Option<i32> = Some(5);
let res: Result<i32, &str> = opt.ok_or("no value");      // Ok(5)

let res: Result<i32, String> = Ok(5);
let opt: Option<i32> = res.ok();                          // Some(5)

let res: Result<i32, String> = Err("bad".into());
let opt: Option<i32> = res.ok();                          // None — lose error info
```

### Collect

```rust
let results: Vec<Result<i32, String>> = vec![Ok(1), Ok(2), Err("oops".into())];

// Collect thành Result<Vec<i32>, String> — short-circuit on first Err
let combined: Result<Vec<i32>, String> = results.into_iter().collect();
// combined = Err("oops")
```

`collect()` có magic — gộp `Vec<Result>` thành `Result<Vec>`.

## Vì sao Option/Result tốt hơn null + exception

| | null + exception | Option / Result |
|---|---|---|
| Caller biết về failure? | Không — phải đọc doc | Có — type signature rõ |
| Forget handle | Runtime crash (NPE) | Compile error |
| Performance | Exception unwind cost | Zero — chỉ branch |
| Document expected error | Throws clause (Java) hoặc nothing | Type `Result<T, E>` explicit |
| Compose | try-catch verbose | `?` operator clean |

Rust force **explicit error handling**. Code dài hơn lúc đầu — bug ít hơn maintain.

## Bẫy thường gặp

| Bẫy | Sửa |
|---|---|
| `.unwrap()` everywhere | Panic risk. Use `?`, match, hoặc default. |
| Forget `Some()` wrap | `return value` thay `return Some(value)`. |
| `if x { ... }` với Option | Compile error. `if let Some(v) = x`. |
| Match không cover None | Compile error — bắt buộc exhaustive. |
| `?` trên Result trong fn return Option | Type mismatch. Need consistent. |
| Lose error info `.ok()` | Sometimes OK, sometimes mất context. |
| `if x.is_some() { x.unwrap() }` | Verbose. `if let Some(v) = x`. |
| Map nested → `Some(Some(...))` | Dùng `and_then` (flatmap). |

## Tóm tắt bài 20

- `Option<T>`: `Some(T)` hoặc `None`. Thay null pointer.
- `Result<T, E>`: `Ok(T)` hoặc `Err(E)`. Thay exception.
- Methods: `unwrap`, `unwrap_or`, `expect`, `map`, `and_then`, `is_some`, `?`.
- `?` operator: early-return on `None`/`Err`, propagate cleanly.
- Compiler force handle — bug compile-time, không runtime crash.
- Convert Option ↔ Result với `ok_or`, `ok()`.

**Bài kế tiếp** → [Bài 21 (phase-13): Vectors — dynamic array](../phase-13-vectors/01-vec-cot-loi.md)
