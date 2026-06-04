# Bài 2: Skills — Lightweight alternative to MCP

**Skills** ra mắt 9/2025 bởi Anthropic — alternative đơn giản hơn MCP. Trong khi MCP cần spawn process, JSON-RPC protocol, port management, **Skill chỉ là một folder với markdown**. Không process, không protocol — chỉ file mà Claude Code load on-demand. Bài này dạy: cấu trúc, build, install từ marketplace, khi nào skill thay MCP.

## Skill vs MCP — Decision tree

```text
[Cần kết nối external API / DB không?]
       │
       ├── Có → MCP server (process, network access)
       │
       └── Không, chỉ logic + workflow → Skill (markdown file)

[Cần real-time data không?]
       │
       ├── Có → MCP (live API calls)
       │
       └── Không, chỉ knowledge / procedure → Skill

[Cần share giữa nhiều tool (Cursor + Claude)?]
       │
       ├── Có → MCP (cross-platform)
       │
       └── Không, chỉ Claude → Skill (faster)
```

→ Rule of thumb: **MCP** for connectivity, **Skill** for procedure.

## Skill structure

```text
~/.claude/skills/my-skill/
├── SKILL.md           ← required: metadata + instructions
├── scripts/           ← optional: helper scripts
│   └── format.sh
└── references/        ← optional: docs Claude can read
    └── api-spec.md
```

`SKILL.md` is the entry point.

## SKILL.md format

```markdown
---
name: pdf-extractor
description: Use when user asks to extract text or data from PDF files. Handles tables, images, OCR.
---

# PDF Extractor

When user asks to extract data from PDF:

1. Use the `pdfplumber` Python library (install if missing).
2. For tables: use `page.extract_tables()`.
3. For images: extract with `page.images` + save to disk.
4. For OCR (image-only PDFs): fallback to `pytesseract`.

## Script

A helper script is at `scripts/extract.py` — use it.

## Reference

See `references/pdfplumber-cheatsheet.md` for common patterns.
```

3 sections:
- **YAML frontmatter** (name + description) — Claude reads to decide IF to use this skill.
- **Body** — instructions when skill applies.
- **Reference paths** — to scripts and docs Claude reads when invoked.

## How Claude discovers + uses

```text
[User]: "Extract tables from quarterly_report.pdf"

[Claude]:
1. Scans available skills (reads only YAML frontmatter — fast)
2. PDF-extractor skill matches (PDF + extract intent)
3. Loads full SKILL.md
4. Reads referenced scripts if needed
5. Executes per instructions
```

Key insight: **only frontmatter loaded initially**. Body loaded on-demand. Cost-efficient.

## Compare with MCP

| Aspect | MCP | Skill |
|---|---|---|
| Setup | Process + protocol | Folder + markdown |
| Discovery | Tool list at startup | Frontmatter scan |
| Load cost | Always loaded | On-demand |
| Network | Yes | No (unless script calls) |
| Cross-tool | Yes (Cursor, etc) | Claude Code only |
| Versioning | npm version | Git |
| Sharing | npm/uvx | Git / Marketplace |
| Latency | Process startup | Instant |
| Memory | Process RAM | None |

## Build your first skill

```bash
mkdir -p ~/.claude/skills/git-conventional-commit
cd ~/.claude/skills/git-conventional-commit
```

`SKILL.md`:
```markdown
---
name: git-conventional-commit
description: Use when user asks to commit changes. Writes commit messages following Conventional Commits spec.
---

# Conventional Commit Helper

When committing:

1. Run `git status` and `git diff --staged` to understand changes.
2. Determine commit type:
   - feat: new feature
   - fix: bug fix
   - docs: documentation only
   - style: formatting
   - refactor: no behavior change
   - test: add/fix tests
   - chore: build/dep changes

3. Format: `<type>(<scope>): <subject>`
   - subject < 72 chars
   - present tense, lowercase
   - no period

4. Body (optional, blank line before):
   - Explain WHAT and WHY (not HOW)
   - Wrap at 72 chars
   - Reference issue: "Closes #42"

5. Run: git commit -m "<message>"

## Examples

✅ feat(auth): add OAuth GitHub provider
✅ fix(api): handle null user in profile route (Closes #123)
✅ refactor: extract cart logic to service layer

❌ updated stuff
❌ fix bug
❌ WIP
```

Save. Done.

## Test it

```bash
claude
> Commit my changes
[Claude finds skill, follows procedure]
[Runs git status, git diff, suggests properly formatted message]
```

## Skill examples worth building

### test-driven-fix

```markdown
---
name: test-driven-fix
description: Use when fixing a bug. Forces writing failing test first.
---

# TDD Bug Fix Protocol

1. Reproduce bug:
   - Run failing scenario manually OR
   - Have user describe steps

2. Write failing test that captures the bug:
   - Test name describes the bug
   - Run test → confirm RED

3. Fix code:
   - Minimal change
   - Re-run test → GREEN

4. Run full test suite → no regression

5. Commit: "fix: <description> (test: <test name>)"
```

### release-notes-generator

```markdown
---
name: release-notes
description: Use when user asks for release notes. Generates structured changelog from git history.
---

# Release Notes Generator

1. Run: git log --oneline LAST_TAG..HEAD
2. Categorize commits by conventional commit type:
   - 🚀 Features (feat:)
   - 🐛 Fixes (fix:)
   - 📚 Documentation (docs:)
   - 🔨 Refactor (refactor:)
   - ⚙️ Maintenance (chore:)

3. Format as Markdown:
   ## v1.2.3 - 2026-06-04

   ### 🚀 Features
   - Add OAuth GitHub provider (#42)
   
   ### 🐛 Fixes
   - Handle null user in profile route (#123)

4. Save to CHANGELOG.md, prepend to top.
```

### sql-review

```markdown
---
name: sql-review
description: Use when user asks to review SQL queries. Checks performance, security, style.
---

# SQL Code Review

For each query, check:

1. **Performance**
   - Indexes used (EXPLAIN)
   - N+1 patterns
   - Cartesian products
   - SELECT * without need

2. **Security**
   - Parameterized? No string concat
   - Privilege scope (no SUPER for app queries)

3. **Style**
   - UPPERCASE keywords
   - Alias tables
   - Comment WHY non-obvious

Use the `references/sql-anti-patterns.md` for full list.
```

## Skills marketplace

```text
[Discovery]
- github.com/anthropics/claude-skills    — official
- claudeskills.dev                       — community
- skills.anthropic.com                   — curated
```

Install from marketplace:
```bash
# Via marketplace CLI
claude skill install pdf-extractor

# Manual
git clone https://github.com/anthropics/claude-skills
cp -r claude-skills/pdf-extractor ~/.claude/skills/
```

## Project-level skills

```text
.claude/skills/   ← in your repo root
```

Same structure, scoped to project. Team members get same skills via git.

Example:
```text
my-project/
├── .claude/
│   └── skills/
│       ├── api-endpoint-add/
│       │   └── SKILL.md
│       ├── migration-create/
│       │   └── SKILL.md
│       └── deploy-staging/
│           └── SKILL.md
```

→ Junior dev join, Claude knows team conventions immediately.

## Skills with scripts

```text
skill-dir/
├── SKILL.md
└── scripts/
    └── analyze.py
```

`SKILL.md`:
```markdown
---
name: log-analyzer
description: Analyze application logs for errors and patterns.
---

When user shares log file:

1. Use `scripts/analyze.py` (Python 3.10+).
2. Pass log path: `python scripts/analyze.py path/to/log`.
3. Script outputs JSON: {errors, patterns, recommendations}.
4. Format for user as Markdown.
```

`scripts/analyze.py` — Claude doesn't load by default, runs via Bash tool when needed.

## Permissions in skill

Skill có thể tự gọi tool (Bash, Read, Write). But your CLAUDE.md / settings can scope:

```json
// settings.json
{
  "skills": {
    "log-analyzer": {
      "allowedTools": ["Bash", "Read"]
    }
  }
}
```

Lock down skill behavior.

## Skill vs subagent (Phase 7 preview)

```text
[Skill]      = procedural knowledge (when X, do Y, Z)
              Main agent uses

[Subagent]   = autonomous agent in own context
              Main agent delegates with task
```

Different abstraction. Phase 7 deep dive.

## Bẫy thường gặp với skill

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Description vague | Claude không trigger | Cụ thể "use when..." |
| Too many skills | Frontmatter scan slow | Curate, không quá 30 |
| Skill conflict (overlap intent) | Claude picks wrong | Differentiate clearly |
| Skill outdated | Wrong procedure | Versioning + review |
| Skill calls expensive API | Cost spike | Document cost |
| Hardcoded path | Skill non-portable | Relative path, env var |
| No reference docs | Skill instructions repetitive | Move to references/ |

## Tóm tắt bài 2

- **Skills** = lightweight alternative MCP — just folder + SKILL.md.
- No process, no protocol — markdown file Claude loads on-demand.
- Use **Skill for procedure** (how to do X), **MCP for connectivity** (talk to Y).
- Structure: `SKILL.md` + optional `scripts/`, `references/`.
- YAML frontmatter (name + description) — Claude scans cheap to decide trigger.
- Marketplace: anthropics/claude-skills, claudeskills.dev.
- Project-level: `.claude/skills/` in repo for team.
- Permissions: scope tools per skill via settings.
- Examples: conventional commit, TDD bug fix, release notes, SQL review.

**Bài kế tiếp** → [Bài 3: Plugins + Big Three Decision Matrix](03-plugins-decision.md)
