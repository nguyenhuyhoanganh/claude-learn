# REA workflow: Build an agent (RL) environment from a web app

Invoke with `/rea-build-environment.md <app URL or HAR path> <operations to cover> <output folder>`,
e.g. `/rea-build-environment.md http://127.0.0.1:3000 list/create/rename/delete folders ./my-env`

REA turns recorded API requests/responses into tools an agent can call (AgentEnv bundle). The environment
answers from recorded state and only supports writes whose effect the recording confirms.

## Step 1 — Read the guide first
Load the `reverse-engineer-anything` skill and read `references/environments.md` before recording.
Confirm with the user (ask_followup_question if unclear):
- the application URL (prefer a local/test instance) or an existing HAR/capture path (absolute);
- which operations to cover and whether you may create/remove test data (never touch existing data unless allowed);
- the output folder (absolute; must not already exist).

## Step 2a — From a live instance
Record each operation with `capture_browser_scenario` (declared actions; it drives a real browser — this is a
mutating tool, so state what it will click/type). Reset state between probes when the guide says so.

## Step 2b — From an existing capture
Inspect it with `inspect_web_network_capture` (HAR/SAZ/qlog) to confirm the requests you need are present.

## Step 3 — Export
Write the bundle with `export_environment_bundle` into the confirmed folder. CLI alternative the user can run
themselves: `rea environment-build ./session.har ./my-env --name my-env --json`, then `agent-env run ./my-env`
(requires AgentEnv and Docker).

## Step 4 — Report
List which tools answer from state, which only replay, and which writes were withheld and why; show how to run
the environment and where to add tasks and reward checks.
