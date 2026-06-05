# Bài 22: Project structure — modules, crates, workspaces

> Project lớn không nhét hết vào 1 `main.rs`. Rust có hệ thống: **module** chia code logical, **crate** = unit compile, **workspace** = nhiều crate cùng repo. Bài này dạy cấu trúc + visibility + `use` imports.

## Module — chia code

### Inline module
```rust
// main.rs
mod math {
    pub fn add(a: i32, b: i32) -> i32 { a + b }
    pub fn sub(a: i32, b: i32) -> i32 { a - b }
}

fn main() {
    println!("{}", math::add(2, 3));
    println!("{}", math::sub(10, 4));
}
```

`mod name { ... }` define module. `name::function()` access. `pub` để expose.

### Module in file riêng

```text
src/
├── main.rs
└── math.rs
```

`src/main.rs`:
```rust
mod math;            // load src/math.rs

fn main() {
    println!("{}", math::add(2, 3));
}
```

`src/math.rs`:
```rust
pub fn add(a: i32, b: i32) -> i32 { a + b }
pub fn sub(a: i32, b: i32) -> i32 { a - b }
```

`mod math;` (without body) → load từ `math.rs` cùng folder.

### Nested module (folder)

```text
src/
├── main.rs
└── shapes/
    ├── mod.rs           ← entry point (cũ)
    ├── circle.rs
    └── rectangle.rs
```

Hoặc Rust 2018+:

```text
src/
├── main.rs
├── shapes.rs            ← entry point (mới)
└── shapes/
    ├── circle.rs
    └── rectangle.rs
```

`src/shapes.rs`:
```rust
pub mod circle;
pub mod rectangle;
```

`src/main.rs`:
```rust
mod shapes;

fn main() {
    let c = shapes::circle::Circle { radius: 1.0 };
    let r = shapes::rectangle::Rectangle { width: 3.0, height: 4.0 };
}
```

## Visibility — `pub`

Default: private (chỉ module hiện tại + descendants).

```rust
mod outer {
    fn private_fn() { }           // chỉ outer + inner thấy
    pub fn public_fn() { }        // public

    pub mod inner {
        pub fn deep_fn() { }      // public, accessible
        fn deep_private() { }     // private
    }
}

fn main() {
    outer::public_fn();              // OK
    outer::inner::deep_fn();          // OK
    // outer::private_fn();          // ERROR — private
}
```

### `pub(crate)`, `pub(super)`, `pub(in path)`

```rust
mod outer {
    pub(crate) fn crate_only() { }   // visible cả crate
    pub(super) fn parent_only() { }   // visible parent module
    pub(in crate::other) fn restricted() { }  // restricted path
}
```

Fine-grained visibility. `pub(crate)` rất common.

## Struct/Enum visibility

```rust
mod data {
    pub struct User {
        pub username: String,
        email: String,                // private field
    }
    
    impl User {
        pub fn new(u: String) -> Self {
            User { username: u, email: String::new() }
        }
    }
}

fn main() {
    let u = data::User::new("alice".into());
    println!("{}", u.username);          // OK
    // println!("{}", u.email);           // ERROR
}
```

Field/method visibility independent. Struct `pub` không auto pub field.

Enum khác — `pub enum` → variants tự động pub:
```rust
pub enum Direction {
    North,                                // tự động pub
    South,
}
```

## `use` — import path

```rust
use std::collections::HashMap;
use std::io::{self, Read, Write};         // group
use std::fmt::*;                            // glob — discouraged
use std::process::Command as Cmd;           // alias

fn main() {
    let m: HashMap<String, i32> = HashMap::new();
}
```

### Patterns

```rust
use crate::module::Item;                  // tuyệt đối từ crate root
use super::sibling::Item;                  // parent module
use self::child::Item;                     // current module
use std::collections::HashMap;             // external crate
```

### `pub use` re-export

```rust
mod inner {
    pub fn deeply_nested() { }
}

pub use inner::deeply_nested;             // expose at parent level

fn main() {
    // External user can call: crate::deeply_nested()
}
```

Hữu ích để flatten API.

## Crate vs Module

| | Crate | Module |
|---|---|---|
| Unit | Compile | Organize |
| Has Cargo.toml | Có | Không |
| Entry | `main.rs` (binary) / `lib.rs` (library) | `mod.rs` / `name.rs` |
| External use | Add to Cargo.toml `[dependencies]` | `mod` declare |

## Workspace — multiple crates

```text
my-project/
├── Cargo.toml              ← workspace root
├── app/
│   ├── Cargo.toml
│   └── src/main.rs
├── lib1/
│   ├── Cargo.toml
│   └── src/lib.rs
└── lib2/
    ├── Cargo.toml
    └── src/lib.rs
```

`Cargo.toml` root:
```toml
[workspace]
members = ["app", "lib1", "lib2"]
```

Mỗi sub-crate là package riêng nhưng share `target/` build cache.

Inter-dependency:
```toml
# app/Cargo.toml
[dependencies]
lib1 = { path = "../lib1" }
lib2 = { path = "../lib2" }
```

Build cả workspace:
```text
$ cargo build              # build all
$ cargo build -p app       # build specific
$ cargo test               # test all
```

## External crate (from crates.io)

`Cargo.toml`:
```toml
[dependencies]
serde = "1.0"
tokio = { version = "1.0", features = ["full"] }
rand = "0.8"
```

`main.rs`:
```rust
use rand::Rng;

fn main() {
    let n = rand::thread_rng().gen_range(1..=100);
    println!("{n}");
}
```

`cargo build` auto download + compile. Lock version in `Cargo.lock`.

### Version specifier

- `"1.0"` = `^1.0` = `>=1.0.0, <2.0.0` (compatible).
- `"1.2.3"` = `^1.2.3` = `>=1.2.3, <2.0.0`.
- `"=1.0.0"` = exactly.
- `"~1.2"` = `>=1.2.0, <1.3.0`.
- `"*"` = any (avoid).

Semantic versioning convention.

## Standard library prelude

Auto-import:
```rust
// Tự động pub use std::prelude::*; cho mọi file
// Bao gồm: String, Vec, Option, Result, Box, ToString, ...
```

Không cần `use std::vec::Vec;` — đã prelude.

## Bẫy thường gặp

| Bẫy | Sửa |
|---|---|
| Forget `pub` → caller can't access | Add `pub` to expose. |
| File `math.rs` nhưng `mod` không declare | `mod math;` ở parent. |
| Circular module dep | Refactor — extract common to separate module. |
| `use` nhưng forget name | `use foo::bar as baz` alias. |
| Workspace dependency version conflict | Cargo resolve — sometimes need `[workspace.dependencies]` unified. |
| Visibility nested confusing | `pub(crate)` cho "internal API". |
| `mod foo; mod foo;` duplicate | Compile error. |
| External crate not in Cargo.toml | Add to `[dependencies]`. |

## Tóm tắt bài 22

- `mod` chia code trong file/folder. Default private, `pub` expose.
- File layout: `src/foo.rs` hoặc `src/foo/mod.rs` (legacy) hoặc `src/foo.rs + src/foo/...` (Rust 2018+).
- `use path::Item;` import. `pub use` re-export.
- `pub(crate)`, `pub(super)` fine-grained visibility.
- Crate = compile unit. Workspace = nhiều crate cùng repo.
- External crate via `Cargo.toml [dependencies]`. Semver version `"1.0"`.
- Prelude auto-import: String, Vec, Option, Result, Box.

**Bài kế tiếp** → [Bài 23 (phase-15): String trong Rust — phức tạp hơn bạn nghĩ](../phase-15-strings/01-string-cot-loi.md)
