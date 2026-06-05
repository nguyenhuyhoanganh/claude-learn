# Bài 13: Rust Error Codes Index — `rustc --explain` và cách đọc error message

> Mỗi error compile Rust có **mã định danh duy nhất** dạng `E0384`, `E0425`... Compiler chỉ ra mã, kèm gợi ý dùng `rustc --explain` để đọc tài liệu chi tiết. Bài này dạy hệ thống error code, cách dùng `--explain`, đọc Rust Error Codes Index online, và workflow debug khi gặp lỗi.

## Mỗi error có mã định danh

Khi compile fail, output Rust luôn có dạng:

```text
error[E0384]: cannot assign twice to immutable variable `gym_reps`
 --> src/main.rs:5:5
  |
2 |     let gym_reps = 10;
  |         --------
  |         |
  |         first assignment to `gym_reps`
  |         help: consider making this binding mutable: `mut gym_reps`
5 |     gym_reps = 15;
  |     ^^^^^^^^^^^^^ cannot assign twice to immutable variable

For more information about this error, try `rustc --explain E0384`.
```

Phân tích:

| Phần | Ý nghĩa |
|---|---|
| `error[E0384]` | Mã lỗi |
| `cannot assign twice ...` | Message ngắn |
| `--> src/main.rs:5:5` | File + dòng + cột |
| Source code block | Highlight chính xác nơi lỗi |
| `help: ...` | Gợi ý sửa |
| `For more information ... E0384` | Lệnh để đọc chi tiết |

## Format mã lỗi: `EXXXX`

- `E` = "Error".
- `XXXX` = 4 chữ số định danh.

Mỗi mã đại diện cho **một loại lỗi cụ thể**. Khi compiler gặp tình huống đã biết, nó assign mã tương ứng.

Ví dụ một số mã phổ biến bạn sẽ gặp:

| Mã | Ý nghĩa | Ngữ cảnh |
|---|---|---|
| `E0384` | Cannot assign twice to immutable variable | Quên `mut` |
| `E0425` | Cannot find value in this scope | Typo tên variable |
| `E0277` | Trait bound not satisfied | Missing trait implementation |
| `E0308` | Mismatched types | Sai type |
| `E0382` | Borrow of moved value | Move ownership |
| `E0502` | Cannot borrow as mutable | Borrow rule violation |
| `E0596` | Cannot borrow as mutable | Borrow rule violation |
| `E0601` | `main` function not found | Thiếu `fn main()` |
| `E0658` | Feature is not stable | Dùng nightly feature trên stable |

Hết khoá học bạn sẽ quen mặt vài chục mã. Đừng cố nhớ — quan trọng là **biết cách look up**.

## `rustc --explain EXXXX` — đọc trong terminal

Lệnh chuẩn để đọc chi tiết về 1 error:

```text
$ rustc --explain E0384
```

Output đầy đủ với:
- **Mô tả** lỗi.
- **Ví dụ code sai** kèm comment.
- **Cách sửa** kèm code đúng.

Demo thực tế:

```text
$ rustc --explain E0384
An immutable variable was reassigned.

Erroneous code example:

```compile_fail,E0384
fn main() {
    let x = 3;
    x = 5; // error, reassignment of immutable variable
}
```

By default, variables in Rust are immutable. To fix this error, add the keyword
`mut` after the keyword `let` when declaring the variable. For example:

```
fn main() {
    let mut x = 3;
    x = 5;
}
```
```

3 section: erroneous example → giải thích → fix.

### Workflow trong VSCode

1. Code compile fail.
2. Đọc dòng `For more information ... rustc --explain EXXXX`.
3. Mở terminal trong VSCode (`Ctrl + ` ` hoặc menu Terminal → New Terminal).
4. Paste lệnh.
5. Đọc output.
6. Apply fix vào code.

Loop này nhanh — không cần rời VSCode.

## Rust Error Codes Index online

Toàn bộ mã lỗi documented online:

**<https://doc.rust-lang.org/error_codes/error-index.html>**

Trang này list **mọi mã từ E0001 đến hiện tại** (vài trăm mã).

### Cách dùng

1. Google "rust error codes index" → link đầu = trang official.
2. Ctrl+F tìm mã (vd `E0384`).
3. Click → trang riêng cho mã đó.

Mỗi mã có:
- **Title** mô tả ngắn.
- **Description** chi tiết.
- **Erroneous example** — code sai có syntax highlight.
- **Fix** — code đúng.
- Đôi khi: **Multiple examples** cover các variant.

### Lợi thế online vs terminal

| | Terminal `--explain` | Web Index |
|---|---|---|
| Truy cập | Bất kỳ máy có rustc | Cần internet |
| Format | Plain text | Syntax highlight, links |
| Search | Không (chỉ 1 code) | Ctrl+F |
| Tương tác | Không | Click "Run" thử code |
| Tiện cho | Quick lookup khi đang code | Học sâu, browse |

Cá nhân tôi dùng terminal cho lookup nhanh, web khi muốn đọc kỹ.

### Bonus: "Try it!" trên web

Trên web, mỗi code example có button "Run" — chạy thử trực tiếp trong **Rust Playground** (browser-based). Hữu ích khi:
- Muốn verify behavior.
- Modify code test variant.
- Share link với teammate.

URL Rust Playground: <https://play.rust-lang.org/>.

## Cấu trúc error message Rust — đọc kỹ

Rust error nổi tiếng **rất informative**. Đọc đúng cách:

```text
error[E0384]: cannot assign twice to immutable variable `gym_reps`
   ^^^^^^^     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
   error code  what went wrong + which variable

 --> src/main.rs:5:5
       ^^^^^^^^^^^^^^
       file:line:column
  |
2 |     let gym_reps = 10;
  |         --------
  |         |
  |         first assignment to `gym_reps`
  |         help: consider making this binding mutable: `mut gym_reps`
       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
       context: relevant earlier code + suggestion

5 |     gym_reps = 15;
  |     ^^^^^^^^^^^^^ cannot assign twice to immutable variable
       ^^^^^^^^^^^^^
       actual problem highlighted

For more information about this error, try `rustc --explain E0384`.
       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
       how to learn more
```

5 phần chính. Đọc từ trên xuống:
1. **Header**: code + summary.
2. **Location**: file + dòng + cột.
3. **Context block**: code liên quan trước đó kèm suggestion.
4. **Problem highlight**: code gây lỗi với `^^^^`.
5. **Help footer**: command để đọc thêm.

Hầu hết case, **suggestion ở context block đủ để fix** — không cần `--explain`. `--explain` cho khi muốn hiểu sâu.

## Multiple errors — cascade

Đôi khi 1 sửa fix nhiều errors. Đôi khi 1 typo gây cascade:

```rust
let userName = 5;
println!("{username}");        // typo Capital
println!("{userName2}");        // typo, không tồn tại
```

Compiler có thể báo 3-4 error liên quan. **Sửa từ trên xuống** — error đầu thường là root cause, sửa rồi compile lại có thể auto-fix các error sau.

Không panic khi thấy 10 error. Quan sát: thường chỉ 1-2 lỗi gốc.

## Rust hơn các language khác về error message

So sánh:

### C compiler (gcc)
```text
test.c:5:5: error: assignment of read-only variable 'x'
    5 |     x = 10;
      |     ^
```

Ngắn, ít context.

### Java compiler
```text
Test.java:5: error: cannot assign a value to final variable x
        x = 10;
        ^
1 error
```

Tương tự, ít gợi ý.

### Rust compiler
```text
error[E0384]: cannot assign twice to immutable variable `x`
 --> src/main.rs:5:5
  |
2 |     let x = 5;
  |         -
  |         |
  |         first assignment to `x`
  |         help: consider making this binding mutable: `mut x`
5 |     x = 10;
  |     ^^^^^^ cannot assign twice to immutable variable
```

Context + suggestion + ASCII art highlight. Rất friendly.

Đây là một trong những điểm mà Rust **vượt trội** so với truyền thống — error message thiết kế để dạy bạn, không chỉ báo lỗi.

## Pattern: dựa vào suggestion `help: ...`

Rust thường gắn `help:` line — gợi ý cụ thể. Pattern:

```text
help: consider making this binding mutable: `mut x`
help: a local variable with a similar name exists: `apples`
help: try removing this `&`
help: there is a method with a similar name: `clone`
```

Mỗi `help:` là **một lời khuyên có thể áp dụng ngay**. Đọc kỹ — đôi khi giải pháp ở đó rồi.

## Warning vs Error code

Warning cũng có code, nhưng dạng **clippy-style** thường:

```text
warning: unused variable: `apples`
  --> src/main.rs:2:9
   |
2  |     let apples = 50;
   |         ^^^^^^ help: if this is intentional, prefix it with an underscore: `_apples`
   |
   = note: `#[warn(unused_variables)]` on by default
```

`#[warn(unused_variables)]` — đây là **lint name** thay vì error code `EXXXX`. Lint warning có thể bật/tắt bằng `#[allow(...)]` / `#[deny(...)]` (bài 14).

## Bẫy thường gặp

| Bẫy | Sửa |
|---|---|
| Bỏ qua suggestion compiler | Đọc kỹ `help:` — thường giải xong vấn đề. |
| Sửa từ error cuối lên | Sửa từ error đầu — thường root cause. |
| Không dùng `--explain` | Lookup nhanh khi không hiểu. |
| Google error message English chính xác | Cách hay — Rust community lớn. |
| Confuse error code vs lint name | `EXXXX` cho error, `unused_xxx` cho lint warning. |
| Compile 1 error fix → vô tình tạo error mới | OK — iterative process. |
| `rustc --explain` cho lint warning | Không work — chỉ error code. |
| Bookmark Error Index | Hữu ích cho lúc đầu. Sau quen mặt sẽ tự đoán. |

## Tóm tắt bài 13

- Mỗi error compile có **mã định danh `EXXXX`**.
- `rustc --explain EXXXX` đọc tài liệu trong terminal — kèm ví dụ + fix.
- Rust Error Codes Index online: <https://doc.rust-lang.org/error_codes/error-index.html>.
- Error message Rust 5 phần: header, location, context, problem, help footer.
- **Đọc `help: ...` suggestion trước** — thường giải xong vấn đề.
- Sửa error từ trên xuống — error đầu thường là root cause.
- Rust Playground <https://play.rust-lang.org/> để test snippet không cần setup.
- Workflow: error → đọc message → áp dụng suggestion → còn confused → `--explain`.

**Bài kế tiếp** → [Bài 14: Variable shadowing — let cùng tên tạo binding mới](07-variable-shadowing.md)
