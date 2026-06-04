# Bài 3: Plugins + Big Three Decision Matrix

**Plugins** = thứ ba của "Big Three". Ra mắt 10/2025. Plugin bundle nhiều assets cùng nhau: skills, MCP servers, hooks, slash commands, sub-agents. Một plugin = "pack". Bài này: cấu trúc plugin, install từ marketplace, build custom, và **decision matrix MCP vs Skill vs Plugin** đầy đủ.

## Plugin là gì?

```text
[Plugin]
└── Bundle of:
    ├── skills/        ← procedural knowledge
    ├── mcp-servers/   ← MCP servers
    ├── hooks/         ← event triggers (Phase 7)
    ├── commands/      ← slash commands
    └── agents/        ← subagent definitions (Phase 7)
```

→ "Skill pack" + extras. Distributable unit.

## Vì sao plugins existed?

Trước plugins:
- Install MCP: edit JSON config.
- Install skill: copy folder.
- Custom slash command: edit settings.
- Subagent: separate setup.

→ Mỗi mỗi chỗ khác nhau. Hard onboard người mới.

Plugin = **1 install command, all included**:
```bash
claude plugin install featured-dev
# → adds skills, MCP servers, commands, agents in one shot
```

## Plugin structure

```text
my-plugin/
├── plugin.json                 ← manifest
├── README.md
├── skills/
│   ├── code-review/SKILL.md
│   └── deploy/SKILL.md
├── mcp-servers/
│   └── github-pro.json        ← MCP config
├── commands/
│   ├── /ship.md
│   └── /review.md
├── hooks/
│   └── on-edit.sh
└── agents/
    └── reviewer.md
```

`plugin.json` manifest:
```json
{
  "name": "featured-dev",
  "version": "1.2.0",
  "description": "Senior engineer toolkit",
  "author": "Anthropic",
  "components": {
    "skills": ["code-review", "deploy"],
    "mcpServers": ["github-pro"],
    "commands": ["/ship", "/review"],
    "hooks": ["on-edit"],
    "agents": ["reviewer"]
  },
  "requires": {
    "claudeCode": ">=1.5.0"
  }
}
```

## Install + manage

```bash
# Install from marketplace
claude plugin install featured-dev

# From git
claude plugin install https://github.com/user/my-plugin

# List
claude plugin list

# Update
claude plugin update featured-dev

# Remove
claude plugin remove featured-dev

# Enable/disable
claude plugin disable featured-dev
claude plugin enable featured-dev
```

Plugins live in `~/.claude/plugins/`.

## Top plugins production 2026

### featured-dev (Anthropic official)

```text
Components:
- skills/conventional-commit
- skills/test-driven-fix
- skills/release-notes
- mcp/github-pro (extended GitHub tools)
- /ship → run tests + commit + push + open PR
- /review → automated code review with AI
- agents/reviewer (Opus 4.5 for deep review)
```

→ "Pro" senior engineer toolkit.

### claude-code-essentials

```text
- skills/conventional-commit
- skills/branch-naming
- /pr (open PR with template)
- /standup (generate standup notes from commits)
- hooks/pre-commit (lint + format)
```

### react-stack

```text
- skills/component-create (per shadcn convention)
- skills/hook-create
- mcp/context7 (React/Next.js docs)
- /scaffold-page
- /add-route
- agents/ui-reviewer
```

### data-eng-pack

```text
- skills/sql-review
- skills/dbt-model-create
- mcp/postgres (read-only)
- mcp/snowflake
- /run-pipeline
- /lineage
```

## Build custom plugin

```bash
mkdir -p ~/dev/my-team-plugin/{skills,commands,mcp-servers}
cd ~/dev/my-team-plugin
```

`plugin.json`:
```json
{
  "name": "my-team-tools",
  "version": "0.1.0",
  "description": "Internal team conventions",
  "components": {
    "skills": ["our-commit-style", "our-test-pattern"],
    "commands": ["/deploy", "/rollback"]
  }
}
```

Add skill `skills/our-commit-style/SKILL.md`, command files, etc.

Install local:
```bash
claude plugin install ./my-team-plugin
```

Publish:
```bash
git push to github
# Others install: claude plugin install github.com/team/plugin
```

## Slash commands

Slash command = template + parameters Claude runs.

`commands/deploy.md`:
```markdown
---
name: deploy
description: Deploy current branch to staging
arguments:
  - name: environment
    default: staging
    options: [staging, production]
---

# Deploy command

Deploy current branch to {environment}.

1. Verify on correct branch (not main if production).
2. Run tests: pnpm test
3. Build: pnpm build
4. Deploy: vercel --prod=$([ "{environment}" = "production" ] && echo "true" || echo "false")
5. Verify URL: curl health endpoint.
6. Notify Slack #deploys with version.
```

Use:
```text
> /deploy staging
[Claude follows command template]

> /deploy production
[Same but with prod flag, extra safety]
```

→ Repeatable workflow as 1 line.

## Marketplace ecosystem

```text
[Official]
- github.com/anthropics/claude-plugins
- plugins.anthropic.com

[Community]
- claude-plugins.dev
- awesome-claude-code (GitHub list)
```

Quality varies. Pin version when install:
```bash
claude plugin install featured-dev@1.2.0  # not @latest in production
```

## Decision matrix — MCP vs Skill vs Plugin

```text
[Question 1: External service connection?]
   │
   ├── Yes → MCP server
   │   Examples: GitHub API, Postgres, Slack
   │
   └── No → continue to Q2

[Question 2: Just procedural knowledge?]
   │
   ├── Yes → Skill
   │   Examples: commit style, code review checklist
   │
   └── No → continue to Q3

[Question 3: Bundle multiple capabilities?]
   │
   ├── Yes → Plugin
   │   Examples: full team toolkit, framework pack
   │
   └── No → just Skill or Custom slash command
```

## Detailed comparison

| Aspect | MCP | Skill | Plugin |
|---|---|---|---|
| Primary purpose | Connect external | Procedural knowledge | Bundle of all |
| Process | Yes (spawn) | No | Includes if MCP |
| Network | Yes | No | If MCP |
| Cross-tool | Yes (any MCP host) | Claude only | Claude only |
| Discoverability | Tool list at start | Frontmatter scan | Plugin manifest |
| Install | Edit config | Copy folder | `claude plugin install` |
| Versioning | npm/pip | git | git + version field |
| Distribution | Smithery, mcp.so | claudeskills.dev | plugins.anthropic.com |
| Use case | Live data | Workflows | Team standards |

## When to use each — Examples

```text
[Build Stripe subscription feature]
- MCP: stripe-mcp (live API → create subscription)
- Skill: subscription-pattern (your team's convention)
- Plugin: stripe-toolkit (bundles both + slash commands)

[Code review automation]
- MCP: github-pro (fetch PR diff)
- Skill: review-checklist (what to check)
- Subagent: reviewer (Opus 4.5 deep review)
- Plugin: code-review-pro (bundles all 3)

[Database migration]
- MCP: postgres-mcp (inspect schema)
- Skill: migration-checklist (avoid common gotchas)
- Command: /migrate
- Plugin: db-toolkit
```

→ Plugin = packaging convenience. Individual components still skill or MCP.

## Project-level all-in-one

```text
my-app/
├── .claude/
│   ├── skills/                   ← project skills
│   ├── commands/                 ← project commands
│   ├── settings.json             ← permissions
│   └── plugins.json              ← required plugins
├── .mcp.json                     ← project MCP servers
└── CLAUDE.md
```

`.claude/plugins.json`:
```json
{
  "required": ["featured-dev@1.2.0", "react-stack@0.5.0"]
}
```

→ Team member clone repo, `claude plugin install --required` installs everything.

## Bẫy thường gặp với plugin

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Install untrusted plugin | Malicious code | Read source, pin version |
| Plugin requires API token | Friction | Document setup clearly |
| Plugin overlap (2 plugins same command) | Conflict | Resolve via priority |
| Plugin breaks after Claude update | Workflow break | Pin claudeCode version |
| Plugin too big (50 components) | Cognitive load | Split |
| Plugin no README | User confused | Always include |
| Hardcoded paths | Non-portable | Env / relative path |
| No version bump on change | Caching issue | Semver discipline |

## Best practices building plugin

```text
✓ Single responsibility per plugin
✓ Clear README with examples
✓ Version semver
✓ Test on fresh Claude Code install
✓ Document MCP token requirements
✓ Permission scoping in skills
✓ License clearly (MIT/Apache)
✓ Pin Claude Code min version
✗ Don't bundle unrelated things
✗ Don't depend on undocumented APIs
✗ Don't auto-execute on install
```

## Mental model summary

```text
[Tool needs?]
├── Just call API           → MCP server
├── Just remember procedure → Skill
├── Both, distributable    → Plugin

[Configuration level?]
├── Global (your dev box)  → ~/.claude/
├── Team (shared repo)     → .claude/ in repo
├── Project (per task)     → /spec.md inline

[Sharing scope?]
├── Personal             → keep local
├── Team                 → commit to repo
├── Public               → plugin marketplace
```

## Tóm tắt bài 3

- **Plugin** = bundle skills + MCP servers + commands + hooks + agents.
- Install: `claude plugin install <name|github-url>`.
- Top plugins: **featured-dev** (Anthropic), **react-stack**, **data-eng-pack**.
- **Slash commands** in plugin/skill: repeatable workflow as `/cmd`.
- Decision matrix:
  - External service → **MCP**
  - Procedural knowledge → **Skill**
  - Bundle multiple → **Plugin**
- Project-level `.claude/plugins.json` for team-required plugins.
- Best practices: single responsibility, README, version pin, license, scope permissions.
- Mental model: tool need → MCP vs Skill vs Plugin → configuration level → sharing scope.

🎉 **Hoàn thành Phase 5** — Big Three mastery. Phase 6 production workflow: Jira → Claude Code → PR autonomy.

**Bài kế tiếp** → [Phase 6 - Bài 1: Jira + GitHub MCP workflow](../phase-6-jira-saas-workflow/01-jira-github-workflow.md)
