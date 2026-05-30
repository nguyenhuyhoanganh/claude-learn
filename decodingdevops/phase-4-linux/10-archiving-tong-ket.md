# Bài 10: Archiving, network và tổng kết phase Linux

Bài cuối phase Linux. Học **3 nhóm tool còn lại** (archiving, network, Ubuntu-specific) và **tổng kết** mọi thứ đã học.

## Archiving — đóng gói file để backup, transfer

### tar — Tape ARchive

`tar` tên cũ từ thời lưu băng từ. Hôm nay vẫn là format chuẩn cho:
- Backup folder lớn.
- Distribute source code (nginx, redis tải về dạng `.tar.gz`).
- Tạo Docker image layer.

```bash
# Tạo archive
tar -czvf archive.tar.gz dir/             # gzip
tar -cjvf archive.tar.bz2 dir/            # bzip2 (nén tốt hơn, chậm hơn)
tar -cJvf archive.tar.xz dir/             # xz (nén tốt nhất)
tar -cvf archive.tar dir/                 # Không nén
```

Flags:
- `-c` **c**reate
- `-x` e**x**tract
- `-t` lis**t** content
- `-z` gz**ip** compression
- `-j` b**j**zip2
- `-J` x**J** compression
- `-v` **v**erbose
- `-f` **f**ile (tên archive)

Quy ước extension:

| File | Compress | Lệnh tạo | Lệnh extract |
|---|---|---|---|
| `.tar` | None | `tar -cvf` | `tar -xvf` |
| `.tar.gz` / `.tgz` | gzip | `tar -czvf` | `tar -xzvf` |
| `.tar.bz2` / `.tbz2` | bzip2 | `tar -cjvf` | `tar -xjvf` |
| `.tar.xz` / `.txz` | xz | `tar -cJvf` | `tar -xJvf` |

Modern tar auto-detect compression:

```bash
tar -xvf archive.tar.gz       # OK, tar tự detect
tar -xvf archive.tar.xz       # OK
tar -xvf archive.tar.bz2      # OK
```

### Extract vào folder khác

```bash
tar -xzvf archive.tar.gz -C /opt          # Extract vào /opt
```

### List nội dung archive (không extract)

```bash
tar -tzvf archive.tar.gz | head
```

### Backup với timestamp

```bash
BACKUP="/backup/etc-$(date +%F).tar.gz"
sudo tar -czvf "$BACKUP" /etc
```

Pattern dùng trong cron job hằng đêm.

### tar exclude

```bash
tar -czvf logs.tar.gz --exclude='*.log.gz' /var/log/
tar -czvf src.tar.gz --exclude='node_modules' --exclude='.git' /app/
```

### tar incremental

```bash
# Snapshot file (nhớ trạng thái)
tar -cvf /backup/full.tar -g /backup/snap.snar /data/      # Full
tar -cvf /backup/inc1.tar -g /backup/snap.snar /data/      # Incremental
```

Backup full lần đầu, sau đó chỉ backup thay đổi.

## zip / unzip

Tương thích Windows tốt hơn `tar`. Format chuẩn cho cross-platform.

```bash
# Cài (thường chưa có sẵn)
sudo dnf install -y zip unzip
sudo apt install -y zip unzip

# Tạo
zip archive.zip file1 file2
zip -r archive.zip folder/                # Recursive cho folder
zip -9 archive.zip files                  # Max compression
zip -e archive.zip file                   # Encrypt (cần password)

# Extract
unzip archive.zip
unzip archive.zip -d /opt                 # Vào /opt
unzip -l archive.zip                      # List không extract
```

## gzip, bzip2, xz — nén 1 file

```bash
gzip file.log                             # → file.log.gz, xoá gốc
gzip -k file.log                          # Keep gốc
gunzip file.log.gz                        # Decompress

bzip2 file.log                            # → file.log.bz2
bunzip2 file.log.bz2

xz file.log                               # → file.log.xz
unxz file.log.xz

# Compare nén:
# gzip:  nhanh, ratio trung bình
# bzip2: chậm hơn, ratio tốt hơn
# xz:    chậm nhất, ratio tốt nhất
# zstd:  modern, nhanh + ratio tốt
```

Lưu log rotated thường dùng `gzip` vì balance speed/size.

## scp / rsync — copy giữa server

### scp — Secure CoPy

```bash
# Local → Remote
scp file.txt user@server:/path/

# Remote → Local
scp user@server:/path/file.txt .

# Folder
scp -r folder/ user@server:/path/

# Port khác 22
scp -P 2222 file.txt user@server:/path/

# Qua intermediate (jump host)
scp -J user@bastion file.txt user@target:/path/
```

`scp` đơn giản nhưng **không resume** khi đứt, **không filter** được. Cho file lớn dùng `rsync`.

### rsync — sync mạnh hơn scp

```bash
# Sync local
rsync -avh src/ dest/

# Sync sang server
rsync -avh src/ user@server:/dest/

# Resume khi đứt
rsync -avzP large-file user@server:/dest/

# Mirror (xoá file dest không có ở src)
rsync -avh --delete src/ dest/

# Exclude
rsync -avh --exclude='*.log' --exclude='node_modules' src/ dest/

# Dry-run (xem sẽ làm gì)
rsync -avhn src/ dest/
```

Flags hay dùng:
- `-a` archive (= rlptgoD — recursive, link, perm, time, group, owner, device)
- `-v` verbose
- `-h` human-readable
- `-z` compress trong khi truyền
- `-P` progress + partial (resume)
- `--delete` xoá file ở dest không có ở src
- `-n` dry-run

**`rsync` chỉ truyền delta** — file đã giống không truyền lại → cực nhanh cho sync lặp lại.

### `wget` / `curl` — download

```bash
wget https://example.com/file.tar.gz
wget -c https://...                       # Resume khi đứt
wget -O file.zip URL                      # Output filename custom

curl -O https://example.com/file.tar.gz   # Lấy tên từ URL
curl -o file.zip https://example.com/...  # Custom name
curl -L URL                               # Follow redirect
curl -fsSL URL | sudo bash                # Pattern install script (cẩn thận)
```

`curl` general hơn (làm API REST). `wget` chuyên download.

## SSH — vũ khí số 1 của DevOps

### Login

```bash
ssh user@server                           # Port 22 default
ssh -p 2222 user@server                   # Port khác
ssh -i ~/.ssh/key.pem ec2-user@aws-host   # Dùng key cụ thể
ssh -v user@server                        # Verbose (debug)
```

### Chạy command từ xa không cần login

```bash
ssh user@server "uptime"
ssh user@server "df -h"
ssh user@server < script.sh               # Chạy script local trên remote
```

### SSH config — đơn giản hoá

`~/.ssh/config`:

```text
Host prod-web
    HostName 1.2.3.4
    User ubuntu
    Port 22
    IdentityFile ~/.ssh/prod.pem
    StrictHostKeyChecking no

Host dev
    HostName dev.internal
    User devops
    ProxyJump bastion
```

```bash
ssh prod-web                              # Thay vì ssh -i ... ubuntu@1.2.3.4
ssh dev                                   # Auto qua bastion
```

### SSH key-based auth (không password)

```bash
# 1. Tạo key trên local
ssh-keygen -t ed25519 -C "your@email"

# 2. Copy public key lên server
ssh-copy-id user@server
# Hoặc thủ công:
cat ~/.ssh/id_ed25519.pub | ssh user@server "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"

# 3. Login không password
ssh user@server
```

### SSH tunnel — forward port

```bash
# Local forward: localhost:8080 → remote db.internal:5432
ssh -L 8080:db.internal:5432 user@bastion

# Reverse forward: remote port 9000 → local:80
ssh -R 9000:localhost:80 user@server

# Dynamic SOCKS proxy
ssh -D 1080 user@server
```

Use case:
- Access DB internal qua bastion.
- Expose local dev server cho người ngoài (giống ngrok).
- VPN nhẹ qua SSH.

## Khác biệt Ubuntu vs CentOS — tổng hợp

| | Ubuntu/Debian | CentOS/RHEL |
|---|---|---|
| Package | `apt`, `apt-get`, `dpkg` | `dnf`, `yum`, `rpm` |
| Package format | `.deb` | `.rpm` |
| Add user (đầy đủ) | `adduser` | `useradd -m` |
| Edit sudoers default editor | nano | vi |
| Firewall | `ufw` | `firewalld` |
| Network config | `/etc/netplan/*.yaml` | `/etc/sysconfig/network-scripts/*` (cũ), NetworkManager (mới) |
| Default service install behavior | Auto-start sau install | Không auto-start (phải enable) |
| Repo file | `/etc/apt/sources.list*` | `/etc/yum.repos.d/*.repo` |
| Update cache | `apt update` bắt buộc | `dnf` auto-refresh |
| Init | systemd | systemd |
| Login shell | bash | bash |
| Cron path | `/var/log/cron.log` | `/var/log/cron` |

DevOps engineer **biết cả hai** vì tổ chức mix server.

## Đổi default editor

```bash
# Tạm thời (1 session)
export EDITOR=vim

# Permanent (Ubuntu)
sudo update-alternatives --config editor
# Chọn vim

# Permanent (RHEL/global)
echo 'export EDITOR=vim' | sudo tee -a /etc/profile.d/editor.sh

# Per-user
echo 'export EDITOR=vim' >> ~/.bashrc
```

## Vài tool tiện trên server

```bash
htop          # Process monitor đẹp hơn top
ncdu          # Disk usage interactive
jq            # JSON processor
yq            # YAML processor
tmux / screen # Persistent terminal session
fzf           # Fuzzy finder
bat           # cat with syntax highlight
fd            # Find modern
ripgrep (rg)  # Grep modern, siêu nhanh
glances       # System overview
iotop         # I/O monitor
nethogs       # Network per-process
mtr           # Combined traceroute + ping
ss            # Socket stat (replace netstat)
dig           # DNS query
nmap          # Network scan (chỉ trên mạng cho phép)
```

Cài đầu khi setup server cá nhân:

```bash
# Ubuntu
sudo apt install -y htop ncdu jq tmux fzf bat fd-find ripgrep tree

# RHEL
sudo dnf install -y htop ncdu jq tmux fzf bat fd-find ripgrep tree
```

## Persistent session — tmux

```bash
tmux                          # Tạo session mới
tmux new -s mywork            # Có tên
tmux ls                       # List session
tmux attach -t mywork         # Attach lại

# Trong tmux:
Ctrl+B d                      # Detach (giữ chạy)
Ctrl+B c                      # New window
Ctrl+B 1                      # Window 1
Ctrl+B %                      # Split dọc
Ctrl+B "                      # Split ngang
Ctrl+B arrow                  # Di pane
```

**Use case**: SSH vào server, chạy build dài → mất kết nối WiFi → build bị mất. Dùng tmux → reconnect, attach lại, build vẫn chạy.

## Network tool nhanh

```bash
ip a                                      # IP của các interface
ip r                                      # Routing table
ss -tulnp                                 # Mọi port đang listen
ss -tnp                                   # TCP connection
ping 8.8.8.8                              # ICMP test
dig example.com                           # DNS
nslookup example.com                      # DNS
traceroute example.com                    # Route hops
mtr example.com                           # traceroute + ping liên tục
curl -v https://example.com               # HTTP + verbose
nc -zv host port                          # Test TCP port
```

## Tổng kết phase 4 — cheat sheet mọi lệnh Linux

```text
# Navigation & file
pwd                              Where am I?
ls -lah                          Detailed list
cd ~                             Home
cd -                             Previous dir
file <path>                      Detect file type
find . -name "*.log"             Find file
locate filename                  Fast find (DB)

# File operations
mkdir -p a/b/c                   Make tree
touch file                       Empty file / update mtime
cp -r src dest                   Copy dir
mv src dest                      Move/rename
rm -rf dir                       Remove (DANGER)
ln -s tgt link                   Symlink

# Reading text
cat file                         Print all
less file                        Pager
head -20 file                    First 20
tail -f file                     Live tail

# Searching/filtering
grep -i "term" file              Find text
grep -rn "term" /dir             Recursive
awk '{print $1}' file            Column 1
cut -d':' -f1 file               Split by ':'
sort | uniq -c | sort -rn        Count + top
sed 's/old/new/g' file           Replace

# Redirection
> file                           Stdout overwrite
>> file                          Append
2> file                          Stderr
&> file                          Both
| cmd                            Pipe
tee file                         Tee
< file                           Stdin
xargs cmd                        Stdin → args

# Vim
i / Esc / :wq / :q!              Insert / Save / Quit
dd / yy / p / u                  Cut/Copy/Paste/Undo
/text / n                        Search
:%s/old/new/g                    Replace all

# Users & permissions
whoami / id / who                Who am I
sudo useradd -m -G grp user      Create
sudo passwd user                 Set password
chmod 755 file                   Permission
chown user:group file            Owner

# Package
sudo dnf install pkg             RHEL
sudo apt install pkg             Debian
rpm -qa / dpkg -l                List installed

# Services & processes
systemctl status / start / stop / restart / reload / enable
journalctl -u svc -f             Service log
ps aux                           All process
top / htop                       Real-time monitor
kill -15 PID                     SIGTERM
kill -9 PID                      SIGKILL
pgrep / pkill name               By name

# Archive & transfer
tar -czvf out.tar.gz dir/        Create
tar -xzvf in.tar.gz              Extract
scp file user@host:/path         Copy via SSH
rsync -avzP src/ user@host:/dst  Smart sync

# Network
ssh user@host                    Login
ip a / ip r                      IP / route
ss -tulnp                        Listening ports
curl -v URL                      HTTP test
dig example.com                  DNS
```

## Câu hỏi tự kiểm tra cuối phase 4

Trước khi sang phase Git, đảm bảo trả lời được:

1. Khác biệt **absolute vs relative path**? Khi nào dùng cái nào?
2. `chmod 755` cho phép ai làm gì?
3. `rm -rf /` có thật sự xoá cả filesystem? Cách phòng?
4. Tại sao `kill -9` là last resort?
5. `apt update` vs `apt upgrade` khác gì?
6. `cat /var/log/messages` 5GB → vấn đề? Dùng gì thay?
7. `sudo` vs `su -` khác gì?
8. **3 mode Vim** là gì? Cách thoát không save?
9. Tại sao **symlink broken**? Cách fix?
10. **Pipe** vs **redirection** khác nhau ra sao?
11. `tar -xzvf` decode từng flag nghĩa gì?
12. `journalctl -u nginx` lấy log ở đâu? Khác `/var/log/nginx/` chỗ nào?
13. **Load average** > số CPU core nghĩa là gì?
14. **Zombie process** là gì? Cách dọn?
15. `ssh -L` vs `ssh -R` khác nhau?

## Tóm tắt bài 10 + Tổng kết phase 4

- **tar/zip/gzip** = đóng gói file. `tar -czvf` (gzip) phổ biến nhất.
- **rsync** thông minh hơn scp — chỉ truyền delta, resume, exclude.
- **ssh** là vũ khí số 1 — config file `~/.ssh/config` giúp ngắn lệnh.
- Khác biệt **Ubuntu vs CentOS** chủ yếu ở **package manager** và vài tool nhỏ.
- **tmux** giữ session sống qua disconnect.
- 10 bài phase 4 đã cover **mọi thứ Linux cơ bản** cần cho DevOps.

Phase Linux **không kết thúc ở đây** — bạn sẽ vận dụng từng kỹ năng này ở **mọi phase còn lại**: Git, AWS, Docker, K8s, CI/CD. Nếu chưa vững, **quay lại làm lab** với VM trước khi sang phase tiếp theo.

**Phase kế tiếp** → [Phase 5 — Bài 1: Git là gì? Vì sao mọi DevOps engineer phải master Git](../phase-5-git/01-git-la-gi.md)

> Phase 5 sẽ được viết trong session tiếp theo.
