#!/bin/sh
# rea-cline-kit: install REA (Reverse Engineer Anything) into Cline on macOS / Linux.
#   ./install.sh                 # global install, gateway mode, safe auto-approve
#   ./install.sh --mode full     # all REA tools exposed directly
#   ./install.sh --help          # every option
# Without a checkout next to this script it downloads the kit (branch "rea") first.
set -eu

REPO_TARBALL="${REA_CLINE_KIT_TARBALL:-https://codeload.github.com/nguyenhuyhoanganh/claude-learn/tar.gz/refs/heads/rea}"

if ! command -v node >/dev/null 2>&1; then
  echo "rea-cline-kit: Node.js is required (REA needs ^22.23.4, ^24.22.1 or >=26.12.1)." >&2
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "rea-cline-kit: npm is required to install the rea-agents package." >&2
  exit 1
fi

DIR=$(CDPATH= cd -- "$(dirname -- "$0")" 2>/dev/null && pwd || echo "")
if [ -z "$DIR" ] || [ ! -f "$DIR/scripts/install.mjs" ]; then
  TMP=$(mktemp -d 2>/dev/null || mktemp -d -t rea-cline-kit)
  trap 'rm -rf "$TMP"' EXIT INT TERM
  echo "Downloading rea-cline-kit ..."
  curl -fsSL "$REPO_TARBALL" | tar -xz -C "$TMP"
  DIR=$(find "$TMP" -mindepth 1 -maxdepth 1 -type d | head -n 1)
fi

exec node "$DIR/scripts/install.mjs" "$@"
