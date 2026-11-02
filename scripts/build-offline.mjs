#!/usr/bin/env node
// Build a self-contained offline bundle of rea-cline-kit: the kit, REA (rea-agents) with ALL its dependencies
// already installed for the target platform, and optionally a portable Node.js. The bundle installs into Cline
// without npm or network access (for machines where the npm registry is blocked).
//
//   node scripts/build-offline.mjs [--target win32-x64|linux-x64|darwin-arm64|darwin-x64] [--out dist]
//                                  [--with-node] [--rea-version 6.8.0]
//
// Building on the target platform (e.g. on Windows for win32-x64) is preferred: npm then runs install scripts
// natively, so optional native pieces such as Frida's binding are included. On another host the bundle is
// cross-installed with `npm --os/--cpu --ignore-scripts`; everything REA needs is included except Frida's binding.
// --with-node copies the Node.js that runs this script (it must match --target).
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { runNpm } from "./install.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PKG = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const flag = (n) => argv.includes(n);

const host = `${process.platform}-${process.arch}`;
const target = opt("--target", "win32-x64");
const [os, cpu] = target.split("-");
if (!["win32", "linux", "darwin"].includes(os) || !["x64", "arm64"].includes(cpu)) throw new Error(`Unsupported --target ${target}`);
const reaVersion = opt("--rea-version", PKG.reaVersion);
const native = host === target;
const outRoot = resolve(opt("--out", join(ROOT, "dist")));
const name = `rea-cline-offline-${target}`;
const out = join(outRoot, name);

function log(m) { process.stdout.write(`${m}\n`); }
function dirSize(dir) {
  let bytes = 0; let files = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { const s = dirSize(p); bytes += s.bytes; files += s.files; } else if (e.isFile()) { bytes += statSync(p).size; files++; }
  }
  return { bytes, files };
}
const sha256 = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");

log(`Building ${name} (REA ${reaVersion}, host ${host}, ${native ? "native" : "cross"} install) -> ${out}`);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// 1. kit files
for (const entry of ["kit", "scripts", "package.json", "README.md", "OFFLINE.md", "install.ps1", "install.sh", "install-offline.ps1", "install-offline.cmd", "install-offline.sh", ".gitattributes"]) {
  if (existsSync(join(ROOT, entry))) cpSync(join(ROOT, entry), join(out, entry), { recursive: true });
}

// Windows scripts need CRLF (cmd.exe) and must stay ASCII for Windows PowerShell 5.1.
if (os === "win32") {
  for (const f of ["install.ps1", "install-offline.ps1", "install-offline.cmd"]) {
    const p = join(out, f);
    if (!existsSync(p)) continue;
    const text = readFileSync(p, "utf8");
    if (/[^\x00-\x7f]/.test(text)) throw new Error(`${f} must be ASCII-only for Windows PowerShell 5.1`);
    writeFileSync(p, text.replace(/\r?\n/g, "\r\n"));
  }
}

// 2. REA runtime with every dependency
const runtime = join(out, "runtime");
mkdirSync(runtime, { recursive: true });
writeFileSync(join(runtime, "package.json"), `${JSON.stringify({ name: "rea-cline-runtime", private: true }, null, 2)}\n`);
const npmArgs = ["install", "--prefix", runtime, "--no-fund", "--no-audit", "--save-exact", "--no-update-notifier", `rea-agents@${reaVersion}`];
if (!native) npmArgs.push(`--os=${os}`, `--cpu=${cpu}`, "--ignore-scripts");
runNpm(npmArgs);
const reaPkg = JSON.parse(readFileSync(join(runtime, "node_modules", "rea-agents", "package.json"), "utf8"));
if (reaPkg.version !== reaVersion) throw new Error(`Installed rea-agents ${reaPkg.version}, expected ${reaVersion}`);

// 3. verify platform pieces
const checks = [];
const need = (label, rel, required = true) => {
  const ok = existsSync(join(runtime, "node_modules", rel));
  checks.push({ label, path: rel, ok, required });
  if (!ok && required) throw new Error(`Bundle is missing ${label} (${rel})`);
};
need("REA entry", "rea-agents/scripts/rea.mjs");
need("REA skill", "rea-agents/skills/reverse-engineer-anything/SKILL.md");
need(`node-pty prebuilt for ${target}`, `@lydell/node-pty-${target}`);
if (os === "win32") need("REA Windows native controls", "rea-agents/native/windows/build/rea-windows-x64.node");
const fridaBinding = (() => {
  const dir = join(runtime, "node_modules", "frida", "build");
  if (!existsSync(dir)) return false;
  const walk = (d) => readdirSync(d, { withFileTypes: true }).some((e) => (e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith(".node")));
  return walk(dir);
})();
checks.push({ label: "Frida binding (optional; only Frida tools need it)", path: "frida/build/**/*.node", ok: fridaBinding, required: false });

// 4. optional portable Node.js
let nodeInfo = null;
if (flag("--with-node")) {
  if (!native) throw new Error(`--with-node copies this Node.js (${host}); it cannot be used for --target ${target}`);
  const nodeDir = join(out, "node");
  const dst = os === "win32" ? join(nodeDir, "node.exe") : join(nodeDir, "bin", "node");
  mkdirSync(dirname(dst), { recursive: true });
  cpSync(process.execPath, dst);
  const lic = [join(dirname(process.execPath), "LICENSE"), join(dirname(process.execPath), "..", "LICENSE")].find(existsSync);
  if (lic) cpSync(lic, join(nodeDir, "LICENSE"));
  nodeInfo = { version: process.versions.node, file: os === "win32" ? "node/node.exe" : "node/bin/node", sha256: sha256(dst) };
}

// 5. manifest
const size = dirSize(out);
const manifest = {
  kit: PKG.name, kitVersion: PKG.version, rea: reaVersion, target, builtOn: host, install: native ? "native" : "cross (--ignore-scripts)",
  node: nodeInfo?.version ?? null, nodeFile: nodeInfo?.file ?? null, nodeSha256: nodeInfo?.sha256 ?? null,
  requiresNode: "^22.23.4 || ^24.22.1 || >=26.12.1",
  checks, files: size.files, bytes: size.bytes, builtAt: new Date().toISOString(),
};
writeFileSync(join(out, "bundle-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
log(`Done: ${size.files} files, ${(size.bytes / 1048576).toFixed(1)} MiB${nodeInfo ? `, Node.js ${nodeInfo.version} included` : ", no Node.js (target machine needs Node 22.23.4+/24.22.1+)"}`);
for (const c of checks) log(`  ${c.ok ? "ok " : c.required ? "ERR" : "-- "} ${c.label}`);
