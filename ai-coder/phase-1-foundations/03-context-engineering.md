# Bài 3: Context Engineering — System prompt, agents.md, context window strategy

"Prompt engineering" là thuật ngữ 2023. Năm 2025 thay bằng **"context engineering"** — chú trọng *toàn bộ context window* mà LLM nhận, không chỉ user message. Đây là skill quan trọng nhất của agentic coder: cách tổ chức **system prompt + agents.md + file inclusion + tool result** để agent làm đúng task. Bài này dạy nghệ thuật đó.

## Tại sao đổi từ "prompt" sang "context"?

```text
[2023 mindset — Prompt Engineering]
User: "Write Python function to..."
       ↑
   focus chỉ ở chuỗi này

[2025 mindset — Context Engineering]
[System]:   Coding agent rules
[Memory]:   agents.md / CLAUDE.md
[Files]:    Read foo.py, bar.py (auto đọc)
[History]:  Conversation trước
[Tools]:    Results từ Grep, Bash, ...
[Now]:      User message
       ↑
   tất cả này là context — tối ưu toàn bộ
```

User message giờ chỉ là **1 phần nhỏ**. Phần lớn context được agent **tự build**: đọc file, chạy grep, gọi MCP, mỗi cái thêm tokens.

→ Skill mới: thiết kế **làm sao agent có đúng context** để giải task.

## 4 layer của context

```text
[Layer 1: System prompt]              (do tool maker viết, không sửa được)
- "You are a coding agent..."
- Tool descriptions
- Safety rules
- ~5K-15K tokens

[Layer 2: User-controlled rules]      ← bạn viết
- CLAUDE.md / agents.md / .cursorrules
- Project conventions
- Coding style preferences
- ~500-3K tokens

[Layer 3: Dynamic context]            ← agent build per task
- Files agent đọc qua Read tool
- Bash command results
- Grep / glob results
- ~5K-50K tokens

[Layer 4: User message]               ← bạn gõ
- "Add login feature"
- ~50-500 tokens
```

Layer 1 fix bởi tool. Layer 2-4 bạn ảnh hưởng được. **Layer 2** là leverage cao nhất.

## agents.md / CLAUDE.md / .cursorrules — Memory cá nhân của project

```text
[Common convention 2025]
- Claude Code:  CLAUDE.md (root project)
- Cursor:       .cursorrules (root) hoặc .cursor/rules/*.mdc
- Codex CLI:    AGENTS.md hoặc agents.md (mới chuẩn hóa)
- Copilot:      .github/copilot-instructions.md
- Aider:        .aider.conf.yml
```

Mỗi tool có format riêng, nội dung tương tự: **rules để agent hiểu project**.

Khuynh hướng đang **chuẩn hóa**: nhiều tool đọc `agents.md` (lowercase, root) như standard.

## Mẫu agents.md tốt

```markdown
# Project: AI Legal Doc Generator

## Stack
- Backend: FastAPI (Python 3.12) + PostgreSQL + Redis
- Frontend: Next.js 15 (App Router) + TailwindCSS + shadcn/ui
- Infra: Docker Compose dev, AWS ECS prod

## Conventions

### Backend
- Use async/await everywhere. No sync DB calls.
- All endpoints in `app/routes/`, one file per resource.
- Use pydantic v2 for all DTOs in `app/schemas/`.
- Database queries via SQLAlchemy 2.0 syntax (NOT 1.x).
- Auth via JWT in `app/security/jwt.py` — never reimplement.

### Frontend
- Server components by default. Client only when needed (use `'use client'`).
- Forms with `react-hook-form` + `zod` validation.
- API calls in `lib/api/` — use the existing fetcher, don't roll your own.
- Tailwind only — no inline styles, no CSS modules.

## Commands you can run

```bash
# Backend tests
cd backend && pytest

# Frontend tests
cd frontend && pnpm test

# Lint backend
cd backend && ruff check . && mypy app

# Lint frontend
cd frontend && pnpm lint
```

## What NOT to do

- Don't create new utils file when one exists.
- Don't add new dependencies without asking.
- Don't modify migrations after they're committed.
- Don't bypass auth middleware "for testing".

## Where to find things

- API routes:       backend/app/routes/
- DB models:        backend/app/models/
- Schemas:          backend/app/schemas/
- Frontend pages:   frontend/app/
- Components:       frontend/components/
- Reusable hooks:   frontend/hooks/
- Tests:            backend/tests/, frontend/__tests__/
```

→ Pattern: **stack + conventions + commands + don'ts + map**.

## Quy tắc viết agents.md tốt

```text
✓ Cụ thể, không chung chung
   GOOD: "Use SQLAlchemy 2.0 syntax (select() not query())"
   BAD:  "Write clean SQL"

✓ Cho lệnh chạy được
   GOOD: "cd backend && pytest" — agent có thể copy + run
   BAD:  "Run tests"

✓ Note exceptions / gotchas
   GOOD: "Migrations are committed — don't edit them"
   BAD:  (nothing)

✓ Map directory
   GOOD: "API routes are in backend/app/routes/"
   BAD:  (agent phải tự explore mỗi lần)

✗ Đừng repeat doc của framework
   Đừng copy-paste FastAPI tutorial vào đây.

✗ Đừng quá dài
   < 200 dòng. Dài hơn = agent miss giữa.

✗ Đừng outdated
   Update khi convention đổi.
```

## System prompt — Bạn không sửa được, nhưng nên hiểu

Mỗi tool có system prompt riêng. Bạn không edit, nhưng biết nó giúp đoán hành vi:

```text
[Claude Code system prompt key points]
- You are an interactive CLI tool for SE tasks
- Use TaskCreate for multi-step
- Default to NO comments unless WHY non-obvious
- Edit prefer over Write
- Respond concisely (<4 lines)
- Don't create files unless needed
- Always do TDD if appropriate

[Cursor agent key points]
- IDE-aware: knows open files, cursor position
- Inline diff editing
- Composer mode for multi-file
- Tab completion for next edit
```

Hiểu system prompt → biết tool default behavior. Ví dụ Claude Code mặc định "tiết kiệm comment" — nếu bạn cần verbose comment, phải nói trong CLAUDE.md.

## Strategies cho context window

### 1. Selective reading

```text
[Anti-pattern]
"Read every .py file in src/" → 50 files → 100K tokens → LLM miss giữa

[Pattern]
"Read only the auth files and the failing test"
→ 3 files → 5K tokens → focused
```

Tool tốt (Claude Code) tự selective. Bạn có thể guide bằng `@file` mention.

### 2. Compact / summarize

Khi conversation dài (50+ turn), tools cung cấp:
- Claude Code: `/compact` → summarize history, free up tokens.
- Cursor: New chat khi context full.

Quy luật: 1 task = 1 conversation, đừng tích lũy.

### 3. Sub-agent delegation

Khi cần research lớn (đọc 20 file), spawn sub-agent:
```text
[Main agent]
"Tôi cần biết auth flow"
   ↓
[Spawn sub-agent]
"Trace auth flow trong codebase, return summary < 200 lời"
   ↓
[Sub-agent context isolated]
Đọc 20 file → tổng hợp
   ↓
[Return chỉ summary lên main agent]
   ↓
[Main context giữ small]
```

→ Main agent giữ context sạch. Phase 7 deep dive sub-agents.

### 4. Tool result truncation

Tool output dài (vd `ls -R` cả monorepo) → truncate. Cấu hình:
```markdown
# In CLAUDE.md
When running shell commands that produce large output, pipe to head/tail:
- ls -R | head -50
- git log | head -20
```

→ Agent học pattern.

## Anti-pattern: "Kitchen sink" context

```text
[BAD — dump everything]
agents.md:
- 50 commands rarely used
- Full coding style guide (300 lines)
- Architecture diagrams (10K tokens)
- TODO list
- Random notes from team meeting

→ Agent overwhelmed. Quality giảm.
```

```text
[GOOD — minimal viable]
agents.md:
- 5 core conventions
- 5 most-used commands  
- "Where to find things" map
- 3 critical don'ts

→ Agent focused. Quality cao.
```

Quy luật: bắt đầu **minimal**, add khi thấy agent miss.

## File mention `@` — Cursor pattern

```text
User: "Refactor login function in @backend/app/auth.py"

→ Cursor / Copilot inject file content vào context.
→ Agent thấy ngay, không cần Grep.
```

Claude Code: dùng tool `Read("path")` tương tự. Một số version có shortcut `@`.

Pattern: dùng `@` khi biết chính xác file. Để agent tự explore khi không biết.

## Production agents.md pattern

```text
[Multi-language project structure]
agents.md (root) — global rules
backend/AGENTS.md — backend-specific
frontend/AGENTS.md — frontend-specific
```

Tool tốt đọc nested AGENTS.md → áp dụng theo working directory.

Hoặc:
```markdown
# agents.md

## Section: Backend (Python/FastAPI)
[rules]

## Section: Frontend (Next.js)
[rules]

## Section: Infra
[rules]
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Không có agents.md | Agent re-explore mỗi lần | Tạo từ ngày 1 |
| agents.md outdated | Misleading agent | Update khi convention đổi |
| Quá dài (500+ dòng) | LLM miss giữa | < 200 dòng, refactor |
| Generic ("write clean code") | Vô dụng | Cụ thể, runnable |
| Không có "don'ts" section | Agent tái phạm mistake | List anti-pattern |
| Trust tool defaults | Output không match style | Override trong agents.md |
| Quên `@file` cho task biết file | Agent waste turn Grep | Mention file rõ |
| Conversation tích lũy mãi | Token cao + LLM nhiễu | `/clear` per task |

## Quick reference

```markdown
# agents.md template starter

## Stack
- [language] [framework] + [DB]

## Run commands
- Tests: [exact command]
- Lint:  [exact command]
- Dev:   [exact command]

## Conventions
- [3-5 specific rules]

## Don'ts
- [3-5 anti-patterns]

## Map
- [where] to find [what]
```

```text
[Context layers — leverage order]
1. agents.md — highest leverage, set once
2. @file mention — point agent at right place
3. user prompt — specific task
4. (system prompt — can't change)

[Window strategy]
- Start fresh per task (/clear)
- Compact at 50% used
- Sub-agent for big research
- @file when known
```

## Tóm tắt bài 3

- "Prompt engineering" → **"context engineering"**: tối ưu toàn bộ context window, không chỉ user message.
- 4 layer: system prompt (fixed), agents.md (bạn write), dynamic (agent đọc file), user message.
- **agents.md / CLAUDE.md / .cursorrules** = highest leverage layer.
- Pattern viết tốt: **stack + conventions + commands + don'ts + directory map**, < 200 dòng.
- Mỗi tool có file convention riêng — đang chuẩn hóa `agents.md`.
- Strategies: selective reading, compact/summarize, sub-agent, tool result truncation.
- "Lost in the middle" — đừng cho 100K tokens context, agent miss giữa.
- 1 task = 1 conversation. `/clear` thường xuyên.

**Bài kế tiếp** → [Bài 4: Evolution — 8 stages từ ChatGPT đến Agent Orchestration](04-evolution-stages.md)
