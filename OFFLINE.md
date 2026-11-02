# Cài REA cho Cline trên máy bị chặn npm (Windows, offline)

Gói offline `rea-cline-offline-win32-x64.zip` đã chứa **mọi thứ**:

| Trong gói | Ghi chú |
|---|---|
| `runtime\node_modules\` | REA (rea-agents 6.8.0) cùng **toàn bộ** thư viện đã cài sẵn cho Windows x64, gồm cả binary native (`node-pty`, addon Windows của REA, binding Frida) |
| `node\node.exe` | Node.js 22 portable. Máy công ty **không cần** cài Node, và nếu đã có Node bản cũ thì cũng không bị ảnh hưởng |
| `kit\`, `scripts\` | Gateway MCP, skill, rule, workflows, hooks và installer |
| `install-offline.cmd` / `install-offline.ps1` | Cài, **không bao giờ gọi npm hay mạng** |

Cline vẫn cần có sẵn trong VS Code (extension `saoudrizwan.claude-dev`). Nếu công ty chặn cả Marketplace, tải file
`.vsix` của Cline ở máy khác rồi cài bằng VS Code → Extensions → `...` → *Install from VSIX...*.

---

## Bước 1. Lấy gói (ở máy có mạng, ví dụ máy nhà)

Tải hai file ở trang Releases của repo:

- https://github.com/nguyenhuyhoanganh/claude-learn/releases/download/rea-cline-offline/rea-cline-offline-win32-x64.zip
- https://github.com/nguyenhuyhoanganh/claude-learn/releases/download/rea-cline-offline/rea-cline-offline-win32-x64.zip.sha256

Mang file zip sang máy công ty (USB, ổ mạng, OneDrive…). Gói được build và kiểm thử tự động trên Windows bằng
GitHub Actions (workflow `windows-offline-bundle`).

Không tải được Releases? Xem [Tự build gói](#tự-build-gói) ở cuối trang.

## Bước 2. Kiểm tra file (khuyến nghị)

```powershell
(Get-FileHash .\rea-cline-offline-win32-x64.zip -Algorithm SHA256).Hash
Get-Content .\rea-cline-offline-win32-x64.zip.sha256
```

Hai giá trị phải trùng nhau (không phân biệt hoa thường).

## Bước 3. Giải nén

Chuột phải file zip → **Extract All...**, chọn ví dụ `C:\Temp\`. Phải giải nén **toàn bộ**, không chạy thẳng
từ bên trong file zip. Bạn sẽ có thư mục `C:\Temp\rea-cline-offline-win32-x64\`.

## Bước 4. Cài

Cách đơn giản: mở thư mục vừa giải nén và **double-click `install-offline.cmd`**.

Hoặc dùng PowerShell:

```powershell
cd C:\Temp\rea-cline-offline-win32-x64
powershell -NoProfile -ExecutionPolicy Bypass -File .\install-offline.ps1 --dry-run   # xem trước, không ghi gì
powershell -NoProfile -ExecutionPolicy Bypass -File .\install-offline.ps1             # cài
```

- `-ExecutionPolicy Bypass` chỉ áp dụng cho lần chạy này, không đổi chính sách của máy và không cần quyền admin.
- Toàn bộ được cài vào hồ sơ người dùng hiện tại (`%USERPROFILE%`), **không cần admin**.
- Muốn dùng Ghidra để phân tích file `.exe`/`.dll` (Ghidra và JDK phải có sẵn trên máy):

  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File .\install-offline.ps1 `
    --ghidra "C:\tools\ghidra_12.1.4_PUBLIC" --java-home "C:\Program Files\Java\jdk-21" --provider ghidra --timeout 1800
  ```

- Các tham số khác của `scripts\install.mjs` đều dùng được: `--mode full`, `--approve none`, `--no-hooks`, `--targets vscode`, `--env KEY=VALUE`…

Installer sẽ:

| Việc | Đích |
|---|---|
| Chép Node.js portable | `%USERPROFILE%\.cline\rea\node\node.exe` |
| Chép REA runtime (không gọi npm) | `%USERPROFILE%\.cline\rea\runtime\` |
| Chép kit (gateway, script doctor) | `%USERPROFILE%\.cline\rea\kit\` |
| Đăng ký MCP server `rea` (giữ nguyên server khác, có backup) | `%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json` (+ Cursor/Windsurf/... nếu có, + `%USERPROFILE%\.cline\data\settings\`) |
| Skill `reverse-engineer-anything` | `%USERPROFILE%\.cline\skills\` |
| Rule, workflows, hooks `.ps1` | `<Documents>\Cline\Rules\`, `<Documents>\Cline\Workflows\`, `<Documents>\Cline\Hooks\` |

Xong có thể xoá `C:\Temp\rea-cline-offline-win32-x64`, vì mọi thứ đã nằm trong `%USERPROFILE%\.cline\rea\`.

## Bước 5. Cho Cline dùng

1. **Đóng hẳn VS Code rồi mở lại** (hoặc trong Cline: biểu tượng MCP Servers → `rea` → Restart).
2. Cline → **MCP Servers → Installed**: `rea` phải có chấm xanh, với 2 tool `rea_find_tools` và `rea_call`
   (chế độ gateway, giúp tiết kiệm context; `rea_call` gọi được cả 229 tool của REA).
3. Tab **Skills** (biểu tượng cái cân dưới ô chat) phải có `reverse-engineer-anything` và đang bật.
4. Gõ `/` trong ô chat để thấy các workflow `rea-*.md`.
5. Hooks được bật mặc định (Cline Settings → Features → Hooks).

Thử ngay:

```text
/rea-javascript-app.md C:/Users/<bạn>/AppData/Local/Programs/<App>/resources/app.asar  tính năng X hoạt động thế nào?
```

hoặc hỏi tự nhiên: "Dùng REA phân tích `C:/path/to/app.exe`, hàm xử lý license nằm ở đâu?".

## Bước 6. Kiểm tra khi có lỗi

```powershell
& "$HOME\.cline\rea\node\node.exe" "$HOME\.cline\rea\kit\scripts\install.mjs" --doctor
```

Lệnh này khởi động REA giống hệt cách Cline làm, liệt kê tool và chạy `rea doctor`. Một số dòng là bình thường, không
phải lỗi: `skill:identity`, `registration:*` (REA kiểm tra các client mà `rea setup` của nó quản lý), và `hopper`
(không có trên Windows).

| Hiện tượng | Cách xử lý |
|---|---|
| `rea` đỏ trong MCP Servers | Chạy `--doctor` ở trên. Xem Output → Cline trong VS Code |
| Tool REA bị "timed out" | Cài lại với `--timeout 1800` (tối đa 3600), rồi restart server |
| Ghidra "not available" | Cài lại với `--ghidra` và `--java-home`. Biến đặt bằng `setx` **không** tới được REA, vì Cline chỉ truyền một số biến môi trường tối thiểu |
| `windows_native_failure` stage `load` | Smart App Control / App Control đang chặn `rea-windows-x64.node`. Cần IT cho phép file đó |
| Cài lại / cập nhật báo EPERM, EBUSY | Đóng VS Code (REA đang chạy sẽ khoá `node.exe` và file `.node`), rồi chạy lại `install-offline.cmd` |
| Antivirus xoá hoặc chặn file trong `.cline\rea` | Nhờ IT whitelist thư mục `%USERPROFILE%\.cline\rea\` |

## Cập nhật lên gói mới

Tải zip mới → giải nén → đóng VS Code → chạy `install-offline.cmd` của gói mới. Installer tự thay runtime/Node nếu
khác phiên bản, các cấu hình bạn đã chỉnh (timeout lớn hơn, `env`, trạng thái disabled) được giữ lại.

## Gỡ cài đặt

```powershell
& "$HOME\.cline\rea\node\node.exe" "$HOME\.cline\rea\kit\scripts\install.mjs" --uninstall --purge
```

(Đóng VS Code trước.) Lệnh này xoá server `rea` khỏi cấu hình Cline (có backup), xoá skill, rule, workflows, hooks và
cả thư mục `%USERPROFILE%\.cline\rea\`. Chỉ file có dấu `rea-cline-kit` mới bị xoá.

---

## Tự build gói

Ở một máy Windows x64 có mạng, Node.js 22.23.4+ (hoặc 24.22.1+) và git:

```powershell
git clone -b rea https://github.com/nguyenhuyhoanganh/claude-learn rea-cline-kit
cd rea-cline-kit
node scripts\build-offline.mjs --target win32-x64 --out dist --with-node
Compress-Archive -Path dist\rea-cline-offline-win32-x64 -DestinationPath dist\rea-cline-offline-win32-x64.zip
```

`--with-node` chép chính `node.exe` đang chạy vào gói. Build ngay trên Windows là cách tốt nhất, vì npm chạy install
script native nên có cả binding Frida.

Từ Linux/macOS cũng build được gói Windows (`node scripts/build-offline.mjs --target win32-x64`), nhưng gói đó
**không có** Node.js đi kèm và **không có** binding Frida (chỉ các tool Frida bị ảnh hưởng). Máy đích khi đó phải có
sẵn Node 22.23.4+.

Gói cho macOS/Linux: `--target darwin-arm64|darwin-x64|linux-x64` (chạy trên đúng nền tảng đó nếu muốn kèm
`--with-node`). Cài bằng `./install-offline.sh`.
