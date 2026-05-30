# Bài 1: Linux nhập môn — vì sao DevOps engineer phải làm chủ Linux

## Một con số: 96%

Theo khảo sát W3Techs (2024), **96.3% top 1 triệu web server** chạy Linux. Hầu hết AWS EC2 instance, container Docker, K8s pod, IoT device — đều Linux. Android (~70% smartphone toàn cầu) là Linux. SpaceX Falcon, robot Boston Dynamics, máy bay F-35 — chạy Linux.

> Nếu không biết Linux, bạn không thể làm DevOps. Không có ngoại lệ.

Khoá học chuyên DevOps phải có 1 phần Linux **đủ sâu** để bạn:
- Vận hành server không cần GUI.
- Đọc/hiểu log, script, config file.
- Debug khi app/cluster lỗi.
- Tự động hoá mọi thứ với shell script.

Phase này dài (10 bài) — vì Linux là **nền tảng cho tất cả các phase sau**. Nếu yếu Linux, bạn sẽ chết đuối ở phase Container, Kubernetes, CI/CD.

## Linux thực ra là gì?

### Kernel — trái tim

> **Linux** chính xác là một **kernel** — phần lõi của hệ điều hành chịu trách nhiệm: quản lý CPU, RAM, disk, network, device.

Kernel không phải là cả OS. OS hoàn chỉnh = kernel + utilities + shell + libraries + app.

Linus Torvalds viết Linux kernel năm 1991 khi ông là sinh viên ở Helsinki. Mục tiêu: clone Unix nhưng chạy được trên PC x86 thường (Unix gốc chỉ chạy mainframe đắt tiền). Linus public source lên mailing list — cộng đồng tham gia → kernel phát triển nhanh chóng.

### Distribution — "flavors" của Linux

Một **distribution (distro)** = Linux kernel + bộ utilities + package manager + cấu hình mặc định:

```text
Kernel (Linus's source)
    │
    │ + GNU utilities (coreutils, bash, glibc)
    │ + Package manager (apt/dpkg, rpm/yum/dnf, pacman...)
    │ + Init system (systemd hoặc cũ: SysV init)
    │ + Default config, theme, software collection
    ▼
Distribution (Ubuntu, Debian, RHEL, CentOS, Arch, Alpine, ...)
```

Có hàng trăm distro. Hai họ lớn nhất:

| Họ | Package format | Package manager | Distro tiêu biểu |
|---|---|---|---|
| **Debian** | `.deb` | `apt`, `dpkg` | Debian, **Ubuntu**, Kali, Linux Mint, Pop!_OS |
| **Red Hat** | `.rpm` | `dnf`/`yum`, `rpm` | RHEL, **CentOS Stream**, Fedora, **Amazon Linux**, Rocky, AlmaLinux, Oracle Linux |
| Arch | `pkg.tar.zst` | `pacman` | Arch, Manjaro |
| SUSE | `.rpm` | `zypper` | openSUSE, SLES |
| Alpine | `.apk` | `apk` | Alpine — siêu nhẹ, dùng nhiều cho container |

**Trong DevOps thường gặp**:
- **Ubuntu Server** — đa số dự án mới + Cloud (AWS EC2, GCP, Azure marketplace).
- **CentOS Stream / Rocky / Alma** — kế thừa CentOS truyền thống (RHEL-clone).
- **Amazon Linux 2/2023** — distro của AWS, tối ưu cho EC2.
- **Alpine** — base image Docker phổ biến nhất (~5 MB).

## Vì sao có nhiều distro?

Vì philosophy khác nhau:

| Distro | Triết lý |
|---|---|
| **Debian** | Stable, conservative — package được test rất kỹ, có khi cũ |
| **Ubuntu** | Debian + user-friendly + release 6 tháng/lần + LTS 2 năm/lần |
| **Fedora** | Bleeding-edge — Red Hat dùng làm "test ground" cho RHEL |
| **RHEL** | Enterprise — stable nhất, paid support, dùng trong tổ chức lớn |
| **CentOS Stream** | "Beta của RHEL" — rolling release giữa Fedora và RHEL |
| **Arch** | DIY — install minimal, user tự build từ scratch |
| **Alpine** | Minimal, security-first — musl libc thay glibc → nhẹ |

### RHEL family vs Debian family — khác biệt cần nhớ

```text
Tác vụ                  RHEL (yum/dnf)              Debian (apt)
----------------------- --------------------------- ---------------------------
Install gói             dnf install nginx           apt install nginx
Update gói              dnf update                  apt update && apt upgrade
Tìm gói                 dnf search nginx            apt search nginx
Xoá gói                 dnf remove nginx            apt remove nginx
Config repo             /etc/yum.repos.d/*.repo     /etc/apt/sources.list*
Service init            systemctl (giống nhau)      systemctl (giống nhau)
Network config file     /etc/sysconfig/network*     /etc/netplan/*.yaml
Default firewall        firewalld                   ufw
Default editor          vi/nano                     nano/vim
```

DevOps engineer **phải biết cả hai** — vì tổ chức thật thường mix.

## Khái niệm "Open Source" — không chỉ là "free"

Một hiểu lầm cực phổ biến: open source ≠ miễn phí.

> **Open source** = source code **công khai**, ai cũng có thể đọc, sửa, đóng góp, redistribute (theo license cho phép).

Open source software có thể:
- **Free** (Linux, Python, PostgreSQL).
- **Paid** với hỗ trợ thương mại (Red Hat Enterprise Linux — bạn trả tiền cho support, code vẫn open).
- **Dual license** (MongoDB cũ, Elastic — open cho cộng đồng, paid cho cloud provider).

License open source phổ biến:

| License | Đặc điểm |
|---|---|
| **GPL** (GNU GPL v2/v3) | Code dẫn xuất phải cũng GPL ("copyleft") |
| **MIT** | Permissive — làm gì cũng được, chỉ cần giữ copyright notice |
| **Apache 2.0** | Permissive + patent grant |
| **BSD** | Tương tự MIT |
| **MPL** | Mozilla Public License — middle ground |
| **AGPL** | Như GPL nhưng yêu cầu mở source cả khi chạy như SaaS |

Linux kernel dùng **GPL v2**.

## Linux Philosophy — 4 nguyên tắc cốt lõi

Hiểu philosophy giúp bạn **dùng Linux đúng cách**, không chỉ học vẹt lệnh.

### 1. Everything is a file

Mọi thứ trong Linux đều **expose ra dạng file**:
- File text: `/etc/hosts`, `/var/log/nginx/access.log`.
- Folder (cũng là file đặc biệt): `/home/devops/`.
- Device: `/dev/sda` (disk), `/dev/tty1` (terminal), `/dev/null`.
- Process: `/proc/1234/` (info process PID 1234).
- Socket / Pipe: file IPC.

Hệ quả: **một số ít lệnh** (`cat`, `ls`, `cp`...) chạy được trên **mọi thứ**.

### 2. Small programs, single purpose

Mỗi tool làm **một việc tốt**:
- `grep` — tìm pattern.
- `sort` — sắp xếp.
- `wc` — đếm.
- `cut` — cắt cột.

Không có tool "all-in-one". Kết hợp bằng **pipe**:

```bash
cat /var/log/nginx/access.log | grep "404" | awk '{print $1}' | sort | uniq -c | sort -rn | head
```

Đây là sức mạnh — học từng tool nhỏ, ghép lại làm việc lớn.

### 3. Avoid captive UI

UI "click rồi đợi user input" khó automate. Linux ưu tiên:
- Lệnh chạy → trả kết quả → exit.
- Config qua file text, không qua dialog.
- Script chạy không cần con người ngồi đó.

Đây là vì sao DevOps yêu Linux: **mọi thứ scripted, mọi thứ reproducible**.

### 4. Configuration in plain text

Mọi config nằm trong file text (`/etc/`). Lợi ích:
- Edit bằng bất kỳ editor nào.
- Diff/version control với Git.
- Backup = copy file.
- Tạo template, parameterize bằng Ansible/Jinja2.

So với Windows Registry binary — Linux text config là thiên đường cho automation.

## Kiến trúc Linux nhìn từ trên xuống

```text
+--------------------------------------------------------+
|  User Applications (browser, IDE, custom apps)         |
+--------------------------------------------------------+
|  System Utilities (cat, ls, grep, ssh, vim, ...)       |
+--------------------------------------------------------+
|  Shell (bash, zsh, fish)                               |
+--------------------------------------------------------+
|  Libraries (glibc, ncurses, openssl, ...)              |
+--------------------------------------------------------+
|  System call interface (POSIX API)                     |
+--------------------------------------------------------+
|  Linux Kernel (process, memory, fs, network, driver)   |
+--------------------------------------------------------+
|  Hardware (CPU, RAM, disk, NIC, GPU, ...)              |
+--------------------------------------------------------+
```

Khi bạn gõ `ls /home` trong terminal:

```text
1. Bash parse lệnh "ls /home"
2. Bash fork() process mới
3. Process gọi execve("/usr/bin/ls", ["ls", "/home"])
4. ls program gọi system call openat("/home")
5. Kernel kiểm permission, đọc directory entries
6. Kernel trả về list filename qua system call
7. ls format output, gọi write() lên file descriptor 1 (stdout)
8. Kernel ghi bytes vào terminal driver
9. Terminal hiển thị
```

Bạn không cần nhớ chi tiết — nhưng hiểu **shell → utility → libc → syscall → kernel → hardware** giúp debug khi có vấn đề.

## Filesystem Hierarchy Standard (FHS) — tóm tắt

```text
/                  Root directory (KHÔNG nhầm với /root)
├── bin/           User binaries (ls, cat, cp...)   [symlink → /usr/bin trên distro mới]
├── sbin/          System binaries (mkfs, fdisk, init...) [symlink → /usr/sbin]
├── lib/           System libraries [symlink → /usr/lib]
├── etc/           Configuration files
│   ├── passwd     User database
│   ├── shadow     Password hashes (root-only)
│   ├── hostname   Tên máy
│   ├── hosts      /etc/hosts: hostname → IP mapping
│   ├── ssh/       SSH config
│   ├── systemd/   systemd unit files
│   └── nginx/     Nginx config (sau khi cài)
├── home/          User home directories
│   ├── devops/    /home/devops — home của user "devops"
│   └── alice/
├── root/          HOME của user root (KHÔNG phải / root)
├── var/           Variable data — log, cache, mail, DB
│   ├── log/       /var/log/syslog, /var/log/nginx/...
│   ├── cache/     Cache app
│   ├── lib/       App state (DB data: /var/lib/mysql, /var/lib/docker)
│   └── www/       Web content (Apache, nginx default)
├── tmp/           Temporary — XOÁ khi reboot
├── opt/           Optional third-party software (Oracle, ELK...)
├── usr/           User programs + share
│   ├── bin/       Đa số user commands
│   ├── sbin/      System admin commands
│   ├── lib/       Libraries
│   ├── local/     Software cài tay (không qua package manager)
│   └── share/     Architecture-independent data
├── boot/          Kernel + bootloader (grub config, vmlinuz, initramfs)
├── dev/           Device files (/dev/sda, /dev/tty, /dev/null...)
├── proc/          Virtual FS — info kernel + process
│   ├── cpuinfo    Info CPU
│   ├── meminfo    Info RAM
│   └── 1234/      Info process PID 1234
├── sys/           Virtual FS — info hardware + kernel objects
├── media/         Mount tự động (USB, CD)
├── mnt/           Mount thủ công
├── run/           Runtime data — PID files, sockets
└── srv/           Server data (web, ftp) — ít dùng so với /var
```

**Files trong các thư mục `bin/`, `sbin/`, `lib/`** ở root level chỉ là **symlink** tới `/usr/...` trên Ubuntu 20+, RHEL 8+ — gọi là **/usr merge**. Không cần lo, dùng path nào cũng được.

## Kiến trúc shell prompt — đọc cho hiểu

Khi vào VM bằng `vagrant ssh`, bạn thấy prompt như:

```text
[vagrant@centos-vm ~]$
 │       │         │ │
 │       │         │ └─ $ = normal user shell;  # = root shell
 │       │         └─ Current directory (~ = home; / = root)
 │       └─ Hostname
 └─ Username
```

Hoặc trên Ubuntu:

```text
vagrant@ubuntu-vm:~$
       │          │ │
       │          │ └─ $ hoặc #
       │          └─ pwd
       └─ user@hostname
```

Đọc prompt cho biết:
- **Bạn là ai** (user).
- **Bạn đang ở đâu** (working directory).
- **Bạn có quyền gì** ($ = normal, # = root).

## Tóm tắt bài 1

- **Linux = kernel** + utilities = distribution. Hàng trăm distro nhưng phổ biến: Ubuntu, RHEL/CentOS, Amazon Linux, Alpine.
- 2 họ chính: **Debian** (`apt`/`.deb`) và **Red Hat** (`dnf`/`.rpm`). DevOps phải biết cả hai.
- **Open source ≠ free** — license khác nhau (GPL, MIT, Apache, AGPL).
- 4 nguyên tắc: **everything is a file, small single-purpose programs, avoid captive UI, plain-text config**.
- **FHS** chuẩn hoá thư mục — `/etc` (config), `/var` (data), `/home` (user), `/usr/bin` (commands).
- Hiểu **shell prompt** cho biết user, hostname, pwd, quyền.

**Bài kế tiếp** → [Bài 2: Filesystem và lệnh shell cơ bản — pwd, ls, cd, absolute/relative path](02-filesystem-va-shell.md)
