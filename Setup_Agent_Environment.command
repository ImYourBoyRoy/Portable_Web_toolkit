#!/usr/bin/env bash
# ./Setup_Agent_Environment.command
# Double-click launcher for macOS (repo root).
# Does NOT require Node.js — Setup_Agent_Environment.sh runs a Bash wizard that can install Node.
#
# Notes for macOS:
# - .command files do NOT get Admin privileges automatically from Finder.
#   This launcher announces that, then the bootstrap requests a GUI admin dialog + sudo.
# - Terminal stays open so password prompts and results remain visible.

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR" || exit 1

echo
echo "  Portable Web Toolkit — macOS setup"
echo "  =================================="
echo "  This launcher needs administrator access to install Node and tools."
echo "  After you press Y, macOS will show a password / admin dialog."
echo "  (Double-clicking a .command does not grant Admin by itself — that is normal.)"
echo

set +e
bash "$DIR/Setup_Agent_Environment.sh" "$@"
status=$?
set -e

echo
if [[ "$status" -eq 0 ]]; then
  echo "[SUCCESS] Setup finished. You can close this window."
else
  echo "[NOTICE] Setup exited with code $status. Review messages above."
  echo "  If admin/sudo was cancelled, rerun this .command and approve the password dialog."
fi
echo
# Keep Terminal open after double-click so results are readable.
# Skip pause for agent/--yes runs or non-interactive stdin.
if [[ -t 0 && " $* " != *" --yes "* && " $* " != *" --agent "* && " $* " != *" --non-interactive "* ]]; then
  read -r -p "Press Enter to close this window..." _
fi
exit "$status"
