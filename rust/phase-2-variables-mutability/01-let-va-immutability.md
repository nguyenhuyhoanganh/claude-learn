# Bài 8: Variable với `let` — và vì sao Rust mặc định immutable

Trong hầu hết ngôn ngữ, `x = 5` rồi `x = 10` là chuyện bình thường. Trong Rust, mặc định **không**. Variable Rust **immutable** (bất biến) — gán lần đầu là xong. Quy tắc lạ tai này cứu bạn khỏi hàng tá bug đồng thời và race condition. Bài này dạy `let`, `mut`, và lý do triết học đằng sau.

## `let` — khai báo variable

Cú pháp cơ bản:

```rust
fn main() {
    let name = "Alice";
    let age = 30;
    println!("{name} is {age} years old");
}
```

3 thành phần:
- `let` — keyword khai báo.
- `name` — tên variable (identifier).
- `= "Alice"` — giá trị khởi tạo.
- `;` — kết thúc statement.

Output:
```text
Alice is 30 years old
```

### Quy tắc đặt tên

| Cho phép | Không |
|---|---|
| Chữ cái a-z, A-Z | Bắt đầu số (`2abc` ❌) |
| Chữ số 0-9 (không đầu) | Ký tự đặc biệt `@`, `$`, `#` (❌) |
| Underscore `_` | Space ❌ |
| Unicode (`tên`, `名前`) | Keyword reserved (`let`, `fn`, `if`...) |

Convention Rust: **snake_case** cho biến và function.
- `user_name` ✓
- `userName` ✗ (camelCase — không Rust style, compiler warn)
- `USER_NAME` ✗ (cho `const` mới đúng)

```rust
let userName = "Bob";       // warning
// warning: variable `userName` should have a snake case name
//   help: convert the identifier to snake case: `user_name`
```

## Immutable là gì

Sau khi gán, **không thể đổi** giá trị:

```rust
fn main() {
    let x = 5;
    x = 10;             // LỖI compile
    println!("{x}");
}
```

```text
error[E0384]: cannot assign twice to immutable variable `x`
 --> src/main.rs:3:5
  |
2 |     let x = 5;
  |         - first assignment to `x`
3 |     x = 10;
  |     ^^^^^^ cannot assign twice to immutable variable
help: consider making this binding mutable: `mut x`
```

Compiler chỉ rõ:
- Variable assigned 2 lần.
- Suggestion: thêm `mut`.

## `mut` — opt-in mutability

Nếu thật sự cần thay đổi → khai báo với `mut`:

```rust
fn main() {
    let mut x = 5;
    println!("x = {x}");
    
    x = 10;
    println!("x = {x}");
    
    x += 5;             // OK
    println!("x = {x}");
}
```

Output:
```text
x = 5
x = 10
x = 15
```

`mut` đứng giữa `let` và tên. Bắt buộc khi muốn mutate.

## Vì sao mặc định immutable?

3 lý do thực dụng:

### 1. Concurrent code an toàn hơn
Nếu data immutable → không có race condition khi 2 thread đọc. Compiler dùng tính chất này cho `Send`/`Sync` trait (phase 27).

### 2. Code dễ đọc + reasoning
Đọc function 200 dòng, gặp `let total = 100;` → biết `total` luôn = 100 trong toàn scope. Không cần scan xem có chỗ nào sửa.

Ngược lại, gặp `let mut total = 100;` → flag "cẩn thận, biến này thay đổi".

### 3. Optimization compiler
Immutable variable → compiler có thể inline hằng số, eliminate redundant load. Performance better.

> Triết lý Rust: **make the safe option the default, make the unsafe option explicit**. Áp dụng xuyên suốt — không chỉ `mut` mà còn `unsafe`, `await`, `?`...

## Khi nào dùng `mut`?

- Counter trong loop.
- Accumulator trong fold/reduce thủ công.
- State machine.
- Buffer growing (string, vector).

```rust
let mut sum = 0;
for i in 1..=10 {
    sum += i;
}
println!("Sum: {sum}");
// Sum: 55
```

Khi **không** dùng:
- Configuration / constants.
- Input parameters đọc only.
- Computed values bạn không cần update.

## Interpolation — `{}` trong `println!`

Chèn variable vào string:

```rust
let name = "Alice";
let age = 30;
println!("{name} is {age}");
```

`{name}` được Rust replace bằng giá trị `name` lúc compile. Đây là feature **edition 2021+**.

### Trước 2021 — positional args

```rust
println!("{} is {}", name, age);
//        ↑ ↑      ↑     ↑
//        slot     value
```

`{}` slots, args theo thứ tự. Vẫn dùng được, đặc biệt khi expression phức tạp:

```rust
println!("{} + {} = {}", a, b, a + b);   // OK
println!("{a} + {b} = {a + b}");          // SAI — chỉ var name được
```

Inline `{name}` chỉ chấp nhận variable name. Expression phải positional.

### Index positional

```rust
let x = 1;
let y = 2;
println!("{0} + {1} = {0}+{1}", x, y);
// 1 + 2 = 1+2
```

`{0}` = arg đầu, `{1}` = arg thứ 2. Dùng index để reuse.

### Named args

```rust
println!("{first} + {second}", first = 1, second = 2);
// 1 + 2
```

Đặt tên rõ — useful khi nhiều placeholder.

## Comparison 3 cách interpolation

| Cách | Cú pháp | Khi dùng |
|---|---|---|
| Inline | `{var_name}` | Variable đơn giản (Rust 2021+) |
| Positional | `{}` + args | Expression phức tạp |
| Named | `{name}` + `name = expr` | Nhiều slot, cần rõ nghĩa |

## Underscore prefix — variable không dùng

```rust
fn main() {
    let x = 5;          // warning: unused
    println!("Hello");
}
```

```text
warning: unused variable: `x`
  help: if this is intentional, prefix it with an underscore: `_x`
```

Nếu intentionally không dùng → prefix `_`:

```rust
let _x = 5;          // không warning
let _ = 5;            // discard hoàn toàn, không cần tên
```

`_` chính là **discard pattern** — cực hữu ích sau này với match expressions.

## Bẫy thường gặp

| Bẫy | Sửa |
|---|---|
| `let mut x; x = 5;` rồi đọc trước assign | Compile error — Rust track init state. Init ngay lúc `let`. |
| Quên `mut` rồi sửa | Error E0384. Thêm `mut`. |
| `let user_Name` mix case | Warning. Đổi snake_case. |
| `let 2nd = 5` | Error — không bắt đầu số. |
| `{a + b}` inline | SAI — chỉ var name. Dùng positional `{}` + `a + b`. |
| Quên `;` | Statement không terminate → cascade error. |

## Tóm tắt bài 8

- `let name = value;` khai báo variable, mặc định **immutable**.
- `let mut name = value;` cho phép reassign.
- Convention: snake_case. Rust compiler warn nếu sai.
- Immutable default = safer concurrent, code dễ reason, optimize tốt.
- 3 cách interpolation: inline `{var}` (Rust 2021+), positional `{}`, named `{n}`.
- Prefix `_` để mark variable cố tình không dùng.

**Bài kế tiếp** → [Bài 9: Shadowing, scopes, constants, type aliases](02-shadowing-scope-const.md)
