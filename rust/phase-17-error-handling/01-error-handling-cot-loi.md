# Bài 25: Error handling — panic, Result, `?`, custom error

> Rust không có exception. Mọi error là **value** (`Result<T, E>`) hoặc **abort** (`panic!`). Phase này dạy 2 mode, `?` propagation, convert error type, custom error type với `thiserror`.

## 2 categories error

### Recoverable — `Result<T, E>`
File không tồn tại, network timeout, parse fail. Caller có thể handle/retry.

### Unrecoverable — `panic!`
Bug logic, array out of bound, invariant violation. Program crash là acceptable response.

```rust
fn main() {
    let v = vec![1, 2, 3];
    let _ = v[10];                  // panic: out of bounds
    
    panic!("explicit crash");        // panic with message
}
```

### Panic behavior

```text
thread 'main' panicked at 'index out of bounds: the len is 3 but the index is 10'
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace
```

`RUST_BACKTRACE=1 cargo run` → full stack trace.

### Panic strategy

`Cargo.toml`:
```toml
[profile.release]
panic = "abort"      # smaller binary, no stack unwind
# panic = "unwind"   # default — cleanup via Drop
```

`unwind` = run destructors như Drop. `abort` = exit immediately.

## `Result<T, E>` — recap

```rust
fn parse_age(s: &str) -> Result<u32, std::num::ParseIntError> {
    s.parse::<u32>()
}

fn main() {
    match parse_age("30") {
        Ok(age) => println!("age: {age}"),
        Err(e) => println!("error: {e}"),
    }
}
```

## `?` operator — propagate

```rust
use std::fs::File;
use std::io::Read;

fn read_username() -> Result<String, std::io::Error> {
    let mut s = String::new();
    File::open("user.txt")?.read_to_string(&mut s)?;
    Ok(s)
}
```

`?` expand:
```rust
match expr {
    Ok(v) => v,
    Err(e) => return Err(e.into()),
}
```

`.into()` convert error type — phép thuật giảm boilerplate.

### `?` cho Option

```rust
fn first_char(s: &str) -> Option<char> {
    s.chars().next()
}

fn use_option(s: Option<&str>) -> Option<char> {
    first_char(s?)
}
```

## Chuyển đổi error types

### Cùng error
```rust
fn process() -> Result<(), MyError> {
    let f = File::open("x")?;        // io::Error
    // ERROR — io::Error không tự convert sang MyError
}
```

Cần `From` impl:
```rust
impl From<io::Error> for MyError {
    fn from(e: io::Error) -> Self {
        MyError::Io(e)
    }
}
```

Sau impl `From`, `?` auto convert. Manual: `.map_err(MyError::from)`.

### `Box<dyn Error>` — universal error

```rust
fn process() -> Result<(), Box<dyn std::error::Error>> {
    let f = File::open("x")?;
    let n: i32 = "abc".parse()?;
    Ok(())
}
```

Mọi error type → box dynamic. Quick, ít typesafe — OK cho main + script.

### `anyhow` crate

```toml
[dependencies]
anyhow = "1.0"
```

```rust
use anyhow::{Result, Context};

fn read_config() -> Result<String> {
    let s = std::fs::read_to_string("config.toml")
        .context("failed to read config")?;
    Ok(s)
}
```

`anyhow::Result<T>` = `Result<T, anyhow::Error>` — bao mọi error. `.context("...")` add context. **Production standard** cho application-level error.

## Custom Error type

### Manual

```rust
use std::fmt;

#[derive(Debug)]
enum AppError {
    NotFound,
    Invalid(String),
    Io(std::io::Error),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            AppError::NotFound => write!(f, "not found"),
            AppError::Invalid(s) => write!(f, "invalid: {s}"),
            AppError::Io(e) => write!(f, "io error: {e}"),
        }
    }
}

impl std::error::Error for AppError {}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Io(e)
    }
}
```

Verbose. `thiserror` crate giảm boilerplate.

### `thiserror` — derive macro

```toml
[dependencies]
thiserror = "1.0"
```

```rust
use thiserror::Error;

#[derive(Error, Debug)]
enum AppError {
    #[error("not found")]
    NotFound,
    
    #[error("invalid: {0}")]
    Invalid(String),
    
    #[error("io error")]
    Io(#[from] std::io::Error),
}
```

Auto-derive `Display` + `Error` + `From<io::Error>`. **Production standard** cho library-level typed error.

## `anyhow` vs `thiserror`

| | `anyhow` | `thiserror` |
|---|---|---|
| Use case | Application | Library |
| Error type | Dynamic (`anyhow::Error`) | Custom typed enum |
| Typesafe | Less | More |
| Boilerplate | Min | Medium (less than manual) |
| Context | Built-in `.context()` | Manual |
| Convert | Auto from `Display` | `#[from]` derive |

Common pattern: library use `thiserror`, app/CLI use `anyhow`.

## `Result` method chains

```rust
let result = "42"
    .parse::<i32>()
    .map(|n| n * 2)
    .and_then(|n| if n > 0 { Ok(n) } else { Err("negative") })
    .unwrap_or(0);
```

Functional style — common.

## Panic vs Result — choose

| Use panic when | Use Result when |
|---|---|
| Invariant violated (bug) | External factor (file, network) |
| Programmer error | User input |
| Prototype/example | Library API |
| Test fixture (`assert!`) | Production code |
| Unreachable code (`unreachable!()`) | Anything caller might handle |

### Common panic helpers
```rust
panic!("explicit");
unreachable!("should not get here");
unimplemented!("TODO");
todo!();                                 // sugar for unimplemented
assert!(condition);
assert_eq!(a, b);
debug_assert!(condition);                 // debug-only
```

## Bẫy thường gặp

| Bẫy | Sửa |
|---|---|
| `.unwrap()` mọi nơi | Crash runtime. Use `?`, match, default. |
| `?` trong main return type | `fn main() -> Result<(), Box<dyn Error>>` |
| Forget `From` impl → `?` fail | Implement or `.map_err()`. |
| Custom error verbose | Use `thiserror`. |
| App with typed error overhead | Use `anyhow`. |
| Catch panic with `catch_unwind` | Not idiomatic. Refactor to Result. |
| `assert!` vs `Result` | Test fixture vs runtime API. |
| `expect` vs `unwrap` | `expect("context")` better message. |

## Tóm tắt bài 25

- 2 error categories: `panic!` (unrecoverable) vs `Result<T, E>` (recoverable).
- `?` operator: propagate error, auto convert via `From`.
- `Box<dyn Error>` universal, `anyhow::Error` more ergonomic.
- Custom error: manual or `thiserror` derive macro.
- `anyhow` for app, `thiserror` for library.
- `panic!`, `unreachable!`, `todo!`, `assert!` helpers.
- `RUST_BACKTRACE=1` for full stack trace.

**Bài kế tiếp** → [Bài 26 (phase-18): Traits — interface và polymorphism Rust style](../phase-18-traits/01-trait-cot-loi.md)
