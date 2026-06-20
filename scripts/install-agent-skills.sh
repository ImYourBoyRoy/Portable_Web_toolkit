#!/usr/bin/env bash
# ./scripts/install-agent-skills.sh
# Install this repo's agent skills for Cursor, Claude Code, Gemini CLI, Antigravity, Copilot, and more.
#
# Usage:
#   ./scripts/install-agent-skills.sh --agent all
#   ./scripts/install-agent-skills.sh --agent cursor --scope project
#   ./scripts/install-agent-skills.sh --repo-url https://github.com/imyourboyroy/pyenv-native
#
set -euo pipefail

AGENT="all"
SCOPE="user"
REPO_URL=""
REPO_ROOT=""
BRANCH="main"

usage() {
  sed -n '2,12p' "$0"
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --agent) AGENT="${2:-}"; shift 2 ;;
    --scope) SCOPE="${2:-}"; shift 2 ;;
    --repo-url) REPO_URL="${2:-}"; shift 2 ;;
    --repo-root) REPO_ROOT="${2:-}"; shift 2 ;;
    --branch) BRANCH="${2:-}"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

repo_slug() {
  local url="${1%.git}"
  url="${url%/}"
  basename "$url"
}

copy_skill_tree() {
  local src="$1" dest="$2"
  mkdir -p "$dest"
  for dir in "$src"/*/; do
    [[ -d "$dir" ]] || continue
    name="$(basename "$dir")"
    rm -rf "$dest/$name"
    cp -R "$dir" "$dest/$name"
    echo "    + $name"
  done
}

install_cursor() {
  local skills_src="$1"
  local dest
  if [[ "$SCOPE" == "project" ]]; then
    dest="$(pwd)/.cursor/skills"
  else
    dest="${HOME}/.cursor/skills"
  fi
  echo "  Cursor -> $dest"
  copy_skill_tree "$skills_src" "$dest"
  if [[ -d "$REPO_ROOT/agents" && "$SCOPE" == "user" ]]; then
    for f in "$REPO_ROOT/agents"/*.md; do
      [[ -f "$f" ]] || continue
      name="$(basename "${f%.md}")"
      mkdir -p "$dest/$name"
      cp "$f" "$dest/$name/SKILL.md"
      echo "    + $name (agent persona)"
    done
  fi
}

install_copilot() {
  local skills_src="$1"
  if [[ "$SCOPE" != "project" ]]; then
    echo "  Copilot: project scope only (.github/skills). Re-run with --scope project from a repo root."
    return 0
  fi
  local dest="$(pwd)/.github/skills"
  echo "  Copilot -> $dest"
  copy_skill_tree "$skills_src" "$dest"
}

install_kiro() {
  local skills_src="$1"
  local dest
  if [[ "$SCOPE" == "project" ]]; then
    dest="$(pwd)/.kiro/skills"
  else
    dest="${HOME}/.kiro/skills"
  fi
  echo "  Kiro -> $dest"
  copy_skill_tree "$skills_src" "$dest"
}

install_gemini() {
  local scope_args=()
  if [[ "$SCOPE" == "project" ]]; then
    scope_args=(--scope workspace)
  fi
  if command -v gemini >/dev/null 2>&1; then
    if [[ -n "$REPO_URL" ]]; then
      local url="$REPO_URL"
      [[ "$url" == *.git ]] || url="${url}.git"
      gemini skills install "$url" --path skills "${scope_args[@]}"
    else
      gemini skills install "$REPO_ROOT/skills/" "${scope_args[@]}"
    fi
  else
    echo "  Gemini CLI: 'gemini' not in PATH — manual:"
    if [[ -n "$REPO_URL" ]]; then
      local url="$REPO_URL"
      [[ "$url" == *.git ]] || url="${url}.git"
      echo "    gemini skills install $url --path skills ${scope_args[*]}"
    else
      echo "    gemini skills install $REPO_ROOT/skills/ ${scope_args[*]}"
    fi
  fi
}

install_antigravity() {
  if command -v agy >/dev/null 2>&1; then
    agy plugin install "$REPO_ROOT"
  else
    echo "  Antigravity: 'agy' not in PATH — manual:"
    echo "    agy plugin install $REPO_ROOT"
  fi
}

show_claude() {
  echo "  Claude Code:"
  if [[ -n "$REPO_URL" ]]; then
    echo "    /plugin marketplace add $REPO_URL"
    echo "    /plugin install $(basename "$REPO_ROOT")@$(basename "$REPO_ROOT")"
  fi
  echo "    Or: claude --plugin-dir \"$REPO_ROOT\""
  echo "    Docs: docs/agent-skills/claude-code.md"
}

show_windsurf() {
  echo "  Windsurf: copy skill content to .windsurfrules or Global Rules"
  echo "    Docs: docs/agent-skills/windsurf.md"
}

show_opencode() {
  echo "  OpenCode: open workspace with AGENTS.md + skills/ at $REPO_ROOT"
  echo "    Docs: docs/agent-skills/opencode.md"
}

if [[ -n "$REPO_URL" ]]; then
  slug="$(repo_slug "$REPO_URL")"
  cache="${HOME}/.agent-skills-cache/${slug}"
  if [[ -d "$cache/.git" ]]; then
    git -C "$cache" pull --ff-only
  else
    mkdir -p "$(dirname "$cache")"
    git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$cache"
  fi
  REPO_ROOT="$cache"
elif [[ -z "$REPO_ROOT" ]]; then
  REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
else
  REPO_ROOT="$(cd "$REPO_ROOT" && pwd)"
fi

SKILLS_SRC="$REPO_ROOT/skills"
if [[ ! -d "$SKILLS_SRC" ]]; then
  echo "No skills/ directory at $SKILLS_SRC" >&2
  exit 1
fi

display_url="${REPO_URL:-(local) $REPO_ROOT}"
echo "Installing agent skills from $display_url"
echo "Agent: $AGENT | Scope: $SCOPE"
echo ""

run_agent() {
  case "$1" in
    cursor) install_cursor "$SKILLS_SRC" ;;
    copilot) install_copilot "$SKILLS_SRC" ;;
    kiro) install_kiro "$SKILLS_SRC" ;;
    gemini) install_gemini ;;
    antigravity) install_antigravity ;;
    claude) show_claude ;;
    windsurf) show_windsurf ;;
    opencode) show_opencode ;;
    *) echo "Unknown agent: $1" >&2; exit 1 ;;
  esac
}

if [[ "$AGENT" == "all" ]]; then
  for a in cursor copilot kiro gemini antigravity claude windsurf opencode; do
    echo "[$a]"
    run_agent "$a"
    echo ""
  done
else
  echo "[$AGENT]"
  run_agent "$AGENT"
  echo ""
fi

echo "Done. See docs/agent-skills/README.md for per-agent details."
