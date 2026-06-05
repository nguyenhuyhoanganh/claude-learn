# Bài 30: Testing — unit, integration, doc tests built-in

> Rust **built-in test framework** — không cần external framework như JUnit. `cargo test` chạy mọi test. 3 loại: unit (same file), integration (folder `tests/`), doc tests (trong comment). Bài này dạy cả 3.

## Unit test — `#[test]`

Đặt trong cùng file với code:

```rust
fn add(a: i32, b: i32) -> i32 { a + b }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add() {
        assert_eq!(add(2, 3), 5);
        assert_eq!(add(-1, 1), 0);
    }

    #[test]
    fn test_negative() {
        assert_eq!(add(-5, -3), -8);
    }
}
```

3 parts:
- `#[cfg(test)]` — compile chỉ khi run test (skip ở `cargo build`).
- `mod tests` — convention name module test.
- `#[test]` annotation mỗi function test.

Run:
```text
$ cargo test
running 2 tests
test tests::test_add ... ok
test tests::test_negative ... ok

test result: ok. 2 passed; 0 failed
```

## Assertions

```rust
assert!(condition);                          // true expected
assert_eq!(a, b);                             // equality
assert_ne!(a, b);                             // inequality

// With custom message
assert!(x > 0, "x should be positive, got {x}");
assert_eq!(actual, expected, "computation wrong for input {input}");
```

`assert_eq!`/`assert_ne!` print both values on fail — clear diff.

## Test functions — patterns

### Setup + teardown

```rust
#[test]
fn test_with_setup() {
    let env = setup_test_env();         // helper function
    
    // test logic
    assert_eq!(env.compute(), 42);
    
    // teardown handled by Drop on env
}

fn setup_test_env() -> TestEnv {
    TestEnv::new()
}
```

Rust no special "fixture" — use helper functions.

### Test should panic

```rust
#[test]
#[should_panic]
fn test_divide_by_zero() {
    divide(1.0, 0.0);
}

#[test]
#[should_panic(expected = "divide by zero")]
fn test_divide_specific_msg() {
    divide(1.0, 0.0);
}
```

Test "expected panic" — useful for guard logic.

### Return Result

```rust
#[test]
fn test_with_result() -> Result<(), Box<dyn std::error::Error>> {
    let x: i32 = "42".parse()?;
    assert_eq!(x, 42);
    Ok(())
}
```

Use `?` in test — cleaner than `.unwrap()`.

### Ignore expensive tests

```rust
#[test]
#[ignore]
fn expensive_test() {
    // long-running
}
```

Skip default. Run with `cargo test -- --ignored`.

## Integration tests — folder `tests/`

```text
my-project/
├── Cargo.toml
├── src/
│   └── lib.rs
└── tests/
    ├── integration_test.rs
    └── another_test.rs
```

`tests/integration_test.rs`:
```rust
use my_project::add;       // import from lib

#[test]
fn test_public_api() {
    assert_eq!(add(2, 3), 5);
}
```

Each file in `tests/` = separate crate compiled. Tests public API only — like external user.

Run:
```text
$ cargo test
   Running unittests src/lib.rs (target/debug/deps/...)
   Running tests/integration_test.rs (target/debug/deps/...)
```

## Doc tests — code in comments

```rust
/// Adds two numbers.
///
/// # Examples
///
/// ```
/// let result = my_crate::add(2, 3);
/// assert_eq!(result, 5);
/// ```
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}
```

`cargo test` execute code inside ` ``` ` blocks of doc comments — verify documentation stays correct.

Output:
```text
   Doc-tests my_project
running 1 test
test src/lib.rs - add (line 4) ... ok
```

3 birds 1 stone: doc + example + test.

### Doc test attributes

```rust
/// ```
/// // Pre-condition setup hidden:
/// # let x = 5;
/// let y = x * 2;
/// assert_eq!(y, 10);
/// ```
```

`# ` prefix line = hidden in rendered doc, still compiled.

```rust
/// ```compile_fail
/// let x: i32 = "abc";        // shouldn't compile
/// ```
///
/// ```no_run
/// loop {}                      // compile but not run
/// ```
///
/// ```ignore
/// // skip both
/// ```
```

Variants for special test cases.

## cargo test — flags

```text
$ cargo test                       # run all
$ cargo test test_add              # run by name pattern
$ cargo test -- --nocapture        # print to stdout (default suppress)
$ cargo test -- --test-threads=1   # single-threaded
$ cargo test -- --ignored          # only ignored
$ cargo test --release             # release mode (optimize)
```

Args after `--` go to test binary.

## Test organization patterns

### Module per feature
```rust
#[cfg(test)]
mod tests_basic { ... }

#[cfg(test)]
mod tests_edge_cases { ... }
```

### Group via common file

`tests/common/mod.rs`:
```rust
pub fn setup() -> TestState { ... }
```

`tests/integration.rs`:
```rust
mod common;
use common::setup;

#[test]
fn test_x() {
    let state = setup();
    // ...
}
```

`tests/common/mod.rs` (folder + mod.rs) excluded from being treated as test file.

## Property-based testing — `quickcheck` / `proptest`

```toml
[dev-dependencies]
proptest = "1.0"
```

```rust
use proptest::prelude::*;

proptest! {
    #[test]
    fn test_reverse_twice_is_identity(s in "\\PC*") {
        let reversed: String = s.chars().rev().collect();
        let twice: String = reversed.chars().rev().collect();
        prop_assert_eq!(twice, s);
    }
}
```

Generates random inputs, finds edge cases. Powerful.

## Mock + test double

Rust no built-in mock library. Common:
- `mockall` crate — derive mocks for traits.
- Hand-write test doubles for traits.

```rust
trait Database {
    fn get(&self, key: &str) -> Option<String>;
}

struct MockDB {
    data: HashMap<String, String>,
}

impl Database for MockDB {
    fn get(&self, key: &str) -> Option<String> {
        self.data.get(key).cloned()
    }
}
```

## Coverage

```text
$ cargo install cargo-tarpaulin
$ cargo tarpaulin --out Html
```

`tarpaulin` (Linux only) generates HTML coverage report.

For macOS/Windows: `cargo-llvm-cov`:
```text
$ cargo install cargo-llvm-cov
$ cargo llvm-cov --html
```

## Bẫy thường gặp

| Bẫy | Sửa |
|---|---|
| Test runs in parallel → race | `--test-threads=1` or use Mutex. |
| Print not showing | `--nocapture`. |
| Doc test fail | Compile entire doc as crate. Check imports. |
| Forget `pub` on tested function | Integration test can't access. |
| Mutable shared state across tests | Each test should be isolated. |
| Integration test slow | Separate `slow` tests, `#[ignore]`. |
| Test file in `tests/` not running | File must be top-level. Folder needs `mod.rs`. |
| `should_panic` accept any panic | Add `expected = "message"` for specific. |

## Tóm tắt bài 30

- `#[test]` annotation on function. `cargo test` runs all.
- Unit test in same file as code, `#[cfg(test)] mod tests`.
- Integration test in `tests/` folder — tests public API.
- Doc test in `///` comments with ` ``` ` blocks.
- Assertions: `assert!`, `assert_eq!`, `assert_ne!`.
- `#[should_panic]` for expected panic, `#[ignore]` for slow.
- Property-based: `proptest`. Mock: `mockall`.
- Coverage: `cargo llvm-cov` or `tarpaulin`.

**Bài kế tiếp** → [Bài 31 (phase-23): rand crate — random numbers](../phase-23-rand-crate/01-rand-crate-cot-loi.md)
