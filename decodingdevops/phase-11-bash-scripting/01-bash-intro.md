# Bài 1: Bash scripting — automation cấp 1 của DevOps

DevOps engineer **viết script mỗi ngày**: setup server, parse log, deploy, backup, monitor. Bash là ngôn ngữ script **mặc định trên Linux** — chạy mọi nơi.

## Vì sao Bash?

- Có sẵn mọi Linux distro (không cài).
- Tích hợp tốt với CLI tool (`grep`, `awk`, `sed`, `curl`).
- Pipe + redirection cực mạnh.
- Phù hợp script ngắn (< 200 dòng).

**Khi nào KHÔNG dùng Bash?**
- Script > 500 dòng → dùng Python/Go.
- Logic phức tạp (data structure, regex nâng cao) → Python.
- Cross-platform Windows → PowerShell.

Trong khoá này:
- Phase 11 (bài này): **Bash** cho script DevOps cơ bản.
- Phase 20: **Python** cho automation phức tạp.

## Shebang — báo cho OS chạy bằng interpreter nào

```bash
#!/bin/bash
echo "Hello"
```

`#!/bin/bash` ở dòng 1 = "chạy file này với /bin/bash".

Variants:
- `#!/bin/sh` — POSIX shell, portable nhưng yếu hơn bash.
- `#!/usr/bin/env bash` — tìm bash trong PATH (portable hơn `/bin/bash` fix).
- `#!/usr/bin/env python3` — script Python.

## Chạy script

```bash
# Cách 1: gọi interpreter explicit
bash script.sh

# Cách 2: make executable + chạy direct
chmod +x script.sh
./script.sh                     # Cần ./ vì pwd thường không trong PATH

# Cách 3: source (chạy trong shell hiện tại, không tạo subshell)
source script.sh
. script.sh                     # Tương đương
```

Khác nhau:
- `bash` / `./script` → tạo **subshell** mới. Variable không leak ra parent.
- `source` → chạy **trong shell hiện tại**. Variable persist.

## Script đầu tiên

```bash
#!/bin/bash
# my-first-script.sh
# Mô tả: greeting script

echo "Hello DevOps"
echo "Today is $(date)"
echo "I am $(whoami) on $(hostname)"
echo "Uptime:"
uptime
```

```bash
chmod +x my-first-script.sh
./my-first-script.sh
```

Output:

```text
Hello DevOps
Today is Mon May 31 10:30:00 UTC 2026
I am vagrant on web01
Uptime:
 10:30:00 up 2 days, 1 user, load average: 0.05, 0.10, 0.08
```

## Comments

```bash
# Single-line comment

: '
Multi-line
comment using
no-op : with heredoc
'
```

`:` là no-op builtin. Hack để có multi-line comment.

## Strict mode — best practice

```bash
#!/bin/bash
set -euo pipefail
IFS=$'\n\t'
```

| Flag | Tác dụng |
|---|---|
| `-e` | Exit khi command fail (exit code ≠ 0) |
| `-u` | Treat undefined variable as error |
| `-o pipefail` | Pipeline fail nếu bất kỳ stage nào fail |
| `IFS=$'\n\t'` | Internal Field Separator — chỉ tab + newline, không space |

Đây là **production-grade script template**. Mọi script DevOps nên bắt đầu thế này.

### Vì sao quan trọng?

Không có `set -e`:

```bash
#!/bin/bash
rm /important/data
echo "Đã backup"           # In dù rm fail!
```

Có `set -e`:

```bash
#!/bin/bash
set -e
rm /important/data
echo "Đã backup"           # Chỉ in nếu rm OK
```

Fail fast = an toàn hơn.

## Output: `echo`, `printf`

```bash
echo "Hello"
echo -n "No newline"
echo -e "Tab\there\nnewline"           # -e enable escape

printf "Name: %s, Age: %d\n" "Alice" 30
printf "Float: %.2f\n" 3.14159
```

`echo` nhanh, `printf` chính xác format.

## Exit code

Mỗi command exit với code 0-255:
- `0` = success.
- ≠ 0 = fail.

```bash
ls /nonexistent
echo $?                  # Exit code lệnh trước
# 2 (file not found)

ls /etc
echo $?
# 0
```

Trong script:

```bash
#!/bin/bash
some_command
if [ $? -ne 0 ]; then
    echo "Command failed"
    exit 1
fi
```

Idiomatic Bash:

```bash
#!/bin/bash
some_command || { echo "Command failed"; exit 1; }
```

## Debug script

```bash
# Chạy với debug output
bash -x script.sh

# Hoặc thêm vào script:
#!/bin/bash
set -x                    # Print mỗi command trước khi chạy
```

Output debug:

```text
+ x=5
+ echo 5
5
+ for i in 1 2 3
+ echo 1
1
```

Useful debug script với logic phức tạp.

## ShellCheck — linter cho Bash

```bash
sudo apt install -y shellcheck

shellcheck script.sh
```

Check:
- Syntax error.
- Common pitfalls (`$var` không quote, `[ ]` vs `[[ ]]`).
- Best practice.

Tích hợp pre-commit hook:

```yaml
- repo: https://github.com/koalaman/shellcheck-precommit
  rev: v0.9.0
  hooks:
    - id: shellcheck
```

## Cấu trúc script chuẩn

```bash
#!/bin/bash
#
# Description: Backup MySQL database to S3
# Usage: ./backup.sh <db-name>
# Author: DevOps team
# Created: 2026-01-15
#

set -euo pipefail
IFS=$'\n\t'

# === Config ===
BACKUP_DIR="/var/backup"
S3_BUCKET="acme-backups"
DATE=$(date +%Y-%m-%d_%H-%M-%S)

# === Functions ===
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

cleanup() {
    log "Cleaning up..."
    rm -f /tmp/dump-*.sql
}

# Trap on exit
trap cleanup EXIT

# === Main ===
main() {
    local db_name="$1"

    log "Starting backup of $db_name"

    mysqldump -u root -p"$MYSQL_PASS" "$db_name" > /tmp/dump-$DATE.sql
    log "Dump complete"

    aws s3 cp /tmp/dump-$DATE.sql "s3://$S3_BUCKET/$db_name/$DATE.sql"
    log "Upload complete"
}

# Entry point
if [ $# -lt 1 ]; then
    echo "Usage: $0 <db-name>"
    exit 1
fi

main "$@"
```

Pattern này = production-grade.

## VS Code setup

Cài extension:
- **Bash IDE** (mads-hartmann) — autocomplete, lint.
- **shell-format** — auto format.

Settings.json:

```json
{
  "[shellscript]": {
    "editor.defaultFormatter": "foxundermoon.shell-format",
    "editor.formatOnSave": true
  }
}
```

## Khi nào dùng Python thay Bash?

Migrate từ Bash → Python khi:
- Cần parse JSON/YAML.
- Logic > 200 dòng.
- Cần regex phức tạp.
- Network call REST API.
- Concurrency / parallel.
- Đối tượng-oriented logic.

Phase 20 sẽ migrate vài script từ Bash → Python.

## Bash cheatsheet đầu

```bash
# Variable
NAME="value"
echo "$NAME"

# Math
result=$((5 + 3))

# Command substitution
DATE=$(date +%F)

# Test condition
if [ "$x" -eq 5 ]; then ...; fi

# Loop
for i in 1 2 3; do echo $i; done
while [ $x -lt 10 ]; do x=$((x+1)); done

# Function
my_func() {
    echo "Args: $@"
}

# Exit
exit 0
```

Sẽ học sâu các bài kế.

## Bẫy thường gặp

| Bẫy | Lý do | Giải pháp |
|---|---|---|
| Space quanh `=` | Bash quirk | `x=5` không `x = 5` |
| Quên `chmod +x` | "Permission denied" | `chmod +x script.sh` |
| Shebang trên dòng 2 | Không hiệu lực | Phải dòng 1 |
| `bash` script không có `#!/bin/bash` | Hệ thống chạy bằng sh | Luôn shebang |
| Quên `set -euo pipefail` | Script "thầm fail" | Pattern chuẩn |
| Path relative trong cron | Không tìm thấy file | Absolute path |
| Không quote variable | Space trong giá trị break | `"$var"` luôn quote |
| Forget exit code | Caller không biết fail | `exit 1` rõ ràng |

## Quick reference

```text
#!/bin/bash              Shebang
set -euo pipefail        Strict mode
echo / printf            Output
$?                       Exit code lệnh trước
$(cmd)                   Command substitution
"$var"                   Quoted variable (recommend)
chmod +x                 Make executable
shellcheck file.sh       Lint
bash -x file.sh          Debug
source file.sh           Run in current shell
exit N                   Exit with code N
```

## Tóm tắt bài 1

- Bash = ngôn ngữ script mặc định trên Linux.
- **Shebang `#!/bin/bash`** dòng 1.
- **Strict mode** `set -euo pipefail` = production standard.
- Chạy: `bash script.sh`, `./script.sh` (chmod +x), `source script.sh`.
- `$?` = exit code lệnh trước.
- **`shellcheck`** = lint must-have.
- Script > 200 dòng → migrate Python.

**Bài kế tiếp** → [Bài 2: Variables, quotes, command substitution](02-variables-quotes.md)
