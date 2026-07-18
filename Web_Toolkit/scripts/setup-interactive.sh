#!/usr/bin/env bash
# ./Web_Toolkit/scripts/setup-interactive.sh
#
# Interactive host setup menu for macOS/Linux — pure Bash, no Node required.
# Collects opt-in/out choices, then runs bootstrap.sh (which can install Node).
#
# Usage:
#   bash ./Web_Toolkit/scripts/setup-interactive.sh [--workspace <path>] [--non-interactive]
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOLKIT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MENU_PATH="$TOOLKIT_ROOT/Setup_agent_environment/config/setup-menu.json"
BOOTSTRAP_SH="$SCRIPT_DIR/bootstrap.sh"

WORKSPACE="$(pwd)"
NON_INTERACTIVE=false

usage() {
  cat <<'EOF'
setup-interactive.sh — host setup wizard (no Node required)

Usage:
  bash ./Web_Toolkit/scripts/setup-interactive.sh [--workspace <path>] [--non-interactive]

Notes:
  - Does not require Node.js. bootstrap.sh installs Node when missing.
  - Menu copy comes from Setup_agent_environment/config/setup-menu.json when readable.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --workspace)
      [[ $# -ge 2 ]] || { echo "[setup] --workspace requires a path" >&2; exit 1; }
      WORKSPACE="$(cd "$2" 2>/dev/null && pwd || printf '%s' "$2")"
      shift 2
      ;;
    --non-interactive)
      NON_INTERACTIVE=true
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

json_string_field() {
  local key="$1" file="$2" default="${3:-}"
  [[ -f "$file" ]] || { printf '%s' "$default"; return; }
  local line
  line="$(grep -m1 -E "\"$key\"[[:space:]]*:" "$file" 2>/dev/null || true)"
  if [[ -z "$line" ]]; then
    printf '%s' "$default"
    return
  fi
  printf '%s' "$line" | sed -E 's/^[[:space:]]*"[^"]+"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/'
}

ask_yes_no() {
  local prompt="$1"
  local default_yes="${2:-true}"
  local hint answer
  if [[ "$default_yes" == true ]]; then hint='Y/n'; else hint='y/N'; fi
  while true; do
    read -r -p "${prompt} [${hint}] " answer || answer=""
    answer="$(printf '%s' "$answer" | tr '[:upper:]' '[:lower:]' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    if [[ -z "$answer" ]]; then
      [[ "$default_yes" == true ]] && return 0 || return 1
    fi
    case "$answer" in
      y|yes) return 0 ;;
      n|no) return 1 ;;
      *) echo "  Please answer y or n." ;;
    esac
  done
}

TITLE="$(json_string_field title "$MENU_PATH" "Portable Web Toolkit — machine setup")"
SUBTITLE="$(json_string_field subtitle "$MENU_PATH" "Prepares your computer for Astro + Cloudflare development with AI coding agents.")"
ADMIN_NOTE="$(json_string_field adminNote "$MENU_PATH" "Installing missing tools may require administrator (Windows) or sudo (macOS/Linux).")"
PYENV_BLURB="$(json_string_field pyenvNativeBlurb "$MENU_PATH" "Python is managed exclusively by pyenv-native (\`pyenv\` CLI + pyenv-gui via \`pyenv gui\`).")"

# Optional tools: id|name|description|default_yes
OPTIONAL_DEFS=(
  "pnpm|pnpm|Fast Node package manager (optional; npm is included with Node)|false"
  "bun|Bun|Alternative JavaScript runtime and package manager|false"
  "uv|uv|Fast Python package installer (complements pyenv-native / pyenv-gui venvs)|false"
  "gh|GitHub CLI|GitHub from the terminal (repos, PRs, auth)|false"
  "dotnet|.NET SDK|Only if you work on .NET projects alongside web sites|false"
)

CORE_DESC="Git, Node.js 26+ (current line), pyenv-native (\`pyenv\` CLI) + pyenv-gui, Python 3.14+ workspace venv (3.13+ minimum), and pip — Python only via pyenv-native"

OPTIONAL_TOOLS=()
INSTALL_PLAYWRIGHT=false
SKIP_WORKSPACE_CHECKS=false

echo
echo "  $TITLE"
echo "  ===================================="
echo "  $SUBTITLE"
echo
echo "  $ADMIN_NOTE"
echo
echo "  About Python (pyenv-native + pyenv-gui)"
echo "  $PYENV_BLURB"
echo
echo "  [required] Core host tools"
echo "             $CORE_DESC"
echo "             (Node is installed by this wizard when missing — you do not need Node beforehand.)"
echo

if [[ "$NON_INTERACTIVE" == true ]]; then
  for def in "${OPTIONAL_DEFS[@]}"; do
    IFS='|' read -r id _name _desc _def <<<"$def"
    OPTIONAL_TOOLS+=("$id")
  done
  INSTALL_PLAYWRIGHT=true
  SKIP_WORKSPACE_CHECKS=false
else
  for def in "${OPTIONAL_DEFS[@]}"; do
    IFS='|' read -r id name desc default_yes <<<"$def"
    if ask_yes_no "Install ${name}? — ${desc}" "$default_yes"; then
      OPTIONAL_TOOLS+=("$id")
    fi
  done

  if ask_yes_no "Install Python Playwright + Chromium? — Browser automation inside your pyenv-native project venv" false; then
    INSTALL_PLAYWRIGHT=true
  fi

  if ask_yes_no "Project folder checks? — Verify README, package.json, Astro config, and related files in the target workspace" true; then
    SKIP_WORKSPACE_CHECKS=false
  else
    SKIP_WORKSPACE_CHECKS=true
  fi

  echo
  echo "  Summary"
  echo "  -------"
  echo "  Core host tools: yes (required; includes Node install when missing)"
  if [[ ${#OPTIONAL_TOOLS[@]} -gt 0 ]]; then
    echo "  Optional tools: $(IFS=','; echo "${OPTIONAL_TOOLS[*]}")"
  else
    echo "  Optional tools: (none)"
  fi
  echo "  Python Playwright: $([[ "$INSTALL_PLAYWRIGHT" == true ]] && echo yes || echo no)"
  echo "  Workspace checks: $([[ "$SKIP_WORKSPACE_CHECKS" == true ]] && echo skipped || echo yes)"
  echo "  Target workspace: $WORKSPACE"
  echo

  if ! ask_yes_no "Proceed with setup? Admin/sudo may be requested next" true; then
    echo "[setup] Cancelled — no changes made."
    exit 0
  fi
fi

[[ -f "$BOOTSTRAP_SH" ]] || { echo "[setup] Missing bootstrap: $BOOTSTRAP_SH" >&2; exit 1; }
[[ -x "$BOOTSTRAP_SH" ]] || chmod +x "$BOOTSTRAP_SH" || true

ARGS=(
  prepare-host
  --workspace "$WORKSPACE"
  --allow-installs true
  --install-optional-tools "$([[ ${#OPTIONAL_TOOLS[@]} -gt 0 ]] && echo true || echo false)"
  --install-python-playwright "$([[ "$INSTALL_PLAYWRIGHT" == true ]] && echo true || echo false)"
)

if [[ ${#OPTIONAL_TOOLS[@]} -gt 0 ]]; then
  joined="$(IFS=','; echo "${OPTIONAL_TOOLS[*]}")"
  ARGS+=(--optional-tools "$joined")
fi

if [[ "$SKIP_WORKSPACE_CHECKS" == true ]]; then
  ARGS+=(--skip-workspace-checks)
fi

echo
echo "[setup] Starting native bootstrap (Node will be installed if missing)..."
echo
bash "$BOOTSTRAP_SH" "${ARGS[@]}"
exit_code=$?

echo
if [[ "$exit_code" -eq 0 ]]; then
  echo "[SUCCESS] Setup completed."
else
  echo "[NOTICE] Setup finished with warnings or errors. See the output above."
fi
echo
exit "$exit_code"
