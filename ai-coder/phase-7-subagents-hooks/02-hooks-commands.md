# Bài 2: Hooks + Custom Slash Commands — Event-driven control

**Hooks** = shell scripts Claude Code chạy **trước/sau** từng event (tool use, response, session start). Cho phép enforce policy: block PR mở khi test fail, auto-format sau Edit, audit log mỗi shell command. Combined với **custom slash commands**, đây là cách bạn build **team-grade safety net** trên Claude Code.

## Lifecycle events

```text
[Session start]
   ↓
sessionStart hook
   ↓
[User message]
   ↓
userPromptSubmit hook
   ↓
[Agent thinking]
   ↓
preToolUse hook  ← per tool
   ↓
[Tool execution]
   ↓
postToolUse hook
   ↓
[Agent thinking continues]
   ↓
...
   ↓
[Final response]
   ↓
stop hook
```

Hook = shell script. Returns exit 0 = allow, non-zero = block.

## settings.json hook config

```json
// ~/.claude/settings.json (global)
// or .claude/settings.json (project)
{
  "hooks": {
    "preToolUse": {
      "Bash": ["~/.claude/hooks/audit-bash.sh"],
      "Edit": ["~/.claude/hooks/check-protected-files.sh"],
      "github.create_pull_request": ["~/.claude/hooks/verify-tests-pass.sh"]
    },
    "postToolUse": {
      "Edit": ["~/.claude/hooks/auto-format.sh"],
      "Write": ["~/.claude/hooks/auto-format.sh"]
    },
    "sessionStart": ["~/.claude/hooks/notify-start.sh"],
    "stop": ["~/.claude/hooks/log-session.sh"]
  }
}
```

## Hook input — Environment variables

Claude Code passes context as env vars:
```bash
#!/bin/bash
# Available env vars per hook type:

# preToolUse:
#   CLAUDE_TOOL_NAME = "Bash"
#   CLAUDE_TOOL_INPUT = JSON of params (stdin)
#   CLAUDE_SESSION_ID = uuid

# postToolUse:
#   CLAUDE_TOOL_NAME
#   CLAUDE_TOOL_OUTPUT = result (stdin)
#   CLAUDE_TOOL_EXIT_CODE
```

Or read via stdin (recommended for JSON inputs).

## Pattern 1: Block dangerous Bash

```bash
#!/bin/bash
# ~/.claude/hooks/check-bash-safety.sh

INPUT=$(cat)  # JSON of tool params
CMD=$(echo "$INPUT" | jq -r '.command')

# Block destructive on production paths
if echo "$CMD" | grep -qE "(rm\s+-rf\s+/|rm\s+-rf\s+\$HOME|git\s+push\s+--force)"; then
    echo "❌ Blocked: dangerous command: $CMD" >&2
    exit 1
fi

# Block sudo
if echo "$CMD" | grep -qE "^\s*sudo"; then
    echo "❌ Blocked: sudo not allowed" >&2
    exit 1
fi

exit 0
```

Wire:
```json
{
  "hooks": {
    "preToolUse": {
      "Bash": ["~/.claude/hooks/check-bash-safety.sh"]
    }
  }
}
```

→ Even YOLO mode can't run `rm -rf /`. Safety net.

## Pattern 2: Auto-format after edit

```bash
#!/bin/bash
# ~/.claude/hooks/auto-format.sh

INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.file_path')

case "$FILE" in
  *.py)
    ruff format "$FILE" 2>/dev/null
    ;;
  *.ts|*.tsx|*.js|*.jsx)
    prettier --write "$FILE" 2>/dev/null
    ;;
  *.go)
    gofmt -w "$FILE" 2>/dev/null
    ;;
esac

exit 0  # never block
```

→ Agent edits → auto-format. Codebase consistent.

## Pattern 3: Verify tests before PR

```bash
#!/bin/bash
# ~/.claude/hooks/verify-tests-pass.sh

# Only for create_pull_request tool
if [ "$CLAUDE_TOOL_NAME" != "github.create_pull_request" ]; then
    exit 0
fi

# Run tests
if [ -f "package.json" ]; then
    pnpm test --silent || {
        echo "❌ Tests failing. Cannot open PR."
        exit 1
    }
fi

if [ -f "pyproject.toml" ]; then
    pytest -q || {
        echo "❌ Tests failing. Cannot open PR."
        exit 1
    }
fi

exit 0
```

→ Agent can't open PR with broken tests. Quality gate.

## Pattern 4: Audit log

```bash
#!/bin/bash
# ~/.claude/hooks/audit.sh

LOG=~/.claude/audit.log
INPUT=$(cat)
NOW=$(date -Iseconds)

echo "{\"time\":\"$NOW\",\"session\":\"$CLAUDE_SESSION_ID\",\"tool\":\"$CLAUDE_TOOL_NAME\",\"input\":$INPUT}" >> "$LOG"

exit 0
```

→ Forensic log. SOC2 compliance.

## Pattern 5: Protected files

```bash
#!/bin/bash
# ~/.claude/hooks/protect-files.sh

INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.file_path')

PROTECTED=(
    ".env.production"
    "secrets/*"
    "ci-credentials.json"
    "*.pem"
)

for pattern in "${PROTECTED[@]}"; do
    if [[ "$FILE" == $pattern ]]; then
        echo "❌ Cannot edit protected file: $FILE"
        exit 1
    fi
done

exit 0
```

→ Even with YOLO + write tools, agent can't touch protected files.

## Pattern 6: Slack notification on session

```bash
#!/bin/bash
# ~/.claude/hooks/notify-session-start.sh

USER=$(whoami)
HOST=$(hostname)
DIR=$(pwd)

curl -s -X POST $SLACK_WEBHOOK_URL \
  -H "Content-Type: application/json" \
  -d "{\"text\":\"🤖 Claude Code started by $USER@$HOST in $DIR\"}" \
  > /dev/null

exit 0
```

→ Team knows when agent is running. Coordination.

## Custom slash commands deep dive

`.claude/commands/<name>.md` (project) or `~/.claude/commands/<name>.md` (global):

```markdown
---
name: ship
description: Run all checks and create PR
arguments:
  - name: title
    required: true
    description: PR title
---

# Ship command

Performing pre-flight checks for "{title}":

1. **Tests** — Run all tests
   - Bash: pnpm test
   - Bash: cd backend && pytest

2. **Lint** — Verify clean
   - Bash: pnpm lint
   - Bash: ruff check backend

3. **Type check**
   - Bash: pnpm typecheck

4. **Branch check** — Not main/master
   - Bash: git branch --show-current

5. **Stage + commit**
   - Bash: git add -A
   - Bash: git diff --staged --stat
   - Bash: git commit -m "{title}"

6. **Push**
   - Bash: git push -u origin HEAD

7. **Open PR**
   - github.create_pull_request:
     - title: {title}
     - body: Auto-generated from commit messages
     - base: main

Report URL of PR at end.
```

Use:
```text
> /ship "feat(auth): add OAuth support"
[All 7 steps execute]
```

## Slash command with subagent

```markdown
---
name: deep-review
description: Run code-reviewer subagent on current PR
---

# Deep review

1. Get current branch: git branch --show-current
2. Get diff vs main: git diff main..HEAD
3. Spawn code-reviewer subagent with diff
4. Format findings as Markdown checklist
5. Post as PR review comment if PR exists
```

→ `/deep-review` triggers Opus-backed reviewer.

## Multi-arg slash command

```markdown
---
name: scaffold-page
description: Create Next.js page with form + API
arguments:
  - name: name
    required: true
    description: Page slug (kebab-case)
  - name: form_fields
    required: true
    description: Comma-separated fields (e.g. "name:text,email:email")
---

# Scaffold page

Create page "/{name}" with form fields: {form_fields}

1. Parse form_fields into zod schema
2. Create app/{name}/page.tsx — server component
3. Create app/{name}/_components/{Name}Form.tsx — client form
4. Create app/api/{name}/route.ts — POST handler
5. Add unit test
6. Add e2e test
7. Verify with pnpm build
```

Use:
```text
> /scaffold-page contact "name:text,email:email,message:textarea"
```

## Conditional hooks (advanced)

```bash
#!/bin/bash
# ~/.claude/hooks/conditional.sh

# Only check on Mondays
if [ "$(date +%u)" = "1" ]; then
    echo "ℹ️ Monday — extra strict checks"
    pnpm test:e2e || exit 1
fi

exit 0
```

Or:
```bash
# Only block in production directories
if [[ "$(pwd)" == */production* ]]; then
    # Strict
    [ "$CLAUDE_TOOL_NAME" = "Bash" ] && exit 1
fi
exit 0
```

## Hook chaining

```json
{
  "hooks": {
    "preToolUse": {
      "Bash": [
        "~/.claude/hooks/check-bash-safety.sh",
        "~/.claude/hooks/audit.sh",
        "~/.claude/hooks/team-policy.sh"
      ]
    }
  }
}
```

→ Runs each in order. Any non-zero blocks.

## Debug hooks

```bash
# Test hook standalone
echo '{"command":"rm -rf /"}' | ~/.claude/hooks/check-bash-safety.sh
# Should print "Blocked" + exit 1

# Verbose in Claude Code
claude --debug
# Shows hook stdout/stderr in trace
```

## Project vs global

```text
[Global] ~/.claude/settings.json + ~/.claude/hooks/
- Personal preferences
- Safety nets applying everywhere

[Project] .claude/settings.json + .claude/hooks/
- Team policy
- Per-repo conventions
- Commits in repo
```

Project overrides global where conflict.

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Hook exits non-zero by mistake | Blocks every tool | Test hook standalone first |
| Hook slow | Agent slow | Run async or skip non-critical |
| Hook reads stdin twice | Empty | Read once into var |
| Hook missing executable bit | Silent ignore | chmod +x |
| Hook absolute path missing | Not found | Use ~ or full path |
| Forget restart Claude Code | Old config | Restart after config change |
| Hook calls external API in sync | Blocking | Background or cache |
| Hook log to stdout interferes | Agent confused | Log to file, not stdout |

## Tóm tắt bài 2

- **Hooks** = scripts triggered on Claude Code lifecycle events.
- Events: sessionStart, userPromptSubmit, preToolUse, postToolUse, stop.
- Config in `settings.json` per project/global.
- Patterns:
  - Block dangerous Bash
  - Auto-format after Edit
  - Verify tests before PR creation
  - Audit log (compliance)
  - Protect files
  - Slack notification
- **Custom slash commands** = template + args = repeatable workflow.
- Can call subagent in slash command.
- Hook chaining: array of hooks, all must pass.
- Project hooks commit to repo for team safety net.

🎉 **Hoàn thành Phase 7** — subagents + hooks + commands = team-grade Claude Code. Phase 8 vào cloud + remote execution.

**Bài kế tiếp** → [Phase 8 - Bài 1: Cloud sandboxes — Sprites.dev + alternatives](../phase-8-cloud-remote/01-cloud-sandboxes.md)
