# Bài 5: Lọc, tìm và xử lý text — grep, cut, sort, awk, sed, find

DevOps engineer dành **phần lớn thời gian** xử lý text: log file, config file, output command. Master bài này = master DevOps.

> "If everything is a file, then everything is text. Master text processing = master Linux."

## Đọc nội dung file — `cat`, `less`, `head`, `tail`

### `cat` — đọc nhanh, ngắn

```bash
cat /etc/hostname                       # Đọc cả file
cat file1 file2                          # Concat nhiều file
cat -n file.txt                          # Có số dòng
cat -A file.txt                          # Hiện ký tự ẩn (tab, end-of-line)
```

**Bẫy**: `cat /var/log/messages` (1 GB) → terminal chậm/đơ. Dùng `less` cho file lớn.

### `less` — pager mạnh nhất

```bash
less /var/log/syslog
```

Trong less:
| Phím | Tác dụng |
|---|---|
| `↑` `↓` `j` `k` | Cuộn từng dòng |
| `Space` / `f` | Trang sau |
| `b` | Trang trước |
| `g` | Đầu file |
| `G` | Cuối file |
| `/pattern` | Search tới |
| `?pattern` | Search lùi |
| `n` / `N` | Match next/prev |
| `q` | Thoát |
| `&pattern` | Chỉ hiện dòng match |

`less` **không** load cả file vào RAM → đọc file 10 GB không tốn memory.

### `more` — pager đơn giản

```bash
more file.log
# Enter để xuống, q để thoát
```

`less` mạnh hơn `more`. Mặc định dùng `less`. (Câu đùa kinh điển: "less is more".)

### `head` và `tail`

```bash
head file.log                            # 10 dòng đầu (mặc định)
head -n 5 file.log                       # 5 dòng đầu
head -5 file.log                         # = -n 5
head -c 100 file.log                     # 100 byte đầu

tail file.log                            # 10 dòng cuối
tail -n 20 file.log                      # 20 dòng cuối
tail -f /var/log/nginx/access.log        # Follow — theo dõi log real-time
tail -F /var/log/app.log                 # Như -f nhưng resilient với log rotation
```

**`tail -f`** là **vũ khí debug** quan trọng nhất khi vận hành server:

```bash
# Một terminal: tail log
tail -f /var/log/nginx/access.log

# Terminal khác: gửi request
curl http://localhost/api/test

# → thấy log update ngay khi request đến
```

`Ctrl+C` để thoát.

## Tìm text trong file — `grep`

```bash
grep pattern file                       # Tìm pattern trong file
grep "error 500" /var/log/nginx.log    # Có space → quote
grep firewall config.txt
```

### Options thường dùng

| Option | Ý nghĩa |
|---|---|
| `-i` | Ignore case |
| `-v` | Inverse — dòng KHÔNG match |
| `-r` (hoặc `-R`) | Recursive — vào subfolder |
| `-l` | Chỉ in TÊN file có match |
| `-c` | Đếm số dòng match |
| `-n` | Hiện số dòng |
| `-w` | Match cả từ (không substring) |
| `-A 3` | After: 3 dòng SAU match |
| `-B 3` | Before: 3 dòng TRƯỚC match |
| `-C 3` | Context: 3 dòng quanh match |
| `-E` | Extended regex (như egrep) |
| `-o` | Chỉ in phần match, không cả dòng |
| `--color` | Highlight match (thường mặc định) |

### Ví dụ DevOps thật

```bash
# Tìm setting trong toàn /etc
grep -r SELINUX /etc/ 2>/dev/null

# Đếm error trong log hôm nay
grep -c "ERROR" /var/log/app.log

# Liệt file có chứa "password" (cẩn thận)
grep -rl password /etc/

# 3 dòng context quanh mỗi error
grep -C 3 "Stack trace" /var/log/app.log

# Lấy mọi IP từ log
grep -oE "\b([0-9]{1,3}\.){3}[0-9]{1,3}\b" access.log | sort -u

# Loại bỏ comment khi đọc config
grep -v "^#" /etc/nginx/nginx.conf | grep -v "^$"
```

### grep + pipe

```bash
ps aux | grep nginx                     # Process có "nginx"
ls -la | grep "^d"                      # Chỉ folder (start với d)
dmesg | grep -i usb                     # Kernel log liên quan USB
```

> **Lưu ý**: `grep nginx | grep -v grep` để loại bỏ grep tự xuất hiện trong output `ps`. Hoặc dùng `pgrep nginx` thay.

## Cắt cột — `cut`

`cut` lấy field/column từ file có **delimiter** rõ.

```bash
# File /etc/passwd có format: username:x:UID:GID:gecos:home:shell
# vagrant:x:1000:1000::/home/vagrant:/bin/bash

cut -d':' -f1 /etc/passwd               # Field 1 = username
cut -d':' -f1,6 /etc/passwd             # Field 1 và 6
cut -d':' -f1-3 /etc/passwd             # Field 1 đến 3
cut -c1-5 file.txt                      # Ký tự 1 đến 5
```

`-d` = delimiter, `-f` = field (1-indexed).

### Use case thật

```bash
# Lấy username của user "real" (UID >= 1000)
awk -F: '$3 >= 1000' /etc/passwd | cut -d: -f1

# Top IP gọi nhiều nhất
cut -d' ' -f1 access.log | sort | uniq -c | sort -rn | head

# Lấy column 2 từ CSV
cut -d',' -f2 sales.csv
```

`cut` **không đủ** cho format phức tạp (delimiter biến động, multiple space). Dùng `awk` thay.

## Awk — Swiss Army knife xử lý text

`awk` là **mini ngôn ngữ programming** cho text. Cực mạnh.

### Cú pháp cơ bản

```bash
awk 'pattern { action }' file
```

```bash
awk '{ print $1 }' file                 # In column 1 (mặc định split bởi whitespace)
awk -F':' '{ print $1 }' /etc/passwd     # Delimiter ":"
awk '{ print $1, $3 }' file              # Column 1 và 3
awk 'NR==1' file                         # Dòng 1
awk 'NR>=5 && NR<=10' file               # Dòng 5-10
awk 'length > 80' file                   # Dòng > 80 ký tự
awk '/error/' file                       # Như grep error
awk '!/^#/' file                         # Bỏ comment
awk '$3 > 100' file                      # Column 3 > 100
```

Built-in vars:
- `$0`: cả dòng.
- `$1`, `$2`, ...: column 1, 2, ...
- `NR`: số dòng hiện tại.
- `NF`: số field trong dòng.
- `FS`: input field separator.
- `OFS`: output field separator.

### Use case thật

```bash
# Tổng bytes trong access log
awk '{ sum += $10 } END { print sum }' access.log

# In file lớn nhất trong ls
ls -l | awk '{print $5, $9}' | sort -rn | head

# Lấy thông tin user UID 1000+
awk -F: '$3 >= 1000 { print $1 }' /etc/passwd

# Format đẹp
awk -F: '{printf "%-15s %s\n", $1, $7}' /etc/passwd
```

`awk` đáng học sâu — sẽ gặp lại nhiều ở phase Bash Scripting (section 11).

## Sed — stream editor

`sed` là **Stream EDitor** — sửa text trong stream, không cần mở editor.

### Cú pháp cơ bản

```bash
sed 's/old/new/' file                   # Replace LẦN ĐẦU trong mỗi dòng
sed 's/old/new/g' file                  # Replace TOÀN BỘ (global)
sed 's/old/new/gi' file                 # Global + ignore case
sed -i 's/old/new/g' file               # In-place: GHI ĐÈ file
sed -i.bak 's/old/new/g' file           # In-place + backup file.bak
sed -n '5,10p' file                     # Chỉ in dòng 5-10
sed '/^$/d' file                        # Xoá dòng rỗng
sed '/^#/d' file                        # Xoá dòng comment
sed '1d' file                           # Xoá dòng 1
sed '$d' file                           # Xoá dòng cuối
sed '/error/d' file                     # Xoá dòng chứa "error"
```

### Use case thật

```bash
# Đổi tên biến trong nhiều file
sed -i 's/old_name/new_name/g' *.py

# Disable SELinux
sed -i 's/SELINUX=enforcing/SELINUX=disabled/' /etc/selinux/config

# Bỏ comment + dòng rỗng để xem config gọn
sed -e '/^#/d' -e '/^$/d' /etc/nginx/nginx.conf

# Đổi separator CSV
sed 's/,/;/g' data.csv > data.tsv

# Insert dòng sau dòng N
sed '5a\New line here' file
```

`-i` **ghi đè file gốc** — luôn `-i.bak` để có backup.

## Sort, uniq, wc — counting + ordering

### `sort`

```bash
sort file.txt                           # Tăng dần
sort -r file.txt                        # Giảm dần
sort -n file.txt                        # Numeric (1, 2, 10 thay vì 1, 10, 2)
sort -nr file.txt                       # Numeric + reverse
sort -u file.txt                        # Unique (= sort | uniq)
sort -k2 file.txt                       # Sort theo column 2
sort -t',' -k3 -n file.csv              # CSV, sort column 3 numeric
```

### `uniq`

```bash
uniq file.txt                           # Loại bỏ duplicate LIÊN TIẾP
sort file.txt | uniq                    # Loại duplicate toàn file
sort file.txt | uniq -c                 # Đếm lần xuất hiện
sort file.txt | uniq -d                 # Chỉ in duplicate
sort file.txt | uniq -u                 # Chỉ in unique (đúng 1 lần)
```

> **`uniq` KHÔNG sort** — chỉ remove consecutive duplicates. Phải sort trước.

### `wc` — word count

```bash
wc file.txt                             # lines, words, bytes
wc -l file.txt                          # Số dòng
wc -w file.txt                          # Số word
wc -c file.txt                          # Số byte
wc -l *.log                             # Đếm dòng nhiều file
```

### Combo kinh điển — top IP

```bash
cut -d' ' -f1 /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -10

#   ^^ lấy column 1 (IP)
#               ^^ sort để uniq hoạt động
#                          ^^ count
#                                  ^^ sort numeric reverse
#                                              ^^ top 10
```

Output:

```text
   1542 1.2.3.4
    876 5.6.7.8
    432 9.10.11.12
    ...
```

Đây là **single-line analytics** — pattern dùng đi dùng lại.

## Tìm file — `find`

```bash
find /path -name "pattern"
find /etc -name "*.conf"                # File kết thúc .conf trong /etc
find . -name "*.log" -type f            # Chỉ regular file
find . -name "*.log" -type d            # Chỉ directory
find /home -user vagrant                # Của user vagrant
find / -size +100M                      # File > 100 MB
find / -size +1G -type f                # File > 1 GB
find / -mtime -7                        # Sửa trong 7 ngày qua
find / -mtime +30                       # Sửa hơn 30 ngày
find / -mmin -10                        # Sửa trong 10 phút
find . -empty                           # File/folder rỗng
find . -perm 600                        # Permission cụ thể
```

### Action — `find` + làm gì?

```bash
find . -name "*.tmp" -delete                       # Xoá
find . -name "*.log" -exec gzip {} \;              # gzip từng file
find . -name "*.bak" -exec rm {} +                 # batch rm (nhanh hơn \;)
find . -name "*.conf" -exec grep -l "ssl" {} \;    # File chứa "ssl"

# Modern alternative:
find . -name "*.log" | xargs gzip                  # pipe + xargs
```

`{}` = placeholder cho path mỗi file. `\;` kết thúc -exec. `+` gọi command 1 lần với nhiều args (nhanh hơn).

### `find` vs `locate`

```bash
locate filename                          # Tìm trong DB
sudo updatedb                            # Cập nhật DB (cron tự chạy hàng ngày)
```

| | find | locate |
|---|---|---|
| Realtime | ✓ | ✗ (cache) |
| Tốc độ | Chậm với tree lớn | Cực nhanh |
| Filter mạnh | ✓ | ✗ (chỉ name) |
| Có sẵn | ✓ | Phải cài `mlocate` |

**Khi nào dùng**:
- `locate` cho tìm nhanh theo tên.
- `find` cho mọi tình huống khác (size, mtime, action).

## So sánh file — `diff`, `comm`

```bash
diff a.txt b.txt                        # Khác biệt
diff -u a.txt b.txt                     # Unified diff (giống git diff)
diff -r dir1/ dir2/                     # So sánh folder

comm a.txt b.txt                        # 3 cột: chỉ a, chỉ b, cả 2
```

## Lệnh xử lý text nhanh khác

| Lệnh | Tác dụng |
|---|---|
| `tr 'a-z' 'A-Z'` | Translate ký tự (upper case) |
| `tr -d ' '` | Xoá space |
| `paste a b` | Gộp 2 file thành 2 cột |
| `join a b` | Join 2 file theo key |
| `tac` | Đảo ngược thứ tự dòng (cat reverse) |
| `rev` | Đảo ngược ký tự mỗi dòng |
| `fmt -w 80` | Wrap text 80 ký tự |
| `column -t` | Format thành bảng đẹp |
| `nl` | Number lines |
| `expand` | Tab → space |
| `unexpand` | Space → tab |
| `iconv -f UTF-8 -t ASCII` | Đổi encoding |

## Workflow combo cho DevOps

### Phân tích log

```bash
# Top 10 URL được request nhiều nhất
awk '{print $7}' access.log | sort | uniq -c | sort -rn | head -10

# Số request mỗi giờ
awk '{print $4}' access.log | cut -c14-15 | sort | uniq -c

# Slow request > 1 second
awk '$NF > 1' access.log

# Error 5xx
awk '$9 ~ /^5/' access.log

# Bytes transferred theo IP
awk '{ a[$1] += $10 } END { for (k in a) print a[k], k }' access.log | sort -rn | head
```

### System health

```bash
# Top 5 process tiêu RAM
ps aux --sort=-%mem | head -6

# Đĩa đầy?
df -h | awk '$5+0 > 80 {print}'         # Partition > 80%

# Có ai login lạ?
last | head | awk '{print $1, $3}'

# Service nào restart nhiều?
journalctl --since "1 day ago" | grep -i "started" | awk '{print $5}' | sort | uniq -c | sort -rn
```

## Bẫy thường gặp

| Bẫy | Sai | Đúng |
|---|---|---|
| `uniq` không thấy duplicate | `cat | uniq` | `cat | sort | uniq` |
| `grep` lấy substring không mong | `grep error` cũng match "errored" | `grep -w error` |
| `sed -i` không backup | Mất dữ liệu khi sed sai | `sed -i.bak ...` |
| `find -exec` chậm với nhiều file | `\;` | `+` |
| `cut` với multiple space | Split không đúng | `awk` |
| `grep` regex syntax | Basic regex (`(a)` không match) | `-E` cho extended |
| `tail -f` mất log sau rotation | `-f` đứng yên | `tail -F` |

## Tóm tắt bài 5

- **`cat`/`less`/`head`/`tail`**: đọc file. `tail -f` cho log real-time.
- **`grep -i -v -r -E -A -B -C`**: tìm text. Tổ hợp option mạnh.
- **`cut -d -f`**: cắt cột nhanh khi có delimiter.
- **`awk '{print $N}'`**: cắt cột thông minh, làm logic.
- **`sed s/old/new/g`**: replace inline. `-i` ghi đè, `.bak` backup.
- **`sort | uniq -c | sort -rn`**: pattern thống kê tần suất.
- **`find / -name -size -mtime -exec`**: realtime search + action.
- Combo **pipe** = sức mạnh thực sự — không có tool đơn nào "all-in-one".

**Bài kế tiếp** → [Bài 6: Redirection và Pipe — chuyển output, đọc input, /dev/null](06-redirection-pipe.md)
