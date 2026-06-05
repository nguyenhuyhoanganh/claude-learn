# Bài 7: Comments + Project Solution + Section Review

> Bài cuối phase 1: comment syntax (2 dạng), giải bài tập section, và checklist tổng kết. Sau bài này bạn có nền vững để vào phase 2 (Variables & Mutability).

## Comment là gì

**Comment** = dòng text mà compiler **bỏ qua hoàn toàn**. Dùng để:
- Ghi chú giải thích logic phức tạp.
- Tạm tắt một dòng code (`comment out`) để test.
- Metadata: tác giả, license, link tài liệu.
- TODO / FIXME / HACK markers.

Có 2 cú pháp comment trong Rust.

## Cú pháp 1: Line comment `//`

```rust
// Đây là comment 1 dòng
fn main() {
    println!("Hello");  // comment sau code cùng dòng
    // println!("Tắt dòng này");
}
```

Rules:
- Bắt đầu bằng `//`.
- Kéo dài đến cuối dòng.
- Compiler bỏ qua mọi thứ sau `//`.

### Shortcut VSCode

- macOS: `Cmd + /`
- Windows / Linux: `Ctrl + /`

Đặt cursor trên 1 dòng (hoặc highlight nhiều dòng) → bấm shortcut → toggle comment. Bấm lần 2 → uncomment.

```rust
// Cursor đây, bấm Cmd+/ → toggle:
println!("Hello");

// Thành:
// println!("Hello");
```

Cực tiện khi muốn tạm "tắt" code để test scenario khác.

## Cú pháp 2: Block comment `/* ... */`

```rust
/* Comment 1 dòng */

/*
   Comment
   nhiều dòng
   không cần thêm //
*/

fn main() {
    println!(/* inline comment */ "Hello");
}
```

Rules:
- Bắt đầu `/*`, kết thúc `*/`.
- Có thể span nhiều dòng.
- Có thể chèn giữa code (inline).
- Nested block comment có support: `/* /* nested */ */`.

Khi dùng:
- License header dài.
- ASCII diagram cho data structure.
- Tạm tắt block code lớn.

### Comparison 2 dạng

| | `//` | `/* */` |
|---|---|---|
| 1 dòng | ✓ | ✓ |
| Multi-line | Phải nhiều `//` | OK trong 1 cặp |
| Inline | Phải cuối dòng | Có thể giữa expression |
| Nested | OK (chỉ ignore đến `\n`) | OK (Rust support nested) |
| Convention chính | Dùng nhiều | Dùng ít |

**Convention Rust**: dùng `//` cho hầu hết case. `/* */` chỉ khi thật sự cần (license block, inline expression). `cargo fmt` ưu tiên `//`.

## Doc comments — preview

Có 2 loại comment **đặc biệt** sẽ học sau:

```rust
/// Outer doc comment — document item phía dưới
fn add(a: i32, b: i32) -> i32 { a + b }

//! Inner doc comment — document module hoặc crate hiện tại
```

3 dấu `/` (`///`) hoặc `//!` được `cargo doc` parse → generate HTML documentation đẹp. Phase Testing + Module Structure sẽ học.

## Style code comment tốt

Comment **tốt**:
```rust
// Workaround: API endpoint /v1/users returns 500 for legacy accounts (Issue #1234)
let user = fetch_user_v2(id).or_else(|_| fetch_user_v1(id))?;
```

Giải thích **why** — context không thấy được trong code.

Comment **xấu**:
```rust
// Get user                      ← thừa, code tự nói
let user = get_user();

// Loop through users             ← thừa
for user in users {
    // Print user                  ← thừa
    println!("{}", user.name);
}
```

Diễn giải **what** — code đã tự rõ.

Quy tắc:
- Code = WHAT.
- Comment = WHY.
- Naming tốt = không cần comment.

## Project section 1 — code along

Cuối section 1, bài tập làm 1 program:

```rust
// Hello world program
// Author: học viên
// Section 1 project

fn main() {
    println!("Welcome to my Rust journey!");
    println!("I just installed Rust and Cargo.");
    println!("My first program runs successfully.");
}
```

Bước hoàn thành:
1. `cargo new section_1_project`
2. `cd section_1_project`
3. `code .`
4. Sửa `src/main.rs` với code trên.
5. `cargo run` — verify output.
6. `cargo fmt` — format.

```text
$ cargo run
   Compiling section_1_project v0.1.0
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.5s
     Running `target/debug/section_1_project`
Welcome to my Rust journey!
I just installed Rust and Cargo.
My first program runs successfully.
```

Done. Bạn vừa hoàn thành Rust program đầu tiên.

## Section 1 Review — checklist

Đảm bảo bạn hiểu/đã làm:

### Khái niệm
- [ ] Rust là systems programming language, cùng nhóm C/C++.
- [ ] Compiler = chương trình dịch source code → machine code.
- [ ] Compiled vs Interpreted language khác gì.
- [ ] Syntax — Rust nghiêm khắc, case-sensitive, cần `;` cuối statement.
- [ ] Function = "công thức" với keyword `fn`.
- [ ] `main` function = entry point, lowercase, không param.
- [ ] `println!` là macro (có `!`), khác function.
- [ ] String literal trong `" "`.
- [ ] Comment `//` (1 dòng) và `/* */` (multi-line).

### Tool đã cài
- [ ] Rust compiler `rustc` chạy được.
- [ ] Cargo `cargo` chạy được.
- [ ] `rustup` available.
- [ ] VSCode + extension `rust-analyzer`.
- [ ] Terminal (PowerShell / Terminal) thuộc lệnh cơ bản.

### Cargo commands
- [ ] `cargo new <name>` tạo project.
- [ ] `cargo build` compile.
- [ ] `cargo run` build + run.
- [ ] `cargo check` verify nhanh.
- [ ] `cargo fmt` format code.
- [ ] Phân biệt debug mode vs release mode.

### Project structure
- [ ] Đọc được `Cargo.toml`.
- [ ] Biết `src/main.rs` là entry point.
- [ ] Biết `target/` là output, đừng commit.
- [ ] Biết `Cargo.lock` Cargo tự quản lý.

Nếu tick được hết → sẵn sàng phase 2.

## Common error — phase 1

Tổng kết lỗi đã gặp:

| Error | Nghĩa | Fix |
|---|---|---|
| `command not found: cargo` | PATH chưa load | Mở Terminal mới |
| `error[E0601]: main function not found` | Thiếu `fn main()` | Thêm function |
| `error: expected ;, found }` | Thiếu semicolon | Thêm `;` |
| `error[E0423]: expected function, found macro println` | Quên `!` sau println | Thêm `!` |
| `error: could not find Cargo.toml` | Sai folder | `cd` về project root |
| `error: linker cc not found` | Thiếu Xcode CLI / VS Build Tools | Cài lại theo bài 2/3 |

## Tài liệu tham khảo

Sau phase 1, bookmark:
- **The Book**: <https://doc.rust-lang.org/book/> — official Rust tutorial.
- **Rust by Example**: <https://doc.rust-lang.org/rust-by-example/> — học qua ví dụ.
- **Standard library docs**: <https://doc.rust-lang.org/std/>.
- **Cargo book**: <https://doc.rust-lang.org/cargo/>.
- **crates.io**: <https://crates.io/> — kho package.
- **lib.rs**: <https://lib.rs/> — alternative crates browser.

## Tóm tắt bài 7 + phase 1

- Comment: `//` line comment, `/* */` block comment. Shortcut `Cmd/Ctrl + /`.
- Convention: dùng `//` cho hầu hết case. Doc comment `///` cho generate doc.
- Comment **why**, không phải **what**.
- Section 1 project: tạo project, sửa code, build + run, format.
- Tool + concept đã master: rustc, cargo, project structure, main function, println!, string, comment.
- Phase 2 (Variables & Mutability) sẽ học: `let`, `mut`, shadowing, constants.

**Bài kế tiếp** → [Bài 8 (phase-2): Variables, mutability, shadowing](../phase-2-variables-mutability/01-let-mut.md)
