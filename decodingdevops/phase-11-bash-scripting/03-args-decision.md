# Bài 3: Command-line arguments và decision making

Script DevOps thường nhận **argument** từ command line và rẽ nhánh logic theo điều kiện.

## Command-line arguments

```bash
#!/bin/bash
# args.sh

echo "Script name: $0"
echo "First arg: $1"
echo "Second arg: $2"
echo "Third arg: $3"
echo "All args: $@"
echo "All args quoted: $*"
echo "Number of args: $#"
echo "Process ID: $$"
echo "Last exit code: $?"
```

```bash
./args.sh apple banana cherry
# Script name: ./args.sh
# First arg: apple
# Second arg: banana
# Third arg: cherry
# All args: apple banana cherry
# Number of args: 3
```

| Variable | Ý nghĩa |
|---|---|
| `$0` | Script name |
| `$1`, `$2`, ... | Argument N |
| `$#` | Số argument |
| `$@` | All args as separate (recommend trong loop) |
| `$*` | All args as 1 string |
| `$$` | PID của script |
| `$?` | Exit code lệnh trước |
| `$!` | PID của background job cuối |

### `$@` vs `$*` với quote

```bash
# Test với args: "a b" "c d"
for arg in "$@"; do echo "[$arg]"; done
# [a b]
# [c d]

for arg in "$*"; do echo "[$arg]"; done
# [a b c d]                ← Gộp thành 1
```

**`"$@"`** preserve original words. **Recommend** cho loop.

### Shift — đẩy args

```bash
echo $1                       # a
shift                          # Bỏ $1, $2 → $1
echo $1                       # b

shift 2                        # Bỏ 2 args nữa
```

Hữu ích khi parse args thủ công.

## Validate args

```bash
#!/bin/bash
set -euo pipefail

if [ $# -lt 2 ]; then
    echo "Usage: $0 <name> <port>" >&2
    exit 1
fi

NAME="$1"
PORT="$2"

echo "Setting up $NAME on port $PORT"
```

`>&2` redirect ra stderr — convention cho error message.

## Argument parsing — `getopts`

Cho script phức tạp với flag (`-v`, `-f file`, `--verbose`):

```bash
#!/bin/bash
set -euo pipefail

VERBOSE=0
FILE=""
COUNT=1

while getopts "vf:c:h" opt; do
    case "$opt" in
        v) VERBOSE=1 ;;
        f) FILE="$OPTARG" ;;
        c) COUNT="$OPTARG" ;;
        h) echo "Usage: $0 [-v] [-f file] [-c count]"; exit 0 ;;
        *) echo "Invalid option"; exit 1 ;;
    esac
done

shift $((OPTIND - 1))             # Skip parsed flags

echo "Verbose: $VERBOSE"
echo "File: $FILE"
echo "Count: $COUNT"
echo "Remaining args: $@"
```

```bash
./script.sh -v -f config.txt -c 5 extra_arg
# Verbose: 1
# File: config.txt
# Count: 5
# Remaining args: extra_arg
```

`getopts` không support `--long-flag`. Cho complex args → dùng Python.

## System variables

Built-in Bash variable:

```bash
echo $HOME                   # /home/user
echo $USER                   # username
echo $PWD                    # Current dir
echo $OLDPWD                 # Previous dir (cd -)
echo $SHELL                  # /bin/bash
echo $PATH                   # Search path
echo $HOSTNAME               # Hostname
echo $LANG                   # Language locale
echo $TERM                   # Terminal type
echo $RANDOM                 # Random number 0-32767
echo $LINENO                 # Line number current
echo $SECONDS                # Seconds since script start
echo $BASH_VERSION           # Bash version
```

Tự định nghĩa env variable:

```bash
export MY_VAR="value"

# Trong child process / script con
bash -c 'echo $MY_VAR'       # value (inherited)
```

`/etc/environment`, `~/.bashrc`, `~/.profile` chứa env vars set khi login.

## Decision making — `if`, `elif`, `else`

### Cú pháp

```bash
if [ condition ]; then
    # ...
elif [ other_condition ]; then
    # ...
else
    # ...
fi
```

### `[ ]` vs `[[ ]]` vs `(( ))`

| | `[ ]` (test) | `[[ ]]` (Bash) | `(( ))` (arithmetic) |
|---|---|---|---|
| POSIX | ✓ | ✗ (Bash extension) | ✗ |
| Glob (`*`) | ✗ | ✓ | ✗ |
| Regex (`=~`) | ✗ | ✓ | ✗ |
| Number compare | `-eq`, `-lt`... | `-eq` hoặc `(( ))` | `==`, `<`, ... |
| String compare | `=`, `!=` | `=`, `==`, `!=` | ✗ |
| Logic | `-a`, `-o` | `&&`, `||` | `&&`, `||` |

**Khuyến nghị**: dùng `[[ ]]` cho string/file test, `(( ))` cho number — modern Bash.

### String comparison

```bash
NAME="Alice"

if [[ "$NAME" == "Alice" ]]; then echo "Hi Alice"; fi
if [[ "$NAME" != "Bob" ]]; then echo "Not Bob"; fi
if [[ -z "$NAME" ]]; then echo "Empty"; fi
if [[ -n "$NAME" ]]; then echo "Non-empty"; fi

# Glob match
if [[ "$NAME" == A* ]]; then echo "Starts with A"; fi

# Regex match
if [[ "$NAME" =~ ^[A-Z][a-z]+$ ]]; then echo "Capitalized"; fi
```

### Number comparison

```bash
X=10
Y=20

# Modern: (( ))
if (( X < Y )); then echo "X < Y"; fi
if (( X * 2 == Y )); then echo "X doubled = Y"; fi

# Legacy: [ ] with operator
if [ $X -lt $Y ]; then echo "X < Y"; fi
if [ $X -eq 10 ]; then echo "X is 10"; fi
```

Operators:

| | Number | String |
|---|---|---|
| Equal | `-eq` / `==` | `==` / `=` |
| Not equal | `-ne` / `!=` | `!=` |
| Less | `-lt` / `<` | `<` (lex) |
| Greater | `-gt` / `>` | `>` (lex) |
| Less/Eq | `-le` / `<=` | |
| Greater/Eq | `-ge` / `>=` | |

### File test

```bash
if [ -f /etc/passwd ]; then echo "File exists"; fi
if [ -d /tmp ]; then echo "Dir exists"; fi
if [ -e /path ]; then echo "Exists (file or dir)"; fi
if [ -r file ]; then echo "Readable"; fi
if [ -w file ]; then echo "Writable"; fi
if [ -x file ]; then echo "Executable"; fi
if [ -s file ]; then echo "Size > 0"; fi
if [ -L link ]; then echo "Symlink"; fi
```

### Logic operators

```bash
# AND, OR
if [[ -f file1 && -f file2 ]]; then echo "Both"; fi
if [[ "$x" == "a" || "$x" == "b" ]]; then echo "a or b"; fi

# NOT
if [[ ! -f file ]]; then echo "Not exists"; fi

# Negation alternative
if ! command -v nginx &>/dev/null; then echo "nginx not installed"; fi
```

### Short-circuit evaluation

```bash
# Idiomatic Bash
[ -f config.yml ] && echo "exists" || echo "missing"

# Equivalent:
if [ -f config.yml ]; then echo "exists"; else echo "missing"; fi
```

> Cẩn thận với chain `cmd1 && cmd2 || cmd3` — nếu `cmd2` fail thì `cmd3` chạy → khác `if/else` thuần.

## `case` — switch alternative

```bash
case "$1" in
    start)
        echo "Starting..."
        ;;
    stop)
        echo "Stopping..."
        ;;
    restart|reload)
        echo "Restarting..."
        ;;
    status)
        echo "Status..."
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status}"
        exit 1
        ;;
esac
```

`*` = default catch-all. Mỗi case kết thúc `;;`.

Pattern matching glob:

```bash
case "$file" in
    *.tar.gz | *.tgz) tar -xzf "$file" ;;
    *.tar.bz2)        tar -xjf "$file" ;;
    *.zip)            unzip "$file" ;;
    *)                echo "Unknown format" ;;
esac
```

## Real-world example — service script

```bash
#!/bin/bash
#
# Usage: ./service.sh <action> <service-name>
#

set -euo pipefail

ACTION=${1:-help}
SERVICE=${2:-nginx}

usage() {
    cat <<EOF
Usage: $0 <action> [service-name]

Actions:
    start    Start service
    stop     Stop service
    restart  Restart service
    status   Show status
    help     Show this help

Default service: nginx
EOF
}

check_service() {
    if ! systemctl list-unit-files | grep -q "^${SERVICE}.service"; then
        echo "Error: Service '$SERVICE' not found" >&2
        exit 1
    fi
}

case "$ACTION" in
    start)
        check_service
        sudo systemctl start "$SERVICE"
        echo "Started $SERVICE"
        ;;
    stop)
        check_service
        sudo systemctl stop "$SERVICE"
        echo "Stopped $SERVICE"
        ;;
    restart)
        check_service
        sudo systemctl restart "$SERVICE"
        echo "Restarted $SERVICE"
        ;;
    status)
        check_service
        sudo systemctl status "$SERVICE" --no-pager
        ;;
    help|--help|-h)
        usage
        ;;
    *)
        echo "Unknown action: $ACTION" >&2
        usage >&2
        exit 1
        ;;
esac
```

## Monitor script — combine all

```bash
#!/bin/bash
#
# System monitoring script
#

set -euo pipefail

readonly THRESHOLD_CPU=${THRESHOLD_CPU:-80}
readonly THRESHOLD_MEM=${THRESHOLD_MEM:-80}
readonly THRESHOLD_DISK=${THRESHOLD_DISK:-90}

# CPU usage
CPU=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d. -f1)
if (( CPU > THRESHOLD_CPU )); then
    echo "WARNING: CPU usage ${CPU}% > ${THRESHOLD_CPU}%"
fi

# Memory usage
MEM=$(free | awk '/Mem:/ {printf "%.0f", $3/$2 * 100}')
if (( MEM > THRESHOLD_MEM )); then
    echo "WARNING: Memory usage ${MEM}% > ${THRESHOLD_MEM}%"
fi

# Disk usage
while IFS= read -r line; do
    USAGE=$(echo "$line" | awk '{print $5}' | tr -d '%')
    MOUNT=$(echo "$line" | awk '{print $6}')
    if (( USAGE > THRESHOLD_DISK )); then
        echo "WARNING: Disk $MOUNT usage ${USAGE}% > ${THRESHOLD_DISK}%"
    fi
done < <(df -h | grep -E '^/dev/' | grep -v 'tmpfs')

# Service check
SERVICES=("nginx" "mariadb" "memcached")
for svc in "${SERVICES[@]}"; do
    if systemctl is-active "$svc" &>/dev/null; then
        echo "OK: $svc is running"
    else
        echo "ERROR: $svc is NOT running"
    fi
done
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| `[ $a == $b ]` với value có space | Test fail | Quote: `[ "$a" == "$b" ]` |
| `[ $a -lt $b ]` với string | Error | Dùng `[[ ]]` hoặc check type |
| Quên `;` sau condition | Syntax error | `if cond; then` |
| `case` không có `*)` default | Silent failure | Always add default |
| Forget `;;` | Syntax error | Mỗi case kết thúc `;;` |
| `$@` không quote trong loop | Split lung tung | `"$@"` |
| `getopts` cho long flag | Không support | Manual parse hoặc Python |

## Quick reference

```text
$0 / $1 / $2          Script name / args
$@ / $*               All args
$#                    Count args
$?                    Last exit code
$$                    Script PID

[ -f file ]           File test
[ -d dir ]            Dir test
[ -z "$var" ]         Empty
[ -n "$var" ]         Non-empty

[[ "$a" == "b" ]]     String eq
[[ "$a" =~ regex ]]   Regex match
(( x < y ))           Number compare
[[ -f f1 && -f f2 ]]  AND
[[ ! -f f ]]          NOT

if [ ]; then ... fi
case "$x" in p1) ... ;; p2) ... ;; *) ... ;; esac

getopts "vf:" opt     Parse short flags
```

## Tóm tắt bài 3

- `$1`, `$@`, `$#` — positional args.
- **`"$@"`** trong loop = preserve word boundaries.
- **`getopts`** parse flag ngắn; long flag → Python.
- **`[[ ]]`** (Bash) > `[ ]` (POSIX) cho string/file/regex.
- **`(( ))`** cho arithmetic, number compare.
- **`case`** clean hơn nhiều if/elif cho switch.
- File test: `-f`, `-d`, `-r`, `-w`, `-x`, `-s`.

**Bài kế tiếp** → [Bài 4: Loops và functions](04-loops-functions.md)
