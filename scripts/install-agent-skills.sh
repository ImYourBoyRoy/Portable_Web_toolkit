#!/usr/bin/env bash
# Compatibility wrapper. This command is intentionally read-only.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "Node is unavailable. Follow docs/agent-skills/INSTALL_PROTOCOL.md manually." >&2
  exit 2
fi

exec node "$SCRIPT_DIR/install-agent-skills.mjs" "$@"
