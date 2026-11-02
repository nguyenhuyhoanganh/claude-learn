# rea-cline-kit — đưa REA (Reverse Engineer Anything) vào Cline

Bộ kit này lấy mọi thứ có thể tích hợp từ [morluto/rea](https://github.com/morluto/rea)
(MCP server, skill, các guided workflow, quy tắc an toàn và evidence) rồi đóng gói theo đúng
các cơ chế mở rộng của **Cline**: MCP server, Skills, Rules, Workflows (slash command) và Hooks.
Chỉ cần một lệnh cài là Cline (VS Code, Cursor, Windsurf, VSCodium, JetBrains và Cline CLI)
dùng được toàn bộ khả năng của REA.

> Bản REA được ghim: **rea-agents 6.8.0** (229 MCP tools, 6 MCP prompts). Xem `kit/rea-version.json`.

---

## 1. REA là gì (tóm tắt)

REA là một CLI kiêm MCP server dùng để reverse engineer phần mềm đã phát hành (không cần source code):

| Mục tiêu | REA trả về | Cần thêm |
|---|---|---|
| Binary native (Mach-O/PE/ELF…) | pseudocode, assembly, strings, symbols, call graph, xrefs | Hopper / Ghidra / IDA / Kuna |
| App JavaScript / Electron (ASAR) | module graph, imports, IPC, preload, source map, route | Không cần (chỉ Node.js) |
| .NET, Android APK, Flutter, IL2CPP, Go, Rust, WASM, EVM, SQLite, firmware… | metadata, class/method, decompile, chữ ký, layout | Tuỳ loại (JADX, JDK, binwalk…) |
| Website / HAR / pcap | cấu trúc trang, script, network, screenshot | Trình duyệt họ Chrome, tshark… |
| Runtime | Frida, GDB, Rizin, process capture, Electron scenario, ADB | Công cụ tương ứng |
| Môi trường RL | xuất AgentEnv bundle từ bản ghi web app | AgentEnv + Docker để chạy |

Mọi kết quả đều kèm **Evidence** (ID, độ phủ, giới hạn). Việc phân tích chạy hoàn toàn ở máy local.

## 2. Kit tích hợp những gì vào Cline

| Thành phần của REA | Cơ chế trong Cline | Vị trí cài (global) | Ghi chú |
|---|---|---|---|
| MCP server `rea mcp` (229 tools, prompts, completions) | **MCP server** `rea` | `cline_mcp_settings.json` của từng host | Có 2 chế độ: *gateway* (mặc định) và *full* |
| Skill `reverse-engineer-anything` (+7 file references) | **Skill** | `~/.cline/skills/reverse-engineer-anything/` | Bản skill ghim theo đúng phiên bản REA đã cài |
| 6 MCP prompts (investigate_feature, compare_application_versions, verify_reconstruction, trace_crash, audit_residual_unknowns, prepare_bounded_process_capture) | **Workflows** (slash command) | `~/Documents/Cline/Workflows/rea-*.md` | Sinh tự động từ prompt thật của REA |
| Các workflow bổ sung: JS/Electron, RL environment, doctor, kết thúc phiên | **Workflows** | như trên | Viết tay |
| Server instructions + quy tắc evidence/an toàn | **Rule** | `~/Documents/Cline/Rules/rea-reverse-engineering.md` | Ngắn gọn vì luôn được nạp |
| Chính sách: untrusted content, close_binary, timeout, tool gây thay đổi | **Hooks** | `~/Documents/Cline/Hooks/` | PreToolUse, PostToolUse, TaskStart, UserPromptSubmit, TaskCancel, TaskComplete |
| Annotations của tool (destructive / openWorld) | **autoApprove** | trong mục `rea` | Các preset `none` / `safe` / `nondestructive` |

Cả extension (VS Code/JetBrains) lẫn Cline CLI/SDK đều đọc `~/.cline/skills` và `~/Documents/Cline/{Rules,Workflows,Hooks}`,
nên mỗi thứ chỉ cài một chỗ (không bị nạp trùng).

## 3. Yêu cầu

- **Node.js** đúng engines của REA: `^22.23.4 || ^24.22.1 || >=26.12.1`, kèm **npm**.
- Cline (extension VS Code/Cursor/Windsurf/VSCodium, plugin JetBrains, hoặc Cline CLI).
- Để phân tích native: Hopper, Ghidra, IDA hoặc Kuna có sẵn trên máy (REA không tự cài Ghidra/IDA/JADX/Java).
  Trên Linux, Ghidra/JADX và phân tích JS cần lệnh `ps` tương thích procps trong PATH.

## 4. Cài đặt nhanh

```bash
git clone -b rea https://github.com/nguyenhuyhoanganh/claude-learn rea-cline-kit
cd rea-cline-kit
./install.sh                 # macOS / Linux
# Windows (PowerShell):  powershell -ExecutionPolicy Bypass -File .\install.ps1
```

Xem trước mà không ghi gì: `./install.sh --dry-run`.

Installer sẽ:
1. cài `rea-agents@6.8.0` vào `~/.cline/rea/runtime` (riêng biệt, không đụng tới bản npm global);
2. chép kit (gateway, thư viện hook, script doctor) vào `~/.cline/rea/kit`;
3. thêm server `rea` vào **mọi** `cline_mcp_settings.json` tìm thấy (VS Code, Insiders, VSCodium, Cursor, Windsurf, Trae, Kiro)
   và vào `~/.cline/data/settings/cline_mcp_settings.json` (Cline CLI, JetBrains). Các server khác được giữ nguyên,
   file cũ được backup thành `*.rea-kit-backup-<thời gian>`; file JSON hỏng sẽ bị **bỏ qua**, không ghi đè;
4. cài skill, rule, workflows, hooks và ghi lại toàn bộ vào `~/.cline/rea/install.json`.

Sau khi cài:
1. **Khởi động lại Cline** (hoặc MCP Servers → `rea` → Restart).
2. **Bật Hooks**: Cline Settings → Features → *Enable Hooks* (với VS Code/JetBrains).
3. Mở tab **Skills** (biểu tượng cái cân dưới ô chat) và kiểm tra có `reverse-engineer-anything`.
4. Chạy kiểm tra: `node ~/.cline/rea/kit/scripts/install.mjs --doctor`

## 5. Hai chế độ MCP

| Chế độ | Cline thấy gì | Kích thước schema mỗi request* | Khi nào dùng |
|---|---|---|---|
| `gateway` (mặc định) | 2 tool: `rea_find_tools`, `rea_call` | **~7 KB ≈ 2k token** | Hầu hết trường hợp, model context 128k–200k, tiết kiệm chi phí |
| `full` | 229 tool gốc của REA | **~266 KB ≈ 76k token** | Model context rất lớn và bạn muốn Cline thấy schema trực tiếp |

\* Đo trên REA 6.8.0 với input schema profile `compact` (mặc định của REA).

**Gateway** (`kit/mcp/rea-gateway.mjs`, không phụ thuộc thư viện ngoài) chạy `rea mcp` ở tiến trình con, chuyển tiếp mọi
lời gọi tool, prompts, completions, progress, cancel, logging và cả request từ server về client. Danh sách đầy đủ
229 tool (đã phân nhóm) nằm ngay trong mô tả của `rea_call`, nên model luôn biết có những tool nào; khi cần schema
chính xác, model gọi `rea_find_tools {"names": ["open_binary"]}`. Nếu truyền sai tham số, kết quả lỗi trả về kèm luôn
input schema để model sửa ngay.

Đổi chế độ: `./install.sh --mode full` hoặc `./install.sh --mode gateway`.

> REA bản `main` đã có `REA_MCP_TOOL_FAMILIES` để thu gọn danh sách tool cho chế độ full, nhưng **6.8.0 chưa có**.
> Khi REA ra bản có tính năng này, bạn có thể dùng `--mode full --env REA_MCP_TOOL_FAMILIES=session,javascript,application`.

## 6. Auto-approve

| `--approve` | Chế độ full | Chế độ gateway |
|---|---|---|
| `none` | Hỏi duyệt mọi lời gọi | Hỏi duyệt mọi lời gọi |
| `safe` (mặc định) | 140 tool chỉ đọc file local (static + `open_binary`, `analyze_javascript_application`, inspect_*…), **không** gồm tool ghi file, debugger, Frida, ADB, browser | Chỉ `rea_find_tools` (vì `rea_call` đi tới mọi tool) |
| `nondestructive` | Mọi tool không mang `destructiveHint` | Chỉ `rea_find_tools` |

Danh sách cụ thể nằm ở `kit/mcp/autoapprove.json`, còn bảng rủi ro của từng tool ở `kit/mcp/tool-catalog.md`.

## 7. Dùng trong Cline

Bạn có thể hỏi thẳng, ví dụ:

```text
Dùng REA phân tích /Applications/Notion.app: tính năng copy rich-text đi từ renderer tới main process như thế nào?
Cho tôi xem evidence rồi làm một tính năng tương tự cho project này.
```

Hoặc dùng workflow (gõ `/` trong ô chat):

| Workflow | Việc làm |
|---|---|
| `/rea-investigate-feature.md feature="..." target_path=/abs/...` | Lần theo một tính năng từ string/symbol tới các hàm liên quan |
| `/rea-compare-versions.md left_target_path=... right_target_path=...` | So sánh hai phiên bản đã phát hành |
| `/rea-trace-crash.md crash_signal="..." target_path=...` | Đối chiếu crash với call/reference tĩnh và process capture |
| `/rea-verify-reconstruction.md reconstruction_goal="..."` | Kiểm tra bản tái tạo so với Evidence |
| `/rea-audit-unknowns.md audit_scope="..."` | Rà soát các unknown còn mở |
| `/rea-process-capture.md behavior_question=... executable=... working_directory=...` | Thiết kế một process capture có giới hạn |
| `/rea-javascript-app.md /abs/app` | Phân tích tĩnh app JS/Electron |
| `/rea-build-environment.md <url|har> <ops> <out>` | Dựng môi trường AgentEnv (RL) từ một web app |
| `/rea-doctor.md` | Chẩn đoán và sửa lỗi cài đặt |
| `/rea-finish.md` | Xuất evidence, `close_binary`, đóng các phiên debug |

Skill `reverse-engineer-anything` được Cline tự kích hoạt khi yêu cầu khớp mô tả, hoặc bạn gọi tay bằng `/reverse-engineer-anything`.

## 8. Hooks làm gì

| Hook | Hành vi |
|---|---|
| `TaskStart`, `UserPromptSubmit` | Nếu yêu cầu trông giống reverse engineering thì nhắc model dùng skill/workflow và cách gọi REA (mỗi task một lần) |
| `PreToolUse` | Nhắc khi model sắp gọi tool REA có thể launch/attach/thay đổi target (Frida, GDB, ADB install…); chặn tool trong `blockTools`; **chặn `attempt_completion` lần đầu** nếu còn target đang mở (lần thứ hai cho qua) |
| `PostToolUse` | Theo dõi `open_binary`/`close_binary`; nhắc rằng nội dung từ target là untrusted (chống prompt injection); gợi ý xử lý `provider_timeout` và timeout của Cline; ghi log `~/.cline/rea/logs/rea-calls.jsonl` (chỉ ghi tên tool, thời gian, kết quả, tên tham số) |
| `TaskCancel`, `TaskComplete` | Dọn trạng thái của task |

Các hook hiểu được cả payload của extension (`use_mcp_tool` + `server_name`) lẫn của CLI (`rea__<tool>`), và tự bóc
`rea_call` ở chế độ gateway. Hook luôn trả `{"cancel": false}` khi gặp lỗi nội bộ, nên không bao giờ làm kẹt Cline.
Cấu hình nằm ở `~/.cline/rea/hooks-config.json`:

```json
{
  "serverNames": ["rea"],
  "blockTools": ["install_adb_package", "uninstall_adb_package"],
  "warnMutating": true,
  "requireCloseBeforeCompletion": true,
  "routingHints": true,
  "logCalls": true
}
```

Nếu bạn đã có hook cùng tên (ví dụ `PreToolUse` riêng của bạn), installer **không ghi đè** mà in ra lệnh để bạn tự
nối logic của REA vào hook đó.

## 9. Cài cho một project (để commit cho cả team)

```bash
./install.sh --project /path/to/repo            # skill → .cline/skills, rule/workflows/hooks → .clinerules/
./install.sh --project /path/to/repo --no-mcp   # chỉ các file của project, không đụng MCP
```

MCP server của Cline được cấu hình theo **người dùng**, không theo project, nên mỗi thành viên vẫn phải chạy cài global
một lần. Wrapper của hook dùng đường dẫn tương đối và tự quay về `node` trong PATH nếu đường dẫn node của máy cài không tồn tại.

## 10. Tham số nâng cao

```bash
./install.sh --targets vscode,cli            # chỉ ghi các host được chọn (auto|all|vscode|vscode-insiders|vscodium|cursor|windsurf|trae|kiro|cli|jetbrains)
./install.sh --rea-version 6.9.0             # chọn phiên bản rea-agents khác
./install.sh --use-path                      # dùng lệnh `rea` có sẵn trong PATH
./install.sh --rea-entry /abs/rea/scripts/rea.mjs   # dùng một checkout/bản cài có sẵn
./install.sh --timeout 1800                  # timeout MCP của Cline (giây, tối đa 3600; mặc định 450 = thời gian khởi động Ghidra mặc định + dư)
./install.sh --env REA_GHIDRA_STARTUP_TIMEOUT_MS=900000 --env HOPPER_LAUNCHER_PATH=/abs/hopper
./install.sh --env REA_MCP_INPUT_SCHEMA_PROFILE=full --mode full   # schema đầy đủ (lớn hơn nữa)
./install.sh --no-hooks --no-rules           # bỏ bớt thành phần
```

Biến môi trường cho các engine phân tích (truyền bằng `--env`, chúng nằm trong mục `env` của server `rea`):

| Engine | Biến |
|---|---|
| Ghidra 12.1.x | `GHIDRA_INSTALL_DIR=/abs/ghidra_12.1_PUBLIC` |
| Hopper | `HOPPER_LAUNCHER_PATH=/abs/hopper` (hoặc chạy `rea setup` để cài Hopper) |
| IDA (qua IDA MCP) | `REA_IDA_MCP_CONFIG=/abs/ida-mcp.json` |
| JADX (Android) | `REA_JADX_MCP_JAR=/abs/jadx-headless-mcp-0.7.1.jar` (cần JDK đầy đủ) |
| Kuna | `REA_KUNA_COMMAND=/abs/kuna` |

`--doctor` chạy `rea doctor --json` để biết engine nào đang thiếu. Các mục `skill:identity` và `registration:*`
trong kết quả đó là REA kiểm tra những client mà **chính `rea setup`** quản lý (Claude Code, Codex…). Với Cline cài bằng
kit này, bạn có thể bỏ qua chúng.

Bảo trì:

```bash
node ~/.cline/rea/kit/scripts/install.mjs --doctor               # kiểm tra đăng ký, khởi động REA, chạy `rea doctor`
node ~/.cline/rea/kit/scripts/install.mjs --update               # cài lại runtime theo bản đã ghim
node ~/.cline/rea/kit/scripts/install.mjs --update --rea-version latest
node ~/.cline/rea/kit/scripts/install.mjs --uninstall            # gỡ phần global (chỉ xoá file có marker của kit)
node ~/.cline/rea/kit/scripts/install.mjs --uninstall --purge    # gỡ luôn runtime ~/.cline/rea
node ~/.cline/rea/kit/scripts/install.mjs --uninstall --project /path/to/repo
```

## 11. Cài thủ công (không chạy script)

1. `npm install --prefix ~/rea-runtime rea-agents@6.8.0`
2. Thêm mục `rea` vào `cline_mcp_settings.json` theo mẫu `kit/mcp/cline_mcp_settings.example.json`
   (hoặc trong Cline: MCP Servers → Configure → *Configure MCP Servers*).
3. Chép `kit/skills/reverse-engineer-anything` → `~/.cline/skills/`, `kit/rules/*.md` → `~/Documents/Cline/Rules/`,
   `kit/workflows/*.md` → `~/Documents/Cline/Workflows/`.
4. Hooks: chép `kit/hooks/rea-hook.mjs` và `kit/hooks/tool-risk.json` vào `~/Documents/Cline/Hooks/rea-cline-kit/`, rồi tạo
   các file thực thi `PreToolUse`, `PostToolUse`… gọi `node "$(dirname "$0")/rea-cline-kit/rea-hook.mjs" <TênHook>`
   (trên Windows dùng `<TênHook>.ps1`).

## 12. Cấu trúc repo

```
install.sh / install.ps1         # điểm vào cài đặt
scripts/install.mjs              # installer (install/doctor/update/uninstall, dry-run, json)
scripts/build-kit.mjs            # sinh lại phần lấy từ REA (skill, workflows, rủi ro tool, auto-approve, catalog)
scripts/lib/rea-mcp-client.mjs   # client MCP stdio tối giản
kit/mcp/rea-gateway.mjs          # MCP gateway 2 tool cho Cline
kit/mcp/autoapprove.json         # preset auto-approve (sinh tự động)
kit/mcp/tool-catalog.md          # 229 tool theo nhóm và mức rủi ro (sinh tự động)
kit/mcp/cline_mcp_settings.example.json
kit/skills/reverse-engineer-anything/   # skill của REA 6.8.0 (MIT, xem LICENSE.rea)
kit/rules/rea-reverse-engineering.md
kit/workflows/rea-*.md           # 6 file sinh từ MCP prompts + 4 file viết tay
kit/hooks/rea-hook.mjs           # logic hook dùng chung
kit/hooks/tool-risk.json         # tool → static | external | mutating (sinh tự động)
tests/                           # node:test (gateway với server giả và REA thật, hooks, installer)
```

## 13. Phát triển / cập nhật theo REA mới

```bash
npm run build -- --version 6.9.0   # cài rea-agents vào .cache, sinh lại skill/workflows/catalog/auto-approve
npm test                           # 16 test; test với REA thật chạy khi có .cache hoặc REA_ENTRY
```

Rồi đổi `reaVersion` trong `package.json` nếu muốn ghim bản mới làm mặc định.

## 14. Giới hạn đã biết

- Đã kiểm thử trên Linux (Node 22.23.4, REA 6.8.0): gateway với REA thật, installer trong home cô lập, hook với payload
  kiểu VS Code và CLI. Đường dẫn trên macOS/Windows và hook `.ps1` được viết theo mã nguồn của Cline nhưng **chưa chạy thử
  trên máy thật**.
- Hook chỉ thêm ngữ cảnh cho các quyết định **tiếp theo** của model (đặc tính của Cline). Nó không sửa được tham số
  của lời gọi đang diễn ra; việc chặn chỉ áp dụng cho `blockTools` và lần `attempt_completion` đầu tiên.
- Ở chế độ gateway, autoApprove của Cline không phân biệt được từng tool REA (tất cả đi qua `rea_call`). Nếu cần duyệt
  riêng từng tool, dùng `--mode full`, hoặc chặn bằng `blockTools`.
- Chỉ dùng REA trên phần mềm bạn sở hữu hoặc được phép phân tích. Xem [DISCLAIMER của REA](https://github.com/morluto/rea/blob/main/DISCLAIMER.md).

## Giấy phép

Mã của kit: MIT. Skill `reverse-engineer-anything` và gói `rea-agents` thuộc REA (MIT, © morluto), bản license đi kèm
ở `kit/skills/reverse-engineer-anything/LICENSE.rea`.
