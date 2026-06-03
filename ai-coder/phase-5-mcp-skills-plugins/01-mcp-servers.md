# Bài 1: MCP Servers — Universal tool protocol for AI agents

**MCP (Model Context Protocol)** ra mắt 11/2024 bởi Anthropic. Mission: chuẩn hóa cách AI agent kết nối với **external tool** — DB, API, file system, third-party service. Trước MCP: mỗi tool phải custom integration. Sau MCP: 1 protocol, install 1 lần, dùng được mọi nơi (Claude Code, Cursor, Codex, future agents). Bài này deep dive cấu trúc, install, top servers production.

## Vấn đề MCP giải

```text
[Before MCP — vendor lock-in]
Cursor:    có Cursor-specific tool integrations
Claude:    có Claude-specific
Copilot:   có Copilot-specific
→ Cùng API (Slack, Postgres, GitHub) phải config 3 lần khác nhau

[After MCP]
1 server cho service (vd github-mcp-server)
   ↑ ↑ ↑
   Claude Code, Cursor, Codex tất cả đều connect được
```

## Anatomy

```text
[MCP Host]              ← Claude Code, Cursor, ...
       │ JSON-RPC over stdio (or HTTP/SSE)
       ▼
[MCP Server]            ← github-mcp-server, postgres-mcp, ...
       │
       ▼
[External service]      ← GitHub API, Postgres, Slack, ...
```

3 thành phần:
- **Host**: AI agent dùng tool (Claude Code).
- **Server**: process expose tool, resource, prompt.
- **Service**: thật sự (DB, API).

## Capabilities of MCP server

```text
[Tools]      Functions agent can call
             Example: search_issues(query), create_pr(title, body)

[Resources]  Read-only data agent can fetch  
             Example: file://config.json, postgres://users/schema

[Prompts]    Templates agent can invoke
             Example: "Summarize this PR in 3 bullets"
```

Most useful: **Tools**. 90% MCP server expose chỉ tools.

## Đọc claude_desktop_config.json

```json
// ~/.claude/claude_desktop_config.json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_..."
      }
    },
    "postgres": {
      "command": "uvx",
      "args": ["mcp-server-postgres"],
      "env": {
        "DATABASE_URL": "postgres://..."
      }
    }
  }
}
```

`command + args` = process spawn. `env` = secret pass to server.

Claude Code spawn 1 process per MCP server when start. Communicate JSON-RPC stdio.

## Install MCP server — Claude Code CLI

```bash
# Add server
claude mcp add github \
  --command npx \
  --args "-y,@modelcontextprotocol/server-github" \
  --env GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxx

# List
claude mcp list

# Remove
claude mcp remove github

# Test
claude
> /mcp
[shows status of each server]
```

Hoặc edit JSON config trực tiếp. CLI hiện đại hơn.

## Top MCP servers production 2026

### Context7 — Up-to-date library docs

```text
[Problem]
LLM training cutoff lag. "Use Next.js 14" khi 15 đã ra.
Hallucinate API methods không tồn tại.

[Solution: Context7 MCP]
Agent calls: context7.get_docs("nextjs", "app-router")
→ Returns latest official docs
→ No hallucination
```

Install:
```bash
claude mcp add context7 --command npx --args "-y,@upstash/context7-mcp"
```

Use in prompt:
```text
> Implement Server Actions in Next.js 15.
> Use Context7 to check latest API.
```

→ Agent fetches doc, codes correctly. **Single biggest hallucination fix** 2025-2026.

### GitHub MCP

```text
Tools:
- search_issues, search_pull_requests
- get_issue, get_pr, get_pr_files
- create_issue, create_pr, add_comment
- list_repos, list_files
- get_workflow_runs
```

Install:
```bash
claude mcp add github \
  --command npx --args "-y,@modelcontextprotocol/server-github" \
  --env GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxx
```

Use:
```text
> Find issue #42 details. Fix the bug. Open PR linking to issue.
> [Claude uses GitHub tools to get + create]
```

### Postgres MCP

```text
Tools:
- query (SELECT)
- list_schemas, list_tables, describe_table
- (Write disabled by default — safety)
```

```bash
claude mcp add postgres \
  --command uvx --args "mcp-server-postgres" \
  --env "DATABASE_URL=postgres://readonly@host/db"
```

→ Agent có thể explore schema, optimize query without write access.

### Filesystem MCP

```text
Tools:
- read_file, write_file
- list_directory
- search_files
```

Default Claude Code đã có tools tương đương (Read, Write, Edit). Filesystem MCP useful khi:
- Limit agent đến specific directory tree.
- Sandboxed access.

### Polygon (financial data)

```text
Tools:
- get_stock_price, get_historical_bars
- get_news, get_company_info
```

Use case: AI trading bot, financial analysis.

### Slack MCP

```text
Tools:
- list_channels, list_users
- search_messages
- post_message, react
```

Use case: PR notification, alert escalation.

### Notion MCP

```text
Tools:
- search_pages, get_page_content
- create_page, update_page
- query_database
```

Use case: pull docs into context, auto-update docs.

### Browserbase / Playwright MCP

```text
Tools:
- navigate, click, fill, screenshot
- get_text, eval_javascript
```

Use case: scrape, E2E test, browser automation.

### Custom MCP cho project

```text
[Pattern]
Build MCP server cho internal API:
- Your company's database
- Internal microservice
- Proprietary tools

→ Agent có same capability như team member
```

Phase 5 bài 3 dạy build custom MCP.

## MCP marketplaces 2026

```text
[Discovery]
- modelcontextprotocol.io           — official
- mcpservers.org                    — community list
- github.com/modelcontextprotocol/servers  — official servers
- smithery.ai                       — installer + marketplace
- mcp.so                            — community catalog
```

Smithery = npm/brew for MCP:
```bash
npx @smithery/cli install github --client claude
```

→ One command install + config.

## Permission scoping

```json
{
  "mcpServers": {
    "github": {
      "command": "...",
      "env": {"GITHUB_PERSONAL_ACCESS_TOKEN": "..."}
    }
  },
  "mcpPermissions": {
    "github": {
      "allowedTools": ["search_issues", "get_pr"],
      "deniedTools": ["create_pr"]
    }
  }
}
```

→ MCP server có 20 tools nhưng bạn chỉ allow 5. Compose granular access.

## Project-level MCP

```text
~/.claude/claude_desktop_config.json   ← global
$PROJECT/.mcp.json                     ← per-project
```

`.mcp.json` in repo: team members same MCP config. Commit + share.

```json
// .mcp.json
{
  "mcpServers": {
    "ourdb": {
      "command": "uvx",
      "args": ["mcp-postgres"],
      "env": {"DATABASE_URL": "${POSTGRES_URL}"}
    }
  }
}
```

Env interpolation works. Team members set their own `POSTGRES_URL` locally.

## Bẫy thường gặp với MCP

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Token plain text in config | Leak khi commit | Env var interpolation |
| Install nhiều MCP không dùng | Tool noise | Install on-demand |
| MCP server hang | Block agent | Health check / timeout |
| MCP server với write access prod | Agent có thể delete prod | Read-only credentials |
| Trust output MCP blindly | Stale data | Refresh/verify critical |
| Quên restart sau config change | Old config | Restart Claude Code |
| Mix MCP version | Compat break | Pin version |
| Custom MCP no auth | Bypass intended | Add auth layer |

## Debug MCP

```bash
# Test MCP server standalone
npx @modelcontextprotocol/inspector npx -y @modelcontextprotocol/server-github

# In Claude Code
> /mcp
[shows connection status, errors]

# Logs
~/.claude/logs/mcp-*.log
```

Inspector = web UI dev tool. Send mock calls, see response.

## Cost considerations

```text
[MCP cost]
- Server process: minimal CPU/RAM
- API call inside server: depends on service
  - Postgres: free (your DB)
  - GitHub: free with PAT (rate limit)
  - Notion: free tier OK
  - Polygon: $$ per call
  - Browserbase: $$ per browser session
```

→ Watch out: agent might over-call expensive MCP. Set rate limit or budget alert.

## Tóm tắt bài 1

- **MCP** = standardized protocol cho AI agent → external tool.
- 3 capabilities: **Tools** (most used), **Resources**, **Prompts**.
- Config in `~/.claude/claude_desktop_config.json` or `.mcp.json` (project).
- Install via `claude mcp add ...` or marketplace (Smithery, mcp.so).
- Top servers production: **Context7** (fix hallucination), **GitHub**, **Postgres**, **Notion**, **Browserbase**, **Polygon**, **Slack**.
- Permission scoping: allow/deny specific tools per server.
- Project-level `.mcp.json` for team-shared config.
- Debug với `@modelcontextprotocol/inspector`.
- Cost: server free, but API calls inside might be paid.

**Bài kế tiếp** → [Bài 2: Skills — Simpler way to add abilities](02-skills.md)
