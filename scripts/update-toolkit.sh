#!/usr/bin/env bash
# ./scripts/update-toolkit.sh
# Pull latest Portable_Web_toolkit, reinstall agent skills, verify toolkit health.
set -euo pipefail

AGENT="all"
SCOPE="user"
SKIP_GIT_PULL=0
REPO_ROOT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --agent) AGENT="$2"; shift 2 ;;
    --scope) SCOPE="$2"; shift 2 ;;
    --skip-git-pull) SKIP_GIT_PULL=1; shift ;;
    --repo-root) REPO_ROOT="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${REPO_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"

echo "[update-toolkit] Repo: $REPO_ROOT"

if [[ "$SKIP_GIT_PULL" -eq 0 && -d "$REPO_ROOT/.git" ]]; then
  echo "[update-toolkit] git pull --ff-only"
  git -C "$REPO_ROOT" pull --ff-only
fi

INSTALLER="$REPO_ROOT/scripts/install-agent-skills.sh"
chmod +x "$INSTALLER"
echo "[update-toolkit] Reinstall skills (agent=$AGENT scope=$SCOPE)"
"$INSTALLER" --repo-root "$REPO_ROOT" --agent "$AGENT" --scope "$SCOPE"

echo "[update-toolkit] toolkit-verify"
node "$REPO_ROOT/Web_Toolkit/toolkit_verify/bin/toolkit-verify.mjs"

echo "[update-toolkit] privacy-check"
node "$REPO_ROOT/Web_Toolkit/privacy_check/bin/privacy-check.mjs" scan --root "$REPO_ROOT/Web_Toolkit" --json

echo "[update-toolkit] Done. Re-run site-readiness on client projects if needed."
