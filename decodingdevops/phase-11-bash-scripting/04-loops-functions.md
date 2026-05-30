# Bài 4: Loops và functions

Loop để lặp và function để tái sử dụng — 2 building block của script chuyên nghiệp.

## `for` loop

### List values

```bash
for fruit in apple banana cherry; do
    echo "Fruit: $fruit"
done
```

### Range

```bash
for i in {1..5}; do
    echo "$i"
done
# 1 2 3 4 5

for i in {0..20..2}; do      # Step 2
    echo "$i"
done
# 0 2 4 6 ... 20
```

### C-style

```bash
for ((i=0; i<10; i++)); do
    echo "$i"
done
```

### Iterate array

```bash
TOOLS=("git" "docker" "k8s")

for t in "${TOOLS[@]}"; do
    echo "Tool: $t"
done

# Index
for i in "${!TOOLS[@]}"; do
    echo "$i: ${TOOLS[$i]}"
done
```

### Iterate file lines

```bash
# Wrong (word splitting)
for line in $(cat file.txt); do
    echo "$line"
done

# Right (preserve lines)
while IFS= read -r line; do
    echo "$line"
done < file.txt
```

### Iterate files

```bash
for f in /var/log/*.log; do
    echo "Processing $f"
    wc -l "$f"
done

# Recursive
for f in $(find . -name "*.py"); do
    grep -l "TODO" "$f"
done

# Better — handle spaces:
find . -name "*.py" -print0 | while IFS= read -r -d '' f; do
    grep -l "TODO" "$f"
done
```

## `while` loop

### Condition

```bash
counter=0
while (( counter < 5 )); do
    echo "Counter: $counter"
    ((counter++))
done
```

### Read file

```bash
while IFS= read -r line; do
    echo "Line: $line"
done < /etc/hosts
```

`IFS=` preserve leading/trailing whitespace; `-r` không treat `\` as escape.

### Read process output

```bash
ps aux | while read -r line; do
    echo "$line" | awk '{print $1, $11}'
done
```

### Infinite loop

```bash
while true; do
    date
    sleep 5
done
```

Break out:

```bash
while true; do
    read -p "Continue? [y/n] " ans
    case "$ans" in
        y) continue ;;
        n) break ;;
        *) echo "Invalid" ;;
    esac
done
```

## `until` loop — opposite of while

```bash
# Chạy đến khi condition TRUE
counter=0
until (( counter >= 5 )); do
    echo "$counter"
    ((counter++))
done
```

## `break` and `continue`

```bash
for i in {1..10}; do
    if (( i == 5 )); then
        break              # Thoát loop
    fi
    if (( i % 2 == 0 )); then
        continue           # Skip iteration
    fi
    echo "$i"
done
# 1 3
```

`break N` thoát N level loop lồng.

## Functions

```bash
# Định nghĩa
greet() {
    echo "Hello, $1"
}

# Call
greet "Alice"
greet "Bob"
```

### Args in function

```bash
add() {
    local result=$(( $1 + $2 ))
    echo "$result"
}

sum=$(add 5 3)
echo "Sum: $sum"               # 8
```

`$1`, `$2`, ..., `$@`, `$#` work inside function (relative to function call).

### Local variable

```bash
my_func() {
    local x=10                 # Chỉ trong function
    echo "Inside: $x"
}

my_func
echo "Outside: ${x:-undefined}"  # undefined
```

**Always use `local`** trong function — tránh leak ra global scope.

### Return value

Bash function "return" exit code (0-255), không return value.

```bash
is_even() {
    if (( $1 % 2 == 0 )); then
        return 0               # Success
    else
        return 1               # Fail
    fi
}

if is_even 4; then
    echo "Even"
fi
```

Trả "value" qua **echo + command substitution**:

```bash
get_user_count() {
    awk -F: '$3 >= 1000' /etc/passwd | wc -l
}

count=$(get_user_count)
echo "Users: $count"
```

### Function với default args

```bash
greet() {
    local name=${1:-World}
    echo "Hello, $name"
}

greet                          # Hello, World
greet "Alice"                  # Hello, Alice
```

### Recursive function

```bash
factorial() {
    if (( $1 <= 1 )); then
        echo 1
    else
        local prev=$(factorial $(( $1 - 1 )))
        echo $(( $1 * prev ))
    fi
}

factorial 5                    # 120
```

Bash chậm — recursion sâu = stack overflow. Cho recursion phức tạp → Python.

## Useful patterns

### Spinner during long task

```bash
spinner() {
    local pid=$1
    local delay=0.1
    local spinstr='|/-\'
    while kill -0 $pid 2>/dev/null; do
        local temp=${spinstr#?}
        printf " [%c]  " "$spinstr"
        spinstr=$temp${spinstr%"$temp"}
        sleep $delay
        printf "\b\b\b\b\b\b"
    done
    printf "    \b\b\b\b"
}

# Use
long_task &
spinner $!
wait
```

### Retry với backoff

```bash
retry() {
    local max=${1:-3}
    local delay=${2:-2}
    shift 2

    local i=1
    while (( i <= max )); do
        if "$@"; then
            return 0
        fi
        echo "Attempt $i failed, retrying in ${delay}s..."
        sleep "$delay"
        ((i++))
        delay=$(( delay * 2 ))
    done
    echo "Failed after $max attempts"
    return 1
}

# Use
retry 5 2 curl -fs https://api.example.com
```

### Trap — cleanup on exit

```bash
TMPFILE=$(mktemp)
trap 'rm -f "$TMPFILE"' EXIT
trap 'echo "Interrupted"; exit 130' INT TERM

# Script làm gì với $TMPFILE...
echo "data" > "$TMPFILE"
```

`trap` chạy command khi nhận signal:

| Signal | Khi nào |
|---|---|
| `EXIT` | Script kết thúc (bình thường hoặc fail) |
| `INT` | Ctrl+C |
| `TERM` | `kill` (SIGTERM) |
| `ERR` | Command fail (cần `set -e`) |

### Log function

```bash
LOG_FILE="/var/log/myapp.log"

log() {
    local level=$1
    shift
    local msg="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$level] $msg" | tee -a "$LOG_FILE"
}

log INFO "Starting backup"
log WARN "Disk usage 85%"
log ERROR "Backup failed"
```

### Parallel — `xargs -P`, `parallel`

```bash
# 4 parallel curl
echo -e "url1\nurl2\nurl3\nurl4" | xargs -n1 -P4 curl -s

# GNU parallel
parallel -j 4 'wget {}' ::: url1 url2 url3 url4
```

### Source library

`/usr/local/lib/devops/common.sh`:

```bash
#!/bin/bash
# Common functions

log() { echo "[$(date '+%F %T')] $*"; }
require_root() { [ "$EUID" -eq 0 ] || { echo "Need root"; exit 1; }; }
```

Script:

```bash
#!/bin/bash
source /usr/local/lib/devops/common.sh

require_root
log "Starting..."
```

DRY — chia function dùng chung vào library.

## Monitor service script — full example

```bash
#!/bin/bash
#
# monitor.sh — check services và alert nếu fail
#

set -euo pipefail

readonly SERVICES=(
    "nginx"
    "mariadb"
    "memcached"
    "rabbitmq-server"
)

readonly ALERT_EMAIL="${ALERT_EMAIL:-admin@example.com}"
readonly LOG_FILE="${LOG_FILE:-/var/log/monitor.log}"

# === Functions ===
log() {
    local level=$1; shift
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$level] $*" | tee -a "$LOG_FILE"
}

check_service() {
    local svc=$1
    if systemctl is-active "$svc" &>/dev/null; then
        log INFO "$svc OK"
        return 0
    else
        log ERROR "$svc DOWN"
        return 1
    fi
}

restart_service() {
    local svc=$1
    log WARN "Attempting restart of $svc"
    if sudo systemctl restart "$svc"; then
        log INFO "$svc restarted"
        return 0
    else
        log ERROR "Failed to restart $svc"
        return 1
    fi
}

alert() {
    local msg=$*
    log ALERT "$msg"
    # Email (cần mailx)
    if command -v mail &>/dev/null; then
        echo "$msg" | mail -s "Monitor Alert" "$ALERT_EMAIL"
    fi
}

# === Main ===
main() {
    log INFO "=== Monitor run started ==="

    local failed=()

    for svc in "${SERVICES[@]}"; do
        if ! check_service "$svc"; then
            failed+=("$svc")
            if ! restart_service "$svc"; then
                alert "CRITICAL: $svc failed and restart failed"
            fi
        fi
    done

    if (( ${#failed[@]} > 0 )); then
        alert "Detected ${#failed[@]} failed service(s): ${failed[*]}"
    fi

    log INFO "=== Monitor run completed ==="
}

main "$@"
```

Schedule với cron:

```bash
# Crontab: chạy mỗi 5 phút
*/5 * * * * /usr/local/bin/monitor.sh
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| `for line in $(cat file)` | Word splitting | `while read line; do ... done < file` |
| Variable trong loop subshell (pipe) | Không persist | Process substitution `< <(...)` |
| Quên `local` trong function | Pollute global | Always `local var=...` |
| Function trả value qua return | Chỉ 0-255 | Echo + command substitution |
| Trap không reset | Stale handler | Reset với `trap - SIGNAL` |
| Recursion sâu | Stack overflow | Iterate hoặc Python |
| Parallel không limit | Spawn quá nhiều process | `xargs -P N` hoặc `parallel -j N` |

## Quick reference

```text
# Loops
for x in a b c; do ... done
for i in {1..10}; do ... done
for ((i=0; i<10; i++)); do ... done
while cond; do ... done
until cond; do ... done
break / continue

# Functions
func() { local x=1; echo "$1"; }
func arg1
result=$(func arg1)

# Trap
trap 'cleanup' EXIT
trap 'echo INT' INT
trap - INT                Reset

# Useful
xargs -n1 -P4 cmd         Parallel 4 jobs
mktemp                    Temp file
$(date '+%F %T')          Timestamp
tee -a file               Append + screen
```

## Tóm tắt bài 4

- **`for x in list`** — list, range, array, files.
- **`while`** với `read -r` để đọc file an toàn.
- **`break` / `continue`** điều khiển loop.
- **Function**: `name() { ... }`, dùng `local` cho variable.
- "Return value" qua **echo + `$(func)`** — không phải `return` (chỉ exit code).
- **`trap`** cleanup khi script exit.
- Parallel: `xargs -P` hoặc GNU `parallel`.

**Bài kế tiếp** → [Bài 5: Remote execution với SSH](05-remote-ssh.md)
