# Bài 1: Claude Code — Setup, History, CLI fundamentals

Tháng 2/2025, Anthropic ra mắt **Claude Code** — initially một "side project" cho team nội bộ. Họ public free, không nghĩ ai sẽ dùng. Trong vòng 3 tháng, nó trở thành **CLI agent tool dùng phổ biến nhất** trong industry. Tại sao? Vì terminal là **substrate cũ nhưng đúng** cho agent: stream, scriptable, ít overhead. Bài này: history, cài đặt, first session.

## Lịch sử Claude Code

```text
[Feb 2025] Anthropic release Claude Code
- Goal ban đầu: internal tool cho engineering team
- Surface: CLI (controversial — VS Code era)
- Model: Claude Sonnet 3.5 → 3.7 → 4 → 4.5

[Mar 2025] Bùng nổ
- Twitter demo viral
- "Why is everyone using terminal again?"

[Apr-Jun 2025] Inflection
- MCP standard launched
- Skills marketplace
- Plugins ecosystem

[Late 2025] Industry standard
- Cursor CLI ra đời (copy approach)
- Codex CLI, Gemini CLI ra đời
- Sprites.dev cloud Claude Code

[2026] Vẫn dẫn đầu CLI surface
- Sub-agents stable
- Multi-agent orchestration
- Enterprise tier with audit
```

→ Claude Code chứng minh: **CLI là substrate đúng** cho agent. IDE quá nặng.

## Tại sao CLI thắng?

```text
[IDE problems for agent loop]
- Heavy UI render
- Need user click to confirm
- File open/close in panes confusing for agent
- Hard to script
- High RAM

[CLI advantages]
- Stream-native output
- Tool result is just text
- Bash composability
- Scriptable (CI/CD, cron)
- Lightweight (any SSH session)
- Familiar to senior engineers
```

→ Senior engineer feels "at home". Junior engineer learns Unix.

## Cài đặt

```bash
# Mac / Linux
curl -fsSL https://claude.ai/install.sh | sh

# Hoặc npm
npm install -g @anthropic-ai/claude-code

# Verify
claude --version
# Claude Code 1.x.x

# First time setup
claude
# → Opens browser → sign in Anthropic
# → API key fetched, stored ~/.claude/config.json
```

Pricing:
- **Pro $20/mo** — 5x Sonnet usage, 5h reset.
- **Max $100/mo** — 20x usage, ideal heavy user.
- **Pay-as-you-go** — API key direct, count per token.

Most agentic coders end up on Max plan ($100). Cost-effective vs token billing.

## First session

```bash
cd /path/to/project
claude
```

Welcome banner. Cursor in prompt:
```text
╭──────────────────────────────────────╮
│  Claude Code v1.x                    │
│  Working in: /path/to/project        │
│  Model: claude-sonnet-4-5            │
╰──────────────────────────────────────╯

>
```

First message:
```text
> what is this project?

Claude reads README.md, package.json, key files.
Returns summary.
```

→ Agent automatically does discovery. Không cần pre-load context.

## Anatomy của session

```text
[User message]            ← bạn type
       ↓
[LLM call]               ← Anthropic API
       ↓
[Tool use]               ← Read, Edit, Bash, Grep, ...
       ↓
[Tool result]
       ↓
[LLM call again]
       ↓
[More tools or final response]
       ↓
[Agent stops, wait next input]
```

Mỗi turn = LLM → tools → result → ... → text answer.

## CLI commands quan trọng

### Slash commands (trong session)

```text
/help              — list commands
/clear             — clear conversation history
/compact           — summarize + free context
/init              — generate CLAUDE.md
/model             — switch model (sonnet, opus, haiku)
/permissions       — view/edit permissions
/mcp               — manage MCP servers
/agents            — manage subagents (Phase 7)
/cost              — view current session cost
/exit              — quit
```

### Keyboard shortcuts

```text
Ctrl+C             — cancel current operation
Ctrl+D             — exit session
Ctrl+R             — search history
Esc Esc            — rewind (Phase 4 bài 2)
Shift+Tab          — toggle YOLO mode
@                  — file mention picker
```

### CLI flags

```bash
claude                              # interactive
claude "fix the typo in README"     # one-shot
claude -p "summarize"              # print (non-interactive)
claude --model opus                 # specific model
claude --dangerously-skip-permissions  # YOLO
claude --resume                     # continue last session
claude --continue                   # alias --resume
```

## CLAUDE.md — Project memory

```bash
# In project root
claude
> /init
```

Claude generate `CLAUDE.md` từ exploration codebase. Sample:

```markdown
# Project: My App

## Tech stack
- Next.js 15 + TypeScript
- Postgres + Prisma
- Tailwind + shadcn

## Commands
- pnpm dev
- pnpm test
- pnpm lint

## Architecture
- /app — pages
- /lib — utilities + API client
- /components — reusable UI
- /prisma — schema

## Conventions
- Server components by default
- Forms with react-hook-form + zod
```

→ Edit thêm conventions, don'ts, gotchas. Save.

Mỗi session sau, Claude đọc `CLAUDE.md` đầu tiên. Auto-context.

## Hierarchy CLAUDE.md

```text
~/.claude/CLAUDE.md          — Global rules (your preferences)
$HOME/projects/CLAUDE.md     — Workspace rules
$PROJECT/CLAUDE.md           — Project rules (highest specificity)
```

Claude merge tất cả. Global rules áp mọi project, project rules override.

Pattern:
- Global: "Always use TypeScript strict mode" — your preferences.
- Project: "Use Prisma, not SQLAlchemy" — project specifics.

## Session management

```bash
# List recent sessions
claude --resume
# UI shows last 10 sessions, pick

# Continue most recent
claude --continue

# Start fresh
claude
```

Sessions saved auto in `~/.claude/sessions/`. Resume = load history vào context.

Nhược điểm: long sessions tốn nhiều token. Pattern: 1 task = 1 session, finish + `/exit`.

## Cost tracking

```text
> /cost

Session stats:
- Input tokens:  45,231
- Output tokens: 8,420
- Cost: $0.27
- Model: claude-sonnet-4-5
- Duration: 12 min
- Tools called: 28
```

Daily/monthly tracking:
```bash
claude --cost-summary --range 30d
```

→ Identify cost spike: thường là quá nhiều file đọc vào context.

## First task — Try it

```bash
cd ~/my-test-project
claude

> /init
[Claude generates CLAUDE.md]

> What does this project do?
[Claude reads, summarizes]

> Add a hello endpoint at GET /hello returning {message: "hi"}
[Claude finds route file, adds endpoint]

> Test it
[Claude runs test, shows output]

> /cost
[Shows ~$0.05]

> /exit
```

→ 5 phút, có endpoint mới, test pass.

## So sánh Claude Code với Cursor

| Tiêu chí | Claude Code (CLI) | Cursor (IDE) |
|---|---|---|
| Surface | Terminal | GUI editor |
| Multi-file | Yes (Read, Edit tools) | Yes (Composer) |
| Visual diff | git diff | Inline UI |
| YOLO mode | `--dangerously-skip-permissions` | Settings toggle |
| Scriptable | Native (CLI = script) | Cursor CLI emerging |
| Headless | Yes | Yes (newer) |
| RAM | < 100MB | 2-4GB |
| Plugin ecosystem | MCP + Skills + Plugins | Cursor extensions |
| Cost | $20-100/mo or token | $20/mo |
| Learning curve | Steeper (CLI) | Easier (IDE) |

→ Different surface, different strength. Many use both.

## Bẫy phổ biến với Claude Code

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Không có CLAUDE.md | Re-discover mỗi session | `/init` từ ngày 1 |
| Long-running session | Token tăng dần | 1 task = 1 session, /exit |
| Quên `/clear` giữa task | Context nhiễu | Clear or new session |
| Resume nhầm session | Mix context | Verify trước resume |
| Trust mọi tool call | Bug | Review diff |
| YOLO trên host | rm -rf risk | Container |
| Quên `/cost` check | Bill shock | Monitor weekly |
| Hard-paste sensitive trong prompt | Log → leak | Sanitize |

## Tóm tắt bài 1

- Claude Code = CLI agent tool từ Anthropic, ra Feb 2025.
- Reason CLI wins: stream native, lightweight, scriptable, senior-friendly.
- Cài: `curl ... | sh` hoặc `npm install -g @anthropic-ai/claude-code`.
- Pricing: Pro $20, Max $100 (heavy user sweet spot), pay-as-you-go API.
- Slash commands: `/init`, `/clear`, `/compact`, `/model`, `/cost`, `/exit`.
- Keyboard: Esc Esc rewind, Shift+Tab YOLO, @ file mention.
- **CLAUDE.md hierarchy**: global (~/.claude) > workspace > project.
- 1 task = 1 session. Resume tốt cho continue, không tốt cho different task.
- `/cost` check thường xuyên.

**Bài kế tiếp** → [Bài 2: Sessions, Checkpoints, Rewind](02-sessions-checkpoints.md)
