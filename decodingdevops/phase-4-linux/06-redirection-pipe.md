# Bài 6: Redirection và Pipe — chuyển output, đọc input, /dev/null

`stdin`, `stdout`, `stderr`, `|`, `>`, `>>`, `<`, `2>`, `&>`, `tee`, `/dev/null` — bài này dạy cách **kết nối** lệnh với nhau. Đây là tính năng làm Linux trở thành **automation platform**.

## 3 stream cốt lõi

Mọi process Linux có **3 stream mặc định** (file descriptor):

| FD | Tên | Mặc định | Ý nghĩa |
|---|---|---|---|
| **0** | `stdin` | Bàn phím | Input — process đọc từ đâu |
| **1** | `stdout` | Terminal | Output bình thường |
| **2** | `stderr` | Terminal | Error messages |

```text
                    +─────────────+
   keyboard ──FD0──▶| process     |──FD1──▶ screen (stdout)
                    |             |──FD2──▶ screen (stderr)
                    +─────────────+
```

**Redirection** = đổi đích của các stream này.

## Output redirection — `>` và `>>`

### `>` — overwrite (ghi đè)

```bash
ls > files.txt                          # Output của ls → file (ghi đè nếu tồn tại)
echo "Hello" > greet.txt                # Tạo file với content
date > /tmp/now.txt                     # Lưu thời điểm hiện tại
```

### `>>` — append

```bash
ls >> files.txt                         # Output → cuối file (không ghi đè)
echo "Line 2" >> greet.txt
date >> /tmp/log.txt                    # Append vào log
```

### Cẩn thận: `>` ghi đè

```bash
cat file.txt > file.txt                 # ⚠️ FILE THÀNH RỖNG
                                        # Vì shell mở file (truncate) TRƯỚC khi cat đọc
```

Đây là bẫy kinh điển. Để sửa file in-place dùng `sed -i`, không phải `>`.

## Input redirection — `<`

```bash
wc -l < /etc/passwd                     # wc đọc từ file (qua stdin)
mysql -u root -p < schema.sql           # Chạy SQL script
mail -s "Report" team@acme.com < report.txt
```

`wc -l file` và `wc -l < file` thường ra giống nhau. Khác biệt: với `<`, `wc` không biết tên file → output không có filename.

### Here document (`<<`)

```bash
cat << EOF > config.yml
server:
  host: localhost
  port: 8080
EOF
```

Hữu ích trong script — viết file nhiều dòng inline.

### Here string (`<<<`)

```bash
grep "abc" <<< "abc and def"           # = echo "abc and def" | grep "abc"
```

## Stderr redirection — `2>`

```bash
ls /nonexistent
# ls: cannot access '/nonexistent': No such file or directory      ← stderr
```

Tách stderr khỏi stdout:

```bash
ls /etc /nonexistent > out.txt 2> err.txt
cat out.txt              # Chỉ /etc listing
cat err.txt              # Chỉ error message

# Bỏ qua error
ls /etc 2>/dev/null

# Bỏ qua mọi output
ls 2>&1 >/dev/null
# Hoặc gọn hơn:
ls &>/dev/null
```

## Gộp stdout + stderr — `2>&1` và `&>`

`2>&1` = "stderr (FD2) đi vào nơi stdout (FD1) đang đi":

```bash
command > all.log 2>&1                  # Cả stdout và stderr → all.log
```

**Thứ tự quan trọng!**

```bash
command 2>&1 > all.log                  # SAI: stderr vẫn ra terminal
command > all.log 2>&1                  # ĐÚNG
```

Lý do: `2>&1` redirect stderr tới chỗ stdout **đang trỏ tới**. Phải redirect stdout trước.

Shortcut Bash 4+:

```bash
command &> all.log                      # = > all.log 2>&1
command &>> all.log                     # Append cả 2
```

## `/dev/null` — hố đen

`/dev/null` là **virtual file** — viết gì vào cũng biến mất, đọc trả về EOF.

```bash
# Bỏ qua output
yum install vim -y > /dev/null

# Bỏ qua error
find / -name "abc" 2>/dev/null

# Bỏ qua tất cả
some-noisy-command &> /dev/null

# Reset file rỗng
cat /dev/null > log.txt
# Hoặc:
: > log.txt
```

### Use case thật

```bash
# Test command có chạy được không (không cần xem output)
if command -v nginx &>/dev/null; then
    echo "nginx installed"
fi

# Run command nền không in gì
nohup ./my-script.sh &>/dev/null &

# Cron tránh email "no output"
0 * * * * /usr/local/bin/check.sh &>/dev/null
```

## Pipe — `|`

Pipe = "stdout của lệnh A → stdin của lệnh B":

```bash
command_A | command_B
```

```bash
ls /etc | wc -l                         # Đếm số file/folder trong /etc
ps aux | grep nginx                     # Process có "nginx"
cat access.log | awk '{print $1}' | sort | uniq -c | sort -rn | head
```

Pipe có thể chain dài tuỳ ý — đây là **Unix philosophy** đỉnh cao.

### Pipe với stderr

Mặc định pipe chỉ chuyển stdout. Để chuyển cả stderr:

```bash
command_A 2>&1 | command_B              # Cả stdout + stderr qua pipe
command_A |& command_B                  # Bash 4+ shortcut
```

## `tee` — chia output cho 2 đích

`tee` (như chữ T trong ống nước) = ghi vào file **và** in ra stdout cùng lúc:

```bash
ls /etc | tee files.txt                 # Hiện trên screen + save vào file
ls /etc | tee files.txt | wc -l         # tee giữ pipe sống → wc đếm
ls /etc | tee -a files.txt              # Append (giữ content cũ)
```

### Use case thật

```bash
# Cài tool có sudo, vừa xem log vừa save
sudo apt install nginx 2>&1 | tee install.log

# Build pipeline lưu log nhưng vẫn show user
make all 2>&1 | tee build-$(date +%F).log

# Write to system file cần sudo (echo > không work)
echo "127.0.0.1 myhost" | sudo tee -a /etc/hosts
```

Pattern cuối: `echo > /etc/hosts` fail vì redirection chạy với shell user, không sudo. `sudo tee` chạy với root → ghi được.

## Pipeline trong script

Pipeline trong Bash trả về **exit code của lệnh cuối**:

```bash
false | true
echo $?                                 # 0 — vì true cuối thành công
```

Để bắt lỗi lệnh giữa pipeline:

```bash
set -o pipefail
false | true
echo $?                                 # 1 — vì false fail

# PIPESTATUS array
a | b | c
echo "${PIPESTATUS[@]}"                 # Exit code mỗi stage
```

Khi viết script production, luôn set:

```bash
set -euo pipefail
#   ^e exit on error
#    ^u undefined var = error
#       ^^^^^^^^^^^^ pipeline fail nếu bất kỳ stage nào fail
```

## Background job — `&`

```bash
long-task &                             # Chạy nền
nohup long-task &                       # Vẫn chạy khi logout
nohup long-task &> task.log &           # + lưu log

jobs                                    # List job nền
fg %1                                   # Đưa job 1 ra foreground
bg %1                                   # Tiếp tục job nền nếu stopped
kill %1                                 # Kill job
disown %1                               # Bỏ khỏi shell (vẫn chạy nếu logout)
```

`Ctrl+Z` suspend foreground job. `bg` cho chạy tiếp ngầm. `fg` đưa ra trước.

## Process substitution — `<(cmd)` và `>(cmd)`

```bash
# So sánh output 2 lệnh
diff <(ls dir1) <(ls dir2)

# Lấy header rồi grep + thêm header
{ head -1 access.log; grep "ERROR" access.log; } > errors.csv
```

`<(cmd)` = "tạo fake file chứa output của cmd". Hữu ích khi tool cần file path, không phải stdin.

## xargs — pipeline cho command không nhận stdin

Một số lệnh (`rm`, `mkdir`, `kill`) **không đọc stdin** — chỉ đọc arguments. `xargs` chuyển stdin thành arguments:

```bash
# Tìm và xoá file
find . -name "*.tmp" | xargs rm

# Xoá nhiều file an toàn với space trong tên
find . -name "*.tmp" -print0 | xargs -0 rm

# Process song song
cat urls.txt | xargs -n1 -P10 wget        # 10 song song

# Build command custom
echo "1 2 3" | xargs -I {} echo "Hello {}"
# Hello 1
# Hello 2
# Hello 3
```

`xargs` là chiếc cầu giữa "lệnh sinh data" và "lệnh nhận args".

## Combo cheat sheet

```bash
# Append với timestamp
command >> log.txt
echo "[$(date)] event happened" >> log.txt

# Save + continue
command 2>&1 | tee output.log

# Discard stdout, keep error
command > /dev/null

# Discard error, keep output
command 2> /dev/null

# Discard both
command &> /dev/null

# Counting
ls | wc -l                              # Số file
ls -la | wc -l                          # +2 (cho . và ..)

# Watch file grow
tail -f /var/log/messages | grep ERROR  # Live error filter

# Pipe with tee for both screen + file
make build 2>&1 | tee build.log | grep -i "warn\|error"
```

## Bẫy thường gặp

| Sai | Lý do | Đúng |
|---|---|---|
| `cat f > f` | File rỗng | `sed -i ... f` hoặc tmp file |
| `cmd > log 2>&1` vs `cmd 2>&1 > log` | Thứ tự sai → stderr không vào log | Luôn `> log 2>&1` |
| `echo "x" > /etc/sysctl.conf` (sudo) | Redirect chạy với non-sudo | `echo "x" | sudo tee -a /etc/sysctl.conf` |
| `find . -delete | xargs rm` | -delete đã xoá rồi | Dùng 1 trong 2 |
| `grep error | head` mất output | head close pipe → grep nhận SIGPIPE | OK, đây là behavior chuẩn |
| Pipe vào builtin shell | `echo 1 | cd /tmp` không vào | Builtin chạy trong subshell |
| Quên `-r` cho recursive grep với pipe | `grep error /dev` không sâu | `grep -r` hoặc `find + xargs grep` |

## Quick reference

```text
> file        Stdout → file (ghi đè)
>> file       Stdout → file (append)
< file        File → stdin
2> file       Stderr → file
2>> file      Stderr → file (append)
&> file       Cả stdout+stderr → file
2>&1          Stderr → nơi stdout đang đi
| cmd         Stdout → stdin của cmd
|& cmd        Cả stdout+stderr → cmd
| tee f       Pipe + save vào f
| tee -a f    Pipe + append
&             Chạy nền
nohup &       Chạy nền + sống qua logout
< (cmd)       Process substitution như file
xargs cmd     Stdin → args của cmd
/dev/null     Black hole
```

## Tóm tắt bài 6

- 3 stream: **stdin (0)**, **stdout (1)**, **stderr (2)**.
- **`>` ghi đè**, **`>>` append**, **`<` đọc từ file**.
- **`2>` cho stderr**, **`&>` cho cả hai** (Bash 4+).
- **`2>&1` thứ tự quan trọng** — đặt SAU redirect stdout.
- **`/dev/null`** = hố đen vứt output.
- **Pipe `|`** chain lệnh; **`tee`** chia output 2 đích.
- **`xargs`** biến stdin thành arguments.
- Script: `set -euo pipefail` bắt mọi lỗi.

**Bài kế tiếp** → [Bài 7: Users, Groups, Permissions, Sudo — kiểm soát truy cập trong Linux](07-users-permissions-sudo.md)
