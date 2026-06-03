# Bài 2: LLM Coding Fundamentals — Tokens, memory, reasoning, tool use

Trước khi điều khiển coding agent, phải hiểu **bên trong nó là gì**. LLM coding tools không phải "magic"; chúng là **transformer model** + **context window** + **tool use loop**. Hiểu 4 khái niệm: token, context window, reasoning (chain-of-thought), và tool loop — bạn sẽ biết tại sao Claude Code đôi khi "quên" file mở đầu task, tại sao prompt dài bị nhiễu, và làm sao tối ưu workflow.

## LLM là gì?

```text
[Input: text prompt]
        │
        ▼
[Tokenizer]              chia text → tokens (mảnh nhỏ ~4 ký tự)
        │
        ▼
[Transformer model]      tính probability token tiếp theo
        │
        ▼
[Sampling]               chọn token (greedy / temperature)
        │
        ▼
[Output token]
        │
        ▼ (loop)
       [...]              → token tiếp, tiếp, ...
        │
        ▼
[End of message]
```

Mỗi lời gọi LLM = **generate từng token một**, mỗi token phụ thuộc **toàn bộ context trước đó**. Đây là lý do tại sao:
- LLM "stream" output từng chữ.
- Output dài tốn nhiều thời gian + tiền.
- Context dài làm chậm + đắt hơn.

## Token — Đơn vị tính tiền

```text
"Hello, world!" → ["Hello", ",", " world", "!"]
4 tokens

"vibe coding" → ["v", "ibe", " coding"]  hoặc ["vibe", " coding"]
2-3 tokens (tùy tokenizer)

Tiếng Việt thường tốn nhiều token hơn tiếng Anh:
"xin chào các bạn" → 6-8 tokens
"hello everyone"   → 2 tokens
```

Rule of thumb:
- 1 token ≈ 4 ký tự tiếng Anh.
- 1 token ≈ 0.75 từ tiếng Anh.
- Tiếng Việt: ~1.5-2x tokens so với tiếng Anh.

Tool đo: [platform.openai.com/tokenizer](https://platform.openai.com/tokenizer).

## Context Window — Bộ nhớ ngắn hạn của LLM

```text
[Context Window]    ← khoảng 200K tokens cho Claude Sonnet 4.5
┌────────────────────────────────────┐
│  System prompt                     │ ← rules cho LLM
│  Conversation history              │ ← messages trước
│  File contents read                │ ← code đã đọc
│  Tool call results                 │ ← output từ Bash, Grep, ...
│  Current user message              │ ← prompt mới
└────────────────────────────────────┘
        │
        ▼
   LLM "thấy" toàn bộ — sinh response
```

Quan trọng:
- **LLM không có long-term memory** giữa session. Mọi thứ phải nằm trong context window.
- Khi vượt context window → **truncate** (cắt phần đầu) hoặc **summarize** (tóm tắt).
- Tốn tiền: tiền dựa trên tokens input + output.

## Cap context window các model 2026

| Model | Context | Output max | Use case |
|---|---|---|---|
| Claude Sonnet 4.5 | 200K | 64K | Coding chính |
| Claude Opus 4.5 | 200K | 64K | Architecture, complex reasoning |
| GPT-5.2 | 400K | 128K | Long doc analysis |
| Gemini 3 Pro | 2M | 8K | Massive codebase |
| GLM 4.7 (open) | 128K | 32K | Self-host, cheap |
| Codex CLI | 200K | 16K | OpenAI coding agent |

→ Context lớn ≠ tốt nhất. Quality của LLM ở 90% context đầy thường giảm. Quy luật **"lost in the middle"**: LLM nhớ phần đầu + phần cuối, miss phần giữa.

## Reasoning — Chain-of-thought (CoT)

```text
[Old LLM 2023]
Q: "Tính 17 * 23"
A: 391

[Reasoning LLM 2025+]
Q: "Tính 17 * 23"
[Internal reasoning]
  17 * 20 = 340
  17 * 3  = 51
  340 + 51 = 391
A: 391
```

Reasoning models (Sonnet 4.5 với extended thinking, OpenAI o1/o3, Gemini 3 Deep Think) **suy nghĩ trong head** trước khi trả lời. Output ngắn nhưng quality cao.

Trade-off:
- ✓ Accuracy cao hơn (math, logic, coding hard problems).
- ✗ Latency cao (10-60s per response).
- ✗ Tốn tiền hơn (tính cả reasoning tokens).

Khi nào dùng reasoning mode:
- Architecture decision.
- Bug khó (race condition, memory leak).
- Algorithm khó (DP, graph).
- KHÔNG dùng cho: rename variable, sửa typo, format code.

## Agent = LLM + Tools + Loop

Đây là định nghĩa **chính xác** của "AI agent" theo industry 2025:

```text
[Agent]
LLM call → tool call → tool result → LLM call → tool call → ...
                                                              ↓
                                                          [Done]
```

3 thành phần:
1. **LLM** — brain, quyết định.
2. **Tools** — hand, thực hiện action (Read, Write, Bash, Grep, ...).
3. **Loop** — luồng lặp tới khi đạt mục tiêu.

Cụ thể cho coding agent:
```text
User: "Sửa bug trong file auth.go gây 401 lỗi"

Agent loop:
1. LLM: "Tôi cần đọc file auth.go"
   → Tool: Read("/src/auth.go")
   ← Result: <content>
2. LLM: "Hiểu rồi. Tôi cần xem nơi gọi auth function"
   → Tool: Grep("AuthenticateUser", "/src")
   ← Result: handler.go:42, middleware.go:18
3. LLM: "Đọc handler.go"
   → Tool: Read("/src/handler.go")
   ← Result: <content>
4. LLM: "À, sai logic check expiry. Sửa nó"
   → Tool: Edit("/src/auth.go", old="if t.Before(now)", new="if now.After(t)")
   ← Result: ok
5. LLM: "Chạy test verify"
   → Tool: Bash("go test ./auth/...")
   ← Result: PASS
6. LLM: "Done. Tôi sửa logic timezone trong auth.go..."
   [end loop]
```

→ Đây là điều **Claude Code, Cursor agent, Codex CLI** đang làm. Không magic.

## Tools chuẩn của coding agent

```text
[Read tools]
- Read       : đọc file
- Glob       : tìm file theo pattern
- Grep       : search nội dung
- LS         : list directory

[Write tools]
- Write      : tạo / overwrite file
- Edit       : replace exact string
- NotebookEdit : Jupyter notebook

[Execute tools]
- Bash       : chạy shell command
- IDE        : run code in IDE context

[Web tools]
- WebFetch   : tải URL
- WebSearch  : search web

[Meta tools]
- Task       : spawn sub-agent
- Plan       : create plan mode
```

Mọi tool quay về 1 nguyên tắc: **LLM call function → function trả result → LLM thấy result**.

## Tool use trong API — Thực ra trông như nào?

Anthropic Claude API:
```json
{
  "model": "claude-sonnet-4-5",
  "messages": [
    {"role": "user", "content": "Đọc file foo.txt và đếm dòng"}
  ],
  "tools": [
    {
      "name": "Read",
      "description": "Read file content",
      "input_schema": {
        "type": "object",
        "properties": {"path": {"type": "string"}},
        "required": ["path"]
      }
    }
  ]
}
```

Response từ LLM:
```json
{
  "stop_reason": "tool_use",
  "content": [
    {"type": "text", "text": "Tôi sẽ đọc foo.txt"},
    {
      "type": "tool_use",
      "id": "toolu_xxx",
      "name": "Read",
      "input": {"path": "foo.txt"}
    }
  ]
}
```

App phải:
1. Execute tool `Read("foo.txt")` → result `"line1\nline2\nline3"`.
2. Gửi lại API:
```json
{
  "messages": [
    ...,
    {"role": "assistant", "content": [...]},
    {
      "role": "user",
      "content": [
        {"type": "tool_result", "tool_use_id": "toolu_xxx", "content": "line1\nline2\nline3"}
      ]
    }
  ]
}
```
3. LLM nhận result, sinh response cuối: "File có 3 dòng".

→ Đây chính là **agent loop**. Claude Code, Cursor, Codex tự động hóa loop này, ẩn từ user.

## Memory — Stateless giữa request

Mỗi API call **độc lập**. LLM **không nhớ** previous call. Để tạo "conversation":
- App gửi **toàn bộ history** mỗi call.
- Memory = list of messages.

Hệ quả:
- Mỗi turn longer hơn (history nhân lên).
- Tokens tăng dần → tốn tiền dần.
- Đến limit context → phải truncate / summarize.

Đây là lý do Claude Code có `/clear`, `/compact` để reset hoặc compress conversation.

## Hallucination — Vẫn còn

Hallucination = LLM "bịa" function không tồn tại, prop sai, syntax sai.

Cách giảm:
- **Cung cấp doc chính xác** trong context (Context7 MCP server làm điều này).
- **Force LLM đọc file trước khi sửa** (Claude Code default).
- **Test sau mỗi change** (LLM thấy test fail → tự fix).
- **Reasoning mode cho code phức tạp**.

Không thể loại bỏ 100%. Phase 2-3 sẽ dạy workflow giảm bug.

## Bẫy thường gặp khi nói chuyện với LLM

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Prompt mơ hồ ("làm cho nó tốt hơn") | Output không như ý | Spec rõ: input, output, ràng buộc |
| Context quá dài (10 file) | LLM miss giữa | Đọc selective, dùng grep |
| Mong LLM nhớ session trước | Stateless | Restate context |
| Trust output không verify | Bug production | Test + review |
| Dùng cheap model cho task khó | Hallucination | Dùng Opus/o3 cho hard task |
| Bỏ qua reasoning mode khi cần | Output sai logic | Bật extended thinking |
| Không thấy tool call cost | Bill tăng | Log token use |
| Ngắt agent giữa loop | State inconsistent | Để loop hoàn thành |

## Tóm tắt bài 2

- LLM = transformer sinh **từng token một**, mỗi token phụ thuộc full context.
- **Token**: ~4 ký tự tiếng Anh, tiếng Việt tốn 1.5-2x.
- **Context window**: 200K (Claude), 400K (GPT-5), 2M (Gemini 3) — nhưng **"lost in the middle"** vẫn áp dụng.
- **Reasoning**: chain-of-thought trước trả lời, accurate hơn nhưng chậm + tốn.
- **Agent = LLM + Tools + Loop**. Mỗi loop: LLM call → tool exec → result → LLM call.
- Tools chuẩn: Read, Write, Edit, Bash, Grep, Glob, WebFetch, WebSearch, Task.
- LLM **stateless** — app gửi history mỗi call → tốn tiền dần.
- Hallucination giảm bằng: doc chính xác, force read, test loop, reasoning.

**Bài kế tiếp** → [Bài 3: Context Engineering — System prompt, agents.md, context window strategy](03-context-engineering.md)
