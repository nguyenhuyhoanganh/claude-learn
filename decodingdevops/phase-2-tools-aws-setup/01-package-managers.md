# Bài 1: Package Managers — Chocolatey và Homebrew cho dev environment

## Vì sao DevOps engineer dùng package manager?

Bạn có thể download VirtualBox, Vagrant, Git, Java, Maven... bằng cách lên website từng tool, click download, click installer next-next-finish. **Cách đó không sai**. Nhưng có 5 vấn đề với DevOps engineer:

1. **Không lặp lại được** — máy mới phải nhớ lại 20 link, 20 cú click.
2. **Không version control được** — không biết đã cài version nào, không rollback được.
3. **Không tự động hoá được** — script setup phải `curl`-link-installer, parse output thủ công.
4. **Khác giữa máy team** — mỗi dev cài bản khác → "works on my machine".
5. **Update khó** — phải check website từng tool, download lại installer mới.

**Package manager** giải quyết cả 5:

```bash
# Một dòng cài tool:
choco install virtualbox vagrant git maven -y   # Windows
brew install virtualbox vagrant git maven        # macOS

# Một dòng update toàn bộ:
choco upgrade all -y
brew upgrade
```

Đây là **mindset DevOps**: nếu làm thủ công 1 lần đã đủ → làm thủ công được, không cần script. Nếu phải làm 2 lần trở lên → script. Setup dev environment chắc chắn lặp lại (máy mới, đồng nghiệp mới, CI agent...).

## Linux đã có sẵn package manager — Windows/Mac thì không

```text
Apt (Debian/Ubuntu)  ──► apt install nginx
Yum/DNF (RHEL/Fedora) ──► dnf install nginx
Pacman (Arch)         ──► pacman -S nginx
APK (Alpine)          ──► apk add nginx
```

Trên Linux, package manager **là một phần của OS**. Trên Windows và macOS, gốc không có → cộng đồng tạo ra:

- **Chocolatey** cho Windows (2011).
- **Homebrew** cho macOS (2009).

Cả hai đều là dự án **mã nguồn mở**, dùng community-maintained recipes (package definitions).

## Chocolatey — package manager cho Windows

### Cài Chocolatey

Mở **PowerShell as Administrator**, chạy script cài chính thức:

```powershell
# Bước 1: cho phép script chạy
Set-ExecutionPolicy Bypass -Scope Process -Force

# Bước 2: tải và chạy installer
[System.Net.ServicePointManager]::SecurityProtocol = `
    [System.Net.ServicePointManager]::SecurityProtocol -bor 3072

iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
```

Sau khi xong, test:

```powershell
choco --version
# 2.x.y
```

### Vì sao cần "Run as Administrator"?

Chocolatey ghi vào `C:\ProgramData\chocolatey` và đôi khi `C:\Program Files`. Không có quyền admin thì không ghi được. Đây là khác biệt rõ giữa Windows (admin/non-admin sharp) và macOS/Linux (sudo cho từng lệnh).

### Cú pháp Chocolatey

| Lệnh | Mục đích |
|---|---|
| `choco install <package> -y` | Cài (–y = không hỏi yes/no) |
| `choco install <package> --version=X.Y.Z` | Cài version cụ thể |
| `choco upgrade <package>` | Update lên bản mới nhất |
| `choco upgrade all -y` | Update mọi package |
| `choco uninstall <package>` | Gỡ |
| `choco list` | Liệt kê tool đã cài |
| `choco search <keyword>` | Tìm package |
| `choco info <package>` | Xem chi tiết |

### Tìm package

Vào **community.chocolatey.org**, search tên tool. Mỗi trang có lệnh `choco install ...` copy-paste được.

### Bẫy khi cài Chocolatey

| Bẫy | Lỗi | Giải pháp |
|---|---|---|
| Antivirus chặn script | "Execution policy" hoặc Defender alert | Tạm tắt 15 phút, hoặc whitelist Chocolatey |
| `Restricted` execution policy | Script không chạy | `Set-ExecutionPolicy Bypass -Scope Process` |
| Không chạy as admin | `Access denied` | Right-click PowerShell → "Run as administrator" |
| Mạng công ty proxy/firewall | Download fail | Cấu hình `choco config set proxy` |
| Cài tool conflict với cài tay trước đó | 2 version cùng tồn tại | Uninstall thủ công trước, rồi `choco install` |

## Homebrew — package manager cho macOS

### Cài Homebrew

Một dòng:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Script sẽ hỏi password (sudo). Sau khi cài xong, **với Mac Apple Silicon (M1/M2/M3/M4)** cần thêm Homebrew vào PATH:

```bash
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

Với Mac Intel, Homebrew cài ở `/usr/local`, đã có sẵn trong PATH.

Test:

```bash
brew --version
# Homebrew 4.x.y
```

### Cú pháp Homebrew

| Lệnh | Mục đích |
|---|---|
| `brew install <package>` | Cài tool CLI |
| `brew install --cask <package>` | Cài app GUI (vd VS Code, Docker Desktop) |
| `brew upgrade <package>` | Update |
| `brew upgrade` | Update mọi package |
| `brew uninstall <package>` | Gỡ |
| `brew list` | Liệt kê |
| `brew search <keyword>` | Tìm package |
| `brew info <package>` | Xem chi tiết |
| `brew doctor` | Chẩn đoán cấu hình |
| `brew cleanup` | Dọn cache cũ |

### Formula vs Cask — khác biệt quan trọng

| Khái niệm | Loại | Ví dụ |
|---|---|---|
| **Formula** | CLI tool (binary, server, library) | `brew install wget`, `brew install nginx` |
| **Cask** | GUI app (kiểu .app/.dmg) | `brew install --cask visual-studio-code` |

Lý do tách: formula maintain bởi Homebrew core, cask là wrapper quanh installer của vendor. Phần lớn lệnh trong khoá này dùng formula.

### Bẫy với Homebrew trên M1/M2/M3

- Homebrew của M1 dùng path `/opt/homebrew` — Mac Intel dùng `/usr/local`. Script cũ tham chiếu `/usr/local/bin/brew` sẽ fail trên M1.
- Một số package cũ chưa có bản ARM → Homebrew dùng Rosetta tự động hoặc fail. Check `brew info <package>` có `bottle` cho `arm64_*` không.
- M1 Mac không cài được VirtualBox (Oracle) → bài VM sau ta dùng VMware Fusion thay.

## Bảng so sánh nhanh

| Tiêu chí | Chocolatey | Homebrew |
|---|---|---|
| OS | Windows | macOS, Linux |
| Cần quyền | Administrator | sudo (lần đầu) |
| Repo trung tâm | community.chocolatey.org | brew.sh / formulae |
| Cài tool CLI | `choco install` | `brew install` |
| Cài GUI app | `choco install` (chung) | `brew install --cask` |
| Update toàn bộ | `choco upgrade all -y` | `brew upgrade` |
| File cấu hình | `C:\ProgramData\chocolatey\config\` | `~/Brewfile` (optional) |
| Số package | ~10,000 | ~7,000 formula + 6,000 cask |
| Tốc độ cộng đồng | Trung bình | Nhanh, nhiều contributor |

## Bonus: Brewfile — version control dev environment

Homebrew hỗ trợ file `Brewfile` để liệt kê toàn bộ tool cần cài:

```ruby
# Brewfile
tap "hashicorp/tap"

brew "git"
brew "wget"
brew "jq"
brew "vagrant"
brew "maven"
brew "openjdk@17"
brew "awscli"
brew "kubectl"
brew "terraform"
brew "ansible"
brew "hashicorp/tap/packer"

cask "visual-studio-code"
cask "iterm2"
cask "docker"
cask "google-chrome"
cask "vmware-fusion"
```

Cài toàn bộ trong 1 lệnh:

```bash
brew bundle install
```

Có thể commit `Brewfile` vào git → mọi dev trong team setup giống nhau, máy mới chạy 1 lệnh xong. Đây là **bản chất DevOps** áp dụng vào chính dev environment.

Chocolatey cũng có cơ chế tương tự: `choco install packages.config` với file XML liệt kê tool.

## Một workflow setup máy mới điển hình

Khi nhân viên DevOps mới gia nhập team, thường có script onboarding:

```bash
#!/bin/bash
# bootstrap.sh — chạy trên Mac mới

# 1. Cài Homebrew nếu chưa có
if ! command -v brew &> /dev/null; then
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

# 2. Đọc Brewfile từ repo nội bộ
curl -fsSL https://internal.acme.com/dev/Brewfile -o /tmp/Brewfile
brew bundle install --file=/tmp/Brewfile

# 3. Cấu hình git
git config --global user.name "${USER_FULLNAME}"
git config --global user.email "${USER_EMAIL}"
git config --global pull.rebase true

# 4. Generate SSH key cho GitHub
ssh-keygen -t ed25519 -C "${USER_EMAIL}" -f ~/.ssh/id_ed25519 -N ""
echo "Copy public key này vào GitHub:"
cat ~/.ssh/id_ed25519.pub

echo "Setup hoàn tất sau ~15 phút thay vì 1-2 ngày!"
```

Đây là **mục tiêu cuối**: máy mới được setup trong **15 phút**, không phải 1-2 ngày click-click.

## Alternatives — không chỉ có Chocolatey & Homebrew

| Tool | OS | Đặc điểm |
|---|---|---|
| **Scoop** | Windows | Nhẹ, không cần admin, profile-based |
| **WinGet** | Windows | Của Microsoft, tích hợp sẵn Windows 11 |
| **MacPorts** | macOS | Tiền thân của Homebrew, gặp ít hơn |
| **Nix** | Linux/macOS | Reproducible build, declarative, học khó |
| **asdf**, **mise** | Linux/macOS | Quản lý version cho runtime (Node, Python, Ruby...) |
| **devcontainers** | All | Cài tool trong container Docker, isolated khỏi host |

Khoá này dùng Chocolatey + Homebrew vì phổ biến nhất.

## Security note — script `curl | bash` có an toàn không?

Cả Chocolatey và Homebrew yêu cầu chạy script từ internet qua `curl | bash` hoặc PowerShell `iex`. Đây là **anti-pattern bảo mật** lý thuyết — bạn đang chạy code không xem.

Tại sao vẫn chấp nhận:
- Cả hai dự án có **lịch sử lâu, repo công khai, audit được**.
- URL HTTPS chính thức (brew.sh, community.chocolatey.org) — TLS đảm bảo integrity trong transit.
- Cộng đồng đông → script bị đổi sẽ bị phát hiện nhanh.

Giảm rủi ro:
- **Download script về xem trước** rồi mới chạy.
- Trong môi trường doanh nghiệp, dùng **internal mirror** với script đã được security team review.
- Tránh `curl | bash` với tool ít người biết / project mới.

## Tóm tắt bài 1

- Package manager = nền tảng để dev environment **lặp lại được, version-controlled, automated**.
- **Chocolatey** cho Windows (cần admin PowerShell). **Homebrew** cho macOS (sudo lần đầu).
- Phân biệt **formula** (CLI) vs **cask** (GUI app) trên Homebrew.
- M1/M2 Mac dùng path `/opt/homebrew` — script cũ cần điều chỉnh.
- **Brewfile** (hoặc packages.config) → onboard dev mới trong 15 phút thay vì 1-2 ngày.
- `curl | bash` có rủi ro security — chấp nhận được với Chocolatey/Brew vì lịch sử dài + audit cộng đồng.

**Bài kế tiếp** → [Bài 2: Cài đặt công cụ DevOps cơ bản — VirtualBox, Vagrant, Git, JDK, Maven, AWS CLI](02-cai-dat-cong-cu-co-ban.md)
