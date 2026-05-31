# Bài 7: Users, Groups, Permissions, Sudo — kiểm soát truy cập trong Linux

Linux là **multi-user OS** từ ngày đầu — designed cho server với hàng trăm user dùng chung. Hệ thống permission của Linux là **nền tảng bảo mật** mọi server, container, AWS instance.

Sai 1 dòng permission = lộ data, mất production. Bài này dạy đủ để **tự tin set permission đúng**.

## 3 loại user

| Loại | UID | Mục đích |
|---|---|---|
| **Root** | 0 | Admin tối cao, toàn quyền |
| **System / Service** | 1-999 | Chạy service nền (sshd, nginx, mysql) — không login |
| **Regular** | ≥ 1000 | User người thật (developer, devops, alice) |

Root **UID = 0** — đặc biệt, kernel check số này. Đổi username "root" không mất quyền; đổi UID = 0 sang khác mới mất quyền.

System user thường có:
- Shell = `/sbin/nologin` hoặc `/bin/false` — không login interactive.
- Home folder thường ở `/var/lib/<service>` (vd `/var/lib/mysql`).
- Password = `*` hoặc `!` — disabled.

## Anatomy `/etc/passwd`

Mỗi user 1 dòng, 7 cột tách bằng `:`:

```text
vagrant:x:1000:1000::/home/vagrant:/bin/bash
   │    │  │    │  │      │            │
   │    │  │    │  │      │            └─ Login shell
   │    │  │    │  │      └─ Home directory
   │    │  │    │  └─ GECOS (comment — full name, phone)
   │    │  │    └─ Primary GID
   │    │  └─ UID
   │    └─ Password: 'x' = ở /etc/shadow; '*' hoặc '!' = disabled
   └─ Username
```

```bash
cat /etc/passwd                          # Mọi user
grep vagrant /etc/passwd                 # Tìm 1 user
awk -F: '$3 >= 1000 {print $1}' /etc/passwd     # Chỉ regular user
awk -F: '{print $1}' /etc/passwd | sort         # Mọi username, sort
```

## Anatomy `/etc/shadow`

Password hash ở **`/etc/shadow`** — root-only đọc:

```text
vagrant:$6$xyz...$abc...:19000:0:99999:7:::
   │       │            │     │  │    │
   │       │            │     │  │    └─ Số ngày cảnh báo trước hết hạn
   │       │            │     │  └─ Max ngày trước phải đổi pass
   │       │            │     └─ Min ngày giữa 2 lần đổi pass
   │       │            └─ Số ngày từ epoch (1/1/1970) đến lần đổi pass cuối
   │       └─ Hash password ($6$ = SHA-512)
   └─ Username
```

Hash format `$id$salt$hash`:
- `$1$` = MD5 (cũ, yếu).
- `$5$` = SHA-256.
- `$6$` = SHA-512 (chuẩn modern).
- `$y$` hoặc `$argon2id$` = yescrypt / argon2 (mới nhất).

**Không edit shadow trực tiếp** — dùng `passwd`.

## Anatomy `/etc/group`

```text
devops:x:1001:alice,bob,charlie
   │    │  │       │
   │    │  │       └─ Member users (comma separated)
   │    │  └─ GID
   │    └─ Password (gần như không dùng)
   └─ Group name
```

```bash
cat /etc/group | grep devops
getent group devops              # Cùng kết quả, dùng được với LDAP/NIS
```

## Quản lý user — useradd, usermod, userdel

### Tạo user

```bash
# Tạo nhanh
sudo useradd ansible

# Tạo với options chi tiết
sudo useradd -m -d /home/jenkins -s /bin/bash -c "Jenkins CI" jenkins
#            │  │                  │           └ GECOS comment
#            │  │                  └ Login shell
#            │  └ Home directory
#            └ Tạo home folder

# Tạo và add ngay vào group
sudo useradd -m -G docker,devops alice
```

Trên Ubuntu/Debian có lệnh `adduser` (script tương tác, dễ hơn).

### Set password

```bash
sudo passwd ansible              # Set password cho user
passwd                           # Đổi password CHÍNH MÌNH
sudo passwd -l user              # Lock account
sudo passwd -u user              # Unlock
sudo passwd -e user              # Force user đổi password lần login tới
```

### Sửa user

```bash
sudo usermod -aG docker alice    # Add vào group docker (SUPPLEMENTARY)
#             ^a append (giữ group cũ)
#              ^G secondary group

sudo usermod -g devops alice     # Đổi PRIMARY group (small g)
sudo usermod -s /bin/zsh alice   # Đổi shell
sudo usermod -L alice            # Lock
sudo usermod -U alice            # Unlock
sudo usermod -e 2025-12-31 bob   # Set expiry
```

**Bẫy lớn**: `usermod -G group user` (không có `-a`) → **GHI ĐÈ** group list → user mất hết group cũ. Luôn dùng `-aG`.

### Xoá user

```bash
sudo userdel alice               # Xoá user, GIỮ home folder
sudo userdel -r alice            # Xoá luôn home + mail spool
```

## Quản lý group

```bash
sudo groupadd devops             # Tạo group
sudo groupadd -g 5000 myteam     # Với GID cụ thể
sudo groupmod -n newname oldname # Đổi tên group
sudo groupdel devops             # Xoá group

# Add user vào group (3 cách):
sudo usermod -aG devops alice    # Cách 1: usermod
sudo gpasswd -a alice devops     # Cách 2: gpasswd
sudo vim /etc/group              # Cách 3: edit thẳng (cẩn thận)

# Remove user khỏi group
sudo gpasswd -d alice devops
```

## Xem thông tin user

```bash
id                               # Thông tin user hiện tại
id alice                         # Thông tin alice

# uid=1001(alice) gid=1001(alice) groups=1001(alice),27(sudo),998(docker)

whoami                           # Username hiện tại
who                              # Ai đang login
w                                # Ai login + đang làm gì
last                             # Lịch sử login
last alice                       # Lịch sử login của alice
lsof -u alice                    # File alice đang mở
finger alice                     # Info chi tiết (cần cài)
```

## Switch user — su và sudo su

```bash
su -                             # Switch sang root (cần root password)
su - alice                       # Switch sang alice (cần alice password)
su alice                         # Switch nhưng giữ env hiện tại (không load .bashrc)

sudo -i                          # Switch sang root (chỉ cần password CỦA MÌNH)
sudo su - alice                  # Tương tự
sudo -u alice command            # Chạy 1 lệnh dưới alice
```

`-` (dash) sau `su` rất quan trọng: **`su -`** load environment của user mới (`.bashrc`, `PATH`, home folder); **`su`** không load → user mới ở pwd cũ với env cũ.

```bash
exit                             # Thoát về user trước
Ctrl+D                           # = exit
```

## File ownership

Mỗi file có **3 owner**:

```bash
$ ls -l
-rw-r--r-- 1 alice devops 1234 Jan 10 14:23 report.pdf
            │ │     │
            │ │     └─ Group owner
            │ └─ User owner
            └─ Hard link count
```

### `chown` — change owner

```bash
sudo chown alice file.txt                       # Đổi user owner
sudo chown alice:devops file.txt                # User + group
sudo chown :devops file.txt                     # Chỉ group
sudo chown -R alice:devops /var/www/html        # RECURSIVE
sudo chown --reference=src.conf dst.conf        # Copy ownership từ file khác
```

### `chgrp` — change group only

```bash
sudo chgrp devops file.txt
sudo chgrp -R devops /var/www/html
```

> **Cẩn thận `-R`**: recursive trên `/etc` hoặc `/var` có thể phá hệ thống. Backup ownership trước:
> ```bash
> getfacl -R /var/www > acl-backup.txt
> # Restore: setfacl --restore=acl-backup.txt
> ```

## File permission — mode bits

`ls -l` ký tự 2-10 là 9 bit permission, chia 3 nhóm × 3 quyền:

```text
-rwxr-xr--
 │││ │││ │││
 │││ │││ │└┴─ Quyền cho OTHERS (mọi user còn lại)
 │││ │└┴───── Quyền cho GROUP (group owner)
 │└┴───────── Quyền cho USER (owner)
 └─ Loại file (-/d/l/...)
```

3 quyền:

| Bit | Trên FILE | Trên DIRECTORY |
|---|---|---|
| **r** (read) | Đọc nội dung | List file trong folder |
| **w** (write) | Sửa, xoá nội dung | Tạo/xoá file trong folder |
| **x** (execute) | Chạy như program/script | `cd` vào folder + truy cập file inside |

**Lưu ý folder**: chỉ `r` mà không có `x` → biết tên file nhưng không đọc được. Chỉ `x` mà không có `r` → đọc file nếu biết tên chính xác nhưng không list được.

### Chmod symbolic

```bash
chmod u+x script.sh              # User + execute
chmod u-w file.txt               # User - write
chmod g+w file.txt               # Group + write
chmod o-r file.txt               # Other - read
chmod a+r file.txt               # All (u+g+o) + read
chmod ug=rw,o= file.txt          # Set chính xác
chmod -R g+w /var/www/html       # Recursive
```

`u`=user, `g`=group, `o`=other, `a`=all. `+`=add, `-`=remove, `=`=set chính xác.

### Chmod numeric (octal)

Mỗi quyền 1 số:
- `r` = 4
- `w` = 2
- `x` = 1

Cộng dồn → 3 chữ số cho user, group, other:

| Quyền | Octal |
|---|---|
| `rwx` | 4+2+1 = 7 |
| `rw-` | 4+2 = 6 |
| `r-x` | 4+1 = 5 |
| `r--` | 4 |
| `-wx` | 2+1 = 3 |
| `-w-` | 2 |
| `--x` | 1 |
| `---` | 0 |

```bash
chmod 755 script.sh              # rwxr-xr-x (executable cho mọi người)
chmod 644 file.txt               # rw-r--r-- (file thường)
chmod 600 ~/.ssh/id_rsa          # rw------- (private key — BẮT BUỘC)
chmod 700 ~/.ssh                 # rwx------ (chỉ owner)
chmod 750 secret_folder          # rwxr-x---
chmod 770 shared_team            # rwxrwx---
chmod 1777 /tmp                  # rwxrwxrwt (sticky bit)
```

### Permission convention

| Octal | Use case |
|---|---|
| `644` | File text thường |
| `755` | Script, binary, folder |
| `600` | Secret (SSH key, password file) |
| `700` | Folder secret (~/.ssh) |
| `400` | Read-only secret |
| `666` | World-writable file (cẩn thận!) |
| `777` | World-writable folder (gần như NEVER) |

> **`chmod 777` là kẻ thù bảo mật**. Quy tắc: ít quyền nhất có thể, không bao giờ "fix lazy" bằng 777.

### Special bits — setuid, setgid, sticky

```text
4xxx — setuid bit (s)
2xxx — setgid bit (s)
1xxx — sticky bit (t)
```

```bash
# Setuid: chạy với quyền OWNER (chứ không phải caller)
ls -l /usr/bin/passwd
# -rwsr-xr-x ... root root /usr/bin/passwd
#    ^ "s" thay "x" cho user
# → user thường chạy passwd nhưng process chạy quyền root để ghi /etc/shadow

# Setgid trên folder: file tạo trong folder inherit group folder
chmod g+s /shared/team           # File mới trong /shared/team có group = group của folder

# Sticky bit: chỉ owner mới xoá được file trong folder
ls -ld /tmp
# drwxrwxrwt ... /tmp
#         ^ "t" — Alice không xoá được file của Bob trong /tmp dù có write
```

Octal:

```bash
chmod 4755 binary                # setuid + 755
chmod 2755 folder                # setgid + 755
chmod 1777 /tmp                  # sticky + 777
```

## Umask — default permission cho file mới

Khi tạo file/folder, permission = `default - umask`.

```bash
umask                            # Hiện umask hiện tại
# 0022

# File mới: 666 - 022 = 644 (rw-r--r--)
# Folder mới: 777 - 022 = 755 (rwxr-xr-x)
```

Set umask trong `~/.bashrc`:

```bash
umask 002                        # File 664, folder 775 (group writable)
umask 077                        # File 600, folder 700 (private)
```

Production server thường `umask 022` hoặc `077`.

## Sudo — quyền root tạm thời

### Vì sao cần sudo?

- **Audit trail**: mọi `sudo` được log (`/var/log/auth.log` hoặc `secure`).
- **Least privilege**: user chỉ được làm việc cụ thể, không full root.
- **Password user, không phải root**: không cần share root password.

### Sudoers file

Config ở `/etc/sudoers` — **KHÔNG edit trực tiếp**, dùng `visudo`:

```bash
sudo visudo
```

`visudo` mở vim với syntax check — fail save nếu sai cú pháp (tránh khoá chính mình ngoài root).

### Cú pháp cơ bản

```text
user    HOST=(RUNAS:GROUP)   COMMAND
```

Ví dụ:

```text
# user root full quyền
root    ALL=(ALL:ALL) ALL

# user alice full quyền (như root)
alice   ALL=(ALL:ALL) ALL

# group sudo (Ubuntu) hoặc wheel (RHEL) full quyền
%sudo   ALL=(ALL:ALL) ALL
%wheel  ALL=(ALL) ALL

# user jenkins không cần password
jenkins ALL=(ALL) NOPASSWD: ALL

# user backup chỉ được chạy 1 lệnh
backup  ALL=(root) NOPASSWD: /usr/bin/rsync, /usr/bin/tar

# Group devops chạy systemctl
%devops ALL=(root) /usr/bin/systemctl restart nginx, /usr/bin/systemctl reload nginx
```

### Tốt hơn: `/etc/sudoers.d/`

Edit sudoers file gốc rủi ro. Tạo file riêng trong `/etc/sudoers.d/`:

```bash
sudo visudo -f /etc/sudoers.d/devops-team

# Content:
%devops ALL=(ALL) NOPASSWD: ALL
```

File trong `sudoers.d/` được include tự động. Drop file mới = thêm rule, xoá file = bỏ rule. Sạch hơn.

### Lệnh sudo

```bash
sudo command                     # Chạy với root
sudo -u alice command            # Chạy với alice
sudo -i                          # Login shell root
sudo su -                        # Tương tự
sudo -l                          # List quyền của tôi
sudo -k                          # Clear cached credential (force ask password)
sudo !!                          # Chạy lại lệnh trước với sudo
```

### NOPASSWD — tự động hoá

```text
jenkins ALL=(ALL) NOPASSWD: /usr/bin/docker
```

Jenkins user chạy docker không cần password — dùng cho CI/CD pipeline. Nhưng **giới hạn command** — không cho `NOPASSWD: ALL`.

## Sudo log

```bash
# RHEL/CentOS
sudo tail /var/log/secure | grep sudo

# Ubuntu/Debian
sudo tail /var/log/auth.log | grep sudo

# Modern with journalctl
journalctl -u sudo
```

Mọi lệnh sudo được log → audit ai làm gì khi nào.

## Bẫy bảo mật

| Sai | Hậu quả | Đúng |
|---|---|---|
| `chmod 777 -R /var/www` | World-writable, hack được | `chmod 755`, `chown nginx:nginx` |
| Edit `/etc/sudoers` bằng vim | Syntax sai → mất sudo | `visudo` |
| `usermod -G group user` (không `-a`) | Xoá hết group cũ | `usermod -aG` |
| `chown -R` ở root nhầm | Phá ownership system | Backup ACL trước |
| Để SSH key 644 | SSH refuse to use | `chmod 600 ~/.ssh/id_rsa` |
| Lưu password trong file plaintext | Anyone đọc được | `chmod 600`, hoặc password manager |
| NOPASSWD: ALL cho user thường | Mất ý nghĩa sudo | Giới hạn command cụ thể |
| Chia sẻ root password | Không audit ai làm gì | Tạo IAM user/IAM-like cho từng người + sudo |

## Production: PAM, ACL, RBAC

Linux có lớp permission nâng cao:

- **PAM** (Pluggable Authentication Modules): tích hợp LDAP, Kerberos, 2FA.
- **ACL** (`setfacl`, `getfacl`): permission per-user ngoài 3 nhóm owner/group/other.
- **SELinux / AppArmor**: Mandatory Access Control — kernel-enforced policy.
- **Capabilities**: chia nhỏ "root power" thành 40+ capability (CAP_NET_ADMIN, CAP_SYS_PTRACE...).

Trong tổ chức lớn, user thường authenticate qua LDAP/AD, sudo policy quản tập trung qua Ansible/Puppet. Sẽ touch ở section sau.

## Quick reference

```text
useradd / userdel / usermod        Quản user
groupadd / groupdel / gpasswd       Quản group
passwd                              Đổi password
id / whoami / who / w / last        Info user
su - / sudo -i / sudo -u            Switch user
chown user:group file               Đổi owner
chmod 755 / chmod u+x file          Đổi permission
ls -l                               Xem owner + permission
umask 022                           Default permission file mới
visudo / /etc/sudoers.d/            Sửa sudo policy
sudo -l                             List quyền của mình
```

## Tóm tắt bài 7

- 3 loại user: root (UID 0), system (1-999), regular (≥1000). Info ở `/etc/passwd` + `/etc/shadow`.
- `useradd -m -G ... -s ... user` tạo user. `usermod -aG` add group (luôn có `-a`).
- 3 nhóm permission: user, group, other × 3 quyền: r=4, w=2, x=1.
- `chmod 600 ~/.ssh/id_rsa`, `chmod 755 script.sh` — convention chuẩn.
- **Không bao giờ `chmod 777`** — kẻ thù bảo mật.
- **Folder cần `x`** để cd vào.
- **`visudo`** cho sửa sudoers; tốt hơn: file trong `/etc/sudoers.d/`.
- `NOPASSWD` cho tự động hoá, nhưng giới hạn command cụ thể.

**Bài kế tiếp** → [Bài 8: Package Management — apt, dnf, rpm, snap](08-package-management.md)
