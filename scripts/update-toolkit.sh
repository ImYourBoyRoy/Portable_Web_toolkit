#!/usr/bin/env bash
# Compatibility wrapper. This command reports status and never mutates.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! command -v node >/dev/null 2>&1; then
  echo "Node is unavailable. Use the toolkit-update skill for manual comparison." >&2
  exit 2
fi
exec node "$SCRIPT_DIR/update-toolkit.mjs" "$@"
