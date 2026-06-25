#!/usr/bin/env bash
# ./Web_Toolkit/Setup_Agent_Environment.sh
# Interactive machine setup — uses repository root as workspace.

set -euo pipefail
TOOLKIT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$TOOLKIT/.." && pwd)"

echo
echo "  Portable Web Toolkit — Machine Setup"
echo "  ===================================="
echo "  This wizard shows what will be installed and lets you opt in or out."
echo "  sudo may be requested for missing tools."
echo

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js is required. Install from https://nodejs.org/ and rerun."
  exit 1
fi

node "$TOOLKIT/scripts/setup-interactive.mjs" --workspace "$REPO_ROOT" "$@"
exit_code=$?
echo
[[ "$exit_code" -eq 0 ]] && echo "[SUCCESS] Setup completed." || echo "[NOTICE] See output above."
exit "$exit_code"
