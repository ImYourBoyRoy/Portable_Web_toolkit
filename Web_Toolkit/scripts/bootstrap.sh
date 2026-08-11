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

manifest_get() {
  local key="$1" default="${2:-}"
  local line
  line="$(grep -m1 "\"$key\"" "$MANIFEST_PATH" || true)"
  [[ -z "$line" ]] && { printf '%s' "$default"; return; }
  printf '%s' "$line" | sed -E 's/^[[:space:]]*"[^"]+"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/'
}

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

version_ge() { [[ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n1)" == "$2" ]]; }
is_windowsish() { [[ "$(uname -s)" =~ ^(MSYS|MINGW|CYGWIN) ]]; }
command_version() { command -v "$1" >/dev/null 2>&1 || return 1; "$1" "${@:2}" 2>/dev/null | head -n1 | tr -d '\r'; }
normalize_env_name() { local n; n="$(printf '%s' "${1,,}" | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')"; printf '%s' "${n:-workspace}"; }

download_file() {
  local url="$1" dest="$2"
  if command -v curl >/dev/null 2>&1; then curl -fsSL "$url" -o "$dest"; return; fi
  if command -v wget >/dev/null 2>&1; then wget -qO "$dest" "$url"; return; fi
  echo "curl or wget is required to download $url" >&2
  return 1
}

download_pipe_sh() {
  local url="$1"
  if command -v curl >/dev/null 2>&1; then curl -fsSL "$url" | sh; return; fi
  if command -v wget >/dev/null 2>&1; then wget -qO- "$url" | sh; return; fi
  echo "curl or wget is required to download $url" >&2
  return 1
}

resolve_pyenv() {
  if command -v pyenv >/dev/null 2>&1; then command -v pyenv; return; fi
  if [[ -x "$HOME/.pyenv/bin/pyenv" ]]; then printf '%s' "$HOME/.pyenv/bin/pyenv"; return; fi
  printf ''
}

add_pyenv_path() {
  for entry in "$HOME/.pyenv/bin" "$HOME/.pyenv/shims"; do
    [[ -d "$entry" ]] || continue
    case ":$PATH:" in *":$entry:"*) ;; *) PATH="$entry:$PATH" ;; esac
  done
  export PATH
}

invoke_pyenv() {
  local pyenv_cmd
  pyenv_cmd="$(resolve_pyenv)"
  [[ -n "$pyenv_cmd" ]] || { echo "pyenv-native is not available in PATH." >&2; return 1; }
  add_pyenv_path
  if [[ $# -ge 2 && "$1" == "--cwd" ]]; then
    local cwd="$2"; shift 2
    ( cd "$cwd" && "$pyenv_cmd" "$@" )
  else
    "$pyenv_cmd" "$@"
  fi
}

resolve_pyenv_gui() {
  local bin_name
  bin_name="$(manifest_get "tool.pyenv_gui.binary_name.posix" "pyenv-gui")"
  if command -v "$bin_name" >/dev/null 2>&1; then command -v "$bin_name"; return; fi
  if [[ -x "$HOME/.pyenv/bin/$bin_name" ]]; then printf '%s' "$HOME/.pyenv/bin/$bin_name"; return; fi
  if [[ -x "$HOME/.pyenv/$bin_name" ]]; then printf '%s' "$HOME/.pyenv/$bin_name"; return; fi
  return 1
}

pyenv_gui_available() {
  resolve_pyenv_gui >/dev/null 2>&1 && return 0
  invoke_pyenv gui --help >/dev/null 2>&1 && return 0
  return 1
}

pyenv_gui_download_url() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"
  case "$os" in
    Darwin)
      case "$arch" in
        arm64|aarch64) manifest_get "tool.pyenv_gui.macos.arm64.download_url" ;;
        *) manifest_get "tool.pyenv_gui.macos.x64.download_url" ;;
      esac
      ;;
    Linux)
      case "$arch" in
        x86_64|amd64) manifest_get "tool.pyenv_gui.linux.x64.download_url" ;;
        *) echo "" ;;
      esac
      ;;
    *) echo "" ;;
  esac
}

parse_args() {
  local args=("$@") i token
  if [[ ${#args[@]} -gt 0 && "${args[0]}" != --* ]]; then COMMAND="${args[0]}"; fi
  for ((i=0; i<${#args[@]}; i++)); do
    token="${args[$i]}"
    case "$token" in
      --workspace) [[ $((i+1)) -lt ${#args[@]} ]] && WORKSPACE="$(cd "${args[$((i+1))]}" 2>/dev/null && pwd || printf '%s' "${args[$((i+1))]}")" ;;
      --json) JSON_OUTPUT=true ;;
      --skip-workspace-checks) SKIP_WORKSPACE_CHECKS=true ;;
      --allow-installs) [[ $((i+1)) -lt ${#args[@]} ]] && [[ "${args[$((i+1))],,}" =~ ^(1|true|yes|on)$ ]] && ALLOW_INSTALLS=true || ALLOW_INSTALLS=false ;;
      --install-optional-tools) [[ $((i+1)) -lt ${#args[@]} ]] && [[ "${args[$((i+1))],,}" =~ ^(1|true|yes|on)$ ]] && INSTALL_OPTIONAL_TOOLS=true || INSTALL_OPTIONAL_TOOLS=false ;;
      --install-python-playwright) [[ $((i+1)) -lt ${#args[@]} ]] && [[ "${args[$((i+1))],,}" =~ ^(1|true|yes|on)$ ]] && INSTALL_PYTHON_PLAYWRIGHT=true || INSTALL_PYTHON_PLAYWRIGHT=false ;;
      --optional-tools) [[ $((i+1)) -lt ${#args[@]} ]] && OPTIONAL_TOOLS="${args[$((i+1))],,}" ;;
    esac
  done
  COMMAND="${COMMAND,,}"
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

install_node_from_tarball() {
  local url="$1" install_root="$2" archive_name="$3"
  local archive extract_dir version_tag
  [[ -n "$url" && -n "$install_root" ]] || return 1
  archive="$TMP_DIR/$archive_name"
  echo "[Web Toolkit] Downloading Node from official tarball..."
  download_file "$url" "$archive" || return 1
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
  case ":$PATH:" in *":/usr/local/bin:"*) ;; *) PATH="/usr/local/bin:$PATH"; export PATH ;; esac
  hash -r
  return 0
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

ensure_node_posix() {
  local required before after source_label url install_root arch os prefer_tarball installed=false
  required="$(manifest_get "tool.node.required_version")"
  before="$(command_version node --version | sed 's/^v//' || true)"
  if [[ -n "$before" ]] && version_ge "$before" "$required"; then
    report_add current "Node.js" "$required" "$before" "$before" "PATH" "already-current" "Node satisfies the latest-current policy"
    report_add current "npm" "" "$(command_version npm --version || true)" "$(command_version npm --version || true)" "Node bundle" "already-current" "npm available with Node"
    report_add current "npx" "" "$(command_version npx --version || true)" "$(command_version npx --version || true)" "Node bundle" "already-current" "npx available with Node"
    return
  fi

  os="$(uname -s)"
  arch="$(uname -m)"
  prefer_tarball="$(manifest_get "tool.node.posix.prefer_official_tarball" "true")"
  source_label="nodejs.org"

  if [[ "$os" == "Darwin" ]]; then
    # Official Node tarball is primary — Homebrew is optional fallback only.
    # Fresh Macs often lack brew; requiring it was a setup failure mode.
    case "$arch" in
      arm64) url="$(manifest_get "tool.node.macos.arm64.tarball_url")" ;;
      x86_64) url="$(manifest_get "tool.node.macos.x64.tarball_url")" ;;
      *) report_add failed "Node.js" "$required" "$before" "" "nodejs.org" "failed" "Unsupported macOS architecture: $arch" "Install Node manually from nodejs.org, then rerun setup."; return 1 ;;
    esac
    install_root="$(manifest_get "tool.node.macos.install_root" "/usr/local/lib/nodejs")"
    if [[ "$prefer_tarball" == "true" ]] || ! command -v brew >/dev/null 2>&1; then
      if install_node_from_tarball "$url" "$install_root" "node-darwin.tar.gz"; then
        installed=true
        source_label="nodejs.org"
      elif command -v brew >/dev/null 2>&1; then
        echo "[Web Toolkit] Official Node tarball failed — falling back to Homebrew..."
        brew install "$(manifest_get "tool.node.macos.brew_formula" "node")" && installed=true
        source_label="homebrew:node"
      fi
    else
      if brew install "$(manifest_get "tool.node.macos.brew_formula" "node")"; then
        installed=true
        source_label="homebrew:node"
      elif install_node_from_tarball "$url" "$install_root" "node-darwin.tar.gz"; then
        installed=true
        source_label="nodejs.org"
      fi
    fi
    if [[ "$installed" != true ]]; then
      report_add failed "Node.js" "$required" "$before" "" "nodejs.org" "failed" "Could not install Node (official tarball failed; Homebrew unavailable or also failed)." "Approve admin/sudo when prompted, check network access to nodejs.org, then rerun setup."
      return 1
    fi
  else
    case "$arch" in
      x86_64) url="$(manifest_get "tool.node.linux.x64.tarball_url")" ;;
      aarch64|arm64) url="$(manifest_get "tool.node.linux.arm64.tarball_url")" ;;
      *) report_add failed "Node.js" "$required" "$before" "" "nodejs.org" "failed" "Unsupported Linux architecture: $arch" "Use a manually provisioned Node current release for this architecture."; return 1 ;;
    esac
    install_root="$(manifest_get "tool.node.linux.install_root" "/usr/local/lib/nodejs")"
    if ! install_node_from_tarball "$url" "$install_root" "node-linux.tar.xz"; then
      report_add failed "Node.js" "$required" "$before" "" "nodejs.org" "failed" "Official Node tarball install failed." "Install the latest Node current release manually, then rerun bootstrap."
      return 1
    fi
    source_label="nodejs.org"
  fi

  after="$(command_version node --version | sed 's/^v//' || true)"
  if [[ -n "$after" ]] && version_ge "$after" "$required"; then
    report_add installed "Node.js" "$required" "$before" "$after" "$source_label" "installed-or-updated" "Installed or updated Node.js current line"
    report_add installed "npm" "" "" "$(command_version npm --version || true)" "Node bundle" "available" "npm available after Node install"
    report_add installed "npx" "" "" "$(command_version npx --version || true)" "Node bundle" "available" "npx available after Node install"
  else
    report_add failed "Node.js" "$required" "$before" "$after" "$source_label" "failed" "Node did not satisfy the required current line after install" "Install the latest Node current release manually, then rerun bootstrap."
    return 1
  fi
}

ensure_pyenv_native_posix() {
  local required before
  required="$(manifest_get "tool.pyenv_native.minimum_version")"
  add_pyenv_path
  before="$(invoke_pyenv --version 2>/dev/null | head -n1 || true)"
  before="${before##* }"
  if [[ -n "$before" ]] && version_ge "$before" "$required"; then
    report_add current "pyenv-native (pyenv)" "$required" "$before" "$before" "PATH" "already-current" "pyenv-native CLI satisfies policy"
    return
  fi
  if [[ -n "$before" ]]; then invoke_pyenv self-update; else download_pipe_sh "$(manifest_get "tool.pyenv_native.posix.install_url")"; fi
  add_pyenv_path
  local after; after="$(invoke_pyenv --version 2>/dev/null | head -n1 || true)"; after="${after##* }"
  if [[ -n "$after" ]] && version_ge "$after" "$required"; then
    report_add installed "pyenv-native (pyenv)" "$required" "$before" "$after" "github-release-installer/self-update" "installed-or-updated" "pyenv-native CLI ready — use \`pyenv\` / \`pyenv gui\`"
  else
    report_add failed "pyenv-native (pyenv)" "$required" "$before" "$after" "github-release-installer/self-update" "failed" "pyenv-native did not satisfy policy after install/update" "Install pyenv-native manually from the latest GitHub release and rerun bootstrap."
  fi
}

ensure_pyenv_gui_posix() {
  local url target_dir target_path before bin_name
  add_pyenv_path
  bin_name="$(manifest_get "tool.pyenv_gui.binary_name.posix" "pyenv-gui")"
  target_dir="$HOME/.pyenv/bin"
  target_path="$target_dir/$bin_name"
  before=""
  pyenv_gui_available && before="present"
  if [[ -n "$before" ]]; then
    report_add current "pyenv-gui" "" "$before" "$before" "pyenv-native" "already-current" "pyenv-gui available — launch with \`pyenv gui\`"
    return
  fi
  url="$(pyenv_gui_download_url)"
  if [[ -z "$url" ]]; then
    report_add failed "pyenv-gui" "" "" "" "github-release" "failed" "No pyenv-gui download URL for this OS/arch" "See $(manifest_get "tool.pyenv_gui.docs_url") or build with cargo build --release -p pyenv-gui"
    return 1
  fi
  mkdir -p "$target_dir"
  if curl -fsSL "$url" -o "$target_path" && chmod +x "$target_path"; then
    add_pyenv_path
    if pyenv_gui_available || [[ -x "$target_path" ]]; then
      report_add installed "pyenv-gui" "" "" "present" "github-release" "installed" "pyenv-gui installed — launch with \`pyenv gui\`"
      return
    fi
  fi
  report_add failed "pyenv-gui" "" "" "" "github-release" "failed" "Could not install pyenv-gui binary" "Download from pyenv-native release assets into ~/.pyenv/bin and run \`pyenv gui\`."
  return 1
}

ensure_python_runtime_posix() {
  local required desired before_python before_pip versions_output venv_name target_spec after_python after_pip
  required="$(manifest_get "tool.python.minimum_version")"
  desired="$(invoke_pyenv latest "$(manifest_get "tool.python.desired_prefix")" 2>/dev/null | head -n1 || true)"
  [[ -n "$desired" ]] || desired="$(manifest_get "tool.python.fallback_version")"
  venv_name="$(normalize_env_name "$(basename "$WORKSPACE")")"
  before_python="$(command_version python --version || true)"
  before_pip="$(command_version pip --version || true)"
  versions_output="$(invoke_pyenv versions 2>/dev/null || true)"
  grep -Fq "$desired" <<<"$versions_output" || invoke_pyenv install "$desired"
  # Prefer the desired line as the user-global Python (latest installed for that prefix).
  invoke_pyenv global "$desired" || true
  target_spec="$desired/envs/$venv_name"
  versions_output="$(invoke_pyenv versions 2>/dev/null || true)"
  grep -Fq "$target_spec" <<<"$versions_output" || invoke_pyenv venv create "$desired" "$venv_name"
  invoke_pyenv --cwd "$WORKSPACE" local "$target_spec"
  invoke_pyenv --cwd "$WORKSPACE" exec python -m pip install --upgrade pip
  after_python="$(invoke_pyenv --cwd "$WORKSPACE" exec python --version | head -n1 || true)"
  after_pip="$(invoke_pyenv --cwd "$WORKSPACE" exec python -m pip --version | head -n1 || true)"
  report_add installed "Python runtime" "$required" "$before_python" "$after_python" "pyenv-native" "installed-or-selected" "Workspace bound to $target_spec; pyenv global set to $desired"
  report_add installed "pip" "" "$before_pip" "$after_pip" "pyenv-native" "installed-or-updated" "pip upgraded inside the managed venv"
}

ensure_python_playwright_posix() {
  [[ "$INSTALL_PYTHON_PLAYWRIGHT" == true ]] || { report_add skipped "Python Playwright" "" "" "" "pyenv-native venv" "skipped" "Flag disabled"; return; }
  local before
  before="$(invoke_pyenv --cwd "$WORKSPACE" exec python -m playwright --version 2>/dev/null | head -n1 || true)"
  [[ -n "$before" ]] && { report_add current "Python Playwright" "" "$before" "$before" "pyenv-native venv" "already-current" "Playwright already installed in the managed venv"; return; }
  local package browser after
  package="$(manifest_get "tool.python_playwright.package" "playwright")"
  browser="$(manifest_get "tool.python_playwright.browser" "chromium")"
  invoke_pyenv --cwd "$WORKSPACE" exec python -m pip install "$package"
  invoke_pyenv --cwd "$WORKSPACE" exec python -m playwright install "$browser"
  after="$(invoke_pyenv --cwd "$WORKSPACE" exec python -m playwright --version | head -n1 || true)"
  report_add installed "Python Playwright" "" "$before" "$after" "pyenv-native venv" "installed" "Installed $package + $browser"
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
  local node_required node_version git_version pyenv_version python_version pip_version
  node_required="$(manifest_get "tool.node.required_version")"
  git_version="$(command_version git --version || true)"
  node_version="$(command_version node --version | sed 's/^v//' || true)"
  pyenv_version="$(invoke_pyenv --version 2>/dev/null | head -n1 || true)"; pyenv_version="${pyenv_version##* }"
  python_version="$(command_version python --version || true)"
  pip_version="$(command_version pip --version || true)"
  [[ -n "$git_version" ]] && report_add current "Git" "" "$git_version" "$git_version" "PATH" "already-current" "Git available" || report_add failed "Git" "" "" "" "PATH" "missing" "Git not found in PATH"
  if [[ -n "$node_version" ]] && version_ge "$node_version" "$node_required"; then
    report_add current "Node.js" "$node_required" "$node_version" "$node_version" "PATH" "already-current" "Node satisfies policy"
  else
    report_add failed "Node.js" "$node_required" "$node_version" "" "PATH" "out-of-policy" "Node missing or below the required current line"
  fi
  [[ -n "$pyenv_version" ]] && report_add current "pyenv-native (pyenv)" "$(manifest_get "tool.pyenv_native.minimum_version")" "$pyenv_version" "$pyenv_version" "PATH" "available" "pyenv-native CLI available" || report_add failed "pyenv-native (pyenv)" "$(manifest_get "tool.pyenv_native.minimum_version")" "" "" "PATH" "missing" "pyenv-native CLI not found — do not use system Python"
  if pyenv_gui_available; then
    report_add current "pyenv-gui" "" "present" "present" "pyenv-native" "available" "pyenv-gui available — launch with \`pyenv gui\`"
  else
    report_add failed "pyenv-gui" "" "" "" "pyenv-native" "missing" "pyenv-gui missing — required companion; install via bootstrap or release assets"
  fi
  [[ -n "$python_version" ]] && report_add current "Python runtime" "$(manifest_get "tool.python.minimum_version")" "$python_version" "$python_version" "PATH/pyenv" "available" "Python executable available under pyenv-native" || report_add failed "Python runtime" "$(manifest_get "tool.python.minimum_version")" "" "" "PATH/pyenv" "missing" "Python executable not found under pyenv-native"
  [[ -n "$pip_version" ]] && report_add current "pip" "" "$pip_version" "$pip_version" "PATH/pyenv" "available" "pip available" || report_add failed "pip" "" "" "" "PATH/pyenv" "missing" "pip not found"
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
      ensure_pyenv_native_posix || true
      ensure_pyenv_gui_posix || true
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
