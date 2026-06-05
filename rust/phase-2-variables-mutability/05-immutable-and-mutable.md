# Bài 12: Immutable và Mutable Variables — vì sao Rust đảo ngược quy ước

> "Variable" — từ này gợi ý "có thể vary" (thay đổi). Nhưng Rust **đảo ngược**: variable mặc định **không thể đổi**. Đây là quyết định thiết kế **gây tranh cãi nhất** ngày Rust mới ra mắt — và là một trong những điều **tốt nhất** Rust làm cho an toàn code. Bài này đào sâu lý do, cú pháp `mut`, lỗi E0384, và quy tắc "type không thể đổi dù có mut".

## Khái niệm immutable

**Immutable** = không có khả năng thay đổi (in-mutable).
**Mutable** = có khả năng thay đổi.

Rust quyết định: **mọi variable mặc định là immutable**. Một khi gán giá trị xong là **cố định** suốt vòng đời variable đó.

Đây là **phản trực giác** so với hầu hết ngôn ngữ. Python, JavaScript, Java, C, C++ — tất cả mặc định mutable. Đổi value sau khi gán là chuyện thường.

```python
# Python — mutable by default
x = 5
x = 10        # OK, x giờ là 10
```

```rust
// Rust — immutable by default
let x = 5;
x = 10;       // ERROR!
```

## Demo lỗi E0384

```rust
fn main() {
    let gym_reps = 10;
    println!("I plan to do {gym_reps} reps");
    
    gym_reps = 15;          // attempt to reassign
    println!("Updated to {gym_reps} reps");
}
```

Compile error:
```text
error[E0384]: cannot assign twice to immutable variable `gym_reps`
 --> src/main.rs:5:5
  |
2 |     let gym_reps = 10;
  |         --------
  |         |
  |         first assignment to `gym_reps`
  |         help: consider making this binding mutable: `mut gym_reps`
3 |     println!("I plan to do {gym_reps} reps");
4 |
5 |     gym_reps = 15;
  |     ^^^^^^^^^^^^^ cannot assign twice to immutable variable
```

Compiler chỉ rõ:
- Lỗi: cannot assign twice.
- Vị trí: line 5.
- Variable bị block: `gym_reps`.
- Nơi gán đầu: line 2.
- **Suggestion**: thêm `mut` để make mutable.

Đây là error message **xuất sắc** — Rust nổi tiếng vì chất lượng error.

## Cú pháp `mut` — opt-in mutability

Muốn variable thay đổi được → thêm `mut` keyword **ngay sau `let`**:

```rust
fn main() {
    let mut gym_reps = 10;
    println!("I plan to do {gym_reps} reps");
    
    gym_reps = 15;
    println!("Updated to {gym_reps} reps");
}
```

Output:
```text
I plan to do 10 reps
Updated to 15 reps
```

`mut` đứng sau `let`, trước tên. Phát âm "mute" — viết tắt của "mutable".

### Vị trí `mut` chính xác

```rust
let mut x = 5;              // ✓ đúng
let x mut = 5;              // ✗ syntax error
mut let x = 5;              // ✗ syntax error
let x = mut 5;              // ✗ syntax error
```

Chỉ 1 vị trí hợp lệ: giữa `let` và tên variable.

### Reassign với `mut`

Một khi declare với `mut`, ta có thể reassign **nhiều lần**:

```rust
let mut x = 1;
x = 2;
x = 3;
x = 100;
println!("{x}");           // 100
```

Chú ý reassign **không cần `let`**. `let` chỉ dùng lần khai báo đầu:

```rust
let mut x = 1;
let x = 2;                 // ← đây không phải reassign! Đây là shadowing (bài 14)
```

`let` lần thứ 2 sẽ tạo **biến mới** che biến cũ — concept khác, bài tiếp theo dạy.

## Type không thể đổi — kể cả với `mut`

Quy tắc cực quan trọng: `mut` cho phép đổi **giá trị**, nhưng **type vẫn fix**.

```rust
let mut gym_reps = 10;          // Rust suy luận type i32
gym_reps = 15;                  // OK — vẫn i32
gym_reps = "twenty";            // ERROR — type mismatch
```

Error:
```text
error[E0308]: mismatched types
 --> src/main.rs:3:16
  |
3 |     gym_reps = "twenty";
  |                ^^^^^^^^ expected integer, found `&str`
```

Compiler báo: bạn cố gán string vào variable type integer — không cho phép.

### Vì sao Rust strict type

- **Type safety** — biến `gym_reps` mãi là số, không lo bug khi xử lý.
- **Performance** — compiler biết size + layout, optimize tốt.
- **Reasoning về code** — đọc 1 lần, biết type, hết.

Nếu cần đổi type → dùng **shadowing** (bài 14) — tạo binding mới hoàn toàn.

## Vì sao Rust đảo ngược quy ước (immutable default)

3 lý do quyết định này được giữ:

### Lý do 1: Concurrent code an toàn

Trong multithread:
- Nếu 2 thread cùng đọc 1 immutable variable → an toàn 100%.
- Nếu 1 thread đọc, 1 thread ghi cùng variable → **race condition** — bug khó debug.

Rust ownership system dựa vào immutability để guarantee: **đọc cùng lúc nhiều thread OK; ghi phải exclusive**. Nếu mặc định mutable, mỗi variable đều "potentially mutable" → compiler khó verify safety.

### Lý do 2: Code dễ reason

Khi đọc function dài:
```rust
fn process() {
    let limit = 100;
    // ... 50 dòng code ...
    do_something(limit);
}
```

Thấy `let limit = 100` — biết ngay `limit` **luôn = 100** trong toàn function. Không cần scan 50 dòng xem có chỗ nào sửa.

Ngược lại với `let mut limit = 100;` → flag "cẩn thận, biến này thay đổi đâu đó" → phải đọc kỹ.

`mut` keyword trong code = **dấu hiệu visual** rằng "đây là state động, cần chú ý". Reader cám ơn.

### Lý do 3: Compiler optimize tốt

Immutable variable → compiler có thể:
- **Inline** hằng số (replace mọi tham chiếu bằng giá trị literal).
- **Eliminate redundant load** (cache vào register).
- **Reorder instruction** (không sợ race condition).

Mutable → compiler phải conservative hơn → optimize ít hơn.

> Triết lý chung: **make the safe option the default, make the risky option explicit**. Pattern này Rust áp dụng xuyên suốt: `let` (vs `let mut`), `&T` (vs `&mut T`), `unsafe` (vs default safe), `async` (vs sync).

## Khi nào dùng `mut`

Use case chính đáng:
- **Counter** trong loop: `let mut count = 0; for ... { count += 1; }`.
- **Accumulator** xây dần: `let mut sum = 0;`.
- **State machine**: `let mut state = State::Initial;`.
- **Buffer growing**: `let mut s = String::new(); s.push_str(...);`.
- **Game/simulation state**: `let mut player = Player::new();`.

Không nên dùng `mut` khi:
- Config / parameter không đổi.
- Computed value bạn không cần update.
- Input của function (sẽ học `&` borrow nếu cần modify).

## Quan sát: bug catch lúc compile

Imagine chế tài này: bạn refactor code, vô tình overwrite variable không định:

```rust
let monthly_salary = 50_000;
// ... 200 dòng business logic ...

// Lỡ tay copy-paste vào nhầm
monthly_salary = annual_total / 12;        // ERROR!
```

Rust catch ngay. Trong Python/JS, code chạy "thành công" với salary sai → bug production khó tìm.

Immutable default = **safety net khổng lồ**.

## Mutable trong context khác

`mut` còn xuất hiện ở 3 ngữ cảnh khác — phase sau:

### Function parameter
```rust
fn double(mut x: i32) -> i32 {
    x *= 2;
    x
}
```

`mut x` cho phép modify x bên trong function (param là local copy).

### Reference mutable `&mut`
```rust
fn modify(v: &mut Vec<i32>) {
    v.push(42);
}
```

Phase References (7) đào sâu.

### Method receiver `&mut self`
```rust
impl Counter {
    fn increment(&mut self) {
        self.count += 1;
    }
}
```

Phase Structs (9) sẽ học.

## Demo program

```rust
fn main() {
    // Immutable
    let pi = 3.14;
    println!("Pi: {pi}");
    
    // Mutable
    let mut score = 0;
    println!("Initial score: {score}");
    
    score = 10;
    println!("After level 1: {score}");
    
    score = 25;
    println!("After level 2: {score}");
    
    score += 100;
    println!("Final score: {score}");
}
```

Output:
```text
Pi: 3.14
Initial score: 0
After level 1: 10
After level 2: 25
Final score: 125
```

`score` đổi 4 lần. `pi` cố định.

## Compound assignment operators

Với `mut`, có thể dùng các operator tổng hợp:

| Operator | Tương đương |
|---|---|
| `x += 5` | `x = x + 5` |
| `x -= 3` | `x = x - 3` |
| `x *= 2` | `x = x * 2` |
| `x /= 4` | `x = x / 4` |
| `x %= 7` | `x = x % 7` |

```rust
let mut n = 10;
n += 5;        // 15
n *= 2;        // 30
n -= 10;       // 20
n /= 4;        // 5
println!("{n}");
```

Output: `5`.

## Bẫy thường gặp

| Bẫy | Sửa |
|---|---|
| Reassign immutable variable | E0384. Thêm `mut`. |
| Đổi type với `mut` | Type vẫn fix. Dùng shadowing (bài 14). |
| `let x = ...; let x = ...;` nghĩ là reassign | Đó là shadowing — binding mới. |
| `mut` đặt sai vị trí | Phải sau `let`, trước tên: `let mut x`. |
| Lạm dụng `mut` everywhere | Default immutable cho an toàn. Chỉ `mut` khi cần. |
| `mut` cho function param nhưng caller không cần | OK — param local của function. |
| Reassign function param không có `mut` | Function param mặc định immutable. Thêm `mut`. |
| Cần modify field struct nhưng quên `mut` struct | `let mut user = ...;` để gọi `user.name = ...`. |

## Tóm tắt bài 12

- Variable Rust **mặc định immutable** — đảo ngược quy ước Python/JS/Java.
- Reassign immutable → error E0384 với suggest thêm `mut`.
- `mut` keyword đặt **sau `let`, trước tên**: `let mut x = 5;`.
- Sau khi `mut`, reassign nhiều lần OK. Không cần `let` lại.
- **Type không thể đổi** dù có `mut` — type cố định khi declare.
- 3 lý do immutable default: concurrent safety, reasoning, optimize.
- Use case `mut`: counter, accumulator, state machine, growing buffer.
- Production: ưu tiên immutable. Chỉ `mut` khi thực sự cần.

**Bài kế tiếp** → [Bài 13: Rust Error Codes Index — `--explain` và cách đọc error message](06-rust-error-codes-index.md)
