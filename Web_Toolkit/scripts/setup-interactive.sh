#!/usr/bin/env bash
# ./Web_Toolkit/scripts/setup-interactive.sh
#
# Host setup for macOS/Linux — pure Bash, no Node required.
# Scans for missing/outdated agent tools, shows one list, then a single Y
# (or --yes / --agent) to continue. bootstrap.sh installs Node/pyenv/etc.
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

manifest_get() {
  local key="$1" default="${2:-}"
  local line
  [[ -f "$MANIFEST_PATH" ]] || { printf '%s' "$default"; return; }
  line="$(grep -m1 "\"$key\"" "$MANIFEST_PATH" 2>/dev/null || true)"
  [[ -z "$line" ]] && { printf '%s' "$default"; return; }
  printf '%s' "$line" | sed -E 's/^[[:space:]]*"[^"]+"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/'
}

version_ge() { [[ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n1)" == "$2" ]]; }

command_version() {
  command -v "$1" >/dev/null 2>&1 || return 1
  "$1" "${@:2}" 2>/dev/null | head -n1 | tr -d '\r'
}

resolve_pyenv() {
  if command -v pyenv >/dev/null 2>&1; then command -v pyenv; return; fi
  if [[ -x "$HOME/.pyenv/bin/pyenv" ]]; then printf '%s' "$HOME/.pyenv/bin/pyenv"; return; fi
  printf ''
}

pyenv_version() {
  local cmd ver
  cmd="$(resolve_pyenv)"
  [[ -n "$cmd" ]] || return 1
  ver="$("$cmd" --version 2>/dev/null | head -n1 || true)"
  ver="${ver##* }"
  [[ -n "$ver" ]] || return 1
  printf '%s' "$ver"
}

pyenv_gui_available() {
  local bin_name="pyenv-gui"
  command -v "$bin_name" >/dev/null 2>&1 && return 0
  [[ -x "$HOME/.pyenv/bin/$bin_name" ]] && return 0
  local cmd
  cmd="$(resolve_pyenv)"
  [[ -n "$cmd" ]] || return 1
  "$cmd" gui --help >/dev/null 2>&1
}

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

TOOLKIT_VERSION="$(tr -d '[:space:]' < "$REPO_ROOT/VERSION" 2>/dev/null || echo unknown)"
NODE_REQUIRED="$(manifest_get "tool.node.required_version" "26.0.0")"
PYENV_REQUIRED="$(manifest_get "tool.pyenv_native.minimum_version" "0.2.30")"
PYTHON_REQUIRED="$(manifest_get "tool.python.minimum_version" "3.13.0")"

GAPS=()
OK_LINES=()

add_gap() { GAPS+=("$1"); }
add_ok() { OK_LINES+=("$1"); }

# --- scan ---
GIT_VER="$(command_version git --version || true)"
if [[ -n "$GIT_VER" ]]; then
  add_ok "Git — $GIT_VER"
else
  add_gap "Git — not installed"
fi

NODE_VER="$(command_version node --version 2>/dev/null | sed 's/^v//' || true)"
if [[ -n "$NODE_VER" ]] && version_ge "$NODE_VER" "$NODE_REQUIRED"; then
  add_ok "Node.js — $NODE_VER (requires >= $NODE_REQUIRED)"
else
  if [[ -n "$NODE_VER" ]]; then
    add_gap "Node.js — installed $NODE_VER (requires >= $NODE_REQUIRED)"
  else
    add_gap "Node.js — not installed (requires >= $NODE_REQUIRED)"
  fi
fi

PYENV_VER="$(pyenv_version || true)"
if [[ -n "$PYENV_VER" ]] && version_ge "$PYENV_VER" "$PYENV_REQUIRED"; then
  add_ok "pyenv-native (pyenv) — $PYENV_VER"
else
  if [[ -n "$PYENV_VER" ]]; then
    add_gap "pyenv-native (pyenv) — installed $PYENV_VER (requires >= $PYENV_REQUIRED)"
  else
    add_gap "pyenv-native (pyenv) — not installed (requires >= $PYENV_REQUIRED)"
  fi
fi

if pyenv_gui_available; then
  add_ok "pyenv-gui — present (launch: pyenv gui)"
else
  add_gap "pyenv-gui — not installed (launch after setup: pyenv gui)"
fi

# Python/pip count as healthy only when pyenv-native is available (policy: pyenv-native-only).
PY_VER=""
if [[ -n "${PYENV_VER:-}" ]]; then
  PY_VER="$(command_version python --version 2>/dev/null | sed -E 's/^Python[[:space:]]+//' || true)"
  if [[ -z "$PY_VER" ]]; then
    PY_VER="$(command_version python3 --version 2>/dev/null | sed -E 's/^Python[[:space:]]+//' || true)"
  fi
fi
if [[ -n "$PYENV_VER" && -n "$PY_VER" ]] && version_ge "$PY_VER" "$PYTHON_REQUIRED"; then
  add_ok "Python — $PY_VER (via pyenv-native; requires >= $PYTHON_REQUIRED)"
else
  add_gap "Python — not installed or not under pyenv-native (requires >= $PYTHON_REQUIRED)"
fi

if [[ -n "$PYENV_VER" ]] && command_version pip --version >/dev/null 2>&1; then
  add_ok "pip — $(command_version pip --version | head -c 80)"
else
  add_gap "pip — not installed under pyenv-native workspace venv"
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
echo "  Setup will install/update the agent baseline (Git, Node, pyenv-native,"
echo "  pyenv-gui, Python workspace venv, pip). sudo may ask for your password."
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
echo "[setup] Starting bootstrap (password/admin prompts may appear next)..."
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

bash "$BOOTSTRAP_SH" "${ARGS[@]}"
exit_code=$?

echo
if [[ "$exit_code" -eq 0 ]]; then
  echo "[SUCCESS] Local agent environment setup completed."
else
  echo "[NOTICE] Setup finished with warnings or errors. See the output above."
fi
echo
exit "$exit_code"
