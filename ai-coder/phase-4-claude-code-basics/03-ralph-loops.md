# Bài 3: Ralph Loops — Autonomous coding overnight

"Ralph Loop" là tên do community đặt cho **pattern lặp prompt liên tục** cho Claude Code. Ý tưởng đơn giản: thay vì gõ 1 prompt rồi đợi, viết script gửi prompt liên tục, agent tự sửa lỗi loop cho đến khi task done. Người ta để Ralph chạy qua đêm → sáng dậy code xong. Bài này dạy nguyên lý, setup, safety, và khi nào không nên dùng.

## Ralph là ai?

Inspired by Andrej Karpathy's tweet (a.k.a "Ralph from Karpathy AI hacker shop") — pattern bash loop:

```bash
while true; do
    claude -p "continue task from spec.md until all tests pass"
    sleep 1
done
```

→ Vòng lặp vô tận: agent run → exit → script restart agent.

Mỗi run, agent:
1. Read spec.md
2. Check progress (git, tests)
3. Continue where left off
4. Exit when done OR token limit OR error

Loop bash re-spawn agent đến khi spec.md đạt criteria.

## Tại sao cần?

```text
[Without Ralph]
- Long task (5h+)
- Agent hits context limit mid-task
- Stuck, you not at keyboard
- Manual restart needed
- Lost time

[With Ralph]
- Spec.md is source of truth
- Agent loop self-recovers
- New session = fresh context
- Spec.md tracks progress (TODO list)
- Done when all checks pass
```

## Setup minimal Ralph

```bash
# ralph.sh
#!/bin/bash
set -e

while true; do
    # Run agent with spec
    claude --dangerously-skip-permissions -p "
Read spec.md and progress.md. Continue task.
Update progress.md after each step.
Run tests after each change.
Exit when all items in spec.md marked DONE.
"
    
    # Check exit condition
    if grep -q "ALL DONE" progress.md 2>/dev/null; then
        echo "✅ Task complete"
        break
    fi
    
    echo "⏳ Re-spawning agent..."
    sleep 5
done
```

```bash
chmod +x ralph.sh
./ralph.sh
```

## Spec-driven Ralph

### spec.md format

```markdown
# Project: AI Chat Widget

## Goal
Build embedded chat widget for any website.

## Tasks
- [ ] T1: Scaffold React component library
- [ ] T2: Add chat UI (input, message list, send button)
- [ ] T3: Add OpenRouter API integration with streaming
- [ ] T4: Add theme customization (color, font, position)
- [ ] T5: Build embed script (<script src=...>)
- [ ] T6: Test on 3 sample HTML pages
- [ ] T7: Write README + usage example
- [ ] T8: All tests pass + lint clean

## Acceptance
ALL DONE when:
- All T1-T8 marked [x]
- All tests pass: pnpm test
- Lint clean: pnpm lint
- Demo page works: open demo.html in browser
```

### progress.md updates

```markdown
# Progress

## 2026-06-15 14:23
- T1: ✅ Component library scaffolded with tsup
- Tests: 0 (no tests yet)

## 2026-06-15 14:31
- T2: ✅ Chat UI built
- Tests: 3 (all pass)

## 2026-06-15 14:45
- T3: ✅ OpenRouter integration with EventSource
- Tests: 5 (all pass)

... 

## 2026-06-15 18:42
- T8: ✅ Lint + tests all green
- ALL DONE
```

→ Agent updates progress.md mỗi step. Loop checks "ALL DONE" → exit.

## Advanced Ralph with monitoring

```bash
#!/bin/bash
# ralph-pro.sh
set -e

ITERATION=0
MAX_ITERATIONS=50
START_TIME=$(date +%s)

while [ $ITERATION -lt $MAX_ITERATIONS ]; do
    ITERATION=$((ITERATION+1))
    echo "▶ Iteration $ITERATION"
    
    # Capture iteration log
    LOG_FILE="logs/ralph-$ITERATION.log"
    mkdir -p logs
    
    # Run with timeout
    timeout 30m claude --dangerously-skip-permissions -p "$(cat prompt.txt)" \
        2>&1 | tee "$LOG_FILE"
    EXIT_CODE=${PIPESTATUS[0]}
    
    # Check completion
    if grep -q "ALL DONE" progress.md 2>/dev/null; then
        echo "✅ All done"
        break
    fi
    
    # Detect stuck (no progress in N iterations)
    if [ $ITERATION -gt 1 ]; then
        DIFF=$(diff "logs/ralph-$((ITERATION-1)).log" "$LOG_FILE" | wc -l)
        if [ "$DIFF" -lt 10 ]; then
            echo "⚠️ Loop stuck — same output"
            break
        fi
    fi
    
    # Cost check
    DURATION=$(($(date +%s) - START_TIME))
    if [ $DURATION -gt 28800 ]; then  # 8 hours
        echo "⏰ Time limit reached"
        break
    fi
    
    sleep 30
done

# Notify
osascript -e 'display notification "Ralph finished" with title "Claude Code"' 2>/dev/null
```

Features:
- Max iterations cap.
- Log per iteration.
- Stuck detection.
- Time limit.
- Notification on done.

## prompt.txt — Reusable prompt

```text
# prompt.txt

You are continuing autonomous work on this project.

CONTEXT:
- spec.md defines goals
- progress.md tracks what's done
- CLAUDE.md defines conventions

INSTRUCTIONS:
1. Read spec.md and progress.md
2. Identify next uncompleted task
3. Implement it
4. Run relevant tests
5. If tests fail, fix and retry (max 3 times)
6. Update progress.md with status + timestamp
7. If all tasks done, append "ALL DONE" to progress.md
8. Commit each completed task with descriptive message

RULES:
- Don't skip tests
- Don't make assumptions — verify
- Don't add new dependencies without noting in progress.md
- Don't modify spec.md
- Be concise in progress.md updates

If stuck or unclear, append BLOCKED: <reason> to progress.md and exit.
```

→ Reuse cho mọi Ralph run.

## Use case examples

### Example 1: Bug bash overnight

```text
spec.md:
## Goal
Fix all open GitHub issues with label "bug-prio-low"

## Tasks
- [ ] Fetch list of issues with label
- [ ] For each issue:
  - Reproduce locally
  - Fix
  - Test
  - Open PR
- [ ] Mark ALL DONE when no more issues
```

→ Sáng dậy: 10 PR mở. Bạn review + merge.

### Example 2: Refactor migration

```text
spec.md:
## Goal
Migrate all code from class components → function components + hooks

## Tasks
- [ ] List all class components: grep -r 'class .* extends Component'
- [ ] For each component:
  - Convert to function + hooks
  - Update tests
  - Verify visual + behavior parity
- [ ] Lint clean
- [ ] ALL DONE
```

### Example 3: Test coverage push

```text
spec.md:
## Goal
Achieve 80% test coverage in /backend

## Tasks
- [ ] Run pytest --cov
- [ ] List files with coverage < 80%
- [ ] For each:
  - Add tests for uncovered branches
  - Verify with --cov
- [ ] When >= 80% overall: ALL DONE
```

## Safety considerations

```text
[Critical safety]
✓ Run in container/sandbox
✓ Read-only credentials only
✓ Git: working branch, never main
✓ Backup before start
✓ Monitor cost (set OpenRouter limit)
✓ Time limit (cron kill after N hours)
✓ Notification on stuck

✗ Don't Ralph in prod env
✗ Don't Ralph with write access to DB prod
✗ Don't Ralph leave overnight first time — observe few hours
```

## Stuck detection patterns

```text
[Symptom: same error every iteration]
→ Spec.md ambiguous OR task impossible
→ Stop, refine spec

[Symptom: agent invents fake progress]
→ Update prompt: "verify with actual file content, no fabrication"

[Symptom: tests pass but feature broken]
→ Tests are weak, ralph gaming them
→ Add E2E verification

[Symptom: cost spike]
→ Agent reading huge files
→ Add explicit guidance in spec to use grep/glob

[Symptom: agent loop on same task forever]
→ Set max attempts per task in prompt
```

## Cost management

```text
[Token estimate per iteration]
- Read CLAUDE.md, spec.md, progress.md: ~5K
- Read 5 source files: ~15K
- Reason + edit: ~5K
- Tool results: ~10K
- Total per iter: ~35K tokens

[For 8h overnight run]
- ~30 iterations
- ~1M tokens total
- Sonnet 4.5: ~$3-5 per night
- Opus 4.5: ~$15-20 per night

[Mitigation]
- Use Sonnet for execution, Opus only for planning
- /compact built-in trong prompt (less re-read)
- Spec.md concise
```

## Alternatives to Ralph

### Sprites.dev (Phase 8)

```text
Same idea, but managed:
- Cloud sandbox
- Auto-restart
- Cost cap
- Web UI
```

### Claude Agent SDK (Phase 9)

```text
Programmatic Ralph:
- Python SDK gọi Claude Code
- Custom loop logic
- Integration với enterprise systems
```

### Multi-agent (Phase 10)

```text
Instead of 1 agent loop:
- 5 agents work parallel
- Each handles 1 task type
- Coordinator merges
```

## Bẫy thường gặp với Ralph

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Spec mơ hồ | Loop forever | Spec criteria rõ |
| Không có "ALL DONE" check | Bug exit logic | Explicit signal |
| Không có max iteration | Runaway cost | Set MAX_ITERATIONS |
| Run trên main branch | Risk break code | Feature branch |
| Không monitor cost | Bill shock | Cost cap OpenRouter |
| Trust progress.md blindly | Agent fakes progress | Verify by tests |
| Setup once, run forever | Outdated spec | Re-validate weekly |
| Quên kill process | Forgotten Ralph runs | Cron kill |

## Tóm tắt bài 3

- **Ralph Loop** = bash loop respawn Claude Code đến khi spec done.
- Goal: long task overnight, self-recovery from context limit.
- Setup minimal: `while true; do claude -p "..."; done`.
- Advanced: max iterations, logs, stuck detection, time limit.
- spec.md (immutable goals) + progress.md (mutable tracker) pattern.
- prompt.txt reusable for any Ralph project.
- Use cases: bug bash, refactor migration, test coverage push.
- Safety: container, branch, time limit, cost cap.
- Cost: ~$3-5/night Sonnet, $15-20 Opus.
- Alternatives: Sprites.dev managed, Agent SDK programmatic, multi-agent parallel.

🎉 **Hoàn thành Phase 4** — Claude Code mastery basics. Phase 5 vào "Big Three" của extensibility: MCP, Skills, Plugins.

**Bài kế tiếp** → [Phase 5 - Bài 1: MCP servers — Universal tool protocol](../phase-5-mcp-skills-plugins/01-mcp-servers.md)
