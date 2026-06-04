# Bài 2: Sessions, Checkpoints, Rewind, Git workflow

Claude Code session khác chat AI bình thường ở 3 điểm: **tự động lưu** mỗi turn, **rewind** turn cũ (cmd K), và **checkpoint** tự tạo trước thay đổi lớn. Combined với git, đây là **safety net** mạnh nhất cho YOLO mode. Hiểu cơ chế → tránh mất work, có thể "đi đường ngược" debug.

## Session = conversation lifecycle

```text
[claude] start
  ↓
[CLAUDE.md auto-loaded]
  ↓
[Turn 1: user message → agent loop → response]
  ↓
[Turn 2: ...]
  ↓
...
  ↓
[/exit or Ctrl+D]
  ↓
[Session saved ~/.claude/sessions/]
```

Session ID = UUID. Save full message history + tool calls + results.

## Resume session

```bash
claude --resume
```

Picker hiện ra:
```text
Recent sessions:
1. 2 hours ago, project: my-app, 12 turns
2. yesterday, project: blog, 30 turns
3. 3 days ago, project: kanban, 5 turns

Pick: 1
```

→ Load full history vào context. Tiếp tục.

```bash
claude --continue
# Alias cho --resume picking most recent
```

## Khi nào resume tốt vs xấu

### Tốt resume

```text
- Sleep, wake up, continue same task
- Switched terminal, recover state
- Got distracted, return to flow
- Long task across days
```

### Xấu resume

```text
- New task, different domain
- Previous session had errors → propagate
- Context too long, want fresh
- Want different model/approach
```

→ Pattern: 1 task = 1 session. Multi-day task = resume OK.

## Checkpoints — Auto-save trước change

Claude Code tự checkpoint **trước mỗi tool call destructive** (Write, Edit, Bash exec). Bao gồm:
- File contents snapshot.
- Conversation state.
- Working directory state.

```text
[Turn 5]
> Refactor entire auth module

[Agent]
[Checkpoint created: 5cf3a]
- Edit auth.ts
- Edit middleware.ts
- Edit tests/auth.test.ts
- Run pnpm test
- 3 tests fail

[Turn 6]
> That broke things. Rewind.

[Agent]
[Rewound to checkpoint 5cf3a]
[Files restored]
```

→ Test fail? Rewind. Try different approach.

## Rewind keys

```text
Esc Esc        — show rewind menu
Esc Esc Esc    — rewind to specific turn
```

Menu:
```text
Rewind options:
1. Last user message       (1 turn back)
2. Before "refactor auth"  (5 turns back)
3. Before "add new feature" (12 turns back)
4. Beginning of session

Pick: 2
[Rewound]
```

→ Useful khi agent đi sai hướng. Restore + redirect.

## Rewind vs Git undo

```text
[Rewind (Claude Code)]
- In-session, in-memory
- Includes conversation state
- Doesn't touch git
- Lose if session ends

[Git undo (git checkout/reset)]
- Persistent on disk
- Only files, not conversation
- Best for confirmed changes
```

Pattern: rewind cho thử nghiệm trong session. Git commit cho milestone.

## Combine với Git

```text
[Pattern: safe YOLO]
1. git status — verify clean working tree
2. git add . && git commit -m "wip: before YOLO"
3. claude --dangerously-skip-permissions
4. YOLO build
5. git diff — review
6a. Happy → git commit -m "feat: X"
6b. Sad → git reset --hard HEAD
```

→ Git = persistent rollback. Always start clean.

```text
[Pattern: incremental commit]
> Add feature A
[Agent builds, tests pass]
> Run tests + commit if pass
[Agent: pnpm test → PASS → git commit -m "feat: A"]

> Add feature B
[Agent builds]
> Test + commit
[Commit B]

→ Each feature isolated commit. Easy revert.
```

## /clear vs new session

```text
[/clear]
- Same terminal session
- Conversation history wiped
- CLAUDE.md re-applied
- Context fresh

[New session (claude exit + claude)]
- Same as /clear effectively
- But no shell state difference
```

Convention: `/clear` between tasks. New session if working on different project.

## /compact — Summarize don't reset

```text
[/compact]
> /compact

[Agent]
Summarizing conversation...

Summary:
- Discussed auth flow
- Implemented JWT validation
- Added 3 tests (all pass)
- Refactored middleware

Context freed: 35K → 8K tokens
```

→ Khác `/clear`: giữ memory **summary**, không full history. Tiếp tục coherent.

Pattern: dùng `/compact` mỗi 30-50 turn. `/clear` khi switch task.

## Context window monitoring

```text
> /cost

Session usage:
- Input tokens: 134,231 / 200,000 (67%)
- Output tokens: 12,420

⚠️  Approaching context limit
Recommendation: /compact or /clear
```

Tool warn khi gần limit. `/compact` nhanh, không lose info.

## Session crash recovery

```text
[Crash scenarios]
- Terminal closed accidentally
- Power off
- Network drop during long task

[Recovery]
claude --resume
[Pick latest session]
[Context restored từ last save]
```

Auto-save mỗi turn → max lose 1 turn worth.

## Common workflows

### Workflow 1: Daily standup

```bash
# Morning
claude --continue
> What did we work on yesterday? Summarize.

# After standup, switch task
> /clear
> Today's task: implement payment flow per spec.md
```

### Workflow 2: Bug investigation

```bash
claude
> Bug: users report 500 on /checkout. Investigate.

[Agent reads logs, code, traces issue]

> /compact

> Now propose fix
```

→ `/compact` after investigation phase keeps the conclusion, frees context for fix.

### Workflow 3: Long refactor

```bash
claude
> Refactor module X to use new pattern.
> Commit after each file done.

[Agent: file 1 → test → commit, file 2 → test → commit, ...]

[Lunch break]
Ctrl+D

[After lunch]
claude --continue
> Where were we? Continue.
```

## Multi-session parallel

```bash
# Terminal 1
claude
> Working on frontend

# Terminal 2 (different project or task)
claude
> Working on backend
```

→ Independent sessions. Don't share context. Useful when working on multiple things concurrently.

## Best practices summary

```text
[Start of work]
- claude (or --continue if same task)
- /init nếu project mới
- CLAUDE.md present? Check.

[During work]
- 1 task = 1 conversation flow
- /compact when 50% context used
- Esc Esc for rewind risky changes
- git commit small milestones

[End of work]
- git diff — review final changes
- git commit
- /exit (auto-save)

[Recovery]
- claude --resume
- Pick correct session
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Resume sai session | Mix context | Verify session list |
| Quên `/compact` | Slow + bill cao | Compact at 50% |
| Bị crash mất ý tưởng | Re-explain | Resume từ auto-save |
| Git dirty trước YOLO | Mix changes | git commit clean first |
| Rewind sau commit | Confusion | Rewind chỉ cho in-session |
| Long resume session | Token cost cao | Pattern 1 task 1 session |
| `/clear` nhầm mất context cần | Re-explore | `/compact` thay vì `/clear` |
| Multi-session same project | Race conflict | One at a time per project |

## Tóm tắt bài 2

- Session = conversation full history, auto-saved.
- `--resume` picker, `--continue` recent.
- **Checkpoints** auto trước destructive tool. **Esc Esc** rewind menu.
- Rewind = in-session memory. Git = persistent disk.
- Pattern safe YOLO: git commit → YOLO → diff → commit hoặc reset.
- `/clear` wipe. `/compact` summarize (better for continuity).
- Monitor context với `/cost`. Warn ~67% used.
- Multi-session parallel: independent contexts, useful for multi-project work.

**Bài kế tiếp** → [Bài 3: Ralph Loops — Autonomous agentic coding](03-ralph-loops.md)
