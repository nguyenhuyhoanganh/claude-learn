# Bài 3: OpenAI Codex CLI + Google Antigravity — Alternative tools

Cursor + Copilot không phải lựa chọn duy nhất. **OpenAI Codex** (VS Code extension + CLI) đại diện cho stack OpenAI. **Google Antigravity** là IDE mới ra 11/2025 với Gemini 3 native. Cả hai đáng thử trong 2026 vì đặc thù riêng. Bài này dạy setup, strengths, và build Kanban với cả hai để so sánh.

## OpenAI Codex — Tên cũ, sản phẩm mới

```text
[Codex history]
- 2021-2023: GPT-3-based code completion (deprecated)
- 2025: Tái sinh — Codex CLI + Codex IDE plugin + Codex Cloud
- Backed by GPT-5.2 + o3 reasoning
- Native multi-agent support
```

3 surface:
- **Codex CLI** — terminal (giống Claude Code).
- **Codex VS Code Extension** — IDE chat + agent.
- **Codex Cloud** — sandbox web UI (giống Sprites.dev).

### Cài Codex CLI

```bash
npm install -g @openai/codex
codex login           # OAuth với OpenAI account
codex                 # start in current dir
```

ChatGPT Plus $20 sub bao gồm Codex CLI usage. Pay-per-use cũng OK.

### Cài Codex VS Code extension

```text
1. VS Code Marketplace → "OpenAI Codex"
2. Sign in OpenAI
3. Sidebar panel hiện ra
```

### UX

```text
[Codex CLI workflow]
$ codex
codex> Add login page with NextAuth.js

Codex agent:
- Read existing structure
- Install nextauth
- Create app/api/auth/[...nextauth]/route.ts
- Create app/login/page.tsx
- Update layout với SessionProvider

[Auto-approve mode trong VS Code]
- Toggle "Auto-approve" → YOLO
- Agent execute không hỏi từng tool
```

### Strengths

- **Reasoning mode strong**: o3-backed → khó debug, architecture.
- **Multi-modal**: paste screenshot, agent đọc UI.
- **OpenAI ecosystem tích hợp**: Assistants API, file search, code interpreter.
- **Codex Cloud**: free tier hơn hậu hĩnh hơn Sprites.dev.

### Weaknesses

- **Newer UX** — less polished than Cursor/Copilot/Claude Code.
- **Less plugin ecosystem** so với Claude Code skills + MCP marketplace.
- **OpenAI-only** — không choose model như Cursor.

## Google Antigravity — IDE đầu tiên Gemini-native

Ra mắt 11/2025. Google's response to Cursor.

```text
[Antigravity stack]
- VS Code fork (similar Cursor approach)
- Gemini 3 Pro + Deep Think + Flash native
- 2M context window — đọc cả monorepo
- Google Workspace integration
- Custom "Mission" mode (multi-step planning)
```

### Cài Antigravity

```text
1. antigravity.google.com → download
2. Sign in Google account
3. (Optional) enable Gemini Pro subscription cho fast tier
```

### Killer feature: 2M context

Cursor + Claude Code thường truncate sau 200K. Antigravity với Gemini 3 Pro **đọc trọn 1M-token codebase** trong 1 context.

Use case:
- Monorepo migration (đọc 500 file).
- Compliance audit (LLM thấy mọi auth path).
- Architecture review (full system overview).

### Mission mode

```text
[Mission UI]
- Plan: AI describes 5-step plan
- Steps: collapsible với progress
- Each step: code change + verification
- Rollback per step
- Final review: see full diff
```

→ Spec-driven, structured. Trade-off: less spontaneous than Cursor Composer.

### Strengths

- **2M context** — không có competitor match.
- **Deep Think mode** — khó reasoning task.
- **Google Workspace integration** — Drive, Docs, Sheets data.
- **Mission planning** — structured workflow.

### Weaknesses

- **Mới ra** — bug nhiều hơn mature tools.
- **Vendor lock-in** — chỉ Gemini.
- **Slow inference** — Gemini 3 Pro chậm hơn Sonnet 4.5.
- **Less community** — agents.md, skills, plugins ecosystem chưa có.

## Build Kanban app — 4 lần với 4 tool

Vibe: build cùng Kanban với Cursor, Copilot, Codex, Antigravity. So sánh.

### Spec chung

```text
Next.js 15 + TypeScript + Tailwind + shadcn/ui
3 columns: Todo, In Progress, Done
Drag-and-drop với @dnd-kit
localStorage persist
Card CRUD
```

### Codex CLI run

```bash
cd kanban-codex
codex
```

```text
codex> Create Next.js 15 project with TypeScript, Tailwind,
shadcn/ui. Set up 3-column Kanban board with localStorage
persistence and @dnd-kit drag-and-drop.

Codex (with auto-approve):
- pnpm create next-app
- shadcn init
- install dnd-kit
- generate page.tsx, hooks, components
- run dev server

[~5-10 min, mostly autonomous]
```

### Antigravity Mission run

```text
[Open Antigravity → new Mission]
Goal: "Kanban board with 3 columns, drag-and-drop, localStorage"

Mission plan generated:
1. Scaffold Next.js 15 + Tailwind
2. Install shadcn + dnd-kit
3. Create Card, Column components
4. Add localStorage hook
5. Wire DnD context
6. Polish + test

[Review plan → Start]

Antigravity executes step-by-step, pause for verification at each step.
```

→ Slower but more controlled.

## So sánh 4 tools — Final verdict

| Tiêu chí | Cursor | Copilot | Codex | Antigravity |
|---|---|---|---|---|
| Tab autocomplete | ★★★★★ | ★★★★ | ★★★★ | ★★★ |
| Multi-file agent | ★★★★★ | ★★★★ | ★★★★ | ★★★★ |
| Reasoning hard tasks | ★★★★ | ★★★★ | ★★★★★ (o3) | ★★★★★ (Deep Think) |
| Long context | ★★★ (200K) | ★★★ (200K) | ★★★ (200K) | ★★★★★ (2M) |
| Plugin ecosystem | ★★★ | ★★★★ | ★★ | ★ |
| Model flexibility | ★★★★★ | ★★★ | ★★ | ★ |
| Enterprise | ★★★ | ★★★★★ | ★★★ | ★★★ |
| CLI surface | ★★★ | ★★★ | ★★★★ | ★★ |
| UI polish | ★★★★★ | ★★★★★ | ★★★ | ★★★ |
| Maturity | ★★★★★ | ★★★★★ | ★★★ | ★★ |
| Price | $20/mo | $10-39/mo | $20/mo (ChatGPT+) | $25/mo |

### Verdict 2026

```text
[Best overall — IDE]                Cursor
[Best for enterprise / GitHub shop] Copilot
[Best reasoning / OpenAI stack]     Codex
[Best long context / 2M codebase]   Antigravity
[Best CLI / agent loop]             Claude Code (Phase 4)
```

Reality: bạn sẽ dùng 2-3 tools. Khóa này:
- **Cursor + Claude Code** — primary workflow.
- **Copilot** — khi work on enterprise project.
- **Codex** — khi cần o3 reasoning.
- **Antigravity** — khi monorepo migration.

## Hai patterns không nói ở đâu khác

### Pattern: Tool ensembling

```text
[Same task, different tools]
1. Sketch plan với Cursor Composer (fast iterate)
2. Implement với Claude Code (best agent loop)
3. Review với Codex o3 (deep reasoning)
4. PR description với Copilot (GitHub native)
```

Mỗi tool đóng góp phần mạnh nhất. 2-3x quality.

### Pattern: Cross-model verification

```text
[Build feature with one tool]
[Then ask another tool to review]
"Codex, review this PR built by Cursor: list 5 issues"

Different bias → catch each other's mistakes.
```

## Bẫy khi compare tools

| Bẫy | Tránh bằng |
|---|---|
| Compare based on 1 task | Test 5-10 task khác nhau |
| Switch tool mỗi tuần | Commit 1-2 tool 1 tháng |
| Chase newest hype | Focus production-ready |
| Free tier rate-limited | Pro/Pay-as-you-go fair |
| Lock-in 1 tool | Đa dạng cho safety |
| Trust marketing video | Real workflow personal |

## Tóm tắt bài 3

- **Codex** = OpenAI re-launch. CLI + VS Code extension + Cloud. o3 reasoning mạnh.
- **Antigravity** = Google IDE Gemini 3 native. 2M context, Mission mode structured.
- Codex strengths: o3 reasoning, multi-modal, OpenAI ecosystem.
- Antigravity strengths: 2M context (no competitor), Deep Think, Google Workspace.
- Codex weakness: less polish, no plugin ecosystem.
- Antigravity weakness: new, slow, vendor lock-in.
- Verdict tools 2026:
  - Cursor — best IDE overall.
  - Copilot — best enterprise / GitHub.
  - Codex — best reasoning / OpenAI stack.
  - Antigravity — best long context.
  - Claude Code (Phase 4) — best CLI agent.
- **Tool ensembling** + **cross-model verification** = pro patterns.

🎉 **Hoàn thành Phase 2** — overview 4 tools chính. Phase 3 deep YOLO mode + Vibe Coding production pattern.

**Bài kế tiếp** → [Phase 3 - Bài 1: YOLO Mode + OpenRouter setup an toàn](../phase-3-yolo-vibe/01-yolo-openrouter.md)
