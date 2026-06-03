# Bài 2: OpenClaw — Telegram/WhatsApp Bot Agent

**OpenClaw** = pattern build **personal coding bot** trên Telegram/WhatsApp dùng Claude Agent SDK. Bạn nhắn tin: "Add password meter to login", bot spawn agent, agent code + PR, bot trả "Done: PR link". Workflow này shifted UX: agent thay là một **collaborator chat**, không phải tool bạn open terminal mở. Bài này build từ zero.

## Architecture

```text
[You on Telegram/WhatsApp]
        │ text message
        ▼
[Bot server (FastAPI)]
        │ Telegram Bot API webhook
        ▼
[Task queue (Redis)]
        │
        ▼
[Worker process]
        │ Spawn ClaudeAgent (SDK)
        ▼
[Container with repo cloned]
        │ Agent does work
        ▼
[Open PR via GitHub API]
        │ Notify
        ▼
[Bot → You: "PR #87 opened: <link>"]
```

## Stack

```text
- Bot framework: python-telegram-bot (Telegram)
                 whatsapp-cloud-api-async (WhatsApp)
- Queue: Redis
- Worker: Celery or asyncio queue
- Agent: claude-agent-sdk
- Container: Docker per task
- Deploy: Railway / Fly.io / VPS
```

## Step 1: Telegram bot setup

```text
1. Telegram: chat with @BotFather
2. /newbot → name, username
3. Get HTTP API token
4. Save in .env: TELEGRAM_BOT_TOKEN=...
```

## Step 2: Bot scaffold

```python
# bot.py
import os
from telegram import Update
from telegram.ext import ApplicationBuilder, CommandHandler, MessageHandler, filters, ContextTypes

ALLOWED_USER_IDS = {int(uid) for uid in os.getenv("ALLOWED_USERS", "").split(",")}

async def start(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if update.effective_user.id not in ALLOWED_USER_IDS:
        await update.message.reply_text("⛔ Unauthorized.")
        return
    
    await update.message.reply_text(
        "🤖 OpenClaw ready. Send me a task description.\n\n"
        "Commands:\n"
        "/status  — see active tasks\n"
        "/cancel <id> — cancel running task\n"
        "/repos — list connected repos\n"
        "/setrepo <repo> — set current repo\n"
    )

async def handle_task(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if update.effective_user.id not in ALLOWED_USER_IDS:
        return
    
    task = update.message.text
    user_id = str(update.effective_user.id)
    
    # Get user's current repo from session
    repo = await get_user_repo(user_id)
    if not repo:
        await update.message.reply_text("⚠️  No repo set. Use /setrepo first.")
        return
    
    # Queue task
    task_id = await queue_task(user_id, repo, task)
    
    await update.message.reply_text(
        f"✅ Task queued: {task_id}\n"
        f"Repo: {repo}\n"
        f"Task: {task[:100]}...\n\n"
        f"I'll notify you when done."
    )

def main():
    app = ApplicationBuilder().token(os.getenv("TELEGRAM_BOT_TOKEN")).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("status", status_cmd))
    app.add_handler(CommandHandler("setrepo", setrepo_cmd))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_task))
    app.run_polling()

if __name__ == "__main__":
    main()
```

## Step 3: Worker — Spawn agent

```python
# worker.py
import asyncio, tempfile, os, shutil, subprocess
from claude_agent_sdk import ClaudeAgent

async def process_task(task_id: str, user_id: str, repo: str, task: str):
    workdir = tempfile.mkdtemp(prefix=f"oclaw-{task_id}-")
    
    try:
        # 1. Clone repo
        github_token = await get_user_github_token(user_id)
        await run_cmd(f"git clone https://x:{github_token}@github.com/{repo} {workdir}")
        
        # 2. Create branch
        branch = f"openclaw/{task_id}"
        await run_cmd(f"git -C {workdir} checkout -b {branch}")
        
        # 3. Run agent
        agent = ClaudeAgent(
            api_key=os.getenv("ANTHROPIC_API_KEY"),
            model="claude-sonnet-4-5",
            working_directory=workdir,
            allowed_tools=["read", "edit", "bash", "grep", "glob"],
            max_cost_usd=2.00,
            max_duration_seconds=1800,
        )
        
        await notify_user(user_id, f"🚧 Working on task {task_id}...")
        
        response = await agent.run(task)
        
        # 4. Commit
        await run_cmd(f"git -C {workdir} add -A")
        await run_cmd(f'git -C {workdir} commit -m "feat: {task[:50]} (#openclaw-{task_id})"')
        
        # 5. Push
        await run_cmd(f"git -C {workdir} push -u origin {branch}")
        
        # 6. Open PR
        pr_url = await create_pr(repo, branch, task, response.summary, github_token)
        
        await notify_user(user_id, 
            f"✅ Task {task_id} done!\n"
            f"PR: {pr_url}\n"
            f"Cost: ${response.cost_usd:.2f}\n"
            f"Tools called: {len(response.tool_calls)}\n\n"
            f"Reply ✅ to approve and merge, ❌ to discard."
        )
        
    except Exception as e:
        await notify_user(user_id, f"❌ Task {task_id} failed: {e}")
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
```

## Step 4: Task queue with Redis

```python
# queue.py
import redis.asyncio as redis
import uuid, json

r = redis.from_url(os.getenv("REDIS_URL"))

async def queue_task(user_id: str, repo: str, task: str) -> str:
    task_id = str(uuid.uuid4())[:8]
    
    await r.hset(f"task:{task_id}", mapping={
        "user_id": user_id,
        "repo": repo,
        "task": task,
        "status": "queued",
    })
    
    await r.lpush("openclaw:queue", task_id)
    return task_id

async def dequeue_task() -> dict:
    task_id = await r.brpop("openclaw:queue", timeout=10)
    if not task_id:
        return None
    task_id = task_id[1].decode()
    data = await r.hgetall(f"task:{task_id}")
    return {**{k.decode(): v.decode() for k, v in data.items()}, "id": task_id}

# Worker loop
async def worker_loop():
    while True:
        try:
            task = await dequeue_task()
            if task:
                await process_task(task["id"], task["user_id"], task["repo"], task["task"])
        except Exception as e:
            log.error(f"Worker error: {e}")
            await asyncio.sleep(5)
```

## Step 5: PR approval via emoji react

```python
async def handle_message(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    text = update.message.text
    reply_to = update.message.reply_to_message
    
    # Check if reply to bot's "PR opened" message
    if reply_to and reply_to.from_user.is_bot:
        # Extract task_id from previous message
        task_id = extract_task_id(reply_to.text)
        
        if text == "✅":
            await merge_pr_for_task(task_id)
            await update.message.reply_text("✅ Merged!")
        elif text == "❌":
            await discard_pr_for_task(task_id)
            await update.message.reply_text("🗑️ Discarded.")
```

## Step 6: Deployment

`Dockerfile`:
```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN pip install uv && uv sync
COPY . .

# Multi-binary: bot + worker
ENTRYPOINT ["python"]
CMD ["bot.py"]
```

`docker-compose.yml`:
```yaml
services:
  bot:
    build: .
    command: python bot.py
    env_file: .env
    depends_on: [redis]
  
  worker:
    build: .
    command: python worker.py
    env_file: .env
    deploy: { replicas: 3 }   # 3 parallel workers
    depends_on: [redis]
  
  redis:
    image: redis:7-alpine
```

Deploy to Fly.io / Railway:
```bash
fly deploy
```

Set Telegram webhook (or polling mode):
```bash
curl -X POST "https://api.telegram.org/bot$TOKEN/setWebhook" \
  -d "url=https://yourapp.fly.dev/telegram-webhook"
```

## Use case real

```text
[Monday morning, in car]
Me on phone Telegram: "Add a /version endpoint to my API"
Bot: ✅ Task queued
[Drive to office, agent works in cloud]
[At office, 15 min later]
Bot: ✅ Done! PR opened: github.com/.../pull/142
       Cost: $0.42 | Tools: 8
       Reply ✅ to merge
Me reply: ✅
Bot: ✅ Merged
[Open laptop, pull main, version endpoint live]
```

→ Coding while not at computer. Liberation.

## Cost realistic

```text
[Per task estimated]
- Clone repo: free
- Sonnet 4.5 agent: ~$0.30-1.50 per task
- Compute (container): ~$0.05
- GitHub API: free

[Daily 10 tasks personal use]
~$5-15/day Anthropic = $150-450/month
Plus VPS ~$10/month
```

→ Worth it for productivity unlock.

## Security

```text
[Critical]
- ALLOWED_USERS env var — bot only responds to specific Telegram IDs
- GitHub token scoped to specific repos (not org-wide)
- Container isolation per task
- Cost cap per task ($2)
- Audit log every task to DB
- Rate limit: max 5 tasks queued per user

[Privacy]
- Don't log full code in DB
- Encrypt secrets at rest
- Don't share container between users
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Bot public to all users | Crypto bill spike | Allowlist users |
| Workers same dir | Conflict | tempdir per task |
| No cost cap | Bill shock | max_cost_usd |
| Long timeout | Stuck workers | max_duration |
| Forget cleanup workdir | Disk fills | finally shutil.rmtree |
| Trust user prompt blindly | Abuse | Sanitize input |
| Sync agent in async webhook | Block | asyncio properly |
| Webhook public no auth | Attack surface | Verify Telegram signature |

## OpenClaw variations

```text
[WhatsApp version]
- Use Twilio API or Meta WhatsApp Cloud API
- Same pattern, different SDK

[Slack version]
- Bolt SDK
- Slash commands + interactive messages

[Discord]
- discord.py
- Server channels for team

[Mobile native]
- iOS Shortcuts → HTTP POST your bot endpoint
- Android Tasker integration
```

→ Same pattern, different surface.

## Tóm tắt bài 2

- **OpenClaw** = personal coding bot pattern over Telegram/WhatsApp.
- Stack: bot framework + Redis queue + Claude Agent SDK + Docker.
- Workflow: text → queue → worker spawn agent → PR → notify.
- Approval via emoji react (✅ merge, ❌ discard).
- Cost: ~$0.30-1.50/task, ~$150-450/month personal use.
- Security: allowlist users, scoped tokens, container isolation, cost cap.
- Variations: WhatsApp, Slack, Discord, iOS Shortcuts.
- UX shift: code while not at computer. Liberation.

🎉 **Hoàn thành Phase 9** — programmatic + mobile/chat surfaces. Phase 10 last frontier: multi-agent orchestration.

**Bài kế tiếp** → [Phase 10 - Bài 1: Agent Teams + GSD Spec-Driven Design](../phase-10-multi-agent/01-agent-teams-gsd.md)
