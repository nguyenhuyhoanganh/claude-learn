import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { hookWrapper, mergeMcpSettings, nodeSatisfiesRea, parseArgs } from "../scripts/install.mjs";

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
  assert.match(hookWrapper("TaskStart", "C:\\node\\node.exe", "win32"), /\[Console\]::In\.ReadToEnd\(\)/);
});

test("install + uninstall in an isolated home (fake REA entry)", () => {
  const home = mkdtempSync(join(tmpdir(), "rea-home-"));
  const vs = join(home, ".config", "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings");
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
    "working_directory", "prior_capture_evidence_id", "cline_mcp_settings", "tool_name", "server_name", "provider_timeout", "untrusted_content", "analysis_timeout_ms", "tool_timeout_sec",
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
