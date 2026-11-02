// Windows only: run the generated <Hook>.ps1 wrappers exactly the way the Cline VS Code extension does
// (HookProcess.ts: <pwsh|powershell> -NoProfile -NonInteractive -ExecutionPolicy Bypass -File <hook>, JSON on stdin),
// with both Windows PowerShell 5.1 and PowerShell 7 when present.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { hookFileContent } from "../../scripts/install.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const isWin = process.platform === "win32";
const HOOKS = ["PreToolUse", "PostToolUse", "TaskStart", "UserPromptSubmit", "TaskCancel", "TaskComplete"];

function findShell(name) {
  if (!isWin) return null;
  const r = spawnSync("where", [name], { encoding: "utf8", windowsHide: true });
  return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : null;
}
const shells = [["Windows PowerShell 5.1", findShell("powershell.exe")], ["PowerShell 7", findShell("pwsh.exe")]];

function setup(nodePathInWrapper) {
  const dir = mkdtempSync(join(tmpdir(), "rea-ps-hooks-"));
  const lib = join(dir, "rea-cline-kit");
  mkdirSync(lib);
  copyFileSync(join(ROOT, "kit", "hooks", "rea-hook.mjs"), join(lib, "rea-hook.mjs"));
  copyFileSync(join(ROOT, "kit", "hooks", "tool-risk.json"), join(lib, "tool-risk.json"));
  for (const h of HOOKS) writeFileSync(join(dir, `${h}.ps1`), hookFileContent(h, nodePathInWrapper, "win32"));
  const home = mkdtempSync(join(tmpdir(), "rea-ps-home-"));
  return { dir, home };
}

function runHook(shell, dir, home, hook, payload) {
  const t0 = Date.now();
  const r = spawnSync(shell, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", join(dir, `${hook}.ps1`)], {
    input: typeof payload === "string" ? payload : JSON.stringify(payload),
    env: { ...process.env, REA_CLINE_HOME: home },
    encoding: "utf8",
    windowsHide: true,
    timeout: 30000,
  });
  const ms = Date.now() - t0;
  assert.equal(r.status, 0, `exit code (stderr: ${r.stderr})`);
  assert.match(r.stdout, /^[\x00-\x7f]*$/, "ASCII-only output");
  return { out: JSON.parse(r.stdout.trim()), ms };
}

const mcp = (tool, args = {}, server = "rea") => ({ toolName: "use_mcp_tool", parameters: { server_name: server, tool_name: "rea_call", arguments: JSON.stringify({ tool, arguments: args }) } });

for (const [label, shell] of shells) {
  test(`${label}: Cline-style hook runs`, { skip: !isWin ? "Windows only" : !shell && `${label} not installed` }, (t) => {
    // Wrapper points to a non-existent node with a quote and Vietnamese letters: exercises BOM, quoting and PATH fallback.
    const { dir, home } = setup("C:\\Users\\O'Brien Hoàng\\nodejs\\node.exe");

    const fast = runHook(shell, dir, home, "PreToolUse", { hookName: "PreToolUse", taskId: "t", preToolUse: { toolName: "write_to_file", parameters: { path: "a.txt" } } });
    assert.deepEqual(fast.out, { cancel: false });

    const warn = runHook(shell, dir, home, "PreToolUse", { hookName: "PreToolUse", taskId: "t", preToolUse: mcp("install_adb_package") });
    assert.equal(warn.out.cancel, false);
    assert.match(warn.out.contextModification, /install_adb_package/);
    t.diagnostic(`fast path ${fast.ms} ms, node path ${warn.ms} ms`);

    const opened = runHook(shell, dir, home, "PostToolUse", { hookName: "PostToolUse", taskId: "t", postToolUse: { ...mcp("open_binary", { path: "C:/Ứng dụng/app.exe" }), result: `{"evidence_id":"ev_1","_meta":{"provenance":{"untrusted_content":true}}}`, success: true, executionTimeMs: 5 } });
    assert.match(opened.out.contextModification, /untrusted/);
    const blocked = runHook(shell, dir, home, "PreToolUse", { hookName: "PreToolUse", taskId: "t", preToolUse: { toolName: "attempt_completion", parameters: { result: "x" } } });
    assert.equal(blocked.out.cancel, true);
    assert.match(blocked.out.errorMessage, /C:\/Ứng dụng\/app\.exe/, "non-ASCII path survives the round trip");

    const start = runHook(shell, dir, home, "TaskStart", { hookName: "TaskStart", taskId: "u", taskStart: { taskMetadata: { taskId: "u", initialTask: "Dịch ngược C:\\Users\\Hoàng\\app.exe (decompile)" } } });
    assert.match(start.out.contextModification, /reverse-engineer-anything/);

    const big = runHook(shell, dir, home, "PostToolUse", { hookName: "PostToolUse", taskId: "v", postToolUse: { ...mcp("procedure_pseudo_code"), result: "x".repeat(3 * 1024 * 1024), success: true } });
    assert.equal(big.out.cancel, false);

    assert.deepEqual(runHook(shell, dir, home, "PostToolUse", "{ not json, server_name\":\"rea\"").out, { cancel: false });
    assert.deepEqual(runHook(shell, dir, home, "TaskComplete", { hookName: "TaskComplete", taskId: "t" }).out, { cancel: false });
  });
}

test("PowerShell 5.1 reads a wrapper whose real node path has non-ASCII characters", { skip: (!isWin || !shells[0][1]) && "Windows PowerShell only" }, () => {
  const nodeDir = mkdtempSync(join(tmpdir(), "Nöde Hoàng's "));
  const node = join(nodeDir, "node.exe");
  copyFileSync(process.execPath, node);
  const { dir, home } = setup(node);
  const r = runHook(shells[0][1], dir, home, "PreToolUse", { hookName: "PreToolUse", taskId: "n", preToolUse: mcp("start_frida_session") });
  assert.equal(r.out.cancel, false);
  // start_frida_session is "external" (not mutating) -> no note; a mutating tool proves node really ran
  const m = runHook(shells[0][1], dir, home, "PreToolUse", { hookName: "PreToolUse", taskId: "n", preToolUse: mcp("gdb_console") });
  assert.match(m.out.contextModification, /gdb_console/);
});
