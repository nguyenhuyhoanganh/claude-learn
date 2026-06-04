# Bài 1: YOLO Mode + OpenRouter — Responsible autonomous coding

YOLO mode ("You Only Live Once" — bypass permissions) là **superpower của agentic coder**: agent chạy autonomous, không hỏi từng tool, hoàn thành task 5-10x nhanh hơn. Nhưng cũng là cách nhanh nhất để `rm -rf /` nhầm. Bài này dạy **YOLO an toàn**: container/sandbox, OpenRouter routing, safety pattern Karpathy + community đã đúc kết.

## YOLO mode là gì?

```text
[Safe mode default]
Agent: "Run npm install?"
User: [click Allow]
Agent: runs
Agent: "Run rm node_modules?"
User: [click Allow]
Agent: runs
... (mỗi tool destructive cần confirm)

[YOLO mode]
Agent: "I'll install deps, restructure, run tests"
[Auto-execute everything]
Done. Bạn review final diff.
```

5-10x throughput. Trade-off: rủi ro `rm -rf`, `git push --force`, expose secret.

## Bật YOLO trên các tool

### Claude Code

```bash
claude --dangerously-skip-permissions
# Aliased commonly as:
alias yolo="claude --dangerously-skip-permissions"
```

→ Skip mọi permission prompt. **Đặt tên dangerously-skip-permissions** là intent — Anthropic muốn bạn nhận thức nguy hiểm.

### Cursor

```text
Settings → Composer → Auto-run terminal commands: ON
Settings → Composer → Auto-accept edits: ON (less safe)
```

### Codex CLI

```bash
codex --approval-mode auto-edit
codex --approval-mode full-auto  # YOLO
```

### Copilot Workspace

Workspace mặc định cloud sandbox → an toàn YOLO by design.

## Karpathy's 5 Rules cho YOLO

Andrej Karpathy đăng tweet 5 principles cho responsible vibe coding 11/2025:

```text
1. Be the boss, not the worker
   → You set direction, AI executes
   → Bạn decide WHAT, AI quyết HOW

2. Verify, don't trust
   → Test mỗi feature, check security
   → Review diff trước commit

3. Sandbox aggressively
   → Container, throwaway VM, cloud sandbox
   → Không có production secret trong env

4. Keep human-readable artifacts
   → Document spec
   → Commit small, descriptive
   → Future-you cần đọc được

5. Embrace exponentials, accept volatility
   → Tool tốt hơn mỗi tháng
   → Setup tuần này có thể outdated tuần sau
   → Adapt
```

→ Internalize 5 rules trước khi bật YOLO.

## Sandbox patterns

### Pattern 1: Docker container

```bash
# Dockerfile.yolo
FROM node:20-bookworm
RUN apt-get update && apt-get install -y git curl
WORKDIR /workspace
COPY . .
RUN curl -fsSL https://claude.ai/install.sh | sh
ENTRYPOINT ["claude", "--dangerously-skip-permissions"]
```

```bash
docker build -t yolo-env -f Dockerfile.yolo .
docker run -it --rm \
  -v $(pwd):/workspace \
  -e ANTHROPIC_API_KEY \
  yolo-env
```

→ Agent chỉ có access volume `/workspace`. Production system safe.

### Pattern 2: Devcontainer

```json
// .devcontainer/devcontainer.json
{
  "name": "YOLO sandbox",
  "image": "mcr.microsoft.com/devcontainers/typescript-node:20",
  "features": {
    "ghcr.io/anthropics/devcontainer-features/claude-code:1": {}
  },
  "runArgs": ["--cap-drop=NET_ADMIN"],
  "mounts": ["source=${localWorkspaceFolder},target=/workspace,type=bind"]
}
```

VS Code "Reopen in Container" → agent chạy trong container.

### Pattern 3: Throwaway VM

```bash
# Multipass, OrbStack, Lima
multipass launch -n yolo-vm
multipass shell yolo-vm
# Install claude code, work
# Done? multipass delete yolo-vm
```

→ Worst case: VM destroyed, host safe.

### Pattern 4: Cloud sandbox (Phase 8)

```text
- Sprites.dev
- Codex Cloud  
- GitHub Copilot Workspace
- Replit Agent
```

→ Cloud spawn container per task. Most isolated.

## OpenRouter — Model routing intelligence

```text
[Problem]
- Anthropic API: chỉ Claude
- OpenAI API: chỉ GPT
- Want: route theo task type
- Want: fallback khi rate-limit
- Want: cheap model cho bulk, expensive cho hard
```

OpenRouter = **unified API** cho 200+ models:
```text
- Claude Sonnet 4.5
- GPT-5.2
- Gemini 3 Pro
- GLM 4.7
- Llama 3 405B
- Cerebras-hosted (any model, 10x speed)
```

1 API key → access tất cả. Phù hợp YOLO mode (model fallback giữ work flowing).

### Setup

```bash
# Sign up openrouter.ai → API key
export OPENROUTER_API_KEY=sk-or-v1-...

# Use with Claude Code via base URL trick
export ANTHROPIC_BASE_URL=https://openrouter.ai/api/v1
export ANTHROPIC_API_KEY=$OPENROUTER_API_KEY
export ANTHROPIC_MODEL=anthropic/claude-sonnet-4.5
claude
```

Hoặc Cursor:
```text
Settings → Models → OpenAI-compatible
Base URL: https://openrouter.ai/api/v1
API key: $OPENROUTER_API_KEY
Model: anthropic/claude-sonnet-4.5
```

### Auto-routing strategy

```json
{
  "models": [
    "anthropic/claude-sonnet-4.5",
    "openai/gpt-5.2",
    "google/gemini-3-pro"
  ],
  "route": "fallback"
}
```

→ Primary Sonnet. Khi rate-limit / error → GPT-5. Khi GPT-5 down → Gemini. Workflow không bị stuck.

### Cost optimization

```text
[Task tagging]
- Light (rename, format) → Gemini Flash $0.075/M
- Medium (feature impl) → Sonnet 4.5 $3/M
- Hard (architecture)   → Opus 4.5 $15/M
- Bulk (1000 tests)    → GLM 4.7 $0.5/M
```

Set via system prompt tagging → router pick model phù hợp.

## Build production app — Pattern

### Step 1: Spec first

```markdown
# spec.md

## Product: AI Digital Twin Chat

User uploads bio document → AI roleplays as that person.

## Stack
- Next.js 15 + Tailwind + shadcn/ui
- OpenRouter for LLM (cost flexibility)
- Vercel deploy
- Browser localStorage cho chat history

## Features
- Upload .txt bio → parse → save
- Chat with AI roleplay as bio
- System prompt template
- Choose model (Claude/GPT/Gemini)
- Export conversation

## Non-features
- No auth (single user demo)
- No backend DB
```

### Step 2: agents.md

```markdown
# agents.md

## Conventions
- Server components by default
- Use OpenRouter API directly (no SDK wrapper)
- Stream responses (no wait full response)
- Markdown render with react-markdown

## API key handling
- ALWAYS process.env.OPENROUTER_API_KEY
- NEVER hardcode
- Use middleware to inject in API routes only

## Commands
- pnpm dev
- pnpm test
- pnpm lint && pnpm typecheck
```

### Step 3: YOLO build

```bash
# Container
docker run -it --rm -v $(pwd):/workspace -e OPENROUTER_API_KEY \
  yolo-env

claude
> "Build the AI Digital Twin Chat per spec.md. 
> Use OpenRouter. Stream responses. Add model picker."
```

Agent autonomous build trong ~30-60 min.

### Step 4: Verify

```bash
# Outside container
pnpm install
pnpm test
pnpm lint
pnpm dev

# Open browser, manual test:
# - Upload bio
# - Chat works
# - Model switch works
# - History persists
# - No console error
```

### Step 5: Deploy

```bash
vercel deploy
# Add env var OPENROUTER_API_KEY in Vercel dashboard
```

→ Production live trong 1 evening. Vibe engineering pattern.

## Safety checklist trước YOLO

```text
[Before bật YOLO]
✓ Code đang trong sandbox (container/VM/cloud)
✓ No prod credentials trong env
✓ Git commit current state (rollback safe)
✓ Spec rõ ràng (.md file)
✓ agents.md có "don'ts" section
✓ Test command runnable
✓ Backup quan trọng (DB, secret, .env)
✗ Đang ở mục working tree dirty
✗ Đang trong production server
✗ Có .env.production / .env.aws trong context
✗ Chưa commit current work
```

## Bẫy thường gặp với YOLO

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| YOLO trên host machine | `rm -rf` toàn bộ | Container/VM |
| Production secret trong env | Leak | Sandbox secret-free |
| Không commit trước YOLO | Mất work | git commit + push |
| Vague spec | Output messy | spec.md rõ ràng |
| Skip review final diff | Bug + security | Review trước merge |
| `git push --force` agent tự | Override main | Disable trong sandbox config |
| Run YOLO trong open-source | Leak API key vào commit | Filter .gitignore + check |
| Model fallback infinite loop | Bill shock | Set max cost limit OpenRouter |

## Tóm tắt bài 1

- **YOLO mode** = bypass permissions → 5-10x throughput, risk cao.
- Bật via: Claude Code `--dangerously-skip-permissions`, Cursor Composer auto-run.
- **Karpathy's 5 rules**: boss not worker, verify not trust, sandbox aggressively, human-readable artifacts, embrace exponentials.
- Sandbox patterns: **Docker container**, **devcontainer**, **throwaway VM**, **cloud sandbox**.
- **OpenRouter** = unified API 200+ models — fallback routing, cost optimization.
- Production vibe coding pattern: spec.md → agents.md → YOLO build → verify → deploy.
- Safety checklist trước YOLO: container, no prod secret, git commit, clear spec.

**Bài kế tiếp** → [Bài 2: 5 Principles Successful Vibe Coding](02-5-principles.md)
