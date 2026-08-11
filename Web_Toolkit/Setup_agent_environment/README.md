# Setup Agent Environment

Prepare a workstation for **AI-assisted Astro / Cloudflare** development.

## Interactive wizard (recommended)

Scans for missing/outdated tools, shows **one list**, then a single confirmation:

> The following software is not installed or is outdated. Press Y to continue setting up the local agent environment.

**Coding agents should run setup** (not ask the user to double-click). Use `--yes` / `-Yes` to skip the Y prompt; `sudo`/UAC still prompts the user for a password when elevation is needed.

```bash
bash ./Setup_Agent_Environment.sh --yes --workspace .
```

| Platform | Manual run |
|----------|------------|
| **Windows** (repo root) | `Setup_Agent_Environment.bat` |
| **macOS** (repo root) | `Setup_Agent_Environment.command` |
| **Linux** (repo root) | `bash Setup_Agent_Environment.sh` |
| From `Web_Toolkit/` | `Setup_Agent_Environment.bat` / `.sh` |

**Node.js is not required to launch the wizard.** Native Bash/PowerShell menus call `bootstrap.sh` / `bootstrap.ps1`, which install Node when missing.

Menu config: `config/setup-menu.json`  
Engine: `scripts/setup-interactive.sh` / `scripts/setup-interactive.ps1` → `bootstrap.*`

## What the wizard can install

### Core (required bundle)

- Git
- Node.js (current line from manifest)
- **pyenv-native** (`pyenv` CLI) — exclusive Python version manager on Windows, macOS, and Linux
- **pyenv-gui** — desktop companion; launch with `pyenv gui` ([GUI docs](https://github.com/imyourboyroy/pyenv-native/blob/main/docs/GUI.md))
- Python 3.14+ preferred (3.13+ minimum) **only** via pyenv-native — never system/winget/Homebrew Python
- pip in a workspace-named virtual environment

### Included for agents (no per-tool prompts)

- Python Playwright + Chromium inside the managed venv (for agent browser tools)

Optional package managers (pnpm, Bun, uv, gh, .NET) are not prompted individually; install them later if needed.

### macOS prerequisite

- Xcode Command Line Tools (triggered automatically when missing)

## Kickoff behavior

The launcher wrappers now own the host setup flow directly:

- **Windows**: `Setup_Agent_Environment.bat` / `-Yes` runs `setup-interactive.ps1` (no Node), then `bootstrap.ps1` with **UAC elevation** when installs are needed.
- **macOS / Linux**: `Setup_Agent_Environment.sh --yes` / `.command` runs `setup-interactive.sh` (no Node), then `bootstrap.sh` with **sudo** when installs are needed.
- Agents pass `--yes` so the user only interacts with the password/UAC prompt.
- A single manifest now drives the install policy: `Setup_agent_environment/config/host-bootstrap.manifest.json`.
- If the machine is **already configured**, the bootstrap reports those tools under **Already current** instead of reinstalling them.

## Commands

- `powershell -NoProfile -ExecutionPolicy Bypass -File ./Web_Toolkit/scripts/bootstrap.ps1 doctor --workspace <path>`
- `powershell -NoProfile -ExecutionPolicy Bypass -File ./Web_Toolkit/scripts/bootstrap.ps1 prepare-host --workspace <path>`
- `bash ./Web_Toolkit/scripts/bootstrap.sh doctor --workspace <path>`
- `bash ./Web_Toolkit/scripts/bootstrap.sh prepare-host --workspace <path>`
- `node ./Web_Toolkit/Setup_agent_environment/bin/agent-env-setup.mjs doctor --workspace <path>`
- `node ./Web_Toolkit/Setup_agent_environment/bin/agent-env-setup.mjs verify --workspace <path>`

The Node CLI is now **diagnostic-only**. Use the OS-native bootstrap scripts for installs and repairs.

## What it checks

### Required host tools

- Git
- Node.js **26.0.0 or newer** (exact pin: **repo-root** [`.node-version`](../../../.node-version) = `26.7.0` — not under `Web_Toolkit/`)
- npm
- npx
- `pyenv-native` **0.2.30 or newer** (`pyenv` CLI)
- **pyenv-gui** present (launch: `pyenv gui`)
- Python 3.14+ preferred (3.13+ minimum) provisioned through `pyenv-native` only — bootstrap sets `pyenv global` to the desired installed line **and** a workspace `local` venv
- pip inside the `pyenv-native`-managed workspace venv

### Recommended extras

- pnpm
- Bun
- uv
- GitHub CLI
- .NET SDK
- optional Python Playwright package + Chromium browser inside the managed workspace venv

### macOS-specific prerequisite

- **Xcode Command Line Tools**
  - This is the heavy Apple scripting/build prerequisite that Homebrew and many other scripting flows depend on.
  - The macOS bootstrap now detects when it is missing and triggers `xcode-select --install` automatically.
  - Caveat: Apple may still continue that install through a system dialog / softwareupdate flow, so this is the one piece that is not always fully silent end-to-end.

### Workspace readiness

- `AGENTS.md`
- `README.md`
- `MEMORY.md`
- `.env.example`
- `package.json`
- preview/dev script
- validation script
- Astro config

## Manifest-driven policy

- The source of truth is now `Setup_agent_environment/config/host-bootstrap.manifest.json`.
- Node policy is **latest/current only** — minimum **26.x**; exact pin lives at **repository root** `.node-version` (currently `26.7.0`). Bootstrap tarball targets that pin (verify against https://nodejs.org/dist/ before bumps). Do **not** add a second `.node-version` under `Web_Toolkit/`.
- Python policy prefers the **3.14** line (`desired_prefix` / `fallback_version` in the manifest) while accepting **3.13+** as minimum.
- **`tool.python.install_policy` = `pyenv-native-only`** — system/winget/Homebrew Python installs are out of policy.
- Bootstrap must install **pyenv-native + pyenv-gui**; operators launch the GUI with `pyenv gui`.
- The workspace venv name is derived from the normalized workspace folder name.
- Older Node lines are treated as out-of-policy and are never silently accepted or downgraded into compatibility.

## Repair behavior

### Windows

Automatic repair uses `winget`, targets **current/latest Node**, and never installs Python via winget.

Typical package targets:

- `winget install --id Git.Git`
- `winget install --id OpenJS.NodeJS`
- `pyenv-native` install script from the latest GitHub release (`pyenv` CLI)
- `pyenv-gui` binary from the same release assets → `%USERPROFILE%\.pyenv\bin\pyenv-gui.exe` (launch: `pyenv gui`)
- optional: `pnpm.pnpm`, `Oven-sh.Bun`, `astral-sh.uv`, `GitHub.cli`, `Microsoft.DotNet.SDK.10`

### macOS

Automatic repair uses Homebrew for Node and optional extras, and **pyenv-native + pyenv-gui** for Python (not `brew install python`).

Typical package targets:

- `xcode-select --install` when Command Line Tools are missing
- `brew install git`
- `brew install node`
- optional: `brew install pnpm bun uv gh`
- optional: `brew install --cask dotnet-sdk`
- `curl -fsSL https://github.com/imyourboyroy/pyenv-native/releases/latest/download/install.sh | sh`
- download `pyenv-gui-macos-*` into `~/.pyenv/bin/pyenv-gui` (launch: `pyenv gui`)

### Linux

Automatic repair now treats **Node separately** from the distro package manager:

- Node installs from the official **Node current** archive defined in the manifest
- Optional extras can still use supported distro package managers:
  - `apt-get`
  - `dnf`
  - `yum`
  - `pacman`
  - `zypper`
- Python still installs only through `pyenv-native` + `pyenv-gui` (never distro `python3` packages for toolkit Python)

### Architecture caveat

- The toolkit should prefer the **latest available build** for the host architecture.
- For **Intel/x86_64 Macs**, Homebrew/Node current should still work.
- For **Linux x86_64**, the latest line should also work in normal cases.
- If a latest binary/package is unavailable for a specific architecture, the correct behavior is to fail clearly rather than silently downgrade.

## Useful flags

- `--workspace <path>`
- `--json`
- `--skip-workspace-checks`
- `--allow-installs true|false`
- `--install-optional-tools true|false`
- `--optional-tools pnpm,gh` (only install selected optional tools from the menu)

## Example flows

### Fast human-readable audit

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ./Web_Toolkit/scripts/bootstrap.ps1 doctor --workspace .
```

### Repair host with the wrapper kickoff

#### Windows

```powershell
.\Web_Toolkit\Setup_Agent_Environment.bat --workspace .
```

#### macOS / Linux

```bash
bash ./Web_Toolkit/Setup_Agent_Environment.sh --workspace .
```

### Post-bootstrap Node diagnostics

```bash
node ./Web_Toolkit/Setup_agent_environment/bin/agent-env-setup.mjs verify --workspace .
```

### JSON report output

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File ./Web_Toolkit/scripts/bootstrap.ps1 doctor --workspace . --json
```

## Important note

The Codex/OpenAI Playwright integration still needs **manual** enabling in the Codex/OpenAI environment when you want browser automation from the model.

The native bootstrap also writes a machine-readable report to:

- `Web_Toolkit/.runtime/reports/setup-agent-environment.json`
