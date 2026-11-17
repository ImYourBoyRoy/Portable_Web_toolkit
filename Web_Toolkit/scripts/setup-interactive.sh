#!/usr/bin/env bash
# ./Web_Toolkit/scripts/setup-interactive.sh
#
# Host setup for macOS/Linux — pure Bash, no Node required.
# Scans for missing/outdated agent tools, shows one list, then a single Y
# (or --yes / --agent) to continue. bootstrap.sh installs Node/pnpm/Enchi/etc.
# and will prompt for sudo when elevation is needed.
#
# Usage:
#   bash ./Web_Toolkit/scripts/setup-interactive.sh [--workspace <path>] [--yes|--agent]
#   ./Setup_Agent_Environment.sh --yes
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOLKIT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MANIFEST_PATH="$TOOLKIT_ROOT/Setup_agent_environment/config/host-bootstrap.manifest.json"
BOOTSTRAP_SH="$SCRIPT_DIR/bootstrap.sh"
REPO_ROOT="$(cd "$TOOLKIT_ROOT/.." && pwd)"

# shellcheck source=lib/host-tools.sh
source "$SCRIPT_DIR/lib/host-tools.sh"

WORKSPACE="$(pwd)"
AUTO_YES=false

usage() {
  cat <<'EOF'
setup-interactive.sh — local agent environment setup (no Node required)

Usage:
  bash ./Web_Toolkit/scripts/setup-interactive.sh [options]

Options:
  --workspace <path>   Target workspace (default: cwd)
  --yes, --agent       Skip the confirmation prompt (for coding agents)
  -h, --help           Show this help

Behavior:
  1. Scans for missing/outdated required tools
  2. Lists gaps (or reports all current)
  3. Asks once: press Y to continue (unless --yes/--agent)
  4. Runs bootstrap.sh — sudo password prompt appears when needed

Agent example:
  bash ./Setup_Agent_Environment.sh --yes --workspace .
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --workspace)
      [[ $# -ge 2 ]] || { echo "[setup] --workspace requires a path" >&2; exit 1; }
      WORKSPACE="$(cd "$2" 2>/dev/null && pwd || printf '%s' "$2")"
      shift 2
      ;;
    --yes|--agent|--non-interactive)
      AUTO_YES=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[setup] Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

ask_yes_no() {
  local prompt="$1"
  local answer
  while true; do
    read -r -p "${prompt} [Y/n] " answer || answer=""
    answer="$(printf '%s' "$answer" | tr '[:upper:]' '[:lower:]' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    [[ -z "$answer" || "$answer" == y || "$answer" == yes ]] && return 0
    [[ "$answer" == n || "$answer" == no ]] && return 1
    echo "  Please answer Y or n."
  done
}

# --- the setup engine, when present or downloadable for this version; otherwise the scripts below do the work ---
ENGINE="$(find_engine || true)"
if [[ -z "$ENGINE" && "${TOOLKIT_SETUP_LEGACY:-}" != "1" ]]; then
  if fetch_engine; then ENGINE="$(find_engine || true)"; fi
fi
if [[ -n "$ENGINE" ]]; then
  echo
  echo "[setup] Using the setup engine: $ENGINE (set TOOLKIT_SETUP_LEGACY=1 for the shell scripts instead)"
  "$ENGINE" --toolkit-root "$TOOLKIT_ROOT" --workspace "$WORKSPACE" plan
  if "$ENGINE" --toolkit-root "$TOOLKIT_ROOT" --workspace "$WORKSPACE" plan --json | grep -Eq '"status": "(missing|outdated)"'; then
    if [[ "$AUTO_YES" != true ]] && ! ask_yes_no "Press Y to install or update the items above"; then
      echo "[setup] Cancelled — no changes made."
      exit 0
    fi
    exec "$ENGINE" --toolkit-root "$TOOLKIT_ROOT" --workspace "$WORKSPACE" install
  fi
  echo "[SUCCESS] Nothing to install. Local agent environment is ready."
  exit 0
fi

TOOLKIT_VERSION="$(tr -d '[:space:]' < "$REPO_ROOT/VERSION" 2>/dev/null || echo unknown)"
NODE_MAJOR="$(node_major)"
ENCHI_REQUIRED="$(manifest_get "tool.enchi.minimum_version" "0.8.0")"
PNPM_REQUIRED="$(manifest_get "tool.pnpm.minimum_version" "10.0.0")"
PYTHON_REQUIRED="$(manifest_get "tool.python.minimum_version" "3.13.0")"

GAPS=()
OK_LINES=()

add_gap() { GAPS+=("$1"); }
add_ok() { OK_LINES+=("$1"); }

add_enchi_path
add_pnpm_path

# --- scan ---
GIT_VER="$(command_version git --version || true)"
if [[ -n "$GIT_VER" ]]; then
  add_ok "Git — $GIT_VER"
else
  add_gap "Git — not installed"
fi

# Node: the required major comes from .node-version; the release is whatever nodejs.org lists as latest for that major.
NODE_VER="$(command_version node --version 2>/dev/null | sed 's/^v//' || true)"
if node_needs_install; then
  if [[ -z "$NODE_VER" ]]; then
    add_gap "Node.js — not installed (latest Node $NODE_MAJOR.x will be installed)"
  elif resolve_latest_node 2>/dev/null; then
    add_gap "Node.js — installed $NODE_VER (latest $NODE_MAJOR.x is $NODE_LATEST_VERSION)"
  else
    add_gap "Node.js — installed $NODE_VER (requires Node $NODE_MAJOR or newer)"
  fi
else
  add_ok "Node.js — $NODE_VER (Node $NODE_MAJOR line)"
fi

PNPM_VER="$(pnpm_version || true)"
if [[ -n "$PNPM_VER" ]] && version_ge "$PNPM_VER" "$PNPM_REQUIRED"; then
  add_ok "pnpm — $PNPM_VER"
elif [[ -n "$PNPM_VER" ]]; then
  add_gap "pnpm — installed $PNPM_VER (requires >= $PNPM_REQUIRED)"
else
  add_gap "pnpm — not installed (the toolkit's package manager)"
fi

ENCHI_VER="$(enchi_version || true)"
if [[ -n "$ENCHI_VER" ]] && version_ge "$ENCHI_VER" "$ENCHI_REQUIRED"; then
  add_ok "Enchi — $ENCHI_VER"
elif [[ -n "$ENCHI_VER" ]]; then
  add_gap "Enchi — installed $ENCHI_VER (requires >= $ENCHI_REQUIRED; upgrades in place from pyenv-native)"
else
  add_gap "Enchi — not installed (requires >= $ENCHI_REQUIRED)"
fi

if enchi_gui_available; then
  add_ok "Enchi GUI — present (launch: enchi gui)"
else
  add_gap "Enchi GUI — not installed (launch after setup: enchi gui)"
fi

# Python/pip count as healthy only when Enchi is available (policy: Enchi-only).
PY_VER=""
if [[ -n "${ENCHI_VER:-}" ]]; then
  PY_VER="$(command_version python --version 2>/dev/null | sed -E 's/^Python[[:space:]]+//' || true)"
  if [[ -z "$PY_VER" ]]; then
    PY_VER="$(command_version python3 --version 2>/dev/null | sed -E 's/^Python[[:space:]]+//' || true)"
  fi
fi
if [[ -n "$ENCHI_VER" && -n "$PY_VER" ]] && version_ge "$PY_VER" "$PYTHON_REQUIRED"; then
  add_ok "Python — $PY_VER (via Enchi; requires >= $PYTHON_REQUIRED)"
else
  add_gap "Python — not installed or not under Enchi (requires >= $PYTHON_REQUIRED)"
fi

if [[ -n "$ENCHI_VER" ]] && command_version pip --version >/dev/null 2>&1; then
  add_ok "pip — $(command_version pip --version | head -c 80)"
else
  add_gap "pip — not installed under the Enchi workspace venv"
fi

echo
echo "  Portable Web Toolkit — Local Agent Environment"
echo "  Toolkit version: $TOOLKIT_VERSION"
echo "  Workspace: $WORKSPACE"
echo

if [[ ${#GAPS[@]} -eq 0 ]]; then
  echo "  All required local agent tools look current:"
  for line in "${OK_LINES[@]}"; do echo "    ✓ $line"; done
  echo
  echo "[SUCCESS] Nothing to install. Local agent environment is ready."
  exit 0
fi

echo "  The following software is not installed or is outdated:"
echo
for line in "${GAPS[@]}"; do
  echo "    • $line"
done
echo
if [[ ${#OK_LINES[@]} -gt 0 ]]; then
  echo "  Already current:"
  for line in "${OK_LINES[@]}"; do echo "    ✓ $line"; done
  echo
fi
echo "  Setup will install/update the agent baseline (Git, Node, pnpm, Enchi,"
echo "  Enchi GUI, Python workspace venv, pip)."
if [[ "$(uname -s)" == "Darwin" ]]; then
  echo "  On macOS: a GUI administrator dialog appears next (then possibly sudo)."
  echo "  Node installs from the official nodejs.org tarball, checksum verified (Homebrew not required)."
else
  echo "  sudo may ask for your password."
fi
echo

if [[ "$AUTO_YES" != true ]]; then
  if ! ask_yes_no "Press Y to continue setting up the local agent environment"; then
    echo "[setup] Cancelled — no changes made."
    exit 0
  fi
else
  echo "[setup] --yes/--agent: continuing without confirmation prompt."
fi

[[ -f "$BOOTSTRAP_SH" ]] || { echo "[setup] Missing bootstrap: $BOOTSTRAP_SH" >&2; exit 1; }
[[ -x "$BOOTSTRAP_SH" ]] || chmod +x "$BOOTSTRAP_SH" || true

echo
if [[ "$(uname -s)" == "Darwin" ]]; then
  echo "[setup] Starting bootstrap — approve the macOS admin password dialog when it appears..."
else
  echo "[setup] Starting bootstrap (sudo password prompt may appear next)..."
fi
echo

# Core agent environment only — no per-tool optional menu.
# Playwright is included for agent browser tooling.
ARGS=(
  prepare-host
  --workspace "$WORKSPACE"
  --allow-installs true
  --install-optional-tools false
  --install-python-playwright true
)

# `set -e` would end this script on a failed bootstrap and skip the summary; capture the status instead of trusting it.
if bash "$BOOTSTRAP_SH" "${ARGS[@]}"; then exit_code=0; else exit_code=$?; fi

echo
if [[ "$exit_code" -eq 0 ]]; then
  echo "[SUCCESS] Local agent environment setup completed."
else
  echo "[NOTICE] Setup finished with warnings or errors. See the output above."
fi
echo
exit "$exit_code"
