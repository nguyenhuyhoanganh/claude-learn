# Bài 1: Vibe Coding Revolution — Từ "viết code" sang "trò chuyện với AI"

Andrej Karpathy đăng tweet vào tháng 2/2025 với cụm từ mà sau này định nghĩa cả một làn sóng: **"vibe coding — fully give in to the vibes, embrace the exponentials, and forget that code even exists"**. Ý ông là: không nhìn code nữa, chỉ mô tả ý muốn, để LLM sinh code, chạy thử, lặp lại. Một năm sau, các tool như Cursor, Claude Code, GitHub Copilot đã biến mơ ước này thành workflow thật, và chính cách developer làm việc thay đổi vĩnh viễn. Bài này dạy về context lịch sử, ba thuật ngữ dễ nhầm (vibe coder, vibe engineer, agentic coder), và roadmap của khóa học.

## Hành trình cảm xúc 2024-2025

```text
[Surprise]    Wow, LLM viết code được!
    ↓
[Denial]      Đó chỉ là toy code, không production
    ↓
[Astonishment]Nó build cả app full-stack?!
    ↓
[Frustration] Sao nó cứ lặp lại lỗi cũ?
    ↓
[Anger]       Yêu cầu nó viết "performance report" về chính nó!
    ↓
[Acceptance]  OK, nó mạnh ở X, yếu ở Y — workflow ra đời
    ↓
[Inflection]  Claude Sonnet 4.5 / Opus 4.5 / Gemini 3 / GPT-5.2
              → đột phá → ít frustration hơn nhiều
```

Cuối 2025: **inflection point** xảy ra. Sonnet 4.5 + Opus 4.5 + Gemini 3 + GPT-5.2 đẩy agent lên tầm khác. Tháng 12/2025 → 1/2026 = wave mới của progress agentic coding.

## Ba thuật ngữ — Khác biệt quan trọng

### Vibe Coder (Andrej Karpathy)
> Người dùng LLM để code mà không cần hiểu chi tiết. Cho LLM build, nếu hỏng thì throw away + làm lại. Tinh thần amateur, không cần chuyên môn.

### Vibe Engineer (Simon Willison)
> Professional dùng AI agent để build software thật. Hiểu code, review code, biết khi nào tin AI, khi nào không. Đây là góc nhìn "kỹ sư phần mềm dùng AI" — bài bản hơn.

### Agentic Coder
> Expert dùng nhiều agent cùng lúc như "đồng đội ảo". Ví dụ: Cursor agent sửa frontend, Claude Code agent viết backend, third agent review PR — orchestration.

**Cảnh báo về thuật ngữ**: "agentic coder" cũng có thể nghĩa là **"người viết AI agent"** (build platform agentic). Khi nghe ai đó nói "agentic coder" → **hỏi lại** xem họ đang nói nghĩa nào.

Trong khóa này, **agentic coder = bạn**, người dùng agent để code.

## "Coding agents" — Platforms ta sẽ dùng

```text
[Surface 1: IDE — Integrated Development Environment]
- Có cửa sổ, menu, panel
- Examples: Cursor, OpenAI Codex (IDE), Antigravity (Google), Windsurf

[Surface 2: Plugin / Extension]
- Bolt-on vào IDE phổ biến (VS Code)
- Examples: GitHub Copilot, Cursor extension cho VS Code

[Surface 3: CLI — Command Line Interface]
- Terminal-based, retro vibe nhưng cực mạnh
- Examples: Claude Code (pioneer), Cursor CLI, Codex CLI,
            Gemini CLI, OpenCode, AMP
```

Sự thật thú vị: **CLI surface** ban đầu là "side project" của Anthropic — Claude Code. Không ai nghĩ developer 2025 thích terminal. Nhưng nó **bùng nổ**: bypass UI render, agent chạy nhanh, output stream, dễ tích hợp tool. Mọi vendor giờ đều copy: Cursor CLI, Codex CLI, Gemini CLI ra đời sau.

## Bảng so sánh nhanh

| Surface | Tool đại diện | Mạnh nhất ở | Yếu ở |
|---|---|---|---|
| IDE | Cursor | UI/UX, tab autocomplete, diff view | Setup nặng, RAM cao |
| Plugin | GitHub Copilot (VS Code) | Đã có sẵn VS Code | Less agent autonomy |
| CLI | Claude Code | Agent loop, tool use, scripting | Không có visual diff (UI) |

## "Tsunami of information" — Cách lọc

Field này thay đổi **hằng tuần**. Twitter, LinkedIn, Reddit, Discord ngập tin mới. Skill quan trọng nhất:

```text
✓ Distinguish: real breakthrough vs hype tuần này
✓ Focus: tool có production traction (Claude Code, Cursor, Copilot, Codex)
✗ Đừng chạy theo mọi vendor mới ra
✗ Đừng đánh giá tool sau 1 tweet
```

Quy tắc: thử tool **1 tuần** với task thật, sau đó mới đánh giá. Demo viral không phản ánh daily workflow.

## Roadmap 3 tuần của khóa

```text
[Week 1: Vibe Coding for fun and profit]
Day 1-2  Foundations: LLM cơ bản, context engineering, agents.md
Day 3    Hands-on: Cursor vs Copilot vs Codex vs Antigravity (build Kanban)
Day 4    YOLO mode + OpenRouter setup + 5 principles
Day 5    Full-stack Kanban app với Docker + Copilot

[Week 2: Vibe Engineering as a professional]
Day 1    Claude Code install + OpenCode/AMP alternatives
Day 2    Commands, sessions, checkpoints, Ralph loops
Day 3    MCP + Skills + Plugins — "Big Three" của Claude Code
Day 4    Jira/GitHub MCP workflow — issue → PR autonomy
Day 5    Build SaaS thật (AI Legal Doc Generator) với Cerebras

[Week 3: Vibe Engineering as an expert]
Day 1    Sub-agents, hooks, custom slash commands, plugins, marketplaces
Day 2    Cloud sandboxes (Sprites.dev), remote/mobile execution
Day 3    Large codebases, Claude Agent SDK, Telegram/WhatsApp bot
Day 4    Multi-agent teams: GSD (Spec-Driven) vs Agent Teams
Day 5    Gastown swarm orchestration, course wrap-up
```

→ Tiến từ "vibes" (amateur fun) → "engineering" (professional) → "expert" (orchestration). 3 levels.

## Hai project chính bạn sẽ build

### Project 1 (Week 1): Kanban Board App
- Frontend + backend + DB + Docker.
- Build **4 lần** với 4 tool khác nhau (Cursor, Copilot, Codex, Antigravity) → so sánh.
- Cuối tuần: tích hợp **AI Digital Twin chat** với OpenRouter (sản phẩm thật).

### Project 2 (Week 2): AI Legal Doc Generator SaaS
- FastAPI backend + Next.js frontend + Cerebras inference.
- Jira-driven dev: tạo ticket → Claude Code build từ ticket → PR.

### Project 3 (Week 3): Trading Platform
- Multi-agent build: agent UI, agent backend, agent data.
- 3 phương pháp: GSD (Spec-Driven), Claude Agent Teams, Gastown swarm.
- Live market data, parallel build, 5+ giờ work crammed thành 1 hour.

## Tại sao **bây giờ** là thời điểm vàng

```text
[Late 2024]
- Cursor IDE bùng nổ
- GitHub Copilot mainstream
- Trải nghiệm "agent" còn vụng

[2025]
- Claude Code ra mắt (Feb 2025)
- Vibe coding term hot
- Frustration period
- Mọi vendor đuổi theo

[Late 2025 / Early 2026 — NOW]
- Sonnet/Opus 4.5, Gemini 3, GPT-5.2 đột phá
- Agent loop ổn định
- Multi-agent orchestration khả thi
- Sandbox cloud (Sprites.dev) mainstream
- MCP standard cho tool integration
- SaaS built bằng prompt engineering hoàn toàn

→ Skill khoảng cách giữa "biết Cursor" và "biết orchestrate agent" 
  = khoảng cách lương 2-3x trong 12 tháng tới.
```

## Bẫy người mới khi vào field này

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| "Bỏ qua code review" | Bug âm thầm, security issue | Review diff trước commit |
| "Tin AI tuyệt đối" | Hallucination thành production | Test + verify mỗi feature |
| "Tool nào hot dùng tool đó" | Tốn thời gian học X tool | Focus 1-2 tool core |
| Sai tên thuật ngữ (vibe ≠ agentic) | Confused team | Hỏi lại nếu chưa rõ |
| "AI thay thế code skill" | Tụt skill base | Vẫn học fundamentals |
| Skip Week 1 nhảy Week 3 | Không hiểu nền | Theo thứ tự |

## Yêu cầu để bắt đầu

```text
[Phần cứng / phần mềm]
✓ Macbook / Windows / Linux đều OK
✓ VS Code cài sẵn
✓ Node.js + Python (cho project)
✓ Docker Desktop (Week 1 Day 5+)
✓ Git + GitHub account

[Tài khoản]
✓ Anthropic API key (Claude Code) — có credit free khi đăng ký
✓ OpenAI API key hoặc OpenRouter ($10 đủ Week 1)
✓ GitHub Copilot subscription (optional, hoặc free trial)
✓ Cursor account (free tier OK)

[Mindset]
✓ Chấp nhận tốc độ thay đổi cao
✓ Hỏi khi unclear (Q&A của khóa)
✓ Build project cùng instructor, đừng chỉ xem
✓ Focus value, không noise
```

## Tóm tắt bài 1

- **Vibe coding** (Karpathy, 2/2025): mô tả ý muốn, để LLM sinh, không nhìn code.
- 3 thuật ngữ phân biệt: **vibe coder** (amateur), **vibe engineer** (professional), **agentic coder** (expert).
- **Cảnh báo**: "agentic coder" cũng có thể chỉ người **build** AI agent — luôn confirm nghĩa.
- 3 surface: **IDE** (Cursor, Codex), **Plugin** (Copilot), **CLI** (Claude Code).
- Inflection late 2025: Sonnet/Opus 4.5, Gemini 3, GPT-5.2 → agent ổn hơn.
- Khóa 3 tuần: Foundations → Professional → Expert (orchestration).
- 3 project: Kanban (4 tool), Legal Doc SaaS, Trading Platform multi-agent.
- Skill quan trọng nhất: **lọc tín hiệu khỏi nhiễu**, focus production-traction tool.

**Bài kế tiếp** → [Bài 2: LLM Coding Fundamentals — Tokens, memory, reasoning, tool use](02-llm-coding-fundamentals.md)
