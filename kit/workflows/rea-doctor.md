# REA workflow: Check and repair the REA setup in Cline

Invoke with `/rea-doctor.md [what failed]`. Use this when REA tools are missing, REA could not start, a provider
(Hopper/Ghidra/IDA/JADX...) is unavailable, or calls time out.

## Step 1 — Identify the failure (do not repeat setup for everything)
- **No `rea` server / no tools**: Cline > MCP Servers > Installed: is `rea` present and enabled? If it shows an
  error, read it. Check `~/.cline/rea/install.json` for the configured command.
- **REA could not start**: run the kit doctor (read-only):
  `node ~/.cline/rea/kit/scripts/install.mjs --doctor`
  It starts the configured REA command, lists tools/prompts and runs `rea doctor --json`.
- **Provider missing** (native analysis): run `<node> <rea.mjs> doctor --json` (the exact command is printed by
  the kit doctor). REA never installs Ghidra/IDA/JADX/Java for you; Hopper can be installed by `rea setup`
  with approval. On Linux, Ghidra/JADX/JS analysis need a procps-compatible `ps` on PATH.
- **Cline timed out** ("timed out awaiting" / MCP error -32001) but REA did not return an error: raise the server's
  `timeout` (seconds, max 3600) in `cline_mcp_settings.json` and restart the server. Do not re-run the same
  analysis meanwhile.
- **REA returned `provider_timeout` or names an editable setting**: follow its remediation; use
  `update_analysis_settings` when the error names the setting and bounds.

## Step 2 — Repair
- Re-run the kit installer for the same scope (it keeps backups):
  `node ~/.cline/rea/kit/scripts/install.mjs --scope global` (add `--mode full` or `--mode gateway` as before).
- Update REA itself: `node ~/.cline/rea/kit/scripts/install.mjs --update` (reinstalls the pinned or `--rea-version` package).
- Restart the `rea` server in Cline (MCP Servers > rea > Restart) or reload the window.

## Step 3 — Resume
Return to the original task once the server lists its tools again. Ask the user to restart Cline if a repair
needs it; do not loop on unchanged retries.
