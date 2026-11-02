import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const home = mkdtempSync(join(tmpdir(), "rea-hooks-"));
process.env.REA_CLINE_HOME = home;
const { asciiJson, decide, extractReaCall } = await import("../kit/hooks/rea-hook.mjs");
const risk = JSON.parse(readFileSync(join(ROOT, "kit", "hooks", "tool-risk.json"), "utf8"));
const cfg = (over = {}) => ({ serverNames: ["rea"], blockTools: [], warnMutating: true, requireCloseBeforeCompletion: true, routingHints: true, logCalls: false, ...over });

test("extractReaCall understands VS Code, CLI and gateway shapes", () => {
  assert.deepEqual(extractReaCall("use_mcp_tool", { server_name: "rea", tool_name: "open_binary", arguments: '{"path":"/a"}' }, ["rea"]), { tool: "open_binary", args: { path: "/a" } });
  assert.equal(extractReaCall("use_mcp_tool", { server_name: "github", tool_name: "x" }, ["rea"]), null);
  assert.deepEqual(extractReaCall("rea__close_binary", {}, ["rea"]), { tool: "close_binary", args: {} });
  assert.deepEqual(extractReaCall("use_mcp_tool", { server_name: "rea", tool_name: "rea_call", arguments: { tool: "open_binary", arguments: { path: "/b" } } }, ["rea"]), { tool: "open_binary", args: { path: "/b" }, viaGateway: true });
  assert.deepEqual(extractReaCall("rea__rea_call", { tool: "xrefs", arguments: '{"address":"0x1"}' }, ["rea"]), { tool: "xrefs", args: { address: "0x1" }, viaGateway: true });
  assert.equal(extractReaCall("write_to_file", { path: "x" }, ["rea"]), null);
});

test("PreToolUse: warns on mutating REA tools and honors blockTools", () => {
  const pre = (tool) => ({ hookName: "PreToolUse", taskId: "a", preToolUse: { toolName: "use_mcp_tool", parameters: { server_name: "rea", tool_name: tool, arguments: "{}" } } });
  assert.equal(risk.install_adb_package, "mutating");
  assert.match(decide("PreToolUse", pre("install_adb_package"), { config: cfg(), risk }).contextModification, /authorized/);
  assert.equal(decide("PreToolUse", pre("procedure_pseudo_code"), { config: cfg(), risk }).contextModification, undefined);
  const blocked = decide("PreToolUse", pre("install_adb_package"), { config: cfg({ blockTools: ["install_adb_package"] }), risk });
  assert.equal(blocked.cancel, true);
  assert.match(blocked.errorMessage, /blocked/);
});

test("open_binary -> attempt_completion is stopped once, then allowed; close_binary clears it", () => {
  const post = (tool, args = {}) => ({ hookName: "tool_result", taskId: "b", postToolUse: { toolName: `rea__${tool}`, parameters: args, result: '{"evidence_id":"ev"}', success: true } });
  const done = { hookName: "tool_call", taskId: "b", preToolUse: { toolName: "attempt_completion", parameters: {} } };
  decide("PostToolUse", post("open_binary", { path: "/x/app" }), { config: cfg(), risk });
  const first = decide("PreToolUse", done, { config: cfg(), risk });
  assert.equal(first.cancel, true);
  assert.match(first.errorMessage, /\/x\/app/);
  assert.equal(decide("PreToolUse", done, { config: cfg(), risk }).cancel, false);
  decide("PostToolUse", post("open_binary", { path: "/x/app" }), { config: cfg(), risk });
  decide("PostToolUse", post("close_binary"), { config: cfg(), risk });
  assert.equal(decide("PreToolUse", done, { config: cfg(), risk }).cancel, false);
});

test("PostToolUse adds untrusted-content and provider_timeout notes", () => {
  const post = (result, success = true) => ({ hookName: "PostToolUse", taskId: "c", postToolUse: { toolName: "use_mcp_tool", parameters: { server_name: "rea", tool_name: "rea_call", arguments: '{"tool":"procedure_pseudo_code","arguments":{}}' }, result, success } });
  assert.match(decide("PostToolUse", post('{"_meta":{"provenance":{"untrusted_content":true}}}'), { config: cfg(), risk }).contextModification, /untrusted/);
  assert.equal(decide("PostToolUse", post('{"_meta":{"provenance":{"untrusted_content":true}}}'), { config: cfg(), risk }).contextModification, undefined, "only once per task");
  assert.match(decide("PostToolUse", post('{"error":{"code":"provider_timeout"}}', false), { config: cfg(), risk }).contextModification, /provider_timeout/);
  assert.match(decide("PostToolUse", post("MCP error -32001: Request timed out", false), { config: cfg(), risk }).contextModification, /raise `timeout`/);
});

test("routing hint fires once for reverse-engineering prompts only", () => {
  const start = (t, id) => ({ hookName: "TaskStart", taskId: id, taskStart: { taskMetadata: { taskId: id, initialTask: t } } });
  assert.match(decide("TaskStart", start("Decompile /tmp/a.exe", "d"), { config: cfg(), risk }).contextModification, /reverse-engineer-anything/);
  assert.equal(decide("UserPromptSubmit", { hookName: "UserPromptSubmit", taskId: "d", userPromptSubmit: { prompt: "now the apk too" } }, { config: cfg(), risk }).contextModification, undefined);
  assert.equal(decide("TaskStart", start("Add a dark mode toggle to settings.tsx", "e"), { config: cfg(), risk }).contextModification, undefined);
});

test("Windows mode: payload from a temp file (BOM tolerated), ASCII-only JSON out", () => {
  const file = join(home, "payload.json");
  const payload = { hookName: "TaskStart", taskId: "w1", taskStart: { taskMetadata: { taskId: "w1", initialTask: "Dịch ngược C:\\Users\\Hoàng\\app.exe giúp tôi (decompile)" } } };
  writeFileSync(file, `\uFEFF${JSON.stringify(payload)}`);
  const out = execFileSync(process.execPath, [join(ROOT, "kit", "hooks", "rea-hook.mjs"), "TaskStart", file], { env: { ...process.env, REA_CLINE_HOME: home }, encoding: "utf8" });
  assert.match(out, /^[\x00-\x7f]*$/, "ASCII only");
  const parsed = JSON.parse(out);
  assert.equal(parsed.cancel, false);
  assert.match(parsed.contextModification, /reverse-engineer-anything/);
  assert.equal(asciiJson({ s: "Hoàng ✓" }), '{"s":"Ho\\u00e0ng \\u2713"}');
  assert.equal(JSON.parse(asciiJson({ s: "Hoàng ✓" })).s, "Hoàng ✓");
});

test("hook process never fails on bad input", () => {
  const out = execFileSync(process.execPath, [join(ROOT, "kit", "hooks", "rea-hook.mjs"), "PreToolUse"], { input: "{not json", env: { ...process.env, REA_CLINE_HOME: home } });
  assert.deepEqual(JSON.parse(out), { cancel: false });
  writeFileSync(join(home, "hooks-config.json"), "{ broken");
  const out2 = execFileSync(process.execPath, [join(ROOT, "kit", "hooks", "rea-hook.mjs"), "PostToolUse"], { input: "{}", env: { ...process.env, REA_CLINE_HOME: home } });
  assert.deepEqual(JSON.parse(out2), { cancel: false });
});
