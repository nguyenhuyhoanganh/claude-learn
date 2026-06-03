# Bài 1: Claude Agent SDK — Programmatic AI agent

**Claude Agent SDK** (released 8/2025) cho phép build **Claude Code as library**, không phải CLI tool. Python/TypeScript SDK spawn agent loop inside your app. Use case: build SaaS với AI agent feature, automation server, custom CLI tool, **OpenClaw** (Telegram bot dạng Claude Code). Bài này dạy SDK fundamentals + practical patterns.

## SDK vs CLI

```text
[Claude Code CLI]
- Terminal-based
- Human interactive
- Built-in YOLO mode

[Claude Agent SDK]
- Library (import in Python/TS)
- Programmatic
- Build into your app
- You control loop
- Add custom tools
- Embed in microservice
```

→ SDK = CLI's engine exposed.

## Install

### Python

```bash
pip install claude-agent-sdk
```

### TypeScript

```bash
npm install @anthropic-ai/claude-agent-sdk
```

## Minimal example — Python

```python
from claude_agent_sdk import ClaudeAgent
import asyncio

async def main():
    agent = ClaudeAgent(
        api_key="sk-ant-...",
        model="claude-sonnet-4-5",
        system_prompt="You are a helpful coding assistant.",
        allowed_tools=["read", "edit", "bash"],
        working_directory="/path/to/project"
    )
    
    response = await agent.run(
        "Add a /health endpoint returning {status: ok} to FastAPI app"
    )
    
    print(response.summary)
    print(f"Tools called: {response.tool_calls}")
    print(f"Cost: ${response.cost_usd}")

asyncio.run(main())
```

→ Spawn agent, give task, get summary. Same engine as Claude Code.

## TypeScript example

```typescript
import { ClaudeAgent } from "@anthropic-ai/claude-agent-sdk";

const agent = new ClaudeAgent({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    model: "claude-sonnet-4-5",
    systemPrompt: "You are a coding assistant.",
    allowedTools: ["read", "edit", "bash"],
    workingDirectory: process.cwd(),
});

const response = await agent.run(
    "Add a /health endpoint to the Express app"
);

console.log(response.summary);
```

## Streaming events

```python
async with ClaudeAgent(...) as agent:
    async for event in agent.run_stream("task"):
        if event.type == "text":
            print(event.text, end="", flush=True)
        elif event.type == "tool_use":
            print(f"\n[Tool: {event.tool_name}({event.input})]")
        elif event.type == "tool_result":
            print(f"[Result: {event.result[:100]}...]")
        elif event.type == "done":
            print(f"\n[Cost: ${event.cost_usd}]")
```

→ Stream every agent step → great for UI feedback.

## Custom tools

```python
from claude_agent_sdk import tool

@tool(
    name="query_database",
    description="Run read-only SQL query against the app database",
    input_schema={
        "type": "object",
        "properties": {
            "sql": {"type": "string", "description": "SELECT query only"}
        },
        "required": ["sql"]
    }
)
async def query_database(sql: str) -> str:
    if not sql.strip().upper().startswith("SELECT"):
        return "Error: only SELECT queries allowed"
    
    async with get_db_session() as db:
        result = await db.execute(text(sql))
        rows = result.fetchall()
        return json.dumps([dict(r) for r in rows])

# Register
agent = ClaudeAgent(
    ...,
    custom_tools=[query_database]
)
```

→ Agent có thêm tool. Same model as built-in. LLM decides when to use.

## Patterns

### Pattern 1: SaaS feature — "Ask AI to code"

```python
# /api/ai/generate route
@app.post("/api/ai/generate")
async def generate_code(req: GenerateRequest, user=Depends(auth)):
    # Sandbox per user request
    workdir = f"/tmp/sandbox/{uuid4()}"
    os.makedirs(workdir)
    
    # Clone user's repo
    await clone_repo(req.repo_url, workdir, user.github_token)
    
    # Run agent
    agent = ClaudeAgent(
        api_key=settings.ANTHROPIC_API_KEY,
        working_directory=workdir,
        allowed_tools=["read", "edit", "bash"],
        max_cost_usd=0.50,   # cost cap per user request
    )
    
    response = await agent.run(req.task)
    
    # Open PR via GitHub API
    pr_url = await open_pr(workdir, response.summary, user.github_token)
    
    # Cleanup
    shutil.rmtree(workdir)
    
    return {"pr_url": pr_url, "cost": response.cost_usd}
```

→ User submits task via your app, agent runs, opens PR in their repo. Monetize.

### Pattern 2: Batch job processor

```python
async def process_tickets_overnight():
    tickets = await jira.get_tickets_with_label("AI-ready")
    
    for ticket in tickets:
        try:
            await run_agent_for_ticket(ticket)
            await jira.transition(ticket.key, "In Review")
        except Exception as e:
            await jira.comment(ticket.key, f"Agent failed: {e}")

async def run_agent_for_ticket(ticket):
    workdir = await setup_workdir(ticket.repo)
    agent = ClaudeAgent(
        working_directory=workdir,
        max_cost_usd=2.00,
        max_duration_seconds=3600,
    )
    await agent.run(f"Implement {ticket.key}: {ticket.summary}\n\n{ticket.description}")
    await open_pr(workdir, ticket)
```

### Pattern 3: Conversational agent in your app

```python
# Conversation persistent
agent = ClaudeAgent(...)

async def chat(user_message: str, session_id: str):
    # Load session history from DB
    history = await get_session(session_id)
    
    response = await agent.run(
        user_message,
        conversation_history=history
    )
    
    # Save updated history
    await save_session(session_id, response.history)
    
    return response.text
```

→ Multi-turn conversation with same agent state.

### Pattern 4: Headless CI/CD

```yaml
# .github/workflows/ai-review.yml
name: AI Review PR

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.ref }}
          fetch-depth: 0
      
      - name: Run AI review
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          pip install claude-agent-sdk
          python .github/scripts/ai_review.py ${{ github.event.pull_request.number }}
```

`.github/scripts/ai_review.py`:
```python
import os, sys
from claude_agent_sdk import ClaudeAgent
from github import Github

pr_number = int(sys.argv[1])
gh = Github(os.environ["GITHUB_TOKEN"])
repo = gh.get_repo(os.environ["GITHUB_REPOSITORY"])
pr = repo.get_pull(pr_number)

# Get diff
diff = pr.diff_url
import requests
diff_text = requests.get(diff).text

# Run reviewer agent
agent = ClaudeAgent(
    system_prompt="You are a senior code reviewer. Focus security, perf, maintainability.",
    model="claude-opus-4-5",
    allowed_tools=[],   # text only
)
review = await agent.run(f"Review this diff:\n\n{diff_text}")

# Post as PR comment
pr.create_issue_comment(f"## AI Review\n\n{review.text}")
```

→ Every PR auto-reviewed by AI.

## Cost management

```python
agent = ClaudeAgent(
    ...,
    # Hard limits
    max_cost_usd=5.00,
    max_duration_seconds=1800,
    max_tool_calls=100,
    
    # Cost tracking callback
    on_tool_call=lambda call: log_to_metrics(call),
)
```

```python
# Check after run
if response.exceeded_limit:
    raise BudgetExceededError(response.exceeded_reason)
```

## Permission scoping

```python
agent = ClaudeAgent(
    ...,
    allowed_tools=["read", "grep", "glob"],   # read-only
    denied_tools=["bash"],
    forbidden_paths=["/etc", "/.ssh", ".env*"],
    bash_command_allowlist=["pytest", "ruff", "git status"],
)
```

→ Sandbox semantics in SDK.

## Hooks programmatic

```python
@agent.on("pre_tool_use")
async def audit_tool(tool_name, tool_input):
    await audit_log({"tool": tool_name, "input": tool_input})

@agent.on("post_tool_use")
async def check_secret_leak(tool_name, output):
    if any(pattern in output for pattern in SECRET_PATTERNS):
        raise SecretLeakError()

@agent.on("session_end")
async def summarize(response):
    await metrics.record(response.cost_usd, response.duration)
```

## Subagent spawning

```python
# Main agent
main_agent = ClaudeAgent(...)

# Inside task, programmatic spawn subagent
async def task_with_subagents():
    explorer = ClaudeAgent(
        model="claude-haiku-4-5",   # cheap
        allowed_tools=["read", "grep", "glob"],
    )
    findings = await explorer.run("Map all auth code")
    
    implementer = ClaudeAgent(
        model="claude-sonnet-4-5",
    )
    await implementer.run(f"Refactor per findings:\n{findings.text}")
```

## Compare CLI vs SDK

| Aspect | CLI (claude command) | SDK (library) |
|---|---|---|
| Use case | Human interactive | Programmatic |
| Surface | Terminal | Python/TS code |
| Custom tools | MCP servers | Decorator @tool |
| State | File-based session | Variable in code |
| Deploy | Per machine | Microservice |
| Cost cap | Per session manual | Built-in |
| Hooks | Shell scripts | Python callback |

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| No cost cap | Bill shock | Always max_cost_usd |
| No timeout | Hang forever | max_duration_seconds |
| Allow all tools | Risk | Minimal allowed_tools |
| Forget working_directory | Wrong files | Explicit path |
| Long history | Token cost grows | Reset between sessions |
| Concurrent agents in same dir | Conflict | Worktree per agent |
| Sync call in async context | Block | await properly |
| Custom tool no input validation | Inject | Validate schema strict |

## Tóm tắt bài 1

- **Claude Agent SDK** = Claude Code engine exposed as Python/TS library.
- Use cases: SaaS AI feature, batch job, conversational agent, CI/CD reviewer.
- Custom tools via decorator `@tool`.
- Streaming events for UI feedback.
- Programmatic subagent spawn for hierarchical workflow.
- Cost cap, timeout, tool allowlist, forbidden paths.
- Hooks callback-based (Python) vs shell (CLI).
- Patterns: SaaS feature, batch, conversational, CI/CD.

**Bài kế tiếp** → [Bài 2: OpenClaw — Telegram/WhatsApp bot agent](02-openclaw-bot.md)
