# Portable Web Toolkit

<!-- VERSIONS:BEGIN -->
**Version:** `0.2.6` · source: [`VERSION`](./VERSION) · packages: `0.2.6` / `0.2.6`

| Pin | Value | Source |
|-----|-------|--------|
| Toolkit release | `0.2.6` | [`VERSION`](./VERSION) |
| Node engines | `>=26` | `package.json` |
| Node pin | `26.5.0` | [`.node-version`](./.node-version) |
| Astro (site-starter) | `^7.1.1` → 7.1.1 | [`site-starter/workers.package.json`](./site-starter/workers.package.json) |
| @astrojs/cloudflare | `^14.1.3` | site-starter |
| Wrangler | `^4.112.0` | site-starter |
<!-- VERSIONS:END -->

[GitHub](https://github.com/imyourboyroy/Portable_Web_toolkit) · [MIT License](./LICENSE)

A toolkit for building and shipping **Astro + Cloudflare** websites with help from AI coding agents (Cursor, Claude, Copilot, and others).

You get ready-made **agent skills**, **command-line tools** for build/deploy/discovery, and **starter templates** for new sites. Your actual website lives in its own project folder — not in this repo.

> Version table above is generated from repo truth — refresh with `node ./scripts/sync-readme-versions.mjs`.

---

## Get started (use your AI agent)

Give your coding agent a selected client and scope:

```text
Inspect the Portable Web Toolkit skill manifest from its GitHub repository.
Compare the selected skills with this client's installed copies and report
conflicts. Install only the explicitly selected client, scope, and skills;
preserve displaced content outside skill-discovery directories.
```

The agent follows [`docs/agent-skills/INSTALL_PROTOCOL.md`](./docs/agent-skills/INSTALL_PROTOCOL.md)
with ordinary Git and filesystem tools. Optional scripts report status only.

### Working on a site

Tell your agent something like:

```text
Use the portable-web-toolkit skills on this project. Run site-readiness and fix anything it reports before we build or deploy.
```

Each client site is a **separate folder** with its own `package.json`, `.env`, and site profile. Link this toolkit’s `Web_Toolkit/` into that folder (your agent can do this with `scripts/link-web-toolkit.mjs`).

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

## Requirements

See the **version table at the top** (synced from `VERSION`, `.node-version`, and site-starter). Refresh with:

```bash
node ./scripts/sync-readme-versions.mjs
```

---

## Author

**Roy Dawson IV** · [@imyourboyroy](https://github.com/imyourboyroy)

Client names, domains, and branding belong in each project’s site profile — not in this repository.
