# Bài 2: 5 Principles of Successful Vibe Coding — Be the Boss

Karpathy's 5 rules đã giới thiệu bài 1. Bài này deep dive **5 principles chi tiết** cho người mới lẫn senior: ví dụ tốt/xấu, anti-pattern, application thực tế. Đây là **manifesto** mà mọi vibe engineer 2026 nên tattoo vào não.

## Principle 1: Be the Boss, Not the Worker

```text
[Boss mindset]
- You: define WHAT (problem, success criteria, constraints)
- AI: deliver HOW (implementation, code, choices)
- You: review, redirect, accept/reject

[Worker mindset — anti-pattern]
- You: write code line-by-line as AI suggests
- AI: just autocomplete
- You: still doing all thinking
```

### Practical examples

**Bad — worker mode**:
```text
You: "Write a function"
AI:  function foo() { ←  bạn nhìn từng dòng, hand-edit
You: [edit each line manually]
```

**Good — boss mode**:
```text
You: "Build a user registration flow:
- Email + password validation (zod)
- Bcrypt hash before save
- Send verification email
- Return success/error states
Use existing /lib/email and /lib/db.
Tests included."

AI: [builds end-to-end, presents diff]
You: [review, request changes, accept]
```

### How to think like boss

```text
[Before prompting, decide]
1. What's the goal? (1 sentence)
2. What's success? (testable)
3. What can't change? (constraints)
4. What style? (matches project)
5. When done? (acceptance criteria)
```

Spend 5 phút phẳng spec → AI 30 phút build đúng → 35 min total.
Skip spec → AI 60 min lạc đường → bạn redo → 90+ min.

## Principle 2: Verify, Don't Trust

```text
[Verify checklist]
✓ Run tests after each feature
✓ Check security: secrets in code? SQL injection?
✓ Lint + typecheck: any new errors?
✓ Manual test: happy path + edge case
✓ Diff review: does this match what I asked?
✓ Run in production-like env trước deploy
```

### Hallucination categories

```text
[API hallucination]
AI: "Use stripe.subscriptions.cancelAll(customerId)"
Real: function không tồn tại
→ Verify với doc thật

[Convention hallucination]
AI: "Add to nextConfig.experimental.serverActions"
Real: deprecated trong Next.js 15
→ Check version

[Logic hallucination]
AI: "if (date < tomorrow) ..."
Real: timezone bug
→ Test với edge case

[Security hallucination]
AI: "Skip CSRF check, it's internal API"
Real: insecure default
→ Apply security baseline
```

### Test-driven verify

```text
[Anti-pattern]
1. Ask AI build feature
2. Test manually qua UI
3. Hope nothing breaks elsewhere
4. Ship

[Pattern]
1. Ask AI write test first
2. Ask AI build feature
3. AI run test, iterate til green
4. You verify test catches real bugs
5. Ship
```

## Principle 3: Sandbox Aggressively

Đã touch bài 1. Sâu hơn:

### Defense in depth

```text
[Layer 1] No prod secrets in working dir
- .env.production NEVER in agent context
- Sanitize repo trước YOLO

[Layer 2] Filesystem isolation
- Docker volume mount specific dir
- Read-only mount cho ref docs

[Layer 3] Network isolation
- --network=none cho task không cần net
- Allowlist domains cho task có net

[Layer 4] Process isolation
- --user=non-root
- --cap-drop=ALL
- ulimit để chống fork bomb

[Layer 5] Git safety
- Branch isolation (working in feature branch)
- Pre-push hook block force push
- Backup main branch
```

### Production-grade sandbox

```dockerfile
FROM node:20-bookworm

# Non-root user
RUN useradd -m -u 1000 vibe
USER vibe
WORKDIR /home/vibe/workspace

# Capabilities dropped at runtime via --cap-drop
# Network controlled at runtime via --network

# Read-only filesystem for system
# Writable only /home/vibe/workspace + /tmp

ENTRYPOINT ["claude", "--dangerously-skip-permissions"]
```

```bash
docker run -it --rm \
  --cap-drop=ALL \
  --read-only \
  --tmpfs /tmp \
  -v $(pwd):/home/vibe/workspace \
  -e ANTHROPIC_API_KEY \
  vibe-sandbox
```

## Principle 4: Keep Human-Readable Artifacts

Vibe coding generate code nhanh. Future maintenance khó vì:
- AI viết code khó hiểu cho future-you.
- Spec mơ hồ — không biết WHY của decisions.
- Commit "feat: stuff" — không trace được.

### Solution: documents at each stage

```text
[Before code]
- spec.md       — what + why
- agents.md     — conventions
- ADR.md        — architecture decisions

[During code]
- Descriptive commit messages
- PR description spelling intent
- Code comment cho WHY (không WHAT)

[After code]
- README updated
- CHANGELOG updated
- Test cases as documentation
```

### Good commit pattern

```text
[Bad]
- "fix"
- "update"
- "AI changes"
- "feat: add stuff"

[Good]
- "feat(auth): add OAuth callback handling for GitHub provider

   Previously assumed single provider. Refactored to provider
   registry pattern. Future: add Google, Discord providers.
   
   Tests: auth/oauth.test.ts covers happy + error paths."
```

→ Future-you (or teammate) can understand.

### Architecture Decision Records (ADR)

```markdown
# ADR-001: Use SQLite for local dev, Postgres prod

## Date: 2026-06-15

## Context
- Need dev DB that runs in container
- Prod requires concurrent writes, JSON columns

## Decision
- Dev: SQLite (zero-setup)
- Prod: Postgres 16
- Use Drizzle ORM (supports both dialects)

## Consequences
- Pro: Fast dev iteration
- Pro: Production matches battle-tested stack
- Con: Dialect differences in migrations
- Mitigation: Test against both in CI
```

→ 1 file per major decision. AI can read this in future context.

## Principle 5: Embrace Exponentials, Accept Volatility

Tools này thay đổi **mỗi tuần**. Setup hôm nay outdated tháng sau.

```text
[2024 Q1]      ChatGPT copy-paste
[2024 Q3]      Cursor mainstream
[2025 Q1]      Claude Code launched
[2025 Q2]      MCP standard
[2025 Q3]      Sub-agents stable
[2025 Q4]      Cloud sandboxes (Sprites.dev)
[2026 Q1]      Multi-agent orchestration mainstream
[2026 Q2]      ?? — sẽ có gì?
```

### Accept = adapt, không cố giữ setup

```text
[Don't]
- Build elaborate workflow around 1 specific tool version
- Resist switching when better tool emerges
- Argue "but X always works" khi tool đã obsolete

[Do]
- Stay light on tool-specific config
- agents.md travels with you (tool-agnostic)
- Spec.md format không bao giờ obsolete
- Re-evaluate stack mỗi quarter
```

### Exponential = compound learning

```text
[Year 1 of vibe coding]
- Learn 1 tool (Cursor)
- 2x productivity

[Year 2]
- Master Claude Code
- Add MCP/skills
- 5x productivity

[Year 3]
- Multi-agent orchestration
- 20x productivity?

→ Skill compounds. Người bắt đầu sớm có lead khó đuổi.
```

### Information diet

```text
[Curated sources to follow]
- Anthropic blog
- Simon Willison
- Andrej Karpathy
- Latent Space podcast
- Practical AI weekly newsletter
- Github trending /go-coding-agent

[Ignore]
- "AI broke everything" Twitter rants
- 100% AI-generated YouTube tutorials
- Tool comparison benchmarks Day 1 release
- Crypto-style hype accounts
```

## Anti-patterns combined

```text
[Anti-pattern: Worker + Skip verify + No sandbox]
- AI generates code
- You don't review
- You don't test
- You don't sandbox
- Push directly to main
- → Production incident in 2 weeks

[Anti-pattern: Boss + Verify + Skip docs]
- Spec rõ
- Test pass
- But no commit history, no ADR
- Future-you 6 tháng sau: "what was this for??"
- → Refactor blocked

[Anti-pattern: Rigid setup]
- Locked into Cursor + GPT-4
- Sonnet 4.5 / Opus 4.5 launches
- Refuse to try
- → 6 tháng sau, 5x slower than peers
```

## Pattern: Daily vibe engineer routine

```text
[Morning]
- Read 1 blog post (Anthropic, Simon)
- Check Twitter (curated list 30 min max)
- Update mental model

[Workflow]
- Spec.md trước code
- agents.md updated khi quy luật mới
- 1 task = 1 conversation
- Verify mỗi feature
- Commit small, descriptive

[Evening]
- Review what AI built today
- Note: what worked, what didn't
- Update agents.md with learnings
- Sleep on hard decisions
```

## Tóm tắt bài 2

- **Principle 1: Be the Boss** — Define WHAT, AI does HOW. Spend 5 min spec.
- **Principle 2: Verify, Don't Trust** — Test, lint, security check. Hallucination types: API, convention, logic, security.
- **Principle 3: Sandbox Aggressively** — Defense in depth: secrets, FS, network, process, git.
- **Principle 4: Human-Readable Artifacts** — spec.md, agents.md, ADR, descriptive commit, PR description.
- **Principle 5: Embrace Exponentials** — Tool stack adapts quarterly. Spec format eternal. Curate info diet.
- Anti-patterns: skip verify + no sandbox = production incident. Skip docs = future-you blocked.
- Daily routine: read 30 min, spec first, commit small.

**Bài kế tiếp** → [Bài 3: Build Kanban full-stack với Copilot + Docker + Tests](03-kanban-fullstack.md)
