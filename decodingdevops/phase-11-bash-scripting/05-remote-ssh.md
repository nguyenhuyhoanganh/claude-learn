# Bài 5: Remote execution với SSH — automate nhiều server

DevOps task thường trên **nhiều server**. SSH + Bash = automate được không cần Ansible cho việc đơn giản.

## SSH key-based auth — recap

Đã học phase 5 và 6. Tóm tắt nhanh:

```bash
# 1. Tạo key
ssh-keygen -t ed25519 -C "automation"

# 2. Copy public key lên server
ssh-copy-id user@server
# Hoặc thủ công:
cat ~/.ssh/id_ed25519.pub | ssh user@server "cat >> ~/.ssh/authorized_keys"

# 3. Test
ssh user@server "uptime"
```

Key-based = automation possible (không nhập password).

## SSH config — quản nhiều server

`~/.ssh/config`:

```text
Host bastion
    HostName bastion.acme.com
    User devops
    IdentityFile ~/.ssh/id_ed25519

Host web01 web02 web03
    HostName %h.acme.com
    User ubuntu
    ProxyJump bastion
    IdentityFile ~/.ssh/id_ed25519

Host db*
    HostName %h.internal
    User dbadmin
    ProxyJump bastion
```

`%h` = expand thành hostname đã match. `Host *` pattern wildcard.

```bash
ssh web01                    # Auto qua bastion
ssh db-prod                  # Match db*
```

## Run remote command

```bash
# Single command
ssh user@server "uptime"
ssh user@server "df -h"

# Multiple commands
ssh user@server "cd /app && git pull && systemctl restart app"

# With sudo
ssh user@server "sudo systemctl restart nginx"
# (Cần NOPASSWD trong sudoers cho không tương tác)

# Heredoc nhiều dòng
ssh user@server << 'EOF'
    cd /app
    git pull origin main
    npm install
    pm2 restart all
EOF

# Heredoc với expansion (variable host side)
APP_NAME="myapp"
ssh user@server << EOF
    cd /opt/$APP_NAME
    git pull
EOF
```

`'EOF'` (single quote) = literal trên remote. `EOF` (no quote) = expand local trước khi gửi.

## Script remote

### Chạy script local trên remote

```bash
# Pipe script qua SSH
ssh user@server "bash -s" < local-script.sh

# Với args
ssh user@server "bash -s" -- arg1 arg2 < local-script.sh
```

### Copy script lên rồi chạy

```bash
scp script.sh user@server:/tmp/
ssh user@server "chmod +x /tmp/script.sh && /tmp/script.sh"
```

### Inline heredoc với args

```bash
PORT=8080
ssh user@server bash <<EOF
PORT=$PORT
echo "Setting up on port \$PORT"   # \$ escape — đọc bên remote
systemctl restart app-\$PORT
EOF
```

`$PORT` (no escape) expand local. `\$PORT` (escape) expand remote.

## Multi-server execution

### Manual loop

```bash
SERVERS=("web01" "web02" "web03")

for srv in "${SERVERS[@]}"; do
    echo "=== $srv ==="
    ssh "$srv" "uptime"
done
```

### Parallel với xargs

```bash
echo -e "web01\nweb02\nweb03" | \
    xargs -I {} -P 3 ssh {} "uptime"
```

`-P 3` chạy 3 parallel. Nhanh hơn loop sequential.

### Parallel với GNU parallel

```bash
parallel -j 5 ssh {} "uptime" ::: web01 web02 web03 db01 db02
```

GNU parallel mạnh hơn xargs — output ordered, fail handling tốt.

### `pdsh` — Parallel Distributed Shell

```bash
sudo apt install -y pdsh

pdsh -w web01,web02,web03 uptime
# web01: 10:30 up 5 days
# web02: 10:30 up 5 days
# web03: 10:30 up 5 days
```

Or pattern host:

```bash
pdsh -w web0[1-3] uptime
```

## File transfer

### scp — simple copy

```bash
# Local → remote
scp file.txt user@server:/path/
scp -r folder/ user@server:/path/

# Remote → local
scp user@server:/path/file.txt .

# Remote → remote (qua máy bạn)
scp user@srv1:/file user@srv2:/path/

# Port khác
scp -P 2222 file user@server:/
```

### rsync — smart sync

```bash
# Sync local → remote (giữ permission, mtime)
rsync -avz local/ user@server:/dst/

# Resume + progress
rsync -avzP large-file user@server:/dst/

# Exclude
rsync -avz --exclude=.git --exclude=node_modules src/ user@server:/dst/

# Delete extra files trên dest
rsync -avz --delete src/ user@server:/dst/

# Dry run (preview)
rsync -avzn src/ user@server:/dst/
```

`rsync` chỉ transfer delta → cực nhanh cho sync lặp.

### sftp — interactive

```bash
sftp user@server
sftp> ls
sftp> cd /var/log
sftp> get app.log
sftp> put local.txt
sftp> bye
```

## Real-world: deploy script

```bash
#!/bin/bash
#
# deploy.sh — deploy app lên nhiều web server
#

set -euo pipefail

readonly SERVERS=("web01" "web02" "web03")
readonly APP_DIR="/opt/myapp"
readonly RELEASE_TAR="release-$(date +%Y%m%d-%H%M%S).tar.gz"

# Build local
echo "Building release..."
tar -czf "/tmp/$RELEASE_TAR" -C /local/app .

# Deploy to each server
for srv in "${SERVERS[@]}"; do
    echo "=== Deploying to $srv ==="

    # 1. Upload
    echo "Uploading..."
    scp "/tmp/$RELEASE_TAR" "$srv:/tmp/"

    # 2. Extract + restart
    ssh "$srv" bash <<EOF
        set -e
        cd $APP_DIR

        # Backup current
        sudo mv current backup-\$(date +%s) 2>/dev/null || true

        # Extract new
        sudo mkdir -p current
        sudo tar -xzf /tmp/$RELEASE_TAR -C current

        # Restart
        sudo systemctl restart myapp

        # Cleanup old (keep last 3)
        ls -dt backup-* | tail -n +4 | xargs -r sudo rm -rf

        rm /tmp/$RELEASE_TAR
EOF

    # 3. Health check
    if ssh "$srv" "curl -fs http://localhost:8080/health" > /dev/null; then
        echo "✓ $srv healthy"
    else
        echo "✗ $srv UNHEALTHY"
        exit 1
    fi
done

echo "Deploy complete"
rm "/tmp/$RELEASE_TAR"
```

## Bastion / jump host

Internal server không expose public. Truy cập qua bastion:

```text
Internet → bastion (public IP) → internal servers (private IP)
```

```bash
# Manual jump
ssh -J bastion@bastion.acme.com user@internal-server

# SSH config (~/.ssh/config)
Host bastion
    HostName bastion.acme.com
    User devops

Host internal-*
    HostName %h.internal
    User devops
    ProxyJump bastion

# Use
ssh internal-db01
# Auto: connect bastion first, then internal-db01.internal
```

## Tunnel — forward port qua SSH

### Local forward

```bash
# Local 8080 → remote internal-db:5432
ssh -L 8080:internal-db:5432 user@bastion -N

# Trong terminal khác:
psql -h localhost -p 8080 -U dbuser
```

Use case: truy cập DB internal không public.

### Reverse forward

```bash
# Remote 9000 → local:80
ssh -R 9000:localhost:80 user@public-server -N
```

Use case: expose local dev server (như ngrok).

### Dynamic SOCKS proxy

```bash
ssh -D 1080 user@server -N

# Cấu hình browser SOCKS5 localhost:1080
# → mọi traffic browser qua tunnel
```

## Tips & best practices

### Set timeout

```bash
ssh -o ConnectTimeout=10 -o ServerAliveInterval=30 user@server "cmd"
```

Tránh script hang khi server slow.

### Disable strict host key check (CI/CD)

```bash
ssh -o StrictHostKeyChecking=accept-new user@server "cmd"
# Hoặc:
ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null user@server "cmd"
```

> Cẩn thận: production không nên skip — MITM risk.

### Multiplex connection (faster)

`~/.ssh/config`:

```text
Host *
    ControlMaster auto
    ControlPath ~/.ssh/control-%r@%h:%p
    ControlPersist 10m
```

Connection thứ 2+ tới cùng server **reuse** TCP connection → cực nhanh (50ms thay 1s).

### Forward agent

```bash
ssh -A user@server
# Hoặc trong config:
# ForwardAgent yes
```

Cho phép server forward SSH key của bạn tới server thứ 3 (multi-hop). **Risk**: server compromise = key compromise.

## SSH log

```bash
# Verbose
ssh -v user@server               # Debug level 1
ssh -vv user@server              # Level 2
ssh -vvv user@server              # Max

# Log auth (RHEL/CentOS)
sudo tail -f /var/log/secure | grep sshd

# Log auth (Ubuntu)
sudo tail -f /var/log/auth.log | grep sshd

# Modern
sudo journalctl -u sshd -f
```

## Khi nào dùng Ansible thay Bash + SSH?

Bash + SSH OK khi:
- < 10 server.
- Task ngắn (< 5 phút).
- Một lần / không lặp lại.

Ansible mạnh hơn khi:
- > 10 server.
- Task phức tạp (cài đặt + config + service).
- Cần idempotent (chạy lại không phá).
- Cần inventory động (cloud).
- Cần dry-run.

Phase 22 sẽ học Ansible.

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Quên `-T` cho non-TTY | Warning "pseudo-terminal" | Add `-T` cho automation |
| Heredoc với expansion sai chỗ | Variable wrong scope | `'EOF'` quote vs `EOF` |
| SSH agent không forward | Multi-hop fail | `-A` forward agent |
| Strict host key prompt | Script hang | `accept-new` hoặc set known_hosts trước |
| Parallel quá nhiều | DDoS chính mình | `xargs -P` limit |
| Long-running không heartbeat | NAT timeout | `ServerAliveInterval=30` |
| `sudo` hỏi password | Script hang | NOPASSWD trong sudoers |

## Tổng kết phase 11

5 bài đã cover:
1. Intro + strict mode + shellcheck.
2. Variables, quotes, command substitution.
3. Args, decision making (if, case).
4. Loops, functions, traps.
5. Remote SSH automation.

Đủ kỹ năng viết mọi script DevOps daily. Phức tạp hơn → Python (phase 20) hoặc Ansible (phase 22).

## Tóm tắt bài 5

- **SSH key + config** = automation foundation.
- Run remote: `ssh user@host "cmd"` hoặc `ssh user@host bash <<EOF ... EOF`.
- Multi-server: loop + xargs -P parallel + `pdsh` / GNU parallel.
- **scp** quick, **rsync** smart delta sync.
- **Bastion + ProxyJump** = pattern access internal server.
- **Tunnel `-L`, `-R`, `-D`** = port forward / SOCKS proxy.
- **ControlMaster** multiplex = SSH instant lần 2+.
- > 10 server hoặc task phức tạp → **Ansible** (phase 22).

**Phase kế tiếp** → [Phase 12 — Bài 1: AI for scripting](../phase-12-ai-scripting/01-ai-cho-devops.md)
