# Bài 4: Evolution — 8 stages từ ChatGPT đến Agent Orchestration

Hành trình của developer dùng AI code chia thành 8 stage tiến hóa, mỗi stage có pattern riêng. Hiểu mình đang ở stage nào → biết bước kế tiếp. Bài này cũng giới thiệu **artificialanalysis.ai** — site so sánh model hàng đầu, giúp chọn LLM đúng cho task.

## 8 Stages of AI Coding

```text
Stage 1: Copy-paste from ChatGPT
Stage 2: Inline autocomplete (Copilot)
Stage 3: Chat panel in IDE (Cursor Chat)
Stage 4: Agent mode in IDE (Cursor Composer)
Stage 5: Agent CLI (Claude Code, Codex CLI)
Stage 6: YOLO mode (auto-execute)
Stage 7: Background agents (cloud sandbox)
Stage 8: Agent orchestration (multi-agent teams)
```

Mỗi stage **không thay thế** stage trước — accumulative. Bạn có thể dùng cả 8 trong cùng project.

## Stage 1: Copy-paste ChatGPT (2022-2023)

```text
[Workflow]
1. Mở ChatGPT browser
2. Mô tả bug bằng English
3. Copy code error từ IDE
4. Paste vào ChatGPT
5. Đọc response, copy code suggestion
6. Paste back vào IDE
7. Test, repeat
```

Vibe: "magic chatbox". Tốn thời gian copy-paste, không context project, không tool use.

**Vẫn dùng được**: hỏi concept, debug small snippet, learning. Nhưng không phải production workflow.

## Stage 2: Inline autocomplete (Copilot 2021+)

```text
[Workflow]
- Bạn gõ comment / function signature
- Tab → suggest hoàn chỉnh function
- Tab → accept hoặc Esc reject
```

Pattern:
```python
# Calculate compound interest
def compound_interest(principal, rate, time, n):
    # ← Copilot gợi ý phần thân function
```

Mạnh nhất ở: boilerplate, repetitive pattern, function bạn đã biết logic.

Yếu ở: architecture decision, cross-file refactor, debug.

**Vẫn dùng được**: 50% developer 2025 vẫn dùng Copilot cho autocomplete + chat. Ổn định, không hype.

## Stage 3: Chat panel trong IDE (Cursor Chat 2023+)

```text
[Workflow]
- Sidebar chat panel
- Ask question với context file hiện tại
- Get answer + code snippet
- Apply changes thủ công hoặc accept diff
```

Nâng cấp từ Stage 1: chat có **context file**. Không cần copy-paste.

Cursor Chat, Copilot Chat đều ở stage này. Mạnh: hỏi nhanh về code mở.

## Stage 4: Agent mode trong IDE (Cursor Composer 2024+)

```text
[Workflow]
- Mô tả task ("add login feature")
- Agent edit nhiều file tự động
- Bạn review diff, accept/reject
- Repeat
```

Đây là bước nhảy: agent **đa file**. Không cần chỉ định file nào — agent tự explore.

Cursor Composer, Copilot Edits đại diện stage này.

## Stage 5: Agent CLI (Claude Code 2/2025+)

```text
[Workflow]
- Terminal-based: claude trong project root
- Agent tự động: Read, Edit, Bash, Test
- Loop tới khi task done
- Bạn review final diff trong git
```

Khác Stage 4:
- **No IDE UI** — pure terminal.
- **Tool use mạnh hơn** — bash, search, network.
- **Scriptable** — chạy trong CI/CD, automation.
- **Lightweight** — không RAM nặng như IDE.

Claude Code pioneer. Cursor CLI, Codex CLI, Gemini CLI ra đời sau.

## Stage 6: YOLO mode (mid-2025+)

```text
YOLO = You Only Live Once
= Bypass permissions
= Auto-execute mọi tool call, không hỏi
```

Stage 5 mặc định **hỏi** mỗi tool destructive (Write, Bash dangerous). YOLO mode tắt prompt → agent chạy autonomous.

```bash
claude --dangerously-skip-permissions
# hoặc
cursor --auto-approve
```

Trade-off:
- ✓ 5-10x nhanh hơn (không bị block).
- ✗ Risk cao (agent có thể `rm -rf` nhầm).

Safety:
- Chạy trong **container/sandbox** isolated.
- Không có production credentials trong env.
- Git commit thường xuyên (rollback dễ).

Phase 3 bài 1 deep dive YOLO setup an toàn.

## Stage 7: Background agents (cloud sandbox, late 2025+)

```text
[Workflow]
- Push prompt qua web UI
- Cloud sandbox spawn fresh container
- Agent chạy YOLO trong sandbox
- Bạn không cần local mở terminal
- Khi xong, agent push PR
- Reviewer merge
```

Platforms:
- **Sprites.dev** — Anthropic-blessed cloud Claude Code.
- **Codex Cloud** — OpenAI hosted.
- **GitHub Copilot Workspace** — Microsoft.
- **Devin** — Cognition AI.

Pattern: bạn ngủ, agent build feature. Sáng dậy review PR.

Phase 8 deep dive cloud sandboxes.

## Stage 8: Agent orchestration (early 2026+)

```text
[Multi-agent team]
- Architect agent → design plan
- Backend agent → implement API
- Frontend agent → implement UI
- Tester agent → write + run tests
- Reviewer agent → review code

[Coordinated by]
- Claude Agent SDK
- GSD (Goal-Spec-Design)
- Gastown swarm
- Custom orchestrator
```

Multiple agent chạy **parallel**, share context có kiểm soát, merge work. Đây là frontier 2026.

Khóa Week 3 chi tiết stage này.

## Bạn nên ở stage nào?

```text
[Mới bắt đầu]            Stage 2-4 (Copilot + Cursor chat)
[Junior dev 1-2 năm]    Stage 4-5 (Cursor agent + Claude Code)
[Mid-senior]            Stage 5-6 (Claude Code YOLO trong container)
[Senior+]               Stage 6-8 (cloud sandbox, multi-agent)
```

Quy luật: **đừng skip stage**. Cần build muscle memory mỗi stage trước stage tiếp.

Ví dụ: nhảy từ Stage 2 sang Stage 8 → không hiểu agent loop → không debug được khi agent fail.

## Khóa này dạy stage nào?

```text
Week 1: Stage 4-6 (Cursor agent, Copilot, YOLO basics)
Week 2: Stage 5-6 deep (Claude Code mastery, MCP, plugins)
Week 3: Stage 7-8 (cloud sandbox, multi-agent orchestration)
```

Hết Week 3, bạn ở Stage 8 — top 5% Go-To-Market AI coder.

## artificialanalysis.ai — Compare LLM

Site **artificialanalysis.ai** đo benchmark LLM theo:
- **Intelligence** — composite score nhiều benchmark.
- **Speed** — tokens/sec.
- **Price** — $/1M tokens.
- **Context** — window size.

Pattern bench top 2026:
```text
[Coding tasks]
- Claude Sonnet 4.5: 75 intelligence, $3 in / $15 out per 1M
- Claude Opus 4.5:    82 intelligence, $15 in / $75 out
- GPT-5.2:            78 intelligence, $5 in / $20 out
- Gemini 3 Pro:       74 intelligence, $2 in / $10 out
- GLM 4.7 (open):     65 intelligence, $0.5 in / $2 out

[Reasoning tasks]
- Claude Opus 4.5 extended thinking: top
- OpenAI o3:                          top
- Gemini 3 Deep Think:                competitive

[Speed]
- Cerebras (any model):  ~1500 tok/s — 10x normal
- Groq:                  ~800 tok/s
- Standard providers:    ~100-200 tok/s
```

→ Update mỗi tuần. Bookmark site.

## Pricing tier — Chọn model cho task

```text
[Light task — autocomplete, rename, format]
GPT-4.1 mini, Sonnet 4.5 fast tier, Gemini Flash
Price: $0.1-1 per 1M tokens

[Medium task — implement feature, fix bug]
Sonnet 4.5, GPT-5.2, Gemini 3 Pro
Price: $2-5 per 1M tokens

[Hard task — architecture, complex debug]
Opus 4.5, OpenAI o3 reasoning
Price: $15+ per 1M tokens

[Bulk task — generate 1000 unit tests]
GLM 4.7 (open), Llama 3 405B (Cerebras)
Price: $0.5-2 per 1M tokens
```

Pattern: **route theo task complexity**. OpenRouter cho phép dynamic routing (Phase 3 dạy).

## Model strengths 2026

| Model | Mạnh nhất ở |
|---|---|
| Claude Sonnet 4.5 | Coding tổng thể, agent tool use |
| Claude Opus 4.5 | Hardest reasoning, architecture |
| GPT-5.2 | Multimodal, long doc |
| Gemini 3 Pro | Huge context (2M), Google integration |
| Gemini 3 Deep Think | Math, science |
| OpenAI o3 | Step-by-step reasoning |
| GLM 4.7 | Open source, self-host, multi-lingual |
| Cerebras (any) | Speed — 10x faster |

→ Không có "best model overall". Pick theo task.

## Bẫy khi đánh giá model

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Trust 1 benchmark | Bias 1 use case | Composite + your task |
| Pick model hot tuần này | Tốn config | Wait 2-4 tuần |
| Dùng GPT cho everything | Lãng phí $ | Route by task |
| Pick reasoning mode default | Latency cao | Chỉ khi cần |
| Trust marketing demo | Cherry-picked | Test real task |
| Ignore Cerebras / Groq | Slow | Try cho bulk |
| Quên về context window cost | Bill shock | Monitor |

## Tóm tắt bài 4

- **8 stages**: copy-paste ChatGPT → autocomplete → chat → IDE agent → CLI agent → YOLO → cloud sandbox → multi-agent.
- **Không skip stage** — build muscle memory.
- Khóa dạy stage 4-8 trong 3 tuần.
- **artificialanalysis.ai** so sánh LLM — bookmark.
- Không "best model" — pick theo task: light/medium/hard/bulk.
- Cerebras / Groq cung cấp **10x speed** cho cùng model.
- OpenRouter cho phép **route dynamic** theo task (Phase 3).
- Strengths: Sonnet (coding agent), Opus (hard reasoning), GPT-5.2 (multimodal), Gemini 3 (long context), GLM (open source).

🎉 **Hoàn thành Phase 1 Foundations**. Bạn đã có mental model + thuật ngữ + roadmap. Phase 2 sẽ vào hands-on so sánh tools.

**Bài kế tiếp** → [Phase 2 - Bài 1: Cursor — IDE agent leader](../phase-2-tool-comparison/01-cursor-deep-dive.md)
