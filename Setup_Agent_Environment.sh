#!/usr/bin/env bash
# ./Setup_Agent_Environment.sh
# Interactive machine setup for macOS and Linux (repo root launcher).

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

echo
echo "  Portable Web Toolkit — Machine Setup"
echo "  ===================================="
echo "  This wizard shows what will be installed and lets you opt in or out."
echo "  sudo may be requested for missing tools."
echo

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js is required to run the setup wizard."
  echo "        Install Node from https://nodejs.org/ then run this script again."
  exit 1
fi

node "$ROOT/Web_Toolkit/scripts/setup-interactive.mjs" --workspace "$ROOT" "$@"
exit_code=$?

echo
if [[ "$exit_code" -ne 0 ]]; then
  echo "[NOTICE] Setup finished with warnings or errors. See the output above."
else
  echo "[SUCCESS] Setup completed."
fi
echo
exit "$exit_code"
