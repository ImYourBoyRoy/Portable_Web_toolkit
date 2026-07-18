#!/usr/bin/env bash
# ./Web_Toolkit/Setup_Agent_Environment.sh
# Interactive machine setup — uses repository root as workspace.
# Pure Bash entry — does NOT require Node.js (bootstrap installs Node when missing).

set -euo pipefail
TOOLKIT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$TOOLKIT/.." && pwd)"

WIZARD="$TOOLKIT/scripts/setup-interactive.sh"
if [[ ! -f "$WIZARD" ]]; then
  echo "[ERROR] Missing setup wizard: $WIZARD" >&2
  exit 1
fi
chmod +x "$WIZARD" 2>/dev/null || true

exec bash "$WIZARD" --workspace "$REPO_ROOT" "$@"
