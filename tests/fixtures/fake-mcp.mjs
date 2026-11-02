// Tiny fake MCP server used to test the gateway without REA.
import process from "node:process";

let buf = "";
const send = (m) => process.stdout.write(`${JSON.stringify(m)}\n`);
const tools = [
  { name: "open_binary", description: "Open one local target. Absolute path.", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] }, annotations: { openWorldHint: true } },
  { name: "close_binary", description: "Close the active target.", inputSchema: { type: "object", properties: {} }, annotations: { destructiveHint: true } },
  { name: "slow_tool", description: "Sleeps until cancelled.", inputSchema: { type: "object", properties: {} }, annotations: {} },
  { name: "ask_roots", description: "Asks the client for roots.", inputSchema: { type: "object", properties: {} }, annotations: {} },
];
const waitingRoots = new Map();
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const m = JSON.parse(buf.slice(0, i));
    buf = buf.slice(i + 1);
    if (m.method === "initialize") send({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: m.params.protocolVersion, capabilities: { tools: {}, prompts: {} }, serverInfo: { name: "fake-rea", version: "0.0.1" }, instructions: "FAKE INSTRUCTIONS" } });
    else if (m.method === "tools/list") send({ jsonrpc: "2.0", id: m.id, result: { tools } });
    else if (m.method === "prompts/list") send({ jsonrpc: "2.0", id: m.id, result: { prompts: [{ name: "investigate_feature", arguments: [] }] } });
    else if (m.method === "tools/call") {
      const { name, arguments: args, _meta } = m.params;
      if (name === "open_binary") {
        if (_meta?.progressToken !== undefined) send({ jsonrpc: "2.0", method: "notifications/progress", params: { progressToken: _meta.progressToken, progress: 1, total: 2 } });
        if (typeof args.path !== "string" || !args.path.startsWith("/")) send({ jsonrpc: "2.0", id: m.id, error: { code: -32602, message: "path must be absolute" } });
        else send({ jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text: `opened ${args.path}` }], structuredContent: { ok: true } } });
      } else if (name === "close_binary") send({ jsonrpc: "2.0", id: m.id, result: { content: [], structuredContent: { closed: true } } });
      else if (name === "slow_tool") { /* never answers unless cancelled */ globalThis.slowId = m.id; }
      else if (name === "ask_roots") { send({ jsonrpc: "2.0", id: "srv-1", method: "roots/list" }); waitingRoots.set("srv-1", m.id); }
    } else if (m.method === "notifications/cancelled") {
      if (m.params.requestId === globalThis.slowId) send({ jsonrpc: "2.0", id: globalThis.slowId, result: { content: [{ type: "text", text: "cancelled-ack" }] } });
    } else if (m.id !== undefined && m.method === undefined && waitingRoots.has(m.id)) {
      send({ jsonrpc: "2.0", id: waitingRoots.get(m.id), result: { content: [{ type: "text", text: `roots:${JSON.stringify(m.result)}` }] } });
    }
  }
});
process.stdin.on("end", () => process.exit(0));
