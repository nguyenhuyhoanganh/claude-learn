# Bài 5: Hello World — đào sâu 3 dòng code đầu tiên

> 3 dòng `fn main() { println!("Hello, world!"); }` chứa hơn nửa concept cơ bản của Rust: function, macro, string, statement terminator. Bài này mổ xẻ từng từ, từng ký tự, để bạn hiểu **tại sao** mỗi phần tồn tại trước khi gõ dòng code tiếp theo.

## Code đích — viết tay từ đầu

Mở `src/main.rs` trong VSCode (đã có code Cargo tạo sẵn). **Xoá hết**, gõ lại từ đầu:

```rust
fn main() {
    println!("Hello world!");
}
```

3 dòng. Save (`Cmd+S` / `Ctrl+S`). Chạy bằng nút **▶ Run** trên VSCode (do rust-analyzer cung cấp) ở trên dòng `fn main()`.

Output:
```text
   Compiling hello_world v0.1.0 (/Users/hoanganh/my-rust-projects/hello_world)
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.42s
     Running `target/debug/hello_world`
Hello world!
```

OK. Bây giờ ta phân tích.

## `fn` — keyword khai báo function

`fn` = viết tắt của **function**. Function = "công thức nấu ăn" — chuỗi instruction để máy execute.

```rust
fn name() {
    // các instruction
}
```

Tại sao **viết tắt** `fn`?
- Ngắn → ít gõ.
- Đặc trưng Rust: tránh từ dài, ưu tiên ngắn gọn nhưng có ý nghĩa.

Python dùng `def`, JavaScript dùng `function`, Java dùng (không có keyword, dùng type). Rust dùng `fn`.

## `main` — special function name

Tên `main` là **đặc biệt**. Rust runtime tự gọi `main` khi program start. Không có `main` → compile error:

```text
error[E0601]: `main` function not found in crate `hello_world`
```

Rules:
- **Phải là `main`** (lowercase). `Main`, `MAIN` không work.
- **Một crate binary chỉ có 1 `main`**.
- Không thể nhận parameter (chính xác hơn: có signature đặc biệt cho command-line args, nhưng default là không param).
- Không return giá trị (default).

```rust
fn main() {        // OK
fn Main() {        // SAI — case sensitive
fn MAIN() {        // SAI
fn my_main() {     // OK nhưng KHÔNG tự chạy
```

## `()` — parameter list

`()` sau tên function = danh sách parameter. Empty → function không nhận input gì.

```rust
fn main() { ... }                    // không param
fn greet(name: String) { ... }       // 1 param tên `name` type `String`
fn add(a: i32, b: i32) { ... }       // 2 param
```

Parameter = "nguyên liệu" của công thức. `main` không cần nguyên liệu → `()` empty.

**Lưu ý**: `()` **bắt buộc**, ngay cả khi không có param. Trong Python `def main()` cũng tương tự, nhưng Python cho phép omit dấu `()` trong một số ngữ cảnh — Rust thì không.

## `{` và `}` — function body block

`{ ... }` = **block** chứa các statement của function.

```rust
fn main() {
    // dòng này thuộc main()
    // dòng này cũng vậy
    // tất cả các dòng giữa { và } thuộc body của main
}
```

Convention Rust (formatter `rustfmt` enforce):
- `{` cùng dòng với function declaration (gọi là K&R style).
- `}` ở dòng riêng, indent về 0.
- Code bên trong indent **4 spaces** (không phải tab).

Sai convention:
```rust
fn main()
{                    // BAD style — Rustfmt sẽ sửa
    println!("...");
}
```

Đúng convention:
```rust
fn main() {
    println!("...");
}
```

Rustfmt sẽ tự reformat — không sao nếu lúc đầu gõ sai.

## `    ` — 4-space indent

```rust
fn main() {
    println!("Hello");   // 4 spaces trước println
}
```

Tab key trong VSCode (config 4 spaces) chèn 4 dấu cách thật. Đây là convention chuẩn — không phải tab character. `cargo fmt` sẽ enforce.

Vì sao 4 spaces (không 2)?
- 2 spaces → khó nhìn nesting sâu.
- 4 spaces → dễ đọc, vẫn không quá dài.
- Tab → render khác nhau ở editor khác → lệch.

> Python cũng 4 spaces. JavaScript thường 2. C# thường tab. Rust quyết định: **4 spaces, không tab**.

## `println!` — first macro

`println!` = **macro**, không phải function. Phân biệt qua dấu `!` cuối tên.

### Macro vs Function — phân biệt

| | Function | Macro |
|---|---|---|
| Cú pháp gọi | `foo()` | `foo!()` |
| Khi nào expand | Runtime | Compile time |
| Param chặt chẽ | Có (số param, type) | Linh hoạt (variadic) |
| Khả năng meta | Không | Có (generate code) |
| Ví dụ | `String::from()` | `println!`, `vec!`, `format!` |

Macro = "function generator" — tại compile time, macro **expand** thành code thật. `println!("Hello")` expand thành ~10 dòng code thật sự gọi I/O.

Vì sao `println!` là macro chứ function?
- Cần **variadic args** (số param thay đổi: `println!("a={}, b={}", a, b)`).
- Cần **type-check format string** tại compile time.
- Function Rust không hỗ trợ variadic native — macro làm được.

Bạn không cần hiểu sâu macro lúc đầu — coi nó như "function với dấu `!`". Phase sau sẽ học macro tự viết.

### Cách `println!` hoạt động

`println!` = "**print**" + "**line**" (xuống dòng). Output text ra **stdout** (standard output, mặc định = terminal) kèm dấu xuống dòng cuối.

```rust
println!("Hello");
// output:
// Hello
// (cursor xuống dòng mới)

print!("Hello");
// output:
// Hello (cursor ngay sau "o", không xuống dòng)
```

`print!` (không có `ln`) tương tự nhưng **không** thêm `\n`.

## `"Hello world!"` — string literal

Cặp dấu ngoặc kép `" "` = **string literal**. Rust hiểu chuỗi ký tự bên trong là text, không phải code.

```rust
println!("Hello world!");
//        ↑           ↑
//      mở string    đóng string
```

Trong string có thể có:
- Chữ cái: `a-z`, `A-Z`.
- Số: `0-9`.
- Space, tab.
- Ký hiệu: `!`, `?`, `@`, `#`, ...
- Unicode: `é`, `中`, `日`, emoji.

Trừ:
- Dấu `"` (sẽ nghĩ là kết thúc string) → escape `\"`.
- Dấu `\` → escape `\\`.

```rust
println!("She said \"hi\"");    // She said "hi"
println!("path: C:\\Users");     // path: C:\Users
```

### String type — preview

Rust có 2 string type:
- `&str` — string slice (immutable reference). Literal `"..."` là `&'static str`.
- `String` — owned heap-allocated, growable.

Phase Strings (section 15) đào sâu. Bây giờ chỉ cần biết `"..."` chính là string literal.

## `;` — statement terminator

Mọi statement kết thúc bằng `;`. Quên `;` → compile error.

```rust
fn main() {
    println!("Hello")       // SAI — thiếu ;
}
```

Error:
```text
error: expected `;`, found `}`
 --> src/main.rs:2:24
  |
2 |     println!("Hello")
  |                     ^ help: add `;` here
```

Compiler **chỉ rõ dòng + cột** sai. Đẹp.

Vì sao có `;`? — Rust phân biệt **statement** và **expression**:
- **Statement**: làm việc gì đó. Có `;`. Không trả giá trị.
- **Expression**: tính ra giá trị. Không `;`. Trả giá trị.

Phase Functions (section 4) đào sâu. Bây giờ chỉ cần biết: kết thúc statement bằng `;`.

## Run vs Compile

VSCode nút **▶ Run** thực hiện 2 việc:
1. **Compile**: `cargo build` → tạo file binary `target/debug/hello_world`.
2. **Execute**: chạy binary đó.

Có thể tách thủ công (bài kế sẽ học):
```text
$ cargo build              # chỉ compile
$ ./target/debug/hello_world  # chỉ chạy
```

Tách 2 bước hữu ích khi:
- Muốn ship binary cho người khác (không cần Rust).
- Muốn deploy lên server (compile local, chạy server).

## Sửa code → quan sát đổi

Thử các thay đổi:

```rust
// Thay đổi 1: nhiều dòng println
fn main() {
    println!("Hello");
    println!("World!");
    println!("Tôi là Rust developer");
}
```

Output 3 dòng riêng.

```rust
// Thay đổi 2: print không xuống dòng
fn main() {
    print!("Hello ");
    print!("World");
    println!("!");           // chỉ dòng cuối xuống dòng
}
```

Output 1 dòng: `Hello World!`.

```rust
// Thay đổi 3: emoji
fn main() {
    println!("Xin chào! 🦀 Rust");
}
```

Output kèm emoji con cua (Ferris — mascot Rust).

## Common error message

### 1. Quên `;`
```text
error: expected `;`, found `}`
```
→ Thêm `;` ở cuối statement.

### 2. Sai tên function
```rust
fn Main() {
    println!("Hi");
}
```
```text
error[E0601]: `main` function not found in crate
```
→ `main` phải lowercase.

### 3. Quên `!` sau `println`
```rust
println("Hi");
```
```text
error[E0423]: expected function, found macro `println`
help: consider using a macro: `println!`
```
→ Thêm `!`.

### 4. Quên `()` sau function name
```rust
fn main {
    ...
}
```
```text
error: expected `(`, found `{`
```
→ Thêm `()`.

## Tóm tắt bài 5

- `fn` khai báo function. `main` là tên đặc biệt, runtime tự gọi.
- `()` chứa parameters (rỗng nếu không param). `{}` chứa body.
- Indent 4 spaces, brace `{` cùng dòng — convention Rust.
- `println!` là macro (có `!`), output text + xuống dòng.
- String literal trong `" "`, escape với `\`.
- Mọi statement kết thúc `;`.
- Compiler error message rất rõ ràng — đọc kỹ, fix theo gợi ý.

**Bài kế tiếp** → [Bài 6: Compile + run từ Terminal — rustc và Cargo commands](06-cargo-commands.md)
