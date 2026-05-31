# Bài 2: Filesystem và lệnh shell cơ bản — pwd, ls, cd, absolute/relative path

Bài này dạy 4 thứ quan trọng đầu tiên trong shell Linux:
1. Đọc **prompt** để biết bạn ở đâu.
2. **pwd, ls, cd** — 3 lệnh dùng nhiều nhất trong shell.
3. **Absolute path** vs **relative path** — sai một dấu `/` là mất nửa giờ debug.
4. **Đọc/hiểu cấu trúc thư mục** Linux.

## Khởi động VM và SSH

Cách dùng trong khoá:

```bash
# Trên host (Mac/Win)
cd ~/vagrant-vms/centos
vagrant up           # bật VM (nếu chưa)
vagrant ssh          # vào VM
```

Bạn sẽ thấy prompt thay đổi:

```text
[vagrant@centos-vm ~]$
```

Bạn đang trong VM. Mọi lệnh từ giờ chạy **trong VM**, không phải trên máy host.

> **Lưu ý**: Trong khoá này khi nói "chạy lệnh", mặc định là **chạy trong VM Linux**. Không phải Mac Terminal hay Windows PowerShell.

## 4 lệnh sống còn

### `whoami` — bạn là ai?

```bash
$ whoami
vagrant
```

Báo username hiện tại. Hữu ích khi bạn login nhiều account và quên đang là ai. Cũng quan trọng cho script: chạy script với user nào.

### `pwd` — Present Working Directory

```bash
$ pwd
/home/vagrant
```

Cho biết bạn đang đứng ở thư mục nào. **Lệnh đầu tiên** khi bạn mơ hồ.

### `ls` — list

```bash
$ ls
# (rỗng vì chưa có file gì trong home)

$ ls /etc
nginx/  ssh/  hostname  hosts  passwd  ...

$ ls -l /etc
total 1024
drwxr-xr-x  3 root root 4096 Jan 10 nginx
-rw-r--r--  1 root root  221 Jan  1 hostname
...
```

Options thường dùng:

| Option | Ý nghĩa |
|---|---|
| `-l` | Long format — show permission, owner, size, mtime |
| `-a` | Hiện cả file ẩn (bắt đầu bằng `.`) |
| `-h` | Human-readable size (`1.2K` thay `1234`) |
| `-t` | Sort theo mtime, mới nhất trên cùng |
| `-r` | Reverse order |
| `-R` | Recursive — đi sâu vào subdirectory |
| `-S` | Sort theo size |

Kết hợp:

```bash
ls -lah /var/log    # Long, all (kể cả ẩn), human-readable
ls -lhtr /tmp        # Long, human, sort time, reverse → cũ nhất trên cùng
```

Output `ls -l` đọc thế nào:

```text
drwxr-xr-x   2  vagrant  vagrant  4096  Jan 10 14:23  dev/
-rw-r--r--   1  vagrant  vagrant   142  Jan 10 14:23  notes.txt
│└─┬─┘└─┬─┘   │   └───┬─┘  └───┬─┘  └┬─┘ └─────┬────┘ └──┬──┘
│ owner group │       │        │     │         │         │
│ perms       │       │        │     │         │         └─ Tên
│             │       │        │     │         └─ mtime
│             │       │        │     └─ Kích thước byte
│             │       │        └─ Group sở hữu
│             │       └─ User sở hữu
│             └─ Số hard link
└─ Loại file: - = file, d = directory, l = symlink, b/c = block/char device
```

### `cd` — change directory

```bash
$ cd /etc           # Đi đến /etc (absolute path)
$ cd nginx          # Đi đến /etc/nginx (relative)
$ cd ..             # Lên 1 cấp → /etc
$ cd ../..          # Lên 2 cấp → /
$ cd ~              # Về home directory của user
$ cd                # = cd ~ (về home)
$ cd -              # Về thư mục TRƯỚC ĐÓ
$ cd /              # Về root /
```

`~` (tilde) = home directory. Trên vagrant user: `~` = `/home/vagrant`. Trên root: `~` = `/root`.

`-` (dấu trừ) = thư mục bạn vừa ở. Toggle qua lại tiện lợi.

## Absolute path vs Relative path — bẫy lớn

### Định nghĩa

| Kiểu | Bắt đầu bằng | Diễn giải |
|---|---|---|
| **Absolute** | `/` | Tính từ root `/`, không phụ thuộc bạn đang ở đâu |
| **Relative** | KHÔNG `/` | Tính từ pwd hiện tại |

### Ví dụ

Giả sử bạn ở `/home/vagrant`:

```bash
$ pwd
/home/vagrant

# Absolute — bạn ở đâu cũng OK
$ cat /etc/hostname
centos-vm

# Relative — chỉ hoạt động đúng nếu pwd có file dev/
$ ls dev               # = ls /home/vagrant/dev
$ cat ./notes.txt      # ./  = "ở đây" — tương đương cat notes.txt

# Hai cấp lên
$ cd /home/vagrant/dev/test
$ ls ../..             # = ls /home/vagrant
```

### Quy tắc đọc

```text
/etc/nginx/nginx.conf     ← absolute, đi từ /
./scripts/setup.sh        ← relative, "./" = pwd
../config.yml             ← relative, ".." = cha của pwd
~/.ssh/id_rsa             ← absolute (tilde expand thành /home/user)
nginx.conf                ← relative, file trong pwd
```

### Khi nào dùng cái nào?

| | Absolute | Relative |
|---|---|---|
| Pro | Không phụ thuộc pwd, an toàn | Ngắn gọn |
| Con | Dài, máy khác có thể khác path | Dễ sai nếu pwd thay đổi |
| Trong script | **PHẢI dùng absolute** | Tránh |
| Lệnh ad-hoc trên terminal | Tùy | OK |
| Cron job | **Absolute** | Tuyệt đối tránh |

**Lý do script phải dùng absolute**: cron, systemd service chạy script với pwd khác bạn nghĩ → relative path sai → script fail.

## Tự khám phá filesystem

Bắt đầu từ `/` (root) và đi loanh quanh:

```bash
$ cd /
$ ls -F
bin@   dev/   home/   lib@   media/   opt/   root/   sbin@   sys/   usr/
boot/  etc/   lib64@  mnt/   proc/    run/   srv/    tmp/    var/

# -F thêm ký hiệu:
#   /   = directory
#   @   = symlink
#   *   = executable
```

Đi sâu:

```bash
$ cd /etc
$ ls
$ less /etc/passwd          # less = pager, q để thoát
$ cat /etc/hostname
$ cat /etc/os-release       # info distro
NAME="CentOS Stream"
VERSION="9 (Stream)"
ID="centos"
...
```

### `/etc/os-release` — luôn check khi vào server mới

Đây là file đầu tiên DevOps engineer xem khi SSH vào server lạ. Cho biết:
- Distro (CentOS / Ubuntu / Amazon Linux / Alpine).
- Version (8, 9, 22.04 LTS, ...).

Quyết định lệnh đúng:
- `ID=ubuntu` hoặc `debian` → `apt`.
- `ID=rhel` hoặc `centos`, `amzn`, `rocky`, `almalinux` → `dnf`/`yum`.

Một dòng:

```bash
$ . /etc/os-release && echo $NAME $VERSION
CentOS Stream 9 (Stream)
```

## File ẩn — `.` đầu tên

File/folder bắt đầu bằng dấu chấm = ẩn. Không hiện với `ls`, chỉ hiện với `ls -a`:

```bash
$ ls -a ~
.   ..   .bash_history   .bashrc   .profile   .ssh
```

Quan trọng:
- `.bashrc`, `.bash_profile`, `.zshrc` — config shell.
- `.ssh/` — keys, known_hosts.
- `.gitconfig`, `.docker/` — config tool.
- `.` = pwd hiện tại.
- `..` = parent của pwd.

Không có magic — chỉ là convention. Bạn cũng có thể tạo file `.secret` để "tạm ẩn".

## Lệnh điều hướng nhanh — phím tắt terminal

| Phím | Tác dụng |
|---|---|
| `Tab` | Auto-complete file/folder/command |
| `Tab Tab` | Show list nếu có nhiều option |
| `↑` / `↓` | Lịch sử lệnh |
| `Ctrl+R` | Tìm trong lịch sử (incremental search) |
| `Ctrl+A` | Đầu dòng |
| `Ctrl+E` | Cuối dòng |
| `Ctrl+W` | Xoá 1 word về trái |
| `Ctrl+U` | Xoá cả dòng về trái |
| `Ctrl+K` | Xoá cả dòng về phải |
| `Ctrl+L` | Clear màn hình (= `clear`) |
| `Ctrl+C` | Hủy lệnh đang chạy |
| `Ctrl+D` | Thoát shell (= `exit`) |
| `Ctrl+Z` | Suspend lệnh (xem bài 9) |

**Đặc biệt `Tab`** — DevOps engineer pro gõ ít hơn, dùng Tab nhiều. Học gõ Tab thay vì gõ tay đầy đủ.

## `history` — lịch sử lệnh

```bash
$ history
  511  pwd
  512  ls
  513  cat /etc/hostname
  514  history

$ !513                  # Chạy lại lệnh số 513
$ !!                    # Chạy lại lệnh gần nhất
$ !ca                   # Chạy lại lệnh gần nhất bắt đầu bằng "ca"
$ history -c            # Xoá history (cẩn thận)
```

History lưu trong `~/.bash_history`. Đọc/sửa được.

## `man` và `--help` — tài liệu offline

Không cần Google mọi thứ. Linux có doc nội bộ:

```bash
$ man ls            # Manual đầy đủ, q để thoát
$ ls --help         # Tóm tắt option
$ ls -h --help | head -20
```

Cấu trúc man page:
- **NAME**: tên lệnh + 1 dòng mô tả.
- **SYNOPSIS**: cú pháp.
- **DESCRIPTION**: chi tiết.
- **OPTIONS**: liệt kê từng option.
- **EXAMPLES**: ví dụ thực tế.
- **SEE ALSO**: lệnh liên quan.

Khi không biết tên lệnh, search:

```bash
$ man -k "remove file"        # Tìm man chứa keyword
$ apropos partition           # Tương tự
```

## Thử nghiệm tổng hợp

Làm theo từng bước trong VM của bạn:

```bash
# 1. Biết mình ở đâu
whoami
pwd
ls -la

# 2. Đi loanh quanh
cd /etc
ls -F
cat hostname
cat os-release

# 3. Tạo lab folder trong home
cd ~                       # Hoặc cd
mkdir lab
cd lab
pwd                        # /home/vagrant/lab

# 4. Quay về home, dùng relative path
cd ..
ls lab/                    # Tương đương ls /home/vagrant/lab

# 5. Đi rất sâu rồi quay nhanh
cd /var/log
cd nginx 2>/dev/null || echo "Chưa cài nginx"
cd ~                       # Về home
cd -                       # Về /var/log
cd                         # Về home

# 6. Mở man page cho 1 lệnh
man cd                     # Thực tế cd là shell builtin
help cd                    # Dùng `help` cho builtin của bash
man ls
```

## Bẫy thường gặp

| Bẫy | Triệu chứng | Tránh |
|---|---|---|
| Quên `/` đầu trong absolute | `cd etc` báo lỗi nếu pwd không có `etc/` | Luôn nhớ `cd /etc` |
| `cd` vào file thay vì folder | "Not a directory" | Check `ls -la` trước |
| Case-sensitive | `cd Etc` ≠ `cd etc` | Linux phân biệt hoa thường |
| Space trong tên | `cd /tmp/my folder` thành 2 args | Quote: `cd "/tmp/my folder"` |
| Tab không complete | Folder cha không tồn tại | `ls` để verify path |
| Sai user | Tạo file ở `/root` thay `/home/vagrant` | `whoami` trước |
| Relative path trong script | Script fail khi chạy từ cron | Dùng absolute hoặc `cd $(dirname $0)` |

## Quick reference

```text
pwd                Tôi đang ở đâu?
whoami             Tôi là ai?
ls                 Cái gì ở đây?
ls -lah            Chi tiết, kể cả ẩn, kích thước đọc được
cd <path>          Đi đến đó
cd                 Về home
cd -               Về vừa rồi
cd ..              Lên 1 cấp
~                  Home
.                  Pwd
..                 Cha
/                  Root
man <cmd>          Doc đầy đủ
<cmd> --help       Doc tóm tắt
Tab                Auto-complete
Ctrl+R             Tìm history
Ctrl+L             Clear màn hình
```

## Tóm tắt bài 2

- **Prompt** chứa user, hostname, pwd, quyền (`$`/`#`).
- 4 lệnh nền: `whoami`, `pwd`, `ls`, `cd`.
- **Absolute path** bắt đầu `/`, **relative** không. Script luôn dùng absolute.
- **`~`** = home, **`.`** = pwd, **`..`** = cha.
- `ls -lah` đọc được nhiều info nhất.
- `man <cmd>` và `<cmd> --help` cho doc offline.
- Tab và Ctrl+R là vũ khí của tốc độ.

**Bài kế tiếp** → [Bài 3: Quản lý file và thư mục — mkdir, cp, mv, rm, touch, file types](03-quan-ly-file.md)
