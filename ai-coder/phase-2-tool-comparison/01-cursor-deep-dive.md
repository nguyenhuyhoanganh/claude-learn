# Bài 1: Cursor — IDE Agent Leader

Cursor là **IDE đầu tiên** built ground-up cho AI coding. Fork từ VS Code, nhưng add layer agent native: Composer multi-file, Tab autocomplete predictive, agents.md context. Cuối 2025, Cursor là **standard de facto** cho AI-first IDE — 1M+ paying users, $5B+ valuation. Bài này dạy: setup, config, Cursor agent (YOLO mode), build Kanban app from scratch.

## Cursor là gì?

```text
[VS Code base]
+ Cursor Tab (predictive autocomplete)
+ Composer (multi-file agent)
+ Inline edit (Cmd+K)
+ Chat sidebar
+ agents.md / .cursorrules
+ Cursor CLI (terminal mode)
```

→ Familiar UI nếu bạn dùng VS Code. Add ~10 super-power AI feature.

## Cài đặt

```bash
# Mac
brew install --cask cursor

# Hoặc tải tại cursor.com
# Windows / Linux: installer
```

Sign up account → free tier có 50 slow prompt/tháng. Pro $20/month → 500 fast prompt + unlimited slow.

Khi mở:
```text
1. Settings → Models → enable Claude Sonnet 4.5
2. Settings → Models → add API key (Anthropic / OpenAI / OpenRouter)
3. (Optional) Settings → Auto-import từ VS Code extensions
```

## 4 modes của Cursor

### Mode 1: Tab autocomplete

```text
[Bạn gõ]
function calculateTotal(items) {
  // ←  Cursor predict next line

[Cursor suggest]
  return items.reduce((sum, item) => sum + item.price * item.qty, 0);

[Bạn]
Tab → accept. Esc → reject.
```

Mạnh hơn Copilot ở: **predict multi-line edit** (không chỉ next line). Cursor xem context file → suggest đúng style.

### Mode 2: Cmd+K (Inline edit)

```text
[Select code → Cmd+K]
"refactor this to use async/await"

[Cursor inline edit]
- Show diff right ở vị trí cursor
- Accept (Enter) hoặc reject (Esc)
```

Quick edit. Không cần chat sidebar.

### Mode 3: Chat sidebar (Cmd+L)

```text
[Sidebar chat]
- Ask question về file mở
- @file mention để add file vào context
- @web để search web
- @codebase để semantic search toàn project

User: "How does auth flow work? @auth"
Cursor: [explains, links to specific code]
```

Mạnh nhất khi explore codebase mới.

### Mode 4: Composer / Agent (Cmd+I)

```text
[Composer panel — multi-file agent]
Mode: Agent (vs Manual)

User: "Add login page with email/password.
       Use existing JWT setup. Add zod validation."

Composer:
1. Read auth.ts
2. Read existing pages structure
3. Create app/login/page.tsx
4. Create app/login/actions.ts
5. Update app/layout.tsx (add link)
6. Run tests

User: review diff → Accept All or selective
```

Đây là Cursor "thật sự": **agent loop tự động**.

## Settings quan trọng

### .cursorrules / .cursor/rules/

```text
# .cursorrules — Old format
- We use Next.js 15 App Router
- Server components by default
- Use Tailwind, no CSS modules
- Run tests with: pnpm test
```

```mdc
# .cursor/rules/frontend.mdc — New format (project-scoped)
---
description: Frontend conventions
globs: ["frontend/**/*.tsx", "frontend/**/*.ts"]
alwaysApply: true
---

- Server components by default
- Use react-hook-form + zod for forms
- Tailwind only — no inline styles
```

→ MDC format cho phép scope theo path (frontend/backend rules khác nhau).

### Composer mode settings

```text
Settings → Composer:
✓ Auto-run terminal commands (YOLO mode)
✓ Auto-accept edits (less safe)
✗ Confirm before destructive (recommend keep ON)
✓ Always start agent in YOLO mode in container
```

Phase 3 dạy YOLO an toàn.

## Build Kanban app — Practice

Task: build Kanban board app với:
- Next.js + TypeScript + Tailwind.
- 3 column: Todo, In Progress, Done.
- Drag-and-drop với @dnd-kit.
- LocalStorage persistence.

### Step 1: Setup project (Composer)

```text
[Cmd+I → Composer]

"Create a new Next.js 15 project with TypeScript, Tailwind,
and shadcn/ui. Initialize git. Add a basic Kanban board page."
```

Composer:
1. `pnpm create next-app@latest kanban-cursor --typescript --tailwind --app`.
2. `cd kanban-cursor && pnpm dlx shadcn@latest init`.
3. `pnpm dlx shadcn@latest add card button input`.
4. Create `app/page.tsx` với basic 3-column layout.
5. Run dev → preview.

Time: ~2-3 min.

### Step 2: Add cards

```text
"Add Card component. Each card has id, title, description.
Each column has Add Card button → opens dialog → adds card.
Persist to localStorage."
```

Composer:
1. Create `components/Card.tsx`.
2. Create `components/AddCardDialog.tsx`.
3. Create `hooks/useKanbanState.ts` (load/save localStorage).
4. Update `app/page.tsx` use hook.

Review diff. Accept.

### Step 3: Drag-and-drop

```text
"Add drag-and-drop with @dnd-kit/core.
Cards can be dragged between columns.
Persist new state."
```

Composer:
1. `pnpm add @dnd-kit/core @dnd-kit/sortable`.
2. Wrap board with `DndContext`.
3. Make cards `useSortable`.
4. Handle `onDragEnd` → update state.

### Step 4: Polish

```text
"Add: card edit (click → dialog), delete (X button),
column count badge, empty state message."
```

→ 30 phút sau, có full Kanban app chạy được.

## So sánh Cursor với plain Copilot

| Tiêu chí | Cursor | VS Code + Copilot |
|---|---|---|
| Tab autocomplete | Predict multi-line | Single line + boundary |
| Multi-file agent | Composer mạnh | Copilot Edits (newer, OK) |
| Inline edit | Cmd+K instant | Copilot Chat /fix |
| Codebase search | @codebase semantic | Workspace search |
| YOLO mode | Built-in toggle | Need agent extension |
| Custom rules | .cursorrules / MDC | .github/copilot-instructions.md |
| Price | $20/mo | $10-19/mo |
| Model choice | Claude, GPT, Gemini | GPT-4.1, GPT-5, Claude (preview) |

→ Cursor lead ở agent UX. Copilot lead ở Microsoft integration.

## Bẫy khi dùng Cursor

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Accept tất cả diff blindly | Bug âm thầm | Review từng change |
| Không setup .cursorrules | Output không match style | Setup từ ngày 1 |
| Composer task quá lớn | Output messy | Split thành sub-task |
| Quên @file mention | Agent waste turn | Mention khi biết file |
| Để chat panel tích lũy | Slow + token cao | New chat per task |
| Tab autocomplete khi đang debug | Distract | Tạm tắt khi cần focus |
| YOLO mode trực tiếp filesystem | rm -rf risk | Container hoặc git commit thường xuyên |
| Pin slow tier model | Bị throttle | Pro hoặc API key own |

## Pro tips

### 1. Quick `/` commands trong chat

```text
/fix    — fix error trong selected code
/test   — write test cho function
/doc    — generate JSDoc/docstring
/lint   — fix linting issues
```

### 2. `@` mentions

```text
@file    — add file
@folder  — add directory  
@code    — add code symbol (function, class)
@docs    — add framework docs
@web     — search web
@past    — past chat history
@codebase — semantic search project
```

### 3. Notepad

Cursor notepad = scratchpad cho prompt template. Reuse common patterns.

### 4. CLI

```bash
cursor --help
cursor . --new-window
cursor agent "do task X"   # headless mode
```

## Khi nào CHỌN Cursor?

```text
✓ Bạn quen VS Code
✓ Cần visual diff review
✓ Multi-file refactor thường xuyên
✓ Team già không quen CLI
✓ Cần tab autocomplete mạnh

✗ Bạn sống trong terminal
✗ Setup CI/CD agent (CLI tốt hơn)
✗ Headless automation (CLI tốt hơn)
✗ Limited RAM (< 8GB) — IDE nặng
```

## Tóm tắt bài 1

- Cursor = VS Code fork với AI native.
- 4 modes: **Tab** (predict), **Cmd+K** (inline), **Chat sidebar** (Cmd+L), **Composer** (Cmd+I agent).
- `.cursorrules` hoặc `.cursor/rules/*.mdc` cho project conventions.
- Composer = multi-file agent loop, mạnh nhất.
- `@file`, `@codebase`, `@docs`, `@web` cho context injection.
- Pro tips: `/fix`, `/test`, notepad, CLI mode.
- Choose Cursor khi: cần visual diff, multi-file refactor, IDE-centric workflow.
- Avoid Cursor khi: headless automation, CI/CD, low RAM.

**Bài kế tiếp** → [Bài 2: GitHub Copilot — VS Code extension chuẩn enterprise](02-copilot-vscode.md)
