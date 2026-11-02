# rea-cline-kit — đưa REA (Reverse Engineer Anything) vào Cline

Bộ kit này lấy mọi thứ có thể tích hợp từ [morluto/rea](https://github.com/morluto/rea)
(MCP server, skill, các guided workflow, quy tắc an toàn và evidence) rồi đóng gói theo đúng
các cơ chế mở rộng của **Cline**: MCP server, Skills, Rules, Workflows (slash command) và Hooks.
Chỉ cần một lệnh cài là Cline dùng được toàn bộ khả năng của REA.

**Mục tiêu chính: Windows + PowerShell + Cline extension trong VS Code** (xem [mục 3](#3-cài-trên-windows-powershell--cline-trong-vs-code--cách-chính)).
Kit vẫn chạy được với Cursor, Windsurf, VSCodium, JetBrains, Cline CLI và trên macOS/Linux.

> Bản REA được ghim: **rea-agents 6.8.0** (229 MCP tools, 6 MCP prompts). Xem `kit/rea-version.json`.

---

## 0. Máy công ty chặn npm? Dùng gói offline

Tải **`rea-cline-offline-win32-x64.zip`** ở trang
[Releases → rea-cline-offline](https://github.com/nguyenhuyhoanganh/claude-learn/releases/tag/rea-cline-offline).
Gói đã có sẵn REA cùng **toàn bộ thư viện** và **Node.js portable**. Giải nén, double-click `install-offline.cmd`, rồi
mở lại VS Code là xong: không cần npm, không cần mạng, không cần quyền admin. Hướng dẫn từng bước ở **[OFFLINE.md](OFFLINE.md)**.

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

## 3. Cài trên Windows (PowerShell + Cline trong VS Code) — cách chính

### 3.1. Yêu cầu

| Thứ cần có | Ghi chú |
|---|---|
| Windows 10/11 x64 | Ghidra của REA trên Windows chỉ hỗ trợ x64 (đang thử nghiệm) |
| **Node.js 22 LTS (≥ 22.23.4) hoặc 24 LTS (≥ 24.22.1)**, kèm npm | Bản cài `.msi` từ nodejs.org là được. Node 23/25 **không** dùng được |
| VS Code + extension **Cline** | Hooks chạy bằng `pwsh` (PowerShell 7) nếu máy có, nếu không thì dùng Windows PowerShell 5.1 có sẵn. Cả hai đều chạy được |
| Không cần Visual Studio Build Tools | Các dependency native của REA (`node-pty`, `frida`) đều có bản prebuilt cho win-x64 |
| (Tuỳ chọn) Ghidra 12.1.x + JDK 21+ 64-bit | Dùng để phân tích binary native (PE). Hopper không có trên Windows. IDA dùng qua IDA MCP |

Kiểm tra nhanh: `node -v` (phải ra `v22.23.4` trở lên, hoặc `v24.22.1` trở lên).

### 3.2. Cài

Cách 1: một dòng, không cần git (tải nhánh `rea` về rồi chạy):

```powershell
irm https://raw.githubusercontent.com/nguyenhuyhoanganh/claude-learn/rea/install.ps1 | iex
```

Muốn truyền tham số thì dùng dạng scriptblock:

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/nguyenhuyhoanganh/claude-learn/rea/install.ps1))) --ghidra "C:\tools\ghidra_12.1.4_PUBLIC" --java-home "C:\Program Files\Java\jdk-21" --provider ghidra
```

Cách 2: từ bản clone:

```powershell
git clone -b rea https://github.com/nguyenhuyhoanganh/claude-learn rea-cline-kit
cd rea-cline-kit
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1              # cài
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 --dry-run    # chỉ xem kế hoạch
```

(`-ExecutionPolicy Bypass` chỉ áp dụng cho lần chạy đó, không thay đổi policy của máy.)

Sau khi cài:
1. **Đóng hẳn rồi mở lại VS Code** (hoặc trong Cline: MCP Servers → `rea` → Restart).
2. Hooks được **bật mặc định**. Nếu trước đây bạn tắt thì bật lại ở Cline Settings → Features → Hooks.
3. Mở tab **Skills** (biểu tượng cái cân dưới ô chat) và kiểm tra có `reverse-engineer-anything`.
4. Kiểm tra toàn bộ: `node "$HOME\.cline\rea\kit\scripts\install.mjs" --doctor`
   (PowerShell **không** mở rộng `~` khi truyền cho `node`, nên dùng `$HOME`).

### 3.3. Các file được ghi ở đâu trên Windows

| Thành phần | Đường dẫn |
|---|---|
| Cấu hình MCP của Cline (VS Code) | `%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json` (Cursor/Windsurf/VSCodium/Insiders có thư mục tương ứng trong `%APPDATA%`) |
| Cấu hình MCP cho Cline CLI / JetBrains | `%USERPROFILE%\.cline\data\settings\cline_mcp_settings.json` |
| REA runtime (rea-agents 6.8.0) | `%USERPROFILE%\.cline\rea\runtime\` |
| Gateway, thư viện hook, script doctor | `%USERPROFILE%\.cline\rea\kit\` |
| Skill | `%USERPROFILE%\.cline\skills\reverse-engineer-anything\` |
| Rule / Workflows / Hooks | `<Documents>\Cline\Rules\`, `<Documents>\Cline\Workflows\`, `<Documents>\Cline\Hooks\*.ps1` |

`<Documents>` là thư mục Documents **thật** của Windows, kể cả khi nó đã được OneDrive chuyển hướng (ví dụ
`C:\Users\you\OneDrive\Documents`). Installer tra cứu giống hệt cách Cline làm, nên hai bên luôn khớp nhau, kể cả với
tên thư mục có dấu.

### 3.4. Những vấn đề riêng của Windows mà kit đã xử lý

| Vấn đề | Kit xử lý thế nào |
|---|---|
| Cline khởi động MCP server với **biến môi trường tối thiểu** (chỉ 12 biến: `PATH`, `APPDATA`, `TEMP`, `USERPROFILE`…). `COMSPEC`, `PATHEXT`, `WINDIR`, `TMP`, `GHIDRA_INSTALL_DIR`, `JAVA_HOME` không được truyền sang REA | Installer chụp các biến đó tại thời điểm cài và ghi vào `env` của server `rea`. Gateway tự bù thêm các biến chuẩn của Windows nếu vẫn còn thiếu. Vì vậy biến bạn đặt bằng `setx` hay trong System Properties sẽ **không** tới được REA, trừ khi bạn chạy lại installer hoặc dùng `--env` / `--ghidra` / `--java-home` |
| `npm.cmd` cần shell (CVE-2024-27980) và hỏng khi đường dẫn có dấu cách | Installer gọi `npm-cli.js` qua chính `node.exe` |
| Lệnh `rea` cài global là shim `rea.cmd`, Cline không spawn trực tiếp được | `--use-path` đăng ký thẳng `node.exe` + `rea.mjs` |
| PowerShell 5.1 đổi encoding khi pipe dữ liệu, làm hỏng chữ có dấu | Wrapper `.ps1` chép nguyên byte stdin ra file tạm. Node trả về JSON chỉ gồm ASCII (`\uXXXX`). File `.ps1` được ghi UTF-8 có BOM + CRLF, nên 5.1 đọc đúng đường dẫn có dấu như `C:\Users\Hoàng` |
| Mỗi lần chạy hook là khởi động một tiến trình PowerShell (khoảng 0,3–1 giây) | PreToolUse/PostToolUse trả lời ngay mà **không** chạy Node nếu tool đó không phải của REA (và không phải `attempt_completion`) |
| Hook lỗi có thể làm kẹt Cline | Mọi lỗi đều trả `{"cancel":false}` và exit 0 |
| Khi update, REA đang chạy khoá file `rea-windows-x64.node` (EPERM/EBUSY) | Thông báo rõ: đóng VS Code rồi chạy lại `--update` |

### 3.5. Phân tích binary native trên Windows (Ghidra)

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 `
  --ghidra "C:\tools\ghidra_12.1.4_PUBLIC" `
  --java-home "C:\Program Files\Java\jdk-21" `
  --provider ghidra --timeout 1800
```

- Theo REA, Ghidra trên Windows hiện **thử nghiệm và chỉ đọc**: PE x86/x64/ARM64 native và raw 6502, cùng 27 thao tác
  inventory/memory/function. Annotation và GUI không dùng được. Hopper không có trên Windows.
- Lần import đầu có thể mất vài phút, nên đặt `--timeout 1800` (tối đa 3600 giây) để Cline không cắt ngang.
- App JS/Electron, .NET, APK signature, Go/Rust/PE imports/certificates… phân tích tĩnh **không cần** Ghidra.
- Nếu doctor báo `windows_native_failure` ở stage `load`, nghĩa là Smart App Control / App Control đang chặn
  `rea-windows-x64.node`. Cài lại không giải quyết được; phải cho phép file đó trong chính sách của máy.

### 3.6. Gỡ rối nhanh trên Windows

| Hiện tượng | Cách xử lý |
|---|---|
| Server `rea` báo đỏ trong Cline | `node "$HOME\.cline\rea\kit\scripts\install.mjs" --doctor` để xem lỗi khởi động thật |
| "Node.js … is not supported" | Cài Node 22.23.4+ hoặc 24.22.1+. Nếu có nhiều bản Node (nvm-windows), chạy installer bằng đúng bản đó |
| Hooks không chạy | Kiểm tra Settings → Features → Hooks; mở Output → Cline. File phải tên đúng `PreToolUse.ps1`… trong `<Documents>\Cline\Hooks` |
| Tool REA bị "timed out" | Chạy lại installer với `--timeout 1800`, rồi restart server |
| `--update` lỗi EPERM | Đóng VS Code (và các cửa sổ PowerShell đang ở trong `.cline\rea`), rồi chạy lại |
| Đổi biến môi trường (Ghidra, Java…) | Chạy lại installer với `--ghidra` / `--java-home` / `--env KEY=VALUE`, hoặc sửa mục `env` trong `cline_mcp_settings.json` |

## 4. Cài trên macOS / Linux

```bash
git clone -b rea https://github.com/nguyenhuyhoanganh/claude-learn rea-cline-kit
cd rea-cline-kit
./install.sh               # hoặc: ./install.sh --dry-run
```

Yêu cầu Node.js như trên. Trên Linux, Ghidra/JADX và phân tích JS cần lệnh `ps` tương thích procps trong PATH.
Kiểm tra: `node ~/.cline/rea/kit/scripts/install.mjs --doctor`.

### Installer làm gì (mọi hệ điều hành)

1. cài `rea-agents@6.8.0` vào `<home>/.cline/rea/runtime` (riêng biệt, không đụng tới bản npm global);
2. chép kit (gateway, thư viện hook, script doctor) vào `<home>/.cline/rea/kit`;
3. thêm server `rea` vào **mọi** `cline_mcp_settings.json` tìm thấy (VS Code, Insiders, VSCodium, Cursor, Windsurf, Trae, Kiro)
   và vào `<home>/.cline/data/settings/cline_mcp_settings.json` (Cline CLI, JetBrains). Các server khác được giữ nguyên,
   file cũ được backup thành `*.rea-kit-backup-<thời gian>`; file JSON hỏng sẽ bị **bỏ qua**, không ghi đè;
4. ghi các biến môi trường cần thiết vào `env` của server (xem 3.4);
5. cài skill, rule, workflows, hooks và ghi lại toàn bộ vào `<home>/.cline/rea/install.json`.

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
Dùng REA phân tích C:/Users/me/AppData/Local/Programs/Notion/resources/app.asar: tính năng copy rich-text
đi từ renderer tới main process như thế nào? Cho tôi xem evidence rồi làm một tính năng tương tự cho project này.
```

Trên Windows nên ghi đường dẫn bằng dấu `/` (`C:/...`); REA chấp nhận dạng này, và model khỏi phải escape `\` trong JSON.

Hoặc dùng workflow (gõ `/` trong ô chat):

| Workflow | Việc làm |
|---|---|
| `/rea-investigate-feature.md feature="..." target_path=/abs/...` | Lần theo một tính năng từ string/symbol tới các hàm liên quan |
| `/rea-compare-versions.md left_target_path=... right_target_path=...` | So sánh hai phiên bản đã phát hành |
| `/rea-trace-crash.md crash_signal="..." target_path=...` | Đối chiếu crash với call/reference tĩnh và process capture |
| `/rea-verify-reconstruction.md reconstruction_goal="..."` | Kiểm tra bản tái tạo so với Evidence |
| `/rea-audit-unknowns.md audit_scope="..."` | Rà soát các unknown còn mở |
| `/rea-process-capture.md behavior_question=... executable=... working_directory=...` | Thiết kế một process capture có giới hạn |
| `/rea-javascript-app.md C:/path/to/app.asar` | Phân tích tĩnh app JS/Electron |
| `/rea-build-environment.md <url|har> <ops> <out>` | Dựng môi trường AgentEnv (RL) từ một web app |
| `/rea-doctor.md` | Chẩn đoán và sửa lỗi cài đặt |
| `/rea-finish.md` | Xuất evidence, `close_binary`, đóng các phiên debug |

Skill `reverse-engineer-anything` được Cline tự kích hoạt khi yêu cầu khớp mô tả, hoặc bạn gọi tay bằng `/reverse-engineer-anything`.

## 8. Hooks làm gì

| Hook | Hành vi |
|---|---|
| `TaskStart`, `UserPromptSubmit` | Nếu yêu cầu trông giống reverse engineering thì nhắc model dùng skill/workflow và cách gọi REA (mỗi task một lần) |
| `PreToolUse` | Nhắc khi model sắp gọi tool REA có thể launch/attach/thay đổi target (Frida, GDB, ADB install…); chặn tool trong `blockTools`; **chặn `attempt_completion` lần đầu** nếu còn target đang mở (lần thứ hai cho qua) |
| `PostToolUse` | Theo dõi `open_binary`/`close_binary`; nhắc rằng nội dung từ target là untrusted (chống prompt injection); gợi ý xử lý `provider_timeout` và timeout của Cline; ghi log `<home>/.cline/rea/logs/rea-calls.jsonl` (chỉ ghi tên tool, thời gian, kết quả, tên tham số) |
| `TaskCancel`, `TaskComplete` | Dọn trạng thái của task |

Các hook hiểu được cả payload của extension (`use_mcp_tool` + `server_name`) lẫn của CLI (`rea__<tool>`), và tự bóc
`rea_call` ở chế độ gateway. Hook luôn trả `{"cancel": false}` khi gặp lỗi nội bộ, nên không bao giờ làm kẹt Cline.
Cấu hình nằm ở `<home>/.cline/rea/hooks-config.json` (Windows: `%USERPROFILE%\.cline\rea\hooks-config.json`):

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

Nếu bạn đã có hook cùng tên (ví dụ `PreToolUse.ps1` riêng của bạn), installer **không ghi đè** mà in ra lệnh để bạn tự
nối logic của REA vào hook đó. Trên Windows, mỗi hook là một file `<TênHook>.ps1`; Cline chạy nó bằng
`pwsh`/`powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File`, nên không cần đổi ExecutionPolicy.

## 9. Cài cho một project (để commit cho cả team)

```powershell
.\install.ps1 --project C:\src\my-repo            # skill → .cline\skills, rule/workflows/hooks → .clinerules\
.\install.ps1 --project C:\src\my-repo --no-mcp   # chỉ các file của project, không đụng MCP
```
(macOS/Linux: `./install.sh --project /path/to/repo`.) Hook `.ps1` chỉ được tạo khi cài trên Windows. Team dùng
lẫn Windows và macOS/Linux thì mỗi hệ điều hành chạy installer một lần để có cả `PreToolUse.ps1` lẫn `PreToolUse`.

MCP server của Cline được cấu hình theo **người dùng**, không theo project, nên mỗi thành viên vẫn phải chạy cài global
một lần. Wrapper của hook dùng đường dẫn tương đối và tự quay về `node` trong PATH nếu đường dẫn node của máy cài không tồn tại.

## 10. Tham số nâng cao

Ví dụ viết cho PowerShell (`.\install.ps1 ...`); trên macOS/Linux thay bằng `./install.sh ...`.

```powershell
.\install.ps1 --ghidra "C:\tools\ghidra_12.1.4_PUBLIC" --java-home "C:\Program Files\Java\jdk-21" --provider ghidra
.\install.ps1 --no-env-snapshot                # không chụp biến môi trường (chỉ dùng --env / --ghidra / --java-home)
.\install.ps1 --targets vscode,cli            # chỉ ghi các host được chọn (auto|all|vscode|vscode-insiders|vscodium|cursor|windsurf|trae|kiro|cli|jetbrains)
.\install.ps1 --rea-version 6.9.0             # chọn phiên bản rea-agents khác
.\install.ps1 --use-path                     # dùng `rea` cài bằng npm install -g (đăng ký node.exe + rea.mjs)
.\install.ps1 --rea-entry C:\tools\rea\scripts\rea.mjs   # dùng một checkout/bản cài có sẵn
.\install.ps1 --timeout 1800                 # timeout MCP của Cline (giây, tối đa 3600; mặc định 450 = thời gian khởi động Ghidra mặc định + dư)
.\install.ps1 --env REA_GHIDRA_STARTUP_TIMEOUT_MS=900000 --env REA_IDA_MCP_CONFIG=C:\tools\ida-mcp.json
.\install.ps1 --env REA_MCP_INPUT_SCHEMA_PROFILE=full --mode full   # schema đầy đủ (lớn hơn nữa)
.\install.ps1 --no-hooks --no-rules          # bỏ bớt thành phần
```

Biến môi trường cho các engine phân tích (truyền bằng `--env`, chúng nằm trong mục `env` của server `rea`). Nhắc lại: biến đặt trong Windows/shell **không** tự tới được REA (xem 3.4). Nếu chúng đã có lúc chạy installer thì sẽ được chụp tự động:

| Engine | Biến |
|---|---|
| Ghidra 12.1.x (+ JDK 21+) | `GHIDRA_INSTALL_DIR=C:\tools\ghidra_12.1.4_PUBLIC`, `JAVA_HOME=...`, `REA_ANALYSIS_PROVIDER=ghidra` (= `--ghidra`, `--java-home`, `--provider`) |
| Hopper (chỉ macOS/Linux) | `HOPPER_LAUNCHER_PATH=/abs/hopper` |
| IDA (qua IDA MCP) | `REA_IDA_MCP_CONFIG=/abs/ida-mcp.json` |
| JADX (Android) | `REA_JADX_MCP_JAR=/abs/jadx-headless-mcp-0.7.1.jar` (cần JDK đầy đủ) |
| Kuna | `REA_KUNA_COMMAND=/abs/kuna` |

`--doctor` chạy `rea doctor --json` để biết engine nào đang thiếu. Các mục `skill:identity` và `registration:*`
trong kết quả đó là REA kiểm tra những client mà **chính `rea setup`** quản lý (Claude Code, Codex…). Với Cline cài bằng
kit này, bạn có thể bỏ qua chúng.

Bảo trì:

```powershell
$kit = "$HOME\.cline\rea\kit\scripts\install.mjs"     # macOS/Linux: kit=~/.cline/rea/kit/scripts/install.mjs
node $kit --doctor                              # kiểm tra đăng ký, khởi động REA đúng như Cline, chạy `rea doctor`
node $kit --update                              # cài lại runtime theo bản đã ghim (Windows: đóng VS Code trước)
node $kit --update --rea-version latest
node $kit --uninstall                           # gỡ phần global (chỉ xoá file có marker của kit)
node $kit --uninstall --purge                   # gỡ luôn runtime .cline\rea
node $kit --uninstall --project C:\src\my-repo
```

## 11. Cài thủ công (không chạy script)

1. `npm install --prefix C:\tools\rea-runtime rea-agents@6.8.0` (macOS/Linux: `~/rea-runtime`)
2. Thêm mục `rea` vào `cline_mcp_settings.json` theo mẫu `kit/mcp/cline_mcp_settings.example.json`
   (hoặc trong Cline: MCP Servers → Configure → *Configure MCP Servers*).
3. Chép `kit/skills/reverse-engineer-anything` → `~/.cline/skills/`, `kit/rules/*.md` → `~/Documents/Cline/Rules/`,
   `kit/workflows/*.md` → `~/Documents/Cline/Workflows/`.
4. Hooks: chép `kit/hooks/rea-hook.mjs` và `kit/hooks/tool-risk.json` vào `<Documents>/Cline/Hooks/rea-cline-kit/`, rồi tạo
   wrapper cho từng hook. Trên Windows là `<TênHook>.ps1`: lưu nội dung stdin ra file tạm, rồi gọi
   `node "<...>\rea-cline-kit\rea-hook.mjs" <TênHook> <file tạm>`. Trên macOS/Linux là file thực thi `<TênHook>` gọi
   `node "$(dirname "$0")/rea-cline-kit/rea-hook.mjs" <TênHook>`. Nên dùng installer, vì nó sinh sẵn các wrapper này.
5. Mục `env` của server phải có `COMSPEC`, `PATHEXT`, `WINDIR`, `TMP` và các biến của provider (xem 3.4).

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
npm test                           # 21 test; test với REA thật chạy khi có .cache hoặc REA_ENTRY
```

Rồi đổi `reaVersion` trong `package.json` nếu muốn ghim bản mới làm mặc định.

## 14. Giới hạn đã biết

- **Chưa chạy trên một máy Windows thật.** Phần Windows được viết theo đúng mã nguồn của Cline extension (cách chạy hook
  `.ps1`, cách tìm thư mục Documents, whitelist biến môi trường của MCP SDK 1.25.1) và được kiểm bằng test tự động:
  nội dung wrapper `.ps1`, regex fast path, bản chụp biến môi trường, chế độ input-file + output ASCII, cách gọi npm.
  Chưa chạy wrapper bằng PowerShell thật. Gateway, installer và hooks đã được chạy thật trên Linux với REA 6.8.0. Lần đầu dùng
  trên Windows, hãy chạy `--doctor`; nếu có lỗi, gửi lại output để sửa.
- Mỗi lần hook chạy trên Windows là khởi động một tiến trình PowerShell (thường 0,3–1 giây, `pwsh` chậm hơn 5.1). Nếu thấy
  chậm, cài với `--no-hooks`; MCP, skill, rule và workflows vẫn hoạt động đầy đủ.
- Hook chỉ thêm ngữ cảnh cho các quyết định **tiếp theo** của model (đặc tính của Cline). Nó không sửa được tham số
  của lời gọi đang diễn ra; việc chặn chỉ áp dụng cho `blockTools` và lần `attempt_completion` đầu tiên.
- Ở chế độ gateway, autoApprove của Cline không phân biệt được từng tool REA (tất cả đi qua `rea_call`). Nếu cần duyệt
  riêng từng tool, dùng `--mode full`, hoặc chặn bằng `blockTools`.
- Chỉ dùng REA trên phần mềm bạn sở hữu hoặc được phép phân tích. Xem [DISCLAIMER của REA](https://github.com/morluto/rea/blob/main/DISCLAIMER.md).

## Giấy phép

Mã của kit: MIT. Skill `reverse-engineer-anything` và gói `rea-agents` thuộc REA (MIT, © morluto), bản license đi kèm
ở `kit/skills/reverse-engineer-anything/LICENSE.rea`.
