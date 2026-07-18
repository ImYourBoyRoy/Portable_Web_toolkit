#!/usr/bin/env bash
# ./Setup_Agent_Environment.sh
# Interactive machine setup for macOS and Linux (repo root launcher).
# Pure Bash entry — does NOT require Node.js (bootstrap installs Node when missing).
# Pass --yes or --agent for coding-agent runs (single confirmation skipped; sudo still prompts).

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

WIZARD="$ROOT/Web_Toolkit/scripts/setup-interactive.sh"
if [[ ! -f "$WIZARD" ]]; then
  echo "[ERROR] Missing setup wizard: $WIZARD" >&2
  exit 1
fi
chmod +x "$WIZARD" 2>/dev/null || true

exec bash "$WIZARD" --workspace "$ROOT" "$@"
