# Bài 13: Control flow — if/else, loop, while, for

> Branch và loop ở Rust trông quen thuộc nhưng có vài twist quan trọng: `if` là expression, `loop` có return value, `for` iterate qua iterator trait. Bài này dạy cả 4 construct + best practices.

## `if` / `else if` / `else`

```rust
fn main() {
    let n = 5;
    
    if n < 0 {
        println!("negative");
    } else if n == 0 {
        println!("zero");
    } else {
        println!("positive");
    }
}
```

3 đặc điểm khác C/Java:
- **Không ngoặc `()`** quanh condition.
- Condition **bắt buộc** type `bool`. Không auto-convert.
- Body **bắt buộc** `{ }` ngay cả 1 statement.

```rust
if x > 0 println!("...");           // SAI
if (x > 0) { println!("..."); }      // OK nhưng thừa ()
if x > 0 { println!("..."); }        // idiomatic
```

### `if` là expression

```rust
let label = if n > 0 { "pos" } else { "non-pos" };
println!("{label}");
```

Mỗi branch return value cùng type. Compiler check.

```rust
let bad = if n > 0 { 5 } else { "five" };
// ERROR — branch type khác nhau (i32 vs &str)
```

## `loop` — vòng vô hạn

```rust
fn main() {
    let mut count = 0;
    loop {
        count += 1;
        if count == 5 {
            break;
        }
        println!("count = {count}");
    }
}
```

Output:
```text
count = 1
count = 2
count = 3
count = 4
```

`break` thoát loop. `continue` skip lượt.

### `loop` return value

Đặc trưng Rust: `loop` có thể return value qua `break`:

```rust
let result = loop {
    let x = 42;
    if x > 0 {
        break x * 2;        // return value của loop
    }
};
println!("{result}");        // 84
```

Hữu ích cho retry loop:
```rust
let connection = loop {
    match try_connect() {
        Ok(conn) => break conn,
        Err(_) => {
            thread::sleep(Duration::from_secs(1));
            continue;
        }
    }
};
```

### Labeled loop

Loop lồng nhau: `break`/`continue` mặc định ảnh hưởng loop trong cùng. Dùng **label** để break outer:

```rust
'outer: loop {
    'inner: loop {
        if condition {
            break 'outer;      // thoát outer
        }
    }
}
```

Label cú pháp `'name:` — bắt đầu apostrophe, sau là tên.

## `while` — loop có condition

```rust
let mut count = 0;
while count < 5 {
    println!("{count}");
    count += 1;
}
```

Loop nếu condition `true`. Tương đương `loop { if !condition { break; } ... }`.

### `while let` — destructure trong condition

```rust
let mut stack = vec![1, 2, 3];

while let Some(top) = stack.pop() {
    println!("{top}");
}
```

Pop trả `Option`. Loop chừng nào còn `Some(...)`. Khi `None` (stack rỗng), thoát.

Phase Option/Result (12) đào sâu.

## `for` — iterate qua collection

```rust
let nums = [10, 20, 30, 40, 50];

for n in nums {
    println!("{n}");
}
```

Idiomatic loop trong Rust. **Luôn prefer `for` over `while` với index**.

### Range

```rust
for i in 0..5 {       // 0, 1, 2, 3, 4
    println!("{i}");
}

for i in 0..=5 {      // 0, 1, 2, 3, 4, 5 (inclusive)
    println!("{i}");
}

for i in (0..5).rev() {   // 4, 3, 2, 1, 0
    println!("{i}");
}
```

`0..5` = exclusive end. `0..=5` = inclusive end.

### Enumerate

```rust
for (i, n) in nums.iter().enumerate() {
    println!("[{i}] {n}");
}
```

`.iter()` tạo iterator. `.enumerate()` thêm index.

### Iterate qua reference vs owned

```rust
let v = vec![1, 2, 3];

for x in &v {          // x: &i32 — borrow
    println!("{x}");
}
// v vẫn dùng được

for x in v {           // x: i32 — move (consume v)
    println!("{x}");
}
// v không dùng được nữa
```

Phase Ownership (6) giải thích sâu.

## `match` — pattern matching (preview)

```rust
let n = 3;
match n {
    1 => println!("one"),
    2 => println!("two"),
    3 => println!("three"),
    _ => println!("other"),
}
```

Cú pháp `pattern => expression`. `_` = catch-all. Phase Enums (10) đào sâu.

## Comparison 4 loop

| | When |
|---|---|
| `loop` | Indefinite, exit qua `break`. Có return value. |
| `while cond` | Lặp cho đến condition false. |
| `while let Pat` | Destructure khi value match pattern. |
| `for x in iter` | Iterate collection. Idiomatic, prefer first. |

## Idiomatic patterns

### Avoid `while i < len`

```rust
// Anti-pattern
let mut i = 0;
while i < arr.len() {
    println!("{}", arr[i]);
    i += 1;
}

// Idiomatic
for x in &arr {
    println!("{x}");
}
```

`for` ngắn hơn, không bug off-by-one, không bounds check thừa.

### Iterator chains

```rust
let sum: i32 = (1..=10)
    .filter(|n| n % 2 == 0)
    .sum();
println!("{sum}");      // 2+4+6+8+10 = 30
```

Phase Iterators (21) đào sâu.

## Bẫy thường gặp

| Bẫy | Sửa |
|---|---|
| `if x` với số | Compile error. Phải `if x != 0`. |
| `if true { 1 } else { "two" }` | Branch type khác. Match types. |
| `for i in 0..arr.len()` rồi `arr[i]` | Idiomatic dùng `for x in &arr` hoặc `iter().enumerate()`. |
| Quên `let result = ...` cho loop return | Cần assign nếu muốn dùng value. |
| Modify collection trong `for` loop | Borrow checker error. Collect modifications, apply sau. |
| `break 'label value` quên label | Compile error. Spell-check label. |
| `while let Some(x) = iter.next()` thay vì `for x in iter` | Verbose. `for` clean hơn. |

## Tóm tắt bài 13

- `if cond { } else { }` — expression, có thể assign. Cond bắt buộc bool.
- `loop` — infinite, `break value` return value.
- `while cond` — loop có condition. `while let Pat = expr` destructure.
- `for x in iter` — idiomatic. Range `0..n`, `0..=n`, `.rev()`, `.enumerate()`.
- Labeled loop `'label:` để break outer.
- Prefer `for` over `while` + index manual.

**Bài kế tiếp** → [Bài 14 (phase-6): Ownership — feature đặc trưng nhất của Rust](../phase-6-ownership/01-ownership-cot-loi.md)
