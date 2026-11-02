#!/bin/sh
# rea-cline-kit OFFLINE installer for macOS/Linux bundles: no npm, no network.
#   ./install-offline.sh [--dry-run] [any scripts/install.mjs option]
set -eu
DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if [ ! -f "$DIR/runtime/node_modules/rea-agents/package.json" ]; then
  echo "rea-cline-kit: runtime/node_modules/rea-agents is missing; extract the whole bundle and run this script from it." >&2
  exit 1
fi
NODE="$DIR/node/bin/node"
[ -x "$NODE" ] || NODE="$(command -v node || true)"
if [ -z "$NODE" ]; then
  echo "rea-cline-kit: no bundled node/bin/node and Node.js is not on PATH (needs ^22.23.4, ^24.22.1 or >=26.12.1)." >&2
  exit 1
fi
exec "$NODE" "$DIR/scripts/install.mjs" --offline "$@"
