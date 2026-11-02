# REA workflow: Check and repair the REA setup in Cline

Invoke with `/rea-doctor.md [what failed]`. Use this when REA tools are missing, REA could not start, a provider
(Ghidra/IDA/JADX/Hopper...) is unavailable, or calls time out.

The kit lives in `<home>/.cline/rea/kit`. Use the command form for the user's shell:
- Windows PowerShell: `node "$HOME\.cline\rea\kit\scripts\install.mjs" --doctor`
  (PowerShell does not expand `~` in arguments to `node`; use `$HOME`.)
- macOS/Linux: `node ~/.cline/rea/kit/scripts/install.mjs --doctor`
Below, `<kit-install>` means that `node ... install.mjs` prefix.

## Step 1 — Identify the failure (do not repeat setup for everything)
- **No `rea` server / no tools**: Cline > MCP Servers > Installed: is `rea` present and enabled? If it shows an
  error, read it. `<home>/.cline/rea/install.json` records the configured command.
- **REA could not start**: run `<kit-install> --doctor` (read-only). It starts the configured REA command exactly as
  Cline does, lists tools/prompts and runs `rea doctor --json`.
- **Provider missing** (native analysis): read the `rea doctor` checks printed by the kit doctor. REA never installs
  Ghidra/IDA/JADX/Java. On Windows only Ghidra (experimental, read-only, 12.1.x + JDK 21+) and IDA are native
  providers; Hopper is unavailable. Configure Ghidra with
  `<kit-install> --ghidra "C:\tools\ghidra_12.1.4_PUBLIC" --java-home "C:\Program Files\Java\jdk-21" --provider ghidra`.
  Variables set in your shell do NOT reach REA: Cline starts MCP servers with a minimal environment, so provider
  settings must be in the server's `env` (the installer writes them there).
- **Windows native control failures** (`windows_native_failure`, stage `load`): Smart App Control / App Control may
  block `rea-windows-x64.node`; reinstalling does not help — report it to the user.
- **Cline timed out** ("timed out awaiting" / MCP error -32001) but REA did not return an error: raise the server's
  `timeout` (seconds, max 3600) in `cline_mcp_settings.json` (or rerun `<kit-install> --timeout 1800`) and restart the
  server. Cold Ghidra imports can take minutes. Do not re-run the same analysis meanwhile.
- **REA returned `provider_timeout` or names an editable setting**: follow its remediation; use
  `update_analysis_settings` when the error names the setting and bounds.

## Step 2 — Repair
- Re-run the kit installer for the same scope (it keeps backups): `<kit-install>` (add `--mode full` or
  `--mode gateway` as before).
- Update REA itself: `<kit-install> --update` (Windows: close VS Code first, a running REA keeps its native addon locked).
- Restart the `rea` server in Cline (MCP Servers > rea > Restart) or reload the VS Code window.

## Step 3 — Resume
Return to the original task once the server lists its tools again. Ask the user to restart VS Code if a repair
needs it; do not loop on unchanged retries.
