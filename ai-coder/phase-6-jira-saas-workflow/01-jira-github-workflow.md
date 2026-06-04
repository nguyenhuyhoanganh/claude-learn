# Bài 1: Jira + GitHub MCP — Ticket-to-PR Autonomy

Đây là **moment khi vibe engineer trở thành senior**: workflow autonomous từ Jira ticket → code → PR → merge, không cần touch keyboard cho task individual. Bài này build pipeline: Jira MCP fetch ticket → Claude Code implement → GitHub MCP open PR. Áp dụng cho SaaS thật ở bài cuối phase.

## Pipeline architecture

```text
[Jira ticket created]
       │
       ▼
[Claude Code session starts]
       │ Jira MCP: get_issue(KEY-123)
       ▼
[Agent reads ticket spec]
       │ Repository MCP: explore code
       ▼
[Agent implements feature]
       │ Edit, Test (Bash tool)
       ▼
[Agent commits to feature branch]
       │ GitHub MCP: create_pull_request
       ▼
[PR opened, link to Jira]
       │
       ▼
[Reviewer (human or AI) merges]
       │
       ▼
[Jira ticket auto-closed via webhook]
```

→ 1 ticket = 1 PR. Bạn focus design + review, agent focus implementation.

## Step 1: Setup Jira MCP

Anthropic-built `@modelcontextprotocol/server-jira`:
```bash
claude mcp add jira \
  --command npx \
  --args "-y,@modelcontextprotocol/server-jira" \
  --env JIRA_HOST="yourcompany.atlassian.net" \
  --env JIRA_EMAIL="you@company.com" \
  --env JIRA_API_TOKEN="$(cat ~/.jira-token)"
```

Get API token from `id.atlassian.com/manage-profile/security/api-tokens`.

Tools exposed:
```text
- search_issues(jql)
- get_issue(key)
- create_issue(project, summary, description)
- transition_issue(key, status)
- add_comment(key, body)
- list_projects
```

## Step 2: Setup GitHub MCP

```bash
claude mcp add github \
  --command npx \
  --args "-y,@modelcontextprotocol/server-github" \
  --env GITHUB_PERSONAL_ACCESS_TOKEN="ghp_..."
```

PAT permissions:
- `repo` (full)
- `pull_request`
- `read:org`

Tools:
```text
- create_pull_request(repo, title, body, head, base)
- get_pull_request(repo, number)
- list_pull_requests(repo, state)
- search_code(query, repo)
- get_file_contents(repo, path)
- create_or_update_file(repo, path, content, message)
- create_branch(repo, name, sha)
```

## Step 3: Verify MCP working

```bash
claude
> /mcp
[shows jira: connected, github: connected]

> List my Jira issues assigned to me
[Claude uses jira.search_issues with JQL "assignee = currentUser()"]
[Shows 3 tickets]

> Get current open PRs on owner/repo
[Claude uses github.list_pull_requests]
```

## Step 4: Single-ticket workflow

```bash
cd ~/projects/my-app
claude
```

```text
> Implement KAN-42

[Claude]
1. jira.get_issue("KAN-42")
   → Returns: "Add password strength meter to register form"
   → Description: "User feedback says weak passwords accepted. 
                   Add visual meter with rules: 8+ chars, uppercase, 
                   number, symbol. Block submit if weak."
   → Labels: ["frontend", "ux"]

2. Read CLAUDE.md
   → Stack: Next.js + react-hook-form + zod

3. Glob "**/register*"
   → app/register/page.tsx, app/register/actions.ts

4. Read app/register/page.tsx
   → Current form uses zod with simple min(8) check

5. Plan:
   - Create components/PasswordMeter.tsx
   - Update zod schema with strength rules
   - Block submit if score < 3
   - Visual bar with color

6. Implement (4 file edits)

7. Run tests: pnpm test → PASS

8. git checkout -b feat/KAN-42-password-meter
   git add . && git commit -m "feat(register): add password strength meter (KAN-42)"

9. github.create_pull_request(
     title: "feat(register): add password strength meter",
     body: "Closes [KAN-42]. Adds visual password strength meter...",
     head: "feat/KAN-42-password-meter",
     base: "main"
   )
   → PR #87 created

10. jira.add_comment("KAN-42", "PR opened: github.com/.../pull/87")
```

Result: ~10 minutes, PR ready.

## Step 5: Batch processing

```text
> List my Jira tickets with status "Ready for Dev" + priority High

[Claude returns list of 5 tickets]

> Implement each one. Open separate PR. Stop if any fail.

[Claude]
- Process KAN-42 → PR #87
- Process KAN-43 → PR #88
- Process KAN-44 → tests fail, comment on Jira ticket, skip
- Process KAN-45 → PR #89
- Process KAN-46 → PR #90

Final: 4 PRs opened, 1 blocked (KAN-44 needs design clarification).
```

## Step 6: PR template + linking

Repo `.github/PULL_REQUEST_TEMPLATE.md`:
```markdown
## Description
<!-- Auto-filled from Jira ticket -->

## Changes
- 

## Testing
- [ ] Unit tests pass
- [ ] Manual test happy path
- [ ] Edge cases

## Jira
Closes [KAN-XX]
```

In CLAUDE.md:
```markdown
## PR conventions
- Title: `<type>(<scope>): <subject>` per Conventional Commits
- Body: Use template, fill Description from Jira issue summary
- Always include "Closes [KAN-XX]" at bottom (auto-closes Jira when merged)
- Tag reviewer @backend-lead for backend changes
```

→ Agent follows.

## Step 7: Custom slash command

`.claude/commands/ship-ticket.md`:
```markdown
---
name: ship-ticket
description: End-to-end implement Jira ticket and open PR
arguments:
  - name: ticket
    required: true
    description: Jira ticket key (e.g. KAN-42)
---

# Ship ticket workflow

1. Fetch ticket: jira.get_issue({{ticket}})
2. Verify status is "Ready for Dev"
   - If not, refuse: "Ticket {{ticket}} is in <status>, not ready"
3. Read CLAUDE.md
4. Plan implementation based on ticket description
5. Create branch: feat/{{ticket}}-<short-desc>
6. Implement changes
7. Run tests
8. Commit per Conventional Commits, reference {{ticket}}
9. Open PR with template
10. Add "Closes {{ticket}}" in body
11. Add comment on Jira: "PR opened: <url>"
12. Transition Jira: "In Review"
```

Use:
```text
> /ship-ticket KAN-42
[All 12 steps execute]
```

## Step 8: Quality gates

Add hooks (Phase 7) for safety:

`.claude/settings.json`:
```json
{
  "hooks": {
    "preToolUse": {
      "github.create_pull_request": "verify-tests-pass.sh"
    }
  }
}
```

`verify-tests-pass.sh`:
```bash
#!/bin/bash
# Block PR creation if tests don't pass
pnpm test --silent || exit 1
pnpm lint --silent || exit 1
exit 0
```

→ Hook blocks PR creation unless tests + lint pass. Agent can't fake success.

## Step 9: Reviewer pattern

```text
[Two agent roles]

[Builder agent]
- Implements ticket
- Opens PR
- Runs tests

[Reviewer agent — separate session]
- Fetches PR diff
- Reviews per checklist
- Posts comments
- Approves OR requests changes
```

Custom skill `code-reviewer/SKILL.md`:
```markdown
---
name: pr-reviewer
description: Review PR. Check security, perf, conventions, edge cases.
---

# PR Review Protocol

1. Get PR: github.get_pull_request(repo, number)
2. Fetch diff
3. For each file:
   - Security: SQL injection? XSS? Auth bypass?
   - Convention: matches CLAUDE.md style?
   - Logic: edge cases handled?
   - Tests: covers new code?
4. Summarize findings
5. github.create_pr_review with comments
```

```text
> Review PR #87 using pr-reviewer skill
[Posts review comments on PR]
```

## Step 10: End-to-end demo

Daily routine after setup:

```text
[Morning]
- Check Jira: 5 tickets in sprint
- > /ship-ticket KAN-42 (first ticket)
- Review PR while agent works on next

[Afternoon]
- > /ship-ticket KAN-43
- > /ship-ticket KAN-44
- Reviewer agent runs on all PRs

[Evening]
- 3 PRs merged
- 1 PR needs design discussion (escalated to Slack)
- 1 PR has security concern (reviewer flagged)
- → Tomorrow: 2 PRs to fix, 3 new tickets
```

→ 3-5x throughput vs manual.

## Cost analysis

```text
[Per ticket]
- Jira fetch:          ~$0.01
- Read CLAUDE.md + 5 files: ~$0.05
- Implementation:      ~$0.30
- Tests + iteration:   ~$0.15
- PR open:            ~$0.02
Total:                 ~$0.50-1 per ticket (Sonnet 4.5)

[Daily 5 tickets]
~$2.50-5/day → $50-100/month

[ROI]
Each ticket ~30-60 min agent time
Same ticket human: 2-4 hours
→ 4-8x productivity per developer
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Jira ticket vague | Agent guess wrong | Force "AC" (acceptance criteria) in ticket |
| Auto-merge enabled | Bad code lands main | Require human approval |
| No reviewer agent | Bug slips | Two-agent pattern |
| API token in env unencrypted | Leak | Use secret manager (1Password CLI) |
| PR opens without tests pass | Broken CI | Pre-hook verify |
| Agent uses old branch | Conflict | Always fresh branch per ticket |
| Quên Jira transition | Status stale | Custom command updates |
| Multi-ticket parallel | Conflicts | Sequential or worktree isolation |

## Tóm tắt bài 1

- Jira + GitHub MCP → autonomous **ticket-to-PR** workflow.
- Setup: install MCP servers with API tokens.
- Single ticket: `> Implement KAN-XX` → agent does 10 steps.
- Batch: `> Implement these 5 tickets, one PR each`.
- Custom slash command `/ship-ticket KAN-XX` for repeatable workflow.
- Quality gates: hooks block PR if tests fail.
- Reviewer agent pattern: separate session, separate skill, posts review.
- Cost: ~$0.50-1/ticket Sonnet, ~$50-100/month, 4-8x productivity.

**Bài kế tiếp** → [Bài 2: AI Legal Doc SaaS — FastAPI + Cerebras production build](02-legal-doc-saas.md)
