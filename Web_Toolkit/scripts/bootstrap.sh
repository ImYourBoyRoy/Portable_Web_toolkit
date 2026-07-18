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

ensure_sudo() {
  [[ "$COMMAND" =~ ^(fix|prepare-host)$ ]] || return 0
  [[ "$ALLOW_INSTALLS" == true ]] || return 0
  [[ "$(id -u)" -eq 0 ]] && return 0
  command -v sudo >/dev/null 2>&1 || { report_add failed "sudo" "" "" "" "system" "failed" "sudo is required for automatic installs." "Install sudo or run as root."; return 1; }
  echo
  echo "[Web Toolkit] Requesting sudo once before installs..."
  sudo -v
  while true; do sudo -n true >/dev/null 2>&1 || exit; sleep 30; done &
  SUDO_KEEPALIVE_PID="$!"
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
  if xcode-select -p >/dev/null 2>&1; then report_add current "Xcode Command Line Tools" "" "installed" "installed" "xcode-select" "already-current" "Xcode Command Line Tools available"; return; fi
  xcode-select --install >/dev/null 2>&1 || true
  report_add installed "Xcode Command Line Tools" "" "missing" "pending" "xcode-select --install" "triggered" "Triggered Command Line Tools install" "Apple may continue the install through a system dialog or softwareupdate flow."
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
  local before
  before="$(command_version git --version || true)"
  [[ -n "$before" ]] && { report_add current "Git" "" "$before" "$before" "PATH" "already-current" "Git already available"; return; }
  local pm pkg
  pm="$(linux_pkg_manager)"
  case "$(uname -s)" in
    Darwin) report_add skipped "Git" "" "" "" "system" "skipped" "Git installation is expected from Xcode Command Line Tools or manual setup" "" ;;
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
      local after; after="$(command_version git --version || true)"
      [[ -n "$after" ]] && report_add installed "Git" "" "$before" "$after" "$pm:$pkg" "installed" "Installed Git" || report_add failed "Git" "" "$before" "$after" "$pm:$pkg" "failed" "Git still missing after install attempt" "Install Git manually and rerun bootstrap."
      ;;
  esac
}

ensure_node_posix() {
  local required before
  required="$(manifest_get "tool.node.required_version")"
  before="$(command_version node --version | sed 's/^v//' || true)"
  if [[ -n "$before" ]] && version_ge "$before" "$required"; then
    report_add current "Node.js" "$required" "$before" "$before" "PATH" "already-current" "Node satisfies the latest-current policy"
    report_add current "npm" "" "$(command_version npm --version || true)" "$(command_version npm --version || true)" "Node bundle" "already-current" "npm available with Node"
    report_add current "npx" "" "$(command_version npx --version || true)" "$(command_version npx --version || true)" "Node bundle" "already-current" "npx available with Node"
    return
  fi
  if [[ "$(uname -s)" == "Darwin" ]]; then
    ensure_clt
    command -v brew >/dev/null 2>&1 || { report_add failed "Node.js" "$required" "$before" "" "homebrew" "failed" "Homebrew is required for automatic Node setup on macOS." "Install Homebrew and rerun bootstrap."; return; }
    brew install "$(manifest_get "tool.node.macos.brew_formula")"
  else
    local arch url install_root version_tag archive extract_dir
    arch="$(uname -m)"
    case "$arch" in
      x86_64) url="$(manifest_get "tool.node.linux.x64.tarball_url")" ;;
      aarch64|arm64) url="$(manifest_get "tool.node.linux.arm64.tarball_url")" ;;
      *) report_add failed "Node.js" "$required" "$before" "" "nodejs.org" "failed" "Unsupported Linux architecture: $arch" "Use a manually provisioned Node current release for this architecture."; return ;;
    esac
    install_root="$(manifest_get "tool.node.linux.install_root")"
    archive="$TMP_DIR/node.tar.xz"
    download_file "$url" "$archive"
    version_tag="$(basename "$url" .tar.xz)"
    extract_dir="$install_root/$version_tag"
    sudo mkdir -p "$install_root"
    sudo rm -rf "$extract_dir"
    sudo tar -xJf "$archive" -C "$install_root"
    sudo ln -sf "$extract_dir/bin/node" /usr/local/bin/node
    sudo ln -sf "$extract_dir/bin/npm" /usr/local/bin/npm
    sudo ln -sf "$extract_dir/bin/npx" /usr/local/bin/npx
    [[ -x "$extract_dir/bin/corepack" ]] && sudo ln -sf "$extract_dir/bin/corepack" /usr/local/bin/corepack || true
    hash -r
  fi
  local after; after="$(command_version node --version | sed 's/^v//' || true)"
  if [[ -n "$after" ]] && version_ge "$after" "$required"; then
    report_add installed "Node.js" "$required" "$before" "$after" "$( [[ "$(uname -s)" == "Darwin" ]] && echo "homebrew:node" || echo "nodejs.org" )" "installed-or-updated" "Installed or updated Node.js current line"
    report_add installed "npm" "" "" "$(command_version npm --version || true)" "Node bundle" "available" "npm available after Node install"
    report_add installed "npx" "" "" "$(command_version npx --version || true)" "Node bundle" "available" "npx available after Node install"
  else
    report_add failed "Node.js" "$required" "$before" "$after" "$( [[ "$(uname -s)" == "Darwin" ]] && echo "homebrew:node" || echo "nodejs.org" )" "failed" "Node did not satisfy the required current line after install" "Install the latest Node current release manually, then rerun bootstrap."
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
  target_spec="$desired/envs/$venv_name"
  versions_output="$(invoke_pyenv versions 2>/dev/null || true)"
  grep -Fq "$target_spec" <<<"$versions_output" || invoke_pyenv venv create "$desired" "$venv_name"
  invoke_pyenv --cwd "$WORKSPACE" local "$target_spec"
  invoke_pyenv --cwd "$WORKSPACE" exec python -m pip install --upgrade pip
  after_python="$(invoke_pyenv --cwd "$WORKSPACE" exec python --version | head -n1 || true)"
  after_pip="$(invoke_pyenv --cwd "$WORKSPACE" exec python -m pip --version | head -n1 || true)"
  report_add installed "Python runtime" "$required" "$before_python" "$after_python" "pyenv-native" "installed-or-selected" "Workspace bound to $target_spec"
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
  ensure_sudo || true
  case "$COMMAND" in
    doctor|verify) doctor_only ;;
    fix|prepare-host)
      if [[ "$ALLOW_INSTALLS" != true ]]; then report_add skipped "Install phase" "" "" "" "flags" "skipped" "Automatic installs disabled by flag"; workspace_checks; invoke_node_doctor; write_report; [[ -s "$FAILED_FILE" ]] && exit 2 || exit 0; fi
      [[ "$(uname -s)" == "Darwin" ]] && ensure_clt
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
