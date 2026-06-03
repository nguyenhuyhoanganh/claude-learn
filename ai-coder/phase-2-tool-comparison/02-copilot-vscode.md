# Bài 2: GitHub Copilot — VS Code extension chuẩn enterprise

GitHub Copilot là **AI coding tool đầu tiên mainstream** (2021). Microsoft-backed, enterprise-trusted, deep VS Code integration. Cuối 2025, Copilot **không còn dẫn đầu** về AI capability (Cursor + Claude Code mạnh hơn), nhưng vẫn dominate **enterprise market** vì compliance, SSO, audit log, GitHub integration. Bài này dạy: setup, agent mode mới, build Kanban với Copilot.

## Copilot landscape 2026

```text
[GitHub Copilot] (Microsoft)
- Subscription $10-39/mo per user
- Enterprise SSO, SCIM, audit log
- Deep VS Code, Visual Studio, JetBrains
- GitHub integration: PR review, Issue → code
- Models: GPT-4.1, GPT-5, Claude Sonnet (preview), Gemini (preview)
```

Trước đó Copilot = autocomplete. Hiện đã có:
- **Copilot Chat** — sidebar Q&A.
- **Copilot Edits** — multi-file edit (giống Cursor Composer).
- **Copilot Workspace** — cloud spec-to-PR (giống Devin).
- **Copilot CLI** — terminal mode.

## Cài đặt

```text
1. Subscribe github.com/copilot
2. Mở VS Code
3. Cài extensions:
   - "GitHub Copilot"
   - "GitHub Copilot Chat"
4. Sign in GitHub
5. (Optional) "GitHub Copilot Workspace" — cloud mode
```

Verify: gõ comment trong file `.py`, đợi 1s → suggest hiện ra.

## 4 modes của Copilot

### Mode 1: Tab autocomplete (legacy core)

```python
# Calculate factorial recursively
def factorial(n):
    # ← Copilot suggest
```

Same idea Cursor Tab nhưng:
- ✗ Less context (current file + few open files).
- ✗ Less multi-line predict.
- ✓ Faster on slow connection.
- ✓ Less RAM.

### Mode 2: Chat (Ctrl/Cmd + I)

Inline chat with selected code:
```text
[Select function] → Cmd+I → "explain"
[Select function] → Cmd+I → "/fix"
[Select function] → Cmd+I → "/test"
[Select function] → Cmd+I → "/optimize"
```

Hoặc sidebar chat (View → Copilot Chat).

### Mode 3: Edits (multi-file)

```text
[Open Copilot Edits panel]

User: "Add a profile page. Use existing auth context.
       Show user avatar + email + edit button.
       Reuse Card component from components/."

Copilot:
- Read auth context
- Read Card component
- Create app/profile/page.tsx
- Update navigation

User: review diff per file → accept/reject
```

→ Same idea Cursor Composer. Quality ngang nhau với GPT-5.

### Mode 4: Workspace (Cloud spec-to-PR)

```text
[Submit spec via web UI]
"Add dark mode toggle. Persist preference.
 Use existing theme system."

[Cloud Copilot]
- Read repo
- Generate plan
- Implement changes
- Open PR

[You]
Review PR on GitHub. Merge or request changes.
```

Similar tới Devin, Sprites.dev. Phase 8 deep dive.

## Settings + customization

### `.github/copilot-instructions.md`

```markdown
# Project conventions for Copilot

## Stack
- Next.js 15 App Router + TypeScript
- Tailwind CSS + shadcn/ui
- Postgres + Prisma ORM

## Conventions
- Server components by default
- Use React Server Actions for mutations
- Forms with react-hook-form + zod
- API errors: throw, catch in error.tsx

## Don'ts
- Don't use pages router
- Don't add new state management (no Redux/Zustand)
- Don't bypass Prisma for raw SQL

## Commands
- pnpm dev
- pnpm test
- pnpm lint
```

→ Copilot reads this. Apply across all chat/edit/workspace.

### Custom instructions per file

```text
[VS Code settings]
"github.copilot.chat.codeGeneration.instructions": [
  {
    "file": "frontend/**/*.tsx",
    "instructions": "Always use Tailwind"
  }
]
```

→ Path-scoped rules.

### Slash commands

```text
/explain    — explain selected code
/fix        — fix bug
/tests      — generate tests
/doc        — add documentation
/optimize   — performance optimization
/clear      — new chat
/help       — list commands
```

Trong chat dùng `/`. Ví dụ: select function → `/tests` → Copilot sinh test file.

## Build Kanban app — Practice

Same Kanban như Cursor bài trước, dùng Copilot Edits.

### Step 1: Init project

VS Code terminal:
```bash
pnpm create next-app@latest kanban-copilot --typescript --tailwind --app
cd kanban-copilot && pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add card button input dialog
code .
```

### Step 2: Copilot Edits — Base layout

Open Copilot Edits, add files: `app/page.tsx`.

```text
Prompt:
"Replace app/page.tsx with a 3-column Kanban board:
- Columns: Todo, In Progress, Done
- Each column shows card list + 'Add Card' button
- Use shadcn Card component
- Cards have id (uuid), title, description
- State managed by React useState for now"
```

Review diff. Accept.

### Step 3: Add localStorage hook

```text
Prompt:
"Create hooks/useKanbanBoard.ts that:
- Initial state from localStorage 'kanban-board'
- Updates persist back to localStorage
- Provides addCard, deleteCard, moveCard functions
Replace useState in page.tsx with this hook."
```

### Step 4: Drag-and-drop

```text
Prompt:
"Add @dnd-kit drag-and-drop. Cards draggable between columns.
Install: pnpm add @dnd-kit/core @dnd-kit/sortable"
```

### Step 5: Polish UI

```text
Prompt:
"Add: column header with count badge, empty column message,
card edit dialog, card delete button (X icon)."
```

→ Same outcome as Cursor, ~30-45 min.

## So sánh Copilot vs Cursor

| Tiêu chí | Copilot | Cursor |
|---|---|---|
| Tab autocomplete | OK | Better predict |
| Chat | Sidebar + inline | Sidebar + inline |
| Multi-file agent | Copilot Edits | Composer (slightly polished) |
| Cloud mode | Workspace | (no cloud) |
| CLI | Copilot CLI | Cursor CLI |
| Model choice | GPT-5, Claude (limited) | All major |
| Enterprise SSO | Mature | Newer |
| Pricing | $10-39/mo | $20/mo |
| GitHub integration | Native (best) | Via API |
| Onboarding company | Easy (already paying GH) | New procurement |

→ Copilot win: **enterprise compliance, GitHub workflow**. Cursor win: **agent UX polish, model flexibility**.

Reality: nhiều company dùng **cả 2** — Cursor cho heavy dev, Copilot cho casual contributors.

## Copilot Workspace — Cloud agent

```text
[Workflow]
1. github.com/copilot/workspaces
2. Connect repo
3. Submit task: "Add dark mode toggle"
4. Workspace generates:
   - Plan (high-level steps)
   - Spec (detailed changes)
   - Implementation (code changes)
5. Review per stage, edit if needed
6. Open PR
```

Different from Cursor/Copilot Edits: **fully cloud**, no local IDE needed. Boss has Slack notif, sleep, wake up, review PR.

Trade-off: less interactive, harder to course-correct mid-flight.

## Bẫy với Copilot

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Trust autocomplete blindly | Bug | Review trước commit |
| Không setup copilot-instructions.md | Output generic | Setup từ ngày 1 |
| Copilot Chat tích lũy 100 turn | Slow + nhiễu | New chat thường xuyên |
| Dùng cheapest tier cho hard task | Sai output | Pro/Enterprise tier |
| Quên path-scoped instructions | Frontend rule áp backend | Configure per glob |
| Skip Copilot Edits dùng autocomplete cho refactor | Slow | Edits cho multi-file |
| Workspace cho task < 10 min | Overhead | Workspace cho task lớn |
| Mong agent biết private framework | Hallucination | Add doc trong instructions |

## Khi nào CHỌN Copilot?

```text
✓ Company đã pay GitHub Enterprise
✓ Cần SSO, audit log, SCIM
✓ Team heavy GitHub PR/Issue workflow
✓ Casual coders không cần advanced agent
✓ VS Code + Visual Studio mix shop
✓ Conservative organization (Microsoft = safe)

✗ Cần model freshest (Cursor + Claude Code)
✗ Sống trong terminal (Claude Code)
✗ Heavy multi-file refactor (Cursor Composer)
✗ Cutting-edge feature first day (Cursor)
```

## Tóm tắt bài 2

- Copilot = **mainstream** AI coding tool, enterprise-first.
- 4 modes: **Tab**, **Chat (inline/sidebar)**, **Edits** (multi-file), **Workspace** (cloud).
- `.github/copilot-instructions.md` cho project rules.
- Path-scoped instructions qua VS Code settings.
- `/explain`, `/fix`, `/tests`, `/doc`, `/optimize` trong chat.
- Copilot Workspace = cloud spec-to-PR (giống Devin).
- Win: enterprise compliance, GitHub native, mature.
- Lose: agent UX polish (Cursor better), cutting-edge features lag.
- Reality: many shops use both.

**Bài kế tiếp** → [Bài 3: OpenAI Codex CLI + Google Antigravity — Alternative tools](03-codex-antigravity.md)
