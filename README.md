# Portable Web Toolkit

<!-- VERSIONS:BEGIN -->
**Toolkit Release:** `v0.3.6`

| Component / Dependency | Version Pin | Source Location |
|---|---|---|
| **Toolkit Release** | `v0.3.6` | [`VERSION`](./VERSION) |
| **Node.js Engine Target** | `>=26` | [`package.json`](./package.json) |
| **Node.js Runtime Pin** | `26.7.0` | [`.node-version`](./.node-version) |
| **Astro Framework** | `^7.2.1` | [`site-starter/workers.package.json`](./site-starter/workers.package.json) |
| **@astrojs/cloudflare** | `^14.2.1` | [`site-starter/workers.package.json`](./site-starter/workers.package.json) |
| **Cloudflare Wrangler** | `^4.120.1` | [`site-starter/workers.package.json`](./site-starter/workers.package.json) |
<!-- VERSIONS:END -->

[GitHub](https://github.com/imyourboyroy/Portable_Web_toolkit) ·
[MIT License](./LICENSE) · [Contributing](./CONTRIBUTING.md) ·
[Security](./SECURITY.md)

A toolkit for building and shipping **Astro + Cloudflare** websites with help
from AI coding agents, including Codex, Cursor, Claude, and Antigravity.

You get ready-made **agent skills**, **command-line tools** for build/deploy/discovery, and **starter templates** for new sites. Your actual website lives in its own project folder — not in this repo.

> Version table above is generated from repo truth — refresh with `node ./scripts/sync-readme-versions.mjs`.

---

## Get started (use your AI agent)

All AI coding tools (Antigravity, Cursor, Claude Code, Codex, Copilot, etc.)
support `.agents/skills/` at project scope.

**Copy and paste this entire prompt** into your AI coding agent:

```text
Use the Portable Web Toolkit for Astro + Cloudflare website work.

Source of truth:
https://github.com/imyourboyroy/Portable_Web_toolkit
Read README.md first, then docs/agent-skills/ONBOARDING_STAGES.md (skill: site-onboarding),
START_HERE.md, docs/agent-skills/SKILL_INDEX.md, and skill-pack.json.

Follow onboarding stages S0–S9 with a checkpoint after each stage.
Use the host question / confirm UI (popup) when available; otherwise ask clearly in chat.

S0 Access/sandbox — detect limits; prefer full agent control.
S1 Host bootstrap — ask before Setup_Agent_Environment (Git, Node, pyenv-native, Python).
S2 Toolkit + skills — global portable-web-toolkit-router ONLY; purge legacy heavy PWT skills;
   link project skills with manage-project-skills.mjs --skills site-onboarding,…
S3 Cloudflare API token — guide Custom token with Zone/Account Edit scopes, API Tokens Write,
   and Gateway Edit when needed; user pastes into project .env; run cf-agent permissions audit.
S4 Cloudflare MCP/plugin — ask first; then follow live
   https://developers.cloudflare.com/agent-setup/prompt.md (and agent page e.g. Cursor).
S5 Site intent — ask Workers (forms/SSR/API) vs Pages static; domain; integrations.
S6 Scaffold site-starter into a fresh client folder (files appearing is success); link Web_Toolkit.
S7 Profile, Brand Guide, .env from site-starter/.env.example (incl. GOOGLE_PAGESPEED_API_KEY).
S8 Build + discovery-doctor + site-readiness (Workers dist/client vs Pages dist).
S9 Staging → smoke → production only with explicit authorization; CF dry-run before --apply.

Prefer toolkit CLIs to inventing scripts. Never commit secrets.
```

Or run the CLI yourself after the toolkit is cloned:

```bash
# Default = light router only
node /path/to/Portable_Web_toolkit/scripts/manage-project-skills.mjs link --project /path/to/client-site

# Active website work — pass explicit skills
node /path/to/Portable_Web_toolkit/scripts/manage-project-skills.mjs link --project /path/to/client-site \
  --skills portable-web-toolkit,site-readiness,site-starter,toolkit-update
```

The agent follows [`docs/agent-skills/SKILL_INDEX.md`](./docs/agent-skills/SKILL_INDEX.md). Running `git pull` in `Portable_Web_toolkit` updates all symlinked client skills live.

### Working on a site

Each client site lives in a **separate folder** with its own `package.json`, `.env`, and site profile. Link this toolkit’s `Web_Toolkit/` into that folder using `scripts/link-web-toolkit.mjs`. Copy secrets from [`site-starter/.env.example`](./site-starter/.env.example) (includes PageSpeed, Cloudflare, forms, analytics slots).

### Upgrading & Migrating Existing Installs

Copy and paste:

```text
Update my Portable Web Toolkit install from https://github.com/imyourboyroy/Portable_Web_toolkit (latest release).
Purge legacy heavy web skills from global agent homes, keep only portable-web-toolkit-router globally,
symlink selected project skills with manage-project-skills.mjs --skills …, and ask before running
Setup_Agent_Environment. Prefer toolkit CLIs to correct the project.
```

---

## Local agent environment setup

On a **new machine**, setup can scan for missing or outdated tools. Treat this
as a separate privileged task, inspect the requested changes, and authorize it
before applying:

> The following software is not installed or is outdated. Press Y to continue setting up the local agent environment.

The launchers can bootstrap without an existing Node installation:

```bash
# macOS / Linux — agent-friendly (skips Y; sudo still prompts for your password)
bash ./Setup_Agent_Environment.sh --yes

# Windows (PowerShell 7+)
pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\Web_Toolkit\scripts\setup-interactive.ps1 -Workspace . -Yes
```

Manual launchers (same flow, with the Y prompt):

| Platform | Run |
|----------|-----|
| **Windows** | Double-click [`Setup_Agent_Environment.bat`](./Setup_Agent_Environment.bat) |
| **macOS** | Double-click [`Setup_Agent_Environment.command`](./Setup_Agent_Environment.command) or `./Setup_Agent_Environment.sh` |
| **Linux** | `bash ./Setup_Agent_Environment.sh` |

Administrator (Windows UAC) or `sudo` (macOS/Linux) prompts appear when needed — approve them in the terminal/dialog. Details: [`Web_Toolkit/Setup_agent_environment/README.md`](./Web_Toolkit/Setup_agent_environment/README.md).

**Python is exclusively managed by [pyenv-native](https://github.com/imyourboyroy/pyenv-native)** — the `pyenv` CLI plus **pyenv-gui** (launch with `pyenv gui`). Core setup installs both. Do **not** install system, winget, or Homebrew Python for toolkit work.

---

## What’s in this repo

| Path | Purpose |
|------|---------|
| [`skills/`](./docs/agent-skills/SKILL_PACK.md) | Versioned core and optional Agent Skills |
| [`Web_Toolkit/`](./Web_Toolkit/README.md) | CLI tools (readiness, deploy, discovery, Cloudflare, etc.) |
| [`site-starter/`](./site-starter/README.md) | Templates to bootstrap a new client site |
| [`START_HERE.md`](./START_HERE.md) | Short guide for AI agents (zero research) |

---

## Common tasks (for you or your agent)

| Goal | What to ask or run |
|------|-------------------|
| Check a site before deploy | `site-readiness` on the client project |
| New site from scratch | `site-starter` skill + copy templates |
| Accessibility evidence (sites) | Bundled `Web_Toolkit/wcag_auditor` only (no `AI/` resolution) |
| Public Instagram gallery | `instagram-clone` skill (`INSTAGRAM_USERNAME` in `.env`) |
| Compare toolkit + skills | `toolkit-update` or `node scripts/update-toolkit.mjs` |
| Prepare an SVG candidate | Optional `vectorize-pipeline` skill |
| Verify discovery layer | `discovery-doctor` on `dist/` or live URL |

Full CLI list: [`Web_Toolkit/README.md`](./Web_Toolkit/README.md) or the `portable-web-toolkit` skill.

---

## Configuration

| What | Where |
|------|-------|
| API keys and secrets | **Client project** root `.env` (never commit) |
| Domains, worker names, deploy commands | `*.site-profile.json` in the client project |
| Brand colors, voice, logos | Client `BRAND_GUIDE.md` |
| Session notes and project memory | Client project `MEMORY.md` (not in this toolkit repo) |

---

## Documentation

| Doc | For |
|-----|-----|
| [`START_HERE.md`](./START_HERE.md) | AI agents |
| [`docs/agent-skills/CROSS_PLATFORM.md`](./docs/agent-skills/CROSS_PLATFORM.md) | Windows / macOS / Linux notes |
| [`Web_Toolkit/OPERATIONS.md`](./Web_Toolkit/OPERATIONS.md) | Build and deploy sequence |
| [`docs/agent-skills/`](./docs/agent-skills/README.md) | Per-agent skill install notes |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Validation and release requirements |
| [`SECURITY.md`](./SECURITY.md) | Private vulnerability reporting |

## Requirements

See the **version table at the top** (synced from `VERSION`, `.node-version`, and site-starter). Refresh with:

```bash
node ./scripts/sync-readme-versions.mjs
```

For repository changes, run the complete portable validation gate:

```bash
npm run validate
```

## Related project

For provider-neutral coding-agent instructions, project-memory conventions,
skill lifecycle safeguards, and cross-client continuity, see
[Agent Continuity Stack](https://github.com/ImYourBoyRoy/agent-continuity-stack).
The projects are independent and complementary; Agent Continuity Stack is not
required to use Portable Web Toolkit.

---

## Author

**Roy Dawson IV** · [@imyourboyroy](https://github.com/imyourboyroy)
