# Portable Web Toolkit

Reusable Astro + Cloudflare operator toolkit for auditing, diagnosing, hardening, and shipping client sites.

## Repository layout

| Path | Purpose |
|------|---------|
| `Web_Toolkit/` | Publishable toolkit source (`@imyourboyroy/web-toolkit`) |
| `Web_Toolkit/site-profiles/` | Public example profiles only |
| `Web_Toolkit/templates/` | Generic copy-ready reference files for client sites |
| `scripts/` | Neutral site-project wrappers (`site-tool.mjs`, `cf-deploy-pages.mjs`) |
| `package.json`, `wrangler.toml` | Placeholder site wrapper template (`[PROJECT_NAME]`) for client repos |
| `Private_Site_Profiles/` | Local-only profiles (gitignored) |
| `.runtime/` | Generated toolkit reports/exports (gitignored) |

## Quick start

```powershell
cd Web_Toolkit
node ./scripts/check-syntax.mjs
node ./toolkit_verify/bin/toolkit-verify.mjs
node ./privacy_check/bin/privacy-check.mjs scan --root . --json
```

Full operator docs: [`Web_Toolkit/README.md`](./Web_Toolkit/README.md)

## Agent skills (Cursor, Claude Code, Gemini, Copilot, and more)

### Tell your agent (copy-paste)

```text
Install the agent skills from https://github.com/imyourboyroy/Portable_Web_toolkit. Clone the repo, then run scripts/install-agent-skills.ps1 -Agent all on Windows (PowerShell 7+) or scripts/install-agent-skills.sh --agent all on macOS/Linux. Install for Cursor, Claude Code, Gemini CLI, Antigravity, GitHub Copilot, Windsurf, OpenCode, and Kiro.
```

### One-shot (no manual cd)

**Windows (PowerShell 7+):**

```powershell
$repo = "https://github.com/imyourboyroy/Portable_Web_toolkit"
$dir = Join-Path $env:TEMP "agent-skills-$(Get-Random)"
git clone --depth 1 $repo $dir
& (Join-Path $dir "scripts/install-agent-skills.ps1") -RepoRoot $dir -Agent all
```

**macOS / Linux:**

```bash
repo="https://github.com/imyourboyroy/Portable_Web_toolkit"
dir="$(mktemp -d)"
git clone --depth 1 "$repo" "$dir"
chmod +x "$dir/scripts/install-agent-skills.sh"
"$dir/scripts/install-agent-skills.sh" --repo-root "$dir" --agent all
```

### Quick install

**Windows (PowerShell 7+):**

```powershell
git clone --depth 1 https://github.com/imyourboyroy/Portable_Web_toolkit.git
cd Portable_Web_toolkit
./scripts/install-agent-skills.ps1 -Agent all
```

**macOS / Linux:**

```bash
git clone --depth 1 https://github.com/imyourboyroy/Portable_Web_toolkit.git
cd Portable_Web_toolkit
chmod +x ./scripts/install-agent-skills.sh
./scripts/install-agent-skills.sh --agent all
```

Per-agent guides: **[docs/agent-skills/README.md](./docs/agent-skills/README.md)** · **[Getting started](./docs/agent-skills/getting-started.md)**

## Before git push or sharing

1. Confirm `Private_Site_Profiles/` is not tracked.
2. Run `node ./Web_Toolkit/toolkit_purge/bin/toolkit-purge.mjs --apply` from `Web_Toolkit/`.
3. Run privacy scan and toolkit verify again.
4. Use `node ./Web_Toolkit/scripts/export-portable-toolkit.mjs` for sanitized copies.

## Author vs site branding

Roy Dawson IV / `@imyourboyroy` metadata in package files, licenses, and README footers identifies the **tool author**. Client site names, domains, and branding belong in each project's site profile, Brand Guide, and `.env` — not in portable toolkit source.
