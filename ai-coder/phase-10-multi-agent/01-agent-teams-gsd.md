# Bài 1: Agent Teams + GSD — Multi-agent orchestration patterns

Phase 9 vẫn là **1 agent per task**. Phase 10 vào pattern frontier 2026: **multiple agents collaborate parallel** trên 1 project. 2 phương pháp lead: **Claude Code Agent Teams** (Anthropic native) và **GSD — Goal-Spec-Design** (community pattern). Bài này so sánh, build trading dashboard với cả 2.

## Vì sao multi-agent?

```text
[Single agent throughput]
- Frontend impl: 30 min
- Backend impl: 30 min
- Tests: 20 min
- Total: 80 min serial

[Multi-agent parallel]
- Agent A frontend: 30 min  ┐
- Agent B backend: 30 min   ├→ parallel
- Agent C tests: 20 min    ┘
- Coordinator merge: 10 min
- Total: 40 min (2x speedup)

[Plus: specialization]
- Agent A: Sonnet (UI code well)
- Agent B: Opus (DB schema design)
- Agent C: Haiku (test boilerplate)
- Cost optimal, quality matched
```

→ Throughput + specialization.

## Pattern 1: Claude Code Agent Teams (native)

Anthropic-built feature. Define team in `.claude/agents/teams/`:

```yaml
# .claude/agents/teams/full-stack.yml
name: full-stack-team
description: Build full-stack features with parallel frontend + backend + test

coordinator:
  agent: full-stack-coordinator
  model: claude-opus-4-5

members:
  - name: frontend
    agent: react-developer
    model: claude-sonnet-4-5
    paths: ["frontend/**"]
    tools: ["read", "edit", "bash"]
  
  - name: backend
    agent: fastapi-developer
    model: claude-sonnet-4-5
    paths: ["backend/**"]
    tools: ["read", "edit", "bash"]
  
  - name: tester
    agent: test-writer
    model: claude-haiku-4-5
    paths: ["**/__tests__/**", "**/tests/**"]
    tools: ["read", "edit", "bash"]

workflow:
  - phase: plan
    actor: coordinator
    output: plan.md with sub-tasks per member
  
  - phase: execute
    parallel: true
    actors: [frontend, backend, tester]
  
  - phase: integrate
    actor: coordinator
    actions: ["resolve conflicts", "run e2e tests"]
  
  - phase: review
    actor: code-reviewer
    output: review.md
```

### Invoke team

```text
> /team full-stack-team "Build user profile page with API + tests"

[Coordinator (Opus)]
- Read CLAUDE.md
- Plan:
  - Frontend: profile page + edit form
  - Backend: /api/profile GET + PATCH endpoints
  - Tests: unit + e2e
- Output plan.md

[Parallel execution]
[Agent frontend] working...
[Agent backend] working...
[Agent tester] working...

[Coordinator]
- Merge changes
- Resolve any conflicts
- Run e2e
- Open PR
```

→ Cuối ngày: 1 PR cho feature đầy đủ. 3 agents collaborated.

### Coordination via shared state

```text
.claude/agents/teams/state/
├── plan.md             ← coordinator writes
├── frontend-done.flag  ← frontend writes
├── backend-done.flag   ← backend writes
├── tester-done.flag    ← tester writes
└── progress.json       ← all update
```

Each agent reads/writes flags. Coordinator waits all done before integrate.

## Pattern 2: GSD — Goal-Spec-Design

Community pattern by Sourav Roy, popularized late 2025.

```text
[Goal]
"Build trading dashboard showing live market data"

[Spec]
Detailed product spec (markdown):
- Pages, components, API endpoints
- Data flows
- Edge cases
- Acceptance criteria

[Design]
Architecture artifacts:
- ADRs (decisions)
- Mockups (text-based or images)
- Tech stack choices
- Data models
```

GSD process:
```text
1. Human writes 1-line goal
2. Architect agent (Opus) reads goal → spec
3. Spec broken into deliverables
4. Sub-agents implement deliverables in parallel
5. Integration agent merges
6. Reviewer agent checks
7. PR opened
```

### GSD structure

```text
project-root/
├── .gsd/
│   ├── 001-goal.md
│   ├── 002-spec.md
│   ├── 003-design.md
│   ├── 004-deliverables.md
│   ├── progress/
│   │   ├── frontend.md
│   │   ├── backend.md
│   │   ├── tests.md
│   │   └── done.flag
│   └── orchestrator.sh
```

### Orchestrator script

```bash
#!/bin/bash
# .gsd/orchestrator.sh

GOAL_FILE=".gsd/001-goal.md"
SPEC_FILE=".gsd/002-spec.md"

# Phase 1: Spec
claude --model opus-4-5 -p "
Read $GOAL_FILE. Generate detailed product spec.
Output to $SPEC_FILE following template at .gsd/templates/spec.md.
"

# Phase 2: Design
claude --model opus-4-5 -p "
Read $SPEC_FILE. Generate architecture design.
Include: tech stack, data models, API endpoints, file structure.
Output to .gsd/003-design.md.
"

# Phase 3: Deliverables breakdown
claude --model opus-4-5 -p "
Read $SPEC_FILE and design.md. Break into 3-5 deliverables.
Each: title, scope, files affected, dependencies.
Output to .gsd/004-deliverables.md.
"

# Phase 4: Parallel implementation
deliverables=$(grep "^## D" .gsd/004-deliverables.md | sed 's/## //')
for d in "$deliverables"; do
    (
        claude --dangerously-skip-permissions -p "
        Implement deliverable: $d
        Reference: .gsd/004-deliverables.md
        Mark progress in .gsd/progress/${d}.md
        Stop when complete.
        " &
    )
done
wait  # all parallel agents done

# Phase 5: Integration
claude --model opus-4-5 -p "
All deliverables implemented (.gsd/progress/*).
Run integration:
- Resolve any conflicts
- Run full test suite
- Verify acceptance criteria
- Open PR
"
```

### GSD benefits

```text
✓ Human only writes 1 file (goal)
✓ AI handles spec → design → deliverables
✓ Parallel deliverable implementation
✓ Full audit trail (all artifacts versioned)
✓ Re-runnable: change spec, re-trigger
```

### GSD challenges

```text
✗ Spec quality determines everything
✗ Hard to redirect mid-flow
✗ Cost higher (Opus for planning phases)
✗ Coordination conflict if deliverables not well-separated
```

## Compare: Agent Teams vs GSD

| Aspect | Agent Teams | GSD |
|---|---|---|
| Structure | YAML config | File artifacts |
| Coordinator | Opus subagent | Orchestrator script |
| Spec source | Inline prompt | spec.md generated |
| Parallel | Native | Bash background jobs |
| State | flag files | progress/ directory |
| Replay | New session | Re-run orchestrator |
| Best for | Repeat workflows | Greenfield projects |

→ Agent Teams = production grade. GSD = research grade + customizable.

## Practical example: Trading dashboard

### Goal

```text
.gsd/001-goal.md:
"Build a trading dashboard showing live AAPL, GOOGL, MSFT prices.
Include 1d, 5d, 1mo charts. User can set price alerts.
Stack: Next.js + FastAPI + Polygon MCP."
```

### Coordinator generates spec

```text
> bash .gsd/orchestrator.sh

[Coordinator agent runs]
[Generates] .gsd/002-spec.md with:
- Pages: /, /chart/[symbol], /alerts
- Components: PriceTicker, Chart, AlertForm
- API: GET /prices, GET /candles, POST /alerts
- Data: Polygon MCP for live data, Postgres for alerts
- Tests: unit + e2e via Playwright

[Generates] .gsd/003-design.md with:
- Stack: Next.js 15 + FastAPI + Postgres
- WebSocket for live updates
- Chart lib: lightweight-charts
- Notification: email via Resend

[Generates] .gsd/004-deliverables.md:
- D1: Backend API + Polygon integration
- D2: Frontend pages + components
- D3: WebSocket live updates
- D4: Alert engine + email notify
- D5: Tests + E2E
```

### Parallel build

```text
[5 agents spawn in parallel]
- Agent D1 (backend): builds API endpoints, integrates Polygon MCP
- Agent D2 (frontend): builds pages, charts
- Agent D3 (WebSocket): live update infra
- Agent D4 (alerts): worker for price checks + email
- Agent D5 (tests): writes test suite

[All track progress in .gsd/progress/]
[3-5 hours later, all done]
```

### Integration

```text
[Coordinator]
- git merge all branches
- Run all tests → fix conflicts
- Verify acceptance: real Polygon data flowing, alerts trigger
- Open PR with full feature
```

Result: trading dashboard production-ready in **5 hours** (vs ~3 days serial).

## Agent Teams version same project

```yaml
# .claude/agents/teams/trading-dashboard.yml
name: trading-team
coordinator: { agent: tech-lead, model: opus-4-5 }
members:
  - { name: backend, agent: fastapi-dev, paths: ["backend/**"] }
  - { name: frontend, agent: nextjs-dev, paths: ["frontend/**"] }
  - { name: realtime, agent: ws-dev, paths: ["realtime/**"] }
  - { name: alerts, agent: worker-dev, paths: ["worker/**"] }
  - { name: tests, agent: test-writer, paths: ["**/tests/**"] }

workflow:
  - phase: plan
    actor: coordinator
  - phase: execute
    parallel: true
  - phase: integrate
    actor: coordinator
  - phase: review
    actor: code-reviewer
```

```text
> /team trading-team "Build trading dashboard with live prices + alerts"

[Same 5-hour result, simpler config]
```

## When use each?

```text
[Use Agent Teams]
- Stable team workflow (defined roles)
- Recurring task patterns
- Want declarative config
- Production env

[Use GSD]
- Greenfield, exploring
- Want explicit artifacts (compliance)
- Custom coordination logic needed
- Learning multi-agent
- Need replay capability
```

## Cost analysis multi-agent

```text
[Single agent same task]
- Sonnet 8 hours: ~$15

[Agent Teams version]
- Opus coordinator 1 hour: ~$10
- 5x Sonnet workers 1 hour each parallel: ~$15
- Total: $25
- Wall clock: 1-2 hours (vs 8 hour serial)

[GSD version]
- Opus planning 2 hours: ~$20
- 5x Sonnet workers parallel: ~$15
- Opus integration 1 hour: ~$10
- Total: $45
- Wall clock: 3-5 hours

→ Multi-agent ~2-3x cost but 3-5x wall clock speedup.
   Worth it if developer hour > $50.
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Deliverables overlap files | Merge conflict | Clear path boundaries |
| Coordinator gives vague tasks | Workers diverge | Detailed deliverable |
| No integration phase | PR doesn't work | Coordinator integration |
| All agents same model | Cost suboptimal | Model per role |
| No progress visibility | Stuck unseen | Flag files / progress.md |
| Concurrent same dir | Conflict | Worktree per agent |
| Forget review phase | Bug ships | Final reviewer |
| Cost runaway | Bill | Cost cap per agent |

## Tóm tắt bài 1

- **Multi-agent** = parallel speed + role specialization.
- **Claude Code Agent Teams** = native, YAML config, coordinator + members.
- **GSD (Goal-Spec-Design)** = community pattern, file artifacts, orchestrator script.
- Both: plan → execute parallel → integrate → review.
- Trading dashboard example: 5 agents, 5 hours wall clock for production feature.
- Cost: 2-3x single agent, 3-5x speedup.
- Use Agent Teams for stable workflows, GSD for greenfield exploration.

**Bài kế tiếp** → [Bài 2: Gastown Swarm + Course Wrap-up](02-gastown-wrapup.md)
