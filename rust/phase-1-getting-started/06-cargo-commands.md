# Bài 6: rustc, cargo build/run/check/fmt — terminal workflow

> VSCode Run button cho convenience, nhưng để hiểu sâu và làm CI/CD, bạn cần làm việc trực tiếp với command line. Bài này đào sâu 5 lệnh chính: `rustc`, `cargo build`, `cargo run`, `cargo check`, `cargo fmt`. Mỗi lệnh có vai trò khác nhau — biết khi nào dùng cái nào.

## Mở Terminal trong VSCode

VSCode tích hợp terminal:
- `Ctrl + ` ` (backtick) — toggle terminal panel.
- Menu **Terminal → New Terminal**.

Terminal mở **tại folder project hiện tại** — không cần `cd` thủ công.

## `rustc` — compile 1 file Rust thủ công

`rustc` = the Rust compiler. Lệnh thấp nhất, ít dùng trong dự án thật nhưng cần biết.

```text
$ cd src
$ rustc main.rs
```

Kết quả: tạo file binary cùng folder:
- **macOS / Linux**: file `main` (không extension).
- **Windows**: `main.exe`.

Chạy binary:
```text
# macOS / Linux
$ ./main
Hello world!

# Windows PowerShell
PS> .\main.exe
Hello world!
```

`./` (hoặc `.\`) = "cùng folder hiện tại". Bắt buộc — nếu chỉ gõ `main`, shell tìm trong PATH, không thấy → error.

### Khi nào dùng `rustc`

- File Rust độc lập, không có `Cargo.toml`.
- Học lý thuyết compiler.
- Build script đơn lẻ.
- Không bao giờ trong project thật — luôn dùng `cargo`.

### Architecture-specific

```text
$ file main
main: Mach-O 64-bit executable arm64
```

Binary build cho **architecture cụ thể**:
- `arm64` — Apple Silicon (M1/M2/M3).
- `x86_64` — Intel Mac, hầu hết PC Windows.

Cross-compile được (Rust hỗ trợ tốt — `rustup target add x86_64-pc-windows-msvc`) nhưng phức tạp.

Binary build trên Mac **không chạy** trên Windows và ngược lại. Cùng OS + cùng arch → portable.

## `cargo build` — compile cả project

```text
$ cd hello_world          # ở top-level project, không trong src/
$ cargo build
   Compiling hello_world v0.1.0 (/Users/.../hello_world)
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.42s
```

`cargo build` khác `rustc` ở chỗ:
- Compile **mọi file** trong project (theo dependency graph).
- Download + compile dependencies (`Cargo.toml` `[dependencies]`).
- Output vào `target/debug/` (mặc định) hoặc `target/release/`.

Sau lệnh, có executable tại:
```text
target/debug/hello_world         # macOS / Linux
target\debug\hello_world.exe     # Windows
```

Chạy thủ công:
```text
$ ./target/debug/hello_world
Hello world!
```

### Debug mode vs Release mode

`cargo build` mặc định = **debug mode**:
- Build **nhanh** (không optimize nặng).
- Binary **lớn** (kèm debug info).
- Run **chậm** hơn release.

`cargo build --release` = **release mode**:
- Build **chậm** hơn (optimize nhiều: inline, dead code elim, LTO).
- Binary **nhỏ** hơn (strip debug info).
- Run **nhanh** hơn (đôi khi 10-100x).

Output release vào `target/release/`.

```text
$ cargo build
$ ls -la target/debug/hello_world
-rwxr-xr-x  1 hoanganh  staff  430K Jun  4 10:00 hello_world

$ cargo build --release
$ ls -la target/release/hello_world
-rwxr-xr-x  1 hoanganh  staff   80K Jun  4 10:05 hello_world    # nhỏ hơn 5 lần
```

**Quy tắc**:
- Đang dev → `cargo build` (debug).
- Ship production → `cargo build --release`.

### Vì sao mặc định debug?

Dev cycle ngắn: edit → compile → run → edit → compile. Compile nhanh quan trọng hơn binary size.

Production chỉ build 1 lần (CI/CD) rồi ship. Compile chậm 1 lần OK, runtime nhanh suốt sau đó.

## `cargo run` — build + execute

`cargo run` = `cargo build` + chạy executable, 1 lệnh:

```text
$ cargo run
   Compiling hello_world v0.1.0 (/Users/.../hello_world)
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.42s
     Running `target/debug/hello_world`
Hello world!
```

Output có 3 phần:
1. `Compiling ...` — compile step.
2. `Finished ...` — build xong.
3. `Running ...` + output program — chạy binary.

Đây chính là cái nút **▶ Run** trong VSCode làm.

### Flags hữu ích

```text
$ cargo run --release         # build + run release mode
$ cargo run --quiet           # ẩn dòng Compiling/Running
$ cargo run -q                # alias --quiet
```

`--quiet`/`-q` để output sạch — chỉ thấy output của program, không thấy log cargo.

### Smart re-build

`cargo run` lần 2 mà code không đổi → skip compile, run luôn:

```text
$ cargo run
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.00s
     Running `target/debug/hello_world`
Hello world!
```

Cargo cache build artifact trong `target/` — tăng tốc dev cycle.

### Truyền args cho program

```text
$ cargo run -- arg1 arg2
```

`--` separates cargo flags từ program args. Phase Functions sẽ học `std::env::args()` để đọc.

## `cargo check` — kiểm tra mà không build executable

```text
$ cargo check
    Checking hello_world v0.1.0
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.13s
```

`cargo check`:
- Chạy frontend của compiler: lex, parse, type check, borrow check.
- **Không** linking, không tạo executable.
- **Nhanh hơn `cargo build` 5-10 lần**.

### Khi nào dùng `cargo check`

- Đang sửa code, chỉ muốn biết có lỗi compile không.
- Trên CI: pre-flight check trước khi build thật.
- Editor extension (rust-analyzer) gọi background `cargo check` để show error inline.

### Demo error

Cố tình lỗi:
```rust
fn main() {
    println("Hello");   // SAI — thiếu !
}
```

```text
$ cargo check
    Checking hello_world v0.1.0
error[E0423]: expected function, found macro `println`
 --> src/main.rs:2:5
  |
2 |     println("Hello");
  |     ^^^^^^^ not a function
  |
help: use `!` to invoke the macro
  |
2 |     println!("Hello");
  |            +

error: could not compile `hello_world` (bin "hello_world") due to 1 previous error
```

Compiler chỉ rõ:
- File + line + column.
- Lỗi gì.
- **Suggestion sửa** (`help: use '!' ...`).

Sửa, chạy lại:
```text
$ cargo check
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.20s
```

Clean.

## `cargo fmt` — auto-format code

`cargo fmt` chạy `rustfmt` lên **toàn project**.

### Demo: make code ugly

```rust
fn main() {
        println!(   "Hello world!"   )   ;
}
```

```text
$ cargo fmt
$ cat src/main.rs
fn main() {
    println!("Hello world!");
}
```

Code đã format theo Rust convention chuẩn. 4-space indent, không thừa whitespace.

### Vì sao tự động format?

Trong team:
- Bạn thích indent 2 spaces, Tom thích 4.
- Bạn để `{` cùng dòng, Mary để dòng riêng.
- Bạn để space sau `,`, Bob không.

Tốn tâm trí debate. `rustfmt` quyết định luôn — mọi project Rust trên thế giới style giống nhau. Đọc code mở-source quen mắt.

### Format 1 file

```text
$ rustfmt src/main.rs
```

`cargo fmt` chạy `rustfmt` lên mọi file. Pre-commit hook thường gọi `cargo fmt --check` để verify.

```text
$ cargo fmt --check
```

Check mà không sửa. Exit code 0 nếu OK, ≠ 0 nếu có chỗ cần format → fail CI.

## So sánh 5 lệnh

| Lệnh | Compile? | Tạo executable? | Run? | Khi dùng |
|---|---|---|---|---|
| `rustc file.rs` | Có | Có | Không | File standalone, học compiler |
| `cargo build` | Có | Có | Không | Build artifact để ship |
| `cargo build --release` | Có (optimize) | Có (nhỏ, nhanh) | Không | Production build |
| `cargo run` | Có (nếu cần) | Có (cache) | Có | Dev — edit & run loop |
| `cargo check` | Frontend only | Không | Không | Verify syntax/type nhanh |
| `cargo fmt` | Không | Không | Không | Style code consistent |

## Alias ngắn

Cargo cho phép alias ngắn:

```text
$ cargo b          = cargo build
$ cargo r          = cargo run
$ cargo c          = cargo check
$ cargo t          = cargo test
```

Tiện cho gõ nhanh. Tuy nhiên `cargo fmt` không có alias 1 chữ.

## Workflow điển hình

```text
# Trong khi dev
$ cargo check        # lúc lúc check error nhanh
$ cargo run          # khi muốn test code
$ cargo fmt          # định kỳ format

# Trước commit
$ cargo fmt
$ cargo check
$ cargo test         # phase Testing sẽ học

# CI/CD pipeline
$ cargo fmt --check
$ cargo clippy       # linter (sẽ học sau)
$ cargo test
$ cargo build --release
```

## Bẫy thường gặp

| Bẫy | Sửa |
|---|---|
| Gõ `rustc main.rs` ở root project (không trong src/) | `cargo build` mới hiểu cấu trúc project. `rustc` cần đường dẫn `src/main.rs`. |
| `./main` not found sau `rustc` | Binary có thể ở folder khác. `ls` xem. |
| `target/debug/` to gigabytes | Cargo cache. `cargo clean` xoá `target/`. |
| Format không apply | Save file trước. Hoặc `cargo fmt --` (truyền tham số). |
| `cargo run` chạy code cũ | Save file trước (rust-analyzer auto-save nếu config). |
| `cargo check` không show error nhưng `cargo run` lỗi | `cargo check` không catch runtime error. Phải `cargo run`. |
| Release build chậm | Bình thường. `--release` tốn nhiều thời gian optimize. |
| Cấu hình `rustfmt.toml` không apply | File phải ở project root, không trong src/. |

## Tóm tắt bài 6

- `rustc` compile 1 file. `cargo` quản lý project (file + deps).
- `cargo build` → tạo executable trong `target/debug/`.
- `cargo build --release` → optimized binary cho production, nhỏ + nhanh hơn.
- `cargo run` = build + run, dùng nhiều nhất khi dev.
- `cargo check` = compile frontend only, nhanh 5-10x, dùng để verify syntax/type.
- `cargo fmt` chạy rustfmt cho consistent style — auto-format không debate.
- Cache trong `target/` — `cargo clean` xoá để fresh build.

**Bài kế tiếp** → [Bài 7: Comments + Project Solution + Section Review](07-comments-summary.md)
