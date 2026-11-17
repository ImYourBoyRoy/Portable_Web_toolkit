#!/bin/bash
# ./Web_Toolkit/scripts/bootstrap.sh
# Native bootstrap for macOS/Linux host provisioning.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOLKIT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MANIFEST_PATH="$TOOLKIT_ROOT/Setup_agent_environment/config/host-bootstrap.manifest.json"
NODE_DOCTOR_PATH="$TOOLKIT_ROOT/Setup_agent_environment/bin/agent-env-setup.mjs"
COMMAND="prepare-host"
WORKSPACE="$(pwd)"
JSON_OUTPUT=false
SKIP_WORKSPACE_CHECKS=false
ALLOW_INSTALLS=true
INSTALL_OPTIONAL_TOOLS=true
INSTALL_PYTHON_PLAYWRIGHT=true
OPTIONAL_TOOLS=""
SUDO_KEEPALIVE_PID=""

# shellcheck source=lib/host-tools.sh
source "$SCRIPT_DIR/lib/host-tools.sh"

TMP_DIR="${TMPDIR:-/tmp}/portable-web-toolkit-bootstrap.$$"
mkdir -p "$TMP_DIR"
CURRENT_FILE="$TMP_DIR/current.jsonl"
INSTALLED_FILE="$TMP_DIR/installed.jsonl"
SKIPPED_FILE="$TMP_DIR/skipped.jsonl"
FAILED_FILE="$TMP_DIR/failed.jsonl"

cleanup() {
  [[ -n "$SUDO_KEEPALIVE_PID" ]] && kill "$SUDO_KEEPALIVE_PID" >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

json_escape() {
  local value="${1//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  value="${value//$'\r'/}"
  printf '%s' "$value"
}

report_add() {
  local bucket="$1" name="$2" required="${3:-}" before="${4:-}" after="${5:-}" source="${6:-}" status="${7:-}" details="${8:-}" next="${9:-}" kind="${10:-tool}"
  local file="$TMP_DIR/${bucket}.jsonl"
  printf '{"kind":"%s","name":"%s","requiredVersion":"%s","detectedBefore":"%s","detectedAfter":"%s","source":"%s","architecture":"%s","elevated":%s,"status":"%s","details":"%s","nextStep":"%s"}\n' \
    "$(json_escape "$kind")" "$(json_escape "$name")" "$(json_escape "$required")" "$(json_escape "$before")" "$(json_escape "$after")" "$(json_escape "$source")" \
    "$(json_escape "$(uname -m)")" "$( [[ "$(id -u)" -eq 0 ]] && printf true || printf false )" "$(json_escape "$status")" "$(json_escape "$details")" "$(json_escape "$next")" >> "$file"
}

report_array() {
  local file="$1"
  if [[ ! -s "$file" ]]; then printf '[]'; return; fi
  paste -sd, "$file" | sed 's/^/[/' | sed 's/$/]/'
}

is_windowsish() { [[ "$(uname -s)" =~ ^(MSYS|MINGW|CYGWIN) ]]; }
normalize_env_name() { local n; n="$(lower "$1" | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')"; printf '%s' "${n:-workspace}"; }

parse_args() {
  local args=("$@") i token
  if [[ ${#args[@]} -gt 0 && "${args[0]}" != --* ]]; then COMMAND="${args[0]}"; fi
  for ((i=0; i<${#args[@]}; i++)); do
    token="${args[$i]}"
    case "$token" in
      --workspace) [[ $((i+1)) -lt ${#args[@]} ]] && WORKSPACE="$(cd "${args[$((i+1))]}" 2>/dev/null && pwd || printf '%s' "${args[$((i+1))]}")" ;;
      --json) JSON_OUTPUT=true ;;
      --skip-workspace-checks) SKIP_WORKSPACE_CHECKS=true ;;
      --allow-installs) [[ $((i+1)) -lt ${#args[@]} ]] && [[ "$(lower "${args[$((i+1))]}")" =~ ^(1|true|yes|on)$ ]] && ALLOW_INSTALLS=true || ALLOW_INSTALLS=false ;;
      --install-optional-tools) [[ $((i+1)) -lt ${#args[@]} ]] && [[ "$(lower "${args[$((i+1))]}")" =~ ^(1|true|yes|on)$ ]] && INSTALL_OPTIONAL_TOOLS=true || INSTALL_OPTIONAL_TOOLS=false ;;
      --install-python-playwright) [[ $((i+1)) -lt ${#args[@]} ]] && [[ "$(lower "${args[$((i+1))]}")" =~ ^(1|true|yes|on)$ ]] && INSTALL_PYTHON_PLAYWRIGHT=true || INSTALL_PYTHON_PLAYWRIGHT=false ;;
      --optional-tools) [[ $((i+1)) -lt ${#args[@]} ]] && OPTIONAL_TOOLS="$(lower "${args[$((i+1))]}")" ;;
    esac
  done
  COMMAND="$(lower "$COMMAND")"
}

macos_has_gui_session() {
  # Double-clicked .command / local Terminal → GUI admin dialog.
  # SSH/CI → terminal sudo only (no Aqua dialog).
  [[ "$(uname -s)" == "Darwin" ]] || return 1
  [[ -z "${SSH_CONNECTION:-}" && -z "${CI:-}" ]] || return 1
  command -v osascript >/dev/null 2>&1 || return 1
  return 0
}

request_macos_admin_dialog() {
  # Shows the standard macOS GUI administrator password dialog (what users expect
  # from a double-clicked .command). Does not by itself grant a sudo ticket —
  # callers must still run `sudo -v` for shell installs.
  macos_has_gui_session || return 1
  osascript <<'APPLESCRIPT' >/dev/null
display dialog "Portable Web Toolkit needs administrator access to install Node.js and local agent tools.

Click Continue, then enter your Mac password when prompted." buttons {"Cancel", "Continue"} default button "Continue" with icon caution with title "Portable Web Toolkit Setup"
do shell script "/usr/bin/true" with administrator privileges
APPLESCRIPT
}

ensure_sudo() {
  [[ "$COMMAND" =~ ^(fix|prepare-host)$ ]] || return 0
  [[ "$ALLOW_INSTALLS" == true ]] || return 0
  [[ "$(id -u)" -eq 0 ]] && return 0
  command -v sudo >/dev/null 2>&1 || { report_add failed "sudo" "" "" "" "system" "failed" "sudo is required for automatic installs." "Install sudo or run as root."; return 1; }

  # Passwordless sudo (NOPASSWD, CI, containers): `sudo -v` would still demand a password, so test a real command first.
  if sudo -n true >/dev/null 2>&1; then
    report_add current "Administrator privileges" "" "granted" "granted" "sudo (passwordless)" "ready" "Elevation ready for installs without a password prompt"
    return 0
  fi

  echo
  if macos_has_gui_session; then
    echo "[Web Toolkit] Requesting macOS administrator privileges (GUI password dialog)..."
    if ! request_macos_admin_dialog; then
      report_add failed "Administrator privileges" "" "" "" "osascript" "failed" "User cancelled or denied macOS admin dialog." "Rerun Setup_Agent_Environment.command and approve administrator access when prompted."
      return 1
    fi
  elif [[ "$(uname -s)" == "Darwin" ]]; then
    echo "[Web Toolkit] No local GUI session (SSH/CI) — using terminal sudo for elevation."
  fi

  echo "[Web Toolkit] Caching sudo credentials for installs..."
  if ! sudo -v; then
    report_add failed "sudo" "" "" "" "system" "failed" "sudo authentication failed — installs cannot proceed without elevation." "Rerun setup and enter your password when prompted."
    return 1
  fi
  # Keep sudo ticket alive during long CLT / download waits.
  while true; do sudo -n true >/dev/null 2>&1 || exit; sleep 30; done &
  SUDO_KEEPALIVE_PID="$!"
  report_add current "Administrator privileges" "" "granted" "granted" "sudo/osascript" "ready" "Elevation ready for installs"
}

workspace_checks() {
  [[ "$SKIP_WORKSPACE_CHECKS" == true ]] && { report_add skipped "Workspace readiness" "" "" "" "filesystem" "skipped" "Flag disabled" "" workspace; return; }
  local package_json="$WORKSPACE/package.json"
  local has_preview=false has_validation=false has_astro=false
  if [[ -f "$package_json" ]]; then
    grep -q '"preview"' "$package_json" || grep -q '"dev"' "$package_json" && has_preview=true || true
    grep -q '"test"' "$package_json" || grep -q '"check"' "$package_json" && has_validation=true || true
  fi
  for cfg in astro.config.mjs astro.config.js astro.config.ts astro.config.cjs; do [[ -f "$WORKSPACE/$cfg" ]] && has_astro=true && break; done
  for pair in \
    "exists:$([[ -d "$WORKSPACE" ]] && echo true || echo false)" \
    "hasGitRepo:$([[ -d "$WORKSPACE/.git" ]] && echo true || echo false)" \
    "hasAgents:$([[ -f "$WORKSPACE/AGENTS.md" ]] && echo true || echo false)" \
    "hasReadme:$([[ -f "$WORKSPACE/README.md" ]] && echo true || echo false)" \
    "hasMemory:$([[ -f "$WORKSPACE/MEMORY.md" ]] && echo true || echo false)" \
    "hasEnvExample:$([[ -f "$WORKSPACE/.env.example" ]] && echo true || echo false)" \
    "hasPackageJson:$([[ -f "$package_json" ]] && echo true || echo false)" \
    "hasPreviewScript:$has_preview" \
    "hasValidationScript:$has_validation" \
    "hasAstroConfig:$has_astro"; do
    local key="${pair%%:*}" value="${pair#*:}"
    if [[ "$value" == true ]]; then report_add current "Workspace:$key" "" "" "$value" "filesystem" "present" "Workspace check for $key" "" workspace; else report_add failed "Workspace:$key" "" "" "$value" "filesystem" "missing" "Workspace check for $key" "" workspace; fi
  done
}

ensure_clt() {
  [[ "$(uname -s)" == "Darwin" ]] || return 0
  if xcode-select -p >/dev/null 2>&1; then
    report_add current "Xcode Command Line Tools" "" "installed" "installed" "xcode-select" "already-current" "Xcode Command Line Tools available"
    return 0
  fi
  echo "[Web Toolkit] Xcode Command Line Tools missing — triggering Apple installer dialog..."
  xcode-select --install >/dev/null 2>&1 || true
  # Wait up to ~10 minutes for the async Apple installer to finish (user must click Install).
  local waited=0
  while (( waited < 600 )); do
    if xcode-select -p >/dev/null 2>&1; then
      report_add installed "Xcode Command Line Tools" "" "missing" "installed" "xcode-select --install" "installed" "Xcode Command Line Tools became available"
      return 0
    fi
    sleep 5
    waited=$((waited + 5))
    if (( waited % 30 == 0 )); then
      echo "[Web Toolkit] Still waiting for Xcode Command Line Tools ($waited s). Complete the Apple dialog if it is open..."
    fi
  done
  report_add failed "Xcode Command Line Tools" "" "missing" "missing" "xcode-select --install" "failed" "CLT still missing after wait." "Open the Apple dialog, finish installing Command Line Tools, then rerun setup."
  return 1
}

linux_pkg_manager() {
  for pm in apt-get dnf yum pacman zypper; do command -v "$pm" >/dev/null 2>&1 && { printf '%s' "$pm"; return; }; done
  printf ''
}

linux_pkg_name() {
  local tool="$1" pm="$2"
  local suffix
  case "$pm" in
    apt-get) suffix="apt_package" ;;
    dnf) suffix="dnf_package" ;;
    yum) suffix="yum_package" ;;
    pacman) suffix="pacman_package" ;;
    zypper) suffix="zypper_package" ;;
    *) suffix="" ;;
  esac
  [[ -n "$suffix" ]] && manifest_get "tool.$tool.linux.$suffix" "" || printf ''
}

ensure_git_posix() {
  local before after
  before="$(command_version git --version || true)"
  [[ -n "$before" ]] && { report_add current "Git" "" "$before" "$before" "PATH" "already-current" "Git already available"; return; }
  local pm pkg
  pm="$(linux_pkg_manager)"
  case "$(uname -s)" in
    Darwin)
      # Git ships with Xcode CLT; the Apple installer is async — wait for it.
      if ! ensure_clt; then
        report_add failed "Git" "" "" "" "xcode-select" "failed" "Git unavailable because Xcode Command Line Tools are missing." "Finish the Apple CLT installer, then rerun setup."
        return 1
      fi
      hash -r
      after="$(command_version git --version || true)"
      if [[ -n "$after" ]]; then
        report_add installed "Git" "" "$before" "$after" "xcode-select" "installed" "Git available via Xcode Command Line Tools"
      else
        report_add failed "Git" "" "$before" "" "xcode-select" "failed" "CLT reported installed but git is still missing from PATH." "Open a new Terminal window or install Git manually, then rerun setup."
        return 1
      fi
      ;;
    Linux)
      pkg="$(linux_pkg_name git "$pm")"
      [[ -n "$pm" && -n "$pkg" ]] || { report_add failed "Git" "" "$before" "" "system" "failed" "No supported package manager entry for Git." "Install Git manually and rerun bootstrap."; return; }
      case "$pm" in
        apt-get) sudo apt-get update && sudo apt-get install -y "$pkg" ;;
        dnf) sudo dnf makecache && sudo dnf install -y "$pkg" ;;
        yum) sudo yum makecache && sudo yum install -y "$pkg" ;;
        pacman) sudo pacman -Sy --noconfirm "$pkg" ;;
        zypper) sudo zypper refresh && sudo zypper install -y "$pkg" ;;
      esac
      after="$(command_version git --version || true)"
      [[ -n "$after" ]] && report_add installed "Git" "" "$before" "$after" "$pm:$pkg" "installed" "Installed Git" || report_add failed "Git" "" "$before" "$after" "$pm:$pkg" "failed" "Git still missing after install attempt" "Install Git manually and rerun bootstrap."
      ;;
  esac
}

install_node_from_tarball() {
  local url="$1" install_root="$2" archive_name="$3" expected_sha="$4"
  local archive extract_dir version_tag actual_sha
  [[ -n "$url" && -n "$install_root" ]] || return 1
  archive="$TMP_DIR/$archive_name"
  echo "[Web Toolkit] Downloading $(basename "$url") from nodejs.org..."
  download_file "$url" "$archive" || return 1
  actual_sha="$(sha256_of "$archive" || true)"
  if [[ -z "$expected_sha" || "$actual_sha" != "$expected_sha" ]]; then
    echo "Checksum mismatch for $(basename "$url") (expected ${expected_sha:-none}, got ${actual_sha:-none}); not installing it." >&2
    return 1
  fi
  version_tag="$(basename "$url")"
  version_tag="${version_tag%.tar.gz}"
  version_tag="${version_tag%.tar.xz}"
  extract_dir="$install_root/$version_tag"
  sudo mkdir -p "$install_root" /usr/local/bin
  sudo rm -rf "$extract_dir"
  case "$archive" in
    *.tar.xz) sudo tar -xJf "$archive" -C "$install_root" ;;
    *.tar.gz|*.tgz) sudo tar -xzf "$archive" -C "$install_root" ;;
    *) echo "Unsupported archive: $archive" >&2; return 1 ;;
  esac
  [[ -x "$extract_dir/bin/node" ]] || { echo "Node binary missing in extracted tree: $extract_dir/bin/node" >&2; return 1; }
  sudo ln -sf "$extract_dir/bin/node" /usr/local/bin/node
  sudo ln -sf "$extract_dir/bin/npm" /usr/local/bin/npm
  sudo ln -sf "$extract_dir/bin/npx" /usr/local/bin/npx
  [[ -x "$extract_dir/bin/corepack" ]] && sudo ln -sf "$extract_dir/bin/corepack" /usr/local/bin/corepack || true
  # Ensure /usr/local/bin is on PATH for the rest of this session (common on fresh macOS).
  path_prepend /usr/local/bin
  hash -r
  return 0
}

ensure_node_posix() {
  local major required before after source_label install_root os installed=false latest_note
  major="$(node_major)"
  required="${major}.0.0"
  before="$(command_version node --version | sed 's/^v//' || true)"
  if ! node_needs_install; then
    report_add current "Node.js" "$major.x (latest)" "$before" "$before" "PATH" "already-current" "Node $before satisfies the Node $major line"
    report_add current "npm" "" "$(command_version npm --version || true)" "$(command_version npm --version || true)" "Node bundle" "already-current" "npm available with Node"
    report_add current "npx" "" "$(command_version npx --version || true)" "$(command_version npx --version || true)" "Node bundle" "already-current" "npx available with Node"
    return
  fi
  if ! resolve_latest_node; then
    report_add failed "Node.js" "$major.x (latest)" "$before" "" "nodejs.org" "failed" "Could not read the latest Node $major release list from nodejs.org." "Check network access to nodejs.org, then rerun setup."
    return 1
  fi
  latest_note="Node $NODE_LATEST_VERSION (latest $major.x)"
  os="$(uname -s)"
  source_label="nodejs.org"
  if [[ "$os" == "Darwin" ]]; then
    install_root="$(manifest_get "tool.node.macos.install_root" "/usr/local/lib/nodejs")"
    # The official tarball is primary (checksum verified); Homebrew is only a fallback. Fresh Macs often lack brew.
    if install_node_from_tarball "$NODE_LATEST_URL" "$install_root" "node-darwin.tar.gz" "$NODE_LATEST_SHA256"; then
      installed=true
    elif command -v brew >/dev/null 2>&1; then
      echo "[Web Toolkit] Official Node tarball failed; falling back to Homebrew..."
      brew install "$(manifest_get "tool.node.macos.brew_formula" "node")" && installed=true
      source_label="homebrew:node"
    fi
  else
    install_root="$(manifest_get "tool.node.linux.install_root" "/usr/local/lib/nodejs")"
    install_node_from_tarball "$NODE_LATEST_URL" "$install_root" "node-linux.tar.gz" "$NODE_LATEST_SHA256" && installed=true
  fi
  if [[ "$installed" != true ]]; then
    report_add failed "Node.js" "$major.x (latest)" "$before" "" "$source_label" "failed" "Could not install $latest_note (download, checksum or extraction failed)." "Approve admin/sudo when prompted, check network access to nodejs.org, then rerun setup."
    return 1
  fi
  hash -r
  after="$(command_version node --version | sed 's/^v//' || true)"
  if [[ -n "$after" ]] && version_ge "$after" "$required"; then
    report_add installed "Node.js" "$major.x (latest)" "$before" "$after" "$source_label" "installed-or-updated" "Installed $latest_note"
    report_add installed "npm" "" "" "$(command_version npm --version || true)" "Node bundle" "available" "npm available after Node install"
    report_add installed "npx" "" "" "$(command_version npx --version || true)" "Node bundle" "available" "npx available after Node install"
  else
    report_add failed "Node.js" "$major.x (latest)" "$before" "$after" "$source_label" "failed" "Node did not satisfy the Node $major line after install" "Install the latest Node $major release manually, then rerun bootstrap."
    return 1
  fi
}

# pnpm is the toolkit's package manager, so it is installed when missing (user space, no sudo): the official standalone
# installer, then npm into ~/.local as a fallback. An existing pnpm below the floor is updated with `pnpm self-update`.
ensure_pnpm_posix() {
  local required before after
  required="$(manifest_get "tool.pnpm.minimum_version" "10.0.0")"
  before="$(pnpm_version || true)"
  if [[ -n "$before" ]] && version_ge "$before" "$required"; then
    report_add current "pnpm" ">= $required" "$before" "$before" "PATH" "already-current" "pnpm $before is the toolkit package manager"
    return
  fi
  if [[ -n "$before" ]]; then pnpm self-update >/dev/null 2>&1 || true; fi
  after="$(pnpm_version || true)"
  if [[ -z "$after" ]] || ! version_ge "$after" "$required"; then
    download_pipe_sh "$(manifest_get "tool.pnpm.posix.install_url" "https://get.pnpm.io/install.sh")" >/dev/null 2>&1 || true
    add_pnpm_path; hash -r
    after="$(pnpm_version || true)"
  fi
  if [[ -z "$after" ]] || ! version_ge "$after" "$required"; then
    if command -v npm >/dev/null 2>&1 && npm install --global --prefix "$HOME/.local" pnpm >/dev/null 2>&1; then
      path_prepend "$HOME/.local/bin"; hash -r
      after="$(command_version pnpm --version || true)"
    fi
  fi
  if [[ -n "$after" ]] && version_ge "$after" "$required"; then
    report_add installed "pnpm" ">= $required" "$before" "$after" "get.pnpm.io" "installed-or-updated" "pnpm ready; open a new terminal if \`pnpm\` is not found"
  else
    report_add failed "pnpm" ">= $required" "$before" "$after" "get.pnpm.io" "failed" "pnpm could not be installed" "Run: npm install --global pnpm, then rerun setup."
  fi
}

# Enchi (formerly pyenv-native). An older pyenv-native is upgraded in place by `self-update`, or by the release installer.
ensure_enchi_posix() {
  local required before after
  required="$(manifest_get "tool.enchi.minimum_version" "0.8.0")"
  add_enchi_path
  before="$(enchi_version || true)"
  if [[ -n "$before" ]] && version_ge "$before" "$required"; then
    report_add current "Enchi" "$required" "$before" "$before" "PATH" "already-current" "Enchi CLI satisfies policy"
    return
  fi
  if [[ -n "$before" ]]; then invoke_enchi self-update >/dev/null 2>&1 || true; fi
  after="$(enchi_version || true)"
  if [[ -z "$after" ]] || ! version_ge "$after" "$required"; then
    download_pipe_sh "$(manifest_get "tool.enchi.posix.install_url" "https://github.com/imyourboyroy/pyenv-native/releases/latest/download/install.sh")" || true
    add_enchi_path; hash -r
    after="$(enchi_version || true)"
  fi
  if [[ -n "$after" ]] && version_ge "$after" "$required"; then
    report_add installed "Enchi" "$required" "$before" "$after" "github-release-installer/self-update" "installed-or-updated" "Enchi CLI ready; use \`enchi\` / \`enchi gui\`"
  else
    report_add failed "Enchi" "$required" "$before" "$after" "github-release-installer/self-update" "failed" "Enchi did not satisfy policy after install/update" "Install Enchi from the latest GitHub release (imyourboyroy/pyenv-native) and rerun bootstrap."
  fi
}

ensure_enchi_gui_posix() {
  local url target_dir target_path before expected actual
  add_enchi_path
  before=""
  enchi_gui_available && before="present"
  if [[ -n "$before" ]]; then
    report_add current "Enchi GUI" "" "$before" "$before" "enchi" "already-current" "Enchi GUI available; launch with \`enchi gui\`"
    return
  fi
  url="$(enchi_gui_download_url)"
  if [[ -z "$url" ]]; then
    report_add failed "Enchi GUI" "" "" "" "github-release" "failed" "No Enchi GUI download for this OS/arch" "See https://github.com/imyourboyroy/pyenv-native/blob/main/docs/GUI.md"
    return 1
  fi
  target_dir="$(dirname "$(resolve_enchi)")"
  [[ -n "$target_dir" && "$target_dir" != "." ]] || target_dir="$HOME/.enchi/bin"
  target_path="$target_dir/enchi-gui"
  mkdir -p "$target_dir"
  expected="$(download_text "$url.sha256" | awk '{print $1}' | head -n1 || true)"
  if download_file "$url" "$target_path.part" && actual="$(sha256_of "$target_path.part" || true)" && [[ -n "$expected" && "$actual" == "$expected" ]]; then
    chmod +x "$target_path.part" && mv "$target_path.part" "$target_path"
    add_enchi_path
    report_add installed "Enchi GUI" "" "" "present" "github-release" "installed" "Enchi GUI installed; launch with \`enchi gui\`"
    return
  fi
  rm -f "$target_path.part"
  report_add failed "Enchi GUI" "" "" "" "github-release" "failed" "Could not download and verify the Enchi GUI binary" "Download enchi-gui for your platform from the Enchi release assets and run \`enchi gui\`."
  return 1
}

ensure_python_runtime_posix() {
  local required desired before_python before_pip versions_output venv_name target_spec after_python after_pip
  required="$(manifest_get "tool.python.minimum_version")"
  desired="$(invoke_enchi latest "$(manifest_get "tool.python.desired_prefix")" 2>/dev/null | head -n1 || true)"
  [[ -n "$desired" ]] || desired="$(manifest_get "tool.python.fallback_version")"
  venv_name="$(normalize_env_name "$(basename "$WORKSPACE")")"
  before_python="$(command_version python --version || true)"
  before_pip="$(command_version pip --version || true)"
  versions_output="$(invoke_enchi versions 2>/dev/null || true)"
  grep -Fq "$desired" <<<"$versions_output" || invoke_enchi install "$desired"
  # Prefer the desired line as the user-global Python (latest installed for that prefix).
  invoke_enchi global "$desired" || true
  target_spec="$desired/envs/$venv_name"
  versions_output="$(invoke_enchi versions 2>/dev/null || true)"
  grep -Fq "$target_spec" <<<"$versions_output" || invoke_enchi venv create "$desired" "$venv_name"
  invoke_enchi --cwd "$WORKSPACE" local "$target_spec"
  invoke_enchi --cwd "$WORKSPACE" exec python -m pip install --upgrade pip
  after_python="$(invoke_enchi --cwd "$WORKSPACE" exec python --version | head -n1 || true)"
  after_pip="$(invoke_enchi --cwd "$WORKSPACE" exec python -m pip --version | head -n1 || true)"
  report_add installed "Python runtime" "$required" "$before_python" "$after_python" "enchi" "installed-or-selected" "Workspace bound to $target_spec; Enchi global set to $desired"
  report_add installed "pip" "" "$before_pip" "$after_pip" "enchi" "installed-or-updated" "pip upgraded inside the managed venv"
}

ensure_python_playwright_posix() {
  [[ "$INSTALL_PYTHON_PLAYWRIGHT" == true ]] || { report_add skipped "Python Playwright" "" "" "" "enchi venv" "skipped" "Flag disabled"; return; }
  local before
  before="$(invoke_enchi --cwd "$WORKSPACE" exec python -m playwright --version 2>/dev/null | head -n1 || true)"
  [[ -n "$before" ]] && { report_add current "Python Playwright" "" "$before" "$before" "enchi venv" "already-current" "Playwright already installed in the managed venv"; return; }
  local package browser after
  package="$(manifest_get "tool.python_playwright.package" "playwright")"
  browser="$(manifest_get "tool.python_playwright.browser" "chromium")"
  invoke_enchi --cwd "$WORKSPACE" exec python -m pip install "$package"
  invoke_enchi --cwd "$WORKSPACE" exec python -m playwright install "$browser"
  after="$(invoke_enchi --cwd "$WORKSPACE" exec python -m playwright --version | head -n1 || true)"
  report_add installed "Python Playwright" "" "$before" "$after" "enchi venv" "installed" "Installed $package + $browser"
}

optional_tool_selected() {
  local tool="$1"
  [[ "$INSTALL_OPTIONAL_TOOLS" == true ]] || return 1
  [[ "$tool" == "python-playwright" ]] && return 1
  [[ -z "$OPTIONAL_TOOLS" ]] && return 0
  local item
  IFS=',' read -r -a _optional_selected <<<"$OPTIONAL_TOOLS"
  for item in "${_optional_selected[@]}"; do
    [[ "${item// /}" == "$tool" ]] && return 0
  done
  return 1
}

ensure_optional_posix() {
  [[ "$INSTALL_OPTIONAL_TOOLS" == true ]] || { report_add skipped "Optional host tools" "" "" "" "manifest" "skipped" "Flag disabled"; return; }
  local tool_keys pm suffix formula pkg before after display command_name
  pm="$(linux_pkg_manager)"
  IFS=',' read -r -a tool_keys <<<"$(manifest_get "tool.optional.order")"
  for tool in "${tool_keys[@]}"; do
    [[ "$tool" == "python-playwright" ]] && continue
    optional_tool_selected "$tool" || { report_add skipped "$tool" "" "" "" "manifest" "skipped" "Not selected in setup menu"; continue; }
    display="$tool"; [[ "$tool" == "bun" ]] && display="Bun"; [[ "$tool" == "gh" ]] && display="GitHub CLI"; [[ "$tool" == "dotnet" ]] && display=".NET SDK"
    command_name="$tool"; [[ "$tool" == "dotnet" ]] && command_name="dotnet"
    before="$(command_version "$command_name" --version || true)"
    [[ -n "$before" ]] && { report_add current "$display" "" "$before" "$before" "PATH" "already-current" "$display already installed"; continue; }
    if [[ "$(uname -s)" == "Darwin" ]]; then
      formula="$(manifest_get "tool.$tool.macos.brew_formula")"
      [[ -n "$formula" ]] || { report_add skipped "$display" "" "" "" "manifest" "skipped" "No macOS package mapping configured"; continue; }
      # shellcheck disable=SC2086
      brew install $formula || { report_add failed "$display" "" "$before" "" "homebrew:$formula" "failed" "Homebrew failed to install $display" "Install $display manually if needed."; continue; }
      after="$(command_version "$command_name" --version || true)"
      report_add installed "$display" "" "$before" "$after" "homebrew:$formula" "installed" "Installed $display via Homebrew"
    else
      pkg="$(linux_pkg_name "$tool" "$pm")"
      [[ -n "$pm" && -n "$pkg" ]] || { report_add skipped "$display" "" "" "" "manifest" "skipped" "No Linux package mapping configured for $display"; continue; }
      case "$pm" in
        apt-get) sudo apt-get install -y "$pkg" ;;
        dnf) sudo dnf install -y "$pkg" ;;
        yum) sudo yum install -y "$pkg" ;;
        pacman) sudo pacman -S --noconfirm "$pkg" ;;
        zypper) sudo zypper install -y "$pkg" ;;
      esac || { report_add failed "$display" "" "$before" "" "$pm:$pkg" "failed" "$pm failed to install $display" "Install $display manually if needed."; continue; }
      after="$(command_version "$command_name" --version || true)"
      report_add installed "$display" "" "$before" "$after" "$pm:$pkg" "installed" "Installed $display"
    fi
  done
}

invoke_node_doctor() {
  is_windowsish && { report_add skipped "Node doctor" "" "" "" "agent-env-setup" "skipped" "Skipping Node doctor from a Windows POSIX compatibility shell"; return; }
  command -v node >/dev/null 2>&1 && [[ -f "$NODE_DOCTOR_PATH" ]] || { report_add skipped "Node doctor" "" "" "" "agent-env-setup" "skipped" "Node diagnostic tool unavailable after bootstrap"; return; }
  local args=("$NODE_DOCTOR_PATH" "doctor" "--workspace" "$WORKSPACE" "--json")
  [[ "$SKIP_WORKSPACE_CHECKS" == true ]] && args+=("--skip-workspace-checks")
  node "${args[@]}" >/dev/null 2>&1 && report_add current "Node doctor" "" "" "available" "agent-env-setup doctor" "post-bootstrap-diagnostic" "Node-based diagnostics remain available after native bootstrap" || report_add skipped "Node doctor" "" "" "" "agent-env-setup doctor" "skipped" "Native bootstrap completed but Node doctor could not be executed"
}

doctor_only() {
  local major node_version git_version enchi_ver pnpm_ver python_version pip_version enchi_required pnpm_required
  major="$(node_major)"
  enchi_required="$(manifest_get "tool.enchi.minimum_version" "0.8.0")"
  pnpm_required="$(manifest_get "tool.pnpm.minimum_version" "10.0.0")"
  git_version="$(command_version git --version || true)"
  node_version="$(command_version node --version | sed 's/^v//' || true)"
  add_enchi_path; add_pnpm_path
  enchi_ver="$(enchi_version || true)"
  pnpm_ver="$(pnpm_version || true)"
  python_version="$(command_version python --version || true)"
  pip_version="$(command_version pip --version || true)"
  [[ -n "$git_version" ]] && report_add current "Git" "" "$git_version" "$git_version" "PATH" "already-current" "Git available" || report_add failed "Git" "" "" "" "PATH" "missing" "Git not found in PATH"
  # Doctor never touches the network: it checks the Node major floor; `prepare-host` also brings the major to its latest release.
  if [[ -n "$node_version" ]] && version_ge "$node_version" "${major}.0.0"; then
    report_add current "Node.js" "$major.x" "$node_version" "$node_version" "PATH" "already-current" "Node satisfies the Node $major line"
  else
    report_add failed "Node.js" "$major.x" "$node_version" "" "PATH" "out-of-policy" "Node missing or below the required major"
  fi
  if [[ -n "$pnpm_ver" ]] && version_ge "$pnpm_ver" "$pnpm_required"; then
    report_add current "pnpm" ">= $pnpm_required" "$pnpm_ver" "$pnpm_ver" "PATH" "available" "pnpm available"
  else
    report_add failed "pnpm" ">= $pnpm_required" "$pnpm_ver" "" "PATH" "missing" "pnpm missing or too old; the toolkit's package manager. Run prepare-host to install it"
  fi
  if [[ -n "$enchi_ver" ]] && version_ge "$enchi_ver" "$enchi_required"; then
    report_add current "Enchi" "$enchi_required" "$enchi_ver" "$enchi_ver" "PATH" "available" "Enchi CLI available"
  elif [[ -n "$enchi_ver" ]]; then
    report_add failed "Enchi" "$enchi_required" "$enchi_ver" "" "PATH" "outdated" "Enchi (formerly pyenv-native) is below $enchi_required; prepare-host upgrades it in place"
  else
    report_add failed "Enchi" "$enchi_required" "" "" "PATH" "missing" "Enchi CLI not found; do not use system Python"
  fi
  if enchi_gui_available; then
    report_add current "Enchi GUI" "" "present" "present" "enchi" "available" "Enchi GUI available; launch with \`enchi gui\`"
  else
    report_add failed "Enchi GUI" "" "" "" "enchi" "missing" "Enchi GUI missing; install via bootstrap or the Enchi release assets"
  fi
  [[ -n "$python_version" ]] && report_add current "Python runtime" "$(manifest_get "tool.python.minimum_version")" "$python_version" "$python_version" "PATH/enchi" "available" "Python executable available under Enchi" || report_add failed "Python runtime" "$(manifest_get "tool.python.minimum_version")" "" "" "PATH/enchi" "missing" "Python executable not found under Enchi"
  [[ -n "$pip_version" ]] && report_add current "pip" "" "$pip_version" "$pip_version" "PATH/enchi" "available" "pip available" || report_add failed "pip" "" "" "" "PATH/enchi" "missing" "pip not found"
  workspace_checks
}

write_report() {
  local report_path json
  report_path="$TOOLKIT_ROOT/$(manifest_get "report.path" ".runtime/reports/setup-agent-environment.json")"
  mkdir -p "$(dirname "$report_path")"
  json="$(cat <<EOF
{"checkedAt":"$(date -u +"%Y-%m-%dT%H:%M:%SZ")","platform":"$(uname -s | tr '[:upper:]' '[:lower:]')","architecture":"$(uname -m)","command":"$(json_escape "$COMMAND")","workspace":"$(json_escape "$WORKSPACE")","elevated":$( [[ "$(id -u)" -eq 0 ]] && echo true || echo false ),"manifestPath":"$(json_escape "$MANIFEST_PATH")","reportPath":"$(json_escape "$report_path")","results":{"current":$(report_array "$CURRENT_FILE"),"installed":$(report_array "$INSTALLED_FILE"),"skipped":$(report_array "$SKIPPED_FILE"),"failed":$(report_array "$FAILED_FILE")}}
EOF
)"
  printf '%s\n' "$json" > "$report_path"
  if [[ "$JSON_OUTPUT" == true ]]; then printf '%s\n' "$json"; return; fi
  echo; echo "[Web Toolkit] Host bootstrap summary"; echo "  Command: $COMMAND"; echo "  Workspace: $WORKSPACE"; echo "  Report: $report_path"
  for bucket in current installed skipped failed; do
    echo; echo "  $bucket"
    local file="$TMP_DIR/$bucket.jsonl"
    [[ -s "$file" ]] || { echo "    - none"; continue; }
    while IFS= read -r line; do echo "    - $(printf '%s' "$line" | sed -E 's/.*\"name\":\"([^\"]+)\".*\"status\":\"([^\"]+)\".*\"details\":\"([^\"]*)\".*\"nextStep\":\"([^\"]*)\".*/\1: \2 | \3 | \4/' | sed 's/ | $//')"; done < "$file"
  done
}

main() {
  parse_args "$@"
  [[ -f "$MANIFEST_PATH" ]] || { echo "Manifest not found: $MANIFEST_PATH" >&2; exit 1; }
  if ! ensure_sudo; then
    echo "[Web Toolkit] ERROR: Administrator / sudo privileges are required for installs." >&2
    echo "[Web Toolkit] Approve the macOS password dialog (or enter sudo in the terminal), then rerun." >&2
    write_report
    exit 2
  fi
  case "$COMMAND" in
    doctor|verify) doctor_only ;;
    fix|prepare-host)
      if [[ "$ALLOW_INSTALLS" != true ]]; then report_add skipped "Install phase" "" "" "" "flags" "skipped" "Automatic installs disabled by flag"; workspace_checks; invoke_node_doctor; write_report; [[ -s "$FAILED_FILE" ]] && exit 2 || exit 0; fi
      # On macOS, CLT is required for Git (and useful for build tools). Fail visibly if missing.
      if [[ "$(uname -s)" == "Darwin" ]] && ! ensure_clt; then
        write_report
        exit 2
      fi
      ensure_git_posix || true
      ensure_node_posix || true
      ensure_pnpm_posix || true
      ensure_enchi_posix || true
      ensure_enchi_gui_posix || true
      ensure_python_runtime_posix || true
      ensure_optional_posix || true
      ensure_python_playwright_posix || true
      workspace_checks
      invoke_node_doctor
      ;;
    *) report_add failed "Bootstrap runtime" "" "" "" "bootstrap.sh" "failed" "Unknown bootstrap command: $COMMAND" ;;
  esac
  write_report
  [[ -s "$FAILED_FILE" ]] && exit 2 || exit 0
}

main "$@"
