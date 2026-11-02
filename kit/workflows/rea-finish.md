# REA workflow: Finish an investigation cleanly

Invoke with `/rea-finish.md [where to save evidence]`.

1. Check what is open: `binary_session` (gateway: `rea_call {"tool": "binary_session", "arguments": {}}`).
2. List open questions with `list_unknowns`; record any material unanswered question with `record_unknown`
   (or resolve with `update_unknown` + `verify_unknown_resolution` when Evidence answers it).
3. If the user wants the Evidence kept, export it with `export_evidence_bundle` to an absolute path the user
   confirms (it writes a file).
4. Call `close_binary`. Keep its `snapshot_path` if the user wants to resume analysis later
   (`open_binary` accepts `snapshot_path`).
5. Close any debugger/instrumentation sessions you started (`close_frida_session`, `close_gdb_session`,
   `close_rizin_debug_session`).
6. Summarize: Observations (with Evidence IDs), Inferences (confidence), Unknowns, and files written.
