# Bài 2: Sprites.dev Hands-on — Setup, Workflows, Best Practices

Sprites.dev là **production cloud Claude Code**. Bài này build muscle memory: setup từ zero, submit task, configure approval workflow, integrate Slack, audit log, scale to 100 task/ngày. Đây là setup mà engineering team 2026 cần để leverage agent at scale.

## Initial setup

### Step 1: Account + repo connect

```text
1. sprites.dev → "Sign in with GitHub"
2. Authorize Sprites GitHub App
3. Pick repos to connect (granular per repo)
4. Verify: sprites.dev/dashboard shows your repos
```

### Step 2: Repo-level config

```yaml
# .sprites/config.yml (commit to repo)
version: 1

# Default branch base
base_branch: main

# Default model
model: claude-sonnet-4-5

# Container size
size: medium  # small (1 CPU, 2GB) | medium (2 CPU, 4GB) | large (4 CPU, 8GB)

# Approval mode
approval:
  default: review-first   # never auto-merge
  
  # Auto-merge rules (must all pass)
  auto_merge_when:
    - tests_pass: true
    - lint_clean: true
    - diff_size_lines: "< 200"
    - paths_match: ["docs/**", "*.md"]   # only docs PRs

# Resources Claude Code can access
mcp_servers:
  - github
  - context7

# Skills available
skills:
  - conventional-commit
  - test-driven-fix
  - sql-review

# Hooks
hooks:
  pre_pr:
    - "pnpm test"
    - "pnpm lint"
    - "pnpm typecheck"

# Allowed environments
env_vars:
  - DATABASE_URL_TEST
  - SENTRY_DSN_TEST

# Forbidden patterns
forbidden:
  files:
    - ".env.production"
    - "secrets/**"
  branches:
    - main
    - production
```

### Step 3: Secret management

```text
Sprites UI → Repo settings → Environment variables
- ANTHROPIC_API_KEY (Sprites provides if subscription)
- DATABASE_URL_TEST (your test DB)
- CEREBRAS_API_KEY (if app uses)

Marked as "encrypted at rest, injected only in container".
```

→ Container has env vars set. Code doesn't see in repo.

## Submit first task

### Web UI

```text
sprites.dev → New Task

Form:
- Repo: owner/repo
- Base branch: main
- Task description: 
  "Add password strength meter to register page.
   Show 0-4 score (Very Weak → Strong) based on:
   - Length 8+
   - Has uppercase
   - Has number
   - Has symbol
   Block submit if score < 3."
- Approval: Review first (auto-merge disabled for first task)

Submit
```

Sprites:
- Spawn container (~30s)
- Clone repo
- Run Claude Code
- Stream log live in UI

### Status during run

```text
[Live UI shows]
- Container ID: spr-abc123
- Status: 🟡 Running
- Started: 5 min ago
- Last log:
  [12:34:01] Reading register/page.tsx
  [12:34:03] Glob for password components
  [12:34:05] No existing component. Creating new.
  [12:34:08] Edit register/page.tsx — import meter
  [12:34:12] Bash: pnpm test
  [12:34:15] Tests pass
  [12:34:17] Opening PR
```

### Task done

```text
✅ Task complete
Duration: 12 min
PR: github.com/owner/repo/pull/87
Diff: +85 lines, -3 lines

[Review buttons]
- View diff
- View logs (full)
- Approve & merge
- Request changes (re-trigger)
- Discard (close PR + delete branch)
```

## Slack integration

### Setup

```text
Sprites UI → Integrations → Add Slack
- Authorize Slack app
- Pick channel #dev-agents (notifications)
- Allow slash commands
```

### Submit from Slack

```text
[Slack #dev-agents]
@you: /sprites repo:owner/app task:Add dark mode toggle

[Sprites bot]
🤖 Task queued: spr-xyz789
Container starting...

[15 min later]
✅ PR #92 opened: github.com/owner/app/pull/92
React with ✅ to approve or ❌ to discard.
```

### Approve via emoji

```text
You react ✅
Sprites bot: Merged! PR #92 → main.
```

→ Async workflow. Submit on commute, approve in lunch.

## Approval workflows

### Workflow 1: Strict (default)

```text
Every PR requires human review.
- Submitter ≠ approver (separation of duty).
- Reviewer must comment "LGTM" or approve in GitHub UI.
- Sprites merges only after approval.
```

### Workflow 2: Trusted paths

```yaml
auto_merge_when:
  - paths_match: ["docs/**", "README.md", "CHANGELOG.md"]
```

→ Doc-only PRs auto-merge. Trust agent for low-risk paths.

### Workflow 3: Tests-gated

```yaml
auto_merge_when:
  - tests_pass: true
  - coverage_delta: ">= 0"      # don't decrease coverage
  - diff_size_lines: "< 50"
```

→ Small PRs that don't decrease coverage auto-merge.

### Workflow 4: Two-agent review

```text
- Agent A implements
- Agent B (code-reviewer) reviews
- If both happy, merge
- Else request changes back to A
```

Config:
```yaml
review_agent: code-reviewer
loop_until_approved: true
max_iterations: 3
```

## Scaling to 50+ tasks/day

```text
[Team workflow scaling]
1. Backlog tickets in Jira with "AI-ready" label
2. Sprites webhook listens for Jira ticket label
3. Auto-submit to Sprites with template prompt:
   "Implement Jira ticket {key}: {summary}. See {url}."
4. Sprites runs in parallel (paid tier supports concurrent)
5. PRs queue for review
6. Engineers spend day reviewing instead of writing
```

Result:
- 1 engineer reviews 30-50 PR/day.
- vs writing 5-10 features/week traditional.
- 5-10x output.

### Code review queue

```text
[Morning standup]
- Sprites generated 25 PRs overnight
- Review priority:
  - 🔴 5 PRs need attention (tests failing or large diff)
  - 🟡 12 PRs need quick review
  - 🟢 8 PRs trivial (auto-merge candidates)
```

## Audit + observability

### Audit log

```text
Sprites Dashboard → Audit

Filters:
- User
- Repo
- Date range
- Status

Each entry:
- Task ID, submitter, prompt
- Container start/end time
- All tool calls executed
- Files touched
- Final PR + outcome
- Cost ($/task)
```

→ Compliance: SOC2, ISO27001 review.

### Cost dashboard

```text
[This month]
- Tasks: 234
- Total cost: $48.20
- Avg cost/task: $0.21
- Top costly task: spr-xyz $3.50 (large refactor)
- Failed tasks: 12 (no PR)
```

→ Identify expensive patterns. Optimize.

## Best practices

```text
✓ Spec.md in repo — agent has source of truth
✓ CLAUDE.md detailed — conventions consistent
✓ Tests in repo — quality gate
✓ Small tasks (1-2 hours agent work) — predictable
✗ Big "build everything" tasks — fail rate high
✓ Branch protection on main — even agent can't push directly
✓ Review queue daily — avoid PR backlog
✓ Approve criteria documented — consistent decisions
✓ Cost cap per repo — runaway agent contained
✗ Don't reuse container — fresh per task is safer
✓ Webhook integrate with Jira/Linear — automate queue
```

## Anti-patterns

```text
❌ Submit "improve the app" without spec
❌ Submit task that needs design discussion
❌ Auto-merge everything (trust agent too much)
❌ Skip review queue (PR pile up)
❌ Run prod creds in sandbox
❌ Mix human + agent PRs same branch
```

## Compare local vs Sprites for same task

```text
Task: Add OAuth GitHub provider

[Local Claude Code]
- 45 min agent work
- I sit, watch, occasionally redirect
- Final: PR opened, I merge
- Cost: $1.50 (token)
- Lock me up 45 min

[Sprites]
- Submit (30 sec)
- Sprites runs 45 min
- I work on other thing
- PR ready when I'm done other task
- Review (5 min)
- Cost: $0.21 (Sprites efficient routing) + $0.50 (compute)
- Lock me up 5 min

→ Sprites 9x productivity for me
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Forget repo connect | Submit fails | Verify in dashboard |
| Secrets in repo | Sprites sees | Use env vars |
| Auto-merge no tests | Bad code lands | Tests gate |
| Single user account team | No audit per person | Team tier with SSO |
| No spec → vague task | Wrong output | Spec.md committed |
| Concurrent tasks same file | Conflict | Branch isolation |
| Forget cost cap | Bill shock | Set monthly limit |
| Mobile review without context | Approve wrong PR | Review fully in browser |

## Tóm tắt bài 2

- Sprites.dev hands-on: connect repo, `.sprites/config.yml`, secrets.
- Submit task: web UI, Slack `/sprites`, mobile, API.
- Approval workflows: strict review, trusted paths, tests-gated, two-agent.
- Scale to 50+ task/day: Jira webhook → auto-submit → review queue.
- Audit + cost dashboards for compliance.
- Best practices: spec, tests, small tasks, branch protection.
- ~9x productivity vs local for tasks > 30 min.

🎉 **Hoàn thành Phase 8** — cloud execution mastery. Phase 9 vào programmatic (Agent SDK) + Telegram/WhatsApp bot.

**Bài kế tiếp** → [Phase 9 - Bài 1: Claude Agent SDK programmatic](../phase-9-programmatic/01-agent-sdk.md)
