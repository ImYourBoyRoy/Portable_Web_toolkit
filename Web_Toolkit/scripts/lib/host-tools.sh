#!/bin/bash
# ./Web_Toolkit/scripts/lib/host-tools.sh
# Shared host-tool detection for bootstrap.sh and setup-interactive.sh (macOS/Linux). Sourced, never executed.
# Needs: MANIFEST_PATH and TOOLKIT_ROOT. Nothing here names a Node, pnpm or Enchi version to install:
# Node is resolved from nodejs.org at run time, pnpm and Enchi come from their own latest-release installers.

manifest_get() {
  local key="$1" default="${2:-}" line
  [[ -f "${MANIFEST_PATH:-}" ]] || { printf '%s' "$default"; return; }
  line="$(grep -m1 "\"$key\"" "$MANIFEST_PATH" 2>/dev/null || true)"
  [[ -z "$line" ]] && { printf '%s' "$default"; return; }
  printf '%s' "$line" | sed -E 's/^[[:space:]]*"[^"]+"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/'
}

# macOS ships bash 3.2: no ${var,,}, ${var^^}, declare -A or mapfile anywhere in these scripts (tests/host-tools.test.mjs enforces it).
lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

version_ge() { [[ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n1)" == "$2" ]]; }

command_version() {
  command -v "$1" >/dev/null 2>&1 || return 1
  "$1" "${@:2}" 2>/dev/null | head -n1 | tr -d '\r'
}

download_file() {
  local url="$1" dest="$2"
  if command -v curl >/dev/null 2>&1; then curl -fsSL "$url" -o "$dest"; return; fi
  if command -v wget >/dev/null 2>&1; then wget -qO "$dest" "$url"; return; fi
  echo "curl or wget is required to download $url" >&2
  return 1
}

download_text() {
  local url="$1"
  if command -v curl >/dev/null 2>&1; then curl -fsSL --max-time 20 "$url"; return; fi
  if command -v wget >/dev/null 2>&1; then wget -qO- --timeout=20 "$url"; return; fi
  return 1
}

download_pipe_sh() {
  local url="$1"
  if command -v curl >/dev/null 2>&1; then curl -fsSL "$url" | sh; return; fi
  if command -v wget >/dev/null 2>&1; then wget -qO- "$url" | sh; return; fi
  echo "curl or wget is required to download $url" >&2
  return 1
}

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'; return; fi
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'; return; fi
  return 1
}

path_prepend() {
  [[ -d "$1" ]] || return 0
  case ":$PATH:" in *":$1:"*) ;; *) PATH="$1:$PATH" ;; esac
  export PATH
}

# ----------------------------------------------------------------------- Node
# The required MAJOR is the repo-root .node-version (a major or a full version; only the major counts), else the manifest.
node_major() {
  local pin major
  pin="$(tr -d '[:space:]v' < "$TOOLKIT_ROOT/../.node-version" 2>/dev/null || true)"
  major="${pin%%.*}"
  [[ "$major" =~ ^[0-9]+$ ]] || major="$(manifest_get "tool.node.major" "26")"
  printf '%s' "$major"
}

node_platform_tag() {
  local os arch
  case "$(uname -s)" in Darwin) os=darwin ;; Linux) os=linux ;; *) return 1 ;; esac
  case "$(uname -m)" in arm64|aarch64) arch=arm64 ;; x86_64|amd64) arch=x64 ;; *) return 1 ;; esac
  printf '%s-%s' "$os" "$arch"
}

# .tar.gz on both: the smaller .tar.xz would need `xz` installed, which a minimal Linux machine often lacks.
node_archive_ext() { printf 'tar.gz'; }

# Newest release of the required major for this platform, read from nodejs.org's own checksum file.
# Sets NODE_LATEST_VERSION (no "v"), NODE_LATEST_URL, NODE_LATEST_FILE, NODE_LATEST_SHA256. Fails quietly when offline.
resolve_latest_node() {
  [[ -n "${NODE_LATEST_URL:-}" ]] && return 0
  local major base tag ext sums line file
  major="$(node_major)"
  base="$(manifest_get "tool.node.dist_base" "https://nodejs.org/dist")"
  tag="$(node_platform_tag)" || return 1
  ext="$(node_archive_ext)"
  sums="$(download_text "$base/latest-v${major}.x/SHASUMS256.txt")" || return 1
  line="$(printf '%s\n' "$sums" | grep -E "  node-v[0-9.]+-${tag}\.${ext}\$" | head -n1 || true)"
  [[ -n "$line" ]] || return 1
  NODE_LATEST_SHA256="${line%% *}"
  file="${line##* }"
  NODE_LATEST_VERSION="${file#node-v}"
  NODE_LATEST_VERSION="${NODE_LATEST_VERSION%%-*}"
  NODE_LATEST_FILE="$file"
  NODE_LATEST_URL="$base/latest-v${major}.x/$file"
}

# True (0) when Node must be installed or updated. Policy: at least the required major, and when nodejs.org answers,
# no patch behind the latest release of that major. A newer major than required is accepted; offline never forces an update.
node_needs_install() {
  local installed major
  installed="$(command_version node --version 2>/dev/null | sed 's/^v//' || true)"
  [[ -n "$installed" ]] || return 0
  major="$(node_major)"
  version_ge "$installed" "${major}.0.0" || return 0
  [[ "${installed%%.*}" == "$major" ]] || return 1
  resolve_latest_node 2>/dev/null || return 1
  if version_ge "$installed" "$NODE_LATEST_VERSION"; then return 1; fi
  return 0
}

# ---------------------------------------------------------------------- Enchi
# Enchi (formerly pyenv-native, renamed in 0.8.0): CLI `enchi`, root ~/.enchi or an existing ~/.pyenv upgraded in place.
# A not-yet-upgraded machine still has `pyenv`, so both names are looked up.
resolve_enchi() {
  local name root
  for name in enchi pyenv; do
    if command -v "$name" >/dev/null 2>&1; then command -v "$name"; return; fi
  done
  for root in "$HOME/.enchi" "$HOME/.pyenv"; do
    for name in enchi pyenv; do
      if [[ -x "$root/bin/$name" ]]; then printf '%s' "$root/bin/$name"; return; fi
    done
  done
  printf ''
}

add_enchi_path() {
  local root sub
  for root in "$HOME/.enchi" "$HOME/.pyenv"; do
    for sub in bin shims; do path_prepend "$root/$sub"; done
  done
}

enchi_version() {
  local cmd ver
  cmd="$(resolve_enchi)"
  [[ -n "$cmd" ]] || return 1
  ver="$("$cmd" --version 2>/dev/null | head -n1 || true)"
  ver="${ver##* }"
  [[ "$ver" =~ ^[0-9] ]] || return 1
  printf '%s' "$ver"
}

invoke_enchi() {
  local cmd
  cmd="$(resolve_enchi)"
  [[ -n "$cmd" ]] || { echo "Enchi is not available in PATH." >&2; return 1; }
  add_enchi_path
  if [[ $# -ge 2 && "$1" == "--cwd" ]]; then
    local cwd="$2"; shift 2
    ( cd "$cwd" && "$cmd" "$@" )
  else
    "$cmd" "$@"
  fi
}

resolve_enchi_gui() {
  local name root
  for name in enchi-gui pyenv-gui; do
    if command -v "$name" >/dev/null 2>&1; then command -v "$name"; return; fi
    for root in "$HOME/.enchi" "$HOME/.pyenv"; do
      if [[ -x "$root/bin/$name" ]]; then printf '%s' "$root/bin/$name"; return; fi
      if [[ -x "$root/$name" ]]; then printf '%s' "$root/$name"; return; fi
    done
  done
  return 1
}

enchi_gui_available() {
  resolve_enchi_gui >/dev/null 2>&1 && return 0
  invoke_enchi gui --help >/dev/null 2>&1 && return 0
  return 1
}

# Standalone GUI asset of the latest Enchi release (the main bundle normally ships it already).
enchi_gui_download_url() {
  local base os arch
  base="$(manifest_get "tool.enchi.release_base" "https://github.com/imyourboyroy/pyenv-native/releases/latest/download")"
  case "$(uname -s)" in Darwin) os=macos ;; Linux) os=linux ;; *) return 0 ;; esac
  case "$(uname -m)" in arm64|aarch64) arch=arm64 ;; x86_64|amd64) arch=x64 ;; *) return 0 ;; esac
  [[ "$os-$arch" == "linux-arm64" ]] && return 0
  printf '%s/enchi-gui-%s-%s' "$base" "$os" "$arch"
}

# ----------------------------------------------------------------------- pnpm
pnpm_home() {
  if [[ -n "${PNPM_HOME:-}" ]]; then printf '%s' "$PNPM_HOME"; return; fi
  if [[ "$(uname -s)" == Darwin ]]; then printf '%s' "$HOME/Library/pnpm"; return; fi
  printf '%s' "${XDG_DATA_HOME:-$HOME/.local/share}/pnpm"
}

add_pnpm_path() {
  local dir
  dir="$(pnpm_home)"
  [[ -d "$dir" ]] || return 0
  export PNPM_HOME="$dir"
  # pnpm 11 and later install the binary into $PNPM_HOME/bin; earlier standalone installs put it in $PNPM_HOME itself.
  path_prepend "$dir/bin"
  path_prepend "$dir"
}

pnpm_version() {
  add_pnpm_path
  command_version pnpm --version 2>/dev/null || return 1
}

# ----------------------------------------------------------- setup engine (Rust)
# toolkit-setup does the same work as the scripts, plus one administrator session, per-item installs and a state file a model
# or GUI can read. It is used when present; the scripts remain the fallback (and TOOLKIT_SETUP_LEGACY=1 forces them).
engine_asset_name() {
  local os arch
  case "$(uname -s)" in Darwin) os=macos ;; Linux) os=linux ;; *) return 1 ;; esac
  case "$(uname -m)" in arm64|aarch64) arch=arm64 ;; x86_64|amd64) arch=x64 ;; *) return 1 ;; esac
  printf 'toolkit-setup-%s-%s' "$os" "$arch"
}

find_engine() {
  [[ "${TOOLKIT_SETUP_LEGACY:-}" == "1" ]] && return 1
  local version downloaded candidate
  version="$(tr -d '[:space:]' < "$TOOLKIT_ROOT/../VERSION" 2>/dev/null || true)"
  downloaded="$TOOLKIT_ROOT/.runtime/bin/toolkit-setup"
  # A downloaded engine is only used for the toolkit version it was fetched for; a local build needs no sidecar.
  if [[ -x "$downloaded" && -f "$downloaded.version" && "$(tr -d '[:space:]' < "$downloaded.version")" == "$version" ]]; then
    if "$downloaded" --version >/dev/null 2>&1; then printf '%s' "$downloaded"; return 0; fi
  fi
  candidate="$TOOLKIT_ROOT/setup_engine/target/release/toolkit-setup"
  # An engine that cannot start (missing library, wrong architecture) is skipped so the scripts take over.
  if [[ -x "$candidate" ]] && "$candidate" --version >/dev/null 2>&1; then printf '%s' "$candidate"; return 0; fi
  return 1
}

# Downloads the engine that matches this toolkit version from its GitHub release, verified against the published SHA-256.
# Fails quietly (the scripts take over) when the release has no engine asset or the checksum does not match.
fetch_engine() {
  local version asset base dest expected actual
  version="$(tr -d '[:space:]' < "$TOOLKIT_ROOT/../VERSION" 2>/dev/null || true)"
  [[ -n "$version" ]] || return 1
  asset="$(engine_asset_name)" || return 1
  base="https://github.com/imyourboyroy/Portable_Web_toolkit/releases/download/v$version"
  dest="$TOOLKIT_ROOT/.runtime/bin/toolkit-setup"
  mkdir -p "$(dirname "$dest")"
  download_file "$base/$asset" "$dest.part" 2>/dev/null || { rm -f "$dest.part"; return 1; }
  expected="$(download_text "$base/$asset.sha256" 2>/dev/null | awk '{print $1}' | head -n1 || true)"
  actual="$(sha256_of "$dest.part" || true)"
  if [[ -z "$expected" || "$expected" != "$actual" ]]; then rm -f "$dest.part"; return 1; fi
  chmod +x "$dest.part" && mv "$dest.part" "$dest" && printf '%s\n' "$version" > "$dest.version"
}
