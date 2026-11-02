#!/usr/bin/env node
// rea-cline-kit installer: installs REA for Cline (VS Code/Cursor/Windsurf/VSCodium extension, JetBrains, Cline CLI).
//
//   node scripts/install.mjs [--scope global|project] [--project DIR] [--mode gateway|full]
//                            [--approve none|safe|nondestructive] [--targets auto|LIST]
//                            [--rea-version X.Y.Z | --rea-entry /abs/rea.mjs | --use-path]
//                            [--timeout SECONDS] [--env KEY=VALUE ...]
//                            [--no-mcp] [--no-skill] [--no-rules] [--no-workflows] [--no-hooks]
//                            [--dry-run] [--json]
//   node scripts/install.mjs --doctor
//   node scripts/install.mjs --update [--rea-version X.Y.Z|latest]
//   node scripts/install.mjs --uninstall [--scope global|project] [--project DIR] [--purge]
//
// Everything written is recorded in ~/.cline/rea/install.json; existing files are backed up
// next to the original with a `.rea-kit-backup-<timestamp>` suffix before they are changed.

import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync, copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const KIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const KIT = join(KIT_ROOT, "kit");
const PKG = JSON.parse(readFileSync(join(KIT_ROOT, "package.json"), "utf8"));
const MARKER = "rea-cline-kit";
const HOOK_NAMES = ["PreToolUse", "PostToolUse", "TaskStart", "UserPromptSubmit", "TaskCancel", "TaskComplete"];
const SERVER_NAME = "rea";
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");

// ---------------------------------------------------------------------------
// options
// ---------------------------------------------------------------------------
export function parseArgs(argv) {
  const o = {
    scope: "global", project: process.cwd(), mode: "gateway", approve: "safe", targets: "auto",
    reaVersion: PKG.reaVersion, reaEntry: null, usePath: false, timeout: 450, env: {},
    mcp: true, skill: true, rules: true, workflows: true, hooks: true, envSnapshot: true,
    ghidra: null, javaHome: null, provider: null,
    dryRun: false, json: false, action: "install", purge: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { const v = argv[++i]; if (v === undefined) throw new Error(`${a} needs a value`); return v; };
    switch (a) {
      case "--scope": o.scope = val(); break;
      case "--project": o.project = resolve(val()); o.scope = "project"; break;
      case "--mode": o.mode = val(); break;
      case "--approve": o.approve = val(); break;
      case "--targets": o.targets = val(); break;
      case "--rea-version": o.reaVersion = val(); break;
      case "--rea-entry": o.reaEntry = resolve(val()); break;
      case "--use-path": o.usePath = true; break;
      case "--timeout": o.timeout = Number(val()); break;
      case "--env": { const kv = val(); const j = kv.indexOf("="); if (j < 1) throw new Error(`--env expects KEY=VALUE, got ${kv}`); o.env[kv.slice(0, j)] = kv.slice(j + 1); break; }
      case "--ghidra": o.ghidra = resolve(val()); break;
      case "--java-home": o.javaHome = resolve(val()); break;
      case "--provider": o.provider = val(); break;
      case "--no-env-snapshot": o.envSnapshot = false; break;
      case "--no-mcp": o.mcp = false; break;
      case "--no-skill": o.skill = false; break;
      case "--no-rules": o.rules = false; break;
      case "--no-workflows": o.workflows = false; break;
      case "--no-hooks": o.hooks = false; break;
      case "--dry-run": o.dryRun = true; break;
      case "--json": o.json = true; break;
      case "--doctor": o.action = "doctor"; break;
      case "--update": o.action = "update"; break;
      case "--uninstall": o.action = "uninstall"; break;
      case "--purge": o.purge = true; break;
      case "-h": case "--help": o.action = "help"; break;
      default: throw new Error(`Unknown option ${a} (see --help)`);
    }
  }
  if (!["global", "project"].includes(o.scope)) throw new Error("--scope must be global or project");
  if (!["gateway", "full"].includes(o.mode)) throw new Error("--mode must be gateway or full");
  if (!["none", "safe", "nondestructive"].includes(o.approve)) throw new Error("--approve must be none, safe or nondestructive");
  if (!Number.isFinite(o.timeout) || o.timeout < 1 || o.timeout > 3600) throw new Error("--timeout must be 1..3600 seconds (Cline limit)");
  return o;
}

// ---------------------------------------------------------------------------
// paths
// ---------------------------------------------------------------------------
export function paths(env = process.env, platform = process.platform) {
  const home = env.REA_CLINE_TEST_HOME || homedir();
  const kitHome = env.REA_CLINE_HOME || join(home, ".cline", "rea");
  const clineDir = env.CLINE_DIR || join(home, ".cline");
  const clineData = env.CLINE_DATA_DIR || join(clineDir, "data");
  return { home, kitHome, clineDir, clineData, documents: documentsDir(home, env, platform) };
}

const documentsCache = new Map();
function documentsDir(home, env, platform) {
  if (env.REA_CLINE_DOCUMENTS) return env.REA_CLINE_DOCUMENTS;
  if (env.REA_CLINE_TEST_HOME) return join(home, "Documents");
  const key = `${platform}:${home}`;
  if (!documentsCache.has(key)) documentsCache.set(key, lookupDocumentsDir(home, platform));
  return documentsCache.get(key);
}

// Same lookup as Cline's getDocumentsPath(): on Windows this follows OneDrive "Documents" redirection.
function lookupDocumentsDir(home, platform) {
  try {
    if (platform === "win32") {
      // base64 of UTF-8 bytes: console code pages would otherwise mangle a non-ASCII path (e.g. "OneDrive - Công ty").
      const script = "[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([Environment]::GetFolderPath([Environment+SpecialFolder]::MyDocuments)))";
      const b64 = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true }).trim();
      const out = Buffer.from(b64, "base64").toString("utf8").trim();
      if (out) return out;
    } else if (platform === "linux") {
      const out = execFileSync("xdg-user-dir", ["DOCUMENTS"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      if (out) return out;
    }
  } catch { /* fall back */ }
  return join(home, "Documents");
}

/** Every cline_mcp_settings.json location we know, with whether its host looks installed. */
export function mcpTargets(p, env = process.env, platform = process.platform) {
  const out = [];
  const editors = [
    ["vscode", "Code"], ["vscode-insiders", "Code - Insiders"], ["vscodium", "VSCodium"],
    ["cursor", "Cursor"], ["windsurf", "Windsurf"], ["trae", "Trae"], ["kiro", "Kiro"],
  ];
  const testing = !!env.REA_CLINE_TEST_HOME;
  const base = platform === "darwin" ? join(p.home, "Library", "Application Support")
    : platform === "win32" ? ((!testing && env.APPDATA) || join(p.home, "AppData", "Roaming"))
      : ((!testing && env.XDG_CONFIG_HOME) || join(p.home, ".config"));
  for (const [id, dir] of editors) {
    const ext = join(base, dir, "User", "globalStorage", "saoudrizwan.claude-dev");
    out.push({ id, file: join(ext, "settings", "cline_mcp_settings.json"), present: existsSync(ext) });
  }
  // Cline CLI, SDK, Kanban and the JetBrains plugin share ~/.cline/data.
  out.push({ id: "cli", file: join(p.clineData, "settings", "cline_mcp_settings.json"), present: true, aliases: ["jetbrains"] });
  return out;
}

function selectTargets(all, spec) {
  if (spec === "auto") return all.filter((t) => t.present);
  if (spec === "all") return all;
  const wanted = spec.split(",").map((s) => s.trim()).filter(Boolean);
  const picked = all.filter((t) => wanted.includes(t.id) || t.aliases?.some((a) => wanted.includes(a)));
  const unknown = wanted.filter((w) => !all.some((t) => t.id === w || t.aliases?.includes(w)));
  if (unknown.length) throw new Error(`Unknown --targets ${unknown.join(", ")}; use ${all.map((t) => t.id).join(", ")}, jetbrains, auto or all`);
  return picked;
}

function scopeDirs(o, p) {
  if (o.scope === "global") {
    return {
      skills: join(p.clineDir, "skills"),
      rules: join(p.documents, "Cline", "Rules"),
      workflows: join(p.documents, "Cline", "Workflows"),
      hooks: join(p.documents, "Cline", "Hooks"),
    };
  }
  const root = o.project;
  const legacy = join(root, ".clinerules");
  // A legacy single-file .clinerules cannot hold directories; fall back to the .cline/ layout then.
  const rulesRoot = existsSync(legacy) && !statSync(legacy).isDirectory() ? join(root, ".cline") : legacy;
  const isLegacy = rulesRoot === legacy;
  return {
    skills: join(root, ".cline", "skills"),
    rules: isLegacy ? legacy : join(rulesRoot, "rules"),
    workflows: join(rulesRoot, "workflows"),
    hooks: join(rulesRoot, "hooks"),
  };
}

// ---------------------------------------------------------------------------
// small fs helpers (all respect dry-run through the Plan)
// ---------------------------------------------------------------------------
class Plan {
  constructor(dryRun) { this.dryRun = dryRun; this.actions = []; this.warnings = []; this.written = []; }
  note(kind, target, detail = "") { this.actions.push({ kind, target, detail }); }
  warn(msg) { this.warnings.push(msg); }
  mkdir(dir) { if (!this.dryRun) mkdirSync(dir, { recursive: true }); }
  backup(path) {
    if (!existsSync(path)) return null;
    const dst = `${path}.rea-kit-backup-${STAMP}`;
    this.note("backup", path, dst);
    if (!this.dryRun) cpSync(path, dst, { recursive: true });
    return dst;
  }
  writeFile(path, content, mode) {
    this.note(existsSync(path) ? "update" : "create", path);
    if (this.dryRun) return;
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.tmp-${process.pid}`;
    writeFileSync(tmp, content);
    if (mode) chmodSync(tmp, mode);
    renameSync(tmp, path);
    this.written.push(path);
  }
  copyDir(src, dst) {
    this.note(existsSync(dst) ? "replace" : "create", dst, `from ${src}`);
    if (this.dryRun) return;
    rmSync(dst, { recursive: true, force: true });
    mkdirSync(dirname(dst), { recursive: true });
    cpSync(src, dst, { recursive: true });
    this.written.push(dst);
  }
  remove(path) {
    if (!existsSync(path)) return;
    this.note("remove", path);
    if (!this.dryRun) rmSync(path, { recursive: true, force: true });
  }
}

const readJson = (f, fb) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return fb; } };
const isOurs = (path) => {
  try {
    if (lstatSync(path).isDirectory()) return existsSync(join(path, `.${MARKER}`));
    return readFileSync(path, "utf8").includes(MARKER);
  } catch { return false; }
};

// ---------------------------------------------------------------------------
// REA runtime
// ---------------------------------------------------------------------------
export function nodeSatisfiesRea(version = process.versions.node) {
  const [maj, min, pat] = version.split(".").map(Number);
  const ge = (a, b, c) => min > b || (min === b && pat >= c);
  if (maj === 22) return ge(22, 23, 4);
  if (maj === 24) return ge(24, 22, 1);
  if (maj === 26) return ge(26, 12, 1);
  return maj > 26;
}

// Cline starts stdio MCP servers with the MCP SDK's getDefaultEnvironment(), which keeps only a small whitelist
// (Windows: APPDATA HOMEDRIVE HOMEPATH LOCALAPPDATA PATH PROCESSOR_ARCHITECTURE SYSTEMDRIVE SYSTEMROOT TEMP USERNAME
// USERPROFILE PROGRAMFILES; Unix: HOME LOGNAME PATH SHELL TERM USER) plus the entry's `env`. REA and the tools it
// launches (Ghidra .bat launchers, Java, JADX, PowerShell) need more, so copy those values into `env` at install time.
const WINDOWS_ENV_GAPS = [
  "COMSPEC", "PATHEXT", "WINDIR", "PROGRAMDATA", "PROGRAMFILES(X86)", "PROGRAMW6432", "COMMONPROGRAMFILES",
  "ALLUSERSPROFILE", "PUBLIC", "TMP", "NUMBER_OF_PROCESSORS", "OS", "PROCESSOR_IDENTIFIER",
];
const UNIX_ENV_GAPS = ["TMPDIR", "LANG", "LC_ALL"];
const PROVIDER_ENV = /^(REA_(?!CLINE_|ENTRY$|GATEWAY_)|GHIDRA_|HOPPER_|IDA_|IDADIR$|JAVA_HOME$|JDK_HOME$|ANDROID_HOME$|ANDROID_SDK_ROOT$|KUNA_)/i;

export function envSnapshot(sourceEnv = process.env, platform = process.platform) {
  const keys = Object.keys(sourceEnv);
  const find = (name) => keys.find((k) => (platform === "win32" ? k.toUpperCase() === name : k === name));
  const out = {};
  for (const name of platform === "win32" ? WINDOWS_ENV_GAPS : UNIX_ENV_GAPS) {
    const k = find(name);
    if (k && sourceEnv[k]) out[platform === "win32" ? name : k] = sourceEnv[k];
  }
  for (const k of keys) if (PROVIDER_ENV.test(k) && sourceEnv[k]) out[platform === "win32" ? k.toUpperCase() : k] = sourceEnv[k];
  return out;
}

function providerEnv(o, plan) {
  const env = {};
  const win = process.platform === "win32";
  if (o.ghidra) {
    const launcher = join(o.ghidra, "support", win ? "analyzeHeadless.bat" : "analyzeHeadless");
    if (!existsSync(launcher)) plan.warn(`--ghidra ${o.ghidra}: ${launcher} not found (expected an extracted Ghidra 12.1.x release directory).`);
    env.GHIDRA_INSTALL_DIR = o.ghidra;
  }
  if (o.javaHome) {
    const java = join(o.javaHome, "bin", win ? "java.exe" : "java");
    if (!existsSync(java)) plan.warn(`--java-home ${o.javaHome}: ${java} not found (Ghidra needs a full 64-bit JDK 21+).`);
    env.JAVA_HOME = o.javaHome;
  }
  if (o.provider) env.REA_ANALYSIS_PROVIDER = o.provider;
  return env;
}

/** Run npm with the npm that belongs to this Node.js. On Windows, call npm-cli.js through node.exe:
 * spawning npm.cmd needs a shell (CVE-2024-27980) and breaks on paths with spaces. */
export function runNpm(args, { capture = false, quiet = false } = {}) {
  const stdio = capture ? ["ignore", "pipe", "inherit"] : quiet ? "ignore" : "inherit";
  if (process.platform === "win32") {
    const cli = join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
    if (existsSync(cli)) return execFileSync(process.execPath, [cli, ...args], { stdio, encoding: "utf8", windowsHide: true });
    const quoted = args.map((a) => `"${String(a).replace(/"/g, '""')}"`);
    return execFileSync("npm.cmd", quoted, { stdio, encoding: "utf8", shell: true, windowsHide: true });
  }
  return execFileSync("npm", args, { stdio, encoding: "utf8" });
}

function resolveRea(o, p, plan) {
  if (o.reaEntry) {
    if (!existsSync(o.reaEntry)) throw new Error(`--rea-entry ${o.reaEntry} does not exist`);
    return { command: process.execPath, args: [o.reaEntry], entry: o.reaEntry, source: "entry" };
  }
  if (o.usePath) {
    const win = process.platform === "win32";
    const which = spawnSync(win ? "where" : "which", ["rea"], { encoding: "utf8", windowsHide: true });
    const hits = which.status === 0 ? which.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) : [];
    if (!hits.length) throw new Error("--use-path: `rea` is not on PATH (npm install --global rea-agents)");
    // npm's global shim (rea / rea.cmd / rea.ps1) sits next to node_modules\rea-agents. Register node + rea.mjs
    // directly: Cline cannot spawn a .cmd shim without a shell.
    for (const hit of hits) {
      const mjs = join(dirname(hit), "node_modules", "rea-agents", "scripts", "rea.mjs");
      if (existsSync(mjs)) return { command: process.execPath, args: [mjs], entry: mjs, source: "path" };
    }
    if (win) throw new Error(`--use-path: found ${hits[0]} but not node_modules\\rea-agents\\scripts\\rea.mjs next to it; use --rea-entry <path to rea.mjs>`);
    return { command: hits[0], args: [], entry: hits[0], source: "path" };
  }
  const prefix = join(p.kitHome, "runtime");
  const entry = join(prefix, "node_modules", "rea-agents", "scripts", "rea.mjs");
  const pkgFile = join(prefix, "node_modules", "rea-agents", "package.json");
  const installed = readJson(pkgFile, null)?.version;
  if (installed !== o.reaVersion || o.action === "update") {
    plan.note("npm-install", prefix, `rea-agents@${o.reaVersion}${installed ? ` (was ${installed})` : ""}`);
    if (!plan.dryRun) {
      mkdirSync(prefix, { recursive: true });
      if (!existsSync(join(prefix, "package.json"))) writeFileSync(join(prefix, "package.json"), `${JSON.stringify({ name: "rea-cline-runtime", private: true }, null, 2)}\n`);
      try {
        runNpm(["install", "--prefix", prefix, "--no-fund", "--no-audit", "--save-exact", `rea-agents@${o.reaVersion}`], { quiet: o.json });
      } catch (error) {
        const hint = process.platform === "win32"
          ? " On Windows a running REA server keeps its native addon (rea-windows-x64.node) locked: close VS Code (or disable the rea server in Cline) and rerun. Antivirus scanning node_modules can also cause EPERM/EBUSY."
          : "";
        throw new Error(`npm install rea-agents@${o.reaVersion} failed: ${error.message}${hint}`);
      }
    }
  }
  return { command: process.execPath, args: [entry], entry, source: "runtime", prefix };
}

// ---------------------------------------------------------------------------
// MCP settings
// ---------------------------------------------------------------------------
export function mcpEntry(o, rea, gatewayPath, autoApprove, env = o.env) {
  const reaArgs = [...rea.args, "mcp"];
  const base = o.mode === "gateway"
    ? { type: "stdio", command: process.execPath, args: [gatewayPath, "--", rea.command, ...reaArgs] }
    : { type: "stdio", command: rea.command, args: reaArgs };
  return { ...base, ...(Object.keys(env).length ? { env: { ...env } } : {}), timeout: o.timeout, autoApprove, disabled: false };
}

function autoApproveList(o) {
  const presets = readJson(join(KIT, "mcp", "autoapprove.json"), {});
  if (o.approve === "none") return [];
  if (o.mode === "gateway") return presets.gateway ?? ["rea_find_tools"];
  return presets[o.approve] ?? [];
}

export function mergeMcpSettings(text, entry) {
  let settings = { mcpServers: {} };
  if (text !== null && text.trim()) {
    settings = JSON.parse(text); // throws on invalid JSON: never overwrite a file we cannot parse
    if (typeof settings !== "object" || settings === null || Array.isArray(settings)) throw new Error("top level is not an object");
  }
  if (typeof settings.mcpServers !== "object" || settings.mcpServers === null) settings.mcpServers = {};
  const previous = settings.mcpServers[SERVER_NAME];
  // keep user-tuned fields from a previous entry
  const merged = { ...entry };
  if (previous && typeof previous === "object") {
    if (previous.env && typeof previous.env === "object") merged.env = { ...previous.env, ...(entry.env ?? {}) };
    if (previous.disabled === true) merged.disabled = true;
    if (typeof previous.timeout === "number" && previous.timeout > merged.timeout) merged.timeout = Math.min(previous.timeout, 3600);
  }
  settings.mcpServers[SERVER_NAME] = merged;
  return { text: `${JSON.stringify(settings, null, 2)}\n`, previous };
}

// ---------------------------------------------------------------------------
// hooks
// ---------------------------------------------------------------------------
/** Regex (as source text) that a hook payload must match before Node is started; null = always run. */
export function hookFastPath(name, serverNames = [SERVER_NAME]) {
  const servers = serverNames.map((s) => s.replace(/[^A-Za-z0-9_-]/g, "")).filter(Boolean).join("|");
  const mcp = `"server_name"\\s*:\\s*"(${servers})"|"toolName"\\s*:\\s*"(${servers})__`;
  if (name === "PreToolUse") return `${mcp}|"toolName"\\s*:\\s*"attempt_completion"`;
  if (name === "PostToolUse") return mcp;
  return null;
}

export function hookWrapper(name, nodePath, platform = process.platform, serverNames = [SERVER_NAME]) {
  if (platform === "win32") {
    // Cline (VS Code, Windows) runs: <pwsh|powershell> -NoProfile -NonInteractive -ExecutionPolicy Bypass -File <Hook>.ps1
    // with the JSON payload on stdin. Works on Windows PowerShell 5.1 and PowerShell 7:
    //  - stdin bytes are copied to a temp file untouched (no code-page re-encoding),
    //  - non-REA tool calls are answered without starting Node (each PowerShell start already costs time),
    //  - rea-hook.mjs prints ASCII-only JSON, so the console encoding cannot corrupt it,
    //  - any failure answers {"cancel":false}, so a broken hook never blocks Cline.
    const psq = (s) => `'${String(s).replace(/'/g, "''")}'`;
    const fast = hookFastPath(name, serverNames);
    return `# ${MARKER} hook wrapper (${name}). Safe to delete; reinstall with rea-cline-kit.
$ErrorActionPreference = 'Continue'
$allow = '{"cancel":false}'
$tmp = $null
try {
  $stdin = [Console]::OpenStandardInput()
  $buffer = New-Object System.IO.MemoryStream
  $stdin.CopyTo($buffer)
  $bytes = $buffer.ToArray()
${fast ? `  $text = [System.Text.Encoding]::UTF8.GetString($bytes)
  if ($text -notmatch ${psq(fast)}) { Write-Output $allow; exit 0 }
` : ""}  $node = $env:REA_CLINE_NODE
  if (-not $node -or -not (Test-Path -LiteralPath $node)) { $node = ${psq(nodePath)} }
  if (-not (Test-Path -LiteralPath $node)) {
    $cmd = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $cmd) { Write-Output $allow; exit 0 }
    $node = $cmd.Source
  }
  $tmp = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), 'rea-hook-' + [guid]::NewGuid().ToString('N') + '.json')
  [System.IO.File]::WriteAllBytes($tmp, $bytes)
  $hookScript = Join-Path $PSScriptRoot '${MARKER}\\rea-hook.mjs'
  $out = & $node $hookScript '${name}' $tmp
  if ($LASTEXITCODE -eq 0 -and $out) { Write-Output $out } else { Write-Output $allow }
} catch {
  Write-Output $allow
} finally {
  if ($tmp) { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }
}
exit 0
`;
  }
  const q = nodePath.replace(/'/g, "'\\''");
  return `#!/bin/sh
# ${MARKER} hook wrapper (${name}). Safe to delete; reinstall with rea-cline-kit.
NODE='${q}'
[ -n "$REA_CLINE_NODE" ] && NODE="$REA_CLINE_NODE"
[ -x "$NODE" ] || NODE="$(command -v node)"
if [ -z "$NODE" ]; then echo '{"cancel":false}'; exit 0; fi
exec "$NODE" "$(dirname "$0")/${MARKER}/rea-hook.mjs" ${name}
`;
}

function installHooks(dir, plan) {
  const lib = join(dir, MARKER);
  plan.note("hooks-lib", lib);
  if (!plan.dryRun) {
    rmSync(lib, { recursive: true, force: true });
    mkdirSync(lib, { recursive: true });
    copyFileSync(join(KIT, "hooks", "rea-hook.mjs"), join(lib, "rea-hook.mjs"));
    copyFileSync(join(KIT, "hooks", "tool-risk.json"), join(lib, "tool-risk.json"));
    writeFileSync(join(lib, `.${MARKER}`), `${PKG.version}\n`);
    plan.written.push(lib);
  }
  const files = [lib];
  for (const name of HOOK_NAMES) {
    const file = join(dir, process.platform === "win32" ? `${name}.ps1` : name);
    if (existsSync(file) && !isOurs(file)) {
      plan.warn(`Existing hook ${file} is not managed by ${MARKER}; left unchanged. To chain REA's logic, call: node "${join(lib, "rea-hook.mjs")}" ${name}  (pass the same stdin).`);
      continue;
    }
    // .ps1: UTF-8 with BOM + CRLF, so Windows PowerShell 5.1 reads a non-ASCII node path (e.g. C:\Users\Hoàng) correctly.
    const content = process.platform === "win32"
      ? `\uFEFF${hookWrapper(name, process.execPath).replace(/\r?\n/g, "\r\n")}`
      : hookWrapper(name, process.execPath);
    plan.writeFile(file, content, 0o755);
    files.push(file);
  }
  return files;
}

// ---------------------------------------------------------------------------
// install / update / uninstall / doctor
// ---------------------------------------------------------------------------
function loadInstallRecord(p) { return readJson(join(p.kitHome, "install.json"), { kit: MARKER, installs: [] }); }
function recordKey(o) { return o.scope === "global" ? "global" : `project:${o.project}`; }

export async function install(o, env = process.env) {
  const p = paths(env);
  const plan = new Plan(o.dryRun);
  if (!nodeSatisfiesRea()) plan.warn(`Node.js ${process.versions.node} does not satisfy REA's engines (^22.23.4 || ^24.22.1 || >=26.12.1). Install a supported Node.js and rerun with it.`);
  if (o.scope === "project" && !existsSync(o.project)) throw new Error(`Project ${o.project} does not exist`);

  // 1. copy the kit itself (gateway, hook lib, scripts for doctor/update) to ~/.cline/rea/kit
  const kitCopy = join(p.kitHome, "kit");
  if (resolve(KIT_ROOT) !== resolve(kitCopy)) {
    plan.note(existsSync(kitCopy) ? "replace" : "create", kitCopy, `kit ${PKG.version}`);
    if (!o.dryRun) {
      const staging = `${kitCopy}.staging-${process.pid}`;
      rmSync(staging, { recursive: true, force: true });
      mkdirSync(staging, { recursive: true });
      for (const entry of ["kit", "scripts", "package.json", "README.md", "install.sh", "install.ps1"]) {
        if (existsSync(join(KIT_ROOT, entry))) cpSync(join(KIT_ROOT, entry), join(staging, entry), { recursive: true });
      }
      try {
        rmSync(kitCopy, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
        renameSync(staging, kitCopy);
      } catch (error) {
        rmSync(staging, { recursive: true, force: true });
        throw new Error(`Cannot replace ${kitCopy}: ${error.message}. Close VS Code (it may be running the rea gateway or a terminal inside that folder) and rerun.`);
      }
    }
  }
  const gatewayPath = join(kitCopy, "kit", "mcp", "rea-gateway.mjs");

  // 2. REA runtime
  const rea = o.mcp || o.skill ? resolveRea(o, p, plan) : null;

  const record = { key: recordKey(o), scope: o.scope, project: o.scope === "project" ? o.project : null, mode: o.mode, approve: o.approve, reaVersion: o.reaVersion, kitVersion: PKG.version, installedAt: new Date().toISOString(), node: process.execPath, rea, files: [], mcpFiles: [] };

  // 3. MCP settings (Cline MCP settings are global per host)
  if (o.mcp) {
    const autoApprove = autoApproveList(o);
    // precedence: explicit --env > --ghidra/--java-home/--provider > snapshot of the installer's environment
    const serverEnv = { ...(o.envSnapshot ? envSnapshot(env) : {}), ...providerEnv(o, plan), ...o.env };
    const entry = mcpEntry(o, rea, gatewayPath, autoApprove, serverEnv);
    if (Object.keys(serverEnv).length) plan.note("env", SERVER_NAME, `${Object.keys(serverEnv).join(", ")} (Cline passes only a minimal environment to MCP servers)`);
    const targets = selectTargets(mcpTargets(p, env), o.targets);
    if (!targets.length) plan.warn("No Cline installation detected for MCP registration; use --targets to name one.");
    for (const t of targets) {
      const text = existsSync(t.file) ? readFileSync(t.file, "utf8") : null;
      let merged;
      try { merged = mergeMcpSettings(text, entry); } catch (error) {
        plan.warn(`Skipped ${t.file}: cannot parse existing JSON (${error.message}). Fix it, then rerun.`);
        continue;
      }
      if (merged.previous && JSON.stringify(merged.previous.args) !== JSON.stringify(entry.args)) plan.note("replace-server", `${t.file}#${SERVER_NAME}`, "previous rea entry backed up");
      if (text !== null) plan.backup(t.file);
      plan.writeFile(t.file, merged.text);
      record.mcpFiles.push({ target: t.id, file: t.file, command: entry.command, args: entry.args });
    }
    if (o.scope === "project") plan.warn("Cline MCP servers are configured per user, not per project: the rea server was registered in your user-level Cline settings.");
  }

  const dirs = scopeDirs(o, p);

  // 4. skill: prefer the one shipped in the installed REA package (matches its version)
  if (o.skill) {
    const shipped = rea?.source === "runtime" || rea?.source === "entry" ? join(dirname(rea.entry), "..", "skills", "reverse-engineer-anything") : null;
    const src = shipped && existsSync(join(shipped, "SKILL.md")) && !o.dryRun ? shipped : join(KIT, "skills", "reverse-engineer-anything");
    const dst = join(dirs.skills, "reverse-engineer-anything");
    if (existsSync(dst) && !isOurs(dst)) plan.backup(dst);
    plan.copyDir(src, dst);
    if (!o.dryRun) writeFileSync(join(dst, `.${MARKER}`), `${PKG.version}\n`);
    record.files.push(dst);
  }
  // 5. rules
  if (o.rules) {
    const dst = join(dirs.rules, "rea-reverse-engineering.md");
    plan.writeFile(dst, `<!-- ${MARKER} -->\n${readFileSync(join(KIT, "rules", "rea-reverse-engineering.md"), "utf8")}`);
    record.files.push(dst);
  }
  // 6. workflows
  if (o.workflows) {
    for (const f of readdirSync(join(KIT, "workflows")).filter((n) => n.endsWith(".md")).sort()) {
      const dst = join(dirs.workflows, f);
      if (existsSync(dst) && !isOurs(dst)) { plan.warn(`Workflow ${dst} exists and is not managed by ${MARKER}; left unchanged.`); continue; }
      const content = readFileSync(join(KIT, "workflows", f), "utf8");
      plan.writeFile(dst, content.includes(MARKER) ? content : `<!-- ${MARKER} -->\n${content}`);
      record.files.push(dst);
    }
  }
  // 7. hooks
  if (o.hooks) record.files.push(...installHooks(dirs.hooks, plan));
  const hooksConfig = join(p.kitHome, "hooks-config.json");
  if (o.hooks && !existsSync(hooksConfig)) {
    plan.writeFile(hooksConfig, `${JSON.stringify({ serverNames: [SERVER_NAME], blockTools: [], warnMutating: true, requireCloseBeforeCompletion: true, routingHints: true, logCalls: true }, null, 2)}\n`);
  }

  // 8. record
  const all = loadInstallRecord(p);
  all.installs = all.installs.filter((r) => r.key !== record.key).concat(record);
  all.mode = o.mode; // read by the hooks for gateway/full hints
  if (!o.dryRun) { mkdirSync(p.kitHome, { recursive: true }); writeFileSync(join(p.kitHome, "install.json"), `${JSON.stringify(all, null, 2)}\n`); }

  return { plan, record, dirs };
}

export async function uninstall(o, env = process.env) {
  const p = paths(env);
  const plan = new Plan(o.dryRun);
  const all = loadInstallRecord(p);
  const key = recordKey(o);
  const rec = all.installs.find((r) => r.key === key);
  if (!rec) plan.warn(`No ${key} installation recorded in ${join(p.kitHome, "install.json")}.`);
  for (const f of rec?.files ?? []) {
    if (!existsSync(f)) continue;
    if (isOurs(f)) plan.remove(f); else plan.warn(`Not removing ${f}: no ${MARKER} marker (changed by someone else?).`);
  }
  const others = all.installs.filter((r) => r.key !== key);
  // only drop the MCP entry when no other install still relies on it
  if (rec && !others.some((r) => r.mcpFiles?.length)) {
    for (const m of rec.mcpFiles ?? []) {
      const s = readJson(m.file, null);
      const cur = s?.mcpServers?.[SERVER_NAME];
      if (!cur) continue;
      if (cur.command === m.command && JSON.stringify(cur.args) === JSON.stringify(m.args)) {
        plan.backup(m.file);
        delete s.mcpServers[SERVER_NAME];
        plan.writeFile(m.file, `${JSON.stringify(s, null, 2)}\n`);
      } else plan.warn(`Left ${m.file}#${SERVER_NAME} in place: it was changed after installation.`);
    }
  }
  all.installs = others;
  if (!o.dryRun) {
    if (o.purge && !others.length) plan.remove(p.kitHome);
    else if (existsSync(p.kitHome)) writeFileSync(join(p.kitHome, "install.json"), `${JSON.stringify(all, null, 2)}\n`);
  } else if (o.purge && !others.length) plan.note("remove", p.kitHome);
  return { plan };
}

export async function doctor(o, env = process.env) {
  const p = paths(env);
  const report = { node: { version: process.versions.node, ok: nodeSatisfiesRea() }, installs: [], mcp: [], server: null, reaDoctor: null };
  const all = loadInstallRecord(p);
  report.installs = all.installs.map((r) => ({ key: r.key, mode: r.mode, reaVersion: r.reaVersion, missing: (r.files ?? []).filter((f) => !existsSync(f)) }));
  for (const t of mcpTargets(p, env)) {
    if (!existsSync(t.file)) continue;
    const s = readJson(t.file, null);
    report.mcp.push({ target: t.id, file: t.file, parse: s !== null, rea: s?.mcpServers?.[SERVER_NAME] ? { disabled: !!s.mcpServers[SERVER_NAME].disabled, timeout: s.mcpServers[SERVER_NAME].timeout, autoApprove: s.mcpServers[SERVER_NAME].autoApprove?.length ?? 0 } : null });
  }
  const withEntry = report.mcp.find((m) => m.rea);
  if (withEntry) {
    const entry = readJson(withEntry.file, {}).mcpServers[SERVER_NAME];
    const { connectMcp } = await import("./lib/rea-mcp-client.mjs");
    const t0 = Date.now();
    try {
      const c = await connectMcp(entry.command, entry.args ?? [], { env: { ...process.env, ...(entry.env ?? {}) }, timeoutMs: 120000 });
      const tools = await c.listTools();
      let prompts = [];
      if (c.init.capabilities?.prompts) prompts = (await c.request("prompts/list", {})).prompts ?? [];
      report.server = { ok: true, ms: Date.now() - t0, serverInfo: c.init.serverInfo, tools: tools.length, toolNames: tools.slice(0, 5).map((x) => x.name), prompts: prompts.length };
      await c.close();
    } catch (error) {
      report.server = { ok: false, error: String(error.message).slice(0, 2000) };
    }
    const rec = all.installs.find((r) => r.rea?.entry) ?? null;
    if (rec?.rea) {
      const args = [...rec.rea.args, "doctor", "--json"];
      const r = spawnSync(rec.rea.command, args, { encoding: "utf8", timeout: 180000 });
      let parsed = null;
      try { parsed = JSON.parse(r.stdout); } catch { /* keep raw */ }
      report.reaDoctor = { command: [rec.rea.command, ...args].join(" "), exit: r.status, summary: parsed ? summarizeDoctor(parsed) : (r.stdout || r.stderr || "").slice(0, 1500) };
    }
  }
  const hooksDir = join(p.documents, "Cline", "Hooks");
  report.hooks = HOOK_NAMES.map((n) => {
    const f = join(hooksDir, process.platform === "win32" ? `${n}.ps1` : n);
    let executable = false;
    try { executable = process.platform === "win32" || (statSync(f).mode & 0o111) !== 0; } catch { /* missing */ }
    return { name: n, file: f, present: existsSync(f), ours: isOurs(f), executable };
  });
  return report;
}

function summarizeDoctor(d) {
  const pick = {};
  for (const k of ["status", "ready", "version", "providers", "summary", "checks"]) if (d[k] !== undefined) pick[k] = d[k];
  const s = JSON.stringify(Object.keys(pick).length ? pick : d);
  return s.length > 3000 ? `${s.slice(0, 3000)}…` : JSON.parse(s);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const HELP = `rea-cline-kit ${PKG.version} — install REA ${PKG.reaVersion} into Cline

  node scripts/install.mjs                      install globally (gateway mode, safe auto-approve)
  node scripts/install.mjs --mode full          expose all REA tools directly (large context)
  node scripts/install.mjs --project DIR        rules/workflows/hooks/skill into DIR (MCP stays user-level)
  node scripts/install.mjs --dry-run            show the plan, change nothing
  node scripts/install.mjs --doctor             check registration, start REA, run rea doctor
  node scripts/install.mjs --update [--rea-version latest]
  node scripts/install.mjs --uninstall [--project DIR] [--purge]

Options: --approve none|safe|nondestructive  --targets auto|all|vscode,cursor,windsurf,vscodium,vscode-insiders,trae,kiro,cli,jetbrains
         --rea-version X.Y.Z | --rea-entry /abs/rea.mjs | --use-path   --timeout SECONDS (<=3600)
         --env KEY=VALUE (REA_* settings, repeatable)   --no-mcp --no-skill --no-rules --no-workflows --no-hooks   --json`;

function printPlan(plan, o, extra) {
  if (o.json) { console.log(JSON.stringify({ dryRun: o.dryRun, actions: plan.actions, warnings: plan.warnings, ...extra }, null, 2)); return; }
  console.log(o.dryRun ? "Planned changes (dry run, nothing written):" : "Changes:");
  for (const a of plan.actions) console.log(`  ${a.kind.padEnd(14)} ${a.target}${a.detail ? `  (${a.detail})` : ""}`);
  for (const w of plan.warnings) console.log(`  ! ${w}`);
}

async function cli() {
  let o;
  try { o = parseArgs(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exit(2); }
  if (o.action === "help") { console.log(HELP); return; }
  if (o.action === "doctor") {
    const r = await doctor(o);
    if (o.json) { console.log(JSON.stringify(r, null, 2)); return; }
    console.log(`Node ${r.node.version}: ${r.node.ok ? "ok" : "NOT supported by REA"}`);
    for (const i of r.installs) console.log(`Install ${i.key}: mode=${i.mode} rea=${i.reaVersion}${i.missing.length ? ` missing ${i.missing.length} file(s): ${i.missing.join(", ")}` : " files ok"}`);
    for (const m of r.mcp) console.log(`MCP ${m.target}: ${m.file} ${m.parse ? "" : "(INVALID JSON) "}${m.rea ? `rea ${m.rea.disabled ? "DISABLED" : "enabled"}, timeout ${m.rea.timeout}s, autoApprove ${m.rea.autoApprove}` : "no rea entry"}`);
    if (r.server) console.log(r.server.ok ? `REA server: ${r.server.serverInfo?.name} ${r.server.serverInfo?.version} started in ${r.server.ms} ms, ${r.server.tools} tools, ${r.server.prompts} prompts` : `REA server FAILED: ${r.server.error}`);
    if (r.reaDoctor) console.log(`rea doctor (exit ${r.reaDoctor.exit}): ${typeof r.reaDoctor.summary === "string" ? r.reaDoctor.summary : JSON.stringify(r.reaDoctor.summary)}\n  rerun: ${r.reaDoctor.command}`);
    for (const h of r.hooks) if (h.present) console.log(`Hook ${h.name}: ${h.ours ? "rea-cline-kit" : "other"}${h.executable ? "" : " (NOT executable)"}`);
    if (!r.hooks.some((h) => h.present)) console.log("Hooks: none installed globally");
    return;
  }
  if (o.action === "uninstall") { const { plan } = await uninstall(o); printPlan(plan, o); return; }
  if (o.action === "update") {
    const prev = loadInstallRecord(paths()).installs.find((r) => r.key === recordKey(o));
    if (prev) { o.mode = prev.mode ?? o.mode; o.approve = prev.approve ?? o.approve; }
    if (o.reaVersion === "latest") {
      o.reaVersion = String(runNpm(["view", "rea-agents", "version"], { capture: true })).trim();
    }
  }
  const { plan, record, dirs } = await install(o);
  printPlan(plan, o, { record });
  if (!o.json && !o.dryRun) {
    console.log(`
Done. Next steps:
  1. Restart VS Code (or in Cline: MCP Servers > rea > Restart). Mode: ${o.mode}${o.mode === "gateway" ? " (2 tools: rea_find_tools, rea_call)" : " (all REA tools)"}.
  2. Hooks are on by default; if you turned them off, re-enable "Hooks" in Cline Settings > Features. Hooks dir: ${dirs.hooks}
  3. Skills: the Skills tab (scale icon under the chat box) should list reverse-engineer-anything.
  4. Try: /rea-javascript-app.md ${process.platform === "win32" ? "C:\\path\\to\\app" : "/absolute/path/to/app"}   or   /rea-investigate-feature.md feature="..." target_path=${process.platform === "win32" ? "C:\\abs\\target.exe" : "/abs/target"}
  5. Check anytime: node "${join(paths().kitHome, "kit", "scripts", "install.mjs")}" --doctor`);
  }
}

const normPath = (p) => { const r = resolve(p).replace(/\\/g, "/"); return process.platform === "win32" ? r.toLowerCase() : r; };
const invokedDirectly = process.argv[1] && normPath(process.argv[1]) === normPath(fileURLToPath(import.meta.url));
if (invokedDirectly) cli().catch((error) => { console.error(`rea-cline-kit: ${error.message}`); process.exit(1); });
