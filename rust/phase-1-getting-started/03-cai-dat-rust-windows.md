# Bài 3: Cài đặt Rust trên Windows — PowerShell, Visual Studio C++, rustup, VSCode

> Windows hơi phức tạp hơn macOS vì Rust cần **MSVC linker** từ Visual Studio. Bài này dạy 4 bước: làm quen PowerShell, xác định OS architecture (32 vs 64-bit, x86 vs ARM), cài Visual Studio C++ Build Tools, cài Rust + VSCode.

## Bước 1: Làm quen PowerShell

**PowerShell** = command-line shell mạnh nhất của Windows. Mở:
- `Win + X` → click "Terminal" (Windows 11) hoặc "Windows PowerShell" (Win 10).
- Hoặc `Win + R` → gõ `powershell` → Enter.

Cửa sổ với prompt:
```text
PS C:\Users\hoanganh>
```

Phân tích:
- `PS` — PowerShell prompt.
- `C:\Users\hoanganh` — đường dẫn hiện tại.
- `>` — sẵn sàng nhận lệnh.

### Lệnh cơ bản

```text
PS> Get-Location                       # in đường dẫn hiện tại (alias: pwd)
PS> pwd
C:\Users\hoanganh

PS> Get-ChildItem                       # list (alias: ls, dir)
PS> ls
Directory: C:\Users\hoanganh

Mode    LastWriteTime    Length  Name
----    -------------    ------  ----
d----   06/04/2026...            Desktop
d----   06/03/2026...            Documents
...

PS> Set-Location Documents              # đổi thư mục (alias: cd)
PS> cd Documents
PS> cd ..                                # cha
PS> cd ~                                 # home (C:\Users\<username>)

PS> New-Item -ItemType Directory -Name my-rust-projects
PS> mkdir my-rust-projects               # cũng được

PS> Clear-Host                           # xoá màn hình (alias: cls)
PS> cls
```

PowerShell cho phép dùng alias kiểu Unix (`pwd`, `ls`, `cd`, `mkdir`) — tiện cho người quen macOS/Linux.

> **PowerShell** khác **Command Prompt (cmd)** — cmd cũ hơn, ít tính năng. PowerShell mới hơn, mạnh hơn. Khoá dùng PowerShell.

## Bước 2: Xác định Windows OS version + architecture

Rust binary phải khớp **architecture** của OS. Có 3 architecture chính:
- **x86 (32-bit)** — Windows cũ trước 2007.
- **x86_64** (a.k.a. **x64**, **AMD64**) — 99% PC từ 2010 đến 2023.
- **aarch64** (a.k.a. **ARM64**) — Surface Pro X, một số laptop 2024+ với chip Qualcomm.

Xác định:

```text
PS> systeminfo | findstr "System Type"
System Type:    x64-based PC
```

Hoặc:
1. `Win + I` → Settings → System → About.
2. Xem mục **System type**: `64-bit operating system, x64-based processor`.

Cả 3 architecture đều có Rust support, rustup tự detect.

## Bước 3: Cài Visual Studio C++ Build Tools

Rust cần **MSVC** (Microsoft Visual C++) linker. Không phải cài full Visual Studio IDE — chỉ cần **Build Tools**.

Tải:
- <https://visualstudio.microsoft.com/downloads/> — scroll xuống "Tools for Visual Studio" → **Build Tools for Visual Studio 2022**.
- Hoặc tải full Visual Studio Community (free) nếu định code C++ luôn.

Cài Build Tools:
1. Chạy installer.
2. Tick **Desktop development with C++**.
3. Bên phải, đảm bảo tick:
   - **MSVC v143 - VS 2022 C++ x64/x86 build tools**.
   - **Windows 11 SDK** (hoặc Windows 10 SDK nếu Win 10).
   - **C++ CMake tools for Windows** (optional).
4. Install — tải khoảng 8 GB, mất 30-60 phút.

Sau khi xong, **restart máy**.

> Tài nguyên cần thiết: ~10 GB disk. Nếu thiếu space, bỏ tick bớt component khác trong Visual Studio installer.

### Vì sao cần MSVC?

Rust compiler (`rustc`) compile source code → **object files** (`.obj`). Linker gộp object files + standard library + system library → **executable** (`.exe`).

Linker không phải Rust tự viết — Rust dùng linker của OS:
- macOS / Linux: GCC / Clang linker.
- Windows: MSVC linker (`link.exe`).

Có alternative `rustc --target=x86_64-pc-windows-gnu` dùng MinGW thay MSVC, nhưng MSVC chuẩn hơn cho Windows.

## Bước 4: Cài Rust qua rustup

Tải installer chính thức tại <https://rustup.rs/>.

Trang sẽ detect Windows → click **Download rustup-init.exe (64-bit)**.

Chạy `rustup-init.exe`. Cửa sổ Command Prompt mở:

```text
Welcome to Rust!

This will download and install the official compiler for the Rust
programming language, and its package manager, Cargo.

...

Current installation options:

   default host triple: x86_64-pc-windows-msvc
     default toolchain: stable (default)
               profile: default
  modify PATH variable: yes

1) Proceed with installation (default)
2) Customize installation
3) Cancel installation
>
```

Gõ `1` → Enter.

Nếu Visual Studio C++ Build Tools chưa cài, rustup-init sẽ báo:
```text
The Visual Studio components are required.
```

→ Cài Visual Studio trước (Bước 3) rồi chạy lại `rustup-init.exe`.

Sau ~ 5 phút:
```text
Rust is installed now. Great!

Press the Enter key to continue.
```

Đóng Command Prompt cũ. Mở PowerShell mới (PATH phải reload).

Verify:
```text
PS> rustc --version
rustc 1.75.0 (...)

PS> cargo --version
cargo 1.75.0 (...)

PS> rustup --version
rustup 1.27.0 (...)
```

### Cấu trúc cài đặt trên Windows

```text
C:\Users\hoanganh\.rustup\           ← toolchains
C:\Users\hoanganh\.cargo\
├── bin\                              ← binaries
│   ├── cargo.exe
│   ├── rustc.exe
│   ├── rustup.exe
│   ├── rustfmt.exe
│   └── clippy.exe
└── env.bat / env.ps1
```

PATH được thêm tự động `C:\Users\hoanganh\.cargo\bin`.

## Bước 5: Cài VSCode

Tải tại <https://code.visualstudio.com/> — installer `.exe` cho Windows.

Cài:
1. Chạy installer.
2. Tick **Add to PATH** (quan trọng — cho phép gõ `code` từ PowerShell).
3. Tick **Add "Open with Code" action to Windows Explorer file/directory context menu** (tiện).
4. Install.

Verify:
```text
PS> code --version
1.89.1
abc123
x64
```

### Cài extension `rust-analyzer`

Trong VSCode:
1. Click icon Extensions ở sidebar (hoặc `Ctrl + Shift + X`).
2. Search "rust-analyzer".
3. Tác giả: **rust-lang**. Click **Install**.

Cài thêm:
- **Even Better TOML** — syntax cho `Cargo.toml`.
- **CodeLLDB** — debugger.

## Verify toàn bộ

Mở PowerShell mới:
```text
PS> rustc --version
rustc 1.75.0 (82e1608df 2026-05-15)

PS> cargo --version
cargo 1.75.0 (1d8b05cdd 2026-05-15)

PS> rustup --version
rustup 1.27.0

PS> code --version
1.89.1
```

4 dòng có output → OK.

## Bẫy thường gặp Windows

| Triệu chứng | Sửa |
|---|---|
| `rustup-init.exe` báo "Visual Studio not installed" | Cài Visual Studio C++ Build Tools (Bước 3) trước. |
| `error: linker link.exe not found` | MSVC chưa setup. Reinstall VS Build Tools với "C++ build tools" component. |
| PATH không update sau install | Đóng tất cả PowerShell, mở lại. Hoặc restart Windows. |
| `code` command not found | VSCode chưa add vào PATH. Reinstall, tick "Add to PATH". |
| `Execution Policy` block PowerShell script | `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` |
| Antivirus quarantine `rustc.exe` | Whitelist `~/.cargo/bin/`. |
| ARM Surface laptop install x64 binaries | rustup nên detect, nhưng có thể force: `rustup toolchain install stable-aarch64-pc-windows-msvc` |
| WSL vs native Windows | Có thể dùng WSL (Ubuntu trong Windows). Pattern khác — không bàn ở đây. |

## Khi nào dùng WSL?

**WSL (Windows Subsystem for Linux)** = Linux chạy trong Windows. Nhiều dev Rust dùng WSL vì:
- Linux toolchain quen thuộc.
- Compile nhanh hơn (filesystem khác).
- Project deploy lên Linux server.

Cài WSL:
```text
PS> wsl --install
```

Sau đó cài Rust trong WSL theo cách của Linux (giống macOS bài 2). VSCode hỗ trợ extension "WSL" để edit file Linux từ Windows VSCode.

Khoá học hướng dẫn cài native Windows cho người mới. WSL là option nâng cao.

## Tóm tắt bài 3

- 4 bước: PowerShell → Visual Studio C++ Build Tools → Rust qua rustup → VSCode.
- Rust trên Windows cần **MSVC linker** từ Visual Studio.
- PowerShell hỗ trợ Unix alias (`ls`, `cd`, `pwd`) — thân thiện với người quen macOS/Linux.
- Architecture phổ biến: x86_64 (99%). ARM64 cho Surface mới.
- WSL = option nâng cao nếu muốn dev kiểu Linux trong Windows.

**Bài kế tiếp** → [Bài 4: rustup, cargo new — quản lý version + tạo project](04-cargo-tao-project.md)
