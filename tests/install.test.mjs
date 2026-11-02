import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { envSnapshot, hookFastPath, hookWrapper, mergeMcpSettings, nodeSatisfiesRea, parseArgs } from "../scripts/install.mjs";
import { childEnvironment } from "../kit/mcp/rea-gateway.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INSTALL = join(ROOT, "scripts", "install.mjs");

test("parseArgs validates options", () => {
  assert.equal(parseArgs([]).mode, "gateway");
  assert.equal(parseArgs(["--project", "/tmp"]).scope, "project");
  assert.deepEqual(parseArgs(["--env", "REA_MCP_INPUT_SCHEMA_PROFILE=full"]).env, { REA_MCP_INPUT_SCHEMA_PROFILE: "full" });
  assert.throws(() => parseArgs(["--mode", "x"]));
  assert.throws(() => parseArgs(["--timeout", "4000"]));
  assert.throws(() => parseArgs(["--bogus"]));
});

test("node engine check matches REA's engines", () => {
  assert.equal(nodeSatisfiesRea("22.23.4"), true);
  assert.equal(nodeSatisfiesRea("22.12.0"), false);
  assert.equal(nodeSatisfiesRea("24.22.1"), true);
  assert.equal(nodeSatisfiesRea("23.9.0"), false);
  assert.equal(nodeSatisfiesRea("27.0.0"), true);
});

test("mergeMcpSettings keeps other servers and user tweaks, refuses invalid JSON", () => {
  const before = JSON.stringify({ mcpServers: { github: { command: "x" }, rea: { command: "old", env: { HOPPER_LAUNCHER_PATH: "/h" }, timeout: 1800, disabled: true } }, extra: 1 });
  const { text, previous } = mergeMcpSettings(before, { type: "stdio", command: "node", args: ["a"], timeout: 450, autoApprove: [], disabled: false });
  const s = JSON.parse(text);
  assert.equal(s.extra, 1);
  assert.deepEqual(s.mcpServers.github, { command: "x" });
  assert.equal(s.mcpServers.rea.command, "node");
  assert.equal(s.mcpServers.rea.timeout, 1800);
  assert.equal(s.mcpServers.rea.disabled, true);
  assert.equal(s.mcpServers.rea.env.HOPPER_LAUNCHER_PATH, "/h");
  assert.equal(previous.command, "old");
  assert.throws(() => mergeMcpSettings("{ nope", {}));
  assert.deepEqual(Object.keys(JSON.parse(mergeMcpSettings(null, { command: "n" }).text).mcpServers), ["rea"]);
});

test("unix hook wrapper quotes the node path and falls back to PATH", () => {
  const w = hookWrapper("PreToolUse", "/opt/it's/node", "linux");
  assert.match(w, /^#!\/bin\/sh/);
  assert.match(w, /NODE='\/opt\/it'\\''s\/node'/);
  const dir = mkdtempSync(join(tmpdir(), "rea-wrap-"));
  mkdirSync(join(dir, "rea-cline-kit"));
  writeFileSync(join(dir, "rea-cline-kit", "rea-hook.mjs"), 'process.stdout.write(JSON.stringify({cancel:false, argv: process.argv[2]}))');
  writeFileSync(join(dir, "PreToolUse"), hookWrapper("PreToolUse", "/does/not/exist", "linux"), { mode: 0o755 });
  if (process.platform !== "win32") assert.deepEqual(JSON.parse(execFileSync(join(dir, "PreToolUse"), { input: "{}" })), { cancel: false, argv: "PreToolUse" });
});

test("Windows PowerShell wrapper: byte-exact stdin, fast path, quoting, never blocks", () => {
  const ps = hookWrapper("PreToolUse", "C:\\Users\\O'Brien Hoàng\\nodejs\\node.exe", "win32");
  assert.match(ps, /\[Console\]::OpenStandardInput\(\)/);
  assert.match(ps, /WriteAllBytes\(\$tmp, \$bytes\)/);
  assert.match(ps, /\$node = 'C:\\Users\\O''Brien Hoàng\\nodejs\\node.exe'/, "single quotes doubled");
  assert.match(ps, /& \$node \$hookScript 'PreToolUse' \$tmp/);
  assert.match(ps, /catch \{\s+\[Console\]::Error\.WriteLine\([^\n]*\)\s+Write-Output \$allow/);
  assert.match(ps, /exit 0\s*$/);
  // PowerShell 5.1 compatible: no ternary / null-coalescing / pipeline-chain operators
  assert.doesNotMatch(ps, /\?\?|\s\?\s.*\s:\s|&&|\|\|/);
  // TaskStart has no fast path (Node decides from the prompt text)
  assert.doesNotMatch(hookWrapper("TaskStart", "C:\\n\\node.exe", "win32"), /-notmatch/);
});

test("hook fast path matches REA calls only (VS Code and CLI payloads)", () => {
  const pre = new RegExp(hookFastPath("PreToolUse"));
  const post = new RegExp(hookFastPath("PostToolUse"));
  const vscode = JSON.stringify({ hookName: "PreToolUse", preToolUse: { toolName: "use_mcp_tool", parameters: { server_name: "rea", tool_name: "rea_call", arguments: "{}" } } });
  const other = JSON.stringify({ hookName: "PreToolUse", preToolUse: { toolName: "use_mcp_tool", parameters: { server_name: "github", tool_name: "x" } } });
  const write = JSON.stringify({ hookName: "PreToolUse", preToolUse: { toolName: "write_to_file", parameters: { path: "rea.txt", content: "server_name rea" } } });
  const done = JSON.stringify({ hookName: "PreToolUse", preToolUse: { toolName: "attempt_completion", parameters: { result: "x" } } });
  const cli = JSON.stringify({ hookName: "tool_result", postToolUse: { toolName: "rea__open_binary", parameters: {} } });
  assert.ok(pre.test(vscode) && pre.test(done) && post.test(vscode) && post.test(cli));
  assert.ok(!pre.test(other) && !pre.test(write) && !post.test(done));
  assert.match(hookFastPath("PreToolUse", ["rea", "rea-full"]), /\(rea\|rea-full\)/);
});

test("environment snapshot restores what Cline drops (Windows, case-insensitive keys)", () => {
  const win = envSnapshot({ Path: "C:\\x", ComSpec: "C:\\Windows\\system32\\cmd.exe", PATHEXT: ".EXE;.BAT", windir: "C:\\Windows", TMP: "C:\\t", GHIDRA_INSTALL_DIR: "C:\\g", java_home: "C:\\j", REA_ENTRY: "x", REA_CLINE_HOME: "y", REA_MCP_INPUT_SCHEMA_PROFILE: "compact", SECRET_TOKEN: "s" }, "win32");
  assert.deepEqual(win, { COMSPEC: "C:\\Windows\\system32\\cmd.exe", PATHEXT: ".EXE;.BAT", WINDIR: "C:\\Windows", TMP: "C:\\t", GHIDRA_INSTALL_DIR: "C:\\g", JAVA_HOME: "C:\\j", REA_MCP_INPUT_SCHEMA_PROFILE: "compact" });
  assert.deepEqual(envSnapshot({ HOME: "/h", TMPDIR: "/t", GHIDRA_INSTALL_DIR: "/g", AWS_SECRET: "x" }, "linux"), { TMPDIR: "/t", GHIDRA_INSTALL_DIR: "/g" });
});

test("gateway fills standard Windows variables when Cline's whitelist dropped them", () => {
  const e = childEnvironment({ SystemRoot: "C:\\Windows", SYSTEMDRIVE: "C:", TEMP: "C:\\Users\\a\\AppData\\Local\\Temp", PATH: "C:\\x" }, "win32");
  assert.equal(e.COMSPEC, "C:\\Windows\\System32\\cmd.exe");
  assert.equal(e.PATHEXT.split(";")[1], ".EXE");
  assert.equal(e.WINDIR, "C:\\Windows");
  assert.equal(e.TMP, "C:\\Users\\a\\AppData\\Local\\Temp");
  assert.equal(e.PROGRAMDATA, "C:\\ProgramData");
  assert.equal(e.SYSTEMROOT, undefined, "existing SystemRoot (any case) is kept, not duplicated");
  assert.equal(childEnvironment({ ComSpec: "D:\\cmd.exe", SystemRoot: "C:\\Windows" }, "win32").COMSPEC, undefined);
});

test("install + uninstall in an isolated home (fake REA entry)", () => {
  const home = mkdtempSync(join(tmpdir(), "rea-home-"));
  const userDir = process.platform === "win32" ? join(home, "AppData", "Roaming") : process.platform === "darwin" ? join(home, "Library", "Application Support") : join(home, ".config");
  const vs = join(userDir, "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings");
  mkdirSync(vs, { recursive: true });
  writeFileSync(join(vs, "cline_mcp_settings.json"), JSON.stringify({ mcpServers: { other: { command: "o" } } }));
  const fakeRea = join(ROOT, "tests", "fixtures", "fake-mcp.mjs");
  const env = { ...process.env, REA_CLINE_TEST_HOME: home, REA_CLINE_HOME: join(home, ".cline", "rea") };
  const out = JSON.parse(execFileSync(process.execPath, [INSTALL, "--rea-entry", fakeRea, "--mode", "full", "--approve", "safe", "--json"], { env, encoding: "utf8" }));
  assert.ok(out.actions.length > 10);
  for (const f of [join(vs, "cline_mcp_settings.json"), join(home, ".cline", "data", "settings", "cline_mcp_settings.json")]) {
    const s = JSON.parse(readFileSync(f, "utf8"));
    assert.equal(s.mcpServers.rea.args.at(-1), "mcp");
    assert.ok(s.mcpServers.rea.autoApprove.includes("procedure_pseudo_code"));
    assert.ok(!s.mcpServers.rea.autoApprove.includes("install_adb_package"));
  }
  assert.ok(readdirSync(vs).some((n) => n.includes("rea-kit-backup")), "backup written");
  assert.ok(existsSync(join(home, ".cline", "skills", "reverse-engineer-anything", "SKILL.md")));
  assert.ok(existsSync(join(home, "Documents", "Cline", "Rules", "rea-reverse-engineering.md")));
  assert.ok(existsSync(join(home, "Documents", "Cline", "Workflows", "rea-investigate-feature.md")));
  if (process.platform !== "win32") assert.ok(statSync(join(home, "Documents", "Cline", "Hooks", "PreToolUse")).mode & 0o100);
  else assert.equal(readFileSync(join(home, "Documents", "Cline", "Hooks", "PreToolUse.ps1"), "utf8").charCodeAt(0), 0xfeff, "BOM");

  // doctor starts the configured server
  const doc = JSON.parse(execFileSync(process.execPath, [INSTALL, "--doctor", "--json"], { env, encoding: "utf8" }));
  assert.equal(doc.server.ok, true);
  assert.equal(doc.server.tools, 4);

  execFileSync(process.execPath, [INSTALL, "--uninstall", "--purge", "--json"], { env, encoding: "utf8" });
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(vs, "cline_mcp_settings.json"), "utf8")).mcpServers), ["other"]);
  assert.ok(!existsSync(join(home, ".cline", "skills", "reverse-engineer-anything")));
  assert.ok(!existsSync(join(home, ".cline", "rea")));
});

test("every REA tool named in rules and workflows exists in the catalog", () => {
  const risk = JSON.parse(readFileSync(join(ROOT, "kit", "hooks", "tool-risk.json"), "utf8"));
  const notTools = new Set(["ask_followup_question", "use_mcp_tool", "list_files", "search_files", "attempt_completion", "read_file", "rea_call", "rea_find_tools",
    "input_path", "source_paths", "output_directory", "snapshot_path", "evidence_id", "target_path", "left_target_path", "right_target_path", "left_manifest_id", "right_manifest_id",
    "focus_occurrence_id", "provider_id", "reconstruction_goal", "comparison_evidence_id", "crash_signal", "capture_evidence_id", "audit_scope", "unknown_id", "behavior_question",
    "working_directory", "prior_capture_evidence_id", "cline_mcp_settings", "tool_name", "server_name", "provider_timeout", "untrusted_content", "analysis_timeout_ms", "tool_timeout_sec", "windows_native_failure",
    // REA MCP prompt names (generated workflow headers)
    "investigate_feature", "verify_reconstruction", "trace_crash", "audit_residual_unknowns", "prepare_bounded_process_capture"]);
  const files = [join(ROOT, "kit", "rules", "rea-reverse-engineering.md"), ...readdirSync(join(ROOT, "kit", "workflows")).map((f) => join(ROOT, "kit", "workflows", f))];
  const missing = [];
  for (const f of files) {
    for (const [, name] of readFileSync(f, "utf8").matchAll(/`([a-z][a-z0-9]*(?:_[a-z0-9]+)+)`/g)) {
      if (!notTools.has(name) && !(name in risk)) missing.push(`${f.split("/").pop()}: ${name}`);
    }
  }
  assert.deepEqual(missing, []);
});
