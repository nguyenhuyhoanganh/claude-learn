# Bài 9: Shadowing, scope, constants, type alias

> Variable Rust immutable mặc định. Nhưng có 3 cơ chế "lách" hữu ích: **shadowing** (re-declare cùng tên), **scope** (block-based visibility), **constants** (true compile-time fixed), và **type alias** (đặt tên gọn cho type). Bài này dạy 4 cơ chế và cách combine.

## Shadowing — re-declare cùng tên

```rust
fn main() {
    let x = 5;
    let x = x + 1;          // x = 6
    let x = x * 2;          // x = 12
    println!("{x}");        // 12
}
```

Không cần `mut`. Mỗi `let x = ...` tạo **biến mới** che (shadow) biến cũ. Biến cũ bị mất reference.

### Shadowing vs `mut`

| | Shadowing | `mut` |
|---|---|---|
| Cú pháp | `let x = new_value;` lần 2 | `let mut x = ...; x = new_value;` |
| Đổi type được? | Có | Không |
| Tạo binding mới? | Có | Không (cùng binding) |
| Cần `let` mỗi lần | Có | Chỉ lần đầu |

### Đổi type với shadowing

```rust
let spaces = "   ";              // &str
let spaces = spaces.len();        // usize
println!("{spaces}");             // 3
```

`spaces` đổi từ string sang số. Với `mut` không làm được vì Rust strict type.

### Shadowing trong scope

```rust
fn main() {
    let x = 5;
    
    {                              // block mới
        let x = x * 10;            // shadow trong block
        println!("inner x = {x}"); // 50
    }
    
    println!("outer x = {x}");     // 5 — không đổi
}
```

`{ }` tạo scope mới. Variable shadow chỉ tồn tại trong scope.

## Scope — phạm vi sống của variable

**Scope** = vùng code mà variable "tồn tại". Khi ra khỏi scope → variable bị **drop** (xoá khỏi memory).

```rust
fn main() {
    let x = 5;            // x born here
    
    {
        let y = 10;       // y born
        println!("{x} {y}");
    }                     // y dies (drop)
    
    println!("{x}");      // OK
    // println!("{y}");   // LỖI — y không tồn tại
}
```

Quy tắc:
- Variable tồn tại từ `let` đến cuối block chứa nó.
- Block lồng nhau → nested scope.
- Function body là 1 scope.

### Vì sao scope quan trọng

- Tránh memory leak — Rust biết khi nào free RAM.
- Hỗ trợ ownership rules (phase 6).
- Naming collision không xảy ra giữa scope khác nhau.

## `const` — true constant

Khác `let`:
- Bắt buộc khai báo type explicit.
- Giá trị phải **constant expression** (biết lúc compile).
- Convention: `SCREAMING_SNAKE_CASE`.
- Có scope toàn module (không bị scope block giới hạn nếu đặt ngoài fn).
- Không bao giờ mut.

```rust
const MAX_USERS: u32 = 100;
const PI: f64 = 3.14159;
const COMPANY_NAME: &str = "Acme Corp";

fn main() {
    println!("Max users: {MAX_USERS}");
    println!("Pi: {PI}");
    println!("Company: {COMPANY_NAME}");
}
```

### `const` vs `let`

| | `const` | `let` |
|---|---|---|
| Type annotation | Bắt buộc | Optional (suy luận) |
| Mutable được? | Không | `mut` được |
| Compile-time value | Bắt buộc | Có thể runtime |
| Scope | Module/function | Block chứa |
| Naming | `SCREAMING_SNAKE` | `snake_case` |
| Use case | Magic number, config | Variable thông thường |

### Khi nào dùng `const`

```rust
const SECONDS_IN_HOUR: u32 = 60 * 60;
const HTTP_PORT: u16 = 8080;
const MAX_RETRIES: usize = 3;
```

Giá trị **không bao giờ đổi** trong vòng đời program → `const`. Lợi:
- Compiler inline → không có memory access overhead.
- Dùng được trong các vị trí compile-time required (array size).

```rust
const SIZE: usize = 5;
let arr: [i32; SIZE] = [0; SIZE];   // OK — const dùng được làm size
```

`let` không làm được — array size phải biết lúc compile.

### `static` — global variable

Giống `const` nhưng có địa chỉ memory cố định, có thể `mut` (unsafe):

```rust
static GREETING: &str = "Hello";

static mut COUNTER: u32 = 0;        // unsafe để access

fn main() {
    println!("{GREETING}");
    
    unsafe {                          // bắt buộc unsafe
        COUNTER += 1;
        println!("{COUNTER}");
    }
}
```

`static mut` rare — race condition tiềm tàng. Production thường dùng `Mutex<T>` + `lazy_static!` thay.

## Type alias

Đặt tên ngắn cho type dài:

```rust
type Username = String;
type UserId = u64;
type Pair = (i32, i32);

fn create_user(name: Username, id: UserId) -> Pair {
    println!("Creating {name} with id {id}");
    (1, 2)
}
```

`type` không tạo type mới — chỉ alias. `Username` **thực ra là** `String`, có thể assign qua lại.

### Khi nào dùng `type`

- Type signature dài: `HashMap<String, Vec<u32>>` → `type UserScores = HashMap<String, Vec<u32>>;`.
- Cải thiện readability với domain naming: `type Celsius = f64`, `type Fahrenheit = f64`.
- Generic constraint complex: `type Result<T> = std::result::Result<T, MyError>;`.

### Type alias vs Newtype

```rust
type Meters = f64;                      // alias — không thật type mới
struct Meters(f64);                      // newtype — thật type mới
```

Newtype mạnh hơn: compiler check type-safety strict, nhưng cần `.0` để access value. Phase Structs sẽ học sâu.

## Rust error codes index

Compiler hiển thị error code kiểu `E0384`. Browse full list:

<https://doc.rust-lang.org/error_codes/error-index.html>

```text
$ rustc --explain E0384
A variable was mutated when it was not declared as mutable.

Erroneous code example:
let foo = 3;
foo = 5; // error, assignment of immutable variable

To fix this, declare the variable as `mut`:
let mut foo = 3;
foo = 5; // ok!
```

Trong terminal `rustc --explain <code>` → giải thích đầy đủ với example. Hữu ích khi đọc message ngắn không hiểu.

## Compiler directive `#[allow(...)]`

Tạm tắt warning:

```rust
#[allow(unused_variables)]
fn main() {
    let x = 5;            // không warning nữa
}
```

Hoặc tắt cả file:
```rust
#![allow(dead_code)]
#![allow(unused_variables)]
```

`#![...]` (có `!`) = inner attribute (apply lên file/module). `#[...]` = outer attribute (apply lên item phía dưới).

### Khi nào allow warning

- Code stub đang viết, sẽ dùng sau.
- Test fixture.
- Generated code.

Production code nên **fix warning, không tắt**.

## Bẫy thường gặp

| Bẫy | Sửa |
|---|---|
| Dùng `const` cho computed value | `const x = some_fn();` SAI — `const` cần compile-time. Dùng `let` hoặc `static` (Rust 1.79+ với `LazyLock`). |
| Quên type annotation cho `const` | Bắt buộc — `const X: i32 = 5;` không phải `const X = 5;` |
| Shadowing nhầm với mut → lo lắng performance | Compiler optimize tốt. Shadowing không tốn thêm runtime. |
| Type alias để force type-check | Sai concept. Dùng newtype hoặc Rust trait. |
| Static mut access không unsafe block | Compile error. Wrap unsafe. |
| Scope variable leak ngoài block | Không leak — Rust drop. |

## Tóm tắt bài 9

- Shadowing: `let x = ...;` lần 2 tạo binding mới, đổi type được, không cần `mut`.
- Scope `{ }` định phạm vi sống. Variable drop khi ra khỏi scope.
- `const NAME: Type = expr;` — compile-time, SCREAMING_SNAKE, không mut.
- `static` — global, có thể `mut` (unsafe), production hạn chế.
- `type Alias = Type;` — alias, không tạo type mới (newtype: struct).
- `#[allow(...)]` tắt warning có chủ đích. `rustc --explain ECODE` giải thích error.

**Bài kế tiếp** → [Bài 10 (phase-3): Data types — scalar và compound](../phase-3-data-types/01-scalar-types.md)
