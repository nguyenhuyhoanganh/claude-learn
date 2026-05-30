# Bài 2: Variables, quotes và command substitution

3 khái niệm dùng mỗi script: định nghĩa variable, quote đúng, embed command output.

## Variable trong Bash

```bash
# Định nghĩa
NAME="Alice"
AGE=30
SERVER="web01.acme.com"

# Đọc
echo $NAME
echo "$NAME"             # Quote (recommend)
echo "${NAME}"            # Với brace (rõ ràng nhất)

# Embed trong string
echo "Hello $NAME, you are $AGE"
echo "Server: ${SERVER}"
```

**Quy tắc**:
- **Không space** quanh `=`: `NAME="Alice"`, không `NAME = "Alice"`.
- **Đọc** dùng `$NAME` hoặc `${NAME}`.
- **Quote** giá trị khi assign nếu có space: `MSG="hello world"`.

### Brace giúp khi nào?

```bash
NAME="Alice"
echo "$NAME_lastname"     # Bash tìm biến NAME_lastname (không có)
echo "${NAME}_lastname"   # Đúng: Alice_lastname
```

`${VAR}` tách rõ tên biến với text xung quanh.

## Naming convention

```bash
# Local variable trong script: lowercase
counter=0
file_path="/tmp/log"

# Environment / global / readonly: UPPERCASE
export DATABASE_URL="postgres://..."
readonly MAX_RETRIES=5

# Vd:
APP_NAME="vprofile"
db_count=0
```

Convention DevOps: `UPPER_SNAKE_CASE` cho env/global, `lower_snake_case` cho local.

## Read-only variable

```bash
readonly MAX=100
MAX=200                  # ERROR: readonly variable
```

Dùng cho constant — tránh accidental modify.

## Special characters trong giá trị

```bash
PATH_VAR=/home/user                    # OK (no space)
GREETING="Hello world"                  # OK với quote
PATTERN='$1'                            # Single quote: literal $1
JSON='{"key": "value"}'                 # Single quote tránh expansion
```

## Quoting — 3 loại

| Loại | Behavior |
|---|---|
| `"..."` | **Soft quote**: expand `$var`, `$(...)`, `\` escape |
| `'...'` | **Hard quote**: literal mọi thứ, không expand |
| `\` | Escape 1 ký tự |

### Examples

```bash
NAME="Alice"

# Double quote: $ expand
echo "Hello $NAME"           # Hello Alice
echo "Time: $(date)"         # Time: Mon May 31 ...

# Single quote: literal
echo 'Hello $NAME'           # Hello $NAME

# Escape
echo "Cost: \$100"           # Cost: $100
echo "Path: C:\\Users"       # Path: C:\Users
```

### Quote rule of thumb

```bash
# RECOMMEND: luôn quote khi đọc variable
cp "$source" "$dest"

# Hậu quả không quote:
SOURCE="/path with space/file.txt"
cp $SOURCE /tmp/                # Bash split: cp /path with space/file.txt /tmp/
                                # → 4 arguments! cp confused
cp "$SOURCE" /tmp/              # cp '/path with space/file.txt' /tmp/  ← Đúng
```

> **Always quote `"$var"`** trừ khi cần explicit word splitting.

## Command substitution — chèn output lệnh vào variable

```bash
# Modern syntax (recommend)
DATE=$(date +%Y-%m-%d)
COUNT=$(ls /tmp | wc -l)
HOSTNAME=$(hostname)
USERS=$(who | wc -l)

# Legacy backtick (cũ, tránh dùng)
DATE=`date +%Y-%m-%d`
```

### Embed trong string

```bash
echo "Today is $(date +%A)"
# Today is Monday

LOG="/var/log/app-$(date +%F).log"
echo "Log file: $LOG"
# Log file: /var/log/app-2026-05-31.log
```

### Nested

```bash
BACKUP_NAME="backup-$(date +%Y-%m-%d_%H-%M-%S)-$(hostname).tar.gz"
echo $BACKUP_NAME
# backup-2026-05-31_14-30-15-web01.tar.gz
```

## Arithmetic

```bash
# $(( ))
x=$(( 5 + 3 ))
y=$(( $x * 2 ))           # 16
z=$(( y / 3 ))            # 5 (integer division)

# ((  )) — không cần $
((counter++))
((total += 10))

# Hoặc let
let x=5+3

# Hoặc expr (legacy)
y=$(expr 5 + 3)
```

Modern Bash: dùng `$(( ))` cho biểu thức, `(( ))` cho assignment.

### Operators

```text
+ - * /          Cơ bản
%                Modulo
**               Exponent
++ --            Increment/decrement
== !=            Equality (số)
< > <= >=        So sánh
&& ||            Logic
&  |  ^  ~       Bitwise
```

## String operations

```bash
STR="Hello DevOps"

# Length
echo ${#STR}                          # 12

# Substring (offset, length)
echo ${STR:6}                         # DevOps (từ index 6)
echo ${STR:0:5}                       # Hello
echo ${STR: -6}                       # DevOps (negative, lấy cuối) — space trước -

# Replace
echo ${STR/DevOps/SRE}                # Hello SRE (lần đầu)
echo ${STR//l/L}                      # HeLLo DevOps (mọi lần)

# Uppercase / lowercase
echo ${STR^^}                         # HELLO DEVOPS
echo ${STR,,}                         # hello devops

# Default value (nếu var unset/empty)
echo ${UNSET_VAR:-default}            # default
echo ${EMPTY_VAR:-fallback}           # fallback

# Assign default + return
echo ${VAR:=default}                  # Set VAR = default nếu chưa có

# Error if unset
echo ${MUST_HAVE:?Required variable}  # Exit script với error

# Length check
if [ -z "$VAR" ]; then echo "empty"; fi
if [ -n "$VAR" ]; then echo "not empty"; fi
```

## Array

Bash 4+ có indexed array và associative array.

### Indexed array

```bash
TOOLS=("git" "docker" "k8s" "terraform")

echo ${TOOLS[0]}                      # git
echo ${TOOLS[1]}                      # docker
echo ${TOOLS[@]}                      # all elements
echo ${TOOLS[*]}                      # all (different word splitting)
echo ${#TOOLS[@]}                     # length: 4

# Append
TOOLS+=("ansible")

# Iterate
for t in "${TOOLS[@]}"; do
    echo "Tool: $t"
done

# Index
for i in "${!TOOLS[@]}"; do
    echo "$i: ${TOOLS[$i]}"
done
```

### Associative array (Bash 4+)

```bash
declare -A SERVERS
SERVERS[web]="192.168.1.10"
SERVERS[db]="192.168.1.20"
SERVERS[cache]="192.168.1.30"

echo ${SERVERS[web]}                  # 192.168.1.10
echo ${!SERVERS[@]}                   # Keys: web db cache
echo ${SERVERS[@]}                    # Values

for key in "${!SERVERS[@]}"; do
    echo "$key → ${SERVERS[$key]}"
done
```

Bash array hạn chế hơn Python list. Phức tạp → Python.

## Read user input

```bash
read -p "Enter your name: " NAME
echo "Hello $NAME"

# Silent (cho password)
read -sp "Password: " PASS
echo
echo "Got password (length ${#PASS})"

# Timeout
read -t 5 -p "Quick! " ANSWER

# Default value
read -p "Continue? [y/N]: " CHOICE
CHOICE=${CHOICE:-N}
```

## Heredoc

Multi-line string vào command/variable:

```bash
# Vào command (cat, mysql, ssh)
cat > /tmp/config.conf <<EOF
[server]
host=localhost
port=8080
log_level=info
EOF

# Vào variable
MSG=$(cat <<EOF
Multi-line
message here
EOF
)
echo "$MSG"

# Với expansion (default)
NAME="Alice"
cat <<EOF
Hello $NAME
EOF
# Hello Alice

# Không expansion (single quote heredoc tag)
cat <<'EOF'
Hello $NAME
EOF
# Hello $NAME

# Strip leading tab (with -)
cat <<-EOF
	tab indented
	text here
EOF
```

## Here string

```bash
grep "error" <<< "this is an error message"
# = echo "this is an error message" | grep "error"
```

## Combine: real script

```bash
#!/bin/bash
set -euo pipefail

# Config
readonly LOG_DIR="/var/log/myapp"
readonly DATE=$(date +%F)
readonly BACKUP_FILE="${LOG_DIR}/backup-${DATE}.tar.gz"
readonly HOSTNAME=$(hostname)
readonly DEFAULT_RETENTION=${RETENTION:-7}

# Read confirmation
read -p "Backup ${HOSTNAME} to ${BACKUP_FILE}? [y/N]: " choice
choice=${choice:-N}

if [ "${choice,,}" != "y" ]; then
    echo "Cancelled"
    exit 0
fi

# Backup
echo "Starting backup at $(date)"
tar -czf "$BACKUP_FILE" /etc /opt /home
echo "Backup size: $(du -sh "$BACKUP_FILE" | cut -f1)"

# Cleanup old (> retention days)
find "$LOG_DIR" -name "backup-*.tar.gz" -mtime +"$DEFAULT_RETENTION" -delete

echo "Done"
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Quên `"$var"` | Word splitting với space | Luôn quote |
| Single quote tưởng expand | `$var` literal | Dùng double quote |
| `=` có space | Bash hiểu là command + arg | `var="value"` |
| Backtick legacy | Khó nest | Dùng `$(cmd)` |
| Arithmetic không `$(( ))` | Treat as string | `x=$(( 5+3 ))` |
| `${VAR:-default}` vs `${VAR-default}` | Khác behavior với empty vs unset | Dùng `:-` để cover cả 2 |
| Heredoc indent với tab | Phải `<<-` để strip | Dùng explicit |

## Quick reference

```text
var="value"               Assign (no space)
$var / "${var}"           Read
${var:-default}           Default if unset
${var:?error}             Exit if unset
${#var}                   Length
${var:0:5}                Substring
${var/old/new}            Replace once
${var//old/new}           Replace all
${var^^} / ${var,,}       Upper/lower

$(cmd)                    Command substitution
$(( 5+3 ))                Arithmetic
((counter++))             Increment

readonly VAR              Const
declare -A arr            Associative array
arr=(a b c)               Indexed array
${arr[@]}                 All elements
"${arr[@]}"               Quoted all (recommend)

read -p "Q: " var         User input
read -s var               Silent (password)

cat <<EOF ... EOF         Heredoc (expand)
cat <<'EOF' ... EOF       Heredoc (literal)
```

## Tóm tắt bài 2

- Variable: `NAME="value"` (no space), `"$NAME"` (quote luôn).
- 3 quote levels: `"..."` expand, `'...'` literal, `\` escape.
- **Command substitution**: `$(cmd)` — modern, nestable.
- **Arithmetic**: `$(( expr ))`, `(( var++ ))`.
- String ops: `${#var}`, `${var:offset:len}`, `${var/old/new}`, `${var:-default}`.
- **Array**: `arr=(a b c)` indexed, `declare -A` associative.
- **Heredoc**: `<<EOF` multi-line string.
- **`read -p`** user input.

**Bài kế tiếp** → [Bài 3: Command-line arguments, decision making](03-args-decision.md)
