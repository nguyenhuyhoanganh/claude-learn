# Bài 3: Quản lý file và thư mục — mkdir, cp, mv, rm, touch, file types

## Linux command syntax — quy ước chung

Mọi lệnh Linux theo format:

```text
command [options] [arguments]
   │        │           │
   │        │           └─ Đối tượng thao tác (file, path, text)
   │        └─ Cờ điều khiển hành vi (-r, --force, -h)
   └─ Tên lệnh
```

Ví dụ:

```bash
cp -r /home/vagrant/src /tmp/backup
│   │  └────────┬──────────────────┘
│   │           └─ 2 arguments: source và destination
│   └─ Option: recursive
└─ Command: copy
```

Quy ước options:
- Short: `-r`, `-f`, `-l` (1 ký tự).
- Long: `--recursive`, `--force`, `--long` (full word).
- Có thể gộp short: `-rf` = `-r -f`.

Khi không nhớ option:

```bash
cp --help              # Tóm tắt
man cp                 # Đầy đủ
```

## Tạo thư mục — `mkdir`

```bash
mkdir dev                       # Tạo dev/ trong pwd
mkdir dev ops backup            # Tạo 3 thư mục cùng lúc
mkdir /tmp/test                 # Absolute path

# Tạo cây nhiều cấp
mkdir -p /opt/dev/ops/devops/test
#   -p = parents, tạo cả cấp cha thiếu

# Set permission ngay khi tạo
mkdir -m 755 public
```

`-p` rất hay dùng — vừa idempotent (chạy lại không lỗi nếu đã tồn tại) vừa tạo cả parent.

## Tạo / cập nhật file — `touch`

```bash
touch testfile.txt              # Tạo file rỗng
touch a.txt b.txt c.txt         # Tạo nhiều file
touch report-{2024,2025}.log    # → report-2024.log, report-2025.log

# Brace expansion với range:
touch devops-file{1..10}.txt    # → devops-file1.txt ... devops-file10.txt
touch backup-{jan..mar}.tar      # → backup-jan.tar, backup-feb.tar, backup-mar.tar
```

`touch` còn dùng để **cập nhật timestamp** file đã tồn tại — hữu ích trong build system (Makefile dùng mtime để quyết định re-build).

```bash
touch -d "2025-01-01 10:00" old.txt    # Set mtime cụ thể
touch -t 202501011000 old.txt          # Format khác
ls -l old.txt
# -rw-r--r-- 1 vagrant vagrant 0 Jan  1  2025 old.txt
```

## Brace expansion — vũ khí năng suất

```bash
mkdir project-{frontend,backend,db}
# → project-frontend/, project-backend/, project-db/

touch test_{a,b,c}_{1,2,3}.txt
# → 9 files: test_a_1.txt, test_a_2.txt, ..., test_c_3.txt

mv app.{conf,conf.bak}
# → đổi tên app.conf thành app.conf.bak
```

Đây là **bash feature**, không phải lệnh riêng — hoạt động với mọi command.

## Copy — `cp`

```bash
cp source destination
cp file1.txt file2.txt              # Copy file
cp file1.txt /tmp/                  # Copy vào thư mục
cp *.txt /tmp/                      # Copy nhiều file (wildcard)
cp -r dir1 dir2                     # Copy directory (-r recursive)
cp -i file dest                     # -i interactive: hỏi trước khi overwrite
cp -p file dest                     # -p preserve: giữ permission/timestamp/owner
cp -a dir dest                      # -a archive = -dpR, dùng cho backup
cp -v file dest                     # -v verbose: in từng file đang copy
```

**Lưu ý quan trọng**: `cp dir1 dir2` **không** copy directory — phải có `-r`. Nếu quên `-r`, hiện lỗi:

```text
cp: -r not specified; omitting directory 'dir1'
```

### Ví dụ thực tế

```bash
# Backup config trước khi sửa
cp -p /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak

# Copy folder source code đầy đủ permission
cp -a /var/www/old /var/www/new

# Copy với verbose để theo dõi
cp -av /data/important/* /backup/
```

## Move / Rename — `mv`

`mv` làm 2 việc với cùng cú pháp:

```bash
# Move
mv file.txt /tmp/                   # Di chuyển
mv dir1 /opt/                       # Di chuyển directory (không cần -r)
mv *.log /var/log/archive/          # Move nhiều file

# Rename (mv trong cùng folder = đổi tên)
mv old.txt new.txt
mv project-v1 project-v2
```

Options:

| Option | Ý nghĩa |
|---|---|
| `-i` | Interactive — hỏi trước khi overwrite |
| `-f` | Force — overwrite không hỏi |
| `-n` | No-clobber — không overwrite file đã tồn tại |
| `-v` | Verbose |
| `-u` | Update — chỉ move nếu source mới hơn |

## Xoá — `rm` (lệnh nguy hiểm nhất)

```bash
rm file.txt                         # Xoá 1 file
rm file1 file2 file3                # Xoá nhiều
rm *.log                            # Xoá theo wildcard
rm -i file.txt                      # Hỏi trước (interactive)
rm -r dir                           # Xoá directory (recursive)
rm -f file                          # Force (không hỏi, không lỗi nếu không tồn tại)
rm -rf dir                          # XOÁ TẤT CẢ trong dir, không hỏi
```

### ⚠️ Cảnh báo cực kỳ nghiêm trọng

**Linux KHÔNG CÓ RECYCLE BIN**. Xoá là vĩnh viễn. Không undo.

```bash
# CỰC KỲ NGUY HIỂM — đừng bao giờ chạy
rm -rf /                            # Xoá toàn bộ filesystem
rm -rf / *                          # Tương tự (chú ý space sau /)
rm -rf $UNDEFINED_VAR/data          # Nếu $UNDEFINED_VAR rỗng → rm -rf /data
```

> Năm 2015, một kỹ sư marlin systems mất production vì `rm -rf $VAR/$DIR` với cả 2 biến rỗng → `rm -rf /`.

### Phòng chống tai nạn

| Kỹ thuật | Cách làm |
|---|---|
| Alias `rm` → `rm -i` | `alias rm='rm -i'` trong `.bashrc` |
| Dùng `trash-cli` | `apt install trash-cli` → `trash file` thay `rm` |
| Set readonly cho file/folder quan trọng | `chmod -w important.conf` |
| Snapshot filesystem | LVM, ZFS, Btrfs có snapshot |
| Backup thường xuyên | Rsync, restic, BorgBackup |
| Test rm bằng `ls` trước | `ls /path/to/delete/*` xem có đúng không |
| Set `set -u` trong script | Báo lỗi khi dùng biến undefined |
| Soft check biến: `${VAR:?Required}` | Script fail nếu VAR rỗng |

### Xoá folder rỗng — `rmdir`

```bash
rmdir empty-folder                  # Chỉ xoá nếu folder RỖNG
# rmdir: failed to remove 'a': Directory not empty
```

An toàn hơn `rm -rf` cho trường hợp folder lẽ ra phải rỗng — fail rõ ràng.

## File types trong Linux — không chỉ "regular file"

`ls -l` ký tự đầu tiên cho biết loại file:

| Ký tự | Loại | Mô tả |
|---|---|---|
| `-` | Regular file | Text, binary, anything |
| `d` | Directory | Thư mục |
| `l` | Symbolic link | Shortcut |
| `b` | Block device | Disk: `/dev/sda` |
| `c` | Character device | Terminal, keyboard: `/dev/tty` |
| `s` | Socket | IPC: `/run/docker.sock` |
| `p` | Named pipe (FIFO) | IPC |

```bash
$ ls -l /dev | head
total 0
crw-r--r--  1 root root  10, 235 Jan 10 14:23 autofs
brw-rw----  1 root disk   8,   0 Jan 10 14:23 sda      ← block device
crw-rw----  1 root tty    4,   0 Jan 10 14:23 tty0     ← character device
srw-rw----  1 root docker        0 Jan 10 14:23 docker.sock  ← socket
```

### Xác định "regular file" thực sự là gì — lệnh `file`

```bash
$ file /bin/ls
/bin/ls: ELF 64-bit LSB pie executable, x86-64, dynamically linked, ...

$ file /etc/passwd
/etc/passwd: ASCII text

$ file /usr/bin/yum
/usr/bin/yum: Python script, ASCII text executable

$ file /var/log/nginx/access.log
/var/log/nginx/access.log: ASCII text, with very long lines
```

`file` đọc **magic number** đầu file để xác định loại — đáng tin hơn extension.

## Symbolic link — "shortcut" của Linux

```bash
# ln -s <target> <link_name>
ln -s /opt/dev/ops/devops/test/commands.txt cmds

ls -l
# lrwxrwxrwx 1 root root 35 Jan 10 14:25 cmds -> /opt/dev/ops/devops/test/commands.txt

cat cmds          # Đọc qua link, ra content thật
```

Symlink có 2 loại:

| Loại | Tạo | Đặc điểm |
|---|---|---|
| **Soft link (symbolic)** | `ln -s` | Trỏ tới path. Mất target → link "broken". Cross filesystem được. |
| **Hard link** | `ln` (không `-s`) | 2 entry inode cùng data. Cùng filesystem. Mất 1 file kia còn. |

### Use case symlink trong DevOps

```bash
# Switch giữa nhiều version
ln -sfn /opt/app-v2 /opt/app-current
# Reload service đọc /opt/app-current → dùng v2

# /etc/nginx/sites-enabled là symlink đến sites-available
ln -s /etc/nginx/sites-available/myapp.conf /etc/nginx/sites-enabled/

# Mỗi user share dotfiles
ln -s ~/dotfiles/.vimrc ~/.vimrc
```

### Broken symlink

```bash
mv /opt/dev/ops/devops/test/commands.txt /tmp/
ls -l cmds
# lrwxrwxrwx 1 root root 35 Jan 10 14:25 cmds -> /opt/dev/ops/devops/test/commands.txt
# (highlight đỏ — broken)

cat cmds
# cat: cmds: No such file or directory
```

Symlink **không tự cập nhật** khi target di chuyển. Để fix:

```bash
# Move target lại đúng chỗ
mv /tmp/commands.txt /opt/dev/ops/devops/test/

# Hoặc xoá link, tạo mới trỏ chỗ mới
rm cmds
ln -s /tmp/commands.txt cmds
```

Xoá symlink: `rm` hoặc `unlink` — **không** xoá target.

## Wildcard (globbing) — match nhiều file

| Wildcard | Match |
|---|---|
| `*` | 0+ ký tự bất kỳ (trừ `/`) |
| `?` | 1 ký tự bất kỳ |
| `[abc]` | 1 ký tự trong tập |
| `[a-z]` | 1 ký tự trong khoảng |
| `[!abc]` | 1 ký tự KHÔNG trong tập |
| `{a,b,c}` | Một trong các từ (brace expansion) |

Ví dụ:

```bash
ls *.log                        # Mọi file .log
ls file?.txt                    # file1.txt, file2.txt, ... (1 ký tự)
ls file[1-5].txt                # file1.txt → file5.txt
ls [!.]*                        # File không ẩn (không bắt đầu .)
ls report-{daily,weekly}.csv    # 2 file cụ thể
```

**Lưu ý**: `*` mặc định **không** match file ẩn (bắt đầu `.`). Để bao gồm:

```bash
shopt -s dotglob       # Bật bao gồm hidden
shopt -u dotglob       # Tắt
```

## Sao chép có brain — workflow thực tế

Khi sửa file system quan trọng, pattern an toàn:

```bash
# 1. Backup
sudo cp -p /etc/nginx/nginx.conf /etc/nginx/nginx.conf.$(date +%F)

# 2. Verify backup
sudo ls -la /etc/nginx/nginx.conf*

# 3. Edit
sudo vim /etc/nginx/nginx.conf

# 4. Test config trước khi reload
sudo nginx -t

# 5. Reload
sudo systemctl reload nginx

# 6. Test lại
curl localhost
```

Nếu sai, revert:

```bash
sudo cp -p /etc/nginx/nginx.conf.2025-05-30 /etc/nginx/nginx.conf
sudo systemctl reload nginx
```

## Quick reference

```text
mkdir <dir>            Tạo folder
mkdir -p a/b/c         Tạo tree đa cấp
rmdir <dir>            Xoá folder rỗng
touch <file>           Tạo file rỗng / cập nhật mtime
cp src dst             Copy file
cp -r src dst          Copy folder (RECURSIVE)
cp -av src dst         Copy đầy đủ + verbose
mv src dst             Move hoặc rename
rm <file>              Xoá file
rm -r <dir>            Xoá folder (NGUY HIỂM)
rm -rf <dir>           Xoá folder không hỏi (CỰC NGUY HIỂM)
ln -s tgt lnk          Tạo symlink
file <path>            Detect loại file
ls -lh                 Long, human size
ls -F                  Append /, @, *
```

## Tóm tắt bài 3

- Cú pháp: `command [options] [arguments]`.
- **`mkdir -p`**: idempotent, tạo cả parent.
- **Brace expansion** `{a,b,c}` và `{1..10}` tạo nhiều object cùng lúc.
- **`cp -r`** bắt buộc cho folder; **`cp -a`** giữ permission/owner/mtime.
- **`rm` không có Recycle Bin** — `rm -rf /` xoá cả filesystem.
- 7 loại file: regular, directory, symlink, block, character, socket, pipe.
- **Symlink** = shortcut. `ln -s target link_name`. Broken khi target di chuyển.
- **Wildcard** + brace expansion = sức mạnh thao tác hàng loạt.

**Bài kế tiếp** → [Bài 4: Vim editor — text editor sống còn trên server không GUI](04-vim-editor.md)
