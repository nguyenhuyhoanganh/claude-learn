# REA workflow: Analyze a JavaScript / Electron application

Invoke with `/rea-javascript-app.md <absolute path to the app, ASAR or extracted tree> [question]`,
e.g. `/rea-javascript-app.md /Applications/Notion.app how does copy-to-clipboard reach the main process?`

Static analysis only: REA reads the files and never runs the application.

## Step 1 — Locate the input
1. Take the path from the user's message; ask with `ask_followup_question` if it is missing. It must be absolute.
2. For a macOS `.app`, look for `Contents/Resources/app.asar` (or an `app/` directory); on Windows/Linux look for
   `resources/app.asar`. Use `list_files` / `search_files` to find it; pass the ASAR or the extracted tree itself.

## Step 2 — Reconstruct the application graph
- Gateway mode: `rea_find_tools {"names": ["analyze_javascript_application"]}` once, then
  `rea_call {"tool": "analyze_javascript_application", "arguments": {"input_path": "<abs path>"}}`.
- Full mode: call `analyze_javascript_application` on server `rea` with `input_path`.
- Large app: start with the summary; page modules/sections with `inspect_analysis_view` and the returned
  `evidence_id` instead of re-running the analysis. Narrow with `source_paths` when you already know the files.

## Step 3 — Follow the feature
- Once you know a seed (route, IPC channel, module, string, native export), call `trace_application_feature`.
- For data flow inside modules use `trace_javascript_semantics`; for export return shapes
  `compare_javascript_export_shapes`; for minified bundles with source maps `recover_javascript_sources`
  (writes into a new, caller-chosen absolute `output_directory` — confirm the directory with the user).
- Electron security posture: `inspect_electron_fuses` on the executable.
- Runtime confirmation (only if the user asks and authorizes running it): `capture_electron_scenario`, or attach
  to an already-running Inspector with `list_javascript_runtime_targets` + `observe_javascript_runtime`,
  then `reconcile_javascript_runtime` with the static graph.

## Step 4 — Report
Explain the feature path (renderer → preload → IPC → main → native, as applicable) with cited Evidence IDs,
mark inferences and unknowns, and, if asked, implement an equivalent in the user's project without copying
proprietary code verbatim.

Guide: the `reverse-engineer-anything` skill, section on JavaScript applications
(`references/javascript-applications.md`).
