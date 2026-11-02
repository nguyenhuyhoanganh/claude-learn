import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { categorize } from "../kit/mcp/rea-gateway.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GATEWAY = join(ROOT, "kit", "mcp", "rea-gateway.mjs");

function startGateway(childArgs) {
  const p = spawn(process.execPath, [GATEWAY, "--", ...childArgs], { stdio: ["pipe", "pipe", "pipe"] });
  let buf = "";
  const waiters = new Map();
  const inbox = [];
  p.stdout.setEncoding("utf8");
  p.stdout.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const m = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      if (m.id !== undefined && m.method === undefined && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); } else inbox.push(m);
    }
  });
  let id = 0;
  const send = (m) => p.stdin.write(`${JSON.stringify(m)}\n`);
  const req = (method, params, extra = {}) => new Promise((r) => { const i = ++id; waiters.set(i, r); send({ jsonrpc: "2.0", id: i, method, params, ...extra }); });
  return { p, req, send, inbox, nextId: () => id + 1, close: () => new Promise((r) => { p.once("exit", r); p.stdin.end(); }) };
}

test("gateway proxies a fake MCP server: 2 tools, call, schema errors, progress, cancel, child requests", async () => {
  const gw = startGateway([process.execPath, join(ROOT, "tests", "fixtures", "fake-mcp.mjs")]);
  const init = await gw.req("initialize", { protocolVersion: "2025-06-18", capabilities: { roots: {} }, clientInfo: { name: "Cline", version: "4" } });
  assert.equal(init.result.serverInfo.name, "rea");
  assert.match(init.result.instructions, /FAKE INSTRUCTIONS/);
  assert.ok(init.result.capabilities.prompts);
  gw.send({ jsonrpc: "2.0", method: "notifications/initialized" });

  const list = await gw.req("tools/list", {});
  assert.deepEqual(list.result.tools.map((t) => t.name), ["rea_find_tools", "rea_call"]);
  assert.match(list.result.tools[1].description, /open_binary/);

  const schema = await gw.req("tools/call", { name: "rea_find_tools", arguments: { names: ["open_binary"] } });
  assert.match(schema.result.content[0].text, /"required":\["path"\]/);

  const ok = await gw.req("tools/call", { name: "rea_call", arguments: { tool: "open_binary", arguments: { path: "/bin/ls" } }, _meta: { progressToken: "pt-1" } });
  assert.equal(ok.result.content[0].text, "opened /bin/ls");
  assert.ok(gw.inbox.some((m) => m.method === "notifications/progress" && m.params.progressToken === "pt-1"));

  const structuredOnly = await gw.req("tools/call", { name: "rea_call", arguments: { tool: "close_binary" } });
  assert.equal(structuredOnly.result.content[0].text, '{"closed":true}');

  const bad = await gw.req("tools/call", { name: "rea_call", arguments: { tool: "open_binary", arguments: { path: "rel" } } });
  assert.equal(bad.result.isError, true);
  assert.match(bad.result.content[0].text, /Input schema/);

  const unknown = await gw.req("tools/call", { name: "rea_call", arguments: { tool: "open_bin" } });
  assert.equal(unknown.result.isError, true);
  assert.match(unknown.result.content[0].text, /Closest: .*open_binary/);

  // cancellation is forwarded with the child's request id
  const slowId = gw.nextId();
  const slow = gw.req("tools/call", { name: "rea_call", arguments: { tool: "slow_tool" } });
  await new Promise((r) => setTimeout(r, 100));
  gw.send({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: slowId } });
  assert.equal((await slow).result.content[0].text, "cancelled-ack");

  // child -> client request (roots/list) is forwarded and answered
  const roots = gw.req("tools/call", { name: "rea_call", arguments: { tool: "ask_roots" } });
  let fwd;
  for (let i = 0; i < 50 && !fwd; i++) { await new Promise((r) => setTimeout(r, 20)); fwd = gw.inbox.find((m) => m.method === "roots/list"); }
  assert.ok(fwd, "roots/list forwarded to client");
  gw.send({ jsonrpc: "2.0", id: fwd.id, result: { roots: [{ uri: "file:///w" }] } });
  assert.match((await roots).result.content[0].text, /file:\/\/\/w/);

  const prompts = await gw.req("prompts/list", {});
  assert.equal(prompts.result.prompts[0].name, "investigate_feature");
  await gw.close();
});

test("gateway reports a clear error when REA cannot start", async () => {
  const gw = startGateway(["/nonexistent/rea-binary"]);
  const init = await gw.req("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "Cline", version: "4" } });
  assert.match(init.result.instructions, /could not start/);
  const call = await gw.req("tools/call", { name: "rea_call", arguments: { tool: "open_binary" } });
  assert.equal(call.result.isError, true);
  assert.match(call.result.content[0].text, /unavailable/);
  await gw.close();
});

test("categories cover the real catalog", () => {
  const risk = JSON.parse(readFileSync(join(ROOT, "kit", "hooks", "tool-risk.json"), "utf8"));
  const cats = new Set(Object.keys(risk).map(categorize));
  for (const c of ["session", "android", "web", "javascript-electron-app", "native-analysis"]) assert.ok(cats.has(c), c);
  assert.equal(categorize("open_binary"), "session");
  assert.equal(categorize("analyze_javascript_application"), "javascript-electron-app");
  assert.equal(categorize("procedure_pseudo_code"), "native-analysis");
});

const reaEntry = process.env.REA_ENTRY ?? join(ROOT, ".cache", `rea-${JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).reaVersion}`, "node_modules", "rea-agents", "scripts", "rea.mjs");
test("gateway against real REA (set REA_ENTRY or run npm run build first)", { skip: !existsSync(reaEntry) && "REA not installed" }, async () => {
  const gw = startGateway([process.execPath, reaEntry, "mcp"]);
  const init = await gw.req("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "Cline", version: "4" } });
  assert.match(init.result.serverInfo.version, /\+gateway/);
  const list = await gw.req("tools/list", {});
  const size = JSON.stringify(list.result.tools).length;
  assert.ok(size < 12000, `gateway tool schemas stay small (${size} chars)`);
  const found = await gw.req("tools/call", { name: "rea_find_tools", arguments: { query: "javascript application" } });
  assert.match(found.result.content[0].text, /analyze_javascript_application/);
  await gw.close();
});
