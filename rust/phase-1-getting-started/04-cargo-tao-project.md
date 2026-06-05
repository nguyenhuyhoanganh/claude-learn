# Bài 4: rustup quản lý version + cargo new tạo project đầu tiên

> Rust đã cài. Bài này dạy 2 việc: dùng `rustup` để update/uninstall/đổi version Rust, và dùng `cargo new` để tạo project chuẩn. Cuối bài bạn có 1 Rust project trên máy sẵn sàng code.

## rustup — Rust version manager

`rustup` quản lý toolchain Rust. Tương tự `nvm` cho Node.js, `pyenv` cho Python.

### Update Rust mới nhất

Rust phát hành phiên bản mới mỗi **6 tuần**. Update:

```text
$ rustup update
info: syncing channel updates for 'stable-x86_64-apple-darwin'
info: latest update on 2026-06-01, rust version 1.76.0 (abc123 2026-05-25)
info: downloading component 'cargo'
info: downloading component 'rustc'
info: installing component 'cargo'
info: installing component 'rustc'

   stable-x86_64-apple-darwin updated - rustc 1.76.0 (abc123 2026-05-25)

info: cleaning up downloads & tmp directories
```

Sau update:
```text
$ rustc --version
rustc 1.76.0 (abc123 2026-05-25)
```

### List installed toolchain

```text
$ rustup show
Default host: aarch64-apple-darwin
rustup home:  /Users/hoanganh/.rustup

installed toolchains
--------------------
stable-aarch64-apple-darwin (default)
nightly-aarch64-apple-darwin

installed targets for active toolchain
--------------------------------------
aarch64-apple-darwin

active toolchain
----------------
stable-aarch64-apple-darwin (default)
rustc 1.76.0 (abc123 2026-05-25)
```

### Channel — 3 luồng release

| Channel | Cadence | Use case |
|---|---|---|
| **stable** | 6 tuần/lần | Production code |
| **beta** | 6 tuần/lần | Pre-release stable |
| **nightly** | Hàng đêm | Bleeding-edge features |

Mặc định bạn dùng `stable`. Một số crate cần feature mới chỉ có trên `nightly`:

```text
$ rustup install nightly                 # cài nightly
$ rustup default nightly                  # đổi default sang nightly
$ rustup default stable                   # quay lại stable
```

### Override per-project

Project A cần nightly, project B cần stable:

```text
$ cd project-a
$ rustup override set nightly
info: override toolchain for '/path/to/project-a' set to 'nightly-aarch64-apple-darwin'
```

Tạo file `rust-toolchain.toml` trong project:
```toml
[toolchain]
channel = "nightly"
```

Sau đó chỉ project A dùng nightly. Phần còn lại stable.

### Uninstall Rust

Nếu muốn gỡ hoàn toàn:
```text
$ rustup self uninstall

Thanks for hacking in Rust!

This will uninstall all Rust toolchains and data, and remove
$HOME/.cargo/bin from your PATH environment variable.

Continue? (y/N)
```

Gõ `y` → xoá `~/.cargo/` và `~/.rustup/`, sửa PATH.

> **Lưu ý**: nếu muốn cài lại version cũ Rust, vẫn dùng `rustup install 1.70.0` — không cần dùng installer riêng.

## Cargo — package manager + build tool

`cargo` là tool central của Rust. Nó:
- Tạo project (`cargo new`).
- Compile (`cargo build`).
- Chạy (`cargo run`).
- Test (`cargo test`).
- Format code (`cargo fmt`).
- Lint (`cargo clippy`).
- Download dependencies (`cargo add`, `cargo update`).
- Publish lên crates.io (`cargo publish`).

Tương tự `npm` (Node), `pip` (Python), `mvn` (Java).

## `cargo new` — tạo project

Mở Terminal, đi đến thư mục bạn muốn lưu project:

```text
$ cd ~/my-rust-projects
$ cargo new hello_world
     Created binary (application) `hello_world` package
```

Cargo tạo folder `hello_world/` với cấu trúc chuẩn.

### Quy tắc đặt tên project

3 chữ "package", "project", "crate" được dùng **thay thế nhau** trong Rust:
- **Project** — folder code (cách hiểu chung).
- **Package** — đơn vị quản lý trong cargo (1 package = 1 `Cargo.toml`).
- **Crate** — đơn vị compilation (1 binary crate hoặc 1 library crate).

Tên project nên theo **snake_case**:
- `hello_world` (OK).
- `my_first_app` (OK).
- `helloWorld` (camelCase — không nên).
- `Hello-World` (kebab-case — Rust prefer underscore).
- `hello world` (có space — không được).

Cargo cảnh báo nếu bạn dùng tên không snake_case:
```text
warning: the name `Hello-World` is not snake_case, consider changing to `hello_world`
```

## Cấu trúc project Cargo

```text
hello_world/
├── Cargo.toml              ← metadata + dependencies
├── Cargo.lock              ← lock dependencies (auto-generated)
├── .gitignore              ← Git ignore (auto-generated)
├── src/
│   └── main.rs              ← source code chính
└── target/                  ← (sau khi build) executable + cache
    └── debug/
        └── hello_world      ← executable
```

### `src/main.rs` — entry point

```rust
fn main() {
    println!("Hello, world!");
}
```

3 dòng đã được tạo sẵn. Đây là code mặc định của Cargo cho binary project.

`src/` = "source" (mã nguồn). Mọi file `.rs` của bạn nằm trong đây.

### `Cargo.toml` — metadata

```toml
[package]
name = "hello_world"
version = "0.1.0"
edition = "2021"

[dependencies]
```

3 section:
- `[package]` — thông tin project.
- `[dependencies]` — list crate phụ thuộc (chưa có gì).

`name` = tên project, `version` = SemVer (semantic version), `edition` = phiên bản Rust language (2015, 2018, 2021, 2024).

**TOML** = Tom's Obvious, Minimal Language. Format key-value đơn giản, dễ đọc. Tương tự JSON nhưng human-friendly hơn.

### `Cargo.lock` — pinning version

File này được **Cargo tự generate** khi compile. Nó "khoá" version chính xác của mọi dependency (kể cả transitive).

Quy tắc:
- **Binary project**: commit `Cargo.lock` vào Git → đảm bảo team build ra cùng executable.
- **Library project**: thường không commit (để user cuối tự chọn version).
- **Không bao giờ sửa tay** — Cargo quản lý.

### `target/` — output của compiler

Sau `cargo build`:
```text
target/
├── debug/                  ← build chế độ debug (mặc định)
│   ├── hello_world          ← executable
│   ├── hello_world.d         ← dependency info
│   └── ...                   ← intermediate files
├── release/                ← build chế độ release (--release)
└── .rustc_info.json
```

`target/` được Git ignore (đã có trong `.gitignore`). Lớn lắm (vài trăm MB cho project trung bình) — không commit.

### `.gitignore`

```text
/target
```

Mặc định chỉ ignore `target/`. Bạn có thể thêm `Cargo.lock` cho library.

## Binary crate vs Library crate

`cargo new` mặc định tạo **binary crate** — chương trình standalone.

```text
$ cargo new my_library --lib
     Created library `my_library` package
```

`--lib` → tạo library crate (không có `main.rs`, thay bằng `lib.rs`):

```text
my_library/
├── Cargo.toml
└── src/
    └── lib.rs              ← entry point library
```

Khác biệt:

| | Binary crate | Library crate |
|---|---|---|
| Entry point | `src/main.rs` | `src/lib.rs` |
| Function chính | `fn main()` | Không cần `main()` |
| Output build | Executable runnable | Library `.rlib` import bởi project khác |
| `cargo run` | Chạy được | Không (không có entry) |
| Analogy | Một chiếc xe hoàn chỉnh | Động cơ rời |

Khoá học chủ yếu code binary crate. Library learnt từ phase sau.

> **1 package có thể chứa cả binary + library**: `src/main.rs` (binary) + `src/lib.rs` (library) đồng thời. Phase Project Structure (section 14) sẽ đào sâu.

## Mở project trong VSCode

```text
$ cd hello_world
$ code .
```

VSCode mở tại folder `hello_world/`. Sidebar hiển thị tree files:

```
HELLO_WORLD
> src
  Cargo.toml
```

`target/` ẩn (nếu Cargo chưa build).

`rust-analyzer` extension thấy `Cargo.toml` → kích hoạt Rust support: highlight, autocomplete, etc.

Click `src/main.rs` để mở file.

## Bẫy thường gặp

| Bẫy | Sửa |
|---|---|
| `cargo new` trong folder đã có Git repo | Cargo warning. Dùng `cargo new --vcs none` để skip git init. |
| Project name có dash → cargo cảnh báo | Dùng underscore: `my_project` thay `my-project`. |
| Mở VSCode trước rồi mới `cargo new` ngoài | rust-analyzer không thấy Cargo.toml. Đóng và mở lại folder. |
| Quên `cd` vào project trước `cargo run` | Cargo báo "could not find Cargo.toml". |
| Commit `target/` vào Git | Git repo phình to. `.gitignore` đã có sẵn — đừng xoá. |
| Sửa `Cargo.lock` tay | Cargo overwrite. Đừng tốn công. |
| `rustup update` xong nhưng compiler version cũ | Mở Terminal mới. |
| Nightly không tự update | `rustup update nightly`. |

## Tóm tắt bài 4

- `rustup` quản lý version Rust: `update`, `install`, `default`, `override`, `self uninstall`.
- 3 channel: `stable` (production), `beta`, `nightly` (bleeding-edge feature).
- `cargo new <name>` tạo binary project chuẩn với `src/main.rs` + `Cargo.toml`.
- 5 file/folder: `Cargo.toml`, `Cargo.lock`, `.gitignore`, `src/`, `target/`.
- Binary crate (`main.rs`) vs Library crate (`lib.rs` — flag `--lib`).
- Tên project nên `snake_case`, không có space/dash.

**Bài kế tiếp** → [Bài 5: Hello World — đào sâu từng dòng code](05-hello-world.md)
