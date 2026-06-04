# Bài 1: Cloud Sandboxes — Sprites.dev + 5 ways to run remote

Local Claude Code mạnh nhưng có giới hạn: máy bạn phải mở, RAM tốn, network bạn share. **Cloud sandbox** giải quyết: spawn fresh container trên cloud, agent chạy YOLO an toàn, bạn submit task qua web/mobile, sleep, sáng dậy review PR. Bài này: Sprites.dev (Anthropic-blessed), Codex Cloud, Copilot Workspace, third-party, mobile/web.

## Vì sao cần cloud sandbox?

```text
[Local Claude Code limitations]
- Machine must stay on
- RAM 2-4GB per session
- Network = your connection
- YOLO mode = risk your filesystem
- No mobile access
- Compete với other dev work

[Cloud sandbox benefits]
- Isolated container per task
- YOLO safe (sandbox can't escape)
- Run while you sleep
- Mobile/web UI submit task
- Parallel tasks (5 agents concurrent)
- Scale to 100s of tasks/day
```

## Sprites.dev — Official Anthropic cloud Claude Code

```text
[Sprites.dev architecture]
- Anthropic-blessed (special partnership)
- Each task = fresh container with Claude Code
- GitHub integration native
- Branch-per-task workflow
- Web UI for submit + review
```

Pricing as of 2026:
- **Free tier**: 5 tasks/day, max 1h each.
- **Pro $30/mo**: 100 tasks/day, max 4h each.
- **Team $100/user/mo**: unlimited, audit log, SSO.

### Setup

```text
1. sprites.dev → sign in GitHub
2. Connect repos (install GitHub App)
3. Choose default branch (usually main)
4. Set environment vars (secrets in Sprites UI)
```

### Submit task

```text
[Web UI: New task]
- Repo: owner/repo
- Branch base: main
- Task: "Implement OAuth GitHub login per spec.md"
- Model: claude-sonnet-4-5
- Approval: [auto-merge | review-first]
```

Sprites:
1. Spawn fresh container.
2. Clone repo.
3. Set env vars.
4. Spawn Claude Code in container.
5. Stream input task as prompt.
6. Claude Code YOLO mode within sandbox.
7. When done: opens PR.
8. Notify you (email/Slack).
9. (Optional) Auto-destroy container.

### Review flow

```text
[Sprites UI]
- Live log stream while running
- Diff preview when done
- Approve → merge to base
- Reject → discard container + branch
- Comment → request changes (agent re-runs)
```

### Sprites.dev API

```bash
sprites submit \
  --repo owner/repo \
  --task "Add password strength meter" \
  --base main \
  --approval auto-merge
```

Programmatic submit → trigger from Jira webhook, Slack command, etc.

## Codex Cloud (OpenAI)

```text
[Architecture similar Sprites]
- OpenAI hosted Codex agent
- GPT-5.2 + o3 reasoning available
- Codex cloud spawn per task
- Slack + GitHub integration
```

Pricing:
- Bundled with ChatGPT Plus $20/mo (limited).
- Codex Cloud Pro $50/mo (more tasks, larger time limit).
- Enterprise SLA.

Strengths:
- o3 reasoning for hard architectural changes.
- OpenAI ecosystem integration.
- Slack-native (`/codex implement ...`).

Weakness:
- Less mature than Sprites.
- Tied to OpenAI models only.

## GitHub Copilot Workspace

```text
[Built into github.com]
- Cloud Copilot agent
- Repo-aware out of box
- "Spec → Plan → Implement" UI
- Always opens PR (never auto-merge)
```

Pricing:
- Bundled in Copilot Pro+/Enterprise.

Strengths:
- Free for Copilot subscribers.
- Best GitHub integration.
- Audit trail for enterprise.

Weakness:
- Slower iteration (multi-step UI).
- Less flexibility than Sprites.

## Third-party clouds

### Replit Agent

```text
- Web IDE + cloud sandbox combined
- $20/mo
- Good for prototypes, less production
```

### Devin (Cognition AI)

```text
- "Autonomous SWE" cloud agent
- Premium pricing ($500+/mo)
- Slack-first interface
- Long-running multi-day tasks
- Best for: full feature build from product spec
```

### Lovable

```text
- App generator cloud
- "Prompt → live app" UI
- Less code control, more product-focused
- Good for landing pages, simple MVPs
```

## 5 ways to run Claude Code remotely

### Way 1: SSH into VPS

```bash
ssh dev-vps "claude --dangerously-skip-permissions"
```

Simple. You own the VPS. Pay for compute.

### Way 2: GitHub Actions

```yaml
# .github/workflows/agent.yml
name: AI Agent Task

on:
  workflow_dispatch:
    inputs:
      task:
        description: "Task for Claude Code"
        required: true

jobs:
  agent:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install Claude Code
        run: curl -fsSL https://claude.ai/install.sh | sh
      - name: Run agent
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          claude --dangerously-skip-permissions -p "${{ inputs.task }}"
```

→ Trigger from GitHub UI, slack, or webhook. CI minutes used.

### Way 3: Sprites.dev (recommended)

Already covered. Best ergonomics.

### Way 4: Mobile app

```text
[Sprites mobile app — iOS/Android]
- Submit task from phone
- Voice input
- Push notification on done
- Review diff in app
- Approve → merge
```

Use case: idea hit during commute, agent works while you ride.

### Way 5: Telegram/WhatsApp bot

Phase 9 deep dive. Quick preview:
```text
You → bot: "Add password meter to register"
Bot → spawns cloud Claude Code
Bot → "Working..."
[15 min later]
Bot → "PR #87 opened: <link>"
You → "Approve"
Bot → merges
```

## Cost compare

| Solution | Setup | Pricing | Best for |
|---|---|---|---|
| Sprites.dev | 5 min | $30/mo Pro | Most use cases |
| Codex Cloud | 5 min | $50/mo | OpenAI fans |
| Copilot Workspace | 0 (already have Copilot) | bundled | GitHub-heavy team |
| SSH VPS | 30 min | $5-50/mo VPS + $$ API | Tinkerers |
| GitHub Actions | 15 min | $$ free per month then $0.008/min | Existing CI heavy |
| Devin | 30 min | $500+/mo | Long autonomous tasks |
| Mobile/Telegram | 1 hour build | Sprites + small infra | Mobile-first |

## When NOT cloud sandbox

```text
[Local better]
- Quick fixes (< 5 min)
- Heavy interactive iteration
- Confidential code (compliance)
- No internet
- Learning (more feedback loop)

[Cloud better]
- Overnight runs
- Parallel tasks
- Mobile workflow
- Team coordination (audit)
- YOLO safety critical
```

## Hybrid pattern

```text
[Daily routine combine]
- Morning: local Claude Code in flow (iterate)
- Lunch: queue 3 tasks on Sprites
- Afternoon: review PRs Sprites opened
- Evening: queue overnight refactor on Sprites
- Sleep: agent works
- Morning: review
```

## Security considerations

```text
[Sprites.dev — what's exposed]
- Repo content (Sprites sees code)
- Env vars set in Sprites UI
- Git tokens (for clone + push)

[Compliance check]
- SOC2: Sprites has it
- HIPAA: not yet
- On-prem option: Enterprise tier

[Mitigation]
- Don't put .env.production in repo
- Use OIDC short-lived tokens
- Separate prod creds from dev
- Audit log review weekly
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Submit task to cloud without spec | Wrong output | Spec.md committed |
| No tests in repo | Agent confidence false | Add tests first |
| Auto-merge enabled too early | Bad code lands | Review first phase |
| Multiple agents same branch | Conflicts | Branch-per-task |
| Forget cost cap | Bill shock | Set monthly limit |
| Sensitive data in repo | Cloud sees | Sanitize first |
| Trust cloud agent blindly | Bug | Review diff always |
| Stuck task no timeout | Forever billing | Set max duration |

## Tóm tắt bài 1

- **Cloud sandbox** = isolated container with Claude Code, run while you sleep.
- **Sprites.dev** = Anthropic-blessed, free 5 task/day, Pro $30/mo, Team $100/user.
- **Codex Cloud** = OpenAI alternative, o3 reasoning.
- **Copilot Workspace** = bundled with Copilot, GitHub-native.
- **5 ways remote**: SSH VPS, GitHub Actions, Sprites, Mobile app, Telegram/WhatsApp.
- Hybrid pattern: local for flow, cloud for overnight/parallel.
- Security: spec, tests, branch isolation, cost cap, audit weekly.

**Bài kế tiếp** → [Bài 2: Sprites + GitHub setup hands-on](02-sprites-hands-on.md)
