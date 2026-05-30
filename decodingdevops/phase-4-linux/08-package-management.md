# Bài 8: Package Management — apt, dnf, rpm, snap

Package manager là **trái tim của Linux** — cách bạn cài, update, gỡ software. Hiểu nó cho phép tự động hoá deployment, viết Dockerfile chuẩn, sửa khi server bị "broken package".

Phase 2 đã giới thiệu khái niệm. Bài này đi sâu vào **bên trong Linux**, không phải Chocolatey/Homebrew bên ngoài.

## Hai họ chính

| Họ | Distro | Format | Low-level | High-level | Repo path |
|---|---|---|---|---|---|
| **Red Hat** | RHEL, CentOS Stream, Rocky, Alma, Fedora, Amazon Linux | `.rpm` | `rpm` | `dnf` (mới), `yum` (cũ) | `/etc/yum.repos.d/` |
| **Debian** | Debian, Ubuntu, Mint, Kali | `.deb` | `dpkg` | `apt`, `apt-get`, `aptitude` | `/etc/apt/sources.list*` |

Cú pháp khác nhau, **concept giống nhau**:

```text
Repository (URL trên internet hoặc local)
        │
        │ chứa Package files (.rpm hoặc .deb)
        │ chứa Metadata (tên, version, dependency)
        │
        ▼
Package manager (dnf, apt) tải về
        │
        │ Resolve dependency tree
        │ Verify signature (GPG key)
        │ Download all packages cần thiết
        │
        ▼
dpkg / rpm (low-level installer)
        │
        │ Extract package
        │ Copy file vào filesystem
        │ Run pre/post-install scripts
        │ Update package database
```

## Anatomy của .rpm và .deb

Cả hai đều là **archive** với metadata:

```text
nginx-1.24.0-1.el9.x86_64.rpm        ← Tên-version-release.distro.arch.format
nginx_1.24.0-1_amd64.deb              ← Tên_version-release_arch.format
```

Bên trong:
- File binary, lib, config được copy vào filesystem (vd `/usr/sbin/nginx`).
- Pre-install / post-install script (chạy trước/sau install).
- Metadata: tên, version, license, dependency list.
- Signature GPG để verify.

## Repository — kho package

Package không ở 1 chỗ — phân tán qua nhiều **repository** (repo):

```text
/etc/yum.repos.d/centos.repo:
  [baseos]
  name=CentOS Stream 9 - BaseOS
  baseurl=https://mirror.stream.centos.org/9-stream/BaseOS/x86_64/os/
  enabled=1
  gpgcheck=1
  gpgkey=file:///etc/pki/rpm-gpg/RPM-GPG-KEY-centosofficial
```

```text
/etc/apt/sources.list:
  deb http://archive.ubuntu.com/ubuntu jammy main restricted universe multiverse
  deb http://archive.ubuntu.com/ubuntu jammy-updates main restricted universe multiverse
  deb http://security.ubuntu.com/ubuntu jammy-security main restricted universe multiverse
```

Package manager check **mọi repo enabled**, chọn version cao nhất phù hợp.

### Thêm repo bên thứ ba

Khi cần software không có trong repo gốc (Jenkins, Docker, Kubernetes, MongoDB...):

```bash
# RHEL/CentOS — drop file .repo vào /etc/yum.repos.d/
sudo curl -o /etc/yum.repos.d/jenkins.repo https://pkg.jenkins.io/redhat-stable/jenkins.repo
sudo rpm --import https://pkg.jenkins.io/redhat-stable/jenkins.io-2023.key
sudo dnf install -y jenkins

# Ubuntu — thêm vào /etc/apt/sources.list.d/ + import GPG key
curl -fsSL https://pkg.jenkins.io/debian-stable/jenkins.io-2023.key | \
    sudo gpg --dearmor -o /usr/share/keyrings/jenkins-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/jenkins-archive-keyring.gpg] https://pkg.jenkins.io/debian-stable binary/" | \
    sudo tee /etc/apt/sources.list.d/jenkins.list
sudo apt update
sudo apt install -y jenkins
```

Quy trình:
1. Thêm GPG key (verify package signature).
2. Thêm file repo config.
3. `apt update` / `dnf clean` để refresh cache.
4. Install.

## RHEL family — rpm, dnf, yum

### `rpm` — low-level

```bash
# Install file .rpm trực tiếp
sudo rpm -ivh package.rpm                # -i install, -v verbose, -h hash progress

# Query
rpm -qa                                  # List MỌI package đã cài
rpm -qa | grep nginx                     # Filter
rpm -qi nginx                            # Info chi tiết
rpm -ql nginx                            # List file thuộc nginx
rpm -qf /usr/sbin/nginx                  # File này thuộc package nào?
rpm -qc nginx                            # File config của nginx

# Verify
rpm -V nginx                             # Check file có bị sửa không

# Erase
sudo rpm -e nginx                        # Xoá (không resolve dependency!)
```

`rpm` **không resolve dependency** — phải tự tải đủ. Đây là vì sao `dnf`/`yum` ra đời.

### `dnf` (RHEL 8+) / `yum` (cũ)

```bash
sudo dnf install nginx                   # Auto resolve dependency
sudo dnf install -y nginx                # Yes to all
sudo dnf install -y nginx mysql php      # Nhiều package

sudo dnf remove nginx                    # Uninstall
sudo dnf update                          # Update mọi package
sudo dnf update nginx                    # Update 1 package
sudo dnf upgrade                         # Tương tự update (modern syntax)

dnf search nginx                         # Tìm package có "nginx"
dnf info nginx                           # Info chi tiết
dnf list installed                       # Đã cài
dnf list available                       # Có sẵn nhưng chưa cài

dnf history                              # Lịch sử install/remove
sudo dnf history undo 5                  # Rollback transaction #5 (mạnh!)

dnf grouplist                            # Group packages (Development Tools, ...)
sudo dnf groupinstall "Development Tools"

dnf repolist                             # List repos enabled
sudo dnf clean all                       # Xoá cache nếu corrupt

sudo dnf check-update                    # Có gì update không?
```

`dnf` ≈ `yum` (cú pháp gần như giống). RHEL 8+ symlink `yum` → `dnf`. Trên CentOS Stream 9 nên gõ `dnf` chính thức.

### EPEL — Extra Packages for Enterprise Linux

Repo cộng đồng cho RHEL, mang nhiều package không có trong base:

```bash
sudo dnf install -y epel-release
sudo dnf install -y htop ncdu jq    # Các tool hay xuất hiện trong EPEL
```

## Debian family — dpkg, apt

### `dpkg` — low-level

```bash
sudo dpkg -i package.deb                 # Install file .deb
sudo dpkg -i package.deb || sudo apt -f install     # Fix dependency tự động

dpkg -l                                  # List MỌI package
dpkg -l | grep nginx
dpkg -L nginx                            # File thuộc nginx
dpkg -S /usr/sbin/nginx                  # File này thuộc package nào?
dpkg -s nginx                            # Info package

sudo dpkg -r nginx                       # Remove (giữ config)
sudo dpkg -P nginx                       # Purge (xoá luôn config)
sudo dpkg --configure -a                 # Sửa package state lỗi
```

### `apt` — high-level (modern)

```bash
sudo apt update                          # Refresh cache (BẮT BUỘC trước install)
sudo apt install nginx                   # Install
sudo apt install -y nginx mysql-server   # Yes + nhiều package

sudo apt remove nginx                    # Uninstall (giữ config)
sudo apt purge nginx                     # Uninstall + xoá config
sudo apt autoremove                      # Xoá dependency unused

sudo apt upgrade                         # Update packages (an toàn)
sudo apt full-upgrade                    # Update có thể xoá/install thêm
sudo apt dist-upgrade                    # = full-upgrade (cũ)

apt search nginx                         # Tìm
apt show nginx                           # Info
apt list --installed                     # Đã cài
apt list --upgradable                    # Có update

sudo apt clean                           # Xoá cache .deb đã tải
sudo apt autoclean                       # Xoá cache cũ
```

### `apt` vs `apt-get`

- **`apt-get`**: cũ, stable API cho script.
- **`apt`**: mới (2014), user-friendly với progress bar, color output. Dùng cho terminal.

Trong **script** vẫn nên dùng `apt-get` (output stable hơn). Tương tác trực tiếp dùng `apt`.

## Bảng tương đương lệnh

| Tác vụ | RHEL (`dnf`) | Debian (`apt`) |
|---|---|---|
| Install | `dnf install pkg` | `apt install pkg` |
| Update cache | (tự động) | `apt update` |
| Update tất cả | `dnf update` | `apt upgrade` |
| Remove | `dnf remove pkg` | `apt remove pkg` |
| Purge config | `dnf remove pkg` | `apt purge pkg` |
| Search | `dnf search keyword` | `apt search keyword` |
| Info | `dnf info pkg` | `apt show pkg` |
| List installed | `dnf list installed` | `dpkg -l` |
| Which package owns file | `rpm -qf /path` | `dpkg -S /path` |
| List files | `rpm -ql pkg` | `dpkg -L pkg` |
| History | `dnf history` | `/var/log/apt/history.log` |
| Clean cache | `dnf clean all` | `apt clean` |

## Universal package managers — Snap, Flatpak, AppImage

Modern alternatives — package **chạy được trên mọi distro**:

| Tool | Đặc điểm |
|---|---|
| **Snap** (Canonical/Ubuntu) | Sandboxed, auto-update, có sẵn Ubuntu |
| **Flatpak** | Sandboxed, mạnh hơn cho desktop GUI |
| **AppImage** | 1 file `.AppImage`, không cần install |

```bash
# Snap
sudo snap install code               # Cài VS Code
snap list                            # List
sudo snap remove code                # Xoá

# Flatpak
flatpak install flathub org.mozilla.firefox

# AppImage — download file, chmod +x, chạy
chmod +x app.AppImage && ./app.AppImage
```

DevOps server **ít dùng** Snap/Flatpak — vì overhead + auto-update có thể gây surprise. Production thường dùng `apt`/`dnf` chính thống.

## Cài software từ source — `./configure && make`

Cách cổ điển khi không có package:

```bash
wget https://nginx.org/download/nginx-1.24.0.tar.gz
tar -xzf nginx-1.24.0.tar.gz
cd nginx-1.24.0
./configure --prefix=/opt/nginx --with-http_ssl_module
make
sudo make install
```

Phương pháp này:
- Pro: tuỳ chỉnh flag compile (vd kích hoạt module).
- Con: Tự quản lý update + uninstall, không có database.

Hiếm khi cần trong DevOps thời nay — Docker image build sẵn, hoặc dùng package manager.

## Tool dev mới — Language-specific package managers

| Tool | Ngôn ngữ | Khi nào dùng |
|---|---|---|
| **pip / pipx / poetry / uv** | Python | Install lib Python |
| **npm / yarn / pnpm** | Node.js | JS deps |
| **cargo** | Rust | Rust crates |
| **go install** | Go | Go binaries |
| **gem** | Ruby | Ruby gems |
| **maven / gradle** | Java | Java deps |

**Lưu ý**: KHÔNG dùng `sudo pip install` trên RHEL/Ubuntu — phá Python hệ thống. Dùng **virtualenv** hoặc `pipx`.

## Update mọi package — workflow chuẩn

```bash
# Ubuntu/Debian
sudo apt update                          # Refresh metadata
sudo apt list --upgradable               # Xem có gì update
sudo apt upgrade                         # Update an toàn
sudo apt autoremove                      # Dọn dependency thừa
sudo apt clean                           # Xoá cache .deb

# RHEL/CentOS
sudo dnf check-update                    # Có gì update
sudo dnf upgrade                         # Update mọi package
sudo dnf autoremove
sudo dnf clean all
```

**Production**: schedule update qua **Ansible playbook**, không SSH thủ công.

## Pin version — tránh auto-update phá vỡ

### Ubuntu

```bash
# Hold (giữ version hiện tại, không upgrade)
sudo apt-mark hold nginx
sudo apt-mark unhold nginx
apt-mark showhold

# Hoặc dùng /etc/apt/preferences.d/
```

### RHEL/CentOS

```bash
sudo dnf install -y python3-dnf-plugin-versionlock
sudo dnf versionlock add nginx
sudo dnf versionlock delete nginx
sudo dnf versionlock list
```

Dùng cho package critical (DB, app chính) — tránh `apt upgrade` đổi version đột ngột.

## Mirror — chọn mirror gần để tải nhanh

Khi pull package chậm:

### Ubuntu
```bash
# Edit /etc/apt/sources.list, đổi archive.ubuntu.com → mirror.vn.bkns.vn (VN mirror)
# Hoặc tự động:
sudo apt install netselect-apt
sudo netselect-apt
```

### RHEL/CentOS
```bash
# /etc/yum.repos.d/CentOS-Stream-*.repo
# Đổi mirror.stream.centos.org → mirror VN
```

## Container — package management bên trong Docker

Dockerfile thường dùng package manager để cài runtime:

```dockerfile
# Ubuntu base
FROM ubuntu:22.04
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
        ca-certificates \
        nginx \
    && rm -rf /var/lib/apt/lists/*
```

```dockerfile
# Alpine — package manager `apk`
FROM alpine:3.19
RUN apk add --no-cache nginx curl ca-certificates
```

```dockerfile
# RHEL UBI
FROM registry.access.redhat.com/ubi9/ubi-minimal
RUN microdnf install -y nginx && microdnf clean all
```

Pattern chuẩn: install + cleanup trong **1 RUN** để giảm layer size.

## Bẫy thường gặp

| Bẫy | Hậu quả | Giải pháp |
|---|---|---|
| Quên `apt update` | Lỗi 404 hoặc version cũ | Luôn `apt update` trước install |
| `apt install` script trên CI | Cache stale | Dockerfile pattern + `--no-install-recommends` |
| `sudo pip install` | Conflict với pip system | virtualenv hoặc pipx |
| Cài software trực tiếp `make install` | Không quản lý được | Dùng package manager khi có |
| `dnf upgrade` mà không test | Production break | Pin version + canary deploy |
| Repo GPG key hết hạn | Install fail | Update key qua `rpm --import` hoặc tự renew |
| Xoá `/var/cache/dnf/` thủ công | DB lỗi | `dnf clean all` |
| Conflict 2 repo cùng package | Version sai | `dnf module enable`, `priority` |

## Quick reference

```text
# RHEL family
sudo dnf install pkg
sudo dnf remove pkg
sudo dnf update
sudo dnf search keyword
sudo dnf history
rpm -qa | grep pkg
rpm -ql pkg
rpm -qf /path

# Debian family
sudo apt update && sudo apt install pkg
sudo apt remove pkg
sudo apt upgrade
sudo apt search keyword
dpkg -l | grep pkg
dpkg -L pkg
dpkg -S /path
```

## Tóm tắt bài 8

- 2 họ chính: **RHEL** (`dnf`/`yum`/`rpm`/`.rpm`) và **Debian** (`apt`/`dpkg`/`.deb`).
- **Repository** = kho package; `/etc/yum.repos.d/` và `/etc/apt/sources.list.d/`.
- **`apt update`** bắt buộc trước install (refresh metadata).
- **`dnf history undo N`** rollback transaction — rất mạnh.
- **EPEL** = repo cộng đồng cho RHEL.
- **Pin version** cho package critical để tránh surprise upgrade.
- Trong **Dockerfile**: 1 RUN cho install + cleanup để giảm layer.
- Python/Node có package manager riêng (pip, npm) — không nhầm với hệ thống.

**Bài kế tiếp** → [Bài 9: Services và Processes — systemd, systemctl, ps, top, kill, signals](09-services-processes.md)
