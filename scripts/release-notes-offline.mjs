#!/usr/bin/env node
// Write release notes for an offline bundle: node scripts/release-notes-offline.mjs <bundle dir> <zip file> <out.md>
import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const [bundleDir, zip, outFile] = process.argv.slice(2);
const m = JSON.parse(readFileSync(join(bundleDir, "bundle-manifest.json"), "utf8"));
const sha = createHash("sha256").update(readFileSync(zip)).digest("hex");
const mib = (statSync(zip).size / 1048576).toFixed(1);
const commit = process.env.GITHUB_SHA ? process.env.GITHUB_SHA.slice(0, 12) : "local";
const run = process.env.GITHUB_SERVER_URL && process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null;
const z = basename(zip);

writeFileSync(outFile, `Gói **offline** của rea-cline-kit cho **Windows x64**: kit + REA (rea-agents ${m.rea}) đã cài sẵn đầy đủ thư viện${m.node ? ` + Node.js ${m.node} portable` : ""}. Không cần npm, không cần mạng.

| | |
|---|---|
| File | \`${z}\` (${mib} MiB) |
| SHA-256 | \`${sha}\` |
| REA | rea-agents ${m.rea} (${m.install}, build trên ${m.builtOn}) |
| Node.js đi kèm | ${m.node ?? "không có (máy đích cần Node 22.23.4+ / 24.22.1+)"} |
| Commit | \`${commit}\`${run ? ` · [workflow run](${run})` : ""} |

Thành phần đã kiểm tra trong gói:
${m.checks.map((c) => `- ${c.ok ? "✅" : c.required ? "❌" : "➖"} ${c.label}`).join("\n")}

## Cài đặt (máy công ty chặn npm)

1. Tải \`${z}\` (và \`${z}.sha256\` nếu muốn kiểm tra). Kiểm tra:
   \`(Get-FileHash .\\${z} -Algorithm SHA256).Hash\` phải bằng \`${sha.toUpperCase()}\`.
2. Giải nén **toàn bộ** zip (chuột phải → Extract All), ví dụ vào \`C:\\Temp\\\`.
3. Mở thư mục \`rea-cline-offline-win32-x64\` và double-click \`install-offline.cmd\`
   (hoặc PowerShell: \`powershell -NoProfile -ExecutionPolicy Bypass -File .\\install-offline.ps1\`).
4. Đóng hẳn rồi mở lại VS Code. Trong Cline → MCP Servers phải thấy \`rea\` (2 tool: \`rea_find_tools\`, \`rea_call\`).
5. Kiểm tra: \`& "$HOME\\.cline\\rea\\node\\node.exe" "$HOME\\.cline\\rea\\kit\\scripts\\install.mjs" --doctor\`

Sau khi cài có thể xoá thư mục đã giải nén: mọi thứ đã được chép vào \`%USERPROFILE%\\.cline\\rea\\\`.
Chi tiết: \`OFFLINE.md\` trong gói.

Workflow build gói này trên runner Windows, rồi chạy kiểm thử thật: hook \`.ps1\` với Windows PowerShell 5.1 và PowerShell 7, cài offline khi PATH không có node/npm và registry npm không truy cập được, khởi động server với môi trường giống Cline, gọi REA thật, rồi doctor và gỡ cài đặt.
`);
console.log(`notes -> ${outFile} (sha256 ${sha})`);
