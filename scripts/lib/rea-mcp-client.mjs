// Minimal stdio MCP client used by the kit's build/doctor scripts and tests.
import { spawn } from "node:child_process";

export async function connectMcp(command, args, { env = process.env, clientName = "rea-cline-kit", timeoutMs = 120000 } = {}) {
  const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"], env, windowsHide: true });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (d) => { stderr = (stderr + d).slice(-20000); });
  const pending = new Map();
  const notifications = [];
  let nextId = 1;
  let buf = "";
  let exited = null;
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.id !== undefined && pending.has(msg.id) && msg.method === undefined) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.error) {
          const e = new Error(msg.error.message);
          e.rpc = msg.error;
          p.reject(e);
        } else p.resolve(msg.result);
      } else notifications.push(msg);
    }
  });
  const onGone = (why) => {
    exited = why;
    for (const [, p] of pending) { clearTimeout(p.timer); p.reject(new Error(`${why}\n${stderr.slice(-2000)}`)); }
    pending.clear();
  };
  child.on("exit", (code, signal) => onGone(`MCP server exited (code ${code}, signal ${signal})`));
  child.on("error", (e) => onGone(`MCP server failed to start: ${e.message}`));

  const request = (method, params) => new Promise((resolve, reject) => {
    if (exited) return reject(new Error(exited));
    const id = nextId++;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out after ${timeoutMs} ms`)); }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) })}\n`);
  });
  const notify = (method, params) => child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, ...(params === undefined ? {} : { params }) })}\n`);

  const init = await request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: clientName, version: "1.0.0" } });
  notify("notifications/initialized");

  return {
    init,
    request,
    notify,
    notifications,
    get stderr() { return stderr; },
    async listTools() {
      const tools = [];
      let cursor;
      do {
        const page = await request("tools/list", cursor ? { cursor } : undefined);
        tools.push(...(page.tools ?? []));
        cursor = page.nextCursor;
      } while (cursor);
      return tools;
    },
    callTool: (name, args = {}) => request("tools/call", { name, arguments: args }),
    async close() {
      child.stdin.end();
      await new Promise((r) => { if (exited) return r(); const t = setTimeout(() => { child.kill(); r(); }, 4000); child.once("exit", () => { clearTimeout(t); r(); }); });
    },
  };
}
