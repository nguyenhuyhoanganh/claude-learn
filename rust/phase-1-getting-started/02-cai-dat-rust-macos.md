# Bài 2: Cài đặt Rust trên macOS — terminal, Xcode CLI, rustup, VSCode

> Cài Rust trên macOS cần 4 bước theo thứ tự: làm quen Terminal, cài Xcode Command Line Tools (cho linker), cài Rust qua `rustup`, cài VSCode + extension. Bài này dạy từng bước có chú thích **vì sao**.

## Bước 1: Làm quen với Terminal

**Terminal** = ứng dụng dòng lệnh của macOS. Trên Mac, mở:
- `Cmd + Space` → gõ "Terminal" → Enter.
- Hoặc `Finder → Applications → Utilities → Terminal`.

Cửa sổ hiện ra với prompt kiểu:
```text
hoanganh@MacBook-Pro ~ %
```

Phân tích prompt:
- `hoanganh` — username.
- `MacBook-Pro` — tên máy.
- `~` — thư mục hiện tại (`~` = home directory, tức `/Users/hoanganh/`).
- `%` — separator báo Terminal sẵn sàng nhận lệnh (`$` cho bash, `%` cho zsh).

### Lệnh cơ bản cần biết

```text
$ pwd                              # in đường dẫn thư mục hiện tại
/Users/hoanganh

$ ls                                # list files & folders
Desktop  Documents  Downloads  Pictures  ...

$ ls -la                            # list chi tiết, kèm hidden files
total 32
drwxr-xr-x   18 hoanganh  staff   576 Jun  4 10:00 .
drwxr-xr-x    5 root      admin   160 Jan 15 09:00 ..
-rw-r--r--    1 hoanganh  staff  3526 Jun  3 14:22 .zshrc
drwx------+   5 hoanganh  staff   160 Jun  4 09:30 Desktop
...

$ cd Documents                      # đổi thư mục vào Documents
$ pwd
/Users/hoanganh/Documents

$ cd ..                             # quay lại thư mục cha
$ cd ~                              # về home directory
$ cd /                              # về root filesystem

$ mkdir my-rust-projects            # tạo thư mục mới
$ mkdir -p a/b/c                    # tạo nested directories

$ clear                             # xoá màn hình terminal
```

### Vì sao Terminal quan trọng cho Rust

- `rustc`, `cargo` là **command-line programs** — bạn gọi chúng qua Terminal.
- IDE có GUI button "Run" — nhưng dưới hood chính là gọi command tương ứng.
- Hiểu Terminal → debug nhanh hơn khi setup gặp lỗi.

> macOS default shell từ Catalina (2019) trở đi là **zsh** (`%`). Trước đó là **bash** (`$`). Cú pháp gần như giống nhau cho lệnh cơ bản.

## Bước 2: Cài Xcode Command Line Tools

Rust cần **linker** để gộp object files thành executable. Trên macOS, linker đến từ **Xcode Command Line Tools** (không phải toàn bộ Xcode IDE, chỉ phần CLI ~1.5 GB).

Mở Terminal, gõ:
```text
$ xcode-select --install
```

Một dialog popup hiện ra:
```text
The "xcode-select" command requires the command line developer tools.
Would you like to install the tools now?

  [Get Xcode]   [Install]   [Cancel]
```

Click **Install** → đợi 5-15 phút tuỳ network. Dialog License Agreement → Agree.

Verify:
```text
$ xcode-select -p
/Library/Developer/CommandLineTools

$ gcc --version
Apple clang version 15.0.0 ...
```

Nếu thấy path → OK. Nếu báo `error: command line tools are already installed` → cũng OK, bạn đã có sẵn.

> **Đừng** cài full Xcode app từ App Store nếu chỉ học Rust. Xcode full ~15 GB, không cần.

## Bước 3: Cài Rust qua rustup

**rustup** = official tool quản lý version Rust. Không cài Rust trực tiếp — luôn cài qua rustup.

```text
$ curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Phân tích lệnh:
- `curl` — tải nội dung từ URL.
- `--proto '=https'` — chỉ chấp nhận HTTPS.
- `--tlsv1.2` — TLS version tối thiểu.
- `-sSf` — silent + show error + fail fast.
- `| sh` — pipe nội dung tải vào shell để execute.

Script hiển thị:
```text
Welcome to Rust!

Current installation options:

   default host triple: aarch64-apple-darwin
     default toolchain: stable (default)
               profile: default
  modify PATH variable: yes

1) Proceed with installation (default)
2) Customize installation
3) Cancel installation
>
```

Gõ `1` → Enter. Script:
1. Tạo `~/.cargo/` chứa cargo binaries.
2. Tạo `~/.rustup/` chứa toolchain (compiler files).
3. Sửa `~/.zshrc` (hoặc `.bashrc`) thêm `~/.cargo/bin` vào `PATH`.

Sau ~ 5 phút:
```text
Rust is installed now. Great!

To get started you may need to restart your current shell.
```

**Mở Terminal mới** (Cmd+T hoặc đóng-mở lại) để PATH update có hiệu lực.

Verify:
```text
$ rustc --version
rustc 1.75.0 (82e1608df 2026-05-15)

$ cargo --version
cargo 1.75.0 (1d8b05cdd 2026-05-15)

$ rustup --version
rustup 1.27.0 (...)
```

3 tool đều available.

### Cấu trúc `~/.cargo/`

```text
~/.cargo/
├── bin/                    ← binary tools
│   ├── cargo
│   ├── rustc
│   ├── rustup
│   ├── rustfmt
│   └── clippy
├── env                     ← shell setup script
├── registry/                ← cached crate downloads
└── config.toml              ← optional config
```

PATH bao gồm `~/.cargo/bin` → gõ `cargo` ở bất kỳ thư mục nào đều chạy.

## Bước 4: Cài VSCode

**Visual Studio Code** = code editor free, mạnh nhất cho Rust hiện nay (nhờ `rust-analyzer` extension).

Tải tại <https://code.visualstudio.com/> — click "Download for Mac". File `.zip` về Downloads.

Cài:
1. Unzip → file `Visual Studio Code.app`.
2. Drag vào thư mục `Applications`.
3. Mở từ Launchpad hoặc `Cmd + Space` → "Visual Studio Code".

Lần đầu mở, macOS sẽ hỏi xác nhận app từ internet → Open.

### Cài extension `rust-analyzer`

Trong VSCode:
1. Click icon Extensions ở sidebar (hoặc `Cmd + Shift + X`).
2. Search "rust-analyzer".
3. Author chính thức: **rust-lang**. Click **Install**.

> Đừng cài extension "Rust" cũ (deprecated). Phải là `rust-analyzer` của tác giả `rust-lang`.

`rust-analyzer` cung cấp:
- Syntax highlight đẹp.
- Auto-complete (Intellisense).
- Inline error/warning.
- Click → go to definition.
- Refactoring (rename, extract function).
- Inlay hints (hiển thị type ngầm).
- Click "Run"/"Debug" button trên main function.

### Extension khác đáng cài
- **Even Better TOML** (tamasfe) — syntax highlight cho `Cargo.toml`.
- **CodeLLDB** (Vadim Chugunov) — debugger cho Rust.
- **Error Lens** (Alexander) — highlight error ngay trên dòng code.

## Bước 5: Thêm VSCode vào PATH (mở từ Terminal)

Có lệnh `code .` để mở VSCode tại folder hiện tại từ Terminal — rất tiện.

Trong VSCode:
1. `Cmd + Shift + P` → mở Command Palette.
2. Gõ "Shell Command".
3. Chọn **Shell Command: Install 'code' command in PATH**.

Verify:
```text
$ which code
/usr/local/bin/code

$ cd ~/my-rust-projects
$ code .                          # mở VSCode tại thư mục hiện tại
```

`code .` mở VSCode tại folder hiện tại (`.` = thư mục hiện tại).

## Verify toàn bộ cài đặt

Mở Terminal mới, chạy 4 lệnh:
```text
$ rustc --version
rustc 1.75.0 (...)

$ cargo --version
cargo 1.75.0 (...)

$ rustup --version
rustup 1.27.0 (...)

$ code --version
1.89.1
abc123
arm64
```

Cả 4 phải có output version (không phải "command not found"). OK → sẵn sàng cho bài kế tiếp.

## Bẫy thường gặp

| Triệu chứng | Nguyên nhân + sửa |
|---|---|
| `command not found: rustc` sau install | PATH chưa load. Mở Terminal mới hoặc `source ~/.cargo/env`. |
| `xcode-select` báo "already installed" nhưng `gcc` not found | Reinstall: `sudo rm -rf /Library/Developer/CommandLineTools` rồi `xcode-select --install` lại. |
| `error: linker cc not found` khi cargo build | Thiếu Xcode CLI. Cài lại. |
| `permission denied` khi install rustup | Đừng dùng `sudo`. rustup cài vào home directory. |
| `rust-analyzer` báo "could not find Cargo.toml" | Đứng đúng thư mục project có Cargo.toml. |
| VSCode mở app thay vì lệnh `code` | Quên install Shell Command. Làm lại bước 5. |
| `rustup` cũ → install nhưng version cũ | `rustup self update` |
| MacBook M1/M2/M3 (ARM) khác Intel | rustup tự detect arch (`aarch64` vs `x86_64`). Không cần làm gì khác. |

## Tóm tắt bài 2

- 4 thành phần cài: Terminal (sẵn), Xcode CLI Tools (linker), Rust (qua rustup), VSCode + rust-analyzer.
- Terminal cơ bản: `pwd`, `ls`, `cd`, `mkdir`, `clear`.
- `rustup` quản lý version — luôn cài Rust qua rustup, không bao giờ trực tiếp.
- `~/.cargo/bin` được add vào PATH → `cargo` available everywhere.
- VSCode + extension `rust-analyzer` (tác giả rust-lang) là combo chuẩn.
- `code .` mở VSCode tại folder hiện tại — tiện cho workflow.

**Bài kế tiếp** → [Bài 3: Cài đặt Rust trên Windows](03-cai-dat-rust-windows.md)
