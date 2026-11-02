// Windows only, needs OFFLINE_BUNDLE=<extracted rea-cline-offline-win32-x64 folder>.
// Installs the bundle the way a user on a locked-down machine would: through install-offline.ps1, with NO node or
// npm on PATH and an unreachable npm registry, into an isolated profile. Then starts the registered MCP server with
// exactly the environment Cline gives it, calls REA, runs the installed .ps1 hooks, the doctor and the uninstaller.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { connectMcp } from "../../scripts/lib/rea-mcp-client.mjs";

const bundle = process.env.OFFLINE_BUNDLE;
const skip = process.platform !== "win32" ? "Windows only" : !bundle ? "set OFFLINE_BUNDLE" : false;
// MCP SDK 1.25.1 getDefaultEnvironment() on Windows (what Cline passes besides the entry's env)
const CLINE_WIN_ENV = ["APPDATA", "HOMEDRIVE", "HOMEPATH", "LOCALAPPDATA", "PATH", "PROCESSOR_ARCHITECTURE", "SYSTEMDRIVE", "SYSTEMROOT", "TEMP", "USERNAME", "USERPROFILE", "PROGRAMFILES"];

test("offline bundle installs and runs without npm or network", { skip, timeout: 900000 }, async (t) => {
  const home = mkdtempSync(join(tmpdir(), "rea-offline-home-"));
  const appData = join(home, "AppData", "Roaming");
  const clineExt = join(appData, "Code", "User", "globalStorage", "saoudrizwan.claude-dev");
  mkdirSync(clineExt, { recursive: true }); // "VS Code with Cline is installed"
  const sysRoot = process.env.SystemRoot || "C:\\Windows";
  const bare = {
    SystemRoot: sysRoot, WINDIR: sysRoot, COMSPEC: join(sysRoot, "System32", "cmd.exe"), PATHEXT: process.env.PATHEXT,
    TEMP: process.env.TEMP, TMP: process.env.TMP, SYSTEMDRIVE: process.env.SYSTEMDRIVE, USERNAME: process.env.USERNAME,
    USERPROFILE: process.env.USERPROFILE, APPDATA: process.env.APPDATA, LOCALAPPDATA: process.env.LOCALAPPDATA,
    PROGRAMFILES: process.env.ProgramFiles, PROCESSOR_ARCHITECTURE: process.env.PROCESSOR_ARCHITECTURE,
    // no Node.js, no npm on PATH
    PATH: [join(sysRoot, "System32"), sysRoot, join(sysRoot, "System32", "WindowsPowerShell", "v1.0")].join(";"),
    REA_CLINE_TEST_HOME: home, REA_CLINE_HOME: join(home, ".cline", "rea"),
    npm_config_registry: "http://127.0.0.1:9/", npm_config_offline: "true",
  };
  const where = spawnSync("where", ["node"], { env: bare, encoding: "utf8" });
  assert.notEqual(where.status, 0, "node must not be on PATH for this test");

  const inst = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(bundle, "install-offline.ps1"), "--json"], { env: bare, encoding: "utf8", timeout: 600000, windowsHide: true });
  t.diagnostic(inst.stdout.slice(0, 400));
  assert.equal(inst.status, 0, inst.stderr);
  const report = JSON.parse(inst.stdout.slice(inst.stdout.indexOf("{")));
  assert.equal(report.record.offline, true);
  assert.ok(!report.actions.some((a) => a.kind === "npm-install"), "npm never used");
  const node = join(home, ".cline", "rea", "node", "node.exe");
  assert.equal(report.record.node, node);
  assert.ok(existsSync(node));

  const settingsFile = join(clineExt, "settings", "cline_mcp_settings.json");
  const entry = JSON.parse(readFileSync(settingsFile, "utf8")).mcpServers.rea;
  assert.equal(entry.command, node);
  for (const k of ["COMSPEC", "PATHEXT", "WINDIR", "TMP"]) assert.ok(entry.env?.[k], `env snapshot has ${k}`);

  // A sample Electron-style app in a folder with Vietnamese characters
  const app = join(home, "Ứng dụng mẫu");
  mkdirSync(app);
  writeFileSync(join(app, "package.json"), '{"name":"demo","version":"1.0.0","main":"main.js"}');
  writeFileSync(join(app, "main.js"), 'const { ipcMain } = require("electron");\nipcMain.handle("notes:search", (_e, q) => require("./search").find(q));\n');
  writeFileSync(join(app, "search.js"), "exports.find = (q) => [q];\n");

  // Start the server exactly like Cline: whitelisted variables + entry.env (PATH still has no node/npm)
  const clineEnv = { USERPROFILE: home, APPDATA: appData, LOCALAPPDATA: join(home, "AppData", "Local") };
  for (const k of CLINE_WIN_ENV) if (!(k in clineEnv) && bare[k] !== undefined) clineEnv[k] = bare[k];
  for (const k of CLINE_WIN_ENV) if (!(k in clineEnv) && process.env[k] !== undefined && k !== "PATH") clineEnv[k] = process.env[k];
  clineEnv.PATH = bare.PATH;
  const c = await connectMcp(entry.command, entry.args, { env: { ...clineEnv, ...entry.env }, timeoutMs: 300000 });
  try {
    assert.match(c.init.serverInfo.version, /^6\.8\.0\+gateway/);
    assert.deepEqual((await c.listTools()).map((x) => x.name), ["rea_find_tools", "rea_call"]);
    assert.equal((await c.request("prompts/list", {})).prompts.length, 6);
    const found = await c.callTool("rea_find_tools", { names: ["analyze_javascript_application"] });
    assert.match(found.content[0].text, /input_path/);
    const r = await c.callTool("rea_call", { tool: "analyze_javascript_application", arguments: { input_path: app.replace(/\\/g, "/") } });
    t.diagnostic(r.content[0].text.slice(0, 300));
    assert.ok(!r.isError, r.content[0].text.slice(0, 2000));
    assert.match(r.content[0].text, /"evidence_id":"ev_/);
    assert.match(r.content[0].text, /notes:search/);
  } finally {
    await c.close();
  }

  // Installed hooks, run like Cline (powershell -File, JSON on stdin), PATH without node
  const hook = join(home, "Documents", "Cline", "Hooks", "PreToolUse.ps1");
  assert.ok(existsSync(hook));
  // Cline spawns hooks without an env option, i.e. with VS Code's full environment. Keep that, minus node on PATH.
  const hookEnv = { ...process.env, PATH: bare.PATH, REA_CLINE_HOME: bare.REA_CLINE_HOME };
  const runHook = (payload, env = hookEnv) => {
    const h = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", hook], { input: JSON.stringify(payload), env, encoding: "utf8", windowsHide: true });
    assert.equal(h.status, 0, h.stderr);
    if (h.stderr) t.diagnostic(`hook stderr: ${h.stderr}`);
    return JSON.parse(h.stdout.trim());
  };
  const mutating = { hookName: "PreToolUse", taskId: "x", preToolUse: { toolName: "use_mcp_tool", parameters: { server_name: "rea", tool_name: "rea_call", arguments: '{"tool":"uninstall_adb_package","arguments":{}}' } } };
  assert.deepEqual(runHook({ hookName: "PreToolUse", taskId: "x", preToolUse: { toolName: "read_file", parameters: { path: "a" } } }), { cancel: false });
  const res = runHook(mutating);
  const errLog = join(bare.REA_CLINE_HOME, "logs", "hook-errors.log");
  assert.match(res.contextModification ?? "", /uninstall_adb_package/, existsSync(errLog) ? readFileSync(errLog, "utf8") : JSON.stringify(res));
  // Same hook with only MCP's minimal whitelist (not what Cline does for hooks): must still never block
  const minimal = runHook(mutating, { ...clineEnv, REA_CLINE_HOME: bare.REA_CLINE_HOME });
  t.diagnostic(`minimal-env hook result: ${JSON.stringify(minimal)}`);
  assert.equal(minimal.cancel, false);

  // Doctor with the copied node, then uninstall (proves nothing stays locked)
  const kitInstall = join(home, ".cline", "rea", "kit", "scripts", "install.mjs");
  const doc = spawnSync(node, [kitInstall, "--doctor", "--json"], { env: bare, encoding: "utf8", timeout: 300000 });
  assert.equal(doc.status, 0, doc.stderr);
  const d = JSON.parse(doc.stdout);
  assert.equal(d.server.ok, true);
  assert.equal(d.server.tools, 2);
  const un = spawnSync(node, [kitInstall, "--uninstall", "--purge", "--json"], { env: bare, encoding: "utf8", timeout: 300000 });
  assert.equal(un.status, 0, un.stderr);
  // node.exe that ran the uninstaller is removed by a detached cmd.exe right after it exits
  for (let i = 0; i < 40 && existsSync(join(home, ".cline", "rea")); i++) await new Promise((r) => setTimeout(r, 500));
  assert.ok(!existsSync(join(home, ".cline", "rea")), "kit home removed");
  assert.equal(JSON.parse(readFileSync(settingsFile, "utf8")).mcpServers.rea, undefined);
});
