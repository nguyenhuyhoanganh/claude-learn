# Bài 2: Gastown Swarm + Course Wrap-up

**Gastown** là pattern frontier nhất 2026: **swarm orchestration** với 10-50 agents parallel, mỗi agent có vai trò, communicate qua message bus. Đây là multi-agent **scale lên** (vs Agent Teams 3-5 agents). Bài cuối: Gastown architecture, course summary, roadmap nâng cao 2026-2027.

## Gastown architecture

Designed by community 12/2025, named after Vancouver neighborhood. Inspired by ant colony optimization + Erlang OTP.

```text
[Gastown Mesh]

        [Orchestrator]
              │
        ┌─────┼─────┬─────┐
        ▼     ▼     ▼     ▼
    [Squad A] [Squad B] [Squad C] [QA Squad]
    │ │ │     │ │ │      │ │ │     │ │
    A1 A2 A3  B1 B2 B3   C1 C2 C3  Q1 Q2

[Message bus] (Redis pub/sub)
- All agents subscribe to their topic
- Communicate via structured messages
- State stored in shared work tree (git worktrees)
```

Differences from Agent Teams:
- **Scale**: 10-50 agents vs 3-5.
- **Async**: agents work asynchronously, communicate via message bus.
- **Self-organizing**: squads self-coordinate within their boundary.
- **Fault-tolerant**: agent fail → squad respawn.

## Gastown stack

```text
- Orchestrator: claude-agent-sdk in Python
- Message bus: Redis (pub/sub + streams)
- State: git worktrees (1 per squad)
- Containers: 1 per agent
- Monitoring: Grafana dashboard
```

## Squad pattern

```yaml
# .gastown/squads/frontend.yml
name: frontend-squad
size: 3                   # 3 agents in squad
boundary: ["frontend/**"]  # only touch frontend
worktree: trees/frontend  # isolated git worktree
lead: frontend-architect  # lead agent role

members:
  - role: page-builder
    model: claude-sonnet-4-5
    skills: [react-component-creator, form-validator]
  
  - role: state-management
    model: claude-sonnet-4-5
    skills: [zustand-pattern, react-query-pattern]
  
  - role: styling
    model: claude-haiku-4-5
    skills: [tailwind-converter, accessibility]

message_topics:
  publishes: ["frontend.progress", "frontend.blocked"]
  subscribes: ["backend.api-ready", "design.mockup-ready"]
```

→ Squad = micro-team. Members specialize. Lead coordinates.

## Message protocol

```json
{
  "id": "msg-001",
  "from": "frontend-squad",
  "to": "backend-squad",
  "topic": "backend.api-needed",
  "type": "request",
  "body": {
    "endpoint": "GET /api/users/{id}/profile",
    "fields": ["name", "email", "avatar_url", "bio"],
    "blocking": true,
    "deadline": "2026-06-04T18:00:00Z"
  },
  "timestamp": "2026-06-04T14:23:11Z"
}
```

Backend squad receives → assigns to member → implements → publishes response:
```json
{
  "from": "backend-squad",
  "topic": "backend.api-ready",
  "body": {
    "request_id": "msg-001",
    "endpoint": "GET /api/users/{id}/profile",
    "status": "ready",
    "branch": "feat/profile-endpoint",
    "openapi_schema_url": "..."
  }
}
```

→ Frontend squad listens, unblocks, continues.

## Coordination state

```text
.gastown/
├── state.json              ← global progress
├── squads/
│   ├── frontend/
│   ├── backend/
│   └── qa/
├── messages/
│   └── queue.log           ← message archive
└── worktrees/
    ├── frontend/           ← git worktree 1
    ├── backend/            ← git worktree 2
    └── shared/             ← merged result
```

Git worktrees keep isolated changes. Final merge happens after all squads done.

## Run Gastown

```bash
gastown init                 # scaffold .gastown/
gastown define-squad frontend
gastown define-squad backend
gastown define-squad qa
gastown plan "Build trading dashboard"   # orchestrator drafts
gastown start                # spawn all agents
gastown status               # monitor progress
gastown merge                # integrate after done
```

## Trading dashboard via Gastown

```text
[Squad assignments]

Frontend Squad (3 agents):
- A1 pages (/, /chart/[sym], /alerts)
- A2 components (charts, tickers, forms)
- A3 styling (Tailwind + shadcn)

Backend Squad (3 agents):
- B1 routes (REST + WebSocket)
- B2 Polygon integration
- B3 alerts engine

Data Squad (2 agents):
- D1 Postgres schema + migrations
- D2 Redis cache

QA Squad (3 agents):
- Q1 unit tests backend
- Q2 unit tests frontend
- Q3 E2E Playwright

DevOps Squad (1 agent):
- O1 Docker, CI/CD, deploy

Total: 12 agents working parallel
Wall clock: 2-3 hours
```

→ 1 PR with full feature. Massive parallelization.

## Failure handling

```text
[Agent fails]
- Squad lead detects (heartbeat missing)
- Respawn agent
- Resume from squad worktree state

[Squad blocked]
- Squad publishes "blocked: <reason>"
- Orchestrator decides:
  - Retry
  - Reassign
  - Escalate to human

[Conflict between squads]
- Both publish to "conflict.<topic>"
- Orchestrator (Opus) mediates
- Decision broadcast to involved squads
```

## Compare 3 multi-agent approaches

| Aspect | Agent Teams | GSD | Gastown |
|---|---|---|---|
| Setup complexity | Low | Medium | High |
| Agents | 3-5 | 3-7 | 10-50 |
| Communication | Files | Files | Message bus |
| Async | Limited | Sequential | Native |
| Fault tolerance | Manual | Manual | Built-in |
| Cost | Low | Medium | High |
| Wall clock speedup | 2-3x | 3-5x | 5-10x |
| Best for | Small team feature | Greenfield project | Multi-week initiative |

## Codex Wins case study

11/2025 famous demo: build full trader workstation in 1 day via Gastown swarm using **Codex CLI + GPT-5 + o3**:

```text
- 47 agents spawned over 12 hours
- 8 squads (Frontend, Backend, Data, Market, Risk, UI, QA, Ops)
- 12,400 tool calls
- 850 file changes
- 18 test suites
- Final: production trader app with live data + portfolio + risk metrics
- Cost: ~$280 inference
- Estimated human time: 3 months
```

→ Demonstrates frontier of 2026 capability. Not for every project, but for big initiatives.

## Course Wrap-up — Where you are now

```text
[3 weeks ago]
- Curious about AI coding tools
- Maybe used ChatGPT for snippets

[Now after Phase 1-10]
- ✓ Understand LLM fundamentals (tokens, context, agent loop)
- ✓ Context engineering with agents.md / CLAUDE.md
- ✓ Cursor + Copilot + Codex + Antigravity hands-on
- ✓ YOLO mode safely with sandboxes
- ✓ Claude Code mastery (CLI, sessions, Ralph loops)
- ✓ MCP + Skills + Plugins extensibility
- ✓ Jira → PR autonomy production workflow
- ✓ Production SaaS built with Cerebras speed
- ✓ Sub-agents, hooks, custom slash commands
- ✓ Cloud sandboxes (Sprites.dev) overnight runs
- ✓ Claude Agent SDK programmatic
- ✓ OpenClaw Telegram bot personal assistant
- ✓ Multi-agent orchestration (Agent Teams, GSD, Gastown)
```

You are now in the **top 1% of AI-using engineers**. 12 months ago this skillset didn't exist.

## Career impact 2026

```text
[Salary impact]
- Pre-AI engineer skills: baseline
- AI-augmented engineer: +30-50% market value
- Multi-agent orchestrator: +80-150% market value

[Role evolution]
- Old: "JavaScript engineer", "Backend developer"
- New: "AI engineer", "Agentic systems engineer", "AI workflow architect"

[Productivity multiplier]
- Solo engineer: 2-5x output vs 2024
- Senior orchestrator: 10-20x output via swarm

[Hiring demand]
- Junior AI-engineers: hot (companies want to onboard)
- Senior AI-engineers: extreme (companies need leadership)
- AI-coding specialists: emerging job title
```

## Continuing education

```text
[Follow]
- @AnthropicAI, @SimonW, @karpathy
- Latent Space podcast
- Practical AI weekly
- Anthropic blog

[Practice]
- Build 1 project/month with new pattern
- Share on Twitter/LinkedIn (compounding network)
- Contribute MCP servers / skills / plugins
- Mentor 1 junior into AI coding

[Read]
- "AI Engineering" by Chip Huyen
- "Multi-Agent Systems" academic papers
- LessWrong / Alignment Forum (safety)
- Anthropic's research papers

[Experiment]
- New model releases (test for your workflow)
- New surfaces (mobile, voice, AR)
- Cross-tool ensembling
```

## What's next (frontier 2026-2027)

```text
[Q2 2026]
- Voice-first agent surfaces
- AR/VR coding interfaces
- Reasoning model commoditization
- Agent-to-agent payment (autonomous SaaS)

[Q3 2026]
- Multi-modal agents (vision + code + audio)
- Specialized model families (per language)
- "Agent OS" — dedicated agent kernels

[Q4 2026]
- Full autonomous startup operation
- Agent IDE (built for agent UX, not human)
- Cross-org agent collaboration
- Regulation maturity

[2027+]
- Agentic infrastructure layer
- Standardized swarm protocols
- Agent employment market
- AI engineer = AI orchestrator full-time
```

## Final advice

```text
Three rules to live by post-course:

1. KEEP BUILDING
   Skill compounds only via projects.
   Schedule 4 hours/week for personal AI exploration.

2. KEEP SHARING
   Blog post, tweet, video, conf talk.
   Your learning becomes others' starting point.
   Network reciprocates.

3. KEEP HUMAN
   AI does coding. You do:
   - Vision
   - Architecture
   - Quality judgment
   - Stakeholder communication
   - Ethics
   - Mentorship
   
   These don't outsource. They are your moat.
```

## 🎉 Course Complete

You've completed the **AI Coder: From Vibe Coder to Agentic Engineer** course.

10 phases, ~30 deep-dive lessons, 3 weeks of material distilled. From confused at "vibe coding" to orchestrating Gastown swarms of agents.

The field continues to evolve. You now have the **mental model** to learn the next tool in 1 day instead of 1 month. That's the unfair advantage.

Go build something amazing. The world needs it.

---

```text
🤖 → 👤
"Agents are getting better.
 So should we."
```

**Hết course.** Bạn đã sẵn sàng cho 2026-2027 frontier.
