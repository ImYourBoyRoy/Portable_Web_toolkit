# Cross-platform conventions (all skills)

Portable Web Toolkit runs on **Windows, macOS, and Linux**.

## Universal (any OS)

All toolkit CLIs are **Node.js** — requires **Node 26+** (see repo `.node-version`, currently `26.5.0`):

```bash
node ./Web_Toolkit/site_readiness/bin/site-readiness.mjs run --project-root .
node ./scripts/check-toolkit-update.mjs
node ./scripts/link-web-toolkit.mjs --toolkit-path /abs/Web_Toolkit --project-root /abs/client-site
node ./scripts/install-agent-skills.mjs
node ./scripts/update-toolkit.mjs
```

## Install / update wrappers

| OS | Preferred | Fallback |
|----|-----------|----------|
| **Windows** | `pwsh ./scripts/install-agent-skills.ps1 -Agent all` | `node ./scripts/install-agent-skills.mjs` |
| **macOS / Linux** | `bash ./scripts/install-agent-skills.sh --agent all` | `pwsh ./scripts/install-agent-skills.ps1 -Agent all` (if PowerShell 7+ installed) |
| **Any** | `node ./scripts/install-agent-skills.mjs` | dispatches to pwsh or bash |

Same pattern for `update-toolkit` (`.ps1` / `.sh` / `.mjs`).

## Link Web_Toolkit into client project

**Preferred (all platforms):**

```bash
node /path/to/Portable_Web_toolkit/scripts/link-web-toolkit.mjs \
  --toolkit-path /path/to/Portable_Web_toolkit/Web_Toolkit \
  --project-root /path/to/client-site \
  --name Web_Toolkit
```

| OS | Manual alternative |
|----|-------------------|
| Windows | `cmd /c mklink /J Web_Toolkit C:\path\to\Web_Toolkit` |
| macOS / Linux | `ln -s /path/to/Web_Toolkit ./Web_Toolkit` |

## Paths

- Use forward slashes in Node CLI args on all platforms.
- Secrets: client `.env` only — never commit.
- Home for install stamp: `%USERPROFILE%` (Windows) or `$HOME` (macOS/Linux) → `~/.portable-web-toolkit/install-stamp.json`

## npm scripts in client sites

Copied from `site-starter/` — all invoke Node and work on every OS.
