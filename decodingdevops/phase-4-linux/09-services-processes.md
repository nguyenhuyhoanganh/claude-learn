# Bài 9: Services và Processes — systemd, systemctl, ps, top, kill, signals

DevOps engineer 50% công việc là **quản service**: start, stop, restart, enable boot, check log, debug crash. Bài này dạy đủ để **tự tin vận hành mọi service Linux**.

## Process là gì?

> **Process** = chương trình đang chạy, có **PID** riêng, có RAM riêng, có file descriptor riêng, có user owner.

Khi bạn gõ `nginx`, kernel:
1. Tạo process mới với PID mới (vd 1234).
2. Load binary nginx vào RAM.
3. Cấp file descriptor 0, 1, 2 (stdin, stdout, stderr).
4. Set user = uid của người chạy.
5. Bắt đầu execute.

## Service vs Process

| | Process | Service (daemon) |
|---|---|---|
| Chạy bao lâu | Có thể ngắn (ls) hoặc dài | Chạy nền liên tục |
| Foreground / background | Cả 2 | Background |
| Tự khởi động khi boot? | Không | Có (nếu enable) |
| Quản lý bằng | `kill`, `&`, `nohup` | `systemctl` |
| Ví dụ | `ls`, `vim`, `cat` | `nginx`, `sshd`, `mysqld`, `docker` |

Service là một **kiểu** process — chạy nền, có manager (systemd).

## ps — list process

```bash
ps                       # Process của shell hiện tại
ps aux                   # MỌI process (BSD style)
ps -ef                   # MỌI process (UNIX style)
ps -eo pid,user,cmd      # Custom column
ps aux --sort=-%mem      # Sort theo RAM, giảm dần
ps aux --sort=-%cpu      # Sort theo CPU
ps -ef --forest          # Hiện tree (parent-child)
```

### `ps aux` vs `ps -ef` — khác biệt

| | `ps aux` | `ps -ef` |
|---|---|---|
| Style | BSD | UNIX |
| Column | USER, PID, %CPU, %MEM, VSZ, RSS, STAT, START, TIME, COMMAND | UID, PID, PPID, C, STIME, TTY, TIME, CMD |
| Hiện %CPU/%MEM | ✓ | ✗ |
| Hiện PPID (parent) | ✗ | ✓ |

Nhớ: **`aux` cho tài nguyên** (% CPU/RAM), **`-ef` cho hierarchy** (PPID).

### Decode `ps aux` output

```text
USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
root         1  0.0  0.1 168248 12044 ?        Ss   Jan10   0:08 /sbin/init
nginx     1420  0.0  0.2  10324  4567 ?        S    14:30   0:00 nginx: master process
nginx     1421  0.0  0.1   9876  3210 ?        S    14:30   0:00 nginx: worker process
vagrant   2000  1.5  0.8  98765 12345 pts/0    Ss   14:35   0:02 -bash
vagrant   3000  0.0  0.0  12345  1234 pts/0    R+   14:40   0:00 ps aux
```

| Cột | Ý nghĩa |
|---|---|
| **PID** | Process ID |
| **%CPU**, **%MEM** | % tài nguyên |
| **VSZ** | Virtual memory size (KB) |
| **RSS** | Resident Set Size — RAM thực dùng (KB) |
| **TTY** | Terminal liên kết (`?` = không, daemon) |
| **STAT** | Trạng thái (xem dưới) |
| **START** | Thời gian start |
| **TIME** | CPU time đã dùng |
| **COMMAND** | Lệnh chạy |

### STAT — trạng thái process

| Ký tự | Ý nghĩa |
|---|---|
| **R** | Running hoặc Runnable |
| **S** | Sleeping (chờ event, có thể wake) |
| **D** | Uninterruptible sleep (chờ I/O — không kill được) |
| **T** | Stopped (Ctrl+Z) |
| **Z** | Zombie (đã exit nhưng entry còn) |
| **<** | High priority |
| **N** | Low priority (nice) |
| **s** | Session leader |
| **+** | Foreground process group |

## Process tree — parent / child

Mọi process (trừ PID 1) có **parent**:

```text
                    PID 1 (systemd)
                    │
              ┌─────┼─────┬──────────┐
              ▼     ▼     ▼          ▼
        sshd    nginx  cron      kthreadd
        │        │
        ▼        ▼
       ssh-     worker × 4
       session
        │
        ▼
       bash
        │
        ▼
       vim
```

**PID 1** = init process (systemd modern, init cũ). Khởi tạo mọi service khác. **Không thể kill**.

`ps -ef --forest` hoặc `pstree` để vẽ tree:

```bash
pstree                          # Cây compact
pstree -p                       # Có PID
pstree -u                       # Có user
pstree 1234                     # Subtree từ PID 1234
```

## top, htop, btop — real-time monitor

### `top`

```bash
top
```

Phím tắt trong top:

| Phím | Tác dụng |
|---|---|
| `q` | Thoát |
| `P` | Sort theo CPU |
| `M` | Sort theo MEM |
| `T` | Sort theo TIME |
| `k` | Kill process (nhập PID) |
| `r` | Renice (đổi priority) |
| `1` | Hiện từng CPU core |
| `f` | Chọn field hiện |
| `h` | Help |

Header `top` show:
- **Load average**: 3 số = 1, 5, 15 phút. Nếu > số CPU core → overload.
- **Tasks**: total, running, sleeping, stopped, zombie.
- **%Cpu(s)**: user, system, idle, wait...
- **MiB Mem / Swap**: dùng vs free.

### `htop` — `top` đẹp hơn

```bash
sudo apt install -y htop                # Hoặc dnf
htop
```

Mouse + color + tree view. **Khuyên cài trên mọi server**.

### `btop` / `btm` — modern

Cute UI, charts. Cài tuỳ thích.

## Tìm process — `pgrep`, `pidof`

```bash
pgrep nginx                     # Liệt PID có "nginx"
pgrep -u root                   # PID của root
pgrep -l nginx                  # PID + tên
pgrep -f "nginx: worker"        # Match full command line

pidof nginx                     # PID của process tên chính xác
pidof java                      # 1234 5678 (nếu nhiều)

ps aux | grep nginx | grep -v grep    # Cách cổ điển
```

`pgrep` tránh issue "grep tự xuất hiện trong output ps".

## Signal — gửi tín hiệu cho process

Process **giao tiếp với nhau** qua signal — số nhỏ kernel gửi.

| Signal | Số | Mặc định | Catchable? |
|---|---|---|---|
| **SIGHUP** | 1 | Terminate | Yes — thường để reload config |
| **SIGINT** | 2 | Terminate | Yes — Ctrl+C |
| **SIGQUIT** | 3 | Core dump | Yes — Ctrl+\ |
| **SIGKILL** | 9 | Terminate | **NO** — kernel force kill |
| **SIGTERM** | 15 | Terminate | Yes — graceful shutdown (default `kill`) |
| **SIGSTOP** | 19 | Stop | **NO** — pause |
| **SIGTSTP** | 20 | Stop | Yes — Ctrl+Z |
| **SIGCONT** | 18 | Continue | Yes — resume |
| **SIGUSR1**, **SIGUSR2** | 10, 12 | App-defined | Yes — app tự định nghĩa |

```bash
kill -l                         # List all signals
kill PID                        # Mặc định SIGTERM (15)
kill -9 PID                     # SIGKILL — force
kill -SIGTERM PID               # Tương đương kill PID
kill -HUP PID                   # SIGHUP — reload config (nginx, sshd dùng)
kill -SIGSTOP PID               # Pause
kill -SIGCONT PID               # Resume
```

### Workflow kill chuẩn

```bash
# 1. Try SIGTERM (lịch sự, cho process cleanup)
kill PID
sleep 5

# 2. Check còn không
ps -p PID && kill -9 PID        # Force nếu vẫn sống
```

**Không bao giờ `kill -9` đầu tiên** — process không kịp save state, file mở dở, db corrupt.

### `pkill`, `killall`

```bash
pkill nginx                     # Kill process tên "nginx"
pkill -9 nginx                  # Force
pkill -f "java -jar app.jar"    # Match full command
pkill -u alice                  # Kill mọi process của alice

killall nginx                   # Tương tự pkill nhưng exact name
```

### Zombie process

Process **đã exit** nhưng parent chưa "reap" (đọc exit code) → entry vẫn ở process table:

```bash
ps aux | awk '$8 ~ /^Z/ {print}'      # Tìm zombie
```

Zombie **không** tiêu RAM/CPU đáng kể — chỉ chiếm slot trong process table. Cách fix:
- Kill parent process → init (PID 1) adopt zombie và reap.
- Reboot.

### Orphan process

Process còn sống nhưng **parent đã chết** → PID 1 (init) tự động adopt. Không vấn đề.

## Foreground vs background

```bash
long-task                       # Foreground — block terminal
long-task &                     # Background — terminal free ngay
                                # Output: [1] 1234   (job 1, PID 1234)

jobs                            # List job nền của shell này
fg %1                           # Đưa job 1 ra foreground
bg %1                           # Continue job 1 nếu đang stop
Ctrl+Z                          # Suspend foreground
Ctrl+C                          # Kill foreground

nohup long-task &               # No HangUp — sống qua logout
nohup long-task &>/dev/null &   # Cộng với silent
disown %1                       # Bỏ khỏi shell job table
```

`nohup` lưu output vào `nohup.out` mặc định. Tốt hơn redirect chính xác.

## systemd — init system modern

PID 1 trên **mọi distro modern**. Thay thế init cũ (SysV).

```text
systemd quản lý:
├── Service (.service)         — nginx.service, sshd.service
├── Mount (.mount)             — /etc/fstab tương đương
├── Socket (.socket)           — socket activation
├── Timer (.timer)             — cron tương đương
├── Target (.target)           — runlevel tương đương (multi-user, graphical)
└── Path (.path)               — watch file changes
```

## systemctl — kiểm soát service

```bash
sudo systemctl status nginx              # Trạng thái + log mới nhất
sudo systemctl start nginx               # Start
sudo systemctl stop nginx                # Stop
sudo systemctl restart nginx             # Stop + Start
sudo systemctl reload nginx              # Reload config (không restart)
sudo systemctl reload-or-restart nginx   # Reload nếu được, fallback restart

sudo systemctl enable nginx              # Auto start at boot
sudo systemctl disable nginx             # Không start at boot
sudo systemctl enable --now nginx        # Enable + start
sudo systemctl disable --now nginx       # Disable + stop

systemctl is-active nginx                # active / inactive / failed
systemctl is-enabled nginx               # enabled / disabled
systemctl is-failed nginx                # active / failed

systemctl list-units --type=service                  # Service đang chạy
systemctl list-units --type=service --state=failed   # Service fail
systemctl list-unit-files --type=service             # Tất cả service config
```

### Reload vs Restart

- **Reload**: gửi SIGHUP → process re-read config, không downtime. nginx, apache, sshd hỗ trợ.
- **Restart**: stop hoàn toàn rồi start. Downtime ngắn.

Luôn ưu tiên `reload` nếu service hỗ trợ.

### Test config trước reload

```bash
sudo nginx -t                            # Test nginx config
sudo apachectl configtest                # Test apache config
sudo sshd -t                             # Test sshd config

# Nếu pass:
sudo systemctl reload nginx
```

**Quy tắc vàng**: KHÔNG reload service production trước khi test config. Sai cú pháp → service down.

## Service unit file

Cấu hình service ở `/etc/systemd/system/` hoặc `/usr/lib/systemd/system/`:

```ini
# /etc/systemd/system/myapp.service
[Unit]
Description=My Application
After=network.target
Requires=postgresql.service

[Service]
Type=simple
User=myapp
Group=myapp
WorkingDirectory=/opt/myapp
ExecStart=/opt/myapp/start.sh
ExecReload=/bin/kill -HUP $MAINPID
Restart=always
RestartSec=5
StandardOutput=append:/var/log/myapp.log
StandardError=append:/var/log/myapp.error.log

[Install]
WantedBy=multi-user.target
```

Sau khi tạo/sửa file:

```bash
sudo systemctl daemon-reload             # Reload systemd config
sudo systemctl enable --now myapp
sudo systemctl status myapp
```

### Các Type=

| Type | Khi nào |
|---|---|
| `simple` | App chạy foreground (Node, Python, Java) |
| `forking` | App tự daemon (fork rồi parent thoát) |
| `oneshot` | Chạy 1 lần rồi exit (script setup) |
| `notify` | App gửi notify systemd khi ready |
| `idle` | Chờ job khác xong |

### `Restart=`

| Giá trị | Behavior |
|---|---|
| `no` | Không restart |
| `on-failure` | Restart nếu exit code ≠ 0 |
| `on-abnormal` | Restart khi crash/signal |
| `always` | Restart mọi trường hợp (kể cả exit 0) |
| `on-watchdog` | Khi watchdog timeout |

## journalctl — log của systemd

systemd có log riêng (binary, structured) thay vì plain text như syslog.

```bash
journalctl                               # Mọi log
journalctl -u nginx                      # Log của nginx
journalctl -u nginx -f                   # Tail live (như tail -f)
journalctl -u nginx --since "1 hour ago"
journalctl -u nginx --since today
journalctl -u nginx --since "2025-01-10" --until "2025-01-11"
journalctl -p err                        # Chỉ priority error trở lên
journalctl -p 0..3                       # Emergency, alert, crit, err
journalctl -n 50                         # 50 dòng cuối
journalctl -r                            # Reverse (mới nhất trên)
journalctl --disk-usage                  # Log chiếm bao nhiêu
journalctl --vacuum-time=7d              # Xoá log > 7 ngày
```

**Pattern debug**: service không start → check status + journal:

```bash
sudo systemctl status nginx
# Status có vài dòng log gần nhất

sudo journalctl -u nginx -n 50
# Chi tiết hơn

sudo journalctl -u nginx -f
# Live theo dõi khi restart
```

## load average — sức khoẻ server

```bash
uptime
# 14:32:15 up 5 days, 3:12, 2 users, load average: 0.45, 0.67, 0.89
```

3 số = 1, 5, 15 phút.

**Đọc**:
- < số CPU core: OK, idle/normal.
- ≈ số CPU core: full load, không bottleneck nhưng đầy.
- > số CPU core: queueing → request chờ → latency tăng.

Server 4 CPU, load 8.5 trong 15 phút → có vấn đề.

Xem số CPU:

```bash
nproc                                    # Số core
lscpu                                    # Chi tiết CPU
cat /proc/cpuinfo | grep -c processor    # Cách khác
```

## CPU + RAM info nhanh

```bash
free -h                                  # RAM (human-readable)
                                         # total / used / free / shared / buff/cache / available
                                         # ↑ available là số quan trọng nhất

vmstat 1                                 # Update mỗi giây
iostat -x 1                              # I/O
mpstat -P ALL 1                          # CPU per core
sar -u 1 10                              # Sample CPU 10 lần, mỗi giây
```

`sar`, `iostat`, `mpstat` từ package `sysstat` — cài thêm:

```bash
sudo apt install -y sysstat
```

## Priority — nice và renice

Process có **nice value** từ -20 (cao nhất) đến 19 (thấp nhất). Default 0.

```bash
nice -n 10 long-task                     # Start với nice 10 (thấp hơn)
nice -n -5 priority-task                 # Cao hơn (cần root)

renice -n 15 -p 1234                     # Đổi nice của PID 1234
renice -n 10 -u alice                    # Đổi cho mọi process của alice
```

Use case: backup job nên nice cao (không tranh CPU với app).

## Bẫy thường gặp

| Bẫy | Hậu quả | Giải pháp |
|---|---|---|
| `kill -9` ngay | DB corrupt, file dở | SIGTERM trước, SIGKILL sau timeout |
| Sửa unit file mà quên `daemon-reload` | Lệnh systemctl đọc config cũ | `sudo systemctl daemon-reload` |
| `systemctl restart` cho mọi update | Downtime không cần | `reload` nếu có thể |
| Reload nginx sau khi sửa config sai | Service down | `nginx -t` trước |
| Service crash không restart | Downtime kéo dài | `Restart=on-failure` trong unit |
| Tail log file vs `journalctl` | Lẫn log | Service systemd → dùng journal |
| Process còn nắm port sau khi kill | Bind fail khi start lại | Wait state, dùng `SO_REUSEADDR` hoặc đợi |
| Quá nhiều zombie | Process table đầy | Kill/restart parent |

## Quick reference

```text
# Process info
ps aux                  Mọi process + CPU/MEM
ps -ef --forest         Tree
pgrep -f "pattern"      Tìm PID
pstree -p               Cây

# Monitor
top / htop              Real-time
free -h                 RAM
vmstat 1                Memory + CPU
uptime                  Load avg

# Kill
kill PID                SIGTERM (lịch sự)
kill -9 PID             SIGKILL (force)
kill -HUP PID           Reload config
pkill name              Theo tên

# Service (systemd)
systemctl status pkg    Trạng thái
systemctl start/stop/restart/reload
systemctl enable --now  Bật + start ngay
systemctl is-active     active/inactive
journalctl -u pkg -f    Live log
```

## Tóm tắt bài 9

- **Process** có PID, parent, user, status. `ps aux` (tài nguyên), `ps -ef` (tree).
- **STAT**: R (run), S (sleep), D (I/O), Z (zombie), T (stop).
- **Signal**: SIGTERM (15, lịch sự), SIGKILL (9, force), SIGHUP (1, reload).
- **`kill -9` cuối cùng** — không phải đầu tiên.
- **systemd** quản service: `systemctl start/stop/restart/reload/enable`.
- **`reload`** không downtime nếu service hỗ trợ; **`restart`** có downtime ngắn.
- **`journalctl -u svc -f`** = `tail -f` cho systemd service.
- **Load average** > số CPU core = overload.

**Bài kế tiếp** → [Bài 10: Archiving, network và tổng kết phase Linux](10-archiving-tong-ket.md)
