# Bài 1: Sub-agents — Specialized AI workers

**Sub-agent** = một Claude agent độc lập (own context, own tools, own system prompt) được **main agent spawn** để delegate task. Pattern này giải quyết "context bloat" (research nặng nuốt window) và "specialization" (PR reviewer cần Opus, code writer dùng Sonnet). Bài này deep dive: định nghĩa subagent, khi nào dùng, build custom.

## Vì sao cần sub-agent?

```text
[Problem 1: Context bloat]
- Task chính: implement feature
- Sub-task: "find all auth-related code" → reads 30 files
- → 30 file content nuốt main context
- → Main agent miss giữa, hallucinate

[Problem 2: Specialization]
- Implement code: Sonnet 4.5 đủ
- Review for security: cần Opus 4.5 reasoning
- → Single agent can't switch model mid-task

[Solution: Sub-agent]
- Main spawns sub-agent for task
- Sub-agent runs in isolated context
- Returns summary (not full work)
- Main context stays clean
- Different sub-agents use different models
```

## Subagent vs Skill vs MCP — Recap

```text
[MCP]      = external tool access
[Skill]    = procedural knowledge (when X, do Y, Z)
[Subagent] = autonomous worker with own context + tools + system prompt
```

Sub-agent là **process** (kiểu speaking metaphor), Skill là **playbook** (instructions cho main agent).

## Anatomy of subagent

```text
~/.claude/agents/
└── code-reviewer/
    ├── agent.md           ← system prompt + config
    └── (optional resources)
```

`agent.md`:
```markdown
---
name: code-reviewer
description: Use when reviewing code for security, performance, maintainability issues.
model: claude-opus-4-5
tools: Read, Grep, Glob, Bash
---

# Code Reviewer

You are a senior staff engineer reviewing code.

Focus on:
1. **Security**
   - Input validation
   - Auth bypass
   - SQL injection
   - Secret leaking
   - CSRF/XSS

2. **Performance**
   - N+1 queries
   - Unnecessary re-renders (React)
   - Memory leaks
   - Blocking I/O

3. **Maintainability**
   - Naming clarity
   - Single responsibility
   - Test coverage
   - Documentation

For each issue:
- Severity: critical / major / minor / nit
- Location: file:line
- Why it matters
- Suggested fix

Output as Markdown checklist. Be concise.
```

Components:
- **YAML frontmatter**: name, description, model, allowed tools.
- **Body**: system prompt for the agent.

## Spawn sub-agent — Main agent

```text
[Main agent]
> Review PR #87 with code-reviewer subagent

[Claude main]
→ Task tool: spawn code-reviewer subagent
   prompt: "Review files: app/auth.py, app/api/login.py"
   
   [code-reviewer subagent — isolated context]
   - Reads files
   - Greps for patterns
   - Runs analysis
   - Returns: "Found 2 critical, 3 major issues: ..."

← Main agent receives summary
[Continues with main task]
```

Main agent's view: 1 tool call, 1 result. Doesn't see subagent's internal reads.

## Built-in subagents Claude Code có

```text
~/.claude/agents/
├── general-purpose/      ← default fallback
├── explore/              ← read-only research
├── code-reviewer/        ← review code
├── debugger/             ← reproduce + fix bug
└── statusline-setup/     ← UI helper
```

Different model + tool set per subagent.

## Built common sub-agents

### Explore subagent

```markdown
---
name: explore
description: Use for read-only research across codebase. No edits. Returns structured summary.
model: claude-haiku-4-5
tools: Read, Grep, Glob, LS, WebFetch
---

# Codebase Explorer

You are a research agent. NEVER edit files.

Given a research question:
1. Use Glob, Grep to find relevant files
2. Read selectively (not whole files when not needed)
3. Build mental map of architecture
4. Return:
   - Files relevant + their role
   - Patterns observed
   - Key functions/classes mentioned
   - Dependencies

Output Markdown. Keep < 500 words. Focus signal.
```

Use:
```text
> Use explore subagent to find how auth tokens are validated
[Subagent returns summary]
> Now refactor based on findings
```

### Tester subagent

```markdown
---
name: tester
description: Use to write tests for code. Specializes in test design.
model: claude-sonnet-4-5
tools: Read, Edit, Write, Bash
---

# Tester

Write thorough tests.

For each function:
1. Identify happy path
2. Edge cases (empty, null, max, negative)
3. Error paths
4. Side effects

Style:
- Use existing test framework
- Match codebase conventions
- One assertion per test (mostly)
- Clear descriptive names

Run tests after writing. Iterate until pass.
```

### Migrator subagent

```markdown
---
name: migrator
description: Use for systematic refactor across many files.
model: claude-sonnet-4-5
tools: Read, Edit, Glob, Grep, Bash
---

# Migrator

Apply transformation across codebase.

Protocol:
1. Find all instances via Grep
2. Plan transformations
3. Apply file-by-file
4. Run tests after each
5. Commit per file (or per logical group)
6. If test fails, rollback, note + skip

Be conservative. Don't over-refactor.
```

## Subagent vs main task

When main task says:
```text
> Find auth-related files, then refactor them.
```

Options:
1. **Main does all** — fills context with 30 files
2. **Delegate find to explore subagent**, main does refactor with subagent's summary

Better:
```text
> Use explore subagent to map auth files. 
> Then use migrator subagent to refactor per findings.
```

→ 2 isolated contexts. Main agent stays clean as coordinator.

## Cost considerations

```text
[Single agent doing all]
Main: 50K tokens (reads + edits)
Cost: 50K * $3/M Sonnet = $0.15

[With subagents]
Main: 5K tokens (coordination)
Explore: 30K tokens (Haiku for cheap research)
Migrator: 40K tokens (Sonnet for code)
Cost: 5K*$3/M + 30K*$1/M + 40K*$3/M = $0.135

→ Subagent often cheaper because cheap model for research
```

## Conditional subagent use

```text
[CLAUDE.md instruction]
For tasks involving > 10 files or > 5K LOC:
- Use explore subagent first to map
- Don't read all files in main context
```

→ Main agent learns to delegate automatically.

## Permission scoping

```markdown
---
name: production-deployer
description: Deploy to production. Restricted permissions.
model: claude-opus-4-5
tools: Bash
permissions:
  allowedBashCommands: ["fly deploy", "vercel deploy --prod"]
  deniedBashCommands: ["rm", "git push --force"]
---
```

→ Subagent constrained to safe commands.

## Subagent communication patterns

### Pattern 1: Research → Implement

```text
1. explore (Haiku) → maps codebase
2. main agent → reads summary, plans
3. main agent → implements
```

### Pattern 2: Implement → Review

```text
1. main agent → implements feature
2. code-reviewer (Opus) → reviews diff
3. main agent → addresses feedback
4. code-reviewer → re-verifies
```

### Pattern 3: Parallel sub-agents

```text
1. main agent → spawns 3 subagents in parallel:
   - test-writer (writes tests for module A)
   - test-writer (module B)
   - test-writer (module C)
2. main agent → collects 3 summaries
3. main agent → commits all
```

(Phase 10 covers multi-agent orchestration deeper)

## Project-level subagents

```text
my-app/
├── .claude/
│   └── agents/
│       ├── react-component-creator/
│       ├── api-endpoint-creator/
│       └── db-migration-creator/
```

Team-specific subagents. Junior dev join, has team's best practices encoded.

## Best practices

```text
✓ One responsibility per subagent
✓ Clear "use when" description
✓ Pick right model (Haiku cheap, Sonnet balanced, Opus thinking)
✓ Restrict tools to what's needed
✓ Subagent should return summary, not full work
✓ Document subagent in README

✗ Don't spawn subagent for trivial task (overhead > benefit)
✗ Don't nest subagents deep (loses control)
✗ Don't give subagent write access if not needed
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Subagent for everything | Overhead cost | Use only for big context tasks |
| Same model for all | Cost suboptimal | Match model to task |
| No "use when" | Main doesn't trigger | Specific description |
| Tools too permissive | Risk | Minimal tool set |
| Subagent returns dump | Main context bloat | Force summary output |
| Deep nesting (sub spawn sub) | Loss of control | Max 1 level usually |
| Subagent + Skill confusion | Wrong tool | Subagent = worker, Skill = playbook |
| Forget restart Claude Code | Old config | Restart after agent.md change |

## Tóm tắt bài 1

- **Sub-agent** = isolated Claude agent with own context, tools, system prompt.
- Solves: **context bloat** (research isolated) + **specialization** (model per task).
- Anatomy: `~/.claude/agents/<name>/agent.md` with frontmatter + system prompt.
- Built-in: general-purpose, explore, code-reviewer, debugger.
- Spawn via Task tool in main agent: "Use code-reviewer to ..."
- Cost: often cheaper (Haiku for research, Sonnet for code).
- Patterns: research→implement, implement→review, parallel sub-agents.
- Project-level `.claude/agents/` for team subagents.
- Best practices: single responsibility, right model, restrict tools, summary output.

**Bài kế tiếp** → [Bài 2: Hooks + Custom slash commands](02-hooks-commands.md)
